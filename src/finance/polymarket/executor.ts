/**
 * Trade Execution Engine
 *
 * Executes trading policies with:
 * - Position management
 * - Risk controls
 * - PnL tracking
 * - Simulation mode
 */

import type { PolymarketClient } from './client.js';
import type {
  TradingPolicy,
  Position,
  Trade,
  PortfolioStats,
  PositionClosedEvent,
} from './types.js';

// ============================================================================
// Position Manager
// ============================================================================

export class PositionManager {
  private client: PolymarketClient;
  private positions: Map<string, Position> = new Map();
  private closedPositions: PositionClosedEvent[] = [];

  constructor(client: PolymarketClient) {
    this.client = client;
  }

  /**
   * Get current position for a market outcome
   */
  getPosition(marketId: string, outcome: string): Position | null {
    const key = `${marketId}:${outcome}`;
    return this.positions.get(key) ?? null;
  }

  /**
   * Get all positions
   */
  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Update positions from client
   */
  async syncPositions(): Promise<void> {
    const positions = await this.client.getPositions();

    this.positions.clear();
    for (const pos of positions) {
      const key = `${pos.marketId}:${pos.outcome}`;
      this.positions.set(key, pos);
    }
  }

  /**
   * Record a position close
   */
  recordClose(position: Position, outcome: 'win' | 'loss'): void {
    const event: PositionClosedEvent = {
      position,
      realizedPnL: position.realizedPnL,
      holdingPeriod: 0, // Would calculate from entry time
      outcome,
    };

    this.closedPositions.push(event);

    // Remove from active positions
    const key = `${position.marketId}:${position.outcome}`;
    this.positions.delete(key);
  }

  /**
   * Get closed positions
   */
  getClosedPositions(): PositionClosedEvent[] {
    return [...this.closedPositions];
  }
}

// ============================================================================
// Risk Manager
// ============================================================================

export class RiskManager {
  private maxPositionSize: number;
  private maxPortfolioRisk: number;
  private currentRisk = 0;

  constructor(maxPositionSize: number, maxPortfolioRisk: number) {
    this.maxPositionSize = maxPositionSize;
    this.maxPortfolioRisk = maxPortfolioRisk;
  }

  /**
   * Check if a trade passes risk limits
   */
  canTrade(policy: TradingPolicy, positions: Position[]): {
    allowed: boolean;
    reason?: string;
  } {
    // Calculate current risk exposure
    const totalRisk = positions.reduce((sum, pos) => {
      return sum + Math.abs(pos.shares * pos.averagePrice);
    }, 0);

    // Calculate trade size
    const tradeSize = policy.targetShares * policy.maxRisk;

    // Check position limit
    if (tradeSize > this.maxPositionSize) {
      return {
        allowed: false,
        reason: `Trade size ${tradeSize.toFixed(2)} exceeds position limit ${this.maxPositionSize}`,
      };
    }

    // Check portfolio limit
    if (totalRisk + tradeSize > this.maxPortfolioRisk) {
      return {
        allowed: false,
        reason: `Portfolio risk ${(totalRisk + tradeSize).toFixed(2)} would exceed limit ${this.maxPortfolioRisk}`,
      };
    }

    // Check confidence threshold
    if (policy.confidence < 0.3) {
      return {
        allowed: false,
        reason: `Confidence ${policy.confidence.toFixed(2)} too low`,
      };
    }

    return { allowed: true };
  }

  /**
   * Update risk exposure
   */
  updateRisk(positions: Position[]): void {
    this.currentRisk = positions.reduce((sum, pos) => {
      return sum + Math.abs(pos.shares * pos.averagePrice);
    }, 0);
  }

  /**
   * Get current risk metrics
   */
  getRiskMetrics(): {
    currentRisk: number;
    utilizationPct: number;
    headroom: number;
  } {
    return {
      currentRisk: this.currentRisk,
      utilizationPct: (this.currentRisk / this.maxPortfolioRisk) * 100,
      headroom: this.maxPortfolioRisk - this.currentRisk,
    };
  }
}

// ============================================================================
// Trade Executor
// ============================================================================

export class TradeExecutor {
  private client: PolymarketClient;
  private positionManager: PositionManager;
  private riskManager: RiskManager;
  private simulationMode: boolean;
  private executedTrades: Trade[] = [];

  constructor(
    client: PolymarketClient,
    options: {
      maxPositionSize: number;
      maxPortfolioRisk: number;
      simulationMode?: boolean;
    }
  ) {
    this.client = client;
    this.positionManager = new PositionManager(client);
    this.riskManager = new RiskManager(
      options.maxPositionSize,
      options.maxPortfolioRisk
    );
    this.simulationMode = options.simulationMode ?? true;
  }

  /**
   * Execute a trading policy
   */
  async execute(policy: TradingPolicy): Promise<{
    executed: boolean;
    trade?: Trade;
    reason: string;
  }> {
    // Sync positions
    await this.positionManager.syncPositions();
    const positions = this.positionManager.getAllPositions();

    // Check risk limits
    const riskCheck = this.riskManager.canTrade(policy, positions);
    if (!riskCheck.allowed) {
      return {
        executed: false,
        reason: riskCheck.reason ?? 'Risk check failed',
      };
    }

    // Get current position
    const currentPos = this.positionManager.getPosition(
      policy.marketId,
      policy.outcome
    );
    const currentShares = currentPos?.shares ?? 0;

    // Calculate trade
    const sharesToTrade = policy.targetShares - currentShares;

    if (Math.abs(sharesToTrade) < 1) {
      return {
        executed: false,
        reason: 'No significant position change needed',
      };
    }

    // Execute trade
    let trade: Trade;

    try {
      if (sharesToTrade > 0) {
        // Buy
        trade = await this.client.buy(
          policy.marketId,
          policy.outcome,
          Math.abs(sharesToTrade),
          policy.maxRisk
        );
      } else {
        // Sell
        trade = await this.client.sell(
          policy.marketId,
          policy.outcome,
          Math.abs(sharesToTrade),
          policy.maxRisk
        );
      }

      this.executedTrades.push(trade);

      // Update risk
      await this.positionManager.syncPositions();
      this.riskManager.updateRisk(this.positionManager.getAllPositions());

      return {
        executed: true,
        trade,
        reason: `Executed ${trade.side} ${trade.size} shares at ${trade.price.toFixed(3)}`,
      };
    } catch (error) {
      return {
        executed: false,
        reason: `Execution failed: ${error}`,
      };
    }
  }

  /**
   * Close a position
   */
  async closePosition(
    marketId: string,
    outcome: string
  ): Promise<{
    closed: boolean;
    trade?: Trade;
    pnl?: number;
  }> {
    const position = this.positionManager.getPosition(marketId, outcome);

    if (!position || position.shares === 0) {
      return { closed: false };
    }

    // Sell all shares
    const trade = await this.client.sell(marketId, outcome, position.shares);

    // Calculate realized PnL
    const pnl = position.shares * (trade.price - position.averagePrice);

    // Record close
    this.positionManager.recordClose(position, pnl > 0 ? 'win' : 'loss');

    return {
      closed: true,
      trade,
      pnl,
    };
  }

  /**
   * Close all positions
   */
  async closeAllPositions(): Promise<{
    closed: number;
    totalPnL: number;
  }> {
    const positions = this.positionManager.getAllPositions();
    let closed = 0;
    let totalPnL = 0;

    for (const pos of positions) {
      const result = await this.closePosition(pos.marketId, pos.outcome);
      if (result.closed) {
        closed++;
        totalPnL += result.pnl ?? 0;
      }
    }

    return { closed, totalPnL };
  }

  /**
   * Get portfolio statistics
   */
  async getPortfolioStats(): Promise<PortfolioStats> {
    await this.positionManager.syncPositions();
    const positions = this.positionManager.getAllPositions();
    const closedPositions = this.positionManager.getClosedPositions();

    // Calculate total value
    const totalValue = positions.reduce((sum, pos) => {
      return sum + pos.shares * pos.currentPrice;
    }, 0);

    // Calculate total PnL
    const unrealizedPnL = positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
    const realizedPnL = closedPositions.reduce((sum, event) => sum + event.realizedPnL, 0);
    const totalPnL = unrealizedPnL + realizedPnL;

    // Calculate win rate
    const wins = closedPositions.filter(e => e.outcome === 'win').length;
    const winRate = closedPositions.length > 0 ? wins / closedPositions.length : 0;

    // Simplified Sharpe ratio (would need return series for proper calculation)
    const avgReturn = closedPositions.length > 0
      ? realizedPnL / closedPositions.length
      : 0;
    const sharpeRatio = avgReturn > 0 ? avgReturn / 100 : 0; // Placeholder

    // Calculate max drawdown (simplified)
    let maxDrawdown = 0;
    let peak = 0;
    let runningPnL = 0;

    for (const event of closedPositions) {
      runningPnL += event.realizedPnL;
      if (runningPnL > peak) {
        peak = runningPnL;
      }
      const drawdown = peak - runningPnL;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return {
      totalValue,
      totalPnL,
      winRate,
      sharpeRatio,
      maxDrawdown,
      activePositions: positions.length,
      tradesCount: this.executedTrades.length,
    };
  }

  /**
   * Get position manager (for external access)
   */
  getPositionManager(): PositionManager {
    return this.positionManager;
  }

  /**
   * Get risk manager (for external access)
   */
  getRiskManager(): RiskManager {
    return this.riskManager;
  }

  /**
   * Get trade history
   */
  getTradeHistory(): Trade[] {
    return [...this.executedTrades];
  }
}
