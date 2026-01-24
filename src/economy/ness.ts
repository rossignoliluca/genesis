/**
 * Non-Equilibrium Steady State (NESS) Monitor
 *
 * Tracks how close the economic system is to its sustainable fixed point.
 * The NESS is characterized by:
 *   f(G*) = (Q(G*) - Γ(G*)) ∇log p(G*) = 0
 *
 * Where:
 *   Q = solenoidal component (exploration: trying new services, customers)
 *   Γ = dissipative component (exploitation: serving existing customers)
 *   G* = steady state (revenue ≈ target, costs stable, quality maintained)
 *
 * The system is at NESS when Q and Γ balance: enough exploration to
 * discover opportunities, enough exploitation to generate stable revenue.
 *
 * Reference: Friston (2019) "A free energy principle for a particular physics"
 */

export interface NESSConfig {
  targetRevenue: number;      // Monthly revenue target ($)
  targetCosts: number;        // Monthly cost target ($)
  targetCustomers: number;    // Customer count target
  pricePerCustomer: number;   // Revenue per customer/month ($)
  costPerCustomer: number;    // Cost per customer/month ($)
  fixedCosts: number;         // Fixed monthly costs ($)
  qualityTarget: number;      // Service quality target (0-1)
  retentionBase: number;      // Base retention rate
  retentionQualityCoeff: number; // retention = base + coeff × quality
  acquisitionAlpha: number;   // Acquisition rate coefficient
}

export interface NESSState {
  deviation: number;          // |state - state*| / |state*| (0 = at NESS)
  solenoidalMagnitude: number; // Exploration intensity
  dissipativeMagnitude: number; // Exploitation intensity
  qGammaRatio: number;        // Q/Γ (target: ~1.0 at NESS)
  convergenceRate: number;    // How fast we're approaching NESS
  estimatedCyclesToNESS: number; // Cycles remaining (Infinity if diverging)
  atSteadyState: boolean;     // deviation < 10%
  runway: number;             // Days of operation remaining
}

export interface NESSObservation {
  revenue: number;            // Current monthly revenue ($)
  costs: number;              // Current monthly costs ($)
  customers: number;          // Current customer count
  quality: number;            // Current quality score (0-1)
  balance: number;            // Current balance ($)
}

/**
 * NESS Monitor: tracks deviation from economic fixed point.
 */
export class NESSMonitor {
  private config: NESSConfig;
  private history: NESSObservation[] = [];
  private deviationHistory: number[] = [];
  private readonly maxHistory: number = 100;

  constructor(config?: Partial<NESSConfig>) {
    this.config = {
      targetRevenue: config?.targetRevenue ?? 2639,  // 91 customers × $29
      targetCosts: config?.targetCosts ?? 837,       // 91 × $7 + $200 infra
      targetCustomers: config?.targetCustomers ?? 91,
      pricePerCustomer: config?.pricePerCustomer ?? 29,
      costPerCustomer: config?.costPerCustomer ?? 7,
      fixedCosts: config?.fixedCosts ?? 200,
      qualityTarget: config?.qualityTarget ?? 0.8,
      retentionBase: config?.retentionBase ?? 0.85,
      retentionQualityCoeff: config?.retentionQualityCoeff ?? 0.1,
      acquisitionAlpha: config?.acquisitionAlpha ?? 10,
    };
  }

  /**
   * Compute the theoretical NESS fixed point.
   *
   * At steady state:
   *   dN/dt = acquisition(q) - churn(N, r) = 0
   *   acquisition(q) = α × q²
   *   churn(N, r) = N × (1 - r)
   *   r = retentionBase + retentionQualityCoeff × q
   *
   *   N* = α × q² / (1 - r)
   *   Revenue* = N* × price
   *   Costs* = N* × costPerCustomer + fixedCosts
   *   Net* = Revenue* - Costs*
   */
  computeFixedPoint(quality?: number): {
    customers: number;
    revenue: number;
    costs: number;
    netFlow: number;
    retention: number;
  } {
    const q = quality ?? this.config.qualityTarget;
    const r = this.config.retentionBase + this.config.retentionQualityCoeff * q;
    const churnRate = 1 - r;

    const nStar = churnRate > 0
      ? this.config.acquisitionAlpha * q * q / churnRate
      : Infinity;

    const revenue = nStar * this.config.pricePerCustomer;
    const costs = nStar * this.config.costPerCustomer + this.config.fixedCosts;

    return {
      customers: nStar,
      revenue,
      costs,
      netFlow: revenue - costs,
      retention: r,
    };
  }

  /**
   * Update with current observation and compute NESS state.
   */
  observe(obs: NESSObservation): NESSState {
    this.history.push(obs);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const fixedPoint = this.computeFixedPoint(obs.quality);

    // Compute deviation: normalized distance from fixed point
    const revenueDeviation = Math.abs(obs.revenue - fixedPoint.revenue) /
      Math.max(fixedPoint.revenue, 1);
    const customerDeviation = Math.abs(obs.customers - fixedPoint.customers) /
      Math.max(fixedPoint.customers, 1);
    const costDeviation = Math.abs(obs.costs - fixedPoint.costs) /
      Math.max(fixedPoint.costs, 1);

    const deviation = (revenueDeviation + customerDeviation + costDeviation) / 3;

    this.deviationHistory.push(deviation);
    if (this.deviationHistory.length > this.maxHistory) {
      this.deviationHistory.shift();
    }

    // Solenoidal vs dissipative decomposition
    const solenoidal = this.computeSolenoidal(obs, fixedPoint);
    const dissipative = this.computeDissipative(obs, fixedPoint);

    // Convergence rate: rate of change of deviation
    const convergenceRate = this.computeConvergenceRate();

    // Estimated cycles to NESS
    const estimatedCycles = convergenceRate < 0
      ? Math.abs(deviation / convergenceRate) // Converging
      : Infinity; // Diverging or stagnant

    // Runway: balance / monthly burn rate
    const monthlyBurn = obs.costs - obs.revenue;
    const runway = monthlyBurn > 0
      ? (obs.balance / monthlyBurn) * 30 // days
      : Infinity; // Self-sustaining

    return {
      deviation,
      solenoidalMagnitude: solenoidal,
      dissipativeMagnitude: dissipative,
      qGammaRatio: dissipative > 0 ? solenoidal / dissipative : solenoidal > 0 ? Infinity : 1.0,
      convergenceRate,
      estimatedCyclesToNESS: Math.min(estimatedCycles, 1e6),
      atSteadyState: deviation < 0.1,
      runway: Math.min(runway, 36500),
    };
  }

  /**
   * Solenoidal component: exploration activity.
   * High when the system is trying new things (revenue variance, customer change).
   */
  private computeSolenoidal(obs: NESSObservation, fixedPoint: { customers: number }): number {
    if (this.history.length < 2) return 0.5;
    const prev = this.history[this.history.length - 2];

    // Rate of change of customers (exploration = acquiring/losing)
    const customerChange = Math.abs(obs.customers - prev.customers);
    // Quality experimentation
    const qualityChange = Math.abs(obs.quality - (prev.quality || obs.quality));

    return Math.min(1, (customerChange / Math.max(fixedPoint.customers, 1)) + qualityChange);
  }

  /**
   * Dissipative component: exploitation activity.
   * High when the system is serving stably (consistent revenue, low variance).
   */
  private computeDissipative(obs: NESSObservation, fixedPoint: { revenue: number }): number {
    if (this.history.length < 2) return 0.5;

    // Revenue stability (low variance = high exploitation)
    const recentRevenues = this.history.slice(-5).map(h => h.revenue);
    const avgRevenue = recentRevenues.reduce((s, r) => s + r, 0) / recentRevenues.length;
    const variance = recentRevenues.reduce((s, r) => s + (r - avgRevenue) ** 2, 0) / recentRevenues.length;
    const cv = avgRevenue > 0 ? Math.sqrt(variance) / avgRevenue : 1;

    return Math.max(0, 1 - cv); // High stability = high exploitation
  }

  /**
   * Rate of change of deviation (negative = converging).
   */
  private computeConvergenceRate(): number {
    if (this.deviationHistory.length < 3) return 0;
    const recent = this.deviationHistory.slice(-5);
    if (recent.length < 2) return 0;

    // Simple linear regression slope
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < recent.length; i++) {
      sumX += i;
      sumY += recent[i];
      sumXY += i * recent[i];
      sumX2 += i * i;
    }
    const n = recent.length;
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope; // Negative = converging
  }

  getConfig(): NESSConfig {
    return { ...this.config };
  }

  updateConfig(partial: Partial<NESSConfig>): void {
    Object.assign(this.config, partial);
  }

  getHistory(): NESSObservation[] {
    return [...this.history];
  }

  reset(): void {
    this.history = [];
    this.deviationHistory = [];
  }
}

// ============================================================================
// Singleton
// ============================================================================

let nessInstance: NESSMonitor | null = null;

export function getNESSMonitor(config?: Partial<NESSConfig>): NESSMonitor {
  if (!nessInstance) {
    nessInstance = new NESSMonitor(config);
  }
  return nessInstance;
}

export function resetNESSMonitor(): void {
  nessInstance = null;
}
