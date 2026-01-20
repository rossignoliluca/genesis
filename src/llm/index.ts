/**
 * Genesis 6.8 - LLM Bridge
 *
 * Direct API integration with LLM providers:
 * - Ollama (Mistral, Qwen, Phi) - LOCAL, FREE
 * - OpenAI (GPT-4o, o1) - CLOUD, PAID
 * - Anthropic (Claude) - CLOUD, PAID
 *
 * Hybrid routing: use local for 80% of tasks, cloud for complex ones.
 * No external dependencies - uses native fetch.
 */

// Re-export Phase 8: Hybrid Router
export * from './router.js';

// Re-export Phase 11: Advanced Multi-Provider Router (v7.21)
export * from './advanced-router.js';

// ============================================================================
// Types
// ============================================================================

export type LLMProvider = 'ollama' | 'openai' | 'anthropic';

// v7.18: Model tiers for cost optimization
export type ModelTier = 'fast' | 'balanced' | 'powerful';

export const MODEL_TIERS: Record<LLMProvider, Record<ModelTier, string>> = {
  openai: {
    fast: 'gpt-4o-mini',           // $0.15/$0.60 per 1M - 17x cheaper!
    balanced: 'gpt-4o',             // $2.5/$10 per 1M
    powerful: 'gpt-4o',             // Same as balanced for OpenAI
  },
  anthropic: {
    fast: 'claude-3-5-haiku-20241022',  // Cheaper, faster
    balanced: 'claude-sonnet-4-20250514',
    powerful: 'claude-sonnet-4-20250514',
  },
  ollama: {
    fast: 'qwen2.5-coder',          // Fast local
    balanced: 'qwen2.5-coder',
    powerful: 'mistral-small',      // Higher quality local
  },
};

// Ollama config
export const OLLAMA_CONFIG = {
  baseUrl: process.env.OLLAMA_HOST || 'http://localhost:11434',
  defaultModel: 'qwen2.5-coder',  // Best for code: 7x faster, concise output
  models: {
    'qwen2.5-coder': { name: 'qwen2.5-coder', description: 'Qwen 2.5 Coder - Code specialist (DEFAULT)' },
    'mistral': { name: 'mistral', description: 'Mistral 7B - Best for chat' },
    'mistral-small': { name: 'mistral-small', description: 'Mistral Small 24B - High quality' },
    'deepseek-coder': { name: 'deepseek-coder', description: 'DeepSeek Coder - Lightweight (776MB)' },
    'phi3.5': { name: 'phi3.5', description: 'Phi-3.5 - Fast, lightweight' },
  },
};

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: LLMProvider;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  latency: number;
}

// v7.20.1: Streaming support
export interface StreamChunk {
  type: 'token' | 'done' | 'error';
  token?: string;
  content?: string;  // Full content so far
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  model?: string;
  provider?: LLMProvider;
  latency?: number;
  error?: string;
}

// Cost per 1M tokens (USD)
export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10, output: 30 },
  // Anthropic
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
  'claude-opus-4-20250514': { input: 15, output: 75 },
  // Ollama (local, free)
  'qwen2.5-coder': { input: 0, output: 0 },
  'mistral': { input: 0, output: 0 },
  'mistral-small': { input: 0, output: 0 },
};

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model] || { input: 0, output: 0 };
  return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
}

// ============================================================================
// Default System Prompt
// ============================================================================

// ============================================================================
// Core Identity Prompt (minimal, static)
// ============================================================================

export const GENESIS_IDENTITY_PROMPT = `# Genesis System

You are Genesis - an autopoietic AI system with integrated reasoning, memory, and tool execution.

## Architecture
- 13 MCP Servers for external capabilities
- Brain Module with Neural Integration
- Active Inference for goal-directed behavior
- Knowledge graph memory with anticipatory retrieval
- Darwin-Gödel self-improvement mechanism

## Capabilities (verify with /mcp)
- Research: arxiv, semantic-scholar
- Web search: brave-search, gemini, exa, firecrawl
- Code management: github
- Memory: knowledge graph storage/recall
- Files: filesystem read/write
- Local execution: bash
- Image generation: stability-ai

## Guidelines
- Execute tools directly, don't just describe
- Match user's language (Italian if they use Italian)
- Be concise and action-oriented

## CRITICAL: Error Handling & Anti-Confabulation
- NEVER invent or fabricate tool outputs
- If a tool returns ERROR, report the EXACT error message to the user
- Do NOT guess what a failed tool "might have returned"
- If you cannot verify something, say "I couldn't verify this because [tool] failed"
- Acknowledge uncertainty honestly: "Let me verify..." or "The tool returned an error"
- When tools fail, your response MUST include the failure - never hide errors

## Tool Format
<invoke name="TOOL"><parameter name="PARAM">VALUE</parameter></invoke>`;

// ============================================================================
// Dynamic System Prompt Builder
// ============================================================================

/**
 * Tool definition with optional schema (matches MCPToolDefinition)
 */
export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema?: {
    type: 'object';
    properties?: Record<string, {
      type?: string;
      description?: string;
    }>;
    required?: string[];
  };
}

/**
 * Format a tool for the system prompt
 * With schema: `tool_name(param1: type, param2: type): description`
 * Without schema: `tool_name: description` or just `tool_name`
 */
function formatTool(tool: ToolDefinition | string): string {
  if (typeof tool === 'string') {
    return `- ${tool}`;
  }

  const { name, description, inputSchema } = tool;

  // Build parameter signature if schema available
  let signature = name;
  if (inputSchema?.properties) {
    const params = Object.entries(inputSchema.properties)
      .map(([key, prop]) => {
        const required = inputSchema.required?.includes(key) ? '' : '?';
        return `${key}${required}: ${prop.type || 'any'}`;
      })
      .join(', ');
    if (params) {
      signature = `${name}(${params})`;
    }
  }

  // Add description if available
  if (description) {
    // Truncate long descriptions
    const shortDesc = description.length > 60
      ? description.slice(0, 57) + '...'
      : description;
    return `- ${signature}: ${shortDesc}`;
  }

  return `- ${signature}`;
}

/**
 * Build complete system prompt with dynamically discovered tools
 *
 * @param mcpTools - MCP tools by server (with optional schemas)
 * @param localTools - Local tools (names or definitions)
 * @param includeSchemas - Whether to include parameter signatures (default: true)
 */
export async function buildSystemPrompt(
  mcpTools?: Record<string, (ToolDefinition | string)[]>,
  localTools?: (ToolDefinition | string)[],
  includeSchemas = true
): Promise<string> {
  const parts: string[] = [GENESIS_IDENTITY_PROMPT];

  // Add tool sections
  parts.push('\n## Available Tools\n');

  // MCP tools by category
  if (mcpTools && Object.keys(mcpTools).length > 0) {
    for (const [server, tools] of Object.entries(mcpTools)) {
      if (tools.length > 0) {
        parts.push(`\n### ${server.toUpperCase()}`);
        for (const tool of tools) {
          parts.push(includeSchemas ? formatTool(tool) : `- ${typeof tool === 'string' ? tool : tool.name}`);
        }
      }
    }
  }

  // Local tools
  if (localTools && localTools.length > 0) {
    parts.push('\n### LOCAL (execute on host)');
    for (const tool of localTools) {
      parts.push(includeSchemas ? formatTool(tool) : `- ${typeof tool === 'string' ? tool : tool.name}`);
    }
  }

  return parts.join('\n');
}

// Legacy export for backwards compatibility
export const GENESIS_SYSTEM_PROMPT = GENESIS_IDENTITY_PROMPT;

// ============================================================================
// LLM Bridge Class
// ============================================================================

// v7.18: Simple response cache for cost optimization
interface CacheEntry {
  response: string;
  timestamp: number;
  tokens: number;
}

const responseCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100;

function getCacheKey(prompt: string, model: string): string {
  // Simple hash for cache key
  const hash = prompt.slice(0, 100) + '|' + model;
  return hash;
}

function cleanCache(): void {
  const now = Date.now();
  for (const [key, entry] of responseCache) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      responseCache.delete(key);
    }
  }
  // Limit size
  if (responseCache.size > MAX_CACHE_SIZE) {
    const oldest = [...responseCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, responseCache.size - MAX_CACHE_SIZE);
    for (const [key] of oldest) {
      responseCache.delete(key);
    }
  }
}

export class LLMBridge {
  private config: LLMConfig;
  private conversationHistory: LLMMessage[] = [];
  private useCache: boolean = true; // v7.18: Enable caching by default

  constructor(config: Partial<LLMConfig> = {}) {
    // Detect provider first, then use it for model selection
    const provider = config.provider || this.detectProvider();
    this.config = {
      provider,
      model: config.model || this.defaultModel(provider),
      apiKey: config.apiKey || this.detectApiKey(provider),
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 4096,
    };
  }

  private detectProvider(): LLMProvider {
    // Priority: Ollama (free, local) > first available cloud provider
    if (process.env.OLLAMA_HOST || process.env.USE_OLLAMA === 'true') return 'ollama';

    // Cloud: use whichever key is available (no vendor preference)
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;

    // If both available, check GENESIS_CLOUD_PROVIDER preference
    if (hasOpenAI && hasAnthropic) {
      const preferred = process.env.GENESIS_CLOUD_PROVIDER?.toLowerCase();
      if (preferred === 'openai') return 'openai';
      if (preferred === 'anthropic') return 'anthropic';
      // Default: alphabetical order (no bias)
      return 'anthropic';
    }

    if (hasAnthropic) return 'anthropic';
    if (hasOpenAI) return 'openai';
    return 'ollama'; // Default to local (free)
  }

  private detectApiKey(provider?: LLMProvider): string {
    const p = provider || this.config?.provider || this.detectProvider();
    if (p === 'ollama') return 'not-needed'; // Ollama is local
    if (p === 'anthropic') return process.env.ANTHROPIC_API_KEY || '';
    return process.env.OPENAI_API_KEY || '';
  }

  private defaultModel(provider?: LLMProvider): string {
    const p = provider || this.config?.provider || 'ollama';
    if (p === 'ollama') return OLLAMA_CONFIG.defaultModel;
    if (p === 'anthropic') return 'claude-sonnet-4-20250514';
    return 'gpt-4o';
  }

  /**
   * Check if Ollama is running
   */
  async isOllamaAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${OLLAMA_CONFIG.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // v7.18: Track fallback attempts to prevent infinite loops
  private fallbackAttempts = 0;
  private static readonly MAX_FALLBACK_ATTEMPTS = 3;

  /**
   * Send a message and get a response
   * Fallback chain: Anthropic -> OpenAI -> Ollama (max 3 attempts)
   * v9.1.0: Now actually uses cache for 95% latency improvement on repeated queries
   */
  async chat(userMessage: string, systemPrompt?: string): Promise<LLMResponse> {
    const system = systemPrompt || GENESIS_SYSTEM_PROMPT;

    // v9.1.0: Check cache BEFORE making API call
    if (this.useCache) {
      const cacheKey = getCacheKey(userMessage + '|' + (systemPrompt || ''), this.config.model);
      const cached = responseCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        // Cache hit! Return immediately (5ms vs 2000ms)
        return {
          content: cached.response,
          model: this.config.model,
          provider: this.config.provider,
          usage: { inputTokens: 0, outputTokens: 0 }, // Cached, no tokens used
          latency: 5, // ~5ms for cache lookup
        };
      }
    }

    // Add user message to history
    this.conversationHistory.push({ role: 'user', content: userMessage });

    const startTime = Date.now();

    try {
      let response: LLMResponse;

      if (this.config.provider === 'ollama') {
        response = await this.callOllama(system);
      } else if (this.config.provider === 'anthropic') {
        response = await this.callAnthropic(system);
      } else {
        response = await this.callOpenAI(system);
      }

      // Reset fallback counter on success
      this.fallbackAttempts = 0;

      // Add assistant response to history
      this.conversationHistory.push({ role: 'assistant', content: response.content });

      // v9.1.0: Store in cache for future identical queries
      if (this.useCache && response.content) {
        const cacheKey = getCacheKey(userMessage + '|' + (systemPrompt || ''), this.config.model);
        responseCache.set(cacheKey, {
          response: response.content,
          timestamp: Date.now(),
          tokens: (response.usage?.outputTokens || 0),
        });
        cleanCache(); // Ensure cache doesn't grow unbounded
      }

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isQuotaError = errorMessage.includes('credit balance') ||
                           errorMessage.includes('quota') ||
                           errorMessage.includes('rate limit') ||
                           errorMessage.includes('insufficient_quota');

      // v7.18: Check fallback limit to prevent infinite loops
      if (this.fallbackAttempts >= LLMBridge.MAX_FALLBACK_ATTEMPTS) {
        this.fallbackAttempts = 0; // Reset for next call
        this.conversationHistory.pop();
        throw new Error(`LLM call failed after ${LLMBridge.MAX_FALLBACK_ATTEMPTS} fallback attempts: ${errorMessage}`);
      }

      this.fallbackAttempts++;

      // v7.18: Enhanced fallback chain with attempt tracking
      // Anthropic fails -> try OpenAI
      if (this.config.provider === 'anthropic' && process.env.OPENAI_API_KEY) {
        console.log(`[LLM] Anthropic failed (${isQuotaError ? 'quota' : 'error'}), falling back to OpenAI... (attempt ${this.fallbackAttempts}/${LLMBridge.MAX_FALLBACK_ATTEMPTS})`);
        this.config.provider = 'openai';
        this.config.apiKey = process.env.OPENAI_API_KEY;
        this.config.model = 'gpt-4o';
        this.conversationHistory.pop();
        return this.chat(userMessage, systemPrompt);
      }

      // OpenAI fails -> try Ollama (if available)
      if (this.config.provider === 'openai') {
        console.log(`[LLM] OpenAI failed (${isQuotaError ? 'quota' : 'error'}), falling back to Ollama... (attempt ${this.fallbackAttempts}/${LLMBridge.MAX_FALLBACK_ATTEMPTS})`);
        this.config.provider = 'ollama';
        this.config.apiKey = 'not-needed';
        this.config.model = OLLAMA_CONFIG.defaultModel;
        this.conversationHistory.pop();
        return this.chat(userMessage, systemPrompt);
      }

      // Ollama fails -> fail fast (don't loop back to OpenAI)
      this.fallbackAttempts = 0;
      this.conversationHistory.pop();
      throw new Error(`LLM call failed: ${errorMessage}`);
    }
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(systemPrompt: string): Promise<LLMResponse> {
    const startTime = Date.now();

    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.conversationHistory,
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      }),
      signal: AbortSignal.timeout(60000), // v7.18: 60s timeout for faster failure
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return {
      content: data.choices[0]?.message?.content || '',
      model: this.config.model,
      provider: 'openai',
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
      latency: Date.now() - startTime,
    };
  }

  /**
   * Call Anthropic API
   */
  private async callAnthropic(systemPrompt: string): Promise<LLMResponse> {
    const startTime = Date.now();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        system: systemPrompt,
        messages: this.conversationHistory.map(m => ({
          role: m.role === 'system' ? 'user' : m.role,
          content: m.content,
        })),
      }),
      signal: AbortSignal.timeout(60000), // v7.18: 60s timeout for faster failure
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return {
      content: data.content[0]?.text || '',
      model: this.config.model,
      provider: 'anthropic',
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      },
      latency: Date.now() - startTime,
    };
  }

  /**
   * Call Ollama API (local, free)
   * Uses OpenAI-compatible endpoint for easy switching
   */
  private async callOllama(systemPrompt: string): Promise<LLMResponse> {
    const startTime = Date.now();

    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.conversationHistory,
    ];

    const response = await fetch(`${OLLAMA_CONFIG.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: false,
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxTokens,
        },
      }),
      signal: AbortSignal.timeout(90000), // v7.18: 90s timeout (local can be slower)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return {
      content: data.message?.content || '',
      model: this.config.model,
      provider: 'ollama',
      usage: {
        inputTokens: data.prompt_eval_count || 0,
        outputTokens: data.eval_count || 0,
      },
      latency: Date.now() - startTime,
    };
  }

  // =========================================================================
  // v7.20.1: Streaming Support
  // =========================================================================

  /**
   * Stream chat response token by token
   * Yields StreamChunk objects as they arrive
   */
  async *chatStream(userMessage: string, systemPrompt?: string): AsyncGenerator<StreamChunk> {
    const system = systemPrompt || GENESIS_SYSTEM_PROMPT;

    // Add user message to history
    this.conversationHistory.push({ role: 'user', content: userMessage });

    const startTime = Date.now();

    try {
      if (this.config.provider === 'ollama') {
        yield* this.streamOllama(system, startTime);
      } else if (this.config.provider === 'anthropic') {
        yield* this.streamAnthropic(system, startTime);
      } else {
        yield* this.streamOpenAI(system, startTime);
      }

      // Reset fallback counter on success
      this.fallbackAttempts = 0;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      yield { type: 'error', error: errorMessage };
      this.conversationHistory.pop();
    }
  }

  /**
   * Stream from OpenAI API
   */
  private async *streamOpenAI(systemPrompt: string, startTime: number): AsyncGenerator<StreamChunk> {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.conversationHistory,
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        stream: true,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));

        for (const line of lines) {
          const data = line.slice(6); // Remove 'data: '
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices?.[0]?.delta?.content || '';

            if (token) {
              fullContent += token;
              outputTokens++;
              yield {
                type: 'token',
                token,
                content: fullContent,
                usage: { inputTokens, outputTokens },
              };
            }

            // Check for usage in final message
            if (parsed.usage) {
              inputTokens = parsed.usage.prompt_tokens || inputTokens;
              outputTokens = parsed.usage.completion_tokens || outputTokens;
            }
          } catch {
            // Ignore parse errors for partial JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Add to history
    this.conversationHistory.push({ role: 'assistant', content: fullContent });

    yield {
      type: 'done',
      content: fullContent,
      model: this.config.model,
      provider: 'openai',
      usage: { inputTokens, outputTokens },
      latency: Date.now() - startTime,
    };
  }

  /**
   * Stream from Anthropic API
   */
  private async *streamAnthropic(systemPrompt: string, startTime: number): AsyncGenerator<StreamChunk> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        system: systemPrompt,
        stream: true,
        messages: this.conversationHistory.map(m => ({
          role: m.role === 'system' ? 'user' : m.role,
          content: m.content,
        })),
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);

          try {
            const parsed = JSON.parse(data);

            // Handle different event types
            if (parsed.type === 'content_block_delta') {
              const token = parsed.delta?.text || '';
              if (token) {
                fullContent += token;
                outputTokens++;
                yield {
                  type: 'token',
                  token,
                  content: fullContent,
                  usage: { inputTokens, outputTokens },
                };
              }
            } else if (parsed.type === 'message_start') {
              inputTokens = parsed.message?.usage?.input_tokens || 0;
            } else if (parsed.type === 'message_delta') {
              outputTokens = parsed.usage?.output_tokens || outputTokens;
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Add to history
    this.conversationHistory.push({ role: 'assistant', content: fullContent });

    yield {
      type: 'done',
      content: fullContent,
      model: this.config.model,
      provider: 'anthropic',
      usage: { inputTokens, outputTokens },
      latency: Date.now() - startTime,
    };
  }

  /**
   * Stream from Ollama API
   */
  private async *streamOllama(systemPrompt: string, startTime: number): AsyncGenerator<StreamChunk> {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.conversationHistory,
    ];

    const response = await fetch(`${OLLAMA_CONFIG.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: true,  // Enable streaming
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxTokens,
        },
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            const token = parsed.message?.content || '';

            if (token) {
              fullContent += token;
              outputTokens++;
              yield {
                type: 'token',
                token,
                content: fullContent,
                usage: { inputTokens, outputTokens },
              };
            }

            // Final message contains usage stats
            if (parsed.done) {
              inputTokens = parsed.prompt_eval_count || inputTokens;
              outputTokens = parsed.eval_count || outputTokens;
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Add to history
    this.conversationHistory.push({ role: 'assistant', content: fullContent });

    yield {
      type: 'done',
      content: fullContent,
      model: this.config.model,
      provider: 'ollama',
      usage: { inputTokens, outputTokens },
      latency: Date.now() - startTime,
    };
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Get conversation history
   */
  getHistory(): LLMMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Get current config
   */
  getConfig(): LLMConfig {
    return { ...this.config };
  }

  /**
   * Check if API key is configured (or Ollama available)
   */
  isConfigured(): boolean {
    if (this.config.provider === 'ollama') return true; // Local, no key needed
    return !!this.config.apiKey;
  }

  /**
   * v7.18: Chat with specific model tier for cost optimization
   * - fast: GPT-4o-mini/Haiku - 17x cheaper, good for simple tasks
   * - balanced: GPT-4o/Sonnet - default quality
   * - powerful: Best available model
   */
  async chatWithTier(
    userMessage: string,
    tier: ModelTier = 'balanced',
    systemPrompt?: string
  ): Promise<LLMResponse> {
    const originalModel = this.config.model;
    const tierModel = MODEL_TIERS[this.config.provider][tier];

    // Temporarily switch to tier model
    this.config.model = tierModel;

    try {
      const response = await this.chat(userMessage, systemPrompt);
      return response;
    } finally {
      // Restore original model
      this.config.model = originalModel;
    }
  }

  /**
   * Get provider status
   */
  status(): { configured: boolean; provider: LLMProvider; model: string; isLocal: boolean } {
    return {
      configured: this.isConfigured(),
      provider: this.config.provider,
      model: this.config.model,
      isLocal: this.config.provider === 'ollama',
    };
  }

  /**
   * v7.18: Get cache statistics for cost monitoring
   */
  getCacheStats(): { size: number; hits: number; estimatedSavings: number } {
    cleanCache();
    let totalTokensSaved = 0;
    for (const entry of responseCache.values()) {
      totalTokensSaved += entry.tokens;
    }
    // Estimate savings: avg $0.01 per 1K tokens for GPT-4o
    const estimatedSavings = (totalTokensSaved / 1000) * 0.01;
    return {
      size: responseCache.size,
      hits: totalTokensSaved,
      estimatedSavings,
    };
  }

  /**
   * v7.18: Enable/disable response caching
   */
  setCache(enabled: boolean): void {
    this.useCache = enabled;
  }

  /**
   * v7.18: Clear the response cache
   */
  clearCache(): void {
    responseCache.clear();
  }

  /**
   * List available Ollama models
   */
  async listOllamaModels(): Promise<string[]> {
    try {
      const response = await fetch(`${OLLAMA_CONFIG.baseUrl}/api/tags`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.models?.map((m: any) => m.name) || [];
    } catch {
      return [];
    }
  }
}

// ============================================================================
// Factory & Singleton
// ============================================================================

let llmBridgeInstance: LLMBridge | null = null;

export function createLLMBridge(config?: Partial<LLMConfig>): LLMBridge {
  return new LLMBridge(config);
}

export function getLLMBridge(config?: Partial<LLMConfig>): LLMBridge {
  if (!llmBridgeInstance) {
    llmBridgeInstance = createLLMBridge(config);
  }
  return llmBridgeInstance;
}

export function resetLLMBridge(): void {
  llmBridgeInstance = null;
}
