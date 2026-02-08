/**
 * Genesis 6.2 - Autonomous Loop
 *
 * Extracted to avoid circular dependencies.
 * This module provides the AutonomousLoop class for running Active Inference cycles.
 */

import { ActiveInferenceEngine, createActiveInferenceEngine } from './core.js';
import { ObservationGatherer, createObservationGatherer } from './observations.js';
import { ActionExecutorManager, createActionExecutorManager, ActionResult } from './actions.js';
import { Observation, Beliefs, ActionType, AIEvent, ACTIONS } from './types.js';
import { DeepActiveInference } from './deep-aif.js';
import { ExperienceReplayBuffer, createExperienceReplayBuffer } from './experience-replay.js';
import { AllostasisSystem, createAllostasisSystem } from '../allostasis/index.js';
import { createDreamService, DreamService } from '../daemon/dream-mode.js';
import { ConformalPredictor, createFreeEnergyConformalPredictor } from '../uncertainty/conformal.js';
import { getEventBus, type GenesisEventBus, createSubscriber, emitSystemError } from '../bus/index.js';
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

  // v11.0: Experience replay & dream consolidation
  replayEveryN: number;      // Run experience replay every N cycles (0 = never)
  replayBatchSize: number;   // How many experiences to replay per batch
  dreamEveryN: number;       // Run dream consolidation every N cycles (0 = never)
  dreamBatchSize: number;    // How many high-surprise experiences to consolidate

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
  replayEveryN: 5,     // Replay every 5 cycles
  replayBatchSize: 8,  // 8 experiences per replay
  dreamEveryN: 50,     // Dream consolidation every 50 cycles
  dreamBatchSize: 16,  // 16 high-surprise experiences per dream
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

  // v10.8.1: Meta-learning state
  private plateauCycles: number = 0;       // Consecutive cycles with near-zero learning velocity
  private deepAIFActive: boolean = false;  // Whether Deep-AIF has been activated
  private deepAIF: DeepActiveInference | null = null;

  // v11.0: Experience replay buffer
  private replayBuffer: ExperienceReplayBuffer;
  private previousObservation: Observation | null = null;

  // v18.2: Value engine reference for TD learning feedback
  private valueEngine: {
    updateFromOutcome: (prevLatent: any, action: ActionType, outcome: any) => void;
    getLatentState: () => any;
  } | null = null;

  // v11.4: Allostasis (interoceptive regulation → C-matrix modulation)
  private allostasis: AllostasisSystem;
  private lastAllostaticDelta: boolean = false;

  // v11.4: Dream service (rich consolidation)
  private dreamService: DreamService;

  // v11.4: Conformal prediction (calibrated EFE ambiguity)
  private conformal: ConformalPredictor;
  private lastPredictedSurprise: number = 0;

  // v12.0: Non-blocking observations (cache + background refresh)
  private cachedObservation: Observation | null = null;
  private observationRefreshPromise: Promise<void> | null = null;
  private lastObservationTime: number = 0;
  private observationCacheTTL: number = 2000; // Refresh every 2s max

  // v17.0: Event bus integration for central awareness
  private eventBus: GenesisEventBus | null = null;
  // v18.2: Managed bus subscriptions (lifecycle cleanup)
  private busSubscriber: ReturnType<typeof createSubscriber> | null = null;

  constructor(config: Partial<AutonomousLoopConfig> = {}) {
    this.config = { ...DEFAULT_LOOP_CONFIG, ...config };

    this.engine = createActiveInferenceEngine();
    this.observations = createObservationGatherer();
    this.actions = createActionExecutorManager();
    this.replayBuffer = createExperienceReplayBuffer();

    // v11.4: Initialize allostasis with real sensors
    this.allostasis = createAllostasisSystem();
    this.allostasis.registerSensor('energy', () => {
      const stats = this.engine.getStats();
      return Math.max(0, 1 - stats.averageSurprise / 10); // Low surprise = high energy
    });
    this.allostasis.registerSensor('errorRate', () => {
      const stats = this.engine.getStats();
      return stats.inferenceCount > 0 ? 1 - (stats.averageSurprise < 3 ? 0.8 : 0.3) : 0;
    });
    this.allostasis.registerSensor('memoryPressure', () => {
      return this.replayBuffer.getStats().bufferSize / 1000; // Normalize to 0-1
    });

    // v11.4: Initialize dream service with replay buffer context
    this.dreamService = createDreamService(
      { minDreamDurationMs: 1000, maxDreamDurationMs: 5000 },
      {
        getEpisodicMemories: () => {
          const experiences = this.replayBuffer.sampleHighSurprise(32);
          return experiences.map(exp => ({
            id: String(exp.id),
            content: { what: `${exp.action}: surprise=${exp.surprise.toFixed(2)}, ${exp.outcome}` },
            importance: exp.priority,
            tags: [exp.outcome, exp.action],
            consolidated: exp.replayCount >= 5,
          }));
        },
        consolidateMemory: async (id: string) => {
          const experiences = this.replayBuffer.sampleHighSurprise(32);
          const exp = experiences.find(e => String(e.id) === id);
          if (exp) {
            (this.engine as any).learn(exp.observation, exp.nextObservation, exp.beliefs, exp.actionIdx);
            return { concept: `consolidated_${exp.action}_${exp.outcome}` };
          }
          return null;
        },
        log: (msg: string) => {
          if (this.config.verbose) console.log(`[Dream] ${msg}`);
        },
      }
    );

    // v11.4: Initialize conformal predictor for calibrated uncertainty
    this.conformal = createFreeEnergyConformalPredictor();

    // v17.0: Connect to event bus for central awareness
    try {
      this.eventBus = getEventBus();
    } catch (e) {
      console.debug('[AI Loop] Event bus not initialized:', (e as Error)?.message);
      this.eventBus = null;
    }

    // v18.2: React to allostasis regulation events (managed lifecycle)
    try {
      this.busSubscriber = createSubscriber('autonomous-loop');
      this.busSubscriber.on('allostasis.throttle', (event) => {
        const mag = (event as any).magnitude ?? 0.5;
        this.config.cycleInterval = Math.max(this.config.cycleInterval, 2000 * mag);
      });
      this.busSubscriber.on('allostasis.hibernate', () => {
        this.runDreamConsolidation();
      });
    } catch { /* bus optional */ }

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

        // Wait for next cycle (v12.0: adaptive based on surprise level)
        if (this.config.cycleInterval > 0) {
          const surprise = this.engine.getStats().averageSurprise;
          // High surprise → faster cycles; Low surprise → slower cycles
          const adaptiveFactor = surprise > 3 ? 0.5 : surprise < 1 ? 2.0 : 1.0;
          const adaptiveInterval = this.config.cycleInterval * adaptiveFactor;
          const remainingTime = Math.max(0, adaptiveInterval - cycleDuration);
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
      // v18.2: Signal error to nociception via bus
      emitSystemError('active-inference', error, 'critical');
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

    // v17.0: Emit cycle started event
    this.eventBus?.publish('active-inference.cycle.started', {
      source: 'active-inference',
      precision: 1.0,
      cycle: this.cycleCount,
    });

    // 1. Gather observations (v12.0: non-blocking with cache)
    const obs = await this.gatherNonBlocking();

    // v18.1: Neuromodulation → inference parameters
    try {
      const { getNeuromodulationSystem } = await import('../neuromodulation/index.js');
      const neuromod = getNeuromodulationSystem();
      const effect = neuromod.getEffect();

      // Modulate engine parameters based on neuromodulatory state
      this.engine.config.learningRateA = 0.05 * effect.learningRate;
      this.engine.config.learningRateB = 0.05 * effect.learningRate;
      this.engine.config.actionTemperature = Math.max(0.1, effect.explorationRate);
      this.engine.config.explorationBonus = effect.explorationRate * effect.riskTolerance;

      // v18.3: Wire remaining neuromodulation effects
      this.engine.config.priorWeight = 0.1 * effect.precisionGain;
      this.engine.config.inferenceIterations = Math.max(8, Math.round(26 * effect.processingDepth));
      this.engine.config.policyHorizon = Math.round(2 + effect.temporalDiscount * 3);
    } catch { /* neuromodulation optional */ }

    // v18.3: φ-gated action escalation
    // Low consciousness → force conservative action selection
    try {
      const { getConsciousnessSystem } = await import('../consciousness/index.js');
      const consciousness = getConsciousnessSystem();
      if (consciousness?.shouldDefer?.()) {
        // Low φ → conservative parameters (reduce exploration and temperature)
        this.engine.config.actionTemperature = Math.min(this.engine.config.actionTemperature, 0.5);
        this.engine.config.explorationBonus = Math.min(this.engine.config.explorationBonus, 0.3);
        if (this.config.verbose) {
          const phi = consciousness.getSnapshot()?.level?.rawPhi ?? 0;
          console.log(`[AI Loop] φ-gated action: φ=${phi.toFixed(3)} → conservative mode (temp=0.5, explore=0.3)`);
        }
      }
    } catch { /* consciousness optional */ }

    if (this.config.verbose) {
      console.log(`[AI Loop] Cycle ${this.cycleCount} - Observation:`, obs);
    }

    // 1b. v12.1: Allostatic modulation with LEARNED thresholds
    //     Thresholds come from semantic memory (learned from experience)
    //     Sense internal state → modulate C-matrix before inference
    try {
      const intero = (this.allostasis as any).interoception?.sense?.();
      if (intero) {
        const energyLevel = intero.energy ?? 0.7;
        const errorRate = intero.errorRate ?? 0;
        const memPressure = intero.memoryPressure ?? 0.3;
        const thresholds = await this.getHomeostaticThresholds();

        // Low energy → boost preference for rest/low-energy states
        if (energyLevel < thresholds.energy) {
          this.engine.modulatePreferences({ energy: [2, 1, 0, -1, -2] });
          this.engine.modulatePreferences({ task: [1.5, 0.5, 0, -0.5] });
          this.lastAllostaticDelta = true;
          this.updateHomeostaticMemory('energy', thresholds.energy, energyLevel);
        }
        // High error rate → boost preference for tool success
        if (errorRate > thresholds.error) {
          this.engine.modulatePreferences({ tool: [-1, 0, 2] });
          this.lastAllostaticDelta = true;
          this.updateHomeostaticMemory('error', thresholds.error, errorRate);
        }
        // High memory pressure → prefer consolidation
        if (memPressure > thresholds.memory) {
          this.engine.modulatePreferences({ task: [1, 0, 0, -1] });
          this.lastAllostaticDelta = true;
          this.updateHomeostaticMemory('memory', thresholds.memory, memPressure);
        }
      }
    } catch (e) { console.debug('[AI Loop] Allostasis optional:', (e as Error)?.message); }

    // v18.2: MetaMemory knowledge gaps → bias action selection toward exploration
    try {
      const { getMetaMemory } = await import('../memory/meta-memory.js');
      const metaMemory = getMetaMemory();
      const gaps = metaMemory.getKnowledgeGaps();

      if (gaps.length > 0) {
        // Count high-priority gaps (low confidence/coverage)
        const urgentGaps = gaps.filter(g => g.confidence < 0.3 || g.coverage < 0.3);

        if (urgentGaps.length >= 2) {
          // Many knowledge gaps → strongly prefer tool use for research/sensing
          this.engine.modulatePreferences({
            tool: [-1, 0, 2],  // Prefer successful tool use (sensing/research)
          });
          this.lastAllostaticDelta = true;
        } else if (gaps.length >= 1) {
          // Some gaps → mildly prefer tool exploration
          this.engine.modulatePreferences({
            tool: [-0.5, 0, 1],  // Mild preference for tool success
          });
          this.lastAllostaticDelta = true;
        }
      }
    } catch { /* meta-memory optional */ }

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

    // v18.2: Snapshot latent state before action execution (for TD learning)
    const preActionLatent = this.valueEngine?.getLatentState?.() ?? null;

    // v17.0: Emit belief updated event
    const mostLikelyState = this.engine.getMostLikelyState();
    this.eventBus?.publish('active-inference.belief.updated', {
      source: 'active-inference',
      precision: 0.9,
      cycle: this.cycleCount,
      beliefs: mostLikelyState,
    });

    // v17.0: Emit action selected event
    this.eventBus?.publish('active-inference.action.selected', {
      source: 'active-inference',
      precision: 0.95,
      cycle: this.cycleCount,
      action,
      beliefs: mostLikelyState,
    });

    // 2b. v11.4: Reset preferences to avoid permanent drift
    if (this.lastAllostaticDelta) {
      this.engine.resetPreferences();
      this.lastAllostaticDelta = false;
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

    // v18.2: TD Learning - feed action outcome to value function
    if (this.valueEngine && preActionLatent) {
      try {
        const nextObs = await this.gatherNonBlocking();
        this.valueEngine.updateFromOutcome(preActionLatent, action, {
          success: result.success,
          reward: result.success ? 0.5 : -0.3,
          newObservation: nextObs,
        });
      } catch { /* value update non-fatal */ }
    }

    // 4b. v11.4: Conformal calibration (feed prediction vs actual surprise)
    const actualSurprise = this.engine.getStats().averageSurprise;
    if (this.lastPredictedSurprise > 0) {
      this.conformal.calibrate(action, this.lastPredictedSurprise, actualSurprise);
    }
    // Predict next surprise for calibration on following cycle
    this.lastPredictedSurprise = actualSurprise;

    // 5. v10.8: Record learning event
    const surprise = this.engine.getStats().averageSurprise;
    const outcome: 'positive' | 'negative' | 'neutral' = result.success ? 'positive' : 'negative';
    this.engine.recordLearningEvent(action, surprise, outcome);

    // v17.0: Emit surprise detected event (when surprise is notable)
    if (surprise > 2.0) {
      this.eventBus?.publish('active-inference.surprise.detected', {
        source: 'active-inference',
        precision: 1.0,
        cycle: this.cycleCount,
        surprise,
        threshold: 2.0,
        action,
        outcome,
      });
    }

    // 5a. v11.0: Store experience in replay buffer
    if (this.previousObservation) {
      this.replayBuffer.store({
        timestamp: Date.now(),
        observation: this.previousObservation,
        action,
        actionIdx: ACTIONS.indexOf(action),
        nextObservation: obs,
        surprise,
        outcome,
        beliefs: { ...beliefs },
        nextBeliefs: this.engine.getBeliefs(),
      });
    }
    this.previousObservation = obs;

    // v18.1: Auto-record significant events to episodic memory
    if (surprise > 3.0 || outcome === 'negative' || this.cycleCount % 50 === 0) {
      try {
        const { getMemorySystem } = await import('../memory/index.js');
        const mem = getMemorySystem();
        mem.remember({
          what: `Cycle ${this.cycleCount}: action=${action}, surprise=${surprise.toFixed(2)}, outcome=${outcome}`,
          tags: ['active-inference', 'auto-record', action, outcome],
          importance: surprise / 10,
        });
      } catch { /* memory optional */ }
    }

    // 5b. v10.8.1: Meta-learning triggers (every 20 cycles)
    if (this.cycleCount % 20 === 0 && this.cycleCount >= 40) {
      const patterns = this.engine.analyzeLearningPatterns();

      // FIX 3: Auto-trigger self.modify when struggling
      if (patterns.successRate < 0.3 && patterns.surpriseTrend === 'increasing') {
        if (this.config.verbose) {
          console.log(`[AI Loop] Meta: Low success (${(patterns.successRate*100).toFixed(0)}%) + rising surprise → self.modify`);
        }
        await this.actions.execute('self.modify' as ActionType);
      }

      // FIX 4: Switch to Deep-AIF on learning plateau
      if (!this.deepAIFActive && Math.abs(patterns.learningVelocity) < 0.001 && patterns.surpriseTrend === 'stable') {
        this.plateauCycles++;
        if (this.plateauCycles >= 3) { // 3 consecutive plateau checks (60 cycles)
          if (this.config.verbose) {
            console.log(`[AI Loop] Meta: Learning plateau detected → switching to Deep-AIF`);
          }
          this.activateDeepAIF();
        }
      } else {
        this.plateauCycles = 0;
      }
    }

    // 5c. v11.0: Experience replay (offline learning from past experiences)
    if (this.config.replayEveryN > 0 && this.cycleCount % this.config.replayEveryN === 0) {
      this.runExperienceReplay();
    }

    // 5d. v11.0: Dream consolidation (deep replay of high-surprise events)
    if (this.config.dreamEveryN > 0 && this.cycleCount % this.config.dreamEveryN === 0 && this.cycleCount > 0) {
      this.runDreamConsolidation();
    }

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
    // v18.2: Clean up bus subscriptions
    if (this.busSubscriber) {
      this.busSubscriber.unsubscribeAll();
      this.busSubscriber = null;
    }
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

  // ============================================================================
  // v12.0: Non-Blocking Observation Gathering
  // ============================================================================

  /**
   * Get observations without blocking. Uses cached value if fresh,
   * triggers background refresh if stale.
   * First call awaits to bootstrap, subsequent calls return cached.
   */
  private async gatherNonBlocking(): Promise<Observation> {
    const now = Date.now();

    // First call: must await to get initial observation
    if (!this.cachedObservation) {
      this.cachedObservation = await this.observations.gather();
      this.lastObservationTime = now;
      return this.cachedObservation;
    }

    // If cache is fresh enough, return immediately
    if (now - this.lastObservationTime < this.observationCacheTTL) {
      return this.cachedObservation;
    }

    // Cache is stale: trigger background refresh (non-blocking)
    if (!this.observationRefreshPromise) {
      this.observationRefreshPromise = this.observations.gather()
        .then(obs => {
          this.cachedObservation = obs;
          this.lastObservationTime = Date.now();
          this.observationRefreshPromise = null;
        })
        .catch(() => {
          this.observationRefreshPromise = null;
          // Keep cached observation on error
        });
    }

    // Return cached (possibly slightly stale) observation immediately
    return this.cachedObservation;
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
  // v11.0: Experience Replay & Dream Consolidation
  // ============================================================================

  /**
   * Run experience replay: sample a batch from buffer and re-learn.
   * This strengthens A/B matrix updates for important past experiences.
   */
  private runExperienceReplay(): void {
    const batch = this.replayBuffer.sampleBatch(this.config.replayBatchSize);
    if (batch.experiences.length === 0) return;

    if (this.config.verbose) {
      console.log(`[AI Loop] Replay: ${batch.experiences.length} experiences (avg surprise: ${batch.avgSurprise.toFixed(2)})`);
    }

    // Re-learn from each experience (offline update)
    for (const exp of batch.experiences) {
      // Feed the observation pair back through the engine's learning
      // This is equivalent to "replaying" the experience in the model
      (this.engine as any).learn(
        exp.observation,
        exp.nextObservation,
        exp.beliefs,
        exp.actionIdx
      );

      // v12.1: High-surprise experiences → episodic memory
      // Only on first replay to avoid duplicate encoding
      if (exp.surprise > 3.0 && exp.replayCount <= 1) {
        import('../memory/index.js').then(({ getMemorySystem }) => {
          const memorySystem = getMemorySystem();
          memorySystem.remember({
            what: `AIF experience: action=${exp.action} outcome=${exp.outcome} surprise=${exp.surprise.toFixed(2)}`,
            importance: Math.min(1, exp.surprise / 10),
            tags: ['aif-experience', 'replay-encoded',
                   exp.outcome,
                   exp.surprise > 5 ? 'high-surprise' : 'notable'],
          });
        }).catch((e) => { console.debug('[AI Loop] Episodic encoding failed:', (e as Error)?.message); });
      }
    }
  }

  // ============================================================================
  // v12.1: Adaptive Allostasis (learned thresholds from semantic memory)
  // ============================================================================

  /**
   * Get homeostatic thresholds from semantic memory.
   * Falls back to defaults if not yet learned.
   */
  private async getHomeostaticThresholds(): Promise<{ energy: number; error: number; memory: number }> {
    try {
      const { getMemorySystem } = await import('../memory/index.js');
      const mem = getMemorySystem();

      const energyFact = mem.getFact('homeostatic-energy-threshold');
      const errorFact = mem.getFact('homeostatic-error-threshold');
      const memoryFact = mem.getFact('homeostatic-memory-threshold');

      return {
        energy: energyFact ? parseFloat(energyFact.content?.definition || '0.3') || 0.3 : 0.3,
        error: errorFact ? parseFloat(errorFact.content?.definition || '0.4') || 0.4 : 0.4,
        memory: memoryFact ? parseFloat(memoryFact.content?.definition || '0.7') || 0.7 : 0.7,
      };
    } catch (e) {
      console.debug('[AI Loop] Thresholds fallback:', (e as Error)?.message);
      return { energy: 0.3, error: 0.4, memory: 0.7 };
    }
  }

  /**
   * After allostasis fires, learn the effective threshold.
   * Adjusts threshold slightly based on whether the sensor value was
   * close to or far from the threshold (tighter = more sensitive).
   */
  private async updateHomeostaticMemory(sensor: string, currentThreshold: number, sensorValue: number): Promise<void> {
    try {
      const { getMemorySystem } = await import('../memory/index.js');
      const mem = getMemorySystem();

      // Adaptive threshold: if sensor triggered far from threshold, threshold may be too lax
      // Nudge threshold toward the triggering value (slow learning rate)
      const learningRate = 0.05;
      const newThreshold = currentThreshold + learningRate * (sensorValue - currentThreshold);

      mem.learn({
        concept: `homeostatic-${sensor}-threshold`,
        definition: newThreshold.toFixed(4),
        category: 'autopoiesis',
        confidence: 0.85,
        tags: ['homeostasis', 'learned-threshold', sensor],
      });
    } catch (e) { console.debug('[AI Loop] Threshold learning failed:', (e as Error)?.message); }
  }

  /**
   * Run dream consolidation: deep replay of high-surprise experiences.
   * This is the "sleep" phase where the model integrates difficult experiences.
   *
   * Differences from regular replay:
   * - Focuses on highest-surprise experiences
   * - Runs multiple iterations per experience
   * - Prunes consolidated experiences afterward
   */
  private runDreamConsolidation(): void {
    const highSurprise = this.replayBuffer.sampleHighSurprise(this.config.dreamBatchSize);
    if (highSurprise.length === 0) return;

    if (this.config.verbose) {
      const avgS = highSurprise.reduce((s, e) => s + e.surprise, 0) / highSurprise.length;
      console.log(`[AI Loop] Dream: ${highSurprise.length} experiences, avg surprise ${avgS.toFixed(2)}`);
    }

    // v13.1: Notify FEK to enter dreaming mode (suppresses L2-L4 during consolidation)
    import('../kernel/free-energy-kernel.js').then(({ getFreeEnergyKernel }) => {
      const fek = getFreeEnergyKernel();
      if (fek?.setMode) fek.setMode('dreaming');
    }).catch((e) => { console.debug('[AI Loop] FEK not available:', (e as Error)?.message); });

    // v11.4: Delegate to DreamService for NREM/SWS/REM phases
    // DreamService handles: episodic consolidation, pattern extraction, creative synthesis
    this.dreamService.startDream({ duration: 3000 }).then(session => {
      if (this.config.verbose && session?.results) {
        console.log(`[AI Loop] Dream complete: ${session.results.memoriesConsolidated} consolidated, ${session.results.patternsExtracted} patterns`);
      }
      // v13.1: Restore FEK to awake mode after dream
      import('../kernel/free-energy-kernel.js').then(({ getFreeEnergyKernel }) => {
        const fek = getFreeEnergyKernel();
        if (fek?.setMode) fek.setMode('awake');
      }).catch((e) => { console.debug('[AI Loop] FEK mode restore failed:', (e as Error)?.message); });
    }).catch(() => {
      // Fallback: direct 3× replay if DreamService fails
      for (let iter = 0; iter < 3; iter++) {
        for (const exp of highSurprise) {
          (this.engine as any).learn(exp.observation, exp.nextObservation, exp.beliefs, exp.actionIdx);
        }
      }
    });

    // v11.4: Counterfactual verification (C3 from evaluation)
    // During dream, test: "what if we had taken a different action?"
    for (const exp of highSurprise.slice(0, 5)) {
      // Sample 3 alternative actions and compare predicted outcomes
      const altActions = ACTIONS.filter(a => a !== exp.action).slice(0, 3);
      for (const altAction of altActions) {
        const altIdx = ACTIONS.indexOf(altAction);
        // If engine predicts better outcome for alt action, strengthen B-matrix for that transition
        const predicted = (this.engine as any).predictTransition?.(exp.beliefs, altIdx);
        if (predicted && predicted.expectedSurprise < exp.surprise * 0.7) {
          // Counterfactual is significantly better → update B-matrix
          (this.engine as any).learn(exp.observation, exp.nextObservation, exp.beliefs, altIdx);
          if (this.config.verbose) {
            console.log(`[AI Loop] Counterfactual: ${exp.action}→${altAction} would reduce surprise by ${((1 - predicted.expectedSurprise / exp.surprise) * 100).toFixed(0)}%`);
          }
        }
      }
    }

    // Prune fully consolidated experiences
    const pruned = this.replayBuffer.pruneConsolidated();
    if (pruned > 0 && this.config.verbose) {
      console.log(`[AI Loop] Dream: pruned ${pruned} consolidated experiences`);
    }
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
   * v18.2: Set value engine reference for TD learning feedback
   */
  setValueEngine(engine: {
    updateFromOutcome: (prevLatent: any, action: ActionType, outcome: any) => void;
    getLatentState: () => any;
  }): void {
    this.valueEngine = engine;
  }

  /**
   * v10.8.1: Activate Deep Active Inference when POMDP plateaus.
   * Switches the step function to use VAE-based continuous inference.
   */
  private activateDeepAIF(): void {
    this.deepAIF = new DeepActiveInference({
      latentDim: 32,
      hiddenDim: 128,
      numLayers: 2,
      learningRate: 0.001,
      temperature: 0.8,
    });
    this.deepAIFActive = true;

    // Set custom step function that uses Deep-AIF
    this.setCustomStepFunction(async (obs: Observation) => {
      // Convert discrete observation to Deep-AIF format
      const deepObs = {
        modality: 'multimodal',
        data: [obs.energy / 4, obs.phi / 3, obs.tool / 2, obs.coherence / 2, obs.task / 3, (obs.economic ?? 0) / 3],
        precision: 0.8,
        timestamp: Date.now(),
      };
      const result = await this.deepAIF!.cycle(deepObs as any);
      // Map Deep-AIF action back to ActionType
      const actionType = ACTIONS.includes(result.action.type as ActionType)
        ? (result.action.type as ActionType)
        : 'self.analyze';
      // Keep standard engine beliefs for compatibility
      const beliefs = this.engine.getBeliefs();
      return { action: actionType, beliefs };
    });
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
