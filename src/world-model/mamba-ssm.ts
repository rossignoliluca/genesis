/**
 * MAMBA - Selective State Space Model for Genesis
 *
 * Efficient O(n) sequence modeling for long-context world models.
 * Based on: "Mamba: Linear-Time Sequence Modeling with Selective State Spaces"
 * Gu & Dao, 2023
 *
 * Key innovations:
 * - Selective scan (input-dependent state transitions)
 * - Hardware-aware parallel scan
 * - Linear complexity vs quadratic attention
 * - Perfect for long temporal sequences in world modeling
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface MambaConfig {
  dModel: number;        // Model dimension
  dState: number;        // SSM state dimension (N)
  dConv: number;         // Convolution kernel size
  expand: number;        // Expansion factor for inner dimension
  dtRank: string | number;  // Rank for dt projection ('auto' or number)
  dtMin: number;         // Minimum dt
  dtMax: number;         // Maximum dt
  dtInit: string;        // 'random' or 'constant'
  dtScale: number;       // Scale for dt initialization
  biasConv: boolean;     // Use bias in convolution
  biasLinear: boolean;   // Use bias in linear layers
}

export interface SSMState {
  h: number[][];         // Hidden state [batch, dState]
  timestamp: number;
}

export interface MambaBlock {
  inProj: LinearLayer;
  conv1d: Conv1DLayer;
  xProj: LinearLayer;
  dtProj: LinearLayer;
  A: number[];           // Diagonal state matrix (log form)
  D: number[];           // Skip connection
  outProj: LinearLayer;
}

interface LinearLayer {
  weight: number[][];
  bias?: number[];
}

interface Conv1DLayer {
  weight: number[][];    // [outChannels, kernelSize]
  bias?: number[];
}

export interface SelectiveScanParams {
  u: number[][];         // Input [batchSeqLen, dInner]
  delta: number[][];     // Time step [batchSeqLen, dInner]
  A: number[];           // State matrix diagonal [dState]
  B: number[][];         // Input matrix [batchSeqLen, dState]
  C: number[][];         // Output matrix [batchSeqLen, dState]
  D: number[];           // Skip connection [dInner]
}

// ============================================================================
// MAMBA CORE IMPLEMENTATION
// ============================================================================

export class MambaSSM {
  private config: MambaConfig;
  private blocks: MambaBlock[] = [];
  private state: SSMState | null = null;
  private numLayers: number;

  constructor(config: Partial<MambaConfig> = {}, numLayers: number = 4) {
    this.config = {
      dModel: 256,
      dState: 16,
      dConv: 4,
      expand: 2,
      dtRank: 'auto',
      dtMin: 0.001,
      dtMax: 0.1,
      dtInit: 'random',
      dtScale: 1.0,
      biasConv: true,
      biasLinear: false,
      ...config
    };

    this.numLayers = numLayers;
    this.initializeBlocks();
  }

  private initializeBlocks(): void {
    const { dModel, dState, dConv, expand, biasConv, biasLinear } = this.config;
    const dInner = dModel * expand;
    const dtRank = this.config.dtRank === 'auto'
      ? Math.ceil(dModel / 16)
      : this.config.dtRank as number;

    for (let i = 0; i < this.numLayers; i++) {
      const block: MambaBlock = {
        // Input projection: dModel -> 2 * dInner
        inProj: this.initLinear(dModel, 2 * dInner, biasLinear),

        // 1D Convolution: dInner -> dInner
        conv1d: this.initConv1D(dInner, dConv, biasConv),

        // X projection for B, C, dt: dInner -> dtRank + 2*dState
        xProj: this.initLinear(dInner, dtRank + 2 * dState, biasLinear),

        // dt projection: dtRank -> dInner
        dtProj: this.initLinear(dtRank, dInner, true),

        // State matrix A (log form for stability)
        A: this.initA(dState),

        // Skip connection D
        D: Array(dInner).fill(0).map(() => Math.random() * 0.1),

        // Output projection: dInner -> dModel
        outProj: this.initLinear(dInner, dModel, biasLinear)
      };

      this.blocks.push(block);
    }
  }

  private initLinear(inFeatures: number, outFeatures: number, bias: boolean): LinearLayer {
    // Xavier initialization
    const scale = Math.sqrt(2.0 / (inFeatures + outFeatures));
    const weight: number[][] = [];

    for (let i = 0; i < outFeatures; i++) {
      const row: number[] = [];
      for (let j = 0; j < inFeatures; j++) {
        row.push((Math.random() * 2 - 1) * scale);
      }
      weight.push(row);
    }

    return {
      weight,
      bias: bias ? Array(outFeatures).fill(0) : undefined
    };
  }

  private initConv1D(channels: number, kernelSize: number, bias: boolean): Conv1DLayer {
    const scale = Math.sqrt(2.0 / (channels * kernelSize));
    const weight: number[][] = [];

    for (let i = 0; i < channels; i++) {
      const kernel: number[] = [];
      for (let k = 0; k < kernelSize; k++) {
        kernel.push((Math.random() * 2 - 1) * scale);
      }
      weight.push(kernel);
    }

    return {
      weight,
      bias: bias ? Array(channels).fill(0) : undefined
    };
  }

  private initA(dState: number): number[] {
    // Initialize A as log of negative values for stability
    // A = -exp(A_log), learned in log space
    const A: number[] = [];
    for (let i = 0; i < dState; i++) {
      // Initialize close to -1 for stable recurrence
      A.push(Math.log(1 + i + 1));  // log(1), log(2), ..., log(N)
    }
    return A;
  }

  // --------------------------------------------------------------------------
  // FORWARD PASS
  // --------------------------------------------------------------------------

  forward(x: number[][]): number[][] {
    // x: [seqLen, dModel]
    let output = x;

    for (const block of this.blocks) {
      output = this.mambaBlockForward(output, block);
    }

    return output;
  }

  private mambaBlockForward(x: number[][], block: MambaBlock): number[][] {
    const seqLen = x.length;
    const { dState } = this.config;
    const dInner = this.config.dModel * this.config.expand;
    const dtRank = this.config.dtRank === 'auto'
      ? Math.ceil(this.config.dModel / 16)
      : this.config.dtRank as number;

    // 1. Input projection -> (z, x)
    const projected = this.linearForward(x, block.inProj);
    const z: number[][] = [];
    const xBranch: number[][] = [];

    for (let t = 0; t < seqLen; t++) {
      z.push(projected[t].slice(0, dInner));
      xBranch.push(projected[t].slice(dInner));
    }

    // 2. Convolution on x branch
    const xConv = this.conv1dForward(xBranch, block.conv1d);

    // 3. SiLU activation
    const xSilu = xConv.map(row => row.map(v => this.silu(v)));

    // 4. Project x to get dt, B, C
    const xProjOut = this.linearForward(xSilu, block.xProj);

    const dt: number[][] = [];
    const B: number[][] = [];
    const C: number[][] = [];

    for (let t = 0; t < seqLen; t++) {
      const dtPre = xProjOut[t].slice(0, dtRank);
      dt.push(this.linearForwardSingle(dtPre, block.dtProj));
      B.push(xProjOut[t].slice(dtRank, dtRank + dState));
      C.push(xProjOut[t].slice(dtRank + dState));
    }

    // 5. Softplus for dt
    const delta = dt.map(row => row.map(v => this.softplus(v)));

    // 6. Selective scan
    const y = this.selectiveScan({
      u: xSilu,
      delta,
      A: block.A,
      B,
      C,
      D: block.D
    });

    // 7. Multiply by z (gating)
    const gated: number[][] = [];
    for (let t = 0; t < seqLen; t++) {
      const row: number[] = [];
      for (let d = 0; d < dInner; d++) {
        row.push(y[t][d] * this.silu(z[t][d]));
      }
      gated.push(row);
    }

    // 8. Output projection
    return this.linearForward(gated, block.outProj);
  }

  // --------------------------------------------------------------------------
  // SELECTIVE SCAN (Core SSM Operation)
  // --------------------------------------------------------------------------

  private selectiveScan(params: SelectiveScanParams): number[][] {
    const { u, delta, A, B, C, D } = params;
    const seqLen = u.length;
    const dInner = u[0].length;
    const dState = A.length;

    // Initialize hidden state
    let h: number[][] = [];
    for (let d = 0; d < dInner; d++) {
      h.push(Array(dState).fill(0));
    }

    // Use cached state if available
    if (this.state) {
      h = this.state.h;
    }

    const y: number[][] = [];

    // Sequential scan (can be parallelized with associative scan)
    for (let t = 0; t < seqLen; t++) {
      const yT: number[] = [];

      for (let d = 0; d < dInner; d++) {
        // Discretize A and B for this timestep
        // A_bar = exp(delta * A)
        // B_bar = delta * B (simplified discretization)

        const deltaT = delta[t][d];

        // Update state: h = A_bar * h + B_bar * u
        for (let n = 0; n < dState; n++) {
          const aBar = Math.exp(deltaT * (-Math.exp(A[n])));
          const bBar = deltaT * B[t][n];
          h[d][n] = aBar * h[d][n] + bBar * u[t][d];
        }

        // Output: y = C * h + D * u
        let yDt = D[d] * u[t][d];  // Skip connection
        for (let n = 0; n < dState; n++) {
          yDt += C[t][n] * h[d][n];
        }
        yT.push(yDt);
      }

      y.push(yT);
    }

    // Save state for next forward pass
    this.state = {
      h,
      timestamp: Date.now()
    };

    return y;
  }

  // --------------------------------------------------------------------------
  // HELPER OPERATIONS
  // --------------------------------------------------------------------------

  private linearForward(x: number[][], layer: LinearLayer): number[][] {
    const output: number[][] = [];
    for (const row of x) {
      output.push(this.linearForwardSingle(row, layer));
    }
    return output;
  }

  private linearForwardSingle(x: number[], layer: LinearLayer): number[] {
    const output: number[] = [];
    for (let i = 0; i < layer.weight.length; i++) {
      let sum = layer.bias?.[i] || 0;
      for (let j = 0; j < x.length; j++) {
        sum += layer.weight[i][j] * x[j];
      }
      output.push(sum);
    }
    return output;
  }

  private conv1dForward(x: number[][], layer: Conv1DLayer): number[][] {
    const seqLen = x.length;
    const channels = x[0].length;
    const kernelSize = layer.weight[0].length;
    const padding = Math.floor(kernelSize / 2);

    const output: number[][] = [];

    for (let t = 0; t < seqLen; t++) {
      const row: number[] = [];
      for (let c = 0; c < channels; c++) {
        let sum = layer.bias?.[c] || 0;
        for (let k = 0; k < kernelSize; k++) {
          const idx = t - padding + k;
          if (idx >= 0 && idx < seqLen) {
            sum += x[idx][c] * layer.weight[c][k];
          }
        }
        row.push(sum);
      }
      output.push(row);
    }

    return output;
  }

  private silu(x: number): number {
    // SiLU / Swish activation: x * sigmoid(x)
    return x * this.sigmoid(x);
  }

  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  private softplus(x: number): number {
    // Softplus: log(1 + exp(x))
    // Numerically stable version
    if (x > 20) return x;
    return Math.log(1 + Math.exp(x));
  }

  // --------------------------------------------------------------------------
  // STATE MANAGEMENT
  // --------------------------------------------------------------------------

  resetState(): void {
    this.state = null;
  }

  getState(): SSMState | null {
    return this.state ? { ...this.state } : null;
  }

  setState(state: SSMState): void {
    this.state = state;
  }

  // --------------------------------------------------------------------------
  // WORLD MODEL INTEGRATION
  // --------------------------------------------------------------------------

  /**
   * Process a sequence of observations for world modeling
   */
  processObservationSequence(observations: number[][]): {
    predictions: number[][];
    latentStates: number[][];
  } {
    // Observations should be [seqLen, dModel]
    const encoded = this.forward(observations);

    // Generate predictions (next-step prediction)
    const predictions: number[][] = [];
    for (let t = 0; t < encoded.length - 1; t++) {
      predictions.push(encoded[t + 1]);
    }
    // Last prediction is extrapolation
    if (encoded.length > 0) {
      predictions.push(encoded[encoded.length - 1]);
    }

    return {
      predictions,
      latentStates: encoded
    };
  }

  /**
   * Predict multiple steps into the future
   */
  predictFuture(currentObs: number[], steps: number): number[][] {
    const predictions: number[][] = [];
    let input = [currentObs];

    for (let i = 0; i < steps; i++) {
      const output = this.forward(input);
      const prediction = output[output.length - 1];
      predictions.push(prediction);
      input = [prediction];
    }

    return predictions;
  }

  /**
   * Compute temporal consistency score
   */
  computeTemporalConsistency(sequence: number[][]): number {
    if (sequence.length < 2) return 1.0;

    const { predictions, latentStates } = this.processObservationSequence(sequence);

    // Compare predictions with actual next states
    let totalError = 0;
    for (let t = 0; t < sequence.length - 1; t++) {
      const predicted = predictions[t];
      const actual = sequence[t + 1];

      const error = this.mse(predicted, actual);
      totalError += error;
    }

    const avgError = totalError / (sequence.length - 1);
    // Convert error to consistency score (lower error = higher consistency)
    return Math.exp(-avgError);
  }

  private mse(a: number[], b: number[]): number {
    let sum = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }
    return sum / n;
  }

  // --------------------------------------------------------------------------
  // SERIALIZATION
  // --------------------------------------------------------------------------

  exportWeights(): {
    config: MambaConfig;
    blocks: Array<{
      inProj: LinearLayer;
      conv1d: Conv1DLayer;
      xProj: LinearLayer;
      dtProj: LinearLayer;
      A: number[];
      D: number[];
      outProj: LinearLayer;
    }>;
  } {
    return {
      config: this.config,
      blocks: this.blocks
    };
  }

  importWeights(data: ReturnType<typeof this.exportWeights>): void {
    this.config = data.config;
    this.blocks = data.blocks;
    this.resetState();
  }

  getConfig(): MambaConfig {
    return { ...this.config };
  }
}

// ============================================================================
// MAMBA WORLD MODEL WRAPPER
// ============================================================================

export class MambaWorldModel {
  private mamba: MambaSSM;
  private observationEncoder: LinearLayer;
  private actionEncoder: LinearLayer;

  constructor(
    obsDim: number,
    actionDim: number,
    config: Partial<MambaConfig> = {}
  ) {
    const dModel = config.dModel || 256;

    this.mamba = new MambaSSM(config);

    // Observation encoder
    this.observationEncoder = this.initLinear(obsDim, dModel);

    // Action encoder
    this.actionEncoder = this.initLinear(actionDim, dModel);
  }

  private initLinear(inDim: number, outDim: number): LinearLayer {
    const scale = Math.sqrt(2.0 / (inDim + outDim));
    const weight: number[][] = [];
    for (let i = 0; i < outDim; i++) {
      const row: number[] = [];
      for (let j = 0; j < inDim; j++) {
        row.push((Math.random() * 2 - 1) * scale);
      }
      weight.push(row);
    }
    return { weight, bias: Array(outDim).fill(0) };
  }

  private linearForward(x: number[], layer: LinearLayer): number[] {
    const out: number[] = [];
    for (let i = 0; i < layer.weight.length; i++) {
      let sum = layer.bias?.[i] || 0;
      for (let j = 0; j < x.length; j++) {
        sum += layer.weight[i][j] * x[j];
      }
      out.push(sum);
    }
    return out;
  }

  /**
   * Forward pass: encode observation and action, then predict next state
   */
  predict(
    observations: number[][],
    actions: number[][]
  ): {
    nextStatePredictions: number[][];
    latentTrajectory: number[][];
  } {
    // Encode observations and actions, then combine
    const combined: number[][] = [];

    for (let t = 0; t < observations.length; t++) {
      const obsEncoded = this.linearForward(observations[t], this.observationEncoder);
      const actEncoded = actions[t]
        ? this.linearForward(actions[t], this.actionEncoder)
        : Array(obsEncoded.length).fill(0);

      // Combine observation and action embeddings
      const comb: number[] = [];
      for (let i = 0; i < obsEncoded.length; i++) {
        comb.push(obsEncoded[i] + actEncoded[i]);
      }
      combined.push(comb);
    }

    // Process through Mamba
    const latentTrajectory = this.mamba.forward(combined);

    // Decode to next state predictions
    const nextStatePredictions = latentTrajectory;

    return { nextStatePredictions, latentTrajectory };
  }

  /**
   * Imagine future trajectory given current state and action sequence
   */
  imagine(
    currentObs: number[],
    plannedActions: number[][]
  ): number[][] {
    const imagined: number[][] = [];
    let obs = currentObs;

    for (const action of plannedActions) {
      const { nextStatePredictions } = this.predict([obs], [action]);
      const nextObs = nextStatePredictions[0];
      imagined.push(nextObs);
      obs = nextObs;
    }

    return imagined;
  }

  /**
   * Reset internal state for new episode
   */
  reset(): void {
    this.mamba.resetState();
  }

  /**
   * Get underlying Mamba model for advanced operations
   */
  getMambaCore(): MambaSSM {
    return this.mamba;
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export function createMambaWorldModel(
  obsDim: number = 64,
  actionDim: number = 16,
  config?: Partial<MambaConfig>
): MambaWorldModel {
  return new MambaWorldModel(obsDim, actionDim, config);
}
