/**
 * Genesis Observatory UI - Simple Test Suite
 *
 * Basic tests to verify UI components work correctly.
 * Run with: npx tsx src/ui/test.ts
 */

import type { SystemMetrics } from '../observability/dashboard.js';
import { createStateMapper } from './state-mapper.js';
import { createPhiOrb } from './components/phi-orb.js';
import { createNeuromodDisplay } from './components/neuromod-display.js';
import { createEconomyCard } from './components/economy-card.js';
import { createAgentNetwork } from './components/agent-network.js';

// ============================================================================
// Mock Data
// ============================================================================

const mockMetrics: SystemMetrics = {
  timestamp: Date.now(),
  uptime: 3600,
  memory: {
    heapUsed: 100 * 1024 * 1024,
    heapTotal: 200 * 1024 * 1024,
    external: 10 * 1024 * 1024,
    rss: 250 * 1024 * 1024,
  },
  consciousness: {
    phi: 0.742,
    state: 'awake',
    integration: 0.85,
    complexity: 0.65,
    attentionFocus: 'revenue-optimization',
    workspaceContents: [
      { id: 'task-1', type: 'goal', salience: 0.9 },
      { id: 'ctx-1', type: 'context', salience: 0.7 },
    ],
  },
  kernel: {
    state: 'focused',
    energy: 1.23,
    cycles: 1000,
    mode: 'exploit',
    levels: {
      l1: { active: true, load: 0.3 },
      l2: { active: true, load: 0.5 },
      l3: { active: true, load: 0.7 },
      l4: { active: false, load: 0.1 },
    },
    freeEnergy: 0.45,
    predictionError: 0.12,
  },
  agents: {
    total: 5,
    active: 3,
    queued: 2,
  },
  memory_system: {
    episodic: 42,
    semantic: 156,
    procedural: 23,
    total: 221,
  },
  llm: {
    totalRequests: 500,
    totalCost: 2.45,
    averageLatency: 1234,
    providers: ['anthropic', 'openai'],
  },
  mcp: {
    connectedServers: 3,
    availableTools: 15,
    totalCalls: 234,
  },
};

// ============================================================================
// Test Helpers
// ============================================================================

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passCount++;
  } else {
    console.error(`  ✗ ${message}`);
    failCount++;
  }
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message} (expected: ${expected}, actual: ${actual})`);
}

function assertInRange(value: number, min: number, max: number, message: string): void {
  assert(value >= min && value <= max, `${message} (${value} in [${min}, ${max}])`);
}

function testGroup(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

// ============================================================================
// Tests
// ============================================================================

function testStateMapper(): void {
  testGroup('StateMapper', () => {
    const mapper = createStateMapper();

    // Test UI state mapping
    const uiState = mapper.mapToUIState(mockMetrics, [], true);
    assert(uiState !== null, 'Creates UI state');
    assert(uiState.connected === true, 'Sets connected status');
    assert(uiState.metrics !== null, 'Includes metrics');
    assert(uiState.computed !== null, 'Includes computed metrics');

    // Test phi orb mapping
    const phiData = mapper.mapToPhiOrb(mockMetrics);
    assertEquals(phiData.phi, 0.742, 'Maps phi value');
    assertEquals(phiData.state, 'awake', 'Maps consciousness state');
    assertEquals(phiData.quality, 'good', 'Computes phi quality');
    assert(phiData.color.startsWith('#'), 'Generates color');

    // Test neuromod mapping
    const neuromodData = mapper.mapToNeuromod(mockMetrics);
    assertInRange(neuromodData.dopamine, 0, 1, 'Dopamine in range');
    assertInRange(neuromodData.serotonin, 0, 1, 'Serotonin in range');
    assertInRange(neuromodData.norepinephrine, 0, 1, 'Norepinephrine in range');
    assertInRange(neuromodData.cortisol, 0, 1, 'Cortisol in range');
    assert(['calm', 'focused', 'stressed', 'excited', 'threat'].includes(neuromodData.dominantState), 'Valid dominant state');

    // Test economy mapping
    const economyData = mapper.mapToEconomy(mockMetrics);
    assert(economyData.totalRevenue >= 0, 'Revenue non-negative');
    assert(economyData.totalCost >= 0, 'Cost non-negative');
    assert(['sustainable', 'warning', 'critical'].includes(economyData.status), 'Valid economy status');

    // Test agent network mapping
    const agentData = mapper.mapToAgentNetwork(mockMetrics);
    assertEquals(agentData.totalAgents, 5, 'Maps total agents');
    assertEquals(agentData.activeAgents, 3, 'Maps active agents');
    assertEquals(agentData.queuedTasks, 2, 'Maps queued tasks');
    assert(agentData.nodes.length > 0, 'Creates network nodes');
  });
}

function testPhiOrb(): void {
  testGroup('PhiOrb Component', () => {
    const phiOrb = createPhiOrb();

    // Subscribe to updates
    let updateCount = 0;
    phiOrb.subscribe(() => {
      updateCount++;
    });

    // Update with metrics
    phiOrb.update(mockMetrics);

    // Test data
    const data = phiOrb.getData();
    assertEquals(data.phi, 0.742, 'Stores phi value');
    assertEquals(data.state, 'awake', 'Stores state');
    assert(updateCount > 0, 'Notifies subscribers');

    // Test visualization
    const viz = phiOrb.getVisualization();
    assertInRange(viz.radius, 50, 100, 'Radius in range');
    assertInRange(viz.opacity, 0.6, 1.0, 'Opacity in range');
    assert(viz.particleCount >= 0, 'Particle count non-negative');

    // Test status text
    const status = phiOrb.getStatusText();
    assert(status.includes('φ'), 'Status includes phi symbol');
    assert(status.includes(data.quality), 'Status includes quality');
  });
}

function testNeuromodDisplay(): void {
  testGroup('NeuromodDisplay Component', () => {
    const neuromod = createNeuromodDisplay();

    let updateCount = 0;
    neuromod.subscribe(() => {
      updateCount++;
    });

    neuromod.update(mockMetrics);

    const data = neuromod.getData();
    assertInRange(data.dopamine, 0, 1, 'Dopamine in range');
    assert(updateCount > 0, 'Notifies subscribers');

    // Test visualization data
    const vizData = neuromod.getVisualizationData();
    assertEquals(vizData.length, 4, 'Has 4 neuromodulators');
    assert(vizData.every((v) => v.level >= 0 && v.level <= 1), 'All levels in range');

    // Test dominant state
    const state = neuromod.getDominantStateVisualization();
    assert(state.color.startsWith('#'), 'Has color');
    assert(state.description.length > 0, 'Has description');

    // Test behavioral effects
    const effects = neuromod.getBehavioralEffects();
    assertEquals(effects.length, 4, 'Has 4 behavioral effects');
    assert(effects.every((e) => e.value >= 0), 'All effects non-negative');
  });
}

function testEconomyCard(): void {
  testGroup('EconomyCard Component', () => {
    const economy = createEconomyCard();

    let updateCount = 0;
    economy.subscribe(() => {
      updateCount++;
    });

    economy.update(mockMetrics);

    const data = economy.getData();
    assert(data.totalRevenue >= 0, 'Revenue non-negative');
    assert(data.totalCost >= 0, 'Cost non-negative');
    assert(updateCount > 0, 'Notifies subscribers');

    // Test metrics
    const metrics = economy.getMetrics();
    assert(metrics.length >= 6, 'Has multiple metrics');
    assert(metrics.every((m) => m.label.length > 0), 'All metrics have labels');

    // Test status
    const status = economy.getStatusIndicator();
    assert(['sustainable', 'warning', 'critical'].includes(status.status), 'Valid status');
    assert(status.message.length > 0, 'Has status message');

    // Test NESS info
    const ness = economy.getNESSInfo();
    assertInRange(ness.deviation, 0, 1, 'NESS deviation in range');
    assertInRange(ness.convergenceRate, 0, 1, 'Convergence rate in range');
  });
}

function testAgentNetwork(): void {
  testGroup('AgentNetwork Component', () => {
    const agents = createAgentNetwork();

    let updateCount = 0;
    agents.subscribe(() => {
      updateCount++;
    });

    agents.update(mockMetrics);

    const data = agents.getData();
    assertEquals(data.totalAgents, 5, 'Total agents correct');
    assertEquals(data.activeAgents, 3, 'Active agents correct');
    assert(updateCount > 0, 'Notifies subscribers');

    // Test stats
    const stats = agents.getStats();
    assert(stats.length >= 6, 'Has multiple stats');
    assert(stats.every((s) => s.label.length > 0), 'All stats have labels');

    // Test network graph
    assert(data.nodes.length > 0, 'Has nodes');
    assert(data.connections.length >= 0, 'Has connections');

    // Test node positions
    const positions = agents.getNodePositions(800, 600);
    assert(positions.size === data.nodes.length, 'Position for each node');
    positions.forEach((pos) => {
      assertInRange(pos.x, 0, 800, 'Node X in bounds');
      assertInRange(pos.y, 0, 600, 'Node Y in bounds');
    });

    // Test connection paths
    const paths = agents.getConnectionPaths(positions);
    assertEquals(paths.length, data.connections.length, 'Path for each connection');
  });
}

function testSubscriptions(): void {
  testGroup('Subscription Management', () => {
    const phiOrb = createPhiOrb();

    let count = 0;
    const unsubscribe = phiOrb.subscribe(() => {
      count++;
    });

    phiOrb.update(mockMetrics);
    assert(count > 0, 'Subscriber called on update');

    const prevCount = count;
    unsubscribe();

    phiOrb.update(mockMetrics);
    assertEquals(count, prevCount, 'Subscriber not called after unsubscribe');
  });
}

function testMemoryLeaks(): void {
  testGroup('Memory Management', () => {
    const neuromod = createNeuromodDisplay();

    // Add many samples to history
    for (let i = 0; i < 100; i++) {
      neuromod.update(mockMetrics);
    }

    const history = neuromod.getHistory('dopamine');
    assert(history.length <= 60, 'History bounded to max size');
  });
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  console.log('\n========================================');
  console.log('Genesis Observatory UI - Test Suite');
  console.log('========================================');

  testStateMapper();
  testPhiOrb();
  testNeuromodDisplay();
  testEconomyCard();
  testAgentNetwork();
  testSubscriptions();
  testMemoryLeaks();

  console.log('\n========================================');
  console.log(`Results: ${passCount} passed, ${failCount} failed`);
  console.log('========================================\n');

  process.exit(failCount > 0 ? 1 : 0);
}

main();
