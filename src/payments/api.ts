/**
 * Genesis Payment API
 *
 * REST-style API for payment operations.
 * Can be exposed via HTTP server or used programmatically.
 */

import { getPaymentService, getRevenueTracker } from './index.js';

// ============================================================================
// Types
// ============================================================================

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

export interface APIRequest {
  method: string;
  path: string;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
  userId?: string;
}

// ============================================================================
// API Handler
// ============================================================================

export class PaymentAPI {
  private paymentService = getPaymentService();
  private revenueTracker = getRevenueTracker();

  /**
   * Handle API request
   */
  async handle(request: APIRequest): Promise<APIResponse> {
    const timestamp = new Date();

    try {
      const result = await this.route(request);
      return { success: true, data: result, timestamp };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp,
      };
    }
  }

  private async route(request: APIRequest): Promise<unknown> {
    const { method, path, body, query, userId } = request;
    const route = `${method.toUpperCase()} ${path}`;

    // Transaction endpoints
    if (route === 'POST /transactions') {
      return this.createTransaction(body!, userId!);
    }
    if (route === 'GET /transactions') {
      return this.listTransactions(userId!, query);
    }
    if (route.startsWith('GET /transactions/')) {
      const id = path.split('/')[2];
      return this.getTransaction(id);
    }
    if (route.startsWith('POST /transactions/') && path.endsWith('/refund')) {
      const id = path.split('/')[2];
      return this.refundTransaction(id, body?.reason as string);
    }

    // Subscription endpoints
    if (route === 'POST /subscriptions') {
      return this.createSubscription(body!, userId!);
    }
    if (route === 'GET /subscriptions') {
      return this.getActiveSubscription(userId!);
    }
    if (route.startsWith('DELETE /subscriptions/')) {
      const id = path.split('/')[2];
      const immediate = query?.immediate === 'true';
      return this.cancelSubscription(id, immediate);
    }

    // Usage endpoints
    if (route === 'POST /usage') {
      return this.recordUsage(body!, userId!);
    }
    if (route === 'GET /usage') {
      return this.getUsageSummary(userId!, query?.period);
    }

    // Plan endpoints
    if (route === 'GET /plans') {
      return this.getPlans();
    }
    if (route.startsWith('GET /plans/')) {
      const id = path.split('/')[2];
      return this.getPlan(id);
    }

    // Budget endpoints
    if (route === 'POST /budget') {
      return this.setBudget(body!, userId!);
    }
    if (route === 'GET /budget') {
      return this.getBudget(userId!);
    }

    // Metrics endpoints
    if (route === 'GET /metrics') {
      return this.getMetrics(query?.period);
    }
    if (route === 'GET /metrics/economic') {
      return this.getEconomicObservation();
    }
    if (route === 'GET /metrics/profit') {
      return this.getProfitStatus();
    }

    // Webhook endpoint
    if (route === 'POST /webhooks/stripe') {
      return this.handleWebhook('stripe', body!);
    }
    if (route === 'POST /webhooks/coinbase') {
      return this.handleWebhook('coinbase', body!);
    }

    throw new Error(`Unknown route: ${route}`);
  }

  // ==========================================================================
  // Transaction Handlers
  // ==========================================================================

  private async createTransaction(body: Record<string, unknown>, userId: string) {
    return this.paymentService.createTransaction({
      userId,
      amount: body.amount as number,
      currency: (body.currency as string) || 'USD',
      description: body.description as string,
      provider: body.provider as 'stripe' | 'coinbase' | 'manual' | undefined,
      metadata: body.metadata as Record<string, unknown>,
    });
  }

  private listTransactions(userId: string, query?: Record<string, string>) {
    const limit = query?.limit ? parseInt(query.limit, 10) : 50;
    return this.paymentService.listTransactions(userId, limit);
  }

  private getTransaction(id: string) {
    const tx = this.paymentService.getTransaction(id);
    if (!tx) throw new Error(`Transaction not found: ${id}`);
    return tx;
  }

  private async refundTransaction(id: string, reason?: string) {
    return this.paymentService.refundTransaction(id, reason);
  }

  // ==========================================================================
  // Subscription Handlers
  // ==========================================================================

  private async createSubscription(body: Record<string, unknown>, userId: string) {
    return this.paymentService.createSubscription({
      userId,
      planId: body.planId as string,
      provider: body.provider as 'stripe' | 'coinbase' | 'manual' | undefined,
      trialDays: body.trialDays as number | undefined,
      metadata: body.metadata as Record<string, unknown>,
    });
  }

  private getActiveSubscription(userId: string) {
    return this.paymentService.getActiveSubscription(userId);
  }

  private async cancelSubscription(id: string, immediate: boolean) {
    return this.paymentService.cancelSubscription(id, immediate);
  }

  // ==========================================================================
  // Usage Handlers
  // ==========================================================================

  private async recordUsage(body: Record<string, unknown>, userId: string) {
    return this.paymentService.recordUsage({
      userId,
      metric: body.metric as string,
      quantity: body.quantity as number,
      subscriptionId: body.subscriptionId as string | undefined,
      metadata: body.metadata as Record<string, unknown>,
    });
  }

  private getUsageSummary(userId: string, period?: string) {
    return this.paymentService.getUsageSummary(userId, period);
  }

  // ==========================================================================
  // Plan Handlers
  // ==========================================================================

  private getPlans() {
    return this.paymentService.getPlans();
  }

  private getPlan(id: string) {
    const plan = this.paymentService.getPlan(id);
    if (!plan) throw new Error(`Plan not found: ${id}`);
    return plan;
  }

  // ==========================================================================
  // Budget Handlers
  // ==========================================================================

  private setBudget(body: Record<string, unknown>, userId: string) {
    this.paymentService.setBudgetConstraint({
      userId,
      maxSpendingPerPeriod: body.maxSpendingPerPeriod as number,
      period: body.period as 'daily' | 'weekly' | 'monthly',
      alertThreshold: (body.alertThreshold as number) || 80,
      hardLimit: (body.hardLimit as boolean) ?? true,
    });
    return { message: 'Budget set successfully' };
  }

  private getBudget(userId: string) {
    return this.paymentService.getBudgetConstraint(userId);
  }

  // ==========================================================================
  // Metrics Handlers
  // ==========================================================================

  private getMetrics(period?: string) {
    return this.revenueTracker.getMetrics(period);
  }

  private getEconomicObservation() {
    return this.revenueTracker.getEconomicObservation();
  }

  private getProfitStatus() {
    return this.revenueTracker.getProfitStatus();
  }

  // ==========================================================================
  // Webhook Handlers
  // ==========================================================================

  private async handleWebhook(provider: 'stripe' | 'coinbase', body: Record<string, unknown>) {
    return this.paymentService.processWebhook(
      provider,
      JSON.stringify(body),
      body.signature as string | undefined
    );
  }
}

// ============================================================================
// Singleton
// ============================================================================

let apiInstance: PaymentAPI | null = null;

export function getPaymentAPI(): PaymentAPI {
  if (!apiInstance) {
    apiInstance = new PaymentAPI();
  }
  return apiInstance;
}

// ============================================================================
// CLI Integration
// ============================================================================

/**
 * Process payment command from CLI
 */
export async function processPaymentCommand(args: string[]): Promise<string> {
  const api = getPaymentAPI();
  const [command, ...rest] = args;

  switch (command) {
    case 'plans':
      const plans = await api.handle({ method: 'GET', path: '/plans' });
      if (plans.success && plans.data) {
        const planList = plans.data as Array<{ id: string; name: string; basePrice: number }>;
        return planList.map(p => `  ${p.id}: ${p.name} - $${(p.basePrice / 100).toFixed(2)}/mo`).join('\n');
      }
      return 'No plans available';

    case 'metrics':
      const metrics = await api.handle({ method: 'GET', path: '/metrics' });
      if (metrics.success && metrics.data) {
        const m = metrics.data as {
          totalRevenue: number;
          totalCosts: number;
          netProfit: number;
          profitMargin: number;
          mrr: number;
        };
        return [
          `Revenue:  $${(m.totalRevenue / 100).toFixed(2)}`,
          `Costs:    $${(m.totalCosts / 100).toFixed(2)}`,
          `Profit:   $${(m.netProfit / 100).toFixed(2)} (${m.profitMargin.toFixed(1)}%)`,
          `MRR:      $${(m.mrr / 100).toFixed(2)}`,
        ].join('\n');
      }
      return 'Unable to fetch metrics';

    case 'status':
      const status = await api.handle({ method: 'GET', path: '/metrics/profit' });
      if (status.success && status.data) {
        const s = status.data as { healthy: boolean; margin: number; trend: string; recommendation: string };
        return [
          `Health:  ${s.healthy ? '✓ Healthy' : '✗ Unhealthy'}`,
          `Margin:  ${s.margin.toFixed(1)}%`,
          `Trend:   ${s.trend}`,
          `Action:  ${s.recommendation}`,
        ].join('\n');
      }
      return 'Unable to fetch status';

    case 'subscribe':
      if (!rest[0]) return 'Usage: genesis payment subscribe <plan_id>';
      const sub = await api.handle({
        method: 'POST',
        path: '/subscriptions',
        body: { planId: rest[0] },
        userId: 'demo-user',
      });
      return sub.success
        ? `Subscribed to ${rest[0]}`
        : `Failed: ${sub.error}`;

    case 'usage':
      if (!rest[0] || !rest[1]) return 'Usage: genesis payment usage <metric> <quantity>';
      const usage = await api.handle({
        method: 'POST',
        path: '/usage',
        body: { metric: rest[0], quantity: parseFloat(rest[1]) },
        userId: 'demo-user',
      });
      return usage.success
        ? `Recorded ${rest[1]} ${rest[0]}`
        : `Failed: ${usage.error}`;

    default:
      return [
        'Payment Commands:',
        '  plans      - List available plans',
        '  metrics    - Show revenue metrics',
        '  status     - Show profit health status',
        '  subscribe  - Subscribe to a plan',
        '  usage      - Record usage',
      ].join('\n');
  }
}
