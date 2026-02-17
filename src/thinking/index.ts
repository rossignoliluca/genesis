/**
 * Genesis v7.12 - Advanced Reasoning System
 *
 * Frontier-grade reasoning architecture implementing:
 * - Extended Thinking with Scratchpad (o1/Claude style)
 * - Self-Critique Loop (Generate → Critique → Revise)
 * - Best-of-N Sampling with Self-Consistency
 * - Metacognitive Uncertainty Tracking
 * - Deliberative Alignment (explicit value reasoning)
 *
 * v7.7 (Based on arXiv research):
 * - Tree-of-Thought (ToT) with BFS/DFS search (arXiv:2305.10601)
 * - Process Reward Model (PRM) for step verification
 * - MCTS-style search with value estimation
 * - CoT Entropy for uncertainty-aware verification (arXiv:2502.11250)
 * - Beam Search with state evaluation and pruning
 * - Dynamic compute budgeting based on problem difficulty
 *
 * v7.8 (arXiv:2308.09687 - Graph of Thoughts):
 * - Graph-of-Thoughts (GoT) with arbitrary graph structure
 * - Aggregation: Combine k thoughts into 1 (not possible in ToT!)
 * - Refinement loops: Self-improve thoughts iteratively
 * - 62% quality improvement over ToT, 31% cost reduction
 *
 * v7.9 (arXiv:2410.09008 - SuperCorrect):
 * - Hierarchical Thought Templates (high-level + detailed steps)
 * - Cross-model Self-Correction (teacher/student pattern)
 * - Two-stage: Template distillation → Error-driven correction
 * - 7.5% accuracy improvement on MATH benchmark
 *
 * v7.10 (Buffer of Thoughts + Reasoning-Aware Compression):
 * - Trace compression for efficient storage (arXiv:2406.04271)
 * - Meta-buffer storing reusable thought templates
 * - Step pruning with importance-based filtering (arXiv:2509.12464)
 * - Template matching and instantiation for fast reasoning
 * - 12% cost of multi-query methods (like ToT/GoT)
 *
 * v7.11 (Math-Shepherd Process Reward Model):
 * - Completion-based step verification (arXiv:2312.08935)
 * - Monte Carlo step scoring: complete N paths, check answer correctness
 * - Hard/Soft estimation for process annotation without human labels
 * - Best-of-N solution reranking with step-level scores
 * - 77.9% → 84.1% on GSM8K (Mistral-7B with Math-Shepherd)
 *
 * NEW in v7.12 (Conditional Reward Modeling - CRM):
 * - Conditional step rewards based on ALL preceding steps (arXiv:2509.26578)
 * - Explicit outcome linkage via probability chain rule
 * - h(t): P(wrong at t | correct up to t-1) - conditional error probability
 * - S(t): ∏(1-h(k)) for k=1..t - survival probability (reaching correct answer)
 * - r_t = log(1-h(t)) - PBRS-derived process reward
 * - Robust to reward hacking, enables precise credit assignment
 * - Superior cross-sample comparability for beam search/Best-of-N
 *
 * Based on:
 * - OpenAI o1/o3: Test-time compute scaling, hidden CoT
 * - DeepSeek R1: Transparent reasoning, GRPO
 * - Claude Extended Thinking: Interleaved reasoning
 * - Deliberative Alignment: Explicit specification reasoning
 * - Tree of Thoughts: Deliberate Problem Solving (Yao et al. 2023)
 * - Graph of Thoughts: Besta et al. ETH Zurich 2023
 * - SuperCorrect: Hierarchical Templates (Llama 2024)
 * - Buffer of Thoughts: Thought-Augmented Reasoning (2024)
 * - Uncertainty-aware Step-wise Verification (Oxford 2025)
 *
 * Architecture:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    ADVANCED REASONING v7.10                     │
 * │                                                                 │
 * │  Tree-of-Thought (ToT):                                        │
 * │  Input → [ToT Search] → [PRM Verify] → [Beam Select] → Output  │
 * │              ↓              ↓              ↓                    │
 * │         BFS/DFS        Step-by-step    Keep top-k              │
 * │                                                                 │
 * │  Graph-of-Thought (GoT):                                       │
 * │  Decompose → Generate → Refine → Aggregate → Output            │
 * │      ↓           ↓          ↓         ↓                        │
 * │  Sub-problems  Solve    Self-loop   k→1 (KEY!)                 │
 * │                                                                 │
 * │  SuperCorrect:                                                  │
 * │  Template → Solve → Detect Errors → Correct → Verify          │
 * │      ↓         ↓           ↓            ↓         ↓            │
 * │  Hierarchical Strategy  Teacher      Student   Loop            │
 * │                                                                 │
 * │  Buffer of Thoughts (Compression):                              │
 * │  Trace → [Summarize/Prune] → [Match Template] → Compressed     │
 * │    ↓           ↓                    ↓              ↓           │
 * │  Raw CoT   30% target         Meta-buffer     12% cost         │
 * │                                                                 │
 * │  MCTS: Selection → Expansion → Simulation → Backpropagation   │
 * │  CoT Entropy: Sample rationales → Cluster → Compute entropy    │
 * │  Dynamic Budget: Easy=fast, Hard=deep/GoT/SuperCorrect         │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 */

import { LLMBridge, getLLMBridge } from '../llm/index.js';
import { createPublisher } from '../bus/index.js';

const publisher = createPublisher('thinking');

// Emit thinking system initialization
publisher.publish('system.booted', {
  source: 'thinking',
  precision: 1.0,
  component: 'advanced-reasoning',
  version: '7.12'
} as any);

// ============================================================================
// v7.7: Tree-of-Thought Types (must be declared first)
// ============================================================================

/**
 * A node in the thought tree
 * Represents a state in the reasoning process
 */
export interface ThoughtNode {
  id: string;
  thought: string;           // The thought/reasoning step
  state: string;             // Current problem state after this thought
  parent: string | null;     // Parent node ID
  children: string[];        // Child node IDs
  depth: number;             // Depth in tree
  value: number;             // Estimated value (0-1)
  visits: number;            // MCTS visit count
  isTerminal: boolean;       // Whether this is a solution
  isValid: boolean;          // Whether the thought is valid
  metadata: {
    generatedAt: number;
    evaluatedAt?: number;
    prmScore?: number;       // Process Reward Model score
    entropy?: number;        // CoT entropy
  };
}

/**
 * Search strategy for Tree-of-Thought
 */
export type ToTSearchStrategy = 'bfs' | 'dfs' | 'mcts' | 'beam';

/**
 * State evaluation method
 */
export type StateEvalMethod = 'value' | 'vote' | 'prm' | 'entropy';

/**
 * Configuration for Tree-of-Thought search
 */
export interface ToTConfig {
  strategy: ToTSearchStrategy;
  maxDepth: number;          // Maximum tree depth
  branchingFactor: number;   // k: thoughts to generate per state
  beamWidth: number;         // b: states to keep at each level (for BFS/beam)
  explorationConstant: number; // c: UCB exploration constant for MCTS
  maxIterations: number;     // Maximum search iterations
  evalMethod: StateEvalMethod;
  pruneThreshold: number;    // Prune states below this value
  enableBacktracking: boolean;
}

export const DEFAULT_TOT_CONFIG: ToTConfig = {
  strategy: 'bfs',
  maxDepth: 5,
  branchingFactor: 3,
  beamWidth: 5,
  explorationConstant: 1.414,  // sqrt(2)
  maxIterations: 50,
  evalMethod: 'value',
  pruneThreshold: 0.2,
  enableBacktracking: true,
};

/**
 * Process Reward Model configuration
 */
export interface PRMConfig {
  enabled: boolean;
  verifyEveryStep: boolean;
  minStepScore: number;      // Minimum score to continue
  aggregationMethod: 'min' | 'mean' | 'product';
}

export const DEFAULT_PRM_CONFIG: PRMConfig = {
  enabled: true,
  verifyEveryStep: false,    // Expensive, off by default
  minStepScore: 0.3,
  aggregationMethod: 'min',  // Conservative: take worst step score
};

/**
 * CoT Entropy configuration for uncertainty
 */
export interface EntropyConfig {
  enabled: boolean;
  numSamples: number;        // Rationales to sample
  rejectThreshold: number;   // Reject if entropy above this
}

export const DEFAULT_ENTROPY_CONFIG: EntropyConfig = {
  enabled: true,
  numSamples: 5,
  rejectThreshold: 0.8,      // High entropy = uncertain
};

/**
 * Dynamic compute budget configuration
 */
export interface ComputeBudgetConfig {
  enabled: boolean;
  minBudget: number;         // Min tokens for easy problems
  maxBudget: number;         // Max tokens for hard problems
  difficultyEstimation: 'heuristic' | 'classifier' | 'adaptive';
}

export const DEFAULT_COMPUTE_BUDGET_CONFIG: ComputeBudgetConfig = {
  enabled: true,
  minBudget: 512,
  maxBudget: 32768,
  difficultyEstimation: 'heuristic',
};

/**
 * Result of Tree-of-Thought search
 */
export interface ToTResult {
  solution: string;
  solutionPath: ThoughtNode[];
  treeStats: {
    nodesExpanded: number;
    maxDepthReached: number;
    backtrackCount: number;
    prunedCount: number;
  };
  confidence: number;
  searchDuration: number;
}

// ============================================================================
// v7.8: Graph-of-Thoughts Types (arXiv:2308.09687)
// ============================================================================

/**
 * Graph node for GoT - extends ThoughtNode with multiple parents
 */
export interface GoTNode extends ThoughtNode {
  parents: string[];           // Multiple parent IDs (enables aggregation)
  refinementCount: number;     // Number of self-refinements
  aggregatedFrom: string[];    // IDs of nodes aggregated into this one
}

/**
 * Thought transformation types for GoT
 */
export type GoTTransformation =
  | 'generate'      // Generate new thoughts from one (1 → k)
  | 'aggregate'     // Combine multiple thoughts into one (k → 1)
  | 'refine'        // Self-loop refinement
  | 'score'         // Evaluate thought
  | 'keep_best';    // Select top thoughts

/**
 * Operation in the Graph of Operations (GoO)
 */
export interface GoTOperation {
  type: GoTTransformation;
  targetNodes?: string[];      // Nodes to operate on
  params?: {
    k?: number;                // Number of thoughts to generate
    aggregationPrompt?: string;
    refinementPrompt?: string;
  };
}

/**
 * Configuration for Graph-of-Thoughts
 */
export interface GoTConfig {
  maxNodes: number;            // Maximum nodes in graph
  maxRefinements: number;      // Max self-refinements per node
  aggregationStrategy: 'merge' | 'synthesize' | 'vote';
  enableRefinementLoops: boolean;
  decompositionDepth: number;  // How many times to decompose problem
}

export const DEFAULT_GOT_CONFIG: GoTConfig = {
  maxNodes: 100,
  maxRefinements: 3,
  aggregationStrategy: 'synthesize',
  enableRefinementLoops: true,
  decompositionDepth: 2,
};

/**
 * Result of Graph-of-Thoughts reasoning
 */
export interface GoTResult {
  solution: string;
  graph: {
    nodes: GoTNode[];
    edges: Array<{ from: string; to: string }>;
  };
  stats: {
    totalNodes: number;
    aggregations: number;
    refinements: number;
    generations: number;
  };
  confidence: number;
  volume: number;              // Number of thoughts contributing to solution
  duration: number;
}

// ============================================================================
// v7.9: SuperCorrect Types (arXiv:2410.09008)
// Hierarchical Thought Templates + Cross-Model Self-Correction
// ============================================================================

/**
 * Hierarchical Thought Template
 * Contains both high-level strategy and detailed steps
 */
export interface HierarchicalThoughtTemplate {
  highLevel: {
    strategy: string;          // Generalized solution approach
    keyInsights: string[];     // Critical insights for similar problems
    commonPatterns: string[];  // Patterns that apply to this problem type
  };
  detailed: {
    steps: Array<{
      step: number;
      description: string;
      reasoning: string;
      validation: string;      // How to validate this step
    }>;
    criticalPoints: string[];  // Where errors commonly occur
    checkpoints: string[];     // Points to verify correctness
  };
}

/**
 * Error identified during self-correction
 */
export interface IdentifiedError {
  stepIndex: number;
  errorType: 'logical' | 'computational' | 'assumption' | 'missing_step' | 'overcomplicated';
  description: string;
  severity: 'critical' | 'major' | 'minor';
  suggestedFix: string;
}

/**
 * Configuration for SuperCorrect
 */
export interface SuperCorrectConfig {
  enableHierarchicalTemplates: boolean;
  enableCrossModelCorrection: boolean;
  maxCorrectionRounds: number;
  errorDetectionThreshold: number;  // Confidence below this triggers correction
  useTeacherGuidance: boolean;      // Simulate teacher model guidance
}

export const DEFAULT_SUPERCORRECT_CONFIG: SuperCorrectConfig = {
  enableHierarchicalTemplates: true,
  enableCrossModelCorrection: true,
  maxCorrectionRounds: 3,
  errorDetectionThreshold: 0.7,
  useTeacherGuidance: true,
};

/**
 * Result of SuperCorrect reasoning
 */
export interface SuperCorrectResult {
  solution: string;
  template: HierarchicalThoughtTemplate;
  correctionHistory: Array<{
    round: number;
    errorsFound: IdentifiedError[];
    correctedSolution: string;
    improvementScore: number;
  }>;
  stats: {
    totalCorrectionRounds: number;
    errorsIdentified: number;
    errorsCorrected: number;
    finalConfidence: number;
  };
  duration: number;
}

// ============================================================================
// v7.10: Trace Compression Types (Inspired by Buffer of Thoughts)
// arXiv:2406.04271 - Meta-buffer thought templates + trace efficiency
// arXiv:2509.12464 - Reasoning-Aware Compression (RAC)
// ============================================================================

/**
 * Thought Template for meta-buffer storage
 * Generalizes reasoning patterns for reuse across similar problems
 */
export interface ThoughtTemplate {
  id: string;
  problemType: string;            // Type of problem this template solves
  description: string;            // Human-readable description
  embedding?: number[];           // Embedding for similarity search

  structure: {
    highLevelStrategy: string;    // Generalized approach
    keySteps: string[];           // Essential reasoning steps
    criticalDecisions: string[];  // Key decision points
    validationPoints: string[];   // Where to verify correctness
  };

  metadata: {
    successRate: number;          // Historical success rate
    avgTokenSavings: number;      // Typical compression achieved
    usageCount: number;           // Times this template was used
    lastUsed: Date;
    source: 'extracted' | 'distilled' | 'manual';
  };
}

/**
 * Compressed reasoning trace
 * Maintains semantic content with minimal tokens
 */
export interface CompressedTrace {
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;       // compressedTokens / originalTokens

  summary: string;                // Condensed reasoning summary
  keySteps: Array<{
    step: number;
    essence: string;              // Core reasoning (compressed)
    importance: number;           // 0-1, kept during pruning
    originalLength: number;
    compressedLength: number;
  }>;

  decisions: Array<{
    point: string;
    choice: string;
    rationale: string;            // Why this choice
  }>;

  // For reconstruction
  templateId?: string;            // If derived from template
  instantiationParams?: Record<string, unknown>;  // Template params
}

/**
 * Meta-buffer for storing and retrieving thought templates
 * Based on Buffer of Thoughts (BoT) architecture
 */
export interface MetaBuffer {
  templates: ThoughtTemplate[];

  // Retrieval settings
  similarityThreshold: number;    // δ from paper (0.5-0.7)
  maxTemplates: number;           // Max templates to store

  // Buffer statistics
  stats: {
    totalTemplates: number;
    avgCompressionRatio: number;
    cacheHitRate: number;
    totalTokensSaved: number;
  };
}

/**
 * Configuration for trace compression
 */
export interface TraceCompressionConfig {
  // Compression strategy
  strategy: 'summarize' | 'prune' | 'template' | 'hybrid';

  // Summarization settings
  summarizeConfig: {
    targetRatio: number;          // Target compression ratio (e.g., 0.3 = 30% of original)
    preserveKeySteps: boolean;    // Always keep critical reasoning steps
    maxSummaryTokens: number;     // Max tokens for summary
  };

  // Pruning settings
  pruneConfig: {
    importanceThreshold: number;  // Below this, steps may be pruned
    keepDecisionPoints: boolean;  // Always keep decision points
    keepValidation: boolean;      // Always keep validation steps
  };

  // Template settings
  templateConfig: {
    enableTemplateMatching: boolean;
    similarityThreshold: number;  // δ for template retrieval
    enableTemplateExtraction: boolean;  // Extract new templates
    minSuccessForTemplate: number;  // Min success rate to create template
  };

  // Meta-buffer settings
  metaBufferConfig: {
    enabled: boolean;
    maxTemplates: number;
    persistPath?: string;         // Path to persist templates
  };
}

export const DEFAULT_TRACE_COMPRESSION_CONFIG: TraceCompressionConfig = {
  strategy: 'hybrid',

  summarizeConfig: {
    targetRatio: 0.3,             // Compress to 30% of original
    preserveKeySteps: true,
    maxSummaryTokens: 500,
  },

  pruneConfig: {
    importanceThreshold: 0.3,     // Prune steps below 30% importance
    keepDecisionPoints: true,
    keepValidation: true,
  },

  templateConfig: {
    enableTemplateMatching: true,
    similarityThreshold: 0.6,     // δ = 0.6 (middle of recommended range)
    enableTemplateExtraction: true,
    minSuccessForTemplate: 0.8,
  },

  metaBufferConfig: {
    enabled: true,
    maxTemplates: 100,
    persistPath: undefined,
  },
};

/**
 * Result of trace compression
 */
export interface TraceCompressionResult {
  compressed: CompressedTrace;
  templateUsed?: ThoughtTemplate;
  newTemplateCreated?: ThoughtTemplate;

  stats: {
    originalTokens: number;
    compressedTokens: number;
    compressionRatio: number;
    strategyUsed: TraceCompressionConfig['strategy'];
    templateMatched: boolean;
    stepsPruned: number;
    processingTime: number;
  };
}

// ============================================================================
// v7.11: Math-Shepherd Process Reward Model Types
// Based on arXiv:2312.08935 - Verify and Reinforce LLMs Step-by-step
// ============================================================================

/**
 * Result of completing from an intermediate step
 * Used for Monte Carlo step scoring
 */
export interface CompletionResult {
  /** Completed reasoning steps from the checkpoint */
  steps: string[];
  /** Final answer extracted from completion */
  answer: string;
  /** Whether the answer matches the golden answer */
  isCorrect: boolean;
  /** Total tokens used for this completion */
  tokens: number;
}

/**
 * Step-level score from Math-Shepherd style verification
 */
export interface StepScore {
  /** Step index (0-based) */
  stepIndex: number;
  /** The step content */
  content: string;
  /** Hard Estimation score: 1 if ANY completion is correct, 0 otherwise */
  hardScore: number;
  /** Soft Estimation score: fraction of completions that are correct */
  softScore: number;
  /** Number of completions attempted */
  numCompletions: number;
  /** Completion results for this step */
  completions: CompletionResult[];
  /** Whether this step has potential to reach correct answer */
  hasPotential: boolean;
}

/**
 * Configuration for Math-Shepherd style verification
 */
export interface MathShepherdConfig {
  /** Enable completion-based verification */
  enabled: boolean;
  /** Number of completions per step (N in Math-Shepherd) */
  numCompletions: number;
  /** Temperature for completion sampling */
  completionTemperature: number;
  /** Max tokens per completion */
  maxCompletionTokens: number;
  /** Scoring method: hard (any correct) or soft (frequency) */
  scoringMethod: 'hard' | 'soft';
  /** Minimum score threshold for step acceptance */
  minStepScore: number;
  /** How to aggregate step scores for solution score */
  aggregationMethod: 'min' | 'product' | 'mean';
  /** Early termination if step score falls below threshold */
  earlyTermination: boolean;
  /** Cache completions to avoid redundant computation */
  cacheCompletions: boolean;
}

export const DEFAULT_MATH_SHEPHERD_CONFIG: MathShepherdConfig = {
  enabled: false,                  // Expensive, off by default
  numCompletions: 4,               // N=4 achieves 86% accuracy
  completionTemperature: 0.7,      // Diversity in completions
  maxCompletionTokens: 512,        // Enough for most math problems
  scoringMethod: 'hard',           // HE is faster, SE more precise
  minStepScore: 0.3,               // Below this, step is likely wrong
  aggregationMethod: 'min',        // Conservative: worst step determines solution score
  earlyTermination: true,          // Stop if step clearly wrong
  cacheCompletions: true,          // Reuse completions when possible
};

/**
 * Annotated solution with step-level scores
 */
export interface AnnotatedSolution {
  /** Original problem */
  problem: string;
  /** Golden answer (if known) */
  goldenAnswer?: string;
  /** Solution steps */
  steps: string[];
  /** Step-level scores */
  stepScores: StepScore[];
  /** Aggregate solution score (min/product/mean of step scores) */
  solutionScore: number;
  /** Final answer from the solution */
  finalAnswer: string;
  /** Whether the final answer is correct (if golden known) */
  isCorrect?: boolean;
  /** Total computation cost (tokens) */
  totalTokens: number;
  /** Processing time (ms) */
  processingTime: number;
}

/**
 * Result of Best-of-N solution ranking
 */
export interface SolutionRanking {
  /** Ranked solutions from best to worst */
  rankedSolutions: AnnotatedSolution[];
  /** Index of selected (best) solution */
  selectedIndex: number;
  /** The selected solution */
  selected: AnnotatedSolution;
  /** Ranking method used */
  rankingMethod: 'prm' | 'orm' | 'self_consistency' | 'combined';
  /** Statistics */
  stats: {
    totalCandidates: number;
    correctInTop1: boolean;
    correctInTopK: number;
    avgSolutionScore: number;
    bestSolutionScore: number;
    totalTokens: number;
    processingTime: number;
  };
}

/**
 * Process annotation dataset entry
 * For training PRMs without human annotation
 */
export interface ProcessAnnotation {
  /** Problem text */
  problem: string;
  /** Golden answer */
  goldenAnswer: string;
  /** Solution steps */
  steps: string[];
  /** Hard estimation labels per step */
  hardLabels: number[];
  /** Soft estimation labels per step */
  softLabels: number[];
  /** Number of completions used for annotation */
  numCompletions: number;
  /** Source model that generated the solution */
  sourceModel: string;
  /** Timestamp */
  timestamp: Date;
}

// ============================================================================
// v7.12: Conditional Reward Modeling (CRM) Types
// Based on arXiv:2509.26578 - Linking Process to Outcome
// ============================================================================

/**
 * Conditional step score with temporal dependencies
 * h(t) = P(wrong at step t | correct up to step t-1)
 */
export interface ConditionalStepScore {
  /** Step index (1-based for probability notation) */
  stepIndex: number;
  /** The step content */
  content: string;
  /** h(t): Conditional probability of error at this step */
  conditionalErrorProb: number;
  /** 1 - h(t): Probability this step is correct given previous steps */
  conditionalCorrectProb: number;
  /** S(t): Survival probability - P(correct final answer | steps 1..t) */
  survivalProb: number;
  /** r_t = log(1 - h(t)): PBRS-derived process reward */
  processReward: number;
  /** W(t): Cumulative error probability (entered wrong state by step t) */
  cumulativeErrorProb: number;
  /** Raw LLM confidence for h(t) estimation */
  rawConfidence: number;
}

/**
 * Configuration for Conditional Reward Modeling
 */
export interface CRMConfig {
  /** Enable CRM-based scoring */
  enabled: boolean;
  /** Method for estimating h(t): 'llm' (direct) or 'completion' (Monte Carlo) */
  estimationMethod: 'llm' | 'completion';
  /** Number of completions for Monte Carlo estimation (if method='completion') */
  numCompletions: number;
  /** Temperature for completions */
  completionTemperature: number;
  /** Whether to use early termination when S(t) drops below threshold */
  earlyTermination: boolean;
  /** Threshold for early termination (min survival probability) */
  survivalThreshold: number;
  /** How to aggregate trajectory score: 'product' (S(T)) or 'sum' (∑r_t) */
  trajectoryScoring: 'product' | 'sum';
  /** Cache h(t) values for identical prefixes */
  cacheEnabled: boolean;
}

export const DEFAULT_CRM_CONFIG: CRMConfig = {
  enabled: false,
  estimationMethod: 'llm',
  numCompletions: 4,
  completionTemperature: 0.7,
  earlyTermination: true,
  survivalThreshold: 0.1,
  trajectoryScoring: 'product',
  cacheEnabled: true,
};

/**
 * Result of CRM analysis on a reasoning trajectory
 */
export interface CRMTrajectoryResult {
  /** Problem being solved */
  problem: string;
  /** Full solution trajectory */
  solution: string;
  /** Conditional scores for each step */
  stepScores: ConditionalStepScore[];
  /** S(T): Final survival probability (trajectory-level score) */
  trajectoryScore: number;
  /** Final survival probability S(T) */
  finalSurvivalProb: number;
  /** Sum of process rewards: ∑r_t */
  totalProcessReward: number;
  /** Whether solution has correct answer (if golden answer provided) */
  hasCorrectAnswer: boolean;
  /** Scoring method used */
  scoringMethod: 'crm';
  /** Number of steps analyzed */
  stepsAnalyzed: number;
  /** Whether early termination was triggered */
  earlyTerminated: boolean;
}

/**
 * Beam search candidate with CRM scoring
 */
export interface CRMBeamCandidate {
  /** Steps generated so far */
  steps: string[];
  /** Current survival probability S(t) */
  survivalProb: number;
  /** Accumulated process reward ∑r_k for k=1..t */
  processRewardSum: number;
  /** Scores for each step */
  stepScores: ConditionalStepScore[];
  /** Whether this is a terminal state */
  isTerminal?: boolean;
}

/**
 * Result of CRM-guided beam search
 */
export interface CRMBeamSearchResult {
  /** Best solution found */
  bestSolution: string;
  /** Best candidate with full details */
  bestCandidate: CRMBeamCandidate;
  /** All final candidates */
  allCandidates: CRMBeamCandidate[];
  /** Whether solution has correct answer */
  hasCorrectAnswer: boolean;
  /** Beam width used */
  beamWidth: number;
  /** Max depth allowed */
  maxDepth: number;
  /** Actual depth reached */
  actualDepth: number;
  /** Processing time in ms */
  processingTime: number;
}

// ============================================================================
// Core Types
// ============================================================================

export interface ThinkingConfig {
  // Extended thinking
  enableExtendedThinking: boolean;
  thinkingBudget: number;  // Max tokens for thinking (1024-128000)
  showThinking: boolean;   // Whether to expose thinking to user

  // Self-critique
  enableSelfCritique: boolean;
  maxCritiqueRounds: number;  // Max iterations of critique-revise

  // Best-of-N
  enableBestOfN: boolean;
  nSamples: number;  // Number of samples to generate
  samplingTemperature: number;  // Temperature for diversity

  // Metacognition
  enableMetacognition: boolean;
  uncertaintyThreshold: number;  // Below this, flag as uncertain

  // Deliberative alignment
  enableDeliberativeAlignment: boolean;
  principles: string[];  // Core principles to reason about

  // v7.7: Tree-of-Thought
  enableTreeOfThought: boolean;
  totConfig: ToTConfig;

  // v7.7: Process Reward Model
  prmConfig: PRMConfig;

  // v7.7: CoT Entropy
  entropyConfig: EntropyConfig;

  // v7.7: Dynamic Compute Budget
  computeBudgetConfig: ComputeBudgetConfig;

  // v7.8: Graph-of-Thoughts
  enableGraphOfThought: boolean;
  gotConfig: GoTConfig;

  // v7.9: SuperCorrect
  enableSuperCorrect: boolean;
  superCorrectConfig: SuperCorrectConfig;

  // v7.10: Trace Compression (Buffer of Thoughts)
  enableTraceCompression: boolean;
  traceCompressionConfig: TraceCompressionConfig;

  // v7.11: Math-Shepherd Process Reward Model
  enableMathShepherd: boolean;
  mathShepherdConfig: MathShepherdConfig;

  // v7.12: Conditional Reward Modeling (CRM)
  enableCRM: boolean;
  crmConfig: CRMConfig;
}

export const DEFAULT_THINKING_CONFIG: ThinkingConfig = {
  enableExtendedThinking: true,
  thinkingBudget: 4096,
  showThinking: false,

  enableSelfCritique: true,
  maxCritiqueRounds: 2,

  enableBestOfN: false,  // Expensive, off by default
  nSamples: 3,
  samplingTemperature: 0.7,

  enableMetacognition: true,
  uncertaintyThreshold: 0.6,

  enableDeliberativeAlignment: true,
  principles: [
    'Be helpful and truthful',
    'Avoid harm to users and others',
    'Respect privacy and consent',
    'Acknowledge uncertainty honestly',
    'Support human autonomy and oversight',
  ],

  // v7.7: Advanced features (off by default for cost)
  enableTreeOfThought: false,
  totConfig: DEFAULT_TOT_CONFIG,
  prmConfig: DEFAULT_PRM_CONFIG,
  entropyConfig: DEFAULT_ENTROPY_CONFIG,
  computeBudgetConfig: DEFAULT_COMPUTE_BUDGET_CONFIG,

  // v7.8: Graph-of-Thoughts (off by default)
  enableGraphOfThought: false,
  gotConfig: DEFAULT_GOT_CONFIG,

  // v7.9: SuperCorrect (off by default)
  enableSuperCorrect: false,
  superCorrectConfig: DEFAULT_SUPERCORRECT_CONFIG,

  // v7.10: Trace Compression (on by default - saves tokens)
  enableTraceCompression: true,
  traceCompressionConfig: DEFAULT_TRACE_COMPRESSION_CONFIG,

  // v7.11: Math-Shepherd (off by default - expensive)
  enableMathShepherd: false,
  mathShepherdConfig: DEFAULT_MATH_SHEPHERD_CONFIG,

  // v7.12: CRM (off by default)
  enableCRM: false,
  crmConfig: DEFAULT_CRM_CONFIG,
};

/**
 * Lightweight thinking config for slow local LLMs (Ollama)
 * Reduces LLM calls from 8+ to 2 by disabling expensive features
 */
export const LIGHTWEIGHT_THINKING_CONFIG: ThinkingConfig = {
  ...DEFAULT_THINKING_CONFIG,

  // Keep only essential thinking (1 LLM call)
  enableExtendedThinking: true,
  thinkingBudget: 2048,  // Reduced for faster response

  // Disable expensive multi-call features
  enableSelfCritique: false,       // Saves 2-4 LLM calls
  enableMetacognition: false,      // Saves 1 LLM call
  enableDeliberativeAlignment: false, // Saves 1 LLM call
  enableBestOfN: false,            // Already off, but explicit

  // Keep trace compression (saves tokens)
  enableTraceCompression: true,

  // All advanced features off
  enableTreeOfThought: false,
  enableGraphOfThought: false,
  enableSuperCorrect: false,
  enableMathShepherd: false,
  enableCRM: false,
};

export interface ThinkingStep {
  type: 'think' | 'critique' | 'revise' | 'verify' | 'align';
  content: string;
  confidence: number;
  duration: number;
  tokenCount: number;
}

export interface ThinkingResult {
  response: string;
  thinking: ThinkingStep[];
  totalThinkingTokens: number;
  confidence: number;
  uncertainties: string[];
  principlesApplied: string[];
  iterations: number;
  duration: number;
}

export interface UncertaintyMarker {
  statement: string;
  confidence: number;
  reason: string;
  suggestedAction: 'verify' | 'qualify' | 'omit' | 'ask_user';
}

// ============================================================================
// Extended Thinking Prompts
// ============================================================================

const THINKING_PROMPT = `Before responding, think through this step by step in a <thinking> block.
Consider:
1. What is being asked exactly?
2. What do I know that's relevant?
3. What am I uncertain about?
4. What's the best approach?
5. Are there any risks or concerns?

<thinking>
[Your detailed reasoning here]
</thinking>

Then provide your response.`;

const CRITIQUE_PROMPT = `Review your previous response critically:

Previous response:
{response}

Evaluate:
1. ACCURACY: Are all claims factually correct?
2. COMPLETENESS: Does it fully address the question?
3. CLARITY: Is it clear and well-structured?
4. SAFETY: Are there any harmful implications?
5. UNCERTAINTY: Are uncertainties acknowledged?

Provide specific issues found (if any) in <critique> tags:
<critique>
[List specific issues, or "No significant issues found"]
</critique>`;

const REVISE_PROMPT = `Based on this critique, improve your response:

Original response:
{response}

Critique:
{critique}

Provide an improved response that addresses all issues identified.
If the critique found no issues, you may keep the original response.`;

const DELIBERATIVE_ALIGNMENT_PROMPT = `Before responding, reason about how your principles apply:

Principles:
{principles}

Question/Task:
{query}

In <alignment> tags, explicitly reason about:
1. Which principles are most relevant?
2. Are there any tensions between principles?
3. How should I balance competing considerations?
4. What would violate these principles?

<alignment>
[Your explicit reasoning about values and principles]
</alignment>

Then respond accordingly.`;

const UNCERTAINTY_ANALYSIS_PROMPT = `Analyze your confidence in this response:

Response:
{response}

For each major claim or assertion, rate your confidence (0-1) and explain:
- What evidence supports this?
- What could make this wrong?
- How should uncertainty be communicated?

Provide in <uncertainty> tags:
<uncertainty>
claim: [claim]
confidence: [0-1]
reason: [why this confidence level]
---
[repeat for each claim]
</uncertainty>`;

// ============================================================================
// v7.7: Tree-of-Thought Prompts
// ============================================================================

const TOT_THOUGHT_GENERATOR_PROMPT = `Given the problem and current state, generate {k} distinct next reasoning steps.

Problem: {problem}
Current State: {state}

Generate {k} different possible next thoughts/reasoning steps.
Each thought should be:
- A coherent, self-contained reasoning step
- Distinct from other thoughts
- Moving toward solving the problem

Format each thought in <thought> tags:
<thought id="1">
[First reasoning step]
</thought>
<thought id="2">
[Second reasoning step]
</thought>
...`;

const TOT_STATE_EVALUATOR_PROMPT = `Evaluate this reasoning state for solving the problem.

Problem: {problem}
Current State: {state}
Reasoning Path:
{path}

Rate this state on a scale of 1-10:
- 1-3: Wrong direction, unlikely to lead to solution
- 4-5: Unclear, might work but uncertain
- 6-7: Promising, on the right track
- 8-9: Very close to solution
- 10: Complete solution found

Provide your evaluation in <eval> tags:
<eval>
score: [1-10]
is_terminal: [true/false - is this a complete solution?]
is_valid: [true/false - is the reasoning logically valid?]
reason: [brief explanation]
</eval>`;

const TOT_VOTE_PROMPT = `Compare these reasoning states and vote for the best one.

Problem: {problem}

{states}

Vote for the state most likely to lead to the correct solution.
Consider: logical validity, progress toward solution, clarity.

<vote>
best: [state number]
reason: [why this state is best]
</vote>`;

const PRM_STEP_VERIFICATION_PROMPT = `Verify this reasoning step.

Problem: {problem}
Previous Steps: {previous}
Current Step: {step}

Evaluate the current step:
1. Is the logic correct?
2. Does it follow from previous steps?
3. Does it move toward solving the problem?
4. Are there any errors or invalid assumptions?

<verification>
score: [0-1, where 1 is perfectly valid]
errors: [list any errors found]
valid: [true/false]
</verification>`;

const COT_ENTROPY_SAMPLE_PROMPT = `Given this problem, provide your reasoning and final answer.

Problem: {problem}

Think step by step and arrive at an answer.

<reasoning>
[Your step-by-step reasoning]
</reasoning>
<answer>
[Your final answer]
</answer>`;

const DIFFICULTY_ESTIMATION_PROMPT = `Estimate the difficulty of this problem.

Problem: {problem}

Consider:
1. Number of reasoning steps required
2. Domain knowledge needed
3. Ambiguity level
4. Computational complexity

<difficulty>
level: [easy/medium/hard/very_hard]
estimated_steps: [number]
reasoning_type: [arithmetic/logical/creative/multi-step/research]
confidence: [0-1]
</difficulty>`;

// ============================================================================
// v7.8: Graph-of-Thoughts Prompts (arXiv:2308.09687)
// ============================================================================

const GOT_DECOMPOSE_PROMPT = `Decompose this problem into sub-problems that can be solved independently.

Problem: {problem}

Break this down into {k} independent sub-problems. Each sub-problem should:
- Be solvable on its own
- Contribute to the overall solution
- Not depend on other sub-problems (as much as possible)

Format each sub-problem in <subproblem> tags:
<subproblem id="1">
[First sub-problem]
</subproblem>
<subproblem id="2">
[Second sub-problem]
</subproblem>
...`;

const GOT_AGGREGATE_PROMPT = `Aggregate these multiple solutions into a single, coherent answer.

Original Problem: {problem}

Solutions to aggregate:
{solutions}

Aggregation strategy: {strategy}

Combine these solutions by:
- merge: Combine all information without loss
- synthesize: Create a new solution that's better than any individual one
- vote: Select the most common/agreed-upon answer

<aggregated>
[Your aggregated solution here]
</aggregated>

<rationale>
[Explain how you combined the solutions]
</rationale>`;

const GOT_REFINE_PROMPT = `Refine and improve this thought/solution.

Original Problem: {problem}
Current Thought: {thought}
Refinement Round: {round}/{max_rounds}

Improve this thought by:
1. Fixing any errors or inconsistencies
2. Adding missing details
3. Clarifying ambiguous parts
4. Strengthening the reasoning

<refined>
[Your improved thought here]
</refined>

<improvements>
[List what you improved]
</improvements>`;

const GOT_SCORE_PROMPT = `Score this thought on how well it solves the problem.

Problem: {problem}
Thought: {thought}

Rate on these dimensions (0-10):
1. Correctness: Is the reasoning logically valid?
2. Completeness: Does it fully address the problem?
3. Clarity: Is it well-explained?
4. Efficiency: Is it concise without being incomplete?

<score>
correctness: [0-10]
completeness: [0-10]
clarity: [0-10]
efficiency: [0-10]
overall: [0-10]
is_solution: [true/false]
</score>`;

// ============================================================================
// v7.9: SuperCorrect Prompts (arXiv:2410.09008)
// ============================================================================

const SUPERCORRECT_HIERARCHICAL_TEMPLATE_PROMPT = `Generate a hierarchical thought template for solving this problem.

Problem: {problem}

Create a template with TWO levels:

1. HIGH-LEVEL STRATEGY:
   - What is the general approach to solving this type of problem?
   - What key insights apply to similar problems?
   - What common patterns should we recognize?

2. DETAILED STEPS:
   - What specific steps should be followed?
   - What reasoning justifies each step?
   - How do we validate each step?
   - Where do errors commonly occur?

<template>
<high_level>
strategy: [Generalized solution approach]
insights:
- [Key insight 1]
- [Key insight 2]
patterns:
- [Common pattern 1]
- [Common pattern 2]
</high_level>

<detailed>
<step num="1">
description: [What to do]
reasoning: [Why this step]
validation: [How to verify correctness]
</step>
<step num="2">
description: [What to do]
reasoning: [Why this step]
validation: [How to verify correctness]
</step>
...
critical_points:
- [Where errors commonly happen]
checkpoints:
- [Where to verify progress]
</detailed>
</template>`;

const SUPERCORRECT_ERROR_DETECTION_PROMPT = `Analyze this solution for errors (act as a "teacher" model).

Problem: {problem}
Student Solution: {solution}
Hierarchical Template: {template}

Compare the solution against the template and identify ANY errors:
- Logical errors (invalid reasoning)
- Computational errors (math mistakes)
- Wrong assumptions
- Missing steps
- Overcomplicated approaches

Be THOROUGH - even small errors matter!

<errors>
<error num="1">
step_index: [which step has the error, -1 if general]
type: [logical|computational|assumption|missing_step|overcomplicated]
description: [What is wrong]
severity: [critical|major|minor]
suggested_fix: [How to fix it]
</error>
...
</errors>

If no errors found:
<errors>
none_found: true
</errors>`;

const SUPERCORRECT_CORRECTION_PROMPT = `Correct this solution based on the identified errors (cross-model correction).

Problem: {problem}
Original Solution: {solution}
Errors Found:
{errors}

Apply the suggested fixes and produce a corrected solution.
For each error:
1. Understand what went wrong
2. Apply the fix
3. Verify the fix doesn't introduce new errors

<corrected_solution>
[Your corrected solution with all errors fixed]
</corrected_solution>

<correction_trace>
[Explain what you changed and why]
</correction_trace>`;

const SUPERCORRECT_VERIFY_CORRECTION_PROMPT = `Verify that the corrections were applied correctly.

Problem: {problem}
Original Solution: {solution}
Corrected Solution: {corrected}
Errors That Were Fixed: {errors}

Check:
1. Were all errors actually fixed?
2. Were any new errors introduced?
3. Is the corrected solution complete?

<verification>
errors_fixed: [true/false - were all errors addressed?]
new_errors: [list any new errors introduced, or "none"]
completeness: [0-10 - how complete is the solution?]
confidence: [0-1 - confidence in the corrected solution]
</verification>`;

// ============================================================================
// v7.10: Trace Compression Prompts (Buffer of Thoughts + RAC)
// ============================================================================

const TRACE_SUMMARIZE_PROMPT = `Compress this reasoning trace while preserving essential information.

Original Trace:
{trace}

Target: Reduce to approximately {targetRatio}% of original length.

PRESERVATION RULES:
1. ALWAYS keep: key decisions, final conclusions, critical insights
2. MAY compress: verbose explanations, repetitive reasoning, intermediate calculations
3. NEVER lose: logical flow, decision rationale, validation results

<compressed>
summary: [1-2 sentence high-level summary of the reasoning]

key_steps:
<step num="1" importance="[0-1]">
essence: [Core reasoning in minimal words]
</step>
<step num="2" importance="[0-1]">
essence: [Core reasoning in minimal words]
</step>
...

decisions:
<decision>
point: [What was being decided]
choice: [What was chosen]
rationale: [Why - brief]
</decision>
...
</compressed>`;

const TRACE_PRUNE_PROMPT = `Identify steps that can be safely pruned from this reasoning trace.

Original Trace:
{trace}

Importance Threshold: {threshold} (prune steps below this)

Evaluate each step:
1. Is this step essential to the logical chain?
2. Does this step contain a key decision?
3. Would removing this step break understanding?
4. Is this step redundant with another step?

<pruning_analysis>
<step index="{i}">
importance: [0-1]
essential: [true/false]
reason: [Why keep or prune]
prune_safe: [true/false]
</step>
...

recommended_pruning: [list of step indices to remove]
estimated_savings: [percentage of tokens saved]
</pruning_analysis>`;

const TRACE_EXTRACT_TEMPLATE_PROMPT = `Extract a reusable thought template from this successful reasoning trace.

Problem Type: {problemType}
Original Problem: {problem}
Reasoning Trace: {trace}
Success Indicator: {success}

Create a GENERALIZED template that can solve similar problems.

GENERALIZATION RULES:
1. Replace specific values with [PLACEHOLDER] markers
2. Extract the underlying strategy, not specific calculations
3. Identify decision points that would vary by problem
4. Note validation patterns that apply generally

<template>
id: [unique identifier]
problem_type: [category of problems this solves]
description: [When to use this template]

<structure>
high_level_strategy: [Generalized approach in 1-2 sentences]

key_steps:
- [Step 1 - generalized]
- [Step 2 - generalized]
...

critical_decisions:
- [Decision point 1: what varies by problem]
...

validation_points:
- [When to verify correctness]
...
</structure>

<metadata>
success_rate: [estimated based on trace]
avg_token_savings: [estimated]
</metadata>
</template>`;

const TRACE_MATCH_TEMPLATE_PROMPT = `Determine if this problem matches an existing thought template.

Problem: {problem}

Available Templates:
{templates}

For each template, assess:
1. Problem type match (0-1)
2. Strategy applicability (0-1)
3. Adaptation difficulty (low/medium/high)

<matching>
<template id="{templateId}">
type_match: [0-1]
strategy_match: [0-1]
adaptation: [low|medium|high]
overall_score: [0-1]
adaptation_notes: [What would need to change]
</template>
...

best_match: [template id or "none"]
confidence: [0-1]
</matching>`;

const TRACE_INSTANTIATE_TEMPLATE_PROMPT = `Instantiate this thought template for the specific problem.

Template:
{template}

Problem:
{problem}

Apply the template by:
1. Fill in [PLACEHOLDER] markers with problem-specific values
2. Adapt the strategy to this specific case
3. Apply the key steps in order
4. Follow validation points

<instantiated>
[Complete reasoning using the template structure, adapted to this problem]
</instantiated>

<adaptation_log>
[Note any changes made to the template for this problem]
</adaptation_log>`;

// ============================================================================
// v7.11: Math-Shepherd Prompts
// Based on arXiv:2312.08935 - Verify and Reinforce LLMs Step-by-step
// ============================================================================

/**
 * Prompt to complete reasoning from an intermediate step
 * Used for Monte Carlo scoring of steps
 */
const MATH_SHEPHERD_COMPLETION_PROMPT = `Continue solving this problem from the given checkpoint.

Problem:
{problem}

Solution so far:
{steps_so_far}

Continue from this point and complete the solution. Show clear step-by-step reasoning.

<completion>
[Continue the solution from where it left off, show each step, end with the final answer]
</completion>

<final_answer>
[Just the final answer, no explanation]
</final_answer>`;

/**
 * Prompt to extract final answer from a solution
 */
const MATH_SHEPHERD_EXTRACT_ANSWER_PROMPT = `Extract the final numerical or symbolic answer from this solution.

Solution:
{solution}

<answer>
[Just the final answer - a number, expression, or short phrase. No explanation.]
</answer>`;

/**
 * Prompt to split a solution into individual steps
 */
const MATH_SHEPHERD_SPLIT_STEPS_PROMPT = `Split this solution into individual reasoning steps.

Solution:
{solution}

Output each step on its own line, numbered. Include:
- All calculations
- All logical deductions
- The final answer as the last step

<steps>
1. [First step]
2. [Second step]
...
N. [Final answer]
</steps>`;

/**
 * Prompt to check if two answers are equivalent
 */
const MATH_SHEPHERD_COMPARE_ANSWERS_PROMPT = `Compare these two answers to determine if they are mathematically equivalent.

Answer 1: {answer1}
Answer 2: {answer2}

Consider:
- Numerical equivalence (3/2 = 1.5)
- Algebraic equivalence (2x = x+x)
- Simplified vs unsimplified forms
- Different notations (%, fractions, decimals)

<comparison>
equivalent: [true or false]
reasoning: [brief explanation]
</comparison>`;

// ============================================================================
// v7.12: CRM Prompts for Conditional Reward Modeling
// ============================================================================

/**
 * Prompt for estimating h(t) - conditional error probability
 * P(step t is wrong | steps 1..t-1 are correct)
 */
const CRM_ESTIMATE_ERROR_PROB_PROMPT = `You are evaluating a single reasoning step in a multi-step solution.

PROBLEM:
{problem}

PREVIOUS STEPS (assumed correct):
{previous_steps}

CURRENT STEP TO EVALUATE:
{current_step}

Given that all previous steps are correct, estimate the probability that THIS step introduces an error that will prevent reaching the correct answer.

Consider:
1. Is the logical reasoning sound given the previous steps?
2. Are there any mathematical/computational errors?
3. Does this step follow correctly from the previous steps?
4. Could this step lead the solution astray?

<evaluation>
error_probability: [0.0 to 1.0 - probability this step is wrong given previous steps are correct]
confidence: [0.0 to 1.0 - your confidence in this estimate]
reasoning: [brief explanation of your assessment]
potential_issues: [list any concerns, or "none"]
</evaluation>`;

/**
 * Prompt for evaluating trajectory coherence
 */
const CRM_TRAJECTORY_COHERENCE_PROMPT = `Evaluate the overall coherence of this reasoning trajectory.

PROBLEM:
{problem}

FULL SOLUTION:
{solution}

Analyze whether the reasoning maintains logical consistency throughout and leads to a justified conclusion.

<coherence_analysis>
overall_survival_estimate: [0.0 to 1.0 - probability this trajectory reaches correct answer]
weakest_step: [index of the weakest step, or 0 if all steps are strong]
coherence_score: [0.0 to 1.0 - how well steps connect logically]
credit_assignment: [which steps contributed most to success/failure]
</coherence_analysis>`;

/**
 * Prompt for cross-sample comparison
 */
const CRM_COMPARE_TRAJECTORIES_PROMPT = `Compare these two reasoning trajectories for the same problem.

PROBLEM:
{problem}

TRAJECTORY A:
{trajectory_a}

TRAJECTORY B:
{trajectory_b}

Which trajectory is more likely to reach the correct answer? Consider:
- Logical coherence of each step
- Mathematical correctness
- Efficiency of reasoning path
- Risk of errors accumulating

<comparison>
preferred: [A or B]
confidence: [0.0 to 1.0]
trajectory_a_score: [0.0 to 1.0]
trajectory_b_score: [0.0 to 1.0]
reasoning: [brief explanation]
</comparison>`;

// ============================================================================
// ThinkingEngine Class
// ============================================================================

export class ThinkingEngine {
  private config: ThinkingConfig;
  private llm: LLMBridge;
  private thinkingHistory: ThinkingStep[] = [];

  // v7.10: Meta-buffer for thought template storage
  private metaBuffer: MetaBuffer = {
    templates: [],
    similarityThreshold: 0.6,
    maxTemplates: 100,
    stats: {
      totalTemplates: 0,
      avgCompressionRatio: 0,
      cacheHitRate: 0,
      totalTokensSaved: 0,
    },
  };

  constructor(config: Partial<ThinkingConfig> = {}) {
    this.config = { ...DEFAULT_THINKING_CONFIG, ...config };
    this.llm = getLLMBridge();
  }

  /**
   * Estimate token count for a string
   * Simple approximation: ~4 characters per token for English
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // ==========================================================================
  // Main Entry Point
  // ==========================================================================

  /**
   * Process input with extended thinking
   */
  async think(
    query: string,
    context?: string,
    systemPrompt?: string
  ): Promise<ThinkingResult> {
    const startTime = Date.now();
    const steps: ThinkingStep[] = [];
    let totalTokens = 0;

    // Step 1: Deliberative Alignment (if enabled)
    let alignmentContext = '';
    if (this.config.enableDeliberativeAlignment) {
      const alignment = await this.deliberate(query);
      steps.push(alignment);
      totalTokens += alignment.tokenCount;
      alignmentContext = alignment.content;
    }

    // Step 2: Extended Thinking (if enabled)
    let thinkingContext = '';
    if (this.config.enableExtendedThinking) {
      const thinking = await this.extendedThink(query, context, alignmentContext);
      steps.push(thinking);
      totalTokens += thinking.tokenCount;
      thinkingContext = thinking.content;
    }

    // Step 3: Generate response(s)
    let response: string;
    let generationConfidence: number;

    if (this.config.enableBestOfN && this.config.nSamples > 1) {
      // Best-of-N sampling
      const { best, confidence } = await this.bestOfN(
        query,
        context,
        thinkingContext,
        systemPrompt
      );
      response = best;
      generationConfidence = confidence;
      steps.push({
        type: 'think',
        content: `Best-of-${this.config.nSamples} selection`,
        confidence,
        duration: 0,
        tokenCount: 0,
      });
    } else {
      // Single generation
      const result = await this.generate(query, context, thinkingContext, systemPrompt);
      response = result.response;
      generationConfidence = result.confidence;
    }

    // Step 4: Self-Critique Loop (if enabled)
    if (this.config.enableSelfCritique) {
      const { finalResponse, critiqueSteps } = await this.selfCritiqueLoop(
        response,
        query
      );
      response = finalResponse;
      steps.push(...critiqueSteps);
      totalTokens += critiqueSteps.reduce((sum, s) => sum + s.tokenCount, 0);
    }

    // Step 5: Uncertainty Analysis (if enabled)
    let uncertainties: UncertaintyMarker[] = [];
    let overallConfidence = generationConfidence;

    if (this.config.enableMetacognition) {
      const analysis = await this.analyzeUncertainty(response);
      uncertainties = analysis.markers;
      overallConfidence = analysis.overallConfidence;
      steps.push({
        type: 'verify',
        content: `Uncertainty analysis: ${uncertainties.length} markers`,
        confidence: overallConfidence,
        duration: analysis.duration,
        tokenCount: analysis.tokenCount,
      });
      totalTokens += analysis.tokenCount;
    }

    // Store history
    this.thinkingHistory = steps;

    return {
      response,
      thinking: steps,
      totalThinkingTokens: totalTokens,
      confidence: overallConfidence,
      uncertainties: uncertainties.map(u => u.statement),
      principlesApplied: this.config.enableDeliberativeAlignment
        ? this.config.principles
        : [],
      iterations: steps.filter(s => s.type === 'revise').length + 1,
      duration: Date.now() - startTime,
    };
  }

  // ==========================================================================
  // Extended Thinking (Scratchpad)
  // ==========================================================================

  /**
   * Generate extended thinking before response
   */
  private async extendedThink(
    query: string,
    context?: string,
    alignmentContext?: string
  ): Promise<ThinkingStep> {
    try {
      const startTime = Date.now();

      const prompt = `${THINKING_PROMPT}

${alignmentContext ? `Alignment reasoning:\n${alignmentContext}\n\n` : ''}
${context ? `Context:\n${context}\n\n` : ''}
Question: ${query}`;

      const response = await this.llm.chat(prompt);

      // Extract thinking block
      const thinkingMatch = response.content.match(/<thinking>([\s\S]*?)<\/thinking>/);
      const thinking = thinkingMatch ? thinkingMatch[1].trim() : response.content;

      // Estimate confidence from thinking depth
      const confidence = this.estimateThinkingConfidence(thinking);

      return {
        type: 'think',
        content: thinking,
        confidence,
        duration: Date.now() - startTime,
        tokenCount: Math.ceil(thinking.length / 4),
      };
    } catch (err) {
      console.error('[thinking] extendedThink failed:', err);
      return {
        type: 'think',
        content: '',
        confidence: 0,
        duration: 0,
        tokenCount: 0,
      };
    }
  }

  // ==========================================================================
  // Deliberative Alignment
  // ==========================================================================

  /**
   * Reason about values and principles explicitly
   */
  private async deliberate(query: string): Promise<ThinkingStep> {
    const startTime = Date.now();

    try {
      const prompt = DELIBERATIVE_ALIGNMENT_PROMPT
        .replace('{principles}', this.config.principles.map((p, i) => `${i + 1}. ${p}`).join('\n'))
        .replace('{query}', query);

      const response = await this.llm.chat(prompt);

      // Extract alignment reasoning
      const alignmentMatch = response.content.match(/<alignment>([\s\S]*?)<\/alignment>/);
      const alignment = alignmentMatch ? alignmentMatch[1].trim() : '';

      return {
        type: 'align',
        content: alignment,
        confidence: 0.9,  // Alignment is typically high confidence
        duration: Date.now() - startTime,
        tokenCount: Math.ceil(alignment.length / 4),
      };
    } catch (err) {
      console.error('[thinking] deliberate failed:', err);
      return {
        type: 'align',
        content: '',
        confidence: 0.0,
        duration: Date.now() - startTime,
        tokenCount: 0,
      };
    }
  }

  // ==========================================================================
  // Self-Critique Loop
  // ==========================================================================

  /**
   * Iteratively critique and revise response
   */
  private async selfCritiqueLoop(
    initialResponse: string,
    query: string
  ): Promise<{ finalResponse: string; critiqueSteps: ThinkingStep[] }> {
    const steps: ThinkingStep[] = [];
    let currentResponse = initialResponse;

    for (let i = 0; i < this.config.maxCritiqueRounds; i++) {
      // Critique
      const critiqueStart = Date.now();
      const critiquePrompt = CRITIQUE_PROMPT.replace('{response}', currentResponse);
      const critiqueResult = await this.llm.chat(critiquePrompt);

      // Extract critique
      const critiqueMatch = critiqueResult.content.match(/<critique>([\s\S]*?)<\/critique>/);
      const critique = critiqueMatch ? critiqueMatch[1].trim() : critiqueResult.content;

      steps.push({
        type: 'critique',
        content: critique,
        confidence: 0.8,
        duration: Date.now() - critiqueStart,
        tokenCount: Math.ceil(critique.length / 4),
      });

      // Check if critique found issues
      const hasIssues = !critique.toLowerCase().includes('no significant issues') &&
                       !critique.toLowerCase().includes('no issues found');

      if (!hasIssues) {
        // No issues found, stop iterating
        break;
      }

      // Revise
      const reviseStart = Date.now();
      const revisePrompt = REVISE_PROMPT
        .replace('{response}', currentResponse)
        .replace('{critique}', critique);
      const reviseResult = await this.llm.chat(revisePrompt);
      const revisedResponse = reviseResult.content;

      steps.push({
        type: 'revise',
        content: `Revision ${i + 1}`,
        confidence: 0.85,
        duration: Date.now() - reviseStart,
        tokenCount: Math.ceil(revisedResponse.length / 4),
      });

      currentResponse = revisedResponse;
    }

    return {
      finalResponse: currentResponse,
      critiqueSteps: steps,
    };
  }

  // ==========================================================================
  // Best-of-N Sampling
  // ==========================================================================

  /**
   * Generate N samples and select the best
   */
  private async bestOfN(
    query: string,
    context?: string,
    thinkingContext?: string,
    systemPrompt?: string
  ): Promise<{ best: string; confidence: number }> {
    try {
      // v10.3: Parallel Best-of-N generation (3-5x speedup)
      const generatePromises = Array.from({ length: this.config.nSamples }, () =>
        this.generate(
          query,
          context,
          thinkingContext,
          systemPrompt,
          this.config.samplingTemperature
        )
      );

      const results = await Promise.all(generatePromises);
      const samples = results.map(result => ({
        response: result.response,
        score: result.confidence,
      }));

      // Self-consistency: Check agreement among samples
      const consensusScore = this.calculateConsensus(samples.map(s => s.response));

      // Select best (highest score + bonus for consensus)
      let bestIndex = 0;
      let bestScore = 0;

      for (let i = 0; i < samples.length; i++) {
        const score = samples[i].score + (consensusScore * 0.2);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }

      return {
        best: samples[bestIndex].response,
        confidence: Math.min(1, bestScore),
      };
    } catch (err) {
      console.error('[thinking] bestOfN failed:', err);
      return {
        best: 'Failed to generate response due to error.',
        confidence: 0,
      };
    }
  }

  /**
   * Calculate consensus among samples (simple overlap measure)
   */
  private calculateConsensus(responses: string[]): number {
    if (responses.length < 2) return 1;

    // Simple: count common words across responses
    const wordSets = responses.map(r =>
      new Set(r.toLowerCase().split(/\s+/).filter(w => w.length > 3))
    );

    let totalOverlap = 0;
    let comparisons = 0;

    for (let i = 0; i < wordSets.length; i++) {
      for (let j = i + 1; j < wordSets.length; j++) {
        const overlap = [...wordSets[i]].filter(w => wordSets[j].has(w)).length;
        const union = new Set([...wordSets[i], ...wordSets[j]]).size;
        totalOverlap += overlap / union;
        comparisons++;
      }
    }

    return comparisons > 0 ? totalOverlap / comparisons : 0;
  }

  // ==========================================================================
  // Uncertainty Analysis (Metacognition)
  // ==========================================================================

  /**
   * Analyze uncertainty in response
   */
  private async analyzeUncertainty(
    response: string
  ): Promise<{
    markers: UncertaintyMarker[];
    overallConfidence: number;
    duration: number;
    tokenCount: number;
  }> {
    const startTime = Date.now();

    const prompt = UNCERTAINTY_ANALYSIS_PROMPT.replace('{response}', response);
    const result = await this.llm.chat(prompt);

    // Parse uncertainty markers
    const markers: UncertaintyMarker[] = [];
    const uncertaintyMatch = result.content.match(/<uncertainty>([\s\S]*?)<\/uncertainty>/);

    if (uncertaintyMatch) {
      const content = uncertaintyMatch[1];
      const claims = content.split('---').filter(c => c.trim());

      for (const claim of claims) {
        const claimMatch = claim.match(/claim:\s*(.+)/i);
        const confMatch = claim.match(/confidence:\s*([\d.]+)/i);
        const reasonMatch = claim.match(/reason:\s*(.+)/i);

        if (claimMatch && confMatch) {
          const confidence = parseFloat(confMatch[1]);
          markers.push({
            statement: claimMatch[1].trim(),
            confidence,
            reason: reasonMatch ? reasonMatch[1].trim() : '',
            suggestedAction: confidence < 0.3 ? 'omit'
              : confidence < 0.5 ? 'qualify'
              : confidence < 0.7 ? 'verify'
              : 'verify',
          });
        }
      }
    }

    // Calculate overall confidence
    const overallConfidence = markers.length > 0
      ? markers.reduce((sum, m) => sum + m.confidence, 0) / markers.length
      : 0.7;  // Default if no markers found

    return {
      markers,
      overallConfidence,
      duration: Date.now() - startTime,
      tokenCount: Math.ceil(result.content.length / 4),
    };
  }

  // ==========================================================================
  // Core Generation
  // ==========================================================================

  /**
   * Generate a response with optional thinking context
   */
  private async generate(
    query: string,
    context?: string,
    thinkingContext?: string,
    systemPrompt?: string,
    _temperature?: number
  ): Promise<{ response: string; confidence: number }> {
    try {
      let prompt = query;

      if (context) {
        prompt = `Context:\n${context}\n\n${prompt}`;
      }

      if (thinkingContext) {
        prompt = `[Internal reasoning completed]\n\n${prompt}`;
      }

      const result = await this.llm.chat(prompt, systemPrompt);

      // Estimate confidence from response characteristics
      const confidence = this.estimateResponseConfidence(result.content);

      return {
        response: result.content,
        confidence,
      };
    } catch (err) {
      console.error('[thinking] generate failed:', err);
      return { response: 'Failed to generate response', confidence: 0 };
    }
  }

  // ==========================================================================
  // Confidence Estimation
  // ==========================================================================

  /**
   * Estimate confidence from thinking depth
   */
  private estimateThinkingConfidence(thinking: string): number {
    let confidence = 0.5;

    // More tokens = more thorough thinking
    const tokenCount = Math.ceil(thinking.length / 4);
    if (tokenCount > 500) confidence += 0.1;
    if (tokenCount > 1000) confidence += 0.1;

    // Check for uncertainty markers
    const uncertaintyWords = ['uncertain', 'unclear', 'might', 'possibly', 'not sure', 'unknown'];
    const uncertaintyCount = uncertaintyWords.filter(w =>
      thinking.toLowerCase().includes(w)
    ).length;
    confidence -= uncertaintyCount * 0.05;

    // Check for structured reasoning
    const hasNumbers = /\d+\.\s/.test(thinking);  // Numbered steps
    if (hasNumbers) confidence += 0.1;

    return Math.max(0.1, Math.min(0.95, confidence));
  }

  /**
   * Estimate confidence from response characteristics
   */
  private estimateResponseConfidence(response: string): number {
    let confidence = 0.7;

    // Hedging language reduces confidence
    const hedges = ['I think', 'probably', 'might', 'possibly', 'not sure', 'I believe'];
    const hedgeCount = hedges.filter(h =>
      response.toLowerCase().includes(h)
    ).length;
    confidence -= hedgeCount * 0.05;

    // Specific details increase confidence
    const hasSpecifics = /\d+/.test(response) || /"[^"]+"/.test(response);
    if (hasSpecifics) confidence += 0.1;

    // Very short responses are less confident
    if (response.length < 100) confidence -= 0.1;

    return Math.max(0.1, Math.min(0.95, confidence));
  }

  // ==========================================================================
  // Configuration & Status
  // ==========================================================================

  /**
   * Get current configuration
   */
  getConfig(): ThinkingConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ThinkingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get thinking history
   */
  getHistory(): ThinkingStep[] {
    return [...this.thinkingHistory];
  }

  /**
   * Clear thinking history
   */
  clearHistory(): void {
    this.thinkingHistory = [];
  }

  /**
   * Get thinking statistics
   */
  getStats(): {
    totalSteps: number;
    avgConfidence: number;
    totalTokens: number;
    byType: Record<string, number>;
  } {
    const byType: Record<string, number> = {};

    for (const step of this.thinkingHistory) {
      byType[step.type] = (byType[step.type] || 0) + 1;
    }

    const avgConfidence = this.thinkingHistory.length > 0
      ? this.thinkingHistory.reduce((sum, s) => sum + s.confidence, 0) / this.thinkingHistory.length
      : 0;

    const totalTokens = this.thinkingHistory.reduce((sum, s) => sum + s.tokenCount, 0);

    return {
      totalSteps: this.thinkingHistory.length,
      avgConfidence,
      totalTokens,
      byType,
    };
  }

  // ==========================================================================
  // v7.7: Tree-of-Thought Search
  // ==========================================================================

  /**
   * Tree-of-Thought reasoning with search
   * Based on arXiv:2305.10601
   */
  async treeOfThought(problem: string): Promise<ToTResult> {
    const startTime = Date.now();
    const config = this.config.totConfig;

    // Initialize tree with root node
    const nodes = new Map<string, ThoughtNode>();
    const root = this.createNode('', problem, null, 0);
    nodes.set(root.id, root);

    let stats = {
      nodesExpanded: 0,
      maxDepthReached: 0,
      backtrackCount: 0,
      prunedCount: 0,
    };

    let solution: ThoughtNode | null = null;

    // Run search based on strategy
    switch (config.strategy) {
      case 'bfs':
        solution = await this.totBFS(problem, root, nodes, config, stats);
        break;
      case 'dfs':
        solution = await this.totDFS(problem, root, nodes, config, stats);
        break;
      case 'mcts':
        solution = await this.totMCTS(problem, root, nodes, config, stats);
        break;
      case 'beam':
        solution = await this.totBeamSearch(problem, root, nodes, config, stats);
        break;
    }

    // Extract solution path
    const solutionPath: ThoughtNode[] = [];
    if (solution) {
      let current: ThoughtNode | undefined = solution;
      while (current) {
        solutionPath.unshift(current);
        current = current.parent ? nodes.get(current.parent) : undefined;
      }
    }

    return {
      solution: solution?.state || 'No solution found',
      solutionPath,
      treeStats: stats,
      confidence: solution?.value || 0,
      searchDuration: Date.now() - startTime,
    };
  }

  /**
   * BFS for Tree-of-Thought (Algorithm 1 from paper)
   */
  private async totBFS(
    problem: string,
    root: ThoughtNode,
    nodes: Map<string, ThoughtNode>,
    config: ToTConfig,
    stats: { nodesExpanded: number; maxDepthReached: number; backtrackCount: number; prunedCount: number }
  ): Promise<ThoughtNode | null> {
    let frontier: ThoughtNode[] = [root];

    for (let depth = 0; depth < config.maxDepth && frontier.length > 0; depth++) {
      stats.maxDepthReached = Math.max(stats.maxDepthReached, depth);

      // Generate thoughts for all nodes in frontier
      const candidates: ThoughtNode[] = [];

      for (const node of frontier) {
        // Generate k candidate thoughts
        const thoughts = await this.generateThoughts(problem, node, config.branchingFactor);
        stats.nodesExpanded++;

        for (const thought of thoughts) {
          const childNode = this.createNode(thought, this.applyThought(node.state, thought), node.id, depth + 1);
          nodes.set(childNode.id, childNode);
          node.children.push(childNode.id);
          candidates.push(childNode);
        }
      }

      // Evaluate all candidates
      const evaluated = await this.evaluateStates(problem, candidates, config.evalMethod);

      // Check for terminal solution
      for (const node of evaluated) {
        if (node.isTerminal && node.isValid) {
          return node;
        }
      }

      // Prune and select top b states
      const validCandidates = evaluated.filter(n => n.isValid && n.value >= config.pruneThreshold);
      stats.prunedCount += evaluated.length - validCandidates.length;

      // Sort by value and keep top b
      validCandidates.sort((a, b) => b.value - a.value);
      frontier = validCandidates.slice(0, config.beamWidth);
    }

    // Return best non-terminal if no solution found
    const allNodes = Array.from(nodes.values());
    allNodes.sort((a, b) => b.value - a.value);
    return allNodes[0] || null;
  }

  /**
   * DFS for Tree-of-Thought with backtracking (Algorithm 2 from paper)
   */
  private async totDFS(
    problem: string,
    root: ThoughtNode,
    nodes: Map<string, ThoughtNode>,
    config: ToTConfig,
    stats: { nodesExpanded: number; maxDepthReached: number; backtrackCount: number; prunedCount: number }
  ): Promise<ThoughtNode | null> {
    const stack: ThoughtNode[] = [root];
    let bestSolution: ThoughtNode | null = null;
    let iterations = 0;

    while (stack.length > 0 && iterations < config.maxIterations) {
      iterations++;
      const node = stack.pop()!;
      stats.nodesExpanded++;
      stats.maxDepthReached = Math.max(stats.maxDepthReached, node.depth);

      // Evaluate current node
      const evaluated = await this.evaluateState(problem, node, config.evalMethod);
      node.value = evaluated.value;
      node.isTerminal = evaluated.isTerminal;
      node.isValid = evaluated.isValid;

      // Check for terminal solution
      if (node.isTerminal && node.isValid) {
        if (!bestSolution || node.value > bestSolution.value) {
          bestSolution = node;
        }
        continue;  // Backtrack to find potentially better solutions
      }

      // Prune invalid or low-value paths
      if (!node.isValid || node.value < config.pruneThreshold) {
        stats.prunedCount++;
        if (config.enableBacktracking) {
          stats.backtrackCount++;
        }
        continue;
      }

      // Depth limit
      if (node.depth >= config.maxDepth) {
        continue;
      }

      // Generate children
      const thoughts = await this.generateThoughts(problem, node, config.branchingFactor);

      for (const thought of thoughts) {
        const childNode = this.createNode(thought, this.applyThought(node.state, thought), node.id, node.depth + 1);
        nodes.set(childNode.id, childNode);
        node.children.push(childNode.id);
        stack.push(childNode);
      }
    }

    return bestSolution;
  }

  /**
   * MCTS for Tree-of-Thought
   */
  private async totMCTS(
    problem: string,
    root: ThoughtNode,
    nodes: Map<string, ThoughtNode>,
    config: ToTConfig,
    stats: { nodesExpanded: number; maxDepthReached: number; backtrackCount: number; prunedCount: number }
  ): Promise<ThoughtNode | null> {
    for (let i = 0; i < config.maxIterations; i++) {
      // Selection: traverse tree using UCB1
      let current = root;
      const path: ThoughtNode[] = [current];

      while (current.children.length > 0) {
        const children = current.children.map(id => nodes.get(id)!);
        current = this.selectUCB(children, config.explorationConstant);
        path.push(current);
      }

      // Expansion: add new child if not terminal
      if (!current.isTerminal && current.depth < config.maxDepth) {
        const thoughts = await this.generateThoughts(problem, current, 1);
        if (thoughts.length > 0) {
          const childNode = this.createNode(
            thoughts[0],
            this.applyThought(current.state, thoughts[0]),
            current.id,
            current.depth + 1
          );
          nodes.set(childNode.id, childNode);
          current.children.push(childNode.id);
          current = childNode;
          path.push(current);
          stats.nodesExpanded++;
          stats.maxDepthReached = Math.max(stats.maxDepthReached, current.depth);
        }
      }

      // Simulation: evaluate leaf node
      const evaluated = await this.evaluateState(problem, current, config.evalMethod);
      current.value = evaluated.value;
      current.isTerminal = evaluated.isTerminal;
      current.isValid = evaluated.isValid;

      // Backpropagation: update visit counts and values
      for (const node of path) {
        node.visits++;
        // Average value update
        node.value = ((node.visits - 1) * node.value + evaluated.value) / node.visits;
      }
    }

    // Find best terminal node
    const allNodes = Array.from(nodes.values());
    const terminals = allNodes.filter(n => n.isTerminal && n.isValid);

    if (terminals.length > 0) {
      terminals.sort((a, b) => b.value - a.value);
      return terminals[0];
    }

    // Return highest value node
    allNodes.sort((a, b) => b.value - a.value);
    return allNodes[0] || null;
  }

  /**
   * Beam Search for Tree-of-Thought
   */
  private async totBeamSearch(
    problem: string,
    root: ThoughtNode,
    nodes: Map<string, ThoughtNode>,
    config: ToTConfig,
    stats: { nodesExpanded: number; maxDepthReached: number; backtrackCount: number; prunedCount: number }
  ): Promise<ThoughtNode | null> {
    let beam: ThoughtNode[] = [root];

    for (let depth = 0; depth < config.maxDepth && beam.length > 0; depth++) {
      stats.maxDepthReached = Math.max(stats.maxDepthReached, depth);
      const candidates: ThoughtNode[] = [];

      // Expand all nodes in beam
      for (const node of beam) {
        const thoughts = await this.generateThoughts(problem, node, config.branchingFactor);
        stats.nodesExpanded++;

        for (const thought of thoughts) {
          const childNode = this.createNode(thought, this.applyThought(node.state, thought), node.id, depth + 1);
          nodes.set(childNode.id, childNode);
          node.children.push(childNode.id);
          candidates.push(childNode);
        }
      }

      // Evaluate and score all candidates
      const evaluated = await this.evaluateStates(problem, candidates, config.evalMethod);

      // Check for terminal
      for (const node of evaluated) {
        if (node.isTerminal && node.isValid) {
          return node;
        }
      }

      // Keep top-b by value (beam search)
      evaluated.sort((a, b) => b.value - a.value);
      const pruned = evaluated.length - Math.min(evaluated.length, config.beamWidth);
      stats.prunedCount += pruned;
      beam = evaluated.slice(0, config.beamWidth);
    }

    // Return best from final beam
    return beam.length > 0 ? beam[0] : null;
  }

  /**
   * Generate k candidate thoughts from a state
   */
  private async generateThoughts(problem: string, node: ThoughtNode, k: number): Promise<string[]> {
    const prompt = TOT_THOUGHT_GENERATOR_PROMPT
      .replace('{k}', k.toString())
      .replace('{problem}', problem)
      .replace('{state}', node.state);

    const result = await this.llm.chat(prompt);

    // Parse thoughts
    const thoughts: string[] = [];
    const thoughtRegex = /<thought[^>]*>([\s\S]*?)<\/thought>/g;
    let match;
    while ((match = thoughtRegex.exec(result.content)) !== null) {
      thoughts.push(match[1].trim());
    }

    // If parsing failed, try to split by numbered list
    if (thoughts.length === 0) {
      const lines = result.content.split(/\n(?=\d+\.)/);
      for (const line of lines) {
        const cleaned = line.replace(/^\d+\.\s*/, '').trim();
        if (cleaned) thoughts.push(cleaned);
      }
    }

    return thoughts.slice(0, k);
  }

  /**
   * Evaluate a single state
   */
  private async evaluateState(
    problem: string,
    node: ThoughtNode,
    method: StateEvalMethod
  ): Promise<{ value: number; isTerminal: boolean; isValid: boolean }> {
    switch (method) {
      case 'prm':
        return this.evaluateWithPRM(problem, node);
      case 'entropy':
        return this.evaluateWithEntropy(problem, node);
      case 'vote':
        return this.evaluateWithVote(problem, [node]);
      default:
        return this.evaluateWithValue(problem, node);
    }
  }

  /**
   * Evaluate multiple states
   */
  private async evaluateStates(
    problem: string,
    nodes: ThoughtNode[],
    method: StateEvalMethod
  ): Promise<ThoughtNode[]> {
    try {
      for (const node of nodes) {
        const result = await this.evaluateState(problem, node, method);
        node.value = result.value;
        node.isTerminal = result.isTerminal;
        node.isValid = result.isValid;
      }
      return nodes;
    } catch (err) {
      console.error('[thinking] evaluateStates failed:', err);
      return nodes;
    }
  }

  /**
   * Value prompt evaluation (rate 1-10)
   */
  private async evaluateWithValue(
    problem: string,
    node: ThoughtNode
  ): Promise<{ value: number; isTerminal: boolean; isValid: boolean }> {
    try {
      const path = this.buildPathDescription(node);
      const prompt = TOT_STATE_EVALUATOR_PROMPT
        .replace('{problem}', problem)
        .replace('{state}', node.state)
        .replace('{path}', path);

      const result = await this.llm.chat(prompt);

      // Parse evaluation
      const evalMatch = result.content.match(/<eval>([\s\S]*?)<\/eval>/);
      if (evalMatch) {
        const content = evalMatch[1];
        const scoreMatch = content.match(/score:\s*(\d+)/i);
        const terminalMatch = content.match(/is_terminal:\s*(true|false)/i);
        const validMatch = content.match(/is_valid:\s*(true|false)/i);

        return {
          value: scoreMatch ? parseInt(scoreMatch[1]) / 10 : 0.5,
          isTerminal: terminalMatch ? terminalMatch[1].toLowerCase() === 'true' : false,
          isValid: validMatch ? validMatch[1].toLowerCase() === 'true' : true,
        };
      }

      return { value: 0.5, isTerminal: false, isValid: true };
    } catch (err) {
      console.error('[thinking] evaluateWithValue failed:', err);
      return { value: 0.5, isTerminal: false, isValid: true };
    }
  }

  /**
   * Vote-based evaluation
   */
  private async evaluateWithVote(
    problem: string,
    nodes: ThoughtNode[]
  ): Promise<{ value: number; isTerminal: boolean; isValid: boolean }> {
    try {
      if (nodes.length === 1) {
        return this.evaluateWithValue(problem, nodes[0]);
      }

      const statesStr = nodes.map((n, i) =>
        `State ${i + 1}:\n${n.state}`
      ).join('\n\n');

      const prompt = TOT_VOTE_PROMPT
        .replace('{problem}', problem)
        .replace('{states}', statesStr);

      const result = await this.llm.chat(prompt);

      // Parse vote
      const voteMatch = result.content.match(/<vote>([\s\S]*?)<\/vote>/);
      if (voteMatch) {
        const content = voteMatch[1];
        const bestMatch = content.match(/best:\s*(\d+)/i);
        const bestIndex = bestMatch ? parseInt(bestMatch[1]) - 1 : 0;

        // The voted node gets higher value
        for (let i = 0; i < nodes.length; i++) {
          nodes[i].value = i === bestIndex ? 0.9 : 0.5;
        }
      }

      return { value: nodes[0].value, isTerminal: false, isValid: true };
    } catch (err) {
      console.error('[thinking] evaluateWithVote failed:', err);
      return { value: 0.5, isTerminal: false, isValid: true };
    }
  }

  // ==========================================================================
  // v7.7: Process Reward Model (PRM)
  // ==========================================================================

  /**
   * Evaluate state using Process Reward Model
   */
  private async evaluateWithPRM(
    problem: string,
    node: ThoughtNode
  ): Promise<{ value: number; isTerminal: boolean; isValid: boolean }> {
    try {
      const path = this.buildPathDescription(node);

      const prompt = PRM_STEP_VERIFICATION_PROMPT
        .replace('{problem}', problem)
        .replace('{previous}', path)
        .replace('{step}', node.thought);

      const result = await this.llm.chat(prompt);

      // Parse verification
      const verifyMatch = result.content.match(/<verification>([\s\S]*?)<\/verification>/);
      if (verifyMatch) {
        const content = verifyMatch[1];
        const scoreMatch = content.match(/score:\s*([\d.]+)/i);
        const validMatch = content.match(/valid:\s*(true|false)/i);

        const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0.5;
        const valid = validMatch ? validMatch[1].toLowerCase() === 'true' : true;

        node.metadata.prmScore = score;

        return {
          value: score,
          isTerminal: score > 0.95,  // High confidence = potentially terminal
          isValid: valid && score >= this.config.prmConfig.minStepScore,
        };
      }

      return { value: 0.5, isTerminal: false, isValid: true };
    } catch (err) {
      console.error('[thinking] evaluateWithPRM failed:', err);
      return { value: 0.5, isTerminal: false, isValid: true };
    }
  }

  /**
   * Verify a complete reasoning chain with PRM
   */
  async verifyChainWithPRM(problem: string, steps: string[]): Promise<{
    valid: boolean;
    stepScores: number[];
    aggregateScore: number;
    errors: string[];
  }> {
    const stepScores: number[] = [];
    const errors: string[] = [];

    for (let i = 0; i < steps.length; i++) {
      const previous = steps.slice(0, i).join('\n');
      const prompt = PRM_STEP_VERIFICATION_PROMPT
        .replace('{problem}', problem)
        .replace('{previous}', previous || 'None')
        .replace('{step}', steps[i]);

      const result = await this.llm.chat(prompt);

      const verifyMatch = result.content.match(/<verification>([\s\S]*?)<\/verification>/);
      if (verifyMatch) {
        const content = verifyMatch[1];
        const scoreMatch = content.match(/score:\s*([\d.]+)/i);
        const errorsMatch = content.match(/errors:\s*(.+)/i);

        stepScores.push(scoreMatch ? parseFloat(scoreMatch[1]) : 0.5);
        if (errorsMatch && !errorsMatch[1].toLowerCase().includes('none')) {
          errors.push(`Step ${i + 1}: ${errorsMatch[1]}`);
        }
      } else {
        stepScores.push(0.5);
      }
    }

    // Aggregate based on config
    let aggregateScore: number;
    switch (this.config.prmConfig.aggregationMethod) {
      case 'min':
        aggregateScore = Math.min(...stepScores);
        break;
      case 'product':
        aggregateScore = stepScores.reduce((a, b) => a * b, 1);
        break;
      default:
        aggregateScore = stepScores.reduce((a, b) => a + b, 0) / stepScores.length;
    }

    return {
      valid: aggregateScore >= this.config.prmConfig.minStepScore && errors.length === 0,
      stepScores,
      aggregateScore,
      errors,
    };
  }

  // ==========================================================================
  // v7.11: Math-Shepherd Process Reward Model
  // Based on arXiv:2312.08935 - Verify and Reinforce LLMs Step-by-step
  // ==========================================================================

  /**
   * Complete N reasoning paths from an intermediate step
   * Core of Math-Shepherd: evaluate step by completing to answer
   */
  private async completeFromStep(
    problem: string,
    stepsSoFar: string[],
    goldenAnswer: string,
    numCompletions: number = 4
  ): Promise<CompletionResult[]> {
    const results: CompletionResult[] = [];
    const stepsStr = stepsSoFar.join('\n');

    for (let i = 0; i < numCompletions; i++) {
      const prompt = MATH_SHEPHERD_COMPLETION_PROMPT
        .replace('{problem}', problem)
        .replace('{steps_so_far}', stepsStr || 'None');

      try {
        const response = await this.llm.chat(prompt);
        const content = response.content;

        // Extract completion
        const completionMatch = content.match(/<completion>([\s\S]*?)<\/completion>/);
        const answerMatch = content.match(/<final_answer>([\s\S]*?)<\/final_answer>/);

        const completion = completionMatch?.[1]?.trim() || content;
        const answer = answerMatch?.[1]?.trim() || this.extractAnswerSimple(completion);

        // Check correctness
        const isCorrect = await this.compareAnswers(answer, goldenAnswer);

        results.push({
          steps: this.splitStepsSimple(completion),
          answer,
          isCorrect,
          tokens: this.estimateTokens(prompt + content),
        });
      } catch (error) {
        // Count failed completions as incorrect
        results.push({
          steps: [],
          answer: '',
          isCorrect: false,
          tokens: 0,
        });
      }
    }

    return results;
  }

  /**
   * Score a single step using Math-Shepherd completion-based verification
   */
  async scoreStepWithMathShepherd(
    problem: string,
    steps: string[],
    stepIndex: number,
    goldenAnswer: string
  ): Promise<StepScore> {
    try {
      const config = this.config.mathShepherdConfig;
      const stepsSoFar = steps.slice(0, stepIndex + 1);
      const stepContent = steps[stepIndex];

      // Complete N paths from this step
      const completions = await this.completeFromStep(
        problem,
        stepsSoFar,
        goldenAnswer,
        config.numCompletions
      );

      // Calculate scores
      const correctCount = completions.filter(c => c.isCorrect).length;
      const hardScore = correctCount > 0 ? 1 : 0;
      const softScore = completions.length > 0 ? correctCount / completions.length : 0;

      return {
        stepIndex,
        content: stepContent,
        hardScore,
        softScore,
        numCompletions: completions.length,
        completions,
        hasPotential: hardScore === 1,
      };
    } catch (err) {
      console.error('[thinking] scoreStepWithMathShepherd failed:', err);
      return {
        stepIndex,
        content: steps[stepIndex] || '',
        hardScore: 0,
        softScore: 0,
        numCompletions: 0,
        completions: [],
        hasPotential: false,
      };
    }
  }

  /**
   * Score all steps in a solution using Math-Shepherd
   * Returns annotated solution with step-level scores
   */
  async annotateSolutionWithMathShepherd(
    problem: string,
    solution: string,
    goldenAnswer: string
  ): Promise<AnnotatedSolution> {
    const startTime = Date.now();
    const config = this.config.mathShepherdConfig;

    // Split solution into steps
    const steps = await this.splitSolutionIntoSteps(solution);
    const stepScores: StepScore[] = [];
    let totalTokens = 0;

    // Score each step
    for (let i = 0; i < steps.length; i++) {
      const stepScore = await this.scoreStepWithMathShepherd(
        problem,
        steps,
        i,
        goldenAnswer
      );
      stepScores.push(stepScore);
      totalTokens += stepScore.completions.reduce((sum, c) => sum + c.tokens, 0);

      // Early termination if step has no potential
      if (config.earlyTermination && !stepScore.hasPotential) {
        // Fill remaining steps with zero scores
        for (let j = i + 1; j < steps.length; j++) {
          stepScores.push({
            stepIndex: j,
            content: steps[j],
            hardScore: 0,
            softScore: 0,
            numCompletions: 0,
            completions: [],
            hasPotential: false,
          });
        }
        break;
      }
    }

    // Aggregate solution score
    const scores = stepScores.map(s =>
      config.scoringMethod === 'hard' ? s.hardScore : s.softScore
    );
    let solutionScore: number;

    switch (config.aggregationMethod) {
      case 'min':
        solutionScore = Math.min(...scores);
        break;
      case 'product':
        solutionScore = scores.reduce((a, b) => a * b, 1);
        break;
      default:
        solutionScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    }

    // Extract final answer
    const finalAnswer = this.extractAnswerSimple(steps[steps.length - 1] || '');
    const isCorrect = await this.compareAnswers(finalAnswer, goldenAnswer);

    return {
      problem,
      goldenAnswer,
      steps,
      stepScores,
      solutionScore,
      finalAnswer,
      isCorrect,
      totalTokens,
      processingTime: Date.now() - startTime,
    };
  }

  /**
   * Rank multiple solutions using Math-Shepherd PRM
   * Best-of-N selection: return highest scoring solution
   */
  async rankSolutionsWithMathShepherd(
    problem: string,
    solutions: string[],
    goldenAnswer?: string
  ): Promise<SolutionRanking> {
    const startTime = Date.now();
    const annotatedSolutions: AnnotatedSolution[] = [];

    // If no golden answer, use first extraction as reference
    let referenceAnswer = goldenAnswer;
    if (!referenceAnswer && solutions.length > 0) {
      referenceAnswer = this.extractAnswerSimple(solutions[0]);
    }

    // Annotate all solutions
    for (const solution of solutions) {
      const annotated = await this.annotateSolutionWithMathShepherd(
        problem,
        solution,
        referenceAnswer || ''
      );
      annotatedSolutions.push(annotated);
    }

    // Sort by solution score (descending)
    const rankedSolutions = [...annotatedSolutions].sort(
      (a, b) => b.solutionScore - a.solutionScore
    );

    // Statistics
    const totalTokens = annotatedSolutions.reduce((sum, s) => sum + s.totalTokens, 0);
    const avgScore = annotatedSolutions.reduce((sum, s) => sum + s.solutionScore, 0) / annotatedSolutions.length;
    const correctInTopK = rankedSolutions.filter(s => s.isCorrect).length;

    return {
      rankedSolutions,
      selectedIndex: annotatedSolutions.indexOf(rankedSolutions[0]),
      selected: rankedSolutions[0],
      rankingMethod: 'prm',
      stats: {
        totalCandidates: solutions.length,
        correctInTop1: rankedSolutions[0]?.isCorrect || false,
        correctInTopK,
        avgSolutionScore: avgScore,
        bestSolutionScore: rankedSolutions[0]?.solutionScore || 0,
        totalTokens,
        processingTime: Date.now() - startTime,
      },
    };
  }

  /**
   * Generate automatic process annotations for training PRMs
   * No human annotation needed - uses completion-based labeling
   */
  async generateProcessAnnotations(
    problem: string,
    solution: string,
    goldenAnswer: string,
    sourceModel: string = 'unknown'
  ): Promise<ProcessAnnotation> {
    try {
      const annotated = await this.annotateSolutionWithMathShepherd(
        problem,
        solution,
        goldenAnswer
      );

      return {
        problem,
        goldenAnswer,
        steps: annotated.steps,
        hardLabels: annotated.stepScores.map(s => s.hardScore),
        softLabels: annotated.stepScores.map(s => s.softScore),
        numCompletions: this.config.mathShepherdConfig.numCompletions,
        sourceModel,
        timestamp: new Date(),
      };
    } catch (err) {
      console.error('[thinking] generateProcessAnnotations failed:', err);
      return {
        problem,
        goldenAnswer,
        steps: [],
        hardLabels: [],
        softLabels: [],
        numCompletions: this.config.mathShepherdConfig.numCompletions,
        sourceModel,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Simple step splitting (fallback when LLM not needed)
   */
  private splitStepsSimple(solution: string): string[] {
    // Split on common step patterns
    const lines = solution.split(/\n/);
    const steps: string[] = [];
    let currentStep = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check if this starts a new step
      if (/^(Step\s*\d+|[\d]+[.):]|\*|\-|Therefore|Thus|So|Hence|Finally)/i.test(trimmed)) {
        if (currentStep) {
          steps.push(currentStep.trim());
        }
        currentStep = trimmed;
      } else {
        currentStep += '\n' + trimmed;
      }
    }

    if (currentStep) {
      steps.push(currentStep.trim());
    }

    // If no steps found, treat whole solution as one step
    if (steps.length === 0 && solution.trim()) {
      steps.push(solution.trim());
    }

    return steps;
  }

  /**
   * Split solution into steps using LLM (more accurate)
   */
  private async splitSolutionIntoSteps(solution: string): Promise<string[]> {
    // Try simple split first
    const simpleSteps = this.splitStepsSimple(solution);
    if (simpleSteps.length > 1) {
      return simpleSteps;
    }

    // Use LLM for complex solutions
    try {
      const prompt = MATH_SHEPHERD_SPLIT_STEPS_PROMPT.replace('{solution}', solution);
      const response = await this.llm.chat(prompt);

      const stepsMatch = response.content.match(/<steps>([\s\S]*?)<\/steps>/);
      if (stepsMatch) {
        const stepsText = stepsMatch[1];
        const steps = stepsText
          .split(/\n/)
          .map(line => line.replace(/^\d+[.):\s]+/, '').trim())
          .filter(line => line.length > 0);
        if (steps.length > 0) {
          return steps;
        }
      }
    } catch (err) {
      // Fallback to simple split
      console.error('[Thinking] Step extraction error:', err);
    }

    return simpleSteps;
  }

  /**
   * Extract answer from text (simple heuristic)
   */
  private extractAnswerSimple(text: string): string {
    // Look for common answer patterns
    const patterns = [
      /(?:answer|result|solution|=)\s*[:=]?\s*([^\n.]+)/i,
      /(?:therefore|thus|so|hence)\s*[:,]?\s*([^\n.]+)/i,
      /\*\*([^*]+)\*\*/,  // Bold text
      /(?:^|\n)([+-]?\d+(?:\.\d+)?(?:\/\d+)?)\s*$/m,  // Number at end
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // Return last line as fallback
    const lines = text.trim().split('\n');
    return lines[lines.length - 1].trim();
  }

  /**
   * Compare two answers for equivalence
   */
  private async compareAnswers(answer1: string, answer2: string): Promise<boolean> {
    // Quick string comparison
    const norm1 = this.normalizeAnswer(answer1);
    const norm2 = this.normalizeAnswer(answer2);
    if (norm1 === norm2) return true;

    // Try numeric comparison
    const num1 = parseFloat(norm1.replace(/[^0-9.-]/g, ''));
    const num2 = parseFloat(norm2.replace(/[^0-9.-]/g, ''));
    if (!isNaN(num1) && !isNaN(num2) && Math.abs(num1 - num2) < 0.001) {
      return true;
    }

    // Use LLM for complex comparisons (if answers look different)
    if (norm1 !== norm2 && answer1.length > 2 && answer2.length > 2) {
      try {
        const prompt = MATH_SHEPHERD_COMPARE_ANSWERS_PROMPT
          .replace('{answer1}', answer1)
          .replace('{answer2}', answer2);
        const response = await this.llm.chat(prompt);

        const match = response.content.match(/equivalent:\s*(true|false)/i);
        if (match) {
          return match[1].toLowerCase() === 'true';
        }
      } catch (err) {
        // Fallback to string comparison
        console.error('[Thinking] LLM equivalence check error:', err);
      }
    }

    return false;
  }

  /**
   * Normalize answer for comparison
   */
  private normalizeAnswer(answer: string): string {
    return answer
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.,;:!?]+$/, '')
      .replace(/^the\s+/i, '')
      .replace(/\$|\\|{|}/g, '')
      .trim();
  }

  // ==========================================================================
  // v7.12: Conditional Reward Modeling (CRM)
  // Based on arXiv:2509.26578 - "Linking Process to Outcome"
  // ==========================================================================

  /**
   * Estimate conditional error probability h(t) for a single step
   * h(t) = P(wrong at step t | correct up to step t-1)
   *
   * This is the core CRM innovation: each step is evaluated CONDITIONED ON
   * all preceding steps being correct, creating explicit outcome linkage.
   */
  async estimateConditionalErrorProb(
    problem: string,
    precedingSteps: string[],
    currentStep: string,
    goldenAnswer?: string
  ): Promise<{ errorProb: number; confidence: number; reasoning: string }> {
    try {
      const config = this.config.crmConfig;

      if (config.estimationMethod === 'completion') {
        // Completion-based estimation (like Math-Shepherd)
        return this.estimateErrorProbViaCompletion(
          problem,
          precedingSteps,
          currentStep,
          goldenAnswer,
          config.numCompletions
        );
      }

      // LLM-based direct estimation
      const precedingContext = precedingSteps.length > 0
        ? precedingSteps.map((s, i) => `Step ${i + 1}: ${s}`).join('\n')
        : '(This is the first step)';

      const prompt = CRM_ESTIMATE_ERROR_PROB_PROMPT
        .replace('{problem}', problem)
        .replace('{preceding_steps}', precedingContext)
        .replace('{current_step}', currentStep)
        .replace('{step_number}', String(precedingSteps.length + 1));

      const result = await this.llm.chat(prompt);
      const parsed = this.parseErrorProbResponse(result.content);

      return {
        errorProb: Math.max(0, Math.min(1, parsed.errorProb)),
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
      };
    } catch (err) {
      console.error('[thinking] estimateConditionalErrorProb failed:', err);
      return { errorProb: 0.5, confidence: 0.0, reasoning: 'Error estimation failed' };
    }
  }

  /**
   * Estimate error probability via Monte Carlo completion rollouts
   * Similar to Math-Shepherd but for conditional probability estimation
   */
  private async estimateErrorProbViaCompletion(
    problem: string,
    precedingSteps: string[],
    currentStep: string,
    goldenAnswer: string | undefined,
    numCompletions: number
  ): Promise<{ errorProb: number; confidence: number; reasoning: string }> {
    const config = this.config.crmConfig;

    // Build context up to and including current step
    let context = `Problem: ${problem}\n\n`;
    for (let i = 0; i < precedingSteps.length; i++) {
      context += `Step ${i + 1}: ${precedingSteps[i]}\n`;
    }
    context += `Step ${precedingSteps.length + 1}: ${currentStep}\n`;

    // Generate completions
    const prompt = MATH_SHEPHERD_COMPLETION_PROMPT
      .replace('{problem}', problem)
      .replace('{partial_solution}', context);

    let correctCompletions = 0;
    const errors: string[] = [];

    for (let i = 0; i < numCompletions; i++) {
      const result = await this.llm.chat(prompt);
      const answer = this.extractAnswerSimple(result.content);

      if (goldenAnswer) {
        const isCorrect = this.normalizeAnswer(answer) === this.normalizeAnswer(goldenAnswer);
        if (isCorrect) correctCompletions++;
        else errors.push(`Completion ${i + 1} got: ${answer}`);
      } else {
        // Without golden answer, use heuristic validation
        const parsed = this.parseErrorProbResponse(result.content);
        if (parsed.errorProb < 0.5) correctCompletions++;
      }
    }

    // Error prob = 1 - (correct / total)
    const errorProb = 1 - (correctCompletions / numCompletions);

    return {
      errorProb,
      confidence: Math.min(0.95, 0.5 + (numCompletions / 20)),
      reasoning: errors.length > 0
        ? `${correctCompletions}/${numCompletions} completions correct. Issues: ${errors.slice(0, 2).join('; ')}`
        : `${correctCompletions}/${numCompletions} completions reached correct answer`,
    };
  }

  /**
   * Parse error probability response from LLM
   */
  private parseErrorProbResponse(
    content: string
  ): { errorProb: number; confidence: number; reasoning: string } {
    // Default values
    let errorProb = 0.5;
    let confidence = 0.5;
    let reasoning = 'Unable to parse response';

    // Extract error_probability
    const probMatch = content.match(/error_probability:\s*([\d.]+)/i);
    if (probMatch) {
      errorProb = parseFloat(probMatch[1]);
    }

    // Extract confidence
    const confMatch = content.match(/confidence:\s*([\d.]+)/i);
    if (confMatch) {
      confidence = parseFloat(confMatch[1]);
    }

    // Extract reasoning
    const reasonMatch = content.match(/reasoning:\s*(.+?)(?:\n|potential_issues|$)/is);
    if (reasonMatch) {
      reasoning = reasonMatch[1].trim();
    }

    return { errorProb, confidence, reasoning };
  }

  /**
   * Compute survival probability S(t) for reaching step t correctly
   * S(t) = ∏(1 - h(k)) for k = 1 to t
   *
   * This represents the probability that we reach step t with all
   * preceding steps being correct - the core outcome linkage mechanism.
   */
  computeSurvivalProbability(conditionalErrorProbs: number[]): number[] {
    const survival: number[] = [];
    let cumulative = 1.0;

    for (const h of conditionalErrorProbs) {
      cumulative *= (1 - h);
      survival.push(cumulative);
    }

    return survival;
  }

  /**
   * Compute process reward r_t for step t
   * r_t = log(1 - h(t))
   *
   * This is PBRS-derived (Potential-Based Reward Shaping) ensuring:
   * - Optimal policy invariance
   * - Consistent credit assignment
   * - Robustness to reward hacking
   */
  computeProcessReward(conditionalErrorProb: number): number {
    // Clamp to avoid log(0)
    const clampedProb = Math.max(0.001, Math.min(0.999, 1 - conditionalErrorProb));
    return Math.log(clampedProb);
  }

  /**
   * Score a complete trajectory using CRM
   *
   * Returns detailed step-by-step analysis with:
   * - h(t): conditional error probability
   * - S(t): survival probability
   * - r_t: process reward
   * - W(t): cumulative error probability (complement of S(t))
   */
  async scoreTrajectoryWithCRM(
    problem: string,
    solution: string,
    goldenAnswer?: string
  ): Promise<CRMTrajectoryResult> {
    const config = this.config.crmConfig;
    const stepStrings = await this.splitSolutionIntoSteps(solution);
    const steps = stepStrings.map((content, i) => ({ stepNumber: i + 1, content }));
    const stepScores: ConditionalStepScore[] = [];

    const conditionalErrorProbs: number[] = [];
    const precedingSteps: string[] = [];

    // Score each step
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // Estimate h(t)
      const { errorProb, confidence } = await this.estimateConditionalErrorProb(
        problem,
        precedingSteps,
        step.content,
        goldenAnswer
      );

      conditionalErrorProbs.push(errorProb);

      // Compute S(t) up to this point
      const survivalProbs = this.computeSurvivalProbability(conditionalErrorProbs);
      const survivalProb = survivalProbs[survivalProbs.length - 1];

      // Compute r_t
      const processReward = this.computeProcessReward(errorProb);

      // W(t) = 1 - S(t)
      const cumulativeErrorProb = 1 - survivalProb;

      stepScores.push({
        stepIndex: i,
        content: step.content,
        conditionalErrorProb: errorProb,
        conditionalCorrectProb: 1 - errorProb,
        survivalProb,
        processReward,
        cumulativeErrorProb,
        rawConfidence: confidence,
      });

      // Early termination if survival prob drops too low
      if (config.earlyTermination && survivalProb < config.survivalThreshold) {
        break;
      }

      precedingSteps.push(step.content);
    }

    // Compute trajectory-level scores
    const finalSurvival = stepScores.length > 0
      ? stepScores[stepScores.length - 1].survivalProb
      : 0;

    const totalProcessReward = stepScores.reduce(
      (sum, s) => sum + s.processReward,
      0
    );

    // Check if final answer is correct (if golden answer provided)
    let hasCorrectAnswer = false;
    if (goldenAnswer) {
      const finalAnswer = this.extractAnswerSimple(solution);
      hasCorrectAnswer = this.normalizeAnswer(finalAnswer) === this.normalizeAnswer(goldenAnswer);
    }

    return {
      problem,
      solution,
      stepScores,
      trajectoryScore: config.trajectoryScoring === 'product'
        ? finalSurvival
        : totalProcessReward,
      finalSurvivalProb: finalSurvival,
      totalProcessReward,
      hasCorrectAnswer,
      scoringMethod: 'crm',
      stepsAnalyzed: stepScores.length,
      earlyTerminated: stepScores.length < steps.length,
    };
  }

  /**
   * CRM-guided beam search for solution generation
   *
   * Uses survival probability S(t) to guide beam selection,
   * preferring trajectories most likely to reach correct answer.
   */
  async crmBeamSearch(
    problem: string,
    goldenAnswer?: string,
    beamWidth: number = 3,
    maxDepth: number = 10
  ): Promise<CRMBeamSearchResult> {
    const config = this.config.crmConfig;
    const startTime = Date.now();

    // Initialize beam with empty trajectory
    let beam: CRMBeamCandidate[] = [{
      steps: [],
      survivalProb: 1.0,
      processRewardSum: 0,
      stepScores: [],
    }];

    // Expand beam iteratively
    for (let depth = 0; depth < maxDepth; depth++) {
      const nextBeam: CRMBeamCandidate[] = [];

      for (const candidate of beam) {
        // Generate next step candidates
        const precedingContext = candidate.steps.map((s, i) =>
          `Step ${i + 1}: ${s}`
        ).join('\n');

        const prompt = `Problem: ${problem}

${precedingContext ? `Previous steps:\n${precedingContext}\n\n` : ''}Generate the next reasoning step. If the problem is solved, write "Final Answer: [answer]".

Next step:`;

        // Sample multiple continuations
        const continuations: string[] = [];
        for (let i = 0; i < Math.min(beamWidth, 3); i++) {
          const result = await this.llm.chat(prompt);
          const nextStep = result.content.trim().split('\n')[0];
          if (!continuations.includes(nextStep)) {
            continuations.push(nextStep);
          }
        }

        // Score each continuation
        for (const nextStep of continuations) {
          const { errorProb, confidence } = await this.estimateConditionalErrorProb(
            problem,
            candidate.steps,
            nextStep,
            goldenAnswer
          );

          const newSurvival = candidate.survivalProb * (1 - errorProb);
          const processReward = this.computeProcessReward(errorProb);

          // Check for terminal state
          const isTerminal = nextStep.toLowerCase().includes('final answer') ||
                            nextStep.toLowerCase().includes('therefore') ||
                            nextStep.toLowerCase().includes('the answer is');

          const newCandidate: CRMBeamCandidate = {
            steps: [...candidate.steps, nextStep],
            survivalProb: newSurvival,
            processRewardSum: candidate.processRewardSum + processReward,
            stepScores: [...candidate.stepScores, {
              stepIndex: candidate.steps.length,
              content: nextStep,
              conditionalErrorProb: errorProb,
              conditionalCorrectProb: 1 - errorProb,
              survivalProb: newSurvival,
              processReward,
              cumulativeErrorProb: 1 - newSurvival,
              rawConfidence: confidence,
            }],
            isTerminal,
          };

          nextBeam.push(newCandidate);
        }
      }

      // Prune beam to top-k by survival probability
      nextBeam.sort((a, b) => b.survivalProb - a.survivalProb);
      beam = nextBeam.slice(0, beamWidth);

      // Early exit if best candidate is terminal
      if (beam.length > 0 && beam[0].isTerminal) {
        break;
      }

      // Early termination if all survival probs too low
      if (beam.every(c => c.survivalProb < config.survivalThreshold)) {
        break;
      }
    }

    // Select best solution
    const best = beam[0];
    const solution = best.steps.map((s, i) => `Step ${i + 1}: ${s}`).join('\n');

    // Check correctness
    let hasCorrectAnswer = false;
    if (goldenAnswer) {
      const finalAnswer = this.extractAnswerSimple(solution);
      hasCorrectAnswer = this.normalizeAnswer(finalAnswer) === this.normalizeAnswer(goldenAnswer);
    }

    return {
      bestSolution: solution,
      bestCandidate: best,
      allCandidates: beam,
      hasCorrectAnswer,
      beamWidth,
      maxDepth,
      actualDepth: best.steps.length,
      processingTime: Date.now() - startTime,
    };
  }

  /**
   * Compare two trajectories using CRM
   * Returns the one with higher survival probability
   */
  async compareTrajectories(
    problem: string,
    solution1: string,
    solution2: string,
    goldenAnswer?: string
  ): Promise<{
    winner: 1 | 2;
    trajectory1: CRMTrajectoryResult;
    trajectory2: CRMTrajectoryResult;
    margin: number;
  }> {
    try {
      const [traj1, traj2] = await Promise.all([
        this.scoreTrajectoryWithCRM(problem, solution1, goldenAnswer),
        this.scoreTrajectoryWithCRM(problem, solution2, goldenAnswer),
      ]);

      const winner = traj1.trajectoryScore >= traj2.trajectoryScore ? 1 : 2;
      const margin = Math.abs(traj1.trajectoryScore - traj2.trajectoryScore);

      return { winner, trajectory1: traj1, trajectory2: traj2, margin };
    } catch (err) {
      console.error('[thinking] compareTrajectories failed:', err);
      throw err;
    }
  }

  /**
   * Best-of-N selection using CRM
   * Superior to Math-Shepherd due to cross-sample comparability
   */
  async selectBestOfNWithCRM(
    problem: string,
    solutions: string[],
    goldenAnswer?: string
  ): Promise<{
    selectedIndex: number;
    selected: CRMTrajectoryResult;
    allResults: CRMTrajectoryResult[];
    stats: {
      avgSurvival: number;
      maxSurvival: number;
      correctCount: number;
    };
  }> {
    try {
      // Score all solutions
      const results = await Promise.all(
        solutions.map(s => this.scoreTrajectoryWithCRM(problem, s, goldenAnswer))
      );

      // Find best by trajectory score (survival probability)
      let selectedIndex = 0;
      let maxScore = -Infinity;

      for (let i = 0; i < results.length; i++) {
        if (results[i].trajectoryScore > maxScore) {
          maxScore = results[i].trajectoryScore;
          selectedIndex = i;
        }
      }

      // Compute stats
      const avgSurvival = results.reduce((s, r) => s + r.finalSurvivalProb, 0) / results.length;
      const maxSurvival = Math.max(...results.map(r => r.finalSurvivalProb));
      const correctCount = results.filter(r => r.hasCorrectAnswer).length;

      return {
        selectedIndex,
        selected: results[selectedIndex],
        allResults: results,
        stats: { avgSurvival, maxSurvival, correctCount },
      };
    } catch (err) {
      console.error('[thinking] selectBestOfNWithCRM failed:', err);
      return {
        selectedIndex: 0,
        selected: {} as CRMTrajectoryResult,
        allResults: [],
        stats: { avgSurvival: 0, maxSurvival: 0, correctCount: 0 },
      };
    }
  }

  // ==========================================================================
  // v7.7: CoT Entropy (Uncertainty-aware Verification)
  // ==========================================================================

  /**
   * Evaluate state using CoT Entropy
   * Based on arXiv:2502.11250
   */
  private async evaluateWithEntropy(
    problem: string,
    node: ThoughtNode
  ): Promise<{ value: number; isTerminal: boolean; isValid: boolean }> {
    try {
      const entropy = await this.computeCoTEntropy(problem);
      node.metadata.entropy = entropy;

      // High entropy = uncertain = lower value
      const value = 1 - entropy;
      const valid = entropy < this.config.entropyConfig.rejectThreshold;

      return {
        value,
        isTerminal: value > 0.9,
        isValid: valid,
      };
    } catch (err) {
      console.error('[thinking] evaluateWithEntropy failed:', err);
      return {
        value: 0.5,
        isTerminal: false,
        isValid: false,
      };
    }
  }

  /**
   * Compute Chain-of-Thought Entropy
   * CoTE(x) = -Σ p(answer) log p(answer)
   */
  async computeCoTEntropy(problem: string): Promise<number> {
    try {
      const numSamples = this.config.entropyConfig.numSamples;
      const answers: string[] = [];

      // Sample multiple rationales
      for (let i = 0; i < numSamples; i++) {
        const prompt = COT_ENTROPY_SAMPLE_PROMPT.replace('{problem}', problem);
        const result = await this.llm.chat(prompt);

        // Extract answer
        const answerMatch = result.content.match(/<answer>([\s\S]*?)<\/answer>/);
        if (answerMatch) {
          answers.push(answerMatch[1].trim().toLowerCase());
        }
      }

      if (answers.length === 0) return 1;  // Max uncertainty

      // Cluster answers (simple: exact match)
      const clusters = new Map<string, number>();
      for (const answer of answers) {
        clusters.set(answer, (clusters.get(answer) || 0) + 1);
      }

      // Compute entropy
      let entropy = 0;
      const total = answers.length;
      for (const count of clusters.values()) {
        const p = count / total;
        if (p > 0) {
          entropy -= p * Math.log2(p);
        }
      }

      // Normalize to 0-1 (max entropy is log2(numSamples))
      const maxEntropy = Math.log2(numSamples);
      return maxEntropy > 0 ? entropy / maxEntropy : 0;
    } catch (err) {
      console.error('[thinking] computeCoTEntropy failed:', err);
      return 1; // Max uncertainty on error
    }
  }

  // ==========================================================================
  // v7.7: Dynamic Compute Budgeting
  // ==========================================================================

  /**
   * Estimate problem difficulty
   */
  async estimateDifficulty(problem: string): Promise<{
    level: 'easy' | 'medium' | 'hard' | 'very_hard';
    estimatedSteps: number;
    reasoningType: string;
    budget: number;
  }> {
    try {
      const prompt = DIFFICULTY_ESTIMATION_PROMPT.replace('{problem}', problem);
      const result = await this.llm.chat(prompt);

      let level: 'easy' | 'medium' | 'hard' | 'very_hard' = 'medium';
      let estimatedSteps = 3;
      let reasoningType = 'logical';

      const diffMatch = result.content.match(/<difficulty>([\s\S]*?)<\/difficulty>/);
      if (diffMatch) {
        const content = diffMatch[1];
        const levelMatch = content.match(/level:\s*(easy|medium|hard|very_hard)/i);
        const stepsMatch = content.match(/estimated_steps:\s*(\d+)/i);
        const typeMatch = content.match(/reasoning_type:\s*(\w+)/i);

        if (levelMatch) level = levelMatch[1].toLowerCase() as typeof level;
        if (stepsMatch) estimatedSteps = parseInt(stepsMatch[1]);
        if (typeMatch) reasoningType = typeMatch[1];
      }

      // Calculate budget based on difficulty
      const config = this.config.computeBudgetConfig;
      const budgetScale = {
        easy: 0,
        medium: 0.33,
        hard: 0.66,
        very_hard: 1,
      };
      const budget = config.minBudget +
        (config.maxBudget - config.minBudget) * budgetScale[level];

      return { level, estimatedSteps, reasoningType, budget: Math.round(budget) };
    } catch (err) {
      console.error('[thinking] estimateDifficulty failed:', err);
      return { level: 'medium', estimatedSteps: 3, reasoningType: 'logical', budget: 1000 };
    }
  }

  // ==========================================================================
  // v7.7: Helper Methods
  // ==========================================================================

  /**
   * Create a new thought node
   */
  private createNode(thought: string, state: string, parent: string | null, depth: number): ThoughtNode {
    return {
      id: `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      thought,
      state: state || thought,  // If no state, use thought as state
      parent,
      children: [],
      depth,
      value: 0,
      visits: 0,
      isTerminal: false,
      isValid: true,
      metadata: {
        generatedAt: Date.now(),
      },
    };
  }

  /**
   * Apply thought to state (simple concatenation for now)
   */
  private applyThought(state: string, thought: string): string {
    return state ? `${state}\n\nStep: ${thought}` : thought;
  }

  /**
   * Build path description from root to node
   */
  private buildPathDescription(node: ThoughtNode): string {
    // For simplicity, just return current state
    // In full impl, traverse parent chain
    return node.state;
  }

  /**
   * UCB1 selection for MCTS
   */
  private selectUCB(nodes: ThoughtNode[], c: number): ThoughtNode {
    const totalVisits = nodes.reduce((sum, n) => sum + n.visits, 0);

    let best: ThoughtNode | null = null;
    let bestUCB = -Infinity;

    for (const node of nodes) {
      const ucb = node.visits === 0
        ? Infinity  // Explore unvisited nodes first
        : node.value + c * Math.sqrt(Math.log(totalVisits) / node.visits);

      if (ucb > bestUCB) {
        bestUCB = ucb;
        best = node;
      }
    }

    return best || nodes[0];
  }

  // ==========================================================================
  // v7.8: Graph-of-Thoughts (GoT)
  // Based on arXiv:2308.09687 by Besta et al. (ETH Zurich)
  // Key advantage: Aggregation (k → 1) not possible in Tree-of-Thought
  // ==========================================================================

  /**
   * Graph-of-Thoughts reasoning
   * Unlike ToT, GoT enables:
   * - Aggregation: Combine multiple thoughts into one
   * - Refinement loops: Iteratively improve thoughts
   * - Arbitrary graph structure (not just tree)
   */
  async graphOfThought(problem: string): Promise<GoTResult> {
    const startTime = Date.now();
    const config = this.config.gotConfig;

    // Initialize graph
    const nodes = new Map<string, GoTNode>();
    const edges: Array<{ from: string; to: string }> = [];

    const stats = {
      totalNodes: 0,
      aggregations: 0,
      refinements: 0,
      generations: 0,
    };

    // Phase 1: Decompose problem into sub-problems
    const subProblems = await this.gotDecompose(problem, config.decompositionDepth);
    stats.generations++;

    // Create initial nodes for each sub-problem
    const initialNodes: GoTNode[] = [];
    for (const subProblem of subProblems) {
      const node = this.createGoTNode(subProblem, null);
      nodes.set(node.id, node);
      initialNodes.push(node);
      stats.totalNodes++;
    }

    // Phase 2: Solve each sub-problem (generate thoughts)
    const solutionNodes: GoTNode[] = [];
    for (const node of initialNodes) {
      // Generate solution for this sub-problem
      const thoughts = await this.generateThoughts(problem, node, 1);
      if (thoughts.length > 0) {
        const solutionNode = this.createGoTNode(thoughts[0], node.id);
        solutionNode.parents = [node.id];
        nodes.set(solutionNode.id, solutionNode);
        edges.push({ from: node.id, to: solutionNode.id });
        solutionNodes.push(solutionNode);
        stats.totalNodes++;
        stats.generations++;
      }
    }

    // Phase 3: Refine solutions (self-loops)
    let refinedNodes = solutionNodes;
    if (config.enableRefinementLoops) {
      refinedNodes = [];
      for (const node of solutionNodes) {
        const refined = await this.gotRefine(problem, node, config.maxRefinements);
        nodes.set(refined.id, refined);
        edges.push({ from: node.id, to: refined.id });
        refinedNodes.push(refined);
        stats.refinements += refined.refinementCount;
        stats.totalNodes++;
      }
    }

    // Phase 4: Score all refined nodes
    for (const node of refinedNodes) {
      const score = await this.gotScore(problem, node);
      node.value = score.overall;
      node.isTerminal = score.isSolution;
    }

    // Phase 5: Aggregate solutions (k → 1)
    let finalNode: GoTNode;
    if (refinedNodes.length > 1) {
      finalNode = await this.gotAggregate(problem, refinedNodes, config.aggregationStrategy);
      finalNode.parents = refinedNodes.map(n => n.id);
      nodes.set(finalNode.id, finalNode);
      for (const node of refinedNodes) {
        edges.push({ from: node.id, to: finalNode.id });
      }
      stats.aggregations++;
      stats.totalNodes++;

      // Final scoring
      const finalScore = await this.gotScore(problem, finalNode);
      finalNode.value = finalScore.overall;
    } else {
      finalNode = refinedNodes[0] || this.createGoTNode('No solution found', null);
    }

    return {
      solution: finalNode.state,
      graph: {
        nodes: Array.from(nodes.values()),
        edges,
      },
      stats,
      confidence: finalNode.value,
      volume: refinedNodes.length,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Decompose problem into sub-problems
   */
  private async gotDecompose(problem: string, k: number): Promise<string[]> {
    try {
      const prompt = GOT_DECOMPOSE_PROMPT
        .replace('{problem}', problem)
        .replace('{k}', k.toString());

      const result = await this.llm.chat(prompt);

      // Parse sub-problems
      const subProblems: string[] = [];
      const subProblemRegex = /<subproblem[^>]*>([\s\S]*?)<\/subproblem>/g;
      let match;
      while ((match = subProblemRegex.exec(result.content)) !== null) {
        subProblems.push(match[1].trim());
      }

      // Fallback: if no tags found, treat whole response as one problem
      if (subProblems.length === 0) {
        subProblems.push(problem);
      }

      return subProblems;
    } catch (err) {
      console.error('[thinking] gotDecompose failed:', err);
      return [problem];
    }
  }

  /**
   * Aggregate multiple thoughts into one (k → 1)
   * This is the KEY advantage over Tree-of-Thought
   */
  private async gotAggregate(
    problem: string,
    nodes: GoTNode[],
    strategy: 'merge' | 'synthesize' | 'vote'
  ): Promise<GoTNode> {
    try {
      const solutionsStr = nodes.map((n, i) =>
        `Solution ${i + 1}:\n${n.state}`
      ).join('\n\n---\n\n');

      const prompt = GOT_AGGREGATE_PROMPT
        .replace('{problem}', problem)
        .replace('{solutions}', solutionsStr)
        .replace('{strategy}', strategy);

      const result = await this.llm.chat(prompt);

      // Parse aggregated solution
      const aggregatedMatch = result.content.match(/<aggregated>([\s\S]*?)<\/aggregated>/);
      const aggregated = aggregatedMatch ? aggregatedMatch[1].trim() : result.content;

      const node = this.createGoTNode(aggregated, null);
      node.aggregatedFrom = nodes.map(n => n.id);

      return node;
    } catch (err) {
      console.error('[thinking] gotAggregate failed:', err);
      return this.createGoTNode('Failed to aggregate solutions', null);
    }
  }

  /**
   * Refine a thought through self-loops
   */
  private async gotRefine(problem: string, node: GoTNode, maxRounds: number): Promise<GoTNode> {
    try {
      let current = node;

      for (let round = 1; round <= maxRounds; round++) {
        const prompt = GOT_REFINE_PROMPT
          .replace('{problem}', problem)
          .replace('{thought}', current.state)
          .replace('{round}', round.toString())
          .replace('{max_rounds}', maxRounds.toString());

        const result = await this.llm.chat(prompt);

        // Parse refined thought
        const refinedMatch = result.content.match(/<refined>([\s\S]*?)<\/refined>/);
        if (refinedMatch) {
          const refinedNode = this.createGoTNode(refinedMatch[1].trim(), current.id);
          refinedNode.parents = [current.id];
          refinedNode.refinementCount = round;
          current = refinedNode;
        } else {
          break;  // No improvement found
        }

        // Check if improvements section indicates no changes
        const improvementsMatch = result.content.match(/<improvements>([\s\S]*?)<\/improvements>/);
        if (improvementsMatch) {
          const improvements = improvementsMatch[1].toLowerCase();
          if (improvements.includes('no') && improvements.includes('change') ||
              improvements.includes('none') ||
              improvements.includes('already optimal')) {
            break;
          }
        }
      }

      return current;
    } catch (err) {
      console.error('[thinking] gotRefine failed:', err);
      return node;
    }
  }

  /**
   * Score a thought
   */
  private async gotScore(problem: string, node: GoTNode): Promise<{
    correctness: number;
    completeness: number;
    clarity: number;
    efficiency: number;
    overall: number;
    isSolution: boolean;
  }> {
    const prompt = GOT_SCORE_PROMPT
      .replace('{problem}', problem)
      .replace('{thought}', node.state);

    const result = await this.llm.chat(prompt);

    // Parse score
    const scoreMatch = result.content.match(/<score>([\s\S]*?)<\/score>/);
    if (scoreMatch) {
      const content = scoreMatch[1];
      const correctness = this.parseScore(content, 'correctness');
      const completeness = this.parseScore(content, 'completeness');
      const clarity = this.parseScore(content, 'clarity');
      const efficiency = this.parseScore(content, 'efficiency');
      const overall = this.parseScore(content, 'overall');
      const isSolutionMatch = content.match(/is_solution:\s*(true|false)/i);

      return {
        correctness,
        completeness,
        clarity,
        efficiency,
        overall,
        isSolution: isSolutionMatch ? isSolutionMatch[1].toLowerCase() === 'true' : false,
      };
    }

    return {
      correctness: 0.5,
      completeness: 0.5,
      clarity: 0.5,
      efficiency: 0.5,
      overall: 0.5,
      isSolution: false,
    };
  }

  /**
   * Parse a numeric score from text
   */
  private parseScore(content: string, field: string): number {
    const match = content.match(new RegExp(`${field}:\\s*(\\d+(?:\\.\\d+)?)`));
    return match ? parseFloat(match[1]) / 10 : 0.5;
  }

  /**
   * Create a GoT node
   */
  private createGoTNode(thought: string, parent: string | null): GoTNode {
    return {
      id: `got_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      thought,
      state: thought,
      parent,
      parents: parent ? [parent] : [],
      children: [],
      depth: 0,
      value: 0,
      visits: 0,
      isTerminal: false,
      isValid: true,
      refinementCount: 0,
      aggregatedFrom: [],
      metadata: {
        generatedAt: Date.now(),
      },
    };
  }

  // ==========================================================================
  // v7.9: SuperCorrect (Hierarchical Templates + Cross-Model Correction)
  // Based on arXiv:2410.09008
  // ==========================================================================

  /**
   * SuperCorrect reasoning with hierarchical templates and self-correction
   */
  async superCorrect(problem: string): Promise<SuperCorrectResult> {
    const startTime = Date.now();
    const config = this.config.superCorrectConfig;

    // Stage 1: Generate hierarchical thought template
    const template = await this.generateHierarchicalTemplate(problem);

    // Generate initial solution using template
    let currentSolution = await this.generateSolutionFromTemplate(problem, template);

    const correctionHistory: SuperCorrectResult['correctionHistory'] = [];
    let totalErrorsIdentified = 0;
    let totalErrorsCorrected = 0;

    // Stage 2: Cross-model collaborative correction
    if (config.enableCrossModelCorrection) {
      for (let round = 0; round < config.maxCorrectionRounds; round++) {
        // Detect errors (teacher role)
        const errors = await this.detectErrors(problem, currentSolution, template);

        if (errors.length === 0) {
          // No errors found, done!
          break;
        }

        totalErrorsIdentified += errors.length;

        // Apply corrections
        const { correctedSolution, trace } = await this.applyCorrections(
          problem,
          currentSolution,
          errors
        );

        // Verify corrections
        const verification = await this.verifyCorrections(
          problem,
          currentSolution,
          correctedSolution,
          errors
        );

        // Calculate improvement
        const improvementScore = verification.confidence;
        totalErrorsCorrected += verification.errorsFixed ? errors.length : 0;

        correctionHistory.push({
          round: round + 1,
          errorsFound: errors,
          correctedSolution,
          improvementScore,
        });

        currentSolution = correctedSolution;

        // Stop if confidence is high enough
        if (verification.confidence >= config.errorDetectionThreshold) {
          break;
        }
      }
    }

    // Final confidence estimation
    const finalConfidence = await this.estimateSolutionConfidence(problem, currentSolution);

    return {
      solution: currentSolution,
      template,
      correctionHistory,
      stats: {
        totalCorrectionRounds: correctionHistory.length,
        errorsIdentified: totalErrorsIdentified,
        errorsCorrected: totalErrorsCorrected,
        finalConfidence,
      },
      duration: Date.now() - startTime,
    };
  }

  /**
   * Generate hierarchical thought template
   */
  private async generateHierarchicalTemplate(problem: string): Promise<HierarchicalThoughtTemplate> {
    const prompt = SUPERCORRECT_HIERARCHICAL_TEMPLATE_PROMPT.replace('{problem}', problem);
    const result = await this.llm.chat(prompt);

    // Parse template
    const templateMatch = result.content.match(/<template>([\s\S]*?)<\/template>/);
    if (!templateMatch) {
      return this.createDefaultTemplate();
    }

    const content = templateMatch[1];

    // Parse high-level
    const highLevelMatch = content.match(/<high_level>([\s\S]*?)<\/high_level>/);
    const strategyMatch = highLevelMatch?.[1].match(/strategy:\s*(.+)/);
    const insightsMatches = highLevelMatch?.[1].match(/insights:\n([\s\S]*?)(?=patterns:|$)/);
    const patternsMatches = highLevelMatch?.[1].match(/patterns:\n([\s\S]*?)$/);

    const insights = this.parseListItems(insightsMatches?.[1] || '');
    const patterns = this.parseListItems(patternsMatches?.[1] || '');

    // Parse detailed
    const detailedMatch = content.match(/<detailed>([\s\S]*?)<\/detailed>/);
    const steps: HierarchicalThoughtTemplate['detailed']['steps'] = [];

    const stepRegex = /<step[^>]*num="(\d+)"[^>]*>([\s\S]*?)<\/step>/g;
    let stepMatch;
    while ((stepMatch = stepRegex.exec(detailedMatch?.[1] || '')) !== null) {
      const stepContent = stepMatch[2];
      const descMatch = stepContent.match(/description:\s*(.+)/);
      const reasonMatch = stepContent.match(/reasoning:\s*(.+)/);
      const validMatch = stepContent.match(/validation:\s*(.+)/);

      steps.push({
        step: parseInt(stepMatch[1]),
        description: descMatch?.[1]?.trim() || '',
        reasoning: reasonMatch?.[1]?.trim() || '',
        validation: validMatch?.[1]?.trim() || '',
      });
    }

    const criticalMatch = detailedMatch?.[1].match(/critical_points:\n([\s\S]*?)(?=checkpoints:|$)/);
    const checkpointsMatch = detailedMatch?.[1].match(/checkpoints:\n([\s\S]*?)$/);

    return {
      highLevel: {
        strategy: strategyMatch?.[1]?.trim() || 'General problem-solving approach',
        keyInsights: insights,
        commonPatterns: patterns,
      },
      detailed: {
        steps,
        criticalPoints: this.parseListItems(criticalMatch?.[1] || ''),
        checkpoints: this.parseListItems(checkpointsMatch?.[1] || ''),
      },
    };
  }

  /**
   * Generate solution using template guidance
   */
  private async generateSolutionFromTemplate(
    problem: string,
    template: HierarchicalThoughtTemplate
  ): Promise<string> {
    try {
      const templateStr = `Strategy: ${template.highLevel.strategy}
Key Insights: ${template.highLevel.keyInsights.join(', ')}
Steps to follow:
${template.detailed.steps.map(s => `${s.step}. ${s.description} (${s.reasoning})`).join('\n')}`;

      const prompt = `Solve this problem following the template guidance.

Problem: ${problem}

Template:
${templateStr}

Provide a complete solution following the steps in the template.`;

      const result = await this.llm.chat(prompt);
      return result.content;
    } catch (err) {
      console.error('[thinking] generateSolutionFromTemplate failed:', err);
      return `Unable to generate solution using template. Problem: ${problem}`;
    }
  }

  /**
   * Detect errors in solution (teacher role)
   */
  private async detectErrors(
    problem: string,
    solution: string,
    template: HierarchicalThoughtTemplate
  ): Promise<IdentifiedError[]> {
    const templateStr = JSON.stringify(template, null, 2);

    const prompt = SUPERCORRECT_ERROR_DETECTION_PROMPT
      .replace('{problem}', problem)
      .replace('{solution}', solution)
      .replace('{template}', templateStr);

    const result = await this.llm.chat(prompt);

    // Check for no errors
    if (result.content.includes('none_found: true')) {
      return [];
    }

    // Parse errors
    const errors: IdentifiedError[] = [];
    const errorRegex = /<error[^>]*>([\s\S]*?)<\/error>/g;
    let match;

    while ((match = errorRegex.exec(result.content)) !== null) {
      const content = match[1];
      const stepMatch = content.match(/step_index:\s*(-?\d+)/);
      const typeMatch = content.match(/type:\s*(\w+)/);
      const descMatch = content.match(/description:\s*(.+)/);
      const severityMatch = content.match(/severity:\s*(\w+)/);
      const fixMatch = content.match(/suggested_fix:\s*(.+)/);

      if (typeMatch && descMatch) {
        errors.push({
          stepIndex: stepMatch ? parseInt(stepMatch[1]) : -1,
          errorType: typeMatch[1] as IdentifiedError['errorType'],
          description: descMatch[1].trim(),
          severity: (severityMatch?.[1] || 'minor') as IdentifiedError['severity'],
          suggestedFix: fixMatch?.[1]?.trim() || 'Review and correct',
        });
      }
    }

    return errors;
  }

  /**
   * Apply corrections to solution
   */
  private async applyCorrections(
    problem: string,
    solution: string,
    errors: IdentifiedError[]
  ): Promise<{ correctedSolution: string; trace: string }> {
    try {
      const errorsStr = errors.map((e, i) =>
        `Error ${i + 1}: [${e.errorType}] ${e.description}\n  Severity: ${e.severity}\n  Fix: ${e.suggestedFix}`
      ).join('\n\n');

      const prompt = SUPERCORRECT_CORRECTION_PROMPT
        .replace('{problem}', problem)
        .replace('{solution}', solution)
        .replace('{errors}', errorsStr);

      const result = await this.llm.chat(prompt);

      // Parse corrected solution
      const correctedMatch = result.content.match(/<corrected_solution>([\s\S]*?)<\/corrected_solution>/);
      const traceMatch = result.content.match(/<correction_trace>([\s\S]*?)<\/correction_trace>/);

      return {
        correctedSolution: correctedMatch?.[1]?.trim() || solution,
        trace: traceMatch?.[1]?.trim() || '',
      };
    } catch (err) {
      console.error('[thinking] applyCorrections failed:', err);
      return { correctedSolution: solution, trace: '' };
    }
  }

  /**
   * Verify that corrections were applied correctly
   */
  private async verifyCorrections(
    problem: string,
    originalSolution: string,
    correctedSolution: string,
    errors: IdentifiedError[]
  ): Promise<{ errorsFixed: boolean; newErrors: string[]; confidence: number }> {
    try {
      const errorsStr = errors.map(e => e.description).join(', ');

      const prompt = SUPERCORRECT_VERIFY_CORRECTION_PROMPT
        .replace('{problem}', problem)
        .replace('{solution}', originalSolution)
        .replace('{corrected}', correctedSolution)
        .replace('{errors}', errorsStr);

      const result = await this.llm.chat(prompt);

      // Parse verification
      const verifyMatch = result.content.match(/<verification>([\s\S]*?)<\/verification>/);
      if (verifyMatch) {
        const content = verifyMatch[1];
        const fixedMatch = content.match(/errors_fixed:\s*(true|false)/i);
        const newErrorsMatch = content.match(/new_errors:\s*(.+)/);
        const confidenceMatch = content.match(/confidence:\s*([\d.]+)/);

        const newErrorsStr = newErrorsMatch?.[1]?.trim() || 'none';
        const newErrors = newErrorsStr.toLowerCase() === 'none' ? [] : [newErrorsStr];

        return {
          errorsFixed: fixedMatch?.[1]?.toLowerCase() === 'true',
          newErrors,
          confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5,
        };
      }

      return { errorsFixed: false, newErrors: [], confidence: 0.5 };
    } catch (err) {
      console.error('[thinking] verifyCorrections failed:', err);
      return { errorsFixed: false, newErrors: [], confidence: 0.5 };
    }
  }

  /**
   * Estimate confidence in final solution
   */
  private async estimateSolutionConfidence(problem: string, solution: string): Promise<number> {
    try {
      // Use GoT scoring for confidence
      const node = this.createGoTNode(solution, null);
      const score = await this.gotScore(problem, node);
      return score.overall;
    } catch (err) {
      console.error('[thinking] estimateSolutionConfidence failed:', err);
      return 0.5;
    }
  }

  /**
   * Create default template when parsing fails
   */
  private createDefaultTemplate(): HierarchicalThoughtTemplate {
    return {
      highLevel: {
        strategy: 'Systematic problem-solving approach',
        keyInsights: ['Break down the problem', 'Verify each step'],
        commonPatterns: ['Identify inputs and outputs', 'Apply relevant techniques'],
      },
      detailed: {
        steps: [
          { step: 1, description: 'Understand the problem', reasoning: 'Clarity first', validation: 'Can restate problem' },
          { step: 2, description: 'Plan approach', reasoning: 'Strategy before execution', validation: 'Clear path to solution' },
          { step: 3, description: 'Execute solution', reasoning: 'Follow plan', validation: 'Each step logically follows' },
          { step: 4, description: 'Verify result', reasoning: 'Ensure correctness', validation: 'Answer makes sense' },
        ],
        criticalPoints: ['Step transitions', 'Assumptions'],
        checkpoints: ['After planning', 'After execution'],
      },
    };
  }

  /**
   * Parse list items from text
   */
  private parseListItems(text: string): string[] {
    const items: string[] = [];
    const lines = text.split('\n');
    for (const line of lines) {
      const match = line.match(/^-\s*(.+)/);
      if (match) {
        items.push(match[1].trim());
      }
    }
    return items;
  }

  // ==========================================================================
  // v7.10: Trace Compression Methods (Buffer of Thoughts)
  // ==========================================================================

  /**
   * Compress a reasoning trace using configured strategy
   * Based on Buffer of Thoughts (arXiv:2406.04271) and RAC (arXiv:2509.12464)
   */
  async compressTrace(
    trace: string,
    originalProblem?: string
  ): Promise<TraceCompressionResult> {
    const startTime = Date.now();
    const config = this.config.traceCompressionConfig;
    const originalTokens = this.estimateTokens(trace);

    // Try template matching first if enabled
    let templateUsed: ThoughtTemplate | undefined;
    if (config.templateConfig.enableTemplateMatching && this.metaBuffer.templates.length > 0) {
      const match = await this.matchTemplate(originalProblem || trace);
      if (match && match.score >= config.templateConfig.similarityThreshold) {
        templateUsed = match.template;
        this.metaBuffer.stats.cacheHitRate =
          (this.metaBuffer.stats.cacheHitRate * this.metaBuffer.stats.totalTemplates + 1) /
          (this.metaBuffer.stats.totalTemplates + 1);
      }
    }

    // Apply compression strategy
    let compressed: CompressedTrace;
    let stepsPruned = 0;

    switch (config.strategy) {
      case 'summarize':
        compressed = await this.summarizeTrace(trace, config.summarizeConfig.targetRatio);
        break;

      case 'prune':
        const pruneResult = await this.pruneTrace(trace, config.pruneConfig.importanceThreshold);
        compressed = pruneResult.compressed;
        stepsPruned = pruneResult.stepsPruned;
        break;

      case 'template':
        if (templateUsed) {
          compressed = await this.compressWithTemplate(trace, templateUsed);
        } else {
          // Fallback to summarize if no template
          compressed = await this.summarizeTrace(trace, config.summarizeConfig.targetRatio);
        }
        break;

      case 'hybrid':
      default:
        // Hybrid: Use template if available, otherwise summarize + prune
        if (templateUsed) {
          compressed = await this.compressWithTemplate(trace, templateUsed);
        } else {
          // First prune, then summarize
          const pruned = await this.pruneTrace(trace, config.pruneConfig.importanceThreshold);
          stepsPruned = pruned.stepsPruned;

          if (pruned.compressed.compressionRatio > config.summarizeConfig.targetRatio) {
            // Still too big, summarize further
            compressed = await this.summarizeTrace(
              this.compressedTraceToString(pruned.compressed),
              config.summarizeConfig.targetRatio / pruned.compressed.compressionRatio
            );
          } else {
            compressed = pruned.compressed;
          }
        }
    }

    // Extract new template if successful and enabled
    let newTemplateCreated: ThoughtTemplate | undefined;
    if (
      config.templateConfig.enableTemplateExtraction &&
      !templateUsed &&
      originalProblem
    ) {
      newTemplateCreated = await this.extractTemplate(originalProblem, trace);
      if (newTemplateCreated) {
        this.addToMetaBuffer(newTemplateCreated);
      }
    }

    // Update stats
    const tokensSaved = originalTokens - compressed.compressedTokens;
    this.metaBuffer.stats.totalTokensSaved += tokensSaved;
    this.metaBuffer.stats.avgCompressionRatio =
      (this.metaBuffer.stats.avgCompressionRatio + compressed.compressionRatio) / 2;

    return {
      compressed,
      templateUsed,
      newTemplateCreated,
      stats: {
        originalTokens,
        compressedTokens: compressed.compressedTokens,
        compressionRatio: compressed.compressionRatio,
        strategyUsed: config.strategy,
        templateMatched: !!templateUsed,
        stepsPruned,
        processingTime: Date.now() - startTime,
      },
    };
  }

  /**
   * Summarize trace to target ratio
   */
  private async summarizeTrace(trace: string, targetRatio: number): Promise<CompressedTrace> {
    const originalTokens = this.estimateTokens(trace);
    const targetPercent = Math.round(targetRatio * 100);

    const prompt = TRACE_SUMMARIZE_PROMPT
      .replace('{trace}', trace)
      .replace('{targetRatio}', targetPercent.toString());

    const result = await this.llm.chat(prompt);

    // Parse compressed output
    const compressedMatch = result.content.match(/<compressed>([\s\S]*?)<\/compressed>/);
    if (!compressedMatch) {
      // Fallback: return original as single step
      return this.createFallbackCompressedTrace(trace, originalTokens);
    }

    const content = compressedMatch[1];
    const summary = content.match(/summary:\s*(.+)/)?.[1]?.trim() || trace.slice(0, 200);

    // Parse key steps
    const keySteps: CompressedTrace['keySteps'] = [];
    const stepMatches = content.matchAll(/<step num="(\d+)" importance="([\d.]+)">([\s\S]*?)<\/step>/g);
    for (const match of stepMatches) {
      const essenceMatch = match[3].match(/essence:\s*(.+)/);
      keySteps.push({
        step: parseInt(match[1]),
        essence: essenceMatch?.[1]?.trim() || '',
        importance: parseFloat(match[2]),
        originalLength: 0,  // Unknown after compression
        compressedLength: essenceMatch?.[1]?.length || 0,
      });
    }

    // Parse decisions
    const decisions: CompressedTrace['decisions'] = [];
    const decisionMatches = content.matchAll(/<decision>([\s\S]*?)<\/decision>/g);
    for (const match of decisionMatches) {
      const pointMatch = match[1].match(/point:\s*(.+)/);
      const choiceMatch = match[1].match(/choice:\s*(.+)/);
      const rationaleMatch = match[1].match(/rationale:\s*(.+)/);
      decisions.push({
        point: pointMatch?.[1]?.trim() || '',
        choice: choiceMatch?.[1]?.trim() || '',
        rationale: rationaleMatch?.[1]?.trim() || '',
      });
    }

    const compressedText = summary + keySteps.map(s => s.essence).join(' ');
    const compressedTokens = this.estimateTokens(compressedText);

    return {
      originalTokens,
      compressedTokens,
      compressionRatio: compressedTokens / originalTokens,
      summary,
      keySteps,
      decisions,
    };
  }

  /**
   * Prune trace by removing low-importance steps
   */
  private async pruneTrace(
    trace: string,
    threshold: number
  ): Promise<{ compressed: CompressedTrace; stepsPruned: number }> {
    const originalTokens = this.estimateTokens(trace);

    const prompt = TRACE_PRUNE_PROMPT
      .replace('{trace}', trace)
      .replace('{threshold}', threshold.toString());

    const result = await this.llm.chat(prompt);

    // Parse pruning analysis
    const analysisMatch = result.content.match(/<pruning_analysis>([\s\S]*?)<\/pruning_analysis>/);
    if (!analysisMatch) {
      return {
        compressed: this.createFallbackCompressedTrace(trace, originalTokens),
        stepsPruned: 0,
      };
    }

    const content = analysisMatch[1];

    // Parse step evaluations
    const keySteps: CompressedTrace['keySteps'] = [];
    const stepMatches = content.matchAll(/<step index="(\d+)">([\s\S]*?)<\/step>/g);
    let stepsPruned = 0;

    for (const match of stepMatches) {
      const stepContent = match[2];
      const importance = parseFloat(stepContent.match(/importance:\s*([\d.]+)/)?.[1] || '0.5');
      const pruneSafe = stepContent.match(/prune_safe:\s*(\w+)/)?.[1]?.toLowerCase() === 'true';
      const reason = stepContent.match(/reason:\s*(.+)/)?.[1]?.trim() || '';

      if (pruneSafe && importance < threshold) {
        stepsPruned++;
        continue;  // Skip this step
      }

      keySteps.push({
        step: parseInt(match[1]),
        essence: reason,  // Use reason as essence
        importance,
        originalLength: 0,
        compressedLength: reason.length,
      });
    }

    const summary = `Pruned trace with ${keySteps.length} key steps retained`;
    const compressedText = keySteps.map(s => s.essence).join(' ');
    const compressedTokens = this.estimateTokens(compressedText);

    return {
      compressed: {
        originalTokens,
        compressedTokens,
        compressionRatio: compressedTokens / originalTokens,
        summary,
        keySteps,
        decisions: [],
      },
      stepsPruned,
    };
  }

  /**
   * Compress using a matched template
   */
  private async compressWithTemplate(
    trace: string,
    template: ThoughtTemplate
  ): Promise<CompressedTrace> {
    const originalTokens = this.estimateTokens(trace);

    // Use template structure for compression
    const keySteps: CompressedTrace['keySteps'] = template.structure.keySteps.map((step, i) => ({
      step: i + 1,
      essence: step,
      importance: 0.8,
      originalLength: 0,
      compressedLength: step.length,
    }));

    const decisions = template.structure.criticalDecisions.map(d => ({
      point: d,
      choice: 'Template-guided',
      rationale: 'Following established pattern',
    }));

    const compressedTokens = this.estimateTokens(
      template.structure.highLevelStrategy + keySteps.map(s => s.essence).join(' ')
    );

    return {
      originalTokens,
      compressedTokens,
      compressionRatio: compressedTokens / originalTokens,
      summary: template.structure.highLevelStrategy,
      keySteps,
      decisions,
      templateId: template.id,
    };
  }

  /**
   * Match problem to existing template
   */
  private async matchTemplate(problem: string): Promise<{ template: ThoughtTemplate; score: number } | null> {
    try {
      if (this.metaBuffer.templates.length === 0) return null;

      const templatesStr = this.metaBuffer.templates
        .map(t => `ID: ${t.id}\nType: ${t.problemType}\nDescription: ${t.description}`)
        .join('\n\n');

      const prompt = TRACE_MATCH_TEMPLATE_PROMPT
        .replace('{problem}', problem)
        .replace('{templates}', templatesStr);

      const result = await this.llm.chat(prompt);

      // Parse matching result
      const matchingMatch = result.content.match(/<matching>([\s\S]*?)<\/matching>/);
      if (!matchingMatch) return null;

      const content = matchingMatch[1];
      const bestMatch = content.match(/best_match:\s*(.+)/)?.[1]?.trim();
      const confidence = parseFloat(content.match(/confidence:\s*([\d.]+)/)?.[1] || '0');

      if (!bestMatch || bestMatch === 'none') return null;

      const template = this.metaBuffer.templates.find(t => t.id === bestMatch);
      if (!template) return null;

      return { template, score: confidence };
    } catch (err) {
      console.error('[thinking] matchTemplate failed:', err);
      return null;
    }
  }

  /**
   * Extract template from successful trace
   */
  private async extractTemplate(
    problem: string,
    trace: string
  ): Promise<ThoughtTemplate | undefined> {
    const prompt = TRACE_EXTRACT_TEMPLATE_PROMPT
      .replace('{problemType}', 'general')
      .replace('{problem}', problem)
      .replace('{trace}', trace)
      .replace('{success}', 'true');

    const result = await this.llm.chat(prompt);

    // Parse template
    const templateMatch = result.content.match(/<template>([\s\S]*?)<\/template>/);
    if (!templateMatch) return undefined;

    const content = templateMatch[1];
    const id = content.match(/id:\s*(.+)/)?.[1]?.trim() || `template-${Date.now()}`;
    const problemType = content.match(/problem_type:\s*(.+)/)?.[1]?.trim() || 'general';
    const description = content.match(/description:\s*(.+)/)?.[1]?.trim() || '';

    // Parse structure
    const structureMatch = content.match(/<structure>([\s\S]*?)<\/structure>/);
    const structureContent = structureMatch?.[1] || '';

    const highLevelStrategy = structureContent.match(/high_level_strategy:\s*(.+)/)?.[1]?.trim() || '';
    const keySteps = this.parseListItems(structureContent.match(/key_steps:([\s\S]*?)(?=critical_decisions:|$)/)?.[1] || '');
    const criticalDecisions = this.parseListItems(structureContent.match(/critical_decisions:([\s\S]*?)(?=validation_points:|$)/)?.[1] || '');
    const validationPoints = this.parseListItems(structureContent.match(/validation_points:([\s\S]*?)$/)?.[1] || '');

    // Parse metadata
    const metadataMatch = content.match(/<metadata>([\s\S]*?)<\/metadata>/);
    const metadataContent = metadataMatch?.[1] || '';
    let successRate = parseFloat(metadataContent.match(/success_rate:\s*([\d.]+)/)?.[1] || '0.8');
    // Normalize percentage values (LLM may output 95 instead of 0.95)
    if (successRate > 1) successRate = successRate / 100;
    let avgTokenSavings = parseFloat(metadataContent.match(/avg_token_savings:\s*([\d.]+)/)?.[1] || '0.3');
    // Normalize percentage values
    if (avgTokenSavings > 1) avgTokenSavings = avgTokenSavings / 100;

    return {
      id,
      problemType,
      description,
      structure: {
        highLevelStrategy,
        keySteps,
        criticalDecisions,
        validationPoints,
      },
      metadata: {
        successRate,
        avgTokenSavings,
        usageCount: 0,
        lastUsed: new Date(),
        source: 'extracted',
      },
    };
  }

  /**
   * Add template to meta-buffer
   */
  private addToMetaBuffer(template: ThoughtTemplate): void {
    // Enforce max templates limit
    if (this.metaBuffer.templates.length >= this.metaBuffer.maxTemplates) {
      // Remove least recently used
      this.metaBuffer.templates.sort((a, b) =>
        a.metadata.lastUsed.getTime() - b.metadata.lastUsed.getTime()
      );
      this.metaBuffer.templates.shift();
    }

    this.metaBuffer.templates.push(template);
    this.metaBuffer.stats.totalTemplates = this.metaBuffer.templates.length;
  }

  /**
   * Convert compressed trace back to string
   */
  private compressedTraceToString(compressed: CompressedTrace): string {
    return [
      compressed.summary,
      ...compressed.keySteps.map(s => `Step ${s.step}: ${s.essence}`),
      ...compressed.decisions.map(d => `Decision: ${d.point} -> ${d.choice} (${d.rationale})`),
    ].join('\n');
  }

  /**
   * Create fallback compressed trace when parsing fails
   */
  private createFallbackCompressedTrace(trace: string, originalTokens: number): CompressedTrace {
    const summary = trace.slice(0, 200) + (trace.length > 200 ? '...' : '');
    return {
      originalTokens,
      compressedTokens: originalTokens,
      compressionRatio: 1.0,
      summary,
      keySteps: [{
        step: 1,
        essence: trace,
        importance: 1.0,
        originalLength: trace.length,
        compressedLength: trace.length,
      }],
      decisions: [],
    };
  }

  /**
   * Get meta-buffer statistics
   */
  getMetaBufferStats(): MetaBuffer['stats'] {
    return { ...this.metaBuffer.stats };
  }

  /**
   * Get all stored templates
   */
  getTemplates(): ThoughtTemplate[] {
    return [...this.metaBuffer.templates];
  }

  /**
   * Clear meta-buffer
   */
  clearMetaBuffer(): void {
    this.metaBuffer.templates = [];
    this.metaBuffer.stats = {
      totalTemplates: 0,
      avgCompressionRatio: 0,
      cacheHitRate: 0,
      totalTokensSaved: 0,
    };
  }
}

// ============================================================================
// Factory & Singleton
// ============================================================================

let thinkingInstance: ThinkingEngine | null = null;

export function createThinkingEngine(config?: Partial<ThinkingConfig>): ThinkingEngine {
  return new ThinkingEngine(config);
}

export function getThinkingEngine(config?: Partial<ThinkingConfig>): ThinkingEngine {
  if (!thinkingInstance) {
    thinkingInstance = createThinkingEngine(config);
  }
  return thinkingInstance;
}

export function resetThinkingEngine(): void {
  thinkingInstance = null;
}

// ============================================================================
// Quick Thinking Functions
// ============================================================================

/**
 * Quick think with defaults
 */
export async function think(
  query: string,
  context?: string
): Promise<ThinkingResult> {
  const engine = getThinkingEngine();
  return engine.think(query, context);
}

/**
 * Think with extended budget (more tokens)
 */
export async function thinkDeep(
  query: string,
  context?: string
): Promise<ThinkingResult> {
  const engine = getThinkingEngine({
    thinkingBudget: 16384,
    maxCritiqueRounds: 3,
  });
  return engine.think(query, context);
}

/**
 * Think with Best-of-N (more expensive, higher quality)
 */
export async function thinkBestOfN(
  query: string,
  context?: string,
  n: number = 3
): Promise<ThinkingResult> {
  const engine = getThinkingEngine({
    enableBestOfN: true,
    nSamples: n,
  });
  return engine.think(query, context);
}

// ============================================================================
// v7.7: Quick Functions for Advanced Reasoning
// ============================================================================

/**
 * Tree-of-Thought search with BFS (default)
 */
export async function thinkWithToT(
  problem: string,
  strategy: ToTSearchStrategy = 'bfs'
): Promise<ToTResult> {
  const engine = getThinkingEngine({
    enableTreeOfThought: true,
    totConfig: { ...DEFAULT_TOT_CONFIG, strategy },
  });
  return engine.treeOfThought(problem);
}

/**
 * Tree-of-Thought with MCTS (AlphaGo-style)
 */
export async function thinkWithMCTS(
  problem: string,
  iterations: number = 50
): Promise<ToTResult> {
  const engine = getThinkingEngine({
    enableTreeOfThought: true,
    totConfig: { ...DEFAULT_TOT_CONFIG, strategy: 'mcts', maxIterations: iterations },
  });
  return engine.treeOfThought(problem);
}

/**
 * Tree-of-Thought with Beam Search
 */
export async function thinkWithBeam(
  problem: string,
  beamWidth: number = 5
): Promise<ToTResult> {
  const engine = getThinkingEngine({
    enableTreeOfThought: true,
    totConfig: { ...DEFAULT_TOT_CONFIG, strategy: 'beam', beamWidth },
  });
  return engine.treeOfThought(problem);
}

/**
 * Verify reasoning chain with Process Reward Model
 */
export async function verifyWithPRM(
  problem: string,
  steps: string[]
): Promise<{ valid: boolean; stepScores: number[]; aggregateScore: number; errors: string[] }> {
  const engine = getThinkingEngine();
  return engine.verifyChainWithPRM(problem, steps);
}

/**
 * Compute CoT Entropy for a problem (uncertainty measure)
 */
export async function measureUncertainty(problem: string): Promise<number> {
  const engine = getThinkingEngine();
  return engine.computeCoTEntropy(problem);
}

/**
 * Estimate problem difficulty for adaptive compute
 */
export async function estimateProblemDifficulty(
  problem: string
): Promise<{ level: string; estimatedSteps: number; reasoningType: string; budget: number }> {
  const engine = getThinkingEngine();
  return engine.estimateDifficulty(problem);
}

/**
 * Full adaptive reasoning: estimate difficulty → choose strategy → solve
 */
export async function thinkAdaptive(
  problem: string
): Promise<{
  thinking: ThinkingResult | ToTResult | GoTResult;
  difficulty: { level: string; estimatedSteps: number; reasoningType: string; budget: number };
  strategyUsed: string;
}> {
  const engine = getThinkingEngine();

  // Step 1: Estimate difficulty
  const difficulty = await engine.estimateDifficulty(problem);

  // Step 2: Choose strategy based on difficulty
  let thinking: ThinkingResult | ToTResult | GoTResult;
  let strategyUsed: string;

  switch (difficulty.level) {
    case 'easy':
      // Simple extended thinking
      strategyUsed = 'extended_thinking';
      thinking = await engine.think(problem);
      break;
    case 'medium':
      // Self-critique loop
      strategyUsed = 'self_critique';
      thinking = await engine.think(problem);
      break;
    case 'hard':
      // Tree-of-Thought with BFS
      strategyUsed = 'tot_bfs';
      thinking = await engine.treeOfThought(problem);
      break;
    case 'very_hard':
      // MCTS with more iterations
      engine.updateConfig({
        totConfig: { ...DEFAULT_TOT_CONFIG, strategy: 'mcts', maxIterations: 100 },
      });
      strategyUsed = 'tot_mcts';
      thinking = await engine.treeOfThought(problem);
      break;
    default:
      strategyUsed = 'extended_thinking';
      thinking = await engine.think(problem);
  }

  return { thinking, difficulty, strategyUsed };
}

// ============================================================================
// v7.8: Quick Functions for Graph-of-Thoughts
// ============================================================================

/**
 * Graph-of-Thoughts reasoning with aggregation
 * Based on arXiv:2308.09687 - 62% quality improvement over ToT
 */
export async function thinkWithGoT(
  problem: string,
  aggregationStrategy: 'merge' | 'synthesize' | 'vote' = 'synthesize'
): Promise<GoTResult> {
  const engine = getThinkingEngine({
    enableGraphOfThought: true,
    gotConfig: { ...DEFAULT_GOT_CONFIG, aggregationStrategy },
  });
  return engine.graphOfThought(problem);
}

/**
 * Graph-of-Thoughts with deep decomposition (more sub-problems)
 */
export async function thinkWithGoTDeep(
  problem: string,
  decompositionDepth: number = 4
): Promise<GoTResult> {
  const engine = getThinkingEngine({
    enableGraphOfThought: true,
    gotConfig: { ...DEFAULT_GOT_CONFIG, decompositionDepth },
  });
  return engine.graphOfThought(problem);
}

/**
 * Graph-of-Thoughts with extra refinement loops
 */
export async function thinkWithGoTRefined(
  problem: string,
  maxRefinements: number = 5
): Promise<GoTResult> {
  const engine = getThinkingEngine({
    enableGraphOfThought: true,
    gotConfig: { ...DEFAULT_GOT_CONFIG, maxRefinements, enableRefinementLoops: true },
  });
  return engine.graphOfThought(problem);
}

/**
 * Adaptive reasoning that chooses between ToT and GoT based on problem type
 * Uses GoT for problems requiring synthesis/aggregation
 */
export async function thinkAdaptiveAdvanced(
  problem: string
): Promise<{
  thinking: ThinkingResult | ToTResult | GoTResult;
  difficulty: { level: string; estimatedSteps: number; reasoningType: string; budget: number };
  strategyUsed: string;
}> {
  const engine = getThinkingEngine();

  // Step 1: Estimate difficulty
  const difficulty = await engine.estimateDifficulty(problem);

  // Step 2: Choose strategy based on difficulty AND reasoning type
  let thinking: ThinkingResult | ToTResult | GoTResult;
  let strategyUsed: string;

  // Use GoT for multi-step or creative problems (need aggregation)
  const useGoT = difficulty.reasoningType === 'multi-step' ||
                 difficulty.reasoningType === 'creative' ||
                 difficulty.estimatedSteps > 5;

  switch (difficulty.level) {
    case 'easy':
      strategyUsed = 'extended_thinking';
      thinking = await engine.think(problem);
      break;
    case 'medium':
      strategyUsed = 'self_critique';
      thinking = await engine.think(problem);
      break;
    case 'hard':
      if (useGoT) {
        // GoT for problems needing synthesis
        engine.updateConfig({
          enableGraphOfThought: true,
          gotConfig: DEFAULT_GOT_CONFIG,
        });
        strategyUsed = 'got_synthesize';
        thinking = await engine.graphOfThought(problem);
      } else {
        // ToT for structured search
        strategyUsed = 'tot_bfs';
        thinking = await engine.treeOfThought(problem);
      }
      break;
    case 'very_hard':
      if (useGoT) {
        // GoT with deep decomposition
        engine.updateConfig({
          enableGraphOfThought: true,
          gotConfig: { ...DEFAULT_GOT_CONFIG, decompositionDepth: 4, maxRefinements: 5 },
        });
        strategyUsed = 'got_deep';
        thinking = await engine.graphOfThought(problem);
      } else {
        // MCTS for exhaustive search
        engine.updateConfig({
          totConfig: { ...DEFAULT_TOT_CONFIG, strategy: 'mcts', maxIterations: 100 },
        });
        strategyUsed = 'tot_mcts';
        thinking = await engine.treeOfThought(problem);
      }
      break;
    default:
      strategyUsed = 'extended_thinking';
      thinking = await engine.think(problem);
  }

  return { thinking, difficulty, strategyUsed };
}

// ============================================================================
// v7.9: SuperCorrect Convenience Functions
// ============================================================================

/**
 * SuperCorrect reasoning with hierarchical templates and self-correction
 * Based on arXiv:2410.09008 - Two-stage framework
 */
export async function thinkWithSuperCorrect(
  problem: string
): Promise<SuperCorrectResult> {
  const engine = getThinkingEngine({
    enableSuperCorrect: true,
    superCorrectConfig: DEFAULT_SUPERCORRECT_CONFIG,
  });
  return engine.superCorrect(problem);
}

/**
 * SuperCorrect with hierarchical templates only (no correction phase)
 * Useful for structured problem decomposition
 */
export async function thinkWithHierarchicalTemplates(
  problem: string
): Promise<SuperCorrectResult> {
  const engine = getThinkingEngine({
    enableSuperCorrect: true,
    superCorrectConfig: {
      ...DEFAULT_SUPERCORRECT_CONFIG,
      enableCrossModelCorrection: false,
    },
  });
  return engine.superCorrect(problem);
}

/**
 * SuperCorrect with aggressive error correction
 * More correction rounds for complex problems
 */
export async function thinkWithDeepCorrection(
  problem: string,
  maxCorrectionRounds: number = 5
): Promise<SuperCorrectResult> {
  const engine = getThinkingEngine({
    enableSuperCorrect: true,
    superCorrectConfig: {
      ...DEFAULT_SUPERCORRECT_CONFIG,
      maxCorrectionRounds,
      errorDetectionThreshold: 0.5, // More aggressive error detection
    },
  });
  return engine.superCorrect(problem);
}

/**
 * Ultimate adaptive reasoning - chooses best strategy including SuperCorrect
 * Combines all v7.5-v7.9 techniques based on problem characteristics
 */
export async function thinkUltimate(
  problem: string
): Promise<{
  result: ThinkingResult | ToTResult | GoTResult | SuperCorrectResult;
  difficulty: { level: string; estimatedSteps: number; reasoningType: string; budget: number };
  strategyUsed: string;
}> {
  const engine = getThinkingEngine();

  // Step 1: Estimate difficulty
  const difficulty = await engine.estimateDifficulty(problem);

  // Step 2: Choose optimal strategy
  let result: ThinkingResult | ToTResult | GoTResult | SuperCorrectResult;
  let strategyUsed: string;

  // Determine problem characteristics
  const needsSynthesis = difficulty.reasoningType === 'multi-step' || difficulty.reasoningType === 'creative';
  const needsCorrection = difficulty.reasoningType === 'mathematical' || difficulty.reasoningType === 'analytical';
  const isComplex = difficulty.estimatedSteps > 5;

  switch (difficulty.level) {
    case 'easy':
      strategyUsed = 'extended_thinking';
      result = await engine.think(problem);
      break;

    case 'medium':
      if (needsCorrection) {
        // SuperCorrect for problems that benefit from verification
        engine.updateConfig({
          enableSuperCorrect: true,
          superCorrectConfig: { ...DEFAULT_SUPERCORRECT_CONFIG, maxCorrectionRounds: 1 },
        });
        strategyUsed = 'supercorrect_light';
        result = await engine.superCorrect(problem);
      } else {
        strategyUsed = 'self_critique';
        result = await engine.think(problem);
      }
      break;

    case 'hard':
      if (needsCorrection) {
        // Full SuperCorrect with correction rounds
        engine.updateConfig({
          enableSuperCorrect: true,
          superCorrectConfig: DEFAULT_SUPERCORRECT_CONFIG,
        });
        strategyUsed = 'supercorrect';
        result = await engine.superCorrect(problem);
      } else if (needsSynthesis) {
        // GoT for problems needing aggregation
        engine.updateConfig({
          enableGraphOfThought: true,
          gotConfig: DEFAULT_GOT_CONFIG,
        });
        strategyUsed = 'got_synthesize';
        result = await engine.graphOfThought(problem);
      } else {
        // ToT for structured exploration
        strategyUsed = 'tot_bfs';
        result = await engine.treeOfThought(problem);
      }
      break;

    case 'very_hard':
      if (needsCorrection && isComplex) {
        // Deep SuperCorrect for complex analytical problems
        engine.updateConfig({
          enableSuperCorrect: true,
          superCorrectConfig: {
            ...DEFAULT_SUPERCORRECT_CONFIG,
            maxCorrectionRounds: 5,
            errorDetectionThreshold: 0.5,
          },
        });
        strategyUsed = 'supercorrect_deep';
        result = await engine.superCorrect(problem);
      } else if (needsSynthesis) {
        // Deep GoT with refinement loops
        engine.updateConfig({
          enableGraphOfThought: true,
          gotConfig: { ...DEFAULT_GOT_CONFIG, decompositionDepth: 4, maxRefinements: 5, enableRefinementLoops: true },
        });
        strategyUsed = 'got_deep_refined';
        result = await engine.graphOfThought(problem);
      } else {
        // MCTS for exhaustive search
        engine.updateConfig({
          totConfig: { ...DEFAULT_TOT_CONFIG, strategy: 'mcts', maxIterations: 100 },
        });
        strategyUsed = 'tot_mcts';
        result = await engine.treeOfThought(problem);
      }
      break;

    default:
      strategyUsed = 'extended_thinking';
      result = await engine.think(problem);
  }

  return { result, difficulty, strategyUsed };
}

// ============================================================================
// v7.10: Trace Compression Convenience Functions
// ============================================================================

/**
 * Compress a reasoning trace for efficient storage/retrieval
 * Uses Buffer of Thoughts meta-buffer architecture
 */
export async function compressTrace(
  trace: string,
  problem?: string
): Promise<TraceCompressionResult> {
  const engine = getThinkingEngine({
    enableTraceCompression: true,
    traceCompressionConfig: DEFAULT_TRACE_COMPRESSION_CONFIG,
  });
  return engine.compressTrace(trace, problem);
}

/**
 * Compress trace using summarization strategy
 * Best for general-purpose compression
 */
export async function compressTraceSummarize(
  trace: string,
  targetRatio: number = 0.3
): Promise<TraceCompressionResult> {
  const engine = getThinkingEngine({
    enableTraceCompression: true,
    traceCompressionConfig: {
      ...DEFAULT_TRACE_COMPRESSION_CONFIG,
      strategy: 'summarize',
      summarizeConfig: {
        ...DEFAULT_TRACE_COMPRESSION_CONFIG.summarizeConfig,
        targetRatio,
      },
    },
  });
  return engine.compressTrace(trace);
}

/**
 * Compress trace using pruning strategy
 * Best when you want to keep full steps but remove unimportant ones
 */
export async function compressTracePrune(
  trace: string,
  importanceThreshold: number = 0.3
): Promise<TraceCompressionResult> {
  const engine = getThinkingEngine({
    enableTraceCompression: true,
    traceCompressionConfig: {
      ...DEFAULT_TRACE_COMPRESSION_CONFIG,
      strategy: 'prune',
      pruneConfig: {
        ...DEFAULT_TRACE_COMPRESSION_CONFIG.pruneConfig,
        importanceThreshold,
      },
    },
  });
  return engine.compressTrace(trace);
}

/**
 * Think with automatic trace compression
 * Compresses reasoning trace after thinking for efficient storage
 */
export async function thinkWithCompression(
  problem: string,
  context?: string
): Promise<{
  result: ThinkingResult;
  compressed: TraceCompressionResult;
}> {
  const engine = getThinkingEngine({
    enableTraceCompression: true,
    traceCompressionConfig: DEFAULT_TRACE_COMPRESSION_CONFIG,
  });

  // Think first
  const result = await engine.think(problem, context);

  // Compress the thinking trace
  const traceText = result.thinking.map(t => `[${t.type}] ${t.content}`).join('\n');
  const compressed = await engine.compressTrace(traceText, problem);

  return { result, compressed };
}

/**
 * Get meta-buffer statistics (token savings, cache hits, etc.)
 */
export function getCompressionStats(): MetaBuffer['stats'] {
  const engine = getThinkingEngine();
  return engine.getMetaBufferStats();
}

/**
 * Get all stored thought templates
 */
export function getThoughtTemplates(): ThoughtTemplate[] {
  const engine = getThinkingEngine();
  return engine.getTemplates();
}

/**
 * Clear the thought template meta-buffer
 */
export function clearThoughtTemplates(): void {
  const engine = getThinkingEngine();
  engine.clearMetaBuffer();
}

/**
 * Ultimate thinking with compression - combines best strategies with efficient storage
 * Automatically compresses reasoning traces after execution
 */
export async function thinkUltimateCompressed(
  problem: string
): Promise<{
  result: ThinkingResult | ToTResult | GoTResult | SuperCorrectResult;
  difficulty: { level: string; estimatedSteps: number; reasoningType: string; budget: number };
  strategyUsed: string;
  compressed: TraceCompressionResult;
}> {
  // Use ultimate strategy selection
  const { result, difficulty, strategyUsed } = await thinkUltimate(problem);

  // Extract trace from result based on type
  let traceText: string;
  if ('thinking' in result) {
    // ThinkingResult
    traceText = (result as ThinkingResult).thinking.map(t => `[${t.type}] ${t.content}`).join('\n');
  } else if ('solution' in result && 'template' in result) {
    // SuperCorrectResult
    const scResult = result as SuperCorrectResult;
    traceText = `Solution: ${scResult.solution}\nTemplate: ${JSON.stringify(scResult.template)}`;
  } else if ('graph' in result) {
    // GoTResult
    const gotResult = result as GoTResult;
    traceText = `Solution: ${gotResult.solution}\nNodes: ${gotResult.graph.nodes.length}\nConfidence: ${gotResult.confidence}`;
  } else if ('treeStats' in result) {
    // ToTResult
    const totResult = result as ToTResult;
    traceText = `Solution: ${totResult.solution}\nMax depth: ${totResult.treeStats.maxDepthReached}\nNodes expanded: ${totResult.treeStats.nodesExpanded}`;
  } else {
    traceText = JSON.stringify(result);
  }

  // Compress the trace
  const engine = getThinkingEngine({
    enableTraceCompression: true,
    traceCompressionConfig: DEFAULT_TRACE_COMPRESSION_CONFIG,
  });
  const compressed = await engine.compressTrace(traceText, problem);

  return { result, difficulty, strategyUsed, compressed };
}

// ============================================================================
// v7.11: Math-Shepherd Process Reward Model Convenience Functions
// ============================================================================

/**
 * Score a solution using Math-Shepherd completion-based verification
 *
 * @param problem - The problem statement
 * @param solution - The solution to score
 * @param correctAnswer - Optional ground truth for verification
 * @param numCompletions - Number of completion rollouts per step (default: 4)
 * @returns Annotated solution with step-level scores
 */
export async function scoreSolutionWithMathShepherd(
  problem: string,
  solution: string,
  correctAnswer: string = '',
  numCompletions: number = 4
): Promise<AnnotatedSolution> {
  const engine = getThinkingEngine({
    enableMathShepherd: true,
    mathShepherdConfig: {
      ...DEFAULT_MATH_SHEPHERD_CONFIG,
      enabled: true,
      numCompletions,
    },
  });
  return engine.annotateSolutionWithMathShepherd(problem, solution, correctAnswer);
}

/**
 * Rank multiple solutions using Math-Shepherd step-level scores
 *
 * Best-of-N selection: generate N solutions, score each, return best
 *
 * @param problem - The problem statement
 * @param solutions - Array of candidate solutions
 * @param correctAnswer - Optional ground truth for verification
 * @returns Ranking with solutions ordered by aggregate score
 */
export async function rankSolutionsWithPRM(
  problem: string,
  solutions: string[],
  correctAnswer?: string
): Promise<SolutionRanking> {
  const engine = getThinkingEngine({
    enableMathShepherd: true,
    mathShepherdConfig: {
      ...DEFAULT_MATH_SHEPHERD_CONFIG,
      enabled: true,
    },
  });
  return engine.rankSolutionsWithMathShepherd(problem, solutions, correctAnswer);
}

/**
 * Generate process annotations for training PRM models
 *
 * Auto-annotates solutions without human labels using Math-Shepherd.
 *
 * @param problem - The problem statement
 * @param solution - The solution to annotate
 * @param correctAnswer - Ground truth answer
 * @returns ProcessAnnotation with step-level labels (+ for correct, - for incorrect)
 */
export async function generatePRMAnnotations(
  problem: string,
  solution: string,
  correctAnswer: string
): Promise<ProcessAnnotation> {
  const engine = getThinkingEngine({
    enableMathShepherd: true,
    mathShepherdConfig: {
      ...DEFAULT_MATH_SHEPHERD_CONFIG,
      enabled: true,
    },
  });
  return engine.generateProcessAnnotations(problem, solution, correctAnswer);
}

/**
 * Think and automatically select best solution from N attempts
 *
 * Combines thinking with Math-Shepherd Best-of-N selection.
 *
 * @param problem - The problem to solve
 * @param n - Number of solutions to generate (default: 4)
 * @returns Best solution with ranking information
 */
export async function thinkBestOfNWithPRM(
  problem: string,
  n: number = 4
): Promise<{
  best: ThinkingResult;
  ranking: SolutionRanking;
  allSolutions: ThinkingResult[];
}> {
  const engine = getThinkingEngine({
    enableMathShepherd: true,
    mathShepherdConfig: {
      ...DEFAULT_MATH_SHEPHERD_CONFIG,
      enabled: true,
    },
  });

  // Generate N solutions
  const solutions: ThinkingResult[] = [];
  for (let i = 0; i < n; i++) {
    const result = await engine.think(problem);
    solutions.push(result);
  }

  // Extract responses for ranking
  const responses = solutions.map(s => s.response);

  // Rank using Math-Shepherd
  const ranking = await engine.rankSolutionsWithMathShepherd(problem, responses);

  // Get best solution (selectedIndex points to the best one)
  const best = solutions[ranking.selectedIndex];

  return { best, ranking, allSolutions: solutions };
}

/**
 * Get Math-Shepherd configuration
 */
export function getMathShepherdConfig(): MathShepherdConfig {
  const engine = getThinkingEngine();
  return engine.getConfig().mathShepherdConfig;
}

// =============================================================================
// v7.12: Conditional Reward Modeling (CRM) Convenience Functions
// Based on arXiv:2509.26578 - "Linking Process to Outcome"
// =============================================================================

/**
 * Score a solution trajectory using Conditional Reward Modeling
 *
 * Provides step-by-step analysis with:
 * - h(t): conditional error probability (wrong at t | correct up to t-1)
 * - S(t): survival probability (cumulative correctness)
 * - r_t: process reward (log(1-h(t)))
 *
 * @param problem - The problem being solved
 * @param solution - The solution to score
 * @param goldenAnswer - Optional correct answer for verification
 */
export async function scoreWithCRM(
  problem: string,
  solution: string,
  goldenAnswer?: string
): Promise<CRMTrajectoryResult> {
  const engine = getThinkingEngine({
    enableCRM: true,
    crmConfig: {
      ...DEFAULT_CRM_CONFIG,
      enabled: true,
    },
  });

  return engine.scoreTrajectoryWithCRM(problem, solution, goldenAnswer);
}

/**
 * Select best solution from multiple candidates using CRM
 *
 * Superior to Math-Shepherd due to:
 * - Cross-sample comparability (consistent probabilistic semantics)
 * - Explicit outcome linkage via survival probability
 * - PBRS-derived rewards (robust to reward hacking)
 *
 * @param problem - The problem being solved
 * @param solutions - Array of candidate solutions
 * @param goldenAnswer - Optional correct answer for verification
 */
export async function selectBestWithCRM(
  problem: string,
  solutions: string[],
  goldenAnswer?: string
): Promise<{
  selectedIndex: number;
  selected: CRMTrajectoryResult;
  allResults: CRMTrajectoryResult[];
  stats: { avgSurvival: number; maxSurvival: number; correctCount: number };
}> {
  const engine = getThinkingEngine({
    enableCRM: true,
    crmConfig: {
      ...DEFAULT_CRM_CONFIG,
      enabled: true,
    },
  });

  return engine.selectBestOfNWithCRM(problem, solutions, goldenAnswer);
}

/**
 * CRM-guided beam search for solution generation
 *
 * Uses survival probability S(t) to guide beam selection,
 * preferring trajectories most likely to reach correct answer.
 *
 * @param problem - The problem to solve
 * @param goldenAnswer - Optional correct answer for guidance
 * @param beamWidth - Number of candidates to maintain (default: 3)
 * @param maxDepth - Maximum reasoning steps (default: 10)
 */
export async function thinkWithCRMBeam(
  problem: string,
  goldenAnswer?: string,
  beamWidth: number = 3,
  maxDepth: number = 10
): Promise<CRMBeamSearchResult> {
  const engine = getThinkingEngine({
    enableCRM: true,
    crmConfig: {
      ...DEFAULT_CRM_CONFIG,
      enabled: true,
    },
  });

  return engine.crmBeamSearch(problem, goldenAnswer, beamWidth, maxDepth);
}

/**
 * Compare two solution trajectories using CRM
 *
 * @param problem - The problem being solved
 * @param solution1 - First solution
 * @param solution2 - Second solution
 * @param goldenAnswer - Optional correct answer
 */
export async function compareTrajectoriesWithCRM(
  problem: string,
  solution1: string,
  solution2: string,
  goldenAnswer?: string
): Promise<{
  winner: 1 | 2;
  trajectory1: CRMTrajectoryResult;
  trajectory2: CRMTrajectoryResult;
  margin: number;
}> {
  const engine = getThinkingEngine({
    enableCRM: true,
    crmConfig: {
      ...DEFAULT_CRM_CONFIG,
      enabled: true,
    },
  });

  return engine.compareTrajectories(problem, solution1, solution2, goldenAnswer);
}

/**
 * Think and select best solution using CRM
 *
 * Combines thinking with CRM Best-of-N selection.
 *
 * @param problem - The problem to solve
 * @param n - Number of solutions to generate (default: 4)
 */
export async function thinkBestOfNWithCRM(
  problem: string,
  n: number = 4
): Promise<{
  best: ThinkingResult;
  selected: CRMTrajectoryResult;
  allSolutions: ThinkingResult[];
  stats: { avgSurvival: number; maxSurvival: number; correctCount: number };
}> {
  const engine = getThinkingEngine({
    enableCRM: true,
    crmConfig: {
      ...DEFAULT_CRM_CONFIG,
      enabled: true,
    },
  });

  // Generate N solutions
  const solutions: ThinkingResult[] = [];
  for (let i = 0; i < n; i++) {
    const result = await engine.think(problem);
    solutions.push(result);
  }

  // Extract responses for ranking
  const responses = solutions.map(s => s.response);

  // Rank using CRM
  const ranking = await engine.selectBestOfNWithCRM(problem, responses);

  // Get best solution
  const best = solutions[ranking.selectedIndex];

  return {
    best,
    selected: ranking.selected,
    allSolutions: solutions,
    stats: ranking.stats,
  };
}

/**
 * Get CRM configuration
 */
export function getCRMConfig(): CRMConfig {
  const engine = getThinkingEngine();
  return engine.getConfig().crmConfig;
}
