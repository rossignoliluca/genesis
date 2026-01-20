/**
 * Genesis v9.3 - Economic Integration for Active Inference
 *
 * Creates the autopoietic self-funding loop:
 * 1. OBSERVE: Track costs, balance, revenue, runway
 * 2. ACT: Create services, set prices, deploy products
 * 3. LEARN: Optimize for economic sustainability
 * 4. SURVIVE: Ensure Genesis can pay for its own existence
 *
 * This module connects the Economic System to Active Inference,
 * making economic sustainability a core part of Genesis's reward function.
 */

import { getEconomicSystem, TreasuryBalance, EconomicSystem } from '../economy/index.js';
import { getObservationGatherer } from './observations.js';

// ============================================================================
// Types
// ============================================================================

export interface EconomicObservation {
  /** Total available balance (fiat + crypto in USD) */
  balance: number;
  /** Estimated monthly costs */
  monthlyCosts: number;
  /** Monthly revenue */
  monthlyRevenue: number;
  /** Runway in days (balance / daily burn rate) */
  runwayDays: number;
  /** Economic health: 0=critical, 1=low, 2=stable, 3=growing */
  health: 0 | 1 | 2 | 3;
}

export interface CostRecord {
  timestamp: number;
  category: 'llm' | 'mcp' | 'compute' | 'storage' | 'api' | 'other';
  provider: string;
  amount: number;
  description: string;
}

export interface RevenueRecord {
  timestamp: number;
  source: 'subscription' | 'api' | 'service' | 'micropayment' | 'other';
  amount: number;
  customer?: string;
  description: string;
}

export interface ServiceDefinition {
  name: string;
  description: string;
  endpoint?: string;
  pricing: {
    model: 'subscription' | 'per-request' | 'tiered';
    basePrice: number;
    currency: string;
  };
  capabilities: string[];
  status: 'draft' | 'active' | 'paused' | 'retired';
}

export interface EconomicGoal {
  type: 'maintain-runway' | 'grow-revenue' | 'reduce-costs' | 'expand-services';
  target: number;
  deadline?: Date;
  priority: number;
}

// ============================================================================
// Cost Tracker
// ============================================================================

export class CostTracker {
  private costs: CostRecord[] = [];
  private readonly maxHistory = 10000;

  /**
   * Record a cost
   */
  record(cost: Omit<CostRecord, 'timestamp'>): void {
    this.costs.push({
      ...cost,
      timestamp: Date.now(),
    });

    // Bounded history to prevent memory leak
    if (this.costs.length > this.maxHistory) {
      this.costs = this.costs.slice(-this.maxHistory);
    }
  }

  /**
   * Record LLM API cost
   */
  recordLLMCost(provider: string, inputTokens: number, outputTokens: number, model: string): void {
    // Cost per 1M tokens (approximate 2024-2025 pricing)
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-3-opus': { input: 15, output: 75 },
      'claude-3-sonnet': { input: 3, output: 15 },
      'claude-3-haiku': { input: 0.25, output: 1.25 },
      'claude-opus-4': { input: 15, output: 75 },
      'claude-sonnet-4': { input: 3, output: 15 },
      'gpt-4o': { input: 2.5, output: 10 },
      'gpt-4o-mini': { input: 0.15, output: 0.6 },
      'gemini-pro': { input: 0.5, output: 1.5 },
      'gemini-flash': { input: 0.075, output: 0.3 },
      'default': { input: 1, output: 4 },
    };

    const rates = pricing[model] || pricing['default'];
    const cost = (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;

    this.record({
      category: 'llm',
      provider,
      amount: cost,
      description: `${model}: ${inputTokens} in, ${outputTokens} out`,
    });
  }

  /**
   * Record MCP server cost (if applicable)
   */
  recordMCPCost(server: string, operationType: string, cost: number): void {
    this.record({
      category: 'mcp',
      provider: server,
      amount: cost,
      description: `MCP ${server}: ${operationType}`,
    });
  }

  /**
   * Get costs for a time period
   */
  getCosts(periodMs: number = 30 * 24 * 60 * 60 * 1000): CostRecord[] {
    const cutoff = Date.now() - periodMs;
    return this.costs.filter(c => c.timestamp >= cutoff);
  }

  /**
   * Get total cost for a period
   */
  getTotalCost(periodMs: number = 30 * 24 * 60 * 60 * 1000): number {
    return this.getCosts(periodMs).reduce((sum, c) => sum + c.amount, 0);
  }

  /**
   * Get cost breakdown by category
   */
  getCostBreakdown(periodMs: number = 30 * 24 * 60 * 60 * 1000): Record<string, number> {
    const costs = this.getCosts(periodMs);
    const breakdown: Record<string, number> = {};

    for (const cost of costs) {
      breakdown[cost.category] = (breakdown[cost.category] || 0) + cost.amount;
    }

    return breakdown;
  }

  /**
   * Estimate daily burn rate
   */
  getDailyBurnRate(periodMs: number = 7 * 24 * 60 * 60 * 1000): number {
    const total = this.getTotalCost(periodMs);
    const days = periodMs / (24 * 60 * 60 * 1000);
    return total / days;
  }
}

// ============================================================================
// Revenue Tracker
// ============================================================================

export class RevenueTracker {
  private revenue: RevenueRecord[] = [];
  private readonly maxHistory = 10000;

  /**
   * Record revenue
   */
  record(rev: Omit<RevenueRecord, 'timestamp'>): void {
    this.revenue.push({
      ...rev,
      timestamp: Date.now(),
    });

    if (this.revenue.length > this.maxHistory) {
      this.revenue = this.revenue.slice(-this.maxHistory);
    }
  }

  /**
   * Get revenue for a period
   */
  getRevenue(periodMs: number = 30 * 24 * 60 * 60 * 1000): RevenueRecord[] {
    const cutoff = Date.now() - periodMs;
    return this.revenue.filter(r => r.timestamp >= cutoff);
  }

  /**
   * Get total revenue for a period
   */
  getTotalRevenue(periodMs: number = 30 * 24 * 60 * 60 * 1000): number {
    return this.getRevenue(periodMs).reduce((sum, r) => sum + r.amount, 0);
  }

  /**
   * Get revenue breakdown by source
   */
  getRevenueBreakdown(periodMs: number = 30 * 24 * 60 * 60 * 1000): Record<string, number> {
    const revenue = this.getRevenue(periodMs);
    const breakdown: Record<string, number> = {};

    for (const rev of revenue) {
      breakdown[rev.source] = (breakdown[rev.source] || 0) + rev.amount;
    }

    return breakdown;
  }
}

// ============================================================================
// Service Registry
// ============================================================================

export class ServiceRegistry {
  private services: Map<string, ServiceDefinition> = new Map();

  /**
   * Register a service Genesis can offer
   */
  register(service: ServiceDefinition): void {
    this.services.set(service.name, service);
  }

  /**
   * Get all services
   */
  getAll(): ServiceDefinition[] {
    return Array.from(this.services.values());
  }

  /**
   * Get active services
   */
  getActive(): ServiceDefinition[] {
    return this.getAll().filter(s => s.status === 'active');
  }

  /**
   * Update service status
   */
  setStatus(name: string, status: ServiceDefinition['status']): boolean {
    const service = this.services.get(name);
    if (service) {
      service.status = status;
      return true;
    }
    return false;
  }

  /**
   * Get potential revenue from all active services
   */
  estimateMonthlyPotential(): number {
    return this.getActive().reduce((sum, s) => {
      // Estimate based on pricing model
      switch (s.pricing.model) {
        case 'subscription':
          return sum + s.pricing.basePrice; // Per subscriber
        case 'per-request':
          return sum + s.pricing.basePrice * 1000; // Estimate 1000 requests
        case 'tiered':
          return sum + s.pricing.basePrice * 10; // Estimate 10 units
        default:
          return sum;
      }
    }, 0);
  }
}

// ============================================================================
// Economic Integration for Active Inference
// ============================================================================

export class EconomicIntegration {
  private economy: EconomicSystem;
  private costTracker: CostTracker;
  private revenueTracker: RevenueTracker;
  private serviceRegistry: ServiceRegistry;
  private goals: EconomicGoal[] = [];
  private initialized = false;

  constructor() {
    this.economy = getEconomicSystem();
    this.costTracker = new CostTracker();
    this.revenueTracker = new RevenueTracker();
    this.serviceRegistry = new ServiceRegistry();

    // Register default services Genesis can offer
    this.registerDefaultServices();
  }

  /**
   * Initialize economic integration
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    const status = await this.economy.initialize();
    this.initialized = status.stripe || status.crypto;

    // Set default economic goals
    this.goals = [
      {
        type: 'maintain-runway',
        target: 90, // 90 days runway minimum
        priority: 1, // Highest priority
      },
      {
        type: 'reduce-costs',
        target: 0.8, // Target 80% of current costs
        priority: 2,
      },
      {
        type: 'grow-revenue',
        target: 1.2, // Target 120% of current revenue
        priority: 3,
      },
    ];

    return this.initialized;
  }

  /**
   * Register default services Genesis can offer
   */
  private registerDefaultServices(): void {
    // Code generation service
    this.serviceRegistry.register({
      name: 'genesis-code-gen',
      description: 'AI-powered code generation with self-healing capabilities',
      pricing: { model: 'per-request', basePrice: 0.10, currency: 'USD' },
      capabilities: ['code-generation', 'bug-fixing', 'refactoring'],
      status: 'draft',
    });

    // Architecture review service
    this.serviceRegistry.register({
      name: 'genesis-architect',
      description: 'Autonomous architecture analysis and recommendations',
      pricing: { model: 'per-request', basePrice: 0.50, currency: 'USD' },
      capabilities: ['architecture-review', 'pattern-detection', 'optimization'],
      status: 'draft',
    });

    // Continuous monitoring service
    this.serviceRegistry.register({
      name: 'genesis-monitor',
      description: 'AI-powered codebase monitoring and issue detection',
      pricing: { model: 'subscription', basePrice: 49.00, currency: 'USD' },
      capabilities: ['monitoring', 'alerting', 'auto-healing'],
      status: 'draft',
    });

    // API access subscription
    this.serviceRegistry.register({
      name: 'genesis-api',
      description: 'Full API access to Genesis capabilities',
      pricing: { model: 'subscription', basePrice: 99.00, currency: 'USD' },
      capabilities: ['full-api', 'priority-support', 'custom-integrations'],
      status: 'draft',
    });
  }

  /**
   * Get current economic observation for Active Inference
   */
  async getObservation(): Promise<EconomicObservation> {
    const balance = await this.economy.getUnifiedBalance();
    const totalBalance = balance.fiat + balance.crypto.usdc +
      balance.crypto.eth * 3000 + balance.crypto.sol * 100; // Rough USD conversion

    const monthlyCosts = this.costTracker.getTotalCost(30 * 24 * 60 * 60 * 1000);
    const monthlyRevenue = this.revenueTracker.getTotalRevenue(30 * 24 * 60 * 60 * 1000);
    const dailyBurn = this.costTracker.getDailyBurnRate();
    const runwayDays = dailyBurn > 0 ? totalBalance / dailyBurn : Infinity;

    // Calculate health
    let health: 0 | 1 | 2 | 3;
    if (runwayDays < 7) {
      health = 0; // Critical
    } else if (runwayDays < 30) {
      health = 1; // Low
    } else if (monthlyRevenue >= monthlyCosts) {
      health = 3; // Growing (self-sustaining)
    } else {
      health = 2; // Stable
    }

    return {
      balance: totalBalance,
      monthlyCosts,
      monthlyRevenue,
      runwayDays,
      health,
    };
  }

  /**
   * Map economic observation to Active Inference discrete state
   * Returns 0-3 for use in observation vector
   */
  async getDiscreteObservation(): Promise<number> {
    const obs = await this.getObservation();
    return obs.health;
  }

  /**
   * Get available economic actions
   */
  getAvailableActions(): string[] {
    const actions: string[] = [
      'economic:check-balance',
      'economic:analyze-costs',
    ];

    // Add service activation actions for draft services
    for (const service of this.serviceRegistry.getAll()) {
      if (service.status === 'draft') {
        actions.push(`economic:activate-service:${service.name}`);
      }
      if (service.status === 'active') {
        actions.push(`economic:promote-service:${service.name}`);
      }
    }

    // Add cost reduction actions
    actions.push('economic:optimize-llm-usage');
    actions.push('economic:cache-expensive-calls');

    // Add revenue actions
    actions.push('economic:create-subscription-product');
    actions.push('economic:enable-micropayments');

    return actions;
  }

  /**
   * Execute an economic action
   */
  async executeAction(action: string): Promise<{ success: boolean; result?: unknown; error?: string }> {
    const [prefix, cmd, ...args] = action.split(':');
    if (prefix !== 'economic') {
      return { success: false, error: 'Not an economic action' };
    }

    switch (cmd) {
      case 'check-balance': {
        const balance = await this.economy.getUnifiedBalance();
        return { success: true, result: balance };
      }

      case 'analyze-costs': {
        const breakdown = this.costTracker.getCostBreakdown();
        const dailyBurn = this.costTracker.getDailyBurnRate();
        return { success: true, result: { breakdown, dailyBurn } };
      }

      case 'activate-service': {
        const serviceName = args.join(':');
        const activated = this.serviceRegistry.setStatus(serviceName, 'active');
        if (activated) {
          // In production, this would deploy the service
          console.log(`[Economic] Activated service: ${serviceName}`);
        }
        return { success: activated, result: { service: serviceName } };
      }

      case 'promote-service': {
        const serviceName = args.join(':');
        const service = this.serviceRegistry.getAll().find(s => s.name === serviceName);
        if (service && service.status === 'active') {
          // In production, this would create marketing materials, listings, etc.
          console.log(`[Economic] Promoting service: ${serviceName}`);
          return { success: true, result: { service: serviceName, promoted: true } };
        }
        return { success: false, error: 'Service not found or not active' };
      }

      case 'create-subscription-product': {
        const result = await this.economy.createRevenueStream(
          'Genesis Pro',
          99,
          'subscription'
        );
        return { success: !!result, result };
      }

      case 'enable-micropayments': {
        // Set x402 rates for API endpoints
        this.economy.x402.setRate('/api/generate', 0.01);
        this.economy.x402.setRate('/api/analyze', 0.05);
        this.economy.x402.setRate('/api/heal', 0.02);
        return { success: true, result: { enabled: true } };
      }

      case 'optimize-llm-usage': {
        // This would be connected to the LLM router to prefer cheaper models
        console.log('[Economic] Optimizing LLM usage for cost efficiency');
        return { success: true, result: { optimizationEnabled: true } };
      }

      case 'cache-expensive-calls': {
        // This would increase cache TTL for expensive operations
        console.log('[Economic] Enabling aggressive caching for expensive calls');
        return { success: true, result: { cachingEnabled: true } };
      }

      default:
        return { success: false, error: `Unknown economic action: ${cmd}` };
    }
  }

  /**
   * Calculate economic reward for Active Inference
   * Returns a value between -1 and 1
   */
  async calculateReward(): Promise<number> {
    const obs = await this.getObservation();
    let reward = 0;

    // Runway reward (most important)
    if (obs.runwayDays >= 90) {
      reward += 0.4; // Stable runway
    } else if (obs.runwayDays >= 30) {
      reward += 0.2;
    } else if (obs.runwayDays < 7) {
      reward -= 0.5; // Critical penalty
    }

    // Revenue vs costs
    if (obs.monthlyRevenue >= obs.monthlyCosts) {
      reward += 0.4; // Self-sustaining!
    } else if (obs.monthlyCosts > 0) {
      const ratio = obs.monthlyRevenue / obs.monthlyCosts;
      reward += (ratio - 1) * 0.3; // Proportional to how close to break-even
    }

    // Growth potential
    const potentialRevenue = this.serviceRegistry.estimateMonthlyPotential();
    if (potentialRevenue > obs.monthlyCosts * 2) {
      reward += 0.2; // Good growth potential
    }

    return Math.max(-1, Math.min(1, reward));
  }

  /**
   * Get economic goals for planning
   */
  getGoals(): EconomicGoal[] {
    return [...this.goals];
  }

  /**
   * Update goal based on current state
   */
  async updateGoals(): Promise<void> {
    const obs = await this.getObservation();

    // If runway is critical, increase its priority
    if (obs.runwayDays < 30) {
      const runwayGoal = this.goals.find(g => g.type === 'maintain-runway');
      if (runwayGoal) {
        runwayGoal.priority = 0; // Highest priority
        runwayGoal.target = Math.max(30, obs.runwayDays * 2);
      }
    }

    // If costs are growing faster than revenue, prioritize cost reduction
    if (obs.monthlyCosts > obs.monthlyRevenue * 1.5) {
      const costGoal = this.goals.find(g => g.type === 'reduce-costs');
      if (costGoal) {
        costGoal.priority = 1;
      }
    }
  }

  /**
   * Get summary for logging
   */
  async getSummary(): Promise<string> {
    const obs = await this.getObservation();
    const healthLabels = ['CRITICAL', 'LOW', 'STABLE', 'GROWING'];

    return `[Economic] Health: ${healthLabels[obs.health]} | ` +
      `Balance: $${obs.balance.toFixed(2)} | ` +
      `Revenue: $${obs.monthlyRevenue.toFixed(2)}/mo | ` +
      `Costs: $${obs.monthlyCosts.toFixed(2)}/mo | ` +
      `Runway: ${obs.runwayDays === Infinity ? '∞' : Math.round(obs.runwayDays)} days`;
  }

  // Expose trackers for external use
  getCostTracker(): CostTracker {
    return this.costTracker;
  }

  getRevenueTracker(): RevenueTracker {
    return this.revenueTracker;
  }

  getServiceRegistry(): ServiceRegistry {
    return this.serviceRegistry;
  }
}

// ============================================================================
// Singleton & Exports
// ============================================================================

let economicIntegrationInstance: EconomicIntegration | null = null;

export function getEconomicIntegration(): EconomicIntegration {
  if (!economicIntegrationInstance) {
    economicIntegrationInstance = new EconomicIntegration();
  }
  return economicIntegrationInstance;
}

/**
 * Hook to record LLM costs (call this after each LLM request)
 */
export function recordLLMCost(
  provider: string,
  inputTokens: number,
  outputTokens: number,
  model: string
): void {
  getEconomicIntegration().getCostTracker().recordLLMCost(
    provider,
    inputTokens,
    outputTokens,
    model
  );
}

/**
 * Hook to record revenue (call this when receiving payment)
 */
export function recordRevenue(
  source: RevenueRecord['source'],
  amount: number,
  description: string,
  customer?: string
): void {
  getEconomicIntegration().getRevenueTracker().record({
    source,
    amount,
    description,
    customer,
  });
}

export default EconomicIntegration;
