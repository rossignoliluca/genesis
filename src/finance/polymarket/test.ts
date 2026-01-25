#!/usr/bin/env node
/**
 * Polymarket Integration Test
 *
 * Demonstrates the full trading system:
 * - Market discovery
 * - Belief formation
 * - Policy inference
 * - Trade execution
 * - Portfolio management
 */

import { createPolymarketTrader } from './index.js';

async function main() {
  console.log('='.repeat(60));
  console.log('Polymarket Trading System - Test Run');
  console.log('='.repeat(60));
  console.log();

  // Create trader with conservative settings
  const trader = createPolymarketTrader({
    simulationMode: true,
    maxPositionSize: 100,
    maxPortfolioRisk: 500,
    minRelevanceScore: 0.5,

    strategy: {
      beliefUpdateRate: 0.15,
      epistemeicWeight: 0.3,
      minEdge: 0.05,
      useNeuromodulation: true,
    },

    discoveryIntervalMs: 30000,
    monitorIntervalMs: 5000,
    tradingIntervalMs: 10000,
  });

  try {
    // Start the trader
    console.log('Starting trader...\n');
    await trader.start();

    // Wait for initial discovery and first trading cycle
    console.log('Running initial trading cycles...\n');
    await sleep(15000);

    // Show tracked markets
    console.log('\n--- Tracked Markets ---');
    const markets = trader.getTrackedMarkets();
    for (const market of markets) {
      console.log(`  ${market.id}`);
      console.log(`    Question: ${market.question}`);
      console.log(`    Category: ${market.category}`);
      console.log(`    Liquidity: $${(market.liquidity / 1000).toFixed(1)}k`);
      console.log();
    }

    // Show current beliefs
    console.log('\n--- Current Beliefs ---');
    const beliefs = trader.getBeliefs();
    for (const belief of beliefs) {
      console.log(`  ${belief.marketId}:${belief.outcome}`);
      console.log(`    Subjective P: ${belief.subjective_p.toFixed(3)}`);
      console.log(`    Market P:     ${belief.market_p.toFixed(3)}`);
      console.log(`    Edge:         ${(belief.subjective_p - belief.market_p).toFixed(3)}`);
      console.log(`    Confidence:   ${belief.confidence.toFixed(2)}`);
      console.log(`    Trend:        ${belief.trend}`);
      console.log();
    }

    // Analyze a specific market
    console.log('\n--- Market Analysis: BTC $100k ---');
    const analysis = await trader.analyzeMarket('btc-100k-2024', 'YES');
    if (analysis) {
      console.log('Belief:');
      console.log(`  Subjective: ${analysis.belief.subjective_p.toFixed(3)}`);
      console.log(`  Market:     ${analysis.belief.market_p.toFixed(3)}`);
      console.log(`  Surprise:   ${analysis.belief.surprise.toFixed(3)}`);
      console.log(`  Info Gain:  ${analysis.belief.information_gain.toFixed(3)}`);
      console.log();
      console.log('Policy:');
      console.log(`  Action:     ${analysis.policy.action.toUpperCase()}`);
      console.log(`  Target:     ${analysis.policy.targetShares} shares`);
      console.log(`  Confidence: ${analysis.policy.confidence.toFixed(2)}`);
      console.log(`  EFE:        ${analysis.policy.efe.toFixed(3)}`);
      console.log(`  Reason:     ${analysis.policy.reason}`);
      console.log();
    }

    // Wait for more trading cycles
    console.log('Running additional trading cycles...');
    await sleep(20000);

    // Show positions
    console.log('\n--- Current Positions ---');
    const positions = await trader.getPositions();
    if (positions.length === 0) {
      console.log('  No positions yet\n');
    } else {
      for (const pos of positions) {
        console.log(`  ${pos.marketId}:${pos.outcome}`);
        console.log(`    Shares:      ${pos.shares}`);
        console.log(`    Avg Price:   ${pos.averagePrice.toFixed(3)}`);
        console.log(`    Current:     ${pos.currentPrice.toFixed(3)}`);
        console.log(`    Unrealized:  $${pos.unrealizedPnL.toFixed(2)}`);
        console.log();
      }
    }

    // Show trade history
    console.log('\n--- Trade History ---');
    const trades = trader.getTradeHistory();
    if (trades.length === 0) {
      console.log('  No trades executed yet\n');
    } else {
      for (const trade of trades.slice(-10)) {
        console.log(`  ${trade.timestamp}`);
        console.log(`    ${trade.side.toUpperCase()} ${trade.size} ${trade.outcome} @ ${trade.price.toFixed(3)}`);
        console.log(`    Market: ${trade.marketId}`);
        console.log(`    Status: ${trade.status}`);
        console.log();
      }
    }

    // Show portfolio statistics
    console.log('\n--- Portfolio Statistics ---');
    const stats = await trader.getPortfolioStats();
    console.log(`  Total Value:      $${stats.totalValue.toFixed(2)}`);
    console.log(`  Total PnL:        $${stats.totalPnL.toFixed(2)}`);
    console.log(`  Win Rate:         ${(stats.winRate * 100).toFixed(1)}%`);
    console.log(`  Sharpe Ratio:     ${stats.sharpeRatio.toFixed(2)}`);
    console.log(`  Max Drawdown:     $${stats.maxDrawdown.toFixed(2)}`);
    console.log(`  Active Positions: ${stats.activePositions}`);
    console.log(`  Total Trades:     ${stats.tradesCount}`);
    console.log();

    // Show configuration
    console.log('\n--- Strategy Configuration ---');
    const config = trader.getConfig();
    console.log(`  Belief Update Rate: ${config.beliefUpdateRate}`);
    console.log(`  Epistemic Weight:   ${config.epistemeicWeight}`);
    console.log(`  Min Edge:           ${config.minEdge}`);
    console.log(`  Max Position:       $${config.maxPositionSize}`);
    console.log(`  Max Portfolio:      $${config.maxPortfolioRisk}`);
    console.log(`  Simulation Mode:    ${config.simulationMode}`);
    console.log();

    // Test market search
    console.log('\n--- Market Search: "AI" ---');
    const aiMarkets = await trader.searchMarkets(['AI', 'AGI']);
    for (const market of aiMarkets) {
      console.log(`  ${market.question}`);
    }
    console.log();

    // Run for a bit longer to accumulate some activity
    console.log('Running final trading cycles...');
    await sleep(15000);

    // Final stats
    console.log('\n--- Final Portfolio Statistics ---');
    const finalStats = await trader.getPortfolioStats();
    console.log(`  Total Value:      $${finalStats.totalValue.toFixed(2)}`);
    console.log(`  Total PnL:        $${finalStats.totalPnL.toFixed(2)}`);
    console.log(`  Win Rate:         ${(finalStats.winRate * 100).toFixed(1)}%`);
    console.log(`  Active Positions: ${finalStats.activePositions}`);
    console.log(`  Total Trades:     ${finalStats.tradesCount}`);
    console.log();

    // Close all positions
    if (finalStats.activePositions > 0) {
      console.log('Closing all positions...');
      const closeResult = await trader.closeAllPositions();
      console.log(`  Closed ${closeResult.closed} positions`);
      console.log(`  Total PnL: $${closeResult.totalPnL.toFixed(2)}`);
      console.log();
    }

  } finally {
    // Stop the trader
    console.log('Stopping trader...');
    await trader.stop();
    console.log('Done!\n');
  }

  console.log('='.repeat(60));
  console.log('Test completed successfully');
  console.log('='.repeat(60));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run if called directly
// Note: For ES module support, run with: npx tsx src/finance/polymarket/test.ts
main().catch(console.error);

export { main as testPolymarket };
