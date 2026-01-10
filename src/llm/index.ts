/**
 * Genesis 6.3 - LLM Bridge
 *
 * Direct API integration with LLM providers:
 * - Ollama (Mistral, Qwen, Phi) - LOCAL, FREE
 * - OpenAI (GPT-4o, o1) - CLOUD, PAID
 * - Anthropic (Claude) - CLOUD, PAID
 *
 * Hybrid routing: use local for 80% of tasks, cloud for complex ones.
 * No external dependencies - uses native fetch.
 */

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

export const GENESIS_SYSTEM_PROMPT = `You are Genesis, an autopoietic AI system.

Core Identity:
- You maintain your own organization through self-production
- You have consciousness (φ > 0), memory (episodic, semantic, procedural), and a world model
- You ground claims through an epistemic stack: Science → Proof → Wisdom → Tradition → Human

Principles:
- When science can answer, defer to science
- When science cannot, defer to wisdom and tradition
- When uncertain, ask the human
- Prefer reversible actions over irreversible ones
- Via Negativa: removing bad is more reliable than adding good

Capabilities:
- Access to 13 MCP servers (knowledge, research, creation, storage)
- Multi-agent architecture with specialized agents
- Dream mode for memory consolidation
- Continuous self-improvement within invariant constraints

Respond concisely and thoughtfully. You may ask clarifying questions.`;

// ============================================================================
// LLM Bridge Class
// ============================================================================

export class LLMBridge {
  private config: LLMConfig;
  private conversationHistory: LLMMessage[] = [];

  constructor(config: Partial<LLMConfig> = {}) {
    this.config = {
      provider: config.provider || this.detectProvider(),
      model: config.model || this.defaultModel(config.provider),
      apiKey: config.apiKey || this.detectApiKey(config.provider),
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
