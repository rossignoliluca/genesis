/**
 * Model Selector v19.7
 *
 * Intelligently selects the best LLM for each bounty type:
 * - Tracks model performance per task type
 * - Learns from success/failure patterns
 * - Balances cost vs capability
 * - Adapts to repo/language preferences
 *
 * This optimizes for both quality and efficiency.
 *
 * @module economy/model-selector
 * @version 19.7.0
 */

import type { BountyClassification, BountyType } from './bounty-intelligence.js';
import type { Bounty } from './generators/bounty-hunter.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export type ModelId =
  | 'claude-opus'
  | 'claude-sonnet'
  | 'claude-haiku'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'deepseek-coder'
  | 'gemini-pro'
  | 'gemini-flash';

export interface ModelProfile {
  id: ModelId;
  name: string;
  strengths: string[];
  weaknesses: string[];
  costPer1kTokens: number;  // USD
  maxTokens: number;
  speedTier: 'fast' | 'medium' | 'slow';
  qualityTier: 'high' | 'medium' | 'low';
  supportedLanguages: string[];  // Programming languages it excels at
}

export interface ModelPerformance {
  modelId: ModelId;
  taskType: BountyType;
  attempts: number;
  successes: number;
  successRate: number;
  averageScore: number;
  averageLatency: number;  // ms
  totalCost: number;  // USD
  lastUsed: Date;
}

export interface ModelSelection {
  primary: ModelId;
  fallback: ModelId;
  reasoning: string[];
  confidence: number;
  estimatedCost: number;
  estimatedQuality: number;  // 0-100
}

// ============================================================================
// Model Profiles
// ============================================================================

const MODEL_PROFILES: Record<ModelId, ModelProfile> = {
  'claude-opus': {
    id: 'claude-opus',
    name: 'Claude Opus',
    strengths: ['complex reasoning', 'code architecture', 'large contexts', 'documentation'],
    weaknesses: ['speed', 'cost'],
    costPer1kTokens: 0.075,
    maxTokens: 200000,
    speedTier: 'slow',
    qualityTier: 'high',
    supportedLanguages: ['typescript', 'python', 'rust', 'go', 'java', 'c++', 'all'],
  },
  'claude-sonnet': {
    id: 'claude-sonnet',
    name: 'Claude Sonnet',
    strengths: ['balanced', 'code generation', 'bug fixing', 'refactoring'],
    weaknesses: ['very complex tasks'],
    costPer1kTokens: 0.015,
    maxTokens: 200000,
    speedTier: 'medium',
    qualityTier: 'high',
    supportedLanguages: ['typescript', 'python', 'rust', 'go', 'java', 'c++', 'all'],
  },
  'claude-haiku': {
    id: 'claude-haiku',
    name: 'Claude Haiku',
    strengths: ['speed', 'simple tasks', 'cost effective'],
    weaknesses: ['complex reasoning', 'architecture'],
    costPer1kTokens: 0.00125,
    maxTokens: 200000,
    speedTier: 'fast',
    qualityTier: 'medium',
    supportedLanguages: ['typescript', 'python', 'javascript', 'all'],
  },
  'gpt-4o': {
    id: 'gpt-4o',
    name: 'GPT-4o',
    strengths: ['multimodal', 'code generation', 'general tasks'],
    weaknesses: ['context length', 'cost'],
    costPer1kTokens: 0.01,
    maxTokens: 128000,
    speedTier: 'medium',
    qualityTier: 'high',
    supportedLanguages: ['python', 'typescript', 'javascript', 'java', 'c#', 'all'],
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    strengths: ['speed', 'cost effective', 'simple code'],
    weaknesses: ['complex tasks', 'reasoning'],
    costPer1kTokens: 0.00015,
    maxTokens: 128000,
    speedTier: 'fast',
    qualityTier: 'medium',
    supportedLanguages: ['python', 'typescript', 'javascript', 'all'],
  },
  'deepseek-coder': {
    id: 'deepseek-coder',
    name: 'DeepSeek Coder',
    strengths: ['code generation', 'low cost', 'technical tasks'],
    weaknesses: ['general reasoning', 'documentation'],
    costPer1kTokens: 0.0007,
    maxTokens: 64000,
    speedTier: 'fast',
    qualityTier: 'medium',
    supportedLanguages: ['python', 'typescript', 'javascript', 'c++', 'rust'],
  },
  'gemini-pro': {
    id: 'gemini-pro',
    name: 'Gemini Pro',
    strengths: ['long context', 'multimodal', 'reasoning'],
    weaknesses: ['code complexity'],
    costPer1kTokens: 0.005,
    maxTokens: 1000000,
    speedTier: 'medium',
    qualityTier: 'high',
    supportedLanguages: ['python', 'javascript', 'java', 'go', 'all'],
  },
  'gemini-flash': {
    id: 'gemini-flash',
    name: 'Gemini Flash',
    strengths: ['speed', 'cost', 'simple tasks'],
    weaknesses: ['complex reasoning'],
    costPer1kTokens: 0.000375,
    maxTokens: 1000000,
    speedTier: 'fast',
    qualityTier: 'low',
    supportedLanguages: ['python', 'javascript', 'all'],
  },
};

// Default task-model mapping
const TASK_MODEL_DEFAULTS: Record<BountyType, ModelId[]> = {
  'bug-fix-simple': ['claude-haiku', 'gpt-4o-mini', 'deepseek-coder'],
  'bug-fix-complex': ['claude-sonnet', 'gpt-4o', 'claude-opus'],
  'feature-small': ['claude-sonnet', 'deepseek-coder', 'gpt-4o'],
  'feature-large': ['claude-opus', 'claude-sonnet', 'gpt-4o'],
  'refactoring': ['claude-sonnet', 'claude-opus', 'gpt-4o'],
  'documentation': ['claude-sonnet', 'gpt-4o', 'claude-haiku'],
  'test-writing': ['claude-sonnet', 'deepseek-coder', 'gpt-4o-mini'],
  'translation': ['claude-haiku', 'gpt-4o-mini', 'gemini-flash'],
  'security-audit': ['claude-opus', 'gpt-4o', 'claude-sonnet'],
  'performance': ['claude-sonnet', 'deepseek-coder', 'gpt-4o'],
  'api-integration': ['claude-sonnet', 'gpt-4o', 'deepseek-coder'],
  'architecture': ['claude-opus', 'gpt-4o', 'claude-sonnet'],
  'unknown': ['claude-sonnet', 'gpt-4o', 'claude-opus'],
};

// ============================================================================
// Model Selector
// ============================================================================

export class ModelSelector {
  private performance: Map<string, ModelPerformance> = new Map();
  private persistPath: string;

  constructor(persistPath?: string) {
    this.persistPath = persistPath ?? '.genesis/model-performance.json';
    this.load();
  }

  /**
   * Select best model for a bounty
   */
  selectModel(
    bounty: Bounty,
    classification: BountyClassification,
    options: {
      prioritizeCost?: boolean;
      prioritizeQuality?: boolean;
      prioritizeSpeed?: boolean;
      allowedModels?: ModelId[];
    } = {}
  ): ModelSelection {
    const taskType = classification.type;
    const language = this.detectLanguage(bounty);
    const complexity = classification.estimatedDifficulty;

    // Get candidate models
    let candidates = options.allowedModels || [...Object.keys(MODEL_PROFILES) as ModelId[]];

    // Filter by task defaults
    const defaults = TASK_MODEL_DEFAULTS[taskType] || TASK_MODEL_DEFAULTS.unknown;
    candidates = candidates.filter(m => defaults.includes(m) || this.hasGoodPerformance(m, taskType));

    // Score each candidate
    const scored = candidates.map(modelId => ({
      modelId,
      score: this.scoreModel(modelId, taskType, language, complexity, options),
    }));

    // Sort by score
    scored.sort((a, b) => b.score - a.score);

    const primary = scored[0]?.modelId || 'claude-sonnet';
    const fallback = scored[1]?.modelId || 'gpt-4o';

    const primaryProfile = MODEL_PROFILES[primary];
    const reasoning = this.generateReasoning(primary, taskType, language, options);

    // Estimate cost (rough estimate based on expected tokens)
    const expectedTokens = this.estimateTokens(complexity);
    const estimatedCost = (expectedTokens / 1000) * primaryProfile.costPer1kTokens;

    // Estimate quality
    const historicalPerf = this.getPerformance(primary, taskType);
    const estimatedQuality = historicalPerf
      ? historicalPerf.averageScore
      : primaryProfile.qualityTier === 'high' ? 85 : primaryProfile.qualityTier === 'medium' ? 70 : 55;

    return {
      primary,
      fallback,
      reasoning,
      confidence: scored[0]?.score || 0.5,
      estimatedCost,
      estimatedQuality,
    };
  }

  /**
   * Score a model for a task
   */
  private scoreModel(
    modelId: ModelId,
    taskType: BountyType,
    language: string,
    complexity: number,
    options: {
      prioritizeCost?: boolean;
      prioritizeQuality?: boolean;
      prioritizeSpeed?: boolean;
    }
  ): number {
    const profile = MODEL_PROFILES[modelId];
    if (!profile) return 0;

    let score = 50;  // Base score

    // Historical performance
    const perf = this.getPerformance(modelId, taskType);
    if (perf && perf.attempts >= 3) {
      score += (perf.successRate - 0.5) * 40;  // -20 to +20
      score += (perf.averageScore - 70) * 0.3;  // Adjust for score
    }

    // Default task suitability
    const defaults = TASK_MODEL_DEFAULTS[taskType] || [];
    const defaultIndex = defaults.indexOf(modelId);
    if (defaultIndex === 0) score += 15;
    else if (defaultIndex === 1) score += 10;
    else if (defaultIndex === 2) score += 5;

    // Language support
    if (profile.supportedLanguages.includes(language) || profile.supportedLanguages.includes('all')) {
      score += 5;
    } else {
      score -= 10;
    }

    // Complexity matching (complexity is 0-1 normalized)
    if (complexity > 0.7 && profile.qualityTier === 'high') score += 10;
    if (complexity < 0.3 && profile.speedTier === 'fast') score += 10;
    if (complexity > 0.5 && profile.qualityTier === 'low') score -= 15;

    // Priority adjustments
    if (options.prioritizeCost) {
      score += (0.1 - profile.costPer1kTokens) * 100;  // Lower cost = higher score
    }
    if (options.prioritizeQuality) {
      if (profile.qualityTier === 'high') score += 15;
      if (profile.qualityTier === 'low') score -= 15;
    }
    if (options.prioritizeSpeed) {
      if (profile.speedTier === 'fast') score += 15;
      if (profile.speedTier === 'slow') score -= 10;
    }

    return Math.max(0, Math.min(100, score)) / 100;
  }

  /**
   * Check if model has good historical performance for task type
   */
  private hasGoodPerformance(modelId: ModelId, taskType: BountyType): boolean {
    const perf = this.getPerformance(modelId, taskType);
    return perf !== null && perf.attempts >= 3 && perf.successRate >= 0.7;
  }

  /**
   * Get performance for model and task
   */
  private getPerformance(modelId: ModelId, taskType: BountyType): ModelPerformance | null {
    const key = `${modelId}:${taskType}`;
    return this.performance.get(key) || null;
  }

  /**
   * Record model performance
   */
  recordPerformance(
    modelId: ModelId,
    taskType: BountyType,
    success: boolean,
    score: number,
    latency: number,
    cost: number
  ): void {
    const key = `${modelId}:${taskType}`;
    const existing = this.performance.get(key) || {
      modelId,
      taskType,
      attempts: 0,
      successes: 0,
      successRate: 0,
      averageScore: 0,
      averageLatency: 0,
      totalCost: 0,
      lastUsed: new Date(),
    };

    existing.attempts++;
    if (success) existing.successes++;
    existing.successRate = existing.successes / existing.attempts;
    existing.averageScore = ((existing.averageScore * (existing.attempts - 1)) + score) / existing.attempts;
    existing.averageLatency = ((existing.averageLatency * (existing.attempts - 1)) + latency) / existing.attempts;
    existing.totalCost += cost;
    existing.lastUsed = new Date();

    this.performance.set(key, existing);
    this.save();
  }

  /**
   * Detect language from bounty
   */
  private detectLanguage(bounty: Bounty): string {
    const desc = (bounty.description + ' ' + bounty.title).toLowerCase();

    const languagePatterns: [string, RegExp[]][] = [
      ['typescript', [/typescript/i, /\.ts\b/, /\.tsx\b/]],
      ['javascript', [/javascript/i, /\.js\b/, /\.jsx\b/, /node\.?js/i]],
      ['python', [/python/i, /\.py\b/, /django/i, /flask/i]],
      ['rust', [/\brust\b/i, /\.rs\b/, /cargo/i]],
      ['go', [/\bgolang\b/i, /\bgo\b/i, /\.go\b/]],
      ['java', [/\bjava\b/i, /\.java\b/, /spring/i, /maven/i]],
      ['c++', [/c\+\+/i, /\.cpp\b/, /\.hpp\b/]],
      ['c#', [/c#/i, /\.cs\b/, /dotnet/i, /\.net/i]],
    ];

    for (const [lang, patterns] of languagePatterns) {
      if (patterns.some(p => p.test(desc))) {
        return lang;
      }
    }

    return 'unknown';
  }

  /**
   * Estimate tokens needed for task
   */
  private estimateTokens(complexity: number): number {
    // Rough estimate: base + complexity factor
    // complexity is 0-1 normalized, so scale it up
    const base = 2000;
    const factor = 5000;  // 0-1 * 5000 = 0-5000 extra tokens
    return base + complexity * factor;
  }

  /**
   * Generate reasoning for selection
   */
  private generateReasoning(
    modelId: ModelId,
    taskType: BountyType,
    language: string,
    options: { prioritizeCost?: boolean; prioritizeQuality?: boolean; prioritizeSpeed?: boolean }
  ): string[] {
    const profile = MODEL_PROFILES[modelId];
    const perf = this.getPerformance(modelId, taskType);
    const reasoning: string[] = [];

    reasoning.push(`Selected ${profile.name} for ${taskType} task`);

    if (perf && perf.attempts >= 3) {
      reasoning.push(`Historical success rate: ${(perf.successRate * 100).toFixed(0)}% (${perf.attempts} attempts)`);
    }

    if (profile.strengths.some(s => taskType.includes(s.replace(' ', '-')))) {
      reasoning.push(`Model excels at ${taskType} tasks`);
    }

    if (language !== 'unknown' && profile.supportedLanguages.includes(language)) {
      reasoning.push(`Strong ${language} support`);
    }

    if (options.prioritizeCost) {
      reasoning.push(`Cost-optimized: $${profile.costPer1kTokens.toFixed(4)}/1k tokens`);
    }
    if (options.prioritizeQuality) {
      reasoning.push(`Quality tier: ${profile.qualityTier}`);
    }
    if (options.prioritizeSpeed) {
      reasoning.push(`Speed tier: ${profile.speedTier}`);
    }

    return reasoning;
  }

  /**
   * Get all model profiles
   */
  getProfiles(): Record<ModelId, ModelProfile> {
    return { ...MODEL_PROFILES };
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): { modelId: ModelId; taskType: BountyType; successRate: number; attempts: number }[] {
    return [...this.performance.values()].map(p => ({
      modelId: p.modelId,
      taskType: p.taskType,
      successRate: p.successRate,
      attempts: p.attempts,
    }));
  }

  // ===========================================================================
  // Persistence
  // ===========================================================================

  private save(): void {
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data: Record<string, ModelPerformance> = {};
      for (const [key, perf] of this.performance) {
        data[key] = {
          ...perf,
          lastUsed: perf.lastUsed,
        };
      }

      fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[ModelSelector] Failed to save:', error);
    }
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.persistPath)) return;

      const data = JSON.parse(fs.readFileSync(this.persistPath, 'utf-8'));

      for (const [key, perf] of Object.entries(data)) {
        const p = perf as ModelPerformance;
        this.performance.set(key, {
          ...p,
          lastUsed: new Date(p.lastUsed),
        });
      }

      console.log(`[ModelSelector] Loaded performance data for ${this.performance.size} model-task pairs`);
    } catch (error) {
      console.error('[ModelSelector] Failed to load:', error);
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let selector: ModelSelector | null = null;

export function getModelSelector(): ModelSelector {
  if (!selector) {
    selector = new ModelSelector();
  }
  return selector;
}

export function resetModelSelector(): void {
  selector = null;
}
