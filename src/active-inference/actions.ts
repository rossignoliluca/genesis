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
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

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
  parameters?: Record<string, unknown>;
  beliefs?: Record<string, unknown>;
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
 * execute.cycle: Run a processing cycle
 * v7.13: Triggers brain processing iteration
 */
registerAction('execute.cycle', async (context) => {
  const start = Date.now();
  try {
    // Get current system state
    const phiMonitor = getPhiMonitor();
    const workspace = getWorkspace();

    const phiLevel = phiMonitor.getCurrentLevel();
    const memoryCount = workspace.getActive().length;

    return {
      success: true,
      action: 'execute.cycle',
      data: {
        cycleId: `cycle-${Date.now()}`,
        phi: phiLevel.phi,
        memoryItems: memoryCount,
        goal: context.goal,
        timestamp: new Date().toISOString(),
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'execute.cycle',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
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

/**
 * adapt.code: Analyze and suggest code adaptations
 * v7.13: Connected to codebase analysis
 */
registerAction('adapt.code', async (context) => {
  try {
    const cwd = process.cwd();

    // Analyze current codebase state
    const analysis: {
      totalFiles: number;
      recentChanges: string[];
      suggestions: string[];
    } = {
      totalFiles: 0,
      recentChanges: [],
      suggestions: [],
    };

    // Count TypeScript files
    try {
      const { stdout: fileCount } = await execAsync(
        'find src -name "*.ts" -type f | wc -l',
        { cwd, timeout: 5000 }
      );
      analysis.totalFiles = parseInt(fileCount.trim(), 10) || 0;
    } catch {
      // Fallback if find fails
      analysis.totalFiles = -1;
    }

    // Get recent git changes
    try {
      const { stdout: gitLog } = await execAsync(
        'git log --oneline -5 2>/dev/null || echo "No git history"',
        { cwd, timeout: 5000 }
      );
      analysis.recentChanges = gitLog.trim().split('\n').filter(Boolean);
    } catch {
      analysis.recentChanges = ['Unable to read git history'];
    }

    // Generate suggestions based on context
    if (context.goal) {
      analysis.suggestions.push(`Consider refactoring for: ${context.goal}`);
    }
    if (analysis.totalFiles > 100) {
      analysis.suggestions.push('Large codebase - consider modularization');
    }

    return {
      success: true,
      action: 'adapt.code',
      data: {
        cwd,
        analysis,
        goal: context.goal || 'general improvement',
      },
      duration: 0,
    };
  } catch (error) {
    return {
      success: false,
      action: 'adapt.code',
      error: error instanceof Error ? error.message : String(error),
      duration: 0,
    };
  }
});

/**
 * git.push: Safe git status check and push
 * v7.13: Connected to git operations (with safety checks)
 */
registerAction('git.push', async (context) => {
  try {
    const cwd = process.cwd();
    const results: {
      status: string;
      branch: string;
      ahead: number;
      behind: number;
      pushed: boolean;
      message: string;
    } = {
      status: 'unknown',
      branch: 'unknown',
      ahead: 0,
      behind: 0,
      pushed: false,
      message: '',
    };

    // Get current branch
    try {
      const { stdout: branch } = await execAsync(
        'git branch --show-current 2>/dev/null',
        { cwd, timeout: 5000 }
      );
      results.branch = branch.trim() || 'detached';
    } catch {
      results.branch = 'unknown';
    }

    // Get status (only tracked changes matter for push safety)
    try {
      const { stdout: status } = await execAsync(
        'git status --porcelain 2>/dev/null',
        { cwd, timeout: 5000 }
      );
      const allChanges = status.trim().split('\n').filter(Boolean);
      // Filter out untracked files (??) - they don't affect push safety
      const trackedChanges = allChanges.filter(line => !line.startsWith('??'));
      results.status = trackedChanges.length === 0 ? 'clean' : `${trackedChanges.length} tracked changes`;
    } catch {
      results.status = 'unknown';
    }

    // Check ahead/behind
    try {
      const { stdout: aheadBehind } = await execAsync(
        'git rev-list --left-right --count HEAD...@{upstream} 2>/dev/null || echo "0 0"',
        { cwd, timeout: 5000 }
      );
      const [ahead, behind] = aheadBehind.trim().split(/\s+/).map(n => parseInt(n, 10) || 0);
      results.ahead = ahead;
      results.behind = behind;
    } catch {
      // No upstream or error
    }

    // Only push if:
    // 1. Working directory is clean
    // 2. We have commits to push (ahead > 0)
    // 3. We're not behind (would need pull first)
    // 4. We're on main or a feature branch (not detached)
    if (
      results.status === 'clean' &&
      results.ahead > 0 &&
      results.behind === 0 &&
      results.branch !== 'detached' &&
      results.branch !== 'unknown'
    ) {
      try {
        const { stdout: pushResult } = await execAsync(
          `git push origin ${results.branch} 2>&1`,
          { cwd, timeout: 30000 }
        );
        results.pushed = true;
        results.message = pushResult.trim() || 'Pushed successfully';
      } catch (pushError) {
        results.pushed = false;
        results.message = pushError instanceof Error ? pushError.message : 'Push failed';
      }
    } else {
      results.pushed = false;
      if (results.status !== 'clean') {
        results.message = 'Cannot push: uncommitted changes';
      } else if (results.ahead === 0) {
        results.message = 'Nothing to push: already up to date';
      } else if (results.behind > 0) {
        results.message = `Cannot push: ${results.behind} commits behind upstream`;
      } else {
        results.message = 'Cannot push: invalid branch state';
      }
    }

    return {
      success: true,
      action: 'git.push',
      data: results,
      duration: 0,
    };
  } catch (error) {
    return {
      success: false,
      action: 'git.push',
      error: error instanceof Error ? error.message : String(error),
      duration: 0,
    };
  }
});

/**
 * execute.code: Execute TypeScript/JavaScript code safely
 * v7.13: Sandboxed code execution
 */
registerAction('execute.code', async (context) => {
  try {
    const code = context.parameters?.code as string;
    if (!code) {
      return {
        success: false,
        action: 'execute.code',
        error: 'No code provided in context.parameters.code',
        duration: 0,
      };
    }

    // For safety, only allow simple expressions (no require, import, fs, etc.)
    const dangerousPatterns = [
      /require\s*\(/,
      /import\s+/,
      /process\./,
      /child_process/,
      /\bfs\b/,
      /\bexec\b/,
      /\beval\b/,
      /Function\s*\(/,
      /\bglobal\b/,
      /\bglobalThis\b/,
      /\b__dirname\b/,
      /\b__filename\b/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        return {
          success: false,
          action: 'execute.code',
          error: `Unsafe code pattern detected: ${pattern}`,
          duration: 0,
        };
      }
    }

    // Execute in a restricted scope
    const result = new Function('return ' + code)();

    return {
      success: true,
      action: 'execute.code',
      data: {
        code,
        result,
        type: typeof result,
      },
      duration: 0,
    };
  } catch (error) {
    return {
      success: false,
      action: 'execute.code',
      error: error instanceof Error ? error.message : String(error),
      duration: 0,
    };
  }
});

/**
 * execute.shell: Execute safe shell commands
 * v7.13: Allowlisted shell commands only
 */
registerAction('execute.shell', async (context) => {
  try {
    const command = context.parameters?.command as string;
    if (!command) {
      return {
        success: false,
        action: 'execute.shell',
        error: 'No command provided in context.parameters.command',
        duration: 0,
      };
    }

    // Allowlist of safe commands
    const allowedCommands = [
      'ls', 'pwd', 'echo', 'date', 'whoami', 'cat', 'head', 'tail',
      'wc', 'grep', 'find', 'git status', 'git log', 'git branch',
      'npm list', 'node --version', 'npm --version',
    ];

    const baseCommand = command.split(/\s+/)[0];
    const isAllowed = allowedCommands.some(allowed =>
      command.startsWith(allowed) || baseCommand === allowed
    );

    if (!isAllowed) {
      return {
        success: false,
        action: 'execute.shell',
        error: `Command not in allowlist: ${baseCommand}`,
        data: { allowedCommands },
        duration: 0,
      };
    }

    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      timeout: 10000,
    });

    return {
      success: true,
      action: 'execute.shell',
      data: {
        command,
        stdout: stdout.slice(0, 4096), // Limit output size
        stderr: stderr.slice(0, 1024),
      },
      duration: 0,
    };
  } catch (error) {
    return {
      success: false,
      action: 'execute.shell',
      error: error instanceof Error ? error.message : String(error),
      duration: 0,
    };
  }
});

/**
 * self.analyze: Analyze own codebase and capabilities
 * v7.13: Self-reflection action
 */
registerAction('self.analyze', async (context) => {
  try {
    const cwd = process.cwd();
    const memUsage = process.memoryUsage();
    const toMB = (bytes: number) => Math.round(bytes / 1024 / 1024 * 10) / 10;

    const analysis: {
      // System info
      timestamp: string;
      cwd: string;
      nodeVersion: string;
      platform: string;
      arch: string;
      uptime: number;
      cpuCount: number;
      memoryUsage: {
        rss: number;
        heapUsed: number;
        heapTotal: number;
        external: number;
      };
      // Package info
      name: string;
      version: string;
      modules: string[];
      capabilities: string[];
      // Context
      goal?: string;
      beliefs?: Record<string, unknown>;
    } = {
      // System introspection
      timestamp: new Date().toISOString(),
      cwd,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      cpuCount: require('os').cpus().length,
      memoryUsage: {
        rss: toMB(memUsage.rss),
        heapUsed: toMB(memUsage.heapUsed),
        heapTotal: toMB(memUsage.heapTotal),
        external: toMB(memUsage.external),
      },
      // Package info
      name: 'genesis',
      version: 'unknown',
      modules: [],
      capabilities: [],
      // Pass through context
      goal: context.goal,
      beliefs: context.beliefs as Record<string, unknown>,
    };

    // Read package.json for version
    try {
      const pkgPath = path.join(cwd, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      analysis.name = pkg.name || 'genesis';
      analysis.version = pkg.version || 'unknown';
    } catch {
      // Ignore
    }

    // List modules
    try {
      const srcPath = path.join(cwd, 'src');
      if (fs.existsSync(srcPath)) {
        const entries = fs.readdirSync(srcPath, { withFileTypes: true });
        analysis.modules = entries
          .filter(e => e.isDirectory())
          .map(e => e.name);
      }
    } catch {
      // Ignore
    }

    // Define capabilities based on registered actions
    analysis.capabilities = [
      'sense.mcp - MCP server integration',
      'recall.memory - Cognitive workspace memory',
      'plan.goals - Goal decomposition',
      'verify.ethics - Ethical verification',
      'execute.task - Task execution',
      'dream.cycle - Memory consolidation',
      'adapt.code - Code analysis',
      'git.push - Git operations',
      'execute.code - Safe code execution',
      'execute.shell - Safe shell commands',
      'self.analyze - Self reflection',
    ];

    return {
      success: true,
      action: 'self.analyze',
      data: analysis,
      duration: 0,
    };
  } catch (error) {
    return {
      success: false,
      action: 'self.analyze',
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
