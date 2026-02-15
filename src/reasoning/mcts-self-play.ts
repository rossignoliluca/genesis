/**
 * Genesis v34 - MCTS Self-Play for Advanced Reasoning
 *
 * Implements Monte Carlo Tree Search with self-play for complex reasoning tasks.
 * Unlike mcts-prm.ts (which generates thoughts via LLM), this module uses
 * pure tree search with heuristic reward scoring for faster iteration.
 *
 * Architecture:
 *   Selection (UCB1) → Expansion (candidate generation) →
 *   Simulation (PRM scoring) → Backpropagation (value updates)
 *
 * Key differences from mcts-prm.ts:
 * - Expects a candidate generator function (not LLM calls)
 * - Uses heuristic PRM scoring (not LLM verification)
 * - Supports multi-path alternatives extraction
 * - Provides tree statistics for analysis
 *
 * References:
 * - Silver et al. (2016) "Mastering the game of Go with deep neural networks and tree search"
 * - Browne et al. (2012) "A Survey of Monte Carlo Tree Search Methods"
 * - arXiv:2305.10601 (Tree of Thoughts)
 */

import { randomUUID } from 'crypto';

// ============================================================================
// Types
// ============================================================================

/**
 * Node in the MCTS self-play tree
 */
export interface SelfPlayNode {
  /** Unique node ID */
  id: string;
  /** Current reasoning state / partial answer */
  state: string;
  /** Parent node ID (null for root) */
  parent?: string;
  /** Child node IDs */
  children: string[];
  /** Number of times this node was visited */
  visits: number;
  /** Total reward accumulated from this node */
  totalReward: number;
  /** Prior probability from heuristic or policy */
  priorProbability: number;
  /** Depth in tree (root = 0) */
  depth: number;
}

/**
 * Result from MCTS self-play search
 */
export interface SelfPlayResult {
  /** Best reasoning path found (sequence of states) */
  bestPath: string[];
  /** Confidence in best path (0-1) */
  confidence: number;
  /** Top-3 alternative paths */
  alternatives: string[][];
  /** Tree search statistics */
  treeStats: {
    nodes: number;
    maxDepth: number;
    avgReward: number;
  };
  /** Number of MCTS iterations performed */
  iterations: number;
}

/**
 * Configuration for MCTS self-play
 */
export interface MCTSSelfPlayConfig {
  /** Maximum MCTS iterations (selection→backprop cycles) */
  maxIterations: number;
  /** UCB exploration constant (√2 ≈ 1.414 is standard) */
  explorationConstant: number;
  /** Maximum tree depth */
  maxDepth: number;
  /** Number of candidates to generate per expansion */
  branchingFactor: number;
}

/**
 * Candidate generator function signature.
 * Given a state, generates possible next reasoning steps.
 */
export type CandidateGenerator = (state: string) => Promise<string[]>;

// ============================================================================
// Process Reward Model (PRM)
// ============================================================================

/**
 * Heuristic-based Process Reward Model for step verification.
 * Evaluates reasoning steps without LLM calls.
 */
export class ProcessRewardModel {
  /**
   * Score a single reasoning step (0-1).
   * Uses heuristics: logical connectors, evidence, specificity, contradictions.
   */
  score(state: string, step: string): number {
    let score = 0.5; // Base score

    // ─── Logical Connectors: indicates structured thinking ─────────
    const logicalConnectors = [
      'therefore', 'thus', 'hence', 'because', 'since', 'if', 'then',
      'given', 'implies', 'follows', 'consequently', 'as a result'
    ];
    const hasLogic = logicalConnectors.some(c => step.toLowerCase().includes(c));
    if (hasLogic) score += 0.15;

    // ─── Evidence Citations: references, quotes, data ───────────────
    const evidenceMarkers = [
      'according to', 'research shows', 'study found', 'data indicates',
      'evidence suggests', 'experiments show', 'proven', 'demonstrated'
    ];
    const hasEvidence = evidenceMarkers.some(e => step.toLowerCase().includes(e));
    if (hasEvidence) score += 0.15;

    // ─── Specificity: concrete details, numbers, examples ──────────
    const hasNumbers = /\d+/.test(step);
    const hasExamples = /for example|such as|instance|e\.g\./i.test(step);
    if (hasNumbers || hasExamples) score += 0.1;

    // ─── Length: not too short, not too verbose ────────────────────
    const wordCount = step.split(/\s+/).length;
    if (wordCount >= 10 && wordCount <= 100) score += 0.05;
    if (wordCount < 5) score -= 0.1; // Too terse
    if (wordCount > 150) score -= 0.05; // Too verbose

    // ─── Contradiction Detection: check against previous state ─────
    const contradictionMarkers = [
      'however', 'but', 'contradicts', 'inconsistent', 'contrary',
      'on the other hand', 'in contrast'
    ];
    const hasContradiction = contradictionMarkers.some(c => step.toLowerCase().includes(c));

    // Contradiction is okay if justified, bad if unresolved
    if (hasContradiction) {
      const hasJustification = /because|since|given|due to/i.test(step);
      if (!hasJustification) score -= 0.15;
    }

    // ─── Coherence with State: step should relate to current state ─
    if (state && step) {
      const stateWords = new Set(state.toLowerCase().match(/\b\w{4,}\b/g) || []);
      const stepWords = new Set(step.toLowerCase().match(/\b\w{4,}\b/g) || []);
      const overlap = [...stateWords].filter(w => stepWords.has(w)).length;
      const coherence = Math.min(1, overlap / Math.max(1, stateWords.size * 0.3));
      score += coherence * 0.1;
    }

    // ─── Question Marks: too many indicates uncertainty ─────────────
    const questionMarks = (step.match(/\?/g) || []).length;
    if (questionMarks > 2) score -= 0.1;

    // ─── Clamp to [0, 1] ────────────────────────────────────────────
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Score a sequence of reasoning steps with temporal decay.
   * Earlier steps matter more (foundation).
   */
  scoreSequence(steps: string[]): number {
    if (steps.length === 0) return 0;

    let totalScore = 0;
    let totalWeight = 0;

    for (let i = 0; i < steps.length; i++) {
      const state = steps.slice(0, i).join('\n');
      const step = steps[i];
      const stepScore = this.score(state, step);

      // Decay factor: earlier steps weighted more heavily
      const decay = Math.exp(-i * 0.1);
      totalScore += stepScore * decay;
      totalWeight += decay;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }
}

// ============================================================================
// MCTS Self-Play Engine
// ============================================================================

/**
 * Monte Carlo Tree Search with self-play for reasoning.
 * Builds a search tree guided by UCB1 policy and PRM scoring.
 */
export class MCTSSelfPlay {
  private config: MCTSSelfPlayConfig;
  private tree: Map<string, SelfPlayNode> = new Map();
  private rewardModel: ProcessRewardModel;
  private rootId: string = '';

  constructor(
    config: Partial<MCTSSelfPlayConfig> = {},
    rewardModel?: ProcessRewardModel
  ) {
    this.config = {
      maxIterations: config.maxIterations ?? 100,
      explorationConstant: config.explorationConstant ?? 1.414,
      maxDepth: config.maxDepth ?? 8,
      branchingFactor: config.branchingFactor ?? 4,
    };
    this.rewardModel = rewardModel ?? new ProcessRewardModel();
  }

  /**
   * Run MCTS search to find best reasoning path.
   *
   * @param problem - Initial problem statement
   * @param generateCandidates - Function to generate next reasoning steps
   * @returns Search result with best path and alternatives
   */
  async search(
    problem: string,
    generateCandidates: CandidateGenerator
  ): Promise<SelfPlayResult> {
    // Initialize tree with root node
    this.tree.clear();
    this.rootId = this.createNode({
      state: problem,
      parent: undefined,
      depth: 0,
      priorProbability: 1.0,
    });

    let iterations = 0;

    // MCTS main loop
    for (let i = 0; i < this.config.maxIterations; i++) {
      iterations++;

      // ─── Phase 1: SELECTION ─────────────────────────────────────
      const selectedId = this.select(this.rootId);
      const selected = this.tree.get(selectedId);
      if (!selected) break;

      // Stop if we've reached maximum depth
      if (selected.depth >= this.config.maxDepth) continue;

      // ─── Phase 2: EXPANSION ─────────────────────────────────────
      const expandedIds = await this.expand(selectedId, generateCandidates);
      if (expandedIds.length === 0) continue;

      // ─── Phase 3: SIMULATION ────────────────────────────────────
      // Score each new child node
      for (const childId of expandedIds) {
        const child = this.tree.get(childId);
        if (!child) continue;

        const path = this.extractPath(childId);
        const steps = path.map(n => n.state);
        const reward = this.rewardModel.scoreSequence(steps);

        // ─── Phase 4: BACKPROPAGATION ───────────────────────────
        this.backpropagate(childId, reward);
      }
    }

    // Extract results
    const bestPath = this.extractBestPath();
    const alternatives = this.extractAlternativePaths(3);
    const treeStats = this.getTreeStats();

    // Confidence is the average reward of the best path
    const bestNode = this.tree.get(bestPath[bestPath.length - 1] || this.rootId);
    const confidence = bestNode && bestNode.visits > 0
      ? bestNode.totalReward / bestNode.visits
      : 0;

    return {
      bestPath: bestPath.map(id => this.tree.get(id)?.state || ''),
      confidence,
      alternatives: alternatives.map(path =>
        path.map(id => this.tree.get(id)?.state || '')
      ),
      treeStats,
      iterations,
    };
  }

  // ==========================================================================
  // MCTS Phases
  // ==========================================================================

  /**
   * SELECTION: Traverse tree using UCB1 formula.
   * UCB1(node) = Q/N + c * sqrt(ln(parent.N) / N)
   *
   * @param nodeId - Starting node ID (usually root)
   * @returns Selected leaf node ID
   */
  select(nodeId: string): string {
    let currentId = nodeId;

    // Iterative traversal (avoid stack overflow)
    for (let depth = 0; depth < this.config.maxDepth * 2; depth++) {
      const node = this.tree.get(currentId);
      if (!node) return currentId;

      // If leaf or unvisited, select it
      if (node.children.length === 0 || node.visits === 0) {
        return currentId;
      }

      // Find child with highest UCB1 score
      let bestScore = -Infinity;
      let bestChildId = node.children[0];

      for (const childId of node.children) {
        const child = this.tree.get(childId);
        if (!child) continue;

        // Unvisited nodes have infinite priority (exploration)
        if (child.visits === 0) {
          return childId;
        }

        // UCB1 = exploitation + exploration
        const exploitation = child.totalReward / child.visits;
        const exploration = this.config.explorationConstant *
          Math.sqrt(Math.log(Math.max(1, node.visits)) / child.visits);
        const ucb1 = exploitation + exploration;

        if (ucb1 > bestScore) {
          bestScore = ucb1;
          bestChildId = childId;
        }
      }

      currentId = bestChildId;
    }

    return currentId;
  }

  /**
   * EXPANSION: Generate child nodes from current state.
   *
   * @param nodeId - Node to expand
   * @param generateCandidates - Candidate generation function
   * @returns IDs of newly created child nodes
   */
  private async expand(
    nodeId: string,
    generateCandidates: CandidateGenerator
  ): Promise<string[]> {
    const node = this.tree.get(nodeId);
    if (!node) return [];

    // Don't expand if already has children
    if (node.children.length > 0) return [];

    // Generate candidate next steps
    const candidates = await generateCandidates(node.state);
    const childIds: string[] = [];

    // Create child nodes (up to branching factor)
    for (const candidate of candidates.slice(0, this.config.branchingFactor)) {
      const childId = this.createNode({
        state: candidate,
        parent: nodeId,
        depth: node.depth + 1,
        priorProbability: 1.0 / candidates.length, // Uniform prior
      });
      node.children.push(childId);
      childIds.push(childId);
    }

    return childIds;
  }

  /**
   * BACKPROPAGATION: Update visit counts and rewards up to root.
   *
   * @param nodeId - Leaf node to backpropagate from
   * @param reward - Reward value (0-1)
   */
  backpropagate(nodeId: string, reward: number): void {
    let currentId: string | undefined = nodeId;

    while (currentId) {
      const node = this.tree.get(currentId);
      if (!node) break;

      node.visits += 1;
      node.totalReward += reward;

      currentId = node.parent;
    }
  }

  // ==========================================================================
  // Path Extraction
  // ==========================================================================

  /**
   * Extract the best path by following highest-visit children from root.
   *
   * @returns Array of node IDs from root to best leaf
   */
  extractBestPath(): string[] {
    const path: string[] = [this.rootId];
    let currentId = this.rootId;

    for (let depth = 0; depth < this.config.maxDepth; depth++) {
      const node = this.tree.get(currentId);
      if (!node || node.children.length === 0) break;

      // Find child with most visits
      let bestVisits = -1;
      let bestChildId = node.children[0];

      for (const childId of node.children) {
        const child = this.tree.get(childId);
        if (!child) continue;

        if (child.visits > bestVisits) {
          bestVisits = child.visits;
          bestChildId = childId;
        }
      }

      path.push(bestChildId);
      currentId = bestChildId;
    }

    return path;
  }

  /**
   * Extract top-k alternative paths (by average reward).
   *
   * @param k - Number of alternatives to extract
   * @returns Array of k best alternative paths
   */
  private extractAlternativePaths(k: number): string[][] {
    // Find all leaf nodes
    const leaves = Array.from(this.tree.values())
      .filter(n => n.children.length === 0 && n.visits > 0);

    // Sort by average reward
    leaves.sort((a, b) => {
      const avgA = a.totalReward / a.visits;
      const avgB = b.totalReward / b.visits;
      return avgB - avgA; // Descending
    });

    // Extract paths for top-k leaves
    const alternatives: string[][] = [];
    for (const leaf of leaves.slice(0, k)) {
      const path = this.extractPath(leaf.id);
      alternatives.push(path.map(n => n.id));
    }

    return alternatives;
  }

  /**
   * Extract path from root to given node.
   *
   * @param nodeId - Target node ID
   * @returns Path as array of nodes (root first)
   */
  private extractPath(nodeId: string): SelfPlayNode[] {
    const path: SelfPlayNode[] = [];
    let currentId: string | undefined = nodeId;

    while (currentId) {
      const node = this.tree.get(currentId);
      if (!node) break;
      path.unshift(node);
      currentId = node.parent;
    }

    return path;
  }

  // ==========================================================================
  // Tree Statistics
  // ==========================================================================

  /**
   * Get statistics about the search tree.
   *
   * @returns Tree statistics
   */
  getTreeStats(): { nodes: number; maxDepth: number; avgReward: number } {
    const nodes = Array.from(this.tree.values());

    const depths = nodes.map(n => n.depth);
    const maxDepth = Math.max(...depths, 0);

    const visitedNodes = nodes.filter(n => n.visits > 0);
    const avgReward = visitedNodes.length > 0
      ? visitedNodes.reduce((sum, n) => sum + (n.totalReward / n.visits), 0) / visitedNodes.length
      : 0;

    return {
      nodes: this.tree.size,
      maxDepth,
      avgReward,
    };
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Create a new node in the tree.
   *
   * @param params - Node parameters
   * @returns New node ID
   */
  private createNode(params: {
    state: string;
    parent?: string;
    depth: number;
    priorProbability: number;
  }): string {
    const id = randomUUID();
    const node: SelfPlayNode = {
      id,
      state: params.state,
      parent: params.parent,
      children: [],
      visits: 0,
      totalReward: 0,
      priorProbability: params.priorProbability,
      depth: params.depth,
    };
    this.tree.set(id, node);
    return id;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let mctsInstance: MCTSSelfPlay | null = null;

/**
 * Get singleton MCTS self-play instance.
 *
 * @param config - Optional configuration
 * @returns MCTS self-play instance
 */
export function getMCTSSelfPlay(config?: Partial<MCTSSelfPlayConfig>): MCTSSelfPlay {
  if (!mctsInstance) {
    mctsInstance = new MCTSSelfPlay(config);
  }
  return mctsInstance;
}

/**
 * Reset singleton instance (for testing).
 */
export function resetMCTSSelfPlay(): void {
  mctsInstance = null;
}
