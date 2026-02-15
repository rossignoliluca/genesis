/**
 * Autonomous Decision Engine v25.0
 *
 * Unified decision-making layer that coordinates all cognitive systems:
 * - Active Inference (Expected Free Energy minimization)
 * - Consciousness (Phi-based gating)
 * - Memory (Episodic/semantic/procedural context)
 * - Cognitive Bridge (Perception→Consciousness→Inference)
 * - Neuromodulation (Emotional influence)
 * - Nociception (Pain-based avoidance)
 *
 * Makes autonomous decisions about:
 * - Which bounties to pursue
 * - What content to create
 * - When to rest/consolidate
 * - How to allocate resources
 * - When to learn vs exploit
 *
 * @module autonomous/decision-engine
 * @version 25.0.0
 */

import { getEventBus, type GenesisEventBus } from '../bus/index.js';
import { getMemorySystem, type MemorySystem } from '../memory/index.js';
import { getCognitiveBridge, type CognitiveBridge } from '../integration/cognitive-bridge.js';
import { getPhiMonitor } from '../consciousness/phi-monitor.js';

// ============================================================================
// Types
// ============================================================================

export type DecisionDomain =
  | 'bounty'
  | 'content'
  | 'resource'
  | 'learning'
  | 'rest'
  | 'communication';

export interface DecisionContext {
  domain: DecisionDomain;
  options: DecisionOption[];
  urgency: number;  // 0-1
  constraints: DecisionConstraint[];
  deadline?: Date;
}

export interface DecisionOption {
  id: string;
  description: string;
  expectedValue: number;  // 0-1
  risk: number;  // 0-1
  novelty: number;  // 0-1 (for exploration/exploitation)
  resources: ResourceRequirement[];
  dependencies?: string[];
}

export interface DecisionConstraint {
  type: 'budget' | 'time' | 'resource' | 'safety' | 'governance';
  limit: number;
  current: number;
}

export interface ResourceRequirement {
  type: 'tokens' | 'compute' | 'time' | 'api-calls';
  amount: number;
}

export interface Decision {
  id: string;
  domain: DecisionDomain;
  selectedOption: DecisionOption;
  confidence: number;
  reasoning: string[];
  factors: DecisionFactors;
  timestamp: Date;
  isReversible: boolean;
}

export interface DecisionFactors {
  efeScore: number;  // Expected Free Energy contribution
  phiInfluence: number;  // Consciousness level influence
  memoryContext: number;  // Past experience weight
  neuromodulation: {
    dopamine: number;  // Reward expectation
    cortisol: number;  // Stress/urgency
  };
  painAvoidance: number;  // Nociception influence
  groundingConfidence: number;  // Epistemic grounding
}

export interface DecisionOutcome {
  decisionId: string;
  success: boolean;
  actualValue: number;
  surprisal: number;  // Prediction error
  learnings: string[];
}

export interface DecisionEngineConfig {
  explorationRate: number;  // Epsilon for explore/exploit
  riskTolerance: number;  // Max acceptable risk
  minConfidence: number;  // Min confidence to execute
  phiThreshold: number;  // Min phi for complex decisions
  maxConcurrentDecisions: number;
  learningRate: number;
  usePainAvoidance: boolean;
  useGrounding: boolean;
}

export interface EngineState {
  pendingDecisions: Map<string, DecisionContext>;
  recentDecisions: Decision[];
  outcomeHistory: DecisionOutcome[];
  domainStats: Map<DecisionDomain, DomainStats>;
  currentMode: 'explore' | 'exploit' | 'rest' | 'consolidate';
  lastDecisionTime: Date;
}

interface DomainStats {
  totalDecisions: number;
  successRate: number;
  avgConfidence: number;
  avgSurprisal: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: DecisionEngineConfig = {
  explorationRate: 0.2,
  riskTolerance: 0.4,
  minConfidence: 0.6,
  phiThreshold: 0.3,
  maxConcurrentDecisions: 5,
  learningRate: 0.1,
  usePainAvoidance: true,
  useGrounding: true,
};

// ============================================================================
// Decision Engine
// ============================================================================

export class DecisionEngine {
  private config: DecisionEngineConfig;
  private bus: GenesisEventBus;
  private memory: MemorySystem;
  private bridge: CognitiveBridge;
  private state: EngineState;
  private decisionCounter = 0;

  constructor(config?: Partial<DecisionEngineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bus = getEventBus();
    this.memory = getMemorySystem();
    this.bridge = getCognitiveBridge();
    this.state = {
      pendingDecisions: new Map(),
      recentDecisions: [],
      outcomeHistory: [],
      domainStats: new Map(),
      currentMode: 'exploit',
      lastDecisionTime: new Date(),
    };

    this.setupEventHandlers();
    this.initializeDomainStats();
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  private setupEventHandlers(): void {
    // Listen for neuromodulation changes
    this.bus.subscribePrefix('neuromod.', (event: any) => {
      if (event.topic === 'neuromod.updated') {
        this.adjustBehavior(event.payload);
      }
    });

    // Listen for pain signals
    this.bus.subscribePrefix('pain.', (event: any) => {
      if (event.topic === 'pain.spike' && this.config.usePainAvoidance) {
        this.handlePainSpike(event.payload);
      }
    });

    // Listen for phi changes
    this.bus.subscribePrefix('consciousness.', (event: any) => {
      if (event.topic === 'consciousness.phi.updated') {
        this.adjustToConsciousnessLevel(event.payload);
      }
    });
  }

  private initializeDomainStats(): void {
    const domains: DecisionDomain[] = ['bounty', 'content', 'resource', 'learning', 'rest', 'communication'];
    for (const domain of domains) {
      this.state.domainStats.set(domain, {
        totalDecisions: 0,
        successRate: 0.5,
        avgConfidence: 0.5,
        avgSurprisal: 0.5,
      });
    }
  }

  // ===========================================================================
  // Core Decision Making
  // ===========================================================================

  /**
   * Make an autonomous decision given a context
   */
  async decide(context: DecisionContext): Promise<Decision | null> {
    const decisionId = `dec-${++this.decisionCounter}-${Date.now().toString(36)}`;

    // Check consciousness level for complex decisions
    const phi = this.getCurrentPhi();
    if (context.options.length > 2 && phi < this.config.phiThreshold) {
      console.log(`[DecisionEngine] Deferring complex decision - phi too low (${phi.toFixed(2)} < ${this.config.phiThreshold})`);
      this.state.pendingDecisions.set(decisionId, context);
      return null;
    }

    // Evaluate all options
    const evaluatedOptions = await Promise.all(
      context.options.map(opt => this.evaluateOption(opt, context))
    );

    // Get decision factors
    const factors = await this.computeDecisionFactors(context);

    // Select best option (or explore)
    const selectedOption = this.selectOption(evaluatedOptions, factors);

    if (!selectedOption) {
      console.log('[DecisionEngine] No viable option found');
      return null;
    }

    // Build decision
    const decision: Decision = {
      id: decisionId,
      domain: context.domain,
      selectedOption,
      confidence: this.computeConfidence(selectedOption, factors),
      reasoning: this.generateReasoning(selectedOption, factors),
      factors,
      timestamp: new Date(),
      isReversible: this.isReversible(context.domain),
    };

    // Check confidence threshold
    if (decision.confidence < this.config.minConfidence) {
      console.log(`[DecisionEngine] Decision confidence too low (${decision.confidence.toFixed(2)} < ${this.config.minConfidence})`);
      this.state.pendingDecisions.set(decisionId, context);
      return null;
    }

    // Store decision
    this.state.recentDecisions.push(decision);
    if (this.state.recentDecisions.length > 100) {
      this.state.recentDecisions.shift();
    }
    this.state.lastDecisionTime = new Date();

    // Ground the decision
    if (this.config.useGrounding) {
      const grounded = await this.bridge.groundAction(
        `${context.domain}: ${selectedOption.description}`,
        { decision }
      );
      if (!grounded.grounded && grounded.confidence < 0.4) {
        console.log('[DecisionEngine] Decision not grounded, deferring');
        return null;
      }
    }

    // Emit decision event
    this.emitDecisionEvent(decision);

    // Store in memory
    this.storeDecisionInMemory(decision);

    console.log(`[DecisionEngine] Decision made: ${decision.domain} -> ${selectedOption.id} (confidence: ${decision.confidence.toFixed(2)})`);

    return decision;
  }

  /**
   * Record the outcome of a decision for learning
   */
  recordOutcome(outcome: DecisionOutcome): void {
    this.state.outcomeHistory.push(outcome);
    if (this.state.outcomeHistory.length > 500) {
      this.state.outcomeHistory.shift();
    }

    // Find the original decision
    const decision = this.state.recentDecisions.find(d => d.id === outcome.decisionId);
    if (!decision) return;

    // Update domain stats
    const stats = this.state.domainStats.get(decision.domain);
    if (stats) {
      stats.totalDecisions++;
      const alpha = this.config.learningRate;
      stats.successRate = stats.successRate * (1 - alpha) + (outcome.success ? 1 : 0) * alpha;
      stats.avgSurprisal = stats.avgSurprisal * (1 - alpha) + outcome.surprisal * alpha;
    }

    // Record grounding outcome
    this.bridge.recordGroundingOutcome(
      `${decision.domain}: ${decision.selectedOption.description}`,
      outcome.success,
      { outcome }
    );

    // Store learning in memory
    this.memory.remember({
      what: `Decision outcome: ${decision.domain} ${outcome.success ? 'succeeded' : 'failed'}`,
      tags: ['decision', decision.domain, outcome.success ? 'success' : 'failure'],
      importance: outcome.surprisal,  // High surprisal = more important to remember
    });
  }

  // ===========================================================================
  // Option Evaluation
  // ===========================================================================

  private async evaluateOption(
    option: DecisionOption,
    context: DecisionContext
  ): Promise<DecisionOption & { score: number }> {
    let score = option.expectedValue;

    // Adjust for risk tolerance
    score -= option.risk * (1 - this.config.riskTolerance);

    // Adjust for novelty (exploration)
    if (Math.random() < this.config.explorationRate) {
      score += option.novelty * 0.3;
    }

    // Check resource constraints
    for (const constraint of context.constraints) {
      if (constraint.current >= constraint.limit * 0.9) {
        score *= 0.5;  // Penalize if near limits
      }
    }

    // Check memory for past similar decisions
    const pastResults = this.memory.recall(`decision ${option.id} ${context.domain}`, {
      types: ['episodic'],
      limit: 5,
    });
    if (pastResults.length > 0) {
      // Adjust based on past outcomes (simple average)
      const avgSuccess = 0.5;  // Would compute from pastResults
      score = score * 0.7 + avgSuccess * 0.3;
    }

    return { ...option, score };
  }

  private selectOption(
    options: Array<DecisionOption & { score: number }>,
    factors: DecisionFactors
  ): DecisionOption | null {
    if (options.length === 0) return null;

    // Filter by risk
    const viable = options.filter(o => o.risk <= this.config.riskTolerance);
    if (viable.length === 0) {
      console.log('[DecisionEngine] All options exceed risk tolerance');
      return options.sort((a, b) => a.risk - b.risk)[0];  // Pick least risky
    }

    // Pain avoidance
    if (factors.painAvoidance > 0.7) {
      // Prefer low-risk options when in pain
      return viable.sort((a, b) => a.risk - b.risk)[0];
    }

    // Exploration mode
    if (this.state.currentMode === 'explore') {
      // Prefer novel options
      return viable.sort((a, b) => b.novelty - a.novelty)[0];
    }

    // Exploit mode (default)
    return viable.sort((a, b) => b.score - a.score)[0];
  }

  // ===========================================================================
  // Factor Computation
  // ===========================================================================

  private async computeDecisionFactors(context: DecisionContext): Promise<DecisionFactors> {
    // Get current phi
    const phi = this.getCurrentPhi();

    // Get memory context strength
    const memories = this.memory.recall(context.domain, { limit: 10 });
    const memoryContext = Math.min(1, memories.length / 10);

    // Get neuromodulation state (placeholder)
    const neuroState = { dopamine: 0.5, cortisol: context.urgency };

    // Get pain level (placeholder)
    const painAvoidance = 0.3;  // Would come from nociception

    // Get grounding confidence
    const grounding = await this.bridge.groundAction(context.domain);

    // Compute EFE contribution
    const efeScore = this.computeEFE(context);

    return {
      efeScore,
      phiInfluence: phi,
      memoryContext,
      neuromodulation: neuroState,
      painAvoidance,
      groundingConfidence: grounding.confidence,
    };
  }

  private computeEFE(context: DecisionContext): number {
    // Simplified Expected Free Energy computation
    // EFE = expected information gain + expected pragmatic value - expected risk

    const avgExpectedValue = context.options.reduce((sum, o) => sum + o.expectedValue, 0) / context.options.length;
    const avgNovelty = context.options.reduce((sum, o) => sum + o.novelty, 0) / context.options.length;
    const avgRisk = context.options.reduce((sum, o) => sum + o.risk, 0) / context.options.length;

    // EFE: higher is better (we negate the traditional formulation)
    const efe = avgExpectedValue * 0.4 + avgNovelty * 0.3 - avgRisk * 0.3;

    return Math.max(0, Math.min(1, efe));
  }

  private computeConfidence(option: DecisionOption, factors: DecisionFactors): number {
    let confidence = 0.5;

    // Boost from high expected value
    confidence += option.expectedValue * 0.2;

    // Boost from grounding
    confidence += factors.groundingConfidence * 0.15;

    // Boost from memory context
    confidence += factors.memoryContext * 0.1;

    // Reduce from risk
    confidence -= option.risk * 0.15;

    // Phi-based modulation
    confidence *= 0.8 + factors.phiInfluence * 0.2;

    return Math.max(0, Math.min(1, confidence));
  }

  private generateReasoning(option: DecisionOption, factors: DecisionFactors): string[] {
    const reasons: string[] = [];

    if (option.expectedValue > 0.7) {
      reasons.push('High expected value');
    }
    if (option.risk < 0.3) {
      reasons.push('Low risk option');
    }
    if (factors.groundingConfidence > 0.7) {
      reasons.push('Well grounded in past experience');
    }
    if (factors.memoryContext > 0.5) {
      reasons.push('Strong memory context supports this choice');
    }
    if (factors.efeScore > 0.6) {
      reasons.push('Favorable EFE score');
    }
    if (option.novelty > 0.7 && this.state.currentMode === 'explore') {
      reasons.push('Exploration opportunity');
    }

    return reasons.length > 0 ? reasons : ['Default selection based on available options'];
  }

  // ===========================================================================
  // Behavioral Adjustment
  // ===========================================================================

  private adjustBehavior(neuroState: any): void {
    // Adjust exploration rate based on neuromodulation
    if (neuroState.dopamine > 0.7) {
      // High dopamine = more exploration
      this.config.explorationRate = Math.min(0.4, this.config.explorationRate + 0.05);
      this.state.currentMode = 'explore';
    } else if (neuroState.cortisol > 0.7) {
      // High cortisol = exploit safe options
      this.config.explorationRate = Math.max(0.05, this.config.explorationRate - 0.05);
      this.state.currentMode = 'exploit';
    }
  }

  private handlePainSpike(payload: any): void {
    // Pain spike = reduce risk tolerance temporarily
    const originalRiskTolerance = this.config.riskTolerance;
    this.config.riskTolerance = Math.max(0.1, this.config.riskTolerance * 0.5);

    // Restore after cooldown
    setTimeout(() => {
      this.config.riskTolerance = originalRiskTolerance;
    }, 60000);  // 1 minute cooldown
  }

  private adjustToConsciousnessLevel(payload: any): void {
    const phi = payload.phi ?? payload.value ?? 0.5;

    if (phi < 0.3) {
      // Low consciousness = rest mode
      this.state.currentMode = 'rest';
    } else if (phi > 0.7) {
      // High consciousness = consolidate learnings
      this.state.currentMode = 'consolidate';
    }
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  private getCurrentPhi(): number {
    try {
      const phiMonitor = getPhiMonitor();
      const levelData = phiMonitor.getCurrentLevel?.() ?? null;
      return typeof levelData === 'number' ? levelData : (levelData?.phi ?? 0.5);
    } catch (err) {
      console.error('[DecisionEngine] Failed to get phi value:', err);
      return 0.5;
    }
  }

  private isReversible(domain: DecisionDomain): boolean {
    // Some domains have irreversible decisions
    return !['communication', 'content'].includes(domain);
  }

  private emitDecisionEvent(decision: Decision): void {
    try {
      (this.bus as any).publish('decision.made', {
        id: decision.id,
        domain: decision.domain,
        optionId: decision.selectedOption.id,
        confidence: decision.confidence,
        timestamp: decision.timestamp.toISOString(),
      });
    } catch (err) {
      // Event bus may not support custom topics
      console.error('[DecisionEngine] Failed to emit decision event:', err);
    }
  }

  private storeDecisionInMemory(decision: Decision): void {
    this.memory.remember({
      what: `Decision: ${decision.domain} -> ${decision.selectedOption.description}`,
      tags: ['decision', decision.domain, `confidence-${Math.round(decision.confidence * 10) / 10}`],
      importance: decision.confidence,
    });
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Get current engine state
   */
  getState(): EngineState {
    return { ...this.state };
  }

  /**
   * Get domain statistics
   */
  getDomainStats(domain: DecisionDomain): DomainStats | undefined {
    return this.state.domainStats.get(domain);
  }

  /**
   * Get pending decisions
   */
  getPendingDecisions(): Map<string, DecisionContext> {
    return new Map(this.state.pendingDecisions);
  }

  /**
   * Get recent decisions
   */
  getRecentDecisions(limit: number = 10): Decision[] {
    return this.state.recentDecisions.slice(-limit);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DecisionEngineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get overall statistics
   */
  getStats(): {
    totalDecisions: number;
    overallSuccessRate: number;
    avgConfidence: number;
    currentMode: string;
    pendingCount: number;
  } {
    const allStats = Array.from(this.state.domainStats.values());
    const totalDecisions = allStats.reduce((sum, s) => sum + s.totalDecisions, 0);
    const weightedSuccessRate = allStats.reduce((sum, s) => sum + s.successRate * s.totalDecisions, 0) / Math.max(1, totalDecisions);
    const avgConfidence = allStats.reduce((sum, s) => sum + s.avgConfidence, 0) / Math.max(1, allStats.length);

    return {
      totalDecisions,
      overallSuccessRate: weightedSuccessRate,
      avgConfidence,
      currentMode: this.state.currentMode,
      pendingCount: this.state.pendingDecisions.size,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let engineInstance: DecisionEngine | null = null;

export function getDecisionEngine(config?: Partial<DecisionEngineConfig>): DecisionEngine {
  if (!engineInstance) {
    engineInstance = new DecisionEngine(config);
  }
  return engineInstance;
}

export function resetDecisionEngine(): void {
  engineInstance = null;
}
