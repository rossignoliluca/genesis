/**
 * Genesis Finance - Event Bus Wiring
 *
 * Connects the finance module to the Genesis event bus.
 * Integrates with Active Inference, neuromodulation, and nociception.
 */

import type { GenesisEventBus } from '../bus/event-bus.js';
import type { MarketDataAggregator } from './market-data.js';
import type { SignalGenerator } from './signals.js';
import type { RegimeDetector } from './regime-detector.js';
import type { RiskEngine } from './risk-engine.js';
import type { PortfolioManager } from './portfolio.js';
import type { FinanceConfig } from './types.js';

// ============================================================================
// Finance Event Bus Integration
// ============================================================================

export class FinanceBusWiring {
  private neuromodLevels = {
    dopamine: 0.5,
    serotonin: 0.5,
    norepinephrine: 0.5,
    cortisol: 0.3,
  };

  // Store Active Inference beliefs metadata (not the full Beliefs object)
  private activeInferenceMeta: { beliefType: string; entropy: number; confidence: number } | undefined;

  // Store interval handles for proper cleanup
  private intervalHandles: ReturnType<typeof setInterval>[] = [];

  constructor(
    private bus: GenesisEventBus,
    private marketData: MarketDataAggregator,
    private signalGenerator: SignalGenerator,
    private regimeDetector: RegimeDetector,
    private riskEngine: RiskEngine,
    private portfolio: PortfolioManager,
    private config: FinanceConfig,
  ) {}

  // --------------------------------------------------------------------------
  // Wire Up Event Bus
  // --------------------------------------------------------------------------

  /**
   * Subscribe to relevant events from other modules
   */
  wireUp(): void {
    // Subscribe to neuromodulation updates
    this.bus.subscribe('neuromod.levels.changed', (event) => {
      // Derive cortisol from neuromodulation:
      // - High norepinephrine (stress/arousal) increases cortisol
      // - High serotonin (well-being) decreases cortisol
      // - Low dopamine (low reward) increases cortisol
      const derivedCortisol = Math.max(0, Math.min(1,
        0.3 +
        (event.levels.norepinephrine - 0.5) * 0.5 +   // NE pushes cortisol up
        (0.5 - event.levels.serotonin) * 0.3 +        // Low 5HT pushes cortisol up
        (0.5 - event.levels.dopamine) * 0.2           // Low DA pushes cortisol up
      ));

      this.neuromodLevels = {
        dopamine: event.levels.dopamine,
        serotonin: event.levels.serotonin,
        norepinephrine: event.levels.norepinephrine,
        cortisol: derivedCortisol,
      };

      // Adjust trading based on neuromodulation
      this.adjustTradingFromNeuromod();
    });

    // Subscribe to Active Inference beliefs updates
    this.bus.subscribe('inference.beliefs.updated', (event) => {
      // Store beliefs metadata (for logging/debugging, not signal generation)
      // Full Beliefs integration requires importing the complete Beliefs type
      this.activeInferenceMeta = {
        beliefType: event.beliefType,
        entropy: event.entropy,
        confidence: event.confidence,
      };
    });

    // Subscribe to consciousness phi updates
    this.bus.subscribe('consciousness.phi.updated', (event) => {
      // When consciousness is low, reduce trading activity
      if (event.phi < 0.3) {
        // Low consciousness = conservative mode
        this.publishEvent('finance.regime.changed', {
          message: 'Low consciousness detected, entering conservative mode',
          phi: event.phi,
        });
      }
    });

    // Subscribe to economic events (to track our own costs)
    this.bus.subscribe('economy.cost.recorded', (event) => {
      // Track trading costs
      if (event.module === 'finance') {
        this.publishEvent('finance.cost.recorded', {
          amount: event.amount,
          category: event.category,
        });
      }
    });

    // Subscribe to panic events (stop trading in panic)
    this.bus.subscribe('kernel.panic', (event) => {
      this.publishEvent('finance.trading.halted', {
        reason: 'System panic detected',
        severity: event.severity,
      });
    });
  }

  // --------------------------------------------------------------------------
  // Publish Finance Events
  // --------------------------------------------------------------------------

  /**
   * Publish market data update
   */
  publishMarketDataUpdate(symbol: string): void {
    const snapshot = this.marketData.getSnapshot(symbol);

    if (!snapshot) return;

    this.publishEvent('finance.market.updated', {
      symbol,
      price: snapshot.price,
      volume: snapshot.volume24h,
      change: snapshot.changePercent24h,
      volatility: snapshot.volatility,
    });
  }

  /**
   * Publish trading signal
   */
  publishSignal(symbol: string): void {
    // Note: Full Active Inference beliefs integration would require
    // constructing a proper Beliefs object from the event bus data
    // For now, we pass undefined and let the signal generator use defaults
    const signal = this.signalGenerator.generateSignal(symbol);

    this.publishEvent('finance.signal.generated', {
      symbol,
      direction: signal.direction,
      strength: signal.strength,
      uncertainty: signal.uncertainty,
      action: signal.action,
      positionSize: signal.positionSize,
    });

    // High surprise = high priority event
    if (signal.surprise > 0.7) {
      this.bus.publish('inference.surprise.high', {
        source: 'finance',
        precision: 0.8,
        magnitude: signal.surprise,
        observation: `${symbol} price movement`,
        expectedState: 'normal volatility',
      });
    }
  }

  /**
   * Publish regime change
   */
  publishRegimeChange(symbol: string): void {
    const regime = this.regimeDetector.detectRegime(symbol);
    const history = this.regimeDetector.getRegimeHistory(symbol, 2);

    const previousRegime = history.length > 1 ? history[history.length - 2].regime : null;

    if (previousRegime && previousRegime !== regime.regime) {
      this.publishEvent('finance.regime.changed', {
        symbol,
        oldRegime: previousRegime,
        newRegime: regime.regime,
        confidence: regime.confidence,
        trendStrength: regime.trendStrength,
      });
    }
  }

  /**
   * Publish drawdown alert (triggers nociception)
   */
  publishDrawdownAlert(symbol: string): void {
    const drawdown = this.riskEngine.analyzeDrawdown(symbol);

    if (drawdown.currentDrawdown > this.config.drawdownPainThreshold) {
      // Publish pain signal
      this.bus.publish('pain.stimulus', {
        source: 'finance',
        precision: 0.9,
        location: `portfolio.${symbol}`,
        intensity: drawdown.painLevel * this.config.painIntensityMultiplier,
        type: drawdown.currentDrawdownDays > 30 ? 'chronic' : 'acute',
      });

      this.publishEvent('finance.drawdown.alert', {
        symbol,
        currentDrawdown: drawdown.currentDrawdown,
        maxDrawdown: drawdown.maxDrawdown,
        painLevel: drawdown.painLevel,
        daysInDrawdown: drawdown.currentDrawdownDays,
      });
    }
  }

  /**
   * Publish position opened
   */
  publishPositionOpened(symbol: string, size: number, price: number): void {
    this.publishEvent('finance.position.opened', {
      symbol,
      size,
      entryPrice: price,
      costBasis: size * price,
    });

    // Publish as economic cost
    this.bus.publish('economy.cost.recorded', {
      source: 'finance',
      precision: 1.0,
      module: 'finance',
      amount: size * price,
      category: 'position_entry',
    });
  }

  /**
   * Publish position closed
   */
  publishPositionClosed(
    symbol: string,
    size: number,
    entryPrice: number,
    exitPrice: number,
    pnl: number,
  ): void {
    this.publishEvent('finance.position.closed', {
      symbol,
      size,
      entryPrice,
      exitPrice,
      realizedPnL: pnl,
      pnlPercent: (pnl / (size * entryPrice)) * 100,
    });

    // If profitable, publish as revenue
    if (pnl > 0) {
      this.bus.publish('economy.revenue.recorded', {
        source: 'finance',
        precision: 1.0,
        amount: pnl,
        revenueSource: 'trading',
      });

      // Positive reward = dopamine boost
      this.bus.publish('neuromod.reward', {
        source: 'finance',
        precision: 0.9,
        signalType: 'reward',
        magnitude: Math.min(1, pnl / 1000), // Normalize
        cause: `Profitable trade: ${symbol} +${pnl.toFixed(2)}`,
      });
    } else {
      // Loss = punishment signal
      this.bus.publish('neuromod.punishment', {
        source: 'finance',
        precision: 0.9,
        signalType: 'punishment',
        magnitude: Math.min(1, Math.abs(pnl) / 1000),
        cause: `Losing trade: ${symbol} ${pnl.toFixed(2)}`,
      });
    }
  }

  /**
   * Publish portfolio rebalance
   */
  publishPortfolioRebalanced(tradeCount: number): void {
    const portfolio = this.portfolio.getPortfolio();

    this.publishEvent('finance.portfolio.rebalanced', {
      tradeCount,
      totalValue: portfolio.totalValue,
      positionCount: portfolio.positionCount,
      sharpeRatio: portfolio.sharpeRatio,
      maxDrawdown: portfolio.maxDrawdown,
    });
  }

  /**
   * Publish risk limit exceeded
   */
  publishRiskLimitExceeded(reason: string, value: number, limit: number): void {
    this.publishEvent('finance.risk.limit_exceeded', {
      reason,
      currentValue: value,
      limit,
    });

    // High risk = threat signal
    this.bus.publish('neuromod.threat', {
      source: 'finance',
      precision: 0.9,
      signalType: 'threat',
      magnitude: Math.min(1, value / limit - 1),
      cause: reason,
    });
  }

  /**
   * Publish opportunity detected
   */
  publishOpportunityDetected(symbol: string, expectedReturn: number): void {
    this.publishEvent('finance.opportunity.detected', {
      symbol,
      expectedReturn,
      timestamp: Date.now(),
    });

    // Opportunity = novelty signal
    this.bus.publish('neuromod.novelty', {
      source: 'finance',
      precision: 0.7,
      signalType: 'novelty',
      magnitude: Math.min(1, expectedReturn * 2),
      cause: `Trading opportunity in ${symbol}`,
    });
  }

  // --------------------------------------------------------------------------
  // Integration Logic
  // --------------------------------------------------------------------------

  /**
   * Adjust trading parameters based on neuromodulation
   */
  private adjustTradingFromNeuromod(): void {
    const { dopamine, serotonin, cortisol } = this.neuromodLevels;

    // High cortisol = reduce risk-taking
    if (cortisol > 0.7 && this.config.cortisolRiskReduction) {
      this.publishEvent('finance.risk.adjustment', {
        reason: 'High cortisol detected',
        cortisolLevel: cortisol,
        action: 'Reducing position sizes',
      });
    }

    // High dopamine = increase exploration
    if (dopamine > 0.7 && this.config.dopamineExploration) {
      this.publishEvent('finance.exploration.increased', {
        reason: 'High dopamine detected',
        dopamineLevel: dopamine,
        action: 'Exploring new trading opportunities',
      });
    }

    // Low serotonin = cautious mode
    if (serotonin < 0.3) {
      this.publishEvent('finance.mode.cautious', {
        reason: 'Low serotonin detected',
        serotoninLevel: serotonin,
        action: 'Entering cautious trading mode',
      });
    }
  }

  /**
   * Get current cortisol level for external use
   */
  getCortisolLevel(): number {
    return this.neuromodLevels.cortisol;
  }

  /**
   * Get all neuromodulation levels
   */
  getNeuromodLevels(): typeof this.neuromodLevels {
    return { ...this.neuromodLevels };
  }

  /**
   * Generic event publisher with standard fields
   * Note: Uses flexible typing for internal finance events that may not be in GenesisEventMap
   */
  private publishEvent(topic: string, data: Record<string, unknown>): void {
    // Use the typed publish for known events, fallback for internal finance events
    const event = {
      source: 'finance',
      precision: 0.8, // Default precision for finance events
      ...data,
    };

    // Cast to any for internal finance events not yet in GenesisEventMap
    // TODO: Add all finance event topics to GenesisEventMap for full type safety
    (this.bus as { publish: (topic: string, data: unknown) => void }).publish(topic, event);
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Start periodic updates
   */
  startPeriodicUpdates(): void {
    // Clear any existing intervals first
    this.stopPeriodicUpdates();

    // Market data updates
    const marketDataInterval = setInterval(() => {
      for (const symbol of this.config.symbols) {
        this.marketData.updateMarketData(symbol);
        this.publishMarketDataUpdate(symbol);
      }
    }, this.config.updateInterval);
    this.intervalHandles.push(marketDataInterval);

    // Signal generation
    const signalInterval = setInterval(() => {
      for (const symbol of this.config.symbols) {
        this.publishSignal(symbol);
        this.publishRegimeChange(symbol);
        this.publishDrawdownAlert(symbol);
      }
    }, this.config.signalInterval);
    this.intervalHandles.push(signalInterval);

    // Portfolio rebalancing
    const rebalanceInterval = setInterval(() => {
      const optimization = this.portfolio.optimizePortfolio(
        this.config.symbols,
        this.config.optimizationMethod,
      );

      if (optimization.trades.length > 0) {
        this.publishPortfolioRebalanced(optimization.trades.length);
      }
    }, this.config.rebalanceInterval);
    this.intervalHandles.push(rebalanceInterval);
  }

  /**
   * Stop all updates and clear intervals
   */
  stopPeriodicUpdates(): void {
    for (const handle of this.intervalHandles) {
      clearInterval(handle);
    }
    this.intervalHandles = [];
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Wire up finance module to Genesis event bus
 */
export function wireFinanceToEventBus(
  bus: GenesisEventBus,
  marketData: MarketDataAggregator,
  signalGenerator: SignalGenerator,
  regimeDetector: RegimeDetector,
  riskEngine: RiskEngine,
  portfolio: PortfolioManager,
  config: FinanceConfig,
): FinanceBusWiring {
  const wiring = new FinanceBusWiring(
    bus,
    marketData,
    signalGenerator,
    regimeDetector,
    riskEngine,
    portfolio,
    config,
  );

  wiring.wireUp();

  return wiring;
}
