/**
 * Runtime Observatory — Tracks module health via bus events
 *
 * Subscribes to all bus events and builds real-time health metrics.
 * Persists health data across sessions.
 */

import { createSubscriber } from '../bus/index.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import type {
  ModuleHealth,
  ModuleHealthStatus,
  RuntimeSnapshot,
  SessionLogEntry,
  PersistedSelfModel,
} from './types.js';
import type {
  BusEvent,
  TaskFailedEvent,
  PanicEvent,
  ToolExecutedEvent,
  AntifragileFailureEvent,
} from '../bus/events.js';

// Use __dirname for path resolution (CommonJS pattern works in NodeNext)
const __dirname = resolve(__filename, '..');

// ============================================================================
// Runtime Observatory
// ============================================================================

export class RuntimeObservatory {
  private persistPath: string;
  private healthMap: Map<string, ModuleHealth> = new Map();
  private recentErrors: Array<{ module: string; error: string; timestamp: string }> = [];
  private subscriber: ReturnType<typeof createSubscriber> | null = null;
  private sessionStart: string;
  private totalEventsThisSession = 0;
  private errorsThisSession = 0;

  constructor(persistPath: string) {
    this.persistPath = persistPath;
    this.sessionStart = new Date().toISOString();
  }

  /**
   * Start monitoring bus events
   */
  start(): void {
    if (this.subscriber) {
      console.warn('[RuntimeObservatory] Already started');
      return;
    }

    this.loadPersisted();
    this.subscriber = createSubscriber('self-model-observatory');

    // Kernel events
    this.subscriber.on('kernel.task.completed', () => {
      this.recordSuccess('kernel');
    });

    this.subscriber.on('kernel.task.failed', (e: TaskFailedEvent) => {
      this.recordFailure('kernel', e.error || 'unknown error');
    });

    this.subscriber.on('kernel.panic', (e: PanicEvent) => {
      this.recordFailure('kernel', e.reason);
    });

    // Brain events
    this.subscriber.on('brain.tool.executed', (e: ToolExecutedEvent) => {
      if (e.success) {
        this.recordSuccess('brain');
      } else {
        this.recordFailure('brain', 'tool execution failed');
      }
    });

    this.subscriber.on('brain.cycle.completed', () => {
      this.recordSuccess('brain');
    });

    // Consciousness events
    this.subscriber.on('consciousness.phi.updated', () => {
      this.recordSuccess('consciousness');
    });

    // Memory events
    this.subscriber.on('memory.recalled', () => {
      this.recordSuccess('memory');
    });

    this.subscriber.on('memory.consolidated', () => {
      this.recordSuccess('memory');
    });

    // Antifragile events
    this.subscriber.on('antifragile.failure.captured', (e: AntifragileFailureEvent) => {
      this.recordFailure(e.source || 'antifragile', 'failure captured');
    });

    this.subscriber.on('antifragile.pattern.learned', () => {
      this.recordSuccess('antifragile');
    });

    // Prefix-based handlers for domain events
    this.subscribeToPrefix('semiotics.', 'semiotics');
    this.subscribeToPrefix('morphogenetic.', 'morphogenetic');
    this.subscribeToPrefix('strange-loop.', 'strange-loop');
    this.subscribeToPrefix('second-order.', 'second-order');
    this.subscribeToPrefix('rsi.', 'rsi');
    this.subscribeToPrefix('autopoiesis.', 'autopoiesis');
    this.subscribeToPrefix('swarm.', 'swarm');
    this.subscribeToPrefix('symbiotic.', 'symbiotic');
    this.subscribeToPrefix('embodiment.', 'embodiment');
    this.subscribeToPrefix('daemon.', 'daemon');
    this.subscribeToPrefix('finance.', 'finance');
    this.subscribeToPrefix('polymarket.', 'polymarket');
    this.subscribeToPrefix('content.', 'content');
    this.subscribeToPrefix('strategy.', 'market-strategist');
    this.subscribeToPrefix('horizon.', 'horizon-scanner');
    this.subscribeToPrefix('toolfactory.', 'tool-factory');
    this.subscribeToPrefix('revenue.', 'revenue');
    this.subscribeToPrefix('allostasis.', 'allostasis');
    this.subscribeToPrefix('neuromod.', 'neuromodulation');
    this.subscribeToPrefix('inference.', 'active-inference');
    this.subscribeToPrefix('active-inference.', 'active-inference');
    this.subscribeToPrefix('economy.', 'economy');
    this.subscribeToPrefix('umwelt.', 'umwelt');
    this.subscribeToPrefix('worldmodel.', 'world-model');
    this.subscribeToPrefix('pain.', 'nociception');
    this.subscribeToPrefix('x402.', 'payments');
    this.subscribeToPrefix('cli.', 'cli');
  }

  private subscribeToPrefix(prefix: string, moduleName: string): void {
    if (!this.subscriber) return;

    this.subscriber.onPrefix(prefix, (event: BusEvent) => {
      // Check if event indicates error/failure
      const hasError = this.checkEventForError(event);

      if (hasError) {
        const errorMsg = this.extractErrorMessage(event);
        this.recordFailure(moduleName, errorMsg);
      } else {
        this.recordSuccess(moduleName);
      }
    });
  }

  private checkEventForError(event: BusEvent): boolean {
    // Type-safe check for common error indicators
    const evt = event as any;
    return !!(
      evt.error ||
      evt.failed ||
      evt.failure ||
      (evt.success === false) ||
      (evt.phase === 'failed') ||
      (evt.status === 'failed') ||
      (evt.status === 'error')
    );
  }

  private extractErrorMessage(event: BusEvent): string {
    const evt = event as any;
    return (
      evt.error ||
      evt.reason ||
      evt.errorType ||
      evt.description ||
      'event indicated failure'
    );
  }

  recordSuccess(moduleName: string): void {
    const health = this.getOrCreateHealth(moduleName);
    health.successCount++;
    health.lastSuccess = new Date().toISOString();
    health.lastEventTime = health.lastSuccess;
    health.eventCount++;
    this.totalEventsThisSession++;
    this.updateHealthScore(health);
  }

  recordFailure(moduleName: string, error: string): void {
    const health = this.getOrCreateHealth(moduleName);
    health.failureCount++;
    health.lastError = error;
    health.lastErrorTime = new Date().toISOString();
    health.lastEventTime = health.lastErrorTime;
    health.eventCount++;
    this.totalEventsThisSession++;
    this.errorsThisSession++;
    this.updateHealthScore(health);

    // Add to recent errors (capped at 50)
    this.recentErrors.push({
      module: moduleName,
      error,
      timestamp: health.lastErrorTime,
    });
    if (this.recentErrors.length > 50) {
      this.recentErrors.shift();
    }
  }

  getHealth(moduleName: string): ModuleHealth {
    return this.getOrCreateHealth(moduleName);
  }

  private getOrCreateHealth(moduleName: string): ModuleHealth {
    if (!this.healthMap.has(moduleName)) {
      this.healthMap.set(moduleName, {
        moduleName,
        status: 'untested',
        successCount: 0,
        failureCount: 0,
        lastSuccess: null,
        lastError: null,
        lastErrorTime: null,
        lastEventTime: null,
        avgLatencyMs: 0,
        healthScore: 0,
        eventCount: 0,
      });
    }
    return this.healthMap.get(moduleName)!;
  }

  private updateHealthScore(health: ModuleHealth): void {
    const total = health.successCount + health.failureCount;
    const successRate = total > 0 ? health.successCount / total : 0;

    const now = Date.now();
    const lastEvent = health.lastEventTime ? new Date(health.lastEventTime).getTime() : 0;
    const minutesSinceLastEvent = (now - lastEvent) / 60000;
    const recencyFactor = Math.max(0, 1 - minutesSinceLastEvent / 60); // decays over 1 hour

    health.healthScore = successRate * 0.7 + recencyFactor * 0.3;

    // Update status
    health.status = this.deriveStatus(health, minutesSinceLastEvent);
  }

  private deriveStatus(health: ModuleHealth, minutesSinceLastEvent: number): ModuleHealthStatus {
    if (health.eventCount === 0) return 'untested';
    if (minutesSinceLastEvent > 30) return 'dormant';
    if (health.healthScore < 0.3 && health.failureCount >= 3) return 'broken';
    if (health.healthScore < 0.7 || health.failureCount > 0) return 'degraded';
    return 'working';
  }

  getSnapshot(): RuntimeSnapshot {
    const now = new Date().toISOString();
    const sessionStartMs = new Date(this.sessionStart).getTime();
    const uptimeMs = Date.now() - sessionStartMs;

    let modulesActive = 0;
    let modulesWithErrors = 0;

    const health: Record<string, ModuleHealth> = {};

    for (const [name, h] of Array.from(this.healthMap.entries())) {
      health[name] = h;
      if (h.status === 'working' || h.status === 'degraded') {
        modulesActive++;
      }
      if (h.failureCount > 0) {
        modulesWithErrors++;
      }
    }

    // Aggregate top errors
    const errorCounts = new Map<string, { module: string; error: string; count: number }>();
    for (const { module, error } of this.recentErrors) {
      const key = `${module}:${error}`;
      if (!errorCounts.has(key)) {
        errorCounts.set(key, { module, error, count: 0 });
      }
      errorCounts.get(key)!.count++;
    }

    const topErrors = Array.from(errorCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      capturedAt: now,
      uptimeMs,
      modulesActive,
      modulesWithErrors,
      totalEvents: this.totalEventsThisSession,
      topErrors,
      health,
    };
  }

  getRecentErrors(): Array<{ module: string; error: string; timestamp: string }> {
    return [...this.recentErrors];
  }

  getSessionEntry(): SessionLogEntry {
    return {
      startedAt: this.sessionStart,
      endedAt: new Date().toISOString(),
      eventsProcessed: this.totalEventsThisSession,
      errorsDetected: this.errorsThisSession,
    };
  }

  persist(): void {
    try {
      // Ensure directory exists
      const dir = dirname(this.persistPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Load existing data
      let existing: PersistedSelfModel | null = null;
      if (existsSync(this.persistPath)) {
        try {
          const data = readFileSync(this.persistPath, 'utf-8');
          existing = JSON.parse(data);
        } catch {
          // Start fresh if can't parse
        }
      }

      // Merge health data
      const healthRecord: Record<string, ModuleHealth> = existing?.health || {};
      for (const [name, health] of Array.from(this.healthMap.entries())) {
        healthRecord[name] = health;
      }

      // Merge session log
      const sessionLog = existing?.sessionLog || [];
      sessionLog.push(this.getSessionEntry());

      // Limit session log size
      const maxSessions = 50;
      if (sessionLog.length > maxSessions) {
        sessionLog.splice(0, sessionLog.length - maxSessions);
      }

      const persisted: PersistedSelfModel = {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        manifest: existing?.manifest || [],
        health: healthRecord,
        proposals: existing?.proposals || [],
        sessionLog,
      };

      writeFileSync(this.persistPath, JSON.stringify(persisted, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[RuntimeObservatory] Failed to persist:', err);
    }
  }

  loadPersisted(): void {
    try {
      if (!existsSync(this.persistPath)) return;

      const data = readFileSync(this.persistPath, 'utf-8');
      const persisted: PersistedSelfModel = JSON.parse(data);

      // Load health data
      for (const [name, health] of Object.entries(persisted.health || {})) {
        this.healthMap.set(name, health);
      }
    } catch (err) {
      console.warn('[RuntimeObservatory] Failed to load persisted data:', err);
    }
  }

  shutdown(): void {
    if (this.subscriber) {
      this.subscriber.unsubscribeAll();
      this.subscriber = null;
    }
    this.persist();
  }
}

// ============================================================================
// Singleton
// ============================================================================

let singleton: RuntimeObservatory | null = null;

export function getRuntimeObservatory(persistPath?: string): RuntimeObservatory {
  if (!singleton) {
    const defaultPath = join(__dirname, '../../.genesis/holistic-self-model.json');
    singleton = new RuntimeObservatory(persistPath || defaultPath);
  }
  return singleton;
}
