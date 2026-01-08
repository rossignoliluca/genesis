/**
 * Genesis 6.0 - Daemon Module Types
 *
 * Types for background task scheduling, maintenance, and dream mode.
 *
 * Based on:
 * - Node.js daemon patterns
 * - Self-healing systems (Kubernetes liveness/readiness)
 * - Sleep consolidation research (Walker, 2017)
 */

// ============================================================================
// Daemon State
// ============================================================================

export type DaemonState =
  | 'stopped'       // Not running
  | 'starting'      // Initialization
  | 'running'       // Normal operation
  | 'dreaming'      // Dream mode (offline consolidation)
  | 'maintaining'   // Self-repair in progress
  | 'stopping'      // Graceful shutdown
  | 'error';        // Error state

export interface DaemonStatus {
  state: DaemonState;
  uptime: number;           // Milliseconds since start
  startedAt: Date | null;
  lastHeartbeat: Date;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  dreamCycles: number;
  maintenanceCycles: number;
  errors: DaemonError[];
}

export interface DaemonError {
  timestamp: Date;
  code: string;
  message: string;
  source: 'scheduler' | 'maintenance' | 'dream' | 'task';
  recovered: boolean;
}

// ============================================================================
// Scheduler Types
// ============================================================================

export type TaskPriority = 'critical' | 'high' | 'normal' | 'low' | 'idle';

export type TaskState =
  | 'pending'       // Waiting to run
  | 'scheduled'     // Has a scheduled time
  | 'running'       // Currently executing
  | 'completed'     // Finished successfully
  | 'failed'        // Failed execution
  | 'cancelled'     // Cancelled before completion
  | 'paused';       // Temporarily paused

export interface ScheduledTask {
  id: string;
  name: string;
  description?: string;
  state: TaskState;
  priority: TaskPriority;

  // Scheduling
  schedule: TaskSchedule;
  nextRun: Date | null;
  lastRun: Date | null;

  // Execution
  handler: TaskHandler;
  timeout: number;          // Max execution time (ms)
  retries: number;          // Retry count on failure
  retryDelay: number;       // Delay between retries (ms)

  // Stats
  runCount: number;
  successCount: number;
  failureCount: number;
  avgDuration: number;      // Average execution time (ms)

  // Metadata
  createdAt: Date;
  tags: string[];
}

export type TaskSchedule =
  | { type: 'once'; at: Date }
  | { type: 'interval'; intervalMs: number }
  | { type: 'cron'; expression: string }
  | { type: 'immediate' }
  | { type: 'manual' };     // Only run when triggered

export type TaskHandler = (context: TaskContext) => Promise<TaskResult>;

export interface TaskContext {
  taskId: string;
  attempt: number;          // Current attempt (1-based)
  maxAttempts: number;
  startedAt: Date;
  timeout: number;
  signal: AbortSignal;      // For cancellation
  logger: TaskLogger;
}

export interface TaskLogger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: Error): void;
}

export interface TaskResult {
  success: boolean;
  duration: number;         // Execution time (ms)
  output?: unknown;
  error?: Error;
  metrics?: Record<string, number>;
}

export interface CreateTaskOptions {
  name: string;
  description?: string;
  handler: TaskHandler;
  schedule: TaskSchedule;
  priority?: TaskPriority;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  tags?: string[];
}

// ============================================================================
// Maintenance Types
// ============================================================================

export type MaintenanceAction =
  | 'agent_restart'         // Restart unresponsive agent
  | 'memory_cleanup'        // Clear old/weak memories
  | 'cache_clear'           // Clear caches
  | 'health_check'          // Run health checks
  | 'invariant_repair'      // Attempt to fix invariant violations
  | 'state_reset'           // Reset to known good state
  | 'log_rotation'          // Rotate/archive logs
  | 'resource_reclaim';     // Free unused resources

export interface MaintenanceTask {
  id: string;
  action: MaintenanceAction;
  target?: string;          // Specific target (agent id, memory type, etc.)
  priority: TaskPriority;
  state: TaskState;
  reason: string;           // Why maintenance is needed

  // Results
  startedAt?: Date;
  completedAt?: Date;
  success?: boolean;
  details?: string;
}

export interface MaintenanceConfig {
  enabled: boolean;
  intervalMs: number;                   // How often to check (default: 5 minutes)
  healthCheckIntervalMs: number;        // Health check frequency (default: 1 minute)
  memoryCleanupIntervalMs: number;      // Memory cleanup frequency (default: 1 hour)
  autoRepair: boolean;                  // Automatically repair issues
  maxConcurrentTasks: number;           // Max parallel maintenance tasks

  // Thresholds
  unhealthyAgentThreshold: number;      // Seconds before agent restart
  memoryRetentionThreshold: number;     // Retention below this triggers cleanup
  resourceUsageThreshold: number;       // Resource usage % triggering cleanup
}

export interface MaintenanceReport {
  timestamp: Date;
  duration: number;
  tasksRun: number;
  tasksSucceeded: number;
  tasksFailed: number;
  issues: MaintenanceIssue[];
  actions: MaintenanceTask[];
}

export interface MaintenanceIssue {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  detected: Date;
  resolved: boolean;
  resolution?: string;
}

// ============================================================================
// Dream Mode Types
// ============================================================================

export type DreamPhase =
  | 'light'         // Light sleep - initial consolidation
  | 'deep'          // Deep sleep - memory consolidation
  | 'rem'           // REM - pattern synthesis, creativity
  | 'wake';         // Waking up

export interface DreamConfig {
  enabled: boolean;
  autoTrigger: boolean;                 // Trigger based on inactivity
  inactivityThresholdMs: number;        // Inactivity before auto-dream
  minDreamDurationMs: number;           // Minimum dream cycle
  maxDreamDurationMs: number;           // Maximum dream cycle

  // Phase durations (relative to total dream time)
  lightSleepRatio: number;              // 0.1 = 10% of dream time
  deepSleepRatio: number;               // 0.6 = 60%
  remSleepRatio: number;                // 0.3 = 30%

  // Consolidation settings
  episodicConsolidationThreshold: number;   // Min episodes for consolidation
  patternExtractionThreshold: number;       // Occurrences to extract pattern
  creativityTemperature: number;            // 0-1, higher = more creative
}

export interface DreamSession {
  id: string;
  startedAt: Date;
  endedAt?: Date;
  phase: DreamPhase;

  // Phase transitions
  phaseHistory: Array<{
    phase: DreamPhase;
    enteredAt: Date;
    exitedAt?: Date;
  }>;

  // Results
  results?: DreamResults;
  interrupted: boolean;
  interruptReason?: string;
}

export interface DreamResults {
  // Memory consolidation
  episodesProcessed: number;
  memoriesConsolidated: number;
  patternsExtracted: number;
  skillsReinforced: number;
  memoriesForgotten: number;

  // Creativity (REM phase)
  newAssociations: number;
  novelIdeas: string[];

  // Health
  stateRepairs: number;
  invariantsChecked: number;
}

export interface DreamMetrics {
  totalDreamTime: number;           // Cumulative dream time (ms)
  dreamCycles: number;              // Number of complete cycles
  avgCycleDuration: number;         // Average cycle duration (ms)
  consolidationRate: number;        // Memories consolidated per hour
  patternExtractionRate: number;    // Patterns per dream cycle
  lastDreamAt: Date | null;
  nextScheduledDream: Date | null;
}

// ============================================================================
// Daemon Configuration
// ============================================================================

export interface DaemonConfig {
  // General
  enabled: boolean;
  heartbeatIntervalMs: number;      // Daemon heartbeat (default: 30s)
  maxErrors: number;                // Errors before forced stop

  // Components
  scheduler: {
    enabled: boolean;
    maxConcurrentTasks: number;
    defaultTimeout: number;
    defaultRetries: number;
  };

  maintenance: MaintenanceConfig;

  dream: DreamConfig;

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logToFile: boolean;
  logFilePath?: string;
}

export const DEFAULT_DAEMON_CONFIG: DaemonConfig = {
  enabled: true,
  heartbeatIntervalMs: 30000,
  maxErrors: 10,

  scheduler: {
    enabled: true,
    maxConcurrentTasks: 5,
    defaultTimeout: 60000,
    defaultRetries: 3,
  },

  maintenance: {
    enabled: true,
    intervalMs: 300000,                 // 5 minutes
    healthCheckIntervalMs: 60000,       // 1 minute
    memoryCleanupIntervalMs: 3600000,   // 1 hour
    autoRepair: true,
    maxConcurrentTasks: 3,
    unhealthyAgentThreshold: 30,        // 30 seconds
    memoryRetentionThreshold: 0.1,      // 10% retention
    resourceUsageThreshold: 0.9,        // 90% usage
  },

  dream: {
    enabled: true,
    autoTrigger: true,
    inactivityThresholdMs: 1800000,     // 30 minutes
    minDreamDurationMs: 60000,          // 1 minute
    maxDreamDurationMs: 600000,         // 10 minutes
    lightSleepRatio: 0.1,
    deepSleepRatio: 0.6,
    remSleepRatio: 0.3,
    episodicConsolidationThreshold: 10,
    patternExtractionThreshold: 3,
    creativityTemperature: 0.7,
  },

  logLevel: 'info',
  logToFile: false,
};

// ============================================================================
// Events
// ============================================================================

export type DaemonEventType =
  | 'daemon_started'
  | 'daemon_stopped'
  | 'daemon_error'
  | 'task_scheduled'
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'task_cancelled'
  | 'maintenance_started'
  | 'maintenance_completed'
  | 'maintenance_issue'
  | 'dream_started'
  | 'dream_phase_changed'
  | 'dream_completed'
  | 'dream_interrupted';

export interface DaemonEvent {
  type: DaemonEventType;
  timestamp: Date;
  data: unknown;
}

export type DaemonEventHandler = (event: DaemonEvent) => void;
