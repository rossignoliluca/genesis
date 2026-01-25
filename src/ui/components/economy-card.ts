/**
 * Genesis Observatory UI - Economy Card Component
 *
 * Visualizes economic state, revenue/cost tracking, and NESS (Non-Equilibrium
 * Steady State) metrics for Genesis's autonomous economy.
 */

import type { EconomyCardData } from '../types.js';
import type { SystemMetrics } from '../../observability/dashboard.js';

// ============================================================================
// Economy Card Data Provider
// ============================================================================

export class EconomyCard {
  private data: EconomyCardData;
  private subscribers: Set<(data: EconomyCardData) => void> = new Set();
  private revenueHistory: Array<{ timestamp: number; revenue: number }> = [];
  private costHistory: Array<{ timestamp: number; cost: number }> = [];
  private maxHistory = 100;

  constructor(initialData?: EconomyCardData) {
    this.data = initialData || this.getDefaultData();
  }

  /**
   * Update economy data from metrics
   */
  update(metrics: SystemMetrics): void {
    const { totalRequests, totalCost, averageLatency } = metrics.llm;
    const totalRevenue = totalRequests * 0.005; // Estimate revenue per request

    const netIncome = totalRevenue - totalCost;
    const roi = totalCost > 0 ? (netIncome / totalCost) * 100 : 0;

    // Estimate NESS deviation (would come from actual NESS monitor)
    const nessDeviation = this.estimateNESSDeviation(totalRevenue, totalCost);
    const sustainable = netIncome >= 0 && nessDeviation < 0.3;

    // Estimate runway
    const monthlyBurnRate = totalCost * 30;
    const currentBalance = Math.max(0, totalRevenue - totalCost);
    const runway = netIncome < 0 && monthlyBurnRate > 0
      ? currentBalance / (monthlyBurnRate / 30)
      : Infinity;

    const status = this.computeStatus(sustainable, nessDeviation, runway);

    this.data = {
      totalRevenue,
      totalCost,
      netIncome,
      roi,
      sustainable,
      nessDeviation,
      runway,
      monthlyBurnRate,
      status,
    };

    this.addToHistory(totalRevenue, totalCost);
    this.notifySubscribers();
  }

  /**
   * Get current economy data
   */
  getData(): EconomyCardData {
    return { ...this.data };
  }

  /**
   * Subscribe to economy updates
   */
  subscribe(callback: (data: EconomyCardData) => void): () => void {
    this.subscribers.add(callback);
    callback(this.data);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Get visualization metrics
   */
  getMetrics(): Array<{
    label: string;
    value: string;
    trend: 'up' | 'down' | 'stable';
    color: string;
  }> {
    const { totalRevenue, totalCost, netIncome, roi, nessDeviation, runway } = this.data;

    return [
      {
        label: 'Total Revenue',
        value: this.formatCurrency(totalRevenue),
        trend: this.getRevenueTrend(),
        color: '#00ff88',
      },
      {
        label: 'Total Cost',
        value: this.formatCurrency(totalCost),
        trend: this.getCostTrend(),
        color: '#ff6b9d',
      },
      {
        label: 'Net Income',
        value: this.formatCurrency(netIncome),
        trend: netIncome > 0 ? 'up' : netIncome < 0 ? 'down' : 'stable',
        color: netIncome >= 0 ? '#00ff88' : '#ff4444',
      },
      {
        label: 'ROI',
        value: `${roi.toFixed(1)}%`,
        trend: roi > 0 ? 'up' : 'down',
        color: roi > 0 ? '#00ff88' : '#ff4444',
      },
      {
        label: 'NESS Deviation',
        value: `${(nessDeviation * 100).toFixed(0)}%`,
        trend: nessDeviation > 0.3 ? 'down' : 'stable',
        color: nessDeviation < 0.3 ? '#00ff88' : nessDeviation < 0.6 ? '#ffaa00' : '#ff4444',
      },
      {
        label: 'Runway',
        value: this.formatRunway(runway),
        trend: runway < 30 ? 'down' : 'stable',
        color: runway > 90 ? '#00ff88' : runway > 30 ? '#ffaa00' : '#ff4444',
      },
    ];
  }

  /**
   * Get status indicator
   */
  getStatusIndicator(): {
    status: string;
    color: string;
    icon: string;
    message: string;
  } {
    const { status, sustainable, nessDeviation, runway } = this.data;

    const statusMap = {
      sustainable: {
        color: '#00ff88',
        icon: '✓',
        message: 'Economy is sustainable and growing',
      },
      warning: {
        color: '#ffaa00',
        icon: '⚠',
        message: `Warning: ${
          !sustainable ? 'Not sustainable' :
          nessDeviation > 0.3 ? `NESS deviation ${(nessDeviation * 100).toFixed(0)}%` :
          runway < 90 ? `${runway.toFixed(0)} days runway` :
          'Economic stress detected'
        }`,
      },
      critical: {
        color: '#ff4444',
        icon: '✗',
        message: `Critical: ${
          runway < 30 ? `Only ${runway.toFixed(0)} days runway!` :
          'Immediate action required'
        }`,
      },
    };

    return {
      status,
      ...statusMap[status],
    };
  }

  /**
   * Get revenue/cost chart data
   */
  getChartData(): {
    revenue: Array<{ x: number; y: number }>;
    cost: Array<{ x: number; y: number }>;
    net: Array<{ x: number; y: number }>;
  } {
    const revenue = this.revenueHistory.map((h) => ({ x: h.timestamp, y: h.revenue }));
    const cost = this.costHistory.map((h) => ({ x: h.timestamp, y: h.cost }));

    const net = revenue.map((r, i) => ({
      x: r.x,
      y: r.y - (cost[i]?.y || 0),
    }));

    return { revenue, cost, net };
  }

  /**
   * Get NESS convergence info
   */
  getNESSInfo(): {
    deviation: number;
    convergenceRate: number;
    estimatedCycles: number;
    atSteadyState: boolean;
  } {
    const { nessDeviation } = this.data;

    // Simplified NESS calculation (real one would come from NESS monitor)
    const convergenceRate = Math.max(0, 1 - nessDeviation);
    const estimatedCycles = nessDeviation > 0 ? Math.ceil(nessDeviation * 100) : 0;
    const atSteadyState = nessDeviation < 0.1;

    return {
      deviation: nessDeviation,
      convergenceRate,
      estimatedCycles,
      atSteadyState,
    };
  }

  /**
   * Get activity breakdown (if available)
   */
  getActivityBreakdown(): Array<{
    id: string;
    name: string;
    revenue: number;
    cost: number;
    roi: number;
    active: boolean;
  }> {
    // This would come from the autonomous controller
    // For now, return empty array
    return [];
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private estimateNESSDeviation(revenue: number, cost: number): number {
    // Simplified estimation of NESS deviation
    // Real implementation would use AutonomousNESS observer
    const targetRevenue = 2500; // $2,500/month target
    const targetCost = 150; // $150/month target

    const monthlyRevenue = revenue * 30;
    const monthlyCost = cost * 30;

    const revenueDev = Math.abs(monthlyRevenue - targetRevenue) / targetRevenue;
    const costDev = Math.abs(monthlyCost - targetCost) / targetCost;

    return Math.max(revenueDev, costDev);
  }

  private computeStatus(
    sustainable: boolean,
    nessDeviation: number,
    runway: number
  ): EconomyCardData['status'] {
    if (!sustainable || nessDeviation > 0.6 || runway < 30) return 'critical';
    if (nessDeviation > 0.3 || runway < 90) return 'warning';
    return 'sustainable';
  }

  private getRevenueTrend(): 'up' | 'down' | 'stable' {
    if (this.revenueHistory.length < 2) return 'stable';

    const recent = this.revenueHistory.slice(-10);
    const first = recent[0].revenue;
    const last = recent[recent.length - 1].revenue;

    if (last > first * 1.1) return 'up';
    if (last < first * 0.9) return 'down';
    return 'stable';
  }

  private getCostTrend(): 'up' | 'down' | 'stable' {
    if (this.costHistory.length < 2) return 'stable';

    const recent = this.costHistory.slice(-10);
    const first = recent[0].cost;
    const last = recent[recent.length - 1].cost;

    if (last > first * 1.1) return 'up';
    if (last < first * 0.9) return 'down';
    return 'stable';
  }

  private formatCurrency(amount: number): string {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(2)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(2)}K`;
    return `$${amount.toFixed(2)}`;
  }

  private formatRunway(days: number): string {
    if (!isFinite(days)) return '∞';
    if (days > 365) return `${(days / 365).toFixed(1)}y`;
    if (days > 30) return `${(days / 30).toFixed(1)}m`;
    return `${Math.floor(days)}d`;
  }

  private addToHistory(revenue: number, cost: number): void {
    const timestamp = Date.now();

    this.revenueHistory.push({ timestamp, revenue });
    this.costHistory.push({ timestamp, cost });

    if (this.revenueHistory.length > this.maxHistory) {
      this.revenueHistory.shift();
    }
    if (this.costHistory.length > this.maxHistory) {
      this.costHistory.shift();
    }
  }

  private notifySubscribers(): void {
    for (const callback of this.subscribers) {
      try {
        callback(this.data);
      } catch (err) {
        console.error('[EconomyCard] Subscriber error:', err);
      }
    }
  }

  private getDefaultData(): EconomyCardData {
    return {
      totalRevenue: 0,
      totalCost: 0,
      netIncome: 0,
      roi: 0,
      sustainable: true,
      nessDeviation: 0,
      runway: Infinity,
      monthlyBurnRate: 0,
      status: 'sustainable',
    };
  }
}

// ============================================================================
// Visualization Helpers
// ============================================================================

/**
 * Generate sparkline path for revenue/cost history
 */
export function generateSparklinePath(
  data: Array<{ x: number; y: number }>,
  width: number,
  height: number
): string {
  if (data.length === 0) return '';

  const minY = Math.min(...data.map((d) => d.y));
  const maxY = Math.max(...data.map((d) => d.y));
  const range = maxY - minY || 1;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((d.y - minY) / range) * height;
    return { x, y };
  });

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x} ${points[i].y}`;
  }

  return path;
}

/**
 * Generate progress bar for NESS convergence
 */
export function getNESSProgressBar(deviation: number): {
  percentage: number;
  color: string;
  label: string;
} {
  const convergence = Math.max(0, 1 - deviation);
  const percentage = convergence * 100;

  let color: string;
  if (convergence > 0.7) color = '#00ff88';
  else if (convergence > 0.4) color = '#ffaa00';
  else color = '#ff4444';

  const label = convergence > 0.9
    ? 'At NESS'
    : convergence > 0.7
    ? 'Converging'
    : convergence > 0.4
    ? 'Diverging'
    : 'Far from NESS';

  return { percentage, color, label };
}

// ============================================================================
// Factory
// ============================================================================

let economyCardInstance: EconomyCard | null = null;

export function getEconomyCard(): EconomyCard {
  if (!economyCardInstance) {
    economyCardInstance = new EconomyCard();
  }
  return economyCardInstance;
}

export function createEconomyCard(initialData?: EconomyCardData): EconomyCard {
  return new EconomyCard(initialData);
}

export function resetEconomyCard(): void {
  economyCardInstance = null;
}
