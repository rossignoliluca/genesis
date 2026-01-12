/**
 * Genesis 7.6 - Embeddings Module
 *
 * Vector embedding generation with multiple providers:
 * - OpenAI (text-embedding-3-small, ada-002)
 * - Local TF-IDF fallback (no API needed)
 * - Cached embeddings for efficiency
 *
 * Features:
 * - Automatic provider selection based on available API keys
 * - Embedding cache with LRU eviction
 * - Batch embedding support
 * - Dimension reduction for storage efficiency
 */

import * as crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export type EmbeddingProvider = 'openai' | 'local';

export interface EmbeddingConfig {
  /** Provider to use */
  provider?: EmbeddingProvider;
  /** OpenAI model (text-embedding-3-small, text-embedding-ada-002) */
  model?: string;
  /** Embedding dimensions (for dimension reduction) */
  dimensions?: number;
  /** Cache size (number of embeddings to cache) */
  cacheSize?: number;
  /** OpenAI API key (or uses OPENAI_API_KEY env) */
  apiKey?: string;
}

export interface EmbeddingResult {
  vector: number[];
  provider: EmbeddingProvider;
  model: string;
  dimensions: number;
  cached: boolean;
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CONFIG: Required<EmbeddingConfig> = {
  provider: 'local',
  model: 'text-embedding-3-small',
  dimensions: 384, // Reduced from 1536 for efficiency
  cacheSize: 1000,
  apiKey: '',
};

// ============================================================================
// LRU Cache for Embeddings
// ============================================================================

class EmbeddingCache {
  private cache: Map<string, number[]> = new Map();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  private hash(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  get(text: string): number[] | undefined {
    const key = this.hash(text);
    const value = this.cache.get(key);
    if (value) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(text: string, vector: number[]): void {
    const key = this.hash(text);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }

    this.cache.set(key, vector);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ============================================================================
// Local TF-IDF Embeddings (No API Required)
// ============================================================================

/**
 * Simple TF-IDF based embeddings for local use.
 * Uses a fixed vocabulary and produces consistent dimensions.
 */
class LocalEmbedder {
  private vocabulary: Map<string, number> = new Map();
  private idf: Map<string, number> = new Map();
  private dimensions: number;
  private documents: string[] = [];

  constructor(dimensions: number = 384) {
    this.dimensions = dimensions;
    this.initializeVocabulary();
  }

  /**
   * Initialize with common programming/technical terms
   */
  private initializeVocabulary(): void {
    // Common technical vocabulary for better embeddings
    const commonTerms = [
      'function', 'class', 'method', 'variable', 'type', 'interface',
      'async', 'await', 'promise', 'callback', 'event', 'handler',
      'error', 'exception', 'try', 'catch', 'throw', 'return',
      'import', 'export', 'module', 'package', 'dependency', 'library',
      'api', 'endpoint', 'request', 'response', 'http', 'rest', 'graphql',
      'database', 'query', 'table', 'index', 'schema', 'model',
      'test', 'spec', 'assert', 'expect', 'mock', 'stub',
      'user', 'auth', 'login', 'session', 'token', 'permission',
      'file', 'path', 'directory', 'read', 'write', 'stream',
      'array', 'object', 'string', 'number', 'boolean', 'null',
      'map', 'filter', 'reduce', 'sort', 'find', 'forEach',
      'create', 'update', 'delete', 'get', 'set', 'remove',
      'start', 'stop', 'init', 'load', 'save', 'close',
      'config', 'option', 'setting', 'parameter', 'argument', 'flag',
      'log', 'debug', 'info', 'warn', 'error', 'trace',
      'memory', 'cache', 'store', 'buffer', 'queue', 'stack',
      'thread', 'process', 'worker', 'pool', 'concurrent', 'parallel',
      'network', 'socket', 'connection', 'protocol', 'port', 'host',
      'encrypt', 'decrypt', 'hash', 'sign', 'verify', 'key',
      'parse', 'serialize', 'encode', 'decode', 'format', 'transform',
    ];

    // Assign indices to vocabulary terms
    let idx = 0;
    for (const term of commonTerms) {
      this.vocabulary.set(term.toLowerCase(), idx++);
    }
  }

  /**
   * Tokenize text into terms
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);
  }

  /**
   * Calculate term frequency
   */
  private tf(terms: string[]): Map<string, number> {
    const freq = new Map<string, number>();
    for (const term of terms) {
      freq.set(term, (freq.get(term) || 0) + 1);
    }
    // Normalize
    const max = Math.max(...freq.values());
    for (const [term, count] of freq) {
      freq.set(term, count / max);
    }
    return freq;
  }

  /**
   * Generate embedding vector for text
   */
  embed(text: string): number[] {
    const terms = this.tokenize(text);
    const tf = this.tf(terms);

    // Create vector with vocabulary indices
    const vector = new Array(this.dimensions).fill(0);

    for (const [term, freq] of tf) {
      const idx = this.vocabulary.get(term);
      if (idx !== undefined && idx < this.dimensions) {
        vector[idx] = freq;
      } else {
        // Hash unknown terms to random position
        const hash = this.hashTerm(term);
        const position = hash % this.dimensions;
        vector[position] += freq * 0.5; // Lower weight for unknown terms
      }
    }

    // Add character n-gram features for robustness
    const ngrams = this.charNgrams(text, 3);
    for (const ngram of ngrams) {
      const hash = this.hashTerm(ngram);
      const position = hash % this.dimensions;
      vector[position] += 0.1;
    }

    // Normalize to unit length
    return this.normalize(vector);
  }

  /**
   * Generate character n-grams
   */
  private charNgrams(text: string, n: number): string[] {
    const clean = text.toLowerCase().replace(/\s+/g, '_');
    const ngrams: string[] = [];
    for (let i = 0; i <= clean.length - n; i++) {
      ngrams.push(clean.slice(i, i + n));
    }
    return ngrams;
  }

  /**
   * Hash a term to a number
   */
  private hashTerm(term: string): number {
    let hash = 0;
    for (let i = 0; i < term.length; i++) {
      const char = term.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Normalize vector to unit length
   */
  private normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude === 0) return vector;
    return vector.map(v => v / magnitude);
  }

  /**
   * Batch embed multiple texts
   */
  embedBatch(texts: string[]): number[][] {
    return texts.map(t => this.embed(t));
  }
}

// ============================================================================
// OpenAI Embeddings
// ============================================================================

class OpenAIEmbedder {
  private apiKey: string;
  private model: string;
  private dimensions: number;

  constructor(apiKey: string, model: string, dimensions: number) {
    this.apiKey = apiKey;
    this.model = model;
    this.dimensions = dimensions;
  }

  /**
   * Generate embedding using OpenAI API
   */
  async embed(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data[0].embedding;
  }

  /**
   * Batch embed multiple texts
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    // Sort by index to maintain order
    return data.data
      .sort((a, b) => a.index - b.index)
      .map(d => d.embedding);
  }
}

// ============================================================================
// Embedding Service
// ============================================================================

export class EmbeddingService {
  private config: Required<EmbeddingConfig>;
  private cache: EmbeddingCache;
  private localEmbedder: LocalEmbedder;
  private openaiEmbedder: OpenAIEmbedder | null = null;

  constructor(config: EmbeddingConfig = {}) {
    // Determine provider
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
    const provider = config.provider || (apiKey ? 'openai' : 'local');

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      provider,
      apiKey,
    };

    this.cache = new EmbeddingCache(this.config.cacheSize);
    this.localEmbedder = new LocalEmbedder(this.config.dimensions);

    if (this.config.provider === 'openai' && this.config.apiKey) {
      this.openaiEmbedder = new OpenAIEmbedder(
        this.config.apiKey,
        this.config.model,
        this.config.dimensions
      );
    }
  }

  /**
   * Generate embedding for text
   */
  async embed(text: string): Promise<EmbeddingResult> {
    // Check cache
    const cached = this.cache.get(text);
    if (cached) {
      return {
        vector: cached,
        provider: this.config.provider,
        model: this.config.provider === 'openai' ? this.config.model : 'tfidf-local',
        dimensions: cached.length,
        cached: true,
      };
    }

    // Generate embedding
    let vector: number[];

    if (this.config.provider === 'openai' && this.openaiEmbedder) {
      try {
        vector = await this.openaiEmbedder.embed(text);
      } catch (error) {
        // Fallback to local on API error
        console.warn('OpenAI embedding failed, using local:', error);
        vector = this.localEmbedder.embed(text);
      }
    } else {
      vector = this.localEmbedder.embed(text);
    }

    // Cache result
    this.cache.set(text, vector);

    return {
      vector,
      provider: this.config.provider,
      model: this.config.provider === 'openai' ? this.config.model : 'tfidf-local',
      dimensions: vector.length,
      cached: false,
    };
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    const uncached: { text: string; index: number }[] = [];

    // Check cache first
    for (let i = 0; i < texts.length; i++) {
      const cached = this.cache.get(texts[i]);
      if (cached) {
        results[i] = {
          vector: cached,
          provider: this.config.provider,
          model: this.config.provider === 'openai' ? this.config.model : 'tfidf-local',
          dimensions: cached.length,
          cached: true,
        };
      } else {
        uncached.push({ text: texts[i], index: i });
      }
    }

    // Generate uncached embeddings
    if (uncached.length > 0) {
      let vectors: number[][];

      if (this.config.provider === 'openai' && this.openaiEmbedder) {
        try {
          vectors = await this.openaiEmbedder.embedBatch(uncached.map(u => u.text));
        } catch (error) {
          console.warn('OpenAI batch embedding failed, using local:', error);
          vectors = this.localEmbedder.embedBatch(uncached.map(u => u.text));
        }
      } else {
        vectors = this.localEmbedder.embedBatch(uncached.map(u => u.text));
      }

      // Store results and cache
      for (let i = 0; i < uncached.length; i++) {
        const { text, index } = uncached[i];
        const vector = vectors[i];

        this.cache.set(text, vector);

        results[index] = {
          vector,
          provider: this.config.provider,
          model: this.config.provider === 'openai' ? this.config.model : 'tfidf-local',
          dimensions: vector.length,
          cached: false,
        };
      }
    }

    return results;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  similarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Get current provider
   */
  getProvider(): EmbeddingProvider {
    return this.config.provider;
  }

  /**
   * Get embedding dimensions
   */
  getDimensions(): number {
    return this.config.dimensions;
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.cacheSize,
    };
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// ============================================================================
// Singleton
// ============================================================================

let embeddingServiceInstance: EmbeddingService | null = null;

export function getEmbeddingService(config?: EmbeddingConfig): EmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new EmbeddingService(config);
  }
  return embeddingServiceInstance;
}

export function resetEmbeddingService(): void {
  embeddingServiceInstance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick embedding generation
 */
export async function embed(text: string): Promise<number[]> {
  const service = getEmbeddingService();
  const result = await service.embed(text);
  return result.vector;
}

/**
 * Quick batch embedding
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const service = getEmbeddingService();
  const results = await service.embedBatch(texts);
  return results.map(r => r.vector);
}

/**
 * Quick similarity calculation
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  return getEmbeddingService().similarity(a, b);
}
