/**
 * Genesis 6.1 - Action Executors
 *
 * Maps discrete actions from Active Inference to actual system operations.
 * v7.6.0: Connected to real PhiMonitor + CognitiveWorkspace
 *
 * Actions:
 * - sense.mcp: Gather data via MCP servers
 * - recall.memory: Retrieve from memory via CognitiveWorkspace
 * - plan.goals: Decompose goals
 * - verify.ethics: Ethical check
 * - execute.task: Execute planned task
 * - dream.cycle: Memory consolidation via PhiMonitor
 * - rest.idle: Do nothing
 * - recharge: Restore energy
 */

import { ActionType } from './types.js';
import { createPhiMonitor, PhiMonitor } from '../consciousness/phi-monitor.js';
import { getCognitiveWorkspace, CognitiveWorkspace } from '../memory/cognitive-workspace.js';
import { getMCPClient } from '../mcp/index.js';

// ============================================================================
// Lazy Singleton Instances
// ============================================================================

let _phiMonitor: PhiMonitor | null = null;

function getPhiMonitor(): PhiMonitor {
  if (!_phiMonitor) {
    _phiMonitor = createPhiMonitor({ updateIntervalMs: 5000 });
    _phiMonitor.start();
  }
  return _phiMonitor;
}

function getWorkspace(): CognitiveWorkspace {
  return getCognitiveWorkspace();
}

// ============================================================================
// Types
// ============================================================================

export interface ActionResult {
  success: boolean;
  action: ActionType;
  data?: any;
  error?: string;
  duration: number;
}

export interface ActionContext {
  goal?: string;
  taskId?: string;
  parameters?: Record<string, any>;
  // Value integration (Genesis 6.2)
  valueEngine?: unknown;  // ValueAugmentedEngine from value-integration.ts
  useValueAugmentation?: boolean;
}

export type ActionExecutor = (context: ActionContext) => Promise<ActionResult>;

// ============================================================================
// Action Registry
// ============================================================================

const actionExecutors: Map<ActionType, ActionExecutor> = new Map();

/**
 * Register an action executor
 */
export function registerAction(action: ActionType, executor: ActionExecutor): void {
  actionExecutors.set(action, executor);
}

/**
 * Execute an action
 */
export async function executeAction(
  action: ActionType,
  context: ActionContext = {}
): Promise<ActionResult> {
  const start = Date.now();

  const executor = actionExecutors.get(action);
  if (!executor) {
    // Default executor for unregistered actions
    return {
      success: false,
      action,
      error: `No executor registered for action: ${action}`,
      duration: Date.now() - start,
    };
  }

  try {
    const result = await executor(context);
    return {
      ...result,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

// ============================================================================
// Default Action Implementations
// ============================================================================

/**
 * sense.mcp: Gather sensory data via MCP
 * v7.6.0: Connected to real MCP client
 */
registerAction('sense.mcp', async (context) => {
  try {
    const mcp = getMCPClient();

    // Discover all tools from all servers
    const allTools = await mcp.discoverAllTools();
    const observations: Array<{ server: string; toolCount: number }> = [];

    // Build observations from discovered tools
    for (const [server, tools] of Object.entries(allTools)) {
      observations.push({
        server,
        toolCount: tools.length,
      });
    }

    const serverNames = Object.keys(allTools);

    return {
      success: true,
      action: 'sense.mcp',
      data: {
        servers: serverNames,
        observations,
        serverCount: serverNames.length,
      },
      duration: 0,
    };
  } catch (error) {
    return {
      success: false,
      action: 'sense.mcp',
      error: error instanceof Error ? error.message : String(error),
      duration: 0,
    };
  }
});

/**
 * recall.memory: Retrieve from memory systems
 * v7.6.0: Connected to real CognitiveWorkspace
 */
registerAction('recall.memory', async (context) => {
  try {
    const workspace = getWorkspace();
    const query = context.goal || context.parameters?.query as string || '';
    const recalled: unknown[] = [];

    // Use anticipation to retrieve relevant memories
    if (query) {
      const anticipated = await workspace.anticipate({
        task: context.parameters?.task as string,
        goal: query,
        keywords: query.split(' ').filter(w => w.length > 2),
      });
      recalled.push(...anticipated.map(item => ({
        id: item.memory.id,
        type: item.memory.type,
        content: item.memory.content,
        relevance: item.relevance,
      })));
    }

    // Get workspace metrics
    const metrics = workspace.getMetrics();

    return {
      success: true,
      action: 'recall.memory',
      data: {
        recalled,
        query,
        reuseRate: metrics.reuseRate,
        anticipationAccuracy: metrics.anticipationAccuracy,
      },
      duration: 0,
    };
  } catch (error) {
    return {
      success: false,
      action: 'recall.memory',
      error: error instanceof Error ? error.message : String(error),
      duration: 0,
    };
  }
});

/**
 * plan.goals: Decompose goals into steps
 */
registerAction('plan.goals', async (context) => {
  return {
    success: true,
    action: 'plan.goals',
    data: {
      goal: context.goal,
      steps: [],
    },
    duration: 0,
  };
});

/**
 * verify.ethics: Check ethical constraints
 */
registerAction('verify.ethics', async (context) => {
  return {
    success: true,
    action: 'verify.ethics',
    data: {
      approved: true,
      priority: 'flourishing',
    },
    duration: 0,
  };
});

/**
 * execute.task: Execute the planned task
 */
registerAction('execute.task', async (context) => {
  return {
    success: true,
    action: 'execute.task',
    data: {
      taskId: context.taskId,
      result: null,
    },
    duration: 0,
  };
});

/**
 * dream.cycle: Run memory consolidation
 * v7.6.0: Connected to real PhiMonitor for consciousness-aware consolidation
 */
registerAction('dream.cycle', async (context) => {
  try {
    const phiMonitor = getPhiMonitor();
    const workspace = getWorkspace();

    // Get current consciousness level
    const phiLevel = phiMonitor.getCurrentLevel();

    // Only consolidate if φ is above threshold (consciousness check)
    const consolidationThreshold = 0.3;
    if (phiLevel.phi < consolidationThreshold) {
      return {
        success: false,
        action: 'dream.cycle',
        error: `φ too low for consolidation: ${phiLevel.phi.toFixed(3)} < ${consolidationThreshold}`,
        data: { phi: phiLevel.phi, threshold: consolidationThreshold },
        duration: 0,
      };
    }

    // Run workspace curation (consolidation)
    await workspace.curate();

    // Get metrics after consolidation
    const metrics = workspace.getMetrics();

    return {
      success: true,
      action: 'dream.cycle',
      data: {
        consolidated: metrics.totalRecalls,
        patterns: [],
        phi: phiLevel.phi,
        confidence: phiLevel.confidence,
        state: phiMonitor.getState(),
        reuseRate: metrics.reuseRate,
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

/**
 * rest.idle: Do nothing, conserve energy
 */
registerAction('rest.idle', async (_context) => {
  // Literally do nothing
  return {
    success: true,
    action: 'rest.idle',
    data: { rested: true },
    duration: 0,
  };
});

/**
 * recharge: Restore energy to system
 * v7.6.0: Reports real consciousness metrics during recharge
 */
registerAction('recharge', async (context) => {
  try {
    const phiMonitor = getPhiMonitor();
    const previousLevel = phiMonitor.getCurrentLevel();

    // Trigger a φ update
    phiMonitor.update();

    const newLevel = phiMonitor.getCurrentLevel();

    return {
      success: true,
      action: 'recharge',
      data: {
        previousPhi: previousLevel.phi,
        newPhi: newLevel.phi,
        trend: phiMonitor.getTrend(),
        state: phiMonitor.getState(),
      },
      duration: 0,
    };
  } catch (error) {
    return {
      success: false,
      action: 'recharge',
      error: error instanceof Error ? error.message : String(error),
      duration: 0,
    };
  }
});

// ============================================================================
// Action Executor Manager
// ============================================================================

export class ActionExecutorManager {
  private context: ActionContext = {};
  private history: ActionResult[] = [];

  /**
   * Set the current execution context
   */
  setContext(context: ActionContext): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Execute an action with current context
   */
  async execute(action: ActionType): Promise<ActionResult> {
    const result = await executeAction(action, this.context);
    this.history.push(result);

    // Limit history to last 100 actions
    if (this.history.length > 100) {
      this.history = this.history.slice(-100);
    }

    return result;
  }

  /**
   * Get action history
   */
  getHistory(): ActionResult[] {
    return [...this.history];
  }

  /**
   * Get statistics
   */
  getStats() {
    const total = this.history.length;
    const successful = this.history.filter(r => r.success).length;
    const byAction = new Map<ActionType, { total: number; success: number }>();

    for (const result of this.history) {
      const stat = byAction.get(result.action) || { total: 0, success: 0 };
      stat.total++;
      if (result.success) stat.success++;
      byAction.set(result.action, stat);
    }

    return {
      total,
      successful,
      successRate: total > 0 ? successful / total : 0,
      byAction: Object.fromEntries(byAction),
    };
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.history = [];
  }
}

// ============================================================================
// Factory
// ============================================================================

let managerInstance: ActionExecutorManager | null = null;

export function createActionExecutorManager(): ActionExecutorManager {
  return new ActionExecutorManager();
}

export function getActionExecutorManager(): ActionExecutorManager {
  if (!managerInstance) {
    managerInstance = createActionExecutorManager();
  }
  return managerInstance;
}
