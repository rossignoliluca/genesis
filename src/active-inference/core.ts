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
  ObservationPrecision,
  Beliefs,
  Policy,
  AMatrix,
  BMatrix,
  CMatrix,
  DMatrix,
  ActiveInferenceConfig,
  DEFAULT_CONFIG,
  HIDDEN_STATE_DIMS,
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
 * Used for information gain and variational free energy computation
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

  // v10.8.2: Economic observation given economic state (4×4)
  const economicA: number[][] = [
    [0.75, 0.15, 0.07, 0.03], // obs=critical
    [0.15, 0.65, 0.15, 0.05], // obs=low
    [0.07, 0.15, 0.65, 0.13], // obs=stable
    [0.03, 0.05, 0.13, 0.79], // obs=growing
  ];

  return {
    energy: energyA,
    phi: phiA,
    tool: toolA,
    coherence: coherenceA,
    task: taskA,
    economic: economicA,
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
  const economicB = createIdentityTransition(HIDDEN_STATE_DIMS.economic);

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

  // v10.8.2: Economic transitions for revenue actions
  // opportunity.scan (index 27) - slight improvement to economic state
  const scanIdx = ACTIONS.indexOf('opportunity.scan');
  for (let curr = 0; curr < 4; curr++) {
    for (let next = 0; next < 4; next++) {
      economicB[next][curr][scanIdx] = next === Math.min(curr + 1, 3) ? 0.4 : 0.2;
    }
  }
  // opportunity.build (index 29) - major economic boost
  const buildIdx = ACTIONS.indexOf('opportunity.build');
  for (let curr = 0; curr < 4; curr++) {
    for (let next = 0; next < 4; next++) {
      economicB[next][curr][buildIdx] = next === Math.min(curr + 1, 3) ? 0.5 : 0.17;
    }
  }
  // opportunity.monetize (index 30) - jumps toward growing
  const monetizeIdx = ACTIONS.indexOf('opportunity.monetize');
  for (let curr = 0; curr < 4; curr++) {
    for (let next = 0; next < 4; next++) {
      economicB[next][curr][monetizeIdx] = next === 3 ? 0.6 : 0.13;
    }
  }
  // econ.optimize (index 24) - improves economic state
  const econOptIdx = ACTIONS.indexOf('econ.optimize');
  for (let curr = 0; curr < 4; curr++) {
    for (let next = 0; next < 4; next++) {
      economicB[next][curr][econOptIdx] = next === Math.min(curr + 1, 3) ? 0.45 : 0.18;
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
    economic: normalizeB(economicB),
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
    // v10.8: Balanced with economic goals
    task: [-2, 0, 1, 5],

    // v10.8.2: Prefer growing economic health
    economic: [-8, -3, 1, 6],
  };
}

// v10.8.2: ECONOMIC_PREFERENCES integrated directly into CMatrix.economic

function createDefaultDMatrix(): DMatrix {
  // D matrix: Prior beliefs about initial state
  // Uniform priors

  return {
    viability: normalize([1, 1, 2, 1, 1]),    // Slight bias toward medium
    worldState: normalize([2, 1, 1, 1]),      // Slight bias toward unknown
    coupling: normalize([2, 1, 1, 1, 1]),     // Slight bias toward none
    goalProgress: normalize([1, 2, 1, 1]),    // Slight bias toward slow
    economic: normalize([1, 2, 2, 1]),        // Slight bias toward low/stable
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

  // Self-improved: Track action counts for UCB exploration
  private actionCounts: number[] = new Array(ACTION_COUNT).fill(1);
  private totalActions: number = ACTION_COUNT;

  // Statistics
  private stats = {
    inferenceCount: 0,
    totalSurprise: 0,
    actionsTaken: new Map<ActionType, number>(),
  };

  // Learning state: track previous step for B matrix updates
  private previousState: Beliefs | null = null;
  private previousAction: number = -1;
  private previousObservation: Observation | null = null;

  // Dirichlet concentration parameters (proper Bayesian learning)
  private aDirichlet: { [key: string]: number[][] } = {};
  private bDirichlet: { [key: string]: number[][][] } = {};

  // 🧬 Evolution: Learning history for meta-learning
  private learningHistory: Array<{
    timestamp: number;
    action: ActionType;
    surprise: number;
    beliefEntropy: number;
    outcome: 'positive' | 'negative' | 'neutral';
  }> = [];

  private readonly MAX_HISTORY = 1000;

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
      economic: [...this.D.economic],
    };

    // Initialize Dirichlet concentration parameters from A/B matrices
    // These accumulate evidence over time (proper Bayesian parameter learning)
    this.initDirichletParams();
  }

  /**
   * Initialize Dirichlet concentration parameters from current matrices.
   * Concentration = initial_matrix * prior_scale (higher = more confident prior)
   */
  private initDirichletParams(): void {
    const priorScale = 10; // How much to trust initial priors

    // A Dirichlet: one per observation modality
    this.aDirichlet = {
      energy: this.A.energy.map(row => row.map(p => p * priorScale)),
      phi: this.A.phi.map(row => row.map(p => p * priorScale)),
      tool: this.A.tool.map(row => row.map(p => p * priorScale)),
      coherence: this.A.coherence.map(row => row.map(p => p * priorScale)),
      task: this.A.task.map(row => row.map(p => p * priorScale)),
      economic: this.A.economic.map(row => row.map(p => p * priorScale)),
    };

    // B Dirichlet: one per state factor
    this.bDirichlet = {
      viability: this.B.viability.map(next =>
        next.map(curr => curr.map(act => act * priorScale))
      ),
      worldState: this.B.worldState.map(next =>
        next.map(curr => curr.map(act => act * priorScale))
      ),
      coupling: this.B.coupling.map(next =>
        next.map(curr => curr.map(act => act * priorScale))
      ),
      goalProgress: this.B.goalProgress.map(next =>
        next.map(curr => curr.map(act => act * priorScale))
      ),
      economic: this.B.economic.map(next =>
        next.map(curr => curr.map(act => act * priorScale))
      ),
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
      economic: this.updateFactor(prior.economic, likelihoods.economic),
    };

    // Iterate for convergence
    for (let i = 0; i < this.config.inferenceIterations; i++) {
      posterior.viability = this.updateFactor(posterior.viability, likelihoods.viability);
      posterior.worldState = this.updateFactor(posterior.worldState, likelihoods.worldState);
      posterior.coupling = this.updateFactor(posterior.coupling, likelihoods.coupling);
      posterior.goalProgress = this.updateFactor(posterior.goalProgress, likelihoods.goalProgress);
      posterior.economic = this.updateFactor(posterior.economic, likelihoods.economic);
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

    // Convert to policy via softmax with exploration bonus (UCB-style)
    // Self-improved: adds exploration term to prevent getting stuck
    const explorationBonus = efe.map((_, a) => {
      const count = this.actionCounts?.[a] ?? 1;
      const total = this.totalActions ?? ACTION_COUNT;
      return Math.sqrt(Math.log(total + 1) / count); // UCB term
    });
    const beta = 0.5; // Exploration weight

    // v10.8: E vector - Action prior for economic opportunity discovery
    // Biases policy toward revenue actions, stronger when economic health is low
    const econObs = this.previousObservation?.economic ?? 0;
    const econUrgency = econObs <= 1 ? 3.0 : (econObs === 2 ? 1.0 : 0.3);
    const eVector = ACTIONS.map(action => {
      if (action === 'opportunity.scan') return econUrgency * 1.5;
      if (action === 'opportunity.evaluate') return econUrgency * 1.0;
      if (action === 'opportunity.build') return econUrgency * 0.8;
      if (action === 'opportunity.monetize') return econUrgency * 0.7;
      if (action.startsWith('econ.')) return econUrgency * 0.5;
      if (action.startsWith('web.') || action === 'market.analyze') return econUrgency * 0.3;
      return 0;
    });

    const augmentedEfe = efe.map((e, i) => -e + beta * explorationBonus[i] + eVector[i]);
    const policy = softmax(augmentedEfe, this.config.actionTemperature);

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

    // Self-improved: Update action counts for UCB exploration
    this.actionCounts[selectedIdx]++;
    this.totalActions++;

    this.emit({
      type: 'action_selected',
      timestamp: new Date(),
      data: { action, probability: policy[selectedIdx] },
    });

    return action;
  }

  /**
   * Full inference cycle: observe → infer → act → LEARN
   * v10.8: Now calls updateA/updateB after each step (online learning)
   */
  step(observation: Observation): ActionType {
    // 0. LEARN from previous step (if we have a previous state)
    if (this.previousState && this.previousAction >= 0 && this.previousObservation) {
      this.learn(this.previousObservation, observation, this.previousState, this.previousAction);
    }

    // 1. Save current state BEFORE update (for next learning step)
    const preUpdateBeliefs: Beliefs = {
      viability: [...this.beliefs.viability],
      worldState: [...this.beliefs.worldState],
      coupling: [...this.beliefs.coupling],
      goalProgress: [...this.beliefs.goalProgress],
      economic: [...this.beliefs.economic],
    };

    // 2. Update beliefs
    this.inferStates(observation);

    // 3. Infer policy
    const policy = this.inferPolicies();

    // 4. Sample action
    const action = this.sampleAction(policy);

    // 5. Store for next learning step
    this.previousState = preUpdateBeliefs;
    this.previousAction = ACTIONS.indexOf(action);
    this.previousObservation = observation;

    return action;
  }

  /**
   * Online learning: update A and B matrices from experience.
   * Called automatically after each step.
   *
   * A update: "I observed O when I believed I was in state S"
   *   → strengthen A[observation][believed_state]
   *
   * B update: "I did action A in state S and ended up in state S'"
   *   → strengthen B[new_state][old_state][action]
   */
  private learn(
    prevObs: Observation,
    currentObs: Observation,
    prevBeliefs: Beliefs,
    actionIdx: number
  ): void {
    // v10.8.1: Adaptive learning rate - faster when surprised, slower when stable
    const avgSurprise = this.stats.inferenceCount > 0
      ? this.stats.totalSurprise / this.stats.inferenceCount
      : 2.0;
    const surpriseFactor = Math.min(3.0, Math.max(0.3, avgSurprise / 2.0));
    const lr = this.config.learningRateA * surpriseFactor;

    // === Update A matrix (likelihood mapping) ===
    // For each modality, update the row corresponding to the observation
    // weighted by current beliefs about the state

    // Energy observation → viability state
    for (let s = 0; s < HIDDEN_STATE_DIMS.viability; s++) {
      this.aDirichlet.energy[currentObs.energy][s] += lr * this.beliefs.viability[s];
    }
    // Recompute A.energy from Dirichlet
    for (let o = 0; o < 5; o++) {
      const row = this.aDirichlet.energy[o];
      const sum = row.reduce((a, b) => a + b, 0);
      this.A.energy[o] = row.map(v => v / sum);
    }

    // Phi observation → worldState
    for (let s = 0; s < HIDDEN_STATE_DIMS.worldState; s++) {
      this.aDirichlet.phi[currentObs.phi][s] += lr * this.beliefs.worldState[s];
    }
    for (let o = 0; o < 4; o++) {
      const row = this.aDirichlet.phi[o];
      const sum = row.reduce((a, b) => a + b, 0);
      this.A.phi[o] = row.map(v => v / sum);
    }

    // Tool observation → coupling
    for (let s = 0; s < HIDDEN_STATE_DIMS.coupling; s++) {
      this.aDirichlet.tool[currentObs.tool][s] += lr * this.beliefs.coupling[s];
    }
    for (let o = 0; o < 3; o++) {
      const row = this.aDirichlet.tool[o];
      const sum = row.reduce((a, b) => a + b, 0);
      this.A.tool[o] = row.map(v => v / sum);
    }

    // Task observation → goalProgress
    for (let s = 0; s < HIDDEN_STATE_DIMS.goalProgress; s++) {
      this.aDirichlet.task[currentObs.task][s] += lr * this.beliefs.goalProgress[s];
    }
    for (let o = 0; o < 4; o++) {
      const row = this.aDirichlet.task[o];
      const sum = row.reduce((a, b) => a + b, 0);
      this.A.task[o] = row.map(v => v / sum);
    }

    // v10.8.2: Economic observation → economic state
    const econObs = currentObs.economic ?? 2;
    for (let s = 0; s < HIDDEN_STATE_DIMS.economic; s++) {
      this.aDirichlet.economic[econObs][s] += lr * this.beliefs.economic[s];
    }
    for (let o = 0; o < 4; o++) {
      const row = this.aDirichlet.economic[o];
      const sum = row.reduce((a, b) => a + b, 0);
      this.A.economic[o] = row.map(v => v / sum);
    }

    // === Update B matrix (transition model) ===
    // "I was in state S, did action A, now I'm in state S'"
    const lrB = this.config.learningRateB * surpriseFactor;

    // Viability transitions
    for (let next = 0; next < HIDDEN_STATE_DIMS.viability; next++) {
      for (let prev = 0; prev < HIDDEN_STATE_DIMS.viability; prev++) {
        this.bDirichlet.viability[next][prev][actionIdx] +=
          lrB * prevBeliefs.viability[prev] * this.beliefs.viability[next];
      }
    }
    this.recomputeB('viability', HIDDEN_STATE_DIMS.viability, actionIdx);

    // WorldState transitions
    for (let next = 0; next < HIDDEN_STATE_DIMS.worldState; next++) {
      for (let prev = 0; prev < HIDDEN_STATE_DIMS.worldState; prev++) {
        this.bDirichlet.worldState[next][prev][actionIdx] +=
          lrB * prevBeliefs.worldState[prev] * this.beliefs.worldState[next];
      }
    }
    this.recomputeB('worldState', HIDDEN_STATE_DIMS.worldState, actionIdx);

    // Coupling transitions
    for (let next = 0; next < HIDDEN_STATE_DIMS.coupling; next++) {
      for (let prev = 0; prev < HIDDEN_STATE_DIMS.coupling; prev++) {
        this.bDirichlet.coupling[next][prev][actionIdx] +=
          lrB * prevBeliefs.coupling[prev] * this.beliefs.coupling[next];
      }
    }
    this.recomputeB('coupling', HIDDEN_STATE_DIMS.coupling, actionIdx);

    // GoalProgress transitions
    for (let next = 0; next < HIDDEN_STATE_DIMS.goalProgress; next++) {
      for (let prev = 0; prev < HIDDEN_STATE_DIMS.goalProgress; prev++) {
        this.bDirichlet.goalProgress[next][prev][actionIdx] +=
          lrB * prevBeliefs.goalProgress[prev] * this.beliefs.goalProgress[next];
      }
    }
    this.recomputeB('goalProgress', HIDDEN_STATE_DIMS.goalProgress, actionIdx);

    // v10.8.2: Economic transitions
    for (let next = 0; next < HIDDEN_STATE_DIMS.economic; next++) {
      for (let prev = 0; prev < HIDDEN_STATE_DIMS.economic; prev++) {
        this.bDirichlet.economic[next][prev][actionIdx] +=
          lrB * (prevBeliefs.economic?.[prev] ?? 0.25) * this.beliefs.economic[next];
      }
    }
    this.recomputeB('economic', HIDDEN_STATE_DIMS.economic, actionIdx);

    this.emit({
      type: 'beliefs_updated',
      timestamp: new Date(),
      data: { learning: true, actionIdx, prevObs, currentObs },
    });
  }

  /**
   * Recompute B matrix column from Dirichlet parameters
   */
  private recomputeB(factor: keyof BMatrix, dim: number, actionIdx: number): void {
    for (let prev = 0; prev < dim; prev++) {
      const col = (this.bDirichlet as any)[factor].map((next: number[][]) => next[prev][actionIdx]);
      const sum = col.reduce((a: number, b: number) => a + b, 0);
      if (sum > 0) {
        for (let next = 0; next < dim; next++) {
          (this.B[factor] as number[][][])[next][prev][actionIdx] = col[next] / sum;
        }
      }
    }
  }

  // ============================================================================
  // Helper Functions
  // ============================================================================

  private computeLikelihoods(observation: Observation): Beliefs {
    // Compute P(observation | state) for each factor
    // v11.0: Precision-weighted likelihoods
    // likelihood_eff = precision * log P(o|s)
    // When precision → 0, observation is ignored (uniform likelihood)
    // When precision → 1, full weight on observation
    const prec = observation.precision ?? { energy: 1, phi: 1, tool: 1, coherence: 1, task: 1, economic: 1 };

    // Energy observation → viability likelihood (weighted by precision)
    const viabilityLik = this.A.energy[observation.energy].map(p => prec.energy * safeLog(p));

    // Phi observation → worldState likelihood (weighted by precision)
    const worldStateLik = this.A.phi[observation.phi].map(p => prec.phi * safeLog(p));

    // Tool observation → coupling likelihood (weighted by precision)
    const couplingLik = this.A.tool[observation.tool].map(p => prec.tool * safeLog(p));

    // Task observation → goalProgress likelihood (weighted by precision)
    const goalProgressLik = this.A.task[observation.task].map(p => prec.task * safeLog(p));

    // Coherence affects worldState (weighted by coherence precision)
    const coherenceLik = this.A.coherence[observation.coherence];
    for (let i = 0; i < worldStateLik.length; i++) {
      worldStateLik[i] += prec.coherence * safeLog(coherenceLik[i] || 0.1);
    }

    // v10.8.2: Economic observation → economic state likelihood (weighted)
    const economicLik = this.A.economic[observation.economic ?? 2].map(p => prec.economic * safeLog(p));

    return {
      viability: viabilityLik,
      worldState: worldStateLik,
      coupling: couplingLik,
      goalProgress: goalProgressLik,
      economic: economicLik,
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
    // EFE = Ambiguity + Risk - Information Gain (Friston 2017)
    //
    // - Ambiguity: H(o|s,π) - observational uncertainty
    // - Risk: D_KL[Q(s|π) || P(s)] - divergence from preferred outcomes
    // - Information Gain: E[D_KL[Q(s|o,π) || Q(s|π)]] - epistemic value (SUBTRACTED!)

    // 1. Predicted next state distribution Q(s'|a)
    const predictedViability = this.predictNextState(this.beliefs.viability, this.B.viability, actionIdx);
    const predictedWorldState = this.predictNextState(this.beliefs.worldState, this.B.worldState, actionIdx);
    const predictedCoupling = this.predictNextState(this.beliefs.coupling, this.B.coupling, actionIdx);
    const predictedGoalProgress = this.predictNextState(this.beliefs.goalProgress, this.B.goalProgress, actionIdx);
    const predictedEconomic = this.predictNextState(this.beliefs.economic, this.B.economic, actionIdx);

    // 2. Expected observations under predicted states P(o|s')
    const expectedEnergy = matVec(this.A.energy, predictedViability);
    const expectedPhi = matVec(this.A.phi, predictedWorldState);
    const expectedTool = matVec(this.A.tool, predictedCoupling);
    const expectedTask = matVec(this.A.task, predictedGoalProgress);
    const expectedEconomic = matVec(this.A.economic, predictedEconomic);

    // 3. Ambiguity: H(o|s,π) - entropy of predicted observations
    //    High ambiguity = uncertain what we'll observe = BAD
    const ambiguity =
      entropy(expectedEnergy) +
      entropy(expectedPhi) +
      entropy(expectedTool) +
      entropy(expectedTask) +
      entropy(expectedEconomic);

    // 4. Risk: negative expected utility (pragmatic value)
    //    High risk = far from preferred outcomes = BAD
    const risk =
      -dot(expectedEnergy, this.C.energy) +
      -dot(expectedPhi, this.C.phi) +
      -dot(expectedTool, this.C.tool) +
      -dot(expectedTask, this.C.task) +
      -dot(expectedEconomic, this.C.economic);

    // 5. Information Gain (epistemic value): E[D_KL[Q(s|o,π) || Q(s|π)]]
    //    Approximated as mutual information between states and observations
    //    High info gain = action will teach us something = GOOD (subtract from EFE)
    const infoGain = this.computeInformationGain(
      actionIdx,
      predictedViability,
      predictedWorldState,
      predictedCoupling,
      predictedGoalProgress,
      predictedEconomic
    );

    // EFE = ambiguity + risk - infoGain
    // Lower is better: reduce ambiguity, reduce risk, increase information gain
    return ambiguity + risk - this.config.explorationBonus * infoGain;
  }

  /**
   * Compute expected information gain for an action
   * This is the epistemic value - how much the action teaches us about the world
   */
  private computeInformationGain(
    actionIdx: number,
    predViability: number[],
    predWorld: number[],
    predCoupling: number[],
    predGoal: number[],
    predEconomic: number[]
  ): number {
    // Information gain ≈ I(S'; O|a) = H(O|a) - H(O|S',a)
    // = entropy of predicted observations - expected conditional entropy

    // Predicted observation distributions
    const predObs = {
      energy: matVec(this.A.energy, predViability),
      phi: matVec(this.A.phi, predWorld),
      tool: matVec(this.A.tool, predCoupling),
      task: matVec(this.A.task, predGoal),
      economic: matVec(this.A.economic, predEconomic),
    };

    // Marginal entropy of observations H(O|a)
    const marginalEntropy =
      entropy(predObs.energy) +
      entropy(predObs.phi) +
      entropy(predObs.tool) +
      entropy(predObs.task) +
      entropy(predObs.economic);

    // Conditional entropy H(O|S',a) - weighted average of observation entropy per state
    // This is lower when the A matrices are more deterministic (less ambiguous)
    let conditionalEntropy = 0;

    // For each state, compute weighted entropy of observations
    for (let s = 0; s < predViability.length; s++) {
      if (predViability[s] > 1e-10) {
        conditionalEntropy += predViability[s] * entropy(this.A.energy[s] || []);
      }
    }
    for (let s = 0; s < predWorld.length; s++) {
      if (predWorld[s] > 1e-10) {
        conditionalEntropy += predWorld[s] * entropy(this.A.phi[s] || []);
      }
    }
    for (let s = 0; s < predCoupling.length; s++) {
      if (predCoupling[s] > 1e-10) {
        conditionalEntropy += predCoupling[s] * entropy(this.A.tool[s] || []);
      }
    }
    for (let s = 0; s < predGoal.length; s++) {
      if (predGoal[s] > 1e-10) {
        conditionalEntropy += predGoal[s] * entropy(this.A.task[s] || []);
      }
    }
    for (let s = 0; s < predEconomic.length; s++) {
      if (predEconomic[s] > 1e-10) {
        conditionalEntropy += predEconomic[s] * entropy(this.A.economic[s] || []);
      }
    }

    // Information gain = marginal - conditional (always >= 0 by data processing inequality)
    return Math.max(0, marginalEntropy - conditionalEntropy);
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
    const expectedEconomic = matVec(this.A.economic, this.beliefs.economic);

    const surprise =
      -safeLog(expectedEnergy[observation.energy]) +
      -safeLog(expectedPhi[observation.phi]) +
      -safeLog(expectedTool[observation.tool]) +
      -safeLog(expectedTask[observation.task]) +
      -safeLog(expectedEconomic[observation.economic ?? 2]);

    return surprise;
  }

  // ============================================================================
  // 🧬 Evolution: Meta-Learning System
  // ============================================================================

  /**
   * Record a learning event for meta-analysis
   */
  recordLearningEvent(
    action: ActionType,
    surprise: number,
    outcome: 'positive' | 'negative' | 'neutral'
  ): void {
    const beliefEntropy = this.computeBeliefEntropy();

    this.learningHistory.push({
      timestamp: Date.now(),
      action,
      surprise,
      beliefEntropy,
      outcome,
    });

    // Maintain size limit (FIFO)
    while (this.learningHistory.length > this.MAX_HISTORY) {
      this.learningHistory.shift();
    }
  }

  /**
   * Analyze learning patterns to detect meta-level trends
   */
  analyzeLearningPatterns(): {
    avgSurprise: number;
    surpriseTrend: 'decreasing' | 'stable' | 'increasing';
    successRate: number;
    dominantAction: ActionType | null;
    learningVelocity: number;
    recommendation: string;
  } {
    if (this.learningHistory.length < 20) {
      return {
        avgSurprise: 0,
        surpriseTrend: 'stable',
        successRate: 0,
        dominantAction: null,
        learningVelocity: 0,
        recommendation: 'Insufficient data for analysis',
      };
    }

    const recent = this.learningHistory.slice(-100);
    const older = this.learningHistory.slice(-200, -100);

    // Calculate metrics
    const avgSurprise = recent.reduce((s, e) => s + e.surprise, 0) / recent.length;
    const oldAvgSurprise = older.length > 0
      ? older.reduce((s, e) => s + e.surprise, 0) / older.length
      : avgSurprise;

    const surpriseTrend = avgSurprise < oldAvgSurprise - 0.5 ? 'decreasing'
                        : avgSurprise > oldAvgSurprise + 0.5 ? 'increasing'
                        : 'stable';

    const positiveCount = recent.filter(e => e.outcome === 'positive').length;
    const successRate = positiveCount / recent.length;

    // Find dominant action
    const actionCounts = new Map<ActionType, number>();
    for (const event of recent) {
      actionCounts.set(event.action, (actionCounts.get(event.action) || 0) + 1);
    }
    let dominantAction: ActionType | null = null;
    let maxCount = 0;
    for (const [action, count] of actionCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantAction = action;
      }
    }

    // Learning velocity: rate of surprise reduction
    const learningVelocity = older.length > 0 ? (oldAvgSurprise - avgSurprise) / 100 : 0;

    // Generate recommendation
    let recommendation: string;
    if (surpriseTrend === 'decreasing' && successRate > 0.6) {
      recommendation = 'Learning is progressing well. Continue current strategy.';
    } else if (surpriseTrend === 'increasing') {
      recommendation = 'Environment may be changing. Consider exploration actions.';
    } else if (successRate < 0.3) {
      recommendation = 'Low success rate. Consider adjusting action preferences.';
    } else {
      recommendation = 'Learning is stable. Monitor for changes.';
    }

    return {
      avgSurprise,
      surpriseTrend,
      successRate,
      dominantAction,
      learningVelocity,
      recommendation,
    };
  }

  /**
   * Get learning history for external analysis
   */
  getLearningHistory() {
    return [...this.learningHistory];
  }

  private computeBeliefEntropy(): number {
    const h = (probs: number[]) => -probs.reduce((acc, p) =>
      p > 1e-10 ? acc + p * Math.log(p) : acc, 0);

    return (
      h(this.beliefs.viability) +
      h(this.beliefs.worldState) +
      h(this.beliefs.coupling) +
      h(this.beliefs.goalProgress) +
      h(this.beliefs.economic)
    ) / 5;
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
    economic: string;
  } {
    const argmax = (arr: number[]) => arr.indexOf(Math.max(...arr));

    return {
      viability: ['critical', 'low', 'medium', 'high', 'optimal'][argmax(this.beliefs.viability)],
      worldState: ['unknown', 'stable', 'changing', 'hostile'][argmax(this.beliefs.worldState)],
      coupling: ['none', 'weak', 'medium', 'strong', 'synced'][argmax(this.beliefs.coupling)],
      goalProgress: ['blocked', 'slow', 'onTrack', 'achieved'][argmax(this.beliefs.goalProgress)],
      economic: ['critical', 'low', 'stable', 'growing'][argmax(this.beliefs.economic)],
    };
  }

  /**
   * Export learned matrices for persistence between sessions.
   * Call this before shutdown to save learning progress.
   */
  exportLearnedModel(): { A: AMatrix; B: BMatrix; beliefs: Beliefs; actionCounts: number[]; totalActions: number } {
    return {
      A: JSON.parse(JSON.stringify(this.A)),
      B: JSON.parse(JSON.stringify(this.B)),
      beliefs: JSON.parse(JSON.stringify(this.beliefs)),
      actionCounts: [...this.actionCounts],
      totalActions: this.totalActions,
    };
  }

  /**
   * Import previously learned matrices.
   * Call at startup to resume from previous learning.
   */
  importLearnedModel(model: { A?: AMatrix; B?: BMatrix; beliefs?: Beliefs; actionCounts?: number[]; totalActions?: number }): void {
    if (model.A) this.A = model.A;
    if (model.B) this.B = model.B;
    if (model.beliefs) this.beliefs = model.beliefs;
    if (model.actionCounts) this.actionCounts = model.actionCounts;
    if (model.totalActions) this.totalActions = model.totalActions;
    // Reinit Dirichlet from imported matrices
    this.initDirichletParams();
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
      economic: [...this.D.economic],
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
