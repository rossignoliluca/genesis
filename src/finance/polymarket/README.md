# Polymarket Integration

Autonomous prediction market trading using Active Inference and the Free Energy Principle.

## Overview

This module enables Genesis to trade on Polymarket prediction markets by:

1. **Discovering** relevant markets based on expertise and liquidity
2. **Forming beliefs** about outcome probabilities using Active Inference
3. **Comparing** beliefs with market prices to identify edges
4. **Executing** trades when Expected Free Energy is minimized
5. **Adapting** risk based on neuromodulation (cortisol/dopamine)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PolymarketTrader                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Discovery  │  │   Strategy   │  │   Executor   │     │
│  │              │  │              │  │              │     │
│  │ • Scorer     │  │ • Beliefs    │  │ • Positions  │     │
│  │ • Filters    │  │ • Policy     │  │ • Risk Mgmt  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│         │                  │                  │            │
│         └──────────────────┴──────────────────┘            │
│                          │                                 │
│                  ┌───────▼────────┐                        │
│                  │  Event Bus     │                        │
│                  │  Integration   │                        │
│                  └────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
 Neuromodulation    Economy Events    Kernel Events
```

## Scientific Grounding

### Active Inference for Trading

The strategy implements Active Inference (Friston et al., 2015):

**Expected Free Energy (EFE) = Pragmatic Value + Epistemic Value**

- **Pragmatic Value**: Expected profit from trading
- **Epistemic Value**: Information gained about market dynamics

When our subjective probability differs from the market price, we have both:
1. An **edge** (if our belief is correct, we profit)
2. **Information** (by trading, we learn if our belief was accurate)

### Kelly Criterion for Position Sizing

Position size follows Kelly Criterion:

```
f = (p * (b + 1) - 1) / b

where:
  f = fraction of capital to bet
  p = subjective probability of winning
  b = odds received (market price)
```

We use fractional Kelly (1/4) for safety and modulate by:
- **Confidence** (inverse entropy of belief)
- **Risk tolerance** (from neuromodulation - cortisol level)

### Neuromodulation Integration

Trading behavior adapts to Genesis's emotional state:

- **High Cortisol** (stress) → Reduce risk, tighten stops
- **Low Cortisol** (calm) → Normal risk tolerance
- **High Dopamine** (reward) → Increase exploration, try new markets
- **Low Dopamine** → Stick to proven strategies

## Components

### 1. PolymarketClient (`client.ts`)

Mock API client with realistic simulation:
- Market data fetching
- Price feeds (random walk with mean reversion)
- Order execution (simulated fills)
- Position tracking

**Production**: Would connect to real Polymarket API/subgraph.

### 2. Market Discovery (`markets.ts`)

**MarketScorer**: Relevance scoring based on:
- Category expertise (tech, AI, crypto, science)
- Keyword matching
- Liquidity (tradability)
- Volume (market interest)

**MarketMonitor**: Real-time tracking:
- Price history
- Volatility calculation
- Trend detection
- Momentum indicators

### 3. Active Inference Strategy (`strategy.ts`)

**BeliefSystem**: Probabilistic beliefs about outcomes
- Initial belief formation (starts from market price)
- Expertise adjustments (domain knowledge)
- Bayesian updates (new observations)
- Confidence estimation (inverse entropy)

**PolicyInference**: Action selection
- Calculate Expected Free Energy
- Kelly-based position sizing
- Risk-adjusted targets
- Neuromodulation integration

### 4. Trade Executor (`executor.ts`)

**PositionManager**: Track all positions
- Current holdings
- Average entry prices
- Unrealized PnL
- Position history

**RiskManager**: Portfolio-level controls
- Position size limits
- Portfolio risk limits
- Confidence thresholds
- Utilization tracking

**TradeExecutor**: Order execution
- Buy/sell orders
- Position closing
- Trade history
- Portfolio statistics

### 5. Event Bus Integration (`bus-wiring.ts`)

**Publishers**: Broadcast trading events
- Market discoveries
- Belief updates
- Trade executions
- Portfolio changes

**Subscribers**: React to Genesis events
- Neuromodulation → Adjust risk
- Economic events → Update budgets
- Kernel mode → Pause/resume trading

## Usage

### Basic Usage

```typescript
import { createPolymarketTrader } from './finance/polymarket';

// Create trader
const trader = createPolymarketTrader({
  simulationMode: true,
  maxPositionSize: 100,      // Max $100 per position
  maxPortfolioRisk: 500,     // Max $500 total at risk
  minRelevanceScore: 0.6,    // Only trade high-relevance markets
});

// Start trading
await trader.start();

// Check stats
const stats = await trader.getPortfolioStats();
console.log('Portfolio Value:', stats.totalValue);
console.log('Total PnL:', stats.totalPnL);
console.log('Win Rate:', stats.winRate);

// Stop trading
await trader.stop();
```

### Advanced Configuration

```typescript
const trader = createPolymarketTrader({
  simulationMode: false,      // Real trading (requires API key)
  apiKey: process.env.POLYMARKET_API_KEY,

  strategy: {
    beliefUpdateRate: 0.2,    // Fast adaptation
    epistemeicWeight: 0.5,    // Value information gain
    minEdge: 0.08,            // Require 8% edge minimum
    useNeuromodulation: true, // Adapt to emotional state
  },

  maxPositionSize: 200,
  maxPortfolioRisk: 1000,

  marketFilter: {
    categories: ['technology', 'crypto'],
    minLiquidity: 100000,
    minVolume: 500000,
  },

  discoveryIntervalMs: 30000,  // Check for new markets every 30s
  tradingIntervalMs: 15000,    // Trading cycle every 15s
});
```

### Query API

```typescript
// Get current beliefs
const beliefs = trader.getBeliefs();
for (const belief of beliefs) {
  console.log(`${belief.marketId}: ${belief.subjective_p.toFixed(2)} vs ${belief.market_p.toFixed(2)}`);
}

// Get positions
const positions = await trader.getPositions();
for (const pos of positions) {
  console.log(`${pos.marketId}: ${pos.shares} shares @ ${pos.averagePrice.toFixed(3)}`);
}

// Analyze a specific market
const analysis = await trader.analyzeMarket('btc-100k-2024', 'YES');
if (analysis) {
  console.log('Belief:', analysis.belief.subjective_p);
  console.log('Policy:', analysis.policy.action);
  console.log('Reason:', analysis.policy.reason);
}

// Search markets
const markets = await trader.searchMarkets(['AI', 'AGI']);
console.log('Found markets:', markets.length);

// Close positions
await trader.closePosition('btc-100k-2024', 'YES');
await trader.closeAllPositions();
```

## Mock Markets

In simulation mode, includes realistic mock markets:

1. **Bitcoin $100k by 2024** (crypto)
2. **AGI by 2025** (technology)
3. **Humans on Mars by 2026** (space)
4. **Climate 1.5°C target** (climate)

Prices follow random walk with mean reversion. Add more markets by editing `client.ts`.

## Performance Metrics

The system tracks comprehensive statistics:

- **Total Value**: Current portfolio value
- **Total PnL**: Realized + unrealized profit/loss
- **Win Rate**: Percentage of profitable positions
- **Sharpe Ratio**: Risk-adjusted return
- **Max Drawdown**: Largest peak-to-trough decline
- **Active Positions**: Number of open positions
- **Trades Count**: Total trades executed

## Integration Points

### With Genesis Event Bus

```typescript
// Subscribes to:
- 'neuromod.levels.changed'   → Adjust risk tolerance
- 'economy.budget.reallocated' → Update position limits
- 'kernel.mode.changed'        → Pause trading in dormant mode

// Publishes:
- 'economy.cost.recorded'      → Trading fees
- 'economy.revenue.recorded'   → Profitable trades
- 'inference.surprise.high'    → Large belief updates
```

### With Neuromodulation System

Risk tolerance dynamically adjusts:
```
riskTolerance = f(cortisol, dopamine, serotonin)

High stress (cortisol) → Lower risk
High reward (dopamine) → More exploration
High patience (serotonin) → Longer holding periods
```

## Testing

Run the integration:

```bash
npx tsx src/finance/polymarket/test.ts
```

Expected output:
- Market discovery (4 markets found)
- Belief formation (subjective vs market probabilities)
- Policy generation (buy/sell/hold decisions)
- Trade execution (simulated fills)
- Portfolio statistics (PnL, win rate, etc)

## Future Enhancements

### V2: Real Polymarket API
- Connect to Polymarket subgraph (GraphQL)
- On-chain order execution (Polygon)
- Real-time price feeds
- Wallet integration

### V3: Advanced Strategies
- Multi-outcome markets (>2 outcomes)
- Arbitrage across correlated markets
- Market-making (provide liquidity)
- Portfolio optimization (mean-variance)

### V4: ML Models
- Sentiment analysis (Twitter, news)
- Time-series forecasting (LSTM/Transformer)
- Transfer learning from historical markets
- Ensemble predictions

### V5: Social Trading
- Publish predictions to A2A protocol
- Learn from other Genesis instances
- Reputation-weighted aggregation
- Decentralized prediction pools

## References

1. **Active Inference**: Friston et al. (2015) "Active inference and learning"
2. **Kelly Criterion**: Kelly (1956) "A new interpretation of information rate"
3. **Prediction Markets**: Wolfers & Zitzewitz (2004) "Prediction markets"
4. **Free Energy Principle**: Friston (2010) "The free-energy principle: a unified brain theory?"
5. **Market Microstructure**: Hasbrouck (2007) "Empirical market microstructure"

## License

MIT License - Part of Genesis AI System
