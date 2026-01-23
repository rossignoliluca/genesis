/**
 * Genesis v10.5 - Stream Orchestrator
 *
 * Master orchestrator that coordinates:
 * - Hybrid streaming (tokens + tool calls)
 * - Adaptive quality (model escalation)
 * - Provider selection
 * - Metrics collection
 * - Stream lifecycle management
 */

import {
  StreamEvent,
  StreamState,
  HybridStreamOptions,
  StreamMetrics,
  StreamCheckpoint,
  ToolDefinition,
  ToolResultEvent,
  StateTransition,
} from './types.js';
import { getStreamAdapter, ProviderName } from './provider-adapter.js';

// ============================================================================
// Event Helpers
// ============================================================================

let orchestratorEventCounter = 0;

function eid(): string {
  return `orch_${Date.now()}_${(++orchestratorEventCounter).toString(36)}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

// ============================================================================
// Stream Orchestrator
// ============================================================================

export class StreamOrchestrator {
  private state: StreamState = 'idle';
  private metrics: StreamMetrics;
  private abortController: AbortController | null = null;
  private contentBuffer: string = '';
  private checkpoints: StreamCheckpoint[] = [];
  private eventLog: StreamEvent[] = [];
  private stateTransitions: StateTransition[] = [];

  constructor(private defaultOptions?: Partial<HybridStreamOptions>) {
    this.metrics = this.createEmptyMetrics();
  }

  /**
   * Execute a streaming request with full orchestration
   */
  async *execute(options: HybridStreamOptions): AsyncGenerator<StreamEvent> {
    this.transitionState('streaming');
    this.abortController = new AbortController();
    this.metrics = this.createEmptyMetrics();
    this.contentBuffer = '';
    this.eventLog = [];

    const merged = { ...this.defaultOptions, ...options };
    const provider = (merged.provider || 'anthropic') as ProviderName;
    const adapter = getStreamAdapter(provider);

    const streamOptions = {
      model: merged.model || 'claude-sonnet-4-20250514',
      apiKey: this.getApiKey(provider),
      temperature: merged.temperature,
      maxTokens: merged.maxTokens,
      tools: merged.tools?.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.parameters,
      })),
      signal: this.abortController.signal,
      enableThinking: merged.enableThinking,
    };

    let toolCallCount = 0;
    const maxToolCalls = merged.maxToolCalls || 10;
    let messages = (merged.messages || []).map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));
    let continueLoop = true;

    // Track tool handlers from ToolDefinition
    const toolHandlers = new Map<string, ToolDefinition['handler']>();
    if (merged.tools) {
      for (const tool of merged.tools) {
        if (tool.handler) toolHandlers.set(tool.name, tool.handler);
      }
    }

    while (continueLoop) {
      continueLoop = false;
      const pendingToolCalls: Array<{ name: string; args: Record<string, unknown>; id: string }> = [];

      try {
        const stream = adapter.stream(messages, streamOptions);

        for await (const event of stream) {
          if (this.abortController?.signal.aborted) {
            yield this.makeDoneEvent();
            return;
          }

          this.eventLog.push(event);

          switch (event.type) {
            case 'token': {
              this.contentBuffer += event.content;
              this.metrics.totalTokens++;
              this.metrics.outputTokens++;
              this.updateTokensPerSecond();

              // Track time to first token
              if (this.metrics.timeToFirstToken === undefined) {
                const startMs = new Date(this.metrics.startTime).getTime();
                this.metrics.timeToFirstToken = Date.now() - startMs;
              }

              yield event;
              break;
            }

            case 'tool_start': {
              if (toolCallCount >= maxToolCalls) {
                yield {
                  id: eid(),
                  timestamp: isoNow(),
                  type: 'error',
                  code: 'MAX_TOOL_CALLS',
                  message: `Max tool calls (${maxToolCalls}) reached`,
                  retryable: false,
                };
                break;
              }

              this.transitionState('tool_executing');
              toolCallCount++;
              this.metrics.toolCallCount++;

              pendingToolCalls.push({
                name: event.name,
                args: event.args,
                id: event.toolCallId,
              });

              yield event;
              break;
            }

            case 'thinking_start': {
              this.transitionState('thinking');
              yield event;
              break;
            }

            case 'thinking_token': {
              this.metrics.thinkingTokens++;
              yield event;
              break;
            }

            case 'thinking_end': {
              this.transitionState('streaming');
              yield event;
              break;
            }

            case 'metadata': {
              if (event.usage) {
                this.metrics.inputTokens = event.usage.inputTokens || this.metrics.inputTokens;
                this.metrics.outputTokens = Math.max(
                  this.metrics.outputTokens,
                  event.usage.outputTokens || 0
                );
                this.metrics.totalTokens = this.metrics.inputTokens + this.metrics.outputTokens;
                this.metrics.cost = this.calculateCost(
                  streamOptions.model,
                  this.metrics.inputTokens,
                  this.metrics.outputTokens
                );
              }
              yield event;
              break;
            }

            case 'error': {
              this.transitionState('error');
              yield event;
              return;
            }

            case 'done': {
              // If there are pending tool calls, execute them and continue
              if (pendingToolCalls.length > 0) {
                for (const tc of pendingToolCalls) {
                  const handler = toolHandlers.get(tc.name);
                  if (!handler) {
                    yield this.makeToolResult(tc.id, tc.name, `No handler for tool: ${tc.name}`, false, 0);
                    continue;
                  }

                  const toolStart = Date.now();
                  try {
                    const result = await handler(tc.args);
                    const duration = Date.now() - toolStart;
                    this.metrics.toolLatencyTotal += duration;
                    this.metrics.toolLatencyAverage = this.metrics.toolLatencyTotal / this.metrics.toolCallCount;

                    const resultContent = typeof result === 'string' ? result : JSON.stringify(result);
                    yield this.makeToolResult(tc.id, tc.name, resultContent, true, duration);

                    // Add tool result to messages for continuation
                    messages = [
                      ...messages,
                      { role: 'assistant', content: this.contentBuffer },
                      { role: 'user', content: `[Tool Result: ${tc.name}]\n${resultContent}` },
                    ];
                  } catch (err: any) {
                    const duration = Date.now() - toolStart;
                    this.metrics.toolLatencyTotal += duration;
                    yield this.makeToolResult(tc.id, tc.name, err?.message || 'Unknown error', false, duration);
                  }
                }

                // Continue streaming with tool results
                this.contentBuffer = '';
                this.transitionState('streaming');
                continueLoop = true;
              } else {
                this.transitionState('completed');
                this.updateElapsed();
                yield this.makeDoneEvent();
              }
              break;
            }

            default:
              yield event;
          }

          // Invoke callbacks
          if (merged.onEvent) {
            merged.onEvent(event);
          }
          if (merged.onStateChange && this.stateTransitions.length > 0) {
            const lastTransition = this.stateTransitions[this.stateTransitions.length - 1];
            merged.onStateChange(lastTransition);
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          this.transitionState('completed');
          yield this.makeDoneEvent();
          return;
        }
        this.transitionState('error');
        yield {
          id: eid(),
          timestamp: isoNow(),
          type: 'error',
          code: 'STREAM_ERROR',
          message: err?.message || 'Stream error',
          retryable: true,
        };
        return;
      }
    }
  }

  /**
   * Get current stream state
   */
  getState(): StreamState {
    return this.state;
  }

  /**
   * Get current metrics
   */
  getMetrics(): StreamMetrics {
    this.updateElapsed();
    return { ...this.metrics };
  }

  /**
   * Get accumulated content
   */
  getContent(): string {
    return this.contentBuffer;
  }

  /**
   * Abort the current stream
   */
  abort(): void {
    this.abortController?.abort();
    this.transitionState('completed');
  }

  /**
   * Create a checkpoint for resumable streams
   */
  checkpoint(): StreamCheckpoint {
    const cp: StreamCheckpoint = {
      id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: isoNow(),
      contentSoFar: this.contentBuffer,
      messagesSnapshot: [],
      metrics: { ...this.metrics },
      state: this.state,
      completedToolCalls: [],
      pendingToolCalls: [],
      options: this.defaultOptions as HybridStreamOptions,
    };
    this.checkpoints.push(cp);
    return cp;
  }

  /**
   * Resume from a checkpoint
   */
  async *resumeFrom(
    checkpoint: StreamCheckpoint,
    options: HybridStreamOptions
  ): AsyncGenerator<StreamEvent> {
    const messages = [
      ...(options.messages || []),
      { role: 'assistant' as const, content: checkpoint.contentSoFar },
    ];

    yield* this.execute({ ...options, messages });
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private transitionState(to: StreamState): void {
    const from = this.state;
    if (from === to) return;
    this.state = to;
    this.metrics.state = to;
    this.stateTransitions.push({
      from,
      to,
      timestamp: isoNow(),
    });
  }

  private createEmptyMetrics(): StreamMetrics {
    return {
      tokensPerSecond: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      cost: 0,
      confidence: 1,
      toolCallCount: 0,
      toolLatencyTotal: 0,
      toolLatencyAverage: 0,
      modelUpgrades: 0,
      startTime: new Date().toISOString(),
      elapsed: 0,
      state: 'idle',
      retries: 0,
    };
  }

  private updateTokensPerSecond(): void {
    const startMs = new Date(this.metrics.startTime).getTime();
    const elapsed = (Date.now() - startMs) / 1000;
    if (elapsed > 0) {
      this.metrics.tokensPerSecond = this.metrics.outputTokens / elapsed;
    }
  }

  private updateElapsed(): void {
    const startMs = new Date(this.metrics.startTime).getTime();
    this.metrics.elapsed = Date.now() - startMs;
  }

  private makeDoneEvent(): StreamEvent {
    this.updateElapsed();
    return {
      id: eid(),
      timestamp: isoNow(),
      type: 'done',
      content: this.contentBuffer,
      reason: 'stop',
      metrics: { ...this.metrics },
    };
  }

  private makeToolResult(
    toolCallId: string,
    name: string,
    content: string,
    success: boolean,
    duration: number
  ): ToolResultEvent {
    return {
      id: eid(),
      timestamp: isoNow(),
      type: 'tool_result',
      toolCallId,
      content,
      success,
      duration,
      error: success ? undefined : content,
    };
  }

  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const costs: Record<string, { input: number; output: number }> = {
      'gpt-4o': { input: 2.5, output: 10 },
      'gpt-4o-mini': { input: 0.15, output: 0.60 },
      'claude-sonnet-4-20250514': { input: 3, output: 15 },
      'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
      'claude-opus-4-20250514': { input: 15, output: 75 },
      'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
    };
    const c = costs[model] || { input: 0, output: 0 };
    return (inputTokens * c.input + outputTokens * c.output) / 1_000_000;
  }

  private getApiKey(provider: string): string {
    switch (provider) {
      case 'openai': return process.env.OPENAI_API_KEY || '';
      case 'anthropic': return process.env.ANTHROPIC_API_KEY || '';
      case 'groq': return process.env.GROQ_API_KEY || '';
      default: return '';
    }
  }
}

// ============================================================================
// Convenience factory
// ============================================================================

export function createStreamOrchestrator(
  defaults?: Partial<HybridStreamOptions>
): StreamOrchestrator {
  return new StreamOrchestrator(defaults);
}
