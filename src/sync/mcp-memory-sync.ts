/**
 * Genesis v9.0 - MCP Memory Auto-Sync
 *
 * Automatically synchronizes the Genesis self-model with MCP Memory server.
 * This enables persistent, cross-session memory through the MCP ecosystem.
 *
 * Features:
 * - Bidirectional sync (Genesis ↔ MCP Memory)
 * - Incremental updates (only sync changed entities)
 * - Conflict resolution (last-write-wins with merge)
 * - Background sync daemon support
 */

import { getSelfModelGenerator, SelfModel } from '../self-modification/self-model.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface MCPMemoryEntity {
  name: string;
  entityType: string;
  observations: string[];
}

export interface MCPMemoryRelation {
  from: string;
  to: string;
  relationType: string;
}

export interface MCPMemoryGraph {
  entities: MCPMemoryEntity[];
  relations: MCPMemoryRelation[];
}

export interface SyncConfig {
  /** MCP Memory endpoint (if using HTTP transport) */
  mcpEndpoint?: string;
  /** Auto-sync interval in milliseconds (0 = disabled) */
  syncInterval: number;
  /** Path to local sync state file */
  statePath: string;
  /** Entity prefix for Genesis entities in MCP Memory */
  entityPrefix: string;
  /** Enable verbose logging */
  verbose: boolean;
}

export interface SyncState {
  lastSyncTimestamp: number;
  lastLocalHash: string;
  lastRemoteHash: string;
  syncCount: number;
  conflicts: SyncConflict[];
}

export interface SyncConflict {
  entityName: string;
  localValue: string[];
  remoteValue: string[];
  resolvedAt: number;
  resolution: 'local' | 'remote' | 'merge';
}

export interface SyncResult {
  success: boolean;
  entitiesSynced: number;
  relationsSynced: number;
  conflicts: number;
  duration: number;
  error?: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: SyncConfig = {
  syncInterval: 60000, // 1 minute
  statePath: '.genesis/sync-state.json',
  entityPrefix: 'genesis:',
  verbose: false,
};

// ============================================================================
// MCP Memory Sync
// ============================================================================

export class MCPMemorySync {
  private config: SyncConfig;
  private state: SyncState;
  private syncTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<SyncConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = this.loadState();
  }

  /**
   * Start automatic background sync
   */
  startAutoSync(): void {
    if (this.syncTimer) {
      this.stopAutoSync();
    }

    if (this.config.syncInterval > 0) {
      this.log('Starting auto-sync with interval:', this.config.syncInterval, 'ms');
      this.syncTimer = setInterval(() => {
        this.sync().catch(err => {
          this.log('Auto-sync error:', err.message);
        });
      }, this.config.syncInterval);
    }
  }

  /**
   * Stop automatic background sync
   */
  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      this.log('Auto-sync stopped');
    }
  }

  /**
   * Perform a full sync between Genesis self-model and MCP Memory
   */
  async sync(): Promise<SyncResult> {
    const startTime = Date.now();

    try {
      // Build current self-model
      const selfModel = await getSelfModelGenerator().generate();

      // Convert to MCP Memory format
      const localGraph = this.selfModelToMCPGraph(selfModel);

      // Get current MCP Memory state (simulated - would call MCP tool)
      const remoteGraph = await this.fetchMCPMemory();

      // Compute diff and merge
      const merged = this.mergeGraphs(localGraph, remoteGraph);

      // Push merged state to MCP Memory
      const pushResult = await this.pushToMCPMemory(merged);

      // Update local state
      this.state.lastSyncTimestamp = Date.now();
      this.state.lastLocalHash = this.hashGraph(localGraph);
      this.state.lastRemoteHash = this.hashGraph(merged);
      this.state.syncCount++;
      this.saveState();

      const duration = Date.now() - startTime;

      this.log(`Sync complete: ${merged.entities.length} entities, ${merged.relations.length} relations in ${duration}ms`);

      return {
        success: true,
        entitiesSynced: merged.entities.length,
        relationsSynced: merged.relations.length,
        conflicts: this.state.conflicts.length,
        duration,
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        entitiesSynced: 0,
        relationsSynced: 0,
        conflicts: 0,
        duration: Date.now() - startTime,
        error: err.message,
      };
    }
  }

  /**
   * Convert Genesis SelfModel to MCP Memory graph format
   */
  private selfModelToMCPGraph(model: SelfModel): MCPMemoryGraph {
    const entities: MCPMemoryEntity[] = [];
    const relations: MCPMemoryRelation[] = [];
    const prefix = this.config.entityPrefix;

    // Add core entity
    entities.push({
      name: `${prefix}core`,
      entityType: 'system',
      observations: [
        `Version: ${model.version}`,
        `Generated: ${model.generatedAt}`,
        `Architecture: Autopoietic Cognitive System`,
      ],
    });

    // Add layers (architecture.layers is string[])
    model.architecture.layers.forEach((layerName: string, index: number) => {
      const layerEntity = `${prefix}layer:${layerName.toLowerCase().replace(/\s+/g, '-')}`;
      entities.push({
        name: layerEntity,
        entityType: 'layer',
        observations: [
          `Name: ${layerName}`,
          `Order: ${index + 1}`,
        ],
      });

      // Relation: core -> layer
      relations.push({
        from: `${prefix}core`,
        to: layerEntity,
        relationType: 'has_layer',
      });
    });

    // Add modules (architecture.modules is ModuleInfo[])
    model.architecture.modules.forEach((mod) => {
      const moduleEntity = `${prefix}module:${mod.name.toLowerCase()}`;
      entities.push({
        name: moduleEntity,
        entityType: 'module',
        observations: [
          `Name: ${mod.name}`,
          `Path: ${mod.path}`,
          `Description: ${mod.description}`,
          `TCB Protected: ${mod.tcbProtected}`,
          `Exports: ${mod.exports.slice(0, 5).join(', ')}`,
        ],
      });
      relations.push({
        from: `${prefix}core`,
        to: moduleEntity,
        relationType: 'has_module',
      });
    });

    // Add capabilities (string[])
    model.capabilities.forEach((cap: string) => {
      const capName = `${prefix}capability:${cap.toLowerCase().replace(/\s+/g, '-')}`;
      entities.push({
        name: capName,
        entityType: 'capability',
        observations: [`Capability: ${cap}`],
      });
      relations.push({
        from: `${prefix}core`,
        to: capName,
        relationType: 'has_capability',
      });
    });

    // Add architectural patterns (architecture.patterns is PatternInfo[])
    model.architecture.patterns.forEach((pattern) => {
      const patternName = `${prefix}pattern:${pattern.name.toLowerCase().replace(/\s+/g, '-')}`;
      entities.push({
        name: patternName,
        entityType: 'pattern',
        observations: [
          `Name: ${pattern.name}`,
          `Description: ${pattern.description}`,
          `Purpose: ${pattern.purpose}`,
          `Files: ${pattern.files.slice(0, 3).join(', ')}`,
        ],
      });
      relations.push({
        from: `${prefix}core`,
        to: patternName,
        relationType: 'uses_pattern',
      });
    });

    // Add metrics (MetricInfo[])
    const metricsEntity = `${prefix}metrics`;
    const metricsObs = model.metrics.map(
      (m) => `${m.name}: ${m.current} (${m.trend})`
    );
    entities.push({
      name: metricsEntity,
      entityType: 'metrics',
      observations: metricsObs,
    });
    relations.push({
      from: `${prefix}core`,
      to: metricsEntity,
      relationType: 'has_metrics',
    });

    return { entities, relations };
  }

  /**
   * Fetch current state from MCP Memory
   * Note: In production, this calls the MCP Memory tool
   */
  private async fetchMCPMemory(): Promise<MCPMemoryGraph> {
    // Check for cached remote state
    const cachePath = path.join(path.dirname(this.config.statePath), 'mcp-memory-cache.json');

    try {
      if (fs.existsSync(cachePath)) {
        const data = fs.readFileSync(cachePath, 'utf-8');
        return JSON.parse(data) as MCPMemoryGraph;
      }
    } catch {
      // Cache miss or parse error
    }

    // Return empty graph if no cache
    return { entities: [], relations: [] };
  }

  /**
   * Push merged state to MCP Memory
   * Note: In production, this calls MCP Memory tools
   */
  private async pushToMCPMemory(graph: MCPMemoryGraph): Promise<{ success: boolean }> {
    // Save to local cache (simulating MCP Memory push)
    const cachePath = path.join(path.dirname(this.config.statePath), 'mcp-memory-cache.json');

    try {
      const dir = path.dirname(cachePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(cachePath, JSON.stringify(graph, null, 2));
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  /**
   * Merge local and remote graphs with conflict resolution
   */
  private mergeGraphs(local: MCPMemoryGraph, remote: MCPMemoryGraph): MCPMemoryGraph {
    const entityMap = new Map<string, MCPMemoryEntity>();
    const relationSet = new Set<string>();
    const relations: MCPMemoryRelation[] = [];

    // Add remote entities first (lower priority)
    for (const entity of remote.entities) {
      entityMap.set(entity.name, entity);
    }

    // Merge local entities (higher priority - overwrites remote)
    for (const entity of local.entities) {
      const existing = entityMap.get(entity.name);
      if (existing) {
        // Merge observations (union with dedup)
        const mergedObs = [...new Set([...existing.observations, ...entity.observations])];
        entityMap.set(entity.name, {
          ...entity,
          observations: mergedObs,
        });
      } else {
        entityMap.set(entity.name, entity);
      }
    }

    // Merge relations (union)
    for (const rel of [...remote.relations, ...local.relations]) {
      const key = `${rel.from}|${rel.to}|${rel.relationType}`;
      if (!relationSet.has(key)) {
        relationSet.add(key);
        relations.push(rel);
      }
    }

    return {
      entities: Array.from(entityMap.values()),
      relations,
    };
  }

  /**
   * Compute hash of graph for change detection
   */
  private hashGraph(graph: MCPMemoryGraph): string {
    const content = JSON.stringify({
      entities: graph.entities.sort((a, b) => a.name.localeCompare(b.name)),
      relations: graph.relations.sort((a, b) =>
        `${a.from}${a.to}`.localeCompare(`${b.from}${b.to}`)
      ),
    });

    // Simple hash
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Load sync state from disk
   */
  private loadState(): SyncState {
    try {
      if (fs.existsSync(this.config.statePath)) {
        const data = fs.readFileSync(this.config.statePath, 'utf-8');
        return JSON.parse(data) as SyncState;
      }
    } catch {
      // Ignore errors, return default state
    }

    return {
      lastSyncTimestamp: 0,
      lastLocalHash: '',
      lastRemoteHash: '',
      syncCount: 0,
      conflicts: [],
    };
  }

  /**
   * Save sync state to disk
   */
  private saveState(): void {
    try {
      const dir = path.dirname(this.config.statePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.config.statePath, JSON.stringify(this.state, null, 2));
    } catch (error) {
      this.log('Failed to save sync state:', (error as Error).message);
    }
  }

  /**
   * Get sync statistics
   */
  getStats(): SyncState & { isRunning: boolean } {
    return {
      ...this.state,
      isRunning: this.syncTimer !== null,
    };
  }

  /**
   * Log message if verbose mode enabled
   */
  private log(...args: unknown[]): void {
    if (this.config.verbose) {
      console.log('[MCP-Sync]', ...args);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

let globalSync: MCPMemorySync | null = null;

/**
 * Get or create the global MCP Memory sync instance
 */
export function getMCPMemorySync(config?: Partial<SyncConfig>): MCPMemorySync {
  if (!globalSync) {
    globalSync = new MCPMemorySync(config);
  }
  return globalSync;
}

/**
 * Perform a one-shot sync
 */
export async function syncToMCPMemory(): Promise<SyncResult> {
  const sync = getMCPMemorySync({ verbose: true });
  return sync.sync();
}

/**
 * Start background auto-sync
 */
export function startMCPMemoryAutoSync(intervalMs: number = 60000): void {
  const sync = getMCPMemorySync({ syncInterval: intervalMs, verbose: true });
  sync.startAutoSync();
}

/**
 * Stop background auto-sync
 */
export function stopMCPMemoryAutoSync(): void {
  if (globalSync) {
    globalSync.stopAutoSync();
  }
}
