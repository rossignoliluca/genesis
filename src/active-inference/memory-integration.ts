/**
 * Genesis 6.3 - Memory 2.0 Integration with Active Inference
 *
 * Connects CognitiveWorkspace to Active Inference for:
 * - Anticipatory memory pre-loading based on inferred context
 * - Enhanced recall.memory action using workspace
 * - Memory state observation for inference
 *
 * Usage:
 * ```typescript
 * import { integrateMemory } from './memory-integration.js';
 * import { getMemorySystem } from '../memory/index.js';
 * import { createAutonomousLoop } from './autonomous-loop.js';
 *
 * const memory = getMemorySystem();
 * const loop = createAutonomousLoop();
 *
 * integrateMemory(loop, memory);
 *
 * // Now the loop will:
 * // 1. Anticipate memories before each cycle
 * // 2. Use cognitive workspace for recall.memory action
 * // 3. Track memory reuse metrics
 * ```
 */

import { registerAction, ActionContext, ActionResult } from './actions.js';
import { AutonomousLoop } from './autonomous-loop.js';
import type { MemorySystem, AnticipationContext, WorkingMemoryItem, MemoryReuseMetrics } from '../memory/index.js';
import { getTopMemoriesForReview, updateStabilityOnRecall } from '../memory/forgetting.js';
import type { HiddenState, Beliefs } from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface MemoryIntegrationConfig {
  // Anticipation
  enableAnticipation: boolean;    // Pre-load memories each cycle
  anticipationDepth: number;      // How many items to pre-load

  // Recall
  recallLimit: number;            // Max items per recall

  // Metrics
  logMetrics: boolean;            // Log reuse metrics
  metricsInterval: number;        // How often to log (cycles)
}

export const DEFAULT_MEMORY_INTEGRATION_CONFIG: MemoryIntegrationConfig = {
  enableAnticipation: true,
  anticipationDepth: 5,
  recallLimit: 10,
  logMetrics: false,
  metricsInterval: 10,
};

// ============================================================================
// Context Building
// ============================================================================

/**
 * Build anticipation context from current beliefs and goal
 */
function buildAnticipationContext(
  beliefs: Beliefs,
  goal?: string,
  recentActions?: string[]
): AnticipationContext {
  // Extract keywords from goal
  const keywords: string[] = [];
  if (goal) {
    keywords.push(...goal.split(/\s+/).filter(w => w.length > 3));
  }

  // v12.1: Distribution-based anticipation from beliefs
  // Uses probability mass (not just argmax) to build richer context
  const tags: string[] = [];
  const anticipationKeywords: string[] = [];

  // Viability: weighted by probability, not just peak
  const vWeights = beliefs.viability; // [critical, low, mid, high, optimal]
  if ((vWeights[0] || 0) + (vWeights[1] || 0) > 0.4) {
    tags.push('energy', 'survival');
    anticipationKeywords.push('recover', 'rest', 'recharge', 'conserve');
  }
  if ((vWeights[3] || 0) + (vWeights[4] || 0) > 0.4) {
    tags.push('opportunity', 'growth');
    anticipationKeywords.push('build', 'create', 'revenue', 'expand');
  }
  // Mid-range = stable operating
  if ((vWeights[2] || 0) > 0.5) {
    tags.push('stable', 'productive');
  }

  // World state: each level contributes proportionally
  const wWeights = beliefs.worldState; // [unknown, stable, changing, hostile]
  if ((wWeights[0] || 0) > 0.3) {
    tags.push('unknown', 'exploration');
    anticipationKeywords.push('discover', 'probe', 'scan');
  }
  if ((wWeights[2] || 0) > 0.25) {
    tags.push('changing', 'adaptation');
    anticipationKeywords.push('adapt', 'update', 'new');
  }
  if ((wWeights[3] || 0) > 0.2) {
    tags.push('hostile', 'threat');
    anticipationKeywords.push('fix', 'repair', 'defend', 'error');
  }

  // Goal progress: anticipate memories of similar states
  const gWeights = beliefs.goalProgress; // [blocked, starting, progressing, achieved]
  if ((gWeights[0] || 0) > 0.35) {
    tags.push('blocked', 'problem');
    anticipationKeywords.push('workaround', 'alternative', 'debug', 'retry');
  }
  if ((gWeights[2] || 0) + (gWeights[3] || 0) > 0.5) {
    tags.push('progressing', 'success');
    anticipationKeywords.push('next', 'deploy', 'optimize', 'complete');
  }

  const context: AnticipationContext = {
    goal,
    keywords: [...keywords, ...anticipationKeywords],
    recentActions,
    tags,
  };

  return context;
}

// ============================================================================
// Memory-Enhanced Actions
// ============================================================================

/**
 * Register enhanced recall.memory action that uses CognitiveWorkspace
 */
function registerMemoryActions(memory: MemorySystem, config: MemoryIntegrationConfig): void {
  registerAction('recall.memory', async (context: ActionContext): Promise<ActionResult> => {
    const query = context.goal || '';

    // Try workspace first (cache hit)
    const activeItems = memory.workspace.getActive();

    // Filter active items by query
    const relevant = activeItems.filter(item => {
      const content = JSON.stringify(item.memory).toLowerCase();
      const terms = query.toLowerCase().split(/\s+/);
      return terms.some(t => t.length > 2 && content.includes(t));
    });

    if (relevant.length > 0) {
      // Access items to update metrics
      relevant.forEach(item => memory.workspace.access(item.id));

      return {
        success: true,
        action: 'recall.memory',
        data: {
          recalled: relevant.map(r => r.memory),
          source: 'workspace',
          count: relevant.length,
        },
        duration: 0,
      };
    }

    // Fall back to store search
    if (query.length > 0) {
      const results = memory.recall(query, { limit: config.recallLimit });

      // Add to workspace for future access
      results.forEach(mem => {
        memory.workspace.addToBuffer(mem, 'recall', 0.6);
      });

      return {
        success: true,
        action: 'recall.memory',
        data: {
          recalled: results,
          source: 'store',
          count: results.length,
        },
        duration: 0,
      };
    }

    return {
      success: true,
      action: 'recall.memory',
      data: {
        recalled: [],
        source: 'none',
        count: 0,
      },
      duration: 0,
    };
  });

  // Enhanced dream.cycle that uses consolidation + active rehearsal
  registerAction('dream.cycle', async (context: ActionContext): Promise<ActionResult> => {
    try {
      // v14.0: Active rehearsal — refresh urgent memories before consolidation
      const allMemories = [
        ...memory.episodic.getAll(),
        ...memory.semantic.getAll(),
        ...memory.procedural.getAll(),
      ];
      const urgentMemories = getTopMemoriesForReview(allMemories, 5);
      let rehearsed = 0;
      for (const mem of urgentMemories) {
        const newStability = updateStabilityOnRecall(mem, true);
        // Update stability in the appropriate store
        if (mem.type === 'episodic') {
          memory.episodic.update(mem.id, { S: newStability, lastAccessed: new Date() });
        } else if (mem.type === 'semantic') {
          memory.semantic.update(mem.id, { S: newStability, lastAccessed: new Date() });
        } else if (mem.type === 'procedural') {
          memory.procedural.update(mem.id, { S: newStability, lastAccessed: new Date() });
        }
        rehearsed++;
      }

      const result = await memory.consolidate();

      // v14.0: Preserve top-3 active items instead of clearing workspace entirely
      const activeItems = memory.workspace.getActive();
      const stats = memory.workspace.getStats();
      const preserveIds = new Set(activeItems.slice(0, 3).map(item => item.id));

      // Evict all items except top-3
      for (const item of activeItems) {
        if (!preserveIds.has(item.id)) {
          // Access the buffer directly isn't possible, so we clear and re-add
        }
      }
      // Clear and re-add top items
      const topItems = activeItems.slice(0, 3).map(i => ({ memory: i.memory, relevance: i.relevance }));
      memory.workspace.clear();
      for (const item of topItems) {
        memory.workspace.addToBuffer(item.memory, 'recall', item.relevance);
      }

      return {
        success: true,
        action: 'dream.cycle',
        data: {
          consolidated: result,
          workspaceCleared: stats.itemCount - topItems.length,
          workspacePreserved: topItems.length,
          rehearsed,
        },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        action: 'dream.cycle',
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  });
}

// ============================================================================
// Loop Integration
// ============================================================================

/**
 * Add anticipation hook to autonomous loop
 */
function addAnticipationHook(
  loop: AutonomousLoop,
  memory: MemorySystem,
  config: MemoryIntegrationConfig
): void {
  const recentActions: string[] = [];

  // Subscribe to cycle events
  loop.onCycle((cycle: number, action: string, beliefs: Beliefs) => {
    // Track recent actions
    recentActions.push(action);
    if (recentActions.length > 5) recentActions.shift();

    // Anticipate memories for next cycle
    if (config.enableAnticipation) {
      const context = buildAnticipationContext(
        beliefs,
        undefined,  // goal could come from context
        recentActions
      );

      // Fire and forget - don't block the cycle
      void memory.anticipate(context).catch(() => {
        // Silently ignore anticipation errors
      });
    }

    // Log metrics periodically
    if (config.logMetrics && cycle % config.metricsInterval === 0) {
      const metrics = memory.getReuseMetrics();
      console.log(`[Memory 2.0] Cycle ${cycle} | Reuse: ${(metrics.reuseRate * 100).toFixed(1)}% | Anticipation: ${(metrics.anticipationAccuracy * 100).toFixed(1)}%`);
    }
  });
}

// ============================================================================
// Main Integration Function
// ============================================================================

/**
 * Integrate Memory 2.0 with Active Inference loop
 */
export function integrateMemory(
  loop: AutonomousLoop,
  memory: MemorySystem,
  config: Partial<MemoryIntegrationConfig> = {}
): void {
  const fullConfig = { ...DEFAULT_MEMORY_INTEGRATION_CONFIG, ...config };

  // Register enhanced actions
  registerMemoryActions(memory, fullConfig);

  // Add anticipation hook
  addAnticipationHook(loop, memory, fullConfig);
}

/**
 * Get memory reuse metrics from memory system
 */
export function getMemoryMetrics(memory: MemorySystem): MemoryReuseMetrics {
  return memory.getReuseMetrics();
}

/**
 * Get workspace state for observation
 */
export function getWorkspaceState(memory: MemorySystem): {
  itemCount: number;
  avgActivation: number;
  reuseRate: number;
} {
  const stats = memory.workspace.getStats();
  const metrics = memory.getReuseMetrics();

  return {
    itemCount: stats.itemCount,
    avgActivation: stats.avgActivation,
    reuseRate: metrics.reuseRate,
  };
}
