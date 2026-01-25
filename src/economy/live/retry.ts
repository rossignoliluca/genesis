/**
 * Retry Utilities
 *
 * Retry logic with exponential backoff for critical operations.
 * Includes circuit breaker pattern and rate limiting.
 */

// ============================================================================
// Types
// ============================================================================

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Initial delay in ms (default: 1000) */
  initialDelayMs: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelayMs: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier: number;
  /** Add jitter to delays (default: true) */
  jitter: boolean;
  /** Timeout per attempt in ms (default: 30000) */
  timeoutMs: number;
  /** Function to determine if error is retryable */
  isRetryable?: (error: Error) => boolean;
  /** Callback on each retry */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalTimeMs: number;
}

export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold: number;
  /** Time to wait before trying again in ms (default: 60000) */
  resetTimeMs: number;
  /** Success count to close circuit (default: 2) */
  successThreshold: number;
}

type CircuitState = 'closed' | 'open' | 'half-open';

// ============================================================================
// Default Configurations
// ============================================================================

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  timeoutMs: 30000,
};

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeMs: 60000,
  successThreshold: 2,
};

// Common retryable errors
const RETRYABLE_ERROR_PATTERNS = [
  /timeout/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /socket hang up/i,
  /network/i,
  /429/i, // Rate limited
  /503/i, // Service unavailable
  /502/i, // Bad gateway
  /504/i, // Gateway timeout
  /nonce too low/i,
  /replacement transaction underpriced/i,
  /insufficient funds/i, // Might be temporary
];

// ============================================================================
// Retry Functions
// ============================================================================

/**
 * Retry an async function with exponential backoff.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<RetryResult<T>> {
  const cfg: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const startTime = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= cfg.maxRetries + 1; attempt++) {
    try {
      // Execute with timeout
      const data = await withTimeout(fn(), cfg.timeoutMs);

      return {
        success: true,
        data,
        attempts: attempt,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      const isRetryable = cfg.isRetryable
        ? cfg.isRetryable(lastError)
        : isDefaultRetryable(lastError);

      if (attempt > cfg.maxRetries || !isRetryable) {
        break;
      }

      // Calculate delay with exponential backoff
      let delay = Math.min(
        cfg.initialDelayMs * Math.pow(cfg.backoffMultiplier, attempt - 1),
        cfg.maxDelayMs
      );

      // Add jitter (±25%)
      if (cfg.jitter) {
        const jitterRange = delay * 0.25;
        delay += (Math.random() - 0.5) * 2 * jitterRange;
      }

      // Callback
      if (cfg.onRetry) {
        cfg.onRetry(attempt, lastError, delay);
      }

      console.log(`[Retry] Attempt ${attempt} failed: ${lastError.message}. Retrying in ${Math.round(delay)}ms...`);

      await sleep(delay);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: cfg.maxRetries + 1,
    totalTimeMs: Date.now() - startTime,
  };
}

/**
 * Simpler retry that throws on final failure.
 */
export async function retryOrThrow<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<T> {
  const result = await retry(fn, config);
  if (result.success) {
    return result.data!;
  }
  throw result.error;
}

/**
 * Check if an error is retryable by default.
 */
function isDefaultRetryable(error: Error): boolean {
  const message = error.message || '';
  return RETRYABLE_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

// ============================================================================
// Circuit Breaker
// ============================================================================

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private name: string;

  constructor(name: string, config?: Partial<CircuitBreakerConfig>) {
    this.name = name;
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  }

  /**
   * Execute a function through the circuit breaker.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeMs) {
        // Try half-open
        this.state = 'half-open';
        console.log(`[CircuitBreaker:${this.name}] Entering half-open state`);
      } else {
        throw new Error(`Circuit breaker '${this.name}' is open`);
      }
    }

    try {
      const result = await fn();

      // Success
      if (this.state === 'half-open') {
        this.successCount++;
        if (this.successCount >= this.config.successThreshold) {
          this.reset();
          console.log(`[CircuitBreaker:${this.name}] Circuit closed`);
        }
      } else {
        this.failureCount = 0; // Reset failures on success
      }

      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Record a failure.
   */
  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'open';
      console.log(`[CircuitBreaker:${this.name}] Circuit opened after ${this.failureCount} failures`);
    }
  }

  /**
   * Reset the circuit breaker.
   */
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
  }

  /**
   * Get current state.
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Check if circuit is open.
   */
  isOpen(): boolean {
    return this.state === 'open';
  }

  /**
   * Get stats.
   */
  getStats(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

// ============================================================================
// Rate Limiter
// ============================================================================

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private maxTokens: number;
  private refillRate: number; // Tokens per second

  constructor(maxRequests: number, perSeconds: number) {
    this.maxTokens = maxRequests;
    this.tokens = maxRequests;
    this.refillRate = maxRequests / perSeconds;
    this.lastRefill = Date.now();
  }

  /**
   * Check if request is allowed.
   */
  async acquire(): Promise<boolean> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Wait until request is allowed.
   */
  async wait(): Promise<void> {
    while (!(await this.acquire())) {
      const waitMs = Math.ceil((1 - this.tokens) / this.refillRate * 1000);
      await sleep(Math.min(waitMs, 1000));
    }
  }

  /**
   * Execute with rate limiting.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.wait();
    return fn();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  /**
   * Get available tokens.
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Add timeout to a promise.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message?: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(message || `Operation timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}

/**
 * Sleep for a duration.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Debounce a function.
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => fn(...args), delayMs);
  };
}

/**
 * Throttle a function.
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limitMs: number
): (...args: Parameters<T>) => void {
  let lastRun = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastRun >= limitMs) {
      lastRun = now;
      fn(...args);
    }
  };
}

// ============================================================================
// Pre-configured Instances
// ============================================================================

// Circuit breakers for external services
const circuitBreakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker(name, config));
  }
  return circuitBreakers.get(name)!;
}

// Rate limiters for APIs
const rateLimiters = new Map<string, RateLimiter>();

export function getRateLimiter(name: string, maxRequests: number, perSeconds: number): RateLimiter {
  const key = `${name}:${maxRequests}:${perSeconds}`;
  if (!rateLimiters.has(key)) {
    rateLimiters.set(key, new RateLimiter(maxRequests, perSeconds));
  }
  return rateLimiters.get(key)!;
}
