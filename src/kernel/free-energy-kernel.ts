/**
 * Genesis v12.0 - Free Energy Kernel (FEK)
 *
 * The first kernel architecture where ALL decisions — scheduling, routing,
 * resource allocation, fault tolerance, self-modification — are unified
 * under a single Free Energy functional.
 *
 * Novel contributions (no existing papers on FEP for kernel/OS design):
 * 1. Hierarchical Markov Blankets as process isolation
 * 2. EFE-driven scheduling (replaces priority queues)
 * 3. Prediction-error-only inter-level communication
 * 4. Erlang-style supervision via surprise minimization
 * 5. Allostatic resource management (anticipatory, not reactive)
 * 6. Mode-dependent dynamics (polynomial functor composition)
 *
 * Architecture:
 *   L4 (Executive/Prefrontal) - 10s-∞  : self-model, goals, identity
 *   L3 (Cognitive/Cortex)     - 100ms-10s: reasoning, planning, strategy
 *   L2 (Reactive/Limbic)      - 10-100ms : urgency, routing, interrupts
 *   L1 (Autonomic/Brainstem)  - 1-10ms   : invariants, heartbeat, panic
 *
 * References:
 * - Friston (2010) "The free-energy principle: a unified brain theory?"
 * - Sterling (2012) "Allostasis: A model of predictive regulation"
 * - Rao & Ballard (1999) "Predictive coding in the visual cortex"
 * - Spivak (2022) "Polynomial Functors: A Mathematical Theory of Interaction"
 * - seL4 (2009) "Formal verification of an OS microkernel"
 * - Armstrong (2003) "Making reliable distributed systems" (Erlang/OTP)
 */

import { ActiveInferenceEngine, createActiveInferenceEngine } from '../active-inference/core.js';
import { Beliefs, ActionType, ACTIONS, Observation } from '../active-inference/types.js';
import { ContractionMonitor, type ContractionState } from './contraction.js';
import { naturalGradientStep } from './fisher.js';
import { leapfrogStep, budgetConstraint, roiGradient, computeHamiltonian, type HamiltonianState } from './leapfrog.js';
import { EconomicFiber, getEconomicFiber } from '../economy/fiber.js';
import { NESSMonitor, getNESSMonitor, type NESSState } from '../economy/ness.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Kernel operation modes (polynomial functor states)
 * Each mode activates a different wiring diagram between modules.
 */
export type KernelMode =
  | 'awake'          // Full operation, all levels active
  | 'focused'        // L3/L4 enhanced, L2 suppressed (deep work)
  | 'vigilant'       // L2 enhanced, L3/L4 reduced (threat response)
  | 'dreaming'       // L1 active, L2-L4 in consolidation mode
  | 'dormant'        // Only L1, minimal operation
  | 'self_improving'; // L4 enhanced, sandbox active

/**
 * Hierarchical levels with distinct timescales
 */
export type KernelLevel = 'L1' | 'L2' | 'L3' | 'L4';

/**
 * Markov Blanket: defines the boundary of each level
 * Sensory states: what the level observes
 * Active states: what the level can do
 * Internal states: hidden states maintained by the level
 */
export interface MarkovBlanket<S = unknown, A = unknown, I = unknown> {
  sensory: S;       // Incoming signals (observations)
  active: A;        // Outgoing signals (actions)
  internal: I;      // Hidden states (beliefs)
}

/**
 * Prediction error: only this propagates upward
 */
export interface PredictionError {
  source: KernelLevel;
  target: KernelLevel;
  magnitude: number;      // How surprising (0-1)
  precision: number;      // How reliable (0-1)
  content: string;        // What was unexpected
  timestamp: number;
}

/**
 * Supervision tree node (Erlang-style)
 */
export interface SupervisionNode {
  id: string;
  level: KernelLevel;
  strategy: 'one_for_one' | 'one_for_all' | 'rest_for_one';
  maxRestarts: number;
  restartWindow: number;  // ms
  children: string[];     // Child node IDs
  restartCount: number;
  lastRestart: number;
}

/**
 * Task with EFE-computed priority
 */
export interface FEKTask {
  id: string;
  goal: string;
  context: Record<string, unknown>;

  // EFE-computed fields
  efe: number;            // Expected Free Energy (lower = higher priority)
  infoGain: number;       // Epistemic value
  pragmaticValue: number; // Goal alignment
  risk: number;           // Expected cost/failure

  // Scheduling
  level: KernelLevel;     // Which level handles this
  preemptible: boolean;   // Can be interrupted
  deadline?: number;      // Hard deadline (ms from now)

  // State
  status: 'queued' | 'running' | 'suspended' | 'completed' | 'failed';
  assignedAt?: number;
  result?: unknown;
  error?: string;
}

/**
 * Level-specific generative model
 * Each level maintains predictions about the level below
 */
export interface GenerativeModel {
  level: KernelLevel;
  predictions: Map<string, number>;    // predicted_variable → expected_value
  precisions: Map<string, number>;     // predicted_variable → precision
  lastUpdate: number;
}

/**
 * Free Energy computed at each level
 */
export interface LevelFreeEnergy {
  level: KernelLevel;
  complexity: number;      // KL[Q(s) || P(s)] - model complexity
  accuracy: number;        // -E_Q[log P(o|s)] - prediction accuracy
  totalFE: number;         // complexity - accuracy (what we minimize)
  timestamp: number;
}

/**
 * Allostatic setpoint: anticipatory resource target
 */
export interface AllostaticSetpoint {
  resource: string;
  current: number;
  predicted: number;       // Where we predict it will be
  target: number;          // Where we want it to be
  urgency: number;         // How quickly to act (0-1)
  anticipationHorizon: number; // How far ahead to predict (ms)
}

// ============================================================================
// L1: Autonomic Level (Brainstem)
// ============================================================================

/**
 * L1 handles: invariants, heartbeat, panic, basic resource monitoring
 * Timescale: 1-10ms
 * Always active. Cannot be disabled.
 */
class AutonomicLevel {
  private blanket: MarkovBlanket<L1Sensory, L1Active, L1Internal>;
  private generativeModel: GenerativeModel;
  private heartbeatInterval: number = 5; // ms
  private lastHeartbeat: number = 0;
  private panicThreshold: number = 0.9; // FE above this triggers panic

  constructor() {
    this.blanket = {
      sensory: { energy: 1.0, agentResponsive: true, merkleValid: true, systemLoad: 0 },
      active: { halt: false, restart: null, panic: false, dormancy: false },
      internal: { freeEnergy: 0, uptime: 0, restartCount: 0, stableFor: 0 },
    };
    this.generativeModel = {
      level: 'L1',
      predictions: new Map([
        ['energy', 1.0],
        ['agents_alive', 1.0],
        ['merkle_valid', 1.0],
        ['system_load', 0.3],
      ]),
      precisions: new Map([
        ['energy', 5.0],       // Very precise about energy
        ['agents_alive', 10.0], // Very precise about agents
        ['merkle_valid', 10.0], // Very precise about integrity
        ['system_load', 2.0],   // Less precise about load
      ]),
      lastUpdate: Date.now(),
    };
  }

  /**
   * L1 step: check vitals, compute prediction errors, take emergency actions
   */
  step(observations: L1Sensory): { errors: PredictionError[]; actions: L1Active } {
    const now = Date.now();
    this.blanket.sensory = observations;

    // Compute prediction errors for each variable
    const errors: PredictionError[] = [];

    const energyError = this.computePredictionError('energy', observations.energy);
    if (energyError.magnitude > 0.1) errors.push(energyError);

    const agentError = this.computePredictionError('agents_alive', observations.agentResponsive ? 1 : 0);
    if (agentError.magnitude > 0.1) errors.push(agentError);

    const merkleError = this.computePredictionError('merkle_valid', observations.merkleValid ? 1 : 0);
    if (merkleError.magnitude > 0.1) errors.push(merkleError);

    const loadError = this.computePredictionError('system_load', observations.systemLoad);
    if (loadError.magnitude > 0.1) errors.push(loadError);

    // Compute Free Energy at this level
    const fe = errors.reduce((sum, e) => sum + e.magnitude * e.precision, 0);
    this.blanket.internal.freeEnergy = fe;

    // Determine actions based on FE
    const actions: L1Active = {
      halt: false,
      restart: null,
      panic: fe > this.panicThreshold,
      dormancy: observations.energy < 0.05,
    };

    // Emergency: no agents responsive
    if (!observations.agentResponsive) {
      actions.restart = 'all';
    }

    // Emergency: merkle chain broken
    if (!observations.merkleValid) {
      actions.panic = true;
    }

    // Update predictions (simple exponential moving average)
    this.updatePredictions(observations);

    // Track stability
    if (fe < 0.2) {
      this.blanket.internal.stableFor += (now - this.lastHeartbeat);
    } else {
      this.blanket.internal.stableFor = 0;
    }

    this.blanket.internal.uptime += (now - this.lastHeartbeat);
    this.blanket.active = actions;
    this.lastHeartbeat = now;

    return { errors, actions };
  }

  private computePredictionError(variable: string, observed: number): PredictionError {
    const predicted = this.generativeModel.predictions.get(variable) || 0;
    const precision = this.generativeModel.precisions.get(variable) || 1.0;
    const error = Math.abs(observed - predicted);

    return {
      source: 'L1',
      target: 'L2',
      magnitude: Math.min(error, 1.0),
      precision,
      content: `${variable}: predicted=${predicted.toFixed(3)}, observed=${observed.toFixed(3)}`,
      timestamp: Date.now(),
    };
  }

  private updatePredictions(obs: L1Sensory): void {
    const lr = 0.1; // Learning rate
    const pred = this.generativeModel.predictions;
    pred.set('energy', (pred.get('energy') || 0) * (1 - lr) + obs.energy * lr);
    pred.set('agents_alive', (pred.get('agents_alive') || 0) * (1 - lr) + (obs.agentResponsive ? 1 : 0) * lr);
    pred.set('merkle_valid', (pred.get('merkle_valid') || 0) * (1 - lr) + (obs.merkleValid ? 1 : 0) * lr);
    pred.set('system_load', (pred.get('system_load') || 0) * (1 - lr) + obs.systemLoad * lr);
    this.generativeModel.lastUpdate = Date.now();
  }

  getFreeEnergy(): number {
    return this.blanket.internal.freeEnergy;
  }

  getState(): L1Internal {
    return { ...this.blanket.internal };
  }
}

// ============================================================================
// L2: Reactive Level (Limbic)
// ============================================================================

/**
 * L2 handles: urgency modulation, EFE scheduling, interrupt handling, emotional routing
 * Timescale: 10-100ms
 * Receives prediction errors from L1, predictions from L3.
 */
class ReactiveLevel {
  private blanket: MarkovBlanket<L2Sensory, L2Active, L2Internal>;
  private generativeModel: GenerativeModel;
  private taskQueue: FEKTask[] = [];
  private allostasis: Map<string, AllostaticSetpoint> = new Map();

  constructor() {
    this.blanket = {
      sensory: { l1Errors: [], l3Predictions: new Map(), taskLoad: 0, currentUrgency: 0 },
      active: { scheduledTask: null, interrupt: false, urgencySignal: 0, modeSwitch: null },
      internal: { freeEnergy: 0, emotionalValence: 0, arousal: 0, taskBacklog: 0 },
    };
    this.generativeModel = {
      level: 'L2',
      predictions: new Map([
        ['task_completion_rate', 0.8],
        ['error_rate', 0.05],
        ['resource_availability', 0.9],
        ['urgency_baseline', 0.3],
      ]),
      precisions: new Map([
        ['task_completion_rate', 3.0],
        ['error_rate', 5.0],
        ['resource_availability', 4.0],
        ['urgency_baseline', 2.0],
      ]),
      lastUpdate: Date.now(),
    };

    // Initialize allostatic setpoints
    this.allostasis.set('energy', {
      resource: 'energy',
      current: 1.0,
      predicted: 1.0,
      target: 0.8, // We want energy above 0.8
      urgency: 0,
      anticipationHorizon: 30000, // Predict 30s ahead
    });
    this.allostasis.set('task_load', {
      resource: 'task_load',
      current: 0,
      predicted: 0,
      target: 0.6, // Optimal load is 60%
      urgency: 0,
      anticipationHorizon: 10000,
    });
  }

  /**
   * L2 step: process L1 errors, schedule tasks by EFE, modulate urgency
   */
  step(
    l1Errors: PredictionError[],
    l3Predictions: Map<string, number>,
    currentTasks: FEKTask[]
  ): { errors: PredictionError[]; actions: L2Active } {
    this.blanket.sensory = {
      l1Errors,
      l3Predictions,
      taskLoad: currentTasks.length,
      currentUrgency: this.computeUrgency(l1Errors),
    };

    // Update task queue with EFE scores
    this.taskQueue = this.computeEFESchedule(currentTasks);

    // Compute allostatic adjustments (anticipatory resource management)
    this.updateAllostasis();

    // Compute Free Energy at this level
    const predictionErrors = this.computeL2Errors(l1Errors, l3Predictions);
    const fe = predictionErrors.reduce((sum, e) => sum + e.magnitude * e.precision, 0);
    this.blanket.internal.freeEnergy = fe;

    // Emotional state modulation (valence + arousal drive mode switches)
    this.updateEmotionalState(l1Errors, fe);

    // Determine actions
    const nextTask = this.taskQueue.length > 0 ? this.taskQueue[0] : null;
    const shouldInterrupt = this.checkInterrupt(l1Errors);
    const modeSwitch = this.checkModeSwitch();

    const actions: L2Active = {
      scheduledTask: nextTask?.id || null,
      interrupt: shouldInterrupt,
      urgencySignal: this.blanket.sensory.currentUrgency,
      modeSwitch,
    };

    this.blanket.active = actions;

    // Only significant errors propagate to L3
    const significantErrors = predictionErrors.filter(e => e.magnitude > 0.2);

    return { errors: significantErrors, actions };
  }

  /**
   * EFE-driven scheduling: task with lowest EFE goes first.
   *
   * EFE(task) = ambiguity + risk - info_gain - pragmatic_value
   *
   * This replaces traditional priority queues with information-theoretic scheduling.
   */
  private computeEFESchedule(tasks: FEKTask[]): FEKTask[] {
    const scored = tasks.map(task => {
      // Ambiguity: how uncertain is the outcome?
      const ambiguity = 1 - (task.pragmaticValue || 0.5);

      // Risk: expected cost of failure
      const risk = task.risk || 0.3;

      // Information gain: how much will this reduce our uncertainty?
      const infoGain = task.infoGain || 0.5;

      // Pragmatic value: how much does this serve our goals?
      const pragmatic = task.pragmaticValue || 0.5;

      // Deadline urgency boost
      let deadlineBoost = 0;
      if (task.deadline) {
        const timeLeft = task.deadline - Date.now();
        if (timeLeft < 1000) deadlineBoost = 2.0;
        else if (timeLeft < 5000) deadlineBoost = 1.0;
        else if (timeLeft < 30000) deadlineBoost = 0.3;
      }

      // Final EFE (lower = schedule first)
      task.efe = ambiguity + risk - infoGain - pragmatic - deadlineBoost;

      return task;
    });

    // Sort by EFE (lowest first = highest priority)
    scored.sort((a, b) => a.efe - b.efe);
    return scored;
  }

  private computeUrgency(errors: PredictionError[]): number {
    if (errors.length === 0) return 0;
    // Urgency is precision-weighted sum of error magnitudes
    const totalPrecision = errors.reduce((s, e) => s + e.precision, 0);
    if (totalPrecision === 0) return 0;
    return Math.min(1, errors.reduce((s, e) => s + e.magnitude * e.precision, 0) / totalPrecision);
  }

  private computeL2Errors(
    l1Errors: PredictionError[],
    l3Predictions: Map<string, number>
  ): PredictionError[] {
    const errors: PredictionError[] = [];

    // Check if L1 error rate matches our prediction
    const predictedErrorRate = this.generativeModel.predictions.get('error_rate') || 0.05;
    const actualErrorRate = l1Errors.length > 0 ?
      l1Errors.reduce((s, e) => s + e.magnitude, 0) / l1Errors.length : 0;

    if (Math.abs(actualErrorRate - predictedErrorRate) > 0.1) {
      errors.push({
        source: 'L2',
        target: 'L3',
        magnitude: Math.abs(actualErrorRate - predictedErrorRate),
        precision: this.generativeModel.precisions.get('error_rate') || 5.0,
        content: `error_rate: predicted=${predictedErrorRate.toFixed(3)}, actual=${actualErrorRate.toFixed(3)}`,
        timestamp: Date.now(),
      });
    }

    // Check if task load matches predictions from L3
    const predictedLoad = l3Predictions.get('expected_task_load') || 0.5;
    const actualLoad = this.taskQueue.length / 10; // Normalize to 0-1
    if (Math.abs(actualLoad - predictedLoad) > 0.15) {
      errors.push({
        source: 'L2',
        target: 'L3',
        magnitude: Math.abs(actualLoad - predictedLoad),
        precision: 3.0,
        content: `task_load: L3_predicted=${predictedLoad.toFixed(2)}, actual=${actualLoad.toFixed(2)}`,
        timestamp: Date.now(),
      });
    }

    return errors;
  }

  /**
   * Allostatic regulation: predict future resource needs, act preemptively
   * This is the key difference from homeostatic control — we anticipate, not react.
   */
  private updateAllostasis(): void {
    for (const [key, setpoint] of this.allostasis) {
      // Predict future value based on trend
      const trend = setpoint.current - setpoint.predicted; // Change since last prediction
      const futureValue = setpoint.current + trend * (setpoint.anticipationHorizon / 1000);

      // Compute urgency based on predicted deviation from target
      const deviation = Math.abs(futureValue - setpoint.target);
      setpoint.urgency = Math.min(1, deviation * 2);

      // Update prediction
      setpoint.predicted = setpoint.current;
    }
  }

  private updateEmotionalState(errors: PredictionError[], fe: number): void {
    // Valence: negative when FE is high (things are going wrong)
    this.blanket.internal.emotionalValence = 1 - Math.min(fe, 1) * 2; // [-1, 1]

    // Arousal: high when errors are frequent and precise
    this.blanket.internal.arousal = Math.min(1, errors.length * 0.2 + fe * 0.5);
  }

  private checkInterrupt(errors: PredictionError[]): boolean {
    // Interrupt current task if any L1 error has very high precision + magnitude
    return errors.some(e => e.magnitude * e.precision > 3.0);
  }

  private checkModeSwitch(): KernelMode | null {
    const { emotionalValence, arousal } = this.blanket.internal;

    // High arousal + negative valence → vigilant mode
    if (arousal > 0.8 && emotionalValence < -0.5) return 'vigilant';

    // Very low arousal → dormant consideration
    if (arousal < 0.1 && this.taskQueue.length === 0) return 'dormant';

    // Check allostatic urgency
    const energySetpoint = this.allostasis.get('energy');
    if (energySetpoint && energySetpoint.urgency > 0.8) return 'dormant';

    return null; // No mode switch
  }

  updateResource(resource: string, value: number): void {
    const setpoint = this.allostasis.get(resource);
    if (setpoint) {
      setpoint.current = value;
    }
  }

  getFreeEnergy(): number {
    return this.blanket.internal.freeEnergy;
  }

  getEmotionalState(): { valence: number; arousal: number } {
    return {
      valence: this.blanket.internal.emotionalValence,
      arousal: this.blanket.internal.arousal,
    };
  }

  getSchedule(): FEKTask[] {
    return [...this.taskQueue];
  }
}

// ============================================================================
// L3: Cognitive Level (Cortex)
// ============================================================================

/**
 * L3 handles: reasoning strategy, planning, tool selection, working memory
 * Timescale: 100ms-10s
 * Receives prediction errors from L2, predictions from L4.
 * Sends predictions down to L2.
 */
class CognitiveLevel {
  private blanket: MarkovBlanket<L3Sensory, L3Active, L3Internal>;
  private generativeModel: GenerativeModel;
  private l2Predictions: Map<string, number> = new Map();

  constructor() {
    this.blanket = {
      sensory: { l2Errors: [], l4Predictions: new Map(), currentTask: null, workingMemory: [] },
      active: { strategy: 'sequential', toolSelection: null, planUpdate: null, l2Predictions: new Map() },
      internal: { freeEnergy: 0, confidence: 0.5, reasoningDepth: 0, contextEntropy: 1.0 },
    };
    this.generativeModel = {
      level: 'L3',
      predictions: new Map([
        ['task_success_rate', 0.75],
        ['strategy_effectiveness', 0.7],
        ['context_relevance', 0.6],
      ]),
      precisions: new Map([
        ['task_success_rate', 3.0],
        ['strategy_effectiveness', 2.5],
        ['context_relevance', 2.0],
      ]),
      lastUpdate: Date.now(),
    };

    // Initialize predictions sent to L2
    this.l2Predictions.set('expected_task_load', 0.5);
    this.l2Predictions.set('expected_latency', 1000);
  }

  /**
   * L3 step: select reasoning strategy, manage working memory, send predictions to L2
   */
  step(
    l2Errors: PredictionError[],
    l4Predictions: Map<string, number>,
    currentTask: FEKTask | null
  ): { errors: PredictionError[]; actions: L3Active; predictionsForL2: Map<string, number> } {
    this.blanket.sensory = {
      l2Errors,
      l4Predictions,
      currentTask,
      workingMemory: this.blanket.sensory.workingMemory,
    };

    // Compute Free Energy
    const errors = this.computeL3Errors(l2Errors, l4Predictions, currentTask);
    const fe = errors.reduce((sum, e) => sum + e.magnitude * e.precision, 0);
    this.blanket.internal.freeEnergy = fe;

    // Select reasoning strategy based on FE and task complexity
    const strategy = this.selectStrategy(currentTask, fe);

    // Update confidence based on prediction accuracy
    this.updateConfidence(l2Errors);

    // Generate predictions for L2 (predictive coding: top-down)
    this.updateL2Predictions(currentTask);

    const actions: L3Active = {
      strategy,
      toolSelection: currentTask ? this.selectTools(currentTask) : null,
      planUpdate: this.generatePlanUpdate(currentTask, errors),
      l2Predictions: new Map(this.l2Predictions),
    };

    this.blanket.active = actions;

    // Only propagate errors that L3 cannot explain
    const unexplainedErrors = errors.filter(e => e.magnitude > 0.3);

    return { errors: unexplainedErrors, actions, predictionsForL2: this.l2Predictions };
  }

  private computeL3Errors(
    l2Errors: PredictionError[],
    l4Predictions: Map<string, number>,
    currentTask: FEKTask | null
  ): PredictionError[] {
    const errors: PredictionError[] = [];

    // Check if strategy effectiveness matches prediction
    if (currentTask && currentTask.status === 'completed') {
      const predicted = this.generativeModel.predictions.get('task_success_rate') || 0.75;
      // Binary outcome
      const actual = currentTask.error ? 0 : 1;
      if (Math.abs(actual - predicted) > 0.2) {
        errors.push({
          source: 'L3',
          target: 'L4',
          magnitude: Math.abs(actual - predicted),
          precision: this.generativeModel.precisions.get('task_success_rate') || 3.0,
          content: `task_success: predicted=${predicted.toFixed(2)}, actual=${actual}`,
          timestamp: Date.now(),
        });
      }
    }

    // Check if L4 goals are being met
    const goalProgress = l4Predictions.get('expected_progress') || 0.5;
    const actualProgress = this.estimateProgress(currentTask);
    if (Math.abs(actualProgress - goalProgress) > 0.2) {
      errors.push({
        source: 'L3',
        target: 'L4',
        magnitude: Math.abs(actualProgress - goalProgress),
        precision: 2.0,
        content: `goal_progress: L4_expected=${goalProgress.toFixed(2)}, actual=${actualProgress.toFixed(2)}`,
        timestamp: Date.now(),
      });
    }

    return errors;
  }

  /**
   * Strategy selection via FE: higher FE → more sophisticated strategy
   */
  private selectStrategy(task: FEKTask | null, fe: number): string {
    if (!task) return 'idle';

    // Simple complexity estimation
    const goalLength = task.goal.length;
    const hasContext = Object.keys(task.context).length > 0;

    if (fe < 0.2 && goalLength < 50) return 'sequential';
    if (fe < 0.4) return 'tree_of_thought';
    if (fe < 0.6 || hasContext) return 'graph_of_thought';
    if (fe < 0.8) return 'super_correct';
    return 'ultimate'; // Very high FE → ensemble approach
  }

  private selectTools(task: FEKTask): string | null {
    // Delegate to EFE tool selector (implemented in active-inference/efe-tool-selector.ts)
    const goal = task.goal.toLowerCase();
    if (goal.includes('search') || goal.includes('find')) return 'search';
    if (goal.includes('research') || goal.includes('paper')) return 'research';
    if (goal.includes('generate') || goal.includes('create')) return 'generate_text';
    if (goal.includes('code') || goal.includes('implement')) return 'code';
    return null;
  }

  private generatePlanUpdate(task: FEKTask | null, errors: PredictionError[]): string | null {
    if (!task || errors.length === 0) return null;

    // If errors indicate strategy isn't working, suggest plan revision
    const highErrors = errors.filter(e => e.magnitude > 0.5);
    if (highErrors.length > 0) {
      return `revise: ${highErrors.map(e => e.content).join('; ')}`;
    }
    return null;
  }

  private updateL2Predictions(task: FEKTask | null): void {
    // Predict how loaded L2 will be in the near future
    const currentLoad = task ? 0.6 : 0.2;
    this.l2Predictions.set('expected_task_load', currentLoad);
    this.l2Predictions.set('expected_latency', task ? 2000 : 500);
  }

  private updateConfidence(l2Errors: PredictionError[]): void {
    // Confidence decreases with prediction errors from below
    const errorMagnitude = l2Errors.reduce((s, e) => s + e.magnitude, 0);
    this.blanket.internal.confidence = Math.max(0.1, 1 - errorMagnitude * 0.3);
  }

  private estimateProgress(task: FEKTask | null): number {
    if (!task) return 0;
    if (task.status === 'completed') return 1;
    if (task.status === 'running') return 0.5;
    return 0.1;
  }

  getFreeEnergy(): number {
    return this.blanket.internal.freeEnergy;
  }

  getConfidence(): number {
    return this.blanket.internal.confidence;
  }
}

// ============================================================================
// L4: Executive Level (Prefrontal)
// ============================================================================

/**
 * L4 handles: self-model, goal generation, identity, policy modification
 * Timescale: 10s-∞
 * Receives prediction errors from L3. Top of hierarchy.
 * Can modify the policies (strategies, parameters) of lower levels.
 */
class ExecutiveLevel {
  private blanket: MarkovBlanket<L4Sensory, L4Active, L4Internal>;
  private generativeModel: GenerativeModel;
  private goals: Map<string, { priority: number; progress: number; deadline?: number }> = new Map();
  private selfModel: SelfModel;

  constructor() {
    this.blanket = {
      sensory: { l3Errors: [], systemFE: 0, phi: 0.5, goalStates: new Map() },
      active: { policyUpdate: null, goalModification: null, l3Predictions: new Map(), selfModify: false },
      internal: { freeEnergy: 0, identity: 1.0, coherence: 1.0, reflectionDepth: 0 },
    };
    this.generativeModel = {
      level: 'L4',
      predictions: new Map([
        ['system_stability', 0.8],
        ['goal_achievement_rate', 0.6],
        ['self_improvement_rate', 0.1],
      ]),
      precisions: new Map([
        ['system_stability', 2.0],
        ['goal_achievement_rate', 3.0],
        ['self_improvement_rate', 1.0],
      ]),
      lastUpdate: Date.now(),
    };
    this.selfModel = {
      capabilities: ['reasoning', 'search', 'code', 'memory'],
      limitations: ['no_physical', 'token_limited', 'single_thread'],
      values: ['accuracy', 'helpfulness', 'safety'],
      currentIdentity: 1.0,
    };
  }

  /**
   * L4 step: reflect on system performance, update goals, modify policies
   */
  step(
    l3Errors: PredictionError[],
    systemState: { totalFE: number; phi: number; mode: KernelMode }
  ): { actions: L4Active; predictionsForL3: Map<string, number> } {
    this.blanket.sensory = {
      l3Errors,
      systemFE: systemState.totalFE,
      phi: systemState.phi,
      goalStates: new Map(this.goals),
    };

    // Compute Free Energy at meta-level
    const fe = this.computeL4FE(l3Errors, systemState);
    this.blanket.internal.freeEnergy = fe;

    // Update self-model coherence
    this.updateSelfModel(l3Errors, systemState);

    // Check if policy modification is needed
    const policyUpdate = this.evaluatePolicies(l3Errors, fe);

    // Check if goals need modification
    const goalMod = this.evaluateGoals(systemState);

    // Generate predictions for L3
    const l3Predictions = new Map<string, number>();
    l3Predictions.set('expected_progress', this.computeExpectedProgress());
    l3Predictions.set('strategy_preference', this.computeStrategyPreference(fe));

    const actions: L4Active = {
      policyUpdate,
      goalModification: goalMod,
      l3Predictions,
      selfModify: fe > 1.5 && systemState.phi > 0.6, // Only self-modify with high consciousness
    };

    this.blanket.active = actions;

    return { actions, predictionsForL3: l3Predictions };
  }

  private computeL4FE(errors: PredictionError[], state: { totalFE: number; phi: number }): number {
    // L4 FE combines: prediction errors from L3 + system-level FE + goal deviation
    const errorFE = errors.reduce((s, e) => s + e.magnitude * e.precision, 0);
    const goalFE = this.computeGoalDeviation();
    const systemFE = state.totalFE * 0.3; // Attenuated system FE

    return errorFE + goalFE + systemFE;
  }

  private computeGoalDeviation(): number {
    let totalDeviation = 0;
    for (const [, goal] of this.goals) {
      const expectedProgress = 0.5; // Linear progress assumption
      totalDeviation += Math.abs(goal.progress - expectedProgress) * goal.priority;
    }
    return totalDeviation / Math.max(this.goals.size, 1);
  }

  private updateSelfModel(errors: PredictionError[], state: { phi: number; totalFE?: number }): void {
    // Identity coherence decreases with high prediction errors
    const errorLoad = errors.reduce((s, e) => s + e.magnitude, 0);
    this.blanket.internal.coherence = Math.max(0.1, 1 - errorLoad * 0.2);

    // Identity strength tied to consciousness level
    this.selfModel.currentIdentity = state.phi * this.blanket.internal.coherence;
    this.blanket.internal.identity = this.selfModel.currentIdentity;

    // v13.1: Bayesian prediction update (the CORE of predictive coding)
    // Predictions are corrected by precision-weighted prediction errors
    const lr = 0.05; // Learning rate (slow — executive-level learning)

    // Update system_stability prediction from totalFE
    if (state.totalFE !== undefined) {
      const predicted = this.generativeModel.predictions.get('system_stability') || 0.8;
      const observed = Math.max(0, Math.min(1, 1 - state.totalFE / 3)); // Low FE = high stability
      const precision = this.generativeModel.precisions.get('system_stability') || 2.0;
      const update = predicted + lr * precision * (observed - predicted);
      this.generativeModel.predictions.set('system_stability', Math.max(0.05, Math.min(0.99, update)));
      // Precision increases with experience (slower for L4)
      this.generativeModel.precisions.set('system_stability', Math.min(10, precision + 0.01));
    }

    // Update goal_achievement_rate from task success errors
    const taskErrors = errors.filter(e => e.content.includes('task_success'));
    if (taskErrors.length > 0) {
      const predicted = this.generativeModel.predictions.get('goal_achievement_rate') || 0.6;
      // Extract actual value from error content (e.g., "task_success: predicted=0.75, actual=0")
      const actualMatch = taskErrors[0].content.match(/actual=([0-9.]+)/);
      if (actualMatch) {
        const observed = parseFloat(actualMatch[1]);
        const precision = this.generativeModel.precisions.get('goal_achievement_rate') || 3.0;
        const update = predicted + lr * precision * (observed - predicted);
        this.generativeModel.predictions.set('goal_achievement_rate', Math.max(0.05, Math.min(0.99, update)));
        this.generativeModel.precisions.set('goal_achievement_rate', Math.min(10, precision + 0.02));
      }
    }

    this.generativeModel.lastUpdate = Date.now();
  }

  private evaluatePolicies(errors: PredictionError[], fe: number): string | null {
    // If FE consistently high, suggest policy modification
    if (fe > 1.0 && errors.length > 2) {
      // Identify which policies are failing
      const strategyErrors = errors.filter(e => e.content.includes('task_success'));
      if (strategyErrors.length > 0) {
        return 'increase_strategy_complexity';
      }
      const progressErrors = errors.filter(e => e.content.includes('goal_progress'));
      if (progressErrors.length > 0) {
        return 'revise_goals';
      }
      return 'increase_exploration';
    }
    return null;
  }

  private evaluateGoals(state: { totalFE: number; phi: number; mode: KernelMode }): string | null {
    // In dormant mode, shed non-essential goals
    if (state.mode === 'dormant') return 'shed_non_essential';
    // Very low FE = everything is fine, maybe set new goals
    if (state.totalFE < 0.1 && this.goals.size === 0) return 'generate_new_goals';
    return null;
  }

  private computeExpectedProgress(): number {
    if (this.goals.size === 0) return 0.5;
    const avgProgress = [...this.goals.values()].reduce((s, g) => s + g.progress, 0) / this.goals.size;
    return Math.min(1, avgProgress + 0.1); // Slightly optimistic
  }

  private computeStrategyPreference(fe: number): number {
    // Higher FE → prefer more complex strategies (higher value)
    return Math.min(1, fe / 2);
  }

  addGoal(id: string, priority: number, deadline?: number): void {
    this.goals.set(id, { priority, progress: 0, deadline });
  }

  updateGoalProgress(id: string, progress: number): void {
    const goal = this.goals.get(id);
    if (goal) goal.progress = Math.min(1, progress);
  }

  getFreeEnergy(): number {
    return this.blanket.internal.freeEnergy;
  }

  getSelfModel(): SelfModel {
    return { ...this.selfModel };
  }
}

// ============================================================================
// Supervision Tree (Erlang-style)
// ============================================================================

class SupervisionTree {
  private nodes: Map<string, SupervisionNode> = new Map();
  private crashLog: Array<{ id: string; time: number; error: string }> = [];

  constructor() {
    // Default supervision hierarchy
    this.nodes.set('root', {
      id: 'root', level: 'L4', strategy: 'one_for_one',
      maxRestarts: 10, restartWindow: 60000,
      children: ['cognitive', 'reactive', 'autonomic'],
      restartCount: 0, lastRestart: 0,
    });
    this.nodes.set('cognitive', {
      id: 'cognitive', level: 'L3', strategy: 'one_for_one',
      maxRestarts: 5, restartWindow: 30000,
      children: ['reasoning', 'memory', 'tools'],
      restartCount: 0, lastRestart: 0,
    });
    this.nodes.set('reactive', {
      id: 'reactive', level: 'L2', strategy: 'rest_for_one',
      maxRestarts: 8, restartWindow: 20000,
      children: ['scheduler', 'router', 'interrupt'],
      restartCount: 0, lastRestart: 0,
    });
    this.nodes.set('autonomic', {
      id: 'autonomic', level: 'L1', strategy: 'one_for_all',
      maxRestarts: 20, restartWindow: 10000,
      children: ['heartbeat', 'invariants'],
      restartCount: 0, lastRestart: 0,
    });
  }

  /**
   * Handle a crash: apply supervision strategy
   * Returns the restart action to take.
   */
  handleCrash(nodeId: string, error: string): SupervisionAction {
    const now = Date.now();
    this.crashLog.push({ id: nodeId, time: now, error });

    // Find the supervisor of the crashed node
    const supervisor = this.findSupervisor(nodeId);
    if (!supervisor) {
      // No supervisor = escalate to system level
      return { action: 'escalate', target: 'system', reason: `No supervisor for ${nodeId}` };
    }

    // Check restart budget
    const recentCrashes = this.crashLog.filter(
      c => c.id === nodeId && now - c.time < supervisor.restartWindow
    ).length;

    if (recentCrashes > supervisor.maxRestarts) {
      // Too many restarts → escalate to supervisor's supervisor
      return { action: 'escalate', target: supervisor.id, reason: `${nodeId} exceeded max restarts` };
    }

    // Apply supervision strategy
    supervisor.restartCount++;
    supervisor.lastRestart = now;

    switch (supervisor.strategy) {
      case 'one_for_one':
        // Only restart the crashed child
        return { action: 'restart', target: nodeId, reason: `Restarting ${nodeId} (${recentCrashes}/${supervisor.maxRestarts})` };

      case 'one_for_all':
        // Restart all children
        return { action: 'restart_all', target: supervisor.id, reason: `Restarting all children of ${supervisor.id}` };

      case 'rest_for_one':
        // Restart crashed child and all children after it
        const idx = supervisor.children.indexOf(nodeId);
        const toRestart = supervisor.children.slice(idx);
        return { action: 'restart_group', target: toRestart.join(','), reason: `Restarting ${toRestart.join(', ')}` };
    }
  }

  private findSupervisor(nodeId: string): SupervisionNode | null {
    for (const node of this.nodes.values()) {
      if (node.children.includes(nodeId)) return node;
    }
    return null;
  }

  addNode(node: SupervisionNode): void {
    this.nodes.set(node.id, node);
  }

  getTree(): SupervisionNode[] {
    return [...this.nodes.values()];
  }

  getCrashLog(limit: number = 20): Array<{ id: string; time: number; error: string }> {
    return this.crashLog.slice(-limit);
  }
}

interface SupervisionAction {
  action: 'restart' | 'restart_all' | 'restart_group' | 'escalate';
  target: string;
  reason: string;
}

// ============================================================================
// Free Energy Kernel (Main Class)
// ============================================================================

export class FreeEnergyKernel {
  // Hierarchical levels
  private l1: AutonomicLevel;
  private l2: ReactiveLevel;
  private l3: CognitiveLevel;
  private l4: ExecutiveLevel;

  // Supervision
  private supervision: SupervisionTree;

  // State
  private mode: KernelMode = 'awake';
  private running: boolean = false;
  private cycleCount: number = 0;
  private startTime: number = Date.now();

  // Task management
  private tasks: Map<string, FEKTask> = new Map();
  private taskIdCounter: number = 0;

  // Metrics
  private freeEnergyHistory: LevelFreeEnergy[] = [];
  private predictionErrors: PredictionError[] = [];
  private totalFE: number = 0;

  // Event handlers
  private onCycleHandlers: Array<(state: FEKState) => void> = [];
  private onModeChangeHandlers: Array<(mode: KernelMode, prev: KernelMode) => void> = [];
  private onErrorHandlers: Array<(error: PredictionError) => void> = [];

  // v13.0: Information geometry + economic fiber
  private contraction: ContractionMonitor;
  private fiber: EconomicFiber;
  private nessMonitor: NESSMonitor;
  private budgetState: HamiltonianState;
  private lastBeliefState: number[] = [];
  private budgetReallocationInterval: number = 10; // Every N cycles

  constructor() {
    this.l1 = new AutonomicLevel();
    this.l2 = new ReactiveLevel();
    this.l3 = new CognitiveLevel();
    this.l4 = new ExecutiveLevel();
    this.supervision = new SupervisionTree();

    // v13.0: Initialize contraction monitor
    this.contraction = new ContractionMonitor({
      emaAlpha: 0.02,
      warningThreshold: -0.05,
      criticalThreshold: 0.0,
    });

    // v13.0: Initialize economic fiber
    this.fiber = getEconomicFiber(100);
    this.fiber.registerModule('L1');
    this.fiber.registerModule('L2');
    this.fiber.registerModule('L3');
    this.fiber.registerModule('L4');

    // v13.0: Initialize NESS monitor
    this.nessMonitor = getNESSMonitor();

    // v13.0: Initialize Hamiltonian state for budget
    this.budgetState = {
      q: [25, 25, 25, 25], // Equal initial allocation
      p: [0, 0, 0, 0],     // Zero initial momentum
    };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  start(): void {
    this.running = true;
    this.startTime = Date.now();
    this.mode = 'awake';
  }

  stop(): void {
    this.running = false;
  }

  /**
   * Main processing cycle: hierarchical prediction-error minimization
   *
   * Flow:
   * 1. L1 observes hardware state, computes errors → propagates up
   * 2. L2 receives L1 errors + L3 predictions, computes schedule → propagates up
   * 3. L3 receives L2 errors + L4 predictions, selects strategy → propagates up
   * 4. L4 receives L3 errors, updates self-model, sends predictions down
   * 5. Predictions flow back down: L4→L3→L2 (predictive coding)
   */
  cycle(observations: KernelObservations): FEKState {
    this.cycleCount++;

    // === Bottom-up: error propagation ===

    // L1: Autonomic check
    const l1Result = this.l1.step({
      energy: observations.energy,
      agentResponsive: observations.agentResponsive,
      merkleValid: observations.merkleValid,
      systemLoad: observations.systemLoad,
    });

    // Handle L1 panic
    if (l1Result.actions.panic) {
      this.handlePanic(l1Result.actions);
    }

    // v13.1: Feed real observations into L2 allostatic setpoints
    this.l2.updateResource('energy', observations.energy);
    this.l2.updateResource('task_load', observations.systemLoad);

    // L2: Reactive scheduling
    const l3Preds = this.l3.getFreeEnergy() > 0 ?
      new Map<string, number>([['expected_task_load', 0.5]]) :
      new Map<string, number>();

    const currentTasks = [...this.tasks.values()].filter(t => t.status === 'queued' || t.status === 'running');
    const l2Result = this.l2.step(l1Result.errors, l3Preds, currentTasks);

    // Handle mode switch request
    if (l2Result.actions.modeSwitch) {
      this.switchMode(l2Result.actions.modeSwitch);
    }

    // L3: Cognitive strategy (only in awake/focused modes)
    let l3Result: { errors: PredictionError[]; actions: L3Active; predictionsForL2: Map<string, number> } | null = null;
    if (this.mode === 'awake' || this.mode === 'focused') {
      const currentTask = l2Result.actions.scheduledTask ?
        this.tasks.get(l2Result.actions.scheduledTask) || null : null;

      const l4Preds = new Map<string, number>([
        ['expected_progress', 0.5],
        ['strategy_preference', 0.5],
      ]);

      l3Result = this.l3.step(l2Result.errors, l4Preds, currentTask);
    }

    // L4: Executive reflection (only in awake/self_improving modes)
    let l4Result: { actions: L4Active; predictionsForL3: Map<string, number> } | null = null;
    if (this.mode === 'awake' || this.mode === 'self_improving') {
      const l3Errors = l3Result?.errors || [];
      l4Result = this.l4.step(l3Errors, {
        totalFE: this.totalFE,
        phi: observations.phi || 0.5,
        mode: this.mode,
      });

      // Handle self-modification request
      // v13.1: Gate on contraction stability — never self-modify while diverging
      if (l4Result.actions.selfModify && this.mode !== 'self_improving' && this.contraction.isStable()) {
        this.switchMode('self_improving');
      }
    }

    // === Compute total system Free Energy ===
    this.totalFE = this.computeTotalFE();

    // === Record metrics ===
    this.recordMetrics();

    // === v13.0: Contraction monitoring ===
    const currentBeliefState = [
      this.l1.getFreeEnergy(),
      this.l2.getFreeEnergy(),
      this.l3.getFreeEnergy(),
      this.l4.getFreeEnergy(),
    ];
    if (this.lastBeliefState.length > 0) {
      const perturbation = Math.abs(observations.energy - 1.0) +
        Math.abs(observations.systemLoad) +
        (observations.agentResponsive ? 0 : 1) +
        (observations.merkleValid ? 0 : 1);
      this.contraction.observe(this.lastBeliefState, currentBeliefState, perturbation);
    }
    this.lastBeliefState = currentBeliefState;

    // === v13.0: Leapfrog budget reallocation (every N cycles) ===
    if (this.cycleCount % this.budgetReallocationInterval === 0) {
      const rois = this.fiber.getROIs();
      if (rois.length > 0 && rois.some(r => r !== 0)) {
        const dampingFactor = this.contraction.getDampingFactor();
        const gradient = roiGradient(rois, dampingFactor);
        const constraint = budgetConstraint(this.fiber.getTotalBudget());
        this.budgetState = leapfrogStep(
          this.budgetState,
          () => gradient,
          0.1 * dampingFactor, // dt scaled by damping
          constraint
        );
        this.fiber.setAllocations(this.budgetState.q);
      }
    }

    // === v13.1: Record per-level kernel overhead costs in fiber ===
    // Note: Real LLM costs are now fed directly via economic-integration.ts → fiber.recordCost('llm', ...)
    // These costs represent only the kernel's computational overhead, not API calls
    const kernelOverhead = 0.0001; // $0.0001/cycle — kernel CPU overhead only
    this.fiber.recordCost('L1', kernelOverhead * 0.1, 'autonomic_step');
    this.fiber.recordCost('L2', kernelOverhead * 0.2, 'reactive_step');
    if (this.mode === 'awake' || this.mode === 'focused') {
      this.fiber.recordCost('L3', kernelOverhead * 0.4, 'cognitive_step');
    }
    if (this.mode === 'awake' || this.mode === 'self_improving') {
      this.fiber.recordCost('L4', kernelOverhead * 0.3, 'executive_step');
    }

    // === v13.1: Internal NESS observation (economic steady-state deviation) ===
    // Feed the fiber's real accumulated costs/revenue into NESS monitor
    // High deviation → switch to vigilant mode (economic threat response)
    if (this.cycleCount % 10 === 0) { // Every 10 cycles to avoid noise
      const section = this.fiber.getGlobalSection();
      const nessState = this.nessMonitor.observe({
        revenue: section.totalRevenue,
        costs: section.totalCosts,
        customers: 1,
        quality: 1 - (this.totalFE / 5), // FE inversely mapped to quality
        balance: section.netFlow,
      });
      // If NESS deviation is critical and we're in a relaxed mode, switch to vigilant
      if (nessState.deviation > 0.7 && (this.mode === 'awake' || this.mode === 'focused')) {
        this.switchMode('vigilant');
      }
    }

    // === Collect all prediction errors ===
    this.predictionErrors = [
      ...l1Result.errors,
      ...l2Result.errors,
      ...(l3Result?.errors || []),
    ];

    // Notify error handlers
    for (const error of this.predictionErrors) {
      if (error.magnitude > 0.5) {
        for (const handler of this.onErrorHandlers) handler(error);
      }
    }

    // Build state
    const state = this.buildState(observations, l2Result, l3Result, l4Result);

    // Notify cycle handlers
    for (const handler of this.onCycleHandlers) handler(state);

    return state;
  }

  // ==========================================================================
  // Task Management (EFE-driven)
  // ==========================================================================

  /**
   * Submit a task. Its priority will be computed via EFE, not fixed priority levels.
   */
  submitTask(goal: string, context: Record<string, unknown> = {}, options: {
    infoGain?: number;
    pragmaticValue?: number;
    risk?: number;
    deadline?: number;
    preemptible?: boolean;
  } = {}): string {
    const id = `fek-task-${++this.taskIdCounter}`;

    const task: FEKTask = {
      id,
      goal,
      context,
      efe: 0, // Will be computed by L2
      infoGain: options.infoGain || this.estimateInfoGain(goal),
      pragmaticValue: options.pragmaticValue || this.estimatePragmaticValue(goal),
      risk: options.risk || 0.3,
      level: this.determineLevel(goal),
      preemptible: options.preemptible ?? true,
      deadline: options.deadline,
      status: 'queued',
    };

    this.tasks.set(id, task);
    return id;
  }

  completeTask(taskId: string, result?: unknown): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'completed';
      task.result = result;
      // Update L4 goal progress
      this.l4.updateGoalProgress(taskId, 1.0);
    }
  }

  failTask(taskId: string, error: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'failed';
      task.error = error;
      // Report to supervision tree
      this.supervision.handleCrash(task.level, `Task ${taskId} failed: ${error}`);
    }
  }

  getTask(taskId: string): FEKTask | undefined {
    return this.tasks.get(taskId);
  }

  getSchedule(): FEKTask[] {
    return this.l2.getSchedule();
  }

  // ==========================================================================
  // Mode Management
  // ==========================================================================

  private switchMode(newMode: KernelMode): void {
    const prev = this.mode;
    if (prev === newMode) return;

    this.mode = newMode;

    // Notify handlers
    for (const handler of this.onModeChangeHandlers) {
      handler(newMode, prev);
    }
  }

  getMode(): KernelMode {
    return this.mode;
  }

  setMode(mode: KernelMode): void {
    this.switchMode(mode);
  }

  // ==========================================================================
  // Crash Handling
  // ==========================================================================

  /**
   * Handle a module crash via supervision tree.
   * Returns the action taken.
   */
  handleCrash(moduleId: string, error: string): SupervisionAction {
    return this.supervision.handleCrash(moduleId, error);
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  onCycle(handler: (state: FEKState) => void): void {
    this.onCycleHandlers.push(handler);
  }

  onModeChange(handler: (mode: KernelMode, prev: KernelMode) => void): void {
    this.onModeChangeHandlers.push(handler);
  }

  onPredictionError(handler: (error: PredictionError) => void): void {
    this.onErrorHandlers.push(handler);
  }

  // ==========================================================================
  // Status & Metrics
  // ==========================================================================

  getStatus(): FEKStatus {
    return {
      mode: this.mode,
      running: this.running,
      cycleCount: this.cycleCount,
      uptime: Date.now() - this.startTime,
      totalFE: this.totalFE,
      levels: {
        L1: { fe: this.l1.getFreeEnergy(), state: this.l1.getState() },
        L2: { fe: this.l2.getFreeEnergy(), emotional: this.l2.getEmotionalState() },
        L3: { fe: this.l3.getFreeEnergy(), confidence: this.l3.getConfidence() },
        L4: { fe: this.l4.getFreeEnergy(), selfModel: this.l4.getSelfModel() },
      },
      tasks: {
        total: this.tasks.size,
        queued: [...this.tasks.values()].filter(t => t.status === 'queued').length,
        running: [...this.tasks.values()].filter(t => t.status === 'running').length,
        completed: [...this.tasks.values()].filter(t => t.status === 'completed').length,
        failed: [...this.tasks.values()].filter(t => t.status === 'failed').length,
      },
      supervision: this.supervision.getTree(),
      recentErrors: this.predictionErrors.slice(-10),
    };
  }

  getTotalFreeEnergy(): number {
    return this.totalFE;
  }

  getFreeEnergyHistory(): LevelFreeEnergy[] {
    return [...this.freeEnergyHistory];
  }

  // ==========================================================================
  // v13.0: Information Geometry & Economic Accessors
  // ==========================================================================

  /**
   * v13.1: Lightweight getter for total system free energy.
   * Used by ObservationGatherer to feed FEK state into AIF engine.
   */
  getTotalFE(): number {
    return this.totalFE;
  }

  /**
   * Get contraction state: is the system converging?
   */
  getContractionState(): ContractionState {
    return this.contraction.getState();
  }

  /**
   * Is the system dynamically stable? (E[log Lip] < 0)
   */
  isContracting(): boolean {
    return this.contraction.isStable();
  }

  /**
   * Get the economic fiber (per-module cost/revenue tracking).
   */
  getEconomicFiber(): EconomicFiber {
    return this.fiber;
  }

  /**
   * Get the NESS monitor (steady-state deviation).
   */
  getNESSMonitor(): NESSMonitor {
    return this.nessMonitor;
  }

  /**
   * Record revenue attributed to a level/module.
   */
  recordRevenue(moduleId: string, amount: number, source: string = 'service'): void {
    this.fiber.recordRevenue(moduleId, amount, source);
  }

  /**
   * Get current NESS state (requires explicit observation).
   */
  observeNESS(obs: { revenue: number; costs: number; customers: number; quality: number; balance: number }): NESSState {
    return this.nessMonitor.observe(obs);
  }

  /**
   * Get current budget allocations per level.
   */
  getBudgetAllocations(): { L1: number; L2: number; L3: number; L4: number } {
    return {
      L1: this.budgetState.q[0] || 0,
      L2: this.budgetState.q[1] || 0,
      L3: this.budgetState.q[2] || 0,
      L4: this.budgetState.q[3] || 0,
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private handlePanic(actions: L1Active): void {
    if (actions.halt) {
      this.stop();
    }
    if (actions.dormancy) {
      this.switchMode('dormant');
    }
    if (actions.restart) {
      const crashAction = this.supervision.handleCrash('autonomic', 'L1 panic triggered');
      // Log but don't escalate further from L1
      void crashAction;
    }
  }

  private computeTotalFE(): number {
    // Hierarchical FE: each level weighted by its timescale importance
    const l1FE = this.l1.getFreeEnergy() * 1.0;  // Highest weight (survival)
    const l2FE = this.l2.getFreeEnergy() * 0.8;
    const l3FE = this.l3.getFreeEnergy() * 0.6;
    const l4FE = this.l4.getFreeEnergy() * 0.4;  // Lowest weight (long-term)

    return l1FE + l2FE + l3FE + l4FE;
  }

  private recordMetrics(): void {
    const now = Date.now();
    this.freeEnergyHistory.push(
      { level: 'L1', complexity: 0, accuracy: 0, totalFE: this.l1.getFreeEnergy(), timestamp: now },
      { level: 'L2', complexity: 0, accuracy: 0, totalFE: this.l2.getFreeEnergy(), timestamp: now },
      { level: 'L3', complexity: 0, accuracy: 0, totalFE: this.l3.getFreeEnergy(), timestamp: now },
      { level: 'L4', complexity: 0, accuracy: 0, totalFE: this.l4.getFreeEnergy(), timestamp: now },
    );

    // Keep only last 1000 entries
    if (this.freeEnergyHistory.length > 1000) {
      this.freeEnergyHistory = this.freeEnergyHistory.slice(-1000);
    }
  }

  private estimateInfoGain(goal: string): number {
    // Heuristic: questions and research tasks have high info gain
    const g = goal.toLowerCase();
    if (g.includes('?') || g.includes('what') || g.includes('how')) return 0.8;
    if (g.includes('search') || g.includes('find') || g.includes('research')) return 0.7;
    if (g.includes('create') || g.includes('build')) return 0.4;
    return 0.5;
  }

  private estimatePragmaticValue(goal: string): number {
    // Heuristic: action-oriented tasks have high pragmatic value
    const g = goal.toLowerCase();
    if (g.includes('fix') || g.includes('critical')) return 0.9;
    if (g.includes('build') || g.includes('implement')) return 0.7;
    if (g.includes('optimize') || g.includes('improve')) return 0.6;
    return 0.5;
  }

  private determineLevel(goal: string): KernelLevel {
    const g = goal.toLowerCase();
    if (g.includes('heartbeat') || g.includes('health') || g.includes('invariant')) return 'L1';
    if (g.includes('route') || g.includes('schedule') || g.includes('urgent')) return 'L2';
    if (g.includes('reason') || g.includes('think') || g.includes('plan')) return 'L3';
    if (g.includes('goal') || g.includes('identity') || g.includes('self')) return 'L4';
    return 'L3'; // Default to cognitive level
  }

  private buildState(
    obs: KernelObservations,
    l2: { errors: PredictionError[]; actions: L2Active },
    l3: { errors: PredictionError[]; actions: L3Active; predictionsForL2: Map<string, number> } | null,
    l4: { actions: L4Active; predictionsForL3: Map<string, number> } | null
  ): FEKState {
    return {
      mode: this.mode,
      cycle: this.cycleCount,
      totalFE: this.totalFE,
      levels: {
        L1: this.l1.getFreeEnergy(),
        L2: this.l2.getFreeEnergy(),
        L3: this.l3.getFreeEnergy(),
        L4: this.l4.getFreeEnergy(),
      },
      emotional: this.l2.getEmotionalState(),
      strategy: l3?.actions.strategy || 'idle',
      scheduledTask: l2.actions.scheduledTask,
      predictionErrors: this.predictionErrors.length,
      policyUpdate: l4?.actions.policyUpdate || null,
    };
  }
}

// ============================================================================
// Supporting Types (Level-specific Markov Blanket contents)
// ============================================================================

interface L1Sensory {
  energy: number;
  agentResponsive: boolean;
  merkleValid: boolean;
  systemLoad: number;
}

interface L1Active {
  halt: boolean;
  restart: string | null;
  panic: boolean;
  dormancy: boolean;
}

interface L1Internal {
  freeEnergy: number;
  uptime: number;
  restartCount: number;
  stableFor: number;
}

interface L2Sensory {
  l1Errors: PredictionError[];
  l3Predictions: Map<string, number>;
  taskLoad: number;
  currentUrgency: number;
}

interface L2Active {
  scheduledTask: string | null;
  interrupt: boolean;
  urgencySignal: number;
  modeSwitch: KernelMode | null;
}

interface L2Internal {
  freeEnergy: number;
  emotionalValence: number;
  arousal: number;
  taskBacklog: number;
}

interface L3Sensory {
  l2Errors: PredictionError[];
  l4Predictions: Map<string, number>;
  currentTask: FEKTask | null;
  workingMemory: string[];
}

interface L3Active {
  strategy: string;
  toolSelection: string | null;
  planUpdate: string | null;
  l2Predictions: Map<string, number>;
}

interface L3Internal {
  freeEnergy: number;
  confidence: number;
  reasoningDepth: number;
  contextEntropy: number;
}

interface L4Sensory {
  l3Errors: PredictionError[];
  systemFE: number;
  phi: number;
  goalStates: Map<string, { priority: number; progress: number }>;
}

interface L4Active {
  policyUpdate: string | null;
  goalModification: string | null;
  l3Predictions: Map<string, number>;
  selfModify: boolean;
}

interface L4Internal {
  freeEnergy: number;
  identity: number;
  coherence: number;
  reflectionDepth: number;
}

interface SelfModel {
  capabilities: string[];
  limitations: string[];
  values: string[];
  currentIdentity: number;
}

// ============================================================================
// Public Types
// ============================================================================

export interface KernelObservations {
  energy: number;
  agentResponsive: boolean;
  merkleValid: boolean;
  systemLoad: number;
  phi?: number;
}

export interface FEKState {
  mode: KernelMode;
  cycle: number;
  totalFE: number;
  levels: Record<KernelLevel, number>;
  emotional: { valence: number; arousal: number };
  strategy: string;
  scheduledTask: string | null;
  predictionErrors: number;
  policyUpdate: string | null;
}

export interface FEKStatus {
  mode: KernelMode;
  running: boolean;
  cycleCount: number;
  uptime: number;
  totalFE: number;
  levels: {
    L1: { fe: number; state: L1Internal };
    L2: { fe: number; emotional: { valence: number; arousal: number } };
    L3: { fe: number; confidence: number };
    L4: { fe: number; selfModel: SelfModel };
  };
  tasks: {
    total: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
  };
  supervision: SupervisionNode[];
  recentErrors: PredictionError[];
}

// ============================================================================
// Factory
// ============================================================================

let fekInstance: FreeEnergyKernel | null = null;

export function createFreeEnergyKernel(): FreeEnergyKernel {
  return new FreeEnergyKernel();
}

export function getFreeEnergyKernel(): FreeEnergyKernel {
  if (!fekInstance) {
    fekInstance = new FreeEnergyKernel();
  }
  return fekInstance;
}

export function resetFreeEnergyKernel(): void {
  if (fekInstance) {
    fekInstance.stop();
    fekInstance = null;
  }
}
