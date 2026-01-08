/**
 * Genesis 6.0 - Latent State Encoder
 *
 * JEPA-style encoder that maps multimodal inputs to a unified latent space.
 *
 * Key concept: All modalities (text, image, code, state) are encoded to
 * the same latent representation, enabling cross-modal prediction and
 * simulation.
 *
 * Architecture:
 * - Modality-specific encoders (text, image, code, state, sensor)
 * - Fusion layer for multimodal inputs
 * - Compression and normalization
 *
 * References:
 * - LeCun (2022). A Path Towards Autonomous Machine Intelligence
 * - CLIP (Radford et al., 2021) - Cross-modal embeddings
 * - JEPA - Joint Embedding Predictive Architecture
 *
 * Usage:
 * ```typescript
 * import { createLatentEncoder } from './world-model/encoder.js';
 *
 * const encoder = createLatentEncoder({ latentDim: 512 });
 *
 * // Encode text
 * const textState = encoder.encode({ modality: 'text', data: 'Hello world' });
 *
 * // Encode image
 * const imageState = encoder.encodeImage(imageData);
 *
 * // Fuse multiple modalities
 * const fusedState = encoder.fuse([textState, imageState]);
 * ```
 */

import { createHash, randomUUID } from 'crypto';
import {
  Modality,
  MultimodalInput,
  TextInput,
  ImageInput,
  CodeInput,
  StateInput,
  SensorInput,
  LatentState,
  LatentFeature,
  EncoderConfig,
  DEFAULT_ENCODER_CONFIG,
} from './types.js';

// ============================================================================
// Encoder Types
// ============================================================================

export interface ModalityEncoder {
  modality: Modality;
  encode(input: MultimodalInput): number[];
  dimensionality: number;
}

// ============================================================================
// Latent Encoder
// ============================================================================

export type EncoderEventType =
  | 'encoded'
  | 'fused'
  | 'compressed'
  | 'error';

export type EncoderEventHandler = (event: {
  type: EncoderEventType;
  data?: unknown;
}) => void;

export class LatentEncoder {
  private config: EncoderConfig;
  private modalityEncoders: Map<Modality, ModalityEncoder> = new Map();
  private eventHandlers: Set<EncoderEventHandler> = new Set();

  // Statistics
  private encodingCount: number = 0;
  private fusionCount: number = 0;
  private totalEncodingTime: number = 0;

  constructor(config: Partial<EncoderConfig> = {}) {
    this.config = { ...DEFAULT_ENCODER_CONFIG, ...config };
    this.initializeEncoders();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private initializeEncoders(): void {
    // Text encoder - uses character-level + word-level hashing
    this.modalityEncoders.set('text', {
      modality: 'text',
      dimensionality: this.config.latentDim,
      encode: (input: MultimodalInput) => this.encodeText(input as TextInput),
    });

    // Image encoder - placeholder for Stability-AI MCP integration
    this.modalityEncoders.set('image', {
      modality: 'image',
      dimensionality: this.config.latentDim,
      encode: (input: MultimodalInput) => this.encodeImage(input as ImageInput),
    });

    // Code encoder - AST-aware encoding
    this.modalityEncoders.set('code', {
      modality: 'code',
      dimensionality: this.config.latentDim,
      encode: (input: MultimodalInput) => this.encodeCode(input as CodeInput),
    });

    // State encoder - structured state encoding
    this.modalityEncoders.set('state', {
      modality: 'state',
      dimensionality: this.config.latentDim,
      encode: (input: MultimodalInput) => this.encodeState(input as StateInput),
    });

    // Sensor encoder - MCP sensor data
    this.modalityEncoders.set('sensor', {
      modality: 'sensor',
      dimensionality: this.config.latentDim,
      encode: (input: MultimodalInput) => this.encodeSensor(input as SensorInput),
    });
  }

  // ============================================================================
  // Main Encoding
  // ============================================================================

  /**
   * Encode any modality to latent space
   */
  encode(input: MultimodalInput): LatentState {
    const startTime = Date.now();

    const encoder = this.modalityEncoders.get(input.modality);
    if (!encoder) {
      throw new Error(`No encoder for modality: ${input.modality}`);
    }

    // Encode to raw vector
    let vector = encoder.encode(input);

    // Apply compression if enabled
    if (this.config.useCompression) {
      vector = this.compress(vector);
    }

    // Normalize if enabled
    if (this.config.normalizeOutput) {
      vector = this.normalize(vector);
    }

    // Apply modality weight
    const weight = this.config.modalityWeights[input.modality];
    vector = vector.map((v) => v * weight);

    // Calculate metadata
    const entropy = this.calculateEntropy(vector);
    const features = this.extractFeatures(vector, input.modality);

    const state: LatentState = {
      vector,
      dimensions: vector.length,
      sourceModality: input.modality,
      sourceId: this.generateSourceId(input),
      timestamp: new Date(),
      confidence: this.calculateConfidence(vector, input),
      entropy,
      features,
    };

    // Update stats
    this.encodingCount++;
    this.totalEncodingTime += Date.now() - startTime;

    this.emit({ type: 'encoded', data: { modality: input.modality, dimensions: vector.length } });

    return state;
  }

  /**
   * Fuse multiple latent states into one
   */
  fuse(states: LatentState[]): LatentState {
    if (states.length === 0) {
      throw new Error('Cannot fuse empty state array');
    }

    if (states.length === 1) {
      return states[0];
    }

    // Weighted average based on confidence
    const totalConfidence = states.reduce((sum, s) => sum + s.confidence, 0);
    const fusedVector = new Array(this.config.latentDim).fill(0);

    for (const state of states) {
      const weight = state.confidence / totalConfidence;
      for (let i = 0; i < Math.min(state.vector.length, fusedVector.length); i++) {
        fusedVector[i] += state.vector[i] * weight;
      }
    }

    // Normalize fused result
    const normalized = this.normalize(fusedVector);

    // Combine features
    const allFeatures: LatentFeature[] = [];
    for (const state of states) {
      if (state.features) {
        allFeatures.push(...state.features);
      }
    }

    const fusedState: LatentState = {
      vector: normalized,
      dimensions: normalized.length,
      sourceModality: 'state', // Fused states are multimodal
      sourceId: `fused-${states.map((s) => s.sourceId).join('-')}`,
      timestamp: new Date(),
      confidence: totalConfidence / states.length,
      entropy: this.calculateEntropy(normalized),
      features: allFeatures.slice(0, 10), // Limit features
    };

    this.fusionCount++;
    this.emit({ type: 'fused', data: { inputCount: states.length } });

    return fusedState;
  }

  // ============================================================================
  // Modality-Specific Encoders
  // ============================================================================

  /**
   * Encode text to latent vector
   * Uses multi-scale hashing for semantic representation
   */
  private encodeText(input: TextInput): number[] {
    const text = input.data;
    const vector = new Array(this.config.latentDim).fill(0);

    // Character-level features (first 1/3)
    const charSection = Math.floor(this.config.latentDim / 3);
    for (let i = 0; i < text.length && i < charSection; i++) {
      const charCode = text.charCodeAt(i);
      vector[i % charSection] += Math.sin(charCode * 0.1) * 0.5;
    }

    // Word-level features (middle 1/3)
    const words = text.split(/\s+/);
    const wordSection = charSection;
    for (let i = 0; i < words.length; i++) {
      const hash = this.simpleHash(words[i]);
      const idx = charSection + (hash % wordSection);
      vector[idx] += 1.0 / (i + 1); // Decay by position
    }

    // N-gram features (last 1/3)
    const ngramSection = this.config.latentDim - 2 * charSection;
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i <= text.length - n; i++) {
        const ngram = text.substring(i, i + n);
        const hash = this.simpleHash(ngram);
        const idx = 2 * charSection + (hash % ngramSection);
        vector[idx] += 0.3 / n;
      }
    }

    return vector;
  }

  /**
   * Encode image to latent vector
   * Placeholder - would integrate with Stability-AI MCP
   */
  private encodeImage(input: ImageInput): number[] {
    const vector = new Array(this.config.latentDim).fill(0);

    // Simple encoding based on image metadata
    // In production, would use actual image encoder
    const data = input.data;
    const hash = createHash('sha256').update(data).digest();

    // Spread hash across vector
    for (let i = 0; i < hash.length; i++) {
      const idx = (i * 17) % this.config.latentDim;
      vector[idx] = (hash[i] - 128) / 128;
    }

    // Add size features if available
    if (input.width && input.height) {
      vector[0] = Math.log(input.width) / 10;
      vector[1] = Math.log(input.height) / 10;
      vector[2] = input.width / input.height; // Aspect ratio
    }

    return vector;
  }

  /**
   * Encode code to latent vector
   * AST-aware encoding
   */
  private encodeCode(input: CodeInput): number[] {
    const code = input.data;
    const language = input.language;
    const vector = new Array(this.config.latentDim).fill(0);

    // Language feature
    const langHash = this.simpleHash(language);
    vector[0] = (langHash % 100) / 100;

    // Structural features
    const lines = code.split('\n');
    vector[1] = Math.log(lines.length + 1) / 10;

    // Indentation pattern (structure indicator)
    let totalIndent = 0;
    for (const line of lines) {
      const indent = line.match(/^\s*/)?.[0].length || 0;
      totalIndent += indent;
    }
    vector[2] = totalIndent / (lines.length * 10);

    // Keyword features
    const keywords = ['function', 'class', 'if', 'for', 'while', 'return', 'import', 'export', 'const', 'let', 'var'];
    for (let i = 0; i < keywords.length; i++) {
      const count = (code.match(new RegExp(`\\b${keywords[i]}\\b`, 'g')) || []).length;
      vector[10 + i] = Math.min(count / 10, 1);
    }

    // Token-level encoding
    const tokens = code.split(/\s+|[{}()\[\];,]/);
    const tokenSection = Math.floor(this.config.latentDim / 2);
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i]) {
        const hash = this.simpleHash(tokens[i]);
        const idx = 50 + (hash % tokenSection);
        vector[idx] += 0.1 / Math.log(i + 2);
      }
    }

    return vector;
  }

  /**
   * Encode state to latent vector
   */
  private encodeState(input: StateInput): number[] {
    const state = input.data;
    const vector = new Array(this.config.latentDim).fill(0);

    // Flatten state to key-value pairs
    const pairs = this.flattenObject(state);
    const numericValues: number[] = [];
    const stringValues: string[] = [];

    for (const [key, value] of pairs) {
      if (typeof value === 'number') {
        numericValues.push(value);
        // Hash key to index
        const idx = this.simpleHash(key) % this.config.latentDim;
        vector[idx] = value / (Math.abs(value) + 1); // Normalize
      } else if (typeof value === 'string') {
        stringValues.push(value);
        const idx = this.simpleHash(key + value) % this.config.latentDim;
        vector[idx] = 0.5;
      } else if (typeof value === 'boolean') {
        const idx = this.simpleHash(key) % this.config.latentDim;
        vector[idx] = value ? 1 : -1;
      }
    }

    // Statistics of numeric values
    if (numericValues.length > 0) {
      const mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
      const variance = numericValues.reduce((a, b) => a + (b - mean) ** 2, 0) / numericValues.length;
      vector[0] = mean / (Math.abs(mean) + 1);
      vector[1] = Math.sqrt(variance) / (Math.sqrt(variance) + 1);
    }

    return vector;
  }

  /**
   * Encode sensor data to latent vector
   */
  private encodeSensor(input: SensorInput): number[] {
    const vector = new Array(this.config.latentDim).fill(0);

    // Sensor type feature
    const typeHash = this.simpleHash(input.sensorType);
    vector[0] = (typeHash % 256) / 256;

    // Source feature
    const sourceHash = this.simpleHash(input.source);
    vector[1] = (sourceHash % 256) / 256;

    // Encode data based on type
    const data = input.data;
    if (typeof data === 'number') {
      vector[2] = data / (Math.abs(data) + 1);
    } else if (typeof data === 'string') {
      const textEncoding = this.encodeText({
        modality: 'text',
        data,
        timestamp: input.timestamp,
      });
      // Blend text encoding into sensor vector
      for (let i = 0; i < textEncoding.length; i++) {
        vector[10 + (i % (this.config.latentDim - 10))] = textEncoding[i] * 0.5;
      }
    } else if (Array.isArray(data)) {
      for (let i = 0; i < data.length && i < this.config.latentDim - 10; i++) {
        if (typeof data[i] === 'number') {
          vector[10 + i] = data[i] / (Math.abs(data[i]) + 1);
        }
      }
    } else if (typeof data === 'object' && data !== null) {
      const stateEncoding = this.encodeState({
        modality: 'state',
        data: data as Record<string, unknown>,
        timestamp: input.timestamp,
      });
      for (let i = 0; i < stateEncoding.length; i++) {
        vector[i] = (vector[i] + stateEncoding[i]) / 2;
      }
    }

    return vector;
  }

  // ============================================================================
  // Vector Operations
  // ============================================================================

  /**
   * Compress vector using simple pooling
   */
  private compress(vector: number[]): number[] {
    const targetDim = Math.floor(vector.length * this.config.compressionRatio);
    if (targetDim >= vector.length) return vector;

    const compressed = new Array(this.config.latentDim).fill(0);
    const poolSize = Math.ceil(vector.length / this.config.latentDim);

    for (let i = 0; i < this.config.latentDim; i++) {
      const start = i * poolSize;
      const end = Math.min(start + poolSize, vector.length);
      let sum = 0;
      let count = 0;
      for (let j = start; j < end; j++) {
        sum += vector[j];
        count++;
      }
      compressed[i] = count > 0 ? sum / count : 0;
    }

    this.emit({ type: 'compressed', data: { from: vector.length, to: compressed.length } });

    return compressed;
  }

  /**
   * L2 normalize vector
   */
  private normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude === 0) return vector;
    return vector.map((v) => v / magnitude);
  }

  /**
   * Calculate entropy of vector
   */
  private calculateEntropy(vector: number[]): number {
    // Normalize to probability-like values
    const absSum = vector.reduce((sum, v) => sum + Math.abs(v), 0);
    if (absSum === 0) return 0;

    const probs = vector.map((v) => Math.abs(v) / absSum);
    let entropy = 0;
    for (const p of probs) {
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    // Normalize by max entropy
    const maxEntropy = Math.log2(vector.length);
    return entropy / maxEntropy;
  }

  /**
   * Calculate confidence based on vector properties
   */
  private calculateConfidence(vector: number[], input: MultimodalInput): number {
    // Base confidence from vector magnitude
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    let confidence = Math.min(magnitude, 1);

    // Reduce confidence for sparse vectors
    const nonZeroCount = vector.filter((v) => Math.abs(v) > 0.01).length;
    const sparsity = nonZeroCount / vector.length;
    confidence *= Math.sqrt(sparsity);

    // Reduce confidence for old data
    const age = Date.now() - input.timestamp.getTime();
    const ageFactor = Math.exp(-age / 3600000); // Decay over 1 hour
    confidence *= ageFactor;

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Extract named features from vector
   */
  private extractFeatures(vector: number[], modality: Modality): LatentFeature[] {
    const features: LatentFeature[] = [];

    // Find top activations
    const indexed = vector.map((v, i) => ({ value: Math.abs(v), index: i }));
    indexed.sort((a, b) => b.value - a.value);

    const topK = 5;
    for (let i = 0; i < Math.min(topK, indexed.length); i++) {
      if (indexed[i].value > 0.1) {
        features.push({
          name: `${modality}_feature_${i}`,
          indices: [indexed[i].index],
          activation: indexed[i].value,
        });
      }
    }

    return features;
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Simple string hash
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Flatten object to key-value pairs
   */
  private flattenObject(
    obj: Record<string, unknown>,
    prefix: string = ''
  ): Array<[string, unknown]> {
    const pairs: Array<[string, unknown]> = [];

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        pairs.push(...this.flattenObject(value as Record<string, unknown>, fullKey));
      } else {
        pairs.push([fullKey, value]);
      }
    }

    return pairs;
  }

  /**
   * Generate source ID from input
   */
  private generateSourceId(input: MultimodalInput): string {
    const hash = createHash('md5')
      .update(JSON.stringify(input.data).slice(0, 1000))
      .digest('hex')
      .slice(0, 8);
    return `${input.modality}-${hash}`;
  }

  // ============================================================================
  // Distance / Similarity
  // ============================================================================

  /**
   * Cosine similarity between two latent states
   */
  similarity(a: LatentState, b: LatentState): number {
    const minLen = Math.min(a.vector.length, b.vector.length);
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < minLen; i++) {
      dotProduct += a.vector[i] * b.vector[i];
      magA += a.vector[i] * a.vector[i];
      magB += b.vector[i] * b.vector[i];
    }

    const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }

  /**
   * Euclidean distance between two latent states
   */
  distance(a: LatentState, b: LatentState): number {
    const minLen = Math.min(a.vector.length, b.vector.length);
    let sumSq = 0;

    for (let i = 0; i < minLen; i++) {
      const diff = a.vector[i] - b.vector[i];
      sumSq += diff * diff;
    }

    return Math.sqrt(sumSq);
  }

  // ============================================================================
  // Events
  // ============================================================================

  on(handler: EncoderEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: { type: EncoderEventType; data?: unknown }): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('Encoder event handler error:', err);
      }
    }
  }

  // ============================================================================
  // Stats
  // ============================================================================

  stats(): {
    encodingCount: number;
    fusionCount: number;
    avgEncodingTime: number;
    latentDim: number;
    modalities: Modality[];
  } {
    return {
      encodingCount: this.encodingCount,
      fusionCount: this.fusionCount,
      avgEncodingTime: this.encodingCount > 0
        ? this.totalEncodingTime / this.encodingCount
        : 0,
      latentDim: this.config.latentDim,
      modalities: Array.from(this.modalityEncoders.keys()),
    };
  }

  /**
   * Get configuration
   */
  getConfig(): EncoderConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createLatentEncoder(
  config?: Partial<EncoderConfig>
): LatentEncoder {
  return new LatentEncoder(config);
}
