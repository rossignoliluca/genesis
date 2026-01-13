/**
 * Genesis v7.9 - Advanced Reasoning System
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
 * NEW in v7.9 (arXiv:2410.09008 - SuperCorrect):
 * - Hierarchical Thought Templates (high-level + detailed steps)
 * - Cross-model Self-Correction (teacher/student pattern)
 * - Two-stage: Template distillation → Error-driven correction
 * - 7.5% accuracy improvement on MATH benchmark
 *
 * Based on:
 * - OpenAI o1/o3: Test-time compute scaling, hidden CoT
 * - DeepSeek R1: Transparent reasoning, GRPO
 * - Claude Extended Thinking: Interleaved reasoning
 * - Deliberative Alignment: Explicit specification reasoning
 * - Tree of Thoughts: Deliberate Problem Solving (Yao et al. 2023)
 * - Graph of Thoughts: Besta et al. ETH Zurich 2023
 * - SuperCorrect: Hierarchical Templates (Llama 2024)
 * - Uncertainty-aware Step-wise Verification (Oxford 2025)
 *
 * Architecture:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    ADVANCED REASONING v7.9                      │
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
 * │  MCTS: Selection → Expansion → Simulation → Backpropagation   │
 * │  CoT Entropy: Sample rationales → Cluster → Compute entropy    │
 * │  Dynamic Budget: Easy=fast, Hard=deep/GoT/SuperCorrect         │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 */

import { LLMBridge, getLLMBridge } from '../llm/index.js';

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
// ThinkingEngine Class
// ============================================================================

export class ThinkingEngine {
  private config: ThinkingConfig;
  private llm: LLMBridge;
  private thinkingHistory: ThinkingStep[] = [];

  constructor(config: Partial<ThinkingConfig> = {}) {
    this.config = { ...DEFAULT_THINKING_CONFIG, ...config };
    this.llm = getLLMBridge();
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
  }

  // ==========================================================================
  // Deliberative Alignment
  // ==========================================================================

  /**
   * Reason about values and principles explicitly
   */
  private async deliberate(query: string): Promise<ThinkingStep> {
    const startTime = Date.now();

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
    const samples: Array<{ response: string; score: number }> = [];

    // Generate N samples
    for (let i = 0; i < this.config.nSamples; i++) {
      const result = await this.generate(
        query,
        context,
        thinkingContext,
        systemPrompt,
        this.config.samplingTemperature
      );
      samples.push({
        response: result.response,
        score: result.confidence,
      });
    }

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
    for (const node of nodes) {
      const result = await this.evaluateState(problem, node, method);
      node.value = result.value;
      node.isTerminal = result.isTerminal;
      node.isValid = result.isValid;
    }
    return nodes;
  }

  /**
   * Value prompt evaluation (rate 1-10)
   */
  private async evaluateWithValue(
    problem: string,
    node: ThoughtNode
  ): Promise<{ value: number; isTerminal: boolean; isValid: boolean }> {
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
  }

  /**
   * Vote-based evaluation
   */
  private async evaluateWithVote(
    problem: string,
    nodes: ThoughtNode[]
  ): Promise<{ value: number; isTerminal: boolean; isValid: boolean }> {
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
  }

  /**
   * Compute Chain-of-Thought Entropy
   * CoTE(x) = -Σ p(answer) log p(answer)
   */
  async computeCoTEntropy(problem: string): Promise<number> {
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
  }

  /**
   * Refine a thought through self-loops
   */
  private async gotRefine(problem: string, node: GoTNode, maxRounds: number): Promise<GoTNode> {
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
  }

  /**
   * Estimate confidence in final solution
   */
  private async estimateSolutionConfidence(problem: string, solution: string): Promise<number> {
    // Use GoT scoring for confidence
    const node = this.createGoTNode(solution, null);
    const score = await this.gotScore(problem, node);
    return score.overall;
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
