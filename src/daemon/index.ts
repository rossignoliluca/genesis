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
import { emitSystemError } from '../bus/index.js';

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

  // Neuromodulation system (from src/neuromodulation/)
  neuromodulation?: {
    getLevels: () => {
      dopamine: number;
      serotonin: number;
      norepinephrine: number;
      cortisol: number;
    };
    calm: (magnitude: number, cause: string) => void;
    reward: (magnitude: number, cause: string) => void;
    threat: (magnitude: number, cause: string) => void;
    modulate: (modulator: 'dopamine' | 'serotonin' | 'norepinephrine' | 'cortisol', delta: number, cause: string) => void;
  };

  // Nociception system (from src/nociception/)
  nociception?: {
    getState: () => {
      overallLevel: 'none' | 'discomfort' | 'pain' | 'agony';
      aggregatePain: number;
      chronic: boolean;
    };
    stimulus: (source: string, intensity: number, message: string) => void;
    resolve: (signalId: string) => boolean;
    resolveSource: (source: string) => number;
    onPain: (handler: (state: { overallLevel: string; aggregatePain: number }) => void) => () => void;
  };

  // Allostasis system (from src/allostasis/)
  allostasis?: {
    getState: () => {
      energy: number;
      computationalLoad: number;
      memoryPressure: number;
      errorRate: number;
    };
    needsRegulation: () => boolean;
    regulate: () => Promise<{ type: string; reason: string } | null>;
    registerSensor: (variable: string, callback: () => number) => void;
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

  // Unsubscribe handlers for nociception/allostasis
  private nociceptionUnsubscribe: (() => void) | null = null;
  private allostasisCheckTimer: ReturnType<typeof setInterval> | null = null;

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

    // v13.9: Wire nociception → maintenance (pain triggers repair)
    this.setupNociceptionWiring();

    // v13.9: Wire allostasis → dream (low energy triggers sleep)
    this.setupAllostasisWiring();
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
      () => {
        try {
          this.heartbeat();
        } catch (err) {
          console.error('[daemon] Timer error:', err);
        }
      },
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

    // v13.9: Clean up nociception subscription
    if (this.nociceptionUnsubscribe) {
      this.nociceptionUnsubscribe();
      this.nociceptionUnsubscribe = null;
    }

    // v13.9: Clean up allostasis timer
    if (this.allostasisCheckTimer) {
      clearInterval(this.allostasisCheckTimer);
      this.allostasisCheckTimer = null;
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
    } catch (error) {
      emitSystemError('daemon', error, 'warning');
      throw error;
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

    // v11.1: Competitive Intelligence scan
    if (this.config.competitiveIntel?.enabled && this.config.competitiveIntel.competitors.length > 0) {
      this.scheduler.schedule({
        name: 'compintel-scan',
        description: 'Competitive Intelligence: scan competitors and generate insights',
        schedule: { type: 'interval', intervalMs: this.config.competitiveIntel.checkIntervalMs },
        priority: 'normal',
        timeout: 120000, // 2 minutes max per scan
        handler: async (ctx) => {
          ctx.logger.info('Running CompIntel scan...');
          const startTime = Date.now();
          try {
            const { createCompetitiveIntelService } = await import('../services/competitive-intel.js');
            const { createRevenueLoop } = await import('../services/revenue-loop.js');

            const ciConfig = this.config.competitiveIntel;

            // Check subscription if required
            if (ciConfig.requireSubscription && ciConfig.customerId) {
              const revenueLoop = createRevenueLoop();
              const sub = await revenueLoop.checkSubscription(ciConfig.customerId);
              if (!sub.valid) {
                ctx.logger.warn(`CompIntel scan skipped: ${sub.reason}`);
                return {
                  success: true,
                  duration: Date.now() - startTime,
                  output: { skipped: true, reason: sub.reason },
                };
              }
              ctx.logger.info(`Subscription valid: plan=${sub.plan}, competitors=${sub.maxCompetitors}`);
            }

            // Run scan
            const service = createCompetitiveIntelService({
              competitors: ciConfig.competitors,
            });

            const changes = await service.checkAll();
            ctx.logger.info(`Scan complete: ${changes.length} changes detected`);

            // Generate digest if changes found
            let digest;
            if (changes.length > 0) {
              digest = await service.generateDigest(24);
              ctx.logger.info(`Digest: ${digest.keyInsights.length} insights, ${digest.recommendations.length} recommendations`);

              // Emit event for downstream consumers
              this.emit({
                type: 'task_completed',
                timestamp: new Date(),
                data: {
                  task: 'compintel-scan',
                  changes: changes.length,
                  insights: digest.keyInsights,
                  recommendations: digest.recommendations,
                },
              });
            }

            return {
              success: true,
              duration: Date.now() - startTime,
              output: {
                competitors: ciConfig.competitors.length,
                changes: changes.length,
                digest: digest ? {
                  insights: digest.keyInsights.length,
                  recommendations: digest.recommendations.length,
                } : null,
              },
            };
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            ctx.logger.error(`CompIntel scan failed: ${error.message}`);
            return {
              success: false,
              duration: Date.now() - startTime,
              error,
            };
          }
        },
        tags: ['revenue', 'compintel', 'scan'],
      });

      this.log(`CompIntel daemon: monitoring ${this.config.competitiveIntel.competitors.length} competitors every ${(this.config.competitiveIntel.checkIntervalMs / 3600000).toFixed(1)}h`);
    }
  }

  /**
   * v13.9: Wire nociception system to trigger maintenance on pain
   * When pain signals reach 'pain' or 'agony' level, run maintenance cycle
   */
  private setupNociceptionWiring(): void {
    if (!this.deps.nociception) return;

    this.nociceptionUnsubscribe = this.deps.nociception.onPain((state) => {
      if (state.overallLevel === 'pain' || state.overallLevel === 'agony') {
        this.log(`Nociception triggered maintenance: ${state.overallLevel} (intensity: ${state.aggregatePain.toFixed(2)})`, 'warn');

        // Signal neuromodulation if available
        if (this.deps.neuromodulation) {
          this.deps.neuromodulation.threat(state.aggregatePain * 0.5, `nociception:${state.overallLevel}`);
        }

        // Trigger maintenance if not already running
        if (this.state === 'running') {
          this.runMaintenance().catch(err => {
            this.log(`Pain-triggered maintenance failed: ${err}`, 'error');
          });
        }
      } else if (state.overallLevel === 'none' || state.overallLevel === 'discomfort') {
        // Pain resolved - signal calm
        if (this.deps.neuromodulation) {
          this.deps.neuromodulation.calm(0.1, 'nociception:pain-resolved');
        }
      }
    });

    this.log('Nociception → Maintenance wiring established');
  }

  /**
   * v13.9: Wire allostasis system to trigger dreams on low energy
   * When energy drops below threshold and regulation recommends hibernate, start dream
   */
  private setupAllostasisWiring(): void {
    if (!this.deps.allostasis) return;

    // Check allostasis state periodically
    this.allostasisCheckTimer = setInterval(async () => {
      try {
      if (!this.deps.allostasis || this.state !== 'running') return;

      const alloState = this.deps.allostasis.getState();

      // Low energy threshold - consider dream mode
      if (alloState.energy < 0.3 && !this.isDreaming()) {
        if (this.deps.allostasis.needsRegulation()) {
          const action = await this.deps.allostasis.regulate();

          if (action?.type === 'hibernate') {
            this.log(`Allostasis recommends hibernate (energy: ${alloState.energy.toFixed(2)}). Triggering dream.`);

            // Signal neuromodulation to prepare for sleep
            if (this.deps.neuromodulation) {
              this.deps.neuromodulation.calm(0.3, 'allostasis:low-energy');
            }

            // Start dream session
            this.dream().catch(err => {
              this.log(`Allostasis-triggered dream failed: ${err}`, 'error');
            });
          }
        }
      }

      // High computational load - signal stress
      if (alloState.computationalLoad > 0.8 && this.deps.neuromodulation) {
        this.deps.neuromodulation.threat(0.2, 'allostasis:high-load');
      }

      // High error rate - signal nociception if available
      if (alloState.errorRate > 0.1 && this.deps.nociception) {
        this.deps.nociception.stimulus('cognitive', alloState.errorRate, 'High error rate detected');
      }
      } catch (err) {
        console.error('[daemon] Allostasis check timer error:', err);
      }
    }, 30000); // Check every 30 seconds

    this.log('Allostasis → Dream wiring established');
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
            // Use the full consolidation service - it handles episode → semantic conversion
            try {
              const result = await this.deps.memory!.consolidation.sleep();
              if (result.consolidated > 0) {
                this.log(`Consolidated ${result.consolidated} memories during dream`);
                return { concept: `Consolidated batch including ${episodeId}` };
              }
              return null;
            } catch (err) {
              this.log(`Consolidation failed: ${err}`, 'error');
              return null;
            }
          }
        : undefined,
      extractPattern: this.deps.memory
        ? async (episodeIds: string[]) => {
            // Pattern extraction: analyze episodes for commonalities
            try {
              const episodes = this.deps.memory!.episodic.getAll();
              const relevantEpisodes = episodes.filter(e => episodeIds.includes(e.id));

              if (relevantEpisodes.length < 2) return null;

              // Find common tags across episodes
              const tagCounts = new Map<string, number>();
              for (const ep of relevantEpisodes) {
                for (const tag of ep.tags) {
                  tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                }
              }

              // Find tags that appear in at least half the episodes
              const threshold = Math.ceil(relevantEpisodes.length / 2);
              const commonTags = Array.from(tagCounts.entries())
                .filter(([_, count]) => count >= threshold)
                .map(([tag]) => tag);

              if (commonTags.length > 0) {
                const pattern = `Pattern from ${relevantEpisodes.length} episodes: ${commonTags.join(', ')}`;
                this.log(`Extracted pattern: ${pattern}`);
                return { pattern, confidence: commonTags.length / relevantEpisodes.length };
              }
              return null;
            } catch (err) {
              this.log(`Pattern extraction failed: ${err}`, 'error');
              return null;
            }
          }
        : undefined,
      forgetMemory: this.deps.memory
        ? (memoryId: string) => {
            // Use the forgetting service
            try {
              const result = this.deps.memory!.episodic.runForgetting();
              if (result.forgotten > 0) {
                this.log(`Forgot ${result.forgotten} weak memories`);
                return true;
              }
              return false;
            } catch (err) {
              this.log(`Forgetting failed: ${err}`, 'error');
              return false;
            }
          }
        : undefined,
      // CRITICAL: reinforceSkill enables procedural learning during dreams
      reinforceSkill: this.deps.memory
        ? async (skillId: string) => {
            try {
              const skills = this.deps.memory!.procedural.getAll();
              const skill = skills.find(s => s.id === skillId);
              if (!skill) return false;

              // Mental rehearsal: simulate successful execution to strengthen skill
              // This mimics "practice during sleep" observed in neuroscience
              // The skill's stability increases, making it more retrievable
              this.log(`Reinforcing skill: ${skill.name} (success rate: ${(skill.successRate * 100).toFixed(1)}%)`);

              // Note: The actual recordExecution call happens in boot-72h.ts
              // where we have direct access to the full ProceduralStore API.
              // Here we just indicate that reinforcement should happen.
              // The dream mode tracks this in skillsReinforced count.

              return true;
            } catch (err) {
              this.log(`Skill reinforcement failed: ${err}`, 'error');
              return false;
            }
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
            // Attempt repairs on violated invariants
            try {
              const invariants = await this.deps.kernel!.checkInvariants();
              const violated = invariants.filter(i => !i.satisfied);
              let repaired = 0;

              for (const inv of violated) {
                const success = await this.deps.kernel!.repairInvariant(inv.id);
                if (success) repaired++;
              }

              if (repaired > 0) {
                this.log(`Repaired ${repaired}/${violated.length} invariant violations`);
              }
              return repaired;
            } catch (err) {
              this.log(`State repair failed: ${err}`, 'error');
              return 0;
            }
          }
        : undefined,
      // v13.9: Neuromodulation during sleep phases
      // Biological sleep modulates neurotransmitters differently per phase
      modulateForSleep: this.deps.neuromodulation
        ? (phase: 'light' | 'deep' | 'rem' | 'wake') => {
            const neuro = this.deps.neuromodulation!;
            switch (phase) {
              case 'light':
                // Light sleep: Begin calming, mild cortisol reduction
                neuro.calm(0.2, 'dream:light-sleep');
                break;
              case 'deep':
                // Deep sleep: Maximum restorative effect
                // Strong cortisol reduction, serotonin boost, NE reduction
                neuro.calm(0.4, 'dream:deep-sleep');
                neuro.modulate('serotonin', 0.15, 'dream:deep-sleep');
                neuro.modulate('norepinephrine', -0.2, 'dream:deep-sleep');
                break;
              case 'rem':
                // REM: Creativity burst - dopamine spike, low NE for diffuse associations
                neuro.modulate('dopamine', 0.25, 'dream:rem-creativity');
                neuro.modulate('norepinephrine', -0.15, 'dream:rem-diffuse');
                break;
              case 'wake':
                // Wake: Return to alert state - NE increase, mild dopamine
                neuro.modulate('norepinephrine', 0.2, 'dream:wake-alertness');
                neuro.modulate('dopamine', 0.1, 'dream:wake-motivation');
                break;
            }
            this.log(`Neuromodulation applied for ${phase} phase`, 'debug');
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
