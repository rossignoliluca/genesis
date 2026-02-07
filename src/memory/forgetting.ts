/**
 * Genesis 6.0 - Forgetting Module
 *
 * Implements Ebbinghaus forgetting curve: R(t) = R0 * e^(-t/S)
 *
 * Where:
 * - R = retention (0-1)
 * - R0 = initial retention strength
 * - t = time elapsed (days)
 * - S = stability (days until 50% forgotten)
 *
 * Enhanced with FSRS-style stability updates on recall.
 *
 * References:
 * - Ebbinghaus, H. (1885). Memory: A Contribution to Experimental Psychology
 * - Wozniak, P. (2020). Free Spaced Repetition Scheduler (FSRS)
 */

import { BaseMemory, ForgettingParams, RetentionResult } from './types.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Forgetting thresholds
 */
export const FORGETTING_THRESHOLDS = {
  /** Below this retention, memory is effectively forgotten */
  FORGET: 0.15,

  /** Below this, memory is weak and at risk */
  WEAK: 0.3,

  /** Above this, memory is strong */
  STRONG: 0.7,

  /** Default initial stability (days) */
  DEFAULT_STABILITY: 1.0,

  /** Maximum stability (years worth of days) */
  MAX_STABILITY: 3650,
};

/**
 * Stability multipliers for reinforcement
 */
export const STABILITY_MULTIPLIERS = {
  /** Base multiplier on successful recall */
  RECALL_SUCCESS: 2.5,

  /** Bonus for high importance memories */
  IMPORTANCE_HIGH: 1.5,

  /** Bonus for emotionally charged memories */
  EMOTIONAL: 2.0,

  /** Decay factor for failed recall */
  RECALL_FAILURE: 0.5,

  /** Bonus for repeated access within short time */
  SPACED_REPETITION: 1.2,
};

// ============================================================================
// Core Forgetting Functions
// ============================================================================

/**
 * Calculate current retention using Ebbinghaus formula
 * R(t) = R0 * e^(-t/S)
 *
 * @param params - Forgetting parameters (R0, S)
 * @param lastAccessedMs - Timestamp of last access (ms)
 * @param nowMs - Current timestamp (ms), defaults to now
 * @returns Current retention value (0-1)
 */
export function calculateRetention(
  params: ForgettingParams,
  lastAccessedMs: number,
  nowMs: number = Date.now()
): number {
  const elapsedDays = (nowMs - lastAccessedMs) / (1000 * 60 * 60 * 24);

  if (elapsedDays <= 0) {
    return params.R0;
  }

  const retention = params.R0 * Math.exp(-elapsedDays / params.S);
  return Math.max(0, Math.min(1, retention));
}

/**
 * Calculate detailed retention result for a memory
 */
export function getRetentionDetails(
  memory: BaseMemory,
  nowMs: number = Date.now()
): RetentionResult {
  const lastAccessedMs = memory.lastAccessed.getTime();
  const elapsedDays = (nowMs - lastAccessedMs) / (1000 * 60 * 60 * 24);
  const retention = calculateRetention(
    { R0: memory.R0, S: memory.S },
    lastAccessedMs,
    nowMs
  );

  // Calculate half-life: when R = R0/2
  // R0/2 = R0 * e^(-t/S)
  // 0.5 = e^(-t/S)
  // ln(0.5) = -t/S
  // t = -S * ln(0.5) = S * ln(2)
  const predictedHalfLife = memory.S * Math.LN2;

  return {
    retention,
    elapsedDays,
    predictedHalfLife,
    shouldForget: retention < FORGETTING_THRESHOLDS.FORGET,
  };
}

/**
 * Check if a memory should be forgotten
 */
export function shouldForget(
  memory: BaseMemory,
  threshold: number = FORGETTING_THRESHOLDS.FORGET
): boolean {
  const retention = calculateRetention(
    { R0: memory.R0, S: memory.S },
    memory.lastAccessed.getTime()
  );
  return retention < threshold;
}

/**
 * Get memories that should be forgotten from a list
 */
export function getMemoriesToForget<T extends BaseMemory>(
  memories: T[],
  threshold: number = FORGETTING_THRESHOLDS.FORGET
): T[] {
  return memories.filter((m) => shouldForget(m, threshold));
}

// ============================================================================
// Stability Updates (FSRS-inspired)
// ============================================================================

/**
 * Update stability after successful recall
 * Stability increases, making the memory more resistant to forgetting
 */
export function updateStabilityOnRecall(
  memory: BaseMemory,
  success: boolean = true
): number {
  let newStability = memory.S;

  if (success) {
    // Base increase
    newStability *= STABILITY_MULTIPLIERS.RECALL_SUCCESS;

    // Importance bonus
    if (memory.importance > 0.7) {
      newStability *= STABILITY_MULTIPLIERS.IMPORTANCE_HIGH;
    }

    // Emotional bonus
    if (Math.abs(memory.emotionalValence) > 0.5) {
      newStability *= STABILITY_MULTIPLIERS.EMOTIONAL;
    }
  } else {
    // Failed recall decreases stability
    newStability *= STABILITY_MULTIPLIERS.RECALL_FAILURE;
  }

  // Clamp to max
  return Math.min(newStability, FORGETTING_THRESHOLDS.MAX_STABILITY);
}

/**
 * Calculate optimal review time (when to access again)
 * Returns the time in days when retention will drop to target level
 */
export function calculateOptimalReviewTime(
  memory: BaseMemory,
  targetRetention: number = 0.9
): number {
  // Solve: targetRetention = R0 * e^(-t/S)
  // t = -S * ln(targetRetention / R0)
  const t = -memory.S * Math.log(targetRetention / memory.R0);
  return Math.max(0, t);
}

/**
 * Get spaced repetition schedule for a memory
 * Returns array of review times (days from now)
 */
export function getReviewSchedule(
  memory: BaseMemory,
  targetRetention: number = 0.9,
  numReviews: number = 5
): number[] {
  const schedule: number[] = [];
  let currentStability = memory.S;
  let totalDays = 0;

  for (let i = 0; i < numReviews; i++) {
    // Time until next review
    const interval = -currentStability * Math.log(targetRetention / memory.R0);
    totalDays += interval;
    schedule.push(totalDays);

    // Simulate stability increase after review
    currentStability *= STABILITY_MULTIPLIERS.RECALL_SUCCESS;
    currentStability = Math.min(currentStability, FORGETTING_THRESHOLDS.MAX_STABILITY);
  }

  return schedule;
}

// ============================================================================
// Initial Parameters
// ============================================================================

/**
 * Calculate initial forgetting parameters for a new memory
 */
export function calculateInitialParams(options: {
  importance?: number;
  emotionalValence?: number;
  complexity?: number;
  priorKnowledge?: boolean;
}): ForgettingParams {
  const {
    importance = 0.5,
    emotionalValence = 0,
    complexity = 0.5,
    priorKnowledge = false,
  } = options;

  // Base initial retention
  let R0 = 1.0;

  // Importance affects initial strength
  R0 += importance * 0.3;

  // Emotional memories are stronger
  R0 += Math.abs(emotionalValence) * 0.2;

  // Normalize to 0-1
  R0 = Math.min(1, R0);

  // Base stability
  let S = FORGETTING_THRESHOLDS.DEFAULT_STABILITY;

  // Complex memories decay faster initially
  S *= 1 - complexity * 0.5;

  // Prior knowledge helps
  if (priorKnowledge) {
    S *= 2;
  }

  // Emotional memories are more stable
  S *= 1 + Math.abs(emotionalValence) * 0.5;

  return { R0, S };
}

// ============================================================================
// Decay Simulation
// ============================================================================

/**
 * Simulate retention over time
 * Useful for visualization and analysis
 */
export function simulateDecay(
  params: ForgettingParams,
  days: number,
  intervalHours: number = 24
): Array<{ day: number; retention: number }> {
  const points: Array<{ day: number; retention: number }> = [];
  const intervalDays = intervalHours / 24;

  for (let day = 0; day <= days; day += intervalDays) {
    const retention = params.R0 * Math.exp(-day / params.S);
    points.push({ day, retention });
  }

  return points;
}

/**
 * Compare decay curves for multiple memories
 */
export function compareDecayCurves(
  memories: BaseMemory[],
  days: number = 30
): Map<string, Array<{ day: number; retention: number }>> {
  const curves = new Map<string, Array<{ day: number; retention: number }>>();

  for (const memory of memories) {
    curves.set(memory.id, simulateDecay({ R0: memory.R0, S: memory.S }, days));
  }

  return curves;
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Calculate retention for multiple memories efficiently
 */
export function batchCalculateRetention(
  memories: BaseMemory[],
  nowMs: number = Date.now()
): Map<string, number> {
  const retentions = new Map<string, number>();

  for (const memory of memories) {
    const retention = calculateRetention(
      { R0: memory.R0, S: memory.S },
      memory.lastAccessed.getTime(),
      nowMs
    );
    retentions.set(memory.id, retention);
  }

  return retentions;
}

/**
 * Sort memories by retention (weakest first)
 */
export function sortByRetention<T extends BaseMemory>(
  memories: T[],
  ascending: boolean = true
): T[] {
  const nowMs = Date.now();
  return [...memories].sort((a, b) => {
    const retentionA = calculateRetention(
      { R0: a.R0, S: a.S },
      a.lastAccessed.getTime(),
      nowMs
    );
    const retentionB = calculateRetention(
      { R0: b.R0, S: b.S },
      b.lastAccessed.getTime(),
      nowMs
    );
    return ascending ? retentionA - retentionB : retentionB - retentionA;
  });
}

/**
 * Get memories that need review (retention below threshold)
 */
export function getMemoriesNeedingReview<T extends BaseMemory>(
  memories: T[],
  threshold: number = FORGETTING_THRESHOLDS.WEAK
): T[] {
  return sortByRetention(
    memories.filter((m) => {
      const retention = calculateRetention(
        { R0: m.R0, S: m.S },
        m.lastAccessed.getTime()
      );
      return retention < threshold && retention >= FORGETTING_THRESHOLDS.FORGET;
    }),
    true // weakest first
  );
}

/**
 * v14.0: Get most urgent memories for review, ranked by urgency.
 * urgency = importance × (1 - currentRetention)
 * Filters out memories with retention > 0.8 (don't need review).
 */
export function getTopMemoriesForReview<T extends BaseMemory>(
  memories: T[],
  limit: number = 5
): T[] {
  const nowMs = Date.now();

  return memories
    .map(m => {
      const retention = calculateRetention(
        { R0: m.R0, S: m.S },
        m.lastAccessed.getTime(),
        nowMs
      );
      const urgency = m.importance * (1 - retention);
      return { memory: m, retention, urgency };
    })
    .filter(item => item.retention <= 0.8 && item.retention >= FORGETTING_THRESHOLDS.FORGET)
    .sort((a, b) => b.urgency - a.urgency)
    .slice(0, limit)
    .map(item => item.memory);
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Calculate forgetting statistics for a set of memories
 */
export function calculateForgettingStats(memories: BaseMemory[]): {
  total: number;
  forgotten: number;
  weak: number;
  strong: number;
  avgRetention: number;
  avgStability: number;
  avgAge: number;
  needsReview: number;
} {
  if (memories.length === 0) {
    return {
      total: 0,
      forgotten: 0,
      weak: 0,
      strong: 0,
      avgRetention: 0,
      avgStability: 0,
      avgAge: 0,
      needsReview: 0,
    };
  }

  const nowMs = Date.now();
  let totalRetention = 0;
  let totalStability = 0;
  let totalAge = 0;
  let forgotten = 0;
  let weak = 0;
  let strong = 0;
  let needsReview = 0;

  for (const memory of memories) {
    const retention = calculateRetention(
      { R0: memory.R0, S: memory.S },
      memory.lastAccessed.getTime(),
      nowMs
    );
    const ageDays = (nowMs - memory.created.getTime()) / (1000 * 60 * 60 * 24);

    totalRetention += retention;
    totalStability += memory.S;
    totalAge += ageDays;

    if (retention < FORGETTING_THRESHOLDS.FORGET) {
      forgotten++;
    } else if (retention < FORGETTING_THRESHOLDS.WEAK) {
      weak++;
      needsReview++;
    } else if (retention > FORGETTING_THRESHOLDS.STRONG) {
      strong++;
    } else {
      needsReview++;
    }
  }

  return {
    total: memories.length,
    forgotten,
    weak,
    strong,
    avgRetention: totalRetention / memories.length,
    avgStability: totalStability / memories.length,
    avgAge: totalAge / memories.length,
    needsReview,
  };
}
