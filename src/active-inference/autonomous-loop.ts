/**
 * Genesis 6.2 - Autonomous Loop
 *
 * Extracted to avoid circular dependencies.
 * This module provides the AutonomousLoop class for running Active Inference cycles.
 */

import { ActiveInferenceEngine, createActiveInferenceEngine } from './core.js';
import { ObservationGatherer, createObservationGatherer } from './observations.js';
import { ActionExecutorManager, createActionExecutorManager, ActionResult } from './actions.js';
import { Observation, Beliefs, ActionType, AIEvent } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Configuration & Types
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

  // v10.8: Learning & persistence
  persistModelPath: string;  // Where to save learned matrices
  persistEveryN: number;     // Save every N cycles (0 = never)
  loadOnStart: boolean;      // Load saved model on startup

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
  persistModelPath: '.genesis/learned-model.json',
  persistEveryN: 10,   // Save every 10 cycles
  loadOnStart: true,    // Resume learning from previous session
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

// ============================================================================
// AutonomousLoop Class
// ============================================================================

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

  // Custom step function (for value integration)
  private customStepFn: ((obs: Observation) => Promise<{ action: ActionType; beliefs: Beliefs }>) | null = null;

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

    // v10.8: Load previously learned model
    if (this.config.loadOnStart) {
      this.loadModel();
    }

    // v10.8: Initialize real observation sources
    this.observations.initRealSources();

    if (this.config.verbose) {
      console.log(`[AI Loop] Starting autonomous loop (max cycles: ${limit || 'unlimited'})`);
      console.log(`[AI Loop] Model persistence: ${this.config.persistModelPath}`);
    }

    try {
      while (this.running) {
        // Check cycle limit
        if (limit > 0 && this.cycleCount >= limit) {
          this.stopReason = 'cycle_limit';
          break;
        }

        // Run one cycle with adaptive timing
        const cycleStart = Date.now();
        await this.cycle();
        const cycleDuration = Date.now() - cycleStart;

        // Wait for next cycle (adaptive: subtract cycle duration)
        if (this.config.cycleInterval > 0) {
          const remainingTime = Math.max(0, this.config.cycleInterval - cycleDuration);
          if (remainingTime > 0) {
            await new Promise(r => setTimeout(r, remainingTime));
          }
        }
      }
    } catch (error) {
      this.stopReason = `error: ${error}`;
      if (this.config.verbose) {
        console.error(`[AI Loop] Error:`, error);
      }
    }

    this.running = false;

    // v10.8: Save learned model on shutdown
    if (this.config.persistEveryN > 0) {
      this.saveModel();
    }

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
    let action: ActionType;
    let beliefs: Beliefs;

    if (this.customStepFn) {
      // Use custom step function (e.g., value-augmented inference)
      const result = await this.customStepFn(obs);
      action = result.action;
      beliefs = result.beliefs;
    } else {
      // Use default Active Inference engine
      action = this.engine.step(obs);
      beliefs = this.engine.getBeliefs();
    }

    if (this.config.verbose) {
      const state = this.engine.getMostLikelyState();
      console.log(`[AI Loop] Cycle ${this.cycleCount} - Beliefs:`, state);
      console.log(`[AI Loop] Cycle ${this.cycleCount} - Action: ${action}`);
    }

    // 3. Execute action
    const result = await this.actions.execute(action);

    if (this.config.verbose) {
      console.log(`[AI Loop] Cycle ${this.cycleCount} - Result:`, result.success ? 'success' : result.error);
    }

    // 4. v10.8: Feed action outcome back to observations
    this.observations.recordToolResult(result.success, result.duration);

    // 5. v10.8: Record learning event
    const surprise = this.engine.getStats().averageSurprise;
    this.engine.recordLearningEvent(
      action,
      surprise,
      result.success ? 'positive' : 'negative'
    );

    // 6. v10.8: Persist model periodically
    if (this.config.persistEveryN > 0 && this.cycleCount % this.config.persistEveryN === 0) {
      this.saveModel();
    }

    // 7. Check stopping conditions
    this.checkStoppingConditions(obs);

    // 8. Notify cycle handlers
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

  private checkStoppingConditions(obs: Observation): void {
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
  // v10.8: Model Persistence (save/load learned matrices)
  // ============================================================================

  /**
   * Save learned model to disk.
   * Persists A/B matrices, beliefs, and action counts between sessions.
   */
  private saveModel(): void {
    try {
      const modelData = this.engine.exportLearnedModel();
      const modelPath = path.resolve(this.config.persistModelPath);
      const dir = path.dirname(modelPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(modelPath, JSON.stringify(modelData, null, 2));
      if (this.config.verbose) {
        console.log(`[AI Loop] Model saved to ${modelPath}`);
      }
    } catch (error) {
      if (this.config.verbose) {
        console.error(`[AI Loop] Failed to save model:`, error);
      }
    }
  }

  /**
   * Load previously learned model from disk.
   * Resumes learning from where it left off.
   */
  private loadModel(): void {
    try {
      const modelPath = path.resolve(this.config.persistModelPath);
      if (fs.existsSync(modelPath)) {
        const data = JSON.parse(fs.readFileSync(modelPath, 'utf-8'));
        this.engine.importLearnedModel(data);
        if (this.config.verbose) {
          console.log(`[AI Loop] Model loaded from ${modelPath}`);
          console.log(`[AI Loop] Resuming with ${data.totalActions || 0} prior actions`);
        }
      }
    } catch (error) {
      if (this.config.verbose) {
        console.error(`[AI Loop] Failed to load model:`, error);
      }
    }
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
   * Set custom step function for value-augmented inference
   *
   * This allows replacing the default Active Inference engine step
   * with a custom function (e.g., ValueAugmentedEngine.step)
   */
  setCustomStepFunction(
    stepFn: ((obs: Observation) => Promise<{ action: ActionType; beliefs: Beliefs }>) | null
  ): void {
    this.customStepFn = stepFn;
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
// Factory Functions
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
