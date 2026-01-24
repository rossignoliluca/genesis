/**
 * Autonomous Economic Controller
 *
 * The central orchestrator for Genesis's autonomous revenue generation.
 * Coordinates all generators, infrastructure services, and asset managers.
 *
 * Architecture:
 *   AutonomousController
 *     ├── CapitalAllocator (leapfrog symplectic integrator)
 *     ├── Generators/ (active revenue: keeper, bounties, content)
 *     ├── Infrastructure/ (agent economy: MCP marketplace, x402, reputation)
 *     ├── Assets/ (passive: yield, compute, domains)
 *     └── NESSMonitor (convergence tracking)
 *
 * Control loop:
 *   1. Observe: Read balances, check pending payouts
 *   2. Allocate: Leapfrog step to rebalance portfolio
 *   3. Execute: Run highest-priority activities
 *   4. Record: Update fiber bundle with costs/revenue
 *   5. Monitor: Check NESS convergence, contraction stability
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
import { getAutonomousNESS, getEconomicEFE, getEconomicContraction } from './economic-intelligence.js';
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

// ============================================================================
// Types
// ============================================================================

export interface AutonomousConfig {
  seedCapital: number;                 // Initial $ (default $2,000)
  cycleIntervalMs: number;             // ms between controller cycles
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
  private errors: string[] = [];
  private running: boolean = false;

  constructor(config?: Partial<AutonomousConfig>) {
    this.config = {
      seedCapital: config?.seedCapital ?? 2000,
      cycleIntervalMs: config?.cycleIntervalMs ?? 60000,  // 1 minute
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

      // 6. RECORD EFE RESULTS: Update intelligence history
      const efe = getEconomicEFE();
      for (const exec of executed) {
        const roi = exec.cost > 0 ? exec.revenue / exec.cost : exec.revenue > 0 ? 10 : 0;
        efe.recordExecution(exec.id, roi);
      }

      // 7. PHASE CHECK: Upgrade if threshold met
      const monthlyRevenue = this.estimateMonthlyRevenue();
      const newPhase = this.checkPhaseTransition(monthlyRevenue);
      if (newPhase !== this.currentPhase) {
        this.currentPhase = newPhase;
        this.unlockPhaseActivities(newPhase);
        result.phaseChanged = true;
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

    const activeActivities = allocator.getActivities().filter(a => a.active);
    const allocations = allocator.getAllocations();

    // Score all activities using Expected Free Energy
    const scores = efe.scoreActivities(activeActivities, allocations);

    // Select activities via Boltzmann sampling (Active Inference)
    const selected = new Set<string>();
    let executed = 0;

    while (executed < this.config.maxConcurrentActivities && selected.size < activeActivities.length) {
      const remainingScores = scores.filter(s => !selected.has(s.activityId));
      if (remainingScores.length === 0) break;

      const activityId = efe.selectAction(remainingScores);
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

  private async executeActivity(activityId: string): Promise<{ id: string; revenue: number; cost: number } | null> {
    switch (activityId) {
      case 'keeper': {
        const keeper = getKeeperExecutor();
        if (!keeper.isOperational()) return null;
        const exec = await keeper.executeNext();
        if (exec?.success) {
          return { id: activityId, revenue: exec.reward, cost: exec.gasCost };
        }
        return null;
      }

      case 'bounty-hunter': {
        const hunter = getBountyHunter();
        // Scan for new bounties if needed
        if (hunter.needsScan()) {
          await hunter.scan();
        }
        // Check for payouts on submitted bounties
        const payouts = await hunter.checkPayouts();
        const revenue = payouts
          .filter(p => p.status === 'accepted')
          .reduce((s, p) => s + (p.payout ?? 0), 0);
        // Try to claim and work on a new bounty
        const best = hunter.selectBest();
        if (best) {
          await hunter.claim(best.id);
          // Bounty work is async - will be submitted in future cycles
        }
        return revenue > 0 ? { id: activityId, revenue, cost: 0.10 } : null;
      }

      case 'mcp-marketplace': {
        const marketplace = getMCPMarketplace();
        const stats = marketplace.getStats();
        // Revenue is recorded in real-time via handleCall
        // Here we just report accumulated daily revenue
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
        const optimizer = getYieldOptimizer();
        // Scan for opportunities periodically
        await optimizer.scanOpportunities();
        // Rebalance if needed
        if (optimizer.needsRebalance()) {
          await optimizer.rebalance();
        }
        // Harvest yields
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
