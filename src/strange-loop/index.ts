/**
 * Strange Loop Module - Self-Reference and Identity
 *
 * Implements Hofstadter's Strange Loop theory:
 * - Tangled hierarchies of self-reference
 * - Meta-cognition about meta-cognition
 * - Attractor detection and convergence
 * - Identity crystallization
 *
 * Strange loops create the illusion of a unified "self"
 * through recursive self-modeling.
 *
 * Based on:
 * - Douglas Hofstadter's "Gödel, Escher, Bach" and "I Am a Strange Loop"
 * - Self-referential systems
 * - Fixed-point theory
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export interface Level {
  id: string;
  name: string;
  depth: number;           // 0 = base, higher = more meta
  content: unknown;
  references: string[];    // Levels this level refers to
  referencedBy: string[]; // Levels that reference this level
}

export interface Thought {
  id: string;
  content: string;
  level: number;
  aboutThought?: string;   // ID of thought this is about
  timestamp: number;
}

export interface Reflection {
  original: Thought;
  meta: Thought;
  metaMeta?: Thought;
  fixedPoint: boolean;
  iterations: number;
}

export interface Attractor {
  id: string;
  type: AttractorType;
  thoughts: string[];      // Thought IDs in the attractor
  strength: number;        // 0-1 how stable
  period: number;          // For limit cycles
  basin: number;           // Size of basin of attraction
}

export type AttractorType =
  | 'fixed_point'    // Single stable state
  | 'limit_cycle'    // Periodic oscillation
  | 'strange'        // Chaotic attractor
  | 'quasi_periodic';// Almost periodic

export interface Identity {
  id: string;
  coreBeliefs: string[];
  values: Map<string, number>;
  narratives: string[];
  stability: number;
  timestamp: number;
}

export interface SelfModel {
  thoughts: Map<string, Thought>;
  levels: Map<string, Level>;
  identity: Identity | null;
  attractors: Attractor[];
}

export interface LoopConfig {
  maxDepth: number;
  maxIterations: number;
  convergenceThreshold: number;
  identityThreshold: number;
  attractorDetectionWindow: number;
}

export interface LoopMetrics {
  thoughtsGenerated: number;
  reflectionsPerformed: number;
  fixedPointsFound: number;
  attractorsDetected: number;
  maxDepthReached: number;
  identityCrystallizations: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: LoopConfig = {
  maxDepth: 7,
  maxIterations: 100,
  convergenceThreshold: 0.05,
  identityThreshold: 0.8,
  attractorDetectionWindow: 10
};

// ============================================================================
// Strange Loop Engine
// ============================================================================

export class StrangeLoop extends EventEmitter {
  private config: LoopConfig;
  private selfModel: SelfModel;
  private thoughtHistory: Thought[];
  private metrics: LoopMetrics;

  constructor(config: Partial<LoopConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.selfModel = {
      thoughts: new Map(),
      levels: new Map(),
      identity: null,
      attractors: []
    };
    this.thoughtHistory = [];
    this.metrics = {
      thoughtsGenerated: 0,
      reflectionsPerformed: 0,
      fixedPointsFound: 0,
      attractorsDetected: 0,
      maxDepthReached: 0,
      identityCrystallizations: 0
    };

    // Initialize base level
    this.addLevel({
      id: 'level-0',
      name: 'Ground',
      depth: 0,
      content: 'Direct experience',
      references: [],
      referencedBy: []
    });
  }

  /**
   * Add a level to the hierarchy
   */
  addLevel(level: Level): void {
    this.selfModel.levels.set(level.id, level);

    // Update references
    for (const refId of level.references) {
      const refLevel = this.selfModel.levels.get(refId);
      if (refLevel && !refLevel.referencedBy.includes(level.id)) {
        refLevel.referencedBy.push(level.id);
      }
    }

    this.emit('level:added', level);
  }

  /**
   * Create a thought at a given level
   */
  think(content: string, level: number = 0, aboutThought?: string): Thought {
    const thought: Thought = {
      id: `thought-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content,
      level,
      aboutThought,
      timestamp: Date.now()
    };

    this.selfModel.thoughts.set(thought.id, thought);
    this.thoughtHistory.push(thought);
    this.metrics.thoughtsGenerated++;

    if (level > this.metrics.maxDepthReached) {
      this.metrics.maxDepthReached = level;
    }

    this.emit('thought:created', thought);
    return thought;
  }

  /**
   * Reflect on a thought - create meta-level thought about it
   */
  reflect(thought: Thought): Thought {
    const metaContent = `Thinking about: "${thought.content}"`;
    const metaThought = this.think(metaContent, thought.level + 1, thought.id);
    return metaThought;
  }

  /**
   * Perform meta-meta reflection - reflect on reflecting
   */
  metaMeta(): Reflection {
    this.metrics.reflectionsPerformed++;

    // Get or create a base thought
    const baseThought = this.getRecentThought(0) ||
      this.think('I am thinking', 0);

    // First-level reflection
    const meta = this.reflect(baseThought);

    // Second-level reflection
    const metaMeta = this.reflect(meta);

    // Check for fixed point (convergence)
    const fixedPoint = this.checkFixedPoint(meta, metaMeta);

    if (fixedPoint) {
      this.metrics.fixedPointsFound++;
    }

    const reflection: Reflection = {
      original: baseThought,
      meta,
      metaMeta,
      fixedPoint,
      iterations: 2
    };

    this.emit('reflection:completed', reflection);
    return reflection;
  }

  /**
   * Find fixed point through iterative reflection
   */
  findFixedPoint(thoughts: Thought[]): Thought | null {
    if (thoughts.length < 2) return null;

    // Look for convergence in thought content
    for (let i = 1; i < thoughts.length; i++) {
      const similarity = this.computeSimilarity(
        thoughts[i - 1].content,
        thoughts[i].content
      );

      if (similarity > (1 - this.config.convergenceThreshold)) {
        this.metrics.fixedPointsFound++;
        return thoughts[i];
      }
    }

    return null;
  }

  /**
   * Check if two thoughts represent a fixed point
   */
  private checkFixedPoint(t1: Thought, t2: Thought): boolean {
    const similarity = this.computeSimilarity(t1.content, t2.content);
    return similarity > (1 - this.config.convergenceThreshold);
  }

  /**
   * Compute similarity between two strings
   */
  private computeSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1;

    // Jaccard similarity on words
    const words1 = new Set(s1.toLowerCase().split(/\s+/));
    const words2 = new Set(s2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Detect attractors in thought history
   */
  detectAttractor(): Attractor | null {
    if (this.thoughtHistory.length < this.config.attractorDetectionWindow) {
      return null;
    }

    const recent = this.thoughtHistory.slice(-this.config.attractorDetectionWindow);

    // Check for fixed point attractor
    const fixedPoint = this.detectFixedPointAttractor(recent);
    if (fixedPoint) {
      this.selfModel.attractors.push(fixedPoint);
      this.metrics.attractorsDetected++;
      this.emit('attractor:detected', fixedPoint);
      return fixedPoint;
    }

    // Check for limit cycle
    const limitCycle = this.detectLimitCycle(recent);
    if (limitCycle) {
      this.selfModel.attractors.push(limitCycle);
      this.metrics.attractorsDetected++;
      this.emit('attractor:detected', limitCycle);
      return limitCycle;
    }

    return null;
  }

  /**
   * Detect fixed point attractor
   */
  private detectFixedPointAttractor(thoughts: Thought[]): Attractor | null {
    // Check if last few thoughts are very similar
    const lastFew = thoughts.slice(-3);
    if (lastFew.length < 3) return null;

    const sim1 = this.computeSimilarity(lastFew[0].content, lastFew[1].content);
    const sim2 = this.computeSimilarity(lastFew[1].content, lastFew[2].content);

    if (sim1 > 0.9 && sim2 > 0.9) {
      return {
        id: `attractor-fp-${Date.now()}`,
        type: 'fixed_point',
        thoughts: lastFew.map(t => t.id),
        strength: (sim1 + sim2) / 2,
        period: 1,
        basin: 3
      };
    }

    return null;
  }

  /**
   * Detect limit cycle attractor
   */
  private detectLimitCycle(thoughts: Thought[]): Attractor | null {
    // Look for repeating patterns
    for (let period = 2; period <= 4; period++) {
      if (thoughts.length < period * 2) continue;

      const cycle1 = thoughts.slice(-period * 2, -period);
      const cycle2 = thoughts.slice(-period);

      let matches = 0;
      for (let i = 0; i < period; i++) {
        const sim = this.computeSimilarity(cycle1[i].content, cycle2[i].content);
        if (sim > 0.8) matches++;
      }

      if (matches === period) {
        return {
          id: `attractor-lc-${Date.now()}`,
          type: 'limit_cycle',
          thoughts: cycle2.map(t => t.id),
          strength: matches / period,
          period,
          basin: period * 2
        };
      }
    }

    return null;
  }

  /**
   * Crystallize identity from stable patterns
   */
  crystallizeIdentity(): Identity {
    // Collect stable patterns
    const stableThoughts = this.thoughtHistory
      .filter(t => {
        const attractor = this.selfModel.attractors.find(a =>
          a.thoughts.includes(t.id)
        );
        return attractor && attractor.strength > this.config.identityThreshold;
      });

    // Extract core beliefs
    const coreBeliefs = [...new Set(stableThoughts.map(t => t.content))].slice(0, 5);

    // Calculate values from thought levels
    const values = new Map<string, number>();
    for (const thought of stableThoughts) {
      const key = `depth-${thought.level}`;
      values.set(key, (values.get(key) || 0) + 1);
    }

    // Normalize values
    const maxValue = Math.max(...values.values());
    for (const [key, value] of values) {
      values.set(key, value / maxValue);
    }

    // Create narratives
    const narratives = this.generateNarratives(stableThoughts);

    // Calculate stability
    const stability = this.selfModel.attractors.length > 0
      ? this.selfModel.attractors.reduce((sum, a) => sum + a.strength, 0) /
        this.selfModel.attractors.length
      : 0;

    const identity: Identity = {
      id: `identity-${Date.now()}`,
      coreBeliefs,
      values,
      narratives,
      stability,
      timestamp: Date.now()
    };

    this.selfModel.identity = identity;
    this.metrics.identityCrystallizations++;
    this.emit('identity:crystallized', identity);
    return identity;
  }

  /**
   * Generate narratives from thoughts
   */
  private generateNarratives(thoughts: Thought[]): string[] {
    const narratives: string[] = [];

    // Group by level
    const byLevel = new Map<number, Thought[]>();
    for (const t of thoughts) {
      const level = byLevel.get(t.level) || [];
      level.push(t);
      byLevel.set(t.level, level);
    }

    // Create narrative for each level
    for (const [level, levelThoughts] of byLevel) {
      if (levelThoughts.length >= 2) {
        narratives.push(
          `At level ${level}: ${levelThoughts.map(t => t.content).join(' → ')}`
        );
      }
    }

    return narratives;
  }

  /**
   * Execute full strange loop cycle
   */
  async fullCycle(initialThought: string): Promise<{
    reflection: Reflection;
    attractor: Attractor | null;
    identity: Identity | null;
  }> {
    // Start with initial thought
    this.think(initialThought, 0);

    // Perform reflections up to max depth
    let lastThought = this.getRecentThought(0)!;
    for (let depth = 1; depth <= this.config.maxDepth; depth++) {
      lastThought = this.reflect(lastThought);

      // Check for fixed point
      if (depth > 1) {
        const prev = this.getRecentThought(depth - 1);
        if (prev && this.checkFixedPoint(prev, lastThought)) {
          break;
        }
      }
    }

    // Meta-meta reflection
    const reflection = this.metaMeta();

    // Detect attractor
    const attractor = this.detectAttractor();

    // Potentially crystallize identity
    let identity: Identity | null = null;
    if (attractor && attractor.strength > this.config.identityThreshold) {
      identity = this.crystallizeIdentity();
    }

    return { reflection, attractor, identity };
  }

  /**
   * Get recent thought at a level
   */
  private getRecentThought(level: number): Thought | null {
    for (let i = this.thoughtHistory.length - 1; i >= 0; i--) {
      if (this.thoughtHistory[i].level === level) {
        return this.thoughtHistory[i];
      }
    }
    return null;
  }

  /**
   * Check if loop is tangled (has strange loop structure)
   */
  isTangled(): boolean {
    // A loop is tangled if higher levels reference lower levels
    for (const level of this.selfModel.levels.values()) {
      for (const refId of level.references) {
        const refLevel = this.selfModel.levels.get(refId);
        if (refLevel && refLevel.depth < level.depth) {
          // Higher references lower - tangled!
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get self model
   */
  getSelfModel(): SelfModel {
    return {
      thoughts: new Map(this.selfModel.thoughts),
      levels: new Map(this.selfModel.levels),
      identity: this.selfModel.identity ? { ...this.selfModel.identity } : null,
      attractors: [...this.selfModel.attractors]
    };
  }

  /**
   * Get thought history
   */
  getHistory(): Thought[] {
    return [...this.thoughtHistory];
  }

  /**
   * Get metrics
   */
  getMetrics(): LoopMetrics {
    return { ...this.metrics };
  }

  /**
   * Get identity
   */
  getIdentity(): Identity | null {
    return this.selfModel.identity ? { ...this.selfModel.identity } : null;
  }

  /**
   * Get attractors
   */
  getAttractors(): Attractor[] {
    return [...this.selfModel.attractors];
  }

  /**
   * Reset state
   */
  reset(): void {
    this.selfModel = {
      thoughts: new Map(),
      levels: new Map(),
      identity: null,
      attractors: []
    };
    this.thoughtHistory = [];

    // Re-initialize base level
    this.addLevel({
      id: 'level-0',
      name: 'Ground',
      depth: 0,
      content: 'Direct experience',
      references: [],
      referencedBy: []
    });

    this.emit('reset');
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a thought
 */
export function createThought(content: string, level: number = 0): Thought {
  return {
    id: `thought-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    content,
    level,
    timestamp: Date.now()
  };
}

/**
 * Create a level
 */
export function createLevel(
  name: string,
  depth: number,
  content: unknown,
  references: string[] = []
): Level {
  return {
    id: `level-${depth}-${Date.now()}`,
    name,
    depth,
    content,
    references,
    referencedBy: []
  };
}

// ============================================================================
// Global Instance
// ============================================================================

let globalLoop: StrangeLoop | null = null;

/**
 * Get global strange loop instance
 */
export function getStrangeLoop(config?: Partial<LoopConfig>): StrangeLoop {
  if (!globalLoop) {
    globalLoop = new StrangeLoop(config);
  }
  return globalLoop;
}

/**
 * Reset global strange loop
 */
export function resetStrangeLoop(): void {
  if (globalLoop) {
    globalLoop.reset();
  }
  globalLoop = null;
}
