/**
 * Genesis 6.8 - Project Indexer
 *
 * Indexes project files for local full-text search.
 * No LLM needed for code search - instant results.
 *
 * Uses JSON storage with in-memory trigram index for fast search.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface IndexedFile {
  /** Relative path from project root */
  path: string;
  /** File content */
  content: string;
  /** Content hash for change detection */
  hash: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  mtime: number;
  /** Language/type */
  language: string;
  /** Line count */
  lines: number;
  /** Extracted symbols (functions, classes, etc.) */
  symbols: string[];
}

export interface SearchResult {
  /** File path */
  path: string;
  /** Matching lines with context */
  matches: Array<{
    line: number;
    content: string;
    context: string[];
  }>;
  /** Relevance score */
  score: number;
}

export interface IndexStats {
  totalFiles: number;
  totalLines: number;
  totalBytes: number;
  languages: Record<string, number>;
  lastIndexed: number;
  indexPath: string;
}

export interface IndexerConfig {
  /** Project root directory */
  projectRoot: string;
  /** Index storage path */
  indexPath: string;
  /** File patterns to include */
  include: string[];
  /** File patterns to exclude */
  exclude: string[];
  /** Maximum file size to index (bytes) */
  maxFileSize: number;
  /** Enable incremental indexing */
  incremental: boolean;
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CONFIG: IndexerConfig = {
  projectRoot: process.cwd(),
  indexPath: path.join(process.cwd(), '.genesis', 'index.json'),
  include: [
    '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx',
    '**/*.py', '**/*.go', '**/*.rs', '**/*.java',
    '**/*.md', '**/*.json', '**/*.yaml', '**/*.yml',
    '**/*.html', '**/*.css', '**/*.scss',
  ],
  exclude: [
    'node_modules/**', 'dist/**', 'build/**', '.git/**',
    '*.min.js', '*.bundle.js', 'package-lock.json',
    '.genesis/**', 'coverage/**', '.next/**',
  ],
  maxFileSize: 1024 * 1024, // 1MB
  incremental: true,
};

// ============================================================================
// Language Detection
// ============================================================================

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.md': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
};

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_MAP[ext] || 'text';
}

// ============================================================================
// Symbol Extraction
// ============================================================================

function extractSymbols(content: string, language: string): string[] {
  const symbols: string[] = [];

  // TypeScript/JavaScript
  if (language === 'typescript' || language === 'javascript') {
    // Functions
    const funcMatches = content.matchAll(/(?:function|const|let|var)\s+(\w+)\s*(?:=\s*(?:async\s*)?\(|[\(:])/g);
    for (const m of funcMatches) symbols.push(m[1]);

    // Classes
    const classMatches = content.matchAll(/class\s+(\w+)/g);
    for (const m of classMatches) symbols.push(m[1]);

    // Interfaces/Types
    const typeMatches = content.matchAll(/(?:interface|type)\s+(\w+)/g);
    for (const m of typeMatches) symbols.push(m[1]);

    // Exports
    const exportMatches = content.matchAll(/export\s+(?:const|function|class|interface|type)\s+(\w+)/g);
    for (const m of exportMatches) symbols.push(m[1]);
  }

  // Python
  if (language === 'python') {
    const defMatches = content.matchAll(/def\s+(\w+)/g);
    for (const m of defMatches) symbols.push(m[1]);

    const classMatches = content.matchAll(/class\s+(\w+)/g);
    for (const m of classMatches) symbols.push(m[1]);
  }

  // Go
  if (language === 'go') {
    const funcMatches = content.matchAll(/func\s+(?:\([^)]+\)\s+)?(\w+)/g);
    for (const m of funcMatches) symbols.push(m[1]);

    const typeMatches = content.matchAll(/type\s+(\w+)/g);
    for (const m of typeMatches) symbols.push(m[1]);
  }

  return [...new Set(symbols)];
}

// ============================================================================
// File Matching
// ============================================================================

function matchesPattern(filePath: string, pattern: string): boolean {
  // Convert glob to regex
  const regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{GLOBSTAR}}/g, '.*');
  return new RegExp(`^${regex}$`).test(filePath);
}

function shouldIndex(filePath: string, config: IndexerConfig): boolean {
  const relative = path.relative(config.projectRoot, filePath);

  // Check excludes first
  for (const pattern of config.exclude) {
    if (matchesPattern(relative, pattern)) return false;
  }

  // Check includes
  for (const pattern of config.include) {
    if (matchesPattern(relative, pattern)) return true;
  }

  return false;
}

// ============================================================================
// Project Indexer Class
// ============================================================================

export class ProjectIndexer {
  private config: IndexerConfig;
  private index: Map<string, IndexedFile> = new Map();
  private trigramIndex: Map<string, Set<string>> = new Map();

  constructor(config?: Partial<IndexerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadIndex();
  }

  // ==========================================================================
  // Index Management
  // ==========================================================================

  /**
   * Load existing index from disk
   */
  private loadIndex(): void {
    try {
      if (fs.existsSync(this.config.indexPath)) {
        const raw = fs.readFileSync(this.config.indexPath, 'utf-8');
        const data = JSON.parse(raw);
        this.index = new Map(Object.entries(data.files || {}));
        this.rebuildTrigramIndex();
      }
    } catch (err) {

      console.error('[indexer] operation failed:', err);
      this.index = new Map();
    }
  }

  /**
   * Save index to disk
   */
  private saveIndex(): void {
    try {
      const dir = path.dirname(this.config.indexPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.config.indexPath, JSON.stringify({
        files: Object.fromEntries(this.index),
        lastIndexed: Date.now(),
      }, null, 2));
    } catch (e) {
      console.error('[Indexer] Failed to save:', e);
    }
  }

  /**
   * Build trigram index for fast search
   */
  private rebuildTrigramIndex(): void {
    this.trigramIndex.clear();
    for (const [filePath, file] of this.index) {
      const content = file.content.toLowerCase();
      for (let i = 0; i < content.length - 2; i++) {
        const trigram = content.slice(i, i + 3);
        if (!this.trigramIndex.has(trigram)) {
          this.trigramIndex.set(trigram, new Set());
        }
        this.trigramIndex.get(trigram)!.add(filePath);
      }
    }
  }

  /**
   * Index the entire project
   */
  async indexProject(): Promise<IndexStats> {
    console.log(`[Indexer] Indexing project: ${this.config.projectRoot}`);
    const startTime = Date.now();

    const files = this.walkDirectory(this.config.projectRoot);
    let indexed = 0;
    let skipped = 0;

    for (const filePath of files) {
      if (!shouldIndex(filePath, this.config)) {
        skipped++;
        continue;
      }

      try {
        const stats = fs.statSync(filePath);

        // Skip large files
        if (stats.size > this.config.maxFileSize) {
          skipped++;
          continue;
        }

        // Check if file changed (incremental)
        if (this.config.incremental) {
          const existing = this.index.get(filePath);
          if (existing && existing.mtime === stats.mtimeMs) {
            continue; // Skip unchanged
          }
        }

        // Index file
        const content = fs.readFileSync(filePath, 'utf-8');
        const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
        const language = detectLanguage(filePath);

        const indexedFile: IndexedFile = {
          path: path.relative(this.config.projectRoot, filePath),
          content,
          hash,
          size: stats.size,
          mtime: stats.mtimeMs,
          language,
          lines: content.split('\n').length,
          symbols: extractSymbols(content, language),
        };

        this.index.set(filePath, indexedFile);
        indexed++;
      } catch (e) {
        // Skip unreadable files
        skipped++;
      }
    }

    this.rebuildTrigramIndex();
    this.saveIndex();

    const duration = Date.now() - startTime;
    console.log(`[Indexer] Indexed ${indexed} files, skipped ${skipped} in ${duration}ms`);

    return this.stats();
  }

  /**
   * Walk directory recursively
   */
  private walkDirectory(dir: string): string[] {
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip hidden directories and common exclusions
        if (entry.name.startsWith('.') && entry.isDirectory()) continue;
        if (entry.name === 'node_modules') continue;

        if (entry.isDirectory()) {
          files.push(...this.walkDirectory(fullPath));
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch (err) {

      console.error('[indexer] operation failed:', err);
      // Skip unreadable directories
    }

    return files;
  }

  // ==========================================================================
  // Search
  // ==========================================================================

  /**
   * Search for a string in the codebase
   */
  search(query: string, options: { limit?: number; caseSensitive?: boolean } = {}): SearchResult[] {
    const { limit = 20, caseSensitive = false } = options;
    const results: SearchResult[] = [];

    // Use trigram index for candidate files
    const candidates = this.findCandidates(query.toLowerCase());

    for (const filePath of candidates) {
      const file = this.index.get(filePath);
      if (!file) continue;

      const matches = this.findMatches(file.content, query, caseSensitive);
      if (matches.length > 0) {
        results.push({
          path: file.path,
          matches,
          score: matches.length,
        });
      }
    }

    // Sort by score and limit
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Find candidate files using trigram index
   */
  private findCandidates(query: string): Set<string> {
    if (query.length < 3) {
      // For short queries, check all files
      return new Set(this.index.keys());
    }

    const trigrams: string[] = [];
    for (let i = 0; i < query.length - 2; i++) {
      trigrams.push(query.slice(i, i + 3));
    }

    // Files must contain all trigrams
    let candidates: Set<string> = new Set<string>();
    let first = true;

    for (const trigram of trigrams) {
      const files = this.trigramIndex.get(trigram);
      if (!files) return new Set<string>(); // No matches

      if (first) {
        candidates = new Set<string>(files);
        first = false;
      } else {
        // Intersection - keep only candidates that are also in files
        const intersection = new Set<string>();
        for (const f of candidates) {
          if (files.has(f)) {
            intersection.add(f);
          }
        }
        candidates = intersection;
      }
    }

    return candidates || new Set();
  }

  /**
   * Find matches in file content
   */
  private findMatches(
    content: string,
    query: string,
    caseSensitive: boolean
  ): Array<{ line: number; content: string; context: string[] }> {
    const matches: Array<{ line: number; content: string; context: string[] }> = [];
    const lines = content.split('\n');
    const searchQuery = caseSensitive ? query : query.toLowerCase();

    for (let i = 0; i < lines.length; i++) {
      const line = caseSensitive ? lines[i] : lines[i].toLowerCase();

      if (line.includes(searchQuery)) {
        // Get context (2 lines before and after)
        const context: string[] = [];
        for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 2); j++) {
          if (j !== i) context.push(lines[j]);
        }

        matches.push({
          line: i + 1,
          content: lines[i],
          context,
        });
      }
    }

    return matches;
  }

  /**
   * Search for a symbol (function, class, etc.)
   */
  searchSymbol(symbol: string): SearchResult[] {
    const results: SearchResult[] = [];

    for (const [filePath, file] of this.index) {
      if (file.symbols.some(s => s.toLowerCase().includes(symbol.toLowerCase()))) {
        results.push({
          path: file.path,
          matches: [{
            line: 0,
            content: `Symbol: ${file.symbols.filter(s => s.toLowerCase().includes(symbol.toLowerCase())).join(', ')}`,
            context: [],
          }],
          score: 10,
        });
      }
    }

    return results;
  }

  /**
   * Get file content
   */
  getFile(filePath: string): IndexedFile | null {
    const absolute = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.config.projectRoot, filePath);
    return this.index.get(absolute) || null;
  }

  /**
   * List all indexed files
   */
  listFiles(): string[] {
    return Array.from(this.index.values()).map(f => f.path);
  }

  /**
   * Get index statistics
   */
  stats(): IndexStats {
    let totalLines = 0;
    let totalBytes = 0;
    const languages: Record<string, number> = {};

    for (const file of this.index.values()) {
      totalLines += file.lines;
      totalBytes += file.size;
      languages[file.language] = (languages[file.language] || 0) + 1;
    }

    return {
      totalFiles: this.index.size,
      totalLines,
      totalBytes,
      languages,
      lastIndexed: Date.now(),
      indexPath: this.config.indexPath,
    };
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.index.clear();
    this.trigramIndex.clear();
    this.saveIndex();
  }
}

// ============================================================================
// Singleton
// ============================================================================

let indexerInstance: ProjectIndexer | null = null;

export function getProjectIndexer(config?: Partial<IndexerConfig>): ProjectIndexer {
  if (!indexerInstance) {
    indexerInstance = new ProjectIndexer(config);
  }
  return indexerInstance;
}

export function resetProjectIndexer(): void {
  indexerInstance = null;
}
