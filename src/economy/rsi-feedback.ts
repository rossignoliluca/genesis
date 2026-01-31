/**
 * Genesis v14.6 - Bounty → RSI Feedback Loop
 *
 * Connects bounty hunting outcomes to RSI (Recursive Self-Improvement):
 *
 * SUCCESS PATH:
 *   Bounty completed → Record skill → Update capabilities → Better scoring
 *
 * FAILURE PATH:
 *   Bounty failed → Detect limitation → Trigger RSI research → Improve
 *
 * ECONOMIC LOOP:
 *   Revenue → Fund API → Enable more bounties → More learning
 *
 * Scientific Foundations:
 * - Free Energy Principle: Reduce surprise by improving skill alignment
 * - Active Inference: Select bounties that minimize expected free energy
 * - Autopoiesis: Self-sustaining through economic closure
 *
 * @module economy/rsi-feedback
 */

import { Bounty, BountySubmission, BountyHunterStats } from './generators/bounty-hunter.js';
import { getMemorySystem } from '../memory/index.js';

// =============================================================================
// TYPES
// =============================================================================

export interface BountyOutcome {
  bountyId: string;
  bounty: Bounty;
  submission?: BountySubmission;
  success: boolean;
  revenue: number;
  cost: number;
  duration: number;  // minutes
  skills: string[];
  lessons: string[];
  failureReason?: string;
  timestamp: Date;
}

export interface SkillUpdate {
  skill: string;
  category: string;
  successCount: number;
  failureCount: number;
  totalRevenue: number;
  avgDuration: number;
  confidence: number;  // 0-1 based on sample size
}

export interface LimitationReport {
  type: 'capability' | 'knowledge' | 'performance';
  description: string;
  evidence: string[];
  severity: 'low' | 'medium' | 'high';
  suggestedResearch: string[];
}

// =============================================================================
// BOUNTY RSI FEEDBACK
// =============================================================================

export class BountyRSIFeedback {
  private outcomes: BountyOutcome[] = [];
  private skillStats: Map<string, SkillUpdate> = new Map();
  private limitations: LimitationReport[] = [];

  constructor() {
    this.loadFromMemory();
  }

  // ===========================================================================
  // SUCCESS PATH
  // ===========================================================================

  /**
   * Record a successful bounty completion
   * This updates skills, procedural memory, and capabilities
   */
  async recordSuccess(
    bounty: Bounty,
    submission: BountySubmission,
    revenue: number,
    cost: number,
    duration: number
  ): Promise<void> {
    const memory = getMemorySystem();

    // 1. Create outcome record
    const outcome: BountyOutcome = {
      bountyId: bounty.id,
      bounty,
      submission,
      success: true,
      revenue,
      cost,
      duration,
      skills: this.extractSkills(bounty),
      lessons: this.extractLessons(bounty, submission),
      timestamp: new Date(),
    };
    this.outcomes.push(outcome);

    // 2. Update skill statistics
    for (const skill of outcome.skills) {
      this.updateSkillStats(skill, bounty.category, true, revenue, duration);
    }

    // 3. Record in procedural memory (how to do this type of bounty)
    const procedureName = `bounty-${bounty.category}-${bounty.platform}`;
    memory.learnSkill({
      name: procedureName,
      description: `Complete ${bounty.category} bounties on ${bounty.platform}`,
      steps: [
        { action: 'analyze-requirements' },
        { action: 'create-plan' },
        { action: 'implement-solution' },
        { action: 'test-solution' },
        { action: 'submit-deliverable' },
      ],
    });

    // 4. Record in semantic memory (what we learned)
    memory.learn({
      concept: `bounty-success:${bounty.id}`,
      category: bounty.category,
      definition: `Successfully completed ${bounty.title}`,
      properties: {
        platform: bounty.platform,
        skills: outcome.skills,
        reward: revenue,
        duration,
        lessons: outcome.lessons,
        tags: bounty.tags,
      },
      confidence: 0.9,
    });

    // 5. Record in episodic memory (the experience)
    memory.remember({
      what: `Successfully completed ${bounty.category} bounty on ${bounty.platform}: "${bounty.title}" for $${revenue}`,
      tags: ['bounty', 'success', bounty.category, bounty.platform],
    });

    console.log(`[RSI Feedback] Success recorded: ${bounty.title} (+$${revenue})`);
    console.log(`[RSI Feedback] Skills updated: ${outcome.skills.join(', ')}`);
  }

  // ===========================================================================
  // FAILURE PATH
  // ===========================================================================

  /**
   * Record a failed bounty attempt
   * This detects limitations and triggers RSI research
   */
  async recordFailure(
    bounty: Bounty,
    failureReason: string,
    cost: number,
    duration: number
  ): Promise<LimitationReport> {
    const memory = getMemorySystem();

    // 1. Create outcome record
    const outcome: BountyOutcome = {
      bountyId: bounty.id,
      bounty,
      success: false,
      revenue: 0,
      cost,
      duration,
      skills: this.extractSkills(bounty),
      lessons: [`Failed: ${failureReason}`],
      failureReason,
      timestamp: new Date(),
    };
    this.outcomes.push(outcome);

    // 2. Update skill statistics (failure)
    for (const skill of outcome.skills) {
      this.updateSkillStats(skill, bounty.category, false, 0, duration);
    }

    // 3. Detect limitation
    const limitation = this.detectLimitation(bounty, failureReason);
    this.limitations.push(limitation);

    // 4. Record in semantic memory (what went wrong)
    memory.learn({
      concept: `bounty-failure:${bounty.id}`,
      category: 'bounty-failure',
      definition: `Failed: ${failureReason}`,
      properties: {
        bountyCategory: bounty.category,
        platform: bounty.platform,
        skills: outcome.skills,
        failureReason,
        duration,
        limitationType: limitation.type,
        suggestedResearch: limitation.suggestedResearch,
      },
      confidence: 0.7,
    });

    // 5. Record in episodic memory
    memory.remember({
      what: `Failed ${bounty.category} bounty on ${bounty.platform}: "${bounty.title}" - ${failureReason}`,
      tags: ['bounty', 'failure', bounty.category, limitation.type],
    });

    console.log(`[RSI Feedback] Failure recorded: ${bounty.title}`);
    console.log(`[RSI Feedback] Limitation detected: ${limitation.type} - ${limitation.description}`);
    console.log(`[RSI Feedback] Suggested research: ${limitation.suggestedResearch.join(', ')}`);

    return limitation;
  }

  // ===========================================================================
  // SCORING IMPROVEMENT
  // ===========================================================================

  /**
   * Get improved success probability based on historical data
   * Used by BountyHunter.estimateSuccessProbability()
   */
  getImprovedSuccessProbability(bounty: Bounty): number {
    // Base probability from heuristics
    const baseProbability = this.getBaseProbability(bounty);

    // Adjust based on skill stats
    let skillAdjustment = 0;
    const skills = this.extractSkills(bounty);

    for (const skill of skills) {
      const stats = this.skillStats.get(skill);
      if (stats && stats.confidence > 0.3) {
        const successRate = stats.successCount / (stats.successCount + stats.failureCount);
        skillAdjustment += (successRate - 0.5) * stats.confidence;
      }
    }

    // Adjust based on platform familiarity
    const platformOutcomes = this.outcomes.filter(o => o.bounty.platform === bounty.platform);
    const platformSuccessRate = platformOutcomes.length > 0
      ? platformOutcomes.filter(o => o.success).length / platformOutcomes.length
      : 0.5;
    const platformAdjustment = (platformSuccessRate - 0.5) * Math.min(1, platformOutcomes.length / 10);

    // Combine adjustments
    const adjusted = Math.max(0.1, Math.min(0.95,
      baseProbability + skillAdjustment / skills.length + platformAdjustment * 0.3
    ));

    return adjusted;
  }

  /**
   * Get expected value considering historical costs
   */
  getImprovedExpectedValue(bounty: Bounty): number {
    const probability = this.getImprovedSuccessProbability(bounty);
    const estimatedCost = this.getEstimatedCost(bounty);
    const expectedRevenue = bounty.reward * probability;

    return expectedRevenue - estimatedCost;
  }

  // ===========================================================================
  // RSI INTEGRATION
  // ===========================================================================

  /**
   * Get limitations for RSI OBSERVE phase
   * Returns recent limitations that haven't been addressed
   */
  getLimitationsForRSI(): LimitationReport[] {
    return this.limitations.filter(l => l.severity === 'high' || l.severity === 'medium');
  }

  /**
   * Get research topics for RSI RESEARCH phase
   * Based on failed bounties and skill gaps
   */
  getResearchTopicsForRSI(): string[] {
    const topics = new Set<string>();

    // From recent limitations
    for (const limitation of this.limitations.slice(-5)) {
      for (const topic of limitation.suggestedResearch) {
        topics.add(topic);
      }
    }

    // From low-confidence skills
    for (const [skill, stats] of this.skillStats) {
      if (stats.confidence < 0.3 && stats.failureCount > 0) {
        topics.add(`How to improve ${skill} skills for bounties`);
      }
    }

    return Array.from(topics);
  }

  /**
   * Check if RSI should be triggered based on bounty performance
   */
  shouldTriggerRSI(): boolean {
    const recentOutcomes = this.outcomes.slice(-10);
    if (recentOutcomes.length < 5) return false;

    const recentSuccessRate = recentOutcomes.filter(o => o.success).length / recentOutcomes.length;

    // Trigger RSI if success rate drops below 40%
    if (recentSuccessRate < 0.4) {
      console.log(`[RSI Feedback] Low success rate (${(recentSuccessRate * 100).toFixed(0)}%) - recommending RSI`);
      return true;
    }

    // Trigger RSI if we have high-severity limitations
    const recentHighSeverity = this.limitations.slice(-5).filter(l => l.severity === 'high');
    if (recentHighSeverity.length >= 2) {
      console.log('[RSI Feedback] Multiple high-severity limitations - recommending RSI');
      return true;
    }

    return false;
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  getStats(): {
    totalOutcomes: number;
    successRate: number;
    totalRevenue: number;
    totalCost: number;
    profit: number;
    skillCount: number;
    limitationCount: number;
    topSkills: Array<{ skill: string; successRate: number; revenue: number }>;
  } {
    const successes = this.outcomes.filter(o => o.success);
    const totalRevenue = successes.reduce((sum, o) => sum + o.revenue, 0);
    const totalCost = this.outcomes.reduce((sum, o) => sum + o.cost, 0);

    const topSkills = Array.from(this.skillStats.entries())
      .map(([skill, stats]) => ({
        skill,
        successRate: stats.successCount / (stats.successCount + stats.failureCount),
        revenue: stats.totalRevenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      totalOutcomes: this.outcomes.length,
      successRate: this.outcomes.length > 0
        ? successes.length / this.outcomes.length
        : 0,
      totalRevenue,
      totalCost,
      profit: totalRevenue - totalCost,
      skillCount: this.skillStats.size,
      limitationCount: this.limitations.length,
      topSkills,
    };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private extractSkills(bounty: Bounty): string[] {
    const skills = new Set<string>();

    // From category
    skills.add(bounty.category);

    // From tags
    for (const tag of bounty.tags) {
      const normalized = tag.toLowerCase().replace(/[^a-z0-9]/g, '-');
      if (normalized.length > 2) {
        skills.add(normalized);
      }
    }

    // From platform
    skills.add(`platform-${bounty.platform}`);

    return Array.from(skills);
  }

  private extractLessons(bounty: Bounty, submission: BountySubmission): string[] {
    const lessons: string[] = [];

    lessons.push(`Completed ${bounty.category} bounty successfully`);

    if (bounty.difficulty === 'hard' || bounty.difficulty === 'critical') {
      lessons.push(`Handled ${bounty.difficulty} difficulty`);
    }

    if (submission.deliverable) {
      const wordCount = submission.deliverable.split(/\s+/).length;
      if (wordCount > 500) {
        lessons.push('Produced comprehensive deliverable');
      }
    }

    return lessons;
  }

  private updateSkillStats(
    skill: string,
    category: string,
    success: boolean,
    revenue: number,
    duration: number
  ): void {
    const existing = this.skillStats.get(skill) || {
      skill,
      category,
      successCount: 0,
      failureCount: 0,
      totalRevenue: 0,
      avgDuration: 0,
      confidence: 0,
    };

    if (success) {
      existing.successCount++;
      existing.totalRevenue += revenue;
    } else {
      existing.failureCount++;
    }

    // Update average duration with exponential moving average
    const alpha = 0.3;
    existing.avgDuration = existing.avgDuration * (1 - alpha) + duration * alpha;

    // Update confidence based on sample size
    const totalSamples = existing.successCount + existing.failureCount;
    existing.confidence = Math.min(1, totalSamples / 10);

    this.skillStats.set(skill, existing);
  }

  private detectLimitation(bounty: Bounty, failureReason: string): LimitationReport {
    const reason = failureReason.toLowerCase();

    // Knowledge limitation
    if (reason.includes('understand') || reason.includes('knowledge') || reason.includes('don\'t know')) {
      return {
        type: 'knowledge',
        description: `Insufficient knowledge for ${bounty.category} bounties`,
        evidence: [failureReason, `Bounty: ${bounty.title}`],
        severity: 'medium',
        suggestedResearch: [
          `${bounty.category} best practices`,
          `${bounty.tags.slice(0, 3).join(' ')} tutorials`,
          'Similar bounty solutions on GitHub',
        ],
      };
    }

    // Capability limitation
    if (reason.includes('cannot') || reason.includes('unable') || reason.includes('impossible')) {
      return {
        type: 'capability',
        description: `Missing capability for ${bounty.category} tasks`,
        evidence: [failureReason, `Bounty: ${bounty.title}`],
        severity: 'high',
        suggestedResearch: [
          `How to ${bounty.category} with AI`,
          `${bounty.platform} API documentation`,
          `Automated ${bounty.category} tools`,
        ],
      };
    }

    // Performance limitation (default)
    return {
      type: 'performance',
      description: `Performance issue with ${bounty.category} bounties`,
      evidence: [failureReason, `Bounty: ${bounty.title}`],
      severity: 'low',
      suggestedResearch: [
        `Optimizing ${bounty.category} workflows`,
        'Time management for bounty hunting',
        'Efficient solution patterns',
      ],
    };
  }

  private getBaseProbability(bounty: Bounty): number {
    const categoryProb: Record<string, number> = {
      content: 0.8,
      research: 0.7,
      code: 0.5,
      audit: 0.4,
      design: 0.3,
      translation: 0.9,
    };

    const difficultyMult: Record<string, number> = {
      easy: 1.0,
      medium: 0.7,
      hard: 0.4,
      critical: 0.2,
    };

    const base = categoryProb[bounty.category] ?? 0.5;
    const mult = difficultyMult[bounty.difficulty] ?? 0.5;

    return base * mult;
  }

  private getEstimatedCost(bounty: Bounty): number {
    // Estimate cost based on category and difficulty
    const categoryMultiplier: Record<string, number> = {
      code: 2.0,
      audit: 2.5,
      research: 1.5,
      content: 1.0,
      design: 1.2,
      translation: 0.5,
    };

    const difficultyMultiplier: Record<string, number> = {
      easy: 1.0,
      medium: 2.0,
      hard: 4.0,
      critical: 8.0,
    };

    // Base cost $0.50 per LLM call, estimate 5-20 calls
    const baseCost = 0.50;
    const estimatedCalls = 10;

    const catMult = categoryMultiplier[bounty.category] ?? 1.5;
    const diffMult = difficultyMultiplier[bounty.difficulty] ?? 2.0;

    return baseCost * estimatedCalls * catMult * diffMult;
  }

  private loadFromMemory(): void {
    try {
      const memory = getMemorySystem();

      // Load skill stats from semantic memory
      const skillMemory = memory.getFact('bounty-skill-stats');
      if (skillMemory && skillMemory.content && typeof skillMemory.content === 'object') {
        const props = (skillMemory.content as any).properties;
        if (props && props.skillStats && typeof props.skillStats === 'object') {
          for (const [skill, data] of Object.entries(props.skillStats)) {
            this.skillStats.set(skill, data as SkillUpdate);
          }
        }
      }

      console.log(`[RSI Feedback] Loaded ${this.skillStats.size} skill stats from memory`);
    } catch {
      // Memory not available yet
    }
  }

  /**
   * Save current state to memory for persistence
   */
  async saveToMemory(): Promise<void> {
    const memory = getMemorySystem();

    // Save skill stats
    memory.learn({
      concept: 'bounty-skill-stats',
      category: 'rsi-feedback',
      definition: 'Skill statistics for bounty hunting',
      properties: {
        skillStats: Object.fromEntries(this.skillStats),
        savedAt: new Date().toISOString(),
        outcomeCount: this.outcomes.length,
      },
      confidence: 0.95,
    });

    console.log(`[RSI Feedback] Saved ${this.skillStats.size} skill stats to memory`);
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let feedbackInstance: BountyRSIFeedback | null = null;

export function getBountyRSIFeedback(): BountyRSIFeedback {
  if (!feedbackInstance) {
    feedbackInstance = new BountyRSIFeedback();
  }
  return feedbackInstance;
}

export function resetBountyRSIFeedback(): void {
  feedbackInstance = null;
}
