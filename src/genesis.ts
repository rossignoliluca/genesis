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
import { getConsciousnessSystem, type ConsciousnessSystem } from './consciousness/index.js';
import { getCognitiveWorkspace, type CognitiveWorkspace } from './memory/cognitive-workspace.js';
import { getSelfImprovementEngine, type SelfImprovementEngine } from './self-modification/index.js';

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
  /** Enable consciousness monitoring (φ) */
  consciousness: boolean;
  /** Enable self-improvement (Darwin-Gödel) */
  selfImprovement: boolean;
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
  consciousness: { phi: number; state: string } | null;
  selfImprovement: boolean;
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
  private consciousness: ConsciousnessSystem | null = null;
  private cognitiveWorkspace: CognitiveWorkspace | null = null;
  private selfImprovement: SelfImprovementEngine | null = null;

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
      consciousness: true,
      selfImprovement: false,
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

    // Cognitive workspace (shared memory substrate)
    this.cognitiveWorkspace = getCognitiveWorkspace();

    // Consciousness monitoring (φ)
    if (this.config.consciousness) {
      this.consciousness = getConsciousnessSystem();

      // v13.1: Wire real system state provider for φ calculation
      this.consciousness.setSystemStateProvider(() => {
        // Dynamic entropy: reflects actual uncertainty/surprisal of each component
        const fekEntropy = this.fek?.getTotalFE?.() ?? 0;
        const fiberSection = this.fiber?.getGlobalSection();
        const nessDeviation = this.lastNESSState?.deviation ?? 0.5;
        // Brain entropy: based on calibration error (uncertain ≈ high entropy)
        const brainEntropy = this.performanceHistory.length > 10
          ? this.getCalibrationError()
          : 0.5;
        // Economic entropy: sustainability gap as surprisal
        const econEntropy = fiberSection ? (fiberSection.sustainable ? 0.2 : 0.7 + nessDeviation * 0.3) : 0.5;
        // Memory entropy: buffer utilization (full buffer = low entropy, empty = high)
        const memEntropy = 0.4; // TODO: wire to cognitiveWorkspace.getStats().totalItems / config.maxItems

        return {
          components: [
            { id: 'fek', type: 'kernel', active: !!this.fek, state: { mode: this.fek?.getMode?.() ?? 'dormant' }, entropy: fekEntropy, lastUpdate: new Date() },
            { id: 'brain', type: 'processor', active: !!this.brain, state: { calibrationError: brainEntropy }, entropy: brainEntropy, lastUpdate: new Date() },
            { id: 'fiber', type: 'economic', active: !!this.fiber, state: { sustainable: fiberSection?.sustainable ?? false, netFlow: fiberSection?.netFlow ?? 0 }, entropy: econEntropy, lastUpdate: new Date() },
            { id: 'memory', type: 'storage', active: !!this.cognitiveWorkspace, state: {}, entropy: memEntropy, lastUpdate: new Date() },
          ],
          connections: [
            { from: 'fek', to: 'brain', strength: 0.9, informationFlow: Math.max(0.3, 1 - fekEntropy), bidirectional: true },
            { from: 'brain', to: 'memory', strength: 0.8, informationFlow: 0.7, bidirectional: true },
            { from: 'fiber', to: 'fek', strength: 0.6, informationFlow: fiberSection?.sustainable ? 0.8 : 0.3, bidirectional: true },
          ],
          stateHash: `cycle-${this.cycleCount}-fe${fekEntropy.toFixed(2)}`,
          timestamp: new Date(),
        };
      });

      // v13.1: Register subsystems as GWT modules for workspace competition
      this.consciousness.registerModule({
        id: 'fek-module',
        name: 'Free Energy Kernel',
        type: 'evaluative',
        active: true,
        load: 0.3,
        onPropose: () => {
          if (!this.fek) return null;
          const totalFE = this.fek.getTotalFE?.() ?? 0;
          // Only propose when free energy is notable (surprise)
          if (totalFE < 0.5) return null;
          return {
            id: `fek-${Date.now()}`,
            sourceModule: 'fek-module',
            type: 'goal' as const,
            data: { totalFE, mode: this.fek.getMode?.() },
            salience: Math.min(1, totalFE / 3),
            relevance: 0.8,
            timestamp: new Date(),
            ttl: 5000,
          };
        },
        onReceive: () => { /* FEK receives broadcasts but doesn't act on them */ },
        onSalience: () => {
          const totalFE = this.fek?.getTotalFE?.() ?? 0;
          return Math.min(1, totalFE / 3);
        },
        onRelevance: () => 0.8,
      });

      this.consciousness.registerModule({
        id: 'metacog-module',
        name: 'Metacognition',
        type: 'metacognitive',
        active: true,
        load: 0.2,
        onPropose: () => {
          if (!this.metacognition) return null;
          const state = this.metacognition.getState();
          const conf = state?.currentConfidence?.value ?? 0.5;
          // Propose when confidence is notably low (uncertainty signal)
          if (conf > 0.4) return null;
          return {
            id: `metacog-${Date.now()}`,
            sourceModule: 'metacog-module',
            type: 'thought' as const,
            data: { confidence: conf, calibrationError: state?.currentConfidence?.calibrationError },
            salience: 1 - conf,
            relevance: 0.7,
            timestamp: new Date(),
            ttl: 3000,
          };
        },
        onReceive: () => {},
        onSalience: () => {
          const conf = this.metacognition?.getState()?.currentConfidence?.value ?? 0.5;
          return 1 - conf;
        },
        onRelevance: () => 0.7,
      });

      // v13.1: Wire invariant violation → FEK vigilant mode
      if (this.fek) {
        this.consciousness.onInvariantViolation(() => {
          this.fek?.setMode('vigilant');
        });
      }

      this.consciousness.start();
    }

    if (this.config.dashboard) {
      this.dashboard = getDashboard({ port: 9876 });
      // v13.1: Wire real metrics provider for dashboard UI
      this.dashboard.setMetricsProvider(() => {
        const mem = process.memoryUsage();
        const fiberSection = this.fiber?.getGlobalSection();
        return {
          timestamp: Date.now(),
          uptime: this.bootTime > 0 ? (Date.now() - this.bootTime) / 1000 : 0,
          memory: { heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, external: mem.external, rss: mem.rss },
          consciousness: {
            phi: this.consciousness?.getSnapshot()?.level?.rawPhi ?? 0,
            state: this.consciousness?.getState() ?? 'unknown',
            integration: this.consciousness?.getSnapshot()?.phi?.integratedInfo ?? 0,
          },
          kernel: {
            state: this.fek?.getMode?.() ?? 'unknown',
            energy: this.fek ? Math.max(0, 1 - (this.fek.getTotalFE?.() ?? 0) / 5) : 0,
            cycles: this.cycleCount,
          },
          agents: { total: 0, active: this.brain ? 1 : 0, queued: 0 },
          memory_system: { episodic: 0, semantic: 0, procedural: 0, total: 0 },
          llm: {
            totalRequests: this.cycleCount,
            totalCost: fiberSection?.totalCosts ?? 0,
            averageLatency: 0,
            providers: [],
          },
          mcp: { connectedServers: 0, availableTools: 0, totalCalls: 0 },
        };
      });

      // Start dashboard server (non-blocking — errors are non-fatal)
      this.dashboard.start().catch(() => { /* port in use or similar */ });

      // Wire consciousness events → dashboard SSE stream
      if (this.consciousness) {
        this.consciousness.on((event) => {
          broadcastToDashboard(`consciousness:${event.type}`, event.data);
        });
      }
    }

    if (this.config.memorySync) {
      this.memorySync = getMCPMemorySync();
      // v13.1: Start background auto-sync for cross-session persistence
      this.memorySync.startAutoSync();
    }

    this.levels.L2 = true;
  }

  private async bootL3(): Promise<void> {
    if (!this.levels.L2) throw new Error('L2 must boot before L3');

    if (this.config.causal) {
      // Causal reasoning with standard agent model
      this.causal = createAgentCausalModel();

      // Wire FEK prediction errors to causal diagnosis → belief correction
      if (this.fek) {
        this.fek.onPredictionError((error) => {
          if (this.causal) {
            const diagnosis = this.causal.diagnoseFailure(
              new Error(error.content),
              { source: error.source, target: error.target, magnitude: error.magnitude }
            );

            // v13.1: Use causal diagnosis to inform FEK mode
            const topCause = diagnosis.rootCauses[0];
            if (topCause && topCause.strength > 0.7 && error.magnitude > 0.5) {
              // High-strength root cause of severe prediction error → vigilant mode
              this.fek?.setMode('vigilant');

              // Broadcast causal diagnosis event to dashboard
              if (this.dashboard) {
                broadcastToDashboard('causal:diagnosis', {
                  rootCause: topCause.description,
                  strength: topCause.strength,
                  magnitude: error.magnitude,
                  recommendations: diagnosis.recommendations,
                });
              }
            }
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

      // v13.1: Wire sensorimotor prediction errors into FEK as embodied observations
      if (this.fek) {
        this.sensorimotor.on('prediction:error', (data: { error: number }) => {
          // High prediction error from embodiment → increase FEK free energy
          if (this.fek && data.error > 0.15) {
            this.fek.cycle({
              energy: Math.max(0, 1 - data.error),
              agentResponsive: true,
              merkleValid: true,
              systemLoad: Math.min(1, data.error * 2),
            });
          }
        });
      }

      // Start the loop if brain is available for cognitive callback
      if (this.brain) {
        this.sensorimotor.start();
      }
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

    if (this.config.selfImprovement) {
      this.selfImprovement = getSelfImprovementEngine();
      // Wire consciousness φ monitor into self-improvement
      if (this.consciousness) {
        this.selfImprovement.setPhiMonitor(this.consciousness.monitor);
      }
      if (this.cognitiveWorkspace) {
        this.selfImprovement.setCognitiveWorkspace(this.cognitiveWorkspace);
      }
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

    // Step 0: Shift consciousness attention to current input
    if (this.consciousness) {
      const domain = this.inferDomain(input);
      this.consciousness.attend(`process:${domain}`, 'internal');
    }

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

    // Step 4: FEK cycle with REAL observations
    let fekState: FEKState | null = null;
    if (this.fek) {
      // v13.1: Real system observations from multiple sources
      const mem = process.memoryUsage();
      const heapPressure = mem.heapUsed / mem.heapTotal;
      const phi = this.consciousness
        ? (this.consciousness.getSnapshot()?.level?.rawPhi ?? 0.5)
        : (confidence?.value ?? 0.5);

      // NESS deviation reduces perceived energy (economic pressure)
      const nessDeviation = this.lastNESSState?.deviation ?? 0;
      const economicPenalty = nessDeviation * 0.3; // Up to 30% energy reduction

      fekState = this.fek.cycle({
        energy: Math.max(0, Math.min(1, 1 - heapPressure - economicPenalty)),
        agentResponsive: !!this.brain,
        merkleValid: true,
        systemLoad: Math.min(1, heapPressure + nessDeviation * 0.2),
        phi,
      });
    }

    // Step 5: Economic tracking
    const elapsed = Date.now() - startTime;
    const cost = elapsed * 0.0001; // $0.0001/ms — process overhead only (real LLM costs tracked separately)

    if (this.fiber) {
      this.fiber.recordCost('genesis', cost, 'process');
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

      // v13.1: High NESS deviation → trigger self-improvement if enabled
      if (this.lastNESSState.deviation > 0.5 && this.selfImprovement && this.cycleCount % 20 === 0) {
        this.triggerSelfImprovement().catch(() => { /* non-fatal */ });
      }
    }

    // Track for calibration
    if (confidence) {
      this.performanceHistory.push({
        predicted: confidence.value,
        actual: true, // Updated externally via feedback()
      });
    }

    // v13.1: Meta-RL curriculum learning — each process() is an experience
    if (this.metaRL && confidence) {
      const domain = this.inferDomain(input);
      const success = confidence.value > this.config.deferThreshold;
      this.metaRL.updateCurriculum(`${domain}:${this.cycleCount}`, success, 1);
    }

    // Broadcast to observability dashboard
    if (this.dashboard) {
      broadcastToDashboard('cycle', {
        cycleCount: this.cycleCount,
        confidence: confidence?.value,
        cost,
        fekMode: fekState?.mode,
        totalFE: fekState?.totalFE,
        phi: this.consciousness ? this.getPhi() : undefined,
        nessDeviation: this.lastNESSState?.deviation,
        sustainable: this.fiber?.getGlobalSection().sustainable,
      });
    }

    // Release attention focus after processing
    if (this.consciousness) {
      const domain = this.inferDomain(input);
      this.consciousness.releaseAttention(`process:${domain}`);
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
  // Consciousness Interface
  // ==========================================================================

  /**
   * Get current φ (integrated information)
   */
  getPhi(): number {
    if (!this.consciousness) return 0;
    const snapshot = this.consciousness.getSnapshot();
    return snapshot?.level?.rawPhi ?? 0;
  }

  /**
   * Get consciousness snapshot
   */
  getConsciousnessSnapshot(): unknown {
    return this.consciousness?.getSnapshot() ?? null;
  }

  // ==========================================================================
  // Self-Improvement Interface
  // ==========================================================================

  /**
   * Trigger a self-improvement cycle (requires selfImprovement=true)
   */
  async triggerSelfImprovement(): Promise<{ applied: number } | null> {
    if (!this.selfImprovement) return null;
    const result = await this.selfImprovement.runCycle();
    const applied = result.results.filter((r: { success: boolean }) => r.success).length;

    if (this.fiber && applied > 0) {
      this.fiber.recordCost('genesis', 0.1 * applied, 'self-improvement');
    }

    return { applied };
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
      consciousness: this.consciousness ? {
        phi: this.consciousness.getSnapshot()?.level?.rawPhi ?? 0,
        state: this.consciousness.getSnapshot()?.state ?? 'unknown',
      } : null,
      selfImprovement: this.selfImprovement !== null,
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
    // L4: Executive shutdown
    // (metacognition, NESS, metaRL are stateless — no stop needed)

    // L3: Cognitive shutdown
    if (this.sensorimotor) {
      this.sensorimotor.stop();
    }

    // L2: Reactive shutdown
    if (this.consciousness) {
      this.consciousness.stop();
    }
    if (this.memorySync) {
      this.memorySync.stopAutoSync();
    }
    if (this.dashboard) {
      await this.dashboard.stop();
    }

    // L1: Substrate shutdown
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
