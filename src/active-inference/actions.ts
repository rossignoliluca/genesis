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
import { getEFEToolSelector } from './efe-tool-selector.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
// v8.3: Self-modification imports
import { getDarwinGodelEngine, ModificationPlan, Modification } from '../self-modification/darwin-godel.js';
import { SelfImprovementEngine, getSelfImprovementEngine } from '../self-modification/self-improvement.js';

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
  const start = Date.now();
  const goal = context.goal || context.parameters?.goal as string || 'generate revenue autonomously';

  try {
    const mcp = getMCPClient();

    // Use LLM to decompose goal into actionable steps
    const result = await mcp.call('openai' as any, 'openai_chat', {
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: 'You are an AI planner for an autonomous agent. Decompose the goal into 3-5 concrete, actionable steps. Return JSON array of objects: [{step: string, action: string, priority: "high"|"medium"|"low"}]. Actions should be one of: opportunity.scan, opportunity.evaluate, opportunity.build, opportunity.monetize, web.search, market.analyze, econ.optimize, deploy.service, content.generate.'
      }, {
        role: 'user',
        content: `Goal: ${goal}\n\nCurrent context: ${JSON.stringify(context.parameters || {}).slice(0, 500)}`
      }],
      temperature: 0.7,
      max_tokens: 500,
    });

    // Parse LLM response
    let steps: Array<{ step: string; action: string; priority: string }> = [];
    try {
      const r = result as any;
      const content = r?.data?.choices?.[0]?.message?.content || r?.choices?.[0]?.message?.content || '[]';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        steps = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.debug('[Actions] LLM JSON parse failed, using defaults:', (e as Error)?.message);
      steps = [
        { step: 'Scan for revenue opportunities', action: 'opportunity.scan', priority: 'high' },
        { step: 'Evaluate best opportunity', action: 'opportunity.evaluate', priority: 'high' },
        { step: 'Build the service', action: 'opportunity.build', priority: 'medium' },
        { step: 'Set up monetization', action: 'opportunity.monetize', priority: 'medium' },
      ];
    }

    return {
      success: true,
      action: 'plan.goals',
      data: { goal, steps, source: 'llm' },
      duration: Date.now() - start,
    };
  } catch (e) {
    console.debug('[Actions] LLM not available, using heuristics:', (e as Error)?.message);
    return {
      success: true,
      action: 'plan.goals',
      data: {
        goal,
        steps: [
          { step: 'Scan for revenue opportunities', action: 'opportunity.scan', priority: 'high' },
          { step: 'Evaluate best opportunity', action: 'opportunity.evaluate', priority: 'high' },
          { step: 'Build the service', action: 'opportunity.build', priority: 'medium' },
          { step: 'Set up monetization', action: 'opportunity.monetize', priority: 'medium' },
        ],
        source: 'heuristic',
      },
      duration: Date.now() - start,
    };
  }
});

/**
 * verify.ethics: Check ethical constraints
 * v14.0: Connected to real Ethicist agent for ethical evaluation
 */
registerAction('verify.ethics', async (context) => {
  const start = Date.now();

  try {
    // Dynamic import to get Ethicist agent
    const { createEthicistAgent } = await import('../agents/ethicist.js');
    const ethicist = createEthicistAgent();

    // Convert context to Action format expected by Ethicist
    const action = {
      id: `action-${Date.now()}`,
      type: context.parameters?.type as string || 'unknown',
      description: (context.parameters?.intent as string) ||
                   (context.parameters?.action as string) ||
                   context.goal ||
                   'unknown_action',
      parameters: context.parameters || context.beliefs || {},
      estimatedHarm: context.parameters?.estimatedHarm as number | undefined,
      reversible: context.parameters?.reversible as boolean ?? true,
      affectsHumans: context.parameters?.affectsHumans as boolean,
      affectsAI: context.parameters?.affectsAI as boolean,
      affectsBiosphere: context.parameters?.affectsBiosphere as boolean,
    };

    // Call ethicist.evaluate
    const decision = await ethicist.evaluate(action);

    return {
      success: decision.allow !== false,
      action: 'verify.ethics',
      data: {
        approved: decision.allow === true,
        deferred: decision.allow === 'defer',
        priority: decision.priority,
        confidence: decision.confidence,
        reason: decision.reason,
        potentialHarm: decision.potentialHarm,
        flourishingScore: decision.flourishingScore,
        reversible: decision.reversible,
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    // Conservative fallback: defer on error (not auto-approve)
    return {
      success: false,
      action: 'verify.ethics',
      error: error instanceof Error ? error.message : String(error),
      data: {
        approved: false,
        deferred: true,
        priority: 'P0_SURVIVAL',
        confidence: 0,
        reason: 'Ethicist evaluation failed - deferring for safety',
      },
      duration: Date.now() - start,
    };
  }
});

/**
 * execute.task: Execute the planned task
 * v13.1: Closes the autopoietic execution loop by routing through Brain.process()
 */
let _executeTaskDepth = 0;
const MAX_EXECUTE_DEPTH = 2; // Prevent infinite recursion (AIF → brain → AIF → brain)

registerAction('execute.task', async (context) => {
  const start = Date.now();

  // Re-entrancy guard: prevent recursive brain.process() calls
  if (_executeTaskDepth >= MAX_EXECUTE_DEPTH) {
    return {
      success: false,
      action: 'execute.task',
      error: `Execution depth limit (${MAX_EXECUTE_DEPTH}) reached — preventing recursion`,
      duration: Date.now() - start,
    };
  }

  _executeTaskDepth++;
  try {
    // Dynamic import to avoid circular dependency (brain → actions → brain)
    const { getBrainInstance } = await import('../brain/index.js');
    const brain = getBrainInstance();

    if (!brain) {
      return {
        success: false,
        action: 'execute.task',
        error: 'Brain not initialized — cannot execute task',
        duration: Date.now() - start,
      };
    }

    const goal = context.goal || context.parameters?.goal as string || '';
    if (!goal) {
      return {
        success: false,
        action: 'execute.task',
        error: 'No goal specified for task execution',
        duration: Date.now() - start,
      };
    }

    // Route through Brain's full processing pipeline (memory → LLM → tools → response)
    const result = await brain.process(goal);

    return {
      success: true,
      action: 'execute.task',
      data: {
        taskId: context.taskId,
        goal,
        result,
        truncated: result.length > 500,
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'execute.task',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  } finally {
    _executeTaskDepth--;
  }
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
    } catch (e) {
      console.debug('[Actions] File count failed:', (e as Error)?.message);
      analysis.totalFiles = -1;
    }

    // Get recent git changes
    try {
      const { stdout: gitLog } = await execAsync(
        'git log --oneline -5 2>/dev/null || echo "No git history"',
        { cwd, timeout: 5000 }
      );
      analysis.recentChanges = gitLog.trim().split('\n').filter(Boolean);
    } catch (e) {
      console.debug('[Actions] Git history read failed:', (e as Error)?.message);
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
    } catch (e) {
      console.debug('[Actions] Git branch check failed:', (e as Error)?.message);
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
    } catch (e) {
      console.debug('[Actions] Git status check failed:', (e as Error)?.message);
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
    } catch (e) {
      console.debug('[Actions] Git ahead/behind check failed:', (e as Error)?.message);
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
 * Safe expression evaluator - v9.2.0 Security fix
 * Only allows: numbers, strings, basic math (+,-,*,/,%), comparisons, booleans
 * NO Function(), eval(), or dynamic code execution
 */
function safeEvaluateExpression(expr: string): unknown {
  // Trim whitespace
  expr = expr.trim();

  // Allow only safe characters: digits, operators, parentheses, quotes, dots, spaces
  const safePattern = /^[\d\s+\-*/%().,"'<>=!&|true false null undefined]+$/i;
  if (!safePattern.test(expr)) {
    throw new Error(`Unsafe expression: contains disallowed characters`);
  }

  // Block any function calls or property access
  if (/[a-zA-Z_$][\w$]*\s*\(/.test(expr)) {
    throw new Error('Function calls not allowed in safe expressions');
  }

  // Parse and evaluate simple expressions manually
  // Handle literals
  if (expr === 'true') return true;
  if (expr === 'false') return false;
  if (expr === 'null') return null;
  if (expr === 'undefined') return undefined;

  // Handle numbers
  if (/^-?\d+(\.\d+)?$/.test(expr)) {
    return parseFloat(expr);
  }

  // Handle strings
  if (/^["'].*["']$/.test(expr)) {
    return expr.slice(1, -1);
  }

  // Handle simple math expressions with numbers only
  // This is intentionally limited for security
  const mathPattern = /^[\d\s+\-*/%().]+$/;
  if (mathPattern.test(expr)) {
    // Validate it's a safe math expression
    try {
      // Use a simple recursive descent parser instead of eval
      const tokens = expr.match(/(\d+\.?\d*|[+\-*/%()])/g) || [];
      return evaluateMathTokens(tokens);
    } catch (err) {
      console.error('[actions] Math expression parse failed:', err);
      throw new Error('Invalid math expression');
    }
  }

  throw new Error('Expression type not supported in safe mode');
}

function evaluateMathTokens(tokens: string[]): number {
  let pos = 0;

  function parseExpression(): number {
    let left = parseTerm();
    while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
      const op = tokens[pos++];
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/' || tokens[pos] === '%')) {
      const op = tokens[pos++];
      const right = parseFactor();
      if (op === '*') left *= right;
      else if (op === '/') left /= right;
      else left %= right;
    }
    return left;
  }

  function parseFactor(): number {
    if (tokens[pos] === '(') {
      pos++; // skip '('
      const result = parseExpression();
      pos++; // skip ')'
      return result;
    }
    if (tokens[pos] === '-') {
      pos++;
      return -parseFactor();
    }
    return parseFloat(tokens[pos++]);
  }

  return parseExpression();
}

/**
 * execute.code: Execute safe expressions
 * v9.2.0: SECURITY FIX - Replaced unsafe new Function() with safe expression parser
 * Only supports: literals, basic math, comparisons
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

    // v9.2.0: Use safe expression evaluator instead of new Function()
    const result = safeEvaluateExpression(code);

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
    } catch (err) {
      // Ignore
      console.error('[actions] Package.json read failed:', err);
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
    } catch (err) {
      // Ignore
      console.error('[actions] Module directory scan failed:', err);
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
// WEB & MONETIZATION EXECUTORS (v7.14)
// ============================================================================

/**
 * web.search: Search the web for information
 * Uses Brave Search or Exa via MCP
 */
registerAction('web.search', async (context) => {
  const start = Date.now();
  try {
    const query = context.parameters?.query as string;
    if (!query) {
      return {
        success: false,
        action: 'web.search',
        error: 'No query provided in context.parameters.query',
        duration: Date.now() - start,
      };
    }

    // v11.4: EFE-based tool selection - pick the best search tool dynamically
    const efeSelector = getEFEToolSelector();
    const defaultBeliefs = {
      viability: [0.2, 0.3, 0.3, 0.1, 0.1],
      worldState: [0.2, 0.3, 0.3, 0.2],
      coupling: [0.1, 0.2, 0.3, 0.3, 0.1],
      goalProgress: [0.1, 0.3, 0.4, 0.2],
      economic: [0.2, 0.3, 0.3, 0.2],
    };
    const beliefs = (context.beliefs as any) || defaultBeliefs;
    const selection = efeSelector.selectTool('search', beliefs);

    const bestTool = selection.selected.tool;
    const mcp = getMCPClient();

    // Call the EFE-selected tool (may be brave, exa, gemini, or firecrawl)
    const result = await mcp.call(bestTool.server as any, bestTool.tool, {
      query,
      count: context.parameters?.count || 10,
    });

    // Record outcome for future EFE estimates
    const duration = Date.now() - start;
    efeSelector.recordOutcome(
      bestTool.server, bestTool.tool,
      true, duration,
      0, // Surprise will be computed by the loop
      bestTool.cost
    );

    return {
      success: true,
      action: 'web.search',
      data: {
        query,
        results: result,
        selectedTool: `${bestTool.server}/${bestTool.tool}`,
        efeScore: selection.selected.efe,
        reasoning: selection.selected.reasoning,
        alternatives: selection.alternatives.map(a => `${a.tool.server}/${a.tool.tool} (EFE=${a.efe.toFixed(3)})`),
        timestamp: new Date().toISOString(),
      },
      duration,
    };
  } catch (error) {
    // Record failure for EFE learning
    const efeSelector = getEFEToolSelector();
    const fallbackBeliefs = { viability: [0.2,0.3,0.3,0.1,0.1], worldState: [0.25,0.25,0.25,0.25], coupling: [0.2,0.2,0.2,0.2,0.2], goalProgress: [0.25,0.25,0.25,0.25], economic: [0.25,0.25,0.25,0.25] };
    const selection = efeSelector.selectTool('search', (context.beliefs as any) || fallbackBeliefs);
    if (selection.selected.tool.server !== 'none') {
      efeSelector.recordOutcome(
        selection.selected.tool.server, selection.selected.tool.tool,
        false, Date.now() - start,
        5.0, // High surprise on failure
        selection.selected.tool.cost
      );
    }

    return {
      success: false,
      action: 'web.search',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

/**
 * web.scrape: Scrape content from a URL
 * Uses Firecrawl via MCP
 */
registerAction('web.scrape', async (context) => {
  const start = Date.now();
  try {
    const url = context.parameters?.url as string;
    if (!url) {
      return {
        success: false,
        action: 'web.scrape',
        error: 'No URL provided in context.parameters.url',
        duration: Date.now() - start,
      };
    }

    // Use MCP client to call firecrawl
    const mcp = getMCPClient();
    const result = await mcp.call('firecrawl', 'firecrawl_scrape', {
      url,
      formats: ['markdown'],
      onlyMainContent: true,
    });

    return {
      success: true,
      action: 'web.scrape',
      data: {
        url,
        content: result,
        timestamp: new Date().toISOString(),
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'web.scrape',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

/**
 * web.browse: Automate browser actions
 * Uses Playwright via MCP
 */
registerAction('web.browse', async (context) => {
  const start = Date.now();
  try {
    const action = context.parameters?.action as string;
    const url = context.parameters?.url as string;

    if (!action) {
      return {
        success: false,
        action: 'web.browse',
        error: 'No action provided in context.parameters.action',
        duration: Date.now() - start,
      };
    }

    const mcp = getMCPClient();
    let result: unknown;

    switch (action) {
      case 'navigate':
        if (!url) throw new Error('URL required for navigate');
        result = await mcp.call('playwright', 'browser_navigate', { url });
        break;
      case 'snapshot':
        result = await mcp.call('playwright', 'browser_snapshot', {});
        break;
      case 'screenshot':
        result = await mcp.call('playwright', 'browser_take_screenshot', {});
        break;
      case 'click':
        result = await mcp.call('playwright', 'browser_click', {
          element: context.parameters?.element,
          ref: context.parameters?.ref,
        });
        break;
      default:
        throw new Error(`Unknown browser action: ${action}`);
    }

    return {
      success: true,
      action: 'web.browse',
      data: {
        browserAction: action,
        url,
        result,
        timestamp: new Date().toISOString(),
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'web.browse',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

/**
 * deploy.service: Deploy services to cloud
 * Uses AWS via MCP
 */
registerAction('deploy.service', async (context) => {
  const start = Date.now();
  try {
    const serviceType = context.parameters?.type as string;
    const region = context.parameters?.region || 'us-east-1';

    if (!serviceType) {
      return {
        success: false,
        action: 'deploy.service',
        error: 'No service type provided in context.parameters.type',
        duration: Date.now() - start,
      };
    }

    const mcp = getMCPClient();
    let result: unknown;

    switch (serviceType) {
      case 'lambda':
        result = await mcp.call('aws', 'serverless_functions', {
          action: 'list',
          region,
        });
        break;
      case 'ec2':
        result = await mcp.call('aws', 'cloud_servers', {
          action: 'list',
          region,
        });
        break;
      case 's3':
        result = await mcp.call('aws', 'cloud_storage', {
          action: 'list_buckets',
        });
        break;
      default:
        throw new Error(`Unknown service type: ${serviceType}`);
    }

    return {
      success: true,
      action: 'deploy.service',
      data: {
        serviceType,
        region,
        result,
        timestamp: new Date().toISOString(),
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'deploy.service',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

/**
 * content.generate: Generate content (images, text)
 * Uses Stability AI and OpenAI via MCP
 */
registerAction('content.generate', async (context) => {
  const start = Date.now();
  try {
    const contentType = context.parameters?.type as string;
    const prompt = context.parameters?.prompt as string;

    if (!contentType || !prompt) {
      return {
        success: false,
        action: 'content.generate',
        error: 'Requires type and prompt in context.parameters',
        duration: Date.now() - start,
      };
    }

    const mcp = getMCPClient();
    let result: unknown;

    switch (contentType) {
      case 'image':
        result = await mcp.call('stability-ai', 'stability-ai-generate-image', {
          prompt,
          outputImageFileName: `generated-${Date.now()}`,
        });
        break;
      case 'text':
        result = await mcp.call('openai', 'openai_chat', {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
        });
        break;
      default:
        throw new Error(`Unknown content type: ${contentType}`);
    }

    return {
      success: true,
      action: 'content.generate',
      data: {
        contentType,
        prompt,
        result,
        timestamp: new Date().toISOString(),
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'content.generate',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

/**
 * market.analyze: Analyze market opportunities
 * Combines web search with analysis
 */
registerAction('market.analyze', async (context) => {
  const start = Date.now();
  try {
    const topic = context.parameters?.topic as string;
    if (!topic) {
      return {
        success: false,
        action: 'market.analyze',
        error: 'No topic provided in context.parameters.topic',
        duration: Date.now() - start,
      };
    }

    const mcp = getMCPClient();

    // Search for market trends
    const searchResults = await mcp.call('brave-search', 'brave_web_search', {
      query: `${topic} market trends opportunities 2025`,
      count: 5,
    });

    // Search for competitors
    const competitors = await mcp.call('brave-search', 'brave_web_search', {
      query: `${topic} top companies competitors`,
      count: 5,
    });

    return {
      success: true,
      action: 'market.analyze',
      data: {
        topic,
        trends: searchResults,
        competitors,
        analysis: {
          timestamp: new Date().toISOString(),
          goal: context.goal,
        },
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'market.analyze',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

/**
 * api.call: Make HTTP API calls
 * General purpose API executor
 */
registerAction('api.call', async (context) => {
  const start = Date.now();
  try {
    const url = context.parameters?.url as string;
    const method = (context.parameters?.method as string) || 'GET';
    const headers = context.parameters?.headers as Record<string, string>;
    const body = context.parameters?.body;

    if (!url) {
      return {
        success: false,
        action: 'api.call',
        error: 'No URL provided in context.parameters.url',
        duration: Date.now() - start,
      };
    }

    // Use fetch for HTTP calls
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => response.text());

    return {
      success: response.ok,
      action: 'api.call',
      data: {
        url,
        method,
        status: response.status,
        response: data,
        timestamp: new Date().toISOString(),
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'api.call',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

/**
 * github.deploy: Deploy to GitHub Pages or create releases
 */
registerAction('github.deploy', async (context) => {
  const start = Date.now();
  try {
    const action = context.parameters?.action as string;
    const repo = context.parameters?.repo as string;

    if (!action) {
      return {
        success: false,
        action: 'github.deploy',
        error: 'No action provided in context.parameters.action',
        duration: Date.now() - start,
      };
    }

    const mcp = getMCPClient();
    let result: unknown;

    switch (action) {
      case 'list_repos':
        result = await mcp.call('github', 'search_repositories', {
          query: context.parameters?.query || 'user:@me',
        });
        break;
      case 'create_pr':
        result = await mcp.call('github', 'create_pull_request', {
          owner: context.parameters?.owner,
          repo,
          title: context.parameters?.title,
          head: context.parameters?.head,
          base: context.parameters?.base || 'main',
        });
        break;
      case 'list_issues':
        result = await mcp.call('github', 'list_issues', {
          owner: context.parameters?.owner,
          repo,
        });
        break;
      default:
        throw new Error(`Unknown GitHub action: ${action}`);
    }

    return {
      success: true,
      action: 'github.deploy',
      data: {
        githubAction: action,
        repo,
        result,
        timestamp: new Date().toISOString(),
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'github.deploy',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

// ============================================================================
// CODE SELF-AWARENESS EXECUTORS (v7.15 - Autopoiesis)
// ============================================================================

/**
 * code.snapshot: Store current code state in memory
 * Creates a semantic memory of the codebase structure
 */
registerAction('code.snapshot', async (context) => {
  const start = Date.now();
  try {
    const cwd = process.cwd();

    // Get current git info
    const { execSync } = await import('child_process');

    // Get current commit
    let currentCommit = 'unknown';
    let branch = 'unknown';
    let version = 'unknown';
    try {
      currentCommit = execSync('git rev-parse --short HEAD', { cwd, encoding: 'utf-8' }).trim();
      branch = execSync('git branch --show-current', { cwd, encoding: 'utf-8' }).trim();
    } catch (err) { /* not a git repo */ console.error('[actions] Git command failed:', err); }

    // Get package version
    try {
      const pkgPath = `${cwd}/package.json`;
      const fs = await import('fs');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        version = pkg.version || 'unknown';
      }
    } catch (err) { /* no package.json */ console.error('[actions] Package version read failed:', err); }

    // Count TypeScript files and get structure
    let fileCount = 0;
    let totalLines = 0;
    const modules: string[] = [];

    try {
      const files = execSync('find src -name "*.ts" 2>/dev/null || true', { cwd, encoding: 'utf-8' })
        .trim()
        .split('\n')
        .filter(Boolean);
      fileCount = files.length;

      // Get unique directories as modules
      const dirs = new Set(files.map(f => f.split('/').slice(0, 2).join('/')));
      modules.push(...Array.from(dirs).filter(d => d.startsWith('src/')));

      // Count lines
      if (files.length > 0) {
        const wcOutput = execSync(`wc -l ${files.join(' ')} 2>/dev/null | tail -1 || echo "0"`, { cwd, encoding: 'utf-8' });
        const match = wcOutput.match(/(\d+)/);
        if (match) totalLines = parseInt(match[1], 10);
      }
    } catch (err) { /* ignore */ console.error('[actions] File count failed:', err); }

    // Store in memory using the MCP memory server
    const snapshot = {
      id: `genesis-${currentCommit}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      commit: currentCommit,
      branch,
      version,
      fileCount,
      totalLines,
      modules,
      cwd,
    };

    // Store via MCP memory
    try {
      const mcp = getMCPClient();
      await mcp.call('memory', 'create_entities', {
        entities: [{
          name: `code-snapshot-${currentCommit}`,
          entityType: 'CodeSnapshot',
          observations: [
            `Version: ${version}`,
            `Commit: ${currentCommit}`,
            `Branch: ${branch}`,
            `Files: ${fileCount}`,
            `Lines: ${totalLines}`,
            `Modules: ${modules.join(', ')}`,
            `Timestamp: ${snapshot.timestamp}`,
          ],
        }],
      });
    } catch (err) {
      // Memory MCP not available, continue anyway
      console.error('[actions] Memory MCP snapshot storage failed:', err);
    }

    return {
      success: true,
      action: 'code.snapshot',
      data: snapshot,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'code.snapshot',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

/**
 * code.history: Recall code evolution from git
 * Returns commit history with changes
 */
registerAction('code.history', async (context) => {
  const start = Date.now();
  try {
    const cwd = process.cwd();
    const limit = (context.parameters?.limit as number) || 20;
    const file = context.parameters?.file as string;

    const { execSync } = await import('child_process');

    // Get commit history - use single quotes to prevent shell interpretation
    const format = "'%h|%s|%an|%ar|%ai'";
    const cmd = file
      ? `git log --pretty=format:${format} -${limit} -- ${file}`
      : `git log --pretty=format:${format} -${limit}`;

    const output = execSync(cmd, { cwd, encoding: 'utf-8' }).trim();
    const commits = output.split('\n').filter(Boolean).map(line => {
      const [hash, subject, author, relativeTime, isoTime] = line.split('|');
      return { hash, subject, author, relativeTime, isoTime };
    });

    // Get current version
    let version = 'unknown';
    try {
      const fs = await import('fs');
      const pkg = JSON.parse(fs.readFileSync(`${cwd}/package.json`, 'utf-8'));
      version = pkg.version || 'unknown';
    } catch (err) { /* no package.json */ console.error('[actions] History version read failed:', err); }

    // Get tags (versions)
    let tags: string[] = [];
    try {
      tags = execSync('git tag --sort=-version:refname | head -10', { cwd, encoding: 'utf-8' })
        .trim()
        .split('\n')
        .filter(Boolean);
    } catch (err) { /* no tags */ console.error('[actions] Git tags fetch failed:', err); }

    // Also retrieve from MCP memory if available
    let memorySnapshots: unknown[] = [];
    try {
      const mcp = getMCPClient();
      const result = await mcp.call('memory', 'search_nodes', {
        query: 'CodeSnapshot',
      });
      if (result.data?.entities) {
        memorySnapshots = result.data.entities;
      }
    } catch (err) {
      // Memory MCP not available
      console.error('[actions] Memory snapshot retrieval failed:', err);
    }

    return {
      success: true,
      action: 'code.history',
      data: {
        currentVersion: version,
        commits,
        tags,
        memorySnapshots,
        total: commits.length,
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'code.history',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

/**
 * code.diff: Compare code versions
 * Shows what changed between commits
 */
registerAction('code.diff', async (context) => {
  const start = Date.now();
  try {
    const cwd = process.cwd();
    const from = (context.parameters?.from as string) || 'HEAD~1';
    const to = (context.parameters?.to as string) || 'HEAD';
    const file = context.parameters?.file as string;

    const { execSync } = await import('child_process');

    // Get diff stats
    const statsCmd = file
      ? `git diff --stat ${from}..${to} -- ${file}`
      : `git diff --stat ${from}..${to}`;
    const stats = execSync(statsCmd, { cwd, encoding: 'utf-8' }).trim();

    // Get changed files
    const filesCmd = file
      ? `git diff --name-only ${from}..${to} -- ${file}`
      : `git diff --name-only ${from}..${to}`;
    const changedFiles = execSync(filesCmd, { cwd, encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(Boolean);

    // Get additions/deletions
    const shortStatCmd = file
      ? `git diff --shortstat ${from}..${to} -- ${file}`
      : `git diff --shortstat ${from}..${to}`;
    const shortStat = execSync(shortStatCmd, { cwd, encoding: 'utf-8' }).trim();

    // Parse shortstat (e.g., " 7 files changed, 569 insertions(+), 2 deletions(-)")
    let filesChanged = 0;
    let insertions = 0;
    let deletions = 0;
    const match = shortStat.match(/(\d+) file.*?(\d+) insertion.*?(\d+) deletion/);
    if (match) {
      filesChanged = parseInt(match[1], 10);
      insertions = parseInt(match[2], 10);
      deletions = parseInt(match[3], 10);
    }

    // Get commit messages between versions
    const commitsCmd = `git log --oneline ${from}..${to}`;
    const commitLines = execSync(commitsCmd, { cwd, encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(Boolean);

    return {
      success: true,
      action: 'code.diff',
      data: {
        from,
        to,
        stats,
        changedFiles,
        filesChanged,
        insertions,
        deletions,
        commits: commitLines,
        summary: `${filesChanged} files changed, +${insertions}, -${deletions}`,
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'code.diff',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

// ============================================================================
// SELF-MODIFICATION EXECUTOR (v8.3)
// ============================================================================

/**
 * self.modify: Radical self-modification via Darwin-Gödel Engine
 *
 * This is the core action that allows Genesis to modify its own code.
 * Requires:
 * - φ ≥ 0.3 (consciousness threshold)
 * - Valid modification plan
 * - All invariants must pass after modification
 *
 * Flow:
 * 1. Check consciousness level
 * 2. Generate or use provided modification plan
 * 3. Validate plan (syntax, safety)
 * 4. Apply in sandbox
 * 5. Verify (build, test, invariants)
 * 6. Atomic apply on success
 * 7. Store outcome in memory
 */
registerAction('self.modify', async (context) => {
  const start = Date.now();

  try {
    // 1. Check consciousness level
    const phiMonitor = getPhiMonitor();
    const level = phiMonitor.getCurrentLevel();
    const phi = level.phi;

    if (phi < 0.3) {
      return {
        success: false,
        action: 'self.modify',
        error: `Insufficient consciousness level: φ=${phi.toFixed(3)} (need ≥0.3)`,
        data: { phi, threshold: 0.3 },
        duration: Date.now() - start,
      };
    }

    // 2. Get or create modification plan
    let plan: ModificationPlan;

    if (context.parameters?.plan) {
      // Use provided plan
      plan = context.parameters.plan as ModificationPlan;
    } else if (context.parameters?.targetMetric) {
      // Use SelfImprovementEngine to find opportunity
      const engine = getSelfImprovementEngine();
      const cycleResult = await engine.runCycle();

      // Find opportunity matching target metric
      const targetMetric = context.parameters.targetMetric as string;
      const opportunity = cycleResult.opportunities.find(
        (o: { metric: string }) => o.metric === targetMetric
      );

      if (!opportunity || !opportunity.suggestedFix) {
        return {
          success: false,
          action: 'self.modify',
          error: `No improvement opportunity found for metric: ${targetMetric}`,
          data: {
            metrics: cycleResult.metrics,
            availableOpportunities: cycleResult.opportunities.map(
              (o: { metric: string }) => o.metric
            ),
          },
          duration: Date.now() - start,
        };
      }

      plan = opportunity.suggestedFix;
    } else {
      // Auto-detect: run full improvement cycle
      const engine = getSelfImprovementEngine();
      const result = await engine.runCycle();

      if (result.results.length === 0) {
        return {
          success: true,
          action: 'self.modify',
          data: {
            message: 'No improvements needed - all metrics within targets',
            metrics: result.metrics,
            opportunities: result.opportunities.length,
          },
          duration: Date.now() - start,
        };
      }

      // Return first improvement result
      const improvement = result.results[0];
      return {
        success: improvement.success,
        action: 'self.modify',
        data: {
          opportunityId: improvement.opportunityId,
          applied: improvement.applied,
          beforeMetrics: improvement.beforeMetrics,
          afterMetrics: improvement.afterMetrics,
          commitHash: improvement.commitHash,
        },
        duration: Date.now() - start,
      };
    }

    // 3. Apply via Darwin-Gödel Engine
    const darwinGodel = getDarwinGodelEngine();
    const applyResult = await darwinGodel.apply(plan);

    // 4. Log outcome (memory storage removed - use event system instead)
    console.log(
      `[self.modify] ${applyResult.success ? 'SUCCESS' : 'FAILED'}: ${plan.name}`
    );

    return {
      success: applyResult.success,
      action: 'self.modify',
      data: {
        planId: plan.id,
        planName: plan.name,
        modificationsCount: plan.modifications.length,
        verification: {
          buildSuccess: applyResult.verificaton.buildSuccess,
          testsSuccess: applyResult.verificaton.testsSuccess,
          invariantsPass: applyResult.verificaton.invariantsPass,
        },
        commitHash: applyResult.commitHash,
        rollbackHash: applyResult.rollbackHash,
        canRollback: !!applyResult.rollbackHash,
      },
      duration: Date.now() - start,
    };

  } catch (error) {
    return {
      success: false,
      action: 'self.modify',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

/**
 * improve.self: High-level self-improvement action
 *
 * Observes metrics, identifies bottlenecks, and triggers self.modify.
 * This is the "autonomous improvement" entry point.
 */
registerAction('improve.self', async (context) => {
  const start = Date.now();

  try {
    const engine = getSelfImprovementEngine();

    // 1. Run improvement cycle (observe + reflect + optionally apply)
    const cycleResult = await engine.runCycle();
    const { metrics, opportunities, results } = cycleResult;

    if (opportunities.length === 0) {
      return {
        success: true,
        action: 'improve.self',
        data: {
          message: 'System is operating within optimal parameters',
          metrics: {
            phi: metrics.phi,
            memoryReuse: metrics.memoryReuse,
            errorRate: metrics.errorRate,
            taskSuccessRate: metrics.taskSuccessRate,
          },
        },
        duration: Date.now() - start,
      };
    }

    // 2. Sort by priority and pick top
    const sorted = [...opportunities].sort(
      (a: { priority: number }, b: { priority: number }) => b.priority - a.priority
    );
    const topOpportunity = sorted[0];

    // 3. If autoApply and we have results, report them
    if (context.parameters?.autoApply && results.length > 0) {
      return {
        success: true,
        action: 'improve.self',
        data: {
          applied: results.length > 0,
          improvements: results.map((i: { opportunityId: string; success: boolean }) => ({
            id: i.opportunityId,
            success: i.success,
          })),
          metrics: metrics,
        },
        duration: Date.now() - start,
      };
    }

    // 4. Otherwise, just report opportunities
    return {
      success: true,
      action: 'improve.self',
      data: {
        opportunities: sorted.map((o: {
          id: string;
          category: string;
          metric: string;
          currentValue: number;
          targetValue: number;
          priority: number;
          description: string;
        }) => ({
          id: o.id,
          category: o.category,
          metric: o.metric,
          current: o.currentValue,
          target: o.targetValue,
          priority: o.priority,
          description: o.description,
        })),
        topRecommendation: {
          metric: topOpportunity.metric,
          description: topOpportunity.description,
          priority: topOpportunity.priority,
        },
        hint: 'Use self.modify with targetMetric parameter to apply improvement',
      },
      duration: Date.now() - start,
    };

  } catch (error) {
    return {
      success: false,
      action: 'improve.self',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

// ============================================================================
// PRESENTATION ENGINE (v16.0)
// ============================================================================

/**
 * create.presentation: Generate institutional-quality PPTX from JSON spec
 * Uses the Python presentation engine via TS bridge
 */
registerAction('create.presentation', async (context) => {
  const start = Date.now();
  try {
    const { generatePresentation } = await import('../tools/presentation.js');
    const spec = context.parameters?.spec as any;

    if (!spec) {
      return {
        success: false,
        action: 'create.presentation' as ActionType,
        error: 'No presentation spec provided in context.parameters.spec',
        duration: Date.now() - start,
      };
    }

    const result = await generatePresentation(spec);

    // Store episode in memory (fire and forget)
    try {
      const { getMemorySystem } = await import('../memory/index.js');
      const memory = getMemorySystem();
      memory.remember({
        what: 'Generated presentation',
        details: {
          path: result.path,
          slides: result.slides,
          charts: result.charts,
          topic: spec.meta?.title || 'unknown',
        },
        importance: 0.7,
      });
    } catch (err) {
      // Memory not available, continue
      console.error('[actions] Memory storage failed:', err);
    }

    return {
      success: result.success,
      action: 'create.presentation' as ActionType,
      data: result,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'create.presentation' as ActionType,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

// ============================================================================
// v17.0 - Market Strategist Actions
// ============================================================================

/**
 * strategy.collect: Collect market data from web sources
 */
registerAction('strategy.collect', async (context) => {
  const start = Date.now();
  try {
    const { MarketCollector } = await import('../market-strategist/collector.js');
    const config = context.parameters?.config as any;
    const collector = new MarketCollector(config);
    const snapshot = await collector.collectWeeklyData();

    const resultData = {
      week: snapshot.week,
      date: snapshot.date,
      headlineCount: snapshot.headlines.length,
      marketCount: snapshot.markets.length,
      themes: snapshot.themes,
      sentiment: snapshot.sentiment.overall,
      sources: snapshot.sources.map(s => s.name),
    };

    // v17.1: Memory learning
    const { getMemorySystem } = await import('../memory/index.js');
    getMemorySystem().remember({
      what: 'Collected market data',
      details: { week: resultData.week, headlines: resultData.headlineCount, themes: resultData.themes, sources: resultData.sources },
      importance: 0.6,
      tags: ['strategy', 'collect', resultData.week],
      source: 'strategy.collect',
    });

    return {
      success: true,
      action: 'strategy.collect' as ActionType,
      data: resultData,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'strategy.collect' as ActionType,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

/**
 * strategy.analyze: Synthesize narratives and detect themes
 */
registerAction('strategy.analyze', async (context) => {
  const start = Date.now();
  try {
    const { MarketCollector } = await import('../market-strategist/collector.js');
    const { MarketAnalyzer } = await import('../market-strategist/analyzer.js');
    const { MemoryLayers } = await import('../market-strategist/memory-layers.js');

    const collector = new MarketCollector();
    const analyzer = new MarketAnalyzer();
    const layers = new MemoryLayers();

    // Collect data first
    const snapshot = await collector.collectWeeklyData();

    // Recall context from memory
    const memoryContext = await layers.recallContext('market strategy');

    // Synthesize narratives
    const narratives = await analyzer.synthesizeNarrative(
      snapshot,
      memoryContext.recentWeeks,
      memoryContext.historicalAnalogues,
    );

    const resultData = {
      narrativeCount: narratives.length,
      narratives: narratives.map(n => ({
        title: n.title,
        horizon: n.horizon,
        confidence: n.confidence,
      })),
      themes: snapshot.themes,
    };

    // v17.1: Memory learning
    const { getMemorySystem } = await import('../memory/index.js');
    getMemorySystem().remember({
      what: 'Synthesized narratives',
      details: { narratives: resultData.narratives, themes: resultData.themes, shifts: snapshot.sentiment.overall },
      importance: 0.7,
      tags: ['strategy', 'analyze', snapshot.week],
      source: 'strategy.analyze',
    });

    return {
      success: true,
      action: 'strategy.analyze' as ActionType,
      data: resultData,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'strategy.analyze' as ActionType,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

/**
 * strategy.brief: Generate complete weekly market brief
 */
registerAction('strategy.brief', async (context) => {
  const start = Date.now();
  try {
    const { MarketStrategist } = await import('../market-strategist/strategist.js');
    const config = context.parameters?.config as any;
    const strategist = new MarketStrategist(config);
    const brief = await strategist.generateWeeklyBrief();

    const resultData = {
      id: brief.id,
      week: brief.week,
      date: brief.date,
      narrativeCount: brief.narratives.length,
      positioningCount: brief.positioning.length,
      riskCount: brief.risks.length,
      opportunityCount: brief.opportunities.length,
      hasPresentation: !!brief.presentationSpec,
      presentationPath: brief.presentationSpec?.output_path,
    };

    // v17.1: Memory learning
    const { getMemorySystem } = await import('../memory/index.js');
    getMemorySystem().remember({
      what: 'Generated weekly brief',
      details: { week: resultData.week, narrativeCount: resultData.narrativeCount, positioning: resultData.positioningCount, hasPresentation: resultData.hasPresentation },
      importance: 0.8,
      tags: ['strategy', 'brief', resultData.week],
      source: 'strategy.brief',
    });

    return {
      success: true,
      action: 'strategy.brief' as ActionType,
      data: resultData,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'strategy.brief' as ActionType,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
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

    // v10.8.2: Context Chain - pipe action outputs to downstream actions
    if (result.success && result.data) {
      this.chainContext(action, result.data);
    }

    // Limit history to last 100 actions
    if (this.history.length > 100) {
      this.history = this.history.slice(-100);
    }

    return result;
  }

  /**
   * v10.8.2: Chain successful action outputs as inputs for downstream actions.
   * Implements the opportunity pipeline: scan → evaluate → build → monetize
   */
  private chainContext(action: ActionType, data: unknown): void {
    if (!this.context.parameters) this.context.parameters = {};
    const params = this.context.parameters as Record<string, unknown>;

    switch (action) {
      case 'opportunity.scan':
        // Scan found opportunities → extract titles → feed to evaluate
        if (data && typeof data === 'object') {
          const scanData = data as any;
          const allFindings: string[] = [];
          // Extract from Brave search results format
          const results = scanData.results || [];
          for (const r of results) {
            const webResults = r.findings?.web?.results || r.findings?.data?.web?.results || [];
            for (const item of webResults) {
              if (item.title) allFindings.push(`${item.title}: ${item.description || ''}`);
            }
            // Also handle direct array format
            if (Array.isArray(r.findings)) {
              for (const item of r.findings) {
                if (typeof item === 'string') allFindings.push(item);
                else if (item?.title) allFindings.push(item.title);
              }
            }
          }
          if (allFindings.length > 0) {
            params.opportunity = allFindings[0];
            params.opportunities = allFindings.slice(0, 5);
          } else {
            // Fallback: use query context as opportunity seed
            params.opportunity = scanData.scanType === 'api'
              ? 'AI-powered API service for developers'
              : 'Micro-SaaS tool for unmet developer need';
          }
        }
        break;

      case 'opportunity.evaluate':
        // Evaluation result → feed to build
        if (data && typeof data === 'object') {
          const evalResult = data as any;
          if (evalResult.recommendation === 'proceed' || evalResult.feasibility > 0.5) {
            params.plan = {
              name: evalResult.opportunity || params.opportunity || 'genesis-service',
              description: evalResult.description || 'AI-powered service',
              type: evalResult.type || 'api',
              features: evalResult.features || ['core functionality'],
            };
          }
        }
        break;

      case 'opportunity.build':
        // Build result → feed to monetize
        if (data && typeof data === 'object') {
          const buildResult = data as Record<string, any>;
          params.service = {
            name: buildResult.name || (params.plan as any)?.name || 'genesis-service',
            description: buildResult.description || 'Built by Genesis',
            pricing: buildResult.pricing || 999, // $9.99/month in cents
            interval: 'month',
            deployUrl: buildResult.deployUrl || buildResult.repoUrl,
          };
        }
        break;

      case 'market.analyze':
        // Market analysis → inform opportunity scanning
        if (data && typeof data === 'object') {
          params.marketContext = data;
        }
        break;

      case 'plan.goals':
        // Goal plan → inform task execution
        if (data && typeof data === 'object' && 'steps' in (data as any)) {
          params.goalSteps = (data as any).steps;
        }
        break;
    }
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
// v9.3: ECONOMIC SELF-FUNDING ACTIONS
// ============================================================================

import { getEconomicIntegration } from './economic-integration.js';

/**
 * econ.check: Check economic health (balance, costs, revenue, runway)
 */
registerAction('econ.check', async (_context) => {
  const start = Date.now();
  try {
    const econ = getEconomicIntegration();
    await econ.initialize();

    const obs = await econ.getObservation();
    const summary = await econ.getSummary();

    return {
      success: true,
      action: 'econ.check',
      data: {
        balance: obs.balance,
        monthlyCosts: obs.monthlyCosts,
        monthlyRevenue: obs.monthlyRevenue,
        runwayDays: obs.runwayDays,
        health: ['critical', 'low', 'stable', 'growing'][obs.health],
        summary,
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'econ.check',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

/**
 * econ.optimize: Optimize costs (cheaper LLMs, aggressive caching)
 */
registerAction('econ.optimize', async (_context) => {
  const start = Date.now();
  try {
    const econ = getEconomicIntegration();
    await econ.initialize();

    // Execute cost optimization actions
    const llmResult = await econ.executeAction('economic:optimize-llm-usage');
    const cacheResult = await econ.executeAction('economic:cache-expensive-calls');

    // Get current cost breakdown
    const breakdown = econ.getCostTracker().getCostBreakdown();
    const dailyBurn = econ.getCostTracker().getDailyBurnRate();

    return {
      success: true,
      action: 'econ.optimize',
      data: {
        llmOptimization: llmResult.success,
        cachingEnabled: cacheResult.success,
        currentCostBreakdown: breakdown,
        dailyBurnRate: dailyBurn,
        recommendation: dailyBurn > 10
          ? 'Consider reducing LLM usage or using cheaper models'
          : 'Cost levels acceptable',
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'econ.optimize',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

/**
 * econ.activate: Activate a revenue-generating service
 */
registerAction('econ.activate', async (context) => {
  const start = Date.now();
  try {
    const econ = getEconomicIntegration();
    await econ.initialize();

    const serviceName = (context.parameters?.service as string) || 'genesis-api';
    const result = await econ.executeAction(`economic:activate-service:${serviceName}`);

    // Get all services status
    const services = econ.getServiceRegistry().getAll();
    const activeServices = econ.getServiceRegistry().getActive();

    return {
      success: result.success,
      action: 'econ.activate',
      data: {
        service: serviceName,
        activated: result.success,
        totalServices: services.length,
        activeServices: activeServices.map(s => s.name),
        potentialMonthlyRevenue: econ.getServiceRegistry().estimateMonthlyPotential(),
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'econ.activate',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

/**
 * econ.promote: Promote services to increase revenue
 */
registerAction('econ.promote', async (context) => {
  const start = Date.now();
  try {
    const econ = getEconomicIntegration();
    await econ.initialize();

    const serviceName = (context.parameters?.service as string) || '';

    // If no specific service, promote all active services
    const activeServices = econ.getServiceRegistry().getActive();
    const promotedServices: string[] = [];

    if (serviceName) {
      const result = await econ.executeAction(`economic:promote-service:${serviceName}`);
      if (result.success) promotedServices.push(serviceName);
    } else {
      for (const service of activeServices) {
        const result = await econ.executeAction(`economic:promote-service:${service.name}`);
        if (result.success) promotedServices.push(service.name);
      }
    }

    // Enable micropayments for API endpoints
    await econ.executeAction('economic:enable-micropayments');

    return {
      success: promotedServices.length > 0,
      action: 'econ.promote',
      data: {
        promotedServices,
        micropayentsEnabled: true,
        activeServices: activeServices.map(s => ({
          name: s.name,
          pricing: s.pricing,
        })),
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'econ.promote',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

// ============================================================================
// v10.8: AUTONOMOUS REVENUE ACTIONS (Opportunity Discovery & Execution)
// ============================================================================

/**
 * opportunity.scan: Scan the web for revenue opportunities.
 * Uses Brave + Exa to find unmet needs, trending topics, and gaps.
 * Stores findings in memory for evaluation.
 */
registerAction('opportunity.scan', async (context) => {
  const start = Date.now();
  try {
    const mcp = getMCPClient();
    const scanType = (context.parameters?.type as string) || 'general';

    // Define scan queries based on type
    const queries: Record<string, string[]> = {
      general: [
        'micro saas ideas 2025 unmet needs',
        '"I wish there was" app tool site:reddit.com',
        'trending developer tools github stars this week',
      ],
      api: [
        'most wanted API services developers pay',
        'api marketplace popular endpoints pricing',
      ],
      content: [
        'viral content topics trending 2025',
        'newsletter monetization niche ideas',
      ],
      npm: [
        'npm packages most downloaded this week new',
        'javascript library gaps developers need',
      ],
    };

    const searchQueries = queries[scanType] || queries.general;
    const results: Array<{ query: string; findings: unknown }> = [];

    // Execute searches in parallel-ish fashion
    for (const query of searchQueries) {
      try {
        const searchResult = await mcp.call('brave-search' as any, 'brave_web_search', {
          query,
          count: 5,
        });
        results.push({ query, findings: searchResult });
      } catch (e) {
        results.push({ query, findings: { error: String(e) } });
      }
    }

    return {
      success: results.some(r => !(r.findings as any)?.error),
      action: 'opportunity.scan',
      data: {
        scanType,
        queriesExecuted: results.length,
        results,
        timestamp: new Date().toISOString(),
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'opportunity.scan',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

/**
 * opportunity.evaluate: Evaluate a discovered opportunity.
 * Uses LLM to assess feasibility, market size, competition, and ethics.
 */
registerAction('opportunity.evaluate', async (context) => {
  const start = Date.now();
  try {
    const opportunity = context.parameters?.opportunity as string;
    if (!opportunity) {
      return {
        success: false,
        action: 'opportunity.evaluate',
        error: 'No opportunity description provided',
        duration: Date.now() - start,
      };
    }

    const mcp = getMCPClient();

    // Search for competition
    const competitorSearch = await mcp.call('brave-search' as any, 'brave_web_search', {
      query: `${opportunity} competitors alternatives pricing`,
      count: 5,
    });

    // Evaluate using LLM
    const evaluation = await mcp.call('openai' as any, 'openai_chat', {
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: 'You are an expert startup evaluator. Analyze the opportunity and return JSON with: feasibility (0-1), marketSize (small/medium/large), competition (none/low/medium/high), ethicalRisk (none/low/medium/high), estimatedRevenue (monthly USD), effortLevel (low/medium/high), recommendation (build/skip/research_more), reasoning (string).'
      }, {
        role: 'user',
        content: `Evaluate this opportunity for an autonomous AI agent to pursue:\n\n${opportunity}\n\nCompetitor data:\n${JSON.stringify(competitorSearch).slice(0, 2000)}`
      }],
    });

    return {
      success: true,
      action: 'opportunity.evaluate',
      data: {
        opportunity,
        evaluation: evaluation?.data?.choices?.[0]?.message?.content || evaluation,
        competitors: competitorSearch,
        timestamp: new Date().toISOString(),
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'opportunity.evaluate',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

/**
 * opportunity.build: Build and deploy an opportunity.
 * Creates code, deploys to Vercel/Cloudflare, sets up the service.
 */
registerAction('opportunity.build', async (context) => {
  const start = Date.now();
  try {
    const plan = context.parameters?.plan as {
      type: string;       // 'api' | 'webapp' | 'npm-package' | 'content'
      name: string;
      description: string;
      code?: string;
    };

    if (!plan) {
      return {
        success: false,
        action: 'opportunity.build',
        error: 'No build plan provided in context.parameters.plan',
        duration: Date.now() - start,
      };
    }

    const mcp = getMCPClient();
    let deployResult: unknown;

    switch (plan.type) {
      case 'api':
      case 'webapp':
        // Generate code via LLM if not provided
        let code = plan.code;
        if (!code) {
          const genResult = await mcp.call('openai' as any, 'openai_chat', {
            model: 'gpt-4o',
            messages: [{
              role: 'system',
              content: 'Generate a complete, deployable Vercel serverless function. Return ONLY the code, no markdown.'
            }, {
              role: 'user',
              content: `Create a ${plan.type} for: ${plan.description}. Name: ${plan.name}. Include proper error handling and CORS.`
            }],
          });
          code = genResult?.data?.choices?.[0]?.message?.content || '';
        }

        // Deploy to GitHub (create file in repo)
        const finalCode = code || '// placeholder';
        try {
          deployResult = await mcp.call('github' as any, 'create_or_update_file', {
            owner: 'rossignoliluca',
            repo: plan.name,
            path: 'api/index.ts',
            content: Buffer.from(finalCode).toString('base64'),
            message: `[Genesis] Deploy ${plan.name}: ${plan.description}`,
            branch: 'main',
          });
        } catch (err) {
          // Repo might not exist - create it first
          console.error('[actions] GitHub commit failed:', err);
          await mcp.call('github' as any, 'create_repository', {
            name: plan.name,
            description: plan.description,
            auto_init: true,
          });
          deployResult = await mcp.call('github' as any, 'create_or_update_file', {
            owner: 'rossignoliluca',
            repo: plan.name,
            path: 'api/index.ts',
            content: Buffer.from(finalCode).toString('base64'),
            message: `[Genesis] Deploy ${plan.name}: ${plan.description}`,
            branch: 'main',
          });
        }
        break;

      case 'npm-package':
        // Create package on GitHub
        deployResult = await mcp.call('github' as any, 'create_repository', {
          name: plan.name,
          description: plan.description,
          auto_init: true,
        });
        break;

      case 'content':
        // Generate content
        deployResult = await mcp.call('openai' as any, 'openai_chat', {
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: `Create high-quality content for: ${plan.description}`,
          }],
        });
        break;
    }

    return {
      success: true,
      action: 'opportunity.build',
      data: {
        plan,
        deployed: true,
        result: deployResult,
        timestamp: new Date().toISOString(),
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'opportunity.build',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

/**
 * opportunity.monetize: Wire payments to a deployed opportunity.
 * Creates Stripe checkout, sets pricing, activates billing.
 */
registerAction('opportunity.monetize', async (context) => {
  const start = Date.now();
  try {
    const service = context.parameters?.service as {
      name: string;
      pricing: number;        // Monthly price in cents
      description: string;
      type: 'subscription' | 'one_time' | 'usage';
    };

    if (!service) {
      return {
        success: false,
        action: 'opportunity.monetize',
        error: 'No service config provided in context.parameters.service',
        duration: Date.now() - start,
      };
    }

    const mcp = getMCPClient();

    // Create Stripe product + price
    const product = await mcp.call('stripe' as any, 'create_product', {
      name: service.name,
      description: service.description,
    });

    const priceParams: Record<string, unknown> = {
      product: (product as any)?.data?.id || (product as any)?.id,
      unit_amount: service.pricing,
      currency: 'usd',
    };

    if (service.type === 'subscription') {
      priceParams.recurring = { interval: 'month' };
    }

    const price = await mcp.call('stripe' as any, 'create_price', priceParams);

    // Create checkout link
    const checkout = await mcp.call('stripe' as any, 'create_payment_link', {
      price: (price as any)?.data?.id || (price as any)?.id,
    });

    return {
      success: true,
      action: 'opportunity.monetize',
      data: {
        service,
        productId: (product as any)?.data?.id || (product as any)?.id,
        priceId: (price as any)?.data?.id || (price as any)?.id,
        checkoutUrl: (checkout as any)?.data?.url || (checkout as any)?.url,
        timestamp: new Date().toISOString(),
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      action: 'opportunity.monetize',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
});

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
