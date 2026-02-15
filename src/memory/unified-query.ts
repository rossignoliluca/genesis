/**
 * Genesis 10.4.2 - Unified Memory Query Interface
 *
 * Single interface to query ALL memory sources:
 * - MemoryAgent (working/short-term/long-term)
 * - MemorySystem (episodic/semantic/procedural)
 * - ProductionMemory (PostgreSQL vector)
 * - MCP Memory (external graph)
 *
 * Features:
 * - Semantic search across all stores
 * - Ranked aggregation with deduplication
 * - Filter by type, time, importance, tags
 * - Unified result format
 */

import type { Memory, BaseMemory, MemoryType, EpisodicMemory, SemanticMemory, ProceduralMemory } from './types.js';
import type { MemoryItem } from '../agents/types.js';

// ============================================================================
// Unified Query Types
// ============================================================================

/**
 * Source identifiers for tracking where memories come from
 */
export type MemorySource =
  | 'agent'           // MemoryAgent stores
  | 'episodic'        // MemorySystem episodic
  | 'semantic'        // MemorySystem semantic
  | 'procedural'      // MemorySystem procedural
  | 'production'      // ProductionMemory (PostgreSQL)
  | 'mcp'             // MCP Memory server
  | 'workspace';      // Cognitive workspace (working memory)

/**
 * Unified memory result format
 */
export interface UnifiedMemoryResult {
  id: string;
  source: MemorySource;
  type: MemoryType | 'item';  // 'item' for MemoryAgent items

  // Content (normalized)
  content: any;
  summary?: string;           // Human-readable summary

  // Metadata
  created: Date;
  lastAccessed: Date;
  importance: number;
  retention: number;          // Current retention (0-1)

  // Search relevance
  relevance: number;          // How well it matches the query (0-1)
  matchedTerms?: string[];    // Which query terms matched

  // Tags and associations
  tags: string[];
  associations: string[];

  // Original reference
  original: any;              // Original memory object
}

/**
 * Query filters
 */
export interface UnifiedQueryFilter {
  // Source filters
  sources?: MemorySource[];       // Which sources to search (default: all)
  types?: (MemoryType | 'item')[]; // Which types to include

  // Time filters
  createdAfter?: Date;
  createdBefore?: Date;
  accessedAfter?: Date;

  // Quality filters
  minImportance?: number;         // 0-1
  minRetention?: number;          // 0-1
  minRelevance?: number;          // 0-1

  // Content filters
  tags?: string[];                // Must have ALL these tags
  tagsAny?: string[];             // Must have ANY of these tags
  excludeTags?: string[];         // Must NOT have these tags

  // Pagination
  limit?: number;                 // Max results (default: 20)
  offset?: number;                // Skip first N results
}

/**
 * Search options
 */
export interface UnifiedSearchOptions extends UnifiedQueryFilter {
  query: string;                  // Search query
  semantic?: boolean;             // Use semantic search (default: true)
  fuzzy?: boolean;                // Allow fuzzy matching (default: true)
  highlightMatches?: boolean;     // Highlight matched terms (default: false)
}

/**
 * Aggregated search result
 */
export interface UnifiedSearchResult {
  results: UnifiedMemoryResult[];
  totalCount: number;             // Total across all sources
  searchedSources: MemorySource[];
  query: string;
  took: number;                   // Search duration in ms

  // Per-source counts
  sourceCounts: Record<MemorySource, number>;
}

// ============================================================================
// Memory Source Interface
// ============================================================================

/**
 * Interface that memory sources must implement
 */
export interface IUnifiedMemorySource {
  sourceId: MemorySource;

  search(query: string, limit: number): Promise<any[]> | any[];
  getRecent?(limit: number): Promise<any[]> | any[];
  getById?(id: string): Promise<any> | any;

  // Convert source-specific result to unified format
  normalize(item: any, relevance: number): UnifiedMemoryResult;
}

// ============================================================================
// Unified Memory Query
// ============================================================================

export class UnifiedMemoryQuery {
  private sources: Map<MemorySource, IUnifiedMemorySource> = new Map();

  constructor() {
    // Sources registered via registerSource()
  }

  // ============================================================================
  // Source Registration
  // ============================================================================

  /**
   * Register a memory source
   */
  registerSource(source: IUnifiedMemorySource): void {
    this.sources.set(source.sourceId, source);
  }

  /**
   * Unregister a memory source
   */
  unregisterSource(sourceId: MemorySource): void {
    this.sources.delete(sourceId);
  }

  /**
   * Get registered sources
   */
  getRegisteredSources(): MemorySource[] {
    return Array.from(this.sources.keys());
  }

  // ============================================================================
  // Search
  // ============================================================================

  /**
   * Search across all registered memory sources
   */
  async search(options: UnifiedSearchOptions): Promise<UnifiedSearchResult> {
    const startTime = Date.now();
    const { query, limit = 20, sources: includeSources } = options;

    // Determine which sources to search
    const sourcesToSearch = includeSources
      ? Array.from(this.sources.values()).filter(s => includeSources.includes(s.sourceId))
      : Array.from(this.sources.values());

    // Search all sources in parallel
    const searchPromises = sourcesToSearch.map(async source => {
      try {
        const rawResults = await Promise.resolve(source.search(query, limit * 2));
        return {
          source: source.sourceId,
          results: rawResults.map((item, idx) => {
            const relevance = this.calculateRelevance(item, query, idx, rawResults.length);
            return source.normalize(item, relevance);
          }),
        };
      } catch (err) {
        // Source failed - continue with others
        return { source: source.sourceId, results: [] };
      }
    });

    const sourceResults = await Promise.all(searchPromises);

    // Aggregate and deduplicate
    const allResults: UnifiedMemoryResult[] = [];
    const seen = new Set<string>();
    const sourceCounts: Record<string, number> = {};

    for (const { source, results } of sourceResults) {
      sourceCounts[source] = results.length;

      for (const result of results) {
        // Deduplicate by ID or content hash
        const key = result.id || this.hashContent(result.content);
        if (!seen.has(key)) {
          seen.add(key);
          allResults.push(result);
        }
      }
    }

    // Apply filters
    let filtered = this.applyFilters(allResults, options);

    // Rank by combined score
    filtered.sort((a, b) => {
      const scoreA = a.relevance * 0.6 + a.importance * 0.3 + a.retention * 0.1;
      const scoreB = b.relevance * 0.6 + b.importance * 0.3 + b.retention * 0.1;
      return scoreB - scoreA;
    });

    // Apply pagination
    const offset = options.offset || 0;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      results: paginated,
      totalCount: filtered.length,
      searchedSources: sourcesToSearch.map(s => s.sourceId),
      query,
      took: Date.now() - startTime,
      sourceCounts: sourceCounts as Record<MemorySource, number>,
    };
  }

  /**
   * Get recent memories from all sources
   */
  async getRecent(options: UnifiedQueryFilter = {}): Promise<UnifiedSearchResult> {
    const startTime = Date.now();
    const { limit = 20, sources: includeSources } = options;

    const sourcesToSearch = includeSources
      ? Array.from(this.sources.values()).filter(s => includeSources.includes(s.sourceId))
      : Array.from(this.sources.values());

    const recentPromises = sourcesToSearch.map(async source => {
      try {
        if (source.getRecent) {
          const rawResults = await Promise.resolve(source.getRecent(limit));
          return {
            source: source.sourceId,
            results: rawResults.map(item => source.normalize(item, 1.0)),
          };
        }
        return { source: source.sourceId, results: [] };
      } catch (err) {

        console.error('[unified-query] operation failed:', err);
        return { source: source.sourceId, results: [] };
      }
    });

    const sourceResults = await Promise.all(recentPromises);

    const allResults: UnifiedMemoryResult[] = [];
    const sourceCounts: Record<string, number> = {};

    for (const { source, results } of sourceResults) {
      sourceCounts[source] = results.length;
      allResults.push(...results);
    }

    // Sort by creation date
    allResults.sort((a, b) => b.created.getTime() - a.created.getTime());

    // Apply filters and pagination
    const filtered = this.applyFilters(allResults, options);
    const offset = options.offset || 0;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      results: paginated,
      totalCount: filtered.length,
      searchedSources: sourcesToSearch.map(s => s.sourceId),
      query: '',
      took: Date.now() - startTime,
      sourceCounts: sourceCounts as Record<MemorySource, number>,
    };
  }

  /**
   * Get a specific memory by ID from any source
   */
  async getById(id: string, source?: MemorySource): Promise<UnifiedMemoryResult | null> {
    // If source specified, only search that source
    if (source) {
      const src = this.sources.get(source);
      if (src?.getById) {
        const item = await Promise.resolve(src.getById(id));
        return item ? src.normalize(item, 1.0) : null;
      }
      return null;
    }

    // Search all sources
    for (const src of this.sources.values()) {
      if (src.getById) {
        try {
          const item = await Promise.resolve(src.getById(id));
          if (item) {
            return src.normalize(item, 1.0);
          }
        } catch (err) {

          console.error('[unified-query] operation failed:', err);
          // Continue to next source
        }
      }
    }

    return null;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private calculateRelevance(item: any, query: string, position: number, total: number): number {
    // Base relevance from position (assumes source sorted by relevance)
    const positionScore = 1 - (position / Math.max(total, 1));

    // Bonus for keyword matches
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const contentStr = JSON.stringify(item).toLowerCase();

    let matchCount = 0;
    for (const term of queryTerms) {
      if (contentStr.includes(term)) {
        matchCount++;
      }
    }
    const keywordScore = queryTerms.length > 0 ? matchCount / queryTerms.length : 0;

    return Math.min(1, positionScore * 0.5 + keywordScore * 0.5);
  }

  private applyFilters(results: UnifiedMemoryResult[], filter: UnifiedQueryFilter): UnifiedMemoryResult[] {
    return results.filter(r => {
      // Type filter
      if (filter.types && !filter.types.includes(r.type)) return false;

      // Time filters
      if (filter.createdAfter && r.created < filter.createdAfter) return false;
      if (filter.createdBefore && r.created > filter.createdBefore) return false;
      if (filter.accessedAfter && r.lastAccessed < filter.accessedAfter) return false;

      // Quality filters
      if (filter.minImportance !== undefined && r.importance < filter.minImportance) return false;
      if (filter.minRetention !== undefined && r.retention < filter.minRetention) return false;
      if (filter.minRelevance !== undefined && r.relevance < filter.minRelevance) return false;

      // Tag filters
      if (filter.tags && !filter.tags.every(t => r.tags.includes(t))) return false;
      if (filter.tagsAny && !filter.tagsAny.some(t => r.tags.includes(t))) return false;
      if (filter.excludeTags && filter.excludeTags.some(t => r.tags.includes(t))) return false;

      return true;
    });
  }

  private hashContent(content: any): string {
    const str = JSON.stringify(content);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `hash-${hash.toString(16)}`;
  }

  // ============================================================================
  // Stats
  // ============================================================================

  getStats() {
    return {
      registeredSources: this.getRegisteredSources(),
      sourceCount: this.sources.size,
    };
  }
}

// ============================================================================
// Source Adapters
// ============================================================================

/**
 * Adapter for MemorySystem (episodic/semantic/procedural)
 */
export function createMemorySystemAdapter(
  memorySystem: { episodic: any; semantic: any; procedural: any }
): IUnifiedMemorySource[] {
  const adapters: IUnifiedMemorySource[] = [];

  // Episodic adapter
  adapters.push({
    sourceId: 'episodic',
    search: (query, limit) => memorySystem.episodic.search(query, limit),
    getRecent: (limit) => memorySystem.episodic.getRecent(limit),
    getById: (id) => memorySystem.episodic.get(id),
    normalize: (item: EpisodicMemory, relevance): UnifiedMemoryResult => ({
      id: item.id,
      source: 'episodic',
      type: 'episodic',
      content: item.content,
      summary: item.content?.what || 'Episode',
      created: new Date(item.created),
      lastAccessed: new Date(item.lastAccessed),
      importance: item.importance,
      retention: calculateRetention(item),
      relevance,
      tags: item.tags || [],
      associations: item.associations || [],
      original: item,
    }),
  });

  // Semantic adapter
  adapters.push({
    sourceId: 'semantic',
    search: (query, limit) => memorySystem.semantic.search(query, limit),
    getById: (id) => memorySystem.semantic.get(id),
    normalize: (item: SemanticMemory, relevance): UnifiedMemoryResult => ({
      id: item.id,
      source: 'semantic',
      type: 'semantic',
      content: item.content,
      summary: item.content?.concept || 'Fact',
      created: new Date(item.created),
      lastAccessed: new Date(item.lastAccessed),
      importance: item.importance,
      retention: calculateRetention(item),
      relevance,
      tags: item.tags || [],
      associations: item.associations || [],
      original: item,
    }),
  });

  // Procedural adapter
  adapters.push({
    sourceId: 'procedural',
    search: (query, limit) => memorySystem.procedural.search(query, limit),
    getById: (id) => memorySystem.procedural.get(id),
    normalize: (item: ProceduralMemory, relevance): UnifiedMemoryResult => ({
      id: item.id,
      source: 'procedural',
      type: 'procedural',
      content: item.content,
      summary: item.content?.name || 'Skill',
      created: new Date(item.created),
      lastAccessed: new Date(item.lastAccessed),
      importance: item.importance,
      retention: calculateRetention(item),
      relevance,
      tags: item.tags || [],
      associations: item.associations || [],
      original: item,
    }),
  });

  return adapters;
}

/**
 * Adapter for MemoryAgent
 */
export function createMemoryAgentAdapter(
  memoryAgent: { retrieve: (q: any) => MemoryItem[]; getStats: () => any }
): IUnifiedMemorySource {
  return {
    sourceId: 'agent',
    search: (query, limit) => memoryAgent.retrieve({ keywords: query.split(/\s+/), limit }),
    normalize: (item: MemoryItem, relevance): UnifiedMemoryResult => ({
      id: item.id,
      source: 'agent',
      type: 'item',
      content: item.content,
      summary: typeof item.content === 'string' ? item.content.slice(0, 100) : 'Memory item',
      created: new Date(item.created),
      lastAccessed: new Date(item.lastAccessed),
      importance: item.importance,
      retention: item.R0 * Math.exp(-(Date.now() - new Date(item.lastAccessed).getTime()) / (item.S * 86400000)),
      relevance,
      tags: [],
      associations: item.associations || [],
      original: item,
    }),
  };
}

/**
 * Adapter for MCP Memory
 */
export function createMCPMemoryAdapter(
  mcpClient: { searchNodes: (q: string) => Promise<any[]>; readGraph?: () => Promise<any> }
): IUnifiedMemorySource {
  return {
    sourceId: 'mcp',
    search: async (query, limit) => {
      const results = await mcpClient.searchNodes(query);
      return results.slice(0, limit);
    },
    normalize: (item: any, relevance): UnifiedMemoryResult => ({
      id: item.name || item.id || 'mcp-entity',
      source: 'mcp',
      type: 'semantic',  // MCP entities are semantic facts
      content: {
        name: item.name,
        type: item.entityType,
        observations: item.observations,
      },
      summary: `${item.entityType}: ${item.name}`,
      created: new Date(),  // MCP doesn't track creation
      lastAccessed: new Date(),
      importance: 0.7,  // Default importance
      retention: 1.0,   // MCP persists everything
      relevance,
      tags: [item.entityType],
      associations: [],
      original: item,
    }),
  };
}

/**
 * Adapter for CognitiveWorkspace (working memory)
 */
export function createWorkspaceAdapter(
  workspace: { getActive: () => any[]; getStats: () => any }
): IUnifiedMemorySource {
  return {
    sourceId: 'workspace',
    search: (query, limit) => {
      const items = workspace.getActive();
      const queryLower = query.toLowerCase();
      return items
        .filter(i => JSON.stringify(i).toLowerCase().includes(queryLower))
        .slice(0, limit);
    },
    getRecent: (limit) => workspace.getActive().slice(0, limit),
    normalize: (item: any, relevance): UnifiedMemoryResult => ({
      id: item.id || `ws-${Date.now()}`,
      source: 'workspace',
      type: 'item',
      content: item.data || item,
      summary: item.summary || 'Working memory item',
      created: new Date(item.activatedAt || Date.now()),
      lastAccessed: new Date(item.lastAccessed || Date.now()),
      importance: item.relevance || 0.5,
      retention: 1.0,  // Working memory is always fresh
      relevance,
      tags: item.tags || [],
      associations: [],
      original: item,
    }),
  };
}

// ============================================================================
// Utility
// ============================================================================

function calculateRetention(memory: BaseMemory): number {
  const elapsedDays = (Date.now() - new Date(memory.lastAccessed).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.min(1, memory.R0 * Math.exp(-elapsedDays / memory.S)));
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let unifiedQueryInstance: UnifiedMemoryQuery | null = null;

/**
 * Get or create the unified memory query instance
 */
export function getUnifiedMemoryQuery(): UnifiedMemoryQuery {
  if (!unifiedQueryInstance) {
    unifiedQueryInstance = new UnifiedMemoryQuery();
  }
  return unifiedQueryInstance;
}

/**
 * Reset the unified memory query instance
 */
export function resetUnifiedMemoryQuery(): void {
  unifiedQueryInstance = null;
}

/**
 * Create a new unified memory query
 */
export function createUnifiedMemoryQuery(): UnifiedMemoryQuery {
  return new UnifiedMemoryQuery();
}
