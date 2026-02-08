/**
 * Genesis v33.0 — Parallel Execution Engine
 *
 * Advanced concurrency system providing:
 * - Work-stealing scheduler with dynamic load balancing
 * - Adaptive batching based on throughput feedback
 * - Backpressure handling with bounded queues
 * - Circuit breakers for fault isolation
 * - Pipeline fusion for overlapping execution
 * - Unified resource management across all executors
 * - Distributed tracing and observability
 *
 * Inspired by:
 * - Fork/Join framework (Java)
 * - Tokio runtime (Rust)
 * - Grand Central Dispatch (Apple)
 * - Reactive Streams backpressure
 *
 * @module concurrency/parallel-engine
 * @version 33.0.0
 */

import { EventEmitter } from 'events';
import { getEventBus } from '../bus/index.js';

// ============================================================================
// Types
// ============================================================================

export interface ParallelEngineConfig {
  /** Maximum concurrent workers across all queues */
  maxWorkers: number;
  /** Number of work queues (for work-stealing) */
  numQueues: number;
  /** Maximum queue depth before backpressure */
  maxQueueDepth: number;
  /** Work-stealing threshold (steal when own queue < threshold) */
  stealThreshold: number;
  /** Batch size adaptation enabled */
  adaptiveBatching: boolean;
  /** Initial batch size for adaptive batching */
  initialBatchSize: number;
  /** Circuit breaker failure threshold */
  circuitBreakerThreshold: number;
  /** Circuit breaker reset timeout (ms) */
  circuitBreakerTimeout: number;
  /** Enable distributed tracing */
  tracing: boolean;
}

export type TaskPriority = 'critical' | 'high' | 'normal' | 'low' | 'background';
export type TaskStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type CircuitState = 'closed' | 'open' | 'half-open';

export interface Task<T = unknown> {
  id: string;
  name: string;
  priority: TaskPriority;
  status: TaskStatus;
  execute: () => Promise<T>;

  // Dependencies
  dependencies: string[];
  dependents: string[];

  // Timing
  createdAt: number;
  queuedAt?: number;
  startedAt?: number;
  completedAt?: number;
  deadline?: number;

  // Execution
  retries: number;
  maxRetries: number;
  timeout: number;
  workerId?: number;

  // Result
  result?: T;
  error?: Error;

  // Tracing
  traceId?: string;
  parentSpanId?: string;
  spanId?: string;

  // Metadata
  tags: string[];
  context: Record<string, unknown>;
}

export interface WorkerStats {
  id: number;
  tasksCompleted: number;
  tasksFailed: number;
  totalDuration: number;
  avgLatency: number;
  idleTime: number;
  lastActive: number;
  stolen: number;
  donated: number;
}

export interface QueueStats {
  id: number;
  depth: number;
  enqueued: number;
  dequeued: number;
  stolen: number;
  backpressure: boolean;
}

export interface CircuitBreaker {
  name: string;
  state: CircuitState;
  failures: number;
  lastFailure: number;
  lastSuccess: number;
  halfOpenAttempts: number;
}

export interface BatchMetrics {
  domain: string;
  currentSize: number;
  avgThroughput: number;
  avgLatency: number;
  successRate: number;
  history: Array<{ size: number; throughput: number; latency: number }>;
}

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operation: string;
  startTime: number;
  endTime?: number;
  status: 'ok' | 'error';
  tags: Record<string, string>;
  events: Array<{ name: string; time: number; attributes?: Record<string, unknown> }>;
}

export interface EngineStats {
  running: boolean;
  totalTasks: number;
  pendingTasks: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgLatency: number;
  throughput: number;
  workers: WorkerStats[];
  queues: QueueStats[];
  circuits: CircuitBreaker[];
  backpressure: boolean;
}

// ============================================================================
// Priority Values
// ============================================================================

const PRIORITY_VALUES: Record<TaskPriority, number> = {
  critical: 5,
  high: 4,
  normal: 3,
  low: 2,
  background: 1,
};

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ParallelEngineConfig = {
  maxWorkers: 16,
  numQueues: 4,
  maxQueueDepth: 1000,
  stealThreshold: 5,
  adaptiveBatching: true,
  initialBatchSize: 5,
  circuitBreakerThreshold: 5,
  circuitBreakerTimeout: 30000,
  tracing: true,
};

// ============================================================================
// Work-Stealing Queue
// ============================================================================

class WorkStealingQueue<T extends Task> {
  private items: T[] = [];
  private stats: QueueStats;
  private readonly maxDepth: number;

  constructor(id: number, maxDepth: number) {
    this.maxDepth = maxDepth;
    this.stats = {
      id,
      depth: 0,
      enqueued: 0,
      dequeued: 0,
      stolen: 0,
      backpressure: false,
    };
  }

  push(item: T): boolean {
    if (this.items.length >= this.maxDepth) {
      this.stats.backpressure = true;
      return false;  // Backpressure
    }

    // Insert by priority (higher priority first)
    const priority = PRIORITY_VALUES[item.priority];
    let insertIdx = this.items.findIndex(
      i => PRIORITY_VALUES[i.priority] < priority
    );
    if (insertIdx === -1) insertIdx = this.items.length;

    this.items.splice(insertIdx, 0, item);
    this.stats.enqueued++;
    this.stats.depth = this.items.length;
    this.stats.backpressure = false;
    return true;
  }

  pop(): T | undefined {
    const item = this.items.shift();
    if (item) {
      this.stats.dequeued++;
      this.stats.depth = this.items.length;
    }
    return item;
  }

  // Steal from tail (opposite end from pop)
  steal(): T | undefined {
    const item = this.items.pop();
    if (item) {
      this.stats.stolen++;
      this.stats.depth = this.items.length;
    }
    return item;
  }

  peek(): T | undefined {
    return this.items[0];
  }

  size(): number {
    return this.items.length;
  }

  getStats(): QueueStats {
    return { ...this.stats };
  }

  clear(): void {
    this.items = [];
    this.stats.depth = 0;
  }
}

// ============================================================================
// Worker
// ============================================================================

class Worker extends EventEmitter {
  private readonly id: number;
  private readonly queue: WorkStealingQueue<Task>;
  private readonly otherQueues: WorkStealingQueue<Task>[];
  private readonly stealThreshold: number;
  private running = false;
  private currentTask: Task | null = null;
  private stats: WorkerStats;

  constructor(
    id: number,
    queue: WorkStealingQueue<Task>,
    otherQueues: WorkStealingQueue<Task>[],
    stealThreshold: number,
  ) {
    super();
    this.id = id;
    this.queue = queue;
    this.otherQueues = otherQueues;
    this.stealThreshold = stealThreshold;
    this.stats = {
      id,
      tasksCompleted: 0,
      tasksFailed: 0,
      totalDuration: 0,
      avgLatency: 0,
      idleTime: 0,
      lastActive: Date.now(),
      stolen: 0,
      donated: 0,
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    while (this.running) {
      const task = this.getNextTask();

      if (task) {
        await this.executeTask(task);
      } else {
        // Idle - wait a bit before checking again
        const idleStart = Date.now();
        await this.sleep(10);
        this.stats.idleTime += Date.now() - idleStart;
      }
    }
  }

  stop(): void {
    this.running = false;
  }

  private getNextTask(): Task | undefined {
    // First, try own queue
    let task = this.queue.pop();
    if (task) return task;

    // Work stealing: if own queue is empty, steal from others
    if (this.queue.size() < this.stealThreshold) {
      // Find queue with most work
      const sorted = [...this.otherQueues]
        .filter(q => q !== this.queue)
        .sort((a, b) => b.size() - a.size());

      for (const otherQueue of sorted) {
        if (otherQueue.size() > this.stealThreshold) {
          task = otherQueue.steal();
          if (task) {
            this.stats.stolen++;
            return task;
          }
        }
      }
    }

    return undefined;
  }

  private async executeTask(task: Task): Promise<void> {
    this.currentTask = task;
    task.status = 'running';
    task.startedAt = Date.now();
    task.workerId = this.id;
    this.stats.lastActive = Date.now();

    this.emit('taskStarted', task);

    try {
      // Execute with timeout
      const result = await this.withTimeout(
        task.execute(),
        task.timeout,
        `Task ${task.id} timed out after ${task.timeout}ms`
      );

      task.result = result;
      task.status = 'completed';
      task.completedAt = Date.now();
      this.stats.tasksCompleted++;

      const duration = task.completedAt - task.startedAt;
      this.stats.totalDuration += duration;
      this.stats.avgLatency = this.stats.totalDuration /
        (this.stats.tasksCompleted + this.stats.tasksFailed);

      this.emit('taskCompleted', task);
    } catch (error) {
      task.error = error instanceof Error ? error : new Error(String(error));
      task.status = 'failed';
      task.completedAt = Date.now();
      this.stats.tasksFailed++;

      this.emit('taskFailed', task);
    }

    this.currentTask = null;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message: string,
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), ms);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats(): WorkerStats {
    return { ...this.stats };
  }

  getCurrentTask(): Task | null {
    return this.currentTask;
  }
}

// ============================================================================
// Parallel Execution Engine
// ============================================================================

export class ParallelExecutionEngine extends EventEmitter {
  private config: ParallelEngineConfig;
  private queues: WorkStealingQueue<Task>[] = [];
  private workers: Worker[] = [];
  private tasks: Map<string, Task> = new Map();
  private circuits: Map<string, CircuitBreaker> = new Map();
  private batchMetrics: Map<string, BatchMetrics> = new Map();
  private traces: Map<string, TraceSpan[]> = new Map();
  private running = false;
  private taskIdCounter = 0;
  private stats = {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    throughputWindow: [] as number[],
  };

  constructor(config?: Partial<ParallelEngineConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initialize();
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  private initialize(): void {
    // Create work-stealing queues
    for (let i = 0; i < this.config.numQueues; i++) {
      this.queues.push(new WorkStealingQueue(i, this.config.maxQueueDepth));
    }

    // Create workers
    for (let i = 0; i < this.config.maxWorkers; i++) {
      const queueIdx = i % this.config.numQueues;
      const worker = new Worker(
        i,
        this.queues[queueIdx],
        this.queues,
        this.config.stealThreshold,
      );

      // Wire worker events
      worker.on('taskStarted', (task: Task) => this.onTaskStarted(task));
      worker.on('taskCompleted', (task: Task) => this.onTaskCompleted(task));
      worker.on('taskFailed', (task: Task) => this.onTaskFailed(task));

      this.workers.push(worker);
    }
  }

  // ===========================================================================
  // Task Submission
  // ===========================================================================

  submit<T>(params: {
    name: string;
    execute: () => Promise<T>;
    priority?: TaskPriority;
    dependencies?: string[];
    timeout?: number;
    maxRetries?: number;
    deadline?: number;
    tags?: string[];
    context?: Record<string, unknown>;
    circuit?: string;
    traceId?: string;
    parentSpanId?: string;
  }): Task<T> {
    const id = `task-${++this.taskIdCounter}-${Date.now().toString(36)}`;
    const now = Date.now();

    // Check circuit breaker if specified
    if (params.circuit) {
      const circuit = this.getOrCreateCircuit(params.circuit);
      if (circuit.state === 'open') {
        const task: Task<T> = {
          id,
          name: params.name,
          priority: params.priority || 'normal',
          status: 'failed',
          execute: params.execute,
          dependencies: params.dependencies || [],
          dependents: [],
          createdAt: now,
          completedAt: now,
          retries: 0,
          maxRetries: 0,
          timeout: params.timeout || 30000,
          tags: params.tags || [],
          context: params.context || {},
          error: new Error(`Circuit breaker '${params.circuit}' is open`),
        };
        this.tasks.set(id, task);
        return task;
      }
    }

    // Create tracing span
    let spanId: string | undefined;
    if (this.config.tracing) {
      spanId = this.createSpan(
        params.traceId || `trace-${id}`,
        params.name,
        params.parentSpanId,
      );
    }

    const task: Task<T> = {
      id,
      name: params.name,
      priority: params.priority || 'normal',
      status: 'pending',
      execute: params.execute,
      dependencies: params.dependencies || [],
      dependents: [],
      createdAt: now,
      retries: 0,
      maxRetries: params.maxRetries ?? 3,
      timeout: params.timeout || 30000,
      deadline: params.deadline,
      tags: params.tags || [],
      context: { ...params.context, circuit: params.circuit },
      traceId: params.traceId || `trace-${id}`,
      parentSpanId: params.parentSpanId,
      spanId,
    };

    this.tasks.set(id, task);
    this.stats.totalTasks++;

    // Check if dependencies are satisfied
    if (task.dependencies.length === 0) {
      this.enqueue(task);
    } else {
      // Register as dependent
      for (const depId of task.dependencies) {
        const depTask = this.tasks.get(depId);
        if (depTask) {
          depTask.dependents.push(id);
        }
      }
      // Check if dependencies already completed
      this.checkDependencies(task);
    }

    return task;
  }

  /**
   * Submit a batch of tasks with adaptive sizing
   */
  submitBatch<T>(
    domain: string,
    items: Array<{
      name: string;
      execute: () => Promise<T>;
      priority?: TaskPriority;
    }>,
  ): Task<T>[] {
    const metrics = this.getOrCreateBatchMetrics(domain);
    const batchSize = this.config.adaptiveBatching
      ? metrics.currentSize
      : this.config.initialBatchSize;

    const tasks: Task<T>[] = [];
    const batches = this.chunk(items, batchSize);

    for (const batch of batches) {
      for (const item of batch) {
        tasks.push(this.submit({
          name: item.name,
          execute: item.execute,
          priority: item.priority,
          tags: ['batch', domain],
          context: { batchDomain: domain },
        }));
      }
    }

    return tasks;
  }

  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  // ===========================================================================
  // Queue Management
  // ===========================================================================

  private enqueue(task: Task): boolean {
    task.status = 'queued';
    task.queuedAt = Date.now();

    // Round-robin queue selection with priority adjustment
    const baseQueue = this.taskIdCounter % this.config.numQueues;
    const priorityOffset = PRIORITY_VALUES[task.priority] % this.config.numQueues;
    const queueIdx = (baseQueue + priorityOffset) % this.config.numQueues;

    const success = this.queues[queueIdx].push(task);

    if (!success) {
      // Backpressure - try other queues
      for (let i = 0; i < this.config.numQueues; i++) {
        if (i !== queueIdx && this.queues[i].push(task)) {
          return true;
        }
      }
      // All queues full - reject
      task.status = 'failed';
      task.error = new Error('All queues at capacity - backpressure');
      this.emit('backpressure', { task, queues: this.getQueueStats() });
      return false;
    }

    return true;
  }

  private checkDependencies(task: Task): void {
    const allSatisfied = task.dependencies.every(depId => {
      const dep = this.tasks.get(depId);
      return dep && dep.status === 'completed';
    });

    if (allSatisfied) {
      this.enqueue(task);
    }
  }

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  private onTaskStarted(task: Task): void {
    if (this.config.tracing && task.spanId && task.traceId) {
      this.addSpanEvent(task.traceId, task.spanId, 'started', {
        workerId: task.workerId,
      });
    }
    this.emit('taskStarted', task);
    this.publishEvent('task.started', { taskId: task.id, name: task.name });
  }

  private onTaskCompleted(task: Task): void {
    this.stats.completedTasks++;
    this.recordThroughput();

    // Update circuit breaker
    const circuitName = task.context.circuit as string | undefined;
    if (circuitName) {
      this.recordCircuitSuccess(circuitName);
    }

    // Update batch metrics
    const batchDomain = task.context.batchDomain as string | undefined;
    if (batchDomain && task.startedAt && task.completedAt) {
      this.updateBatchMetrics(batchDomain, task.completedAt - task.startedAt, true);
    }

    // Complete tracing span
    if (this.config.tracing && task.spanId && task.traceId) {
      this.completeSpan(task.traceId, task.spanId, 'ok');
    }

    // Trigger dependents
    for (const depId of task.dependents) {
      const dep = this.tasks.get(depId);
      if (dep) {
        this.checkDependencies(dep);
      }
    }

    this.emit('taskCompleted', task);
    this.publishEvent('task.completed', {
      taskId: task.id,
      name: task.name,
      duration: task.completedAt! - task.startedAt!,
    });
  }

  private onTaskFailed(task: Task): void {
    this.stats.failedTasks++;

    // Update circuit breaker
    const circuitName = task.context.circuit as string | undefined;
    if (circuitName) {
      this.recordCircuitFailure(circuitName);
    }

    // Update batch metrics
    const batchDomain = task.context.batchDomain as string | undefined;
    if (batchDomain && task.startedAt && task.completedAt) {
      this.updateBatchMetrics(batchDomain, task.completedAt - task.startedAt, false);
    }

    // Retry logic
    if (task.retries < task.maxRetries) {
      task.retries++;
      task.status = 'pending';
      task.error = undefined;
      this.enqueue(task);
      return;
    }

    // Complete tracing span with error
    if (this.config.tracing && task.spanId && task.traceId) {
      this.addSpanEvent(task.traceId, task.spanId, 'error', {
        error: task.error?.message,
      });
      this.completeSpan(task.traceId, task.spanId, 'error');
    }

    // Fail dependents
    for (const depId of task.dependents) {
      const dep = this.tasks.get(depId);
      if (dep && dep.status === 'pending') {
        dep.status = 'failed';
        dep.error = new Error(`Dependency ${task.id} failed`);
        this.onTaskFailed(dep);
      }
    }

    this.emit('taskFailed', task);
    this.publishEvent('task.failed', {
      taskId: task.id,
      name: task.name,
      error: task.error?.message,
      retries: task.retries,
    });
  }

  // ===========================================================================
  // Circuit Breaker
  // ===========================================================================

  private getOrCreateCircuit(name: string): CircuitBreaker {
    let circuit = this.circuits.get(name);
    if (!circuit) {
      circuit = {
        name,
        state: 'closed',
        failures: 0,
        lastFailure: 0,
        lastSuccess: Date.now(),
        halfOpenAttempts: 0,
      };
      this.circuits.set(name, circuit);
    }

    // Check if should transition from open to half-open
    if (circuit.state === 'open') {
      const elapsed = Date.now() - circuit.lastFailure;
      if (elapsed >= this.config.circuitBreakerTimeout) {
        circuit.state = 'half-open';
        circuit.halfOpenAttempts = 0;
      }
    }

    return circuit;
  }

  private recordCircuitSuccess(name: string): void {
    const circuit = this.circuits.get(name);
    if (!circuit) return;

    circuit.lastSuccess = Date.now();

    if (circuit.state === 'half-open') {
      circuit.halfOpenAttempts++;
      if (circuit.halfOpenAttempts >= 3) {
        // Successfully handled 3 requests, close circuit
        circuit.state = 'closed';
        circuit.failures = 0;
        this.emit('circuitClosed', { name });
        this.publishEvent('circuit.closed', { name });
      }
    } else if (circuit.state === 'closed') {
      // Reset failure count on success
      circuit.failures = Math.max(0, circuit.failures - 1);
    }
  }

  private recordCircuitFailure(name: string): void {
    const circuit = this.circuits.get(name);
    if (!circuit) return;

    circuit.failures++;
    circuit.lastFailure = Date.now();

    if (circuit.state === 'half-open') {
      // Any failure in half-open reopens
      circuit.state = 'open';
      this.emit('circuitOpened', { name, failures: circuit.failures });
      this.publishEvent('circuit.opened', { name });
    } else if (circuit.state === 'closed') {
      if (circuit.failures >= this.config.circuitBreakerThreshold) {
        circuit.state = 'open';
        this.emit('circuitOpened', { name, failures: circuit.failures });
        this.publishEvent('circuit.opened', { name });
      }
    }
  }

  // ===========================================================================
  // Adaptive Batching
  // ===========================================================================

  private getOrCreateBatchMetrics(domain: string): BatchMetrics {
    let metrics = this.batchMetrics.get(domain);
    if (!metrics) {
      metrics = {
        domain,
        currentSize: this.config.initialBatchSize,
        avgThroughput: 0,
        avgLatency: 0,
        successRate: 1,
        history: [],
      };
      this.batchMetrics.set(domain, metrics);
    }
    return metrics;
  }

  private updateBatchMetrics(domain: string, latency: number, success: boolean): void {
    const metrics = this.getOrCreateBatchMetrics(domain);

    // Update running averages
    const alpha = 0.3;  // Exponential moving average factor
    metrics.avgLatency = alpha * latency + (1 - alpha) * metrics.avgLatency;
    metrics.successRate = alpha * (success ? 1 : 0) + (1 - alpha) * metrics.successRate;

    // Calculate throughput (tasks per second)
    const now = Date.now();
    const windowSize = 60000;  // 1 minute window
    this.stats.throughputWindow = this.stats.throughputWindow.filter(
      t => now - t < windowSize
    );
    metrics.avgThroughput = this.stats.throughputWindow.length / (windowSize / 1000);

    // Record history
    metrics.history.push({
      size: metrics.currentSize,
      throughput: metrics.avgThroughput,
      latency: metrics.avgLatency,
    });
    if (metrics.history.length > 20) {
      metrics.history.shift();
    }

    // Adapt batch size
    this.adaptBatchSize(metrics);
  }

  private adaptBatchSize(metrics: BatchMetrics): void {
    if (!this.config.adaptiveBatching || metrics.history.length < 5) return;

    const recent = metrics.history.slice(-5);
    const avgRecentThroughput = recent.reduce((s, h) => s + h.throughput, 0) / recent.length;
    const avgRecentLatency = recent.reduce((s, h) => s + h.latency, 0) / recent.length;

    // Increase batch size if:
    // - Success rate is high AND latency is low
    if (metrics.successRate > 0.9 && avgRecentLatency < 1000) {
      metrics.currentSize = Math.min(50, Math.ceil(metrics.currentSize * 1.2));
    }
    // Decrease batch size if:
    // - Success rate is low OR latency is high
    else if (metrics.successRate < 0.8 || avgRecentLatency > 5000) {
      metrics.currentSize = Math.max(1, Math.floor(metrics.currentSize * 0.8));
    }
  }

  // ===========================================================================
  // Tracing
  // ===========================================================================

  private createSpan(traceId: string, operation: string, parentSpanId?: string): string {
    const spanId = `span-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const span: TraceSpan = {
      traceId,
      spanId,
      parentSpanId,
      operation,
      startTime: Date.now(),
      status: 'ok',
      tags: {},
      events: [],
    };

    let spans = this.traces.get(traceId);
    if (!spans) {
      spans = [];
      this.traces.set(traceId, spans);
    }
    spans.push(span);

    return spanId;
  }

  private addSpanEvent(
    traceId: string,
    spanId: string,
    name: string,
    attributes?: Record<string, unknown>,
  ): void {
    const spans = this.traces.get(traceId);
    const span = spans?.find(s => s.spanId === spanId);
    if (span) {
      span.events.push({ name, time: Date.now(), attributes });
    }
  }

  private completeSpan(traceId: string, spanId: string, status: 'ok' | 'error'): void {
    const spans = this.traces.get(traceId);
    const span = spans?.find(s => s.spanId === spanId);
    if (span) {
      span.endTime = Date.now();
      span.status = status;
    }
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  private recordThroughput(): void {
    this.stats.throughputWindow.push(Date.now());
    // Keep only last minute
    const cutoff = Date.now() - 60000;
    this.stats.throughputWindow = this.stats.throughputWindow.filter(t => t >= cutoff);
  }

  private publishEvent(topic: string, data: Record<string, unknown>): void {
    const bus = getEventBus();
    (bus as unknown as { publish: (topic: string, event: Record<string, unknown>) => void }).publish(
      `concurrency:${topic}`,
      { precision: 0.9, ...data }
    );
  }

  // ===========================================================================
  // Control
  // ===========================================================================

  start(): void {
    if (this.running) return;
    this.running = true;

    // Start all workers
    for (const worker of this.workers) {
      worker.start().catch(err => {
        console.error('[ParallelEngine] Worker error:', err);
      });
    }

    console.log(`[ParallelEngine] Started with ${this.config.maxWorkers} workers`);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    // Stop all workers
    for (const worker of this.workers) {
      worker.stop();
    }

    console.log('[ParallelEngine] Stopped');
  }

  /**
   * Wait for all pending tasks to complete
   */
  async drain(timeout = 30000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const pending = [...this.tasks.values()].filter(
        t => t.status === 'pending' || t.status === 'queued' || t.status === 'running'
      );
      if (pending.length === 0) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Drain timeout');
  }

  /**
   * Cancel a task
   */
  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status === 'completed' || task.status === 'failed') {
      return false;
    }
    task.status = 'cancelled';
    task.error = new Error('Task cancelled');
    return true;
  }

  // ===========================================================================
  // Getters
  // ===========================================================================

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getWorkerStats(): WorkerStats[] {
    return this.workers.map(w => w.getStats());
  }

  getQueueStats(): QueueStats[] {
    return this.queues.map(q => q.getStats());
  }

  getCircuits(): CircuitBreaker[] {
    return [...this.circuits.values()];
  }

  getBatchMetrics(): BatchMetrics[] {
    return [...this.batchMetrics.values()];
  }

  getTrace(traceId: string): TraceSpan[] {
    return this.traces.get(traceId) || [];
  }

  getStats(): EngineStats {
    const pending = [...this.tasks.values()].filter(
      t => t.status === 'pending' || t.status === 'queued'
    ).length;
    const running = [...this.tasks.values()].filter(t => t.status === 'running').length;

    const workerStats = this.getWorkerStats();
    const totalLatency = workerStats.reduce((s, w) => s + w.avgLatency, 0);
    const avgLatency = workerStats.length > 0 ? totalLatency / workerStats.length : 0;

    const windowSize = 60;  // 1 minute
    const throughput = this.stats.throughputWindow.length / windowSize;

    const backpressure = this.queues.some(q => q.getStats().backpressure);

    return {
      running: this.running,
      totalTasks: this.stats.totalTasks,
      pendingTasks: pending,
      runningTasks: running,
      completedTasks: this.stats.completedTasks,
      failedTasks: this.stats.failedTasks,
      avgLatency,
      throughput,
      workers: workerStats,
      queues: this.getQueueStats(),
      circuits: this.getCircuits(),
      backpressure,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let engineInstance: ParallelExecutionEngine | null = null;

export function getParallelEngine(config?: Partial<ParallelEngineConfig>): ParallelExecutionEngine {
  if (!engineInstance) {
    engineInstance = new ParallelExecutionEngine(config);
  }
  return engineInstance;
}

export function resetParallelEngine(): void {
  if (engineInstance) {
    engineInstance.stop();
  }
  engineInstance = null;
}
