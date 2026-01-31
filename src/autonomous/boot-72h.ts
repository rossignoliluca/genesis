#!/usr/bin/env node
/**
 * Genesis 72-Hour Autonomous Test
 *
 * This script boots Genesis into fully autonomous mode:
 * - Self-funding via Stripe revenue loop
 * - Self-healing via error detection/fixing
 * - Self-maintaining via daemon tasks
 * - Self-improving via dream mode
 *
 * Required environment:
 * - STRIPE_API_KEY: Stripe secret key for revenue
 * - OPENAI_API_KEY or ANTHROPIC_API_KEY: LLM for reasoning
 *
 * Optional:
 * - GENESIS_PRIVATE_KEY: Base L2 wallet for x402 micropayments
 * - SLACK_WEBHOOK: Notifications
 *
 * Usage:
 *   npx tsx src/autonomous/boot-72h.ts
 *   node dist/src/autonomous/boot-72h.js
 */

import { getAutonomousSystem, AutonomousSystem, AutonomousTask } from './index.js';
import { getDaemon, Daemon, DaemonDependencies } from '../daemon/index.js';
import { getRevenueLoop, RevenueLoop } from '../services/revenue-loop.js';
import { healing } from '../healing/index.js';
import { getMemorySystem, MemorySystem } from '../memory/index.js';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Test duration: 72 hours
  durationMs: 72 * 60 * 60 * 1000,

  // Task processing interval
  taskIntervalMs: 30_000, // 30 seconds

  // Health check interval
  healthCheckMs: 60_000, // 1 minute

  // Revenue check interval
  revenueCheckMs: 300_000, // 5 minutes

  // Self-healing check interval
  healingCheckMs: 120_000, // 2 minutes

  // Auto-shutdown on critical errors
  maxCriticalErrors: 5,

  // Logging
  verbose: process.env.LOG_LEVEL === 'debug',
};

// ============================================================================
// State
// ============================================================================

interface TestState {
  startedAt: Date;
  autonomous: AutonomousSystem;
  daemon: Daemon;
  memory: MemorySystem;
  revenueLoop: RevenueLoop;
  criticalErrors: number;
  tasksCompleted: number;
  tasksQueued: number;
  revenueGenerated: number;
  selfHealingEvents: number;
  memoriesCreated: number;
  memoriesConsolidated: number;
  running: boolean;
}

let state: TestState | null = null;

// ============================================================================
// Logging
// ============================================================================

function log(message: string, level: 'info' | 'warn' | 'error' | 'debug' = 'info'): void {
  const timestamp = new Date().toISOString();
  const prefix = `[Genesis 72h] [${timestamp}]`;

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
// Boot Sequence
// ============================================================================

async function boot(): Promise<TestState> {
  log('='.repeat(60));
  log('GENESIS 72-HOUR AUTONOMOUS TEST');
  log('='.repeat(60));
  log('');

  // Check required environment
  const hasStripe = !!process.env.STRIPE_API_KEY;
  const hasLLM = !!process.env.OPENAI_API_KEY || !!process.env.ANTHROPIC_API_KEY;

  log(`Environment check:`);
  log(`  STRIPE_API_KEY: ${hasStripe ? 'OK' : 'MISSING'}`);
  log(`  LLM API Key: ${hasLLM ? 'OK' : 'MISSING'}`);
  log(`  GENESIS_PRIVATE_KEY: ${process.env.GENESIS_PRIVATE_KEY ? 'OK' : 'not set'}`);
  log(`  SLACK_WEBHOOK: ${process.env.SLACK_WEBHOOK ? 'OK' : 'not set'}`);
  log('');

  if (!hasStripe) {
    log('WARNING: No STRIPE_API_KEY - revenue loop will run in simulation mode', 'warn');
  }

  // Initialize Autonomous System
  log('Phase 1: Initializing Autonomous System...');
  const autonomous = getAutonomousSystem({
    enableEconomy: true,
    enableDeployment: true,
    enableProductionMemory: true,
    enableGovernance: true,
    slackWebhook: process.env.SLACK_WEBHOOK,
    budgetLimits: {
      dailyUSD: 100, // $100/day max
      perTransactionUSD: 50,
      monthlyUSD: 1000,
    },
  });
  await autonomous.initialize();
  log('  Autonomous System: ONLINE');

  // Initialize Revenue Loop
  log('Phase 2: Initializing Revenue Loop...');
  const revenueLoop = getRevenueLoop();
  if (hasStripe) {
    try {
      const setup = await revenueLoop.setup();
      log(`  Stripe Product: ${setup.product.id}`);
      log(`  Payment Links:`);
      for (const [plan, link] of Object.entries(setup.paymentLinks)) {
        log(`    ${plan}: ${link.url}`);
      }
    } catch (err) {
      log(`  Revenue setup failed: ${err}`, 'warn');
    }
  } else {
    log('  Revenue Loop: SIMULATION MODE');
  }

  // Initialize Memory System (CRITICAL: Must be before daemon for dream consolidation!)
  log('Phase 3: Initializing Memory System...');
  const memory = getMemorySystem({
    consolidation: {
      autoStart: false, // We'll trigger via daemon
    },
  });
  log(`  Memory System: ONLINE (episodic: ${memory.episodic.count()}, semantic: ${memory.semantic.count()}, procedural: ${memory.procedural.count()})`);

  // Build daemon dependencies with memory wired
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

  // Initialize Daemon WITH memory dependencies
  log('Phase 4: Initializing Daemon...');
  const daemon = getDaemon(daemonDeps, {
    scheduler: {
      enabled: true,
      maxConcurrentTasks: 3,
      defaultTimeout: 60000,
      defaultRetries: 3
    },
    maintenance: {
      enabled: true,
      intervalMs: 300_000,
      healthCheckIntervalMs: CONFIG.healthCheckMs,
      memoryCleanupIntervalMs: 3600_000,
      autoRepair: true,
      maxConcurrentTasks: 2,
      unhealthyAgentThreshold: 30,
      memoryRetentionThreshold: 0.1,
      resourceUsageThreshold: 0.9
    },
    dream: {
      enabled: true,
      autoTrigger: true,
      inactivityThresholdMs: 300_000,
      minDreamDurationMs: 60_000,
      maxDreamDurationMs: 600_000,
      lightSleepRatio: 0.1,
      deepSleepRatio: 0.6,
      remSleepRatio: 0.3,
      episodicConsolidationThreshold: 10,
      patternExtractionThreshold: 3,
      creativityTemperature: 0.7
    },
    selfImprovement: {
      enabled: true,
      intervalMs: 3600_000,
      autoApply: false,
      minPhiThreshold: 0.3,
      maxImprovementsPerCycle: 3
    },
    competitiveIntel: {
      enabled: true,
      checkIntervalMs: 4 * 60 * 60 * 1000, // 4 hours
      digestIntervalMs: 24 * 60 * 60 * 1000,
      competitors: [
        { name: 'Cursor', domain: 'cursor.com', pages: ['https://www.cursor.com/pricing', 'https://www.cursor.com/features'] },
        { name: 'Windsurf', domain: 'codeium.com', pages: ['https://codeium.com/windsurf', 'https://codeium.com/pricing'] },
        { name: 'Aider', domain: 'aider.chat', pages: ['https://aider.chat/', 'https://aider.chat/docs/usage.html'] },
        { name: 'Continue', domain: 'continue.dev', pages: ['https://continue.dev/', 'https://docs.continue.dev/'] },
      ],
      requireSubscription: false, // Free for now
    },
    logLevel: CONFIG.verbose ? 'debug' : 'info',
  });
  daemon.start();
  log('  Daemon: RUNNING');
  log(`  Tasks scheduled: ${daemon.getTasks().length}`);

  // Wire up events
  log('Phase 5: Wiring event handlers...');
  daemon.on((event) => {
    if (event.type === 'daemon_error') {
      log(`Daemon error: ${JSON.stringify(event.data)}`, 'error');
      if (state) state.criticalErrors++;
      // Record errors as episodic memories for learning
      memory.remember({
        what: `Daemon error occurred: ${JSON.stringify(event.data).slice(0, 200)}`,
        when: new Date(),
        tags: ['error', 'daemon', 'needs-learning'],
        details: { event: event.data, severity: 'error' },
      });
    }
    if (event.type === 'task_completed') {
      log(`Task completed: ${JSON.stringify(event.data)}`, 'debug');
      if (state) state.tasksCompleted++;
      // Record task completions as episodic memories for consolidation
      const taskData = event.data as any;
      memory.remember({
        what: `Task ${taskData.type || 'unknown'} completed: ${taskData.description || 'no description'}`,
        when: new Date(),
        tags: ['task', 'completed', taskData.type || 'generic'],
        details: { result: taskData.result, status: taskData.status },
      });
      if (state) state.memoriesCreated++;
    }
    if (event.type === 'dream_completed') {
      log(`Dream session completed: ${JSON.stringify(event.data)}`);
      // Record dream insights as semantic knowledge
      const dreamData = event.data as any;
      if (dreamData.novelIdeas?.length > 0) {
        for (const idea of dreamData.novelIdeas) {
          memory.learn({
            concept: `insight-${Date.now()}`,
            definition: idea,
            category: 'dream-insight',
          });
        }
      }
      if (dreamData.memoriesConsolidated > 0 && state) {
        state.memoriesConsolidated += dreamData.memoriesConsolidated;
      }
    }
    if (event.type === 'maintenance_completed') {
      // Record maintenance as episodic experience
      const maintData = event.data as any;
      if (maintData.issues > 0) {
        memory.remember({
          what: `Maintenance cycle: ${maintData.issues} issues detected, ${maintData.actions} actions taken`,
          when: new Date(),
          tags: ['maintenance', 'self-healing', maintData.issues > 0 ? 'had-issues' : 'healthy'],
          details: { issues: maintData.issues, actions: maintData.actions },
        });
      }
    }
  });
  log('  Event handlers: CONNECTED');

  // Seed initial memories for dream consolidation
  log('Phase 6: Seeding initial memories...');

  // Episodic: Record the boot event
  memory.remember({
    what: 'Genesis 72h autonomous test boot sequence completed',
    when: new Date(),
    tags: ['boot', 'autonomous', 'milestone'],
    details: {
      phase: 'initialization',
      status: 'success',
      config: { economyEnabled: true, dreamEnabled: true, compIntelEnabled: true },
    },
  });

  // Episodic: Record environment state
  memory.remember({
    what: `Environment: Stripe=${hasStripe ? 'active' : 'test'}, LLM=${hasLLM ? 'active' : 'missing'}`,
    when: new Date(),
    tags: ['environment', 'configuration', 'autonomous'],
    details: { stripeActive: hasStripe, llmActive: hasLLM },
  });

  // Semantic: Core knowledge about self
  memory.learn({
    concept: 'Genesis',
    definition: 'An autonomous AI agent with Active Inference, competitive intelligence, and self-improvement capabilities',
    category: 'identity',
  });

  memory.learn({
    concept: 'CompIntel',
    definition: 'Competitive Intelligence service that monitors Cursor, Windsurf, Aider, Continue for pricing and feature changes',
    category: 'capability',
  });

  // Procedural: Skills
  memory.learnSkill({
    name: 'self-monitor',
    description: 'Monitor own health, memory, and performance metrics',
    steps: [
      { action: 'Check daemon health status' },
      { action: 'Run maintenance cycle if issues detected' },
      { action: 'Log results for pattern analysis' },
    ],
  });

  memory.learnSkill({
    name: 'competitive-scan',
    description: 'Scan competitor websites for changes and generate insights',
    steps: [
      { action: 'Fetch competitor pages via Firecrawl MCP' },
      { action: 'Compare content hashes with baseline' },
      { action: 'Analyze changes via LLM for strategic insights' },
      { action: 'Generate digest with recommendations' },
    ],
  });

  log(`  Memories seeded: ${memory.episodic.count()} episodic, ${memory.semantic.count()} semantic, ${memory.procedural.count()} procedural`);

  // Create initial tasks
  log('Phase 7: Queueing initial tasks...');

  // Revenue check task
  autonomous.queueTask({
    type: 'earn',
    description: 'Initialize revenue loop and setup Stripe products',
    priority: 'high',
  });

  // Memory task: record start
  autonomous.queueTask({
    type: 'remember',
    description: `Genesis 72h autonomous test started at ${new Date().toISOString()}`,
    priority: 'normal',
  });

  // Self-announcement task
  autonomous.queueTask({
    type: 'collaborate',
    description: 'Announce self to A2A network',
    priority: 'low',
  });

  log('  Initial tasks queued: 3');

  // Build state
  const testState: TestState = {
    startedAt: new Date(),
    autonomous,
    daemon,
    memory,
    revenueLoop,
    criticalErrors: 0,
    tasksCompleted: 0,
    tasksQueued: 3,
    revenueGenerated: 0,
    selfHealingEvents: 0,
    memoriesCreated: 0,
    memoriesConsolidated: 0,
    running: true,
  };

  log('');
  log('='.repeat(60));
  log('BOOT COMPLETE - Entering autonomous loop');
  log('='.repeat(60));
  log('');

  return testState;
}

// ============================================================================
// Main Loop
// ============================================================================

async function runLoop(state: TestState): Promise<void> {
  const endTime = state.startedAt.getTime() + CONFIG.durationMs;

  while (state.running && Date.now() < endTime) {
    const elapsed = Date.now() - state.startedAt.getTime();
    const remaining = endTime - Date.now();
    const hoursRemaining = (remaining / 3600_000).toFixed(1);

    // Process next task
    const task = await state.autonomous.processNextTask();
    if (task) {
      log(`Processed task: ${task.type} (${task.status})`);
      if (task.status === 'failed') {
        log(`  Error: ${task.error}`, 'warn');
        // Record failed task as learning experience
        state.memory.remember({
          what: `Task ${task.type} FAILED: ${task.error || 'unknown error'}`,
          when: new Date(),
          tags: ['task', 'failed', task.type, 'needs-learning'],
          details: { task, error: task.error },
        });
      } else {
        // Record successful task completion for dream consolidation
        const duration = task.completed && task.started ?
          new Date(task.completed).getTime() - new Date(task.started).getTime() : 0;
        state.memory.remember({
          what: `Completed ${task.type} task: ${task.description?.slice(0, 100) || 'no description'}`,
          when: new Date(),
          tags: ['task', 'completed', task.type, 'experience'],
          details: { result: task.result, duration },
        });
        state.memoriesCreated++;

        // PROCEDURAL LEARNING: Create or update skill based on task execution
        // This enables Genesis to learn HOW to do things, not just remember THAT it did them
        const skillName = `skill:${task.type}`;
        const existingSkill = state.memory.procedural.getAll().find(s => s.content.name === skillName);
        if (existingSkill) {
          // Update existing skill with execution result
          state.memory.procedural.recordExecution(existingSkill.id, {
            success: true,
            duration,
          });
          log(`Skill updated: ${skillName} (execution recorded)`, 'debug');
        } else {
          // Create new skill from successful task
          state.memory.learnSkill({
            name: skillName,
            description: `Learned procedure for ${task.type} tasks`,
            steps: [
              { action: `Process ${task.type} request` },
              { action: `Execute ${task.type} logic` },
              { action: `Return ${task.type} result` },
            ],
            importance: 0.7,
            tags: ['auto-learned', task.type],
          });
          log(`New skill learned: ${skillName}`, 'debug');
        }
      }
      state.tasksCompleted++;
    }

    // Periodic status report (every hour)
    if (Math.floor(elapsed / 3600_000) !== Math.floor((elapsed - CONFIG.taskIntervalMs) / 3600_000)) {
      await printStatus(state, hoursRemaining);
    }

    // Self-healing check
    if (elapsed % CONFIG.healingCheckMs < CONFIG.taskIntervalMs) {
      await runSelfHealing(state);
    }

    // Revenue check
    if (elapsed % CONFIG.revenueCheckMs < CONFIG.taskIntervalMs) {
      const stats = state.revenueLoop.getStats();
      state.revenueGenerated = stats.totalRevenue;
      log(`Revenue check: $${(stats.totalRevenue / 100).toFixed(2)} generated`, 'debug');
    }

    // LEARNING→BEHAVIOR FEEDBACK: Apply insights from dreams to decisions
    // This runs every 30 minutes to check what Genesis has learned and act on it
    const insightCheckIntervalMs = 30 * 60 * 1000; // 30 minutes
    if (elapsed % insightCheckIntervalMs < CONFIG.taskIntervalMs) {
      await applyLearnedInsights(state);
    }

    // Check for critical error threshold
    if (state.criticalErrors >= CONFIG.maxCriticalErrors) {
      log(`CRITICAL: ${state.criticalErrors} errors - initiating emergency stop`, 'error');
      state.autonomous.emergencyStop('Too many critical errors');
      state.running = false;
      break;
    }

    // Wait before next iteration
    await sleep(CONFIG.taskIntervalMs);
  }

  // Final status
  log('');
  log('='.repeat(60));
  log('72-HOUR TEST COMPLETE');
  log('='.repeat(60));
  await printStatus(state, '0');
}

// ============================================================================
// Self-Healing
// ============================================================================

async function runSelfHealing(state: TestState): Promise<void> {
  try {
    // Check daemon status
    const status = state.daemon.status();
    if (status.state === 'error') {
      log('Daemon in error state - attempting restart', 'warn');
      state.daemon.restart();
      state.selfHealingEvents++;
      // Record self-healing as experience
      state.memory.remember({
        what: 'Self-healed: Daemon was in error state, performed restart',
        when: new Date(),
        tags: ['self-healing', 'daemon', 'restart', 'recovery'],
        details: { previousState: 'error', action: 'restart' },
      });
    }

    // Check for maintenance issues
    const issues = state.daemon.getMaintenanceIssues();
    if (issues.length > 0) {
      log(`Found ${issues.length} maintenance issues`, 'debug');
      for (const issue of issues) {
        // MaintenanceIssue has: type, severity, description, detected, resolved, resolution
        if (!issue.resolved && issue.severity !== 'info') {
          log(`  Processing issue: ${issue.type} - ${issue.description}`, 'debug');
          // Run auto-fix on the description
          await healing.autoFix(issue.description || '');
          state.selfHealingEvents++;
          // Record maintenance issue handling
          state.memory.remember({
            what: `Self-healed: Fixed ${issue.type} issue - ${issue.description?.slice(0, 100)}`,
            when: new Date(),
            tags: ['self-healing', 'maintenance', issue.type, issue.severity],
            details: { issue: { type: issue.type, severity: issue.severity, description: issue.description } },
          });
        }
      }
    }

    // Check autonomous system health
    const autonomousStatus = await state.autonomous.getStatus();
    if (autonomousStatus.health === 'critical') {
      log('Autonomous system in critical state', 'error');
      state.criticalErrors++;
      // Record critical state for learning
      state.memory.remember({
        what: 'WARNING: Autonomous system entered critical health state',
        when: new Date(),
        tags: ['health', 'critical', 'autonomous', 'alert'],
        details: { health: 'critical', status: autonomousStatus },
      });
    } else if (autonomousStatus.health === 'degraded') {
      log('Autonomous system degraded - queueing maintenance', 'warn');
      state.autonomous.queueTask({
        type: 'custom',
        description: 'Run maintenance cycle',
        priority: 'high',
      });
    }
  } catch (err) {
    log(`Self-healing error: ${err}`, 'error');
  }
}

// ============================================================================
// Status Reporting
// ============================================================================

async function printStatus(state: TestState, hoursRemaining: string): Promise<void> {
  const status = await state.autonomous.getStatus();
  const daemonStatus = state.daemon.status();
  const revenueStats = state.revenueLoop.getStats();

  log('');
  log('-'.repeat(40));
  log('STATUS REPORT');
  log('-'.repeat(40));
  log(`Time remaining: ${hoursRemaining} hours`);
  log(`Health: ${status.health.toUpperCase()}`);
  log(`Tasks completed: ${state.tasksCompleted}`);
  log(`Tasks pending: ${status.pendingActions}`);
  log(`Revenue: $${(revenueStats.totalRevenue / 100).toFixed(2)}`);
  log(`Scans delivered: ${revenueStats.scansDelivered}`);
  log(`Self-healing events: ${state.selfHealingEvents}`);
  log(`Critical errors: ${state.criticalErrors}`);
  log(`Daemon uptime: ${Math.floor(daemonStatus.uptime / 60000)} minutes`);
  log(`Dream cycles: ${daemonStatus.dreamCycles}`);
  log('-'.repeat(40));
  log('');
}

// ============================================================================
// Learning → Behavior Feedback
// ============================================================================

/**
 * Apply learned insights from dreams to autonomous behavior.
 * This closes the learning loop: Dreams extract patterns, insights inform actions.
 */
async function applyLearnedInsights(state: TestState): Promise<void> {
  try {
    // Get all semantic knowledge (includes dream-generated insights)
    const semanticMemories = state.memory.semantic.getAll();
    const dreamInsights = semanticMemories.filter(s => s.category === 'dream-insight');
    const skills = state.memory.procedural.getAll();

    log(`Applying learned insights: ${dreamInsights.length} insights, ${skills.length} skills`, 'debug');

    // 1. ANALYZE DREAM INSIGHTS for actionable patterns
    for (const insight of dreamInsights) {
      const definition = (insight.content.definition || '').toLowerCase();

      // If insight mentions CompIntel, prioritize competitive scanning
      if (definition.includes('compintel') && definition.includes('relates')) {
        // Check if we've recently queued a CompIntel task
        const status = await state.autonomous.getStatus();
        if (status.pendingActions < 5) { // Don't overload queue
          log(`Insight-driven action: Queueing CompIntel scan based on learned association`, 'info');
          state.autonomous.queueTask({
            type: 'earn',
            description: 'Run CompIntel scan based on learned pattern',
            priority: 'normal',
          });
          // Record that we acted on this insight
          state.memory.remember({
            what: `Acted on insight: "${insight.content.definition}" - queued CompIntel scan`,
            when: new Date(),
            tags: ['insight-action', 'feedback-loop', 'compintel'],
            details: { insightId: insight.id, action: 'queue-compintel' },
          });
        }
      }

      // If insight mentions task patterns, consider optimizing task processing
      if (definition.includes('task') && definition.includes('pattern')) {
        log(`Learned task pattern: ${insight.content.definition}`, 'debug');
        // Record pattern recognition for future optimization
        state.memory.remember({
          what: `Pattern recognized: ${insight.content.definition}`,
          when: new Date(),
          tags: ['pattern', 'task-optimization', 'meta-learning'],
          details: { insightId: insight.id },
        });
      }
    }

    // 2. APPLY PROCEDURAL KNOWLEDGE - Use skills with high success rates
    const highSuccessSkills = skills.filter(s => s.successRate > 0.8);
    if (highSuccessSkills.length > 0) {
      log(`High-confidence skills available: ${highSuccessSkills.map(s => s.content.name).join(', ')}`, 'debug');
    }

    // 3. IDENTIFY SKILL GAPS - What task types have low success?
    const lowSuccessSkills = skills.filter(s => s.successRate < 0.5 && s.executionCount > 2);
    for (const skill of lowSuccessSkills) {
      log(`Skill gap identified: ${skill.content.name} (${(skill.successRate * 100).toFixed(1)}% success)`, 'warn');
      // Record for dream consolidation to focus on improving this
      state.memory.remember({
        what: `Skill needs improvement: ${skill.content.name} - only ${(skill.successRate * 100).toFixed(1)}% success rate`,
        when: new Date(),
        tags: ['skill-gap', 'needs-practice', skill.content.name],
        details: { skillId: skill.id, successRate: skill.successRate },
      });
    }

    // 4. META-LEARNING: Track how insights affect behavior over time
    const memoryStats = {
      totalEpisodic: state.memory.episodic.count(),
      totalSemantic: state.memory.semantic.count(),
      totalProcedural: state.memory.procedural.count(),
      dreamInsights: dreamInsights.length,
      highConfidenceSkills: highSuccessSkills.length,
    };
    log(`Memory state: ${JSON.stringify(memoryStats)}`, 'debug');

  } catch (err) {
    log(`Insight application error: ${err}`, 'error');
  }
}

// ============================================================================
// Shutdown
// ============================================================================

function shutdown(state: TestState): void {
  log('Initiating shutdown...');
  state.running = false;

  // Stop daemon
  state.daemon.stop();

  // Record final memory
  state.autonomous.remember({
    content: `Genesis 72h test ended. Tasks: ${state.tasksCompleted}, Revenue: $${(state.revenueGenerated / 100).toFixed(2)}, Errors: ${state.criticalErrors}`,
    type: 'episodic',
    importance: 0.95,
    tags: ['test', '72h', 'summary'],
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

    // Run the main loop
    await runLoop(state);

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
