/**
 * Hyperdimensional Computing (HDC) Module
 *
 * Implements Vector Symbolic Architecture (VSA) for brain-inspired computation.
 * Uses high-dimensional vectors (10,000+ dimensions) where:
 * - Random vectors are quasi-orthogonal
 * - Binding creates associations (XOR)
 * - Bundling creates superpositions (majority vote)
 * - Similarity measured by Hamming distance
 *
 * Key concepts:
 * - Holographic representation: whole in every part
 * - Distributed representation: robust to noise
 * - One-shot learning: no backprop needed
 *
 * Based on:
 * - Kanerva, P. (2009). Hyperdimensional Computing
 * - Plate, T. (1995). Holographic Reduced Representations
 * - Gallant & Okaywe (2013). Representing Objects and Relations
 *
 * Usage:
 * ```typescript
 * import { HyperdimensionalMemory } from './exotic/hyperdimensional.js';
 *
 * const memory = new HyperdimensionalMemory({ dimension: 10000 });
 *
 * // Create vectors
 * const apple = memory.random('apple');
 * const red = memory.random('red');
 *
 * // Bind to create "red apple"
 * const redApple = memory.bind(apple, red);
 *
 * // Query: what is associated with red?
 * const retrieved = memory.retrieve(redApple, red);
 * const similar = memory.query(retrieved); // -> 'apple'
 * ```
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export type HyperVector = Int8Array;  // Binary: -1 or +1

export interface HDCConfig {
  dimension: number;           // Vector dimensionality (typically 10,000)
  threshold: number;           // Similarity threshold for matching
  noiseLevel: number;          // Noise tolerance (0-0.5)
  cleanupIterations: number;   // Auto-associative cleanup iterations
}

export interface MemoryEntry {
  name: string;
  vector: HyperVector;
  metadata?: Record<string, unknown>;
}

export interface QueryResult {
  name: string;
  similarity: number;
  vector: HyperVector;
}

export interface HDCMetrics {
  vectorsCreated: number;
  bindings: number;
  bundles: number;
  queries: number;
  averageSimilarity: number;
  memorySize: number;
}

export interface Sequence {
  name: string;
  items: string[];
  encoded: HyperVector;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: HDCConfig = {
  dimension: 10000,
  threshold: 0.3,
  noiseLevel: 0.1,
  cleanupIterations: 3,
};

// ============================================================================
// Hyperdimensional Memory
// ============================================================================

export class HyperdimensionalMemory extends EventEmitter {
  readonly dimension: number;
  private config: HDCConfig;
  private itemMemory: Map<string, HyperVector> = new Map();
  private entries: MemoryEntry[] = [];
  private sequences: Map<string, Sequence> = new Map();
  private metrics: HDCMetrics;
  private rng: () => number;

  // Pre-computed permutation for sequences
  private permutation: number[] = [];

  constructor(config: Partial<HDCConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dimension = this.config.dimension;
    this.metrics = {
      vectorsCreated: 0,
      bindings: 0,
      bundles: 0,
      queries: 0,
      averageSimilarity: 0,
      memorySize: 0,
    };
    this.rng = Math.random;

    // Initialize permutation for sequences
    this.permutation = this.createPermutation();
  }

  // ============================================================================
  // Vector Operations
  // ============================================================================

  /**
   * Create random hypervector
   */
  random(name?: string): HyperVector {
    const vector = new Int8Array(this.dimension);

    for (let i = 0; i < this.dimension; i++) {
      vector[i] = this.rng() < 0.5 ? -1 : 1;
    }

    if (name) {
      this.itemMemory.set(name, vector);
      this.entries.push({ name, vector });
    }

    this.metrics.vectorsCreated++;
    return vector;
  }

  /**
   * Get or create a named vector
   */
  get(name: string): HyperVector {
    let vector = this.itemMemory.get(name);
    if (!vector) {
      vector = this.random(name);
    }
    return vector;
  }

  /**
   * Bind two vectors (element-wise XOR for bipolar: multiply)
   * Creates key-value association
   */
  bind(a: HyperVector, b: HyperVector): HyperVector {
    const result = new Int8Array(this.dimension);

    for (let i = 0; i < this.dimension; i++) {
      result[i] = (a[i] * b[i]) as -1 | 1;
    }

    this.metrics.bindings++;
    return result;
  }

  /**
   * Unbind (inverse of bind, same operation for XOR)
   */
  unbind(bound: HyperVector, key: HyperVector): HyperVector {
    return this.bind(bound, key);  // XOR is self-inverse
  }

  /**
   * Bundle multiple vectors (element-wise majority vote)
   * Creates superposition
   */
  bundle(...vectors: HyperVector[]): HyperVector {
    if (vectors.length === 0) {
      return this.random();
    }

    if (vectors.length === 1) {
      return new Int8Array(vectors[0]);
    }

    const result = new Int8Array(this.dimension);
    const sums = new Int32Array(this.dimension);

    // Sum all vectors
    for (const vector of vectors) {
      for (let i = 0; i < this.dimension; i++) {
        sums[i] += vector[i];
      }
    }

    // Majority vote with tie-breaking
    for (let i = 0; i < this.dimension; i++) {
      if (sums[i] > 0) {
        result[i] = 1;
      } else if (sums[i] < 0) {
        result[i] = -1;
      } else {
        // Tie: random
        result[i] = this.rng() < 0.5 ? -1 : 1;
      }
    }

    this.metrics.bundles++;
    return result;
  }

  /**
   * Permute vector (for sequences)
   */
  permute(vector: HyperVector, shifts: number = 1): HyperVector {
    const result = new Int8Array(this.dimension);

    for (let i = 0; i < this.dimension; i++) {
      const newIndex = (this.permutation[i] + shifts) % this.dimension;
      result[newIndex] = vector[i];
    }

    return result;
  }

  /**
   * Inverse permute
   */
  inversePermute(vector: HyperVector, shifts: number = 1): HyperVector {
    const result = new Int8Array(this.dimension);

    for (let i = 0; i < this.dimension; i++) {
      const newIndex = (this.permutation[i] + shifts) % this.dimension;
      result[i] = vector[newIndex];
    }

    return result;
  }

  // ============================================================================
  // Similarity & Retrieval
  // ============================================================================

  /**
   * Cosine similarity between vectors (-1 to 1)
   */
  similarity(a: HyperVector, b: HyperVector): number {
    let dotProduct = 0;

    for (let i = 0; i < this.dimension; i++) {
      dotProduct += a[i] * b[i];
    }

    return dotProduct / this.dimension;
  }

  /**
   * Hamming distance (fraction of differing bits)
   */
  hammingDistance(a: HyperVector, b: HyperVector): number {
    let differing = 0;

    for (let i = 0; i < this.dimension; i++) {
      if (a[i] !== b[i]) {
        differing++;
      }
    }

    return differing / this.dimension;
  }

  /**
   * Retrieve value from bound vector given key
   */
  retrieve(boundVector: HyperVector, key: HyperVector): HyperVector {
    return this.unbind(boundVector, key);
  }

  /**
   * Query item memory for most similar vector
   */
  query(target: HyperVector, k: number = 1): QueryResult[] {
    this.metrics.queries++;

    const results: QueryResult[] = [];

    for (const entry of this.entries) {
      const sim = this.similarity(target, entry.vector);
      results.push({
        name: entry.name,
        similarity: sim,
        vector: entry.vector,
      });
    }

    // Sort by similarity (descending)
    results.sort((a, b) => b.similarity - a.similarity);

    // Update average similarity metric
    if (results.length > 0) {
      this.metrics.averageSimilarity =
        (this.metrics.averageSimilarity * (this.metrics.queries - 1) +
          results[0].similarity) /
        this.metrics.queries;
    }

    return results.slice(0, k);
  }

  /**
   * Check if vector matches any in memory above threshold
   */
  matches(target: HyperVector): QueryResult | null {
    const results = this.query(target, 1);

    if (results.length > 0 && results[0].similarity > this.config.threshold) {
      return results[0];
    }

    return null;
  }

  // ============================================================================
  // Cleanup & Reconstruction
  // ============================================================================

  /**
   * Clean up noisy vector using auto-associative memory
   */
  cleanup(noisyVector: HyperVector): HyperVector {
    let current: HyperVector = new Int8Array(noisyVector) as HyperVector;

    for (let iter = 0; iter < this.config.cleanupIterations; iter++) {
      const match = this.matches(current);

      if (match) {
        // Move toward the matched vector
        current = this.bundle(current, match.vector);
      }
    }

    return current;
  }

  /**
   * Add noise to vector
   */
  addNoise(vector: HyperVector, level?: number): HyperVector {
    const noiseLevel = level ?? this.config.noiseLevel;
    const result = new Int8Array(vector);

    for (let i = 0; i < this.dimension; i++) {
      if (this.rng() < noiseLevel) {
        result[i] = (result[i] * -1) as -1 | 1;
      }
    }

    return result;
  }

  // ============================================================================
  // Sequence Encoding
  // ============================================================================

  /**
   * Encode a sequence of items
   * Uses permutation to preserve order
   */
  encodeSequence(items: string[], name?: string): HyperVector {
    const vectors = items.map((item, index) => {
      const itemVector = this.get(item);
      return this.permute(itemVector, index);
    });

    const encoded = this.bundle(...vectors);

    if (name) {
      this.sequences.set(name, {
        name,
        items,
        encoded,
      });
    }

    return encoded;
  }

  /**
   * Query item at position in sequence
   */
  querySequencePosition(sequence: HyperVector, position: number): QueryResult[] {
    const unshifted = this.inversePermute(sequence, position);
    return this.query(unshifted);
  }

  /**
   * Check if item appears in sequence
   */
  sequenceContains(sequence: HyperVector, item: string): boolean {
    const itemVector = this.get(item);

    // Check at multiple positions
    for (let pos = 0; pos < 10; pos++) {
      const query = this.permute(itemVector, pos);
      const sim = this.similarity(sequence, query);

      if (sim > this.config.threshold) {
        return true;
      }
    }

    return false;
  }

  // ============================================================================
  // Analogical Reasoning
  // ============================================================================

  /**
   * Solve analogy: A is to B as C is to ?
   * Returns D such that bind(A, B) ≈ bind(C, D)
   */
  analogy(a: string, b: string, c: string): QueryResult[] {
    const vecA = this.get(a);
    const vecB = this.get(b);
    const vecC = this.get(c);

    // Relationship = bind(A, B)
    const relationship = this.bind(vecA, vecB);

    // D = unbind(relationship, C)
    const vecD = this.unbind(relationship, vecC);

    return this.query(vecD);
  }

  /**
   * Find relationship between two items
   */
  relationship(a: string, b: string): HyperVector {
    return this.bind(this.get(a), this.get(b));
  }

  /**
   * Apply relationship to item
   */
  applyRelationship(relationship: HyperVector, item: string): QueryResult[] {
    const itemVector = this.get(item);
    const result = this.unbind(relationship, itemVector);
    return this.query(result);
  }

  // ============================================================================
  // Record Structures
  // ============================================================================

  /**
   * Create a record with named fields
   * E.g., { name: 'John', age: '30' }
   */
  createRecord(fields: Record<string, string>): HyperVector {
    const bindings: HyperVector[] = [];

    for (const [key, value] of Object.entries(fields)) {
      const keyVec = this.get(`field:${key}`);
      const valueVec = this.get(value);
      bindings.push(this.bind(keyVec, valueVec));
    }

    return this.bundle(...bindings);
  }

  /**
   * Query a field from a record
   */
  queryRecord(record: HyperVector, field: string): QueryResult[] {
    const fieldVec = this.get(`field:${field}`);
    const retrieved = this.unbind(record, fieldVec);
    return this.query(retrieved);
  }

  // ============================================================================
  // Graph Operations
  // ============================================================================

  /**
   * Encode an edge: (subject, predicate, object)
   */
  encodeTriple(
    subject: string,
    predicate: string,
    object: string
  ): HyperVector {
    const s = this.get(subject);
    const p = this.get(predicate);
    const o = this.get(object);

    // Triple = bind(bind(subject, predicate), object)
    return this.bind(this.bind(s, p), o);
  }

  /**
   * Query object given subject and predicate
   */
  queryObject(subject: string, predicate: string): QueryResult[] {
    const s = this.get(subject);
    const p = this.get(predicate);

    // We need triples in memory to query
    // This assumes triples are bundled into a knowledge base
    const query = this.bind(s, p);
    return this.query(query);
  }

  /**
   * Bundle multiple triples into a knowledge graph
   */
  createKnowledgeGraph(
    triples: Array<[string, string, string]>
  ): HyperVector {
    const encoded = triples.map(([s, p, o]) => this.encodeTriple(s, p, o));
    return this.bundle(...encoded);
  }

  // ============================================================================
  // Memory Management
  // ============================================================================

  /**
   * Store a named vector
   */
  store(name: string, vector: HyperVector, metadata?: Record<string, unknown>): void {
    const copy = new Int8Array(vector);
    this.itemMemory.set(name, copy);
    this.entries.push({ name, vector: copy, metadata });
    this.metrics.memorySize = this.entries.length;
  }

  /**
   * Remove a named vector
   */
  remove(name: string): boolean {
    const deleted = this.itemMemory.delete(name);

    if (deleted) {
      this.entries = this.entries.filter(e => e.name !== name);
      this.metrics.memorySize = this.entries.length;
    }

    return deleted;
  }

  /**
   * Get all stored entries
   */
  getEntries(): MemoryEntry[] {
    return [...this.entries];
  }

  /**
   * Check if name exists in memory
   */
  has(name: string): boolean {
    return this.itemMemory.has(name);
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private createPermutation(): number[] {
    const perm: number[] = [];

    for (let i = 0; i < this.dimension; i++) {
      perm.push(i);
    }

    // Fisher-Yates shuffle
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }

    return perm;
  }

  // ============================================================================
  // Metrics & Configuration
  // ============================================================================

  getMetrics(): HDCMetrics {
    return { ...this.metrics };
  }

  getConfig(): HDCConfig {
    return { ...this.config };
  }

  setThreshold(threshold: number): void {
    this.config.threshold = threshold;
  }

  setRng(rng: () => number): void {
    this.rng = rng;
  }

  clear(): void {
    this.itemMemory.clear();
    this.entries = [];
    this.sequences.clear();
    this.metrics = {
      vectorsCreated: 0,
      bindings: 0,
      bundles: 0,
      queries: 0,
      averageSimilarity: 0,
      memorySize: 0,
    };
    this.emit('cleared');
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a hyperdimensional memory
 */
export function createHyperdimensionalMemory(
  config?: Partial<HDCConfig>
): HyperdimensionalMemory {
  return new HyperdimensionalMemory(config);
}

// ============================================================================
// Global Instance
// ============================================================================

let globalMemory: HyperdimensionalMemory | null = null;

/**
 * Get global hyperdimensional memory instance
 */
export function getHyperdimensionalMemory(
  config?: Partial<HDCConfig>
): HyperdimensionalMemory {
  if (!globalMemory) {
    globalMemory = new HyperdimensionalMemory(config);
  }
  return globalMemory;
}

/**
 * Reset global hyperdimensional memory
 */
export function resetHyperdimensionalMemory(): void {
  if (globalMemory) {
    globalMemory.clear();
  }
  globalMemory = null;
}
