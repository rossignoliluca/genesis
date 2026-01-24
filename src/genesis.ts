/**
 * Genesis v13.0 — Unified Bootstrap Layer
 *
 * Hierarchical boot (L1→L4), inter-module wiring, and unified process/query interface.
 * Connects all 49 modules into a coherent organism:
 *
 *   L1: Persistence, FEK (autonomic substrate)
 *   L2: Memory, Active Inference, Kernel, Economic Fiber
 *   L3: Brain, Causal Reasoning, Perception
 *   L4: Metacognition (MUSE), NESS Monitor, Darwin-Gödel
 *
 * Each level boots only after its predecessor is healthy.
 */

import { FreeEnergyKernel, getFreeEnergyKernel, type FEKState, type FEKStatus } from './kernel/free-energy-kernel.js';
import { getBrain, type Brain } from './brain/index.js';
import { CausalReasoner, createAgentCausalModel, type Effect, type CounterfactualResult, type Intervention, type CausalExplanation } from './causal/index.js';
import { MetacognitionSystem, createMetacognitionSystem, type ConfidenceEstimate, type ThoughtAudit } from './metacognition/index.js';
import { getEconomicSystem, type EconomicSystem } from './economy/index.js';
import { getEconomicFiber, type EconomicFiber } from './economy/fiber.js';
import { getNESSMonitor, type NESSMonitor, type NESSState } from './economy/ness.js';
import { MultiModalPerception, createMultiModalPerception, type ModalityInput, type PerceptionOutput } from './perception/multi-modal.js';
import { MetaRLLearner, createMetaRLLearner, type AdaptationResult, type CurriculumState } from './learning/meta-rl.js';
import { getCodeRuntime, type CodeRuntime } from './execution/index.js';
import { getDashboard, broadcastToDashboard, type DashboardServer } from './observability/dashboard.js';
import { getMCPMemorySync, type MCPMemorySync } from './sync/mcp-memory-sync.js';
import { getSensoriMotorLoop, type SensoriMotorLoop } from './embodiment/sensorimotor-loop.js';

// ============================================================================
// Types
// ============================================================================

export interface GenesisConfig {
  /** Budget per FEK level (total = sum) */
  totalBudget: number;
  /** Enable causal reasoning */
  causal: boolean;
  /** Enable metacognition (MUSE) */
  metacognition: boolean;
  /** Enable NESS economic monitoring */
  ness: boolean;
  /** Enable multi-modal perception */
  perception: boolean;
  /** Enable meta-RL learning */
  metaRL: boolean;
  /** Enable code execution runtime */
  execution: boolean;
  /** Enable observability dashboard */
  dashboard: boolean;
  /** Enable MCP memory sync */
  memorySync: boolean;
  /** Enable embodiment (sensorimotor loop) */
  embodiment: boolean;
  /** Confidence threshold below which Brain defers to metacognition */
  deferThreshold: number;
  /** Audit all responses for hallucinations */
  auditResponses: boolean;
}

export interface GenesisStatus {
  booted: boolean;
  levels: { L1: boolean; L2: boolean; L3: boolean; L4: boolean };
  fek: FEKStatus | null;
  brain: { running: boolean; phi: number } | null;
  causal: { graphSize: number } | null;
  metacognition: { confidence: number; calibrationError: number } | null;
  perception: boolean;
  metaRL: { curriculumSize: number } | null;
  execution: boolean;
  ness: NESSState | null;
  fiber: { netFlow: number; sustainable: boolean } | null;
  uptime: number;
  cycleCount: number;
}

export interface ProcessResult {
  response: string;
  confidence: ConfidenceEstimate | null;
  audit: ThoughtAudit | null;
  cost: number;
  fekState: FEKState | null;
}

// ============================================================================
// Genesis Core
// ============================================================================

export class Genesis {
  private config: GenesisConfig;

  // L1: Substrate
  private fek: FreeEnergyKernel | null = null;

  // L2: Reactive
  private brain: Brain | null = null;
  private economy: EconomicSystem | null = null;
  private fiber: EconomicFiber | null = null;

  // L3: Cognitive
  private causal: CausalReasoner | null = null;
  private perception: MultiModalPerception | null = null;
  private codeRuntime: CodeRuntime | null = null;

  // L4: Executive
  private metacognition: MetacognitionSystem | null = null;
  private nessMonitor: NESSMonitor | null = null;
  private lastNESSState: NESSState | null = null;
  private metaRL: MetaRLLearner | null = null;

  // Cross-cutting
  private dashboard: DashboardServer | null = null;
  private memorySync: MCPMemorySync | null = null;
  private sensorimotor: SensoriMotorLoop | null = null;

  // State
  private booted = false;
  private bootTime = 0;
  private levels = { L1: false, L2: false, L3: false, L4: false };
  private cycleCount = 0;
  private performanceHistory: Array<{ predicted: number; actual: boolean }> = [];

  constructor(config?: Partial<GenesisConfig>) {
    const defaults: GenesisConfig = {
      totalBudget: 100,
      causal: true,
      metacognition: true,
      ness: true,
      perception: true,
      metaRL: true,
      execution: true,
      dashboard: false,
      memorySync: true,
      embodiment: false,
      deferThreshold: 0.3,
      auditResponses: true,
    };
    this.config = { ...defaults, ...config } as GenesisConfig;
  }

  // ==========================================================================
  // Boot Sequence
  // ==========================================================================

  async boot(): Promise<GenesisStatus> {
    this.bootTime = Date.now();

    // L1: Autonomic substrate
    await this.bootL1();

    // L2: Reactive layer
    await this.bootL2();

    // L3: Cognitive layer
    await this.bootL3();

    // L4: Executive layer
    await this.bootL4();

    this.booted = true;
    return this.getStatus();
  }

  private async bootL1(): Promise<void> {
    // Free Energy Kernel — the core autonomic loop
    this.fek = getFreeEnergyKernel();
    this.fek.start();
    this.levels.L1 = true;
  }

  private async bootL2(): Promise<void> {
    if (!this.levels.L1) throw new Error('L1 must boot before L2');

    // Brain — the main cognitive processor
    this.brain = getBrain();

    // Economic systems
    this.economy = getEconomicSystem({
      dailyLimit: this.config.totalBudget,
      monthlyLimit: this.config.totalBudget * 30,
      perTransactionLimit: this.config.totalBudget * 0.5,
      requireApprovalAbove: this.config.totalBudget * 0.5,
    });
    await this.economy.initialize();

    this.fiber = getEconomicFiber(this.config.totalBudget);
    this.fiber.registerModule('genesis');
    this.fiber.registerModule('brain');
    this.fiber.registerModule('causal');
    this.fiber.registerModule('metacognition');
    this.fiber.registerModule('perception');
    this.fiber.registerModule('metarl');
    this.fiber.registerModule('execution');

    if (this.config.dashboard) {
      this.dashboard = getDashboard();
    }

    if (this.config.memorySync) {
      this.memorySync = getMCPMemorySync();
    }

    this.levels.L2 = true;
  }

  private async bootL3(): Promise<void> {
    if (!this.levels.L2) throw new Error('L2 must boot before L3');

    if (this.config.causal) {
      // Causal reasoning with standard agent model
      this.causal = createAgentCausalModel();

      // Wire FEK prediction errors to causal diagnosis
      if (this.fek) {
        this.fek.onPredictionError((error) => {
          if (this.causal) {
            this.causal.diagnoseFailure(
              new Error(error.content),
              { source: error.source, target: error.target, magnitude: error.magnitude }
            );
          }
        });
      }
    }

    if (this.config.perception) {
      this.perception = createMultiModalPerception();
    }

    if (this.config.execution) {
      this.codeRuntime = getCodeRuntime();
    }

    if (this.config.embodiment) {
      this.sensorimotor = getSensoriMotorLoop();
    }

    this.levels.L3 = true;
  }

  private async bootL4(): Promise<void> {
    if (!this.levels.L3) throw new Error('L3 must boot before L4');

    if (this.config.metacognition) {
      this.metacognition = createMetacognitionSystem();
    }

    if (this.config.ness) {
      this.nessMonitor = getNESSMonitor();
    }

    if (this.config.metaRL) {
      this.metaRL = createMetaRLLearner({
        innerLearningRate: 0.01,
        outerLearningRate: 0.001,
        adaptationWindow: 50,
      });
    }

    this.levels.L4 = true;
  }

  // ==========================================================================
  // Main Processing Pipeline
  // ==========================================================================

  /**
   * Process an input through the full Genesis stack:
   * 1. Metacognition pre-check (should we defer?)
   * 2. Brain processes query
   * 3. Metacognition audits response
   * 4. Causal reasoning (if errors detected)
   * 5. FEK cycle with observations
   * 6. NESS + Fiber economic tracking
   */
  async process(input: string): Promise<ProcessResult> {
    if (!this.booted) await this.boot();
    this.cycleCount++;

    const startTime = Date.now();
    let confidence: ConfidenceEstimate | null = null;
    let audit: ThoughtAudit | null = null;

    // Step 1: Metacognitive pre-check
    if (this.metacognition) {
      const domain = this.inferDomain(input);
      if (this.metacognition.shouldDefer(domain)) {
        // Low competence — still process but flag it
        confidence = this.metacognition.getConfidence(0.3, domain);
      }
    }

    // Step 2: Brain processes
    let response = '';
    if (this.brain) {
      response = await this.brain.process(input);
    }

    // Step 3: Metacognitive audit
    if (this.metacognition && this.config.auditResponses && response) {
      audit = this.metacognition.auditThought(response);

      // Get calibrated confidence
      const domain = this.inferDomain(input);
      const rawConfidence = audit.coherence * 0.5 + audit.groundedness * 0.5;
      confidence = this.metacognition.getConfidence(rawConfidence, domain);
    }

    // Step 4: FEK cycle
    let fekState: FEKState | null = null;
    if (this.fek) {
      fekState = this.fek.cycle({
        energy: 1.0,
        agentResponsive: true,
        merkleValid: true,
        systemLoad: this.cycleCount / 100,
        phi: confidence?.value,
      });
    }

    // Step 5: Economic tracking
    const elapsed = Date.now() - startTime;
    const cost = elapsed * 0.001; // Rough cost proxy: $0.001 per ms

    if (this.fiber) {
      this.fiber.recordCost('brain', cost, 'process');
    }

    if (this.nessMonitor && this.fiber) {
      const section = this.fiber.getGlobalSection();
      this.lastNESSState = this.nessMonitor.observe({
        revenue: section.totalRevenue,
        costs: section.totalCosts,
        customers: 1,
        quality: confidence?.value ?? 0.8,
        balance: section.netFlow,
      });
    }

    // Track for calibration
    if (confidence) {
      this.performanceHistory.push({
        predicted: confidence.value,
        actual: true, // Updated externally via feedback()
      });
    }

    // Broadcast to observability dashboard
    if (this.dashboard) {
      broadcastToDashboard('cycle', {
        cycleCount: this.cycleCount,
        confidence: confidence?.value,
        cost,
        fekMode: fekState?.mode,
        totalFE: fekState?.totalFE,
      });
    }

    return { response, confidence, audit, cost, fekState };
  }

  // ==========================================================================
  // Causal Reasoning Interface
  // ==========================================================================

  /**
   * Estimate causal effect: P(outcome | do(treatment = value))
   */
  causalEffect(treatment: string, treatmentValue: unknown, outcome: string): Effect | null {
    if (!this.causal) return null;
    return this.causal.estimateEffect(treatment, treatmentValue, outcome);
  }

  /**
   * Counterfactual: "What would outcome have been if intervention had occurred?"
   */
  whatIf(
    factual: Record<string, unknown>,
    intervention: Intervention,
    outcome: string
  ): CounterfactualResult | null {
    if (!this.causal) return null;
    return this.causal.whatIf(factual, intervention, outcome);
  }

  /**
   * Diagnose a failure using causal reasoning
   */
  diagnoseFailure(failure: Error, observedState: Record<string, unknown>): CausalExplanation | null {
    if (!this.causal) return null;
    return this.causal.diagnoseFailure(failure, observedState);
  }

  // ==========================================================================
  // Metacognitive Interface
  // ==========================================================================

  /**
   * Evaluate reasoning quality
   */
  evaluateReasoning(reasoning: string, context?: string[]): number | null {
    if (!this.metacognition) return null;
    return this.metacognition.evaluateReasoning(reasoning, context);
  }

  /**
   * Provide outcome feedback for calibration
   */
  feedback(success: boolean): void {
    if (this.performanceHistory.length > 0) {
      this.performanceHistory[this.performanceHistory.length - 1].actual = success;
    }

    if (this.metacognition) {
      const domain = 'general';
      const predicted = this.performanceHistory.length > 0
        ? this.performanceHistory[this.performanceHistory.length - 1].predicted
        : 0.5;
      this.metacognition.updateFromOutcome(domain, success, predicted);
    }
  }

  /**
   * Get Expected Calibration Error (ECE)
   */
  getCalibrationError(): number {
    if (this.performanceHistory.length < 10) return 0;

    // Bin predictions into 10 buckets, compute |avg_predicted - avg_actual| per bin
    const bins = Array.from({ length: 10 }, () => ({ predicted: 0, actual: 0, count: 0 }));

    for (const entry of this.performanceHistory) {
      const binIdx = Math.min(9, Math.floor(entry.predicted * 10));
      bins[binIdx].predicted += entry.predicted;
      bins[binIdx].actual += entry.actual ? 1 : 0;
      bins[binIdx].count++;
    }

    let ece = 0;
    const total = this.performanceHistory.length;
    for (const bin of bins) {
      if (bin.count === 0) continue;
      const avgPredicted = bin.predicted / bin.count;
      const avgActual = bin.actual / bin.count;
      ece += (bin.count / total) * Math.abs(avgPredicted - avgActual);
    }

    return ece;
  }

  // ==========================================================================
  // Perception Interface
  // ==========================================================================

  /**
   * Process multi-modal inputs (visual, audio, proprioceptive)
   */
  perceive(inputs: ModalityInput[], timestamp?: number): PerceptionOutput | null {
    if (!this.perception) return null;
    const output = this.perception.perceive(inputs, timestamp);

    if (this.fiber) {
      this.fiber.recordCost('perception', 0.01 * inputs.length, 'perceive');
    }

    return output;
  }

  // ==========================================================================
  // Meta-RL Interface
  // ==========================================================================

  /**
   * Get current curriculum state
   */
  getCurriculum(): CurriculumState | null {
    if (!this.metaRL) return null;
    return this.metaRL.getCurriculum();
  }

  /**
   * Report task outcome to meta-RL for curriculum learning
   */
  reportTaskOutcome(taskId: string, success: boolean, stepsUsed: number): void {
    if (this.metaRL) {
      this.metaRL.updateCurriculum(taskId, success, stepsUsed);
    }
  }

  // ==========================================================================
  // Code Execution Interface
  // ==========================================================================

  /**
   * Get the code execution runtime
   */
  getCodeRuntime(): CodeRuntime | null {
    return this.codeRuntime;
  }

  // ==========================================================================
  // Economic Interface
  // ==========================================================================

  /**
   * Record revenue from an external source
   */
  recordRevenue(moduleId: string, amount: number, source: string): void {
    if (this.fiber) {
      this.fiber.recordRevenue(moduleId, amount, source);
    }
    if (this.fek) {
      this.fek.recordRevenue(moduleId, amount, source);
    }
  }

  /**
   * Get economic health
   */
  getEconomicHealth(): { fiber: ReturnType<EconomicFiber['getGlobalSection']> | null; ness: NESSState | null } {
    return {
      fiber: this.fiber?.getGlobalSection() ?? null,
      ness: this.lastNESSState,
    };
  }

  // ==========================================================================
  // Status & Introspection
  // ==========================================================================

  getStatus(): GenesisStatus {
    const fekStatus = this.fek?.getStatus() ?? null;
    const brainStatus = this.brain?.getStatus();
    const metacogState = this.metacognition?.getState();
    const fiberSection = this.fiber?.getGlobalSection();
    const nessState = this.lastNESSState;
    const causalGraph = this.causal?.getGraph();

    const curriculum = this.metaRL?.getCurriculum();

    return {
      booted: this.booted,
      levels: { ...this.levels },
      fek: fekStatus,
      brain: brainStatus ? { running: brainStatus.running, phi: brainStatus.phi } : null,
      causal: causalGraph ? { graphSize: causalGraph.variables?.size ?? 0 } : null,
      metacognition: metacogState ? {
        confidence: metacogState.currentConfidence.value,
        calibrationError: metacogState.currentConfidence.calibrationError,
      } : null,
      perception: this.perception !== null,
      metaRL: curriculum ? { curriculumSize: curriculum.taskHistory.length } : null,
      execution: this.codeRuntime !== null,
      ness: nessState,
      fiber: fiberSection ? { netFlow: fiberSection.netFlow, sustainable: fiberSection.sustainable } : null,
      uptime: this.bootTime > 0 ? Date.now() - this.bootTime : 0,
      cycleCount: this.cycleCount,
    };
  }

  /**
   * Graceful shutdown: L4→L1
   */
  async shutdown(): Promise<void> {
    if (this.fek) {
      this.fek.stop();
    }
    this.booted = false;
    this.levels = { L1: false, L2: false, L3: false, L4: false };
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private inferDomain(input: string): string {
    const lower = input.toLowerCase();
    if (lower.includes('code') || lower.includes('function') || lower.includes('bug')) return 'coding';
    if (lower.includes('math') || lower.includes('calcul') || lower.includes('equat')) return 'math';
    if (lower.includes('deploy') || lower.includes('server') || lower.includes('infra')) return 'infrastructure';
    if (lower.includes('money') || lower.includes('pay') || lower.includes('budget')) return 'economics';
    return 'general';
  }
}

// ============================================================================
// Factory & Singleton
// ============================================================================

let genesisInstance: Genesis | null = null;

export function createGenesis(config?: Partial<GenesisConfig>): Genesis {
  return new Genesis(config);
}

export function getGenesis(config?: Partial<GenesisConfig>): Genesis {
  if (!genesisInstance) {
    genesisInstance = new Genesis(config);
  }
  return genesisInstance;
}

export function resetGenesis(): void {
  if (genesisInstance) {
    genesisInstance.shutdown();
  }
  genesisInstance = null;
}

export default Genesis;
