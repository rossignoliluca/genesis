/**
 * Event Bus Integration
 *
 * Wires Polymarket trading system to Genesis event bus:
 * - Publishes market discoveries, belief updates, trade executions
 * - Subscribes to neuromodulation for risk adjustment
 * - Subscribes to economic events for budget management
 */

import { createPublisher, createSubscriber } from '../../bus/index.js';
import type { GenesisEventBus } from '../../bus/event-bus.js';
import type {
  MarketBelief,
  TradingPolicy,
  Trade,
  PortfolioStats,
  Position,
} from './types.js';

// Get the singleton event bus for publishing
let busInstance: GenesisEventBus | null = null;

export function setEventBus(bus: GenesisEventBus): void {
  busInstance = bus;
}

// ============================================================================
// Event Publishers
// ============================================================================

/**
 * Publisher for Polymarket events
 */
export class PolymarketEventPublisher {
  private publisher = createPublisher('polymarket');

  /**
   * Publish market discovery
   */
  publishMarketDiscovered(
    marketId: string,
    question: string,
    relevance: number,
    category: string,
    outcomes: string[] = []
  ): void {
    console.log(`[Polymarket] Market discovered: ${question} (relevance: ${relevance.toFixed(2)})`);

    // Publish to event bus
    if (busInstance) {
      busInstance.publish('polymarket.market.discovered', {
        source: 'polymarket',
        precision: relevance,
        marketId,
        question,
        relevance,
        category,
        outcomes,
      });
    }
  }

  /**
   * Publish belief update
   */
  publishBeliefUpdated(
    belief: MarketBelief,
    previousBelief: MarketBelief | null
  ): void {
    const surprise = belief.surprise;

    console.log(
      `[Polymarket] Belief updated: ${belief.marketId}:${belief.outcome} ` +
      `subjective=${belief.subjective_p.toFixed(3)} market=${belief.market_p.toFixed(3)} ` +
      `surprise=${surprise.toFixed(3)}`
    );

    // Publish belief update to event bus
    if (busInstance) {
      busInstance.publish('polymarket.belief.updated', {
        source: 'polymarket',
        precision: belief.confidence,
        marketId: belief.marketId,
        outcome: belief.outcome,
        subjectiveP: belief.subjective_p,
        marketP: belief.market_p,
        surprise: belief.surprise,
        confidence: belief.confidence,
      });

      // Publish to Active Inference for high-surprise updates
      if (surprise > 0.1) {
        busInstance.publish('inference.surprise.high', {
          source: 'polymarket',
          precision: 0.8,
          magnitude: surprise,
          observation: `${belief.marketId}:${belief.outcome} probability shift`,
          expectedState: `subjective=${belief.subjective_p.toFixed(3)}`,
        });
      }
    }
  }

  /**
   * Publish trade execution
   */
  publishTradeExecuted(
    trade: Trade,
    policy: TradingPolicy,
    neuromodState: {
      dopamine: number;
      cortisol: number;
      riskTolerance: number;
    }
  ): void {
    console.log(
      `[Polymarket] Trade executed: ${trade.side.toUpperCase()} ${trade.size} shares ` +
      `of ${trade.marketId}:${trade.outcome} @ ${trade.price.toFixed(3)} ` +
      `(risk_tolerance=${neuromodState.riskTolerance.toFixed(2)})`
    );

    // Record economic cost (trading fees, opportunity cost)
    const tradeCost = trade.size * trade.price * 0.02; // 2% fee assumption

    if (busInstance) {
      // Publish trade event
      busInstance.publish('polymarket.trade.executed', {
        source: 'polymarket',
        precision: 1.0,
        marketId: trade.marketId,
        outcome: trade.outcome,
        side: trade.side,
        size: trade.size,
        price: trade.price,
        riskTolerance: neuromodState.riskTolerance,
      });

      // Record trading cost
      busInstance.publish('economy.cost.recorded', {
        source: 'polymarket',
        precision: 1.0,
        module: 'polymarket',
        amount: tradeCost,
        category: 'trading_fees',
      });
    }
  }

  /**
   * Publish position close
   */
  publishPositionClosed(
    position: Position,
    realizedPnL: number,
    outcome: 'win' | 'loss'
  ): void {
    console.log(
      `[Polymarket] Position closed: ${position.marketId}:${position.outcome} ` +
      `PnL=${realizedPnL.toFixed(2)} (${outcome})`
    );

    if (busInstance) {
      // Record revenue if profitable
      if (realizedPnL > 0) {
        busInstance.publish('economy.revenue.recorded', {
          source: 'polymarket',
          precision: 1.0,
          amount: realizedPnL,
          revenueSource: 'prediction_market_trading',
        });

        // Reward signal
        busInstance.publish('neuromod.reward', {
          source: 'polymarket',
          precision: 0.9,
          signalType: 'reward',
          magnitude: Math.min(1, realizedPnL / 100),
          cause: `Profitable trade: ${position.marketId} +$${realizedPnL.toFixed(2)}`,
        });
      } else {
        // Punishment signal for loss
        busInstance.publish('neuromod.punishment', {
          source: 'polymarket',
          precision: 0.9,
          signalType: 'punishment',
          magnitude: Math.min(1, Math.abs(realizedPnL) / 100),
          cause: `Losing trade: ${position.marketId} -$${Math.abs(realizedPnL).toFixed(2)}`,
        });
      }
    }
  }

  /**
   * Publish portfolio update
   */
  publishPortfolioUpdate(stats: PortfolioStats, delta: { value: number; pnl: number }): void {
    console.log(
      `[Polymarket] Portfolio: value=${stats.totalValue.toFixed(2)} ` +
      `pnl=${stats.totalPnL.toFixed(2)} winRate=${(stats.winRate * 100).toFixed(1)}% ` +
      `positions=${stats.activePositions}`
    );

    if (busInstance) {
      busInstance.publish('polymarket.portfolio.updated', {
        source: 'polymarket',
        precision: 1.0,
        totalValue: stats.totalValue,
        totalPnL: stats.totalPnL,
        winRate: stats.winRate,
        activePositions: stats.activePositions,
      });
    }
  }
}

// ============================================================================
// Event Subscribers
// ============================================================================

/**
 * Subscriber for external events affecting trading
 */
export class PolymarketEventSubscriber {
  private subscriber = createSubscriber('polymarket');
  private neuromodState = {
    dopamine: 0.5,
    serotonin: 0.6,
    norepinephrine: 0.4,
    cortisol: 0.3,
    riskTolerance: 0.5,
    explorationBonus: 1.0,
  };

  constructor() {
    this.setupSubscriptions();
  }

  /**
   * Set up event bus subscriptions
   */
  private setupSubscriptions(): void {
    // Subscribe to neuromodulation updates
    this.subscriber.on('neuromod.levels.changed', (event) => {
      this.neuromodState.dopamine = event.levels.dopamine;
      this.neuromodState.serotonin = event.levels.serotonin;
      this.neuromodState.norepinephrine = event.levels.norepinephrine;

      // Derive cortisol from neuromodulation (consistent with finance module):
      // - High norepinephrine (stress/arousal) increases cortisol
      // - High serotonin (well-being) decreases cortisol
      // - Low dopamine (low reward) increases cortisol
      this.neuromodState.cortisol = Math.max(0, Math.min(1,
        0.3 +
        (event.levels.norepinephrine - 0.5) * 0.5 +
        (0.5 - event.levels.serotonin) * 0.3 +
        (0.5 - event.levels.dopamine) * 0.2
      ));

      // Update derived parameters
      this.neuromodState.riskTolerance = event.effect.explorationRate;
      this.neuromodState.explorationBonus = event.effect.learningRate * 2;

      console.log(
        `[Polymarket] Neuromod update: riskTolerance=${this.neuromodState.riskTolerance.toFixed(2)} ` +
        `cortisol=${this.neuromodState.cortisol.toFixed(2)} exploration=${this.neuromodState.explorationBonus.toFixed(2)}`
      );
    });

    // Subscribe to economic events
    this.subscriber.on('economy.budget.reallocated', (event) => {
      console.log(`[Polymarket] Budget reallocated, adjusting position limits`);
      // In production, would adjust maxPositionSize based on budget
    });

    // Subscribe to kernel mode changes
    this.subscriber.on('kernel.mode.changed', (event) => {
      if (event.newMode === 'vigilant') {
        console.log(`[Polymarket] Kernel mode: ${event.newMode}, increasing caution`);
        // In vigilant mode, reduce risk
        this.neuromodState.riskTolerance *= 0.7;
      } else if (event.newMode === 'dormant') {
        console.log(`[Polymarket] Kernel mode: dormant, pausing trading`);
        // In dormant mode, stop trading
        this.neuromodState.riskTolerance = 0;
      }
    });
  }

  /**
   * Get current neuromodulation state for trading decisions
   */
  getNeuromodState(): {
    dopamine: number;
    cortisol: number;
    riskTolerance: number;
    explorationBonus: number;
  } {
    return {
      dopamine: this.neuromodState.dopamine,
      cortisol: this.neuromodState.cortisol,
      riskTolerance: this.neuromodState.riskTolerance,
      explorationBonus: this.neuromodState.explorationBonus,
    };
  }

  /**
   * Clean up subscriptions
   */
  cleanup(): void {
    this.subscriber.unsubscribeAll();
  }
}

// ============================================================================
// Integrated Event Bus
// ============================================================================

/**
 * Combined event bus interface for Polymarket
 */
export class PolymarketEventBus {
  public readonly publisher: PolymarketEventPublisher;
  public readonly subscriber: PolymarketEventSubscriber;

  constructor() {
    this.publisher = new PolymarketEventPublisher();
    this.subscriber = new PolymarketEventSubscriber();
  }

  /**
   * Get neuromodulation state for trading
   */
  getNeuromodState() {
    return this.subscriber.getNeuromodState();
  }

  /**
   * Clean up
   */
  cleanup(): void {
    this.subscriber.cleanup();
  }
}
