/**
 * x402 Dynamic Pricing Engine
 *
 * Implements demand-based pricing for x402 payment protocol.
 * Adjusts prices based on:
 * - Current system utilization
 * - Request rate and queue depth
 * - Resource cost estimation
 * - Time of day / demand patterns
 *
 * Uses Free Energy Principle concepts:
 * - Price as precision signal (higher price = scarce resource)
 * - Demand as prediction error (high demand = underpriced)
 * - Dynamic adjustment as active inference (minimize surprise)
 */

import type {
  ResourceCost,
  PricingConfig,
  DemandSignal,
  X402Challenge,
} from './types.js';
import { parseUnits } from 'viem';

// ============================================================================
// Pricing Engine
// ============================================================================

export class PricingEngine {
  private config: PricingConfig;
  private demandHistory: Map<string, DemandSignal[]> = new Map();
  private readonly historyWindow = 300; // 5 minutes of history

  constructor(config?: Partial<PricingConfig>) {
    this.config = {
      basePrices: {
        'api.call': parseUnits('0.01', 6), // $0.01 USDC
        'compute.light': parseUnits('0.05', 6), // $0.05
        'compute.heavy': parseUnits('0.25', 6), // $0.25
        'storage.read': parseUnits('0.001', 6), // $0.001
        'storage.write': parseUnits('0.01', 6), // $0.01
        'bandwidth.gb': parseUnits('0.10', 6), // $0.10 per GB
        'llm.gpt4': parseUnits('0.50', 6), // $0.50
        'llm.claude': parseUnits('0.40', 6), // $0.40
      },
      dynamicPricing: true,
      minPrice: parseUnits('0.001', 6), // $0.001 minimum
      maxPrice: parseUnits('10.00', 6), // $10.00 maximum
      elasticity: 1.5, // Price increases faster than demand
      costFactors: {
        compute: 0.0001, // $0.0001 per compute unit
        bandwidth: 0.00001, // $0.00001 per byte
        storage: 0.000001, // $0.000001 per byte-hour
      },
      ...config,
    };
  }

  /**
   * Calculate resource cost with demand-based pricing
   */
  calculateCost(
    resourceId: string,
    resourceType: string,
    demand?: DemandSignal,
  ): ResourceCost {
    // Get base price
    const baseCost = this.config.basePrices[resourceType] || this.config.minPrice;

    // Calculate demand multiplier
    const demandMultiplier = this.calculateDemandMultiplier(
      resourceType,
      demand,
    );

    // Estimate component costs
    const computeCost = this.estimateComputeCost(resourceType);
    const bandwidthCost = this.estimateBandwidthCost(resourceType);
    const storageCost = this.estimateStorageCost(resourceType);

    // Calculate final price
    const rawPrice = baseCost * BigInt(Math.floor(demandMultiplier * 100)) / 100n;
    const finalPrice = this.clampPrice(rawPrice);

    return {
      resourceId,
      baseCost,
      computeCost,
      bandwidthCost,
      storageCost,
      demandMultiplier,
      finalPrice,
      breakdown: {
        base: Number(baseCost) / 1_000_000,
        compute: computeCost,
        bandwidth: bandwidthCost,
        storage: storageCost,
        demand: demandMultiplier,
      },
    };
  }

  /**
   * Calculate demand multiplier based on current conditions
   *
   * Uses sigmoid function for smooth price increases:
   * multiplier = 1 + (max-1) / (1 + e^(-elasticity * normalized_demand))
   */
  private calculateDemandMultiplier(
    resourceType: string,
    demand?: DemandSignal,
  ): number {
    if (!this.config.dynamicPricing || !demand) {
      return 1.0;
    }

    // Normalize demand metrics (0-1 scale)
    const utilNorm = demand.utilization / 100;
    const rateNorm = Math.min(demand.requestRate / demand.averageRate, 2.0);
    const queueNorm = Math.min(demand.queueDepth / 100, 1.0);

    // Weighted combination
    const normalizedDemand =
      0.4 * utilNorm + 0.4 * rateNorm + 0.2 * queueNorm;

    // Sigmoid transformation with elasticity
    const x = (normalizedDemand - 0.5) * this.config.elasticity;
    const sigmoid = 1 / (1 + Math.exp(-x * 4));

    // Map to multiplier range [1.0, 5.0]
    const multiplier = 1.0 + sigmoid * 4.0;

    return multiplier;
  }

  /**
   * Estimate compute cost for resource type
   */
  private estimateComputeCost(resourceType: string): number {
    const computeUnits: Record<string, number> = {
      'api.call': 1,
      'compute.light': 10,
      'compute.heavy': 100,
      'llm.gpt4': 1000,
      'llm.claude': 800,
    };

    const units = computeUnits[resourceType] || 1;
    return units * this.config.costFactors.compute;
  }

  /**
   * Estimate bandwidth cost for resource type
   */
  private estimateBandwidthCost(resourceType: string): number {
    const byteSizes: Record<string, number> = {
      'api.call': 1024, // 1 KB
      'storage.read': 10240, // 10 KB
      'storage.write': 10240,
      'bandwidth.gb': 1_000_000_000, // 1 GB
      'llm.gpt4': 50000, // ~50 KB
      'llm.claude': 50000,
    };

    const bytes = byteSizes[resourceType] || 1024;
    return bytes * this.config.costFactors.bandwidth;
  }

  /**
   * Estimate storage cost for resource type
   */
  private estimateStorageCost(resourceType: string): number {
    const storageBytes: Record<string, number> = {
      'storage.write': 10240, // 10 KB
      'storage.read': 0, // No storage cost for reads
    };

    const bytes = storageBytes[resourceType] || 0;
    const hours = 24; // Assume 24-hour retention
    return bytes * hours * this.config.costFactors.storage;
  }

  /**
   * Clamp price to configured min/max
   */
  private clampPrice(price: bigint): bigint {
    if (price < this.config.minPrice) return this.config.minPrice;
    if (price > this.config.maxPrice) return this.config.maxPrice;
    return price;
  }

  /**
   * Record demand signal for history
   */
  recordDemand(signal: DemandSignal): void {
    if (!this.demandHistory.has(signal.resourceType)) {
      this.demandHistory.set(signal.resourceType, []);
    }

    const history = this.demandHistory.get(signal.resourceType)!;
    history.push(signal);

    // Keep only recent history
    const cutoff = Date.now() - this.historyWindow * 1000;
    const filtered = history.filter(
      (s) => new Date(s.timestamp).getTime() > cutoff,
    );
    this.demandHistory.set(signal.resourceType, filtered);
  }

  /**
   * Get current demand signal for resource type
   */
  getCurrentDemand(resourceType: string): DemandSignal | undefined {
    const history = this.demandHistory.get(resourceType);
    if (!history || history.length === 0) return undefined;

    return history[history.length - 1];
  }

  /**
   * Get average demand over window
   */
  getAverageDemand(resourceType: string): DemandSignal | undefined {
    const history = this.demandHistory.get(resourceType);
    if (!history || history.length === 0) return undefined;

    const sum = history.reduce(
      (acc, s) => ({
        requestRate: acc.requestRate + s.requestRate,
        utilization: acc.utilization + s.utilization,
        queueDepth: acc.queueDepth + s.queueDepth,
      }),
      { requestRate: 0, utilization: 0, queueDepth: 0 },
    );

    const count = history.length;
    return {
      resourceType,
      requestRate: sum.requestRate / count,
      averageRate: sum.requestRate / count,
      utilization: sum.utilization / count,
      queueDepth: sum.queueDepth / count,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Update pricing configuration
   */
  updateConfig(updates: Partial<PricingConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current pricing configuration
   */
  getConfig(): PricingConfig {
    return { ...this.config };
  }

  /**
   * Calculate bulk discount for multiple resources
   */
  calculateBulkDiscount(quantity: number): number {
    // Tiered discounts:
    // 1-10: 0%
    // 11-100: 10%
    // 101-1000: 20%
    // 1001+: 30%
    if (quantity <= 10) return 1.0;
    if (quantity <= 100) return 0.9;
    if (quantity <= 1000) return 0.8;
    return 0.7;
  }

  /**
   * Estimate future price based on demand trends
   */
  predictPrice(
    resourceType: string,
    minutesAhead: number,
  ): ResourceCost | null {
    const history = this.demandHistory.get(resourceType);
    if (!history || history.length < 3) return null;

    // Simple linear extrapolation of demand
    const recent = history.slice(-5);
    const trend =
      (recent[recent.length - 1].requestRate - recent[0].requestRate) /
      recent.length;

    // Project future demand
    const currentDemand = recent[recent.length - 1];
    const futureDemand: DemandSignal = {
      ...currentDemand,
      requestRate: Math.max(0, currentDemand.requestRate + trend * minutesAhead),
      timestamp: new Date(Date.now() + minutesAhead * 60 * 1000).toISOString(),
    };

    return this.calculateCost(`${resourceType}-prediction`, resourceType, futureDemand);
  }
}

// ============================================================================
// Pricing Helpers
// ============================================================================

/**
 * Create default pricing engine
 */
export function createPricingEngine(
  config?: Partial<PricingConfig>,
): PricingEngine {
  return new PricingEngine(config);
}

/**
 * Create pricing engine with aggressive dynamic pricing
 */
export function createAggressivePricing(): PricingEngine {
  return new PricingEngine({
    dynamicPricing: true,
    elasticity: 2.5, // Very sensitive to demand
    minPrice: parseUnits('0.01', 6),
    maxPrice: parseUnits('50.00', 6),
  });
}

/**
 * Create pricing engine with conservative fixed pricing
 */
export function createFixedPricing(): PricingEngine {
  return new PricingEngine({
    dynamicPricing: false,
    elasticity: 0, // No demand sensitivity
    minPrice: parseUnits('0.001', 6),
    maxPrice: parseUnits('1.00', 6),
  });
}

/**
 * Format price for display
 */
export function formatPrice(
  amount: bigint,
  currency: 'USDC' | 'ETH' = 'USDC',
): string {
  const decimals = currency === 'USDC' ? 6 : 18;
  const value = Number(amount) / Math.pow(10, decimals);
  return `$${value.toFixed(decimals === 6 ? 4 : 8)} ${currency}`;
}

/**
 * Parse price from string to bigint
 */
export function parsePrice(
  price: string,
  currency: 'USDC' | 'ETH' = 'USDC',
): bigint {
  const decimals = currency === 'USDC' ? 6 : 18;
  return parseUnits(price, decimals);
}

/**
 * Calculate recommended price based on resource metadata
 */
export function recommendPrice(resource: {
  type: string;
  computeUnits?: number;
  bandwidthBytes?: number;
  storageBytes?: number;
}): bigint {
  const engine = createPricingEngine();
  const cost = engine.calculateCost('temp', resource.type);
  return cost.finalPrice;
}
