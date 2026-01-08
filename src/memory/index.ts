/**
 * Genesis 6.0 - Memory Module
 *
 * Unified memory system based on cognitive science:
 * - Episodic: Events with context (what/when/where/who)
 * - Semantic: Facts and concepts (knowledge)
 * - Procedural: Skills and workflows (know-how)
 *
 * Features:
 * - Ebbinghaus forgetting curve
 * - Sleep-based consolidation (episodic → semantic)
 * - Pattern extraction
 * - Skill learning
 *
 * Usage:
 * ```typescript
 * import { createMemorySystem } from './memory/index.js';
 *
 * const memory = createMemorySystem();
 *
 * // Store an episode
 * memory.remember({
 *   what: 'User asked about AI',
 *   when: new Date(),
 *   tags: ['conversation', 'AI'],
 * });
 *
 * // Create a fact
 * memory.learn({
 *   concept: 'TypeScript',
 *   definition: 'A typed superset of JavaScript',
 *   category: 'programming',
 * });
 *
 * // Create a skill
 * memory.learnSkill({
 *   name: 'git-commit',
 *   description: 'Create a git commit',
 *   steps: [
 *     { action: 'git add .' },
 *     { action: 'git commit -m "message"' },
 *   ],
 * });
 *
 * // Run consolidation (sleep)
 * await memory.sleep();
 * ```
 */

// Re-export types
export * from './types.js';

// Re-export modules
export * from './forgetting.js';
export { EpisodicStore, createEpisodicStore, type CreateEpisodicOptions } from './episodic.js';
export { SemanticStore, createSemanticStore, type CreateSemanticOptions } from './semantic.js';
export { ProceduralStore, createProceduralStore, type CreateProceduralOptions } from './procedural.js';
export { ConsolidationService, createConsolidationService } from './consolidation.js';

import { EpisodicStore, createEpisodicStore, CreateEpisodicOptions } from './episodic.js';
import { SemanticStore, createSemanticStore, CreateSemanticOptions } from './semantic.js';
import { ProceduralStore, createProceduralStore, CreateProceduralOptions } from './procedural.js';
import { ConsolidationService, createConsolidationService } from './consolidation.js';
import {
  Memory,
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
  ConsolidationResult,
  StoreStats,
} from './types.js';
import { calculateForgettingStats } from './forgetting.js';

// ============================================================================
// Memory System Configuration
// ============================================================================

export interface MemorySystemConfig {
  episodic?: {
    maxSize?: number;
    autoForget?: boolean;
  };
  semantic?: {
    maxSize?: number;
    autoForget?: boolean;
    minConfidence?: number;
  };
  procedural?: {
    maxSize?: number;
    autoForget?: boolean;
    minSuccessRate?: number;
  };
  consolidation?: {
    backgroundIntervalMs?: number;
    autoStart?: boolean;
  };
}

// ============================================================================
// Unified Memory System
// ============================================================================

/**
 * Unified memory system with episodic, semantic, and procedural stores
 */
export class MemorySystem {
  readonly episodic: EpisodicStore;
  readonly semantic: SemanticStore;
  readonly procedural: ProceduralStore;
  readonly consolidation: ConsolidationService;

  constructor(config: MemorySystemConfig = {}) {
    this.episodic = createEpisodicStore(config.episodic);
    this.semantic = createSemanticStore(config.semantic);
    this.procedural = createProceduralStore(config.procedural);
    this.consolidation = createConsolidationService(
      this.episodic,
      this.semantic,
      this.procedural,
      config.consolidation
    );

    // Auto-start background consolidation if configured
    if (config.consolidation?.autoStart) {
      this.consolidation.startBackground();
    }
  }

  // ============================================================================
  // High-Level API
  // ============================================================================

  /**
   * Store an episodic memory (event)
   */
  remember(options: CreateEpisodicOptions): EpisodicMemory {
    return this.episodic.createEpisode(options);
  }

  /**
   * Store a semantic memory (fact)
   */
  learn(options: CreateSemanticOptions): SemanticMemory {
    return this.semantic.createFact(options);
  }

  /**
   * Store a procedural memory (skill)
   */
  learnSkill(options: CreateProceduralOptions): ProceduralMemory {
    return this.procedural.createSkill(options);
  }

  /**
   * Recall memories by query
   */
  recall(query: string, options: {
    types?: ('episodic' | 'semantic' | 'procedural')[];
    limit?: number;
  } = {}): Memory[] {
    const types = options.types || ['episodic', 'semantic', 'procedural'];
    const limit = options.limit || 10;
    const results: Memory[] = [];

    if (types.includes('episodic')) {
      results.push(...this.episodic.search(query, limit));
    }
    if (types.includes('semantic')) {
      results.push(...this.semantic.search(query, limit));
    }
    if (types.includes('procedural')) {
      results.push(...this.procedural.search(query, limit));
    }

    // Sort by retention and return top results
    return results
      .sort((a, b) => {
        const retA = this.getRetention(a);
        const retB = this.getRetention(b);
        return retB - retA;
      })
      .slice(0, limit);
  }

  /**
   * Get a specific fact by concept name
   */
  getFact(concept: string): SemanticMemory | undefined {
    return this.semantic.getByConcept(concept);
  }

  /**
   * Get a specific skill by name
   */
  getSkill(name: string): ProceduralMemory | undefined {
    return this.procedural.getByName(name);
  }

  /**
   * Get recent episodes
   */
  getRecentEpisodes(limit: number = 10): EpisodicMemory[] {
    return this.episodic.getRecent(limit);
  }

  /**
   * Run consolidation (sleep mode)
   */
  async sleep(): Promise<ConsolidationResult> {
    return this.consolidation.sleep();
  }

  /**
   * Run quick background consolidation
   */
  async consolidate(): Promise<ConsolidationResult> {
    return this.consolidation.backgroundConsolidate();
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Calculate retention for any memory type
   */
  private getRetention(memory: Memory): number {
    const elapsed = Date.now() - memory.lastAccessed.getTime();
    const elapsedDays = elapsed / (1000 * 60 * 60 * 24);
    return memory.R0 * Math.exp(-elapsedDays / memory.S);
  }

  /**
   * Get overall memory statistics
   */
  getStats(): {
    total: number;
    episodic: StoreStats;
    semantic: StoreStats;
    procedural: StoreStats;
    forgetting: {
      episodic: ReturnType<typeof calculateForgettingStats>;
      semantic: ReturnType<typeof calculateForgettingStats>;
      procedural: ReturnType<typeof calculateForgettingStats>;
    };
    consolidation: ReturnType<ConsolidationService['getStats']>;
  } {
    const episodicStats = this.episodic.stats();
    const semanticStats = this.semantic.stats();
    const proceduralStats = this.procedural.stats();

    return {
      total: episodicStats.total + semanticStats.total + proceduralStats.total,
      episodic: episodicStats,
      semantic: semanticStats,
      procedural: proceduralStats,
      forgetting: {
        episodic: calculateForgettingStats(this.episodic.getAll()),
        semantic: calculateForgettingStats(this.semantic.getAll()),
        procedural: calculateForgettingStats(this.procedural.getAll()),
      },
      consolidation: this.consolidation.getStats(),
    };
  }

  /**
   * Clear all memories
   */
  clear(): void {
    this.episodic.clear();
    this.semantic.clear();
    this.procedural.clear();
  }

  /**
   * Shutdown the memory system
   */
  shutdown(): void {
    this.consolidation.stopBackground();
  }

  // ============================================================================
  // Import/Export
  // ============================================================================

  /**
   * Export all memories to JSON
   */
  export(): {
    episodic: EpisodicMemory[];
    semantic: SemanticMemory[];
    procedural: ProceduralMemory[];
    exportedAt: string;
  } {
    return {
      episodic: this.episodic.getAll(),
      semantic: this.semantic.getAll(),
      procedural: this.procedural.getAll(),
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Import memories from JSON
   */
  import(data: {
    episodic?: EpisodicMemory[];
    semantic?: SemanticMemory[];
    procedural?: ProceduralMemory[];
  }): { imported: number } {
    let imported = 0;

    if (data.episodic) {
      for (const memory of data.episodic) {
        this.episodic.store(memory);
        imported++;
      }
    }

    if (data.semantic) {
      for (const memory of data.semantic) {
        this.semantic.store(memory);
        imported++;
      }
    }

    if (data.procedural) {
      for (const memory of data.procedural) {
        this.procedural.store(memory);
        imported++;
      }
    }

    return { imported };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new memory system
 */
export function createMemorySystem(config?: MemorySystemConfig): MemorySystem {
  return new MemorySystem(config);
}

// ============================================================================
// Singleton Instance (optional)
// ============================================================================

let memorySystemInstance: MemorySystem | null = null;

/**
 * Get or create the global memory system instance
 */
export function getMemorySystem(config?: MemorySystemConfig): MemorySystem {
  if (!memorySystemInstance) {
    memorySystemInstance = createMemorySystem(config);
  }
  return memorySystemInstance;
}

/**
 * Reset the global memory system instance
 */
export function resetMemorySystem(): void {
  if (memorySystemInstance) {
    memorySystemInstance.shutdown();
    memorySystemInstance = null;
  }
}
