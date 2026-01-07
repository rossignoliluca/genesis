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
import { SystemSpec, MCPServer } from './types.js';
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

  console.log(c('\nPipeline stages:', 'cyan'));
  const stages = ['research', 'design', 'generate', 'visualize', 'persist', 'publish'];
  for (const stage of stages) {
    console.log(`  ${c('○', 'yellow')} ${stage}`);
  }

  console.log(c('\nTo execute, run:', 'dim'));
  console.log(c(`\n  genesis create "${name}" --execute\n`, 'green'));

  // Save spec for reference
  const specPath = path.join(process.cwd(), `${name}.genesis.json`);
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
  console.log(c(`Spec saved to: ${specPath}`, 'dim'));
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

function cmdHelp(): void {
  printBanner();
  console.log(`${c('Usage:', 'bold')}
  genesis <command> [options]

${c('Commands:', 'bold')}
  ${c('create', 'green')} <name>         Create a new system
    --type <type>        System type: autopoietic, agent, multi-agent, service
    --description <desc> System description
    --features <f1,f2>   Comma-separated features
    --inspirations <i>   Papers/projects to draw from

  ${c('research', 'green')} <topic>      Research a topic using all knowledge MCPs
  ${c('design', 'green')} <spec-file>    Design architecture from spec
  ${c('generate', 'green')} <spec-file>  Generate code from spec
  ${c('visualize', 'green')} <spec-file> Create visual assets
  ${c('publish', 'green')} <spec-file>   Publish to GitHub

  ${c('status', 'green')}                Show MCP servers status
  ${c('help', 'green')}                  Show this help

${c('MCP Servers (13):', 'bold')}
  ${c('KNOWLEDGE:', 'blue')}  arxiv, semantic-scholar, context7, wolfram
  ${c('RESEARCH:', 'yellow')}   gemini, brave-search, exa, firecrawl
  ${c('CREATION:', 'green')}   openai, github
  ${c('VISUAL:', 'magenta')}     stability-ai
  ${c('STORAGE:', 'cyan')}    memory, filesystem

${c('Examples:', 'bold')}
  genesis create my-agent --type agent --features "state-machine,events"
  genesis research "autopoiesis in AI systems"
  genesis design my-agent.genesis.json
  genesis generate my-agent.genesis.json
  genesis visualize my-agent.genesis.json
  genesis publish my-agent.genesis.json
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
