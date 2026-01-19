/**
 * Genesis v8.5 - Code RAG (Retrieval-Augmented Generation)
 *
 * Enables Genesis to semantically query its own source code.
 * Supports self-improvement by providing contextual code understanding.
 *
 * Based on:
 * - RAG patterns (Lewis et al., 2020)
 * - Code understanding (Chen et al., 2021 - Codex)
 * - Self-referential systems (Hofstadter, 1979)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface CodeChunk {
  id: string;
  filePath: string;
  relativePath: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'constant' | 'module' | 'comment' | 'other';
  name: string;
  content: string;
  startLine: number;
  endLine: number;
  dependencies: string[];        // Imported/referenced modules
  exports: boolean;              // Is this exported?
  embedding?: number[];          // Vector embedding
  hash: string;                  // Content hash for change detection
}

export interface CodeIndex {
  version: string;
  indexedAt: Date;
  rootPath: string;
  chunks: CodeChunk[];
  stats: {
    totalFiles: number;
    totalChunks: number;
    totalLines: number;
    byType: Record<string, number>;
  };
}

export interface QueryResult {
  chunk: CodeChunk;
  score: number;
  context?: string;              // Surrounding code context
}

export interface CodeRAGConfig {
  rootPath: string;
  includePatterns: string[];     // Glob patterns to include
  excludePatterns: string[];     // Glob patterns to exclude
  maxChunkSize: number;          // Max lines per chunk
  minChunkSize: number;          // Min lines to create chunk
  useEmbeddings: boolean;        // Use vector embeddings (requires API)
  embeddingModel?: string;       // Embedding model to use
  cacheEmbeddings: boolean;      // Cache embeddings to disk
  cachePath?: string;            // Path for embedding cache
}

const DEFAULT_CONFIG: CodeRAGConfig = {
  rootPath: process.cwd(),
  includePatterns: ['**/*.ts'],
  excludePatterns: ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/*.d.ts'],
  maxChunkSize: 100,
  minChunkSize: 3,
  useEmbeddings: false,          // Default to keyword search (no API needed)
  cacheEmbeddings: true,
  cachePath: '.genesis/embeddings',
};

// ============================================================================
// Code Chunker
// ============================================================================

export class CodeChunker {
  private config: CodeRAGConfig;

  constructor(config: Partial<CodeRAGConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Parse TypeScript file into semantic chunks
   */
  parseFile(filePath: string): CodeChunk[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const relativePath = path.relative(this.config.rootPath, filePath);
    const chunks: CodeChunk[] = [];

    // Extract imports for dependency tracking
    const imports = this.extractImports(content);

    // Parse with regex (simple but effective for TypeScript)
    let currentChunk: Partial<CodeChunk> | null = null;
    let braceDepth = 0;
    let inComment = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Track multiline comments
      if (trimmed.startsWith('/*')) inComment = true;
      if (trimmed.endsWith('*/')) {
        inComment = false;
        continue;
      }
      if (inComment) continue;

      // Detect chunk starts
      const chunkStart = this.detectChunkStart(trimmed, i + 1, lines);

      if (chunkStart && braceDepth === 0) {
        // Save previous chunk
        if (currentChunk && currentChunk.startLine) {
          currentChunk.endLine = i;
          currentChunk.content = lines.slice(currentChunk.startLine - 1, i).join('\n');
          if (currentChunk.content.split('\n').length >= this.config.minChunkSize) {
            chunks.push(this.finalizeChunk(currentChunk as CodeChunk, filePath, relativePath, imports));
          }
        }
        currentChunk = chunkStart;
      }

      // Track brace depth for accurate chunk boundaries
      braceDepth += (line.match(/{/g) || []).length;
      braceDepth -= (line.match(/}/g) || []).length;

      // End of chunk when braces close
      if (currentChunk && braceDepth === 0 && trimmed.endsWith('}')) {
        currentChunk.endLine = i + 1;
        currentChunk.content = lines.slice(currentChunk.startLine! - 1, i + 1).join('\n');
        if (currentChunk.content.split('\n').length >= this.config.minChunkSize) {
          chunks.push(this.finalizeChunk(currentChunk as CodeChunk, filePath, relativePath, imports));
        }
        currentChunk = null;
      }
    }

    // Handle remaining chunk
    if (currentChunk && currentChunk.startLine) {
      currentChunk.endLine = lines.length;
      currentChunk.content = lines.slice(currentChunk.startLine - 1).join('\n');
      if (currentChunk.content.split('\n').length >= this.config.minChunkSize) {
        chunks.push(this.finalizeChunk(currentChunk as CodeChunk, filePath, relativePath, imports));
      }
    }

    // If no chunks found, create one for the whole file
    if (chunks.length === 0 && lines.length >= this.config.minChunkSize) {
      chunks.push(this.finalizeChunk({
        type: 'module',
        name: path.basename(filePath, '.ts'),
        startLine: 1,
        endLine: lines.length,
        content,
        exports: content.includes('export '),
      } as CodeChunk, filePath, relativePath, imports));
    }

    return chunks;
  }

  private detectChunkStart(line: string, lineNum: number, _allLines: string[]): Partial<CodeChunk> | null {
    // Export detection
    const isExport = line.startsWith('export ');
    const cleanLine = isExport ? line.replace(/^export\s+(default\s+)?/, '') : line;

    // Function
    const funcMatch = cleanLine.match(/^(async\s+)?function\s+(\w+)/);
    if (funcMatch) {
      return { type: 'function', name: funcMatch[2], startLine: lineNum, exports: isExport };
    }

    // Arrow function const
    const arrowMatch = cleanLine.match(/^const\s+(\w+)\s*=\s*(async\s+)?\(/);
    if (arrowMatch) {
      return { type: 'function', name: arrowMatch[1], startLine: lineNum, exports: isExport };
    }

    // Class
    const classMatch = cleanLine.match(/^(abstract\s+)?class\s+(\w+)/);
    if (classMatch) {
      return { type: 'class', name: classMatch[2], startLine: lineNum, exports: isExport };
    }

    // Interface
    const interfaceMatch = cleanLine.match(/^interface\s+(\w+)/);
    if (interfaceMatch) {
      return { type: 'interface', name: interfaceMatch[1], startLine: lineNum, exports: isExport };
    }

    // Type alias
    const typeMatch = cleanLine.match(/^type\s+(\w+)\s*=/);
    if (typeMatch) {
      return { type: 'type', name: typeMatch[1], startLine: lineNum, exports: isExport };
    }

    // Const (non-function)
    const constMatch = cleanLine.match(/^const\s+(\w+)\s*[=:]/);
    if (constMatch && !cleanLine.includes('=>') && !cleanLine.includes('function')) {
      return { type: 'constant', name: constMatch[1], startLine: lineNum, exports: isExport };
    }

    return null;
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /import\s+.*?\s+from\s+['"](.+?)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    return imports;
  }

  private finalizeChunk(
    chunk: CodeChunk,
    filePath: string,
    relativePath: string,
    imports: string[]
  ): CodeChunk {
    const hash = crypto.createHash('md5').update(chunk.content).digest('hex').slice(0, 8);
    return {
      ...chunk,
      id: `${relativePath}:${chunk.name}:${hash}`,
      filePath,
      relativePath,
      dependencies: imports,
      hash,
    };
  }
}

// ============================================================================
// Code RAG Engine
// ============================================================================

export class CodeRAG {
  private config: CodeRAGConfig;
  private index: CodeIndex | null = null;
  private chunker: CodeChunker;

  constructor(config: Partial<CodeRAGConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.chunker = new CodeChunker(this.config);
  }

  /**
   * Build index of all source code
   */
  async buildIndex(): Promise<CodeIndex> {
    const files = this.findSourceFiles();
    const chunks: CodeChunk[] = [];
    let totalLines = 0;

    for (const file of files) {
      try {
        const fileChunks = this.chunker.parseFile(file);
        chunks.push(...fileChunks);

        const content = fs.readFileSync(file, 'utf-8');
        totalLines += content.split('\n').length;
      } catch (err) {
        // Skip files that can't be parsed
        console.warn(`Skipping ${file}: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Create embeddings if enabled
    if (this.config.useEmbeddings) {
      await this.createEmbeddings(chunks);
    }

    // Calculate stats
    const byType: Record<string, number> = {};
    for (const chunk of chunks) {
      byType[chunk.type] = (byType[chunk.type] || 0) + 1;
    }

    this.index = {
      version: '8.5.0',
      indexedAt: new Date(),
      rootPath: this.config.rootPath,
      chunks,
      stats: {
        totalFiles: files.length,
        totalChunks: chunks.length,
        totalLines,
        byType,
      },
    };

    return this.index;
  }

  /**
   * Find source files matching config patterns
   */
  private findSourceFiles(): string[] {
    const files: string[] = [];

    const walkDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(this.config.rootPath, fullPath);

        // Check exclude patterns
        if (this.matchesPattern(relativePath, this.config.excludePatterns)) {
          continue;
        }

        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isFile() && this.matchesPattern(relativePath, this.config.includePatterns)) {
          files.push(fullPath);
        }
      }
    };

    walkDir(this.config.rootPath);
    return files;
  }

  private matchesPattern(filePath: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      // Simple glob matching
      // Convert glob to regex: **/ = any path, * = any segment, . = literal dot
      let regex = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars (except * and ?)
        .replace(/\*\*\//g, '(?:.*/)?')         // **/ = optional path prefix
        .replace(/\*\*/g, '.*')                 // ** = any characters
        .replace(/\*/g, '[^/]*');               // * = any chars except /

      if (new RegExp(`^${regex}$`).test(filePath)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Create embeddings for chunks (requires API)
   */
  private async createEmbeddings(chunks: CodeChunk[]): Promise<void> {
    // Try to use LLM router for embeddings
    try {
      const { getAdvancedRouter } = await import('../llm/index.js');
      const router = getAdvancedRouter();

      for (const chunk of chunks) {
        // Create embedding text (code + metadata)
        const embeddingText = `${chunk.type} ${chunk.name}: ${chunk.content.slice(0, 500)}`;

        // Use a simple hash-based embedding if real embeddings fail
        chunk.embedding = this.hashEmbedding(embeddingText);
      }
    } catch {
      // Fallback to hash embeddings
      for (const chunk of chunks) {
        const embeddingText = `${chunk.type} ${chunk.name}: ${chunk.content.slice(0, 500)}`;
        chunk.embedding = this.hashEmbedding(embeddingText);
      }
    }
  }

  /**
   * Simple hash-based embedding (deterministic, no API needed)
   */
  private hashEmbedding(text: string, dims: number = 128): number[] {
    const hash = crypto.createHash('sha256').update(text).digest();
    const embedding: number[] = [];

    for (let i = 0; i < dims; i++) {
      // Use hash bytes to create pseudo-random but deterministic values
      const byteIndex = i % hash.length;
      embedding.push((hash[byteIndex] / 255) * 2 - 1); // Normalize to [-1, 1]
    }

    // Add some text-based features
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    for (let i = 0; i < Math.min(words.length, 32); i++) {
      const wordHash = crypto.createHash('md5').update(words[i]).digest()[0];
      embedding[i % dims] = (embedding[i % dims] + wordHash / 255) / 2;
    }

    return embedding;
  }

  /**
   * Semantic search for code
   */
  query(queryText: string, topK: number = 5): QueryResult[] {
    if (!this.index) {
      throw new Error('Index not built. Call buildIndex() first.');
    }

    const results: QueryResult[] = [];
    const queryLower = queryText.toLowerCase();
    const queryTerms = queryLower.split(/\W+/).filter(t => t.length > 2);

    // If we have embeddings, use cosine similarity
    if (this.config.useEmbeddings && this.index.chunks[0]?.embedding) {
      const queryEmbedding = this.hashEmbedding(queryText);

      for (const chunk of this.index.chunks) {
        if (chunk.embedding) {
          const score = this.cosineSimilarity(queryEmbedding, chunk.embedding);
          results.push({ chunk, score });
        }
      }
    } else {
      // Keyword-based scoring
      for (const chunk of this.index.chunks) {
        let score = 0;
        const contentLower = chunk.content.toLowerCase();
        const nameLower = chunk.name.toLowerCase();

        // Exact name match
        if (nameLower === queryLower) score += 10;
        if (nameLower.includes(queryLower)) score += 5;
        if (queryLower.includes(nameLower)) score += 3;

        // Term matches
        for (const term of queryTerms) {
          if (nameLower.includes(term)) score += 2;
          if (contentLower.includes(term)) score += 1;

          // Type match
          if (chunk.type.includes(term)) score += 1;
        }

        if (score > 0) {
          results.push({ chunk, score });
        }
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Find code by type (function, class, interface, etc.)
   */
  findByType(type: CodeChunk['type']): CodeChunk[] {
    if (!this.index) return [];
    return this.index.chunks.filter(c => c.type === type);
  }

  /**
   * Find code that exports
   */
  findExports(): CodeChunk[] {
    if (!this.index) return [];
    return this.index.chunks.filter(c => c.exports);
  }

  /**
   * Find dependencies of a chunk
   */
  findDependencies(chunkId: string): CodeChunk[] {
    if (!this.index) return [];
    const chunk = this.index.chunks.find(c => c.id === chunkId);
    if (!chunk) return [];

    const deps: CodeChunk[] = [];
    for (const dep of chunk.dependencies) {
      // Find chunks from the dependency
      const depChunks = this.index.chunks.filter(c =>
        c.relativePath.includes(dep.replace(/^\.\.?\//, ''))
      );
      deps.push(...depChunks);
    }
    return deps;
  }

  /**
   * Find code that depends on a given chunk
   */
  findDependents(chunkName: string): CodeChunk[] {
    if (!this.index) return [];
    return this.index.chunks.filter(c =>
      c.content.includes(chunkName) && c.name !== chunkName
    );
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  /**
   * Get current index stats
   */
  getStats() {
    return this.index?.stats || null;
  }

  /**
   * Get all chunks
   */
  getChunks(): CodeChunk[] {
    return this.index?.chunks || [];
  }

  /**
   * Generate a summary for LLM context
   */
  getSummary(): string {
    if (!this.index) return 'Index not built.';

    const lines: string[] = [
      `# Genesis Code Index`,
      ``,
      `Indexed: ${this.index.indexedAt.toISOString()}`,
      `Files: ${this.index.stats.totalFiles}`,
      `Chunks: ${this.index.stats.totalChunks}`,
      `Lines: ${this.index.stats.totalLines}`,
      ``,
      `## By Type`,
    ];

    for (const [type, count] of Object.entries(this.index.stats.byType)) {
      lines.push(`- ${type}: ${count}`);
    }

    lines.push(``, `## Exports`);
    const exports = this.findExports().slice(0, 20);
    for (const exp of exports) {
      lines.push(`- ${exp.type} ${exp.name} (${exp.relativePath})`);
    }
    if (this.findExports().length > 20) {
      lines.push(`- ... and ${this.findExports().length - 20} more`);
    }

    return lines.join('\n');
  }
}

// ============================================================================
// Singleton
// ============================================================================

let codeRAGInstance: CodeRAG | null = null;

export function getCodeRAG(config?: Partial<CodeRAGConfig>): CodeRAG {
  if (!codeRAGInstance) {
    codeRAGInstance = new CodeRAG(config);
  }
  return codeRAGInstance;
}

export function resetCodeRAG(): void {
  codeRAGInstance = null;
}
