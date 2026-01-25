/**
 * Polymarket Integration - Main Exports
 *
 * Prediction market trading powered by Active Inference.
 *
 * Usage:
 * ```typescript
 * import { PolymarketTrader } from './finance/polymarket';
 *
 * const trader = new PolymarketTrader({
 *   simulationMode: true,
 *   maxPositionSize: 100,
 *   maxPortfolioRisk: 500,
 * });
 *
 * await trader.start();
 * const stats = await trader.getPortfolioStats();
 * await trader.stop();
 * ```
 */

import { PolymarketClient } from './client.js';
import { MarketDiscovery, MarketMonitor } from './markets.js';
import { ActiveInferenceStrategy } from './strategy.js';
import { TradeExecutor } from './executor.js';
import { PolymarketEventBus } from './bus-wiring.js';
import type {
  StrategyConfig,
  PolymarketMarket,
  MarketBelief,
  TradingPolicy,
  PortfolioStats,
  Position,
  Trade,
  MarketFilter,
} from './types.js';

// Re-export types
export type {
  PolymarketMarket,
  MarketBelief,
  TradingPolicy,
  PortfolioStats,
  Position,
  Trade,
  MarketFilter,
  StrategyConfig,
};

// Re-export components
export { PolymarketClient } from './client.js';
export { MarketDiscovery, MarketMonitor } from './markets.js';
export { ActiveInferenceStrategy } from './strategy.js';
export { TradeExecutor } from './executor.js';
export { setEventBus as setPolymarketEventBus } from './bus-wiring.js';

// ============================================================================
// Main Trader Interface
// ============================================================================

export interface PolymarketTraderConfig {
  // API configuration
  apiKey?: string;
  simulationMode?: boolean;

  // Strategy configuration
  strategy?: Partial<StrategyConfig>;

  // Risk management
  maxPositionSize?: number;
  maxPortfolioRisk?: number;

  // Market discovery
  marketFilter?: MarketFilter;
  minRelevanceScore?: number;

  // Update intervals
  discoveryIntervalMs?: number;
  monitorIntervalMs?: number;
  tradingIntervalMs?: number;
}

const DEFAULT_CONFIG: Required<Omit<PolymarketTraderConfig, 'apiKey' | 'strategy' | 'marketFilter'>> = {
  simulationMode: true,
  maxPositionSize: 100,
  maxPortfolioRisk: 500,
  minRelevanceScore: 0.5,
  discoveryIntervalMs: 60000,    // 1 minute
  monitorIntervalMs: 10000,      // 10 seconds
  tradingIntervalMs: 30000,      // 30 seconds
};

const DEFAULT_STRATEGY: StrategyConfig = {
  beliefUpdateRate: 0.1,
  epistemeicWeight: 0.3,
  priorStrength: 1.0,
  maxPositionSize: 100,
  maxPortfolioRisk: 500,
  minEdge: 0.05,
  useNeuromodulation: true,
  simulationMode: true,
};

/**
 * High-level Polymarket trading system
 */
export class PolymarketTrader {
  private config: Required<Omit<PolymarketTraderConfig, 'apiKey' | 'strategy' | 'marketFilter'>>;
  private client: PolymarketClient;
  private discovery: MarketDiscovery;
  private monitor: MarketMonitor;
  private strategy: ActiveInferenceStrategy;
  private executor: TradeExecutor;
  private eventBus: PolymarketEventBus;

  private discoveryTimer: ReturnType<typeof setInterval> | null = null;
  private tradingTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(config?: PolymarketTraderConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize components
    this.client = new PolymarketClient({
      apiKey: config?.apiKey,
      simulationMode: this.config.simulationMode,
    });

    this.discovery = new MarketDiscovery(this.client);
    this.monitor = new MarketMonitor(this.client);

    const strategyConfig: StrategyConfig = {
      ...DEFAULT_STRATEGY,
      maxPositionSize: this.config.maxPositionSize,
      maxPortfolioRisk: this.config.maxPortfolioRisk,
      simulationMode: this.config.simulationMode,
      ...config?.strategy,
    };

    this.strategy = new ActiveInferenceStrategy(strategyConfig);

    this.executor = new TradeExecutor(this.client, {
      maxPositionSize: this.config.maxPositionSize,
      maxPortfolioRisk: this.config.maxPortfolioRisk,
      simulationMode: this.config.simulationMode,
    });

    this.eventBus = new PolymarketEventBus();
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start the trading system
   */
  async start(): Promise<void> {
    if (this.running) return;

    console.log('[PolymarketTrader] Starting...');

    // Start mock price updates
    this.client.startPriceUpdates();

    // Initial market discovery
    await this.discoverMarkets();

    // Start monitoring
    const markets = this.discovery.getTrackedMarkets();
    this.monitor.start(markets, this.config.monitorIntervalMs);

    // Start periodic discovery
    this.discoveryTimer = setInterval(
      () => this.discoverMarkets(),
      this.config.discoveryIntervalMs
    );

    // Start periodic trading
    this.tradingTimer = setInterval(
      () => this.runTradingCycle(),
      this.config.tradingIntervalMs
    );

    this.running = true;
    console.log('[PolymarketTrader] Started successfully');
  }

  /**
   * Stop the trading system
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    console.log('[PolymarketTrader] Stopping...');

    // Stop timers
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }

    if (this.tradingTimer) {
      clearInterval(this.tradingTimer);
      this.tradingTimer = null;
    }

    // Stop monitoring
    this.monitor.stop();
    this.client.stopPriceUpdates();

    // Clean up event bus
    this.eventBus.cleanup();

    this.running = false;
    console.log('[PolymarketTrader] Stopped');
  }

  // ==========================================================================
  // Trading Logic
  // ==========================================================================

  /**
   * Discover and track relevant markets
   */
  private async discoverMarkets(): Promise<void> {
    try {
      const discoveries = await this.discovery.discoverMarkets({
        minRelevanceScore: this.config.minRelevanceScore,
      });

      for (const discovery of discoveries) {
        this.eventBus.publisher.publishMarketDiscovered(
          discovery.market.id,
          discovery.market.question,
          discovery.relevance,
          discovery.market.category
        );
      }

      // Update monitoring
      const markets = this.discovery.getTrackedMarkets();
      if (markets.length > 0) {
        this.monitor.stop();
        this.monitor.start(markets, this.config.monitorIntervalMs);
      }
    } catch (error) {
      console.error('[PolymarketTrader] Market discovery failed:', error);
    }
  }

  /**
   * Run a trading cycle: analyze markets and execute policies
   */
  private async runTradingCycle(): Promise<void> {
    try {
      const markets = this.discovery.getTrackedMarkets();
      const neuromodState = this.eventBus.getNeuromodState();

      for (const market of markets) {
        for (const outcome of market.outcomes) {
          // Get current position
          const position = this.executor.getPositionManager().getPosition(market.id, outcome);
          const currentShares = position?.shares ?? 0;

          // Analyze market and generate policy
          const { belief, policy } = await this.strategy.analyzeMarket(
            this.client,
            market,
            outcome,
            this.monitor,
            currentShares,
            neuromodState
          );

          // Publish belief update
          this.eventBus.publisher.publishBeliefUpdated(belief, null);

          // Execute if policy suggests action
          if (policy.action !== 'hold' && policy.confidence > 0.5) {
            const result = await this.executor.execute(policy);

            if (result.executed && result.trade) {
              this.eventBus.publisher.publishTradeExecuted(
                result.trade,
                policy,
                neuromodState
              );
            }
          }
        }
      }

      // Publish portfolio update
      const stats = await this.executor.getPortfolioStats();
      this.eventBus.publisher.publishPortfolioUpdate(stats, {
        value: 0,
        pnl: stats.totalPnL,
      });
    } catch (error) {
      console.error('[PolymarketTrader] Trading cycle failed:', error);
    }
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Get current portfolio statistics
   */
  async getPortfolioStats(): Promise<PortfolioStats> {
    return this.executor.getPortfolioStats();
  }

  /**
   * Get all current positions
   */
  async getPositions(): Promise<Position[]> {
    return this.executor.getPositionManager().getAllPositions();
  }

  /**
   * Get all current beliefs
   */
  getBeliefs(): MarketBelief[] {
    return this.strategy.getBeliefs();
  }

  /**
   * Get tracked markets
   */
  getTrackedMarkets(): PolymarketMarket[] {
    return this.discovery.getTrackedMarkets();
  }

  /**
   * Get trade history
   */
  getTradeHistory(): Trade[] {
    return this.executor.getTradeHistory();
  }

  /**
   * Close a specific position
   */
  async closePosition(marketId: string, outcome: string): Promise<{
    closed: boolean;
    pnl?: number;
  }> {
    return this.executor.closePosition(marketId, outcome);
  }

  /**
   * Close all positions
   */
  async closeAllPositions(): Promise<{
    closed: number;
    totalPnL: number;
  }> {
    return this.executor.closeAllPositions();
  }

  /**
   * Search for markets by keywords
   */
  async searchMarkets(keywords: string[]): Promise<PolymarketMarket[]> {
    const discoveries = await this.discovery.searchMarkets(keywords);
    return discoveries.map(d => d.market);
  }

  /**
   * Manually analyze a specific market
   */
  async analyzeMarket(
    marketId: string,
    outcome: string
  ): Promise<{ belief: MarketBelief; policy: TradingPolicy } | null> {
    const market = await this.client.getMarket(marketId);
    if (!market) return null;

    const position = this.executor.getPositionManager().getPosition(marketId, outcome);
    const currentShares = position?.shares ?? 0;
    const neuromodState = this.eventBus.getNeuromodState();

    return this.strategy.analyzeMarket(
      this.client,
      market,
      outcome,
      this.monitor,
      currentShares,
      neuromodState
    );
  }

  /**
   * Check if trader is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get configuration
   */
  getConfig(): StrategyConfig {
    return this.strategy.getConfig();
  }

  /**
   * Update strategy configuration
   */
  updateConfig(config: Partial<StrategyConfig>): void {
    this.strategy.updateConfig(config);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Polymarket trader instance
 */
export function createPolymarketTrader(config?: PolymarketTraderConfig): PolymarketTrader {
  return new PolymarketTrader(config);
}
