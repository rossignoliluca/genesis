# Polymarket Integration - Quick Start Guide

## Installation

No additional dependencies needed - uses existing Genesis infrastructure.

## 5-Minute Quick Start

### 1. Basic Usage

```typescript
import { createPolymarketTrader } from './src/finance/polymarket';

// Create trader
const trader = createPolymarketTrader({
  simulationMode: true,
  maxPositionSize: 100,
  maxPortfolioRisk: 500,
});

// Start
await trader.start();

// Check stats
const stats = await trader.getPortfolioStats();
console.log('Total PnL:', stats.totalPnL);

// Stop
await trader.stop();
```

### 2. Run Test

```bash
npx tsx src/finance/polymarket/test.ts
```

You'll see:
- 4 markets discovered
- Beliefs formed (probabilities)
- Policies generated (buy/sell/hold)
- Trades executed
- Portfolio stats

### 3. Check a Specific Market

```typescript
// Analyze Bitcoin market
const analysis = await trader.analyzeMarket('btc-100k-2024', 'YES');

console.log('Our belief:', analysis.belief.subjective_p);
console.log('Market price:', analysis.belief.market_p);
console.log('Edge:', analysis.belief.subjective_p - analysis.belief.market_p);
console.log('Action:', analysis.policy.action);
console.log('Reason:', analysis.policy.reason);
```

### 4. Monitor Positions

```typescript
const positions = await trader.getPositions();

for (const pos of positions) {
  console.log(`${pos.marketId}: ${pos.shares} shares`);
  console.log(`  Avg Price: ${pos.averagePrice}`);
  console.log(`  Current: ${pos.currentPrice}`);
  console.log(`  PnL: $${pos.unrealizedPnL}`);
}
```

## Configuration

### Conservative (Low Risk)

```typescript
const trader = createPolymarketTrader({
  maxPositionSize: 50,
  maxPortfolioRisk: 200,
  minRelevanceScore: 0.7,  // Only highly relevant markets

  strategy: {
    minEdge: 0.10,         // Require 10% edge
    beliefUpdateRate: 0.05, // Slow updates
    epistemeicWeight: 0.1,  // Focus on profit, not info
  },
});
```

### Aggressive (High Risk, High Info)

```typescript
const trader = createPolymarketTrader({
  maxPositionSize: 200,
  maxPortfolioRisk: 1000,
  minRelevanceScore: 0.3,

  strategy: {
    minEdge: 0.03,          // Lower threshold
    beliefUpdateRate: 0.2,  // Fast adaptation
    epistemeicWeight: 0.5,  // Value information gain
  },
});
```

### Neuromodulation Enabled

```typescript
const trader = createPolymarketTrader({
  strategy: {
    useNeuromodulation: true,  // Adapt to emotional state
  },
});

// Risk will auto-adjust based on:
// - Cortisol (stress) → Lower risk
// - Dopamine (reward) → More exploration
// - Kernel mode (dormant) → Pause trading
```

## Common Queries

### Get All Beliefs

```typescript
const beliefs = trader.getBeliefs();

for (const b of beliefs) {
  console.log(`${b.marketId}:${b.outcome}`);
  console.log(`  Belief: ${b.subjective_p.toFixed(3)}`);
  console.log(`  Market: ${b.market_p.toFixed(3)}`);
  console.log(`  Edge: ${(b.subjective_p - b.market_p).toFixed(3)}`);
}
```

### Search Markets

```typescript
// Search for AI-related markets
const markets = await trader.searchMarkets(['AI', 'AGI', 'LLM']);

for (const m of markets) {
  console.log(m.question);
  console.log(`  Liquidity: $${m.liquidity}`);
  console.log(`  Category: ${m.category}`);
}
```

### Close Positions

```typescript
// Close a specific position
await trader.closePosition('btc-100k-2024', 'YES');

// Close all positions
const result = await trader.closeAllPositions();
console.log(`Closed ${result.closed} positions`);
console.log(`Total PnL: $${result.totalPnL}`);
```

### Update Configuration

```typescript
// Change strategy mid-flight
trader.updateConfig({
  minEdge: 0.08,           // Stricter edge requirement
  beliefUpdateRate: 0.15,  // Faster updates
});
```

## Understanding the Output

### Belief

```
Subjective P: 0.450  ← Our estimate of true probability
Market P:     0.350  ← Current market price (crowd)
Edge:         0.100  ← Difference (opportunity!)
Confidence:   0.75   ← How certain we are (0-1)
```

- **Edge > minEdge** → Consider trading
- **Confidence > 0.5** → High certainty
- **Surprise > 0.1** → Big update, something changed

### Policy

```
Action:     BUY
Target:     25 shares
Confidence: 0.75
EFE:        -1.234
Reason:     Underpriced: edge=0.100, confidence=0.75
```

- **BUY** → Market underpricing outcome
- **SELL** → Market overpricing outcome
- **HOLD** → No edge or low confidence

### Portfolio Stats

```
Total Value:      $125.50
Total PnL:        $25.50
Win Rate:         66.7%
Active Positions: 3
Total Trades:     12
```

- **Win Rate > 50%** → Profitable strategy
- **PnL > 0** → Making money
- **Sharpe Ratio > 1** → Good risk-adjusted return

## Tips

### 1. Start Conservative

Begin with small position sizes and strict edge requirements:

```typescript
maxPositionSize: 50,
minEdge: 0.08,
```

### 2. Monitor for a While

Let it run for 30-60 minutes to gather data before judging performance.

### 3. Check Beliefs vs Market

Large edges (>0.1) are rare. If you see many, either:
- Your belief model is wrong
- Market is inefficient (opportunity!)
- Mock simulation is unrealistic

### 4. Use Neuromodulation

Enable it to automatically reduce risk during stressful periods:

```typescript
useNeuromodulation: true
```

### 5. Track Metrics

```typescript
setInterval(async () => {
  const stats = await trader.getPortfolioStats();

  if (stats.totalPnL < -100) {
    console.warn('Large drawdown! Consider stopping.');
    await trader.stop();
  }
}, 60000);
```

## Troubleshooting

### No trades executed?

Check:
1. `minEdge` - might be too high
2. Beliefs - are they forming correctly?
3. Risk limits - enough headroom?

```typescript
const beliefs = trader.getBeliefs();
console.log('Beliefs formed:', beliefs.length);

const risk = trader.executor.getRiskManager().getRiskMetrics();
console.log('Headroom:', risk.headroom);
```

### Too many trades?

Increase friction:
```typescript
minEdge: 0.08,           // Higher bar
beliefUpdateRate: 0.05,  // Slower updates
```

### Low win rate?

Your beliefs might be miscalibrated. In simulation:
- Expertise adjustments are simplified
- Real production would use ML models
- Consider this a starting point

## Next Steps

1. **Run Extended Simulation**
   ```bash
   # Let it run for 24 hours
   npx tsx src/finance/polymarket/test.ts &
   ```

2. **Integrate with Genesis**
   - Wire to neuromodulation system
   - Subscribe to economy events
   - Track performance in memory

3. **Tune Parameters**
   - Optimize minEdge, beliefUpdateRate
   - A/B test different strategies
   - Use Bayesian optimization

4. **Add Real Data**
   - Connect to Polymarket API
   - Use sentiment analysis
   - Train ML prediction models

## Support

- Documentation: `README.md`
- Technical details: `SUMMARY.md`
- Implementation: `IMPLEMENTATION_COMPLETE.md`
- Code: Browse `*.ts` files with JSDoc

---

**Happy Trading! 📈**
