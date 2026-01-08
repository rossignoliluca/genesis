/**
 * Genesis 6.0 - Latent State Decoder
 *
 * Decodes latent states back to interpretable representations.
 *
 * Capabilities:
 * - Decode to text descriptions
 * - Decode to structured state
 * - Decode to feature maps
 * - Interpolate between states
 *
 * The decoder is the inverse of the encoder, allowing the system
 * to generate human-readable outputs from internal representations.
 *
 * Architecture:
 * - Modality-specific decoders
 * - Feature extraction
 * - Narrative generation
 *
 * References:
 * - VAE Decoders (Kingma & Welling, 2014)
 * - VQ-VAE (van den Oord et al., 2017)
 *
 * Usage:
 * ```typescript
 * import { createLatentDecoder } from './world-model/decoder.js';
 *
 * const decoder = createLatentDecoder();
 *
 * // Decode to text
 * const description = decoder.decodeToText(latentState);
 *
 * // Decode to structured state
 * const state = decoder.decodeToState(latentState);
 *
 * // Interpolate between states
 * const interpolated = decoder.interpolate(stateA, stateB, 0.5);
 * ```
 */

import { randomUUID } from 'crypto';
import {
  Modality,
  LatentState,
  LatentFeature,
} from './types.js';

// ============================================================================
// Decoder Types
// ============================================================================

export interface DecodedOutput {
  id: string;
  sourceState: string;         // ID of source latent state
  modality: Modality;
  output: unknown;
  confidence: number;
  timestamp: Date;
}

export interface TextDecoding extends DecodedOutput {
  modality: 'text';
  output: string;
  keywords: string[];
  sentiment: number;           // -1 to 1
}

export interface StateDecoding extends DecodedOutput {
  modality: 'state';
  output: Record<string, unknown>;
  numericFields: string[];
  categoricalFields: string[];
}

export interface FeatureDecoding extends DecodedOutput {
  modality: 'state';
  output: LatentFeature[];
  topActivations: number[];
}

export interface DecoderConfig {
  outputDim: number;
  vocabularySize: number;
  maxTextLength: number;
  featureThreshold: number;
  interpolationSteps: number;
}

export const DEFAULT_DECODER_CONFIG: DecoderConfig = {
  outputDim: 512,
  vocabularySize: 10000,
  maxTextLength: 500,
  featureThreshold: 0.1,
  interpolationSteps: 10,
};

// ============================================================================
// Vocabulary for text generation
// ============================================================================

const VOCABULARY = {
  concepts: [
    'system', 'state', 'action', 'process', 'entity', 'relation',
    'input', 'output', 'result', 'change', 'update', 'transform',
    'data', 'information', 'knowledge', 'pattern', 'structure',
    'active', 'passive', 'stable', 'changing', 'growing', 'declining',
  ],
  descriptors: [
    'high', 'low', 'moderate', 'significant', 'minimal', 'optimal',
    'increasing', 'decreasing', 'stable', 'fluctuating', 'converging',
    'strong', 'weak', 'balanced', 'unbalanced', 'coherent', 'fragmented',
  ],
  relations: [
    'connected to', 'dependent on', 'influences', 'causes', 'prevents',
    'enables', 'contains', 'similar to', 'different from', 'related to',
  ],
  sentiment: [
    'positive', 'negative', 'neutral', 'uncertain', 'confident',
    'stable', 'volatile', 'improving', 'declining', 'transitioning',
  ],
};

// ============================================================================
// Latent Decoder
// ============================================================================

export type DecoderEventType =
  | 'decoded_text'
  | 'decoded_state'
  | 'decoded_features'
  | 'interpolated'
  | 'error';

export type DecoderEventHandler = (event: {
  type: DecoderEventType;
  data?: unknown;
}) => void;

export class LatentDecoder {
  private config: DecoderConfig;
  private eventHandlers: Set<DecoderEventHandler> = new Set();

  // Statistics
  private decodingCount: number = 0;
  private interpolationCount: number = 0;

  constructor(config: Partial<DecoderConfig> = {}) {
    this.config = { ...DEFAULT_DECODER_CONFIG, ...config };
  }

  // ============================================================================
  // Text Decoding
  // ============================================================================

  /**
   * Decode latent state to text description
   */
  decodeToText(state: LatentState): TextDecoding {
    const vector = state.vector;

    // Extract dominant features
    const dominantIndices = this.getDominantIndices(vector, 10);

    // Generate keywords from features
    const keywords = this.vectorToKeywords(vector, dominantIndices);

    // Calculate sentiment from vector
    const sentiment = this.calculateSentiment(vector);

    // Generate description
    const description = this.generateDescription(keywords, sentiment, state);

    const decoding: TextDecoding = {
      id: randomUUID(),
      sourceState: state.sourceId,
      modality: 'text',
      output: description,
      keywords,
      sentiment,
      confidence: state.confidence,
      timestamp: new Date(),
    };

    this.decodingCount++;
    this.emit({ type: 'decoded_text', data: { length: description.length, keywords } });

    return decoding;
  }

  /**
   * Extract keywords from vector
   */
  private vectorToKeywords(vector: number[], dominantIndices: number[]): string[] {
    const keywords: string[] = [];

    // Map indices to concept words
    for (const idx of dominantIndices.slice(0, 5)) {
      const conceptIdx = idx % VOCABULARY.concepts.length;
      keywords.push(VOCABULARY.concepts[conceptIdx]);
    }

    // Add descriptors based on vector statistics
    const mean = vector.reduce((a, b) => a + b, 0) / vector.length;
    const variance = vector.reduce((a, b) => a + (b - mean) ** 2, 0) / vector.length;

    if (mean > 0.1) {
      keywords.push('active');
    } else if (mean < -0.1) {
      keywords.push('passive');
    }

    if (variance > 0.3) {
      keywords.push('dynamic');
    } else {
      keywords.push('stable');
    }

    return [...new Set(keywords)]; // Remove duplicates
  }

  /**
   * Calculate sentiment from vector
   */
  private calculateSentiment(vector: number[]): number {
    // Use first few dimensions as sentiment indicators
    const sentimentDims = vector.slice(0, 10);
    const sentiment = sentimentDims.reduce((a, b) => a + b, 0) / sentimentDims.length;
    return Math.max(-1, Math.min(1, sentiment));
  }

  /**
   * Generate natural language description
   */
  private generateDescription(
    keywords: string[],
    sentiment: number,
    state: LatentState
  ): string {
    const parts: string[] = [];

    // Opening based on modality
    const modalityOpening: Record<Modality, string> = {
      text: 'Text content',
      image: 'Visual representation',
      code: 'Code structure',
      state: 'System state',
      audio: 'Audio signal',
      sensor: 'Sensor reading',
    };
    parts.push(modalityOpening[state.sourceModality] || 'Content');

    // Add keywords
    if (keywords.length > 0) {
      parts.push(`involving ${keywords.slice(0, 3).join(', ')}`);
    }

    // Add sentiment description
    const sentimentWord = sentiment > 0.3 ? 'positive'
      : sentiment < -0.3 ? 'negative'
      : 'neutral';
    parts.push(`with ${sentimentWord} indicators`);

    // Add confidence
    const confidenceWord = state.confidence > 0.7 ? 'high'
      : state.confidence > 0.4 ? 'moderate'
      : 'low';
    parts.push(`(${confidenceWord} confidence)`);

    // Add entropy information
    if (state.entropy !== undefined) {
      const entropyWord = state.entropy > 0.7 ? 'high information density'
        : state.entropy > 0.4 ? 'moderate complexity'
        : 'simple structure';
      parts.push(`showing ${entropyWord}`);
    }

    return parts.join(' ') + '.';
  }

  // ============================================================================
  // State Decoding
  // ============================================================================

  /**
   * Decode latent state to structured state
   */
  decodeToState(state: LatentState): StateDecoding {
    const vector = state.vector;
    const output: Record<string, unknown> = {};
    const numericFields: string[] = [];
    const categoricalFields: string[] = [];

    // Decode numerical properties
    output['energy'] = this.sigmoidToRange(vector[0], 0, 1);
    numericFields.push('energy');

    output['stability'] = this.sigmoidToRange(vector[1], 0, 1);
    numericFields.push('stability');

    output['activity'] = this.sigmoidToRange(vector[2], 0, 1);
    numericFields.push('activity');

    output['complexity'] = state.entropy || 0.5;
    numericFields.push('complexity');

    // Decode categorical properties
    const stateIdx = Math.abs(Math.floor(vector[10] * 5)) % 5;
    const states = ['idle', 'active', 'processing', 'waiting', 'error'];
    output['status'] = states[stateIdx];
    categoricalFields.push('status');

    const modeIdx = Math.abs(Math.floor(vector[11] * 4)) % 4;
    const modes = ['normal', 'degraded', 'recovering', 'optimal'];
    output['mode'] = modes[modeIdx];
    categoricalFields.push('mode');

    // Decode array properties
    output['features'] = this.getDominantIndices(vector, 5).map((i) => `feature_${i}`);

    // Add metadata
    output['confidence'] = state.confidence;
    output['timestamp'] = state.timestamp.toISOString();
    output['sourceModality'] = state.sourceModality;

    const decoding: StateDecoding = {
      id: randomUUID(),
      sourceState: state.sourceId,
      modality: 'state',
      output,
      numericFields,
      categoricalFields,
      confidence: state.confidence,
      timestamp: new Date(),
    };

    this.decodingCount++;
    this.emit({ type: 'decoded_state', data: { fields: Object.keys(output).length } });

    return decoding;
  }

  /**
   * Convert sigmoid value to range
   */
  private sigmoidToRange(value: number, min: number, max: number): number {
    const sigmoid = 1 / (1 + Math.exp(-value * 5));
    return min + sigmoid * (max - min);
  }

  // ============================================================================
  // Feature Decoding
  // ============================================================================

  /**
   * Decode to feature representation
   */
  decodeToFeatures(state: LatentState): FeatureDecoding {
    const vector = state.vector;
    const features: LatentFeature[] = [];

    // Extract top activations
    const indexed = vector.map((v, i) => ({ value: v, index: i }));
    indexed.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

    const topActivations = indexed.slice(0, 20).map((item) => item.index);

    // Group into features
    const featureGroups = this.groupFeatures(indexed.slice(0, 50));

    for (let i = 0; i < featureGroups.length; i++) {
      const group = featureGroups[i];
      const avgActivation = group.reduce((sum, item) => sum + Math.abs(item.value), 0) / group.length;

      if (avgActivation >= this.config.featureThreshold) {
        features.push({
          name: `feature_group_${i}`,
          indices: group.map((item) => item.index),
          activation: avgActivation,
        });
      }
    }

    // Add existing features from state
    if (state.features) {
      features.push(...state.features);
    }

    const decoding: FeatureDecoding = {
      id: randomUUID(),
      sourceState: state.sourceId,
      modality: 'state',
      output: features,
      topActivations,
      confidence: state.confidence,
      timestamp: new Date(),
    };

    this.emit({ type: 'decoded_features', data: { featureCount: features.length } });

    return decoding;
  }

  /**
   * Group related features
   */
  private groupFeatures(
    indexed: Array<{ value: number; index: number }>
  ): Array<Array<{ value: number; index: number }>> {
    const groups: Array<Array<{ value: number; index: number }>> = [];
    const used = new Set<number>();

    for (const item of indexed) {
      if (used.has(item.index)) continue;

      const group = [item];
      used.add(item.index);

      // Find nearby indices with similar values
      for (const other of indexed) {
        if (used.has(other.index)) continue;

        const indexDistance = Math.abs(item.index - other.index);
        const valueDistance = Math.abs(item.value - other.value);

        if (indexDistance < 10 && valueDistance < 0.2) {
          group.push(other);
          used.add(other.index);
        }
      }

      if (group.length >= 2) {
        groups.push(group);
      }
    }

    return groups;
  }

  // ============================================================================
  // Interpolation
  // ============================================================================

  /**
   * Interpolate between two latent states
   */
  interpolate(stateA: LatentState, stateB: LatentState, t: number): LatentState {
    const minLen = Math.min(stateA.vector.length, stateB.vector.length);
    const interpolatedVector = new Array(minLen);

    for (let i = 0; i < minLen; i++) {
      interpolatedVector[i] = stateA.vector[i] * (1 - t) + stateB.vector[i] * t;
    }

    const interpolated: LatentState = {
      vector: this.normalize(interpolatedVector),
      dimensions: minLen,
      sourceModality: stateA.sourceModality,
      sourceId: `interp-${stateA.sourceId}-${stateB.sourceId}-${t.toFixed(2)}`,
      timestamp: new Date(),
      confidence: Math.min(stateA.confidence, stateB.confidence) * (1 - Math.abs(t - 0.5) * 0.2),
      entropy: stateA.entropy! * (1 - t) + (stateB.entropy || 0.5) * t,
    };

    this.interpolationCount++;
    this.emit({ type: 'interpolated', data: { t } });

    return interpolated;
  }

  /**
   * Generate interpolation sequence
   */
  interpolateSequence(
    stateA: LatentState,
    stateB: LatentState,
    steps: number = this.config.interpolationSteps
  ): LatentState[] {
    const sequence: LatentState[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      sequence.push(this.interpolate(stateA, stateB, t));
    }

    return sequence;
  }

  /**
   * Spherical interpolation (SLERP) for better interpolation on unit sphere
   */
  slerp(stateA: LatentState, stateB: LatentState, t: number): LatentState {
    const a = this.normalize(stateA.vector);
    const b = this.normalize(stateB.vector);

    // Calculate angle
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const theta = Math.acos(Math.max(-1, Math.min(1, dot)));

    if (theta < 0.001) {
      // Vectors are nearly parallel, use linear interpolation
      return this.interpolate(stateA, stateB, t);
    }

    const sinTheta = Math.sin(theta);
    const weightA = Math.sin((1 - t) * theta) / sinTheta;
    const weightB = Math.sin(t * theta) / sinTheta;

    const slerpVector = a.map((v, i) => v * weightA + b[i] * weightB);

    return {
      vector: slerpVector,
      dimensions: slerpVector.length,
      sourceModality: stateA.sourceModality,
      sourceId: `slerp-${stateA.sourceId}-${stateB.sourceId}-${t.toFixed(2)}`,
      timestamp: new Date(),
      confidence: Math.min(stateA.confidence, stateB.confidence),
      entropy: stateA.entropy! * (1 - t) + (stateB.entropy || 0.5) * t,
    };
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Get indices of dominant (highest absolute) values
   */
  private getDominantIndices(vector: number[], count: number): number[] {
    const indexed = vector.map((v, i) => ({ value: Math.abs(v), index: i }));
    indexed.sort((a, b) => b.value - a.value);
    return indexed.slice(0, count).map((item) => item.index);
  }

  /**
   * Normalize vector
   */
  private normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude === 0) return vector;
    return vector.map((v) => v / magnitude);
  }

  // ============================================================================
  // Analysis
  // ============================================================================

  /**
   * Compare two latent states
   */
  compare(stateA: LatentState, stateB: LatentState): {
    similarity: number;
    distance: number;
    divergentDimensions: number[];
    commonFeatures: string[];
  } {
    // Cosine similarity
    const minLen = Math.min(stateA.vector.length, stateB.vector.length);
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;
    const divergent: number[] = [];

    for (let i = 0; i < minLen; i++) {
      dotProduct += stateA.vector[i] * stateB.vector[i];
      magA += stateA.vector[i] * stateA.vector[i];
      magB += stateB.vector[i] * stateB.vector[i];

      // Track divergent dimensions
      const diff = Math.abs(stateA.vector[i] - stateB.vector[i]);
      if (diff > 0.5) {
        divergent.push(i);
      }
    }

    const similarity = magA > 0 && magB > 0
      ? dotProduct / (Math.sqrt(magA) * Math.sqrt(magB))
      : 0;

    // Euclidean distance
    let sumSq = 0;
    for (let i = 0; i < minLen; i++) {
      sumSq += (stateA.vector[i] - stateB.vector[i]) ** 2;
    }
    const distance = Math.sqrt(sumSq);

    // Common features
    const commonFeatures: string[] = [];
    if (stateA.features && stateB.features) {
      const aNames = new Set(stateA.features.map((f) => f.name));
      for (const f of stateB.features) {
        if (aNames.has(f.name)) {
          commonFeatures.push(f.name);
        }
      }
    }

    return {
      similarity,
      distance,
      divergentDimensions: divergent.slice(0, 10),
      commonFeatures,
    };
  }

  /**
   * Analyze latent state structure
   */
  analyze(state: LatentState): {
    sparsity: number;
    dominantRegion: string;
    clusterAssignment: number;
    anomalyScore: number;
  } {
    const vector = state.vector;

    // Sparsity (fraction of near-zero values)
    const nearZeroCount = vector.filter((v) => Math.abs(v) < 0.01).length;
    const sparsity = nearZeroCount / vector.length;

    // Dominant region
    const regionSize = Math.floor(vector.length / 4);
    const regionSums = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) {
      for (let i = r * regionSize; i < (r + 1) * regionSize; i++) {
        regionSums[r] += Math.abs(vector[i] || 0);
      }
    }
    const dominantRegionIdx = regionSums.indexOf(Math.max(...regionSums));
    const regions = ['semantic', 'structural', 'temporal', 'relational'];
    const dominantRegion = regions[dominantRegionIdx];

    // Simple cluster assignment based on dominant dimensions
    const dominant = this.getDominantIndices(vector, 3);
    const clusterAssignment = (dominant[0] % 10);

    // Anomaly score (deviation from expected distribution)
    const mean = vector.reduce((a, b) => a + b, 0) / vector.length;
    const variance = vector.reduce((a, b) => a + (b - mean) ** 2, 0) / vector.length;
    const expectedVariance = 0.1;
    const anomalyScore = Math.abs(variance - expectedVariance) / expectedVariance;

    return {
      sparsity,
      dominantRegion,
      clusterAssignment,
      anomalyScore: Math.min(1, anomalyScore),
    };
  }

  // ============================================================================
  // Events
  // ============================================================================

  on(handler: DecoderEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: { type: DecoderEventType; data?: unknown }): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('Decoder event handler error:', err);
      }
    }
  }

  // ============================================================================
  // Stats
  // ============================================================================

  stats(): {
    decodingCount: number;
    interpolationCount: number;
  } {
    return {
      decodingCount: this.decodingCount,
      interpolationCount: this.interpolationCount,
    };
  }

  getConfig(): DecoderConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createLatentDecoder(
  config?: Partial<DecoderConfig>
): LatentDecoder {
  return new LatentDecoder(config);
}
