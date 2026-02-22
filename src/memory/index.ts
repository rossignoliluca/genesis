/**
 * Genesis 6.0 - Memory Module
 *
 * Unified memory system based on cognitive science:
 * - Episodic: Events with context (what/when/where/who)
 * - Semantic: Facts and concepts (knowledge)
 * - Procedural: Skills and workflows (know-how)
 *
 * Features:
 * - Ebbinghaus forgetting curve
 * - Sleep-based consolidation (episodic → semantic)
 * - Pattern extraction
 * - Skill learning
 * - Phase 5: ACT-R activation blending in recall path
 *
 * Usage:
 * ```typescript
 * import { createMemorySystem } from './memory/index.js';
 *
 * const memory = createMemorySystem();
 *
 * // Store an episode
 * memory.remember({
 *   what: 'User asked about AI',
 *   when: new Date(),
 *   tags: ['conversation', 'AI'],
 * });
 *
 * // Create a fact
 * memory.learn({
 *   concept: 'TypeScript',
 *   definition: 'A typed superset of JavaScript',
 *   category: 'programming',
 * });
 *
 * // Create a skill
 * memory.learnSkill({
 *   name: 'git-commit',
 *   description: 'Create a git commit',
 *   steps: [
 *     { action: 'git add .' },
 *     { action: 'git commit -m "message"' },
 *   ],
 * });
 *
 * // Run consolidation (sleep)
 * await memory.sleep();
 * ```
 */

// Re-export types
export * from './types.js';

// Re-export modules
export * from './forgetting.js';

// Re-export Phase 8: Local-First modules
export * from './cache.js';
export * from './indexer.js';

// Re-export Phase 11: RAG & Vector Embeddings (v7.6)
export * from './embeddings.js';
export * from './vector-store.js';
export * from './rag.js';
export { EpisodicStore, createEpisodicStore, type CreateEpisodicOptions } from './episodic.js';
export { SemanticStore, createSemanticStore, type CreateSemanticOptions } from './semantic.js';
export { ProceduralStore, createProceduralStore, type CreateProceduralOptions } from './procedural.js';
export { ConsolidationService, createConsolidationService } from './consolidation.js';

// Re-export v7.20 - Self-Awareness (code introspection)
export {
  SelfAwareness,
  getSelfAwareness,
  resetSelfAwareness,
  type CodeFile,
  type CodeModule,
  type SelfAwarenessConfig,
  type SyncResult,
  type IntrospectionResult,
} from './self-awareness.js';

// Re-export Memory 2.0 - Cognitive Workspace
export {
  CognitiveWorkspace,
  createCognitiveWorkspace,
  getCognitiveWorkspace,
  resetCognitiveWorkspace,
  type WorkingMemoryItem,
  type AnticipationContext,
  type CognitiveWorkspaceConfig,
  type MemoryReuseMetrics,
  DEFAULT_WORKSPACE_CONFIG,
} from './cognitive-workspace.js';

// Re-export v10.4.2 - Unified Memory Query
export {
  UnifiedMemoryQuery,
  createUnifiedMemoryQuery,
  getUnifiedMemoryQuery,
  resetUnifiedMemoryQuery,
  createMemorySystemAdapter,
  createMemoryAgentAdapter,
  createMCPMemoryAdapter,
  createWorkspaceAdapter,
  type UnifiedMemoryResult,
  type UnifiedQueryFilter,
  type UnifiedSearchOptions,
  type UnifiedSearchResult,
  type MemorySource,
  type IUnifiedMemorySource,
} from './unified-query.js';

// Re-export v12.0 - Persistence Layer
export {
  MemoryPersistence,
  getMemoryPersistence,
  createMemoryPersistence,
  resetMemoryPersistence,
  type PersistenceConfig,
  type PersistenceStats,
  DEFAULT_PERSISTENCE_CONFIG,
} from './persistence.js';

// Re-export v12.0 - Hybrid Retriever (RRF Fusion)
export {
  HybridRetriever,
  getHybridRetriever,
  createHybridRetriever,
  resetHybridRetriever,
  type HybridRetrieverConfig,
  type RetrievalResult,
  type RetrievalStats,
  DEFAULT_RETRIEVER_CONFIG,
} from './hybrid-retriever.js';

// Re-export v12.0 - Meta-Memory Layer
export {
  MetaMemory,
  getMetaMemory,
  createMetaMemory,
  resetMetaMemory,
  type MetaEntry,
  type Contradiction,
  type ProvenanceRecord,
  type MetaMemoryConfig,
  type KnowledgeAssessment,
  DEFAULT_META_CONFIG,
} from './meta-memory.js';

// Re-export Activation Engine Module
export { ActivationEngine, type ActivatedMemory, type ContextElement, type ActivationConfig, type RetrievalResult as ACTRRetrievalResult } from './activation.js';

import { EpisodicStore, createEpisodicStore, CreateEpisodicOptions } from './episodic.js';
import { SemanticStore, createSemanticStore, CreateSemanticOptions } from './semantic.js';
import { ProceduralStore, createProceduralStore, CreateProceduralOptions } from './procedural.js';
import { ConsolidationService, createConsolidationService } from './consolidation.js';
import { MetaMemory, createMetaMemory } from './meta-memory.js';
import {
  CognitiveWorkspace,
  createCognitiveWorkspace,
  CognitiveWorkspaceConfig,
  AnticipationContext,
  WorkingMemoryItem,
  MemoryReuseMetrics,
} from './cognitive-workspace.js';
import {
  Memory,
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
  ConsolidationResult,
  StoreStats,
} from './types.js';
import { calculateForgettingStats } from './forgetting.js';
import { getVectorDatabase, type VectorDatabase } from '../embeddings/index.js';
import { ActivationEngine, type ContextElement } from './activation.js';

// ============================================================================
// Memory System Configuration
// ============================================================================

export interface MemorySystemConfig {
  episodic?: {
    maxSize?: number;
    autoForget?: boolean;
  };
  semantic?: {
    maxSize?: number;
    autoForget?: boolean;
    minConfidence?: number;
  };
  procedural?: {
    maxSize?: number;
    autoForget?: boolean;
    minSuccessRate?: number;
  };
  consolidation?: {
    backgroundIntervalMs?: number;
    autoStart?: boolean;
  };
  // Memory 2.0: Cognitive Workspace
  workspace?: Partial<CognitiveWorkspaceConfig>;
  // Phase 5: ACT-R Activation blending
  activation?: {
    /** Weight for ACT-R activation score in the blended ranking (0-1, default 0.3) */
    weight?: number;
  };
  /**
   * Phase 6: Hard cap on total memories across all stores.
   * When exceeded, evict() removes the least-activated items to bring
   * the count back under cap. Default: 10000.
   */
  maxMemories?: number;
}

// ============================================================================
// Phase 5: ACT-R Activation Metadata
// ============================================================================

/** Memory type extended with optional ACT-R activation metadata */
export type MemoryWithActivation = Memory & { activation?: number };

// ============================================================================
// Unified Memory System
// ============================================================================

/**
 * Unified memory system with episodic, semantic, and procedural stores
 */
export class MemorySystem {
  readonly episodic: EpisodicStore;
  readonly semantic: SemanticStore;
  readonly procedural: ProceduralStore;
  readonly consolidation: ConsolidationService;
  readonly workspace: CognitiveWorkspace;  // Memory 2.0
  readonly metaMemory: MetaMemory;         // v14.0: Metacognitive layer
  private vectorDb: VectorDatabase | null = null;
  private vectorIndexDirty = true;
  // Phase 5: ACT-R activation engine (lazy-initialized on first recall)
  private activationEngine: ActivationEngine<string> | null = null;
  private readonly activationWeight: number;
  // Phase 6: Memory cap and eviction
  private readonly maxMemories: number;

  constructor(config: MemorySystemConfig = {}) {
    this.activationWeight = config.activation?.weight ?? 0.3;
    this.maxMemories = config.maxMemories ?? 10000;
    this.episodic = createEpisodicStore(config.episodic);
    this.semantic = createSemanticStore(config.semantic);
    this.procedural = createProceduralStore(config.procedural);
    this.metaMemory = createMetaMemory();
    this.consolidation = createConsolidationService(
      this.episodic,
      this.semantic,
      this.procedural,
      config.consolidation,
      this.metaMemory
    );

    // Memory 2.0: Create cognitive workspace
    this.workspace = createCognitiveWorkspace(config.workspace);

    // Connect workspace to stores
    this.workspace.connectStores({
      episodic: {
        search: (q: string, l: number) => this.episodic.search(q, l),
        get: (id: string) => this.episodic.get(id),
      },
      semantic: {
        search: (q: string, l: number) => this.semantic.search(q, l),
        getByConcept: (c: string) => this.semantic.getByConcept(c),
      },
      procedural: {
        search: (q: string, l: number) => this.procedural.search(q, l),
        getByName: (n: string) => this.procedural.getByName(n),
      },
    });

    // Auto-start background consolidation if configured
    if (config.consolidation?.autoStart) {
      this.consolidation.startBackground();
    }
  }

  // ============================================================================
  // High-Level API
  // ============================================================================

  /**
   * Store an episodic memory (event).
   *
   * Phase 6: After storing, if total memory count exceeds maxMemories, a
   * non-blocking eviction pass runs in the background to remove the least
   * activated items. The new memory is always returned immediately — eviction
   * never blocks the caller.
   */
  remember(options: CreateEpisodicOptions): EpisodicMemory {
    this.vectorIndexDirty = true;
    const created = this.episodic.createEpisode(options);

    // Phase 6: fire-and-forget eviction — failures are logged but never
    // propagate to the caller. Better to accumulate than to crash.
    if (this.getCount() > this.maxMemories) {
      this.evict().catch((err: unknown) =>
        console.error('[memory] eviction failed:', err)
      );
    }

    return created;
  }

  /**
   * Store a semantic memory (fact)
   */
  learn(options: CreateSemanticOptions): SemanticMemory {
    this.vectorIndexDirty = true;
    const created = this.semantic.createFact(options);
    // v14.0: Notify MetaMemory of new fact
    this.metaMemory.onFactCreated(created, {
      type: 'user_input',
      origin: 'direct-learn',
      reliability: 0.9,
    });
    return created;
  }

  /**
   * Store a procedural memory (skill)
   */
  learnSkill(options: CreateProceduralOptions): ProceduralMemory {
    this.vectorIndexDirty = true;
    return this.procedural.createSkill(options);
  }

  /**
   * Anticipate needed memories based on context (Memory 2.0)
   *
   * Uses context cues to predict which memories will be needed,
   * pre-loading them into working memory for fast access.
   */
  async anticipate(context: AnticipationContext): Promise<WorkingMemoryItem[]> {
    return this.workspace.anticipate(context);
  }

  /**
   * Get currently active memories in working memory (Memory 2.0)
   */
  getActive(): WorkingMemoryItem[] {
    return this.workspace.getActive();
  }

  /**
   * Get memory reuse metrics (Memory 2.0)
   */
  getReuseMetrics(): MemoryReuseMetrics {
    return this.workspace.getMetrics();
  }

  /**
   * Recall memories by query (hybrid: keyword + vector search when available).
   *
   * Phase 5: Results are re-ranked by blending Ebbinghaus retention with ACT-R
   * activation (A_i = B_i + spreading + noise). The blend weight is configurable
   * via MemorySystemConfig.activation.weight (default 0.3 ACT-R / 0.7 retention).
   * Falls back to pure retention ranking if the activation engine throws.
   *
   * Returned items carry an optional `activation` field with the raw ACT-R score.
   */
  recall(query: string, options: {
    types?: ('episodic' | 'semantic' | 'procedural')[];
    limit?: number;
    useVectors?: boolean;
  } = {}): MemoryWithActivation[] {
    const types = options.types || ['episodic', 'semantic', 'procedural'];
    const limit = options.limit || 10;
    const results: Memory[] = [];

    // Keyword-based search (existing)
    if (types.includes('episodic')) {
      results.push(...this.episodic.search(query, limit));
    }
    if (types.includes('semantic')) {
      results.push(...this.semantic.search(query, limit));
    }
    if (types.includes('procedural')) {
      results.push(...this.procedural.search(query, limit));
    }

    // Retention baseline: sort by Ebbinghaus curve and limit candidates
    const retentionSorted = results
      .sort((a, b) => this.getRetention(b) - this.getRetention(a))
      .slice(0, limit);

    // Phase 5: Blend Ebbinghaus retention with ACT-R activation
    try {
      const engine = this.getActivationEngine();

      // Build context elements from query terms for spreading activation.
      // Each term gets equal attentional weight summing to 1.
      const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
      const context: ContextElement[] = queryTerms.map(term => ({
        id: term,
        weight: 1 / Math.max(1, queryTerms.length),
      }));

      // Ensure every candidate is registered in the activation engine.
      // We seed with synthetic access history reconstructed from the memory's
      // accessCount and lastAccessed so base-level activation is meaningful
      // even on first encounter.
      for (const mem of retentionSorted) {
        if (!engine.get(mem.id)) {
          engine.store(mem.id, mem.id, mem.tags);
          const entry = engine.get(mem.id);
          if (entry) {
            entry.accessHistory = this.syntheticAccessHistory(mem);
            entry.accessCount = mem.accessCount;
          }
        }
      }

      // Compute raw ACT-R activations for all candidates
      const rawActivations: number[] = retentionSorted.map(
        mem => engine.computeActivation(mem.id, context)
      );

      // Normalize activations to [0, 1] for fair blending with retention (0-1)
      const minAct = Math.min(...rawActivations);
      const maxAct = Math.max(...rawActivations);
      const actRange = maxAct - minAct;
      const activationWeight = this.activationWeight;
      const retentionWeight = 1 - activationWeight;

      const scored: Array<{ mem: MemoryWithActivation; blended: number }> = retentionSorted.map(
        (mem, i) => {
          const retention = this.getRetention(mem);
          const rawAct = rawActivations[i];
          const normalizedAct = actRange > 0 ? (rawAct - minAct) / actRange : 0.5;
          const blended = retentionWeight * retention + activationWeight * normalizedAct;
          // Attach the raw ACT-R score as optional metadata
          (mem as MemoryWithActivation).activation = rawAct;
          return { mem: mem as MemoryWithActivation, blended };
        }
      );

      scored.sort((a, b) => b.blended - a.blended);

      // Record the retrieval as a new access in the engine so that the
      // ACT-R base-level activation grows with real usage over time
      for (const { mem } of scored) {
        engine.access(mem.id);
      }

      return scored.map(s => s.mem);
    } catch {
      // Graceful fallback: activation engine unavailable, return pure retention ranking
      return retentionSorted as MemoryWithActivation[];
    }
  }

  /**
   * Lazily initialize the ACT-R activation engine.
   * Uses lower noise (0.1 vs default 0.25) so ranking is more deterministic,
   * and sets retrievalThreshold to -Infinity so no candidates are blocked —
   * filtering is handled by the blended score, not ACT-R alone.
   */
  private getActivationEngine(): ActivationEngine<string> {
    if (!this.activationEngine) {
      this.activationEngine = new ActivationEngine<string>({
        decay: 0.5,
        noiseScale: 0.1,
        retrievalThreshold: -Infinity,
      });
    }
    return this.activationEngine;
  }

  /**
   * Reconstruct a plausible access-history array from coarse memory metadata.
   *
   * Individual access timestamps are not stored on Memory objects, so we
   * distribute `accessCount` accesses evenly backwards from `lastAccessed`,
   * spaced by the memory stability S (days, capped at 30 days per interval).
   * This gives the ACT-R base-level formula a reasonable recency/frequency
   * signal rather than a single phantom access at creation time.
   */
  private syntheticAccessHistory(mem: Memory): number[] {
    const count = Math.max(1, mem.accessCount);
    const lastMs = mem.lastAccessed.getTime();
    const intervalMs = Math.min(
      mem.S * 24 * 60 * 60 * 1000,
      30 * 24 * 60 * 60 * 1000
    );
    const history: number[] = [];
    for (let i = 0; i < count; i++) {
      history.unshift(lastMs - i * intervalMs);
    }
    return history;
  }

  /**
   * Semantic recall using vector embeddings (v13.8)
   * Falls back to keyword search if vectors unavailable.
   */
  async semanticRecall(query: string, options: {
    topK?: number;
    types?: ('episodic' | 'semantic' | 'procedural')[];
    minScore?: number;
  } = {}): Promise<Array<{ memory: Memory; score: number }>> {
    const topK = options.topK || 5;
    const minScore = options.minScore || 0.3;

    // Lazily initialize vector database
    if (!this.vectorDb) {
      try {
        this.vectorDb = getVectorDatabase();
        await this.vectorDb.load();
      } catch (err) {

        console.error('[index] operation failed:', err);
        // VectorDB unavailable — fall back to keyword recall
        return this.recall(query, { types: options.types, limit: topK })
          .map(m => ({ memory: m, score: 0.5 }));
      }
    }

    // Index memories if dirty (new memories added since last index)
    if (this.vectorIndexDirty) {
      await this.reindexVectors();
    }

    // Vector search
    try {
      const results = await this.vectorDb.search(query, topK);
      const memories: Array<{ memory: Memory; score: number }> = [];

      for (const result of results) {
        if (result.score < minScore) continue;

        // Resolve memory by ID from stores
        const memory = this.resolveMemoryById(result.id);
        if (memory) {
          memories.push({ memory, score: result.score });
        }
      }

      return memories;
    } catch (err) {

      console.error('[index] operation failed:', err);
      // Fallback to keyword search on vector failure
      return this.recall(query, { types: options.types, limit: topK })
        .map(m => ({ memory: m, score: 0.5 }));
    }
  }

  /**
   * Index all memories into vector database for semantic search.
   * Called lazily when semanticRecall is first used or when memories change.
   */
  private async reindexVectors(): Promise<void> {
    try {
      if (!this.vectorDb) return;

      const docs: Array<{ id: string; text: string; source?: string }> = [];

      // Index episodic memories
      for (const mem of this.episodic.getAll()) {
        const ep = mem as EpisodicMemory;
        const text = `${ep.content?.what || ''} ${ep.content?.details ? JSON.stringify(ep.content.details) : ''}`.trim();
        if (text) docs.push({ id: mem.id, text, source: 'episodic' });
      }

      // Index semantic memories
      for (const mem of this.semantic.getAll()) {
        const sem = mem as SemanticMemory;
        const text = `${sem.content?.concept || ''}: ${sem.content?.definition || ''}`.trim();
        if (text) docs.push({ id: mem.id, text, source: 'semantic' });
      }

      // Index procedural memories
      for (const mem of this.procedural.getAll()) {
        const proc = mem as ProceduralMemory;
        const text = `${proc.content?.name || ''}: ${proc.content?.description || ''}`.trim();
        if (text) docs.push({ id: mem.id, text, source: 'procedural' });
      }

      if (docs.length > 0) {
        await this.vectorDb.addBatch(docs);
      }
      this.vectorIndexDirty = false;
    } catch (err) {
      console.error('[memory] reindexVectors failed:', err);
    }
  }

  /**
   * Resolve a memory by ID across all stores
   */
  private resolveMemoryById(id: string): Memory | undefined {
    return this.episodic.get(id) || this.semantic.get(id) || this.procedural.get(id);
  }

  /**
   * Mark vector index as dirty (call after storing new memories)
   */
  markVectorsDirty(): void {
    this.vectorIndexDirty = true;
  }

  /**
   * Get a specific fact by concept name
   */
  getFact(concept: string): SemanticMemory | undefined {
    return this.semantic.getByConcept(concept);
  }

  /**
   * Get a specific skill by name
   */
  getSkill(name: string): ProceduralMemory | undefined {
    return this.procedural.getByName(name);
  }

  /**
   * Get recent episodes
   */
  getRecentEpisodes(limit: number = 10): EpisodicMemory[] {
    return this.episodic.getRecent(limit);
  }

  /**
   * Run consolidation (sleep mode)
   */
  async sleep(): Promise<ConsolidationResult> {
    return this.consolidation.sleep();
  }

  /**
   * Run quick background consolidation
   */
  async consolidate(): Promise<ConsolidationResult> {
    return this.consolidation.backgroundConsolidate();
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Calculate retention for any memory type
   */
  private getRetention(memory: Memory): number {
    const elapsed = Date.now() - memory.lastAccessed.getTime();
    const elapsedDays = elapsed / (1000 * 60 * 60 * 24);
    return memory.R0 * Math.exp(-elapsedDays / memory.S);
  }

  /**
   * Get overall memory statistics
   */
  getStats(): {
    total: number;
    episodic: StoreStats;
    semantic: StoreStats;
    procedural: StoreStats;
    forgetting: {
      episodic: ReturnType<typeof calculateForgettingStats>;
      semantic: ReturnType<typeof calculateForgettingStats>;
      procedural: ReturnType<typeof calculateForgettingStats>;
    };
    consolidation: ReturnType<ConsolidationService['getStats']>;
    workspace: ReturnType<CognitiveWorkspace['getStats']>;  // Memory 2.0
    reuse: MemoryReuseMetrics;  // Memory 2.0
  } {
    const episodicStats = this.episodic.stats();
    const semanticStats = this.semantic.stats();
    const proceduralStats = this.procedural.stats();

    return {
      total: episodicStats.total + semanticStats.total + proceduralStats.total,
      episodic: episodicStats,
      semantic: semanticStats,
      procedural: proceduralStats,
      forgetting: {
        episodic: calculateForgettingStats(this.episodic.getAll()),
        semantic: calculateForgettingStats(this.semantic.getAll()),
        procedural: calculateForgettingStats(this.procedural.getAll()),
      },
      consolidation: this.consolidation.getStats(),
      workspace: this.workspace.getStats(),  // Memory 2.0
      reuse: this.workspace.getMetrics(),    // Memory 2.0
    };
  }

  // ============================================================================
  // Phase 6: Memory Bounds and Eviction
  // ============================================================================

  /**
   * Return the total number of memories across all three stores.
   */
  getCount(): number {
    return (
      this.episodic.stats().total +
      this.semantic.stats().total +
      this.procedural.stats().total
    );
  }

  /**
   * Evict the `count` least-activated memories across all stores.
   *
   * Selection strategy:
   *   1. If the ACT-R activation engine has been initialized (i.e. recall has
   *      been called at least once), use `computeActivation()` with no context
   *      so that base-level activation (recency + frequency) drives ranking.
   *      Items that have never been seen by the engine fall back to LRU via
   *      lastAccessed.
   *   2. If the engine has never been initialized, fall back to pure LRU
   *      (oldest lastAccessed first).
   *
   * @param count  Number of items to remove. Defaults to 10 % of the excess
   *               above maxMemories, minimum 1.
   * @returns      Number of items actually removed.
   */
  async evict(count?: number): Promise<number> {
    const excess = this.getCount() - this.maxMemories;
    const toEvict = count ?? Math.max(1, Math.ceil(excess * 0.1));

    if (toEvict <= 0) return 0;

    // Gather all memories from all stores, tagged with their origin so we
    // can call the correct store's delete().
    type Tagged = { mem: Memory; store: 'episodic' | 'semantic' | 'procedural' };
    const all: Tagged[] = [
      ...this.episodic.getAll().map(m => ({ mem: m as Memory, store: 'episodic' as const })),
      ...this.semantic.getAll().map(m => ({ mem: m as Memory, store: 'semantic' as const })),
      ...this.procedural.getAll().map(m => ({ mem: m as Memory, store: 'procedural' as const })),
    ];

    if (all.length === 0) return 0;

    // Score each memory — lowest score = best eviction candidate.
    const engine = this.activationEngine;

    const scored: Array<{ item: Tagged; score: number }> = all.map(item => {
      // Try ACT-R base-level activation (no context = pure recency/frequency)
      if (engine) {
        const act = engine.computeActivation(item.mem.id, []);
        // computeActivation returns -Infinity when the id is not in the engine.
        // In that case fall through to LRU.
        if (isFinite(act)) {
          return { item, score: act };
        }
      }

      // LRU fallback: older last-access time = lower score.
      return { item, score: item.mem.lastAccessed.getTime() };
    });

    // Sort ascending: the cheapest memories to evict come first.
    scored.sort((a, b) => a.score - b.score);

    const victims = scored.slice(0, toEvict);
    let evicted = 0;

    for (const { item } of victims) {
      const id = item.mem.id;
      let removed = false;

      if (item.store === 'episodic') {
        removed = this.episodic.delete(id);
      } else if (item.store === 'semantic') {
        removed = this.semantic.delete(id);
      } else {
        removed = this.procedural.delete(id);
      }

      if (removed) {
        // Also remove from the activation engine if it has an entry.
        engine?.forget(id);
        evicted++;
      }
    }

    if (evicted > 0) {
      // The vector index is now stale.
      this.vectorIndexDirty = true;
    }

    return evicted;
  }

  /**
   * Clear all memories
   */
  clear(): void {
    this.episodic.clear();
    this.semantic.clear();
    this.procedural.clear();
    this.workspace.clear();  // Memory 2.0
    this.activationEngine = null; // Phase 5: reset engine on full clear
  }

  /**
   * Shutdown the memory system
   */
  shutdown(): void {
    this.consolidation.stopBackground();
    this.workspace.shutdown();  // Memory 2.0
  }

  // ============================================================================
  // Import/Export
  // ============================================================================

  /**
   * Export all memories to JSON
   */
  export(): {
    episodic: EpisodicMemory[];
    semantic: SemanticMemory[];
    procedural: ProceduralMemory[];
    exportedAt: string;
  } {
    return {
      episodic: this.episodic.getAll(),
      semantic: this.semantic.getAll(),
      procedural: this.procedural.getAll(),
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Import memories from JSON
   */
  import(data: {
    episodic?: EpisodicMemory[];
    semantic?: SemanticMemory[];
    procedural?: ProceduralMemory[];
  }): { imported: number } {
    let imported = 0;

    if (data.episodic) {
      for (const memory of data.episodic) {
        this.episodic.store(memory);
        imported++;
      }
    }

    if (data.semantic) {
      for (const memory of data.semantic) {
        this.semantic.store(memory);
        imported++;
      }
    }

    if (data.procedural) {
      for (const memory of data.procedural) {
        this.procedural.store(memory);
        imported++;
      }
    }

    return { imported };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new memory system
 */
export function createMemorySystem(config?: MemorySystemConfig): MemorySystem {
  return new MemorySystem(config);
}

// ============================================================================
// Singleton Instance (optional)
// ============================================================================

let memorySystemInstance: MemorySystem | null = null;

/**
 * Get or create the global memory system instance
 * v7.0: Consolidation auto-starts by default for real memory behavior
 */
export function getMemorySystem(config?: MemorySystemConfig): MemorySystem {
  if (!memorySystemInstance) {
    // v7.0: Default to autoStart for consolidation
    const configWithDefaults: MemorySystemConfig = {
      ...config,
      consolidation: {
        autoStart: true,  // v7.0: Enable consolidation by default
        backgroundIntervalMs: 10 * 60 * 1000, // 10 minutes
        ...config?.consolidation,
      },
    };
    memorySystemInstance = createMemorySystem(configWithDefaults);
  }
  return memorySystemInstance;
}

/**
 * Reset the global memory system instance
 */
export function resetMemorySystem(): void {
  if (memorySystemInstance) {
    memorySystemInstance.shutdown();
    memorySystemInstance = null;
  }
}

// =============================================================================
// v18.3.0: Component-Specific Memory Profiles
// =============================================================================

export {
  // Types
  type ComponentId,
  type ComponentMemoryProfile,
  type FSRSParameters,
  type RetentionCurve,
  type ConsolidationStrategy,
  type RetrievalPreferences,
  type CapacityAllocation,
  // Constants
  COMPONENT_PROFILES,
  // Functions
  getComponentProfile,
  getRegisteredComponents,
  getTotalCapacity,
  getComponentsByPriority,
  createCustomProfile,
} from './component-profiles.js';

// =============================================================================
// v18.3.0: FSRS v4 Spaced Repetition Scheduler
// =============================================================================

export {
  // Types
  type Rating,
  type CardState,
  type FSRSCard,
  type SchedulingResult,
  type ReviewLog,
  // Class
  FSRS,
  // Constants
  DEFAULT_FSRS_PARAMS,
  // Factory
  getFSRS,
  createComponentFSRS,
} from './fsrs.js';

// =============================================================================
// v18.3.0: Component Memory Manager
// =============================================================================

export {
  // Types
  type ComponentMemoryItem,
  type ComponentMemoryStats,
  type WorkingMemorySlot,
  // Class
  ComponentMemoryManager,
  // Factory
  getComponentMemory,
  getAllComponentManagers,
  getAggregatedStats,
  resetAllComponentManagers,
} from './component-memory.js';
