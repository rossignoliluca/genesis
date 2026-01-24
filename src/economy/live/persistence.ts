import { writeFile, readFile, mkdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

/**
 * Persisted state schema for Genesis economic system.
 * Survives process restarts by saving to JSON on disk.
 */
export interface PersistedState {
  version: number;
  savedAt: string;

  // From generative-model.ts
  beliefs: Array<{
    activityId: string;
    mu: number;
    sigma2: number;
    n: number;
    sumX: number;
    sumX2: number;
  }>;

  // From generative-model.ts MarketRegime
  regimeBelief: number[];

  // From adaptive temperature
  lastBeta: number;

  // From autonomous controller
  cycleCount: number;
  totalRevenue: number;
  totalCosts: number;
  currentPhase: number;
  startedAt: number;

  // Capital allocations
  allocations: Record<string, number>;

  // Revenue history (last 100 entries)
  revenueHistory: Array<{ timestamp: number; activityId: string; amount: number }>;

  // Contraction state
  logLipAvg: number;

  // Wallet
  walletAddress: string;
  lastKnownBalance: { eth: string; usdc: string };
}

const DEFAULT_STATE_DIR = join(homedir(), '.genesis');
const STATE_FILENAME = 'economy-state.json';
const CURRENT_VERSION = 1;
const DEFAULT_AUTOSAVE_INTERVAL = 60_000; // 60 seconds

/**
 * JSON file persistence layer for Genesis economic system.
 * Provides atomic writes, auto-save, and schema versioning.
 */
export class StatePersistence {
  private readonly stateDir: string;
  private readonly statePath: string;
  private autoSaveTimer?: NodeJS.Timeout;

  constructor(stateDir?: string) {
    this.stateDir = stateDir || process.env.GENESIS_STATE_DIR || DEFAULT_STATE_DIR;
    this.statePath = join(this.stateDir, STATE_FILENAME);
  }

  /**
   * Load persisted state from disk.
   * Returns null if file doesn't exist or is invalid.
   */
  async load(): Promise<PersistedState | null> {
    try {
      const raw = await readFile(this.statePath, 'utf-8');
      const state = JSON.parse(raw) as PersistedState;

      // Validate version
      if (state.version !== CURRENT_VERSION) {
        console.warn(
          `State version mismatch: found ${state.version}, expected ${CURRENT_VERSION}. Migration may be needed.`
        );
      }

      return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist yet - normal for first run
        return null;
      }
      console.error('Failed to load persisted state:', error);
      return null;
    }
  }

  /**
   * Save state to disk atomically.
   * Writes to temporary file then renames to avoid corruption.
   */
  async save(state: PersistedState): Promise<void> {
    try {
      // Ensure directory exists
      await mkdir(this.stateDir, { recursive: true });

      // Update metadata
      const stateWithMeta: PersistedState = {
        ...state,
        version: CURRENT_VERSION,
        savedAt: new Date().toISOString(),
      };

      // Atomic write: tmp file then rename
      const tmpPath = `${this.statePath}.tmp`;
      await writeFile(tmpPath, JSON.stringify(stateWithMeta, null, 2), 'utf-8');
      await rename(tmpPath, this.statePath);
    } catch (error) {
      console.error('Failed to save persisted state:', error);
      throw error;
    }
  }

  /**
   * Start auto-save loop.
   * Calls getState() on interval and persists to disk.
   */
  startAutoSave(getState: () => PersistedState, intervalMs = DEFAULT_AUTOSAVE_INTERVAL): void {
    if (this.autoSaveTimer) {
      console.warn('Auto-save already running. Stop it first before starting again.');
      return;
    }

    this.autoSaveTimer = setInterval(async () => {
      try {
        const state = getState();
        await this.save(state);
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }, intervalMs);

    console.log(`Auto-save started: interval=${intervalMs}ms, path=${this.statePath}`);
  }

  /**
   * Stop auto-save loop.
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
      console.log('Auto-save stopped');
    }
  }

  /**
   * Get the full path to the state file.
   */
  getStatePath(): string {
    return this.statePath;
  }
}

// Singleton instance
let instance: StatePersistence | null = null;

/**
 * Get singleton persistence instance.
 * Creates new instance if none exists or if stateDir changes.
 */
export function getStatePersistence(stateDir?: string): StatePersistence {
  if (!instance || (stateDir && instance.getStatePath() !== join(stateDir, STATE_FILENAME))) {
    instance = new StatePersistence(stateDir);
  }
  return instance;
}

/**
 * Reset singleton instance.
 * Useful for testing or forcing re-initialization.
 */
export function resetStatePersistence(): void {
  if (instance) {
    instance.stopAutoSave();
    instance = null;
  }
}
