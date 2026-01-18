/**
 * CONTRASTIVE LEARNING for Genesis World Model
 *
 * Self-supervised representation learning via contrastive objectives.
 * Learn by distinguishing positive pairs from negative samples.
 *
 * Implements:
 * - SimCLR: Simple Contrastive Learning
 * - MoCo: Momentum Contrast
 * - InfoNCE loss
 * - Temporal Contrast (TCN-style)
 *
 * Applications in Genesis:
 * - State representation learning
 * - Action embedding
 * - Goal similarity
 * - Memory consolidation
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ContrastiveConfig {
  embeddingDim: number;
  projectionDim: number;
  temperature: number;
  queueSize: number;           // For MoCo queue
  momentumCoeff: number;       // For momentum encoder
  numNegatives: number;        // Negatives per positive
  augmentations: string[];
}

export interface ContrastivePair {
  anchor: number[];
  positive: number[];
  negatives: number[][];
}

export interface ContrastiveLoss {
  total: number;
  infoNCE: number;
  alignmentLoss: number;
  uniformityLoss: number;
}

export interface ContrastiveEmbedding {
  raw: number[];
  projected: number[];
  normalized: number[];
}

// ============================================================================
// CONTRASTIVE LEARNER
// ============================================================================

export class ContrastiveLearner {
  private config: ContrastiveConfig;
  private encoder: Encoder;
  private projector: Projector;
  private momentumEncoder: Encoder | null = null;
  private momentumProjector: Projector | null = null;
  private queue: number[][] = [];  // Negative sample queue for MoCo

  constructor(config: Partial<ContrastiveConfig> = {}) {
    this.config = {
      embeddingDim: 256,
      projectionDim: 128,
      temperature: 0.07,
      queueSize: 4096,
      momentumCoeff: 0.999,
      numNegatives: 128,
      augmentations: ['noise', 'dropout', 'mask'],
      ...config
    };

    this.encoder = new Encoder(this.config.embeddingDim);
    this.projector = new Projector(this.config.embeddingDim, this.config.projectionDim);

    // Initialize momentum components for MoCo
    this.momentumEncoder = new Encoder(this.config.embeddingDim);
    this.momentumProjector = new Projector(this.config.embeddingDim, this.config.projectionDim);
    this.copyWeights(this.encoder, this.momentumEncoder);
    this.copyWeights(this.projector, this.momentumProjector);
  }

  // --------------------------------------------------------------------------
  // ENCODING
  // --------------------------------------------------------------------------

  /**
   * Encode input to contrastive embedding
   */
  encode(input: number[]): ContrastiveEmbedding {
    const raw = this.encoder.forward(input);
    const projected = this.projector.forward(raw);
    const normalized = this.l2Normalize(projected);

    return { raw, projected, normalized };
  }

  /**
   * Encode with momentum encoder (for MoCo)
   */
  encodeMomentum(input: number[]): ContrastiveEmbedding {
    if (!this.momentumEncoder || !this.momentumProjector) {
      return this.encode(input);
    }

    const raw = this.momentumEncoder.forward(input);
    const projected = this.momentumProjector.forward(raw);
    const normalized = this.l2Normalize(projected);

    return { raw, projected, normalized };
  }

  // --------------------------------------------------------------------------
  // LOSS COMPUTATION
  // --------------------------------------------------------------------------

  /**
   * Compute InfoNCE loss (the core contrastive loss)
   */
  computeInfoNCELoss(pair: ContrastivePair): number {
    const anchorEmb = this.encode(pair.anchor).normalized;
    const positiveEmb = this.encodeMomentum(pair.positive).normalized;

    // Positive similarity
    const posSim = this.cosineSimilarity(anchorEmb, positiveEmb) / this.config.temperature;

    // Negative similarities
    const negSims: number[] = [];
    for (const neg of pair.negatives) {
      const negEmb = this.encodeMomentum(neg).normalized;
      negSims.push(this.cosineSimilarity(anchorEmb, negEmb) / this.config.temperature);
    }

    // Add queue negatives
    for (const queueItem of this.queue.slice(-this.config.numNegatives)) {
      negSims.push(this.cosineSimilarity(anchorEmb, queueItem) / this.config.temperature);
    }

    // InfoNCE: -log(exp(pos) / (exp(pos) + sum(exp(negs))))
    const maxSim = Math.max(posSim, ...negSims);
    const expPos = Math.exp(posSim - maxSim);
    const expNegs = negSims.reduce((sum, s) => sum + Math.exp(s - maxSim), 0);

    const loss = -Math.log(expPos / (expPos + expNegs));

    // Update queue with positive embedding
    this.updateQueue(positiveEmb);

    return loss;
  }

  /**
   * Compute full contrastive loss with alignment and uniformity
   */
  computeFullLoss(pairs: ContrastivePair[]): ContrastiveLoss {
    let infoNCE = 0;
    const embeddings: number[][] = [];

    for (const pair of pairs) {
      infoNCE += this.computeInfoNCELoss(pair);
      embeddings.push(this.encode(pair.anchor).normalized);
    }

    infoNCE /= pairs.length;

    // Alignment loss: positive pairs should be close
    let alignmentLoss = 0;
    for (const pair of pairs) {
      const anchorEmb = this.encode(pair.anchor).normalized;
      const positiveEmb = this.encode(pair.positive).normalized;
      alignmentLoss += this.l2Distance(anchorEmb, positiveEmb);
    }
    alignmentLoss /= pairs.length;

    // Uniformity loss: embeddings should be uniformly distributed
    const uniformityLoss = this.computeUniformityLoss(embeddings);

    return {
      total: infoNCE + 0.1 * alignmentLoss + 0.1 * uniformityLoss,
      infoNCE,
      alignmentLoss,
      uniformityLoss
    };
  }

  private computeUniformityLoss(embeddings: number[][]): number {
    // Uniformity: embeddings should be uniformly distributed on unit sphere
    // L_uniform = log E[exp(-2 * ||f(x) - f(y)||^2)]

    if (embeddings.length < 2) return 0;

    let sum = 0;
    let count = 0;

    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        const dist = this.l2Distance(embeddings[i], embeddings[j]);
        sum += Math.exp(-2 * dist * dist);
        count++;
      }
    }

    return count > 0 ? Math.log(sum / count) : 0;
  }

  // --------------------------------------------------------------------------
  // AUGMENTATIONS
  // --------------------------------------------------------------------------

  /**
   * Create augmented view of input for contrastive learning
   */
  augment(input: number[]): number[] {
    let augmented = [...input];

    for (const aug of this.config.augmentations) {
      switch (aug) {
        case 'noise':
          augmented = this.addNoise(augmented, 0.1);
          break;
        case 'dropout':
          augmented = this.applyDropout(augmented, 0.1);
          break;
        case 'mask':
          augmented = this.applyMask(augmented, 0.15);
          break;
        case 'scale':
          augmented = this.applyScale(augmented, 0.9, 1.1);
          break;
      }
    }

    return augmented;
  }

  private addNoise(x: number[], std: number): number[] {
    return x.map(v => v + this.sampleNormal() * std);
  }

  private applyDropout(x: number[], p: number): number[] {
    const scale = 1 / (1 - p);
    return x.map(v => Math.random() > p ? v * scale : 0);
  }

  private applyMask(x: number[], ratio: number): number[] {
    const numMask = Math.floor(x.length * ratio);
    const indices = new Set<number>();
    while (indices.size < numMask) {
      indices.add(Math.floor(Math.random() * x.length));
    }
    return x.map((v, i) => indices.has(i) ? 0 : v);
  }

  private applyScale(x: number[], minScale: number, maxScale: number): number[] {
    const scale = minScale + Math.random() * (maxScale - minScale);
    return x.map(v => v * scale);
  }

  /**
   * Create contrastive pair from single input
   */
  createPair(input: number[], negatives: number[][]): ContrastivePair {
    return {
      anchor: input,
      positive: this.augment(input),
      negatives: negatives.slice(0, this.config.numNegatives)
    };
  }

  // --------------------------------------------------------------------------
  // MOMENTUM UPDATE
  // --------------------------------------------------------------------------

  /**
   * Update momentum encoder with exponential moving average
   */
  updateMomentumEncoder(): void {
    if (!this.momentumEncoder || !this.momentumProjector) return;

    const m = this.config.momentumCoeff;
    this.emaUpdateWeights(this.encoder, this.momentumEncoder, m);
    this.emaUpdateWeights(this.projector, this.momentumProjector, m);
  }

  private emaUpdateWeights(source: Encoder | Projector, target: Encoder | Projector, m: number): void {
    const srcLayers = source.getLayers();
    const tgtLayers = target.getLayers();

    for (let l = 0; l < srcLayers.length; l++) {
      const srcL = srcLayers[l];
      const tgtL = tgtLayers[l];

      for (let i = 0; i < srcL.weight.length; i++) {
        for (let j = 0; j < srcL.weight[i].length; j++) {
          tgtL.weight[i][j] = m * tgtL.weight[i][j] + (1 - m) * srcL.weight[i][j];
        }
        if (srcL.bias && tgtL.bias) {
          tgtL.bias[i] = m * tgtL.bias[i] + (1 - m) * srcL.bias[i];
        }
      }
    }
  }

  private copyWeights(source: Encoder | Projector, target: Encoder | Projector): void {
    const srcLayers = source.getLayers();
    const tgtLayers = target.getLayers();

    for (let l = 0; l < srcLayers.length; l++) {
      const srcL = srcLayers[l];
      const tgtL = tgtLayers[l];

      for (let i = 0; i < srcL.weight.length; i++) {
        tgtL.weight[i] = [...srcL.weight[i]];
      }
      if (srcL.bias) {
        tgtL.bias = [...srcL.bias];
      }
    }
  }

  // --------------------------------------------------------------------------
  // QUEUE MANAGEMENT
  // --------------------------------------------------------------------------

  private updateQueue(embedding: number[]): void {
    this.queue.push(embedding);
    if (this.queue.length > this.config.queueSize) {
      this.queue.shift();
    }
  }

  clearQueue(): void {
    this.queue = [];
  }

  // --------------------------------------------------------------------------
  // SIMILARITY METRICS
  // --------------------------------------------------------------------------

  /**
   * Compute similarity between two inputs
   */
  computeSimilarity(a: number[], b: number[]): number {
    const embA = this.encode(a).normalized;
    const embB = this.encode(b).normalized;
    return this.cosineSimilarity(embA, embB);
  }

  /**
   * Find most similar items from candidates
   */
  findMostSimilar(query: number[], candidates: number[][], topK: number = 5): Array<{ index: number; similarity: number }> {
    const queryEmb = this.encode(query).normalized;
    const similarities: Array<{ index: number; similarity: number }> = [];

    for (let i = 0; i < candidates.length; i++) {
      const candEmb = this.encode(candidates[i]).normalized;
      similarities.push({
        index: i,
        similarity: this.cosineSimilarity(queryEmb, candEmb)
      });
    }

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  // --------------------------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------------------------

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      dot += a[i] * b[i];
    }
    return dot;  // Already normalized
  }

  private l2Normalize(x: number[]): number[] {
    const norm = Math.sqrt(x.reduce((sum, v) => sum + v * v, 0));
    return norm > 0 ? x.map(v => v / norm) : x;
  }

  private l2Distance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
  }

  private sampleNormal(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  getConfig(): ContrastiveConfig {
    return { ...this.config };
  }
}

// ============================================================================
// ENCODER
// ============================================================================

class Encoder {
  private layers: LinearLayer[] = [];

  constructor(dim: number) {
    this.layers = [
      this.initLinear(dim, dim * 2),
      this.initLinear(dim * 2, dim * 2),
      this.initLinear(dim * 2, dim)
    ];
  }

  private initLinear(inDim: number, outDim: number): LinearLayer {
    const scale = Math.sqrt(2.0 / (inDim + outDim));
    const weight: number[][] = [];
    for (let i = 0; i < outDim; i++) {
      weight.push(Array(inDim).fill(0).map(() => (Math.random() * 2 - 1) * scale));
    }
    return { weight, bias: Array(outDim).fill(0) };
  }

  forward(x: number[]): number[] {
    let output = x;
    for (let i = 0; i < this.layers.length - 1; i++) {
      output = this.linearForward(output, this.layers[i]);
      output = output.map(v => Math.max(0, v));  // ReLU
    }
    return this.linearForward(output, this.layers[this.layers.length - 1]);
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

  getLayers(): LinearLayer[] {
    return this.layers;
  }
}

// ============================================================================
// PROJECTOR
// ============================================================================

class Projector {
  private layers: LinearLayer[] = [];

  constructor(inputDim: number, outputDim: number) {
    const hiddenDim = Math.max(inputDim, outputDim) * 2;
    this.layers = [
      this.initLinear(inputDim, hiddenDim),
      this.initLinear(hiddenDim, hiddenDim),
      this.initLinear(hiddenDim, outputDim)
    ];
  }

  private initLinear(inDim: number, outDim: number): LinearLayer {
    const scale = Math.sqrt(2.0 / (inDim + outDim));
    const weight: number[][] = [];
    for (let i = 0; i < outDim; i++) {
      weight.push(Array(inDim).fill(0).map(() => (Math.random() * 2 - 1) * scale));
    }
    return { weight, bias: Array(outDim).fill(0) };
  }

  forward(x: number[]): number[] {
    let output = x;
    for (let i = 0; i < this.layers.length - 1; i++) {
      output = this.linearForward(output, this.layers[i]);
      output = output.map(v => Math.max(0, v));  // ReLU
    }
    return this.linearForward(output, this.layers[this.layers.length - 1]);
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

  getLayers(): LinearLayer[] {
    return this.layers;
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
// TEMPORAL CONTRASTIVE LEARNING
// ============================================================================

export class TemporalContrastiveLearner extends ContrastiveLearner {
  private temporalWindow: number;

  constructor(config: Partial<ContrastiveConfig> = {}, temporalWindow: number = 5) {
    super(config);
    this.temporalWindow = temporalWindow;
  }

  /**
   * Create temporal contrastive pairs from sequence
   * Positive: temporally nearby frames
   * Negative: temporally distant frames
   */
  createTemporalPairs(sequence: number[][]): ContrastivePair[] {
    const pairs: ContrastivePair[] = [];

    for (let i = 0; i < sequence.length; i++) {
      // Positive: nearby frame within temporal window
      const minPos = Math.max(0, i - this.temporalWindow);
      const maxPos = Math.min(sequence.length - 1, i + this.temporalWindow);
      const posIdx = minPos + Math.floor(Math.random() * (maxPos - minPos + 1));

      // Negatives: frames outside temporal window
      const negatives: number[][] = [];
      for (let j = 0; j < sequence.length; j++) {
        if (Math.abs(j - i) > this.temporalWindow * 2) {
          negatives.push(sequence[j]);
        }
      }

      if (posIdx !== i && negatives.length > 0) {
        pairs.push({
          anchor: sequence[i],
          positive: sequence[posIdx],
          negatives: negatives.slice(0, this.getConfig().numNegatives)
        });
      }
    }

    return pairs;
  }

  /**
   * Compute temporal consistency score for a sequence
   */
  computeTemporalConsistency(sequence: number[][]): number {
    if (sequence.length < 2) return 1.0;

    let consistencySum = 0;
    for (let i = 0; i < sequence.length - 1; i++) {
      const sim = this.computeSimilarity(sequence[i], sequence[i + 1]);
      consistencySum += sim;
    }

    return consistencySum / (sequence.length - 1);
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export function createContrastiveLearner(
  config?: Partial<ContrastiveConfig>
): ContrastiveLearner {
  return new ContrastiveLearner(config);
}

export function createTemporalContrastiveLearner(
  config?: Partial<ContrastiveConfig>,
  temporalWindow?: number
): TemporalContrastiveLearner {
  return new TemporalContrastiveLearner(config, temporalWindow);
}
