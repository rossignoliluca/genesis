/**
 * Genesis Concurrency Module
 *
 * Advanced parallel execution primitives:
 * - Work-stealing scheduler with dynamic load balancing
 * - Adaptive batching based on throughput feedback
 * - Backpressure handling with bounded queues
 * - Circuit breakers for fault isolation
 * - Distributed tracing and observability
 *
 * @module concurrency
 */

// v33.0: Parallel Execution Engine
export {
  ParallelExecutionEngine,
  getParallelEngine,
  resetParallelEngine,
  // Types
  type ParallelEngineConfig,
  type TaskPriority,
  type TaskStatus,
  type CircuitState,
  type Task,
  type WorkerStats,
  type QueueStats,
  type CircuitBreaker,
  type BatchMetrics,
  type TraceSpan,
  type EngineStats,
} from './parallel-engine.js';
