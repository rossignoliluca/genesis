/**
 * Genesis Observatory UI - Example Usage
 *
 * Demonstrates how to use the Genesis Observatory UI system.
 * Run this file to see real-time Genesis monitoring in action.
 *
 * Usage:
 *   npx tsx src/ui/example.ts
 */

import { createObservatory, connectToGenesis } from './index.js';

// ============================================================================
// Example 1: Basic Observatory Usage
// ============================================================================

async function basicExample() {
  console.log('\n=== Basic Observatory Example ===\n');

  // Create observatory instance
  const observatory = createObservatory({
    dashboardUrl: 'http://localhost:9876',
    refreshInterval: 1000,
    enableSSE: true,
  });

  // Connect to Genesis dashboard
  observatory.connect();

  // Subscribe to state updates
  const unsubscribe = observatory.subscribe((state) => {
    if (!state.metrics) return;

    console.log('\n--- Genesis State Update ---');
    console.log('Timestamp:', new Date(state.timestamp).toISOString());
    console.log('Connected:', state.connected);
    console.log('\nConsciousness:');
    console.log('  φ:', state.metrics.consciousness.phi.toFixed(3));
    console.log('  State:', state.metrics.consciousness.state);
    console.log('  Integration:', (state.metrics.consciousness.integration * 100).toFixed(0) + '%');
    console.log('  Quality:', state.computed.phiQuality);

    console.log('\nKernel:');
    console.log('  State:', state.metrics.kernel.state);
    console.log('  Energy:', state.metrics.kernel.energy.toFixed(2));
    console.log('  Cycles:', state.metrics.kernel.cycles);

    console.log('\nAgents:');
    console.log('  Total:', state.metrics.agents.total);
    console.log('  Active:', state.metrics.agents.active);
    console.log('  Queued:', state.metrics.agents.queued);

    console.log('\nEconomy:');
    console.log('  Health:', state.computed.economicHealth);
    console.log('  LLM Requests:', state.metrics.llm.totalRequests);
    console.log('  LLM Cost:', '$' + state.metrics.llm.totalCost.toFixed(4));

    console.log('\nSystem:');
    console.log('  Health:', state.computed.systemHealth);
    console.log('  Heap Usage:', (state.metrics.memory.heapUsed / 1024 / 1024).toFixed(1) + ' MB');
    console.log('  Uptime:', (state.metrics.uptime / 60).toFixed(1) + ' min');
  });

  // Run for 30 seconds
  await new Promise((resolve) => setTimeout(resolve, 30000));

  // Cleanup
  unsubscribe();
  observatory.disconnect();
  console.log('\n=== Observatory Disconnected ===\n');
}

// ============================================================================
// Example 2: Individual Component Usage
// ============================================================================

async function componentExample() {
  console.log('\n=== Component Example ===\n');

  const observatory = connectToGenesis('http://localhost:9876');

  // Phi Orb component
  const phiOrb = observatory.getPhiOrb();
  phiOrb.subscribe((data) => {
    const trendSymbol = data.trend === 'rising' ? '↑' : data.trend === 'falling' ? '↓' : '→';
    console.log(`[PhiOrb] φ = ${data.phi.toFixed(3)} ${trendSymbol} | ${data.state} | ${data.quality}`);

    const viz = phiOrb.getVisualization();
    console.log(`  Radius: ${viz.radius.toFixed(0)}px, Opacity: ${viz.opacity.toFixed(2)}, Particles: ${viz.particleCount}`);
  });

  // Neuromodulation component
  const neuromod = observatory.getNeuromodDisplay();
  neuromod.subscribe((data) => {
    console.log(`[Neuromod] Dominant: ${data.dominantState}`);
    console.log(`  DA: ${data.dopamine.toFixed(2)}, 5HT: ${data.serotonin.toFixed(2)}, NE: ${data.norepinephrine.toFixed(2)}, Cortisol: ${data.cortisol.toFixed(2)}`);
    console.log(`  Exploration: ${(data.explorationRate * 100).toFixed(0)}%, Risk Tolerance: ${(data.riskTolerance * 100).toFixed(0)}%`);
  });

  // Economy component
  const economy = observatory.getEconomyCard();
  economy.subscribe((data) => {
    console.log(`[Economy] Status: ${data.status}`);
    console.log(`  Revenue: $${data.totalRevenue.toFixed(2)}, Cost: $${data.totalCost.toFixed(2)}, Net: $${data.netIncome.toFixed(2)}`);
    console.log(`  ROI: ${data.roi.toFixed(1)}%, NESS Deviation: ${(data.nessDeviation * 100).toFixed(0)}%`);
  });

  // Agent Network component
  const agents = observatory.getAgentNetwork();
  agents.subscribe((data) => {
    console.log(`[Agents] ${data.activeAgents}/${data.totalAgents} active (${(data.utilization * 100).toFixed(0)}%)`);
    console.log(`  Providers: ${data.providers.join(', ')}`);
    console.log(`  Avg Latency: ${data.avgLatency.toFixed(0)}ms`);
    console.log(`  Network: ${data.nodes.length} nodes, ${data.connections.length} connections`);
  });

  // Run for 30 seconds
  await new Promise((resolve) => setTimeout(resolve, 30000));

  observatory.disconnect();
  console.log('\n=== Components Disconnected ===\n');
}

// ============================================================================
// Example 3: Snapshot State (No Subscription)
// ============================================================================

async function snapshotExample() {
  console.log('\n=== Snapshot Example ===\n');

  try {
    const state = await import('./index.js').then((m) =>
      m.getGenesisState('http://localhost:9876')
    );

    console.log('Genesis Snapshot:');
    console.log('  φ:', state.metrics?.consciousness.phi.toFixed(3) || 'N/A');
    console.log('  Kernel:', state.metrics?.kernel.state || 'N/A');
    console.log('  Agents:', `${state.metrics?.agents.active}/${state.metrics?.agents.total}` || 'N/A');
    console.log('  Health:', state.computed.systemHealth);
  } catch (error) {
    console.error('Failed to get snapshot:', error);
  }
}

// ============================================================================
// Example 4: Visualization Data Export
// ============================================================================

async function visualizationExample() {
  console.log('\n=== Visualization Data Example ===\n');

  const observatory = connectToGenesis('http://localhost:9876');

  // Wait for first update
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Get visualization data for rendering
  const phiOrb = observatory.getPhiOrb();
  const phiData = phiOrb.getData();
  console.log('\nPhi Orb Visualization Data:');
  console.log(JSON.stringify(phiData, null, 2));

  const neuromod = observatory.getNeuromodDisplay();
  const neuromodViz = neuromod.getVisualizationData();
  console.log('\nNeuromodulator Visualization Data:');
  console.log(JSON.stringify(neuromodViz, null, 2));

  const economy = observatory.getEconomyCard();
  const economyMetrics = economy.getMetrics();
  console.log('\nEconomy Metrics:');
  console.log(JSON.stringify(economyMetrics, null, 2));

  const economyStatus = economy.getStatusIndicator();
  console.log('\nEconomy Status:');
  console.log(JSON.stringify(economyStatus, null, 2));

  const agents = observatory.getAgentNetwork();
  const agentStats = agents.getStats();
  console.log('\nAgent Stats:');
  console.log(JSON.stringify(agentStats, null, 2));

  // Get network graph data
  const networkData = agents.getData();
  console.log(`\nAgent Network Graph: ${networkData.nodes.length} nodes, ${networkData.connections.length} connections`);

  observatory.disconnect();
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const example = args[0] || 'basic';

  console.log('\n========================================');
  console.log('Genesis Observatory UI - Example Usage');
  console.log('========================================');
  console.log('\nMake sure Genesis dashboard is running at http://localhost:9876');
  console.log('Start it with: npm run dashboard\n');

  switch (example) {
    case 'basic':
      await basicExample();
      break;
    case 'components':
      await componentExample();
      break;
    case 'snapshot':
      await snapshotExample();
      break;
    case 'viz':
      await visualizationExample();
      break;
    default:
      console.log('Unknown example:', example);
      console.log('Available: basic, components, snapshot, viz');
      process.exit(1);
  }

  process.exit(0);
}

// Run: npx tsx src/ui/example.ts
// if (import.meta.url === `file://${process.argv[1]}`) {
//   main().catch((err) => {
//     console.error('Error:', err);
//     process.exit(1);
//   });
// }

export { basicExample, componentExample, snapshotExample, visualizationExample };
