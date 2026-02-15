/**
 * Graceful Shutdown Handler (v14.11)
 *
 * Ensures clean shutdown on SIGTERM/SIGINT:
 * - Completes in-flight requests
 * - Closes MCP connections
 * - Flushes logs and metrics
 * - Stops rate limiters
 */

type ShutdownHandler = () => Promise<void> | void;

const shutdownHandlers: ShutdownHandler[] = [];
let isShuttingDown = false;
let shutdownTimeout = 30000; // 30s max shutdown time

/**
 * Register a shutdown handler
 */
export function onShutdown(handler: ShutdownHandler): void {
  shutdownHandlers.push(handler);
}

/**
 * Set shutdown timeout
 */
export function setShutdownTimeout(ms: number): void {
  shutdownTimeout = ms;
}

/**
 * Check if shutdown is in progress
 */
export function isShutdownInProgress(): boolean {
  return isShuttingDown;
}

/**
 * Execute graceful shutdown
 */
async function executeShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    console.log(`[Shutdown] Already shutting down, ignoring ${signal}`);
    return;
  }

  isShuttingDown = true;
  console.log(`\n[Shutdown] Received ${signal}, starting graceful shutdown...`);

  // Set a hard timeout
  const forceExitTimer = setTimeout(() => {
    console.error('[Shutdown] Timeout exceeded, forcing exit');
    process.exit(1);
  }, shutdownTimeout);

  try {
    // Run all handlers in reverse order (LIFO)
    for (let i = shutdownHandlers.length - 1; i >= 0; i--) {
      try {
        await Promise.resolve(shutdownHandlers[i]());
      } catch (error) {
        console.error(`[Shutdown] Handler ${i} failed:`, error);
      }
    }

    console.log('[Shutdown] Graceful shutdown complete');
    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (error) {
    console.error('[Shutdown] Error during shutdown:', error);
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
}

/**
 * Install signal handlers (call once at startup)
 */
export function installShutdownHandlers(): void {
  process.on('SIGTERM', () => executeShutdown('SIGTERM'));
  process.on('SIGINT', () => executeShutdown('SIGINT'));

  // Handle uncaught errors gracefully
  process.on('uncaughtException', (error) => {
    console.error('[Fatal] Uncaught exception:', error);
    executeShutdown('uncaughtException').catch(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[Fatal] Unhandled rejection:', reason);
    // Don't exit on unhandled rejection, just log it
  });
}

/**
 * Register default Genesis shutdown handlers
 */
export function registerDefaultHandlers(): void {
  // Close MCP connections
  onShutdown(async () => {
    try {
      const { getMCPClient } = await import('../mcp/index.js');
      const client = getMCPClient();
      await client.close();
      console.log('[Shutdown] MCP connections closed');
    } catch (err) {
      // MCP module may not be loaded
      console.error('[Shutdown] Failed to close MCP connections:', err);
    }
  });

  // Stop rate limiters
  onShutdown(async () => {
    try {
      const { resetRateLimiter } = await import('./rate-limiter.js');
      resetRateLimiter();
      console.log('[Shutdown] Rate limiters stopped');
    } catch (err) {
      // Rate limiter may not be loaded
      console.error('[Shutdown] Failed to stop rate limiters:', err);
    }
  });

  // Flush alerter
  onShutdown(async () => {
    try {
      const { getAlerter } = await import('../observability/alerting.js');
      const alerter = getAlerter();
      await alerter.flush();
      alerter.stop();
      console.log('[Shutdown] Alerts flushed');
    } catch (err) {
      // Alerter may not be loaded
      console.error('[Shutdown] Failed to flush alerts:', err);
    }
  });
}
