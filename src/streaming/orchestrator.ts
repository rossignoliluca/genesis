/**
 * Genesis v10.6 - Stream Orchestrator (Racing Edition)
 *
 * Master orchestrator that coordinates:
 * - Model Racing (fire multiple providers, fastest wins)
 * - Parallel MCP tool execution via DAG
 * - Speculative prefetch (predict & pre-fire tools)
 * - Adaptive latency learning
 * - Hybrid streaming (tokens + tool calls)
 * - Provider selection with confidence-based routing
 * - Metrics collection with racing stats
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
import { ModelRacer, RacingStrategy, RaceResult } from './model-racer.js';
import { MCPBridge, MCPToolCall, MCPToolResult, MCPServerName } from './mcp-bridge.js';
import { getLatencyTracker, LatencyRecord } from './latency-tracker.js';
import { emitSystemError } from '../bus/index.js';

// ============================================================================
// Integration Hooks (called by integration layer)
// ============================================================================

export type StreamCompletionHook = (metrics: StreamMetrics, provider: string, model: string) => void;

const completionHooks: StreamCompletionHook[] = [];

/**
 * Register a hook that fires when any stream completes.
 * Used by the integration layer to forward costs, update observations, etc.
 */
export function onStreamCompletion(hook: StreamCompletionHook): () => void {
  completionHooks.push(hook);
  return () => {
    const idx = completionHooks.indexOf(hook);
    if (idx >= 0) completionHooks.splice(idx, 1);
  };
}

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
// Stream Orchestrator (v10.6 - Racing Edition)
// ============================================================================

export class StreamOrchestrator {
  private state: StreamState = 'idle';
  private metrics: StreamMetrics;
  private abortController: AbortController | null = null;
  private contentBuffer: string = '';
  private checkpoints: StreamCheckpoint[] = [];
  private eventLog: StreamEvent[] = [];
  private stateTransitions: StateTransition[] = [];

  // v10.6: Racing & Optimization
  private racer: ModelRacer;
  private mcpBridge: MCPBridge;
  private prefetchPromise: Promise<string[]> | null = null;

  constructor(private defaultOptions?: Partial<HybridStreamOptions>) {
    this.metrics = this.createEmptyMetrics();
    this.racer = new ModelRacer({
      strategy: (defaultOptions?.racingStrategy as RacingStrategy) || 'hedged',
      maxRaceCost: defaultOptions?.maxRaceCost || 0.01,
    });
    this.mcpBridge = new MCPBridge({
      enablePrefetch: defaultOptions?.enablePrefetch !== false,
      enableCache: true,
    });
  }

  /**
   * Trigger speculative prefetch for a user query.
   * Call this BEFORE execute() to hide MCP latency behind LLM TTFT.
   */
  triggerPrefetch(userQuery: string): void {
    this.prefetchPromise = this.mcpBridge.prefetch(userQuery);
  }

  /**
   * Execute a streaming request with full orchestration.
   * Uses ModelRacer when racing enabled, parallel tools via MCPBridge.
   */
  async *execute(options: HybridStreamOptions): AsyncGenerator<StreamEvent> {
    this.transitionState('streaming');
    this.abortController = new AbortController();
    this.metrics = this.createEmptyMetrics();
    this.contentBuffer = '';
    this.eventLog = [];

    const merged = { ...this.defaultOptions, ...options };
    const useRacing = merged.enableRacing !== false && !merged.forceProvider;
    const useParallelTools = merged.enableParallelTools !== false;

    // Wait for any pending prefetch to resolve (non-blocking - just sets cache)
    if (this.prefetchPromise) {
      const prefetched = await this.prefetchPromise;
      if (prefetched.length > 0) {
        this.metrics.prefetchHits = prefetched.length;
        yield {
          id: eid(),
          timestamp: isoNow(),
          type: 'metadata',
          usage: { inputTokens: 0, outputTokens: 0 },
          model: '',
          provider: '',
          prefetched,
        } as any;
      }
      this.prefetchPromise = null;
    }

    // Track tool handlers
    const toolHandlers = new Map<string, ToolDefinition['handler']>();
    if (merged.tools) {
      for (const tool of merged.tools) {
        if (tool.handler) toolHandlers.set(tool.name, tool.handler);
      }
    }

    let toolCallCount = 0;
    const maxToolCalls = merged.maxToolCalls || 10;
    let messages = (merged.messages || []).map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));
    let continueLoop = true;

    while (continueLoop) {
      continueLoop = false;
      const pendingToolCalls: Array<{ name: string; args: Record<string, unknown>; id: string }> = [];

      try {
        // === Choose streaming path: Racing vs Direct ===
        const stream = useRacing
          ? this.racer.race({
              messages: messages as any,
              tools: merged.tools,
              enableThinking: merged.enableThinking,
              thinkingBudget: merged.thinkingBudget, // v18.3: Dynamic thinking budget
              maxTokens: merged.maxTokens,
              temperature: merged.temperature,
              forceProvider: merged.forceProvider,
              forceModel: merged.forceModel,
            })
          : this.streamDirect(merged, messages);

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
              const metaEvent = event as any;
              if (metaEvent.usage) {
                this.metrics.inputTokens = metaEvent.usage.inputTokens || this.metrics.inputTokens;
                this.metrics.outputTokens = Math.max(
                  this.metrics.outputTokens,
                  metaEvent.usage.outputTokens || 0
                );
                this.metrics.totalTokens = this.metrics.inputTokens + this.metrics.outputTokens;
                this.metrics.cost = this.calculateCost(
                  metaEvent.model || merged.model,
                  this.metrics.inputTokens,
                  this.metrics.outputTokens
                );
              }
              // Track racing winner from metadata
              if (metaEvent.racingWinner) {
                this.metrics.racingWinner = metaEvent.racingWinner;
                this.metrics.racingModel = metaEvent.racingModel;
                this.metrics.racingStrategy = metaEvent.racingStrategy;
                this.metrics.racingCandidates = metaEvent.racingCandidates;
                this.metrics.racingSaved = metaEvent.racingSaved;
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
              if (pendingToolCalls.length > 0) {
                // === Parallel Tool Execution via MCPBridge ===
                if (useParallelTools && pendingToolCalls.length > 1) {
                  yield* this.executeToolsParallel(pendingToolCalls, toolHandlers, messages);
                } else {
                  yield* this.executeToolsSequential(pendingToolCalls, toolHandlers, messages);
                }

                // Continue streaming with tool results
                this.contentBuffer = '';
                this.transitionState('streaming');
                continueLoop = true;
              } else {
                this.transitionState('completed');
                this.updateElapsed();

                // Record latency to tracker
                this.recordLatency(merged);

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
        emitSystemError('streaming', err, 'warning');
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
   * Get current metrics (includes racing stats)
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
   * Get race statistics
   */
  getRaceStats() {
    return this.racer.getStats();
  }

  /**
   * Get MCP bridge cache stats
   */
  getMCPStats() {
    return this.mcpBridge.getStats();
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
  // Private: Direct Streaming (no racing)
  // ============================================================================

  private async *streamDirect(
    merged: Partial<HybridStreamOptions>,
    messages: Array<{ role: string; content: string }>
  ): AsyncGenerator<StreamEvent> {
    const provider = (merged.forceProvider || merged.provider || 'anthropic') as ProviderName;
    const adapter = getStreamAdapter(provider);

    const streamOptions = {
      model: merged.forceModel || merged.model || 'claude-sonnet-4-20250514',
      apiKey: this.getApiKey(provider),
      temperature: merged.temperature,
      maxTokens: merged.maxTokens,
      tools: merged.tools?.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.parameters,
      })),
      signal: this.abortController?.signal,
      enableThinking: merged.enableThinking,
      thinkingBudget: merged.thinkingBudget, // v18.3: Dynamic thinking budget
    };

    yield* adapter.stream(messages, streamOptions);
  }

  // ============================================================================
  // Private: Parallel Tool Execution
  // ============================================================================

  /**
   * Execute multiple tool calls in parallel via MCPBridge.
   * Yields tool_result events as they complete.
   */
  private async *executeToolsParallel(
    pendingCalls: Array<{ name: string; args: Record<string, unknown>; id: string }>,
    toolHandlers: Map<string, ToolDefinition['handler']>,
    messages: Array<{ role: string; content: string }>
  ): AsyncGenerator<StreamEvent> {
    const sequentialStart = Date.now();

    // Execute all tools in parallel
    const results = await Promise.allSettled(
      pendingCalls.map(async (tc) => {
        const handler = toolHandlers.get(tc.name);
        if (!handler) {
          return { id: tc.id, name: tc.name, success: false, content: `No handler for tool: ${tc.name}`, duration: 0 };
        }
        const start = Date.now();
        try {
          const result = await handler(tc.args);
          return {
            id: tc.id,
            name: tc.name,
            success: true,
            content: typeof result === 'string' ? result : JSON.stringify(result),
            duration: Date.now() - start,
          };
        } catch (err: any) {
          return { id: tc.id, name: tc.name, success: false, content: err?.message || 'Error', duration: Date.now() - start };
        }
      })
    );

    const parallelDuration = Date.now() - sequentialStart;
    let totalSequentialEstimate = 0;

    // Yield results and update messages
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const r = result.value;
        totalSequentialEstimate += r.duration;
        this.metrics.toolLatencyTotal += r.duration;
        this.metrics.toolLatencyAverage = this.metrics.toolLatencyTotal / this.metrics.toolCallCount;

        yield this.makeToolResult(r.id, r.name, r.content, r.success, r.duration);

        messages.push(
          { role: 'assistant', content: this.contentBuffer },
          { role: 'user', content: `[Tool Result: ${r.name}]\n${r.content}` },
        );
      }
    }

    // Track parallel savings
    this.metrics.parallelToolSaved = Math.max(0, totalSequentialEstimate - parallelDuration);
  }

  /**
   * Execute tool calls sequentially (fallback)
   */
  private async *executeToolsSequential(
    pendingCalls: Array<{ name: string; args: Record<string, unknown>; id: string }>,
    toolHandlers: Map<string, ToolDefinition['handler']>,
    messages: Array<{ role: string; content: string }>
  ): AsyncGenerator<StreamEvent> {
    for (const tc of pendingCalls) {
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

        messages.push(
          { role: 'assistant', content: this.contentBuffer },
          { role: 'user', content: `[Tool Result: ${tc.name}]\n${resultContent}` },
        );
      } catch (err: any) {
        const duration = Date.now() - toolStart;
        this.metrics.toolLatencyTotal += duration;
        yield this.makeToolResult(tc.id, tc.name, err?.message || 'Unknown error', false, duration);
      }
    }
  }

  // ============================================================================
  // Private: Latency Recording
  // ============================================================================

  private recordLatency(options: Partial<HybridStreamOptions>): void {
    const provider = this.metrics.racingWinner || options.provider || 'anthropic';
    const model = this.metrics.racingModel || options.model || 'unknown';
    const tracker = getLatencyTracker();

    tracker.record({
      provider,
      model,
      ttft: this.metrics.timeToFirstToken || 0,
      tokensPerSec: this.metrics.tokensPerSecond,
      totalLatency: this.metrics.elapsed,
      timestamp: Date.now(),
      success: this.state !== 'error',
      tokenCount: this.metrics.outputTokens,
    });

    // Fire integration hooks (cost tracking, consciousness updates, etc.)
    for (const hook of completionHooks) {
      try {
        hook(this.metrics, provider, model);
      } catch { /* integration hooks must not break streaming */ }
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private transitionState(to: StreamState): void {
    const from = this.state;
    if (from === to) return;
    this.state = to;
    this.metrics.state = to;
    this.stateTransitions.push({ from, to, timestamp: isoNow() });
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
      'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },
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
