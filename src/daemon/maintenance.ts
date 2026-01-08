/**
 * Genesis 6.0 - Maintenance Service
 *
 * Self-repair and health maintenance for the Genesis system.
 *
 * Features:
 * - Health monitoring (agent responsiveness)
 * - Memory cleanup (weak memories, cache)
 * - State repair (invariant violations)
 * - Resource management
 * - Automatic recovery
 *
 * Based on:
 * - Kubernetes liveness/readiness probes
 * - Self-healing systems patterns
 * - Autonomic computing (IBM, 2001)
 *
 * Usage:
 * ```typescript
 * import { createMaintenanceService } from './daemon/maintenance.js';
 *
 * const maintenance = createMaintenanceService({
 *   autoRepair: true,
 *   intervalMs: 300000, // 5 minutes
 * });
 *
 * // Run maintenance cycle
 * const report = await maintenance.runCycle();
 *
 * // Check specific component
 * const issues = await maintenance.checkHealth();
 * ```
 */

import { randomUUID } from 'crypto';
import {
  MaintenanceConfig,
  MaintenanceTask,
  MaintenanceAction,
  MaintenanceReport,
  MaintenanceIssue,
  TaskState,
  TaskPriority,
  DEFAULT_DAEMON_CONFIG,
} from './types.js';

// ============================================================================
// Health Check Types
// ============================================================================

export interface HealthCheckResult {
  component: string;
  healthy: boolean;
  latency?: number;
  details?: string;
  lastCheck: Date;
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  components: HealthCheckResult[];
  timestamp: Date;
}

// ============================================================================
// Maintenance Context
// ============================================================================

export interface MaintenanceContext {
  // Agent health checker (injected by Daemon)
  checkAgentHealth?: () => Promise<Array<{ id: string; healthy: boolean; latency?: number }>>;

  // Memory system access (injected by Daemon)
  getMemoryStats?: () => {
    total: number;
    byType: { episodic: number; semantic: number; procedural: number };
    avgRetention: number;
  };
  runMemoryForgetting?: () => { forgotten: number };
  runMemoryConsolidation?: () => Promise<{ consolidated: number }>;

  // Invariant checker (injected by Daemon)
  checkInvariants?: () => Promise<Array<{ id: string; satisfied: boolean; message?: string }>>;
  repairInvariant?: (id: string) => Promise<boolean>;

  // State access (injected by Daemon)
  getState?: () => { state: string; energy: number };
  resetState?: () => void;

  // Logger
  log?: (message: string, level?: 'debug' | 'info' | 'warn' | 'error') => void;
}

// ============================================================================
// Maintenance Service
// ============================================================================

export type MaintenanceEventType =
  | 'cycle_started'
  | 'cycle_completed'
  | 'issue_detected'
  | 'issue_resolved'
  | 'action_started'
  | 'action_completed'
  | 'action_failed';

export type MaintenanceEventHandler = (event: {
  type: MaintenanceEventType;
  data?: unknown;
}) => void;

export class MaintenanceService {
  private config: MaintenanceConfig;
  private context: MaintenanceContext;
  private tasks: Map<string, MaintenanceTask> = new Map();
  private issues: MaintenanceIssue[] = [];
  private cycleTimer: ReturnType<typeof setInterval> | null = null;
  private running: boolean = false;
  private eventHandlers: Set<MaintenanceEventHandler> = new Set();

  // Stats
  private cyclesRun: number = 0;
  private issuesDetected: number = 0;
  private issuesResolved: number = 0;
  private lastCycleAt: Date | null = null;

  constructor(config: Partial<MaintenanceConfig> = {}, context: MaintenanceContext = {}) {
    this.config = { ...DEFAULT_DAEMON_CONFIG.maintenance, ...config };
    this.context = context;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(): void {
    if (this.running) return;

    this.running = true;

    if (this.config.enabled) {
      this.cycleTimer = setInterval(
        () => this.runCycle(),
        this.config.intervalMs
      );

      // Run initial cycle
      this.runCycle();
    }
  }

  stop(): void {
    if (!this.running) return;

    this.running = false;

    if (this.cycleTimer) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  setContext(context: Partial<MaintenanceContext>): void {
    this.context = { ...this.context, ...context };
  }

  // ============================================================================
  // Main Cycle
  // ============================================================================

  async runCycle(): Promise<MaintenanceReport> {
    const startTime = Date.now();
    this.emit({ type: 'cycle_started' });
    this.log('Starting maintenance cycle');

    const report: MaintenanceReport = {
      timestamp: new Date(),
      duration: 0,
      tasksRun: 0,
      tasksSucceeded: 0,
      tasksFailed: 0,
      issues: [],
      actions: [],
    };

    try {
      // 1. Health checks
      const healthIssues = await this.checkHealth();
      report.issues.push(...healthIssues);

      // 2. Memory cleanup (if configured)
      const memoryIssues = await this.checkMemory();
      report.issues.push(...memoryIssues);

      // 3. Invariant checks
      const invariantIssues = await this.checkInvariants();
      report.issues.push(...invariantIssues);

      // 4. Resource checks
      const resourceIssues = await this.checkResources();
      report.issues.push(...resourceIssues);

      // Track detected issues
      this.issuesDetected += report.issues.length;

      // 5. Auto-repair if enabled
      if (this.config.autoRepair && report.issues.length > 0) {
        const actions = await this.autoRepair(report.issues);
        report.actions.push(...actions);

        report.tasksRun = actions.length;
        report.tasksSucceeded = actions.filter((a) => a.success).length;
        report.tasksFailed = actions.filter((a) => !a.success).length;

        // Update resolved count
        this.issuesResolved += report.issues.filter((i) => i.resolved).length;
      }
    } catch (err) {
      this.log(`Maintenance cycle error: ${err}`, 'error');
    }

    report.duration = Date.now() - startTime;
    this.cyclesRun++;
    this.lastCycleAt = new Date();

    this.emit({ type: 'cycle_completed', data: report });
    this.log(`Maintenance cycle completed: ${report.issues.length} issues, ${report.tasksRun} actions`);

    return report;
  }

  // ============================================================================
  // Health Checks
  // ============================================================================

  async checkHealth(): Promise<MaintenanceIssue[]> {
    const issues: MaintenanceIssue[] = [];

    if (!this.context.checkAgentHealth) {
      return issues; // No health checker available
    }

    try {
      const results = await this.context.checkAgentHealth();

      for (const result of results) {
        if (!result.healthy) {
          const issue: MaintenanceIssue = {
            type: 'agent_unhealthy',
            severity: 'warning',
            description: `Agent ${result.id} is not responding`,
            detected: new Date(),
            resolved: false,
          };
          issues.push(issue);
          this.issues.push(issue);
          this.emit({ type: 'issue_detected', data: issue });
        }

        // Check latency
        if (result.latency && result.latency > this.config.unhealthyAgentThreshold * 1000) {
          const issue: MaintenanceIssue = {
            type: 'agent_slow',
            severity: 'info',
            description: `Agent ${result.id} response time: ${result.latency}ms`,
            detected: new Date(),
            resolved: false,
          };
          issues.push(issue);
          this.issues.push(issue);
        }
      }
    } catch (err) {
      this.log(`Health check failed: ${err}`, 'error');
    }

    return issues;
  }

  // ============================================================================
  // Memory Checks
  // ============================================================================

  async checkMemory(): Promise<MaintenanceIssue[]> {
    const issues: MaintenanceIssue[] = [];

    if (!this.context.getMemoryStats) {
      return issues;
    }

    try {
      const stats = this.context.getMemoryStats();

      // Check retention threshold
      if (stats.avgRetention < this.config.memoryRetentionThreshold) {
        const issue: MaintenanceIssue = {
          type: 'memory_weak',
          severity: 'info',
          description: `Average memory retention (${(stats.avgRetention * 100).toFixed(1)}%) below threshold`,
          detected: new Date(),
          resolved: false,
        };
        issues.push(issue);
        this.issues.push(issue);
      }

      // Check total count (might indicate memory leak)
      if (stats.total > 10000) {
        const issue: MaintenanceIssue = {
          type: 'memory_overflow',
          severity: 'warning',
          description: `Memory count (${stats.total}) exceeds recommended limit`,
          detected: new Date(),
          resolved: false,
        };
        issues.push(issue);
        this.issues.push(issue);
      }
    } catch (err) {
      this.log(`Memory check failed: ${err}`, 'error');
    }

    return issues;
  }

  // ============================================================================
  // Invariant Checks
  // ============================================================================

  async checkInvariants(): Promise<MaintenanceIssue[]> {
    const issues: MaintenanceIssue[] = [];

    if (!this.context.checkInvariants) {
      return issues;
    }

    try {
      const results = await this.context.checkInvariants();

      for (const result of results) {
        if (!result.satisfied) {
          const issue: MaintenanceIssue = {
            type: 'invariant_violation',
            severity: 'critical',
            description: `Invariant ${result.id} violated: ${result.message || 'unknown reason'}`,
            detected: new Date(),
            resolved: false,
          };
          issues.push(issue);
          this.issues.push(issue);
          this.emit({ type: 'issue_detected', data: issue });
        }
      }
    } catch (err) {
      this.log(`Invariant check failed: ${err}`, 'error');
    }

    return issues;
  }

  // ============================================================================
  // Resource Checks
  // ============================================================================

  async checkResources(): Promise<MaintenanceIssue[]> {
    const issues: MaintenanceIssue[] = [];

    try {
      // Check memory usage (Node.js)
      const memUsage = process.memoryUsage();
      const heapUsed = memUsage.heapUsed / memUsage.heapTotal;

      if (heapUsed > this.config.resourceUsageThreshold) {
        const issue: MaintenanceIssue = {
          type: 'resource_memory_high',
          severity: 'warning',
          description: `Heap usage (${(heapUsed * 100).toFixed(1)}%) exceeds threshold`,
          detected: new Date(),
          resolved: false,
        };
        issues.push(issue);
        this.issues.push(issue);
      }

      // Check energy level
      if (this.context.getState) {
        const state = this.context.getState();
        if (state.energy < 0.1) {
          const issue: MaintenanceIssue = {
            type: 'energy_low',
            severity: 'critical',
            description: `Energy level (${(state.energy * 100).toFixed(1)}%) critically low`,
            detected: new Date(),
            resolved: false,
          };
          issues.push(issue);
          this.issues.push(issue);
        }
      }
    } catch (err) {
      this.log(`Resource check failed: ${err}`, 'error');
    }

    return issues;
  }

  // ============================================================================
  // Auto-Repair
  // ============================================================================

  async autoRepair(issues: MaintenanceIssue[]): Promise<MaintenanceTask[]> {
    const actions: MaintenanceTask[] = [];
    const concurrentTasks: Promise<void>[] = [];

    // Group by severity and type
    const byType = new Map<string, MaintenanceIssue[]>();
    for (const issue of issues) {
      const existing = byType.get(issue.type) || [];
      existing.push(issue);
      byType.set(issue.type, existing);
    }

    // Create repair tasks
    for (const [type, typeIssues] of byType) {
      const action = this.getRepairAction(type);
      if (!action) continue;

      // Limit concurrent repairs
      if (concurrentTasks.length >= this.config.maxConcurrentTasks) {
        await Promise.race(concurrentTasks);
      }

      const task = this.createTask(action, typeIssues[0].description);
      actions.push(task);

      const promise = this.executeRepair(task, typeIssues);
      concurrentTasks.push(promise);
    }

    await Promise.all(concurrentTasks);
    return actions;
  }

  private getRepairAction(issueType: string): MaintenanceAction | null {
    switch (issueType) {
      case 'agent_unhealthy':
      case 'agent_slow':
        return 'agent_restart';
      case 'memory_weak':
      case 'memory_overflow':
        return 'memory_cleanup';
      case 'invariant_violation':
        return 'invariant_repair';
      case 'resource_memory_high':
        return 'cache_clear';
      case 'energy_low':
        return 'state_reset'; // Enter dormancy
      default:
        return null;
    }
  }

  private createTask(action: MaintenanceAction, reason: string): MaintenanceTask {
    return {
      id: randomUUID(),
      action,
      priority: this.getActionPriority(action),
      state: 'pending',
      reason,
    };
  }

  private getActionPriority(action: MaintenanceAction): TaskPriority {
    switch (action) {
      case 'invariant_repair':
      case 'state_reset':
        return 'critical';
      case 'agent_restart':
        return 'high';
      case 'memory_cleanup':
      case 'health_check':
        return 'normal';
      case 'cache_clear':
      case 'log_rotation':
      case 'resource_reclaim':
        return 'low';
      default:
        return 'normal';
    }
  }

  private async executeRepair(task: MaintenanceTask, issues: MaintenanceIssue[]): Promise<void> {
    task.state = 'running';
    task.startedAt = new Date();
    this.tasks.set(task.id, task);
    this.emit({ type: 'action_started', data: task });

    try {
      switch (task.action) {
        case 'agent_restart':
          // Agent restart is handled by kernel
          this.log(`Would restart agents for: ${task.reason}`);
          task.success = true;
          break;

        case 'memory_cleanup':
          if (this.context.runMemoryForgetting) {
            const result = this.context.runMemoryForgetting();
            task.details = `Forgot ${result.forgotten} memories`;
            task.success = true;
          }
          break;

        case 'invariant_repair':
          if (this.context.repairInvariant) {
            // Extract invariant ID from issue
            const match = issues[0]?.description.match(/Invariant (\S+)/);
            if (match) {
              const repaired = await this.context.repairInvariant(match[1]);
              task.success = repaired;
              task.details = repaired ? 'Invariant repaired' : 'Repair failed';
            }
          }
          break;

        case 'cache_clear':
          // Force garbage collection if available
          if (global.gc) {
            global.gc();
            task.details = 'Forced garbage collection';
          }
          task.success = true;
          break;

        case 'state_reset':
          if (this.context.resetState) {
            this.context.resetState();
            task.details = 'State reset to safe mode';
            task.success = true;
          }
          break;

        case 'health_check':
          await this.checkHealth();
          task.success = true;
          break;

        default:
          task.details = `Unknown action: ${task.action}`;
          task.success = false;
      }

      // Mark issues as resolved if repair succeeded
      if (task.success) {
        for (const issue of issues) {
          issue.resolved = true;
          issue.resolution = task.details;
          this.emit({ type: 'issue_resolved', data: issue });
        }
      }

      task.state = task.success ? 'completed' : 'failed';
      this.emit({ type: 'action_completed', data: task });
    } catch (err) {
      task.state = 'failed';
      task.details = `Error: ${err}`;
      task.success = false;
      this.emit({ type: 'action_failed', data: { task, error: err } });
    }

    task.completedAt = new Date();
  }

  // ============================================================================
  // Manual Actions
  // ============================================================================

  async runAction(action: MaintenanceAction, target?: string): Promise<MaintenanceTask> {
    const task = this.createTask(action, target || 'Manual trigger');
    task.target = target;

    await this.executeRepair(task, []);
    return task;
  }

  async cleanupMemory(): Promise<{ forgotten: number; consolidated: number }> {
    let forgotten = 0;
    let consolidated = 0;

    if (this.context.runMemoryForgetting) {
      const result = this.context.runMemoryForgetting();
      forgotten = result.forgotten;
    }

    if (this.context.runMemoryConsolidation) {
      const result = await this.context.runMemoryConsolidation();
      consolidated = result.consolidated;
    }

    return { forgotten, consolidated };
  }

  // ============================================================================
  // Query
  // ============================================================================

  getIssues(options: {
    severity?: 'critical' | 'warning' | 'info';
    resolved?: boolean;
    limit?: number;
  } = {}): MaintenanceIssue[] {
    let result = [...this.issues];

    if (options.severity) {
      result = result.filter((i) => i.severity === options.severity);
    }

    if (options.resolved !== undefined) {
      result = result.filter((i) => i.resolved === options.resolved);
    }

    // Sort by date (newest first)
    result.sort((a, b) => b.detected.getTime() - a.detected.getTime());

    if (options.limit) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  getOpenIssues(): MaintenanceIssue[] {
    return this.getIssues({ resolved: false });
  }

  getTasks(): MaintenanceTask[] {
    return Array.from(this.tasks.values());
  }

  // ============================================================================
  // Stats
  // ============================================================================

  stats(): {
    cyclesRun: number;
    issuesDetected: number;
    issuesResolved: number;
    openIssues: number;
    lastCycleAt: Date | null;
    tasksTotal: number;
    tasksSucceeded: number;
    tasksFailed: number;
  } {
    const tasks = this.getTasks();
    return {
      cyclesRun: this.cyclesRun,
      issuesDetected: this.issuesDetected,
      issuesResolved: this.issuesResolved,
      openIssues: this.getOpenIssues().length,
      lastCycleAt: this.lastCycleAt,
      tasksTotal: tasks.length,
      tasksSucceeded: tasks.filter((t) => t.success).length,
      tasksFailed: tasks.filter((t) => t.success === false).length,
    };
  }

  // ============================================================================
  // Events
  // ============================================================================

  on(handler: MaintenanceEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: { type: MaintenanceEventType; data?: unknown }): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('Maintenance event handler error:', err);
      }
    }
  }

  // ============================================================================
  // Logging
  // ============================================================================

  private log(message: string, level: 'debug' | 'info' | 'warn' | 'error' = 'info'): void {
    if (this.context.log) {
      this.context.log(message, level);
    } else {
      const prefix = '[Maintenance]';
      switch (level) {
        case 'debug':
          if (process.env.LOG_LEVEL === 'debug') console.log(`${prefix} ${message}`);
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

// ============================================================================
// Factory
// ============================================================================

export function createMaintenanceService(
  config?: Partial<MaintenanceConfig>,
  context?: MaintenanceContext
): MaintenanceService {
  return new MaintenanceService(config, context);
}
