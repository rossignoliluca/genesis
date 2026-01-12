/**
 * Genesis - Daemon with MCP Tool Integration
 *
 * Demo: Background daemon that schedules tasks using real MCP tools.
 * - Scheduled web searches for research updates
 * - Knowledge graph maintenance tasks
 * - File system monitoring tasks
 * - Dream mode with memory consolidation
 */

// Load .env file before any other imports
import dotenv from 'dotenv';
dotenv.config();

import { createDaemon, Daemon, CreateTaskOptions, TaskContext } from './src/daemon/index.js';
import { getMCPClient, logMCPMode } from './src/mcp/index.js';
import { getDispatcher, executeTool as dispatcherExecuteTool, ToolResult } from './src/cli/dispatcher.js';
import { LLMBridge, createLLMBridge } from './src/llm/index.js';

// ============================================================================
// Configuration
// ============================================================================

const LLM_CONFIG = {
  provider: 'anthropic' as const,
  model: 'claude-sonnet-4-20250514',
  maxTokens: 2048,
};

// ============================================================================
// MCP-Enabled Task Context
// ============================================================================

interface MCPTaskContext extends TaskContext {
  llm: LLMBridge;
  executeTool: (name: string, params: Record<string, unknown>) => Promise<ToolResult>;
}

// ============================================================================
// Tool Execution Helper
// ============================================================================

async function executeToolCall(
  toolName: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  return dispatcherExecuteTool(toolName, params);
}

// ============================================================================
// MCP-Enabled Tasks
// ============================================================================

/**
 * Task: Research Update
 * Periodically searches for updates on configured topics
 */
function createResearchTask(topic: string): CreateTaskOptions {
  return {
    name: `research-${topic.toLowerCase().replace(/\s+/g, '-')}`,
    description: `Search for latest updates on: ${topic}`,
    schedule: { type: 'interval', intervalMs: 300000 }, // Every 5 minutes
    priority: 'normal',
    tags: ['research', 'mcp', 'web-search'],
    handler: async (ctx) => {
      const mcpCtx = ctx as MCPTaskContext;
      const startTime = Date.now();

      ctx.logger.info(`Researching: ${topic}`);

      // Execute web search
      const searchResult = await mcpCtx.executeTool('brave_web_search', {
        query: `${topic} latest news 2025`,
        count: 5,
      });

      const duration = Date.now() - startTime;

      return {
        success: searchResult.success,
        duration,
        output: { topic, results: searchResult.data },
        metrics: { searchDuration: duration },
      };
    },
  };
}

/**
 * Task: Knowledge Graph Sync
 * Periodically syncs and maintains the knowledge graph
 */
function createKnowledgeGraphTask(): CreateTaskOptions {
  return {
    name: 'knowledge-graph-sync',
    description: 'Sync and maintain knowledge graph entries',
    schedule: { type: 'interval', intervalMs: 600000 }, // Every 10 minutes
    priority: 'low',
    tags: ['memory', 'mcp', 'knowledge-graph'],
    handler: async (ctx) => {
      const mcpCtx = ctx as MCPTaskContext;
      const startTime = Date.now();

      ctx.logger.info('Syncing knowledge graph...');

      // Read current graph
      const graphResult = await mcpCtx.executeTool('read_graph', {});

      // Search for orphaned nodes
      const searchResult = await mcpCtx.executeTool('search_nodes', {
        query: 'genesis daemon mcp',
      });

      const duration = Date.now() - startTime;

      return {
        success: graphResult.success && searchResult.success,
        duration,
        output: { graph: graphResult.data, search: searchResult.data },
        metrics: { syncDuration: duration },
      };
    },
  };
}

/**
 * Task: File System Monitor
 * Monitors project files for changes
 */
function createFileMonitorTask(directory: string): CreateTaskOptions {
  return {
    name: 'file-monitor',
    description: `Monitor files in: ${directory}`,
    schedule: { type: 'interval', intervalMs: 120000 }, // Every 2 minutes
    priority: 'low',
    tags: ['filesystem', 'mcp', 'monitor'],
    handler: async (ctx) => {
      const mcpCtx = ctx as MCPTaskContext;
      const startTime = Date.now();

      ctx.logger.info(`Monitoring: ${directory}`);

      // List directory contents
      const listResult = await mcpCtx.executeTool('list_directory', {
        path: directory,
      });

      const duration = Date.now() - startTime;

      return {
        success: listResult.success,
        duration,
        output: { directory, contents: listResult.data },
        metrics: { scanDuration: duration },
      };
    },
  };
}

/**
 * Task: LLM-Driven Research
 * Uses LLM to decide what to research and execute searches
 */
function createLLMResearchTask(): CreateTaskOptions {
  return {
    name: 'llm-research',
    description: 'LLM-driven autonomous research',
    schedule: { type: 'interval', intervalMs: 900000 }, // Every 15 minutes
    priority: 'normal',
    tags: ['llm', 'research', 'autonomous'],
    handler: async (ctx) => {
      const mcpCtx = ctx as MCPTaskContext;
      const startTime = Date.now();

      ctx.logger.info('Starting LLM-driven research...');

      // Ask LLM what to research
      const systemPrompt = `You are a research assistant daemon. Your job is to identify interesting topics to research.
Output a JSON object with: { "topic": "...", "queries": ["query1", "query2"] }
Focus on AI, technology, and science topics. Return ONLY the JSON object, no other text.`;

      const response = await mcpCtx.llm.chat(
        'What should we research next? Pick something interesting and current.',
        systemPrompt
      );

      ctx.logger.info(`LLM response: ${response.content.slice(0, 200)}...`);

      // Parse LLM response
      let researchPlan: { topic: string; queries: string[] };
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in response');
        researchPlan = JSON.parse(jsonMatch[0]);
      } catch (err) {
        ctx.logger.info(`Parse error: ${err}`);
        return { success: false, duration: Date.now() - startTime, error: new Error('Failed to parse research plan') };
      }

      ctx.logger.info(`Researching: ${researchPlan.topic}`);

      // Execute searches
      const results: ToolResult[] = [];
      for (const query of researchPlan.queries.slice(0, 2)) {
        const result = await mcpCtx.executeTool('brave_web_search', {
          query,
          count: 3,
        });
        results.push(result);
      }

      // Store findings in knowledge graph
      await mcpCtx.executeTool('create_entities', {
        entities: [
          {
            name: `Research_${Date.now()}`,
            entityType: 'ResearchSession',
            observations: [
              `Topic: ${researchPlan.topic}`,
              `Queries: ${researchPlan.queries.join(', ')}`,
              `Timestamp: ${new Date().toISOString()}`,
            ],
          },
        ],
      });

      const duration = Date.now() - startTime;

      return {
        success: results.every(r => r.success),
        duration,
        output: { topic: researchPlan.topic, results: results.map(r => r.data) },
        metrics: {
          queriesExecuted: researchPlan.queries.length,
          researchDuration: duration,
        },
      };
    },
  };
}

// ============================================================================
// Enhanced Daemon Factory
// ============================================================================

async function createMCPDaemon(): Promise<{
  daemon: Daemon;
  shutdown: () => Promise<void>;
}> {
  // Initialize MCP client (singleton)
  const mcp = getMCPClient();

  // Initialize tool dispatcher (singleton with verbose logging)
  const dispatcher = getDispatcher({ verbose: true });

  // Initialize LLM client
  const llm = createLLMBridge({
    provider: LLM_CONFIG.provider,
    model: LLM_CONFIG.model,
    maxTokens: LLM_CONFIG.maxTokens,
  });

  // Tool execution helper using dispatcher
  const executeTool = async (name: string, params: Record<string, unknown>): Promise<ToolResult> => {
    return executeToolCall(name, params);
  };

  // Create daemon with custom context
  const daemon = createDaemon(
    {
      log: (message, level) => {
        const prefix = '[Daemon]';
        if (level === 'error') console.error(`${prefix} ${message}`);
        else if (level === 'warn') console.warn(`${prefix} ${message}`);
        else console.log(`${prefix} ${message}`);
      },
    },
    {
      enabled: true,
      heartbeatIntervalMs: 10000, // 10 seconds for demo
      logLevel: 'info',
      scheduler: {
        enabled: true,
        maxConcurrentTasks: 3,
        defaultTimeout: 60000,
        defaultRetries: 2,
      },
      maintenance: {
        enabled: true,
        intervalMs: 60000, // 1 minute for demo
        healthCheckIntervalMs: 30000,
        memoryCleanupIntervalMs: 120000,
        autoRepair: true,
        maxConcurrentTasks: 2,
        unhealthyAgentThreshold: 30,
        memoryRetentionThreshold: 0.1,
        resourceUsageThreshold: 0.9,
      },
      dream: {
        enabled: true,
        autoTrigger: false, // Manual for demo
        inactivityThresholdMs: 60000,
        minDreamDurationMs: 5000,
        maxDreamDurationMs: 30000,
        lightSleepRatio: 0.2,
        deepSleepRatio: 0.5,
        remSleepRatio: 0.3,
        episodicConsolidationThreshold: 5,
        patternExtractionThreshold: 2,
        creativityTemperature: 0.8,
      },
    }
  );

  // Monkey-patch task handlers to inject MCP context
  const originalSchedule = daemon.schedule.bind(daemon);
  daemon.schedule = (options: CreateTaskOptions) => {
    const originalHandler = options.handler;
    options.handler = async (ctx: TaskContext) => {
      // Inject MCP context
      const mcpCtx = ctx as MCPTaskContext;
      mcpCtx.llm = llm;
      mcpCtx.executeTool = executeTool;
      return originalHandler(mcpCtx);
    };
    return originalSchedule(options);
  };

  // Shutdown helper
  const shutdown = async () => {
    daemon.stop();
    await mcp.close();
  };

  return { daemon, shutdown };
}

// ============================================================================
// Demo Runner
// ============================================================================

async function runDemo() {
  console.log(`
════════════════════════════════════════════════════════════
  GENESIS - Daemon with MCP Tool Integration
════════════════════════════════════════════════════════════
`);

  console.log('LLM Configuration:');
  console.log(`  Provider: ${LLM_CONFIG.provider}`);
  console.log(`  Model: ${LLM_CONFIG.model}`);
  console.log('');

  // Create MCP-enabled daemon
  console.log('Initializing MCP Daemon...');
  logMCPMode();
  const { daemon, shutdown } = await createMCPDaemon();

  // Setup event logging
  daemon.on((event) => {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    switch (event.type) {
      case 'daemon_started':
        console.log(`\n[${timestamp}] Daemon started`);
        break;
      case 'daemon_stopped':
        console.log(`\n[${timestamp}] Daemon stopped`);
        break;
      case 'task_started':
        console.log(`\n[${timestamp}] Task started: ${(event.data as { name: string })?.name}`);
        break;
      case 'task_completed':
        const completed = event.data as { name: string; avgDuration: number };
        console.log(`[${timestamp}] Task completed: ${completed?.name} (${completed?.avgDuration}ms)`);
        break;
      case 'task_failed':
        console.log(`[${timestamp}] Task failed: ${(event.data as { name: string })?.name}`);
        break;
      case 'dream_started':
        console.log(`\n[${timestamp}] Dream mode started`);
        break;
      case 'dream_phase_changed':
        console.log(`[${timestamp}] Dream phase: ${(event.data as { phase: string })?.phase}`);
        break;
      case 'dream_completed':
        console.log(`[${timestamp}] Dream completed`);
        break;
    }
  });

  // Register MCP-enabled tasks
  console.log('\nRegistering MCP-enabled tasks...');

  // 1. Research task
  const researchTask = daemon.schedule(createResearchTask('AI agents and autonomous systems'));
  console.log(`  - ${researchTask.name}: every 5 minutes`);

  // 2. Knowledge graph task
  const kgTask = daemon.schedule(createKnowledgeGraphTask());
  console.log(`  - ${kgTask.name}: every 10 minutes`);

  // 3. File monitor task
  const fileTask = daemon.schedule(createFileMonitorTask(process.cwd()));
  console.log(`  - ${fileTask.name}: every 2 minutes`);

  // 4. LLM research task
  const llmTask = daemon.schedule(createLLMResearchTask());
  console.log(`  - ${llmTask.name}: every 15 minutes`);

  // Start daemon
  console.log('\nStarting daemon...');
  daemon.start();

  // Run demo scenarios
  console.log('\n▶ Running Demo Scenarios');
  console.log('──────────────────────────────────────────────────');

  // Trigger tasks manually for demo
  console.log('\n1. Triggering research task...');
  daemon.triggerTask(researchTask.id);

  // Wait for completion
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log('\n2. Triggering file monitor task...');
  daemon.triggerTask(fileTask.id);

  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log('\n3. Triggering knowledge graph sync...');
  daemon.triggerTask(kgTask.id);

  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Show status
  console.log('\n▶ Daemon Status');
  console.log('──────────────────────────────────────────────────');
  const status = daemon.status();
  console.log(`  State: ${status.state}`);
  console.log(`  Uptime: ${Math.round(status.uptime / 1000)}s`);
  console.log(`  Active tasks: ${status.activeTasks}`);
  console.log(`  Completed tasks: ${status.completedTasks}`);
  console.log(`  Failed tasks: ${status.failedTasks}`);

  // Show scheduled tasks
  console.log('\n▶ Scheduled Tasks');
  console.log('──────────────────────────────────────────────────');
  const tasks = daemon.getTasks();
  for (const task of tasks) {
    console.log(`  - ${task.name}`);
    console.log(`    State: ${task.state}, Runs: ${task.runCount}, Success: ${task.successCount}`);
    if (task.nextRun) {
      console.log(`    Next run: ${task.nextRun.toISOString()}`);
    }
  }

  // Run LLM-driven research task
  console.log('\n4. Triggering LLM-driven research...');
  daemon.triggerTask(llmTask.id);
  await new Promise((resolve) => setTimeout(resolve, 30000));

  // Final status
  console.log('\n▶ Final Status');
  console.log('──────────────────────────────────────────────────');
  const finalStatus = daemon.status();
  console.log(`  Completed tasks: ${finalStatus.completedTasks}`);
  console.log(`  Failed tasks: ${finalStatus.failedTasks}`);

  // Cleanup
  console.log('\nShutting down daemon...');
  await shutdown();

  console.log(`
════════════════════════════════════════════════════════════
  Demo Complete
════════════════════════════════════════════════════════════

Demonstrated:
  - Daemon with scheduled MCP tool tasks
  - Web search via Brave Search
  - Knowledge graph via Memory MCP
  - File operations via Filesystem MCP
  - LLM-driven autonomous research
`);
}

// Run
runDemo().catch(console.error);
