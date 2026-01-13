/**
 * Genesis 6.2 - Value-Guided Active Inference Integration
 *
 * Connects the Value-Guided JEPA world model to the Active Inference engine.
 *
 * This integration enables:
 * 1. Value-augmented policy selection (EFE + V(s))
 * 2. World model predictions for trajectory simulation
 * 3. Value learning from Action outcomes
 * 4. Hybrid discrete-continuous inference
 *
 * Architecture:
 * ```
 * Observations → Active Inference Engine → Discrete Beliefs
 *                         ↓
 *              World Model Encoder → Latent State
 *                         ↓
 *              Value Function → V(s), Q(s,a)
 *                         ↓
 *              Policy = softmax(-EFE + λV)
 * ```
 */

import {
  ActiveInferenceEngine,
  createActiveInferenceEngine,
} from './core.js';

import {
  Observation,
  Beliefs,
  Policy,
  ActionType,
  ACTIONS,
  ACTION_COUNT,
} from './types.js';

import {
  ValueFunction,
  ValueGuidedJEPA,
  createValueFunction,
  createValueGuidedJEPA,
  type ValueEstimate,
  type FreeEnergyDecomposition,
  type ValueFunctionConfig,
} from '../world-model/value-jepa.js';

import type {
  LatentState,
  Action,
  ActionType as WMActionType,
} from '../world-model/types.js';

// ============================================================================
// Types
// ============================================================================

export interface ValueIntegrationConfig {
  // Weight for value function in policy (λ in policy = softmax(-EFE + λV))
  valueWeight: number;

  // Whether to use world model predictions for EFE calculation
  useWorldModelPredictions: boolean;

  // Horizon for trajectory value estimation
  predictionHorizon: number;

  // Learning rate for value updates from outcomes
  valueLearningRate: number;

  // Whether to log value integration details
  verbose: boolean;

  // Value function configuration
  valueFunctionConfig: Partial<ValueFunctionConfig>;
}

export const DEFAULT_VALUE_INTEGRATION_CONFIG: ValueIntegrationConfig = {
  valueWeight: 0.5,
  useWorldModelPredictions: true,
  predictionHorizon: 3,
  valueLearningRate: 0.01,
  verbose: false,
  valueFunctionConfig: {},
};

/**
 * Mapping from Active Inference action to World Model action
 */
const AI_TO_WM_ACTION: Record<ActionType, WMActionType> = {
  'sense.mcp': 'observe',
  'recall.memory': 'query',
  'plan.goals': 'query',
  'verify.ethics': 'query',
  'execute.task': 'execute',
  'execute.code': 'execute',    // Code Execution Mode
  'execute.shell': 'execute',   // Secure shell execution
  'adapt.code': 'transform',    // Code adaptation
  'execute.cycle': 'execute',   // Full execution cycle
  'self.modify': 'transform',   // Radical self-modification
  'self.analyze': 'query',      // Self-analysis
  'git.push': 'execute',        // Git push (high-risk, requires confirmation)
  'dream.cycle': 'transform',
  'rest.idle': 'observe',
  'recharge': 'transform',
  // v7.14 - Web & Monetization
  'web.search': 'query',        // Web search via MCP
  'web.scrape': 'query',        // Web scraping via MCP
  'web.browse': 'execute',      // Browser automation
  'deploy.service': 'execute',  // Cloud deployment
  'content.generate': 'execute',// Content generation
  'market.analyze': 'query',    // Market research
  'api.call': 'execute',        // HTTP API calls
  'github.deploy': 'execute',   // GitHub operations
};

// ============================================================================
// Value-Augmented Active Inference Engine
// ============================================================================

export class ValueAugmentedEngine {
  private aiEngine: ActiveInferenceEngine;
  private valueFunction: ValueFunction;
  private jepa: ValueGuidedJEPA | null = null;

  private config: ValueIntegrationConfig;

  // Current latent state (synchronized with beliefs)
  private latentState: LatentState | null = null;

  // Statistics
  private stats = {
    cycleCount: 0,
    totalValue: 0,
    valueUpdates: 0,
    trajectoryPredictions: 0,
  };

  // Event handlers
  private eventHandlers: ((event: ValueIntegrationEvent) => void)[] = [];

  constructor(
    aiEngine?: ActiveInferenceEngine,
    config: Partial<ValueIntegrationConfig> = {}
  ) {
    this.config = { ...DEFAULT_VALUE_INTEGRATION_CONFIG, ...config };
    this.aiEngine = aiEngine ?? createActiveInferenceEngine();
    this.valueFunction = createValueFunction(this.config.valueFunctionConfig);
  }

  /**
   * Initialize with JEPA for full world model integration
   */
  async initializeJEPA(): Promise<void> {
    this.jepa = await createValueGuidedJEPA(this.config.valueFunctionConfig);
    this.emit({ type: 'jepa_initialized', timestamp: new Date() });
  }

  // ============================================================================
  // Core Integration
  // ============================================================================

  /**
   * Full inference cycle with value augmentation
   */
  async step(observation: Observation): Promise<{
    action: ActionType;
    beliefs: Beliefs;
    value: ValueEstimate;
    policy: Policy;
  }> {
    this.stats.cycleCount++;

    // 1. Update beliefs via Active Inference
    const beliefs = this.aiEngine.inferStates(observation);

    // 2. Convert beliefs to latent state
    this.latentState = this.beliefsToLatentState(beliefs, observation);

    // 3. Compute value of current state
    const currentValue = this.valueFunction.estimate(this.latentState);

    // 4. Compute value-augmented policy
    const policy = await this.computeValueAugmentedPolicy(beliefs);

    // 5. Sample action
    const action = this.sampleFromPolicy(policy);

    // Track statistics
    this.stats.totalValue += currentValue.value;

    this.emit({
      type: 'step_complete',
      timestamp: new Date(),
      data: { action, beliefs, value: currentValue, policy },
    });

    return { action, beliefs, value: currentValue, policy };
  }

  /**
   * Compute policy with value augmentation
   *
   * Policy ∝ exp(-EFE + λ * V(s'))
   *
   * Where V(s') is the expected value of the next state under each action.
   */
  async computeValueAugmentedPolicy(beliefs: Beliefs): Promise<Policy> {
    // Get base EFE policy from Active Inference engine
    const basePolicy = this.aiEngine.inferPolicies();

    if (!this.latentState) {
      return basePolicy; // No value augmentation without latent state
    }

    // Compute value augmentation for each action
    const valueAugments: number[] = [];

    for (let a = 0; a < ACTION_COUNT; a++) {
      const actionType = ACTIONS[a];
      const augment = await this.computeActionValueAugment(actionType);
      valueAugments[a] = augment;
    }

    // Combine: policy ∝ exp(log(basePolicy) + λ * valueAugment)
    const logPolicy = basePolicy.map((p, i) =>
      Math.log(Math.max(p, 1e-10)) + this.config.valueWeight * valueAugments[i]
    );

    // Softmax to get final policy
    const maxLogP = Math.max(...logPolicy);
    const expPolicy = logPolicy.map(lp => Math.exp(lp - maxLogP));
    const sumExp = expPolicy.reduce((a, b) => a + b, 0);
    const policy = expPolicy.map(e => e / sumExp);

    if (this.config.verbose) {
      console.log('[Value Integration] Base policy:', basePolicy.map(p => p.toFixed(3)));
      console.log('[Value Integration] Value augments:', valueAugments.map(v => v.toFixed(3)));
      console.log('[Value Integration] Final policy:', policy.map(p => p.toFixed(3)));
    }

    return policy;
  }

  /**
   * Compute value augmentation for a specific action
   */
  private async computeActionValueAugment(actionType: ActionType): Promise<number> {
    if (!this.latentState) return 0;

    if (this.jepa && this.config.useWorldModelPredictions) {
      // Use JEPA for trajectory prediction
      const wmAction = this.createWorldModelAction(actionType);
      const predicted = await this.jepa.predictWithValue(this.latentState, wmAction);

      this.stats.trajectoryPredictions++;

      // Return expected value of next state
      return predicted.value.value;
    } else {
      // Simple heuristic based on action type
      return this.heuristicActionValue(actionType);
    }
  }

  /**
   * Heuristic value for actions when JEPA is not available
   */
  private heuristicActionValue(actionType: ActionType): number {
    const beliefs = this.aiEngine.getBeliefs();
    const state = this.aiEngine.getMostLikelyState();

    // Value based on current state and action appropriateness
    switch (actionType) {
      case 'recharge':
        // High value when energy is low
        return state.viability === 'critical' ? 0.9 :
               state.viability === 'low' ? 0.6 :
               state.viability === 'medium' ? 0.2 : 0;

      case 'rest.idle':
        // Value at attractor (Wu Wei)
        return state.viability === 'optimal' &&
               state.worldState === 'stable' ? 0.8 : 0.1;

      case 'execute.task':
        // High value when ready to execute
        return state.viability === 'optimal' &&
               state.goalProgress !== 'achieved' ? 0.7 : 0.2;

      case 'sense.mcp':
        // Value for sensing when coupling is weak
        return state.coupling === 'none' ? 0.5 :
               state.coupling === 'weak' ? 0.4 : 0.2;

      case 'plan.goals':
        // Value when not blocked but not yet on track
        return state.goalProgress === 'blocked' ? 0.6 :
               state.goalProgress === 'slow' ? 0.5 : 0.2;

      case 'recall.memory':
        return state.worldState === 'unknown' ? 0.5 : 0.2;

      case 'dream.cycle':
        return state.worldState === 'changing' ? 0.4 : 0.1;

      case 'verify.ethics':
        return 0.3; // Always moderately valuable

      default:
        return 0;
    }
  }

  /**
   * Convert Active Inference action to World Model action
   */
  private createWorldModelAction(actionType: ActionType): Action {
    const wmType = AI_TO_WM_ACTION[actionType] ?? 'observe';

    return {
      id: `ai-${actionType}-${Date.now()}`,
      type: wmType,
      parameters: { sourceAction: actionType },
      agent: 'active-inference',
      timestamp: new Date(),
    };
  }

  /**
   * Convert beliefs to latent state
   */
  private beliefsToLatentState(beliefs: Beliefs, observation: Observation): LatentState {
    // Create a latent vector from beliefs and observations
    // This is a simplified mapping - in practice would use learned encoder

    const vector: number[] = [];

    // Encode beliefs (each factor as part of the vector)
    vector.push(...beliefs.viability);      // 5 dims
    vector.push(...beliefs.worldState);     // 4 dims
    vector.push(...beliefs.coupling);       // 5 dims
    vector.push(...beliefs.goalProgress);   // 4 dims = 18 dims total

    // Encode observations
    vector.push(observation.energy / 4);    // Normalized
    vector.push(observation.phi / 3);
    vector.push(observation.tool / 2);
    vector.push(observation.coherence / 2);
    vector.push(observation.task / 3);      // +5 dims = 23 dims

    // Pad to standard latent dimension (64)
    const targetDim = 64;
    while (vector.length < targetDim) {
      // Fill with derived features
      const idx = vector.length;
      if (idx < 30) {
        // Cross-products of beliefs
        const i = idx % beliefs.viability.length;
        const j = idx % beliefs.worldState.length;
        vector.push(beliefs.viability[i] * beliefs.worldState[j]);
      } else {
        // Entropy-based features
        vector.push(Math.random() * 0.1); // Small noise
      }
    }

    // Compute confidence from belief certainty
    const beliefEntropy =
      this.entropy(beliefs.viability) +
      this.entropy(beliefs.worldState) +
      this.entropy(beliefs.coupling) +
      this.entropy(beliefs.goalProgress);

    const maxEntropy =
      Math.log(5) + Math.log(4) + Math.log(5) + Math.log(4);

    const confidence = 1 - (beliefEntropy / maxEntropy);

    return {
      vector,
      dimensions: targetDim,
      sourceModality: 'state',
      sourceId: `ai-beliefs-${Date.now()}`,
      timestamp: new Date(),
      confidence,
      entropy: beliefEntropy / maxEntropy,
    };
  }

  /**
   * Sample action from policy
   */
  private sampleFromPolicy(policy: Policy): ActionType {
    const r = Math.random();
    let cumsum = 0;

    for (let i = 0; i < policy.length; i++) {
      cumsum += policy[i];
      if (r < cumsum) {
        return ACTIONS[i];
      }
    }

    return ACTIONS[ACTIONS.length - 1];
  }

  /**
   * Entropy of a probability distribution
   */
  private entropy(probs: number[]): number {
    return -probs.reduce((acc, p) => {
      if (p > 1e-10) {
        return acc + p * Math.log(p);
      }
      return acc;
    }, 0);
  }

  // ============================================================================
  // Value Learning
  // ============================================================================

  /**
   * Update value function from observed outcome
   */
  updateFromOutcome(
    previousLatent: LatentState,
    action: ActionType,
    outcome: {
      success: boolean;
      reward?: number;
      newObservation: Observation;
    }
  ): void {
    if (!previousLatent) return;

    // Compute observed return
    const observedReturn = outcome.reward ??
      (outcome.success ? 0.5 : -0.2) +
      this.observationToReward(outcome.newObservation);

    // Update value function
    this.valueFunction.update(
      previousLatent,
      observedReturn,
      this.config.valueLearningRate
    );

    this.stats.valueUpdates++;

    this.emit({
      type: 'value_updated',
      timestamp: new Date(),
      data: { action, observedReturn, success: outcome.success },
    });
  }

  /**
   * Convert observation to immediate reward signal
   */
  private observationToReward(observation: Observation): number {
    // Reward based on observation quality
    let reward = 0;

    // Energy reward
    reward += (observation.energy - 2) * 0.2; // -0.4 to +0.4

    // Phi reward
    reward += (observation.phi - 1.5) * 0.1; // -0.15 to +0.15

    // Tool success reward
    reward += (observation.tool - 1) * 0.1; // -0.1 to +0.1

    // Task progress reward
    reward += (observation.task - 1) * 0.15; // -0.15 to +0.3

    return Math.max(-1, Math.min(1, reward));
  }

  // ============================================================================
  // Advanced: Active Inference with Full EFE from Value Function
  // ============================================================================

  /**
   * Compute full Expected Free Energy using Value-Guided JEPA
   *
   * This replaces the POMDP-based EFE with world model predictions
   */
  async computeFullEFE(
    preferredState?: LatentState
  ): Promise<Map<ActionType, FreeEnergyDecomposition>> {
    if (!this.jepa || !this.latentState) {
      throw new Error('JEPA and latent state required for full EFE');
    }

    const efeMap = new Map<ActionType, FreeEnergyDecomposition>();

    // Default preferred state: high energy, stable, synced, achieved
    const preferences = preferredState ?? this.createPreferredState();

    for (const actionType of ACTIONS) {
      const wmAction = this.createWorldModelAction(actionType);

      const { freeEnergy } = await this.jepa.selectActionActiveInference(
        this.latentState,
        [wmAction],
        preferences,
        this.config.predictionHorizon
      );

      efeMap.set(actionType, freeEnergy);
    }

    return efeMap;
  }

  /**
   * Create preferred/goal latent state
   */
  private createPreferredState(): LatentState {
    // Preferred state: high energy, stable world, strong coupling, goal achieved
    const preferredBeliefs: Beliefs = {
      viability: [0, 0, 0.1, 0.3, 0.6],  // Prefer optimal
      worldState: [0, 0.7, 0.2, 0.1],    // Prefer stable
      coupling: [0, 0, 0.1, 0.3, 0.6],   // Prefer synced
      goalProgress: [0, 0, 0.2, 0.8],    // Prefer achieved
    };

    const preferredObs: Observation = {
      energy: 4,
      phi: 3,
      tool: 2,
      coherence: 2,
      task: 3,
    };

    return this.beliefsToLatentState(preferredBeliefs, preferredObs);
  }

  // ============================================================================
  // Getters
  // ============================================================================

  getAIEngine(): ActiveInferenceEngine {
    return this.aiEngine;
  }

  getValueFunction(): ValueFunction {
    return this.valueFunction;
  }

  getJEPA(): ValueGuidedJEPA | null {
    return this.jepa;
  }

  getLatentState(): LatentState | null {
    return this.latentState;
  }

  getStats() {
    return {
      ...this.stats,
      averageValue: this.stats.cycleCount > 0
        ? this.stats.totalValue / this.stats.cycleCount
        : 0,
      valueStats: this.valueFunction.getStats(),
      aiStats: this.aiEngine.getStats(),
    };
  }

  getConfig(): ValueIntegrationConfig {
    return { ...this.config };
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  on(handler: (event: ValueIntegrationEvent) => void): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx >= 0) this.eventHandlers.splice(idx, 1);
    };
  }

  private emit(event: ValueIntegrationEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (e) {
        console.error('Value integration event handler error:', e);
      }
    }
  }
}

// ============================================================================
// Event Types
// ============================================================================

export interface ValueIntegrationEvent {
  type:
    | 'jepa_initialized'
    | 'step_complete'
    | 'value_updated'
    | 'efe_computed';
  timestamp: Date;
  data?: unknown;
}

// ============================================================================
// Factory
// ============================================================================

export function createValueAugmentedEngine(
  config?: Partial<ValueIntegrationConfig>
): ValueAugmentedEngine {
  return new ValueAugmentedEngine(undefined, config);
}

/**
 * Create fully integrated engine with JEPA
 */
export async function createFullyIntegratedEngine(
  config?: Partial<ValueIntegrationConfig>
): Promise<ValueAugmentedEngine> {
  const engine = new ValueAugmentedEngine(undefined, config);
  await engine.initializeJEPA();
  return engine;
}

// ============================================================================
// Utility: Wrap existing AutonomousLoop with value integration
// ============================================================================

import { AutonomousLoop, createAutonomousLoop, type AutonomousLoopConfig } from './autonomous-loop.js';

/**
 * Configuration for value-integrated autonomous loop
 */
export interface ValueIntegratedLoopConfig extends AutonomousLoopConfig {
  valueIntegration: Partial<ValueIntegrationConfig>;
}

/**
 * Create an autonomous loop with value-guided decision making
 */
export function createValueIntegratedLoop(
  config: Partial<ValueIntegratedLoopConfig> = {}
): {
  loop: AutonomousLoop;
  valueEngine: ValueAugmentedEngine;
} {
  const { valueIntegration = {}, ...loopConfig } = config;

  // Create value-augmented engine
  const valueEngine = createValueAugmentedEngine(valueIntegration);

  // Create autonomous loop
  const loop = createAutonomousLoop(loopConfig);

  // Hook value engine into the loop's inference step
  loop.setCustomStepFunction(async (obs: Observation) => {
    const result = await valueEngine.step(obs);
    return {
      action: result.action,
      beliefs: result.beliefs,
    };
  });

  return { loop, valueEngine };
}
