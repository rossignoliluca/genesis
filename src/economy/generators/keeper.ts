/**
 * Keep3r Network Job Executor
 *
 * Executes maintenance jobs on Keep3r Network and Gelato for DeFi protocols.
 * Revenue model: gas cost + 20% premium per job execution.
 *
 * Requirements:
 *   - Capital: $300-500 KP3R bond (refundable)
 *   - Identity: Wallet only (no KYC)
 *   - Revenue: $5-50/day depending on gas and jobs available
 *
 * Jobs include:
 *   - Harvest (yield farming strategies)
 *   - Liquidation triggers
 *   - Oracle updates
 *   - Rebalancing
 *   - Upkeep (Chainlink Automation compatible)
 *
 * Reference: https://keep3r.network
 */

import { getEconomicFiber } from '../fiber.js';
import { getLiveWallet, type Address } from '../live/wallet.js';
import { getRevenueTracker } from '../live/revenue-tracker.js';
import { getGasManager } from '../live/gas-manager.js';
import { getPriceFeed } from '../live/price-feeds.js';
import { parseAbi } from 'viem';

// ============================================================================
// Types
// ============================================================================

export interface KeeperJob {
  id: string;
  protocol: string;
  jobAddress: string;
  chain: 'ethereum' | 'base' | 'arbitrum' | 'optimism' | 'polygon';
  type: 'harvest' | 'liquidate' | 'oracle' | 'rebalance' | 'upkeep';
  estimatedGas: number;       // Gas units
  estimatedReward: number;    // $ reward (gas + premium)
  lastExecution: number;      // Timestamp
  cooldownMs: number;         // Min ms between executions
  active: boolean;
}

export interface KeeperExecution {
  jobId: string;
  txHash?: string;
  gasUsed: number;
  gasCost: number;            // $ spent on gas
  reward: number;             // $ earned
  profit: number;             // reward - gasCost
  timestamp: number;
  success: boolean;
  error?: string;
}

export interface KeeperStats {
  totalExecutions: number;
  successfulExecutions: number;
  totalProfit: number;
  totalGasCost: number;
  totalReward: number;
  averageProfitPerJob: number;
  activeJobs: number;
  bondAmount: number;
  lastExecution: number;
}

export interface KeeperConfig {
  maxGasPrice: number;         // Max gas price in gwei (skip if too expensive)
  minProfitThreshold: number;  // Min $ profit to execute
  bondAmount: number;          // KP3R bond in $
  chains: string[];            // Active chains
  jobTypes: string[];          // Active job types
  maxConcurrentJobs: number;   // Parallel execution limit
}

// ============================================================================
// Contract ABIs
// ============================================================================

// Generic Keeper Job interface (IKeep3rJob compatible)
const KEEPER_JOB_ABI = parseAbi([
  'function work() external',
  'function workable() view returns (bool)',
  'function lastWorkAt() view returns (uint256)',
]);

// Chainlink Automation compatible interface
const AUTOMATION_ABI = parseAbi([
  'function performUpkeep(bytes calldata performData) external',
  'function checkUpkeep(bytes calldata checkData) view returns (bool upkeepNeeded, bytes memory performData)',
]);

// ============================================================================
// Keeper Executor
// ============================================================================

export class KeeperExecutor {
  private config: KeeperConfig;
  private jobs: Map<string, KeeperJob> = new Map();
  private executions: KeeperExecution[] = [];
  private bonded: boolean = false;
  private readonly maxExecutionLog = 500;
  private readonly fiberId = 'keeper';

  constructor(config?: Partial<KeeperConfig>) {
    this.config = {
      maxGasPrice: config?.maxGasPrice ?? 30,        // 30 gwei
      minProfitThreshold: config?.minProfitThreshold ?? 0.50,  // $0.50 min profit
      bondAmount: config?.bondAmount ?? 400,          // $400 KP3R bond
      chains: config?.chains ?? ['base', 'arbitrum', 'optimism'],
      jobTypes: config?.jobTypes ?? ['harvest', 'upkeep', 'oracle'],
      maxConcurrentJobs: config?.maxConcurrentJobs ?? 3,
    };

    // Register with fiber bundle
    getEconomicFiber().registerModule(this.fiberId);
  }

  /**
   * Initialize: bond KP3R tokens and discover available jobs.
   */
  async initialize(): Promise<{ bonded: boolean; jobsDiscovered: number }> {
    try {
      // Bond KP3R tokens
      const bondResult = await this.bondTokens();
      this.bonded = bondResult;

      if (!this.bonded) {
        return { bonded: false, jobsDiscovered: 0 };
      }

      // Discover available jobs
      const jobs = await this.discoverJobs();
      return { bonded: true, jobsDiscovered: jobs };
    } catch (error) {
      console.error('[Keeper] Initialization failed:', error);
      return { bonded: false, jobsDiscovered: 0 };
    }
  }

  /**
   * Execute the next profitable job.
   * Called by the autonomous controller on each cycle.
   */
  async executeNext(): Promise<KeeperExecution | null> {
    if (!this.bonded) return null;

    // Find the most profitable executable job
    const job = this.findBestJob();
    if (!job) return null;

    return this.executeJob(job);
  }

  /**
   * Execute a specific job.
   */
  async executeJob(job: KeeperJob): Promise<KeeperExecution> {
    const fiber = getEconomicFiber();
    const startTime = Date.now();

    try {
      const wallet = getLiveWallet();
      const gasManager = getGasManager();

      // Check if we can transact
      if (!gasManager.canTransact()) {
        return this.recordExecution({
          jobId: job.id,
          gasUsed: 0,
          gasCost: 0,
          reward: 0,
          profit: 0,
          timestamp: startTime,
          success: false,
          error: 'Insufficient gas budget',
        });
      }

      // Check gas price first
      const gasPrice = await this.getGasPrice(job.chain);
      if (gasPrice > this.config.maxGasPrice) {
        return this.recordExecution({
          jobId: job.id,
          gasUsed: 0,
          gasCost: 0,
          reward: 0,
          profit: 0,
          timestamp: startTime,
          success: false,
          error: `Gas too expensive: ${gasPrice} gwei > ${this.config.maxGasPrice} gwei`,
        });
      }

      // Estimate profit
      const ethPrice = await this.getEthPrice();
      const estimatedGasCost = (job.estimatedGas * gasPrice * 1e-9) * ethPrice;
      const estimatedProfit = job.estimatedReward - estimatedGasCost;

      if (estimatedProfit < this.config.minProfitThreshold) {
        return this.recordExecution({
          jobId: job.id,
          gasUsed: 0,
          gasCost: estimatedGasCost,
          reward: job.estimatedReward,
          profit: estimatedProfit,
          timestamp: startTime,
          success: false,
          error: `Profit below threshold: $${estimatedProfit.toFixed(2)} < $${this.config.minProfitThreshold}`,
        });
      }

      // Check if job is workable
      console.log(`[Keeper] Checking if job ${job.id} is workable...`);
      const isWorkable = await this.checkWorkable(job, wallet);

      if (!isWorkable.workable) {
        return this.recordExecution({
          jobId: job.id,
          gasUsed: 0,
          gasCost: 0,
          reward: 0,
          profit: 0,
          timestamp: startTime,
          success: false,
          error: `Job not workable: ${isWorkable.reason}`,
        });
      }

      // Execute the job
      console.log(`[Keeper] Executing job ${job.id} (${job.type})...`);

      const abi = job.type === 'upkeep' ? AUTOMATION_ABI : KEEPER_JOB_ABI;
      const functionName = job.type === 'upkeep' ? 'performUpkeep' : 'work';
      const args = job.type === 'upkeep' ? [isWorkable.performData || '0x'] : [];

      const result = await wallet.writeContract({
        address: job.jobAddress as Address,
        abi,
        functionName,
        args,
      });

      if (result.success) {
        // Calculate actual costs (estimate for now, would need receipt)
        const actualGasCost = estimatedGasCost;
        const actualReward = job.estimatedReward;
        const profit = actualReward - actualGasCost;

        // Record in fiber bundle
        fiber.recordCost(this.fiberId, actualGasCost, `gas:${job.type}`);
        fiber.recordRevenue(this.fiberId, actualReward, `reward:${job.type}`);

        // Record in revenue tracker
        const revenueTracker = getRevenueTracker();
        revenueTracker.record({
          source: 'keeper',
          amount: profit,
          currency: 'ETH',
          activityId: 'keeper',
          metadata: {
            jobId: job.id,
            txHash: result.hash,
            gasCost: actualGasCost,
            reward: actualReward,
          },
        });

        // Update job state
        job.lastExecution = Date.now();

        console.log(`[Keeper] Job executed: ${result.hash}, profit: $${profit.toFixed(4)}`);

        return this.recordExecution({
          jobId: job.id,
          txHash: result.hash,
          gasUsed: job.estimatedGas,
          gasCost: actualGasCost,
          reward: actualReward,
          profit,
          timestamp: startTime,
          success: true,
        });
      }

      return this.recordExecution({
        jobId: job.id,
        gasUsed: 0,
        gasCost: 0,
        reward: 0,
        profit: 0,
        timestamp: startTime,
        success: false,
        error: 'Transaction failed',
      });
    } catch (error) {
      console.warn(`[Keeper] Job execution failed:`, error);
      return this.recordExecution({
        jobId: job.id,
        gasUsed: 0,
        gasCost: 0,
        reward: 0,
        profit: 0,
        timestamp: startTime,
        success: false,
        error: String(error),
      });
    }
  }

  private async checkWorkable(job: KeeperJob, wallet: ReturnType<typeof getLiveWallet>): Promise<{
    workable: boolean;
    reason?: string;
    performData?: string;
  }> {
    try {
      if (job.type === 'upkeep') {
        // Chainlink Automation style
        const result = await wallet.readContract({
          address: job.jobAddress as Address,
          abi: AUTOMATION_ABI,
          functionName: 'checkUpkeep',
          args: ['0x'],
        }) as [boolean, string];

        return {
          workable: result[0],
          performData: result[1],
          reason: result[0] ? undefined : 'checkUpkeep returned false',
        };
      } else {
        // Keep3r style
        const isWorkable = await wallet.readContract({
          address: job.jobAddress as Address,
          abi: KEEPER_JOB_ABI,
          functionName: 'workable',
          args: [],
        }) as boolean;

        return {
          workable: isWorkable,
          reason: isWorkable ? undefined : 'workable() returned false',
        };
      }
    } catch (error) {
      return {
        workable: false,
        reason: `Error checking workable: ${error}`,
      };
    }
  }

  /**
   * Get current statistics.
   */
  getStats(): KeeperStats {
    const successful = this.executions.filter(e => e.success);
    return {
      totalExecutions: this.executions.length,
      successfulExecutions: successful.length,
      totalProfit: successful.reduce((s, e) => s + e.profit, 0),
      totalGasCost: successful.reduce((s, e) => s + e.gasCost, 0),
      totalReward: successful.reduce((s, e) => s + e.reward, 0),
      averageProfitPerJob: successful.length > 0
        ? successful.reduce((s, e) => s + e.profit, 0) / successful.length
        : 0,
      activeJobs: [...this.jobs.values()].filter(j => j.active).length,
      bondAmount: this.config.bondAmount,
      lastExecution: this.executions.length > 0
        ? this.executions[this.executions.length - 1].timestamp
        : 0,
    };
  }

  /**
   * Get ROI for this activity.
   */
  getROI(): number {
    const fiber = getEconomicFiber().getFiber(this.fiberId);
    return fiber?.roi ?? 0;
  }

  /**
   * Check if the keeper is operational.
   */
  isOperational(): boolean {
    return this.bonded && this.jobs.size > 0;
  }

  // ============================================================================
  // Private
  // ============================================================================

  private findBestJob(): KeeperJob | null {
    const now = Date.now();
    const candidates = [...this.jobs.values()]
      .filter(j =>
        j.active &&
        this.config.chains.includes(j.chain) &&
        this.config.jobTypes.includes(j.type) &&
        (now - j.lastExecution) > j.cooldownMs
      )
      .sort((a, b) => b.estimatedReward - a.estimatedReward);

    return candidates[0] ?? null;
  }

  private async bondTokens(): Promise<boolean> {
    // Note: KP3R bonding is optional for many jobs on L2s
    // On Base/Arbitrum, many jobs just require gas payment
    // For now, we assume the keeper is operational without bonding
    console.log('[Keeper] Bond check: Operating in unbonded mode (L2 compatible)');
    return true;
  }

  private async discoverJobs(): Promise<number> {
    // Hardcoded known jobs on Base - in production, would scan registry
    // These are common automation jobs that don't require KP3R bonding
    const knownJobs: KeeperJob[] = [
      {
        id: 'base:harvest:yearn',
        protocol: 'Yearn',
        jobAddress: '0x0000000000000000000000000000000000000000', // Placeholder
        chain: 'base',
        type: 'harvest',
        estimatedGas: 250000,
        estimatedReward: 2.0, // ~$2 reward
        lastExecution: 0,
        cooldownMs: 3600000, // 1 hour
        active: false, // Disabled until real address configured
      },
      {
        id: 'base:upkeep:chainlink',
        protocol: 'Chainlink',
        jobAddress: '0x0000000000000000000000000000000000000000', // Placeholder
        chain: 'base',
        type: 'upkeep',
        estimatedGas: 150000,
        estimatedReward: 1.5,
        lastExecution: 0,
        cooldownMs: 300000, // 5 min
        active: false, // Disabled until real address configured
      },
    ];

    // Add configured jobs from environment
    const customJobs = process.env.GENESIS_KEEPER_JOBS;
    if (customJobs) {
      try {
        const parsed = JSON.parse(customJobs) as KeeperJob[];
        for (const job of parsed) {
          knownJobs.push({ ...job, active: true });
        }
      } catch {
        console.warn('[Keeper] Failed to parse GENESIS_KEEPER_JOBS');
      }
    }

    for (const job of knownJobs) {
      this.jobs.set(job.id, job);
    }

    const activeCount = knownJobs.filter(j => j.active).length;
    console.log(`[Keeper] Discovered ${knownJobs.length} jobs, ${activeCount} active`);

    return this.jobs.size;
  }

  private async getGasPrice(_chain: string): Promise<number> {
    try {
      // Use wallet's public client to get gas price
      const wallet = getLiveWallet();
      const gasEstimate = await wallet.estimateContractGas({
        address: '0x0000000000000000000000000000000000000000' as Address,
        abi: parseAbi(['function transfer(address to, uint256 amount) returns (bool)']),
        functionName: 'transfer',
        args: ['0x0000000000000000000000000000000000000001', BigInt(0)],
      });
      // Return gas in gwei (rough estimate)
      return Number(gasEstimate) / 1e9;
    } catch {
      return 20; // Default 20 gwei
    }
  }

  private async getEthPrice(): Promise<number> {
    try {
      const priceFeed = getPriceFeed();
      return await priceFeed.getEthPrice();
    } catch {
      return 3000; // Default $3000
    }
  }

  private recordExecution(exec: KeeperExecution): KeeperExecution {
    this.executions.push(exec);
    if (this.executions.length > this.maxExecutionLog) {
      this.executions = this.executions.slice(-this.maxExecutionLog);
    }
    return exec;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let keeperInstance: KeeperExecutor | null = null;

export function getKeeperExecutor(config?: Partial<KeeperConfig>): KeeperExecutor {
  if (!keeperInstance) {
    keeperInstance = new KeeperExecutor(config);
  }
  return keeperInstance;
}

export function resetKeeperExecutor(): void {
  keeperInstance = null;
}
