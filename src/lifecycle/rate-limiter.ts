/**
 * Rate Limiter with Token Bucket Algorithm
 *
 * Provides per-caller rate limiting to prevent abuse and ensure fair resource usage.
 * Uses the token bucket algorithm for smooth rate limiting with burst support.
 */

export interface RateLimiterConfig {
  // Maximum tokens in bucket (burst capacity)
  maxTokens: number;
  // Tokens added per second (sustained rate)
  refillRate: number;
  // Cost per request (default: 1)
  defaultCost: number;
  // TTL for inactive buckets in ms (default: 1 hour)
  bucketTtlMs: number;
  // Cleanup interval in ms (default: 5 minutes)
  cleanupIntervalMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  retryAfterMs?: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
  lastAccess: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxTokens: 100,           // 100 request burst
  refillRate: 10,           // 10 requests/second sustained
  defaultCost: 1,
  bucketTtlMs: 60 * 60 * 1000,      // 1 hour
  cleanupIntervalMs: 5 * 60 * 1000,  // 5 minutes
};

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    const newTokens = elapsed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }

  /**
   * Try to consume tokens
   */
  tryConsume(cost: number = 1): RateLimitResult {
    this.refill();

    if (this.tokens >= cost) {
      this.tokens -= cost;
      return {
        allowed: true,
        remaining: Math.floor(this.tokens),
        resetMs: this.calculateResetMs(),
      };
    }

    const deficit = cost - this.tokens;
    const retryAfterMs = Math.ceil((deficit / this.refillRate) * 1000);

    return {
      allowed: false,
      remaining: 0,
      resetMs: this.calculateResetMs(),
      retryAfterMs,
    };
  }

  /**
   * Get current token count
   */
  getTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  /**
   * Calculate ms until bucket is full
   */
  private calculateResetMs(): number {
    const deficit = this.maxTokens - this.tokens;
    if (deficit <= 0) return 0;
    return Math.ceil((deficit / this.refillRate) * 1000);
  }
}

export class RateLimiter {
  private buckets: Map<string, Bucket> = new Map();
  private config: RateLimiterConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanup();
  }

  /**
   * Check if a request is allowed and consume tokens if so
   */
  check(callerId: string, cost: number = this.config.defaultCost): RateLimitResult {
    const bucket = this.getOrCreateBucket(callerId);
    this.refillBucket(bucket);

    bucket.lastAccess = Date.now();

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        resetMs: this.calculateResetMs(bucket),
      };
    }

    const deficit = cost - bucket.tokens;
    const retryAfterMs = Math.ceil((deficit / this.config.refillRate) * 1000);

    return {
      allowed: false,
      remaining: 0,
      resetMs: this.calculateResetMs(bucket),
      retryAfterMs,
    };
  }

  /**
   * Check without consuming (peek)
   */
  peek(callerId: string): RateLimitResult {
    const bucket = this.buckets.get(callerId);
    if (!bucket) {
      return {
        allowed: true,
        remaining: this.config.maxTokens,
        resetMs: 0,
      };
    }

    this.refillBucket(bucket);

    return {
      allowed: bucket.tokens >= this.config.defaultCost,
      remaining: Math.floor(bucket.tokens),
      resetMs: this.calculateResetMs(bucket),
    };
  }

  /**
   * Reserve tokens for future use (e.g., for streaming requests)
   */
  reserve(callerId: string, cost: number): { success: boolean; release: () => void } {
    const result = this.check(callerId, cost);
    if (!result.allowed) {
      return { success: false, release: () => {} };
    }

    // Return a release function that adds tokens back
    return {
      success: true,
      release: () => {
        const bucket = this.buckets.get(callerId);
        if (bucket) {
          bucket.tokens = Math.min(this.config.maxTokens, bucket.tokens + cost);
        }
      },
    };
  }

  /**
   * Get rate limit headers for HTTP responses
   */
  getHeaders(callerId: string): Record<string, string> {
    const result = this.peek(callerId);
    return {
      'X-RateLimit-Limit': String(this.config.maxTokens),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000 + result.resetMs / 1000)),
    };
  }

  /**
   * Reset a specific caller's bucket
   */
  reset(callerId: string): void {
    this.buckets.delete(callerId);
  }

  /**
   * Reset all buckets
   */
  resetAll(): void {
    this.buckets.clear();
  }

  /**
   * Get stats about rate limiter state
   */
  getStats(): {
    activeBuckets: number;
    totalTokensRemaining: number;
    oldestBucket: number | null;
  } {
    let totalTokens = 0;
    let oldestAccess = Infinity;

    for (const bucket of this.buckets.values()) {
      this.refillBucket(bucket);
      totalTokens += bucket.tokens;
      if (bucket.lastAccess < oldestAccess) {
        oldestAccess = bucket.lastAccess;
      }
    }

    return {
      activeBuckets: this.buckets.size,
      totalTokensRemaining: Math.floor(totalTokens),
      oldestBucket: oldestAccess === Infinity ? null : oldestAccess,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RateLimiterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Stop cleanup timer (for shutdown)
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  private getOrCreateBucket(callerId: string): Bucket {
    let bucket = this.buckets.get(callerId);
    if (!bucket) {
      bucket = {
        tokens: this.config.maxTokens,
        lastRefill: Date.now(),
        lastAccess: Date.now(),
      };
      this.buckets.set(callerId, bucket);
    }
    return bucket;
  }

  private refillBucket(bucket: Bucket): void {
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000; // seconds
    const newTokens = elapsed * this.config.refillRate;
    bucket.tokens = Math.min(this.config.maxTokens, bucket.tokens + newTokens);
    bucket.lastRefill = now;
  }

  private calculateResetMs(bucket: Bucket): number {
    const deficit = this.config.maxTokens - bucket.tokens;
    if (deficit <= 0) return 0;
    return Math.ceil((deficit / this.config.refillRate) * 1000);
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const expireThreshold = now - this.config.bucketTtlMs;

      for (const [callerId, bucket] of this.buckets.entries()) {
        if (bucket.lastAccess < expireThreshold) {
          this.buckets.delete(callerId);
        }
      }
    }, this.config.cleanupIntervalMs);

    // Don't prevent process exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }
}

// Singleton instance
let globalRateLimiter: RateLimiter | null = null;

export function getRateLimiter(config?: Partial<RateLimiterConfig>): RateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new RateLimiter(config);
  }
  return globalRateLimiter;
}

export function resetRateLimiter(): void {
  if (globalRateLimiter) {
    globalRateLimiter.stop();
  }
  globalRateLimiter = null;
}
