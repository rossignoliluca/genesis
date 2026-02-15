/**
 * Genesis - Test-Time Recursive Thinking (TRT) Engine
 *
 * Implements recursive self-improvement at reasoning time through:
 * 1. Generate candidate answers
 * 2. Self-verify each candidate
 * 3. Accumulate knowledge from verification failures
 * 4. Re-generate improved answers with accumulated context
 * 5. Repeat until convergence or max rounds
 *
 * Inspired by recursive thinking patterns where verification feedback
 * becomes training signal for the next round's generation.
 */

import { randomUUID } from 'crypto';
import { recallModuleLessons, recordModuleLesson } from '../memory/module-hooks.js';

// ============================================================================
// Types
// ============================================================================

export interface TRTConfig {
  /** Maximum recursion depth (default 3) */
  maxRecursions: number;
  /** How many candidates to generate per round (default 3) */
  candidatesPerRound: number;
  /** Stop early if improvement < this threshold (default 0.05 = 5%) */
  minImprovement: number;
  /** Which verification strategies to apply (default ['logical', 'completeness']) */
  verificationStrategies: string[];
  /** Whether to accumulate knowledge from verification (default true) */
  accumulateKnowledge: boolean;
}

export interface TRTCandidate {
  /** Unique candidate ID */
  id: string;
  /** Generated content/answer */
  content: string;
  /** Which recursion round this was generated in */
  round: number;
  /** Numerical score (0-1, higher is better) */
  score: number;
  /** Verification outcome */
  verificationResult: {
    confidence: number;
    issues: string[];
  };
  /** Parent candidate that inspired this one (if any) */
  parentId?: string;
}

export interface TRTResult {
  /** The best candidate across all rounds */
  bestCandidate: TRTCandidate;
  /** All candidates generated, sorted by score descending */
  allCandidates: TRTCandidate[];
  /** How many recursion rounds were executed */
  rounds: number;
  /** Total candidates evaluated across all rounds */
  totalCandidatesEvaluated: number;
  /** Best score achieved in each round */
  improvementHistory: number[];
  /** Knowledge accumulated during the process */
  knowledgeAccumulated: string[];
}

// ============================================================================
// Knowledge Accumulator
// ============================================================================

/**
 * Extracts actionable insights from verification failures.
 * These insights guide next-round generation to avoid repeating mistakes.
 */
export class KnowledgeAccumulator {
  private insights: string[] = [];
  private constraints: string[] = [];

  /**
   * Extract lessons from a candidate's verification issues.
   */
  addFromVerification(candidate: TRTCandidate, issues: string[]): void {
    if (!issues || issues.length === 0) {
      return;
    }

    // Extract patterns from issues
    for (const issue of issues) {
      // Convert specific failures to general insights
      if (issue.toLowerCase().includes('incomplete')) {
        this.insights.push('Ensure completeness - cover all aspects of the question');
      } else if (issue.toLowerCase().includes('vague') || issue.toLowerCase().includes('generic')) {
        this.insights.push('Be specific and concrete - avoid vague generalizations');
      } else if (issue.toLowerCase().includes('contradiction') || issue.toLowerCase().includes('inconsistent')) {
        this.insights.push('Maintain logical consistency - check for contradictions');
      } else if (issue.toLowerCase().includes('missing') || issue.toLowerCase().includes('lack')) {
        this.insights.push('Provide supporting details and evidence');
      } else if (issue.toLowerCase().includes('structure') || issue.toLowerCase().includes('organization')) {
        this.insights.push('Use clear structure with sections or bullet points');
      } else {
        // Generic insight from the issue
        this.insights.push(`Address: ${issue}`);
      }

      // Constraints: things to avoid
      if (candidate.score < 0.5) {
        this.constraints.push(`Avoid patterns like: "${candidate.content.slice(0, 100)}..."`);
      }
    }

    // Deduplicate
    this.insights = [...new Set(this.insights)];
    this.constraints = [...new Set(this.constraints)];
  }

  /**
   * Format accumulated knowledge as context string for next generation round.
   */
  getContext(): string {
    if (this.insights.length === 0 && this.constraints.length === 0) {
      return '';
    }

    const parts: string[] = [];

    if (this.insights.length > 0) {
      parts.push('**Lessons learned from previous attempts:**');
      parts.push(...this.insights.map((insight, i) => `${i + 1}. ${insight}`));
    }

    if (this.constraints.length > 0) {
      parts.push('\n**Avoid these patterns:**');
      parts.push(...this.constraints.map((c, i) => `${i + 1}. ${c}`));
    }

    return parts.join('\n');
  }

  /**
   * Get all accumulated insights (for result reporting).
   */
  getAllInsights(): string[] {
    return [...this.insights];
  }

  /**
   * Reset accumulator for a new problem.
   */
  reset(): void {
    this.insights = [];
    this.constraints = [];
  }
}

// ============================================================================
// Built-in Scoring for Simple Mode
// ============================================================================

/**
 * Simple built-in scoring when no custom scorer is provided.
 * Checks: length adequacy, specificity, structure.
 */
function builtInScore(content: string): number {
  let score = 0.5; // Base score

  // Length adequacy (too short = bad, too long = okay)
  const wordCount = content.split(/\s+/).length;
  if (wordCount < 20) {
    score -= 0.2; // Too brief
  } else if (wordCount > 50) {
    score += 0.1; // Substantial
  }

  // Specificity: penalize vague words
  const vagueWords = ['maybe', 'possibly', 'might', 'could be', 'perhaps', 'generally', 'usually', 'often'];
  const vagueCount = vagueWords.reduce((count, word) => {
    return count + (content.toLowerCase().split(word).length - 1);
  }, 0);
  score -= vagueCount * 0.05;

  // Structure: reward sections, bullets, numbered lists
  const hasStructure = /[\n-•]/.test(content) || /\d+\./.test(content);
  if (hasStructure) {
    score += 0.15;
  }

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, score));
}

/**
 * Simple built-in verification when no custom verifier is provided.
 * Checks completeness, specificity.
 */
function builtInVerify(content: string): { confidence: number; issues: string[] } {
  const issues: string[] = [];
  let confidence = 0.8; // Base confidence

  // Check for completeness markers
  if (content.length < 50) {
    issues.push('Response seems too brief - may be incomplete');
    confidence -= 0.2;
  }

  // Check for vague language
  const vagueWords = ['maybe', 'possibly', 'might', 'could be', 'perhaps'];
  const hasVague = vagueWords.some(word => content.toLowerCase().includes(word));
  if (hasVague) {
    issues.push('Contains vague or uncertain language');
    confidence -= 0.1;
  }

  // Check for structure
  const hasStructure = /[\n-•]/.test(content) || /\d+\./.test(content);
  if (!hasStructure && content.length > 100) {
    issues.push('Lacks clear structure (sections, bullets, or numbering)');
    confidence -= 0.1;
  }

  return {
    confidence: Math.max(0, Math.min(1, confidence)),
    issues,
  };
}

// ============================================================================
// TRT Engine
// ============================================================================

export class TRTEngine {
  private config: TRTConfig;
  private accumulator: KnowledgeAccumulator;

  constructor(config?: Partial<TRTConfig>) {
    this.config = {
      maxRecursions: config?.maxRecursions ?? 3,
      candidatesPerRound: config?.candidatesPerRound ?? 3,
      minImprovement: config?.minImprovement ?? 0.05,
      verificationStrategies: config?.verificationStrategies ?? ['logical', 'completeness'],
      accumulateKnowledge: config?.accumulateKnowledge ?? true,
    };
    this.accumulator = new KnowledgeAccumulator();
  }

  /**
   * Full TRT solve with custom generate and score functions.
   *
   * @param problem - The problem to solve
   * @param generate - Function that generates candidates given problem + context
   * @param score - Function that scores a candidate (0-1, higher is better)
   */
  async solve(
    problem: string,
    generate: (problem: string, context: string) => Promise<string[]>,
    score: (candidate: string) => Promise<number>,
  ): Promise<TRTResult> {
    this.accumulator.reset();

    // Seed accumulator with past lessons
    const pastLessons = recallModuleLessons('trt', 5);
    for (const lesson of pastLessons) {
      this.accumulator.addFromVerification(
        { id: 'seed', content: '', round: 0, score: 0, verificationResult: { confidence: 0, issues: [] } },
        [lesson],
      );
    }

    const allCandidates: TRTCandidate[] = [];
    const improvementHistory: number[] = [];
    let bestScore = 0;

    for (let round = 1; round <= this.config.maxRecursions; round++) {
      // Generate candidates with accumulated context
      const context = this.config.accumulateKnowledge ? this.accumulator.getContext() : '';
      const contents = await generate(problem, context);

      // Score and verify each candidate
      const roundCandidates: TRTCandidate[] = [];

      for (const content of contents.slice(0, this.config.candidatesPerRound)) {
        const candidateScore = await score(content);
        const verification = builtInVerify(content); // Use built-in for now

        const candidate: TRTCandidate = {
          id: randomUUID(),
          content,
          round,
          score: candidateScore,
          verificationResult: verification,
          parentId: round > 1 ? allCandidates[0]?.id : undefined,
        };

        roundCandidates.push(candidate);

        // Accumulate knowledge from low-scoring candidates
        if (this.config.accumulateKnowledge && candidateScore < 0.7) {
          this.accumulator.addFromVerification(candidate, verification.issues);
        }
      }

      // Track this round's candidates
      allCandidates.push(...roundCandidates);

      // Find best of this round
      const roundBest = roundCandidates.reduce((best, c) => (c.score > best.score ? c : best), roundCandidates[0]);
      improvementHistory.push(roundBest.score);

      // Check for improvement
      if (round > 1) {
        const improvement = roundBest.score - bestScore;
        if (improvement < this.config.minImprovement) {
          // Converged - stop early
          break;
        }
      }

      bestScore = Math.max(bestScore, roundBest.score);
    }

    // Sort all candidates by score
    allCandidates.sort((a, b) => b.score - a.score);

    // Persist best insight if high-confidence result
    const best = allCandidates[0];
    if (best && best.score > 0.7) {
      const topInsight = this.accumulator.getAllInsights()[0];
      if (topInsight) {
        recordModuleLesson('trt', `High-score (${best.score.toFixed(2)}): ${topInsight}`);
      }
    }

    return {
      bestCandidate: allCandidates[0],
      allCandidates,
      rounds: improvementHistory.length,
      totalCandidatesEvaluated: allCandidates.length,
      improvementHistory,
      knowledgeAccumulated: this.accumulator.getAllInsights(),
    };
  }

  /**
   * Simplified TRT solve with built-in scoring.
   * Single candidate per round, uses built-in scoring heuristics.
   *
   * @param problem - The problem to solve
   * @param generate - Function that generates a single candidate given a prompt
   */
  async solveSimple(
    problem: string,
    generate: (prompt: string) => Promise<string>,
  ): Promise<TRTResult> {
    this.accumulator.reset();

    const allCandidates: TRTCandidate[] = [];
    const improvementHistory: number[] = [];
    let bestScore = 0;

    for (let round = 1; round <= this.config.maxRecursions; round++) {
      // Build prompt with accumulated context
      let prompt = problem;
      if (this.config.accumulateKnowledge && round > 1) {
        const context = this.accumulator.getContext();
        if (context) {
          prompt = `${problem}\n\n${context}`;
        }
      }

      // Generate single candidate
      const content = await generate(prompt);

      // Score and verify
      const candidateScore = builtInScore(content);
      const verification = builtInVerify(content);

      const candidate: TRTCandidate = {
        id: randomUUID(),
        content,
        round,
        score: candidateScore,
        verificationResult: verification,
        parentId: round > 1 ? allCandidates[0]?.id : undefined,
      };

      allCandidates.push(candidate);
      improvementHistory.push(candidateScore);

      // Accumulate knowledge from verification issues
      if (this.config.accumulateKnowledge && verification.issues.length > 0) {
        this.accumulator.addFromVerification(candidate, verification.issues);
      }

      // Check for improvement
      if (round > 1) {
        const improvement = candidateScore - bestScore;
        if (improvement < this.config.minImprovement) {
          // Converged - stop early
          break;
        }
      }

      bestScore = Math.max(bestScore, candidateScore);
    }

    // Sort all candidates by score
    allCandidates.sort((a, b) => b.score - a.score);

    return {
      bestCandidate: allCandidates[0],
      allCandidates,
      rounds: improvementHistory.length,
      totalCandidatesEvaluated: allCandidates.length,
      improvementHistory,
      knowledgeAccumulated: this.accumulator.getAllInsights(),
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let singletonInstance: TRTEngine | null = null;

export function getTRTEngine(config?: Partial<TRTConfig>): TRTEngine {
  if (!singletonInstance) {
    singletonInstance = new TRTEngine(config);
  }
  return singletonInstance;
}

export function resetTRTEngine(): void {
  singletonInstance = null;
}
