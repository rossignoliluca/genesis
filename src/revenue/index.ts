/**
 * Genesis Revenue Module
 *
 * Autonomous revenue generation system for Genesis economy.
 *
 * Features:
 * - Multiple revenue streams (DeFi, MCP services, content, etc.)
 * - Priority-based execution via allostasis
 * - Risk management and ROI optimization
 * - Integration with economic fiber for cost tracking
 * - Pain/reward signals for nociception/neuromodulation
 *
 * Usage:
 * ```typescript
 * import { createRevenueSystem } from './revenue/index.js';
 *
 * const revenue = createRevenueSystem();
 * revenue.start();
 *
 * // Execute revenue opportunities
 * const opportunity = revenue.selectBestOpportunity();
 * if (opportunity) {
 *   const result = await revenue.executeOpportunity(opportunity);
 *   console.log('Revenue:', result.actualRevenue);
 * }
 * ```
 */

// ============================================================================
// Exports
// ============================================================================

// Types
export type {
  // Core types
  RevenueStreamType,
  StreamStatus,
  RevenueStream,
  RevenueTask,
  RevenueTaskResult,
  RevenueOpportunity,

  // DeFi types
  DeFiBounty,
  YieldPosition,

  // MCP types
  MCPServiceListing,
  MCPServiceRequest,

  // Content types
  ContentJob,

  // Manager types
  RevenueMetrics,
  StreamPriority,
  RevenueConfig,

  // Event types
  RevenueEvent,
  RevenueTaskStartedEvent,
  RevenueTaskCompletedEvent,
  RevenueTaskFailedEvent,
  OpportunityFoundEvent,
  StreamStatusChangedEvent,
  RevenueMilestoneEvent,
} from './types.js';

// Core classes
export { StreamManager } from './stream-manager.js';
export { RevenueBusWiring, wireRevenueModule } from './bus-wiring.js';

// Individual streams
export { BountyHunterStream } from './streams/bounty-hunter.js';
export { MCPServicesStream } from './streams/mcp-services.js';
export { KeeperStream } from './streams/keeper.js';
export { ContentStream } from './streams/content.js';
export { YieldStream } from './streams/yield.js';

// Revenue Activation (v19.0.0)
export {
  RevenueActivationManager,
  getRevenueActivation,
  resetRevenueActivation,
  SERVICE_CATALOG,
  MCP_TOOL_PRICING,
  DEFAULT_ACTIVATION_CONFIG,
  type RevenueActivationConfig,
  type RevenueMetrics as ActivationMetrics,
  type RevenueOpportunity as ActivationOpportunity,
  type ServiceOffering,
} from './activation.js';

// Revenue CLI (v19.0.0)
export {
  handleRevenueCommand,
  showStatus,
  activateRevenue,
  listOpportunities,
  listServices,
  listToolPricing,
  projectRevenue,
} from './cli.js';

// Service Endpoint (v19.0.0)
export {
  createServiceEndpoint,
  getServiceRequests,
  getServiceRequest,
  updateServiceRequest,
  type ServiceRequest,
  type ServiceQuote,
  type ServiceEndpointConfig,
} from './service-endpoint.js';

// ============================================================================
// Revenue System Facade
// ============================================================================

import { StreamManager } from './stream-manager.js';
import { wireRevenueModule, type RevenueBusWiring } from './bus-wiring.js';
import type { RevenueOpportunity, RevenueTaskResult, RevenueConfig } from './types.js';

/**
 * High-level facade for the revenue system.
 * Combines StreamManager with event bus wiring.
 */
export class RevenueSystem {
  private manager: StreamManager;
  private wiring: RevenueBusWiring;
  private runLoopTimer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<RevenueConfig>) {
    this.manager = new StreamManager(config);
    this.wiring = wireRevenueModule(this.manager);
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start the revenue system.
   * Enables all streams and begins autonomous operation.
   */
  start(): void {
    this.manager.startAll();

    // Start autonomous run loop (scan and execute opportunities)
    const config = this.manager.getConfig();
    this.runLoopTimer = setInterval(
      () => this.autonomousLoop(),
      config.opportunityScanInterval
    );

    // Start metrics publishing
    this.metricsTimer = setInterval(
      () => this.wiring.publishMetrics(),
      config.metricsUpdateInterval
    );
  }

  /**
   * Stop the revenue system.
   */
  stop(): void {
    this.manager.stopAll();

    if (this.runLoopTimer) {
      clearInterval(this.runLoopTimer);
      this.runLoopTimer = null;
    }

    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }

    this.wiring.shutdown();
  }

  // ==========================================================================
  // Autonomous Operation
  // ==========================================================================

  /**
   * Main autonomous loop: select and execute best opportunity.
   */
  private async autonomousLoop(): Promise<void> {
    try {
      const opportunity = this.selectBestOpportunity();
      if (opportunity) {
        // Publish that we found an opportunity
        this.wiring.publishOpportunityFound(opportunity);

        // Execute it
        await this.executeOpportunity(opportunity);
      }
    } catch (error) {
      console.error('Error in revenue autonomous loop:', error);
    }
  }

  // ==========================================================================
  // Manual Control
  // ==========================================================================

  /**
   * Get the best opportunity to execute.
   */
  selectBestOpportunity(): RevenueOpportunity | null {
    return this.manager.selectBestOpportunity();
  }

  /**
   * Get all available opportunities.
   */
  getAllOpportunities(): RevenueOpportunity[] {
    return this.manager.getAllOpportunities();
  }

  /**
   * Execute a specific opportunity.
   */
  async executeOpportunity(opportunity: RevenueOpportunity): Promise<RevenueTaskResult> {
    // Create task from opportunity
    const task = {
      id: opportunity.id,
      streamId: opportunity.source,
      type: opportunity.source,
      description: `${opportunity.type} via ${opportunity.source}`,
      estimatedRevenue: opportunity.estimatedRevenue,
      estimatedCost: opportunity.estimatedCost,
      risk: opportunity.risk,
      confidence: opportunity.confidence,
      deadline: opportunity.timeWindow > 0 ? Date.now() + opportunity.timeWindow : undefined,
      startedAt: Date.now(),
      status: 'pending' as const,
    };

    // Publish task started
    this.wiring.publishTaskStarted(task);

    try {
      // Execute via manager
      const result = await this.manager.executeOpportunity(opportunity);

      // Publish result
      if (result.success) {
        this.wiring.publishTaskCompleted(task, result);

        // Check for milestones
        const metrics = this.manager.getMetrics();
        if (metrics.totalRevenue >= 100 && metrics.totalRevenue < 100 + result.actualRevenue) {
          this.wiring.publishMilestone('first-100-revenue', metrics.totalRevenue);
        }
        if (metrics.totalRevenue >= 1000 && metrics.totalRevenue < 1000 + result.actualRevenue) {
          this.wiring.publishMilestone('first-1000-revenue', metrics.totalRevenue);
        }
      } else {
        this.wiring.publishTaskFailed(task, result);
      }

      return result;
    } catch (error) {
      // Execution error
      const result: RevenueTaskResult = {
        success: false,
        actualRevenue: 0,
        actualCost: opportunity.estimatedCost * 0.5,
        duration: Date.now() - task.startedAt,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      this.wiring.publishTaskFailed(task, result);
      return result;
    }
  }

  // ==========================================================================
  // Stream Control
  // ==========================================================================

  /**
   * Enable a specific stream.
   */
  enableStream(type: Parameters<StreamManager['enableStream']>[0]): void {
    this.manager.enableStream(type);
  }

  /**
   * Disable a specific stream.
   */
  disableStream(type: Parameters<StreamManager['disableStream']>[0]): void {
    this.manager.disableStream(type);
  }

  /**
   * Set priority for a stream.
   */
  setStreamPriority(
    type: Parameters<StreamManager['setStreamPriority']>[0],
    priority: number,
    reason: string
  ): void {
    this.manager.setStreamPriority(type, priority, reason);
  }

  // ==========================================================================
  // Metrics & Status
  // ==========================================================================

  /**
   * Get aggregate revenue metrics.
   */
  getMetrics() {
    return this.manager.getMetrics();
  }

  /**
   * Get all stream statuses.
   */
  getAllStreams() {
    return this.manager.getAllStreams();
  }

  /**
   * Get active tasks.
   */
  getActiveTasks() {
    return this.manager.getActiveTasks();
  }

  /**
   * Get current configuration.
   */
  getConfig() {
    return this.manager.getConfig();
  }

  /**
   * Update configuration.
   */
  updateConfig(updates: Partial<RevenueConfig>): void {
    this.manager.updateConfig(updates);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create and configure a revenue system.
 *
 * @example
 * ```typescript
 * const revenue = createRevenueSystem({
 *   maxConcurrentTasks: 5,
 *   minRoi: 1.0,  // 100% minimum ROI
 * });
 *
 * revenue.start();
 * ```
 */
export function createRevenueSystem(config?: Partial<RevenueConfig>): RevenueSystem {
  return new RevenueSystem(config);
}

/**
 * Singleton instance for convenience.
 */
let revenueInstance: RevenueSystem | null = null;

/**
 * Get the singleton revenue system instance.
 */
export function getRevenueSystem(config?: Partial<RevenueConfig>): RevenueSystem {
  if (!revenueInstance) {
    revenueInstance = new RevenueSystem(config);
  }
  return revenueInstance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetRevenueSystem(): void {
  if (revenueInstance) {
    revenueInstance.stop();
    revenueInstance = null;
  }
}
