/**
 * HIERARCHICAL LATENT SPACES
 *
 * Multi-scale temporal abstraction for world modeling.
 * Different levels capture different timescales of dynamics.
 *
 * Architecture:
 * - Level 0: Frame-by-frame (100ms)
 * - Level 1: Action chunks (1s)
 * - Level 2: Sub-goals (10s)
 * - Level 3: Goals (minutes)
 * - Level 4: Plans (hours)
 *
 * Based on:
 * - Temporal Abstraction in RL (Sutton et al.)
 * - Hierarchical World Models (Ha & Schmidhuber)
 * - Multi-scale Predictive Coding
 */

// ============================================================================
// TYPES
// ============================================================================

export interface HierarchicalConfig {
  levels: LevelConfig[];
  crossLevelAttention: boolean;
  topDownPrediction: boolean;
  bottomUpCompression: boolean;
}

export interface LevelConfig {
  name: string;
  latentDim: number;
  temporalScale: number;    // How many lower-level steps per this level's step
  encoderLayers: number;
  decoderLayers: number;
}

export interface HierarchicalState {
  levelStates: Map<string, LevelState>;
  timestamp: number;
}

export interface LevelState {
  level: number;
  latent: number[];
  mean: number[];
  logVar: number[];
  temporalContext: number[][];  // Recent history at this level
}

export interface CrossLevelMessage {
  from: string;
  to: string;
  direction: 'top-down' | 'bottom-up';
  content: number[];
  modulation: number;
}

// ============================================================================
// HIERARCHICAL LATENT SPACE MODEL
// ============================================================================

export class HierarchicalLatentSpace {
  private config: HierarchicalConfig;
  private levels: HierarchyLevel[] = [];
  private state: HierarchicalState;
  private stepCounter: number = 0;

  constructor(config: Partial<HierarchicalConfig> = {}) {
    this.config = {
      levels: [
        { name: 'frame', latentDim: 64, temporalScale: 1, encoderLayers: 2, decoderLayers: 2 },
        { name: 'action', latentDim: 128, temporalScale: 10, encoderLayers: 3, decoderLayers: 2 },
        { name: 'subgoal', latentDim: 256, temporalScale: 10, encoderLayers: 3, decoderLayers: 2 },
        { name: 'goal', latentDim: 512, temporalScale: 6, encoderLayers: 4, decoderLayers: 3 },
        { name: 'plan', latentDim: 1024, temporalScale: 10, encoderLayers: 4, decoderLayers: 3 }
      ],
      crossLevelAttention: true,
      topDownPrediction: true,
      bottomUpCompression: true,
      ...config
    };

    this.initializeLevels();
    this.state = this.initializeState();
  }

  private initializeLevels(): void {
    for (let i = 0; i < this.config.levels.length; i++) {
      const levelConfig = this.config.levels[i];
      const prevDim = i > 0 ? this.config.levels[i - 1].latentDim : levelConfig.latentDim;
      const nextDim = i < this.config.levels.length - 1
        ? this.config.levels[i + 1].latentDim
        : levelConfig.latentDim;

      this.levels.push(new HierarchyLevel(
        i,
        levelConfig,
        prevDim,
        nextDim
      ));
    }
  }

  private initializeState(): HierarchicalState {
    const levelStates = new Map<string, LevelState>();

    for (let i = 0; i < this.config.levels.length; i++) {
      const cfg = this.config.levels[i];
      levelStates.set(cfg.name, {
        level: i,
        latent: Array(cfg.latentDim).fill(0),
        mean: Array(cfg.latentDim).fill(0),
        logVar: Array(cfg.latentDim).fill(-2),
        temporalContext: []
      });
    }

    return {
      levelStates,
      timestamp: Date.now()
    };
  }

  // --------------------------------------------------------------------------
  // FORWARD PASS
  // --------------------------------------------------------------------------

  /**
   * Process observation through all hierarchy levels
   */
  forward(observation: number[]): HierarchicalState {
    this.stepCounter++;

    // Bottom-up: encode observation at lowest level
    const level0 = this.levels[0];
    const encoded = level0.encode(observation);

    // Update level 0 state
    const state0 = this.state.levelStates.get(this.config.levels[0].name)!;
    state0.latent = encoded.latent;
    state0.mean = encoded.mean;
    state0.logVar = encoded.logVar;
    state0.temporalContext.push(encoded.latent);

    // Keep limited history
    if (state0.temporalContext.length > 20) {
      state0.temporalContext.shift();
    }

    // Bottom-up compression: update higher levels when enough steps accumulated
    if (this.config.bottomUpCompression) {
      this.bottomUpUpdate();
    }

    // Top-down prediction: modulate lower levels with higher-level predictions
    if (this.config.topDownPrediction) {
      this.topDownModulation();
    }

    this.state.timestamp = Date.now();
    return this.state;
  }

  private bottomUpUpdate(): void {
    for (let i = 1; i < this.levels.length; i++) {
      const scale = this.config.levels[i].temporalScale;
      const cumulativeScale = this.getCumulativeScale(i);

      // Update this level when we've accumulated enough lower-level steps
      if (this.stepCounter % cumulativeScale === 0) {
        const lowerState = this.state.levelStates.get(this.config.levels[i - 1].name)!;
        const level = this.levels[i];

        // Compress temporal context from lower level
        const compressed = level.compressTemporalContext(lowerState.temporalContext);

        // Update this level's state
        const thisState = this.state.levelStates.get(this.config.levels[i].name)!;
        thisState.latent = compressed.latent;
        thisState.mean = compressed.mean;
        thisState.logVar = compressed.logVar;
        thisState.temporalContext.push(compressed.latent);

        if (thisState.temporalContext.length > 10) {
          thisState.temporalContext.shift();
        }
      }
    }
  }

  private topDownModulation(): void {
    // Higher levels modulate predictions at lower levels
    for (let i = this.levels.length - 1; i > 0; i--) {
      const higherState = this.state.levelStates.get(this.config.levels[i].name)!;
      const lowerState = this.state.levelStates.get(this.config.levels[i - 1].name)!;
      const level = this.levels[i - 1];

      // Get top-down prediction
      const prediction = level.receiveTopDown(higherState.latent);

      // Modulate lower level latent (blend with prediction)
      const alpha = 0.2;  // Modulation strength
      for (let d = 0; d < lowerState.latent.length; d++) {
        lowerState.latent[d] = (1 - alpha) * lowerState.latent[d] +
                               alpha * (prediction[d] || lowerState.latent[d]);
      }
    }
  }

  private getCumulativeScale(level: number): number {
    let scale = 1;
    for (let i = 1; i <= level; i++) {
      scale *= this.config.levels[i].temporalScale;
    }
    return scale;
  }

  // --------------------------------------------------------------------------
  // CROSS-LEVEL OPERATIONS
  // --------------------------------------------------------------------------

  /**
   * Get representation at specific abstraction level
   */
  getLatentAtLevel(levelName: string): number[] | null {
    const state = this.state.levelStates.get(levelName);
    return state ? [...state.latent] : null;
  }

  /**
   * Get multi-scale representation (concatenated all levels)
   */
  getMultiScaleRepresentation(): number[] {
    const repr: number[] = [];
    for (const cfg of this.config.levels) {
      const state = this.state.levelStates.get(cfg.name)!;
      repr.push(...state.latent);
    }
    return repr;
  }

  /**
   * Predict at specific level with top-down context
   */
  predictAtLevel(levelIdx: number, steps: number): number[][] {
    const level = this.levels[levelIdx];
    const state = this.state.levelStates.get(this.config.levels[levelIdx].name)!;

    const predictions: number[][] = [];
    let currentLatent = [...state.latent];

    // Get higher-level context for conditioning
    let higherContext: number[] | null = null;
    if (levelIdx < this.levels.length - 1) {
      higherContext = this.state.levelStates.get(
        this.config.levels[levelIdx + 1].name
      )?.latent || null;
    }

    for (let i = 0; i < steps; i++) {
      const predicted = level.predict(currentLatent, higherContext);
      predictions.push(predicted);
      currentLatent = predicted;
    }

    return predictions;
  }

  /**
   * Cross-level attention for information routing
   */
  crossLevelAttend(queryLevel: number, keyLevel: number): number[] {
    if (!this.config.crossLevelAttention) {
      // Return query level's latent if cross-level disabled
      return this.state.levelStates.get(
        this.config.levels[queryLevel].name
      )!.latent;
    }

    const queryState = this.state.levelStates.get(this.config.levels[queryLevel].name)!;
    const keyState = this.state.levelStates.get(this.config.levels[keyLevel].name)!;

    const queryLevel_ = this.levels[queryLevel];
    return queryLevel_.crossLevelAttention(queryState.latent, keyState.latent);
  }

  // --------------------------------------------------------------------------
  // STATE MANAGEMENT
  // --------------------------------------------------------------------------

  getState(): HierarchicalState {
    return this.state;
  }

  resetState(): void {
    this.state = this.initializeState();
    this.stepCounter = 0;
  }

  getConfig(): HierarchicalConfig {
    return { ...this.config };
  }
}

// ============================================================================
// HIERARCHY LEVEL
// ============================================================================

class HierarchyLevel {
  private levelIdx: number;
  private config: LevelConfig;
  private encoder: VariationalEncoder;
  private predictor: TemporalPredictor;
  private topDownProjection: LinearLayer;
  private crossLevelProjection: LinearLayer;

  constructor(
    levelIdx: number,
    config: LevelConfig,
    lowerDim: number,
    higherDim: number
  ) {
    this.levelIdx = levelIdx;
    this.config = config;

    this.encoder = new VariationalEncoder(
      levelIdx === 0 ? config.latentDim : lowerDim * 2,  // Input from obs or lower level context
      config.latentDim,
      config.encoderLayers
    );

    this.predictor = new TemporalPredictor(
      config.latentDim,
      config.latentDim,
      config.decoderLayers
    );

    this.topDownProjection = this.initLinear(higherDim, config.latentDim);
    this.crossLevelProjection = this.initLinear(config.latentDim * 2, config.latentDim);
  }

  private initLinear(inDim: number, outDim: number): LinearLayer {
    const scale = Math.sqrt(2.0 / (inDim + outDim));
    const weight: number[][] = [];
    for (let i = 0; i < outDim; i++) {
      weight.push(Array(inDim).fill(0).map(() => (Math.random() * 2 - 1) * scale));
    }
    return { weight, bias: Array(outDim).fill(0) };
  }

  encode(input: number[]): { latent: number[]; mean: number[]; logVar: number[] } {
    return this.encoder.encode(input);
  }

  compressTemporalContext(context: number[][]): { latent: number[]; mean: number[]; logVar: number[] } {
    // Average pool then encode
    if (context.length === 0) {
      return {
        latent: Array(this.config.latentDim).fill(0),
        mean: Array(this.config.latentDim).fill(0),
        logVar: Array(this.config.latentDim).fill(-2)
      };
    }

    const pooled: number[] = Array(context[0].length).fill(0);
    for (const frame of context) {
      for (let i = 0; i < frame.length; i++) {
        pooled[i] += frame[i] / context.length;
      }
    }

    return this.encoder.encode(pooled);
  }

  predict(currentLatent: number[], higherContext: number[] | null): number[] {
    // Condition on higher-level context if available
    let input = currentLatent;
    if (higherContext) {
      const projected = this.linearForward(higherContext, this.topDownProjection);
      input = currentLatent.map((v, i) => v + projected[i] * 0.3);
    }

    return this.predictor.predict(input);
  }

  receiveTopDown(higherLatent: number[]): number[] {
    return this.linearForward(higherLatent, this.topDownProjection);
  }

  crossLevelAttention(query: number[], key: number[]): number[] {
    // Simple cross-attention: concat and project
    const concat = [...query, ...key.slice(0, query.length)];
    return this.linearForward(concat, this.crossLevelProjection);
  }

  private linearForward(x: number[], layer: LinearLayer): number[] {
    const out: number[] = [];
    for (let i = 0; i < layer.weight.length; i++) {
      let sum = layer.bias[i];
      for (let j = 0; j < Math.min(x.length, layer.weight[i].length); j++) {
        sum += layer.weight[i][j] * x[j];
      }
      out.push(sum);
    }
    return out;
  }
}

// ============================================================================
// VARIATIONAL ENCODER
// ============================================================================

class VariationalEncoder {
  private layers: LinearLayer[] = [];
  private meanLayer: LinearLayer;
  private logVarLayer: LinearLayer;

  constructor(inputDim: number, latentDim: number, numLayers: number) {
    let dim = inputDim;
    for (let i = 0; i < numLayers; i++) {
      const outDim = i === numLayers - 1 ? latentDim * 2 : Math.max(latentDim, dim / 2);
      this.layers.push(this.initLinear(dim, outDim));
      dim = outDim;
    }

    this.meanLayer = this.initLinear(latentDim * 2, latentDim);
    this.logVarLayer = this.initLinear(latentDim * 2, latentDim);
  }

  private initLinear(inDim: number, outDim: number): LinearLayer {
    const scale = Math.sqrt(2.0 / (inDim + outDim));
    const weight: number[][] = [];
    for (let i = 0; i < outDim; i++) {
      weight.push(Array(inDim).fill(0).map(() => (Math.random() * 2 - 1) * scale));
    }
    return { weight, bias: Array(outDim).fill(0) };
  }

  encode(input: number[]): { latent: number[]; mean: number[]; logVar: number[] } {
    let x = input;

    for (const layer of this.layers) {
      x = this.linearForward(x, layer);
      x = x.map(v => Math.max(0, v));  // ReLU
    }

    const mean = this.linearForward(x, this.meanLayer);
    const logVar = this.linearForward(x, this.logVarLayer);

    // Reparameterization trick
    const latent = mean.map((m, i) => {
      const std = Math.exp(0.5 * logVar[i]);
      return m + std * this.sampleNormal();
    });

    return { latent, mean, logVar };
  }

  private linearForward(x: number[], layer: LinearLayer): number[] {
    const out: number[] = [];
    for (let i = 0; i < layer.weight.length; i++) {
      let sum = layer.bias[i];
      for (let j = 0; j < Math.min(x.length, layer.weight[i].length); j++) {
        sum += layer.weight[i][j] * x[j];
      }
      out.push(sum);
    }
    return out;
  }

  private sampleNormal(): number {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

// ============================================================================
// TEMPORAL PREDICTOR
// ============================================================================

class TemporalPredictor {
  private layers: LinearLayer[] = [];

  constructor(inputDim: number, outputDim: number, numLayers: number) {
    let dim = inputDim;
    for (let i = 0; i < numLayers; i++) {
      const outDim = i === numLayers - 1 ? outputDim : dim;
      this.layers.push(this.initLinear(dim, outDim));
      dim = outDim;
    }
  }

  private initLinear(inDim: number, outDim: number): LinearLayer {
    const scale = Math.sqrt(2.0 / (inDim + outDim));
    const weight: number[][] = [];
    for (let i = 0; i < outDim; i++) {
      weight.push(Array(inDim).fill(0).map(() => (Math.random() * 2 - 1) * scale));
    }
    return { weight, bias: Array(outDim).fill(0) };
  }

  predict(input: number[]): number[] {
    let x = input;

    for (let i = 0; i < this.layers.length - 1; i++) {
      x = this.linearForward(x, this.layers[i]);
      x = x.map(v => Math.max(0, v));  // ReLU
    }

    // Last layer without activation
    return this.linearForward(x, this.layers[this.layers.length - 1]);
  }

  private linearForward(x: number[], layer: LinearLayer): number[] {
    const out: number[] = [];
    for (let i = 0; i < layer.weight.length; i++) {
      let sum = layer.bias[i];
      for (let j = 0; j < Math.min(x.length, layer.weight[i].length); j++) {
        sum += layer.weight[i][j] * x[j];
      }
      out.push(sum);
    }
    return out;
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface LinearLayer {
  weight: number[][];
  bias: number[];
}

// ============================================================================
// EXPORT
// ============================================================================

export function createHierarchicalLatentSpace(
  config?: Partial<HierarchicalConfig>
): HierarchicalLatentSpace {
  return new HierarchicalLatentSpace(config);
}
