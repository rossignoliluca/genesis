/**
 * Genesis 6.0 - φ-Aware Decision Making
 *
 * Decision-making that takes consciousness level into account.
 *
 * Key principle: When consciousness (φ) is low, the system should:
 * - Defer important decisions to humans
 * - Reduce action scope
 * - Focus on recovery
 * - Log uncertainty
 *
 * This implements a form of "cognitive humility" where the system
 * knows when it doesn't know.
 *
 * Usage:
 * ```typescript
 * import { createPhiDecisionMaker } from './consciousness/phi-decisions.js';
 *
 * const decider = createPhiDecisionMaker({
 *   phiThreshold: 0.3,
 *   deferToHuman: true,
 * });
 *
 * // Weight options by consciousness
 * const weighted = decider.weightByPhi(options);
 *
 * // Check if should defer
 * if (decider.shouldDefer()) {
 *   return askHuman(question);
 * }
 *
 * // Make a φ-aware decision
 * const decision = decider.decide(options);
 * ```
 */

import {
  ConsciousnessLevel,
  ConsciousnessState,
} from './types.js';
import { PhiMonitor } from './phi-monitor.js';

// ============================================================================
// Types
// ============================================================================

export interface DecisionOption {
  id: string;
  label: string;
  description?: string;
  risk: number;              // 0 = safe, 1 = risky
  reversibility: number;     // 0 = irreversible, 1 = fully reversible
  urgency: number;           // 0 = can wait, 1 = urgent
  confidence: number;        // How confident are we in this option?
  data?: unknown;
}

export interface WeightedOption extends DecisionOption {
  phiWeight: number;         // Weight based on consciousness level
  finalScore: number;        // Combined score
  recommended: boolean;
}

export interface Decision {
  id: string;
  options: WeightedOption[];
  selected: WeightedOption | null;
  deferred: boolean;
  deferReason?: string;
  phiAtDecision: number;
  stateAtDecision: ConsciousnessState;
  timestamp: Date;
  reasoning: string[];
}

export interface PhiSnapshot {
  phi: number;
  state: ConsciousnessState;
  shouldDefer: boolean;
  riskTolerance: number;
  timestamp: Date;
}

// ============================================================================
// Configuration
// ============================================================================

export interface PhiDecisionConfig {
  phiThreshold: number;              // Below this, defer decisions
  deferToHuman: boolean;             // Whether to defer to humans
  riskAversion: number;              // 0 = risk-seeking, 1 = risk-averse
  minConfidenceForAction: number;    // Min confidence to act
  logDecisions: boolean;             // Log all decisions
  urgencyOverride: number;           // Urgency level that overrides deferral
}

export const DEFAULT_PHI_DECISION_CONFIG: PhiDecisionConfig = {
  phiThreshold: 0.3,
  deferToHuman: true,
  riskAversion: 0.6,
  minConfidenceForAction: 0.5,
  logDecisions: true,
  urgencyOverride: 0.9,
};

// ============================================================================
// φ-Aware Decision Maker
// ============================================================================

export type DecisionEventType =
  | 'decision_made'
  | 'decision_deferred'
  | 'options_weighted'
  | 'risk_rejected';

export type DecisionEventHandler = (event: {
  type: DecisionEventType;
  data?: unknown;
}) => void;

export class PhiDecisionMaker {
  private config: PhiDecisionConfig;
  private monitor: PhiMonitor | null = null;
  private currentPhi: number = 0.5;
  private currentState: ConsciousnessState = 'aware';
  private decisions: Decision[] = [];
  private eventHandlers: Set<DecisionEventHandler> = new Set();

  constructor(config: Partial<PhiDecisionConfig> = {}) {
    this.config = { ...DEFAULT_PHI_DECISION_CONFIG, ...config };
  }

  /**
   * Set the φ monitor to track
   */
  setMonitor(monitor: PhiMonitor): void {
    this.monitor = monitor;
  }

  /**
   * Update current φ level (if not using monitor)
   */
  updatePhi(phi: number, state: ConsciousnessState): void {
    this.currentPhi = phi;
    this.currentState = state;
  }

  // ============================================================================
  // Decision Making
  // ============================================================================

  /**
   * Make a φ-aware decision
   */
  decide(options: DecisionOption[]): Decision {
    // Get current consciousness level
    this.syncWithMonitor();

    const now = new Date();
    const reasoning: string[] = [];

    // Weight options
    const weighted = this.weightByPhi(options);
    reasoning.push(`Weighted ${options.length} options at φ=${this.currentPhi.toFixed(2)}`);

    // Check if should defer
    const urgentOptions = options.filter((o) => o.urgency >= this.config.urgencyOverride);
    const shouldDeferDecision = this.shouldDefer() && urgentOptions.length === 0;

    if (shouldDeferDecision) {
      reasoning.push('Decision deferred due to low consciousness level');

      const decision: Decision = {
        id: this.generateId(),
        options: weighted,
        selected: null,
        deferred: true,
        deferReason: this.getDeferReason(),
        phiAtDecision: this.currentPhi,
        stateAtDecision: this.currentState,
        timestamp: now,
        reasoning,
      };

      this.recordDecision(decision);
      this.emit({ type: 'decision_deferred', data: decision });
      return decision;
    }

    // Select best option
    const selected = this.selectBest(weighted, reasoning);

    const decision: Decision = {
      id: this.generateId(),
      options: weighted,
      selected,
      deferred: false,
      phiAtDecision: this.currentPhi,
      stateAtDecision: this.currentState,
      timestamp: now,
      reasoning,
    };

    this.recordDecision(decision);
    this.emit({ type: 'decision_made', data: decision });

    return decision;
  }

  /**
   * Weight options by consciousness level
   */
  weightByPhi(options: DecisionOption[]): WeightedOption[] {
    this.syncWithMonitor();

    const weighted = options.map((option) => {
      // Calculate phi weight
      const phiWeight = this.calculatePhiWeight(option);

      // Calculate final score
      const finalScore = this.calculateFinalScore(option, phiWeight);

      return {
        ...option,
        phiWeight,
        finalScore,
        recommended: false,
      };
    });

    // Mark recommended
    if (weighted.length > 0) {
      weighted.sort((a, b) => b.finalScore - a.finalScore);
      weighted[0].recommended = true;
    }

    this.emit({ type: 'options_weighted', data: weighted });

    return weighted;
  }

  /**
   * Calculate weight based on φ and option properties
   */
  private calculatePhiWeight(option: DecisionOption): number {
    // Risk adjustment: lower φ = more risk aversion
    const riskAdjustment = 1 - (option.risk * (1 - this.currentPhi) * this.config.riskAversion);

    // Reversibility bonus: prefer reversible actions at low φ
    const reversibilityBonus = option.reversibility * (1 - this.currentPhi) * 0.3;

    // Urgency factor: urgent items get boosted
    const urgencyFactor = option.urgency * 0.2;

    // Confidence factor
    const confidenceFactor = option.confidence;

    return Math.min(1, Math.max(0,
      0.3 * riskAdjustment +
      0.2 * reversibilityBonus +
      0.2 * urgencyFactor +
      0.3 * confidenceFactor
    ));
  }

  /**
   * Calculate final score
   */
  private calculateFinalScore(option: DecisionOption, phiWeight: number): number {
    // Base score from option confidence
    let score = option.confidence;

    // Apply phi weight
    score *= phiWeight;

    // Penalize risky options at low φ
    if (this.currentPhi < 0.5) {
      score -= option.risk * (0.5 - this.currentPhi);
    }

    // Boost reversible options
    score += option.reversibility * 0.1;

    return Math.min(1, Math.max(0, score));
  }

  /**
   * Select the best option
   */
  private selectBest(options: WeightedOption[], reasoning: string[]): WeightedOption | null {
    if (options.length === 0) {
      reasoning.push('No options available');
      return null;
    }

    // Sort by final score
    const sorted = [...options].sort((a, b) => b.finalScore - a.finalScore);
    const best = sorted[0];

    // Check minimum confidence
    if (best.confidence < this.config.minConfidenceForAction) {
      reasoning.push(`Best option confidence (${best.confidence.toFixed(2)}) below threshold`);

      // Fall back to safest option
      const safest = [...options].sort((a, b) => {
        const safetyA = a.reversibility * (1 - a.risk);
        const safetyB = b.reversibility * (1 - b.risk);
        return safetyB - safetyA;
      })[0];

      reasoning.push(`Selected safest option: ${safest.label}`);
      return safest;
    }

    // Check risk threshold
    if (best.risk > 0.8 && this.currentPhi < 0.5) {
      reasoning.push(`Rejected high-risk option at low φ`);
      this.emit({ type: 'risk_rejected', data: best });

      // Find next best non-high-risk option
      const safer = sorted.find((o) => o.risk <= 0.8);
      if (safer) {
        reasoning.push(`Selected safer alternative: ${safer.label}`);
        return safer;
      }
    }

    reasoning.push(`Selected: ${best.label} (score: ${best.finalScore.toFixed(2)})`);
    return best;
  }

  // ============================================================================
  // Deferral Logic
  // ============================================================================

  /**
   * Should we defer this decision to a human?
   */
  shouldDefer(): boolean {
    this.syncWithMonitor();

    if (!this.config.deferToHuman) return false;

    // Defer if φ below threshold
    if (this.currentPhi < this.config.phiThreshold) return true;

    // Defer if in fragmented state
    if (this.currentState === 'fragmented') return true;

    // Defer if dormant (shouldn't be making decisions)
    if (this.currentState === 'dormant') return true;

    return false;
  }

  /**
   * Get reason for deferral
   */
  getDeferReason(): string {
    if (this.currentPhi < this.config.phiThreshold) {
      return `φ (${this.currentPhi.toFixed(2)}) below threshold (${this.config.phiThreshold})`;
    }

    if (this.currentState === 'fragmented') {
      return 'System integration compromised';
    }

    if (this.currentState === 'dormant') {
      return 'System in dormant state';
    }

    return 'Unknown deferral reason';
  }

  /**
   * Get current risk tolerance based on φ
   */
  getRiskTolerance(): number {
    this.syncWithMonitor();

    // High φ = can take more risks
    // Low φ = play it safe
    const baseTolerance = 1 - this.config.riskAversion;
    return baseTolerance * this.currentPhi;
  }

  // ============================================================================
  // State Logging
  // ============================================================================

  /**
   * Log current consciousness state for observability
   */
  logPhiState(): PhiSnapshot {
    this.syncWithMonitor();

    return {
      phi: this.currentPhi,
      state: this.currentState,
      shouldDefer: this.shouldDefer(),
      riskTolerance: this.getRiskTolerance(),
      timestamp: new Date(),
    };
  }

  // ============================================================================
  // History
  // ============================================================================

  /**
   * Get decision history
   */
  getDecisions(options: {
    limit?: number;
    deferred?: boolean;
  } = {}): Decision[] {
    let result = [...this.decisions];

    if (options.deferred !== undefined) {
      result = result.filter((d) => d.deferred === options.deferred);
    }

    // Sort by timestamp (newest first)
    result.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (options.limit) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  /**
   * Get decision by ID
   */
  getDecision(id: string): Decision | undefined {
    return this.decisions.find((d) => d.id === id);
  }

  // ============================================================================
  // Events
  // ============================================================================

  on(handler: DecisionEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: { type: DecisionEventType; data?: unknown }): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('Decision event handler error:', err);
      }
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private syncWithMonitor(): void {
    if (this.monitor) {
      const level = this.monitor.getCurrentLevel();
      this.currentPhi = level.phi;
      this.currentState = this.monitor.getState();
    }
  }

  private recordDecision(decision: Decision): void {
    if (this.config.logDecisions) {
      this.decisions.push(decision);

      // Limit history
      if (this.decisions.length > 1000) {
        this.decisions = this.decisions.slice(-1000);
      }
    }
  }

  private generateId(): string {
    return `decision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // ============================================================================
  // Stats
  // ============================================================================

  stats(): {
    totalDecisions: number;
    deferredDecisions: number;
    deferralRate: number;
    avgPhiAtDecision: number;
    recentDecisions: number;
  } {
    const total = this.decisions.length;
    const deferred = this.decisions.filter((d) => d.deferred).length;
    const avgPhi = total > 0
      ? this.decisions.reduce((sum, d) => sum + d.phiAtDecision, 0) / total
      : 0;

    const hourAgo = Date.now() - 3600000;
    const recent = this.decisions.filter((d) => d.timestamp.getTime() > hourAgo).length;

    return {
      totalDecisions: total,
      deferredDecisions: deferred,
      deferralRate: total > 0 ? deferred / total : 0,
      avgPhiAtDecision: avgPhi,
      recentDecisions: recent,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createPhiDecisionMaker(
  config?: Partial<PhiDecisionConfig>
): PhiDecisionMaker {
  return new PhiDecisionMaker(config);
}

// ============================================================================
// Option Factory
// ============================================================================

export function createDecisionOption(
  id: string,
  label: string,
  options: {
    description?: string;
    risk?: number;
    reversibility?: number;
    urgency?: number;
    confidence?: number;
    data?: unknown;
  } = {}
): DecisionOption {
  return {
    id,
    label,
    description: options.description,
    risk: options.risk ?? 0.5,
    reversibility: options.reversibility ?? 0.5,
    urgency: options.urgency ?? 0.5,
    confidence: options.confidence ?? 0.5,
    data: options.data,
  };
}
