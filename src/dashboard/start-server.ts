/**
 * Genesis Dashboard Server - Standalone Starter
 *
 * Starts the Genesis dashboard server with live/demo metrics.
 * Run with: npx tsx src/dashboard/start-server.ts
 */

import { getDashboard, type SystemMetrics } from '../observability/dashboard.js';

// ============================================================================
// Demo Metrics Generator
// ============================================================================

let cycleCount = 0;
let phi = 0.5;
let dopamine = 0.5;
let serotonin = 0.5;
let norepinephrine = 0.3;
let cortisol = 0.2;
let freeEnergy = 1.0;
let activeAgents = 3;

const states = ['idle', 'sensing', 'thinking', 'deciding', 'acting', 'reflecting'];
let stateIndex = 0;

function generateMetrics(): SystemMetrics {
  cycleCount++;

  // Simulate phi fluctuations
  phi += (Math.random() - 0.5) * 0.05;
  phi = Math.max(0.1, Math.min(1, phi));

  // Simulate neuromodulators
  dopamine += (Math.random() - 0.5) * 0.08;
  dopamine = Math.max(0, Math.min(1, dopamine));

  serotonin += (Math.random() - 0.5) * 0.05;
  serotonin = Math.max(0, Math.min(1, serotonin));

  norepinephrine += (Math.random() - 0.5) * 0.06;
  norepinephrine = Math.max(0, Math.min(1, norepinephrine));

  cortisol += (Math.random() - 0.5) * 0.03;
  cortisol = Math.max(0, Math.min(1, cortisol));

  // Simulate free energy
  freeEnergy += (Math.random() - 0.5) * 0.2;
  freeEnergy = Math.max(0.1, Math.min(5, freeEnergy));

  // Cycle through states
  if (cycleCount % 50 === 0) {
    stateIndex = (stateIndex + 1) % states.length;
  }

  // Simulate agent activity
  if (cycleCount % 30 === 0) {
    activeAgents = Math.floor(Math.random() * 8) + 1;
  }

  const mem = process.memoryUsage();

  return {
    timestamp: Date.now(),
    uptime: cycleCount,
    memory: {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      rss: mem.rss,
    },
    consciousness: {
      phi,
      state: phi > 0.7 ? 'alert' : phi > 0.5 ? 'aware' : phi > 0.3 ? 'drowsy' : 'dormant',
      integration: phi * 0.9,
    },
    kernel: {
      state: states[stateIndex],
      energy: Math.max(0, 1 - freeEnergy / 5),
      cycles: cycleCount,
    },
    agents: {
      total: 10,
      active: activeAgents,
      queued: Math.max(0, 10 - activeAgents - 3),
    },
    memory_system: {
      episodic: 1000 + Math.floor(cycleCount / 10),
      semantic: 500 + Math.floor(cycleCount / 20),
      procedural: 100 + Math.floor(cycleCount / 50),
      total: 1600 + Math.floor(cycleCount / 5),
    },
    llm: {
      totalRequests: cycleCount,
      totalCost: cycleCount * 0.001,
      averageLatency: 200 + Math.random() * 100,
      providers: ['anthropic', 'openai'],
    },
    mcp: {
      connectedServers: 17,
      availableTools: 45,
      totalCalls: cycleCount * 3,
    },
  };
}

// ============================================================================
// Start Server
// ============================================================================

async function main() {
  console.log('🚀 Starting Genesis Dashboard Server...\n');

  const dashboard = getDashboard({ port: 9876 });

  // Set metrics provider
  dashboard.setMetricsProvider(generateMetrics);

  // Start server
  await dashboard.start();

  console.log('✅ Dashboard server running at http://localhost:9876');
  console.log('   - Metrics: http://localhost:9876/api/metrics');
  console.log('   - Events:  http://localhost:9876/api/events (SSE)');
  console.log('   - Health:  http://localhost:9876/health\n');

  // Broadcast neuromodulation updates every 500ms
  setInterval(() => {
    dashboard.broadcastEvent({
      id: crypto.randomUUID(),
      type: 'neuromodulation:update',
      timestamp: Date.now(),
      data: {
        levels: { dopamine, serotonin, norepinephrine, cortisol },
        effect: {
          explorationRate: dopamine * 0.5,
          riskTolerance: norepinephrine * 0.7,
          processingDepth: serotonin * 0.8,
          learningRate: (dopamine + serotonin) / 2,
        },
        cycle: cycleCount,
      },
    });
  }, 500);

  // Broadcast consciousness updates every second
  setInterval(() => {
    dashboard.broadcastEvent({
      id: crypto.randomUUID(),
      type: 'consciousness:phi_updated',
      timestamp: Date.now(),
      data: {
        phi,
        state: phi > 0.7 ? 'alert' : phi > 0.5 ? 'aware' : phi > 0.3 ? 'drowsy' : 'dormant',
        integration: phi * 0.9,
        trend: phi > 0.5 ? 'rising' : 'falling',
      },
    });
  }, 1000);

  // Broadcast kernel mode changes
  let lastState = states[stateIndex];
  setInterval(() => {
    if (states[stateIndex] !== lastState) {
      dashboard.broadcastEvent({
        id: crypto.randomUUID(),
        type: 'kernel:mode',
        timestamp: Date.now(),
        data: {
          mode: states[stateIndex],
          prev: lastState,
          cycle: cycleCount,
        },
      });
      lastState = states[stateIndex];
    }
  }, 200);

  console.log('📡 Broadcasting live metrics...');
  console.log('   Press Ctrl+C to stop\n');
}

main().catch(console.error);
