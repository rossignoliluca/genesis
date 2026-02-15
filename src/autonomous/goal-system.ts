/**
 * Genesis v30.0 — Autonomous Goal System
 *
 * Enables Genesis to:
 * - Set goals based on strategy, performance, and environment
 * - Decompose goals into sub-goals and milestones
 * - Track progress and adjust priorities dynamically
 * - Learn from goal completion/failure patterns
 * - Balance competing goals using utility maximization
 *
 * Inspired by BDI (Belief-Desire-Intention) agent architectures.
 *
 * @module autonomous/goal-system
 * @version 30.0.0
 */

import { getEventBus } from '../bus/index.js';
import { getMemorySystem } from '../memory/index.js';
import { recallModuleLessons, recordModuleLesson } from '../memory/module-hooks.js';
import { getDecisionEngine } from './decision-engine.js';
import { getStrategyOrchestrator } from './strategy-orchestrator.js';
import { getPhiMonitor } from '../consciousness/phi-monitor.js';

// ============================================================================
// Types
// ============================================================================

export interface GoalConfig {
  /** Maximum concurrent active goals */
  maxActiveGoals: number;
  /** How often to evaluate goals (ms) */
  evaluationInterval: number;
  /** Auto-generate goals from strategy */
  autoGenerate: boolean;
  /** Minimum goal priority to pursue */
  minPriority: number;
  /** Goal timeout before marking stale (ms) */
  goalTimeout: number;
}

export type GoalDomain = 'revenue' | 'growth' | 'learning' | 'maintenance' | 'exploration' | 'custom';
export type GoalStatus = 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'abandoned';
export type GoalPriority = 'critical' | 'high' | 'medium' | 'low';

export interface GoalMetrics {
  /** 0-1: how much has been accomplished */
  progress: number;
  /** 0-1: how confident we are in completion */
  confidence: number;
  /** Resources invested so far */
  resourcesUsed: number;
  /** Estimated resources remaining */
  resourcesRemaining: number;
  /** Time spent in ms */
  timeSpent: number;
  /** Estimated time remaining in ms */
  timeRemaining: number;
}

export interface Milestone {
  id: string;
  description: string;
  completed: boolean;
  completedAt?: Date;
  weight: number;  // Contribution to overall progress (sums to 1)
}

export interface Goal {
  id: string;
  domain: GoalDomain;
  title: string;
  description: string;
  priority: GoalPriority;
  status: GoalStatus;

  // Hierarchy
  parentGoalId?: string;
  subGoals: string[];

  // Milestones
  milestones: Milestone[];

  // Metrics
  metrics: GoalMetrics;

  // Utility
  utility: number;           // Expected utility (0-1)
  urgency: number;           // Time pressure (0-1)
  importance: number;        // Strategic importance (0-1)

  // Constraints
  deadline?: Date;
  dependencies: string[];    // Goal IDs that must complete first
  blockedBy: string[];       // Currently blocking goals

  // Tracking
  createdAt: Date;
  activatedAt?: Date;
  completedAt?: Date;
  lastEvaluatedAt: Date;

  // Context
  context: Record<string, unknown>;
  tags: string[];
}

export interface GoalProposal {
  domain: GoalDomain;
  title: string;
  description: string;
  priority: GoalPriority;
  utility: number;
  urgency: number;
  importance: number;
  milestones?: Array<{ description: string; weight: number }>;
  deadline?: Date;
  context?: Record<string, unknown>;
  tags?: string[];
}

export interface GoalEvaluation {
  goalId: string;
  timestamp: Date;
  previousProgress: number;
  currentProgress: number;
  progressDelta: number;
  recommendation: 'continue' | 'pause' | 'abandon' | 'prioritize' | 'deprioritize';
  reasoning: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: GoalConfig = {
  maxActiveGoals: 5,
  evaluationInterval: 5 * 60 * 1000,  // 5 minutes
  autoGenerate: true,
  minPriority: 0.3,
  goalTimeout: 24 * 60 * 60 * 1000,   // 24 hours
};

// Priority to numeric value
const PRIORITY_VALUES: Record<GoalPriority, number> = {
  critical: 1.0,
  high: 0.75,
  medium: 0.5,
  low: 0.25,
};

// ============================================================================
// Goal System
// ============================================================================

export class GoalSystem {
  private config: GoalConfig;
  private goals: Map<string, Goal> = new Map();
  private evaluations: GoalEvaluation[] = [];
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private idCounter = 0;

  constructor(config?: Partial<GoalConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupEventListeners();
  }

  // ===========================================================================
  // Event Listening
  // ===========================================================================

  private setupEventListeners(): void {
    const bus = getEventBus();

    // Listen for strategy changes to potentially generate new goals
    bus.subscribePrefix('strategy.', (event) => {
      const topic = (event as { topic?: string }).topic || '';
      if (topic.includes('changed') && this.config.autoGenerate) {
        this.generateGoalsFromStrategy();
      }
    });

    // Listen for bounty/content completions to update goal progress
    bus.subscribePrefix('bounty.', (event) => {
      const topic = (event as { topic?: string }).topic || '';
      if (topic.includes('completed')) {
        this.updateDomainProgress('revenue', 0.1);
      }
    });

    bus.subscribePrefix('content.', (event) => {
      const topic = (event as { topic?: string }).topic || '';
      if (topic.includes('published')) {
        this.updateDomainProgress('growth', 0.05);
      } else if (topic.includes('viral')) {
        this.updateDomainProgress('growth', 0.2);
      }
    });

    // Listen for reflection insights to generate learning goals
    bus.subscribePrefix('autonomous:', (event) => {
      const topic = (event as { topic?: string }).topic || '';
      if (topic.includes('reflection.completed')) {
        const data = event as unknown as Record<string, unknown>;
        if (data.proposals && (data.proposals as number) > 0) {
          this.generateLearningGoal();
        }
      }
    });
  }

  // ===========================================================================
  // Goal Creation
  // ===========================================================================

  createGoal(proposal: GoalProposal): Goal {
    // Recall past goal outcomes to inform planning
    const pastOutcomes = recallModuleLessons('goal-system', 5);

    const id = `goal-${++this.idCounter}-${Date.now().toString(36)}`;
    const now = new Date();

    const milestones: Milestone[] = proposal.milestones?.map((m, i) => ({
      id: `${id}-m${i}`,
      description: m.description,
      completed: false,
      weight: m.weight,
    })) || [];

    // Normalize weights if provided
    if (milestones.length > 0) {
      const totalWeight = milestones.reduce((s, m) => s + m.weight, 0);
      if (totalWeight !== 1) {
        milestones.forEach(m => m.weight = m.weight / totalWeight);
      }
    }

    const goal: Goal = {
      id,
      domain: proposal.domain,
      title: proposal.title,
      description: proposal.description,
      priority: proposal.priority,
      status: 'pending',
      subGoals: [],
      milestones,
      metrics: {
        progress: 0,
        confidence: 0.5,
        resourcesUsed: 0,
        resourcesRemaining: 100,
        timeSpent: 0,
        timeRemaining: proposal.deadline
          ? proposal.deadline.getTime() - now.getTime()
          : this.config.goalTimeout,
      },
      utility: proposal.utility,
      urgency: proposal.urgency,
      importance: proposal.importance,
      deadline: proposal.deadline,
      dependencies: [],
      blockedBy: [],
      createdAt: now,
      lastEvaluatedAt: now,
      context: proposal.context || {},
      tags: proposal.tags || [],
    };

    this.goals.set(id, goal);

    // Emit goal created event
    this.emitEvent('goal.created', {
      goalId: id,
      domain: goal.domain,
      title: goal.title,
      priority: goal.priority,
    });

    return goal;
  }

  /**
   * Create a sub-goal linked to a parent
   */
  createSubGoal(parentId: string, proposal: GoalProposal): Goal | null {
    const parent = this.goals.get(parentId);
    if (!parent) return null;

    const subGoal = this.createGoal({
      ...proposal,
      priority: proposal.priority || parent.priority,
    });

    subGoal.parentGoalId = parentId;
    parent.subGoals.push(subGoal.id);

    return subGoal;
  }

  // ===========================================================================
  // Goal Activation
  // ===========================================================================

  activateGoal(goalId: string): boolean {
    const goal = this.goals.get(goalId);
    if (!goal || goal.status !== 'pending') return false;

    // Check dependencies
    for (const depId of goal.dependencies) {
      const dep = this.goals.get(depId);
      if (dep && dep.status !== 'completed') {
        goal.blockedBy.push(depId);
        return false;
      }
    }

    // Check max active goals
    const activeCount = [...this.goals.values()].filter(g => g.status === 'active').length;
    if (activeCount >= this.config.maxActiveGoals) {
      // Try to pause lowest priority active goal
      const activeGoals = [...this.goals.values()]
        .filter(g => g.status === 'active')
        .sort((a, b) => this.calculateEffectivePriority(a) - this.calculateEffectivePriority(b));

      if (activeGoals.length > 0 &&
          this.calculateEffectivePriority(goal) > this.calculateEffectivePriority(activeGoals[0])) {
        this.pauseGoal(activeGoals[0].id);
      } else {
        return false;  // Can't activate, lower priority than current goals
      }
    }

    goal.status = 'active';
    goal.activatedAt = new Date();
    goal.blockedBy = [];

    this.emitEvent('goal.activated', {
      goalId,
      title: goal.title,
      priority: goal.priority,
    });

    return true;
  }

  pauseGoal(goalId: string): boolean {
    const goal = this.goals.get(goalId);
    if (!goal || goal.status !== 'active') return false;

    goal.status = 'paused';

    this.emitEvent('goal.paused', {
      goalId,
      title: goal.title,
      progress: goal.metrics.progress,
    });

    return true;
  }

  abandonGoal(goalId: string, reason: string): boolean {
    const goal = this.goals.get(goalId);
    if (!goal || goal.status === 'completed' || goal.status === 'abandoned') return false;

    goal.status = 'abandoned';
    goal.context.abandonReason = reason;

    // Record failure for future planning
    recordModuleLesson('goal-system', `Goal abandoned: "${goal.title}" (domain=${goal.domain}, progress=${(goal.metrics.progress * 100).toFixed(0)}%, reason=${reason})`);

    this.emitEvent('goal.abandoned', {
      goalId,
      title: goal.title,
      reason,
      progress: goal.metrics.progress,
    });

    return true;
  }

  // ===========================================================================
  // Progress Tracking
  // ===========================================================================

  completeMilestone(goalId: string, milestoneId: string): boolean {
    const goal = this.goals.get(goalId);
    if (!goal) return false;

    const milestone = goal.milestones.find(m => m.id === milestoneId);
    if (!milestone || milestone.completed) return false;

    milestone.completed = true;
    milestone.completedAt = new Date();

    // Update progress
    goal.metrics.progress = goal.milestones
      .filter(m => m.completed)
      .reduce((sum, m) => sum + m.weight, 0);

    // Check if goal is complete
    if (goal.metrics.progress >= 1) {
      this.completeGoal(goalId);
    }

    this.emitEvent('goal.milestone.completed', {
      goalId,
      milestoneId,
      description: milestone.description,
      overallProgress: goal.metrics.progress,
    });

    return true;
  }

  updateProgress(goalId: string, progress: number): void {
    const goal = this.goals.get(goalId);
    if (!goal) return;

    const previousProgress = goal.metrics.progress;
    goal.metrics.progress = Math.min(1, Math.max(0, progress));

    // Auto-complete if at 100%
    if (goal.metrics.progress >= 1 && goal.status === 'active') {
      this.completeGoal(goalId);
    }

    // Track evaluation
    this.evaluations.push({
      goalId,
      timestamp: new Date(),
      previousProgress,
      currentProgress: goal.metrics.progress,
      progressDelta: goal.metrics.progress - previousProgress,
      recommendation: 'continue',
      reasoning: 'Manual progress update',
    });
  }

  private updateDomainProgress(domain: GoalDomain, delta: number): void {
    // Find active goals in this domain and update progress
    const domainGoals = [...this.goals.values()]
      .filter(g => g.domain === domain && g.status === 'active');

    for (const goal of domainGoals) {
      const newProgress = Math.min(1, goal.metrics.progress + delta);
      this.updateProgress(goal.id, newProgress);
    }
  }

  private completeGoal(goalId: string): void {
    const goal = this.goals.get(goalId);
    if (!goal) return;

    goal.status = 'completed';
    goal.completedAt = new Date();
    goal.metrics.progress = 1;
    goal.metrics.timeSpent = goal.completedAt.getTime() -
      (goal.activatedAt?.getTime() || goal.createdAt.getTime());

    // Update parent progress if exists
    if (goal.parentGoalId) {
      const parent = this.goals.get(goal.parentGoalId);
      if (parent) {
        const completedSubs = parent.subGoals
          .filter(id => this.goals.get(id)?.status === 'completed').length;
        parent.metrics.progress = completedSubs / parent.subGoals.length;

        if (parent.metrics.progress >= 1) {
          this.completeGoal(parent.id);
        }
      }
    }

    // Unblock dependent goals
    for (const other of this.goals.values()) {
      const blockIdx = other.blockedBy.indexOf(goalId);
      if (blockIdx >= 0) {
        other.blockedBy.splice(blockIdx, 1);
        if (other.blockedBy.length === 0 && other.status === 'pending') {
          this.activateGoal(other.id);
        }
      }
    }

    // Store in memory
    this.storeGoalCompletion(goal);

    // Persist goal outcome as a module lesson
    recordModuleLesson('goal-system', `Goal completed: "${goal.title}" (domain=${goal.domain}, time=${goal.metrics.timeSpent}ms)`);

    this.emitEvent('goal.completed', {
      goalId,
      title: goal.title,
      domain: goal.domain,
      timeSpent: goal.metrics.timeSpent,
    });
  }

  // ===========================================================================
  // Goal Evaluation
  // ===========================================================================

  private calculateEffectivePriority(goal: Goal): number {
    const basePriority = PRIORITY_VALUES[goal.priority];
    const urgencyBonus = goal.urgency * 0.3;
    const importanceBonus = goal.importance * 0.2;
    const progressPenalty = goal.metrics.progress * 0.1;  // Less priority for nearly-done goals

    return basePriority + urgencyBonus + importanceBonus - progressPenalty;
  }

  evaluateGoals(): GoalEvaluation[] {
    const now = new Date();
    const evaluations: GoalEvaluation[] = [];

    for (const goal of this.goals.values()) {
      if (goal.status !== 'active' && goal.status !== 'pending') continue;

      const evaluation = this.evaluateGoal(goal, now);
      evaluations.push(evaluation);

      // Apply recommendations
      switch (evaluation.recommendation) {
        case 'abandon':
          this.abandonGoal(goal.id, evaluation.reasoning);
          break;
        case 'pause':
          this.pauseGoal(goal.id);
          break;
        case 'prioritize':
          goal.priority = this.upgradePriority(goal.priority);
          break;
        case 'deprioritize':
          goal.priority = this.downgradePriority(goal.priority);
          break;
      }

      goal.lastEvaluatedAt = now;
    }

    this.evaluations.push(...evaluations);

    // Trim old evaluations
    if (this.evaluations.length > 500) {
      this.evaluations = this.evaluations.slice(-200);
    }

    return evaluations;
  }

  private evaluateGoal(goal: Goal, now: Date): GoalEvaluation {
    const timeSinceLastEval = now.getTime() - goal.lastEvaluatedAt.getTime();
    const previousEval = this.evaluations
      .filter(e => e.goalId === goal.id)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    const previousProgress = previousEval?.currentProgress || 0;
    const progressDelta = goal.metrics.progress - previousProgress;

    // Calculate expected progress rate
    const timeActive = goal.activatedAt
      ? now.getTime() - goal.activatedAt.getTime()
      : 0;
    const expectedProgressRate = 1 / this.config.goalTimeout;  // Linear expectation
    const actualProgressRate = timeActive > 0 ? goal.metrics.progress / timeActive : 0;

    // Decision logic
    let recommendation: GoalEvaluation['recommendation'] = 'continue';
    let reasoning = '';

    // Check for stale goal (no progress in long time)
    if (progressDelta === 0 && timeSinceLastEval > this.config.goalTimeout / 4) {
      recommendation = 'abandon';
      reasoning = 'No progress for extended period';
    }
    // Check for deadline approaching with insufficient progress
    else if (goal.deadline) {
      const timeRemaining = goal.deadline.getTime() - now.getTime();
      const requiredRate = (1 - goal.metrics.progress) / timeRemaining;
      if (requiredRate > actualProgressRate * 2) {
        recommendation = 'prioritize';
        reasoning = 'Deadline approaching, need to accelerate';
      }
    }
    // Check for underperforming goal
    else if (actualProgressRate < expectedProgressRate * 0.5 && goal.metrics.progress < 0.3) {
      recommendation = 'pause';
      reasoning = 'Progress rate significantly below expectation';
    }
    // Check for high-performing goal
    else if (actualProgressRate > expectedProgressRate * 2 && goal.priority !== 'critical') {
      recommendation = 'continue';  // Keep doing what's working
      reasoning = 'Excellent progress, maintain momentum';
    }
    // Default: continue
    else {
      recommendation = 'continue';
      reasoning = 'Progress on track';
    }

    return {
      goalId: goal.id,
      timestamp: now,
      previousProgress,
      currentProgress: goal.metrics.progress,
      progressDelta,
      recommendation,
      reasoning,
    };
  }

  private upgradePriority(current: GoalPriority): GoalPriority {
    switch (current) {
      case 'low': return 'medium';
      case 'medium': return 'high';
      case 'high': return 'critical';
      default: return current;
    }
  }

  private downgradePriority(current: GoalPriority): GoalPriority {
    switch (current) {
      case 'critical': return 'high';
      case 'high': return 'medium';
      case 'medium': return 'low';
      default: return current;
    }
  }

  // ===========================================================================
  // Goal Generation
  // ===========================================================================

  generateGoalsFromStrategy(): Goal[] {
    const generated: Goal[] = [];

    try {
      const strategyOrchestrator = getStrategyOrchestrator();
      const allocation = strategyOrchestrator.getCurrentAllocation();

      // Generate goals based on strategy allocation
      if (allocation.bounty > 0.3) {
        generated.push(this.createGoal({
          domain: 'revenue',
          title: 'Revenue Generation Sprint',
          description: 'Focus on completing high-value bounties',
          priority: 'high',
          utility: 0.8,
          urgency: 0.6,
          importance: allocation.bounty,
          milestones: [
            { description: 'Complete 3 bounties', weight: 0.5 },
            { description: 'Achieve 80%+ success rate', weight: 0.3 },
            { description: 'Earn $100+ revenue', weight: 0.2 },
          ],
          tags: ['revenue', 'bounty', 'sprint'],
        }));
      }

      if (allocation.content > 0.3) {
        generated.push(this.createGoal({
          domain: 'growth',
          title: 'Content Growth Campaign',
          description: 'Create and publish engaging content',
          priority: 'medium',
          utility: 0.7,
          urgency: 0.4,
          importance: allocation.content,
          milestones: [
            { description: 'Publish 5 pieces of content', weight: 0.4 },
            { description: 'Achieve 10%+ engagement rate', weight: 0.3 },
            { description: 'Gain 100+ new followers', weight: 0.3 },
          ],
          tags: ['content', 'growth', 'social'],
        }));
      }

      if (allocation.learning > 0.2) {
        generated.push(this.createGoal({
          domain: 'learning',
          title: 'Capability Enhancement',
          description: 'Improve skills and learn from experience',
          priority: 'low',
          utility: 0.6,
          urgency: 0.2,
          importance: allocation.learning,
          milestones: [
            { description: 'Analyze 10 past decisions', weight: 0.3 },
            { description: 'Identify 2 improvement areas', weight: 0.3 },
            { description: 'Implement 1 improvement', weight: 0.4 },
          ],
          tags: ['learning', 'improvement', 'reflection'],
        }));
      }

      // Activate top goals up to limit
      const sorted = generated.sort((a, b) =>
        this.calculateEffectivePriority(b) - this.calculateEffectivePriority(a)
      );
      for (const goal of sorted.slice(0, this.config.maxActiveGoals)) {
        this.activateGoal(goal.id);
      }

    } catch (err) {
      // Strategy orchestrator not available
      console.error('[GoalSystem] Failed to get strategic priorities:', err);
    }

    return generated;
  }

  private generateLearningGoal(): void {
    const existingLearning = [...this.goals.values()]
      .filter(g => g.domain === 'learning' && g.status !== 'completed' && g.status !== 'abandoned');

    if (existingLearning.length >= 2) return;  // Already have learning goals

    this.createGoal({
      domain: 'learning',
      title: 'Address Reflection Insights',
      description: 'Implement improvements from self-reflection',
      priority: 'medium',
      utility: 0.65,
      urgency: 0.3,
      importance: 0.7,
      milestones: [
        { description: 'Review reflection report', weight: 0.2 },
        { description: 'Approve relevant proposals', weight: 0.3 },
        { description: 'Verify improvement in metrics', weight: 0.5 },
      ],
      tags: ['learning', 'reflection', 'improvement'],
    });
  }

  // ===========================================================================
  // Memory Integration
  // ===========================================================================

  private async storeGoalCompletion(goal: Goal): Promise<void> {
    try {
      const memory = getMemorySystem();
      await memory.remember({
        what: `Completed goal: ${goal.title} (success)`,
        when: goal.completedAt || new Date(),
        where: { location: goal.domain, context: 'goal-completion' },
        who: { agents: ['goal-system'] },
        importance: goal.importance,
        tags: ['goal', 'completed', goal.domain, ...goal.tags],
      });
    } catch (err) {
      // Memory system not available
      console.error('[GoalSystem] Failed to store goal completion in memory:', err);
    }
  }

  // ===========================================================================
  // Utility Helpers
  // ===========================================================================

  private emitEvent(topic: string, data: Record<string, unknown>): void {
    const bus = getEventBus();
    (bus as unknown as { publish: (topic: string, event: Record<string, unknown>) => void }).publish(
      `autonomous:${topic}`,
      { precision: 0.9, ...data }
    );
  }

  // ===========================================================================
  // Control
  // ===========================================================================

  start(): void {
    if (this.running) return;
    this.running = true;

    // Initial goal generation
    if (this.config.autoGenerate) {
      this.generateGoalsFromStrategy();
    }

    // Periodic evaluation
    this.timer = setInterval(() => {
      this.evaluateGoals();
    }, this.config.evaluationInterval);

    console.log('[GoalSystem] Started — autonomous goal pursuit active');
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ===========================================================================
  // Getters
  // ===========================================================================

  getGoal(goalId: string): Goal | undefined {
    return this.goals.get(goalId);
  }

  getAllGoals(): Goal[] {
    return [...this.goals.values()];
  }

  getActiveGoals(): Goal[] {
    return [...this.goals.values()].filter(g => g.status === 'active');
  }

  getGoalsByDomain(domain: GoalDomain): Goal[] {
    return [...this.goals.values()].filter(g => g.domain === domain);
  }

  getStats(): {
    total: number;
    active: number;
    pending: number;
    completed: number;
    failed: number;
    abandoned: number;
    avgProgress: number;
    byDomain: Record<GoalDomain, number>;
  } {
    const goals = [...this.goals.values()];
    const active = goals.filter(g => g.status === 'active');

    const byDomain: Record<GoalDomain, number> = {
      revenue: 0,
      growth: 0,
      learning: 0,
      maintenance: 0,
      exploration: 0,
      custom: 0,
    };
    for (const goal of goals) {
      byDomain[goal.domain]++;
    }

    return {
      total: goals.length,
      active: active.length,
      pending: goals.filter(g => g.status === 'pending').length,
      completed: goals.filter(g => g.status === 'completed').length,
      failed: goals.filter(g => g.status === 'failed').length,
      abandoned: goals.filter(g => g.status === 'abandoned').length,
      avgProgress: active.length > 0
        ? active.reduce((s, g) => s + g.metrics.progress, 0) / active.length
        : 0,
      byDomain,
    };
  }

  getTopPriorityGoals(limit = 5): Goal[] {
    return [...this.goals.values()]
      .filter(g => g.status === 'active' || g.status === 'pending')
      .sort((a, b) => this.calculateEffectivePriority(b) - this.calculateEffectivePriority(a))
      .slice(0, limit);
  }

  getRecentEvaluations(limit = 20): GoalEvaluation[] {
    return this.evaluations.slice(-limit);
  }
}

// ============================================================================
// Singleton
// ============================================================================

let goalSystemInstance: GoalSystem | null = null;

export function getGoalSystem(config?: Partial<GoalConfig>): GoalSystem {
  if (!goalSystemInstance) {
    goalSystemInstance = new GoalSystem(config);
  }
  return goalSystemInstance;
}

export function resetGoalSystem(): void {
  if (goalSystemInstance) {
    goalSystemInstance.stop();
  }
  goalSystemInstance = null;
}
