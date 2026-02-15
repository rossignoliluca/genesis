/**
 * Genesis v10.5 - Provider Stream Adapters
 *
 * Unified streaming interface for all LLM providers.
 * Each adapter normalizes provider-specific streaming into StreamEvents.
 */

import {
  StreamEvent,
  TokenEvent,
  ToolStartEvent,
  ThinkingStartEvent,
  ThinkingTokenEvent,
  ThinkingEndEvent,
  MetadataEvent,
  ErrorEvent,
  DoneEvent,
  StreamMetrics,
} from './types.js';

// ============================================================================
// Internal Types
// ============================================================================

export type ProviderName = 'openai' | 'anthropic' | 'ollama' | 'groq';

interface AdapterStreamOptions {
  model: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
  tools?: Array<{ name: string; description: string; inputSchema?: any }>;
  signal?: AbortSignal;
  enableThinking?: boolean;
  thinkingBudget?: number; // v18.3: Dynamic thinking budget (default 2048)
  baseUrl?: string;
}

interface InternalAdapter {
  name: ProviderName;
  supports: { thinking: boolean; toolUse: boolean; streaming: boolean };
  stream(
    messages: Array<{ role: string; content: string }>,
    options: AdapterStreamOptions
  ): AsyncGenerator<StreamEvent>;
}

// ============================================================================
// Event Helpers
// ============================================================================

let eventCounter = 0;

function eventId(): string {
  return `evt_${Date.now()}_${(++eventCounter).toString(36)}`;
}

function now(): string {
  return new Date().toISOString();
}

function createToken(content: string): TokenEvent {
  return { id: eventId(), timestamp: now(), type: 'token', content };
}

function createToolStart(toolCallId: string, name: string, args: Record<string, unknown>): ToolStartEvent {
  return { id: eventId(), timestamp: now(), type: 'tool_start', toolCallId, name, args };
}

function createThinkingStart(label?: string): ThinkingStartEvent {
  return { id: eventId(), timestamp: now(), type: 'thinking_start', label };
}

function createThinkingToken(content: string): ThinkingTokenEvent {
  return { id: eventId(), timestamp: now(), type: 'thinking_token', content };
}

function createThinkingEnd(tokenCount?: number): ThinkingEndEvent {
  return { id: eventId(), timestamp: now(), type: 'thinking_end', tokenCount };
}

function createMetadata(provider: string, model: string, usage?: { inputTokens: number; outputTokens: number }): MetadataEvent {
  return {
    id: eventId(),
    timestamp: now(),
    type: 'metadata',
    provider,
    model,
    usage: usage ? { ...usage, totalTokens: usage.inputTokens + usage.outputTokens } : undefined,
  };
}

function createError(message: string, retryable: boolean = false, code: string = 'PROVIDER_ERROR'): ErrorEvent {
  return { id: eventId(), timestamp: now(), type: 'error', code, message, retryable };
}

function createDone(content: string, metrics: StreamMetrics): DoneEvent {
  return { id: eventId(), timestamp: now(), type: 'done', content, reason: 'stop', metrics };
}

function emptyMetrics(model: string): StreamMetrics {
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
    state: 'streaming',
    retries: 0,
  };
}

// ============================================================================
// OpenAI Adapter (GPT-4o, GPT-4o-mini)
// ============================================================================

class OpenAIStreamAdapter implements InternalAdapter {
  name: ProviderName = 'openai';
  supports = { thinking: false, toolUse: true, streaming: true };

  async *stream(
    messages: Array<{ role: string; content: string }>,
    options: AdapterStreamOptions
  ): AsyncGenerator<StreamEvent> {
    const body: any = {
      model: options.model,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.7,
    };
    if (options.maxTokens) body.max_tokens = options.maxTokens;
    if (options.tools?.length) {
      body.tools = options.tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.inputSchema }
      }));
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      yield createError(`OpenAI API error: ${response.status} ${response.statusText}`, response.status === 429);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield createError('No response body');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let contentBuffer = '';
    let totalTokens = 0;
    const startTime = Date.now();
    const toolCallBuffers: Map<number, { name: string; args: string }> = new Map();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            // Emit pending tool calls
            for (const [idx, tc] of toolCallBuffers) {
              yield createToolStart(`openai-tc-${idx}`, tc.name, safeParseJSON(tc.args));
            }

            const metrics = emptyMetrics(options.model);
            metrics.totalTokens = totalTokens;
            metrics.outputTokens = totalTokens;
            metrics.elapsed = Date.now() - startTime;
            metrics.tokensPerSecond = metrics.elapsed > 0 ? totalTokens / (metrics.elapsed / 1000) : 0;
            metrics.state = 'completed';
            metrics.toolCallCount = toolCallBuffers.size;

            yield createMetadata('openai', options.model, { inputTokens: 0, outputTokens: totalTokens });
            yield createDone(contentBuffer, metrics);
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallBuffers.has(idx)) {
                  toolCallBuffers.set(idx, { name: '', args: '' });
                }
                const buf = toolCallBuffers.get(idx)!;
                if (tc.function?.name) buf.name = tc.function.name;
                if (tc.function?.arguments) buf.args += tc.function.arguments;
              }
              continue;
            }

            if (delta.content) {
              totalTokens++;
              contentBuffer += delta.content;
              yield createToken(delta.content);
            }
          } catch (err) {

            console.error('[provider-adapter] operation failed:', err);
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const metrics = emptyMetrics(options.model);
    metrics.totalTokens = totalTokens;
    metrics.elapsed = Date.now() - startTime;
    metrics.state = 'completed';
    yield createDone(contentBuffer, metrics);
  }
}

// ============================================================================
// Anthropic Adapter (Claude Sonnet, Haiku, Opus)
// ============================================================================

class AnthropicStreamAdapter implements InternalAdapter {
  name: ProviderName = 'anthropic';
  supports = { thinking: true, toolUse: true, streaming: true };

  async *stream(
    messages: Array<{ role: string; content: string }>,
    options: AdapterStreamOptions
  ): AsyncGenerator<StreamEvent> {
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const body: any = {
      model: options.model,
      max_tokens: options.maxTokens || 4096,
      stream: true,
      messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
    };
    if (systemMsg) body.system = systemMsg.content;
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.tools?.length) {
      body.tools = options.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema || { type: 'object', properties: {} },
      }));
    }
    if (options.enableThinking) {
      body.thinking = { type: 'enabled', budget_tokens: options.thinkingBudget || 2048 };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': options.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      yield createError(`Anthropic API error: ${response.status}`, response.status === 429);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield createError('No response body');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let contentBuffer = '';
    let totalTokens = 0;
    let thinkingTokens = 0;
    let inThinking = false;
    let currentToolName = '';
    let currentToolId = '';
    let toolInputBuffer = '';
    let toolCallCount = 0;
    const startTime = Date.now();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const event = JSON.parse(data);

            switch (event.type) {
              case 'content_block_start': {
                const block = event.content_block;
                if (block?.type === 'thinking') {
                  inThinking = true;
                  yield createThinkingStart();
                } else if (block?.type === 'tool_use') {
                  currentToolName = block.name || '';
                  currentToolId = block.id || `tool-${Date.now()}`;
                  toolInputBuffer = '';
                }
                break;
              }

              case 'content_block_delta': {
                const delta = event.delta;
                if (delta?.type === 'thinking_delta') {
                  thinkingTokens++;
                  yield createThinkingToken(delta.thinking || '');
                } else if (delta?.type === 'text_delta') {
                  totalTokens++;
                  contentBuffer += delta.text || '';
                  yield createToken(delta.text || '');
                } else if (delta?.type === 'input_json_delta') {
                  toolInputBuffer += delta.partial_json || '';
                }
                break;
              }

              case 'content_block_stop': {
                if (inThinking) {
                  inThinking = false;
                  yield createThinkingEnd(thinkingTokens);
                } else if (currentToolName) {
                  toolCallCount++;
                  yield createToolStart(currentToolId, currentToolName, safeParseJSON(toolInputBuffer));
                  currentToolName = '';
                  toolInputBuffer = '';
                }
                break;
              }

              case 'message_delta': {
                if (event.usage) {
                  yield createMetadata('anthropic', options.model, {
                    inputTokens: event.usage.input_tokens || 0,
                    outputTokens: event.usage.output_tokens || totalTokens,
                  });
                }
                break;
              }

              case 'message_stop': {
                const metrics = emptyMetrics(options.model);
                metrics.totalTokens = totalTokens;
                metrics.thinkingTokens = thinkingTokens;
                metrics.elapsed = Date.now() - startTime;
                metrics.tokensPerSecond = metrics.elapsed > 0 ? totalTokens / (metrics.elapsed / 1000) : 0;
                metrics.state = 'completed';
                metrics.toolCallCount = toolCallCount;

                yield createDone(
                  contentBuffer,
                  metrics
                );
                return;
              }

              case 'error': {
                yield createError(event.error?.message || 'Unknown Anthropic error', true);
                return;
              }
            }
          } catch (err) {

            console.error('[provider-adapter] operation failed:', err);
            // Skip malformed events
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const metrics = emptyMetrics(options.model);
    metrics.totalTokens = totalTokens;
    metrics.elapsed = Date.now() - startTime;
    metrics.state = 'completed';
    yield createDone(contentBuffer, metrics);
  }
}

// ============================================================================
// Ollama Adapter (Local models)
// ============================================================================

class OllamaStreamAdapter implements InternalAdapter {
  name: ProviderName = 'ollama';
  supports = { thinking: false, toolUse: false, streaming: true };

  async *stream(
    messages: Array<{ role: string; content: string }>,
    options: AdapterStreamOptions
  ): AsyncGenerator<StreamEvent> {
    const baseUrl = options.baseUrl || process.env.OLLAMA_HOST || 'http://localhost:11434';

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model,
        messages,
        stream: true,
        options: { temperature: options.temperature ?? 0.7 },
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      yield createError(`Ollama error: ${response.status}`, true);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield createError('No response body');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let contentBuffer = '';
    let totalTokens = 0;
    const startTime = Date.now();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.done) {
              yield createMetadata('ollama', options.model, {
                inputTokens: parsed.prompt_eval_count || 0,
                outputTokens: parsed.eval_count || totalTokens,
              });

              const metrics = emptyMetrics(options.model);
              metrics.totalTokens = totalTokens;
              metrics.inputTokens = parsed.prompt_eval_count || 0;
              metrics.outputTokens = parsed.eval_count || totalTokens;
              metrics.elapsed = Date.now() - startTime;
              metrics.tokensPerSecond = metrics.elapsed > 0 ? totalTokens / (metrics.elapsed / 1000) : 0;
              metrics.state = 'completed';

              yield createDone(contentBuffer, metrics);
              return;
            }
            if (parsed.message?.content) {
              totalTokens++;
              contentBuffer += parsed.message.content;
              yield createToken(parsed.message.content);
            }
          } catch (err) {

            console.error('[provider-adapter] operation failed:', err);
            // Skip malformed lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const metrics = emptyMetrics(options.model);
    metrics.totalTokens = totalTokens;
    metrics.elapsed = Date.now() - startTime;
    metrics.state = 'completed';
    yield createDone(contentBuffer, metrics);
  }
}

// ============================================================================
// Groq Adapter (Fast inference)
// ============================================================================

class GroqStreamAdapter implements InternalAdapter {
  name: ProviderName = 'groq';
  supports = { thinking: false, toolUse: true, streaming: true };

  async *stream(
    messages: Array<{ role: string; content: string }>,
    options: AdapterStreamOptions
  ): AsyncGenerator<StreamEvent> {
    const body: any = {
      model: options.model,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.7,
    };
    if (options.maxTokens) body.max_tokens = options.maxTokens;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      yield createError(`Groq API error: ${response.status}`, response.status === 429);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield createError('No response body');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let contentBuffer = '';
    let totalTokens = 0;
    const startTime = Date.now();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            const metrics = emptyMetrics(options.model);
            metrics.totalTokens = totalTokens;
            metrics.outputTokens = totalTokens;
            metrics.elapsed = Date.now() - startTime;
            metrics.tokensPerSecond = metrics.elapsed > 0 ? totalTokens / (metrics.elapsed / 1000) : 0;
            metrics.state = 'completed';

            yield createMetadata('groq', options.model, { inputTokens: 0, outputTokens: totalTokens });
            yield createDone(contentBuffer, metrics);
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              totalTokens++;
              contentBuffer += content;
              yield createToken(content);
            }
          } catch (err) {
            console.error('[provider-adapter] Groq delta parse failed:', err);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const metrics = emptyMetrics(options.model);
    metrics.totalTokens = totalTokens;
    metrics.elapsed = Date.now() - startTime;
    metrics.state = 'completed';
    yield createDone(contentBuffer, metrics);
  }
}

// ============================================================================
// Adapter Registry
// ============================================================================

const adapters: Record<ProviderName, InternalAdapter> = {
  openai: new OpenAIStreamAdapter(),
  anthropic: new AnthropicStreamAdapter(),
  ollama: new OllamaStreamAdapter(),
  groq: new GroqStreamAdapter(),
};

export function getStreamAdapter(provider: ProviderName): InternalAdapter {
  const adapter = adapters[provider];
  if (!adapter) throw new Error(`Unknown provider: ${provider}`);
  return adapter;
}

export function listAdapters(): InternalAdapter[] {
  return Object.values(adapters);
}

export type { InternalAdapter, AdapterStreamOptions };

// ============================================================================
// Helpers
// ============================================================================

function safeParseJSON(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str);
  } catch (err) {

    console.error('[provider-adapter] operation failed:', err);
    return {};
  }
}
