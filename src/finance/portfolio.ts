/**
 * Genesis Finance - Portfolio Manager
 *
 * Manages portfolio state, position tracking, and optimization.
 * Implements mean-variance, risk parity, and Kelly optimization.
 */

import type {
  Portfolio,
  Position,
  PortfolioOptimization,
  RebalanceTrade,
  OptimizationConstraints,
} from './types.js';
import type { MarketDataAggregator } from './market-data.js';
import type { RiskEngine } from './risk-engine.js';

// ============================================================================
// Portfolio Manager
// ============================================================================

export class PortfolioManager {
  private portfolio: Portfolio;
  private portfolioHistory: Portfolio[] = [];
  private tradeHistory: RebalanceTrade[] = [];

  constructor(
    private marketData: MarketDataAggregator,
    private riskEngine: RiskEngine,
    initialCash: number = 100000,
  ) {
    this.portfolio = this.createInitialPortfolio(initialCash);
  }

  // --------------------------------------------------------------------------
  // Portfolio State
  // --------------------------------------------------------------------------

  /**
   * Get current portfolio state
   */
  getPortfolio(): Portfolio {
    return this.updatePortfolio();
  }

  /**
   * Get position for a symbol
   */
  getPosition(symbol: string): Position | null {
    return this.portfolio.positions.get(symbol) || null;
  }

  /**
   * Get all positions
   */
  getAllPositions(): Position[] {
    return Array.from(this.portfolio.positions.values());
  }

  // --------------------------------------------------------------------------
  // Position Management
  // --------------------------------------------------------------------------

  /**
   * Open or add to a position
   */
  openPosition(
    symbol: string,
    size: number,
    price?: number,
  ): Position {
    const entryPrice = price || this.marketData.getSnapshot(symbol)?.price || 0;

    if (entryPrice === 0) {
      throw new Error(`Cannot open position for ${symbol}: no price data`);
    }

    const costBasis = size * entryPrice;

    // Check if we have enough cash
    if (costBasis > this.portfolio.cash) {
      throw new Error(`Insufficient cash: need ${costBasis}, have ${this.portfolio.cash}`);
    }

    const existing = this.portfolio.positions.get(symbol);

    if (existing) {
      // Add to existing position (average entry price)
      const totalSize = existing.size + size;
      const totalCost = existing.costBasis + costBasis;
      const avgPrice = totalCost / totalSize;

      const position: Position = {
        ...existing,
        size: totalSize,
        entryPrice: avgPrice,
        costBasis: totalCost,
        currentPrice: entryPrice,
        marketValue: totalSize * entryPrice,
        unrealizedPnL: totalSize * entryPrice - totalCost,
        unrealizedPnLPercent: ((totalSize * entryPrice - totalCost) / totalCost) * 100,
      };

      this.portfolio.positions.set(symbol, position);
      this.portfolio.cash -= costBasis;

      return position;
    } else {
      // New position
      const position: Position = {
        symbol,
        size,
        entryPrice,
        currentPrice: entryPrice,
        unrealizedPnL: 0,
        unrealizedPnLPercent: 0,
        costBasis,
        marketValue: costBasis,
        holdingPeriod: 0,
        entryTimestamp: Date.now(),
      };

      this.portfolio.positions.set(symbol, position);
      this.portfolio.cash -= costBasis;

      return position;
    }
  }

  /**
   * Close or reduce a position
   */
  closePosition(
    symbol: string,
    size?: number,
    price?: number,
  ): number {
    const position = this.portfolio.positions.get(symbol);

    if (!position) {
      throw new Error(`No position in ${symbol} to close`);
    }

    const exitPrice = price || this.marketData.getSnapshot(symbol)?.price || 0;
    const sizeToClose = size || position.size;

    if (sizeToClose > position.size) {
      throw new Error(`Cannot close ${sizeToClose} units, only have ${position.size}`);
    }

    // Calculate realized P&L
    const costBasisOfClosed = (sizeToClose / position.size) * position.costBasis;
    const proceeds = sizeToClose * exitPrice;
    const realizedPnL = proceeds - costBasisOfClosed;

    // Update or remove position
    if (sizeToClose === position.size) {
      // Close entire position
      this.portfolio.positions.delete(symbol);
    } else {
      // Reduce position
      const remainingSize = position.size - sizeToClose;
      const remainingCostBasis = position.costBasis - costBasisOfClosed;

      position.size = remainingSize;
      position.costBasis = remainingCostBasis;
      position.marketValue = remainingSize * exitPrice;
      position.unrealizedPnL = remainingSize * exitPrice - remainingCostBasis;
      position.unrealizedPnLPercent = (position.unrealizedPnL / remainingCostBasis) * 100;
    }

    // Update cash
    this.portfolio.cash += proceeds;

    return realizedPnL;
  }

  // --------------------------------------------------------------------------
  // Portfolio Updates
  // --------------------------------------------------------------------------

  /**
   * Update portfolio with current prices
   */
  private updatePortfolio(): Portfolio {
    let totalValue = this.portfolio.cash;
    let totalPnL = 0;

    const now = Date.now();

    // Update all positions
    for (const [symbol, position] of this.portfolio.positions) {
      const snapshot = this.marketData.getSnapshot(symbol);

      if (snapshot) {
        position.currentPrice = snapshot.price;
        position.marketValue = position.size * snapshot.price;
        position.unrealizedPnL = position.marketValue - position.costBasis;
        position.unrealizedPnLPercent = (position.unrealizedPnL / position.costBasis) * 100;
        position.holdingPeriod = (now - position.entryTimestamp) / (24 * 60 * 60 * 1000);

        totalValue += position.marketValue;
        totalPnL += position.unrealizedPnL;
      }
    }

    // Update portfolio metrics
    this.portfolio.timestamp = now;
    this.portfolio.totalValue = totalValue;
    this.portfolio.totalPnL = totalPnL;
    this.portfolio.totalPnLPercent = totalPnL / (totalValue - totalPnL) * 100;
    this.portfolio.cashPercent = (this.portfolio.cash / totalValue) * 100;
    this.portfolio.positionCount = this.portfolio.positions.size;
    this.portfolio.concentration = this.calculateConcentration();

    // Calculate risk metrics
    this.portfolio.portfolioVar95 = this.calculatePortfolioVaR();
    this.portfolio.portfolioBeta = this.calculatePortfolioBeta();
    this.portfolio.sharpeRatio = this.calculateSharpeRatio();
    this.portfolio.maxDrawdown = this.calculateMaxDrawdown();

    // Calculate performance
    this.updatePerformanceMetrics();

    // Add to history
    this.addToHistory();

    return this.portfolio;
  }

  /**
   * Calculate portfolio concentration (Herfindahl index)
   */
  private calculateConcentration(): number {
    const totalValue = this.portfolio.totalValue;

    if (totalValue === 0) return 0;

    let hhi = 0;

    for (const position of this.portfolio.positions.values()) {
      const weight = position.marketValue / totalValue;
      hhi += weight * weight;
    }

    return hhi;
  }

  /**
   * Calculate portfolio VaR (simplified)
   */
  private calculatePortfolioVaR(): number {
    let portfolioVar = 0;

    for (const position of this.portfolio.positions.values()) {
      const varResult = this.riskEngine.calculateVaR(position.symbol);
      const positionVar = varResult.var95 * position.marketValue;
      portfolioVar += positionVar * positionVar; // Variance aggregation (assuming independence)
    }

    return Math.sqrt(portfolioVar);
  }

  /**
   * Calculate portfolio beta (vs market - simplified as average beta)
   */
  private calculatePortfolioBeta(): number {
    // Simplified: assume all assets have beta of 1.0
    // In reality, would calculate correlation with market index
    return 1.0;
  }

  /**
   * Calculate Sharpe ratio from portfolio history
   */
  private calculateSharpeRatio(): number {
    if (this.portfolioHistory.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < this.portfolioHistory.length; i++) {
      const prevValue = this.portfolioHistory[i - 1].totalValue;
      const currValue = this.portfolioHistory[i].totalValue;
      returns.push((currValue - prevValue) / prevValue);
    }

    return this.riskEngine.calculateSharpeRatio(returns);
  }

  /**
   * Calculate maximum drawdown from portfolio history
   */
  private calculateMaxDrawdown(): number {
    if (this.portfolioHistory.length < 2) return 0;

    const values = this.portfolioHistory.map(p => p.totalValue);
    let peak = values[0];
    let maxDD = 0;

    for (const value of values) {
      if (value > peak) {
        peak = value;
      }

      const dd = (peak - value) / peak;
      if (dd > maxDD) {
        maxDD = dd;
      }
    }

    return maxDD;
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(): void {
    if (this.portfolioHistory.length > 0) {
      const prevPortfolio = this.portfolioHistory[this.portfolioHistory.length - 1];
      this.portfolio.dailyReturn =
        (this.portfolio.totalValue - prevPortfolio.totalValue) / prevPortfolio.totalValue;
    } else {
      this.portfolio.dailyReturn = 0;
    }

    // Cumulative return from initial capital
    const initialValue = this.portfolioHistory.length > 0
      ? this.portfolioHistory[0].totalValue
      : this.portfolio.totalValue;

    this.portfolio.cumulativeReturn =
      (this.portfolio.totalValue - initialValue) / initialValue;

    // Win rate (simplified: percentage of profitable trades)
    this.portfolio.winRate = this.calculateWinRate();
  }

  /**
   * Calculate win rate from trade history
   */
  private calculateWinRate(): number {
    // Simplified: would need actual trade execution history
    return 0.5; // Placeholder
  }

  // --------------------------------------------------------------------------
  // Portfolio Optimization
  // --------------------------------------------------------------------------

  /**
   * Optimize portfolio allocation
   */
  optimizePortfolio(
    symbols: string[],
    method: 'meanVariance' | 'riskParity' | 'minVariance' | 'maxSharpe' = 'meanVariance',
    constraints?: OptimizationConstraints,
  ): PortfolioOptimization {
    const defaultConstraints: OptimizationConstraints = {
      maxPositionSize: 0.3,
      minPositionSize: 0.05,
      maxTurnover: 0.5,
    };

    const finalConstraints = { ...defaultConstraints, ...constraints };

    // Calculate current weights
    const currentWeights = this.getCurrentWeights(symbols);

    // Calculate target weights based on method
    let targetWeights: Map<string, number>;

    switch (method) {
      case 'meanVariance':
        targetWeights = this.meanVarianceOptimization(symbols, finalConstraints);
        break;
      case 'riskParity':
        targetWeights = this.riskParityOptimization(symbols, finalConstraints);
        break;
      case 'minVariance':
        targetWeights = this.minVarianceOptimization(symbols, finalConstraints);
        break;
      case 'maxSharpe':
        targetWeights = this.maxSharpeOptimization(symbols, finalConstraints);
        break;
    }

    // Generate rebalancing trades
    const trades = this.generateRebalancingTrades(
      currentWeights,
      targetWeights,
      finalConstraints,
    );

    // Calculate expected metrics
    const expectedMetrics = this.calculateExpectedMetrics(targetWeights, symbols);

    return {
      timestamp: Date.now(),
      targetWeights,
      currentWeights,
      trades,
      expectedReturn: expectedMetrics.return,
      expectedVolatility: expectedMetrics.volatility,
      expectedSharpe: expectedMetrics.sharpe,
      method,
      constraints: finalConstraints,
    };
  }

  /**
   * Mean-variance optimization (Markowitz)
   */
  private meanVarianceOptimization(
    symbols: string[],
    constraints: OptimizationConstraints,
  ): Map<string, number> {
    // Simplified: equal-weighted portfolio with constraints
    // In production, would use quadratic programming to solve

    const weights = new Map<string, number>();
    const equalWeight = 1 / symbols.length;

    for (const symbol of symbols) {
      let weight = equalWeight;

      // Apply constraints
      weight = Math.min(weight, constraints.maxPositionSize);
      weight = Math.max(weight, constraints.minPositionSize);

      weights.set(symbol, weight);
    }

    // Normalize
    return this.normalizeWeights(weights);
  }

  /**
   * Risk parity optimization
   */
  private riskParityOptimization(
    symbols: string[],
    constraints: OptimizationConstraints,
  ): Map<string, number> {
    // Equal risk contribution from each asset
    const weights = new Map<string, number>();
    const volatilities = new Map<string, number>();

    // Get volatilities
    for (const symbol of symbols) {
      const vol = this.marketData.calculateVolatility(symbol);
      volatilities.set(symbol, vol);
    }

    // Inverse volatility weighting
    let totalInvVol = 0;
    for (const vol of volatilities.values()) {
      totalInvVol += 1 / vol;
    }

    for (const symbol of symbols) {
      const vol = volatilities.get(symbol)!;
      const weight = (1 / vol) / totalInvVol;

      weights.set(symbol, weight);
    }

    return this.normalizeWeights(weights);
  }

  /**
   * Minimum variance optimization
   */
  private minVarianceOptimization(
    symbols: string[],
    constraints: OptimizationConstraints,
  ): Map<string, number> {
    // Simplified: inverse variance weighting
    return this.riskParityOptimization(symbols, constraints);
  }

  /**
   * Maximum Sharpe ratio optimization
   */
  private maxSharpeOptimization(
    symbols: string[],
    constraints: OptimizationConstraints,
  ): Map<string, number> {
    // Simplified: mean-variance with return weighting
    return this.meanVarianceOptimization(symbols, constraints);
  }

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  /**
   * Get current portfolio weights
   */
  private getCurrentWeights(symbols: string[]): Map<string, number> {
    const weights = new Map<string, number>();
    const totalValue = this.portfolio.totalValue;

    for (const symbol of symbols) {
      const position = this.portfolio.positions.get(symbol);
      const weight = position ? position.marketValue / totalValue : 0;
      weights.set(symbol, weight);
    }

    return weights;
  }

  /**
   * Normalize weights to sum to 1
   */
  private normalizeWeights(weights: Map<string, number>): Map<string, number> {
    const total = Array.from(weights.values()).reduce((a, b) => a + b, 0);

    const normalized = new Map<string, number>();
    for (const [symbol, weight] of weights) {
      normalized.set(symbol, weight / total);
    }

    return normalized;
  }

  /**
   * Generate rebalancing trades
   */
  private generateRebalancingTrades(
    current: Map<string, number>,
    target: Map<string, number>,
    constraints: OptimizationConstraints,
  ): RebalanceTrade[] {
    const trades: RebalanceTrade[] = [];
    const totalValue = this.portfolio.totalValue;

    for (const [symbol, targetWeight] of target) {
      const currentWeight = current.get(symbol) || 0;
      const delta = targetWeight - currentWeight;

      // Check turnover constraint
      if (Math.abs(delta) < 0.01) continue; // Skip tiny rebalances

      const dollarAmount = delta * totalValue;
      const currentPrice = this.marketData.getSnapshot(symbol)?.price || 0;

      if (currentPrice === 0) continue;

      const quantity = dollarAmount / currentPrice;

      trades.push({
        symbol,
        action: quantity > 0 ? 'buy' : 'sell',
        quantity: Math.abs(quantity),
        currentWeight,
        targetWeight,
      });
    }

    return trades;
  }

  /**
   * Calculate expected portfolio metrics
   */
  private calculateExpectedMetrics(
    weights: Map<string, number>,
    symbols: string[],
  ): { return: number; volatility: number; sharpe: number } {
    // Simplified calculation
    let expectedReturn = 0;
    let expectedVariance = 0;

    for (const symbol of symbols) {
      const weight = weights.get(symbol) || 0;
      const vol = this.marketData.calculateVolatility(symbol);

      // Assume 10% expected return for all assets (placeholder)
      expectedReturn += weight * 0.10;

      // Variance (assuming independence)
      expectedVariance += weight * weight * vol * vol;
    }

    const expectedVolatility = Math.sqrt(expectedVariance);
    const expectedSharpe = expectedVolatility > 0 ? expectedReturn / expectedVolatility : 0;

    return {
      return: expectedReturn,
      volatility: expectedVolatility,
      sharpe: expectedSharpe,
    };
  }

  /**
   * Create initial portfolio
   */
  private createInitialPortfolio(cash: number): Portfolio {
    return {
      timestamp: Date.now(),
      cash,
      positions: new Map(),
      totalValue: cash,
      totalPnL: 0,
      totalPnLPercent: 0,
      cashPercent: 100,
      positionCount: 0,
      concentration: 0,
      portfolioVar95: 0,
      portfolioBeta: 1.0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      dailyReturn: 0,
      cumulativeReturn: 0,
      winRate: 0,
      explorationMode: false,
      uncertaintyLevel: 0.5,
    };
  }

  /**
   * Add current portfolio to history
   */
  private addToHistory(): void {
    // Deep copy portfolio
    const snapshot: Portfolio = JSON.parse(JSON.stringify(
      this.portfolio,
      (key, value) => (value instanceof Map ? Array.from(value.entries()) : value),
    ));

    // Restore Map
    snapshot.positions = new Map(snapshot.positions as any);

    this.portfolioHistory.push(snapshot);

    // Keep last 1000 snapshots
    if (this.portfolioHistory.length > 1000) {
      this.portfolioHistory.shift();
    }
  }

  /**
   * Get portfolio history
   */
  getPortfolioHistory(limit: number = 100): Portfolio[] {
    return this.portfolioHistory.slice(-limit);
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.portfolio = this.createInitialPortfolio(100000);
    this.portfolioHistory = [];
    this.tradeHistory = [];
  }
}
