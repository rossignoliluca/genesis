/**
 * Genesis v18.1 - Strategy Composition Engine
 *
 * Enables dynamic composition of multiple reasoning strategies.
 * Instead of selecting a single strategy (ToT OR GoT OR SuperCorrect),
 * this engine composes 2-3 complementary strategies into a pipeline
 * with budget allocation and inter-phase data flow.
 *
 * Based on analysis: metacognitive-controller.ts selects only 1 strategy.
 * This module enables hybrid approaches like:
 *   ToT (breadth) → GoT (synthesis) → PRM (verification)
 */

// ============================================================================
// Types
// ============================================================================

export type ReasoningStrategy =
  | 'sequential'
  | 'neurosymbolic'
  | 'tree_of_thought'
  | 'graph_of_thought'
  | 'super_correct'
  | 'ultimate';

export interface CompositionPhase {
  /** Strategy to execute in this phase */
  strategy: ReasoningStrategy;
  /** Budget allocation as fraction of total (0-1) */
  budget: number;
  /** Strategy-specific parameters (depth, branching, etc.) */
  parameters: Record<string, unknown>;
  /** Role of this phase in the composition */
  role: 'generate' | 'synthesize' | 'verify' | 'refine';
  /** Whether to pass output to next phase */
  chainOutput: boolean;
}

export interface CompositionPlan {
  /** Unique plan ID */
  id: string;
  /** Phases to execute in order */
  phases: CompositionPhase[];
  /** Total budget (tokens or time) */
  totalBudget: number;
  /** Composition pattern name */
  pattern: CompositionPattern;
  /** Problem complexity that triggered this composition */
  complexity: number;
  /** Phi level at plan creation */
  phi: number;
}

export type CompositionPattern =
  | 'single'           // Just one strategy (simple problems)
  | 'generate-verify'  // Generate + verify
  | 'breadth-depth'    // Broad search + deep synthesis
  | 'full-pipeline'    // Generate + synthesize + verify
  | 'adaptive';        // Dynamically adjusts based on intermediate results

export interface CompositionResult {
  plan: CompositionPlan;
  phaseResults: PhaseResult[];
  finalResponse: string;
  finalConfidence: number;
  totalTokens: number;
  totalDuration: number;
  adaptations: string[];
}

export interface PhaseResult {
  phase: CompositionPhase;
  response: string;
  confidence: number;
  tokens: number;
  duration: number;
  adapted: boolean;
}

// ============================================================================
// Composition Strategy Profiles
// ============================================================================

interface StrategyProfile {
  strengths: string[];
  weaknesses: string[];
  /** How well this strategy works for different roles */
  roleAffinity: Record<CompositionPhase['role'], number>;
  /** Typical phi requirement (0-1) */
  phiRequirement: number;
  /** Computational cost relative to sequential (1.0) */
  relativeCost: number;
}

const STRATEGY_PROFILES: Record<ReasoningStrategy, StrategyProfile> = {
  sequential: {
    strengths: ['fast', 'low-cost', 'straightforward'],
    weaknesses: ['shallow', 'single-path', 'no-verification'],
    roleAffinity: { generate: 0.7, synthesize: 0.3, verify: 0.2, refine: 0.5 },
    phiRequirement: 0.1,
    relativeCost: 1.0,
  },
  neurosymbolic: {
    strengths: ['knowledge-grounded', 'factual', 'structured'],
    weaknesses: ['slow-inference', 'limited-creativity'],
    roleAffinity: { generate: 0.6, synthesize: 0.5, verify: 0.8, refine: 0.7 },
    phiRequirement: 0.3,
    relativeCost: 1.5,
  },
  tree_of_thought: {
    strengths: ['high-breadth', 'multiple-solutions', 'exploration'],
    weaknesses: ['expensive', 'may-not-converge', 'needs-pruning'],
    roleAffinity: { generate: 0.95, synthesize: 0.3, verify: 0.4, refine: 0.3 },
    phiRequirement: 0.4,
    relativeCost: 3.0,
  },
  graph_of_thought: {
    strengths: ['aggregation', 'synthesis', 'non-linear'],
    weaknesses: ['needs-multiple-inputs', 'complex-orchestration'],
    roleAffinity: { generate: 0.5, synthesize: 0.95, verify: 0.6, refine: 0.7 },
    phiRequirement: 0.5,
    relativeCost: 2.5,
  },
  super_correct: {
    strengths: ['error-correction', 'hierarchical', 'high-precision'],
    weaknesses: ['slow', 'template-dependent', 'needs-good-initial'],
    roleAffinity: { generate: 0.4, synthesize: 0.6, verify: 0.9, refine: 0.95 },
    phiRequirement: 0.5,
    relativeCost: 2.0,
  },
  ultimate: {
    strengths: ['comprehensive', 'best-quality'],
    weaknesses: ['very-expensive', 'slow', 'overkill-for-simple'],
    roleAffinity: { generate: 0.9, synthesize: 0.9, verify: 0.9, refine: 0.9 },
    phiRequirement: 0.7,
    relativeCost: 5.0,
  },
};

// ============================================================================
// Composition Templates
// ============================================================================

/**
 * Predefined composition patterns for different complexity levels.
 * These can be overridden by learned patterns from history.
 */
const COMPOSITION_TEMPLATES: Record<CompositionPattern, (phi: number) => CompositionPhase[]> = {
  single: () => [{
    strategy: 'sequential',
    budget: 1.0,
    parameters: {},
    role: 'generate',
    chainOutput: false,
  }],

  'generate-verify': (phi) => [
    {
      strategy: phi > 0.5 ? 'tree_of_thought' : 'sequential',
      budget: 0.6,
      parameters: { maxDepth: Math.ceil(3 * phi), branchingFactor: Math.ceil(3 * phi) },
      role: 'generate',
      chainOutput: true,
    },
    {
      strategy: 'super_correct',
      budget: 0.4,
      parameters: { correctionRounds: 2 },
      role: 'verify',
      chainOutput: false,
    },
  ],

  'breadth-depth': (phi) => [
    {
      strategy: 'tree_of_thought',
      budget: 0.4,
      parameters: { maxDepth: 3, branchingFactor: Math.ceil(4 * phi) },
      role: 'generate',
      chainOutput: true,
    },
    {
      strategy: 'graph_of_thought',
      budget: 0.35,
      parameters: { aggregationK: 3 },
      role: 'synthesize',
      chainOutput: true,
    },
    {
      strategy: 'super_correct',
      budget: 0.25,
      parameters: { correctionRounds: 1 },
      role: 'verify',
      chainOutput: false,
    },
  ],

  'full-pipeline': (phi) => [
    {
      strategy: 'tree_of_thought',
      budget: 0.3,
      parameters: { maxDepth: Math.ceil(4 * phi), branchingFactor: 4 },
      role: 'generate',
      chainOutput: true,
    },
    {
      strategy: 'graph_of_thought',
      budget: 0.3,
      parameters: { aggregationK: 4 },
      role: 'synthesize',
      chainOutput: true,
    },
    {
      strategy: 'super_correct',
      budget: 0.2,
      parameters: { correctionRounds: 2 },
      role: 'refine',
      chainOutput: true,
    },
    {
      strategy: 'neurosymbolic',
      budget: 0.2,
      parameters: {},
      role: 'verify',
      chainOutput: false,
    },
  ],

  adaptive: (phi) => [
    {
      strategy: phi > 0.6 ? 'tree_of_thought' : 'sequential',
      budget: 0.5,
      parameters: { maxDepth: Math.ceil(3 * phi), branchingFactor: 3 },
      role: 'generate',
      chainOutput: true,
    },
    {
      strategy: 'graph_of_thought',
      budget: 0.3,
      parameters: { aggregationK: 3 },
      role: 'synthesize',
      chainOutput: true,
    },
    {
      strategy: 'super_correct',
      budget: 0.2,
      parameters: { correctionRounds: 1 },
      role: 'verify',
      chainOutput: false,
    },
  ],
};

// ============================================================================
// Strategy Composer
// ============================================================================

export class StrategyComposer {
  /** History of compositions and their outcomes */
  private compositionHistory: Array<{
    plan: CompositionPlan;
    outcome: { confidence: number; correctness: number; tokens: number };
    problemSignature: string;
  }> = [];

  /**
   * Create a composition plan based on problem complexity and phi.
   *
   * @param complexity - Problem complexity score (0-1)
   * @param phi - Current consciousness level (0-1)
   * @param budget - Total token budget
   * @param problemSignature - Optional problem type signature for learned patterns
   */
  compose(
    complexity: number,
    phi: number,
    budget: number = 8192,
    problemSignature?: string,
  ): CompositionPlan {
    // 1. Check learned patterns first
    if (problemSignature) {
      const learned = this.getLearnedPattern(problemSignature, complexity);
      if (learned) return learned;
    }

    // 2. Select pattern based on complexity and phi
    const pattern = this.selectPattern(complexity, phi);

    // 3. Generate phases from template
    const phases = COMPOSITION_TEMPLATES[pattern](phi);

    // 4. Filter phases that exceed phi requirements
    const feasiblePhases = phases.filter(phase => {
      const profile = STRATEGY_PROFILES[phase.strategy];
      return phi >= profile.phiRequirement;
    });

    // 5. Ensure at least one phase
    const finalPhases = feasiblePhases.length > 0 ? feasiblePhases : [phases[0]];

    // 6. Normalize budgets
    const totalBudgetFraction = finalPhases.reduce((s, p) => s + p.budget, 0);
    for (const phase of finalPhases) {
      phase.budget = phase.budget / totalBudgetFraction;
    }

    return {
      id: `comp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      phases: finalPhases,
      totalBudget: budget,
      pattern,
      complexity,
      phi,
    };
  }

  /**
   * Select the best composition pattern for the given complexity and phi.
   */
  private selectPattern(complexity: number, phi: number): CompositionPattern {
    if (complexity < 0.2) return 'single';
    if (complexity < 0.4) return 'generate-verify';
    if (complexity < 0.6) return phi > 0.5 ? 'breadth-depth' : 'generate-verify';
    if (complexity < 0.8) return phi > 0.6 ? 'full-pipeline' : 'breadth-depth';
    return phi > 0.7 ? 'full-pipeline' : 'adaptive';
  }

  /**
   * Look up learned pattern for a problem signature.
   */
  private getLearnedPattern(signature: string, complexity: number): CompositionPlan | null {
    const similar = this.compositionHistory.filter(h =>
      h.problemSignature === signature &&
      Math.abs(h.plan.complexity - complexity) < 0.15 &&
      h.outcome.correctness > 0.8
    );

    if (similar.length < 3) return null; // Not enough data

    // Find the plan that achieved highest correctness with lowest tokens
    const best = similar.sort((a, b) => {
      const scoreA = a.outcome.correctness - a.outcome.tokens / 10000;
      const scoreB = b.outcome.correctness - b.outcome.tokens / 10000;
      return scoreB - scoreA;
    })[0];

    // Return a clone of the best plan with a new ID
    return {
      ...best.plan,
      id: `comp-learned-${Date.now()}`,
    };
  }

  /**
   * Record the outcome of a composition for future learning.
   */
  recordOutcome(
    plan: CompositionPlan,
    outcome: { confidence: number; correctness: number; tokens: number },
    problemSignature: string,
  ): void {
    this.compositionHistory.push({ plan, outcome, problemSignature });

    // Keep only last 500 entries
    if (this.compositionHistory.length > 500) {
      this.compositionHistory = this.compositionHistory.slice(-500);
    }
  }

  /**
   * Get statistics about composition patterns.
   */
  getStats(): Record<CompositionPattern, { count: number; avgConfidence: number; avgTokens: number }> {
    const stats: Record<string, { count: number; totalConfidence: number; totalTokens: number }> = {};

    for (const entry of this.compositionHistory) {
      const key = entry.plan.pattern;
      if (!stats[key]) stats[key] = { count: 0, totalConfidence: 0, totalTokens: 0 };
      stats[key].count++;
      stats[key].totalConfidence += entry.outcome.confidence;
      stats[key].totalTokens += entry.outcome.tokens;
    }

    const result: Record<string, { count: number; avgConfidence: number; avgTokens: number }> = {};
    for (const [key, val] of Object.entries(stats)) {
      result[key] = {
        count: val.count,
        avgConfidence: val.count > 0 ? val.totalConfidence / val.count : 0,
        avgTokens: val.count > 0 ? val.totalTokens / val.count : 0,
      };
    }

    return result as Record<CompositionPattern, { count: number; avgConfidence: number; avgTokens: number }>;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let composerInstance: StrategyComposer | null = null;

export function getStrategyComposer(): StrategyComposer {
  if (!composerInstance) {
    composerInstance = new StrategyComposer();
  }
  return composerInstance;
}
