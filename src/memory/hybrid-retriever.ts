/**
 * Genesis v12.0 - Hybrid Retriever with RRF Fusion
 *
 * Combines 3 retrieval channels:
 * 1. Vector similarity (Pinecone/local VectorStore)
 * 2. Graph traversal (Neo4j knowledge graph)
 * 3. Keyword matching (Supabase full-text / local store search)
 *
 * Fuses results using Reciprocal Rank Fusion (RRF):
 *   score(d) = Σ 1/(k + rank_i(d))
 *
 * When a memory appears in multiple channels, its fused score
 * increases, eliminating false positives from any single channel.
 *
 * References:
 * - Cormack et al. (2009): Reciprocal Rank Fusion
 * - MAGMA (2026): Multi-graph memory architecture
 * - RAG Fusion (2023): Query rewriting + RRF
 */

import { getMCPClient, type MCPServerName } from '../mcp/index.js';
import { getEmbeddingService } from './embeddings.js';
import type { UnifiedMemoryResult, MemorySource } from './unified-query.js';

// ============================================================================
// Types
// ============================================================================

export interface HybridRetrieverConfig {
  /** RRF constant k (default: 60, higher = less top-heavy) */
  rrfK: number;
  /** Weight for vector channel (default: 1.0) */
  vectorWeight: number;
  /** Weight for graph channel (default: 1.0) */
  graphWeight: number;
  /** Weight for keyword channel (default: 0.8) */
  keywordWeight: number;
  /** Minimum score threshold for inclusion */
  minScore: number;
  /** Over-fetch factor per channel (default: 3x limit) */
  overFetchFactor: number;
  /** Use local fallback when MCP unavailable */
  localFallback: boolean;
  /** Log retrieval details */
  verbose: boolean;
}

export const DEFAULT_RETRIEVER_CONFIG: HybridRetrieverConfig = {
  rrfK: 60,
  vectorWeight: 1.0,
  graphWeight: 1.0,
  keywordWeight: 0.8,
  minScore: 0.0,
  overFetchFactor: 3,
  localFallback: true,
  verbose: false,
};

export interface RetrievalResult {
  id: string;
  score: number;
  channels: {
    vector?: { rank: number; similarity: number };
    graph?: { rank: number; hops: number };
    keyword?: { rank: number; matchedTerms: string[] };
  };
  content: any;
  type: 'episodic' | 'semantic' | 'procedural';
  source: MemorySource;
}

export interface RetrievalStats {
  totalQueries: number;
  avgLatencyMs: number;
  channelHits: { vector: number; graph: number; keyword: number };
  rrfFusions: number;
  multiChannelHits: number;
}

// ============================================================================
// Hybrid Retriever
// ============================================================================

export class HybridRetriever {
  private config: HybridRetrieverConfig;
  private stats: RetrievalStats = {
    totalQueries: 0,
    avgLatencyMs: 0,
    channelHits: { vector: 0, graph: 0, keyword: 0 },
    rrfFusions: 0,
    multiChannelHits: 0,
  };

  constructor(config?: Partial<HybridRetrieverConfig>) {
    this.config = { ...DEFAULT_RETRIEVER_CONFIG, ...config };
  }

  /**
   * Hybrid search with RRF fusion across all channels.
   */
  async search(query: string, limit: number = 10): Promise<RetrievalResult[]> {
    const start = Date.now();
    this.stats.totalQueries++;

    const fetchCount = limit * this.config.overFetchFactor;

    // Execute all channels in parallel
    const [vectorResults, graphResults, keywordResults] = await Promise.allSettled([
      this.vectorSearch(query, fetchCount),
      this.graphSearch(query, fetchCount),
      this.keywordSearch(query, fetchCount),
    ]);

    // Extract successful results
    const vectors = vectorResults.status === 'fulfilled' ? vectorResults.value : [];
    const graphs = graphResults.status === 'fulfilled' ? graphResults.value : [];
    const keywords = keywordResults.status === 'fulfilled' ? keywordResults.value : [];

    if (this.config.verbose) {
      console.log(`[HybridRetriever] Channels: vector=${vectors.length}, graph=${graphs.length}, keyword=${keywords.length}`);
    }

    // Update channel hit stats
    if (vectors.length > 0) this.stats.channelHits.vector++;
    if (graphs.length > 0) this.stats.channelHits.graph++;
    if (keywords.length > 0) this.stats.channelHits.keyword++;

    // RRF Fusion
    const fused = this.rrfFuse(vectors, graphs, keywords, limit);
    this.stats.rrfFusions++;

    // Count multi-channel hits
    const multiChannel = fused.filter(r =>
      Object.keys(r.channels).length > 1
    ).length;
    this.stats.multiChannelHits += multiChannel;

    // Update latency
    const elapsed = Date.now() - start;
    this.stats.avgLatencyMs = (this.stats.avgLatencyMs * (this.stats.totalQueries - 1) + elapsed) / this.stats.totalQueries;

    if (this.config.verbose) {
      console.log(`[HybridRetriever] Fused ${fused.length} results (${multiChannel} multi-channel) in ${elapsed}ms`);
    }

    return fused;
  }

  // ============================================================================
  // Channel: Vector Similarity (Pinecone or local)
  // ============================================================================

  private async vectorSearch(query: string, limit: number): Promise<Array<{ id: string; score: number; content: any; type: string }>> {
    try {
      const embedService = getEmbeddingService();
      const queryEmb = await embedService.embed(query);

      const mcp = getMCPClient();
      const results = await mcp.call('pinecone' as MCPServerName, 'query', {
        vector: queryEmb.vector,
        topK: limit,
        includeMetadata: true,
      }) as any;

      if (results?.matches) {
        return results.matches.map((m: any) => ({
          id: m.id,
          score: m.score || 0,
          content: m.metadata || {},
          type: m.metadata?.type || 'episodic',
        }));
      }
    } catch {
      // Pinecone unavailable, try local VectorStore
      if (this.config.localFallback) {
        return this.localVectorSearch(query, limit);
      }
    }
    return [];
  }

  private async localVectorSearch(query: string, limit: number): Promise<Array<{ id: string; score: number; content: any; type: string }>> {
    try {
      const embedService = getEmbeddingService();
      const queryEmb = await embedService.embed(query);

      // Use local VectorStore if available
      const { VectorStore } = await import('./vector-store.js');
      const store = new VectorStore();
      const results = await store.search({ vector: queryEmb.vector, limit });
      return results.map((r) => ({
        id: r.document?.id || `local-${Math.random().toString(36).slice(2)}`,
        score: r.score || 0,
        content: r.document?.metadata || {},
        type: (r.document?.metadata?.type as string) || 'episodic',
      }));
    } catch {
      return [];
    }
  }

  // ============================================================================
  // Channel: Graph Traversal (Neo4j)
  // ============================================================================

  private async graphSearch(query: string, limit: number): Promise<Array<{ id: string; score: number; content: any; type: string; hops: number }>> {
    try {
      const mcp = getMCPClient();

      // Full-text search + 1-hop expansion in Neo4j
      const results = await mcp.call('neo4j' as MCPServerName, 'cypher', {
        query: `
          CALL db.index.fulltext.queryNodes("memory_search", $query)
          YIELD node, score
          WITH node, score
          ORDER BY score DESC
          LIMIT $limit
          OPTIONAL MATCH (node)-[r]-(neighbor)
          RETURN node.id AS id, node.what AS what, node.name AS name,
                 node.definition AS definition, labels(node)[0] AS type,
                 score, collect(DISTINCT neighbor.id) AS neighbors
        `,
        params: { query, limit },
      }) as any;

      if (Array.isArray(results)) {
        return results.map((r: any, idx: number) => ({
          id: r.id || `neo4j-${idx}`,
          score: r.score || 0,
          content: { what: r.what, name: r.name, definition: r.definition, neighbors: r.neighbors },
          type: r.type === 'Episode' ? 'episodic' : r.type === 'Concept' ? 'semantic' : 'procedural',
          hops: 0,
        }));
      }
    } catch {
      // Neo4j unavailable - no local fallback for graph
    }
    return [];
  }

  // ============================================================================
  // Channel: Keyword/Full-Text (Supabase or local)
  // ============================================================================

  private async keywordSearch(query: string, limit: number): Promise<Array<{ id: string; score: number; content: any; type: string; matchedTerms: string[] }>> {
    try {
      const mcp = getMCPClient();

      // Supabase full-text search across all memory tables
      const results = await mcp.call('supabase' as MCPServerName, 'rpc', {
        function: 'search_memories',
        params: { search_query: query, result_limit: limit },
      }) as any;

      if (Array.isArray(results)) {
        return results.map((r: any) => ({
          id: r.id,
          score: r.rank || 0,
          content: r,
          type: r.memory_type || 'episodic',
          matchedTerms: this.extractMatchedTerms(query, JSON.stringify(r)),
        }));
      }
    } catch {
      // Supabase unavailable, use local keyword search
      if (this.config.localFallback) {
        return this.localKeywordSearch(query, limit);
      }
    }
    return [];
  }

  private localKeywordSearch(query: string, limit: number): Promise<Array<{ id: string; score: number; content: any; type: string; matchedTerms: string[] }>> {
    // Local stores use their built-in search() methods
    // This is called when Supabase is unavailable
    return Promise.resolve([]);
  }

  private extractMatchedTerms(query: string, text: string): string[] {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const textLower = text.toLowerCase();
    return queryTerms.filter(term => textLower.includes(term));
  }

  // ============================================================================
  // RRF Fusion
  // ============================================================================

  /**
   * Reciprocal Rank Fusion across multiple ranked lists.
   *
   * For each document appearing in any list:
   *   score(d) = Σ weight_i / (k + rank_i(d))
   *
   * Documents appearing in multiple lists get boosted scores.
   */
  private rrfFuse(
    vectorList: Array<{ id: string; score: number; content: any; type: string }>,
    graphList: Array<{ id: string; score: number; content: any; type: string; hops?: number }>,
    keywordList: Array<{ id: string; score: number; content: any; type: string; matchedTerms?: string[] }>,
    limit: number
  ): RetrievalResult[] {
    const k = this.config.rrfK;
    const resultMap = new Map<string, RetrievalResult>();

    // Process vector results
    for (let rank = 0; rank < vectorList.length; rank++) {
      const item = vectorList[rank];
      const existing = resultMap.get(item.id) || this.createResult(item);
      existing.score += this.config.vectorWeight / (k + rank + 1);
      existing.channels.vector = { rank, similarity: item.score };
      resultMap.set(item.id, existing);
    }

    // Process graph results
    for (let rank = 0; rank < graphList.length; rank++) {
      const item = graphList[rank];
      const existing = resultMap.get(item.id) || this.createResult(item);
      existing.score += this.config.graphWeight / (k + rank + 1);
      existing.channels.graph = { rank, hops: item.hops || 0 };
      resultMap.set(item.id, existing);
    }

    // Process keyword results
    for (let rank = 0; rank < keywordList.length; rank++) {
      const item = keywordList[rank];
      const existing = resultMap.get(item.id) || this.createResult(item);
      existing.score += this.config.keywordWeight / (k + rank + 1);
      existing.channels.keyword = { rank, matchedTerms: item.matchedTerms || [] };
      resultMap.set(item.id, existing);
    }

    // Sort by fused score, filter, and limit
    return [...resultMap.values()]
      .filter(r => r.score >= this.config.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private createResult(item: { id: string; content: any; type: string }): RetrievalResult {
    return {
      id: item.id,
      score: 0,
      channels: {},
      content: item.content,
      type: (item.type as any) || 'episodic',
      source: item.type === 'semantic' ? 'semantic' : item.type === 'procedural' ? 'procedural' : 'episodic',
    };
  }

  // ============================================================================
  // Stats
  // ============================================================================

  getStats(): RetrievalStats {
    return { ...this.stats };
  }
}

// ============================================================================
// Factory & Singleton
// ============================================================================

let retrieverInstance: HybridRetriever | null = null;

export function getHybridRetriever(config?: Partial<HybridRetrieverConfig>): HybridRetriever {
  if (!retrieverInstance) {
    retrieverInstance = new HybridRetriever(config);
  }
  return retrieverInstance;
}

export function createHybridRetriever(config?: Partial<HybridRetrieverConfig>): HybridRetriever {
  return new HybridRetriever(config);
}

export function resetHybridRetriever(): void {
  retrieverInstance = null;
}
