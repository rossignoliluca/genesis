/**
 * Genesis v11.0 - Experience Replay Buffer
 *
 * Implements prioritized experience replay for Active Inference.
 * Inspired by Deep AIF papers (2025) showing that purely online
 * Dirichlet updates are insufficient for long-horizon tasks.
 *
 * Key features:
 * - Prioritized by surprise (TD-error analog in AIF)
 * - Connects to dream mode for offline consolidation
 * - Adaptive capacity based on learning velocity
 *
 * References:
 * - "Deep Active Inference for Delayed/Long-Horizon Tasks" (2025)
 * - Prioritized Experience Replay (Schaul et al. 2015)
 * - Sleep replay in biological neural systems (Diekelmann & Born 2010)
 */

import { Observation, ActionType, Beliefs } from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface Experience {
  id: number;
  timestamp: number;
  observation: Observation;
  action: ActionType;
  actionIdx: number;
  nextObservation: Observation;
  surprise: number;
  outcome: 'positive' | 'negative' | 'neutral';
  beliefs: Beliefs;
  nextBeliefs: Beliefs;
  // Priority for replay (higher = more important to replay)
  priority: number;
  // How many times this experience has been replayed
  replayCount: number;
}

export interface ReplayBatch {
  experiences: Experience[];
  batchSize: number;
  totalPriority: number;
  avgSurprise: number;
}

export interface ReplayStats {
  bufferSize: number;
  totalStored: number;
  totalReplayed: number;
  avgSurprise: number;
  avgPriority: number;
  highSurpriseCount: number;   // Experiences with surprise > threshold
  consolidatedCount: number;   // Experiences that have been replayed enough
}

export interface ReplayConfig {
  maxCapacity: number;         // Max buffer size
  priorityExponent: number;    // Alpha: how much prioritization (0=uniform, 1=full)
  importanceSamplingBeta: number; // Beta: importance sampling correction
  surpriseThreshold: number;   // Above this = high-surprise experience
  minReplayBatch: number;      // Minimum batch size for replay
  maxReplayBatch: number;      // Maximum batch size for replay
  consolidationThreshold: number; // After this many replays, experience is "consolidated"
}

export const DEFAULT_REPLAY_CONFIG: ReplayConfig = {
  maxCapacity: 2000,
  priorityExponent: 0.6,       // Moderate prioritization
  importanceSamplingBeta: 0.4, // Partial importance sampling correction
  surpriseThreshold: 3.0,
  minReplayBatch: 8,
  maxReplayBatch: 32,
  consolidationThreshold: 5,
};

// ============================================================================
// Experience Replay Buffer
// ============================================================================

export class ExperienceReplayBuffer {
  private buffer: Experience[] = [];
  private config: ReplayConfig;
  private nextId: number = 0;
  private totalStored: number = 0;
  private totalReplayed: number = 0;

  constructor(config: Partial<ReplayConfig> = {}) {
    this.config = { ...DEFAULT_REPLAY_CONFIG, ...config };
  }

  /**
   * Store a new experience in the buffer.
   * Priority is initially set based on surprise.
   */
  store(experience: Omit<Experience, 'id' | 'priority' | 'replayCount'>): void {
    const entry: Experience = {
      ...experience,
      id: this.nextId++,
      priority: this.computeInitialPriority(experience.surprise, experience.outcome),
      replayCount: 0,
    };

    if (this.buffer.length >= this.config.maxCapacity) {
      // Evict lowest-priority, most-replayed experience
      this.evict();
    }

    this.buffer.push(entry);
    this.totalStored++;
  }

  /**
   * Sample a batch of experiences for replay, prioritized by surprise.
   * Uses proportional prioritization: P(i) = p_i^α / Σ p_k^α
   */
  sampleBatch(batchSize?: number): ReplayBatch {
    const size = Math.min(
      batchSize ?? this.config.minReplayBatch,
      this.buffer.length,
      this.config.maxReplayBatch
    );

    if (this.buffer.length === 0 || size === 0) {
      return { experiences: [], batchSize: 0, totalPriority: 0, avgSurprise: 0 };
    }

    // Compute sampling probabilities
    const priorities = this.buffer.map(e =>
      Math.pow(e.priority + 1e-6, this.config.priorityExponent)
    );
    const totalPriority = priorities.reduce((s, p) => s + p, 0);
    const probabilities = priorities.map(p => p / totalPriority);

    // Sample without replacement
    const sampled: Experience[] = [];
    const used = new Set<number>();

    for (let i = 0; i < size; i++) {
      let r = Math.random();
      let cumsum = 0;
      for (let j = 0; j < probabilities.length; j++) {
        if (used.has(j)) continue;
        cumsum += probabilities[j];
        if (r < cumsum || j === probabilities.length - 1) {
          sampled.push(this.buffer[j]);
          used.add(j);
          this.buffer[j].replayCount++;
          this.totalReplayed++;
          break;
        }
      }
    }

    return {
      experiences: sampled,
      batchSize: sampled.length,
      totalPriority,
      avgSurprise: sampled.reduce((s, e) => s + e.surprise, 0) / sampled.length,
    };
  }

  /**
   * Sample high-surprise experiences specifically (for dream consolidation).
   * These are the most important experiences to replay during "sleep".
   */
  sampleHighSurprise(maxCount: number = 16): Experience[] {
    const highSurprise = this.buffer
      .filter(e => e.surprise > this.config.surpriseThreshold)
      .sort((a, b) => b.surprise - a.surprise)
      .slice(0, maxCount);

    for (const exp of highSurprise) {
      exp.replayCount++;
      this.totalReplayed++;
    }

    return highSurprise;
  }

  /**
   * Update priority of an experience after replay.
   * New priority = new surprise after re-evaluating with current model.
   */
  updatePriority(experienceId: number, newSurprise: number): void {
    const exp = this.buffer.find(e => e.id === experienceId);
    if (exp) {
      exp.priority = this.computeInitialPriority(newSurprise, exp.outcome);
      exp.surprise = newSurprise; // Update surprise estimate
    }
  }

  /**
   * Get consolidated experiences (replayed enough times).
   * These can be safely evicted or archived.
   */
  getConsolidated(): Experience[] {
    return this.buffer.filter(e => e.replayCount >= this.config.consolidationThreshold);
  }

  /**
   * Remove consolidated experiences from the buffer.
   * Call after dream consolidation to free space.
   */
  pruneConsolidated(): number {
    const before = this.buffer.length;
    this.buffer = this.buffer.filter(e => e.replayCount < this.config.consolidationThreshold);
    return before - this.buffer.length;
  }

  /**
   * Get buffer statistics.
   */
  getStats(): ReplayStats {
    const avgSurprise = this.buffer.length > 0
      ? this.buffer.reduce((s, e) => s + e.surprise, 0) / this.buffer.length
      : 0;
    const avgPriority = this.buffer.length > 0
      ? this.buffer.reduce((s, e) => s + e.priority, 0) / this.buffer.length
      : 0;

    return {
      bufferSize: this.buffer.length,
      totalStored: this.totalStored,
      totalReplayed: this.totalReplayed,
      avgSurprise,
      avgPriority,
      highSurpriseCount: this.buffer.filter(e => e.surprise > this.config.surpriseThreshold).length,
      consolidatedCount: this.getConsolidated().length,
    };
  }

  /**
   * Export buffer for persistence.
   */
  export(): { buffer: Experience[]; config: ReplayConfig; stats: { totalStored: number; totalReplayed: number } } {
    return {
      buffer: [...this.buffer],
      config: this.config,
      stats: { totalStored: this.totalStored, totalReplayed: this.totalReplayed },
    };
  }

  /**
   * Import previously saved buffer.
   */
  import(data: { buffer?: Experience[]; stats?: { totalStored?: number; totalReplayed?: number } }): void {
    if (data.buffer) this.buffer = data.buffer;
    if (data.stats?.totalStored) this.totalStored = data.stats.totalStored;
    if (data.stats?.totalReplayed) this.totalReplayed = data.stats.totalReplayed;
    this.nextId = Math.max(0, ...this.buffer.map(e => e.id)) + 1;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private computeInitialPriority(surprise: number, outcome: 'positive' | 'negative' | 'neutral'): number {
    // Priority based on surprise + outcome bonus
    // Negative outcomes get extra priority (learn from mistakes)
    let priority = surprise;
    if (outcome === 'negative') priority *= 1.5;
    if (outcome === 'positive' && surprise > this.config.surpriseThreshold) priority *= 1.2;
    return Math.max(0.01, priority);
  }

  private evict(): void {
    // Remove the lowest-priority, most-replayed experience
    let worstIdx = 0;
    let worstScore = Infinity;

    for (let i = 0; i < this.buffer.length; i++) {
      // Score: lower is worse (more evictable)
      // Low priority + high replay count = safe to evict
      const score = this.buffer[i].priority / (1 + this.buffer[i].replayCount);
      if (score < worstScore) {
        worstScore = score;
        worstIdx = i;
      }
    }

    this.buffer.splice(worstIdx, 1);
  }
}

// ============================================================================
// Factory
// ============================================================================

let replayInstance: ExperienceReplayBuffer | null = null;

export function createExperienceReplayBuffer(config?: Partial<ReplayConfig>): ExperienceReplayBuffer {
  return new ExperienceReplayBuffer(config);
}

export function getExperienceReplayBuffer(config?: Partial<ReplayConfig>): ExperienceReplayBuffer {
  if (!replayInstance) {
    replayInstance = createExperienceReplayBuffer(config);
  }
  return replayInstance;
}
