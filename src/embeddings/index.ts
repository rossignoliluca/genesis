/**
 * Genesis v9.0 - Embeddings Service
 *
 * Real vector embeddings for semantic search using:
 * - Ollama (local, free) - nomic-embed-text, mxbai-embed-large
 * - OpenAI (cloud, paid) - text-embedding-3-small
 *
 * Provides:
 * - Text to vector conversion
 * - Batch embedding
 * - Vector persistence
 * - Similarity search
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface EmbeddingConfig {
  provider: 'ollama' | 'openai' | 'hash';  // hash = fallback
  model: string;
  dimensions: number;
  cachePath: string;
  batchSize: number;
}

export interface EmbeddingResult {
  text: string;
  vector: number[];
  model: string;
  hash: string;  // Content hash for cache lookup
}

export interface VectorStore {
  version: string;
  model: string;
  dimensions: number;
  vectors: Map<string, number[]>;  // hash -> vector
  metadata: Map<string, VectorMetadata>;
}

export interface VectorMetadata {
  id: string;
  hash: string;
  text: string;
  createdAt: Date;
  source?: string;
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CONFIG: EmbeddingConfig = {
  provider: 'ollama',
  model: 'nomic-embed-text',  // 768 dims, great for code
  dimensions: 768,
  cachePath: '.genesis/vectors',
  batchSize: 32,
};

// Model dimensions lookup
const MODEL_DIMENSIONS: Record<string, number> = {
  'nomic-embed-text': 768,
  'mxbai-embed-large': 1024,
  'all-minilm': 384,
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'hash': 256,  // Fallback hash-based
};

// ============================================================================
// Embedding Provider
// ============================================================================

export class EmbeddingProvider {
  private config: EmbeddingConfig;
  private cache: Map<string, number[]> = new Map();
  private cacheLoaded = false;

  constructor(config: Partial<EmbeddingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.config.dimensions = MODEL_DIMENSIONS[this.config.model] || 768;
  }

  /**
   * Get embedding for a single text
   */
  async embed(text: string): Promise<EmbeddingResult> {
    const hash = this.hashText(text);

    // Check cache first
    if (this.cache.has(hash)) {
      return {
        text,
        vector: this.cache.get(hash)!,
        model: this.config.model,
        hash,
      };
    }

    // Get embedding from provider
    let vector: number[];

    switch (this.config.provider) {
      case 'ollama':
        vector = await this.embedOllama(text);
        break;
      case 'openai':
        vector = await this.embedOpenAI(text);
        break;
      default:
        vector = this.embedHash(text);
    }

    // Cache result
    this.cache.set(hash, vector);

    return { text, vector, model: this.config.model, hash };
  }

  /**
   * Batch embed multiple texts
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    const uncached: { text: string; hash: string; index: number }[] = [];

    // Check cache first
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const hash = this.hashText(text);

      if (this.cache.has(hash)) {
        results[i] = {
          text,
          vector: this.cache.get(hash)!,
          model: this.config.model,
          hash,
        };
      } else {
        uncached.push({ text, hash, index: i });
      }
    }

    // Batch process uncached
    if (uncached.length > 0) {
      const batchTexts = uncached.map(u => u.text);

      let vectors: number[][];
      switch (this.config.provider) {
        case 'ollama':
          vectors = await this.embedBatchOllama(batchTexts);
          break;
        case 'openai':
          vectors = await this.embedBatchOpenAI(batchTexts);
          break;
        default:
          vectors = batchTexts.map(t => this.embedHash(t));
      }

      // Store results and cache
      for (let i = 0; i < uncached.length; i++) {
        const { text, hash, index } = uncached[i];
        const vector = vectors[i];

        this.cache.set(hash, vector);
        results[index] = { text, vector, model: this.config.model, hash };
      }
    }

    return results;
  }

  /**
   * Ollama embedding (local)
   */
  private async embedOllama(text: string): Promise<number[]> {
    const baseUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';

    try {
      const response = await fetch(`${baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          prompt: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }

      const data = await response.json() as { embedding: number[] };
      return data.embedding;
    } catch (error) {
      // Fallback to hash embedding
      console.warn(`Ollama embedding failed, using hash fallback: ${error}`);
      return this.embedHash(text);
    }
  }

  /**
   * Batch Ollama embedding
   */
  private async embedBatchOllama(texts: string[]): Promise<number[][]> {
    // Ollama doesn't support batch, process sequentially
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embedOllama(text));
    }
    return results;
  }

  /**
   * OpenAI embedding (cloud)
   */
  private async embedOpenAI(text: string): Promise<number[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return this.embedHash(text);
    }

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          input: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI error: ${response.status}`);
      }

      const data = await response.json() as { data: Array<{ embedding: number[] }> };
      return data.data[0].embedding;
    } catch (error) {
      console.warn(`OpenAI embedding failed, using hash fallback: ${error}`);
      return this.embedHash(text);
    }
  }

  /**
   * Batch OpenAI embedding
   */
  private async embedBatchOpenAI(texts: string[]): Promise<number[][]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return texts.map(t => this.embedHash(t));
    }

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          input: texts,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI error: ${response.status}`);
      }

      const data = await response.json() as { data: Array<{ embedding: number[] }> };
      return data.data.map(d => d.embedding);
    } catch (error) {
      console.warn(`OpenAI batch embedding failed: ${error}`);
      return texts.map(t => this.embedHash(t));
    }
  }

  /**
   * Hash-based embedding (fallback, no API needed)
   */
  private embedHash(text: string): number[] {
    const dims = this.config.dimensions;
    const hash = crypto.createHash('sha512').update(text).digest();
    const vector: number[] = new Array(dims);

    // Use hash bytes to seed pseudo-random values
    for (let i = 0; i < dims; i++) {
      const byteIndex = i % hash.length;
      vector[i] = (hash[byteIndex] / 255) * 2 - 1;  // Normalize to [-1, 1]
    }

    // Add word-based features for better semantic matching
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    const wordSet = new Set(words);

    // Create word hash signatures
    for (const word of wordSet) {
      const wordHash = crypto.createHash('md5').update(word).digest();
      for (let i = 0; i < Math.min(4, wordHash.length); i++) {
        const idx = wordHash[i] % dims;
        vector[idx] = (vector[idx] + (wordHash[i + 4] || wordHash[i]) / 255) / 2;
      }
    }

    // Normalize vector
    const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < dims; i++) {
        vector[i] /= norm;
      }
    }

    return vector;
  }

  /**
   * Compute cosine similarity between two vectors
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dotProduct / denominator : 0;
  }

  /**
   * Find top-K similar vectors
   */
  findSimilar(
    queryVector: number[],
    candidates: Array<{ id: string; vector: number[] }>,
    topK: number = 5
  ): Array<{ id: string; score: number }> {
    const scores = candidates.map(c => ({
      id: c.id,
      score: this.cosineSimilarity(queryVector, c.vector),
    }));

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  }

  /**
   * Hash text for cache lookup
   */
  private hashText(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  /**
   * Save cache to disk
   */
  async saveCache(): Promise<void> {
    const cacheDir = path.resolve(this.config.cachePath);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const cacheFile = path.join(cacheDir, `embeddings-${this.config.model}.json`);
    const data = {
      version: '9.0.0',
      model: this.config.model,
      dimensions: this.config.dimensions,
      count: this.cache.size,
      vectors: Object.fromEntries(this.cache),
    };

    fs.writeFileSync(cacheFile, JSON.stringify(data));
  }

  /**
   * Load cache from disk
   */
  async loadCache(): Promise<boolean> {
    if (this.cacheLoaded) return true;

    const cacheDir = path.resolve(this.config.cachePath);
    const cacheFile = path.join(cacheDir, `embeddings-${this.config.model}.json`);

    if (!fs.existsSync(cacheFile)) {
      return false;
    }

    try {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));

      // Validate model match
      if (data.model !== this.config.model) {
        console.warn(`Cache model mismatch: ${data.model} vs ${this.config.model}`);
        return false;
      }

      // Load vectors
      for (const [hash, vector] of Object.entries(data.vectors)) {
        this.cache.set(hash, vector as number[]);
      }

      this.cacheLoaded = true;
      return true;
    } catch (error) {
      console.warn(`Failed to load embedding cache: ${error}`);
      return false;
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; model: string; dimensions: number } {
    return {
      size: this.cache.size,
      model: this.config.model,
      dimensions: this.config.dimensions,
    };
  }

  /**
   * Get config
   */
  getConfig(): EmbeddingConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Vector Store
// ============================================================================

export class VectorDatabase {
  private provider: EmbeddingProvider;
  private vectors: Map<string, number[]> = new Map();
  private metadata: Map<string, VectorMetadata> = new Map();
  private storagePath: string;

  constructor(
    storagePath: string = '.genesis/vectors',
    embeddingConfig?: Partial<EmbeddingConfig>
  ) {
    this.storagePath = path.resolve(storagePath);
    this.provider = new EmbeddingProvider(embeddingConfig);
  }

  /**
   * Add document to store
   */
  async add(
    id: string,
    text: string,
    source?: string
  ): Promise<void> {
    const result = await this.provider.embed(text);

    this.vectors.set(id, result.vector);
    this.metadata.set(id, {
      id,
      hash: result.hash,
      text: text.slice(0, 500),  // Store truncated text
      createdAt: new Date(),
      source,
    });
  }

  /**
   * Add multiple documents
   */
  async addBatch(
    documents: Array<{ id: string; text: string; source?: string }>
  ): Promise<void> {
    const texts = documents.map(d => d.text);
    const results = await this.provider.embedBatch(texts);

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const result = results[i];

      this.vectors.set(doc.id, result.vector);
      this.metadata.set(doc.id, {
        id: doc.id,
        hash: result.hash,
        text: doc.text.slice(0, 500),
        createdAt: new Date(),
        source: doc.source,
      });
    }
  }

  /**
   * Search for similar documents
   */
  async search(
    query: string,
    topK: number = 5,
    filter?: (meta: VectorMetadata) => boolean
  ): Promise<Array<{ id: string; score: number; metadata: VectorMetadata }>> {
    const queryResult = await this.provider.embed(query);

    // Build candidate list
    const candidates: Array<{ id: string; vector: number[] }> = [];
    for (const [id, vector] of this.vectors) {
      const meta = this.metadata.get(id);
      if (!filter || (meta && filter(meta))) {
        candidates.push({ id, vector });
      }
    }

    // Find similar
    const similar = this.provider.findSimilar(queryResult.vector, candidates, topK);

    return similar.map(s => ({
      id: s.id,
      score: s.score,
      metadata: this.metadata.get(s.id)!,
    }));
  }

  /**
   * Get document by ID
   */
  get(id: string): VectorMetadata | undefined {
    return this.metadata.get(id);
  }

  /**
   * Delete document
   */
  delete(id: string): boolean {
    this.vectors.delete(id);
    return this.metadata.delete(id);
  }

  /**
   * Clear all documents
   */
  clear(): void {
    this.vectors.clear();
    this.metadata.clear();
  }

  /**
   * Get store size
   */
  size(): number {
    return this.vectors.size;
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  /**
   * Save store to disk
   */
  async save(): Promise<void> {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }

    // Save vectors
    const vectorFile = path.join(this.storagePath, 'vectors.json');
    const vectorData = {
      version: '9.0.0',
      model: this.provider.getConfig().model,
      count: this.vectors.size,
      vectors: Object.fromEntries(this.vectors),
    };
    fs.writeFileSync(vectorFile, JSON.stringify(vectorData));

    // Save metadata
    const metaFile = path.join(this.storagePath, 'metadata.json');
    const metaData = {
      version: '9.0.0',
      count: this.metadata.size,
      items: Object.fromEntries(
        Array.from(this.metadata.entries()).map(([id, meta]) => [
          id,
          { ...meta, createdAt: meta.createdAt.toISOString() },
        ])
      ),
    };
    fs.writeFileSync(metaFile, JSON.stringify(metaData));

    // Save embedding cache
    await this.provider.saveCache();
  }

  /**
   * Load store from disk
   */
  async load(): Promise<boolean> {
    const vectorFile = path.join(this.storagePath, 'vectors.json');
    const metaFile = path.join(this.storagePath, 'metadata.json');

    if (!fs.existsSync(vectorFile) || !fs.existsSync(metaFile)) {
      return false;
    }

    try {
      // Load vectors
      const vectorData = JSON.parse(fs.readFileSync(vectorFile, 'utf-8'));
      for (const [id, vector] of Object.entries(vectorData.vectors)) {
        this.vectors.set(id, vector as number[]);
      }

      // Load metadata
      const metaData = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
      for (const [id, meta] of Object.entries(metaData.items)) {
        const m = meta as VectorMetadata & { createdAt: string };
        this.metadata.set(id, {
          ...m,
          createdAt: new Date(m.createdAt),
        });
      }

      // Load embedding cache
      await this.provider.loadCache();

      return true;
    } catch (error) {
      console.warn(`Failed to load vector store: ${error}`);
      return false;
    }
  }

  /**
   * Get stats
   */
  getStats(): {
    documents: number;
    model: string;
    dimensions: number;
    cacheSize: number;
  } {
    const cacheStats = this.provider.getCacheStats();
    return {
      documents: this.vectors.size,
      model: cacheStats.model,
      dimensions: cacheStats.dimensions,
      cacheSize: cacheStats.size,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let embeddingProvider: EmbeddingProvider | null = null;
let vectorDatabase: VectorDatabase | null = null;

export function getEmbeddingProvider(config?: Partial<EmbeddingConfig>): EmbeddingProvider {
  if (!embeddingProvider) {
    embeddingProvider = new EmbeddingProvider(config);
  }
  return embeddingProvider;
}

export function getVectorDatabase(
  storagePath?: string,
  config?: Partial<EmbeddingConfig>
): VectorDatabase {
  if (!vectorDatabase) {
    vectorDatabase = new VectorDatabase(storagePath, config);
  }
  return vectorDatabase;
}

export function resetEmbeddings(): void {
  embeddingProvider = null;
  vectorDatabase = null;
}
