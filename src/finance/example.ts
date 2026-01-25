/**
 * Genesis Finance Module - Usage Example
 *
 * This example demonstrates how to use the finance module standalone
 * or integrated with the Genesis event bus.
 */

import { createStandaloneFinanceModule } from './index.js';

// ============================================================================
// Example 1: Standalone Finance Module
// ============================================================================

async function standaloneExample() {
  console.log('\n=== Standalone Finance Module Example ===\n');

  // Create module
  const finance = createStandaloneFinanceModule({
    symbols: ['BTC', 'ETH', 'SPY'],
    dataSource: 'simulation',
    updateInterval: 1000,
  });

  console.log('Finance module initialized with symbols:', finance.config.symbols);

  // Update market data for BTC
  console.log('\n--- Updating Market Data ---');
  await finance.marketData.updateMarketData('BTC');
  const snapshot = finance.marketData.getSnapshot('BTC');

  if (snapshot) {
    console.log(`BTC Price: $${snapshot.price.toFixed(2)}`);
    console.log(`24h Change: ${snapshot.changePercent24h.toFixed(2)}%`);
    console.log(`Volatility: ${(snapshot.volatility * 100).toFixed(2)}%`);
  }

  // Detect market regime
  console.log('\n--- Market Regime Detection ---');
  const regime = finance.regimeDetector.detectRegime('BTC');
  console.log(`Regime: ${regime.regime}`);
  console.log(`Confidence: ${(regime.confidence * 100).toFixed(1)}%`);
  console.log(`Trend Strength: ${(regime.trendStrength * 100).toFixed(1)}%`);
  console.log(`Volatility Level: ${(regime.volatilityLevel * 100).toFixed(1)}%`);

  // Generate trading signal
  console.log('\n--- Trading Signal ---');
  const signal = finance.signalGenerator.generateSignal('BTC');
  console.log(`Direction: ${signal.direction}`);
  console.log(`Strength: ${(signal.strength * 100).toFixed(1)}%`);
  console.log(`Uncertainty: ${(signal.uncertainty * 100).toFixed(1)}%`);
  console.log(`Action: ${signal.action}`);
  console.log(`Position Size: ${(signal.positionSize * 100).toFixed(1)}%`);
  console.log(`Reasoning: ${signal.reasoning}`);

  // Calculate risk metrics
  console.log('\n--- Risk Metrics ---');
  const var95 = finance.riskEngine.calculateVaR('BTC');
  console.log(`VaR (95%): ${(var95.var95 * 100).toFixed(2)}%`);
  console.log(`VaR (99%): ${(var95.var99 * 100).toFixed(2)}%`);
  console.log(`CVaR (95%): ${(var95.cvar95 * 100).toFixed(2)}%`);

  const drawdown = finance.riskEngine.analyzeDrawdown('BTC');
  console.log(`Current Drawdown: ${(drawdown.currentDrawdown * 100).toFixed(2)}%`);
  console.log(`Max Drawdown: ${(drawdown.maxDrawdown * 100).toFixed(2)}%`);
  console.log(`Pain Level: ${(drawdown.painLevel * 100).toFixed(1)}%`);

  // Calculate position size
  console.log('\n--- Position Sizing ---');
  const posSize = finance.riskEngine.calculatePositionSize(
    'BTC',
    signal.strength,
    1 - signal.uncertainty,
    100000, // $100k portfolio
    {
      cortisolLevel: 0.5, // Normal stress level
      maxDrawdown: drawdown.currentDrawdown,
    },
  );
  console.log(`Recommended Size: ${(posSize.recommendedSize * 100).toFixed(2)}%`);
  console.log(`Kelly Criterion: ${(posSize.kellyCriterion * 100).toFixed(2)}%`);
  console.log(`Max Loss: $${posSize.maxLoss.toFixed(2)}`);
  console.log(`Reasoning: ${posSize.reasoning}`);

  // Portfolio operations
  console.log('\n--- Portfolio Operations ---');

  if (snapshot && signal.action === 'buy' && posSize.recommendedSize > 0) {
    // Open position
    const quantity = (100000 * posSize.recommendedSize) / snapshot.price;
    const position = finance.portfolio.openPosition('BTC', quantity, snapshot.price);

    console.log(`\nOpened Position:`);
    console.log(`  Symbol: ${position.symbol}`);
    console.log(`  Size: ${position.size.toFixed(4)} BTC`);
    console.log(`  Entry Price: $${position.entryPrice.toFixed(2)}`);
    console.log(`  Cost Basis: $${position.costBasis.toFixed(2)}`);
    console.log(`  Stop Loss: $${signal.stopLoss?.toFixed(2) || 'N/A'}`);
    console.log(`  Take Profit: $${signal.takeProfit?.toFixed(2) || 'N/A'}`);

    // Simulate price movement
    console.log('\n--- Simulating Price Movement ---');
    for (let i = 0; i < 5; i++) {
      await finance.marketData.updateMarketData('BTC');
      const updatedSnapshot = finance.marketData.getSnapshot('BTC');

      if (updatedSnapshot) {
        const portfolio = finance.portfolio.getPortfolio();
        const pos = finance.portfolio.getPosition('BTC');

        if (pos) {
          console.log(`\nStep ${i + 1}:`);
          console.log(`  Price: $${updatedSnapshot.price.toFixed(2)}`);
          console.log(`  Unrealized P&L: $${pos.unrealizedPnL.toFixed(2)} (${pos.unrealizedPnLPercent.toFixed(2)}%)`);
          console.log(`  Portfolio Value: $${portfolio.totalValue.toFixed(2)}`);
        }
      }

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Close position
    const updatedSnapshot = finance.marketData.getSnapshot('BTC');
    if (updatedSnapshot) {
      const realizedPnL = finance.portfolio.closePosition('BTC', undefined, updatedSnapshot.price);

      console.log(`\nClosed Position:`);
      console.log(`  Exit Price: $${updatedSnapshot.price.toFixed(2)}`);
      console.log(`  Realized P&L: $${realizedPnL.toFixed(2)}`);
      console.log(`  P&L %: ${((realizedPnL / (quantity * snapshot.price)) * 100).toFixed(2)}%`);
    }
  }

  // Portfolio optimization
  console.log('\n--- Portfolio Optimization ---');

  // Update all symbols
  for (const symbol of finance.config.symbols) {
    await finance.marketData.updateMarketData(symbol);
  }

  const optimization = finance.portfolio.optimizePortfolio(
    finance.config.symbols,
    'meanVariance',
    {
      maxPositionSize: 0.4,
      minPositionSize: 0.1,
      maxTurnover: 0.5,
    },
  );

  console.log('\nOptimization Results:');
  console.log(`Method: ${optimization.method}`);
  console.log(`Expected Return: ${(optimization.expectedReturn * 100).toFixed(2)}%`);
  console.log(`Expected Volatility: ${(optimization.expectedVolatility * 100).toFixed(2)}%`);
  console.log(`Expected Sharpe: ${optimization.expectedSharpe.toFixed(2)}`);

  console.log('\nTarget Weights:');
  for (const [symbol, weight] of optimization.targetWeights) {
    const current = optimization.currentWeights.get(symbol) || 0;
    console.log(`  ${symbol}: ${(weight * 100).toFixed(1)}% (current: ${(current * 100).toFixed(1)}%)`);
  }

  if (optimization.trades.length > 0) {
    console.log('\nRecommended Trades:');
    for (const trade of optimization.trades) {
      console.log(`  ${trade.action.toUpperCase()} ${trade.quantity.toFixed(4)} ${trade.symbol}`);
    }
  }

  // Final portfolio state
  const finalPortfolio = finance.portfolio.getPortfolio();
  console.log('\n--- Final Portfolio State ---');
  console.log(`Total Value: $${finalPortfolio.totalValue.toFixed(2)}`);
  console.log(`Cash: $${finalPortfolio.cash.toFixed(2)} (${finalPortfolio.cashPercent.toFixed(1)}%)`);
  console.log(`Positions: ${finalPortfolio.positionCount}`);
  console.log(`Total P&L: $${finalPortfolio.totalPnL.toFixed(2)} (${finalPortfolio.totalPnLPercent.toFixed(2)}%)`);
  console.log(`Sharpe Ratio: ${finalPortfolio.sharpeRatio.toFixed(2)}`);
  console.log(`Max Drawdown: ${(finalPortfolio.maxDrawdown * 100).toFixed(2)}%`);

  console.log('\n=== Example Complete ===\n');
}

// ============================================================================
// Run Example
// ============================================================================

// Run: npx tsx src/finance/example.ts
// if (import.meta.url === `file://${process.argv[1]}`) {
//   standaloneExample().catch(console.error);
// }

export { standaloneExample };
