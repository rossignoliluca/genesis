/**
 * Lipschitz Contraction Monitor
 *
 * Monitors the contraction property of the kernel's dynamics:
 *   E[log Lip(Ψ)] < 0 ⟹ system converges to a fixed point
 *   E[log Lip(Ψ)] ≥ 0 ⟹ system may diverge
 *
 * This is the "check engine light" for autonomous operation:
 * if contraction fails, the system activates damping mechanisms.
 *
 * Lip(Ψ) = sup(||Ψ(x) - Ψ(y)|| / ||x - y||)
 *
 * In practice, we estimate this by measuring how much beliefs change
 * relative to observation perturbation magnitude.
 *
 * Reference: Friston (2019) "A free energy principle for a particular physics"
 */

export interface ContractionState {
  logLipAvg: number;        // EMA of log(Lipschitz constant)
  lipHistory: number[];     // Recent Lip estimates (last 100)
  warnings: ContractionWarning[];
  stable: boolean;          // true if E[log Lip] < 0
  dampingActive: boolean;   // true if emergency damping engaged
  cyclesSinceStable: number;
}

export interface ContractionWarning {
  level: 'info' | 'warning' | 'critical';
  logLip: number;
  message: string;
  recommendation: string;
  timestamp: number;
}

/**
 * Contraction Monitor: tracks system stability in real-time.
 */
export class ContractionMonitor {
  private state: ContractionState;
  private readonly emaAlpha: number;
  private readonly warningThreshold: number;
  private readonly criticalThreshold: number;
  private readonly historySize: number;

  constructor(options: {
    emaAlpha?: number;        // EMA smoothing (default 0.01 = slow)
    warningThreshold?: number; // log Lip > this triggers warning (default -0.05)
    criticalThreshold?: number; // log Lip > this triggers emergency (default 0.0)
    historySize?: number;      // How many Lip values to keep (default 100)
  } = {}) {
    this.emaAlpha = options.emaAlpha ?? 0.01;
    this.warningThreshold = options.warningThreshold ?? -0.05;
    this.criticalThreshold = options.criticalThreshold ?? 0.0;
    this.historySize = options.historySize ?? 100;

    this.state = {
      logLipAvg: -0.2,  // Start with assumption of contraction
      lipHistory: [],
      warnings: [],
      stable: true,
      dampingActive: false,
      cyclesSinceStable: 0,
    };
  }

  /**
   * Record a Lipschitz estimate from one kernel cycle.
   *
   * @param stateBefore Belief state before the cycle
   * @param stateAfter Belief state after the cycle
   * @param perturbationMagnitude How much the observation changed
   * @returns Current contraction assessment
   */
  observe(
    stateBefore: number[],
    stateAfter: number[],
    perturbationMagnitude: number
  ): ContractionState {
    // Compute state change magnitude
    const stateChange = l2Norm(subtract(stateAfter, stateBefore));

    // Lipschitz estimate: output change / input change
    const lipEstimate = perturbationMagnitude > 1e-10
      ? stateChange / perturbationMagnitude
      : stateChange; // If no perturbation, just use raw change

    const logLip = Math.log(Math.max(lipEstimate, 1e-10));

    // EMA update
    this.state.logLipAvg = (1 - this.emaAlpha) * this.state.logLipAvg + this.emaAlpha * logLip;

    // History
    this.state.lipHistory.push(logLip);
    if (this.state.lipHistory.length > this.historySize) {
      this.state.lipHistory.shift();
    }

    // Stability assessment
    this.state.stable = this.state.logLipAvg < this.criticalThreshold;

    if (this.state.stable) {
      this.state.cyclesSinceStable = 0;
      this.state.dampingActive = false;
    } else {
      this.state.cyclesSinceStable++;
    }

    // Warnings
    this.checkWarnings();

    return this.getState();
  }

  private checkWarnings(): void {
    const now = Date.now();

    if (this.state.logLipAvg > this.criticalThreshold) {
      // CRITICAL: system is expansive
      this.state.dampingActive = true;
      this.state.warnings.push({
        level: 'critical',
        logLip: this.state.logLipAvg,
        message: `System expansive: E[log Lip] = ${this.state.logLipAvg.toFixed(4)} > 0`,
        recommendation: 'Reduce learning rate, increase precision weighting',
        timestamp: now,
      });
    } else if (this.state.logLipAvg > this.warningThreshold) {
      // WARNING: approaching instability
      this.state.warnings.push({
        level: 'warning',
        logLip: this.state.logLipAvg,
        message: `Near instability: E[log Lip] = ${this.state.logLipAvg.toFixed(4)}`,
        recommendation: 'Consider increasing damping on L3',
        timestamp: now,
      });
    }

    // Keep only last 20 warnings
    if (this.state.warnings.length > 20) {
      this.state.warnings = this.state.warnings.slice(-20);
    }
  }

  /**
   * Get the recommended damping factor.
   * Returns 1.0 when stable, < 1.0 when damping is needed.
   * The FEK should multiply learning rates by this factor.
   */
  getDampingFactor(): number {
    if (!this.state.dampingActive) return 1.0;
    // Stronger damping the more expansive the system is
    const excess = Math.max(0, this.state.logLipAvg - this.criticalThreshold);
    return Math.max(0.1, 1.0 / (1.0 + 5.0 * excess));
  }

  /**
   * Get recommended learning rate multiplier.
   * Reduces learning rate when approaching instability.
   */
  getLearningRateMultiplier(): number {
    if (this.state.logLipAvg < this.warningThreshold) return 1.0;
    // Linear reduction as we approach critical
    const range = this.criticalThreshold - this.warningThreshold;
    const position = this.state.logLipAvg - this.warningThreshold;
    return Math.max(0.1, 1.0 - (position / range) * 0.9);
  }

  getState(): ContractionState {
    return { ...this.state, lipHistory: [...this.state.lipHistory], warnings: [...this.state.warnings] };
  }

  isStable(): boolean {
    return this.state.stable;
  }

  getLogLipAvg(): number {
    return this.state.logLipAvg;
  }

  reset(): void {
    this.state = {
      logLipAvg: -0.2,
      lipHistory: [],
      warnings: [],
      stable: true,
      dampingActive: false,
      cyclesSinceStable: 0,
    };
  }
}

// ============================================================================
// Vector utilities
// ============================================================================

function subtract(a: number[], b: number[]): number[] {
  return a.map((v, i) => v - (b[i] || 0));
}

function l2Norm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}
