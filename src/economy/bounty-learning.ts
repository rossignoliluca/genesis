/**
 * Bounty Learning System v19.2
 *
 * Learns from bounty outcomes using causal analysis:
 * - Tracks success/failure patterns
 * - Identifies root causes of rejections
 * - Adapts parameters based on outcomes
 * - Executes actual RSI research when needed
 *
 * Integrates with:
 * - CausalReasoner for root cause analysis
 * - MetacognitiveController for strategy adaptation
 * - MemorySystem for experience storage
 *
 * @module economy/bounty-learning
 * @version 19.2.0
 */

import type { Bounty } from './generators/bounty-hunter.js';
import type { BountyClassification, BountyType } from './bounty-intelligence.js';
import { classifyBounty } from './bounty-intelligence.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface BountyOutcome {
  bountyId: string;
  bounty: Bounty;
  classification: BountyClassification;
  outcome: 'success' | 'rejected' | 'timeout' | 'validation_failed' | 'pr_failed';
  prUrl?: string;
  mergedAt?: Date;
  rejectionReason?: string;
  reviewerFeedback?: string[];
  duration: number;         // Time from claim to completion
  validationScore: number;
  confidenceAtSubmit: number;
  timestamp: Date;
}

export interface CausalFactor {
  factor: string;
  impact: 'positive' | 'negative' | 'neutral';
  confidence: number;
  evidence: string[];
}

export interface LearningInsight {
  pattern: string;
  frequency: number;
  successRate: number;
  recommendation: string;
  factors: CausalFactor[];
}

export interface AdaptiveParameters {
  // Per-platform confidence thresholds
  platformConfidence: Record<string, number>;
  // Per-type success rates
  typeSuccessRates: Record<BountyType, number>;
  // Minimum reward by platform
  minRewardByPlatform: Record<string, number>;
  // Blocked repos
  blockedRepos: Set<string>;
  // Skill confidence scores
  skillConfidence: Record<string, number>;
  // Last updated
  lastUpdated: Date;
}

// ============================================================================
// Bounty Learning Engine
// ============================================================================

export class BountyLearningEngine {
  private outcomes: BountyOutcome[] = [];
  private insights: LearningInsight[] = [];
  private parameters: AdaptiveParameters;
  private persistPath: string;
  private learningEnabled = true;

  constructor(persistPath?: string) {
    this.persistPath = persistPath ?? '.genesis/bounty-learning.json';
    this.parameters = this.createDefaultParameters();
    this.load();
  }

  private createDefaultParameters(): AdaptiveParameters {
    return {
      platformConfidence: {
        algora: 0.4,
        gitcoin: 0.45,
        dework: 0.45,
        github: 0.4,
        immunefi: 0.7,
        code4rena: 0.7,
      },
      typeSuccessRates: {
        'documentation': 0.85,
        'translation': 0.80,
        'test-writing': 0.75,
        'bug-fix-simple': 0.70,
        'refactoring': 0.65,
        'feature-small': 0.60,
        'api-integration': 0.55,
        'bug-fix-complex': 0.45,
        'feature-large': 0.40,
        'performance': 0.35,
        'architecture': 0.25,
        'security-audit': 0.20,
        'unknown': 0.50,
      },
      minRewardByPlatform: {
        algora: 50,
        gitcoin: 100,
        dework: 50,
        github: 25,
        immunefi: 1000,
        code4rena: 500,
      },
      blockedRepos: new Set(),
      skillConfidence: {},
      lastUpdated: new Date(),
    };
  }

  // ===========================================================================
  // Recording Outcomes
  // ===========================================================================

  recordOutcome(outcome: BountyOutcome): void {
    this.outcomes.push(outcome);

    // Update running statistics
    this.updateStatistics(outcome);

    // Analyze for causal factors
    if (outcome.outcome !== 'success') {
      this.analyzeFailure(outcome);
    } else {
      this.analyzeSuccess(outcome);
    }

    // Trigger RSI if needed
    this.checkRSITrigger();

    // Persist
    this.save();

    console.log(`[BountyLearning] Recorded ${outcome.outcome} for ${outcome.bountyId}`);
  }

  private updateStatistics(outcome: BountyOutcome): void {
    const platform = outcome.bounty.platform;
    const type = outcome.classification.type;
    const isSuccess = outcome.outcome === 'success';

    // Update type success rate using exponential moving average
    const currentRate = this.parameters.typeSuccessRates[type] ?? 0.5;
    const alpha = 0.1; // Learning rate
    this.parameters.typeSuccessRates[type] = currentRate * (1 - alpha) + (isSuccess ? 1 : 0) * alpha;

    // Update platform confidence if needed
    if (!isSuccess && outcome.outcome === 'rejected') {
      // Lower confidence for rejecting platforms
      const currentConf = this.parameters.platformConfidence[platform] ?? 0.5;
      this.parameters.platformConfidence[platform] = Math.min(currentConf + 0.05, 0.8);
    } else if (isSuccess) {
      // Slightly lower threshold for successful platforms
      const currentConf = this.parameters.platformConfidence[platform] ?? 0.5;
      this.parameters.platformConfidence[platform] = Math.max(currentConf - 0.02, 0.2);
    }

    // Update skill confidence
    for (const skill of outcome.classification.requiredSkills) {
      const currentSkillConf = this.parameters.skillConfidence[skill] ?? 0.5;
      this.parameters.skillConfidence[skill] = currentSkillConf * (1 - alpha) + (isSuccess ? 1 : 0) * alpha;
    }

    // Block repos with multiple failures
    if (!isSuccess && outcome.bounty.sourceMetadata?.repo) {
      const repoKey = `${outcome.bounty.sourceMetadata.org}/${outcome.bounty.sourceMetadata.repo}`;
      const repoFailures = this.outcomes.filter(
        o => `${o.bounty.sourceMetadata?.org}/${o.bounty.sourceMetadata?.repo}` === repoKey &&
             o.outcome !== 'success'
      ).length;

      if (repoFailures >= 3) {
        this.parameters.blockedRepos.add(repoKey);
        console.log(`[BountyLearning] Blocked repo ${repoKey} after ${repoFailures} failures`);
      }
    }

    this.parameters.lastUpdated = new Date();
  }

  // ===========================================================================
  // Causal Analysis
  // ===========================================================================

  private analyzeFailure(outcome: BountyOutcome): void {
    const factors: CausalFactor[] = [];

    // Analyze rejection reason if available
    if (outcome.rejectionReason) {
      factors.push(...this.extractCausalFactors(outcome.rejectionReason, 'rejection'));
    }

    // Analyze reviewer feedback
    if (outcome.reviewerFeedback) {
      for (const feedback of outcome.reviewerFeedback) {
        factors.push(...this.extractCausalFactors(feedback, 'feedback'));
      }
    }

    // Analyze classification factors
    if (outcome.classification.riskFactors.length > 0) {
      factors.push({
        factor: 'risk_factors_present',
        impact: 'negative',
        confidence: 0.7,
        evidence: outcome.classification.riskFactors,
      });
    }

    // Check if difficulty was underestimated
    if (outcome.classification.estimatedDifficulty < 0.5 && outcome.outcome === 'rejected') {
      factors.push({
        factor: 'difficulty_underestimated',
        impact: 'negative',
        confidence: 0.6,
        evidence: [`Estimated ${(outcome.classification.estimatedDifficulty * 100).toFixed(0)}% but failed`],
      });
    }

    // Check validation score correlation
    if (outcome.validationScore < 80) {
      factors.push({
        factor: 'low_validation_score',
        impact: 'negative',
        confidence: 0.8,
        evidence: [`Validation score: ${outcome.validationScore}`],
      });
    }

    // Store insight
    this.addInsight('failure_pattern', factors, false);
  }

  private analyzeSuccess(outcome: BountyOutcome): void {
    const factors: CausalFactor[] = [];

    // What made this successful?
    factors.push({
      factor: 'type_match',
      impact: 'positive',
      confidence: outcome.classification.aiSuitability,
      evidence: [`Type: ${outcome.classification.type}, AI suitability: ${(outcome.classification.aiSuitability * 100).toFixed(0)}%`],
    });

    if (outcome.validationScore >= 90) {
      factors.push({
        factor: 'high_validation_score',
        impact: 'positive',
        confidence: 0.9,
        evidence: [`Validation score: ${outcome.validationScore}`],
      });
    }

    if (outcome.classification.riskFactors.length === 0) {
      factors.push({
        factor: 'no_risk_factors',
        impact: 'positive',
        confidence: 0.7,
        evidence: ['No identified risk factors'],
      });
    }

    // Store insight
    this.addInsight('success_pattern', factors, true);
  }

  private extractCausalFactors(text: string, source: string): CausalFactor[] {
    const factors: CausalFactor[] = [];
    const lowerText = text.toLowerCase();

    // Pattern-based factor extraction
    const patterns: Array<{ pattern: RegExp; factor: string; impact: 'negative' | 'positive' }> = [
      // Code quality issues
      { pattern: /\b(doesn'?t work|broken|bug|error)\b/i, factor: 'code_not_working', impact: 'negative' },
      { pattern: /\b(style|formatting|lint)\b/i, factor: 'style_issues', impact: 'negative' },
      { pattern: /\b(test|coverage)\b/i, factor: 'missing_tests', impact: 'negative' },
      { pattern: /\b(documentation|docs?|comment)\b/i, factor: 'missing_docs', impact: 'negative' },

      // Understanding issues
      { pattern: /\b(misunderst|didn'?t understand|wrong approach)\b/i, factor: 'misunderstanding', impact: 'negative' },
      { pattern: /\b(scope|requirements?|specification)\b/i, factor: 'scope_mismatch', impact: 'negative' },
      { pattern: /\b(incomplete|partial|not complete)\b/i, factor: 'incomplete_solution', impact: 'negative' },

      // Positive feedback
      { pattern: /\b(good|great|excellent|perfect)\b/i, factor: 'positive_feedback', impact: 'positive' },
      { pattern: /\b(clean|well[- ]written|readable)\b/i, factor: 'clean_code', impact: 'positive' },
      { pattern: /\b(merged|accepted|approved)\b/i, factor: 'accepted', impact: 'positive' },
    ];

    for (const { pattern, factor, impact } of patterns) {
      if (pattern.test(lowerText)) {
        factors.push({
          factor,
          impact,
          confidence: 0.7,
          evidence: [`${source}: "${text.slice(0, 100)}..."`],
        });
      }
    }

    return factors;
  }

  private addInsight(patternType: string, factors: CausalFactor[], isSuccess: boolean): void {
    // Find or create insight
    let insight = this.insights.find(i => i.pattern === patternType);
    if (!insight) {
      insight = {
        pattern: patternType,
        frequency: 0,
        successRate: 0,
        recommendation: '',
        factors: [],
      };
      this.insights.push(insight);
    }

    insight.frequency++;
    insight.successRate = (insight.successRate * (insight.frequency - 1) + (isSuccess ? 1 : 0)) / insight.frequency;
    insight.factors.push(...factors);

    // Generate recommendation
    insight.recommendation = this.generateRecommendation(insight);
  }

  private generateRecommendation(insight: LearningInsight): string {
    const negativeFactors = insight.factors.filter(f => f.impact === 'negative');
    const topIssues = negativeFactors
      .reduce((acc, f) => {
        acc[f.factor] = (acc[f.factor] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const sortedIssues = Object.entries(topIssues)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    if (sortedIssues.length === 0) {
      return 'Continue current approach';
    }

    const recommendations = sortedIssues.map(([issue]) => {
      switch (issue) {
        case 'code_not_working': return 'Add more testing before submission';
        case 'style_issues': return 'Run linter and follow repo style guide';
        case 'missing_tests': return 'Include unit tests with submissions';
        case 'missing_docs': return 'Add documentation and comments';
        case 'misunderstanding': return 'Request clarification before starting';
        case 'scope_mismatch': return 'Review requirements more carefully';
        case 'incomplete_solution': return 'Ensure all requirements are met';
        case 'difficulty_underestimated': return 'Be more conservative with difficulty estimates';
        default: return `Address ${issue}`;
      }
    });

    return recommendations.join('; ');
  }

  // ===========================================================================
  // RSI (Recursive Self-Improvement) Trigger
  // ===========================================================================

  private checkRSITrigger(): void {
    const recentOutcomes = this.outcomes.slice(-20);
    if (recentOutcomes.length < 5) return;

    const successRate = recentOutcomes.filter(o => o.outcome === 'success').length / recentOutcomes.length;

    // Trigger RSI if success rate drops below 30%
    if (successRate < 0.30) {
      console.log(`[BountyLearning] Low success rate ${(successRate * 100).toFixed(0)}%, triggering RSI`);
      this.executeRSI();
    }
  }

  private async executeRSI(): Promise<void> {
    // Identify areas needing improvement
    const researchTopics = this.identifyResearchTopics();

    if (researchTopics.length === 0) {
      console.log('[BountyLearning] No specific research topics identified');
      return;
    }

    console.log('[BountyLearning] RSI Research Topics:', researchTopics);

    // Try to execute research using available modules
    try {
      // Use grounding system to research topics
      const { getGroundingSystem } = await import('../grounding/index.js');
      const grounding = getGroundingSystem();

      for (const topic of researchTopics.slice(0, 3)) {
        console.log(`[BountyLearning] Researching: ${topic}`);

        // Ground the topic to find reliable information
        const result = await grounding.ground(topic);

        if (result.confidence >= 0.6) {
          console.log(`[BountyLearning] Found grounding for ${topic} (confidence: ${(result.confidence * 100).toFixed(0)}%)`);
        }
      }
    } catch (error) {
      console.log('[BountyLearning] Grounding not available, skipping RSI execution');
    }

    // Store research intent for semantic memory
    try {
      const { getMemorySystem } = await import('../memory/index.js');
      const memory = getMemorySystem();

      memory.learn({
        concept: 'bounty_improvement_research',
        definition: `Research topics for bounty improvement: ${researchTopics.join(', ')}`,
        category: 'self-improvement',
        confidence: 0.7,
      });
    } catch {
      // Memory not available
    }
  }

  private identifyResearchTopics(): string[] {
    const topics: string[] = [];

    // Find most common failure factors
    const factorCounts: Record<string, number> = {};
    for (const outcome of this.outcomes.filter(o => o.outcome !== 'success')) {
      for (const factor of outcome.classification.riskFactors) {
        factorCounts[factor] = (factorCounts[factor] || 0) + 1;
      }
    }

    const topFactors = Object.entries(factorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    for (const [factor] of topFactors) {
      switch (factor) {
        case 'legacy_codebase':
          topics.push('Understanding legacy code patterns');
          break;
        case 'undocumented':
          topics.push('Inferring behavior from undocumented code');
          break;
        case 'domain_knowledge_required':
          topics.push('Domain-specific knowledge acquisition');
          break;
        case 'security_critical':
          topics.push('Security best practices for code generation');
          break;
        case 'performance_critical':
          topics.push('Performance optimization techniques');
          break;
        default:
          topics.push(`Improving handling of ${factor}`);
      }
    }

    // Add skill-specific topics for low-confidence skills
    const lowSkills = Object.entries(this.parameters.skillConfidence)
      .filter(([, conf]) => conf < 0.4)
      .slice(0, 2);

    for (const [skill] of lowSkills) {
      topics.push(`Advanced ${skill} patterns and best practices`);
    }

    return topics;
  }

  // ===========================================================================
  // Adaptive Parameters Access
  // ===========================================================================

  getMinConfidence(platform: string): number {
    return this.parameters.platformConfidence[platform] ?? 0.5;
  }

  getTypeSuccessRate(type: BountyType): number {
    return this.parameters.typeSuccessRates[type] ?? 0.5;
  }

  getMinReward(platform: string): number {
    return this.parameters.minRewardByPlatform[platform] ?? 50;
  }

  isRepoBlocked(org: string, repo: string): boolean {
    return this.parameters.blockedRepos.has(`${org}/${repo}`);
  }

  getSkillConfidence(skill: string): number {
    return this.parameters.skillConfidence[skill] ?? 0.5;
  }

  getInsights(): LearningInsight[] {
    return this.insights;
  }

  getOutcomes(): BountyOutcome[] {
    return this.outcomes;
  }

  getStatistics(): {
    totalBounties: number;
    successRate: number;
    avgValidationScore: number;
    avgConfidence: number;
    topFailureReasons: string[];
  } {
    const total = this.outcomes.length;
    if (total === 0) {
      return {
        totalBounties: 0,
        successRate: 0,
        avgValidationScore: 0,
        avgConfidence: 0,
        topFailureReasons: [],
      };
    }

    const successes = this.outcomes.filter(o => o.outcome === 'success').length;
    const avgValidation = this.outcomes.reduce((s, o) => s + o.validationScore, 0) / total;
    const avgConfidence = this.outcomes.reduce((s, o) => s + o.confidenceAtSubmit, 0) / total;

    // Top failure reasons
    const failureReasons: Record<string, number> = {};
    for (const o of this.outcomes.filter(o => o.outcome !== 'success')) {
      const reason = o.outcome;
      failureReasons[reason] = (failureReasons[reason] || 0) + 1;
    }

    return {
      totalBounties: total,
      successRate: successes / total,
      avgValidationScore: avgValidation,
      avgConfidence: avgConfidence,
      topFailureReasons: Object.entries(failureReasons)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([reason, count]) => `${reason}: ${count}`),
    };
  }

  // ===========================================================================
  // Persistence
  // ===========================================================================

  private save(): void {
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = {
        outcomes: this.outcomes.map(o => ({
          ...o,
          timestamp: o.timestamp.toISOString(),
          mergedAt: o.mergedAt?.toISOString(),
        })),
        insights: this.insights,
        parameters: {
          ...this.parameters,
          blockedRepos: Array.from(this.parameters.blockedRepos),
          lastUpdated: this.parameters.lastUpdated.toISOString(),
        },
      };

      fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[BountyLearning] Failed to save:', error);
    }
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.persistPath)) return;

      const data = JSON.parse(fs.readFileSync(this.persistPath, 'utf-8'));

      this.outcomes = (data.outcomes || []).map((o: any) => ({
        ...o,
        timestamp: new Date(o.timestamp),
        mergedAt: o.mergedAt ? new Date(o.mergedAt) : undefined,
      }));

      this.insights = data.insights || [];

      if (data.parameters) {
        this.parameters = {
          ...data.parameters,
          blockedRepos: new Set(data.parameters.blockedRepos || []),
          lastUpdated: new Date(data.parameters.lastUpdated),
        };
      }

      console.log(`[BountyLearning] Loaded ${this.outcomes.length} outcomes`);
    } catch (error) {
      console.error('[BountyLearning] Failed to load:', error);
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let learningInstance: BountyLearningEngine | null = null;

export function getBountyLearning(): BountyLearningEngine {
  if (!learningInstance) {
    learningInstance = new BountyLearningEngine();
  }
  return learningInstance;
}

export function resetBountyLearning(): void {
  learningInstance = null;
}
