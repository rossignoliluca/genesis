/**
 * Genesis Finance - Market Data Aggregator
 *
 * Multi-source market data aggregation with simulated and real data support.
 * Implements geometric Brownian motion for simulation.
 */

import type {
  OHLCV,
  MarketSnapshot,
  OrderBook,
  PriceSeries,
  DataSource,
  Indicators,
} from './types.js';

// ============================================================================
// Market Data Aggregator
// ============================================================================

export class MarketDataAggregator {
  private snapshots = new Map<string, MarketSnapshot>();
  private priceHistory = new Map<string, OHLCV[]>();
  private orderBooks = new Map<string, OrderBook>();
  private lastUpdate = new Map<string, number>();

  // Simulation state
  private simulationPrices = new Map<string, number>();
  private simulationVolatilities = new Map<string, number>();
  private simulationDrift = new Map<string, number>();

  constructor(
    private source: DataSource = 'simulation',
    private updateInterval: number = 60000,
  ) {}

  // --------------------------------------------------------------------------
  // Data Retrieval
  // --------------------------------------------------------------------------

  /**
   * Get latest market snapshot for a symbol
   */
  getSnapshot(symbol: string): MarketSnapshot | null {
    return this.snapshots.get(symbol) || null;
  }

  /**
   * Get price history for a symbol
   */
  getPriceHistory(
    symbol: string,
    limit: number = 100,
  ): OHLCV[] {
    const history = this.priceHistory.get(symbol) || [];
    return history.slice(-limit);
  }

  /**
   * Get order book snapshot
   */
  getOrderBook(symbol: string): OrderBook | null {
    return this.orderBooks.get(symbol) || null;
  }

  /**
   * Get multiple symbols
   */
  getMultipleSnapshots(symbols: string[]): Map<string, MarketSnapshot> {
    const result = new Map<string, MarketSnapshot>();
    for (const symbol of symbols) {
      const snapshot = this.snapshots.get(symbol);
      if (snapshot) {
        result.set(symbol, snapshot);
      }
    }
    return result;
  }

  // --------------------------------------------------------------------------
  // Data Updates
  // --------------------------------------------------------------------------

  /**
   * Update market data for a symbol
   */
  async updateMarketData(symbol: string): Promise<MarketSnapshot> {
    if (this.source === 'simulation') {
      return this.updateSimulatedData(symbol);
    } else {
      return this.updateRealData(symbol);
    }
  }

  /**
   * Update multiple symbols
   */
  async updateMultipleSymbols(symbols: string[]): Promise<void> {
    await Promise.all(symbols.map(s => this.updateMarketData(s)));
  }

  // --------------------------------------------------------------------------
  // Simulation (Geometric Brownian Motion)
  // --------------------------------------------------------------------------

  /**
   * Initialize simulation for a symbol
   */
  initSimulation(
    symbol: string,
    initialPrice: number = 100,
    volatility: number = 0.3,  // 30% annualized
    drift: number = 0.05,       // 5% annual drift
  ): void {
    this.simulationPrices.set(symbol, initialPrice);
    this.simulationVolatilities.set(symbol, volatility);
    this.simulationDrift.set(symbol, drift);

    // Initialize with first snapshot
    this.updateSimulatedData(symbol);
  }

  /**
   * Update simulated market data using geometric Brownian motion
   */
  private updateSimulatedData(symbol: string): MarketSnapshot {
    // Get or initialize simulation state
    let price = this.simulationPrices.get(symbol) || 100;
    const vol = this.simulationVolatilities.get(symbol) || 0.3;
    const drift = this.simulationDrift.get(symbol) || 0.05;

    // Time step (fraction of year)
    const dt = this.updateInterval / (365.25 * 24 * 60 * 60 * 1000);

    // Geometric Brownian motion: dS = μS dt + σS dW
    const randomShock = this.normalRandom();
    const driftTerm = drift * price * dt;
    const diffusionTerm = vol * price * Math.sqrt(dt) * randomShock;

    const newPrice = price + driftTerm + diffusionTerm;

    // Ensure price stays positive
    const clampedPrice = Math.max(0.01, newPrice);

    // Update simulation state
    this.simulationPrices.set(symbol, clampedPrice);

    // Get previous snapshot for 24h calculations
    const prevSnapshot = this.snapshots.get(symbol);
    const prev24hPrice = prevSnapshot?.price || clampedPrice;

    // Calculate changes
    const change24h = clampedPrice - prev24hPrice;
    const changePercent24h = (change24h / prev24hPrice) * 100;

    // Simulate high/low with some variation
    const high24h = clampedPrice * (1 + Math.abs(this.normalRandom()) * 0.02);
    const low24h = clampedPrice * (1 - Math.abs(this.normalRandom()) * 0.02);

    // Simulate volume (log-normal distribution)
    const baseVolume = 1000000;
    const volumeVariation = Math.exp(this.normalRandom() * 0.5);
    const volume24h = baseVolume * volumeVariation;

    const snapshot: MarketSnapshot = {
      symbol,
      timestamp: Date.now(),
      price: clampedPrice,
      volume24h,
      change24h,
      changePercent24h,
      high24h,
      low24h,
      volatility: vol,
      source: 'simulation',
    };

    this.snapshots.set(symbol, snapshot);
    this.lastUpdate.set(symbol, Date.now());

    // Add to price history
    this.addToHistory(symbol, clampedPrice, volume24h);

    // Simulate order book
    this.updateSimulatedOrderBook(symbol, clampedPrice);

    return snapshot;
  }

  /**
   * Add price to historical data
   */
  private addToHistory(symbol: string, price: number, volume: number): void {
    const history = this.priceHistory.get(symbol) || [];
    const timestamp = Date.now();

    // Create OHLCV candle
    // For simulation, O=H=L=C (simplification)
    const candle: OHLCV = {
      timestamp,
      open: price,
      high: price * (1 + Math.abs(this.normalRandom()) * 0.005),
      low: price * (1 - Math.abs(this.normalRandom()) * 0.005),
      close: price,
      volume,
    };

    history.push(candle);

    // Keep last 1000 candles
    if (history.length > 1000) {
      history.shift();
    }

    this.priceHistory.set(symbol, history);
  }

  /**
   * Simulate order book around current price
   */
  private updateSimulatedOrderBook(symbol: string, price: number): void {
    const levels = 10;
    const spreadPercent = 0.001; // 0.1% spread
    const spread = price * spreadPercent;
    const midPrice = price;

    const bids: [number, number][] = [];
    const asks: [number, number][] = [];

    // Generate bids (below mid price)
    for (let i = 0; i < levels; i++) {
      const bidPrice = midPrice - spread / 2 - (i * spread * 0.5);
      const bidSize = 100 * Math.exp(-i * 0.3) * (1 + this.normalRandom() * 0.2);
      bids.push([bidPrice, Math.max(0, bidSize)]);
    }

    // Generate asks (above mid price)
    for (let i = 0; i < levels; i++) {
      const askPrice = midPrice + spread / 2 + (i * spread * 0.5);
      const askSize = 100 * Math.exp(-i * 0.3) * (1 + this.normalRandom() * 0.2);
      asks.push([askPrice, Math.max(0, askSize)]);
    }

    const orderBook: OrderBook = {
      symbol,
      timestamp: Date.now(),
      bids,
      asks,
      spread,
      midPrice,
    };

    this.orderBooks.set(symbol, orderBook);
  }

  /**
   * Box-Muller transform for normal random numbers
   */
  private normalRandom(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // --------------------------------------------------------------------------
  // Real Data (placeholder for actual API integration)
  // --------------------------------------------------------------------------

  /**
   * Update real market data (would call actual APIs)
   */
  private async updateRealData(symbol: string): Promise<MarketSnapshot> {
    // Placeholder: In production, this would call:
    // - Coinbase API for crypto
    // - Alpaca API for stocks
    // - Binance API for crypto futures

    throw new Error('Real data sources not yet implemented. Use simulation mode.');
  }

  // --------------------------------------------------------------------------
  // Technical Indicators
  // --------------------------------------------------------------------------

  /**
   * Calculate technical indicators for a symbol
   */
  calculateIndicators(symbol: string): Indicators {
    const history = this.getPriceHistory(symbol, 200);

    if (history.length < 20) {
      return {};
    }

    const closes = history.map(c => c.close);

    return {
      sma20: this.sma(closes, 20),
      sma50: this.sma(closes, 50),
      sma200: this.sma(closes, 200),
      ema12: this.ema(closes, 12),
      ema26: this.ema(closes, 26),
      rsi: this.rsi(closes, 14),
      atr: this.atr(history, 14),
      ...this.macd(closes),
      ...this.bollingerBands(closes, 20, 2),
    };
  }

  /**
   * Simple Moving Average
   */
  private sma(values: number[], period: number): number | undefined {
    if (values.length < period) return undefined;
    const slice = values.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  /**
   * Exponential Moving Average
   */
  private ema(values: number[], period: number): number | undefined {
    if (values.length < period) return undefined;

    const multiplier = 2 / (period + 1);
    let ema = values[0];

    for (let i = 1; i < values.length; i++) {
      ema = (values[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  /**
   * Relative Strength Index
   */
  private rsi(values: number[], period: number): number | undefined {
    if (values.length < period + 1) return undefined;

    let gains = 0;
    let losses = 0;

    // Calculate initial average gain/loss
    for (let i = values.length - period; i < values.length; i++) {
      const change = values[i] - values[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * MACD (Moving Average Convergence Divergence)
   */
  private macd(values: number[]): Partial<Indicators> {
    const ema12 = this.ema(values, 12);
    const ema26 = this.ema(values, 26);

    if (!ema12 || !ema26) return {};

    const macd = ema12 - ema26;
    const signal = macd; // Simplified: would use EMA of MACD
    const histogram = macd - signal;

    return {
      macd,
      macdSignal: signal,
      macdHistogram: histogram,
    };
  }

  /**
   * Bollinger Bands
   */
  private bollingerBands(
    values: number[],
    period: number,
    stdDev: number,
  ): Partial<Indicators> {
    const sma = this.sma(values, period);
    if (!sma) return {};

    const slice = values.slice(-period);
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
    const sd = Math.sqrt(variance);

    return {
      bollingerMiddle: sma,
      bollingerUpper: sma + stdDev * sd,
      bollingerLower: sma - stdDev * sd,
    };
  }

  /**
   * Average True Range (volatility indicator)
   */
  private atr(candles: OHLCV[], period: number): number | undefined {
    if (candles.length < period + 1) return undefined;

    const trueRanges: number[] = [];

    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose),
      );

      trueRanges.push(tr);
    }

    return this.sma(trueRanges, period);
  }

  // --------------------------------------------------------------------------
  // Statistical Analysis
  // --------------------------------------------------------------------------

  /**
   * Calculate historical volatility (annualized)
   */
  calculateVolatility(symbol: string, periods: number = 30): number {
    const history = this.getPriceHistory(symbol, periods + 1);

    if (history.length < 2) {
      return 0.3; // Default 30% annualized
    }

    // Calculate log returns
    const returns: number[] = [];
    for (let i = 1; i < history.length; i++) {
      const logReturn = Math.log(history[i].close / history[i - 1].close);
      returns.push(logReturn);
    }

    // Calculate standard deviation of returns
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Annualize (assuming daily data, 252 trading days per year)
    return stdDev * Math.sqrt(252);
  }

  /**
   * Calculate correlation between two symbols
   */
  calculateCorrelation(symbol1: string, symbol2: string, periods: number = 30): number {
    const history1 = this.getPriceHistory(symbol1, periods);
    const history2 = this.getPriceHistory(symbol2, periods);

    if (history1.length < periods || history2.length < periods) {
      return 0;
    }

    const returns1 = this.calculateReturns(history1);
    const returns2 = this.calculateReturns(history2);

    return this.pearsonCorrelation(returns1, returns2);
  }

  /**
   * Calculate returns series
   */
  private calculateReturns(history: OHLCV[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < history.length; i++) {
      returns.push((history[i].close - history[i - 1].close) / history[i - 1].close);
    }
    return returns;
  }

  /**
   * Pearson correlation coefficient
   */
  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);

    const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let sumSqX = 0;
    let sumSqY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      sumSqX += dx * dx;
      sumSqY += dy * dy;
    }

    const denominator = Math.sqrt(sumSqX * sumSqY);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  /**
   * Get time since last update
   */
  getTimeSinceUpdate(symbol: string): number {
    const lastUpdate = this.lastUpdate.get(symbol);
    return lastUpdate ? Date.now() - lastUpdate : Infinity;
  }

  /**
   * Check if data is stale
   */
  isStale(symbol: string, maxAge: number = 60000): boolean {
    return this.getTimeSinceUpdate(symbol) > maxAge;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.snapshots.clear();
    this.priceHistory.clear();
    this.orderBooks.clear();
    this.lastUpdate.clear();
  }

  /**
   * Get all tracked symbols
   */
  getSymbols(): string[] {
    return Array.from(this.snapshots.keys());
  }
}
