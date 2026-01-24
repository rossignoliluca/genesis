/**
 * Variational Free Energy Engine — Closes the Perception-Action Loop
 *
 * In Active Inference, the agent minimizes TWO free energies:
 *
 *   Perception: Minimize Variational Free Energy F
 *     F = E_Q[log Q(s) - log P(o,s)]
 *     = complexity - accuracy
 *     → Updates beliefs to explain observations
 *
 *   Action: Minimize Expected Free Energy G
 *     G(π) = ambiguity + risk - pragmaticValue - informationGain
 *     → Selects actions to reach preferred states
 *
 * This module connects them:
 *
 * 1. VariationalFreeEnergy: Computes F from beliefs + observations.
 *    High F = model is surprised = need to update beliefs (perception)
 *    or change policy (action). Drives the explore/exploit balance.
 *
 * 2. PrecisionWeightedEFE: Replaces ad-hoc ambiguity in EconomicEFE
 *    with proper precision π_i = 1/σ²_i from Bayesian posteriors.
 *    G_precision(a) = (1/π_a)×ambiguity + π_a×pragmatic - ...
 *    High precision → trust prediction → exploit
 *    Low precision → uncertain → explore (reduces ambiguity)
 *
 * 3. CovarianceStructure: Models correlations between activities.
 *    Crypto cluster, compute cluster, cognitive cluster.
 *    Used for portfolio risk and correlated belief updates.
 *
 * 4. KellyRisk: Position sizing via Kelly criterion.
 *    f* = (p×b - q) / b (optimal fraction of capital)
 *    Prevents over-allocation to any single activity.
 *
 * Reference:
 *   Parr & Friston (2019) "Generalised free energy and active inference"
 *   Friston et al. (2021) "World model learning and inference"
 */

import { getEconomicFiber, type ModuleFiber } from './fiber.js';
import { type ActivityProfile } from './capital-allocator.js';
import { type ActivityBelief, type ActivityBeliefs } from './generative-model.js';
import { type EFEScore } from './economic-intelligence.js';

// ============================================================================
// 1. Variational Free Energy
// ============================================================================

export interface VFEState {
  totalF: number;                 // Total variational free energy
  complexity: number;             // KL[Q(s) || P(s)] — cost of beliefs
  accuracy: number;               // E_Q[log P(o|s)] — data fit
  surprise: number;               // -log P(o) — marginal surprise
  perActivity: Map<string, number>; // Per-activity F contribution
  modelFit: number;               // 0-1: how well model explains data (1=perfect)
  beliefUpdateNeeded: boolean;    // F > threshold → beliefs stale
}

export interface VFEConfig {
  surpriseThreshold: number;      // Above this, beliefs need updating
  complexityPenalty: number;      // Weight on complexity term
  accuracyWeight: number;         // Weight on accuracy term
  emaAlpha: number;               // Smoothing for F tracking
}

/**
 * Computes Variational Free Energy: how surprised is the model?
 *
 * F = complexity - accuracy
 *   = KL[Q(ROI_i) || P(ROI_i)] - log P(observed_ROI_i | Q(ROI_i))
 *
 * For Gaussian beliefs:
 *   KL[N(μ_q, σ²_q) || N(μ_p, σ²_p)] =
 *     log(σ_p/σ_q) + (σ²_q + (μ_q - μ_p)²) / (2σ²_p) - 1/2
 *
 *   log P(o | N(μ_q, σ²_q)) = -½ log(2πσ²_q) - (o - μ_q)² / (2σ²_q)
 */
export class VariationalFreeEnergy {
  private config: VFEConfig;
  private fHistory: number[] = [];
  private currentF: number = 0;
  private readonly maxHistory = 100;

  constructor(config?: Partial<VFEConfig>) {
    this.config = {
      surpriseThreshold: config?.surpriseThreshold ?? 2.0,
      complexityPenalty: config?.complexityPenalty ?? 0.5,
      accuracyWeight: config?.accuracyWeight ?? 1.0,
      emaAlpha: config?.emaAlpha ?? 0.1,
    };
  }

  /**
   * Compute VFE given beliefs and observed ROIs.
   */
  compute(
    beliefs: ActivityBeliefs,
    observations: Array<{ activityId: string; observedROI: number }>
  ): VFEState {
    let totalComplexity = 0;
    let totalAccuracy = 0;
    const perActivity = new Map<string, number>();

    for (const obs of observations) {
      const belief = beliefs.getBelief(obs.activityId);
      if (!belief) continue;

      // Complexity: KL[posterior || prior]
      const kl = this.gaussianKL(
        belief.mu, belief.sigma2,
        belief.mu0, belief.beta0 / Math.max(belief.alpha0 - 1, 0.5)
      );
      const complexity = this.config.complexityPenalty * kl;

      // Accuracy: log-likelihood of observation under posterior
      const accuracy = this.config.accuracyWeight * this.gaussianLogLik(
        obs.observedROI, belief.mu, belief.sigma2
      );

      // F_i = complexity - accuracy (lower is better)
      const fi = complexity - accuracy;
      perActivity.set(obs.activityId, fi);

      totalComplexity += complexity;
      totalAccuracy += accuracy;
    }

    const totalF = totalComplexity - totalAccuracy;
    const surprise = -totalAccuracy; // Marginal surprise ≈ -accuracy

    // EMA update
    this.currentF = (1 - this.config.emaAlpha) * this.currentF + this.config.emaAlpha * totalF;
    this.fHistory.push(this.currentF);
    if (this.fHistory.length > this.maxHistory) this.fHistory.shift();

    // Model fit: 0-1 (accuracy relative to maximum possible)
    const maxAccuracy = observations.length * 2; // Heuristic maximum
    const modelFit = Math.max(0, Math.min(1, (totalAccuracy + maxAccuracy) / (2 * maxAccuracy)));

    return {
      totalF,
      complexity: totalComplexity,
      accuracy: totalAccuracy,
      surprise,
      perActivity,
      modelFit,
      beliefUpdateNeeded: Math.abs(this.currentF) > this.config.surpriseThreshold,
    };
  }

  /**
   * Get current smoothed F.
   */
  getCurrentF(): number {
    return this.currentF;
  }

  /**
   * Get trend: is F decreasing (model improving) or increasing (model degrading)?
   */
  getTrend(): number {
    if (this.fHistory.length < 3) return 0;
    const recent = this.fHistory.slice(-5);
    const first = recent[0];
    const last = recent[recent.length - 1];
    return last - first; // Negative = improving
  }

  private gaussianKL(mu1: number, var1: number, mu2: number, var2: number): number {
    const safeVar1 = Math.max(var1, 1e-10);
    const safeVar2 = Math.max(var2, 1e-10);
    return 0.5 * (
      Math.log(safeVar2 / safeVar1)
      + safeVar1 / safeVar2
      + (mu1 - mu2) ** 2 / safeVar2
      - 1
    );
  }

  private gaussianLogLik(x: number, mu: number, var_: number): number {
    const safeVar = Math.max(var_, 1e-10);
    return -0.5 * (Math.log(2 * Math.PI * safeVar) + (x - mu) ** 2 / safeVar);
  }

  reset(): void {
    this.currentF = 0;
    this.fHistory = [];
  }
}

// ============================================================================
// 2. Precision-Weighted EFE
// ============================================================================

export interface PrecisionEFEScore extends EFEScore {
  precision: number;                // 1/σ² from posterior
  kellyFraction: number;           // Optimal capital fraction
  regimeAdjustedROI: number;       // ROI × regime factor
  covarianceRisk: number;          // Correlated risk contribution
}

export interface PrecisionEFEConfig {
  precisionScale: number;          // How much precision affects weights (default 1.0)
  minPrecision: number;            // Floor on precision (prevent infinite weights)
  maxPrecision: number;            // Cap on precision (prevent zero exploration)
  kellyFraction: number;           // Fraction of Kelly to use (0.5 = half-Kelly)
  covarianceWeight: number;        // Weight on covariance risk term
}

/**
 * Precision-weighted Expected Free Energy.
 *
 * In Active Inference, precision π = 1/σ² determines the confidence
 * in predictions and thus the explore/exploit balance:
 *
 *   G_precision(a) = (1/π_a) × ambiguity     ← uncertain activities penalized less
 *                  + risk
 *                  - π_a × pragmaticValue     ← confident predictions weighted more
 *                  - (1/π_a) × infoGain       ← uncertain activities have more to learn
 *                  + cost
 *                  + covarianceRisk           ← correlated exposure penalty
 *
 * This replaces the ad-hoc ambiguity in EconomicEFE.
 */
export class PrecisionWeightedEFE {
  private config: PrecisionEFEConfig;

  constructor(config?: Partial<PrecisionEFEConfig>) {
    this.config = {
      precisionScale: config?.precisionScale ?? 1.0,
      minPrecision: config?.minPrecision ?? 0.1,
      maxPrecision: config?.maxPrecision ?? 50.0,
      kellyFraction: config?.kellyFraction ?? 0.5,
      covarianceWeight: config?.covarianceWeight ?? 0.3,
    };
  }

  /**
   * Score activities using precision-weighted EFE.
   */
  score(
    activities: ActivityProfile[],
    beliefs: ActivityBeliefs,
    allocations: Map<string, number>,
    covariance: CovarianceStructure,
    regimeFactor: number,
    targetROI: number = 2.0
  ): PrecisionEFEScore[] {
    const scores: PrecisionEFEScore[] = [];
    const fiber = getEconomicFiber();

    for (const activity of activities) {
      if (!activity.active) continue;

      const belief = beliefs.getBelief(activity.id);
      const allocation = allocations.get(activity.id) ?? 0;
      const moduleFiber = fiber.getFiber(activity.id);

      // Precision from posterior
      const rawPrecision = belief ? belief.precision : 1.0;
      const precision = Math.max(
        this.config.minPrecision,
        Math.min(this.config.maxPrecision, rawPrecision * this.config.precisionScale)
      );

      // Regime-adjusted expected ROI
      const expectedROI = (belief?.mu ?? activity.estimatedROI) * regimeFactor;
      const regimeAdjustedROI = expectedROI;

      // Precision-weighted ambiguity: low precision → high ambiguity
      const ambiguity = 1 / precision;

      // Risk: distance from target (regime-adjusted)
      const risk = Math.abs(expectedROI - targetROI) / Math.max(targetROI, 0.01);

      // Precision-weighted pragmatic value
      const pragmaticValue = precision * Math.max(0, expectedROI * allocation);

      // Information gain: inversely proportional to precision (uncertain → more to learn)
      const informationGain = 1 / precision;

      // Cost
      const cost = (moduleFiber?.costRate ?? 0) * 60 + activity.capitalRequired * 0.001;

      // Covariance risk: penalize if highly correlated with existing allocations
      const covarianceRisk = this.config.covarianceWeight *
        covariance.getPortfolioContribution(activity.id, allocations);

      // Kelly-optimal fraction
      const kellyFraction = this.computeKelly(belief, activity);

      // Total precision-weighted EFE
      const G = ambiguity
        + risk
        - pragmaticValue
        - informationGain
        + cost
        + covarianceRisk;

      scores.push({
        activityId: activity.id,
        G,
        ambiguity,
        risk,
        pragmaticValue,
        informationGain,
        cost,
        precision,
        kellyFraction,
        regimeAdjustedROI,
        covarianceRisk,
      });
    }

    return scores.sort((a, b) => a.G - b.G);
  }

  /**
   * Get Kelly-optimal allocation for an activity.
   *
   * f* = (p×b - q) / b
   *   p = probability of positive ROI
   *   q = 1 - p
   *   b = average win / average loss
   *
   * We use half-Kelly for safety.
   */
  private computeKelly(belief: ActivityBelief | undefined, activity: ActivityProfile): number {
    if (!belief || belief.n < 3) {
      // Not enough data: use conservative fraction based on risk
      return Math.max(0.05, (1 - activity.riskLevel) * 0.2);
    }

    // Probability of positive ROI (from posterior)
    // P(ROI > 0) = Φ(μ/σ) where Φ is the standard normal CDF
    const z = belief.mu / Math.max(Math.sqrt(belief.sigma2), 0.001);
    const p = normalCDF(z);
    const q = 1 - p;

    if (p <= 0 || q <= 0) return 0.05;

    // Average win/loss ratio
    // Approximate from posterior: E[ROI | ROI > 0] / E[|ROI| | ROI < 0]
    const avgWin = Math.max(belief.mu, 0.01);
    const avgLoss = Math.max(-belief.mu + Math.sqrt(belief.sigma2), 0.01);
    const b = avgWin / avgLoss;

    // Kelly fraction
    const kelly = Math.max(0, (p * b - q) / b);

    // Half-Kelly for safety
    return Math.min(0.4, kelly * this.config.kellyFraction);
  }
}

// ============================================================================
// 3. Covariance Structure
// ============================================================================

export type ClusterId = 'crypto' | 'compute' | 'cognitive' | 'infrastructure' | 'independent';

export interface CovarianceConfig {
  intraClusterCorrelation: number;   // Correlation within cluster (default 0.6)
  interClusterCorrelation: number;   // Correlation between clusters (default 0.1)
  decayRate: number;                 // How fast empirical correlations decay
}

/**
 * Models correlations between activity returns.
 *
 * Activities are grouped into clusters:
 *   - Crypto: keeper, yield-optimizer, cross-l2-arb (gas/DeFi correlated)
 *   - Compute: compute-provider, meta-orchestrator (infrastructure correlated)
 *   - Cognitive: bounty-hunter, auditor, content-engine (LLM-cost correlated)
 *   - Infrastructure: mcp-marketplace, x402-facilitator, memory-service
 *   - Independent: grants, reputation-oracle
 *
 * Used for:
 *   1. Portfolio risk (don't over-allocate to correlated activities)
 *   2. Correlated belief updates (if one crypto activity drops, expect others to)
 *   3. Diversification in EFE scoring
 */
export class CovarianceStructure {
  private config: CovarianceConfig;
  private clusterMap: Map<string, ClusterId> = new Map();
  private empiricalCorrelations: Map<string, number> = new Map(); // "a:b" → corr
  private returnHistory: Map<string, number[]> = new Map();
  private readonly maxHistory = 50;

  constructor(config?: Partial<CovarianceConfig>) {
    this.config = {
      intraClusterCorrelation: config?.intraClusterCorrelation ?? 0.6,
      interClusterCorrelation: config?.interClusterCorrelation ?? 0.1,
      decayRate: config?.decayRate ?? 0.95,
    };

    // Initialize cluster assignments
    this.initializeClusters();
  }

  /**
   * Record a return observation for correlation estimation.
   */
  recordReturn(activityId: string, roi: number): void {
    const hist = this.returnHistory.get(activityId) ?? [];
    hist.push(roi);
    if (hist.length > this.maxHistory) hist.shift();
    this.returnHistory.set(activityId, hist);

    // Update empirical correlations with other activities
    this.updateCorrelations(activityId);
  }

  /**
   * Get the correlation between two activities.
   * Uses empirical if available, otherwise prior from cluster structure.
   */
  getCorrelation(activityA: string, activityB: string): number {
    if (activityA === activityB) return 1.0;

    // Check empirical
    const key = [activityA, activityB].sort().join(':');
    const empirical = this.empiricalCorrelations.get(key);
    if (empirical !== undefined) return empirical;

    // Fall back to prior from cluster structure
    const clusterA = this.clusterMap.get(activityA) ?? 'independent';
    const clusterB = this.clusterMap.get(activityB) ?? 'independent';

    return clusterA === clusterB
      ? this.config.intraClusterCorrelation
      : this.config.interClusterCorrelation;
  }

  /**
   * Get the portfolio risk contribution of adding/increasing an activity.
   *
   * Marginal risk = Σ_j (allocation_j × correlation(i,j) × σ_j)
   * Higher value = this activity is more correlated with existing portfolio
   */
  getPortfolioContribution(activityId: string, allocations: Map<string, number>): number {
    let contribution = 0;
    const totalAlloc = [...allocations.values()].reduce((s, a) => s + a, 0);
    if (totalAlloc === 0) return 0;

    for (const [otherId, allocation] of allocations) {
      if (otherId === activityId) continue;
      const corr = this.getCorrelation(activityId, otherId);
      const weight = allocation / totalAlloc;
      contribution += weight * corr;
    }

    return contribution;
  }

  /**
   * Get the cluster for an activity.
   */
  getCluster(activityId: string): ClusterId {
    return this.clusterMap.get(activityId) ?? 'independent';
  }

  /**
   * Get portfolio diversification score.
   * 1.0 = perfectly diversified, 0 = concentrated in one cluster.
   */
  getDiversificationScore(allocations: Map<string, number>): number {
    const clusterAllocations = new Map<ClusterId, number>();
    let total = 0;

    for (const [activityId, alloc] of allocations) {
      const cluster = this.getCluster(activityId);
      clusterAllocations.set(cluster, (clusterAllocations.get(cluster) ?? 0) + alloc);
      total += alloc;
    }

    if (total === 0) return 0;

    // HHI-inverse normalized
    const hhi = [...clusterAllocations.values()].reduce((s, a) => s + (a / total) ** 2, 0);
    const numClusters = clusterAllocations.size;
    return numClusters > 1 ? (1 / hhi) / numClusters : 0;
  }

  /**
   * Propagate a belief update to correlated activities.
   * If activity A's ROI drops, correlated activities should expect similar.
   */
  getCorrelatedUpdates(
    sourceActivity: string,
    roiSurprise: number // observed - expected
  ): Map<string, number> {
    const updates = new Map<string, number>();

    for (const [activityId] of this.returnHistory) {
      if (activityId === sourceActivity) continue;
      const corr = this.getCorrelation(sourceActivity, activityId);
      if (Math.abs(corr) > 0.1) {
        // Correlated activities should expect a fraction of the surprise
        updates.set(activityId, roiSurprise * corr * 0.3);
      }
    }

    return updates;
  }

  // ============================================================================
  // Private
  // ============================================================================

  private initializeClusters(): void {
    const assignments: Record<string, ClusterId> = {
      'keeper': 'crypto',
      'yield-optimizer': 'crypto',
      'cross-l2-arb': 'crypto',
      'compute-provider': 'compute',
      'meta-orchestrator': 'compute',
      'bounty-hunter': 'cognitive',
      'smart-contract-auditor': 'cognitive',
      'content-engine': 'cognitive',
      'mcp-marketplace': 'infrastructure',
      'x402-facilitator': 'infrastructure',
      'memory-service': 'infrastructure',
      'reputation-oracle': 'infrastructure',
      'grants': 'independent',
    };

    for (const [id, cluster] of Object.entries(assignments)) {
      this.clusterMap.set(id, cluster);
    }
  }

  private updateCorrelations(activityId: string): void {
    const histA = this.returnHistory.get(activityId);
    if (!histA || histA.length < 5) return;

    for (const [otherId, histB] of this.returnHistory) {
      if (otherId === activityId || histB.length < 5) continue;

      const minLen = Math.min(histA.length, histB.length);
      const a = histA.slice(-minLen);
      const b = histB.slice(-minLen);

      const corr = pearsonCorrelation(a, b);
      if (!isNaN(corr)) {
        const key = [activityId, otherId].sort().join(':');
        const prev = this.empiricalCorrelations.get(key) ?? this.getClusterCorrelation(activityId, otherId);
        // Decay toward empirical
        this.empiricalCorrelations.set(key,
          this.config.decayRate * prev + (1 - this.config.decayRate) * corr
        );
      }
    }
  }

  private getClusterCorrelation(a: string, b: string): number {
    const clusterA = this.clusterMap.get(a) ?? 'independent';
    const clusterB = this.clusterMap.get(b) ?? 'independent';
    return clusterA === clusterB
      ? this.config.intraClusterCorrelation
      : this.config.interClusterCorrelation;
  }
}

// ============================================================================
// 4. Risk Manager (Kelly + Drawdown)
// ============================================================================

export interface RiskState {
  portfolioVaR: number;          // Value at Risk (5th percentile loss)
  maxDrawdown: number;           // Maximum peak-to-trough decline
  currentDrawdown: number;       // Current drawdown from peak
  kellyAllocations: Map<string, number>; // Optimal allocations per activity
  riskBudgetUsed: number;        // 0-1: how much of risk budget is consumed
  warnings: string[];
}

export interface RiskConfig {
  maxDrawdownPercent: number;    // Max allowed drawdown (default 20%)
  varConfidence: number;         // VaR confidence level (default 0.95)
  riskBudget: number;            // Total risk units available
  kellyMultiplier: number;       // Fraction of Kelly to use (0.5 = half-Kelly)
}

/**
 * Portfolio risk management.
 *
 * Combines:
 *   - Kelly criterion for optimal position sizing
 *   - Value at Risk (VaR) for tail risk monitoring
 *   - Maximum drawdown tracking and circuit breaker
 *   - Risk budget allocation across clusters
 */
export class RiskManager {
  private config: RiskConfig;
  private peakBalance: number = 0;
  private balanceHistory: number[] = [];
  private readonly maxHistory = 200;

  constructor(config?: Partial<RiskConfig>) {
    this.config = {
      maxDrawdownPercent: config?.maxDrawdownPercent ?? 0.20,
      varConfidence: config?.varConfidence ?? 0.95,
      riskBudget: config?.riskBudget ?? 1.0,
      kellyMultiplier: config?.kellyMultiplier ?? 0.5,
    };
  }

  /**
   * Assess current portfolio risk.
   */
  assess(
    currentBalance: number,
    beliefs: ActivityBeliefs,
    allocations: Map<string, number>,
    covariance: CovarianceStructure
  ): RiskState {
    const warnings: string[] = [];

    // Track balance for drawdown
    this.balanceHistory.push(currentBalance);
    if (this.balanceHistory.length > this.maxHistory) this.balanceHistory.shift();
    this.peakBalance = Math.max(this.peakBalance, currentBalance);

    // Current drawdown
    const currentDrawdown = this.peakBalance > 0
      ? (this.peakBalance - currentBalance) / this.peakBalance
      : 0;

    // Max historical drawdown
    let maxDrawdown = 0;
    let peak = 0;
    for (const bal of this.balanceHistory) {
      peak = Math.max(peak, bal);
      const dd = peak > 0 ? (peak - bal) / peak : 0;
      maxDrawdown = Math.max(maxDrawdown, dd);
    }

    // VaR estimation (parametric)
    const portfolioVar = this.estimateVaR(beliefs, allocations, covariance);

    // Kelly allocations
    const kellyAllocations = this.computeKellyAllocations(beliefs, allocations);

    // Risk budget usage
    const diversification = covariance.getDiversificationScore(allocations);
    const riskBudgetUsed = (1 - diversification) * (1 + currentDrawdown);

    // Warnings
    if (currentDrawdown > this.config.maxDrawdownPercent * 0.8) {
      warnings.push(`Drawdown approaching limit: ${(currentDrawdown * 100).toFixed(1)}%`);
    }
    if (currentDrawdown > this.config.maxDrawdownPercent) {
      warnings.push(`CIRCUIT BREAKER: Drawdown exceeded ${(this.config.maxDrawdownPercent * 100).toFixed(0)}%`);
    }
    if (riskBudgetUsed > 0.9) {
      warnings.push(`Risk budget nearly exhausted: ${(riskBudgetUsed * 100).toFixed(0)}%`);
    }

    return {
      portfolioVaR: portfolioVar,
      maxDrawdown,
      currentDrawdown,
      kellyAllocations,
      riskBudgetUsed,
      warnings,
    };
  }

  /**
   * Should we pause trading? (circuit breaker)
   */
  isCircuitBroken(currentBalance: number): boolean {
    if (this.peakBalance <= 0) return false;
    const drawdown = (this.peakBalance - currentBalance) / this.peakBalance;
    return drawdown > this.config.maxDrawdownPercent;
  }

  /**
   * Get risk-adjusted allocation limits.
   * Returns max allocation per activity considering drawdown and VaR.
   */
  getMaxAllocations(
    totalBudget: number,
    beliefs: ActivityBeliefs,
    covariance: CovarianceStructure
  ): Map<string, number> {
    const limits = new Map<string, number>();
    const allBeliefs = beliefs.getAllBeliefs();

    for (const belief of allBeliefs) {
      // Base: Kelly fraction of total budget
      const z = belief.mu / Math.max(Math.sqrt(belief.sigma2), 0.001);
      const winProb = normalCDF(z);
      const kelly = winProb > 0.5
        ? Math.min(0.4, (2 * winProb - 1) * this.config.kellyMultiplier)
        : 0.05;

      // Scale by cluster diversification
      const cluster = covariance.getCluster(belief.activityId);
      const clusterPenalty = cluster === 'crypto' ? 0.7 : 1.0; // Crypto gets less

      limits.set(belief.activityId, totalBudget * kelly * clusterPenalty);
    }

    return limits;
  }

  // ============================================================================
  // Private
  // ============================================================================

  private estimateVaR(
    beliefs: ActivityBeliefs,
    allocations: Map<string, number>,
    covariance: CovarianceStructure
  ): number {
    // Parametric VaR assuming normal returns
    // VaR = -μ_p + z_α × σ_p
    // where μ_p and σ_p are portfolio mean and std

    const allBeliefs = beliefs.getAllBeliefs();
    let portfolioMean = 0;
    let portfolioVariance = 0;
    const totalAlloc = [...allocations.values()].reduce((s, a) => s + a, 0);
    if (totalAlloc === 0) return 0;

    // Portfolio mean
    for (const belief of allBeliefs) {
      const weight = (allocations.get(belief.activityId) ?? 0) / totalAlloc;
      portfolioMean += weight * belief.mu;
    }

    // Portfolio variance (including covariances)
    for (const beliefI of allBeliefs) {
      for (const beliefJ of allBeliefs) {
        const wi = (allocations.get(beliefI.activityId) ?? 0) / totalAlloc;
        const wj = (allocations.get(beliefJ.activityId) ?? 0) / totalAlloc;
        const corr = covariance.getCorrelation(beliefI.activityId, beliefJ.activityId);
        const sigmaI = Math.sqrt(beliefI.sigma2);
        const sigmaJ = Math.sqrt(beliefJ.sigma2);
        portfolioVariance += wi * wj * corr * sigmaI * sigmaJ;
      }
    }

    const portfolioStd = Math.sqrt(Math.max(0, portfolioVariance));

    // z_α for 95% confidence
    const zAlpha = 1.645; // normalInvCDF(0.95)
    return Math.max(0, -portfolioMean + zAlpha * portfolioStd);
  }

  private computeKellyAllocations(
    beliefs: ActivityBeliefs,
    currentAllocations: Map<string, number>
  ): Map<string, number> {
    const kellyMap = new Map<string, number>();
    const totalBudget = [...currentAllocations.values()].reduce((s, a) => s + a, 0);

    for (const belief of beliefs.getAllBeliefs()) {
      const z = belief.mu / Math.max(Math.sqrt(belief.sigma2), 0.001);
      const p = normalCDF(z);
      const q = 1 - p;

      if (p > 0.01 && q > 0.01) {
        const b = Math.max(belief.mu, 0.01) / Math.max(Math.sqrt(belief.sigma2), 0.01);
        const kelly = Math.max(0, (p * b - q) / Math.max(b, 0.01));
        kellyMap.set(belief.activityId, totalBudget * Math.min(0.4, kelly * this.config.kellyMultiplier));
      } else {
        kellyMap.set(belief.activityId, totalBudget * 0.05);
      }
    }

    return kellyMap;
  }

  reset(): void {
    this.peakBalance = 0;
    this.balanceHistory = [];
  }
}

// ============================================================================
// 5. Integrated Variational Engine
// ============================================================================

export interface VariationalEngineState {
  vfe: VFEState;
  risk: RiskState;
  scores: PrecisionEFEScore[];
  diversificationScore: number;
  circuitBroken: boolean;
}

/**
 * Unified variational engine: VFE + Precision EFE + Risk.
 * This is the main entry point for precision-weighted action selection.
 */
export class VariationalEngine {
  public readonly vfe: VariationalFreeEnergy;
  public readonly precisionEFE: PrecisionWeightedEFE;
  public readonly covariance: CovarianceStructure;
  public readonly risk: RiskManager;

  constructor(options?: {
    vfeConfig?: Partial<VFEConfig>;
    precisionConfig?: Partial<PrecisionEFEConfig>;
    covarianceConfig?: Partial<CovarianceConfig>;
    riskConfig?: Partial<RiskConfig>;
  }) {
    this.vfe = new VariationalFreeEnergy(options?.vfeConfig);
    this.precisionEFE = new PrecisionWeightedEFE(options?.precisionConfig);
    this.covariance = new CovarianceStructure(options?.covarianceConfig);
    this.risk = new RiskManager(options?.riskConfig);
  }

  /**
   * Full variational step: compute VFE, score with precision, assess risk.
   */
  step(params: {
    activities: ActivityProfile[];
    beliefs: ActivityBeliefs;
    allocations: Map<string, number>;
    observations: Array<{ activityId: string; observedROI: number }>;
    regimeFactor: number;
    targetROI: number;
    currentBalance: number;
  }): VariationalEngineState {
    // 1. Compute VFE (model surprise)
    const vfeState = this.vfe.compute(params.beliefs, params.observations);

    // 2. Record returns for covariance estimation
    for (const obs of params.observations) {
      this.covariance.recordReturn(obs.activityId, obs.observedROI);
    }

    // 3. Score with precision-weighted EFE
    const scores = this.precisionEFE.score(
      params.activities,
      params.beliefs,
      params.allocations,
      this.covariance,
      params.regimeFactor,
      params.targetROI
    );

    // 4. Risk assessment
    const riskState = this.risk.assess(
      params.currentBalance,
      params.beliefs,
      params.allocations,
      this.covariance
    );

    // 5. Diversification
    const diversificationScore = this.covariance.getDiversificationScore(params.allocations);

    // 6. Circuit breaker
    const circuitBroken = this.risk.isCircuitBroken(params.currentBalance);

    return {
      vfe: vfeState,
      risk: riskState,
      scores,
      diversificationScore,
      circuitBroken,
    };
  }

  reset(): void {
    this.vfe.reset();
    this.risk.reset();
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Standard normal CDF approximation (Abramowitz & Stegun).
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Pearson correlation coefficient.
 */
function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;

  let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
    sumAB += a[i] * b[i];
    sumA2 += a[i] * a[i];
    sumB2 += b[i] * b[i];
  }

  const num = n * sumAB - sumA * sumB;
  const den = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB));

  return den > 1e-10 ? num / den : 0;
}

// ============================================================================
// Singleton
// ============================================================================

let engineInstance: VariationalEngine | null = null;

export function getVariationalEngine(options?: {
  vfeConfig?: Partial<VFEConfig>;
  precisionConfig?: Partial<PrecisionEFEConfig>;
  covarianceConfig?: Partial<CovarianceConfig>;
  riskConfig?: Partial<RiskConfig>;
}): VariationalEngine {
  if (!engineInstance) {
    engineInstance = new VariationalEngine(options);
  }
  return engineInstance;
}

export function resetVariationalEngine(): void {
  engineInstance = null;
}
