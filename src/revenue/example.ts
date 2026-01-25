/**
 * Genesis Revenue Module - Example Usage
 *
 * Demonstrates how to use the revenue system in standalone mode.
 * Run with: npx tsx src/revenue/example.ts
 */

import { createRevenueSystem } from './index.js';

// ============================================================================
// Example 1: Basic Autonomous Operation
// ============================================================================

async function example1() {
  console.log('\n=== Example 1: Autonomous Revenue Generation ===\n');

  const revenue = createRevenueSystem({
    maxConcurrentTasks: 2,
    maxDailyBudget: 50,
    minRoi: 0.5,
  });

  // Enable specific streams
  revenue.enableStream('mcp-services');
  revenue.enableStream('yield');

  console.log('Starting revenue system...');
  revenue.start();

  // Let it run for 10 seconds
  await sleep(10000);

  // Check metrics
  const metrics = revenue.getMetrics();
  console.log('\nMetrics after 10 seconds:');
  console.log(`  Total Revenue: $${metrics.totalRevenue.toFixed(2)}`);
  console.log(`  Total Cost: $${metrics.totalCost.toFixed(2)}`);
  console.log(`  Net Revenue: $${metrics.netRevenue.toFixed(2)}`);
  console.log(`  ROI: ${(metrics.roi * 100).toFixed(1)}%`);
  console.log(`  Active Streams: ${metrics.activeStreams}`);

  revenue.stop();
}

// ============================================================================
// Example 2: Manual Opportunity Selection
// ============================================================================

async function example2() {
  console.log('\n=== Example 2: Manual Opportunity Execution ===\n');

  const revenue = createRevenueSystem();

  // Enable all streams
  revenue.enableStream('bounty-hunter');
  revenue.enableStream('mcp-services');
  revenue.enableStream('keeper');
  revenue.enableStream('content');
  revenue.enableStream('yield');

  // Start streams (but not autonomous execution)
  revenue.getAllStreams().forEach(s => {
    if (s.enabled) {
      console.log(`Stream ${s.name}: ${s.status}`);
    }
  });

  // Wait a bit for opportunities to generate
  await sleep(2000);

  // Get all opportunities
  const opportunities = revenue.getAllOpportunities();
  console.log(`\nFound ${opportunities.length} opportunities:`);

  for (const opp of opportunities.slice(0, 5)) {
    console.log(`  - ${opp.type} (${opp.source})`);
    console.log(`    Revenue: $${opp.estimatedRevenue.toFixed(2)}`);
    console.log(`    ROI: ${(opp.estimatedRoi * 100).toFixed(1)}%`);
    console.log(`    Risk: ${(opp.risk * 100).toFixed(0)}%`);
  }

  // Select and execute best opportunity
  const best = revenue.selectBestOpportunity();
  if (best) {
    console.log(`\nExecuting best opportunity: ${best.type}`);
    const result = await revenue.executeOpportunity(best);

    if (result.success) {
      console.log(`  ✓ Success!`);
      console.log(`  Revenue: $${result.actualRevenue.toFixed(2)}`);
      console.log(`  Cost: $${result.actualCost.toFixed(2)}`);
      console.log(`  Net: $${(result.actualRevenue - result.actualCost).toFixed(2)}`);
      console.log(`  Duration: ${result.duration}ms`);
    } else {
      console.log(`  ✗ Failed: ${result.error}`);
      console.log(`  Cost: $${result.actualCost.toFixed(2)}`);
    }
  }

  revenue.stop();
}

// ============================================================================
// Example 3: Stream Performance Comparison
// ============================================================================

async function example3() {
  console.log('\n=== Example 3: Stream Performance Comparison ===\n');

  const revenue = createRevenueSystem({
    maxConcurrentTasks: 5,
    maxDailyBudget: 200,
  });

  // Enable all streams
  revenue.enableStream('bounty-hunter');
  revenue.enableStream('mcp-services');
  revenue.enableStream('keeper');
  revenue.enableStream('content');
  revenue.enableStream('yield');

  console.log('Running all streams for 15 seconds...\n');
  revenue.start();

  await sleep(15000);

  revenue.stop();

  // Compare performance
  const streams = revenue.getAllStreams();
  console.log('Stream Performance:');
  console.log('─'.repeat(80));
  console.log(
    'Stream'.padEnd(25) +
    'Revenue'.padEnd(12) +
    'Cost'.padEnd(12) +
    'ROI'.padEnd(10) +
    'Success%'
  );
  console.log('─'.repeat(80));

  for (const stream of streams) {
    if (stream.enabled) {
      const revenue = stream.totalEarned;
      const cost = stream.totalCost;
      const roi = stream.roi;
      const success = stream.successRate;

      console.log(
        stream.name.padEnd(25) +
        `$${revenue.toFixed(2)}`.padEnd(12) +
        `$${cost.toFixed(2)}`.padEnd(12) +
        `${(roi * 100).toFixed(1)}%`.padEnd(10) +
        `${(success * 100).toFixed(1)}%`
      );
    }
  }
  console.log('─'.repeat(80));

  const metrics = revenue.getMetrics();
  console.log(
    '\nTotal'.padEnd(25) +
    `$${metrics.totalRevenue.toFixed(2)}`.padEnd(12) +
    `$${metrics.totalCost.toFixed(2)}`.padEnd(12) +
    `${(metrics.roi * 100).toFixed(1)}%`
  );
}

// ============================================================================
// Example 4: Dynamic Priority Adjustment
// ============================================================================

async function example4() {
  console.log('\n=== Example 4: Dynamic Priority Adjustment ===\n');

  const revenue = createRevenueSystem();

  // Enable streams with different priorities
  revenue.enableStream('bounty-hunter');
  revenue.setStreamPriority('bounty-hunter', 3, 'initial-low');

  revenue.enableStream('mcp-services');
  revenue.setStreamPriority('mcp-services', 8, 'initial-high');

  revenue.enableStream('yield');
  revenue.setStreamPriority('yield', 5, 'initial-medium');

  console.log('Initial priorities:');
  console.log('  Bounty Hunter: 3/10');
  console.log('  MCP Services: 8/10');
  console.log('  Yield: 5/10');

  revenue.start();
  await sleep(5000);

  console.log('\nAdjusting priorities...');
  revenue.setStreamPriority('bounty-hunter', 9, 'user-boost');
  revenue.setStreamPriority('mcp-services', 4, 'user-reduce');

  console.log('  Bounty Hunter: 9/10 (boosted)');
  console.log('  MCP Services: 4/10 (reduced)');

  await sleep(5000);

  const metrics = revenue.getMetrics();
  console.log('\nFinal metrics:');
  console.log(`  Total Revenue: $${metrics.totalRevenue.toFixed(2)}`);
  console.log(`  ROI: ${(metrics.roi * 100).toFixed(1)}%`);

  revenue.stop();
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('Genesis Revenue Module - Examples');
  console.log('==================================');

  try {
    await example1();
    await sleep(1000);

    await example2();
    await sleep(1000);

    await example3();
    await sleep(1000);

    await example4();

    console.log('\n✓ All examples completed!\n');
  } catch (error) {
    console.error('Error:', error);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run: npx tsx src/revenue/example.ts
// if (import.meta.url === `file://${process.argv[1]}`) {
//   main().catch(console.error);
// }
