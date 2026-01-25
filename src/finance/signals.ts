/**
 * Genesis Finance - Trading Signal Generator
 *
 * Generates trading signals using Active Inference beliefs for uncertainty quantification.
 * Integrates market regime, technical indicators, and risk metrics.
 */

import type {
  TradingSignal,
  MarketBeliefs,
  TradeAction,
  SignalFactor,
  TrendBeliefs,
  VolatilityBeliefs,
} from './types.js';
import type { Beliefs } from '../active-inference/types.js';
import type { MarketDataAggregator } from './market-data.js';
import type { RegimeDetector } from './regime-detector.js';
import type { RiskEngine } from './risk-engine.js';

// ============================================================================
// Signal Generator
// ============================================================================

export class SignalGenerator {
  private lastSignals = new Map<string, TradingSignal>();
  private signalHistory = new Map<string, TradingSignal[]>();

  constructor(
    private marketData: MarketDataAggregator,
    private regimeDetector: RegimeDetector,
    private riskEngine: RiskEngine,
    private minSignalStrength: number = 0.3,
  ) {}

  // --------------------------------------------------------------------------
  // Signal Generation
  // --------------------------------------------------------------------------

  /**
   * Generate trading signal for a symbol
   */
  generateSignal(
    symbol: string,
    activeInferenceBeliefs?: Beliefs,
  ): TradingSignal {
    const snapshot = this.marketData.getSnapshot(symbol);
    const indicators = this.marketData.calculateIndicators(symbol);
    const regime = this.regimeDetector.detectRegime(symbol);
    const drawdown = this.riskEngine.analyzeDrawdown(symbol);

    if (!snapshot) {
      return this.createNeutralSignal(symbol);
    }

    // Calculate market beliefs
    const marketBeliefs = this.calculateMarketBeliefs(symbol, regime, indicators);

    // Calculate signal factors
    const factors = this.calculateSignalFactors(symbol, indicators, regime);

    // Aggregate factors into signal direction and strength
    const { direction, strength } = this.aggregateFactors(factors);

    // Calculate uncertainty (epistemic + aleatoric)
    const uncertainty = this.calculateUncertainty(
      marketBeliefs,
      activeInferenceBeliefs,
      regime.confidence,
    );

    // Calculate Bayesian surprise
    const surprise = this.calculateSurprise(symbol, snapshot);

    // Determine recommended action
    const action = this.determineAction(
      direction,
      strength,
      uncertainty,
      drawdown.currentDrawdown,
    );

    // Calculate position size
    const positionSize = this.calculatePositionSize(
      strength,
      uncertainty,
      action,
    );

    // Calculate stop loss and take profit
    const { stopLoss, takeProfit } = this.calculateStopLossTakeProfit(
      snapshot.price,
      direction,
      indicators.atr || snapshot.volatility * snapshot.price,
    );

    // Build reasoning
    const reasoning = this.buildReasoning(factors, direction, strength, uncertainty);

    const signal: TradingSignal = {
      symbol,
      timestamp: Date.now(),
      direction,
      strength,
      beliefs: marketBeliefs,
      uncertainty,
      surprise,
      action,
      positionSize,
      stopLoss,
      takeProfit,
      maxDrawdown: drawdown.maxDrawdown,
      factors,
      reasoning,
    };

    // Store signal
    this.lastSignals.set(symbol, signal);
    this.addToHistory(symbol, signal);

    return signal;
  }

  /**
   * Get last signal for a symbol
   */
  getLastSignal(symbol: string): TradingSignal | null {
    return this.lastSignals.get(symbol) || null;
  }

  /**
   * Get signal history
   */
  getSignalHistory(symbol: string, limit: number = 10): TradingSignal[] {
    const history = this.signalHistory.get(symbol) || [];
    return history.slice(-limit);
  }

  // --------------------------------------------------------------------------
  // Market Beliefs Calculation
  // --------------------------------------------------------------------------

  /**
   * Calculate market beliefs (regime, trend, volatility, momentum)
   */
  private calculateMarketBeliefs(
    symbol: string,
    regime: any,
    indicators: any,
  ): MarketBeliefs {
    // Regime beliefs from regime detector
    const regimeBeliefs = this.regimeDetector.getRegimeBeliefs(symbol);

    // Trend beliefs from indicators
    const trendBeliefs = this.calculateTrendBeliefs(indicators);

    // Volatility beliefs from regime and indicators
    const volatilityBeliefs = this.calculateVolatilityBeliefs(regime, indicators);

    // Momentum beliefs from RSI and rate of change
    const momentum = this.calculateMomentumBeliefs(indicators);

    return {
      regime: regimeBeliefs,
      trend: trendBeliefs,
      volatility: volatilityBeliefs,
      momentum,
    };
  }

  /**
   * Calculate trend beliefs (up/down/sideways)
   */
  private calculateTrendBeliefs(indicators: any): TrendBeliefs {
    let upScore = 0;
    let downScore = 0;
    let sidewaysScore = 1; // Default to sideways

    // SMA trend
    if (indicators.sma20 && indicators.sma50) {
      if (indicators.sma20 > indicators.sma50) {
        upScore += 1;
      } else if (indicators.sma20 < indicators.sma50) {
        downScore += 1;
      } else {
        sidewaysScore += 1;
      }
    }

    // MACD trend
    if (indicators.macd !== undefined && indicators.macdSignal !== undefined) {
      if (indicators.macd > indicators.macdSignal) {
        upScore += 1;
      } else if (indicators.macd < indicators.macdSignal) {
        downScore += 1;
      }
    }

    // Normalize
    const total = upScore + downScore + sidewaysScore;
    return {
      up: upScore / total,
      down: downScore / total,
      sideways: sidewaysScore / total,
    };
  }

  /**
   * Calculate volatility beliefs (high/medium/low)
   */
  private calculateVolatilityBeliefs(regime: any, indicators: any): VolatilityBeliefs {
    const volLevel = regime.volatilityLevel;

    // Simple discretization
    if (volLevel > 0.7) {
      return { high: 0.8, medium: 0.15, low: 0.05 };
    } else if (volLevel > 0.4) {
      return { high: 0.2, medium: 0.6, low: 0.2 };
    } else {
      return { high: 0.05, medium: 0.25, low: 0.7 };
    }
  }

  /**
   * Calculate momentum beliefs (distribution over momentum levels)
   */
  private calculateMomentumBeliefs(indicators: any): number[] {
    // Simplified: 5-level discretization based on RSI
    const rsi = indicators.rsi || 50;

    const beliefs = [0, 0, 0, 0, 0]; // [very negative, negative, neutral, positive, very positive]

    if (rsi < 20) {
      beliefs[0] = 0.7;
      beliefs[1] = 0.3;
    } else if (rsi < 40) {
      beliefs[1] = 0.7;
      beliefs[2] = 0.3;
    } else if (rsi < 60) {
      beliefs[2] = 0.7;
      beliefs[1] = 0.15;
      beliefs[3] = 0.15;
    } else if (rsi < 80) {
      beliefs[3] = 0.7;
      beliefs[2] = 0.3;
    } else {
      beliefs[4] = 0.7;
      beliefs[3] = 0.3;
    }

    return beliefs;
  }

  // --------------------------------------------------------------------------
  // Signal Factors
  // --------------------------------------------------------------------------

  /**
   * Calculate all signal factors
   */
  private calculateSignalFactors(
    symbol: string,
    indicators: any,
    regime: any,
  ): SignalFactor[] {
    const factors: SignalFactor[] = [];

    // Factor 1: Trend strength
    if (indicators.sma20 && indicators.sma50) {
      const trendStrength = Math.abs(indicators.sma20 - indicators.sma50) / indicators.sma50;
      factors.push({
        name: 'Trend Strength',
        value: Math.min(1, trendStrength * 10),
        weight: 0.25,
        description: indicators.sma20 > indicators.sma50 ? 'Uptrend' : 'Downtrend',
      });
    }

    // Factor 2: Momentum (RSI)
    if (indicators.rsi !== undefined) {
      let momentumValue = 0.5;
      let momentumDesc = 'Neutral';

      if (indicators.rsi < 30) {
        momentumValue = 1 - (indicators.rsi / 30); // Oversold = bullish
        momentumDesc = 'Oversold (bullish)';
      } else if (indicators.rsi > 70) {
        momentumValue = (indicators.rsi - 70) / 30; // Overbought = bearish
        momentumDesc = 'Overbought (bearish)';
      }

      factors.push({
        name: 'Momentum (RSI)',
        value: momentumValue,
        weight: 0.20,
        description: momentumDesc,
      });
    }

    // Factor 3: Regime strength
    factors.push({
      name: 'Regime',
      value: regime.confidence,
      weight: 0.20,
      description: `${regime.regime} market (${(regime.confidence * 100).toFixed(0)}% confident)`,
    });

    // Factor 4: Volatility (lower is better for entry)
    factors.push({
      name: 'Volatility',
      value: 1 - regime.volatilityLevel, // Inverse: low vol = high score
      weight: 0.15,
      description: regime.volatilityLevel > 0.7 ? 'High volatility' : 'Normal volatility',
    });

    // Factor 5: Volume confirmation
    factors.push({
      name: 'Volume',
      value: regime.volumeProfile,
      weight: 0.20,
      description: regime.volumeProfile > 0.8 ? 'High volume' : 'Normal volume',
    });

    return factors;
  }

  /**
   * Aggregate factors into direction and strength
   */
  private aggregateFactors(factors: SignalFactor[]): {
    direction: 'long' | 'short' | 'neutral';
    strength: number;
  } {
    let bullScore = 0;
    let bearScore = 0;

    for (const factor of factors) {
      // Positive factors contribute to bull score
      // Negative factors to bear score
      // This is simplified - in reality, each factor should have directional interpretation

      if (factor.description.toLowerCase().includes('uptrend') ||
          factor.description.toLowerCase().includes('bullish') ||
          factor.description.toLowerCase().includes('bull')) {
        bullScore += factor.value * factor.weight;
      } else if (factor.description.toLowerCase().includes('downtrend') ||
                 factor.description.toLowerCase().includes('bearish') ||
                 factor.description.toLowerCase().includes('bear')) {
        bearScore += factor.value * factor.weight;
      } else {
        // Neutral factors contribute to both proportionally
        bullScore += factor.value * factor.weight * 0.5;
        bearScore += factor.value * factor.weight * 0.5;
      }
    }

    const totalScore = bullScore + bearScore;
    const netScore = bullScore - bearScore;

    let direction: 'long' | 'short' | 'neutral';
    let strength: number;

    if (Math.abs(netScore) < 0.1 * totalScore) {
      direction = 'neutral';
      strength = 0;
    } else if (netScore > 0) {
      direction = 'long';
      strength = Math.min(1, bullScore);
    } else {
      direction = 'short';
      strength = Math.min(1, bearScore);
    }

    return { direction, strength };
  }

  // --------------------------------------------------------------------------
  // Uncertainty Calculation
  // --------------------------------------------------------------------------

  /**
   * Calculate epistemic uncertainty from beliefs
   */
  private calculateUncertainty(
    marketBeliefs: MarketBeliefs,
    activeInferenceBeliefs?: Beliefs,
    regimeConfidence: number = 0.5,
  ): number {
    // Uncertainty from regime beliefs (entropy)
    const regimeEntropy = this.calculateEntropy([
      marketBeliefs.regime.bull,
      marketBeliefs.regime.bear,
      marketBeliefs.regime.neutral,
    ]);

    // Uncertainty from trend beliefs
    const trendEntropy = this.calculateEntropy([
      marketBeliefs.trend.up,
      marketBeliefs.trend.down,
      marketBeliefs.trend.sideways,
    ]);

    // Combine uncertainties (normalized)
    const marketUncertainty = (regimeEntropy + trendEntropy) / (2 * Math.log(3));

    // Inverse of regime confidence
    const confidenceUncertainty = 1 - regimeConfidence;

    // Average
    return (marketUncertainty + confidenceUncertainty) / 2;
  }

  /**
   * Calculate Shannon entropy
   */
  private calculateEntropy(probs: number[]): number {
    let entropy = 0;

    for (const p of probs) {
      if (p > 0) {
        entropy -= p * Math.log(p);
      }
    }

    return entropy;
  }

  /**
   * Calculate Bayesian surprise (KL divergence from prior)
   */
  private calculateSurprise(symbol: string, snapshot: any): number {
    const lastSignal = this.lastSignals.get(symbol);

    if (!lastSignal) {
      return 0; // No prior to compare against
    }

    // Simplified: surprise = price change beyond expected volatility
    const priceChange = Math.abs(snapshot.price - (lastSignal as any).price || 0);
    const expectedChange = snapshot.volatility * snapshot.price;

    const surprise = priceChange / (expectedChange + 0.001);

    return Math.min(1, surprise);
  }

  // --------------------------------------------------------------------------
  // Action Determination
  // --------------------------------------------------------------------------

  /**
   * Determine recommended trade action
   */
  private determineAction(
    direction: 'long' | 'short' | 'neutral',
    strength: number,
    uncertainty: number,
    currentDrawdown: number,
  ): TradeAction {
    // If in significant drawdown, be cautious
    if (currentDrawdown > 0.1) {
      return 'hold';
    }

    // If uncertainty is too high, don't trade
    if (uncertainty > 0.7) {
      return 'hold';
    }

    // If signal is weak, hold
    if (strength < this.minSignalStrength) {
      return 'hold';
    }

    // Strong signal with low uncertainty
    if (strength > 0.6 && uncertainty < 0.4) {
      return direction === 'long' ? 'buy' : direction === 'short' ? 'sell' : 'hold';
    }

    // Moderate signal
    if (strength > this.minSignalStrength) {
      return direction === 'long' ? 'buy' : direction === 'short' ? 'sell' : 'hold';
    }

    return 'hold';
  }

  /**
   * Calculate position size based on signal characteristics
   */
  private calculatePositionSize(
    strength: number,
    uncertainty: number,
    action: TradeAction,
  ): number {
    if (action === 'hold') {
      return 0;
    }

    // Base size on strength, reduce by uncertainty
    let size = strength * (1 - uncertainty);

    // Cap at 20%
    size = Math.min(0.2, size);

    return size;
  }

  /**
   * Calculate stop loss and take profit levels
   */
  private calculateStopLossTakeProfit(
    currentPrice: number,
    direction: 'long' | 'short' | 'neutral',
    atr: number,
  ): { stopLoss?: number; takeProfit?: number } {
    if (direction === 'neutral') {
      return {};
    }

    // Use 2x ATR for stop loss, 4x ATR for take profit (2:1 reward/risk)
    const stopDistance = atr * 2;
    const profitDistance = atr * 4;

    if (direction === 'long') {
      return {
        stopLoss: currentPrice - stopDistance,
        takeProfit: currentPrice + profitDistance,
      };
    } else {
      return {
        stopLoss: currentPrice + stopDistance,
        takeProfit: currentPrice - profitDistance,
      };
    }
  }

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  /**
   * Build human-readable reasoning
   */
  private buildReasoning(
    factors: SignalFactor[],
    direction: 'long' | 'short' | 'neutral',
    strength: number,
    uncertainty: number,
  ): string {
    const parts: string[] = [];

    parts.push(`Signal: ${direction} (strength: ${(strength * 100).toFixed(0)}%)`);
    parts.push(`Uncertainty: ${(uncertainty * 100).toFixed(0)}%`);

    const topFactors = [...factors]
      .sort((a, b) => b.value * b.weight - a.value * a.weight)
      .slice(0, 3);

    parts.push('Key factors:');
    for (const factor of topFactors) {
      parts.push(`- ${factor.name}: ${factor.description}`);
    }

    return parts.join(' ');
  }

  /**
   * Create neutral signal when insufficient data
   */
  private createNeutralSignal(symbol: string): TradingSignal {
    return {
      symbol,
      timestamp: Date.now(),
      direction: 'neutral',
      strength: 0,
      beliefs: {
        regime: { bull: 0.33, bear: 0.33, neutral: 0.34 },
        trend: { up: 0.33, down: 0.33, sideways: 0.34 },
        volatility: { high: 0.33, medium: 0.34, low: 0.33 },
        momentum: [0.2, 0.2, 0.2, 0.2, 0.2],
      },
      uncertainty: 1.0,
      surprise: 0,
      action: 'hold',
      positionSize: 0,
      maxDrawdown: 0,
      factors: [],
      reasoning: 'Insufficient data for signal generation',
    };
  }

  /**
   * Add signal to history
   */
  private addToHistory(symbol: string, signal: TradingSignal): void {
    const history = this.signalHistory.get(symbol) || [];
    history.push(signal);

    if (history.length > 100) {
      history.shift();
    }

    this.signalHistory.set(symbol, history);
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.lastSignals.clear();
    this.signalHistory.clear();
  }
}
