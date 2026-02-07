/**
 * Global Shutdown Manager
 *
 * Provides centralized, orderly shutdown coordination for all Genesis services.
 * Implements graceful drain period, timeout enforcement, and service health checks.
 */

import { EventEmitter } from 'events';

// Shutdown phases (executed in order)
export enum ShutdownPhase {
  DRAIN = 'drain',           // Stop accepting new work
  QUIESCE = 'quiesce',       // Wait for in-flight work to complete
  CLEANUP = 'cleanup',       // Release resources
  TERMINATE = 'terminate',   // Final shutdown
}

// Priority levels for shutdown hooks (lower = earlier)
export enum ShutdownPriority {
  CRITICAL = 0,     // Must shut down first (e.g., stop accepting requests)
  HIGH = 10,        // Important services (e.g., MCP connections)
  NORMAL = 50,      // Standard services
  LOW = 90,         // Can wait (e.g., metrics, logging)
  FINAL = 100,      // Last to shut down (e.g., persistence)
}

export interface ShutdownHook {
  name: string;
  priority: ShutdownPriority;
  phase: ShutdownPhase;
  handler: () => Promise<void>;
  timeout?: number;  // Per-hook timeout in ms
}

export interface ShutdownConfig {
  gracePeriodMs: number;      // Time to wait for in-flight work (default: 30s)
  forceTimeoutMs: number;     // Maximum total shutdown time (default: 60s)
  logProgress: boolean;       // Log each phase/hook
}

export interface ShutdownResult {
  success: boolean;
  duration: number;
  phases: PhaseResult[];
  errors: ShutdownError[];
}

interface PhaseResult {
  phase: ShutdownPhase;
  duration: number;
  hooks: HookResult[];
}

interface HookResult {
  name: string;
  success: boolean;
  duration: number;
  error?: string;
}

interface ShutdownError {
  hook: string;
  phase: ShutdownPhase;
  error: string;
}

const DEFAULT_CONFIG: ShutdownConfig = {
  gracePeriodMs: 30_000,
  forceTimeoutMs: 60_000,
  logProgress: true,
};

export class ShutdownManager extends EventEmitter {
  private hooks: ShutdownHook[] = [];
  private config: ShutdownConfig;
  private isShuttingDown = false;
  private shutdownPromise: Promise<ShutdownResult> | null = null;
  private inFlightCount = 0;
  private inFlightDrainResolve: (() => void) | null = null;

  constructor(config: Partial<ShutdownConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register a shutdown hook
   */
  register(hook: ShutdownHook): void {
    if (this.isShuttingDown) {
      throw new Error('Cannot register hooks during shutdown');
    }
    this.hooks.push(hook);
    this.hooks.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Convenience method to register a cleanup function
   */
  onShutdown(
    name: string,
    handler: () => Promise<void>,
    options: { priority?: ShutdownPriority; phase?: ShutdownPhase; timeout?: number } = {}
  ): void {
    this.register({
      name,
      handler,
      priority: options.priority ?? ShutdownPriority.NORMAL,
      phase: options.phase ?? ShutdownPhase.CLEANUP,
      timeout: options.timeout,
    });
  }

  /**
   * Track in-flight work for graceful drain
   */
  trackRequest(): () => void {
    if (this.isShuttingDown) {
      throw new Error('Service is shutting down - no new requests accepted');
    }
    this.inFlightCount++;
    return () => {
      this.inFlightCount--;
      if (this.inFlightCount === 0 && this.inFlightDrainResolve) {
        this.inFlightDrainResolve();
        this.inFlightDrainResolve = null;
      }
    };
  }

  /**
   * Check if shutdown is in progress
   */
  isInShutdown(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Get count of in-flight requests
   */
  getInFlightCount(): number {
    return this.inFlightCount;
  }

  /**
   * Install signal handlers for graceful shutdown
   */
  installSignalHandlers(): void {
    const handleSignal = (signal: string) => {
      if (this.config.logProgress) {
        console.log(`[ShutdownManager] Received ${signal}, initiating graceful shutdown...`);
      }
      this.shutdown().then((result) => {
        if (this.config.logProgress) {
          console.log(`[ShutdownManager] Shutdown complete in ${result.duration}ms`);
          if (result.errors.length > 0) {
            console.error(`[ShutdownManager] Errors during shutdown:`, result.errors);
          }
        }
        process.exit(result.success ? 0 : 1);
      });
    };

    process.on('SIGTERM', () => handleSignal('SIGTERM'));
    process.on('SIGINT', () => handleSignal('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('[ShutdownManager] Uncaught exception:', error);
      this.shutdown().finally(() => process.exit(1));
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('[ShutdownManager] Unhandled rejection at:', promise, 'reason:', reason);
      // Log but don't exit - let the application continue if possible
      this.emit('unhandledRejection', { reason, promise });
    });
  }

  /**
   * Initiate graceful shutdown
   */
  async shutdown(): Promise<ShutdownResult> {
    // Ensure only one shutdown runs
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.isShuttingDown = true;
    this.emit('shutdownStarted');

    this.shutdownPromise = this.executeShutdown();
    return this.shutdownPromise;
  }

  private async executeShutdown(): Promise<ShutdownResult> {
    const startTime = Date.now();
    const errors: ShutdownError[] = [];
    const phases: PhaseResult[] = [];

    // v16.1.2: Fixed force timeout - now resolves with timeout marker instead of rejecting
    // This allows Promise.race() to properly return timeout result
    let forceTimeoutTriggered = false;
    const forceTimeoutPromise = new Promise<{ timeout: true }>((resolve) => {
      setTimeout(() => {
        forceTimeoutTriggered = true;
        resolve({ timeout: true });
      }, this.config.forceTimeoutMs);
    });

    try {
      // Execute each phase in order
      for (const phase of Object.values(ShutdownPhase)) {
        const phaseResult = await Promise.race([
          this.executePhase(phase, errors),
          forceTimeoutPromise.then(() => ({
            phase,
            duration: Date.now() - startTime,
            hooks: [],
            timedOut: true,
          })),
        ]);
        phases.push(phaseResult as PhaseResult);

        // v16.1.2: Check if force timeout was triggered
        if (forceTimeoutTriggered) {
          if (this.config.logProgress) {
            console.warn('[ShutdownManager] Force timeout reached at phase:', phase);
          }
          break; // Exit phase loop on timeout
        }

        // Special handling for drain phase - wait for in-flight
        if (phase === ShutdownPhase.DRAIN) {
          await this.waitForDrain();
        }
      }
    } catch (error) {
      if (this.config.logProgress) {
        console.error('[ShutdownManager] Unexpected error during shutdown:', error);
      }
    }

    const duration = Date.now() - startTime;
    this.emit('shutdownCompleted', { duration, errors });

    return {
      success: errors.length === 0,
      duration,
      phases,
      errors,
    };
  }

  private async executePhase(phase: ShutdownPhase, errors: ShutdownError[]): Promise<PhaseResult> {
    const phaseStart = Date.now();
    const phaseHooks = this.hooks.filter(h => h.phase === phase);
    const hookResults: HookResult[] = [];

    if (this.config.logProgress) {
      console.log(`[ShutdownManager] Starting phase: ${phase} (${phaseHooks.length} hooks)`);
    }

    for (const hook of phaseHooks) {
      const hookStart = Date.now();
      try {
        const timeout = hook.timeout ?? 10_000; // Default 10s per hook
        await Promise.race([
          hook.handler(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Hook timeout: ${hook.name}`)), timeout)
          ),
        ]);

        hookResults.push({
          name: hook.name,
          success: true,
          duration: Date.now() - hookStart,
        });

        if (this.config.logProgress) {
          console.log(`[ShutdownManager]   ✓ ${hook.name} (${Date.now() - hookStart}ms)`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        hookResults.push({
          name: hook.name,
          success: false,
          duration: Date.now() - hookStart,
          error: errorMessage,
        });
        errors.push({
          hook: hook.name,
          phase,
          error: errorMessage,
        });

        if (this.config.logProgress) {
          console.error(`[ShutdownManager]   ✗ ${hook.name}: ${errorMessage}`);
        }
      }
    }

    return {
      phase,
      duration: Date.now() - phaseStart,
      hooks: hookResults,
    };
  }

  private async waitForDrain(): Promise<void> {
    if (this.inFlightCount === 0) {
      return;
    }

    if (this.config.logProgress) {
      console.log(`[ShutdownManager] Waiting for ${this.inFlightCount} in-flight requests...`);
    }

    return new Promise((resolve) => {
      this.inFlightDrainResolve = resolve;

      // Also resolve after grace period
      setTimeout(() => {
        if (this.inFlightDrainResolve) {
          if (this.config.logProgress) {
            console.log(`[ShutdownManager] Grace period expired with ${this.inFlightCount} requests remaining`);
          }
          this.inFlightDrainResolve();
          this.inFlightDrainResolve = null;
        }
      }, this.config.gracePeriodMs);
    });
  }

  /**
   * Get registered hooks (for debugging)
   */
  getHooks(): ReadonlyArray<ShutdownHook> {
    return [...this.hooks];
  }

  /**
   * Clear all hooks (for testing)
   */
  clearHooks(): void {
    this.hooks = [];
  }
}

// Singleton instance
let globalShutdownManager: ShutdownManager | null = null;

export function getShutdownManager(config?: Partial<ShutdownConfig>): ShutdownManager {
  if (!globalShutdownManager) {
    globalShutdownManager = new ShutdownManager(config);
  }
  return globalShutdownManager;
}

export function resetShutdownManager(): void {
  globalShutdownManager = null;
}

// Helper to create common shutdown hooks
export const shutdownHelpers = {
  /**
   * Create hook to clear an interval
   */
  clearInterval(name: string, intervalId: NodeJS.Timeout | null): ShutdownHook {
    return {
      name: `clear-interval-${name}`,
      priority: ShutdownPriority.LOW,
      phase: ShutdownPhase.CLEANUP,
      handler: async () => {
        if (intervalId) {
          clearInterval(intervalId);
        }
      },
    };
  },

  /**
   * Create hook to close a stream
   */
  closeStream(name: string, stream: { destroy?: () => void; end?: () => void }): ShutdownHook {
    return {
      name: `close-stream-${name}`,
      priority: ShutdownPriority.NORMAL,
      phase: ShutdownPhase.CLEANUP,
      handler: async () => {
        if (stream.end) {
          stream.end();
        } else if (stream.destroy) {
          stream.destroy();
        }
      },
    };
  },

  /**
   * Create hook to stop an EventEmitter-based service
   */
  stopService(name: string, service: { stop?: () => Promise<void> | void }): ShutdownHook {
    return {
      name: `stop-service-${name}`,
      priority: ShutdownPriority.NORMAL,
      phase: ShutdownPhase.QUIESCE,
      handler: async () => {
        if (service.stop) {
          await service.stop();
        }
      },
    };
  },

  /**
   * Create hook to abort an AbortController
   */
  abort(name: string, controller: AbortController): ShutdownHook {
    return {
      name: `abort-${name}`,
      priority: ShutdownPriority.CRITICAL,
      phase: ShutdownPhase.DRAIN,
      handler: async () => {
        controller.abort();
      },
    };
  },
};
