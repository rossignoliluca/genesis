/**
 * Genesis 6.1 - Active Inference Module
 *
 * Autonomous decision-making via Free Energy Principle.
 *
 * This module enables Genesis to operate WITHOUT Claude Code,
 * making decisions purely through Active Inference math.
 *
 * Usage:
 * ```typescript
 * import { createAutonomousLoop, AutonomousLoop } from './active-inference/index.js';
 *
 * const loop = createAutonomousLoop();
 *
 * // Run N inference cycles
 * await loop.run(100);
 *
 * // Get current beliefs
 * const beliefs = loop.getBeliefs();
 *
 * // Get statistics
 * const stats = loop.getStats();
 * ```
 */

// Export types
export * from './types.js';

// Export core components
export { ActiveInferenceEngine, createActiveInferenceEngine } from './core.js';
export { ObservationGatherer, createObservationGatherer, getObservationGatherer } from './observations.js';
export {
  ActionExecutorManager,
  createActionExecutorManager,
  getActionExecutorManager,
  executeAction,
  registerAction,
  type ActionResult,
  type ActionContext,
} from './actions.js';

// Export integration with Kernel/Daemon
export {
  integrateActiveInference,
  createIntegratedSystem,
  createKernelObservationBridge,
  registerKernelActions,
  registerDaemonTask,
  type IntegrationConfig,
  type IntegratedSystem,
} from './integration.js';

// Export Value-Guided JEPA integration (Genesis 6.2)
export {
  ValueAugmentedEngine,
  createValueAugmentedEngine,
  createFullyIntegratedEngine,
  createValueIntegratedLoop,
  type ValueIntegrationConfig,
  type ValueIntegrationEvent,
  type ValueIntegratedLoopConfig,
  DEFAULT_VALUE_INTEGRATION_CONFIG,
} from './value-integration.js';

import { ActiveInferenceEngine, createActiveInferenceEngine } from './core.js';
import { ObservationGatherer, createObservationGatherer } from './observations.js';
import { ActionExecutorManager, createActionExecutorManager } from './actions.js';
import { Observation, Beliefs, ActionType, AIEvent } from './types.js';

// ============================================================================
// Autonomous Loop
// ============================================================================

export interface AutonomousLoopConfig {
  // Timing
  cycleInterval: number;     // ms between cycles
  maxCycles: number;         // 0 = unlimited

  // Stopping conditions
  stopOnGoalAchieved: boolean;
  stopOnEnergyCritical: boolean;
  stopOnHighSurprise: boolean;
  surpriseThreshold: number;

  // Logging
  verbose: boolean;
}

export const DEFAULT_LOOP_CONFIG: AutonomousLoopConfig = {
  cycleInterval: 1000,
  maxCycles: 0,
  stopOnGoalAchieved: true,
  stopOnEnergyCritical: true,
  stopOnHighSurprise: false,
  surpriseThreshold: 10,
  verbose: false,
};

export interface LoopStats {
  cycles: number;
  startTime: Date;
  endTime?: Date;
  actions: Record<string, number>;
  avgSurprise: number;
  finalBeliefs: Beliefs;
}

export class AutonomousLoop {
  private config: AutonomousLoopConfig;

  // Components
  private engine: ActiveInferenceEngine;
  private observations: ObservationGatherer;
  private actions: ActionExecutorManager;

  // State
  private running: boolean = false;
  private cycleCount: number = 0;
  private startTime?: Date;
  private stopReason?: string;

  // Event handlers
  private onCycleHandlers: ((cycle: number, action: ActionType, beliefs: Beliefs) => void)[] = [];
  private onStopHandlers: ((reason: string, stats: LoopStats) => void)[] = [];

  constructor(config: Partial<AutonomousLoopConfig> = {}) {
    this.config = { ...DEFAULT_LOOP_CONFIG, ...config };

    this.engine = createActiveInferenceEngine();
    this.observations = createObservationGatherer();
    this.actions = createActionExecutorManager();

    // Subscribe to engine events
    this.engine.on(this.handleEngineEvent.bind(this));
  }

  // ============================================================================
  // Main Loop
  // ============================================================================

  /**
   * Run the autonomous loop
   */
  async run(maxCycles?: number): Promise<LoopStats> {
    if (this.running) {
      throw new Error('Loop is already running');
    }

    this.running = true;
    this.cycleCount = 0;
    this.startTime = new Date();
    this.stopReason = undefined;

    const limit = maxCycles ?? this.config.maxCycles;

    if (this.config.verbose) {
      console.log(`[AI Loop] Starting autonomous loop (max cycles: ${limit || 'unlimited'})`);
    }

    try {
      while (this.running) {
        // Check cycle limit
        if (limit > 0 && this.cycleCount >= limit) {
          this.stopReason = 'cycle_limit';
          break;
        }

        // Run one cycle
        await this.cycle();

        // Wait for next cycle
        if (this.config.cycleInterval > 0) {
          await new Promise(r => setTimeout(r, this.config.cycleInterval));
        }
      }
    } catch (error) {
      this.stopReason = `error: ${error}`;
      if (this.config.verbose) {
        console.error(`[AI Loop] Error:`, error);
      }
    }

    this.running = false;
    const stats = this.getStats();

    // Notify stop handlers
    for (const handler of this.onStopHandlers) {
      handler(this.stopReason || 'unknown', stats);
    }

    if (this.config.verbose) {
      console.log(`[AI Loop] Stopped: ${this.stopReason}`);
      console.log(`[AI Loop] Stats:`, stats);
    }

    return stats;
  }

  /**
   * Run a single inference cycle
   */
  async cycle(): Promise<ActionType> {
    this.cycleCount++;

    // 1. Gather observations
    const obs = await this.observations.gather();

    if (this.config.verbose) {
      console.log(`[AI Loop] Cycle ${this.cycleCount} - Observation:`, obs);
    }

    // 2. Run inference (beliefs + policy + action)
    const action = this.engine.step(obs);

    if (this.config.verbose) {
      const beliefs = this.engine.getMostLikelyState();
      console.log(`[AI Loop] Cycle ${this.cycleCount} - Beliefs:`, beliefs);
      console.log(`[AI Loop] Cycle ${this.cycleCount} - Action: ${action}`);
    }

    // 3. Execute action
    const result = await this.actions.execute(action);

    if (this.config.verbose) {
      console.log(`[AI Loop] Cycle ${this.cycleCount} - Result:`, result.success ? 'success' : result.error);
    }

    // 4. Check stopping conditions
    this.checkStoppingConditions(obs, action);

    // 5. Notify cycle handlers
    const beliefs = this.engine.getBeliefs();
    for (const handler of this.onCycleHandlers) {
      handler(this.cycleCount, action, beliefs);
    }

    return action;
  }

  /**
   * Stop the loop
   */
  stop(reason: string = 'manual'): void {
    this.stopReason = reason;
    this.running = false;
  }

  // ============================================================================
  // Stopping Conditions
  // ============================================================================

  private checkStoppingConditions(obs: Observation, action: ActionType): void {
    // Goal achieved
    if (this.config.stopOnGoalAchieved && obs.task === 3) {
      this.stop('goal_achieved');
      return;
    }

    // Energy critical
    if (this.config.stopOnEnergyCritical && obs.energy === 0) {
      this.stop('energy_critical');
      return;
    }

    // High surprise
    if (this.config.stopOnHighSurprise) {
      const stats = this.engine.getStats();
      if (stats.averageSurprise > this.config.surpriseThreshold) {
        this.stop('high_surprise');
        return;
      }
    }
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  private handleEngineEvent(event: AIEvent): void {
    if (event.type === 'energy_critical' && this.config.stopOnEnergyCritical) {
      this.stop('energy_critical');
    }

    if (event.type === 'goal_achieved' && this.config.stopOnGoalAchieved) {
      this.stop('goal_achieved');
    }
  }

  /**
   * Subscribe to cycle events
   */
  onCycle(handler: (cycle: number, action: ActionType, beliefs: Beliefs) => void): () => void {
    this.onCycleHandlers.push(handler);
    return () => {
      const idx = this.onCycleHandlers.indexOf(handler);
      if (idx >= 0) this.onCycleHandlers.splice(idx, 1);
    };
  }

  /**
   * Subscribe to stop events
   */
  onStop(handler: (reason: string, stats: LoopStats) => void): () => void {
    this.onStopHandlers.push(handler);
    return () => {
      const idx = this.onStopHandlers.indexOf(handler);
      if (idx >= 0) this.onStopHandlers.splice(idx, 1);
    };
  }

  // ============================================================================
  // Getters
  // ============================================================================

  isRunning(): boolean {
    return this.running;
  }

  getCycleCount(): number {
    return this.cycleCount;
  }

  getBeliefs(): Beliefs {
    return this.engine.getBeliefs();
  }

  getMostLikelyState() {
    return this.engine.getMostLikelyState();
  }

  getStats(): LoopStats {
    const engineStats = this.engine.getStats();
    return {
      cycles: this.cycleCount,
      startTime: this.startTime || new Date(),
      endTime: this.running ? undefined : new Date(),
      actions: engineStats.actionCounts,
      avgSurprise: engineStats.averageSurprise,
      finalBeliefs: this.engine.getBeliefs(),
    };
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Configure observation sources
   */
  configureObservations(sources: Parameters<ObservationGatherer['configure']>[0]): void {
    this.observations.configure(sources);
  }

  /**
   * Set action context
   */
  setActionContext(context: Parameters<ActionExecutorManager['setContext']>[0]): void {
    this.actions.setContext(context);
  }

  /**
   * Get underlying components for advanced usage
   */
  getComponents() {
    return {
      engine: this.engine,
      observations: this.observations,
      actions: this.actions,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createAutonomousLoop(
  config?: Partial<AutonomousLoopConfig>
): AutonomousLoop {
  return new AutonomousLoop(config);
}

// Singleton instance
let loopInstance: AutonomousLoop | null = null;

export function getAutonomousLoop(
  config?: Partial<AutonomousLoopConfig>
): AutonomousLoop {
  if (!loopInstance) {
    loopInstance = createAutonomousLoop(config);
  }
  return loopInstance;
}

export function resetAutonomousLoop(): void {
  if (loopInstance?.isRunning()) {
    loopInstance.stop('reset');
  }
  loopInstance = null;
}
