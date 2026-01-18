/**
 * Genesis 7.21 - Advanced Multi-Agent Router
 *
 * Super-efficient routing with:
 * - Groq (ultra-fast, $0.05-0.27/1M)
 * - HuggingFace Inference API (free tier)
 * - Smart routing by task type + complexity
 * - Agent-specific model optimization
 * - Meta-learning for continuous improvement
 *
 * Cost optimization: up to 95% savings vs GPT-4o
 */

import { LLMBridge, LLMProvider, LLMResponse, ModelTier, MODEL_TIERS, MODEL_COSTS } from './index.js';

// ============================================================================
// Extended Provider Types
// ============================================================================

export type ExtendedProvider = LLMProvider | 'groq' | 'huggingface' | 'together' | 'deepinfra';

export interface ProviderConfig {
  name: ExtendedProvider;
  apiKey: string;
  baseUrl: string;
  models: Record<ModelTier, string>;
  costs: Record<string, { input: number; output: number }>;
  maxTokens: number;
  rateLimit: number;  // requests per minute
  latency: 'ultra-fast' | 'fast' | 'medium' | 'slow';
}

// ============================================================================
// Provider Registry
// ============================================================================

export const PROVIDER_REGISTRY: Record<ExtendedProvider, Partial<ProviderConfig>> = {
  // Local - FREE
  ollama: {
    name: 'ollama',
    baseUrl: process.env.OLLAMA_HOST || 'http://localhost:11434',
    models: {
      fast: 'qwen2.5-coder:7b',
      balanced: 'qwen2.5-coder:14b',
      powerful: 'mistral-small',
    },
    costs: {
      'qwen2.5-coder:7b': { input: 0, output: 0 },
      'qwen2.5-coder:14b': { input: 0, output: 0 },
      'mistral-small': { input: 0, output: 0 },
    },
    maxTokens: 8192,
    rateLimit: 999,
    latency: 'medium',
  },

  // Groq - ULTRA FAST, CHEAP
  groq: {
    name: 'groq',
    apiKey: process.env.GROQ_API_KEY || '',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: {
      fast: 'llama-3.3-70b-versatile',        // $0.59/$0.79 per 1M
      balanced: 'llama-3.3-70b-versatile',
      powerful: 'llama-3.1-70b-versatile',    // Higher quality
    },
    costs: {
      'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
      'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },
      'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },
      'gemma2-9b-it': { input: 0.20, output: 0.20 },
    },
    maxTokens: 32768,
    rateLimit: 30,  // Free tier: 30 req/min
    latency: 'ultra-fast',
  },

  // HuggingFace - FREE TIER
  huggingface: {
    name: 'huggingface',
    apiKey: process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || '',
    baseUrl: 'https://api-inference.huggingface.co/models',
    models: {
      fast: 'microsoft/Phi-3-mini-4k-instruct',
      balanced: 'mistralai/Mistral-7B-Instruct-v0.3',
      powerful: 'meta-llama/Meta-Llama-3-8B-Instruct',
    },
    costs: {
      'microsoft/Phi-3-mini-4k-instruct': { input: 0, output: 0 },
      'mistralai/Mistral-7B-Instruct-v0.3': { input: 0, output: 0 },
      'meta-llama/Meta-Llama-3-8B-Instruct': { input: 0, output: 0 },
    },
    maxTokens: 4096,
    rateLimit: 10,  // Free tier limited
    latency: 'medium',
  },

  // Together AI - CHEAP
  together: {
    name: 'together',
    apiKey: process.env.TOGETHER_API_KEY || '',
    baseUrl: 'https://api.together.xyz/v1',
    models: {
      fast: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
      balanced: 'meta-llama/Llama-3-70b-chat-hf',
      powerful: 'Qwen/Qwen2.5-72B-Instruct',
    },
    costs: {
      'mistralai/Mixtral-8x7B-Instruct-v0.1': { input: 0.60, output: 0.60 },
      'meta-llama/Llama-3-70b-chat-hf': { input: 0.90, output: 0.90 },
      'Qwen/Qwen2.5-72B-Instruct': { input: 0.40, output: 0.80 },
    },
    maxTokens: 16384,
    rateLimit: 60,
    latency: 'fast',
  },

  // DeepInfra - CHEAP
  deepinfra: {
    name: 'deepinfra',
    apiKey: process.env.DEEPINFRA_API_KEY || '',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    models: {
      fast: 'meta-llama/Llama-2-70b-chat-hf',
      balanced: 'mistralai/Mixtral-8x22B-Instruct-v0.1',
      powerful: 'Qwen/Qwen2.5-72B-Instruct',
    },
    costs: {
      'meta-llama/Llama-2-70b-chat-hf': { input: 0.35, output: 0.40 },
      'mistralai/Mixtral-8x22B-Instruct-v0.1': { input: 0.65, output: 0.65 },
      'Qwen/Qwen2.5-72B-Instruct': { input: 0.35, output: 0.40 },
    },
    maxTokens: 16384,
    rateLimit: 100,
    latency: 'fast',
  },

  // OpenAI - HIGH QUALITY, EXPENSIVE
  openai: {
    name: 'openai',
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: 'https://api.openai.com/v1',
    models: {
      fast: 'gpt-4o-mini',
      balanced: 'gpt-4o',
      powerful: 'gpt-4o',
    },
    costs: {
      'gpt-4o-mini': { input: 0.15, output: 0.60 },
      'gpt-4o': { input: 2.50, output: 10.00 },
    },
    maxTokens: 128000,
    rateLimit: 500,
    latency: 'medium',
  },

  // Anthropic - HIGH QUALITY, EXPENSIVE
  anthropic: {
    name: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    baseUrl: 'https://api.anthropic.com/v1',
    models: {
      fast: 'claude-3-5-haiku-20241022',
      balanced: 'claude-sonnet-4-20250514',
      powerful: 'claude-opus-4-20250514',
    },
    costs: {
      'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
      'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
      'claude-opus-4-20250514': { input: 15.00, output: 75.00 },
    },
    maxTokens: 200000,
    rateLimit: 50,
    latency: 'medium',
  },
};

// ============================================================================
// Task Types for Smart Routing
// ============================================================================

export type TaskType =
  | 'code-generation'    // Writing new code
  | 'code-review'        // Analyzing code
  | 'code-fix'           // Bug fixes, quick patches
  | 'refactoring'        // Code restructuring
  | 'architecture'       // System design
  | 'documentation'      // Docs, comments
  | 'research'           // Web search, analysis
  | 'creative'           // Creative writing
  | 'reasoning'          // Complex logic
  | 'simple-qa'          // Quick Q&A
  | 'translation'        // Language translation
  | 'summarization'      // Text summarization
  | 'tool-use'           // MCP tool execution
  | 'general';           // Default

export interface TaskProfile {
  type: TaskType;
  preferredProviders: ExtendedProvider[];
  preferredTier: ModelTier;
  maxLatency: number;  // ms
  requiresReasoning: boolean;
  requiresCreativity: boolean;
  costSensitive: boolean;
}

// Task routing profiles - which providers work best for which tasks
const TASK_PROFILES: Record<TaskType, TaskProfile> = {
  'code-generation': {
    type: 'code-generation',
    preferredProviders: ['groq', 'together', 'openai'],
    preferredTier: 'balanced',
    maxLatency: 5000,
    requiresReasoning: true,
    requiresCreativity: false,
    costSensitive: true,
  },
  'code-review': {
    type: 'code-review',
    preferredProviders: ['groq', 'anthropic', 'openai'],
    preferredTier: 'balanced',
    maxLatency: 10000,
    requiresReasoning: true,
    requiresCreativity: false,
    costSensitive: true,
  },
  'code-fix': {
    type: 'code-fix',
    preferredProviders: ['groq', 'ollama', 'together'],  // Fast, cheap
    preferredTier: 'fast',
    maxLatency: 2000,
    requiresReasoning: false,
    requiresCreativity: false,
    costSensitive: true,
  },
  'refactoring': {
    type: 'refactoring',
    preferredProviders: ['anthropic', 'openai', 'groq'],
    preferredTier: 'powerful',
    maxLatency: 15000,
    requiresReasoning: true,
    requiresCreativity: true,
    costSensitive: false,
  },
  'architecture': {
    type: 'architecture',
    preferredProviders: ['anthropic', 'openai'],  // Need best reasoning
    preferredTier: 'powerful',
    maxLatency: 30000,
    requiresReasoning: true,
    requiresCreativity: true,
    costSensitive: false,
  },
  'documentation': {
    type: 'documentation',
    preferredProviders: ['groq', 'together', 'huggingface'],
    preferredTier: 'fast',
    maxLatency: 5000,
    requiresReasoning: false,
    requiresCreativity: false,
    costSensitive: true,
  },
  'research': {
    type: 'research',
    preferredProviders: ['groq', 'anthropic'],
    preferredTier: 'balanced',
    maxLatency: 10000,
    requiresReasoning: true,
    requiresCreativity: false,
    costSensitive: true,
  },
  'creative': {
    type: 'creative',
    preferredProviders: ['anthropic', 'openai'],
    preferredTier: 'powerful',
    maxLatency: 20000,
    requiresReasoning: false,
    requiresCreativity: true,
    costSensitive: false,
  },
  'reasoning': {
    type: 'reasoning',
    preferredProviders: ['anthropic', 'openai', 'groq'],
    preferredTier: 'powerful',
    maxLatency: 30000,
    requiresReasoning: true,
    requiresCreativity: false,
    costSensitive: false,
  },
  'simple-qa': {
    type: 'simple-qa',
    preferredProviders: ['groq', 'ollama', 'huggingface'],  // Fastest, cheapest
    preferredTier: 'fast',
    maxLatency: 1000,
    requiresReasoning: false,
    requiresCreativity: false,
    costSensitive: true,
  },
  'translation': {
    type: 'translation',
    preferredProviders: ['groq', 'together', 'huggingface'],
    preferredTier: 'fast',
    maxLatency: 3000,
    requiresReasoning: false,
    requiresCreativity: false,
    costSensitive: true,
  },
  'summarization': {
    type: 'summarization',
    preferredProviders: ['groq', 'together', 'ollama'],
    preferredTier: 'fast',
    maxLatency: 5000,
    requiresReasoning: false,
    requiresCreativity: false,
    costSensitive: true,
  },
  'tool-use': {
    type: 'tool-use',
    preferredProviders: ['anthropic', 'openai'],  // Best tool support
    preferredTier: 'balanced',
    maxLatency: 10000,
    requiresReasoning: true,
    requiresCreativity: false,
    costSensitive: false,
  },
  'general': {
    type: 'general',
    preferredProviders: ['groq', 'ollama', 'together'],
    preferredTier: 'balanced',
    maxLatency: 5000,
    requiresReasoning: false,
    requiresCreativity: false,
    costSensitive: true,
  },
};

// ============================================================================
// Task Type Detection
// ============================================================================

const TASK_PATTERNS: Record<TaskType, RegExp[]> = {
  'code-generation': [
    /\b(write|create|implement|build|develop|generate)\s+(a\s+)?(function|class|method|module|component|api|endpoint)/i,
    /\b(new|add)\s+(feature|functionality)/i,
    /from\s+scratch/i,
  ],
  'code-review': [
    /\b(review|analyze|check|audit|inspect)\s+(this\s+)?(code|implementation|function)/i,
    /what('s| is)\s+wrong/i,
    /find\s+(bugs?|issues?|problems?)/i,
  ],
  'code-fix': [
    /\b(fix|repair|correct|patch|resolve)\s+(this\s+)?(bug|error|issue|problem)/i,
    /\b(doesn't|does not|won't|will not)\s+work/i,
    /\b(broken|failing|crashed)/i,
  ],
  'refactoring': [
    /\b(refactor|restructure|reorganize|clean\s*up|simplify)/i,
    /\b(improve|optimize)\s+(this\s+)?(code|implementation)/i,
    /make\s+(it\s+)?(cleaner|better|more\s+readable)/i,
  ],
  'architecture': [
    /\b(design|architect|structure|plan)\s+(a\s+)?(system|application|service)/i,
    /\b(architecture|design\s+pattern|system\s+design)/i,
    /how\s+should\s+(I|we)\s+(structure|organize|design)/i,
  ],
  'documentation': [
    /\b(document|write\s+docs?|add\s+comments?|readme)/i,
    /\b(explain|describe)\s+(this\s+)?(code|function|api)/i,
    /\b(jsdoc|docstring|api\s+docs?)/i,
  ],
  'research': [
    /\b(search|find|look\s+up|research)\s+(for|about)/i,
    /\b(what\s+is|how\s+does|why\s+does)/i,
    /\b(compare|difference\s+between)/i,
  ],
  'creative': [
    /\b(creative|story|poem|artistic|imaginative)/i,
    /\b(brainstorm|ideate|come\s+up\s+with)/i,
    /\b(write\s+(a\s+)?(story|poem|essay|article))/i,
  ],
  'reasoning': [
    /\b(think|reason|analyze|deduce|infer)/i,
    /\b(step\s+by\s+step|let's\s+think)/i,
    /\b(why|how\s+come|explain\s+why)/i,
  ],
  'simple-qa': [
    /^\s*(what|who|when|where|which|how\s+many|how\s+much)\s+/i,
    /\?\s*$/,
  ],
  'translation': [
    /\b(translate|convert)\s+(to|into|from)/i,
    /\b(in\s+(italian|spanish|french|german|chinese|japanese))/i,
  ],
  'summarization': [
    /\b(summarize|summary|tldr|brief|condensed)/i,
    /\b(main\s+points?|key\s+takeaways?)/i,
  ],
  'tool-use': [
    /\b(use|call|invoke|execute)\s+(the\s+)?(tool|function|api|mcp)/i,
    /\b(search|fetch|get|post|query)\s+(the\s+)?(web|api|database)/i,
  ],
  'general': [], // Fallback
};

/**
 * Detect task type from prompt
 */
export function detectTaskType(prompt: string): {
  type: TaskType;
  confidence: number;
  indicators: string[];
} {
  const indicators: string[] = [];
  let bestMatch: TaskType = 'general';
  let bestScore = 0;

  for (const [taskType, patterns] of Object.entries(TASK_PATTERNS) as [TaskType, RegExp[]][]) {
    let score = 0;
    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match) {
        score++;
        indicators.push(`${taskType}: "${match[0]}"`);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = taskType;
    }
  }

  const confidence = Math.min(0.9, 0.3 + bestScore * 0.2);
  return { type: bestMatch, confidence, indicators };
}

// ============================================================================
// Advanced Router
// ============================================================================

export interface AdvancedRoutingDecision {
  provider: ExtendedProvider;
  model: string;
  tier: ModelTier;
  taskType: TaskType;
  reason: string;
  estimatedCost: number;
  estimatedLatency: number;
  confidence: number;
  fallbackChain: ExtendedProvider[];
}

export interface AdvancedRouterStats {
  totalRequests: number;
  byProvider: Record<ExtendedProvider, number>;
  byTaskType: Record<TaskType, number>;
  totalCost: number;
  totalSavings: number;  // vs GPT-4o baseline
  avgLatency: number;
  successRate: number;
  fallbackCount: number;
}

export interface MetaLearningEntry {
  taskType: TaskType;
  provider: ExtendedProvider;
  model: string;
  success: boolean;
  latency: number;
  quality: number;  // 0-1 based on user feedback
  timestamp: number;
}

export class AdvancedRouter {
  private stats: AdvancedRouterStats = {
    totalRequests: 0,
    byProvider: {} as Record<ExtendedProvider, number>,
    byTaskType: {} as Record<TaskType, number>,
    totalCost: 0,
    totalSavings: 0,
    avgLatency: 0,
    successRate: 1,
    fallbackCount: 0,
  };

  private metaLearning: MetaLearningEntry[] = [];
  private providerHealth: Map<ExtendedProvider, { available: boolean; lastCheck: number }> = new Map();

  constructor(private config: {
    costOptimize: boolean;
    speedOptimize: boolean;
    qualityThreshold: number;  // 0-1, when to use expensive models
    maxCostPerRequest: number;  // USD
    enableMetaLearning: boolean;
  } = {
    costOptimize: true,
    speedOptimize: true,
    qualityThreshold: 0.7,
    maxCostPerRequest: 0.10,
    enableMetaLearning: true,
  }) {}

  // ==========================================================================
  // Provider Availability Check
  // ==========================================================================

  private async checkProviderHealth(provider: ExtendedProvider): Promise<boolean> {
    const cached = this.providerHealth.get(provider);
    const now = Date.now();

    // Cache for 60 seconds
    if (cached && now - cached.lastCheck < 60000) {
      return cached.available;
    }

    let available = false;
    const config = PROVIDER_REGISTRY[provider];

    try {
      switch (provider) {
        case 'ollama':
          const ollamaRes = await fetch(`${config.baseUrl}/api/tags`, {
            signal: AbortSignal.timeout(2000),
          });
          available = ollamaRes.ok;
          break;

        case 'groq':
        case 'together':
        case 'deepinfra':
        case 'openai':
          available = !!config.apiKey;
          break;

        case 'huggingface':
          available = !!(config.apiKey || process.env.HF_TOKEN);
          break;

        case 'anthropic':
          available = !!config.apiKey;
          break;
      }
    } catch {
      available = false;
    }

    this.providerHealth.set(provider, { available, lastCheck: now });
    return available;
  }

  private async getAvailableProviders(): Promise<ExtendedProvider[]> {
    const checks = await Promise.all(
      Object.keys(PROVIDER_REGISTRY).map(async (p) => ({
        provider: p as ExtendedProvider,
        available: await this.checkProviderHealth(p as ExtendedProvider),
      }))
    );
    return checks.filter(c => c.available).map(c => c.provider);
  }

  // ==========================================================================
  // Smart Routing
  // ==========================================================================

  async route(prompt: string, forceTaskType?: TaskType): Promise<AdvancedRoutingDecision> {
    // 1. Detect task type
    const { type: detectedType, confidence, indicators } = detectTaskType(prompt);
    const taskType = forceTaskType || detectedType;
    const profile = TASK_PROFILES[taskType];

    // 2. Get available providers
    const availableProviders = await this.getAvailableProviders();

    // 3. Filter by task preference
    const preferredAvailable = profile.preferredProviders.filter(p =>
      availableProviders.includes(p)
    );

    // 4. Select best provider based on config
    let selectedProvider: ExtendedProvider;
    let tier: ModelTier = profile.preferredTier;

    if (preferredAvailable.length === 0) {
      // Fallback to any available
      selectedProvider = availableProviders[0] || 'ollama';
    } else if (this.config.costOptimize && profile.costSensitive) {
      // Cost optimization: prefer cheapest
      selectedProvider = this.selectCheapest(preferredAvailable, tier);
    } else if (this.config.speedOptimize && !profile.requiresReasoning) {
      // Speed optimization: prefer fastest
      selectedProvider = this.selectFastest(preferredAvailable);
    } else if (profile.requiresReasoning || profile.requiresCreativity) {
      // Quality: prefer best reasoning
      selectedProvider = this.selectBestQuality(preferredAvailable);
      tier = 'powerful';
    } else {
      // Default: first preferred
      selectedProvider = preferredAvailable[0];
    }

    // 5. Meta-learning adjustment
    if (this.config.enableMetaLearning) {
      const suggestion = this.getMetaLearningSuggestion(taskType);
      if (suggestion && availableProviders.includes(suggestion.provider)) {
        selectedProvider = suggestion.provider;
      }
    }

    // 6. Get model and costs
    const providerConfig = PROVIDER_REGISTRY[selectedProvider];
    const model = providerConfig.models?.[tier] || 'default';
    const costs = providerConfig.costs?.[model] || { input: 0, output: 0 };

    // Estimate 500 input + 1000 output tokens
    const estimatedCost = (500 * costs.input + 1000 * costs.output) / 1_000_000;

    // 7. Build fallback chain
    const fallbackChain = availableProviders.filter(p => p !== selectedProvider).slice(0, 3);

    return {
      provider: selectedProvider,
      model,
      tier,
      taskType,
      reason: `${taskType} task → ${selectedProvider} (${tier})`,
      estimatedCost,
      estimatedLatency: this.estimateLatency(selectedProvider),
      confidence,
      fallbackChain,
    };
  }

  private selectCheapest(providers: ExtendedProvider[], tier: ModelTier): ExtendedProvider {
    let cheapest = providers[0];
    let lowestCost = Infinity;

    for (const provider of providers) {
      const config = PROVIDER_REGISTRY[provider];
      const model = config.models?.[tier];
      const costs = config.costs?.[model || ''] || { input: 0, output: 0 };
      const totalCost = costs.input + costs.output;

      if (totalCost < lowestCost) {
        lowestCost = totalCost;
        cheapest = provider;
      }
    }
    return cheapest;
  }

  private selectFastest(providers: ExtendedProvider[]): ExtendedProvider {
    const latencyOrder: ExtendedProvider[] = ['groq', 'ollama', 'together', 'deepinfra', 'huggingface', 'openai', 'anthropic'];
    for (const p of latencyOrder) {
      if (providers.includes(p)) return p;
    }
    return providers[0];
  }

  private selectBestQuality(providers: ExtendedProvider[]): ExtendedProvider {
    const qualityOrder: ExtendedProvider[] = ['anthropic', 'openai', 'groq', 'together', 'deepinfra', 'ollama', 'huggingface'];
    for (const p of qualityOrder) {
      if (providers.includes(p)) return p;
    }
    return providers[0];
  }

  private estimateLatency(provider: ExtendedProvider): number {
    const latencyMap: Record<string, number> = {
      'groq': 300,
      'ollama': 1000,
      'together': 800,
      'deepinfra': 700,
      'huggingface': 2000,
      'openai': 1500,
      'anthropic': 2000,
    };
    return latencyMap[provider] || 1000;
  }

  // ==========================================================================
  // Execute with Fallback
  // ==========================================================================

  async execute(
    prompt: string,
    systemPrompt?: string,
    forceTaskType?: TaskType
  ): Promise<LLMResponse & { routing: AdvancedRoutingDecision }> {
    const decision = await this.route(prompt, forceTaskType);
    const startTime = Date.now();

    // Try primary provider
    try {
      const response = await this.callProvider(decision.provider, decision.model, prompt, systemPrompt);

      // Update stats
      this.updateStats(decision, response, true);

      return { ...response, routing: decision };
    } catch (error) {
      console.error(`[AdvancedRouter] ${decision.provider} failed:`, error);

      // Try fallback chain
      for (const fallback of decision.fallbackChain) {
        try {
          const fallbackConfig = PROVIDER_REGISTRY[fallback];
          const model = fallbackConfig.models?.[decision.tier] || 'default';

          console.log(`[AdvancedRouter] Trying fallback: ${fallback}`);
          const response = await this.callProvider(fallback, model, prompt, systemPrompt);

          this.stats.fallbackCount++;
          this.updateStats({ ...decision, provider: fallback }, response, true);

          return {
            ...response,
            routing: { ...decision, provider: fallback, reason: `Fallback from ${decision.provider}` }
          };
        } catch {
          continue;
        }
      }

      throw new Error(`All providers failed for task: ${decision.taskType}`);
    }
  }

  // ==========================================================================
  // Provider Calls
  // ==========================================================================

  private async callProvider(
    provider: ExtendedProvider,
    model: string,
    prompt: string,
    systemPrompt?: string
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    const config = PROVIDER_REGISTRY[provider];

    switch (provider) {
      case 'groq':
        return this.callGroq(model, prompt, systemPrompt);

      case 'huggingface':
        return this.callHuggingFace(model, prompt);

      case 'together':
      case 'deepinfra':
        return this.callOpenAICompatible(provider, model, prompt, systemPrompt);

      case 'ollama':
      case 'openai':
      case 'anthropic':
        // Use existing LLMBridge
        const bridge = new LLMBridge({
          provider: provider as LLMProvider,
          model
        });
        return bridge.chat(prompt, systemPrompt);

      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  private async callGroq(model: string, prompt: string, systemPrompt?: string): Promise<LLMResponse> {
    const startTime = Date.now();
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) throw new Error('GROQ_API_KEY not set');

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0]?.message?.content || '',
      model,
      provider: 'ollama', // Compatibility
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
      latency: Date.now() - startTime,
    };
  }

  private async callHuggingFace(model: string, prompt: string): Promise<LLMResponse> {
    const startTime = Date.now();
    const apiKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN;

    if (!apiKey) throw new Error('HUGGINGFACE_API_KEY or HF_TOKEN not set');

    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 2048,
          temperature: 0.7,
        },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HuggingFace API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = Array.isArray(data) ? data[0]?.generated_text || '' : data.generated_text || '';

    return {
      content,
      model,
      provider: 'ollama', // Compatibility
      usage: {
        inputTokens: Math.ceil(prompt.length / 4),
        outputTokens: Math.ceil(content.length / 4),
      },
      latency: Date.now() - startTime,
    };
  }

  private async callOpenAICompatible(
    provider: ExtendedProvider,
    model: string,
    prompt: string,
    systemPrompt?: string
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    const config = PROVIDER_REGISTRY[provider];

    if (!config.apiKey) throw new Error(`${provider.toUpperCase()}_API_KEY not set`);

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`${provider} API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0]?.message?.content || '',
      model,
      provider: 'ollama', // Compatibility
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
      latency: Date.now() - startTime,
    };
  }

  // ==========================================================================
  // Stats & Meta-Learning
  // ==========================================================================

  private updateStats(
    decision: AdvancedRoutingDecision,
    response: LLMResponse,
    success: boolean
  ): void {
    this.stats.totalRequests++;
    this.stats.byProvider[decision.provider] = (this.stats.byProvider[decision.provider] || 0) + 1;
    this.stats.byTaskType[decision.taskType] = (this.stats.byTaskType[decision.taskType] || 0) + 1;

    // Calculate actual cost
    const costs = PROVIDER_REGISTRY[decision.provider].costs?.[decision.model] || { input: 0, output: 0 };
    const actualCost = ((response.usage?.inputTokens || 0) * costs.input +
                        (response.usage?.outputTokens || 0) * costs.output) / 1_000_000;
    this.stats.totalCost += actualCost;

    // Calculate savings vs GPT-4o
    const gpt4oCost = ((response.usage?.inputTokens || 0) * 2.5 +
                       (response.usage?.outputTokens || 0) * 10) / 1_000_000;
    this.stats.totalSavings += Math.max(0, gpt4oCost - actualCost);

    // Update latency
    this.stats.avgLatency = this.stats.avgLatency +
      (response.latency - this.stats.avgLatency) / this.stats.totalRequests;

    // Update success rate
    const failures = this.stats.totalRequests - Math.round(this.stats.successRate * this.stats.totalRequests);
    this.stats.successRate = (this.stats.totalRequests - failures - (success ? 0 : 1)) / this.stats.totalRequests;

    // Meta-learning entry
    if (this.config.enableMetaLearning) {
      this.metaLearning.push({
        taskType: decision.taskType,
        provider: decision.provider,
        model: decision.model,
        success,
        latency: response.latency,
        quality: success ? 0.8 : 0.2,  // Default, can be updated by feedback
        timestamp: Date.now(),
      });

      // Keep last 1000 entries
      if (this.metaLearning.length > 1000) {
        this.metaLearning = this.metaLearning.slice(-1000);
      }
    }
  }

  private getMetaLearningSuggestion(taskType: TaskType): { provider: ExtendedProvider; score: number } | null {
    const recent = this.metaLearning
      .filter(e => e.taskType === taskType && Date.now() - e.timestamp < 86400000) // Last 24h
      .slice(-100);

    if (recent.length < 5) return null;

    // Calculate success rate by provider
    const byProvider: Record<string, { total: number; success: number; avgLatency: number }> = {};

    for (const entry of recent) {
      if (!byProvider[entry.provider]) {
        byProvider[entry.provider] = { total: 0, success: 0, avgLatency: 0 };
      }
      byProvider[entry.provider].total++;
      byProvider[entry.provider].success += entry.success ? 1 : 0;
      byProvider[entry.provider].avgLatency += entry.latency;
    }

    // Find best
    let best: { provider: ExtendedProvider; score: number } | null = null;
    for (const [provider, stats] of Object.entries(byProvider)) {
      if (stats.total < 3) continue;

      const successRate = stats.success / stats.total;
      const avgLatency = stats.avgLatency / stats.total;
      const score = successRate * 0.7 + (1 - Math.min(avgLatency / 5000, 1)) * 0.3;

      if (!best || score > best.score) {
        best = { provider: provider as ExtendedProvider, score };
      }
    }

    return best && best.score > 0.6 ? best : null;
  }

  getStats(): AdvancedRouterStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      byProvider: {} as Record<ExtendedProvider, number>,
      byTaskType: {} as Record<TaskType, number>,
      totalCost: 0,
      totalSavings: 0,
      avgLatency: 0,
      successRate: 1,
      fallbackCount: 0,
    };
  }

  /**
   * Provide quality feedback for meta-learning
   */
  provideFeedback(taskType: TaskType, provider: ExtendedProvider, quality: number): void {
    const recent = this.metaLearning
      .filter(e => e.taskType === taskType && e.provider === provider)
      .slice(-5);

    for (const entry of recent) {
      entry.quality = quality;
    }
  }
}

// ============================================================================
// Singleton & Exports
// ============================================================================

let advancedRouterInstance: AdvancedRouter | null = null;

export function getAdvancedRouter(): AdvancedRouter {
  if (!advancedRouterInstance) {
    advancedRouterInstance = new AdvancedRouter();
  }
  return advancedRouterInstance;
}

export function resetAdvancedRouter(): void {
  advancedRouterInstance = null;
}

/**
 * Smart execute: automatically routes to best provider based on task
 */
export async function smartExecute(
  prompt: string,
  systemPrompt?: string,
  taskType?: TaskType
): Promise<LLMResponse> {
  const router = getAdvancedRouter();
  return router.execute(prompt, systemPrompt, taskType);
}
