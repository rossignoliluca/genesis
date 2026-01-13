/**
 * Genesis - MCP Orchestrator
 *
 * Central hub that coordinates all 13 MCP servers for system creation.
 *
 * MCP Servers:
 * - KNOWLEDGE: arxiv, semantic-scholar, context7, wolfram
 * - RESEARCH:  gemini, brave-search, exa, firecrawl
 * - CREATION:  openai, github
 * - VISUAL:    stability-ai
 * - STORAGE:   memory, filesystem
 */

import {
  MCPServerName,
  MCPCapability,
  SystemSpec,
  ResearchResult,
  Architecture,
  GeneratedCode,
  Visual,
  PipelineStage,
  PipelineResult,
  Paper,
  KnowledgeEntity,
  KnowledgeRelation,
} from './types.js';

// ============================================================================
// MCP Capability Map
// ============================================================================

export const MCP_CAPABILITIES: Record<MCPServerName, MCPCapability> = {
  // Knowledge MCPs
  'arxiv': {
    server: 'arxiv',
    category: 'knowledge',
    tools: ['search_arxiv', 'parse_paper_content', 'get_recent_ai_papers'],
    description: 'Academic papers from arXiv',
  },
  'semantic-scholar': {
    server: 'semantic-scholar',
    category: 'knowledge',
    tools: ['search_semantic_scholar', 'get_paper', 'get_citations'],
    description: 'Academic paper search with citations',
  },
  'context7': {
    server: 'context7',
    category: 'knowledge',
    tools: ['resolve-library-id', 'query-docs'],
    description: 'Programming library documentation',
  },
  'wolfram': {
    server: 'wolfram',
    category: 'knowledge',
    tools: ['wolfram_query'],
    description: 'Mathematical and scientific computations',
  },

  // Research MCPs
  'gemini': {
    server: 'gemini',
    category: 'research',
    tools: ['web_search', 'web_search_batch'],
    description: 'Web search with Gemini AI',
  },
  'brave-search': {
    server: 'brave-search',
    category: 'research',
    tools: ['brave_web_search', 'brave_news_search', 'brave_image_search'],
    description: 'Web, news, and image search',
  },
  'exa': {
    server: 'exa',
    category: 'research',
    tools: ['web_search_exa', 'get_code_context_exa'],
    description: 'Code-focused search',
  },
  'firecrawl': {
    server: 'firecrawl',
    category: 'research',
    tools: ['firecrawl_scrape', 'firecrawl_search', 'firecrawl_extract'],
    description: 'Web scraping and extraction',
  },

  // Creation MCPs
  'openai': {
    server: 'openai',
    category: 'creation',
    tools: ['openai_chat'],
    description: 'GPT-4o, o1 for code generation',
  },
  'github': {
    server: 'github',
    category: 'creation',
    tools: ['create_repository', 'push_files', 'create_pull_request'],
    description: 'Repository management',
  },

  // Visual MCPs
  'stability-ai': {
    server: 'stability-ai',
    category: 'visual',
    tools: ['generate-image', 'generate-image-sd35'],
    description: 'Image generation',
  },

  // Storage MCPs
  'memory': {
    server: 'memory',
    category: 'storage',
    tools: ['create_entities', 'create_relations', 'read_graph', 'search_nodes'],
    description: 'Knowledge graph persistence',
  },
  'filesystem': {
    server: 'filesystem',
    category: 'storage',
    tools: ['read_file', 'write_file', 'list_directory'],
    description: 'Local file operations',
  },

  // v7.14 - Web & Automation MCPs
  'playwright': {
    server: 'playwright',
    category: 'creation',
    tools: ['browser_navigate', 'browser_snapshot', 'browser_click', 'browser_type'],
    description: 'Browser automation and web testing',
  },
  'aws': {
    server: 'aws',
    category: 'creation',
    tools: ['cloud_servers', 'serverless_functions', 'cloud_storage', 'databases'],
    description: 'AWS cloud infrastructure management',
  },
  'sentry': {
    server: 'sentry',
    category: 'research',
    tools: ['search_issues', 'get_issue_details', 'search_events'],
    description: 'Error monitoring and performance tracking',
  },
  'postgres': {
    server: 'postgres',
    category: 'storage',
    tools: ['query'],
    description: 'PostgreSQL database queries',
  },
};

// ============================================================================
// Orchestrator Class
// ============================================================================

export class MCPOrchestrator {
  private verbose: boolean;

  constructor(options: { verbose?: boolean } = {}) {
    this.verbose = options.verbose ?? false;
  }

  private log(message: string): void {
    if (this.verbose) {
      console.log(`[Genesis] ${message}`);
    }
  }

  /**
   * Get all MCPs for a category
   */
  getMCPsByCategory(category: MCPCapability['category']): MCPServerName[] {
    return Object.entries(MCP_CAPABILITIES)
      .filter(([_, cap]) => cap.category === category)
      .map(([server]) => server as MCPServerName);
  }

  /**
   * Research a topic using all knowledge MCPs in parallel
   */
  async research(topic: string, spec?: SystemSpec): Promise<ResearchResult> {
    this.log(`Researching: ${topic}`);

    const result: ResearchResult = {
      papers: [],
      documentation: [],
      codeExamples: [],
      webResults: [],
      insights: [],
    };

    // This would be implemented by the MCP caller
    // The orchestrator defines WHAT to call, the system executes

    return result;
  }

  /**
   * Generate system architecture using AI models
   */
  async design(spec: SystemSpec, research: ResearchResult): Promise<Architecture> {
    this.log(`Designing architecture for: ${spec.name}`);

    // Architecture generation prompt template
    const architecturePrompt = this.buildArchitecturePrompt(spec, research);

    return {
      components: [],
      relations: [],
      invariants: [],
      operations: [],
      events: [],
    };
  }

  /**
   * Generate code from architecture
   */
  async generate(
    spec: SystemSpec,
    architecture: Architecture
  ): Promise<GeneratedCode> {
    this.log(`Generating code for: ${spec.name}`);

    return {
      files: [],
      language: 'typescript',
      tests: [],
    };
  }

  /**
   * Create visualizations
   */
  async visualize(
    spec: SystemSpec,
    architecture: Architecture
  ): Promise<Visual[]> {
    this.log(`Creating visuals for: ${spec.name}`);

    return [];
  }

  /**
   * Persist to knowledge graph
   */
  async persist(
    spec: SystemSpec,
    entities: KnowledgeEntity[],
    relations: KnowledgeRelation[]
  ): Promise<void> {
    this.log(`Persisting ${entities.length} entities to knowledge graph`);
  }

  /**
   * Publish to GitHub
   */
  async publish(
    spec: SystemSpec,
    code: GeneratedCode
  ): Promise<string> {
    this.log(`Publishing ${spec.name} to GitHub`);
    return '';
  }

  // ============================================================================
  // Prompt Builders
  // ============================================================================

  buildResearchPrompt(topic: string, sources: MCPServerName[]): string {
    return `
Research the topic: "${topic}"

Use the following MCP sources in parallel:
${sources.map(s => `- ${s}: ${MCP_CAPABILITIES[s].description}`).join('\n')}

Return:
1. Key papers (arxiv, semantic-scholar)
2. Relevant documentation (context7)
3. Code examples (exa, github)
4. Web insights (gemini, brave-search, firecrawl)
5. Synthesized insights
    `.trim();
  }

  buildArchitecturePrompt(spec: SystemSpec, research: ResearchResult): string {
    return `
Design a system architecture for: "${spec.name}"

Description: ${spec.description}
Type: ${spec.type}
Features: ${spec.features.join(', ')}
${spec.constraints ? `Constraints: ${spec.constraints.join(', ')}` : ''}

Research insights:
${research.insights.join('\n')}

Generate:
1. Components with dependencies
2. Relations between components
3. Invariants the system must maintain
4. Operations the system can perform
5. Events the system emits
    `.trim();
  }

  buildCodePrompt(
    spec: SystemSpec,
    architecture: Architecture,
    language: 'typescript' | 'python' | 'rust'
  ): string {
    return `
Generate ${language} code for: "${spec.name}"

Architecture:
- Components: ${architecture.components.map(c => c.name).join(', ')}
- Operations: ${architecture.operations.map(o => o.id).join(', ')}
- Invariants: ${architecture.invariants.join('; ')}

Requirements:
1. Full implementation of all components
2. Type safety
3. Error handling
4. Unit tests for each component
5. CLI entry point
    `.trim();
  }

  buildVisualPrompt(spec: SystemSpec, type: Visual['type']): string {
    const prompts: Record<Visual['type'], string> = {
      architecture: `Technical architecture diagram for "${spec.name}". Show components as nodes, relations as edges. Clean, professional style. Dark background, glowing connections.`,
      concept: `Conceptual visualization of "${spec.name}". Abstract, artistic interpretation of: ${spec.description}. Ethereal, modern digital art style.`,
      flow: `Data flow diagram for "${spec.name}". Show how data moves through the system. Arrows, pipelines, transformations. Technical illustration style.`,
      logo: `Minimalist logo for "${spec.name}". Modern, tech-inspired. Simple geometric shapes. Can work on light and dark backgrounds.`,
    };
    return prompts[type];
  }
}

// ============================================================================
// Pipeline Runner
// ============================================================================

export class GenesisPipeline {
  private orchestrator: MCPOrchestrator;

  constructor(orchestrator: MCPOrchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Run the full system creation pipeline
   */
  async run(spec: SystemSpec): Promise<PipelineResult<any>[]> {
    const results: PipelineResult<any>[] = [];
    const stages: PipelineStage[] = [
      'research',
      'design',
      'generate',
      'visualize',
      'persist',
      'publish',
    ];

    for (const stage of stages) {
      const start = Date.now();
      try {
        // Each stage would be executed by the MCP caller
        results.push({
          stage,
          success: true,
          duration: Date.now() - start,
          mcpsUsed: this.getMCPsForStage(stage),
        });
      } catch (error) {
        results.push({
          stage,
          success: false,
          error: String(error),
          duration: Date.now() - start,
          mcpsUsed: this.getMCPsForStage(stage),
        });
        break;
      }
    }

    return results;
  }

  private getMCPsForStage(stage: PipelineStage): MCPServerName[] {
    const stageToMCPs: Record<PipelineStage, MCPServerName[]> = {
      research: ['arxiv', 'semantic-scholar', 'context7', 'gemini', 'brave-search', 'exa', 'firecrawl'],
      design: ['openai', 'wolfram'],
      generate: ['openai', 'context7'],
      visualize: ['stability-ai'],
      persist: ['memory', 'filesystem'],
      publish: ['github'],
    };
    return stageToMCPs[stage];
  }
}

// ============================================================================
// Export
// ============================================================================

export function createOrchestrator(options?: { verbose?: boolean }): MCPOrchestrator {
  return new MCPOrchestrator(options);
}
