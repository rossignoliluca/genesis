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
import { runAgenticChat } from './cli/agentic.js';
import { getLLMBridge, getHybridRouter, detectHardware } from './llm/index.js';
import { getMCPClient, logMCPMode, MCP_SERVER_REGISTRY } from './mcp/index.js';
import { getProcessManager, LOG_FILE } from './daemon/process.js';
import { createPipelineExecutor } from './pipeline/index.js';
import { createAutonomousLoop, ACTIONS, integrateActiveInference, createIntegratedSystem, createMCPInferenceLoop, createValueIntegratedLoop } from './active-inference/index.js';
import { getBrain, resetBrain } from './brain/index.js';
import { getAutonomousSystem, AutonomousSystem } from './autonomous/index.js';
import { getEconomicSystem } from './economy/index.js';
import { getDeploymentSystem } from './deployment/index.js';
import { getProductionMemory } from './memory-production/index.js';
import { getGovernanceSystem } from './governance/index.js';
import { A2AServer, A2AClient, generateA2AKeyPair } from './a2a/index.js';
import { GenesisMCPServer } from './mcp-server/index.js';
import { runCodeQualityAnalysis, persistCodeQualityToMemory, loadCodeQualityGraph } from './self-modification/code-quality-analyzer.js';
import { bootstrapIntegration, getUnifiedStatus, getIntegrationState } from './integration/index.js';
import { getGenesis } from './genesis.js';

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

  // v10.7: Show integration status
  console.log(c('\n=== INTEGRATION STATUS ===\n', 'bold'));
  const status = getUnifiedStatus();
  const state = getIntegrationState();

  console.log(c('[STREAMING]', 'cyan'));
  console.log(`  ${c('●', state.initialized ? 'green' : 'red')} Integration: ${state.initialized ? 'active' : 'inactive'}`);
  console.log(`  Streams completed: ${state.totalStreamsCompleted}`);
  console.log(`  Latency models tracked: ${status.streaming.latencyStats}`);
  console.log(`  Racing wins: ${status.streaming.racingWins}`);

  console.log(c('\n[ECONOMIC]', 'yellow'));
  console.log(`  Total LLM costs: $${state.totalCostsRecorded.toFixed(6)}`);
  console.log(`  Avg cost/stream: $${status.economic.costPerStream.toFixed(6)}`);
  console.log(`  Last provider: ${state.lastStreamProvider || 'none'}`);

  console.log(c('\n[ACTIVE INFERENCE]', 'magenta'));
  console.log(`  Observations emitted: ${state.latencyObservationsEmitted}`);

  console.log(c('\n[CONSCIOUSNESS]', 'blue'));
  console.log(`  Racing updates: ${status.consciousness.updated ? 'yes' : 'no'}`);

  console.log(c('\n[GOVERNANCE]', 'red'));
  console.log(`  Checks performed: ${state.governanceChecks}`);

  console.log(c('\n[A2A]', 'green'));
  console.log(`  Delegations: ${state.a2aDelegations}`);

  // v13.0: Genesis unified system status
  console.log(c('\n=== GENESIS CORE ===\n', 'bold'));
  const genesis = getGenesis();
  const gStatus = genesis.getStatus();
  const lvl = (b: boolean) => b ? c('●', 'green') : c('○', 'red');
  console.log(c('[LEVELS]', 'cyan'));
  console.log(`  ${lvl(gStatus.levels.L1)} L1 Autonomic   ${lvl(gStatus.levels.L2)} L2 Reactive   ${lvl(gStatus.levels.L3)} L3 Cognitive   ${lvl(gStatus.levels.L4)} L4 Executive`);
  console.log(c('\n[MODULES]', 'magenta'));
  console.log(`  FEK: ${gStatus.fek ? `running, ${gStatus.fek.cycleCount} cycles, FE=${gStatus.fek.totalFE.toFixed(3)}` : 'offline'}`);
  console.log(`  Brain: ${gStatus.brain ? `phi=${gStatus.brain.phi.toFixed(3)}` : 'offline'}`);
  console.log(`  Causal: ${gStatus.causal ? `${gStatus.causal.graphSize} variables` : 'disabled'}`);
  console.log(`  Metacognition: ${gStatus.metacognition ? `conf=${gStatus.metacognition.confidence.toFixed(2)}, ECE=${gStatus.metacognition.calibrationError.toFixed(3)}` : 'disabled'}`);
  console.log(`  Perception: ${gStatus.perception ? 'active' : 'disabled'}`);
  console.log(`  Meta-RL: ${gStatus.metaRL ? `${gStatus.metaRL.curriculumSize} tasks learned` : 'disabled'}`);
  console.log(`  Execution: ${gStatus.execution ? 'active' : 'disabled'}`);
  console.log(`  Consciousness: ${gStatus.consciousness ? `phi=${gStatus.consciousness.phi.toFixed(3)}, state=${gStatus.consciousness.state}` : 'disabled'}`);
  console.log(`  Self-Improvement: ${gStatus.selfImprovement ? 'active' : 'disabled'}`);
  if (gStatus.fiber) {
    console.log(c('\n[ECONOMICS]', 'yellow'));
    console.log(`  Net flow: $${gStatus.fiber.netFlow.toFixed(4)}/cycle`);
    console.log(`  Sustainable: ${gStatus.fiber.sustainable ? c('yes', 'green') : c('no', 'red')}`);
  }
  console.log();
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
    try {
      spec = JSON.parse(fs.readFileSync(specOrFile, 'utf-8'));
    } catch (err) {
      console.error(c(`Error: Invalid JSON in spec file: ${err instanceof Error ? err.message : String(err)}`, 'red'));
      process.exit(1);
    }
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

  let spec: SystemSpec;
  try {
    spec = JSON.parse(fs.readFileSync(specFile, 'utf-8'));
  } catch (err) {
    console.error(c(`Error: Invalid JSON in spec file: ${err instanceof Error ? err.message : String(err)}`, 'red'));
    process.exit(1);
  }
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

  let spec: SystemSpec;
  try {
    spec = JSON.parse(fs.readFileSync(specFile, 'utf-8'));
  } catch (err) {
    console.error(c(`Error: Invalid JSON in spec file: ${err instanceof Error ? err.message : String(err)}`, 'red'));
    process.exit(1);
  }
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

  let spec: SystemSpec;
  try {
    spec = JSON.parse(fs.readFileSync(specFile, 'utf-8'));
  } catch (err) {
    console.error(c(`Error: Invalid JSON in spec file: ${err instanceof Error ? err.message : String(err)}`, 'red'));
    process.exit(1);
  }
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

  let spec: SystemSpec;
  try {
    spec = JSON.parse(fs.readFileSync(specFile, 'utf-8'));
  } catch (err) {
    console.error(c(`Error: Invalid JSON in spec file: ${err instanceof Error ? err.message : String(err)}`, 'red'));
    process.exit(1);
  }
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
  // v9.0.1: --help support for chat command
  if (options.help === 'true' || options.h === 'true') {
    // ANSI codes: \x1b[36m=cyan, \x1b[32m=green, \x1b[33m=yellow, \x1b[1m=bold, \x1b[2m=dim, \x1b[0m=reset
    console.log(`
\x1b[36m\x1b[1mgenesis chat\x1b[0m - Interactive AI chat with Genesis

\x1b[1mUsage:\x1b[0m
  genesis chat [options]

\x1b[1mOptions:\x1b[0m
  \x1b[32m--local\x1b[0m              Use Ollama (free, local) - DEFAULT
  \x1b[32m--provider <p>\x1b[0m       LLM provider: ollama, openai, anthropic
  \x1b[32m--model <m>\x1b[0m          Model name (e.g., mistral, gpt-4o, claude-sonnet-4-20250514)
  \x1b[32m--verbose\x1b[0m            Show latency and token usage
  \x1b[32m--stream\x1b[0m             Enable real-time streaming with live cost counter
  \x1b[32m-p, --print "text"\x1b[0m   Headless mode: process prompt and exit
  \x1b[32m--format <f>\x1b[0m         Output format: text (default), json
  \x1b[32m-r, --resume [id]\x1b[0m    Resume previous session (default: last)
  \x1b[32m--name <name>\x1b[0m        Name for the current session
  \x1b[32m-h, --help\x1b[0m           Show this help

\x1b[1mChat Commands:\x1b[0m \x1b[2m(inside chat)\x1b[0m
  \x1b[33m/help\x1b[0m               Show all available commands
  \x1b[33m/quit\x1b[0m               Exit the chat
  \x1b[33m/clear\x1b[0m              Clear conversation history
  \x1b[33m/export <file>\x1b[0m      Export conversation to file
  \x1b[33m/mode <mode>\x1b[0m        Switch mode: chat, code, research, reason
  \x1b[33m/tools\x1b[0m              Show available MCP tools
  \x1b[33m/call <tool>\x1b[0m        Call an MCP tool directly
  \x1b[33m/brain\x1b[0m              Show brain status and φ level
  \x1b[33m/model <name>\x1b[0m       Switch model mid-conversation

\x1b[1mExamples:\x1b[0m
  genesis chat                          \x1b[2mInteractive chat with Mistral (local)\x1b[0m
  genesis chat --provider anthropic     \x1b[2mChat with Claude\x1b[0m
  genesis chat --stream                 \x1b[2mReal-time streaming with cost counter\x1b[0m
  genesis chat --resume                 \x1b[2mResume last session\x1b[0m
  genesis chat --resume abc123          \x1b[2mResume specific session by ID\x1b[0m
  genesis chat -p "Explain recursion"   \x1b[2mHeadless: single prompt, output, exit\x1b[0m
  echo "2+2?" | genesis chat -p         \x1b[2mHeadless: read from stdin\x1b[0m
  genesis chat -p "..." --format json   \x1b[2mHeadless: JSON output for scripting\x1b[0m
`);
    return;
  }

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

  if (subcommand === 'serve') {
    // Start Genesis as an MCP server
    console.log(c('\n=== Starting Genesis MCP Server ===\n', 'bold'));

    const { GenesisMCPServer, DEFAULT_MCP_SERVER_CONFIG } = await import('./mcp-server/index.js');

    // Use defaults, only override name/version
    const server = new GenesisMCPServer({
      name: options.name || 'genesis',
      version: '10.4.2',
    });

    console.log(`  Name: ${options.name || 'genesis'}`);
    console.log(`  Transport: stdio`);
    console.log(`  Tools:`);
    console.log(`    ${c('genesis.chat', 'cyan')}     - Multi-model AI chat with auto-routing`);
    console.log(`    ${c('genesis.research', 'cyan')} - Deep research using 20+ MCP sources`);
    console.log(`    ${c('genesis.analyze', 'cyan')}  - Code/data analysis`);
    console.log(`    ${c('genesis.think', 'cyan')}    - Deep reasoning with multi-mind synthesis`);
    console.log(`    ${c('genesis.create', 'cyan')}   - Code/content generation`);
    console.log(`    ${c('genesis.remember', 'cyan')} - Memory operations`);
    console.log(`    ${c('genesis.execute', 'cyan')} - Autonomous task execution`);
    console.log('');
    console.log(c('To add to Claude Code:', 'dim'));
    console.log(c('  claude mcp add genesis -- npx genesis-ai-cli mcp-server', 'yellow'));
    console.log('');
    console.log(c('Server starting... (Ctrl+C to stop)', 'dim'));

    await server.start();

    // Keep process alive
    process.on('SIGINT', () => {
      console.log('\n[GenesisMCP] Shutting down...');
      process.exit(0);
    });

    // Don't exit - server is running
    return;
  }

  console.log(c('Unknown MCP subcommand. Use: status, test, list, serve', 'red'));
}

// ============================================================================
// Daemon Command
// ============================================================================

async function cmdDaemon(subcommand: string | undefined, options: Record<string, string>): Promise<void> {
  const pm = getProcessManager();

  // Special case: 'run' is called by spawned background process
  if (subcommand === 'run') {
    pm.startDaemon();
    // Keep process alive with proper cleanup
    const keepAliveInterval = setInterval(() => {}, 1000 * 60 * 60);

    // Clean up on shutdown signals
    const cleanup = () => {
      clearInterval(keepAliveInterval);
      pm.stopDaemon();
      process.exit(0);
    };
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
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
  const noEnergyStop = options['no-energy-stop'] === 'true';

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
  // v11.0: Value-JEPA augmented loop is now the default (adds trajectory planning)
  const noValue = options['no-value'] === 'true';
  const loopConfig = {
    cycleInterval: interval,
    maxCycles: 0,
    verbose,
    stopOnGoalAchieved: !noEnergyStop,
    stopOnEnergyCritical: !noEnergyStop,
    loadOnStart: true,
    persistEveryN: 10,
    replayEveryN: 5,
    dreamEveryN: 50,
  };

  const loop = noValue
    ? createAutonomousLoop(loopConfig)
    : createValueIntegratedLoop(loopConfig).loop;

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
    const status = brain.getStatus();
    const phi = status.persisted.avgPhi;  // v8.1: Use persisted phi

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

    // v8.1: Show persisted consciousness history
    console.log();
    console.log(c('History (persisted):', 'cyan'));
    console.log(`  Peak φ:       ${status.persisted.peakPhi.toFixed(3)}`);
    console.log(`  Avg φ:        ${status.persisted.avgPhi.toFixed(3)}`);
    console.log(`  Ignitions:    ${status.persisted.totalIgnitions} (φ > 0.3 events)`);
    console.log(`  Broadcasts:   ${status.persisted.totalBroadcasts}`);
    console.log(`  Sessions:     ${status.persisted.totalSessions}`);

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
// Memory Command (v10.4.2: Unified Memory Query)
// ============================================================================

async function cmdMemory(subcommand: string | undefined, options: Record<string, string>): Promise<void> {
  const brain = getBrain();
  const query = brain.getUnifiedQuery();

  if (!subcommand || subcommand === 'status') {
    const stats = query.getStats();
    console.log(c('\n=== MEMORY STATUS (v10.4.2 Unified Query) ===\n', 'bold'));
    console.log(`  ${c('Sources:', 'cyan')}  ${stats.sourceCount}`);
    for (const source of stats.registeredSources) {
      console.log(`    - ${source}`);
    }
    console.log();
    return;
  }

  if (subcommand === 'search') {
    const searchQuery = options.query || options.q;
    if (!searchQuery) {
      console.log(c('Usage: genesis memory search -q "your query"', 'yellow'));
      return;
    }

    const limit = parseInt(options.limit || '10', 10);

    console.log(c(`\n=== SEARCHING ALL MEMORY: "${searchQuery}" ===\n`, 'bold'));

    const result = await brain.searchAllMemory(searchQuery, { limit });

    console.log(`  ${c('Results:', 'cyan')} ${result.results.length} of ${result.totalCount} total`);
    console.log(`  ${c('Took:', 'cyan')}    ${result.took}ms`);
    console.log(`  ${c('Sources:', 'cyan')} ${result.searchedSources.join(', ')}`);
    console.log();

    for (const mem of result.results) {
      const importance = '●'.repeat(Math.ceil(mem.importance * 5)) + '○'.repeat(5 - Math.ceil(mem.importance * 5));
      console.log(c(`[${mem.source}/${mem.type}]`, 'dim') + ` ${mem.summary || mem.id}`);
      console.log(`  Relevance: ${(mem.relevance * 100).toFixed(0)}%  Importance: ${importance}  Retention: ${(mem.retention * 100).toFixed(0)}%`);
      console.log();
    }
    return;
  }

  if (subcommand === 'recent') {
    const limit = parseInt(options.limit || '10', 10);

    console.log(c('\n=== RECENT MEMORIES ===\n', 'bold'));

    const result = await query.getRecent({ limit });

    console.log(`  ${c('Results:', 'cyan')} ${result.results.length}`);
    console.log();

    for (const mem of result.results) {
      const age = Math.round((Date.now() - mem.created.getTime()) / (1000 * 60));
      console.log(c(`[${mem.source}/${mem.type}]`, 'dim') + ` ${mem.summary || mem.id}`);
      console.log(`  Created: ${age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`}  Importance: ${(mem.importance * 100).toFixed(0)}%`);
      console.log();
    }
    return;
  }

  if (subcommand === 'connect') {
    // v14.9: Test production memory connectivity (Neo4j, Pinecone, Supabase)
    console.log(c('\n=== TESTING PRODUCTION MEMORY CONNECTIONS (v14.9) ===\n', 'bold'));

    const { getProductionMemory } = await import('./memory-production/index.js');
    const prodMem = getProductionMemory();

    console.log(c('Initializing connections...', 'dim'));
    const results = await prodMem.initialize();

    console.log(`  ${c('Pinecone:', 'cyan')}   ${results.vectors ? c('● Connected', 'green') : c('○ Not configured', 'yellow')}`);
    console.log(`  ${c('Neo4j:', 'cyan')}      ${results.graph ? c('● Connected', 'green') : c('○ Not configured', 'yellow')}`);
    console.log(`  ${c('PostgreSQL:', 'cyan')} ${results.structured ? c('● Connected', 'green') : c('○ Not configured', 'yellow')}`);
    console.log();

    if (results.vectors || results.graph || results.structured) {
      console.log(c('Production memory ready for use!', 'green'));
    } else {
      console.log(c('No external databases configured. Set environment variables:', 'yellow'));
      console.log('  - PINECONE_API_KEY for vector search');
      console.log('  - NEO4J_URI, NEO4J_PASSWORD for knowledge graph');
      console.log('  - POSTGRES_CONNECTION_STRING for structured storage');
    }
    console.log();
    return;
  }

  if (subcommand === 'persist') {
    // v14.9: Run persistence cycle (flush to external DBs)
    console.log(c('\n=== PERSISTING MEMORY TO EXTERNAL DBS ===\n', 'bold'));

    const { getMemoryPersistence } = await import('./memory/persistence.js');
    const persistence = getMemoryPersistence({ verbose: true });

    const stats = persistence.getStats();
    console.log(`  ${c('Episodic persisted:', 'cyan')}  ${stats.episodicPersisted}`);
    console.log(`  ${c('Semantic persisted:', 'cyan')}  ${stats.semanticPersisted}`);
    console.log(`  ${c('Procedural persisted:', 'cyan')} ${stats.proceduralPersisted}`);
    console.log(`  ${c('Vectors stored:', 'cyan')}       ${stats.vectorsStored}`);
    console.log(`  ${c('Graph nodes:', 'cyan')}          ${stats.graphNodes}`);
    console.log(`  ${c('Graph edges:', 'cyan')}          ${stats.graphEdges}`);
    console.log(`  ${c('Errors:', 'cyan')}               ${stats.errors}`);
    console.log(`  ${c('Last sync:', 'cyan')}            ${stats.lastSync?.toISOString() || 'Never'}`);
    console.log();
    return;
  }

  console.log(c(`Unknown memory subcommand: ${subcommand}`, 'red'));
  console.log('Use: status, search -q "query", recent, connect, persist');
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

    console.log(c('\n=== STARTING AUTONOMOUS LOOP (Active Inference) ===\n', 'bold'));
    console.log(`  Engine:   POMDP + Value-JEPA + Experience Replay`);
    console.log(`  Cycles:   ${cycles || 'Unlimited'}`);
    console.log(`  Interval: ${interval}ms`);
    console.log(`  Replay:   every 5 cycles (batch=8)`);
    console.log(`  Dream:    every 50 cycles (batch=16)`);
    console.log(`  Persist:  every 10 cycles → .genesis/learned-model.json`);
    console.log();

    // Create and run the real Active Inference autonomous loop
    const loop = createAutonomousLoop({
      cycleInterval: interval,
      maxCycles: cycles || 0,
      persistEveryN: 10,
      loadOnStart: true,
      replayEveryN: 5,
      replayBatchSize: 8,
      dreamEveryN: 50,
      dreamBatchSize: 16,
      verbose: options.verbose === 'true',
    });

    // Graceful shutdown on Ctrl+C
    process.on('SIGINT', () => {
      console.log(c('\n\nStopping autonomous loop...', 'yellow'));
      loop.stop('user_interrupt');
    });

    console.log(c('Running autonomous loop... (Ctrl+C to stop)\n', 'dim'));
    const stats = await loop.run(cycles || undefined);
    console.log(c('\n=== LOOP COMPLETE ===', 'bold'));
    console.log(`  Total cycles: ${stats.cycles}`);
    console.log(`  Actions taken: ${Object.values(stats.actions).reduce((a, b) => a + b, 0)}`);
    console.log(`  Avg surprise: ${stats.avgSurprise.toFixed(3)}`);
    console.log(`  Top actions: ${Object.entries(stats.actions).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a, c]) => `${a}(${c})`).join(', ')}`);
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

  ${c('analyze', 'green')} [subcommand]   v10.1: Code Quality Self-Analysis
    run              Run analysis & save to memory (default)
    summary          Quick summary only
    coverage         Test coverage report
    types            Type safety issues
    todos            TODO/FIXME items
    history          Show previous analysis

  ${c('install', 'green')}               Install/update Genesis globally (npm)
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
// Analyze Command (v10.1: Code Quality Self-Analysis)
// ============================================================================

async function cmdAnalyze(subcommand: string | undefined, options: Record<string, string>): Promise<void> {
  const verbose = options.verbose === 'true';
  const save = options.save === 'true' || !subcommand || subcommand === 'run';

  if (subcommand === 'help' || options.help === 'true') {
    console.log(`
${c('Code Quality Analysis - Self-Improvement Tool', 'bold')}

${c('Usage:', 'cyan')}
  genesis analyze [subcommand] [options]

${c('Subcommands:', 'cyan')}
  run          Run full analysis and save to memory (default)
  summary      Show analysis summary only
  coverage     Show test coverage details
  types        Show type safety issues
  todos        Show TODO/FIXME items
  history      Show analysis history

${c('Options:', 'cyan')}
  --verbose    Show detailed output
  --save       Save results to memory (default for 'run')

${c('Examples:', 'cyan')}
  genesis analyze                Run analysis and save
  genesis analyze summary        Quick summary
  genesis analyze coverage       Test coverage report
  genesis analyze types          Type safety issues
`);
    return;
  }

  console.log(c('\n=== Genesis Code Quality Analysis (v10.1) ===\n', 'bold'));

  // Load previous analysis if just checking history
  if (subcommand === 'history') {
    const graph = loadCodeQualityGraph();
    if (!graph) {
      console.log(c('No previous analysis found in .genesis/', 'yellow'));
      return;
    }
    console.log(`${c('Previous Analysis:', 'cyan')}`);
    console.log(`  Entities: ${graph.entities.length}`);
    console.log(`  Relations: ${graph.relations.length}`);
    if (graph.summary) {
      console.log(`  Coverage: ${graph.summary.testCoverage.toFixed(1)}%`);
      console.log(`  Type Safety: ${graph.summary.typeSafetyScore}/100`);
    }
    return;
  }

  // Run analysis
  console.log('Analyzing codebase...');
  const startTime = Date.now();
  const report = await runCodeQualityAnalysis();
  const duration = Date.now() - startTime;

  console.log(`${c('Analysis completed in', 'dim')} ${duration}ms\n`);

  // Summary view (default or explicit)
  if (!subcommand || subcommand === 'run' || subcommand === 'summary') {
    console.log(`${c('Summary:', 'cyan')}`);
    console.log(`  Files:         ${report.summary.totalFiles}`);
    console.log(`  Lines:         ${report.summary.totalLines.toLocaleString()}`);
    console.log(`  Test Coverage: ${c(report.summary.testCoverage.toFixed(1) + '%', report.summary.testCoverage < 20 ? 'red' : 'yellow')}`);
    console.log(`  Type Safety:   ${c(report.summary.typeSafetyScore + '/100', report.summary.typeSafetyScore < 70 ? 'red' : 'green')}`);
    console.log(`  Complexity:    ${report.summary.avgComplexity.toFixed(1)}`);
    console.log(`  TODOs:         ${report.summary.todoCount}`);
    console.log(`  Critical:      ${c(String(report.summary.criticalIssues), report.summary.criticalIssues > 0 ? 'red' : 'green')}`);
    console.log();
  }

  // Coverage details
  if (subcommand === 'coverage') {
    console.log(`${c('Test Coverage:', 'cyan')}`);
    const untested = report.testCoverage.filter(t => !t.hasTest);
    const tested = report.testCoverage.filter(t => t.hasTest);
    console.log(`  ✓ Tested: ${tested.length} modules`);
    console.log(`  ✗ Untested: ${untested.length} modules\n`);

    if (verbose) {
      console.log('Untested modules:');
      for (const m of untested.slice(0, 20)) {
        console.log(`  - ${m.module}`);
      }
      if (untested.length > 20) {
        console.log(`  ... and ${untested.length - 20} more`);
      }
    }
    console.log();
  }

  // Type issues
  if (subcommand === 'types') {
    console.log(`${c('Type Safety Issues:', 'cyan')}`);
    const byType: Record<string, number> = {};
    for (const i of report.typeSafetyIssues) {
      byType[i.type] = (byType[i.type] || 0) + 1;
    }
    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`);
    }

    if (verbose) {
      console.log('\nHigh severity issues:');
      const high = report.typeSafetyIssues.filter(i => i.severity === 'high');
      for (const i of high.slice(0, 10)) {
        console.log(`  ${i.file}:${i.line} - ${i.type}`);
      }
    }
    console.log();
  }

  // TODOs
  if (subcommand === 'todos') {
    console.log(`${c('TODO Items:', 'cyan')}`);
    for (const item of report.todoItems) {
      const color = item.priority === 'critical' ? 'red' : item.priority === 'high' ? 'yellow' : 'dim';
      console.log(`  [${c(item.type, color)}] ${item.file}:${item.line}`);
      console.log(`         ${item.content.slice(0, 60)}`);
    }
    console.log();
  }

  // Recommendations (always show for run/summary)
  if (!subcommand || subcommand === 'run' || subcommand === 'summary') {
    console.log(`${c('Recommendations:', 'cyan')}`);
    for (const rec of report.recommendations.slice(0, 5)) {
      const color = rec.priority === 'critical' ? 'red' : rec.priority === 'high' ? 'yellow' : 'dim';
      console.log(`  ${c('•', color)} [${rec.priority.toUpperCase()}] ${rec.title}`);
      if (verbose) {
        console.log(`    ${rec.description.slice(0, 70)}`);
      }
    }
    console.log();
  }

  // Save to memory
  if (save) {
    console.log('Saving to memory...');
    const result = await persistCodeQualityToMemory(report);
    if (result.success) {
      console.log(`${c('✓', 'green')} Saved ${result.entitiesCreated} entities, ${result.relationsCreated} relations`);
      console.log(`  Path: ${result.graphPath}`);
    } else {
      console.log(`${c('✗', 'red')} Failed to save: ${result.error}`);
    }
    console.log();
  }
}

// ============================================================================
// Bounty Command (v14.7: Autonomous Bounty Hunting)
// ============================================================================

async function cmdBounty(subcommand: string | undefined, options: Record<string, string>): Promise<void> {
  const { getBountyHunter } = await import('./economy/generators/bounty-hunter.js');
  const { getEarningsTracker } = await import('./economy/live/earnings-tracker.js');

  const hunter = getBountyHunter();
  const earnings = getEarningsTracker();

  switch (subcommand) {
    case 'scan':
      // Scan for new bounties
      console.log(c('Scanning for bounties...', 'cyan'));
      const discovered = await hunter.scan();
      console.log(`Found ${discovered.length} new bounties:`);
      discovered.slice(0, 10).forEach((b, i) => {
        console.log(`  ${i + 1}. [$${b.reward}] ${b.title.slice(0, 50)} (${b.platform})`);
      });
      break;

    case 'list':
      // List cached bounties
      const stats = hunter.getStats();
      console.log(c('Bounty Statistics:', 'cyan'));
      console.log(`  Discovered: ${stats.bountiesDiscovered}`);
      console.log(`  Claimed: ${stats.bountiesClaimed}`);
      console.log(`  Submitted: ${stats.bountiesSubmitted}`);
      console.log(`  Accepted: ${stats.bountiesAccepted}`);
      console.log(`  Success Rate: ${(stats.successRate * 100).toFixed(1)}%`);
      console.log(`  Total Earned: $${stats.totalEarned.toFixed(2)}`);
      break;

    case 'earnings':
      // Show earnings summary
      const summary = earnings.getSummary();
      console.log(c('Earnings Summary:', 'cyan'));
      console.log(`  Total Attempts: ${summary.totalAttempts}`);
      console.log(`  Accepted: ${summary.totalAccepted}`);
      console.log(`  Rejected: ${summary.totalRejected}`);
      console.log(`  Total Earned: ${c('$' + summary.totalEarned.toFixed(2), 'green')}`);
      console.log(`  Total Cost: $${summary.totalCost.toFixed(2)}`);
      console.log(`  Net Profit: ${c('$' + summary.netProfit.toFixed(2), summary.netProfit >= 0 ? 'green' : 'red')}`);
      console.log(`  Success Rate: ${(summary.successRate * 100).toFixed(1)}%`);
      console.log(`  Best Bounty: $${summary.bestBounty.toFixed(2)}`);
      break;

    case 'select':
      // Select best bounty to work on
      const best = hunter.selectBest();
      if (best) {
        console.log(c('Best bounty to work on:', 'cyan'));
        console.log(`  Title: ${best.title}`);
        console.log(`  Reward: $${best.reward}`);
        console.log(`  Platform: ${best.platform}`);
        console.log(`  Category: ${best.category}`);
        console.log(`  Difficulty: ${best.difficulty}`);
        console.log(`  URL: ${best.submissionUrl || 'N/A'}`);
      } else {
        console.log('No suitable bounties found. Run "genesis bounty scan" first.');
      }
      break;

    case 'claim': {
      // Claim a bounty (start working on it)
      const bountyId = options.id;
      if (!bountyId) {
        console.error('Usage: genesis bounty claim --id <bounty-id>');
        process.exit(1);
      }
      const claimed = await hunter.claim(bountyId);
      if (claimed) {
        console.log(c('Bounty claimed! Start working on it.', 'green'));
      } else {
        console.error('Failed to claim bounty. Check the ID.');
      }
      break;
    }

    default:
      console.log(c('Genesis Bounty Hunter', 'cyan'));
      console.log('');
      console.log('Usage:');
      console.log('  genesis bounty scan      Scan for new bounties');
      console.log('  genesis bounty list      Show bounty statistics');
      console.log('  genesis bounty earnings  Show earnings summary');
      console.log('  genesis bounty select    Select best bounty to work on');
      console.log('  genesis bounty claim --id <id>  Claim a bounty');
      console.log('');
      console.log('Supported platforms: Algora, GitHub, Gitcoin, DeWork');
  }
}

// ============================================================================
// Agents Command (v10.4.2: Parallel Agent Execution)
// ============================================================================

async function cmdAgents(subcommand: string | undefined, options: Record<string, string>): Promise<void> {
  const { getAgentPool, parallelExecute, researchBuildReview } = await import('./agents/agent-pool.js');
  const { getCoordinator } = await import('./agents/coordinator.js');
  const pool = getAgentPool();
  const coordinator = getCoordinator();

  if (!subcommand || subcommand === 'status') {
    console.log(c('\n=== Agent Pool Status ===\n', 'bold'));
    const stats = pool.getStats();
    console.log(`  ${c('Pool Size:', 'cyan')}     ${stats.poolSize}`);
    console.log(`  ${c('Completed:', 'cyan')}     ${stats.completedTasks}`);
    console.log(`  ${c('Total Tasks:', 'cyan')}   ${stats.totalTasks}`);
    console.log(`  ${c('Total Cost:', 'cyan')}    $${stats.totalCost.toFixed(4)}`);
    console.log(`  ${c('Avg Latency:', 'cyan')}   ${stats.avgLatency.toFixed(0)}ms`);
    console.log();

    const coordStats = coordinator.getMetrics();
    console.log(c('=== Coordinator Metrics ===\n', 'bold'));
    console.log(`  ${c('Tasks Completed:', 'cyan')} ${coordStats.tasksCompleted}`);
    console.log(`  ${c('Total Latency:', 'cyan')}   ${coordStats.totalLatency.toFixed(0)}ms`);
    console.log(`  ${c('Debates:', 'cyan')}         ${coordStats.debatesHeld}`);
    console.log(`  ${c('Votes:', 'cyan')}           ${coordStats.votesHeld}`);
    console.log();
    return;
  }

  if (subcommand === 'parallel') {
    // Execute multiple agents in parallel
    // Usage: genesis agents parallel "task1" "task2" "task3" --agents explorer,builder,critic
    const args = process.argv.slice(4).filter(a => !a.startsWith('-'));
    const agentTypes = (options.agents || 'explorer,builder,critic').split(',') as import('./agents/types.js').AgentType[];

    if (args.length === 0) {
      console.log(c('Usage: genesis agents parallel "task1" "task2" --agents type1,type2', 'yellow'));
      return;
    }

    console.log(c('\n=== Parallel Agent Execution ===\n', 'bold'));
    console.log(`  Tasks: ${args.length}`);
    console.log(`  Agents: ${agentTypes.join(', ')}`);
    console.log();

    const startTime = Date.now();
    const results = await parallelExecute(
      args.map((input) => ({ input, taskType: 'research' as const }))
    );

    console.log(c('Results:\n', 'bold'));
    for (const result of results) {
      const status = result.success ? c('✓', 'green') : c('✗', 'red');
      console.log(`  ${status} ${result.agentType} (${result.latency}ms, $${result.cost.toFixed(4)})`);
      if (result.output) {
        console.log(`     ${result.output.slice(0, 150)}...`);
      }
      if (result.error) {
        console.log(`     ${c(`Error: ${result.error}`, 'red')}`);
      }
    }
    console.log(`\n  ${c('Total:', 'cyan')} ${Date.now() - startTime}ms`);
    return;
  }

  if (subcommand === 'coordinate') {
    // Use coordinator patterns
    // Usage: genesis agents coordinate "query" --pattern parallel|debate|voting --agents type1,type2
    const query = options.q || process.argv[4];
    const pattern = (options.pattern || 'parallel') as import('./agents/coordinator.js').CoordinationPattern;
    const agentTypes = (options.agents || 'explorer,builder,critic').split(',') as import('./agents/types.js').AgentType[];

    if (!query) {
      console.log(c('Usage: genesis agents coordinate -q "query" --pattern parallel|debate|voting --agents type1,type2', 'yellow'));
      return;
    }

    console.log(c('\n=== Agent Coordination ===\n', 'bold'));
    console.log(`  Query: ${query.slice(0, 60)}${query.length > 60 ? '...' : ''}`);
    console.log(`  Pattern: ${pattern}`);
    console.log(`  Agents: ${agentTypes.join(', ')}`);
    console.log();

    const startTime = Date.now();
    const task = await coordinator.coordinate({
      query,
      agents: agentTypes,
      pattern,
      aggregation: 'all',
    });

    console.log(c('Results:\n', 'bold'));
    console.log(`  Status: ${task.status}`);
    console.log(`  Results: ${task.results.length}`);
    if (task.finalResult) {
      const resultStr = typeof task.finalResult === 'string'
        ? task.finalResult
        : JSON.stringify(task.finalResult);
      console.log(`  Final: ${resultStr.slice(0, 200)}${resultStr.length > 200 ? '...' : ''}`);
    }
    console.log(`\n  ${c('Total:', 'cyan')} ${Date.now() - startTime}ms`);
    return;
  }

  if (subcommand === 'pipeline') {
    // Research-Build-Review pipeline
    // Usage: genesis agents pipeline "input"
    const input = options.q || process.argv[4];

    if (!input) {
      console.log(c('Usage: genesis agents pipeline -q "input"', 'yellow'));
      return;
    }

    console.log(c('\n=== Research-Build-Review Pipeline ===\n', 'bold'));
    console.log(`  Input: ${input.slice(0, 60)}${input.length > 60 ? '...' : ''}`);
    console.log();

    const startTime = Date.now();
    const { research, build, review } = await researchBuildReview(input);

    console.log(c('Research:', 'cyan'));
    console.log(`  ${research.success ? c('✓', 'green') : c('✗', 'red')} ${research.agentType} (${research.latency}ms)`);
    console.log(`  ${research.output?.slice(0, 150)}...`);
    console.log();

    console.log(c('Build:', 'cyan'));
    console.log(`  ${build.success ? c('✓', 'green') : c('✗', 'red')} ${build.agentType} (${build.latency}ms)`);
    console.log(`  ${build.output?.slice(0, 150)}...`);
    console.log();

    console.log(c('Review:', 'cyan'));
    console.log(`  ${review.success ? c('✓', 'green') : c('✗', 'red')} ${review.agentType} (${review.latency}ms)`);
    console.log(`  ${review.output?.slice(0, 150)}...`);
    console.log();

    const totalCost = research.cost + build.cost + review.cost;
    console.log(`  ${c('Total:', 'cyan')} ${Date.now() - startTime}ms, $${totalCost.toFixed(4)}`);
    return;
  }

  console.log(c('Unknown agents subcommand. Use: status, parallel, coordinate, pipeline', 'red'));
}

// ============================================================================
// Agentic Command (v14.2: Claude Code-like Interface)
// ============================================================================

async function cmdAgentic(subcommand: string | undefined, options: Record<string, string>): Promise<void> {
  const args: string[] = [];

  // Pass through options
  if (options.model) {
    args.push('--model', options.model);
  }
  if (options.cwd) {
    args.push('--cwd', options.cwd);
  }
  if (options.verbose) {
    args.push('--verbose');
  }

  await runAgenticChat(args);
}

// ============================================================================
// Install Command (v10.1: Self-Installation)
// ============================================================================

async function cmdInstall(options: Record<string, string>): Promise<void> {
  const { execSync, spawn } = await import('child_process');
  let pkg: { version: string };
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8'));
  } catch (err) {
    console.error(c('Error: Could not read package.json', 'red'));
    process.exit(1);
  }
  const version = pkg.version;

  console.log(c(`\n=== Genesis Installation (v${version}) ===\n`, 'bold'));

  // Check current installation
  let currentVersion: string | null = null;
  try {
    const result = execSync('npm list -g genesis-ai-cli --depth=0 2>/dev/null', { encoding: 'utf-8' });
    const match = result.match(/genesis-ai-cli@(\d+\.\d+\.\d+)/);
    if (match) currentVersion = match[1];
  } catch {
    // Not installed globally
  }

  if (currentVersion) {
    console.log(`  ${c('Current:', 'cyan')} v${currentVersion}`);
    if (currentVersion === version) {
      console.log(`  ${c('✓', 'green')} Already up to date!`);
      return;
    }
    console.log(`  ${c('Latest:', 'cyan')}  v${version}`);
    console.log();
  } else {
    console.log(`  ${c('Status:', 'cyan')} Not installed globally`);
    console.log(`  ${c('Latest:', 'cyan')} v${version}`);
    console.log();
  }

  // Install globally
  console.log('Installing globally (may require sudo)...\n');

  try {
    // Try without sudo first
    execSync(`npm install -g genesis-ai-cli@${version}`, {
      stdio: 'inherit',
      timeout: 60000
    });
    console.log(`\n${c('✓', 'green')} Genesis v${version} installed successfully!`);
    console.log(`  Run ${c('genesis help', 'cyan')} to get started.`);
  } catch (err) {
    // Need sudo
    console.log(`\n${c('Permission denied.', 'yellow')} Trying with sudo...\n`);

    try {
      execSync(`sudo npm install -g genesis-ai-cli@${version}`, {
        stdio: 'inherit',
        timeout: 120000
      });
      console.log(`\n${c('✓', 'green')} Genesis v${version} installed successfully!`);
      console.log(`  Run ${c('genesis help', 'cyan')} to get started.`);
    } catch (sudoErr) {
      console.log(`\n${c('✗', 'red')} Installation failed.`);
      console.log(`\nAlternative: Run manually:`);
      console.log(`  ${c(`sudo npm install -g genesis-ai-cli@${version}`, 'dim')}`);
      console.log(`\nOr use npx directly:`);
      console.log(`  ${c(`npx genesis-ai-cli@${version} chat`, 'dim')}`);
    }
  }
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

  // v10.7: Bootstrap integration layer (connects streaming→economy→active-inference→consciousness)
  bootstrapIntegration({
    enableCostTracking: true,
    enableLatencyObservations: true,
    enableConsciousnessUpdates: true,
    enableGovernanceChecks: !!options['governance'],
    enableA2ADelegation: !!options['a2a'],
    slackWebhook: process.env.SLACK_WEBHOOK_URL,
  });

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
      case 'mcp-server':
        // v14.7: Alias for `mcp serve` - easier for Claude Code installation
        // Usage: npx genesis-ai-cli mcp-server
        await cmdMCP('serve', options);
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
      case 'memory':
        // v10.4.2: Unified memory query
        await cmdMemory(positional, options);
        break;
      case 'autonomous':
      case 'auto':
        await cmdAutonomous(positional, options);
        break;
      case 'analyze':
        await cmdAnalyze(positional, options);
        break;
      case 'install':
        await cmdInstall(options);
        break;
      case 'agents':
        await cmdAgents(positional, options);
        break;
      case 'agentic':
      case 'agent':
        // v14.2: Agentic chat interface with Claude Code-like capabilities
        await cmdAgentic(positional, options);
        break;
      case 'bounty':
        // v14.7: Autonomous bounty hunting
        await cmdBounty(positional, options);
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
