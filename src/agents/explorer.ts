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
import { getMCPClient } from '../mcp/index.js';

// ============================================================================
// Explorer Agent
// ============================================================================

export class ExplorerAgent extends BaseAgent {
  // Track exploration history for novelty detection
  private explorationHistory: Set<string> = new Set();
  // MCP client for real searches
  private mcp = getMCPClient();

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
    const findings: Finding[] = [];
    const metadata: any = {};

    try {
      switch (source) {
        case 'arxiv': {
          const result = await this.mcp.call('arxiv', 'search_arxiv', {
            query,
            max_results: 5,
          }) as any;
          if (result?.data) {
            const papers = Array.isArray(result.data) ? result.data :
                          (result.data.papers || []);
            for (const paper of papers.slice(0, 5)) {
              findings.push(this.createFinding(
                `[arxiv] ${paper.title || 'Paper'}: ${(paper.summary || paper.abstract || '').slice(0, 200)}...`,
                source,
                this.computeRelevance(query, paper.title, paper.summary),
                true
              ));
            }
            metadata.paperCount = papers.length;
          }
          break;
        }

        case 'semantic-scholar': {
          const result = await this.mcp.call('semantic-scholar', 'search_semantic_scholar', {
            query,
            limit: 5,
          }) as any;
          if (result?.data) {
            const papers = Array.isArray(result.data) ? result.data :
                          (result.data.papers || []);
            for (const paper of papers.slice(0, 5)) {
              const citations = paper.citationCount || 0;
              findings.push(this.createFinding(
                `[semantic-scholar] ${paper.title || 'Paper'} (${citations} citations): ${(paper.abstract || '').slice(0, 200)}...`,
                source,
                citations > 100 ? 0.9 : citations > 10 ? 0.7 : 0.5,
                true
              ));
            }
            metadata.citationDepth = 2;
          }
          break;
        }

        case 'brave': {
          const result = await this.mcp.call('brave-search', 'brave_web_search', {
            query,
            count: 5,
          }) as any;
          if (result?.data) {
            const results = result.data.web?.results || result.data.results || [];
            for (const item of results.slice(0, 5)) {
              findings.push(this.createFinding(
                `[brave] ${item.title || 'Result'}: ${(item.description || item.snippet || '').slice(0, 200)}...`,
                source,
                0.7,
                false
              ));
            }
          }
          break;
        }

        case 'gemini': {
          const result = await this.mcp.call('gemini', 'web_search', {
            query,
          }) as any;
          if (result?.data) {
            const content = typeof result.data === 'string' ? result.data :
                           JSON.stringify(result.data).slice(0, 500);
            findings.push(this.createFinding(
              `[gemini] ${content.slice(0, 300)}...`,
              source,
              0.75,
              false
            ));
          }
          break;
        }

        case 'exa': {
          const result = await this.mcp.call('exa', 'web_search_exa', {
            query,
            numResults: 5,
          }) as any;
          if (result?.data) {
            const results = result.data.results || [];
            for (const item of results.slice(0, 5)) {
              findings.push(this.createFinding(
                `[exa] ${item.title || 'Result'}: ${(item.text || item.snippet || '').slice(0, 200)}...`,
                source,
                0.8,
                true
              ));
            }
          }
          break;
        }

        case 'firecrawl': {
          const result = await this.mcp.call('firecrawl', 'firecrawl_search', {
            query,
            limit: 5,
          }) as any;
          if (result?.data) {
            const results = result.data.results || result.data || [];
            const items = Array.isArray(results) ? results : [results];
            for (const item of items.slice(0, 5)) {
              findings.push(this.createFinding(
                `[firecrawl] ${item.title || item.url || 'Result'}: ${(item.content || item.description || '').slice(0, 200)}...`,
                source,
                0.65,
                false
              ));
            }
          }
          break;
        }

        case 'context7': {
          // context7 requires library resolution first
          const libResult = await this.mcp.call('context7', 'resolve-library-id', {
            libraryName: query.split(' ')[0], // Use first word as library name
          }) as any;
          if (libResult?.data?.libraryId) {
            const docsResult = await this.mcp.call('context7', 'query-docs', {
              libraryId: libResult.data.libraryId,
              query,
            }) as any;
            if (docsResult?.data) {
              findings.push(this.createFinding(
                `[context7] ${typeof docsResult.data === 'string' ? docsResult.data.slice(0, 300) : JSON.stringify(docsResult.data).slice(0, 300)}...`,
                source,
                0.9,
                true
              ));
            }
          }
          break;
        }

        case 'wolfram': {
          const result = await this.mcp.call('wolfram', 'wolfram_query', {
            input: query,
          }) as any;
          if (result?.data) {
            const content = typeof result.data === 'string' ? result.data :
                           JSON.stringify(result.data).slice(0, 500);
            findings.push(this.createFinding(
              `[wolfram] ${content.slice(0, 300)}...`,
              source,
              0.95,
              true
            ));
          }
          break;
        }
      }
    } catch (error) {
      this.log(`MCP call to ${source} failed: ${error}`);
      // Return empty findings on error - graceful degradation
    }

    return { findings, metadata };
  }

  private computeRelevance(query: string, title?: string, summary?: string): number {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const text = `${title || ''} ${summary || ''}`.toLowerCase();
    let matches = 0;
    for (const term of queryTerms) {
      if (text.includes(term)) matches++;
    }
    return queryTerms.length > 0 ? Math.min(0.95, 0.5 + (matches / queryTerms.length) * 0.45) : 0.5;
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
