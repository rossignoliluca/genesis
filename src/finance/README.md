# Genesis Finance Module

A comprehensive financial analysis and trading system integrated with Active Inference for uncertainty quantification.

## Overview

The Finance module provides:
- **Market Data Aggregation**: Multi-source data with simulation support (geometric Brownian motion)
- **Regime Detection**: Bull/bear/neutral/crisis classification with confidence scores
- **Trading Signals**: Active Inference-based signal generation with uncertainty quantification
- **Risk Management**: VaR, drawdown tracking, Kelly criterion position sizing
- **Portfolio Optimization**: Mean-variance, risk parity, min variance, max Sharpe
- **Event Bus Integration**: Connects to Genesis neuromodulation, nociception, and consciousness

## Architecture

```
finance/
├── types.ts              # Type definitions (OHLCV, signals, positions, etc.)
├── market-data.ts        # Market data aggregator with simulation
├── regime-detector.ts    # Market regime detection (bull/bear/neutral)
├── signals.ts            # Trading signal generator (Active Inference)
├── risk-engine.ts        # Risk management (VaR, drawdown, position sizing)
├── portfolio.ts          # Portfolio state and optimization
├── bus-wiring.ts         # Event bus integration
└── index.ts              # Main exports and factory functions
```

## Key Features

### 1. Active Inference Integration

Trading signals include **epistemic uncertainty** quantified via Active Inference beliefs:

```typescript
const signal = signalGenerator.generateSignal('BTC', activeInferenceBeliefs);

console.log(signal.uncertainty);  // 0-1, epistemic uncertainty
console.log(signal.beliefs);      // Regime, trend, volatility, momentum beliefs
console.log(signal.surprise);     // Bayesian surprise (KL divergence)
```

### 2. Neuromodulation Effects

- **High cortisol** → Reduce position sizes (stress response)
- **High dopamine** → Increase exploration (seek new opportunities)
- **Low serotonin** → Cautious mode (risk aversion)

### 3. Nociception (Pain) Signals

Drawdowns trigger pain signals to the Genesis pain system:

```typescript
const drawdown = riskEngine.analyzeDrawdown('BTC');

if (drawdown.currentDrawdown > 0.05) {
  // Publishes 'pain.stimulus' event with intensity based on drawdown
  busWiring.publishDrawdownAlert('BTC');
}
```

### 4. Regime Detection

Market regimes are detected using multiple indicators:

- SMA trend (20/50/200)
- RSI momentum
- Bollinger Band volatility
- Price position in range
- Rate of change

```typescript
const regime = regimeDetector.detectRegime('BTC');

console.log(regime.regime);         // 'bull' | 'bear' | 'neutral' | 'crisis'
console.log(regime.confidence);     // 0-1
console.log(regime.trendStrength);  // 0-1
```

### 5. Risk Management

#### Value at Risk (VaR)
```typescript
const var95 = riskEngine.calculateVaR('BTC', 0.95, 1);

console.log(var95.var95);   // 95% VaR
console.log(var95.var99);   // 99% VaR
console.log(var95.cvar95);  // Conditional VaR (expected shortfall)
```

#### Position Sizing (Kelly Criterion)
```typescript
const posSize = riskEngine.calculatePositionSize(
  'BTC',
  signal.strength,      // 0-1
  signal.confidence,    // 0-1
  100000,              // Portfolio value
  {
    cortisolLevel: 0.5,  // Neuromodulation adjustment
    maxDrawdown: 0.1,    // Current portfolio drawdown
  }
);

console.log(posSize.recommendedSize);  // Fraction of portfolio (0-1)
console.log(posSize.kellyCriterion);   // Full Kelly
console.log(posSize.kellyFraction);    // Fraction applied (e.g., 0.25 = quarter Kelly)
```

### 6. Portfolio Optimization

```typescript
const optimization = portfolio.optimizePortfolio(
  ['BTC', 'ETH', 'SPY'],
  'meanVariance',  // or 'riskParity', 'minVariance', 'maxSharpe'
  {
    maxPositionSize: 0.3,   // Max 30% per position
    minPositionSize: 0.05,  // Min 5% to hold
    maxTurnover: 0.5,       // Max 50% turnover
  }
);

console.log(optimization.targetWeights);
console.log(optimization.trades);
console.log(optimization.expectedSharpe);
```

## Usage Examples

### Standalone (No Event Bus)

```typescript
import { createStandaloneFinanceModule } from './finance/index.js';

const finance = createStandaloneFinanceModule({
  symbols: ['BTC', 'ETH', 'SPY'],
  dataSource: 'simulation',
});

// Update market data
await finance.marketData.updateMarketData('BTC');

// Generate signal
const signal = finance.signalGenerator.generateSignal('BTC');
console.log('Signal:', signal.direction, signal.strength);

// Detect regime
const regime = finance.regimeDetector.detectRegime('BTC');
console.log('Regime:', regime.regime);

// Calculate risk
const var95 = finance.riskEngine.calculateVaR('BTC');
console.log('VaR:', var95.var95);
```

### With Event Bus

```typescript
import { GenesisEventBus } from '../bus/event-bus.js';
import { createFinanceModule } from './finance/index.js';

const bus = new GenesisEventBus();
const finance = createFinanceModule(bus, {
  symbols: ['BTC', 'ETH', 'SPY'],
  updateInterval: 60000,     // 1 minute
  signalInterval: 300000,    // 5 minutes
});

// Start periodic updates
finance.start();

// Events are automatically published to the bus:
// - 'finance.market.updated'
// - 'finance.signal.generated'
// - 'finance.regime.changed'
// - 'finance.drawdown.alert'
// - 'pain.stimulus' (for drawdowns)
// - 'neuromod.reward' (for profitable trades)
// - 'neuromod.punishment' (for losing trades)
```

### Open/Close Positions

```typescript
// Open position
const position = finance.portfolio.openPosition('BTC', 1, 50000);
console.log('Position:', position);

// Close position
const pnl = finance.portfolio.closePosition('BTC', 1, 55000);
console.log('Realized P&L:', pnl);

// Get portfolio state
const portfolio = finance.portfolio.getPortfolio();
console.log('Total value:', portfolio.totalValue);
console.log('Total P&L:', portfolio.totalPnL);
console.log('Sharpe ratio:', portfolio.sharpeRatio);
```

## Configuration

```typescript
const config: FinanceConfig = {
  // Market data
  dataSource: 'simulation',    // 'simulation' | 'coinbase' | 'alpaca'
  updateInterval: 60000,       // ms
  symbols: ['BTC', 'ETH', 'SPY'],

  // Signal generation
  signalInterval: 300000,      // ms
  minSignalStrength: 0.3,      // 0-1
  maxUncertainty: 0.7,         // 0-1

  // Risk management
  maxPositionSize: 0.2,        // 20% max per position
  maxDrawdown: 0.15,           // 15% max drawdown
  riskPerTrade: 0.02,          // 2% risk per trade
  kellyFraction: 0.25,         // Quarter Kelly (conservative)

  // Active Inference
  beliefUpdateRate: 0.1,       // Slow updates
  explorationRate: 0.1,        // 10% exploration
  priorStrength: 0.3,          // Moderate prior weight

  // Neuromodulation
  cortisolRiskReduction: true,     // Reduce risk with high cortisol
  dopamineExploration: true,       // Increase exploration with dopamine

  // Nociception
  drawdownPainThreshold: 0.05,     // 5% drawdown triggers pain
  painIntensityMultiplier: 10,     // Pain intensity scaling

  // Portfolio
  rebalanceInterval: 3600000,      // 1 hour
  optimizationMethod: 'meanVariance',
};
```

## Scientific Grounding

### Active Inference
- **Beliefs**: Probability distributions over market states (regime, trend, volatility)
- **Uncertainty**: Shannon entropy of beliefs
- **Surprise**: Bayesian surprise (KL divergence from prior)

### Kelly Criterion
Optimal position size for maximizing log wealth:
```
K = (p * b - q) / b
```
where:
- p = win probability
- q = loss probability (1 - p)
- b = win/loss ratio

In practice, we use **quarter Kelly** (0.25 × K) for robustness.

### Modern Portfolio Theory
- **Mean-Variance Optimization**: Markowitz efficient frontier
- **Risk Parity**: Equal risk contribution from each asset
- **Minimum Variance**: Lowest portfolio volatility
- **Maximum Sharpe**: Best risk-adjusted returns

### Regime Detection
- **Hidden Markov Model**: Market regimes as hidden states
- **Transition Probabilities**: Learned from historical data
- **Multiple Indicators**: Trend, momentum, volatility, volume

## Event Bus Integration

### Published Events
- `finance.market.updated` - Market data snapshot
- `finance.signal.generated` - Trading signal
- `finance.regime.changed` - Regime transition
- `finance.drawdown.alert` - Drawdown warning
- `finance.position.opened` - Position entry
- `finance.position.closed` - Position exit
- `finance.portfolio.rebalanced` - Portfolio optimization
- `pain.stimulus` - Pain signal for drawdowns
- `neuromod.reward` - Profitable trade
- `neuromod.punishment` - Losing trade
- `inference.surprise.high` - High Bayesian surprise

### Subscribed Events
- `neuromod.levels.changed` - Adjust risk-taking
- `inference.beliefs.updated` - Use for signal generation
- `consciousness.phi.updated` - Conservative mode if low
- `kernel.panic` - Halt trading

## Invariants

- **INV-FIN-001**: Position sizes must not exceed configured limits
- **INV-FIN-002**: Portfolio VaR must stay below risk tolerance
- **INV-FIN-003**: Drawdown must trigger pain signals to nociception
- **INV-FIN-004**: High cortisol must reduce position sizes
- **INV-FIN-005**: Signal uncertainty must be quantified via Active Inference
- **INV-FIN-006**: All trades must respect Kelly criterion constraints
- **INV-FIN-007**: Market regime must be detected with > 50% confidence
- **INV-FIN-008**: Portfolio weights must sum to 1.0 (±0.01)

## Testing

```bash
# Build
npm run build

# Run tests (when implemented)
npm test

# Development mode
npm run dev
```

## Future Enhancements

1. **Real Data Sources**
   - Coinbase API integration
   - Alpaca API for stocks
   - Binance for futures

2. **Advanced Signals**
   - Machine learning models
   - Sentiment analysis
   - On-chain metrics (for crypto)

3. **Multi-Asset Risk**
   - Correlation matrices
   - Covariance estimation
   - Copula models

4. **Execution**
   - Order routing
   - Slippage modeling
   - Transaction cost analysis

5. **Backtesting**
   - Historical simulation
   - Walk-forward optimization
   - Monte Carlo stress testing

## License

MIT - Part of the Genesis autonomous AI system
