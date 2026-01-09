/**
 * Genesis 6.1 - Active Inference Core
 *
 * Pure mathematics for Active Inference (pymdp-style)
 *
 * Based on:
 * - Free Energy Principle (Friston)
 * - pymdp library (Python Active Inference)
 * - RxInfer.jl (reactive message passing)
 *
 * Key functions:
 * - inferStates: Update beliefs given observations
 * - inferPolicies: Select policy by minimizing Expected Free Energy
 * - sampleAction: Sample action from policy
 *
 * NO external dependencies - pure TypeScript math.
 */

import {
  Observation,
  Beliefs,
  Policy,
  AMatrix,
  BMatrix,
  CMatrix,
  DMatrix,
  ActiveInferenceConfig,
  DEFAULT_CONFIG,
  HIDDEN_STATE_DIMS,
  OBSERVATION_DIMS,
  ACTION_COUNT,
  ACTIONS,
  ActionType,
  AIEvent,
  AIEventHandler,
} from './types.js';

// ============================================================================
// Math Utilities
// ============================================================================

/**
 * Softmax function: converts log-probabilities to probabilities
 */
function softmax(logits: number[], temperature: number = 1.0): number[] {
  const maxLogit = Math.max(...logits);
  const exps = logits.map(l => Math.exp((l - maxLogit) / temperature));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sum);
}

/**
 * Normalize a probability distribution
 */
function normalize(probs: number[]): number[] {
  const sum = probs.reduce((a, b) => a + b, 0);
  if (sum === 0) return probs.map(() => 1 / probs.length);
  return probs.map(p => p / sum);
}

/**
 * Entropy of a probability distribution
 */
function entropy(probs: number[]): number {
  return -probs.reduce((acc, p) => {
    if (p > 1e-10) {
      return acc + p * Math.log(p);
    }
    return acc;
  }, 0);
}

/**
 * KL divergence: D_KL(P || Q)
 */
function klDivergence(p: number[], q: number[]): number {
  return p.reduce((acc, pi, i) => {
    if (pi > 1e-10 && q[i] > 1e-10) {
      return acc + pi * Math.log(pi / q[i]);
    }
    return acc;
  }, 0);
}

/**
 * Dot product
 */
function dot(a: number[], b: number[]): number {
  return a.reduce((acc, ai, i) => acc + ai * b[i], 0);
}

/**
 * Matrix-vector multiplication
 */
function matVec(matrix: number[][], vec: number[]): number[] {
  return matrix.map(row => dot(row, vec));
}

/**
 * Log of a value with numerical stability
 */
function safeLog(x: number): number {
  return Math.log(Math.max(x, 1e-10));
}

// ============================================================================
// Default Generative Model (Priors)
// ============================================================================

function createDefaultAMatrix(): AMatrix {
  // A matrix: P(observation | hidden_state)
  // Each row sums to 1

  // Energy observation given viability (strong mapping)
  const energyA: number[][] = [
    [0.8, 0.15, 0.04, 0.005, 0.005], // obs=depleted
    [0.15, 0.7, 0.1, 0.04, 0.01],    // obs=low
    [0.04, 0.1, 0.72, 0.1, 0.04],    // obs=medium
    [0.01, 0.04, 0.1, 0.7, 0.15],    // obs=high
    [0.005, 0.005, 0.04, 0.15, 0.8], // obs=full
  ];

  // Phi observation given worldState
  const phiA: number[][] = [
    [0.7, 0.1, 0.15, 0.05],  // obs=dormant
    [0.2, 0.5, 0.2, 0.1],    // obs=low
    [0.08, 0.3, 0.5, 0.12],  // obs=medium
    [0.02, 0.1, 0.15, 0.73], // obs=high
  ];

  // Tool observation given coupling
  const toolA: number[][] = [
    [0.7, 0.5, 0.2, 0.1, 0.05],  // obs=failed
    [0.25, 0.4, 0.5, 0.4, 0.25], // obs=partial
    [0.05, 0.1, 0.3, 0.5, 0.7],  // obs=success
  ];

  // Coherence observation given worldState
  const coherenceA: number[][] = [
    [0.3, 0.1, 0.3, 0.7],   // obs=broken
    [0.4, 0.3, 0.5, 0.25],  // obs=degraded
    [0.3, 0.6, 0.2, 0.05],  // obs=consistent
  ];

  // Task observation given goalProgress
  const taskA: number[][] = [
    [0.8, 0.3, 0.1, 0.05],  // obs=none
    [0.15, 0.5, 0.2, 0.05], // obs=pending
    [0.04, 0.15, 0.6, 0.1], // obs=active
    [0.01, 0.05, 0.1, 0.8], // obs=completed
  ];

  return {
    energy: energyA,
    phi: phiA,
    tool: toolA,
    coherence: coherenceA,
    task: taskA,
  };
}

function createDefaultBMatrix(): BMatrix {
  // B matrix: P(next_state | current_state, action)
  // B[next][current][action]

  const numActions = ACTION_COUNT;

  // Helper to create identity-like transition (mostly stays same)
  function createIdentityTransition(dim: number): number[][][] {
    const B: number[][][] = [];
    for (let next = 0; next < dim; next++) {
      B[next] = [];
      for (let curr = 0; curr < dim; curr++) {
        B[next][curr] = [];
        for (let act = 0; act < numActions; act++) {
          // Default: high probability of staying same
          B[next][curr][act] = next === curr ? 0.7 : 0.3 / (dim - 1);
        }
      }
    }
    return B;
  }

  const viabilityB = createIdentityTransition(HIDDEN_STATE_DIMS.viability);
  const worldStateB = createIdentityTransition(HIDDEN_STATE_DIMS.worldState);
  const couplingB = createIdentityTransition(HIDDEN_STATE_DIMS.coupling);
  const goalProgressB = createIdentityTransition(HIDDEN_STATE_DIMS.goalProgress);

  // Customize transitions for specific actions

  // Action 0: sense.mcp - improves coupling
  for (let curr = 0; curr < 5; curr++) {
    for (let next = 0; next < 5; next++) {
      // Increase coupling
      couplingB[next][curr][0] = next === Math.min(curr + 1, 4) ? 0.6 : 0.1;
    }
  }

  // Action 1: recall.memory - improves worldState understanding
  for (let curr = 0; curr < 4; curr++) {
    for (let next = 0; next < 4; next++) {
      worldStateB[next][curr][1] = next === 1 ? 0.6 : 0.13; // Move toward stable
    }
  }

  // Action 2: plan.goals - improves goalProgress
  for (let curr = 0; curr < 4; curr++) {
    for (let next = 0; next < 4; next++) {
      goalProgressB[next][curr][2] = next === Math.min(curr + 1, 3) ? 0.5 : 0.17;
    }
  }

  // Action 4: execute.task - major goalProgress boost
  for (let curr = 0; curr < 4; curr++) {
    for (let next = 0; next < 4; next++) {
      goalProgressB[next][curr][4] = next === 3 ? 0.4 : 0.2; // Jump to achieved
    }
  }

  // Action 5: dream.cycle - consolidates worldState
  for (let curr = 0; curr < 4; curr++) {
    for (let next = 0; next < 4; next++) {
      worldStateB[next][curr][5] = next === 1 ? 0.5 : 0.17; // Move toward stable
    }
  }

  // Action 6: rest.idle - slight viability recovery
  for (let curr = 0; curr < 5; curr++) {
    for (let next = 0; next < 5; next++) {
      viabilityB[next][curr][6] = next === Math.min(curr + 1, 4) ? 0.4 : 0.15;
    }
  }

  // Action 7: recharge - major viability boost
  for (let curr = 0; curr < 5; curr++) {
    for (let next = 0; next < 5; next++) {
      viabilityB[next][curr][7] = next === 4 ? 0.7 : 0.075; // Jump to optimal
    }
  }

  // Normalize B matrices
  function normalizeB(B: number[][][]): number[][][] {
    const dim = B.length;
    for (let curr = 0; curr < dim; curr++) {
      for (let act = 0; act < numActions; act++) {
        const col = B.map(next => next[curr][act]);
        const sum = col.reduce((a, b) => a + b, 0);
        if (sum > 0) {
          for (let next = 0; next < dim; next++) {
            B[next][curr][act] /= sum;
          }
        }
      }
    }
    return B;
  }

  return {
    viability: normalizeB(viabilityB),
    worldState: normalizeB(worldStateB),
    coupling: normalizeB(couplingB),
    goalProgress: normalizeB(goalProgressB),
  };
}

function createDefaultCMatrix(): CMatrix {
  // C matrix: log P(preferred observation)
  // Positive = attractive, Negative = aversive

  return {
    // Strongly prefer high energy
    energy: [-10, -5, 0, 2, 4],

    // Prefer high consciousness
    phi: [-5, -1, 1, 3],

    // Prefer successful tool calls
    tool: [-3, 0, 2],

    // Prefer coherent world model
    coherence: [-4, 0, 2],

    // Strongly prefer task completion
    task: [-2, 0, 1, 5],
  };
}

function createDefaultDMatrix(): DMatrix {
  // D matrix: Prior beliefs about initial state
  // Uniform priors

  return {
    viability: normalize([1, 1, 2, 1, 1]),    // Slight bias toward medium
    worldState: normalize([2, 1, 1, 1]),      // Slight bias toward unknown
    coupling: normalize([2, 1, 1, 1, 1]),     // Slight bias toward none
    goalProgress: normalize([1, 2, 1, 1]),    // Slight bias toward slow
  };
}

// ============================================================================
// Active Inference Engine
// ============================================================================

export class ActiveInferenceEngine {
  private config: ActiveInferenceConfig;

  // Generative model
  private A: AMatrix;
  private B: BMatrix;
  private C: CMatrix;
  private D: DMatrix;

  // Current beliefs
  private beliefs: Beliefs;

  // Event handlers
  private eventHandlers: AIEventHandler[] = [];

  // Statistics
  private stats = {
    inferenceCount: 0,
    totalSurprise: 0,
    actionsTaken: new Map<ActionType, number>(),
  };

  constructor(config: Partial<ActiveInferenceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize generative model
    this.A = createDefaultAMatrix();
    this.B = createDefaultBMatrix();
    this.C = createDefaultCMatrix();
    this.D = createDefaultDMatrix();

    // Initialize beliefs to priors
    this.beliefs = {
      viability: [...this.D.viability],
      worldState: [...this.D.worldState],
      coupling: [...this.D.coupling],
      goalProgress: [...this.D.goalProgress],
    };
  }

  // ============================================================================
  // Core Inference Functions
  // ============================================================================

  /**
   * Update beliefs given observations (state inference)
   *
   * Uses Bayesian inference:
   * P(s|o) ∝ P(o|s) * P(s)
   *
   * Iterates to find fixed point (variational inference)
   */
  inferStates(observation: Observation): Beliefs {
    const prior = this.beliefs;

    // Compute likelihoods for each factor
    const likelihoods = this.computeLikelihoods(observation);

    // Update each factor independently (mean-field approximation)
    const posterior: Beliefs = {
      viability: this.updateFactor(prior.viability, likelihoods.viability),
      worldState: this.updateFactor(prior.worldState, likelihoods.worldState),
      coupling: this.updateFactor(prior.coupling, likelihoods.coupling),
      goalProgress: this.updateFactor(prior.goalProgress, likelihoods.goalProgress),
    };

    // Iterate for convergence
    for (let i = 0; i < this.config.inferenceIterations; i++) {
      posterior.viability = this.updateFactor(posterior.viability, likelihoods.viability);
      posterior.worldState = this.updateFactor(posterior.worldState, likelihoods.worldState);
      posterior.coupling = this.updateFactor(posterior.coupling, likelihoods.coupling);
      posterior.goalProgress = this.updateFactor(posterior.goalProgress, likelihoods.goalProgress);
    }

    // Store updated beliefs
    this.beliefs = posterior;
    this.stats.inferenceCount++;

    // Compute and track surprise
    const surprise = this.computeSurprise(observation);
    this.stats.totalSurprise += surprise;

    // Emit event
    this.emit({
      type: 'beliefs_updated',
      timestamp: new Date(),
      data: { beliefs: posterior, surprise },
    });

    if (surprise > 5) {
      this.emit({
        type: 'surprise_high',
        timestamp: new Date(),
        data: { surprise, observation },
      });
    }

    return posterior;
  }

  /**
   * Infer policies by minimizing Expected Free Energy (EFE)
   *
   * EFE = ambiguity + risk
   *     = E[H(o|s,π)] + D_KL[Q(s|π) || P(s)]
   *
   * Lower EFE = better policy
   */
  inferPolicies(): Policy {
    const efe: number[] = [];

    // Compute EFE for each action
    for (let a = 0; a < ACTION_COUNT; a++) {
      efe[a] = this.computeEFE(a);
    }

    // Convert to policy via softmax (lower EFE = higher probability)
    const negEfe = efe.map(e => -e);
    const policy = softmax(negEfe, this.config.actionTemperature);

    this.emit({
      type: 'policy_inferred',
      timestamp: new Date(),
      data: { efe, policy },
    });

    return policy;
  }

  /**
   * Sample action from policy
   */
  sampleAction(policy: Policy): ActionType {
    // Sample from categorical distribution
    const r = Math.random();
    let cumsum = 0;
    let selectedIdx = 0;

    for (let i = 0; i < policy.length; i++) {
      cumsum += policy[i];
      if (r < cumsum) {
        selectedIdx = i;
        break;
      }
    }

    const action = ACTIONS[selectedIdx];

    // Track statistics
    const count = this.stats.actionsTaken.get(action) || 0;
    this.stats.actionsTaken.set(action, count + 1);

    this.emit({
      type: 'action_selected',
      timestamp: new Date(),
      data: { action, probability: policy[selectedIdx] },
    });

    return action;
  }

  /**
   * Full inference cycle: observe → infer → act
   */
  step(observation: Observation): ActionType {
    // 1. Update beliefs
    this.inferStates(observation);

    // 2. Infer policy
    const policy = this.inferPolicies();

    // 3. Sample action
    const action = this.sampleAction(policy);

    return action;
  }

  // ============================================================================
  // Helper Functions
  // ============================================================================

  private computeLikelihoods(observation: Observation): Beliefs {
    // Compute P(observation | state) for each factor

    // Energy observation → viability likelihood
    const viabilityLik = this.A.energy[observation.energy].map(p => safeLog(p));

    // Phi observation → worldState likelihood (proxy)
    const worldStateLik = this.A.phi[observation.phi].map(p => safeLog(p));

    // Tool observation → coupling likelihood
    const couplingLik = this.A.tool[observation.tool].map(p => safeLog(p));

    // Task observation → goalProgress likelihood
    const goalProgressLik = this.A.task[observation.task].map(p => safeLog(p));

    // Coherence affects worldState
    const coherenceLik = this.A.coherence[observation.coherence];
    for (let i = 0; i < worldStateLik.length; i++) {
      worldStateLik[i] += safeLog(coherenceLik[i] || 0.1);
    }

    return {
      viability: viabilityLik,
      worldState: worldStateLik,
      coupling: couplingLik,
      goalProgress: goalProgressLik,
    };
  }

  private updateFactor(prior: number[], logLikelihood: number[]): number[] {
    // Posterior ∝ likelihood * prior
    const logPrior = prior.map(p => safeLog(p));
    const logPosterior = logLikelihood.map((ll, i) => ll + logPrior[i]);
    return softmax(logPosterior, 1.0);
  }

  private computeEFE(actionIdx: number): number {
    // Expected Free Energy for a single action

    // 1. Predicted next state distribution Q(s'|a)
    const predictedViability = this.predictNextState(this.beliefs.viability, this.B.viability, actionIdx);
    const predictedWorldState = this.predictNextState(this.beliefs.worldState, this.B.worldState, actionIdx);
    const predictedCoupling = this.predictNextState(this.beliefs.coupling, this.B.coupling, actionIdx);
    const predictedGoalProgress = this.predictNextState(this.beliefs.goalProgress, this.B.goalProgress, actionIdx);

    // 2. Expected observations under predicted states
    const expectedEnergy = matVec(this.A.energy, predictedViability);
    const expectedPhi = matVec(this.A.phi, predictedWorldState);
    const expectedTool = matVec(this.A.tool, predictedCoupling);
    const expectedTask = matVec(this.A.task, predictedGoalProgress);

    // 3. Ambiguity: entropy of predicted observations
    const ambiguity =
      entropy(expectedEnergy) +
      entropy(expectedPhi) +
      entropy(expectedTool) +
      entropy(expectedTask);

    // 4. Risk: negative expected utility (preferences)
    const risk =
      -dot(expectedEnergy, this.C.energy) +
      -dot(expectedPhi, this.C.phi) +
      -dot(expectedTool, this.C.tool) +
      -dot(expectedTask, this.C.task);

    // EFE = ambiguity + risk
    return ambiguity + risk;
  }

  private predictNextState(
    currentBeliefs: number[],
    transitionMatrix: number[][][],
    actionIdx: number
  ): number[] {
    // P(s'|a) = sum_s P(s'|s,a) * P(s)
    const dim = currentBeliefs.length;
    const predicted: number[] = new Array(dim).fill(0);

    for (let next = 0; next < dim; next++) {
      for (let curr = 0; curr < dim; curr++) {
        predicted[next] += transitionMatrix[next][curr][actionIdx] * currentBeliefs[curr];
      }
    }

    return normalize(predicted);
  }

  private computeSurprise(observation: Observation): number {
    // Surprise = -log P(o|beliefs)
    const expectedEnergy = matVec(this.A.energy, this.beliefs.viability);
    const expectedPhi = matVec(this.A.phi, this.beliefs.worldState);
    const expectedTool = matVec(this.A.tool, this.beliefs.coupling);
    const expectedTask = matVec(this.A.task, this.beliefs.goalProgress);

    const surprise =
      -safeLog(expectedEnergy[observation.energy]) +
      -safeLog(expectedPhi[observation.phi]) +
      -safeLog(expectedTool[observation.tool]) +
      -safeLog(expectedTask[observation.task]);

    return surprise;
  }

  // ============================================================================
  // Public Getters
  // ============================================================================

  getBeliefs(): Beliefs {
    return { ...this.beliefs };
  }

  getStats() {
    return {
      inferenceCount: this.stats.inferenceCount,
      averageSurprise: this.stats.inferenceCount > 0
        ? this.stats.totalSurprise / this.stats.inferenceCount
        : 0,
      actionCounts: Object.fromEntries(this.stats.actionsTaken),
    };
  }

  getMostLikelyState(): {
    viability: string;
    worldState: string;
    coupling: string;
    goalProgress: string;
  } {
    const argmax = (arr: number[]) => arr.indexOf(Math.max(...arr));

    return {
      viability: ['critical', 'low', 'medium', 'high', 'optimal'][argmax(this.beliefs.viability)],
      worldState: ['unknown', 'stable', 'changing', 'hostile'][argmax(this.beliefs.worldState)],
      coupling: ['none', 'weak', 'medium', 'strong', 'synced'][argmax(this.beliefs.coupling)],
      goalProgress: ['blocked', 'slow', 'onTrack', 'achieved'][argmax(this.beliefs.goalProgress)],
    };
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  on(handler: AIEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx >= 0) this.eventHandlers.splice(idx, 1);
    };
  }

  private emit(event: AIEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (e) {
        console.error('AI event handler error:', e);
      }
    }
  }

  // ============================================================================
  // Model Updates (Online Learning)
  // ============================================================================

  /**
   * Update A matrix based on observation-state pairs (supervised)
   */
  updateAMatrix(observation: Observation, trueState: Partial<Beliefs>): void {
    // Simple counting update for A matrix
    // In practice, would use proper Dirichlet updates

    if (trueState.viability) {
      const stateIdx = trueState.viability.indexOf(Math.max(...trueState.viability));
      this.A.energy[observation.energy][stateIdx] += this.config.learningRateA;
      // Re-normalize
      const sum = this.A.energy[observation.energy].reduce((a, b) => a + b, 0);
      this.A.energy[observation.energy] = this.A.energy[observation.energy].map(p => p / sum);
    }
  }

  /**
   * Reset beliefs to priors
   */
  resetBeliefs(): void {
    this.beliefs = {
      viability: [...this.D.viability],
      worldState: [...this.D.worldState],
      coupling: [...this.D.coupling],
      goalProgress: [...this.D.goalProgress],
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createActiveInferenceEngine(
  config?: Partial<ActiveInferenceConfig>
): ActiveInferenceEngine {
  return new ActiveInferenceEngine(config);
}
