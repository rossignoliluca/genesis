/**
 * Genesis 6.0 - Daemon Module
 *
 * Unified daemon for background task scheduling, self-maintenance, and dream mode.
 *
 * This module provides:
 * - Scheduler: Background task execution with priorities and retries
 * - Maintenance: Self-repair and health monitoring
 * - Dream Mode: Offline memory consolidation and creative synthesis
 *
 * Usage:
 * ```typescript
 * import { createDaemon } from './daemon/index.js';
 * import { createMemorySystem } from './memory/index.js';
 *
 * const memory = createMemorySystem();
 * const daemon = createDaemon({ memory });
 *
 * // Start the daemon
 * daemon.start();
 *
 * // Schedule a custom task
 * daemon.schedule({
 *   name: 'my-task',
 *   schedule: { type: 'interval', intervalMs: 60000 },
 *   handler: async (ctx) => {
 *     ctx.logger.info('Running my task');
 *     return { success: true, duration: 100 };
 *   },
 * });
 *
 * // Trigger a dream session
 * await daemon.dream();
 *
 * // Check status
 * console.log(daemon.status());
 *
 * // Stop the daemon
 * daemon.stop();
 * ```
 */

// Re-export types
export * from './types.js';

// Re-export components
export { Scheduler, createScheduler, type SchedulerConfig } from './scheduler.js';
export { MaintenanceService, createMaintenanceService, type MaintenanceContext } from './maintenance.js';
export { DreamService, createDreamService, type DreamContext } from './dream-mode.js';

import {
  DaemonConfig,
  DaemonState,
  DaemonStatus,
  DaemonError,
  DaemonEvent,
  DaemonEventType,
  DaemonEventHandler,
  ScheduledTask,
  CreateTaskOptions,
  MaintenanceReport,
  DreamSession,
  DreamResults,
  DEFAULT_DAEMON_CONFIG,
} from './types.js';

import { Scheduler, createScheduler, SchedulerConfig } from './scheduler.js';
import { MaintenanceService, createMaintenanceService, MaintenanceContext } from './maintenance.js';
import { DreamService, createDreamService, DreamContext } from './dream-mode.js';

// ============================================================================
// Daemon Context (External Dependencies)
// ============================================================================

export interface DaemonDependencies {
  // Memory system (from src/memory/)
  memory?: {
    episodic: {
      getAll: () => Array<{
        id: string;
        content: { what: string };
        importance: number;
        tags: string[];
        consolidated: boolean;
      }>;
      runForgetting: () => { forgotten: number };
    };
    semantic: {
      getAll: () => Array<{
        id: string;
        concept: string;
        confidence: number;
      }>;
    };
    procedural: {
      getAll: () => Array<{
        id: string;
        name: string;
        successRate: number;
      }>;
    };
    consolidation: {
      sleep: () => Promise<{ consolidated: number }>;
    };
    getStats: () => {
      total: number;
      episodic: { total: number };
      semantic: { total: number };
      procedural: { total: number };
    };
  };

  // Kernel access (from src/kernel/)
  kernel?: {
    checkAgentHealth: () => Promise<Array<{ id: string; healthy: boolean; latency?: number }>>;
    checkInvariants: () => Promise<Array<{ id: string; satisfied: boolean; message?: string }>>;
    repairInvariant: (id: string) => Promise<boolean>;
    getState: () => { state: string; energy: number };
    rechargeEnergy: (amount: number) => void;
    resetState: () => void;
  };

  // Logger
  log?: (message: string, level?: 'debug' | 'info' | 'warn' | 'error') => void;
}

// ============================================================================
// Daemon Class
// ============================================================================

export class Daemon {
  private config: DaemonConfig;
  private state: DaemonState = 'stopped';
  private startedAt: Date | null = null;
  private errors: DaemonError[] = [];
  private eventHandlers: Set<DaemonEventHandler> = new Set();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // Components
  readonly scheduler: Scheduler;
  readonly maintenance: MaintenanceService;
  readonly dreamService: DreamService;

  // Dependencies
  private deps: DaemonDependencies;

  constructor(deps: DaemonDependencies = {}, config: Partial<DaemonConfig> = {}) {
    this.config = { ...DEFAULT_DAEMON_CONFIG, ...config };
    this.deps = deps;

    // Create components
    this.scheduler = createScheduler(this.config.scheduler);
    this.maintenance = createMaintenanceService(
      this.config.maintenance,
      this.buildMaintenanceContext()
    );
    this.dreamService = createDreamService(
      this.config.dream,
      this.buildDreamContext()
    );

    // Wire up events
    this.setupEventForwarding();

    // Setup default tasks
    this.setupDefaultTasks();
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(): void {
    if (this.state !== 'stopped') {
      throw new Error(`Cannot start daemon in state: ${this.state}`);
    }

    this.state = 'starting';
    this.startedAt = new Date();

    this.log('Daemon starting...');

    // Start heartbeat
    this.heartbeatTimer = setInterval(
      () => this.heartbeat(),
      this.config.heartbeatIntervalMs
    );

    // Start components
    if (this.config.scheduler.enabled) {
      this.scheduler.start();
    }

    if (this.config.maintenance.enabled) {
      this.maintenance.start();
    }

    if (this.config.dream.autoTrigger) {
      this.dreamService.startAutoTrigger();
    }

    this.state = 'running';
    this.emit({ type: 'daemon_started', timestamp: new Date(), data: null });
    this.log('Daemon started');
  }

  stop(): void {
    if (this.state === 'stopped' || this.state === 'stopping') {
      return;
    }

    this.state = 'stopping';
    this.log('Daemon stopping...');

    // Stop heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Stop components
    this.scheduler.stop();
    this.maintenance.stop();
    this.dreamService.stopAutoTrigger();

    // Interrupt dream if running
    if (this.dreamService.isDreaming()) {
      this.dreamService.interruptDream('Daemon stopping');
    }

    this.state = 'stopped';
    this.emit({ type: 'daemon_stopped', timestamp: new Date(), data: null });
    this.log('Daemon stopped');
  }

  restart(): void {
    this.stop();
    this.start();
  }

  getState(): DaemonState {
    return this.state;
  }

  isRunning(): boolean {
    return this.state === 'running' || this.state === 'dreaming' || this.state === 'maintaining';
  }

  // ============================================================================
  // Task Scheduling
  // ============================================================================

  schedule(options: CreateTaskOptions): ScheduledTask {
    return this.scheduler.schedule(options);
  }

  cancelTask(taskId: string): boolean {
    return this.scheduler.cancel(taskId);
  }

  triggerTask(taskId: string): boolean {
    return this.scheduler.trigger(taskId);
  }

  getTasks(): ScheduledTask[] {
    return this.scheduler.getAll();
  }

  // ============================================================================
  // Maintenance
  // ============================================================================

  async runMaintenance(): Promise<MaintenanceReport> {
    const previousState = this.state;
    this.state = 'maintaining';

    try {
      const report = await this.maintenance.runCycle();
      return report;
    } finally {
      this.state = previousState;
    }
  }

  getMaintenanceIssues() {
    return this.maintenance.getOpenIssues();
  }

  // ============================================================================
  // Dream Mode
  // ============================================================================

  async dream(options: { duration?: number } = {}): Promise<DreamResults> {
    if (this.dreamService.isDreaming()) {
      throw new Error('Already dreaming');
    }

    const previousState = this.state;
    this.state = 'dreaming';

    try {
      await this.dreamService.startDream(options);
      const results = await this.dreamService.waitForWake();
      return results;
    } finally {
      this.state = previousState;
    }
  }

  interruptDream(reason: string): Promise<DreamResults | null> {
    return this.dreamService.interruptDream(reason);
  }

  isDreaming(): boolean {
    return this.dreamService.isDreaming();
  }

  getDreamMetrics() {
    return this.dreamService.getMetrics();
  }

  // ============================================================================
  // Activity Tracking
  // ============================================================================

  recordActivity(): void {
    this.dreamService.recordActivity();
  }

  // ============================================================================
  // Status
  // ============================================================================

  status(): DaemonStatus {
    const now = new Date();
    const uptime = this.startedAt
      ? now.getTime() - this.startedAt.getTime()
      : 0;

    const schedulerStats = this.scheduler.stats();

    return {
      state: this.state,
      uptime,
      startedAt: this.startedAt,
      lastHeartbeat: now,
      activeTasks: schedulerStats.running,
      completedTasks: schedulerStats.completed,
      failedTasks: schedulerStats.failed,
      dreamCycles: this.dreamService.getMetrics().dreamCycles,
      maintenanceCycles: this.maintenance.stats().cyclesRun,
      errors: this.errors.slice(-10), // Last 10 errors
    };
  }

  // ============================================================================
  // Events
  // ============================================================================

  on(handler: DaemonEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: DaemonEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('Daemon event handler error:', err);
      }
    }
  }

  // ============================================================================
  // Internal
  // ============================================================================

  private heartbeat(): void {
    // Check for too many errors
    if (this.errors.length >= this.config.maxErrors) {
      const recentErrors = this.errors.filter(
        (e) => Date.now() - e.timestamp.getTime() < 60000
      );
      if (recentErrors.length >= this.config.maxErrors) {
        this.log('Too many errors, entering error state', 'error');
        this.state = 'error';
        this.emit({
          type: 'daemon_error',
          timestamp: new Date(),
          data: { message: 'Too many errors' },
        });
      }
    }
  }

  private setupEventForwarding(): void {
    // Forward scheduler events
    this.scheduler.on((event) => {
      const eventType = `task_${event.type.replace('task_', '')}` as DaemonEventType;
      if (['task_scheduled', 'task_started', 'task_completed', 'task_failed', 'task_cancelled'].includes(eventType)) {
        this.emit({
          type: eventType,
          timestamp: new Date(),
          data: event.task,
        });
      }
    });

    // Forward maintenance events
    this.maintenance.on((event) => {
      if (event.type === 'cycle_started') {
        this.emit({
          type: 'maintenance_started',
          timestamp: new Date(),
          data: null,
        });
      } else if (event.type === 'cycle_completed') {
        this.emit({
          type: 'maintenance_completed',
          timestamp: new Date(),
          data: event.data,
        });
      } else if (event.type === 'issue_detected') {
        this.emit({
          type: 'maintenance_issue',
          timestamp: new Date(),
          data: event.data,
        });
      }
    });

    // Forward dream events
    this.dreamService.on((event) => {
      if (event.type === 'dream_started') {
        this.emit({
          type: 'dream_started',
          timestamp: new Date(),
          data: event.session,
        });
      } else if (event.type === 'phase_changed') {
        this.emit({
          type: 'dream_phase_changed',
          timestamp: new Date(),
          data: event.data,
        });
      } else if (event.type === 'dream_completed') {
        this.emit({
          type: 'dream_completed',
          timestamp: new Date(),
          data: event.session?.results,
        });
      } else if (event.type === 'dream_interrupted') {
        this.emit({
          type: 'dream_interrupted',
          timestamp: new Date(),
          data: { reason: event.session?.interruptReason },
        });
      }
    });
  }

  private setupDefaultTasks(): void {
    // Health check task
    this.scheduler.schedule({
      name: 'health-check',
      description: 'Periodic agent health check',
      schedule: { type: 'interval', intervalMs: this.config.maintenance.healthCheckIntervalMs },
      priority: 'normal',
      handler: async (ctx) => {
        ctx.logger.debug('Running health check');
        const issues = await this.maintenance.checkHealth();
        return {
          success: true,
          duration: 0,
          output: { issues: issues.length },
        };
      },
      tags: ['system', 'health'],
    });

    // Memory cleanup task
    if (this.deps.memory) {
      this.scheduler.schedule({
        name: 'memory-cleanup',
        description: 'Periodic memory forgetting and cleanup',
        schedule: { type: 'interval', intervalMs: this.config.maintenance.memoryCleanupIntervalMs },
        priority: 'low',
        handler: async (ctx) => {
          ctx.logger.debug('Running memory cleanup');
          const result = await this.maintenance.cleanupMemory();
          return {
            success: true,
            duration: 0,
            output: result,
          };
        },
        tags: ['system', 'memory'],
      });
    }

    // v8.5: Self-improvement task
    if (this.config.selfImprovement?.enabled) {
      this.scheduler.schedule({
        name: 'self-improvement',
        description: 'Periodic self-improvement discovery and application',
        schedule: { type: 'interval', intervalMs: this.config.selfImprovement.intervalMs },
        priority: 'low',
        handler: async (ctx) => {
          ctx.logger.info('Running self-improvement cycle');
          try {
            // Import brain dynamically to avoid circular deps
            const { getBrain } = await import('../brain/index.js');
            const brain = getBrain();

            // Check consciousness level first
            const phi = brain.getMetrics().avgPhi;
            if (phi < this.config.selfImprovement.minPhiThreshold) {
              ctx.logger.debug(`Skipping self-improvement: phi=${phi.toFixed(3)} < ${this.config.selfImprovement.minPhiThreshold}`);
              return {
                success: true,
                duration: 0,
                output: { skipped: true, reason: 'low_phi', phi },
              };
            }

            // Run improvement check
            const result = await brain.checkForImprovements(this.config.selfImprovement.autoApply);

            if (result.success) {
              if (result.opportunities && result.opportunities.length > 0) {
                ctx.logger.info(`Found ${result.opportunities.length} improvement opportunities`);
                // Emit event for listeners
                this.emit({
                  type: 'maintenance_completed',
                  timestamp: new Date(),
                  data: {
                    task: 'self-improvement',
                    opportunities: result.opportunities,
                  },
                });
              }
              if (result.applied && result.applied.length > 0) {
                ctx.logger.info(`Applied ${result.applied.length} improvements`);
              }
            }

            return {
              success: result.success,
              duration: 0,
              output: result,
            };
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            ctx.logger.error(`Self-improvement error: ${error.message}`);
            return {
              success: false,
              duration: 0,
              error,
            };
          }
        },
        tags: ['system', 'self-improvement', 'autopoiesis'],
      });
    }
  }

  private buildMaintenanceContext(): MaintenanceContext {
    return {
      checkAgentHealth: this.deps.kernel?.checkAgentHealth,
      getMemoryStats: this.deps.memory
        ? () => {
            const stats = this.deps.memory!.getStats();
            return {
              total: stats.total,
              byType: {
                episodic: stats.episodic.total,
                semantic: stats.semantic.total,
                procedural: stats.procedural.total,
              },
              avgRetention: 0.5, // Would need to calculate from memories
            };
          }
        : undefined,
      runMemoryForgetting: this.deps.memory
        ? () => this.deps.memory!.episodic.runForgetting()
        : undefined,
      runMemoryConsolidation: this.deps.memory
        ? async () => {
            const result = await this.deps.memory!.consolidation.sleep();
            return { consolidated: result.consolidated };
          }
        : undefined,
      checkInvariants: this.deps.kernel?.checkInvariants,
      repairInvariant: this.deps.kernel?.repairInvariant,
      getState: this.deps.kernel?.getState,
      resetState: this.deps.kernel?.resetState,
      log: (message, level) => this.log(message, level),
    };
  }

  private buildDreamContext(): DreamContext {
    return {
      getEpisodicMemories: this.deps.memory
        ? () => this.deps.memory!.episodic.getAll()
        : undefined,
      getSemanticMemories: this.deps.memory
        ? () => this.deps.memory!.semantic.getAll()
        : undefined,
      getProceduralMemories: this.deps.memory
        ? () => this.deps.memory!.procedural.getAll()
        : undefined,
      consolidateMemory: this.deps.memory
        ? async (episodeId: string) => {
            // This would need proper implementation
            return null;
          }
        : undefined,
      extractPattern: this.deps.memory
        ? async (episodeIds: string[]) => {
            // This would need proper implementation
            return null;
          }
        : undefined,
      forgetMemory: this.deps.memory
        ? (memoryId: string) => {
            // This would need proper implementation
            return false;
          }
        : undefined,
      getState: this.deps.kernel?.getState,
      rechargeEnergy: this.deps.kernel?.rechargeEnergy,
      checkInvariants: this.deps.kernel
        ? async () => {
            const results = await this.deps.kernel!.checkInvariants();
            return results.every((r) => r.satisfied);
          }
        : undefined,
      repairState: this.deps.kernel
        ? async () => {
            // Count repairs
            return 0;
          }
        : undefined,
      log: (message, level) => this.log(message, level),
    };
  }

  private log(message: string, level: 'debug' | 'info' | 'warn' | 'error' = 'info'): void {
    if (this.deps.log) {
      this.deps.log(message, level);
    } else {
      const prefix = '[Daemon]';
      const shouldLog =
        level === 'error' ||
        level === 'warn' ||
        (level === 'info' && this.config.logLevel !== 'error' && this.config.logLevel !== 'warn') ||
        (level === 'debug' && this.config.logLevel === 'debug');

      if (shouldLog) {
        switch (level) {
          case 'debug':
            console.log(`${prefix} DEBUG: ${message}`);
            break;
          case 'info':
            console.log(`${prefix} ${message}`);
            break;
          case 'warn':
            console.warn(`${prefix} ${message}`);
            break;
          case 'error':
            console.error(`${prefix} ${message}`);
            break;
        }
      }
    }
  }

  private recordError(code: string, message: string, source: DaemonError['source']): void {
    const error: DaemonError = {
      timestamp: new Date(),
      code,
      message,
      source,
      recovered: false,
    };

    this.errors.push(error);

    // Keep only last 100 errors
    if (this.errors.length > 100) {
      this.errors = this.errors.slice(-100);
    }

    this.emit({
      type: 'daemon_error',
      timestamp: new Date(),
      data: error,
    });
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createDaemon(
  deps?: DaemonDependencies,
  config?: Partial<DaemonConfig>
): Daemon {
  return new Daemon(deps, config);
}

// ============================================================================
// Singleton Instance (optional)
// ============================================================================

let daemonInstance: Daemon | null = null;

export function getDaemon(
  deps?: DaemonDependencies,
  config?: Partial<DaemonConfig>
): Daemon {
  if (!daemonInstance) {
    daemonInstance = createDaemon(deps, config);
  }
  return daemonInstance;
}

export function resetDaemon(): void {
  if (daemonInstance) {
    daemonInstance.stop();
    daemonInstance = null;
  }
}
