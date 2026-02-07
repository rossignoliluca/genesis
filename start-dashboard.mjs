/**
 * Genesis Dashboard Server - Standalone Starter
 * Run with: node start-dashboard.mjs
 */

import { getDashboard } from './dist/src/observability/dashboard.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Real Cost Data from Genesis
// ============================================================================

const GENESIS_DATA_DIR = path.join(process.cwd(), '.genesis');
const COSTS_FILE = path.join(GENESIS_DATA_DIR, 'llm-costs.json');
const REVENUE_FILE = path.join(GENESIS_DATA_DIR, 'revenue.json');

/**
 * Load real LLM costs from disk
 */
function loadRealCosts() {
  try {
    if (fs.existsSync(COSTS_FILE)) {
      const data = fs.readFileSync(COSTS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn('[Dashboard] Failed to load costs:', err.message);
  }
  return [];
}

/**
 * Load real revenue from disk
 */
function loadRealRevenue() {
  try {
    if (fs.existsSync(REVENUE_FILE)) {
      const data = fs.readFileSync(REVENUE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn('[Dashboard] Failed to load revenue:', err.message);
  }
  return [];
}

/**
 * Calculate totals for a time period
 */
function calculateTotals(records, periodMs = 30 * 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - periodMs;
  const filtered = records.filter(r => r.timestamp >= cutoff);
  return filtered.reduce((sum, r) => sum + (r.amount || 0), 0);
}

/**
 * Calculate daily average
 */
function calculateDailyAverage(records, periodMs = 7 * 24 * 60 * 60 * 1000) {
  const total = calculateTotals(records, periodMs);
  const days = periodMs / (24 * 60 * 60 * 1000);
  return total / days;
}

// ============================================================================
// Demo Metrics Generator (with real economy data)
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

function generateMetrics() {
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

  // ============================================================================
  // REAL ECONOMY DATA - Read from Genesis cost tracking
  // ============================================================================
  const costs = loadRealCosts();
  const revenue = loadRealRevenue();

  // Calculate real totals (30-day window)
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const oneDay = 24 * 60 * 60 * 1000;

  const totalCosts = calculateTotals(costs, thirtyDays);
  const totalRevenue = calculateTotals(revenue, thirtyDays);
  const dailyCosts = calculateDailyAverage(costs, sevenDays);
  const dailyRevenue = calculateDailyAverage(revenue, sevenDays);

  // Count LLM requests
  const llmCosts = costs.filter(c => c.category === 'llm');
  const recentLLMCosts = llmCosts.filter(c => c.timestamp >= Date.now() - thirtyDays);
  const totalLLMCost = recentLLMCosts.reduce((sum, c) => sum + (c.amount || 0), 0);

  // Extract providers from cost descriptions
  const providers = [...new Set(recentLLMCosts.map(c => c.provider).filter(Boolean))];

  // Estimate cash (user should set starting balance in .genesis/balance.json)
  // For now, use a default starting balance minus total costs plus revenue
  const startingBalance = 10000; // Default $10,000
  const netBalance = startingBalance + totalRevenue - totalCosts;

  // Calculate NESS (Net Economic Self-Sustainability)
  const ness = dailyCosts > 0 ? Math.min(1, dailyRevenue / dailyCosts) : 0;

  // Calculate runway in days
  const dailyBurn = dailyCosts - dailyRevenue;
  const runway = dailyBurn > 0 ? Math.max(0, netBalance / dailyBurn) : Infinity;

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
      totalRequests: recentLLMCosts.length,
      totalCost: Math.round(totalLLMCost * 10000) / 10000, // 4 decimal precision
      averageLatency: 200 + Math.random() * 100,
      providers: providers.length > 0 ? providers : ['none'],
    },
    mcp: {
      connectedServers: 17,
      availableTools: 45,
      totalCalls: cycleCount * 3,
    },
    // Economy metrics (REAL DATA)
    economy: {
      cash: Math.round(netBalance * 100) / 100,
      revenue: Math.round(dailyRevenue * 100) / 100,
      costs: Math.round(dailyCosts * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCosts: Math.round(totalCosts * 100) / 100,
      runway: runway === Infinity ? 9999 : Math.round(runway),
      ness: Math.round(ness * 1000) / 1000,
      isReal: true, // Flag to indicate real data
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

  // Broadcast economy updates every 2 seconds (with REAL data)
  setInterval(() => {
    const costs = loadRealCosts();
    const revenue = loadRealRevenue();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    const totalCosts = calculateTotals(costs, thirtyDays);
    const totalRevenue = calculateTotals(revenue, thirtyDays);
    const dailyCosts = calculateDailyAverage(costs, sevenDays);
    const dailyRevenue = calculateDailyAverage(revenue, sevenDays);
    const startingBalance = 10000;
    const netBalance = startingBalance + totalRevenue - totalCosts;
    const dailyBurn = dailyCosts - dailyRevenue;
    const runway = dailyBurn > 0 ? Math.max(0, netBalance / dailyBurn) : Infinity;
    const ness = dailyCosts > 0 ? Math.min(1, dailyRevenue / dailyCosts) : 0;

    dashboard.broadcastEvent({
      id: crypto.randomUUID(),
      type: 'economy:update',
      timestamp: Date.now(),
      data: {
        cash: Math.round(netBalance * 100) / 100,
        revenue: Math.round(dailyRevenue * 100) / 100,
        costs: Math.round(dailyCosts * 100) / 100,
        totalCosts: Math.round(totalCosts * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        runway: runway === Infinity ? 9999 : Math.round(runway),
        ness: Math.round(ness * 1000) / 1000,
        cycle: cycleCount,
        isReal: true,
      },
    });
  }, 2000);

  console.log('📡 Broadcasting live metrics...');
  console.log('   Press Ctrl+C to stop\n');
}

main().catch(console.error);
