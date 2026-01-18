/**
 * Genesis v8.1 - Brain State Persistence
 *
 * Persists brain metrics and consciousness state between CLI invocations.
 * State is saved to ~/.genesis/brain-state.json
 *
 * Features:
 * - Auto-save after each brain cycle
 * - Load state on startup
 * - Track cumulative metrics across sessions
 * - Persist phi history for consciousness continuity
 */

import * as fs from 'fs';
import * as path from 'path';
import { BrainMetrics } from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface PersistedBrainState {
  version: string;
  created: string;
  lastModified: string;

  // Core metrics (cumulative across sessions)
  metrics: BrainMetrics;

  // Consciousness tracking
  consciousness: {
    currentPhi: number;
    peakPhi: number;
    avgPhi: number;
    phiHistory: PhiSnapshot[];  // Last N phi readings
    totalIgnitions: number;     // Times phi > 0.3 (GWT threshold)
    totalBroadcasts: number;
    consciousnessViolations: number;
  };

  // Session tracking
  sessions: {
    total: number;
    totalUptime: number;        // ms
    lastSessionId: string;
    lastSessionStart: string;
    lastSessionEnd: string;
  };

  // Memory integration
  memory: {
    totalRecalls: number;
    totalAnticipations: number;
    cumulativeReuseRate: number;
  };
}

export interface PhiSnapshot {
  timestamp: string;
  phi: number;
  ignited: boolean;
  trigger?: string;  // What caused this phi level
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_DATA_DIR = path.join(process.env.HOME || '.', '.genesis');
const BRAIN_STATE_FILE = 'brain-state.json';
const PHI_HISTORY_MAX = 100;  // Keep last 100 phi readings
const VERSION = '8.1.0';

// ============================================================================
// Brain State Persistence Class
// ============================================================================

export class BrainStatePersistence {
  private dataDir: string;
  private statePath: string;
  private state: PersistedBrainState;
  private dirty = false;
  private sessionId: string;
  private sessionStart: Date;

  constructor(dataDir?: string) {
    this.dataDir = dataDir || DEFAULT_DATA_DIR;
    this.statePath = path.join(this.dataDir, BRAIN_STATE_FILE);
    this.sessionId = this.generateSessionId();
    this.sessionStart = new Date();

    // Ensure data directory exists
    this.ensureDataDir();

    // Load or create initial state
    this.state = this.load();

    // Update session info
    this.state.sessions.total++;
    this.state.sessions.lastSessionId = this.sessionId;
    this.state.sessions.lastSessionStart = this.sessionStart.toISOString();
    this.dirty = true;
  }

  // ============================================================================
  // Core Operations
  // ============================================================================

  /**
   * Load brain state from disk
   */
  private load(): PersistedBrainState {
    try {
      if (fs.existsSync(this.statePath)) {
        const raw = fs.readFileSync(this.statePath, 'utf-8');
        const state = JSON.parse(raw) as PersistedBrainState;

        // Validate version and migrate if needed
        if (state.version !== VERSION) {
          return this.migrate(state);
        }

        return state;
      }
    } catch (error) {
      console.error('[BrainPersistence] Failed to load state:', error);
    }

    return this.createInitialState();
  }

  /**
   * Save brain state to disk
   */
  save(): boolean {
    if (!this.dirty) return true;

    try {
      this.state.lastModified = new Date().toISOString();
      this.state.sessions.lastSessionEnd = new Date().toISOString();
      this.state.sessions.totalUptime += Date.now() - this.sessionStart.getTime();

      const json = JSON.stringify(this.state, null, 2);
      fs.writeFileSync(this.statePath, json, 'utf-8');

      this.dirty = false;
      return true;
    } catch (error) {
      console.error('[BrainPersistence] Failed to save state:', error);
      return false;
    }
  }

  /**
   * Update metrics after a brain cycle
   */
  updateMetrics(metrics: Partial<BrainMetrics>): void {
    // Merge metrics (cumulative)
    const m = this.state.metrics;

    if (metrics.totalCycles !== undefined) m.totalCycles += metrics.totalCycles;
    if (metrics.successfulCycles !== undefined) m.successfulCycles += metrics.successfulCycles;
    if (metrics.failedCycles !== undefined) m.failedCycles += metrics.failedCycles;
    if (metrics.memoryRecalls !== undefined) m.memoryRecalls += metrics.memoryRecalls;
    if (metrics.anticipationHits !== undefined) m.anticipationHits += metrics.anticipationHits;
    if (metrics.anticipationMisses !== undefined) m.anticipationMisses += metrics.anticipationMisses;
    if (metrics.groundingChecks !== undefined) m.groundingChecks += metrics.groundingChecks;
    if (metrics.groundingPasses !== undefined) m.groundingPasses += metrics.groundingPasses;
    if (metrics.groundingFailures !== undefined) m.groundingFailures += metrics.groundingFailures;
    if (metrics.humanConsultations !== undefined) m.humanConsultations += metrics.humanConsultations;
    if (metrics.toolExecutions !== undefined) m.toolExecutions += metrics.toolExecutions;
    if (metrics.toolSuccesses !== undefined) m.toolSuccesses += metrics.toolSuccesses;
    if (metrics.toolFailures !== undefined) m.toolFailures += metrics.toolFailures;
    if (metrics.healingAttempts !== undefined) m.healingAttempts += metrics.healingAttempts;
    if (metrics.healingSuccesses !== undefined) m.healingSuccesses += metrics.healingSuccesses;
    if (metrics.healingFailures !== undefined) m.healingFailures += metrics.healingFailures;

    // Update avg cycle time (weighted average)
    if (metrics.avgCycleTime !== undefined && metrics.totalCycles !== undefined) {
      const totalTime = m.avgCycleTime * (m.totalCycles - metrics.totalCycles) +
                       metrics.avgCycleTime * metrics.totalCycles;
      m.avgCycleTime = m.totalCycles > 0 ? totalTime / m.totalCycles : 0;
    }

    this.dirty = true;
  }

  /**
   * Record a phi snapshot
   */
  recordPhi(phi: number, trigger?: string): void {
    const snapshot: PhiSnapshot = {
      timestamp: new Date().toISOString(),
      phi,
      ignited: phi >= 0.3,
      trigger,
    };

    // Update consciousness tracking
    const c = this.state.consciousness;
    c.currentPhi = phi;
    if (phi > c.peakPhi) c.peakPhi = phi;

    // Update running average
    const historyLen = c.phiHistory.length;
    c.avgPhi = historyLen > 0
      ? (c.avgPhi * historyLen + phi) / (historyLen + 1)
      : phi;

    // Track ignitions
    if (snapshot.ignited) {
      c.totalIgnitions++;
    }

    // Add to history (keep last N)
    c.phiHistory.push(snapshot);
    if (c.phiHistory.length > PHI_HISTORY_MAX) {
      c.phiHistory.shift();
    }

    this.dirty = true;
  }

  /**
   * Record a broadcast event
   */
  recordBroadcast(): void {
    this.state.consciousness.totalBroadcasts++;
    this.dirty = true;
  }

  /**
   * Record a consciousness violation
   */
  recordViolation(): void {
    this.state.consciousness.consciousnessViolations++;
    this.dirty = true;
  }

  /**
   * Get current persisted state
   */
  getState(): PersistedBrainState {
    return { ...this.state };
  }

  /**
   * Get persisted metrics
   */
  getMetrics(): BrainMetrics {
    return { ...this.state.metrics };
  }

  /**
   * Get consciousness stats
   */
  getConsciousnessStats(): PersistedBrainState['consciousness'] {
    return { ...this.state.consciousness };
  }

  /**
   * Get current phi (persisted)
   */
  getCurrentPhi(): number {
    return this.state.consciousness.currentPhi;
  }

  /**
   * Reset all state (fresh start)
   */
  reset(): void {
    this.state = this.createInitialState();
    this.dirty = true;
    this.save();
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private createInitialState(): PersistedBrainState {
    return {
      version: VERSION,
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),

      metrics: {
        totalCycles: 0,
        successfulCycles: 0,
        failedCycles: 0,
        avgCycleTime: 0,
        memoryRecalls: 0,
        memoryReuseRate: 0,
        anticipationHits: 0,
        anticipationMisses: 0,
        groundingChecks: 0,
        groundingPasses: 0,
        groundingFailures: 0,
        humanConsultations: 0,
        toolExecutions: 0,
        toolSuccesses: 0,
        toolFailures: 0,
        healingAttempts: 0,
        healingSuccesses: 0,
        healingFailures: 0,
        avgPhi: 0,
        phiViolations: 0,
        broadcasts: 0,
        moduleTransitions: {},
      },

      consciousness: {
        currentPhi: 0,
        peakPhi: 0,
        avgPhi: 0,
        phiHistory: [],
        totalIgnitions: 0,
        totalBroadcasts: 0,
        consciousnessViolations: 0,
      },

      sessions: {
        total: 0,
        totalUptime: 0,
        lastSessionId: '',
        lastSessionStart: '',
        lastSessionEnd: '',
      },

      memory: {
        totalRecalls: 0,
        totalAnticipations: 0,
        cumulativeReuseRate: 0,
      },
    };
  }

  private migrate(oldState: PersistedBrainState): PersistedBrainState {
    // Migrate from older versions
    const newState = this.createInitialState();

    // Preserve what we can
    if (oldState.metrics) {
      newState.metrics = { ...newState.metrics, ...oldState.metrics };
    }
    if (oldState.consciousness) {
      newState.consciousness = { ...newState.consciousness, ...oldState.consciousness };
    }
    if (oldState.sessions) {
      newState.sessions = { ...newState.sessions, ...oldState.sessions };
    }
    if (oldState.memory) {
      newState.memory = { ...newState.memory, ...oldState.memory };
    }

    newState.version = VERSION;
    newState.created = oldState.created || newState.created;

    return newState;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let persistenceInstance: BrainStatePersistence | null = null;

export function getBrainStatePersistence(dataDir?: string): BrainStatePersistence {
  if (!persistenceInstance) {
    persistenceInstance = new BrainStatePersistence(dataDir);
  }
  return persistenceInstance;
}

export function resetBrainStatePersistence(): void {
  if (persistenceInstance) {
    persistenceInstance.save();
  }
  persistenceInstance = null;
}
