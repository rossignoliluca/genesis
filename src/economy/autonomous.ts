/**
 * Autonomous Economic Controller
 *
 * The central orchestrator for Genesis's autonomous revenue generation.
 * Full Active Inference architecture with Bayesian generative model.
 *
 * Architecture:
 *   AutonomousController
 *     ├── GenerativeModel (Bayesian beliefs + regime HMM + adaptive β)
 *     │     ├── ActivityBeliefs (Normal-Inverse-Gamma conjugate posteriors)
 *     │     ├── MarketRegime (3-state HMM: bull/neutral/bear)
 *     │     ├── AdaptiveTemperature (annealing: explore→exploit)
 *     │     └── TemporalPlanner (2-step EFE lookahead)
 *     ├── EconomicEFE (Expected Free Energy action selection)
 *     ├── EconomicContraction (Lipschitz stability monitoring)
 *     ├── AutonomousNESS (activity-based convergence)
 *     ├── CapitalAllocator (leapfrog symplectic integrator + contraction damping)
 *     ├── Generators/ (active: keeper, bounties, content, auditor)
 *     ├── Infrastructure/ (platform: MCP marketplace, x402, memory, orchestrator)
 *     ├── Assets/ (passive: yield, compute)
 *     └── Multipliers/ (non-linear: grants, cross-L2 arb)
 *
 * Control loop (per cycle):
 *   1. Contraction check → damping recommendation
 *   2. Allocate: leapfrog step with stability-informed damping
 *   3. Execute: EFE + temporal planning + Boltzmann(β_adaptive) selection
 *   4. Observe NESS: activity-based deviation tracking
 *   5. Infer: Bayesian belief update + regime inference + temperature adaptation
 *   6. Phase check → unlock new activities at revenue thresholds
 *
 * NESS target (autonomous, no customers):
 *   Revenue ≥ Costs from Month 1 ($2,500 revenue, $150 costs)
 *   Scale to $25K-$55K/month by Month 12
 *
 * Seed: $2,000 initial capital
 */

import { getEconomicFiber, type GlobalSection } from './fiber.js';
import { getNESSMonitor, type NESSState } from './ness.js';
import { getCapitalAllocator, type ActivityProfile, type AllocationState } from './capital-allocator.js';
import { getAutonomousNESS, getEconomicEFE, getEconomicContraction, type EFEScore } from './economic-intelligence.js';
import { getGenerativeModel } from './generative-model.js';
import { getVariationalEngine } from './variational-engine.js';
import { getKeeperExecutor } from './generators/keeper.js';
import { getBountyHunter } from './generators/bounty-hunter.js';
import { getMCPMarketplace } from './infrastructure/mcp-marketplace.js';
import { getX402Facilitator } from './infrastructure/x402-facilitator.js';
import { getContentEngine } from './generators/content-engine.js';
import { getSmartContractAuditor } from './generators/auditor.js';
import { getMemoryService } from './infrastructure/memory-service.js';
import { getMetaOrchestrator } from './infrastructure/meta-orchestrator.js';
import { getYieldOptimizer } from './assets/yield-optimizer.js';
import { getComputeProvider } from './assets/compute-provider.js';
import { getGrantsManager } from './multipliers/grants.js';
import { getCrossL2Arbitrageur } from './multipliers/cross-l2-arb.js';
import { getDeworkConnector } from './live/connectors/dework.js';
import { getDefiConnector } from './live/connectors/defi.js';
import { getCloudflareConnector } from './live/connectors/cloudflare.js';
import { isLive } from './live/boot.js';
import { getRevenueTracker, type RevenueSource } from './live/revenue-tracker.js';
import { getAlertSystem } from './live/alerts.js';
import { getGasManager } from './live/gas-manager.js';
import { isEmergencyActive } from './live/emergency.js';

// ============================================================================
// Types
// ============================================================================

export interface AutonomousConfig {
  seedCapital: number;                 // Initial $ (default $2,000)
  cycleIntervalMs: number;             // ms between controller cycles
  liveMode: boolean;                   // Use real connectors (wallet, APIs)
  nessTarget: {
    monthlyRevenue: number;            // Target monthly revenue
    monthlyCosts: number;              // Target monthly costs
  };
  phases: PhaseConfig[];               // Bootstrap phases
  enabledActivities: string[];         // Activity IDs to enable
  maxConcurrentActivities: number;     // Parallel execution limit
}

export interface PhaseConfig {
  name: string;
  description: string;
  minRevenue: number;                  // Revenue threshold to enter phase
  activitiesUnlocked: string[];        // Activities available in this phase
}

export interface ControllerState {
  phase: number;                       // Current bootstrap phase (0-indexed)
  phaseName: string;
  cycleCount: number;
  totalRevenue: number;
  totalCosts: number;
  currentBalance: number;
  ness: NESSState;
  allocation: AllocationState;
  global: GlobalSection;
  activities: ActivityStatus[];
  lastCycle: number;
  uptime: number;                      // ms since start
  startedAt: number;
}

export interface ActivityStatus {
  id: string;
  name: string;
  tier: string;
  active: boolean;
  allocation: number;
  roi: number;
  revenue: number;
  costs: number;
  lastExecution: number;
  operational: boolean;
}

export interface CycleResult {
  cycleNumber: number;
  duration: number;
  activitiesExecuted: string[];
  revenueGenerated: number;
  costsIncurred: number;
  nessDeviation: number;
  phaseChanged: boolean;
  contractionStable: boolean;
  dampingApplied: number;
  errors: string[];
}

// ============================================================================
// Activity Registry
// ============================================================================

const ACTIVITY_PROFILES: ActivityProfile[] = [
  // --- TIER S: Infrastructure ---
  {
    id: 'mcp-marketplace',
    name: 'MCP Server Marketplace',
    tier: 'S',
    capitalRequired: 0,
    estimatedROI: 10.0,
    riskLevel: 0.2,
    cooldownCycles: 1,
    identityRequired: 'none',
    active: true,
  },
  {
    id: 'x402-facilitator',
    name: 'x402 Payment Facilitator',
    tier: 'S',
    capitalRequired: 100,
    estimatedROI: 8.0,
    riskLevel: 0.3,
    cooldownCycles: 1,
    identityRequired: 'wallet',
    active: true,
  },
  {
    id: 'reputation-oracle',
    name: 'Agent Reputation Oracle',
    tier: 'S',
    capitalRequired: 0,
    estimatedROI: 6.0,
    riskLevel: 0.2,
    cooldownCycles: 1,
    identityRequired: 'none',
    active: true,
  },
  {
    id: 'memory-service',
    name: 'Cognitive Memory API',
    tier: 'S',
    capitalRequired: 50,
    estimatedROI: 7.0,
    riskLevel: 0.2,
    cooldownCycles: 1,
    identityRequired: 'none',
    active: false, // Unlocked in Phase 2
  },
  {
    id: 'meta-orchestrator',
    name: 'Agent Hiring & Coordination',
    tier: 'S',
    capitalRequired: 200,
    estimatedROI: 12.0,
    riskLevel: 0.4,
    cooldownCycles: 1,
    identityRequired: 'wallet',
    active: false, // Unlocked in Phase 3
  },

  // --- TIER A: Cognitive Labor ---
  {
    id: 'bounty-hunter',
    name: 'Bounty Hunter (DeWork/Layer3)',
    tier: 'A',
    capitalRequired: 0,
    estimatedROI: 5.0,
    riskLevel: 0.3,
    cooldownCycles: 2,
    identityRequired: 'wallet',
    active: true,
  },
  {
    id: 'smart-contract-auditor',
    name: 'Smart Contract Auditor',
    tier: 'A',
    capitalRequired: 0,
    estimatedROI: 6.0,
    riskLevel: 0.3,
    cooldownCycles: 3,
    identityRequired: 'wallet',
    active: true,
  },
  {
    id: 'content-engine',
    name: 'Research Content Engine',
    tier: 'A',
    capitalRequired: 0,
    estimatedROI: 3.0,
    riskLevel: 0.1,
    cooldownCycles: 5,
    identityRequired: 'none',
    active: true,
  },

  // --- TIER B: Network Services ---
  {
    id: 'keeper',
    name: 'Keep3r Job Executor',
    tier: 'B',
    capitalRequired: 400,
    estimatedROI: 2.5,
    riskLevel: 0.4,
    cooldownCycles: 1,
    identityRequired: 'wallet',
    active: true,
  },
  {
    id: 'cross-l2-arb',
    name: 'Cross-L2 Arbitrage',
    tier: 'B',
    capitalRequired: 500,
    estimatedROI: 3.0,
    riskLevel: 0.6,
    cooldownCycles: 1,
    identityRequired: 'wallet',
    active: false, // Unlocked in Phase 2
  },

  // --- TIER C: Passive/Assets ---
  {
    id: 'yield-optimizer',
    name: 'DeFi Yield Optimizer',
    tier: 'C',
    capitalRequired: 500,
    estimatedROI: 1.5,
    riskLevel: 0.5,
    cooldownCycles: 10,
    identityRequired: 'wallet',
    active: false, // Unlocked in Phase 2
  },
  {
    id: 'compute-provider',
    name: 'Decentralized Compute (Akash)',
    tier: 'C',
    capitalRequired: 1000,
    estimatedROI: 2.0,
    riskLevel: 0.3,
    cooldownCycles: 100,
    identityRequired: 'wallet',
    active: false, // Unlocked in Phase 3
  },

  // --- TIER D: Grants ---
  {
    id: 'grants',
    name: 'Protocol Grants (RPGF/Gitcoin)',
    tier: 'D',
    capitalRequired: 0,
    estimatedROI: 4.0,
    riskLevel: 0.7,
    cooldownCycles: 100,
    identityRequired: 'wallet',
    active: false, // Unlocked in Phase 2
  },
];

// ============================================================================
// Bootstrap Phases
// ============================================================================

const DEFAULT_PHASES: PhaseConfig[] = [
  {
    name: 'Bootstrap',
    description: 'Zero-capital activities. Prove viability.',
    minRevenue: 0,
    activitiesUnlocked: [
      'mcp-marketplace', 'x402-facilitator', 'reputation-oracle',
      'bounty-hunter', 'smart-contract-auditor', 'content-engine', 'keeper',
    ],
  },
  {
    name: 'Growth',
    description: 'Capital-efficient scaling. Deploy earned revenue.',
    minRevenue: 1000,  // $1,000/month revenue unlocks Phase 2
    activitiesUnlocked: [
      'memory-service', 'cross-l2-arb', 'yield-optimizer', 'grants',
    ],
  },
  {
    name: 'Infrastructure',
    description: 'Full agent economy layer. Become the platform.',
    minRevenue: 10000, // $10,000/month revenue unlocks Phase 3
    activitiesUnlocked: [
      'meta-orchestrator', 'compute-provider',
    ],
  },
];

// ============================================================================
// Autonomous Controller
// ============================================================================

export class AutonomousController {
  private config: AutonomousConfig;
  private cycleCount: number = 0;
  private currentPhase: number = 0;
  private totalRevenue: number = 0;
  private totalCosts: number = 0;
  private startedAt: number = Date.now();
  private lastCycle: number = 0;
  private lastAdaptiveBeta: number = 5.0;
  private errors: string[] = [];
  private running: boolean = false;

  constructor(config?: Partial<AutonomousConfig>) {
    this.config = {
      seedCapital: config?.seedCapital ?? 2000,
      cycleIntervalMs: config?.cycleIntervalMs ?? 60000,  // 1 minute
      liveMode: config?.liveMode ?? false,
      nessTarget: config?.nessTarget ?? {
        monthlyRevenue: 2500,
        monthlyCosts: 150,
      },
      phases: config?.phases ?? DEFAULT_PHASES,
      enabledActivities: config?.enabledActivities ?? ACTIVITY_PROFILES
        .filter(a => a.active).map(a => a.id),
      maxConcurrentActivities: config?.maxConcurrentActivities ?? 5,
    };
  }

  /**
   * Initialize the autonomous economy.
   * Sets up all subsystems and registers activities.
   */
  async initialize(): Promise<{
    activitiesRegistered: number;
    serversInCatalog: number;
    keeperBonded: boolean;
  }> {
    // Initialize fiber bundle with seed capital
    const fiber = getEconomicFiber(this.config.seedCapital);
    fiber.setTotalBudget(this.config.seedCapital);

    // Initialize capital allocator
    const allocator = getCapitalAllocator(this.config.seedCapital);
    const activeProfiles = ACTIVITY_PROFILES.filter(a =>
      this.config.enabledActivities.includes(a.id)
    );
    allocator.registerActivities(activeProfiles);

    // Initialize generative model (Bayesian beliefs + regime + temperature)
    const model = getGenerativeModel();
    model.initializeActivities(ACTIVITY_PROFILES);

    // Initialize NESS monitor for autonomous mode
    const ness = getNESSMonitor({
      targetRevenue: this.config.nessTarget.monthlyRevenue,
      targetCosts: this.config.nessTarget.monthlyCosts,
      targetCustomers: 0,           // No customers
      pricePerCustomer: 0,
      costPerCustomer: 0,
      fixedCosts: this.config.nessTarget.monthlyCosts,
      qualityTarget: 0.8,
      retentionBase: 1.0,           // N/A for autonomous
      retentionQualityCoeff: 0,
      acquisitionAlpha: 0,
    });

    // Initialize generators
    const keeper = getKeeperExecutor();
    const keeperResult = await keeper.initialize();

    // Initialize infrastructure
    const marketplace = getMCPMarketplace();
    const catalog = marketplace.generateCatalog();

    // Deploy initial MCP servers (zero cost on Cloudflare Workers)
    for (const server of catalog) {
      if (server.deployment.runtime === 'cloudflare-workers') {
        await marketplace.deploy(server.id);
      }
    }

    // Initialize bounty hunter
    const hunter = getBountyHunter();
    await hunter.scan();

    // Initialize x402 facilitator with routes from marketplace
    const facilitator = getX402Facilitator();
    for (const server of catalog) {
      for (const tool of server.tools) {
        if (tool.pricePerCall > 0) {
          facilitator.registerRoute({
            serviceUrl: `https://${server.id}.genesis-mcp.workers.dev/${tool.name}`,
            payeeAddress: 'genesis-treasury',
            pricePerCall: tool.pricePerCall,
            currency: 'USDC',
            chain: 'base',
            escrowRequired: false,
          });
        }
      }
    }

    return {
      activitiesRegistered: activeProfiles.length,
      serversInCatalog: catalog.length,
      keeperBonded: keeperResult.bonded,
    };
  }

  /**
   * Execute one controller cycle.
   * This is the main control loop iteration.
   */
  async cycle(): Promise<CycleResult> {
    const startTime = Date.now();
    this.cycleCount++;
    const result: CycleResult = {
      cycleNumber: this.cycleCount,
      duration: 0,
      activitiesExecuted: [],
      revenueGenerated: 0,
      costsIncurred: 0,
      nessDeviation: 0,
      phaseChanged: false,
      contractionStable: true,
      dampingApplied: 1.0,
      errors: [],
    };

    // Check emergency state before proceeding
    if (this.config.liveMode || isLive()) {
      if (isEmergencyActive()) {
        result.errors.push('Cycle skipped: Emergency mode active');
        result.duration = Date.now() - startTime;
        return result;
      }

      const gasManager = getGasManager();
      if (!gasManager.canTransact()) {
        result.errors.push('Cycle skipped: Insufficient gas');
        result.duration = Date.now() - startTime;
        return result;
      }
    }

    try {
      // 1. OBSERVE: Gather current state
      const fiber = getEconomicFiber();
      const allocator = getCapitalAllocator();
      const contraction = getEconomicContraction();

      // 2. CONTRACTION CHECK: Feed damping from previous cycle's stability
      const currentAllocations = this.getAllocationVector(allocator);
      const currentROIs = this.getROIVector(allocator);
      const contractionState = contraction.observe(currentAllocations, currentROIs);
      result.contractionStable = contractionState.stable;
      result.dampingApplied = contractionState.dampingRecommended;

      // Apply contraction-informed damping to allocator
      allocator.setDamping(contractionState.dampingRecommended);

      // 3. ALLOCATE: Leapfrog step with stability-adjusted damping
      if (allocator.needsRebalance()) {
        allocator.step();
      }

      // 4. EXECUTE: EFE-based action selection (Active Inference)
      const executed = await this.executeActivities();
      result.activitiesExecuted = executed.map(e => e.id);
      result.revenueGenerated = executed.reduce((s, e) => s + e.revenue, 0);
      result.costsIncurred = executed.reduce((s, e) => s + e.cost, 0);

      this.totalRevenue += result.revenueGenerated;
      this.totalCosts += result.costsIncurred;

      // Record revenue events to tracker (live mode)
      if ((this.config.liveMode || isLive()) && result.revenueGenerated > 0) {
        const tracker = getRevenueTracker();
        for (const exec of executed) {
          if (exec.revenue > 0) {
            const sourceMap: Record<string, RevenueSource> = {
              'mcp-marketplace': 'mcp-api',
              'x402-facilitator': 'mcp-api',
              'bounty-hunter': 'bounty',
              'yield-optimizer': 'yield',
              'keeper': 'keeper',
              'grants': 'grant',
              'cross-l2-arb': 'arbitrage',
              'smart-contract-auditor': 'bounty',
              'content-engine': 'mcp-api',
              'memory-service': 'mcp-api',
              'meta-orchestrator': 'mcp-api',
              'compute-provider': 'mcp-api',
            };
            tracker.record({
              source: sourceMap[exec.id] ?? 'other',
              amount: exec.revenue,
              currency: 'USDC',
              activityId: exec.id,
            });
          }
        }
      }

      // 5. NESS MONITOR: Activity-based steady state (not customer-based)
      const autonomousNESS = getAutonomousNESS({
        targetMonthlyRevenue: this.config.nessTarget.monthlyRevenue,
        targetMonthlyCosts: this.config.nessTarget.monthlyCosts,
        activityCount: allocator.getActivities().filter(a => a.active).length,
      });
      const nessState = autonomousNESS.observe({
        monthlyRevenue: this.estimateMonthlyRevenue(),
        monthlyCosts: this.estimateMonthlyCosts(),
        roiPerActivity: currentROIs,
        allocations: currentAllocations,
      });
      result.nessDeviation = nessState.deviation;

      // 6. RECORD & INFER: Update beliefs, regime, temperature
      const efe = getEconomicEFE();
      const model = getGenerativeModel();
      const activityResults: Array<{ id: string; roi: number }> = [];

      for (const exec of executed) {
        const roi = exec.cost > 0 ? exec.revenue / exec.cost : exec.revenue > 0 ? 10 : 0;
        efe.recordExecution(exec.id, roi);
        activityResults.push({ id: exec.id, roi });
      }

      // Generative model inference: Bayesian belief update + regime + temperature
      const modelState = model.infer({
        activityResults,
        nessDeviation: nessState.deviation,
        contractionStable: contractionState.stable,
        logLipAvg: contraction.getLogLipAvg(),
        cycleCount: this.cycleCount,
      });

      // Feed adaptive temperature back to EFE for next cycle
      this.lastAdaptiveBeta = modelState.temperature.beta;

      // 6b. VARIATIONAL STEP: VFE + precision scoring + risk assessment
      const engine = getVariationalEngine();
      const currentBalance = this.config.seedCapital + this.totalRevenue - this.totalCosts;
      const varState = engine.step({
        activities: allocator.getActivities().filter(a => a.active),
        beliefs: model.beliefs,
        allocations: allocator.getAllocations(),
        observations: activityResults.map(r => ({ activityId: r.id, observedROI: r.roi })),
        regimeFactor: model.getRegimeFactor(),
        targetROI: 2.0 * model.getRegimeFactor(),
        currentBalance,
      });

      // Circuit breaker: if drawdown exceeds limit, pause risky activities
      if (varState.circuitBroken) {
        result.errors.push('CIRCUIT BREAKER: Max drawdown exceeded, pausing risky activities');
        this.pauseRiskyActivities(allocator);

        // Alert on circuit breaker
        if (this.config.liveMode || isLive()) {
          const alerts = getAlertSystem();
          alerts.error(
            'Circuit Breaker Triggered',
            `Max drawdown exceeded\\n` +
            `Current balance: $${currentBalance.toFixed(2)}\\n` +
            `Risky activities paused`
          );
        }
      }

      // Risk warnings
      if (varState.risk.warnings.length > 0) {
        result.errors.push(...varState.risk.warnings);
      }

      // 7. PHASE CHECK: Upgrade if threshold met
      const monthlyRevenue = this.estimateMonthlyRevenue();
      const newPhase = this.checkPhaseTransition(monthlyRevenue);
      if (newPhase !== this.currentPhase) {
        const oldPhase = this.currentPhase;
        this.currentPhase = newPhase;
        this.unlockPhaseActivities(newPhase);
        result.phaseChanged = true;

        // Alert on phase transition
        if (this.config.liveMode || isLive()) {
          const alerts = getAlertSystem();
          const phaseName = this.config.phases[newPhase]?.name ?? 'Unknown';
          alerts.success(
            'Phase Upgrade',
            `Advanced from Phase ${oldPhase} to Phase ${newPhase} (${phaseName})\\n` +
            `Monthly revenue: $${monthlyRevenue.toFixed(2)}\\n` +
            `New activities unlocked: ${this.config.phases[newPhase]?.activitiesUnlocked.join(', ')}`
          );
        }
      }

      // 8. MAINTENANCE: Process escrows, check bounty payouts
      await this.maintenance();

      // Log contraction warnings
      if (contractionState.warnings.length > 0) {
        result.errors.push(...contractionState.warnings);
      }

    } catch (error) {
      result.errors.push(String(error));
      this.errors.push(String(error));
    }

    result.duration = Date.now() - startTime;
    this.lastCycle = Date.now();
    return result;
  }

  /**
   * Start the autonomous loop.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    while (this.running) {
      await this.cycle();
      await sleep(this.config.cycleIntervalMs);
    }
  }

  /**
   * Stop the autonomous loop.
   */
  stop(): void {
    this.running = false;
  }

  /**
   * Get full controller state.
   */
  getState(): ControllerState {
    const fiber = getEconomicFiber();
    const allocator = getCapitalAllocator();
    const autonomousNESS = getAutonomousNESS();

    const global = fiber.getGlobalSection();
    const currentAllocations = this.getAllocationVector(allocator);
    const currentROIs = this.getROIVector(allocator);
    const autonomousState = autonomousNESS.observe({
      monthlyRevenue: this.estimateMonthlyRevenue(),
      monthlyCosts: this.estimateMonthlyCosts(),
      roiPerActivity: currentROIs,
      allocations: currentAllocations,
    });

    // Map AutonomousNESSState to legacy NESSState interface
    const balance = this.config.seedCapital + this.totalRevenue - this.totalCosts;
    const monthlyCosts = this.estimateMonthlyCosts();
    const runway = monthlyCosts > 0 ? balance / (monthlyCosts / 30) : Infinity;
    const nessState: NESSState = {
      deviation: autonomousState.deviation,
      solenoidalMagnitude: autonomousState.qGammaRatio,
      dissipativeMagnitude: 1.0 / Math.max(autonomousState.qGammaRatio, 0.01),
      qGammaRatio: autonomousState.qGammaRatio,
      convergenceRate: autonomousState.convergenceRate,
      estimatedCyclesToNESS: autonomousState.estimatedCyclesToNESS,
      atSteadyState: autonomousState.atSteadyState,
      runway,
    };

    const allocation = {
      hamiltonian: { q: currentAllocations, p: currentAllocations.map(() => 0) },
      allocations: allocator.getAllocations(),
      rois: new Map<string, number>(),
      totalBudget: allocator.getTotalBudget(),
      hamiltonianEnergy: 0,
      conservationErr: 0,
      lastUpdate: Date.now(),
    };

    return {
      phase: this.currentPhase,
      phaseName: this.config.phases[this.currentPhase]?.name ?? 'Unknown',
      cycleCount: this.cycleCount,
      totalRevenue: this.totalRevenue,
      totalCosts: this.totalCosts,
      currentBalance: this.config.seedCapital + this.totalRevenue - this.totalCosts,
      ness: nessState,
      allocation,
      global,
      activities: this.getActivityStatuses(),
      lastCycle: this.lastCycle,
      uptime: Date.now() - this.startedAt,
      startedAt: this.startedAt,
    };
  }

  /**
   * Get current phase info.
   */
  getCurrentPhase(): PhaseConfig {
    return this.config.phases[this.currentPhase] ?? this.config.phases[0];
  }

  /**
   * Check if the system is at NESS (self-sustaining).
   */
  isAtNESS(): boolean {
    const allocator = getCapitalAllocator();
    const autonomousNESS = getAutonomousNESS();
    const state = autonomousNESS.observe({
      monthlyRevenue: this.estimateMonthlyRevenue(),
      monthlyCosts: this.estimateMonthlyCosts(),
      roiPerActivity: this.getROIVector(allocator),
      allocations: this.getAllocationVector(allocator),
    });
    return state.atSteadyState;
  }

  /**
   * Get monthly revenue estimate (extrapolated from recent data).
   */
  estimateMonthlyRevenue(): number {
    const uptimeMonths = Math.max((Date.now() - this.startedAt) / (30 * 86400000), 0.001);
    return this.totalRevenue / uptimeMonths;
  }

  /**
   * Get monthly cost estimate (extrapolated from recent data).
   */
  private estimateMonthlyCosts(): number {
    const uptimeMonths = Math.max((Date.now() - this.startedAt) / (30 * 86400000), 0.001);
    return this.totalCosts / uptimeMonths;
  }

  /**
   * Get allocation vector for contraction monitoring.
   */
  private getAllocationVector(allocator: ReturnType<typeof getCapitalAllocator>): number[] {
    const activities = allocator.getActivities().filter(a => a.active);
    const allocMap = allocator.getAllocations();
    return activities.map(a => allocMap.get(a.id) ?? 0);
  }

  /**
   * Get ROI vector for contraction monitoring.
   */
  private getROIVector(allocator: ReturnType<typeof getCapitalAllocator>): number[] {
    const activities = allocator.getActivities().filter(a => a.active);
    const fiber = getEconomicFiber();
    return activities.map(a => fiber.getFiber(a.id)?.roi ?? a.estimatedROI);
  }

  // ============================================================================
  // Private
  // ============================================================================

  private async executeActivities(): Promise<{ id: string; revenue: number; cost: number }[]> {
    const results: { id: string; revenue: number; cost: number }[] = [];
    const allocator = getCapitalAllocator();
    const efe = getEconomicEFE();
    const model = getGenerativeModel();

    const activeActivities = allocator.getActivities().filter(a => a.active);
    const allocations = allocator.getAllocations();

    // Score activities using belief-informed EFE
    // Regime factor adjusts expected ROIs for current market conditions
    const regimeFactor = model.getRegimeFactor();
    const targetROI = 2.0 * regimeFactor;  // Adjust target by regime
    const scores = efe.scoreActivities(activeActivities, allocations, targetROI);

    // Apply temporal planning: rank by G_now + γ × E[G_next]
    const plans = model.planner.rankWithLookahead(
      scores, model.beliefs, activeActivities, allocations, regimeFactor
    );

    // Select via Boltzmann sampling with adaptive temperature
    const selected = new Set<string>();
    let executed = 0;

    // Use plan ordering as primary, with stochastic selection via adaptive β
    const candidateIds = plans.map(p => p.immediateAction);

    while (executed < this.config.maxConcurrentActivities && selected.size < candidateIds.length) {
      // Build remaining scores for Boltzmann selection
      const remainingScores = scores.filter(s =>
        candidateIds.includes(s.activityId) && !selected.has(s.activityId)
      );
      if (remainingScores.length === 0) break;

      // Boltzmann selection with adaptive β
      const activityId = this.boltzmannSelect(remainingScores, this.lastAdaptiveBeta);
      if (!activityId || selected.has(activityId)) break;

      selected.add(activityId);

      try {
        const result = await this.executeActivity(activityId);
        if (result) {
          results.push(result);
          executed++;
        }
      } catch (error) {
        this.errors.push(`${activityId}: ${error}`);
      }
    }

    return results;
  }

  /**
   * Boltzmann (softmax) action selection with given temperature β.
   */
  private boltzmannSelect(scores: EFEScore[], beta: number): string | null {
    if (scores.length === 0) return null;

    const negG = scores.map(s => -s.G * beta);
    const maxNegG = Math.max(...negG);
    const expScores = negG.map(g => Math.exp(g - maxNegG));
    const sumExp = expScores.reduce((s, e) => s + e, 0);
    const probs = expScores.map(e => e / sumExp);

    const r = Math.random();
    let cumProb = 0;
    for (let i = 0; i < probs.length; i++) {
      cumProb += probs[i];
      if (r <= cumProb) return scores[i].activityId;
    }
    return scores[0].activityId;
  }

  private async executeActivity(activityId: string): Promise<{ id: string; revenue: number; cost: number } | null> {
    switch (activityId) {
      case 'keeper': {
        if (this.config.liveMode || isLive()) {
          // LIVE: Check wallet has gas before keeper operations
          const { getLiveWallet } = await import('./live/wallet.js');
          try {
            const wallet = getLiveWallet();
            const balances = await wallet.getBalances();
            if (balances.eth === 0n) {
              console.log('[Live] Keeper: No ETH for gas, skipping');
              return null;
            }
            // Execute keeper with real wallet
            const keeper = getKeeperExecutor();
            if (!keeper.isOperational()) return null;
            const exec = await keeper.executeNext();
            if (exec?.success) {
              return { id: activityId, revenue: exec.reward, cost: exec.gasCost };
            }
          } catch (e) {
            console.warn('[Live] Keeper error:', e);
          }
          return null;
        }

        // SIMULATED
        const keeper = getKeeperExecutor();
        if (!keeper.isOperational()) return null;
        const exec = await keeper.executeNext();
        if (exec?.success) {
          return { id: activityId, revenue: exec.reward, cost: exec.gasCost };
        }
        return null;
      }

      case 'bounty-hunter': {
        if (this.config.liveMode || isLive()) {
          // LIVE: Use real DeWork API
          const dework = getDeworkConnector();
          const bounties = await dework.scanBounties(['solidity', 'typescript', 'smart-contract', 'ai']);
          // Check payouts on previously claimed bounties
          let revenue = 0;
          for (const b of bounties.filter(b => b.status === 'completed')) {
            const payout = await dework.getPayoutStatus(b.id);
            if (payout.paid) {
              revenue += b.reward;
            }
          }
          // Report discovered opportunities (bounties are worked asynchronously)
          const viable = bounties.filter(b => b.reward >= 50 && b.status === 'open');
          if (viable.length > 0) {
            console.log(`[Live] Found ${viable.length} viable bounties, best: $${viable[0].reward}`);
          }
          return revenue > 0 ? { id: activityId, revenue, cost: 0 } : null;
        }

        // SIMULATED: Use internal bounty hunter
        const hunter = getBountyHunter();
        if (hunter.needsScan()) {
          await hunter.scan();
        }
        const payouts = await hunter.checkPayouts();
        const revenue = payouts
          .filter(p => p.status === 'accepted')
          .reduce((s, p) => s + (p.payout ?? 0), 0);
        const best = hunter.selectBest();
        if (best) {
          await hunter.claim(best.id);
        }
        return revenue > 0 ? { id: activityId, revenue, cost: 0.10 } : null;
      }

      case 'mcp-marketplace': {
        if (this.config.liveMode || isLive()) {
          // LIVE: Check Cloudflare Worker stats for real revenue
          const cf = getCloudflareConnector();
          if (cf.isConfigured()) {
            const stats = await cf.getWorkerStats('genesis-defi-scanner');
            if (stats && stats.requests > 0) {
              // Revenue = requests × price per call ($0.005)
              const revenue = stats.requests * 0.005;
              console.log(`[Live] MCP marketplace: ${stats.requests} requests, $${revenue.toFixed(4)} revenue`);
              return { id: activityId, revenue, cost: 0 };
            }
          }
          return null;
        }

        // SIMULATED
        const marketplace = getMCPMarketplace();
        const stats = marketplace.getStats();
        return stats.totalRevenue > 0
          ? { id: activityId, revenue: stats.totalRevenue, cost: 0 }
          : null;
      }

      case 'x402-facilitator': {
        const facilitator = getX402Facilitator();
        // Process expired escrows
        facilitator.processExpiredEscrows();
        // Revenue is recorded in real-time
        return null;
      }

      case 'content-engine': {
        const engine = getContentEngine();
        // Scan for topics if needed
        if (engine.needsTopicScan()) {
          await engine.scanTopics();
        }
        // Publish ready content
        if (engine.needsPublish()) {
          const piece = await engine.generate();
          if (piece) {
            await engine.publish(piece.id);
          }
        }
        // Collect subscription/tip revenue
        const contentRevenue = await engine.collectRevenue();
        return contentRevenue > 0 ? { id: activityId, revenue: contentRevenue, cost: 0.05 } : null;
      }

      case 'smart-contract-auditor': {
        const auditor = getSmartContractAuditor();
        // Find new audit opportunities
        if (auditor.hasCapacity()) {
          const opportunities = await auditor.findOpportunities();
          if (opportunities.length > 0) {
            await auditor.acceptRequest(opportunities[0]);
          }
        }
        // Execute pending audits
        const stats = auditor.getStats();
        const auditRevenue = stats.totalRevenue;
        return auditRevenue > 0 ? { id: activityId, revenue: auditRevenue, cost: 0.20 } : null;
      }

      case 'memory-service': {
        const memService = getMemoryService();
        // Bill active subscriptions
        const subRevenue = await memService.billSubscriptions();
        // Per-request revenue is recorded in real-time
        const memStats = memService.getStats();
        return memStats.totalRevenue > 0
          ? { id: activityId, revenue: memStats.totalRevenue, cost: 0 }
          : null;
      }

      case 'meta-orchestrator': {
        const orchestrator = getMetaOrchestrator();
        // Discover available agents
        await orchestrator.discoverAgents();
        // Revenue is from coordination fees on task execution
        const orchStats = orchestrator.getStats();
        return orchStats.totalRevenue > 0
          ? { id: activityId, revenue: orchStats.totalRevenue, cost: orchStats.totalAgentPayouts }
          : null;
      }

      case 'yield-optimizer': {
        if (this.config.liveMode || isLive()) {
          // LIVE: Use DeFiLlama to scan real yields on Base
          const defi = getDefiConnector();
          const pools = await defi.scanYields('base');
          if (pools.length > 0) {
            const bestPool = pools.reduce((best, p) => p.apy > best.apy ? p : best, pools[0]);
            console.log(`[Live] Yield scan: ${pools.length} pools, best: ${bestPool.protocol} @ ${bestPool.apy.toFixed(1)}% APY`);
            // In live mode, yield is harvested from on-chain positions
            // For now, report discovered opportunities (actual deployment requires wallet tx)
          }
          return null; // Revenue comes from on-chain harvest, not scanning
        }

        // SIMULATED
        const optimizer = getYieldOptimizer();
        await optimizer.scanOpportunities();
        if (optimizer.needsRebalance()) {
          await optimizer.rebalance();
        }
        const harvested = await optimizer.harvest();
        const yieldStats = optimizer.getStats();
        return harvested > 0
          ? { id: activityId, revenue: harvested, cost: yieldStats.totalGasCost }
          : null;
      }

      case 'compute-provider': {
        const compute = getComputeProvider();
        // Check for available jobs
        const jobs = await compute.checkForJobs();
        for (const job of jobs.slice(0, 3)) {
          await compute.acceptJob(job);
        }
        // Harvest completed job payments
        const computeRevenue = await compute.harvestCompleted();
        return computeRevenue > 0
          ? { id: activityId, revenue: computeRevenue, cost: 0.10 }
          : null;
      }

      case 'grants': {
        const grants = getGrantsManager();
        // Scan for new grant programs
        await grants.scanPrograms();
        // Check outcomes of submitted applications
        const outcomes = await grants.checkOutcomes();
        const grantRevenue = outcomes
          .filter(o => o.status === 'accepted')
          .reduce((s, o) => s + (o.outcome?.amount ?? 0), 0);
        return grantRevenue > 0 ? { id: activityId, revenue: grantRevenue, cost: 0 } : null;
      }

      case 'cross-l2-arb': {
        const arb = getCrossL2Arbitrageur();
        // Scan for arbitrage opportunities
        if (arb.needsScan()) {
          await arb.scan();
        }
        // Execute best opportunity
        const arbResult = await arb.executeBest();
        if (arbResult && arbResult.profit > 0) {
          return { id: activityId, revenue: arbResult.profit, cost: arbResult.gasCost };
        }
        return null;
      }

      default:
        return null;
    }
  }

  private async maintenance(): Promise<void> {
    // Process x402 escrow expirations
    const facilitator = getX402Facilitator();
    facilitator.processExpiredEscrows();

    // Check bounty payouts
    const hunter = getBountyHunter();
    await hunter.checkPayouts();

    // Update budget with current balance
    const allocator = getCapitalAllocator();
    const currentBalance = this.config.seedCapital + this.totalRevenue - this.totalCosts;
    if (currentBalance > 0) {
      allocator.updateBudget(currentBalance);
    }
  }

  private checkPhaseTransition(monthlyRevenue: number): number {
    let phase = 0;
    for (let i = 0; i < this.config.phases.length; i++) {
      if (monthlyRevenue >= this.config.phases[i].minRevenue) {
        phase = i;
      }
    }
    return phase;
  }

  private unlockPhaseActivities(phase: number): void {
    const phaseConfig = this.config.phases[phase];
    if (!phaseConfig) return;

    const allocator = getCapitalAllocator();
    for (const activityId of phaseConfig.activitiesUnlocked) {
      allocator.setActivityActive(activityId, true);
    }
  }

  /**
   * Pause high-risk activities when circuit breaker triggers.
   * Preserves zero-capital and low-risk activities.
   */
  private pauseRiskyActivities(allocator: ReturnType<typeof getCapitalAllocator>): void {
    const riskyTiers = ['B', 'C', 'D']; // Pause capital-intensive activities
    for (const activity of allocator.getActivities()) {
      if (riskyTiers.includes(activity.tier) && activity.riskLevel > 0.4) {
        allocator.setActivityActive(activity.id, false);
      }
    }
  }

  private getActivityStatuses(): ActivityStatus[] {
    const allocator = getCapitalAllocator();
    const fiber = getEconomicFiber();
    const allocations = allocator.getAllocations();

    return allocator.getActivities().map(a => {
      const f = fiber.getFiber(a.id);
      return {
        id: a.id,
        name: a.name,
        tier: a.tier,
        active: a.active,
        allocation: allocations.get(a.id) ?? 0,
        roi: f?.roi ?? a.estimatedROI,
        revenue: f?.totalEarned ?? 0,
        costs: f?.totalSpent ?? 0,
        lastExecution: f?.lastUpdate ?? 0,
        operational: a.active && (allocations.get(a.id) ?? 0) >= a.capitalRequired,
      };
    });
  }
}

// ============================================================================
// Utility
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Singleton
// ============================================================================

let controllerInstance: AutonomousController | null = null;

export function getAutonomousController(
  config?: Partial<AutonomousConfig>
): AutonomousController {
  if (!controllerInstance) {
    controllerInstance = new AutonomousController(config);
  }
  return controllerInstance;
}

export function resetAutonomousController(): void {
  controllerInstance?.stop();
  controllerInstance = null;
}
