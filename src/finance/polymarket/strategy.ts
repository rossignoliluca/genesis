/**
 * Active Inference Trading Strategy
 *
 * Uses Free Energy Principle to trade prediction markets:
 * - Beliefs: Subjective probabilities about outcomes
 * - Observations: Market prices (crowd wisdom)
 * - Actions: Buy/sell/hold decisions
 * - Preferences: Profit + information gain
 *
 * Key insight: Markets are inference engines. When our belief differs
 * from market price, we have an edge AND can gain information by trading.
 *
 * Scientific grounding:
 * - Active Inference for decision-making (Friston et al., 2015)
 * - Information markets (Wolfers & Zitzewitz, 2004)
 * - Kelly Criterion for position sizing (Kelly, 1956)
 */

import type { PolymarketClient } from './client.js';
import type { MarketMonitor } from './markets.js';
import type {
  PolymarketMarket,
  MarketBelief,
  TradingPolicy,
  StrategyConfig,
} from './types.js';

// ============================================================================
// Belief Formation
// ============================================================================

export class BeliefSystem {
  private beliefs: Map<string, MarketBelief> = new Map();
  private config: StrategyConfig;

  constructor(config: StrategyConfig) {
    this.config = config;
  }

  /**
   * Form initial belief about a market outcome.
   * In a real system, this would use:
   * - Historical data analysis
   * - News sentiment
   * - Expert predictions
   * - Statistical models
   *
   * For now, uses heuristics and market price as starting point.
   */
  async formBelief(
    client: PolymarketClient,
    market: PolymarketMarket,
    outcome: string,
    monitor: MarketMonitor
  ): Promise<MarketBelief> {
    const key = `${market.id}:${outcome}`;

    // Get market price (crowd belief)
    const priceData = await client.getPrice(market.id, outcome);
    const market_p = priceData.price;

    // Get market dynamics
    const volatility = monitor.getVolatility(market.id, outcome);
    const trend = monitor.getTrend(market.id, outcome);
    const momentum = monitor.getMomentum(market.id, outcome);

    // Form subjective probability
    // Start with market price, then adjust based on:
    // 1. Our domain expertise (if we know this domain)
    // 2. Market inefficiencies (low liquidity, high volatility)
    // 3. Recent trends (momentum)

    let subjective_p = market_p;

    // Apply expertise adjustment (simplified - would use ML in production)
    const expertiseAdjustment = this.getExpertiseAdjustment(market, outcome);
    subjective_p += expertiseAdjustment;

    // Apply trend/momentum
    subjective_p += momentum * 0.1;

    // Clamp to [0.01, 0.99]
    subjective_p = Math.max(0.01, Math.min(0.99, subjective_p));

    // Calculate information-theoretic measures
    const surprise = this.klDivergence(market_p, subjective_p);
    const confidence = 1 / (1 + volatility * 10); // Lower volatility = higher confidence

    // Information gain from taking a position
    const information_gain = Math.abs(subjective_p - market_p) * (1 - volatility);

    const belief: MarketBelief = {
      marketId: market.id,
      outcome,
      subjective_p,
      market_p,
      confidence,
      surprise,
      information_gain,
      trend: this.classifyTrend(trend),
      momentum,
      volatility,
      updatedAt: new Date().toISOString(),
    };

    this.beliefs.set(key, belief);
    return belief;
  }

  /**
   * Update existing belief based on new observations
   */
  async updateBelief(
    client: PolymarketClient,
    marketId: string,
    outcome: string,
    monitor: MarketMonitor
  ): Promise<MarketBelief | null> {
    const key = `${marketId}:${outcome}`;
    const existing = this.beliefs.get(key);

    if (!existing) return null;

    // Get new market price
    const priceData = await client.getPrice(marketId, outcome);
    const new_market_p = priceData.price;

    // Bayesian update: blend old belief with new market signal
    const alpha = this.config.beliefUpdateRate;
    const subjective_p = (1 - alpha) * existing.subjective_p + alpha * new_market_p;

    // Update dynamics
    const volatility = monitor.getVolatility(marketId, outcome);
    const trend = monitor.getTrend(marketId, outcome);
    const momentum = monitor.getMomentum(marketId, outcome);

    const updated: MarketBelief = {
      ...existing,
      subjective_p,
      market_p: new_market_p,
      confidence: 1 / (1 + volatility * 10),
      surprise: this.klDivergence(new_market_p, subjective_p),
      information_gain: Math.abs(subjective_p - new_market_p) * (1 - volatility),
      trend: this.classifyTrend(trend),
      momentum,
      volatility,
      updatedAt: new Date().toISOString(),
    };

    this.beliefs.set(key, updated);
    return updated;
  }

  /**
   * Get belief for a market outcome
   */
  getBelief(marketId: string, outcome: string): MarketBelief | null {
    return this.beliefs.get(`${marketId}:${outcome}`) ?? null;
  }

  /**
   * Get all beliefs
   */
  getAllBeliefs(): MarketBelief[] {
    return Array.from(this.beliefs.values());
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private getExpertiseAdjustment(market: PolymarketMarket, outcome: string): number {
    // Simplified expertise model
    // In production, would use:
    // - Historical prediction accuracy in this domain
    // - Sentiment analysis of relevant data
    // - Statistical models

    const techDomains = ['technology', 'ai', 'crypto', 'software'];
    if (techDomains.includes(market.category)) {
      // We have expertise here - slightly adjust based on question analysis
      const question = market.question.toLowerCase();

      // Example: AGI prediction
      if (question.includes('agi')) {
        // Conservative estimate - AGI is hard
        return outcome === 'NO' ? 0.05 : -0.05;
      }

      // Example: Bitcoin price
      if (question.includes('bitcoin') && question.includes('100')) {
        // Moderate bullishness on crypto
        return outcome === 'YES' ? 0.02 : -0.02;
      }
    }

    return 0; // No adjustment for domains outside expertise
  }

  private klDivergence(p: number, q: number): number {
    // KL(P||Q) for binary distributions
    const kl_yes = p * Math.log((p + 1e-10) / (q + 1e-10));
    const kl_no = (1 - p) * Math.log((1 - p + 1e-10) / (1 - q + 1e-10));
    return kl_yes + kl_no;
  }

  private classifyTrend(trend: number): 'bullish' | 'bearish' | 'neutral' {
    if (trend > 0.02) return 'bullish';
    if (trend < -0.02) return 'bearish';
    return 'neutral';
  }
}

// ============================================================================
// Policy Inference (Action Selection)
// ============================================================================

export class PolicyInference {
  private config: StrategyConfig;

  constructor(config: StrategyConfig) {
    this.config = config;
  }

  /**
   * Infer optimal trading action using Expected Free Energy.
   *
   * EFE = Pragmatic Value + Epistemic Value
   *
   * Pragmatic Value: Expected profit/loss
   * Epistemic Value: Information gained by taking position
   */
  inferPolicy(
    belief: MarketBelief,
    currentPosition: number, // Current shares held
    neuromodState?: {
      riskTolerance: number;
      explorationBonus: number;
    }
  ): TradingPolicy {
    const edge = belief.subjective_p - belief.market_p;
    const absEdge = Math.abs(edge);

    // Neuromodulation affects risk and exploration
    const riskTolerance = neuromodState?.riskTolerance ?? 0.5;
    const explorationBonus = neuromodState?.explorationBonus ?? 1.0;

    // Calculate Expected Free Energy components

    // Pragmatic value: Expected profit
    // Kelly criterion: f = edge / odds
    const odds = belief.market_p / (1 - belief.market_p);
    const kellyFraction = edge / odds;
    const pragmaticValue = kellyFraction * belief.confidence * riskTolerance;

    // Epistemic value: Information gain
    // Higher when we disagree with market AND uncertainty is high
    const epistemicValue = belief.information_gain * explorationBonus * this.config.epistemeicWeight;

    // Total Expected Free Energy (minimize)
    // Negative because we want to maximize value
    const efe = -(pragmaticValue + epistemicValue);

    // Determine action
    let action: 'buy' | 'sell' | 'hold';
    let targetShares = 0;
    let reason = '';

    if (absEdge < this.config.minEdge) {
      // No significant edge
      action = 'hold';
      targetShares = currentPosition;
      reason = `No edge: market=${belief.market_p.toFixed(3)}, subjective=${belief.subjective_p.toFixed(3)}`;
    } else if (edge > 0) {
      // Market underpricing - buy
      action = 'buy';
      const positionSize = this.calculatePositionSize(belief, riskTolerance);
      targetShares = positionSize;
      reason = `Underpriced: edge=${edge.toFixed(3)}, confidence=${belief.confidence.toFixed(2)}`;
    } else {
      // Market overpricing - sell or short
      action = currentPosition > 0 ? 'sell' : 'hold';
      targetShares = 0;
      reason = `Overpriced: edge=${edge.toFixed(3)}, reducing position`;
    }

    // Risk limit
    const maxRisk = Math.min(
      this.config.maxPositionSize,
      this.config.maxPortfolioRisk * riskTolerance
    );

    return {
      marketId: belief.marketId,
      outcome: belief.outcome,
      action,
      confidence: belief.confidence,
      targetShares,
      maxRisk,
      efe,
      pragmaticValue,
      epistemicValue,
      riskTolerance,
      explorationBonus,
      reason,
    };
  }

  /**
   * Calculate position size using Kelly Criterion with risk limits
   */
  private calculatePositionSize(
    belief: MarketBelief,
    riskTolerance: number
  ): number {
    const edge = belief.subjective_p - belief.market_p;
    const odds = belief.market_p / (1 - belief.market_p);

    // Kelly fraction
    let kellyFraction = edge / odds;

    // Apply fractional Kelly (conservative)
    kellyFraction *= 0.25; // Use 1/4 Kelly for safety

    // Adjust for confidence and risk tolerance
    kellyFraction *= belief.confidence * riskTolerance;

    // Convert to dollar amount
    const positionSize = kellyFraction * this.config.maxPositionSize;

    // Convert to shares (assuming $1 per share at current price)
    const shares = positionSize / belief.market_p;

    return Math.max(0, Math.round(shares));
  }
}

// ============================================================================
// Main Strategy Controller
// ============================================================================

export class ActiveInferenceStrategy {
  private beliefSystem: BeliefSystem;
  private policyInference: PolicyInference;
  private config: StrategyConfig;

  constructor(config: StrategyConfig) {
    this.config = config;
    this.beliefSystem = new BeliefSystem(config);
    this.policyInference = new PolicyInference(config);
  }

  /**
   * Analyze a market and generate trading policy
   */
  async analyzeMarket(
    client: PolymarketClient,
    market: PolymarketMarket,
    outcome: string,
    monitor: MarketMonitor,
    currentPosition = 0,
    neuromodState?: {
      riskTolerance: number;
      explorationBonus: number;
    }
  ): Promise<{ belief: MarketBelief; policy: TradingPolicy }> {
    // Form or update belief
    let belief = this.beliefSystem.getBelief(market.id, outcome);

    if (!belief) {
      belief = await this.beliefSystem.formBelief(client, market, outcome, monitor);
    } else {
      belief = await this.beliefSystem.updateBelief(client, market.id, outcome, monitor) ?? belief;
    }

    // Infer policy
    const policy = this.policyInference.inferPolicy(
      belief,
      currentPosition,
      neuromodState
    );

    return { belief, policy };
  }

  /**
   * Get all current beliefs
   */
  getBeliefs(): MarketBelief[] {
    return this.beliefSystem.getAllBeliefs();
  }

  /**
   * Get belief for specific market
   */
  getBelief(marketId: string, outcome: string): MarketBelief | null {
    return this.beliefSystem.getBelief(marketId, outcome);
  }

  /**
   * Get configuration
   */
  getConfig(): StrategyConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<StrategyConfig>): void {
    this.config = { ...this.config, ...config };
    this.beliefSystem = new BeliefSystem(this.config);
    this.policyInference = new PolicyInference(this.config);
  }
}
