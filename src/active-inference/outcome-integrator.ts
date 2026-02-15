/**
 * Genesis v32 - Outcome Integrator (Item 11)
 *
 * Closes the active inference loop by feeding tool execution outcomes
 * back into the belief system. This is THE fundamental cognitive architecture fix.
 *
 * Flow: Tool Execution → Outcome Observation → Belief Update → Policy Reselection
 */

export interface ToolOutcome {
  toolName: string;
  success: boolean;
  executionTimeMs: number;
  resultSummary: string;
  surprise: number;        // 0-1, how unexpected was the outcome
  timestamp: Date;
}

export interface BeliefUpdate {
  dimension: string;       // e.g., 'tool_reliability', 'task_complexity'
  priorValue: number;
  posteriorValue: number;
  evidence: string;
}

export class OutcomeIntegrator {
  private outcomeHistory: ToolOutcome[] = [];
  private beliefs: Map<string, number> = new Map();
  private toolReliability: Map<string, { successes: number; failures: number }> = new Map();

  constructor() {
    this.beliefs.set('environment_stability', 0.7);
    this.beliefs.set('tool_reliability', 0.8);
    this.beliefs.set('task_complexity', 0.5);
    this.beliefs.set('model_confidence', 0.6);
  }

  /**
   * Record a tool execution outcome and update beliefs via Bayesian update
   */
  recordOutcome(outcome: ToolOutcome): BeliefUpdate[] {
    this.outcomeHistory.push(outcome);
    if (this.outcomeHistory.length > 500) this.outcomeHistory.shift();

    const updates: BeliefUpdate[] = [];

    // Update tool reliability belief
    const reliability = this.toolReliability.get(outcome.toolName) || { successes: 0, failures: 0 };
    if (outcome.success) reliability.successes++;
    else reliability.failures++;
    this.toolReliability.set(outcome.toolName, reliability);

    const total = reliability.successes + reliability.failures;
    const reliabilityRate = reliability.successes / total;
    const priorReliability = this.beliefs.get('tool_reliability') || 0.8;
    const posteriorReliability = 0.8 * priorReliability + 0.2 * reliabilityRate;
    this.beliefs.set('tool_reliability', posteriorReliability);
    updates.push({
      dimension: 'tool_reliability',
      priorValue: priorReliability,
      posteriorValue: posteriorReliability,
      evidence: `${outcome.toolName}: ${outcome.success ? 'success' : 'failure'} (${reliability.successes}/${total})`,
    });

    // Update environment stability based on surprise
    if (outcome.surprise > 0.5) {
      const priorStability = this.beliefs.get('environment_stability') || 0.7;
      const posteriorStability = Math.max(0.1, priorStability - outcome.surprise * 0.1);
      this.beliefs.set('environment_stability', posteriorStability);
      updates.push({
        dimension: 'environment_stability',
        priorValue: priorStability,
        posteriorValue: posteriorStability,
        evidence: `High surprise (${outcome.surprise.toFixed(2)}) from ${outcome.toolName}`,
      });
    }

    // Update task complexity based on execution time
    const avgExecTime = this.outcomeHistory.reduce((sum, o) => sum + o.executionTimeMs, 0) / this.outcomeHistory.length;
    if (outcome.executionTimeMs > avgExecTime * 2) {
      const priorComplexity = this.beliefs.get('task_complexity') || 0.5;
      const posteriorComplexity = Math.min(1.0, priorComplexity + 0.05);
      this.beliefs.set('task_complexity', posteriorComplexity);
      updates.push({
        dimension: 'task_complexity',
        priorValue: priorComplexity,
        posteriorValue: posteriorComplexity,
        evidence: `Slow execution: ${outcome.executionTimeMs}ms vs avg ${avgExecTime.toFixed(0)}ms`,
      });
    }

    return updates;
  }

  /** Get current belief state for policy selection */
  getBeliefs(): Record<string, number> {
    return Object.fromEntries(this.beliefs);
  }

  /** Get tool-specific reliability */
  getToolReliability(toolName: string): number {
    const stats = this.toolReliability.get(toolName);
    if (!stats) return 0.5;
    const total = stats.successes + stats.failures;
    return total > 0 ? stats.successes / total : 0.5;
  }

  /** Recommend policy adjustments based on current beliefs */
  recommendPolicyAdjustment(): {
    shouldEscalateStrategy: boolean;
    shouldReduceParallelism: boolean;
    shouldIncreaseVerification: boolean;
    reason: string;
  } {
    const stability = this.beliefs.get('environment_stability') || 0.7;
    const reliability = this.beliefs.get('tool_reliability') || 0.8;
    const complexity = this.beliefs.get('task_complexity') || 0.5;

    return {
      shouldEscalateStrategy: complexity > 0.7 || reliability < 0.5,
      shouldReduceParallelism: stability < 0.4,
      shouldIncreaseVerification: reliability < 0.6,
      reason: `stability=${stability.toFixed(2)}, reliability=${reliability.toFixed(2)}, complexity=${complexity.toFixed(2)}`,
    };
  }

  /** Get outcome statistics */
  getStats(): {
    totalOutcomes: number;
    successRate: number;
    avgSurprise: number;
    avgExecutionTime: number;
  } {
    const total = this.outcomeHistory.length;
    if (total === 0) return { totalOutcomes: 0, successRate: 0, avgSurprise: 0, avgExecutionTime: 0 };

    return {
      totalOutcomes: total,
      successRate: this.outcomeHistory.filter(o => o.success).length / total,
      avgSurprise: this.outcomeHistory.reduce((s, o) => s + o.surprise, 0) / total,
      avgExecutionTime: this.outcomeHistory.reduce((s, o) => s + o.executionTimeMs, 0) / total,
    };
  }
}

// Singleton
let instance: OutcomeIntegrator | null = null;
export function getOutcomeIntegrator(): OutcomeIntegrator {
  if (!instance) instance = new OutcomeIntegrator();
  return instance;
}
