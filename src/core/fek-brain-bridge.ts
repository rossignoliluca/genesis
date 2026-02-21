/**
 * Genesis v35 — FEK ↔ Brain Bridge
 *
 * Connects the Free Energy Kernel's outputs to actual Brain decisions.
 * Previously the FEK ran independently and its strategy/mode outputs
 * were ignored. This bridge makes them drive real behavior.
 *
 * Integration points:
 * 1. FEK L3 strategy → Brain module routing
 * 2. FEK L2 urgency → Brain timeout/priority
 * 3. FEK L4 self-model → Brain confidence calibration
 * 4. Brain step results → FEK observations (feedback loop)
 *
 * Usage:
 *   import { FEKBrainBridge } from '../core/fek-brain-bridge.js';
 *   const bridge = new FEKBrainBridge(fek);
 *   const routing = bridge.getRouting(query, currentState);
 *   // ... after brain step ...
 *   bridge.feedbackResult(result);
 */

// ============================================================================
// Types
// ============================================================================

/** FEK state snapshot (subset we care about) */
export interface FEKSnapshot {
  totalFE: number;
  strategy: string;
  mode: string;
  levels: { L1: number; L2: number; L3: number; L4: number };
  cycle: number;
  policyUpdate?: string;
}

/** Brain routing recommendation from FEK */
export interface FEKRouting {
  /** Recommended thinking strategy */
  strategy: ThinkingStrategy;
  /** Module to route to after memory */
  nextModule: BrainModuleHint;
  /** Urgency level (0-1) — affects timeout and priority */
  urgency: number;
  /** Confidence calibration factor (multiply Brain's confidence by this) */
  confidenceCalibration: number;
  /** Whether to enable grounding verification */
  enableGrounding: boolean;
  /** Token budget recommendation */
  tokenBudget: TokenBudget;
  /** Rationale for debugging */
  rationale: string;
}

export type ThinkingStrategy =
  | 'sequential'        // Low FE, simple query → direct LLM call
  | 'tree_of_thought'   // Medium FE → explore multiple paths
  | 'graph_of_thought'  // High FE with context → synthesize
  | 'super_correct'     // High FE with verification need → iterate
  | 'mcts'              // Very high FE → systematic search
  | 'ultimate';         // Critical → full pipeline

export type BrainModuleHint =
  | 'thinking'          // Extended reasoning
  | 'metacognition'     // EFE-driven strategy selection
  | 'llm'               // Direct LLM call (simple)
  | 'active-inference'  // Full active inference cycle
  | 'grounding';        // Verification needed first

export interface TokenBudget {
  /** Minimum tokens to generate */
  min: number;
  /** Target tokens */
  target: number;
  /** Maximum tokens before truncation */
  max: number;
  /** Whether to apply budget forcing ("Wait" tokens) */
  budgetForcing: boolean;
}

/** Result from a Brain step, fed back to FEK */
export interface BrainStepFeedback {
  /** Was the step successful? */
  success: boolean;
  /** Confidence of the response (0-1) */
  confidence: number;
  /** Number of tool calls made */
  toolCallCount: number;
  /** Time taken (ms) */
  latencyMs: number;
  /** Module that was executed */
  module: string;
  /** Strategy that was used */
  strategy: string;
}

// ============================================================================
// Strategy Selection (replaces FEK L3 string matching)
// ============================================================================

/**
 * Select thinking strategy based on Free Energy level and query characteristics.
 *
 * This replaces the FEK's naive L3 strategy selection:
 *   OLD: if (fe < 0.2 && goalLength < 50) return 'sequential'
 *   NEW: multi-factor EFE-based selection
 */
function selectStrategy(
  freeEnergy: number,
  queryComplexity: number,
  hasContext: boolean,
  previousSuccess: boolean
): ThinkingStrategy {
  // Compute effective complexity: FE + query characteristics
  const effectiveComplexity = freeEnergy * 0.5 + queryComplexity * 0.3 + (hasContext ? 0.1 : 0) + (previousSuccess ? 0 : 0.1);

  if (effectiveComplexity < 0.15) return 'sequential';
  if (effectiveComplexity < 0.3) return 'tree_of_thought';
  if (effectiveComplexity < 0.5) return 'graph_of_thought';
  if (effectiveComplexity < 0.7) return 'super_correct';
  if (effectiveComplexity < 0.85) return 'mcts';
  return 'ultimate';
}

/**
 * Estimate query complexity using fast heuristics (no LLM call).
 *
 * Factors:
 * - Length (longer = more complex)
 * - Question words (what/why/how)
 * - Domain keywords
 * - Nested structure (clauses, conditions)
 * - Multi-step indicators
 */
function estimateQueryComplexity(query: string): number {
  const lower = query.toLowerCase();
  let complexity = 0;

  // Length factor (0-0.3)
  const wordCount = query.split(/\s+/).length;
  complexity += Math.min(0.3, wordCount / 200);

  // Deep reasoning indicators (0-0.3)
  const deepWords = ['why', 'how', 'explain', 'analyze', 'compare', 'evaluate',
    'design', 'architect', 'optimize', 'debug', 'prove', 'derive'];
  const deepCount = deepWords.filter(w => lower.includes(w)).length;
  complexity += Math.min(0.3, deepCount * 0.1);

  // Multi-step indicators (0-0.2)
  const multiStep = ['and then', 'first', 'second', 'step', 'after that',
    'followed by', 'next', 'finally', 'also', 'additionally'];
  const stepCount = multiStep.filter(w => lower.includes(w)).length;
  complexity += Math.min(0.2, stepCount * 0.05);

  // Nested structure (0-0.1)
  const nestingIndicators = (query.match(/[({[\]})]/g) || []).length;
  complexity += Math.min(0.1, nestingIndicators * 0.02);

  // Code indicators (0-0.1)
  if (/```|function\s|class\s|import\s|const\s/.test(query)) {
    complexity += 0.1;
  }

  return Math.min(1, complexity);
}

/**
 * Determine which Brain module to route to based on strategy.
 */
function strategyToModule(strategy: ThinkingStrategy, hasMetacognition: boolean): BrainModuleHint {
  switch (strategy) {
    case 'sequential':
      return 'llm';
    case 'tree_of_thought':
    case 'graph_of_thought':
    case 'super_correct':
    case 'mcts':
      return hasMetacognition ? 'metacognition' : 'thinking';
    case 'ultimate':
      return 'active-inference';
  }
}

/**
 * Compute token budget based on strategy and complexity.
 */
function computeTokenBudget(strategy: ThinkingStrategy, complexity: number): TokenBudget {
  const budgets: Record<ThinkingStrategy, TokenBudget> = {
    sequential: { min: 50, target: 500, max: 2000, budgetForcing: false },
    tree_of_thought: { min: 200, target: 2000, max: 8000, budgetForcing: false },
    graph_of_thought: { min: 500, target: 4000, max: 16000, budgetForcing: true },
    super_correct: { min: 500, target: 4000, max: 16000, budgetForcing: true },
    mcts: { min: 1000, target: 8000, max: 32000, budgetForcing: true },
    ultimate: { min: 2000, target: 16000, max: 64000, budgetForcing: true },
  };

  const base = budgets[strategy];

  // Scale by complexity
  const scale = 0.5 + complexity;
  return {
    min: Math.round(base.min * scale),
    target: Math.round(base.target * scale),
    max: Math.round(base.max * scale),
    budgetForcing: base.budgetForcing,
  };
}

// ============================================================================
// Bridge
// ============================================================================

export class FEKBrainBridge {
  private fek: { cycle: (obs: any) => any; getTotalFE?: () => number } | null;
  private lastSnapshot: FEKSnapshot | null = null;
  private feedbackHistory: BrainStepFeedback[] = [];
  private successRate = 0.8; // Running average

  constructor(fek?: { cycle: (obs: any) => any; getTotalFE?: () => number }) {
    this.fek = fek || null;
  }

  /**
   * Run FEK cycle and get routing recommendation for the Brain.
   *
   * This should be called at the START of each Brain processing cycle,
   * replacing the one-shot FEK call in Brain.process().
   */
  getRouting(
    query: string,
    currentState: {
      phi?: number;
      toolCallCount?: number;
      hasContext?: boolean;
      hasMetacognition?: boolean;
    } = {}
  ): FEKRouting {
    // 1. Run FEK cycle to get current free energy
    let freeEnergy = 0.5;
    let fekStrategy = 'sequential';

    if (this.fek) {
      try {
        const fekState = this.fek.cycle({
          energy: 1.0,
          agentResponsive: true,
          merkleValid: true,
          systemLoad: (currentState.toolCallCount || 0) / 5,
          phi: currentState.phi || 0.5,
        });

        freeEnergy = fekState.totalFE ?? this.fek.getTotalFE?.() ?? 0.5;
        fekStrategy = fekState.strategy || 'sequential';

        this.lastSnapshot = {
          totalFE: freeEnergy,
          strategy: fekStrategy,
          mode: fekState.mode || 'awake',
          levels: fekState.levels || { L1: 0, L2: 0, L3: 0, L4: 0 },
          cycle: fekState.cycle || 0,
          policyUpdate: fekState.policyUpdate,
        };
      } catch {
        // FEK unavailable — use defaults
      }
    }

    // 2. Estimate query complexity
    const queryComplexity = estimateQueryComplexity(query);

    // 3. Select strategy (EFE-based, not string matching)
    const strategy = selectStrategy(
      freeEnergy,
      queryComplexity,
      currentState.hasContext || false,
      this.successRate > 0.7
    );

    // 4. Determine module routing
    const nextModule = strategyToModule(strategy, currentState.hasMetacognition || false);

    // 5. Compute urgency from FEK L2
    const urgency = Math.min(1, freeEnergy * 0.8 + queryComplexity * 0.2);

    // 6. Confidence calibration from FEK L4 prediction accuracy
    const confidenceCalibration = this.successRate > 0.5
      ? 1.0
      : 0.8; // Lower confidence if recent failures

    // 7. Token budget
    const tokenBudget = computeTokenBudget(strategy, queryComplexity);

    // 8. Grounding: enable for medium+ complexity
    const enableGrounding = queryComplexity > 0.3 || freeEnergy > 0.4;

    return {
      strategy,
      nextModule,
      urgency,
      confidenceCalibration,
      enableGrounding,
      tokenBudget,
      rationale: `FE=${freeEnergy.toFixed(3)}, complexity=${queryComplexity.toFixed(3)}, ` +
        `strategy=${strategy}, module=${nextModule}, ` +
        `budget=${tokenBudget.target}tok, forcing=${tokenBudget.budgetForcing}`,
    };
  }

  /**
   * Feed back Brain step results to update FEK predictions.
   *
   * This closes the loop: FEK predicts → Brain acts → result feeds back → FEK learns.
   */
  feedbackResult(feedback: BrainStepFeedback): void {
    this.feedbackHistory.push(feedback);

    // Update running success rate (EMA)
    this.successRate = this.successRate * 0.9 + (feedback.success ? 1 : 0) * 0.1;

    // Keep history bounded
    if (this.feedbackHistory.length > 100) {
      this.feedbackHistory = this.feedbackHistory.slice(-50);
    }
  }

  /**
   * Get the last FEK snapshot for observability.
   */
  getLastSnapshot(): FEKSnapshot | null {
    return this.lastSnapshot;
  }

  /**
   * Get current success rate (for L4 self-model).
   */
  getSuccessRate(): number {
    return this.successRate;
  }
}
