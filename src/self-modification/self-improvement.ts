/**
 * Genesis 7.17 - Self-Improvement Cycle
 *
 * Autonomous self-improvement via observation, reflection, and modification.
 * Uses Darwin-Gödel Engine for safe code modifications.
 *
 * Cycle:
 * 1. OBSERVE - Collect metrics from all systems
 * 2. REFLECT - Identify bottlenecks and improvement opportunities
 * 3. PROPOSE - Generate modification plans
 * 4. APPLY - Use Darwin-Gödel to safely apply changes
 * 5. VERIFY - Check if improvement was achieved
 */

import { EventEmitter } from 'events';
import { DarwinGodelEngine, getDarwinGodelEngine, ModificationPlan, Modification } from './darwin-godel.js';
import { PhiMonitor, createPhiMonitor } from '../consciousness/phi-monitor.js';
import { CognitiveWorkspace, getCognitiveWorkspace } from '../memory/cognitive-workspace.js';
import { invariantRegistry, InvariantContext } from '../kernel/invariants.js';
import {
  broadcastCycleStarted,
  broadcastStageChanged,
  broadcastProposalCreated,
  broadcastMetricsUpdated,
  broadcastModificationApplied,
  broadcastModificationFailed,
  broadcastLessonStored,
} from '../observability/dashboard.js';

// ============================================================================
// Types
// ============================================================================

export interface SystemMetrics {
  // Consciousness
  phi: number;
  consciousnessState: string;
  phiTrend: 'rising' | 'stable' | 'falling';

  // Memory
  memoryReuse: number;
  cacheHitRate: number;
  memorySize: number;

  // Performance
  avgResponseTime: number;
  taskSuccessRate: number;
  errorRate: number;

  // Active Inference
  avgSurprise: number;
  expectedFreeEnergy: number;

  // System
  uptime: number;
  cyclesCompleted: number;

  timestamp: Date;
}

export interface ImprovementOpportunity {
  id: string;
  category: 'performance' | 'consciousness' | 'memory' | 'reliability' | 'capability';
  metric: keyof SystemMetrics;
  currentValue: number;
  targetValue: number;
  priority: number; // 0-1
  description: string;
  suggestedFix?: ModificationPlan;
}

export interface ImprovementResult {
  opportunityId: string;
  applied: boolean;
  success: boolean;
  beforeMetrics: SystemMetrics;
  afterMetrics?: SystemMetrics;
  commitHash?: string;
  rollbackHash?: string;
  error?: string;
  duration: number;
}

export interface SelfImprovementConfig {
  /** Enable automatic improvements */
  autoImprove: boolean;
  /** Minimum φ required to self-improve */
  minPhiForImprovement: number;
  /** Maximum improvements per cycle */
  maxImprovementsPerCycle: number;
  /** Cooldown between improvement attempts (ms) */
  improvementCooldownMs: number;
  /** Metric thresholds that trigger improvement */
  thresholds: {
    minPhi: number;
    minMemoryReuse: number;
    maxErrorRate: number;
    maxSurprise: number;
    minTaskSuccessRate: number;
  };
  /** Metric targets for improvement */
  targets: {
    phi: number;
    memoryReuse: number;
    errorRate: number;
    surprise: number;
    taskSuccessRate: number;
  };
}

export const DEFAULT_IMPROVEMENT_CONFIG: SelfImprovementConfig = {
  autoImprove: false, // Disabled by default for safety
  minPhiForImprovement: 0.3,
  maxImprovementsPerCycle: 3,
  improvementCooldownMs: 60000, // 1 minute
  thresholds: {
    minPhi: 0.2,
    minMemoryReuse: 0.4,
    maxErrorRate: 0.1,
    maxSurprise: 5.0,
    minTaskSuccessRate: 0.8,
  },
  targets: {
    phi: 0.5,
    memoryReuse: 0.6, // 54-60% from research
    errorRate: 0.01,
    surprise: 2.0,
    taskSuccessRate: 0.95,
  },
};

// ============================================================================
// Improvement Templates
// ============================================================================

/**
 * Pre-defined improvement patterns that can be applied
 */
const IMPROVEMENT_TEMPLATES: Record<string, (metrics: SystemMetrics) => ModificationPlan | null> = {
  /**
   * Improve φ by adjusting calculation parameters
   */
  'improve-phi': (metrics: SystemMetrics): ModificationPlan | null => {
    if (metrics.phi >= 0.3) return null;

    return {
      id: `improve-phi-${Date.now()}`,
      name: 'Improve φ calculation efficiency',
      description: 'Switch to faster approximation while maintaining accuracy',
      modifications: [{
        id: 'phi-approx',
        description: 'Use faster φ approximation',
        targetFile: 'consciousness/phi-calculator.ts',
        type: 'replace',
        search: "approximationLevel: 'exact'",
        content: "approximationLevel: 'fast'",
        reason: 'Current φ is below threshold, faster calculation enables more frequent updates',
        expectedImprovement: 'φ update frequency +50%',
      }],
      createdAt: new Date(),
    };
  },

  /**
   * Improve memory reuse by adjusting workspace parameters
   */
  'improve-memory-reuse': (metrics: SystemMetrics): ModificationPlan | null => {
    if (metrics.memoryReuse >= 0.5) return null;

    return {
      id: `improve-memory-${Date.now()}`,
      name: 'Optimize memory workspace for better reuse',
      description: 'Adjust cognitive workspace capacity to improve reuse rate',
      modifications: [{
        id: 'memory-capacity',
        description: 'Increase immediate memory capacity',
        targetFile: 'memory/cognitive-workspace.ts',
        type: 'replace',
        search: 'immediateCapacity: 8192',
        content: 'immediateCapacity: 16384',
        reason: `Memory reuse at ${(metrics.memoryReuse * 100).toFixed(1)}%, target is 54-60%`,
        expectedImprovement: 'Memory reuse +15%',
      }],
      createdAt: new Date(),
    };
  },

  /**
   * Reduce error rate by adding retry logic
   */
  'reduce-error-rate': (metrics: SystemMetrics): ModificationPlan | null => {
    if (metrics.errorRate <= 0.05) return null;

    return {
      id: `reduce-errors-${Date.now()}`,
      name: 'Add retry logic for resilience',
      description: 'Implement exponential backoff for failed operations',
      modifications: [{
        id: 'add-retry',
        description: 'Add retry wrapper to MCP calls',
        targetFile: 'mcp/resilient.ts',
        type: 'replace',
        search: 'maxRetries: 3',
        content: 'maxRetries: 5',
        reason: `Error rate at ${(metrics.errorRate * 100).toFixed(1)}%, increasing retries`,
        expectedImprovement: 'Error rate -40%',
      }],
      createdAt: new Date(),
    };
  },

  /**
   * Reduce surprise by improving prediction
   */
  'reduce-surprise': (metrics: SystemMetrics): ModificationPlan | null => {
    if (metrics.avgSurprise <= 3.0) return null;

    return {
      id: `reduce-surprise-${Date.now()}`,
      name: 'Improve world model predictions',
      description: 'Increase prediction horizon for better anticipation',
      modifications: [{
        id: 'prediction-horizon',
        description: 'Increase prediction steps',
        targetFile: 'world-model/predictor.ts',
        type: 'replace',
        search: 'predictionSteps: 5',
        content: 'predictionSteps: 10',
        reason: `Average surprise at ${metrics.avgSurprise.toFixed(2)}, improving predictions`,
        expectedImprovement: 'Surprise -25%',
      }],
      createdAt: new Date(),
    };
  },
};

// ============================================================================
// Self-Improvement Engine
// ============================================================================

export type SelfImprovementEventType =
  | 'cycle:started'
  | 'cycle:completed'
  | 'metrics:collected'
  | 'opportunity:found'
  | 'improvement:started'
  | 'improvement:success'
  | 'improvement:failed'
  | 'improvement:skipped';

export class SelfImprovementEngine extends EventEmitter {
  private config: SelfImprovementConfig;
  private darwinGodel: DarwinGodelEngine;
  private phiMonitor?: PhiMonitor;
  private cognitiveWorkspace?: CognitiveWorkspace;

  // State
  private running: boolean = false;
  private lastImprovement: Date = new Date(0);
  private improvementHistory: ImprovementResult[] = [];
  private currentMetrics: SystemMetrics | null = null;

  // Metrics collectors (injected)
  private metricsCollectors: Map<string, () => Partial<SystemMetrics>> = new Map();

  constructor(config: Partial<SelfImprovementConfig> = {}) {
    super();
    this.config = { ...DEFAULT_IMPROVEMENT_CONFIG, ...config };
    this.darwinGodel = getDarwinGodelEngine();
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Set the φ monitor for consciousness metrics
   */
  setPhiMonitor(monitor: PhiMonitor): void {
    this.phiMonitor = monitor;
  }

  /**
   * Set the cognitive workspace for memory metrics
   */
  setCognitiveWorkspace(workspace: CognitiveWorkspace): void {
    this.cognitiveWorkspace = workspace;
  }

  /**
   * Register a custom metrics collector
   */
  registerMetricsCollector(name: string, collector: () => Partial<SystemMetrics>): void {
    this.metricsCollectors.set(name, collector);
  }

  // ============================================================================
  // Main Cycle
  // ============================================================================

  /**
   * Run a single improvement cycle
   */
  async runCycle(): Promise<{
    metrics: SystemMetrics;
    opportunities: ImprovementOpportunity[];
    results: ImprovementResult[];
  }> {
    const startTime = Date.now();
    this.emit('cycle:started', { timestamp: new Date() });
    broadcastCycleStarted();
    broadcastStageChanged('observe');

    // 1. OBSERVE - Collect metrics
    const metrics = this.collectMetrics();
    this.currentMetrics = metrics;
    this.emit('metrics:collected', { metrics });
    broadcastMetricsUpdated({
      phi: metrics.phi,
      errorRate: metrics.errorRate,
      memoryReuse: metrics.memoryReuse,
      responseTime: metrics.avgResponseTime,
    });

    // 2. REFLECT - Find improvement opportunities
    broadcastStageChanged('reflect');
    const opportunities = this.findOpportunities(metrics);
    for (const opp of opportunities) {
      this.emit('opportunity:found', { opportunity: opp });
      if (opp.suggestedFix) {
        broadcastProposalCreated({
          id: opp.id,
          category: opp.category,
          target: opp.suggestedFix.modifications[0]?.targetFile || 'unknown',
          change: opp.suggestedFix.modifications[0]?.description || opp.description,
          reason: opp.description,
          expected: opp.suggestedFix.modifications[0]?.expectedImprovement || 'improvement',
          risk: 'LOW',
          reversible: true,
        });
      }
    }

    // 3. CHECK - Can we improve?
    const canImprove = this.canAttemptImprovement(metrics);
    const results: ImprovementResult[] = [];

    if (!canImprove) {
      this.emit('improvement:skipped', { reason: 'conditions not met', metrics });
      broadcastStageChanged('idle');
    } else if (!this.config.autoImprove) {
      this.emit('improvement:skipped', { reason: 'auto-improve disabled' });
      broadcastStageChanged('idle');
    } else {
      // 4. APPLY - Try improvements
      broadcastStageChanged('apply');
      const sorted = opportunities.sort((a, b) => b.priority - a.priority);
      const toApply = sorted.slice(0, this.config.maxImprovementsPerCycle);

      for (const opportunity of toApply) {
        if (opportunity.suggestedFix) {
          const result = await this.applyImprovement(opportunity, metrics);
          results.push(result);
        }
      }
    }

    broadcastStageChanged('verify');
    this.emit('cycle:completed', {
      duration: Date.now() - startTime,
      metrics,
      opportunitiesFound: opportunities.length,
      improvementsApplied: results.filter(r => r.success).length,
    });

    // Store lessons learned
    for (const result of results) {
      if (result.success) {
        broadcastLessonStored({
          id: `lesson-${Date.now()}`,
          content: `Improvement "${result.opportunityId}" succeeded`,
          type: 'positive',
          confidence: 0.8,
          category: 'performance',
        });
      } else if (result.error) {
        broadcastLessonStored({
          id: `lesson-${Date.now()}`,
          content: `Improvement "${result.opportunityId}" failed: ${result.error}`,
          type: 'negative',
          confidence: 0.9,
          category: 'errors',
        });
      }
    }

    broadcastStageChanged('idle');
    return { metrics, opportunities, results };
  }

  // ============================================================================
  // Observe - Metrics Collection
  // ============================================================================

  /**
   * Collect metrics from all systems
   */
  collectMetrics(): SystemMetrics {
    const now = new Date();

    // Base metrics
    const metrics: SystemMetrics = {
      phi: 0.3,
      consciousnessState: 'normal',
      phiTrend: 'stable',
      memoryReuse: 0.5,
      cacheHitRate: 0.7,
      memorySize: 0,
      avgResponseTime: 100,
      taskSuccessRate: 0.9,
      errorRate: 0.05,
      avgSurprise: 3.0,
      expectedFreeEnergy: 10.0,
      uptime: process.uptime() * 1000,
      cyclesCompleted: 0,
      timestamp: now,
    };

    // Get φ from monitor
    if (this.phiMonitor) {
      const level = this.phiMonitor.getCurrentLevel();
      metrics.phi = level.rawPhi;
      metrics.consciousnessState = this.phiMonitor.getState();
      metrics.phiTrend = this.phiMonitor.getTrend();
    }

    // Get memory metrics from workspace
    if (this.cognitiveWorkspace) {
      const wsMetrics = this.cognitiveWorkspace.getMetrics();
      const wsStats = this.cognitiveWorkspace.getStats();
      metrics.memoryReuse = wsMetrics.reuseRate;
      metrics.memorySize = wsStats.estimatedTokens;
    }

    // Collect from registered collectors
    for (const collector of this.metricsCollectors.values()) {
      try {
        const partial = collector();
        Object.assign(metrics, partial);
      } catch (e) {
        // Ignore collector errors
      }
    }

    return metrics;
  }

  // ============================================================================
  // Reflect - Find Opportunities
  // ============================================================================

  /**
   * Find improvement opportunities based on current metrics
   */
  findOpportunities(metrics: SystemMetrics): ImprovementOpportunity[] {
    const opportunities: ImprovementOpportunity[] = [];
    const { thresholds, targets } = this.config;

    // Check φ
    if (metrics.phi < thresholds.minPhi) {
      const plan = IMPROVEMENT_TEMPLATES['improve-phi'](metrics);
      if (plan) {
        opportunities.push({
          id: 'opp-phi',
          category: 'consciousness',
          metric: 'phi',
          currentValue: metrics.phi,
          targetValue: targets.phi,
          priority: 0.9, // High priority - consciousness is core
          description: `φ is ${metrics.phi.toFixed(3)}, below threshold ${thresholds.minPhi}`,
          suggestedFix: plan,
        });
      }
    }

    // Check memory reuse
    if (metrics.memoryReuse < thresholds.minMemoryReuse) {
      const plan = IMPROVEMENT_TEMPLATES['improve-memory-reuse'](metrics);
      if (plan) {
        opportunities.push({
          id: 'opp-memory',
          category: 'memory',
          metric: 'memoryReuse',
          currentValue: metrics.memoryReuse,
          targetValue: targets.memoryReuse,
          priority: 0.7,
          description: `Memory reuse at ${(metrics.memoryReuse * 100).toFixed(1)}%, target is ${(targets.memoryReuse * 100).toFixed(0)}%`,
          suggestedFix: plan,
        });
      }
    }

    // Check error rate
    if (metrics.errorRate > thresholds.maxErrorRate) {
      const plan = IMPROVEMENT_TEMPLATES['reduce-error-rate'](metrics);
      if (plan) {
        opportunities.push({
          id: 'opp-errors',
          category: 'reliability',
          metric: 'errorRate',
          currentValue: metrics.errorRate,
          targetValue: targets.errorRate,
          priority: 0.8,
          description: `Error rate at ${(metrics.errorRate * 100).toFixed(1)}%, above threshold ${(thresholds.maxErrorRate * 100).toFixed(0)}%`,
          suggestedFix: plan,
        });
      }
    }

    // Check surprise
    if (metrics.avgSurprise > thresholds.maxSurprise) {
      const plan = IMPROVEMENT_TEMPLATES['reduce-surprise'](metrics);
      if (plan) {
        opportunities.push({
          id: 'opp-surprise',
          category: 'performance',
          metric: 'avgSurprise',
          currentValue: metrics.avgSurprise,
          targetValue: targets.surprise,
          priority: 0.6,
          description: `Average surprise at ${metrics.avgSurprise.toFixed(2)}, above threshold ${thresholds.maxSurprise}`,
          suggestedFix: plan,
        });
      }
    }

    // Check task success rate
    if (metrics.taskSuccessRate < thresholds.minTaskSuccessRate) {
      opportunities.push({
        id: 'opp-success',
        category: 'performance',
        metric: 'taskSuccessRate',
        currentValue: metrics.taskSuccessRate,
        targetValue: targets.taskSuccessRate,
        priority: 0.75,
        description: `Task success at ${(metrics.taskSuccessRate * 100).toFixed(1)}%, below threshold ${(thresholds.minTaskSuccessRate * 100).toFixed(0)}%`,
        // No automatic fix - needs analysis
      });
    }

    return opportunities;
  }

  // ============================================================================
  // Apply - Implement Improvements
  // ============================================================================

  /**
   * Check if we can attempt an improvement
   */
  private canAttemptImprovement(metrics: SystemMetrics): boolean {
    // Check φ threshold
    if (metrics.phi < this.config.minPhiForImprovement) {
      return false;
    }

    // Check cooldown
    const timeSinceLastImprovement = Date.now() - this.lastImprovement.getTime();
    if (timeSinceLastImprovement < this.config.improvementCooldownMs) {
      return false;
    }

    // Check invariants
    const invariantContext: InvariantContext = {
      energy: 1.0, // Assume full energy for self-improvement
      dormancyThreshold: 0.1,
      isDormant: false,
      responsiveAgentCount: 1,
      totalAgentCount: 1,
    };

    const invariantResults = invariantRegistry.checkAll(invariantContext);
    const allPassed = invariantResults.every(r => r.passed);

    return allPassed;
  }

  /**
   * Apply a single improvement
   */
  private async applyImprovement(
    opportunity: ImprovementOpportunity,
    beforeMetrics: SystemMetrics
  ): Promise<ImprovementResult> {
    const startTime = Date.now();

    if (!opportunity.suggestedFix) {
      return {
        opportunityId: opportunity.id,
        applied: false,
        success: false,
        beforeMetrics,
        error: 'No suggested fix available',
        duration: Date.now() - startTime,
      };
    }

    this.emit('improvement:started', { opportunity });

    try {
      // Use Darwin-Gödel to apply
      const result = await this.darwinGodel.apply(opportunity.suggestedFix);

      if (!result.success) {
        this.emit('improvement:failed', {
          opportunity,
          errors: result.verificaton.errors,
        });

        return {
          opportunityId: opportunity.id,
          applied: false,
          success: false,
          beforeMetrics,
          error: result.verificaton.errors.join('; '),
          rollbackHash: result.rollbackHash,
          duration: Date.now() - startTime,
        };
      }

      // Collect after metrics
      const afterMetrics = this.collectMetrics();

      // Verify improvement
      const improved = this.verifyImprovement(opportunity, beforeMetrics, afterMetrics);

      this.lastImprovement = new Date();

      const improvementResult: ImprovementResult = {
        opportunityId: opportunity.id,
        applied: true,
        success: improved,
        beforeMetrics,
        afterMetrics,
        commitHash: result.commitHash,
        rollbackHash: result.rollbackHash,
        duration: Date.now() - startTime,
      };

      this.improvementHistory.push(improvementResult);

      if (improved) {
        this.emit('improvement:success', { opportunity, result: improvementResult });
        broadcastModificationApplied({
          id: opportunity.id,
          description: opportunity.description,
          commitHash: result.commitHash,
          metrics: {
            before: {
              [opportunity.metric]: beforeMetrics[opportunity.metric] as number,
            },
            after: {
              [opportunity.metric]: afterMetrics[opportunity.metric] as number,
            },
          },
        });
      } else {
        // Rollback if no improvement
        if (result.rollbackHash) {
          this.darwinGodel.rollback(result.rollbackHash);
        }
        this.emit('improvement:failed', {
          opportunity,
          reason: 'no measurable improvement',
          result: improvementResult,
        });
        broadcastModificationFailed({
          id: opportunity.id,
          description: opportunity.description,
          reason: 'no measurable improvement',
          rollbackHash: result.rollbackHash,
        });
      }

      return improvementResult;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.emit('improvement:failed', {
        opportunity,
        error: errorMsg,
      });

      return {
        opportunityId: opportunity.id,
        applied: false,
        success: false,
        beforeMetrics,
        error: errorMsg,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Verify that an improvement actually improved the metric
   */
  private verifyImprovement(
    opportunity: ImprovementOpportunity,
    before: SystemMetrics,
    after: SystemMetrics
  ): boolean {
    const metric = opportunity.metric;
    const beforeValue = before[metric] as number;
    const afterValue = after[metric] as number;
    const target = opportunity.targetValue;

    // For metrics where lower is better
    if (['errorRate', 'avgSurprise', 'expectedFreeEnergy'].includes(metric)) {
      return afterValue < beforeValue;
    }

    // For metrics where higher is better
    return afterValue > beforeValue;
  }

  // ============================================================================
  // Stats
  // ============================================================================

  /**
   * Get improvement statistics
   */
  stats(): {
    totalAttempts: number;
    successfulImprovements: number;
    failedImprovements: number;
    successRate: number;
    lastImprovement: Date | null;
    currentMetrics: SystemMetrics | null;
  } {
    const total = this.improvementHistory.length;
    const successful = this.improvementHistory.filter(r => r.success).length;

    return {
      totalAttempts: total,
      successfulImprovements: successful,
      failedImprovements: total - successful,
      successRate: total > 0 ? successful / total : 0,
      lastImprovement: this.lastImprovement.getTime() > 0 ? this.lastImprovement : null,
      currentMetrics: this.currentMetrics,
    };
  }

  /**
   * Get improvement history
   */
  getHistory(): ImprovementResult[] {
    return [...this.improvementHistory];
  }

  /**
   * Get current configuration
   */
  getConfig(): SelfImprovementConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(partial: Partial<SelfImprovementConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  /**
   * Enable/disable auto-improvement
   */
  setAutoImprove(enabled: boolean): void {
    this.config.autoImprove = enabled;
  }
}

// ============================================================================
// Factory
// ============================================================================

let improvementInstance: SelfImprovementEngine | null = null;

export function getSelfImprovementEngine(
  config?: Partial<SelfImprovementConfig>
): SelfImprovementEngine {
  if (!improvementInstance) {
    improvementInstance = new SelfImprovementEngine(config);
  }
  return improvementInstance;
}

export function resetSelfImprovementEngine(): void {
  improvementInstance = null;
}

export function createSelfImprovementEngine(
  config?: Partial<SelfImprovementConfig>
): SelfImprovementEngine {
  return new SelfImprovementEngine(config);
}
