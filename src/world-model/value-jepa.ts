/**
 * Genesis 6.2 - Value-Guided JEPA (Joint Embedding Predictive Architecture)
 *
 * Extends the world model with value functions for decision-making.
 *
 * Scientific foundations:
 * - LeCun (2022): JEPA - predict in latent space, not pixel space
 * - Friston: Free Energy Principle - minimize expected free energy
 * - Hafner (2019): Dreamer - value learning in world models
 * - Schmidhuber: Curiosity-driven learning via prediction error
 *
 * The value function evaluates predicted states to guide:
 * 1. Action selection (which action leads to best outcome?)
 * 2. Trajectory planning (which path maximizes value?)
 * 3. Dream consolidation (which memories are most valuable?)
 *
 * Integration with Active Inference:
 * - G(π) = E[log P(o|s)] - KL[Q(s)||P(s)] + Value(s)
 * - Expected Free Energy includes value term for goal-directedness
 */

import type {
  LatentState,
  Action,
  PredictedState,
  Trajectory,
  WorldModelSystemConfig,
} from './types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Value function output for a latent state
 */
export interface ValueEstimate {
  // Core value
  value: number;              // V(s) ∈ [-1, 1], higher is better

  // Decomposed value components (for interpretability)
  components: {
    survival: number;         // Viability/energy preservation
    integrity: number;        // System coherence
    progress: number;         // Goal advancement
    novelty: number;          // Information gain (curiosity)
    efficiency: number;       // Resource optimization
  };

  // Uncertainty
  valueUncertainty: number;   // σ(V(s)), epistemic uncertainty
  valueConfidence: number;    // 1 / (1 + uncertainty)

  // Temporal
  discount: number;           // γ^t discount factor applied
  horizon: number;            // Time steps into future
}

/**
 * Value-guided trajectory with cumulative value
 */
export interface ValuedTrajectory extends Trajectory {
  // Value metrics
  totalValue: number;         // Σ γ^t V(s_t)
  expectedValue: number;      // E[Σ γ^t V(s_t)]
  valueVariance: number;      // Var[Σ γ^t V(s_t)]

  // Per-step values
  stepValues: ValueEstimate[];

  // Risk metrics
  minValue: number;           // min V(s_t) - worst case
  maxValue: number;           // max V(s_t) - best case
  riskAdjustedValue: number;  // E[V] - λ * σ(V)
}

/**
 * Action value (Q-value)
 */
export interface ActionValue {
  action: Action;
  qValue: number;             // Q(s, a) = E[V(s') | s, a]
  advantage: number;          // A(s, a) = Q(s, a) - V(s)
  qUncertainty: number;       // Uncertainty in Q-value
  predictedState: PredictedState;
}

/**
 * Value function configuration
 */
export interface ValueFunctionConfig {
  // Discount factor
  gamma: number;              // Default 0.99

  // Value component weights
  weights: {
    survival: number;         // Weight for survival component
    integrity: number;        // Weight for integrity component
    progress: number;         // Weight for progress component
    novelty: number;          // Weight for novelty/curiosity
    efficiency: number;       // Weight for efficiency
  };

  // Risk sensitivity
  riskAversion: number;       // λ for risk-adjusted value (0 = neutral, >0 = risk-averse)

  // Curiosity bonus
  curiosityBonus: number;     // β for intrinsic motivation

  // Temperature for softmax action selection
  temperature: number;

  // Horizon for value estimation
  horizon: number;
}

/**
 * Free Energy components for Active Inference integration
 */
export interface FreeEnergyDecomposition {
  // Expected Free Energy G(π)
  expectedFreeEnergy: number;

  // Components
  ambiguity: number;          // E[H[P(o|s)]] - expected uncertainty about observations
  risk: number;               // KL[Q(s|π) || P(s)] - divergence from prior preferences
  pragmaticValue: number;     // -E[log P(o|C)] - expected utility given preferences
  epistemicValue: number;     // Information gain - reduction in uncertainty

  // Value-guided addition
  instrumentalValue: number;  // V(s) contribution
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_VALUE_CONFIG: ValueFunctionConfig = {
  gamma: 0.99,
  weights: {
    survival: 0.35,           // Highest priority: stay alive
    integrity: 0.25,          // Maintain system coherence
    progress: 0.20,           // Make progress on goals
    novelty: 0.10,            // Explore and learn
    efficiency: 0.10,         // Be efficient
  },
  riskAversion: 0.5,
  curiosityBonus: 0.1,
  temperature: 1.0,
  horizon: 10,
};

// ============================================================================
// Value Function
// ============================================================================

export class ValueFunction {
  private config: ValueFunctionConfig;

  // Learned parameters (simplified - in production would use neural net)
  private survivalBasis: number[] = [];
  private integrityBasis: number[] = [];
  private progressBasis: number[] = [];

  // Statistics for normalization
  private valueStats = {
    mean: 0,
    std: 1,
    min: -1,
    max: 1,
    count: 0,
  };

  constructor(config: Partial<ValueFunctionConfig> = {}) {
    this.config = { ...DEFAULT_VALUE_CONFIG, ...config };
    this.initializeBasis();
  }

  /**
   * Initialize basis functions for value estimation
   */
  private initializeBasis(): void {
    // Simple linear basis - in production would be learned
    const dim = 64; // Latent dimension
    this.survivalBasis = Array(dim).fill(0).map(() => Math.random() * 0.1);
    this.integrityBasis = Array(dim).fill(0).map(() => Math.random() * 0.1);
    this.progressBasis = Array(dim).fill(0).map(() => Math.random() * 0.1);
  }

  /**
   * Estimate value of a latent state
   */
  estimate(state: LatentState, horizon: number = 0): ValueEstimate {
    const components = this.computeComponents(state);

    // Weighted sum of components
    const rawValue =
      this.config.weights.survival * components.survival +
      this.config.weights.integrity * components.integrity +
      this.config.weights.progress * components.progress +
      this.config.weights.novelty * components.novelty +
      this.config.weights.efficiency * components.efficiency;

    // Apply discount
    const discount = Math.pow(this.config.gamma, horizon);
    const value = rawValue * discount;

    // Estimate uncertainty from state uncertainty
    const valueUncertainty = this.estimateUncertainty(state);

    return {
      value: this.clamp(value, -1, 1),
      components,
      valueUncertainty,
      valueConfidence: 1 / (1 + valueUncertainty),
      discount,
      horizon,
    };
  }

  /**
   * Compute individual value components
   */
  private computeComponents(state: LatentState): ValueEstimate['components'] {
    const vec = state.vector;

    // Survival: based on energy-related dimensions (assumed first few)
    const survivalSignal = this.dotProduct(vec.slice(0, 16), this.survivalBasis.slice(0, 16));
    const survival = this.sigmoid(survivalSignal);

    // Integrity: based on coherence of latent representation
    const integritySignal = this.computeCoherence(vec);
    const integrity = this.sigmoid(integritySignal);

    // Progress: based on goal-related dimensions
    const progressSignal = this.dotProduct(vec.slice(16, 32), this.progressBasis.slice(0, 16));
    const progress = this.sigmoid(progressSignal);

    // Novelty: prediction error / surprise (use entropy as proxy)
    const novelty = state.entropy ?? 0.5;

    // Efficiency: inverse of confidence loss (high confidence = efficient encoding)
    const efficiency = state.confidence ?? 0.5;

    return {
      survival: this.clamp(survival, 0, 1),
      integrity: this.clamp(integrity, 0, 1),
      progress: this.clamp(progress, 0, 1),
      novelty: this.clamp(novelty, 0, 1),
      efficiency: this.clamp(efficiency, 0, 1),
    };
  }

  /**
   * Estimate uncertainty in value estimate
   */
  private estimateUncertainty(state: LatentState): number {
    // Base uncertainty from state (use 1 - confidence as uncertainty proxy)
    const stateUncertainty = 1 - (state.confidence ?? 0.5);

    // Epistemic uncertainty (how well do we know this region?)
    const noveltyFactor = this.computeNovelty(state);

    // Combined uncertainty
    return Math.min(1, stateUncertainty * 0.5 + noveltyFactor * 0.5);
  }

  /**
   * Compute novelty of state (how different from seen states)
   */
  private computeNovelty(state: LatentState): number {
    // Simplified: use vector magnitude variation as proxy
    const magnitude = Math.sqrt(this.dotProduct(state.vector, state.vector));
    return Math.abs(magnitude - 1); // Deviation from unit sphere
  }

  /**
   * Compute coherence of latent vector
   */
  private computeCoherence(vec: number[]): number {
    // Coherence: how structured is the representation
    // High coherence = smooth, low-frequency patterns
    let coherence = 0;
    for (let i = 1; i < vec.length; i++) {
      coherence += Math.abs(vec[i] - vec[i - 1]);
    }
    return -coherence / vec.length; // Lower difference = higher coherence
  }

  // ============================================================================
  // Q-Value and Advantage
  // ============================================================================

  /**
   * Compute Q-value for state-action pair
   */
  computeQValue(
    state: LatentState,
    action: Action,
    predictedState: PredictedState
  ): ActionValue {
    // V(s) - current state value
    const currentValue = this.estimate(state);

    // V(s') - predicted next state value
    const nextValue = this.estimate(predictedState.state, 1);

    // Q(s, a) = r + γV(s')
    // Reward is implicit in value difference
    const qValue = nextValue.value;

    // Advantage A(s, a) = Q(s, a) - V(s)
    const advantage = qValue - currentValue.value;

    // Uncertainty propagates
    const qUncertainty = Math.sqrt(
      currentValue.valueUncertainty ** 2 + nextValue.valueUncertainty ** 2
    );

    return {
      action,
      qValue,
      advantage,
      qUncertainty,
      predictedState,
    };
  }

  /**
   * Rank actions by Q-value
   */
  rankActions(actionValues: ActionValue[]): ActionValue[] {
    // Risk-adjusted ranking
    return [...actionValues].sort((a, b) => {
      const aRisk = a.qValue - this.config.riskAversion * a.qUncertainty;
      const bRisk = b.qValue - this.config.riskAversion * b.qUncertainty;
      return bRisk - aRisk; // Descending
    });
  }

  /**
   * Sample action using softmax over Q-values
   */
  sampleAction(actionValues: ActionValue[]): ActionValue {
    const temp = this.config.temperature;

    // Compute softmax probabilities
    const qValues = actionValues.map(av => av.qValue / temp);
    const maxQ = Math.max(...qValues);
    const expQ = qValues.map(q => Math.exp(q - maxQ));
    const sumExpQ = expQ.reduce((a, b) => a + b, 0);
    const probs = expQ.map(e => e / sumExpQ);

    // Sample
    const r = Math.random();
    let cumProb = 0;
    for (let i = 0; i < probs.length; i++) {
      cumProb += probs[i];
      if (r < cumProb) {
        return actionValues[i];
      }
    }
    return actionValues[actionValues.length - 1];
  }

  // ============================================================================
  // Trajectory Valuation
  // ============================================================================

  /**
   * Evaluate a trajectory with cumulative value
   */
  evaluateTrajectory(trajectory: Trajectory): ValuedTrajectory {
    const stepValues: ValueEstimate[] = [];
    let totalValue = 0;
    let sumSquared = 0;
    let minValue = Infinity;
    let maxValue = -Infinity;

    // Evaluate each step (trajectory.states contains PredictedState, need .state for LatentState)
    for (let t = 0; t < trajectory.states.length; t++) {
      const value = this.estimate(trajectory.states[t].state, t);
      stepValues.push(value);

      totalValue += value.value;
      sumSquared += value.value ** 2;
      minValue = Math.min(minValue, value.value);
      maxValue = Math.max(maxValue, value.value);
    }

    const n = trajectory.states.length;
    const expectedValue = totalValue / Math.max(1, n);
    const variance = (sumSquared / Math.max(1, n)) - (expectedValue ** 2);
    const valueVariance = Math.max(0, variance);

    // Risk-adjusted value
    const riskAdjustedValue = expectedValue - this.config.riskAversion * Math.sqrt(valueVariance);

    return {
      ...trajectory,
      totalValue,
      expectedValue,
      valueVariance,
      stepValues,
      minValue: minValue === Infinity ? 0 : minValue,
      maxValue: maxValue === -Infinity ? 0 : maxValue,
      riskAdjustedValue,
    };
  }

  /**
   * Select best trajectory from candidates
   */
  selectBestTrajectory(trajectories: Trajectory[]): ValuedTrajectory {
    const valued = trajectories.map(t => this.evaluateTrajectory(t));

    // Sort by risk-adjusted value
    valued.sort((a, b) => b.riskAdjustedValue - a.riskAdjustedValue);

    return valued[0];
  }

  // ============================================================================
  // Active Inference Integration
  // ============================================================================

  /**
   * Compute Expected Free Energy for Active Inference
   *
   * G(π) = ambiguity + risk - pragmatic_value - epistemic_value + instrumental_value
   */
  computeExpectedFreeEnergy(
    currentState: LatentState,
    policy: Action[],
    predictedStates: PredictedState[],
    preferences: LatentState  // Preferred/goal state
  ): FreeEnergyDecomposition {
    // 1. Ambiguity: Expected uncertainty about observations
    const ambiguity = this.computeAmbiguity(predictedStates);

    // 2. Risk: KL divergence from preferences
    const risk = this.computeRisk(predictedStates, preferences);

    // 3. Pragmatic Value: Expected utility given preferences
    const pragmaticValue = this.computePragmaticValue(predictedStates, preferences);

    // 4. Epistemic Value: Information gain
    const epistemicValue = this.computeEpistemicValue(currentState, predictedStates);

    // 5. Instrumental Value: V(s) contribution
    const instrumentalValue = this.computeInstrumentalValue(predictedStates);

    // Expected Free Energy (to be minimized)
    // Lower is better: ambiguity and risk are bad, values are good
    const expectedFreeEnergy =
      ambiguity +
      risk -
      pragmaticValue -
      epistemicValue -
      instrumentalValue;

    return {
      expectedFreeEnergy,
      ambiguity,
      risk,
      pragmaticValue,
      epistemicValue,
      instrumentalValue,
    };
  }

  /**
   * Ambiguity: Expected observation uncertainty
   */
  private computeAmbiguity(predictedStates: PredictedState[]): number {
    let totalAmbiguity = 0;
    for (let t = 0; t < predictedStates.length; t++) {
      const discount = Math.pow(this.config.gamma, t);
      // Use PredictedState.uncertainty (epistemic) or fallback to 1-confidence of the latent state
      const uncertainty = predictedStates[t].uncertainty ?? (1 - (predictedStates[t].state.confidence ?? 0.5));
      totalAmbiguity += discount * uncertainty;
    }
    return totalAmbiguity;
  }

  /**
   * Risk: Divergence from preferred states
   */
  private computeRisk(
    predictedStates: PredictedState[],
    preferences: LatentState
  ): number {
    let totalRisk = 0;
    for (let t = 0; t < predictedStates.length; t++) {
      const discount = Math.pow(this.config.gamma, t);
      const distance = this.stateDistance(predictedStates[t].state, preferences);
      totalRisk += discount * distance;
    }
    return totalRisk;
  }

  /**
   * Pragmatic Value: Alignment with preferences
   */
  private computePragmaticValue(
    predictedStates: PredictedState[],
    preferences: LatentState
  ): number {
    let totalPragmatic = 0;
    for (let t = 0; t < predictedStates.length; t++) {
      const discount = Math.pow(this.config.gamma, t);
      const similarity = 1 - this.stateDistance(predictedStates[t].state, preferences);
      totalPragmatic += discount * similarity;
    }
    return totalPragmatic;
  }

  /**
   * Epistemic Value: Information gain from exploration
   */
  private computeEpistemicValue(
    currentState: LatentState,
    predictedStates: PredictedState[]
  ): number {
    // Information gain = reduction in uncertainty (using 1 - confidence as uncertainty proxy)
    const currentUncertainty = 1 - (currentState.confidence ?? 0.5);

    let totalEpistemic = 0;
    for (let t = 0; t < predictedStates.length; t++) {
      const discount = Math.pow(this.config.gamma, t);
      const predictedUncertainty = predictedStates[t].uncertainty ?? (1 - (predictedStates[t].state.confidence ?? 0.5));
      // Positive if we expect to reduce uncertainty
      const infoGain = Math.max(0, currentUncertainty - predictedUncertainty);
      totalEpistemic += discount * infoGain * this.config.curiosityBonus;
    }
    return totalEpistemic;
  }

  /**
   * Instrumental Value: V(s) contribution
   */
  private computeInstrumentalValue(predictedStates: PredictedState[]): number {
    let totalInstrumental = 0;
    for (let t = 0; t < predictedStates.length; t++) {
      const value = this.estimate(predictedStates[t].state, t);
      totalInstrumental += value.value;
    }
    return totalInstrumental;
  }

  /**
   * Distance between two latent states
   */
  private stateDistance(a: LatentState, b: LatentState): number {
    // Cosine distance
    const dot = this.dotProduct(a.vector, b.vector);
    const normA = Math.sqrt(this.dotProduct(a.vector, a.vector));
    const normB = Math.sqrt(this.dotProduct(b.vector, b.vector));
    const cosSim = dot / (normA * normB + 1e-8);
    return (1 - cosSim) / 2; // Normalize to [0, 1]
  }

  // ============================================================================
  // Learning (Simplified)
  // ============================================================================

  /**
   * Update value function from observed returns
   */
  update(state: LatentState, observedReturn: number, learningRate: number = 0.01): void {
    const predicted = this.estimate(state);
    const error = observedReturn - predicted.value;

    // Simple gradient update on basis vectors
    // In production: backprop through neural network
    for (let i = 0; i < Math.min(16, state.vector.length); i++) {
      this.survivalBasis[i] += learningRate * error * state.vector[i] * this.config.weights.survival;
      this.progressBasis[i] += learningRate * error * state.vector[i] * this.config.weights.progress;
    }

    // Update statistics
    this.updateStats(observedReturn);
  }

  /**
   * Update running statistics for normalization
   */
  private updateStats(value: number): void {
    this.valueStats.count++;
    const n = this.valueStats.count;

    // Running mean and variance (Welford's algorithm)
    const delta = value - this.valueStats.mean;
    this.valueStats.mean += delta / n;

    if (n > 1) {
      const delta2 = value - this.valueStats.mean;
      const newVar = ((n - 2) * this.valueStats.std ** 2 + delta * delta2) / (n - 1);
      this.valueStats.std = Math.sqrt(Math.max(0, newVar));
    }

    this.valueStats.min = Math.min(this.valueStats.min, value);
    this.valueStats.max = Math.max(this.valueStats.max, value);
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  private clamp(x: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, x));
  }

  // ============================================================================
  // Getters
  // ============================================================================

  getConfig(): ValueFunctionConfig {
    return { ...this.config };
  }

  getStats() {
    return { ...this.valueStats };
  }

  /**
   * Set preference weights
   */
  setWeights(weights: Partial<ValueFunctionConfig['weights']>): void {
    this.config.weights = { ...this.config.weights, ...weights };

    // Normalize weights
    const sum = Object.values(this.config.weights).reduce((a, b) => a + b, 0);
    for (const key of Object.keys(this.config.weights) as (keyof ValueFunctionConfig['weights'])[]) {
      this.config.weights[key] /= sum;
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createValueFunction(
  config?: Partial<ValueFunctionConfig>
): ValueFunction {
  return new ValueFunction(config);
}

// Singleton
let valueFunctionInstance: ValueFunction | null = null;

export function getValueFunction(
  config?: Partial<ValueFunctionConfig>
): ValueFunction {
  if (!valueFunctionInstance) {
    valueFunctionInstance = createValueFunction(config);
  }
  return valueFunctionInstance;
}

export function resetValueFunction(): void {
  valueFunctionInstance = null;
}

// ============================================================================
// Integration with WorldModelPredictor
// ============================================================================

import type { WorldModelPredictor } from './predictor.js';

/**
 * Value-Guided JEPA Predictor
 *
 * Wraps the WorldModelPredictor with value-guided prediction
 */
export class ValueGuidedJEPA {
  private predictor: WorldModelPredictor;
  private valueFunction: ValueFunction;

  constructor(predictor: WorldModelPredictor, valueFn?: ValueFunction) {
    this.predictor = predictor;
    this.valueFunction = valueFn ?? createValueFunction();
  }

  /**
   * Predict next state and compute value
   */
  async predictWithValue(
    state: LatentState,
    action: Action
  ): Promise<PredictedState & { value: ValueEstimate }> {
    const predicted = await this.predictor.predict(state, action);
    const value = this.valueFunction.estimate(predicted.state, 1);

    return {
      ...predicted,
      value,
    };
  }

  /**
   * Generate value-guided trajectory
   *
   * Uses rollout with value-based action selection
   */
  async planWithValue(
    initialState: LatentState,
    horizon: number,
    candidateActions: Action[][],  // Actions to consider at each step
    preferences?: LatentState
  ): Promise<ValuedTrajectory> {
    const predictedStates: PredictedState[] = [];
    const actions: Action[] = [];
    const stepValues: ValueEstimate[] = [this.valueFunction.estimate(initialState, 0)];

    let currentState = initialState;

    for (let t = 0; t < horizon && t < candidateActions.length; t++) {
      const candidates = candidateActions[t];

      // Evaluate each action
      const actionValues: ActionValue[] = [];
      for (const action of candidates) {
        const predicted = await this.predictor.predict(currentState, action);
        const av = this.valueFunction.computeQValue(currentState, action, predicted);
        actionValues.push(av);
      }

      // Select best action
      const ranked = this.valueFunction.rankActions(actionValues);
      const best = ranked[0];

      // Advance state
      actions.push(best.action);
      predictedStates.push(best.predictedState);
      currentState = best.predictedState.state;
      stepValues.push(this.valueFunction.estimate(currentState, t + 1));
    }

    // Build trajectory (matching the actual Trajectory interface)
    const trajectory: Trajectory = {
      id: `traj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      initialState,
      states: predictedStates,
      actions,
      totalProbability: predictedStates.reduce((p, s) => p * s.probability, 1),
      horizon: predictedStates.length,
      simulationTime: 0,
    };

    // Evaluate full trajectory
    const valued = this.valueFunction.evaluateTrajectory(trajectory);

    // Add step values
    return {
      ...valued,
      stepValues,
    };
  }

  /**
   * Select action via Expected Free Energy minimization
   *
   * This is the core Active Inference decision rule
   */
  async selectActionActiveInference(
    currentState: LatentState,
    candidateActions: Action[],
    preferences: LatentState,
    horizon: number = 3
  ): Promise<{ action: Action; freeEnergy: FreeEnergyDecomposition }> {
    let bestAction = candidateActions[0];
    let bestFE: FreeEnergyDecomposition = {
      expectedFreeEnergy: Infinity,
      ambiguity: 0,
      risk: 0,
      pragmaticValue: 0,
      epistemicValue: 0,
      instrumentalValue: 0,
    };

    for (const action of candidateActions) {
      // Simulate trajectory under this action
      const predictedStates: PredictedState[] = [];
      let state = currentState;

      for (let t = 0; t < horizon; t++) {
        const predicted = await this.predictor.predict(state, action);
        predictedStates.push(predicted);
        state = predicted.state;
      }

      // Compute Expected Free Energy
      const fe = this.valueFunction.computeExpectedFreeEnergy(
        currentState,
        [action],
        predictedStates,
        preferences
      );

      // Lower is better
      if (fe.expectedFreeEnergy < bestFE.expectedFreeEnergy) {
        bestFE = fe;
        bestAction = action;
      }
    }

    return { action: bestAction, freeEnergy: bestFE };
  }

  /**
   * Dream-time consolidation with value-based prioritization
   *
   * Memories with higher value prediction error are replayed more
   */
  async dreamConsolidate(
    memories: Array<{ state: LatentState; action: Action; nextState: LatentState; reward: number }>,
    epochs: number = 10
  ): Promise<{ replayCount: number; avgError: number }> {
    let totalReplays = 0;
    let totalError = 0;

    for (let epoch = 0; epoch < epochs; epoch++) {
      // Prioritize by value prediction error
      const prioritized = memories.map((m) => {
        const predictedValue = this.valueFunction.estimate(m.nextState, 1);
        const error = Math.abs(m.reward - predictedValue.value);
        return { memory: m, priority: error };
      });

      // Sort by priority (higher error = more replay)
      prioritized.sort((a, b) => b.priority - a.priority);

      // Replay top memories
      const replayCount = Math.ceil(memories.length * 0.3); // Replay top 30%
      for (let i = 0; i < replayCount; i++) {
        const { memory, priority } = prioritized[i];

        // Update value function
        this.valueFunction.update(memory.nextState, memory.reward, 0.01);

        totalReplays++;
        totalError += priority;
      }
    }

    return {
      replayCount: totalReplays,
      avgError: totalError / Math.max(1, totalReplays),
    };
  }

  // ============================================================================
  // Getters
  // ============================================================================

  getValueFunction(): ValueFunction {
    return this.valueFunction;
  }

  getPredictor(): WorldModelPredictor {
    return this.predictor;
  }
}

// ============================================================================
// Factory for Value-Guided JEPA
// ============================================================================

export async function createValueGuidedJEPA(
  valueFnConfig?: Partial<ValueFunctionConfig>
): Promise<ValueGuidedJEPA> {
  // Import predictor dynamically to avoid circular deps
  const { createWorldModelPredictor } = await import('./predictor.js');

  const predictor = createWorldModelPredictor();
  const valueFn = createValueFunction(valueFnConfig);

  return new ValueGuidedJEPA(predictor, valueFn);
}
