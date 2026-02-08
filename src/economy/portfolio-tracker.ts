/**
 * Portfolio Tracker v19.6
 *
 * Comprehensive tracking of bounty hunting performance:
 * - Revenue tracking across platforms
 * - Success rate monitoring
 * - Reputation scoring
 * - Performance trends
 * - Goal tracking
 *
 * This provides visibility into overall performance.
 *
 * @module economy/portfolio-tracker
 * @version 19.6.0
 */

import type { Bounty } from './generators/bounty-hunter.js';
import type { PRSubmission } from './live/pr-pipeline.js';
import type { BountyClassification } from './bounty-intelligence.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface PortfolioStats {
  // Overall metrics
  totalBounties: number;
  completedBounties: number;
  failedBounties: number;
  pendingBounties: number;
  successRate: number;

  // Revenue
  totalRevenue: number;
  pendingRevenue: number;
  averageRevenuePerBounty: number;
  revenueByPlatform: Record<string, number>;
  revenueByType: Record<string, number>;

  // Performance
  averageCompletionTime: number;  // hours
  fastestCompletion: number;
  streak: number;  // consecutive successes
  longestStreak: number;

  // Reputation
  reputationScore: number;  // 0-100
  maintainerRelationships: number;
  repeatAcceptances: number;
}

export interface BountyRecord {
  id: string;
  bountyId: string;
  title: string;
  platform: string;
  type: string;
  difficulty: string;
  reward: number;
  status: 'pending' | 'submitted' | 'accepted' | 'rejected' | 'paid';
  prUrl?: string;
  submittedAt?: Date;
  completedAt?: Date;
  paidAt?: Date;
  repo?: string;
  maintainer?: string;
  feedback?: string;
  duration?: number;  // hours
}

export interface DailySnapshot {
  date: string;
  revenue: number;
  submissions: number;
  acceptances: number;
  rejections: number;
  successRate: number;
}

export interface Goal {
  id: string;
  type: 'revenue' | 'bounties' | 'streak' | 'reputation';
  target: number;
  current: number;
  deadline?: Date;
  status: 'active' | 'achieved' | 'failed';
  createdAt: Date;
}

export interface PerformanceTrend {
  period: 'daily' | 'weekly' | 'monthly';
  data: Array<{
    date: string;
    revenue: number;
    successRate: number;
    bounties: number;
  }>;
  trend: 'improving' | 'stable' | 'declining';
  changePercent: number;
}

// ============================================================================
// Portfolio Tracker
// ============================================================================

export class PortfolioTracker {
  private records: BountyRecord[] = [];
  private snapshots: DailySnapshot[] = [];
  private goals: Goal[] = [];
  private persistPath: string;

  constructor(persistPath?: string) {
    this.persistPath = persistPath ?? '.genesis/portfolio.json';
    this.load();
  }

  // ===========================================================================
  // Recording
  // ===========================================================================

  /**
   * Record a new bounty attempt
   */
  recordBountyStart(bounty: Bounty, classification: BountyClassification): string {
    const record: BountyRecord = {
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      bountyId: bounty.id,
      title: bounty.title,
      platform: bounty.platform,
      type: classification.type,
      difficulty: bounty.difficulty,
      reward: bounty.reward,
      status: 'pending',
      repo: bounty.sourceMetadata?.org && bounty.sourceMetadata?.repo
        ? `${bounty.sourceMetadata.org}/${bounty.sourceMetadata.repo}`
        : undefined,
    };

    this.records.push(record);
    this.save();

    return record.id;
  }

  /**
   * Record PR submission
   */
  recordSubmission(recordId: string, submission: PRSubmission): void {
    const record = this.records.find(r => r.id === recordId);
    if (record) {
      record.status = 'submitted';
      record.prUrl = submission.prUrl;
      record.submittedAt = submission.submittedAt;
      this.save();
    }
  }

  /**
   * Record bounty outcome
   */
  recordOutcome(
    recordId: string,
    outcome: 'accepted' | 'rejected' | 'paid',
    feedback?: string
  ): void {
    const record = this.records.find(r => r.id === recordId);
    if (record) {
      record.status = outcome;
      record.completedAt = new Date();
      if (feedback) record.feedback = feedback;

      if (record.submittedAt) {
        record.duration = (Date.now() - record.submittedAt.getTime()) / (1000 * 60 * 60);
      }

      if (outcome === 'paid') {
        record.paidAt = new Date();
      }

      this.updateDailySnapshot();
      this.checkGoals();
      this.save();
    }
  }

  /**
   * Record payment received
   */
  recordPayment(recordId: string, amount: number): void {
    const record = this.records.find(r => r.id === recordId);
    if (record) {
      record.status = 'paid';
      record.reward = amount;
      record.paidAt = new Date();
      this.updateDailySnapshot();
      this.checkGoals();
      this.save();
    }
  }

  /**
   * Record outcome by bounty ID (for cases where we don't have recordId)
   */
  recordOutcomeByBountyId(
    bountyId: string,
    outcome: 'accepted' | 'rejected' | 'paid',
    revenue?: number,
    feedback?: string
  ): void {
    // Find the most recent record for this bounty
    const record = [...this.records]
      .reverse()
      .find(r => r.bountyId === bountyId);

    if (record) {
      record.status = outcome;
      record.completedAt = new Date();
      if (feedback) record.feedback = feedback;
      if (revenue !== undefined) record.reward = revenue;

      if (record.submittedAt) {
        record.duration = (Date.now() - record.submittedAt.getTime()) / (1000 * 60 * 60);
      }

      if (outcome === 'paid') {
        record.paidAt = new Date();
      }

      this.updateDailySnapshot();
      this.checkGoals();
      this.save();

      console.log(`[PortfolioTracker] Recorded ${outcome} for bounty ${bountyId}`);
    }
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get comprehensive portfolio statistics
   */
  getStats(): PortfolioStats {
    const completed = this.records.filter(r => r.status === 'accepted' || r.status === 'paid');
    const failed = this.records.filter(r => r.status === 'rejected');
    const pending = this.records.filter(r => r.status === 'pending' || r.status === 'submitted');
    const paid = this.records.filter(r => r.status === 'paid');

    // Revenue calculations
    const totalRevenue = paid.reduce((sum, r) => sum + r.reward, 0);
    const pendingRevenue = completed.filter(r => r.status === 'accepted')
      .reduce((sum, r) => sum + r.reward, 0);

    // Revenue by platform
    const revenueByPlatform: Record<string, number> = {};
    for (const record of paid) {
      revenueByPlatform[record.platform] = (revenueByPlatform[record.platform] || 0) + record.reward;
    }

    // Revenue by type
    const revenueByType: Record<string, number> = {};
    for (const record of paid) {
      revenueByType[record.type] = (revenueByType[record.type] || 0) + record.reward;
    }

    // Performance metrics
    const completionTimes = completed
      .filter(r => r.duration !== undefined)
      .map(r => r.duration!);

    const averageCompletionTime = completionTimes.length > 0
      ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
      : 0;

    const fastestCompletion = completionTimes.length > 0
      ? Math.min(...completionTimes)
      : 0;

    // Streak calculation
    const sortedRecords = [...this.records]
      .filter(r => r.status === 'accepted' || r.status === 'paid' || r.status === 'rejected')
      .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0));

    let streak = 0;
    for (const record of sortedRecords) {
      if (record.status === 'accepted' || record.status === 'paid') {
        streak++;
      } else {
        break;
      }
    }

    // Longest streak
    let longestStreak = 0;
    let currentStreak = 0;
    for (const record of sortedRecords.reverse()) {
      if (record.status === 'accepted' || record.status === 'paid') {
        currentStreak++;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    // Reputation score (0-100)
    const successRate = this.records.length > 0
      ? completed.length / (completed.length + failed.length)
      : 0;

    // Unique repos accepted from
    const acceptedRepos = new Set(completed.filter(r => r.repo).map(r => r.repo));

    // Reputation factors
    const volumeFactor = Math.min(1, this.records.length / 50); // Max at 50 bounties
    const successFactor = successRate;
    const streakFactor = Math.min(1, longestStreak / 10); // Max at 10 streak
    const diversityFactor = Math.min(1, acceptedRepos.size / 10); // Max at 10 repos

    const reputationScore = Math.round(
      (volumeFactor * 20 + successFactor * 40 + streakFactor * 20 + diversityFactor * 20)
    );

    return {
      totalBounties: this.records.length,
      completedBounties: completed.length,
      failedBounties: failed.length,
      pendingBounties: pending.length,
      successRate,

      totalRevenue,
      pendingRevenue,
      averageRevenuePerBounty: completed.length > 0 ? totalRevenue / completed.length : 0,
      revenueByPlatform,
      revenueByType,

      averageCompletionTime,
      fastestCompletion,
      streak,
      longestStreak,

      reputationScore,
      maintainerRelationships: acceptedRepos.size,
      repeatAcceptances: this.countRepeatAcceptances(),
    };
  }

  /**
   * Get performance trend
   */
  getTrend(period: 'daily' | 'weekly' | 'monthly'): PerformanceTrend {
    const data: PerformanceTrend['data'] = [];
    const now = new Date();
    const periods = period === 'daily' ? 30 : period === 'weekly' ? 12 : 6;

    for (let i = periods - 1; i >= 0; i--) {
      const periodStart = new Date(now);
      const periodEnd = new Date(now);

      if (period === 'daily') {
        periodStart.setDate(periodStart.getDate() - i - 1);
        periodEnd.setDate(periodEnd.getDate() - i);
      } else if (period === 'weekly') {
        periodStart.setDate(periodStart.getDate() - (i + 1) * 7);
        periodEnd.setDate(periodEnd.getDate() - i * 7);
      } else {
        periodStart.setMonth(periodStart.getMonth() - i - 1);
        periodEnd.setMonth(periodEnd.getMonth() - i);
      }

      const periodRecords = this.records.filter(r =>
        r.completedAt &&
        r.completedAt >= periodStart &&
        r.completedAt < periodEnd
      );

      const completed = periodRecords.filter(r => r.status === 'accepted' || r.status === 'paid');
      const failed = periodRecords.filter(r => r.status === 'rejected');
      const paid = periodRecords.filter(r => r.status === 'paid');

      data.push({
        date: periodStart.toISOString().split('T')[0],
        revenue: paid.reduce((sum, r) => sum + r.reward, 0),
        successRate: completed.length + failed.length > 0
          ? completed.length / (completed.length + failed.length)
          : 0,
        bounties: periodRecords.length,
      });
    }

    // Calculate trend
    const firstHalf = data.slice(0, Math.floor(data.length / 2));
    const secondHalf = data.slice(Math.floor(data.length / 2));

    const firstAvg = firstHalf.reduce((sum, d) => sum + d.successRate, 0) / firstHalf.length || 0;
    const secondAvg = secondHalf.reduce((sum, d) => sum + d.successRate, 0) / secondHalf.length || 0;

    const changePercent = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;
    const trend: PerformanceTrend['trend'] =
      changePercent > 5 ? 'improving' : changePercent < -5 ? 'declining' : 'stable';

    return { period, data, trend, changePercent };
  }

  /**
   * Count repeat acceptances (multiple PRs to same repo)
   */
  private countRepeatAcceptances(): number {
    const repoCount: Record<string, number> = {};
    for (const record of this.records) {
      if ((record.status === 'accepted' || record.status === 'paid') && record.repo) {
        repoCount[record.repo] = (repoCount[record.repo] || 0) + 1;
      }
    }
    return Object.values(repoCount).filter(c => c > 1).length;
  }

  // ===========================================================================
  // Goals
  // ===========================================================================

  /**
   * Set a new goal
   */
  setGoal(type: Goal['type'], target: number, deadline?: Date): string {
    const goal: Goal = {
      id: `goal-${Date.now()}`,
      type,
      target,
      current: this.getCurrentGoalValue(type),
      deadline,
      status: 'active',
      createdAt: new Date(),
    };

    this.goals.push(goal);
    this.save();
    return goal.id;
  }

  /**
   * Get current value for a goal type
   */
  private getCurrentGoalValue(type: Goal['type']): number {
    const stats = this.getStats();

    switch (type) {
      case 'revenue':
        return stats.totalRevenue;
      case 'bounties':
        return stats.completedBounties;
      case 'streak':
        return stats.streak;
      case 'reputation':
        return stats.reputationScore;
      default:
        return 0;
    }
  }

  /**
   * Check and update goal progress
   */
  private checkGoals(): void {
    for (const goal of this.goals) {
      if (goal.status !== 'active') continue;

      goal.current = this.getCurrentGoalValue(goal.type);

      if (goal.current >= goal.target) {
        goal.status = 'achieved';
        console.log(`[PortfolioTracker] 🎉 Goal achieved: ${goal.type} = ${goal.current}/${goal.target}`);
      } else if (goal.deadline && new Date() > goal.deadline) {
        goal.status = 'failed';
        console.log(`[PortfolioTracker] ❌ Goal failed: ${goal.type} = ${goal.current}/${goal.target}`);
      }
    }
  }

  /**
   * Get all goals
   */
  getGoals(): Goal[] {
    // Update current values
    for (const goal of this.goals) {
      if (goal.status === 'active') {
        goal.current = this.getCurrentGoalValue(goal.type);
      }
    }
    return this.goals;
  }

  // ===========================================================================
  // Daily Snapshots
  // ===========================================================================

  /**
   * Update daily snapshot
   */
  private updateDailySnapshot(): void {
    const today = new Date().toISOString().split('T')[0];

    const todayRecords = this.records.filter(r =>
      r.completedAt && r.completedAt.toISOString().split('T')[0] === today
    );

    const completed = todayRecords.filter(r => r.status === 'accepted' || r.status === 'paid');
    const failed = todayRecords.filter(r => r.status === 'rejected');
    const paid = todayRecords.filter(r => r.status === 'paid');
    const submitted = this.records.filter(r =>
      r.submittedAt && r.submittedAt.toISOString().split('T')[0] === today
    );

    // Find or create today's snapshot
    let snapshot = this.snapshots.find(s => s.date === today);
    if (!snapshot) {
      snapshot = {
        date: today,
        revenue: 0,
        submissions: 0,
        acceptances: 0,
        rejections: 0,
        successRate: 0,
      };
      this.snapshots.push(snapshot);
    }

    snapshot.revenue = paid.reduce((sum, r) => sum + r.reward, 0);
    snapshot.submissions = submitted.length;
    snapshot.acceptances = completed.length;
    snapshot.rejections = failed.length;
    snapshot.successRate = completed.length + failed.length > 0
      ? completed.length / (completed.length + failed.length)
      : 0;
  }

  // ===========================================================================
  // Reports
  // ===========================================================================

  /**
   * Generate a comprehensive portfolio report
   */
  generateReport(): string {
    const stats = this.getStats();
    const trend = this.getTrend('weekly');
    const goals = this.getGoals();

    const lines: string[] = [];

    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push('║                    GENESIS PORTFOLIO REPORT                   ║');
    lines.push('╚══════════════════════════════════════════════════════════════╝');
    lines.push('');

    // Overview
    lines.push('📊 OVERVIEW');
    lines.push('─'.repeat(50));
    lines.push(`Total Bounties:      ${stats.totalBounties}`);
    lines.push(`Completed:           ${stats.completedBounties} (${(stats.successRate * 100).toFixed(0)}% success)`);
    lines.push(`Failed:              ${stats.failedBounties}`);
    lines.push(`Pending:             ${stats.pendingBounties}`);
    lines.push('');

    // Revenue
    lines.push('💰 REVENUE');
    lines.push('─'.repeat(50));
    lines.push(`Total Earned:        $${stats.totalRevenue.toFixed(2)}`);
    lines.push(`Pending:             $${stats.pendingRevenue.toFixed(2)}`);
    lines.push(`Average/Bounty:      $${stats.averageRevenuePerBounty.toFixed(2)}`);
    lines.push('');

    if (Object.keys(stats.revenueByPlatform).length > 0) {
      lines.push('By Platform:');
      for (const [platform, amount] of Object.entries(stats.revenueByPlatform)) {
        lines.push(`  - ${platform}: $${amount.toFixed(2)}`);
      }
      lines.push('');
    }

    // Performance
    lines.push('🏆 PERFORMANCE');
    lines.push('─'.repeat(50));
    lines.push(`Current Streak:      ${stats.streak} ✓`);
    lines.push(`Longest Streak:      ${stats.longestStreak} ✓`);
    lines.push(`Avg Completion:      ${stats.averageCompletionTime.toFixed(1)}h`);
    lines.push(`Fastest:             ${stats.fastestCompletion.toFixed(1)}h`);
    lines.push('');

    // Reputation
    lines.push('⭐ REPUTATION');
    lines.push('─'.repeat(50));
    const repBar = '█'.repeat(Math.floor(stats.reputationScore / 10)) +
                   '░'.repeat(10 - Math.floor(stats.reputationScore / 10));
    lines.push(`Score:               [${repBar}] ${stats.reputationScore}/100`);
    lines.push(`Repo Relationships:  ${stats.maintainerRelationships}`);
    lines.push(`Repeat Acceptances:  ${stats.repeatAcceptances}`);
    lines.push('');

    // Trend
    lines.push('📈 TREND (Weekly)');
    lines.push('─'.repeat(50));
    const trendIcon = trend.trend === 'improving' ? '📈' :
                      trend.trend === 'declining' ? '📉' : '➡️';
    lines.push(`Direction:           ${trendIcon} ${trend.trend.toUpperCase()}`);
    lines.push(`Change:              ${trend.changePercent > 0 ? '+' : ''}${trend.changePercent.toFixed(1)}%`);
    lines.push('');

    // Goals
    const activeGoals = goals.filter(g => g.status === 'active');
    if (activeGoals.length > 0) {
      lines.push('🎯 ACTIVE GOALS');
      lines.push('─'.repeat(50));
      for (const goal of activeGoals) {
        const progress = goal.current / goal.target;
        const progressBar = '█'.repeat(Math.floor(progress * 10)) +
                           '░'.repeat(10 - Math.floor(progress * 10));
        lines.push(`${goal.type}: [${progressBar}] ${goal.current}/${goal.target}`);
      }
      lines.push('');
    }

    lines.push('═'.repeat(60));
    lines.push(`Generated: ${new Date().toISOString()}`);

    return lines.join('\n');
  }

  // ===========================================================================
  // Persistence
  // ===========================================================================

  private save(): void {
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = {
        records: this.records.map(r => ({
          ...r,
          submittedAt: r.submittedAt?.toISOString(),
          completedAt: r.completedAt?.toISOString(),
          paidAt: r.paidAt?.toISOString(),
        })),
        snapshots: this.snapshots,
        goals: this.goals.map(g => ({
          ...g,
          deadline: g.deadline?.toISOString(),
          createdAt: g.createdAt.toISOString(),
        })),
      };

      fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[PortfolioTracker] Failed to save:', error);
    }
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.persistPath)) return;

      const data = JSON.parse(fs.readFileSync(this.persistPath, 'utf-8'));

      if (data.records) {
        this.records = data.records.map((r: any) => ({
          ...r,
          submittedAt: r.submittedAt ? new Date(r.submittedAt) : undefined,
          completedAt: r.completedAt ? new Date(r.completedAt) : undefined,
          paidAt: r.paidAt ? new Date(r.paidAt) : undefined,
        }));
      }

      if (data.snapshots) {
        this.snapshots = data.snapshots;
      }

      if (data.goals) {
        this.goals = data.goals.map((g: any) => ({
          ...g,
          deadline: g.deadline ? new Date(g.deadline) : undefined,
          createdAt: new Date(g.createdAt),
        }));
      }

      console.log(`[PortfolioTracker] Loaded ${this.records.length} records, ${this.goals.length} goals`);
    } catch (error) {
      console.error('[PortfolioTracker] Failed to load:', error);
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let tracker: PortfolioTracker | null = null;

export function getPortfolioTracker(): PortfolioTracker {
  if (!tracker) {
    tracker = new PortfolioTracker();
  }
  return tracker;
}

export function resetPortfolioTracker(): void {
  tracker = null;
}
