/**
 * Genesis Revenue Tracker
 *
 * Tracks revenue, costs, and profit metrics for Active Inference economic model.
 * Integrates with payment service and provides real-time P&L visibility.
 *
 * INV-007: Economic autonomy through self-sustaining operations
 */

import { EventEmitter } from 'events';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { getPaymentService, PaymentService } from './payment-service.js';

const STATE_DIR = process.env.GENESIS_STATE_DIR || join(homedir(), '.genesis');
const COSTS_FILE = 'costs-data.json';

// ============================================================================
// Types
// ============================================================================

export interface RevenueMetrics {
  /** Total revenue in cents */
  totalRevenue: number;
  /** Total costs in cents */
  totalCosts: number;
  /** Net profit (revenue - costs) */
  netProfit: number;
  /** Profit margin percentage */
  profitMargin: number;
  /** Revenue by source */
  bySource: Record<string, number>;
  /** Costs by category */
  byCostCategory: Record<string, number>;
  /** Monthly Recurring Revenue */
  mrr: number;
  /** Average Revenue Per User */
  arpu: number;
  /** Customer Lifetime Value estimate */
  ltv: number;
  /** Period (YYYY-MM) */
  period: string;
}

export interface CostEntry {
  /** Unique ID */
  id: string;
  /** Cost category */
  category: 'llm' | 'mcp' | 'compute' | 'storage' | 'api' | 'other';
  /** Amount in cents */
  amount: number;
  /** Description */
  description: string;
  /** Provider (openai, anthropic, etc.) */
  provider?: string;
  /** Associated user ID if billable */
  userId?: string;
  /** Timestamp */
  timestamp: Date;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

export interface ProfitTarget {
  /** Target profit margin percentage */
  targetMargin: number;
  /** Minimum acceptable margin */
  minMargin: number;
  /** Alert when margin drops below threshold */
  alertThreshold: number;
}

// ============================================================================
// Revenue Tracker
// ============================================================================

export class RevenueTracker extends EventEmitter {
  private paymentService: PaymentService;
  private costs: CostEntry[] = [];
  private profitTarget: ProfitTarget = {
    targetMargin: 30,
    minMargin: 10,
    alertThreshold: 15,
  };
  private costBuffer: CostEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  // v16.2.0: Persistence support
  private filePath: string;
  private dirty = false;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.filePath = join(STATE_DIR, COSTS_FILE);
    this.paymentService = getPaymentService();
    this.setupEventListeners();
    this.startCostBufferFlush();
  }

  // ==========================================================================
  // v16.2.0: Persistence Methods
  // ==========================================================================

  /**
   * Load costs from disk
   */
  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      const data = JSON.parse(raw);
      this.costs = (data.costs ?? []).map((c: CostEntry) => ({
        ...c,
        timestamp: new Date(c.timestamp),
      }));
      this.profitTarget = data.profitTarget ?? this.profitTarget;
      console.log(`[RevenueTracker] Loaded ${this.costs.length} cost entries`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[RevenueTracker] Failed to load:', error);
      }
      // Start fresh
    }
  }

  /**
   * Save costs to disk
   */
  async save(): Promise<void> {
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      const data = {
        version: 1,
        costs: this.costs,
        profitTarget: this.profitTarget,
        savedAt: new Date().toISOString(),
      };
      const tmpPath = this.filePath + '.tmp';
      await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      const { rename } = await import('node:fs/promises');
      await rename(tmpPath, this.filePath);
      this.dirty = false;
    } catch (error) {
      console.error('[RevenueTracker] Failed to save:', error);
    }
  }

  /**
   * Start auto-save on interval
   */
  startAutoSave(intervalMs: number = 60000): void {
    if (this.saveTimer) return;
    this.saveTimer = setInterval(async () => {
      if (this.dirty) {
        await this.save();
      }
    }, intervalMs);
    console.log(`[RevenueTracker] Auto-save started, interval=${intervalMs}ms`);
  }

  /**
   * Stop auto-save
   */
  stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
  }

  // ==========================================================================
  // Revenue Tracking
  // ==========================================================================

  /**
   * Get current revenue metrics
   */
  getMetrics(period?: string): RevenueMetrics {
    const targetPeriod = period || this.getCurrentPeriod();
    const stats = this.paymentService.getStats();

    // Calculate revenue by source
    const bySource: Record<string, number> = {
      subscriptions: this.calculateSubscriptionRevenue(targetPeriod),
      usage: this.calculateUsageRevenue(targetPeriod),
      oneTime: this.calculateOneTimeRevenue(targetPeriod),
    };

    const totalRevenue = Object.values(bySource).reduce((a, b) => a + b, 0);

    // Calculate costs by category
    const periodCosts = this.getCostsForPeriod(targetPeriod);
    const byCostCategory: Record<string, number> = {};
    let totalCosts = 0;

    for (const cost of periodCosts) {
      byCostCategory[cost.category] = (byCostCategory[cost.category] || 0) + cost.amount;
      totalCosts += cost.amount;
    }

    const netProfit = totalRevenue - totalCosts;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Calculate SaaS metrics
    const mrr = this.calculateMRR();
    const activeUsers = stats.activeSubscriptions || 1;
    const arpu = activeUsers > 0 ? mrr / activeUsers : 0;
    const ltv = arpu * 12; // Simple 12-month LTV estimate

    return {
      totalRevenue,
      totalCosts,
      netProfit,
      profitMargin,
      bySource,
      byCostCategory,
      mrr,
      arpu,
      ltv,
      period: targetPeriod,
    };
  }

  /**
   * Get profit status for Active Inference decision making
   */
  getProfitStatus(): {
    healthy: boolean;
    margin: number;
    trend: 'up' | 'down' | 'stable';
    recommendation: string;
  } {
    const currentMetrics = this.getMetrics();
    const lastMonthMetrics = this.getMetrics(this.getPreviousPeriod());

    const margin = currentMetrics.profitMargin;
    const healthy = margin >= this.profitTarget.minMargin;

    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (currentMetrics.profitMargin > lastMonthMetrics.profitMargin + 2) {
      trend = 'up';
    } else if (currentMetrics.profitMargin < lastMonthMetrics.profitMargin - 2) {
      trend = 'down';
    }

    let recommendation = 'Continue current operations';
    if (!healthy) {
      recommendation = 'Reduce costs or increase prices - margin below minimum';
    } else if (margin < this.profitTarget.alertThreshold) {
      recommendation = 'Monitor closely - margin approaching minimum threshold';
    } else if (margin > this.profitTarget.targetMargin + 20) {
      recommendation = 'Consider price reduction or feature investment to grow market';
    }

    return { healthy, margin, trend, recommendation };
  }

  // ==========================================================================
  // Cost Tracking
  // ==========================================================================

  /**
   * Record a cost entry
   */
  recordCost(entry: Omit<CostEntry, 'id' | 'timestamp'>): CostEntry {
    const cost: CostEntry = {
      id: `cost_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      ...entry,
    };

    this.costBuffer.push(cost);
    this.dirty = true; // v16.2.0: Mark for persistence
    this.emit('cost:recorded', cost);

    // Check profit margin after cost
    const status = this.getProfitStatus();
    if (!status.healthy) {
      this.emit('profit:alert', {
        type: 'margin_low',
        margin: status.margin,
        minimum: this.profitTarget.minMargin,
      });
    }

    return cost;
  }

  /**
   * Record LLM API cost
   */
  recordLLMCost(params: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    userId?: string;
  }): CostEntry {
    // Approximate costs per 1K tokens (in cents)
    const costPer1K: Record<string, { input: number; output: number }> = {
      'gpt-4o': { input: 0.25, output: 1.0 },
      'gpt-4o-mini': { input: 0.015, output: 0.06 },
      'claude-3-5-sonnet': { input: 0.3, output: 1.5 },
      'claude-3-5-haiku': { input: 0.08, output: 0.4 },
      'gemini-2.0-flash': { input: 0.01, output: 0.04 },
      default: { input: 0.1, output: 0.3 },
    };

    const rates = costPer1K[params.model] || costPer1K.default;
    const inputCost = (params.inputTokens / 1000) * rates.input;
    const outputCost = (params.outputTokens / 1000) * rates.output;
    const totalCost = Math.round((inputCost + outputCost) * 100); // Convert to cents

    return this.recordCost({
      category: 'llm',
      amount: totalCost,
      description: `${params.provider}/${params.model}: ${params.inputTokens} in, ${params.outputTokens} out`,
      provider: params.provider,
      userId: params.userId,
      metadata: {
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
      },
    });
  }

  /**
   * Record MCP tool cost
   */
  recordMCPCost(params: {
    server: string;
    tool: string;
    latencyMs: number;
    userId?: string;
  }): CostEntry {
    // Approximate MCP costs based on complexity
    const toolCosts: Record<string, number> = {
      'brave-search': 1, // $0.01
      'firecrawl': 5, // $0.05
      'exa': 2, // $0.02
      'semantic-scholar': 1,
      'arxiv': 0, // Free
      'github': 0, // Free tier
      'memory': 0, // Local
      default: 1,
    };

    const cost = toolCosts[params.server] ?? toolCosts.default;

    return this.recordCost({
      category: 'mcp',
      amount: cost,
      description: `MCP ${params.server}.${params.tool} (${params.latencyMs}ms)`,
      provider: params.server,
      userId: params.userId,
      metadata: {
        tool: params.tool,
        latencyMs: params.latencyMs,
      },
    });
  }

  /**
   * Get costs for a period
   */
  getCostsForPeriod(period: string): CostEntry[] {
    return this.costs.filter(c => this.getPeriodForDate(c.timestamp) === period);
  }

  /**
   * Get total costs by category
   */
  getCostsByCategory(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const cost of this.costs) {
      result[cost.category] = (result[cost.category] || 0) + cost.amount;
    }
    return result;
  }

  // ==========================================================================
  // Profit Targets
  // ==========================================================================

  /**
   * Set profit targets
   */
  setProfitTarget(target: Partial<ProfitTarget>): void {
    this.profitTarget = { ...this.profitTarget, ...target };
    this.emit('target:updated', this.profitTarget);
  }

  /**
   * Get current profit target
   */
  getProfitTarget(): ProfitTarget {
    return { ...this.profitTarget };
  }

  // ==========================================================================
  // Active Inference Integration
  // ==========================================================================

  /**
   * Get economic observation for Active Inference
   * Returns normalized values for free energy minimization
   */
  getEconomicObservation(): {
    profitMargin: number; // 0-1 normalized
    revenueGrowth: number; // -1 to 1
    costEfficiency: number; // 0-1
    runwayMonths: number; // Estimated months of operation
    surprise: number; // Economic surprise/uncertainty
  } {
    const current = this.getMetrics();
    const previous = this.getMetrics(this.getPreviousPeriod());

    // Normalize profit margin (0-100% -> 0-1)
    const profitMargin = Math.max(0, Math.min(1, current.profitMargin / 100));

    // Revenue growth (-100% to +100% -> -1 to 1)
    const revenueGrowth = previous.totalRevenue > 0
      ? Math.max(-1, Math.min(1, (current.totalRevenue - previous.totalRevenue) / previous.totalRevenue))
      : 0;

    // Cost efficiency (revenue per cost dollar, normalized)
    const costEfficiency = current.totalCosts > 0
      ? Math.min(1, current.totalRevenue / (current.totalCosts * 2))
      : 1;

    // Runway estimate (months of operation at current burn rate)
    const monthlyBurn = current.totalCosts;
    const reserves = current.netProfit * 3; // Assume 3x monthly profit in reserves
    const runwayMonths = monthlyBurn > 0 ? Math.max(0, reserves / monthlyBurn) : 12;

    // Economic surprise (deviation from expected)
    const expectedMargin = this.profitTarget.targetMargin / 100;
    const surprise = Math.abs(profitMargin - expectedMargin);

    return {
      profitMargin,
      revenueGrowth,
      costEfficiency,
      runwayMonths,
      surprise,
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private setupEventListeners(): void {
    this.paymentService.on('transaction:created', (tx) => {
      if (tx.status === 'completed') {
        this.emit('revenue:received', { amount: tx.amount, source: 'transaction' });
      }
    });

    this.paymentService.on('subscription:created', () => {
      this.emit('revenue:subscription', { type: 'new' });
    });

    this.paymentService.on('usage:recorded', (record) => {
      if (record.amount > 0) {
        this.emit('revenue:usage', { amount: record.amount, metric: record.metric });
      }
    });
  }

  private startCostBufferFlush(): void {
    // Flush cost buffer every 5 seconds
    this.flushInterval = setInterval(() => {
      if (this.costBuffer.length > 0) {
        this.costs.push(...this.costBuffer);
        this.costBuffer = [];
      }
    }, 5000);
  }

  private calculateSubscriptionRevenue(period: string): number {
    const stats = this.paymentService.getStats();
    // Simplified: assume all active subscriptions generate average revenue
    return stats.activeSubscriptions * 2900; // $29 average
  }

  private calculateUsageRevenue(period: string): number {
    // Would aggregate from usage records
    return 0;
  }

  private calculateOneTimeRevenue(period: string): number {
    // Would aggregate from one-time transactions
    return 0;
  }

  private calculateMRR(): number {
    const stats = this.paymentService.getStats();
    return stats.activeSubscriptions * 2900; // $29 average subscription
  }

  private getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private getPreviousPeriod(): string {
    const now = new Date();
    now.setMonth(now.getMonth() - 1);
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private getPeriodForDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    // v16.2.0: Stop auto-save
    this.stopAutoSave();

    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    // Final flush
    if (this.costBuffer.length > 0) {
      this.costs.push(...this.costBuffer);
      this.costBuffer = [];
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let revenueTrackerInstance: RevenueTracker | null = null;

export function getRevenueTracker(): RevenueTracker {
  if (!revenueTrackerInstance) {
    revenueTrackerInstance = new RevenueTracker();
  }
  return revenueTrackerInstance;
}

export function resetRevenueTracker(): void {
  if (revenueTrackerInstance) {
    revenueTrackerInstance.destroy();
    revenueTrackerInstance = null;
  }
}
