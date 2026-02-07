/**
 * Genesis 6.3 - Cognitive Workspace (Memory 2.0)
 *
 * Working memory with attention-based selection and anticipatory retrieval.
 *
 * Based on:
 * - Baddeley's Working Memory Model (central executive + buffers)
 * - Global Workspace Theory (Baars) - capacity-limited broadcast
 * - Active Inference (anticipatory recall)
 *
 * Key features:
 * - Capacity-limited buffer (like human 7±2 items)
 * - Attention-based selection and eviction
 * - Anticipatory pre-loading based on context
 * - Integration with episodic/semantic/procedural stores
 *
 * Architecture:
 * ```
 * Context → anticipate() → Pre-load
 *              ↓
 *         [Working Memory Buffer]
 *              ↓
 *         curate() → Select/Evict
 *              ↓
 *         [Active Items for Reasoning]
 * ```
 */

import { randomUUID } from 'crypto';
import {
  Memory,
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
  MemoryType,
} from './types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Store interface for episodic memories
 */
export interface EpisodicStoreInterface {
  search: (query: string, limit: number) => EpisodicMemory[];
  get: (id: string) => EpisodicMemory | undefined;
}

/**
 * Store interface for semantic memories
 */
export interface SemanticStoreInterface {
  search: (query: string, limit: number) => SemanticMemory[];
  getByConcept: (concept: string) => SemanticMemory | undefined;
}

/**
 * Store interface for procedural memories
 */
export interface ProceduralStoreInterface {
  search: (query: string, limit: number) => ProceduralMemory[];
  getByName: (name: string) => ProceduralMemory | undefined;
}

/**
 * Item in working memory with activation level
 */
export interface WorkingMemoryItem {
  id: string;
  memory: Memory;
  activation: number;       // 0-1, decays over time
  relevance: number;        // 0-1, context relevance
  accessCount: number;
  addedAt: Date;
  lastAccessed: Date;
  source: 'anticipate' | 'recall' | 'association' | 'manual';
}

/**
 * Context for anticipatory retrieval
 */
export interface AnticipationContext {
  // Current task/goal
  task?: string;
  goal?: string;

  // Recent history
  recentActions?: string[];
  recentTopics?: string[];

  // Active entities
  activeAgents?: string[];
  activeLocation?: string;

  // Emotional state
  emotionalState?: { valence: number; arousal: number };

  // Explicit cues
  keywords?: string[];
  tags?: string[];
}

/**
 * Configuration for cognitive workspace
 */
export interface CognitiveWorkspaceConfig {
  // Capacity limits
  maxItems: number;              // Max items in working memory (default: 7)
  maxTokens: number;             // Max estimated tokens (default: 8192)

  // Activation dynamics
  decayRate: number;             // Activation decay per second (default: 0.01)
  boostOnAccess: number;         // Activation boost on access (default: 0.3)
  minActivation: number;         // Below this, item is evicted (default: 0.1)

  // Anticipation
  anticipationDepth: number;     // How many items to pre-load (default: 5)
  associationStrength: number;   // Min association strength to follow (default: 0.3)

  // Curation
  curationInterval: number;      // ms between curation cycles (default: 5000)
  autoCurate: boolean;           // Auto-run curation (default: true)
}

export const DEFAULT_WORKSPACE_CONFIG: CognitiveWorkspaceConfig = {
  maxItems: 7,
  maxTokens: 8192,
  decayRate: 0.005, // Self-improved: slower decay for persistence
  boostOnAccess: 0.3,
  minActivation: 0.1,
  anticipationDepth: 7, // Self-improved: better context pre-loading
  associationStrength: 0.3,
  curationInterval: 5000,
  autoCurate: true,
};

/**
 * Memory reuse metrics for tracking efficiency
 */
export interface MemoryReuseMetrics {
  totalRecalls: number;
  cacheHits: number;           // Found in working memory
  storeHits: number;           // Found in long-term stores
  newCreations: number;        // Had to create new memory
  anticipationHits: number;    // Anticipated correctly
  anticipationMisses: number;  // Anticipated but not used

  // Computed
  reuseRate: number;           // (cacheHits + storeHits) / totalRecalls
  anticipationAccuracy: number; // hits / (hits + misses)
}

// ============================================================================
// Cognitive Workspace
// ============================================================================

/**
 * Working memory with attention-based selection and anticipatory retrieval
 */
export class CognitiveWorkspace {
  private config: CognitiveWorkspaceConfig;

  // Working memory buffer
  private buffer: Map<string, WorkingMemoryItem> = new Map();

  // Memory stores (injected)
  private episodicStore?: EpisodicStoreInterface;
  private semanticStore?: SemanticStoreInterface;
  private proceduralStore?: ProceduralStoreInterface;

  // Metrics
  private metrics: MemoryReuseMetrics = {
    totalRecalls: 0,
    cacheHits: 0,
    storeHits: 0,
    newCreations: 0,
    anticipationHits: 0,
    anticipationMisses: 0,
    reuseRate: 0,
    anticipationAccuracy: 0,
  };

  // Anticipation tracking
  private anticipatedIds: Set<string> = new Set();

  // v14.0: Coactivation matrix — tracks which items are accessed together
  private coactivationMatrix: Map<string, Map<string, number>> = new Map();

  // v14.0: Anticipation outcome log for adaptive pre-loading
  private anticipationLog: Map<string, { preloaded: string[]; hits: number; total: number }> = new Map();

  // v14.0: Spreading activation constant
  private static readonly SPREAD_FACTOR = 0.15;

  // Auto-curation timer
  private curationTimer?: ReturnType<typeof setInterval>;

  constructor(config: Partial<CognitiveWorkspaceConfig> = {}) {
    this.config = { ...DEFAULT_WORKSPACE_CONFIG, ...config };

    if (this.config.autoCurate) {
      this.startAutoCuration();
    }
  }

  // ============================================================================
  // Store Integration
  // ============================================================================

  /**
   * Connect to memory stores for retrieval
   */
  connectStores(stores: {
    episodic?: EpisodicStoreInterface;
    semantic?: SemanticStoreInterface;
    procedural?: ProceduralStoreInterface;
  }): void {
    this.episodicStore = stores.episodic;
    this.semanticStore = stores.semantic;
    this.proceduralStore = stores.procedural;
  }

  // ============================================================================
  // Anticipatory Retrieval
  // ============================================================================

  /**
   * Anticipate needed memories based on context
   *
   * Uses context cues to predict which memories will be needed,
   * and pre-loads them into working memory.
   */
  async anticipate(context: AnticipationContext): Promise<WorkingMemoryItem[]> {
    const anticipated: Memory[] = [];

    // Build search query from context
    const searchTerms: string[] = [];
    if (context.task) searchTerms.push(context.task);
    if (context.goal) searchTerms.push(context.goal);
    if (context.keywords) searchTerms.push(...context.keywords);
    if (context.recentTopics) searchTerms.push(...context.recentTopics.slice(-3));

    const query = searchTerms.join(' ');

    // v14.0: Adaptive depth based on past anticipation accuracy
    const contextKey = query.slice(0, 50) || 'default';
    const depth = this.getAdaptiveAnticipationDepth(contextKey);

    if (query && query.length > 0) {
      // Search each store
      if (this.episodicStore) {
        const episodes = this.episodicStore.search(query, depth);
        anticipated.push(...episodes);
      }

      if (this.semanticStore) {
        const facts = this.semanticStore.search(query, depth);
        anticipated.push(...facts);
      }

      if (this.proceduralStore) {
        const skills = this.proceduralStore.search(query, depth);
        anticipated.push(...skills);
      }
    }

    // Add by tags if provided
    if (context.tags && context.tags.length > 0) {
      const tagQuery = context.tags.join(' ');
      if (this.episodicStore) {
        anticipated.push(...this.episodicStore.search(tagQuery, 3));
      }
    }

    // Calculate relevance scores
    const items: WorkingMemoryItem[] = [];
    const preloadedIds: string[] = [];
    for (const memory of anticipated) {
      // Skip if already in buffer
      if (this.buffer.has(memory.id)) continue;

      const relevance = this.calculateRelevance(memory, context);
      if (relevance < 0.2) continue; // Skip low relevance

      const item = this.addToBuffer(memory, 'anticipate', relevance);
      items.push(item);
      preloadedIds.push(memory.id);

      // Track for anticipation metrics
      this.anticipatedIds.add(memory.id);
    }

    // v14.0: Track what was preloaded for outcome measurement
    this.trackAnticipation(contextKey, preloadedIds);

    return items;
  }

  /**
   * v14.0: Calculate structured similarity between two working memory items.
   * Multi-dimensional scoring replaces JSON.stringify matching.
   */
  private calculateStructuredSimilarity(a: WorkingMemoryItem, b: WorkingMemoryItem): number {
    const memA = a.memory;
    const memB = b.memory;

    // 1. Type match (0.25 weight)
    const typeMatch = memA.type === memB.type ? 1.0 : 0.0;

    // 2. Concept/tag overlap — Jaccard on arrays (0.35 weight)
    const tagsA = new Set(memA.tags || []);
    const tagsB = new Set(memB.tags || []);
    let conceptOverlap = 0;
    if (tagsA.size > 0 || tagsB.size > 0) {
      const intersection = [...tagsA].filter(t => tagsB.has(t)).length;
      const union = new Set([...tagsA, ...tagsB]).size;
      conceptOverlap = union > 0 ? intersection / union : 0;
    }

    // 3. Temporal proximity (0.20 weight) — exp decay over 1 day
    const timeA = memA.lastAccessed?.getTime?.() || memA.created?.getTime?.() || Date.now();
    const timeB = memB.lastAccessed?.getTime?.() || memB.created?.getTime?.() || Date.now();
    const temporalProx = Math.exp(-Math.abs(timeA - timeB) / 86400000);

    // 4. Access recency similarity (0.05 weight) — exp decay over 1 hour
    const accessA = a.lastAccessed.getTime();
    const accessB = b.lastAccessed.getTime();
    const accessRecency = Math.exp(-Math.abs(accessA - accessB) / 3600000);

    // 5. Coactivation history (0.15 weight)
    const coactivation = this.getCoactivation(a.id, b.id);

    return 0.25 * typeMatch +
           0.35 * conceptOverlap +
           0.20 * temporalProx +
           0.05 * accessRecency +
           0.15 * coactivation;
  }

  /**
   * Get coactivation strength between two items
   */
  private getCoactivation(idA: string, idB: string): number {
    return this.coactivationMatrix.get(idA)?.get(idB) ||
           this.coactivationMatrix.get(idB)?.get(idA) || 0;
  }

  /**
   * Update coactivation matrix when an item is accessed
   */
  private updateCoactivation(accessedId: string): void {
    for (const [otherId] of this.buffer) {
      if (otherId === accessedId) continue;
      // Ensure entry exists
      if (!this.coactivationMatrix.has(accessedId)) {
        this.coactivationMatrix.set(accessedId, new Map());
      }
      const row = this.coactivationMatrix.get(accessedId)!;
      const current = row.get(otherId) || 0;
      row.set(otherId, Math.min(1.0, current + 0.1));
    }
  }

  /**
   * Calculate relevance of a memory to the current context
   * v14.0: Structured multi-dimensional scoring
   */
  private calculateRelevance(memory: Memory, context: AnticipationContext): number {
    let score = 0;

    // 1. Tag/keyword overlap with context (0.35 weight)
    const contextTerms = new Set([
      ...(context.keywords || []),
      ...(context.tags || []),
      ...(context.recentTopics || []),
    ].map(t => t.toLowerCase()));
    const memoryTags = new Set((memory.tags || []).map(t => t.toLowerCase()));
    if (contextTerms.size > 0) {
      const intersection = [...memoryTags].filter(t => contextTerms.has(t)).length;
      // Also check task/goal words against tags
      const taskWords = ((context.task || '') + ' ' + (context.goal || ''))
        .toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const taskMatches = taskWords.filter(w => memoryTags.has(w)).length;
      const totalMatches = intersection + taskMatches;
      const totalPossible = Math.max(contextTerms.size + taskWords.length, 1);
      score += 0.35 * Math.min(1, totalMatches / totalPossible * 2); // *2 because partial match is OK
    }

    // 2. Temporal recency (0.20 weight) — recent memories more relevant
    const ageMs = Date.now() - (memory.lastAccessed?.getTime?.() || memory.created?.getTime?.() || Date.now());
    const recency = Math.exp(-ageMs / (24 * 3600000)); // 1-day decay
    score += 0.20 * recency;

    // 3. Type match with context (0.15 weight) — procedural more relevant for task contexts
    if (context.task && memory.type === 'procedural') score += 0.15;
    else if (context.recentTopics && memory.type === 'semantic') score += 0.12;
    else if (memory.type === 'episodic') score += 0.08;

    // 4. Importance (0.15 weight)
    score += 0.15 * memory.importance;

    // 5. Coactivation with currently active items (0.15 weight)
    let maxCoactivation = 0;
    for (const [activeId] of this.buffer) {
      const coact = this.getCoactivation(memory.id, activeId);
      if (coact > maxCoactivation) maxCoactivation = coact;
    }
    score += 0.15 * maxCoactivation;

    return Math.min(1, score);
  }

  // ============================================================================
  // Working Memory Operations
  // ============================================================================

  /**
   * Add a memory to working memory buffer
   */
  addToBuffer(
    memory: Memory,
    source: WorkingMemoryItem['source'] = 'manual',
    relevance: number = 0.5
  ): WorkingMemoryItem {
    // Check if already in buffer
    const existing = this.buffer.get(memory.id);
    if (existing) {
      this.access(memory.id);
      return existing;
    }

    const item: WorkingMemoryItem = {
      id: memory.id,
      memory,
      activation: 1.0, // Start at full activation
      relevance,
      accessCount: 1,
      addedAt: new Date(),
      lastAccessed: new Date(),
      source,
    };

    this.buffer.set(memory.id, item);

    // Maintain capacity
    this.maintainCapacity();

    return item;
  }

  /**
   * Access a memory in working memory (boosts activation)
   * v14.0: Now includes spreading activation to related items
   */
  access(id: string): WorkingMemoryItem | undefined {
    const item = this.buffer.get(id);
    if (!item) {
      this.metrics.totalRecalls++;
      return undefined;
    }

    // Boost activation
    item.activation = Math.min(1, item.activation + this.config.boostOnAccess);
    item.accessCount++;
    item.lastAccessed = new Date();

    // v14.0: Spreading activation — propagate to similar items
    for (const [otherId, otherItem] of this.buffer) {
      if (otherId === id) continue;
      const similarity = this.calculateStructuredSimilarity(item, otherItem);
      if (similarity > this.config.associationStrength) {
        otherItem.activation = Math.min(
          1.0,
          otherItem.activation + CognitiveWorkspace.SPREAD_FACTOR * similarity * item.activation
        );
      }
    }

    // v14.0: Update coactivation matrix
    this.updateCoactivation(id);

    // Track metrics
    this.metrics.totalRecalls++;
    this.metrics.cacheHits++;

    // Track anticipation hit
    if (this.anticipatedIds.has(id)) {
      this.metrics.anticipationHits++;
      this.anticipatedIds.delete(id);
    }

    this.updateMetrics();
    return item;
  }

  /**
   * Recall a memory (from buffer or stores)
   */
  recall(id: string): Memory | undefined {
    // Check buffer first
    const bufferItem = this.access(id);
    if (bufferItem) {
      return bufferItem.memory;
    }

    // Search stores
    let memory: Memory | undefined;

    if (this.episodicStore) {
      memory = this.episodicStore.get(id);
    }
    if (!memory && this.semanticStore) {
      // Semantic store uses concept lookup, skip ID lookup
    }
    if (!memory && this.proceduralStore) {
      // Procedural store uses name lookup, skip ID lookup
    }

    if (memory) {
      this.metrics.storeHits++;
      this.addToBuffer(memory, 'recall', 0.7);
      this.updateMetrics();
      return memory;
    }

    this.updateMetrics();
    return undefined;
  }

  /**
   * Get all items currently in working memory
   */
  getActive(): WorkingMemoryItem[] {
    return Array.from(this.buffer.values())
      .sort((a, b) => b.activation - a.activation);
  }

  /**
   * Get items by type
   */
  getByType(type: MemoryType): WorkingMemoryItem[] {
    return this.getActive().filter(item => item.memory.type === type);
  }

  /**
   * Check if a memory is in working memory
   */
  isActive(id: string): boolean {
    return this.buffer.has(id);
  }

  /**
   * Get working memory size
   */
  size(): number {
    return this.buffer.size;
  }

  // ============================================================================
  // Curation
  // ============================================================================

  /**
   * Curate working memory: decay activations and evict low-activation items
   */
  curate(): { decayed: number; evicted: string[] } {
    const now = Date.now();
    let decayed = 0;
    const evicted: string[] = [];

    for (const [id, item] of this.buffer) {
      // Decay activation based on time since last access
      const timeSinceAccess = (now - item.lastAccessed.getTime()) / 1000;
      const decay = this.config.decayRate * timeSinceAccess;
      item.activation = Math.max(0, item.activation - decay);
      decayed++;

      // Evict if below threshold
      if (item.activation < this.config.minActivation) {
        this.buffer.delete(id);
        evicted.push(id);

        // Track anticipation miss
        if (this.anticipatedIds.has(id)) {
          this.metrics.anticipationMisses++;
          this.anticipatedIds.delete(id);
        }
      }
    }

    this.updateMetrics();
    return { decayed, evicted };
  }

  /**
   * Start automatic curation
   */
  startAutoCuration(): void {
    if (this.curationTimer) return;

    this.curationTimer = setInterval(() => {
      this.curate();
    }, this.config.curationInterval);
  }

  /**
   * Stop automatic curation
   */
  stopAutoCuration(): void {
    if (this.curationTimer) {
      clearInterval(this.curationTimer);
      this.curationTimer = undefined;
    }
  }

  // ============================================================================
  // Capacity Management
  // ============================================================================

  /**
   * Maintain working memory capacity by evicting low-activation items
   */
  private maintainCapacity(): void {
    // Check item count
    while (this.buffer.size > this.config.maxItems) {
      this.evictLowest();
    }

    // Check token estimate (rough: 100 chars ≈ 25 tokens)
    let totalTokens = 0;
    for (const item of this.buffer.values()) {
      const content = JSON.stringify(item.memory);
      totalTokens += Math.ceil(content.length / 4);
    }

    while (totalTokens > this.config.maxTokens && this.buffer.size > 0) {
      const evicted = this.evictLowest();
      if (evicted) {
        const content = JSON.stringify(evicted.memory);
        totalTokens -= Math.ceil(content.length / 4);
      } else {
        break;
      }
    }
  }

  /**
   * Evict the item with lowest activation
   * v14.0: Added recency bonus to eviction score
   */
  private evictLowest(): WorkingMemoryItem | undefined {
    let lowest: WorkingMemoryItem | undefined;
    let lowestScore = Infinity;
    const now = Date.now();

    for (const item of this.buffer.values()) {
      // v14.0: Score includes recency bonus (10-minute decay)
      const timeSinceAccess = now - item.lastAccessed.getTime();
      const recencyBonus = 1 + 0.3 * Math.exp(-timeSinceAccess / 600000);
      const score = item.activation * item.relevance * item.memory.importance * recencyBonus;
      if (score < lowestScore) {
        lowestScore = score;
        lowest = item;
      }
    }

    if (lowest) {
      this.buffer.delete(lowest.id);

      // Track anticipation miss
      if (this.anticipatedIds.has(lowest.id)) {
        this.metrics.anticipationMisses++;
        this.anticipatedIds.delete(lowest.id);
      }
    }

    return lowest;
  }

  // ============================================================================
  // Metrics
  // ============================================================================

  /**
   * Update computed metrics
   */
  private updateMetrics(): void {
    const total = this.metrics.totalRecalls;
    if (total > 0) {
      this.metrics.reuseRate = (this.metrics.cacheHits + this.metrics.storeHits) / total;
    }

    const anticipationTotal = this.metrics.anticipationHits + this.metrics.anticipationMisses;
    if (anticipationTotal > 0) {
      this.metrics.anticipationAccuracy = this.metrics.anticipationHits / anticipationTotal;
    }
  }

  /**
   * Get memory reuse metrics
   */
  getMetrics(): MemoryReuseMetrics {
    return { ...this.metrics };
  }

  /**
   * Record a new memory creation (for metrics)
   */
  recordNewCreation(): void {
    this.metrics.newCreations++;
    this.metrics.totalRecalls++;
    this.updateMetrics();
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRecalls: 0,
      cacheHits: 0,
      storeHits: 0,
      newCreations: 0,
      anticipationHits: 0,
      anticipationMisses: 0,
      reuseRate: 0,
      anticipationAccuracy: 0,
    };
  }

  // ============================================================================
  // Workspace State
  // ============================================================================

  /**
   * Get workspace statistics
   */
  getStats(): {
    itemCount: number;
    maxItems: number;
    estimatedTokens: number;
    maxTokens: number;
    avgActivation: number;
    avgRelevance: number;
    byType: Record<MemoryType, number>;
    bySource: Record<WorkingMemoryItem['source'], number>;
  } {
    const items = this.getActive();
    let totalActivation = 0;
    let totalRelevance = 0;
    let totalTokens = 0;
    const byType: Record<MemoryType, number> = { episodic: 0, semantic: 0, procedural: 0 };
    const bySource: Record<WorkingMemoryItem['source'], number> = {
      anticipate: 0, recall: 0, association: 0, manual: 0
    };

    for (const item of items) {
      totalActivation += item.activation;
      totalRelevance += item.relevance;
      totalTokens += Math.ceil(JSON.stringify(item.memory).length / 4);
      byType[item.memory.type]++;
      bySource[item.source]++;
    }

    return {
      itemCount: items.length,
      maxItems: this.config.maxItems,
      estimatedTokens: totalTokens,
      maxTokens: this.config.maxTokens,
      avgActivation: items.length > 0 ? totalActivation / items.length : 0,
      avgRelevance: items.length > 0 ? totalRelevance / items.length : 0,
      byType,
      bySource,
    };
  }

  /**
   * Clear working memory
   */
  clear(): void {
    // Track all anticipated items as misses
    for (const id of this.anticipatedIds) {
      if (this.buffer.has(id)) {
        this.metrics.anticipationMisses++;
      }
    }
    this.anticipatedIds.clear();
    this.buffer.clear();
  }

  /**
   * Shutdown workspace
   */
  shutdown(): void {
    this.stopAutoCuration();
    this.clear();
  }

  // ============================================================================
  // v14.0: Adaptive Anticipation
  // ============================================================================

  /**
   * Record outcome of an anticipation cycle.
   * Compares pre-loaded memories against actually used memories
   * to adapt future pre-loading behavior.
   */
  recordAnticipationOutcome(contextKey: string, usedMemoryIds: string[]): void {
    const entry = this.anticipationLog.get(contextKey);
    if (!entry || entry.preloaded.length === 0) return;

    const usedSet = new Set(usedMemoryIds);
    const hits = entry.preloaded.filter(id => usedSet.has(id)).length;

    entry.hits += hits;
    entry.total++;
    this.anticipationLog.set(contextKey, entry);
  }

  /**
   * Get adaptive anticipation depth for a context.
   * Reduces pre-loading for contexts with low hit rates,
   * increases for contexts with high hit rates.
   */
  getAdaptiveAnticipationDepth(contextKey: string): number {
    const entry = this.anticipationLog.get(contextKey);
    if (!entry || entry.total < 3) return this.config.anticipationDepth;

    const hitRate = entry.hits / Math.max(entry.preloaded.length * entry.total, 1);

    if (hitRate < 0.2) {
      return Math.max(2, Math.floor(this.config.anticipationDepth / 2));
    } else if (hitRate > 0.6) {
      return Math.min(15, Math.floor(this.config.anticipationDepth * 1.5));
    }
    return this.config.anticipationDepth;
  }

  /**
   * Track which items were pre-loaded for a context
   */
  trackAnticipation(contextKey: string, preloadedIds: string[]): void {
    const existing = this.anticipationLog.get(contextKey);
    if (existing) {
      existing.preloaded = preloadedIds;
    } else {
      this.anticipationLog.set(contextKey, { preloaded: preloadedIds, hits: 0, total: 0 });
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createCognitiveWorkspace(
  config?: Partial<CognitiveWorkspaceConfig>
): CognitiveWorkspace {
  return new CognitiveWorkspace(config);
}

// ============================================================================
// Singleton
// ============================================================================

let workspaceInstance: CognitiveWorkspace | null = null;

export function getCognitiveWorkspace(
  config?: Partial<CognitiveWorkspaceConfig>
): CognitiveWorkspace {
  if (!workspaceInstance) {
    workspaceInstance = createCognitiveWorkspace(config);
  }
  return workspaceInstance;
}

export function resetCognitiveWorkspace(): void {
  if (workspaceInstance) {
    workspaceInstance.shutdown();
    workspaceInstance = null;
  }
}
