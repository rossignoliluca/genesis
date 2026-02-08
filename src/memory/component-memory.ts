/**
 * Component Memory Manager
 *
 * Personalized memory for each Genesis component with:
 * - Component-specific FSRS scheduling
 * - Custom retention curves
 * - Tailored consolidation strategies
 * - Priority-based working memory
 * - Adaptive capacity allocation
 *
 * @module memory/component-memory
 * @version 18.3.0
 */

import {
  type ComponentId,
  type ComponentMemoryProfile,
  getComponentProfile,
  COMPONENT_PROFILES,
} from './component-profiles.js';
import { FSRS, createComponentFSRS, type FSRSCard, type Rating } from './fsrs.js';
import type {
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
  MemoryPriority,
} from './types.js';

// =============================================================================
// Types
// =============================================================================

export interface ComponentMemoryItem {
  /** Memory ID */
  id: string;
  /** Component that owns this memory */
  componentId: ComponentId;
  /** Memory type */
  type: 'episodic' | 'semantic' | 'procedural';
  /** The actual memory content */
  memory: EpisodicMemory | SemanticMemory | ProceduralMemory;
  /** FSRS card for scheduling */
  card: FSRSCard;
  /** Tags including component base tags */
  tags: string[];
  /** Creation timestamp */
  createdAt: Date;
  /** Last access timestamp */
  lastAccessed: Date;
  /** Access count */
  accessCount: number;
}

export interface ComponentMemoryStats {
  componentId: ComponentId;
  episodicCount: number;
  semanticCount: number;
  proceduralCount: number;
  avgRetention: number;
  avgDifficulty: number;
  dueForReview: number;
  workingMemoryUsage: number;
  capacityUsage: {
    episodic: number;
    semantic: number;
    procedural: number;
  };
}

export interface WorkingMemorySlot {
  item: ComponentMemoryItem;
  activation: number;
  enteredAt: Date;
  source: 'retrieval' | 'anticipation' | 'consolidation';
}

// =============================================================================
// Component Memory Manager
// =============================================================================

export class ComponentMemoryManager {
  private profile: ComponentMemoryProfile;
  private fsrs: FSRS;
  private memories: Map<string, ComponentMemoryItem> = new Map();
  private workingMemory: WorkingMemorySlot[] = [];
  private decayTimer: ReturnType<typeof setInterval> | null = null;

  constructor(componentId: ComponentId) {
    this.profile = getComponentProfile(componentId);
    this.fsrs = createComponentFSRS(this.profile.fsrs);
  }

  // ---------------------------------------------------------------------------
  // Memory Storage
  // ---------------------------------------------------------------------------

  /**
   * Store an episodic memory
   */
  storeEpisodic(memory: EpisodicMemory): ComponentMemoryItem {
    return this.store(memory, 'episodic');
  }

  /**
   * Store a semantic memory
   */
  storeSemantic(memory: SemanticMemory): ComponentMemoryItem {
    return this.store(memory, 'semantic');
  }

  /**
   * Store a procedural memory
   */
  storeProcedural(memory: ProceduralMemory): ComponentMemoryItem {
    return this.store(memory, 'procedural');
  }

  private store(
    memory: EpisodicMemory | SemanticMemory | ProceduralMemory,
    type: 'episodic' | 'semantic' | 'procedural'
  ): ComponentMemoryItem {
    const id = memory.id;
    const now = new Date();

    // Create FSRS card with component-specific initial stability
    const card = this.fsrs.createCard(id, now);
    card.stability = this.calculateInitialStability(memory);
    card.difficulty = this.calculateInitialDifficulty(memory);

    // Build tags
    const memoryTags = 'tags' in memory ? memory.tags : [];
    const tags = [...this.profile.baseTags, ...memoryTags];

    const item: ComponentMemoryItem = {
      id,
      componentId: this.profile.componentId,
      type,
      memory,
      card,
      tags,
      createdAt: now,
      lastAccessed: now,
      accessCount: 0,
    };

    // Check capacity
    this.ensureCapacity(type);

    this.memories.set(id, item);

    // Add to working memory if novel
    if (this.isNovel(memory)) {
      this.addToWorkingMemory(item, 'retrieval');
    }

    return item;
  }

  private calculateInitialStability(memory: EpisodicMemory | SemanticMemory | ProceduralMemory): number {
    const ret = this.profile.retention;
    let stability = ret.baseStability;

    // Apply importance weight
    const importance = memory.importance ?? 0.5;
    stability *= 1 + (importance - 0.5) * ret.importanceWeight;

    // Apply emotional weight (for episodic)
    if ('feeling' in memory && memory.feeling) {
      const emotionalIntensity = Math.abs(memory.feeling.valence ?? 0);
      stability *= 1 + emotionalIntensity * ret.emotionalWeight;
    }

    // Apply novelty boost
    if (this.isNovel(memory)) {
      stability *= ret.noveltyBoost;
    }

    return Math.max(ret.minStability, Math.min(stability, ret.maxStability));
  }

  private calculateInitialDifficulty(memory: EpisodicMemory | SemanticMemory | ProceduralMemory): number {
    // Lower difficulty for simpler concepts
    const complexity = this.estimateComplexity(memory);
    return 3 + complexity * 4; // Scale to 3-7
  }

  private estimateComplexity(memory: EpisodicMemory | SemanticMemory | ProceduralMemory): number {
    // Estimate based on content size and structure
    const content = JSON.stringify(memory);
    const length = content.length;

    if (length < 200) return 0.2;
    if (length < 500) return 0.4;
    if (length < 1000) return 0.6;
    if (length < 2000) return 0.8;
    return 1.0;
  }

  private isNovel(memory: EpisodicMemory | SemanticMemory | ProceduralMemory): boolean {
    // Check if similar memory exists
    for (const existing of this.memories.values()) {
      if (existing.type === 'semantic' && 'content' in memory && 'content' in existing.memory) {
        // Compare concepts
        const existingContent = existing.memory as SemanticMemory;
        const newContent = memory as SemanticMemory;
        if (existingContent.content.concept === newContent.content.concept) {
          return false;
        }
      }
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Memory Retrieval
  // ---------------------------------------------------------------------------

  /**
   * Recall memory and update FSRS card
   */
  recall(id: string, rating: Rating = 'good'): ComponentMemoryItem | null {
    const item = this.memories.get(id);
    if (!item) return null;

    // Update FSRS
    const result = this.fsrs.review(item.card, rating);
    item.card = result.card;
    item.lastAccessed = new Date();
    item.accessCount++;

    // Add to working memory
    this.addToWorkingMemory(item, 'retrieval');

    return item;
  }

  /**
   * Search memories by query
   */
  search(query: string, options: {
    type?: 'episodic' | 'semantic' | 'procedural';
    limit?: number;
    minRetention?: number;
    tags?: string[];
  } = {}): ComponentMemoryItem[] {
    const { type, limit = this.profile.retrieval.defaultLimit, minRetention = 0.3, tags } = options;
    const queryLower = query.toLowerCase();
    const results: Array<{ item: ComponentMemoryItem; score: number }> = [];

    for (const item of this.memories.values()) {
      // Filter by type
      if (type && item.type !== type) continue;

      // Filter by tags
      if (tags && !tags.every(t => item.tags.includes(t))) continue;

      // Calculate retention
      const retention = this.fsrs.calculateRetention(
        this.daysBetween(item.card.lastReview || item.createdAt, new Date()),
        item.card.stability
      );
      if (retention < minRetention) continue;

      // Calculate relevance score
      const relevance = this.calculateRelevance(item, queryLower);
      if (relevance <= 0) continue;

      // Apply channel weights
      const weights = this.profile.retrieval.channelWeights;
      const score = relevance * weights.vector + retention * weights.keyword;

      // Apply recency bias
      const recency = this.profile.retrieval.recencyBias;
      const daysSinceAccess = this.daysBetween(item.lastAccessed, new Date());
      const recencyBoost = 1 - recency * Math.min(1, daysSinceAccess / 30);

      results.push({ item, score: score * recencyBoost });
    }

    // Sort by score
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit).map(r => r.item);
  }

  private calculateRelevance(item: ComponentMemoryItem, query: string): number {
    const content = JSON.stringify(item.memory).toLowerCase();
    const tags = item.tags.join(' ').toLowerCase();

    // Simple keyword matching (would use embeddings in production)
    const words = query.split(/\s+/);
    let matches = 0;

    for (const word of words) {
      if (content.includes(word)) matches++;
      if (tags.includes(word)) matches += 0.5;
    }

    return matches / words.length;
  }

  /**
   * Get memories related to a given memory
   */
  getRelated(id: string, limit?: number): ComponentMemoryItem[] {
    const item = this.memories.get(id);
    if (!item) return [];

    const maxHops = this.profile.retrieval.maxGraphHops;
    const results: ComponentMemoryItem[] = [];
    const visited = new Set<string>([id]);

    // BFS for related memories
    let frontier = [item];
    for (let hop = 0; hop < maxHops && frontier.length > 0; hop++) {
      const next: ComponentMemoryItem[] = [];

      for (const current of frontier) {
        // Find memories with overlapping tags
        for (const candidate of this.memories.values()) {
          if (visited.has(candidate.id)) continue;

          const overlap = current.tags.filter(t => candidate.tags.includes(t)).length;
          if (overlap > 0) {
            results.push(candidate);
            next.push(candidate);
            visited.add(candidate.id);
          }
        }
      }

      frontier = next;
    }

    return results.slice(0, limit || this.profile.retrieval.defaultLimit);
  }

  // ---------------------------------------------------------------------------
  // Working Memory
  // ---------------------------------------------------------------------------

  /**
   * Add item to working memory
   */
  addToWorkingMemory(item: ComponentMemoryItem, source: WorkingMemorySlot['source']): void {
    const capacity = this.profile.capacity.workingMemory;

    // Check if already in working memory
    const existingIdx = this.workingMemory.findIndex(s => s.item.id === item.id);
    if (existingIdx >= 0) {
      // Boost activation
      this.workingMemory[existingIdx].activation = Math.min(1, this.workingMemory[existingIdx].activation + 0.3);
      return;
    }

    // Add new slot
    const slot: WorkingMemorySlot = {
      item,
      activation: 0.8,
      enteredAt: new Date(),
      source,
    };

    // Evict if at capacity
    while (this.workingMemory.length >= capacity) {
      this.evictFromWorkingMemory();
    }

    this.workingMemory.push(slot);
  }

  /**
   * Get current working memory contents
   */
  getWorkingMemory(): WorkingMemorySlot[] {
    return [...this.workingMemory].sort((a, b) => b.activation - a.activation);
  }

  /**
   * Start working memory decay timer
   */
  startDecay(intervalMs = 1000): void {
    if (this.decayTimer) return;

    const baseDecayRate = 0.005;
    // Adjust decay based on importance
    this.decayTimer = setInterval(() => {
      for (const slot of this.workingMemory) {
        const importance = slot.item.memory.importance ?? 0.5;
        const decayRate = baseDecayRate * (1 - importance * 0.5); // Higher importance = slower decay
        slot.activation -= decayRate;
      }

      // Evict items with zero activation
      this.workingMemory = this.workingMemory.filter(s => s.activation > 0);
    }, intervalMs);
  }

  /**
   * Stop working memory decay
   */
  stopDecay(): void {
    if (this.decayTimer) {
      clearInterval(this.decayTimer);
      this.decayTimer = null;
    }
  }

  private evictFromWorkingMemory(): void {
    if (this.workingMemory.length === 0) return;

    // Find lowest activation
    let minIdx = 0;
    let minActivation = this.workingMemory[0].activation;

    for (let i = 1; i < this.workingMemory.length; i++) {
      if (this.workingMemory[i].activation < minActivation) {
        minActivation = this.workingMemory[i].activation;
        minIdx = i;
      }
    }

    this.workingMemory.splice(minIdx, 1);
  }

  // ---------------------------------------------------------------------------
  // Capacity Management
  // ---------------------------------------------------------------------------

  private ensureCapacity(type: 'episodic' | 'semantic' | 'procedural'): void {
    const capacity = this.profile.capacity[type];
    const items = Array.from(this.memories.values()).filter(m => m.type === type);

    if (items.length < capacity) return;

    // Sort by retention (lowest first)
    items.sort((a, b) => {
      const retA = this.fsrs.calculateRetention(
        this.daysBetween(a.card.lastReview || a.createdAt, new Date()),
        a.card.stability
      );
      const retB = this.fsrs.calculateRetention(
        this.daysBetween(b.card.lastReview || b.createdAt, new Date()),
        b.card.stability
      );
      return retA - retB;
    });

    // Remove 10% of lowest retention items
    const toRemove = Math.ceil(capacity * 0.1);
    for (let i = 0; i < toRemove && i < items.length; i++) {
      this.memories.delete(items[i].id);
    }
  }

  // ---------------------------------------------------------------------------
  // Consolidation
  // ---------------------------------------------------------------------------

  /**
   * Get memories ready for consolidation
   */
  getConsolidationCandidates(): ComponentMemoryItem[] {
    const strategy = this.profile.consolidation;
    const now = new Date();
    const candidates: ComponentMemoryItem[] = [];

    for (const item of this.memories.values()) {
      if (item.type !== 'episodic') continue;

      const age = this.daysBetween(item.createdAt, now);
      const retention = this.fsrs.calculateRetention(
        this.daysBetween(item.card.lastReview || item.createdAt, now),
        item.card.stability
      );

      // Check thresholds
      if (retention >= strategy.retentionThreshold || age >= strategy.maxAge) {
        candidates.push(item);
      }
    }

    // Sort by priority strategy
    return this.sortByPriority(candidates, strategy.priorityStrategy);
  }

  private sortByPriority(
    items: ComponentMemoryItem[],
    strategy: 'importance' | 'recency' | 'novelty' | 'emotional' | 'balanced'
  ): ComponentMemoryItem[] {
    return items.sort((a, b) => {
      const scoreA = this.calculatePriorityScore(a, strategy);
      const scoreB = this.calculatePriorityScore(b, strategy);
      return scoreB - scoreA;
    });
  }

  private calculatePriorityScore(
    item: ComponentMemoryItem,
    strategy: 'importance' | 'recency' | 'novelty' | 'emotional' | 'balanced'
  ): number {
    const importance = item.memory.importance ?? 0.5;
    const recency = 1 / (1 + this.daysBetween(item.lastAccessed, new Date()));
    const novelty = item.accessCount === 0 ? 1 : 1 / item.accessCount;

    let emotional = 0;
    if ('feeling' in item.memory && item.memory.feeling) {
      emotional = Math.abs(item.memory.feeling.valence ?? 0);
    }

    switch (strategy) {
      case 'importance': return importance;
      case 'recency': return recency;
      case 'novelty': return novelty;
      case 'emotional': return emotional;
      case 'balanced':
      default:
        return importance * 0.3 + recency * 0.25 + novelty * 0.25 + emotional * 0.2;
    }
  }

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  /**
   * Get memory statistics for this component
   */
  getStats(): ComponentMemoryStats {
    const now = new Date();
    let episodicCount = 0;
    let semanticCount = 0;
    let proceduralCount = 0;
    let totalRetention = 0;
    let totalDifficulty = 0;
    let dueForReview = 0;

    for (const item of this.memories.values()) {
      switch (item.type) {
        case 'episodic': episodicCount++; break;
        case 'semantic': semanticCount++; break;
        case 'procedural': proceduralCount++; break;
      }

      totalDifficulty += item.card.difficulty;
      totalRetention += this.fsrs.calculateRetention(
        this.daysBetween(item.card.lastReview || item.createdAt, now),
        item.card.stability
      );

      if (item.card.due <= now) {
        dueForReview++;
      }
    }

    const total = this.memories.size || 1;

    return {
      componentId: this.profile.componentId,
      episodicCount,
      semanticCount,
      proceduralCount,
      avgRetention: totalRetention / total,
      avgDifficulty: totalDifficulty / total,
      dueForReview,
      workingMemoryUsage: this.workingMemory.length / this.profile.capacity.workingMemory,
      capacityUsage: {
        episodic: episodicCount / this.profile.capacity.episodic,
        semantic: semanticCount / this.profile.capacity.semantic,
        procedural: proceduralCount / this.profile.capacity.procedural,
      },
    };
  }

  /**
   * Get FSRS statistics
   */
  getFSRSStats(): ReturnType<FSRS['getStats']> {
    const cards = Array.from(this.memories.values()).map(m => m.card);
    return this.fsrs.getStats(cards);
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  private daysBetween(date1: Date, date2: Date): number {
    const ms = date2.getTime() - date1.getTime();
    return ms / (1000 * 60 * 60 * 24);
  }

  /**
   * Export all memories (for persistence)
   */
  export(): ComponentMemoryItem[] {
    return Array.from(this.memories.values());
  }

  /**
   * Import memories (for loading)
   */
  import(items: ComponentMemoryItem[]): void {
    for (const item of items) {
      this.memories.set(item.id, item);
    }
  }

  /**
   * Clear all memories
   */
  clear(): void {
    this.memories.clear();
    this.workingMemory = [];
  }
}

// =============================================================================
// Global Component Memory Registry
// =============================================================================

const componentManagers: Map<ComponentId, ComponentMemoryManager> = new Map();

/**
 * Get memory manager for a specific component
 */
export function getComponentMemory(componentId: ComponentId): ComponentMemoryManager {
  let manager = componentManagers.get(componentId);
  if (!manager) {
    manager = new ComponentMemoryManager(componentId);
    componentManagers.set(componentId, manager);
  }
  return manager;
}

/**
 * Get all component memory managers
 */
export function getAllComponentManagers(): Map<ComponentId, ComponentMemoryManager> {
  return componentManagers;
}

/**
 * Get aggregated statistics across all components
 */
export function getAggregatedStats(): {
  totalMemories: number;
  byComponent: Record<ComponentId, ComponentMemoryStats>;
  avgRetention: number;
  totalDueForReview: number;
  totalWorkingMemoryUsage: number;
} {
  const byComponent: Record<string, ComponentMemoryStats> = {};
  let totalMemories = 0;
  let totalRetention = 0;
  let totalDue = 0;
  let totalWMUsage = 0;
  let componentCount = 0;

  for (const [id, manager] of componentManagers) {
    const stats = manager.getStats();
    byComponent[id] = stats;
    totalMemories += stats.episodicCount + stats.semanticCount + stats.proceduralCount;
    totalRetention += stats.avgRetention;
    totalDue += stats.dueForReview;
    totalWMUsage += stats.workingMemoryUsage;
    componentCount++;
  }

  return {
    totalMemories,
    byComponent: byComponent as Record<ComponentId, ComponentMemoryStats>,
    avgRetention: componentCount > 0 ? totalRetention / componentCount : 0,
    totalDueForReview: totalDue,
    totalWorkingMemoryUsage: componentCount > 0 ? totalWMUsage / componentCount : 0,
  };
}

/**
 * Reset all component managers (for testing)
 */
export function resetAllComponentManagers(): void {
  for (const manager of componentManagers.values()) {
    manager.stopDecay();
  }
  componentManagers.clear();
}
