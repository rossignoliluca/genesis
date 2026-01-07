/**
 * Genesis 4.0 - Explorer Agent
 *
 * Searches, discovers, and researches using the 13 MCP sensory organs.
 * Primary senses: arxiv, semantic-scholar, brave-search, gemini, exa, firecrawl, context7
 */

import { BaseAgent, registerAgentFactory } from './base-agent.js';
import { MessageBus, messageBus } from './message-bus.js';
import {
  Message,
  MessageType,
  ExplorationResult,
  Finding,
  ExplorationSource,
} from './types.js';

// ============================================================================
// Explorer Agent
// ============================================================================

export class ExplorerAgent extends BaseAgent {
  // Track exploration history for novelty detection
  private explorationHistory: Set<string> = new Set();

  constructor(bus: MessageBus = messageBus) {
    super({ type: 'explorer' }, bus);
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  protected getMessageTypes(): MessageType[] {
    return ['QUERY', 'COMMAND'];
  }

  async process(message: Message): Promise<Message | null> {
    switch (message.type) {
      case 'QUERY':
        return this.handleQuery(message);
      case 'COMMAND':
        return this.handleCommand(message);
      default:
        return null;
    }
  }

  // ============================================================================
  // Query Handling
  // ============================================================================

  private async handleQuery(message: Message): Promise<Message | null> {
    const { query, sources, depth } = message.payload;

    this.log(`Exploring: "${query}"`);

    const result = await this.explore(query, sources, depth);

    // Broadcast findings if significant
    if (result.findings.length > 0 && result.novelty > 0.5) {
      await this.broadcast('EXPLORATION', {
        query,
        findings: result.findings.slice(0, 3), // Top 3
        novelty: result.novelty,
      });
    }

    return {
      ...this.createResponse(message, 'RESPONSE', result),
      id: '',
      timestamp: new Date(),
    };
  }

  private async handleCommand(message: Message): Promise<Message | null> {
    const { command, params } = message.payload;

    switch (command) {
      case 'clear_history':
        this.explorationHistory.clear();
        return {
          ...this.createResponse(message, 'RESPONSE', { success: true }),
          id: '',
          timestamp: new Date(),
        };
      default:
        return null;
    }
  }

  // ============================================================================
  // Exploration Logic
  // ============================================================================

  async explore(
    query: string,
    sources?: ExplorationSource['type'][],
    depth: 'shallow' | 'medium' | 'deep' = 'medium'
  ): Promise<ExplorationResult> {
    const useSources = sources || this.getDefaultSources(depth);
    const findings: Finding[] = [];
    const sourcesUsed: ExplorationSource[] = [];

    // Execute searches in parallel
    const searchPromises = useSources.map(async (source) => {
      try {
        const result = await this.searchSource(source, query);
        sourcesUsed.push({ type: source, ...result.metadata });
        return result.findings;
      } catch (error) {
        this.log(`Error searching ${source}: ${error}`);
        return [];
      }
    });

    const results = await Promise.all(searchPromises);
    results.forEach((f) => findings.push(...f));

    // Calculate novelty and relevance
    const novelty = this.calculateNovelty(findings);
    const relevance = this.calculateRelevance(findings, query);

    // Update history
    findings.forEach((f) => {
      this.explorationHistory.add(this.hashContent(f.content));
    });

    return {
      query,
      sources: sourcesUsed,
      findings: this.rankFindings(findings),
      novelty,
      relevance,
    };
  }

  // ============================================================================
  // Source-Specific Search
  // ============================================================================

  private async searchSource(
    source: ExplorationSource['type'],
    query: string
  ): Promise<{ findings: Finding[]; metadata: any }> {
    // In production, these would call actual MCP servers
    // For now, we return simulated results based on source type

    const findings: Finding[] = [];
    const metadata: any = {};

    switch (source) {
      case 'arxiv':
        // Would call: mcp__arxiv__search_arxiv
        findings.push(this.createFinding(
          `[arxiv] Research on "${query}" - Recent papers and preprints`,
          source,
          0.8,
          true
        ));
        metadata.paperCount = 0;
        break;

      case 'semantic-scholar':
        // Would call: mcp__semantic-scholar__search_semantic_scholar
        findings.push(this.createFinding(
          `[semantic-scholar] Academic papers with citations for "${query}"`,
          source,
          0.85,
          true
        ));
        metadata.citationDepth = 2;
        break;

      case 'brave':
        // Would call: mcp__brave-search__brave_web_search
        findings.push(this.createFinding(
          `[brave] Web results and news for "${query}"`,
          source,
          0.7,
          false
        ));
        break;

      case 'gemini':
        // Would call: mcp__gemini__web_search
        findings.push(this.createFinding(
          `[gemini] AI-synthesized search results for "${query}"`,
          source,
          0.75,
          false
        ));
        break;

      case 'exa':
        // Would call: mcp__exa__web_search_exa or mcp__exa__get_code_context_exa
        findings.push(this.createFinding(
          `[exa] Code context and examples for "${query}"`,
          source,
          0.8,
          true
        ));
        break;

      case 'firecrawl':
        // Would call: mcp__firecrawl__firecrawl_search
        findings.push(this.createFinding(
          `[firecrawl] Deep web scraping results for "${query}"`,
          source,
          0.65,
          false
        ));
        break;

      case 'context7':
        // Would call: mcp__context7__query-docs
        findings.push(this.createFinding(
          `[context7] Library documentation for "${query}"`,
          source,
          0.9,
          true
        ));
        break;

      case 'wolfram':
        // Would call: mcp__wolfram__wolfram_query
        findings.push(this.createFinding(
          `[wolfram] Computational/mathematical results for "${query}"`,
          source,
          0.95,
          true
        ));
        break;
    }

    return { findings, metadata };
  }

  private createFinding(
    content: string,
    sourceType: ExplorationSource['type'],
    importance: number,
    isNovel: boolean
  ): Finding {
    return {
      content,
      source: { type: sourceType },
      importance,
      isNovel: isNovel && !this.explorationHistory.has(this.hashContent(content)),
    };
  }

  // ============================================================================
  // Ranking & Scoring
  // ============================================================================

  private getDefaultSources(depth: 'shallow' | 'medium' | 'deep'): ExplorationSource['type'][] {
    switch (depth) {
      case 'shallow':
        return ['brave', 'context7'];
      case 'medium':
        return ['arxiv', 'brave', 'exa', 'context7'];
      case 'deep':
        return ['arxiv', 'semantic-scholar', 'brave', 'gemini', 'exa', 'firecrawl', 'context7', 'wolfram'];
    }
  }

  private calculateNovelty(findings: Finding[]): number {
    if (findings.length === 0) return 0;
    const novelCount = findings.filter((f) => f.isNovel).length;
    return novelCount / findings.length;
  }

  private calculateRelevance(findings: Finding[], query: string): number {
    if (findings.length === 0) return 0;
    // Simple relevance based on importance scores
    const avgImportance = findings.reduce((sum, f) => sum + f.importance, 0) / findings.length;
    return avgImportance;
  }

  private rankFindings(findings: Finding[]): Finding[] {
    return findings.sort((a, b) => {
      // Prioritize novel findings, then by importance
      if (a.isNovel !== b.isNovel) {
        return a.isNovel ? -1 : 1;
      }
      return b.importance - a.importance;
    });
  }

  private hashContent(content: string): string {
    // Simple hash for deduplication
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
}

// ============================================================================
// Register Factory
// ============================================================================

registerAgentFactory('explorer', (bus) => new ExplorerAgent(bus));

export function createExplorerAgent(bus?: MessageBus): ExplorerAgent {
  return new ExplorerAgent(bus);
}
