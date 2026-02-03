/**
 * Genesis v16 Unified Orchestrator
 *
 * Master orchestrator that coordinates all autonomous revenue systems:
 * - Bounty hunting and execution
 * - DeFi yield optimization
 * - RSI (Recursive Self-Improvement)
 * - Revenue tracking and safety
 */

import { getBountyExecutor, BountyExecutor } from './economy/bounty-executor.js';
import { getYieldOptimizer, YieldOptimizer, type AllocationPlan } from './economy/live/yield-optimizer.js';
import { getRevenueTracker, type RevenueStats } from './economy/live/revenue-tracker.js';
import { getAlertSystem } from './economy/live/alerts.js';
import { getLiveWallet } from './economy/live/wallet.js';
import { getProtocolStats } from './economy/live/connectors/protocols.js';

// ============================================================================
// Types
// ============================================================================

export interface OrchestratorConfig {
  // Enable/disable subsystems
  enableBounties: boolean;
  enableYield: boolean;
  enableRSI: boolean;

  // Safety limits
  maxDailySpend: number; // USD
  maxSingleTx: number; // USD
  minReserve: number; // USD (minimum balance to keep)

  // Scheduling
  bountyIntervalMs: number;
  yieldIntervalMs: number;
  rsiIntervalMs: number;

  // Dry run mode
  dryRun: boolean;
}

export interface SystemStatus {
  running: boolean;
  uptime: number;
  startTime: number;
  cycleCount: number;
  revenue: RevenueStats;
  balance: {
    usdc: number;
    eth: number;
    total: number;
  };
  subsystems: {
    bounties: { enabled: boolean; lastRun: number; successCount: number; failCount: number };
    yield: { enabled: boolean; lastRun: number; plan: AllocationPlan | null };
    rsi: { enabled: boolean; lastRun: number; improvementsApplied: number };
  };
  health: {
    overall: 'healthy' | 'degraded' | 'critical';
    issues: string[];
  };
}

export interface CycleResult {
  cycle: number;
  timestamp: number;
  duration: number;
  bountyResult?: { success: boolean; revenue: number; bountyId?: string };
  yieldResult?: { success: boolean; rebalanced: boolean; expectedApy: number };
  rsiResult?: { success: boolean; improvementsApplied: number };
  errors: string[];
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: OrchestratorConfig = {
  enableBounties: true,
  enableYield: true,
  enableRSI: false, // Requires explicit activation

  maxDailySpend: 100, // $100/day max
  maxSingleTx: 50, // $50 max per tx
  minReserve: 50, // Keep $50 minimum

  bountyIntervalMs: 30 * 60 * 1000, // 30 minutes
  yieldIntervalMs: 60 * 60 * 1000, // 1 hour
  rsiIntervalMs: 24 * 60 * 60 * 1000, // 24 hours

  dryRun: true, // Safe by default
};

// ============================================================================
// Genesis v16 Orchestrator
// ============================================================================

export class GenesisV16Orchestrator {
  private config: OrchestratorConfig;
  private running = false;
  private startTime = 0;
  private cycleCount = 0;
  private dailySpend = 0;
  private dailySpendResetTime = 0;

  private bountyExecutor: BountyExecutor | null = null;
  private yieldOptimizer: YieldOptimizer | null = null;

  private subsystemStats = {
    bounties: { lastRun: 0, successCount: 0, failCount: 0 },
    yield: { lastRun: 0, plan: null as AllocationPlan | null },
    rsi: { lastRun: 0, improvementsApplied: 0 },
  };

  private cycleHistory: CycleResult[] = [];
  private maxHistory = 100;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize all subsystems
   */
  async initialize(): Promise<void> {
    console.log('[GenesisV16] Initializing orchestrator...');

    if (this.config.enableBounties) {
      this.bountyExecutor = getBountyExecutor();
      console.log('[GenesisV16] Bounty executor initialized');
    }

    if (this.config.enableYield) {
      this.yieldOptimizer = getYieldOptimizer({
        maxAllocation: 0.25, // Conservative
        riskTolerance: 'moderate',
      });
      const stats = getProtocolStats();
      console.log(`[GenesisV16] Yield optimizer initialized (${stats.total} protocols)`);
    }

    // Check wallet connection
    const wallet = getLiveWallet();
    if (!wallet.isConnected() && !this.config.dryRun) {
      console.log('[GenesisV16] WARNING: Wallet not connected, switching to dry-run mode');
      this.config.dryRun = true;
    }

    console.log(`[GenesisV16] Mode: ${this.config.dryRun ? 'DRY RUN' : 'LIVE'}`);
  }

  /**
   * Run a single orchestration cycle
   */
  async runCycle(): Promise<CycleResult> {
    const cycleStart = Date.now();
    const cycle = ++this.cycleCount;
    const errors: string[] = [];

    const result: CycleResult = {
      cycle,
      timestamp: cycleStart,
      duration: 0,
      errors: [],
    };

    console.log(`\n[GenesisV16] === Cycle ${cycle} ===`);

    // Reset daily spend if new day
    this.checkDailySpendReset();

    // Check safety constraints
    const safetyCheck = await this.checkSafetyConstraints();
    if (!safetyCheck.ok) {
      console.log(`[GenesisV16] Safety constraint violated: ${safetyCheck.reason}`);
      result.errors.push(`Safety: ${safetyCheck.reason}`);
      result.duration = Date.now() - cycleStart;
      return result;
    }

    // Run bounty subsystem
    if (this.config.enableBounties && this.shouldRunBounties()) {
      try {
        result.bountyResult = await this.runBountySubsystem();
        this.subsystemStats.bounties.lastRun = Date.now();
        if (result.bountyResult.success) {
          this.subsystemStats.bounties.successCount++;
        } else {
          this.subsystemStats.bounties.failCount++;
        }
      } catch (error) {
        const msg = `Bounty error: ${error}`;
        console.log(`[GenesisV16] ${msg}`);
        errors.push(msg);
        this.subsystemStats.bounties.failCount++;
      }
    }

    // Run yield subsystem
    if (this.config.enableYield && this.shouldRunYield()) {
      try {
        result.yieldResult = await this.runYieldSubsystem();
        this.subsystemStats.yield.lastRun = Date.now();
        this.subsystemStats.yield.plan = result.yieldResult.rebalanced ? (this.yieldOptimizer?.getStatus().lastOptimization || null) : null;
      } catch (error) {
        const msg = `Yield error: ${error}`;
        console.log(`[GenesisV16] ${msg}`);
        errors.push(msg);
      }
    }

    // Run RSI subsystem
    if (this.config.enableRSI && this.shouldRunRSI()) {
      try {
        result.rsiResult = await this.runRSISubsystem();
        this.subsystemStats.rsi.lastRun = Date.now();
        this.subsystemStats.rsi.improvementsApplied += result.rsiResult.improvementsApplied;
      } catch (error) {
        const msg = `RSI error: ${error}`;
        console.log(`[GenesisV16] ${msg}`);
        errors.push(msg);
      }
    }

    result.errors = errors;
    result.duration = Date.now() - cycleStart;

    // Record in history
    this.cycleHistory.push(result);
    if (this.cycleHistory.length > this.maxHistory) {
      this.cycleHistory = this.cycleHistory.slice(-this.maxHistory);
    }

    // Log summary
    this.logCycleSummary(result);

    return result;
  }

  /**
   * Run the bounty hunting subsystem
   */
  private async runBountySubsystem(): Promise<{ success: boolean; revenue: number; bountyId?: string }> {
    if (!this.bountyExecutor) {
      return { success: false, revenue: 0 };
    }

    console.log('[GenesisV16] Running bounty subsystem...');

    const result = await this.bountyExecutor.executeLoop();

    if (result?.status === 'success') {
      // Revenue is tracked by bounty executor itself via RSI feedback
      // Here we just report the result
      return {
        success: true,
        revenue: 0, // Actual amount tracked separately
        bountyId: result.bountyId,
      };
    }

    return { success: false, revenue: 0, bountyId: result?.bountyId };
  }

  /**
   * Run the yield optimization subsystem
   */
  private async runYieldSubsystem(): Promise<{ success: boolean; rebalanced: boolean; expectedApy: number }> {
    if (!this.yieldOptimizer) {
      return { success: false, rebalanced: false, expectedApy: 0 };
    }

    console.log('[GenesisV16] Running yield optimizer...');

    const result = await this.yieldOptimizer.autoOptimize(this.config.dryRun);

    return {
      success: result.success,
      rebalanced: result.executedActions > 0,
      expectedApy: result.plan.expectedApy,
    };
  }

  /**
   * Run the RSI subsystem
   */
  private async runRSISubsystem(): Promise<{ success: boolean; improvementsApplied: number }> {
    // RSI requires careful implementation - returning stub for now
    console.log('[GenesisV16] RSI subsystem not yet fully integrated');
    return { success: false, improvementsApplied: 0 };
  }

  /**
   * Check safety constraints before executing
   */
  private async checkSafetyConstraints(): Promise<{ ok: boolean; reason?: string }> {
    // Check daily spend limit
    if (this.dailySpend >= this.config.maxDailySpend) {
      return { ok: false, reason: `Daily spend limit reached: $${this.dailySpend.toFixed(2)}/${this.config.maxDailySpend}` };
    }

    // Check minimum reserve
    if (!this.config.dryRun) {
      const wallet = getLiveWallet();
      if (wallet.isConnected()) {
        const balances = await wallet.getBalances();
        const usdcBalance = Number(balances.usdc) / 1e6;

        if (usdcBalance < this.config.minReserve) {
          return { ok: false, reason: `Below minimum reserve: $${usdcBalance.toFixed(2)} < $${this.config.minReserve}` };
        }
      }
    }

    return { ok: true };
  }

  /**
   * Check and reset daily spend if new day
   */
  private checkDailySpendReset(): void {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    if (now - this.dailySpendResetTime > dayMs) {
      this.dailySpend = 0;
      this.dailySpendResetTime = now;
      console.log('[GenesisV16] Daily spend limit reset');
    }
  }

  /**
   * Check if bounty subsystem should run
   */
  private shouldRunBounties(): boolean {
    const elapsed = Date.now() - this.subsystemStats.bounties.lastRun;
    return elapsed >= this.config.bountyIntervalMs || this.subsystemStats.bounties.lastRun === 0;
  }

  /**
   * Check if yield subsystem should run
   */
  private shouldRunYield(): boolean {
    const elapsed = Date.now() - this.subsystemStats.yield.lastRun;
    return elapsed >= this.config.yieldIntervalMs || this.subsystemStats.yield.lastRun === 0;
  }

  /**
   * Check if RSI subsystem should run
   */
  private shouldRunRSI(): boolean {
    const elapsed = Date.now() - this.subsystemStats.rsi.lastRun;
    return elapsed >= this.config.rsiIntervalMs || this.subsystemStats.rsi.lastRun === 0;
  }

  /**
   * Log cycle summary
   */
  private logCycleSummary(result: CycleResult): void {
    const parts: string[] = [`Cycle ${result.cycle} completed in ${result.duration}ms`];

    if (result.bountyResult) {
      parts.push(`Bounty: ${result.bountyResult.success ? `$${result.bountyResult.revenue}` : 'failed'}`);
    }

    if (result.yieldResult) {
      parts.push(`Yield: ${result.yieldResult.rebalanced ? 'rebalanced' : 'no change'} (${result.yieldResult.expectedApy.toFixed(2)}% APY)`);
    }

    if (result.errors.length > 0) {
      parts.push(`Errors: ${result.errors.length}`);
    }

    console.log(`[GenesisV16] ${parts.join(' | ')}`);
  }

  /**
   * Get current system status
   */
  async getStatus(): Promise<SystemStatus> {
    const revenueTracker = getRevenueTracker();
    const revenue = revenueTracker.getStats();

    let balance = { usdc: 0, eth: 0, total: 0 };
    const wallet = getLiveWallet();
    if (wallet.isConnected()) {
      const balances = await wallet.getBalances();
      balance.usdc = Number(balances.usdc) / 1e6;
      balance.eth = Number(balances.eth) / 1e18;
      balance.total = balance.usdc; // + ETH value
    }

    const issues: string[] = [];
    let health: 'healthy' | 'degraded' | 'critical' = 'healthy';

    // Check for issues
    if (balance.total < this.config.minReserve) {
      issues.push('Balance below minimum reserve');
      health = 'degraded';
    }

    if (this.dailySpend >= this.config.maxDailySpend * 0.8) {
      issues.push('Approaching daily spend limit');
      health = 'degraded';
    }

    const recentErrors = this.cycleHistory
      .slice(-5)
      .filter(c => c.errors.length > 0)
      .length;

    if (recentErrors >= 3) {
      issues.push('Multiple recent errors');
      health = 'degraded';
    }

    return {
      running: this.running,
      uptime: this.running ? Date.now() - this.startTime : 0,
      startTime: this.startTime,
      cycleCount: this.cycleCount,
      revenue,
      balance,
      subsystems: {
        bounties: {
          enabled: this.config.enableBounties,
          lastRun: this.subsystemStats.bounties.lastRun,
          successCount: this.subsystemStats.bounties.successCount,
          failCount: this.subsystemStats.bounties.failCount,
        },
        yield: {
          enabled: this.config.enableYield,
          lastRun: this.subsystemStats.yield.lastRun,
          plan: this.subsystemStats.yield.plan,
        },
        rsi: {
          enabled: this.config.enableRSI,
          lastRun: this.subsystemStats.rsi.lastRun,
          improvementsApplied: this.subsystemStats.rsi.improvementsApplied,
        },
      },
      health: { overall: health, issues },
    };
  }

  /**
   * Get cycle history
   */
  getHistory(): CycleResult[] {
    return [...this.cycleHistory];
  }

  /**
   * Get configuration
   */
  getConfig(): OrchestratorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<OrchestratorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Start continuous execution
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log('[GenesisV16] Already running');
      return;
    }

    await this.initialize();
    this.running = true;
    this.startTime = Date.now();

    console.log('[GenesisV16] Starting autonomous operation...');

    const alerts = getAlertSystem();
    await alerts.success('Genesis v16 Started', `Mode: ${this.config.dryRun ? 'Dry Run' : 'LIVE'}`);

    // Run initial cycle
    await this.runCycle();
  }

  /**
   * Stop execution
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;
    console.log('[GenesisV16] Stopped');

    const alerts = getAlertSystem();
    await alerts.warning('Genesis v16 Stopped', `Ran ${this.cycleCount} cycles`);
  }

  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.running;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let orchestratorInstance: GenesisV16Orchestrator | null = null;

export function getGenesisV16Orchestrator(config?: Partial<OrchestratorConfig>): GenesisV16Orchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new GenesisV16Orchestrator(config);
  }
  return orchestratorInstance;
}

export function resetGenesisV16Orchestrator(): void {
  orchestratorInstance = null;
}
