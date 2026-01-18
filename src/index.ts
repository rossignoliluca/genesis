#!/usr/bin/env node
/**
 * Genesis - System Creator CLI
 *
 * Create systems powered by 17 MCP servers:
 *
 * KNOWLEDGE:  arxiv, semantic-scholar, context7, wolfram
 * RESEARCH:   gemini, brave-search, exa, firecrawl, sentry
 * CREATION:   openai, github, playwright, aws
 * VISUAL:     stability-ai
 * STORAGE:    memory, filesystem, postgres
 *
 * Usage:
 *   genesis create <name> [options]     Create a new system
 *   genesis research <topic>            Research a topic
 *   genesis design <spec-file>          Design architecture
 *   genesis generate <spec-file>        Generate code
 *   genesis visualize <spec-file>       Create visuals
 *   genesis publish <spec-file>         Publish to GitHub
 *   genesis status                      Show MCP status
 *   genesis help                        Show help
 */

// v7.3: Load environment variables from .env files BEFORE anything else
import { config as dotenvConfig } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env files in priority order (later files override earlier ones)
const envFiles = [
  '.env',           // Base config
  '.env.local',     // Local overrides (gitignored)
];
for (const file of envFiles) {
  const envPath = path.join(process.cwd(), file);
  if (fs.existsSync(envPath)) {
    dotenvConfig({ path: envPath });
  }
}

import { createOrchestrator, MCP_CAPABILITIES, GenesisPipeline } from './orchestrator.js';
import { SystemSpec, MCPServerName, PipelineStage } from './types.js';
import { startChat, runHeadless, readStdin } from './cli/chat.js';
import { getLLMBridge, getHybridRouter, detectHardware } from './llm/index.js';
import { getMCPClient, logMCPMode, MCP_SERVER_REGISTRY } from './mcp/index.js';
import { getProcessManager, LOG_FILE } from './daemon/process.js';
import { createPipelineExecutor } from './pipeline/index.js';
import { createAutonomousLoop, ACTIONS, integrateActiveInference, createIntegratedSystem, createMCPInferenceLoop } from './active-inference/index.js';
import { getBrain, resetBrain } from './brain/index.js';
import { getAutonomousSystem, AutonomousSystem } from './autonomous/index.js';
import { getEconomicSystem } from './economy/index.js';
import { getDeploymentSystem } from './deployment/index.js';
import { getProductionMemory } from './memory-production/index.js';
import { getGovernanceSystem } from './governance/index.js';

// ============================================================================
// CLI Colors
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

function c(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

// ============================================================================
// Banner
// ============================================================================

function printBanner(): void {
  // Box width: 65 chars total (╔ + 63×═ + ╗)
  // Content: 63 chars between ║...║
  const line1 = '  GENESIS - System Creator';
  const line2 = '  Powered by 17 MCP Servers';
  const width = 63;

  console.log();
  console.log(c('╔' + '═'.repeat(width) + '╗', 'cyan'));
  console.log(c('║', 'cyan') + '  ' + c('GENESIS', 'bold') + ' - System Creator' + ' '.repeat(width - line1.length) + c('║', 'cyan'));
  console.log(c('║', 'cyan') + '  ' + c('Powered by 17 MCP Servers', 'dim') + ' '.repeat(width - line2.length) + c('║', 'cyan'));
  console.log(c('╚' + '═'.repeat(width) + '╝', 'cyan'));
  console.log();
}

// ============================================================================
// Commands
// ============================================================================

async function cmdStatus(): Promise<void> {
  console.log(c('\n=== MCP SERVERS STATUS ===\n', 'bold'));

  const categories = ['knowledge', 'research', 'creation', 'visual', 'storage'] as const;
  const categoryColors: Record<string, keyof typeof colors> = {
    knowledge: 'blue',
    research: 'yellow',
    creation: 'green',
    visual: 'magenta',
    storage: 'cyan',
  };

  for (const category of categories) {
    const mcps = Object.entries(MCP_CAPABILITIES)
      .filter(([_, cap]) => cap.category === category);

    console.log(c(`[${category.toUpperCase()}]`, categoryColors[category]));
    for (const [server, cap] of mcps) {
      console.log(`  ${c('●', 'green')} ${server.padEnd(18)} ${c(cap.description, 'dim')}`);
      console.log(`    ${c('Tools:', 'dim')} ${cap.tools.join(', ')}`);
    }
    console.log();
  }

  console.log(c(`Total: 13 MCP servers, 5 categories`, 'bold'));
}

async function cmdCreate(name: string, options: Record<string, string>): Promise<void> {
  console.log(c(`\nCreating system: ${name}\n`, 'bold'));

  const spec: SystemSpec = {
    name,
    description: options.description || `A system named ${name}`,
    type: (options.type as SystemSpec['type']) || 'agent',
    features: options.features?.split(',') || [],
    inspirations: options.inspirations?.split(','),
  };

  console.log(c('Specification:', 'cyan'));
  console.log(`  Name: ${spec.name}`);
  console.log(`  Type: ${spec.type}`);
  console.log(`  Description: ${spec.description}`);
  console.log(`  Features: ${spec.features.join(', ') || 'none'}`);

  // Save spec for reference
  const specPath = path.join(process.cwd(), `${name}.genesis.json`);
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
  console.log(c(`\nSpec saved to: ${specPath}`, 'dim'));

  // Check if --execute flag is set
  if (options.execute === 'true') {
    await cmdPipeline(spec, options);
  } else {
    console.log(c('\nPipeline stages:', 'cyan'));
    const stages = ['research', 'design', 'generate', 'persist'];
    for (const stage of stages) {
      console.log(`  ${c('○', 'yellow')} ${stage}`);
    }

    console.log(c('\nTo execute pipeline, run:', 'dim'));
    console.log(c(`\n  GENESIS_MCP_MODE=real genesis create "${name}" --execute\n`, 'green'));
  }
}

async function cmdPipeline(specOrFile: SystemSpec | string, options: Record<string, string>): Promise<void> {
  let spec: SystemSpec;

  if (typeof specOrFile === 'string') {
    // Load from file
    if (!fs.existsSync(specOrFile)) {
      console.error(c(`Error: Spec file not found: ${specOrFile}`, 'red'));
      process.exit(1);
    }
    spec = JSON.parse(fs.readFileSync(specOrFile, 'utf-8'));
  } else {
    spec = specOrFile;
  }

  console.log(c('\n=== Executing Pipeline ===\n', 'bold'));
  logMCPMode();

  // Parse stages if provided
  const stageList: PipelineStage[] = options.stages
    ? (options.stages.split(',') as PipelineStage[])
    : ['research', 'design', 'generate', 'persist'];

  const executor = createPipelineExecutor({
    verbose: true,
    stages: stageList,
    outputDir: process.cwd(),
    skipPublish: options.publish !== 'true',
  });

  const results = await executor.execute(spec, {
    verbose: true,
    stages: stageList,
  });

  // Print summary
  console.log(c('\n=== Pipeline Summary ===\n', 'bold'));

  let allSuccess = true;
  for (const result of results) {
    const icon = result.success ? c('✓', 'green') : c('✗', 'red');
    const time = `${result.duration}ms`;
    const mcps = result.mcpsUsed.join(', ');

    console.log(`  ${icon} ${result.stage.padEnd(12)} ${c(time, 'dim')} [${mcps}]`);

    if (!result.success) {
      allSuccess = false;
      console.log(c(`      Error: ${result.error}`, 'red'));
    }
  }

  console.log();

  if (allSuccess) {
    console.log(c('Pipeline completed successfully!', 'green'));

    // Show output location
    const outputDir = `${process.cwd()}/${spec.name.toLowerCase()}-generated`;
    console.log(c(`\nOutput: ${outputDir}`, 'cyan'));
  } else {
    console.log(c('Pipeline failed. Check errors above.', 'red'));
    process.exit(1);
  }
}

async function cmdResearch(topic: string): Promise<void> {
  console.log(c(`\nResearch topic: ${topic}\n`, 'bold'));

  const orchestrator = createOrchestrator({ verbose: true });
  const prompt = orchestrator.buildResearchPrompt(topic, [
    'arxiv',
    'semantic-scholar',
    'context7',
    'gemini',
    'brave-search',
    'exa',
    'firecrawl',
  ]);

  console.log(c('Research prompt for MCP execution:', 'cyan'));
  console.log(c('─'.repeat(60), 'dim'));
  console.log(prompt);
  console.log(c('─'.repeat(60), 'dim'));

  console.log(c('\nMCPs to use:', 'cyan'));
  console.log('  KNOWLEDGE: arxiv, semantic-scholar, context7');
  console.log('  RESEARCH:  gemini, brave-search, exa, firecrawl');
}

async function cmdDesign(specFile: string): Promise<void> {
  if (!fs.existsSync(specFile)) {
    console.error(c(`Error: Spec file not found: ${specFile}`, 'red'));
    process.exit(1);
  }

  const spec: SystemSpec = JSON.parse(fs.readFileSync(specFile, 'utf-8'));
  console.log(c(`\nDesigning architecture for: ${spec.name}\n`, 'bold'));

  const orchestrator = createOrchestrator({ verbose: true });
  const prompt = orchestrator.buildArchitecturePrompt(spec, {
    papers: [],
    documentation: [],
    codeExamples: [],
    webResults: [],
    insights: ['Based on autopoiesis principles', 'Event-sourced architecture'],
  });

  console.log(c('Architecture prompt for MCP execution:', 'cyan'));
  console.log(c('─'.repeat(60), 'dim'));
  console.log(prompt);
  console.log(c('─'.repeat(60), 'dim'));

  console.log(c('\nMCPs to use:', 'cyan'));
  console.log('  CREATION: openai (GPT-4o/o1 for design)');
  console.log('  KNOWLEDGE: wolfram (for any computations)');
}

async function cmdGenerate(specFile: string): Promise<void> {
  if (!fs.existsSync(specFile)) {
    console.error(c(`Error: Spec file not found: ${specFile}`, 'red'));
    process.exit(1);
  }

  const spec: SystemSpec = JSON.parse(fs.readFileSync(specFile, 'utf-8'));
  console.log(c(`\nGenerating code for: ${spec.name}\n`, 'bold'));

  const orchestrator = createOrchestrator({ verbose: true });
  const prompt = orchestrator.buildCodePrompt(
    spec,
    { components: [], relations: [], invariants: [], operations: [], events: [] },
    'typescript'
  );

  console.log(c('Code generation prompt for MCP execution:', 'cyan'));
  console.log(c('─'.repeat(60), 'dim'));
  console.log(prompt);
  console.log(c('─'.repeat(60), 'dim'));

  console.log(c('\nMCPs to use:', 'cyan'));
  console.log('  CREATION: openai (GPT-4o for code generation)');
  console.log('  KNOWLEDGE: context7 (for library docs)');
  console.log('  STORAGE: filesystem (to write files)');
}

async function cmdVisualize(specFile: string): Promise<void> {
  if (!fs.existsSync(specFile)) {
    console.error(c(`Error: Spec file not found: ${specFile}`, 'red'));
    process.exit(1);
  }

  const spec: SystemSpec = JSON.parse(fs.readFileSync(specFile, 'utf-8'));
  console.log(c(`\nCreating visuals for: ${spec.name}\n`, 'bold'));

  const orchestrator = createOrchestrator({ verbose: true });

  const visualTypes = ['architecture', 'concept', 'logo'] as const;
  for (const type of visualTypes) {
    const prompt = orchestrator.buildVisualPrompt(spec, type);
    console.log(c(`[${type.toUpperCase()}]`, 'magenta'));
    console.log(`  ${prompt.substring(0, 80)}...`);
    console.log();
  }

  console.log(c('MCPs to use:', 'cyan'));
  console.log('  VISUAL: stability-ai (image generation)');
}

async function cmdPublish(specFile: string): Promise<void> {
  if (!fs.existsSync(specFile)) {
    console.error(c(`Error: Spec file not found: ${specFile}`, 'red'));
    process.exit(1);
  }

  const spec: SystemSpec = JSON.parse(fs.readFileSync(specFile, 'utf-8'));
  console.log(c(`\nPublishing: ${spec.name}\n`, 'bold'));

  console.log(c('Steps:', 'cyan'));
  console.log('  1. Create GitHub repository');
  console.log('  2. Push generated code');
  console.log('  3. Create README with architecture');
  console.log('  4. Add visuals to repo');
  console.log('  5. Persist to knowledge graph');

  console.log(c('\nMCPs to use:', 'cyan'));
  console.log('  CREATION: github (repo management)');
  console.log('  STORAGE: memory (knowledge persistence)');
}

async function cmdChat(options: Record<string, string>, promptArg?: string): Promise<void> {
  // Ollama models - if any of these is specified, use Ollama
  const ollamaModels = ['mistral', 'mistral-small', 'qwen2.5-coder', 'phi3.5', 'deepseek-coder', 'llama3', 'codellama'];

  // --local flag forces Ollama, or if model is an Ollama model
  const isLocal = options.local === 'true';
  const isOllamaModel = options.model && ollamaModels.some(m => options.model.startsWith(m));

  let provider: 'ollama' | 'openai' | 'anthropic' | undefined;
  if (isLocal || isOllamaModel) {
    provider = 'ollama';
  } else if (options.provider) {
    provider = options.provider as 'ollama' | 'openai' | 'anthropic';
  }

  const model = options.model || (provider === 'ollama' ? 'qwen2.5-coder' : undefined);
  const verbose = options.verbose === 'true';

  // v7.4: Headless mode with -p/--print flag
  // -p "text" → options.p = "text" (prompt from flag)
  // -p (no arg) → options.p = 'true' (prompt from stdin/positional)
  const headlessFlag = options.print || options.p;
  const isHeadless = !!headlessFlag;
  const outputFormat = (options.format || options.output || 'text') as 'text' | 'json';

  // v7.4: Session resume
  const resume = options.resume || options.r;
  const sessionName = options.name;

  // v7.20.1: Streaming mode
  const stream = options.stream === 'true';

  if (isHeadless) {
    // Get prompt from -p argument (if string), positional arg, or stdin
    let prompt = (typeof headlessFlag === 'string' && headlessFlag !== 'true')
      ? headlessFlag
      : (promptArg || '');

    // If no prompt argument, try reading from stdin
    if (!prompt) {
      prompt = await readStdin();
    }

    if (!prompt) {
      console.error(c('Error: No prompt provided. Use: genesis chat -p "your prompt" or pipe input.', 'red'));
      process.exit(1);
    }

    // Run headless (no banner, no interactive UI)
    await runHeadless(prompt, { provider, model, verbose, outputFormat });
    return;
  }

  // Interactive mode - show provider info
  if (provider === 'ollama' || (!provider && !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY)) {
    console.log(c(`\n[LLM] Using Ollama (local, free) - model: ${model || 'qwen2.5-coder'}`, 'cyan'));
    console.log(c('[LLM] If Ollama unavailable, will fallback to cloud API\n', 'dim'));
  }

  // v7.4: Pass resume option (true for --resume, string for --resume <id>)
  const resumeOption = resume === 'true' ? true : resume;

  await startChat({
    provider,
    model,
    verbose,
    resume: resumeOption,
    sessionName,
    stream,  // v7.20.1: Enable streaming
  });
}

async function cmdMCP(subcommand: string | undefined, options: Record<string, string>): Promise<void> {
  const client = getMCPClient({ logCalls: true });
  logMCPMode();

  if (!subcommand || subcommand === 'status') {
    // Show MCP mode and registered servers
    console.log(c('\n=== MCP Client Status ===\n', 'bold'));
    console.log(`Mode: ${client.getMode()}`);
    console.log(`\nRegistered servers:`);
    for (const [name, info] of Object.entries(MCP_SERVER_REGISTRY)) {
      console.log(`  ${c('●', 'green')} ${name.padEnd(18)} ${c(info.tools.join(', '), 'dim')}`);
    }
    return;
  }

  if (subcommand === 'test') {
    // Test a specific server
    // Usage: genesis mcp test --server memory --tool read_graph --args '{}'
    const server = (options.server || 'memory') as MCPServerName;
    const tool = options.tool || 'read_graph';

    // Parse args - can be JSON or simple key=value
    let args: Record<string, any> = {};
    if (options.args) {
      try {
        args = JSON.parse(options.args);
      } catch {
        // Try key=value format
        args = { query: options.args };
      }
    }

    console.log(c(`\n=== Testing MCP: ${server}.${tool} ===\n`, 'bold'));
    if (Object.keys(args).length > 0) {
      console.log(`Args: ${JSON.stringify(args)}\n`);
    }

    const result = await client.call(server, tool, args);

    if (result.success) {
      console.log(c('✓ Success', 'green'));
      console.log(`  Mode: ${result.mode}`);
      console.log(`  Latency: ${result.latency}ms`);
      console.log(`  Data:`, JSON.stringify(result.data, null, 2).slice(0, 500));
    } else {
      console.log(c('✗ Failed', 'red'));
      console.log(`  Error: ${result.error}`);
    }
    return;
  }

  if (subcommand === 'list') {
    // List tools for a server
    const server = (options.server || 'memory') as MCPServerName;
    console.log(c(`\n=== Tools for ${server} ===\n`, 'bold'));

    try {
      const tools = await client.listTools(server);
      for (const tool of tools) {
        console.log(`  ${c('●', 'cyan')} ${tool}`);
      }
    } catch (error) {
      console.log(c(`Error: ${error}`, 'red'));
    }
    return;
  }

  console.log(c('Unknown MCP subcommand. Use: status, test, list', 'red'));
}

// ============================================================================
// Daemon Command
// ============================================================================

async function cmdDaemon(subcommand: string | undefined, options: Record<string, string>): Promise<void> {
  const pm = getProcessManager();

  // Special case: 'run' is called by spawned background process
  if (subcommand === 'run') {
    pm.startDaemon();
    // Keep process alive
    setInterval(() => {}, 1000 * 60 * 60);
    return;
  }

  printBanner();

  if (!subcommand || subcommand === 'status') {
    // Show daemon status
    const info = pm.getInfo();

    console.log(c('\n=== Daemon Status ===\n', 'bold'));

    if (info.running) {
      console.log(`  ${c('Status:', 'cyan')}  ${c('Running', 'green')}`);
      console.log(`  ${c('PID:', 'cyan')}     ${info.pid}`);
      console.log(`  ${c('Socket:', 'cyan')}  ${info.socketPath}`);

      // Get detailed status via IPC
      try {
        const response = await pm.ipcCall('status');
        if (response.success && response.data) {
          const status = response.data;
          console.log(`  ${c('State:', 'cyan')}   ${status.state}`);
          console.log(`  ${c('Uptime:', 'cyan')}  ${Math.floor(status.uptime / 1000)}s`);
          console.log(`  ${c('Tasks:', 'cyan')}   ${status.completedTasks} completed, ${status.failedTasks} failed`);
          console.log(`  ${c('Dreams:', 'cyan')}  ${status.dreamCycles} cycles`);
        }
      } catch {
        // IPC may fail
      }
    } else {
      console.log(`  ${c('Status:', 'cyan')}  ${c('Stopped', 'yellow')}`);
      console.log(`  ${c('Hint:', 'dim')}    Use 'genesis daemon start' to start`);
    }
    console.log();
    return;
  }

  if (subcommand === 'start') {
    const info = pm.getInfo();
    if (info.running) {
      console.log(c(`\nDaemon already running (PID: ${info.pid})`, 'yellow'));
      return;
    }

    console.log(c('\nStarting daemon in background...', 'cyan'));
    const result = await pm.spawn();

    if (result.success) {
      console.log(c(`Daemon started (PID: ${result.pid})`, 'green'));
      console.log(c(`Log file: ${LOG_FILE}`, 'dim'));
    } else {
      console.log(c(`Failed to start daemon: ${result.error}`, 'red'));
    }
    return;
  }

  if (subcommand === 'stop') {
    const info = pm.getInfo();
    if (!info.running) {
      console.log(c('\nDaemon is not running', 'yellow'));
      return;
    }

    console.log(c('\nStopping daemon...', 'cyan'));
    const result = await pm.kill();

    if (result.success) {
      console.log(c('Daemon stopped', 'green'));
    } else {
      console.log(c(`Failed to stop daemon: ${result.error}`, 'red'));
    }
    return;
  }

  if (subcommand === 'restart') {
    const info = pm.getInfo();
    if (info.running) {
      console.log(c('\nStopping daemon...', 'cyan'));
      await pm.kill();
      await new Promise((r) => setTimeout(r, 1000));
    }

    console.log(c('Starting daemon...', 'cyan'));
    const result = await pm.spawn();

    if (result.success) {
      console.log(c(`Daemon restarted (PID: ${result.pid})`, 'green'));
    } else {
      console.log(c(`Failed to restart daemon: ${result.error}`, 'red'));
    }
    return;
  }

  if (subcommand === 'logs') {
    // Show recent logs
    const lines = parseInt(options.lines || '50', 10);

    if (!fs.existsSync(LOG_FILE)) {
      console.log(c('\nNo log file found', 'yellow'));
      return;
    }

    const content = fs.readFileSync(LOG_FILE, 'utf-8');
    const allLines = content.split('\n');
    const recentLines = allLines.slice(-lines);

    console.log(c(`\n=== Daemon Logs (last ${lines} lines) ===\n`, 'bold'));
    for (const line of recentLines) {
      if (line.includes('ERROR')) {
        console.log(c(line, 'red'));
      } else if (line.includes('WARN')) {
        console.log(c(line, 'yellow'));
      } else {
        console.log(line);
      }
    }
    console.log();
    return;
  }

  if (subcommand === 'tasks') {
    const info = pm.getInfo();
    if (!info.running) {
      console.log(c('\nDaemon is not running', 'yellow'));
      return;
    }

    console.log(c('\n=== Scheduled Tasks ===\n', 'bold'));

    try {
      const response = await pm.ipcCall('tasks');
      if (response.success && response.data?.tasks) {
        for (const task of response.data.tasks) {
          const statusColor = task.state === 'running' ? 'green' : task.state === 'failed' ? 'red' : 'dim';
          console.log(`  ${c('●', statusColor)} ${task.name}`);
          console.log(`      Schedule: ${JSON.stringify(task.schedule)}`);
          if (task.lastRun) {
            console.log(`      Last run: ${new Date(task.lastRun).toLocaleString()}`);
          }
          if (task.nextRun) {
            console.log(`      Next run: ${new Date(task.nextRun).toLocaleString()}`);
          }
        }
      } else {
        console.log(c(`Error: ${response.error}`, 'red'));
      }
    } catch (err) {
      console.log(c(`IPC error: ${err}`, 'red'));
    }
    console.log();
    return;
  }

  if (subcommand === 'dream') {
    const info = pm.getInfo();
    if (!info.running) {
      console.log(c('\nDaemon is not running', 'yellow'));
      return;
    }

    console.log(c('\nTriggering dream cycle...', 'cyan'));

    try {
      const response = await pm.ipcCall('dream');
      if (response.success) {
        console.log(c('Dream cycle completed', 'green'));
        console.log(`Results: ${JSON.stringify(response.data, null, 2)}`);
      } else {
        console.log(c(`Error: ${response.error}`, 'red'));
      }
    } catch (err) {
      console.log(c(`IPC error: ${err}`, 'red'));
    }
    return;
  }

  console.log(c('Unknown daemon subcommand. Use: start, stop, restart, status, logs, tasks, dream', 'red'));
}

// ============================================================================
// Infer Command (Active Inference / Autonomous Mode)
// ============================================================================

async function cmdInfer(subcommand: string | undefined, options: Record<string, string>): Promise<void> {
  if (subcommand === 'help' || options.help === 'true') {
    console.log(`
${c('Active Inference - Autonomous Decision Making', 'bold')}

${c('Usage:', 'cyan')}
  genesis infer [subcommand] [options]

${c('Subcommands:', 'cyan')}
  run         Run autonomous inference cycles (default)
  integrated  Run with Kernel & Daemon integration
  mcp         Run with REAL MCP observations
  beliefs     Show current beliefs
  step        Run a single inference cycle
  stats       Show inference statistics

${c('Options:', 'cyan')}
  --cycles <n>      Number of cycles to run (default: 10)
  --interval <ms>   Interval between cycles in ms (default: 1000)
  --verbose         Show detailed output
  --interactive     Pause after each cycle
  --integrated      Connect to Kernel & Daemon (real system state)

${c('Examples:', 'cyan')}
  genesis infer                    Run 10 inference cycles
  genesis infer --cycles 100       Run 100 cycles
  genesis infer beliefs            Show current beliefs
  genesis infer step               Run single cycle
  genesis infer --verbose          Verbose output
  genesis infer integrated         Run with full system integration
  genesis infer mcp                Run with real MCP observations
`);
    return;
  }

  const cycles = parseInt(options.cycles || '10', 10);
  const interval = parseInt(options.interval || '1000', 10);
  const verbose = options.verbose === 'true';
  const interactive = options.interactive === 'true';
  const integrated = options.integrated === 'true' || subcommand === 'integrated';

  // Integrated mode: connect to real Kernel & Daemon
  if (integrated) {
    console.log(c('\n=== Integrated Active Inference Mode ===\n', 'bold'));
    console.log(`  ${c('Status:', 'cyan')} Starting Kernel and Daemon...`);

    try {
      const system = await createIntegratedSystem({
        cycleInterval: interval,
        maxCycles: cycles,
        verbose,
        enableDaemonTask: false, // We'll run manually
      });

      // Start the system
      await system.start();
      console.log(`  ${c('Kernel:', 'green')} Started`);
      console.log(`  ${c('Daemon:', 'green')} Started`);

      const kernelStatus = system.status().kernel;
      console.log(`  ${c('Agents:', 'cyan')} ${kernelStatus.agents.total} (${kernelStatus.agents.healthy} healthy)`);
      console.log(`  ${c('Energy:', 'cyan')} ${(kernelStatus.energy * 100).toFixed(0)}%`);
      console.log();

      // Subscribe to cycle events
      system.loop.onCycle((cycle, action, beliefs) => {
        const status = system.status();
        const line = `[${cycle.toString().padStart(4)}] ${action.padEnd(15)} | ` +
          `E:${(status.kernel.energy * 100).toFixed(0)}% ` +
          `K:${status.kernel.state.padEnd(10)} ` +
          `A:${status.kernel.agents.healthy}/${status.kernel.agents.total}`;
        console.log(line);
      });

      // Subscribe to stop event
      system.loop.onStop((reason, stats) => {
        console.log(c(`\n=== Stopped: ${reason} ===\n`, 'bold'));
        console.log(`  Cycles: ${stats.cycles}`);
        console.log(`  Avg Surprise: ${stats.avgSurprise.toFixed(3)}`);
        console.log(`  Final Energy: ${(system.status().kernel.energy * 100).toFixed(0)}%`);
        console.log(`  Actions taken:`);
        for (const [action, count] of Object.entries(stats.actions)) {
          const pct = ((count as number) / stats.cycles * 100).toFixed(1);
          console.log(`    ${action}: ${count} (${pct}%)`);
        }
        console.log();
      });

      // Run the integrated loop
      console.log(c(`Running ${cycles} integrated cycles...\n`, 'dim'));
      await system.loop.run(cycles);

      // Stop the system
      await system.stop();
      console.log(c('System stopped.\n', 'dim'));

    } catch (error) {
      console.error(c(`Error: ${error}`, 'red'));
    }

    return;
  }

  // MCP mode: connect to real MCP servers for observations
  const mcpMode = subcommand === 'mcp' || options.mcp === 'true';
  if (mcpMode) {
    console.log(c('\n=== Active Inference with Real MCPs ===\n', 'bold'));
    console.log(`  ${c('Mode:', 'cyan')} Real MCP observations`);
    console.log(`  ${c('Cycles:', 'cyan')} ${cycles}`);
    console.log(`  ${c('Interval:', 'cyan')} ${interval}ms`);
    console.log();

    try {
      const { loop: mcpLoop, mcpBridge } = await createMCPInferenceLoop({
        cycleInterval: interval,
        maxCycles: 0,
        verbose,
      });

      // Initial MCP probe
      console.log(`  ${c('Probing MCPs...', 'dim')}`);
      const initialObs = await mcpLoop.getComponents().observations.gather();
      console.log(`  ${c('Initial Observation:', 'green')} E:${initialObs.energy} Φ:${initialObs.phi} T:${initialObs.tool} C:${initialObs.coherence}`);

      const mcpResults = mcpBridge.lastMCPResults();
      if (Object.keys(mcpResults.latencies).length > 0) {
        console.log(`  ${c('MCP Latencies:', 'cyan')}`);
        for (const [mcp, lat] of Object.entries(mcpResults.latencies)) {
          console.log(`    ${mcp}: ${lat}ms`);
        }
      }
      console.log();

      // Subscribe to cycle events
      mcpLoop.onCycle((cycle, action, beliefs) => {
        const state = mcpLoop.getMostLikelyState();
        const mcpInfo = mcpBridge.lastMCPResults();
        const avgLat = Object.values(mcpInfo.latencies).reduce((a, b) => a + b, 0) /
          Math.max(1, Object.keys(mcpInfo.latencies).length);

        const line = `[${cycle.toString().padStart(4)}] ${action.padEnd(15)} | ` +
          `V:${state.viability.padEnd(8)} Lat:${avgLat.toFixed(0)}ms`;
        console.log(line);

        if (verbose) {
          console.log(`        Beliefs: W=${state.worldState} C=${state.coupling} G=${state.goalProgress}`);
        }
      });

      // Subscribe to stop event
      mcpLoop.onStop((reason, stats) => {
        const mcpInfo = mcpBridge.lastMCPResults();
        console.log(c(`\n=== Stopped: ${reason} ===\n`, 'bold'));
        console.log(`  Cycles: ${stats.cycles}`);
        console.log(`  Avg Surprise: ${stats.avgSurprise.toFixed(3)}`);
        console.log(`  MCP Connections:`);
        for (const [mcp, lat] of Object.entries(mcpInfo.latencies)) {
          console.log(`    ${mcp}: ${lat}ms`);
        }
        console.log(`  Actions taken:`);
        for (const [action, count] of Object.entries(stats.actions)) {
          const pct = ((count as number) / stats.cycles * 100).toFixed(1);
          console.log(`    ${action}: ${count} (${pct}%)`);
        }
        console.log();
      });

      // Run the loop
      console.log(c(`Running ${cycles} MCP-connected cycles...\n`, 'dim'));
      await mcpLoop.run(cycles);

    } catch (error) {
      console.error(c(`MCP Inference Error: ${error}`, 'red'));
    }

    return;
  }

  // Standard mode (no Kernel/Daemon integration)
  const loop = createAutonomousLoop({
    cycleInterval: interval,
    maxCycles: 0,
    verbose,
    stopOnGoalAchieved: true,
    stopOnEnergyCritical: true,
  });

  // Handle subcommands
  if (subcommand === 'beliefs') {
    const state = loop.getMostLikelyState();
    console.log(c('\n=== Current Beliefs ===\n', 'bold'));
    console.log(`  ${c('Viability:', 'cyan')}    ${state.viability}`);
    console.log(`  ${c('World State:', 'cyan')}  ${state.worldState}`);
    console.log(`  ${c('Coupling:', 'cyan')}     ${state.coupling}`);
    console.log(`  ${c('Goal Progress:', 'cyan')} ${state.goalProgress}`);
    console.log();
    return;
  }

  if (subcommand === 'stats') {
    const stats = loop.getStats();
    console.log(c('\n=== Inference Statistics ===\n', 'bold'));
    console.log(`  ${c('Cycles:', 'cyan')}         ${stats.cycles}`);
    console.log(`  ${c('Avg Surprise:', 'cyan')}   ${stats.avgSurprise.toFixed(3)}`);
    console.log(`  ${c('Actions:', 'cyan')}`);
    for (const [action, count] of Object.entries(stats.actions)) {
      console.log(`    ${action}: ${count}`);
    }
    console.log();
    return;
  }

  if (subcommand === 'step') {
    console.log(c('\n=== Single Inference Cycle ===\n', 'bold'));

    const action = await loop.cycle();

    const state = loop.getMostLikelyState();
    console.log(`  ${c('Action:', 'green')} ${action}`);
    console.log(`  ${c('Beliefs:', 'cyan')}`);
    console.log(`    Viability: ${state.viability}`);
    console.log(`    World: ${state.worldState}`);
    console.log(`    Coupling: ${state.coupling}`);
    console.log(`    Goal: ${state.goalProgress}`);
    console.log();
    return;
  }

  // Default: run cycles
  console.log(c(`\n=== Active Inference - Running ${cycles} cycles ===\n`, 'bold'));
  console.log(`  Interval: ${interval}ms`);
  console.log(`  Verbose: ${verbose}`);
  console.log();

  // Subscribe to cycle events
  loop.onCycle((cycle, action, beliefs) => {
    if (!verbose) {
      // Compact output
      const state = loop.getMostLikelyState();
      const line = `[${cycle.toString().padStart(4)}] ${action.padEnd(15)} | ` +
        `V:${state.viability.padEnd(8)} W:${state.worldState.padEnd(8)} ` +
        `C:${state.coupling.padEnd(8)} G:${state.goalProgress}`;
      console.log(line);
    }

    if (interactive) {
      // In interactive mode, we'd pause here
      // For now, just show the action more prominently
      console.log(c(`  → Action: ${action}`, 'yellow'));
    }
  });

  // Subscribe to stop event
  loop.onStop((reason, stats) => {
    console.log(c(`\n=== Stopped: ${reason} ===\n`, 'bold'));
    console.log(`  Cycles: ${stats.cycles}`);
    console.log(`  Avg Surprise: ${stats.avgSurprise.toFixed(3)}`);
    console.log(`  Actions taken:`);
    for (const [action, count] of Object.entries(stats.actions)) {
      const pct = ((count as number) / stats.cycles * 100).toFixed(1);
      console.log(`    ${action}: ${count} (${pct}%)`);
    }
    console.log();
  });

  // Run the loop
  await loop.run(cycles);
}

// ============================================================================
// Brain Command (Phase 10: Neural Integration)
// ============================================================================

async function cmdBrain(subcommand: string | undefined, options: Record<string, string>): Promise<void> {
  const brain = getBrain();

  if (!subcommand || subcommand === 'status') {
    const metrics = brain.getMetrics();
    const running = brain.isRunning();

    console.log(c('\n=== BRAIN STATUS (Phase 10) ===\n', 'bold'));
    console.log(`  ${c('Running:', 'cyan')}     ${running ? c('Yes', 'green') : c('No', 'yellow')}`);
    console.log();

    console.log(c('Consciousness (φ):', 'cyan'));
    console.log(`  Level:         ${metrics.avgPhi.toFixed(3)}`);
    console.log(`  Violations:    ${metrics.phiViolations}`);
    console.log(`  Broadcasts:    ${metrics.broadcasts}`);
    console.log();

    console.log(c('Processing:', 'cyan'));
    console.log(`  Total Cycles:  ${metrics.totalCycles}`);
    console.log(`  Successful:    ${metrics.successfulCycles}`);
    console.log(`  Failed:        ${metrics.failedCycles}`);
    console.log(`  Avg Time:      ${metrics.avgCycleTime.toFixed(0)}ms`);
    console.log();

    console.log(c('Memory (Cognitive Workspace):', 'cyan'));
    console.log(`  Recalls:       ${metrics.memoryRecalls}`);
    console.log(`  Reuse Rate:    ${(metrics.memoryReuseRate * 100).toFixed(1)}% (target: 54-60%)`);
    console.log(`  Anticipation:  ${metrics.anticipationHits} hits, ${metrics.anticipationMisses} misses`);
    console.log();

    console.log(c('Grounding:', 'cyan'));
    console.log(`  Checks:        ${metrics.groundingChecks}`);
    console.log(`  Passes:        ${metrics.groundingPasses}`);
    console.log(`  Failures:      ${metrics.groundingFailures}`);
    console.log(`  Human Consults: ${metrics.humanConsultations}`);
    console.log();

    console.log(c('Healing (Darwin-Gödel):', 'cyan'));
    console.log(`  Attempts:      ${metrics.healingAttempts}`);
    console.log(`  Successes:     ${metrics.healingSuccesses}`);
    console.log(`  Failures:      ${metrics.healingFailures}`);
    console.log();

    console.log(c('Tools:', 'cyan'));
    console.log(`  Executions:    ${metrics.toolExecutions}`);
    console.log(`  Successes:     ${metrics.toolSuccesses}`);
    console.log(`  Failures:      ${metrics.toolFailures}`);
    console.log();

    // Module transitions
    if (Object.keys(metrics.moduleTransitions).length > 0) {
      console.log(c('Module Transitions:', 'cyan'));
      for (const [transition, count] of Object.entries(metrics.moduleTransitions)) {
        console.log(`    ${transition}: ${count}`);
      }
      console.log();
    }
    return;
  }

  if (subcommand === 'phi') {
    const metrics = brain.getMetrics();
    const phi = metrics.avgPhi;

    console.log(c('\n=== CONSCIOUSNESS LEVEL (φ) ===\n', 'bold'));

    // Visual bar
    const width = 30;
    const filled = Math.round(phi * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    console.log(`  Current φ:    ${phi.toFixed(3)}`);

    if (phi >= 0.7) {
      console.log(`  Level:        ${c(bar, 'green')} HIGH`);
      console.log(`  Status:       ${c('Global Workspace active - full broadcasting', 'green')}`);
    } else if (phi >= 0.3) {
      console.log(`  Level:        ${c(bar, 'yellow')} MEDIUM`);
      console.log(`  Status:       ${c('Ignition threshold - selective broadcasting', 'yellow')}`);
    } else {
      console.log(`  Level:        ${c(bar, 'dim')} LOW`);
      console.log(`  Status:       ${c('Local processing - no broadcasting', 'dim')}`);
    }

    console.log();
    console.log(c('Theory:', 'dim'));
    console.log('  φ (phi) measures integrated information (IIT 4.0)');
    console.log('  Values: 0 = no integration, 1 = maximum integration');
    console.log('  Ignition (φ > 0.3): Information broadcasts globally (GWT)');
    console.log();
    return;
  }

  if (subcommand === 'start') {
    if (brain.isRunning()) {
      console.log(c('\nBrain is already running', 'yellow'));
      return;
    }
    brain.start();
    console.log(c('\nBrain started', 'green'));
    console.log(c('  Neural Integration Layer is now active', 'dim'));
    return;
  }

  if (subcommand === 'stop') {
    if (!brain.isRunning()) {
      console.log(c('\nBrain is not running', 'yellow'));
      return;
    }
    brain.stop();
    console.log(c('\nBrain stopped', 'yellow'));
    return;
  }

  if (subcommand === 'reset') {
    resetBrain();
    console.log(c('\nBrain reset to initial state', 'yellow'));
    console.log(c('  All metrics cleared', 'dim'));
    return;
  }

  if (subcommand === 'cycle') {
    const query = options.query || 'Test query for brain cycle';
    console.log(c('\n=== RUNNING BRAIN CYCLE ===\n', 'bold'));
    console.log(`  Query: "${query}"`);
    console.log();

    if (!brain.isRunning()) {
      brain.start();
      console.log(c('  [Starting brain...]', 'dim'));
    }

    try {
      const start = Date.now();
      const response = await brain.process(query);
      const duration = Date.now() - start;

      console.log(c('Response:', 'cyan'));
      console.log(`  ${response.substring(0, 500)}${response.length > 500 ? '...' : ''}`);
      console.log();

      const metrics = brain.getMetrics();
      console.log(c('Metrics:', 'cyan'));
      console.log(`  Duration:      ${duration}ms`);
      console.log(`  φ Level:       ${metrics.avgPhi.toFixed(3)}`);
      console.log(`  Memory Reuse:  ${(metrics.memoryReuseRate * 100).toFixed(1)}%`);
      console.log();
    } catch (error) {
      console.log(c(`  Error: ${error}`, 'red'));
    }
    return;
  }

  console.log(c(`Unknown brain subcommand: ${subcommand}`, 'red'));
  console.log('Use: status, phi, start, stop, reset, cycle');
}

// ============================================================================
// Autonomous Command (Phase 11: Full Autonomous Mode)
// ============================================================================

async function cmdAutonomous(subcommand: string | undefined, options: Record<string, string>): Promise<void> {
  const system = getAutonomousSystem({
    enableEconomy: options.economy !== 'false',
    enableDeployment: options.deployment !== 'false',
    enableProductionMemory: options.memory !== 'false',
    enableGovernance: options.governance !== 'false',
    slackWebhook: options.slack || process.env.SLACK_WEBHOOK_URL,
  });

  if (!subcommand || subcommand === 'status') {
    console.log(c('\n=== AUTONOMOUS SYSTEM STATUS (Phase 11) ===\n', 'bold'));

    const status = await system.getStatus();

    console.log(`  ${c('Initialized:', 'cyan')}  ${status.initialized ? c('Yes', 'green') : c('No', 'yellow')}`);
    console.log(`  ${c('Health:', 'cyan')}       ${c(status.health.toUpperCase(), status.health === 'healthy' ? 'green' : status.health === 'degraded' ? 'yellow' : 'red')}`);
    console.log(`  ${c('Pending:', 'cyan')}      ${status.pendingActions} actions`);
    console.log(`  ${c('Last Activity:', 'cyan')} ${status.lastActivity}`);
    console.log();

    console.log(c('Subsystems:', 'bold'));
    console.log(`  ${c('Economy:', 'cyan')}      ${status.subsystems.economy.enabled ? c('●', 'green') : c('○', 'dim')} ${status.subsystems.economy.enabled ? 'Enabled' : 'Disabled'}`);
    if (status.subsystems.economy.balance) {
      console.log(`                  Balance: $${status.subsystems.economy.balance.fiat.toFixed(2)} USD + $${status.subsystems.economy.balance.crypto.usdc.toFixed(2)} USDC`);
    }
    console.log(`  ${c('Deployment:', 'cyan')}   ${status.subsystems.deployment.enabled ? c('●', 'green') : c('○', 'dim')} ${status.subsystems.deployment.enabled ? 'Enabled' : 'Disabled'}`);
    console.log(`  ${c('Memory:', 'cyan')}       ${status.subsystems.memory.enabled ? c('●', 'green') : c('○', 'dim')} ${status.subsystems.memory.enabled ? 'Enabled' : 'Disabled'}`);
    console.log(`  ${c('Governance:', 'cyan')}   ${status.subsystems.governance.enabled ? c('●', 'green') : c('○', 'dim')} ${status.subsystems.governance.enabled ? 'Enabled' : 'Disabled'}`);

    if (status.subsystems.governance.enabled) {
      const gov = status.subsystems.governance.stats.governance;
      console.log(`                  Rules: ${gov.enabledRules}/${gov.totalRules}, Pending: ${gov.pendingApprovals}`);
    }
    console.log();
    return;
  }

  if (subcommand === 'init') {
    console.log(c('\n=== Initializing Autonomous System ===\n', 'bold'));
    const status = await system.initialize();
    console.log(c('Initialization complete!', 'green'));
    console.log(`  Health: ${c(status.health.toUpperCase(), 'green')}`);
    console.log();
    return;
  }

  if (subcommand === 'balance') {
    const balance = await system.getBalance();
    if (!balance) {
      console.log(c('\nEconomy not initialized', 'yellow'));
      return;
    }

    console.log(c('\n=== UNIFIED BALANCE ===\n', 'bold'));
    console.log(`  ${c('Fiat (Stripe):', 'cyan')}  $${balance.fiat.toFixed(2)} USD`);
    console.log(`  ${c('Crypto:', 'cyan')}         $${balance.crypto.usdc.toFixed(2)} USDC`);
    console.log(`  ${c('Total:', 'green')}          $${(balance.fiat + balance.crypto.usdc).toFixed(2)} USD`);
    console.log();
    return;
  }

  if (subcommand === 'approvals') {
    const approvals = system.getPendingApprovals();

    console.log(c('\n=== PENDING APPROVALS ===\n', 'bold'));

    if (approvals.length === 0) {
      console.log(c('  No pending approvals', 'green'));
    } else {
      for (const approval of approvals) {
        console.log(`  ${c('●', 'yellow')} [${approval.id}]`);
        console.log(`      Type: ${approval.type}`);
        console.log(`      Description: ${approval.description}`);
        console.log(`      Amount: ${approval.amount ? `$${approval.amount}` : 'N/A'}`);
        console.log(`      Urgency: ${approval.urgency}`);
        console.log(`      Created: ${approval.created}`);
        console.log();
      }
    }
    return;
  }

  if (subcommand === 'approve') {
    const id = options.id || options.approval;
    const decision = (options.decision as 'approved' | 'rejected') || 'approved';
    const reviewer = options.reviewer || 'cli-user';
    const notes = options.notes;

    if (!id) {
      console.log(c('Error: --id required', 'red'));
      return;
    }

    const result = system.submitApproval(id, decision, reviewer, notes);
    if (result) {
      console.log(c(`\nApproval ${id} ${decision}`, decision === 'approved' ? 'green' : 'yellow'));
    } else {
      console.log(c(`\nApproval not found or already processed: ${id}`, 'red'));
    }
    return;
  }

  if (subcommand === 'stop') {
    const reason = options.reason || 'Manual emergency stop from CLI';
    const result = system.emergencyStop(reason);
    console.log(c('\n!!! EMERGENCY STOP ACTIVATED !!!', 'red'));
    console.log(`  Stopped Approvals: ${result.stoppedApprovals}`);
    console.log(`  Stopped Tasks: ${result.stoppedTasks}`);
    console.log(`  Reason: ${reason}`);
    console.log();
    return;
  }

  if (subcommand === 'agent') {
    const card = system.getAgentCard();
    if (!card) {
      console.log(c('\nGovernance not initialized', 'yellow'));
      return;
    }

    console.log(c('\n=== AGENT CARD (A2A Protocol) ===\n', 'bold'));
    console.log(`  ${c('ID:', 'cyan')}          ${card.id}`);
    console.log(`  ${c('Name:', 'cyan')}        ${card.name}`);
    console.log(`  ${c('Version:', 'cyan')}     ${card.version}`);
    console.log(`  ${c('Description:', 'cyan')} ${card.description}`);
    console.log();
    console.log(c('Capabilities:', 'cyan'));
    for (const cap of card.capabilities) {
      console.log(`    ${c('●', 'green')} ${cap.name}: ${cap.description}`);
    }
    console.log();
    console.log(c('Endpoints:', 'cyan'));
    console.log(`    A2A:     ${card.endpoints.a2a}`);
    console.log(`    Health:  ${card.endpoints.health}`);
    console.log();
    return;
  }

  if (subcommand === 'run') {
    const cycles = parseInt(options.cycles || '0', 10);
    const interval = parseInt(options.interval || '5000', 10);

    console.log(c('\n=== STARTING AUTONOMOUS LOOP ===\n', 'bold'));
    console.log(`  Cycles: ${cycles || 'Unlimited'}`);
    console.log(`  Interval: ${interval}ms`);
    console.log();

    // Initialize first
    await system.initialize();

    // Run the loop
    console.log(c('Running autonomous loop... (Ctrl+C to stop)\n', 'dim'));
    await system.runLoop(interval, cycles || undefined);
    return;
  }

  console.log(c(`Unknown autonomous subcommand: ${subcommand}`, 'red'));
  console.log('Use: status, init, balance, approvals, approve, stop, agent, run');
}

async function cmdHardware(): Promise<void> {
  console.log(c('\n=== HARDWARE PROFILE ===\n', 'bold'));

  const hw = detectHardware();
  const router = getHybridRouter({ logDecisions: false });

  // Hardware info
  console.log(c('Detected:', 'cyan'));
  console.log(`  CPU:              ${hw.cpu}`);
  console.log(`  Apple Silicon:    ${hw.isAppleSilicon ? c('Yes', 'green') : 'No'}`);
  console.log(`  Cores:            ${hw.cores}`);
  console.log(`  Memory:           ${hw.memoryGB} GB`);
  console.log(`  Performance Tier: ${c(hw.tier.toUpperCase(), hw.tier === 'ultra' ? 'green' : hw.tier === 'high' ? 'cyan' : 'yellow')}`);
  console.log();

  // Router config
  const config = router.getConfig();
  console.log(c('Router Configuration:', 'cyan'));
  console.log(`  Cloud Threshold:  ${config.cloudThreshold} (tasks ≥ ${config.cloudThreshold} → cloud)`);
  console.log(`  Local Max Tokens: ${config.localMaxTokens}`);
  console.log(`  Prefer Local:     ${config.preferLocal ? c('Yes', 'green') : 'No'}`);
  console.log(`  Auto Fallback:    ${config.autoFallback ? 'Yes' : 'No'}`);
  console.log();

  // Recommendations
  console.log(c('Recommendations:', 'cyan'));
  if (hw.tier === 'ultra') {
    console.log(`  ${c('✓', 'green')} Excellent hardware - local LLM will handle most tasks`);
    console.log(`  ${c('✓', 'green')} Only creative/complex generation needs cloud`);
    console.log(`  ${c('✓', 'green')} Can use larger models (mistral-small 24B)`);
  } else if (hw.tier === 'high') {
    console.log(`  ${c('✓', 'green')} Good hardware - local LLM for routine tasks`);
    console.log(`  ${c('✓', 'green')} Cloud for complex architecture/design`);
  } else if (hw.tier === 'medium') {
    console.log(`  ${c('●', 'yellow')} Medium hardware - balance local/cloud`);
    console.log(`  ${c('●', 'yellow')} Use local for simple tasks, cloud for complex`);
  } else {
    console.log(`  ${c('●', 'yellow')} Limited hardware - prefer cloud for quality`);
    console.log(`  ${c('●', 'yellow')} Use --provider openai or anthropic`);
  }
  console.log();

  // Test Ollama latency
  console.log(c('Testing Ollama latency...', 'dim'));
  try {
    const start = Date.now();
    const response = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) {
      const latency = Date.now() - start;
      console.log(`  Ollama Status:    ${c('Running', 'green')} (${latency}ms)`);

      const data = await response.json();
      const models = data.models?.map((m: any) => m.name).join(', ') || 'none';
      console.log(`  Available Models: ${models}`);
    } else {
      console.log(`  Ollama Status:    ${c('Error', 'red')}`);
    }
  } catch {
    console.log(`  Ollama Status:    ${c('Not running', 'yellow')} (start with: ollama serve)`);
  }
  console.log();
}

function cmdHelp(): void {
  printBanner();
  console.log(`${c('Usage:', 'bold')}
  genesis <command> [options]

${c('Commands:', 'bold')}
  ${c('chat', 'green')}                  ${c('Interactive chat with Genesis', 'bold')}
    --local              Use Ollama (free, local) - DEFAULT
    --provider <p>       LLM provider: ollama, openai, anthropic
    --model <m>          Model name (e.g., mistral, gpt-4o, claude-sonnet-4-20250514)
    --verbose            Show latency and token usage
    -p, --print "text"   ${c('Headless mode: process prompt and exit', 'yellow')}
    --format <f>         Output format: text (default), json
    -r, --resume [id]    ${c('Resume previous session (default: last)', 'yellow')}
    --name <name>        Name for the current session

  ${c('create', 'green')} <name>         Create a new system
    --type <type>        System type: autopoietic, agent, multi-agent, service
    --description <desc> System description
    --features <f1,f2>   Comma-separated features
    --inspirations <i>   Papers/projects to draw from
    --execute            Execute pipeline with real MCPs

  ${c('pipeline', 'green')} <spec.json>  Run pipeline from spec file
    --stages <s1,s2>     Stages: research,design,generate,persist,publish
    --publish            Also publish to GitHub

  ${c('research', 'green')} <topic>      Research a topic using all knowledge MCPs
  ${c('design', 'green')} <spec-file>    Design architecture from spec
  ${c('generate', 'green')} <spec-file>  Generate code from spec
  ${c('visualize', 'green')} <spec-file> Create visual assets
  ${c('publish', 'green')} <spec-file>   Publish to GitHub

  ${c('mcp', 'green')} [subcommand]      MCP client control
    status               Show MCP mode and servers
    test                 Test MCP server call
      --server <s>       Server name (default: arxiv)
      --tool <t>         Tool name (default: search_arxiv)
      --query <q>        Query string
    list --server <s>    List tools for a server

  ${c('infer', 'green')} [cycles]          Run autonomous inference loop
    --cycles <n>         Number of cycles (default: 10, 0=unlimited)
    --interval <ms>      Interval between cycles (default: 1000)
    --verbose            Show detailed output

  ${c('brain', 'green')} [subcommand]      Phase 10: Neural Integration Layer
    status               Show brain status and metrics
    phi                  Show consciousness level (φ)
    start                Start the brain
    stop                 Stop the brain
    reset                Reset brain to initial state
    cycle --query <q>    Run a brain processing cycle

  ${c('phi', 'green')}                    Shortcut for 'brain phi'

  ${c('autonomous', 'green')} [subcommand]  Phase 11: Full Autonomous Mode
    status               Show autonomous system status
    init                 Initialize all subsystems
    balance              Show unified financial balance
    approvals            List pending governance approvals
    approve --id <id>    Approve/reject a pending action
    stop --reason <r>    Emergency stop all operations
    agent                Show A2A protocol agent card
    run                  Start autonomous operation loop
      --cycles <n>       Number of cycles (0=unlimited)
      --interval <ms>    Interval between cycles (default: 5000)

  ${c('status', 'green')}                Show MCP servers status
  ${c('hardware', 'green')}              Show hardware profile & router config
  ${c('help', 'green')}                  Show this help

${c('MCP Servers (13):', 'bold')}
  ${c('KNOWLEDGE:', 'blue')}  arxiv, semantic-scholar, context7, wolfram
  ${c('RESEARCH:', 'yellow')}   gemini, brave-search, exa, firecrawl
  ${c('CREATION:', 'green')}   openai, github
  ${c('VISUAL:', 'magenta')}     stability-ai
  ${c('STORAGE:', 'cyan')}    memory, filesystem

${c('Examples:', 'bold')}
  genesis chat                          ${c('Interactive chat with Mistral (local)', 'dim')}
  genesis chat --provider openai        ${c('Chat with GPT-4o (cloud)', 'dim')}
  genesis chat --stream                 ${c('Real-time streaming with live cost counter', 'dim')}
  genesis chat --resume                 ${c('Resume last session', 'dim')}
  genesis chat --resume abc123          ${c('Resume specific session by ID', 'dim')}
  genesis chat -p "Explain recursion"   ${c('Headless: single prompt, output, exit', 'dim')}
  echo "What is 2+2?" | genesis chat -p ${c('Headless: read from stdin', 'dim')}
  genesis chat -p "..." --format json   ${c('Headless: JSON output for scripting', 'dim')}
  genesis infer mcp --cycles 10         ${c('Autonomous inference with MCPs', 'dim')}
  genesis create my-agent --type agent --features "state-machine,events"

  ${c('# Run full pipeline with real MCPs:', 'dim')}
  GENESIS_MCP_MODE=real genesis create my-system --type agent --execute
  GENESIS_MCP_MODE=real genesis pipeline my-system.genesis.json
`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    cmdHelp();
    return;
  }

  // Chat command has its own banner, skip main banner
  if (command !== 'chat') {
    printBanner();
  }

  // Parse options (handles both --flag and -f short flags)
  const options: Record<string, string> = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      // Check if next arg is a value or another flag
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = 'true';
      }
    } else if (args[i].startsWith('-') && args[i].length === 2) {
      // Short flag: -p, -v, etc.
      const key = args[i].slice(1);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = 'true';
      }
    }
  }

  // Get positional arg after command
  const positional = args.find((a, i) => i > 0 && !a.startsWith('--') && !Object.values(options).includes(a));

  try {
    switch (command) {
      case 'chat':
        // v7.4: Pass positional arg as prompt for headless mode (-p "prompt")
        await cmdChat(options, positional);
        break;
      case 'status':
        await cmdStatus();
        break;
      case 'create':
        if (!positional) {
          console.error(c('Error: Name required for create command', 'red'));
          process.exit(1);
        }
        await cmdCreate(positional, options);
        break;
      case 'research':
        if (!positional) {
          console.error(c('Error: Topic required for research command', 'red'));
          process.exit(1);
        }
        await cmdResearch(positional);
        break;
      case 'design':
        if (!positional) {
          console.error(c('Error: Spec file required for design command', 'red'));
          process.exit(1);
        }
        await cmdDesign(positional);
        break;
      case 'generate':
        if (!positional) {
          console.error(c('Error: Spec file required for generate command', 'red'));
          process.exit(1);
        }
        await cmdGenerate(positional);
        break;
      case 'visualize':
        if (!positional) {
          console.error(c('Error: Spec file required for visualize command', 'red'));
          process.exit(1);
        }
        await cmdVisualize(positional);
        break;
      case 'publish':
        if (!positional) {
          console.error(c('Error: Spec file required for publish command', 'red'));
          process.exit(1);
        }
        await cmdPublish(positional);
        break;
      case 'mcp':
        await cmdMCP(positional, options);
        break;
      case 'daemon':
        await cmdDaemon(positional, options);
        break;
      case 'pipeline':
        if (!positional) {
          console.error(c('Error: Spec file required for pipeline command', 'red'));
          process.exit(1);
        }
        await cmdPipeline(positional, options);
        break;
      case 'infer':
        await cmdInfer(positional, options);
        break;
      case 'hardware':
        await cmdHardware();
        break;
      case 'brain':
        await cmdBrain(positional, options);
        break;
      case 'phi':
        // Shortcut for brain phi
        await cmdBrain('phi', options);
        break;
      case 'autonomous':
      case 'auto':
        await cmdAutonomous(positional, options);
        break;
      default:
        console.error(c(`Unknown command: ${command}`, 'red'));
        console.log('Use "genesis help" for usage information');
        process.exit(1);
    }
  } catch (error) {
    console.error(c(`Error: ${error}`, 'red'));
    process.exit(1);
  }
}

main();
