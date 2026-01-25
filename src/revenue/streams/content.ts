/**
 * Content Generation Revenue Stream
 *
 * Generates revenue by creating content for clients:
 * - Technical articles and documentation
 * - Code examples and tutorials
 * - Research reports and analysis
 * - Creative writing (stories, marketing copy)
 *
 * Jobs can be accepted from:
 * - Content marketplaces
 * - Direct client requests
 * - Subscription-based clients
 *
 * SIMULATION MODE: Generates synthetic content jobs.
 */

import type {
  RevenueStream,
  RevenueTask,
  RevenueOpportunity,
  ContentJob,
  StreamStatus,
  RevenueTaskResult,
} from '../types.js';

// ============================================================================
// Content Job Marketplace
// ============================================================================

const CONTENT_TOPICS = [
  'Machine Learning Best Practices',
  'Web3 Development Guide',
  'Rust Programming Tutorial',
  'Data Science Workflow',
  'Cloud Architecture Patterns',
  'DeFi Security Analysis',
  'TypeScript Advanced Patterns',
  'API Design Principles',
] as const;

const CLIENT_TYPES = [
  'tech-blog',
  'startup',
  'enterprise',
  'educational',
  'marketing-agency',
] as const;

// ============================================================================
// Content Stream
// ============================================================================

export class ContentStream {
  private stream: RevenueStream;
  private availableJobs: ContentJob[] = [];
  private jobIntervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.stream = {
      id: 'content-001',
      type: 'content',
      name: 'Content Generation',
      description: 'Creates technical and creative content for clients',
      enabled: false,
      status: 'idle',
      priority: 5,
      totalEarned: 0,
      totalCost: 0,
      roi: 0,
      successRate: 0.88,
      avgRevenue: 0,
      lastActive: Date.now(),
      minRevenueThreshold: 10.0,  // $10 minimum
      maxRiskTolerance: 0.4,       // Medium risk - quality dependent
      cooldownMs: 30000,           // Check every 30 seconds
      errorCount: 0,
      consecutiveFailures: 0,
    };
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

    // Start polling for content jobs
    this.jobIntervalId = setInterval(
      () => this.pollForJobs(),
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
  // Job Polling
  // ==========================================================================

  /**
   * Poll marketplace for content jobs.
   * In simulation mode, generates synthetic jobs.
   */
  private async pollForJobs(): Promise<void> {
    if (this.stream.status !== 'searching') return;

    try {
      // Simulate network latency
      await this.delay(Math.random() * 150 + 50);

      // Generate new jobs (25% chance per poll)
      if (Math.random() < 0.25) {
        const job = this.generateContentJob();
        this.availableJobs.push(job);
      }

      // Clean up expired jobs
      const now = Date.now();
      this.availableJobs = this.availableJobs.filter(
        job => !job.deadline || job.deadline > now
      );

      // Limit to 10 jobs in queue
      if (this.availableJobs.length > 10) {
        this.availableJobs = this.availableJobs.slice(-10);
      }
    } catch (error) {
      this.stream.errorCount++;
      this.stream.status = 'error';
    }
  }

  /**
   * Generate a synthetic content job.
   */
  private generateContentJob(): ContentJob {
    const contentType = this.randomChoice<ContentJob['contentType']>([
      'article',
      'code',
      'analysis',
      'report',
      'creative',
    ]);

    const topic = CONTENT_TOPICS[Math.floor(Math.random() * CONTENT_TOPICS.length)];
    const client = this.generateClientId();

    const wordCount = this.calculateWordCount(contentType);
    const payment = this.calculatePayment(contentType, wordCount);
    const complexity = this.calculateComplexity(contentType, wordCount);

    // Some jobs have upfront payment
    const hasUpfront = Math.random() < 0.3;
    const upfrontPayment = hasUpfront ? payment * 0.5 : undefined;

    return {
      jobId: `content-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      client,
      contentType,
      topic,
      requirements: this.generateRequirements(contentType),
      wordCount,
      deadline: Date.now() + this.calculateDeadline(wordCount),
      payment,
      upfrontPayment,
      complexity,
    };
  }

  private randomChoice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  private generateClientId(): string {
    const type = CLIENT_TYPES[Math.floor(Math.random() * CLIENT_TYPES.length)];
    return `${type}-${Math.random().toString(36).slice(2, 6)}`;
  }

  private calculateWordCount(contentType: ContentJob['contentType']): number {
    const ranges = {
      article: [800, 2000],
      code: [300, 1000],      // Lines of code equivalent
      analysis: [1200, 2500],
      report: [1500, 3000],
      creative: [500, 1500],
    };

    const [min, max] = ranges[contentType];
    return Math.floor(Math.random() * (max - min) + min);
  }

  private calculatePayment(contentType: ContentJob['contentType'], wordCount: number): number {
    // Different rates per word for different content types
    const ratesPerWord = {
      article: 0.08,
      code: 0.15,         // Higher rate for code
      analysis: 0.12,
      report: 0.10,
      creative: 0.06,
    };

    const basePayment = wordCount * ratesPerWord[contentType];

    // Add variance
    const variance = 0.8 + Math.random() * 0.4; // 0.8x - 1.2x
    return basePayment * variance;
  }

  private calculateComplexity(contentType: ContentJob['contentType'], wordCount: number): number {
    let complexity = 0;

    // Base complexity by type
    const baseComplexity = {
      article: 0.3,
      code: 0.6,
      analysis: 0.7,
      report: 0.5,
      creative: 0.4,
    };

    complexity = baseComplexity[contentType];

    // Adjust for length
    if (wordCount > 2000) complexity += 0.15;
    if (wordCount > 2500) complexity += 0.1;

    return Math.min(1, complexity);
  }

  private calculateDeadline(wordCount: number): number {
    // Base: 500 words per hour
    const hoursNeeded = wordCount / 500;
    const msNeeded = hoursNeeded * 3600000;

    // Add buffer time (2x-3x the production time)
    const buffer = 2 + Math.random();
    return msNeeded * buffer;
  }

  private generateRequirements(contentType: ContentJob['contentType']): string[] {
    const common = ['original-content', 'fact-checking'];

    const specific = {
      article: ['seo-optimized', 'citations'],
      code: ['runnable-examples', 'documentation'],
      analysis: ['data-sources', 'visualizations'],
      report: ['executive-summary', 'citations'],
      creative: ['engaging-narrative', 'brand-voice'],
    };

    return [...common, ...specific[contentType]];
  }

  // ==========================================================================
  // Opportunity Conversion
  // ==========================================================================

  /**
   * Get available content jobs as revenue opportunities.
   */
  getOpportunities(): RevenueOpportunity[] {
    return this.availableJobs
      .filter(job => job.payment >= this.stream.minRevenueThreshold)
      .map(job => this.jobToOpportunity(job));
  }

  private jobToOpportunity(job: ContentJob): RevenueOpportunity {
    const revenue = job.payment;

    // Cost is primarily LLM inference cost
    // Estimate: $0.02 per 1000 words for input+output
    const words = job.wordCount || 1000;
    const llmCost = (words / 1000) * 0.02 * (1.5 + job.complexity);

    const cost = llmCost + 1.0; // Base operational cost

    const roi = (revenue - cost) / cost;
    const timeWindow = job.deadline ? job.deadline - Date.now() : 86400000;

    return {
      id: job.jobId,
      source: 'content',
      type: job.contentType,
      estimatedRevenue: revenue,
      estimatedCost: cost,
      estimatedRoi: roi,
      risk: job.complexity * 0.5, // Quality risk
      confidence: 0.75 + (1 - job.complexity) * 0.2, // 0.75-0.95
      timeWindow,
      requirements: ['llm-access', 'fact-checking', 'quality-review'],
      metadata: {
        client: job.client,
        topic: job.topic,
        wordCount: job.wordCount,
        requirements: job.requirements,
        upfrontPayment: job.upfrontPayment,
      },
    };
  }

  // ==========================================================================
  // Task Execution
  // ==========================================================================

  /**
   * Execute a content generation job.
   * Simulates the content creation process.
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

      // Simulate content generation time
      // Estimate: 500 words per second (simulated LLM speed)
      const words = job.wordCount || 1000;
      const baseTime = (words / 500) * 1000;
      const complexityMultiplier = 1 + job.complexity;
      const executionTime = baseTime * complexityMultiplier + Math.random() * 500;

      await this.delay(executionTime);

      // Success rate depends on complexity
      const baseSuccessRate = 0.88;
      const complexityPenalty = job.complexity * 0.2;
      const successChance = baseSuccessRate - complexityPenalty;

      const success = Math.random() < successChance;

      if (success) {
        // Success: content delivered and accepted
        let actualRevenue = task.estimatedRevenue;

        // Quality bonus/penalty
        const quality = 0.85 + Math.random() * 0.15; // 0.85-1.0
        if (quality > 0.95) {
          actualRevenue *= 1.1; // 10% bonus for excellent quality
        }

        const actualCost = task.estimatedCost * (0.9 + Math.random() * 0.2);

        // Update stream metrics
        this.stream.totalEarned += actualRevenue;
        this.stream.totalCost += actualCost;
        this.stream.roi = (this.stream.totalEarned - this.stream.totalCost) / this.stream.totalCost;
        this.stream.consecutiveFailures = 0;

        // Update success rate
        this.stream.successRate = this.stream.successRate * 0.95 + 0.05;

        this.stream.status = 'searching';
        this.stream.currentTask = undefined;

        // Remove job from available
        this.availableJobs = this.availableJobs.filter(j => j.jobId !== job.jobId);

        return {
          success: true,
          actualRevenue,
          actualCost,
          duration: Date.now() - startTime,
          metadata: {
            contentType: job.contentType,
            wordCount: job.wordCount,
            quality,
          },
        };
      } else {
        // Failure: content rejected or below quality threshold
        const actualCost = task.estimatedCost * 0.7; // Partial cost

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
          error: 'Content rejected: quality below client expectations',
          metadata: {
            contentType: job.contentType,
            reason: 'quality-rejection',
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
    return {
      totalEarned: this.stream.totalEarned,
      totalCost: this.stream.totalCost,
      roi: this.stream.roi,
      successRate: this.stream.successRate,
      avgRevenue: this.stream.avgRevenue,
      availableJobs: this.availableJobs.length,
      consecutiveFailures: this.stream.consecutiveFailures,
    };
  }

  getAvailableJobs(): ContentJob[] {
    return [...this.availableJobs];
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
