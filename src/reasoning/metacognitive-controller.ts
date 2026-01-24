/**
 * Genesis v11.5 - Metacognitive Controller
 *
 * Novel contribution: EFE-driven reasoning strategy selection.
 * Uses Active Inference to select the optimal cognitive strategy,
 * implements metacognitive feedback loops, and integrates
 * NeurosymbolicReasoner as context enrichment.
 *
 * This is the first implementation combining:
 * - Active Inference (EFE minimization over cognitive strategies)
 * - IIT (phi-gated strategy complexity)
 * - GWT (broadcast reasoning results)
 * - Metacognition (think about thinking, learn from outcomes)
 * - Neurosymbolic Knowledge (graph-enriched reasoning context)
 *
 * Architecture:
 * ```
 * ┌──────────────────────────────────────────────────────────────────┐
 * │                 METACOGNITIVE CONTROLLER                         │
 * │                                                                  │
 * │  Input → [Complexity Estimation] → [EFE Strategy Selection]      │
 * │                                          ↓                       │
 * │  [Knowledge Graph Enrichment] ← ─ ─ ─ [Strategy Execution]      │
 * │                                          ↓                       │
 * │  [Confidence Check] → if low → [Escalation] → retry             │
 * │         ↓                                                        │
 * │  [Outcome Recording] → [Belief Update] → learns for next time   │
 * └──────────────────────────────────────────────────────────────────┘
 * ```
 *
 * References:
 * - Friston (2017) "Active Inference and Learning"
 * - Flavell (1979) "Metacognition and Cognitive Monitoring"
 * - Tononi (2004) "An Information Integration Theory of Consciousness"
 * - Baars (1988) "A Cognitive Theory of Consciousness"
 * - arXiv:2305.10601 "Tree of Thoughts" (Yao et al. 2023)
 * - arXiv:2308.09687 "Graph of Thoughts" (Besta et al. 2023)
 */

import {
  NeurosymbolicReasoner,
  Entity,
  Relation,
  ReasoningResult as NSARResult,
} from './neurosymbolic.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Available reasoning strategies, ordered by compute cost
 */
export type ReasoningStrategy =
  | 'sequential'       // Default 5-stage pipeline (fast)
  | 'neurosymbolic'   // Knowledge graph enriched reasoning
  | 'tree_of_thought' // BFS/DFS/MCTS tree search
  | 'graph_of_thought' // GoT with aggregation (k→1)
  | 'super_correct'   // Hierarchical templates + correction
  | 'ultimate';        // All strategies combined

/**
 * Problem complexity estimate
 */
export interface ComplexityEstimate {
  level: 'trivial' | 'simple' | 'moderate' | 'complex' | 'extreme';
  score: number;           // 0-1 continuous
  dimensions: {
    abstractness: number;  // How abstract is the problem?
    compositionality: number; // How many sub-problems?
    novelty: number;       // How novel vs. known patterns?
    precision: number;     // How precise must the answer be?
    ambiguity: number;     // How ambiguous is the input?
  };
  reasoning: string;       // Why this complexity level
}

/**
 * EFE score for a reasoning strategy
 */
export interface StrategyEFE {
  strategy: ReasoningStrategy;
  efe: number;             // Expected Free Energy (lower = better)
  ambiguity: number;       // Uncertainty about outcome quality
  risk: number;            // Computational cost + time risk
  infoGain: number;        // Expected uncertainty reduction
  phiBonus: number;        // Consciousness alignment bonus
  reasoning: string;
}

/**
 * Result from metacognitive reasoning
 */
export interface MetacognitiveResult {
  response: string;
  confidence: number;
  strategy: ReasoningStrategy;
  escalations: number;     // How many times we escalated
  enrichment: {
    knowledgePaths: number;
    entitiesUsed: number;
    newKnowledge: number;
  };
  efe: StrategyEFE;
  complexity: ComplexityEstimate;
  duration: number;
  trace: MetacognitiveStep[];
}

export interface MetacognitiveStep {
  phase: 'estimate' | 'select' | 'enrich' | 'execute' | 'evaluate' | 'escalate' | 'learn';
  strategy?: ReasoningStrategy;
  confidence?: number;
  duration: number;
  detail: string;
}

/**
 * Strategy execution history for learning
 */
interface StrategyHistory {
  attempts: number;
  successes: number;        // confidence > threshold
  avgConfidence: number;
  avgDuration: number;
  avgComplexity: number;    // What complexity level it was used for
  surpriseHistory: number[]; // Prediction errors
}

/**
 * Configuration
 */
export interface MetacognitiveConfig {
  // Confidence thresholds
  minConfidence: number;           // Below this, escalate (default: 0.5)
  targetConfidence: number;        // Desired confidence (default: 0.75)

  // Escalation
  maxEscalations: number;          // Max strategy upgrades (default: 2)
  escalationPenalty: number;       // EFE penalty per escalation (default: 0.5)

  // Compute budget
  maxComputeTokens: number;        // Max tokens across all strategies (default: 65536)
  timeoutMs: number;               // Max time for reasoning (default: 60000)

  // Knowledge enrichment
  enableKnowledgeEnrichment: boolean; // Use neurosymbolic (default: true)
  maxKnowledgePaths: number;       // Max paths to inject (default: 5)
  knowledgeRelevanceThreshold: number; // Min relevance (default: 0.3)

  // Learning
  learningRate: number;            // How fast to update beliefs (default: 0.1)
  historyWindow: number;           // Recent outcomes to consider (default: 50)

  // Phi gating
  minPhiForAdvanced: number;       // Min phi for ToT/GoT (default: 0.4)
  minPhiForUltimate: number;       // Min phi for ultimate (default: 0.7)
}

export const DEFAULT_METACOGNITIVE_CONFIG: MetacognitiveConfig = {
  minConfidence: 0.5,
  targetConfidence: 0.75,
  maxEscalations: 2,
  escalationPenalty: 0.5,
  maxComputeTokens: 65536,
  timeoutMs: 60000,
  enableKnowledgeEnrichment: true,
  maxKnowledgePaths: 5,
  knowledgeRelevanceThreshold: 0.3,
  learningRate: 0.1,
  historyWindow: 50,
  minPhiForAdvanced: 0.4,
  minPhiForUltimate: 0.7,
};

// ============================================================================
// Strategy Properties (prior knowledge)
// ============================================================================

interface StrategyProfile {
  computeCost: number;     // Relative compute (0-1)
  expectedQuality: number; // Prior quality expectation (0-1)
  informationGain: number; // How much uncertainty it reduces (0-1)
  latencyMs: number;       // Expected latency
  tokenBudget: number;     // Tokens typically consumed
}

const STRATEGY_PROFILES: Record<ReasoningStrategy, StrategyProfile> = {
  sequential: {
    computeCost: 0.1,
    expectedQuality: 0.6,
    informationGain: 0.5,
    latencyMs: 3000,
    tokenBudget: 4096,
  },
  neurosymbolic: {
    computeCost: 0.2,
    expectedQuality: 0.7,
    informationGain: 0.7,
    latencyMs: 5000,
    tokenBudget: 6144,
  },
  tree_of_thought: {
    computeCost: 0.5,
    expectedQuality: 0.8,
    informationGain: 0.8,
    latencyMs: 15000,
    tokenBudget: 16384,
  },
  graph_of_thought: {
    computeCost: 0.6,
    expectedQuality: 0.85,
    informationGain: 0.85,
    latencyMs: 20000,
    tokenBudget: 24576,
  },
  super_correct: {
    computeCost: 0.7,
    expectedQuality: 0.88,
    informationGain: 0.8,
    latencyMs: 25000,
    tokenBudget: 32768,
  },
  ultimate: {
    computeCost: 1.0,
    expectedQuality: 0.95,
    informationGain: 0.95,
    latencyMs: 45000,
    tokenBudget: 65536,
  },
};

// Strategy escalation order
const ESCALATION_ORDER: ReasoningStrategy[] = [
  'sequential',
  'neurosymbolic',
  'tree_of_thought',
  'graph_of_thought',
  'super_correct',
  'ultimate',
];

// ============================================================================
// Metacognitive Controller
// ============================================================================

export class MetacognitiveController {
  private config: MetacognitiveConfig;
  private reasoner: NeurosymbolicReasoner;

  // Learning state
  private strategyHistory: Map<ReasoningStrategy, StrategyHistory> = new Map();
  private beliefsPrecision: number = 1.0;
  private totalReasoning: number = 0;

  // External integrations (injected)
  private getPhiLevel: () => number = () => 0.5;
  private executeStrategy: ((strategy: ReasoningStrategy, problem: string, context: string) =>
    Promise<{ response: string; confidence: number; tokens: number }>) | null = null;

  constructor(config: Partial<MetacognitiveConfig> = {}) {
    this.config = { ...DEFAULT_METACOGNITIVE_CONFIG, ...config };
    this.reasoner = new NeurosymbolicReasoner({
      maxHops: 5,
      beamWidth: 10,
      neuralWeight: 0.5,
      symbolicWeight: 0.5,
      useChainOfThought: true,
      enableBacktracking: true,
    });

    // Initialize strategy histories with optimistic priors
    for (const strategy of ESCALATION_ORDER) {
      this.strategyHistory.set(strategy, {
        attempts: 0,
        successes: 0,
        avgConfidence: STRATEGY_PROFILES[strategy].expectedQuality,
        avgDuration: STRATEGY_PROFILES[strategy].latencyMs,
        avgComplexity: strategy === 'sequential' ? 0.3 : strategy === 'ultimate' ? 0.9 : 0.5,
        surpriseHistory: [],
      });
    }
  }

  // ============================================================================
  // Configuration & Integration
  // ============================================================================

  /**
   * Set phi level provider (from PhiMonitor)
   */
  setPhiProvider(provider: () => number): void {
    this.getPhiLevel = provider;
  }

  /**
   * Set strategy executor (from ThinkingEngine)
   */
  setStrategyExecutor(executor: (strategy: ReasoningStrategy, problem: string, context: string) =>
    Promise<{ response: string; confidence: number; tokens: number }>): void {
    this.executeStrategy = executor;
  }

  /**
   * Get the NeurosymbolicReasoner for external knowledge operations
   */
  getReasoner(): NeurosymbolicReasoner {
    return this.reasoner;
  }

  // ============================================================================
  // Main Entry Point
  // ============================================================================

  /**
   * Metacognitive reasoning: select strategy via EFE, execute, evaluate, learn.
   *
   * @param problem - The problem to reason about
   * @param context - Current context (from workspace/memory)
   * @param computeBudget - Optional token budget override
   */
  async reason(
    problem: string,
    context: string = '',
    computeBudget?: number
  ): Promise<MetacognitiveResult> {
    const startTime = Date.now();
    const trace: MetacognitiveStep[] = [];
    const budget = computeBudget || this.config.maxComputeTokens;
    let tokensUsed = 0;

    // ─── Phase 1: Estimate Complexity ───────────────────────────────
    const complexity = this.estimateComplexity(problem, context);
    trace.push({
      phase: 'estimate',
      duration: Date.now() - startTime,
      detail: `Complexity: ${complexity.level} (${complexity.score.toFixed(2)})`,
    });

    // ─── Phase 2: Knowledge Graph Enrichment ────────────────────────
    let enrichedContext = context;
    let enrichment = { knowledgePaths: 0, entitiesUsed: 0, newKnowledge: 0 };

    if (this.config.enableKnowledgeEnrichment) {
      const enrichStart = Date.now();
      const enrichResult = await this.enrichWithKnowledge(problem, context);
      enrichedContext = enrichResult.enrichedContext;
      enrichment = enrichResult.stats;
      trace.push({
        phase: 'enrich',
        duration: Date.now() - enrichStart,
        detail: `Knowledge: ${enrichment.knowledgePaths} paths, ${enrichment.entitiesUsed} entities`,
      });
    }

    // ─── Phase 3: EFE Strategy Selection ────────────────────────────
    const phi = this.getPhiLevel();
    const strategyScores = this.computeAllEFE(complexity, phi, budget, tokensUsed);
    const selectedEFE = strategyScores[0]; // Best (lowest EFE)

    trace.push({
      phase: 'select',
      strategy: selectedEFE.strategy,
      duration: Date.now() - startTime,
      detail: `Selected: ${selectedEFE.strategy} (EFE=${selectedEFE.efe.toFixed(3)}, phi=${phi.toFixed(2)})`,
    });

    // ─── Phase 4: Execute with Escalation Loop ──────────────────────
    let currentStrategy = selectedEFE.strategy;
    let response = '';
    let confidence = 0;
    let escalations = 0;

    while (escalations <= this.config.maxEscalations) {
      const execStart = Date.now();

      // Check timeout
      if (Date.now() - startTime > this.config.timeoutMs) {
        trace.push({
          phase: 'execute',
          strategy: currentStrategy,
          duration: Date.now() - execStart,
          detail: 'Timeout reached',
        });
        break;
      }

      // Check compute budget
      const strategyBudget = STRATEGY_PROFILES[currentStrategy].tokenBudget;
      if (tokensUsed + strategyBudget > budget) {
        trace.push({
          phase: 'execute',
          strategy: currentStrategy,
          duration: Date.now() - execStart,
          detail: `Budget exceeded (${tokensUsed}/${budget})`,
        });
        break;
      }

      // Execute strategy
      const result = await this.executeStrategyCall(currentStrategy, problem, enrichedContext);
      response = result.response;
      confidence = result.confidence;
      tokensUsed += result.tokens;

      trace.push({
        phase: 'execute',
        strategy: currentStrategy,
        confidence,
        duration: Date.now() - execStart,
        detail: `Confidence: ${confidence.toFixed(2)}, tokens: ${result.tokens}`,
      });

      // ─── Phase 5: Evaluate & Decide ────────────────────────────────
      if (confidence >= this.config.minConfidence) {
        // Good enough
        trace.push({
          phase: 'evaluate',
          confidence,
          duration: 0,
          detail: `Accepted (>= ${this.config.minConfidence})`,
        });
        break;
      }

      // Escalate
      const nextStrategy = this.getNextStrategy(currentStrategy);
      if (!nextStrategy) {
        trace.push({
          phase: 'evaluate',
          confidence,
          duration: 0,
          detail: 'No higher strategy available',
        });
        break;
      }

      // Check phi allows escalation
      const nextProfile = STRATEGY_PROFILES[nextStrategy];
      if (nextProfile.computeCost > 0.4 && phi < this.config.minPhiForAdvanced) {
        trace.push({
          phase: 'escalate',
          strategy: nextStrategy,
          duration: 0,
          detail: `Phi too low (${phi.toFixed(2)} < ${this.config.minPhiForAdvanced}) for ${nextStrategy}`,
        });
        break;
      }

      trace.push({
        phase: 'escalate',
        strategy: nextStrategy,
        duration: 0,
        detail: `Escalating: ${currentStrategy} → ${nextStrategy} (confidence ${confidence.toFixed(2)} < ${this.config.minConfidence})`,
      });

      currentStrategy = nextStrategy;
      escalations++;
    }

    // ─── Phase 6: Learn from Outcome ──────────────────────────────────
    this.recordOutcome(currentStrategy, confidence, Date.now() - startTime, complexity.score);
    trace.push({
      phase: 'learn',
      strategy: currentStrategy,
      confidence,
      duration: 0,
      detail: `Recorded: strategy=${currentStrategy}, conf=${confidence.toFixed(2)}`,
    });

    // Extract new knowledge from response (async, non-blocking)
    if (response && this.config.enableKnowledgeEnrichment) {
      this.extractAndStoreKnowledge(response).catch(() => {});
    }

    return {
      response,
      confidence,
      strategy: currentStrategy,
      escalations,
      enrichment,
      efe: selectedEFE,
      complexity,
      duration: Date.now() - startTime,
      trace,
    };
  }

  // ============================================================================
  // Complexity Estimation
  // ============================================================================

  /**
   * Estimate problem complexity using linguistic and structural cues.
   */
  estimateComplexity(problem: string, context: string = ''): ComplexityEstimate {
    const text = problem + ' ' + context;
    const words = problem.split(/\s+/);
    const sentences = problem.split(/[.!?]+/).filter(s => s.trim().length > 0);

    // ─── Abstractness: presence of abstract concepts ─────────────────
    const abstractMarkers = [
      'concept', 'theory', 'principle', 'framework', 'paradigm', 'abstraction',
      'metaphysical', 'ontological', 'epistemological', 'philosophical',
      'hypothesis', 'axiom', 'theorem', 'formal', 'proof',
    ];
    const abstractCount = abstractMarkers.filter(m => text.toLowerCase().includes(m)).length;
    const abstractness = Math.min(1, abstractCount / 3);

    // ─── Compositionality: multiple sub-problems ─────────────────────
    const compositionalMarkers = [
      'and then', 'first', 'second', 'third', 'next', 'finally',
      'step 1', 'step 2', 'moreover', 'additionally', 'furthermore',
      'compare', 'contrast', 'both', 'multiple', 'each',
    ];
    const compositionalCount = compositionalMarkers.filter(m => text.toLowerCase().includes(m)).length;
    const compositionality = Math.min(1, compositionalCount / 4 + (sentences.length > 3 ? 0.2 : 0));

    // ─── Novelty: unusual words, questions about new things ──────────
    const noveltyMarkers = [
      'novel', 'new', 'innovative', 'unprecedented', 'unique',
      'create', 'invent', 'design', 'imagine', 'hypothetical',
      'what if', 'how would', 'could we',
    ];
    const noveltyCount = noveltyMarkers.filter(m => text.toLowerCase().includes(m)).length;
    const novelty = Math.min(1, noveltyCount / 3);

    // ─── Precision: need for exact answers ───────────────────────────
    const precisionMarkers = [
      'exact', 'precise', 'specific', 'calculate', 'compute',
      'prove', 'derive', 'formula', 'equation', 'quantify',
      'how many', 'how much', 'what is the value',
    ];
    const precisionCount = precisionMarkers.filter(m => text.toLowerCase().includes(m)).length;
    const precision = Math.min(1, precisionCount / 3);

    // ─── Ambiguity: unclear or multi-interpretation ──────────────────
    const ambiguityMarkers = [
      'maybe', 'perhaps', 'could be', 'either', 'or',
      'ambiguous', 'unclear', 'depends', 'context', 'interpret',
      'what do you think', 'opinion',
    ];
    const ambiguityCount = ambiguityMarkers.filter(m => text.toLowerCase().includes(m)).length;
    const questionMarks = (problem.match(/\?/g) || []).length;
    const ambiguity = Math.min(1, ambiguityCount / 3 + (questionMarks > 2 ? 0.2 : 0));

    // ─── Composite score ─────────────────────────────────────────────
    const score = (
      abstractness * 0.25 +
      compositionality * 0.25 +
      novelty * 0.2 +
      precision * 0.15 +
      ambiguity * 0.15
    );

    // Length bonus: longer problems tend to be more complex
    const lengthBonus = Math.min(0.2, words.length / 500);
    const finalScore = Math.min(1, score + lengthBonus);

    // Classify level
    let level: ComplexityEstimate['level'];
    if (finalScore < 0.15) level = 'trivial';
    else if (finalScore < 0.35) level = 'simple';
    else if (finalScore < 0.55) level = 'moderate';
    else if (finalScore < 0.75) level = 'complex';
    else level = 'extreme';

    const reasoning = [
      `score=${finalScore.toFixed(2)}`,
      abstractness > 0.3 ? `abstract=${abstractness.toFixed(1)}` : '',
      compositionality > 0.3 ? `comp=${compositionality.toFixed(1)}` : '',
      novelty > 0.3 ? `novel=${novelty.toFixed(1)}` : '',
      precision > 0.3 ? `precise=${precision.toFixed(1)}` : '',
      ambiguity > 0.3 ? `ambig=${ambiguity.toFixed(1)}` : '',
    ].filter(Boolean).join(', ');

    return {
      level,
      score: finalScore,
      dimensions: { abstractness, compositionality, novelty, precision, ambiguity },
      reasoning,
    };
  }

  // ============================================================================
  // EFE Strategy Selection
  // ============================================================================

  /**
   * Compute EFE for all available strategies and return sorted (best first).
   *
   * EFE(strategy) = ambiguity + risk - infoGain - phiBonus
   *
   * Where:
   * - ambiguity: variance of past confidence outcomes (how unpredictable is this strategy?)
   * - risk: compute cost + time cost + failure probability
   * - infoGain: expected uncertainty reduction × complexity alignment
   * - phiBonus: bonus for strategies aligned with current consciousness level
   */
  computeAllEFE(
    complexity: ComplexityEstimate,
    phi: number,
    budget: number,
    tokensUsed: number
  ): StrategyEFE[] {
    const scores: StrategyEFE[] = [];

    for (const strategy of ESCALATION_ORDER) {
      const profile = STRATEGY_PROFILES[strategy];
      const history = this.strategyHistory.get(strategy)!;

      // ─── Phi gating: block strategies beyond consciousness level ───
      if (profile.computeCost > 0.4 && phi < this.config.minPhiForAdvanced) {
        scores.push({
          strategy, efe: Infinity, ambiguity: 1, risk: 1, infoGain: 0, phiBonus: 0,
          reasoning: `Blocked: phi ${phi.toFixed(2)} < ${this.config.minPhiForAdvanced}`,
        });
        continue;
      }
      if (strategy === 'ultimate' && phi < this.config.minPhiForUltimate) {
        scores.push({
          strategy, efe: Infinity, ambiguity: 1, risk: 1, infoGain: 0, phiBonus: 0,
          reasoning: `Blocked: phi ${phi.toFixed(2)} < ${this.config.minPhiForUltimate}`,
        });
        continue;
      }

      // ─── Budget gating: block if can't afford ─────────────────────
      if (tokensUsed + profile.tokenBudget > budget) {
        scores.push({
          strategy, efe: Infinity, ambiguity: 1, risk: 1, infoGain: 0, phiBonus: 0,
          reasoning: `Blocked: budget ${tokensUsed + profile.tokenBudget} > ${budget}`,
        });
        continue;
      }

      // ─── Ambiguity: how unpredictable is this strategy? ────────────
      let ambiguity: number;
      if (history.attempts >= 5) {
        // Use variance of past confidence as ambiguity
        const surprises = history.surpriseHistory.slice(-this.config.historyWindow);
        const avgSurprise = surprises.reduce((s, v) => s + v, 0) / surprises.length;
        const variance = surprises.reduce((s, v) => s + (v - avgSurprise) ** 2, 0) / surprises.length;
        ambiguity = Math.sqrt(variance) + (1 - history.avgConfidence) * 0.3;
      } else {
        // Prior: new strategies have moderate ambiguity (explore bonus)
        ambiguity = 1.5 - history.attempts * 0.25;
      }

      // ─── Risk: compute cost + time cost + failure probability ──────
      const computeRisk = profile.computeCost * 2.0;
      const timeRisk = Math.min(1, profile.latencyMs / this.config.timeoutMs);
      const failureRisk = history.attempts > 0
        ? (1 - history.successes / history.attempts) * 1.5
        : 0.3; // Optimistic prior for new strategies
      const risk = computeRisk + timeRisk * 0.5 + failureRisk;

      // ─── Information Gain: alignment with complexity ───────────────
      // Higher complexity problems benefit more from advanced strategies
      const complexityAlignment = 1 - Math.abs(complexity.score - profile.computeCost);
      const baseInfoGain = profile.informationGain * complexityAlignment;
      const learningBonus = history.attempts < 3 ? 0.3 : 0; // Exploration bonus
      const infoGain = (baseInfoGain + learningBonus) * this.beliefsPrecision;

      // ─── Phi Bonus: consciousness alignment ────────────────────────
      // Higher phi → more complex strategies get bonus
      const phiAlignment = phi * profile.computeCost;
      const phiBonus = phiAlignment * 0.5;

      // ─── Final EFE ────────────────────────────────────────────────
      const efe = ambiguity + risk - infoGain - phiBonus;

      const reasoning = [
        `EFE=${efe.toFixed(3)}`,
        `amb=${ambiguity.toFixed(2)}`,
        `risk=${risk.toFixed(2)}`,
        `gain=${infoGain.toFixed(2)}`,
        `phi_b=${phiBonus.toFixed(2)}`,
        `align=${complexityAlignment.toFixed(2)}`,
        history.attempts > 0 ? `n=${history.attempts}` : 'new',
      ].join(', ');

      scores.push({ strategy, efe, ambiguity, risk, infoGain, phiBonus, reasoning });
    }

    // Sort by EFE (lower is better)
    scores.sort((a, b) => a.efe - b.efe);
    return scores;
  }

  // ============================================================================
  // Knowledge Graph Enrichment
  // ============================================================================

  /**
   * Enrich the reasoning context with knowledge graph paths.
   */
  private async enrichWithKnowledge(
    problem: string,
    context: string
  ): Promise<{
    enrichedContext: string;
    stats: { knowledgePaths: number; entitiesUsed: number; newKnowledge: number };
  }> {
    try {
      // Extract entities from problem using simple extraction
      const entities = await this.extractEntitiesSimple(problem);

      if (entities.length === 0) {
        return { enrichedContext: context, stats: { knowledgePaths: 0, entitiesUsed: 0, newKnowledge: 0 } };
      }

      // Query knowledge graph for relevant paths via NeurosymbolicReasoner
      const nsarResult = await this.reasoner.reason({
        question: problem,
        context,
        maxHops: 3,
        requireExplanation: true,
      });

      // Build enrichment string from paths
      let enrichment = '';
      const usedPaths = nsarResult.paths.slice(0, this.config.maxKnowledgePaths);

      if (usedPaths.length > 0) {
        enrichment = '\n\n[Knowledge Graph Context]\n';
        for (const path of usedPaths) {
          if (path.score >= this.config.knowledgeRelevanceThreshold) {
            enrichment += `- ${path.explanation} (confidence: ${path.score.toFixed(2)})\n`;
          }
        }
      }

      // Add neurosymbolic reasoning if high confidence
      if (nsarResult.hybridScore > 0.5 && nsarResult.answer) {
        enrichment += `\n[Neurosymbolic Insight] ${nsarResult.answer} (score: ${nsarResult.hybridScore.toFixed(2)})\n`;
      }

      return {
        enrichedContext: context + enrichment,
        stats: {
          knowledgePaths: usedPaths.length,
          entitiesUsed: entities.length,
          newKnowledge: 0,
        },
      };
    } catch {
      // Knowledge enrichment is non-fatal
      return { enrichedContext: context, stats: { knowledgePaths: 0, entitiesUsed: 0, newKnowledge: 0 } };
    }
  }

  /**
   * Simple entity extraction fallback
   */
  private async extractEntitiesSimple(text: string): Promise<Entity[]> {
    const entities: Entity[] = [];
    const words = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];

    for (const word of words.slice(0, 10)) {
      entities.push({
        id: `entity_${word.toLowerCase().replace(/\s+/g, '_')}`,
        name: word,
        type: 'unknown',
        properties: { source: 'metacognitive_extraction' },
      });
    }

    return entities;
  }

  /**
   * Extract knowledge from response and store in graph (background)
   */
  private async extractAndStoreKnowledge(response: string): Promise<void> {
    try {
      const result = await this.reasoner.ingestText(response);
      // Knowledge is automatically added to the internal graph
      if (result.entities.length > 0 || result.relations.length > 0) {
        // Graph grows over time
      }
    } catch {
      // Non-fatal
    }
  }

  // ============================================================================
  // Strategy Execution
  // ============================================================================

  /**
   * Execute a reasoning strategy (delegates to ThinkingEngine via injected executor)
   */
  private async executeStrategyCall(
    strategy: ReasoningStrategy,
    problem: string,
    context: string
  ): Promise<{ response: string; confidence: number; tokens: number }> {
    if (this.executeStrategy) {
      return this.executeStrategy(strategy, problem, context);
    }

    // Fallback: no executor injected, return empty
    return {
      response: `[MetacognitiveController: No executor for ${strategy}]`,
      confidence: 0.1,
      tokens: 0,
    };
  }

  /**
   * Get next strategy in escalation order
   */
  private getNextStrategy(current: ReasoningStrategy): ReasoningStrategy | null {
    const idx = ESCALATION_ORDER.indexOf(current);
    if (idx < 0 || idx >= ESCALATION_ORDER.length - 1) return null;
    return ESCALATION_ORDER[idx + 1];
  }

  // ============================================================================
  // Learning
  // ============================================================================

  /**
   * Record outcome for strategy learning (Bayesian belief update)
   */
  private recordOutcome(
    strategy: ReasoningStrategy,
    confidence: number,
    durationMs: number,
    complexity: number
  ): void {
    const history = this.strategyHistory.get(strategy)!;
    const isSuccess = confidence >= this.config.minConfidence;

    // Prediction error (surprise)
    const expectedConfidence = history.avgConfidence;
    const surprise = Math.abs(confidence - expectedConfidence);

    // Update history
    history.attempts++;
    if (isSuccess) history.successes++;

    // Exponential moving average update
    const lr = this.config.learningRate;
    history.avgConfidence = history.avgConfidence * (1 - lr) + confidence * lr;
    history.avgDuration = history.avgDuration * (1 - lr) + durationMs * lr;
    history.avgComplexity = history.avgComplexity * (1 - lr) + complexity * lr;

    // Store surprise
    history.surpriseHistory.push(surprise);
    if (history.surpriseHistory.length > this.config.historyWindow) {
      history.surpriseHistory.shift();
    }

    // Update precision based on overall prediction accuracy
    this.totalReasoning++;
    if (this.totalReasoning > 10) {
      const allSurprises: number[] = [];
      for (const h of this.strategyHistory.values()) {
        allSurprises.push(...h.surpriseHistory.slice(-10));
      }
      if (allSurprises.length > 0) {
        const avgSurprise = allSurprises.reduce((s, v) => s + v, 0) / allSurprises.length;
        // Higher precision when predictions are accurate (low surprise)
        this.beliefsPrecision = 1 / (1 + avgSurprise);
      }
    }
  }

  // ============================================================================
  // Ingest Knowledge
  // ============================================================================

  /**
   * Manually add knowledge to the graph (for pre-loading domain knowledge)
   */
  addKnowledge(entities: Entity[], relations: Relation[]): void {
    this.reasoner.addKnowledge(entities, relations);
  }

  /**
   * Ingest text and extract knowledge automatically
   */
  async ingestText(text: string): Promise<{ entities: number; relations: number }> {
    const result = await this.reasoner.ingestText(text);
    return { entities: result.entities.length, relations: result.relations.length };
  }

  // ============================================================================
  // Stats & Debugging
  // ============================================================================

  /**
   * Get controller statistics
   */
  getStats(): {
    totalReasoning: number;
    beliefsPrecision: number;
    strategies: Record<ReasoningStrategy, {
      attempts: number;
      successRate: number;
      avgConfidence: number;
      avgDuration: number;
    }>;
    knowledgeGraph: { entities: number; relations: number; avgDegree: number };
  } {
    const strategies: any = {};
    for (const [strategy, history] of this.strategyHistory) {
      strategies[strategy] = {
        attempts: history.attempts,
        successRate: history.attempts > 0 ? history.successes / history.attempts : 0,
        avgConfidence: history.avgConfidence,
        avgDuration: history.avgDuration,
      };
    }

    return {
      totalReasoning: this.totalReasoning,
      beliefsPrecision: this.beliefsPrecision,
      strategies,
      knowledgeGraph: this.reasoner.getStats().graph,
    };
  }

  /**
   * Reset learning state (for testing)
   */
  resetLearning(): void {
    this.totalReasoning = 0;
    this.beliefsPrecision = 1.0;
    for (const strategy of ESCALATION_ORDER) {
      this.strategyHistory.set(strategy, {
        attempts: 0,
        successes: 0,
        avgConfidence: STRATEGY_PROFILES[strategy].expectedQuality,
        avgDuration: STRATEGY_PROFILES[strategy].latencyMs,
        avgComplexity: 0.5,
        surpriseHistory: [],
      });
    }
  }
}

// ============================================================================
// Factory & Singleton
// ============================================================================

let controllerInstance: MetacognitiveController | null = null;

export function getMetacognitiveController(
  config?: Partial<MetacognitiveConfig>
): MetacognitiveController {
  if (!controllerInstance) {
    controllerInstance = new MetacognitiveController(config);
  }
  return controllerInstance;
}

export function createMetacognitiveController(
  config?: Partial<MetacognitiveConfig>
): MetacognitiveController {
  return new MetacognitiveController(config);
}

export function resetMetacognitiveController(): void {
  controllerInstance = null;
}
