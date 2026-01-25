/**
 * Lifecycle Module
 *
 * Provides production-grade lifecycle management:
 * - Graceful shutdown with drain period
 * - Environment validation
 * - Rate limiting
 * - Resource tracking
 */

export {
  ShutdownManager,
  ShutdownPhase,
  ShutdownPriority,
  getShutdownManager,
  resetShutdownManager,
  shutdownHelpers,
  type ShutdownHook,
  type ShutdownConfig,
  type ShutdownResult,
} from './shutdown-manager.js';

export {
  RateLimiter,
  TokenBucket,
  getRateLimiter,
  resetRateLimiter,
  type RateLimiterConfig,
  type RateLimitResult,
} from './rate-limiter.js';

export {
  EnvValidator,
  validateEnv,
  type EnvSchema,
  type EnvValidationResult,
} from './env-validator.js';
