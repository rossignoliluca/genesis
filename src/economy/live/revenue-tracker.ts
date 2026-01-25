/**
 * Revenue Tracker
 *
 * Records all revenue events from various sources.
 * Persists to disk and provides aggregation.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export type RevenueSource =
  | 'mcp-api'           // x402 API calls
  | 'bounty'            // DeWork/Immunefi bounties
  | 'yield'             // DeFi yield harvesting
  | 'keeper'            // Keeper rewards
  | 'grant'             // Grants
  | 'arbitrage'         // Cross-L2 arbitrage
  | 'content'           // Content monetization
  | 'audit'             // Smart contract audits
  | 'compute'           // Compute provision
  | 'orchestration'     // Meta-orchestrator fees
  | 'other';

export interface RevenueEvent {
  id: string;
  timestamp: number;
  source: RevenueSource;
  amount: number;           // USD value
  currency: 'USDC' | 'ETH' | 'USD';
  txHash?: string;
  activityId?: string;
  metadata?: Record<string, unknown>;
}

export interface RevenueStats {
  total: number;
  bySource: Record<RevenueSource, number>;
  count: number;
  countBySource: Record<RevenueSource, number>;
  firstEvent: number;
  lastEvent: number;
  averagePerEvent: number;
  averagePerDay: number;
}

interface PersistedRevenue {
  version: number;
  events: RevenueEvent[];
  savedAt: string;
}

const STATE_DIR = process.env.GENESIS_STATE_DIR || join(homedir(), '.genesis');
const REVENUE_FILE = 'revenue-events.json';
const MAX_EVENTS = 10000;  // Keep last 10k events

export class RevenueTracker {
  private events: RevenueEvent[] = [];
  private filePath: string;
  private dirty = false;
  private saveTimer: NodeJS.Timeout | null = null;
  private eventCallbacks: Array<(event: RevenueEvent) => void> = [];

  constructor(stateDir?: string) {
    this.filePath = join(stateDir ?? STATE_DIR, REVENUE_FILE);
  }

  /**
   * Load events from disk.
   */
  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      const data: PersistedRevenue = JSON.parse(raw);
      this.events = data.events ?? [];
      console.log(`[RevenueTracker] Loaded ${this.events.length} events`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[RevenueTracker] Failed to load:', error);
      }
      this.events = [];
    }
  }

  /**
   * Save events to disk.
   */
  async save(): Promise<void> {
    try {
      await mkdir(dirname(this.filePath), { recursive: true });

      const data: PersistedRevenue = {
        version: 1,
        events: this.events,
        savedAt: new Date().toISOString(),
      };

      const tmpPath = this.filePath + '.tmp';
      await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');

      // Atomic rename
      const { rename } = await import('node:fs/promises');
      await rename(tmpPath, this.filePath);

      this.dirty = false;
    } catch (error) {
      console.error('[RevenueTracker] Failed to save:', error);
      throw error;
    }
  }

  /**
   * Start auto-save on interval.
   */
  startAutoSave(intervalMs: number = 60000): void {
    if (this.saveTimer) return;

    this.saveTimer = setInterval(async () => {
      if (this.dirty) {
        await this.save();
      }
    }, intervalMs);

    console.log(`[RevenueTracker] Auto-save started, interval=${intervalMs}ms`);
  }

  /**
   * Stop auto-save.
   */
  stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
      console.log('[RevenueTracker] Auto-save stopped');
    }
  }

  /**
   * Record a revenue event.
   */
  record(event: Omit<RevenueEvent, 'id' | 'timestamp'> & { timestamp?: number }): RevenueEvent {
    const fullEvent: RevenueEvent = {
      id: this.generateId(),
      timestamp: event.timestamp ?? Date.now(),
      ...event,
    };

    this.events.push(fullEvent);
    this.dirty = true;

    // Trim to max size
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS);
    }

    // Notify callbacks
    for (const cb of this.eventCallbacks) {
      try {
        cb(fullEvent);
      } catch (e) {
        console.warn('[RevenueTracker] Callback error:', e);
      }
    }

    return fullEvent;
  }

  /**
   * Register callback for new revenue events.
   */
  onRevenue(callback: (event: RevenueEvent) => void): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      const idx = this.eventCallbacks.indexOf(callback);
      if (idx >= 0) this.eventCallbacks.splice(idx, 1);
    };
  }

  /**
   * Get total revenue since a timestamp.
   */
  getTotal(since?: number): number {
    const events = since
      ? this.events.filter(e => e.timestamp >= since)
      : this.events;
    return events.reduce((sum, e) => sum + e.amount, 0);
  }

  /**
   * Get revenue by source.
   */
  getBySource(since?: number): Record<RevenueSource, number> {
    const events = since
      ? this.events.filter(e => e.timestamp >= since)
      : this.events;

    const result: Record<string, number> = {};
    for (const e of events) {
      result[e.source] = (result[e.source] ?? 0) + e.amount;
    }
    return result as Record<RevenueSource, number>;
  }

  /**
   * Get comprehensive stats.
   */
  getStats(since?: number): RevenueStats {
    const events = since
      ? this.events.filter(e => e.timestamp >= since)
      : this.events;

    if (events.length === 0) {
      return {
        total: 0,
        bySource: {} as Record<RevenueSource, number>,
        count: 0,
        countBySource: {} as Record<RevenueSource, number>,
        firstEvent: 0,
        lastEvent: 0,
        averagePerEvent: 0,
        averagePerDay: 0,
      };
    }

    const total = events.reduce((sum, e) => sum + e.amount, 0);
    const bySource: Record<string, number> = {};
    const countBySource: Record<string, number> = {};

    for (const e of events) {
      bySource[e.source] = (bySource[e.source] ?? 0) + e.amount;
      countBySource[e.source] = (countBySource[e.source] ?? 0) + 1;
    }

    const firstEvent = events[0].timestamp;
    const lastEvent = events[events.length - 1].timestamp;
    const daySpan = Math.max(1, (lastEvent - firstEvent) / (24 * 60 * 60 * 1000));

    return {
      total,
      bySource: bySource as Record<RevenueSource, number>,
      count: events.length,
      countBySource: countBySource as Record<RevenueSource, number>,
      firstEvent,
      lastEvent,
      averagePerEvent: total / events.length,
      averagePerDay: total / daySpan,
    };
  }

  /**
   * Get recent events.
   */
  getRecent(count: number = 100): RevenueEvent[] {
    return this.events.slice(-count);
  }

  /**
   * Get events in a time range.
   */
  getRange(from: number, to: number): RevenueEvent[] {
    return this.events.filter(e => e.timestamp >= from && e.timestamp <= to);
  }

  /**
   * Get revenue for today.
   */
  getTodayRevenue(): number {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return this.getTotal(startOfDay.getTime());
  }

  /**
   * Get revenue for the last N hours.
   */
  getRevenueLastHours(hours: number): number {
    return this.getTotal(Date.now() - hours * 60 * 60 * 1000);
  }

  private generateId(): string {
    return `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

// Singleton
let trackerInstance: RevenueTracker | null = null;

export function getRevenueTracker(stateDir?: string): RevenueTracker {
  if (!trackerInstance) {
    trackerInstance = new RevenueTracker(stateDir);
  }
  return trackerInstance;
}

export function resetRevenueTracker(): void {
  if (trackerInstance) {
    trackerInstance.stopAutoSave();
    trackerInstance = null;
  }
}
