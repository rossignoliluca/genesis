/**
 * Genesis 7.6 - Vector Store Module
 *
 * Local vector database for semantic search.
 * Uses in-memory storage with optional file persistence.
 *
 * Features:
 * - In-memory vector storage (fast, no dependencies)
 * - File-based persistence (JSON)
 * - Cosine similarity search
 * - Metadata filtering
 * - Namespace support for multi-tenant storage
 *
 * Note: For production scale, consider using Vectra:
 * npm install vectra
 * And update this module to use LocalIndex
 */

import * as fs from 'fs';
import * as path from 'path';
import { getEmbeddingService, EmbeddingService } from './embeddings.js';

// ============================================================================
// Types
// ============================================================================

export interface VectorDocument {
  /** Unique document ID */
  id: string;
  /** Document text content */
  text: string;
  /** Vector embedding */
  vector: number[];
  /** Custom metadata */
  metadata: Record<string, unknown>;
  /** Creation timestamp */
  createdAt: Date;
  /** Last updated timestamp */
  updatedAt: Date;
  /** Optional namespace/collection */
  namespace?: string;
}

export interface VectorSearchResult {
  /** The matching document */
  document: VectorDocument;
  /** Cosine similarity score (0-1) */
  score: number;
  /** Rank in results */
  rank: number;
}

export interface VectorStoreConfig {
  /** Path to persist index (optional) */
  persistPath?: string;
  /** Auto-save after each modification */
  autoSave?: boolean;
  /** Embedding service instance */
  embeddings?: EmbeddingService;
  /** Default namespace */
  defaultNamespace?: string;
}

export interface VectorQuery {
  /** Query text (will be embedded) */
  text?: string;
  /** Query vector (if already embedded) */
  vector?: number[];
  /** Maximum results to return */
  limit?: number;
  /** Minimum similarity threshold (0-1) */
  threshold?: number;
  /** Filter by namespace */
  namespace?: string;
  /** Filter by metadata */
  filter?: Record<string, unknown>;
}

// ============================================================================
// Vector Store Implementation
// ============================================================================

export class VectorStore {
  private documents: Map<string, VectorDocument> = new Map();
  private config: VectorStoreConfig;
  private embeddings: EmbeddingService;
  private dirty: boolean = false;

  constructor(config: VectorStoreConfig = {}) {
    this.config = {
      autoSave: true,
      defaultNamespace: 'default',
      ...config,
    };
    this.embeddings = config.embeddings || getEmbeddingService();

    // Load persisted data if path specified
    if (this.config.persistPath) {
      this.load();
    }
  }

  // ============================================================================
  // Core Operations
  // ============================================================================

  /**
   * Add a document to the store
   */
  async add(
    id: string,
    text: string,
    metadata: Record<string, unknown> = {},
    namespace?: string
  ): Promise<VectorDocument> {
    // Generate embedding
    const result = await this.embeddings.embed(text);

    const doc: VectorDocument = {
      id,
      text,
      vector: result.vector,
      metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
      namespace: namespace || this.config.defaultNamespace,
    };

    this.documents.set(id, doc);
    this.dirty = true;

    if (this.config.autoSave && this.config.persistPath) {
      await this.save();
    }

    return doc;
  }

  /**
   * Add multiple documents in batch
   */
  async addBatch(
    items: Array<{
      id: string;
      text: string;
      metadata?: Record<string, unknown>;
      namespace?: string;
    }>
  ): Promise<VectorDocument[]> {
    // Batch embed all texts
    const texts = items.map(i => i.text);
    const embedResults = await this.embeddings.embedBatch(texts);

    const docs: VectorDocument[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const doc: VectorDocument = {
        id: item.id,
        text: item.text,
        vector: embedResults[i].vector,
        metadata: item.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
        namespace: item.namespace || this.config.defaultNamespace,
      };

      this.documents.set(item.id, doc);
      docs.push(doc);
    }

    this.dirty = true;

    if (this.config.autoSave && this.config.persistPath) {
      await this.save();
    }

    return docs;
  }

  /**
   * Update a document
   */
  async update(
    id: string,
    text?: string,
    metadata?: Record<string, unknown>
  ): Promise<VectorDocument | null> {
    const existing = this.documents.get(id);
    if (!existing) return null;

    // Re-embed if text changed
    let vector = existing.vector;
    if (text && text !== existing.text) {
      const result = await this.embeddings.embed(text);
      vector = result.vector;
    }

    const updated: VectorDocument = {
      ...existing,
      text: text || existing.text,
      vector,
      metadata: metadata ? { ...existing.metadata, ...metadata } : existing.metadata,
      updatedAt: new Date(),
    };

    this.documents.set(id, updated);
    this.dirty = true;

    if (this.config.autoSave && this.config.persistPath) {
      await this.save();
    }

    return updated;
  }

  /**
   * Delete a document
   */
  delete(id: string): boolean {
    const existed = this.documents.delete(id);
    if (existed) {
      this.dirty = true;
      if (this.config.autoSave && this.config.persistPath) {
        this.save().catch(() => {});
      }
    }
    return existed;
  }

  /**
   * Get a document by ID
   */
  get(id: string): VectorDocument | undefined {
    return this.documents.get(id);
  }

  /**
   * Check if document exists
   */
  has(id: string): boolean {
    return this.documents.has(id);
  }

  // ============================================================================
  // Search Operations
  // ============================================================================

  /**
   * Search for similar documents
   */
  async search(query: VectorQuery): Promise<VectorSearchResult[]> {
    const {
      text,
      vector,
      limit = 10,
      threshold = 0,
      namespace,
      filter,
    } = query;

    // Get query vector
    let queryVector: number[];
    if (vector) {
      queryVector = vector;
    } else if (text) {
      const result = await this.embeddings.embed(text);
      queryVector = result.vector;
    } else {
      throw new Error('Query must have text or vector');
    }

    // Score all documents
    const scored: Array<{ doc: VectorDocument; score: number }> = [];

    for (const doc of this.documents.values()) {
      // Filter by namespace
      if (namespace && doc.namespace !== namespace) continue;

      // Filter by metadata
      if (filter && !this.matchesFilter(doc.metadata, filter)) continue;

      // Calculate similarity
      const score = this.cosineSimilarity(queryVector, doc.vector);

      // Apply threshold
      if (score >= threshold) {
        scored.push({ doc, score });
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Return top results
    return scored.slice(0, limit).map((item, index) => ({
      document: item.doc,
      score: item.score,
      rank: index + 1,
    }));
  }

  /**
   * Find similar to an existing document
   */
  async findSimilar(
    id: string,
    limit: number = 10,
    threshold: number = 0
  ): Promise<VectorSearchResult[]> {
    const doc = this.documents.get(id);
    if (!doc) return [];

    const results = await this.search({
      vector: doc.vector,
      limit: limit + 1, // +1 to exclude self
      threshold,
      namespace: doc.namespace,
    });

    // Remove self from results
    return results.filter(r => r.document.id !== id).slice(0, limit);
  }

  /**
   * Semantic search with text query
   */
  async semanticSearch(
    query: string,
    options: {
      limit?: number;
      threshold?: number;
      namespace?: string;
      filter?: Record<string, unknown>;
    } = {}
  ): Promise<VectorSearchResult[]> {
    return this.search({
      text: query,
      ...options,
    });
  }

  // ============================================================================
  // Metadata Filtering
  // ============================================================================

  /**
   * Check if metadata matches filter criteria
   */
  private matchesFilter(
    metadata: Record<string, unknown>,
    filter: Record<string, unknown>
  ): boolean {
    for (const [key, value] of Object.entries(filter)) {
      const metaValue = metadata[key];

      if (typeof value === 'object' && value !== null) {
        // Handle operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin
        const ops = value as Record<string, unknown>;

        if ('$eq' in ops && metaValue !== ops.$eq) return false;
        if ('$ne' in ops && metaValue === ops.$ne) return false;
        if ('$gt' in ops && (typeof metaValue !== 'number' || metaValue <= (ops.$gt as number))) return false;
        if ('$gte' in ops && (typeof metaValue !== 'number' || metaValue < (ops.$gte as number))) return false;
        if ('$lt' in ops && (typeof metaValue !== 'number' || metaValue >= (ops.$lt as number))) return false;
        if ('$lte' in ops && (typeof metaValue !== 'number' || metaValue > (ops.$lte as number))) return false;
        if ('$in' in ops && !Array.isArray(ops.$in)) return false;
        if ('$in' in ops && Array.isArray(ops.$in) && !ops.$in.includes(metaValue)) return false;
        if ('$nin' in ops && Array.isArray(ops.$nin) && ops.$nin.includes(metaValue)) return false;
      } else {
        // Direct equality
        if (metaValue !== value) return false;
      }
    }

    return true;
  }

  // ============================================================================
  // Math Operations
  // ============================================================================

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

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

  // ============================================================================
  // Persistence
  // ============================================================================

  /**
   * Save index to file
   */
  async save(): Promise<void> {
    if (!this.config.persistPath) return;

    const data = {
      version: '1.0',
      documents: Array.from(this.documents.entries()).map(([id, doc]) => ({
        ...doc,
        id,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      })),
      savedAt: new Date().toISOString(),
    };

    // Ensure directory exists
    const dir = path.dirname(this.config.persistPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.config.persistPath, JSON.stringify(data, null, 2));
    this.dirty = false;
  }

  /**
   * Load index from file
   */
  load(): void {
    if (!this.config.persistPath || !fs.existsSync(this.config.persistPath)) {
      return;
    }

    try {
      const content = fs.readFileSync(this.config.persistPath, 'utf-8');
      const data = JSON.parse(content) as {
        documents: Array<{
          id: string;
          text: string;
          vector: number[];
          metadata: Record<string, unknown>;
          createdAt: string;
          updatedAt: string;
          namespace?: string;
        }>;
      };

      this.documents.clear();

      for (const doc of data.documents) {
        this.documents.set(doc.id, {
          id: doc.id,
          text: doc.text,
          vector: doc.vector,
          metadata: doc.metadata,
          createdAt: new Date(doc.createdAt),
          updatedAt: new Date(doc.updatedAt),
          namespace: doc.namespace,
        });
      }

      this.dirty = false;
    } catch (error) {
      console.error('Failed to load vector store:', error);
    }
  }

  // ============================================================================
  // Utility
  // ============================================================================

  /**
   * Get all documents
   */
  getAll(): VectorDocument[] {
    return Array.from(this.documents.values());
  }

  /**
   * Get documents by namespace
   */
  getByNamespace(namespace: string): VectorDocument[] {
    return this.getAll().filter(d => d.namespace === namespace);
  }

  /**
   * Get store statistics
   */
  getStats(): {
    totalDocuments: number;
    namespaces: string[];
    dimensions: number;
    persistPath?: string;
    dirty: boolean;
  } {
    const namespaces = new Set<string>();
    let dimensions = 0;

    for (const doc of this.documents.values()) {
      if (doc.namespace) namespaces.add(doc.namespace);
      if (doc.vector.length > dimensions) dimensions = doc.vector.length;
    }

    return {
      totalDocuments: this.documents.size,
      namespaces: Array.from(namespaces),
      dimensions,
      persistPath: this.config.persistPath,
      dirty: this.dirty,
    };
  }

  /**
   * Clear all documents
   */
  clear(): void {
    this.documents.clear();
    this.dirty = true;

    if (this.config.autoSave && this.config.persistPath) {
      this.save().catch(() => {});
    }
  }

  /**
   * Clear namespace
   */
  clearNamespace(namespace: string): number {
    let count = 0;
    for (const [id, doc] of this.documents) {
      if (doc.namespace === namespace) {
        this.documents.delete(id);
        count++;
      }
    }

    if (count > 0) {
      this.dirty = true;
      if (this.config.autoSave && this.config.persistPath) {
        this.save().catch(() => {});
      }
    }

    return count;
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let vectorStoreInstance: VectorStore | null = null;

export function getVectorStore(config?: VectorStoreConfig): VectorStore {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new VectorStore({
      persistPath: './.genesis/vectors.json',
      ...config,
    });
  }
  return vectorStoreInstance;
}

export function createVectorStore(config?: VectorStoreConfig): VectorStore {
  return new VectorStore(config);
}

export function resetVectorStore(): void {
  vectorStoreInstance = null;
}
