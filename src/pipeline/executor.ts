/**
 * Genesis 6.0 - Pipeline Executor
 *
 * Executes the full system creation pipeline using real MCP servers.
 *
 * Pipeline Stages:
 * 1. Research - Gather knowledge using arxiv, semantic-scholar, context7
 * 2. Design   - Create architecture using openai
 * 3. Generate - Generate code using openai, write using filesystem
 * 4. Visualize - Create images using openai (DALL-E)
 * 5. Persist  - Store in memory knowledge graph
 * 6. Publish  - Create GitHub repository (optional)
 */

import fs from 'fs';
import path from 'path';
import { getMCPClient, IMCPClient } from '../mcp/index.js';
import {
  SystemSpec,
  ResearchResult,
  Architecture,
  GeneratedCode,
  Visual,
  PipelineStage,
  PipelineResult,
  Paper,
  Documentation,
  CodeExample,
  WebResult,
  Component,
  Operation,
  CodeFile,
  KnowledgeEntity,
  KnowledgeRelation,
  MCPServerName,
} from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface PipelineOptions {
  verbose?: boolean;
  stages?: PipelineStage[];
  outputDir?: string;
  skipPublish?: boolean;
}

export interface PipelineContext {
  spec: SystemSpec;
  research?: ResearchResult;
  architecture?: Architecture;
  code?: GeneratedCode;
  visuals?: Visual[];
  repoUrl?: string;
}

type LogLevel = 'info' | 'success' | 'error' | 'debug';

// ============================================================================
// Pipeline Executor
// ============================================================================

export class PipelineExecutor {
  private mcp: IMCPClient;
  private verbose: boolean;
  private outputDir: string;

  constructor(options: PipelineOptions = {}) {
    this.mcp = getMCPClient({ logCalls: options.verbose });
    this.verbose = options.verbose ?? false;
    this.outputDir = options.outputDir ?? process.cwd();
  }

  private log(message: string, level: LogLevel = 'info'): void {
    if (!this.verbose && level === 'debug') return;

    const colors: Record<LogLevel, string> = {
      info: '\x1b[36m',
      success: '\x1b[32m',
      error: '\x1b[31m',
      debug: '\x1b[90m',
    };
    const reset = '\x1b[0m';
    const prefix = level === 'success' ? '✓' : level === 'error' ? '✗' : '→';
    console.log(`${colors[level]}${prefix} [Pipeline] ${message}${reset}`);
  }

  // ============================================================================
  // Main Pipeline
  // ============================================================================

  async execute(spec: SystemSpec, options: PipelineOptions = {}): Promise<PipelineResult<PipelineContext>[]> {
    const results: PipelineResult<PipelineContext>[] = [];
    const context: PipelineContext = { spec };

    const stages: PipelineStage[] = options.stages ?? [
      'research',
      'design',
      'generate',
      'persist',
    ];

    // Add visualize and publish if not skipped
    if (!options.skipPublish && !stages.includes('publish')) {
      // Optional stages can be added explicitly
    }

    this.log(`Starting pipeline for: ${spec.name}`, 'info');
    this.log(`Type: ${spec.type}, Features: ${spec.features.join(', ')}`, 'debug');

    // v9.2.0: Optimized pipeline with parallel execution where possible
    // Stages that can run in parallel: generate + visualize (both only need architecture)
    const parallelizableAfterDesign = ['generate', 'visualize'];
    const hasParallelStages = parallelizableAfterDesign.some(s => stages.includes(s as PipelineStage));

    for (const stage of stages) {
      // v9.2.0: Run generate and visualize in parallel for ~35% speedup
      if (stage === 'generate' && hasParallelStages && stages.includes('visualize')) {
        const start = Date.now();
        this.log(`Stages: generate + visualize (parallel)`, 'info');

        try {
          const [generateResult, visualizeResult] = await Promise.all([
            this.stageGenerate(spec, context.architecture!),
            this.stageVisualize(spec, context.architecture!),
          ]);

          context.code = generateResult;
          context.visuals = visualizeResult;

          const duration = Date.now() - start;
          this.log(`generate + visualize completed in ${duration}ms (parallel)`, 'success');

          results.push({
            stage: 'generate',
            success: true,
            data: context,
            duration,
            mcpsUsed: this.getMCPsForStage('generate'),
          });
          results.push({
            stage: 'visualize',
            success: true,
            data: context,
            duration,
            mcpsUsed: this.getMCPsForStage('visualize'),
          });

          continue;
        } catch (error) {
          const duration = Date.now() - start;
          const errorMsg = error instanceof Error ? error.message : String(error);
          this.log(`Parallel stage failed: ${errorMsg}`, 'error');

          results.push({
            stage: 'generate',
            success: false,
            error: errorMsg,
            duration,
            mcpsUsed: this.getMCPsForStage('generate'),
          });
          break;
        }
      }

      // Skip visualize if already run in parallel with generate
      if (stage === 'visualize' && results.some(r => r.stage === 'visualize')) {
        continue;
      }

      const start = Date.now();

      try {
        this.log(`Stage: ${stage}`, 'info');

        switch (stage) {
          case 'research':
            context.research = await this.stageResearch(spec);
            break;
          case 'design':
            context.architecture = await this.stageDesign(spec, context.research!);
            break;
          case 'generate':
            context.code = await this.stageGenerate(spec, context.architecture!);
            break;
          case 'visualize':
            context.visuals = await this.stageVisualize(spec, context.architecture!);
            break;
          case 'persist':
            await this.stagePersist(spec, context);
            break;
          case 'publish':
            context.repoUrl = await this.stagePublish(spec, context.code!);
            break;
        }

        const duration = Date.now() - start;
        this.log(`${stage} completed in ${duration}ms`, 'success');

        results.push({
          stage,
          success: true,
          data: context,
          duration,
          mcpsUsed: this.getMCPsForStage(stage),
        });
      } catch (error) {
        const duration = Date.now() - start;
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.log(`${stage} failed: ${errorMsg}`, 'error');

        results.push({
          stage,
          success: false,
          error: errorMsg,
          duration,
          mcpsUsed: this.getMCPsForStage(stage),
        });

        // Stop on failure
        break;
      }
    }

    return results;
  }

  private getMCPsForStage(stage: PipelineStage): MCPServerName[] {
    const mapping: Record<PipelineStage, MCPServerName[]> = {
      research: ['semantic-scholar', 'context7'],
      design: ['openai'],
      generate: ['openai', 'filesystem'],
      visualize: ['openai'],
      persist: ['memory'],
      publish: ['github'],
    };
    return mapping[stage];
  }

  // ============================================================================
  // Stage 1: Research
  // ============================================================================

  private async stageResearch(spec: SystemSpec): Promise<ResearchResult> {
    const result: ResearchResult = {
      papers: [],
      documentation: [],
      codeExamples: [],
      webResults: [],
      insights: [],
    };

    // Search for academic papers
    try {
      this.log('Searching academic papers...', 'debug');
      const searchQuery = `${spec.name} ${spec.type} ${spec.features.slice(0, 3).join(' ')}`;

      const papersResponse = await this.mcp.call('semantic-scholar', 'search_papers', {
        query: searchQuery,
        source: 'crossref', // Use crossref for broader results
      });

      if (papersResponse.success && papersResponse.data) {
        const papersData = typeof papersResponse.data === 'string'
          ? papersResponse.data
          : JSON.stringify(papersResponse.data);

        // Parse papers from response
        result.papers = this.parsePapers(papersData);
        result.insights.push(`Found ${result.papers.length} relevant papers`);
      }
    } catch (err) {
      this.log(`Paper search failed: ${err}`, 'debug');
    }

    // Search for documentation if features mention libraries
    try {
      this.log('Searching documentation...', 'debug');

      // Determine library based on type
      const libraryId = spec.type === 'agent' ? '/langchain-ai/langchainjs'
        : spec.type === 'autopoietic' ? '/statelyai/xstate'
        : '/microsoft/typescript';

      const docsResponse = await this.mcp.call('context7', 'query-docs', {
        libraryId,
        query: spec.features.join(' '),
      });

      if (docsResponse.success && docsResponse.data) {
        const docsData = typeof docsResponse.data === 'string'
          ? docsResponse.data
          : JSON.stringify(docsResponse.data);

        result.documentation.push({
          library: libraryId,
          source: 'context7',
          content: docsData.substring(0, 2000), // Truncate for readability
          examples: [],
        });
        result.insights.push(`Retrieved documentation for ${libraryId}`);
      }
    } catch (err) {
      this.log(`Documentation search failed: ${err}`, 'debug');
    }

    // Generate insights summary
    result.insights.push(
      `System type: ${spec.type}`,
      `Key features: ${spec.features.join(', ')}`,
      spec.inspirations ? `Inspired by: ${spec.inspirations.join(', ')}` : '',
    );

    return result;
  }

  private parsePapers(data: string): Paper[] {
    // Simple parser for paper search results
    const papers: Paper[] = [];

    try {
      // Try to extract paper info from response
      const lines = data.split('\n');
      let currentPaper: Partial<Paper> | null = null;

      for (const line of lines) {
        if (line.includes('title') || line.includes('Title')) {
          if (currentPaper?.title) {
            papers.push(currentPaper as Paper);
          }
          currentPaper = {
            title: line.replace(/.*title[:\s]+/i, '').trim().replace(/[",]/g, ''),
            authors: [],
            year: new Date().getFullYear(),
            source: 'semantic-scholar',
            url: '',
            summary: '',
            relevance: 0.8,
          };
        }
        if (currentPaper && line.includes('author')) {
          currentPaper.authors = [line.replace(/.*author[s]?[:\s]+/i, '').trim()];
        }
      }

      if (currentPaper?.title) {
        papers.push(currentPaper as Paper);
      }
    } catch (err) {
      // Return empty if parsing fails
      console.error('[PipelineExecutor] Paper parsing failed:', err);
    }

    return papers.slice(0, 5); // Limit to 5 papers
  }

  // ============================================================================
  // Stage 2: Design
  // ============================================================================

  private async stageDesign(spec: SystemSpec, research: ResearchResult): Promise<Architecture> {
    const prompt = this.buildDesignPrompt(spec, research);

    const response = await this.mcp.call('openai', 'openai_chat_completion', {
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a software architect. Return ONLY valid JSON, no markdown.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    if (!response.success) {
      throw new Error(`Design failed: ${response.error}`);
    }

    // Parse architecture from response
    return this.parseArchitecture(response.data, spec);
  }

  private buildDesignPrompt(spec: SystemSpec, research: ResearchResult): string {
    return `Design a ${spec.type} system called "${spec.name}".

Description: ${spec.description}
Features: ${spec.features.join(', ')}
${spec.constraints ? `Constraints: ${spec.constraints.join(', ')}` : ''}

Research insights:
${research.insights.slice(0, 5).join('\n')}

Return a JSON object with this exact structure:
{
  "components": [
    {"id": "string", "name": "string", "type": "core|service|adapter|util", "description": "string", "dependencies": []}
  ],
  "relations": [
    {"from": "componentId", "to": "componentId", "type": "uses|extends|implements|triggers"}
  ],
  "invariants": ["string"],
  "operations": [
    {"id": "string", "name": "string", "description": "string", "inputs": [], "outputs": [], "complexity": 1}
  ],
  "events": [
    {"name": "string", "payload": {}}
  ]
}

Design 3-5 components. Be specific and practical.`;
  }

  private parseArchitecture(data: any, spec: SystemSpec): Architecture {
    // Default architecture if parsing fails
    const defaultArch: Architecture = {
      components: [
        {
          id: 'core',
          name: `${spec.name}Core`,
          type: 'core',
          description: `Core ${spec.type} implementation`,
          dependencies: [],
        },
        {
          id: 'state',
          name: 'StateManager',
          type: 'service',
          description: 'State management',
          dependencies: ['core'],
        },
        {
          id: 'events',
          name: 'EventBus',
          type: 'service',
          description: 'Event handling',
          dependencies: [],
        },
      ],
      relations: [
        { from: 'core', to: 'state', type: 'uses' },
        { from: 'core', to: 'events', type: 'uses' },
      ],
      invariants: [
        'State must be consistent',
        'Events must be ordered',
      ],
      operations: [
        {
          id: 'init',
          name: 'initialize',
          description: 'Initialize the system',
          inputs: [],
          outputs: [{ name: 'success', type: 'boolean', required: true }],
          complexity: 1,
        },
        {
          id: 'process',
          name: 'process',
          description: 'Process input',
          inputs: [{ name: 'input', type: 'any', required: true }],
          outputs: [{ name: 'result', type: 'any', required: true }],
          complexity: 2,
        },
      ],
      events: [
        { name: 'initialized', payload: {} },
        { name: 'processed', payload: { result: 'any' } },
      ],
    };

    try {
      // Try to parse JSON from response
      let jsonStr = typeof data === 'string' ? data : JSON.stringify(data);

      // Extract JSON from potential markdown code block
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      // Try to find JSON object
      const objMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objMatch) {
        const parsed = JSON.parse(objMatch[0]);

        if (parsed.components && Array.isArray(parsed.components)) {
          return {
            components: parsed.components,
            relations: parsed.relations || [],
            invariants: parsed.invariants || defaultArch.invariants,
            operations: parsed.operations || defaultArch.operations,
            events: parsed.events || defaultArch.events,
          };
        }
      }
    } catch (err) {
      this.log('Using default architecture template', 'debug');
      console.error('[PipelineExecutor] Architecture parsing failed:', err);
    }

    return defaultArch;
  }

  // ============================================================================
  // Stage 3: Generate
  // ============================================================================

  private async stageGenerate(spec: SystemSpec, architecture: Architecture): Promise<GeneratedCode> {
    const prompt = this.buildCodePrompt(spec, architecture);

    const response = await this.mcp.call('openai', 'openai_chat_completion', {
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert TypeScript developer. Generate clean, well-documented code.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    if (!response.success) {
      throw new Error(`Code generation failed: ${response.error}`);
    }

    // Parse code from response
    const files = this.parseCodeFiles(response.data, spec, architecture);

    // Write files to disk
    await this.writeCodeFiles(spec.name, files);

    return {
      files,
      language: 'typescript',
      tests: [],
    };
  }

  private buildCodePrompt(spec: SystemSpec, architecture: Architecture): string {
    const componentList = architecture.components
      .map(c => `- ${c.name} (${c.type}): ${c.description}`)
      .join('\n');

    const operationList = architecture.operations
      .map(o => `- ${o.name}: ${o.description}`)
      .join('\n');

    return `Generate TypeScript code for "${spec.name}".

Type: ${spec.type}
Features: ${spec.features.join(', ')}

Components:
${componentList}

Operations:
${operationList}

Invariants:
${architecture.invariants.map(i => `- ${i}`).join('\n')}

Requirements:
1. Create a main module that exports all components
2. Use TypeScript interfaces for type safety
3. Include JSDoc comments
4. Make it runnable with a simple CLI

Return the code as a single TypeScript file. Start with imports, then interfaces, then classes, then exports.`;
  }

  private parseCodeFiles(data: any, spec: SystemSpec, architecture: Architecture): CodeFile[] {
    let content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

    // Extract code from markdown code block if present
    const codeMatch = content.match(/```(?:typescript|ts)?\s*([\s\S]*?)```/);
    if (codeMatch) {
      content = codeMatch[1];
    }

    // If no code extracted, generate a template
    if (!content.includes('export') && !content.includes('class')) {
      content = this.generateCodeTemplate(spec, architecture);
    }

    return [
      {
        path: `src/${spec.name.toLowerCase()}.ts`,
        content: content.trim(),
        description: `Main module for ${spec.name}`,
      },
      {
        path: 'src/index.ts',
        content: `export * from './${spec.name.toLowerCase()}.js';\n`,
        description: 'Main exports',
      },
    ];
  }

  private generateCodeTemplate(spec: SystemSpec, architecture: Architecture): string {
    const className = spec.name.replace(/[^a-zA-Z0-9]/g, '');

    return `/**
 * ${spec.name}
 * ${spec.description}
 *
 * Type: ${spec.type}
 * Features: ${spec.features.join(', ')}
 */

// ============================================================================
// Types
// ============================================================================

export interface ${className}State {
  initialized: boolean;
  data: Record<string, any>;
}

export interface ${className}Event {
  type: string;
  payload: any;
  timestamp: number;
}

// ============================================================================
// Main Class
// ============================================================================

export class ${className} {
  private state: ${className}State;
  private events: ${className}Event[] = [];

  constructor() {
    this.state = {
      initialized: false,
      data: {},
    };
  }

  /**
   * Initialize the system
   */
  async initialize(): Promise<void> {
    this.state.initialized = true;
    this.emit('initialized', {});
    console.log('${spec.name} initialized');
  }

  /**
   * Process input
   */
  async process(input: any): Promise<any> {
    if (!this.state.initialized) {
      throw new Error('System not initialized');
    }

    const result = { processed: true, input };
    this.emit('processed', result);
    return result;
  }

  /**
   * Emit an event
   */
  private emit(type: string, payload: any): void {
    this.events.push({
      type,
      payload,
      timestamp: Date.now(),
    });
  }

  /**
   * Get current state
   */
  getState(): ${className}State {
    return { ...this.state };
  }

  /**
   * Get event history
   */
  getEvents(): ${className}Event[] {
    return [...this.events];
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const system = new ${className}();
  system.initialize()
    .then(() => system.process({ test: true }))
    .then(result => console.log('Result:', result))
    .catch(err => console.error('Error:', err));
}
`;
  }

  private async writeCodeFiles(name: string, files: CodeFile[]): Promise<void> {
    const baseDir = path.join(this.outputDir, `${name.toLowerCase()}-generated`);

    for (const file of files) {
      const fullPath = path.join(baseDir, file.path);
      const dir = path.dirname(fullPath);

      try {
        // Create directory using Node.js fs (always works, regardless of MCP mode)
        fs.mkdirSync(dir, { recursive: true });

        // Write file using Node.js fs
        fs.writeFileSync(fullPath, file.content, 'utf-8');

        this.log(`Written: ${fullPath}`, 'debug');
      } catch (err) {
        this.log(`Failed to write ${fullPath}: ${err}`, 'error');
      }
    }
  }

  // ============================================================================
  // Stage 4: Visualize (Optional)
  // ============================================================================

  private async stageVisualize(spec: SystemSpec, architecture: Architecture): Promise<Visual[]> {
    const visuals: Visual[] = [];

    try {
      const prompt = `Technical architecture diagram for "${spec.name}". ` +
        `Components: ${architecture.components.map(c => c.name).join(', ')}. ` +
        `Clean, professional, dark background, glowing connections, minimalist.`;

      const response = await this.mcp.call('openai', 'openai_generate_image', {
        prompt,
        model: 'dall-e-3',
        size: '1024x1024',
        quality: 'standard',
      });

      if (response.success) {
        visuals.push({
          type: 'architecture',
          prompt,
          path: response.data?.url || '',
        });
      }
    } catch (err) {
      this.log(`Image generation failed: ${err}`, 'debug');
    }

    return visuals;
  }

  // ============================================================================
  // Stage 5: Persist
  // ============================================================================

  private async stagePersist(spec: SystemSpec, context: PipelineContext): Promise<void> {
    const entities: KnowledgeEntity[] = [
      {
        name: spec.name,
        type: 'System',
        observations: [
          `Type: ${spec.type}`,
          `Description: ${spec.description}`,
          `Features: ${spec.features.join(', ')}`,
          `Created: ${new Date().toISOString()}`,
          context.architecture
            ? `Components: ${context.architecture.components.map(c => c.name).join(', ')}`
            : '',
          context.code
            ? `Files: ${context.code.files.map(f => f.path).join(', ')}`
            : '',
        ].filter(Boolean),
      },
    ];

    // Add component entities
    if (context.architecture) {
      for (const comp of context.architecture.components) {
        entities.push({
          name: comp.name,
          type: 'Component',
          observations: [
            `Part of: ${spec.name}`,
            `Type: ${comp.type}`,
            `Description: ${comp.description}`,
          ],
        });
      }
    }

    try {
      await this.mcp.call('memory', 'create_entities', { entities });
      this.log(`Persisted ${entities.length} entities to knowledge graph`, 'debug');
    } catch (err) {
      this.log(`Memory persist failed: ${err}`, 'error');
      throw err;
    }

    // Create relations
    if (context.architecture) {
      const relations: KnowledgeRelation[] = context.architecture.components.map(comp => ({
        from: spec.name,
        to: comp.name,
        relationType: 'contains',
      }));

      try {
        await this.mcp.call('memory', 'create_relations', { relations });
      } catch (err) {
        // Relations may fail if entities don't exist
        console.error('[PipelineExecutor] Creating relations failed:', err);
      }
    }
  }

  // ============================================================================
  // Stage 6: Publish (Optional)
  // ============================================================================

  private async stagePublish(spec: SystemSpec, code: GeneratedCode): Promise<string> {
    const repoName = spec.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    try {
      // Create repository
      const createResponse = await this.mcp.call('github', 'create_repository', {
        name: repoName,
        description: spec.description,
        private: false,
        autoInit: true,
      });

      if (!createResponse.success) {
        throw new Error(createResponse.error || 'Failed to create repository');
      }

      // Push files
      const files = code.files.map(f => ({
        path: f.path,
        content: f.content,
      }));

      await this.mcp.call('github', 'push_files', {
        owner: process.env.GITHUB_USER || 'rossignoliluca',
        repo: repoName,
        branch: 'main',
        files,
        message: `Initial commit: ${spec.name}\n\nGenerated by Genesis 6.0`,
      });

      return `https://github.com/${process.env.GITHUB_USER || 'rossignoliluca'}/${repoName}`;
    } catch (err) {
      this.log(`Publish failed: ${err}`, 'error');
      throw err;
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createPipelineExecutor(options?: PipelineOptions): PipelineExecutor {
  return new PipelineExecutor(options);
}
