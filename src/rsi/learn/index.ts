/**
 * Genesis RSI - LEARN Subsystem
 *
 * Records and learns from improvement outcomes through:
 * - Metric tracking (before/after comparison)
 * - Outcome classification (success/failure analysis)
 * - Procedural memory updates
 * - Strategy adjustment
 * - Knowledge consolidation
 *
 * @module rsi/learn
 */

import { randomUUID } from 'crypto';
import {
  ImprovementPlan, ImplementationResult, DeploymentResult,
  LearningOutcome, MetricDelta, ProceduralMemoryUpdate, StrategyAdjustment,
  RSIConfig, RSICycle
} from '../types.js';
import { getMemorySystem } from '../../memory/index.js';
import { getConsciousnessSystem } from '../../consciousness/index.js';
import { getObservationEngine } from '../observe/index.js';
import { getMCPClient } from '../../mcp/index.js';

// =============================================================================
// METRIC TRACKER
// =============================================================================

export class MetricTracker {
  private baselineMetrics: Map<string, number> = new Map();
  private config: Partial<RSIConfig>;

  constructor(config: Partial<RSIConfig> = {}) {
    this.config = config;
  }

  /**
   * Capture baseline metrics before improvement
   */
  captureBaseline(): void {
    const metrics = this.collectMetrics();
    for (const [key, value] of Object.entries(metrics)) {
      this.baselineMetrics.set(key, value);
    }
    console.log(`[RSI Learn] Captured baseline: ${this.baselineMetrics.size} metrics`);
  }

  /**
   * Compare current metrics to baseline
   */
  computeDeltas(): MetricDelta[] {
    const current = this.collectMetrics();
    const deltas: MetricDelta[] = [];

    for (const [key, afterValue] of Object.entries(current)) {
      const beforeValue = this.baselineMetrics.get(key) || 0;
      const delta = afterValue - beforeValue;

      // Determine if improvement (depends on metric)
      const improved = this.isImprovement(key, delta);

      deltas.push({
        metric: key,
        before: beforeValue,
        after: afterValue,
        delta,
        improved,
      });
    }

    return deltas;
  }

  private collectMetrics(): Record<string, number> {
    const metrics: Record<string, number> = {};

    // Consciousness metrics
    const consciousness = getConsciousnessSystem();
    const level = consciousness.getCurrentLevel();
    metrics['phi'] = level.rawPhi;

    // Memory metrics
    const memory = process.memoryUsage();
    metrics['heapUsedMB'] = memory.heapUsed / 1048576;
    metrics['heapRatio'] = memory.heapUsed / memory.heapTotal;

    // Performance metrics (from observation engine)
    try {
      const observeEngine = getObservationEngine();
      const perfMetrics = observeEngine.getCurrentMetrics();
      metrics['freeEnergy'] = perfMetrics.freeEnergy;
      metrics['memoryReuse'] = perfMetrics.memoryReuse;
      metrics['uptimeHours'] = perfMetrics.uptimeHours;
    } catch { /* observation engine not available */ }

    // Memory system counts
    try {
      const memSystem = getMemorySystem();
      metrics['episodicCount'] = memSystem.episodic.count();
      metrics['semanticCount'] = memSystem.semantic.count();
      metrics['proceduralCount'] = memSystem.procedural.count();
    } catch { /* memory system not available */ }

    return metrics;
  }

  private isImprovement(metric: string, delta: number): boolean {
    // Higher is better for these metrics
    const higherIsBetter = ['phi', 'memoryReuse', 'semanticCount', 'proceduralCount'];

    // Lower is better for these metrics
    const lowerIsBetter = ['heapUsedMB', 'heapRatio', 'freeEnergy'];

    if (higherIsBetter.includes(metric)) {
      return delta > 0;
    }
    if (lowerIsBetter.includes(metric)) {
      return delta < 0;
    }

    // Neutral for others
    return Math.abs(delta) < 0.01;
  }
}

// =============================================================================
// OUTCOME ANALYZER
// =============================================================================

export class OutcomeAnalyzer {
  /**
   * Analyze the outcome of an improvement attempt
   */
  analyze(
    plan: ImprovementPlan,
    implementation: ImplementationResult,
    deployment: DeploymentResult,
    metricDeltas: MetricDelta[]
  ): {
    success: boolean;
    lessonsLearned: string[];
    failureReasons?: string[];
  } {
    const lessonsLearned: string[] = [];
    const failureReasons: string[] = [];
    let success = true;

    // Check implementation success
    if (!implementation.success) {
      success = false;
      failureReasons.push(`Implementation failed: ${implementation.error}`);

      // Learn from build failures
      if (!implementation.buildResult.success) {
        lessonsLearned.push(`Build errors in plan ${plan.id}: ${implementation.buildResult.errors.slice(0, 2).join(', ')}`);
      }

      // Learn from test failures
      if (implementation.testResult.failed > 0) {
        lessonsLearned.push(`${implementation.testResult.failed} tests failed - need better test coverage`);
      }

      // Learn from invariant violations
      if (!implementation.invariantResult.allPassed) {
        const violations = implementation.invariantResult.results.filter(r => !r.passed);
        lessonsLearned.push(`Invariant violations: ${violations.map(v => v.id).join(', ')}`);
      }
    }

    // Check deployment success
    if (!deployment.success) {
      success = false;
      failureReasons.push(`Deployment failed: ${deployment.error}`);
    }

    // Check merge status
    if (deployment.mergeStatus === 'merge-conflict') {
      success = false;
      failureReasons.push('Merge conflict - changes may overlap with other work');
      lessonsLearned.push('Consider smaller, more focused changes to avoid conflicts');
    }

    // Analyze metric improvements
    const improvements = metricDeltas.filter(d => d.improved);
    const regressions = metricDeltas.filter(d => !d.improved && Math.abs(d.delta) > 0.01);

    if (improvements.length > 0) {
      lessonsLearned.push(`Improved metrics: ${improvements.map(d => `${d.metric} (+${d.delta.toFixed(3)})`).join(', ')}`);
    }

    if (regressions.length > 0) {
      lessonsLearned.push(`Regressed metrics: ${regressions.map(d => `${d.metric} (${d.delta.toFixed(3)})`).join(', ')}`);

      // Check for significant regressions
      for (const r of regressions) {
        if (r.metric === 'phi' && r.delta < -0.1) {
          success = false;
          failureReasons.push(`Critical φ regression: ${r.delta.toFixed(3)}`);
        }
        if (r.metric === 'heapRatio' && r.delta > 0.1) {
          lessonsLearned.push('Memory usage increased significantly - monitor for leaks');
        }
      }
    }

    // Success lessons
    if (success) {
      lessonsLearned.push(`Successfully addressed ${plan.targetLimitation?.type || 'improvement'} with ${plan.changes.length} changes`);

      // Learn what worked
      if (plan.safetyAnalysis.riskLevel === 'low') {
        lessonsLearned.push('Low-risk changes can be safely auto-merged');
      }
    }

    return { success, lessonsLearned, failureReasons };
  }
}

// =============================================================================
// PROCEDURAL MEMORY UPDATER
// =============================================================================

export class ProceduralMemoryUpdater {
  private memory = getMemorySystem();

  /**
   * Update procedural memory based on learning
   */
  async update(
    plan: ImprovementPlan,
    success: boolean,
    lessonsLearned: string[]
  ): Promise<ProceduralMemoryUpdate | undefined> {
    if (!success) {
      // Record failure procedure to avoid via learnSkill
      const name = `avoid-${plan.id.slice(0, 8)}`;
      this.memory.learnSkill({
        name,
        description: `Failed improvement attempt: ${plan.description}`,
        steps: lessonsLearned.map(l => ({ action: l })),
      });

      return {
        type: 'add',
        procedureId: name,
        description: 'Recorded failure pattern to avoid',
        steps: lessonsLearned,
      };
    }

    // Record successful procedure via learnSkill
    const name = `success-${plan.targetLimitation?.type || plan.targetOpportunity?.type || 'improvement'}-${Date.now()}`;
    const steps = [
      `Type: ${plan.changes.map(c => c.type).join(', ')}`,
      `Files: ${plan.changes.map(c => c.file).join(', ')}`,
      `Risk: ${plan.safetyAnalysis.riskLevel}`,
      ...lessonsLearned,
    ];

    this.memory.learnSkill({
      name,
      description: `Successful: ${plan.description}`,
      steps: steps.map(s => ({ action: s })),
    });

    return {
      type: 'add',
      procedureId: name,
      description: 'Recorded successful improvement procedure',
      steps,
    };
  }
}

// =============================================================================
// STRATEGY ADJUSTER
// =============================================================================

export class StrategyAdjuster {
  private config: RSIConfig;

  constructor(config: RSIConfig) {
    this.config = config;
  }

  /**
   * Adjust RSI strategy based on outcomes
   */
  adjust(
    outcomes: LearningOutcome[]
  ): StrategyAdjustment[] {
    const adjustments: StrategyAdjustment[] = [];
    const recentOutcomes = outcomes.slice(-10);

    if (recentOutcomes.length < 3) {
      return adjustments; // Not enough data
    }

    // Calculate success rate
    const successRate = recentOutcomes.filter(o => o.success).length / recentOutcomes.length;

    // Adjust risk threshold based on success rate
    if (successRate < 0.3) {
      // Too many failures - be more conservative
      const currentThreshold = this.config.maxRiskLevel;
      const newThreshold = this.lowerRiskThreshold(currentThreshold);

      if (newThreshold !== currentThreshold) {
        adjustments.push({
          component: 'RSIConfig',
          adjustmentType: 'threshold',
          before: currentThreshold,
          after: newThreshold,
          reason: `Low success rate (${(successRate * 100).toFixed(0)}%) - being more conservative`,
        });
      }
    } else if (successRate > 0.8) {
      // High success - can be slightly more aggressive
      const currentThreshold = this.config.maxRiskLevel;
      const newThreshold = this.raiseRiskThreshold(currentThreshold);

      if (newThreshold !== currentThreshold) {
        adjustments.push({
          component: 'RSIConfig',
          adjustmentType: 'threshold',
          before: currentThreshold,
          after: newThreshold,
          reason: `High success rate (${(successRate * 100).toFixed(0)}%) - increasing confidence`,
        });
      }
    }

    // Adjust max changes based on outcomes
    const avgChanges = recentOutcomes.reduce((s, o) => s + (o.metricsImprovement.length || 1), 0) / recentOutcomes.length;
    if (avgChanges < 2 && this.config.maxChangesPerPlan > 3) {
      adjustments.push({
        component: 'RSIConfig',
        adjustmentType: 'parameter',
        before: this.config.maxChangesPerPlan,
        after: Math.max(3, this.config.maxChangesPerPlan - 1),
        reason: 'Reducing max changes per plan for more focused improvements',
      });
    }

    return adjustments;
  }

  private lowerRiskThreshold(current: RSIConfig['maxRiskLevel']): RSIConfig['maxRiskLevel'] {
    const levels: RSIConfig['maxRiskLevel'][] = ['low', 'medium', 'high', 'critical'];
    const idx = levels.indexOf(current);
    return levels[Math.max(0, idx - 1)];
  }

  private raiseRiskThreshold(current: RSIConfig['maxRiskLevel']): RSIConfig['maxRiskLevel'] {
    const levels: RSIConfig['maxRiskLevel'][] = ['low', 'medium', 'high', 'critical'];
    const idx = levels.indexOf(current);
    return levels[Math.min(levels.length - 1, idx + 1)];
  }
}

// =============================================================================
// MCP MEMORY INTEGRATION
// =============================================================================

export class MCPMemoryIntegration {
  private mcp = getMCPClient();

  /**
   * Record learning outcome in MCP memory graph
   */
  async recordInGraph(outcome: LearningOutcome): Promise<void> {
    try {
      // Create learning outcome entity
      await this.mcp.call('memory', 'create_entities', {
        entities: [{
          name: `Learning-${outcome.planId.slice(0, 8)}`,
          entityType: 'LearningOutcome',
          observations: [
            `Success: ${outcome.success}`,
            `Metrics improved: ${outcome.metricsImprovement.filter(m => m.improved).length}`,
            `Lessons: ${outcome.lessonsLearned.slice(0, 3).join('; ')}`,
            `Recorded: ${outcome.recordedAt.toISOString()}`,
          ],
        }],
      });

      // Link to Genesis
      await this.mcp.call('memory', 'create_relations', {
        relations: [{
          from: 'Genesis',
          to: `Learning-${outcome.planId.slice(0, 8)}`,
          relationType: 'learned',
        }],
      });
    } catch (error) {
      console.log(`[RSI Learn] Failed to record in MCP memory: ${error}`);
    }
  }
}

// =============================================================================
// LEARNING ENGINE
// =============================================================================

export class LearningEngine {
  private metricTracker: MetricTracker;
  private outcomeAnalyzer: OutcomeAnalyzer;
  private proceduralUpdater: ProceduralMemoryUpdater;
  private strategyAdjuster: StrategyAdjuster;
  private mcpMemory: MCPMemoryIntegration;
  private outcomes: LearningOutcome[] = [];
  private config: RSIConfig;

  constructor(config: RSIConfig) {
    this.config = config;
    this.metricTracker = new MetricTracker(config);
    this.outcomeAnalyzer = new OutcomeAnalyzer();
    this.proceduralUpdater = new ProceduralMemoryUpdater();
    this.strategyAdjuster = new StrategyAdjuster(config);
    this.mcpMemory = new MCPMemoryIntegration();
  }

  /**
   * Capture baseline before starting improvement
   */
  captureBaseline(): void {
    this.metricTracker.captureBaseline();
  }

  /**
   * Learn from an improvement cycle
   */
  async learn(
    plan: ImprovementPlan,
    implementation: ImplementationResult,
    deployment: DeploymentResult
  ): Promise<LearningOutcome> {
    console.log(`[RSI Learn] Learning from plan: ${plan.id}`);

    // 1. Compute metric deltas
    const metricDeltas = this.metricTracker.computeDeltas();

    // 2. Analyze outcome
    const analysis = this.outcomeAnalyzer.analyze(plan, implementation, deployment, metricDeltas);

    // 3. Update procedural memory
    const proceduralUpdate = await this.proceduralUpdater.update(
      plan,
      analysis.success,
      analysis.lessonsLearned
    );

    // 4. Compute strategy adjustments
    const strategyAdjustments = this.strategyAdjuster.adjust(this.outcomes);

    // 5. Build learning outcome
    const outcome: LearningOutcome = {
      planId: plan.id,
      success: analysis.success,
      metricsImprovement: metricDeltas,
      lessonsLearned: analysis.lessonsLearned,
      proceduralUpdate,
      strategyAdjustment: strategyAdjustments[0], // Take first adjustment if any
      recordedAt: new Date(),
    };

    // 6. Store outcome
    this.outcomes.push(outcome);
    if (this.outcomes.length > 100) {
      this.outcomes.shift();
    }

    // 7. Record in MCP memory
    await this.mcpMemory.recordInGraph(outcome);

    // 8. Log summary
    console.log(`[RSI Learn] Outcome: ${analysis.success ? 'SUCCESS' : 'FAILURE'}`);
    console.log(`[RSI Learn] Metrics: ${metricDeltas.filter(d => d.improved).length}/${metricDeltas.length} improved`);
    console.log(`[RSI Learn] Lessons: ${analysis.lessonsLearned.length}`);

    return outcome;
  }

  /**
   * Get learning statistics
   */
  getStats(): {
    totalOutcomes: number;
    successRate: number;
    averageImprovement: number;
    topLessons: string[];
  } {
    const total = this.outcomes.length;
    const successes = this.outcomes.filter(o => o.success).length;

    // Compute average metric improvement
    let totalImprovement = 0;
    let improvementCount = 0;
    for (const outcome of this.outcomes) {
      for (const delta of outcome.metricsImprovement) {
        if (delta.improved) {
          totalImprovement += Math.abs(delta.delta);
          improvementCount++;
        }
      }
    }

    // Collect all lessons
    const allLessons = this.outcomes.flatMap(o => o.lessonsLearned);
    const lessonCounts = new Map<string, number>();
    for (const lesson of allLessons) {
      lessonCounts.set(lesson, (lessonCounts.get(lesson) || 0) + 1);
    }
    const topLessons = [...lessonCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([lesson]) => lesson);

    return {
      totalOutcomes: total,
      successRate: total > 0 ? successes / total : 0,
      averageImprovement: improvementCount > 0 ? totalImprovement / improvementCount : 0,
      topLessons,
    };
  }

  /**
   * Get all outcomes
   */
  getOutcomes(): LearningOutcome[] {
    return [...this.outcomes];
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let learningEngineInstance: LearningEngine | null = null;

export function getLearningEngine(config: RSIConfig): LearningEngine {
  if (!learningEngineInstance) {
    learningEngineInstance = new LearningEngine(config);
  }
  return learningEngineInstance;
}

export function resetLearningEngine(): void {
  learningEngineInstance = null;
}
