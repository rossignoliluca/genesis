/**
 * Genesis 6.0 - State Persistence
 *
 * Save and load Genesis state to/from disk.
 * Supports JSON format with optional compression.
 *
 * State includes:
 * - Memory (episodic, semantic, procedural)
 * - Conversation history
 * - Session metadata
 * - Configuration
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { LLMMessage } from '../llm/index.js';

// ============================================================================
// Types
// ============================================================================

export interface GenesisState {
  version: string;
  created: Date;
  lastModified: Date;
  checksum: string;

  // Core state
  memory: MemoryState;
  conversation: ConversationState;
  session: SessionState;
  config: ConfigState;
}

export interface MemoryState {
  episodic: any[];
  semantic: any[];
  procedural: any[];
  stats: {
    totalEpisodes: number;
    totalFacts: number;
    totalSkills: number;
    lastConsolidation?: Date;
  };
}

export interface ConversationState {
  history: LLMMessage[];
  totalMessages: number;
  totalTokens: number;
}

export interface SessionState {
  id: string;
  startTime: Date;
  interactions: number;
  lastActivity: Date;
}

export interface ConfigState {
  llm: {
    provider?: string;
    model?: string;
  };
  persistence: {
    autoSaveInterval?: number;
    maxBackups?: number;
  };
}

export interface PersistenceOptions {
  dataDir?: string;
  autoSave?: boolean;
  autoSaveIntervalMs?: number;
  maxBackups?: number;
  onSave?: (state: GenesisState) => void;
  onLoad?: (state: GenesisState) => void;
  onError?: (error: Error) => void;
}

// ============================================================================
// Default Paths
// ============================================================================

const DEFAULT_DATA_DIR = path.join(process.env.HOME || '.', '.genesis');
const STATE_FILE = 'state.json';
const BACKUP_DIR = 'backups';

// ============================================================================
// State Store Class
// ============================================================================

export class StateStore {
  private dataDir: string;
  private statePath: string;
  private backupDir: string;
  private options: PersistenceOptions;
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private dirty = false;

  // In-memory state
  private state: GenesisState;

  constructor(options: PersistenceOptions = {}) {
    this.options = options;
    this.dataDir = options.dataDir || DEFAULT_DATA_DIR;
    this.statePath = path.join(this.dataDir, STATE_FILE);
    this.backupDir = path.join(this.dataDir, BACKUP_DIR);

    // Initialize with empty state
    this.state = this.createEmptyState();

    // Ensure directories exist
    this.ensureDirectories();

    // Try to load existing state
    this.loadSync();

    // Start auto-save if enabled
    if (options.autoSave) {
      this.startAutoSave(options.autoSaveIntervalMs || 60000);
    }
  }

  // ============================================================================
  // Core Methods
  // ============================================================================

  /**
   * Save state to disk
   */
  async save(): Promise<void> {
    try {
      // Update metadata
      this.state.lastModified = new Date();
      this.state.checksum = this.calculateChecksum(this.state);

      // Create backup before overwriting
      await this.backup();

      // Write state
      const json = JSON.stringify(this.state, null, 2);
      await fs.promises.writeFile(this.statePath, json, 'utf-8');

      this.dirty = false;
      this.options.onSave?.(this.state);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.options.onError?.(err);
      throw err;
    }
  }

  /**
   * Save state synchronously
   */
  saveSync(): void {
    try {
      this.state.lastModified = new Date();
      this.state.checksum = this.calculateChecksum(this.state);

      // Backup
      this.backupSync();

      // Write
      const json = JSON.stringify(this.state, null, 2);
      fs.writeFileSync(this.statePath, json, 'utf-8');

      this.dirty = false;
      this.options.onSave?.(this.state);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.options.onError?.(err);
      throw err;
    }
  }

  /**
   * Load state from disk
   */
  async load(): Promise<GenesisState> {
    try {
      if (!fs.existsSync(this.statePath)) {
        return this.state;
      }

      const json = await fs.promises.readFile(this.statePath, 'utf-8');
      const loaded = JSON.parse(json) as GenesisState;

      // Validate checksum
      const expectedChecksum = this.calculateChecksum(loaded);
      if (loaded.checksum && loaded.checksum !== expectedChecksum) {
        console.warn('[StateStore] Checksum mismatch - state may be corrupted');
      }

      // Merge with empty state to ensure all fields exist
      this.state = this.mergeState(this.createEmptyState(), loaded);
      this.options.onLoad?.(this.state);

      return this.state;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.options.onError?.(err);
      throw err;
    }
  }

  /**
   * Load state synchronously
   */
  loadSync(): GenesisState {
    try {
      if (!fs.existsSync(this.statePath)) {
        return this.state;
      }

      const json = fs.readFileSync(this.statePath, 'utf-8');
      const loaded = JSON.parse(json) as GenesisState;

      this.state = this.mergeState(this.createEmptyState(), loaded);
      this.options.onLoad?.(this.state);

      return this.state;
    } catch (error) {
      // If loading fails, keep empty state
      console.warn('[StateStore] Failed to load state:', error);
      return this.state;
    }
  }

  /**
   * Get current state
   */
  getState(): GenesisState {
    return this.state;
  }

  /**
   * Update state (partial update)
   */
  update(updates: Partial<GenesisState>): void {
    this.state = this.mergeState(this.state, updates);
    this.dirty = true;
  }

  /**
   * Check if state has unsaved changes
   */
  isDirty(): boolean {
    return this.dirty;
  }

  // ============================================================================
  // Memory Operations
  // ============================================================================

  /**
   * Update memory state
   */
  updateMemory(memory: Partial<MemoryState>): void {
    this.state.memory = { ...this.state.memory, ...memory };
    this.dirty = true;
  }

  /**
   * Add episodic memory
   */
  addEpisode(episode: any): void {
    this.state.memory.episodic.push(episode);
    this.state.memory.stats.totalEpisodes++;
    this.dirty = true;
  }

  /**
   * Add semantic memory
   */
  addFact(fact: any): void {
    this.state.memory.semantic.push(fact);
    this.state.memory.stats.totalFacts++;
    this.dirty = true;
  }

  /**
   * Add procedural memory
   */
  addSkill(skill: any): void {
    this.state.memory.procedural.push(skill);
    this.state.memory.stats.totalSkills++;
    this.dirty = true;
  }

  // ============================================================================
  // Conversation Operations
  // ============================================================================

  /**
   * Update conversation history
   */
  updateConversation(messages: LLMMessage[], tokens?: number): void {
    this.state.conversation.history = messages;
    this.state.conversation.totalMessages = messages.length;
    if (tokens) {
      this.state.conversation.totalTokens += tokens;
    }
    this.dirty = true;
  }

  /**
   * Add message to conversation
   */
  addMessage(message: LLMMessage): void {
    this.state.conversation.history.push(message);
    this.state.conversation.totalMessages++;
    this.dirty = true;
  }

  /**
   * Clear conversation history
   */
  clearConversation(): void {
    this.state.conversation.history = [];
    this.dirty = true;
  }

  // ============================================================================
  // Session Operations
  // ============================================================================

  /**
   * Record an interaction
   */
  recordInteraction(): void {
    this.state.session.interactions++;
    this.state.session.lastActivity = new Date();
    this.dirty = true;
  }

  /**
   * Start new session
   */
  newSession(): void {
    this.state.session = {
      id: crypto.randomUUID(),
      startTime: new Date(),
      interactions: 0,
      lastActivity: new Date(),
    };
    this.dirty = true;
  }

  // ============================================================================
  // Backup Operations
  // ============================================================================

  /**
   * Create backup of current state
   */
  async backup(): Promise<string | null> {
    if (!fs.existsSync(this.statePath)) {
      return null;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDir, `state-${timestamp}.json`);

    await fs.promises.copyFile(this.statePath, backupPath);

    // Clean old backups
    await this.cleanOldBackups();

    return backupPath;
  }

  /**
   * Create backup synchronously
   */
  backupSync(): string | null {
    if (!fs.existsSync(this.statePath)) {
      return null;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDir, `state-${timestamp}.json`);

    fs.copyFileSync(this.statePath, backupPath);
    this.cleanOldBackupsSync();

    return backupPath;
  }

  /**
   * List available backups
   */
  listBackups(): string[] {
    if (!fs.existsSync(this.backupDir)) {
      return [];
    }

    return fs.readdirSync(this.backupDir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();
  }

  /**
   * Restore from backup
   */
  async restoreBackup(backupName: string): Promise<void> {
    const backupPath = path.join(this.backupDir, backupName);

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup not found: ${backupName}`);
    }

    // Backup current state first
    await this.backup();

    // Copy backup to state file
    await fs.promises.copyFile(backupPath, this.statePath);

    // Reload
    await this.load();
  }

  // ============================================================================
  // Export/Import
  // ============================================================================

  /**
   * Export state to a portable format
   */
  async export(outputPath: string): Promise<void> {
    const exportData = {
      ...this.state,
      exportedAt: new Date(),
      exportVersion: '1.0',
    };

    const json = JSON.stringify(exportData, null, 2);
    await fs.promises.writeFile(outputPath, json, 'utf-8');
  }

  /**
   * Import state from file
   */
  async import(inputPath: string, merge = false): Promise<void> {
    const json = await fs.promises.readFile(inputPath, 'utf-8');
    const imported = JSON.parse(json) as GenesisState;

    if (merge) {
      // Merge with current state
      this.state = this.mergeState(this.state, imported);
    } else {
      // Replace state
      this.state = this.mergeState(this.createEmptyState(), imported);
    }

    this.dirty = true;
    await this.save();
  }

  // ============================================================================
  // Auto-Save
  // ============================================================================

  /**
   * Start auto-save timer
   */
  startAutoSave(intervalMs: number): void {
    this.stopAutoSave();

    this.autoSaveTimer = setInterval(async () => {
      if (this.dirty) {
        try {
          await this.save();
        } catch (error) {
          console.error('[StateStore] Auto-save failed:', error);
        }
      }
    }, intervalMs);
  }

  /**
   * Stop auto-save timer
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Reset state to empty
   */
  reset(): void {
    this.state = this.createEmptyState();
    this.dirty = true;
  }

  /**
   * Delete all persisted data
   */
  async purge(): Promise<void> {
    this.stopAutoSave();

    if (fs.existsSync(this.statePath)) {
      await fs.promises.unlink(this.statePath);
    }

    if (fs.existsSync(this.backupDir)) {
      const files = await fs.promises.readdir(this.backupDir);
      for (const file of files) {
        await fs.promises.unlink(path.join(this.backupDir, file));
      }
    }

    this.reset();
  }

  /**
   * Close and cleanup
   */
  close(): void {
    this.stopAutoSave();

    if (this.dirty) {
      this.saveSync();
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private createEmptyState(): GenesisState {
    return {
      version: '6.0',
      created: new Date(),
      lastModified: new Date(),
      checksum: '',

      memory: {
        episodic: [],
        semantic: [],
        procedural: [],
        stats: {
          totalEpisodes: 0,
          totalFacts: 0,
          totalSkills: 0,
        },
      },

      conversation: {
        history: [],
        totalMessages: 0,
        totalTokens: 0,
      },

      session: {
        id: crypto.randomUUID(),
        startTime: new Date(),
        interactions: 0,
        lastActivity: new Date(),
      },

      config: {
        llm: {},
        persistence: {},
      },
    };
  }

  private mergeState(base: GenesisState, updates: Partial<GenesisState>): GenesisState {
    return {
      ...base,
      ...updates,
      memory: {
        ...base.memory,
        ...(updates.memory || {}),
        stats: {
          ...base.memory.stats,
          ...(updates.memory?.stats || {}),
        },
      },
      conversation: {
        ...base.conversation,
        ...(updates.conversation || {}),
      },
      session: {
        ...base.session,
        ...(updates.session || {}),
      },
      config: {
        ...base.config,
        ...(updates.config || {}),
        llm: {
          ...base.config.llm,
          ...(updates.config?.llm || {}),
        },
        persistence: {
          ...base.config.persistence,
          ...(updates.config?.persistence || {}),
        },
      },
    };
  }

  private calculateChecksum(state: GenesisState): string {
    const data = JSON.stringify({
      memory: state.memory,
      conversation: state.conversation,
    });
    return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  private async cleanOldBackups(): Promise<void> {
    const maxBackups = this.options.maxBackups || 10;
    const backups = this.listBackups();

    if (backups.length > maxBackups) {
      const toDelete = backups.slice(maxBackups);
      for (const backup of toDelete) {
        await fs.promises.unlink(path.join(this.backupDir, backup));
      }
    }
  }

  private cleanOldBackupsSync(): void {
    const maxBackups = this.options.maxBackups || 10;
    const backups = this.listBackups();

    if (backups.length > maxBackups) {
      const toDelete = backups.slice(maxBackups);
      for (const backup of toDelete) {
        fs.unlinkSync(path.join(this.backupDir, backup));
      }
    }
  }

  /**
   * Get data directory path
   */
  getDataDir(): string {
    return this.dataDir;
  }

  /**
   * Get stats
   */
  stats(): {
    dataDir: string;
    stateExists: boolean;
    stateSize: number;
    backupCount: number;
    isDirty: boolean;
    lastModified: Date;
  } {
    const stateExists = fs.existsSync(this.statePath);
    const stateSize = stateExists ? fs.statSync(this.statePath).size : 0;

    return {
      dataDir: this.dataDir,
      stateExists,
      stateSize,
      backupCount: this.listBackups().length,
      isDirty: this.dirty,
      lastModified: this.state.lastModified,
    };
  }
}

// ============================================================================
// Factory & Singleton
// ============================================================================

let stateStoreInstance: StateStore | null = null;

export function createStateStore(options?: PersistenceOptions): StateStore {
  return new StateStore(options);
}

export function getStateStore(options?: PersistenceOptions): StateStore {
  if (!stateStoreInstance) {
    stateStoreInstance = createStateStore(options);
  }
  return stateStoreInstance;
}

export function resetStateStore(): void {
  if (stateStoreInstance) {
    stateStoreInstance.close();
  }
  stateStoreInstance = null;
}
