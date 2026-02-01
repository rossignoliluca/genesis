/**
 * Genesis v14.7 — Earnings Tracker
 *
 * Persists all bounty earnings to state/earnings.json.
 * Tracks attempts, successes, failures, and total revenue.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

// ============================================================================
// Types
// ============================================================================

export interface BountyAttempt {
  bountyId: string;
  platform: string;
  title: string;
  reward: number;
  currency: string;
  startedAt: string;
  completedAt?: string;
  status: 'in_progress' | 'submitted' | 'accepted' | 'rejected' | 'abandoned';
  prUrl?: string;
  payout?: number;
  feedback?: string;
  timeSpentMinutes?: number;
  costIncurred?: number;
}

export interface EarningsData {
  version: string;
  lastUpdated: string;
  summary: {
    totalAttempts: number;
    totalAccepted: number;
    totalRejected: number;
    totalAbandoned: number;
    totalEarned: number;
    totalCost: number;
    netProfit: number;
    successRate: number;
    avgReward: number;
    bestBounty: number;
  };
  attempts: BountyAttempt[];
  dailyStats: Array<{
    date: string;
    attempts: number;
    accepted: number;
    earned: number;
    cost: number;
  }>;
}

// ============================================================================
// Earnings Tracker
// ============================================================================

export class EarningsTracker {
  private dataPath: string;
  private data: EarningsData;

  constructor(statePath?: string) {
    this.dataPath = statePath || join(process.cwd(), 'state', 'earnings.json');
    this.data = this.load();
  }

  // ==========================================================================
  // Core Operations
  // ==========================================================================

  /**
   * Record a new bounty attempt
   */
  startAttempt(bounty: {
    id: string;
    platform: string;
    title: string;
    reward: number;
    currency: string;
  }): BountyAttempt {
    const attempt: BountyAttempt = {
      bountyId: bounty.id,
      platform: bounty.platform,
      title: bounty.title,
      reward: bounty.reward,
      currency: bounty.currency,
      startedAt: new Date().toISOString(),
      status: 'in_progress',
    };

    this.data.attempts.push(attempt);
    this.data.summary.totalAttempts++;
    this.save();

    console.log(`[EarningsTracker] Started attempt: ${bounty.title} ($${bounty.reward})`);
    return attempt;
  }

  /**
   * Mark attempt as submitted (PR created)
   */
  markSubmitted(bountyId: string, prUrl: string): void {
    const attempt = this.findAttempt(bountyId);
    if (!attempt) {
      console.warn(`[EarningsTracker] Attempt not found: ${bountyId}`);
      return;
    }

    attempt.status = 'submitted';
    attempt.prUrl = prUrl;
    this.save();

    console.log(`[EarningsTracker] Submitted: ${attempt.title}`);
  }

  /**
   * Record successful payout
   */
  recordSuccess(
    bountyId: string,
    payout: number,
    timeSpentMinutes?: number,
    costIncurred?: number,
  ): void {
    const attempt = this.findAttempt(bountyId);
    if (!attempt) {
      console.warn(`[EarningsTracker] Attempt not found: ${bountyId}`);
      return;
    }

    attempt.status = 'accepted';
    attempt.completedAt = new Date().toISOString();
    attempt.payout = payout;
    attempt.timeSpentMinutes = timeSpentMinutes;
    attempt.costIncurred = costIncurred || 0;

    // Update summary
    this.data.summary.totalAccepted++;
    this.data.summary.totalEarned += payout;
    this.data.summary.totalCost += attempt.costIncurred;
    this.data.summary.netProfit = this.data.summary.totalEarned - this.data.summary.totalCost;
    this.data.summary.successRate = this.data.summary.totalAccepted / this.data.summary.totalAttempts;
    this.data.summary.avgReward = this.data.summary.totalEarned / this.data.summary.totalAccepted;
    this.data.summary.bestBounty = Math.max(this.data.summary.bestBounty, payout);

    // Update daily stats
    this.updateDailyStats(payout, attempt.costIncurred, true);

    this.save();

    console.log(`[EarningsTracker] ✅ Payout received: $${payout} for ${attempt.title}`);
    console.log(`[EarningsTracker] Total earned: $${this.data.summary.totalEarned.toFixed(2)}`);
  }

  /**
   * Record rejection
   */
  recordRejection(bountyId: string, feedback?: string, costIncurred?: number): void {
    const attempt = this.findAttempt(bountyId);
    if (!attempt) {
      console.warn(`[EarningsTracker] Attempt not found: ${bountyId}`);
      return;
    }

    attempt.status = 'rejected';
    attempt.completedAt = new Date().toISOString();
    attempt.feedback = feedback;
    attempt.costIncurred = costIncurred || 0;

    // Update summary
    this.data.summary.totalRejected++;
    this.data.summary.totalCost += attempt.costIncurred;
    this.data.summary.netProfit = this.data.summary.totalEarned - this.data.summary.totalCost;
    this.data.summary.successRate = this.data.summary.totalAccepted / this.data.summary.totalAttempts;

    // Update daily stats
    this.updateDailyStats(0, attempt.costIncurred, false);

    this.save();

    console.log(`[EarningsTracker] ❌ Rejected: ${attempt.title}`);
    if (feedback) {
      console.log(`[EarningsTracker] Feedback: ${feedback}`);
    }
  }

  /**
   * Mark attempt as abandoned
   */
  abandonAttempt(bountyId: string, reason?: string): void {
    const attempt = this.findAttempt(bountyId);
    if (!attempt) return;

    attempt.status = 'abandoned';
    attempt.completedAt = new Date().toISOString();
    attempt.feedback = reason;

    this.data.summary.totalAbandoned++;
    this.save();

    console.log(`[EarningsTracker] Abandoned: ${attempt.title}`);
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  getSummary(): EarningsData['summary'] {
    return { ...this.data.summary };
  }

  getRecentAttempts(limit: number = 10): BountyAttempt[] {
    return this.data.attempts.slice(-limit).reverse();
  }

  getAttemptsByStatus(status: BountyAttempt['status']): BountyAttempt[] {
    return this.data.attempts.filter(a => a.status === status);
  }

  getDailyStats(days: number = 7): EarningsData['dailyStats'] {
    return this.data.dailyStats.slice(-days);
  }

  getTotalEarned(): number {
    return this.data.summary.totalEarned;
  }

  getSuccessRate(): number {
    return this.data.summary.successRate;
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  private load(): EarningsData {
    if (!existsSync(this.dataPath)) {
      return this.createEmpty();
    }

    try {
      const raw = readFileSync(this.dataPath, 'utf-8');
      return JSON.parse(raw);
    } catch (error) {
      console.warn('[EarningsTracker] Failed to load earnings data, creating new');
      return this.createEmpty();
    }
  }

  private save(): void {
    this.data.lastUpdated = new Date().toISOString();

    try {
      const dir = dirname(this.dataPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('[EarningsTracker] Failed to save earnings data:', error);
    }
  }

  private createEmpty(): EarningsData {
    return {
      version: '14.7.0',
      lastUpdated: new Date().toISOString(),
      summary: {
        totalAttempts: 0,
        totalAccepted: 0,
        totalRejected: 0,
        totalAbandoned: 0,
        totalEarned: 0,
        totalCost: 0,
        netProfit: 0,
        successRate: 0,
        avgReward: 0,
        bestBounty: 0,
      },
      attempts: [],
      dailyStats: [],
    };
  }

  private findAttempt(bountyId: string): BountyAttempt | undefined {
    return this.data.attempts.find(a => a.bountyId === bountyId);
  }

  private updateDailyStats(earned: number, cost: number, accepted: boolean): void {
    const today = new Date().toISOString().split('T')[0];
    let todayStats = this.data.dailyStats.find(s => s.date === today);

    if (!todayStats) {
      todayStats = { date: today, attempts: 0, accepted: 0, earned: 0, cost: 0 };
      this.data.dailyStats.push(todayStats);
    }

    todayStats.attempts++;
    if (accepted) todayStats.accepted++;
    todayStats.earned += earned;
    todayStats.cost += cost;

    // Keep only last 90 days
    if (this.data.dailyStats.length > 90) {
      this.data.dailyStats = this.data.dailyStats.slice(-90);
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

let trackerInstance: EarningsTracker | null = null;

export function getEarningsTracker(statePath?: string): EarningsTracker {
  if (!trackerInstance) {
    trackerInstance = new EarningsTracker(statePath);
  }
  return trackerInstance;
}

export function resetEarningsTracker(): void {
  trackerInstance = null;
}
