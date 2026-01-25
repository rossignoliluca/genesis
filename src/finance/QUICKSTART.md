# Genesis Finance Module - Quick Start Guide

## Installation

The finance module is already part of the Genesis codebase. No additional installation needed.

## Basic Usage (5 minutes)

### 1. Import the Module

```typescript
import { createStandaloneFinanceModule } from './src/finance/index.js';
```

### 2. Create Finance Instance

```typescript
const finance = createStandaloneFinanceModule({
  symbols: ['BTC', 'ETH', 'SPY'],
  dataSource: 'simulation',
});
```

### 3. Update Market Data

```typescript
await finance.marketData.updateMarketData('BTC');

const snapshot = finance.marketData.getSnapshot('BTC');
console.log(`BTC: $${snapshot.price.toFixed(2)}`);
```

### 4. Generate Trading Signal

```typescript
const signal = finance.signalGenerator.generateSignal('BTC');

console.log(`Signal: ${signal.direction}`);
console.log(`Strength: ${(signal.strength * 100).toFixed(0)}%`);
console.log(`Action: ${signal.action}`);
```

### 5. Open a Position

```typescript
const position = finance.portfolio.openPosition('BTC', 1, 50000);
console.log(`Opened: ${position.size} BTC @ $${position.entryPrice}`);
```

## Run the Example

```bash
npx tsx src/finance/example.ts
```

This will run through a complete trading simulation showing:
- Market data updates
- Regime detection
- Signal generation
- Risk calculation
- Position management
- Portfolio optimization

## Integration with Genesis Event Bus

```typescript
import { GenesisEventBus } from './src/bus/event-bus.js';
import { createFinanceModule } from './src/finance/index.js';

const bus = new GenesisEventBus();
const finance = createFinanceModule(bus, {
  symbols: ['BTC', 'ETH'],
});

// Start periodic updates
finance.start();

// Finance module now:
// - Updates market data every 60 seconds
// - Generates signals every 5 minutes
// - Publishes events to the bus
// - Responds to neuromodulation/consciousness events
```

## Run Integration Test

```bash
npx tsx src/finance/integration-test.ts
```

This tests:
- Event bus integration
- Neuromodulation effects (cortisol → risk reduction)
- Nociception signals (drawdown → pain)
- Active Inference integration
- Consciousness integration

## Key Concepts

### Market Regimes

```typescript
const regime = finance.regimeDetector.detectRegime('BTC');
// regime.regime: 'bull' | 'bear' | 'neutral' | 'crisis'
// regime.confidence: 0-1
```

### Risk Metrics

```typescript
// Value at Risk
const var95 = finance.riskEngine.calculateVaR('BTC');
console.log(`95% VaR: ${(var95.var95 * 100).toFixed(2)}%`);

// Drawdown
const drawdown = finance.riskEngine.analyzeDrawdown('BTC');
console.log(`Drawdown: ${(drawdown.currentDrawdown * 100).toFixed(2)}%`);

// Position sizing
const posSize = finance.riskEngine.calculatePositionSize(
  'BTC',
  0.7,    // Signal strength
  0.8,    // Confidence
  100000, // Portfolio value
);
console.log(`Size: ${(posSize.recommendedSize * 100).toFixed(2)}%`);
```

### Portfolio Optimization

```typescript
const optimization = finance.portfolio.optimizePortfolio(
  ['BTC', 'ETH', 'SPY'],
  'meanVariance',
);

console.log('Target weights:', optimization.targetWeights);
console.log('Expected Sharpe:', optimization.expectedSharpe);
```

## Configuration

```typescript
const finance = createStandaloneFinanceModule({
  // Symbols to trade
  symbols: ['BTC', 'ETH', 'SPY'],

  // Data source ('simulation' or real APIs when implemented)
  dataSource: 'simulation',

  // Update frequency
  updateInterval: 60000,    // 1 minute
  signalInterval: 300000,   // 5 minutes

  // Risk parameters
  maxPositionSize: 0.2,     // Max 20% per position
  riskPerTrade: 0.02,       // 2% risk per trade
  kellyFraction: 0.25,      // Quarter Kelly (conservative)

  // Integration settings
  cortisolRiskReduction: true,   // High cortisol → reduce risk
  dopamineExploration: true,     // High dopamine → explore
  drawdownPainThreshold: 0.05,   // 5% drawdown triggers pain
});
```

## Common Patterns

### Trading Loop

```typescript
// Update market data
await finance.marketData.updateMarketData('BTC');

// Detect regime
const regime = finance.regimeDetector.detectRegime('BTC');

// Generate signal
const signal = finance.signalGenerator.generateSignal('BTC');

// Check risk
const drawdown = finance.riskEngine.analyzeDrawdown('BTC');
const posSize = finance.riskEngine.calculatePositionSize(
  'BTC',
  signal.strength,
  1 - signal.uncertainty,
  100000,
);

// Execute trade
if (signal.action === 'buy' && posSize.recommendedSize > 0) {
  const position = finance.portfolio.openPosition(
    'BTC',
    posSize.recommendedSize * 100000 / snapshot.price,
    snapshot.price,
  );
}
```

### Monitor Drawdown

```typescript
const drawdown = finance.riskEngine.analyzeDrawdown('BTC');

if (drawdown.currentDrawdown > 0.1) {
  console.log('⚠️ High drawdown detected!');
  console.log(`Pain level: ${(drawdown.painLevel * 100).toFixed(0)}%`);

  // Take action: reduce positions, stop trading, etc.
}
```

### Rebalance Portfolio

```typescript
const optimization = finance.portfolio.optimizePortfolio(
  finance.config.symbols,
  'riskParity',  // Equal risk contribution
);

// Execute rebalancing trades
for (const trade of optimization.trades) {
  if (trade.action === 'buy') {
    finance.portfolio.openPosition(trade.symbol, trade.quantity);
  } else {
    finance.portfolio.closePosition(trade.symbol, trade.quantity);
  }
}
```

## Next Steps

1. **Read the full README**: `src/finance/README.md`
2. **Review types**: `src/finance/types.ts`
3. **Check examples**: `src/finance/example.ts`
4. **Run integration test**: `src/finance/integration-test.ts`
5. **Explore the code**: All modules are in `src/finance/`

## Troubleshooting

### "No price data available"

Make sure to update market data before using other functions:
```typescript
await finance.marketData.updateMarketData('BTC');
```

### "Insufficient cash"

Check portfolio cash before opening positions:
```typescript
const portfolio = finance.portfolio.getPortfolio();
console.log('Available cash:', portfolio.cash);
```

### Position sizing returns 0

This usually means:
- Signal strength is too low (< minSignalStrength)
- Uncertainty is too high (> maxUncertainty)
- Action is 'hold'

Check the signal:
```typescript
const signal = finance.signalGenerator.generateSignal('BTC');
console.log('Action:', signal.action);
console.log('Strength:', signal.strength);
console.log('Uncertainty:', signal.uncertainty);
```

## Support

For issues or questions:
1. Check the documentation: `src/finance/README.md`
2. Review the implementation summary: `src/finance/SUMMARY.md`
3. Open an issue on GitHub

## License

MIT - Part of the Genesis autonomous AI system
