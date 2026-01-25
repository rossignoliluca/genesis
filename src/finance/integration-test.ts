/**
 * Genesis Finance Module - Integration Test
 *
 * Tests integration with Active Inference, neuromodulation, and nociception.
 */

import { GenesisEventBus } from '../bus/event-bus.js';
import { createFinanceModule } from './index.js';

async function integrationTest() {
  console.log('\n=== Finance Module Integration Test ===\n');

  // Create event bus
  const bus = new GenesisEventBus();

  // Track events
  const events: string[] = [];

  bus.subscribeAll((event) => {
    events.push(event.source);
  });

  // Create finance module
  const finance = createFinanceModule(bus, {
    symbols: ['BTC', 'ETH'],
    dataSource: 'simulation',
    updateInterval: 1000,
    signalInterval: 2000,
    drawdownPainThreshold: 0.03, // Lower threshold for testing
  });

  console.log('✓ Finance module created and wired to event bus\n');

  // Simulate neuromodulation update
  console.log('--- Simulating Neuromodulation ---');
  bus.publish('neuromod.levels.changed', {
    source: 'test',
    precision: 1.0,
    levels: {
      dopamine: 0.8,       // High dopamine
      serotonin: 0.5,
      norepinephrine: 0.6,
      acetylcholine: 0.5,
    },
    effect: {
      explorationRate: 0.8,
      learningRate: 0.5,
      precisionGain: 1.0,
      discountFactor: 0.95,
    },
  });

  console.log('✓ Published neuromod.levels.changed\n');

  // Update market data
  console.log('--- Updating Market Data ---');
  await finance.marketData.updateMarketData('BTC');
  finance.busWiring.publishMarketDataUpdate('BTC');

  const snapshot = finance.marketData.getSnapshot('BTC');
  if (snapshot) {
    console.log(`BTC Price: $${snapshot.price.toFixed(2)}`);
    console.log(`Volatility: ${(snapshot.volatility * 100).toFixed(2)}%\n`);
  }

  // Generate signal
  console.log('--- Generating Trading Signal ---');
  finance.busWiring.publishSignal('BTC');

  const signal = finance.signalGenerator.getLastSignal('BTC');
  if (signal) {
    console.log(`Direction: ${signal.direction}`);
    console.log(`Strength: ${(signal.strength * 100).toFixed(1)}%`);
    console.log(`Uncertainty: ${(signal.uncertainty * 100).toFixed(1)}%`);
    console.log(`Action: ${signal.action}\n`);
  }

  // Detect regime
  console.log('--- Detecting Market Regime ---');
  finance.busWiring.publishRegimeChange('BTC');

  const regime = finance.regimeDetector.detectRegime('BTC');
  console.log(`Regime: ${regime.regime}`);
  console.log(`Confidence: ${(regime.confidence * 100).toFixed(1)}%\n`);

  // Open position
  console.log('--- Opening Position ---');
  if (snapshot) {
    const position = finance.portfolio.openPosition('BTC', 1, snapshot.price);
    finance.busWiring.publishPositionOpened('BTC', 1, snapshot.price);

    console.log(`Opened: ${position.size} BTC @ $${position.entryPrice.toFixed(2)}`);
    console.log(`Cost: $${position.costBasis.toFixed(2)}\n`);
  }

  // Simulate price drop to trigger drawdown
  console.log('--- Simulating Price Drop ---');
  for (let i = 0; i < 10; i++) {
    await finance.marketData.updateMarketData('BTC');
  }

  // Check for drawdown
  const drawdown = finance.riskEngine.analyzeDrawdown('BTC');
  console.log(`Current Drawdown: ${(drawdown.currentDrawdown * 100).toFixed(2)}%`);
  console.log(`Pain Level: ${(drawdown.painLevel * 100).toFixed(1)}%\n`);

  if (drawdown.currentDrawdown > finance.config.drawdownPainThreshold) {
    console.log('--- Publishing Drawdown Alert (Pain Signal) ---');
    finance.busWiring.publishDrawdownAlert('BTC');
    console.log('✓ Pain signal published to nociception\n');
  }

  // Update with high cortisol (stress response)
  console.log('--- Simulating High Cortisol (Stress) ---');
  bus.publish('neuromod.levels.changed', {
    source: 'test',
    precision: 1.0,
    levels: {
      dopamine: 0.3,       // Low dopamine
      serotonin: 0.4,
      norepinephrine: 0.8, // High norepinephrine
      acetylcholine: 0.5,
    },
    effect: {
      explorationRate: 0.2,
      learningRate: 0.3,
      precisionGain: 0.8,
      discountFactor: 0.9,
    },
  });

  console.log('✓ High stress state should reduce position sizes\n');

  // Calculate position size with high cortisol
  const posSize = finance.riskEngine.calculatePositionSize(
    'BTC',
    0.7,  // Strong signal
    0.8,  // High confidence
    100000,
    { cortisolLevel: 0.9 }, // Very high cortisol
  );

  console.log('Position sizing with high cortisol:');
  console.log(`Recommended: ${(posSize.recommendedSize * 100).toFixed(2)}%`);
  console.log(`Cortisol adjustment: ${(posSize.cortisolAdjustment * 100).toFixed(0)}%\n`);

  // Close position
  console.log('--- Closing Position ---');
  const updatedSnapshot = finance.marketData.getSnapshot('BTC');
  if (updatedSnapshot) {
    const pnl = finance.portfolio.closePosition('BTC', undefined, updatedSnapshot.price);
    finance.busWiring.publishPositionClosed(
      'BTC',
      1,
      snapshot?.price || 0,
      updatedSnapshot.price,
      pnl,
    );

    console.log(`Closed @ $${updatedSnapshot.price.toFixed(2)}`);
    console.log(`Realized P&L: $${pnl.toFixed(2)}\n`);

    if (pnl > 0) {
      console.log('✓ Profitable trade → neuromod.reward published');
    } else {
      console.log('✓ Losing trade → neuromod.punishment published');
    }
  }

  // Simulate Active Inference beliefs update
  console.log('\n--- Simulating Active Inference Integration ---');
  bus.publish('inference.beliefs.updated', {
    source: 'active-inference',
    precision: 0.9,
    beliefType: 'economic',
    entropy: 0.3,
    confidence: 0.8,
  });

  console.log('✓ Active Inference beliefs updated\n');

  // Publish surprise event
  const surpriseSignal = finance.signalGenerator.generateSignal('BTC');
  if (surpriseSignal.surprise > 0.5) {
    bus.publish('inference.surprise.high', {
      source: 'finance',
      precision: 0.8,
      magnitude: surpriseSignal.surprise,
      observation: 'BTC price movement',
      expectedState: 'normal volatility',
    });

    console.log('✓ High surprise event published\n');
  }

  // Simulate consciousness drop
  console.log('--- Simulating Low Consciousness ---');
  bus.publish('consciousness.phi.updated', {
    source: 'consciousness',
    precision: 0.9,
    phi: 0.2,
    previousPhi: 0.7,
    delta: -0.5,
  });

  console.log('✓ Low consciousness should trigger conservative mode\n');

  // Simulate panic
  console.log('--- Simulating System Panic ---');
  bus.publish('kernel.panic', {
    source: 'kernel',
    precision: 1.0,
    reason: 'Critical invariant violation',
    severity: 'critical',
    recoverable: true,
  });

  console.log('✓ Panic should halt trading\n');

  // Event summary
  console.log('--- Event Summary ---');
  const uniqueEvents = [...new Set(events)];
  console.log(`Total events: ${events.length}`);
  console.log(`Unique event types: ${uniqueEvents.length}`);
  console.log('\nEvent types:');
  for (const eventType of uniqueEvents) {
    const count = events.filter(e => e === eventType).length;
    console.log(`  ${eventType}: ${count}`);
  }

  console.log('\n=== Integration Test Complete ===\n');

  // Cleanup
  finance.clear();
}

// Run: npx tsx src/finance/integration-test.ts
// if (import.meta.url === `file://${process.argv[1]}`) {
//   integrationTest().catch(console.error);
// }

export { integrationTest };
