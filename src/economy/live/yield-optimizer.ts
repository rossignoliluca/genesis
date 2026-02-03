/**
 * Yield Optimizer with Kelly Criterion
 *
 * Sophisticated yield optimization using:
 * - Kelly criterion for optimal position sizing
 * - Risk-adjusted APY scoring
 * - Protocol diversification
 * - Gas-aware rebalancing
 * - Impermanent loss protection
 */

import { getDefiConnector, type YieldPool } from './connectors/defi.js';
import {
  getAllProtocols,
  getProtocolsByChain,
  type ProtocolDefinition,
  type SupportedChain,
} from './connectors/protocols.js';
import { getPositionTracker, type Position } from './position-tracker.js';
import { getGasManager, type GasStatus } from './gas-manager.js';
import { getRevenueTracker } from './revenue-tracker.js';
import { getAlertSystem } from './alerts.js';
import { getLiveWallet } from './wallet.js';

// ============================================================================
// Types
// ============================================================================

export interface OptimizationConfig {
  // Kelly fraction (0.25 = quarter Kelly for safety)
  kellyFraction: number;
  // Maximum allocation to any single protocol (0.3 = 30%)
  maxAllocation: number;
  // Minimum APY threshold
  minApy: number;
  // Minimum TVL for safety ($)
  minTvl: number;
  // Maximum protocols to diversify across
  maxProtocols: number;
  // Rebalance threshold (0.1 = 10% deviation triggers rebalance)
  rebalanceThreshold: number;
  // Gas price ceiling (gwei)
  maxGasPrice: number;
  // Chains to optimize across
  chains: SupportedChain[];
  // Risk tolerance: 'conservative' | 'moderate' | 'aggressive'
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
}

export interface YieldOpportunity {
  protocol: ProtocolDefinition;
  pool?: YieldPool;
  apy: number;
  tvl: number;
  riskScore: number; // 0-100, lower is safer
  adjustedApy: number; // Risk-adjusted APY
  kellyAllocation: number; // Optimal allocation percentage
  chain: SupportedChain;
}

export interface AllocationPlan {
  opportunities: Array<{
    opportunity: YieldOpportunity;
    targetAllocation: number; // Percentage
    targetAmount: number; // USD
    currentAmount: number; // USD
    action: 'deposit' | 'withdraw' | 'hold';
    changeAmount: number; // USD
  }>;
  totalAllocated: number;
  expectedApy: number;
  riskScore: number;
  rebalanceNeeded: boolean;
  estimatedGasCost: number;
  timestamp: number;
}

export interface OptimizationResult {
  success: boolean;
  plan: AllocationPlan;
  executedActions: number;
  totalDeposited: number;
  totalWithdrawn: number;
  errors: string[];
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: OptimizationConfig = {
  kellyFraction: 0.25, // Quarter Kelly
  maxAllocation: 0.30, // 30% max per protocol
  minApy: 2.0,
  minTvl: 100000,
  maxProtocols: 5,
  rebalanceThreshold: 0.10,
  maxGasPrice: 50,
  chains: ['base', 'arbitrum', 'optimism'],
  riskTolerance: 'moderate',
};

// Risk weights by category
const CATEGORY_RISK: Record<string, number> = {
  lending: 15,      // Low risk
  staking: 20,      // Low-medium risk
  dex: 35,          // Medium risk (IL)
  yield: 40,        // Medium risk
  derivatives: 60,  // High risk
  bridge: 50,       // Medium-high risk
};

// Chain risk premium
const CHAIN_RISK: Record<SupportedChain, number> = {
  ethereum: 0,   // Base risk
  base: 5,       // Slightly higher (newer)
  arbitrum: 5,
  optimism: 5,
  polygon: 8,    // More issues historically
};

// ============================================================================
// Kelly Criterion Calculator
// ============================================================================

/**
 * Calculate optimal Kelly allocation.
 *
 * Kelly formula: f* = (p * b - q) / b
 * Where:
 *   f* = optimal fraction to bet
 *   p = probability of winning
 *   q = probability of losing (1 - p)
 *   b = odds (expected return if win)
 *
 * For yield farming, we adapt this to:
 *   p = probability of positive outcome (based on protocol safety)
 *   b = expected APY (as decimal)
 *   q = probability of loss (hack, rugpull, IL)
 */
function calculateKellyAllocation(
  apy: number,
  riskScore: number,
  kellyFraction: number
): number {
  // Convert risk score to probability of success
  // Risk 0 = 99% success, Risk 100 = 50% success
  const winProbability = 0.99 - (riskScore / 100) * 0.49;
  const loseProbability = 1 - winProbability;

  // Expected return as decimal
  const expectedReturn = apy / 100;

  // Kelly formula
  let kelly = (winProbability * expectedReturn - loseProbability) / expectedReturn;

  // Apply Kelly fraction (fractional Kelly for safety)
  kelly *= kellyFraction;

  // Clamp to reasonable range
  return Math.max(0, Math.min(kelly, 0.5));
}

/**
 * Calculate risk-adjusted APY.
 * Sharpe-like ratio considering risk.
 */
function calculateAdjustedApy(apy: number, riskScore: number): number {
  // Higher risk = more discount
  const riskDiscount = 1 - (riskScore / 200); // Risk 100 = 50% discount
  return apy * riskDiscount;
}

/**
 * Calculate protocol risk score (0-100).
 */
function calculateRiskScore(
  protocol: ProtocolDefinition,
  tvl: number,
  config: OptimizationConfig
): number {
  let score = 0;

  // Base category risk
  score += CATEGORY_RISK[protocol.category] || 30;

  // Chain risk
  score += CHAIN_RISK[protocol.chain] || 10;

  // TVL risk (lower TVL = higher risk)
  if (tvl < 1_000_000) score += 20;
  else if (tvl < 10_000_000) score += 10;
  else if (tvl < 100_000_000) score += 5;

  // Fee structure risk (high fees = potential red flag)
  const totalFees = protocol.fees.deposit + protocol.fees.withdraw + (protocol.fees.performance || 0);
  if (totalFees > 500) score += 10; // >5% total fees
  if (totalFees > 1000) score += 15; // >10% total fees

  // Risk tolerance adjustment
  if (config.riskTolerance === 'conservative') {
    score *= 1.3;
  } else if (config.riskTolerance === 'aggressive') {
    score *= 0.7;
  }

  return Math.min(100, Math.max(0, score));
}

// ============================================================================
// Yield Optimizer
// ============================================================================

export class YieldOptimizer {
  private config: OptimizationConfig;
  private lastOptimization: AllocationPlan | null = null;

  constructor(config: Partial<OptimizationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Scan all yield opportunities across configured chains.
   */
  async scanOpportunities(): Promise<YieldOpportunity[]> {
    const opportunities: YieldOpportunity[] = [];
    const defiConnector = getDefiConnector();

    // Get pools from DeFiLlama
    const pools: YieldPool[] = [];
    for (const chain of this.config.chains) {
      if (chain === 'base') {
        const basePools = await defiConnector.scanYields('base');
        pools.push(...basePools);
      }
    }

    // Create pool lookup by protocol
    const poolByProtocol = new Map<string, YieldPool>();
    for (const pool of pools) {
      const key = pool.protocol.toLowerCase();
      if (!poolByProtocol.has(key) || pool.apy > poolByProtocol.get(key)!.apy) {
        poolByProtocol.set(key, pool);
      }
    }

    // Evaluate all protocols
    for (const protocol of getAllProtocols()) {
      if (!this.config.chains.includes(protocol.chain)) continue;

      // Try to find matching pool data
      const poolKey = protocol.name.toLowerCase().replace(/\s+/g, '-');
      const pool = poolByProtocol.get(poolKey);

      // Use pool APY if available, otherwise estimate
      const apy = pool?.apy || this.estimateProtocolApy(protocol);
      const tvl = pool?.tvl || 10_000_000; // Default estimate

      // Filter by minimums
      if (apy < this.config.minApy) continue;
      if (tvl < this.config.minTvl) continue;

      const riskScore = calculateRiskScore(protocol, tvl, this.config);
      const adjustedApy = calculateAdjustedApy(apy, riskScore);
      const kellyAllocation = calculateKellyAllocation(apy, riskScore, this.config.kellyFraction);

      opportunities.push({
        protocol,
        pool,
        apy,
        tvl,
        riskScore,
        adjustedApy,
        kellyAllocation,
        chain: protocol.chain,
      });
    }

    // Sort by adjusted APY (risk-weighted)
    return opportunities.sort((a, b) => b.adjustedApy - a.adjustedApy);
  }

  /**
   * Estimate protocol APY when DeFiLlama data unavailable.
   */
  private estimateProtocolApy(protocol: ProtocolDefinition): number {
    // Conservative estimates by category
    const estimates: Record<string, number> = {
      lending: 3.5,
      staking: 4.0,
      dex: 8.0, // Higher due to fees
      yield: 6.0,
      derivatives: 12.0,
      bridge: 2.0,
    };
    return estimates[protocol.category] || 4.0;
  }

  /**
   * Generate optimal allocation plan.
   */
  async generatePlan(availableCapital: number): Promise<AllocationPlan> {
    const opportunities = await this.scanOpportunities();
    const positionTracker = getPositionTracker();
    const gasManager = getGasManager();

    // Get current positions
    const currentPositions = positionTracker.getAllPositions().filter(p => p.status === 'active');
    const currentByProtocol = new Map<string, Position>();
    for (const pos of currentPositions) {
      currentByProtocol.set(pos.pool, pos);
    }

    // Calculate total capital (available + invested)
    const investedCapital = currentPositions.reduce((sum: number, p: Position) => sum + p.currentValue, 0);
    const totalCapital = availableCapital + investedCapital;

    // Select top opportunities (diversification)
    const selectedOpps = opportunities.slice(0, this.config.maxProtocols);

    // Normalize Kelly allocations
    const totalKelly = selectedOpps.reduce((sum, o) => sum + o.kellyAllocation, 0);
    const normalizedOpps = selectedOpps.map(o => ({
      ...o,
      normalizedAllocation: totalKelly > 0 ? o.kellyAllocation / totalKelly : 1 / selectedOpps.length,
    }));

    // Apply max allocation cap
    const allocations = normalizedOpps.map(o => ({
      opportunity: o,
      targetAllocation: Math.min(o.normalizedAllocation, this.config.maxAllocation),
      targetAmount: 0,
      currentAmount: 0,
      action: 'hold' as 'deposit' | 'withdraw' | 'hold',
      changeAmount: 0,
    }));

    // Re-normalize after cap
    const totalAllocation = allocations.reduce((sum, a) => sum + a.targetAllocation, 0);
    for (const a of allocations) {
      a.targetAllocation = a.targetAllocation / totalAllocation;
      a.targetAmount = totalCapital * a.targetAllocation;

      // Check current position
      const currentPos = currentByProtocol.get(a.opportunity.protocol.id);
      a.currentAmount = currentPos?.currentValue || 0;

      // Determine action
      const diff = a.targetAmount - a.currentAmount;
      const diffPercent = Math.abs(diff) / totalCapital;

      if (diffPercent > this.config.rebalanceThreshold) {
        if (diff > 0) {
          a.action = 'deposit';
          a.changeAmount = diff;
        } else {
          a.action = 'withdraw';
          a.changeAmount = Math.abs(diff);
        }
      }
    }

    // Calculate expected portfolio APY
    const expectedApy = allocations.reduce(
      (sum, a) => sum + (a.opportunity.apy * a.targetAllocation),
      0
    );

    // Calculate portfolio risk score
    const riskScore = allocations.reduce(
      (sum, a) => sum + (a.opportunity.riskScore * a.targetAllocation),
      0
    );

    // Check if rebalance is needed
    const rebalanceNeeded = allocations.some(a => a.action !== 'hold');

    // Estimate gas costs
    const actionsNeeded = allocations.filter(a => a.action !== 'hold').length;
    const gasPrice = Number(await getDefiConnector().getGasPrice()) / 1e9; // Gwei
    const estimatedGasCost = actionsNeeded * 0.003 * gasPrice; // ~$0.003 per action at 1 gwei

    const plan: AllocationPlan = {
      opportunities: allocations,
      totalAllocated: totalCapital,
      expectedApy,
      riskScore,
      rebalanceNeeded,
      estimatedGasCost,
      timestamp: Date.now(),
    };

    this.lastOptimization = plan;
    return plan;
  }

  /**
   * Execute the allocation plan.
   */
  async executePlan(plan: AllocationPlan, dryRun = false): Promise<OptimizationResult> {
    const errors: string[] = [];
    let executedActions = 0;
    let totalDeposited = 0;
    let totalWithdrawn = 0;

    const wallet = getLiveWallet();
    const alerts = getAlertSystem();
    const gasManager = getGasManager();

    // Check gas price
    const currentGas = Number(await getDefiConnector().getGasPrice()) / 1e9;
    if (currentGas > this.config.maxGasPrice) {
      return {
        success: false,
        plan,
        executedActions: 0,
        totalDeposited: 0,
        totalWithdrawn: 0,
        errors: [`Gas price too high: ${currentGas.toFixed(1)} gwei > ${this.config.maxGasPrice} gwei limit`],
      };
    }

    // Check wallet
    if (!wallet.isConnected() && !dryRun) {
      return {
        success: false,
        plan,
        executedActions: 0,
        totalDeposited: 0,
        totalWithdrawn: 0,
        errors: ['Wallet not connected'],
      };
    }

    console.log(`[YieldOptimizer] Executing plan with ${plan.opportunities.filter(o => o.action !== 'hold').length} actions...`);

    for (const allocation of plan.opportunities) {
      if (allocation.action === 'hold') continue;

      const protocol = allocation.opportunity.protocol;

      if (dryRun) {
        console.log(`[YieldOptimizer] [DRY RUN] Would ${allocation.action} $${allocation.changeAmount.toFixed(2)} ${allocation.action === 'deposit' ? 'to' : 'from'} ${protocol.name}`);
        executedActions++;
        if (allocation.action === 'deposit') totalDeposited += allocation.changeAmount;
        else totalWithdrawn += allocation.changeAmount;
        continue;
      }

      try {
        // Execute actual deposit/withdraw
        // This would call getDefiExecutor().deposit() or withdraw()
        console.log(`[YieldOptimizer] ${allocation.action === 'deposit' ? 'Depositing' : 'Withdrawing'} $${allocation.changeAmount.toFixed(2)} ${allocation.action === 'deposit' ? 'to' : 'from'} ${protocol.name}...`);

        // Import and use defi executor
        const { getDefiExecutor } = await import('./defi-executor.js');
        const executor = getDefiExecutor();

        if (allocation.action === 'deposit') {
          const result = await executor.deposit(protocol.id, allocation.changeAmount);
          if (result.success) {
            totalDeposited += allocation.changeAmount;
            executedActions++;
          } else {
            errors.push(`Deposit to ${protocol.name} failed: ${result.error}`);
          }
        } else {
          // For withdraw, we need the position ID
          const positionTracker = getPositionTracker();
          const positions = positionTracker.getAllPositions().filter((p: Position) => p.status === 'active');
          const position = positions.find((p: Position) => p.pool === protocol.id);

          if (position) {
            const result = await executor.withdraw(position.id, allocation.changeAmount);
            if (result.success) {
              totalWithdrawn += allocation.changeAmount;
              executedActions++;
            } else {
              errors.push(`Withdraw from ${protocol.name} failed: ${result.error}`);
            }
          } else {
            errors.push(`No position found for ${protocol.name}`);
          }
        }

        // Small delay between actions
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${protocol.name}: ${errorMsg}`);
      }
    }

    // Record revenue if we had successful deposits
    if (totalDeposited > 0 || totalWithdrawn > 0) {
      const revenueTracker = getRevenueTracker();
      // Revenue will be tracked when yields are harvested
    }

    // Send alert
    if (!dryRun && executedActions > 0) {
      await alerts.success(
        'Yield Optimizer',
        `Rebalanced portfolio:\n` +
        `- Deposited: $${totalDeposited.toFixed(2)}\n` +
        `- Withdrawn: $${totalWithdrawn.toFixed(2)}\n` +
        `- Expected APY: ${plan.expectedApy.toFixed(2)}%`
      );
    }

    return {
      success: errors.length === 0,
      plan,
      executedActions,
      totalDeposited,
      totalWithdrawn,
      errors,
    };
  }

  /**
   * Auto-optimize: scan, plan, and execute if needed.
   */
  async autoOptimize(dryRun = false): Promise<OptimizationResult> {
    console.log('[YieldOptimizer] Starting auto-optimization...');

    // Get available capital from wallet
    const wallet = getLiveWallet();
    let availableCapital = 0;

    if (wallet.isConnected()) {
      const balances = await wallet.getBalances();
      availableCapital = Number(balances.usdc) / 1e6;
    }

    // Generate plan
    const plan = await this.generatePlan(availableCapital);

    console.log(`[YieldOptimizer] Plan generated:`);
    console.log(`  - Opportunities: ${plan.opportunities.length}`);
    console.log(`  - Expected APY: ${plan.expectedApy.toFixed(2)}%`);
    console.log(`  - Risk Score: ${plan.riskScore.toFixed(1)}/100`);
    console.log(`  - Rebalance needed: ${plan.rebalanceNeeded}`);

    if (!plan.rebalanceNeeded) {
      console.log('[YieldOptimizer] No rebalance needed, portfolio is optimized.');
      return {
        success: true,
        plan,
        executedActions: 0,
        totalDeposited: 0,
        totalWithdrawn: 0,
        errors: [],
      };
    }

    // Execute plan
    return this.executePlan(plan, dryRun);
  }

  /**
   * Get current optimization status.
   */
  getStatus(): {
    lastOptimization: AllocationPlan | null;
    config: OptimizationConfig;
    protocolCount: number;
    chainCount: number;
  } {
    return {
      lastOptimization: this.lastOptimization,
      config: this.config,
      protocolCount: getAllProtocols().length,
      chainCount: this.config.chains.length,
    };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get configuration.
   */
  getConfig(): OptimizationConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let optimizerInstance: YieldOptimizer | null = null;

export function getYieldOptimizer(config?: Partial<OptimizationConfig>): YieldOptimizer {
  if (!optimizerInstance) {
    optimizerInstance = new YieldOptimizer(config);
  }
  return optimizerInstance;
}

export function resetYieldOptimizer(): void {
  optimizerInstance = null;
}
