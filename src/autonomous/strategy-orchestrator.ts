/**
 * Adaptive Strategy Orchestrator v28.0
 *
 * Meta-level orchestration that dynamically allocates resources between:
 * - Bounty hunting (short-term revenue)
 * - Content creation (long-term growth)
 * - Learning/consolidation (capability building)
 * - Rest/recovery (system health)
 *
 * Uses Decision Engine for individual decisions, but this module
 * handles the higher-level strategic allocation across domains.
 *
 * Inspired by:
 * - Active Inference (minimize expected free energy)
 * - Portfolio theory (diversification)
 * - Reinforcement learning (explore/exploit)
 *
 * @module autonomous/strategy-orchestrator
 * @version 28.0.0
 */

import { getEventBus, type GenesisEventBus } from '../bus/index.js';
import { getMemorySystem, type MemorySystem } from '../memory/index.js';
import { getCognitiveBridge } from '../integration/cognitive-bridge.js';
import { getPhiMonitor } from '../consciousness/phi-monitor.js';
import { getDecisionEngine, type DecisionContext, type Decision } from './decision-engine.js';
import { getBountyOrchestrator } from '../economy/bounty-orchestrator.js';
import { getContentIntelligence } from '../content/intelligence.js';

// ============================================================================
// Types
// ============================================================================

export type Strategy = 'bounty-focus' | 'content-focus' | 'balanced' | 'learning' | 'rest';

export interface StrategyAllocation {
  bounty: number;  // 0-1
  content: number;  // 0-1
  learning: number;  // 0-1
  rest: number;  // 0-1
}

export interface MarketConditions {
  bountyAvailability: number;  // 0-1 how many good bounties
  bountyCompetition: number;  // 0-1 how competitive
  contentDemand: number;  // 0-1 engagement potential
  trendingTopics: number;  // count of hot topics
  systemLoad: number;  // 0-1 current load
  fatigue: number;  // 0-1 system fatigue
}

export interface StrategyDecision {
  id: string;
  strategy: Strategy;
  allocation: StrategyAllocation;
  reasoning: string[];
  conditions: MarketConditions;
  confidence: number;
  timestamp: Date;
  duration: number;  // How long to hold this strategy (ms)
}

export interface StrategyOutcome {
  decisionId: string;
  bountyRevenue: number;
  contentEngagement: number;
  learningsAcquired: number;
  healthRecovered: number;
  surprisal: number;
}

export interface StrategyConfig {
  evaluationInterval: number;  // How often to re-evaluate (ms)
  minStrategyDuration: number;  // Min time to hold strategy (ms)
  revenueWeight: number;  // Weight for short-term revenue
  growthWeight: number;  // Weight for long-term growth
  healthWeight: number;  // Weight for system health
  explorationRate: number;  // Probability of trying new strategy
  riskTolerance: number;
}

interface StrategyMetrics {
  totalEvaluations: number;
  strategyDistribution: Record<Strategy, number>;
  avgConfidence: number;
  avgSurprisal: number;
  cumulativeRevenue: number;
  cumulativeEngagement: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: StrategyConfig = {
  evaluationInterval: 5 * 60 * 1000,  // 5 minutes
  minStrategyDuration: 10 * 60 * 1000,  // 10 minutes
  revenueWeight: 0.4,
  growthWeight: 0.3,
  healthWeight: 0.3,
  explorationRate: 0.15,
  riskTolerance: 0.4,
};

// ============================================================================
// Strategy Orchestrator
// ============================================================================

export class StrategyOrchestrator {
  private config: StrategyConfig;
  private bus: GenesisEventBus;
  private memory: MemorySystem;
  private decisionEngine = getDecisionEngine();
  private bridge = getCognitiveBridge();

  private currentStrategy: StrategyDecision | null = null;
  private strategyHistory: StrategyDecision[] = [];
  private outcomes: StrategyOutcome[] = [];
  private metrics: StrategyMetrics;
  private evaluationTimer: NodeJS.Timeout | null = null;
  private decisionCounter = 0;

  constructor(config?: Partial<StrategyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bus = getEventBus();
    this.memory = getMemorySystem();
    this.metrics = {
      totalEvaluations: 0,
      strategyDistribution: {
        'bounty-focus': 0,
        'content-focus': 0,
        'balanced': 0,
        'learning': 0,
        'rest': 0,
      },
      avgConfidence: 0.5,
      avgSurprisal: 0.5,
      cumulativeRevenue: 0,
      cumulativeEngagement: 0,
    };

    this.setupEventHandlers();
  }

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  private setupEventHandlers(): void {
    // Listen for relevant events to update conditions
    this.bus.subscribePrefix('neuromod.', (event: any) => {
      if (event.topic === 'neuromod.fatigue' && event.magnitude > 0.8) {
        this.considerStrategySwitch('rest');
      }
    });

    this.bus.subscribePrefix('pain.', (event: any) => {
      if (event.topic === 'pain.spike' && event.level === 'critical') {
        this.forceStrategy('rest', 'Pain spike detected');
      }
    });

    this.bus.subscribePrefix('bounty.', (event: any) => {
      if (event.topic === 'bounty.opportunity.high') {
        this.considerStrategySwitch('bounty-focus');
      }
    });

    this.bus.subscribePrefix('content.', (event: any) => {
      if (event.topic === 'content.trend.viral') {
        this.considerStrategySwitch('content-focus');
      }
    });
  }

  // ===========================================================================
  // Core Strategy Selection
  // ===========================================================================

  /**
   * Evaluate current conditions and select optimal strategy
   */
  async evaluate(): Promise<StrategyDecision> {
    const id = `strat-${++this.decisionCounter}-${Date.now().toString(36)}`;
    this.metrics.totalEvaluations++;

    // Gather market conditions
    const conditions = await this.gatherConditions();

    // Check if current strategy still valid
    if (this.currentStrategy && !this.shouldSwitch(conditions)) {
      return this.currentStrategy;
    }

    // Evaluate each strategy option
    const strategies: Strategy[] = ['bounty-focus', 'content-focus', 'balanced', 'learning', 'rest'];
    const evaluations = strategies.map(s => ({
      strategy: s,
      score: this.scoreStrategy(s, conditions),
      allocation: this.getAllocation(s),
    }));

    // Select best (or explore)
    let selected: typeof evaluations[0];
    if (Math.random() < this.config.explorationRate) {
      // Explore: pick random non-optimal strategy
      const nonBest = evaluations.filter(e => e.score < Math.max(...evaluations.map(x => x.score)));
      selected = nonBest[Math.floor(Math.random() * nonBest.length)] || evaluations[0];
    } else {
      // Exploit: pick best
      selected = evaluations.sort((a, b) => b.score - a.score)[0];
    }

    // Build decision
    const decision: StrategyDecision = {
      id,
      strategy: selected.strategy,
      allocation: selected.allocation,
      reasoning: this.generateReasoning(selected.strategy, conditions),
      conditions,
      confidence: this.computeConfidence(selected.score, conditions),
      timestamp: new Date(),
      duration: this.computeDuration(selected.strategy, conditions),
    };

    // Ground the decision
    const grounded = await this.bridge.groundAction(`strategy: ${selected.strategy}`, { conditions });
    if (!grounded.grounded && grounded.confidence < 0.3) {
      // Fall back to balanced if not grounded
      decision.strategy = 'balanced';
      decision.allocation = this.getAllocation('balanced');
      decision.reasoning.push('Defaulted to balanced (grounding failed)');
    }

    // Store
    this.currentStrategy = decision;
    this.strategyHistory.push(decision);
    if (this.strategyHistory.length > 100) {
      this.strategyHistory.shift();
    }

    // Update metrics
    this.metrics.strategyDistribution[decision.strategy]++;
    const alpha = 0.1;
    this.metrics.avgConfidence = this.metrics.avgConfidence * (1 - alpha) + decision.confidence * alpha;

    // Emit event
    this.emitStrategyEvent(decision);

    // Store in memory
    this.memory.remember({
      what: `Strategy selected: ${decision.strategy}`,
      tags: ['strategy', decision.strategy, `confidence-${Math.round(decision.confidence * 10) / 10}`],
      importance: decision.confidence,
    });

    console.log(`[StrategyOrchestrator] Selected: ${decision.strategy} (confidence: ${decision.confidence.toFixed(2)})`);

    return decision;
  }

  // ===========================================================================
  // Condition Gathering
  // ===========================================================================

  private async gatherConditions(): Promise<MarketConditions> {
    let bountyAvailability = 0.5;
    let bountyCompetition = 0.5;
    try {
      const orchestrator = getBountyOrchestrator();
      const state = orchestrator.getState();
      bountyAvailability = Math.min(1, state.activeBounties.size / 5);
      // Competition would come from competition detector
    } catch (err) {
      // Not initialized
      console.error('[StrategyOrchestrator] Failed to get bounty availability:', err);
    }

    let contentDemand = 0.5;
    let trendingTopics = 0;
    try {
      const intelligence = getContentIntelligence();
      const stats = intelligence.getEngagementStats();
      contentDemand = stats.avgEngagement / 1000;  // Normalize
      trendingTopics = intelligence.getActiveTrends().length;
    } catch (err) {
      // Not initialized
      console.error('[StrategyOrchestrator] Failed to get content demand:', err);
    }

    // System metrics
    const memUsage = process.memoryUsage();
    const systemLoad = memUsage.heapUsed / memUsage.heapTotal;

    // Get fatigue from neuromodulation (placeholder)
    const fatigue = systemLoad * 0.5;  // Would come from actual neuromodulation

    return {
      bountyAvailability,
      bountyCompetition,
      contentDemand,
      trendingTopics,
      systemLoad,
      fatigue,
    };
  }

  // ===========================================================================
  // Strategy Scoring
  // ===========================================================================

  private scoreStrategy(strategy: Strategy, conditions: MarketConditions): number {
    const { revenueWeight, growthWeight, healthWeight } = this.config;

    switch (strategy) {
      case 'bounty-focus':
        return (
          conditions.bountyAvailability * revenueWeight +
          (1 - conditions.bountyCompetition) * 0.2 +
          (1 - conditions.fatigue) * healthWeight * 0.5
        );

      case 'content-focus':
        return (
          conditions.contentDemand * growthWeight +
          Math.min(1, conditions.trendingTopics / 5) * 0.3 +
          (1 - conditions.fatigue) * healthWeight * 0.5
        );

      case 'balanced':
        return (
          (conditions.bountyAvailability + conditions.contentDemand) / 2 * 0.6 +
          (1 - conditions.fatigue) * healthWeight * 0.4
        );

      case 'learning':
        return (
          (1 - conditions.bountyAvailability) * 0.3 +  // Learn when no bounties
          (1 - conditions.systemLoad) * 0.3 +
          (1 - conditions.fatigue) * healthWeight * 0.4
        );

      case 'rest':
        return conditions.fatigue * healthWeight + conditions.systemLoad * 0.2;
    }
  }

  private getAllocation(strategy: Strategy): StrategyAllocation {
    switch (strategy) {
      case 'bounty-focus':
        return { bounty: 0.7, content: 0.15, learning: 0.1, rest: 0.05 };
      case 'content-focus':
        return { bounty: 0.15, content: 0.7, learning: 0.1, rest: 0.05 };
      case 'balanced':
        return { bounty: 0.35, content: 0.35, learning: 0.2, rest: 0.1 };
      case 'learning':
        return { bounty: 0.1, content: 0.1, learning: 0.7, rest: 0.1 };
      case 'rest':
        return { bounty: 0.05, content: 0.05, learning: 0.1, rest: 0.8 };
    }
  }

  private shouldSwitch(conditions: MarketConditions): boolean {
    if (!this.currentStrategy) return true;

    // Check if min duration elapsed
    const elapsed = Date.now() - this.currentStrategy.timestamp.getTime();
    if (elapsed < this.config.minStrategyDuration) {
      return false;
    }

    // Check if conditions changed significantly
    const oldCond = this.currentStrategy.conditions;
    const delta =
      Math.abs(conditions.bountyAvailability - oldCond.bountyAvailability) +
      Math.abs(conditions.contentDemand - oldCond.contentDemand) +
      Math.abs(conditions.fatigue - oldCond.fatigue);

    return delta > 0.5;  // Significant change threshold
  }

  private computeConfidence(score: number, conditions: MarketConditions): number {
    // Confidence based on score clarity and condition stability
    let confidence = score;

    // Reduce confidence if conditions are volatile
    if (conditions.fatigue > 0.7) confidence *= 0.8;
    if (conditions.systemLoad > 0.8) confidence *= 0.9;

    // Boost from phi
    const phiMonitor = getPhiMonitor();
    const levelData = phiMonitor.getCurrentLevel?.() ?? null;
    const phi = typeof levelData === 'number' ? levelData : (levelData?.phi ?? 0.5);
    confidence *= 0.8 + phi * 0.2;

    return Math.max(0, Math.min(1, confidence));
  }

  private computeDuration(strategy: Strategy, conditions: MarketConditions): number {
    // Base duration
    let duration = this.config.minStrategyDuration;

    // Extend for stable strategies
    if (strategy === 'rest' && conditions.fatigue > 0.7) {
      duration *= 2;  // Rest longer when fatigued
    }
    if (strategy === 'learning' && conditions.bountyAvailability < 0.3) {
      duration *= 1.5;  // Learn longer when no bounties
    }

    return duration;
  }

  private generateReasoning(strategy: Strategy, conditions: MarketConditions): string[] {
    const reasons: string[] = [];

    switch (strategy) {
      case 'bounty-focus':
        if (conditions.bountyAvailability > 0.6) reasons.push('High bounty availability');
        if (conditions.bountyCompetition < 0.4) reasons.push('Low competition');
        break;
      case 'content-focus':
        if (conditions.contentDemand > 0.6) reasons.push('High content demand');
        if (conditions.trendingTopics > 3) reasons.push(`${conditions.trendingTopics} trending topics`);
        break;
      case 'balanced':
        reasons.push('Diversified approach for stability');
        break;
      case 'learning':
        if (conditions.bountyAvailability < 0.3) reasons.push('Low bounty availability - time to learn');
        reasons.push('Building capabilities for future');
        break;
      case 'rest':
        if (conditions.fatigue > 0.6) reasons.push('High fatigue detected');
        if (conditions.systemLoad > 0.7) reasons.push('System load elevated');
        break;
    }

    return reasons.length > 0 ? reasons : ['Default strategy selection'];
  }

  // ===========================================================================
  // Strategy Switching
  // ===========================================================================

  private async considerStrategySwitch(suggested: Strategy): Promise<void> {
    if (!this.currentStrategy) {
      await this.evaluate();
      return;
    }

    // Only switch if significantly better
    const conditions = await this.gatherConditions();
    const currentScore = this.scoreStrategy(this.currentStrategy.strategy, conditions);
    const suggestedScore = this.scoreStrategy(suggested, conditions);

    if (suggestedScore > currentScore + 0.2) {
      console.log(`[StrategyOrchestrator] Switching from ${this.currentStrategy.strategy} to ${suggested}`);
      await this.evaluate();
    }
  }

  private forceStrategy(strategy: Strategy, reason: string): void {
    const id = `strat-forced-${Date.now().toString(36)}`;
    const allocation = this.getAllocation(strategy);

    this.currentStrategy = {
      id,
      strategy,
      allocation,
      reasoning: [`Forced: ${reason}`],
      conditions: this.currentStrategy?.conditions || {} as MarketConditions,
      confidence: 0.9,
      timestamp: new Date(),
      duration: this.config.minStrategyDuration * 2,
    };

    console.log(`[StrategyOrchestrator] Forced strategy: ${strategy} (${reason})`);
    this.emitStrategyEvent(this.currentStrategy);
  }

  private emitStrategyEvent(decision: StrategyDecision): void {
    try {
      (this.bus as any).publish('strategy.selected', {
        id: decision.id,
        strategy: decision.strategy,
        allocation: decision.allocation,
        confidence: decision.confidence,
        timestamp: decision.timestamp.toISOString(),
      });
    } catch (err) {
      // Event bus may not support custom topics
      console.error('[StrategyOrchestrator] Failed to publish allocation decision:', err);
    }
  }

  // ===========================================================================
  // Outcome Recording
  // ===========================================================================

  recordOutcome(outcome: StrategyOutcome): void {
    this.outcomes.push(outcome);
    if (this.outcomes.length > 200) {
      this.outcomes.shift();
    }

    // Update metrics
    this.metrics.cumulativeRevenue += outcome.bountyRevenue;
    this.metrics.cumulativeEngagement += outcome.contentEngagement;

    const alpha = 0.1;
    this.metrics.avgSurprisal = this.metrics.avgSurprisal * (1 - alpha) + outcome.surprisal * alpha;

    // Learn from outcome
    this.bridge.recordGroundingOutcome(
      `strategy: ${this.currentStrategy?.strategy}`,
      outcome.bountyRevenue + outcome.contentEngagement > 0,
      { outcome }
    );
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  start(): void {
    if (this.evaluationTimer) return;

    // Initial evaluation
    this.evaluate();

    // Periodic re-evaluation
    this.evaluationTimer = setInterval(() => {
      this.evaluate();
    }, this.config.evaluationInterval);

    console.log('[StrategyOrchestrator] Started');
  }

  stop(): void {
    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer);
      this.evaluationTimer = null;
    }
    console.log('[StrategyOrchestrator] Stopped');
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  getCurrentStrategy(): StrategyDecision | null {
    return this.currentStrategy;
  }

  getCurrentAllocation(): StrategyAllocation {
    return this.currentStrategy?.allocation || this.getAllocation('balanced');
  }

  getMetrics(): StrategyMetrics {
    return { ...this.metrics };
  }

  getHistory(limit: number = 20): StrategyDecision[] {
    return this.strategyHistory.slice(-limit);
  }
}

// ============================================================================
// Singleton
// ============================================================================

let orchestratorInstance: StrategyOrchestrator | null = null;

export function getStrategyOrchestrator(config?: Partial<StrategyConfig>): StrategyOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new StrategyOrchestrator(config);
  }
  return orchestratorInstance;
}

export function resetStrategyOrchestrator(): void {
  if (orchestratorInstance) {
    orchestratorInstance.stop();
  }
  orchestratorInstance = null;
}
