/**
 * Generative Economic Model — Bayesian World Model for Active Inference
 *
 * The missing piece: a proper generative model P(o, s | a) that the EFE
 * can plan over. Without this, the system is reactive rather than predictive.
 *
 * Components:
 *
 * 1. ActivityBeliefs: Per-activity Gaussian beliefs about ROI
 *    - Prior: N(μ_prior, σ²_prior) from estimated ROI
 *    - Posterior: Updated via conjugate Bayesian update after each observation
 *    - Provides ambiguity (posterior variance) and pragmatic value (posterior mean)
 *
 * 2. MarketRegime: Hidden Markov Model over market conditions
 *    - States: Bull (high yields), Neutral, Bear (low yields)
 *    - Transition: T[i][j] estimated from observation sequence
 *    - Emission: Each regime multiplies base ROI by a regime factor
 *    - Inference: Forward algorithm (filtering)
 *
 * 3. AdaptiveTemperature: Annealing schedule for Boltzmann selection
 *    - β = f(NESS_deviation, contraction_stability, cycle_count)
 *    - Low β (explore) when deviation is high or contraction unstable
 *    - High β (exploit) when at steady state
 *
 * 4. TemporalPlanning: 2-step lookahead EFE
 *    - G(a_now) + γ × E[G(a_next | a_now)]
 *    - Captures "invest now, earn later" policies
 *
 * Reference:
 *   Da Costa et al. (2020) "Active inference on discrete state-spaces"
 *   Friston et al. (2017) "Active inference, curiosity and insight"
 */

import { getEconomicFiber } from './fiber.js';
import { type ActivityProfile } from './capital-allocator.js';
import { type EFEScore } from './economic-intelligence.js';

// ============================================================================
// 1. Bayesian Activity Beliefs
// ============================================================================

export interface ActivityBelief {
  activityId: string;
  // Gaussian posterior on ROI: N(mu, sigma²)
  mu: number;            // Posterior mean ROI
  sigma2: number;        // Posterior variance
  // Sufficient statistics
  n: number;             // Number of observations
  sumX: number;          // Sum of observed ROIs
  sumX2: number;         // Sum of squared ROIs
  // Prior
  mu0: number;           // Prior mean (from estimatedROI)
  kappa0: number;        // Prior strength (pseudo-observations)
  alpha0: number;        // Inverse-gamma prior shape
  beta0: number;         // Inverse-gamma prior scale
  // Derived
  precision: number;     // 1/sigma2 (confidence)
  lastObserved: number;  // Timestamp
}

export interface BeliefConfig {
  priorStrength: number;       // kappa0: how much to trust prior (default 2)
  minVariance: number;         // Floor on posterior variance
  decayRate: number;           // Per-cycle decay of old observations (forgetting)
  maxObservations: number;     // Cap on effective observations
}

/**
 * Bayesian belief state over activity ROIs.
 *
 * Uses Normal-Inverse-Gamma conjugate prior:
 *   ROI_i ~ N(μ_i, σ²_i)
 *   μ_i | σ²_i ~ N(μ₀, σ²_i / κ₀)
 *   σ²_i ~ IG(α₀, β₀)
 *
 * Posterior update is analytic (no MCMC needed).
 */
export class ActivityBeliefs {
  private beliefs: Map<string, ActivityBelief> = new Map();
  private config: BeliefConfig;

  constructor(config?: Partial<BeliefConfig>) {
    this.config = {
      priorStrength: config?.priorStrength ?? 2,
      minVariance: config?.minVariance ?? 0.01,
      decayRate: config?.decayRate ?? 0.995,
      maxObservations: config?.maxObservations ?? 200,
    };
  }

  /**
   * Initialize belief for an activity from its profile.
   */
  initializeBelief(activity: ActivityProfile): void {
    if (this.beliefs.has(activity.id)) return;

    const mu0 = activity.estimatedROI;
    const kappa0 = this.config.priorStrength;
    // Prior variance proportional to risk level
    const priorVariance = Math.max(this.config.minVariance, activity.riskLevel * 2);

    this.beliefs.set(activity.id, {
      activityId: activity.id,
      mu: mu0,
      sigma2: priorVariance,
      n: 0,
      sumX: 0,
      sumX2: 0,
      mu0,
      kappa0,
      alpha0: 2, // Weakly informative
      beta0: priorVariance * 2,
      precision: 1 / priorVariance,
      lastObserved: Date.now(),
    });
  }

  /**
   * Update belief after observing an activity's ROI.
   * Conjugate Normal-Inverse-Gamma update.
   */
  update(activityId: string, observedROI: number): void {
    const belief = this.beliefs.get(activityId);
    if (!belief) return;

    // Apply forgetting (exponential decay of effective observations)
    if (belief.n > 0) {
      belief.n *= this.config.decayRate;
      belief.sumX *= this.config.decayRate;
      belief.sumX2 *= this.config.decayRate;
    }

    // Cap effective observations
    if (belief.n >= this.config.maxObservations) {
      const ratio = (this.config.maxObservations - 1) / belief.n;
      belief.n *= ratio;
      belief.sumX *= ratio;
      belief.sumX2 *= ratio;
    }

    // Add new observation
    belief.n += 1;
    belief.sumX += observedROI;
    belief.sumX2 += observedROI * observedROI;

    // Posterior parameters (Normal-Inverse-Gamma conjugate update)
    const kappaN = belief.kappa0 + belief.n;
    const muN = (belief.kappa0 * belief.mu0 + belief.sumX) / kappaN;
    const alphaN = belief.alpha0 + belief.n / 2;

    // Sample variance
    const sampleMean = belief.n > 0 ? belief.sumX / belief.n : belief.mu0;
    const sampleVar = belief.n > 1
      ? (belief.sumX2 - belief.n * sampleMean * sampleMean) / (belief.n - 1)
      : belief.beta0 / belief.alpha0;

    const betaN = belief.beta0
      + 0.5 * Math.max(0, sampleVar) * belief.n
      + 0.5 * (belief.kappa0 * belief.n / kappaN) * (sampleMean - belief.mu0) ** 2;

    // Posterior mean and variance of ROI
    belief.mu = muN;
    belief.sigma2 = Math.max(this.config.minVariance, betaN / (alphaN - 1));
    belief.precision = 1 / belief.sigma2;
    belief.lastObserved = Date.now();
  }

  /**
   * Get the current belief for an activity.
   */
  getBelief(activityId: string): ActivityBelief | undefined {
    return this.beliefs.get(activityId);
  }

  /**
   * Get ambiguity (uncertainty) for an activity.
   * Higher = more uncertain about the ROI.
   */
  getAmbiguity(activityId: string): number {
    const belief = this.beliefs.get(activityId);
    if (!belief) return 1.0;
    return Math.sqrt(belief.sigma2);
  }

  /**
   * Get expected ROI (posterior mean).
   */
  getExpectedROI(activityId: string): number {
    const belief = this.beliefs.get(activityId);
    if (!belief) return 0;
    return belief.mu;
  }

  /**
   * Get information gain from observing this activity.
   * = Expected reduction in entropy of the posterior.
   * Approximation: proportional to 1/(n + kappa0)
   */
  getInformationGain(activityId: string): number {
    const belief = this.beliefs.get(activityId);
    if (!belief) return 1.0;
    // Info gain decreases with more observations
    return 1 / (1 + belief.n / this.config.priorStrength);
  }

  /**
   * Get all beliefs as array.
   */
  getAllBeliefs(): ActivityBelief[] {
    return [...this.beliefs.values()];
  }

  /**
   * Reset all beliefs.
   */
  reset(): void {
    this.beliefs.clear();
  }
}

// ============================================================================
// 2. Market Regime (Hidden Markov Model)
// ============================================================================

export type RegimeState = 'bull' | 'neutral' | 'bear';

export interface RegimeConfig {
  transitionMatrix: number[][];    // 3×3 transition probabilities
  emissionFactors: Record<RegimeState, number>; // ROI multipliers per regime
  observationNoise: number;        // Noise in regime observation
  regimeInertia: number;           // How sticky regimes are (higher = stickier)
}

export interface RegimeInference {
  currentRegime: RegimeState;
  beliefDistribution: number[];     // P(regime) = [P(bull), P(neutral), P(bear)]
  regimeFactor: number;             // Expected ROI multiplier given current beliefs
  entropy: number;                  // Uncertainty about regime
  transitionsSeen: number;
}

/**
 * Hidden Markov Model for market regime inference.
 *
 * Three regimes:
 *   Bull: High DeFi yields, bounties abundant, gas cheap
 *   Neutral: Normal conditions
 *   Bear: Low yields, fewer bounties, high gas
 *
 * The regime multiplies all activity ROI expectations.
 * Inference uses forward algorithm (filtering).
 */
export class MarketRegime {
  private config: RegimeConfig;
  private belief: number[] = [0.2, 0.6, 0.2]; // P(bull, neutral, bear)
  private history: RegimeState[] = [];
  private observationCount: number = 0;
  private readonly states: RegimeState[] = ['bull', 'neutral', 'bear'];
  private readonly maxHistory = 200;

  constructor(config?: Partial<RegimeConfig>) {
    this.config = {
      transitionMatrix: config?.transitionMatrix ?? [
        // From\To:  bull    neutral  bear
        [0.7, 0.25, 0.05],  // From bull
        [0.15, 0.7, 0.15],  // From neutral
        [0.05, 0.25, 0.7],  // From bear
      ],
      emissionFactors: config?.emissionFactors ?? {
        bull: 1.5,      // 50% higher ROI in bull market
        neutral: 1.0,   // Normal ROI
        bear: 0.5,      // 50% lower ROI in bear market
      },
      observationNoise: config?.observationNoise ?? 0.3,
      regimeInertia: config?.regimeInertia ?? 0.8,
    };
  }

  /**
   * Observe aggregate portfolio performance and update regime belief.
   *
   * observation: ratio of actual/expected ROI across all activities.
   *   > 1.3 suggests bull, < 0.7 suggests bear, ~1.0 suggests neutral.
   */
  observe(aggregateROIRatio: number): RegimeInference {
    this.observationCount++;

    // Emission likelihood: P(observation | regime)
    const likelihoods = this.states.map((state, i) => {
      const expectedRatio = this.config.emissionFactors[state];
      const diff = aggregateROIRatio - expectedRatio;
      const noise = this.config.observationNoise;
      return Math.exp(-0.5 * (diff / noise) ** 2) / (noise * Math.sqrt(2 * Math.PI));
    });

    // Forward step: predict then update
    // Predict: P(s_t | o_{1:t-1}) = Σ_s_{t-1} T[s_{t-1}][s_t] × P(s_{t-1} | o_{1:t-1})
    const predicted = [0, 0, 0];
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        predicted[j] += this.config.transitionMatrix[i][j] * this.belief[i];
      }
    }

    // Update: P(s_t | o_{1:t}) ∝ P(o_t | s_t) × P(s_t | o_{1:t-1})
    const unnormalized = predicted.map((p, i) => p * likelihoods[i]);
    const normZ = unnormalized.reduce((s, u) => s + u, 0);
    this.belief = normZ > 0
      ? unnormalized.map(u => u / normZ)
      : [0.2, 0.6, 0.2];

    // Apply inertia (smooth transitions)
    const inertia = this.config.regimeInertia;
    this.belief = this.belief.map((b, i) => {
      const prior = [0.2, 0.6, 0.2][i]; // Mild pull toward neutral
      return inertia * b + (1 - inertia) * prior;
    });
    // Renormalize
    const sum = this.belief.reduce((s, b) => s + b, 0);
    this.belief = this.belief.map(b => b / sum);

    // Determine most likely regime
    const maxIdx = this.belief.indexOf(Math.max(...this.belief));
    const currentRegime = this.states[maxIdx];
    this.history.push(currentRegime);
    if (this.history.length > this.maxHistory) this.history.shift();

    // Expected factor: E[factor] = Σ P(s) × factor(s)
    const regimeFactor = this.states.reduce((s, state, i) => {
      return s + this.belief[i] * this.config.emissionFactors[state];
    }, 0);

    // Entropy of belief
    const entropy = -this.belief.reduce((s, p) => {
      return p > 1e-10 ? s + p * Math.log(p) : s;
    }, 0);

    return {
      currentRegime,
      beliefDistribution: [...this.belief],
      regimeFactor,
      entropy,
      transitionsSeen: this.observationCount,
    };
  }

  /**
   * Get expected ROI multiplier given current regime beliefs.
   */
  getRegimeFactor(): number {
    return this.states.reduce((s, state, i) => {
      return s + this.belief[i] * this.config.emissionFactors[state];
    }, 0);
  }

  /**
   * Get current regime belief distribution.
   */
  getBeliefDistribution(): { bull: number; neutral: number; bear: number } {
    return {
      bull: this.belief[0],
      neutral: this.belief[1],
      bear: this.belief[2],
    };
  }

  /**
   * Get regime uncertainty (entropy).
   */
  getEntropy(): number {
    return -this.belief.reduce((s, p) => {
      return p > 1e-10 ? s + p * Math.log(p) : s;
    }, 0);
  }

  reset(): void {
    this.belief = [0.2, 0.6, 0.2];
    this.history = [];
    this.observationCount = 0;
  }
}

// ============================================================================
// 3. Adaptive Temperature (Boltzmann Annealing)
// ============================================================================

export interface TemperatureConfig {
  betaMin: number;          // Minimum β (max exploration)
  betaMax: number;          // Maximum β (max exploitation)
  nessWeight: number;       // How much NESS deviation affects β
  contractionWeight: number; // How much instability affects β
  cycleWeight: number;      // How much experience (cycles) affects β
  smoothingAlpha: number;   // EMA smoothing for β updates
}

export interface TemperatureState {
  beta: number;             // Current temperature parameter
  explorationRatio: number; // 0 = pure exploit, 1 = pure explore
  nessContribution: number;
  contractionContribution: number;
  cycleContribution: number;
}

/**
 * Adaptive temperature for Boltzmann action selection.
 *
 * β = β_min + (β_max - β_min) × σ(composite_score)
 *
 * composite_score considers:
 *   - NESS deviation: high deviation → low β (explore)
 *   - Contraction stability: unstable → low β (cautious)
 *   - Cycle count: more experience → higher β (exploit knowledge)
 *
 * The sigmoid ensures smooth transitions.
 */
export class AdaptiveTemperature {
  private config: TemperatureConfig;
  private currentBeta: number;
  private history: number[] = [];
  private readonly maxHistory = 50;

  constructor(config?: Partial<TemperatureConfig>) {
    this.config = {
      betaMin: config?.betaMin ?? 1.0,
      betaMax: config?.betaMax ?? 15.0,
      nessWeight: config?.nessWeight ?? 2.0,
      contractionWeight: config?.contractionWeight ?? 1.5,
      cycleWeight: config?.cycleWeight ?? 0.5,
      smoothingAlpha: config?.smoothingAlpha ?? 0.1,
    };
    this.currentBeta = this.config.betaMin;
  }

  /**
   * Compute adaptive β given current system state.
   */
  compute(params: {
    nessDeviation: number;       // 0 = at NESS, higher = further away
    contractionStable: boolean;  // Is E[log Lip] < 0?
    logLipAvg: number;           // Actual contraction value
    cycleCount: number;          // Total cycles executed
    regimeEntropy: number;       // Regime uncertainty (0 = certain, ln(3) = max)
  }): TemperatureState {
    // NESS contribution: deviation → explore (low score)
    // At NESS (dev=0): contributes +1, Far from NESS (dev=1): contributes 0
    const nessScore = Math.max(0, 1 - params.nessDeviation * this.config.nessWeight);

    // Contraction contribution: stable → exploit (high score)
    const contractionScore = params.contractionStable
      ? Math.min(1, Math.abs(params.logLipAvg) * this.config.contractionWeight)
      : 0;

    // Cycle contribution: more cycles → exploit (high score), saturates
    const cycleScore = 1 - 1 / (1 + params.cycleCount * 0.01 * this.config.cycleWeight);

    // Regime entropy: uncertain market → explore (reduces score)
    const maxEntropy = Math.log(3); // ln(3) for 3 regimes
    const regimePenalty = params.regimeEntropy / maxEntropy; // 0-1

    // Composite: weighted average
    const composite = 0.4 * nessScore
      + 0.3 * contractionScore
      + 0.2 * cycleScore
      - 0.1 * regimePenalty;

    // Sigmoid mapping to [betaMin, betaMax]
    const sigmoid = 1 / (1 + Math.exp(-5 * (composite - 0.5)));
    const targetBeta = this.config.betaMin + (this.config.betaMax - this.config.betaMin) * sigmoid;

    // EMA smoothing
    this.currentBeta = (1 - this.config.smoothingAlpha) * this.currentBeta
      + this.config.smoothingAlpha * targetBeta;

    this.history.push(this.currentBeta);
    if (this.history.length > this.maxHistory) this.history.shift();

    return {
      beta: this.currentBeta,
      explorationRatio: 1 - sigmoid,
      nessContribution: nessScore,
      contractionContribution: contractionScore,
      cycleContribution: cycleScore,
    };
  }

  getBeta(): number {
    return this.currentBeta;
  }

  reset(): void {
    this.currentBeta = this.config.betaMin;
    this.history = [];
  }
}

// ============================================================================
// 4. Temporal Planning (2-step Lookahead)
// ============================================================================

export interface TemporalPlan {
  immediateAction: string;           // Best action now
  lookaheadAction: string | null;    // Expected best action next cycle
  immediateG: number;                // EFE of immediate action
  lookaheadG: number;                // Expected EFE of next step
  totalG: number;                    // G_now + γ × E[G_next]
  enablesActivities: string[];      // Activities this unlocks for next step
}

export interface PlannerConfig {
  discountGamma: number;    // Discount factor for future EFE (default 0.7)
  lookaheadDepth: number;   // Steps to look ahead (1 or 2)
  sampleCount: number;      // Monte Carlo samples for E[G_next]
}

/**
 * Temporal planner: evaluates multi-step policies.
 *
 * For each candidate action a_now:
 *   1. Compute G(a_now) as before
 *   2. Simulate: "If I execute a_now, what ROI do I expect?"
 *   3. Update belief virtually → new posterior
 *   4. Score next actions under new posterior → E[min G(a_next)]
 *   5. Total: G_total = G(a_now) + γ × E[min G(a_next)]
 *
 * This captures policies like:
 *   - "Execute bounty-hunter now (learn about market) → enables better keeper next"
 *   - "Invest in compute-provider now (low immediate return) → meta-orchestrator gets capacity"
 */
export class TemporalPlanner {
  private config: PlannerConfig;

  constructor(config?: Partial<PlannerConfig>) {
    this.config = {
      discountGamma: config?.discountGamma ?? 0.7,
      lookaheadDepth: config?.lookaheadDepth ?? 1,
      sampleCount: config?.sampleCount ?? 5,
    };
  }

  /**
   * Evaluate a candidate action with temporal lookahead.
   */
  evaluate(
    candidateId: string,
    currentScores: EFEScore[],
    beliefs: ActivityBeliefs,
    activities: ActivityProfile[],
    allocations: Map<string, number>,
    regimeFactor: number,
  ): TemporalPlan {
    const immediateScore = currentScores.find(s => s.activityId === candidateId);
    const immediateG = immediateScore?.G ?? 0;

    // Simulate executing this action
    const belief = beliefs.getBelief(candidateId);
    const expectedROI = belief ? belief.mu * regimeFactor : 0;

    // Virtual belief update: what would our beliefs look like after observation?
    // Approximate: variance decreases, mean shifts toward expected
    const virtualVarianceReduction = belief
      ? belief.sigma2 / (belief.n + this.priorStrengthProxy + 1)
      : 0;

    // Estimate next-step EFE: how does reduced uncertainty help?
    // After observing candidate, its ambiguity drops
    let lookaheadG = 0;
    const remainingScores = currentScores.filter(s => s.activityId !== candidateId);

    if (remainingScores.length > 0 && this.config.lookaheadDepth > 0) {
      // Monte Carlo: sample possible outcomes and compute expected next G
      let totalNextG = 0;
      for (let s = 0; s < this.config.sampleCount; s++) {
        // Sample: activity we'd pick next, given updated beliefs
        // Approximation: the best remaining action with reduced ambiguity for the observed one
        const adjustedScores = remainingScores.map(score => {
          // After observing candidate, cross-correlations don't change much
          // But overall regime uncertainty might decrease
          const regimeInfoGain = virtualVarianceReduction * 0.1;
          return {
            ...score,
            G: score.G - regimeInfoGain, // Slightly better info state
          };
        });
        const bestNext = adjustedScores.reduce((a, b) => a.G < b.G ? a : b);
        totalNextG += bestNext.G;
      }
      lookaheadG = totalNextG / this.config.sampleCount;
    }

    const totalG = immediateG + this.config.discountGamma * lookaheadG;

    // Check what this action enables (phase dependencies)
    const enablesActivities = this.getEnabledByExecution(candidateId, activities);

    return {
      immediateAction: candidateId,
      lookaheadAction: currentScores.length > 1
        ? currentScores.find(s => s.activityId !== candidateId)?.activityId ?? null
        : null,
      immediateG,
      lookaheadG,
      totalG,
      enablesActivities,
    };
  }

  /**
   * Rank all candidates with temporal planning.
   */
  rankWithLookahead(
    candidates: EFEScore[],
    beliefs: ActivityBeliefs,
    activities: ActivityProfile[],
    allocations: Map<string, number>,
    regimeFactor: number,
  ): TemporalPlan[] {
    const plans = candidates.map(score =>
      this.evaluate(score.activityId, candidates, beliefs, activities, allocations, regimeFactor)
    );
    return plans.sort((a, b) => a.totalG - b.totalG);
  }

  private get priorStrengthProxy(): number {
    return 2; // Match ActivityBeliefs default kappa0
  }

  private getEnabledByExecution(activityId: string, activities: ActivityProfile[]): string[] {
    // Certain activities enable others by generating capital or data
    const enableMap: Record<string, string[]> = {
      'mcp-marketplace': ['memory-service', 'meta-orchestrator'],
      'keeper': ['cross-l2-arb', 'yield-optimizer'],
      'bounty-hunter': ['grants'],
      'content-engine': ['grants'],
      'x402-facilitator': ['meta-orchestrator'],
      'yield-optimizer': ['compute-provider'],
    };
    return enableMap[activityId] ?? [];
  }
}

// ============================================================================
// 5. Integrated Generative Model
// ============================================================================

export interface GenerativeModelState {
  beliefs: ActivityBelief[];
  regime: RegimeInference;
  temperature: TemperatureState;
  bestPlan: TemporalPlan | null;
}

/**
 * Unified generative model combining all components.
 * This is the main entry point for the autonomous controller.
 */
export class GenerativeEconomicModel {
  public readonly beliefs: ActivityBeliefs;
  public readonly regime: MarketRegime;
  public readonly temperature: AdaptiveTemperature;
  public readonly planner: TemporalPlanner;

  constructor(options?: {
    beliefConfig?: Partial<BeliefConfig>;
    regimeConfig?: Partial<RegimeConfig>;
    temperatureConfig?: Partial<TemperatureConfig>;
    plannerConfig?: Partial<PlannerConfig>;
  }) {
    this.beliefs = new ActivityBeliefs(options?.beliefConfig);
    this.regime = new MarketRegime(options?.regimeConfig);
    this.temperature = new AdaptiveTemperature(options?.temperatureConfig);
    this.planner = new TemporalPlanner(options?.plannerConfig);
  }

  /**
   * Initialize beliefs for all activities.
   */
  initializeActivities(activities: ActivityProfile[]): void {
    for (const activity of activities) {
      this.beliefs.initializeBelief(activity);
    }
  }

  /**
   * Full inference step: update beliefs, infer regime, adapt temperature.
   * Call this once per controller cycle.
   */
  infer(params: {
    activityResults: Array<{ id: string; roi: number }>;
    nessDeviation: number;
    contractionStable: boolean;
    logLipAvg: number;
    cycleCount: number;
  }): GenerativeModelState {
    // 1. Update activity beliefs with observed ROIs
    for (const result of params.activityResults) {
      this.beliefs.update(result.id, result.roi);
    }

    // 2. Infer market regime from aggregate performance
    const allBeliefs = this.beliefs.getAllBeliefs();
    const expectedTotal = allBeliefs.reduce((s, b) => s + b.mu0, 0);
    const observedTotal = allBeliefs.reduce((s, b) => s + b.mu, 0);
    const aggregateRatio = expectedTotal > 0 ? observedTotal / expectedTotal : 1.0;
    const regimeState = this.regime.observe(aggregateRatio);

    // 3. Adapt temperature
    const tempState = this.temperature.compute({
      nessDeviation: params.nessDeviation,
      contractionStable: params.contractionStable,
      logLipAvg: params.logLipAvg,
      cycleCount: params.cycleCount,
      regimeEntropy: regimeState.entropy,
    });

    return {
      beliefs: allBeliefs,
      regime: regimeState,
      temperature: tempState,
      bestPlan: null, // Set by controller after scoring
    };
  }

  /**
   * Get regime-adjusted expected ROI for an activity.
   */
  getAdjustedROI(activityId: string): number {
    const expectedROI = this.beliefs.getExpectedROI(activityId);
    return expectedROI * this.regime.getRegimeFactor();
  }

  /**
   * Get the current adaptive temperature (β).
   */
  getBeta(): number {
    return this.temperature.getBeta();
  }

  /**
   * Get regime factor for EFE scoring.
   */
  getRegimeFactor(): number {
    return this.regime.getRegimeFactor();
  }

  /**
   * Get state summary.
   */
  getState(): GenerativeModelState {
    return {
      beliefs: this.beliefs.getAllBeliefs(),
      regime: {
        currentRegime: this.regime.getBeliefDistribution().bull > 0.5 ? 'bull'
          : this.regime.getBeliefDistribution().bear > 0.5 ? 'bear'
          : 'neutral',
        beliefDistribution: [
          this.regime.getBeliefDistribution().bull,
          this.regime.getBeliefDistribution().neutral,
          this.regime.getBeliefDistribution().bear,
        ],
        regimeFactor: this.regime.getRegimeFactor(),
        entropy: this.regime.getEntropy(),
        transitionsSeen: 0,
      },
      temperature: {
        beta: this.temperature.getBeta(),
        explorationRatio: 0,
        nessContribution: 0,
        contractionContribution: 0,
        cycleContribution: 0,
      },
      bestPlan: null,
    };
  }

  reset(): void {
    this.beliefs.reset();
    this.regime.reset();
    this.temperature.reset();
  }
}

// ============================================================================
// Singleton
// ============================================================================

let modelInstance: GenerativeEconomicModel | null = null;

export function getGenerativeModel(options?: {
  beliefConfig?: Partial<BeliefConfig>;
  regimeConfig?: Partial<RegimeConfig>;
  temperatureConfig?: Partial<TemperatureConfig>;
  plannerConfig?: Partial<PlannerConfig>;
}): GenerativeEconomicModel {
  if (!modelInstance) {
    modelInstance = new GenerativeEconomicModel(options);
  }
  return modelInstance;
}

export function resetGenerativeModel(): void {
  modelInstance = null;
}
