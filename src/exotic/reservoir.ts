/**
 * Reservoir Computing Module
 *
 * Implements Echo State Networks (ESN) for temporal processing.
 * The key insight: a fixed random recurrent network (reservoir)
 * projects input into high-dimensional space. Only the output
 * layer is trained, making learning extremely fast.
 *
 * Key concepts:
 * - Reservoir: Fixed random recurrent connections
 * - Echo State Property: fading memory of inputs
 * - Spectral radius < 1 ensures stability
 * - Leaky integration for temporal dynamics
 *
 * Based on:
 * - Jaeger, H. (2001). The "echo state" approach
 * - Maass, W. (2002). Real-time computing without stable states
 * - Lukosevicius & Jaeger (2009). Reservoir computing approaches
 *
 * Usage:
 * ```typescript
 * import { ReservoirComputer } from './exotic/reservoir.js';
 *
 * const esn = new ReservoirComputer({
 *   inputSize: 1,
 *   reservoirSize: 500,
 *   outputSize: 1,
 *   spectralRadius: 0.9,
 * });
 *
 * // Train on time series
 * esn.train(inputSequence, targetSequence);
 *
 * // Predict
 * const prediction = esn.predict(newInput);
 * ```
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export type Matrix = number[][];
export type Vector = number[];
export type TimeSeries = Vector[];

export interface ReservoirConfig {
  inputSize: number;            // Input dimensionality
  reservoirSize: number;        // Number of reservoir neurons
  outputSize: number;           // Output dimensionality
  spectralRadius: number;       // Largest eigenvalue of reservoir (< 1)
  leakRate: number;             // Leaky integration rate (0-1)
  inputScaling: number;         // Scale of input weights
  connectivity: number;         // Reservoir sparsity (0-1)
  noiseLevel: number;           // State noise for regularization
  ridgeParam: number;           // Ridge regression parameter
  washoutLength: number;        // Initial states to discard
}

export interface TrainResult {
  trainError: number;
  testError?: number;
  readoutWeights: Matrix;
  states: Matrix;
  duration: number;
}

export interface ReservoirState {
  state: Vector;               // Current reservoir state
  lastInput: Vector;           // Last input
  lastOutput: Vector;          // Last output
  step: number;                // Time step
}

export interface ReservoirMetrics {
  trainings: number;
  predictions: number;
  totalError: number;
  averageError: number;
  spectralRadius: number;
  reservoirRank: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ReservoirConfig = {
  inputSize: 1,
  reservoirSize: 500,
  outputSize: 1,
  spectralRadius: 0.9,
  leakRate: 0.3,
  inputScaling: 1.0,
  connectivity: 0.1,
  noiseLevel: 0.001,
  ridgeParam: 1e-6,
  washoutLength: 100,
};

// ============================================================================
// Matrix Operations
// ============================================================================

function createMatrix(rows: number, cols: number, fill: number = 0): Matrix {
  return Array(rows).fill(null).map(() => Array(cols).fill(fill));
}

function randomMatrix(
  rows: number,
  cols: number,
  sparsity: number = 1,
  rng: () => number = Math.random
): Matrix {
  return Array(rows).fill(null).map(() =>
    Array(cols).fill(null).map(() =>
      rng() < sparsity ? (rng() * 2 - 1) : 0
    )
  );
}

function matVecMul(matrix: Matrix, vector: Vector): Vector {
  return matrix.map(row =>
    row.reduce((sum, val, i) => sum + val * vector[i], 0)
  );
}

function matMul(a: Matrix, b: Matrix): Matrix {
  const result = createMatrix(a.length, b[0].length);

  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b[0].length; j++) {
      for (let k = 0; k < b.length; k++) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }

  return result;
}

function transpose(matrix: Matrix): Matrix {
  if (matrix.length === 0) return [];
  return matrix[0].map((_, j) => matrix.map(row => row[j]));
}

function addVectors(a: Vector, b: Vector): Vector {
  return a.map((val, i) => val + b[i]);
}

function scaleVector(vector: Vector, scale: number): Vector {
  return vector.map(val => val * scale);
}

function tanh(x: number): number {
  return Math.tanh(x);
}

function tanhVec(vector: Vector): Vector {
  return vector.map(tanh);
}

// ============================================================================
// Reservoir Computer
// ============================================================================

export class ReservoirComputer extends EventEmitter {
  private config: ReservoirConfig;
  private metrics: ReservoirMetrics;
  private rng: () => number;

  // Network weights
  private inputWeights: Matrix;       // W_in
  private reservoirWeights: Matrix;   // W_res
  private readoutWeights: Matrix;     // W_out (trained)
  private feedbackWeights: Matrix;    // W_fb (optional)

  // State
  private state: Vector;
  private lastInput: Vector;
  private lastOutput: Vector;
  private step: number;
  private trained: boolean;

  constructor(config: Partial<ReservoirConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = {
      trainings: 0,
      predictions: 0,
      totalError: 0,
      averageError: 0,
      spectralRadius: this.config.spectralRadius,
      reservoirRank: 0,
    };
    this.rng = Math.random;

    // Initialize weights
    this.inputWeights = this.initInputWeights();
    this.reservoirWeights = this.initReservoirWeights();
    this.readoutWeights = createMatrix(this.config.outputSize, this.config.reservoirSize + 1);
    this.feedbackWeights = createMatrix(this.config.reservoirSize, this.config.outputSize);

    // Initialize state
    this.state = Array(this.config.reservoirSize).fill(0);
    this.lastInput = Array(this.config.inputSize).fill(0);
    this.lastOutput = Array(this.config.outputSize).fill(0);
    this.step = 0;
    this.trained = false;

    // Initialize feedback weights (optional, usually zero)
    this.feedbackWeights = randomMatrix(
      this.config.reservoirSize,
      this.config.outputSize,
      0.1,
      this.rng
    );
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private initInputWeights(): Matrix {
    const weights = randomMatrix(
      this.config.reservoirSize,
      this.config.inputSize,
      1.0,
      this.rng
    );

    // Scale input weights
    return weights.map(row =>
      row.map(val => val * this.config.inputScaling)
    );
  }

  private initReservoirWeights(): Matrix {
    // Create sparse random matrix
    const weights = randomMatrix(
      this.config.reservoirSize,
      this.config.reservoirSize,
      this.config.connectivity,
      this.rng
    );

    // Approximate spectral radius scaling
    // (True spectral radius requires eigenvalue computation)
    const currentRadius = this.estimateSpectralRadius(weights);
    const scale = this.config.spectralRadius / Math.max(currentRadius, 0.1);

    return weights.map(row => row.map(val => val * scale));
  }

  private estimateSpectralRadius(matrix: Matrix): number {
    // Power iteration to estimate largest eigenvalue
    let v = Array(matrix.length).fill(null).map(() => this.rng());
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    v = v.map(x => x / norm);

    let eigenvalue = 1;

    for (let iter = 0; iter < 50; iter++) {
      const vNew = matVecMul(matrix, v);
      const newNorm = Math.sqrt(vNew.reduce((s, x) => s + x * x, 0));

      if (newNorm < 1e-10) break;

      eigenvalue = newNorm;
      v = vNew.map(x => x / newNorm);
    }

    return eigenvalue;
  }

  // ============================================================================
  // State Update
  // ============================================================================

  /**
   * Update reservoir state given input
   */
  update(input: Vector): Vector {
    // Ensure input has correct size
    if (input.length !== this.config.inputSize) {
      throw new Error(
        `Input size mismatch: expected ${this.config.inputSize}, got ${input.length}`
      );
    }

    // Pre-activation
    const inputContrib = matVecMul(this.inputWeights, input);
    const stateContrib = matVecMul(this.reservoirWeights, this.state);
    const feedbackContrib = matVecMul(this.feedbackWeights, this.lastOutput);

    const preActivation = addVectors(
      addVectors(inputContrib, stateContrib),
      feedbackContrib
    );

    // Add noise for regularization
    const noise = Array(this.config.reservoirSize)
      .fill(0)
      .map(() => (this.rng() - 0.5) * 2 * this.config.noiseLevel);

    const noisyPreActivation = addVectors(preActivation, noise);

    // Leaky integration with tanh activation
    const newState = tanhVec(noisyPreActivation);

    this.state = this.state.map((s, i) =>
      (1 - this.config.leakRate) * s + this.config.leakRate * newState[i]
    );

    this.lastInput = [...input];
    this.step++;

    return this.state;
  }

  /**
   * Compute output from current state
   */
  output(): Vector {
    if (!this.trained) {
      throw new Error('Reservoir not trained. Call train() first.');
    }

    // Extended state: [1, state] for bias
    const extendedState = [1, ...this.state];
    this.lastOutput = matVecMul(this.readoutWeights, extendedState);

    this.metrics.predictions++;
    return this.lastOutput;
  }

  // ============================================================================
  // Training
  // ============================================================================

  /**
   * Train readout weights on input-target pairs
   */
  train(
    inputs: TimeSeries,
    targets: TimeSeries,
    options: {
      testSplit?: number;
      verbose?: boolean;
    } = {}
  ): TrainResult {
    const startTime = Date.now();
    const testSplit = options.testSplit ?? 0;

    // Reset state
    this.resetState();

    // Collect reservoir states
    const states: Matrix = [];

    for (let t = 0; t < inputs.length; t++) {
      this.update(inputs[t]);

      // Skip washout period
      if (t >= this.config.washoutLength) {
        states.push([1, ...this.state]); // Extended state with bias
      }
    }

    // Prepare training data
    const trainEnd = Math.floor(states.length * (1 - testSplit));
    const trainStates = states.slice(0, trainEnd);
    const trainTargets = targets.slice(this.config.washoutLength, this.config.washoutLength + trainEnd);

    // Ridge regression: W = (S^T S + λI)^-1 S^T Y
    const S = trainStates;
    const Y = trainTargets;

    // Compute S^T S
    const StS = matMul(transpose(S), S);

    // Add ridge regularization
    for (let i = 0; i < StS.length; i++) {
      StS[i][i] += this.config.ridgeParam;
    }

    // Compute S^T Y
    const StY = matMul(transpose(S), Y);

    // Solve via pseudo-inverse (simplified)
    this.readoutWeights = this.solveLinear(StS, StY);
    this.trained = true;

    // Compute training error
    const trainError = this.computeError(trainStates, trainTargets);

    // Compute test error if split
    let testError: number | undefined;
    if (testSplit > 0) {
      const testStates = states.slice(trainEnd);
      const testTargets = targets.slice(this.config.washoutLength + trainEnd);
      testError = this.computeError(testStates, testTargets);
    }

    // Update metrics
    this.metrics.trainings++;
    this.metrics.totalError += trainError;
    this.metrics.averageError = this.metrics.totalError / this.metrics.trainings;
    this.metrics.reservoirRank = this.estimateRank(states);

    const result: TrainResult = {
      trainError,
      testError,
      readoutWeights: this.readoutWeights.map(row => [...row]),
      states,
      duration: Date.now() - startTime,
    };

    this.emit('training:complete', result);
    return result;
  }

  private solveLinear(A: Matrix, B: Matrix): Matrix {
    // Simplified solver using Gaussian elimination with partial pivoting
    const n = A.length;
    const m = B[0].length;

    // Augment A with B
    const augmented = A.map((row, i) => [...row, ...B[i]]);

    // Forward elimination
    for (let col = 0; col < n; col++) {
      // Find pivot
      let maxRow = col;
      let maxVal = Math.abs(augmented[col][col]);

      for (let row = col + 1; row < n; row++) {
        if (Math.abs(augmented[row][col]) > maxVal) {
          maxVal = Math.abs(augmented[row][col]);
          maxRow = row;
        }
      }

      // Swap rows
      [augmented[col], augmented[maxRow]] = [augmented[maxRow], augmented[col]];

      // Eliminate
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(augmented[col][col]) < 1e-10) continue;

        const factor = augmented[row][col] / augmented[col][col];
        for (let j = col; j < n + m; j++) {
          augmented[row][j] -= factor * augmented[col][j];
        }
      }
    }

    // Back substitution
    const X = createMatrix(n, m);

    for (let col = n - 1; col >= 0; col--) {
      for (let j = 0; j < m; j++) {
        let sum = augmented[col][n + j];

        for (let k = col + 1; k < n; k++) {
          sum -= augmented[col][k] * X[k][j];
        }

        X[col][j] = Math.abs(augmented[col][col]) < 1e-10
          ? 0
          : sum / augmented[col][col];
      }
    }

    return transpose(X); // Return as outputSize x (reservoirSize + 1)
  }

  private computeError(states: Matrix, targets: TimeSeries): number {
    let totalError = 0;

    for (let i = 0; i < states.length; i++) {
      const predicted = matVecMul(this.readoutWeights, states[i]);

      for (let j = 0; j < predicted.length; j++) {
        const diff = predicted[j] - targets[i][j];
        totalError += diff * diff;
      }
    }

    return Math.sqrt(totalError / (states.length * targets[0].length));
  }

  private estimateRank(states: Matrix): number {
    // Approximate rank via singular value decay
    // (Full SVD is expensive, this is a rough estimate)
    if (states.length === 0) return 0;

    const variances: number[] = [];

    for (let j = 0; j < states[0].length; j++) {
      const column = states.map(row => row[j]);
      const mean = column.reduce((a, b) => a + b, 0) / column.length;
      const variance = column.reduce((s, x) => s + (x - mean) ** 2, 0) / column.length;
      variances.push(variance);
    }

    // Count significant variances
    const maxVar = Math.max(...variances);
    const threshold = maxVar * 0.01;

    return variances.filter(v => v > threshold).length;
  }

  // ============================================================================
  // Prediction
  // ============================================================================

  /**
   * Predict single step
   */
  predict(input: Vector): Vector {
    this.update(input);
    return this.output();
  }

  /**
   * Process time series
   */
  process(inputs: TimeSeries): TimeSeries {
    const outputs: TimeSeries = [];

    for (const input of inputs) {
      outputs.push(this.predict(input));
    }

    return outputs;
  }

  /**
   * Generate autonomous sequence (teacher forcing off)
   */
  generate(
    seedInputs: TimeSeries,
    length: number
  ): TimeSeries {
    // Process seed inputs
    for (const input of seedInputs) {
      this.predict(input);
    }

    // Generate autonomously
    const generated: TimeSeries = [];
    let lastOut = this.lastOutput;

    for (let i = 0; i < length; i++) {
      // Feed output back as input (assumes inputSize == outputSize)
      const input = lastOut.slice(0, this.config.inputSize);
      this.update(input);
      lastOut = this.output();
      generated.push([...lastOut]);
    }

    return generated;
  }

  // ============================================================================
  // State Management
  // ============================================================================

  getState(): ReservoirState {
    return {
      state: [...this.state],
      lastInput: [...this.lastInput],
      lastOutput: [...this.lastOutput],
      step: this.step,
    };
  }

  setState(newState: Vector): void {
    if (newState.length !== this.config.reservoirSize) {
      throw new Error('State size mismatch');
    }
    this.state = [...newState];
  }

  resetState(): void {
    this.state = Array(this.config.reservoirSize).fill(0);
    this.lastInput = Array(this.config.inputSize).fill(0);
    this.lastOutput = Array(this.config.outputSize).fill(0);
    this.step = 0;
    this.emit('state:reset');
  }

  // ============================================================================
  // Configuration & Metrics
  // ============================================================================

  getMetrics(): ReservoirMetrics {
    return { ...this.metrics };
  }

  getConfig(): ReservoirConfig {
    return { ...this.config };
  }

  isTrained(): boolean {
    return this.trained;
  }

  setRng(rng: () => number): void {
    this.rng = rng;
  }

  /**
   * Reinitialize reservoir with new random weights
   */
  reinitialize(): void {
    this.inputWeights = this.initInputWeights();
    this.reservoirWeights = this.initReservoirWeights();
    this.resetState();
    this.trained = false;
    this.readoutWeights = createMatrix(this.config.outputSize, this.config.reservoirSize + 1);
    this.emit('reinitialized');
  }
}

// ============================================================================
// Specialized Reservoirs
// ============================================================================

/**
 * Create a reservoir optimized for chaotic time series
 */
export function createChaoticReservoir(
  inputSize: number = 1,
  outputSize: number = 1
): ReservoirComputer {
  return new ReservoirComputer({
    inputSize,
    outputSize,
    reservoirSize: 1000,
    spectralRadius: 0.95,
    leakRate: 0.1,
    connectivity: 0.05,
    inputScaling: 0.5,
  });
}

/**
 * Create a reservoir optimized for language/sequence tasks
 */
export function createSequenceReservoir(
  inputSize: number,
  outputSize: number
): ReservoirComputer {
  return new ReservoirComputer({
    inputSize,
    outputSize,
    reservoirSize: 500,
    spectralRadius: 0.9,
    leakRate: 0.3,
    connectivity: 0.1,
    inputScaling: 1.0,
  });
}

/**
 * Create a fast reservoir for real-time tasks
 */
export function createFastReservoir(
  inputSize: number,
  outputSize: number
): ReservoirComputer {
  return new ReservoirComputer({
    inputSize,
    outputSize,
    reservoirSize: 200,
    spectralRadius: 0.85,
    leakRate: 0.5,
    connectivity: 0.2,
    washoutLength: 50,
  });
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a reservoir computer
 */
export function createReservoirComputer(
  config?: Partial<ReservoirConfig>
): ReservoirComputer {
  return new ReservoirComputer(config);
}

// ============================================================================
// Global Instance
// ============================================================================

let globalReservoir: ReservoirComputer | null = null;

/**
 * Get global reservoir instance
 */
export function getReservoirComputer(
  config?: Partial<ReservoirConfig>
): ReservoirComputer {
  if (!globalReservoir) {
    globalReservoir = new ReservoirComputer(config);
  }
  return globalReservoir;
}

/**
 * Reset global reservoir
 */
export function resetReservoirComputer(): void {
  if (globalReservoir) {
    globalReservoir.resetState();
  }
  globalReservoir = null;
}
