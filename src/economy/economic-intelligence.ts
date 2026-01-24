/**
 * Economic Intelligence — Active Inference for Autonomous Economy
 *
 * Three integrated components:
 *
 * 1. AutonomousNESS: Activity-based steady state (not customer-based)
 *    Fixed point: each activity reaches its expected ROI with variance → 0
 *    dR/dt = Σ_i (yield_i × allocation_i) - Σ_i (cost_i × allocation_i) = 0
 *
 * 2. EconomicEFE: Expected Free Energy for action selection
 *    G(π) = ambiguity + risk - pragmaticValue - informationGain + cost
 *    Selects which activity to execute next by minimizing G
 *
 * 3. EconomicContraction: Portfolio-level contraction monitoring
 *    E[log Lip(Ψ_econ)] < 0 ⟹ portfolio converges to NESS
 *    Lip estimated from allocation change / ROI perturbation
 *
 * Reference:
 *   Friston (2019) "A free energy principle for a particular physics"
 *   Parr, Pezzulo, Friston (2022) "Active Inference"
 */

import { getEconomicFiber, type ModuleFiber } from './fiber.js';
import { type ActivityProfile } from './capital-allocator.js';

// ============================================================================
// 1. Autonomous NESS (Activity-Based)
// ============================================================================

export interface AutonomousNESSConfig {
  targetMonthlyRevenue: number;
  targetMonthlyCosts: number;
  activityCount: number;
  qualityTarget: number;          // Aggregate quality score target (0-1)
  diversificationTarget: number;  // 1/N for equal distribution
}

export interface AutonomousNESSState {
  deviation: number;              // |state - state*| / |state*|
  revenueDeviation: number;       // How far revenue is from target
  costDeviation: number;          // How far costs are from target
  roiVariance: number;            // Variance of ROI across activities (→ 0 at NESS)
  diversification: number;        // HHI-inverse: 1 = concentrated, N = even
  atSteadyState: boolean;         // deviation < threshold
  convergenceRate: number;        // d(deviation)/dt
  estimatedCyclesToNESS: number;
  qGammaRatio: number;            // Exploration/exploitation balance
}

/**
 * Activity-based NESS: steady state is when all activities produce
 * stable returns with low variance, and total revenue exceeds costs.
 */
export class AutonomousNESS {
  private config: AutonomousNESSConfig;
  private history: Array<{ revenue: number; costs: number; roiVariance: number; diversification: number }> = [];
  private deviationHistory: number[] = [];
  private readonly maxHistory = 100;
  private readonly steadyStateThreshold = 0.15;

  constructor(config?: Partial<AutonomousNESSConfig>) {
    this.config = {
      targetMonthlyRevenue: config?.targetMonthlyRevenue ?? 2500,
      targetMonthlyCosts: config?.targetMonthlyCosts ?? 150,
      activityCount: config?.activityCount ?? 13,
      qualityTarget: config?.qualityTarget ?? 0.8,
      diversificationTarget: config?.diversificationTarget ?? 0.7, // 70% of max entropy
    };
  }

  /**
   * Compute the autonomous fixed point.
   *
   * At NESS:
   *   - Revenue = targetRevenue (stable)
   *   - Costs = targetCosts (stable)
   *   - ROI variance → 0 (all activities at expected return)
   *   - Diversification → target (not too concentrated)
   */
  computeFixedPoint(): {
    revenue: number;
    costs: number;
    netFlow: number;
    roiVarianceStar: number;
    diversificationStar: number;
  } {
    return {
      revenue: this.config.targetMonthlyRevenue,
      costs: this.config.targetMonthlyCosts,
      netFlow: this.config.targetMonthlyRevenue - this.config.targetMonthlyCosts,
      roiVarianceStar: 0.01,  // Target: 1% variance
      diversificationStar: this.config.diversificationTarget,
    };
  }

  /**
   * Observe current state and compute NESS deviation.
   */
  observe(observation: {
    monthlyRevenue: number;
    monthlyCosts: number;
    roiPerActivity: number[];
    allocations: number[];
  }): AutonomousNESSState {
    const fp = this.computeFixedPoint();

    // Revenue deviation
    const revenueDeviation = Math.abs(observation.monthlyRevenue - fp.revenue) /
      Math.max(fp.revenue, 1);

    // Cost deviation
    const costDeviation = Math.abs(observation.monthlyCosts - fp.costs) /
      Math.max(fp.costs, 1);

    // ROI variance (should → 0 at NESS)
    const meanROI = observation.roiPerActivity.length > 0
      ? observation.roiPerActivity.reduce((s, r) => s + r, 0) / observation.roiPerActivity.length
      : 0;
    const roiVariance = observation.roiPerActivity.length > 0
      ? observation.roiPerActivity.reduce((s, r) => s + (r - meanROI) ** 2, 0) / observation.roiPerActivity.length
      : 1;

    // Diversification (1/HHI): 1 = one activity, N = equal distribution
    const totalAlloc = observation.allocations.reduce((s, a) => s + a, 0);
    const hhi = totalAlloc > 0
      ? observation.allocations.reduce((s, a) => s + (a / totalAlloc) ** 2, 0)
      : 1;
    const diversification = hhi > 0 ? (1 / hhi) / this.config.activityCount : 0;

    // Total deviation (weighted sum)
    const deviation = 0.4 * revenueDeviation +
      0.2 * costDeviation +
      0.2 * Math.min(1, roiVariance / 0.5) +
      0.2 * Math.abs(diversification - this.config.diversificationTarget);

    // Record history
    this.history.push({ revenue: observation.monthlyRevenue, costs: observation.monthlyCosts, roiVariance, diversification });
    this.deviationHistory.push(deviation);
    if (this.history.length > this.maxHistory) this.history.shift();
    if (this.deviationHistory.length > this.maxHistory) this.deviationHistory.shift();

    // Compute convergence rate
    const convergenceRate = this.computeConvergenceRate();

    // Q/Gamma: exploration vs exploitation
    const qGammaRatio = this.computeQGamma(observation);

    return {
      deviation,
      revenueDeviation,
      costDeviation,
      roiVariance,
      diversification,
      atSteadyState: deviation < this.steadyStateThreshold,
      convergenceRate,
      estimatedCyclesToNESS: convergenceRate < 0
        ? Math.abs(deviation / convergenceRate)
        : Infinity,
      qGammaRatio,
    };
  }

  private computeConvergenceRate(): number {
    if (this.deviationHistory.length < 3) return 0;
    const recent = this.deviationHistory.slice(-5);
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < recent.length; i++) {
      sumX += i;
      sumY += recent[i];
      sumXY += i * recent[i];
      sumX2 += i * i;
    }
    const n = recent.length;
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  private computeQGamma(obs: { roiPerActivity: number[]; allocations: number[] }): number {
    if (this.history.length < 2) return 1.0;

    // Q (solenoidal/exploration): variance in allocation changes
    const prev = this.history[this.history.length - 2];
    const allocChange = Math.abs(obs.roiPerActivity.length - (prev.diversification * this.config.activityCount));

    // Γ (dissipative/exploitation): revenue stability
    const revenues = this.history.slice(-5).map(h => h.revenue);
    const avgRev = revenues.reduce((s, r) => s + r, 0) / revenues.length;
    const revStability = avgRev > 0
      ? 1 - Math.sqrt(revenues.reduce((s, r) => s + (r - avgRev) ** 2, 0) / revenues.length) / avgRev
      : 0;

    const Q = Math.max(0.01, allocChange / Math.max(this.config.activityCount, 1));
    const Gamma = Math.max(0.01, revStability);

    return Q / Gamma;
  }

  updateConfig(partial: Partial<AutonomousNESSConfig>): void {
    Object.assign(this.config, partial);
  }

  getConfig(): AutonomousNESSConfig {
    return { ...this.config };
  }

  reset(): void {
    this.history = [];
    this.deviationHistory = [];
  }
}

// ============================================================================
// 2. Economic EFE (Expected Free Energy for Action Selection)
// ============================================================================

export interface EFEScore {
  activityId: string;
  G: number;                    // Total EFE (lower = better)
  ambiguity: number;            // Uncertainty about outcome
  risk: number;                 // KL divergence from preferred outcome
  pragmaticValue: number;       // Expected revenue
  informationGain: number;      // How much we learn from executing
  cost: number;                 // Expected execution cost
}

export interface EFEConfig {
  ambiguityWeight: number;      // Weight for uncertainty term
  riskWeight: number;           // Weight for risk term
  pragmaticWeight: number;      // Weight for expected reward
  infoGainWeight: number;       // Weight for learning value
  costWeight: number;           // Weight for cost term
  temperatureBeta: number;      // Softmax temperature (higher = more exploitative)
}

/**
 * Expected Free Energy for economic action selection.
 *
 * G(activity) = w_a × ambiguity + w_r × risk - w_p × pragmaticValue
 *             - w_i × informationGain + w_c × cost
 *
 * The controller executes the activity with LOWEST G.
 *
 * Ambiguity: How uncertain we are about this activity's return.
 *   = variance of ROI / mean of ROI (coefficient of variation)
 *
 * Risk: How far the expected outcome is from our preferred state.
 *   = |ROI_expected - ROI_target| (normalized)
 *
 * PragmaticValue: Expected revenue per unit capital.
 *   = ROI × allocation (recent observed, not estimated)
 *
 * InformationGain: How much executing this activity reduces uncertainty.
 *   = 1 / (1 + executionCount) (more executions = less to learn)
 *
 * Cost: Expected execution cost.
 *   = costRate × allocation
 */
export class EconomicEFE {
  private config: EFEConfig;
  private executionCounts: Map<string, number> = new Map();
  private roiHistory: Map<string, number[]> = new Map();
  private readonly maxROIHistory = 50;

  constructor(config?: Partial<EFEConfig>) {
    this.config = {
      ambiguityWeight: config?.ambiguityWeight ?? 1.0,
      riskWeight: config?.riskWeight ?? 0.5,
      pragmaticWeight: config?.pragmaticWeight ?? 2.0,
      infoGainWeight: config?.infoGainWeight ?? 0.3,
      costWeight: config?.costWeight ?? 1.0,
      temperatureBeta: config?.temperatureBeta ?? 5.0,
    };
  }

  /**
   * Compute EFE scores for all activities.
   * Returns sorted by G (lowest/best first).
   */
  scoreActivities(
    activities: ActivityProfile[],
    allocations: Map<string, number>,
    targetROI: number = 2.0
  ): EFEScore[] {
    const scores: EFEScore[] = [];
    const fiber = getEconomicFiber();

    for (const activity of activities) {
      if (!activity.active) continue;

      const allocation = allocations.get(activity.id) ?? 0;
      const moduleFiber = fiber.getFiber(activity.id);
      const execCount = this.executionCounts.get(activity.id) ?? 0;
      const roiHist = this.roiHistory.get(activity.id) ?? [];

      // Ambiguity: coefficient of variation of ROI
      const ambiguity = this.computeAmbiguity(roiHist, activity.estimatedROI);

      // Risk: distance from target ROI
      const currentROI = moduleFiber?.roi ?? activity.estimatedROI;
      const risk = Math.abs(currentROI - targetROI) / Math.max(targetROI, 0.01);

      // Pragmatic value: expected revenue per unit
      const pragmaticValue = Math.max(0, currentROI * allocation);

      // Information gain: decreases with more executions
      const informationGain = 1 / (1 + execCount * 0.1);

      // Cost: expected cost per execution
      const cost = (moduleFiber?.costRate ?? 0) * 60 + activity.capitalRequired * 0.001;

      // Total EFE
      const G = this.config.ambiguityWeight * ambiguity
        + this.config.riskWeight * risk
        - this.config.pragmaticWeight * pragmaticValue
        - this.config.infoGainWeight * informationGain
        + this.config.costWeight * cost;

      scores.push({ activityId: activity.id, G, ambiguity, risk, pragmaticValue, informationGain, cost });
    }

    return scores.sort((a, b) => a.G - b.G);
  }

  /**
   * Select the next activity using softmax over -G (Boltzmann selection).
   * Returns activityId or null if no viable activity.
   */
  selectAction(scores: EFEScore[]): string | null {
    if (scores.length === 0) return null;

    // Boltzmann distribution: P(a) ∝ exp(-β × G(a))
    const negG = scores.map(s => -s.G * this.config.temperatureBeta);
    const maxNegG = Math.max(...negG);
    const expScores = negG.map(g => Math.exp(g - maxNegG));
    const sumExp = expScores.reduce((s, e) => s + e, 0);
    const probs = expScores.map(e => e / sumExp);

    // Sample from distribution
    const r = Math.random();
    let cumProb = 0;
    for (let i = 0; i < probs.length; i++) {
      cumProb += probs[i];
      if (r <= cumProb) {
        return scores[i].activityId;
      }
    }

    return scores[0].activityId;
  }

  /**
   * Record execution result (updates history for future EFE computation).
   */
  recordExecution(activityId: string, roi: number): void {
    this.executionCounts.set(activityId, (this.executionCounts.get(activityId) ?? 0) + 1);

    const hist = this.roiHistory.get(activityId) ?? [];
    hist.push(roi);
    if (hist.length > this.maxROIHistory) hist.shift();
    this.roiHistory.set(activityId, hist);
  }

  /**
   * Get all scores for inspection.
   */
  getLastScores(
    activities: ActivityProfile[],
    allocations: Map<string, number>
  ): EFEScore[] {
    return this.scoreActivities(activities, allocations);
  }

  // ============================================================================
  // Private
  // ============================================================================

  private computeAmbiguity(roiHistory: number[], estimatedROI: number): number {
    if (roiHistory.length < 2) {
      // High ambiguity when we have no data (prior uncertainty)
      return 1.0;
    }

    const mean = roiHistory.reduce((s, r) => s + r, 0) / roiHistory.length;
    const variance = roiHistory.reduce((s, r) => s + (r - mean) ** 2, 0) / roiHistory.length;
    const cv = Math.abs(mean) > 0.001 ? Math.sqrt(variance) / Math.abs(mean) : 1.0;

    return Math.min(2.0, cv); // Cap at 2.0
  }
}

// ============================================================================
// 3. Economic Contraction Monitor
// ============================================================================

export interface EconomicContractionState {
  logLipAvg: number;              // E[log Lip(Ψ_econ)]
  stable: boolean;                // logLipAvg < 0
  dampingRecommended: number;     // Recommended damping factor (0-1)
  portfolioVolatility: number;    // Allocation change magnitude
  roiConvergence: number;         // Rate of ROI convergence across activities
  warnings: string[];
}

/**
 * Monitors contraction of the economic portfolio dynamics.
 *
 * The economic Lipschitz constant is estimated from:
 *   Lip(Ψ) = ||allocation_change|| / ||roi_perturbation||
 *
 * If E[log Lip] < 0: portfolio is converging (stable)
 * If E[log Lip] >= 0: portfolio is diverging (needs damping)
 *
 * This is the economic analogue of kernel/contraction.ts but
 * operates on the capital allocation dynamics.
 */
export class EconomicContraction {
  private logLipAvg: number = -0.2;  // Start optimistic
  private lipHistory: number[] = [];
  private previousAllocations: number[] = [];
  private previousROIs: number[] = [];
  private readonly emaAlpha: number;
  private readonly warningThreshold: number;
  private readonly criticalThreshold: number;
  private readonly historySize: number;

  constructor(options?: {
    emaAlpha?: number;
    warningThreshold?: number;
    criticalThreshold?: number;
    historySize?: number;
  }) {
    this.emaAlpha = options?.emaAlpha ?? 0.02;
    this.warningThreshold = options?.warningThreshold ?? -0.05;
    this.criticalThreshold = options?.criticalThreshold ?? 0.0;
    this.historySize = options?.historySize ?? 100;
  }

  /**
   * Observe one economic cycle and estimate contraction.
   */
  observe(
    currentAllocations: number[],
    currentROIs: number[]
  ): EconomicContractionState {
    const warnings: string[] = [];

    if (this.previousAllocations.length > 0 && this.previousROIs.length > 0) {
      // Compute allocation change
      const allocChange = l2Norm(subtract(currentAllocations, this.previousAllocations));

      // Compute ROI perturbation
      const roiChange = l2Norm(subtract(currentROIs, this.previousROIs));

      // Lipschitz estimate
      const lipEstimate = roiChange > 1e-10
        ? allocChange / roiChange
        : allocChange;

      const logLip = Math.log(Math.max(lipEstimate, 1e-10));

      // EMA update
      this.logLipAvg = (1 - this.emaAlpha) * this.logLipAvg + this.emaAlpha * logLip;

      // History
      this.lipHistory.push(logLip);
      if (this.lipHistory.length > this.historySize) this.lipHistory.shift();
    }

    // Store for next comparison
    this.previousAllocations = [...currentAllocations];
    this.previousROIs = [...currentROIs];

    const stable = this.logLipAvg < this.criticalThreshold;

    // Warnings
    if (this.logLipAvg > this.criticalThreshold) {
      warnings.push(`CRITICAL: Economic system expansive (E[log Lip] = ${this.logLipAvg.toFixed(4)} > 0)`);
    } else if (this.logLipAvg > this.warningThreshold) {
      warnings.push(`WARNING: Approaching instability (E[log Lip] = ${this.logLipAvg.toFixed(4)})`);
    }

    // Damping recommendation
    const dampingRecommended = stable
      ? 1.0
      : Math.max(0.1, 1.0 / (1.0 + 5.0 * Math.max(0, this.logLipAvg)));

    // Portfolio volatility
    const portfolioVolatility = this.previousAllocations.length > 0
      ? l2Norm(subtract(currentAllocations, this.previousAllocations)) /
        Math.max(l2Norm(currentAllocations), 1)
      : 0;

    // ROI convergence: variance of ROI differences
    const roiConvergence = currentROIs.length > 1
      ? -variance(currentROIs) // Negative = converging (good)
      : 0;

    return {
      logLipAvg: this.logLipAvg,
      stable,
      dampingRecommended,
      portfolioVolatility,
      roiConvergence,
      warnings,
    };
  }

  /**
   * Get recommended damping factor for the capital allocator.
   */
  getDampingFactor(): number {
    if (this.logLipAvg < this.warningThreshold) return 1.0;
    const excess = Math.max(0, this.logLipAvg - this.warningThreshold);
    return Math.max(0.1, 1.0 / (1.0 + 5.0 * excess));
  }

  getLogLipAvg(): number {
    return this.logLipAvg;
  }

  isStable(): boolean {
    return this.logLipAvg < this.criticalThreshold;
  }

  reset(): void {
    this.logLipAvg = -0.2;
    this.lipHistory = [];
    this.previousAllocations = [];
    this.previousROIs = [];
  }
}

// ============================================================================
// Vector Utilities
// ============================================================================

function subtract(a: number[], b: number[]): number[] {
  const len = Math.max(a.length, b.length);
  const result = new Array(len);
  for (let i = 0; i < len; i++) {
    result[i] = (a[i] ?? 0) - (b[i] ?? 0);
  }
  return result;
}

function l2Norm(v: number[]): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

function variance(v: number[]): number {
  if (v.length < 2) return 0;
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  return v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length;
}

// ============================================================================
// Singletons
// ============================================================================

let autonomousNESSInstance: AutonomousNESS | null = null;
let efeInstance: EconomicEFE | null = null;
let contractionInstance: EconomicContraction | null = null;

export function getAutonomousNESS(config?: Partial<AutonomousNESSConfig>): AutonomousNESS {
  if (!autonomousNESSInstance) {
    autonomousNESSInstance = new AutonomousNESS(config);
  }
  return autonomousNESSInstance;
}

export function getEconomicEFE(config?: Partial<EFEConfig>): EconomicEFE {
  if (!efeInstance) {
    efeInstance = new EconomicEFE(config);
  }
  return efeInstance;
}

export function getEconomicContraction(options?: {
  emaAlpha?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
}): EconomicContraction {
  if (!contractionInstance) {
    contractionInstance = new EconomicContraction(options);
  }
  return contractionInstance;
}

export function resetEconomicIntelligence(): void {
  autonomousNESSInstance = null;
  efeInstance = null;
  contractionInstance = null;
}
