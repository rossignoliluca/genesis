/**
 * Genesis v11.0 - Revenue Loop
 *
 * Closes the loop: CompIntel → Stripe → Revenue.
 * This is the first autonomous revenue-generating pipeline:
 *
 * 1. Creates Stripe product + price for CompIntel subscription
 * 2. Generates payment link customers can use
 * 3. Verifies subscription before running scans
 * 4. Tracks revenue generated
 *
 * The world's first verified autonomous revenue-generating agent.
 */

import { getStripeClient, StripeClient, StripeProduct, StripePrice, StripePaymentLink } from '../payments/stripe-client.js';
import { CompetitiveIntelService, createCompetitiveIntelService } from './competitive-intel.js';

// ============================================================================
// Types
// ============================================================================

export interface RevenueLoopConfig {
  /** CompIntel plans and pricing (in cents) */
  plans: {
    starter: { price: number; competitors: number; interval: 'month' | 'year' };
    pro: { price: number; competitors: number; interval: 'month' | 'year' };
    enterprise: { price: number; competitors: number; interval: 'month' | 'year' };
  };
  /** Stripe product metadata */
  productName?: string;
  productDescription?: string;
  /** Success URL after payment */
  successUrl?: string;
}

export interface RevenueLoopState {
  product?: StripeProduct;
  prices: Record<string, StripePrice>;
  paymentLinks: Record<string, StripePaymentLink>;
  totalRevenue: number;
  activeSubscriptions: number;
  scansDelivered: number;
  digestsGenerated: number;
}

export interface SubscriptionCheck {
  valid: boolean;
  plan?: string;
  maxCompetitors?: number;
  expiresAt?: number;
  reason?: string;
}

// ============================================================================
// Default Config
// ============================================================================

export const DEFAULT_REVENUE_CONFIG: RevenueLoopConfig = {
  plans: {
    starter: { price: 4900, competitors: 3, interval: 'month' },    // $49/mo
    pro: { price: 9900, competitors: 10, interval: 'month' },       // $99/mo
    enterprise: { price: 19900, competitors: 25, interval: 'month' }, // $199/mo
  },
  productName: 'Genesis Competitive Intelligence',
  productDescription: 'AI-powered competitive monitoring with strategic insights. Not just "page changed" — understand WHY and what it means for your business.',
  successUrl: 'https://genesis-ai.dev/welcome',
};

// ============================================================================
// Revenue Loop
// ============================================================================

export class RevenueLoop {
  private config: RevenueLoopConfig;
  private stripe: StripeClient;
  private state: RevenueLoopState;

  constructor(config?: Partial<RevenueLoopConfig>) {
    this.config = { ...DEFAULT_REVENUE_CONFIG, ...config };
    this.stripe = getStripeClient();
    this.state = {
      prices: {},
      paymentLinks: {},
      totalRevenue: 0,
      activeSubscriptions: 0,
      scansDelivered: 0,
      digestsGenerated: 0,
    };
  }

  // ==========================================================================
  // Setup: Create Stripe Resources
  // ==========================================================================

  /**
   * Initialize the revenue loop by creating Stripe product, prices, and payment links.
   * Idempotent: checks for existing product before creating.
   */
  async setup(): Promise<{
    product: StripeProduct;
    prices: Record<string, StripePrice>;
    paymentLinks: Record<string, StripePaymentLink>;
  }> {
    if (!this.stripe.isConfigured()) {
      throw new Error('Stripe not configured. Set STRIPE_API_KEY env var.');
    }

    console.log('[RevenueLoop] Setting up Stripe resources...');

    // 1. Create or find product
    const product = await this.ensureProduct();
    this.state.product = product;
    console.log(`[RevenueLoop] Product: ${product.id} (${product.name})`);

    // 2. Create prices for each plan
    const prices: Record<string, StripePrice> = {};
    for (const [planName, planConfig] of Object.entries(this.config.plans)) {
      const price = await this.ensurePrice(product.id, planName, planConfig);
      prices[planName] = price;
      console.log(`[RevenueLoop] Price ${planName}: ${price.id} ($${(planConfig.price / 100).toFixed(0)}/${planConfig.interval})`);
    }
    this.state.prices = prices;

    // 3. Create payment links for each price
    const paymentLinks: Record<string, StripePaymentLink> = {};
    for (const [planName, price] of Object.entries(prices)) {
      const link = await this.stripe.createPaymentLink({
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: { plan: planName, source: 'genesis-compintel' },
      });
      paymentLinks[planName] = link;
      console.log(`[RevenueLoop] Payment Link ${planName}: ${link.url}`);
    }
    this.state.paymentLinks = paymentLinks;

    return { product, prices, paymentLinks };
  }

  // ==========================================================================
  // Revenue Operations
  // ==========================================================================

  /**
   * Check if a customer has an active CompIntel subscription.
   */
  async checkSubscription(customerId: string): Promise<SubscriptionCheck> {
    if (!this.stripe.isConfigured()) {
      return { valid: false, reason: 'Stripe not configured' };
    }

    try {
      const subs = await this.stripe.listSubscriptions({
        customer: customerId,
        status: 'active',
        limit: 10,
      });

      // Find subscription for our product
      const productId = this.state.product?.id;
      const compIntelSub = subs.data.find(s =>
        s.items.data.some(item => item.price.product === productId)
      );

      if (!compIntelSub) {
        return { valid: false, reason: 'No active CompIntel subscription' };
      }

      // Determine plan from price
      const priceId = compIntelSub.items.data[0]?.price.id;
      const plan = Object.entries(this.state.prices).find(([, p]) => p.id === priceId)?.[0] || 'starter';
      const planConfig = this.config.plans[plan as keyof typeof this.config.plans];

      return {
        valid: true,
        plan,
        maxCompetitors: planConfig?.competitors || 3,
        expiresAt: compIntelSub.current_period_end * 1000,
      };
    } catch (e) {
      return { valid: false, reason: `Stripe error: ${(e as Error).message}` };
    }
  }

  /**
   * Run a paid CompIntel scan for a customer.
   * Checks subscription, runs scan, tracks revenue.
   */
  async runPaidScan(customerId: string, competitors: Array<{ name: string; domain: string; pages?: string[] }>): Promise<{
    success: boolean;
    changes?: any[];
    digest?: any;
    subscription?: SubscriptionCheck;
    error?: string;
  }> {
    // Check subscription
    const sub = await this.checkSubscription(customerId);
    if (!sub.valid) {
      return {
        success: false,
        subscription: sub,
        error: `No active subscription. Subscribe at: ${this.getPaymentUrl('starter')}`,
      };
    }

    // Enforce competitor limit
    if (competitors.length > (sub.maxCompetitors || 3)) {
      return {
        success: false,
        subscription: sub,
        error: `Plan '${sub.plan}' allows ${sub.maxCompetitors} competitors. Upgrade at: ${this.getPaymentUrl('pro')}`,
      };
    }

    // Run scan
    const service = createCompetitiveIntelService({ competitors });
    const changes = await service.checkAll();
    this.state.scansDelivered++;

    let digest;
    if (changes.length > 0) {
      digest = await service.generateDigest(24);
      this.state.digestsGenerated++;
    }

    // Track revenue (subscription already paid via Stripe)
    const planConfig = this.config.plans[sub.plan as keyof typeof this.config.plans];
    if (planConfig) {
      // Pro-rate per scan (assume ~30 scans/month at 4x daily check for each competitor)
      const scanValue = Math.round(planConfig.price / 120); // Rough per-scan value
      this.state.totalRevenue += scanValue;
    }

    return { success: true, changes, digest, subscription: sub };
  }

  // ==========================================================================
  // Payment URLs
  // ==========================================================================

  /**
   * Get the payment URL for a plan.
   */
  getPaymentUrl(plan: 'starter' | 'pro' | 'enterprise'): string {
    return this.state.paymentLinks[plan]?.url || `[Setup required: run setup() first]`;
  }

  /**
   * Get all payment links.
   */
  getPaymentLinks(): Record<string, string> {
    const links: Record<string, string> = {};
    for (const [plan, link] of Object.entries(this.state.paymentLinks)) {
      links[plan] = link.url;
    }
    return links;
  }

  // ==========================================================================
  // Stats
  // ==========================================================================

  getStats(): RevenueLoopState {
    return { ...this.state };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private async ensureProduct(): Promise<StripeProduct> {
    // Check if product already exists
    try {
      const existing = await this.stripe.listProducts({ active: true, limit: 100 });
      const found = existing.data.find(p =>
        p.name === this.config.productName ||
        p.metadata?.genesis === 'compintel'
      );
      if (found) return found;
    } catch { /* continue to create */ }

    return this.stripe.createProduct({
      name: this.config.productName || 'Genesis Competitive Intelligence',
      description: this.config.productDescription,
      metadata: { genesis: 'compintel', version: '11.0' },
    });
  }

  private async ensurePrice(
    productId: string,
    planName: string,
    planConfig: { price: number; interval: 'month' | 'year' }
  ): Promise<StripePrice> {
    // Check if price exists
    try {
      const existing = await this.stripe.listPrices({ product: productId, active: true });
      const found = existing.data.find(p =>
        p.unit_amount === planConfig.price &&
        p.recurring?.interval === planConfig.interval
      );
      if (found) return found;
    } catch { /* continue to create */ }

    return this.stripe.createPrice({
      product: productId,
      unit_amount: planConfig.price,
      currency: 'usd',
      recurring: { interval: planConfig.interval },
      metadata: { plan: planName, genesis: 'compintel' },
    });
  }
}

// ============================================================================
// Factory
// ============================================================================

let revenueLoopInstance: RevenueLoop | null = null;

export function getRevenueLoop(config?: Partial<RevenueLoopConfig>): RevenueLoop {
  if (!revenueLoopInstance) {
    revenueLoopInstance = new RevenueLoop(config);
  }
  return revenueLoopInstance;
}

export function createRevenueLoop(config?: Partial<RevenueLoopConfig>): RevenueLoop {
  return new RevenueLoop(config);
}
