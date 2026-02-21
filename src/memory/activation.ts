/**
 * Genesis v35 — ACT-R Activation-Based Memory Retrieval
 *
 * Implements the ACT-R memory activation formula for prioritizing
 * memory recall. Items that are recent, frequently accessed, and
 * contextually relevant are retrieved first.
 *
 * Formula: A_i = B_i + sum(W_j * S_ji) + noise
 *
 * Where:
 *   B_i = base-level activation (log of weighted recency + frequency)
 *   W_j = attentional weight of context element j
 *   S_ji = associative strength between context j and memory i
 *   noise = logistic noise for stochastic retrieval
 *
 * References:
 * - Anderson, J.R. (1993). Rules of the Mind. Lawrence Erlbaum.
 * - Anderson, J.R. & Lebiere, C. (1998). The Atomic Components of Thought.
 * - Anderson, J.R. (2007). How Can the Human Mind Occur in the Physical Universe?
 */

// ============================================================================
// Types
// ============================================================================

/** A memory item with activation metadata */
export interface ActivatedMemory<T = unknown> {
  /** Unique identifier */
  id: string;
  /** The memory content */
  content: T;
  /** Timestamps of all accesses (most recent last) */
  accessHistory: number[];
  /** Total number of accesses */
  accessCount: number;
  /** Tags/categories for associative strength */
  tags: string[];
  /** Computed activation level */
  activation: number;
  /** Time of creation */
  createdAt: number;
}

/** Context element for spreading activation */
export interface ContextElement {
  /** Identifier (e.g., a word, concept, tag) */
  id: string;
  /** Attentional weight W_j (0-1) */
  weight: number;
}

/** Configuration for the activation system */
export interface ActivationConfig {
  /** Decay parameter d (typically 0.5 in ACT-R) */
  decay: number;
  /** Base-level constant (offset) */
  baseLevelConstant: number;
  /** Noise parameter s for logistic distribution (0 = deterministic) */
  noiseScale: number;
  /** Maximum associative strength S_max */
  maxAssociativeStrength: number;
  /** Retrieval threshold tau — items below this are not retrieved */
  retrievalThreshold: number;
  /** Latency factor F for retrieval time: RT = F * e^(-A_i) */
  latencyFactor: number;
  /** Maximum number of access history entries to keep */
  maxHistorySize: number;
}

export const DEFAULT_ACTIVATION_CONFIG: ActivationConfig = {
  decay: 0.5,
  baseLevelConstant: 0.0,
  noiseScale: 0.25,
  maxAssociativeStrength: 2.0,
  retrievalThreshold: -1.0,
  latencyFactor: 1.0,
  maxHistorySize: 100,
};

/** Result of a retrieval attempt */
export interface RetrievalResult<T = unknown> {
  /** Retrieved memory (null if retrieval failure) */
  memory: ActivatedMemory<T> | null;
  /** Activation level of retrieved item */
  activation: number;
  /** Estimated retrieval latency (ms) */
  latencyMs: number;
  /** Whether retrieval succeeded (activation > threshold) */
  success: boolean;
}

// ============================================================================
// Activation Engine
// ============================================================================

export class ActivationEngine<T = unknown> {
  private config: ActivationConfig;
  private memories: Map<string, ActivatedMemory<T>> = new Map();

  /** Associative strength matrix: S[context_id][memory_id] = strength */
  private associations: Map<string, Map<string, number>> = new Map();

  constructor(config: Partial<ActivationConfig> = {}) {
    this.config = { ...DEFAULT_ACTIVATION_CONFIG, ...config };
  }

  // ==========================================================================
  // Memory Management
  // ==========================================================================

  /** Store a new memory or update access history of existing one */
  store(id: string, content: T, tags: string[] = []): ActivatedMemory<T> {
    const now = Date.now();
    const existing = this.memories.get(id);

    if (existing) {
      // Boost: record new access
      existing.accessHistory.push(now);
      existing.accessCount++;
      existing.content = content;
      // Prune old history
      if (existing.accessHistory.length > this.config.maxHistorySize) {
        existing.accessHistory = existing.accessHistory.slice(-this.config.maxHistorySize);
      }
      // Update associations
      this.updateAssociations(id, tags);
      return existing;
    }

    const memory: ActivatedMemory<T> = {
      id,
      content,
      accessHistory: [now],
      accessCount: 1,
      tags,
      activation: 0,
      createdAt: now,
    };

    this.memories.set(id, memory);
    this.updateAssociations(id, tags);
    return memory;
  }

  /** Record an access to an existing memory (boosting its activation) */
  access(id: string): void {
    const memory = this.memories.get(id);
    if (memory) {
      memory.accessHistory.push(Date.now());
      memory.accessCount++;
      if (memory.accessHistory.length > this.config.maxHistorySize) {
        memory.accessHistory = memory.accessHistory.slice(-this.config.maxHistorySize);
      }
    }
  }

  /** Remove a memory */
  forget(id: string): boolean {
    return this.memories.delete(id);
  }

  // ==========================================================================
  // Activation Computation
  // ==========================================================================

  /**
   * Compute the activation level of a memory item.
   *
   * A_i = B_i + sum(W_j * S_ji) + noise
   *
   * B_i = ln(sum(t_k^-d)) + baseLevelConstant
   *   where t_k is the time since the k-th access in seconds
   *
   * Spreading activation: sum over context elements j of W_j * S_ji
   */
  computeActivation(memoryId: string, context: ContextElement[] = []): number {
    const memory = this.memories.get(memoryId);
    if (!memory) return -Infinity;

    // 1. Base-level activation B_i
    const baseLevel = this.computeBaseLevel(memory);

    // 2. Spreading activation
    const spreading = this.computeSpreadingActivation(memoryId, context);

    // 3. Noise (logistic distribution)
    const noise = this.config.noiseScale > 0
      ? this.logisticNoise(this.config.noiseScale)
      : 0;

    const activation = baseLevel + spreading + noise;
    memory.activation = activation;
    return activation;
  }

  /**
   * Base-level activation: B_i = ln(sum(t_k^-d)) + c
   *
   * This captures the power law of practice and forgetting:
   * - More recent accesses contribute more (recency)
   * - More total accesses contribute more (frequency)
   * - Contribution decays as a power law of time
   */
  private computeBaseLevel(memory: ActivatedMemory<T>): number {
    const now = Date.now();
    const d = this.config.decay;
    let sum = 0;

    for (const accessTime of memory.accessHistory) {
      const timeSinceAccess = Math.max(1, (now - accessTime) / 1000); // seconds
      sum += Math.pow(timeSinceAccess, -d);
    }

    if (sum <= 0) return this.config.baseLevelConstant;
    return Math.log(sum) + this.config.baseLevelConstant;
  }

  /**
   * Spreading activation: sum(W_j * S_ji)
   *
   * Context elements spread activation to memories they're associated with.
   * S_ji = log(fan_j) where fan_j is the number of memories associated with context j.
   */
  private computeSpreadingActivation(memoryId: string, context: ContextElement[]): number {
    if (context.length === 0) return 0;

    let totalActivation = 0;

    for (const ctx of context) {
      const assocMap = this.associations.get(ctx.id);
      if (!assocMap) continue;

      const strength = assocMap.get(memoryId) || 0;
      totalActivation += ctx.weight * strength;
    }

    return totalActivation;
  }

  /**
   * Update associative strengths between a memory and its tags.
   * S_ji = S_max - ln(fan_j) where fan_j is the number of associations from context j.
   */
  private updateAssociations(memoryId: string, tags: string[]): void {
    for (const tag of tags) {
      if (!this.associations.has(tag)) {
        this.associations.set(tag, new Map());
      }
      const assocMap = this.associations.get(tag)!;
      assocMap.set(memoryId, this.config.maxAssociativeStrength);
    }

    // Recompute strengths based on fan (number of associations per context)
    for (const tag of tags) {
      const assocMap = this.associations.get(tag)!;
      const fan = assocMap.size;
      const strength = Math.max(0, this.config.maxAssociativeStrength - Math.log(Math.max(1, fan)));
      for (const mid of Array.from(assocMap.keys())) {
        assocMap.set(mid, strength);
      }
    }
  }

  // ==========================================================================
  // Retrieval
  // ==========================================================================

  /**
   * Retrieve the most activated memory given a context.
   * Returns null if no memory exceeds the retrieval threshold.
   */
  retrieve(context: ContextElement[] = []): RetrievalResult<T> {
    let bestMemory: ActivatedMemory<T> | null = null;
    let bestActivation = -Infinity;

    for (const memory of Array.from(this.memories.values())) {
      const activation = this.computeActivation(memory.id, context);
      if (activation > bestActivation) {
        bestActivation = activation;
        bestMemory = memory;
      }
    }

    const success = bestActivation > this.config.retrievalThreshold;
    const latencyMs = success
      ? this.config.latencyFactor * Math.exp(-bestActivation) * 1000
      : Infinity;

    return {
      memory: success ? bestMemory : null,
      activation: bestActivation,
      latencyMs: Math.min(latencyMs, 30000), // Cap at 30s
      success,
    };
  }

  /**
   * Retrieve the top-k most activated memories.
   */
  retrieveTopK(k: number, context: ContextElement[] = []): ActivatedMemory<T>[] {
    const scored: Array<{ memory: ActivatedMemory<T>; activation: number }> = [];

    for (const memory of Array.from(this.memories.values())) {
      const activation = this.computeActivation(memory.id, context);
      if (activation > this.config.retrievalThreshold) {
        scored.push({ memory, activation });
      }
    }

    scored.sort((a, b) => b.activation - a.activation);
    return scored.slice(0, k).map(s => s.memory);
  }

  /**
   * Retrieve memories matching a filter, ranked by activation.
   */
  retrieveFiltered(
    filter: (memory: ActivatedMemory<T>) => boolean,
    context: ContextElement[] = [],
    limit: number = 10
  ): ActivatedMemory<T>[] {
    const scored: Array<{ memory: ActivatedMemory<T>; activation: number }> = [];

    for (const memory of Array.from(this.memories.values())) {
      if (!filter(memory)) continue;
      const activation = this.computeActivation(memory.id, context);
      if (activation > this.config.retrievalThreshold) {
        scored.push({ memory, activation });
      }
    }

    scored.sort((a, b) => b.activation - a.activation);
    return scored.slice(0, limit).map(s => s.memory);
  }

  // ==========================================================================
  // Decay & Maintenance
  // ==========================================================================

  /**
   * Prune memories whose activation has fallen below threshold.
   * Call periodically to clean up forgotten memories.
   */
  prune(context: ContextElement[] = []): number {
    let pruned = 0;
    const toRemove: string[] = [];

    for (const memory of Array.from(this.memories.values())) {
      const activation = this.computeActivation(memory.id, context);
      if (activation < this.config.retrievalThreshold - 2.0) {
        toRemove.push(memory.id);
      }
    }

    for (const id of toRemove) {
      this.memories.delete(id);
      pruned++;
    }

    return pruned;
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /** Logistic noise: sample from logistic distribution with scale s */
  private logisticNoise(s: number): number {
    const u = Math.random();
    // Avoid log(0) or log(1)
    const clamped = Math.max(0.001, Math.min(0.999, u));
    return s * Math.log(clamped / (1 - clamped));
  }

  /** Get memory count */
  get size(): number {
    return this.memories.size;
  }

  /** Get all memories (for debugging) */
  getAll(): ActivatedMemory<T>[] {
    return Array.from(this.memories.values());
  }

  /** Get a specific memory by id */
  get(id: string): ActivatedMemory<T> | undefined {
    return this.memories.get(id);
  }

  /** Get statistics */
  getStats(): { total: number; avgActivation: number; avgAge: number } {
    const now = Date.now();
    let totalActivation = 0;
    let totalAge = 0;

    for (const memory of Array.from(this.memories.values())) {
      totalActivation += memory.activation;
      totalAge += now - memory.createdAt;
    }

    const count = this.memories.size || 1;
    return {
      total: this.memories.size,
      avgActivation: totalActivation / count,
      avgAge: totalAge / count,
    };
  }
}
