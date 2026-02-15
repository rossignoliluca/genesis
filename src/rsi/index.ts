/**
 * Genesis v14.0 - Recursive Self-Improvement (RSI) System
 *
 * Complete RSI architecture implementing the 6-phase improvement cycle:
 * 1. OBSERVE - Detect limitations and opportunities
 * 2. RESEARCH - Search for solutions (papers, code, web, memory)
 * 3. PLAN - Create improvement plan with safety analysis
 * 4. IMPLEMENT - Execute in sandbox with testing
 * 5. DEPLOY - Commit, PR, review, merge
 * 6. LEARN - Record outcomes, update memory, adjust strategy
 *
 * Based on:
 * - Darwin Gödel Machine (Sakana AI 2025)
 * - AlphaEvolve (DeepMind 2025)
 * - Free Energy Principle for target selection
 * - Constitutional AI for self-critique
 * - Autopoiesis for self-observation
 *
 * Safety Features:
 * - Constitutional principles check
 * - Invariant preservation
 * - Sandbox testing
 * - Human approval gates
 * - Rollback capability
 *
 * @module rsi
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import {
  RSIConfig, DEFAULT_RSI_CONFIG, RSICycle, RSICycleStatus, RSIEvent, RSIEventType,
  Limitation, Opportunity, SynthesizedKnowledge, ImprovementPlan,
  ImplementationResult, DeploymentResult, LearningOutcome, StrategyAdjustment
} from './types.js';
import { getObservationEngine, ObservationEngine } from './observe/index.js';
import { getResearchEngine, ResearchEngine } from './research/index.js';
import { getPlanEngine, PlanEngine } from './plan/index.js';
import { getImplementationEngine, ImplementationEngine } from './implement/index.js';
import { getDeploymentEngine, DeploymentEngine } from './deploy/index.js';
import { getLearningEngine, LearningEngine } from './learn/index.js';
import { getConsciousnessSystem } from '../consciousness/index.js';
import { getAutopoiesisEngine, SelfObservation } from '../autopoiesis/index.js';

// =============================================================================
// HUMAN APPROVAL INTERFACE
// =============================================================================

export interface HumanApprovalRequest {
  cycleId: string;
  planId: string;
  plan: ImprovementPlan;
  question: string;
  options: string[];
  timeout: number;
}

export interface HumanApprovalResponse {
  approved: boolean;
  feedback?: string;
  selectedOption?: string;
}

export type HumanApprovalHandler = (
  request: HumanApprovalRequest
) => Promise<HumanApprovalResponse>;

// =============================================================================
// RSI ORCHESTRATOR
// =============================================================================

export class RSIOrchestrator extends EventEmitter {
  private config: RSIConfig;
  private observeEngine: ObservationEngine;
  private researchEngine: ResearchEngine;
  private planEngine: PlanEngine;
  private implementEngine: ImplementationEngine;
  private deployEngine: DeploymentEngine;
  private learnEngine: LearningEngine;

  private running = false;
  private currentCycle: RSICycle | null = null;
  private cycleHistory: RSICycle[] = [];
  private humanApprovalHandler: HumanApprovalHandler | null = null;

  constructor(config: Partial<RSIConfig> = {}) {
    super();
    this.config = { ...DEFAULT_RSI_CONFIG, ...config };

    // Initialize all engines
    this.observeEngine = getObservationEngine();
    this.researchEngine = getResearchEngine({
      enabledSources: this.config.defaultSearchSources,
      maxResultsPerSource: this.config.maxResearchResults,
      mockResearch: this.config.mockResearch,
    });
    this.planEngine = getPlanEngine(this.config);
    this.implementEngine = getImplementationEngine();
    this.deployEngine = getDeploymentEngine(this.config);
    this.learnEngine = getLearningEngine(this.config);
  }

  /**
   * Set handler for human approval requests
   */
  setHumanApprovalHandler(handler: HumanApprovalHandler): void {
    this.humanApprovalHandler = handler;
  }

  /**
   * Start the RSI system
   */
  start(): void {
    if (this.running) {
      console.log('[RSI] Already running');
      return;
    }

    if (!this.config.enabled) {
      console.log('[RSI] RSI is disabled in config');
      return;
    }

    this.running = true;
    console.log('[RSI] Starting Recursive Self-Improvement system');

    if (this.config.autoRun) {
      this.scheduleNextCycle();
    }
  }

  /**
   * Stop the RSI system
   */
  stop(): void {
    this.running = false;
    console.log('[RSI] Stopped');
  }

  /**
   * Run a single RSI cycle
   */
  async runCycle(): Promise<RSICycle> {
    const cycleId = randomUUID();
    const consciousness = getConsciousnessSystem();
    const currentPhi = consciousness.getCurrentLevel().rawPhi;

    // Check phi threshold
    if (currentPhi < this.config.minPhiForImprovement) {
      console.log(`[RSI] φ too low (${currentPhi.toFixed(3)} < ${this.config.minPhiForImprovement}) - skipping cycle`);
      const abortedCycle: RSICycle = {
        id: cycleId,
        startedAt: new Date(),
        completedAt: new Date(),
        status: 'aborted',
        limitations: [],
        opportunities: [],
        research: [],
        phiAtStart: currentPhi,
        freeEnergyAtStart: 5,
        error: 'φ below threshold',
      };
      return abortedCycle;
    }

    // Initialize cycle
    this.currentCycle = {
      id: cycleId,
      startedAt: new Date(),
      status: 'observing',
      limitations: [],
      opportunities: [],
      research: [],
      phiAtStart: currentPhi,
      freeEnergyAtStart: this.observeEngine.getCurrentMetrics().freeEnergy,
    };

    this.emitEvent('cycle:started', { cycleId });
    console.log(`[RSI] ═══════════════════════════════════════════════════════════`);
    console.log(`[RSI] Starting RSI Cycle ${cycleId.slice(0, 8)}`);
    console.log(`[RSI] φ = ${currentPhi.toFixed(3)}`);
    console.log(`[RSI] ═══════════════════════════════════════════════════════════`);

    try {
      // Capture baseline metrics for learning
      this.learnEngine.captureBaseline();

      // =====================================================================
      // PHASE 1: OBSERVE
      // =====================================================================
      this.updateStatus('observing');
      console.log(`[RSI] ─── Phase 1: OBSERVE ───`);

      // v14.2: Trigger autopoiesis cycle first to gather fresh self-observations
      const autopoiesis = getAutopoiesisEngine();
      await autopoiesis.cycle();
      const autoStats = autopoiesis.stats();
      console.log(`[RSI] Autopoiesis cycle ${autoStats.cycleCount} completed, ${autoStats.lastObservations.length} observations`);

      // Convert high-surprise autopoiesis observations to RSI limitations
      const autopoiesisLimitations = this.convertAutopoiesisToLimitations(autoStats.lastObservations);

      this.observeEngine.recordMetrics();
      const baseLimitations = await this.observeEngine.detectLimitations();
      const limitations = [...baseLimitations, ...autopoiesisLimitations];
      const opportunities = await this.observeEngine.detectOpportunities();

      this.currentCycle.limitations = limitations;
      this.currentCycle.opportunities = opportunities;

      console.log(`[RSI] Detected ${limitations.length} limitations, ${opportunities.length} opportunities`);

      if (limitations.length === 0 && opportunities.length === 0) {
        console.log(`[RSI] No improvements needed - system is healthy`);
        return this.completeCycle('completed');
      }

      // Select top limitation to address
      const targetLimitation = limitations[0];
      if (targetLimitation) {
        this.emitEvent('limitation:detected', targetLimitation);
        console.log(`[RSI] Top limitation: ${targetLimitation.type} - ${targetLimitation.description}`);
      }

      // =====================================================================
      // PHASE 2: RESEARCH
      // =====================================================================
      this.updateStatus('researching');
      console.log(`[RSI] ─── Phase 2: RESEARCH ───`);

      let knowledge: SynthesizedKnowledge | null = null;
      let opportunity: Opportunity | null = null;

      if (targetLimitation) {
        knowledge = await this.researchEngine.researchLimitation(targetLimitation);
        opportunity = await this.researchEngine.findOpportunity(targetLimitation);
      } else if (opportunities.length > 0) {
        // Research the top opportunity instead
        opportunity = opportunities[0];
        knowledge = await this.researchEngine.researchTopic(opportunity.description);
      }

      if (!knowledge || knowledge.sources.length === 0) {
        console.log(`[RSI] Insufficient research results - aborting cycle`);
        return this.completeCycle('aborted', 'Insufficient research');
      }

      this.currentCycle.research.push(knowledge);
      console.log(`[RSI] Synthesized knowledge from ${knowledge.sources.length} sources`);
      console.log(`[RSI] Key insights: ${knowledge.keyInsights.slice(0, 2).join('; ')}`);

      if (!opportunity) {
        console.log(`[RSI] Could not identify actionable opportunity`);
        return this.completeCycle('aborted', 'No actionable opportunity');
      }

      this.emitEvent('opportunity:discovered', opportunity);

      // =====================================================================
      // PHASE 3: PLAN
      // =====================================================================
      this.updateStatus('planning');
      console.log(`[RSI] ─── Phase 3: PLAN ───`);

      const plan = await this.planEngine.createPlan(opportunity, knowledge, targetLimitation);
      this.currentCycle.plan = plan;

      this.emitEvent('plan:created', plan);
      console.log(`[RSI] Created plan: ${plan.name}`);
      console.log(`[RSI] Changes: ${plan.changes.length}`);
      console.log(`[RSI] Risk level: ${plan.safetyAnalysis.riskLevel}`);
      console.log(`[RSI] Constitutional: ${plan.constitutionalApproval.approved ? 'APPROVED' : 'NEEDS REVIEW'}`);

      // Check plan status
      if (plan.status === 'safety-review' || plan.status === 'constitutional-review') {
        console.log(`[RSI] Plan requires review: ${plan.status}`);
        return this.completeCycle('aborted', `Plan blocked: ${plan.status}`);
      }

      if (plan.status === 'human-review') {
        // Request human approval
        const approved = await this.requestHumanApproval(plan);
        if (!approved) {
          this.emitEvent('plan:rejected', { planId: plan.id, reason: 'Human rejected' });
          return this.completeCycle('aborted', 'Human rejected plan');
        }
        this.emitEvent('plan:approved', plan);
      }

      // =====================================================================
      // PHASE 4: IMPLEMENT
      // =====================================================================
      this.updateStatus('implementing');
      console.log(`[RSI] ─── Phase 4: IMPLEMENT ───`);

      this.emitEvent('implementation:started', { planId: plan.id });
      const implementation = await this.implementEngine.implement(plan);
      this.currentCycle.implementation = implementation;

      this.emitEvent('implementation:completed', implementation);
      console.log(`[RSI] Implementation: ${implementation.success ? 'SUCCESS' : 'FAILED'}`);

      if (!implementation.success) {
        console.log(`[RSI] Implementation failed: ${implementation.error}`);
        // Still learn from failure
        await this.learnFromFailure(plan, implementation);
        return this.completeCycle('failed', implementation.error);
      }

      // Promote sandbox to main if successful
      await this.implementEngine.promoteToMain(implementation.sandboxPath);

      // =====================================================================
      // PHASE 5: DEPLOY
      // =====================================================================
      this.updateStatus('deploying');
      console.log(`[RSI] ─── Phase 5: DEPLOY ───`);

      this.emitEvent('deployment:started', { planId: plan.id });
      const deployment = await this.deployEngine.deploy(plan, implementation);
      this.currentCycle.deployment = deployment;

      this.emitEvent('deployment:completed', deployment);
      console.log(`[RSI] Deployment: ${deployment.success ? 'SUCCESS' : 'FAILED'}`);
      console.log(`[RSI] Review status: ${deployment.reviewStatus}`);
      console.log(`[RSI] Merge status: ${deployment.mergeStatus}`);

      if (deployment.prUrl) {
        console.log(`[RSI] PR: ${deployment.prUrl}`);
      }

      // =====================================================================
      // PHASE 6: LEARN
      // =====================================================================
      this.updateStatus('learning');
      console.log(`[RSI] ─── Phase 6: LEARN ───`);

      const learning = await this.learnEngine.learn(plan, implementation, deployment);
      this.currentCycle.learning = learning;

      this.emitEvent('learning:recorded', learning);
      console.log(`[RSI] Learning recorded: ${learning.success ? 'SUCCESS' : 'FAILURE'}`);
      console.log(`[RSI] Lessons: ${learning.lessonsLearned.length}`);

      // v14.1: Apply strategy adjustments to config (closes feedback loop)
      if (learning.strategyAdjustment) {
        const adj = learning.strategyAdjustment;
        console.log(`[RSI] Applying strategy adjustment: ${adj.component} ${adj.before} → ${adj.after}`);
        this.applyStrategyAdjustment(adj);
        this.emitEvent('strategy:adjusted', adj);
      }

      // Update final phi
      this.currentCycle.phiAtEnd = consciousness.getCurrentLevel().rawPhi;
      this.currentCycle.freeEnergyAtEnd = this.observeEngine.getCurrentMetrics().freeEnergy;

      // Complete cycle
      return this.completeCycle('completed');

    } catch (error) {
      console.error(`[RSI] Cycle error:`, error);
      this.emitEvent('cycle:failed', { error: String(error) });
      return this.completeCycle('failed', String(error));
    }
  }

  private async learnFromFailure(
    plan: ImprovementPlan,
    implementation: ImplementationResult
  ): Promise<void> {
    try {
      // Create a mock deployment result for learning
      const mockDeployment: DeploymentResult = {
        planId: plan.id,
        success: false,
        branchName: '',
        commitHash: '',
        reviewStatus: 'pending',
        mergeStatus: 'blocked',
        error: 'Implementation failed',
      };

      await this.learnEngine.learn(plan, implementation, mockDeployment);
    } catch (err) {
      console.error('[rsi] learnFromFailure failed:', err);
    }
  }

  private async requestHumanApproval(plan: ImprovementPlan): Promise<boolean> {
    if (!this.humanApprovalHandler) {
      console.log(`[RSI] No human approval handler - auto-rejecting high-risk plan`);
      return false;
    }

    this.emitEvent('human-review:requested', { planId: plan.id });

    const request: HumanApprovalRequest = {
      cycleId: this.currentCycle!.id,
      planId: plan.id,
      plan,
      question: `RSI wants to execute plan "${plan.name}" with risk level ${plan.safetyAnalysis.riskLevel}. Approve?`,
      options: ['Approve', 'Reject', 'Approve with modifications'],
      timeout: 300000, // 5 minutes
    };

    try {
      const response = await Promise.race([
        this.humanApprovalHandler(request),
        new Promise<HumanApprovalResponse>((resolve) =>
          setTimeout(() => resolve({ approved: false, feedback: 'Timeout' }), request.timeout)
        ),
      ]);

      this.emitEvent('human-review:responded', { approved: response.approved, feedback: response.feedback });
      return response.approved;
    } catch (error) {
      console.log(`[RSI] Human approval error: ${error}`);
      return false;
    }
  }

  private updateStatus(status: RSICycleStatus): void {
    if (this.currentCycle) {
      this.currentCycle.status = status;
      this.emitEvent('cycle:phase-changed', { status });
    }
  }

  private completeCycle(status: RSICycleStatus, error?: string): RSICycle {
    if (!this.currentCycle) {
      throw new Error('No current cycle');
    }

    this.currentCycle.status = status;
    this.currentCycle.completedAt = new Date();
    if (error) {
      this.currentCycle.error = error;
    }

    // Store in history
    this.cycleHistory.push(this.currentCycle);
    if (this.cycleHistory.length > 100) {
      this.cycleHistory.shift();
    }

    const cycle = this.currentCycle;
    this.currentCycle = null;

    // Emit completion event
    this.emitEvent(status === 'completed' ? 'cycle:completed' : 'cycle:failed', { cycleId: cycle.id });

    console.log(`[RSI] ═══════════════════════════════════════════════════════════`);
    console.log(`[RSI] Cycle ${cycle.id.slice(0, 8)} ${status.toUpperCase()}`);
    if (cycle.phiAtEnd !== undefined) {
      const phiDelta = cycle.phiAtEnd - cycle.phiAtStart;
      console.log(`[RSI] φ: ${cycle.phiAtStart.toFixed(3)} → ${cycle.phiAtEnd.toFixed(3)} (${phiDelta >= 0 ? '+' : ''}${phiDelta.toFixed(3)})`);
    }
    console.log(`[RSI] ═══════════════════════════════════════════════════════════`);

    // Schedule next cycle if auto-run
    if (this.running && this.config.autoRun) {
      this.scheduleNextCycle();
    }

    return cycle;
  }

  private scheduleNextCycle(): void {
    setTimeout(() => {
      if (this.running && this.config.autoRun) {
        this.runCycle().catch(err => {
          console.error('[RSI] Scheduled cycle error:', err);
        });
      }
    }, this.config.cooldownBetweenCycles);
  }

  private emitEvent(type: RSIEventType, data: any): void {
    const event: RSIEvent = {
      type,
      cycleId: this.currentCycle?.id || '',
      timestamp: new Date(),
      data,
    };
    this.emit(type, event);
    this.emit('event', event);
  }

  /**
   * Get RSI statistics
   */
  getStats(): {
    running: boolean;
    totalCycles: number;
    successfulCycles: number;
    failedCycles: number;
    currentCycle: RSICycle | null;
    config: RSIConfig;
    learningStats: ReturnType<LearningEngine['getStats']>;
  } {
    const successful = this.cycleHistory.filter(c => c.status === 'completed').length;
    const failed = this.cycleHistory.filter(c => c.status === 'failed').length;

    return {
      running: this.running,
      totalCycles: this.cycleHistory.length,
      successfulCycles: successful,
      failedCycles: failed,
      currentCycle: this.currentCycle,
      config: this.config,
      learningStats: this.learnEngine.getStats(),
    };
  }

  /**
   * Get cycle history
   */
  getCycleHistory(): RSICycle[] {
    return [...this.cycleHistory];
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RSIConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Convert autopoiesis self-observations to RSI limitations
   * v14.2: Integrates autopoietic self-awareness into RSI observation
   */
  private convertAutopoiesisToLimitations(observations: SelfObservation[]): Limitation[] {
    const limitations: Limitation[] = [];

    for (const obs of observations) {
      // Only convert high-surprise or degrading observations
      if ((obs.surprise && obs.surprise > 0.5) || obs.trend === 'degrading') {
        const limitationType = this.mapCategoryToLimitationType(obs.category);
        const severity = this.calculateSeverity(obs);

        limitations.push({
          id: randomUUID(),
          type: limitationType,
          severity,
          description: `Autopoiesis detected: ${obs.category}.${obs.metric} = ${obs.value}${obs.trend ? ` (${obs.trend})` : ''}`,
          evidence: [{
            source: 'self-observation',
            data: { ...obs },
            timestamp: obs.timestamp,
          }],
          affectedComponents: this.mapCategoryToComponents(obs.category),
          detectedAt: obs.timestamp,
          confidence: obs.surprise ?? 0.7,
          estimatedImpact: obs.surprise ?? 0.5,
        });
      }
    }

    return limitations;
  }

  private mapCategoryToLimitationType(category: string): Limitation['type'] {
    switch (category) {
      case 'performance': return 'performance';
      case 'memory': return 'efficiency';
      case 'consciousness': return 'capability';
      case 'code': return 'quality';
      case 'learning': return 'knowledge';
      default: return 'reliability';
    }
  }

  private mapCategoryToComponents(category: string): string[] {
    switch (category) {
      case 'performance': return ['kernel', 'memory'];
      case 'memory': return ['memory', 'episodic', 'semantic'];
      case 'consciousness': return ['consciousness', 'phi-monitor'];
      case 'code': return ['codebase', 'build'];
      case 'learning': return ['learning', 'procedural-memory'];
      default: return ['kernel'];
    }
  }

  private calculateSeverity(obs: SelfObservation): Limitation['severity'] {
    const surprise = obs.surprise ?? 0;
    if (surprise > 0.9 || obs.trend === 'degrading') return 'high';
    if (surprise > 0.7) return 'medium';
    return 'low';
  }

  /**
   * Apply a strategy adjustment to the config
   * v14.1: Closes the RSI feedback loop
   */
  private applyStrategyAdjustment(adjustment: StrategyAdjustment): void {
    const configUpdate: Partial<RSIConfig> = {};

    // Map adjustment components to config fields
    switch (adjustment.component) {
      case 'maxRiskLevel':
        if (typeof adjustment.after === 'string') {
          configUpdate.maxRiskLevel = adjustment.after as RSIConfig['maxRiskLevel'];
        }
        break;

      case 'maxChangesPerPlan':
        if (typeof adjustment.after === 'number') {
          configUpdate.maxChangesPerPlan = adjustment.after;
        }
        break;

      case 'humanReviewThreshold':
        if (typeof adjustment.after === 'string') {
          configUpdate.humanReviewThreshold = adjustment.after as RSIConfig['humanReviewThreshold'];
        }
        break;

      case 'cooldownBetweenCycles':
        if (typeof adjustment.after === 'number') {
          configUpdate.cooldownBetweenCycles = adjustment.after;
        }
        break;

      case 'maxResearchResults':
        if (typeof adjustment.after === 'number') {
          configUpdate.maxResearchResults = adjustment.after;
        }
        break;

      default:
        console.log(`[RSI] Unknown adjustment component: ${adjustment.component}`);
        return;
    }

    // Apply the update
    this.updateConfig(configUpdate);
    console.log(`[RSI] Config updated: ${adjustment.component} = ${JSON.stringify(adjustment.after)}`);
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let rsiInstance: RSIOrchestrator | null = null;

export function getRSIOrchestrator(config?: Partial<RSIConfig>): RSIOrchestrator {
  if (!rsiInstance) {
    rsiInstance = new RSIOrchestrator(config);
  }
  return rsiInstance;
}

export function resetRSIOrchestrator(): void {
  if (rsiInstance) {
    rsiInstance.stop();
    rsiInstance = null;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export * from './types.js';
export { getObservationEngine } from './observe/index.js';
export { getResearchEngine } from './research/index.js';
export { getPlanEngine } from './plan/index.js';
export { getImplementationEngine } from './implement/index.js';
export { getDeploymentEngine } from './deploy/index.js';
export { getLearningEngine } from './learn/index.js';
