/**
 * Genesis Finance - Market Regime Detector
 *
 * Detects market regimes (bull/bear/neutral/crisis) using multiple indicators.
 * Integrates with Active Inference beliefs for regime transition probabilities.
 */

import type {
  MarketRegime,
  RegimeDetection,
  RegimeIndicator,
  OHLCV,
  RegimeBeliefs,
} from './types.js';
import type { MarketDataAggregator } from './market-data.js';

// ============================================================================
// Regime Detector
// ============================================================================

export class RegimeDetector {
  private currentRegime = new Map<string, MarketRegime>();
  private regimeHistory = new Map<string, RegimeDetection[]>();

  // Regime transition matrix (learned from historical data)
  private transitionMatrix: Record<MarketRegime, RegimeBeliefs> = {
    bull: { bull: 0.85, bear: 0.05, neutral: 0.10 },
    bear: { bull: 0.10, bear: 0.80, neutral: 0.10 },
    neutral: { bull: 0.20, bear: 0.20, neutral: 0.60 },
    crisis: { bull: 0.05, bear: 0.40, neutral: 0.55 },
  };

  constructor(private marketData: MarketDataAggregator) {}

  // --------------------------------------------------------------------------
  // Regime Detection
  // --------------------------------------------------------------------------

  /**
   * Detect current market regime for a symbol
   */
  detectRegime(symbol: string): RegimeDetection {
    const snapshot = this.marketData.getSnapshot(symbol);
    const history = this.marketData.getPriceHistory(symbol, 100);
    const indicators = this.marketData.calculateIndicators(symbol);

    if (!snapshot || history.length < 20) {
      // Insufficient data, return neutral with low confidence
      return this.createDefaultDetection(symbol);
    }

    // Calculate regime indicators
    const regimeIndicators = this.calculateRegimeIndicators(
      symbol,
      history,
      indicators,
    );

    // Aggregate indicators into regime score
    const regimeScores = this.aggregateIndicators(regimeIndicators);

    // Determine most likely regime
    const regime = this.determineRegime(regimeScores);
    const confidence = regimeScores[regime];

    // Calculate regime characteristics
    const trendStrength = this.calculateTrendStrength(history);
    const volatilityLevel = this.calculateVolatilityLevel(history);
    const volumeProfile = this.calculateVolumeProfile(history);

    // Calculate transition probabilities
    const currentRegime = this.currentRegime.get(symbol) || 'neutral';
    const transitionProb = this.calculateTransitionProbabilities(
      currentRegime,
      regime,
      regimeScores,
    );

    const detection: RegimeDetection = {
      regime,
      confidence,
      trendStrength,
      volatilityLevel,
      volumeProfile,
      transitionProb,
      indicators: regimeIndicators,
      timestamp: Date.now(),
    };

    // Update state
    this.currentRegime.set(symbol, regime);
    this.addToHistory(symbol, detection);

    return detection;
  }

  /**
   * Get current regime for a symbol
   */
  getCurrentRegime(symbol: string): MarketRegime {
    return this.currentRegime.get(symbol) || 'neutral';
  }

  /**
   * Get regime beliefs (for Active Inference integration)
   */
  getRegimeBeliefs(symbol: string): RegimeBeliefs {
    const detection = this.detectRegime(symbol);

    // Convert regime scores to beliefs
    // For crisis, we map it to bear with high volatility
    const bull = detection.regime === 'bull' ? detection.confidence : (1 - detection.confidence) / 3;
    const bear = detection.regime === 'bear' ? detection.confidence : (1 - detection.confidence) / 3;
    const neutral = detection.regime === 'neutral' ? detection.confidence : (1 - detection.confidence) / 3;

    // Normalize to sum to 1
    const total = bull + bear + neutral;

    return {
      bull: bull / total,
      bear: bear / total,
      neutral: neutral / total,
    };
  }

  // --------------------------------------------------------------------------
  // Indicator Calculation
  // --------------------------------------------------------------------------

  /**
   * Calculate all regime indicators
   */
  private calculateRegimeIndicators(
    symbol: string,
    history: OHLCV[],
    indicators: any,
  ): RegimeIndicator[] {
    const regimeIndicators: RegimeIndicator[] = [];

    // 1. Trend indicator (SMA crossovers)
    if (indicators.sma20 && indicators.sma50) {
      const trendSignal = indicators.sma20 > indicators.sma50 ? 'bullish' : 'bearish';
      const trendValue = Math.abs(indicators.sma20 - indicators.sma50) / indicators.sma50;

      regimeIndicators.push({
        name: 'SMA Trend',
        value: trendValue,
        signal: trendSignal,
        weight: 0.3,
      });
    }

    // 2. Momentum indicator (RSI)
    if (indicators.rsi !== undefined) {
      let momentumSignal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      if (indicators.rsi > 70) momentumSignal = 'bearish'; // Overbought
      else if (indicators.rsi < 30) momentumSignal = 'bullish'; // Oversold
      else if (indicators.rsi > 55) momentumSignal = 'bullish';
      else if (indicators.rsi < 45) momentumSignal = 'bearish';

      regimeIndicators.push({
        name: 'RSI Momentum',
        value: indicators.rsi / 100,
        signal: momentumSignal,
        weight: 0.2,
      });
    }

    // 3. Volatility indicator (Bollinger Bands width)
    if (indicators.bollingerUpper && indicators.bollingerLower && indicators.bollingerMiddle) {
      const bbWidth = (indicators.bollingerUpper - indicators.bollingerLower) / indicators.bollingerMiddle;
      const volSignal = bbWidth > 0.1 ? 'bearish' : 'bullish'; // High vol = bearish

      regimeIndicators.push({
        name: 'Bollinger Volatility',
        value: Math.min(1, bbWidth * 5),
        signal: volSignal,
        weight: 0.15,
      });
    }

    // 4. Price position in range (high/low)
    const closes = history.map(c => c.close);
    const currentPrice = closes[closes.length - 1];
    const high52w = Math.max(...closes);
    const low52w = Math.min(...closes);
    const pricePosition = (currentPrice - low52w) / (high52w - low52w);

    regimeIndicators.push({
      name: 'Price Position',
      value: pricePosition,
      signal: pricePosition > 0.7 ? 'bullish' : pricePosition < 0.3 ? 'bearish' : 'neutral',
      weight: 0.15,
    });

    // 5. Rate of change
    if (closes.length >= 20) {
      const roc = (closes[closes.length - 1] - closes[closes.length - 20]) / closes[closes.length - 20];
      const rocSignal = roc > 0.05 ? 'bullish' : roc < -0.05 ? 'bearish' : 'neutral';

      regimeIndicators.push({
        name: 'Rate of Change',
        value: Math.min(1, Math.abs(roc) * 5),
        signal: rocSignal,
        weight: 0.2,
      });
    }

    return regimeIndicators;
  }

  /**
   * Aggregate indicators into regime scores
   */
  private aggregateIndicators(
    indicators: RegimeIndicator[],
  ): Record<MarketRegime, number> {
    let bullScore = 0;
    let bearScore = 0;
    let neutralScore = 0;

    for (const indicator of indicators) {
      if (indicator.signal === 'bullish') {
        bullScore += indicator.value * indicator.weight;
      } else if (indicator.signal === 'bearish') {
        bearScore += indicator.value * indicator.weight;
      } else {
        neutralScore += indicator.value * indicator.weight;
      }
    }

    // Normalize scores
    const total = bullScore + bearScore + neutralScore + 0.001; // Avoid division by zero

    return {
      bull: bullScore / total,
      bear: bearScore / total,
      neutral: neutralScore / total,
      crisis: 0, // Crisis detected separately
    };
  }

  /**
   * Determine regime from scores
   */
  private determineRegime(scores: Record<MarketRegime, number>): MarketRegime {
    // Check for crisis conditions first
    if (scores.crisis > 0.7) return 'crisis';

    // Otherwise, pick highest score
    const entries = Object.entries(scores) as [MarketRegime, number][];
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0];
  }

  // --------------------------------------------------------------------------
  // Regime Characteristics
  // --------------------------------------------------------------------------

  /**
   * Calculate trend strength (0-1)
   */
  private calculateTrendStrength(history: OHLCV[]): number {
    if (history.length < 20) return 0.5;

    const closes = history.map(c => c.close);

    // Linear regression slope
    const n = closes.length;
    const indices = Array.from({ length: n }, (_, i) => i);

    const meanX = indices.reduce((a, b) => a + b, 0) / n;
    const meanY = closes.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (indices[i] - meanX) * (closes[i] - meanY);
      denominator += Math.pow(indices[i] - meanX, 2);
    }

    const slope = denominator === 0 ? 0 : numerator / denominator;

    // Normalize slope to 0-1 range
    const trendStrength = Math.min(1, Math.abs(slope) * 100);

    return trendStrength;
  }

  /**
   * Calculate volatility level (0-1)
   */
  private calculateVolatilityLevel(history: OHLCV[]): number {
    if (history.length < 2) return 0.5;

    const returns = [];
    for (let i = 1; i < history.length; i++) {
      const ret = (history[i].close - history[i - 1].close) / history[i - 1].close;
      returns.push(ret);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Normalize (typical daily vol is 0.01-0.05)
    return Math.min(1, stdDev * 20);
  }

  /**
   * Calculate volume profile (0-1)
   */
  private calculateVolumeProfile(history: OHLCV[]): number {
    if (history.length < 20) return 0.5;

    const recentVolume = history.slice(-10).reduce((sum, c) => sum + c.volume, 0) / 10;
    const avgVolume = history.reduce((sum, c) => sum + c.volume, 0) / history.length;

    // Relative volume
    return Math.min(1, recentVolume / (avgVolume + 1));
  }

  // --------------------------------------------------------------------------
  // Transition Probabilities
  // --------------------------------------------------------------------------

  /**
   * Calculate regime transition probabilities
   */
  private calculateTransitionProbabilities(
    currentRegime: MarketRegime,
    newRegime: MarketRegime,
    scores: Record<MarketRegime, number>,
  ): RegimeBeliefs & { crisis: number } {
    // Start with base transition probabilities
    const base = this.transitionMatrix[currentRegime];

    // Adjust based on current scores
    const bull = base.bull * (1 + scores.bull);
    const bear = base.bear * (1 + scores.bear);
    const neutral = base.neutral * (1 + scores.neutral);
    const crisis = scores.crisis;

    // Normalize
    const total = bull + bear + neutral + crisis;

    return {
      bull: bull / total,
      bear: bear / total,
      neutral: neutral / total,
      crisis: crisis / total,
    };
  }

  // --------------------------------------------------------------------------
  // History Management
  // --------------------------------------------------------------------------

  /**
   * Add detection to history
   */
  private addToHistory(symbol: string, detection: RegimeDetection): void {
    const history = this.regimeHistory.get(symbol) || [];
    history.push(detection);

    // Keep last 100 detections
    if (history.length > 100) {
      history.shift();
    }

    this.regimeHistory.set(symbol, history);
  }

  /**
   * Get regime history
   */
  getRegimeHistory(symbol: string, limit: number = 10): RegimeDetection[] {
    const history = this.regimeHistory.get(symbol) || [];
    return history.slice(-limit);
  }

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  /**
   * Create default detection when insufficient data
   */
  private createDefaultDetection(symbol: string): RegimeDetection {
    return {
      regime: 'neutral',
      confidence: 0.5,
      trendStrength: 0.5,
      volatilityLevel: 0.5,
      volumeProfile: 0.5,
      transitionProb: {
        bull: 0.25,
        bear: 0.25,
        neutral: 0.5,
        crisis: 0,
      },
      indicators: [],
      timestamp: Date.now(),
    };
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.currentRegime.clear();
    this.regimeHistory.clear();
  }
}
