/**
 * MULTI-MODAL PERCEPTION SYSTEM
 *
 * Unified perception across multiple sensory modalities.
 * Fuses visual, auditory, tactile, and proprioceptive inputs.
 *
 * Features:
 * - Early and late fusion architectures
 * - Cross-modal attention
 * - Temporal synchronization
 * - Missing modality handling
 * - Uncertainty-aware fusion
 *
 * Based on:
 * - Multi-modal Transformers
 * - Cross-modal attention mechanisms
 * - Uncertainty-aware fusion (Bayesian deep learning)
 * - Sensory integration literature
 */

// ============================================================================
// TYPES
// ============================================================================

export interface MultiModalConfig {
  modalities: ModalityConfig[];
  fusionMethod: FusionMethod;
  hiddenDim: number;
  numFusionLayers: number;
  temporalWindow: number;          // Frames to consider
  dropoutRate: number;
  uncertaintyEstimation: boolean;
  crossModalAttention: boolean;
}

export interface ModalityConfig {
  name: string;
  type: ModalityType;
  inputShape: number[];
  encoderType: EncoderType;
  encoderDim: number;
  frequency: number;               // Hz
  weight: number;                  // Importance in fusion
}

export type ModalityType =
  | 'visual_rgb'
  | 'visual_depth'
  | 'audio'
  | 'tactile'
  | 'proprioceptive'
  | 'vestibular'
  | 'temperature'
  | 'force_torque'
  | 'text';

export type EncoderType =
  | 'cnn'           // For images
  | 'resnet'        // ResNet-style
  | 'vit'           // Vision Transformer
  | 'rnn'           // For sequential
  | 'transformer'   // For sequences
  | 'mlp';          // Simple feedforward

export type FusionMethod =
  | 'early'         // Concatenate then process
  | 'late'          // Process separately then combine
  | 'hierarchical'  // Multi-level fusion
  | 'attention'     // Attention-based fusion
  | 'tensor'        // Tensor fusion
  | 'multilinear';  // Multilinear pooling

export interface ModalityInput {
  modality: string;
  data: number[] | number[][] | number[][][];
  timestamp: number;
  confidence: number;
}

export interface PerceptionOutput {
  fused: number[];
  perModality: Map<string, number[]>;
  attention: Map<string, number>;
  uncertainty: number;
  timestamp: number;
}

// ============================================================================
// NEURAL NETWORK PRIMITIVES
// ============================================================================

class LinearLayer {
  private weights: number[][];
  private biases: number[];
  private inputDim: number;
  private outputDim: number;

  constructor(inputDim: number, outputDim: number) {
    this.inputDim = inputDim;
    this.outputDim = outputDim;

    // Xavier initialization
    const scale = Math.sqrt(2.0 / (inputDim + outputDim));
    this.weights = Array(outputDim).fill(0).map(() =>
      Array(inputDim).fill(0).map(() => (Math.random() * 2 - 1) * scale)
    );
    this.biases = Array(outputDim).fill(0);
  }

  forward(x: number[]): number[] {
    return this.weights.map((row, i) =>
      row.reduce((sum, w, j) => sum + w * x[j], 0) + this.biases[i]
    );
  }
}

class LayerNorm {
  private gamma: number[];
  private beta: number[];
  private dim: number;
  private eps: number;

  constructor(dim: number, eps: number = 1e-5) {
    this.dim = dim;
    this.eps = eps;
    this.gamma = Array(dim).fill(1);
    this.beta = Array(dim).fill(0);
  }

  forward(x: number[]): number[] {
    const mean = x.reduce((a, b) => a + b, 0) / x.length;
    const variance = x.reduce((a, b) => a + (b - mean) ** 2, 0) / x.length;
    const std = Math.sqrt(variance + this.eps);

    return x.map((v, i) => this.gamma[i] * (v - mean) / std + this.beta[i]);
  }
}

function relu(x: number[]): number[] {
  return x.map(v => Math.max(0, v));
}

function gelu(x: number[]): number[] {
  return x.map(v => 0.5 * v * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (v + 0.044715 * v ** 3))));
}

function softmax(x: number[]): number[] {
  const max = Math.max(...x);
  const exps = x.map(v => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sum);
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// ============================================================================
// MODALITY ENCODERS
// ============================================================================

interface ModalityEncoder {
  encode(input: number[] | number[][] | number[][][]): number[];
  getOutputDim(): number;
}

class MLPEncoder implements ModalityEncoder {
  private layers: LinearLayer[];
  private norms: LayerNorm[];
  private outputDim: number;

  constructor(inputDim: number, hiddenDim: number, outputDim: number, numLayers: number = 2) {
    this.outputDim = outputDim;
    this.layers = [];
    this.norms = [];

    let currentDim = inputDim;
    for (let i = 0; i < numLayers; i++) {
      const nextDim = i === numLayers - 1 ? outputDim : hiddenDim;
      this.layers.push(new LinearLayer(currentDim, nextDim));
      this.norms.push(new LayerNorm(nextDim));
      currentDim = nextDim;
    }
  }

  encode(input: number[] | number[][] | number[][][]): number[] {
    // Flatten input if needed
    let flat = this.flatten(input);

    // Forward through layers
    for (let i = 0; i < this.layers.length; i++) {
      flat = this.layers[i].forward(flat);
      flat = this.norms[i].forward(flat);
      if (i < this.layers.length - 1) {
        flat = gelu(flat);
      }
    }

    return flat;
  }

  private flatten(input: number[] | number[][] | number[][][]): number[] {
    if (!Array.isArray(input[0])) {
      return input as number[];
    }
    const result: number[] = [];
    const recursive = (arr: unknown[]): void => {
      for (const item of arr) {
        if (Array.isArray(item)) {
          recursive(item as unknown[]);
        } else {
          result.push(item as number);
        }
      }
    };
    recursive(input);
    return result;
  }

  getOutputDim(): number {
    return this.outputDim;
  }
}

class CNNEncoder implements ModalityEncoder {
  private outputDim: number;
  private kernels: number[][][][];  // [outChannels][inChannels][kH][kW]
  private fc: LinearLayer;

  constructor(
    inputChannels: number,
    inputHeight: number,
    inputWidth: number,
    outputDim: number
  ) {
    this.outputDim = outputDim;

    // Simple 2-layer CNN
    const numFilters1 = 32;
    const numFilters2 = 64;
    const kernelSize = 3;

    // Initialize kernels (simplified)
    this.kernels = [];
    const scale = Math.sqrt(2.0 / (kernelSize * kernelSize * inputChannels));
    for (let o = 0; o < numFilters1; o++) {
      const kernel: number[][][] = [];
      for (let i = 0; i < inputChannels; i++) {
        const channel: number[][] = [];
        for (let h = 0; h < kernelSize; h++) {
          const row: number[] = [];
          for (let w = 0; w < kernelSize; w++) {
            row.push((Math.random() * 2 - 1) * scale);
          }
          channel.push(row);
        }
        kernel.push(channel);
      }
      this.kernels.push(kernel);
    }

    // Calculate flattened size after convolutions (assuming valid padding and 2x2 pooling)
    const h1 = Math.floor((inputHeight - kernelSize + 1) / 2);
    const w1 = Math.floor((inputWidth - kernelSize + 1) / 2);
    const flatSize = numFilters1 * h1 * w1;

    this.fc = new LinearLayer(Math.min(flatSize, 1024), outputDim);
  }

  encode(input: number[] | number[][] | number[][][]): number[] {
    // Simplified: just use MLP on flattened input for now
    // Real implementation would do proper convolution
    const flat = this.flatten(input);
    const truncated = flat.slice(0, 1024);
    while (truncated.length < 1024) {
      truncated.push(0);
    }
    return this.fc.forward(truncated);
  }

  private flatten(input: number[] | number[][] | number[][][]): number[] {
    const result: number[] = [];
    const recursive = (arr: unknown[]): void => {
      for (const item of arr) {
        if (Array.isArray(item)) {
          recursive(item as unknown[]);
        } else {
          result.push(item as number);
        }
      }
    };
    recursive(Array.isArray(input) ? input : [input]);
    return result;
  }

  getOutputDim(): number {
    return this.outputDim;
  }
}

class TransformerEncoder implements ModalityEncoder {
  private outputDim: number;
  private embedding: LinearLayer;
  private qkv: LinearLayer;
  private outProj: LinearLayer;
  private ffn1: LinearLayer;
  private ffn2: LinearLayer;
  private norm1: LayerNorm;
  private norm2: LayerNorm;
  private numHeads: number;
  private headDim: number;

  constructor(inputDim: number, outputDim: number, numHeads: number = 4) {
    this.outputDim = outputDim;
    this.numHeads = numHeads;
    this.headDim = outputDim / numHeads;

    this.embedding = new LinearLayer(inputDim, outputDim);
    this.qkv = new LinearLayer(outputDim, outputDim * 3);
    this.outProj = new LinearLayer(outputDim, outputDim);
    this.ffn1 = new LinearLayer(outputDim, outputDim * 4);
    this.ffn2 = new LinearLayer(outputDim * 4, outputDim);
    this.norm1 = new LayerNorm(outputDim);
    this.norm2 = new LayerNorm(outputDim);
  }

  encode(input: number[] | number[][] | number[][][]): number[] {
    // Flatten and project
    const flat = this.flatten(input);
    let x = this.embedding.forward(flat.slice(0, Math.min(flat.length, 512)));

    // Ensure correct dimension
    while (x.length < this.outputDim) {
      x.push(0);
    }
    x = x.slice(0, this.outputDim);

    // Self-attention (simplified single token)
    const qkv = this.qkv.forward(x);
    const q = qkv.slice(0, this.outputDim);
    const k = qkv.slice(this.outputDim, this.outputDim * 2);
    const v = qkv.slice(this.outputDim * 2);

    // Attention (simplified)
    const attnScore = q.reduce((sum, qi, i) => sum + qi * k[i], 0) / Math.sqrt(this.outputDim);
    const attnWeight = sigmoid(attnScore);
    const attnOut = v.map(vi => vi * attnWeight);

    // Residual + norm
    x = this.norm1.forward(x.map((xi, i) => xi + attnOut[i]));

    // FFN
    let ffnOut = this.ffn1.forward(x);
    ffnOut = gelu(ffnOut);
    ffnOut = this.ffn2.forward(ffnOut);

    // Residual + norm
    x = this.norm2.forward(x.map((xi, i) => xi + ffnOut[i]));

    return x;
  }

  private flatten(input: number[] | number[][] | number[][][]): number[] {
    const result: number[] = [];
    const recursive = (arr: unknown[]): void => {
      for (const item of arr) {
        if (Array.isArray(item)) {
          recursive(item as unknown[]);
        } else {
          result.push(item as number);
        }
      }
    };
    recursive(Array.isArray(input) ? input : [input]);
    return result;
  }

  getOutputDim(): number {
    return this.outputDim;
  }
}

// ============================================================================
// MULTI-MODAL FUSION
// ============================================================================

interface FusionModule {
  fuse(encodings: Map<string, number[]>, weights: Map<string, number>): number[];
}

class EarlyFusion implements FusionModule {
  private projection: LinearLayer;

  constructor(inputDims: number[], outputDim: number) {
    const totalDim = inputDims.reduce((a, b) => a + b, 0);
    this.projection = new LinearLayer(totalDim, outputDim);
  }

  fuse(encodings: Map<string, number[]>, weights: Map<string, number>): number[] {
    // Concatenate all encodings
    const concat: number[] = [];
    for (const [modality, encoding] of encodings) {
      const weight = weights.get(modality) || 1.0;
      for (const v of encoding) {
        concat.push(v * weight);
      }
    }

    return this.projection.forward(concat);
  }
}

class LateFusion implements FusionModule {
  private outputDim: number;

  constructor(outputDim: number) {
    this.outputDim = outputDim;
  }

  fuse(encodings: Map<string, number[]>, weights: Map<string, number>): number[] {
    // Weighted average of encodings
    const result = Array(this.outputDim).fill(0);
    let totalWeight = 0;

    for (const [modality, encoding] of encodings) {
      const weight = weights.get(modality) || 1.0;
      totalWeight += weight;
      for (let i = 0; i < Math.min(encoding.length, this.outputDim); i++) {
        result[i] += encoding[i] * weight;
      }
    }

    return result.map(v => v / totalWeight);
  }
}

class AttentionFusion implements FusionModule {
  private queryProj: LinearLayer;
  private keyProj: LinearLayer;
  private valueProj: LinearLayer;
  private outputProj: LinearLayer;
  private outputDim: number;

  constructor(encoderDim: number, outputDim: number, numModalities: number) {
    this.outputDim = outputDim;
    this.queryProj = new LinearLayer(encoderDim, outputDim);
    this.keyProj = new LinearLayer(encoderDim, outputDim);
    this.valueProj = new LinearLayer(encoderDim, outputDim);
    this.outputProj = new LinearLayer(outputDim * numModalities, outputDim);
  }

  fuse(encodings: Map<string, number[]>, weights: Map<string, number>): number[] {
    const modalities = Array.from(encodings.keys());
    const values: number[][] = [];
    const keys: number[][] = [];

    // Project all modalities
    for (const modality of modalities) {
      const encoding = encodings.get(modality)!;
      keys.push(this.keyProj.forward(encoding));
      values.push(this.valueProj.forward(encoding));
    }

    // Cross-modal attention for each modality
    const attended: number[][] = [];

    for (let i = 0; i < modalities.length; i++) {
      const query = this.queryProj.forward(encodings.get(modalities[i])!);

      // Compute attention scores
      const scores: number[] = keys.map(key =>
        query.reduce((sum, q, j) => sum + q * key[j], 0) / Math.sqrt(this.outputDim)
      );
      const attnWeights = softmax(scores);

      // Weighted sum of values
      const attended_i = Array(this.outputDim).fill(0);
      for (let j = 0; j < values.length; j++) {
        for (let k = 0; k < this.outputDim; k++) {
          attended_i[k] += attnWeights[j] * values[j][k];
        }
      }
      attended.push(attended_i);
    }

    // Concatenate and project
    const concat = attended.flat();
    return this.outputProj.forward(concat);
  }
}

class TensorFusion implements FusionModule {
  private outputDim: number;
  private projection: LinearLayer;

  constructor(encoderDim: number, outputDim: number, numModalities: number) {
    this.outputDim = outputDim;
    // Tensor product size grows exponentially, so we project down
    this.projection = new LinearLayer(Math.min(encoderDim * numModalities, 1024), outputDim);
  }

  fuse(encodings: Map<string, number[]>, weights: Map<string, number>): number[] {
    // Simplified tensor fusion: outer product followed by projection
    const modalities = Array.from(encodings.values());

    if (modalities.length === 0) {
      return Array(this.outputDim).fill(0);
    }

    // Start with first modality
    let tensor = modalities[0].slice();

    // Compute outer products (simplified to concatenation + element-wise product)
    for (let i = 1; i < modalities.length; i++) {
      const next = modalities[i];
      const combined: number[] = [];

      // Hadamard product (element-wise)
      for (let j = 0; j < Math.min(tensor.length, next.length); j++) {
        combined.push(tensor[j] * next[j]);
      }
      // Also add original features
      combined.push(...tensor, ...next);

      tensor = combined.slice(0, 1024);
    }

    return this.projection.forward(tensor);
  }
}

// ============================================================================
// TEMPORAL SYNCHRONIZATION
// ============================================================================

interface TemporalBuffer {
  add(modality: string, data: ModalityInput): void;
  getSynchronized(timestamp: number, window: number): Map<string, ModalityInput>;
  clear(): void;
}

class SlidingWindowBuffer implements TemporalBuffer {
  private buffers: Map<string, ModalityInput[]> = new Map();
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  add(modality: string, data: ModalityInput): void {
    if (!this.buffers.has(modality)) {
      this.buffers.set(modality, []);
    }

    const buffer = this.buffers.get(modality)!;
    buffer.push(data);

    // Remove old entries
    while (buffer.length > this.maxSize) {
      buffer.shift();
    }
  }

  getSynchronized(timestamp: number, window: number): Map<string, ModalityInput> {
    const result = new Map<string, ModalityInput>();

    for (const [modality, buffer] of this.buffers) {
      // Find closest sample within window
      let closest: ModalityInput | null = null;
      let minDelta = Infinity;

      for (const sample of buffer) {
        const delta = Math.abs(sample.timestamp - timestamp);
        if (delta < window && delta < minDelta) {
          minDelta = delta;
          closest = sample;
        }
      }

      if (closest) {
        result.set(modality, closest);
      }
    }

    return result;
  }

  clear(): void {
    this.buffers.clear();
  }
}

// ============================================================================
// UNCERTAINTY ESTIMATION
// ============================================================================

interface UncertaintyEstimator {
  estimate(encodings: Map<string, number[]>): number;
}

class EntropyUncertainty implements UncertaintyEstimator {
  estimate(encodings: Map<string, number[]>): number {
    let totalEntropy = 0;
    let count = 0;

    for (const encoding of encodings.values()) {
      // Compute entropy of softmax distribution
      const probs = softmax(encoding);
      const entropy = -probs.reduce((sum, p) =>
        p > 0 ? sum + p * Math.log(p) : sum, 0
      );
      totalEntropy += entropy;
      count++;
    }

    return count > 0 ? totalEntropy / count : 1.0;
  }
}

class VarianceUncertainty implements UncertaintyEstimator {
  estimate(encodings: Map<string, number[]>): number {
    const allEncodings = Array.from(encodings.values());
    if (allEncodings.length < 2) return 0;

    // Compute variance across modalities
    const dim = allEncodings[0].length;
    let totalVariance = 0;

    for (let i = 0; i < dim; i++) {
      const values = allEncodings.map(e => e[i] || 0);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
      totalVariance += variance;
    }

    return totalVariance / dim;
  }
}

// ============================================================================
// MULTI-MODAL PERCEPTION SYSTEM
// ============================================================================

export class MultiModalPerception {
  private config: MultiModalConfig;
  private encoders: Map<string, ModalityEncoder> = new Map();
  private fusion!: FusionModule;  // Initialized in initializeFusion()
  private temporalBuffer: TemporalBuffer;
  private uncertaintyEstimator: UncertaintyEstimator;
  private modalityWeights: Map<string, number> = new Map();

  constructor(config: Partial<MultiModalConfig> = {}) {
    this.config = {
      modalities: [],
      fusionMethod: 'attention',
      hiddenDim: 256,
      numFusionLayers: 2,
      temporalWindow: 100,      // ms
      dropoutRate: 0.1,
      uncertaintyEstimation: true,
      crossModalAttention: true,
      ...config
    };

    this.temporalBuffer = new SlidingWindowBuffer(100);
    this.uncertaintyEstimator = new EntropyUncertainty();

    // Initialize encoders for each modality
    this.initializeEncoders();

    // Initialize fusion module
    this.initializeFusion();
  }

  private initializeEncoders(): void {
    for (const modality of this.config.modalities) {
      const inputDim = modality.inputShape.reduce((a, b) => a * b, 1);

      let encoder: ModalityEncoder;

      switch (modality.encoderType) {
        case 'cnn':
          encoder = new CNNEncoder(
            modality.inputShape[2] || 1,  // channels
            modality.inputShape[0] || 64,  // height
            modality.inputShape[1] || 64,  // width
            modality.encoderDim
          );
          break;

        case 'transformer':
          encoder = new TransformerEncoder(inputDim, modality.encoderDim);
          break;

        case 'mlp':
        default:
          encoder = new MLPEncoder(inputDim, this.config.hiddenDim, modality.encoderDim);
      }

      this.encoders.set(modality.name, encoder);
      this.modalityWeights.set(modality.name, modality.weight);
    }
  }

  private initializeFusion(): void {
    const encoderDims = this.config.modalities.map(m => m.encoderDim);
    const numModalities = this.config.modalities.length;

    switch (this.config.fusionMethod) {
      case 'early':
        this.fusion = new EarlyFusion(encoderDims, this.config.hiddenDim);
        break;

      case 'late':
        this.fusion = new LateFusion(this.config.hiddenDim);
        break;

      case 'attention':
        this.fusion = new AttentionFusion(
          Math.max(...encoderDims),
          this.config.hiddenDim,
          numModalities
        );
        break;

      case 'tensor':
        this.fusion = new TensorFusion(
          Math.max(...encoderDims),
          this.config.hiddenDim,
          numModalities
        );
        break;

      default:
        this.fusion = new LateFusion(this.config.hiddenDim);
    }
  }

  /**
   * Process a single modality input
   */
  processModality(input: ModalityInput): number[] {
    const encoder = this.encoders.get(input.modality);
    if (!encoder) {
      throw new Error(`Unknown modality: ${input.modality}`);
    }

    // Add to temporal buffer
    this.temporalBuffer.add(input.modality, input);

    // Encode
    return encoder.encode(input.data);
  }

  /**
   * Process multiple modality inputs and fuse them
   */
  perceive(inputs: ModalityInput[], timestamp?: number): PerceptionOutput {
    const currentTime = timestamp || Date.now();

    // Add all inputs to buffer
    for (const input of inputs) {
      this.temporalBuffer.add(input.modality, input);
    }

    // Get synchronized inputs
    const synchronized = this.temporalBuffer.getSynchronized(
      currentTime,
      this.config.temporalWindow
    );

    // Encode each modality
    const encodings = new Map<string, number[]>();
    const perModality = new Map<string, number[]>();

    for (const [modality, input] of synchronized) {
      const encoder = this.encoders.get(modality);
      if (encoder) {
        const encoding = encoder.encode(input.data);
        encodings.set(modality, encoding);
        perModality.set(modality, encoding);
      }
    }

    // Handle missing modalities
    this.handleMissingModalities(encodings);

    // Compute attention weights
    const attention = this.computeAttention(encodings);

    // Fuse encodings
    const fused = this.fusion.fuse(encodings, this.modalityWeights);

    // Estimate uncertainty
    const uncertainty = this.config.uncertaintyEstimation
      ? this.uncertaintyEstimator.estimate(encodings)
      : 0;

    return {
      fused,
      perModality,
      attention,
      uncertainty,
      timestamp: currentTime
    };
  }

  private handleMissingModalities(encodings: Map<string, number[]>): void {
    // Fill in missing modalities with zero vectors
    for (const modality of this.config.modalities) {
      if (!encodings.has(modality.name)) {
        const zeros = Array(modality.encoderDim).fill(0);
        encodings.set(modality.name, zeros);

        // Reduce weight for missing modality
        this.modalityWeights.set(modality.name, 0);
      } else {
        // Restore original weight
        this.modalityWeights.set(modality.name, modality.weight);
      }
    }
  }

  private computeAttention(encodings: Map<string, number[]>): Map<string, number> {
    const attention = new Map<string, number>();

    if (!this.config.crossModalAttention) {
      // Equal attention
      const equal = 1 / encodings.size;
      for (const modality of encodings.keys()) {
        attention.set(modality, equal);
      }
      return attention;
    }

    // Compute attention based on encoding magnitude and confidence
    let totalScore = 0;
    const scores = new Map<string, number>();

    for (const [modality, encoding] of encodings) {
      const magnitude = Math.sqrt(encoding.reduce((sum, v) => sum + v * v, 0));
      const weight = this.modalityWeights.get(modality) || 1;
      const score = magnitude * weight;
      scores.set(modality, score);
      totalScore += score;
    }

    // Normalize
    for (const [modality, score] of scores) {
      attention.set(modality, totalScore > 0 ? score / totalScore : 0);
    }

    return attention;
  }

  /**
   * Add a new modality at runtime
   */
  addModality(config: ModalityConfig): void {
    this.config.modalities.push(config);

    const inputDim = config.inputShape.reduce((a, b) => a * b, 1);
    const encoder = new MLPEncoder(inputDim, this.config.hiddenDim, config.encoderDim);

    this.encoders.set(config.name, encoder);
    this.modalityWeights.set(config.name, config.weight);

    // Re-initialize fusion with new modality count
    this.initializeFusion();
  }

  /**
   * Update modality weight dynamically
   */
  updateModalityWeight(modality: string, weight: number): void {
    if (this.modalityWeights.has(modality)) {
      this.modalityWeights.set(modality, weight);
    }
  }

  /**
   * Get current modality weights
   */
  getModalityWeights(): Map<string, number> {
    return new Map(this.modalityWeights);
  }

  /**
   * Clear temporal buffer
   */
  reset(): void {
    this.temporalBuffer.clear();
  }
}

// ============================================================================
// SPECIALIZED MODALITY PROCESSORS
// ============================================================================

export class VisualProcessor {
  private encoder: CNNEncoder;

  constructor(inputHeight: number = 224, inputWidth: number = 224, channels: number = 3) {
    this.encoder = new CNNEncoder(channels, inputHeight, inputWidth, 512);
  }

  process(image: number[][][]): number[] {
    return this.encoder.encode(image);
  }

  extractFeatures(image: number[][][]): {
    encoding: number[];
    edges: number[][];
    regions: number[][];
  } {
    const encoding = this.encoder.encode(image);

    // Simplified edge detection (Sobel-like)
    const edges = this.detectEdges(image);

    // Simplified region extraction
    const regions = this.extractRegions(image);

    return { encoding, edges, regions };
  }

  private detectEdges(image: number[][][]): number[][] {
    // Simplified: return gradient magnitude
    if (!image || !image[0]) return [];

    const height = image.length;
    const width = image[0].length;
    const edges: number[][] = [];

    for (let y = 1; y < height - 1; y++) {
      const row: number[] = [];
      for (let x = 1; x < width - 1; x++) {
        const gx = (image[y][x + 1]?.[0] || 0) - (image[y][x - 1]?.[0] || 0);
        const gy = (image[y + 1]?.[x]?.[0] || 0) - (image[y - 1]?.[x]?.[0] || 0);
        row.push(Math.sqrt(gx * gx + gy * gy));
      }
      edges.push(row);
    }

    return edges;
  }

  private extractRegions(image: number[][][]): number[][] {
    // Simplified: return grid of average colors
    const gridSize = 4;
    const height = image.length;
    const width = image[0]?.length || 0;
    const regionH = Math.floor(height / gridSize);
    const regionW = Math.floor(width / gridSize);

    const regions: number[][] = [];

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        const region: number[] = [0, 0, 0];
        let count = 0;

        for (let y = gy * regionH; y < (gy + 1) * regionH && y < height; y++) {
          for (let x = gx * regionW; x < (gx + 1) * regionW && x < width; x++) {
            const pixel = image[y]?.[x];
            if (pixel) {
              region[0] += pixel[0] || 0;
              region[1] += pixel[1] || 0;
              region[2] += pixel[2] || 0;
              count++;
            }
          }
        }

        if (count > 0) {
          regions.push(region.map(v => v / count));
        }
      }
    }

    return regions;
  }
}

export class AudioProcessor {
  private encoder: TransformerEncoder;
  private sampleRate: number;

  constructor(sampleRate: number = 16000, encoderDim: number = 256) {
    this.sampleRate = sampleRate;
    this.encoder = new TransformerEncoder(sampleRate, encoderDim);
  }

  process(audio: number[]): number[] {
    // Extract mel spectrogram features (simplified)
    const melFeatures = this.computeMelSpectrogram(audio);
    return this.encoder.encode(melFeatures);
  }

  private computeMelSpectrogram(audio: number[]): number[] {
    // Simplified: return energy in frequency bands
    const numBands = 80;
    const frameSize = 400;
    const hopSize = 160;
    const numFrames = Math.floor((audio.length - frameSize) / hopSize);

    const features: number[] = [];

    for (let frame = 0; frame < Math.min(numFrames, 100); frame++) {
      const start = frame * hopSize;
      const segment = audio.slice(start, start + frameSize);

      // Compute energy (simplified)
      const energy = segment.reduce((sum, s) => sum + s * s, 0) / segment.length;

      // Distribute across bands (very simplified)
      for (let band = 0; band < numBands; band++) {
        features.push(energy * (1 + 0.1 * (Math.random() - 0.5)));
      }
    }

    return features;
  }
}

export class ProprioceptiveProcessor {
  private encoder: MLPEncoder;

  constructor(numJoints: number, encoderDim: number = 128) {
    // Joint positions + velocities + torques
    const inputDim = numJoints * 3;
    this.encoder = new MLPEncoder(inputDim, encoderDim * 2, encoderDim);
  }

  process(jointPositions: number[], jointVelocities: number[], jointTorques: number[]): number[] {
    const input = [...jointPositions, ...jointVelocities, ...jointTorques];
    return this.encoder.encode(input);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createMultiModalPerception(config?: Partial<MultiModalConfig>): MultiModalPerception {
  return new MultiModalPerception(config);
}

export function createVisualProcessor(height?: number, width?: number): VisualProcessor {
  return new VisualProcessor(height, width);
}

export function createAudioProcessor(sampleRate?: number): AudioProcessor {
  return new AudioProcessor(sampleRate);
}

export function createProprioceptiveProcessor(numJoints: number): ProprioceptiveProcessor {
  return new ProprioceptiveProcessor(numJoints);
}

// Default modality configurations
export const DEFAULT_MODALITY_CONFIGS: Record<string, ModalityConfig> = {
  rgb_camera: {
    name: 'rgb_camera',
    type: 'visual_rgb',
    inputShape: [224, 224, 3],
    encoderType: 'cnn',
    encoderDim: 512,
    frequency: 30,
    weight: 1.0
  },
  depth_camera: {
    name: 'depth_camera',
    type: 'visual_depth',
    inputShape: [224, 224, 1],
    encoderType: 'cnn',
    encoderDim: 256,
    frequency: 30,
    weight: 0.8
  },
  microphone: {
    name: 'microphone',
    type: 'audio',
    inputShape: [16000],
    encoderType: 'transformer',
    encoderDim: 256,
    frequency: 100,
    weight: 0.6
  },
  proprioception: {
    name: 'proprioception',
    type: 'proprioceptive',
    inputShape: [12 * 3],  // 12 joints * (pos, vel, torque)
    encoderType: 'mlp',
    encoderDim: 128,
    frequency: 100,
    weight: 0.9
  },
  tactile: {
    name: 'tactile',
    type: 'tactile',
    inputShape: [64],  // Tactile sensor array
    encoderType: 'mlp',
    encoderDim: 64,
    frequency: 100,
    weight: 0.7
  }
};
