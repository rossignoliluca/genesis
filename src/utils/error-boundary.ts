/**
 * Genesis — Error Boundary Utilities
 *
 * Wraps critical operations to prevent cascading failures.
 * Logs errors with context and returns fallback values.
 */

import { createLogger } from './logger.js';

const log = createLogger('ErrorBoundary');

/**
 * Execute an async operation with error boundary.
 * Returns fallback value on failure instead of throwing.
 */
export async function withErrorBoundary<T>(
  operation: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    log.error(`${operation} failed`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join(' ') : undefined,
    });
    return fallback;
  }
}

/**
 * Execute a sync operation with error boundary.
 */
export function withErrorBoundarySync<T>(
  operation: string,
  fn: () => T,
  fallback: T,
): T {
  try {
    return fn();
  } catch (error) {
    log.error(`${operation} failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

/**
 * Wrap a module initialization function.
 * If it fails, returns null and logs the error — doesn't crash the system.
 */
export async function safeModuleInit<T>(
  moduleName: string,
  initFn: () => Promise<T>,
): Promise<T | null> {
  try {
    const instance = await initFn();
    log.info(`${moduleName} initialized`);
    return instance;
  } catch (error) {
    log.error(`${moduleName} initialization failed — module disabled`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
