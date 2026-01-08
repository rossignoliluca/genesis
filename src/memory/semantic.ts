/**
 * Genesis 6.0 - Semantic Memory Store
 *
 * Stores facts and concepts - encyclopedic knowledge.
 * "What things mean, general knowledge"
 *
 * Key features:
 * - Concept hierarchy (superordinates, subordinates)
 * - Category-based organization
 * - Confidence tracking
 * - Contradiction detection
 *
 * Reference: Tulving, E. (1972). Episodic and semantic memory.
 */

import { randomUUID } from 'crypto';
import {
  SemanticMemory,
  IMemoryStore,
  MemoryFilter,
  StoreStats,
} from './types.js';
import {
  calculateRetention,
  calculateInitialParams,
  updateStabilityOnRecall,
  shouldForget,
  FORGETTING_THRESHOLDS,
} from './forgetting.js';

// ============================================================================
// Types
// ============================================================================

export interface SemanticStoreConfig {
  maxSize: number;
  autoForget: boolean;
  forgetThreshold: number;
  defaultStability: number;
  minConfidence: number;
}

export interface CreateSemanticOptions {
  concept: string;
  definition?: string;
  properties?: Record<string, any>;
  category: string;
  superordinates?: string[];
  subordinates?: string[];
  related?: string[];
  confidence?: number;
  sources?: string[];
  importance?: number;
  tags?: string[];
  associations?: string[];
}

// ============================================================================
// Semantic Store
// ============================================================================

export class SemanticStore implements IMemoryStore<SemanticMemory> {
  private memories: Map<string, SemanticMemory> = new Map();
  private config: SemanticStoreConfig;

  // Indexes for efficient querying
  private byConcept: Map<string, string> = new Map();      // concept name -> id
  private byCategory: Map<string, Set<string>> = new Map();
  private byTag: Map<string, Set<string>> = new Map();
  private hierarchy: Map<string, Set<string>> = new Map(); // parent -> children

  constructor(config: Partial<SemanticStoreConfig> = {}) {
    this.config = {
      maxSize: 50000,
      autoForget: true,
      forgetThreshold: FORGETTING_THRESHOLDS.FORGET,
      defaultStability: 30, // Semantic memories are more stable
      minConfidence: 0.3,
      ...config,
    };
  }

  // ============================================================================
  // Store
  // ============================================================================

  store(
    input: Omit<SemanticMemory, 'id' | 'created' | 'lastAccessed' | 'accessCount'>
  ): SemanticMemory {
    const now = new Date();
    const id = randomUUID();

    const memory: SemanticMemory = {
      ...input,
      id,
      created: now,
      lastAccessed: now,
      accessCount: 1,
    };

    // Check for existing concept
    const existingId = this.byConcept.get(memory.content.concept.toLowerCase());
    if (existingId) {
      // Merge with existing
      return this.mergeWith(existingId, memory);
    }

    this.memories.set(id, memory);
    this.updateIndexes(memory);
    this.maintainSize();

    return memory;
  }

  /**
   * Convenience method to create a semantic memory from options
   */
  createFact(options: CreateSemanticOptions): SemanticMemory {
    const now = new Date();
    const params = calculateInitialParams({
      importance: options.importance,
      complexity: 0.3, // Facts are generally less complex than episodes
      priorKnowledge: (options.related?.length || 0) > 0,
    });

    // Higher stability for semantic memories
    params.S = this.config.defaultStability;

    return this.store({
      type: 'semantic',
      content: {
        concept: options.concept,
        definition: options.definition,
        properties: options.properties || {},
      },
      category: options.category,
      superordinates: options.superordinates || [],
      subordinates: options.subordinates || [],
      related: options.related || [],
      confidence: options.confidence || 0.8,
      sources: options.sources || [],
      contradictions: [],
      usageCount: 0,
      lastUsed: now,
      R0: params.R0,
      S: params.S,
      importance: options.importance || 0.5,
      emotionalValence: 0, // Facts are neutral
      associations: options.associations || [],
      tags: options.tags || [],
      consolidated: true, // Semantic memories are already consolidated
    });
  }

  /**
   * Merge new information with existing concept
   */
  private mergeWith(existingId: string, newMemory: SemanticMemory): SemanticMemory {
    const existing = this.memories.get(existingId);
    if (!existing) {
      return newMemory;
    }

    // Merge properties
    existing.content.properties = {
      ...existing.content.properties,
      ...newMemory.content.properties,
    };

    // Update definition if new one provided
    if (newMemory.content.definition) {
      existing.content.definition = newMemory.content.definition;
    }

    // Merge relationships
    existing.superordinates = [...new Set([...existing.superordinates, ...newMemory.superordinates])];
    existing.subordinates = [...new Set([...existing.subordinates, ...newMemory.subordinates])];
    existing.related = [...new Set([...existing.related, ...newMemory.related])];
    existing.sources = [...new Set([...existing.sources, ...newMemory.sources])];
    existing.tags = [...new Set([...existing.tags, ...newMemory.tags])];

    // Update confidence (weighted average)
    existing.confidence = (existing.confidence + newMemory.confidence) / 2;

    // Strengthen memory
    existing.S = updateStabilityOnRecall(existing, true);
    existing.lastAccessed = new Date();
    existing.usageCount++;

    return existing;
  }

  // ============================================================================
  // Get / Update / Delete
  // ============================================================================

  get(id: string): SemanticMemory | undefined {
    const memory = this.memories.get(id);
    if (memory) {
      this.accessMemory(memory);
    }
    return memory;
  }

  /**
   * Get by concept name
   */
  getByConcept(concept: string): SemanticMemory | undefined {
    const id = this.byConcept.get(concept.toLowerCase());
    if (id) {
      return this.get(id);
    }
    return undefined;
  }

  /**
   * Get without updating access (for internal use)
   */
  peek(id: string): SemanticMemory | undefined {
    return this.memories.get(id);
  }

  update(id: string, updates: Partial<SemanticMemory>): SemanticMemory | undefined {
    const memory = this.memories.get(id);
    if (!memory) return undefined;

    // Remove from indexes before update
    this.removeFromIndexes(memory);

    // Apply updates
    Object.assign(memory, updates);

    // Re-add to indexes
    this.updateIndexes(memory);

    return memory;
  }

  delete(id: string): boolean {
    const memory = this.memories.get(id);
    if (!memory) return false;

    this.removeFromIndexes(memory);
    this.memories.delete(id);
    return true;
  }

  // ============================================================================
  // Query
  // ============================================================================

  query(filter: MemoryFilter<SemanticMemory>): SemanticMemory[] {
    let results = this.getAll();

    if (filter.minImportance !== undefined) {
      results = results.filter((m) => m.importance >= filter.minImportance!);
    }

    if (filter.maxAge !== undefined) {
      const cutoff = Date.now() - filter.maxAge * 24 * 60 * 60 * 1000;
      results = results.filter((m) => m.created.getTime() >= cutoff);
    }

    if (filter.minRetention !== undefined) {
      results = results.filter((m) => {
        const retention = calculateRetention(
          { R0: m.R0, S: m.S },
          m.lastAccessed.getTime()
        );
        return retention >= filter.minRetention!;
      });
    }

    if (filter.tags && filter.tags.length > 0) {
      results = results.filter((m) =>
        filter.tags!.some((t) => m.tags.includes(t))
      );
    }

    if (filter.custom) {
      results = results.filter(filter.custom);
    }

    return results;
  }

  /**
   * Search by keyword in concept and definition
   */
  search(queryStr: string, limit: number = 10): SemanticMemory[] {
    const keywords = queryStr.toLowerCase().split(/\s+/);

    const results = this.getAll().filter((m) => {
      const searchable = [
        m.content.concept,
        m.content.definition || '',
        m.category,
        ...m.tags,
      ].join(' ').toLowerCase();
      return keywords.some((k) => searchable.includes(k));
    });

    // Sort by confidence * retention
    results.sort((a, b) => {
      const scoreA = a.confidence * calculateRetention(
        { R0: a.R0, S: a.S },
        a.lastAccessed.getTime()
      );
      const scoreB = b.confidence * calculateRetention(
        { R0: b.R0, S: b.S },
        b.lastAccessed.getTime()
      );
      return scoreB - scoreA;
    });

    return results.slice(0, limit);
  }

  // ============================================================================
  // Category and Hierarchy Queries
  // ============================================================================

  /**
   * Get all facts in a category
   */
  getByCategory(category: string): SemanticMemory[] {
    const ids = this.byCategory.get(category);
    if (!ids) return [];

    return Array.from(ids)
      .map((id) => this.memories.get(id))
      .filter((m): m is SemanticMemory => m !== undefined);
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    return Array.from(this.byCategory.keys());
  }

  /**
   * Get superordinate concepts (more general)
   */
  getSuperordinates(id: string): SemanticMemory[] {
    const memory = this.memories.get(id);
    if (!memory) return [];

    return memory.superordinates
      .map((name) => this.getByConcept(name))
      .filter((m): m is SemanticMemory => m !== undefined);
  }

  /**
   * Get subordinate concepts (more specific)
   */
  getSubordinates(id: string): SemanticMemory[] {
    const memory = this.memories.get(id);
    if (!memory) return [];

    return memory.subordinates
      .map((name) => this.getByConcept(name))
      .filter((m): m is SemanticMemory => m !== undefined);
  }

  /**
   * Get related concepts
   */
  getRelated(id: string): SemanticMemory[] {
    const memory = this.memories.get(id);
    if (!memory) return [];

    return memory.related
      .map((name) => this.getByConcept(name))
      .filter((m): m is SemanticMemory => m !== undefined);
  }

  // ============================================================================
  // Contradiction Detection
  // ============================================================================

  /**
   * Check if a new fact contradicts existing knowledge
   */
  findContradictions(concept: string, properties: Record<string, any>): SemanticMemory[] {
    const existing = this.getByConcept(concept);
    if (!existing) return [];

    const contradictions: SemanticMemory[] = [];

    // Check for property conflicts
    for (const [key, value] of Object.entries(properties)) {
      if (existing.content.properties[key] !== undefined &&
          existing.content.properties[key] !== value) {
        contradictions.push(existing);
        break;
      }
    }

    return contradictions;
  }

  /**
   * Get all facts with contradictions
   */
  getContradictedFacts(): SemanticMemory[] {
    return this.getAll().filter((m) =>
      m.contradictions && m.contradictions.length > 0
    );
  }

  /**
   * Record a contradiction
   */
  addContradiction(id: string, contradictingId: string): void {
    const memory = this.memories.get(id);
    if (!memory) return;

    if (!memory.contradictions) {
      memory.contradictions = [];
    }
    if (!memory.contradictions.includes(contradictingId)) {
      memory.contradictions.push(contradictingId);
    }
  }

  // ============================================================================
  // Bulk Operations
  // ============================================================================

  getAll(): SemanticMemory[] {
    return Array.from(this.memories.values());
  }

  clear(): void {
    this.memories.clear();
    this.byConcept.clear();
    this.byCategory.clear();
    this.byTag.clear();
    this.hierarchy.clear();
  }

  count(): number {
    return this.memories.size;
  }

  // ============================================================================
  // Stats
  // ============================================================================

  stats(): StoreStats {
    const all = this.getAll();
    let totalRetention = 0;
    let totalImportance = 0;
    let consolidated = 0;
    let oldest: Date | undefined;
    let newest: Date | undefined;

    for (const memory of all) {
      totalRetention += calculateRetention(
        { R0: memory.R0, S: memory.S },
        memory.lastAccessed.getTime()
      );
      totalImportance += memory.importance;

      if (memory.consolidated) consolidated++;

      if (!oldest || memory.created < oldest) oldest = memory.created;
      if (!newest || memory.created > newest) newest = memory.created;
    }

    return {
      total: all.length,
      byType: {
        episodic: 0,
        semantic: all.length,
        procedural: 0,
      },
      consolidated,
      avgRetention: all.length > 0 ? totalRetention / all.length : 0,
      avgImportance: all.length > 0 ? totalImportance / all.length : 0,
      oldestMemory: oldest,
      newestMemory: newest,
    };
  }

  /**
   * Get additional semantic-specific stats
   */
  semanticStats(): {
    totalFacts: number;
    categories: number;
    avgConfidence: number;
    contradictions: number;
    mostUsed: SemanticMemory[];
  } {
    const all = this.getAll();
    let totalConfidence = 0;
    let contradictions = 0;

    for (const m of all) {
      totalConfidence += m.confidence;
      if (m.contradictions && m.contradictions.length > 0) {
        contradictions++;
      }
    }

    const mostUsed = [...all]
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10);

    return {
      totalFacts: all.length,
      categories: this.byCategory.size,
      avgConfidence: all.length > 0 ? totalConfidence / all.length : 0,
      contradictions,
      mostUsed,
    };
  }

  // ============================================================================
  // Forgetting Integration
  // ============================================================================

  /**
   * Get facts that should be forgotten (low retention AND low confidence)
   */
  getForgotten(): SemanticMemory[] {
    return this.getAll().filter((m) => {
      const retention = calculateRetention(
        { R0: m.R0, S: m.S },
        m.lastAccessed.getTime()
      );
      return retention < this.config.forgetThreshold &&
             m.confidence < this.config.minConfidence;
    });
  }

  /**
   * Run forgetting cycle
   */
  runForgetting(): { forgotten: number; ids: string[] } {
    const toForget = this.getForgotten();
    const ids = toForget.map((m) => m.id);

    for (const id of ids) {
      this.delete(id);
    }

    return { forgotten: ids.length, ids };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private accessMemory(memory: SemanticMemory): void {
    memory.lastAccessed = new Date();
    memory.lastUsed = new Date();
    memory.accessCount++;
    memory.usageCount++;
    memory.S = updateStabilityOnRecall(memory, true);
  }

  private updateIndexes(memory: SemanticMemory): void {
    // Concept index
    this.byConcept.set(memory.content.concept.toLowerCase(), memory.id);

    // Category index
    if (!this.byCategory.has(memory.category)) {
      this.byCategory.set(memory.category, new Set());
    }
    this.byCategory.get(memory.category)!.add(memory.id);

    // Tag index
    for (const tag of memory.tags) {
      if (!this.byTag.has(tag)) {
        this.byTag.set(tag, new Set());
      }
      this.byTag.get(tag)!.add(memory.id);
    }

    // Hierarchy index
    for (const parent of memory.superordinates) {
      if (!this.hierarchy.has(parent)) {
        this.hierarchy.set(parent, new Set());
      }
      this.hierarchy.get(parent)!.add(memory.content.concept);
    }
  }

  private removeFromIndexes(memory: SemanticMemory): void {
    this.byConcept.delete(memory.content.concept.toLowerCase());
    this.byCategory.get(memory.category)?.delete(memory.id);

    for (const tag of memory.tags) {
      this.byTag.get(tag)?.delete(memory.id);
    }

    for (const parent of memory.superordinates) {
      this.hierarchy.get(parent)?.delete(memory.content.concept);
    }
  }

  private maintainSize(): void {
    if (!this.config.autoForget) return;
    if (this.memories.size <= this.config.maxSize) return;

    // First, forget low-confidence memories
    this.runForgetting();

    // If still over limit, remove lowest confidence * retention
    while (this.memories.size > this.config.maxSize) {
      let weakest: SemanticMemory | null = null;
      let weakestScore = Infinity;

      for (const memory of this.memories.values()) {
        const retention = calculateRetention(
          { R0: memory.R0, S: memory.S },
          memory.lastAccessed.getTime()
        );
        const score = memory.confidence * retention;
        if (score < weakestScore) {
          weakestScore = score;
          weakest = memory;
        }
      }

      if (weakest) {
        this.delete(weakest.id);
      } else {
        break;
      }
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createSemanticStore(config?: Partial<SemanticStoreConfig>): SemanticStore {
  return new SemanticStore(config);
}
