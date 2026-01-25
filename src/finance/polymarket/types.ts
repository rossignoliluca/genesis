/**
 * Polymarket Integration - Type Definitions
 *
 * Types for prediction market trading using Active Inference.
 * Polymarket is a decentralized information market where users can trade
 * on the outcome of future events.
 *
 * Scientific grounding:
 * - Markets as distributed inference engines (Hayek, 1945)
 * - Information aggregation through trading (Wolfers & Zitzewitz, 2004)
 * - Active Inference for market participation (Friston et al., 2015)
 */

// ============================================================================
// Polymarket API Types
// ============================================================================

export interface PolymarketMarket {
  id: string;
  question: string;
  description: string;
  outcomes: string[];
  active: boolean;
  closed: boolean;
  endDate: string;
  volume: number;
  liquidity: number;
  category: string;
  tags: string[];
}

export interface MarketPrice {
  marketId: string;
  outcome: string;
  price: number;       // 0-1 probability
  timestamp: string;
}

export interface OrderbookLevel {
  price: number;
  size: number;
}

export interface Orderbook {
  marketId: string;
  outcome: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: string;
}

export interface Trade {
  id: string;
  marketId: string;
  outcome: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  timestamp: string;
  status: 'pending' | 'filled' | 'cancelled' | 'rejected';
  txHash?: string;
}

export interface Position {
  marketId: string;
  outcome: string;
  shares: number;
  averagePrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  realizedPnL: number;
}

export interface PortfolioStats {
  totalValue: number;
  totalPnL: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  activePositions: number;
  tradesCount: number;
}

// ============================================================================
// Active Inference for Trading
// ============================================================================

/**
 * Belief state about a market outcome
 */
export interface MarketBelief {
  marketId: string;
  outcome: string;

  // Probabilistic beliefs
  subjective_p: number;        // Our belief about true probability
  market_p: number;             // Current market price (crowd belief)
  confidence: number;           // Certainty in our belief (inverse entropy)

  // Information-theoretic measures
  surprise: number;             // KL(market || subjective)
  information_gain: number;     // Expected reduction in uncertainty

  // Temporal dynamics
  trend: 'bullish' | 'bearish' | 'neutral';
  momentum: number;
  volatility: number;

  updatedAt: string;
}

/**
 * Trading policy derived from beliefs and preferences
 */
export interface TradingPolicy {
  marketId: string;
  outcome: string;

  // Action probabilities
  action: 'buy' | 'sell' | 'hold';
  confidence: number;

  // Position sizing
  targetShares: number;
  maxRisk: number;              // Max loss in dollars

  // Expected Free Energy components
  efe: number;                  // Total Expected Free Energy
  pragmaticValue: number;       // Expected reward
  epistemicValue: number;       // Information gain

  // Risk modulation
  riskTolerance: number;        // From neuromodulation (cortisol)
  explorationBonus: number;     // From neuromodulation (dopamine)

  reason: string;
}

/**
 * Market filter criteria
 */
export interface MarketFilter {
  categories?: string[];
  tags?: string[];
  minLiquidity?: number;
  minVolume?: number;
  maxEndDate?: string;
  activeOnly?: boolean;
  keywords?: string[];
}

/**
 * Strategy configuration
 */
export interface StrategyConfig {
  // Active Inference parameters
  beliefUpdateRate: number;     // How fast to update beliefs (0-1)
  epistemeicWeight: number;     // Weight on information gain vs profit
  priorStrength: number;        // Strength of initial priors

  // Risk management
  maxPositionSize: number;      // Max $ per position
  maxPortfolioRisk: number;     // Max total $ at risk
  minEdge: number;              // Minimum edge to trade (subjective_p - market_p)

  // Neuromodulation integration
  useNeuromodulation: boolean;  // Adjust risk based on cortisol/dopamine

  // Simulation mode
  simulationMode: boolean;      // Don't execute real trades
}

// ============================================================================
// Events for Event Bus Integration
// ============================================================================

export interface MarketDiscoveredEvent {
  market: PolymarketMarket;
  relevance: number;
  source: string;
}

export interface BeliefUpdatedEvent {
  belief: MarketBelief;
  previousBelief: MarketBelief | null;
  surprise: number;
}

export interface TradeExecutedEvent {
  trade: Trade;
  policy: TradingPolicy;
  expectedPnL: number;
  neuromodState: {
    dopamine: number;
    cortisol: number;
    riskTolerance: number;
  };
}

export interface PositionClosedEvent {
  position: Position;
  realizedPnL: number;
  holdingPeriod: number;
  outcome: 'win' | 'loss';
}

export interface PortfolioUpdateEvent {
  stats: PortfolioStats;
  delta: {
    value: number;
    pnl: number;
  };
}

// ============================================================================
// Mock Data for Simulation
// ============================================================================

export interface MockMarketConfig {
  updateIntervalMs: number;
  volatility: number;
  trendStrength: number;
}
