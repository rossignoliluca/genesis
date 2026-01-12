/**
 * Genesis 7.6 - RAG (Retrieval Augmented Generation) Module
 *
 * Complete RAG pipeline for semantic document retrieval:
 * - Document ingestion with smart chunking
 * - Vector embedding and storage
 * - Semantic similarity search
 * - Context augmentation for LLM prompts
 *
 * Features:
 * - Multiple chunking strategies (fixed, sentence, paragraph, semantic)
 * - Overlap for context continuity
 * - Source tracking for citations
 * - Reranking for improved relevance
 * - Memory integration (episodic, semantic, procedural)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { VectorStore, getVectorStore, VectorSearchResult } from './vector-store.js';
import { EmbeddingService, getEmbeddingService } from './embeddings.js';

// ============================================================================
// Types
// ============================================================================

export type ChunkingStrategy = 'fixed' | 'sentence' | 'paragraph' | 'semantic';

export interface RAGConfig {
  /** Vector store instance */
  vectorStore?: VectorStore;
  /** Embedding service instance */
  embeddings?: EmbeddingService;
  /** Default chunking strategy */
  chunkingStrategy?: ChunkingStrategy;
  /** Chunk size in characters (for fixed strategy) */
  chunkSize?: number;
  /** Overlap between chunks */
  chunkOverlap?: number;
  /** Maximum tokens per chunk */
  maxTokensPerChunk?: number;
  /** Namespace for RAG documents */
  namespace?: string;
  /** Number of results to retrieve */
  topK?: number;
  /** Minimum similarity threshold */
  minSimilarity?: number;
  /** Enable reranking */
  rerank?: boolean;
}

export interface Document {
  /** Unique document ID */
  id: string;
  /** Document content */
  content: string;
  /** Document metadata */
  metadata: DocumentMetadata;
}

export interface DocumentMetadata {
  /** Source file path or URL */
  source?: string;
  /** Document title */
  title?: string;
  /** Document type (code, text, markdown, etc.) */
  type?: string;
  /** Language (for code) */
  language?: string;
  /** Creation date */
  createdAt?: Date;
  /** Custom metadata */
  [key: string]: unknown;
}

export interface Chunk {
  /** Chunk ID */
  id: string;
  /** Parent document ID */
  documentId: string;
  /** Chunk content */
  content: string;
  /** Chunk index in document */
  index: number;
  /** Start position in original document */
  start: number;
  /** End position in original document */
  end: number;
  /** Chunk metadata */
  metadata: DocumentMetadata & {
    chunkIndex: number;
    totalChunks: number;
  };
}

export interface RetrievalResult {
  /** Retrieved chunks */
  chunks: Array<{
    chunk: Chunk;
    score: number;
    rank: number;
  }>;
  /** Query used */
  query: string;
  /** Total documents searched */
  totalDocuments: number;
  /** Retrieval latency in ms */
  latency: number;
}

export interface AugmentedContext {
  /** Formatted context for LLM */
  context: string;
  /** Source documents used */
  sources: Array<{
    id: string;
    title?: string;
    source?: string;
    relevance: number;
  }>;
  /** Token estimate */
  tokenEstimate: number;
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CONFIG: Required<RAGConfig> = {
  vectorStore: null as unknown as VectorStore, // Will be initialized
  embeddings: null as unknown as EmbeddingService, // Will be initialized
  chunkingStrategy: 'paragraph',
  chunkSize: 1000,
  chunkOverlap: 200,
  maxTokensPerChunk: 500,
  namespace: 'rag',
  topK: 5,
  minSimilarity: 0.3,
  rerank: true,
};

// ============================================================================
// Document Chunker
// ============================================================================

class DocumentChunker {
  private config: Required<RAGConfig>;

  constructor(config: Required<RAGConfig>) {
    this.config = config;
  }

  /**
   * Chunk a document using configured strategy
   */
  chunk(document: Document): Chunk[] {
    switch (this.config.chunkingStrategy) {
      case 'fixed':
        return this.chunkFixed(document);
      case 'sentence':
        return this.chunkBySentence(document);
      case 'paragraph':
        return this.chunkByParagraph(document);
      case 'semantic':
        return this.chunkSemantic(document);
      default:
        return this.chunkByParagraph(document);
    }
  }

  /**
   * Fixed-size chunking with overlap
   */
  private chunkFixed(document: Document): Chunk[] {
    const chunks: Chunk[] = [];
    const { content } = document;
    const { chunkSize, chunkOverlap } = this.config;

    let start = 0;
    let index = 0;

    while (start < content.length) {
      const end = Math.min(start + chunkSize, content.length);
      const chunkContent = content.slice(start, end);

      chunks.push(this.createChunk(document, chunkContent, index, start, end, chunks.length));

      // Move start with overlap
      start = end - chunkOverlap;
      if (start >= content.length - chunkOverlap) break;
      index++;
    }

    // Update totalChunks in metadata
    return this.finalizChunks(chunks);
  }

  /**
   * Sentence-based chunking
   */
  private chunkBySentence(document: Document): Chunk[] {
    const chunks: Chunk[] = [];
    const { content } = document;
    const { chunkSize } = this.config;

    // Split into sentences
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];

    let currentChunk = '';
    let currentStart = 0;
    let index = 0;

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
        // Save current chunk
        const end = currentStart + currentChunk.length;
        chunks.push(this.createChunk(document, currentChunk.trim(), index, currentStart, end, 0));

        // Start new chunk with overlap (last sentence)
        currentStart = end - sentence.length;
        currentChunk = sentence;
        index++;
      } else {
        currentChunk += sentence;
      }
    }

    // Add remaining content
    if (currentChunk.trim()) {
      const end = currentStart + currentChunk.length;
      chunks.push(this.createChunk(document, currentChunk.trim(), index, currentStart, end, 0));
    }

    return this.finalizChunks(chunks);
  }

  /**
   * Paragraph-based chunking (best for most documents)
   */
  private chunkByParagraph(document: Document): Chunk[] {
    const chunks: Chunk[] = [];
    const { content } = document;
    const { chunkSize } = this.config;

    // Split by double newlines (paragraphs)
    const paragraphs = content.split(/\n\n+/);

    let currentChunk = '';
    let currentStart = 0;
    let index = 0;
    let position = 0;

    for (const paragraph of paragraphs) {
      const paragraphWithBreak = paragraph + '\n\n';

      if (currentChunk.length + paragraphWithBreak.length > chunkSize && currentChunk.length > 0) {
        // Save current chunk
        const end = currentStart + currentChunk.length;
        chunks.push(this.createChunk(document, currentChunk.trim(), index, currentStart, end, 0));

        // Start new chunk
        currentStart = position;
        currentChunk = paragraphWithBreak;
        index++;
      } else {
        if (currentChunk.length === 0) {
          currentStart = position;
        }
        currentChunk += paragraphWithBreak;
      }

      position += paragraphWithBreak.length;
    }

    // Add remaining content
    if (currentChunk.trim()) {
      const end = currentStart + currentChunk.length;
      chunks.push(this.createChunk(document, currentChunk.trim(), index, currentStart, end, 0));
    }

    return this.finalizChunks(chunks);
  }

  /**
   * Semantic chunking (uses natural boundaries)
   */
  private chunkSemantic(document: Document): Chunk[] {
    const chunks: Chunk[] = [];
    const { content, metadata } = document;

    // Different strategies based on document type
    if (metadata.type === 'code' || metadata.language) {
      return this.chunkCode(document);
    }

    if (metadata.type === 'markdown') {
      return this.chunkMarkdown(document);
    }

    // Default to paragraph chunking for text
    return this.chunkByParagraph(document);
  }

  /**
   * Code-aware chunking (by functions, classes)
   */
  private chunkCode(document: Document): Chunk[] {
    const chunks: Chunk[] = [];
    const { content } = document;

    // Simple heuristic: split by function/class definitions
    // Matches: function, class, const/let/var =, export
    const pattern = /^(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+\w+/gm;
    const matches = [...content.matchAll(pattern)];

    if (matches.length === 0) {
      // No functions found, use fixed chunking
      return this.chunkFixed(document);
    }

    let index = 0;
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index!;
      const end = matches[i + 1]?.index ?? content.length;
      const chunkContent = content.slice(start, end).trim();

      if (chunkContent.length > 0) {
        chunks.push(this.createChunk(document, chunkContent, index, start, end, 0));
        index++;
      }
    }

    return this.finalizChunks(chunks);
  }

  /**
   * Markdown-aware chunking (by headers)
   */
  private chunkMarkdown(document: Document): Chunk[] {
    const chunks: Chunk[] = [];
    const { content } = document;

    // Split by headers (##, ###, etc.)
    const sections = content.split(/(?=^#{1,4}\s)/gm);

    let index = 0;
    let position = 0;

    for (const section of sections) {
      if (section.trim()) {
        const start = position;
        const end = position + section.length;
        chunks.push(this.createChunk(document, section.trim(), index, start, end, 0));
        index++;
      }
      position += section.length;
    }

    return this.finalizChunks(chunks);
  }

  /**
   * Create a chunk object
   */
  private createChunk(
    document: Document,
    content: string,
    index: number,
    start: number,
    end: number,
    totalChunks: number
  ): Chunk {
    return {
      id: `${document.id}-chunk-${index}`,
      documentId: document.id,
      content,
      index,
      start,
      end,
      metadata: {
        ...document.metadata,
        chunkIndex: index,
        totalChunks,
      },
    };
  }

  /**
   * Finalize chunks with correct totalChunks
   */
  private finalizChunks(chunks: Chunk[]): Chunk[] {
    const total = chunks.length;
    return chunks.map(chunk => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        totalChunks: total,
      },
    }));
  }
}

// ============================================================================
// RAG Pipeline
// ============================================================================

export class RAGPipeline {
  private config: Required<RAGConfig>;
  private vectorStore: VectorStore;
  private embeddings: EmbeddingService;
  private chunker: DocumentChunker;
  private documentIndex: Map<string, Document> = new Map();

  constructor(config: RAGConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    // Initialize services
    this.vectorStore = this.config.vectorStore || getVectorStore();
    this.embeddings = this.config.embeddings || getEmbeddingService();
    this.chunker = new DocumentChunker(this.config);
  }

  // ============================================================================
  // Document Ingestion
  // ============================================================================

  /**
   * Ingest a document into the RAG system
   */
  async ingest(document: Document): Promise<{
    documentId: string;
    chunks: number;
    tokens: number;
  }> {
    // Store document metadata
    this.documentIndex.set(document.id, document);

    // Chunk the document
    const chunks = this.chunker.chunk(document);

    // Add chunks to vector store
    const items = chunks.map(chunk => ({
      id: chunk.id,
      text: chunk.content,
      metadata: {
        ...chunk.metadata,
        documentId: chunk.documentId,
        start: chunk.start,
        end: chunk.end,
      },
      namespace: this.config.namespace,
    }));

    await this.vectorStore.addBatch(items);

    // Estimate tokens
    const totalChars = chunks.reduce((sum, c) => sum + c.content.length, 0);
    const tokenEstimate = Math.ceil(totalChars / 4);

    return {
      documentId: document.id,
      chunks: chunks.length,
      tokens: tokenEstimate,
    };
  }

  /**
   * Ingest a file
   */
  async ingestFile(filePath: string, metadata: Partial<DocumentMetadata> = {}): Promise<{
    documentId: string;
    chunks: number;
    tokens: number;
  }> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath).slice(1);

    const document: Document = {
      id: this.generateId(filePath),
      content,
      metadata: {
        source: filePath,
        title: path.basename(filePath),
        type: this.getDocumentType(ext),
        language: this.getLanguage(ext),
        createdAt: new Date(),
        ...metadata,
      },
    };

    return this.ingest(document);
  }

  /**
   * Ingest multiple files from a directory
   */
  async ingestDirectory(
    dirPath: string,
    options: {
      extensions?: string[];
      recursive?: boolean;
      ignore?: string[];
    } = {}
  ): Promise<{
    documents: number;
    chunks: number;
    tokens: number;
    errors: string[];
  }> {
    const {
      extensions = ['txt', 'md', 'ts', 'js', 'py', 'json'],
      recursive = true,
      ignore = ['node_modules', '.git', 'dist', 'build'],
    } = options;

    const results = {
      documents: 0,
      chunks: 0,
      tokens: 0,
      errors: [] as string[],
    };

    const processDir = async (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (recursive && !ignore.includes(entry.name)) {
            await processDir(fullPath);
          }
        } else {
          const ext = path.extname(entry.name).slice(1);
          if (extensions.includes(ext)) {
            try {
              const result = await this.ingestFile(fullPath);
              results.documents++;
              results.chunks += result.chunks;
              results.tokens += result.tokens;
            } catch (error) {
              results.errors.push(`${fullPath}: ${error}`);
            }
          }
        }
      }
    };

    await processDir(dirPath);
    return results;
  }

  // ============================================================================
  // Retrieval
  // ============================================================================

  /**
   * Retrieve relevant chunks for a query
   */
  async retrieve(query: string): Promise<RetrievalResult> {
    const startTime = Date.now();

    // Search vector store
    const searchResults = await this.vectorStore.search({
      text: query,
      limit: this.config.topK * 2, // Get extra for reranking
      threshold: this.config.minSimilarity,
      namespace: this.config.namespace,
    });

    // Convert to chunks
    let chunks = searchResults.map((result, index) => {
      const storedMeta = result.document.metadata as {
        documentId: string;
        start: number;
        end: number;
        chunkIndex: number;
        totalChunks: number;
      } & DocumentMetadata;

      // Extract only the Chunk-compatible metadata fields
      const chunkMetadata: Chunk['metadata'] = {
        chunkIndex: storedMeta.chunkIndex,
        totalChunks: storedMeta.totalChunks,
      };

      return {
        chunk: {
          id: result.document.id,
          documentId: storedMeta.documentId,
          content: result.document.text,
          index: storedMeta.chunkIndex,
          start: storedMeta.start,
          end: storedMeta.end,
          metadata: chunkMetadata,
        } as Chunk,
        score: result.score,
        rank: index + 1,
      };
    });

    // Optional reranking
    if (this.config.rerank && chunks.length > 0) {
      chunks = this.rerank(query, chunks);
    }

    // Limit to topK
    chunks = chunks.slice(0, this.config.topK);

    // Update ranks after potential reranking
    chunks = chunks.map((c, i) => ({ ...c, rank: i + 1 }));

    return {
      chunks,
      query,
      totalDocuments: this.documentIndex.size,
      latency: Date.now() - startTime,
    };
  }

  /**
   * Rerank results for better relevance
   */
  private rerank(
    query: string,
    chunks: Array<{ chunk: Chunk; score: number; rank: number }>
  ): Array<{ chunk: Chunk; score: number; rank: number }> {
    // Simple reranking based on:
    // 1. Original similarity score
    // 2. Query term overlap
    // 3. Chunk length (prefer medium-sized chunks)

    const queryTerms = new Set(query.toLowerCase().split(/\s+/));

    return chunks
      .map(item => {
        const contentTerms = item.chunk.content.toLowerCase().split(/\s+/);
        const overlap = contentTerms.filter(t => queryTerms.has(t)).length;
        const overlapScore = overlap / queryTerms.size;

        // Prefer chunks of medium length (not too short, not too long)
        const idealLength = 500;
        const lengthScore = 1 - Math.abs(item.chunk.content.length - idealLength) / idealLength;

        // Combined score
        const rerankScore = item.score * 0.6 + overlapScore * 0.3 + Math.max(0, lengthScore) * 0.1;

        return { ...item, score: rerankScore };
      })
      .sort((a, b) => b.score - a.score);
  }

  // ============================================================================
  // Context Augmentation
  // ============================================================================

  /**
   * Generate augmented context for LLM
   */
  async augment(
    query: string,
    options: {
      maxTokens?: number;
      includeSource?: boolean;
      format?: 'plain' | 'numbered' | 'markdown';
    } = {}
  ): Promise<AugmentedContext> {
    const {
      maxTokens = 2000,
      includeSource = true,
      format = 'numbered',
    } = options;

    // Retrieve relevant chunks
    const results = await this.retrieve(query);

    // Build context string
    const sources: AugmentedContext['sources'] = [];
    let context = '';
    let tokenEstimate = 0;

    for (const { chunk, score } of results.chunks) {
      const chunkTokens = Math.ceil(chunk.content.length / 4);

      if (tokenEstimate + chunkTokens > maxTokens) break;

      // Format chunk
      let formatted = '';
      switch (format) {
        case 'numbered':
          formatted = `[${sources.length + 1}] ${chunk.content}\n\n`;
          break;
        case 'markdown':
          const title = chunk.metadata.title || chunk.metadata.source || 'Source';
          formatted = `### ${title}\n${chunk.content}\n\n`;
          break;
        default:
          formatted = `${chunk.content}\n\n`;
      }

      context += formatted;
      tokenEstimate += chunkTokens;

      sources.push({
        id: chunk.documentId,
        title: chunk.metadata.title as string | undefined,
        source: chunk.metadata.source as string | undefined,
        relevance: score,
      });
    }

    // Add source references if requested
    if (includeSource && sources.length > 0 && format !== 'markdown') {
      context += '\nSources:\n';
      sources.forEach((s, i) => {
        context += `[${i + 1}] ${s.title || s.source || s.id}\n`;
      });
    }

    return {
      context: context.trim(),
      sources,
      tokenEstimate,
    };
  }

  /**
   * Create a prompt with RAG context
   */
  async createPrompt(
    query: string,
    systemPrompt?: string,
    maxContextTokens: number = 2000
  ): Promise<string> {
    const augmented = await this.augment(query, {
      maxTokens: maxContextTokens,
      includeSource: true,
      format: 'numbered',
    });

    const contextSection = augmented.context
      ? `\n\nRelevant Context:\n${augmented.context}\n\n`
      : '';

    const system = systemPrompt || 'You are a helpful assistant. Use the provided context to answer questions accurately.';

    return `${system}${contextSection}Question: ${query}`;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Generate document ID from path/content
   */
  private generateId(input: string): string {
    return crypto.createHash('md5').update(input).digest('hex').slice(0, 16);
  }

  /**
   * Determine document type from extension
   */
  private getDocumentType(ext: string): string {
    const codeExtensions = ['ts', 'js', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h'];
    if (codeExtensions.includes(ext)) return 'code';
    if (ext === 'md') return 'markdown';
    if (ext === 'json') return 'json';
    return 'text';
  }

  /**
   * Get language from extension
   */
  private getLanguage(ext: string): string | undefined {
    const languages: Record<string, string> = {
      ts: 'typescript',
      js: 'javascript',
      tsx: 'typescript',
      jsx: 'javascript',
      py: 'python',
      go: 'go',
      rs: 'rust',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
    };
    return languages[ext];
  }

  /**
   * Get statistics
   */
  getStats(): {
    documents: number;
    vectorStoreStats: ReturnType<VectorStore['getStats']>;
    embeddingStats: ReturnType<EmbeddingService['getCacheStats']>;
    config: Partial<RAGConfig>;
  } {
    return {
      documents: this.documentIndex.size,
      vectorStoreStats: this.vectorStore.getStats(),
      embeddingStats: this.embeddings.getCacheStats(),
      config: {
        chunkingStrategy: this.config.chunkingStrategy,
        chunkSize: this.config.chunkSize,
        topK: this.config.topK,
        minSimilarity: this.config.minSimilarity,
      },
    };
  }

  /**
   * Clear all RAG data
   */
  clear(): void {
    this.documentIndex.clear();
    this.vectorStore.clearNamespace(this.config.namespace);
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let ragPipelineInstance: RAGPipeline | null = null;

export function getRAGPipeline(config?: RAGConfig): RAGPipeline {
  if (!ragPipelineInstance) {
    ragPipelineInstance = new RAGPipeline(config);
  }
  return ragPipelineInstance;
}

export function createRAGPipeline(config?: RAGConfig): RAGPipeline {
  return new RAGPipeline(config);
}

export function resetRAGPipeline(): void {
  ragPipelineInstance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick semantic search
 */
export async function ragSearch(query: string, topK: number = 5): Promise<RetrievalResult> {
  const rag = getRAGPipeline();
  return rag.retrieve(query);
}

/**
 * Quick context augmentation
 */
export async function ragAugment(query: string, maxTokens: number = 2000): Promise<AugmentedContext> {
  const rag = getRAGPipeline();
  return rag.augment(query, { maxTokens });
}

/**
 * Ingest a file for RAG
 */
export async function ragIngestFile(filePath: string): Promise<{ chunks: number; tokens: number }> {
  const rag = getRAGPipeline();
  const result = await rag.ingestFile(filePath);
  return { chunks: result.chunks, tokens: result.tokens };
}
