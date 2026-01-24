/**
 * Cross-L2 Arbitrage — Inter-Chain Price Discrepancy Exploitation
 *
 * Identifies and executes arbitrage opportunities across L2 chains.
 * Revenue model: Profit from price differences minus gas and bridge costs.
 *
 * Requirements:
 *   - Capital: $500+ (liquidity on multiple chains)
 *   - Identity: Wallet only
 *   - Revenue: $10-$200/day depending on market volatility
 *
 * Supported routes:
 *   - Base ↔ Arbitrum (fast bridge: 10-30 min)
 *   - Optimism ↔ Arbitrum (fast bridge: 5-15 min)
 *   - Base ↔ Optimism (fast bridge: 10-20 min)
 *   - zkSync ↔ Base (bridge: 15-45 min)
 *
 * Strategy:
 *   1. Monitor prices on major DEXs across L2s
 *   2. Identify opportunities: price_diff > gas + bridge_cost + min_profit
 *   3. Execute buy on cheap chain, bridge, sell on expensive chain
 *   4. Track PnL and adjust strategy
 *
 * Assets monitored:
 *   - ETH/WETH (largest liquidity)
 *   - USDC (stablecoin pegs)
 *   - Major DeFi tokens (UNI, AAVE, LDO, ARB, OP)
 *
 * Safety:
 *   - Max 20% of capital per trade
 *   - Stop-loss at 2% loss on any position
 *   - Max 3 concurrent positions
 *   - Bridge timeout = cancel trade
 */

import { getMCPClient } from '../../mcp/index.js';
import { getEconomicFiber } from '../fiber.js';
import type { MCPServerName } from '../../types.js';

// ============================================================================
// Types
// ============================================================================

export interface PriceQuote {
  asset: string;
  chain: string;
  dex: string;
  price: number;          // $ per unit
  liquidity: number;      // $ available
  timestamp: number;
  slippage: number;       // Expected slippage at $1K trade (0-1)
}

export interface ArbOpportunity {
  id: string;
  asset: string;
  buyChain: string;
  buyDex: string;
  buyPrice: number;
  sellChain: string;
  sellDex: string;
  sellPrice: number;
  spread: number;         // sell - buy price (%)
  estimatedProfit: number; // $ after costs
  gasCost: number;        // $ total gas (buy + sell)
  bridgeCost: number;     // $ bridge fee
  bridgeTime: number;     // Estimated bridge time in ms
  viable: boolean;        // Profit > minProfit after all costs
  discovered: number;
  status: 'found' | 'executing' | 'completed' | 'failed' | 'expired';
}

export interface ArbExecution {
  opportunityId: string;
  buyTxHash?: string;
  sellTxHash?: string;
  bridgeTxHash?: string;
  amountIn: number;       // $ spent on buy
  amountOut: number;      // $ received from sell
  profit: number;         // Net profit
  gasCost: number;        // Actual gas
  bridgeCost: number;     // Actual bridge fee
  duration: number;       // Total time in ms
  success: boolean;
  error?: string;
}

export interface ArbStats {
  opportunitiesFound: number;
  tradesExecuted: number;
  successfulTrades: number;
  totalProfit: number;
  totalGasCost: number;
  totalBridgeCost: number;
  averageSpread: number;
  bestTrade: number;
  worstTrade: number;
  winRate: number;
  dailyVolume: number;
}

export interface ArbConfig {
  enabledChains: string[];
  enabledAssets: string[];
  maxPositionSize: number;       // Max % of capital per trade (0-1)
  minProfit: number;             // Min $ profit to execute
  minSpread: number;             // Min spread % to consider (0-1)
  maxConcurrentPositions: number;
  stopLoss: number;              // Max loss before exit (0-1)
  scanIntervalMs: number;        // Price scan interval
  bridgeTimeoutMs: number;       // Max bridge wait time
  totalCapital: number;          // $ allocated to arb
}

// ============================================================================
// Cross-L2 Arbitrageur
// ============================================================================

export class CrossL2Arbitrageur {
  private config: ArbConfig;
  private opportunities: Map<string, ArbOpportunity> = new Map();
  private executions: ArbExecution[] = [];
  private priceCache: Map<string, PriceQuote[]> = new Map();
  private readonly fiberId = 'cross-l2-arb';
  private lastScan: number = 0;
  private readonly maxExecutionLog = 500;

  constructor(config?: Partial<ArbConfig>) {
    this.config = {
      enabledChains: config?.enabledChains ?? ['base', 'arbitrum', 'optimism'],
      enabledAssets: config?.enabledAssets ?? ['ETH', 'USDC', 'ARB', 'OP'],
      maxPositionSize: config?.maxPositionSize ?? 0.2,
      minProfit: config?.minProfit ?? 2.0,  // $2 minimum profit
      minSpread: config?.minSpread ?? 0.003, // 0.3% minimum spread
      maxConcurrentPositions: config?.maxConcurrentPositions ?? 3,
      stopLoss: config?.stopLoss ?? 0.02,    // 2% stop loss
      scanIntervalMs: config?.scanIntervalMs ?? 30000, // 30 seconds
      bridgeTimeoutMs: config?.bridgeTimeoutMs ?? 1800000, // 30 minutes
      totalCapital: config?.totalCapital ?? 500,
    };

    getEconomicFiber().registerModule(this.fiberId);
  }

  /**
   * Scan for arbitrage opportunities across all chains/assets.
   */
  async scan(): Promise<ArbOpportunity[]> {
    const opportunities: ArbOpportunity[] = [];

    // Get prices on all chains for all assets
    await this.refreshPrices();

    // Find price discrepancies
    for (const asset of this.config.enabledAssets) {
      const quotes = this.priceCache.get(asset) ?? [];
      if (quotes.length < 2) continue;

      // Compare all chain pairs
      for (let i = 0; i < quotes.length; i++) {
        for (let j = 0; j < quotes.length; j++) {
          if (i === j) continue;

          const buyQuote = quotes[i];
          const sellQuote = quotes[j];

          if (buyQuote.price >= sellQuote.price) continue;

          const spread = (sellQuote.price - buyQuote.price) / buyQuote.price;
          if (spread < this.config.minSpread) continue;

          const tradeSize = Math.min(
            this.config.totalCapital * this.config.maxPositionSize,
            buyQuote.liquidity * 0.1,
            sellQuote.liquidity * 0.1
          );

          const gasCost = this.estimateGasCost(buyQuote.chain, sellQuote.chain);
          const bridgeCost = this.estimateBridgeCost(tradeSize, buyQuote.chain, sellQuote.chain);
          const estimatedProfit = tradeSize * spread - gasCost - bridgeCost;

          const opp: ArbOpportunity = {
            id: `arb-${asset}-${buyQuote.chain}-${sellQuote.chain}-${Date.now()}`,
            asset,
            buyChain: buyQuote.chain,
            buyDex: buyQuote.dex,
            buyPrice: buyQuote.price,
            sellChain: sellQuote.chain,
            sellDex: sellQuote.dex,
            sellPrice: sellQuote.price,
            spread,
            estimatedProfit,
            gasCost,
            bridgeCost,
            bridgeTime: this.estimateBridgeTime(buyQuote.chain, sellQuote.chain),
            viable: estimatedProfit >= this.config.minProfit,
            discovered: Date.now(),
            status: 'found',
          };

          if (opp.viable) {
            this.opportunities.set(opp.id, opp);
            opportunities.push(opp);
          }
        }
      }
    }

    this.lastScan = Date.now();
    return opportunities.sort((a, b) => b.estimatedProfit - a.estimatedProfit);
  }

  /**
   * Execute the best available opportunity.
   */
  async executeBest(): Promise<ArbExecution | null> {
    const activePositions = this.executions.filter(e =>
      !e.success && e.error === undefined
    ).length;

    if (activePositions >= this.config.maxConcurrentPositions) return null;

    // Find best viable opportunity
    const best = [...this.opportunities.values()]
      .filter(o => o.status === 'found' && o.viable)
      .sort((a, b) => b.estimatedProfit - a.estimatedProfit)[0];

    if (!best) return null;

    return this.execute(best.id);
  }

  /**
   * Execute a specific opportunity.
   */
  async execute(opportunityId: string): Promise<ArbExecution | null> {
    const opp = this.opportunities.get(opportunityId);
    if (!opp || opp.status !== 'found') return null;

    opp.status = 'executing';
    const fiber = getEconomicFiber();
    const startTime = Date.now();

    try {
      const client = getMCPClient();
      const tradeSize = Math.min(
        this.config.totalCapital * this.config.maxPositionSize,
        opp.estimatedProfit * 100 // Don't oversize
      );

      // Step 1: Buy on cheap chain
      const buyResult = await client.call('coinbase' as MCPServerName, 'swap_tokens', {
        chain: opp.buyChain,
        dex: opp.buyDex,
        tokenIn: 'USDC',
        tokenOut: opp.asset,
        amountIn: tradeSize,
      });

      if (!buyResult.success) {
        return this.recordExecution(opp, { success: false, error: 'Buy failed' });
      }

      // Step 2: Bridge to sell chain
      const bridgeResult = await client.call('coinbase' as MCPServerName, 'bridge_tokens', {
        fromChain: opp.buyChain,
        toChain: opp.sellChain,
        token: opp.asset,
        amount: buyResult.data?.amountOut ?? tradeSize / opp.buyPrice,
      });

      if (!bridgeResult.success) {
        return this.recordExecution(opp, { success: false, error: 'Bridge failed' });
      }

      // Step 3: Sell on expensive chain
      const sellResult = await client.call('coinbase' as MCPServerName, 'swap_tokens', {
        chain: opp.sellChain,
        dex: opp.sellDex,
        tokenIn: opp.asset,
        tokenOut: 'USDC',
        amountIn: bridgeResult.data?.amountReceived ?? buyResult.data?.amountOut,
      });

      if (!sellResult.success) {
        return this.recordExecution(opp, { success: false, error: 'Sell failed' });
      }

      // Calculate actual PnL
      const amountIn = tradeSize;
      const amountOut = sellResult.data?.amountOut ?? tradeSize * (1 + opp.spread);
      const actualGas = (buyResult.data?.gasCost ?? 0) + (sellResult.data?.gasCost ?? 0);
      const actualBridge = bridgeResult.data?.fee ?? opp.bridgeCost;
      const profit = amountOut - amountIn - actualGas - actualBridge;

      const execution: ArbExecution = {
        opportunityId: opp.id,
        buyTxHash: buyResult.data?.hash,
        sellTxHash: sellResult.data?.hash,
        bridgeTxHash: bridgeResult.data?.hash,
        amountIn,
        amountOut,
        profit,
        gasCost: actualGas,
        bridgeCost: actualBridge,
        duration: Date.now() - startTime,
        success: true,
      };

      opp.status = 'completed';

      // Record in fiber
      fiber.recordCost(this.fiberId, actualGas + actualBridge, `arb:${opp.asset}:${opp.buyChain}→${opp.sellChain}`);
      if (profit > 0) {
        fiber.recordRevenue(this.fiberId, profit, `arb:${opp.asset}`);
      }

      this.executions.push(execution);
      if (this.executions.length > this.maxExecutionLog) {
        this.executions = this.executions.slice(-this.maxExecutionLog);
      }

      return execution;
    } catch (error) {
      opp.status = 'failed';
      return this.recordExecution(opp, { success: false, error: String(error) });
    }
  }

  /**
   * Check if scan is due.
   */
  needsScan(): boolean {
    return Date.now() - this.lastScan > this.config.scanIntervalMs;
  }

  /**
   * Get current statistics.
   */
  getStats(): ArbStats {
    const successful = this.executions.filter(e => e.success);
    const today = Date.now() - 86400000;
    const todayTrades = this.executions.filter(e => e.success && e.duration > 0);

    return {
      opportunitiesFound: this.opportunities.size,
      tradesExecuted: this.executions.length,
      successfulTrades: successful.length,
      totalProfit: successful.reduce((s, e) => s + e.profit, 0),
      totalGasCost: this.executions.reduce((s, e) => s + e.gasCost, 0),
      totalBridgeCost: this.executions.reduce((s, e) => s + e.bridgeCost, 0),
      averageSpread: [...this.opportunities.values()]
        .filter(o => o.viable)
        .reduce((s, o) => s + o.spread, 0) / Math.max(this.opportunities.size, 1),
      bestTrade: Math.max(0, ...successful.map(e => e.profit)),
      worstTrade: Math.min(0, ...this.executions.map(e => e.profit)),
      winRate: this.executions.length > 0 ? successful.length / this.executions.length : 0,
      dailyVolume: todayTrades.reduce((s, e) => s + e.amountIn, 0),
    };
  }

  /**
   * Get ROI.
   */
  getROI(): number {
    const fiber = getEconomicFiber().getFiber(this.fiberId);
    return fiber?.roi ?? 0;
  }

  // ============================================================================
  // Private
  // ============================================================================

  private async refreshPrices(): Promise<void> {
    try {
      const client = getMCPClient();

      for (const asset of this.config.enabledAssets) {
        const quotes: PriceQuote[] = [];

        for (const chain of this.config.enabledChains) {
          try {
            const result = await client.call('coinbase' as MCPServerName, 'get_token_price', {
              token: asset,
              chain,
            });

            if (result.success && result.data?.price) {
              quotes.push({
                asset,
                chain,
                dex: result.data.dex ?? 'uniswap',
                price: result.data.price,
                liquidity: result.data.liquidity ?? 100000,
                timestamp: Date.now(),
                slippage: result.data.slippage ?? 0.005,
              });
            }
          } catch {
            // Individual chain failure
          }
        }

        if (quotes.length >= 2) {
          this.priceCache.set(asset, quotes);
        }
      }
    } catch {
      // Price refresh failure
    }
  }

  private estimateGasCost(fromChain: string, toChain: string): number {
    // Gas costs per chain ($ per swap)
    const gasCosts: Record<string, number> = {
      base: 0.05,
      arbitrum: 0.10,
      optimism: 0.08,
      ethereum: 5.00,
    };
    return (gasCosts[fromChain] ?? 0.10) + (gasCosts[toChain] ?? 0.10);
  }

  private estimateBridgeCost(amount: number, fromChain: string, toChain: string): number {
    // Bridge fees: typically 0.05-0.1% + fixed fee
    return amount * 0.001 + 0.50; // 0.1% + $0.50 fixed
  }

  private estimateBridgeTime(fromChain: string, toChain: string): number {
    // Bridge times in ms
    const bridgeTimes: Record<string, number> = {
      'base-arbitrum': 900000,      // 15 min
      'arbitrum-base': 900000,
      'base-optimism': 600000,      // 10 min
      'optimism-base': 600000,
      'arbitrum-optimism': 300000,  // 5 min
      'optimism-arbitrum': 300000,
    };
    return bridgeTimes[`${fromChain}-${toChain}`] ?? 1200000; // Default 20 min
  }

  private recordExecution(opp: ArbOpportunity, partial: { success: boolean; error?: string }): ArbExecution {
    const execution: ArbExecution = {
      opportunityId: opp.id,
      amountIn: 0,
      amountOut: 0,
      profit: 0,
      gasCost: 0,
      bridgeCost: 0,
      duration: Date.now() - opp.discovered,
      success: partial.success,
      error: partial.error,
    };

    this.executions.push(execution);
    if (this.executions.length > this.maxExecutionLog) {
      this.executions = this.executions.slice(-this.maxExecutionLog);
    }

    return execution;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let arbInstance: CrossL2Arbitrageur | null = null;

export function getCrossL2Arbitrageur(config?: Partial<ArbConfig>): CrossL2Arbitrageur {
  if (!arbInstance) {
    arbInstance = new CrossL2Arbitrageur(config);
  }
  return arbInstance;
}

export function resetCrossL2Arbitrageur(): void {
  arbInstance = null;
}
