/**
 * Genesis 7.16 - Perception Stream
 *
 * Treats MCP servers as perceptual channels feeding into the CognitiveWorkspace.
 * Each MCP becomes a "sense" that provides information about the world.
 *
 * MCP → Perception → CognitiveWorkspace → GlobalWorkspace → Action
 *
 * Categories:
 * - Exteroception: External world (Brave Search, Firecrawl, GitHub)
 * - Interoception: Internal state (Memory, Sentry-like monitoring)
 * - Proprioception: Self-state (File system, Postgres)
 */

import { EventEmitter } from 'events';
import { MCPClientManager, MCPTool } from '../mcp/client-manager.js';
import { GlobalWorkspace, createWorkspaceContent, ModuleAdapter } from './global-workspace.js';
import { ContentType, ModuleType, WorkspaceContent } from './types.js';

// ============================================================================
// Types
// ============================================================================

export type PerceptionCategory = 'exteroception' | 'interoception' | 'proprioception';

export interface Perception {
  id: string;
  source: string;           // MCP server name
  category: PerceptionCategory;
  contentType: ContentType;
  data: unknown;
  salience: number;         // 0-1, how attention-grabbing
  relevance: number;        // 0-1, how goal-relevant
  timestamp: Date;
  ttl: number;              // Time-to-live in ms
}

export interface PerceptionStreamConfig {
  /** Polling interval for active perceptions (ms) */
  pollIntervalMs: number;
  /** Maximum perceptions to buffer */
  bufferSize: number;
  /** Default salience for new perceptions */
  defaultSalience: number;
  /** Decay rate for salience per second */
  salienceDecayRate: number;
  /** MCP servers to treat as external (exteroception) */
  exteroceptiveServers: string[];
  /** MCP servers to treat as internal (interoception) */
  interoceptiveServers: string[];
  /** MCP servers to treat as self (proprioception) */
  proprioceptiveServers: string[];
}

export const DEFAULT_PERCEPTION_CONFIG: PerceptionStreamConfig = {
  pollIntervalMs: 1000,
  bufferSize: 100,
  defaultSalience: 0.5,
  salienceDecayRate: 0.05,
  exteroceptiveServers: ['brave-search', 'firecrawl', 'exa', 'arxiv', 'semantic-scholar', 'context7'],
  interoceptiveServers: ['memory', 'sentry'],
  proprioceptiveServers: ['filesystem', 'postgres', 'github'],
};

// ============================================================================
// MCP → Perception Mapping
// ============================================================================

/**
 * Maps MCP tool results to perceptions
 */
export interface MCPPerceptionMapper {
  /** Convert tool result to perception */
  mapResult(server: string, tool: string, result: unknown): Perception | null;
  /** Get content type for a tool */
  getContentType(server: string, tool: string): ContentType;
  /** Calculate salience from result */
  calculateSalience(server: string, tool: string, result: unknown): number;
}

/**
 * Default mapper for common MCP servers
 */
export class DefaultPerceptionMapper implements MCPPerceptionMapper {
  mapResult(server: string, tool: string, result: unknown): Perception | null {
    if (!result) return null;

    return {
      id: `${server}:${tool}:${Date.now()}`,
      source: server,
      category: this.getCategory(server),
      contentType: this.getContentType(server, tool),
      data: result,
      salience: this.calculateSalience(server, tool, result),
      relevance: 0.5, // Will be adjusted by context
      timestamp: new Date(),
      ttl: 60000, // 1 minute default
    };
  }

  getContentType(server: string, tool: string): ContentType {
    // Map MCP servers to content types
    const serverTypeMap: Record<string, ContentType> = {
      'brave-search': 'percept',
      'firecrawl': 'percept',
      'exa': 'percept',
      'arxiv': 'memory',
      'semantic-scholar': 'memory',
      'context7': 'memory',
      'memory': 'memory',
      'filesystem': 'percept',
      'github': 'percept',
      'sentry': 'attention',
    };

    return serverTypeMap[server] || 'thought';
  }

  calculateSalience(server: string, _tool: string, result: unknown): number {
    // Base salience by server type
    const baseSalience: Record<string, number> = {
      'sentry': 0.9,      // Errors are highly salient
      'memory': 0.6,      // Retrieved memories are moderately salient
      'brave-search': 0.7, // Search results are salient
      'github': 0.5,      // Code changes moderate
    };

    let salience = baseSalience[server] || 0.5;

    // Boost for large/rich results
    if (result && typeof result === 'object') {
      const size = JSON.stringify(result).length;
      if (size > 1000) salience += 0.1;
      if (size > 5000) salience += 0.1;
    }

    return Math.min(1, salience);
  }

  private getCategory(server: string): PerceptionCategory {
    const config = DEFAULT_PERCEPTION_CONFIG;
    if (config.exteroceptiveServers.includes(server)) return 'exteroception';
    if (config.interoceptiveServers.includes(server)) return 'interoception';
    if (config.proprioceptiveServers.includes(server)) return 'proprioception';
    return 'exteroception';
  }
}

// ============================================================================
// Perception Stream
// ============================================================================

export type PerceptionEventType =
  | 'perception:received'
  | 'perception:decayed'
  | 'perception:broadcast'
  | 'stream:started'
  | 'stream:stopped';

export type PerceptionEventHandler = (event: {
  type: PerceptionEventType;
  data?: unknown;
}) => void;

/**
 * Perception Stream - Feeds MCP data into the consciousness system
 */
export class PerceptionStream extends EventEmitter {
  private config: PerceptionStreamConfig;
  private mcpManager: MCPClientManager;
  private mapper: MCPPerceptionMapper;

  // Perception buffer
  private buffer: Map<string, Perception> = new Map();

  // Current goal (for relevance calculation)
  private currentGoal: string = '';

  // Global Workspace connection
  private workspace?: GlobalWorkspace;
  private moduleId: string = 'perception-stream';

  // Polling
  private pollTimer?: ReturnType<typeof setInterval>;
  private running: boolean = false;

  constructor(
    mcpManager: MCPClientManager,
    config: Partial<PerceptionStreamConfig> = {},
    mapper?: MCPPerceptionMapper
  ) {
    super();
    this.mcpManager = mcpManager;
    this.config = { ...DEFAULT_PERCEPTION_CONFIG, ...config };
    this.mapper = mapper || new DefaultPerceptionMapper();
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(): void {
    if (this.running) return;
    this.running = true;

    // Start decay timer
    this.pollTimer = setInterval(() => {
      this.decayPerceptions();
    }, this.config.pollIntervalMs);

    this.emit('stream:started');
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }

    this.emit('stream:stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  // ============================================================================
  // Workspace Integration
  // ============================================================================

  /**
   * Connect to a Global Workspace for broadcasting
   */
  connectWorkspace(workspace: GlobalWorkspace): void {
    this.workspace = workspace;

    // Register as a module
    const adapter: ModuleAdapter = {
      id: this.moduleId,
      name: 'Perception Stream',
      type: 'perception' as ModuleType,
      active: true,
      load: 0.3,

      onPropose: () => this.proposeToWorkspace(),
      onReceive: (content) => this.receiveFromWorkspace(content),
      onSalience: () => this.getTotalSalience(),
      onRelevance: (goal) => this.getRelevance(goal),
    };

    workspace.registerModule(adapter as unknown as ReturnType<typeof import('./global-workspace.js').createModule>);
  }

  /**
   * Propose most salient perception to workspace
   */
  private proposeToWorkspace(): WorkspaceContent | null {
    const mostSalient = this.getMostSalient();
    if (!mostSalient) return null;

    return createWorkspaceContent(
      this.moduleId,
      mostSalient.contentType,
      mostSalient,
      {
        salience: mostSalient.salience,
        relevance: mostSalient.relevance,
        ttl: mostSalient.ttl,
      }
    );
  }

  /**
   * Handle broadcasts from workspace (actions to take)
   */
  private receiveFromWorkspace(content: WorkspaceContent): void {
    // Perceptions don't typically respond to broadcasts
    // But could trigger attention shifts
    this.emit('perception:broadcast', { content });
  }

  // ============================================================================
  // Perception Management
  // ============================================================================

  /**
   * Add a perception from an MCP tool call result
   */
  addFromMCP(server: string, tool: string, result: unknown): Perception | null {
    const perception = this.mapper.mapResult(server, tool, result);
    if (!perception) return null;

    // Adjust relevance based on current goal
    if (this.currentGoal) {
      perception.relevance = this.calculateRelevance(perception, this.currentGoal);
    }

    this.buffer.set(perception.id, perception);

    // Maintain buffer size
    this.maintainBufferSize();

    this.emit('perception:received', { perception });

    return perception;
  }

  /**
   * Add a raw perception
   */
  add(perception: Perception): void {
    this.buffer.set(perception.id, perception);
    this.maintainBufferSize();
    this.emit('perception:received', { perception });
  }

  /**
   * Get all current perceptions
   */
  getAll(): Perception[] {
    return Array.from(this.buffer.values())
      .sort((a, b) => b.salience - a.salience);
  }

  /**
   * Get perceptions by category
   */
  getByCategory(category: PerceptionCategory): Perception[] {
    return this.getAll().filter(p => p.category === category);
  }

  /**
   * Get perceptions by source (MCP server)
   */
  getBySource(source: string): Perception[] {
    return this.getAll().filter(p => p.source === source);
  }

  /**
   * Get most salient perception
   */
  getMostSalient(): Perception | null {
    const perceptions = this.getAll();
    if (perceptions.length === 0) return null;
    return perceptions[0];
  }

  /**
   * Get total salience (for workspace competition)
   */
  getTotalSalience(): number {
    const perceptions = this.getAll();
    if (perceptions.length === 0) return 0;

    // Sum of top 3 saliences
    return perceptions
      .slice(0, 3)
      .reduce((sum, p) => sum + p.salience, 0) / 3;
  }

  /**
   * Get relevance to a goal
   */
  getRelevance(goal: string): number {
    const perceptions = this.getAll();
    if (perceptions.length === 0) return 0;

    // Average relevance
    return perceptions.reduce((sum, p) => sum + p.relevance, 0) / perceptions.length;
  }

  // ============================================================================
  // Goal Management
  // ============================================================================

  /**
   * Set current goal for relevance calculation
   */
  setGoal(goal: string): void {
    this.currentGoal = goal;

    // Recalculate relevance for all perceptions
    for (const perception of this.buffer.values()) {
      perception.relevance = this.calculateRelevance(perception, goal);
    }
  }

  /**
   * Calculate relevance of a perception to a goal
   */
  private calculateRelevance(perception: Perception, goal: string): number {
    if (!goal) return 0.5;

    const data = JSON.stringify(perception.data).toLowerCase();
    const goalTerms = goal.toLowerCase().split(/\s+/);

    // Simple term matching
    const matches = goalTerms.filter(term =>
      term.length > 2 && data.includes(term)
    ).length;

    return Math.min(1, 0.3 + (matches / goalTerms.length) * 0.7);
  }

  // ============================================================================
  // Decay and Maintenance
  // ============================================================================

  /**
   * Decay perception salience over time
   */
  private decayPerceptions(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [id, perception] of this.buffer) {
      // Check TTL
      const age = now - perception.timestamp.getTime();
      if (age > perception.ttl) {
        toRemove.push(id);
        continue;
      }

      // Decay salience
      const decaySeconds = this.config.pollIntervalMs / 1000;
      perception.salience -= this.config.salienceDecayRate * decaySeconds;

      if (perception.salience <= 0) {
        toRemove.push(id);
      }
    }

    // Remove decayed perceptions
    for (const id of toRemove) {
      this.buffer.delete(id);
      this.emit('perception:decayed', { id });
    }
  }

  /**
   * Maintain buffer size by removing lowest salience
   */
  private maintainBufferSize(): void {
    while (this.buffer.size > this.config.bufferSize) {
      const sorted = this.getAll();
      const lowest = sorted[sorted.length - 1];
      if (lowest) {
        this.buffer.delete(lowest.id);
      } else {
        break;
      }
    }
  }

  // ============================================================================
  // Stats
  // ============================================================================

  stats(): {
    bufferSize: number;
    maxBuffer: number;
    byCategory: Record<PerceptionCategory, number>;
    bySource: Record<string, number>;
    avgSalience: number;
    avgRelevance: number;
  } {
    const perceptions = this.getAll();
    const byCategory: Record<PerceptionCategory, number> = {
      exteroception: 0,
      interoception: 0,
      proprioception: 0,
    };
    const bySource: Record<string, number> = {};

    let totalSalience = 0;
    let totalRelevance = 0;

    for (const p of perceptions) {
      byCategory[p.category]++;
      bySource[p.source] = (bySource[p.source] || 0) + 1;
      totalSalience += p.salience;
      totalRelevance += p.relevance;
    }

    return {
      bufferSize: perceptions.length,
      maxBuffer: this.config.bufferSize,
      byCategory,
      bySource,
      avgSalience: perceptions.length > 0 ? totalSalience / perceptions.length : 0,
      avgRelevance: perceptions.length > 0 ? totalRelevance / perceptions.length : 0,
    };
  }

  /**
   * Clear all perceptions
   */
  clear(): void {
    this.buffer.clear();
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createPerceptionStream(
  mcpManager: MCPClientManager,
  config?: Partial<PerceptionStreamConfig>
): PerceptionStream {
  return new PerceptionStream(mcpManager, config);
}
