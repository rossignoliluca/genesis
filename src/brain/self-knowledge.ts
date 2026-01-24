/**
 * Genesis v13.1 - Self-Knowledge Module
 *
 * Gives the Brain awareness of its own source code.
 * Uses CodeRAG for keyword-based retrieval (no API keys needed).
 *
 * Architecture:
 *   boot() → index src/ → cache to .genesis/code-index.json
 *   query(text) → keyword search → relevant CodeChunks
 *   getContext(query) → formatted string for Brain context injection
 *
 * The Brain's stepMemory() calls this when the query relates to
 * Genesis's own architecture, code, or capabilities.
 */

import { getCodeRAG, CodeRAG, CodeChunk, QueryResult } from '../self-modification/code-rag.js';
import { getSelfModelGenerator, SelfModelGenerator, SelfModel } from '../self-modification/self-model.js';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// Types
// ============================================================================

export interface SelfKnowledgeConfig {
  rootPath: string;          // Genesis source root
  maxContextChunks: number;  // Max chunks to inject into context
  maxContextChars: number;   // Max chars for context string
  autoIndex: boolean;        // Index on boot
  cacheDir: string;          // Cache directory
}

export interface CodeContext {
  chunks: QueryResult[];
  summary: string;
  formatted: string;
  selfModel?: SelfModel;
}

// __dirname at runtime: <project>/dist/src/brain
// We need: <project>/ (where src/ lives)
const PROJECT_ROOT = path.resolve(__dirname, '../../../');

const DEFAULT_CONFIG: SelfKnowledgeConfig = {
  rootPath: PROJECT_ROOT,
  maxContextChunks: 8,
  maxContextChars: 3000,
  autoIndex: true,
  cacheDir: '.genesis/code-index',
};

// ============================================================================
// Code-awareness heuristics
// ============================================================================

const CODE_QUERY_PATTERNS = [
  // Direct self-reference
  /\b(tuo|tua|tuoi|tue)\s+(codice|sorgente|architettura|kernel|modulo|classe|funzione)/i,
  /\b(your|its)\s+(code|source|architecture|kernel|module|class|function)/i,
  /\b(come|how)\s+(funzion|work|implement)/i,
  /\b(genesis|brain|kernel|fek|fiber|ness|contraction|leapfrog|fisher)\b/i,
  // Architecture questions
  /\b(architettura|architecture|struttura|structure|design)\b/i,
  /\b(moduli|modules|subsystem|layer|componenti|components)\b/i,
  // Self-awareness
  /\b(te\s+stess|yourself|self-knowledge|self-aware|autopoie)/i,
  /\b(cosa\s+(sei|fai|puoi)|what\s+(are you|can you|do you))\b/i,
  // Code inspection
  /\b(src\/|\.ts\b|import|export|class\s+\w|interface\s+\w|function\s+\w)/i,
  /\b(implementa|implement|codice|code|sorgente|source)\b/i,
];

/**
 * Detect if a query is about Genesis's own code/architecture
 */
export function isCodeQuery(query: string): boolean {
  return CODE_QUERY_PATTERNS.some(p => p.test(query));
}

// ============================================================================
// SelfKnowledge class
// ============================================================================

export class SelfKnowledge {
  private config: SelfKnowledgeConfig;
  private codeRAG: CodeRAG;
  private selfModelGen: SelfModelGenerator;
  private indexed = false;
  private selfModel: SelfModel | null = null;
  private bootPromise: Promise<void> | null = null;

  constructor(config?: Partial<SelfKnowledgeConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    const rootPath = this.config.rootPath;
    const srcPath = path.join(rootPath, 'src');

    this.codeRAG = getCodeRAG({
      rootPath: srcPath,
      useEmbeddings: false,  // Keyword-only, no API needed
      cacheEmbeddings: false,
      cachePath: path.join(rootPath, this.config.cacheDir),
      includePatterns: ['**/*.ts'],
      excludePatterns: ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/*.d.ts'],
    });

    this.selfModelGen = getSelfModelGenerator();
  }

  /**
   * Boot: index the codebase (or load from cache)
   * Called once when brain starts. Non-blocking if already cached.
   */
  async boot(): Promise<void> {
    if (this.indexed) return;
    if (this.bootPromise) return this.bootPromise;

    this.bootPromise = this._doBoot();
    return this.bootPromise;
  }

  private async _doBoot(): Promise<void> {
    try {
      // Try loading cached index first
      const loaded = await this.codeRAG.loadIndex();
      if (loaded) {
        this.indexed = true;
        return;
      }

      // Build fresh index (keyword-only, fast)
      if (this.config.autoIndex) {
        await this.codeRAG.buildIndex();
        await this.codeRAG.saveIndex();
        this.indexed = true;
      }
    } catch (error) {
      // Non-fatal — brain works without self-knowledge
      console.warn(`[SelfKnowledge] Boot failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Query the codebase for relevant chunks
   */
  query(queryText: string, topK?: number): QueryResult[] {
    if (!this.indexed) return [];
    return this.codeRAG.query(queryText, topK || this.config.maxContextChunks);
  }

  /**
   * Get formatted context string for brain injection
   * Returns empty string if query isn't code-related or index unavailable
   */
  getContext(query: string): string {
    if (!this.indexed) return '';
    if (!isCodeQuery(query)) return '';

    const results = this.query(query);
    if (results.length === 0) return '';

    // Format results for context
    let context = '[self-knowledge] Genesis source code relevant to query:\n';
    let chars = context.length;

    for (const result of results) {
      const chunk = result.chunk;
      const entry = `  ${chunk.type} ${chunk.name} (${chunk.relativePath}:${chunk.startLine}):\n` +
        `    ${chunk.content.slice(0, 200).replace(/\n/g, '\n    ')}\n`;

      if (chars + entry.length > this.config.maxContextChars) break;
      context += entry;
      chars += entry.length;
    }

    return context;
  }

  /**
   * Get full code context with self-model
   */
  async getFullContext(query: string): Promise<CodeContext> {
    if (!this.indexed) {
      await this.boot();
    }

    const chunks = this.query(query);
    const summary = this.codeRAG.getSummary();
    const formatted = this.getContext(query);

    return { chunks, summary, formatted };
  }

  /**
   * Get the self-model (architecture overview)
   */
  async getSelfModel(): Promise<SelfModel> {
    if (!this.selfModel) {
      this.selfModel = await this.selfModelGen.generate();
    }
    return this.selfModel;
  }

  /**
   * Get index statistics
   */
  getStats() {
    return this.codeRAG.getStats();
  }

  /**
   * Check if indexed
   */
  isReady(): boolean {
    return this.indexed;
  }

  /**
   * Force re-index
   */
  async reindex(): Promise<void> {
    this.indexed = false;
    await this.codeRAG.buildIndex();
    await this.codeRAG.saveIndex();
    this.indexed = true;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: SelfKnowledge | null = null;

export function getSelfKnowledge(config?: Partial<SelfKnowledgeConfig>): SelfKnowledge {
  if (!instance) {
    instance = new SelfKnowledge(config);
  }
  return instance;
}

export function resetSelfKnowledge(): void {
  instance = null;
}
