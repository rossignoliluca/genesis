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

import { getMCPClient } from '../../mcp/index.js';
import { getEconomicFiber } from '../fiber.js';
import type { MCPServerName } from '../../types.js';

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
      const client = getMCPClient();

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
      const estimatedGasCost = (job.estimatedGas * gasPrice * 1e-9) * await this.getEthPrice();
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

      // Execute the job via MCP
      const result = await client.call('coinbase' as MCPServerName, 'execute_keeper_job', {
        jobAddress: job.jobAddress,
        chain: job.chain,
        type: job.type,
      });

      if (result.success) {
        const actualGasCost = result.data?.gasCost ?? estimatedGasCost;
        const actualReward = result.data?.reward ?? job.estimatedReward;
        const profit = actualReward - actualGasCost;

        // Record in fiber bundle
        fiber.recordCost(this.fiberId, actualGasCost, `gas:${job.type}`);
        fiber.recordRevenue(this.fiberId, actualReward, `reward:${job.type}`);

        // Update job state
        job.lastExecution = Date.now();

        return this.recordExecution({
          jobId: job.id,
          txHash: result.data?.hash,
          gasUsed: result.data?.gasUsed ?? job.estimatedGas,
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
        error: result.error || 'Execution failed',
      });
    } catch (error) {
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
    try {
      const client = getMCPClient();
      const result = await client.call('coinbase' as MCPServerName, 'bond_kp3r', {
        amount: this.config.bondAmount,
      });
      return result.success ?? false;
    } catch {
      return false;
    }
  }

  private async discoverJobs(): Promise<number> {
    try {
      const client = getMCPClient();
      const result = await client.call('coinbase' as MCPServerName, 'list_keeper_jobs', {
        chains: this.config.chains,
        types: this.config.jobTypes,
      });

      if (result.success && Array.isArray(result.data?.jobs)) {
        for (const job of result.data.jobs) {
          this.jobs.set(job.id, {
            id: job.id,
            protocol: job.protocol || 'unknown',
            jobAddress: job.address,
            chain: job.chain,
            type: job.type,
            estimatedGas: job.estimatedGas || 200000,
            estimatedReward: job.estimatedReward || 1.0,
            lastExecution: 0,
            cooldownMs: job.cooldownMs || 300000, // 5 min default
            active: true,
          });
        }
      }
      return this.jobs.size;
    } catch {
      return 0;
    }
  }

  private async getGasPrice(chain: string): Promise<number> {
    try {
      const client = getMCPClient();
      const result = await client.call('coinbase' as MCPServerName, 'get_gas_price', { chain });
      return result.data?.gasPrice ?? 20;
    } catch {
      return 20; // Default 20 gwei
    }
  }

  private async getEthPrice(): Promise<number> {
    try {
      const client = getMCPClient();
      const result = await client.call('coinbase' as MCPServerName, 'get_eth_price', {});
      return result.data?.price ?? 3000;
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
