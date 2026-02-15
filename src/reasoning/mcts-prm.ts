/**
 * Genesis v33 - MCTS + Process Reward Model Reasoning Pipeline (Item 21)
 *
 * Implements Monte Carlo Tree Search guided by a Process Reward Model
 * for step-level verification of reasoning chains. Variable compute
 * allocation based on task complexity.
 *
 * Architecture:
 *   Selection (UCB1) → Expansion (LLM thought generation) →
 *   Simulation (PRM step scoring) → Backpropagation (value updates)
 *
 * References:
 *   - arXiv:2305.10601 (Tree of Thoughts)
 *   - arXiv:2312.08935 (Math-Shepherd PRM)
 *   - arXiv:2509.26578 (Conditional Reward Modeling)
 */

import type {
  ThoughtNode,
  ToTConfig,
  ToTResult,
  PRMConfig,
  ComputeBudgetConfig,
  ThinkingConfig,
} from '../thinking/index.js';

// ============================================================================
// Types
// ============================================================================

export interface MCTSConfig {
  /** Maximum MCTS iterations (selection→backprop cycles) */
  maxIterations: number;
  /** UCB exploration constant (√2 = 1.414 is standard) */
  explorationConstant: number;
  /** Maximum tree depth */
  maxDepth: number;
  /** Thoughts to generate per expansion */
  branchingFactor: number;
  /** Minimum visits before a node can be selected as solution */
  minVisitsForSolution: number;
  /** Early termination: stop if a node exceeds this value */
  earlyTerminationThreshold: number;
  /** PRM configuration for step verification */
  prm: PRMConfig;
  /** Dynamic compute budget */
  computeBudget: ComputeBudgetConfig;
}

export const DEFAULT_MCTS_CONFIG: MCTSConfig = {
  maxIterations: 30,
  explorationConstant: 1.414,
  maxDepth: 6,
  branchingFactor: 3,
  minVisitsForSolution: 2,
  earlyTerminationThreshold: 0.92,
  prm: {
    enabled: true,
    verifyEveryStep: true,
    minStepScore: 0.3,
    aggregationMethod: 'min',
  },
  computeBudget: {
    enabled: true,
    minBudget: 512,
    maxBudget: 32768,
    difficultyEstimation: 'heuristic',
  },
};

export interface MCTSResult extends ToTResult {
  /** MCTS-specific statistics */
  mctsStats: {
    totalIterations: number;
    totalSimulations: number;
    averageDepth: number;
    bestPathPRMScore: number;
    earlyTerminated: boolean;
    computeBudgetUsed: number;
    difficultyEstimate: 'easy' | 'medium' | 'hard' | 'very_hard';
  };
}

interface TreeNode {
  id: string;
  thought: string;
  state: string;
  parentId: string | null;
  childIds: string[];
  depth: number;
  value: number;
  visits: number;
  prmScore: number;
  isTerminal: boolean;
  isValid: boolean;
}

type LLMCallFn = (prompt: string) => Promise<string>;

// ============================================================================
// MCTS + PRM Engine
// ============================================================================

export class MCTSPRMEngine {
  private config: MCTSConfig;
  private nodes: Map<string, TreeNode> = new Map();
  private rootId: string = '';
  private nodeCounter: number = 0;
  private llmCall: LLMCallFn;

  constructor(config: Partial<MCTSConfig> = {}, llmCall?: LLMCallFn) {
    this.config = { ...DEFAULT_MCTS_CONFIG, ...config };
    this.llmCall = llmCall || this.defaultLLMCall.bind(this);
  }

  /**
   * Run MCTS-guided reasoning on a problem.
   * Returns the best solution path found.
   */
  async solve(problem: string, context?: string): Promise<MCTSResult> {
    const startTime = Date.now();
    this.nodes.clear();
    this.nodeCounter = 0;

    // Step 0: Estimate difficulty → calibrate compute budget
    const difficulty = await this.estimateDifficulty(problem);
    const iterations = this.calibrateIterations(difficulty);

    // Create root node
    this.rootId = this.createNode({
      thought: 'Problem statement',
      state: problem,
      parentId: null,
      depth: 0,
    });

    let totalSimulations = 0;
    let earlyTerminated = false;

    // MCTS main loop
    for (let i = 0; i < iterations; i++) {
      // 1. SELECTION: traverse tree using UCB1
      const selectedId = this.select(this.rootId);
      const selected = this.nodes.get(selectedId)!;

      // 2. EXPANSION: generate child thoughts via LLM
      if (!selected.isTerminal && selected.depth < this.config.maxDepth) {
        const childIds = await this.expand(selectedId, problem);

        // 3. SIMULATION: score each new child with PRM
        for (const childId of childIds) {
          const prmScore = await this.simulate(childId, problem);
          totalSimulations++;

          // 4. BACKPROPAGATION: update values up the tree
          this.backpropagate(childId, prmScore);
        }
      }

      // Early termination check
      const bestNode = this.findBestLeaf();
      if (bestNode && bestNode.value > this.config.earlyTerminationThreshold
          && bestNode.visits >= this.config.minVisitsForSolution) {
        earlyTerminated = true;
        break;
      }
    }

    // Extract best solution path
    const bestLeaf = this.findBestLeaf();
    const solutionPath = bestLeaf ? this.extractPath(bestLeaf.id) : [];
    const solution = solutionPath.map(n => n.thought).join('\n\n');

    // Compute stats
    const allNodes = Array.from(this.nodes.values());
    const depths = allNodes.map(n => n.depth);
    const averageDepth = depths.length > 0 ? depths.reduce((a, b) => a + b, 0) / depths.length : 0;

    return {
      solution: solution || 'No solution found',
      solutionPath: solutionPath.map(n => this.toThoughtNode(n)),
      treeStats: {
        nodesExpanded: this.nodes.size,
        maxDepthReached: Math.max(...depths, 0),
        backtrackCount: 0,
        prunedCount: allNodes.filter(n => !n.isValid).length,
      },
      confidence: bestLeaf?.value || 0,
      searchDuration: Date.now() - startTime,
      mctsStats: {
        totalIterations: iterations,
        totalSimulations,
        averageDepth,
        bestPathPRMScore: bestLeaf?.prmScore || 0,
        earlyTerminated,
        computeBudgetUsed: this.nodes.size * 200, // Estimate tokens
        difficultyEstimate: difficulty,
      },
    };
  }

  // ==========================================================================
  // MCTS Phases
  // ==========================================================================

  /**
   * SELECTION: Traverse tree from root using UCB1 formula.
   * UCB1(node) = value/visits + c * sqrt(ln(parent.visits) / visits)
   */
  private select(nodeId: string): string {
    const node = this.nodes.get(nodeId)!;

    // If leaf or unexplored, select it
    if (node.childIds.length === 0 || node.visits === 0) {
      return nodeId;
    }

    // Find child with highest UCB1 score
    let bestScore = -Infinity;
    let bestChildId = node.childIds[0];

    for (const childId of node.childIds) {
      const child = this.nodes.get(childId)!;

      if (child.visits === 0) {
        // Unexplored nodes have infinite priority
        return childId;
      }

      const exploitation = child.value / child.visits;
      const exploration = this.config.explorationConstant *
        Math.sqrt(Math.log(node.visits) / child.visits);
      const ucb1 = exploitation + exploration;

      if (ucb1 > bestScore) {
        bestScore = ucb1;
        bestChildId = childId;
      }
    }

    // Recurse into best child
    return this.select(bestChildId);
  }

  /**
   * EXPANSION: Generate k child thoughts from current state via LLM.
   */
  private async expand(nodeId: string, problem: string): Promise<string[]> {
    const node = this.nodes.get(nodeId)!;
    const path = this.extractPath(nodeId);
    const previousSteps = path.map((n, i) => `Step ${i + 1}: ${n.thought}`).join('\n');

    const prompt = `You are solving a problem step by step using tree search.

Problem: ${problem}

Previous reasoning steps:
${previousSteps || '(Start of reasoning)'}

Generate ${this.config.branchingFactor} different NEXT reasoning steps. Each should be a distinct approach or continuation.
Number them clearly.

Format:
[1] First possible next step...
[2] Second possible next step...
[3] Third possible next step...`;

    const response = await this.llmCall(prompt);
    const thoughts = this.parseThoughts(response);

    const childIds: string[] = [];
    for (const thought of thoughts.slice(0, this.config.branchingFactor)) {
      const childId = this.createNode({
        thought,
        state: `${node.state}\n→ ${thought}`,
        parentId: nodeId,
        depth: node.depth + 1,
      });
      node.childIds.push(childId);
      childIds.push(childId);
    }

    return childIds;
  }

  /**
   * SIMULATION: Score a node's reasoning step using PRM.
   * Returns a value in [0, 1] representing step quality.
   */
  private async simulate(nodeId: string, problem: string): Promise<number> {
    const node = this.nodes.get(nodeId)!;

    if (!this.config.prm.enabled) {
      // Without PRM, use LLM self-evaluation
      return this.selfEvaluate(nodeId, problem);
    }

    const path = this.extractPath(nodeId);
    const previousSteps = path.slice(0, -1).map((n, i) =>
      `Step ${i + 1}: ${n.thought}`
    ).join('\n');

    const prompt = `Verify this reasoning step.

Problem: ${problem}
Previous Steps:
${previousSteps || '(None)'}

Current Step: ${node.thought}

Evaluate:
1. Is the logic correct?
2. Does it follow from previous steps?
3. Does it move toward solving the problem?
4. Are there any errors or invalid assumptions?

<verification>
score: [0-1, where 1 is perfectly valid]
errors: [list any errors found]
valid: [true/false]
</verification>`;

    const response = await this.llmCall(prompt);
    const parsed = this.parseVerification(response);

    node.prmScore = parsed.score;
    node.isValid = parsed.valid;

    // Check minimum step score threshold
    if (parsed.score < this.config.prm.minStepScore) {
      node.isValid = false;
    }

    // Aggregate PRM score along path
    const pathScores = path.map(n => n.prmScore).filter(s => s > 0);
    let aggregateScore: number;

    switch (this.config.prm.aggregationMethod) {
      case 'min':
        aggregateScore = pathScores.length > 0 ? Math.min(...pathScores) : parsed.score;
        break;
      case 'product':
        aggregateScore = pathScores.reduce((a, b) => a * b, 1);
        break;
      case 'mean':
        aggregateScore = pathScores.length > 0
          ? pathScores.reduce((a, b) => a + b, 0) / pathScores.length
          : parsed.score;
        break;
      default:
        aggregateScore = parsed.score;
    }

    return aggregateScore;
  }

  /**
   * BACKPROPAGATION: Update visit counts and values up to root.
   */
  private backpropagate(nodeId: string, value: number): void {
    let currentId: string | null = nodeId;

    while (currentId) {
      const node = this.nodes.get(currentId)!;
      node.visits += 1;
      node.value += value;
      currentId = node.parentId;
    }
  }

  // ==========================================================================
  // Difficulty Estimation & Compute Calibration
  // ==========================================================================

  /**
   * Estimate problem difficulty using heuristics.
   * Determines how much compute to spend.
   */
  private async estimateDifficulty(
    problem: string,
  ): Promise<'easy' | 'medium' | 'hard' | 'very_hard'> {
    if (!this.config.computeBudget.enabled) return 'medium';

    // Heuristic estimation based on problem characteristics
    const wordCount = problem.split(/\s+/).length;
    const hasMultipleQuestions = (problem.match(/\?/g) || []).length > 1;
    const hasCode = /```|function\s|class\s|import\s/.test(problem);
    const hasNumbers = /\d+\.\d+|\d{3,}/.test(problem);
    const hasTechnicalTerms = /algorithm|optimize|implement|architecture|design|refactor/i.test(problem);

    let complexityScore = 0;
    if (wordCount > 200) complexityScore += 2;
    else if (wordCount > 100) complexityScore += 1;
    if (hasMultipleQuestions) complexityScore += 1;
    if (hasCode) complexityScore += 2;
    if (hasNumbers) complexityScore += 1;
    if (hasTechnicalTerms) complexityScore += 1;

    if (complexityScore >= 5) return 'very_hard';
    if (complexityScore >= 3) return 'hard';
    if (complexityScore >= 1) return 'medium';
    return 'easy';
  }

  /**
   * Calibrate MCTS iterations based on difficulty.
   */
  private calibrateIterations(difficulty: 'easy' | 'medium' | 'hard' | 'very_hard'): number {
    const base = this.config.maxIterations;

    switch (difficulty) {
      case 'easy':    return Math.max(5, Math.floor(base * 0.3));
      case 'medium':  return Math.max(10, Math.floor(base * 0.6));
      case 'hard':    return base;
      case 'very_hard': return Math.floor(base * 1.5);
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private createNode(params: {
    thought: string;
    state: string;
    parentId: string | null;
    depth: number;
  }): string {
    const id = `mcts_${this.nodeCounter++}`;
    this.nodes.set(id, {
      id,
      thought: params.thought,
      state: params.state,
      parentId: params.parentId,
      childIds: [],
      depth: params.depth,
      value: 0,
      visits: 0,
      prmScore: 0,
      isTerminal: false,
      isValid: true,
    });
    return id;
  }

  private findBestLeaf(): TreeNode | null {
    let best: TreeNode | null = null;
    let bestScore = -Infinity;

    for (const node of this.nodes.values()) {
      if (node.visits < this.config.minVisitsForSolution) continue;
      if (!node.isValid) continue;

      const avgValue = node.value / node.visits;
      if (avgValue > bestScore && node.depth > 0) {
        bestScore = avgValue;
        best = node;
      }
    }

    return best;
  }

  private extractPath(nodeId: string): TreeNode[] {
    const path: TreeNode[] = [];
    let currentId: string | null = nodeId;

    while (currentId) {
      const node = this.nodes.get(currentId)!;
      path.unshift(node);
      currentId = node.parentId;
    }

    return path;
  }

  private toThoughtNode(node: TreeNode): ThoughtNode {
    return {
      id: node.id,
      thought: node.thought,
      state: node.state,
      parent: node.parentId,
      children: node.childIds,
      depth: node.depth,
      value: node.visits > 0 ? node.value / node.visits : 0,
      visits: node.visits,
      isTerminal: node.isTerminal,
      isValid: node.isValid,
      metadata: {
        generatedAt: Date.now(),
        evaluatedAt: Date.now(),
        prmScore: node.prmScore,
      },
    };
  }

  private parseThoughts(response: string): string[] {
    const lines = response.split('\n');
    const thoughts: string[] = [];
    let current = '';

    for (const line of lines) {
      const match = line.match(/^\[?\d+[\].)]\s*(.*)/);
      if (match) {
        if (current) thoughts.push(current.trim());
        current = match[1];
      } else if (current) {
        current += ' ' + line.trim();
      }
    }
    if (current) thoughts.push(current.trim());

    // Fallback: split by double newlines if no numbered format
    if (thoughts.length === 0) {
      return response.split(/\n\n+/).filter(s => s.trim().length > 20).slice(0, this.config.branchingFactor);
    }

    return thoughts;
  }

  private parseVerification(response: string): { score: number; valid: boolean } {
    const scoreMatch = response.match(/score:\s*([\d.]+)/);
    const validMatch = response.match(/valid:\s*(true|false)/i);

    return {
      score: scoreMatch ? Math.min(1, Math.max(0, parseFloat(scoreMatch[1]))) : 0.5,
      valid: validMatch ? validMatch[1].toLowerCase() === 'true' : true,
    };
  }

  private async selfEvaluate(nodeId: string, problem: string): Promise<number> {
    const node = this.nodes.get(nodeId)!;
    const prompt = `Rate this reasoning step for solving the problem.

Problem: ${problem}
Step: ${node.thought}

Rate 1-10 (1=wrong direction, 10=complete solution).

<eval>
score: [1-10]
</eval>`;

    const response = await this.llmCall(prompt);
    const match = response.match(/score:\s*(\d+)/);
    const raw = match ? parseInt(match[1]) : 5;
    return raw / 10;
  }

  /**
   * Default LLM call using OpenAI MCP. Override via constructor.
   */
  private async defaultLLMCall(prompt: string): Promise<string> {
    try {
      const { getMCPClient } = await import('../mcp/index.js');
      const mcp = getMCPClient();

      const result = await mcp.call('openai' as any, 'openai_chat', {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1024,
      });

      return result.data?.choices?.[0]?.message?.content || '';
    } catch {
      return '';
    }
  }
}

// ============================================================================
// Integration with Strategy Executor
// ============================================================================

/**
 * Execute MCTS+PRM reasoning strategy.
 * Called from strategy-executor.ts when strategy is 'mcts_prm'.
 */
export async function executeMCTSPRM(
  problem: string,
  config?: Partial<MCTSConfig>,
): Promise<MCTSResult> {
  const engine = new MCTSPRMEngine(config);
  return engine.solve(problem);
}

// ============================================================================
// Singleton
// ============================================================================

let mctsInstance: MCTSPRMEngine | null = null;

export function getMCTSPRMEngine(config?: Partial<MCTSConfig>): MCTSPRMEngine {
  if (!mctsInstance) {
    mctsInstance = new MCTSPRMEngine(config);
  }
  return mctsInstance;
}
