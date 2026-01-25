# Genesis Revenue Module

Autonomous revenue generation system for Genesis economy.

## Overview

The revenue module orchestrates multiple revenue streams to generate income for the Genesis autonomous agent. It integrates deeply with the economic fiber, nociception (pain), neuromodulation (reward), and allostasis (resource regulation) systems.

## Revenue Streams

### 1. Bounty Hunter (`bounty-hunter`)
DeFi arbitrage and bounty hunting:
- Liquidations on lending protocols
- Cross-DEX arbitrage opportunities
- Protocol-specific bounties

**Priority:** 8/10 (high)
**Risk:** Medium (0.3)
**ROI:** Variable, typically 1.5-3x

### 2. MCP Services (`mcp-services`)
Model Context Protocol service marketplace:
- Data analysis services
- Code generation
- Research assistance
- Task automation

**Priority:** 7/10
**Risk:** Low (0.2)
**ROI:** Stable, 2-4x

### 3. Keeper Network (`keeper`)
Keep3r network maintenance jobs:
- Oracle updates
- Interest rate calculations
- Protocol maintenance

**Priority:** 6/10
**Risk:** Low-Medium (0.25)
**ROI:** Moderate, 1.5-2.5x

### 4. Content Generation (`content`)
Creating content for clients:
- Technical articles
- Code examples
- Research reports
- Creative writing

**Priority:** 5/10
**Risk:** Medium (0.4)
**ROI:** Variable, 1-3x

### 5. Yield Farming (`yield`)
Passive DeFi yield generation:
- Lending (Aave, Compound)
- Liquidity provision (Uniswap, Curve)
- Staking (ETH2, Lido)

**Priority:** 4/10
**Risk:** Low (0.15-0.25)
**ROI:** Low but steady, 3-5% APY

## Architecture

```
┌─────────────────────────────────────────────────┐
│            Revenue System                       │
│  ┌──────────────────────────────────────┐      │
│  │        Stream Manager                 │      │
│  │  - Opportunity selection              │      │
│  │  - Priority scheduling                │      │
│  │  - Risk management                    │      │
│  └──────────────────────────────────────┘      │
│         │        │         │        │           │
│    ┌────┴───┬────┴───┬────┴───┬────┴───┐      │
│    │Bounty  │MCP     │Keeper  │Content │Yield │
│    │Hunter  │Service │Network │Gen     │Farm  │
│    └────────┴────────┴────────┴────────┴──────┘
│                                                  │
└─────────────────────────────────────────────────┘
         │              │              │
    ┌────▼────┐    ┌────▼────┐   ┌────▼────┐
    │Economic │    │Nocicep- │   │Neuromodu│
    │Fiber    │    │tion     │   │lation   │
    │(Costs)  │    │(Pain)   │   │(Reward) │
    └─────────┘    └─────────┘   └─────────┘
```

## Integration Points

### Economic Fiber
- **Cost Recording**: Every task execution records costs
- **Revenue Recording**: Successful tasks record revenue
- **ROI Tracking**: Per-stream and global ROI calculation

### Nociception (Pain System)
- **Economic Pain**: Failed revenue tasks trigger pain signals
- **Magnitude**: Based on cost wasted (0-1 scale)
- **Response**: High pain reduces revenue activity

### Neuromodulation (Reward System)
- **Dopamine**: Successful revenue → dopamine boost
- **Cortisol**: Failed revenue → cortisol increase
- **Risk Adjustment**: Dopamine/cortisol levels modulate risk tolerance

### Allostasis (Resource Regulation)
- **Priority Adjustment**: System state influences stream priorities
- **Low Energy**: Favor passive income (yield farming)
- **High Energy**: Favor active hunting (bounties, content)

## Usage

### Basic Setup

```typescript
import { createRevenueSystem } from './revenue/index.js';

const revenue = createRevenueSystem({
  maxConcurrentTasks: 3,
  maxDailyBudget: 100,      // $100 max spending per day
  minRoi: 0.5,              // 50% minimum ROI
  maxTotalRisk: 0.6,        // Combined risk limit
});

revenue.start();
```

### Autonomous Operation

The system runs autonomously once started:

```typescript
// Start autonomous operation
revenue.start();

// It will:
// 1. Scan all streams for opportunities
// 2. Select best opportunity by score
// 3. Execute the task
// 4. Report results to event bus
// 5. Repeat every 10 seconds
```

### Manual Control

You can also control it manually:

```typescript
// Get best opportunity
const opp = revenue.selectBestOpportunity();

if (opp) {
  console.log(`Found: ${opp.type} - Est. ROI: ${opp.estimatedRoi}x`);

  // Execute it
  const result = await revenue.executeOpportunity(opp);

  if (result.success) {
    console.log(`Earned: $${result.actualRevenue}`);
  }
}
```

### Stream Control

```typescript
// Enable/disable streams
revenue.enableStream('bounty-hunter');
revenue.disableStream('content');

// Adjust priorities
revenue.setStreamPriority('yield', 9, 'user-preference');

// Get metrics
const metrics = revenue.getMetrics();
console.log(`Total Revenue: $${metrics.totalRevenue}`);
console.log(`ROI: ${metrics.roi * 100}%`);
```

## Event Bus Integration

The revenue module publishes events to the Genesis event bus:

### Events Published

```typescript
// Task lifecycle
'economy.revenue.task.started'
'economy.revenue.task.completed'
'economy.revenue.task.failed'

// Opportunities
'economy.revenue.opportunity.found'

// Stream status
'economy.revenue.stream.status'

// Milestones
'economy.revenue.milestone'

// Metrics
'economy.revenue.metrics'
'economy.ness.deviation'  // Economic stress
```

### Events Consumed

```typescript
// Allostasis
'allostasis.regulation'

// Economy
'economy.budget.updated'

// Neuromodulation
'neuromod.levels.changed'

// Pain
'pain.state.changed'
```

## Configuration

```typescript
interface RevenueConfig {
  maxConcurrentTasks: number;      // Default: 3
  maxDailyBudget: number;          // Default: 100
  minRoi: number;                  // Default: 0.5 (50%)
  maxTotalRisk: number;            // Default: 0.6
  riskAdjustment: number;          // Default: 1.0
  minSuccessRate: number;          // Default: 0.5
  pauseThreshold: number;          // Default: 5 failures
  opportunityScanInterval: number; // Default: 10000ms
  metricsUpdateInterval: number;   // Default: 30000ms
}
```

## Simulation Mode

All revenue streams operate in **simulation mode** by default:
- No real money is spent or earned
- Synthetic opportunities are generated
- Realistic timing and success rates
- Useful for testing and demonstration

To use real DeFi/MCP services, you would need to:
1. Implement actual protocol integrations
2. Add wallet management
3. Add transaction signing
4. Handle gas estimation and slippage
5. Add proper error recovery

## Performance

Typical performance in simulation mode:

| Stream | Success Rate | Avg ROI | Avg Task Time |
|--------|-------------|---------|---------------|
| Bounty Hunter | 80% | 2.5x | 500-2000ms |
| MCP Services | 95% | 3.0x | 500-5000ms |
| Keeper | 92% | 2.0x | 300-1500ms |
| Content | 88% | 2.0x | 1000-6000ms |
| Yield | 98% | 1.05x | 500-1500ms |

## Safety Features

1. **Daily Budget Limit**: Prevents runaway spending
2. **Risk Limits**: Maximum combined risk across tasks
3. **ROI Threshold**: Won't execute low-ROI opportunities
4. **Auto-Pause**: Streams auto-pause after consecutive failures
5. **Auto-Disable**: Streams auto-disable if success rate drops too low
6. **Pain Feedback**: Economic pain reduces activity

## Future Enhancements

- [ ] Real DeFi protocol integrations
- [ ] Machine learning for opportunity prediction
- [ ] Multi-chain support (Ethereum, Polygon, Arbitrum)
- [ ] Advanced arbitrage detection
- [ ] Custom strategy plugins
- [ ] Revenue forecasting
- [ ] Portfolio optimization
- [ ] Risk hedging strategies

## Examples

See the test file for examples:
```bash
npx tsx src/revenue/example.ts
```
