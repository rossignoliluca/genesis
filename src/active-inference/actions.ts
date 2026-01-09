/**
 * Genesis 6.1 - Action Executors
 *
 * Maps discrete actions from Active Inference to actual system operations.
 *
 * Actions:
 * - sense.mcp: Gather data via MCP servers
 * - recall.memory: Retrieve from memory
 * - plan.goals: Decompose goals
 * - verify.ethics: Ethical check
 * - execute.task: Execute planned task
 * - dream.cycle: Memory consolidation
 * - rest.idle: Do nothing
 * - recharge: Restore energy
 */

import { ActionType } from './types.js';

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
 */
registerAction('sense.mcp', async (context) => {
  // This will be connected to SensorAgent
  // For now, return simulated success
  return {
    success: true,
    action: 'sense.mcp',
    data: {
      servers: ['arxiv', 'memory', 'filesystem'],
      observations: [],
    },
    duration: 0,
  };
});

/**
 * recall.memory: Retrieve from memory systems
 */
registerAction('recall.memory', async (context) => {
  return {
    success: true,
    action: 'recall.memory',
    data: {
      recalled: [],
      query: context.goal,
    },
    duration: 0,
  };
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
 */
registerAction('dream.cycle', async (context) => {
  return {
    success: true,
    action: 'dream.cycle',
    data: {
      consolidated: 0,
      patterns: [],
    },
    duration: 0,
  };
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
 */
registerAction('recharge', async (context) => {
  return {
    success: true,
    action: 'recharge',
    data: {
      previousEnergy: 0.5,
      newEnergy: 1.0,
    },
    duration: 0,
  };
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
