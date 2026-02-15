/**
 * Genesis 6.8 - SQLite Fix Cache
 *
 * Stores successful fixes from Self-Healing module for instant reuse.
 * Uses better-sqlite3 for synchronous, high-performance operations.
 *
 * Key: SHA256(error_message + file_path + context)
 * Value: Applied fix with metadata
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface CachedFix {
  /** Unique hash of error + context */
  id: string;
  /** Original error message */
  errorMessage: string;
  /** Error type (syntax, type, runtime, test, build, lint) */
  errorType: string;
  /** File path where error occurred */
  filePath: string;
  /** Code context around error */
  context: string;
  /** Applied fix */
  fix: string;
  /** Number of times this fix was used successfully */
  successCount: number;
  /** Last time this fix was used */
  lastUsed: number;
  /** When this fix was first created */
  createdAt: number;
  /** LLM provider that generated this fix (for stats) */
  provider?: string;
  /** Latency when fix was generated (for stats) */
  latencyMs?: number;
}

export interface CacheStats {
  totalFixes: number;
  totalHits: number;
  hitRate: number;
  avgLatencySaved: number;
  topErrors: Array<{ type: string; count: number }>;
  dbSizeBytes: number;
}

export interface CacheConfig {
  /** Path to SQLite database file */
  dbPath: string;
  /** Maximum number of fixes to cache (LRU eviction) */
  maxFixes: number;
  /** Minimum success count to keep a fix during eviction */
  minSuccessCount: number;
  /** Enable FTS5 for full-text search */
  enableFTS: boolean;
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CONFIG: CacheConfig = {
  dbPath: path.join(process.env.HOME || '/tmp', '.genesis', 'fix-cache.db'),
  maxFixes: 10000,
  minSuccessCount: 1,
  enableFTS: true,
};

// ============================================================================
// Pure Node.js SQLite Wrapper (no native dependencies)
// ============================================================================

/**
 * Simple JSON file-based cache as SQLite fallback
 * Works without native dependencies
 */
class JSONCache {
  private data: Map<string, CachedFix> = new Map();
  private dbPath: string;
  private hits: number = 0;
  private misses: number = 0;

  constructor(dbPath: string) {
    this.dbPath = dbPath.replace('.db', '.json');
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = new Map(Object.entries(parsed.fixes || {}));
        this.hits = parsed.hits || 0;
        this.misses = parsed.misses || 0;
      }
    } catch (err) {

      console.error('[cache] operation failed:', err);
      this.data = new Map();
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dbPath, JSON.stringify({
        fixes: Object.fromEntries(this.data),
        hits: this.hits,
        misses: this.misses,
      }, null, 2));
    } catch (e) {
      console.error('[Cache] Failed to save:', e);
    }
  }

  get(id: string): CachedFix | undefined {
    const fix = this.data.get(id);
    if (fix) {
      this.hits++;
      fix.successCount++;
      fix.lastUsed = Date.now();
      this.save();
    } else {
      this.misses++;
    }
    return fix;
  }

  set(fix: CachedFix): void {
    this.data.set(fix.id, fix);
    this.save();
  }

  delete(id: string): boolean {
    const result = this.data.delete(id);
    if (result) this.save();
    return result;
  }

  all(): CachedFix[] {
    return Array.from(this.data.values());
  }

  search(query: string): CachedFix[] {
    const lower = query.toLowerCase();
    return this.all().filter(f =>
      f.errorMessage.toLowerCase().includes(lower) ||
      f.fix.toLowerCase().includes(lower) ||
      f.context.toLowerCase().includes(lower)
    );
  }

  size(): number {
    return this.data.size;
  }

  stats(): CacheStats {
    const fixes = this.all();
    const errorTypes = new Map<string, number>();
    let totalLatency = 0;
    let latencyCount = 0;

    for (const fix of fixes) {
      errorTypes.set(fix.errorType, (errorTypes.get(fix.errorType) || 0) + 1);
      if (fix.latencyMs) {
        totalLatency += fix.latencyMs;
        latencyCount++;
      }
    }

    const topErrors = Array.from(errorTypes.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    let dbSize = 0;
    try {
      if (fs.existsSync(this.dbPath)) {
        dbSize = fs.statSync(this.dbPath).size;
      }
    } catch (err) {

      console.error('[cache] operation failed:', err);
      // File stats unavailable, return 0
    }

    return {
      totalFixes: fixes.length,
      totalHits: this.hits,
      hitRate: this.hits / Math.max(1, this.hits + this.misses),
      avgLatencySaved: latencyCount > 0 ? totalLatency / latencyCount : 0,
      topErrors,
      dbSizeBytes: dbSize,
    };
  }

  clear(): void {
    this.data.clear();
    this.hits = 0;
    this.misses = 0;
    this.save();
  }

  close(): void {
    this.save();
  }
}

// ============================================================================
// Fix Cache Class
// ============================================================================

export class FixCache {
  private config: CacheConfig;
  private cache: JSONCache;

  constructor(config?: Partial<CacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Ensure directory exists
    const dir = path.dirname(this.config.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Use JSON cache (no native dependencies)
    this.cache = new JSONCache(this.config.dbPath);
  }

  // ==========================================================================
  // Core Operations
  // ==========================================================================

  /**
   * Generate cache key from error details
   */
  generateKey(errorMessage: string, filePath: string, context: string = ''): string {
    const normalized = `${errorMessage.trim()}|${filePath}|${context.slice(0, 500)}`;
    return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  }

  /**
   * Look up a cached fix
   */
  lookup(errorMessage: string, filePath: string, context: string = ''): CachedFix | null {
    const key = this.generateKey(errorMessage, filePath, context);
    return this.cache.get(key) || null;
  }

  /**
   * Store a successful fix
   */
  store(params: {
    errorMessage: string;
    errorType: string;
    filePath: string;
    context: string;
    fix: string;
    provider?: string;
    latencyMs?: number;
  }): CachedFix {
    const id = this.generateKey(params.errorMessage, params.filePath, params.context);

    const existing = this.cache.get(id);
    if (existing) {
      // Update existing
      existing.successCount++;
      existing.lastUsed = Date.now();
      this.cache.set(existing);
      return existing;
    }

    const fix: CachedFix = {
      id,
      errorMessage: params.errorMessage,
      errorType: params.errorType,
      filePath: params.filePath,
      context: params.context.slice(0, 2000), // Limit context size
      fix: params.fix,
      successCount: 1,
      lastUsed: Date.now(),
      createdAt: Date.now(),
      provider: params.provider,
      latencyMs: params.latencyMs,
    };

    this.cache.set(fix);
    this.evictIfNeeded();

    return fix;
  }

  /**
   * Search for similar errors
   */
  searchSimilar(query: string, limit: number = 5): CachedFix[] {
    return this.cache.search(query).slice(0, limit);
  }

  /**
   * Get all cached fixes
   */
  getAll(): CachedFix[] {
    return this.cache.all();
  }

  /**
   * Get cache statistics
   */
  stats(): CacheStats {
    return this.cache.stats();
  }

  /**
   * Clear all cached fixes
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Delete a specific fix
   */
  delete(id: string): boolean {
    return this.cache.delete(id);
  }

  /**
   * Close the cache (save to disk)
   */
  close(): void {
    this.cache.close();
  }

  // ==========================================================================
  // Eviction
  // ==========================================================================

  private evictIfNeeded(): void {
    const fixes = this.cache.all();
    if (fixes.length <= this.config.maxFixes) return;

    // Sort by LRU (least recently used first)
    const sorted = fixes
      .filter(f => f.successCount < this.config.minSuccessCount)
      .sort((a, b) => a.lastUsed - b.lastUsed);

    // Evict oldest 10%
    const toEvict = Math.ceil(sorted.length * 0.1);
    for (let i = 0; i < toEvict && i < sorted.length; i++) {
      this.cache.delete(sorted[i].id);
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let fixCacheInstance: FixCache | null = null;

export function getFixCache(config?: Partial<CacheConfig>): FixCache {
  if (!fixCacheInstance) {
    fixCacheInstance = new FixCache(config);
  }
  return fixCacheInstance;
}

export function resetFixCache(): void {
  if (fixCacheInstance) {
    fixCacheInstance.close();
    fixCacheInstance = null;
  }
}

// ============================================================================
// Integration with Self-Healing
// ============================================================================

/**
 * Try to get a cached fix before calling LLM
 */
export async function getCachedFixOrGenerate(
  errorMessage: string,
  errorType: string,
  filePath: string,
  context: string,
  generateFix: () => Promise<{ fix: string; provider: string; latencyMs: number }>
): Promise<{ fix: string; cached: boolean; latencyMs: number }> {
  const cache = getFixCache();

  // Try cache first
  const cached = cache.lookup(errorMessage, filePath, context);
  if (cached) {
    console.log(`[Cache] HIT: Reusing fix for ${errorType} error (${cached.successCount} uses)`);
    return {
      fix: cached.fix,
      cached: true,
      latencyMs: 0, // Instant!
    };
  }

  // Cache miss - generate new fix
  console.log(`[Cache] MISS: Generating new fix for ${errorType} error...`);
  const startTime = Date.now();
  const result = await generateFix();
  const latencyMs = Date.now() - startTime;

  // Store for future use
  cache.store({
    errorMessage,
    errorType,
    filePath,
    context,
    fix: result.fix,
    provider: result.provider,
    latencyMs,
  });

  return {
    fix: result.fix,
    cached: false,
    latencyMs,
  };
}
