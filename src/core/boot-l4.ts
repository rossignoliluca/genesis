/**
 * Genesis v35 — L4 Boot Extraction
 *
 * Extracts the bootL4() method from genesis.ts into a standalone async function.
 * The Genesis class passes a BootL4Context object that holds all pre-existing
 * service references (built in L1–L3) and helper callbacks, so this module
 * remains free of any dependency on the Genesis class itself.
 *
 * Returned BootL4Result carries all services created during L4 so the caller
 * can assign them back to its own fields.
 */

// ============================================================================
// External module imports — exact same imports as genesis.ts uses in bootL4
// ============================================================================

import { createMetacognitionSystem, type MetacognitionSystem } from '../metacognition/index.js';
import { getNESSMonitor, type NESSMonitor, type NESSState } from '../economy/ness.js';
import { getBountyOrchestrator, type BountyOrchestrator } from '../economy/bounty-orchestrator.js';
import { createMetaRLLearner, type MetaRLLearner } from '../learning/meta-rl.js';
import { getSelfImprovementEngine, type SelfImprovementEngine } from '../self-modification/index.js';
import { getMetacognitiveController, type MetacognitiveController } from '../reasoning/metacognitive-controller.js';
import { getGovernanceSystem, type GovernanceSystem } from '../governance/index.js';
import { createAdaptiveConformal, type AdaptiveConformalPredictor } from '../uncertainty/conformal.js';
import { getPaymentService, getRevenueTracker, type PaymentService, type RevenueTracker } from '../payments/index.js';
import { createCompetitiveIntelService, type CompetitiveIntelService } from '../services/competitive-intel.js';
import { createRevenueLoop, type RevenueLoop } from '../services/revenue-loop.js';
import { VercelDeployer } from '../deployment/index.js';
import {
  AutonomousSystem,
  getDecisionEngine,
  getStrategyOrchestrator,
  getSelfReflectionEngine,
  getGoalSystem,
  getAttentionController,
  getSkillAcquisitionSystem,
  type DecisionEngine,
  type StrategyOrchestrator,
  type SelfReflectionEngine,
  type GoalSystem,
  type AttentionController,
  type SkillAcquisitionSystem,
} from '../autonomous/index.js';
import { createFinanceModule, type FinanceModule } from '../finance/index.js';
import { getMCPFinanceManager, type MCPFinanceManager } from '../mcp-finance/index.js';
import { createExoticComputing, type ExoticComputing } from '../exotic/index.js';
import {
  initContentModule,
  wireContentModule,
  createContentSystemIntegration,
  wireContentToIntegrations,
  publishMarketBrief,
  type ContentOrchestrator,
  type ContentScheduler,
  type AnalyticsAggregator,
  type ContentSystemIntegration,
  type MarketBriefSummary,
} from '../content/index.js';
import {
  getMarketStrategist,
  type MarketStrategist,
} from '../market-strategist/index.js';
import { getLSM, type LargeSemiosisModel } from '../semiotics/index.js';
import { getUmwelt, type AgentUmwelt } from '../umwelt/index.js';
import { getColony, type AgentColony } from '../morphogenetic/index.js';
import { getStrangeLoop, type StrangeLoop } from '../strange-loop/index.js';
import { getCybernetics, type SecondOrderCybernetics } from '../second-order/index.js';
import { getRSIOrchestrator, type RSIOrchestrator } from '../rsi/index.js';
import { getAutopoiesisEngine, type AutopoiesisEngine } from '../autopoiesis/index.js';
import { getSwarmDynamics, type SwarmDynamics } from '../swarm/index.js';
import { getPartnership, type SymbioticPartnership } from '../symbiotic/index.js';
import { createRevenueSystem, type RevenueSystem } from '../revenue/index.js';
import { getRevenueActivation, type RevenueActivationManager } from '../revenue/activation.js';
import { isClientConfigured as isX402Configured } from '../payments/x402/index.js';
import { createObservatory, type Observatory } from '../ui/index.js';
import { createPolymarketTrader, type PolymarketTrader } from '../finance/polymarket/index.js';
import {
  bootstrapIntegration,
  wireAllModules,
  type WiringResult,
  getCognitiveBridge,
  type CognitiveBridge,
} from '../integration/index.js';
import { initLearningSignalMapper } from '../memory/learning-signal-mapper.js';
import { getCentralAwareness, type CentralAwareness } from '../consciousness/central-awareness.js';
import { getGenesisAPI, type GenesisAPI } from '../api/index.js';
import { getGenesisWebSocket, type GenesisWebSocket } from '../api/websocket.js';
import {
  getParallelEngine,
  type ParallelExecutionEngine,
} from '../concurrency/index.js';
import { getHolisticSelfModel, type HolisticSelfModel } from '../self-model/index.js';
import { getNucleus, getPlasticity, getCuriosityEngine, type Orchestrator, type CuriosityEngine as CuriosityEngineType } from '../nucleus/index.js';
import { safeModuleInit } from '../utils/error-boundary.js';
import { broadcastToDashboard } from '../observability/dashboard.js';

// Types from dependent modules — needed by BootL4Context
import type { FreeEnergyKernel } from '../kernel/free-energy-kernel.js';
import type { Brain } from '../brain/index.js';
import type { EconomicFiber } from '../economy/fiber.js';
import type { Daemon } from '../daemon/index.js';
import type { MemorySystem } from '../memory/index.js';
import type { ConsciousnessSystem } from '../consciousness/index.js';
import type { CognitiveWorkspace } from '../memory/cognitive-workspace.js';
import type { NeuromodulationSystem } from '../neuromodulation/index.js';
import type { NociceptiveSystem } from '../nociception/index.js';
import type { AllostasisSystem } from '../allostasis/index.js';
import type { WorldModelSystem } from '../world-model/index.js';
import type { ThinkingEngine } from '../thinking/index.js';
import type { CausalReasoner } from '../causal/index.js';
import type { GroundingSystem } from '../grounding/index.js';
import type { AgentPool } from '../agents/index.js';
import type { SubagentExecutor } from '../subagents/index.js';
import type { MCPClientManager } from '../mcp/client-manager.js';
import type { GenesisEventBus } from '../bus/index.js';
import type { DashboardServer } from '../observability/dashboard.js';
import type { StateStore } from '../persistence/index.js';
import type { SensoriMotorLoop } from '../embodiment/sensorimotor-loop.js';
import type { HooksManager } from '../hooks/index.js';
import type { FactorGraph } from '../kernel/factor-graph.js';
import type { FeelingAgent } from '../agents/feeling.js';

// ============================================================================
// Context — everything bootL4 reads from the Genesis class (this.*)
// ============================================================================

/**
 * BootL4Context aggregates all pre-existing service references that bootL4
 * reads from the Genesis instance, plus helper callbacks for logic that must
 * remain on the Genesis class (e.g. private methods like getCalibrationError).
 *
 * All service fields are optional because they may be null/undefined when the
 * corresponding feature flag is disabled.
 */
export interface BootL4Context {
  // ── Feature flags (GenesisConfig subset) ──────────────────────────────────
  config: {
    metacognition: boolean;
    ness: boolean;
    metaRL: boolean;
    selfImprovement: boolean;
    reasoning: boolean;
    governance: boolean;
    uncertainty: boolean;
    payments: boolean;
    compIntel: boolean;
    deployment: boolean;
    autonomous: boolean;
    finance: boolean;
    mcpFinance: boolean;
    exotic: boolean;
    revenue: boolean;
    content: boolean;
    marketStrategist: boolean;
    observatory: boolean;
    polymarket: boolean;
    apiServer: boolean;
    apiPort: number;
    websocket: boolean;
    wsPort: number;
    totalBudget: number;
    /** Whether content module is enabled (used inside revenue block) */
    [key: string]: unknown;
  };

  // ── L1-L3 services ────────────────────────────────────────────────────────
  fek?: FreeEnergyKernel | null;
  brain?: Brain | null;
  fiber?: EconomicFiber | null;
  daemon?: Daemon | null;
  memory?: MemorySystem | null;
  consciousness?: ConsciousnessSystem | null;
  cognitiveWorkspace?: CognitiveWorkspace | null;
  neuromodulation?: NeuromodulationSystem | null;
  nociception?: NociceptiveSystem | null;
  allostasis?: AllostasisSystem | null;
  worldModel?: WorldModelSystem | null;
  thinking?: ThinkingEngine | null;
  causal?: CausalReasoner | null;
  grounding?: GroundingSystem | null;
  agentPool?: AgentPool | null;
  subagents?: SubagentExecutor | null;
  mcpClient?: MCPClientManager | null;
  eventBus?: GenesisEventBus | null;
  dashboard?: DashboardServer | null;
  stateStore?: StateStore | null;
  sensorimotor?: SensoriMotorLoop | null;
  hooks?: HooksManager | null;
  factorGraph?: FactorGraph | null;
  feelingAgent?: FeelingAgent | null;

  // ── Mutable state passed by reference ─────────────────────────────────────
  /** The mutable state bag — bootL4 updates cycleCount, lastNESSState, etc. */
  state: {
    cycleCount: number;
    bootTime: number;
    lastNESSState: NESSState | null;
    marketStrategistBriefsGenerated: number;
    marketStrategistLastBrief: string | null;
  };

  // ── Helper callbacks (private Genesis methods that bootL4 depends on) ─────
  /**
   * Returns the Expected Calibration Error (ECE) for the current session.
   * Delegated back to Genesis because it reads performanceHistory.
   */
  getCalibrationError: () => number;

  /**
   * Returns a 0-1 risk score for a raw input string.
   * Delegated back to Genesis because it is also used by bindNucleusModules.
   */
  assessInputRisk: (input: string) => number;

  /**
   * Binds all pipeline modules to the Nucleus orchestrator.
   * Must be called with the freshly-created nucleus instance.
   * Delegated back to Genesis because it uses many private methods
   * (inferDomain, getAdaptiveDeferThreshold, extractMemoryContent, …).
   */
  bindNucleusModules: (nucleus: Orchestrator) => void;
}

// ============================================================================
// Result — every service *created* during bootL4
// ============================================================================

/**
 * BootL4Result carries every service instance that was created inside bootL4.
 * The Genesis class assigns these back to its own fields after the call.
 */
export interface BootL4Result {
  // Core L4 services
  metacognition: MetacognitionSystem | null;
  nessMonitor: NESSMonitor | null;
  metaRL: MetaRLLearner | null;
  selfImprovement: SelfImprovementEngine | null;
  reasoningController: MetacognitiveController | null;
  governance: GovernanceSystem | null;
  conformal: AdaptiveConformalPredictor | null;

  // Payments & economy
  paymentService: PaymentService | null;
  revenueTracker: RevenueTracker | null;
  compIntelService: CompetitiveIntelService | null;
  revenueLoop: RevenueLoop | null;
  deployer: VercelDeployer | null;

  // Autonomous systems
  autonomousSystem: AutonomousSystem | null;
  bountyOrchestrator: BountyOrchestrator | null;
  decisionEngine: DecisionEngine | null;
  strategyOrchestrator: StrategyOrchestrator | null;
  selfReflection: SelfReflectionEngine | null;
  goalSystem: GoalSystem | null;
  attentionController: AttentionController | null;
  skillAcquisition: SkillAcquisitionSystem | null;

  // Finance, revenue, market
  financeModule: FinanceModule | null;
  mcpFinance: MCPFinanceManager | null;
  revenueSystem: RevenueSystem | null;
  revenueActivation: RevenueActivationManager | null;
  observatory: Observatory | null;
  polymarketTrader: PolymarketTrader | null;

  // Exotic & content
  exotic: ExoticComputing | null;
  contentOrchestrator: ContentOrchestrator | null;
  contentScheduler: ContentScheduler | null;
  contentAnalytics: AnalyticsAggregator | null;
  contentIntegration: ContentSystemIntegration | null;
  marketStrategistInstance: MarketStrategist | null;

  // Cognitive modules (P4)
  semiotics: LargeSemiosisModel | null;
  umweltInstance: AgentUmwelt | null;
  colony: AgentColony | null;
  strangeLoop: StrangeLoop | null;
  secondOrder: SecondOrderCybernetics | null;
  rsiOrchestrator: RSIOrchestrator | null;
  autopoiesis: AutopoiesisEngine | null;
  swarm: SwarmDynamics | null;
  symbiotic: SymbioticPartnership | null;

  // Infrastructure
  apiServer: GenesisAPI | null;
  websocket: GenesisWebSocket | null;
  parallelEngine: ParallelExecutionEngine | null;
  holisticSelfModel: HolisticSelfModel | null;

  // Integration
  centralAwareness: CentralAwareness | null;
  wiringResult: WiringResult | null;
  cognitiveBridge: CognitiveBridge | null;

  // Nucleus
  nucleus: Orchestrator | null;
  curiosityEngine: CuriosityEngineType | null;
}

// ============================================================================
// bootL4 — the extracted implementation
// ============================================================================

/**
 * Runs the L4 (Executive) boot phase.
 *
 * Reads all required services from `ctx` (built during L1–L3), creates L4
 * services, wires cross-module connections, and returns every new service in
 * a BootL4Result so the caller can assign them back to its own state.
 *
 * Mirrors genesis.ts `private async bootL4()` exactly.
 */
export async function bootL4(ctx: BootL4Context): Promise<BootL4Result> {
  // Result accumulator — null-initialised; filled in as modules are created.
  const result: BootL4Result = {
    metacognition: null,
    nessMonitor: null,
    metaRL: null,
    selfImprovement: null,
    reasoningController: null,
    governance: null,
    conformal: null,
    paymentService: null,
    revenueTracker: null,
    compIntelService: null,
    revenueLoop: null,
    deployer: null,
    autonomousSystem: null,
    bountyOrchestrator: null,
    decisionEngine: null,
    strategyOrchestrator: null,
    selfReflection: null,
    goalSystem: null,
    attentionController: null,
    skillAcquisition: null,
    financeModule: null,
    mcpFinance: null,
    revenueSystem: null,
    revenueActivation: null,
    observatory: null,
    polymarketTrader: null,
    exotic: null,
    contentOrchestrator: null,
    contentScheduler: null,
    contentAnalytics: null,
    contentIntegration: null,
    marketStrategistInstance: null,
    semiotics: null,
    umweltInstance: null,
    colony: null,
    strangeLoop: null,
    secondOrder: null,
    rsiOrchestrator: null,
    autopoiesis: null,
    swarm: null,
    symbiotic: null,
    apiServer: null,
    websocket: null,
    parallelEngine: null,
    holisticSelfModel: null,
    centralAwareness: null,
    wiringResult: null,
    cognitiveBridge: null,
    nucleus: null,
    curiosityEngine: null,
  };

  // ── Metacognition ──────────────────────────────────────────────────────────
  if (ctx.config.metacognition) {
    result.metacognition = createMetacognitionSystem();
  }

  // ── NESS Monitor ──────────────────────────────────────────────────────────
  if (ctx.config.ness) {
    result.nessMonitor = getNESSMonitor();
  }

  // ── Meta-RL Learner ───────────────────────────────────────────────────────
  if (ctx.config.metaRL) {
    result.metaRL = createMetaRLLearner({
      innerLearningRate: 0.01,
      outerLearningRate: 0.001,
      adaptationWindow: 50,
    });
  }

  // ── Self-Improvement ──────────────────────────────────────────────────────
  if (ctx.config.selfImprovement) {
    result.selfImprovement = getSelfImprovementEngine();
    // Wire consciousness φ monitor into self-improvement
    if (ctx.consciousness) {
      result.selfImprovement.setPhiMonitor(ctx.consciousness.monitor);
    }
    if (ctx.cognitiveWorkspace) {
      result.selfImprovement.setCognitiveWorkspace(ctx.cognitiveWorkspace);
    }
  }

  // ── Metacognitive Reasoning Controller ────────────────────────────────────
  // Strategy selection + execution, wired to thinking engine and φ provider.
  if (ctx.config.reasoning && ctx.thinking) {
    result.reasoningController = getMetacognitiveController();
    ctx.fiber?.registerModule('reasoning');

    // Inject φ provider from consciousness → strategy selection uses phi
    if (ctx.consciousness) {
      result.reasoningController.setPhiProvider(() =>
        ctx.consciousness?.getSnapshot()?.level?.rawPhi ?? 0.5
      );
    }

    // Inject strategy executor wired to thinking engine
    const thinkingEngine = ctx.thinking;
    result.reasoningController.setStrategyExecutor(async (strategy, problem, context) => {
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
    result.reasoningController.setCalibrationProvider(() => ctx.getCalibrationError());

    // v13.8: Wire causal bounds → reasoning controller EFE info gain
    if (ctx.causal) {
      const causal = ctx.causal;
      result.reasoningController.setCausalBoundsProvider(() => {
        const effect = causal.estimateEffect('observation', 0.8, 'outcome');
        if (!effect) return null;
        return { upper: Math.min(1, effect.expectedValue + effect.bounds[1]), lower: Math.max(0, effect.expectedValue + effect.bounds[0]) };
      });
    }
  }

  // ── Governance ────────────────────────────────────────────────────────────
  // Permission gates + budget enforcement + HITL
  if (ctx.config.governance) {
    result.governance = getGovernanceSystem();
    result.governance.initialize({
      agentName: 'genesis',
      capabilities: [
        { name: 'reasoning', description: 'Logical reasoning', inputSchema: {}, outputSchema: {} },
        { name: 'code_execution', description: 'Execute code', inputSchema: {}, outputSchema: {} },
        { name: 'self_improvement', description: 'Self-modify within TCB', inputSchema: {}, outputSchema: {} },
        { name: 'memory_write', description: 'Write to memory', inputSchema: {}, outputSchema: {} },
      ],
    });
  }

  // ── Conformal Prediction ──────────────────────────────────────────────────
  // Calibrated uncertainty intervals
  if (ctx.config.uncertainty) {
    result.conformal = createAdaptiveConformal(0.9);
  }

  // ── Payments ──────────────────────────────────────────────────────────────
  // Revenue and cost tracking (wired to economic fiber)
  if (ctx.config.payments) {
    result.paymentService = getPaymentService();
    result.revenueTracker = getRevenueTracker();
    ctx.fiber?.registerModule('payments');

    // v16.2.0: Initialize revenue tracker persistence
    await result.revenueTracker.load();
    result.revenueTracker.startAutoSave(60000); // Auto-save every minute

    // Wire revenue tracker → economic fiber (revenue feeds into sustainability)
    result.revenueTracker.on('revenue', (amount: number, source: string) => {
      ctx.fiber?.recordRevenue('payments', amount, source);
      ctx.eventBus?.publish('economic:revenue', { precision: 1.0, amount, source: source });
    });

    result.revenueTracker.on('cost', (amount: number, category: string) => {
      ctx.fiber?.recordCost('payments', amount, category);
    });
  }

  // ── Competitive Intelligence ───────────────────────────────────────────────
  // v14.1: Full wiring with event bus integration
  if (ctx.config.compIntel) {
    try {
      result.compIntelService = createCompetitiveIntelService({
        checkIntervalMs: 6 * 60 * 60 * 1000,  // 6 hours
        digestIntervalMs: 24 * 60 * 60 * 1000, // Daily
      });
      result.revenueLoop = createRevenueLoop();
      ctx.fiber?.registerModule('compintel');

      // Wire compIntel events → event bus
      result.compIntelService.on('started', (data) => {
        ctx.eventBus?.publish('compintel:started', { precision: 1.0, ...data });
      });
      result.compIntelService.on('stopped', () => {
        ctx.eventBus?.publish('compintel:stopped', { source: 'compintel', precision: 1.0 });
      });
      result.compIntelService.on('change', (data) => {
        ctx.eventBus?.publish('compintel:change', {
          source: 'compintel',
          precision: 1.0,
          competitor: data.competitor,
          significance: data.event.significance === 'critical' ? 1.0 : data.event.significance === 'high' ? 0.7 : 0.5,
          changeType: data.event.changeType,
        });
        // Nociceptive: critical changes = competitive pain
        if (data.event.significance === 'critical') {
          ctx.nociception?.stimulus('cognitive', 0.6, `compintel:${data.competitor}`);
        }
      });

      // Start monitoring (auto-starts periodic checks)
      result.compIntelService.start();
    } catch (error) {
      console.error('[Genesis] CompIntel init failed — module disabled:', error instanceof Error ? error.message : error);
    }
  }

  // ── Deployment ────────────────────────────────────────────────────────────
  // Self-deployment capability
  if (ctx.config.deployment) {
    await safeModuleInit('Deployer', async () => {
      result.deployer = new VercelDeployer();
      ctx.fiber?.registerModule('deployment');
      return result.deployer;
    });
  }

  // ── Autonomous System ─────────────────────────────────────────────────────
  // v14.1: Full wiring with event bus integration
  if (ctx.config.autonomous) {
    try {
      result.autonomousSystem = new AutonomousSystem({
        enableEconomy: true,
        enableDeployment: ctx.config.deployment as boolean,
        enableProductionMemory: ctx.config.memory as boolean,
        enableGovernance: ctx.config.governance as boolean,
        budgetLimits: {
          dailyUSD: ctx.config.totalBudget,
          monthlyUSD: ctx.config.totalBudget * 30,
        },
      });

      // Wire autonomous events → event bus
      result.autonomousSystem.on('initialized', (data) => {
        ctx.eventBus?.publish('autonomous:initialized', { precision: 1.0, ...data });
      });
      result.autonomousSystem.on('task:started', (data) => {
        ctx.eventBus?.publish('autonomous:task:started', { precision: 1.0, ...data });
      });
      result.autonomousSystem.on('task:completed', (data) => {
        ctx.eventBus?.publish('autonomous:task:completed', { precision: 1.0, ...data });
      });
      result.autonomousSystem.on('payment', (data) => {
        ctx.eventBus?.publish('autonomous:payment', { precision: 1.0, ...data });
        // Wire to economic fiber
        if (data.type === 'expense') {
          ctx.fiber?.recordCost('autonomous', data.amount, data.description);
        } else if (data.type === 'revenue') {
          ctx.fiber?.recordRevenue('autonomous', data.amount, data.description);
        }
      });

      await result.autonomousSystem.initialize();
      ctx.fiber?.registerModule('autonomous');

      // v21.0: Start Bounty Orchestrator in autonomous mode
      result.bountyOrchestrator = getBountyOrchestrator({
        mode: 'autonomous',
        minEFEScore: 0.6,
        minSuccessProbability: 0.5,
        maxConcurrentBounties: 3,
        enableEmailMonitoring: true,
        enableDashboardUpdates: true,
        enableMemoryPersistence: true,
        dailyBountyLimit: 10,
        dailyBudget: ctx.config.totalBudget,
      });
      result.bountyOrchestrator.startAutonomous(30 * 60 * 1000);  // 30 min cycles
      ctx.fiber?.registerModule('bounty-orchestrator');
      console.log('[Genesis] Bounty Orchestrator started (autonomous mode, 30min cycles)');
    } catch (error) {
      console.error('[Genesis] Autonomous init failed — module disabled:', error instanceof Error ? error.message : error);
    }
  }

  // ── Finance Module ────────────────────────────────────────────────────────
  // v13.12.0: Market data, signals, risk, portfolio
  if (ctx.config.finance && ctx.eventBus) {
    result.financeModule = createFinanceModule(ctx.eventBus, {
      dataSource: 'simulation',  // Start in simulation mode
      symbols: ['BTC', 'ETH', 'SPY'],
      updateInterval: 60000,     // 1 minute updates
    });
    result.financeModule.start();
    ctx.fiber?.registerModule('finance');
    console.log('[Genesis] Finance module started (simulation mode)');
  }

  // ── MCP Finance ───────────────────────────────────────────────────────────
  // v13.12.0: Unified financial MCP servers
  if (ctx.config.mcpFinance) {
    result.mcpFinance = getMCPFinanceManager({
      enableBraveSearch: true,
      enableGemini: true,
      enableFirecrawl: true,
    });
    ctx.fiber?.registerModule('mcp-finance');
  }

  // ── Exotic Computing ──────────────────────────────────────────────────────
  // v14.2: Thermodynamic, hyperdimensional, reservoir computing
  if (ctx.config.exotic) {
    result.exotic = createExoticComputing({
      thermodynamic: { temperature: 1.0 },
      hyperdimensional: { dimension: 10000 },
      reservoir: { reservoirSize: 500 },
    });
    ctx.fiber?.registerModule('exotic');
    console.log('[Genesis] Exotic computing initialized (thermodynamic, HDC, reservoir)');
  }

  // ── Cognitive Modules (P4) ────────────────────────────────────────────────
  // v19.0: Wire orphaned cognitive modules
  result.semiotics = getLSM();
  result.umweltInstance = getUmwelt('genesis');
  result.colony = getColony();
  result.strangeLoop = getStrangeLoop();
  result.secondOrder = getCybernetics();
  result.rsiOrchestrator = getRSIOrchestrator({ mockResearch: true });
  result.autopoiesis = getAutopoiesisEngine();
  result.swarm = getSwarmDynamics();
  result.symbiotic = getPartnership();
  console.log('[Genesis] Cognitive modules instantiated (semiotics, umwelt, morphogenetic, strange-loop, second-order, rsi, autopoiesis, swarm, symbiotic)');

  // ── Revenue System ────────────────────────────────────────────────────────
  // v13.12.0: Autonomous revenue streams
  if (ctx.config.revenue) {
    result.revenueSystem = createRevenueSystem({
      maxConcurrentTasks: 3,
      minRoi: 0.5,            // 50% minimum ROI
    });
    result.revenueSystem.start();
    ctx.fiber?.registerModule('revenue');
    console.log('[Genesis] Revenue system started (simulation mode)');

    // v19.0.0: Revenue Activation — unified control of x402, content, services
    result.revenueActivation = getRevenueActivation({
      x402Enabled: isX402Configured(),
      network: process.env.BASE_NETWORK === 'mainnet' ? 'base' : 'base-sepolia',
      dailyTarget: parseInt(process.env.REVENUE_DAILY_TARGET || '100', 10),
      contentEnabled: (ctx.config.content as boolean) ?? true,
      servicesEnabled: true,
      reinvestRate: parseFloat(process.env.REVENUE_REINVEST_RATE || '0.2'),
    });

    // Auto-activate if x402 is configured
    if (isX402Configured()) {
      result.revenueActivation.activate().then(() => {
        console.log('[Genesis] Revenue activation: x402 enabled on', process.env.BASE_NETWORK || 'testnet');
      }).catch((err) => {
        console.warn('[Genesis] Revenue activation failed:', err.message);
      });
    } else {
      console.log('[Genesis] Revenue activation: waiting for GENESIS_PRIVATE_KEY');
    }
  }

  // ── Content Creator Module ────────────────────────────────────────────────
  // v18.1.0: Multi-platform publishing, SEO, scheduling
  if (ctx.config.content) {
    const { orchestrator, scheduler, analytics } = initContentModule({
      autoStartScheduler: true,
      schedulerIntervalMs: 60000,
    });
    result.contentOrchestrator = orchestrator;
    result.contentScheduler = scheduler;
    result.contentAnalytics = analytics;
    ctx.fiber?.registerModule('content');

    // Wire content module to event bus (use any cast for content-specific events)
    if (ctx.eventBus) {
      const bus = ctx.eventBus as unknown as {
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
        ctx.fiber?.recordRevenue('content', revenueEvent.amount, `content:${revenueEvent.platform}`);
        // Dopamine reward for successful monetization
        ctx.neuromodulation?.reward(Math.min(0.5, revenueEvent.amount / 100), 'content:revenue');
      });
    }

    // v18.1.0: Full system integration — memory, revenue, dashboard, metrics
    const contentIntegration = createContentSystemIntegration({
      // Memory integration: store content as episodic/semantic memories
      memorySystem: ctx.memory ? {
        remember: (opts) => ctx.memory!.remember(opts as Parameters<typeof ctx.memory.remember>[0]),
        learn: (opts) => ctx.memory!.learn(opts as Parameters<typeof ctx.memory.learn>[0]),
        learnSkill: (opts) => ctx.memory!.learnSkill(opts as Parameters<typeof ctx.memory.learnSkill>[0]),
        recall: (query, opts) => ctx.memory!.recall(query, opts),
        semanticRecall: (query, opts) => ctx.memory!.semanticRecall(query, opts),
      } : undefined,

      // Economic fiber: cost/revenue tracking
      fiber: ctx.fiber ? {
        recordRevenue: (module, amount, source) => ctx.fiber!.recordRevenue(module, amount, source),
        recordCost: (module, amount, category) => ctx.fiber!.recordCost(module, amount, category),
        getGlobalSection: () => ctx.fiber!.getGlobalSection(),
      } : undefined,

      // Revenue tracker: persistent revenue logging (emits events, fiber handles recording)
      revenueTracker: ctx.fiber ? {
        recordRevenue: (amount, source) => {
          // Use fiber for revenue (revenueTracker tracks costs via recordCost)
          ctx.fiber!.recordRevenue('content', amount, source);
        },
      } : undefined,

      // Dashboard: real-time observability
      broadcast: ctx.dashboard
        ? (type, data) => broadcastToDashboard(type, data)
        : undefined,
    });

    // Wire orchestrator to automatically use integrations
    wireContentToIntegrations(contentIntegration, orchestrator);

    result.contentIntegration = contentIntegration;

    console.log('[Genesis] Content creator module initialized with full system integration');
  }

  // ── Market Strategist ─────────────────────────────────────────────────────
  // v18.2.0: Weekly market strategy briefs
  if (ctx.config.marketStrategist) {
    result.marketStrategistInstance = getMarketStrategist({
      generatePresentation: true,
    });
    ctx.fiber?.registerModule('market-strategist');

    // Wire to event bus for brief generation events
    if (ctx.eventBus) {
      const bus = ctx.eventBus as unknown as {
        publish: (topic: string, event: unknown) => void;
      };

      // Override brief generation to emit events and auto-publish to social.
      // We capture the local reference to avoid closure issues.
      const strategist = result.marketStrategistInstance;
      const originalGenerate = strategist.generateWeeklyBrief.bind(strategist);
      strategist.generateWeeklyBrief = async () => {
        const brief = await originalGenerate();
        ctx.state.marketStrategistBriefsGenerated++;
        ctx.state.marketStrategistLastBrief = brief.week;

        // Emit brief generated event
        bus.publish('market.brief.generated', {
          week: brief.week,
          date: brief.date,
          narrativeCount: brief.narratives.length,
          sentiment: brief.snapshot.sentiment,
        });

        // Auto-publish to social if content module is enabled
        if (ctx.config.content && result.contentOrchestrator) {
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

  // ── Observatory UI ────────────────────────────────────────────────────────
  // v13.12.0: Real-time visualization
  if (ctx.config.observatory && ctx.dashboard) {
    result.observatory = createObservatory({
      dashboardUrl: 'http://localhost:9876',
    });
    // Don't auto-connect — user must call genesis.connectObservatory()
  }

  // ── Polymarket ────────────────────────────────────────────────────────────
  // v13.12.0: Prediction market trading via Active Inference
  if (ctx.config.polymarket) {
    result.polymarketTrader = createPolymarketTrader({
      simulationMode: true,  // Start in simulation mode
      maxPositionSize: 100,
      maxPortfolioRisk: 500,
    });
    result.polymarketTrader.start();
    ctx.fiber?.registerModule('polymarket');
    console.log('[Genesis] Polymarket trader started (simulation mode)');
  }

  // ── Bootstrap Integration ─────────────────────────────────────────────────
  // Wire all cross-module connections
  await bootstrapIntegration();

  // ── Cognitive Bridge ──────────────────────────────────────────────────────
  // v21.0: Initialize Cognitive Bridge (perception→consciousness→inference)
  result.cognitiveBridge = getCognitiveBridge();
  console.log('[Genesis] Cognitive Bridge active: perception→consciousness→inference pipeline');

  // ── Central Awareness + Module Wiring ─────────────────────────────────────
  // v13.11.0: Wire ALL modules to event bus + start CentralAwareness
  result.centralAwareness = getCentralAwareness();
  result.wiringResult = wireAllModules({
    fek: ctx.fek ?? undefined,
    neuromodulation: ctx.neuromodulation ?? undefined,
    nociception: ctx.nociception ?? undefined,
    allostasis: ctx.allostasis ?? undefined,
    daemon: ctx.daemon ?? undefined,
    consciousness: ctx.consciousness ?? undefined,
    worldModel: ctx.worldModel ?? undefined,
    memory: ctx.memory ?? undefined,
    brain: ctx.brain ?? undefined,
    thinking: ctx.thinking ?? undefined,
    causal: ctx.causal ?? undefined,
    grounding: ctx.grounding ?? undefined,
    agents: ctx.agentPool ?? undefined,
    subagents: ctx.subagents ?? undefined,
    mcp: ctx.mcpClient ?? undefined,
    metacognition: result.metacognition ?? undefined,
    governance: result.governance ?? undefined,
    fiber: ctx.fiber ?? undefined,
    ness: result.nessMonitor ?? undefined,
    // v19.0: Newly wired cognitive modules (P4)
    semiotics: result.semiotics ?? undefined,
    umwelt: result.umweltInstance ?? undefined,
    morphogenetic: result.colony ?? undefined,
    strangeLoop: result.strangeLoop ?? undefined,
    secondOrder: result.secondOrder ?? undefined,
    rsi: result.rsiOrchestrator ?? undefined,
    autopoiesis: result.autopoiesis ?? undefined,
    swarm: result.swarm ?? undefined,
    symbiotic: result.symbiotic ?? undefined,
    exotic: result.exotic ?? undefined,
    embodiment: ctx.sensorimotor ?? undefined,
    metaRL: result.metaRL ?? undefined,
  });

  console.log(`[Genesis] Central Awareness active: ${result.wiringResult.modulesWired} modules wired`);

  // ── Learning Signal Mapper ────────────────────────────────────────────────
  // v34.0: Captures bus learning events into memory
  initLearningSignalMapper();

  // ── REST API Server ───────────────────────────────────────────────────────
  // v23.0: Production HTTP endpoints
  if (ctx.config.apiServer) {
    result.apiServer = getGenesisAPI({
      port: ctx.config.apiPort,
      enableCors: true,
      enableMetrics: true,
    });
    await result.apiServer.start();
    ctx.fiber?.registerModule('api-server');
    console.log(`[Genesis] REST API server started on port ${ctx.config.apiPort}`);
  }

  // ── Decision Engine ───────────────────────────────────────────────────────
  // v25.0: Unified autonomous decision making
  result.decisionEngine = getDecisionEngine({
    explorationRate: 0.2,
    riskTolerance: 0.4,
    minConfidence: 0.6,
    phiThreshold: 0.3,
    usePainAvoidance: true,
    useGrounding: true,
  });
  ctx.fiber?.registerModule('decision-engine');
  console.log('[Genesis] Decision Engine active: unified autonomous decision making');

  // ── WebSocket Real-Time API ───────────────────────────────────────────────
  // v26.0
  if (ctx.config.websocket) {
    result.websocket = getGenesisWebSocket({
      port: ctx.config.wsPort,
      heartbeatInterval: 30000,
      clientTimeout: 60000,
    });
    await result.websocket.start();
    ctx.fiber?.registerModule('websocket');
    console.log(`[Genesis] WebSocket server started on port ${ctx.config.wsPort}`);
  }

  // ── Strategy Orchestrator ─────────────────────────────────────────────────
  // v28.0: Meta-level resource allocation
  result.strategyOrchestrator = getStrategyOrchestrator({
    evaluationInterval: 5 * 60 * 1000,  // 5 minutes
    minStrategyDuration: 10 * 60 * 1000,  // 10 minutes
    revenueWeight: 0.4,
    growthWeight: 0.3,
    healthWeight: 0.3,
    explorationRate: 0.15,
  });
  result.strategyOrchestrator.start();
  ctx.fiber?.registerModule('strategy-orchestrator');
  console.log('[Genesis] Strategy Orchestrator active: adaptive resource allocation');

  // ── Self-Reflection Engine ────────────────────────────────────────────────
  // v29.0: Metacognitive introspection
  result.selfReflection = getSelfReflectionEngine({
    reflectionInterval: 30 * 60 * 1000,  // 30 minutes
    minDecisionsForReflection: 10,
    analysisWindow: 100,
    biasThreshold: 0.6,
    failurePatternThreshold: 0.3,
    autoPropose: true,
  });
  result.selfReflection.start();
  ctx.fiber?.registerModule('self-reflection');
  console.log('[Genesis] Self-Reflection Engine active: metacognitive introspection');

  // ── Goal System ───────────────────────────────────────────────────────────
  // v30.0: Autonomous goal pursuit
  result.goalSystem = getGoalSystem({
    maxActiveGoals: 5,
    evaluationInterval: 5 * 60 * 1000,  // 5 minutes
    autoGenerate: true,
    minPriority: 0.3,
    goalTimeout: 24 * 60 * 60 * 1000,   // 24 hours
  });
  result.goalSystem.start();
  ctx.fiber?.registerModule('goal-system');
  console.log('[Genesis] Goal System active: autonomous goal pursuit');

  // ── Attention Controller ──────────────────────────────────────────────────
  // v31.0: Cognitive focus management
  result.attentionController = getAttentionController({
    evaluationInterval: 10 * 1000,     // 10 seconds
    switchCooldown: 30 * 1000,         // 30 seconds min focus
    urgencyWeight: 0.35,
    importanceWeight: 0.4,
    noveltyWeight: 0.25,
    maxQueueSize: 50,
    salienceDecay: 0.01,
    salienceThreshold: 0.1,
  });
  result.attentionController.start();
  ctx.fiber?.registerModule('attention-controller');
  console.log('[Genesis] Attention Controller active: cognitive focus management');

  // ── Skill Acquisition ─────────────────────────────────────────────────────
  // v32.0: Capability learning
  result.skillAcquisition = getSkillAcquisitionSystem({
    minExecutionsToLearn: 5,
    masteryThreshold: 0.85,
    evaluationInterval: 15 * 60 * 1000,  // 15 minutes
    skillDecayRate: 0.001,
    autoExtract: true,
  });
  result.skillAcquisition.start();
  ctx.fiber?.registerModule('skill-acquisition');
  console.log('[Genesis] Skill Acquisition active: capability learning');

  // ── Parallel Execution Engine ─────────────────────────────────────────────
  // v33.0: Work-stealing scheduler
  result.parallelEngine = getParallelEngine({
    maxWorkers: 16,
    numQueues: 4,
    maxQueueDepth: 1000,
    stealThreshold: 5,
    adaptiveBatching: true,
    initialBatchSize: 5,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeout: 30000,
    tracing: true,
  });
  result.parallelEngine.start();
  ctx.fiber?.registerModule('parallel-engine');
  console.log('[Genesis] Parallel Engine active: work-stealing, adaptive batching, circuit breakers');

  // ── Holistic Self-Model ───────────────────────────────────────────────────
  // v33.0: Boots after bus, tracks all module health
  try {
    result.holisticSelfModel = getHolisticSelfModel({ rootPath: process.cwd() });
    await result.holisticSelfModel.boot();
    console.log('[Genesis] Holistic Self-Model booted — tracking module health');
  } catch (err) {
    console.warn('[Genesis] Self-Model boot failed (non-fatal):', err);
  }

  // ── Nucleus ───────────────────────────────────────────────────────────────
  // v34.0: Centro Gravitazionale — classifies inputs, selects modules, learns from outcomes
  result.nucleus = getNucleus();
  const plasticity = getPlasticity();
  await plasticity.boot();

  // Bind all pipeline modules to the Nucleus orchestrator.
  // This is delegated to the Genesis class because bindNucleusModules uses many
  // private methods (inferDomain, getAdaptiveDeferThreshold, extractMemoryContent)
  // that would need to be part of the context if fully extracted.
  ctx.bindNucleusModules(result.nucleus);

  // Start curiosity engine (idle-time self-improvement)
  result.curiosityEngine = getCuriosityEngine();
  result.curiosityEngine.start();

  console.log(`[Genesis] Nucleus active: ${result.nucleus.getBoundModuleCount()}/${result.nucleus.getModuleCount()} modules bound, curiosity engine started`);

  return result;
}
