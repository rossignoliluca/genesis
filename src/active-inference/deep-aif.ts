/**
 * Deep Active Inference - Continuous Belief States
 *
 * Based on: "Deep Active Inference for Partially Observable MDPs" (arxiv 2009.03622)
 *
 * Extends the discrete active inference with:
 * - Continuous latent belief states (instead of discrete 5-level)
 * - Neural network encoders/decoders
 * - Learned transition models
 * - Amortized inference for scalability
 */

import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface LatentState {
  mean: number[];           // μ - Mean of belief distribution
  logVar: number[];         // log(σ²) - Log variance for numerical stability
  dimension: number;        // Latent space dimensionality
}

export interface DeepAIFConfig {
  latentDim: number;        // Dimensionality of latent space (default: 64)
  hiddenDim: number;        // Hidden layer size (default: 256)
  numLayers: number;        // Number of hidden layers (default: 3)
  learningRate: number;     // Learning rate (default: 0.001)
  kldWeight: number;        // KL divergence weight (beta-VAE style)
  freeEnergyHorizon: number; // Planning horizon for EFE
  temperature: number;      // Softmax temperature for action selection
  usePrecisionWeighting: boolean; // Weight observations by precision
}

export interface Observation {
  modality: string;         // e.g., 'visual', 'proprioceptive', 'interoceptive'
  data: number[];           // Raw observation vector
  precision: number;        // Confidence in observation (0-1)
  timestamp: number;
}

export interface Action {
  type: string;
  parameters: Record<string, any>;
  embedding: number[];      // Learned action embedding
}

export interface PolicyEvaluation {
  policy: Action[];
  expectedFreeEnergy: number;
  epistemicValue: number;   // Information gain
  pragmaticValue: number;   // Goal achievement
  riskValue: number;        // Uncertainty about outcomes
}

export interface BeliefUpdate {
  prior: LatentState;
  posterior: LatentState;
  predictionError: number;
  freeEnergy: number;
  kldivergence: number;
}

// ============================================================================
// NEURAL NETWORK PRIMITIVES (Pure TypeScript, no external deps)
// ============================================================================

/**
 * Simple dense layer with ReLU/Linear activation
 */
class DenseLayer {
  weights: number[][];
  bias: number[];
  activation: 'relu' | 'linear' | 'tanh' | 'softplus';

  constructor(inputDim: number, outputDim: number, activation: 'relu' | 'linear' | 'tanh' | 'softplus' = 'relu') {
    this.activation = activation;
    // Xavier initialization
    const scale = Math.sqrt(2.0 / (inputDim + outputDim));
    this.weights = Array(outputDim).fill(0).map(() =>
      Array(inputDim).fill(0).map(() => (Math.random() - 0.5) * 2 * scale)
    );
    this.bias = Array(outputDim).fill(0);
  }

  forward(input: number[]): number[] {
    const output = this.weights.map((row, i) => {
      const sum = row.reduce((acc, w, j) => acc + w * input[j], 0) + this.bias[i];
      switch (this.activation) {
        case 'relu': return Math.max(0, sum);
        case 'tanh': return Math.tanh(sum);
        case 'softplus': return Math.log(1 + Math.exp(sum));
        default: return sum;
      }
    });
    return output;
  }

  // Gradient computation for backprop
  backward(input: number[], gradOutput: number[]): { gradInput: number[], gradWeights: number[][], gradBias: number[] } {
    const preActivation = this.weights.map((row, i) =>
      row.reduce((acc, w, j) => acc + w * input[j], 0) + this.bias[i]
    );

    // Activation gradient
    const activationGrad = preActivation.map((val, i) => {
      switch (this.activation) {
        case 'relu': return val > 0 ? gradOutput[i] : 0;
        case 'tanh': return gradOutput[i] * (1 - Math.tanh(val) ** 2);
        case 'softplus': return gradOutput[i] * (1 / (1 + Math.exp(-val)));
        default: return gradOutput[i];
      }
    });

    const gradWeights = this.weights.map((row, i) =>
      row.map((_, j) => activationGrad[i] * input[j])
    );
    const gradBias = activationGrad;
    const gradInput = input.map((_, j) =>
      this.weights.reduce((acc, row, i) => acc + row[j] * activationGrad[i], 0)
    );

    return { gradInput, gradWeights, gradBias };
  }

  updateWeights(gradWeights: number[][], gradBias: number[], lr: number) {
    this.weights = this.weights.map((row, i) =>
      row.map((w, j) => w - lr * gradWeights[i][j])
    );
    this.bias = this.bias.map((b, i) => b - lr * gradBias[i]);
  }
}

/**
 * Multi-layer perceptron
 */
class MLP {
  layers: DenseLayer[];

  constructor(dims: number[], hiddenActivation: 'relu' | 'tanh' = 'relu', outputActivation: 'linear' | 'tanh' | 'softplus' = 'linear') {
    this.layers = [];
    for (let i = 0; i < dims.length - 1; i++) {
      const isLast = i === dims.length - 2;
      this.layers.push(new DenseLayer(dims[i], dims[i + 1], isLast ? outputActivation : hiddenActivation));
    }
  }

  forward(input: number[]): number[] {
    return this.layers.reduce((x, layer) => layer.forward(x), input);
  }
}

// ============================================================================
// ENCODER: Observation → Latent (Variational)
// ============================================================================

class VariationalEncoder {
  private encoder: MLP;
  private meanLayer: DenseLayer;
  private logVarLayer: DenseLayer;

  constructor(inputDim: number, hiddenDim: number, latentDim: number, numLayers: number) {
    const dims = [inputDim, ...Array(numLayers).fill(hiddenDim)];
    this.encoder = new MLP(dims, 'relu', 'tanh');
    this.meanLayer = new DenseLayer(hiddenDim, latentDim, 'linear');
    this.logVarLayer = new DenseLayer(hiddenDim, latentDim, 'linear');
  }

  encode(observation: number[]): LatentState {
    const hidden = this.encoder.forward(observation);
    const mean = this.meanLayer.forward(hidden);
    const logVar = this.logVarLayer.forward(hidden);

    return {
      mean,
      logVar,
      dimension: mean.length
    };
  }

  // Reparameterization trick for differentiable sampling
  sample(state: LatentState): number[] {
    const epsilon = state.mean.map(() => gaussianRandom());
    return state.mean.map((m, i) => m + Math.exp(0.5 * state.logVar[i]) * epsilon[i]);
  }
}

// ============================================================================
// DECODER: Latent → Observation Prediction
// ============================================================================

class ObservationDecoder {
  private decoder: MLP;

  constructor(latentDim: number, hiddenDim: number, outputDim: number, numLayers: number) {
    const dims = [latentDim, ...Array(numLayers).fill(hiddenDim), outputDim];
    this.decoder = new MLP(dims, 'relu', 'linear');
  }

  decode(latent: number[]): number[] {
    return this.decoder.forward(latent);
  }
}

// ============================================================================
// TRANSITION MODEL: Latent × Action → Next Latent
// ============================================================================

class TransitionModel {
  private model: MLP;
  private meanLayer: DenseLayer;
  private logVarLayer: DenseLayer;

  constructor(latentDim: number, actionDim: number, hiddenDim: number, numLayers: number) {
    const inputDim = latentDim + actionDim;
    const dims = [inputDim, ...Array(numLayers).fill(hiddenDim)];
    this.model = new MLP(dims, 'relu', 'tanh');
    this.meanLayer = new DenseLayer(hiddenDim, latentDim, 'linear');
    this.logVarLayer = new DenseLayer(hiddenDim, latentDim, 'softplus'); // Softplus for positive variance
  }

  predict(currentLatent: number[], action: number[]): LatentState {
    const input = [...currentLatent, ...action];
    const hidden = this.model.forward(input);
    const mean = this.meanLayer.forward(hidden);
    const logVar = this.logVarLayer.forward(hidden).map(v => Math.log(v + 1e-6)); // Convert to logVar

    return {
      mean,
      logVar,
      dimension: mean.length
    };
  }
}

// ============================================================================
// POLICY NETWORK: Latent → Action Distribution
// ============================================================================

class PolicyNetwork {
  private network: MLP;
  private actionEmbeddings: Map<string, number[]>;

  constructor(latentDim: number, hiddenDim: number, numActions: number, actionDim: number, numLayers: number) {
    const dims = [latentDim, ...Array(numLayers).fill(hiddenDim), numActions];
    this.network = new MLP(dims, 'relu', 'linear');
    this.actionEmbeddings = new Map();
  }

  getActionProbabilities(latent: number[], temperature: number = 1.0): number[] {
    const logits = this.network.forward(latent);
    return softmax(logits.map(l => l / temperature));
  }

  registerAction(actionType: string, embedding: number[]) {
    this.actionEmbeddings.set(actionType, embedding);
  }

  getActionEmbedding(actionType: string): number[] {
    return this.actionEmbeddings.get(actionType) || Array(16).fill(0);
  }
}

// ============================================================================
// DEEP ACTIVE INFERENCE ENGINE
// ============================================================================

export class DeepActiveInference extends EventEmitter {
  private config: DeepAIFConfig;
  private encoder: VariationalEncoder;
  private decoder: ObservationDecoder;
  private transition: TransitionModel;
  private policy: PolicyNetwork;

  private currentBelief: LatentState;
  private beliefHistory: LatentState[];
  private observationBuffer: Observation[];

  private actionRegistry: Map<string, Action>;
  private freeEnergyHistory: number[];

  constructor(config: Partial<DeepAIFConfig> = {}) {
    super();

    this.config = {
      latentDim: 64,
      hiddenDim: 256,
      numLayers: 3,
      learningRate: 0.001,
      kldWeight: 0.1,
      freeEnergyHorizon: 5,
      temperature: 1.0,
      usePrecisionWeighting: true,
      ...config
    };

    // Initialize networks
    const obsDim = 128; // Default observation dimension
    const actionDim = 16; // Action embedding dimension
    const numActions = 8; // Number of discrete actions

    this.encoder = new VariationalEncoder(obsDim, this.config.hiddenDim, this.config.latentDim, this.config.numLayers);
    this.decoder = new ObservationDecoder(this.config.latentDim, this.config.hiddenDim, obsDim, this.config.numLayers);
    this.transition = new TransitionModel(this.config.latentDim, actionDim, this.config.hiddenDim, this.config.numLayers);
    this.policy = new PolicyNetwork(this.config.latentDim, this.config.hiddenDim, numActions, actionDim, this.config.numLayers);

    // Initialize belief to prior (zero mean, unit variance)
    this.currentBelief = {
      mean: Array(this.config.latentDim).fill(0),
      logVar: Array(this.config.latentDim).fill(0),
      dimension: this.config.latentDim
    };

    this.beliefHistory = [];
    this.observationBuffer = [];
    this.actionRegistry = new Map();
    this.freeEnergyHistory = [];

    this.initializeActionRegistry();
  }

  private initializeActionRegistry() {
    const defaultActions: Action[] = [
      { type: 'sense.mcp', parameters: {}, embedding: randomVector(16) },
      { type: 'recall.memory', parameters: {}, embedding: randomVector(16) },
      { type: 'plan.goals', parameters: {}, embedding: randomVector(16) },
      { type: 'verify.ethics', parameters: {}, embedding: randomVector(16) },
      { type: 'execute.task', parameters: {}, embedding: randomVector(16) },
      { type: 'execute.code', parameters: {}, embedding: randomVector(16) },
      { type: 'adapt.code', parameters: {}, embedding: randomVector(16) },
      { type: 'self.reflect', parameters: {}, embedding: randomVector(16) }
    ];

    defaultActions.forEach(action => {
      this.actionRegistry.set(action.type, action);
      this.policy.registerAction(action.type, action.embedding);
    });
  }

  // ===========================================================================
  // CORE ACTIVE INFERENCE LOOP
  // ===========================================================================

  /**
   * Process new observation and update beliefs
   */
  updateBelief(observation: Observation): BeliefUpdate {
    // Encode observation to get likelihood distribution
    const obsVector = this.observationToVector(observation);
    const likelihood = this.encoder.encode(obsVector);

    // Precision-weighted belief update
    const precision = this.config.usePrecisionWeighting ? observation.precision : 1.0;

    // Compute posterior using precision-weighted combination
    const posterior = this.combineBelief(this.currentBelief, likelihood, precision);

    // Compute free energy components
    const kld = this.klDivergence(posterior, this.currentBelief);
    const reconstructed = this.decoder.decode(this.encoder.sample(posterior));
    const reconError = this.reconstructionError(obsVector, reconstructed);
    const freeEnergy = reconError + this.config.kldWeight * kld;

    // Store history
    const prior = { ...this.currentBelief };
    this.currentBelief = posterior;
    this.beliefHistory.push(posterior);
    this.observationBuffer.push(observation);
    this.freeEnergyHistory.push(freeEnergy);

    const update: BeliefUpdate = {
      prior,
      posterior,
      predictionError: reconError,
      freeEnergy,
      kldivergence: kld
    };

    this.emit('beliefUpdate', update);
    return update;
  }

  /**
   * Select action by minimizing Expected Free Energy
   */
  selectAction(): { action: Action, evaluation: PolicyEvaluation } {
    const actions = Array.from(this.actionRegistry.values());
    const evaluations: PolicyEvaluation[] = [];

    // Evaluate each possible action
    for (const action of actions) {
      const evaluation = this.evaluatePolicy([action]);
      evaluations.push(evaluation);
    }

    // Select action with lowest expected free energy
    const bestIdx = evaluations.reduce((best, curr, idx) =>
      curr.expectedFreeEnergy < evaluations[best].expectedFreeEnergy ? idx : best, 0);

    const selectedAction = actions[bestIdx];
    const evaluation = evaluations[bestIdx];

    this.emit('actionSelected', { action: selectedAction, evaluation });
    return { action: selectedAction, evaluation };
  }

  /**
   * Evaluate a policy (sequence of actions)
   */
  evaluatePolicy(policy: Action[]): PolicyEvaluation {
    let totalEFE = 0;
    let epistemicValue = 0;
    let pragmaticValue = 0;
    let riskValue = 0;

    let predictedBelief = { ...this.currentBelief };

    for (let t = 0; t < Math.min(policy.length, this.config.freeEnergyHorizon); t++) {
      const action = policy[t];
      const actionEmbedding = this.actionRegistry.get(action.type)?.embedding || randomVector(16);

      // Predict next belief state
      const nextBelief = this.transition.predict(
        this.encoder.sample(predictedBelief),
        actionEmbedding
      );

      // Compute Expected Free Energy components

      // 1. Epistemic value (information gain) - reduction in uncertainty
      const entropyReduction = this.entropy(predictedBelief) - this.entropy(nextBelief);
      epistemicValue += entropyReduction;

      // 2. Pragmatic value (goal achievement) - alignment with preferred states
      const goalAlignment = this.computeGoalAlignment(nextBelief);
      pragmaticValue += goalAlignment;

      // 3. Risk (uncertainty about outcomes)
      const risk = this.entropy(nextBelief);
      riskValue += risk;

      // EFE = -epistemic - pragmatic + risk
      const stepEFE = -entropyReduction - goalAlignment + 0.5 * risk;
      totalEFE += stepEFE * Math.pow(0.99, t); // Discount future

      predictedBelief = nextBelief;
    }

    return {
      policy,
      expectedFreeEnergy: totalEFE,
      epistemicValue,
      pragmaticValue,
      riskValue
    };
  }

  /**
   * Predict future state given action
   */
  predictFuture(action: Action, steps: number = 1): LatentState[] {
    const predictions: LatentState[] = [];
    let currentState = this.encoder.sample(this.currentBelief);
    const actionEmbedding = this.actionRegistry.get(action.type)?.embedding || randomVector(16);

    for (let i = 0; i < steps; i++) {
      const nextBelief = this.transition.predict(currentState, actionEmbedding);
      predictions.push(nextBelief);
      currentState = this.encoder.sample(nextBelief);
    }

    return predictions;
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private observationToVector(obs: Observation): number[] {
    // Pad or truncate to expected dimension
    const targetDim = 128;
    const vector = [...obs.data];
    while (vector.length < targetDim) vector.push(0);
    return vector.slice(0, targetDim);
  }

  private combineBelief(prior: LatentState, likelihood: LatentState, precision: number): LatentState {
    // Precision-weighted combination of prior and likelihood
    const priorPrec = prior.logVar.map(lv => Math.exp(-lv));
    const likPrec = likelihood.logVar.map(lv => Math.exp(-lv) * precision);

    const combinedPrec = priorPrec.map((pp, i) => pp + likPrec[i]);
    const combinedVar = combinedPrec.map(p => 1 / p);
    const combinedLogVar = combinedVar.map(v => Math.log(v + 1e-10));

    const combinedMean = prior.mean.map((pm, i) => {
      const priorContrib = pm * priorPrec[i];
      const likContrib = likelihood.mean[i] * likPrec[i];
      return (priorContrib + likContrib) / combinedPrec[i];
    });

    return {
      mean: combinedMean,
      logVar: combinedLogVar,
      dimension: prior.dimension
    };
  }

  private klDivergence(q: LatentState, p: LatentState): number {
    // KL(q || p) for multivariate Gaussians
    let kld = 0;
    for (let i = 0; i < q.dimension; i++) {
      const varQ = Math.exp(q.logVar[i]);
      const varP = Math.exp(p.logVar[i]);
      kld += Math.log(varP / varQ) + (varQ + (q.mean[i] - p.mean[i]) ** 2) / varP - 1;
    }
    return 0.5 * kld;
  }

  private reconstructionError(original: number[], reconstructed: number[]): number {
    return original.reduce((sum, val, i) => sum + (val - reconstructed[i]) ** 2, 0) / original.length;
  }

  private entropy(belief: LatentState): number {
    // Entropy of multivariate Gaussian: 0.5 * log(det(2πeΣ))
    const logDet = belief.logVar.reduce((sum, lv) => sum + lv, 0);
    return 0.5 * belief.dimension * (1 + Math.log(2 * Math.PI)) + 0.5 * logDet;
  }

  private computeGoalAlignment(belief: LatentState): number {
    // Simple goal alignment: how close is belief mean to goal state
    // Goal state assumed to be positive in first few dimensions (viability)
    const goalDims = Math.min(4, belief.dimension);
    let alignment = 0;
    for (let i = 0; i < goalDims; i++) {
      alignment += Math.tanh(belief.mean[i]); // Saturating activation
    }
    return alignment / goalDims;
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  getCurrentBelief(): LatentState {
    return { ...this.currentBelief };
  }

  getFreeEnergy(): number {
    return this.freeEnergyHistory[this.freeEnergyHistory.length - 1] || 0;
  }

  getAverageFreeEnergy(window: number = 10): number {
    const recent = this.freeEnergyHistory.slice(-window);
    return recent.reduce((a, b) => a + b, 0) / recent.length || 0;
  }

  registerAction(action: Action) {
    this.actionRegistry.set(action.type, action);
    this.policy.registerAction(action.type, action.embedding);
  }

  getBeliefSummary(): Record<string, any> {
    const belief = this.currentBelief;
    return {
      meanNorm: Math.sqrt(belief.mean.reduce((s, v) => s + v * v, 0)),
      averageUncertainty: belief.logVar.reduce((s, v) => s + Math.exp(v), 0) / belief.dimension,
      entropy: this.entropy(belief),
      dimension: belief.dimension,
      historyLength: this.beliefHistory.length,
      currentFreeEnergy: this.getFreeEnergy(),
      averageFreeEnergy: this.getAverageFreeEnergy()
    };
  }

  /**
   * Create observation from MCP tool result
   */
  createObservation(modality: string, data: any, precision: number = 0.8): Observation {
    // Convert data to vector representation
    let vector: number[];

    if (Array.isArray(data)) {
      vector = data.map(d => typeof d === 'number' ? d : hashToNumber(JSON.stringify(d)));
    } else if (typeof data === 'object') {
      vector = Object.values(data).map(v => typeof v === 'number' ? v : hashToNumber(JSON.stringify(v)));
    } else if (typeof data === 'string') {
      vector = stringToVector(data, 128);
    } else {
      vector = [typeof data === 'number' ? data : 0];
    }

    return {
      modality,
      data: vector,
      precision,
      timestamp: Date.now()
    };
  }

  /**
   * Full inference cycle: observe → update → select → act
   */
  async cycle(observation: Observation): Promise<{ belief: BeliefUpdate, action: Action, evaluation: PolicyEvaluation }> {
    const belief = this.updateBelief(observation);
    const { action, evaluation } = this.selectAction();

    this.emit('cycle', { belief, action, evaluation });

    return { belief, action, evaluation };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function gaussianRandom(): number {
  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function softmax(logits: number[]): number[] {
  const maxLogit = Math.max(...logits);
  const exps = logits.map(l => Math.exp(l - maxLogit));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sum);
}

function randomVector(dim: number): number[] {
  return Array(dim).fill(0).map(() => (Math.random() - 0.5) * 2);
}

function hashToNumber(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.tanh(hash / 1000000);
}

function stringToVector(str: string, dim: number): number[] {
  const vector = Array(dim).fill(0);
  for (let i = 0; i < str.length && i < dim; i++) {
    vector[i] = (str.charCodeAt(i) - 64) / 64; // Normalize
  }
  return vector;
}

export default DeepActiveInference;
