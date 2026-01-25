/**
 * Genesis Finance Module - Types
 *
 * Financial data types for market analysis, trading signals, and portfolio management.
 * Integrates with Active Inference for uncertainty quantification.
 */

// ============================================================================
// Market Data Types
// ============================================================================

/**
 * OHLCV candlestick data
 */
export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Market data snapshot for a symbol
 */
export interface MarketSnapshot {
  symbol: string;
  timestamp: number;
  price: number;
  volume24h: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volatility: number;  // Annualized volatility estimate
  source: DataSource;
}

export type DataSource = 'coinbase' | 'binance' | 'alpaca' | 'yahoo' | 'simulation';

/**
 * Order book snapshot
 */
export interface OrderBook {
  symbol: string;
  timestamp: number;
  bids: [price: number, size: number][];
  asks: [price: number, size: number][];
  spread: number;
  midPrice: number;
}

// ============================================================================
// Trading Signal Types
// ============================================================================

/**
 * Trading signal with Active Inference beliefs
 */
export interface TradingSignal {
  symbol: string;
  timestamp: number;

  // Signal direction
  direction: 'long' | 'short' | 'neutral';
  strength: number;  // 0-1, confidence in direction

  // Active Inference beliefs about market state
  beliefs: MarketBeliefs;

  // Uncertainty quantification
  uncertainty: number;  // 0-1, epistemic uncertainty
  surprise: number;     // Bayesian surprise from latest observation

  // Recommended action
  action: TradeAction;
  positionSize: number;  // Fraction of capital (0-1)

  // Risk metrics
  stopLoss?: number;
  takeProfit?: number;
  maxDrawdown: number;

  // Reasoning
  factors: SignalFactor[];
  reasoning: string;
}

/**
 * Active Inference beliefs about market state
 */
export interface MarketBeliefs {
  regime: RegimeBeliefs;      // Bull/bear/neutral
  trend: TrendBeliefs;        // Up/down/sideways
  volatility: VolatilityBeliefs;  // High/medium/low
  momentum: number[];         // Momentum distribution
}

export interface RegimeBeliefs {
  bull: number;     // P(bull market)
  bear: number;     // P(bear market)
  neutral: number;  // P(neutral/ranging)
}

export interface TrendBeliefs {
  up: number;
  down: number;
  sideways: number;
}

export interface VolatilityBeliefs {
  high: number;
  medium: number;
  low: number;
}

/**
 * Trade action recommendation
 */
export type TradeAction =
  | 'buy'
  | 'sell'
  | 'hold'
  | 'reduce'   // Reduce position size
  | 'exit';    // Exit position entirely

/**
 * Factor contributing to a signal
 */
export interface SignalFactor {
  name: string;
  value: number;
  weight: number;
  description: string;
}

// ============================================================================
// Market Regime Types
// ============================================================================

/**
 * Market regime classification
 */
export type MarketRegime = 'bull' | 'bear' | 'neutral' | 'crisis';

/**
 * Regime detection result
 */
export interface RegimeDetection {
  regime: MarketRegime;
  confidence: number;

  // Regime characteristics
  trendStrength: number;     // 0-1
  volatilityLevel: number;   // 0-1
  volumeProfile: number;     // 0-1 (relative to average)

  // Regime transition probabilities
  transitionProb: {
    bull: number;
    bear: number;
    neutral: number;
    crisis: number;
  };

  // Supporting evidence
  indicators: RegimeIndicator[];

  timestamp: number;
}

export interface RegimeIndicator {
  name: string;
  value: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  weight: number;
}

// ============================================================================
// Risk Engine Types
// ============================================================================

/**
 * Value at Risk calculation
 */
export interface VaRResult {
  symbol: string;
  timestamp: number;

  // VaR at different confidence levels
  var95: number;   // 95% confidence
  var99: number;   // 99% confidence
  cvar95: number;  // Conditional VaR (expected shortfall)

  // Method used
  method: 'historical' | 'parametric' | 'montecarlo';

  // Historical volatility
  volatility: number;

  // Time horizon (days)
  horizon: number;
}

/**
 * Drawdown analysis
 */
export interface DrawdownAnalysis {
  symbol: string;
  timestamp: number;

  // Current drawdown
  currentDrawdown: number;      // % from peak
  currentDrawdownDays: number;

  // Historical drawdowns
  maxDrawdown: number;
  avgDrawdown: number;
  maxDrawdownDuration: number;  // Days

  // Recovery analysis
  avgRecoveryDays: number;
  recoveryProbability: number;  // Based on regime

  // Pain signal (for nociception integration)
  painLevel: number;  // 0-1, based on drawdown severity
}

/**
 * Position sizing recommendation
 */
export interface PositionSize {
  symbol: string;
  recommendedSize: number;      // Fraction of portfolio (0-1)
  maxSize: number;              // Risk-adjusted maximum

  // Kelly criterion
  kellyCriterion: number;
  kellyFraction: number;        // Conservative fraction of Kelly

  // Risk constraints
  riskPerTrade: number;         // % of portfolio at risk
  maxLoss: number;              // Maximum $ loss

  // Neuromodulation adjustment
  cortisolAdjustment: number;   // Risk reduction due to stress
  confidenceAdjustment: number; // Adjustment based on signal confidence

  reasoning: string;
}

// ============================================================================
// Portfolio Types
// ============================================================================

/**
 * Current position in a symbol
 */
export interface Position {
  symbol: string;
  size: number;              // Number of units
  entryPrice: number;
  currentPrice: number;

  // P&L
  unrealizedPnL: number;
  unrealizedPnLPercent: number;

  // Cost basis
  costBasis: number;
  marketValue: number;

  // Position metrics
  holdingPeriod: number;     // Days
  entryTimestamp: number;

  // Stop loss / take profit
  stopLoss?: number;
  takeProfit?: number;
}

/**
 * Portfolio state
 */
export interface Portfolio {
  timestamp: number;

  // Cash and positions
  cash: number;
  positions: Map<string, Position>;

  // Portfolio metrics
  totalValue: number;
  totalPnL: number;
  totalPnLPercent: number;

  // Allocation
  cashPercent: number;
  positionCount: number;
  concentration: number;     // Herfindahl index

  // Risk metrics
  portfolioVar95: number;
  portfolioBeta: number;
  sharpeRatio: number;
  maxDrawdown: number;

  // Performance
  dailyReturn: number;
  cumulativeReturn: number;
  winRate: number;

  // Active Inference state
  explorationMode: boolean;  // Exploring vs exploiting
  uncertaintyLevel: number;  // Overall portfolio uncertainty
}

/**
 * Portfolio optimization result
 */
export interface PortfolioOptimization {
  timestamp: number;

  // Recommended weights
  targetWeights: Map<string, number>;
  currentWeights: Map<string, number>;

  // Rebalancing trades
  trades: RebalanceTrade[];

  // Expected metrics
  expectedReturn: number;
  expectedVolatility: number;
  expectedSharpe: number;

  // Optimization method
  method: 'meanVariance' | 'riskParity' | 'minVariance' | 'maxSharpe';

  // Constraints used
  constraints: OptimizationConstraints;
}

export interface RebalanceTrade {
  symbol: string;
  action: 'buy' | 'sell';
  quantity: number;
  currentWeight: number;
  targetWeight: number;
}

export interface OptimizationConstraints {
  maxPositionSize: number;   // Max % per position
  minPositionSize: number;   // Min % to hold
  maxTurnover: number;       // Max % to trade
  targetVolatility?: number; // Target portfolio vol
}

// ============================================================================
// Historical Data Types
// ============================================================================

/**
 * Historical price series
 */
export interface PriceSeries {
  symbol: string;
  interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';
  data: OHLCV[];
  startTime: number;
  endTime: number;
}

/**
 * Technical indicators
 */
export interface Indicators {
  sma20?: number;
  sma50?: number;
  sma200?: number;
  ema12?: number;
  ema26?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;
  bollingerUpper?: number;
  bollingerMiddle?: number;
  bollingerLower?: number;
  atr?: number;
  stochastic?: number;
  obv?: number;
}

// ============================================================================
// Event Types
// ============================================================================

export type FinanceEventType =
  | 'market_data_updated'
  | 'signal_generated'
  | 'regime_changed'
  | 'drawdown_alert'
  | 'position_opened'
  | 'position_closed'
  | 'portfolio_rebalanced'
  | 'risk_limit_exceeded'
  | 'surprise_high'
  | 'opportunity_detected';

export interface FinanceEvent {
  type: FinanceEventType;
  timestamp: number;
  data: Record<string, any>;
  precision: number;  // Event reliability (0-1)
  source: string;
}

export type FinanceEventHandler = (event: FinanceEvent) => void;

// ============================================================================
// Configuration Types
// ============================================================================

export interface FinanceConfig {
  // Market data
  dataSource: DataSource;
  updateInterval: number;     // ms
  symbols: string[];

  // Signal generation
  signalInterval: number;     // ms
  minSignalStrength: number;  // 0-1
  maxUncertainty: number;     // 0-1

  // Risk management
  maxPositionSize: number;    // Fraction of portfolio
  maxDrawdown: number;        // Max acceptable drawdown %
  riskPerTrade: number;       // % of portfolio per trade
  kellyFraction: number;      // Fraction of Kelly criterion (0.25 = quarter Kelly)

  // Active Inference integration
  beliefUpdateRate: number;   // How fast to update beliefs (0-1)
  explorationRate: number;    // Exploration vs exploitation (0-1)
  priorStrength: number;      // Weight of prior beliefs (0-1)

  // Neuromodulation effects
  cortisolRiskReduction: boolean;  // Reduce risk when cortisol high
  dopamineExploration: boolean;    // Increase exploration with dopamine

  // Nociception integration
  drawdownPainThreshold: number;   // Drawdown % that triggers pain
  painIntensityMultiplier: number; // Pain intensity scaling

  // Portfolio optimization
  rebalanceInterval: number;   // ms
  optimizationMethod: 'meanVariance' | 'riskParity' | 'minVariance' | 'maxSharpe';
}

export const DEFAULT_FINANCE_CONFIG: FinanceConfig = {
  dataSource: 'simulation',
  updateInterval: 60000,      // 1 minute
  symbols: ['BTC', 'ETH', 'SPY'],

  signalInterval: 300000,     // 5 minutes
  minSignalStrength: 0.3,
  maxUncertainty: 0.7,

  maxPositionSize: 0.2,       // 20% max per position
  maxDrawdown: 0.15,          // 15% max drawdown
  riskPerTrade: 0.02,         // 2% risk per trade
  kellyFraction: 0.25,        // Quarter Kelly (conservative)

  beliefUpdateRate: 0.1,      // Slow belief updates
  explorationRate: 0.1,       // 10% exploration
  priorStrength: 0.3,         // Moderate prior weight

  cortisolRiskReduction: true,
  dopamineExploration: true,

  drawdownPainThreshold: 0.05, // 5% drawdown triggers pain
  painIntensityMultiplier: 10,

  rebalanceInterval: 3600000,  // 1 hour
  optimizationMethod: 'meanVariance',
};
