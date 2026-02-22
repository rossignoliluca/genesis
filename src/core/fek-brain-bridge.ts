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

import { estimateComplexity } from '../thinking/budget-forcing.js';
import { createPublisher } from '../bus/index.js';

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
// Phi Gate Thresholds
// ============================================================================

/**
 * Below this phi: consciousness is degraded.
 * Complex strategies (tree_of_thought, graph_of_thought, super_correct, mcts, ultimate)
 * are suppressed and forced to 'sequential'.
 */
const PHI_DEGRADED_THRESHOLD = 0.3;

/**
 * Above this phi: consciousness is elevated.
 * Creative strategies are permitted and token budgets are scaled up.
 */
const PHI_ELEVATED_THRESHOLD = 0.7;

/** Strategies that require adequate consciousness to run */
const COMPLEX_STRATEGIES: ReadonlySet<ThinkingStrategy> = new Set([
  'tree_of_thought',
  'graph_of_thought',
  'super_correct',
  'mcts',
  'ultimate',
]);

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
 * Estimate query complexity using the budget-forcing module's algorithm.
 * Delegates to estimateComplexity() to avoid duplication.
 */
function estimateQueryComplexity(query: string): number {
  return estimateComplexity(query).score;
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

  // Phase 10: IIT phi provider — injected from ConsciousnessSystem
  private phiProvider: (() => number) | null = null;

  // Debounce the degraded event: only emit once per state transition
  private lastPhiGateState: 'degraded' | 'normal' | 'elevated' | null = null;

  private readonly publisher = createPublisher('fek-brain-bridge');

  constructor(fek?: { cycle: (obs: any) => any; getTotalFE?: () => number }) {
    this.fek = fek || null;
  }

  /**
   * Phase 10: Wire the IIT phi provider so the bridge can gate strategy
   * selection based on consciousness level.
   *
   * Call this once after ConsciousnessSystem.start():
   *   bridge.setPhiProvider(() => consciousness.getSnapshot()?.phi.phi ?? 0.5);
   */
  setPhiProvider(provider: () => number): void {
    this.phiProvider = provider;
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
    // Default 0.1 = calm/low-uncertainty when no FEK; query complexity drives strategy
    let freeEnergy = 0.1;
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
    let strategy = selectStrategy(
      freeEnergy,
      queryComplexity,
      currentState.hasContext || false,
      this.successRate > 0.7
    );

    // Phase 10: Apply IIT phi gating — consciousness level modulates strategy
    let phiRationale = '';
    if (this.phiProvider) {
      const phi = this.phiProvider();

      if (phi < PHI_DEGRADED_THRESHOLD) {
        // Degraded consciousness: suppress complex strategies
        if (COMPLEX_STRATEGIES.has(strategy)) {
          const suppressed = strategy;
          strategy = 'sequential';

          console.debug(
            `[FEKBrainBridge] phi=${phi.toFixed(3)} < ${PHI_DEGRADED_THRESHOLD} — ` +
            `forcing sequential (suppressed ${suppressed})`
          );

          // Emit bus event on state transition (not every call)
          if (this.lastPhiGateState !== 'degraded') {
            this.lastPhiGateState = 'degraded';
            try {
              this.publisher.publish('consciousness.phi.degraded', {
                phi,
                threshold: PHI_DEGRADED_THRESHOLD,
                suppressedStrategy: suppressed,
                substitutedStrategy: 'sequential',
                precision: 0.9,
              });
            } catch {
              // Bus may not be initialized during early boot — non-fatal
            }
          }
        }

        phiRationale = `, phi=${phi.toFixed(3)}[DEGRADED→sequential]`;

      } else if (phi > PHI_ELEVATED_THRESHOLD) {
        // Elevated consciousness: allow expensive strategies, no suppression needed
        if (this.lastPhiGateState !== 'elevated') {
          this.lastPhiGateState = 'elevated';
          console.debug(
            `[FEKBrainBridge] phi=${phi.toFixed(3)} > ${PHI_ELEVATED_THRESHOLD} — ` +
            `elevated consciousness, strategy=${strategy} permitted`
          );
        }
        phiRationale = `, phi=${phi.toFixed(3)}[ELEVATED]`;

      } else {
        // Normal range: clear gate state
        if (this.lastPhiGateState !== 'normal') {
          this.lastPhiGateState = 'normal';
        }
        phiRationale = `, phi=${phi.toFixed(3)}`;
      }
    }

    // 4. Determine module routing
    const nextModule = strategyToModule(strategy, currentState.hasMetacognition || false);

    // 5. Compute urgency from FEK L2
    const urgency = Math.min(1, freeEnergy * 0.8 + queryComplexity * 0.2);

    // 6. Confidence calibration from FEK L4 prediction accuracy
    const confidenceCalibration = this.successRate > 0.5
      ? 1.0
      : 0.8; // Lower confidence if recent failures

    // 7. Token budget — scale up when consciousness is elevated
    let tokenBudget = computeTokenBudget(strategy, queryComplexity);
    if (this.phiProvider) {
      const phi = this.phiProvider();
      if (phi > PHI_ELEVATED_THRESHOLD) {
        // Elevated phi: scale token budget up by up to 50%
        const scale = 1 + (phi - PHI_ELEVATED_THRESHOLD) / (1 - PHI_ELEVATED_THRESHOLD) * 0.5;
        tokenBudget = {
          min: Math.round(tokenBudget.min * scale),
          target: Math.round(tokenBudget.target * scale),
          max: Math.round(tokenBudget.max * scale),
          budgetForcing: tokenBudget.budgetForcing,
        };
      }
    }

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
        `budget=${tokenBudget.target}tok, forcing=${tokenBudget.budgetForcing}` +
        phiRationale,
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
