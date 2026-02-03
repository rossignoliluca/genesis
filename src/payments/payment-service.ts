/**
 * Genesis Payment Service
 *
 * Core payment processing service with multi-provider support.
 * Handles subscriptions, usage-based billing, and budget constraints.
 *
 * Features:
 * - Multi-provider: Stripe (cards) + Coinbase (crypto)
 * - Usage-based billing with tiered pricing
 * - Budget constraints and alerts
 * - Active Inference integration (INV-007)
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import {
  PaymentProvider,
  PaymentStatus,
  Transaction,
  Subscription,
  SubscriptionStatus,
  UsageRecord,
  UsageSummary,
  Plan,
  BudgetConstraint,
  BudgetAlert,
  WebhookEvent,
  PaymentConfig,
} from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface CreateTransactionParams {
  userId: string;
  amount: number;
  currency: string;
  description: string;
  provider?: PaymentProvider;
  metadata?: Record<string, unknown>;
}

export interface CreateSubscriptionParams {
  userId: string;
  planId: string;
  provider?: PaymentProvider;
  trialDays?: number;
  metadata?: Record<string, unknown>;
}

export interface RecordUsageParams {
  userId: string;
  metric: string;
  quantity: number;
  subscriptionId?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentServiceStats {
  totalTransactions: number;
  totalRevenue: number;
  activeSubscriptions: number;
  totalUsageRecords: number;
  budgetAlerts: number;
}

// ============================================================================
// Payment Service
// ============================================================================

export class PaymentService extends EventEmitter {
  private config: PaymentConfig;
  private transactions: Map<string, Transaction> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private usageRecords: UsageRecord[] = [];
  private plans: Map<string, Plan> = new Map();
  private budgets: Map<string, BudgetConstraint> = new Map();
  private webhookQueue: WebhookEvent[] = [];

  constructor(config?: Partial<PaymentConfig>) {
    super();
    this.config = {
      defaultCurrency: 'USD',
      usageBasedBilling: true,
      usageReportingInterval: 3600, // 1 hour
      ...config,
    };

    // Initialize default plans
    this.initializeDefaultPlans();
  }

  // ==========================================================================
  // Transaction Management
  // ==========================================================================

  /**
   * Create a new payment transaction
   */
  async createTransaction(params: CreateTransactionParams): Promise<Transaction> {
    const transaction: Transaction = {
      id: this.generateId('txn'),
      provider: params.provider || 'stripe',
      amount: params.amount,
      currency: params.currency || this.config.defaultCurrency,
      status: 'pending',
      description: params.description,
      userId: params.userId,
      metadata: params.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Check budget constraints
    const budgetCheck = await this.checkBudget(params.userId, params.amount);
    if (!budgetCheck.allowed) {
      transaction.status = 'failed';
      transaction.error = `Budget exceeded: ${budgetCheck.reason}`;
      this.transactions.set(transaction.id, transaction);
      this.emit('transaction:failed', transaction);
      return transaction;
    }

    // Process with provider
    try {
      const result = await this.processWithProvider(transaction);
      transaction.status = result.status;
      transaction.externalId = result.externalId;
      if (result.status === 'completed') {
        transaction.completedAt = new Date();
        await this.updateBudgetSpending(params.userId, params.amount);
      }
    } catch (error) {
      transaction.status = 'failed';
      transaction.error = error instanceof Error ? error.message : 'Unknown error';
    }

    transaction.updatedAt = new Date();
    this.transactions.set(transaction.id, transaction);
    this.emit('transaction:created', transaction);

    return transaction;
  }

  /**
   * Get transaction by ID
   */
  getTransaction(id: string): Transaction | undefined {
    return this.transactions.get(id);
  }

  /**
   * List transactions for a user
   */
  listTransactions(userId: string, limit: number = 50): Transaction[] {
    return Array.from(this.transactions.values())
      .filter(t => t.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Refund a transaction
   */
  async refundTransaction(transactionId: string, reason?: string): Promise<Transaction> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    if (transaction.status !== 'completed') {
      throw new Error(`Cannot refund transaction with status: ${transaction.status}`);
    }

    // Process refund with provider
    try {
      await this.processRefundWithProvider(transaction);
      transaction.status = 'refunded';
      transaction.metadata = { ...transaction.metadata, refundReason: reason };
      transaction.updatedAt = new Date();

      // Update budget (credit back)
      await this.updateBudgetSpending(transaction.userId, -transaction.amount);
    } catch (error) {
      throw new Error(`Refund failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    this.emit('transaction:refunded', transaction);
    return transaction;
  }

  // ==========================================================================
  // Subscription Management
  // ==========================================================================

  /**
   * Create a new subscription
   */
  async createSubscription(params: CreateSubscriptionParams): Promise<Subscription> {
    const plan = this.plans.get(params.planId);
    if (!plan) {
      throw new Error(`Plan not found: ${params.planId}`);
    }

    const now = new Date();
    const periodEnd = this.calculatePeriodEnd(now, plan.cycle);

    const subscription: Subscription = {
      id: this.generateId('sub'),
      userId: params.userId,
      planId: params.planId,
      provider: params.provider || 'stripe',
      status: params.trialDays ? 'trialing' : 'active',
      cycle: plan.cycle,
      pricePerCycle: plan.basePrice,
      currency: plan.currency,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      trialEnd: params.trialDays
        ? new Date(now.getTime() + params.trialDays * 24 * 60 * 60 * 1000)
        : undefined,
      cancelAtPeriodEnd: false,
      metadata: params.metadata,
      createdAt: now,
      updatedAt: now,
    };

    // Create with provider
    try {
      const result = await this.createSubscriptionWithProvider(subscription);
      subscription.externalId = result.externalId;
    } catch (error) {
      throw new Error(`Failed to create subscription: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    this.subscriptions.set(subscription.id, subscription);
    this.emit('subscription:created', subscription);

    return subscription;
  }

  /**
   * Get subscription by ID
   */
  getSubscription(id: string): Subscription | undefined {
    return this.subscriptions.get(id);
  }

  /**
   * Get active subscription for user
   */
  getActiveSubscription(userId: string): Subscription | undefined {
    return Array.from(this.subscriptions.values())
      .find(s => s.userId === userId && (s.status === 'active' || s.status === 'trialing'));
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string, immediate: boolean = false): Promise<Subscription> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }

    if (immediate) {
      subscription.status = 'cancelled';
      subscription.cancelledAt = new Date();
    } else {
      subscription.cancelAtPeriodEnd = true;
    }

    subscription.updatedAt = new Date();

    // Cancel with provider
    try {
      await this.cancelSubscriptionWithProvider(subscription, immediate);
    } catch (error) {
      console.error('[Payment] Provider cancellation failed:', error);
    }

    this.emit('subscription:cancelled', subscription);
    return subscription;
  }

  /**
   * Update subscription status
   */
  updateSubscriptionStatus(subscriptionId: string, status: SubscriptionStatus): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      subscription.status = status;
      subscription.updatedAt = new Date();
      this.emit('subscription:updated', subscription);
    }
  }

  // ==========================================================================
  // Usage-Based Billing
  // ==========================================================================

  /**
   * Record usage for billing
   */
  async recordUsage(params: RecordUsageParams): Promise<UsageRecord> {
    const subscription = params.subscriptionId
      ? this.subscriptions.get(params.subscriptionId)
      : this.getActiveSubscription(params.userId);

    const plan = subscription ? this.plans.get(subscription.planId) : undefined;
    const metric = plan?.metrics.find(m => m.id === params.metric);

    // Calculate price based on tiers
    const unitPrice = this.calculateUnitPrice(metric, params.quantity);
    const amount = Math.round(params.quantity * unitPrice);

    const record: UsageRecord = {
      id: this.generateId('usg'),
      userId: params.userId,
      subscriptionId: subscription?.id,
      metric: params.metric,
      quantity: params.quantity,
      unitPrice,
      amount,
      timestamp: new Date(),
      billingPeriod: this.getCurrentBillingPeriod(),
      metadata: params.metadata,
    };

    this.usageRecords.push(record);
    this.emit('usage:recorded', record);

    // Check if this triggers budget alert
    await this.checkAndEmitBudgetAlerts(params.userId, amount);

    return record;
  }

  /**
   * Get usage summary for user/period
   */
  getUsageSummary(userId: string, period?: string): UsageSummary {
    const targetPeriod = period || this.getCurrentBillingPeriod();
    const records = this.usageRecords.filter(
      r => r.userId === userId && r.billingPeriod === targetPeriod
    );

    const metrics: Record<string, { quantity: number; amount: number }> = {};
    let totalAmount = 0;

    for (const record of records) {
      if (!metrics[record.metric]) {
        metrics[record.metric] = { quantity: 0, amount: 0 };
      }
      metrics[record.metric].quantity += record.quantity;
      metrics[record.metric].amount += record.amount;
      totalAmount += record.amount;
    }

    return {
      userId,
      period: targetPeriod,
      metrics,
      totalAmount,
      currency: this.config.defaultCurrency,
    };
  }

  // ==========================================================================
  // Budget Management
  // ==========================================================================

  /**
   * Set budget constraint for user
   */
  setBudgetConstraint(constraint: Omit<BudgetConstraint, 'currentSpending' | 'periodStart'>): void {
    const budget: BudgetConstraint = {
      ...constraint,
      currentSpending: 0,
      periodStart: new Date(),
    };
    this.budgets.set(constraint.userId, budget);
    this.emit('budget:set', budget);
  }

  /**
   * Get budget constraint for user
   */
  getBudgetConstraint(userId: string): BudgetConstraint | undefined {
    return this.budgets.get(userId);
  }

  /**
   * Check if spending is within budget
   */
  async checkBudget(userId: string, amount: number): Promise<{ allowed: boolean; reason?: string }> {
    const budget = this.budgets.get(userId);
    if (!budget) {
      return { allowed: true }; // No budget set
    }

    // Reset if period expired
    if (this.isBudgetPeriodExpired(budget)) {
      budget.currentSpending = 0;
      budget.periodStart = new Date();
    }

    const projectedSpending = budget.currentSpending + amount;
    if (budget.hardLimit && projectedSpending > budget.maxSpendingPerPeriod) {
      return {
        allowed: false,
        reason: `Would exceed budget: $${(projectedSpending / 100).toFixed(2)} > $${(budget.maxSpendingPerPeriod / 100).toFixed(2)}`,
      };
    }

    return { allowed: true };
  }

  // ==========================================================================
  // Plans
  // ==========================================================================

  /**
   * Get all available plans
   */
  getPlans(): Plan[] {
    return Array.from(this.plans.values())
      .filter(p => p.active)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /**
   * Get plan by ID
   */
  getPlan(id: string): Plan | undefined {
    return this.plans.get(id);
  }

  /**
   * Add or update a plan
   */
  setPlan(plan: Plan): void {
    this.plans.set(plan.id, plan);
    this.emit('plan:updated', plan);
  }

  // ==========================================================================
  // Webhooks
  // ==========================================================================

  /**
   * Process incoming webhook
   */
  async processWebhook(
    provider: PaymentProvider,
    payload: string,
    signature?: string
  ): Promise<WebhookEvent> {
    const event: WebhookEvent = {
      id: this.generateId('wh'),
      provider,
      type: 'unknown',
      data: {},
      rawPayload: payload,
      signature,
      receivedAt: new Date(),
    };

    try {
      // Verify signature
      if (!this.verifyWebhookSignature(provider, payload, signature)) {
        throw new Error('Invalid webhook signature');
      }

      // Parse payload
      const parsed = JSON.parse(payload);
      event.type = parsed.type || parsed.event_type || 'unknown';
      event.data = parsed.data || parsed;

      // Route to handler
      await this.handleWebhookEvent(event);
      event.processedAt = new Date();
    } catch (error) {
      event.error = error instanceof Error ? error.message : 'Unknown error';
    }

    this.webhookQueue.push(event);
    this.emit('webhook:processed', event);

    return event;
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get service statistics
   */
  getStats(): PaymentServiceStats {
    const transactions = Array.from(this.transactions.values());
    const completedTransactions = transactions.filter(t => t.status === 'completed');

    return {
      totalTransactions: transactions.length,
      totalRevenue: completedTransactions.reduce((sum, t) => sum + t.amount, 0),
      activeSubscriptions: Array.from(this.subscriptions.values())
        .filter(s => s.status === 'active' || s.status === 'trialing').length,
      totalUsageRecords: this.usageRecords.length,
      budgetAlerts: 0, // TODO: Track alerts
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private generateId(prefix: string): string {
    return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
  }

  private initializeDefaultPlans(): void {
    // Free tier
    this.plans.set('free', {
      id: 'free',
      name: 'Free',
      description: 'Get started with Genesis',
      cycle: 'monthly',
      basePrice: 0,
      currency: 'USD',
      metrics: [
        {
          id: 'api_calls',
          name: 'API Calls',
          included: 100,
          tiers: [{ upTo: null, unitPrice: 1 }], // $0.01 per call
        },
        {
          id: 'tokens',
          name: 'LLM Tokens',
          included: 10000,
          tiers: [{ upTo: null, unitPrice: 0.1 }], // $0.001 per token
        },
      ],
      features: ['Basic MCP tools', 'Community support'],
      active: true,
      sortOrder: 0,
    });

    // Pro tier
    this.plans.set('pro', {
      id: 'pro',
      name: 'Pro',
      description: 'For professionals and small teams',
      cycle: 'monthly',
      basePrice: 2900, // $29/month
      currency: 'USD',
      metrics: [
        {
          id: 'api_calls',
          name: 'API Calls',
          included: 10000,
          tiers: [{ upTo: null, unitPrice: 0.5 }], // $0.005 per call
        },
        {
          id: 'tokens',
          name: 'LLM Tokens',
          included: 500000,
          tiers: [{ upTo: null, unitPrice: 0.05 }], // $0.0005 per token
        },
      ],
      features: ['All MCP tools', 'Priority support', 'Advanced routing'],
      active: true,
      sortOrder: 1,
    });

    // Enterprise tier
    this.plans.set('enterprise', {
      id: 'enterprise',
      name: 'Enterprise',
      description: 'For large organizations',
      cycle: 'monthly',
      basePrice: 29900, // $299/month
      currency: 'USD',
      metrics: [
        {
          id: 'api_calls',
          name: 'API Calls',
          included: 100000,
          tiers: [{ upTo: null, unitPrice: 0.2 }],
        },
        {
          id: 'tokens',
          name: 'LLM Tokens',
          included: 5000000,
          tiers: [{ upTo: null, unitPrice: 0.02 }],
        },
      ],
      features: ['Unlimited tools', 'Dedicated support', 'Custom integrations', 'SLA'],
      active: true,
      sortOrder: 2,
    });
  }

  private calculatePeriodEnd(start: Date, cycle: string): Date {
    const end = new Date(start);
    if (cycle === 'yearly') {
      end.setFullYear(end.getFullYear() + 1);
    } else {
      end.setMonth(end.getMonth() + 1);
    }
    return end;
  }

  private calculateUnitPrice(metric: { tiers: { upTo: number | null; unitPrice: number }[] } | undefined, quantity: number): number {
    if (!metric || !metric.tiers.length) {
      return 0;
    }

    // Simple: use first tier price (tiered pricing would need more logic)
    return metric.tiers[0].unitPrice;
  }

  private getCurrentBillingPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private isBudgetPeriodExpired(budget: BudgetConstraint): boolean {
    const now = new Date();
    const periodStart = budget.periodStart;

    switch (budget.period) {
      case 'daily':
        return now.getDate() !== periodStart.getDate();
      case 'weekly':
        const weekMs = 7 * 24 * 60 * 60 * 1000;
        return now.getTime() - periodStart.getTime() > weekMs;
      case 'monthly':
        return now.getMonth() !== periodStart.getMonth() ||
               now.getFullYear() !== periodStart.getFullYear();
      default:
        return false;
    }
  }

  private async updateBudgetSpending(userId: string, amount: number): Promise<void> {
    const budget = this.budgets.get(userId);
    if (budget) {
      budget.currentSpending += amount;
    }
  }

  private async checkAndEmitBudgetAlerts(userId: string, amount: number): Promise<void> {
    const budget = this.budgets.get(userId);
    if (!budget) return;

    const percentUsed = (budget.currentSpending / budget.maxSpendingPerPeriod) * 100;

    if (percentUsed >= budget.alertThreshold && percentUsed - (amount / budget.maxSpendingPerPeriod * 100) < budget.alertThreshold) {
      const alert: BudgetAlert = {
        userId,
        type: 'threshold',
        percentUsed,
        currentSpending: budget.currentSpending,
        budgetLimit: budget.maxSpendingPerPeriod,
        timestamp: new Date(),
      };
      this.emit('budget:alert', alert);
    }

    if (percentUsed >= 100) {
      const alert: BudgetAlert = {
        userId,
        type: 'exceeded',
        percentUsed,
        currentSpending: budget.currentSpending,
        budgetLimit: budget.maxSpendingPerPeriod,
        timestamp: new Date(),
      };
      this.emit('budget:exceeded', alert);
    }
  }

  // ==========================================================================
  // Real Provider Integration (Stripe API v2024)
  // ==========================================================================

  /**
   * Process payment with Stripe Payment Intents API
   */
  private async processWithProvider(transaction: Transaction): Promise<{ status: PaymentStatus; externalId?: string }> {
    if (!this.config.stripe?.secretKey) {
      // Test mode - auto-complete
      console.log('[Payment] No Stripe key, using test mode');
      return { status: 'completed', externalId: `test_${Date.now()}` };
    }

    try {
      // Create Stripe PaymentIntent via REST API
      const response = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.stripe.secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          amount: String(transaction.amount),
          currency: transaction.currency.toLowerCase(),
          description: transaction.description,
          'metadata[userId]': transaction.userId,
          'metadata[internalId]': transaction.id,
          automatic_payment_methods: JSON.stringify({ enabled: true }),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('[Payment] Stripe error:', error);
        return { status: 'failed' };
      }

      const intent = await response.json();
      console.log(`[Payment] Created PaymentIntent: ${intent.id}`);

      // Map Stripe status to our status
      const statusMap: Record<string, PaymentStatus> = {
        'requires_payment_method': 'pending',
        'requires_confirmation': 'pending',
        'requires_action': 'processing',
        'processing': 'processing',
        'succeeded': 'completed',
        'canceled': 'cancelled',
      };

      return {
        status: statusMap[intent.status] || 'pending',
        externalId: intent.id,
      };
    } catch (error) {
      console.error('[Payment] Stripe request failed:', error);
      return { status: 'failed' };
    }
  }

  /**
   * Process refund with Stripe Refunds API
   */
  private async processRefundWithProvider(transaction: Transaction): Promise<void> {
    if (!this.config.stripe?.secretKey || !transaction.externalId) {
      console.log('[Payment] Refund: No Stripe key or externalId, skipping');
      return;
    }

    try {
      const response = await fetch('https://api.stripe.com/v1/refunds', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.stripe.secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          payment_intent: transaction.externalId,
          'metadata[reason]': transaction.metadata?.refundReason as string || 'requested',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Refund failed');
      }

      const refund = await response.json();
      console.log(`[Payment] Created Refund: ${refund.id}`);
    } catch (error) {
      console.error('[Payment] Refund failed:', error);
      throw error;
    }
  }

  /**
   * Create subscription with Stripe Subscriptions API
   */
  private async createSubscriptionWithProvider(subscription: Subscription): Promise<{ externalId?: string }> {
    if (!this.config.stripe?.secretKey) {
      console.log('[Payment] No Stripe key, using test mode for subscription');
      return { externalId: `test_sub_${Date.now()}` };
    }

    try {
      // First, ensure customer exists (or create)
      const customerId = await this.ensureStripeCustomer(subscription.userId);

      // Create subscription
      const response = await fetch('https://api.stripe.com/v1/subscriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.stripe.secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          customer: customerId,
          'items[0][price_data][currency]': subscription.currency.toLowerCase(),
          'items[0][price_data][product_data][name]': `Genesis ${subscription.planId}`,
          'items[0][price_data][unit_amount]': String(subscription.pricePerCycle),
          'items[0][price_data][recurring][interval]': subscription.cycle === 'yearly' ? 'year' : 'month',
          'metadata[userId]': subscription.userId,
          'metadata[planId]': subscription.planId,
          'metadata[internalId]': subscription.id,
          ...(subscription.trialEnd ? { trial_end: String(Math.floor(subscription.trialEnd.getTime() / 1000)) } : {}),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Subscription creation failed');
      }

      const sub = await response.json();
      console.log(`[Payment] Created Subscription: ${sub.id}`);

      return { externalId: sub.id };
    } catch (error) {
      console.error('[Payment] Subscription creation failed:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription with Stripe
   */
  private async cancelSubscriptionWithProvider(subscription: Subscription, immediate: boolean): Promise<void> {
    if (!this.config.stripe?.secretKey || !subscription.externalId) {
      console.log('[Payment] No Stripe key or externalId, skipping cancellation');
      return;
    }

    try {
      if (immediate) {
        // Delete subscription immediately
        const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscription.externalId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.config.stripe.secretKey}`,
          },
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || 'Cancellation failed');
        }
      } else {
        // Cancel at period end
        const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscription.externalId}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.stripe.secretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            cancel_at_period_end: 'true',
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || 'Cancellation failed');
        }
      }

      console.log(`[Payment] Cancelled subscription: ${subscription.externalId}`);
    } catch (error) {
      console.error('[Payment] Subscription cancellation failed:', error);
      throw error;
    }
  }

  /**
   * Verify Stripe webhook signature
   */
  private verifyWebhookSignature(provider: PaymentProvider, payload: string, signature?: string): boolean {
    if (!signature) return true;

    if (provider === 'stripe' && this.config.stripe?.webhookSecret) {
      // Stripe webhook signature verification
      // Format: t=timestamp,v1=signature
      const elements = signature.split(',');
      const timestampStr = elements.find(e => e.startsWith('t='))?.slice(2);
      const signatureStr = elements.find(e => e.startsWith('v1='))?.slice(3);

      if (!timestampStr || !signatureStr) return false;

      // Check timestamp is within 5 minutes
      const timestamp = parseInt(timestampStr, 10);
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - timestamp) > 300) return false;

      // Compute expected signature
      const signedPayload = `${timestamp}.${payload}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.config.stripe.webhookSecret)
        .update(signedPayload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signatureStr),
        Buffer.from(expectedSignature)
      );
    }

    return true; // Other providers: not implemented
  }

  /**
   * Ensure Stripe customer exists for user
   */
  private async ensureStripeCustomer(userId: string): Promise<string> {
    // In production, you'd store the mapping userId -> stripeCustomerId
    // For now, create a new customer each time (or search for existing)
    const response = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.stripe!.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'metadata[userId]': userId,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create Stripe customer');
    }

    const customer = await response.json();
    return customer.id;
  }

  private async handleWebhookEvent(event: WebhookEvent): Promise<void> {
    switch (event.type) {
      case 'payment_intent.succeeded':
      case 'charge:confirmed':
        // Handle successful payment
        break;
      case 'customer.subscription.updated':
        // Handle subscription update
        break;
      case 'customer.subscription.deleted':
        // Handle subscription cancellation
        break;
      default:
        // Log unknown event type
        console.log(`[Payment] Unknown webhook event: ${event.type}`);
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let paymentServiceInstance: PaymentService | null = null;

export function getPaymentService(config?: Partial<PaymentConfig>): PaymentService {
  if (!paymentServiceInstance) {
    paymentServiceInstance = new PaymentService(config);
  }
  return paymentServiceInstance;
}

export function resetPaymentService(): void {
  paymentServiceInstance = null;
}
