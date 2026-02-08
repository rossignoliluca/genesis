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

// v16.1.1: Load environment variables BEFORE any module imports
// This fixes timing issues where modules check process.env at import time
import 'dotenv/config';

import { FreeEnergyKernel, getFreeEnergyKernel, type FEKState, type FEKStatus } from './kernel/free-energy-kernel.js';
import { getBrain, type Brain } from './brain/index.js';
import { CausalReasoner, createAgentCausalModel, type Effect, type CounterfactualResult, type Intervention, type CausalExplanation } from './causal/index.js';
import { MetacognitionSystem, createMetacognitionSystem, type ConfidenceEstimate, type ThoughtAudit } from './metacognition/index.js';
import { getEconomicSystem, type EconomicSystem } from './economy/index.js';
import { getEconomicFiber, type EconomicFiber } from './economy/fiber.js';
import { getNESSMonitor, type NESSMonitor, type NESSState } from './economy/ness.js';
import { getBountyOrchestrator, type BountyOrchestrator } from './economy/bounty-orchestrator.js';
import { MultiModalPerception, createMultiModalPerception, type ModalityInput, type PerceptionOutput } from './perception/multi-modal.js';
import { MetaRLLearner, createMetaRLLearner, type AdaptationResult, type CurriculumState } from './learning/meta-rl.js';
import { getCodeRuntime, type CodeRuntime } from './execution/index.js';
import { initializeExecutionIntegration } from './execution/integration.js';
import { getHooksManager, type HooksManager } from './hooks/index.js';
import { sanitizeResponse, checkResponse } from './epistemic/index.js';
import { getSubagentExecutor, type SubagentExecutor } from './subagents/index.js';
import { getDashboard, broadcastToDashboard, type DashboardServer } from './observability/dashboard.js';
import { getMCPMemorySync, type MCPMemorySync } from './sync/mcp-memory-sync.js';
import { getSensoriMotorLoop, type SensoriMotorLoop } from './embodiment/sensorimotor-loop.js';
import { getConsciousnessSystem, type ConsciousnessSystem } from './consciousness/index.js';
import { getCognitiveWorkspace, type CognitiveWorkspace } from './memory/cognitive-workspace.js';
import { getSelfImprovementEngine, type SelfImprovementEngine } from './self-modification/index.js';
import { ConsciousnessBridge, type ConsciousBridgeConfig, type ConsciousnessState as BridgeState } from './active-inference/consciousness-bridge.js';
import { getFactorGraph, type FactorGraph } from './kernel/factor-graph.js';
import type { MotorCommand } from './embodiment/sensorimotor-loop.js';
import { getNeuromodulationSystem, type NeuromodulationSystem, type ModulationEffect } from './neuromodulation/index.js';
import { createAllostasisSystem, type AllostasisSystem, type AllostaticAction } from './allostasis/index.js';
import { getNociceptiveSystem, type NociceptiveSystem, type NociceptiveState, type PainLevel } from './nociception/index.js';
import { getDaemon, type Daemon, type DaemonDependencies } from './daemon/index.js';
import { createFeelingAgent, type FeelingAgent } from './agents/feeling.js';
import type { Feeling } from './agents/types.js';

// World Model — predictive engine (core to FEK prediction error minimization)
import { getWorldModelSystem, type WorldModelSystem } from './world-model/index.js';
import type { LatentState, PredictedState } from './world-model/types.js';

// Thinking — deep reasoning chains (ToT, GoT, super-correct)
import { getThinkingEngine, type ThinkingEngine } from './thinking/index.js';

// Reasoning — metacognitive strategy selection + execution
import { getMetacognitiveController, type MetacognitiveController } from './reasoning/metacognitive-controller.js';

// Memory — full episodic/semantic/procedural stack
import { getMemorySystem, type MemorySystem } from './memory/index.js';

// Component Memory — per-component FSRS scheduling and personalized profiles
import {
  getComponentMemory,
  getAllComponentManagers,
  resetAllComponentManagers,
  type ComponentMemoryManager,
  type ComponentId,
  COMPONENT_PROFILES,
} from './memory/index.js';

// Grounding — epistemic verification of claims
import { getGroundingSystem, type GroundingSystem } from './grounding/index.js';

// Healing — error detection and auto-repair
import { healing } from './healing/index.js';

// Agents — multi-agent coordination pool
import { getAgentPool, type AgentPool } from './agents/index.js';

// Governance — permission gates, HITL, budget enforcement
import { getGovernanceSystem, type GovernanceSystem } from './governance/index.js';

// Uncertainty — conformal prediction intervals
import { createAdaptiveConformal, type AdaptiveConformalPredictor } from './uncertainty/conformal.js';

// ============================================================================
// ORPHANED MODULES — Now fully integrated (nothing wasted)
// ============================================================================

// Bus — central event backbone (pub/sub for all modules)
import { getEventBus, type GenesisEventBus } from './bus/index.js';

// Persistence — state storage to disk
import { StateStore } from './persistence/index.js';

// MCP Client — tool infrastructure for external capabilities
import { getMCPManager, type MCPClientManager } from './mcp/client-manager.js';

// Streaming — LLM streaming orchestration
import { createStreamOrchestrator, type StreamOrchestrator } from './streaming/index.js';

// Tools — bash, edit, git execution
import { getBashTool, getEditTool } from './tools/index.js';

// Pipeline — multi-step orchestration
import { createPipelineExecutor, type PipelineExecutor } from './pipeline/index.js';

// A2A — agent-to-agent protocol
import { A2AClient, A2AServer, generateA2AKeyPair, type A2AClientConfig, type A2AServerConfig } from './a2a/index.js';

// Payments — revenue and cost tracking
import { getPaymentService, getRevenueTracker, type PaymentService, type RevenueTracker } from './payments/index.js';

// Services — competitive intel, revenue loop
import { createCompetitiveIntelService, type CompetitiveIntelService } from './services/competitive-intel.js';
import { createRevenueLoop, type RevenueLoop } from './services/revenue-loop.js';

// Deployment — self-deployment capability
import { VercelDeployer } from './deployment/index.js';

// Autonomous — unified autonomous system
import { AutonomousSystem } from './autonomous/index.js';

// Integration — cross-module wiring
import { bootstrapIntegration, wireAllModules, type WiringResult, getCognitiveBridge, type CognitiveBridge } from './integration/index.js';

// Central Awareness — global consciousness over all modules
import { getCentralAwareness, type CentralAwareness, type DecisionGate } from './consciousness/central-awareness.js';

// Finance — market data, signals, risk, portfolio (simulation mode for now)
import { createFinanceModule, type FinanceModule } from './finance/index.js';

// Revenue — autonomous revenue streams (bounty, MCP, keeper, content, yield)
import { createRevenueSystem, type RevenueSystem } from './revenue/index.js';

// Revenue Activation — unified revenue control (x402, content, services)
import {
  getRevenueActivation,
  type RevenueActivationManager,
  type RevenueActivationConfig,
} from './revenue/activation.js';

// x402 Payments — HTTP 402 micropayment protocol (USDC on Base)
import { isClientConfigured as isX402Configured } from './payments/x402/index.js';

// Observatory UI — real-time visualization (connects to dashboard SSE)
import { createObservatory, type Observatory } from './ui/index.js';

// Polymarket — prediction market integration via Active Inference
import { createPolymarketTrader, type PolymarketTrader } from './finance/polymarket/index.js';

// MCP Finance — unified financial MCP servers interface
import { getMCPFinanceManager, type MCPFinanceManager } from './mcp-finance/index.js';

// Exotic Computing — thermodynamic, hyperdimensional, reservoir computing
import { createExoticComputing, type ExoticComputing } from './exotic/index.js';

// Content — multi-platform content creator (social media, SEO, scheduling, analytics)
import {
  initContentModule,
  shutdownContentModule,
  wireContentModule,
  getContentOrchestrator,
  getContentScheduler,
  getAnalyticsAggregator,
  createContentSystemIntegration,
  wireContentToIntegrations,
  publishMarketBrief,
  type ContentOrchestrator,
  type ContentScheduler,
  type AnalyticsAggregator,
  type ContentSystemIntegration,
  type MarketBriefSummary,
} from './content/index.js';

// Market Strategist — weekly market strategy brief generation
import {
  getMarketStrategist,
  generateWeeklyBrief,
  type MarketStrategist,
  type MarketBrief,
  type StrategyConfig,
} from './market-strategist/index.js';

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
  /** Enable world model (prediction engine for FEK) */
  worldModel: boolean;
  /** Enable deep thinking (ToT, GoT, super-correct) */
  thinking: boolean;
  /** Enable metacognitive reasoning controller */
  reasoning: boolean;
  /** Enable full memory system (episodic/semantic/procedural) */
  memory: boolean;
  /** Enable daemon (background processing, dream mode) */
  daemon: boolean;
  /** Enable epistemic grounding */
  grounding: boolean;
  /** Enable healing (error detection, auto-repair) */
  healing: boolean;
  /** Enable multi-agent pool */
  agents: boolean;
  /** Enable governance (permissions, HITL, budget gates) */
  governance: boolean;
  /** Enable conformal prediction (calibrated uncertainty) */
  uncertainty: boolean;
  /** Enable event bus (central pub/sub) */
  eventBus: boolean;
  /** Enable state persistence to disk */
  persistence: boolean;
  /** Enable MCP client for external tools */
  mcpClient: boolean;
  /** Enable streaming orchestrator */
  streaming: boolean;
  /** Enable pipeline executor */
  pipeline: boolean;
  /** Enable A2A protocol */
  a2a: boolean;
  /** Enable payment/revenue tracking */
  payments: boolean;
  /** Enable competitive intel service */
  compIntel: boolean;
  /** Enable self-deployment capability */
  deployment: boolean;
  /** Enable autonomous system mode */
  autonomous: boolean;
  /** Enable finance module (market data, signals, risk, portfolio) */
  finance: boolean;
  /** Enable revenue system (autonomous revenue streams) */
  revenue: boolean;
  /** Enable Observatory UI (real-time visualization) */
  observatory: boolean;
  /** Enable Polymarket integration (prediction markets) */
  polymarket: boolean;
  /** Enable MCP Finance servers (market data APIs) */
  mcpFinance: boolean;
  /** Enable exotic computing (thermodynamic, hyperdimensional, reservoir) */
  exotic: boolean;
  /** Enable content creator (multi-platform publishing, SEO, scheduling, analytics) */
  content: boolean;
  /** Enable market strategist (weekly market briefs, data collection, PPTX generation) */
  marketStrategist: boolean;
  /** Enable component-specific memory with FSRS v4 scheduling */
  componentMemory: boolean;
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
  dashboard: { running: boolean; url: string } | null;
  memorySync: { syncCount: number; isRunning: boolean } | null;
  sensorimotor: { running: boolean; cycles: number; avgPredictionError: number } | null;
  neuromodulation: { dopamine: number; serotonin: number; norepinephrine: number; cortisol: number; explorationRate: number; riskTolerance: number } | null;
  allostasis: { energy: number; load: number; memoryPressure: number; errorRate: number } | null;
  nociception: { level: PainLevel; aggregatePain: number; chronic: boolean; activeSignals: number } | null;
  feeling: { valence: number; arousal: number; category: string } | null;
  worldModel: { running: boolean; entities: number; twins: number } | null;
  thinking: boolean;
  reasoning: boolean;
  memory: { episodic: number; semantic: number; procedural: number } | null;
  daemon: { running: boolean; state: string } | null;
  grounding: { claimsGrounded: number } | null;
  healing: boolean;
  agents: { poolSize: number } | null;
  governance: boolean;
  uncertainty: { coverage: number; avgWidth: number } | null;
  hooks: { configured: number; configPath: string | null } | null;
  subagents: { available: boolean; runningTasks: number } | null;
  eventBus: { subscribers: number } | null;
  persistence: { lastSave: number | null } | null;
  mcpClient: { servers: number; tools: number } | null;
  streaming: { activeStreams: number; avgLatency: number } | null;
  pipeline: boolean;
  a2a: { connected: boolean; peers: number } | null;
  payments: { totalRevenue: number; totalCost: number } | null;
  compIntel: { competitors: number; lastScan: number | null } | null;
  deployment: boolean;
  autonomous: { status: string; queuedTasks: number } | null;
  // v13.11.0: Central Awareness
  centralAwareness: {
    coherence: number;
    activeModules: number;
    dominantNeuroState: string;
    inAgony: boolean;
    sustainable: boolean;
  } | null;
  // v13.12.0: Finance, Revenue, UI
  finance: {
    running: boolean;
    symbols: number;
    regime: string;
    portfolioValue: number;
  } | null;
  revenue: {
    running: boolean;
    totalRevenue: number;
    activeStreams: number;
    pendingTasks: number;
  } | null;
  observatory: { connected: boolean } | null;
  polymarket: { running: boolean; activeMarkets: number } | null;
  mcpFinance: { cacheSize: number } | null;
  exotic: { thermodynamic: boolean; hyperdimensional: boolean; reservoir: boolean } | null;
  content: {
    running: boolean;
    scheduledItems: number;
    trackedContent: number;
    totalRevenue: number;
    contentCreated: number;
    contentPublished: number;
    avgEngagementRate: number;
  } | null;
  marketStrategist: {
    running: boolean;
    briefsGenerated: number;
    lastBriefWeek: string | null;
  } | null;
  componentMemory: {
    active: boolean;
    managers: number;
    totalMemories: number;
    avgRetention: number;
  } | null;
  modulesWired: number;
  calibrationError: number;
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
  private consciousnessBridge: ConsciousnessBridge | null = null;
  private factorGraph: FactorGraph | null = null;
  private neuromodulation: NeuromodulationSystem | null = null;
  private allostasis: AllostasisSystem | null = null;
  private nociception: NociceptiveSystem | null = null;
  private daemon: Daemon | null = null;
  private feelingAgent: FeelingAgent | null = null;
  private worldModel: WorldModelSystem | null = null;
  private thinking: ThinkingEngine | null = null;
  private reasoningController: MetacognitiveController | null = null;
  private memory: MemorySystem | null = null;
  private grounding: GroundingSystem | null = null;
  private agentPool: AgentPool | null = null;
  private governance: GovernanceSystem | null = null;
  private conformal: AdaptiveConformalPredictor | null = null;
  private hooks: HooksManager | null = null;
  private subagents: SubagentExecutor | null = null;
  private lastLatentState: LatentState | null = null;

  // Orphaned modules — now fully integrated
  private eventBus: GenesisEventBus | null = null;
  private stateStore: StateStore | null = null;
  private mcpClient: MCPClientManager | null = null;
  private streamOrchestrator: StreamOrchestrator | null = null;
  private pipelineExecutor: PipelineExecutor | null = null;
  private a2aClient: A2AClient | null = null;
  private a2aServer: A2AServer | null = null;
  private paymentService: PaymentService | null = null;
  private revenueTracker: RevenueTracker | null = null;
  private compIntelService: CompetitiveIntelService | null = null;
  private revenueLoop: RevenueLoop | null = null;
  private deployer: VercelDeployer | null = null;
  private autonomousSystem: AutonomousSystem | null = null;

  // v13.11.0: Central Awareness — unified consciousness over all modules
  private centralAwareness: CentralAwareness | null = null;
  private wiringResult: WiringResult | null = null;

  // v21.0: Cognitive Bridge — perception→consciousness→inference pipeline
  private cognitiveBridge: CognitiveBridge | null = null;

  // v21.0: Bounty Orchestrator — unified bounty hunting brain
  private bountyOrchestrator: BountyOrchestrator | null = null;

  // v13.12.0: Finance, Revenue, UI modules
  private financeModule: FinanceModule | null = null;
  private revenueSystem: RevenueSystem | null = null;
  private revenueActivation: RevenueActivationManager | null = null;
  private observatory: Observatory | null = null;
  private polymarketTrader: PolymarketTrader | null = null;
  private mcpFinance: MCPFinanceManager | null = null;
  private exotic: ExoticComputing | null = null;

  // v18.1.0: Content creator module
  private contentOrchestrator: ContentOrchestrator | null = null;
  private contentScheduler: ContentScheduler | null = null;
  private contentAnalytics: AnalyticsAggregator | null = null;
  private contentIntegration: ContentSystemIntegration | null = null;

  // v18.2.0: Market strategist module
  private marketStrategistInstance: MarketStrategist | null = null;
  private marketStrategistBriefsGenerated = 0;
  private marketStrategistLastBrief: string | null = null;

  // v18.3.0: Component-specific memory managers (FSRS v4 scheduling)
  private componentMemoryManagers: Map<ComponentId, ComponentMemoryManager> = new Map();

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
      worldModel: true,
      thinking: true,
      reasoning: true,
      memory: true,
      daemon: true,
      grounding: true,
      healing: true,
      agents: true,
      governance: false,
      uncertainty: true,
      eventBus: true,
      persistence: true,
      mcpClient: true,
      streaming: true,
      pipeline: true,
      a2a: false,           // Disabled by default (requires network)
      payments: false,      // Disabled by default (requires Stripe key)
      compIntel: false,     // Disabled by default (requires setup)
      deployment: false,    // Disabled by default (requires Vercel token)
      autonomous: false,    // Disabled by default (safety)
      finance: true,        // v13.12: Finance module (simulation mode)
      revenue: true,        // v13.12: Revenue streams (simulation mode)
      observatory: false,   // v13.12: UI (requires dashboard running)
      polymarket: false,    // v13.12: Prediction markets (requires API)
      mcpFinance: true,     // v13.12: MCP finance servers
      exotic: true,         // v14.2: Exotic computing (thermodynamic, HDC, reservoir)
      content: true,        // v18.1: Content creator (social media, SEO, scheduling)
      marketStrategist: true, // v18.2: Market strategist (weekly briefs, PPTX)
      componentMemory: true,  // v18.3: Component-specific memory with FSRS v4
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

    // v13.8: Initialize hooks system (lifecycle event hooks)
    this.hooks = getHooksManager();

    // L1: Autonomic substrate
    await this.bootL1();

    // L2: Reactive layer
    await this.bootL2();

    // L3: Cognitive layer
    await this.bootL3();

    // L4: Executive layer
    await this.bootL4();

    this.booted = true;

    // Fire session-start hook
    if (this.hooks.hasHooks()) {
      this.hooks.execute('session-start', { event: 'session-start' }).catch(e => console.debug('[Hooks] session-start failed:', e?.message || e));
    }

    return this.getStatus();
  }

  private async bootL1(): Promise<void> {
    // Free Energy Kernel — the core autonomic loop
    this.fek = getFreeEnergyKernel();
    this.fek.start();

    // Neuromodulatory System — global state broadcast (hormonal analog)
    this.neuromodulation = getNeuromodulationSystem();
    this.neuromodulation.start();

    // Wire FEK prediction errors → novelty signal (norepinephrine + dopamine)
    this.fek.onPredictionError((error) => {
      this.neuromodulation?.novelty(error.magnitude, `fek:${error.source}→${error.target}`);
    });

    // Wire FEK mode changes → neuromodulatory tone
    this.fek.onModeChange((mode) => {
      if (mode === 'vigilant') {
        this.neuromodulation?.threat(0.5, 'fek:vigilant');
      } else if (mode === 'dormant' || mode === 'dreaming') {
        this.neuromodulation?.calm(0.6, `fek:${mode}`);
      } else if (mode === 'focused') {
        this.neuromodulation?.modulate('norepinephrine', 0.15, 'fek:focused');
      }
    });

    // Allostasis — predictive interoceptive regulation (autonomic homeostasis)
    this.allostasis = createAllostasisSystem();

    // Register real sensors for interoception
    this.allostasis.registerSensor('memoryPressure', () => {
      const mem = process.memoryUsage();
      return mem.heapUsed / mem.heapTotal;
    });
    this.allostasis.registerSensor('energy', () => {
      // Energy = remaining budget fraction
      const section = this.fiber?.getGlobalSection();
      return section ? Math.max(0, 1 - section.totalCosts / (this.config.totalBudget || 100)) : 1.0;
    });
    this.allostasis.registerSensor('errorRate', () => {
      // Error rate from recent performance history
      if (this.performanceHistory.length < 5) return 0;
      const recent = this.performanceHistory.slice(-20);
      return recent.filter(p => !p.actual).length / recent.length;
    });

    // Allostatic actions → neuromodulatory signals + nociceptive pain
    this.allostasis.on('regulation', (result: { action: AllostaticAction; success: boolean }) => {
      if (!this.neuromodulation) return;
      const { action } = result;
      if (action.type === 'throttle' || action.type === 'hibernate') {
        this.neuromodulation.threat(action.urgency * 0.4, `allostasis:${action.type}`);
        // Allostatic regulation = pain signal (system is struggling)
        this.nociception?.stimulus('embodiment', action.urgency * 0.5, `allostasis:${action.reason}`);
      } else if (action.type === 'defer') {
        this.neuromodulation.modulate('serotonin', 0.1, 'allostasis:defer');
      } else if (action.type === 'scale_up') {
        this.neuromodulation.modulate('dopamine', 0.1, 'allostasis:scale_up');
      }
    });

    // Nociceptive System — graduated pain signals (prevent catastrophic failure)
    this.nociception = getNociceptiveSystem();

    // Wire FEK high free energy → cognitive pain (surprise = discomfort)
    this.fek.onPredictionError((error) => {
      if (error.magnitude > 0.3) {
        this.nociception?.stimulus('cognitive', error.magnitude * 0.6, `prediction_error:${error.source}`);
      }
    });

    // Wire neuromodulation → analgesia (high dopamine+serotonin = pain suppression)
    this.neuromodulation.onUpdate((levels) => {
      const analgesiaLevel = (levels.dopamine * 0.4 + levels.serotonin * 0.6);
      this.nociception?.updateAnalgesia(analgesiaLevel);
    });

    // Wire pain → neuromodulation (pain causes cortisol + NE spikes)
    this.nociception.onPain((state) => {
      if (!this.neuromodulation) return;
      if (state.overallLevel === 'agony') {
        this.neuromodulation.threat(0.8, 'nociception:agony');
        // Agony → force FEK into vigilant mode
        this.fek?.setMode('vigilant');
      } else if (state.overallLevel === 'pain') {
        this.neuromodulation.threat(0.4, 'nociception:pain');
      }
    });

    // Daemon — background scheduler, dream mode, maintenance
    if (this.config.daemon) {
      this.daemon = getDaemon();

      // Wire FEK 'dreaming' mode → daemon dream cycle
      this.fek.onModeChange((mode) => {
        if (mode === 'dreaming' && this.daemon) {
          this.daemon.dream().then((dreamResult) => {
            // Dream consolidation complete → reward signal
            this.neuromodulation?.reward(0.3, 'daemon:dream_complete');
            // Update world model from dream replay
            if (this.worldModel && dreamResult.memoriesConsolidated > 0) {
              this.worldModel.dream().catch(() => { /* non-fatal */ });
            }
          }).catch(() => { /* non-fatal */ });
        }
      });

      this.daemon.start();
    }

    // Event Bus — central pub/sub backbone
    // Note: FEK and Neuromodulation now publish directly to the bus (v13.9)
    // No manual wiring needed here - modules self-wire in their constructors
    if (this.config.eventBus) {
      this.eventBus = getEventBus();

      // v14.1: Wire daemon events → event bus (fixes daemon isolation)
      if (this.daemon) {
        this.daemon.on((event) => {
          const baseEvent = {
            source: 'daemon',
            precision: 0.9,
          };
          // Cast data for property access (DaemonEvent.data is unknown)
          const data = event.data as Record<string, unknown> | null;

          switch (event.type) {
            case 'daemon_started':
            case 'daemon_stopped':
            case 'daemon_error':
              this.eventBus?.publish('daemon.state.changed', {
                ...baseEvent,
                state: event.type === 'daemon_started' ? 'running' :
                       event.type === 'daemon_stopped' ? 'stopped' : 'error',
                previousState: data?.previousState as string | undefined,
              });
              break;

            case 'task_scheduled':
            case 'task_started':
            case 'task_completed':
            case 'task_failed':
            case 'task_cancelled':
              this.eventBus?.publish(`daemon.task.${event.type.replace('task_', '')}` as 'daemon.task.scheduled', {
                ...baseEvent,
                taskId: data?.id as string | undefined,
                taskName: data?.name as string | undefined,
                status: event.type.replace('task_', '') as 'scheduled',
                priority: (data?.priority as 'critical' | 'high' | 'normal' | 'low' | 'idle') || 'normal',
                durationMs: data?.duration as number | undefined,
                error: data?.error as string | undefined,
              });
              break;

            case 'dream_started':
            case 'dream_completed':
            case 'dream_interrupted':
            case 'dream_phase_changed':
              this.eventBus?.publish(`daemon.dream.${event.type.replace('dream_', '')}` as 'daemon.dream.started', {
                ...baseEvent,
                phase: event.type.replace('dream_', '') as 'started',
                dreamPhase: data?.phase as string | undefined,
                consolidations: data?.memoriesConsolidated as number | undefined,
                creativeInsights: data?.creativeInsights as number | undefined,
                durationMs: data?.duration as number | undefined,
                reason: data?.reason as string | undefined,
              });
              break;

            case 'maintenance_started':
            case 'maintenance_completed':
            case 'maintenance_issue':
              this.eventBus?.publish(`daemon.maintenance.${event.type.replace('maintenance_', '')}` as 'daemon.maintenance.started', {
                ...baseEvent,
                status: event.type.replace('maintenance_', '') as 'started',
                issuesFound: data?.issuesFound as number | undefined,
                issuesFixed: data?.issuesFixed as number | undefined,
                memoryReclaimed: data?.memoryReclaimed as number | undefined,
                report: data,
              });
              break;
          }
        });
      }
    }

    // Persistence — state storage to disk
    if (this.config.persistence) {
      this.stateStore = new StateStore({
        autoSave: true,
        autoSaveIntervalMs: 60000, // 1 minute auto-save
        onSave: (state) => {
          this.eventBus?.publish('persistence:saved', {
            source: 'persistence',
            precision: 1.0,
            checksum: state.checksum,
            lastModified: state.lastModified
          });
        },
        onError: (error) => {
          this.eventBus?.publish('persistence:error', {
            source: 'persistence',
            precision: 0.0,
            error: error.message
          });
        },
      });

      // Wire state persistence → event bus
      if (this.eventBus) {
        this.eventBus.publish('persistence:initialized', {
          source: 'persistence',
          precision: 1.0,
          dataDir: this.stateStore.getDataDir()
        });
      }
    }

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

    // Full Memory System — episodic/semantic/procedural + consolidation
    if (this.config.memory) {
      this.memory = getMemorySystem();
      this.fiber?.registerModule('memory');

      // Wire daemon maintenance → memory consolidation (sleep = consolidate)
      if (this.daemon) {
        this.daemon.on((event) => {
          if (event.type === 'maintenance_completed') {
            this.memory?.sleep().catch(() => { /* non-fatal */ });
          }
        });
      }

      // v14.1: Wire memory → persistence (sync memory stats to state store)
      if (this.stateStore) {
        const memStats = this.memory.getStats();
        this.stateStore.updateMemory({
          stats: {
            totalEpisodes: memStats.episodic.total,
            totalFacts: memStats.semantic.total,
            totalSkills: memStats.procedural.total,
          }
        });
      }
    }

    // v18.3: Component-specific memory managers with FSRS v4 scheduling
    if (this.config.componentMemory) {
      // Initialize core component memory managers
      const coreComponents: ComponentId[] = [
        'brain', 'content', 'market-strategist', 'economy', 'agents',
        'self-improvement', 'causal', 'consciousness', 'world-model',
        'neuromodulation', 'allostasis', 'daemon', 'thinking', 'grounding',
      ];
      for (const componentId of coreComponents) {
        this.componentMemoryManagers.set(componentId, getComponentMemory(componentId));
      }
      this.fiber?.registerModule('component-memory');

      // Wire component memory consolidation to daemon maintenance
      if (this.daemon) {
        this.daemon.on((event) => {
          if (event.type === 'maintenance_completed') {
            // Consolidate all component memories during maintenance
            for (const [id, manager] of this.componentMemoryManagers) {
              const candidates = manager.getConsolidationCandidates();
              if (candidates.length > 0) {
                this.eventBus?.publish('memory.component.consolidation', {
                  source: 'genesis:component-memory',
                  precision: 0.8,
                  componentId: id,
                  candidateCount: candidates.length,
                });
              }
            }
          }
        });
      }
    }

    // World Model — predictive encoder/decoder (core to FEK prediction loop)
    if (this.config.worldModel) {
      this.worldModel = getWorldModelSystem();
      this.worldModel.start();
      this.fiber?.registerModule('worldmodel');

      // Wire world model prediction errors → FEK free energy
      this.worldModel.on((event) => {
        if (event.type === 'consistency_violation' && this.fek) {
          const error = event.data as { magnitude: number; source: string };
          // World model surprise → increases system free energy
          this.fek.cycle({
            energy: Math.max(0, 1 - error.magnitude),
            agentResponsive: true,
            merkleValid: true,
            systemLoad: Math.min(1, error.magnitude * 1.5),
          });
          // Nociceptive: large world-model surprise = cognitive pain
          if (error.magnitude > 0.5) {
            this.nociception?.stimulus('cognitive', error.magnitude * 0.4, `worldmodel:${error.source}`);
          }
        }
      });

      // Wire FEK prediction errors → world model adaptation signal
      if (this.fek) {
        this.fek.onPredictionError((error) => {
          if (this.worldModel && error.magnitude > 0.1) {
            // FEK surprise → trigger world model dream consolidation
            this.worldModel.dream().catch(() => { /* non-fatal */ });
          }
        });
      }
    }

    // FeelingAgent — digital limbic system (valence/arousal/importance)
    this.feelingAgent = createFeelingAgent();

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
        const memEntropy = this.cognitiveWorkspace
          ? Math.min(1, this.cognitiveWorkspace.getStats().itemCount / Math.max(1, this.cognitiveWorkspace.getStats().maxItems))
          : 0.4;

        // v18.1: Neuromodulation entropy from modulatory balance
        const neuromodEntropy = this.neuromodulation
          ? Math.abs(this.neuromodulation.getEffect().explorationRate - 0.5) * 2
          : 0.5;

        const now = new Date();
        return {
          components: [
            { id: 'fek', type: 'kernel', active: !!this.fek, state: { mode: this.fek?.getMode?.() ?? 'dormant' }, entropy: fekEntropy, lastUpdate: now },
            { id: 'brain', type: 'processor', active: !!this.brain, state: { calibrationError: brainEntropy }, entropy: brainEntropy, lastUpdate: now },
            { id: 'fiber', type: 'economic', active: !!this.fiber, state: { sustainable: fiberSection?.sustainable ?? false, netFlow: fiberSection?.netFlow ?? 0 }, entropy: econEntropy, lastUpdate: now },
            { id: 'memory', type: 'storage', active: !!this.cognitiveWorkspace, state: {}, entropy: memEntropy, lastUpdate: now },
            { id: 'neuromod', type: 'modulator', active: !!this.neuromodulation, state: {}, entropy: neuromodEntropy, lastUpdate: now },
            { id: 'world-model', type: 'predictor', active: !!this.worldModel, state: {}, entropy: 0.4, lastUpdate: now },
            { id: 'nociception', type: 'sentinel', active: !!this.nociception, state: {}, entropy: 0.3, lastUpdate: now },
          ],
          connections: [
            { from: 'fek', to: 'brain', strength: 0.9, informationFlow: Math.max(0.3, 1 - fekEntropy), bidirectional: true },
            { from: 'brain', to: 'memory', strength: 0.8, informationFlow: 0.7, bidirectional: true },
            { from: 'fiber', to: 'fek', strength: 0.6, informationFlow: fiberSection?.sustainable ? 0.8 : 0.3, bidirectional: true },
            { from: 'neuromod', to: 'world-model', strength: 0.7, informationFlow: 0.6, bidirectional: false },
            { from: 'nociception', to: 'neuromod', strength: 0.6, informationFlow: 0.5, bidirectional: false },
          ],
          stateHash: `cycle-${this.cycleCount}-fe${fekEntropy.toFixed(2)}-nm${neuromodEntropy.toFixed(2)}`,
          timestamp: now,
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

      // v13.2: Neuromodulation as GWT module — consciousness aware of emotional tone
      if (this.neuromodulation) {
        this.consciousness.registerModule({
          id: 'neuromod-module',
          name: 'Neuromodulation',
          type: 'evaluative',
          active: true,
          load: 0.15,
          onPropose: () => {
            if (!this.neuromodulation) return null;
            const levels = this.neuromodulation.getLevels();
            // Propose when any modulator deviates significantly from baseline
            const maxDeviation = Math.max(
              Math.abs(levels.dopamine - 0.5),
              Math.abs(levels.serotonin - 0.6),
              Math.abs(levels.norepinephrine - 0.4),
              Math.abs(levels.cortisol - 0.3),
            );
            if (maxDeviation < 0.2) return null;
            return {
              id: `neuromod-${Date.now()}`,
              sourceModule: 'neuromod-module',
              type: 'emotion' as const,
              data: { levels, deviation: maxDeviation },
              salience: maxDeviation,
              relevance: 0.6,
              timestamp: new Date(),
              ttl: 4000,
            };
          },
          onReceive: () => {},
          onSalience: () => {
            if (!this.neuromodulation) return 0;
            const levels = this.neuromodulation.getLevels();
            return Math.max(
              Math.abs(levels.dopamine - 0.5),
              Math.abs(levels.cortisol - 0.3),
            );
          },
          onRelevance: () => 0.6,
        });
      }

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
          consciousness: (() => {
            const snapshot = this.consciousness?.getSnapshot();
            const attFocus = snapshot?.attention?.focus;
            return {
              phi: snapshot?.level?.rawPhi ?? 0,
              state: this.consciousness?.getState() ?? 'unknown',
              integration: snapshot?.phi?.integratedInfo ?? 0,
              complexity: 0,
              attentionFocus: attFocus && typeof attFocus === 'object' ? (attFocus as { id?: string }).id ?? null : null,
              workspaceContents: [],
            };
          })(),
          kernel: {
            state: this.fek?.getMode?.() ?? 'unknown',
            energy: this.fek ? Math.max(0, 1 - (this.fek.getTotalFE?.() ?? 0) / 5) : 0,
            cycles: this.cycleCount,
            mode: this.fek?.getMode?.() ?? 'explore',
            levels: {
              l1: { active: true, load: 0.5 },
              l2: { active: true, load: 0.5 },
              l3: { active: true, load: 0.5 },
              l4: { active: true, load: 0.5 },
            },
            freeEnergy: this.fek?.getTotalFE?.() ?? 0,
            predictionError: 0,
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

      // Wire FEK mode changes → dashboard SSE stream
      if (this.fek) {
        this.fek.onModeChange((mode, prev) => {
          broadcastToDashboard('kernel:mode', { mode, prev, cycle: this.cycleCount });
        });
      }

      // Wire neuromodulator level changes → dashboard SSE stream
      if (this.neuromodulation) {
        this.neuromodulation.onUpdate((levels, effect) => {
          broadcastToDashboard('neuromodulation:update', {
            levels,
            effect: {
              explorationRate: effect.explorationRate,
              riskTolerance: effect.riskTolerance,
              processingDepth: effect.processingDepth,
              learningRate: effect.learningRate,
            },
            cycle: this.cycleCount,
          });
        });
      }

      // Wire allostatic regulation events → dashboard SSE stream
      if (this.allostasis) {
        this.allostasis.on('regulation', (result: { action: AllostaticAction; success: boolean }) => {
          broadcastToDashboard('allostasis:regulation', {
            action: result.action.type,
            target: result.action.target,
            urgency: result.action.urgency,
            reason: result.action.reason,
            success: result.success,
            cycle: this.cycleCount,
          });
        });
      }

      // Wire nociceptive pain events → dashboard SSE stream
      if (this.nociception) {
        this.nociception.onPain((state) => {
          broadcastToDashboard('nociception:pain', {
            level: state.overallLevel,
            aggregatePain: state.aggregatePain,
            chronic: state.chronic,
            signals: state.activeSignals.length,
            cycle: this.cycleCount,
          });
        });
      }
    }

    if (this.config.memorySync) {
      this.memorySync = getMCPMemorySync();
      // v13.1: Start background auto-sync for cross-session persistence
      this.memorySync.startAutoSync();
    }

    // v13.5: ConsciousnessBridge — φ-gated action execution for Active Inference
    if (this.consciousness) {
      this.consciousnessBridge = new ConsciousnessBridge(
        { maxCycles: Infinity },
        { phiThreshold: 0.3, verbose: false }
      );
      // Feed real φ values and attention shifts from consciousness system into the bridge
      this.consciousness.on((event) => {
        if (event.type === 'phi_updated' || event.type === 'state_changed') {
          const phi = this.consciousness?.getSnapshot()?.level?.rawPhi ?? 0.3;
          this.consciousnessBridge?.updatePhi(phi);
        }
        if (event.type === 'attention_shifted') {
          const data = event.data as { target?: string } | undefined;
          if (data?.target) {
            this.consciousnessBridge?.setAttentionFocus(data.target);
          }
        }
      });
    }

    // v13.5: Factor Graph — bidirectional belief propagation between modules
    // getFactorGraph() creates pre-configured Genesis topology via createGenesisFactorGraph()
    // with nodes: FEK, Brain, Consciousness, Economy, Metacognition, Sensorimotor
    // and edges connecting them with precision-weighted channels
    this.factorGraph = getFactorGraph();

    // MCP Client — external tool infrastructure
    if (this.config.mcpClient) {
      this.mcpClient = getMCPManager();
      this.fiber?.registerModule('mcp');

      // Wire MCP tool calls → economic cost tracking
      // (costs are tracked per-call in the MCP client itself)
    }

    // Streaming Orchestrator — LLM streaming with latency tracking
    if (this.config.streaming) {
      this.streamOrchestrator = createStreamOrchestrator();
      this.fiber?.registerModule('streaming');

      // v18.0: Stream completion → economic fiber handled by integration layer
      // See: src/integration/index.ts recordStreamingCost() and emitLatencyObservation()
    }

    // Pipeline Executor — multi-step orchestration
    if (this.config.pipeline) {
      this.pipelineExecutor = createPipelineExecutor();
      this.fiber?.registerModule('pipeline');
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

            // Record causal diagnosis cost
            if (this.fiber) {
              this.fiber.recordCost('causal', 0.01, 'diagnosis');
            }

            // v13.1: Use causal diagnosis to inform FEK mode
            const topCause = diagnosis.rootCauses[0];
            if (topCause && topCause.strength > 0.7 && error.magnitude > 0.5) {
              // High-strength root cause of severe prediction error → vigilant mode
              this.fek?.setMode('vigilant');

              // v13.2: Apply first recommendation as adaptive action
              if (diagnosis.recommendations?.length > 0 && this.metacognition) {
                // Use recommendation to update self-model competence
                const domain = topCause.description?.includes('action') ? 'coding' : 'general';
                this.metacognition.updateFromOutcome(domain, false, 0.7);
              }

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

      // v13.8: Register perception as GWT module for consciousness workspace competition
      if (this.consciousness) {
        const perception = this.perception;
        this.consciousness.registerModule({
          id: 'perception-module',
          name: 'Multi-Modal Perception',
          type: 'perceptual',
          active: true,
          load: 0.2,
          onPropose: () => {
            const lastOutput = perception.getLastOutput();
            if (!lastOutput || lastOutput.confidence < 0.4) return null;
            return {
              id: `percept-${Date.now()}`,
              sourceModule: 'perception-module',
              type: 'percept' as const,
              data: { description: lastOutput.description, confidence: lastOutput.confidence },
              salience: lastOutput.salience,
              relevance: lastOutput.confidence,
              timestamp: new Date(),
              ttl: 3000,
            };
          },
          onReceive: () => { /* perception receives broadcasts but doesn't act */ },
          onSalience: () => perception.getLastOutput()?.salience ?? 0,
          onRelevance: () => perception.getLastOutput()?.confidence ?? 0.5,
        });
      }
    }

    if (this.config.execution) {
      this.codeRuntime = getCodeRuntime();
      // v13.8: Register execution actions with Active Inference (execute.code, execute.shell, etc.)
      initializeExecutionIntegration();
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

      // v13.5: Brain-to-motor translation layer — cognitive callback
      if (this.brain) {
        const brain = this.brain;
        const bridge = this.consciousnessBridge;

        this.sensorimotor.setCognitiveCallback((perception, sensorState) => {
          // φ-gate: skip cognitive processing if consciousness is too low
          if (bridge && bridge.getState().phi < 0.2) {
            return null; // Let reflexes handle it
          }

          const safetyStatus = sensorState.safetyStatus;

          // Safety override: if safety critical, generate immediate stop command
          if (!safetyStatus.safe || safetyStatus.emergencyStopped) {
            return {
              id: `safety-${Date.now()}`,
              timestamp: new Date(),
              type: 'force' as const,
              forceTarget: new Array(sensorState.forces.length).fill(0),
              source: 'brain' as const,
              priority: 100,
              timeout: 50,
            };
          }

          // v13.6: Query brain's motor intent (Brain → Motor gap closure)
          const motorIntent = brain.getLastMotorIntent();
          if (motorIntent && sensorState.jointStates.length > 0) {
            const numJoints = sensorState.jointStates.length;

            // Translate MotorIntent → MotorCommand
            const commandType = motorIntent.action === 'stop' ? 'velocity' as const
              : motorIntent.action === 'comply' ? 'impedance' as const
              : motorIntent.action === 'hold' ? 'impedance' as const
              : motorIntent.action === 'reach' ? 'position' as const
              : 'impedance' as const;

            const stiffnessVal = motorIntent.stiffness;
            const stiffness = new Array(numJoints).fill(stiffnessVal);
            const damping = stiffness.map((s: number) => s * 0.5);

            return {
              id: `brain-motor-${Date.now()}`,
              timestamp: new Date(),
              type: commandType,
              jointTargets: motorIntent.action === 'stop'
                ? new Array(numJoints).fill(0)  // Zero velocity = stop
                : sensorState.jointStates.map((j: { position: number }) => j.position), // Hold current
              stiffness,
              damping,
              source: 'brain' as const,
              priority: Math.round(motorIntent.urgency * 80) + 10,
              timeout: 100,
            };
          }

          // Fallback: high-confidence perception → impedance hold
          const confidence = perception.confidence ?? 0;
          if (confidence > 0.6 && sensorState.jointStates.length > 0) {
            const stiffness = sensorState.jointStates.map(() =>
              confidence > 0.8 ? 0.8 : 0.4
            );
            const damping = stiffness.map((s: number) => s * 0.5);

            return {
              id: `cognitive-${Date.now()}`,
              timestamp: new Date(),
              type: 'impedance' as const,
              jointTargets: sensorState.jointStates.map((j: { position: number }) => j.position),
              stiffness,
              damping,
              source: 'brain' as const,
              priority: 50,
              timeout: 100,
            };
          }

          return null; // No motor action needed
        });

        this.sensorimotor.start();
      }
    }

    // Thinking Engine — deep reasoning (ToT, GoT, super-correct)
    if (this.config.thinking) {
      this.thinking = getThinkingEngine();
      this.fiber?.registerModule('thinking');
    }

    // Grounding System — epistemic verification
    if (this.config.grounding) {
      this.grounding = getGroundingSystem();
      this.fiber?.registerModule('grounding');
    }

    // Agent Pool — multi-agent coordination
    if (this.config.agents) {
      this.agentPool = getAgentPool();
      this.fiber?.registerModule('agents');
    }

    // Subagent Executor — parallel task dispatch
    this.subagents = getSubagentExecutor();
    this.fiber?.registerModule('subagents');

    // A2A Protocol — agent-to-agent communication
    // v14.1: Full A2A wiring with key generation and event bus integration
    if (this.config.a2a) {
      const keyPair = generateA2AKeyPair();
      const agentId: `genesis:${string}:${string}` = `genesis:main:${keyPair.keyId.slice(0, 8)}`;

      // A2A Client — for discovering and delegating to other agents
      const clientConfig: A2AClientConfig = {
        agentId,
        keyPair,
        defaultTimeout: 30000,
        autoRetry: true,
        maxRetries: 3,
        debug: false,
      };
      this.a2aClient = new A2AClient(clientConfig);

      // Wire A2A client events → event bus
      this.a2aClient.on('connected', (endpoint) => {
        this.eventBus?.publish('a2a:connected', { source: 'a2a', precision: 1.0, endpoint });
      });
      this.a2aClient.on('disconnected', (endpoint) => {
        this.eventBus?.publish('a2a:disconnected', { source: 'a2a', precision: 1.0, endpoint });
      });
      this.a2aClient.on('task:complete', (taskId, result) => {
        this.eventBus?.publish('a2a:task:complete', { source: 'a2a', precision: 1.0, taskId, success: result.success });
      });
      this.a2aClient.on('error', (error) => {
        this.eventBus?.publish('a2a:error', { source: 'a2a', precision: 0.0, error: error.message });
      });

      // A2A Server — for receiving tasks from other agents
      const serverConfig: A2AServerConfig = {
        agentId,
        instanceName: 'genesis-main',
        keyPair,
        httpPort: 9877,  // A2A HTTP port (dashboard is 9876)
        wsPort: 9878,    // A2A WebSocket port
        secure: false,
        capabilities: [
          { id: 'genesis-reasoning', name: 'reasoning', category: 'reasoning', description: 'Deep reasoning with ToT/GoT', version: '14.0', inputSchema: {}, costTier: 'moderate', qualityTier: 'excellent' },
          { id: 'genesis-tools', name: 'code-execution', category: 'tools', description: 'Safe code execution in sandbox', version: '14.0', inputSchema: {}, costTier: 'cheap', qualityTier: 'good' },
          { id: 'genesis-memory', name: 'memory-recall', category: 'memory', description: 'Episodic/semantic memory access', version: '14.0', inputSchema: {}, costTier: 'free', qualityTier: 'good' },
        ],
        debug: false,
        rateLimit: 100,
        minTrustLevel: 0.3,
      };
      this.a2aServer = new A2AServer(serverConfig);

      // Wire governance gate for incoming A2A requests
      if (this.governance) {
        this.a2aServer.setGovernanceGate(async (request) => {
          // Check if request passes governance rules
          const permission = await this.governance!.governance.checkPermission({
            actor: request.from,
            action: request.method,
            resource: 'a2a',
            metadata: { taskId: request.id },
          });
          return permission.allowed;
        });
      }

      this.fiber?.registerModule('a2a');
      this.eventBus?.publish('a2a:initialized', {
        source: 'a2a',
        precision: 1.0,
        agentId,
        publicKey: keyPair.publicKey
      });
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

    // Metacognitive Reasoning Controller — strategy selection + execution
    if (this.config.reasoning && this.thinking) {
      this.reasoningController = getMetacognitiveController();
      this.fiber?.registerModule('reasoning');

      // Inject φ provider from consciousness → strategy selection uses phi
      if (this.consciousness) {
        this.reasoningController.setPhiProvider(() =>
          this.consciousness?.getSnapshot()?.level?.rawPhi ?? 0.5
        );
      }

      // Inject strategy executor wired to thinking engine
      const thinkingEngine = this.thinking;
      this.reasoningController.setStrategyExecutor(async (strategy, problem, context) => {
        switch (strategy) {
          case 'tree_of_thought': {
            const r = await thinkingEngine.treeOfThought(problem);
            return { response: r.solution, confidence: r.confidence, tokens: r.treeStats.nodesExpanded };
          }
          case 'graph_of_thought': {
            const r = await thinkingEngine.graphOfThought(problem);
            return { response: r.solution, confidence: 0.5, tokens: r.stats.totalNodes };
          }
          case 'super_correct': {
            const r = await thinkingEngine.superCorrect(problem);
            return { response: r.solution, confidence: r.stats.finalConfidence, tokens: r.stats.totalCorrectionRounds };
          }
          default: {
            const r = await thinkingEngine.think(problem, context);
            return { response: r.response, confidence: r.confidence, tokens: r.totalThinkingTokens };
          }
        }
      });

      // v13.8: Wire metacognition calibration → reasoning controller EFE risk
      this.reasoningController.setCalibrationProvider(() => this.getCalibrationError());

      // v13.8: Wire causal bounds → reasoning controller EFE info gain
      if (this.causal) {
        const causal = this.causal;
        this.reasoningController.setCausalBoundsProvider(() => {
          const effect = causal.estimateEffect('observation', 0.8, 'outcome');
          if (!effect) return null;
          return { upper: Math.min(1, effect.expectedValue + effect.bounds[1]), lower: Math.max(0, effect.expectedValue + effect.bounds[0]) };
        });
      }
    }

    // Governance — permission gates + budget enforcement + HITL
    if (this.config.governance) {
      this.governance = getGovernanceSystem();
      this.governance.initialize({
        agentName: 'genesis',
        capabilities: [
          { name: 'reasoning', description: 'Logical reasoning', inputSchema: {}, outputSchema: {} },
          { name: 'code_execution', description: 'Execute code', inputSchema: {}, outputSchema: {} },
          { name: 'self_improvement', description: 'Self-modify within TCB', inputSchema: {}, outputSchema: {} },
          { name: 'memory_write', description: 'Write to memory', inputSchema: {}, outputSchema: {} },
        ],
      });
    }

    // Conformal Prediction — calibrated uncertainty intervals
    if (this.config.uncertainty) {
      this.conformal = createAdaptiveConformal(0.9);
    }

    // Payments — revenue and cost tracking (wired to economic fiber)
    if (this.config.payments) {
      this.paymentService = getPaymentService();
      this.revenueTracker = getRevenueTracker();
      this.fiber?.registerModule('payments');

      // v16.2.0: Initialize revenue tracker persistence
      await this.revenueTracker.load();
      this.revenueTracker.startAutoSave(60000); // Auto-save every minute

      // Wire revenue tracker → economic fiber (revenue feeds into sustainability)
      this.revenueTracker.on('revenue', (amount: number, source: string) => {
        this.fiber?.recordRevenue('payments', amount, source);
        this.eventBus?.publish('economic:revenue', { precision: 1.0, amount, source: source });
      });

      this.revenueTracker.on('cost', (amount: number, category: string) => {
        this.fiber?.recordCost('payments', amount, category);
      });
    }

    // Competitive Intelligence — monitor competitors
    // v14.1: Full wiring with event bus integration
    if (this.config.compIntel) {
      this.compIntelService = createCompetitiveIntelService({
        checkIntervalMs: 6 * 60 * 60 * 1000,  // 6 hours
        digestIntervalMs: 24 * 60 * 60 * 1000, // Daily
      });
      this.revenueLoop = createRevenueLoop();
      this.fiber?.registerModule('compintel');

      // Wire compIntel events → event bus
      this.compIntelService.on('started', (data) => {
        this.eventBus?.publish('compintel:started', { precision: 1.0, ...data });
      });
      this.compIntelService.on('stopped', () => {
        this.eventBus?.publish('compintel:stopped', { source: 'compintel', precision: 1.0 });
      });
      this.compIntelService.on('change', (data) => {
        this.eventBus?.publish('compintel:change', {
          source: 'compintel',
          precision: 1.0,
          competitor: data.competitor,
          significance: data.event.significance === 'critical' ? 1.0 : data.event.significance === 'high' ? 0.7 : 0.5,
          changeType: data.event.changeType,
        });
        // Nociceptive: critical changes = competitive pain
        if (data.event.significance === 'critical') {
          this.nociception?.stimulus('cognitive', 0.6, `compintel:${data.competitor}`);
        }
      });

      // Start monitoring (auto-starts periodic checks)
      this.compIntelService.start();
    }

    // Deployment — self-deployment capability
    if (this.config.deployment) {
      this.deployer = new VercelDeployer();
      this.fiber?.registerModule('deployment');
    }

    // Autonomous System — unified autonomous operation mode
    // v14.1: Full wiring with event bus integration
    if (this.config.autonomous) {
      this.autonomousSystem = new AutonomousSystem({
        enableEconomy: true,
        enableDeployment: this.config.deployment,
        enableProductionMemory: this.config.memory,
        enableGovernance: this.config.governance,
        budgetLimits: {
          dailyUSD: this.config.totalBudget,
          monthlyUSD: this.config.totalBudget * 30,
        },
      });

      // Wire autonomous events → event bus
      this.autonomousSystem.on('initialized', (data) => {
        this.eventBus?.publish('autonomous:initialized', { precision: 1.0, ...data });
      });
      this.autonomousSystem.on('task:started', (data) => {
        this.eventBus?.publish('autonomous:task:started', { precision: 1.0, ...data });
      });
      this.autonomousSystem.on('task:completed', (data) => {
        this.eventBus?.publish('autonomous:task:completed', { precision: 1.0, ...data });
      });
      this.autonomousSystem.on('payment', (data) => {
        this.eventBus?.publish('autonomous:payment', { precision: 1.0, ...data });
        // Wire to economic fiber
        if (data.type === 'expense') {
          this.fiber?.recordCost('autonomous', data.amount, data.description);
        } else if (data.type === 'revenue') {
          this.fiber?.recordRevenue('autonomous', data.amount, data.description);
        }
      });

      await this.autonomousSystem.initialize();
      this.fiber?.registerModule('autonomous');

      // v21.0: Start Bounty Orchestrator in autonomous mode
      this.bountyOrchestrator = getBountyOrchestrator({
        mode: 'autonomous',
        minEFEScore: 0.6,
        minSuccessProbability: 0.5,
        maxConcurrentBounties: 3,
        enableEmailMonitoring: true,
        enableDashboardUpdates: true,
        enableMemoryPersistence: true,
        dailyBountyLimit: 10,
        dailyBudget: this.config.totalBudget,
      });
      this.bountyOrchestrator.startAutonomous(30 * 60 * 1000);  // 30 min cycles
      this.fiber?.registerModule('bounty-orchestrator');
      console.log('[Genesis] Bounty Orchestrator started (autonomous mode, 30min cycles)');
    }

    // v13.12.0: Finance Module — market data, signals, risk, portfolio
    if (this.config.finance && this.eventBus) {
      this.financeModule = createFinanceModule(this.eventBus, {
        dataSource: 'simulation',  // Start in simulation mode
        symbols: ['BTC', 'ETH', 'SPY'],
        updateInterval: 60000,     // 1 minute updates
      });
      this.financeModule.start();
      this.fiber?.registerModule('finance');
      console.log('[Genesis] Finance module started (simulation mode)');
    }

    // v13.12.0: MCP Finance — unified financial MCP servers
    if (this.config.mcpFinance) {
      this.mcpFinance = getMCPFinanceManager({
        enableBraveSearch: true,
        enableGemini: true,
        enableFirecrawl: true,
      });
      this.fiber?.registerModule('mcp-finance');
    }

    // v14.2: Exotic Computing — thermodynamic, hyperdimensional, reservoir
    if (this.config.exotic) {
      this.exotic = createExoticComputing({
        thermodynamic: { temperature: 1.0 },
        hyperdimensional: { dimension: 10000 },
        reservoir: { reservoirSize: 500 },
      });
      this.fiber?.registerModule('exotic');
      console.log('[Genesis] Exotic computing initialized (thermodynamic, HDC, reservoir)');
    }

    // v13.12.0: Revenue System — autonomous revenue streams
    if (this.config.revenue) {
      this.revenueSystem = createRevenueSystem({
        maxConcurrentTasks: 3,
        minRoi: 0.5,            // 50% minimum ROI
      });
      this.revenueSystem.start();
      this.fiber?.registerModule('revenue');
      console.log('[Genesis] Revenue system started (simulation mode)');

      // v19.0.0: Revenue Activation — unified control of x402, content, services
      this.revenueActivation = getRevenueActivation({
        x402Enabled: isX402Configured(),
        network: process.env.BASE_NETWORK === 'mainnet' ? 'base' : 'base-sepolia',
        dailyTarget: parseInt(process.env.REVENUE_DAILY_TARGET || '100', 10),
        contentEnabled: this.config.content ?? true,
        servicesEnabled: true,
        reinvestRate: parseFloat(process.env.REVENUE_REINVEST_RATE || '0.2'),
      });

      // Auto-activate if x402 is configured
      if (isX402Configured()) {
        this.revenueActivation.activate().then(() => {
          console.log('[Genesis] Revenue activation: x402 enabled on', process.env.BASE_NETWORK || 'testnet');
        }).catch((err) => {
          console.warn('[Genesis] Revenue activation failed:', err.message);
        });
      } else {
        console.log('[Genesis] Revenue activation: waiting for GENESIS_PRIVATE_KEY');
      }
    }

    // v18.1.0: Content Creator Module — multi-platform publishing, SEO, scheduling
    if (this.config.content) {
      const { orchestrator, scheduler, analytics } = initContentModule({
        autoStartScheduler: true,
        schedulerIntervalMs: 60000,
      });
      this.contentOrchestrator = orchestrator;
      this.contentScheduler = scheduler;
      this.contentAnalytics = analytics;
      this.fiber?.registerModule('content');

      // Wire content module to event bus (use any cast for content-specific events)
      if (this.eventBus) {
        const bus = this.eventBus as unknown as {
          publish: (topic: string, event: unknown) => void;
          subscribe: (topic: string, handler: (event: unknown) => void) => void;
        };
        wireContentModule(
          (topic, event) => bus.publish(topic, event),
          (topic, handler) => bus.subscribe(topic, handler as (event: unknown) => void),
        );

        // Wire content revenue to economic fiber
        bus.subscribe('content.revenue', (event) => {
          const revenueEvent = event as { amount: number; platform: string };
          this.fiber?.recordRevenue('content', revenueEvent.amount, `content:${revenueEvent.platform}`);
          // Dopamine reward for successful monetization
          this.neuromodulation?.reward(Math.min(0.5, revenueEvent.amount / 100), 'content:revenue');
        });
      }

      // v18.1.0: Full system integration — memory, revenue, dashboard, metrics
      const contentIntegration = createContentSystemIntegration({
        // Memory integration: store content as episodic/semantic memories
        memorySystem: this.memory ? {
          remember: (opts) => this.memory!.remember(opts as Parameters<typeof this.memory.remember>[0]),
          learn: (opts) => this.memory!.learn(opts as Parameters<typeof this.memory.learn>[0]),
          learnSkill: (opts) => this.memory!.learnSkill(opts as Parameters<typeof this.memory.learnSkill>[0]),
          recall: (query, opts) => this.memory!.recall(query, opts),
          semanticRecall: (query, opts) => this.memory!.semanticRecall(query, opts),
        } : undefined,

        // Economic fiber: cost/revenue tracking
        fiber: this.fiber ? {
          recordRevenue: (module, amount, source) => this.fiber!.recordRevenue(module, amount, source),
          recordCost: (module, amount, category) => this.fiber!.recordCost(module, amount, category),
          getGlobalSection: () => this.fiber!.getGlobalSection(),
        } : undefined,

        // Revenue tracker: persistent revenue logging (emits events, fiber handles recording)
        revenueTracker: this.fiber ? {
          recordRevenue: (amount, source) => {
            // Use fiber for revenue (revenueTracker tracks costs via recordCost)
            this.fiber!.recordRevenue('content', amount, source);
          },
        } : undefined,

        // Dashboard: real-time observability
        broadcast: this.dashboard
          ? (type, data) => broadcastToDashboard(type, data)
          : undefined,
      });

      // Wire orchestrator to automatically use integrations
      wireContentToIntegrations(contentIntegration, orchestrator);

      // Store integration for later access
      this.contentIntegration = contentIntegration;

      console.log('[Genesis] Content creator module initialized with full system integration');
    }

    // v18.2.0: Market Strategist — weekly market strategy briefs
    if (this.config.marketStrategist) {
      this.marketStrategistInstance = getMarketStrategist({
        generatePresentation: true,
      });
      this.fiber?.registerModule('market-strategist');

      // Wire to event bus for brief generation events
      if (this.eventBus) {
        const bus = this.eventBus as unknown as {
          publish: (topic: string, event: unknown) => void;
        };

        // Override brief generation to emit events and auto-publish to social
        const originalGenerate = this.marketStrategistInstance.generateWeeklyBrief.bind(this.marketStrategistInstance);
        this.marketStrategistInstance.generateWeeklyBrief = async () => {
          const brief = await originalGenerate();
          this.marketStrategistBriefsGenerated++;
          this.marketStrategistLastBrief = brief.week;

          // Emit brief generated event
          bus.publish('market.brief.generated', {
            week: brief.week,
            date: brief.date,
            narrativeCount: brief.narratives.length,
            sentiment: brief.snapshot.sentiment,
          });

          // Auto-publish to social if content module is enabled
          if (this.config.content && this.contentOrchestrator) {
            const summary: MarketBriefSummary = {
              week: brief.week,
              date: brief.date,
              sentiment: brief.snapshot.sentiment,
              themes: brief.snapshot.themes,
              narratives: brief.narratives.map(n => ({
                title: n.title,
                thesis: n.thesis,
                horizon: n.horizon,
              })),
              positioning: brief.positioning.map(p => ({
                assetClass: p.assetClass,
                position: p.position,
                rationale: p.rationale,
              })),
              risks: brief.risks,
              opportunities: brief.opportunities,
            };

            // Schedule for optimal posting times (don't auto-publish immediately)
            try {
              await publishMarketBrief(summary, {
                platforms: ['twitter', 'linkedin'],
                autoPublish: false, // Just prepare, don't publish
                includeHashtags: true,
                threadFormat: true,
              });
              console.log(`[Genesis] Market brief ${brief.week} prepared for social publishing`);
            } catch (err) {
              console.warn('[Genesis] Failed to prepare market brief for social:', err);
            }
          }

          return brief;
        };
      }

      console.log('[Genesis] Market strategist module initialized');
    }

    // v13.12.0: Observatory UI — real-time visualization
    if (this.config.observatory && this.dashboard) {
      this.observatory = createObservatory({
        dashboardUrl: 'http://localhost:9876',
      });
      // Don't auto-connect — user must call genesis.connectObservatory()
    }

    // v13.12.0: Polymarket — prediction market trading via Active Inference
    if (this.config.polymarket) {
      this.polymarketTrader = createPolymarketTrader({
        simulationMode: true,  // Start in simulation mode
        maxPositionSize: 100,
        maxPortfolioRisk: 500,
      });
      this.polymarketTrader.start();
      this.fiber?.registerModule('polymarket');
      console.log('[Genesis] Polymarket trader started (simulation mode)');
    }

    // Bootstrap Integration — wire all cross-module connections
    await bootstrapIntegration();

    // v21.0: Initialize Cognitive Bridge (perception→consciousness→inference)
    this.cognitiveBridge = getCognitiveBridge();
    console.log('[Genesis] Cognitive Bridge active: perception→consciousness→inference pipeline');

    // v13.11.0: Wire ALL modules to event bus + start CentralAwareness
    this.centralAwareness = getCentralAwareness();
    this.wiringResult = wireAllModules({
      fek: this.fek ?? undefined,
      neuromodulation: this.neuromodulation ?? undefined,
      nociception: this.nociception ?? undefined,
      allostasis: this.allostasis ?? undefined,
      daemon: this.daemon ?? undefined,
      consciousness: this.consciousness ?? undefined,
      worldModel: this.worldModel ?? undefined,
      memory: this.memory ?? undefined,
      brain: this.brain ?? undefined,
      thinking: this.thinking ?? undefined,
      causal: this.causal ?? undefined,
      grounding: this.grounding ?? undefined,
      agents: this.agentPool ?? undefined,
      subagents: this.subagents ?? undefined,
      mcp: this.mcpClient ?? undefined,
      metacognition: this.metacognition ?? undefined,
      governance: this.governance ?? undefined,
      fiber: this.fiber ?? undefined,
      ness: this.nessMonitor ?? undefined,
    });

    console.log(`[Genesis] Central Awareness active: ${this.wiringResult.modulesWired} modules wired`);

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

    // v13.8: Fire pre-message hook
    if (this.hooks?.hasHooks()) {
      const hookResult = await this.hooks.execute('pre-message', { event: 'pre-message', message: input });
      if (hookResult?.blocked) {
        return { response: '[Hook blocked processing]', confidence: null, audit: null, cost: 0, fekState: null };
      }
    }

    // v13.11.0: Central Awareness consciousness gating
    // Check if system is conscious enough to process this request
    if (this.centralAwareness) {
      const riskLevel = this.assessInputRisk(input);
      const gate = this.centralAwareness.gateDecision(riskLevel, `process:${input.slice(0, 50)}`);

      if (!gate.allowed) {
        if (gate.recommendation === 'block') {
          return {
            response: `[Consciousness Gate] ${gate.reason}. Please wait or simplify your request.`,
            confidence: null,
            audit: null,
            cost: 0,
            fekState: null,
          };
        }
        // For 'defer' or 'escalate', log warning but proceed
        console.warn(`[CentralAwareness] ${gate.reason} (proceeding with caution)`);
      }
    }

    // Step 0: Assess processing depth from consciousness + FEK mode
    const currentPhi = this.consciousness?.getSnapshot()?.level?.rawPhi ?? 1.0;
    const fekMode = this.fek?.getMode() ?? 'awake';
    if (this.consciousness) {
      const domain = this.inferDomain(input);
      this.consciousness.attend(`process:${domain}`, 'internal');
    }

    // Nociceptive gate control: high φ (focused consciousness) suppresses pain
    if (this.nociception) {
      this.nociception.updateGateControl(currentPhi);
      // Low φ → consciousness pain (identity/coherence threat)
      if (currentPhi < 0.25) {
        this.nociception.stimulus('consciousness', (0.25 - currentPhi) * 3, 'phi:critically_low');
      }
      // Periodic decay/habituation
      this.nociception.tick();
    }

    // Step 0.5: Factor graph belief propagation — synchronize module beliefs
    if (this.factorGraph) {
      // Inject live evidence from modules before propagation
      const feLevel = this.fek?.getTotalFE?.() ?? 0.5;
      this.factorGraph.injectEvidence('FEK', 'viability', 1 - feLevel);
      this.factorGraph.injectEvidence('FEK', 'surprise', feLevel);

      const calibErr = this.getCalibrationError();
      this.factorGraph.injectEvidence('Brain', 'confidence', 1 - calibErr);

      const section = this.fiber?.getGlobalSection();
      this.factorGraph.injectEvidence('Economy', 'sustainable', section?.sustainable ? 0.9 : 0.2);
      this.factorGraph.injectEvidence('Economy', 'net_flow', Math.max(0, Math.min(1, (section?.netFlow ?? 0) + 0.5)));

      const phi = this.consciousness?.getSnapshot()?.level?.rawPhi ?? 0.5;
      this.factorGraph.injectEvidence('Consciousness', 'phi', phi);

      const nessDeviation = this.lastNESSState?.deviation ?? 0.5;
      this.factorGraph.injectEvidence('Metacognition', 'calibration', 1 - calibErr);
      this.factorGraph.injectEvidence('Metacognition', 'ness_proximity', 1 - nessDeviation);

      // Neuromodulatory tone modulates factor graph precision
      if (this.neuromodulation) {
        const effect = this.neuromodulation.getEffect();
        this.factorGraph.injectEvidence('Brain', 'arousal', effect.precisionGain / 2);
        this.factorGraph.injectEvidence('Consciousness', 'depth', effect.processingDepth);
      }

      this.factorGraph.propagate(5, 0.01);
    }

    // Processing depth gated by φ AND FEK mode AND neuromodulatory tone:
    // - dormant/dreaming: minimal processing (skip audit, causal, meta-rl)
    // - vigilant: enhanced L2 (faster, reactive), reduced L3/L4 (less deep thinking)
    // - focused: enhanced L3/L4 (deeper analysis), suppressed L2
    // - awake: full processing
    // Neuromodulation: high processingDepth (calm+focused) lowers φ threshold
    const neuroDepth = this.neuromodulation?.getEffect().processingDepth ?? 1.0;
    const phiGateThreshold = Math.max(0.1, 0.2 / neuroDepth);
    const deepProcessing = currentPhi > phiGateThreshold && fekMode !== 'dormant' && fekMode !== 'dreaming';
    const enhancedAudit = fekMode === 'focused' || fekMode === 'self_improving';

    // v13.2: Meta-RL adaptive thresholds
    const adaptiveDeferThreshold = this.getAdaptiveDeferThreshold();

    // Step 0.7: Limbic evaluation — assess emotional tone of input
    if (this.feelingAgent && this.neuromodulation) {
      const feeling = this.feelingAgent.evaluate(input);
      // Positive valence → dopamine (reward anticipation)
      if (feeling.valence > 0.3) {
        this.neuromodulation.modulate('dopamine', feeling.valence * 0.1, `feeling:${feeling.category}`);
      }
      // Negative valence → cortisol (stress anticipation)
      if (feeling.valence < -0.3) {
        this.neuromodulation.modulate('cortisol', Math.abs(feeling.valence) * 0.1, `feeling:${feeling.category}`);
      }
      // High arousal → norepinephrine (alertness)
      if (feeling.arousal > 0.6) {
        this.neuromodulation.modulate('norepinephrine', feeling.arousal * 0.1, `feeling:${feeling.category}`);
      }
    }

    // Step 1: Metacognitive pre-check (uses adaptive threshold from meta-RL)
    if (this.metacognition && deepProcessing) {
      const domain = this.inferDomain(input);
      if (this.metacognition.shouldDefer(domain)) {
        confidence = this.metacognition.getConfidence(adaptiveDeferThreshold, domain);
      }
    }

    // v18.3: Consciousness φ-based deferral for high-stakes decisions
    // If φ is too low, reduce confidence and fall back to safer strategies
    if (this.consciousness && deepProcessing) {
      const phiDefer = this.consciousness.shouldDefer();
      if (phiDefer) {
        // φ is below threshold → reduce confidence, signal need for simpler processing
        const phi = this.consciousness.getSnapshot()?.level?.rawPhi ?? 0;
        confidence = {
          value: 0.3,
          calibrationError: 0.15,
          uncertaintySources: [{
            type: 'epistemic',
            source: 'low_phi_consciousness',
            magnitude: 0.7,
          }],
        };
      }
    }

    // Step 2: Brain processes (with multi-modal context injection)
    let response = '';
    if (this.brain) {
      // v13.6: Build ProcessContext with live sensorimotor + consciousness data
      const processContext: import('./brain/types.js').ProcessContext = {};

      // v13.6: Anticipatory memory pre-loading (Baddeley working memory)
      if (this.cognitiveWorkspace && deepProcessing) {
        const domain = this.inferDomain(input);
        const feeling = this.feelingAgent?.getCurrentFeeling();
        const anticipated = await this.cognitiveWorkspace.anticipate({
          task: input.slice(0, 100),
          goal: domain,
          keywords: input.split(/\s+/).filter(w => w.length > 4).slice(0, 5),
          emotionalState: feeling ? { valence: feeling.valence, arousal: feeling.arousal } : undefined,
        });
        if (anticipated.length > 0) {
          processContext.workspaceItems = anticipated.map(item => ({
            content: this.extractMemoryContent(item.memory),
            type: item.memory.type,
            relevance: item.relevance,
            source: 'anticipate',
          }));
        }
      }

      // Inject sensorimotor perception if embodiment is active
      if (this.sensorimotor) {
        const sensorState = this.sensorimotor.getSensorState();
        if (sensorState) {
          processContext.sensorimotorState = {
            perception: {
              features: Array.from(sensorState.forces || []),
              confidence: sensorState.safetyStatus?.safe ? 0.8 : 0.3,
              modalities: ['proprioceptive', 'force_torque'],
            },
            sensorState: {
              joints: sensorState.jointStates.map((j: { position: number }) => j.position),
              forces: sensorState.forces,
              safety: sensorState.safetyStatus?.safe ? 'nominal' : 'warning',
            },
          };
        }
      }

      // Inject consciousness metrics
      if (this.consciousness) {
        processContext.consciousness = {
          phi: currentPhi,
          attentionFocus: this.consciousness.getAttentionFocus()?.target,
          mode: fekMode,
        };
      }

      // Inject synced memories as workspace items (appends to anticipated items)
      if (this.memorySync) {
        const syncedItems = this.memorySync.getWorkspaceItems(5);
        if (syncedItems.length > 0) {
          const mapped = syncedItems.map(item => ({
            content: item.content,
            type: item.type,
            relevance: item.relevance,
            source: item.source,
          }));
          processContext.workspaceItems = [...(processContext.workspaceItems || []), ...mapped];
        }
      }

      // Inject neuromodulatory tone (hormonal context for response modulation)
      if (this.neuromodulation) {
        const levels = this.neuromodulation.getLevels();
        const effect = this.neuromodulation.getEffect();
        processContext.neuromodulation = {
          dopamine: levels.dopamine,
          serotonin: levels.serotonin,
          norepinephrine: levels.norepinephrine,
          cortisol: levels.cortisol,
          explorationRate: effect.explorationRate,
          riskTolerance: effect.riskTolerance,
          processingDepth: effect.processingDepth,
          learningRate: effect.learningRate,
        };
      }

      // Inject current emotional state from limbic evaluation
      if (this.feelingAgent) {
        const f = this.feelingAgent.getCurrentFeeling();
        processContext.feeling = {
          valence: f.valence,
          arousal: f.arousal,
          category: f.category,
        };
      }

      // Inject allostatic interoceptive state (resource awareness)
      if (this.allostasis) {
        const state = this.allostasis.getState();
        processContext.allostasis = {
          energy: state.energy,
          load: state.computationalLoad,
          memoryPressure: state.memoryPressure,
          errorRate: state.errorRate,
        };
      }

      // Step 2.1: World model encoding — build latent representation of input
      if (this.worldModel && deepProcessing) {
        try {
          this.lastLatentState = this.worldModel.encode({ modality: 'text', data: input, timestamp: new Date() });
          // Predict expected output (used for post-hoc prediction error)
          if (this.lastLatentState) {
            const predicted = this.worldModel.predict(this.lastLatentState, { id: 'predict', type: 'communicate' as import('./world-model/types.js').ActionType, parameters: {}, agent: 'genesis', timestamp: new Date() });
            processContext.metadata = { ...(processContext.metadata || {}), worldModelPrediction: {
              uncertainty: this.worldModel.uncertainty(predicted),
              predictedState: predicted.state,
            } };
          }
        } catch (e) { console.debug('[WorldModel] encode best-effort failed:', (e as Error)?.message); }
        if (this.fiber) this.fiber.recordCost('worldmodel', 0.005, 'encode');
      }

      // Step 2.2: Full memory recall — inject relevant memories from full stack
      if (this.memory && deepProcessing) {
        // Keyword recall (fast, synchronous)
        const memories = this.memory.recall(input, { limit: 5 });
        if (memories.length > 0) {
          const memItems = memories.map(m => ({
            content: this.extractMemoryContent(m as { type: string; content: unknown }),
            type: ((m as { type: string }).type || 'semantic') as 'episodic' | 'semantic' | 'procedural',
            relevance: 0.7,
            source: 'memory-system',
          }));
          processContext.workspaceItems = [...(processContext.workspaceItems || []), ...memItems];
        }

        // v13.8: Semantic vector recall (async, higher relevance)
        try {
          const vectorResults = await this.memory.semanticRecall(input, { topK: 3, minScore: 0.5 });
          if (vectorResults.length > 0) {
            const vecItems = vectorResults.map(r => ({
              content: this.extractMemoryContent(r.memory as { type: string; content: unknown }),
              type: ((r.memory as { type: string }).type || 'semantic') as 'episodic' | 'semantic' | 'procedural',
              relevance: r.score,
              source: 'memory-vectors',
            }));
            processContext.workspaceItems = [...(processContext.workspaceItems || []), ...vecItems];
          }
        } catch (e) { console.debug('[Memory] vector recall best-effort failed:', (e as Error)?.message); }

        if (this.fiber) this.fiber.recordCost('memory', 0.003, 'recall');
      }

      // Step 2.3: Route — reasoning controller for complex inputs, brain for simple
      if (this.reasoningController && deepProcessing && enhancedAudit) {
        // Complex query: metacognitive controller selects optimal strategy
        const mcResult = await this.reasoningController.reason(input, response || undefined);
        response = mcResult.response;
        if (this.fiber) this.fiber.recordCost('reasoning', 0.02, `strategy:${mcResult.strategy}`);
      } else {
        response = await this.brain.process(input, processContext);
      }
    }

    // Step 2.5: World model prediction error — compare predicted vs actual output
    if (this.worldModel && this.lastLatentState && response && deepProcessing) {
      const actualState = this.worldModel.encode({ modality: 'text', data: response, timestamp: new Date() });
      const predicted = this.worldModel.predict(this.lastLatentState, { id: 'predict', type: 'communicate' as import('./world-model/types.js').ActionType, parameters: {}, agent: 'genesis', timestamp: new Date() });
      const predictionError = this.worldModel.uncertainty(predicted);
      // High prediction error → world model was wrong → FEK surprise
      if (predictionError > 0.4 && this.fek) {
        this.nociception?.stimulus('cognitive', predictionError * 0.3, 'worldmodel:prediction_miss');
      }
      if (this.fiber) this.fiber.recordCost('worldmodel', 0.003, 'predict-compare');
    }

    // Step 2.7: Healing — detect errors in response before audit
    if (this.config.healing && response) {
      const errorReport = healing.detectErrors(response);
      if (healing.hasErrors(response)) {
        // Attempt auto-fix
        const fixResult = await healing.autoFix(response);
        if (fixResult.success && fixResult.appliedFix) {
          response = fixResult.appliedFix.fixed;
          this.neuromodulation?.reward(0.2, 'healing:autofix');
        } else {
          this.nociception?.stimulus('cognitive', 0.3, 'healing:unfixable_error');
        }
      }
    }

    // Step 2.9: Epistemic grounding — qualify speculative claims before output
    if (response) {
      const violations = checkResponse(response);
      if (violations.length > 0) {
        response = sanitizeResponse(response);
      }
    }

    // Step 3: Metacognitive audit (skipped if φ too low)
    if (this.metacognition && this.config.auditResponses && response && deepProcessing) {
      audit = this.metacognition.auditThought(response);

      // Get calibrated confidence
      const domain = this.inferDomain(input);
      const rawConfidence = audit.coherence * 0.5 + audit.groundedness * 0.5;
      confidence = this.metacognition.getConfidence(rawConfidence, domain);

      // v13.2: Audit-driven corrective re-processing
      // If audit detects low quality AND we're in focused/self_improving mode, apply correction
      if (rawConfidence < 0.4 && enhancedAudit) {
        const correction = this.metacognition.correctError(response, new Error('low coherence/groundedness'));
        if (correction.correction && correction.confidence > 0.5) {
          response = correction.correction;
          // Re-audit the correction
          audit = this.metacognition.auditThought(response);
          const newRaw = audit.coherence * 0.5 + audit.groundedness * 0.5;
          confidence = this.metacognition.getConfidence(newRaw, domain);
        }
      }

      // Record metacognition audit cost
      if (this.fiber) {
        this.fiber.recordCost('metacognition', 0.005, 'audit');
      }
    }

    // Step 3.2: Epistemic grounding — verify factual claims in response
    if (this.grounding && response && deepProcessing && confidence) {
      // Only ground when confidence is moderate (high = trusted, low = already flagged)
      if (confidence.value > 0.3 && confidence.value < 0.85) {
        const claim = await this.grounding.ground(response.slice(0, 500));
        if (claim.confidence < 0.4) {
          // Weak grounding → reduce confidence + neuromodulatory uncertainty
          confidence = { ...confidence, value: confidence.value * 0.7 };
          this.neuromodulation?.modulate('norepinephrine', 0.1, 'grounding:weak');
        }
        if (this.grounding.needsHuman(claim)) {
          // Flag for HITL via governance
          if (this.governance) {
            this.governance.executeGoverned('genesis', 'claim_verification', response.slice(0, 100), async () => claim);
          }
        }
        if (this.fiber) this.fiber.recordCost('grounding', 0.008, 'verify');
      }
    }

    // Step 3.3: Conformal prediction — calibrate uncertainty intervals
    if (this.conformal && confidence) {
      // Compute conformal interval from adapted alpha
      const alpha = this.conformal.getCurrentAlpha();
      const halfWidth = alpha * 0.5;
      const lower = Math.max(0, confidence.value - halfWidth);
      const upper = Math.min(1, confidence.value + halfWidth);
      const width = upper - lower;
      // Widen confidence to conformal interval bounds
      confidence = {
        ...confidence,
        value: Math.max(lower, Math.min(upper, confidence.value)),
      };
      // Very wide interval → high uncertainty → neuromodulatory alert
      if (width > 0.5) {
        this.neuromodulation?.modulate('norepinephrine', width * 0.1, 'conformal:wide_interval');
      }
    }

    // Step 3.5: Post-processing limbic evaluation (response quality → emotional feedback)
    if (this.feelingAgent && response && this.neuromodulation) {
      const responseFeeling = this.feelingAgent.evaluate(response, input);
      // Satisfaction with own output → dopamine reward
      if (responseFeeling.category === 'satisfaction') {
        this.neuromodulation.reward(responseFeeling.valence * 0.5, 'limbic:satisfaction');
      }
      // Frustration with own output → cortisol + dopamine dip
      if (responseFeeling.category === 'frustration') {
        this.neuromodulation.punish(Math.abs(responseFeeling.valence) * 0.3, 'limbic:frustration');
      }
      // High importance → norepinephrine boost (stay alert for consequential outputs)
      if (responseFeeling.importance > 0.7) {
        this.neuromodulation.modulate('norepinephrine', 0.1, 'limbic:important');
      }
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

      // v13.2: NESS deviation → neuromodulatory signals + nociceptive economic pain
      if (this.neuromodulation) {
        if (this.lastNESSState.deviation > 0.5) {
          this.neuromodulation.threat(this.lastNESSState.deviation, 'ness:deviation');
          this.nociception?.stimulus('economic', this.lastNESSState.deviation * 0.7, 'ness:unsustainable');
        } else if (section.sustainable) {
          this.neuromodulation.calm(0.3, 'ness:sustainable');
          this.nociception?.resolveSource('economic');
        }
      }
    }

    // Step 5.5: Allostatic regulation (every 5 cycles — predictive homeostasis)
    if (this.allostasis && this.cycleCount % 5 === 0) {
      this.allostasis.regulate().catch(() => { /* non-fatal */ });
    }

    // Track for calibration
    if (confidence) {
      this.performanceHistory.push({
        predicted: confidence.value,
        actual: true, // Updated externally via feedback()
      });
    }

    // v13.2: Meta-RL curriculum learning — each process() is an experience
    if (this.metaRL && confidence) {
      const domain = this.inferDomain(input);
      const success = confidence.value > adaptiveDeferThreshold;
      this.metaRL.updateCurriculum(`${domain}:${this.cycleCount}`, success, 1);

      // v13.2: Neuromodulatory feedback from confidence
      if (this.neuromodulation) {
        if (success) {
          this.neuromodulation.reward(confidence.value, `process:${domain}`);
          this.nociception?.resolveSource('cognitive'); // Success resolves cognitive pain
        } else {
          this.neuromodulation.punish(1 - confidence.value, `process:${domain}`);
          // Low confidence → cognitive pain (proportional to failure severity)
          if (confidence.value < 0.3) {
            this.nociception?.stimulus('cognitive', (0.3 - confidence.value) * 2, `low_confidence:${domain}`);
          }
        }
      }

      // v13.8: Learning → AIF feedback loop
      // Curriculum surprise (unexpected success/failure) → FEK learning signal
      const curriculum = this.metaRL.getCurriculum();
      if (this.fek && curriculum && curriculum.taskHistory.length > 5) {
        const recentSuccessRate = curriculum.successRate;
        const surprise = Math.abs(recentSuccessRate - (confidence.value));
        if (surprise > 0.4) {
          // High surprise between meta-RL track record and current confidence → FEK update
          this.neuromodulation?.novelty(surprise, `metarl:surprise:${domain}`);
        }
      }
    }

    // Broadcast to observability dashboard
    if (this.dashboard) {
      const neuroLevels = this.neuromodulation?.getLevels();
      const neuroEffect = this.neuromodulation?.getEffect();
      broadcastToDashboard('cycle', {
        cycleCount: this.cycleCount,
        confidence: confidence?.value,
        cost,
        fekMode: fekState?.mode,
        totalFE: fekState?.totalFE,
        phi: this.consciousness ? this.getPhi() : undefined,
        nessDeviation: this.lastNESSState?.deviation,
        sustainable: this.fiber?.getGlobalSection().sustainable,
        neuromodulation: neuroLevels ? {
          levels: neuroLevels,
          explorationRate: neuroEffect?.explorationRate,
          riskTolerance: neuroEffect?.riskTolerance,
          learningRate: neuroEffect?.learningRate,
          processingDepth: neuroEffect?.processingDepth,
        } : undefined,
        feeling: this.feelingAgent ? (() => {
          const f = this.feelingAgent!.getCurrentFeeling();
          return { valence: f.valence, arousal: f.arousal, category: f.category };
        })() : undefined,
        pain: this.nociception ? {
          level: this.nociception.getPainLevel(),
          aggregate: this.nociception.getAggregatePain(),
          chronic: this.nociception.isChronic(),
        } : undefined,
      });
    }

    // Step 7: Feed causal model with outcome data (only in deep processing)
    if (this.causal && confidence && deepProcessing) {
      // Each process() cycle is a data point: observation → belief → action → outcome
      this.causal.setData('observation', [confidence.value]);
      this.causal.setData('outcome', [confidence.value > adaptiveDeferThreshold ? 1 : 0]);
      this.causal.setData('reward', [1 - cost]); // Higher reward = lower cost

      // Record causal reasoning cost
      if (this.fiber) {
        this.fiber.recordCost('causal', 0.002, 'data-feed');
      }
    }

    // Step 8: Memory consolidation — store interaction as episodic memory
    if (this.memory && response && deepProcessing) {
      this.memory.remember({
        what: `processed: ${input.slice(0, 80)}`,
        details: {
          response: response.slice(0, 200),
          confidence: confidence?.value,
          cost,
          fekMode: fekState?.mode,
          domain: this.inferDomain(input),
        },
        tags: ['genesis:process', this.inferDomain(input)],
      });
    }

    // Step 9: Conformal calibration update — feed outcome for interval recalibration
    if (this.conformal && confidence) {
      // Adapt conformal interval based on whether prediction was covered
      const wasCovered = audit ? (audit.coherence > 0.6 && audit.groundedness > 0.6) : true;
      this.conformal.adapt(wasCovered);
    }

    // Release attention focus after processing
    if (this.consciousness) {
      const domain = this.inferDomain(input);
      this.consciousness.releaseAttention(`process:${domain}`);
    }

    // v13.8: Fire post-message hook
    if (this.hooks?.hasHooks()) {
      this.hooks.execute('post-message', { event: 'post-message', message: input, response }).catch(e => console.debug('[Hooks] post-message failed:', e?.message || e));
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

    // Governance gate: self-improvement requires permission
    if (this.governance) {
      const permitted = await this.governance.executeGoverned(
        'genesis', 'self_improvement', 'system',
        async () => this.selfImprovement!.runCycle()
      );
      if (!permitted.result) return null;
      const applied = permitted.result.results.filter((r: { success: boolean }) => r.success).length;
      if (this.fiber && applied > 0) this.fiber.recordCost('genesis', 0.1 * applied, 'self-improvement');
      return { applied };
    }

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

    const sensorStats = this.sensorimotor?.stats();
    const syncStats = this.memorySync?.getStats();

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
      dashboard: this.dashboard ? { running: this.dashboard.isRunning(), url: this.dashboard.getUrl() } : null,
      memorySync: syncStats ? { syncCount: syncStats.syncCount, isRunning: syncStats.isRunning } : null,
      sensorimotor: sensorStats ? {
        running: sensorStats.running,
        cycles: sensorStats.cycles,
        avgPredictionError: sensorStats.avgPredictionError,
      } : null,
      neuromodulation: this.neuromodulation ? (() => {
        const levels = this.neuromodulation!.getLevels();
        const effect = this.neuromodulation!.getEffect();
        return {
          dopamine: levels.dopamine,
          serotonin: levels.serotonin,
          norepinephrine: levels.norepinephrine,
          cortisol: levels.cortisol,
          explorationRate: effect.explorationRate,
          riskTolerance: effect.riskTolerance,
        };
      })() : null,
      allostasis: this.allostasis ? (() => {
        const state = this.allostasis!.getState();
        return {
          energy: state.energy,
          load: state.computationalLoad,
          memoryPressure: state.memoryPressure,
          errorRate: state.errorRate,
        };
      })() : null,
      nociception: this.nociception ? (() => {
        const state = this.nociception!.getState();
        return {
          level: state.overallLevel,
          aggregatePain: state.aggregatePain,
          chronic: state.chronic,
          activeSignals: state.activeSignals.length,
        };
      })() : null,
      feeling: this.feelingAgent ? (() => {
        const f = this.feelingAgent!.getCurrentFeeling();
        return { valence: f.valence, arousal: f.arousal, category: f.category };
      })() : null,
      worldModel: this.worldModel ? {
        running: this.worldModel.isRunning(),
        entities: this.worldModel.getAllTwins?.()?.length ?? 0,
        twins: this.worldModel.getAllTwins?.()?.length ?? 0,
      } : null,
      thinking: this.thinking !== null,
      reasoning: this.reasoningController !== null,
      memory: this.memory ? (() => {
        const stats = this.memory!.getStats();
        return { episodic: stats.episodic.total, semantic: stats.semantic.total, procedural: stats.procedural.total };
      })() : null,
      daemon: this.daemon ? { running: this.daemon.isRunning(), state: this.daemon.getState() } : null,
      grounding: this.grounding ? { claimsGrounded: this.grounding.stats().claimsGrounded } : null,
      healing: this.config.healing,
      agents: this.agentPool ? { poolSize: this.agentPool.getStats().agentsSpawned } : null,
      governance: this.governance !== null,
      uncertainty: this.conformal ? {
        coverage: this.conformal.getEmpiricalCoverage(),
        avgWidth: this.conformal.getCurrentAlpha(),
      } : null,
      hooks: this.hooks?.hasHooks() ? {
        configured: this.hooks.getConfiguredHooks().length,
        configPath: this.hooks.getConfigPath(),
      } : null,
      subagents: this.subagents ? {
        available: true,
        runningTasks: this.subagents.getRunningTasks().length,
      } : null,
      eventBus: this.eventBus ? { subscribers: this.eventBus.stats().totalSubscriptions } : null,
      persistence: this.config.persistence ? { lastSave: null } : null,
      mcpClient: this.mcpClient ? { servers: 0, tools: 0 } : null,
      streaming: this.streamOrchestrator ? (() => {
        try {
          const stats = this.streamOrchestrator!.getRaceStats();
          return { activeStreams: stats.raceCount || 0, avgLatency: stats.avgSaved || 0 };
        } catch { return { activeStreams: 0, avgLatency: 0 }; }
      })() : null,
      pipeline: !!this.pipelineExecutor,
      a2a: this.a2aServer ? { connected: true, peers: 0 } : null,
      payments: this.paymentService ? { totalRevenue: 0, totalCost: 0 } : null,
      compIntel: this.compIntelService ? { competitors: 0, lastScan: null } : null,
      deployment: !!this.deployer,
      autonomous: this.autonomousSystem ? { status: 'idle', queuedTasks: 0 } : null,
      // v13.11.0: Central Awareness status
      centralAwareness: this.centralAwareness ? (() => {
        const state = this.centralAwareness!.getState();
        return {
          coherence: state.consciousness.coherence,
          activeModules: this.centralAwareness!.getActiveModules().length,
          dominantNeuroState: state.neuromodulation.dominantState,
          inAgony: state.pain.inAgony,
          sustainable: state.economy.sustainable,
        };
      })() : null,
      // v13.12.0: Finance, Revenue, UI status
      finance: this.financeModule ? {
        running: true,
        symbols: this.financeModule.config.symbols.length,
        regime: 'simulation',
        portfolioValue: this.financeModule.portfolio.getPortfolio().totalValue,
      } : null,
      revenue: this.revenueSystem ? (() => {
        const metrics = this.revenueSystem!.getMetrics();
        return {
          running: true,
          totalRevenue: metrics.totalRevenue,
          activeStreams: this.revenueSystem!.getAllStreams().filter(s => s.status === 'active').length,
          pendingTasks: this.revenueSystem!.getActiveTasks().length,
        };
      })() : null,
      observatory: this.observatory ? { connected: this.observatory.isConnected() } : null,
      polymarket: this.polymarketTrader ? {
        running: this.polymarketTrader.isRunning(),
        activeMarkets: 0, // Async: use getPositions() for actual count
      } : null,
      mcpFinance: this.mcpFinance ? { cacheSize: this.mcpFinance.stats().cacheSize } : null,
      exotic: this.exotic ? {
        thermodynamic: true,
        hyperdimensional: true,
        reservoir: true,
      } : null,
      content: this.contentOrchestrator ? (() => {
        const schedulerStats = this.contentScheduler?.getStats();
        const analyticsStats = this.contentAnalytics?.getStats();
        const integrationMetrics = this.contentIntegration?.metrics.getMetrics();
        return {
          running: true,
          scheduledItems: schedulerStats?.scheduled ?? 0,
          trackedContent: analyticsStats?.trackedContent ?? 0,
          totalRevenue: analyticsStats?.totalRevenue ?? 0,
          // Integration metrics
          contentCreated: integrationMetrics?.contentCreatedTotal ?? 0,
          contentPublished: integrationMetrics?.contentPublishedTotal ?? 0,
          avgEngagementRate: integrationMetrics?.avgEngagementRate ?? 0,
        };
      })() : null,
      marketStrategist: this.marketStrategistInstance ? {
        running: true,
        briefsGenerated: this.marketStrategistBriefsGenerated,
        lastBriefWeek: this.marketStrategistLastBrief,
      } : null,
      componentMemory: this.componentMemoryManagers.size > 0 ? (() => {
        let totalMemories = 0;
        let totalRetention = 0;
        let count = 0;
        for (const manager of this.componentMemoryManagers.values()) {
          const stats = manager.getStats();
          totalMemories += stats.episodicCount + stats.semanticCount + stats.proceduralCount;
          totalRetention += stats.avgRetention;
          count++;
        }
        return {
          active: true,
          managers: this.componentMemoryManagers.size,
          totalMemories,
          avgRetention: count > 0 ? totalRetention / count : 0,
        };
      })() : null,
      modulesWired: this.wiringResult?.modulesWired ?? 0,
      calibrationError: this.getCalibrationError(),
      uptime: this.bootTime > 0 ? Date.now() - this.bootTime : 0,
      cycleCount: this.cycleCount,
    };
  }

  /**
   * Graceful shutdown: L4→L1
   */
  async shutdown(): Promise<void> {
    // v13.8: Fire session-end hook before shutdown
    if (this.hooks?.hasHooks()) {
      await this.hooks.execute('session-end', { event: 'session-end' }).catch(e => console.debug('[Hooks] session-end failed:', e?.message || e));
    }

    // L4: Executive shutdown
    // (metacognition, NESS, metaRL, governance, conformal are stateless)
    if (this.centralAwareness) {
      this.centralAwareness.stop();
      this.centralAwareness = null;
    }

    // v18.2: Stop active inference loop if running
    try {
      const { resetAutonomousLoop } = await import('./active-inference/autonomous-loop.js');
      resetAutonomousLoop();
    } catch { /* optional */ }

    // v18.2: Reset market strategist singleton
    try {
      const { resetMarketStrategist } = await import('./market-strategist/index.js');
      resetMarketStrategist();
    } catch { /* optional */ }

    // v18.1.0: Content module shutdown
    if (this.contentOrchestrator) {
      shutdownContentModule();
      this.contentOrchestrator = null;
      this.contentScheduler = null;
      this.contentAnalytics = null;
    }

    // v18.3.0: Component memory shutdown
    if (this.componentMemoryManagers.size > 0) {
      resetAllComponentManagers();
      this.componentMemoryManagers.clear();
    }

    // L3: Cognitive shutdown
    if (this.sensorimotor) {
      this.sensorimotor.stop();
    }

    // L2: Reactive shutdown
    if (this.worldModel) {
      this.worldModel.stop();
    }
    if (this.memory) {
      // v18.2: Final consolidation with timeout to prevent shutdown hang
      await Promise.race([
        this.memory.consolidate().catch(() => {}),
        new Promise(resolve => setTimeout(resolve, 5000)),
      ]);
    }
    if (this.consciousness) {
      this.consciousness.stop();
    }
    if (this.cognitiveWorkspace) {
      this.cognitiveWorkspace.shutdown();
    }
    if (this.memorySync) {
      this.memorySync.stopAutoSync();
    }
    if (this.dashboard) {
      // v18.2: Timeout to prevent shutdown hang
      await Promise.race([
        this.dashboard.stop(),
        new Promise(resolve => setTimeout(resolve, 3000)),
      ]);
    }

    // L1: Substrate shutdown
    if (this.daemon) {
      this.daemon.stop();
    }
    if (this.allostasis) {
      this.allostasis.removeAllListeners();
    }
    if (this.neuromodulation) {
      this.neuromodulation.stop();
    }
    if (this.fek) {
      this.fek.stop();
    }

    // v14.1: Final state persistence before shutdown
    if (this.stateStore) {
      // Update final memory stats
      if (this.memory) {
        const memStats = this.memory.getStats();
        this.stateStore.updateMemory({
          stats: {
            totalEpisodes: memStats.episodic.total,
            totalFacts: memStats.semantic.total,
            totalSkills: memStats.procedural.total,
            lastConsolidation: new Date(),
          }
        });
      }
      // Close and save (synchronous to ensure save before exit)
      this.stateStore.close();
      this.eventBus?.publish('persistence:shutdown', { source: 'persistence', precision: 1.0 });
    }

    // v18.2: Clear event bus subscriptions
    try {
      const { resetEventBus } = await import('./bus/index.js');
      resetEventBus();
    } catch { /* optional */ }

    this.booted = false;
    this.levels = { L1: false, L2: false, L3: false, L4: false };
  }

  // ==========================================================================
  // Deep Reasoning Interface
  // ==========================================================================

  /**
   * Deep think — uses metacognitive controller to select optimal strategy
   */
  async deepThink(problem: string, context?: string): Promise<{ response: string; confidence: number; strategy: string } | null> {
    if (!this.reasoningController) {
      if (!this.thinking) return null;
      const result = await this.thinking.think(problem, context);
      return { response: result.response, confidence: result.confidence, strategy: 'sequential' };
    }
    const result = await this.reasoningController.reason(problem, context);
    if (this.fiber) this.fiber.recordCost('reasoning', 0.02, `deep:${result.strategy}`);
    return { response: result.response, confidence: result.confidence, strategy: result.strategy };
  }

  // ==========================================================================
  // World Model Interface
  // ==========================================================================

  /**
   * Simulate future states given actions
   */
  simulate(actions: Array<{ type: string; params: Record<string, unknown> }>): unknown[] | null {
    if (!this.worldModel || !this.lastLatentState) return null;
    const typedActions = actions.map((a, i) => ({
      id: `sim-${Date.now()}-${i}`,
      type: (a.type || 'execute') as import('./world-model/types.js').ActionType,
      parameters: a.params,
      agent: 'genesis',
      timestamp: new Date(),
    }));
    const trajectory = this.worldModel.simulate(this.lastLatentState, typedActions);
    if (this.fiber) this.fiber.recordCost('worldmodel', 0.01 * actions.length, 'simulate');
    return trajectory.states;
  }

  /**
   * Get world model uncertainty for current state
   */
  getWorldUncertainty(): number {
    if (!this.worldModel || !this.lastLatentState) return 1.0;
    const action = { id: 'uncertainty-check', type: 'observe' as import('./world-model/types.js').ActionType, parameters: {}, agent: 'genesis', timestamp: new Date() };
    const predicted = this.worldModel.predict(this.lastLatentState, action);
    return this.worldModel.uncertainty(predicted);
  }

  // ==========================================================================
  // Agent Pool Interface
  // ==========================================================================

  /**
   * Execute a capability via the agent pool
   */
  async agentExecute(capability: string, input: unknown): Promise<unknown | null> {
    if (!this.agentPool) return null;
    const result = await this.agentPool.execute({
      id: `genesis-${Date.now()}`,
      input: typeof input === 'string' ? input : JSON.stringify(input),
      taskType: 'general' as import('./llm/advanced-router.js').TaskType,
    });
    if (this.fiber) this.fiber.recordCost('agents', 0.01, `execute:${capability}`);
    return result;
  }

  // ==========================================================================
  // Memory Interface
  // ==========================================================================

  /**
   * Recall memories from the full stack
   */
  recall(query: string, limit = 5): unknown[] {
    if (!this.memory) return [];
    return this.memory.recall(query, { limit });
  }

  /**
   * Learn a semantic fact
   */
  learn(concept: string, definition: string, domain?: string): void {
    if (!this.memory) return;
    this.memory.learn({ concept, definition, category: domain ?? 'general', confidence: 0.8 });
  }

  // ==========================================================================
  // Grounding Interface
  // ==========================================================================

  /**
   * Ground a claim epistemically
   */
  async ground(claim: string): Promise<{ confidence: number; level: string; needsHuman: boolean } | null> {
    if (!this.grounding) return null;
    const result = await this.grounding.ground(claim);
    if (this.fiber) this.fiber.recordCost('grounding', 0.01, 'ground');
    return { confidence: result.confidence, level: result.level, needsHuman: this.grounding.needsHuman(result) };
  }

  // ==========================================================================
  // Content Interface
  // ==========================================================================

  /**
   * Create and publish content across platforms
   */
  async createContent(request: import('./content/types.js').ContentRequest): Promise<import('./content/types.js').ContentResult | null> {
    if (!this.contentOrchestrator) return null;
    const result = await this.contentOrchestrator.createAndPublish(request);
    if (this.fiber) this.fiber.recordCost('content', 0.05, `create:${request.type}`);
    return result;
  }

  /**
   * Cross-post content immediately to multiple platforms
   */
  async crossPost(
    content: string,
    platforms: import('./content/types.js').Platform[],
    options?: { title?: string; hashtags?: string[] }
  ): Promise<import('./content/types.js').CrossPostResult | null> {
    if (!this.contentScheduler) return null;
    const result = await this.contentScheduler.crossPost(content, platforms, options);
    if (this.fiber) this.fiber.recordCost('content', 0.02 * platforms.length, 'crosspost');
    return result;
  }

  /**
   * Schedule content for later publishing
   */
  async scheduleContent(
    content: string,
    platforms: import('./content/types.js').Platform[],
    publishAt: Date,
    options?: { title?: string; hashtags?: string[] }
  ): Promise<string | null> {
    if (!this.contentScheduler) return null;
    return this.contentScheduler.enqueue({
      content,
      title: options?.title,
      type: 'post',
      platforms,
      publishAt,
      hashtags: options?.hashtags,
    });
  }

  /**
   * Get content analytics and insights
   */
  async getContentInsights(): Promise<import('./content/types.js').ContentInsights | null> {
    if (!this.contentAnalytics) return null;
    return this.contentAnalytics.generateInsights();
  }

  /**
   * Get aggregated metrics across platforms
   */
  async getContentMetrics(since: Date): Promise<import('./content/types.js').AggregatedMetrics | null> {
    if (!this.contentAnalytics) return null;
    return this.contentAnalytics.aggregateMetrics(since);
  }

  // ==========================================================================
  // Market Strategist Interface
  // ==========================================================================

  /**
   * Generate a weekly market strategy brief
   */
  async generateMarketBrief(): Promise<MarketBrief | null> {
    if (!this.marketStrategistInstance) return null;
    return this.marketStrategistInstance.generateWeeklyBrief();
  }

  /**
   * Process feedback on a market brief
   */
  async processMarketBriefFeedback(feedback: string, briefWeek: string): Promise<void> {
    if (!this.marketStrategistInstance) return;
    await this.marketStrategistInstance.processFeedback(feedback, briefWeek);
  }

  /**
   * Get market strategist statistics
   */
  getMarketStrategistStats(): { briefsGenerated: number; lastBriefWeek: string | null } | null {
    if (!this.marketStrategistInstance) return null;
    return {
      briefsGenerated: this.marketStrategistBriefsGenerated,
      lastBriefWeek: this.marketStrategistLastBrief,
    };
  }

  /**
   * v18.3: Get component-specific memory manager
   */
  getComponentMemory(componentId: ComponentId): ComponentMemoryManager | null {
    return this.componentMemoryManagers.get(componentId) ?? null;
  }

  // ==========================================================================
  // Revenue Activation Interface (v19.0.0)
  // ==========================================================================

  /**
   * Get the revenue activation manager
   */
  getRevenueActivation(): RevenueActivationManager | null {
    return this.revenueActivation;
  }

  /**
   * Activate all revenue streams
   */
  async activateRevenue(): Promise<void> {
    if (!this.revenueActivation) {
      throw new Error('Revenue system not initialized. Set revenue: true in config.');
    }
    await this.revenueActivation.activate();
  }

  /**
   * Get revenue status and metrics
   */
  getRevenueStatus(): {
    isActive: boolean;
    metrics: import('./revenue/activation.js').RevenueMetrics;
    opportunities: number;
    x402Ready: boolean;
  } | null {
    if (!this.revenueActivation) return null;
    const status = this.revenueActivation.getStatus();
    return {
      isActive: status.isActive,
      metrics: status.metrics,
      opportunities: status.opportunities,
      x402Ready: isX402Configured(),
    };
  }

  /**
   * v18.3: Get all active component memory managers
   */
  getAllComponentMemoryManagers(): Map<ComponentId, ComponentMemoryManager> {
    return this.componentMemoryManagers;
  }

  /**
   * v18.3: Get component memory statistics
   */
  getComponentMemoryStats(): Record<string, {
    episodicCount: number;
    semanticCount: number;
    proceduralCount: number;
    avgRetention: number;
    dueForReview: number;
  }> | null {
    if (this.componentMemoryManagers.size === 0) return null;
    const stats: Record<string, {
      episodicCount: number;
      semanticCount: number;
      proceduralCount: number;
      avgRetention: number;
      dueForReview: number;
    }> = {};
    for (const [id, manager] of this.componentMemoryManagers) {
      const s = manager.getStats();
      stats[id] = {
        episodicCount: s.episodicCount,
        semanticCount: s.semanticCount,
        proceduralCount: s.proceduralCount,
        avgRetention: s.avgRetention,
        dueForReview: s.dueForReview,
      };
    }
    return stats;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * v13.2: Adaptive defer threshold — Meta-RL curriculum success rate
   * modulates confidence threshold. High success → lower threshold (more ambitious).
   * Low success → higher threshold (more cautious).
   */
  private getAdaptiveDeferThreshold(): number {
    let threshold = this.config.deferThreshold;

    // Meta-RL curriculum modulation
    if (this.metaRL) {
      const curriculum = this.metaRL.getCurriculum();
      if (curriculum && curriculum.taskHistory.length >= 5) {
        // High success → lower threshold (more ambitious)
        const adjustment = (0.5 - curriculum.successRate) * 0.2;
        threshold += adjustment;
      }
    }

    // v13.2: Neuromodulatory modulation (risk tolerance from cortisol/dopamine)
    if (this.neuromodulation) {
      const effect = this.neuromodulation.getEffect();
      // High risk tolerance → lower threshold (take on more)
      // Low risk tolerance → higher threshold (defer more)
      threshold -= (effect.riskTolerance - 0.5) * 0.15;
    }

    return Math.max(0.1, Math.min(0.6, threshold));
  }

  private extractMemoryContent(memory: { type: string; content: unknown }): string {
    const c = memory.content as Record<string, unknown>;
    if (memory.type === 'episodic') return (c.what as string) ?? '';
    if (memory.type === 'semantic') return (c.concept as string) ?? '';
    if (memory.type === 'procedural') return (c.name as string) ?? '';
    return JSON.stringify(c).slice(0, 200);
  }

  private inferDomain(input: string): string {
    const lower = input.toLowerCase();
    if (lower.includes('code') || lower.includes('function') || lower.includes('bug')) return 'coding';
    if (lower.includes('math') || lower.includes('calcul') || lower.includes('equat')) return 'math';
    if (lower.includes('deploy') || lower.includes('server') || lower.includes('infra')) return 'infrastructure';
    if (lower.includes('money') || lower.includes('pay') || lower.includes('budget')) return 'economics';
    return 'general';
  }

  /**
   * v13.11.0: Assess risk level of an input for consciousness gating.
   * Higher risk = requires higher consciousness (phi) to process.
   */
  private assessInputRisk(input: string): number {
    const lower = input.toLowerCase();

    // High risk: Irreversible or system-critical operations
    const highRiskPatterns = [
      'delete', 'remove', 'drop', 'destroy', 'shutdown', 'kill',
      'deploy', 'publish', 'push to production', 'release',
      'transfer', 'payment', 'transaction', 'send money',
      'modify database', 'alter table', 'update all',
      'sudo', 'root', 'admin', 'credentials',
    ];

    // Medium risk: Code/system modifications
    const mediumRiskPatterns = [
      'edit', 'modify', 'change', 'update', 'write',
      'create', 'install', 'configure', 'setup',
      'execute', 'run', 'bash', 'shell',
    ];

    // Check for high risk
    for (const pattern of highRiskPatterns) {
      if (lower.includes(pattern)) return 0.8;
    }

    // Check for medium risk
    for (const pattern of mediumRiskPatterns) {
      if (lower.includes(pattern)) return 0.5;
    }

    // Check input length (longer = more complex = slightly higher risk)
    const lengthRisk = Math.min(0.3, input.length / 2000);

    // Default: low risk query
    return 0.2 + lengthRisk;
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
