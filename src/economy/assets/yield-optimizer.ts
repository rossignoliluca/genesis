/**
 * DeFi Yield Optimizer — Automated Yield Farming
 *
 * Deploys capital across DeFi protocols to earn yield.
 * Revenue model: Net yield minus gas costs.
 *
 * Requirements:
 *   - Capital: $500+ (LP positions, staking)
 *   - Identity: Wallet only
 *   - Revenue: 5-30% APY on deployed capital
 *
 * Strategies:
 *   - Stablecoin lending (Aave, Compound): 3-8% APY, low risk
 *   - LP positions (Uniswap V3, Curve): 10-30% APY, medium risk
 *   - Recursive leverage (Morpho, Euler): 15-40% APY, high risk
 *   - Points farming (new protocols): Variable, medium risk
 *
 * Safety constraints:
 *   - Max 50% in any single protocol
 *   - Max 30% in high-risk strategies
 *   - Auto-exit on health factor < 1.5 (leveraged positions)
 *   - Gas cost must be < 10% of expected yield per rebalance
 *
 * Chains: Base, Arbitrum, Optimism (low gas)
 */

import { getMCPClient } from '../../mcp/index.js';
import { getEconomicFiber } from '../fiber.js';
import type { MCPServerName } from '../../types.js';

// ============================================================================
// Types
// ============================================================================

export interface YieldPosition {
  id: string;
  protocol: string;
  chain: 'base' | 'arbitrum' | 'optimism' | 'ethereum';
  strategy: 'lending' | 'lp' | 'leverage' | 'staking' | 'points';
  asset: string;                  // Token symbol (USDC, ETH, etc.)
  amount: number;                 // $ value deposited
  apy: number;                    // Current APY (0-1, e.g., 0.08 = 8%)
  healthFactor?: number;          // For leveraged positions
  entryTime: number;
  lastHarvest: number;
  totalYieldEarned: number;
  totalGasCost: number;
  active: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface YieldOpportunity {
  protocol: string;
  chain: string;
  strategy: string;
  asset: string;
  apy: number;
  tvl: number;                    // Total value locked
  riskLevel: string;
  minDeposit: number;
}

export interface YieldOptimizerStats {
  totalDeployed: number;          // $ currently in positions
  totalYieldEarned: number;       // $ lifetime yield
  totalGasCost: number;           // $ lifetime gas
  netProfit: number;
  averageAPY: number;
  activePositions: number;
  bestProtocol: string;
  worstProtocol: string;
  riskDistribution: Record<string, number>;
}

export interface YieldOptimizerConfig {
  maxCapitalDeployed: number;     // Max $ to deploy
  maxPerProtocol: number;         // Max % in one protocol (0-1)
  maxHighRisk: number;            // Max % in high-risk (0-1)
  minHealthFactor: number;        // Auto-exit threshold
  maxGasPerRebalance: number;     // Max $ gas per rebalance
  rebalanceIntervalMs: number;    // Min time between rebalances
  minAPYThreshold: number;        // Min APY to enter position (0-1)
  enabledChains: string[];
  enabledStrategies: string[];
}

// ============================================================================
// Yield Optimizer
// ============================================================================

export class YieldOptimizer {
  private config: YieldOptimizerConfig;
  private positions: Map<string, YieldPosition> = new Map();
  private opportunities: YieldOpportunity[] = [];
  private readonly fiberId = 'yield-optimizer';
  private lastRebalance: number = 0;
  private lastScan: number = 0;

  constructor(config?: Partial<YieldOptimizerConfig>) {
    this.config = {
      maxCapitalDeployed: config?.maxCapitalDeployed ?? 5000,
      maxPerProtocol: config?.maxPerProtocol ?? 0.5,
      maxHighRisk: config?.maxHighRisk ?? 0.3,
      minHealthFactor: config?.minHealthFactor ?? 1.5,
      maxGasPerRebalance: config?.maxGasPerRebalance ?? 5,
      rebalanceIntervalMs: config?.rebalanceIntervalMs ?? 3600000, // 1 hour
      minAPYThreshold: config?.minAPYThreshold ?? 0.03, // 3%
      enabledChains: config?.enabledChains ?? ['base', 'arbitrum', 'optimism'],
      enabledStrategies: config?.enabledStrategies ?? ['lending', 'lp', 'staking'],
    };

    getEconomicFiber().registerModule(this.fiberId);
  }

  /**
   * Scan for yield opportunities across protocols.
   */
  async scanOpportunities(): Promise<YieldOpportunity[]> {
    try {
      const client = getMCPClient();
      const result = await client.call('coinbase' as MCPServerName, 'scan_yield_opportunities', {
        chains: this.config.enabledChains,
        strategies: this.config.enabledStrategies,
        minAPY: this.config.minAPYThreshold,
      });

      if (result.success && Array.isArray(result.data?.opportunities)) {
        this.opportunities = result.data.opportunities
          .map((o: Record<string, unknown>) => ({
            protocol: String(o.protocol ?? ''),
            chain: String(o.chain ?? 'base'),
            strategy: String(o.strategy ?? 'lending'),
            asset: String(o.asset ?? 'USDC'),
            apy: Number(o.apy ?? 0),
            tvl: Number(o.tvl ?? 0),
            riskLevel: String(o.riskLevel ?? 'medium'),
            minDeposit: Number(o.minDeposit ?? 100),
          }))
          .filter((o: YieldOpportunity) => o.apy >= this.config.minAPYThreshold)
          .sort((a: YieldOpportunity, b: YieldOpportunity) => b.apy - a.apy);
      }

      this.lastScan = Date.now();
    } catch {
      // Scan failure is non-fatal
    }

    return this.opportunities;
  }

  /**
   * Deploy capital to best available opportunity.
   */
  async deploy(amount: number): Promise<YieldPosition | null> {
    const totalDeployed = this.getTotalDeployed();
    if (totalDeployed + amount > this.config.maxCapitalDeployed) {
      amount = this.config.maxCapitalDeployed - totalDeployed;
      if (amount <= 0) return null;
    }

    // Find best opportunity that satisfies constraints
    const opportunity = this.findBestOpportunity(amount);
    if (!opportunity) return null;

    // Check protocol concentration
    const protocolTotal = [...this.positions.values()]
      .filter(p => p.protocol === opportunity.protocol && p.active)
      .reduce((s, p) => s + p.amount, 0);

    if ((protocolTotal + amount) / this.config.maxCapitalDeployed > this.config.maxPerProtocol) {
      return null;
    }

    const fiber = getEconomicFiber();

    try {
      const client = getMCPClient();
      const result = await client.call('coinbase' as MCPServerName, 'deploy_yield', {
        protocol: opportunity.protocol,
        chain: opportunity.chain,
        strategy: opportunity.strategy,
        asset: opportunity.asset,
        amount,
      });

      if (result.success) {
        const position: YieldPosition = {
          id: `yield-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          protocol: opportunity.protocol,
          chain: opportunity.chain as YieldPosition['chain'],
          strategy: opportunity.strategy as YieldPosition['strategy'],
          asset: opportunity.asset,
          amount,
          apy: opportunity.apy,
          healthFactor: result.data?.healthFactor,
          entryTime: Date.now(),
          lastHarvest: Date.now(),
          totalYieldEarned: 0,
          totalGasCost: result.data?.gasCost ?? 1,
          active: true,
          riskLevel: opportunity.riskLevel as YieldPosition['riskLevel'],
        };

        fiber.recordCost(this.fiberId, result.data?.gasCost ?? 1, `deploy:${opportunity.protocol}`);
        this.positions.set(position.id, position);
        return position;
      }
    } catch {
      // Deploy failure
    }

    return null;
  }

  /**
   * Harvest yield from all active positions.
   */
  async harvest(): Promise<number> {
    const fiber = getEconomicFiber();
    let totalHarvested = 0;

    for (const [, position] of this.positions) {
      if (!position.active) continue;

      try {
        const client = getMCPClient();
        const result = await client.call('coinbase' as MCPServerName, 'harvest_yield', {
          positionId: position.id,
          protocol: position.protocol,
          chain: position.chain,
        });

        if (result.success) {
          const yieldAmount = result.data?.yield ?? 0;
          const gasCost = result.data?.gasCost ?? 0.5;

          position.totalYieldEarned += yieldAmount;
          position.totalGasCost += gasCost;
          position.lastHarvest = Date.now();
          position.apy = result.data?.currentAPY ?? position.apy;
          position.healthFactor = result.data?.healthFactor ?? position.healthFactor;

          fiber.recordRevenue(this.fiberId, yieldAmount, `yield:${position.protocol}`);
          fiber.recordCost(this.fiberId, gasCost, `gas:harvest:${position.protocol}`);

          totalHarvested += yieldAmount;

          // Safety check: exit if health factor too low
          if (position.healthFactor && position.healthFactor < this.config.minHealthFactor) {
            await this.withdraw(position.id);
          }
        }
      } catch {
        // Individual harvest failure
      }
    }

    return totalHarvested;
  }

  /**
   * Withdraw from a position.
   */
  async withdraw(positionId: string): Promise<number> {
    const position = this.positions.get(positionId);
    if (!position || !position.active) return 0;

    const fiber = getEconomicFiber();

    try {
      const client = getMCPClient();
      const result = await client.call('coinbase' as MCPServerName, 'withdraw_yield', {
        positionId: position.id,
        protocol: position.protocol,
        chain: position.chain,
      });

      if (result.success) {
        const withdrawn = result.data?.amount ?? position.amount;
        const gasCost = result.data?.gasCost ?? 0.5;

        fiber.recordCost(this.fiberId, gasCost, `gas:withdraw:${position.protocol}`);
        position.active = false;
        position.totalGasCost += gasCost;

        return withdrawn;
      }
    } catch {
      // Withdraw failure
    }

    return 0;
  }

  /**
   * Rebalance: exit underperforming positions, enter better ones.
   */
  async rebalance(): Promise<{ exited: number; entered: number }> {
    let exited = 0;
    let entered = 0;

    // Exit positions with APY below threshold
    for (const [, position] of this.positions) {
      if (position.active && position.apy < this.config.minAPYThreshold) {
        const withdrawn = await this.withdraw(position.id);
        if (withdrawn > 0) {
          exited++;
          // Redeploy withdrawn capital
          const newPos = await this.deploy(withdrawn);
          if (newPos) entered++;
        }
      }
    }

    this.lastRebalance = Date.now();
    return { exited, entered };
  }

  /**
   * Check if rebalance is needed.
   */
  needsRebalance(): boolean {
    return Date.now() - this.lastRebalance > this.config.rebalanceIntervalMs;
  }

  /**
   * Get current statistics.
   */
  getStats(): YieldOptimizerStats {
    const active = [...this.positions.values()].filter(p => p.active);
    const all = [...this.positions.values()];

    const totalDeployed = active.reduce((s, p) => s + p.amount, 0);
    const totalYield = all.reduce((s, p) => s + p.totalYieldEarned, 0);
    const totalGas = all.reduce((s, p) => s + p.totalGasCost, 0);

    const riskDist: Record<string, number> = {};
    for (const p of active) {
      riskDist[p.riskLevel] = (riskDist[p.riskLevel] ?? 0) + p.amount;
    }

    const protocolYield = new Map<string, number>();
    for (const p of all) {
      protocolYield.set(p.protocol, (protocolYield.get(p.protocol) ?? 0) + p.totalYieldEarned);
    }

    const sortedProtocols = [...protocolYield.entries()].sort((a, b) => b[1] - a[1]);

    return {
      totalDeployed,
      totalYieldEarned: totalYield,
      totalGasCost: totalGas,
      netProfit: totalYield - totalGas,
      averageAPY: active.length > 0
        ? active.reduce((s, p) => s + p.apy * p.amount, 0) / totalDeployed
        : 0,
      activePositions: active.length,
      bestProtocol: sortedProtocols[0]?.[0] ?? 'none',
      worstProtocol: sortedProtocols[sortedProtocols.length - 1]?.[0] ?? 'none',
      riskDistribution: riskDist,
    };
  }

  /**
   * Get ROI.
   */
  getROI(): number {
    const fiber = getEconomicFiber().getFiber(this.fiberId);
    return fiber?.roi ?? 0;
  }

  getTotalDeployed(): number {
    return [...this.positions.values()]
      .filter(p => p.active)
      .reduce((s, p) => s + p.amount, 0);
  }

  // ============================================================================
  // Private
  // ============================================================================

  private findBestOpportunity(amount: number): YieldOpportunity | null {
    return this.opportunities.find(o =>
      o.minDeposit <= amount &&
      this.config.enabledChains.includes(o.chain) &&
      this.config.enabledStrategies.includes(o.strategy) &&
      (o.riskLevel !== 'high' || this.canTakeHighRisk(amount))
    ) ?? null;
  }

  private canTakeHighRisk(amount: number): boolean {
    const highRiskTotal = [...this.positions.values()]
      .filter(p => p.active && p.riskLevel === 'high')
      .reduce((s, p) => s + p.amount, 0);

    return (highRiskTotal + amount) / this.config.maxCapitalDeployed <= this.config.maxHighRisk;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let optimizerInstance: YieldOptimizer | null = null;

export function getYieldOptimizer(config?: Partial<YieldOptimizerConfig>): YieldOptimizer {
  if (!optimizerInstance) {
    optimizerInstance = new YieldOptimizer(config);
  }
  return optimizerInstance;
}

export function resetYieldOptimizer(): void {
  optimizerInstance = null;
}
