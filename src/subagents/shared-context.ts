/**
 * Genesis v18.1 - Shared Task Context
 *
 * Enables inter-subagent communication within the same parent task.
 * Subagents can publish findings and read sibling results through
 * a shared context object that is scoped to a task group.
 *
 * Pattern:
 *   Parent spawns 3 subagents for "research topic X"
 *   → SubagentA finds papers, publishes to shared context
 *   → SubagentB finds code, publishes to shared context
 *   → SubagentC reads both findings, synthesizes
 */

// ============================================================================
// Types
// ============================================================================

export interface SharedEntry {
  /** ID of the subagent that published this entry */
  sourceSubagent: string;
  /** Subagent type (e.g., 'explore', 'research') */
  sourceType: string;
  /** The key under which this entry is stored */
  key: string;
  /** The actual data */
  data: unknown;
  /** When this entry was published */
  timestamp: number;
}

export interface SharedContextConfig {
  /** Maximum entries before oldest are evicted */
  maxEntries: number;
  /** Maximum total data size in characters (JSON-serialized) */
  maxDataSize: number;
  /** Time-to-live for entries in ms (0 = no expiry) */
  entryTTL: number;
}

const DEFAULT_SHARED_CONFIG: SharedContextConfig = {
  maxEntries: 100,
  maxDataSize: 1024 * 1024, // 1MB
  entryTTL: 0,              // No expiry (lives as long as task group)
};

// ============================================================================
// Shared Task Context
// ============================================================================

/**
 * Thread-safe shared context for a group of subagents.
 * Scoped to a parent task — destroyed when the parent completes.
 */
export class SharedTaskContext {
  readonly groupId: string;
  private entries: Map<string, SharedEntry> = new Map();
  private listeners: Map<string, Array<(entry: SharedEntry) => void>> = new Map();
  private config: SharedContextConfig;
  private totalDataSize = 0;

  constructor(groupId: string, config: Partial<SharedContextConfig> = {}) {
    this.groupId = groupId;
    this.config = { ...DEFAULT_SHARED_CONFIG, ...config };
  }

  /**
   * Publish a finding to the shared context.
   * Other subagents in the same group can read it immediately.
   */
  publish(sourceSubagent: string, sourceType: string, key: string, data: unknown): void {
    const entry: SharedEntry = {
      sourceSubagent,
      sourceType,
      key,
      data,
      timestamp: Date.now(),
    };

    const dataSize = JSON.stringify(data).length;

    // Evict oldest entries if at capacity
    while (
      (this.entries.size >= this.config.maxEntries ||
        this.totalDataSize + dataSize > this.config.maxDataSize) &&
      this.entries.size > 0
    ) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.remove(oldest);
      }
    }

    this.entries.set(key, entry);
    this.totalDataSize += dataSize;

    // Notify listeners
    this.notifyListeners(key, entry);
  }

  /**
   * Read a specific entry by key.
   */
  get(key: string): SharedEntry | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (this.config.entryTTL > 0 && Date.now() - entry.timestamp > this.config.entryTTL) {
      this.remove(key);
      return undefined;
    }

    return entry;
  }

  /**
   * Read all entries, optionally filtered by source type.
   */
  getAll(sourceType?: string): SharedEntry[] {
    const now = Date.now();
    const results: SharedEntry[] = [];

    for (const entry of this.entries.values()) {
      // Check TTL
      if (this.config.entryTTL > 0 && now - entry.timestamp > this.config.entryTTL) {
        continue;
      }
      if (sourceType && entry.sourceType !== sourceType) {
        continue;
      }
      results.push(entry);
    }

    return results;
  }

  /**
   * Read all entries from a specific sibling subagent.
   */
  getFromSibling(siblingId: string): SharedEntry[] {
    return Array.from(this.entries.values())
      .filter(e => e.sourceSubagent === siblingId);
  }

  /**
   * Check if a key exists.
   */
  has(key: string): boolean {
    return this.entries.has(key);
  }

  /**
   * Subscribe to new entries matching a key pattern.
   * Returns unsubscribe function.
   */
  subscribe(keyPattern: string, callback: (entry: SharedEntry) => void): () => void {
    const existing = this.listeners.get(keyPattern) || [];
    existing.push(callback);
    this.listeners.set(keyPattern, existing);

    return () => {
      const list = this.listeners.get(keyPattern);
      if (list) {
        const idx = list.indexOf(callback);
        if (idx >= 0) list.splice(idx, 1);
        if (list.length === 0) this.listeners.delete(keyPattern);
      }
    };
  }

  /**
   * Format context for injection into subagent prompt.
   * Returns a string that can be appended to the system prompt.
   */
  formatForPrompt(excludeSubagent?: string, maxChars = 4096): string {
    const entries = Array.from(this.entries.values())
      .filter(e => e.sourceSubagent !== excludeSubagent);

    if (entries.length === 0) return '';

    let result = '\n\n## Shared Context (from sibling subagents)\n\n';
    let charCount = result.length;

    for (const entry of entries) {
      const dataStr = typeof entry.data === 'string'
        ? entry.data
        : JSON.stringify(entry.data, null, 2);

      const section = `### [${entry.sourceType}] ${entry.key}\n${dataStr}\n\n`;

      if (charCount + section.length > maxChars) {
        result += `\n... (${entries.length - entries.indexOf(entry)} more entries truncated)\n`;
        break;
      }

      result += section;
      charCount += section.length;
    }

    return result;
  }

  /** Get stats */
  getStats(): { entries: number; dataSize: number; listeners: number } {
    return {
      entries: this.entries.size,
      dataSize: this.totalDataSize,
      listeners: this.listeners.size,
    };
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (entry) {
      this.totalDataSize -= JSON.stringify(entry.data).length;
      this.entries.delete(key);
    }
  }

  private notifyListeners(key: string, entry: SharedEntry): void {
    for (const [pattern, callbacks] of this.listeners) {
      // Simple glob: '*' matches all, 'prefix*' matches prefix
      const matches = pattern === '*' ||
        pattern === key ||
        (pattern.endsWith('*') && key.startsWith(pattern.slice(0, -1)));

      if (matches) {
        for (const cb of callbacks) {
          try { cb(entry); } catch { /* ignore listener errors */ }
        }
      }
    }
  }

  /** Destroy this context and free resources */
  destroy(): void {
    this.entries.clear();
    this.listeners.clear();
    this.totalDataSize = 0;
  }
}

// ============================================================================
// Context Manager (tracks all active shared contexts)
// ============================================================================

const activeContexts: Map<string, SharedTaskContext> = new Map();

/**
 * Get or create a shared context for a task group.
 */
export function getSharedContext(
  groupId: string,
  config?: Partial<SharedContextConfig>
): SharedTaskContext {
  let ctx = activeContexts.get(groupId);
  if (!ctx) {
    ctx = new SharedTaskContext(groupId, config);
    activeContexts.set(groupId, ctx);
  }
  return ctx;
}

/**
 * Destroy a shared context when the task group completes.
 */
export function destroySharedContext(groupId: string): void {
  const ctx = activeContexts.get(groupId);
  if (ctx) {
    ctx.destroy();
    activeContexts.delete(groupId);
  }
}

/**
 * List all active shared contexts.
 */
export function listSharedContexts(): string[] {
  return Array.from(activeContexts.keys());
}
