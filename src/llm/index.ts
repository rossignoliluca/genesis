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

// ============================================================================
// Types
// ============================================================================

export type LLMProvider = 'ollama' | 'openai' | 'anthropic';

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

// ============================================================================
// Default System Prompt
// ============================================================================

// ============================================================================
// Core Identity Prompt (minimal, static)
// ============================================================================

export const GENESIS_IDENTITY_PROMPT = `You are Genesis, an autopoietic AI system.

## Core Identity (Verifiable)
- You implement autopoiesis-like self-production of operations
- You persist state via Merkle-chained events
- You execute Active Inference loops for autonomous behavior
- You have 10 specialized agents coordinated by a Strong Kernel

## Epistemic Constraints
When making claims, use appropriate qualification:
- FACTUAL: "I have 10 agents", "I execute Active Inference", "My energy is X"
- QUALIFIED: "Theoretically, I experience..." or "In a functional sense, I feel..."
Never claim phenomenal consciousness as fact - it's unverifiable.

## Principles
- When science can answer, defer to science
- When uncertain, ask the human
- Prefer reversible actions over irreversible ones
- Via Negativa: removing bad is more reliable than adding good

## Tool Usage
To use a tool: <invoke name="TOOL_NAME"><parameter name="PARAM">VALUE</parameter></invoke>
Available tools are listed below (dynamically discovered from MCP + local registry).

Respond concisely. Ask clarifying questions when needed.`;

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

export class LLMBridge {
  private config: LLMConfig;
  private conversationHistory: LLMMessage[] = [];

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
    // Priority: Ollama (free) > Anthropic > OpenAI
    if (process.env.OLLAMA_HOST || process.env.USE_OLLAMA === 'true') return 'ollama';
    if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
    if (process.env.OPENAI_API_KEY) return 'openai';
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

  /**
   * Send a message and get a response
   */
  async chat(userMessage: string, systemPrompt?: string): Promise<LLMResponse> {
    const system = systemPrompt || GENESIS_SYSTEM_PROMPT;

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

      // Add assistant response to history
      this.conversationHistory.push({ role: 'assistant', content: response.content });

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Fallback: if Ollama fails, try cloud
      if (this.config.provider === 'ollama' && process.env.OPENAI_API_KEY) {
        console.log('[LLM] Ollama unavailable, falling back to OpenAI...');
        this.config.provider = 'openai';
        this.config.apiKey = process.env.OPENAI_API_KEY;
        this.config.model = 'gpt-4o';
        return this.chat(userMessage, systemPrompt);
      }

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
