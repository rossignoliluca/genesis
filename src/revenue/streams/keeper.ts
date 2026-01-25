/**
 * Keep3r Network Revenue Stream
 *
 * Integrates with Keep3r Network (or similar keeper networks) to perform
 * maintenance jobs for DeFi protocols. Keepers are rewarded for executing
 * time-sensitive functions like:
 * - Oracle updates
 * - Interest rate calculations
 * - Liquidation triggers
 * - Pool rebalancing
 *
 * SIMULATION MODE: Generates synthetic keeper jobs.
 */

import type {
  RevenueStream,
  RevenueTask,
  RevenueOpportunity,
  StreamStatus,
  RevenueTaskResult,
} from '../types.js';

// ============================================================================
// Keeper Job Types
// ============================================================================

interface KeeperJob {
  jobId: string;
  protocol: string;
  jobType: 'oracle' | 'liquidation-check' | 'interest-update' | 'rebalance';
  reward: number;
  gasCost: number;
  urgency: number;       // 0-1
  credits: number;       // Keep3r credits required
  interval: number;      // Job runs every N ms
  lastRun?: number;
}

const KEEPER_PROTOCOLS = [
  'Yearn Finance',
  'Harvest Finance',
  'Idle Finance',
  'Cream Finance',
] as const;

// ============================================================================
// Keeper Stream
// ============================================================================

export class KeeperStream {
  private stream: RevenueStream;
  private availableJobs: KeeperJob[] = [];
  private keeperCredits: number = 100; // Simulated Keep3r credits
  private jobIntervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.stream = {
      id: 'keeper-001',
      type: 'keeper',
      name: 'Keep3r Network Jobs',
      description: 'Executes maintenance jobs for DeFi protocols',
      enabled: false,
      status: 'idle',
      priority: 6,
      totalEarned: 0,
      totalCost: 0,
      roi: 0,
      successRate: 0.92,
      avgRevenue: 0,
      lastActive: Date.now(),
      minRevenueThreshold: 3.0,  // $3 minimum
      maxRiskTolerance: 0.25,     // Low-medium risk
      cooldownMs: 20000,          // Check every 20 seconds
      errorCount: 0,
      consecutiveFailures: 0,
    };

    // Initialize with some keeper jobs
    this.initializeJobs();
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  start(): void {
    if (this.stream.enabled) return;

    this.stream.enabled = true;
    this.stream.status = 'searching';
    this.stream.errorCount = 0;
    this.stream.consecutiveFailures = 0;

    // Start checking for jobs
    this.jobIntervalId = setInterval(
      () => this.checkForJobs(),
      this.stream.cooldownMs
    );
  }

  stop(): void {
    this.stream.enabled = false;
    this.stream.status = 'idle';

    if (this.jobIntervalId) {
      clearInterval(this.jobIntervalId);
      this.jobIntervalId = null;
    }
  }

  pause(): void {
    this.stream.status = 'paused';
  }

  resume(): void {
    if (this.stream.enabled) {
      this.stream.status = 'searching';
    }
  }

  // ==========================================================================
  // Job Management
  // ==========================================================================

  /**
   * Initialize keeper jobs pool.
   */
  private initializeJobs(): void {
    const jobTypes: KeeperJob['jobType'][] = [
      'oracle',
      'liquidation-check',
      'interest-update',
      'rebalance',
    ];

    for (let i = 0; i < 8; i++) {
      const protocol = KEEPER_PROTOCOLS[i % KEEPER_PROTOCOLS.length];
      const jobType = jobTypes[i % jobTypes.length];

      this.availableJobs.push({
        jobId: `keeper-job-${i + 1}`,
        protocol,
        jobType,
        reward: this.calculateReward(jobType),
        gasCost: this.calculateGasCost(jobType),
        urgency: 0.5 + Math.random() * 0.3,
        credits: this.calculateCredits(jobType),
        interval: this.calculateInterval(jobType),
      });
    }
  }

  private calculateReward(jobType: KeeperJob['jobType']): number {
    const baseRewards = {
      oracle: 8,
      'liquidation-check': 12,
      'interest-update': 6,
      rebalance: 15,
    };
    return baseRewards[jobType] + Math.random() * 5;
  }

  private calculateGasCost(jobType: KeeperJob['jobType']): number {
    const baseCosts = {
      oracle: 2,
      'liquidation-check': 3,
      'interest-update': 1.5,
      rebalance: 4,
    };
    return baseCosts[jobType] + Math.random() * 2;
  }

  private calculateCredits(jobType: KeeperJob['jobType']): number {
    const baseCredits = {
      oracle: 5,
      'liquidation-check': 8,
      'interest-update': 3,
      rebalance: 10,
    };
    return baseCredits[jobType];
  }

  private calculateInterval(jobType: KeeperJob['jobType']): number {
    const intervals = {
      oracle: 60000,        // 1 minute
      'liquidation-check': 30000, // 30 seconds
      'interest-update': 300000,  // 5 minutes
      rebalance: 120000,    // 2 minutes
    };
    return intervals[jobType];
  }

  /**
   * Check which jobs need to be executed.
   */
  private async checkForJobs(): Promise<void> {
    if (this.stream.status !== 'searching') return;

    const now = Date.now();

    // Update job availability based on intervals
    for (const job of this.availableJobs) {
      if (!job.lastRun || now - job.lastRun >= job.interval) {
        // Job is ready to run
        // Add some randomness to simulate network conditions
        job.urgency = 0.5 + Math.random() * 0.5;
        job.reward = this.calculateReward(job.jobType);
        job.gasCost = this.calculateGasCost(job.jobType);
      }
    }

    // Simulate earning Keep3r credits over time
    this.keeperCredits = Math.min(150, this.keeperCredits + 0.5);
  }

  // ==========================================================================
  // Opportunity Conversion
  // ==========================================================================

  /**
   * Get executable keeper jobs as revenue opportunities.
   */
  getOpportunities(): RevenueOpportunity[] {
    const now = Date.now();

    return this.availableJobs
      .filter(job => {
        // Job must be ready to run
        if (job.lastRun && now - job.lastRun < job.interval) {
          return false;
        }

        // Must have enough credits
        if (job.credits > this.keeperCredits) {
          return false;
        }

        // Must meet minimum revenue threshold
        const netRevenue = job.reward - job.gasCost;
        return netRevenue >= this.stream.minRevenueThreshold;
      })
      .map(job => this.jobToOpportunity(job));
  }

  private jobToOpportunity(job: KeeperJob): RevenueOpportunity {
    const revenue = job.reward;
    const cost = job.gasCost;
    const roi = (revenue - cost) / cost;

    // Time window is the job interval
    const timeWindow = job.lastRun
      ? job.interval - (Date.now() - job.lastRun)
      : job.interval;

    return {
      id: job.jobId,
      source: 'keeper',
      type: job.jobType,
      estimatedRevenue: revenue,
      estimatedCost: cost,
      estimatedRoi: roi,
      risk: 0.15 + job.urgency * 0.15, // Low risk for keeper jobs
      confidence: 0.85 + Math.random() * 0.1, // 0.85-0.95
      timeWindow: Math.max(0, timeWindow),
      requirements: ['keeper-bond', 'gas-funds', 'job-credentials'],
      metadata: {
        protocol: job.protocol,
        jobType: job.jobType,
        creditsRequired: job.credits,
        urgency: job.urgency,
      },
    };
  }

  // ==========================================================================
  // Task Execution
  // ==========================================================================

  /**
   * Execute a keeper job.
   */
  async executeTask(task: RevenueTask): Promise<RevenueTaskResult> {
    this.stream.status = 'executing';
    this.stream.currentTask = task;
    this.stream.lastActive = Date.now();

    const startTime = Date.now();

    try {
      // Find the job
      const job = this.availableJobs.find(j => j.jobId === task.id);
      if (!job) {
        throw new Error('Job not found');
      }

      // Simulate execution time (300ms-1.5s)
      const executionTime = 300 + Math.random() * 1200;
      await this.delay(executionTime);

      // Success rate based on urgency (higher urgency = higher competition)
      const baseSuccessRate = 0.92;
      const urgencyPenalty = job.urgency * 0.15;
      const successChance = baseSuccessRate - urgencyPenalty;

      const success = Math.random() < successChance;

      if (success) {
        // Success: job executed, earn reward
        const actualRevenue = task.estimatedRevenue * (0.95 + Math.random() * 0.1);
        const actualCost = task.estimatedCost * (0.95 + Math.random() * 0.1);

        // Spend credits
        this.keeperCredits -= job.credits;

        // Update stream metrics
        this.stream.totalEarned += actualRevenue;
        this.stream.totalCost += actualCost;
        this.stream.roi = (this.stream.totalEarned - this.stream.totalCost) / this.stream.totalCost;
        this.stream.consecutiveFailures = 0;

        // Update success rate
        this.stream.successRate = this.stream.successRate * 0.95 + 0.05;

        // Mark job as run
        job.lastRun = Date.now();

        this.stream.status = 'searching';
        this.stream.currentTask = undefined;

        return {
          success: true,
          actualRevenue,
          actualCost,
          duration: Date.now() - startTime,
          metadata: {
            jobType: job.jobType,
            protocol: job.protocol,
            creditsSpent: job.credits,
          },
        };
      } else {
        // Failure: job failed or was taken by another keeper
        const actualCost = task.estimatedCost * (0.8 + Math.random() * 0.3);

        // Still spend credits (attempted)
        this.keeperCredits -= Math.floor(job.credits * 0.5);

        this.stream.totalCost += actualCost;
        this.stream.consecutiveFailures++;
        this.stream.errorCount++;

        // Update success rate
        this.stream.successRate = this.stream.successRate * 0.95;

        this.stream.status = 'searching';
        this.stream.currentTask = undefined;

        return {
          success: false,
          actualRevenue: 0,
          actualCost,
          duration: Date.now() - startTime,
          error: 'Job execution failed: another keeper was faster',
          metadata: {
            jobType: job.jobType,
            reason: 'competition',
          },
        };
      }
    } catch (error) {
      this.stream.status = 'error';
      this.stream.errorCount++;
      this.stream.consecutiveFailures++;
      this.stream.currentTask = undefined;

      return {
        success: false,
        actualRevenue: 0,
        actualCost: task.estimatedCost * 0.5,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Stream Interface
  // ==========================================================================

  getStream(): RevenueStream {
    return { ...this.stream };
  }

  getStatus(): StreamStatus {
    return this.stream.status;
  }

  isEnabled(): boolean {
    return this.stream.enabled;
  }

  setPriority(priority: number): void {
    this.stream.priority = Math.max(1, Math.min(10, priority));
  }

  getMetrics() {
    const readyJobs = this.availableJobs.filter(job => {
      const now = Date.now();
      return !job.lastRun || now - job.lastRun >= job.interval;
    }).length;

    return {
      totalEarned: this.stream.totalEarned,
      totalCost: this.stream.totalCost,
      roi: this.stream.roi,
      successRate: this.stream.successRate,
      avgRevenue: this.stream.avgRevenue,
      keeperCredits: this.keeperCredits,
      totalJobs: this.availableJobs.length,
      readyJobs,
      consecutiveFailures: this.stream.consecutiveFailures,
    };
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
