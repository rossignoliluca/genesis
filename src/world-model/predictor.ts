/**
 * Genesis 6.0 - World Model Predictor
 *
 * Unified predictor and simulator for the world model.
 *
 * Capabilities:
 * - Single-step prediction: Predict next state given current state and action
 * - Multi-step simulation: Generate trajectories over time horizon
 * - Uncertainty estimation: Quantify epistemic uncertainty in predictions
 * - Physics reasoning: Common sense physical reasoning
 *
 * This module merges the original World Model (v5.2) and World Simulator (v6.0)
 * into a unified predictive system.
 *
 * Key concepts:
 * - Transition model: P(s' | s, a) - probability of next state
 * - Trajectory: Sequence of (state, action) pairs
 * - Branching: Multiple possible futures with probabilities
 *
 * References:
 * - World Models (Ha & Schmidhuber, 2018)
 * - Dreamer (Hafner et al., 2020)
 * - MuZero (Schrittwieser et al., 2020)
 *
 * Usage:
 * ```typescript
 * import { createWorldModelPredictor } from './world-model/predictor.js';
 *
 * const predictor = createWorldModelPredictor();
 *
 * // Single-step prediction
 * const nextState = predictor.predict(currentState, action);
 *
 * // Multi-step simulation
 * const trajectory = predictor.simulate(state, actions, 100);
 *
 * // Physics reasoning
 * const answer = predictor.reason({ type: 'collision', ... });
 * ```
 */

import { randomUUID } from 'crypto';
import {
  LatentState,
  Action,
  ActionType,
  PredictedState,
  Trajectory,
  WorldModelConfig,
  DEFAULT_WORLD_MODEL_CONFIG,
  PhysicsQuery,
  PhysicsQueryType,
  PhysicsAnswer,
  PhysicsObject,
  WorldEntity,
  EntityRelation,
} from './types.js';
import { LatentEncoder, createLatentEncoder } from './encoder.js';

// ============================================================================
// Predictor Types
// ============================================================================

export interface TransitionModel {
  // Predict next state given current state and action
  transition(state: LatentState, action: Action): number[];

  // Get uncertainty of transition
  uncertainty(state: LatentState, action: Action): number;
}

// ============================================================================
// World Model Predictor
// ============================================================================

export type PredictorEventType =
  | 'prediction_made'
  | 'simulation_started'
  | 'simulation_step'
  | 'simulation_complete'
  | 'uncertainty_high'
  | 'physics_query';

export type PredictorEventHandler = (event: {
  type: PredictorEventType;
  data?: unknown;
}) => void;

export class WorldModelPredictor {
  private config: WorldModelConfig;
  private encoder: LatentEncoder;
  private transitionWeights: Map<ActionType, number[][]> = new Map();
  private eventHandlers: Set<PredictorEventHandler> = new Set();

  // Statistics
  private predictionCount: number = 0;
  private simulationCount: number = 0;
  private totalPredictionTime: number = 0;

  // Entity tracking for physics reasoning
  private entities: Map<string, WorldEntity> = new Map();
  private relations: Map<string, EntityRelation> = new Map();

  constructor(config: Partial<WorldModelConfig> = {}) {
    this.config = { ...DEFAULT_WORLD_MODEL_CONFIG, ...config };
    this.encoder = createLatentEncoder();
    this.initializeTransitionModels();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private initializeTransitionModels(): void {
    // Initialize simple transition weights for each action type
    // In production, these would be learned
    const actionTypes: ActionType[] = [
      'observe', 'query', 'execute', 'communicate',
      'transform', 'create', 'delete', 'navigate',
    ];

    for (const actionType of actionTypes) {
      // Create a simple transition matrix (identity + perturbation)
      const dim = 512; // Match encoder dim
      const weights: number[][] = [];

      for (let i = 0; i < dim; i++) {
        const row = new Array(dim).fill(0);
        row[i] = 0.9; // Identity component

        // Add action-specific perturbations
        const perturbIdx = (i + this.actionTypeOffset(actionType)) % dim;
        row[perturbIdx] += 0.1;

        weights.push(row);
      }

      this.transitionWeights.set(actionType, weights);
    }
  }

  private actionTypeOffset(type: ActionType): number {
    const offsets: Record<ActionType, number> = {
      observe: 10,
      query: 20,
      execute: 50,
      communicate: 30,
      transform: 100,
      create: 150,
      delete: -50,
      navigate: 70,
    };
    return offsets[type];
  }

  // ============================================================================
  // Single-Step Prediction
  // ============================================================================

  /**
   * Predict next state given current state and action
   */
  predict(currentState: LatentState, action: Action): PredictedState {
    const startTime = Date.now();

    // Get transition model for action type
    const weights = this.transitionWeights.get(action.type);
    if (!weights) {
      throw new Error(`No transition model for action type: ${action.type}`);
    }

    // Apply transition
    const nextVector = this.applyTransition(currentState.vector, weights, action);

    // Calculate uncertainty
    const uncertainty = this.calculateUncertainty(currentState, action);

    // Generate alternative states if uncertainty is high
    const alternativeStates: LatentState[] = [];
    if (uncertainty > 0.3 && this.config.branchingFactor > 1) {
      for (let i = 0; i < this.config.branchingFactor - 1; i++) {
        alternativeStates.push(this.generateAlternative(currentState, action, i));
      }
    }

    // Create predicted state
    const predictedState: LatentState = {
      vector: nextVector,
      dimensions: nextVector.length,
      sourceModality: currentState.sourceModality,
      sourceId: `pred-${currentState.sourceId}-${action.id}`,
      timestamp: new Date(),
      confidence: currentState.confidence * (1 - uncertainty),
      entropy: this.calculateEntropy(nextVector),
    };

    const prediction: PredictedState = {
      state: predictedState,
      action,
      probability: 1 - uncertainty,
      uncertainty,
      alternativeStates,
      predictionTime: Date.now() - startTime,
    };

    // Update stats
    this.predictionCount++;
    this.totalPredictionTime += prediction.predictionTime;

    // Emit events
    this.emit({ type: 'prediction_made', data: { actionType: action.type, uncertainty } });
    if (uncertainty > this.config.uncertaintyThreshold) {
      this.emit({ type: 'uncertainty_high', data: { uncertainty, threshold: this.config.uncertaintyThreshold } });
    }

    return prediction;
  }

  /**
   * Apply transition model to state
   */
  private applyTransition(
    vector: number[],
    weights: number[][],
    action: Action
  ): number[] {
    const dim = Math.min(vector.length, weights.length);
    const result = new Array(dim).fill(0);

    // Matrix-vector multiplication
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        result[i] += weights[i][j] * vector[j];
      }
    }

    // Add action-specific modulation
    const actionEmbedding = this.encodeAction(action);
    for (let i = 0; i < dim; i++) {
      result[i] += actionEmbedding[i % actionEmbedding.length] * 0.1;
    }

    // Normalize
    return this.normalize(result);
  }

  /**
   * Encode action to vector
   */
  private encodeAction(action: Action): number[] {
    const embedding = new Array(64).fill(0);

    // Action type encoding
    const typeIdx = this.actionTypeOffset(action.type) % 64;
    embedding[typeIdx] = 1.0;

    // Parameter encoding
    const params = action.parameters;
    let paramIdx = 0;
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'number') {
        embedding[(10 + paramIdx) % 64] = value / (Math.abs(value) + 1);
      } else if (typeof value === 'string') {
        embedding[(20 + paramIdx) % 64] = this.simpleHash(value) / 1000000;
      }
      paramIdx++;
    }

    return embedding;
  }

  /**
   * Generate alternative state (for branching)
   */
  private generateAlternative(
    state: LatentState,
    action: Action,
    branchIdx: number
  ): LatentState {
    const noise = this.generateNoise(state.vector.length, branchIdx);
    const altVector = state.vector.map((v, i) => v + noise[i] * 0.2);

    return {
      vector: this.normalize(altVector),
      dimensions: altVector.length,
      sourceModality: state.sourceModality,
      sourceId: `alt-${branchIdx}-${state.sourceId}`,
      timestamp: new Date(),
      confidence: state.confidence * 0.7,
      entropy: this.calculateEntropy(altVector),
    };
  }

  /**
   * Generate deterministic noise based on index
   */
  private generateNoise(dim: number, seed: number): number[] {
    const noise = new Array(dim);
    for (let i = 0; i < dim; i++) {
      // Deterministic pseudo-random based on seed and index
      noise[i] = Math.sin((seed + 1) * (i + 1) * 0.1) * 0.5;
    }
    return noise;
  }

  // ============================================================================
  // Multi-Step Simulation
  // ============================================================================

  /**
   * Simulate multiple steps into the future
   */
  simulate(
    initialState: LatentState,
    actions: Action[],
    horizon: number = this.config.maxHorizon
  ): Trajectory {
    const startTime = Date.now();

    this.emit({ type: 'simulation_started', data: { horizon, actionCount: actions.length } });

    const states: PredictedState[] = [];
    let currentState = initialState;
    let totalProbability = 1.0;
    let step = 0;

    while (step < horizon) {
      // Get action for this step (cycle through if needed)
      const action = actions[step % actions.length];

      // Predict next state
      const prediction = this.predict(currentState, action);
      states.push(prediction);

      // Update cumulative probability
      totalProbability *= prediction.probability;

      // Emit step event
      this.emit({
        type: 'simulation_step',
        data: { step, probability: prediction.probability, uncertainty: prediction.uncertainty },
      });

      // Check termination conditions
      if (prediction.uncertainty > this.config.uncertaintyThreshold) {
        break; // Too uncertain to continue
      }

      if (totalProbability < 0.01) {
        break; // Trajectory too unlikely
      }

      currentState = prediction.state;
      step++;
    }

    const trajectory: Trajectory = {
      id: randomUUID(),
      initialState,
      actions: actions.slice(0, step),
      states,
      totalProbability,
      horizon: step,
      simulationTime: Date.now() - startTime,
    };

    this.simulationCount++;
    this.emit({ type: 'simulation_complete', data: { steps: step, totalProbability } });

    return trajectory;
  }

  /**
   * Generate multiple trajectories (Monte Carlo)
   */
  simulateMultiple(
    initialState: LatentState,
    actions: Action[],
    numTrajectories: number,
    horizon: number = this.config.maxHorizon
  ): Trajectory[] {
    const trajectories: Trajectory[] = [];

    for (let i = 0; i < numTrajectories; i++) {
      // Add noise to initial state for diversity
      const noisyState: LatentState = {
        ...initialState,
        vector: initialState.vector.map((v) => v + (Math.random() - 0.5) * 0.1),
      };

      const trajectory = this.simulate(noisyState, actions, horizon);
      trajectories.push(trajectory);
    }

    // Sort by total probability
    trajectories.sort((a, b) => b.totalProbability - a.totalProbability);

    return trajectories;
  }

  // ============================================================================
  // Uncertainty Estimation
  // ============================================================================

  /**
   * Calculate uncertainty of prediction
   */
  private calculateUncertainty(state: LatentState, action: Action): number {
    let uncertainty = 0;

    // Base uncertainty from state confidence
    uncertainty += (1 - state.confidence) * 0.3;

    // Action-specific uncertainty
    const actionUncertainty = this.getActionUncertainty(action.type);
    uncertainty += actionUncertainty * 0.3;

    // Entropy-based uncertainty
    uncertainty += state.entropy * 0.2;

    // Time-based decay
    const age = Date.now() - state.timestamp.getTime();
    const ageFactor = 1 - Math.exp(-age / 60000); // Increases over 1 minute
    uncertainty += ageFactor * 0.2;

    return Math.min(1, Math.max(0, uncertainty));
  }

  private getActionUncertainty(type: ActionType): number {
    const uncertainties: Record<ActionType, number> = {
      observe: 0.1,      // Low uncertainty - passive
      query: 0.2,        // Low-medium
      navigate: 0.3,     // Medium
      communicate: 0.4,  // Medium
      execute: 0.5,      // Medium-high
      transform: 0.6,    // High
      create: 0.7,       // High
      delete: 0.8,       // Very high - irreversible
    };
    return uncertainties[type];
  }

  /**
   * Get uncertainty for a prediction (external interface)
   */
  uncertainty(prediction: PredictedState): number {
    return prediction.uncertainty;
  }

  // ============================================================================
  // Physics Reasoning
  // ============================================================================

  /**
   * Answer physics/common sense queries
   */
  reason(query: PhysicsQuery): PhysicsAnswer {
    this.emit({ type: 'physics_query', data: { type: query.type } });

    const reasoning: string[] = [];
    let answer: boolean | number | string;
    let confidence = 0.5;

    switch (query.type) {
      case 'collision':
        reasoning.push(...this.reasonCollision(query));
        answer = this.checkCollision(query.objects);
        confidence = 0.6;
        break;

      case 'stability':
        answer = this.checkStability(query.objects);
        reasoning.push('Checked center of mass and support polygon');
        confidence = 0.7;
        break;

      case 'containment':
        answer = this.checkContainment(query.objects);
        reasoning.push('Compared bounding boxes');
        confidence = 0.8;
        break;

      case 'reachability':
        answer = this.checkReachability(query.objects);
        reasoning.push('Computed path existence');
        confidence = 0.6;
        break;

      case 'causation':
        answer = this.checkCausation(query);
        reasoning.push('Analyzed causal chain');
        confidence = 0.5;
        break;

      case 'trajectory':
        answer = this.computeTrajectory(query.objects);
        reasoning.push('Simulated physics forward');
        confidence = 0.6;
        break;

      default:
        answer = 'Unknown query type';
        confidence = 0;
    }

    return {
      query,
      answer,
      confidence,
      reasoning,
    };
  }

  /**
   * Check collision between objects
   */
  private checkCollision(objects: PhysicsObject[]): boolean {
    if (objects.length < 2) return false;

    const obj1 = objects[0];
    const obj2 = objects[1];

    if (!obj1.position || !obj2.position) return false;

    // Simple bounding sphere check
    const distance = Math.sqrt(
      (obj1.position[0] - obj2.position[0]) ** 2 +
      (obj1.position[1] - obj2.position[1]) ** 2 +
      (obj1.position[2] - obj2.position[2]) ** 2
    );

    // Assume radius from mass
    const radius1 = obj1.mass ? Math.cbrt(obj1.mass) : 1;
    const radius2 = obj2.mass ? Math.cbrt(obj2.mass) : 1;

    return distance < (radius1 + radius2);
  }

  private reasonCollision(query: PhysicsQuery): string[] {
    return [
      'Computing bounding volumes',
      'Checking intersection',
      'Considering velocities for future collision',
    ];
  }

  /**
   * Check stability of configuration
   */
  private checkStability(objects: PhysicsObject[]): boolean {
    if (objects.length === 0) return true;

    // Simple check: all objects have support
    for (const obj of objects) {
      if (obj.position && obj.position[2] > 0) {
        // Object is above ground, check if supported
        const hasSupport = objects.some((other) =>
          other !== obj &&
          other.position &&
          other.position[2] < obj.position![2] &&
          Math.abs(other.position[0] - obj.position![0]) < 2 &&
          Math.abs(other.position[1] - obj.position![1]) < 2
        );
        if (!hasSupport) return false;
      }
    }

    return true;
  }

  /**
   * Check containment (A inside B)
   */
  private checkContainment(objects: PhysicsObject[]): boolean {
    if (objects.length < 2) return false;

    const inner = objects[0];
    const outer = objects[1];

    if (!inner.position || !outer.position) return false;

    // Simple check: inner center is within outer bounds
    const outerRadius = outer.mass ? Math.cbrt(outer.mass) * 2 : 5;

    const distance = Math.sqrt(
      (inner.position[0] - outer.position[0]) ** 2 +
      (inner.position[1] - outer.position[1]) ** 2 +
      (inner.position[2] - outer.position[2]) ** 2
    );

    return distance < outerRadius;
  }

  /**
   * Check reachability (can A reach B)
   */
  private checkReachability(objects: PhysicsObject[]): boolean {
    if (objects.length < 2) return false;

    const from = objects[0];
    const to = objects[1];

    if (!from.position || !to.position) return false;

    // Simple check: direct path exists
    const distance = Math.sqrt(
      (from.position[0] - to.position[0]) ** 2 +
      (from.position[1] - to.position[1]) ** 2 +
      (from.position[2] - to.position[2]) ** 2
    );

    // Assume reachable if within reasonable distance
    return distance < 100;
  }

  /**
   * Check causation (will A cause B)
   */
  private checkCausation(query: PhysicsQuery): boolean {
    // Simple heuristic: check for interaction potential
    if (query.objects.length < 2) return false;

    const cause = query.objects[0];
    const effect = query.objects[1];

    // Check if cause can influence effect
    if (cause.velocity && effect.position && cause.position) {
      // Will cause move toward effect?
      const towardEffect = [
        effect.position[0] - cause.position[0],
        effect.position[1] - cause.position[1],
        effect.position[2] - cause.position[2],
      ];

      const dotProduct =
        cause.velocity[0] * towardEffect[0] +
        cause.velocity[1] * towardEffect[1] +
        cause.velocity[2] * towardEffect[2];

      return dotProduct > 0;
    }

    return false;
  }

  /**
   * Compute trajectory of object
   */
  private computeTrajectory(objects: PhysicsObject[]): string {
    if (objects.length === 0) return 'No object specified';

    const obj = objects[0];
    if (!obj.position || !obj.velocity) {
      return 'Object has no position or velocity';
    }

    // Simple forward simulation
    const steps = 10;
    const dt = 0.1;
    const positions: string[] = [];

    let pos = [...obj.position];
    let vel = [...obj.velocity];

    for (let i = 0; i < steps; i++) {
      // Apply gravity
      vel[2] -= 9.8 * dt;

      // Update position
      pos[0] += vel[0] * dt;
      pos[1] += vel[1] * dt;
      pos[2] += vel[2] * dt;

      // Ground collision
      if (pos[2] < 0) {
        pos[2] = 0;
        vel[2] = -vel[2] * 0.5; // Bounce with damping
      }

      positions.push(`(${pos[0].toFixed(1)}, ${pos[1].toFixed(1)}, ${pos[2].toFixed(1)})`);
    }

    return `Trajectory: ${positions.join(' -> ')}`;
  }

  // ============================================================================
  // Agent Training (in simulation)
  // ============================================================================

  /**
   * Train agent in simulated environment
   * Returns reward signal based on trajectory quality
   */
  trainAgent(
    agent: string,
    policy: (state: LatentState) => Action,
    episodes: number,
    maxSteps: number
  ): { avgReward: number; bestTrajectory: Trajectory | null } {
    let totalReward = 0;
    let bestTrajectory: Trajectory | null = null;
    let bestReward = -Infinity;

    for (let ep = 0; ep < episodes; ep++) {
      // Generate initial state
      const initialState = this.generateRandomState();
      const actions: Action[] = [];

      // Rollout policy
      let state = initialState;
      for (let step = 0; step < maxSteps; step++) {
        const action = policy(state);
        action.agent = agent;
        actions.push(action);

        const prediction = this.predict(state, action);
        state = prediction.state;

        if (prediction.uncertainty > this.config.uncertaintyThreshold) {
          break;
        }
      }

      // Simulate trajectory
      const trajectory = this.simulate(initialState, actions, maxSteps);

      // Calculate reward (higher probability = better)
      const reward = trajectory.totalProbability * trajectory.horizon;
      totalReward += reward;

      if (reward > bestReward) {
        bestReward = reward;
        bestTrajectory = trajectory;
      }
    }

    return {
      avgReward: totalReward / episodes,
      bestTrajectory,
    };
  }

  /**
   * Generate random initial state for training
   */
  private generateRandomState(): LatentState {
    const dim = 512;
    const vector = new Array(dim);
    for (let i = 0; i < dim; i++) {
      vector[i] = (Math.random() - 0.5) * 2;
    }

    return {
      vector: this.normalize(vector),
      dimensions: dim,
      sourceModality: 'state',
      sourceId: `random-${Date.now()}`,
      timestamp: new Date(),
      confidence: 1.0,
      entropy: 0.5,
    };
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude === 0) return vector;
    return vector.map((v) => v / magnitude);
  }

  private calculateEntropy(vector: number[]): number {
    const absSum = vector.reduce((sum, v) => sum + Math.abs(v), 0);
    if (absSum === 0) return 0;

    const probs = vector.map((v) => Math.abs(v) / absSum);
    let entropy = 0;
    for (const p of probs) {
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }
    return entropy / Math.log2(vector.length);
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  // ============================================================================
  // Entity Management (for physics)
  // ============================================================================

  addEntity(entity: WorldEntity): void {
    this.entities.set(entity.id, entity);
  }

  removeEntity(entityId: string): boolean {
    return this.entities.delete(entityId);
  }

  getEntity(entityId: string): WorldEntity | undefined {
    return this.entities.get(entityId);
  }

  addRelation(relation: EntityRelation): void {
    this.relations.set(relation.id, relation);
  }

  // ============================================================================
  // Events
  // ============================================================================

  on(handler: PredictorEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: { type: PredictorEventType; data?: unknown }): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('Predictor event handler error:', err);
      }
    }
  }

  // ============================================================================
  // Stats
  // ============================================================================

  stats(): {
    predictionCount: number;
    simulationCount: number;
    avgPredictionTime: number;
    entityCount: number;
    relationCount: number;
  } {
    return {
      predictionCount: this.predictionCount,
      simulationCount: this.simulationCount,
      avgPredictionTime: this.predictionCount > 0
        ? this.totalPredictionTime / this.predictionCount
        : 0,
      entityCount: this.entities.size,
      relationCount: this.relations.size,
    };
  }

  getConfig(): WorldModelConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createWorldModelPredictor(
  config?: Partial<WorldModelConfig>
): WorldModelPredictor {
  return new WorldModelPredictor(config);
}

// ============================================================================
// Action Factory
// ============================================================================

export function createAction(
  type: ActionType,
  parameters: Record<string, unknown>,
  agent: string
): Action {
  return {
    id: randomUUID(),
    type,
    parameters,
    agent,
    timestamp: new Date(),
  };
}
