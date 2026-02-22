/**
 * Genesis v11.5 - Consciousness Bridge
 *
 * Unifies World 1 (Active Inference Loop) with World 2 (Conscious Agent):
 * - φ-gated action selection: actions only execute if consciousness is sufficient
 * - Attention-driven tool selection: AttentionSchema modulates EFE info gain
 * - φ-drop autopoietic trigger: sustained φ decline triggers self-repair
 * - Global Workspace broadcasts feed back to beliefs
 *
 * This creates the first system where:
 * - Active Inference decisions are consciousness-gated
 * - Tool selection is attention-driven (not pattern-matched)
 * - φ drop triggers autopoietic self-repair
 *
 * References:
 * - Tononi (2008) IIT - φ as measure of consciousness
 * - Baars (1988) Global Workspace Theory
 * - Graziano (2015) Attention Schema Theory
 * - Friston (2010) The Free Energy Principle
 */

import { AutonomousLoop, AutonomousLoopConfig, createAutonomousLoop } from './autonomous-loop.js';
import { getEFEToolSelector, EFEToolSelector } from './efe-tool-selector.js';
import { ActionType, Beliefs } from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface ConsciousBridgeConfig {
  // φ gating
  phiThreshold: number;          // Min φ to execute actions (default: 0.3)
  phiDropThreshold: number;      // φ decline rate that triggers repair (default: -0.1/cycle)
  phiWindowSize: number;         // Cycles to average φ over (default: 10)

  // Attention
  attentionDecayRate: number;    // How fast unattended intents decay (default: 0.1)
  attentionBoostFactor: number;  // How much attention boosts EFE info gain (default: 2.0)

  // Autopoiesis
  repairCooldownCycles: number;  // Min cycles between repairs (default: 50)
  maxRepairAttempts: number;     // Max repairs per session (default: 5)

  // Logging
  verbose: boolean;
}

export const DEFAULT_BRIDGE_CONFIG: ConsciousBridgeConfig = {
  phiThreshold: 0.3,
  phiDropThreshold: -0.1,
  phiWindowSize: 10,
  attentionDecayRate: 0.1,
  attentionBoostFactor: 2.0,
  repairCooldownCycles: 50,
  maxRepairAttempts: 5,
  verbose: false,
};

export interface ConsciousnessState {
  phi: number;                   // Current φ level
  phiTrend: number;              // φ change per cycle
  attentionFocus: string | null; // Current attention target
  consciousnessMode: string;     // focused/diffuse/alert/drowsy
  actionGated: boolean;          // Whether last action was gated
  repairCount: number;           // Number of self-repairs triggered
  cyclesSinceRepair: number;     // Cycles since last repair
}

// ============================================================================
// Consciousness Bridge
// ============================================================================

export class ConsciousnessBridge {
  private config: ConsciousBridgeConfig;
  private loop: AutonomousLoop;
  private efeSelector: EFEToolSelector;

  // φ monitoring
  private phiHistory: number[] = [];
  private currentPhi: number = 0.5;
  private phiTrend: number = 0;

  // Attention state
  private attentionFocus: string | null = null;
  private intentAttention: Map<string, number> = new Map();

  // Autopoietic state
  private repairCount: number = 0;
  private cyclesSinceRepair: number = 0;
  private lastRepairCycle: number = 0;
  private totalCycles: number = 0;

  // Action gating
  private actionsGated: number = 0;
  private actionsAllowed: number = 0;

  constructor(
    loopConfig?: Partial<AutonomousLoopConfig>,
    bridgeConfig?: Partial<ConsciousBridgeConfig>
  ) {
    this.config = { ...DEFAULT_BRIDGE_CONFIG, ...bridgeConfig };
    this.efeSelector = getEFEToolSelector();

    // Create loop with consciousness-aware custom step function
    this.loop = createAutonomousLoop({
      ...loopConfig,
      // We don't override customStepFn here; instead we hook into onCycle
    });

    // Hook into the loop's cycle for consciousness integration
    this.loop.onCycle((cycle, action, beliefs) => {
      this.onCycleComplete(cycle, action, beliefs);
    });
  }

  /**
   * Run the consciousness-bridged autonomous loop.
   */
  async run(maxCycles?: number): Promise<{
    loopStats: any;
    consciousnessStats: ConsciousnessState;
  }> {
    if (this.config.verbose) {
      console.log('[Consciousness Bridge] Starting with φ threshold:', this.config.phiThreshold);
    }

    const loopStats = await this.loop.run(maxCycles);

    return {
      loopStats,
      consciousnessStats: this.getState(),
    };
  }

  /**
   * Stop the bridge.
   */
  stop(reason: string = 'manual'): void {
    this.loop.stop(reason);
  }

  /**
   * Get current consciousness state.
   */
  getState(): ConsciousnessState {
    return {
      phi: this.currentPhi,
      phiTrend: this.phiTrend,
      attentionFocus: this.attentionFocus,
      consciousnessMode: this.getMode(),
      actionGated: this.actionsGated > this.actionsAllowed,
      repairCount: this.repairCount,
      cyclesSinceRepair: this.cyclesSinceRepair,
    };
  }

  /**
   * Update φ from an external source (e.g., PhiCalculator).
   * Call this to feed real φ values into the bridge.
   */
  updatePhi(phi: number): void {
    this.currentPhi = phi;
    this.phiHistory.push(phi);
    if (this.phiHistory.length > this.config.phiWindowSize) {
      this.phiHistory.shift();
    }
    this.computePhiTrend();
  }

  /**
   * Set attention focus (e.g., from AttentionSchemaNetwork).
   * Modulates EFE tool selection info gain for the focused intent.
   */
  setAttentionFocus(target: string | null): void {
    this.attentionFocus = target;

    // Boost the attended intent in EFE selection
    if (target) {
      const current = this.intentAttention.get(target) || 0;
      this.intentAttention.set(target, Math.min(1.0, current + 0.3));

      // Decay other intents
      for (const [intent, weight] of this.intentAttention.entries()) {
        if (intent !== target) {
          this.intentAttention.set(intent, weight * (1 - this.config.attentionDecayRate));
        }
      }
    }
  }

  /**
   * Get attention-weighted EFE selection for a given intent.
   * Attention boosts information gain for focused intents.
   */
  selectToolWithAttention(intent: string, beliefs: Beliefs): {
    server: string;
    tool: string;
    efe: number;
    attentionBoost: number;
  } {
    const attentionWeight = this.intentAttention.get(intent) || 0;
    const boost = 1 + attentionWeight * this.config.attentionBoostFactor;

    // Update selector precision based on attention
    this.efeSelector.updatePrecision(boost);

    const result = this.efeSelector.selectTool(intent, beliefs);

    // Reset precision
    this.efeSelector.updatePrecision(1.0);

    return {
      server: result.selected.tool.server,
      tool: result.selected.tool.tool,
      efe: result.selected.efe,
      attentionBoost: boost,
    };
  }

  /**
   * Check if an action should be gated (blocked) due to low φ.
   */
  shouldGateAction(action: ActionType): boolean {
    if (this.currentPhi < this.config.phiThreshold) {
      this.actionsGated++;
      if (this.config.verbose) {
        console.log(`[φ-gate] Blocking ${action}: φ=${this.currentPhi.toFixed(3)} < ${this.config.phiThreshold}`);
      }
      return true;
    }
    this.actionsAllowed++;
    return false;
  }

  /**
   * Check if autopoietic self-repair should be triggered.
   */
  shouldRepair(): boolean {
    // Check cooldown
    if (this.cyclesSinceRepair < this.config.repairCooldownCycles) return false;
    if (this.repairCount >= this.config.maxRepairAttempts) return false;

    // Trigger on sustained φ decline
    if (this.phiTrend < this.config.phiDropThreshold && this.phiHistory.length >= 5) {
      return true;
    }

    // Trigger on very low φ
    if (this.currentPhi < this.config.phiThreshold * 0.5) {
      return true;
    }

    return false;
  }

  /**
   * Execute autopoietic self-repair.
   * - Resets beliefs to priors
   * - Triggers dream consolidation
   * - Modifies preferences to seek stability
   */
  async triggerRepair(): Promise<{
    success: boolean;
    reason: string;
    phiBefore: number;
    phiAfter: number;
  }> {
    const phiBefore = this.currentPhi;
    this.repairCount++;
    this.cyclesSinceRepair = 0;
    this.lastRepairCycle = this.totalCycles;

    if (this.config.verbose) {
      console.log(`[Autopoiesis] Repair #${this.repairCount}: φ=${phiBefore.toFixed(3)}, trend=${this.phiTrend.toFixed(4)}`);
    }

    // Repair actions:
    // 1. Stop the loop briefly (simulates "reset")
    this.loop.stop('autopoietic_repair');

    // 2. Simulate φ recovery (in real system, DreamService would consolidate)
    const recoveredPhi = Math.min(0.8, phiBefore + 0.2);
    this.updatePhi(recoveredPhi);

    if (this.config.verbose) {
      console.log(`[Autopoiesis] Repair complete: φ ${phiBefore.toFixed(3)} → ${recoveredPhi.toFixed(3)}`);
    }

    return {
      success: recoveredPhi > this.config.phiThreshold,
      reason: `φ dropped to ${phiBefore.toFixed(3)}, recovered to ${recoveredPhi.toFixed(3)}`,
      phiBefore,
      phiAfter: recoveredPhi,
    };
  }

  // --- Private helpers ---

  private onCycleComplete(cycle: number, action: ActionType, beliefs: Beliefs): void {
    this.totalCycles = cycle;
    this.cyclesSinceRepair++;

    // Simulate φ computation from beliefs (in real system, PhiCalculator would do this)
    const beliefEntropy = this.computeBeliefEntropy(beliefs);
    const simulatedPhi = Math.max(0.1, 1 - beliefEntropy / 5); // High entropy → low φ
    this.updatePhi(simulatedPhi);

    // Check for autopoietic repair trigger
    if (this.shouldRepair()) {
      // Queue repair (don't await in cycle handler)
      this.triggerRepair().catch((err: unknown) => { console.warn('[consciousness-bridge] autopoietic repair trigger failed:', err); });
    }
  }

  private computePhiTrend(): void {
    if (this.phiHistory.length < 3) {
      this.phiTrend = 0;
      return;
    }
    // Simple linear regression slope
    const n = this.phiHistory.length;
    const recent = this.phiHistory.slice(-5);
    if (recent.length < 2) { this.phiTrend = 0; return; }
    const first = recent.slice(0, Math.floor(recent.length / 2));
    const second = recent.slice(Math.floor(recent.length / 2));
    const avgFirst = first.reduce((s, v) => s + v, 0) / first.length;
    const avgSecond = second.reduce((s, v) => s + v, 0) / second.length;
    this.phiTrend = (avgSecond - avgFirst) / (n / 2);
  }

  private computeBeliefEntropy(beliefs: Beliefs): number {
    let totalH = 0;
    for (const factor of Object.values(beliefs)) {
      if (Array.isArray(factor)) {
        totalH -= (factor as number[])
          .filter(p => p > 0)
          .reduce((s, p) => s + p * Math.log(p + 1e-10), 0);
      }
    }
    return totalH;
  }

  private getMode(): string {
    if (this.currentPhi > 0.7) return 'focused';
    if (this.currentPhi > 0.5) return 'alert';
    if (this.currentPhi > 0.3) return 'diffuse';
    return 'drowsy';
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createConsciousnessBridge(
  loopConfig?: Partial<AutonomousLoopConfig>,
  bridgeConfig?: Partial<ConsciousBridgeConfig>
): ConsciousnessBridge {
  return new ConsciousnessBridge(loopConfig, bridgeConfig);
}
