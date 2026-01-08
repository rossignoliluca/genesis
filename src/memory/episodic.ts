/**
 * Genesis 6.0 - Episodic Memory Store
 *
 * Stores autobiographical memories - events with context.
 * "What happened, when, where, who was involved"
 *
 * Key features:
 * - Temporal ordering and sequencing
 * - Context binding (where, who)
 * - Emotional coloring
 * - Forgetting curve integration
 *
 * Reference: Tulving, E. (1972). Episodic and semantic memory.
 */

import { randomUUID } from 'crypto';
import {
  EpisodicMemory,
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

export interface EpisodicStoreConfig {
  maxSize: number;
  autoForget: boolean;
  forgetThreshold: number;
  defaultStability: number;
}

export interface CreateEpisodicOptions {
  what: string;
  details?: any;
  when?: Date;
  duration?: number;
  where?: { location: string; context: string };
  who?: { agents: string[]; roles?: Record<string, string> };
  feeling?: { valence: number; arousal: number; label?: string };
  importance?: number;
  tags?: string[];
  associations?: string[];
  source?: string;
}

// ============================================================================
// Episodic Store
// ============================================================================

export class EpisodicStore implements IMemoryStore<EpisodicMemory> {
  private memories: Map<string, EpisodicMemory> = new Map();
  private config: EpisodicStoreConfig;

  // Indexes for efficient querying
  private byTime: EpisodicMemory[] = [];         // Sorted by when.timestamp
  private byLocation: Map<string, Set<string>> = new Map();
  private byAgent: Map<string, Set<string>> = new Map();
  private byTag: Map<string, Set<string>> = new Map();

  constructor(config: Partial<EpisodicStoreConfig> = {}) {
    this.config = {
      maxSize: 10000,
      autoForget: true,
      forgetThreshold: FORGETTING_THRESHOLDS.FORGET,
      defaultStability: FORGETTING_THRESHOLDS.DEFAULT_STABILITY,
      ...config,
    };
  }

  // ============================================================================
  // Store
  // ============================================================================

  store(
    input: Omit<EpisodicMemory, 'id' | 'created' | 'lastAccessed' | 'accessCount'>
  ): EpisodicMemory {
    const now = new Date();
    const id = randomUUID();

    const memory: EpisodicMemory = {
      ...input,
      id,
      created: now,
      lastAccessed: now,
      accessCount: 1,
    };

    this.memories.set(id, memory);
    this.updateIndexes(memory);
    this.maintainSize();

    return memory;
  }

  /**
   * Convenience method to create an episodic memory from options
   */
  createEpisode(options: CreateEpisodicOptions): EpisodicMemory {
    const now = new Date();
    const params = calculateInitialParams({
      importance: options.importance,
      emotionalValence: options.feeling?.valence,
    });

    return this.store({
      type: 'episodic',
      content: {
        what: options.what,
        details: options.details || {},
      },
      when: {
        timestamp: options.when || now,
        duration: options.duration,
      },
      where: options.where,
      who: options.who ? {
        agents: options.who.agents,
        roles: options.who.roles || {},
      } : undefined,
      feeling: options.feeling,
      R0: params.R0,
      S: params.S,
      importance: options.importance || 0.5,
      emotionalValence: options.feeling?.valence || 0,
      associations: options.associations || [],
      tags: options.tags || [],
      consolidated: false,
      source: options.source,
    });
  }

  // ============================================================================
  // Get / Update / Delete
  // ============================================================================

  get(id: string): EpisodicMemory | undefined {
    const memory = this.memories.get(id);
    if (memory) {
      this.accessMemory(memory);
    }
    return memory;
  }

  /**
   * Get without updating access (for internal use)
   */
  peek(id: string): EpisodicMemory | undefined {
    return this.memories.get(id);
  }

  update(id: string, updates: Partial<EpisodicMemory>): EpisodicMemory | undefined {
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

  query(filter: MemoryFilter<EpisodicMemory>): EpisodicMemory[] {
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

    if (filter.consolidated !== undefined) {
      results = results.filter((m) => m.consolidated === filter.consolidated);
    }

    if (filter.custom) {
      results = results.filter(filter.custom);
    }

    return results;
  }

  /**
   * Search by keyword in content
   */
  search(queryStr: string, limit: number = 10): EpisodicMemory[] {
    const keywords = queryStr.toLowerCase().split(/\s+/);

    const results = this.getAll().filter((m) => {
      const contentStr = JSON.stringify(m.content).toLowerCase();
      return keywords.some((k) => contentStr.includes(k));
    });

    // Sort by retention (strongest first)
    results.sort((a, b) => {
      const retA = calculateRetention({ R0: a.R0, S: a.S }, a.lastAccessed.getTime());
      const retB = calculateRetention({ R0: b.R0, S: b.S }, b.lastAccessed.getTime());
      return retB - retA;
    });

    return results.slice(0, limit);
  }

  // ============================================================================
  // Time-based Queries
  // ============================================================================

  /**
   * Get episodes in a time range
   */
  getByTimeRange(start: Date, end: Date): EpisodicMemory[] {
    return this.byTime.filter(
      (m) => m.when.timestamp >= start && m.when.timestamp <= end
    );
  }

  /**
   * Get recent episodes
   */
  getRecent(limit: number = 10): EpisodicMemory[] {
    return this.byTime.slice(-limit).reverse();
  }

  /**
   * Get episodes from today
   */
  getToday(): EpisodicMemory[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.getByTimeRange(today, tomorrow);
  }

  /**
   * Get episodes involving a specific agent
   */
  getByAgent(agentId: string): EpisodicMemory[] {
    const ids = this.byAgent.get(agentId);
    if (!ids) return [];

    return Array.from(ids)
      .map((id) => this.memories.get(id))
      .filter((m): m is EpisodicMemory => m !== undefined);
  }

  /**
   * Get episodes at a location
   */
  getByLocation(location: string): EpisodicMemory[] {
    const ids = this.byLocation.get(location);
    if (!ids) return [];

    return Array.from(ids)
      .map((id) => this.memories.get(id))
      .filter((m): m is EpisodicMemory => m !== undefined);
  }

  // ============================================================================
  // Bulk Operations
  // ============================================================================

  getAll(): EpisodicMemory[] {
    return Array.from(this.memories.values());
  }

  clear(): void {
    this.memories.clear();
    this.byTime = [];
    this.byLocation.clear();
    this.byAgent.clear();
    this.byTag.clear();
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
        episodic: all.length,
        semantic: 0,
        procedural: 0,
      },
      consolidated,
      avgRetention: all.length > 0 ? totalRetention / all.length : 0,
      avgImportance: all.length > 0 ? totalImportance / all.length : 0,
      oldestMemory: oldest,
      newestMemory: newest,
    };
  }

  // ============================================================================
  // Forgetting Integration
  // ============================================================================

  /**
   * Get episodes that should be forgotten
   */
  getForgotten(): EpisodicMemory[] {
    return this.getAll().filter((m) => shouldForget(m, this.config.forgetThreshold));
  }

  /**
   * Get episodes ready for consolidation (strong retention, not yet consolidated)
   */
  getReadyForConsolidation(threshold: number = 0.7): EpisodicMemory[] {
    return this.getAll().filter((m) => {
      if (m.consolidated) return false;
      const retention = calculateRetention(
        { R0: m.R0, S: m.S },
        m.lastAccessed.getTime()
      );
      return retention >= threshold;
    });
  }

  /**
   * Run forgetting cycle - remove memories below threshold
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

  private accessMemory(memory: EpisodicMemory): void {
    memory.lastAccessed = new Date();
    memory.accessCount++;
    memory.S = updateStabilityOnRecall(memory, true);
  }

  private updateIndexes(memory: EpisodicMemory): void {
    // Time index
    this.byTime.push(memory);
    this.byTime.sort((a, b) => a.when.timestamp.getTime() - b.when.timestamp.getTime());

    // Location index
    if (memory.where) {
      if (!this.byLocation.has(memory.where.location)) {
        this.byLocation.set(memory.where.location, new Set());
      }
      this.byLocation.get(memory.where.location)!.add(memory.id);
    }

    // Agent index
    if (memory.who) {
      for (const agent of memory.who.agents) {
        if (!this.byAgent.has(agent)) {
          this.byAgent.set(agent, new Set());
        }
        this.byAgent.get(agent)!.add(memory.id);
      }
    }

    // Tag index
    for (const tag of memory.tags) {
      if (!this.byTag.has(tag)) {
        this.byTag.set(tag, new Set());
      }
      this.byTag.get(tag)!.add(memory.id);
    }
  }

  private removeFromIndexes(memory: EpisodicMemory): void {
    // Time index
    const timeIndex = this.byTime.findIndex((m) => m.id === memory.id);
    if (timeIndex !== -1) {
      this.byTime.splice(timeIndex, 1);
    }

    // Location index
    if (memory.where) {
      this.byLocation.get(memory.where.location)?.delete(memory.id);
    }

    // Agent index
    if (memory.who) {
      for (const agent of memory.who.agents) {
        this.byAgent.get(agent)?.delete(memory.id);
      }
    }

    // Tag index
    for (const tag of memory.tags) {
      this.byTag.get(tag)?.delete(memory.id);
    }
  }

  private maintainSize(): void {
    if (!this.config.autoForget) return;
    if (this.memories.size <= this.config.maxSize) return;

    // First, forget memories below threshold
    this.runForgetting();

    // If still over limit, remove weakest memories
    while (this.memories.size > this.config.maxSize) {
      let weakest: EpisodicMemory | null = null;
      let weakestRetention = Infinity;

      for (const memory of this.memories.values()) {
        const retention = calculateRetention(
          { R0: memory.R0, S: memory.S },
          memory.lastAccessed.getTime()
        );
        if (retention < weakestRetention) {
          weakestRetention = retention;
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

export function createEpisodicStore(config?: Partial<EpisodicStoreConfig>): EpisodicStore {
  return new EpisodicStore(config);
}
