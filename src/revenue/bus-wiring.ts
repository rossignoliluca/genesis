/**
 * Revenue Module Bus Wiring
 *
 * Connects the revenue system to Genesis event bus for:
 * - Cost tracking (economy/fiber integration)
 * - Pain signals (failed revenue → nociception)
 * - Reward signals (successful revenue → neuromodulation)
 * - Priority adjustments (allostasis integration)
 * - Status broadcasting
 */

import { createPublisher, createSubscriber } from '../bus/index.js';
import { getEconomicFiber } from '../economy/fiber.js';
import { getNociceptiveSystem } from '../nociception/index.js';
import { getNeuromodulationSystem } from '../neuromodulation/index.js';

import type { StreamManager } from './stream-manager.js';
import type {
  RevenueTask,
  RevenueTaskResult,
  RevenueOpportunity,
  RevenueStreamType,
} from './types.js';

// ============================================================================
// Revenue Bus Wiring
// ============================================================================

export class RevenueBusWiring {
  private readonly publisher = createPublisher('revenue');
  private readonly subscriber = createSubscriber('revenue');
  private manager: StreamManager;
  private fiber = getEconomicFiber();
  private nociception = getNociceptiveSystem();
  private neuromodulation = getNeuromodulationSystem();

  constructor(manager: StreamManager) {
    this.manager = manager;
    this.setupSubscriptions();
  }

  // ==========================================================================
  // Event Bus Subscriptions
  // ==========================================================================

  private setupSubscriptions(): void {
    // Listen to allostasis events for priority adjustments
    this.subscriber.on('allostasis.regulation', (event: any) => {
      this.handleAllostaticRegulation(event);
    });

    // Listen to economic events for budget awareness
    this.subscriber.on('economy.budget.reallocated', (event: any) => {
      this.handleBudgetUpdate(event);
    });

    // Listen to neuromodulation for risk tolerance adjustment
    this.subscriber.on('neuromod.levels.changed', (event: any) => {
      this.handleNeuromodulationChange(event);
    });

    // Listen to pain state for risk aversion
    // Note: Using pain.stimulus since pain.state not in bus yet
    this.subscriber.onPrefix('pain', (event: any) => {
      if (event) {
        this.handlePainStateChange(event);
      }
    });
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  /**
   * Handle allostatic regulation events.
   * Adjust stream priorities based on system state.
   */
  private handleAllostaticRegulation(event: any): void {
    const { action, urgency } = event;

    // If system is low on energy, prioritize high-ROI, low-effort streams
    if (action?.type === 'hibernate' || action?.type === 'defer') {
      // Increase priority for passive income (yield)
      this.manager.setStreamPriority('yield', 9, 'allostasis:low-energy');

      // Decrease priority for active hunting (bounty-hunter)
      this.manager.setStreamPriority('bounty-hunter', 3, 'allostasis:low-energy');
    }

    // If system has excess resources, be more aggressive
    if (action?.type === 'scale_up') {
      this.manager.setStreamPriority('bounty-hunter', 9, 'allostasis:scale-up');
      this.manager.setStreamPriority('keeper', 8, 'allostasis:scale-up');
    }
  }

  /**
   * Handle budget updates from economic fiber.
   */
  private handleBudgetUpdate(event: any): void {
    const { totalBudget, burnRate, sustainable } = event;

    // If not sustainable, adjust config
    if (!sustainable) {
      const config = this.manager.getConfig();
      this.manager.updateConfig({
        minRoi: Math.max(config.minRoi, 1.0), // Require higher ROI
        maxTotalRisk: Math.min(config.maxTotalRisk, 0.4), // Reduce risk
      });
    }

    // If budget is low, reduce daily spending
    if (totalBudget < 50) {
      const config = this.manager.getConfig();
      this.manager.updateConfig({
        maxDailyBudget: Math.min(config.maxDailyBudget, 20),
      });
    }
  }

  /**
   * Handle neuromodulation level changes.
   * Adjust risk tolerance based on dopamine/cortisol.
   */
  private handleNeuromodulationChange(event: any): void {
    const { levels, effect } = event;

    // High dopamine → more exploration, higher risk tolerance
    // High cortisol → more caution, lower risk tolerance
    const riskTolerance = effect.riskTolerance || 0.5;

    const config = this.manager.getConfig();
    this.manager.updateConfig({
      maxTotalRisk: riskTolerance,
      riskAdjustment: 0.5 + riskTolerance * 1.0, // 0.5-1.5x
    });
  }

  /**
   * Handle pain state changes.
   * If system is in pain, reduce revenue activity to conserve resources.
   */
  private handlePainStateChange(event: any): void {
    const { overallLevel, aggregatePain } = event;

    // High pain → reduce activity
    if (overallLevel === 'agony' || overallLevel === 'pain') {
      // Pause high-risk streams
      this.manager.pauseStream('bounty-hunter');
      this.manager.pauseStream('content');

      // Prioritize low-effort income
      this.manager.setStreamPriority('yield', 10, 'pain:conservation');
    }

    // Recovered from pain → resume normal operation
    if (overallLevel === 'none' || overallLevel === 'discomfort') {
      this.manager.resumeStream('bounty-hunter');
      this.manager.resumeStream('content');
    }
  }

  // ==========================================================================
  // Revenue Event Publishing
  // ==========================================================================

  /**
   * Publish that a revenue task has started.
   */
  publishTaskStarted(task: RevenueTask): void {
    // Use existing economy.cost.recorded event
    this.publisher.publish('economy.cost.recorded', {
      precision: 1.0,
      module: task.streamId,
      amount: task.estimatedCost,
      category: `revenue-task:${task.type}`,
    });

    // Record cost in economic fiber
    this.fiber.recordCost(
      task.streamId,
      task.estimatedCost,
      `revenue-task:${task.type}`
    );
  }

  /**
   * Publish that a revenue task completed successfully.
   * Triggers reward signal in neuromodulation.
   */
  publishTaskCompleted(task: RevenueTask, result: RevenueTaskResult): void {
    // Use existing economy.revenue.recorded event
    this.publisher.publish('economy.revenue.recorded', {
      precision: 1.0,
      amount: result.actualRevenue,
      revenueSource: `${task.streamId}:${task.type}`,
    });

    // Record revenue in economic fiber
    this.fiber.recordRevenue(
      task.streamId,
      result.actualRevenue,
      `revenue-task:${task.type}`
    );

    // Calculate reward magnitude (based on ROI)
    const netRevenue = result.actualRevenue - result.actualCost;
    const roi = result.actualCost > 0 ? netRevenue / result.actualCost : 0;
    const rewardMagnitude = Math.min(1, roi * 0.3); // Cap at 1.0

    // Send reward signal to neuromodulation (dopamine boost)
    this.neuromodulation.reward(
      rewardMagnitude,
      `revenue:${task.streamId}:${task.type}`
    );

    // Resolve any economic pain from this stream
    this.nociception.resolveSource('economic');
  }

  /**
   * Publish that a revenue task failed.
   * Triggers pain signal in nociception.
   */
  publishTaskFailed(task: RevenueTask, result: RevenueTaskResult): void {
    // Use existing economy.cost.recorded event for failed cost
    this.publisher.publish('economy.cost.recorded', {
      precision: 1.0,
      module: task.streamId,
      amount: result.actualCost,
      category: `revenue-task-failed:${task.type}`,
    });

    // Still record the cost
    this.fiber.recordCost(
      task.streamId,
      result.actualCost,
      `revenue-task-failed:${task.type}`
    );

    // Calculate pain magnitude (based on cost wasted)
    const painMagnitude = Math.min(1, result.actualCost / 10); // $10 = max pain

    // Send pain signal to nociception
    this.nociception.stimulus(
      'economic',
      painMagnitude,
      `Revenue task failed: ${task.type} (cost: $${result.actualCost.toFixed(2)})`
    );

    // Send punishment signal to neuromodulation (cortisol increase)
    this.neuromodulation.punish(
      painMagnitude * 0.5,
      `revenue:${task.streamId}:failed`
    );
  }

  /**
   * Publish that an opportunity was found.
   * (Note: Using console log since event type not in bus yet)
   */
  publishOpportunityFound(opportunity: RevenueOpportunity): void {
    // High-ROI opportunities trigger novelty signal
    if (opportunity.estimatedRoi > 2.0) {
      this.neuromodulation.novelty(
        0.3,
        `revenue:high-roi:${opportunity.type}`
      );
    }
  }

  /**
   * Publish stream status change.
   * (Note: Using console log since event type not in bus yet)
   */
  publishStreamStatusChanged(
    streamId: RevenueStreamType,
    oldStatus: string,
    newStatus: string,
    reason: string
  ): void {
    // Event type not yet defined in bus, skip for now
  }

  /**
   * Publish revenue milestone.
   */
  publishMilestone(milestone: string, value: number, metadata?: Record<string, unknown>): void {
    // Milestones trigger reward
    this.neuromodulation.reward(0.5, `revenue:milestone:${milestone}`);
  }

  // ==========================================================================
  // Metrics Publishing
  // ==========================================================================

  /**
   * Publish aggregate revenue metrics.
   * Should be called periodically (e.g., every 30s).
   */
  publishMetrics(): void {
    const metrics = this.manager.getMetrics();

    // Check for NESS deviation (non-equilibrium steady state)
    const globalSection = this.fiber.getGlobalSection();
    if (!globalSection.sustainable) {
      // Calculate deviation from sustainable state
      const targetNESS = 0; // Target is net-zero or positive
      const currentNESS = globalSection.netFlow;
      const deviation = Math.abs(currentNESS - targetNESS);

      this.publisher.publish('economy.ness.deviation', {
        precision: 1.0,
        currentNESS,
        targetNESS,
        deviation,
        action: currentNESS < 0 ? 'increase-revenue' : 'reduce-costs',
      });

      // Economic stress → pain signal
      const stressMagnitude = Math.min(1, Math.abs(globalSection.netFlow) / 50);
      this.nociception.stimulus(
        'economic',
        stressMagnitude,
        `Economic NESS deviation: net flow ${globalSection.netFlow.toFixed(2)}`
      );
    }
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  shutdown(): void {
    this.subscriber.unsubscribeAll();
  }
}

/**
 * Factory function to wire up a StreamManager to the event bus.
 */
export function wireRevenueModule(manager: StreamManager): RevenueBusWiring {
  return new RevenueBusWiring(manager);
}
