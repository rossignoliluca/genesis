/**
 * Genesis Finance Module
 *
 * Market data aggregation, trading signals, risk management, and portfolio optimization
 * with Active Inference integration.
 *
 * Features:
 * - Multi-source market data (simulation + real APIs)
 * - Regime detection (bull/bear/neutral/crisis)
 * - Trading signals with uncertainty quantification
 * - Risk management (VaR, drawdown, position sizing)
 * - Portfolio optimization (mean-variance, risk parity, Kelly)
 * - Event bus integration (neuromodulation, nociception, Active Inference)
 *
 * Scientific grounding:
 * - Active Inference for uncertainty quantification
 * - Kelly criterion for position sizing
 * - Modern Portfolio Theory (Markowitz)
 * - Risk parity optimization
 * - Bayesian surprise for anomaly detection
 */

// ============================================================================
// Exports
// ============================================================================

// Types
export type {
  OHLCV,
  MarketSnapshot,
  OrderBook,
  DataSource,
  TradingSignal,
  MarketBeliefs,
  TradeAction,
  SignalFactor,
  RegimeBeliefs,
  TrendBeliefs,
  VolatilityBeliefs,
  MarketRegime,
  RegimeDetection,
  RegimeIndicator,
  VaRResult,
  DrawdownAnalysis,
  PositionSize,
  Position,
  Portfolio,
  PortfolioOptimization,
  RebalanceTrade,
  OptimizationConstraints,
  PriceSeries,
  Indicators,
  FinanceEventType,
  FinanceEvent,
  FinanceEventHandler,
  FinanceConfig,
} from './types.js';

export { DEFAULT_FINANCE_CONFIG } from './types.js';

// Core classes
export { MarketDataAggregator } from './market-data.js';
export { SignalGenerator } from './signals.js';
export { RegimeDetector } from './regime-detector.js';
export { RiskEngine } from './risk-engine.js';
export { PortfolioManager } from './portfolio.js';
export { FinanceBusWiring, wireFinanceToEventBus } from './bus-wiring.js';

// ============================================================================
// Finance Module Factory
// ============================================================================

import type { GenesisEventBus } from '../bus/event-bus.js';
import type { FinanceConfig } from './types.js';
import { DEFAULT_FINANCE_CONFIG } from './types.js';
import { MarketDataAggregator } from './market-data.js';
import { SignalGenerator } from './signals.js';
import { RegimeDetector } from './regime-detector.js';
import { RiskEngine } from './risk-engine.js';
import { PortfolioManager } from './portfolio.js';
import { wireFinanceToEventBus, FinanceBusWiring } from './bus-wiring.js';

/**
 * Complete finance module with all components wired up
 */
export interface FinanceModule {
  marketData: MarketDataAggregator;
  signalGenerator: SignalGenerator;
  regimeDetector: RegimeDetector;
  riskEngine: RiskEngine;
  portfolio: PortfolioManager;
  busWiring: FinanceBusWiring;
  config: FinanceConfig;

  // Lifecycle
  start(): void;
  stop(): void;
  clear(): void;
}

/**
 * Create a complete finance module
 */
export function createFinanceModule(
  bus: GenesisEventBus,
  config?: Partial<FinanceConfig>,
): FinanceModule {
  const finalConfig = { ...DEFAULT_FINANCE_CONFIG, ...config };

  // Initialize market data
  const marketData = new MarketDataAggregator(
    finalConfig.dataSource,
    finalConfig.updateInterval,
  );

  // Initialize simulation for configured symbols
  if (finalConfig.dataSource === 'simulation') {
    for (const symbol of finalConfig.symbols) {
      // Initialize with different characteristics per symbol
      let initialPrice = 100;
      let volatility = 0.3;
      let drift = 0.05;

      if (symbol === 'BTC') {
        initialPrice = 50000;
        volatility = 0.6;
        drift = 0.15;
      } else if (symbol === 'ETH') {
        initialPrice = 3000;
        volatility = 0.7;
        drift = 0.20;
      } else if (symbol === 'SPY') {
        initialPrice = 450;
        volatility = 0.15;
        drift = 0.08;
      }

      marketData.initSimulation(symbol, initialPrice, volatility, drift);
    }
  }

  // Initialize regime detector
  const regimeDetector = new RegimeDetector(marketData);

  // Initialize risk engine
  const riskEngine = new RiskEngine(
    marketData,
    regimeDetector,
    finalConfig.riskPerTrade,
    finalConfig.kellyFraction,
  );

  // Initialize signal generator
  const signalGenerator = new SignalGenerator(
    marketData,
    regimeDetector,
    riskEngine,
    finalConfig.minSignalStrength,
  );

  // Initialize portfolio manager
  const portfolio = new PortfolioManager(marketData, riskEngine);

  // Wire to event bus
  const busWiring = wireFinanceToEventBus(
    bus,
    marketData,
    signalGenerator,
    regimeDetector,
    riskEngine,
    portfolio,
    finalConfig,
  );

  return {
    marketData,
    signalGenerator,
    regimeDetector,
    riskEngine,
    portfolio,
    busWiring,
    config: finalConfig,

    start() {
      busWiring.startPeriodicUpdates();
    },

    stop() {
      busWiring.stopPeriodicUpdates();
    },

    clear() {
      marketData.clear();
      regimeDetector.clear();
      riskEngine.clear();
      signalGenerator.clear();
      portfolio.clear();
    },
  };
}

// ============================================================================
// Standalone Usage (without event bus)
// ============================================================================

/**
 * Create a standalone finance module without event bus integration
 * Useful for testing or standalone applications
 */
export function createStandaloneFinanceModule(
  config?: Partial<FinanceConfig>,
): Omit<FinanceModule, 'busWiring' | 'start' | 'stop'> {
  const finalConfig = { ...DEFAULT_FINANCE_CONFIG, ...config };

  const marketData = new MarketDataAggregator(
    finalConfig.dataSource,
    finalConfig.updateInterval,
  );

  if (finalConfig.dataSource === 'simulation') {
    for (const symbol of finalConfig.symbols) {
      let initialPrice = 100;
      let volatility = 0.3;
      let drift = 0.05;

      if (symbol === 'BTC') {
        initialPrice = 50000;
        volatility = 0.6;
        drift = 0.15;
      } else if (symbol === 'ETH') {
        initialPrice = 3000;
        volatility = 0.7;
        drift = 0.20;
      } else if (symbol === 'SPY') {
        initialPrice = 450;
        volatility = 0.15;
        drift = 0.08;
      }

      marketData.initSimulation(symbol, initialPrice, volatility, drift);
    }
  }

  const regimeDetector = new RegimeDetector(marketData);
  const riskEngine = new RiskEngine(
    marketData,
    regimeDetector,
    finalConfig.riskPerTrade,
    finalConfig.kellyFraction,
  );
  const signalGenerator = new SignalGenerator(
    marketData,
    regimeDetector,
    riskEngine,
    finalConfig.minSignalStrength,
  );
  const portfolio = new PortfolioManager(marketData, riskEngine);

  return {
    marketData,
    signalGenerator,
    regimeDetector,
    riskEngine,
    portfolio,
    config: finalConfig,

    clear() {
      marketData.clear();
      regimeDetector.clear();
      riskEngine.clear();
      signalGenerator.clear();
      portfolio.clear();
    },
  };
}

// ============================================================================
// Usage Example (commented)
// ============================================================================

/*

// With event bus integration:
import { GenesisEventBus } from '../bus/event-bus.js';
import { createFinanceModule } from './index.js';

const bus = new GenesisEventBus();
const finance = createFinanceModule(bus, {
  symbols: ['BTC', 'ETH', 'SPY'],
  dataSource: 'simulation',
  updateInterval: 60000, // 1 minute
});

finance.start();

// Update market data
await finance.marketData.updateMarketData('BTC');

// Generate trading signal
const signal = finance.signalGenerator.generateSignal('BTC');
console.log('Signal:', signal.direction, signal.strength);

// Detect regime
const regime = finance.regimeDetector.detectRegime('BTC');
console.log('Regime:', regime.regime, regime.confidence);

// Analyze risk
const var95 = finance.riskEngine.calculateVaR('BTC');
console.log('VaR (95%):', var95.var95);

const drawdown = finance.riskEngine.analyzeDrawdown('BTC');
console.log('Drawdown:', drawdown.currentDrawdown);

// Calculate position size
const posSize = finance.riskEngine.calculatePositionSize(
  'BTC',
  signal.strength,
  1 - signal.uncertainty,
  100000, // portfolio value
  { cortisolLevel: 0.5 },
);
console.log('Position size:', posSize.recommendedSize);

// Open position
const position = finance.portfolio.openPosition('BTC', 1, 50000);
console.log('Position opened:', position);

// Optimize portfolio
const optimization = finance.portfolio.optimizePortfolio(
  ['BTC', 'ETH', 'SPY'],
  'meanVariance',
);
console.log('Target weights:', optimization.targetWeights);

// Cleanup
finance.stop();

*/

// ============================================================================
// Invariants
// ============================================================================

/**
 * Finance Module Invariants:
 *
 * INV-FIN-001: Position sizes must not exceed configured limits
 * INV-FIN-002: Portfolio VaR must stay below risk tolerance
 * INV-FIN-003: Drawdown must trigger pain signals to nociception
 * INV-FIN-004: High cortisol must reduce position sizes
 * INV-FIN-005: Signal uncertainty must be quantified via Active Inference
 * INV-FIN-006: All trades must respect Kelly criterion constraints
 * INV-FIN-007: Market regime must be detected with > 50% confidence
 * INV-FIN-008: Portfolio weights must sum to 1.0 (±0.01)
 */
