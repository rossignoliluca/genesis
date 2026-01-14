/**
 * Genesis 6.8 - Hybrid LLM Router
 *
 * Intelligent routing between local (Ollama) and cloud (OpenAI/Anthropic) LLMs.
 *
 * Routing Logic:
 * - Simple tasks (syntax fix, file ops, search) -> Local (fast, free)
 * - Complex tasks (architecture, design, creative) -> Cloud (high quality)
 *
 * Factors considered:
 * - Task complexity (heuristic analysis)
 * - Token count estimation
 * - Ollama availability
 * - User preference
 * - Cost optimization
 */

import { LLMBridge, LLMProvider, LLMResponse, getLLMBridge } from './index.js';
import * as os from 'os';

// ============================================================================
// Hardware Detection
// ============================================================================

export interface HardwareProfile {
  /** Detected CPU type */
  cpu: string;
  /** Is Apple Silicon (M1/M2/M3/M4)? */
  isAppleSilicon: boolean;
  /** CPU cores */
  cores: number;
  /** Total memory in GB */
  memoryGB: number;
  /** Performance tier: low, medium, high, ultra */
  tier: 'low' | 'medium' | 'high' | 'ultra';
  /** Recommended cloud threshold */
  recommendedThreshold: TaskComplexity;
  /** Recommended max tokens */
  recommendedMaxTokens: number;
}

/**
 * Detect hardware capabilities and recommend router config
 */
export function detectHardware(): HardwareProfile {
  const cpus = os.cpus();
  const cpu = cpus[0]?.model || 'Unknown';
  const cores = cpus.length;
  const memoryGB = Math.round(os.totalmem() / (1024 ** 3));

  // Detect Apple Silicon
  const isAppleSilicon = cpu.includes('Apple M') ||
                         process.arch === 'arm64' && process.platform === 'darwin';

  // Determine tier
  let tier: HardwareProfile['tier'];
  let recommendedThreshold: TaskComplexity;
  let recommendedMaxTokens: number;

  if (isAppleSilicon && memoryGB >= 24) {
    // M3 Pro/Max/Ultra or M4 Pro/Max - top tier
    tier = 'ultra';
    recommendedThreshold = 'creative';  // Only creative to cloud
    recommendedMaxTokens = 16384;       // Can handle large context
  } else if (isAppleSilicon && memoryGB >= 16) {
    // M1/M2/M3/M4 base with good RAM
    tier = 'high';
    recommendedThreshold = 'creative';
    recommendedMaxTokens = 8192;
  } else if (cores >= 8 && memoryGB >= 16) {
    // Good desktop/laptop
    tier = 'medium';
    recommendedThreshold = 'complex';
    recommendedMaxTokens = 4096;
  } else {
    // Limited hardware
    tier = 'low';
    recommendedThreshold = 'moderate';  // Route more to cloud
    recommendedMaxTokens = 2048;
  }

  return {
    cpu,
    isAppleSilicon,
    cores,
    memoryGB,
    tier,
    recommendedThreshold,
    recommendedMaxTokens,
  };
}

// ============================================================================
// Types
// ============================================================================

export type TaskComplexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'creative';

export interface RoutingDecision {
  /** Selected provider */
  provider: LLMProvider;
  /** Reasoning for the decision */
  reason: string;
  /** Estimated complexity */
  complexity: TaskComplexity;
  /** Confidence in decision (0-1) */
  confidence: number;
  /** Estimated tokens */
  estimatedTokens: number;
  /** Estimated cost (USD) for cloud */
  estimatedCost: number;
  /** Should we try local first? */
  tryLocalFirst: boolean;
}

export interface RouterConfig {
  /** Prefer local for all tasks (cost optimization) */
  preferLocal: boolean;
  /** Force cloud for all tasks (quality optimization) */
  forceCloud: boolean;
  /** Maximum tokens for local model */
  localMaxTokens: number;
  /** Complexity threshold for cloud (trivial=0, creative=4) */
  cloudThreshold: TaskComplexity;
  /** Auto-fallback to cloud if local fails */
  autoFallback: boolean;
  /** Log routing decisions */
  logDecisions: boolean;
}

export interface RouterStats {
  totalRequests: number;
  localRequests: number;
  cloudRequests: number;
  fallbacks: number;
  avgLocalLatency: number;
  avgCloudLatency: number;
  estimatedSavings: number;
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CONFIG: RouterConfig = {
  preferLocal: true,
  forceCloud: false,
  localMaxTokens: 8192,       // M4 Pro can handle larger context
  cloudThreshold: 'creative', // Only creative → cloud (M4 Pro is fast enough for complex)
  autoFallback: true,
  logDecisions: false,
};

// ============================================================================
// Complexity Analysis
// ============================================================================

const COMPLEXITY_SCORES: Record<TaskComplexity, number> = {
  trivial: 0,
  simple: 1,
  moderate: 2,
  complex: 3,
  creative: 4,
};

/**
 * Keywords that indicate simple/local tasks
 */
const LOCAL_KEYWORDS = [
  // Syntax & Formatting
  'fix syntax', 'typo', 'spelling', 'indent', 'format',
  'semicolon', 'bracket', 'parenthesis', 'quote',

  // File Operations
  'rename', 'move file', 'delete file', 'list files',
  'find file', 'search', 'grep', 'locate',

  // Simple Code Tasks
  'add import', 'remove import', 'update import',
  'add export', 'rename variable', 'rename function',
  'add comment', 'remove comment', 'update comment',

  // Git Operations
  'git status', 'git diff', 'git log', 'git add',
  'commit message', 'branch name',

  // Quick Fixes
  'missing semicolon', 'missing bracket', 'missing import',
  'unused variable', 'undefined variable',
  'type error', 'typescript error',
];

/**
 * Keywords that indicate complex/cloud tasks
 */
const CLOUD_KEYWORDS = [
  // Architecture
  'design', 'architect', 'structure', 'pattern',
  'refactor', 'restructure', 'reorganize',

  // Creative
  'create', 'implement', 'build', 'develop',
  'new feature', 'add feature', 'write from scratch',

  // Complex Analysis
  'analyze', 'review', 'evaluate', 'assess',
  'optimize', 'improve', 'enhance',

  // Documentation
  'document', 'explain', 'describe', 'tutorial',
  'readme', 'api docs', 'specification',

  // Testing
  'write tests', 'test coverage', 'integration test',
  'e2e test', 'test strategy',

  // Multi-step
  'step by step', 'multiple files', 'across the codebase',
  'entire project', 'all files',
];

/**
 * Analyze task complexity from the prompt
 */
export function analyzeComplexity(prompt: string): {
  complexity: TaskComplexity;
  confidence: number;
  indicators: string[];
} {
  const lower = prompt.toLowerCase();
  const indicators: string[] = [];

  let localScore = 0;
  let cloudScore = 0;

  // Check local keywords
  for (const keyword of LOCAL_KEYWORDS) {
    if (lower.includes(keyword)) {
      localScore++;
      indicators.push(`local: "${keyword}"`);
    }
  }

  // Check cloud keywords
  for (const keyword of CLOUD_KEYWORDS) {
    if (lower.includes(keyword)) {
      cloudScore++;
      indicators.push(`cloud: "${keyword}"`);
    }
  }

  // Additional heuristics
  const wordCount = prompt.split(/\s+/).length;
  const hasCode = prompt.includes('```') || prompt.includes('function ') || prompt.includes('class ');
  const hasMultipleQuestions = (prompt.match(/\?/g) || []).length > 1;
  const hasNumberedList = /\d+\.\s/.test(prompt);

  if (wordCount > 200) {
    cloudScore += 2;
    indicators.push('long prompt');
  }
  if (hasCode && wordCount > 100) {
    cloudScore++;
    indicators.push('code + explanation');
  }
  if (hasMultipleQuestions) {
    cloudScore++;
    indicators.push('multiple questions');
  }
  if (hasNumberedList) {
    cloudScore++;
    indicators.push('multi-step task');
  }

  // Calculate final complexity
  const netScore = cloudScore - localScore;
  let complexity: TaskComplexity;

  if (netScore <= -2) complexity = 'trivial';
  else if (netScore <= 0) complexity = 'simple';
  else if (netScore <= 2) complexity = 'moderate';
  else if (netScore <= 4) complexity = 'complex';
  else complexity = 'creative';

  // Confidence based on indicator count
  const totalIndicators = localScore + cloudScore;
  const confidence = Math.min(0.9, 0.3 + (totalIndicators * 0.1));

  return { complexity, confidence, indicators };
}

/**
 * Estimate token count from prompt
 */
export function estimateTokens(text: string): number {
  // Rough estimation: ~4 characters per token for English
  return Math.ceil(text.length / 4);
}

/**
 * Detect available cloud provider (no vendor preference)
 */
export function detectCloudProvider(): LLMProvider {
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;

  if (hasOpenAI && hasAnthropic) {
    // Use GENESIS_CLOUD_PROVIDER preference if set
    const preferred = process.env.GENESIS_CLOUD_PROVIDER?.toLowerCase();
    if (preferred === 'openai') return 'openai';
    if (preferred === 'anthropic') return 'anthropic';
    // No preference set: default alphabetically (a before o)
    return 'anthropic';
  }

  if (hasAnthropic) return 'anthropic';
  if (hasOpenAI) return 'openai';
  return 'ollama'; // Fallback to local
}

/**
 * Estimate cost for cloud provider
 */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  provider: LLMProvider
): number {
  // Prices per 1M tokens (as of 2024)
  const prices: Record<LLMProvider, { input: number; output: number }> = {
    openai: { input: 2.5, output: 10 },      // GPT-4o
    anthropic: { input: 3, output: 15 },     // Claude Sonnet
    ollama: { input: 0, output: 0 },         // Free!
  };

  const p = prices[provider];
  return ((inputTokens * p.input) + (outputTokens * p.output)) / 1_000_000;
}

// ============================================================================
// Hybrid Router Class
// ============================================================================

export class HybridRouter {
  private config: RouterConfig;
  private stats: RouterStats = {
    totalRequests: 0,
    localRequests: 0,
    cloudRequests: 0,
    fallbacks: 0,
    avgLocalLatency: 0,
    avgCloudLatency: 0,
    estimatedSavings: 0,
  };

  private localBridge: LLMBridge | null = null;
  private cloudBridge: LLMBridge | null = null;
  private hardwareProfile: HardwareProfile;

  constructor(config?: Partial<RouterConfig>) {
    // Detect hardware and auto-configure
    this.hardwareProfile = detectHardware();

    // Apply hardware-based defaults, then user overrides
    this.config = {
      ...DEFAULT_CONFIG,
      cloudThreshold: this.hardwareProfile.recommendedThreshold,
      localMaxTokens: this.hardwareProfile.recommendedMaxTokens,
      ...config,
    };

    if (this.config.logDecisions) {
      console.log(`[Router] Hardware: ${this.hardwareProfile.tier} tier (${this.hardwareProfile.cpu})`);
      console.log(`[Router] Config: cloudThreshold=${this.config.cloudThreshold}, localMaxTokens=${this.config.localMaxTokens}`);
    }
  }

  /**
   * Get detected hardware profile
   */
  getHardwareProfile(): HardwareProfile {
    return { ...this.hardwareProfile };
  }

  // ==========================================================================
  // Routing Logic
  // ==========================================================================

  /**
   * Decide which provider to use
   */
  async route(prompt: string): Promise<RoutingDecision> {
    const { complexity, confidence, indicators } = analyzeComplexity(prompt);
    const estimatedTokens = estimateTokens(prompt);
    const estimatedOutputTokens = Math.min(estimatedTokens * 2, 2000);

    // Force cloud if configured
    if (this.config.forceCloud) {
      const cloudProvider = detectCloudProvider();
      return {
        provider: cloudProvider,
        reason: 'Force cloud mode enabled',
        complexity,
        confidence: 1,
        estimatedTokens,
        estimatedCost: estimateCost(estimatedTokens, estimatedOutputTokens, cloudProvider),
        tryLocalFirst: false,
      };
    }

    // Check if Ollama is available
    const ollamaAvailable = await this.isOllamaAvailable();

    // Prefer local if configured and available
    if (this.config.preferLocal && ollamaAvailable) {
      const threshold = COMPLEXITY_SCORES[this.config.cloudThreshold];
      const score = COMPLEXITY_SCORES[complexity];

      if (score < threshold) {
        return {
          provider: 'ollama',
          reason: `Task complexity (${complexity}) below cloud threshold (${this.config.cloudThreshold})`,
          complexity,
          confidence,
          estimatedTokens,
          estimatedCost: 0,
          tryLocalFirst: true,
        };
      }
    }

    // Token limit check for local
    if (estimatedTokens > this.config.localMaxTokens) {
      const cloudProvider = detectCloudProvider();
      return {
        provider: cloudProvider,
        reason: `Token count (${estimatedTokens}) exceeds local limit (${this.config.localMaxTokens})`,
        complexity,
        confidence,
        estimatedTokens,
        estimatedCost: estimateCost(estimatedTokens, estimatedOutputTokens, cloudProvider),
        tryLocalFirst: false,
      };
    }

    // Default: use local if available, else cloud
    if (ollamaAvailable) {
      return {
        provider: 'ollama',
        reason: 'Local model available, using for cost savings',
        complexity,
        confidence,
        estimatedTokens,
        estimatedCost: 0,
        tryLocalFirst: true,
      };
    }

    const cloudProvider = detectCloudProvider();
    return {
      provider: cloudProvider,
      reason: 'Ollama not available, using cloud',
      complexity,
      confidence,
      estimatedTokens,
      estimatedCost: estimateCost(estimatedTokens, estimatedOutputTokens, cloudProvider),
      tryLocalFirst: false,
    };
  }

  /**
   * Execute request with routing
   */
  async execute(prompt: string, systemPrompt?: string): Promise<LLMResponse & { routingDecision: RoutingDecision }> {
    const decision = await this.route(prompt);

    if (this.config.logDecisions) {
      console.log(`[Router] ${decision.provider}: ${decision.reason} (${decision.complexity}, ${decision.confidence.toFixed(2)})`);
    }

    this.stats.totalRequests++;

    try {
      const bridge = this.getBridge(decision.provider);
      const response = await bridge.chat(prompt, systemPrompt);

      // Update stats
      if (decision.provider === 'ollama') {
        this.stats.localRequests++;
        this.stats.avgLocalLatency = this.updateAverage(
          this.stats.avgLocalLatency,
          response.latency,
          this.stats.localRequests
        );
        // Calculate savings vs cloud (use detected cloud provider for accurate estimate)
        const cloudCost = estimateCost(
          response.usage?.inputTokens || 0,
          response.usage?.outputTokens || 0,
          detectCloudProvider()
        );
        this.stats.estimatedSavings += cloudCost;
      } else {
        this.stats.cloudRequests++;
        this.stats.avgCloudLatency = this.updateAverage(
          this.stats.avgCloudLatency,
          response.latency,
          this.stats.cloudRequests
        );
      }

      return { ...response, routingDecision: decision };

    } catch (error) {
      // Auto-fallback if enabled
      if (this.config.autoFallback && decision.provider === 'ollama') {
        console.log('[Router] Local failed, falling back to cloud...');
        this.stats.fallbacks++;

        const fallbackProvider = detectCloudProvider();
        const bridge = this.getBridge(fallbackProvider);
        const response = await bridge.chat(prompt, systemPrompt);

        return {
          ...response,
          routingDecision: {
            ...decision,
            provider: fallbackProvider,
            reason: `Fallback from Ollama: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        };
      }

      throw error;
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private async isOllamaAvailable(): Promise<boolean> {
    try {
      const response = await fetch('http://localhost:11434/api/tags', {
        signal: AbortSignal.timeout(1000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private getBridge(provider: LLMProvider): LLMBridge {
    if (provider === 'ollama') {
      if (!this.localBridge) {
        this.localBridge = new LLMBridge({ provider: 'ollama' });
      }
      return this.localBridge;
    }

    if (!this.cloudBridge) {
      this.cloudBridge = new LLMBridge({ provider });
    }
    return this.cloudBridge;
  }

  private updateAverage(current: number, newValue: number, count: number): number {
    return current + (newValue - current) / count;
  }

  // ==========================================================================
  // Stats & Config
  // ==========================================================================

  getStats(): RouterStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      localRequests: 0,
      cloudRequests: 0,
      fallbacks: 0,
      avgLocalLatency: 0,
      avgCloudLatency: 0,
      estimatedSavings: 0,
    };
  }

  getConfig(): RouterConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<RouterConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let routerInstance: HybridRouter | null = null;

export function getHybridRouter(config?: Partial<RouterConfig>): HybridRouter {
  if (!routerInstance) {
    routerInstance = new HybridRouter(config);
  }
  return routerInstance;
}

export function resetHybridRouter(): void {
  routerInstance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Smart chat: automatically routes to best provider
 */
export async function smartChat(
  prompt: string,
  systemPrompt?: string
): Promise<LLMResponse> {
  const router = getHybridRouter();
  const result = await router.execute(prompt, systemPrompt);
  return result;
}

/**
 * Force local chat (Ollama)
 */
export async function localChat(
  prompt: string,
  systemPrompt?: string
): Promise<LLMResponse> {
  const bridge = new LLMBridge({ provider: 'ollama' });
  return bridge.chat(prompt, systemPrompt);
}

/**
 * Force cloud chat
 */
export async function cloudChat(
  prompt: string,
  systemPrompt?: string
): Promise<LLMResponse> {
  const provider = detectCloudProvider();
  const bridge = new LLMBridge({ provider });
  return bridge.chat(prompt, systemPrompt);
}
