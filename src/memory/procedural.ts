/**
 * Genesis 6.0 - Procedural Memory Store
 *
 * Stores skills and workflows - know-how.
 * "How to do things"
 *
 * Key features:
 * - Step-by-step procedures
 * - Success rate tracking
 * - Skill improvement over time
 * - Prerequisites and dependencies
 *
 * Reference: Anderson, J. R. (1982). Acquisition of cognitive skill.
 */

import { randomUUID } from 'crypto';
import {
  ProceduralMemory,
  ProceduralStep,
  ParameterDef,
  IMemoryStore,
  MemoryFilter,
  StoreStats,
} from './types.js';
import {
  calculateRetention,
  calculateInitialParams,
  updateStabilityOnRecall,
  FORGETTING_THRESHOLDS,
} from './forgetting.js';

// ============================================================================
// Types
// ============================================================================

export interface ProceduralStoreConfig {
  maxSize: number;
  autoForget: boolean;
  forgetThreshold: number;
  minSuccessRate: number;
}

export interface CreateProceduralOptions {
  name: string;
  description: string;
  steps: Array<{
    action: string;
    params?: Record<string, any>;
    condition?: string;
    fallback?: string;
  }>;
  requires?: string[];
  inputs?: ParameterDef[];
  outputs?: ParameterDef[];
  importance?: number;
  tags?: string[];
  associations?: string[];
  source?: string;
}

export interface ExecutionResult {
  success: boolean;
  duration: number;
  stepResults?: Array<{
    step: number;
    success: boolean;
    error?: string;
  }>;
  error?: string;
}

// ============================================================================
// Procedural Store
// ============================================================================

export class ProceduralStore implements IMemoryStore<ProceduralMemory> {
  private memories: Map<string, ProceduralMemory> = new Map();
  private config: ProceduralStoreConfig;

  // Indexes
  private byName: Map<string, string> = new Map();           // name -> id
  private byTag: Map<string, Set<string>> = new Map();
  private dependencies: Map<string, Set<string>> = new Map(); // skill -> skills that require it

  constructor(config: Partial<ProceduralStoreConfig> = {}) {
    this.config = {
      maxSize: 5000,
      autoForget: true,
      forgetThreshold: FORGETTING_THRESHOLDS.FORGET,
      minSuccessRate: 0.2,
      ...config,
    };
  }

  // ============================================================================
  // Store
  // ============================================================================

  store(
    input: Omit<ProceduralMemory, 'id' | 'created' | 'lastAccessed' | 'accessCount'>
  ): ProceduralMemory {
    const now = new Date();
    const id = randomUUID();

    const memory: ProceduralMemory = {
      ...input,
      id,
      created: now,
      lastAccessed: now,
      accessCount: 1,
    };

    // Check for existing skill
    const existingId = this.byName.get(memory.content.name.toLowerCase());
    if (existingId) {
      // Update existing skill
      return this.improveSkill(existingId, memory);
    }

    this.memories.set(id, memory);
    this.updateIndexes(memory);
    this.maintainSize();

    return memory;
  }

  /**
   * Convenience method to create a procedural memory from options
   */
  createSkill(options: CreateProceduralOptions): ProceduralMemory {
    const now = new Date();
    const params = calculateInitialParams({
      importance: options.importance,
      complexity: Math.min(1, options.steps.length / 10), // More steps = more complex
    });

    // Skills have higher base stability (muscle memory)
    params.S = 7; // 1 week base stability

    const steps: ProceduralStep[] = options.steps.map((s, i) => ({
      order: i + 1,
      action: s.action,
      params: s.params,
      condition: s.condition,
      fallback: s.fallback,
    }));

    return this.store({
      type: 'procedural',
      content: {
        name: options.name,
        description: options.description,
        steps,
      },
      requires: options.requires || [],
      inputs: options.inputs || [],
      outputs: options.outputs || [],
      successRate: 0.5, // Initial neutral rate
      avgDuration: 0,
      executionCount: 0,
      version: 1,
      improvements: [],
      R0: params.R0,
      S: params.S,
      importance: options.importance || 0.5,
      emotionalValence: 0,
      associations: options.associations || [],
      tags: options.tags || [],
      consolidated: true, // Procedural memories are already consolidated
      source: options.source,
    });
  }

  /**
   * Improve an existing skill with new information
   */
  private improveSkill(existingId: string, newMemory: ProceduralMemory): ProceduralMemory {
    const existing = this.memories.get(existingId);
    if (!existing) {
      return newMemory;
    }

    // Compare steps and merge improvements
    if (newMemory.content.steps.length !== existing.content.steps.length) {
      // Steps changed - this is a new version
      existing.version++;
      existing.improvements.push(
        `v${existing.version}: Steps updated from ${existing.content.steps.length} to ${newMemory.content.steps.length}`
      );
      existing.content.steps = newMemory.content.steps;
    }

    // Merge prerequisites
    existing.requires = [...new Set([...existing.requires, ...newMemory.requires])];

    // Update description if better
    if (newMemory.content.description.length > existing.content.description.length) {
      existing.content.description = newMemory.content.description;
    }

    // Strengthen memory
    existing.S = updateStabilityOnRecall(existing, true);
    existing.lastAccessed = new Date();

    return existing;
  }

  // ============================================================================
  // Get / Update / Delete
  // ============================================================================

  get(id: string): ProceduralMemory | undefined {
    const memory = this.memories.get(id);
    if (memory) {
      this.accessMemory(memory);
    }
    return memory;
  }

  /**
   * Get by skill name
   */
  getByName(name: string): ProceduralMemory | undefined {
    const id = this.byName.get(name.toLowerCase());
    if (id) {
      return this.get(id);
    }
    return undefined;
  }

  /**
   * Get without updating access (for internal use)
   */
  peek(id: string): ProceduralMemory | undefined {
    return this.memories.get(id);
  }

  update(id: string, updates: Partial<ProceduralMemory>): ProceduralMemory | undefined {
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

  query(filter: MemoryFilter<ProceduralMemory>): ProceduralMemory[] {
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
   * Search by keyword in name and description
   */
  search(queryStr: string, limit: number = 10): ProceduralMemory[] {
    const keywords = queryStr.toLowerCase().split(/\s+/);

    const results = this.getAll().filter((m) => {
      const searchable = [
        m.content.name,
        m.content.description,
        ...m.tags,
      ].join(' ').toLowerCase();
      return keywords.some((k) => searchable.includes(k));
    });

    // Sort by success rate * retention
    results.sort((a, b) => {
      const scoreA = a.successRate * calculateRetention(
        { R0: a.R0, S: a.S },
        a.lastAccessed.getTime()
      );
      const scoreB = b.successRate * calculateRetention(
        { R0: b.R0, S: b.S },
        b.lastAccessed.getTime()
      );
      return scoreB - scoreA;
    });

    return results.slice(0, limit);
  }

  // ============================================================================
  // Execution Tracking
  // ============================================================================

  /**
   * Record execution of a skill
   */
  recordExecution(id: string, result: ExecutionResult): void {
    const memory = this.memories.get(id);
    if (!memory) return;

    memory.executionCount++;

    // Update success rate (exponential moving average)
    const alpha = 0.2;
    memory.successRate = alpha * (result.success ? 1 : 0) + (1 - alpha) * memory.successRate;

    // Update average duration
    if (result.duration > 0) {
      if (memory.avgDuration === 0) {
        memory.avgDuration = result.duration;
      } else {
        memory.avgDuration = alpha * result.duration + (1 - alpha) * memory.avgDuration;
      }
    }

    // Update stability based on success
    memory.S = updateStabilityOnRecall(memory, result.success);
    memory.lastAccessed = new Date();

    // Track improvements
    if (result.success && memory.successRate > 0.8 && !memory.improvements.includes('Mastered')) {
      memory.improvements.push('Mastered');
    }
  }

  /**
   * Get skills that need practice (low success rate or retention)
   */
  getSkillsNeedingPractice(): ProceduralMemory[] {
    return this.getAll().filter((m) => {
      const retention = calculateRetention(
        { R0: m.R0, S: m.S },
        m.lastAccessed.getTime()
      );
      return (m.successRate < 0.7 || retention < 0.5) &&
             retention >= FORGETTING_THRESHOLDS.FORGET;
    });
  }

  /**
   * Get mastered skills (high success rate and retention)
   */
  getMasteredSkills(): ProceduralMemory[] {
    return this.getAll().filter((m) => {
      const retention = calculateRetention(
        { R0: m.R0, S: m.S },
        m.lastAccessed.getTime()
      );
      return m.successRate >= 0.9 && retention >= 0.8;
    });
  }

  // ============================================================================
  // Dependency Queries
  // ============================================================================

  /**
   * Get prerequisites for a skill
   */
  getPrerequisites(id: string): ProceduralMemory[] {
    const memory = this.memories.get(id);
    if (!memory) return [];

    return memory.requires
      .map((name) => this.getByName(name))
      .filter((m): m is ProceduralMemory => m !== undefined);
  }

  /**
   * Get skills that depend on this skill
   */
  getDependents(id: string): ProceduralMemory[] {
    const memory = this.memories.get(id);
    if (!memory) return [];

    const dependentIds = this.dependencies.get(memory.content.name.toLowerCase());
    if (!dependentIds) return [];

    return Array.from(dependentIds)
      .map((depId) => this.memories.get(depId))
      .filter((m): m is ProceduralMemory => m !== undefined);
  }

  /**
   * Check if all prerequisites are met for a skill
   */
  canExecute(id: string, minSuccessRate: number = 0.5): boolean {
    const prerequisites = this.getPrerequisites(id);
    return prerequisites.every((p) => p.successRate >= minSuccessRate);
  }

  // ============================================================================
  // Bulk Operations
  // ============================================================================

  getAll(): ProceduralMemory[] {
    return Array.from(this.memories.values());
  }

  clear(): void {
    this.memories.clear();
    this.byName.clear();
    this.byTag.clear();
    this.dependencies.clear();
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
        semantic: 0,
        procedural: all.length,
      },
      consolidated,
      avgRetention: all.length > 0 ? totalRetention / all.length : 0,
      avgImportance: all.length > 0 ? totalImportance / all.length : 0,
      oldestMemory: oldest,
      newestMemory: newest,
    };
  }

  /**
   * Get additional procedural-specific stats
   */
  proceduralStats(): {
    totalSkills: number;
    mastered: number;
    needsPractice: number;
    avgSuccessRate: number;
    avgExecutions: number;
    mostUsed: ProceduralMemory[];
  } {
    const all = this.getAll();
    let totalSuccessRate = 0;
    let totalExecutions = 0;

    for (const m of all) {
      totalSuccessRate += m.successRate;
      totalExecutions += m.executionCount;
    }

    const mastered = this.getMasteredSkills().length;
    const needsPractice = this.getSkillsNeedingPractice().length;

    const mostUsed = [...all]
      .sort((a, b) => b.executionCount - a.executionCount)
      .slice(0, 10);

    return {
      totalSkills: all.length,
      mastered,
      needsPractice,
      avgSuccessRate: all.length > 0 ? totalSuccessRate / all.length : 0,
      avgExecutions: all.length > 0 ? totalExecutions / all.length : 0,
      mostUsed,
    };
  }

  // ============================================================================
  // Forgetting Integration
  // ============================================================================

  /**
   * Get skills that should be forgotten (low retention AND low success)
   */
  getForgotten(): ProceduralMemory[] {
    return this.getAll().filter((m) => {
      const retention = calculateRetention(
        { R0: m.R0, S: m.S },
        m.lastAccessed.getTime()
      );
      return retention < this.config.forgetThreshold &&
             m.successRate < this.config.minSuccessRate;
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

  private accessMemory(memory: ProceduralMemory): void {
    memory.lastAccessed = new Date();
    memory.accessCount++;
    memory.S = updateStabilityOnRecall(memory, true);
  }

  private updateIndexes(memory: ProceduralMemory): void {
    // Name index
    this.byName.set(memory.content.name.toLowerCase(), memory.id);

    // Tag index
    for (const tag of memory.tags) {
      if (!this.byTag.has(tag)) {
        this.byTag.set(tag, new Set());
      }
      this.byTag.get(tag)!.add(memory.id);
    }

    // Dependency index
    for (const req of memory.requires) {
      const reqLower = req.toLowerCase();
      if (!this.dependencies.has(reqLower)) {
        this.dependencies.set(reqLower, new Set());
      }
      this.dependencies.get(reqLower)!.add(memory.id);
    }
  }

  private removeFromIndexes(memory: ProceduralMemory): void {
    this.byName.delete(memory.content.name.toLowerCase());

    for (const tag of memory.tags) {
      this.byTag.get(tag)?.delete(memory.id);
    }

    for (const req of memory.requires) {
      this.dependencies.get(req.toLowerCase())?.delete(memory.id);
    }
  }

  private maintainSize(): void {
    if (!this.config.autoForget) return;
    if (this.memories.size <= this.config.maxSize) return;

    // First, forget low-performance skills
    this.runForgetting();

    // If still over limit, remove lowest scoring skills
    while (this.memories.size > this.config.maxSize) {
      let weakest: ProceduralMemory | null = null;
      let weakestScore = Infinity;

      for (const memory of this.memories.values()) {
        const retention = calculateRetention(
          { R0: memory.R0, S: memory.S },
          memory.lastAccessed.getTime()
        );
        const score = memory.successRate * retention;
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

export function createProceduralStore(config?: Partial<ProceduralStoreConfig>): ProceduralStore {
  return new ProceduralStore(config);
}
