/**
 * Genesis RSI - RESEARCH Subsystem
 *
 * Searches for solutions to detected limitations through:
 * - Academic papers (arXiv, Semantic Scholar)
 * - Code repositories (GitHub)
 * - Web documentation
 * - Internal memory (past solutions)
 *
 * Synthesizes knowledge from multiple sources into actionable insights.
 *
 * @module rsi/research
 */

import { randomUUID } from 'crypto';
import {
  Limitation, Opportunity, ResearchSource, ResearchQuery, SynthesizedKnowledge
} from '../types.js';
import { getMCPClient } from '../../mcp/index.js';
import { getMemorySystem } from '../../memory/index.js';

// =============================================================================
// RESEARCH CONFIGURATION
// =============================================================================

export interface ResearchConfig {
  maxResultsPerSource: number;
  minRelevanceScore: number;
  timeoutMs: number;
  enabledSources: ('arxiv' | 'semantic-scholar' | 'github' | 'web' | 'memory')[];
  mockResearch?: boolean; // v15.1: Use synthetic research for testing
}

export const DEFAULT_RESEARCH_CONFIG: ResearchConfig = {
  maxResultsPerSource: 5,
  minRelevanceScore: 0.3,
  timeoutMs: 30000,
  enabledSources: ['memory', 'github', 'arxiv', 'web'],
  mockResearch: false,
};

// =============================================================================
// MOCK RESEARCH GENERATOR (v15.1)
// =============================================================================

const MOCK_RESEARCH_TEMPLATES: Record<string, ResearchSource[]> = {
  'autonomous-code-generation': [
    {
      type: 'paper',
      url: 'https://arxiv.org/abs/2107.03374',
      title: 'Evaluating Large Language Models Trained on Code',
      summary: 'Codex model shows that LLMs can generate functionally correct code from docstrings. Key insight: fine-tuning on code improves generation quality.',
      relevanceScore: 0.9,
      retrievedAt: new Date(),
    },
    {
      type: 'code',
      url: 'https://github.com/microsoft/CodeBERT',
      title: 'CodeBERT: Pre-trained Model for Programming Languages',
      summary: 'Bimodal pre-training for code understanding and generation. Approach: contrastive learning between NL and PL.',
      relevanceScore: 0.85,
      retrievedAt: new Date(),
    },
  ],
  'formal-verification': [
    {
      type: 'paper',
      url: 'https://arxiv.org/abs/2206.15331',
      title: 'Formal Verification of ML-Generated Code',
      summary: 'Using SMT solvers to verify properties of generated code. Key technique: abstract interpretation.',
      relevanceScore: 0.88,
      retrievedAt: new Date(),
    },
  ],
  'default': [
    {
      type: 'documentation',
      url: 'https://docs.genesis.ai/improvement',
      title: 'Genesis Self-Improvement Guide',
      summary: 'Standard approach: observe metrics, research solutions, implement incrementally, verify invariants.',
      relevanceScore: 0.7,
      retrievedAt: new Date(),
    },
  ],
};

export function getMockResearchSources(query: string): ResearchSource[] {
  const queryLower = query.toLowerCase();

  for (const [key, sources] of Object.entries(MOCK_RESEARCH_TEMPLATES)) {
    if (key !== 'default' && queryLower.includes(key)) {
      console.log(`[RSI Research] Using mock sources for: ${key}`);
      return sources;
    }
  }

  console.log(`[RSI Research] Using default mock sources`);
  return MOCK_RESEARCH_TEMPLATES['default'];
}

// =============================================================================
// ARXIV SEARCHER
// =============================================================================

export class ArxivSearcher {
  private mcp = getMCPClient();

  /**
   * Search arXiv for relevant papers
   */
  async search(query: string, maxResults: number = 5): Promise<ResearchSource[]> {
    const sources: ResearchSource[] = [];

    try {
      const result = await this.mcp.call('arxiv', 'search_arxiv', {
        query,
        max_results: maxResults,
      }) as any;

      if (result && Array.isArray(result.papers)) {
        for (const paper of result.papers) {
          sources.push({
            type: 'paper',
            url: paper.url || paper.id,
            title: paper.title || 'Unknown Title',
            summary: paper.summary || paper.abstract || '',
            relevanceScore: this.computeRelevance(query, paper),
            retrievedAt: new Date(),
          });
        }
      }
    } catch (error) {
      // arXiv MCP might not be available
      console.log(`[RSI Research] arXiv search failed: ${error}`);
    }

    return sources;
  }

  private computeRelevance(query: string, paper: any): number {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const text = `${paper.title || ''} ${paper.summary || ''}`.toLowerCase();

    let matches = 0;
    for (const term of queryTerms) {
      if (text.includes(term)) matches++;
    }

    return queryTerms.length > 0 ? matches / queryTerms.length : 0;
  }
}

// =============================================================================
// SEMANTIC SCHOLAR SEARCHER
// =============================================================================

export class SemanticScholarSearcher {
  private mcp = getMCPClient();

  /**
   * Search Semantic Scholar for relevant papers
   */
  async search(query: string, maxResults: number = 5): Promise<ResearchSource[]> {
    const sources: ResearchSource[] = [];

    try {
      const result = await this.mcp.call('semantic-scholar', 'search_semantic_scholar', {
        query,
        limit: maxResults,
      }) as any;

      if (result && Array.isArray(result.papers)) {
        for (const paper of result.papers) {
          sources.push({
            type: 'paper',
            url: paper.url || `https://semanticscholar.org/paper/${paper.paperId}`,
            title: paper.title || 'Unknown Title',
            summary: paper.abstract || '',
            relevanceScore: (paper.citationCount || 0) > 100 ? 0.9 : 0.5,
            retrievedAt: new Date(),
          });
        }
      }
    } catch (error) {
      console.log(`[RSI Research] Semantic Scholar search failed: ${error}`);
    }

    return sources;
  }
}

// =============================================================================
// GITHUB SEARCHER
// =============================================================================

export class GitHubSearcher {
  private mcp = getMCPClient();

  /**
   * Search GitHub for relevant code and repositories
   */
  async search(query: string, maxResults: number = 5): Promise<ResearchSource[]> {
    const sources: ResearchSource[] = [];

    try {
      // Search code
      const codeResult = await this.mcp.call('github', 'search_code', {
        q: query,
        per_page: maxResults,
      }) as any;

      if (codeResult && Array.isArray(codeResult.items)) {
        for (const item of codeResult.items) {
          sources.push({
            type: 'code',
            url: item.html_url || item.url,
            title: `${item.repository?.full_name || 'repo'}/${item.path || 'file'}`,
            summary: `Code match in ${item.path}`,
            relevanceScore: (item.score || 50) / 100,
            retrievedAt: new Date(),
          });
        }
      }

      // Search repositories
      const repoResult = await this.mcp.call('github', 'search_repositories', {
        q: query,
        per_page: maxResults,
      }) as any;

      if (repoResult && Array.isArray(repoResult.items)) {
        for (const repo of repoResult.items) {
          sources.push({
            type: 'code',
            url: repo.html_url,
            title: repo.full_name,
            summary: repo.description || 'No description',
            relevanceScore: Math.min(1, (repo.stargazers_count || 0) / 1000),
            retrievedAt: new Date(),
          });
        }
      }
    } catch (error) {
      console.log(`[RSI Research] GitHub search failed: ${error}`);
    }

    return sources;
  }
}

// =============================================================================
// WEB SEARCHER
// =============================================================================

export class WebSearcher {
  private mcp = getMCPClient();

  /**
   * Search the web for relevant documentation and discussions
   */
  async search(query: string, maxResults: number = 5): Promise<ResearchSource[]> {
    const sources: ResearchSource[] = [];

    // Try multiple search providers
    const providers = [
      { name: 'brave-search', method: 'brave_web_search', queryKey: 'query' },
      { name: 'exa', method: 'web_search_exa', queryKey: 'query' },
      { name: 'gemini', method: 'web_search', queryKey: 'query' },
    ];

    for (const provider of providers) {
      try {
        const result = await this.mcp.call(provider.name as any, provider.method, {
          [provider.queryKey]: query,
          count: maxResults,
        }) as any;

        if (result && Array.isArray(result.results || result.web_results || result)) {
          const items = result.results || result.web_results || result;
          for (const item of items.slice(0, maxResults)) {
            sources.push({
              type: 'documentation',
              url: item.url || item.link,
              title: item.title || 'Web Result',
              summary: item.description || item.snippet || '',
              relevanceScore: 0.6,
              retrievedAt: new Date(),
            });
          }
          break; // Use first successful provider
        }
      } catch {
        // Try next provider
      }
    }

    return sources;
  }
}

// =============================================================================
// MEMORY SEARCHER
// =============================================================================

export class MemorySearcher {
  private memory = getMemorySystem();

  /**
   * Search internal memory for past solutions
   */
  async search(query: string, maxResults: number = 5): Promise<ResearchSource[]> {
    const sources: ResearchSource[] = [];

    try {
      // Search semantic memory
      const semanticResults = this.memory.semantic.search(query, maxResults);
      for (const result of semanticResults) {
        const content = result.content as any;
        sources.push({
          type: 'memory',
          title: `Semantic: ${content?.concept || 'knowledge'}`,
          summary: typeof content === 'string' ? content : JSON.stringify(content || {}),
          relevanceScore: result.confidence || 0.7,
          retrievedAt: new Date(),
        });
      }

      // Search procedural memory for past solutions
      const proceduralResults = this.memory.procedural.search(query, maxResults);
      for (const result of proceduralResults) {
        const content = result.content as any;
        sources.push({
          type: 'memory',
          title: `Procedure: ${content?.name || 'procedure'}`,
          summary: content?.description || JSON.stringify(content?.steps || []),
          relevanceScore: result.successRate || 0.7,
          retrievedAt: new Date(),
        });
      }
    } catch (error) {
      console.log(`[RSI Research] Memory search failed: ${error}`);
    }

    return sources;
  }
}

// =============================================================================
// KNOWLEDGE SYNTHESIZER
// =============================================================================

export class KnowledgeSynthesizer {
  /**
   * Synthesize knowledge from multiple research sources
   */
  synthesize(
    topic: string,
    sources: ResearchSource[],
    limitation?: Limitation
  ): SynthesizedKnowledge {
    // Sort by relevance
    const sorted = [...sources].sort((a, b) => b.relevanceScore - a.relevanceScore);
    const topSources = sorted.slice(0, 10);

    // Extract key insights
    const keyInsights: string[] = [];

    // From papers
    const papers = topSources.filter(s => s.type === 'paper');
    if (papers.length > 0) {
      keyInsights.push(`Found ${papers.length} relevant academic papers on ${topic}`);
      for (const paper of papers.slice(0, 3)) {
        if (paper.summary) {
          keyInsights.push(`Paper "${paper.title}": ${paper.summary.slice(0, 200)}`);
        }
      }
    }

    // From code
    const code = topSources.filter(s => s.type === 'code');
    if (code.length > 0) {
      keyInsights.push(`Found ${code.length} code examples for ${topic}`);
      for (const c of code.slice(0, 3)) {
        keyInsights.push(`Code: ${c.title} - ${c.summary.slice(0, 100)}`);
      }
    }

    // From memory
    const memory = topSources.filter(s => s.type === 'memory');
    if (memory.length > 0) {
      keyInsights.push(`Found ${memory.length} past experiences related to ${topic}`);
    }

    // Compute applicability
    let applicability = 0.5;
    if (limitation) {
      // Higher applicability if directly addressing the limitation
      applicability = Math.min(1, 0.5 + topSources.length * 0.05);
    }

    // Generate synthesis
    const synthesis = this.generateSynthesis(topic, topSources, limitation);

    return {
      topic,
      sources: topSources,
      synthesis,
      keyInsights,
      applicability,
      confidence: Math.min(1, topSources.length / 10),
      synthesizedAt: new Date(),
    };
  }

  private generateSynthesis(
    topic: string,
    sources: ResearchSource[],
    limitation?: Limitation
  ): string {
    const parts: string[] = [];

    parts.push(`Research synthesis for: ${topic}`);

    if (limitation) {
      parts.push(`\nAddressing limitation: ${limitation.description}`);
      parts.push(`Severity: ${limitation.severity}, Impact: ${limitation.estimatedImpact}`);
    }

    parts.push(`\nSources analyzed: ${sources.length}`);

    // Group by type
    const byType = new Map<string, ResearchSource[]>();
    for (const s of sources) {
      const existing = byType.get(s.type) || [];
      existing.push(s);
      byType.set(s.type, existing);
    }

    for (const [type, typeSources] of byType) {
      parts.push(`\n${type.toUpperCase()} (${typeSources.length}):`);
      for (const s of typeSources.slice(0, 3)) {
        parts.push(`  - ${s.title} (relevance: ${s.relevanceScore.toFixed(2)})`);
      }
    }

    // Add recommendations
    parts.push('\nRECOMMENDATIONS:');
    if (sources.some(s => s.type === 'code')) {
      parts.push('- Review code examples for implementation patterns');
    }
    if (sources.some(s => s.type === 'paper')) {
      parts.push('- Study academic papers for theoretical foundations');
    }
    if (sources.some(s => s.type === 'memory')) {
      parts.push('- Leverage past experiences for proven approaches');
    }

    return parts.join('\n');
  }
}

// =============================================================================
// RESEARCH ENGINE
// =============================================================================

export class ResearchEngine {
  private config: ResearchConfig;
  private arxiv: ArxivSearcher;
  private semanticScholar: SemanticScholarSearcher;
  private github: GitHubSearcher;
  private web: WebSearcher;
  private memory: MemorySearcher;
  private synthesizer: KnowledgeSynthesizer;

  constructor(config: Partial<ResearchConfig> = {}) {
    this.config = { ...DEFAULT_RESEARCH_CONFIG, ...config };
    this.arxiv = new ArxivSearcher();
    this.semanticScholar = new SemanticScholarSearcher();
    this.github = new GitHubSearcher();
    this.web = new WebSearcher();
    this.memory = new MemorySearcher();
    this.synthesizer = new KnowledgeSynthesizer();
  }

  /**
   * Research solutions for a limitation
   */
  async researchLimitation(limitation: Limitation): Promise<SynthesizedKnowledge> {
    // Build query from limitation
    const query = this.buildQuery(limitation);

    console.log(`[RSI Research] Researching: ${query}`);

    // Gather sources from all enabled sources
    const allSources = await this.gatherSources(query);

    // Filter by relevance
    const relevant = allSources.filter(s => s.relevanceScore >= this.config.minRelevanceScore);

    // Synthesize knowledge
    return this.synthesizer.synthesize(limitation.description, relevant, limitation);
  }

  /**
   * Research a specific topic
   */
  async researchTopic(topic: string): Promise<SynthesizedKnowledge> {
    console.log(`[RSI Research] Researching topic: ${topic}`);

    const allSources = await this.gatherSources(topic);
    const relevant = allSources.filter(s => s.relevanceScore >= this.config.minRelevanceScore);

    return this.synthesizer.synthesize(topic, relevant);
  }

  /**
   * Convert limitation to opportunity by researching solutions
   */
  async findOpportunity(limitation: Limitation): Promise<Opportunity | null> {
    const knowledge = await this.researchLimitation(limitation);

    if (knowledge.sources.length === 0 || knowledge.applicability < 0.3) {
      return null;
    }

    // Find best source
    const bestSource = knowledge.sources[0];

    return {
      id: randomUUID(),
      limitationId: limitation.id,
      type: this.mapLimitationToOpportunityType(limitation),
      description: `Address "${limitation.description}" using: ${knowledge.keyInsights[0] || 'researched knowledge'}`,
      expectedBenefit: limitation.estimatedImpact * knowledge.applicability,
      estimatedEffort: this.estimateEffort(knowledge),
      priority: (limitation.estimatedImpact * knowledge.applicability) / this.estimateEffort(knowledge),
      source: bestSource,
      discoveredAt: new Date(),
    };
  }

  private buildQuery(limitation: Limitation): string {
    const parts: string[] = [];

    // v14.6: Use suggested research topics from bounty feedback if available
    if (limitation.suggestedResearch && limitation.suggestedResearch.length > 0) {
      parts.push(...limitation.suggestedResearch.slice(0, 3));
    }

    // Add type-specific keywords
    switch (limitation.type) {
      case 'performance':
        parts.push('optimization', 'performance improvement');
        break;
      case 'capability':
        parts.push('implementation', 'algorithm');
        break;
      case 'quality':
        parts.push('refactoring', 'code quality', 'best practices');
        break;
      case 'reliability':
        parts.push('error handling', 'fault tolerance', 'reliability');
        break;
      case 'efficiency':
        parts.push('optimization', 'efficiency', 'resource usage');
        break;
      case 'knowledge':
        parts.push('documentation', 'tutorial', 'guide');
        break;
    }

    // Add affected components
    parts.push(...limitation.affectedComponents);

    // Add keywords from description
    const descWords = limitation.description
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 5);
    parts.push(...descWords);

    return parts.join(' ');
  }

  private async gatherSources(query: string): Promise<ResearchSource[]> {
    // v15.1: Use mock sources if enabled (for testing)
    if (this.config.mockResearch) {
      return getMockResearchSources(query);
    }

    const allSources: ResearchSource[] = [];
    const tasks: Promise<ResearchSource[]>[] = [];

    if (this.config.enabledSources.includes('memory')) {
      tasks.push(this.memory.search(query, this.config.maxResultsPerSource));
    }
    if (this.config.enabledSources.includes('github')) {
      tasks.push(this.github.search(query, this.config.maxResultsPerSource));
    }
    if (this.config.enabledSources.includes('arxiv')) {
      tasks.push(this.arxiv.search(query, this.config.maxResultsPerSource));
    }
    if (this.config.enabledSources.includes('semantic-scholar')) {
      tasks.push(this.semanticScholar.search(query, this.config.maxResultsPerSource));
    }
    if (this.config.enabledSources.includes('web')) {
      tasks.push(this.web.search(query, this.config.maxResultsPerSource));
    }

    // Run all searches in parallel with timeout
    const results = await Promise.allSettled(
      tasks.map(t => Promise.race([
        t,
        new Promise<ResearchSource[]>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), this.config.timeoutMs)
        ),
      ]))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allSources.push(...result.value);
      }
    }

    return allSources;
  }

  private mapLimitationToOpportunityType(limitation: Limitation): Opportunity['type'] {
    switch (limitation.type) {
      case 'performance':
      case 'efficiency':
        return 'optimization';
      case 'quality':
        return 'refactor';
      case 'capability':
        return 'feature';
      case 'knowledge':
        return 'new-technique';
      default:
        return 'optimization';
    }
  }

  private estimateEffort(knowledge: SynthesizedKnowledge): number {
    // Base effort
    let effort = 0.5;

    // More sources = more complex problem = more effort
    if (knowledge.sources.length > 5) effort += 0.2;

    // If we have code examples, effort is lower
    if (knowledge.sources.some(s => s.type === 'code')) effort -= 0.1;

    // If we have past experience, effort is lower
    if (knowledge.sources.some(s => s.type === 'memory')) effort -= 0.15;

    return Math.max(0.1, Math.min(1, effort));
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let researchEngineInstance: ResearchEngine | null = null;

export function getResearchEngine(config?: Partial<ResearchConfig>): ResearchEngine {
  if (!researchEngineInstance) {
    researchEngineInstance = new ResearchEngine(config);
  }
  return researchEngineInstance;
}

export function resetResearchEngine(): void {
  researchEngineInstance = null;
}
