#!/usr/bin/env node
/**
 * Genesis - System Creator CLI
 *
 * Create systems powered by 13 MCP servers:
 *
 * KNOWLEDGE:  arxiv, semantic-scholar, context7, wolfram
 * RESEARCH:   gemini, brave-search, exa, firecrawl
 * CREATION:   openai, github
 * VISUAL:     stability-ai
 * STORAGE:    memory, filesystem
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

import { createOrchestrator, MCP_CAPABILITIES, GenesisPipeline } from './orchestrator.js';
import { SystemSpec, MCPServerName, PipelineStage } from './types.js';
import { startChat } from './cli/chat.js';
import { getLLMBridge } from './llm/index.js';
import { getMCPClient, logMCPMode, MCP_SERVER_REGISTRY } from './mcp/index.js';
import { getProcessManager, LOG_FILE } from './daemon/process.js';
import { createPipelineExecutor } from './pipeline/index.js';
import * as fs from 'fs';
import * as path from 'path';

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
  console.log(`
${c('╔═══════════════════════════════════════════════════════════════╗', 'cyan')}
${c('║', 'cyan')}  ${c('GENESIS', 'bold')} - System Creator                                   ${c('║', 'cyan')}
${c('║', 'cyan')}  ${c('Powered by 13 MCP Servers', 'dim')}                                   ${c('║', 'cyan')}
${c('╚═══════════════════════════════════════════════════════════════╝', 'cyan')}
`);
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

async function cmdChat(options: Record<string, string>): Promise<void> {
  const provider = options.provider as 'openai' | 'anthropic' | undefined;
  const model = options.model;
  const verbose = options.verbose === 'true';

  await startChat({ provider, model, verbose });
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

function cmdHelp(): void {
  printBanner();
  console.log(`${c('Usage:', 'bold')}
  genesis <command> [options]

${c('Commands:', 'bold')}
  ${c('chat', 'green')}                  ${c('Interactive chat with Genesis', 'bold')}
    --provider <p>       LLM provider: openai, anthropic
    --model <m>          Model name (e.g., gpt-4o, claude-sonnet-4-20250514)
    --verbose            Show latency and token usage

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

  ${c('status', 'green')}                Show MCP servers status
  ${c('help', 'green')}                  Show this help

${c('MCP Servers (13):', 'bold')}
  ${c('KNOWLEDGE:', 'blue')}  arxiv, semantic-scholar, context7, wolfram
  ${c('RESEARCH:', 'yellow')}   gemini, brave-search, exa, firecrawl
  ${c('CREATION:', 'green')}   openai, github
  ${c('VISUAL:', 'magenta')}     stability-ai
  ${c('STORAGE:', 'cyan')}    memory, filesystem

${c('Examples:', 'bold')}
  genesis chat                          ${c('Start interactive chat', 'dim')}
  genesis chat --provider anthropic     ${c('Use Claude', 'dim')}
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

  printBanner();

  // Parse options
  const options: Record<string, string> = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      options[key] = args[i + 1] || 'true';
      i++;
    }
  }

  // Get positional arg after command
  const positional = args.find((a, i) => i > 0 && !a.startsWith('--') && !Object.values(options).includes(a));

  try {
    switch (command) {
      case 'chat':
        await cmdChat(options);
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
