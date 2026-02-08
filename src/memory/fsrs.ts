/**
 * FSRS v4 - Free Spaced Repetition Scheduler
 *
 * Implementation of the FSRS algorithm for optimal memory retention scheduling.
 * Based on the open-source FSRS algorithm used by Anki and other SRS systems.
 *
 * Key improvements over simple Ebbinghaus:
 * - Difficulty estimation per item
 * - Optimal review interval calculation
 * - Rating-based stability updates
 * - Desired retention targeting
 *
 * Paper: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
 *
 * @module memory/fsrs
 * @version 18.3.0
 */

import type { FSRSParameters } from './component-profiles.js';

// =============================================================================
// Types
// =============================================================================

export type Rating = 'again' | 'hard' | 'good' | 'easy';
export type CardState = 'new' | 'learning' | 'review' | 'relearning';

export interface FSRSCard {
  /** Unique identifier */
  id: string;
  /** Current state */
  state: CardState;
  /** Stability (S) - days until retention drops to 90% */
  stability: number;
  /** Difficulty (D) - 1-10 scale */
  difficulty: number;
  /** Number of elapsed days since last review */
  elapsedDays: number;
  /** Scheduled days until next review */
  scheduledDays: number;
  /** Number of times reviewed */
  reps: number;
  /** Number of lapses (failures after learning) */
  lapses: number;
  /** Last review timestamp */
  lastReview: Date | null;
  /** Due date for next review */
  due: Date;
  /** Current learning step index (for learning/relearning) */
  step: number;
}

export interface SchedulingResult {
  /** Updated card */
  card: FSRSCard;
  /** Scheduled interval in days */
  interval: number;
  /** Predicted retention at next review */
  retention: number;
  /** Expected free energy (lower = better) */
  expectedFreeEnergy: number;
}

export interface ReviewLog {
  rating: Rating;
  elapsedDays: number;
  scheduledDays: number;
  state: CardState;
  timestamp: Date;
}

// =============================================================================
// Default Parameters (FSRS v4)
// =============================================================================

export const DEFAULT_FSRS_PARAMS: FSRSParameters = {
  initialDifficulty: 5,
  learningSteps: [1, 10], // minutes
  graduatingInterval: 1,  // days
  easyInterval: 4,        // days
  easyBonus: 1.3,
  intervalModifier: 1.0,
  maximumInterval: 365,
  // Weights from FSRS v4 (optimized on millions of reviews)
  weights: [
    0.4, 0.6, 2.4, 5.8,      // w0-w3: initial stability by rating
    4.93, 0.94, 0.86, 0.01,  // w4-w7: difficulty
    1.49, 0.14, 0.94,        // w8-w10: success multiplier
    2.18, 0.05, 0.34, 1.26,  // w11-w14: failure multiplier
    0.29, 2.61,              // w15-w16: hard penalty
    0.0, 0.0,                // w17-w18: reserved
  ],
};

// =============================================================================
// FSRS Algorithm Implementation
// =============================================================================

export class FSRS {
  private params: FSRSParameters;
  private desiredRetention: number;

  constructor(params: Partial<FSRSParameters> = {}, desiredRetention = 0.9) {
    this.params = { ...DEFAULT_FSRS_PARAMS, ...params };
    this.desiredRetention = desiredRetention;
  }

  // ---------------------------------------------------------------------------
  // Card Creation
  // ---------------------------------------------------------------------------

  /**
   * Create a new card
   */
  createCard(id: string, now: Date = new Date()): FSRSCard {
    return {
      id,
      state: 'new',
      stability: 0,
      difficulty: this.params.initialDifficulty,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      lastReview: null,
      due: now,
      step: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Review Scheduling
  // ---------------------------------------------------------------------------

  /**
   * Schedule next review based on rating
   */
  review(card: FSRSCard, rating: Rating, now: Date = new Date()): SchedulingResult {
    const updatedCard = { ...card };
    updatedCard.reps++;
    updatedCard.lastReview = now;

    // Calculate elapsed days
    if (card.lastReview) {
      updatedCard.elapsedDays = this.daysBetween(card.lastReview, now);
    }

    // Handle based on current state
    switch (card.state) {
      case 'new':
        return this.scheduleNew(updatedCard, rating, now);
      case 'learning':
      case 'relearning':
        return this.scheduleLearning(updatedCard, rating, now);
      case 'review':
        return this.scheduleReview(updatedCard, rating, now);
      default:
        return this.scheduleNew(updatedCard, rating, now);
    }
  }

  /**
   * Get all scheduling options for a card
   */
  getSchedulingOptions(card: FSRSCard, now: Date = new Date()): Record<Rating, SchedulingResult> {
    return {
      again: this.review({ ...card }, 'again', now),
      hard: this.review({ ...card }, 'hard', now),
      good: this.review({ ...card }, 'good', now),
      easy: this.review({ ...card }, 'easy', now),
    };
  }

  // ---------------------------------------------------------------------------
  // New Card Scheduling
  // ---------------------------------------------------------------------------

  private scheduleNew(card: FSRSCard, rating: Rating, now: Date): SchedulingResult {
    // Initialize stability and difficulty
    card.difficulty = this.initDifficulty(rating);
    card.stability = this.initStability(rating);

    if (rating === 'again') {
      // Stay in learning
      card.state = 'learning';
      card.step = 0;
      return this.scheduleLearningStep(card, now);
    } else if (rating === 'easy') {
      // Graduate immediately with easy bonus
      card.state = 'review';
      const interval = Math.min(
        this.params.easyInterval * this.params.intervalModifier,
        this.params.maximumInterval
      );
      card.scheduledDays = interval;
      card.due = this.addDays(now, interval);
      return this.buildResult(card, interval);
    } else {
      // Enter learning phase
      card.state = 'learning';
      card.step = rating === 'hard' ? 0 : 1;
      return this.scheduleLearningStep(card, now);
    }
  }

  // ---------------------------------------------------------------------------
  // Learning State Scheduling
  // ---------------------------------------------------------------------------

  private scheduleLearning(card: FSRSCard, rating: Rating, now: Date): SchedulingResult {
    if (rating === 'again') {
      // Reset to first step
      card.step = 0;
      if (card.state === 'review') {
        card.state = 'relearning';
        card.lapses++;
      }
      return this.scheduleLearningStep(card, now);
    } else if (rating === 'easy') {
      // Graduate immediately
      card.state = 'review';
      card.stability = this.nextStability(card.stability, card.difficulty, rating);
      const interval = Math.min(
        this.nextInterval(card.stability) * this.params.easyBonus,
        this.params.maximumInterval
      );
      card.scheduledDays = interval;
      card.due = this.addDays(now, interval);
      return this.buildResult(card, interval);
    } else {
      // Advance step
      card.step++;
      if (card.step >= this.params.learningSteps.length) {
        // Graduate to review
        card.state = 'review';
        card.stability = this.nextStability(card.stability, card.difficulty, rating);
        const interval = Math.min(
          rating === 'good' ? this.params.graduatingInterval : this.params.graduatingInterval * 0.7,
          this.params.maximumInterval
        );
        card.scheduledDays = interval;
        card.due = this.addDays(now, interval);
        return this.buildResult(card, interval);
      }
      return this.scheduleLearningStep(card, now);
    }
  }

  private scheduleLearningStep(card: FSRSCard, now: Date): SchedulingResult {
    const stepMinutes = this.params.learningSteps[card.step] || 1;
    const interval = stepMinutes / (24 * 60); // Convert minutes to days
    card.scheduledDays = interval;
    card.due = new Date(now.getTime() + stepMinutes * 60 * 1000);
    return this.buildResult(card, interval);
  }

  // ---------------------------------------------------------------------------
  // Review State Scheduling
  // ---------------------------------------------------------------------------

  private scheduleReview(card: FSRSCard, rating: Rating, now: Date): SchedulingResult {
    // Update difficulty
    card.difficulty = this.nextDifficulty(card.difficulty, rating);

    if (rating === 'again') {
      // Lapse - go to relearning
      card.state = 'relearning';
      card.lapses++;
      card.step = 0;
      card.stability = this.nextStability(card.stability, card.difficulty, rating);
      return this.scheduleLearningStep(card, now);
    }

    // Update stability
    card.stability = this.nextStability(card.stability, card.difficulty, rating);

    // Calculate interval
    let interval = this.nextInterval(card.stability);

    // Apply modifiers
    if (rating === 'hard') {
      interval *= 0.8; // Hard penalty
    } else if (rating === 'easy') {
      interval *= this.params.easyBonus;
    }

    interval = Math.min(
      interval * this.params.intervalModifier,
      this.params.maximumInterval
    );

    card.scheduledDays = interval;
    card.due = this.addDays(now, interval);
    return this.buildResult(card, interval);
  }

  // ---------------------------------------------------------------------------
  // FSRS Core Formulas
  // ---------------------------------------------------------------------------

  /**
   * Initial difficulty based on first rating
   * D0(R) = w4 - (R-3) * w5
   */
  private initDifficulty(rating: Rating): number {
    const w = this.params.weights;
    const ratingNum = this.ratingToNumber(rating);
    const D0 = w[4] - (ratingNum - 3) * w[5];
    return this.clamp(D0, 1, 10);
  }

  /**
   * Initial stability based on first rating
   * S0(R) = w[R-1]
   */
  private initStability(rating: Rating): number {
    const w = this.params.weights;
    const ratingNum = this.ratingToNumber(rating);
    return Math.max(0.1, w[ratingNum - 1]);
  }

  /**
   * Next difficulty after review
   * D'(D, R) = w6 * D0(3) + (1 - w6) * (D - w7 * (R - 3))
   */
  private nextDifficulty(D: number, rating: Rating): number {
    const w = this.params.weights;
    const ratingNum = this.ratingToNumber(rating);
    const D0 = w[4]; // D0(3) = w4
    const newD = w[6] * D0 + (1 - w[6]) * (D - w[7] * (ratingNum - 3));
    return this.clamp(newD, 1, 10);
  }

  /**
   * Next stability after review
   * For success (R >= 2):
   *   S'(D, S, R, T) = S * (e^w8 * (11-D) * S^(-w9) * (e^(w10*(1-R)) - 1) * w15^(if R=2) * w16^(if R=4) + 1)
   * For failure (R = 1):
   *   S'(D, S, R, T) = w11 * D^(-w12) * ((S+1)^w13 - 1) * e^(w14*(1-R))
   */
  private nextStability(S: number, D: number, rating: Rating): number {
    const w = this.params.weights;
    const R = this.ratingToNumber(rating);

    if (R === 1) {
      // Failure formula
      const newS = w[11] * Math.pow(D, -w[12]) * (Math.pow(S + 1, w[13]) - 1) * Math.exp(w[14] * (1 - R));
      return Math.max(0.1, newS);
    }

    // Success formula
    const hardPenalty = R === 2 ? w[15] : 1;
    const easyBonus = R === 4 ? w[16] : 1;
    const inner = Math.exp(w[8]) * (11 - D) * Math.pow(S, -w[9]) *
                  (Math.exp(w[10] * (1 - R)) - 1) * hardPenalty * easyBonus + 1;
    const newS = S * inner;

    return Math.min(Math.max(0.1, newS), 365 * 10); // Cap at 10 years
  }

  /**
   * Calculate interval for desired retention
   * I(S, R) = S * ln(R) / ln(0.9) where R = desired retention
   */
  private nextInterval(S: number): number {
    const interval = S * Math.log(this.desiredRetention) / Math.log(0.9);
    return Math.max(1, Math.round(interval));
  }

  /**
   * Calculate retention at time t
   * R(t, S) = 0.9^(t/S)
   */
  calculateRetention(elapsedDays: number, stability: number): number {
    if (stability <= 0) return 0;
    return Math.pow(0.9, elapsedDays / stability);
  }

  // ---------------------------------------------------------------------------
  // Expected Free Energy (for policy selection)
  // ---------------------------------------------------------------------------

  /**
   * Calculate expected free energy for a scheduling decision
   * Lower EFE = better decision (aligns with desired retention)
   *
   * EFE = -log(predicted_retention) + cost(interval)
   */
  calculateEFE(card: FSRSCard, interval: number): number {
    const predictedRetention = this.calculateRetention(interval, card.stability);

    // Epistemic value: uncertainty reduction
    const uncertainty = 1 - predictedRetention;

    // Pragmatic value: cost of review (time investment)
    const reviewCost = 1 / (interval + 1); // More frequent = higher cost

    // Preference alignment: distance from desired retention
    const retentionGap = Math.abs(this.desiredRetention - predictedRetention);

    // EFE = weighted combination
    return uncertainty * 0.5 + reviewCost * 0.3 + retentionGap * 0.2;
  }

  // ---------------------------------------------------------------------------
  // Utility Functions
  // ---------------------------------------------------------------------------

  private ratingToNumber(rating: Rating): number {
    switch (rating) {
      case 'again': return 1;
      case 'hard': return 2;
      case 'good': return 3;
      case 'easy': return 4;
    }
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private daysBetween(date1: Date, date2: Date): number {
    const ms = date2.getTime() - date1.getTime();
    return ms / (1000 * 60 * 60 * 24);
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private buildResult(card: FSRSCard, interval: number): SchedulingResult {
    return {
      card,
      interval,
      retention: this.calculateRetention(interval, card.stability),
      expectedFreeEnergy: this.calculateEFE(card, interval),
    };
  }

  // ---------------------------------------------------------------------------
  // Batch Operations
  // ---------------------------------------------------------------------------

  /**
   * Get cards due for review
   */
  getDueCards(cards: FSRSCard[], now: Date = new Date()): FSRSCard[] {
    return cards.filter(card => card.due <= now).sort((a, b) => {
      // Sort by: overdue first, then by stability (weaker first)
      const aOverdue = this.daysBetween(a.due, now);
      const bOverdue = this.daysBetween(b.due, now);
      if (aOverdue !== bOverdue) return bOverdue - aOverdue;
      return a.stability - b.stability;
    });
  }

  /**
   * Calculate optimal review order (minimize total expected forgetting)
   */
  getOptimalReviewOrder(cards: FSRSCard[], now: Date = new Date()): FSRSCard[] {
    // Calculate current retention for each card
    const withRetention = cards.map(card => ({
      card,
      retention: card.lastReview
        ? this.calculateRetention(this.daysBetween(card.lastReview, now), card.stability)
        : 0.5,
      efe: this.calculateEFE(card, card.scheduledDays),
    }));

    // Sort by EFE (lowest first = most urgent)
    return withRetention
      .sort((a, b) => a.efe - b.efe)
      .map(x => x.card);
  }

  /**
   * Estimate daily review load
   */
  estimateReviewLoad(cards: FSRSCard[], days: number, now: Date = new Date()): number[] {
    const load = new Array(days).fill(0);

    for (const card of cards) {
      const dueIn = Math.max(0, Math.ceil(this.daysBetween(now, card.due)));
      if (dueIn < days) {
        load[dueIn]++;
      }
    }

    return load;
  }

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  /**
   * Get statistics about card collection
   */
  getStats(cards: FSRSCard[]): {
    total: number;
    byState: Record<CardState, number>;
    avgStability: number;
    avgDifficulty: number;
    avgRetention: number;
    dueToday: number;
    overdue: number;
  } {
    const now = new Date();
    const byState: Record<CardState, number> = { new: 0, learning: 0, review: 0, relearning: 0 };

    let totalStability = 0;
    let totalDifficulty = 0;
    let totalRetention = 0;
    let dueToday = 0;
    let overdue = 0;

    for (const card of cards) {
      byState[card.state]++;
      totalStability += card.stability;
      totalDifficulty += card.difficulty;

      if (card.lastReview) {
        totalRetention += this.calculateRetention(
          this.daysBetween(card.lastReview, now),
          card.stability
        );
      }

      const dueIn = this.daysBetween(now, card.due);
      if (dueIn <= 0) {
        dueToday++;
        if (dueIn < -1) overdue++;
      }
    }

    const n = cards.length || 1;
    return {
      total: cards.length,
      byState,
      avgStability: totalStability / n,
      avgDifficulty: totalDifficulty / n,
      avgRetention: totalRetention / n,
      dueToday,
      overdue,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

let fsrsInstance: FSRS | null = null;

/**
 * Get singleton FSRS instance
 */
export function getFSRS(params?: Partial<FSRSParameters>, desiredRetention?: number): FSRS {
  if (!fsrsInstance || params || desiredRetention) {
    fsrsInstance = new FSRS(params, desiredRetention);
  }
  return fsrsInstance;
}

/**
 * Create FSRS instance for specific component
 */
export function createComponentFSRS(
  params: FSRSParameters,
  desiredRetention = 0.9
): FSRS {
  return new FSRS(params, desiredRetention);
}
