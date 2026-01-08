/**
 * Genesis 6.0 - Global Workspace Theory (GWT)
 *
 * Implementation of Baars' Global Workspace Theory.
 *
 * Key concept: Consciousness arises when specialized modules
 * compete for access to a limited-capacity "global workspace".
 * The winning content is then "broadcast" to all modules,
 * creating a moment of conscious awareness.
 *
 * The workspace acts like a "blackboard" where one piece of
 * information becomes globally available (ignition).
 *
 * References:
 * - Baars, B.J. (1988). A Cognitive Theory of Consciousness.
 * - Baars, B.J. (2005). Global workspace theory of consciousness.
 * - Dehaene, S. & Naccache, L. (2001). Towards a cognitive neuroscience of consciousness.
 *
 * Usage:
 * ```typescript
 * import { createGlobalWorkspace } from './consciousness/global-workspace.js';
 *
 * const workspace = createGlobalWorkspace({ capacity: 7 });
 *
 * // Register modules
 * workspace.registerModule(perceptionModule);
 * workspace.registerModule(memoryModule);
 *
 * // Run competition cycle
 * workspace.cycle();
 *
 * // Get current conscious content
 * const content = workspace.getCurrentContent();
 * ```
 */

import { randomUUID } from 'crypto';
import {
  WorkspaceModule,
  WorkspaceContent,
  WorkspaceState,
  WorkspaceCandidate,
  IgnitionEvent,
  ContentType,
  ModuleType,
} from './types.js';

// ============================================================================
// Configuration
// ============================================================================

export interface GlobalWorkspaceConfig {
  capacity: number;                  // Max items in workspace
  selectionIntervalMs: number;       // Competition cycle interval
  broadcastTimeoutMs: number;        // Max time for broadcast
  historyLimit: number;              // Past broadcasts to keep
  salienceWeight: number;            // Weight for bottom-up salience (0-1)
  relevanceWeight: number;           // Weight for top-down relevance (0-1)
  decayRate: number;                 // Content decay rate per cycle
}

export const DEFAULT_GWT_CONFIG: GlobalWorkspaceConfig = {
  capacity: 7,                       // Miller's 7 +/- 2
  selectionIntervalMs: 100,          // 10 Hz
  broadcastTimeoutMs: 1000,
  historyLimit: 100,
  salienceWeight: 0.6,
  relevanceWeight: 0.4,
  decayRate: 0.1,
};

// ============================================================================
// Module Adapter
// ============================================================================

/**
 * Adapter for creating workspace modules from Genesis agents
 */
export interface ModuleAdapter {
  id: string;
  name: string;
  type: ModuleType;
  active: boolean;
  load: number;

  // Callbacks
  onPropose: () => WorkspaceContent | null;
  onReceive: (content: WorkspaceContent) => void;
  onSalience: () => number;
  onRelevance: (goal: string) => number;
}

/**
 * Create a workspace module from an adapter
 */
export function createModule(adapter: ModuleAdapter): WorkspaceModule {
  return {
    id: adapter.id,
    name: adapter.name,
    type: adapter.type,
    active: adapter.active,
    load: adapter.load,

    canPropose(): boolean {
      return adapter.active && adapter.load < 0.9;
    },

    propose(): WorkspaceContent | null {
      return adapter.onPropose();
    },

    receive(content: WorkspaceContent): void {
      adapter.onReceive(content);
    },

    bottomUpSalience(): number {
      return adapter.onSalience();
    },

    topDownRelevance(goal: string): number {
      return adapter.onRelevance(goal);
    },
  };
}

// ============================================================================
// Global Workspace
// ============================================================================

export type GWTEventType =
  | 'module_registered'
  | 'module_removed'
  | 'content_proposed'
  | 'content_selected'
  | 'ignition'
  | 'broadcast_complete'
  | 'workspace_cleared';

export type GWTEventHandler = (event: { type: GWTEventType; data?: unknown }) => void;

export class GlobalWorkspace {
  private config: GlobalWorkspaceConfig;
  private modules: Map<string, WorkspaceModule> = new Map();
  private state: WorkspaceState;
  private currentGoal: string = '';
  private cycleTimer: ReturnType<typeof setInterval> | null = null;
  private running: boolean = false;
  private eventHandlers: Set<GWTEventHandler> = new Set();

  constructor(config: Partial<GlobalWorkspaceConfig> = {}) {
    this.config = { ...DEFAULT_GWT_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(): void {
    if (this.running) return;

    this.running = true;
    this.cycleTimer = setInterval(
      () => this.cycle(),
      this.config.selectionIntervalMs
    );
  }

  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.cycleTimer) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  // ============================================================================
  // Module Management
  // ============================================================================

  registerModule(module: WorkspaceModule): void {
    this.modules.set(module.id, module);
    this.emit({ type: 'module_registered', data: { moduleId: module.id } });
  }

  removeModule(moduleId: string): boolean {
    const removed = this.modules.delete(moduleId);
    if (removed) {
      this.emit({ type: 'module_removed', data: { moduleId } });
    }
    return removed;
  }

  getModules(): WorkspaceModule[] {
    return Array.from(this.modules.values());
  }

  getModule(moduleId: string): WorkspaceModule | undefined {
    return this.modules.get(moduleId);
  }

  // ============================================================================
  // Goal Management
  // ============================================================================

  setGoal(goal: string): void {
    this.currentGoal = goal;
  }

  getGoal(): string {
    return this.currentGoal;
  }

  // ============================================================================
  // Competition Cycle
  // ============================================================================

  /**
   * Run one competition cycle
   * 1. Gather proposals from modules
   * 2. Score candidates
   * 3. Select winner
   * 4. Broadcast to all modules
   */
  cycle(): IgnitionEvent | null {
    // 1. Gather proposals
    const candidates = this.gatherProposals();

    if (candidates.length === 0) {
      // Decay current content
      this.decayContent();
      return null;
    }

    // 2. Score candidates
    this.scoreCandidates(candidates);

    // 3. Select winner
    const winner = this.selectWinner(candidates);

    if (!winner) {
      this.decayContent();
      return null;
    }

    // 4. Ignition - content enters workspace
    const ignition = this.ignite(winner, candidates.length);

    // 5. Broadcast to all modules
    this.broadcast(winner.content);

    return ignition;
  }

  /**
   * Gather proposals from all active modules
   */
  private gatherProposals(): WorkspaceCandidate[] {
    const candidates: WorkspaceCandidate[] = [];

    for (const module of this.modules.values()) {
      if (!module.canPropose()) continue;

      try {
        const content = module.propose();
        if (content) {
          candidates.push({
            content,
            module: module.id,
            score: 0,
            selected: false,
          });
          this.emit({ type: 'content_proposed', data: { moduleId: module.id, content } });
        }
      } catch (err) {
        console.error(`Module ${module.id} proposal error:`, err);
      }
    }

    return candidates;
  }

  /**
   * Score candidates based on salience and relevance
   */
  private scoreCandidates(candidates: WorkspaceCandidate[]): void {
    for (const candidate of candidates) {
      const module = this.modules.get(candidate.module);
      if (!module) continue;

      const salience = module.bottomUpSalience();
      const relevance = module.topDownRelevance(this.currentGoal);

      candidate.score =
        this.config.salienceWeight * salience +
        this.config.relevanceWeight * relevance;

      // Boost for content type matching current needs
      candidate.score += this.getTypeBoost(candidate.content.type);
    }

    // Update state
    this.state.candidates = candidates;
  }

  /**
   * Select the winning candidate
   */
  private selectWinner(candidates: WorkspaceCandidate[]): WorkspaceCandidate | null {
    if (candidates.length === 0) return null;

    // Sort by score
    candidates.sort((a, b) => b.score - a.score);

    // Apply some stochasticity (softmax-like selection)
    const winner = this.softmaxSelect(candidates);

    if (winner) {
      winner.selected = true;
      this.emit({ type: 'content_selected', data: { candidate: winner } });
    }

    return winner;
  }

  /**
   * Softmax-like selection with temperature
   */
  private softmaxSelect(candidates: WorkspaceCandidate[]): WorkspaceCandidate | null {
    if (candidates.length === 0) return null;

    // Temperature for selection (lower = more deterministic)
    const temperature = 0.5;

    // Calculate softmax probabilities
    const maxScore = Math.max(...candidates.map((c) => c.score));
    const expScores = candidates.map((c) =>
      Math.exp((c.score - maxScore) / temperature)
    );
    const sumExp = expScores.reduce((a, b) => a + b, 0);
    const probs = expScores.map((e) => e / sumExp);

    // Sample from distribution
    const rand = Math.random();
    let cumProb = 0;

    for (let i = 0; i < candidates.length; i++) {
      cumProb += probs[i];
      if (rand < cumProb) {
        return candidates[i];
      }
    }

    return candidates[0]; // Fallback to highest score
  }

  /**
   * Ignite - content enters the workspace
   */
  private ignite(winner: WorkspaceCandidate, competitorCount: number): IgnitionEvent {
    const now = new Date();

    // Update workspace state
    this.state.current = winner.content;
    this.state.ignited = true;
    this.state.ignitionTime = now;
    this.state.selectionCount++;

    // Create ignition event
    const ignition: IgnitionEvent = {
      content: winner.content,
      timestamp: now,
      competitorCount,
      winningScore: winner.score,
      modulesNotified: [],
      duration: 0,
    };

    this.state.lastSelection = now;
    this.emit({ type: 'ignition', data: ignition });

    return ignition;
  }

  /**
   * Broadcast winning content to all modules
   */
  private broadcast(content: WorkspaceContent): void {
    const notified: string[] = [];
    const startTime = Date.now();

    for (const module of this.modules.values()) {
      try {
        module.receive(content);
        notified.push(module.id);
      } catch (err) {
        console.error(`Module ${module.id} receive error:`, err);
      }

      // Check timeout
      if (Date.now() - startTime > this.config.broadcastTimeoutMs) {
        console.warn('Broadcast timeout reached');
        break;
      }
    }

    // Add to history
    this.state.history.unshift(content);
    if (this.state.history.length > this.config.historyLimit) {
      this.state.history.pop();
    }

    this.emit({ type: 'broadcast_complete', data: { content, notified } });
  }

  /**
   * Decay current content if nothing new selected
   */
  private decayContent(): void {
    if (this.state.current) {
      this.state.current.salience *= (1 - this.config.decayRate);

      // Remove if too weak
      if (this.state.current.salience < 0.1) {
        this.state.current = null;
        this.state.ignited = false;
      }
    }
  }

  /**
   * Get boost for content type based on current context
   */
  private getTypeBoost(type: ContentType): number {
    // Could be more sophisticated based on current state
    const boosts: Record<ContentType, number> = {
      goal: 0.2,        // Goals get priority
      emotion: 0.15,    // Emotions are salient
      attention: 0.1,   // Attention signals matter
      percept: 0.05,    // Perceptual input
      memory: 0.0,      // Neutral
      plan: 0.0,
      thought: 0.0,
    };

    return boosts[type] || 0;
  }

  // ============================================================================
  // State Access
  // ============================================================================

  getState(): WorkspaceState {
    return { ...this.state };
  }

  getCurrentContent(): WorkspaceContent | null {
    return this.state.current;
  }

  getHistory(): WorkspaceContent[] {
    return [...this.state.history];
  }

  isIgnited(): boolean {
    return this.state.ignited;
  }

  clear(): void {
    this.state = this.createInitialState();
    this.emit({ type: 'workspace_cleared' });
  }

  // ============================================================================
  // Events
  // ============================================================================

  on(handler: GWTEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: { type: GWTEventType; data?: unknown }): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('GWT event handler error:', err);
      }
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private createInitialState(): WorkspaceState {
    return {
      current: null,
      history: [],
      historyLimit: this.config.historyLimit,
      candidates: [],
      lastSelection: new Date(),
      selectionCount: 0,
      ignited: false,
      ignitionTime: null,
    };
  }

  // ============================================================================
  // Stats
  // ============================================================================

  stats(): {
    modules: number;
    isIgnited: boolean;
    selectionCount: number;
    historyLength: number;
    currentContentType: ContentType | null;
  } {
    return {
      modules: this.modules.size,
      isIgnited: this.state.ignited,
      selectionCount: this.state.selectionCount,
      historyLength: this.state.history.length,
      currentContentType: this.state.current?.type || null,
    };
  }
}

// ============================================================================
// Content Factory
// ============================================================================

export function createWorkspaceContent(
  sourceModule: string,
  type: ContentType,
  data: unknown,
  options: {
    salience?: number;
    relevance?: number;
    ttl?: number;
  } = {}
): WorkspaceContent {
  return {
    id: randomUUID(),
    sourceModule,
    type,
    data,
    salience: options.salience ?? 0.5,
    relevance: options.relevance ?? 0.5,
    timestamp: new Date(),
    ttl: options.ttl ?? 1000,
  };
}

// ============================================================================
// Factory
// ============================================================================

export function createGlobalWorkspace(
  config?: Partial<GlobalWorkspaceConfig>
): GlobalWorkspace {
  return new GlobalWorkspace(config);
}
