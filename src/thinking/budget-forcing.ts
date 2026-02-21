/**
 * Genesis v35 — Budget Forcing & Adaptive Compute Allocation
 *
 * Based on:
 * - s1: Simple Test-Time Scaling (Muennighoff 2025) — "Wait" token forcing
 * - Plan-and-Budget (arXiv 2505.16122) — Bayesian budget allocation
 *
 * Key insight: Not all reasoning steps deserve equal compute.
 * Front-load investment on uncertain steps, decay on confident ones.
 *
 * Budget forcing has two modes:
 *   1. Extension — the model wants to stop, but the problem is hard enough
 *      to warrant more reasoning. We append a continuation prompt ("Wait…").
 *   2. Truncation — the model keeps spinning on a simple problem. We cut it
 *      off early to avoid wasted compute.
 *
 * Polynomial decay schedule (Plan-and-Budget §3.2):
 *   budget_i = B_total * (n - i + 1)^α / Σ_{j=1..n} (n - j + 1)^α
 *
 * where α > 1 front-loads tokens on early (more uncertain) steps,
 * and α = 0 gives a flat distribution.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Coarse-grained problem domain, used to apply domain-specific keyword weights.
 */
export type ProblemDomain =
  | 'mathematical'
  | 'analytical'
  | 'creative'
  | 'factual'
  | 'multi_step'
  | 'unknown';

/**
 * Complexity signals extracted from the raw input string.
 * Each field is a normalised [0, 1] score; the composite score is a weighted sum.
 */
export interface ComplexityEstimate {
  /** Overall composite complexity in [0, 1]. */
  score: number;
  /** Normalised input length signal (longer → potentially harder). */
  lengthSignal: number;
  /** Density of interrogative / hedging words that indicate open-ended queries. */
  questionWordDensity: number;
  /** Fraction of domain-specific hard keywords present. */
  domainKeywordRatio: number;
  /** Presence of nested structure (sub-questions, bullet lists, parenthetical conditions). */
  nestedStructureDepth: number;
  /** Detected primary domain. */
  domain: ProblemDomain;
  /**
   * Bucketed level derived from the composite score:
   *   [0, 0.25) → 'trivial'
   *   [0.25, 0.5) → 'simple'
   *   [0.5, 0.75) → 'complex'
   *   [0.75, 1]   → 'very_complex'
   */
  level: 'trivial' | 'simple' | 'complex' | 'very_complex';
  /** Estimated number of discrete reasoning steps needed. */
  estimatedSteps: number;
}

/**
 * A single reasoning phase within the full budget.
 * Phases are ordered — phase 0 is the first step, phase n-1 is the last.
 */
export interface BudgetPhase {
  /** Zero-based phase index. */
  index: number;
  /** Human-readable label for this phase. */
  label: string;
  /** Token allocation for this phase. */
  tokens: number;
  /** Fraction of the total budget assigned to this phase. */
  fraction: number;
  /**
   * Confidence threshold: if the model's confidence exceeds this value before
   * consuming all tokens in this phase, it is safe to advance early.
   */
  confidenceThreshold: number;
}

/**
 * Full budget allocation across all reasoning phases.
 */
export interface BudgetAllocation {
  /** Total token budget across all phases. */
  totalBudget: number;
  /** Per-phase breakdown. */
  phases: BudgetPhase[];
  /** Polynomial decay exponent α used to compute the distribution. */
  decayExponent: number;
  /**
   * Soft ceiling: total tokens consumed before we consider truncation.
   * Set to totalBudget * truncationFraction.
   */
  softCeiling: number;
  /**
   * Hard floor: minimum tokens to consume before we consider the problem
   * "adequately reasoned".  Attempts to stop before this threshold trigger
   * a "Wait" extension.
   */
  hardFloor: number;
}

// ============================================================================
// Internal constants & lookup tables
// ============================================================================

/**
 * Interrogative / hedging words that suggest the query is genuinely open-ended
 * rather than a straightforward lookup.
 */
const QUESTION_WORDS = new Set([
  'why', 'how', 'explain', 'analyze', 'analyse', 'evaluate', 'compare',
  'contrast', 'argue', 'justify', 'prove', 'derive', 'solve', 'optimise',
  'optimize', 'design', 'propose', 'synthesise', 'synthesize', 'critique',
  'assess', 'elaborate', 'discuss', 'what if', 'could', 'would', 'should',
]);

/**
 * Domain keyword sets.  Each set maps to a `ProblemDomain`.
 * These are intentionally not exhaustive — they are heuristic signals.
 */
const DOMAIN_KEYWORD_SETS: Record<ProblemDomain, readonly string[]> = {
  mathematical: [
    'integral', 'derivative', 'proof', 'theorem', 'equation', 'polynomial',
    'matrix', 'eigenvalue', 'probability', 'distribution', 'calculus',
    'differential', 'modulo', 'prime', 'combinatorial', 'permutation',
    'gradient', 'convex', 'optimization', 'constraint',
  ],
  analytical: [
    'causal', 'hypothesis', 'correlation', 'regression', 'inference',
    'strategy', 'tradeoff', 'risk', 'cost-benefit', 'sensitivity',
    'scenario', 'framework', 'model', 'mechanism', 'implication',
    'systematic', 'decompose', 'breakdown',
  ],
  creative: [
    'story', 'narrative', 'imagine', 'brainstorm', 'invent', 'generate ideas',
    'novel', 'creative', 'fiction', 'poem', 'metaphor', 'analogy',
    'alternative', 'diverse', 'unconventional',
  ],
  factual: [
    'when', 'where', 'who', 'list', 'define', 'name', 'state', 'what is',
    'abbreviation', 'acronym', 'capital', 'founded', 'born',
  ],
  multi_step: [
    'step by step', 'first', 'then', 'finally', 'subsequently', 'following',
    'pipeline', 'workflow', 'process', 'procedure', 'algorithm', 'plan',
    'roadmap', 'phases', 'stages',
  ],
  unknown: [],
};

/**
 * Weight vector for the composite complexity score.
 * Must sum to 1.0.
 */
const SIGNAL_WEIGHTS = {
  lengthSignal: 0.20,
  questionWordDensity: 0.25,
  domainKeywordRatio: 0.30,
  nestedStructureDepth: 0.25,
} as const;

/**
 * Default polynomial decay exponents by complexity level.
 * Higher α → more aggressive front-loading.
 */
const DEFAULT_DECAY_EXPONENTS: Record<ComplexityEstimate['level'], number> = {
  trivial: 0.5,   // slight back-loading (quick problems can defer)
  simple: 1.0,    // flat distribution
  complex: 1.8,   // moderate front-loading
  very_complex: 2.5, // aggressive front-loading
};

/**
 * Phase labels indexed by estimated step count.
 * Used when the number of phases equals the standard set sizes.
 */
const PHASE_LABEL_SETS: Record<number, string[]> = {
  2: ['initial_reasoning', 'verification'],
  3: ['problem_framing', 'core_reasoning', 'verification'],
  4: ['decomposition', 'exploration', 'synthesis', 'verification'],
  5: ['decomposition', 'hypothesis', 'exploration', 'synthesis', 'verification'],
  6: ['decomposition', 'hypothesis', 'exploration', 'synthesis', 'self_correction', 'verification'],
};

/** Fallback label when a phase index exceeds our named sets. */
function defaultPhaseLabel(index: number, total: number): string {
  if (index === 0) return 'decomposition';
  if (index === total - 1) return 'verification';
  return `reasoning_step_${index}`;
}

// ============================================================================
// Complexity estimation
// ============================================================================

/**
 * Count occurrences of tokens from a set inside a normalised word list.
 * Handles multi-word tokens by checking substrings of the joined text.
 */
function countKeywordHits(words: string[], text: string, keywords: readonly string[]): number {
  let hits = 0;
  for (const kw of keywords) {
    if (kw.includes(' ')) {
      // Multi-word phrase — search in the full text.
      if (text.includes(kw)) hits++;
    } else {
      if (words.includes(kw)) hits++;
    }
  }
  return hits;
}

/**
 * Detect nested structure signals:
 * - Parenthetical nesting depth (e.g. "(... (...))")
 * - Bullet / numbered list items
 * - Sub-clauses signalled by semicolons and colons
 * Returns a score in [0, 1].
 */
function measureNestedDepth(input: string): number {
  let maxParenDepth = 0;
  let currentDepth = 0;
  for (const ch of input) {
    if (ch === '(') { currentDepth++; maxParenDepth = Math.max(maxParenDepth, currentDepth); }
    else if (ch === ')') { currentDepth = Math.max(0, currentDepth - 1); }
  }

  // Count bullet/numbered list items
  const bulletMatches = (input.match(/^\s*[-*•]\s+/gm) ?? []).length;
  const numberedMatches = (input.match(/^\s*\d+[.)]\s+/gm) ?? []).length;
  const listItems = bulletMatches + numberedMatches;

  // Count structural punctuation (semicolons, colons introducing sub-clauses)
  const semicolons = (input.match(/;/g) ?? []).length;
  const structuralColons = (input.match(/:\s+[A-Z]/g) ?? []).length;

  // Normalise each signal then blend
  const parenScore = Math.min(maxParenDepth / 4, 1);         // cap at depth 4
  const listScore = Math.min(listItems / 6, 1);               // cap at 6 items
  const punctScore = Math.min((semicolons + structuralColons) / 4, 1);

  return (parenScore * 0.35 + listScore * 0.40 + punctScore * 0.25);
}

/**
 * Detect the most likely problem domain by keyword voting.
 * Returns the domain with the highest hit count, or 'unknown'.
 */
function detectDomain(words: string[], text: string): ProblemDomain {
  let bestDomain: ProblemDomain = 'unknown';
  let bestScore = 0;

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORD_SETS) as Array<[ProblemDomain, readonly string[]]>) {
    if (domain === 'unknown') continue;
    const hits = countKeywordHits(words, text, keywords);
    if (hits > bestScore) {
      bestScore = hits;
      bestDomain = domain;
    }
  }

  return bestDomain;
}

/**
 * Map a composite complexity score to a discrete level.
 */
function scoreToLevel(score: number): ComplexityEstimate['level'] {
  if (score < 0.25) return 'trivial';
  if (score < 0.50) return 'simple';
  if (score < 0.75) return 'complex';
  return 'very_complex';
}

/**
 * Estimate the number of reasoning steps based on complexity level and domain.
 */
function estimateStepCount(level: ComplexityEstimate['level'], domain: ProblemDomain): number {
  const base: Record<ComplexityEstimate['level'], number> = {
    trivial: 1,
    simple: 2,
    complex: 4,
    very_complex: 6,
  };
  const domainBonus: Partial<Record<ProblemDomain, number>> = {
    mathematical: 1,
    multi_step: 2,
    analytical: 1,
  };
  return base[level] + (domainBonus[domain] ?? 0);
}

/**
 * Heuristic complexity scorer.
 *
 * The function is intentionally free of LLM calls — it operates entirely on
 * structural and lexical features of the input string.  This keeps latency
 * negligible and avoids recursive cost at planning time.
 *
 * @param input - Raw problem/query string.
 * @returns `ComplexityEstimate` with a composite score in [0, 1].
 */
export function estimateComplexity(input: string): ComplexityEstimate {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  const words = lower.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  // --- Signal 1: Length ---
  // Empirically, inputs < 10 words are often trivial; > 200 words are very complex.
  const lengthSignal = Math.min(wordCount / 200, 1);

  // --- Signal 2: Question word density ---
  // How many question / hedging words appear relative to total words?
  let questionHits = 0;
  for (const w of words) {
    if (QUESTION_WORDS.has(w)) questionHits++;
  }
  // Check multi-word phrases in the lower text
  for (const phrase of ['what if', 'could you', 'would you', 'step by step']) {
    if (lower.includes(phrase)) questionHits++;
  }
  const questionWordDensity = Math.min(questionHits / Math.max(wordCount * 0.2, 1), 1);

  // --- Signal 3: Domain keyword ratio ---
  const domain = detectDomain(words, lower);
  const domainKeywords = DOMAIN_KEYWORD_SETS[domain];
  const domainHits = countKeywordHits(words, lower, domainKeywords);
  const domainKeywordRatio = domainKeywords.length > 0
    ? Math.min(domainHits / Math.max(domainKeywords.length * 0.25, 1), 1)
    : 0;

  // --- Signal 4: Nested structure depth ---
  const nestedStructureDepth = measureNestedDepth(trimmed);

  // --- Composite score ---
  const score =
    lengthSignal * SIGNAL_WEIGHTS.lengthSignal +
    questionWordDensity * SIGNAL_WEIGHTS.questionWordDensity +
    domainKeywordRatio * SIGNAL_WEIGHTS.domainKeywordRatio +
    nestedStructureDepth * SIGNAL_WEIGHTS.nestedStructureDepth;

  const clampedScore = Math.max(0, Math.min(1, score));
  const level = scoreToLevel(clampedScore);
  const estimatedSteps = estimateStepCount(level, domain);

  return {
    score: clampedScore,
    lengthSignal,
    questionWordDensity,
    domainKeywordRatio,
    nestedStructureDepth,
    domain,
    level,
    estimatedSteps,
  };
}

// ============================================================================
// Budget allocation
// ============================================================================

/**
 * Compute the polynomial decay weight for phase `i` out of `n` total phases.
 *
 * Weight formula (Plan-and-Budget §3.2):
 *   w_i = (n - i)^α        (0-indexed, so phase 0 gets the largest weight)
 *
 * Edge case: if α = 0, all phases get equal weight 1.
 */
function polynomialWeight(i: number, n: number, alpha: number): number {
  if (alpha === 0) return 1;
  // Use (n - i) so index 0 (first phase) gets the maximum weight.
  const rank = n - i;
  return Math.pow(Math.max(rank, 0), alpha);
}

/**
 * Compute per-phase confidence thresholds.
 *
 * Early phases (high uncertainty) require lower confidence to proceed — the
 * model should keep reasoning.  Later phases (verification) can exit at
 * moderate confidence because errors at that point are recoverable.
 *
 *   threshold_i = base_threshold + (i / (n - 1)) * spread
 */
function phaseConfidenceThreshold(index: number, total: number): number {
  const baseThreshold = 0.55;
  const spread = 0.30;  // verification phase exits at ~0.85 confidence
  if (total === 1) return baseThreshold + spread;
  return baseThreshold + (index / (total - 1)) * spread;
}

/**
 * Distribute a total token budget across reasoning phases using polynomial decay.
 *
 * This implements the key insight from Plan-and-Budget:
 * - Early steps are highest-variance; invest more compute there.
 * - Later steps (verification) are cheaper once a good candidate exists.
 * - The truncation soft-ceiling prevents over-spend on trivial problems.
 * - The hard floor prevents under-spend on difficult ones.
 *
 * @param complexity - Output from `estimateComplexity`.
 * @param totalBudget - Total token budget available.
 * @param decayExponent - Override the default α for fine-grained control.
 * @returns `BudgetAllocation` with per-phase token counts.
 */
export function allocateBudget(
  complexity: ComplexityEstimate,
  totalBudget: number,
  decayExponent?: number,
): BudgetAllocation {
  const alpha = decayExponent ?? DEFAULT_DECAY_EXPONENTS[complexity.level];
  const numPhases = Math.max(complexity.estimatedSteps, 1);

  // Compute raw polynomial weights
  const weights: number[] = [];
  let weightSum = 0;
  for (let i = 0; i < numPhases; i++) {
    const w = polynomialWeight(i, numPhases, alpha);
    weights.push(w);
    weightSum += w;
  }

  // Normalise to fractions; allocate tokens (integer)
  const phaseLabels = PHASE_LABEL_SETS[numPhases] ?? null;
  let allocated = 0;
  const phases: BudgetPhase[] = [];

  for (let i = 0; i < numPhases; i++) {
    const fraction = weights[i] / weightSum;
    // Give any rounding remainder to the last phase
    const tokens = i < numPhases - 1
      ? Math.floor(totalBudget * fraction)
      : totalBudget - allocated;

    phases.push({
      index: i,
      label: phaseLabels?.[i] ?? defaultPhaseLabel(i, numPhases),
      tokens,
      fraction,
      confidenceThreshold: phaseConfidenceThreshold(i, numPhases),
    });

    allocated += tokens;
  }

  // Truncation soft-ceiling: stop early if we have consumed this much
  // and confidence is already high.  Scale with inverse complexity.
  const truncationFraction = complexity.level === 'trivial' ? 0.5
    : complexity.level === 'simple' ? 0.65
    : complexity.level === 'complex' ? 0.85
    : 0.95;

  // Hard floor: minimum tokens before "early stop" is permitted.
  const floorFraction = complexity.level === 'trivial' ? 0.20
    : complexity.level === 'simple' ? 0.30
    : complexity.level === 'complex' ? 0.50
    : 0.65;

  return {
    totalBudget,
    phases,
    decayExponent: alpha,
    softCeiling: Math.floor(totalBudget * truncationFraction),
    hardFloor: Math.floor(totalBudget * floorFraction),
  };
}

// ============================================================================
// Budget forcing decisions
// ============================================================================

/**
 * Determine whether we should extend reasoning by appending "Wait" tokens.
 *
 * Extension is triggered when ALL of the following hold:
 *   1. We have not yet consumed the hard floor (the model wants to stop too early).
 *   2. Model confidence is below the threshold for the current phase.
 *   3. We are still within the soft ceiling (there is budget remaining).
 *
 * The `currentPhaseIndex` is derived from `currentTokens` against the phase
 * schedule, but callers may pass it directly when they track phases themselves.
 *
 * @param currentTokens - Tokens consumed so far in this reasoning pass.
 * @param budget - The `BudgetAllocation` from `allocateBudget`.
 * @param confidence - Model's current confidence estimate in [0, 1].
 * @param currentPhaseIndex - Optional explicit phase index (0-based).
 * @returns `true` if a "Wait" continuation prompt should be appended.
 */
export function shouldExtendThinking(
  currentTokens: number,
  budget: BudgetAllocation,
  confidence: number,
  currentPhaseIndex?: number,
): boolean {
  // Already past the soft ceiling — do not keep forcing.
  if (currentTokens >= budget.softCeiling) return false;

  // If we haven't hit the hard floor, always extend regardless of confidence.
  if (currentTokens < budget.hardFloor) return true;

  // Past hard floor but below soft ceiling: extend only if confidence is
  // below the threshold for the current phase.
  const phaseIdx = currentPhaseIndex ?? resolvePhaseIndex(currentTokens, budget);
  const phase = budget.phases[phaseIdx];
  if (!phase) return false;

  return confidence < phase.confidenceThreshold;
}

/**
 * Determine whether we should truncate reasoning early.
 *
 * Truncation is triggered when ALL of the following hold:
 *   1. We have consumed at least the hard floor (minimum required thinking).
 *   2. Model confidence exceeds the current phase's threshold.
 *   3. We have consumed more tokens than the soft ceiling
 *      OR confidence is very high (above 0.92) after the midpoint.
 *
 * This prevents the model from continuing to deliberate on problems it has
 * already solved with high confidence.
 *
 * @param currentTokens - Tokens consumed so far.
 * @param budget - The `BudgetAllocation` from `allocateBudget`.
 * @param confidence - Model's current confidence estimate in [0, 1].
 * @param currentPhaseIndex - Optional explicit phase index (0-based).
 * @returns `true` if reasoning should be stopped early.
 */
export function shouldTruncateThinking(
  currentTokens: number,
  budget: BudgetAllocation,
  confidence: number,
  currentPhaseIndex?: number,
): boolean {
  // Never truncate before the hard floor.
  if (currentTokens < budget.hardFloor) return false;

  const phaseIdx = currentPhaseIndex ?? resolvePhaseIndex(currentTokens, budget);
  const phase = budget.phases[phaseIdx];
  if (!phase) return true; // Past all phases — always truncate.

  const confidenceExceedsPhaseThreshold = confidence >= phase.confidenceThreshold;
  const pastSoftCeiling = currentTokens >= budget.softCeiling;

  // Past the soft ceiling and model is sufficiently confident → truncate.
  if (pastSoftCeiling && confidenceExceedsPhaseThreshold) return true;

  // High-confidence early exit: past midpoint with very high confidence.
  const midpoint = budget.totalBudget / 2;
  const veryHighConfidence = confidence >= 0.92;
  if (currentTokens >= midpoint && veryHighConfidence && confidenceExceedsPhaseThreshold) return true;

  return false;
}

/**
 * Resolve which budget phase corresponds to the current token count.
 * Linear scan through phases; O(n) where n is number of phases (≤ 8 in practice).
 */
function resolvePhaseIndex(currentTokens: number, budget: BudgetAllocation): number {
  let cumulative = 0;
  for (const phase of budget.phases) {
    cumulative += phase.tokens;
    if (currentTokens <= cumulative) return phase.index;
  }
  // Past all phases
  return budget.phases.length - 1;
}

// ============================================================================
// Budget forcing prompts
// ============================================================================

/**
 * Continuation prompts appended when budget forcing extends reasoning.
 * The choice rotates to avoid repetitive injections in long chains.
 *
 * These follow the s1 paper's observation that even a simple "Wait" token
 * is sufficient — but richer prompts yield better self-correction behaviour.
 */
const EXTENSION_PROMPTS: readonly string[] = [
  'Wait, let me reconsider this more carefully before concluding.',
  'Hold on — I should verify my reasoning before finalising.',
  'Actually, let me take a step back and check whether I have missed anything.',
  'Wait. There may be an edge case I have not accounted for yet.',
  'Let me pause and re-examine my assumptions from the beginning.',
  'Hmm, I am not fully confident in the above. Let me think through this again.',
  'Before I finish, I should double-check the key steps in my reasoning.',
  'Wait — let me consider an alternative approach to confirm this conclusion.',
];

/**
 * Simple deterministic index based on token count to rotate prompts without
 * maintaining external state.
 */
function selectPromptIndex(currentTokens: number): number {
  return currentTokens % EXTENSION_PROMPTS.length;
}

/**
 * Return a "Wait" continuation prompt to append when budget forcing extends
 * the model's reasoning.
 *
 * Passing `currentTokens` rotates through the prompt variants to avoid
 * injecting identical strings in long reasoning chains, which can cause
 * the model to learn to ignore them.
 *
 * @param currentTokens - Tokens consumed so far (used for rotation).
 * @returns A continuation string to append to the model's output.
 */
export function getBudgetForcingPrompt(currentTokens: number = 0): string {
  return EXTENSION_PROMPTS[selectPromptIndex(currentTokens)];
}

// ============================================================================
// Convenience: full pipeline helper
// ============================================================================

/**
 * One-shot helper: estimate complexity then allocate a budget.
 *
 * This is the entry point most callers will use when they do not need to
 * separate the two steps.
 *
 * @param input - Raw problem string.
 * @param totalBudget - Total token budget available.
 * @param decayExponent - Optional override for the polynomial decay exponent.
 * @returns Both the `ComplexityEstimate` and `BudgetAllocation`.
 */
export function planBudget(
  input: string,
  totalBudget: number,
  decayExponent?: number,
): { complexity: ComplexityEstimate; budget: BudgetAllocation } {
  const complexity = estimateComplexity(input);
  const budget = allocateBudget(complexity, totalBudget, decayExponent);
  return { complexity, budget };
}

// ============================================================================
// Required types: BudgetForcingConfig, SubQuestionBudget, ForcingBudgetPlan,
//                 BudgetForcingResult
// ============================================================================

/**
 * Configuration for the BudgetForcer.
 *
 * `budgetForcing` is the master switch.  When false the forcer passes through
 * text unchanged and records zero forcing rounds.
 *
 * `waitPrompt` overrides the default rotating EXTENSION_PROMPTS pool — useful
 * when callers want a fixed continuation string (e.g. the bare s1 "Wait").
 */
export interface BudgetForcingConfig {
  /** Minimum tokens to generate before an early-stop is honoured. */
  minTokens: number;
  /** Soft target; the forcer aims for this but may fall short for trivial inputs. */
  targetTokens: number;
  /** Hard upper limit; generation stops unconditionally at this count. */
  maxTokens: number;
  /**
   * Optional override for the continuation prompt appended when the model
   * wants to stop before `minTokens` have been generated.
   * When omitted the forcer rotates through the built-in EXTENSION_PROMPTS pool.
   */
  waitPrompt?: string;
  /** Master switch — set to false to disable all forcing behaviour. */
  budgetForcing: boolean;
}

/**
 * Budget allocation for a single decomposed sub-question.
 *
 * `complexity` is the raw [0, 1] score from `estimateComplexity`; it is
 * preserved so callers can re-weight allocations at runtime.
 */
export interface SubQuestionBudget {
  /** The sub-question text. */
  question: string;
  /** Token budget allocated to this sub-question. */
  budgetTokens: number;
  /**
   * Execution priority — lower number = higher priority.
   * The allocator orders sub-questions so that structural priors come first
   * (e.g. definitions before comparisons).
   */
  priority: number;
  /** Heuristic complexity score in [0, 1] from `estimateComplexity`. */
  complexity: number;
}

/**
 * Full decomposition plan returned by `PlanAndBudgetAllocator`.
 */
export interface ForcingBudgetPlan {
  /** Ordered list of sub-questions with individual token allocations. */
  subQuestions: SubQuestionBudget[];
  /** Sum of all `budgetTokens` — equals the input `totalBudget` (modulo rounding). */
  totalBudget: number;
}

/**
 * Result of a single `BudgetForcer.force()` or `applyBudgetForcing()` call.
 */
export interface BudgetForcingResult {
  /** Full generated text including any injected continuation prompts. */
  text: string;
  /** Total tokens accounted for (rough character-based estimate). */
  tokensUsed: number;
  /** Whether at least one "Wait" continuation was injected. */
  forcingApplied: boolean;
  /** Number of continuation prompts injected during the generation pass. */
  rounds: number;
}

// ============================================================================
// SubQuestionDecomposer — fast heuristic decomposition
// ============================================================================

/**
 * Splitting conjunctions that indicate independent clauses or sequential steps.
 * The list is intentionally small — precision matters more than recall here.
 */
const CONJUNCTION_SPLITTERS = [
  /\b(?:and\s+then|and\s+also|and\s+furthermore)\b/gi,
  /\bthen\b/gi,
  /\balso\b/gi,
  /;\s*/g,
];

/**
 * Patterns that imply a multi-part structure where a sub-question must be
 * synthesised from two named entities.
 *
 * Each entry is `[pattern, expander]`:
 * - `pattern` — matches the compound phrasing in the input.
 * - `expander(m)` — given the RegExp match, returns the list of derived
 *   sub-questions.
 */
type CompoundPattern = [RegExp, (m: RegExpMatchArray) => string[]];

const COMPOUND_PATTERNS: CompoundPattern[] = [
  // "compare X and Y" → ["analyze X", "analyze Y", "compare X and Y"]
  [
    /\bcompare\s+(.+?)\s+and\s+(.+?)(?:[,;.]|$)/i,
    (m) => [`analyze ${m[1].trim()}`, `analyze ${m[2].trim()}`, `compare ${m[1].trim()} and ${m[2].trim()}`],
  ],
  // "contrast X with Y" → ["analyze X", "analyze Y", "contrast X with Y"]
  [
    /\bcontrast\s+(.+?)\s+(?:with|versus|vs\.?)\s+(.+?)(?:[,;.]|$)/i,
    (m) => [`analyze ${m[1].trim()}`, `analyze ${m[2].trim()}`, `contrast ${m[1].trim()} vs ${m[2].trim()}`],
  ],
  // "X vs Y" → ["evaluate X", "evaluate Y", "compare X vs Y"]
  [
    /\b(.+?)\s+vs\.?\s+(.+?)(?:[,;.]|$)/i,
    (m) => [`evaluate ${m[1].trim()}`, `evaluate ${m[2].trim()}`, `compare ${m[1].trim()} vs ${m[2].trim()}`],
  ],
  // "differences between X and Y" → ["characterize X", "characterize Y", "differences between X and Y"]
  [
    /\bdifferences?\s+between\s+(.+?)\s+and\s+(.+?)(?:[,;.]|$)/i,
    (m) => [
      `characterize ${m[1].trim()}`,
      `characterize ${m[2].trim()}`,
      `differences between ${m[1].trim()} and ${m[2].trim()}`,
    ],
  ],
  // "pros and cons of X" → ["pros of X", "cons of X", "weigh pros and cons of X"]
  [
    /\bpros\s+and\s+cons\s+of\s+(.+?)(?:[,;.]|$)/i,
    (m) => [
      `pros of ${m[1].trim()}`,
      `cons of ${m[1].trim()}`,
      `weigh pros and cons of ${m[1].trim()}`,
    ],
  ],
];

/**
 * Heuristic-only sub-question decomposer.
 *
 * Operates in three passes:
 * 1. Compound-pattern expansion — detects "compare X and Y" style phrasing
 *    and synthesises the implied analysis chain.
 * 2. Conjunction splitting — breaks on "and then", "then", "also", ";".
 * 3. Multi-step markers — splits on "first … then … finally" sequences.
 *
 * No LLM calls are made.  All operations are O(n) in input length.
 */
export class SubQuestionDecomposer {
  /**
   * Decompose `query` into a list of sub-question strings.
   * The returned list is ordered so that prerequisite questions precede
   * synthesis questions (e.g. "analyze X" comes before "compare X and Y").
   */
  decompose(query: string): string[] {
    const trimmed = query.trim();

    // --- Pass 1: compound-pattern expansion ---
    for (const [pattern, expander] of COMPOUND_PATTERNS) {
      const match = trimmed.match(pattern);
      if (match) {
        // Expand and clean up any duplicates introduced by the expander.
        return this._deduplicate(expander(match).map(s => s.trim()).filter(s => s.length > 0));
      }
    }

    // --- Pass 2: conjunction / punctuation splitting ---
    let parts = this._splitOnConjunctions(trimmed);

    // --- Pass 3: multi-step marker detection ---
    parts = this._expandMultiStep(parts);

    // Guard: if decomposition produced nothing useful, return the original.
    const cleaned = parts.map(s => s.trim()).filter(s => s.length > 2);
    return cleaned.length > 0 ? this._deduplicate(cleaned) : [trimmed];
  }

  // Split the input on conjunction markers.
  private _splitOnConjunctions(text: string): string[] {
    let parts: string[] = [text];
    for (const splitter of CONJUNCTION_SPLITTERS) {
      parts = parts.flatMap(p => p.split(splitter));
    }
    return parts;
  }

  // Detect "first … then … finally" sequences inside a part and explode them.
  private _expandMultiStep(parts: string[]): string[] {
    const result: string[] = [];
    const stepMarker = /\b(first|second|third|next|then|subsequently|finally|lastly)\b[,:]?\s*/gi;
    for (const part of parts) {
      if (stepMarker.test(part)) {
        // Reset lastIndex after the .test() call consumed it.
        stepMarker.lastIndex = 0;
        const subParts = part.split(stepMarker).filter(s => !/^(first|second|third|next|then|subsequently|finally|lastly)$/i.test(s.trim()));
        result.push(...subParts);
      } else {
        result.push(part);
      }
    }
    return result;
  }

  // Remove exact duplicates while preserving order.
  private _deduplicate(items: string[]): string[] {
    const seen = new Set<string>();
    return items.filter(item => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

// ============================================================================
// PlanAndBudgetAllocator — decompose + proportional budget assignment
// ============================================================================

/**
 * Decomposes a complex query into ordered sub-questions and allocates a
 * proportional token budget to each based on heuristic complexity scoring.
 *
 * Budget allocation formula:
 *   budgetTokens_i = totalBudget * complexity_i / Σ complexity_j
 *
 * This is deliberately simpler than the polynomial-decay phase schedule used
 * inside `BudgetForcer` — it distributes tokens between *independent*
 * sub-questions rather than within a single reasoning chain.
 */
export class PlanAndBudgetAllocator {
  private readonly _decomposer: SubQuestionDecomposer;

  constructor(decomposer?: SubQuestionDecomposer) {
    this._decomposer = decomposer ?? new SubQuestionDecomposer();
  }

  /**
   * Produce a `ForcingBudgetPlan` for `query` given `totalBudget` tokens.
   *
   * Steps:
   * 1. Decompose query into sub-questions.
   * 2. Score each sub-question with `estimateComplexity`.
   * 3. Normalise scores → fractional weights.
   * 4. Multiply by `totalBudget`; assign integer tokens (remainder to last).
   * 5. Assign priorities: earlier sub-questions get lower (higher-priority) numbers.
   */
  allocate(query: string, totalBudget: number): ForcingBudgetPlan {
    const subQuestions = this._decomposer.decompose(query);

    // Score each sub-question independently.
    const scores: number[] = subQuestions.map(sq => {
      const est = estimateComplexity(sq);
      // Use at least a tiny positive value so every sub-question receives tokens.
      return Math.max(est.score, 0.05);
    });

    const scoreSum = scores.reduce((a, b) => a + b, 0);

    let allocated = 0;
    const subQuestionBudgets: SubQuestionBudget[] = subQuestions.map((sq, i) => {
      const fraction = scores[i] / scoreSum;
      // Last sub-question absorbs rounding remainder.
      const tokens = i < subQuestions.length - 1
        ? Math.max(1, Math.floor(totalBudget * fraction))
        : Math.max(1, totalBudget - allocated);

      allocated += tokens;

      return {
        question: sq,
        budgetTokens: tokens,
        priority: i + 1,          // 1-based, lower = higher priority
        complexity: scores[i],
      };
    });

    return {
      subQuestions: subQuestionBudgets,
      totalBudget,
    };
  }
}

// ============================================================================
// BudgetForcer — synchronous "Wait"-token forcing engine
// ============================================================================

/**
 * Wraps a synchronous text-generation callback and enforces extended thinking
 * via the s1 "Wait" token technique.
 *
 * The forcer operates in a simple generation loop:
 *
 *   while tokensUsed < maxTokens:
 *     chunk = generate(accumulated_text, remainingBudget)
 *     accumulate chunk
 *     if model_wants_to_stop AND tokensUsed < minTokens:
 *       append Wait-prompt   // force extension
 *       rounds++
 *     elif model_wants_to_stop AND tokensUsed >= minTokens:
 *       break                // honour EOS
 *
 * The `generate` callback is intentionally synchronous and returns a
 * `GenerationChunk` so the forcer can inspect `isEOS` without awaiting
 * network I/O — real async integrations should wrap an async LLM call inside
 * a synchronous adapter or use `applyBudgetForcing` directly.
 *
 * For test environments (or when no real LLM is wired) the forcer accepts a
 * stub generator via the constructor.
 */
export interface GenerationChunk {
  /** The text produced in this generation step. */
  text: string;
  /**
   * True when the underlying model has signalled end-of-sequence.
   * The forcer uses this together with `tokensUsed` to decide whether to
   * honour the stop or inject a continuation prompt.
   */
  isEOS: boolean;
  /**
   * Optional model confidence in [0, 1].
   * When provided, the forcer uses it alongside the phase schedule to make
   * more informed extension / truncation decisions via `shouldExtendThinking`
   * and `shouldTruncateThinking`.
   */
  confidence?: number;
}

/** Synchronous generation callback type accepted by `BudgetForcer`. */
export type GenerateFn = (
  accumulated: string,
  tokensRemaining: number,
) => GenerationChunk;

/**
 * Rough token count estimator — 1 token ≈ 4 characters (GPT-4 / Claude rule).
 * This is used internally; callers who know the exact token count should pass
 * `tokensUsed` directly.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class BudgetForcer {
  private readonly _config: BudgetForcingConfig;
  private readonly _generate: GenerateFn;

  constructor(config: BudgetForcingConfig, generate: GenerateFn) {
    this._config = config;
    this._generate = generate;
  }

  /**
   * Run the forcing loop against `prompt` and return a `BudgetForcingResult`.
   *
   * When `budgetForcing` is false in the config, this makes exactly one call
   * to the generator and returns immediately.
   */
  force(prompt: string): BudgetForcingResult {
    const { minTokens, maxTokens, budgetForcing, waitPrompt } = this._config;

    // Pass-through mode — forcing disabled.
    if (!budgetForcing) {
      const chunk = this._generate(prompt, maxTokens);
      return {
        text: chunk.text,
        tokensUsed: estimateTokens(chunk.text),
        forcingApplied: false,
        rounds: 0,
      };
    }

    // Build a lightweight budget for shouldExtendThinking /
    // shouldTruncateThinking to consult.
    const { budget } = planBudget(prompt, maxTokens);

    let accumulated = '';
    let tokensUsed = 0;
    let forcingApplied = false;
    let rounds = 0;
    let iterations = 0;
    // Safety cap: never loop more than 32 times regardless of token counts.
    const MAX_ITERATIONS = 32;

    while (tokensUsed < maxTokens && iterations < MAX_ITERATIONS) {
      iterations++;
      const remaining = maxTokens - tokensUsed;
      const chunk = this._generate(accumulated, remaining);

      accumulated += chunk.text;
      tokensUsed = estimateTokens(accumulated);

      if (chunk.isEOS || chunk.text.length === 0) {
        // The model signalled end-of-sequence.
        const confidence = chunk.confidence ?? 0.5;

        // Check truncation first — if confidence is high enough, respect EOS.
        if (shouldTruncateThinking(tokensUsed, budget, confidence)) {
          break;
        }

        // Check extension — if we haven't hit the floor, inject a Wait prompt.
        if (shouldExtendThinking(tokensUsed, budget, confidence)) {
          const continuation = waitPrompt ?? getBudgetForcingPrompt(tokensUsed);
          accumulated += ` ${continuation} `;
          tokensUsed = estimateTokens(accumulated);
          forcingApplied = true;
          rounds++;
          // Continue the loop — next iteration generates more text.
          continue;
        }

        // Neither extend nor truncate condition triggered → honour EOS.
        // (This covers the window: floor ≤ tokensUsed < softCeiling with
        // confidence above phase threshold.)
        break;
      }

      // Non-EOS chunk: check if we have hit the hard max.
      if (tokensUsed >= maxTokens) break;
    }

    return {
      text: accumulated,
      tokensUsed,
      forcingApplied,
      rounds,
    };
  }
}

// ============================================================================
// applyBudgetForcing — top-level integration hook
// ============================================================================

/**
 * Synchronous integration hook for the existing thinking pipeline.
 *
 * This is a pure-heuristic fallback that does NOT call an external LLM.
 * It simulates the forcing loop by:
 *   1. Treating `prompt` as the initial "generated" text.
 *   2. Padding with structured continuation prompts until `minTokens` is met.
 *   3. Truncating at `maxTokens` characters (≈ tokens * 4).
 *
 * Callers that have a real generator function should construct a `BudgetForcer`
 * directly and pass their own `GenerateFn`.
 *
 * This function is stable and synchronous — it never throws.
 *
 * @param prompt - The initial prompt / partial reasoning trace.
 * @param config - Budget forcing configuration.
 * @returns `BudgetForcingResult` with the final text and metadata.
 */
export function applyBudgetForcing(
  prompt: string,
  config: BudgetForcingConfig,
): BudgetForcingResult {
  if (!config.budgetForcing) {
    const tokensUsed = estimateTokens(prompt);
    return {
      text: prompt,
      tokensUsed,
      forcingApplied: false,
      rounds: 0,
    };
  }

  const { minTokens, maxTokens, waitPrompt } = config;
  const maxChars = maxTokens * 4;

  let text = prompt;
  let rounds = 0;
  let forcingApplied = false;

  // Pad until we reach minTokens or exhaust maxTokens.
  while (estimateTokens(text) < minTokens && text.length < maxChars) {
    const continuation = waitPrompt ?? getBudgetForcingPrompt(estimateTokens(text));
    text = `${text} ${continuation}`;
    forcingApplied = true;
    rounds++;

    // Safety: if padding somehow doesn't increase length (empty continuation),
    // break to avoid an infinite loop.
    if (continuation.trim().length === 0) break;
  }

  // Hard truncation at maxTokens.
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
  }

  return {
    text,
    tokensUsed: estimateTokens(text),
    forcingApplied,
    rounds,
  };
}
