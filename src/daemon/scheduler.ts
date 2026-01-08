/**
 * Genesis 6.0 - Task Scheduler
 *
 * Background task scheduling with priorities, retries, and monitoring.
 *
 * Features:
 * - Priority-based execution queue
 * - Interval and cron scheduling
 * - Automatic retries with backoff
 * - Task timeout handling
 * - Concurrent execution limits
 *
 * Usage:
 * ```typescript
 * import { createScheduler } from './daemon/scheduler.js';
 *
 * const scheduler = createScheduler({ maxConcurrentTasks: 5 });
 *
 * // Schedule a recurring task
 * scheduler.schedule({
 *   name: 'health-check',
 *   schedule: { type: 'interval', intervalMs: 60000 },
 *   handler: async (ctx) => {
 *     ctx.logger.info('Running health check');
 *     return { success: true, duration: 50 };
 *   },
 * });
 *
 * // Start the scheduler
 * scheduler.start();
 * ```
 */

import { randomUUID } from 'crypto';
import {
  ScheduledTask,
  TaskSchedule,
  TaskState,
  TaskPriority,
  TaskContext,
  TaskResult,
  TaskHandler,
  TaskLogger,
  CreateTaskOptions,
} from './types.js';

// ============================================================================
// Scheduler Configuration
// ============================================================================

export interface SchedulerConfig {
  maxConcurrentTasks: number;
  defaultTimeout: number;
  defaultRetries: number;
  defaultRetryDelay: number;
  tickIntervalMs: number;           // How often to check for due tasks
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  maxConcurrentTasks: 5,
  defaultTimeout: 60000,            // 1 minute
  defaultRetries: 3,
  defaultRetryDelay: 1000,          // 1 second
  tickIntervalMs: 1000,             // Check every second
};

// ============================================================================
// Priority Queue
// ============================================================================

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
  idle: 4,
};

function compareTasks(a: ScheduledTask, b: ScheduledTask): number {
  // First by priority
  const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (priorityDiff !== 0) return priorityDiff;

  // Then by next run time
  if (a.nextRun && b.nextRun) {
    return a.nextRun.getTime() - b.nextRun.getTime();
  }
  if (a.nextRun) return -1;
  if (b.nextRun) return 1;

  // Finally by creation time
  return a.createdAt.getTime() - b.createdAt.getTime();
}

// ============================================================================
// Task Logger Implementation
// ============================================================================

function createTaskLogger(taskId: string, taskName: string): TaskLogger {
  const prefix = `[Task:${taskName}]`;

  return {
    debug(message: string, data?: unknown): void {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`${prefix} DEBUG: ${message}`, data || '');
      }
    },
    info(message: string, data?: unknown): void {
      console.log(`${prefix} INFO: ${message}`, data || '');
    },
    warn(message: string, data?: unknown): void {
      console.warn(`${prefix} WARN: ${message}`, data || '');
    },
    error(message: string, error?: Error): void {
      console.error(`${prefix} ERROR: ${message}`, error?.message || '');
    },
  };
}

// ============================================================================
// Cron Parser (Simplified)
// ============================================================================

/**
 * Parse a simplified cron expression
 * Format: minute hour day-of-month month day-of-week
 * Supports: *, numbers, ranges (1-5), steps (* /5)
 */
function parseCron(expression: string): { minutes: number[]; hours: number[]; days: number[]; months: number[]; weekdays: number[] } {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${expression}`);
  }

  const parse = (part: string, min: number, max: number): number[] => {
    if (part === '*') {
      return Array.from({ length: max - min + 1 }, (_, i) => min + i);
    }

    // Handle step (*/5)
    if (part.startsWith('*/')) {
      const step = parseInt(part.slice(2), 10);
      const result: number[] = [];
      for (let i = min; i <= max; i += step) {
        result.push(i);
      }
      return result;
    }

    // Handle range (1-5)
    if (part.includes('-')) {
      const [start, end] = part.split('-').map((n) => parseInt(n, 10));
      const result: number[] = [];
      for (let i = start; i <= end; i++) {
        result.push(i);
      }
      return result;
    }

    // Handle list (1,3,5)
    if (part.includes(',')) {
      return part.split(',').map((n) => parseInt(n, 10));
    }

    // Single value
    return [parseInt(part, 10)];
  };

  return {
    minutes: parse(parts[0], 0, 59),
    hours: parse(parts[1], 0, 23),
    days: parse(parts[2], 1, 31),
    months: parse(parts[3], 1, 12),
    weekdays: parse(parts[4], 0, 6),
  };
}

function getNextCronTime(expression: string, after: Date = new Date()): Date {
  const cron = parseCron(expression);
  const next = new Date(after);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);

  // Search up to 1 year ahead
  const maxIterations = 366 * 24 * 60;

  for (let i = 0; i < maxIterations; i++) {
    const month = next.getMonth() + 1;
    const day = next.getDate();
    const weekday = next.getDay();
    const hour = next.getHours();
    const minute = next.getMinutes();

    if (
      cron.months.includes(month) &&
      cron.days.includes(day) &&
      cron.weekdays.includes(weekday) &&
      cron.hours.includes(hour) &&
      cron.minutes.includes(minute)
    ) {
      return next;
    }

    next.setMinutes(next.getMinutes() + 1);
  }

  throw new Error(`Could not find next cron time for: ${expression}`);
}

// ============================================================================
// Scheduler Class
// ============================================================================

export type SchedulerEventType =
  | 'started'
  | 'stopped'
  | 'task_scheduled'
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'task_cancelled';

export type SchedulerEventHandler = (event: { type: SchedulerEventType; task?: ScheduledTask; error?: Error }) => void;

export class Scheduler {
  private tasks: Map<string, ScheduledTask> = new Map();
  private running: Set<string> = new Set();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private config: SchedulerConfig;
  private started: boolean = false;
  private eventHandlers: Set<SchedulerEventHandler> = new Set();

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(): void {
    if (this.started) return;

    this.started = true;
    this.tickTimer = setInterval(() => this.tick(), this.config.tickIntervalMs);
    this.emit({ type: 'started' });

    // Run immediate tasks
    this.tick();
  }

  stop(): void {
    if (!this.started) return;

    this.started = false;

    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    this.emit({ type: 'stopped' });
  }

  isRunning(): boolean {
    return this.started;
  }

  // ============================================================================
  // Task Management
  // ============================================================================

  schedule(options: CreateTaskOptions): ScheduledTask {
    const id = randomUUID();
    const now = new Date();

    const task: ScheduledTask = {
      id,
      name: options.name,
      description: options.description,
      state: 'pending',
      priority: options.priority || 'normal',
      schedule: options.schedule,
      nextRun: this.calculateNextRun(options.schedule, now),
      lastRun: null,
      handler: options.handler,
      timeout: options.timeout || this.config.defaultTimeout,
      retries: options.retries ?? this.config.defaultRetries,
      retryDelay: options.retryDelay || this.config.defaultRetryDelay,
      runCount: 0,
      successCount: 0,
      failureCount: 0,
      avgDuration: 0,
      createdAt: now,
      tags: options.tags || [],
    };

    if (task.nextRun) {
      task.state = 'scheduled';
    }

    this.tasks.set(id, task);
    this.emit({ type: 'task_scheduled', task });

    return task;
  }

  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.state === 'running') {
      // Can't cancel running tasks directly (they have abort signals)
      return false;
    }

    task.state = 'cancelled';
    this.emit({ type: 'task_cancelled', task });
    return true;
  }

  remove(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.state === 'running') {
      return false; // Can't remove running tasks
    }

    return this.tasks.delete(taskId);
  }

  pause(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.state === 'scheduled' || task.state === 'pending') {
      task.state = 'paused';
      return true;
    }
    return false;
  }

  resume(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.state === 'paused') {
      task.state = task.nextRun ? 'scheduled' : 'pending';
      return true;
    }
    return false;
  }

  trigger(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.state !== 'running') {
      task.nextRun = new Date();
      task.state = 'scheduled';
      return true;
    }
    return false;
  }

  // ============================================================================
  // Query
  // ============================================================================

  get(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId);
  }

  getByName(name: string): ScheduledTask | undefined {
    for (const task of this.tasks.values()) {
      if (task.name === name) return task;
    }
    return undefined;
  }

  getAll(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  getPending(): ScheduledTask[] {
    return this.getAll().filter((t) => ['pending', 'scheduled'].includes(t.state));
  }

  getRunning(): ScheduledTask[] {
    return this.getAll().filter((t) => t.state === 'running');
  }

  getByTag(tag: string): ScheduledTask[] {
    return this.getAll().filter((t) => t.tags.includes(tag));
  }

  // ============================================================================
  // Stats
  // ============================================================================

  stats(): {
    total: number;
    pending: number;
    scheduled: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
    paused: number;
  } {
    const tasks = this.getAll();
    return {
      total: tasks.length,
      pending: tasks.filter((t) => t.state === 'pending').length,
      scheduled: tasks.filter((t) => t.state === 'scheduled').length,
      running: tasks.filter((t) => t.state === 'running').length,
      completed: tasks.filter((t) => t.state === 'completed').length,
      failed: tasks.filter((t) => t.state === 'failed').length,
      cancelled: tasks.filter((t) => t.state === 'cancelled').length,
      paused: tasks.filter((t) => t.state === 'paused').length,
    };
  }

  // ============================================================================
  // Events
  // ============================================================================

  on(handler: SchedulerEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: { type: SchedulerEventType; task?: ScheduledTask; error?: Error }): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('Scheduler event handler error:', err);
      }
    }
  }

  // ============================================================================
  // Internal
  // ============================================================================

  private async tick(): Promise<void> {
    if (!this.started) return;

    const now = new Date();
    const dueTasks = this.getDueTasks(now);

    // Sort by priority
    dueTasks.sort(compareTasks);

    // Execute up to max concurrent
    const available = this.config.maxConcurrentTasks - this.running.size;
    const toRun = dueTasks.slice(0, available);

    for (const task of toRun) {
      this.executeTask(task);
    }
  }

  private getDueTasks(now: Date): ScheduledTask[] {
    const due: ScheduledTask[] = [];

    for (const task of this.tasks.values()) {
      if (task.state === 'scheduled' && task.nextRun && task.nextRun <= now) {
        due.push(task);
      }
      if (task.state === 'pending' && task.schedule.type === 'immediate') {
        due.push(task);
      }
    }

    return due;
  }

  private async executeTask(task: ScheduledTask): Promise<void> {
    task.state = 'running';
    this.running.add(task.id);
    this.emit({ type: 'task_started', task });

    const startTime = Date.now();
    let attempt = 0;
    let lastError: Error | undefined;

    while (attempt <= task.retries) {
      attempt++;

      try {
        const result = await this.runWithTimeout(task, attempt);

        if (result.success) {
          // Success
          task.successCount++;
          task.runCount++;
          task.lastRun = new Date();

          // Update average duration
          const newAvg = (task.avgDuration * (task.runCount - 1) + result.duration) / task.runCount;
          task.avgDuration = newAvg;

          // Reschedule if recurring
          const nextRun = this.calculateNextRun(task.schedule, task.lastRun);
          if (nextRun) {
            task.nextRun = nextRun;
            task.state = 'scheduled';
          } else {
            task.state = 'completed';
          }

          this.emit({ type: 'task_completed', task });
          break;
        } else {
          lastError = result.error;
          if (attempt <= task.retries) {
            await this.sleep(task.retryDelay * attempt); // Exponential backoff
          }
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt <= task.retries) {
          await this.sleep(task.retryDelay * attempt);
        }
      }
    }

    // If we exhausted all retries
    if (task.state === 'running') {
      task.failureCount++;
      task.runCount++;
      task.lastRun = new Date();

      // Still reschedule if recurring
      const nextRun = this.calculateNextRun(task.schedule, task.lastRun);
      if (nextRun) {
        task.nextRun = nextRun;
        task.state = 'scheduled';
      } else {
        task.state = 'failed';
      }

      this.emit({ type: 'task_failed', task, error: lastError });
    }

    this.running.delete(task.id);
  }

  private async runWithTimeout(task: ScheduledTask, attempt: number): Promise<TaskResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), task.timeout);

    const context: TaskContext = {
      taskId: task.id,
      attempt,
      maxAttempts: task.retries + 1,
      startedAt: new Date(),
      timeout: task.timeout,
      signal: controller.signal,
      logger: createTaskLogger(task.id, task.name),
    };

    try {
      const startTime = Date.now();
      const result = await task.handler(context);
      clearTimeout(timeout);
      return {
        ...result,
        duration: result.duration || (Date.now() - startTime),
      };
    } catch (err) {
      clearTimeout(timeout);
      return {
        success: false,
        duration: Date.now() - context.startedAt.getTime(),
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }

  private calculateNextRun(schedule: TaskSchedule, after: Date): Date | null {
    switch (schedule.type) {
      case 'once':
        // Already passed
        return schedule.at > after ? schedule.at : null;

      case 'immediate':
        return null; // Only run once

      case 'manual':
        return null; // Triggered manually

      case 'interval':
        return new Date(after.getTime() + schedule.intervalMs);

      case 'cron':
        return getNextCronTime(schedule.expression, after);

      default:
        return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createScheduler(config?: Partial<SchedulerConfig>): Scheduler {
  return new Scheduler(config);
}
