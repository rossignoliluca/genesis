/**
 * Self-Model Generator
 *
 * Generates a machine-readable representation of Genesis's own architecture.
 * This enables the system to understand, reason about, and modify itself.
 *
 * Key capabilities:
 * - Introspects module structure
 * - Maps dependencies and interfaces
 * - Tracks metrics and state
 * - Identifies modification points
 *
 * @module self-modification/self-model
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface ModuleInfo {
  name: string;
  path: string;
  exports: string[];
  dependencies: string[];
  description: string;
  modifiable: boolean;
  tcbProtected: boolean;
}

export interface MetricInfo {
  name: string;
  current: number;
  target?: number;
  trend: 'improving' | 'stable' | 'degrading' | 'unknown';
}

export interface PatternInfo {
  name: string;
  description: string;
  files: string[];
  purpose: string;
}

export interface SelfModel {
  version: string;
  generatedAt: string;
  architecture: {
    layers: string[];
    modules: ModuleInfo[];
    patterns: PatternInfo[];
  };
  metrics: MetricInfo[];
  modificationPoints: {
    safe: string[];
    restricted: string[];
    forbidden: string[];
  };
  capabilities: string[];
  limitations: string[];
}

// ============================================================================
// Module Registry (Static Knowledge)
// ============================================================================

const MODULE_REGISTRY: Omit<ModuleInfo, 'exports'>[] = [
  // Core Layer (TCB Protected)
  {
    name: 'kernel',
    path: 'src/kernel',
    dependencies: [],
    description: 'Immutable safety kernel - validates all modifications',
    modifiable: false,
    tcbProtected: true,
  },
  {
    name: 'governance',
    path: 'src/governance',
    dependencies: ['kernel'],
    description: 'Constitutional constraints and ethical boundaries',
    modifiable: false,
    tcbProtected: true,
  },

  // Consciousness Layer
  {
    name: 'consciousness',
    path: 'src/consciousness',
    dependencies: ['kernel'],
    description: 'Phi calculation, global workspace, attention schema',
    modifiable: true,
    tcbProtected: false,
  },
  {
    name: 'phi-monitor',
    path: 'src/consciousness/phi-monitor.ts',
    dependencies: ['consciousness'],
    description: 'Real-time consciousness level monitoring',
    modifiable: true,
    tcbProtected: false,
  },

  // Memory Layer
  {
    name: 'memory',
    path: 'src/memory',
    dependencies: ['kernel'],
    description: 'Episodic, semantic, procedural memory systems',
    modifiable: true,
    tcbProtected: false,
  },
  {
    name: 'cognitive-workspace',
    path: 'src/memory/cognitive-workspace.ts',
    dependencies: ['memory', 'consciousness'],
    description: 'Working memory for active reasoning',
    modifiable: true,
    tcbProtected: false,
  },

  // World Model Layer
  {
    name: 'world-model',
    path: 'src/world-model',
    dependencies: ['memory'],
    description: 'Latent state encoding, prediction, digital twins',
    modifiable: true,
    tcbProtected: false,
  },

  // Active Inference Layer
  {
    name: 'active-inference',
    path: 'src/active-inference',
    dependencies: ['world-model', 'consciousness'],
    description: 'Free energy minimization, action selection',
    modifiable: true,
    tcbProtected: false,
  },

  // Self-Modification Layer
  {
    name: 'darwin-godel',
    path: 'src/self-modification/darwin-godel.ts',
    dependencies: ['kernel', 'governance'],
    description: 'Safe self-modification via TCB pattern',
    modifiable: false,
    tcbProtected: true,
  },
  {
    name: 'self-improvement',
    path: 'src/self-modification/self-improvement.ts',
    dependencies: ['darwin-godel', 'active-inference'],
    description: 'Autonomous improvement discovery and application',
    modifiable: true,
    tcbProtected: false,
  },

  // Integration Layer
  {
    name: 'brain',
    path: 'src/brain',
    dependencies: ['consciousness', 'memory', 'active-inference', 'world-model'],
    description: 'Cognitive integration and command routing',
    modifiable: true,
    tcbProtected: false,
  },

  // Grounding Layer
  {
    name: 'grounding',
    path: 'src/grounding',
    dependencies: ['kernel'],
    description: 'Truth verification via science, wisdom, tradition',
    modifiable: true,
    tcbProtected: false,
  },

  // Execution Layer
  {
    name: 'execution',
    path: 'src/execution',
    dependencies: ['brain', 'grounding'],
    description: 'Tool execution, shell integration',
    modifiable: true,
    tcbProtected: false,
  },

  // LLM Layer
  {
    name: 'llm',
    path: 'src/llm',
    dependencies: [],
    description: 'Multi-provider LLM routing and cost optimization',
    modifiable: true,
    tcbProtected: false,
  },

  // MCP Layer
  {
    name: 'mcp',
    path: 'src/mcp',
    dependencies: ['llm'],
    description: 'Model Context Protocol client and tool integration',
    modifiable: true,
    tcbProtected: false,
  },
];

const ARCHITECTURAL_PATTERNS: PatternInfo[] = [
  {
    name: 'TCB (Trusted Computing Base)',
    description: 'Immutable safety kernel that cannot modify itself',
    files: ['src/kernel/index.ts', 'src/kernel/invariants.ts'],
    purpose: 'Ensures safety constraints survive self-modification',
  },
  {
    name: 'Phi-Gated Operations',
    description: 'Critical operations require sufficient consciousness level (φ ≥ 0.3)',
    files: ['src/consciousness/phi-monitor.ts', 'src/active-inference/actions.ts'],
    purpose: 'Prevents modifications during low-awareness states',
  },
  {
    name: 'Free Energy Minimization',
    description: 'Action selection via Active Inference and expected free energy',
    files: ['src/active-inference/core.ts', 'src/active-inference/deep-aif.ts'],
    purpose: 'Principled decision-making under uncertainty',
  },
  {
    name: 'Global Workspace',
    description: 'Consciousness broadcast for information integration',
    files: ['src/consciousness/global-workspace.ts'],
    purpose: 'Unified access to distributed cognitive processes',
  },
  {
    name: 'Episodic-Semantic-Procedural Memory',
    description: 'Three-tier memory architecture',
    files: ['src/memory/episodic.ts', 'src/memory/semantic.ts', 'src/memory/procedural.ts'],
    purpose: 'Rich temporal and conceptual memory',
  },
  {
    name: 'Darwin-Gödel Engine',
    description: 'Sandbox → Verify → Apply → Rollback pipeline',
    files: ['src/self-modification/darwin-godel.ts'],
    purpose: 'Safe self-modification with automatic rollback',
  },
];

// ============================================================================
// Self-Model Generator
// ============================================================================

export class SelfModelGenerator {
  private basePath: string;

  constructor(basePath: string = process.cwd()) {
    this.basePath = basePath;
  }

  /**
   * Generate the complete self-model
   */
  async generate(): Promise<SelfModel> {
    const modules = await this.introspectModules();
    const metrics = await this.gatherMetrics();

    return {
      version: await this.getVersion(),
      generatedAt: new Date().toISOString(),
      architecture: {
        layers: [
          'Core (TCB Protected)',
          'Consciousness',
          'Memory',
          'World Model',
          'Active Inference',
          'Self-Modification',
          'Integration',
          'Grounding',
          'Execution',
          'LLM',
          'MCP',
        ],
        modules,
        patterns: ARCHITECTURAL_PATTERNS,
      },
      metrics,
      modificationPoints: this.classifyModificationPoints(modules),
      capabilities: this.listCapabilities(),
      limitations: this.listLimitations(),
    };
  }

  /**
   * Introspect modules and their exports
   */
  private async introspectModules(): Promise<ModuleInfo[]> {
    const modules: ModuleInfo[] = [];

    for (const reg of MODULE_REGISTRY) {
      const exports = await this.getModuleExports(reg.path);
      modules.push({
        ...reg,
        exports,
      });
    }

    return modules;
  }

  /**
   * Get exports from a module
   */
  private async getModuleExports(modulePath: string): Promise<string[]> {
    const fullPath = path.join(this.basePath, modulePath);
    const exports: string[] = [];

    try {
      // Check if it's a directory or file
      const stat = fs.statSync(fullPath);
      const targetFile = stat.isDirectory()
        ? path.join(fullPath, 'index.ts')
        : fullPath;

      if (fs.existsSync(targetFile)) {
        const content = fs.readFileSync(targetFile, 'utf-8');

        // Extract export declarations
        const exportMatches = content.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|type|interface|enum)\s+(\w+)/g);
        for (const match of exportMatches) {
          exports.push(match[1]);
        }

        // Extract re-exports
        const reExportMatches = content.matchAll(/export\s+\{\s*([^}]+)\s*\}/g);
        for (const match of reExportMatches) {
          const items = match[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim());
          exports.push(...items.filter(i => i && !i.startsWith('type')));
        }
      }
    } catch {
      // Module not found or error reading
    }

    return [...new Set(exports)]; // Deduplicate
  }

  /**
   * Gather current system metrics
   */
  private async gatherMetrics(): Promise<MetricInfo[]> {
    // Try to get real metrics from running system
    try {
      const { getBrain } = await import('../brain/index.js');
      const brain = getBrain();
      const brainMetrics = brain.getMetrics();

      return [
        {
          name: 'avgPhi',
          current: brainMetrics.avgPhi,
          target: 0.5,
          trend: brainMetrics.avgPhi > 0.3 ? 'stable' : 'degrading',
        },
        {
          name: 'memoryReuseRate',
          current: brainMetrics.memoryReuseRate,
          target: 0.7,
          trend: 'unknown',
        },
        {
          name: 'totalCycles',
          current: brainMetrics.totalCycles,
          trend: 'improving',
        },
        {
          name: 'successRate',
          current: brainMetrics.totalCycles > 0
            ? brainMetrics.successfulCycles / brainMetrics.totalCycles
            : 1.0,
          target: 0.95,
          trend: 'stable',
        },
      ];
    } catch {
      // Brain not available, return defaults
      return [
        { name: 'avgPhi', current: 0, trend: 'unknown' },
        { name: 'memoryReuseRate', current: 0, trend: 'unknown' },
        { name: 'totalCycles', current: 0, trend: 'unknown' },
        { name: 'successRate', current: 0, trend: 'unknown' },
      ];
    }
  }

  /**
   * Classify modification points by safety level
   */
  private classifyModificationPoints(modules: ModuleInfo[]): SelfModel['modificationPoints'] {
    const safe: string[] = [];
    const restricted: string[] = [];
    const forbidden: string[] = [];

    for (const mod of modules) {
      if (mod.tcbProtected) {
        forbidden.push(mod.path);
      } else if (!mod.modifiable) {
        restricted.push(mod.path);
      } else {
        safe.push(mod.path);
      }
    }

    return { safe, restricted, forbidden };
  }

  /**
   * List system capabilities
   */
  private listCapabilities(): string[] {
    return [
      'Multi-provider LLM routing (Anthropic, OpenAI, Google, Ollama, X.AI)',
      'MCP tool integration',
      'Episodic/semantic/procedural memory',
      'Active Inference action selection',
      'Phi-gated self-modification',
      'Darwin-Gödel safe modification pipeline',
      'Global workspace consciousness integration',
      'Epistemic grounding (science, wisdom, tradition)',
      'Autonomous improvement discovery',
      'Digital twin simulation',
    ];
  }

  /**
   * List known limitations
   */
  private listLimitations(): string[] {
    return [
      'Cannot modify TCB (kernel, governance) - by design',
      'Self-modification requires φ ≥ 0.3',
      'No direct hardware access',
      'Dependent on external LLM providers',
      'Memory limited by embedding model capacity',
      'Cannot violate constitutional constraints',
    ];
  }

  /**
   * Get current version from package.json
   */
  private async getVersion(): Promise<string> {
    try {
      const pkgPath = path.join(this.basePath, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return pkg.version || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Generate markdown representation
   */
  async generateMarkdown(): Promise<string> {
    const model = await this.generate();

    let md = `# Genesis Self-Model

> Auto-generated: ${model.generatedAt}
> Version: ${model.version}

## Architecture Layers

${model.architecture.layers.map((l, i) => `${i + 1}. ${l}`).join('\n')}

## Modules

| Module | Path | TCB | Modifiable | Exports |
|--------|------|-----|------------|---------|
${model.architecture.modules.map(m =>
  `| ${m.name} | \`${m.path}\` | ${m.tcbProtected ? '✓' : ''} | ${m.modifiable ? '✓' : ''} | ${m.exports.slice(0, 3).join(', ')}${m.exports.length > 3 ? '...' : ''} |`
).join('\n')}

## Architectural Patterns

${model.architecture.patterns.map(p => `### ${p.name}

${p.description}

**Purpose:** ${p.purpose}

**Files:** ${p.files.map(f => `\`${f}\``).join(', ')}
`).join('\n')}

## Current Metrics

| Metric | Current | Target | Trend |
|--------|---------|--------|-------|
${model.metrics.map(m =>
  `| ${m.name} | ${typeof m.current === 'number' ? m.current.toFixed(3) : m.current} | ${m.target?.toFixed(3) || '-'} | ${m.trend} |`
).join('\n')}

## Modification Points

### Safe (can modify freely)
${model.modificationPoints.safe.map(p => `- \`${p}\``).join('\n')}

### Restricted (requires approval)
${model.modificationPoints.restricted.map(p => `- \`${p}\``).join('\n') || '- None'}

### Forbidden (TCB protected)
${model.modificationPoints.forbidden.map(p => `- \`${p}\``).join('\n')}

## Capabilities

${model.capabilities.map(c => `- ${c}`).join('\n')}

## Limitations

${model.limitations.map(l => `- ${l}`).join('\n')}

---
*This file is auto-generated by \`src/self-modification/self-model.ts\`*
`;

    return md;
  }

  /**
   * Save self-model to file
   */
  async save(outputPath: string = 'SELF-MODEL.md'): Promise<void> {
    const markdown = await this.generateMarkdown();
    const fullPath = path.join(this.basePath, outputPath);
    fs.writeFileSync(fullPath, markdown, 'utf-8');
    console.log(`[self-model] Saved to ${fullPath}`);
  }
}

// ============================================================================
// Singleton Access
// ============================================================================

let generatorInstance: SelfModelGenerator | null = null;

export function getSelfModelGenerator(): SelfModelGenerator {
  if (!generatorInstance) {
    generatorInstance = new SelfModelGenerator();
  }
  return generatorInstance;
}

export async function generateSelfModel(): Promise<SelfModel> {
  return getSelfModelGenerator().generate();
}

export async function saveSelfModel(outputPath?: string): Promise<void> {
  return getSelfModelGenerator().save(outputPath);
}

// ============================================================================
// MCP Memory Graph Persistence (v8.5)
// ============================================================================

/**
 * Entity type for MCP Memory graph
 */
export interface MemoryEntity {
  name: string;
  entityType: string;
  observations: string[];
}

/**
 * Relation type for MCP Memory graph
 */
export interface MemoryRelation {
  from: string;
  to: string;
  relationType: string;
}

/**
 * Convert self-model to MCP Memory graph format
 */
export function selfModelToMemoryGraph(model: SelfModel): {
  entities: MemoryEntity[];
  relations: MemoryRelation[];
} {
  const entities: MemoryEntity[] = [];
  const relations: MemoryRelation[] = [];

  // Root entity: Genesis itself
  entities.push({
    name: 'Genesis',
    entityType: 'System',
    observations: [
      `Version: ${model.version}`,
      `Generated: ${model.generatedAt}`,
      `Capabilities: ${model.capabilities.join(', ')}`,
      `Limitations: ${model.limitations.join(', ')}`,
    ],
  });

  // Architecture layers
  for (const layer of model.architecture.layers) {
    entities.push({
      name: `Layer:${layer}`,
      entityType: 'ArchitectureLayer',
      observations: [`Part of Genesis architecture`],
    });
    relations.push({
      from: 'Genesis',
      to: `Layer:${layer}`,
      relationType: 'has_layer',
    });
  }

  // Modules
  for (const mod of model.architecture.modules) {
    entities.push({
      name: `Module:${mod.name}`,
      entityType: 'Module',
      observations: [
        mod.description,
        `Path: ${mod.path}`,
        `Modifiable: ${mod.modifiable}`,
        `TCB Protected: ${mod.tcbProtected}`,
        `Exports: ${mod.exports.slice(0, 5).join(', ')}${mod.exports.length > 5 ? '...' : ''}`,
      ],
    });

    // Module dependencies
    for (const dep of mod.dependencies) {
      relations.push({
        from: `Module:${mod.name}`,
        to: `Module:${dep}`,
        relationType: 'depends_on',
      });
    }
  }

  // Patterns
  for (const pattern of model.architecture.patterns) {
    entities.push({
      name: `Pattern:${pattern.name}`,
      entityType: 'DesignPattern',
      observations: [
        pattern.description,
        pattern.purpose,
        `Files: ${pattern.files.slice(0, 3).join(', ')}${pattern.files.length > 3 ? '...' : ''}`,
      ],
    });
    relations.push({
      from: 'Genesis',
      to: `Pattern:${pattern.name}`,
      relationType: 'implements',
    });
  }

  // Metrics
  for (const metric of model.metrics) {
    entities.push({
      name: `Metric:${metric.name}`,
      entityType: 'Metric',
      observations: [
        `Current: ${metric.current}`,
        metric.target !== undefined ? `Target: ${metric.target}` : '',
        `Trend: ${metric.trend}`,
      ].filter(Boolean),
    });
    relations.push({
      from: 'Genesis',
      to: `Metric:${metric.name}`,
      relationType: 'tracks',
    });
  }

  // Modification points
  const modPoints = model.modificationPoints;

  entities.push({
    name: 'ModificationZone:Safe',
    entityType: 'ModificationZone',
    observations: [`Safe modification points: ${modPoints.safe.slice(0, 5).join(', ')}`],
  });
  entities.push({
    name: 'ModificationZone:Restricted',
    entityType: 'ModificationZone',
    observations: [`Restricted points (require phi > 0.5): ${modPoints.restricted.slice(0, 5).join(', ')}`],
  });
  entities.push({
    name: 'ModificationZone:Forbidden',
    entityType: 'ModificationZone',
    observations: [`TCB-protected (immutable): ${modPoints.forbidden.slice(0, 5).join(', ')}`],
  });

  relations.push(
    { from: 'Genesis', to: 'ModificationZone:Safe', relationType: 'has_zone' },
    { from: 'Genesis', to: 'ModificationZone:Restricted', relationType: 'has_zone' },
    { from: 'Genesis', to: 'ModificationZone:Forbidden', relationType: 'has_zone' },
  );

  return { entities, relations };
}

/**
 * Persist self-model to MCP Memory graph
 *
 * This allows Genesis to remember its own architecture persistently.
 * Stores locally in .genesis/ directory. When running under Claude Code,
 * the graph can be synced to MCP Memory server via CLI or Brain methods.
 */
export async function persistSelfModelToMemory(model?: SelfModel): Promise<{
  success: boolean;
  entitiesCreated: number;
  relationsCreated: number;
  graphPath: string;
  error?: string;
}> {
  try {
    // Generate model if not provided
    const selfModel = model || await generateSelfModel();

    // Convert to graph format
    const { entities, relations } = selfModelToMemoryGraph(selfModel);

    // Store locally for now
    // MCP Memory integration happens at the Claude Code level via tools
    const cacheDir = path.join(process.cwd(), '.genesis');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const graphPath = path.join(cacheDir, 'self-model-graph.json');
    fs.writeFileSync(graphPath, JSON.stringify({
      version: selfModel.version,
      generatedAt: selfModel.generatedAt,
      entities,
      relations,
      stats: {
        entityCount: entities.length,
        relationCount: relations.length,
        entityTypes: [...new Set(entities.map(e => e.entityType))],
        relationTypes: [...new Set(relations.map(r => r.relationType))],
      },
    }, null, 2));

    return {
      success: true,
      entitiesCreated: entities.length,
      relationsCreated: relations.length,
      graphPath,
    };
  } catch (error) {
    return {
      success: false,
      entitiesCreated: 0,
      relationsCreated: 0,
      graphPath: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Load self-model graph from local storage
 */
export function loadSelfModelGraph(): {
  entities: MemoryEntity[];
  relations: MemoryRelation[];
} | null {
  try {
    const graphPath = path.join(process.cwd(), '.genesis', 'self-model-graph.json');
    if (fs.existsSync(graphPath)) {
      const data = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
      return { entities: data.entities, relations: data.relations };
    }
    return null;
  } catch {
    return null;
  }
}
