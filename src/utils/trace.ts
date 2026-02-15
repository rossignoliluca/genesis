/**
 * Genesis — Distributed Tracing
 *
 * Lightweight trace context for correlating operations across modules.
 * Uses AsyncLocalStorage for automatic propagation through async chains.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operation: string;
  startTime: number;
  metadata: Record<string, unknown>;
}

const traceStorage = new AsyncLocalStorage<TraceContext>();

/**
 * Get current trace context (if any).
 */
export function getTraceContext(): TraceContext | undefined {
  return traceStorage.getStore();
}

/**
 * Get current trace ID (or 'no-trace').
 */
export function getTraceId(): string {
  return traceStorage.getStore()?.traceId || 'no-trace';
}

/**
 * Run a function within a new trace context.
 * Automatically propagates through async operations.
 */
export function withTrace<T>(
  operation: string,
  fn: () => T,
  metadata?: Record<string, unknown>,
): T {
  const parent = traceStorage.getStore();
  const ctx: TraceContext = {
    traceId: parent?.traceId || randomUUID().slice(0, 8),
    spanId: randomUUID().slice(0, 8),
    parentSpanId: parent?.spanId,
    operation,
    startTime: Date.now(),
    metadata: metadata || {},
  };

  return traceStorage.run(ctx, fn);
}

/**
 * Run an async function within a new trace context.
 */
export async function withTraceAsync<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>,
): Promise<T> {
  const parent = traceStorage.getStore();
  const ctx: TraceContext = {
    traceId: parent?.traceId || randomUUID().slice(0, 8),
    spanId: randomUUID().slice(0, 8),
    parentSpanId: parent?.spanId,
    operation,
    startTime: Date.now(),
    metadata: metadata || {},
  };

  return traceStorage.run(ctx, fn);
}
