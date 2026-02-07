/**
 * Connector Utilities
 *
 * Shared utilities for rate limiting, circuit breaking, and error handling.
 */

import type { RateLimitConfig, ConnectorHealth, Platform } from '../types.js';

/**
 * Rate limiter with sliding window algorithm
 */
export class RateLimiter {
  private requests: number[] = [];
  private dailyRequests: number[] = [];
  private readonly config: RateLimitConfig;
  private readonly name: string;

  constructor(name: string, config: RateLimitConfig) {
    this.name = name;
    this.config = config;
  }

  canMakeRequest(): boolean {
    this.cleanupOldRequests();

    if (this.requests.length >= this.config.requests) {
      return false;
    }

    if (this.config.dailyLimit) {
      this.cleanupDailyRequests();
      if (this.dailyRequests.length >= this.config.dailyLimit) {
        return false;
      }
    }

    return true;
  }

  recordRequest(): void {
    const now = Date.now();
    this.requests.push(now);
    this.dailyRequests.push(now);
  }

  getRemainingRequests(): number {
    this.cleanupOldRequests();
    return Math.max(0, this.config.requests - this.requests.length);
  }

  getRetryAfter(): number {
    if (this.canMakeRequest()) return 0;
    this.cleanupOldRequests();
    if (this.requests.length === 0) return 0;
    return Math.max(0, this.requests[0] + this.config.windowMs - Date.now());
  }

  private cleanupOldRequests(): void {
    const cutoff = Date.now() - this.config.windowMs;
    this.requests = this.requests.filter((time) => time > cutoff);
  }

  private cleanupDailyRequests(): void {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    this.dailyRequests = this.dailyRequests.filter((time) => time >= dayStart.getTime());
  }
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
}

/**
 * Circuit breaker for fault tolerance
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly name: string;

  constructor(
    name: string,
    config: CircuitBreakerConfig = { failureThreshold: 5, successThreshold: 2, timeout: 30000 },
  ) {
    this.name = name;
    this.config = config;
  }

  canRequest(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.config.timeout) {
        this.state = 'half-open';
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = 'closed';
        this.failures = 0;
        this.successes = 0;
      }
    } else {
      this.failures = 0;
    }
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.state = 'open';
      this.successes = 0;
    } else if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
  }
}

/**
 * Execute with rate limiting and circuit breaker protection
 */
export async function executeWithProtection<T>(
  rateLimiter: RateLimiter,
  circuitBreaker: CircuitBreaker,
  operation: () => Promise<T>,
  operationName: string,
): Promise<T> {
  if (!circuitBreaker.canRequest()) {
    throw new Error(`Circuit breaker is open for ${operationName}`);
  }

  if (!rateLimiter.canMakeRequest()) {
    const retryAfter = rateLimiter.getRetryAfter();
    throw new RateLimitError(`Rate limit exceeded for ${operationName}`, retryAfter);
  }

  try {
    rateLimiter.recordRequest();
    const result = await operation();
    circuitBreaker.recordSuccess();
    return result;
  } catch (error) {
    circuitBreaker.recordFailure();
    throw error;
  }
}

export class RateLimitError extends Error {
  readonly retryAfter: number;
  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class ConnectorError extends Error {
  readonly platform: Platform;
  readonly code: string;
  readonly retryable: boolean;

  constructor(platform: Platform, message: string, code: string, retryable = false) {
    super(message);
    this.name = 'ConnectorError';
    this.platform = platform;
    this.code = code;
    this.retryable = retryable;
  }
}

export function buildHealthResponse(
  platform: Platform,
  healthy: boolean,
  rateLimitRemaining?: number,
  error?: string,
): ConnectorHealth {
  return { platform, healthy, lastChecked: new Date(), rateLimitRemaining, error };
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === maxRetries) break;
      if (error instanceof ConnectorError && !error.retryable) throw error;
      if (error instanceof RateLimitError) {
        await sleep(error.retryAfter);
        continue;
      }
      await sleep(baseDelay * 2 ** attempt);
    }
  }
  throw lastError;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function splitIntoChunks(text: string, maxLength: number, preserveWords = true): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitIndex = maxLength;
    if (preserveWords) {
      const lastSpace = remaining.lastIndexOf(' ', maxLength);
      if (lastSpace > maxLength * 0.5) splitIndex = lastSpace;
    }

    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }

  return chunks;
}

export function extractHashtags(text: string): string[] {
  const matches = text.matchAll(/#(\w+)/g);
  return Array.from(matches, (m) => m[1]);
}

export function addThreadNumbering(
  chunks: string[],
  format: 'fraction' | 'counter' = 'fraction',
): string[] {
  const total = chunks.length;
  return chunks.map((chunk, index) => {
    const number = index + 1;
    const suffix = format === 'fraction' ? ` (${number}/${total})` : ` [${number}]`;
    return chunk + suffix;
  });
}
