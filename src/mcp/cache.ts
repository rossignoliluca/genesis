/**
 * Genesis MCP Intelligent Cache
 *
 * Smart caching with per-server TTL, semantic deduplication,
 * and LRU eviction.
 *
 * Features:
 * - Per-server TTL configuration
 * - Semantic key hashing (similar queries hit same cache)
 * - LRU eviction with configurable max size
 * - Cache statistics and monitoring
 * - Invalidation patterns
 * - Persistent cache option (filesystem)
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { MCPServerName } from '../types.js';
import { MCPCallResult } from './index.js';

// ============================================================================
// Types
// ============================================================================

export interface CacheEntry<T = any> {
  key: string;
  data: T;
  server: MCPServerName;
  tool: string;
  createdAt: number;
  expiresAt: number;
  hits: number;
  size: number; // Approximate size in bytes
}

export interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
  totalSize: number;
  hitRate: number;
  byServer: Record<MCPServerName, { hits: number; misses: number; entries: number }>;
}

export interface CacheConfig {
  // Maximum number of entries
  maxEntries?: number;
  // Maximum total size in bytes
  maxSize?: number;
  // Default TTL in ms
  defaultTTL?: number;
  // Per-server TTL overrides (ms)
  serverTTL?: Partial<Record<MCPServerName, number>>;
  // Enable persistent cache
  persistent?: boolean;
  // Path for persistent cache
  persistPath?: string;
  // Enable semantic key matching
  semanticKeys?: boolean;
}

// ============================================================================
// Default TTLs per server
// ============================================================================

const DEFAULT_SERVER_TTL: Record<MCPServerName, number> = {
  // Knowledge (can be cached longer)
  'arxiv': 1000 * 60 * 60 * 24, // 24 hours
  'semantic-scholar': 1000 * 60 * 60 * 24, // 24 hours
  'context7': 1000 * 60 * 60 * 12, // 12 hours
  'wolfram': 1000 * 60 * 60, // 1 hour

  // Research (moderate caching)
  'gemini': 1000 * 60 * 30, // 30 minutes
  'brave-search': 1000 * 60 * 15, // 15 minutes (search results change)
  'exa': 1000 * 60 * 30, // 30 minutes
  'firecrawl': 1000 * 60 * 60, // 1 hour (scraped content)

  // Creation (no caching by default)
  'openai': 0, // Don't cache AI responses
  'github': 1000 * 60 * 5, // 5 minutes (repos can change)

  // Visual (no caching)
  'stability-ai': 0, // Don't cache generated images

  // Storage (short cache)
  'memory': 1000 * 60 * 5, // 5 minutes
  'filesystem': 1000 * 60, // 1 minute

  // v7.14 - Web & Automation
  'playwright': 0, // Don't cache browser actions
  'aws': 1000 * 60 * 5, // 5 minutes (cloud state changes)
  'sentry': 1000 * 60 * 5, // 5 minutes (errors can change)
  'postgres': 1000 * 60, // 1 minute (database queries)

  // v7.19 - HuggingFace
  'huggingface': 0, // Don't cache AI-generated content

  // v7.23 - Autonomous Layer
  'stripe': 1000 * 60 * 5, // 5 minutes (payment state)
  'coinbase': 1000 * 60 * 5, // 5 minutes (crypto balances)
  'supabase': 1000 * 60, // 1 minute (database)
  'vercel': 1000 * 60 * 5, // 5 minutes (deployments)
  'cloudflare': 1000 * 60 * 5, // 5 minutes (workers/dns)
  'pinecone': 1000 * 60 * 5, // 5 minutes (vector queries)
  'neo4j': 1000 * 60 * 5, // 5 minutes (graph queries)
  'slack': 0, // Don't cache notifications
  'puppeteer': 0, // Don't cache browser actions
  'sequential-thinking': 0, // Don't cache reasoning
  // v10.0 - Internal markers
  'parallel': 0, // Batch operation marker, no caching
};

// ============================================================================
// Cache Implementation
// ============================================================================

export class MCPCache {
  private cache: Map<string, CacheEntry> = new Map();
  private accessOrder: string[] = []; // For LRU
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    entries: 0,
    totalSize: 0,
    hitRate: 0,
    byServer: {} as Record<MCPServerName, any>,
  };
  private config: Required<CacheConfig>;

  constructor(config: CacheConfig = {}) {
    this.config = {
      maxEntries: config.maxEntries ?? 1000,
      maxSize: config.maxSize ?? 50 * 1024 * 1024, // 50MB
      defaultTTL: config.defaultTTL ?? 1000 * 60 * 30, // 30 minutes
      serverTTL: { ...DEFAULT_SERVER_TTL, ...config.serverTTL },
      persistent: config.persistent ?? false,
      persistPath: config.persistPath ?? path.join(process.cwd(), '.genesis-cache'),
      semanticKeys: config.semanticKeys ?? true,
    };

    // Load persistent cache
    if (this.config.persistent) {
      this.loadFromDisk();
    }
  }

  /**
   * Get cached result
   */
  get<T = any>(
    server: MCPServerName,
    tool: string,
    params: Record<string, any>
  ): CacheEntry<T> | null {
    const key = this.generateKey(server, tool, params);
    const entry = this.cache.get(key);

    // Initialize server stats if needed
    if (!this.stats.byServer[server]) {
      this.stats.byServer[server] = { hits: 0, misses: 0, entries: 0 };
    }

    if (!entry) {
      this.stats.misses++;
      this.stats.byServer[server].misses++;
      this.updateHitRate();
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      this.stats.misses++;
      this.stats.byServer[server].misses++;
      this.updateHitRate();
      return null;
    }

    // Update LRU order
    this.updateAccessOrder(key);
    entry.hits++;

    this.stats.hits++;
    this.stats.byServer[server].hits++;
    this.updateHitRate();

    return entry;
  }

  /**
   * Cache a result
   */
  set<T = any>(
    server: MCPServerName,
    tool: string,
    params: Record<string, any>,
    data: T
  ): void {
    const ttl = this.getTTL(server);

    // Don't cache if TTL is 0
    if (ttl === 0) return;

    const key = this.generateKey(server, tool, params);
    const size = this.estimateSize(data);

    // Evict if necessary
    this.evictIfNeeded(size);

    const entry: CacheEntry<T> = {
      key,
      data,
      server,
      tool,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl,
      hits: 0,
      size,
    };

    this.cache.set(key, entry);
    this.updateAccessOrder(key);

    // Update stats
    this.stats.entries = this.cache.size;
    this.stats.totalSize += size;

    if (!this.stats.byServer[server]) {
      this.stats.byServer[server] = { hits: 0, misses: 0, entries: 0 };
    }
    this.stats.byServer[server].entries++;

    // Persist if enabled
    if (this.config.persistent) {
      this.persistEntry(entry);
    }
  }

  /**
   * Wrap an MCP call with caching
   */
  async wrap<T = any>(
    server: MCPServerName,
    tool: string,
    params: Record<string, any>,
    fetcher: () => Promise<MCPCallResult<T>>
  ): Promise<MCPCallResult<T>> {
    // Check cache first
    const cached = this.get<T>(server, tool, params);
    if (cached) {
      return {
        success: true,
        data: cached.data,
        server,
        tool,
        mode: 'real',
        latency: 0,
        timestamp: new Date(),
      };
    }

    // Fetch and cache
    const result = await fetcher();

    if (result.success && result.data) {
      this.set(server, tool, params, result.data);
    }

    return result;
  }

  /**
   * Invalidate cache entries
   */
  invalidate(pattern: {
    server?: MCPServerName;
    tool?: string;
    olderThan?: number; // ms
  }): number {
    let invalidated = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache) {
      let shouldInvalidate = false;

      if (pattern.server && entry.server === pattern.server) {
        shouldInvalidate = true;
      }
      if (pattern.tool && entry.tool === pattern.tool) {
        shouldInvalidate = true;
      }
      if (pattern.olderThan && now - entry.createdAt > pattern.olderThan) {
        shouldInvalidate = true;
      }

      if (shouldInvalidate) {
        this.delete(key);
        invalidated++;
      }
    }

    return invalidated;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.stats = {
      hits: 0,
      misses: 0,
      entries: 0,
      totalSize: 0,
      hitRate: 0,
      byServer: {} as CacheStats['byServer'],
    };

    if (this.config.persistent) {
      this.clearDisk();
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get cache entries for debugging
   */
  getEntries(): CacheEntry[] {
    return Array.from(this.cache.values());
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private generateKey(server: MCPServerName, tool: string, params: Record<string, any>): string {
    let paramsStr = JSON.stringify(params, Object.keys(params).sort());

    // Semantic key normalization
    if (this.config.semanticKeys) {
      paramsStr = this.normalizeParams(paramsStr);
    }

    const hash = createHash('sha256')
      .update(`${server}:${tool}:${paramsStr}`)
      .digest('hex')
      .slice(0, 16);

    return `${server}:${tool}:${hash}`;
  }

  private normalizeParams(paramsStr: string): string {
    // Normalize whitespace and case for query-like params
    return paramsStr
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getTTL(server: MCPServerName): number {
    return this.config.serverTTL[server] ?? this.config.defaultTTL;
  }

  private estimateSize(data: any): number {
    try {
      return JSON.stringify(data).length * 2; // Rough estimate for UTF-16
    } catch {
      return 1000; // Default estimate
    }
  }

  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  private evictIfNeeded(newSize: number): void {
    // Evict by count
    while (this.cache.size >= this.config.maxEntries && this.accessOrder.length > 0) {
      const oldest = this.accessOrder.shift()!;
      this.delete(oldest);
    }

    // Evict by size
    while (this.stats.totalSize + newSize > this.config.maxSize && this.accessOrder.length > 0) {
      const oldest = this.accessOrder.shift()!;
      this.delete(oldest);
    }
  }

  private delete(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      this.stats.totalSize -= entry.size;
      this.stats.entries--;
      if (this.stats.byServer[entry.server]) {
        this.stats.byServer[entry.server].entries--;
      }
      this.cache.delete(key);

      const idx = this.accessOrder.indexOf(key);
      if (idx > -1) {
        this.accessOrder.splice(idx, 1);
      }
    }
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  private loadFromDisk(): void {
    try {
      const indexPath = path.join(this.config.persistPath, 'cache-index.json');
      if (fs.existsSync(indexPath)) {
        const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        for (const entry of index.entries) {
          if (Date.now() < entry.expiresAt) {
            this.cache.set(entry.key, entry);
            this.accessOrder.push(entry.key);
          }
        }
        this.stats.entries = this.cache.size;
      }
    } catch {
      // Ignore load errors
    }
  }

  private persistEntry(entry: CacheEntry): void {
    try {
      if (!fs.existsSync(this.config.persistPath)) {
        fs.mkdirSync(this.config.persistPath, { recursive: true });
      }

      const indexPath = path.join(this.config.persistPath, 'cache-index.json');
      const index = { entries: Array.from(this.cache.values()) };
      fs.writeFileSync(indexPath, JSON.stringify(index));
    } catch {
      // Ignore persist errors
    }
  }

  private clearDisk(): void {
    try {
      const indexPath = path.join(this.config.persistPath, 'cache-index.json');
      if (fs.existsSync(indexPath)) {
        fs.unlinkSync(indexPath);
      }
    } catch {
      // Ignore clear errors
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let cacheInstance: MCPCache | null = null;

export function getMCPCache(config?: CacheConfig): MCPCache {
  if (!cacheInstance) {
    cacheInstance = new MCPCache(config);
  }
  return cacheInstance;
}

export function resetMCPCache(): void {
  if (cacheInstance) {
    cacheInstance.clear();
  }
  cacheInstance = null;
}

// ============================================================================
// Decorator-style cache wrapper
// ============================================================================

export function withCache<T = any>(
  server: MCPServerName,
  tool: string,
  params: Record<string, any>,
  fetcher: () => Promise<MCPCallResult<T>>
): Promise<MCPCallResult<T>> {
  return getMCPCache().wrap(server, tool, params, fetcher);
}
