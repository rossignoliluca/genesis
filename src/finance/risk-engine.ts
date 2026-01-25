/**
 * Genesis Finance - Risk Engine
 *
 * Risk management: VaR, drawdown tracking, position sizing.
 * Integrates with nociception (pain) and neuromodulation (cortisol).
 */

import type {
  VaRResult,
  DrawdownAnalysis,
  PositionSize,
  OHLCV,
  MarketRegime,
} from './types.js';
import type { MarketDataAggregator } from './market-data.js';
import type { RegimeDetector } from './regime-detector.js';

// ============================================================================
// Risk Engine
// ============================================================================

export class RiskEngine {
  private drawdownHistory = new Map<string, number[]>();
  private peakPrices = new Map<string, number>();
  private varCache = new Map<string, VaRResult>();

  constructor(
    private marketData: MarketDataAggregator,
    private regimeDetector: RegimeDetector,
    private defaultRiskPerTrade: number = 0.02,
    private defaultKellyFraction: number = 0.25,
  ) {}

  // --------------------------------------------------------------------------
  // Value at Risk (VaR)
  // --------------------------------------------------------------------------

  /**
   * Calculate Value at Risk using historical simulation
   */
  calculateVaR(
    symbol: string,
    confidenceLevel: number = 0.95,
    horizon: number = 1,
  ): VaRResult {
    const history = this.marketData.getPriceHistory(symbol, 252); // 1 year of data

    if (history.length < 30) {
      // Insufficient data, return default
      return this.defaultVaR(symbol);
    }

    // Calculate historical returns
    const returns = this.calculateReturns(history);

    // Sort returns
    const sortedReturns = [...returns].sort((a, b) => a - b);

    // Find VaR at confidence level (e.g., 5th percentile for 95% confidence)
    const var95Index = Math.floor((1 - confidenceLevel) * sortedReturns.length);
    const var99Index = Math.floor(0.01 * sortedReturns.length);

    const var95 = -sortedReturns[var95Index]; // Negative because we want loss
    const var99 = -sortedReturns[var99Index];

    // Conditional VaR (CVaR / Expected Shortfall)
    const tailReturns = sortedReturns.slice(0, var95Index);
    const cvar95 = tailReturns.length > 0
      ? -tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length
      : var95;

    // Historical volatility
    const volatility = this.marketData.calculateVolatility(symbol);

    // Scale to horizon (square root of time rule)
    const scalingFactor = Math.sqrt(horizon);

    const result: VaRResult = {
      symbol,
      timestamp: Date.now(),
      var95: var95 * scalingFactor,
      var99: var99 * scalingFactor,
      cvar95: cvar95 * scalingFactor,
      method: 'historical',
      volatility,
      horizon,
    };

    this.varCache.set(symbol, result);
    return result;
  }

  /**
   * Calculate parametric VaR (assumes normal distribution)
   */
  calculateParametricVaR(
    symbol: string,
    confidenceLevel: number = 0.95,
    horizon: number = 1,
  ): VaRResult {
    const volatility = this.marketData.calculateVolatility(symbol);

    // Z-scores for confidence levels
    const z95 = 1.645;  // 95% one-tailed
    const z99 = 2.326;  // 99% one-tailed

    // VaR = Z * σ * sqrt(horizon)
    const scalingFactor = Math.sqrt(horizon);
    const var95 = z95 * volatility * scalingFactor;
    const var99 = z99 * volatility * scalingFactor;

    // CVaR for normal distribution: σ * φ(Z) / (1 - confidence)
    // Simplified approximation
    const cvar95 = var95 * 1.2;

    return {
      symbol,
      timestamp: Date.now(),
      var95,
      var99,
      cvar95,
      method: 'parametric',
      volatility,
      horizon,
    };
  }

  // --------------------------------------------------------------------------
  // Drawdown Analysis
  // --------------------------------------------------------------------------

  /**
   * Analyze drawdown for a symbol
   */
  analyzeDrawdown(symbol: string): DrawdownAnalysis {
    const history = this.marketData.getPriceHistory(symbol, 252);

    if (history.length < 10) {
      return this.defaultDrawdownAnalysis(symbol);
    }

    const closes = history.map(c => c.close);

    // Track running maximum and drawdowns
    let peak = closes[0];
    const drawdowns: number[] = [];
    let currentDrawdownDays = 0;
    const drawdownDurations: number[] = [];
    let inDrawdown = false;

    for (let i = 0; i < closes.length; i++) {
      if (closes[i] > peak) {
        peak = closes[i];

        // Exiting drawdown
        if (inDrawdown) {
          drawdownDurations.push(currentDrawdownDays);
          currentDrawdownDays = 0;
          inDrawdown = false;
        }
      } else {
        inDrawdown = true;
        currentDrawdownDays++;
      }

      const drawdown = (peak - closes[i]) / peak;
      drawdowns.push(drawdown);
    }

    // Update peak price
    this.peakPrices.set(symbol, peak);

    // Calculate statistics
    const currentPrice = closes[closes.length - 1];
    const currentDrawdown = (peak - currentPrice) / peak;

    const maxDrawdown = Math.max(...drawdowns);
    const avgDrawdown = drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length;

    const maxDrawdownDuration = drawdownDurations.length > 0
      ? Math.max(...drawdownDurations)
      : 0;

    const avgRecoveryDays = drawdownDurations.length > 0
      ? drawdownDurations.reduce((a, b) => a + b, 0) / drawdownDurations.length
      : 0;

    // Estimate recovery probability based on current regime
    const regime = this.regimeDetector.getCurrentRegime(symbol);
    const recoveryProbability = this.estimateRecoveryProbability(regime, currentDrawdown);

    // Calculate pain level (for nociception integration)
    const painLevel = this.calculatePainLevel(currentDrawdown, maxDrawdown);

    const analysis: DrawdownAnalysis = {
      symbol,
      timestamp: Date.now(),
      currentDrawdown,
      currentDrawdownDays,
      maxDrawdown,
      avgDrawdown,
      maxDrawdownDuration,
      avgRecoveryDays,
      recoveryProbability,
      painLevel,
    };

    // Store in history
    const history_dd = this.drawdownHistory.get(symbol) || [];
    history_dd.push(currentDrawdown);
    if (history_dd.length > 252) {
      history_dd.shift();
    }
    this.drawdownHistory.set(symbol, history_dd);

    return analysis;
  }

  /**
   * Calculate pain level from drawdown (0-1)
   */
  private calculatePainLevel(currentDrawdown: number, maxDrawdown: number): number {
    // Pain increases non-linearly with drawdown
    // Using quadratic function: pain = (dd / maxDD)^2

    if (maxDrawdown === 0) return 0;

    const normalizedDD = Math.min(1, currentDrawdown / maxDrawdown);
    return Math.pow(normalizedDD, 2);
  }

  /**
   * Estimate recovery probability based on regime
   */
  private estimateRecoveryProbability(regime: MarketRegime, drawdown: number): number {
    // Base probabilities by regime
    const baseProbabilities: Record<MarketRegime, number> = {
      bull: 0.8,
      neutral: 0.6,
      bear: 0.3,
      crisis: 0.1,
    };

    let prob = baseProbabilities[regime];

    // Adjust for drawdown severity
    // Deeper drawdowns are harder to recover from
    prob *= (1 - drawdown * 0.5);

    return Math.max(0, Math.min(1, prob));
  }

  // --------------------------------------------------------------------------
  // Position Sizing
  // --------------------------------------------------------------------------

  /**
   * Calculate recommended position size using Kelly criterion and risk constraints
   */
  calculatePositionSize(
    symbol: string,
    signalStrength: number,
    signalConfidence: number,
    portfolioValue: number,
    options?: {
      cortisolLevel?: number;      // 0-1, high cortisol reduces risk
      maxDrawdown?: number;         // Current portfolio drawdown
      riskPerTrade?: number;        // Override default
      kellyFraction?: number;       // Override default
    },
  ): PositionSize {
    const riskPerTrade = options?.riskPerTrade || this.defaultRiskPerTrade;
    const kellyFraction = options?.kellyFraction || this.defaultKellyFraction;

    // Calculate Kelly criterion
    // K = (p * b - q) / b
    // where p = win probability, q = loss probability, b = win/loss ratio
    const winProb = (signalConfidence + signalStrength) / 2; // Simplified
    const lossProb = 1 - winProb;
    const winLossRatio = 2; // Assume 2:1 reward/risk ratio

    const kellyCriterion = (winProb * winLossRatio - lossProb) / winLossRatio;
    const kellyPosition = Math.max(0, kellyCriterion * kellyFraction);

    // Calculate VaR-based size
    const var95 = this.calculateVaR(symbol).var95;
    const varPosition = var95 > 0 ? riskPerTrade / var95 : 0;

    // Take minimum of Kelly and VaR constraints
    let recommendedSize = Math.min(kellyPosition, varPosition);

    // Apply neuromodulation adjustment (cortisol)
    let cortisolAdjustment = 1.0;
    if (options?.cortisolLevel !== undefined) {
      // High cortisol (stress) reduces risk-taking
      // Cortisol > 0.7 -> reduce position size
      cortisolAdjustment = 1 - Math.max(0, (options.cortisolLevel - 0.5) * 0.8);
      recommendedSize *= cortisolAdjustment;
    }

    // Apply confidence adjustment
    const confidenceAdjustment = signalConfidence;
    recommendedSize *= confidenceAdjustment;

    // Apply drawdown adjustment
    if (options?.maxDrawdown !== undefined && options.maxDrawdown > 0.1) {
      // In drawdown, reduce position size
      const ddAdjustment = 1 - (options.maxDrawdown * 0.5);
      recommendedSize *= ddAdjustment;
    }

    // Cap at maximum position size (20% of portfolio)
    const maxSize = 0.2;
    recommendedSize = Math.min(recommendedSize, maxSize);

    // Calculate max loss
    const maxLoss = portfolioValue * recommendedSize * var95;

    const reasoning = this.buildPositionSizeReasoning({
      kellyCriterion,
      kellyPosition,
      varPosition,
      cortisolAdjustment,
      confidenceAdjustment,
      recommendedSize,
    });

    return {
      symbol,
      recommendedSize,
      maxSize,
      kellyCriterion,
      kellyFraction,
      riskPerTrade,
      maxLoss,
      cortisolAdjustment,
      confidenceAdjustment,
      reasoning,
    };
  }

  /**
   * Build reasoning for position size
   */
  private buildPositionSizeReasoning(params: any): string {
    const parts: string[] = [];

    parts.push(`Kelly criterion: ${(params.kellyCriterion * 100).toFixed(1)}%`);
    parts.push(`Kelly position: ${(params.kellyPosition * 100).toFixed(1)}%`);
    parts.push(`VaR-constrained: ${(params.varPosition * 100).toFixed(1)}%`);

    if (params.cortisolAdjustment < 1.0) {
      parts.push(`Cortisol adjustment: ${(params.cortisolAdjustment * 100).toFixed(0)}%`);
    }

    if (params.confidenceAdjustment < 1.0) {
      parts.push(`Confidence adjustment: ${(params.confidenceAdjustment * 100).toFixed(0)}%`);
    }

    parts.push(`Final size: ${(params.recommendedSize * 100).toFixed(1)}%`);

    return parts.join('. ');
  }

  // --------------------------------------------------------------------------
  // Risk Metrics
  // --------------------------------------------------------------------------

  /**
   * Calculate Sharpe ratio
   */
  calculateSharpeRatio(returns: number[], riskFreeRate: number = 0.02): number {
    if (returns.length === 0) return 0;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // Annualize (assuming daily returns)
    const annualizedReturn = mean * 252;
    const annualizedVol = stdDev * Math.sqrt(252);

    return (annualizedReturn - riskFreeRate) / annualizedVol;
  }

  /**
   * Calculate maximum drawdown from return series
   */
  calculateMaxDrawdown(returns: number[]): number {
    if (returns.length === 0) return 0;

    let peak = 1;
    let maxDD = 0;
    let cumulative = 1;

    for (const ret of returns) {
      cumulative *= (1 + ret);

      if (cumulative > peak) {
        peak = cumulative;
      }

      const dd = (peak - cumulative) / peak;
      if (dd > maxDD) {
        maxDD = dd;
      }
    }

    return maxDD;
  }

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  /**
   * Calculate returns from OHLCV history
   */
  private calculateReturns(history: OHLCV[]): number[] {
    const returns: number[] = [];

    for (let i = 1; i < history.length; i++) {
      const ret = (history[i].close - history[i - 1].close) / history[i - 1].close;
      returns.push(ret);
    }

    return returns;
  }

  /**
   * Default VaR when insufficient data
   */
  private defaultVaR(symbol: string): VaRResult {
    return {
      symbol,
      timestamp: Date.now(),
      var95: 0.05,   // 5% daily VaR
      var99: 0.08,   // 8% daily VaR
      cvar95: 0.06,
      method: 'historical',
      volatility: 0.3,
      horizon: 1,
    };
  }

  /**
   * Default drawdown analysis when insufficient data
   */
  private defaultDrawdownAnalysis(symbol: string): DrawdownAnalysis {
    return {
      symbol,
      timestamp: Date.now(),
      currentDrawdown: 0,
      currentDrawdownDays: 0,
      maxDrawdown: 0,
      avgDrawdown: 0,
      maxDrawdownDuration: 0,
      avgRecoveryDays: 0,
      recoveryProbability: 0.5,
      painLevel: 0,
    };
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.drawdownHistory.clear();
    this.peakPrices.clear();
    this.varCache.clear();
  }
}
