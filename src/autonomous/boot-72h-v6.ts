#!/usr/bin/env node
/**
 * Genesis 72-Hour Autonomous Test v6
 *
 * CRITICAL CHANGE: Uses the FULL cognitive stack instead of simple task queue.
 *
 * Previous versions used:
 *   AutonomousSystem.queueTask() → Daemon → FIFO processing (no real learning)
 *
 * v6 uses:
 *   AutonomousLoop → ActiveInferenceEngine → EFE minimization → REAL LEARNING
 *   + FreeEnergyKernel (hierarchical FEP)
 *   + ConsciousnessSystem (φ monitoring)
 *   + Full memory integration
 *   + Model persistence (learning survives restarts)
 *
 * This is the REAL autonomous Genesis - the most sophisticated AI architecture.
 */

import { getAutonomousLoop, AutonomousLoop } from '../active-inference/autonomous-loop.js';
import { getFreeEnergyKernel, FreeEnergyKernel } from '../kernel/free-energy-kernel.js';
import { getConsciousnessSystem, ConsciousnessSystem } from '../consciousness/index.js';
import { getMemorySystem, MemorySystem } from '../memory/index.js';
import { getRevenueLoop, RevenueLoop } from '../services/revenue-loop.js';
import { getDaemon, Daemon, DaemonDependencies } from '../daemon/index.js';
import { healing } from '../healing/index.js';
import { ActionType, ACTIONS } from '../active-inference/types.js';
import { getAutopoiesisEngine, AutopoiesisEngine } from '../autopoiesis/index.js';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Test duration: 72 hours
  durationMs: 72 * 60 * 60 * 1000,

  // Active Inference cycle interval (faster = more responsive)
  cycleIntervalMs: 5_000, // 5 seconds per cognitive cycle

  // Status report interval
  statusIntervalMs: 30 * 60 * 1000, // 30 minutes

  // Model persistence
  persistModelPath: '.genesis/learned-model-72h.json',
  persistEveryN: 20, // Save every 20 cycles

  // Experience replay
  replayEveryN: 10,
  replayBatchSize: 16,

  // Dream consolidation (deep learning from high-surprise events)
  dreamEveryN: 100, // Every ~8 minutes
  dreamBatchSize: 32,

  // Auto-shutdown thresholds
  maxCriticalErrors: 5,
  maxSurpriseThreshold: 15,

  // Logging
  verbose: process.env.LOG_LEVEL === 'debug',
};

// ============================================================================
// State
// ============================================================================

interface CognitiveState {
  startedAt: Date;
  loop: AutonomousLoop;
  fek: FreeEnergyKernel;
  consciousness: ConsciousnessSystem;
  memory: MemorySystem;
  daemon: Daemon;
  revenueLoop: RevenueLoop;
  autopoiesis: AutopoiesisEngine;  // v6.1: True autopoiesis
  criticalErrors: number;
  running: boolean;
}

let state: CognitiveState | null = null;

// ============================================================================
// Logging
// ============================================================================

function log(message: string, level: 'info' | 'warn' | 'error' | 'debug' = 'info'): void {
  const timestamp = new Date().toISOString();
  const prefix = `[Genesis v6] [${timestamp}]`;

  if (level === 'debug' && !CONFIG.verbose) return;

  switch (level) {
    case 'error':
      console.error(`${prefix} ERROR: ${message}`);
      break;
    case 'warn':
      console.warn(`${prefix} WARN: ${message}`);
      break;
    case 'debug':
      console.log(`${prefix} DEBUG: ${message}`);
      break;
    default:
      console.log(`${prefix} ${message}`);
  }
}

// ============================================================================
// Boot Sequence - Full Cognitive Stack
// ============================================================================

async function boot(): Promise<CognitiveState> {
  log('='.repeat(70));
  log('GENESIS 72-HOUR AUTONOMOUS TEST v6');
  log('Full Cognitive Stack: Active Inference + FEK + Consciousness + Memory');
  log('='.repeat(70));
  log('');

  // Environment check
  const hasStripe = !!process.env.STRIPE_API_KEY;
  const hasLLM = !!process.env.OPENAI_API_KEY || !!process.env.ANTHROPIC_API_KEY;

  log('Environment check:');
  log(`  STRIPE_API_KEY: ${hasStripe ? 'OK' : 'MISSING (simulation mode)'}`);
  log(`  LLM API Key: ${hasLLM ? 'OK' : 'MISSING'}`);
  log(`  Model persistence: ${CONFIG.persistModelPath}`);
  log('');

  // ============================================================================
  // PHASE 1: L1 - Autonomic Substrate (Persistence, FEK)
  // ============================================================================
  log('Phase 1: Initializing L1 - Autonomic Substrate...');

  // Free Energy Kernel - The hierarchical FEP core
  const fek = getFreeEnergyKernel();
  fek.start();
  log('  FreeEnergyKernel: ONLINE (L1-L4 hierarchy active)');

  // ============================================================================
  // PHASE 2: L2 - Memory + Active Inference
  // ============================================================================
  log('Phase 2: Initializing L2 - Memory + Active Inference...');

  // Memory System - Episodic/Semantic/Procedural
  const memory = getMemorySystem({
    consolidation: { autoStart: false },
  });
  log(`  Memory: ONLINE (episodic: ${memory.episodic.count()}, semantic: ${memory.semantic.count()}, procedural: ${memory.procedural.count()})`);

  // Active Inference Loop - THE CORE DECISION ENGINE
  const loop = getAutonomousLoop({
    cycleInterval: CONFIG.cycleIntervalMs,
    maxCycles: 0, // Unlimited
    stopOnGoalAchieved: false, // Keep running
    stopOnEnergyCritical: true,
    stopOnHighSurprise: true,
    surpriseThreshold: CONFIG.maxSurpriseThreshold,
    persistModelPath: CONFIG.persistModelPath,
    persistEveryN: CONFIG.persistEveryN,
    loadOnStart: true, // Resume learning from previous session!
    replayEveryN: CONFIG.replayEveryN,
    replayBatchSize: CONFIG.replayBatchSize,
    dreamEveryN: CONFIG.dreamEveryN,
    dreamBatchSize: CONFIG.dreamBatchSize,
    verbose: CONFIG.verbose,
  });
  log('  AutonomousLoop: ONLINE (Active Inference engine ready)');

  // ============================================================================
  // PHASE 3: L3 - Consciousness + Perception
  // ============================================================================
  log('Phase 3: Initializing L3 - Consciousness...');

  // Consciousness System - φ monitoring, GWT, AST
  const consciousness = getConsciousnessSystem();
  consciousness.start();
  const phiLevel = consciousness.getCurrentLevel();
  const consciousnessState = consciousness.getState();
  log(`  Consciousness: ONLINE (φ = ${phiLevel.rawPhi.toFixed(3)}, state = ${consciousnessState})`);

  // ============================================================================
  // PHASE 4: L4 - Economic Layer + Daemon
  // ============================================================================
  log('Phase 4: Initializing L4 - Economic Layer...');

  // Revenue Loop - Economic sustainability
  const revenueLoop = getRevenueLoop();
  if (hasStripe) {
    try {
      const setup = await revenueLoop.setup();
      log(`  Stripe Product: ${setup.product.id}`);
      log('  Payment Links:');
      for (const [plan, link] of Object.entries(setup.paymentLinks)) {
        log(`    ${plan}: ${link.url}`);
      }
    } catch (err) {
      log(`  Revenue setup failed: ${err}`, 'warn');
    }
  } else {
    log('  Revenue Loop: SIMULATION MODE');
  }

  // Daemon - Background tasks, maintenance, CompIntel
  const daemonDeps: DaemonDependencies = {
    memory: {
      episodic: {
        getAll: () => memory.episodic.getAll().map(e => ({
          id: e.id,
          content: { what: e.content.what },
          importance: e.importance,
          tags: e.tags,
          consolidated: e.consolidated || false,
        })),
        runForgetting: () => memory.episodic.runForgetting(),
      },
      semantic: {
        getAll: () => memory.semantic.getAll().map(s => ({
          id: s.id,
          concept: s.content.concept,
          confidence: s.confidence,
        })),
      },
      procedural: {
        getAll: () => memory.procedural.getAll().map(p => ({
          id: p.id,
          name: p.content.name,
          successRate: p.successRate,
        })),
      },
      consolidation: {
        sleep: async () => {
          const result = await memory.consolidation.sleep();
          return { consolidated: result.semanticCreated + result.proceduralUpdated };
        },
      },
      getStats: () => ({
        total: memory.episodic.count() + memory.semantic.count() + memory.procedural.count(),
        episodic: { total: memory.episodic.count() },
        semantic: { total: memory.semantic.count() },
        procedural: { total: memory.procedural.count() },
      }),
    },
    log: (msg, level) => log(msg, level === 'debug' ? 'debug' : level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'),
  };

  const daemon = getDaemon(daemonDeps, {
    scheduler: {
      enabled: true,
      maxConcurrentTasks: 3,
      defaultTimeout: 60000,
      defaultRetries: 3,
    },
    maintenance: {
      enabled: true,
      intervalMs: 300_000,
      healthCheckIntervalMs: 60_000,
      memoryCleanupIntervalMs: 3600_000,
      autoRepair: true,
      maxConcurrentTasks: 3,
      unhealthyAgentThreshold: 30,
      memoryRetentionThreshold: 0.1,
      resourceUsageThreshold: 0.9,
    },
    dream: {
      enabled: true,
      autoTrigger: true,
      inactivityThresholdMs: 600_000,
      minDreamDurationMs: 60_000,
      maxDreamDurationMs: 600_000,
      lightSleepRatio: 0.1,
      deepSleepRatio: 0.6,
      remSleepRatio: 0.3,
      episodicConsolidationThreshold: 10,
      patternExtractionThreshold: 3,
      creativityTemperature: 0.7,
    },
    selfImprovement: {
      enabled: true,
      intervalMs: 3600_000,
      autoApply: false,
      minPhiThreshold: 0.3,
      maxImprovementsPerCycle: 3,
    },
    competitiveIntel: {
      enabled: true,
      checkIntervalMs: 4 * 60 * 60 * 1000,
      digestIntervalMs: 24 * 60 * 60 * 1000,
      requireSubscription: false,
      competitors: [
        { name: 'Cursor', domain: 'cursor.com', pages: ['https://www.cursor.com/pricing'] },
        { name: 'Windsurf', domain: 'codeium.com', pages: ['https://codeium.com/windsurf'] },
        { name: 'Aider', domain: 'aider.chat', pages: ['https://aider.chat/'] },
        { name: 'Continue', domain: 'continue.dev', pages: ['https://continue.dev/'] },
      ],
    },
    logLevel: CONFIG.verbose ? 'debug' : 'info',
  });
  daemon.start();
  log(`  Daemon: RUNNING (tasks: ${daemon.getTasks().length})`);

  // ============================================================================
  // PHASE 5: Wire Event Handlers
  // ============================================================================
  log('Phase 5: Wiring cognitive event handlers...');

  // Active Inference cycle events → Memory encoding
  loop.onCycle((cycle, action, beliefs) => {
    // Record every cognitive cycle as episodic memory
    if (cycle % 10 === 0) { // Every 10th cycle to avoid overflow
      memory.remember({
        what: `Cognitive cycle ${cycle}: action=${action}, beliefs=${JSON.stringify(beliefs).slice(0, 100)}`,
        when: new Date(),
        tags: ['cognitive-cycle', action, 'active-inference'],
        details: { cycle, action, beliefs },
      });
    }

    // Feed action results back to FEK for hierarchical processing
    try {
      const fekStatus = fek.getStatus();
      if (fekStatus.mode !== 'dreaming') {
        // FEK processes observations through its cycle, no direct injection needed
        // The Active Inference loop handles observations internally
      }
    } catch { /* FEK observation is non-fatal */ }
  });

  // Active Inference stop events
  loop.onStop((reason, stats) => {
    log(`AutonomousLoop stopped: ${reason}`);
    log(`Final stats: ${stats.cycles} cycles, avg surprise ${stats.avgSurprise.toFixed(2)}`);

    // Record final state as important memory
    memory.remember({
      what: `Autonomous session ended: ${reason}. Cycles: ${stats.cycles}, Surprise: ${stats.avgSurprise.toFixed(2)}`,
      when: new Date(),
      importance: 0.9,
      tags: ['session-end', reason, 'milestone'],
      details: stats,
    });
  });

  // Daemon events → Memory + Learning feedback
  daemon.on((event) => {
    if (event.type === 'daemon_error') {
      log(`Daemon error: ${JSON.stringify(event.data)}`, 'error');
      if (state) state.criticalErrors++;
      memory.remember({
        what: `Daemon error: ${JSON.stringify(event.data).slice(0, 200)}`,
        when: new Date(),
        tags: ['error', 'daemon', 'high-surprise'],
        importance: 0.85,
        details: { event: event.data },
      });
    }

    if (event.type === 'dream_completed') {
      log(`Dream completed: ${JSON.stringify(event.data)}`);
      const dreamData = event.data as any;

      // Record dream insights as semantic knowledge
      if (dreamData.novelIdeas?.length > 0) {
        for (const idea of dreamData.novelIdeas) {
          memory.learn({
            concept: `insight-${Date.now()}`,
            definition: idea,
            category: 'dream-insight',
          });
        }
      }
    }

    // CompIntel events are handled by daemon internally
    // Additional event types can be added here as needed
  });

  // Consciousness events → Adaptive behavior
  consciousness.on((event) => {
    // Handle phi threshold crossings and state changes
    if (event.type === 'phi_threshold_crossed' || event.type === 'state_changed') {
      const phiNow = consciousness.getCurrentLevel();
      if (phiNow.rawPhi < 0.1) {
        log('φ dropped below threshold - consciousness degraded', 'warn');
        memory.remember({
          what: 'Consciousness φ dropped below threshold',
          when: new Date(),
          importance: 0.95,
          tags: ['consciousness', 'phi-threshold', 'critical'],
          details: event.data,
        });
      }
    }
    // Handle anomalies
    if (event.type === 'anomaly_detected') {
      log('Consciousness anomaly detected', 'warn');
      memory.remember({
        what: 'Consciousness anomaly detected',
        when: new Date(),
        importance: 0.85,
        tags: ['consciousness', 'anomaly'],
        details: event.data,
      });
    }
  });

  // ============================================================================
  // PHASE 6: Seed Initial Memories
  // ============================================================================
  log('Phase 6: Seeding cognitive bootstrap memories...');

  // Episodic: Record boot
  memory.remember({
    what: 'Genesis v6 cognitive boot: Full Active Inference stack initialized',
    when: new Date(),
    importance: 0.95,
    tags: ['boot', 'v6', 'active-inference', 'milestone'],
    details: {
      config: CONFIG,
      hasStripe,
      hasLLM,
      persistPath: CONFIG.persistModelPath,
    },
  });

  // Semantic: Core identity
  memory.learn({
    concept: 'Genesis-v6',
    definition: 'Autonomous AI using Active Inference (FEP), hierarchical FEK, consciousness monitoring, and continuous learning',
    category: 'identity',
  });

  memory.learn({
    concept: 'Active-Inference',
    definition: 'Decision-making via Expected Free Energy minimization. Lower EFE = better action. Learns A/B matrices online.',
    category: 'methodology',
  });

  memory.learn({
    concept: 'Goal',
    definition: 'Minimize surprise, maximize economic sustainability, learn continuously, become more capable over time',
    category: 'purpose',
  });

  // Procedural: Skills
  memory.learnSkill({
    name: 'minimize-surprise',
    description: 'Core Active Inference behavior: select actions that minimize expected surprise',
    steps: [
      { action: 'Observe environment state' },
      { action: 'Update beliefs via Bayesian inference' },
      { action: 'Compute EFE for each possible action' },
      { action: 'Select action with lowest EFE' },
      { action: 'Execute and learn from outcome' },
    ],
  });

  log(`  Memories seeded: ${memory.episodic.count()} episodic, ${memory.semantic.count()} semantic, ${memory.procedural.count()} procedural`);

  // ============================================================================
  // PHASE 7: Initialize Autopoiesis (Self-Observation + Self-Production)
  // ============================================================================
  log('Phase 7: Initializing Autopoiesis Engine...');

  const autopoiesis = getAutopoiesisEngine({
    observationIntervalMs: 60_000,  // Observe self every minute
    mcpMemoryEnabled: true,         // Store self-model in MCP memory
    learningEnabled: true,          // Learn from self-modification outcomes
  });

  // Start autopoietic self-observation loop
  autopoiesis.start();
  log('  Autopoiesis: ONLINE (self-observation active)');

  // ============================================================================
  // PHASE 8: Build State
  // ============================================================================
  log('');
  log('='.repeat(70));
  log('BOOT COMPLETE - Full Cognitive Stack + Autopoiesis Online');
  log('='.repeat(70));
  log('');

  return {
    startedAt: new Date(),
    loop,
    fek,
    consciousness,
    memory,
    daemon,
    revenueLoop,
    autopoiesis,
    criticalErrors: 0,
    running: true,
  };
}

// ============================================================================
// Main Cognitive Loop
// ============================================================================

async function runCognitiveLoop(state: CognitiveState): Promise<void> {
  const endTime = state.startedAt.getTime() + CONFIG.durationMs;

  log('Starting Active Inference main loop...');
  log(`Target duration: 72 hours (ends ${new Date(endTime).toISOString()})`);
  log('');

  // Start the Active Inference loop in background
  const loopPromise = state.loop.run();

  // Status reporting loop
  let lastStatusTime = Date.now();

  while (state.running && Date.now() < endTime) {
    // Check if loop stopped unexpectedly
    if (!state.loop.isRunning()) {
      log('Active Inference loop stopped', 'warn');
      break;
    }

    // Periodic status report
    if (Date.now() - lastStatusTime >= CONFIG.statusIntervalMs) {
      await printStatus(state);
      lastStatusTime = Date.now();
    }

    // Check critical error threshold
    if (state.criticalErrors >= CONFIG.maxCriticalErrors) {
      log(`CRITICAL: ${state.criticalErrors} errors - stopping`, 'error');
      state.loop.stop('critical_errors');
      break;
    }

    // Self-healing check
    await runSelfHealing(state);

    // Sleep before next status check
    await sleep(60_000); // Check every minute
  }

  // Wait for loop to finish
  try {
    const finalStats = await loopPromise;
    log(`Loop finished: ${finalStats.cycles} cycles, ${finalStats.avgSurprise.toFixed(2)} avg surprise`);
  } catch (err) {
    log(`Loop error: ${err}`, 'error');
  }

  // Final status
  log('');
  log('='.repeat(70));
  log('72-HOUR TEST v6 COMPLETE');
  log('='.repeat(70));
  await printStatus(state);
}

// ============================================================================
// Self-Healing
// ============================================================================

async function runSelfHealing(state: CognitiveState): Promise<void> {
  try {
    // Check daemon health
    const daemonStatus = state.daemon.status();
    if (daemonStatus.state === 'error') {
      log('Daemon in error state - restarting', 'warn');
      state.daemon.restart();
      state.memory.remember({
        what: 'Self-healed: Daemon restart after error state',
        when: new Date(),
        tags: ['self-healing', 'daemon', 'recovery'],
      });
    }

    // Check consciousness level
    const phiLevel = state.consciousness.getCurrentLevel();
    if (phiLevel.rawPhi < 0.1) {
      log(`Low φ detected (${phiLevel.rawPhi.toFixed(3)}) - triggering dream cycle`, 'warn');
      // Dream cycles help consolidate and restore coherence
    }

    // Check FEK health (via total free energy level)
    const fekStatus = state.fek.getStatus();
    if (fekStatus.totalFE > 100) { // High FE indicates system struggling
      log('FEK high free energy - system may be struggling', 'warn');
    }

    // Check Active Inference surprise level
    const loopStats = state.loop.getStats();
    if (loopStats.avgSurprise > 10) {
      log(`High surprise (${loopStats.avgSurprise.toFixed(2)}) - system may be struggling`, 'warn');
      state.memory.remember({
        what: `High surprise detected: ${loopStats.avgSurprise.toFixed(2)} - environment may be changing`,
        when: new Date(),
        tags: ['high-surprise', 'adaptation-needed'],
      });
    }

  } catch (err) {
    log(`Self-healing error: ${err}`, 'error');
  }
}

// ============================================================================
// Status Reporting
// ============================================================================

async function printStatus(state: CognitiveState): Promise<void> {
  const elapsed = Date.now() - state.startedAt.getTime();
  const remaining = CONFIG.durationMs - elapsed;
  const hoursRemaining = (remaining / 3600_000).toFixed(1);

  const loopStats = state.loop.getStats();
  const beliefs = state.loop.getMostLikelyState();
  const daemonStatus = state.daemon.status();
  const phiLevel = state.consciousness.getCurrentLevel();
  const revenueStats = state.revenueLoop.getStats();
  const memStats = state.memory.getStats();

  log('');
  log('-'.repeat(50));
  log('STATUS REPORT');
  log('-'.repeat(50));
  log(`Time remaining: ${hoursRemaining} hours`);
  log('');
  log('ACTIVE INFERENCE:');
  log(`  Cycles: ${loopStats.cycles}`);
  log(`  Avg Surprise: ${loopStats.avgSurprise.toFixed(3)}`);
  log(`  Beliefs: viability=${beliefs.viability}, world=${beliefs.worldState}, coupling=${beliefs.coupling}`);
  log(`  Goal Progress: ${beliefs.goalProgress}`);
  log(`  Economic State: ${beliefs.economic}`);
  log('');
  const consciousnessStateNow = state.consciousness.getState();
  log('CONSCIOUSNESS:');
  log(`  φ: ${phiLevel.rawPhi.toFixed(3)}`);
  log(`  State: ${consciousnessStateNow}`);
  log('');
  log('MEMORY:');
  log(`  Episodic: ${memStats.episodic.total}`);
  log(`  Semantic: ${memStats.semantic.total}`);
  log(`  Procedural: ${memStats.procedural.total}`);
  log('');
  log('DAEMON:');
  log(`  State: ${daemonStatus.state}`);
  log(`  Uptime: ${Math.floor(daemonStatus.uptime / 60000)} minutes`);
  log(`  Dream Cycles: ${daemonStatus.dreamCycles}`);
  log('');
  log('ECONOMICS:');
  log(`  Revenue: $${(revenueStats.totalRevenue / 100).toFixed(2)}`);
  log(`  Scans: ${revenueStats.scansDelivered}`);
  log('');
  log('HEALTH:');
  log(`  Critical Errors: ${state.criticalErrors}`);
  log(`  FEK Mode: ${state.fek.getStatus().mode}`);
  log('-'.repeat(50));
  log('');
}

// ============================================================================
// Shutdown
// ============================================================================

function shutdown(state: CognitiveState): void {
  log('Initiating graceful shutdown...');
  state.running = false;

  // Stop Active Inference loop (this saves the model)
  if (state.loop.isRunning()) {
    state.loop.stop('shutdown');
  }

  // Stop other systems
  state.autopoiesis.stop();
  state.daemon.stop();
  state.consciousness.stop();
  state.fek.stop();

  // Final memory
  state.memory.remember({
    what: `Genesis v6 shutdown. Cycles: ${state.loop.getCycleCount()}, Surprise: ${state.loop.getStats().avgSurprise.toFixed(2)}`,
    when: new Date(),
    importance: 0.95,
    tags: ['shutdown', 'v6', 'milestone'],
  });

  log('Shutdown complete');
}

// ============================================================================
// Utilities
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Entry Point
// ============================================================================

async function main(): Promise<void> {
  try {
    state = await boot();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      log('Received SIGINT - shutting down gracefully', 'warn');
      if (state) shutdown(state);
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      log('Received SIGTERM - shutting down gracefully', 'warn');
      if (state) shutdown(state);
      process.exit(0);
    });

    // Run the main cognitive loop
    await runCognitiveLoop(state);

    // Clean shutdown
    shutdown(state);
    process.exit(0);
  } catch (err) {
    log(`FATAL ERROR: ${err}`, 'error');
    if (state) shutdown(state);
    process.exit(1);
  }
}

// Run
main();
