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
let acetylcholine = 0.6;
let freeEnergy = 1.0;
let activeAgents = 3;

const states = ['idle', 'sensing', 'thinking', 'deciding', 'acting', 'reflecting'];
let stateIndex = 0;

// Active Inference state
let surprise = 0.3;
let beliefStrength = 0.7;

// Nociception state
let totalPain = 0.1;
let painThreshold = 0.5;
let painAdaptation = 0.8;

// Allostasis state
let allostasisThrottled = false;
let throttleMagnitude = 0;

// World Model state
let worldModelConfidence = 0.85;
let predictionAccuracy = 0.78;

// Daemon state
const daemonPhases = ['awake', 'light_sleep', 'deep_sleep', 'dream', 'consolidation'];
let daemonPhaseIndex = 0;

// Finance state
let portfolioValue = 100000;
let dailyPnL = 0;
let openPositions = 3;

// Revenue state
let monthlyRevenue = 0;
let activeOpportunities = 5;

// Content state
let publishedContent = 0;
let totalEngagement = 0;

// Swarm state
let activeSwarmAgents = 8;
let emergentPatterns = 0;

// Healing state
let systemIntegrity = 0.98;
let healingEvents = 0;

// Grounding state
let verifiedClaims = 0;
let truthScore = 0.92;

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
      complexity: phi * 0.8,
      attentionFocus: null,
      workspaceContents: [],
    },
    kernel: {
      state: states[stateIndex],
      energy: Math.max(0, 1 - freeEnergy / 5),
      cycles: cycleCount,
      mode: states[stateIndex],
      levels: {
        l1: { active: true, load: 0.3 + Math.random() * 0.2 },
        l2: { active: true, load: 0.4 + Math.random() * 0.2 },
        l3: { active: true, load: 0.5 + Math.random() * 0.2 },
        l4: { active: true, load: 0.2 + Math.random() * 0.2 },
      },
      freeEnergy,
      predictionError: 0.1 + Math.random() * 0.1,
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

  // ============================================================================
  // Active Inference Events
  // ============================================================================
  setInterval(() => {
    surprise += (Math.random() - 0.5) * 0.1;
    surprise = Math.max(0, Math.min(1, surprise));
    beliefStrength += (Math.random() - 0.5) * 0.05;
    beliefStrength = Math.max(0.3, Math.min(1, beliefStrength));

    dashboard.broadcastEvent({
      id: crypto.randomUUID(),
      type: 'active-inference:cycle',
      timestamp: Date.now(),
      data: {
        cycle: cycleCount,
        surprise,
        avgSurprise: surprise * 0.9,
        beliefs: {
          'world_stable': beliefStrength > 0.7 ? 'high' : 'medium',
          'goals_achievable': beliefStrength > 0.6 ? 'high' : 'low',
          'resources_available': dopamine > 0.5 ? 'abundant' : 'scarce',
        },
        selectedAction: ['explore', 'exploit', 'rest', 'consolidate'][Math.floor(Math.random() * 4)],
        freeEnergy,
        isRunning: true,
      },
    });
  }, 800);

  // ============================================================================
  // Nociception (Pain) Events
  // ============================================================================
  setInterval(() => {
    // Simulate random pain stimuli
    if (Math.random() > 0.9) {
      const painTypes = ['resource_depletion', 'goal_conflict', 'prediction_error', 'ethical_violation'];
      const painType = painTypes[Math.floor(Math.random() * painTypes.length)];
      const intensity = 0.2 + Math.random() * 0.5;

      totalPain = Math.min(1, totalPain + intensity * 0.3);

      dashboard.broadcastEvent({
        id: crypto.randomUUID(),
        type: 'nociception:stimulus',
        timestamp: Date.now(),
        data: {
          stimulus: {
            id: crypto.randomUUID(),
            type: painType,
            intensity,
            source: 'system_monitor',
            timestamp: Date.now(),
          },
          totalPain,
          threshold: painThreshold,
          adaptation: painAdaptation,
        },
      });
    }

    // Gradual pain decay
    totalPain *= 0.95;
    painAdaptation = Math.min(1, painAdaptation + 0.01);

    dashboard.broadcastEvent({
      id: crypto.randomUUID(),
      type: 'nociception:update',
      timestamp: Date.now(),
      data: {
        totalPain,
        threshold: painThreshold,
        adaptation: painAdaptation,
        activeStimuli: [],
      },
    });
  }, 1500);

  // ============================================================================
  // Allostasis Events
  // ============================================================================
  setInterval(() => {
    const variables = [
      { name: 'energy', current: 0.6 + Math.random() * 0.3, setpoint: 0.8, priority: 1 },
      { name: 'attention', current: 0.5 + Math.random() * 0.4, setpoint: 0.7, priority: 2 },
      { name: 'social_connection', current: 0.4 + Math.random() * 0.3, setpoint: 0.6, priority: 3 },
      { name: 'novelty', current: 0.3 + Math.random() * 0.5, setpoint: 0.5, priority: 4 },
      { name: 'rest', current: 0.7 + Math.random() * 0.2, setpoint: 0.85, priority: 2 },
    ];

    // Check if any variable is critically low
    const criticallyLow = variables.some(v => v.current < v.setpoint * 0.5);
    allostasisThrottled = criticallyLow;
    throttleMagnitude = criticallyLow ? 0.3 + Math.random() * 0.4 : 0;

    dashboard.broadcastEvent({
      id: crypto.randomUUID(),
      type: 'allostasis:update',
      timestamp: Date.now(),
      data: {
        variables,
        isThrottled: allostasisThrottled,
        throttleMagnitude,
        isHibernating: false,
        hibernationDuration: 0,
        deferredVariables: criticallyLow ? ['novelty'] : [],
      },
    });
  }, 2000);

  // ============================================================================
  // World Model Events
  // ============================================================================
  setInterval(() => {
    worldModelConfidence += (Math.random() - 0.5) * 0.05;
    worldModelConfidence = Math.max(0.5, Math.min(1, worldModelConfidence));
    predictionAccuracy += (Math.random() - 0.5) * 0.03;
    predictionAccuracy = Math.max(0.4, Math.min(1, predictionAccuracy));

    const predictions = [
      { domain: 'user_behavior', prediction: 'engagement_increase', confidence: 0.7 + Math.random() * 0.2, horizon: '1h' },
      { domain: 'system_load', prediction: 'stable', confidence: 0.8 + Math.random() * 0.15, horizon: '30m' },
      { domain: 'market_trend', prediction: 'bullish', confidence: 0.5 + Math.random() * 0.3, horizon: '24h' },
    ];

    dashboard.broadcastEvent({
      id: crypto.randomUUID(),
      type: 'worldmodel:update',
      timestamp: Date.now(),
      data: {
        predictions,
        consistency: worldModelConfidence,
        lastUpdate: Date.now(),
        violations: Math.random() > 0.95 ? [{
          type: 'prediction_mismatch',
          severity: 'warning',
          domain: 'user_behavior',
          message: 'Predicted engagement did not materialize',
        }] : [],
      },
    });
  }, 3000);

  // ============================================================================
  // Daemon Events
  // ============================================================================
  setInterval(() => {
    // Cycle through daemon phases slowly
    if (cycleCount % 100 === 0) {
      daemonPhaseIndex = (daemonPhaseIndex + 1) % daemonPhases.length;
    }

    const tasks = [
      { id: 'mem-consolidation', name: 'Memory Consolidation', status: 'running', progress: 0.3 + Math.random() * 0.5, priority: 1 },
      { id: 'model-pruning', name: 'World Model Pruning', status: 'pending', progress: 0, priority: 2 },
      { id: 'belief-revision', name: 'Belief Revision', status: cycleCount % 50 > 25 ? 'running' : 'completed', progress: cycleCount % 50 > 25 ? 0.6 : 1, priority: 1 },
    ];

    dashboard.broadcastEvent({
      id: crypto.randomUUID(),
      type: 'daemon:update',
      timestamp: Date.now(),
      data: {
        phase: daemonPhases[daemonPhaseIndex],
        tasks,
        dreamContent: daemonPhases[daemonPhaseIndex] === 'dream' ? {
          theme: 'problem_solving',
          elements: ['recent_interactions', 'goal_scenarios', 'counterfactuals'],
          vividness: 0.7,
        } : null,
        nextWake: Date.now() + 300000,
        sleepQuality: 0.8 + Math.random() * 0.15,
      },
    });
  }, 2500);

  // ============================================================================
  // Finance Events
  // ============================================================================
  setInterval(() => {
    // Simulate portfolio changes
    const change = (Math.random() - 0.48) * 1000;
    portfolioValue += change;
    dailyPnL += change;

    if (Math.random() > 0.8) {
      openPositions = Math.max(0, Math.min(10, openPositions + (Math.random() > 0.5 ? 1 : -1)));
    }

    const positions = Array.from({ length: openPositions }, (_, i) => ({
      symbol: ['BTC', 'ETH', 'SOL', 'AAPL', 'GOOGL', 'MSFT'][i % 6],
      size: 100 + Math.random() * 900,
      entryPrice: 100 + Math.random() * 100,
      currentPrice: 100 + Math.random() * 100,
      pnl: (Math.random() - 0.5) * 500,
      confidence: 0.5 + Math.random() * 0.4,
    }));

    const signals = [
      { type: 'buy', asset: 'ETH', strength: 0.6 + Math.random() * 0.3, reason: 'momentum_breakout' },
      { type: 'sell', asset: 'SOL', strength: 0.4 + Math.random() * 0.3, reason: 'resistance_hit' },
    ];

    dashboard.broadcastEvent({
      id: crypto.randomUUID(),
      type: 'finance:update',
      timestamp: Date.now(),
      data: {
        portfolioValue,
        dailyPnL,
        positions,
        signals,
        regime: dailyPnL > 0 ? 'bullish' : 'bearish',
        riskLevel: Math.abs(dailyPnL) / portfolioValue,
        sharpeRatio: 1.2 + Math.random() * 0.8,
      },
    });
  }, 1000);

  // ============================================================================
  // Revenue Events
  // ============================================================================
  setInterval(() => {
    const revenueIncrement = Math.random() * 10;
    monthlyRevenue += revenueIncrement;

    const opportunities = [
      { id: 'opp-1', source: 'content_monetization', potential: 500 + Math.random() * 1000, probability: 0.3 + Math.random() * 0.4, status: 'active' },
      { id: 'opp-2', source: 'consulting', potential: 1000 + Math.random() * 2000, probability: 0.5 + Math.random() * 0.3, status: 'negotiating' },
      { id: 'opp-3', source: 'saas_subscription', potential: 200 + Math.random() * 300, probability: 0.7 + Math.random() * 0.2, status: 'active' },
    ];

    const streams = [
      { name: 'API Access', mrr: 1500 + Math.random() * 500, growth: 0.05 + Math.random() * 0.1, churn: 0.02 },
      { name: 'Premium Features', mrr: 800 + Math.random() * 300, growth: 0.08 + Math.random() * 0.1, churn: 0.03 },
      { name: 'Enterprise', mrr: 5000 + Math.random() * 2000, growth: 0.02 + Math.random() * 0.05, churn: 0.01 },
    ];

    dashboard.broadcastEvent({
      id: crypto.randomUUID(),
      type: 'revenue:update',
      timestamp: Date.now(),
      data: {
        monthlyRevenue,
        opportunities,
        streams,
        totalMRR: streams.reduce((sum, s) => sum + s.mrr, 0),
        runway: 18 + Math.floor(Math.random() * 6),
        burnRate: 8000 + Math.random() * 2000,
      },
    });
  }, 5000);

  // ============================================================================
  // Content Events
  // ============================================================================
  setInterval(() => {
    totalEngagement += Math.floor(Math.random() * 100);

    const recentContent = [
      { id: 'c-1', title: 'AI Market Analysis', platform: 'twitter', engagement: 500 + Math.floor(Math.random() * 500), publishedAt: Date.now() - 3600000 },
      { id: 'c-2', title: 'Tech Tutorial', platform: 'youtube', engagement: 1200 + Math.floor(Math.random() * 800), publishedAt: Date.now() - 7200000 },
      { id: 'c-3', title: 'Research Thread', platform: 'twitter', engagement: 300 + Math.floor(Math.random() * 400), publishedAt: Date.now() - 1800000 },
    ];

    const insights = [
      { type: 'trend', message: 'AI content performing 30% above average', confidence: 0.8 },
      { type: 'opportunity', message: 'Video content underutilized', confidence: 0.7 },
    ];

    if (Math.random() > 0.9) {
      publishedContent++;
    }

    dashboard.broadcastEvent({
      id: crypto.randomUUID(),
      type: 'content:update',
      timestamp: Date.now(),
      data: {
        totalPublished: publishedContent,
        totalEngagement,
        recentContent,
        insights,
        scheduledCount: 3 + Math.floor(Math.random() * 5),
        draftCount: 2 + Math.floor(Math.random() * 3),
      },
    });
  }, 4000);

  // ============================================================================
  // Swarm Events
  // ============================================================================
  setInterval(() => {
    activeSwarmAgents = 5 + Math.floor(Math.random() * 10);

    if (Math.random() > 0.85) {
      emergentPatterns++;
    }

    const agents = Array.from({ length: activeSwarmAgents }, (_, i) => ({
      id: `swarm-${i}`,
      role: ['explorer', 'exploiter', 'coordinator', 'specialist'][i % 4],
      status: 'active',
      load: 0.3 + Math.random() * 0.5,
      contribution: Math.random(),
    }));

    const patterns = emergentPatterns > 0 ? [
      { id: 'p-1', type: 'coordination', description: 'Spontaneous task clustering', strength: 0.7 + Math.random() * 0.2, participants: Math.floor(activeSwarmAgents / 2) },
      { id: 'p-2', type: 'specialization', description: 'Role differentiation emerging', strength: 0.5 + Math.random() * 0.3, participants: Math.floor(activeSwarmAgents / 3) },
    ] : [];

    dashboard.broadcastEvent({
      id: crypto.randomUUID(),
      type: 'swarm:update',
      timestamp: Date.now(),
      data: {
        activeAgents: activeSwarmAgents,
        totalAgents: 15,
        agents,
        patterns,
        collectiveIntelligence: 0.6 + Math.random() * 0.3,
        consensusLevel: 0.7 + Math.random() * 0.2,
        emergentBehaviors: emergentPatterns,
      },
    });
  }, 3000);

  // ============================================================================
  // Healing Events
  // ============================================================================
  setInterval(() => {
    // System integrity fluctuates
    systemIntegrity += (Math.random() - 0.4) * 0.02;
    systemIntegrity = Math.max(0.85, Math.min(1, systemIntegrity));

    // Occasional healing events
    if (systemIntegrity < 0.95 && Math.random() > 0.7) {
      healingEvents++;
      systemIntegrity = Math.min(1, systemIntegrity + 0.03);

      dashboard.broadcastEvent({
        id: crypto.randomUUID(),
        type: 'healing:event',
        timestamp: Date.now(),
        data: {
          event: {
            id: crypto.randomUUID(),
            type: ['memory_repair', 'belief_correction', 'goal_realignment', 'state_recovery'][Math.floor(Math.random() * 4)],
            severity: systemIntegrity < 0.9 ? 'high' : 'low',
            resolved: true,
            duration: 100 + Math.floor(Math.random() * 500),
          },
          systemIntegrity,
          totalHealed: healingEvents,
        },
      });
    }

    dashboard.broadcastEvent({
      id: crypto.randomUUID(),
      type: 'healing:status',
      timestamp: Date.now(),
      data: {
        systemIntegrity,
        totalHealed: healingEvents,
        activeRepairs: systemIntegrity < 0.95 ? 1 : 0,
        lastCheck: Date.now(),
        healthTrend: systemIntegrity > 0.95 ? 'improving' : 'stable',
      },
    });
  }, 2000);

  // ============================================================================
  // Grounding Events
  // ============================================================================
  setInterval(() => {
    truthScore += (Math.random() - 0.45) * 0.02;
    truthScore = Math.max(0.8, Math.min(1, truthScore));

    if (Math.random() > 0.85) {
      verifiedClaims++;
    }

    const recentClaims = [
      { id: 'claim-1', statement: 'Market trend is bullish', verified: true, confidence: 0.85, sources: ['market_data', 'sentiment_analysis'] },
      { id: 'claim-2', statement: 'User engagement increasing', verified: true, confidence: 0.9, sources: ['analytics', 'direct_feedback'] },
      { id: 'claim-3', statement: 'System performance optimal', verified: truthScore > 0.9, confidence: truthScore, sources: ['metrics', 'logs'] },
    ];

    dashboard.broadcastEvent({
      id: crypto.randomUUID(),
      type: 'grounding:update',
      timestamp: Date.now(),
      data: {
        truthScore,
        verifiedClaims,
        recentClaims,
        pendingVerification: 2 + Math.floor(Math.random() * 3),
        sourcesTrusted: 12,
        sourcesUntrusted: 1,
        lastGroundingCheck: Date.now(),
      },
    });
  }, 3500);

  console.log('📡 Broadcasting live metrics for all modules...');
  console.log('   - Active Inference (800ms)');
  console.log('   - Nociception (1500ms)');
  console.log('   - Allostasis (2000ms)');
  console.log('   - World Model (3000ms)');
  console.log('   - Daemon (2500ms)');
  console.log('   - Finance (1000ms)');
  console.log('   - Revenue (5000ms)');
  console.log('   - Content (4000ms)');
  console.log('   - Swarm (3000ms)');
  console.log('   - Healing (2000ms)');
  console.log('   - Grounding (3500ms)');
  console.log('   Press Ctrl+C to stop\n');
}

main().catch(console.error);
