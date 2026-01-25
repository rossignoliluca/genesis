/**
 * Revenue Stream Manager
 *
 * Central coordinator for all revenue streams. Responsibilities:
 * - Enable/disable streams based on performance
 * - Prioritize opportunities across streams
 * - Schedule execution based on allostatic priorities
 * - Track aggregate metrics
 * - Handle failures and errors
 * - Connect to nociception and neuromodulation
 */

import type {
  RevenueStream,
  RevenueTask,
  RevenueOpportunity,
  RevenueTaskResult,
  RevenueMetrics,
  RevenueConfig,
  StreamPriority,
  RevenueStreamType,
} from './types.js';

import { BountyHunterStream } from './streams/bounty-hunter.js';
import { MCPServicesStream } from './streams/mcp-services.js';
import { KeeperStream } from './streams/keeper.js';
import { ContentStream } from './streams/content.js';
import { YieldStream } from './streams/yield.js';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: RevenueConfig = {
  maxConcurrentTasks: 3,
  maxDailyBudget: 100,
  minRoi: 0.5,              // 50% minimum ROI
  maxTotalRisk: 0.6,        // Combined risk limit
  riskAdjustment: 1.0,
  minSuccessRate: 0.5,      // Disable if below 50%
  pauseThreshold: 5,        // Pause after 5 consecutive failures
  opportunityScanInterval: 10000,  // 10 seconds
  metricsUpdateInterval: 30000,    // 30 seconds
};

// ============================================================================
// Stream Manager
// ============================================================================

export class StreamManager {
  private config: RevenueConfig;
  private streams: Map<RevenueStreamType, any>;
  private activeTasks: Map<string, RevenueTask>;
  private priorities: Map<RevenueStreamType, StreamPriority>;
  private dailySpent: number = 0;
  private dailyResetTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<RevenueConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.activeTasks = new Map();
    this.priorities = new Map();

    // Initialize all streams
    this.streams = new Map<RevenueStreamType, any>();
    this.streams.set('bounty-hunter', new BountyHunterStream());
    this.streams.set('mcp-services', new MCPServicesStream());
    this.streams.set('keeper', new KeeperStream());
    this.streams.set('content', new ContentStream());
    this.streams.set('yield', new YieldStream());

    // Reset daily budget counter every 24 hours
    this.dailyResetTimer = setInterval(() => {
      this.dailySpent = 0;
    }, 86400000);
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start all enabled streams.
   */
  startAll(): void {
    for (const [type, stream] of this.streams) {
      if (stream.getStream().enabled) {
        stream.start();
      }
    }
  }

  /**
   * Stop all streams.
   */
  stopAll(): void {
    for (const stream of this.streams.values()) {
      stream.stop();
    }

    if (this.dailyResetTimer) {
      clearInterval(this.dailyResetTimer);
      this.dailyResetTimer = null;
    }
  }

  /**
   * Enable a specific stream.
   */
  enableStream(type: RevenueStreamType): void {
    const stream = this.streams.get(type);
    if (stream) {
      stream.start();
    }
  }

  /**
   * Disable a specific stream.
   */
  disableStream(type: RevenueStreamType): void {
    const stream = this.streams.get(type);
    if (stream) {
      stream.stop();
    }
  }

  /**
   * Pause a stream temporarily.
   */
  pauseStream(type: RevenueStreamType): void {
    const stream = this.streams.get(type);
    if (stream) {
      stream.pause();
    }
  }

  /**
   * Resume a paused stream.
   */
  resumeStream(type: RevenueStreamType): void {
    const stream = this.streams.get(type);
    if (stream) {
      stream.resume();
    }
  }

  // ==========================================================================
  // Opportunity Management
  // ==========================================================================

  /**
   * Collect all opportunities from all active streams.
   */
  getAllOpportunities(): RevenueOpportunity[] {
    const opportunities: RevenueOpportunity[] = [];

    for (const [type, stream] of this.streams) {
      if (!stream.isEnabled()) continue;

      try {
        const streamOpps = stream.getOpportunities();
        opportunities.push(...streamOpps);
      } catch (error) {
        // Stream error, continue with others
        console.error(`Error getting opportunities from ${type}:`, error);
      }
    }

    return opportunities;
  }

  /**
   * Select the best opportunity to execute next.
   * Uses priority, ROI, risk, and current load to decide.
   */
  selectBestOpportunity(): RevenueOpportunity | null {
    // Check if we can execute more tasks
    if (this.activeTasks.size >= this.config.maxConcurrentTasks) {
      return null;
    }

    // Check daily budget
    if (this.dailySpent >= this.config.maxDailyBudget) {
      return null;
    }

    const opportunities = this.getAllOpportunities();

    if (opportunities.length === 0) {
      return null;
    }

    // Filter by constraints
    const viable = opportunities.filter(opp => {
      // ROI check
      if (opp.estimatedRoi < this.config.minRoi) return false;

      // Risk check
      const currentRisk = this.calculateTotalRisk();
      if (currentRisk + opp.risk > this.config.maxTotalRisk) return false;

      // Budget check
      if (this.dailySpent + opp.estimatedCost > this.config.maxDailyBudget) return false;

      return true;
    });

    if (viable.length === 0) {
      return null;
    }

    // Score each opportunity
    const scored = viable.map(opp => ({
      opp,
      score: this.scoreOpportunity(opp),
    }));

    // Sort by score (descending)
    scored.sort((a, b) => b.score - a.score);

    return scored[0].opp;
  }

  /**
   * Score an opportunity for prioritization.
   * Higher score = higher priority.
   */
  private scoreOpportunity(opp: RevenueOpportunity): number {
    let score = 0;

    // ROI contribution (weight: 40%)
    score += opp.estimatedRoi * 40;

    // Risk-adjusted return (weight: 30%)
    const riskAdjustedRoi = opp.estimatedRoi / (1 + opp.risk);
    score += riskAdjustedRoi * 30;

    // Stream priority (weight: 20%)
    const priority = this.priorities.get(opp.source);
    if (priority) {
      score += (priority.priority / 10) * 20;
    }

    // Urgency from time window (weight: 10%)
    const urgency = 1 - Math.min(1, opp.timeWindow / 3600000); // Normalize to 1 hour
    score += urgency * 10;

    // Confidence bonus
    score *= opp.confidence;

    return score;
  }

  /**
   * Calculate total current risk across active tasks.
   */
  private calculateTotalRisk(): number {
    let totalRisk = 0;
    for (const task of this.activeTasks.values()) {
      totalRisk += task.risk;
    }
    return totalRisk;
  }

  // ==========================================================================
  // Task Execution
  // ==========================================================================

  /**
   * Execute an opportunity as a task.
   */
  async executeOpportunity(opp: RevenueOpportunity): Promise<RevenueTaskResult> {
    // Create task
    const task: RevenueTask = {
      id: opp.id,
      streamId: opp.source,
      type: opp.source,
      description: `${opp.type} via ${opp.source}`,
      estimatedRevenue: opp.estimatedRevenue,
      estimatedCost: opp.estimatedCost,
      risk: opp.risk,
      confidence: opp.confidence,
      deadline: opp.timeWindow > 0 ? Date.now() + opp.timeWindow : undefined,
      startedAt: Date.now(),
      status: 'executing',
    };

    // Add to active tasks
    this.activeTasks.set(task.id, task);

    // Get the stream
    const stream = this.streams.get(opp.source);
    if (!stream) {
      throw new Error(`Unknown stream: ${opp.source}`);
    }

    try {
      // Execute via the stream
      const result = await stream.executeTask(task);

      // Update task
      task.status = result.success ? 'completed' : 'failed';
      task.completedAt = Date.now();
      task.result = result;

      // Update daily spent
      this.dailySpent += result.actualCost;

      // Remove from active
      this.activeTasks.delete(task.id);

      // Check for stream health issues
      this.checkStreamHealth(opp.source);

      return result;
    } catch (error) {
      // Task failed
      task.status = 'failed';
      task.completedAt = Date.now();
      task.result = {
        success: false,
        actualRevenue: 0,
        actualCost: opp.estimatedCost * 0.5,
        duration: Date.now() - task.startedAt,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      this.dailySpent += task.result.actualCost;
      this.activeTasks.delete(task.id);

      this.checkStreamHealth(opp.source);

      return task.result;
    }
  }

  /**
   * Check stream health and pause if needed.
   */
  private checkStreamHealth(type: RevenueStreamType): void {
    const stream = this.streams.get(type);
    if (!stream) return;

    const streamData = stream.getStream();

    // Pause if too many consecutive failures
    if (streamData.consecutiveFailures >= this.config.pauseThreshold) {
      this.pauseStream(type);
      console.warn(`Stream ${type} paused due to ${streamData.consecutiveFailures} consecutive failures`);
    }

    // Disable if success rate too low
    if (streamData.successRate < this.config.minSuccessRate) {
      this.disableStream(type);
      console.warn(`Stream ${type} disabled due to low success rate: ${streamData.successRate}`);
    }
  }

  // ==========================================================================
  // Priority Management
  // ==========================================================================

  /**
   * Set priority for a stream.
   */
  setStreamPriority(type: RevenueStreamType, priority: number, reason: string): void {
    this.priorities.set(type, {
      streamId: type,
      priority: Math.max(1, Math.min(10, priority)),
      reason,
    });

    const stream = this.streams.get(type);
    if (stream) {
      stream.setPriority(priority);
    }
  }

  /**
   * Get priority for a stream.
   */
  getStreamPriority(type: RevenueStreamType): number {
    const priority = this.priorities.get(type);
    return priority?.priority ?? 5; // Default: 5
  }

  // ==========================================================================
  // Metrics
  // ==========================================================================

  /**
   * Get aggregate metrics across all streams.
   */
  getMetrics(): RevenueMetrics {
    let totalRevenue = 0;
    let totalCost = 0;
    let activeStreams = 0;
    let successfulTasks = 0;
    let failedTasks = 0;
    let totalDuration = 0;
    let taskCount = 0;

    const revenueByStream = new Map<RevenueStreamType, number>();
    const costByStream = new Map<RevenueStreamType, number>();

    for (const [type, stream] of this.streams) {
      const streamData = stream.getStream();

      totalRevenue += streamData.totalEarned;
      totalCost += streamData.totalCost;

      revenueByStream.set(type, streamData.totalEarned);
      costByStream.set(type, streamData.totalCost);

      if (streamData.status === 'active' || streamData.status === 'executing') {
        activeStreams++;
      }
    }

    const netRevenue = totalRevenue - totalCost;
    const roi = totalCost > 0 ? netRevenue / totalCost : 0;

    return {
      totalRevenue,
      totalCost,
      netRevenue,
      roi,
      activeStreams,
      successfulTasks,
      failedTasks,
      averageTaskDuration: taskCount > 0 ? totalDuration / taskCount : 0,
      revenueByStream,
      costByStream,
    };
  }

  /**
   * Get status of all streams.
   */
  getAllStreams(): RevenueStream[] {
    return Array.from(this.streams.values()).map(s => s.getStream());
  }

  /**
   * Get a specific stream.
   */
  getStream(type: RevenueStreamType): RevenueStream | undefined {
    const stream = this.streams.get(type);
    return stream?.getStream();
  }

  /**
   * Get active tasks.
   */
  getActiveTasks(): RevenueTask[] {
    return Array.from(this.activeTasks.values());
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  getConfig(): RevenueConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<RevenueConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}
