/**
 * Genesis v11.0 - Stripe Direct Client
 *
 * Zero-dependency Stripe integration using native fetch.
 * Handles products, prices, payment links, and subscriptions
 * for the Competitive Intelligence revenue loop.
 *
 * Uses Stripe REST API v2024-12-18.
 */

// ============================================================================
// Types
// ============================================================================

export interface StripeProduct {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  metadata?: Record<string, string>;
}

export interface StripePrice {
  id: string;
  product: string;
  unit_amount: number;
  currency: string;
  recurring?: {
    interval: 'month' | 'year';
    interval_count: number;
  };
  active: boolean;
}

export interface StripePaymentLink {
  id: string;
  url: string;
  active: boolean;
}

export interface StripeSubscription {
  id: string;
  customer: string;
  status: 'active' | 'past_due' | 'canceled' | 'incomplete' | 'trialing' | 'unpaid';
  current_period_start: number;
  current_period_end: number;
  items: {
    data: Array<{
      price: { id: string; product: string; unit_amount: number };
    }>;
  };
  metadata?: Record<string, string>;
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  subscription?: string;
  customer?: string;
}

export interface StripeClientConfig {
  apiKey: string;
  apiVersion?: string;
}

// ============================================================================
// Stripe Client
// ============================================================================

export class StripeClient {
  private apiKey: string;
  private baseUrl = 'https://api.stripe.com/v1';
  private apiVersion: string;

  constructor(config?: StripeClientConfig) {
    this.apiKey = config?.apiKey || process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY || '';
    this.apiVersion = config?.apiVersion || '2023-10-16';
    if (!this.apiKey) {
      console.warn('[Stripe] No API key configured. Set STRIPE_API_KEY env var.');
    }
  }

  // ==========================================================================
  // Products
  // ==========================================================================

  async createProduct(params: {
    name: string;
    description?: string;
    metadata?: Record<string, string>;
  }): Promise<StripeProduct> {
    return this.request<StripeProduct>('/products', params);
  }

  async getProduct(id: string): Promise<StripeProduct> {
    return this.request<StripeProduct>(`/products/${id}`, undefined, 'GET');
  }

  async listProducts(params?: { active?: boolean; limit?: number }): Promise<{ data: StripeProduct[] }> {
    const query = params ? '?' + this.toQueryString(params) : '';
    return this.request<{ data: StripeProduct[] }>(`/products${query}`, undefined, 'GET');
  }

  // ==========================================================================
  // Prices
  // ==========================================================================

  async createPrice(params: {
    product: string;
    unit_amount: number;
    currency: string;
    recurring?: { interval: 'month' | 'year' };
    metadata?: Record<string, string>;
  }): Promise<StripePrice> {
    return this.request<StripePrice>('/prices', params);
  }

  async listPrices(params?: { product?: string; active?: boolean }): Promise<{ data: StripePrice[] }> {
    const query = params ? '?' + this.toQueryString(params) : '';
    return this.request<{ data: StripePrice[] }>(`/prices${query}`, undefined, 'GET');
  }

  // ==========================================================================
  // Payment Links
  // ==========================================================================

  async createPaymentLink(params: {
    line_items: Array<{ price: string; quantity: number }>;
    metadata?: Record<string, string>;
    after_completion?: { type: 'redirect'; redirect: { url: string } };
  }): Promise<StripePaymentLink> {
    return this.request<StripePaymentLink>('/payment_links', params);
  }

  // ==========================================================================
  // Checkout Sessions
  // ==========================================================================

  async createCheckoutSession(params: {
    mode: 'subscription' | 'payment';
    line_items: Array<{ price: string; quantity: number }>;
    success_url: string;
    cancel_url?: string;
    metadata?: Record<string, string>;
  }): Promise<StripeCheckoutSession> {
    return this.request<StripeCheckoutSession>('/checkout/sessions', params);
  }

  // ==========================================================================
  // Subscriptions
  // ==========================================================================

  async getSubscription(id: string): Promise<StripeSubscription> {
    return this.request<StripeSubscription>(`/subscriptions/${id}`, undefined, 'GET');
  }

  async listSubscriptions(params?: {
    customer?: string;
    status?: string;
    price?: string;
    limit?: number;
  }): Promise<{ data: StripeSubscription[] }> {
    const query = params ? '?' + this.toQueryString(params) : '';
    return this.request<{ data: StripeSubscription[] }>(`/subscriptions${query}`, undefined, 'GET');
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  isTestMode(): boolean {
    return this.apiKey.includes('_test_');
  }

  // ==========================================================================
  // Private: HTTP Layer
  // ==========================================================================

  private async request<T>(path: string, body?: any, method: string = 'POST'): Promise<T> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Stripe-Version': this.apiVersion,
    };

    const options: RequestInit = { method, headers };

    if (body && method === 'POST') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      options.body = this.toFormData(body);
    }

    const resp = await fetch(`${this.baseUrl}${path}`, options);

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({})) as any;
      const msg = err?.error?.message || `Stripe API error: ${resp.status}`;
      throw new Error(`[Stripe] ${msg}`);
    }

    return resp.json() as Promise<T>;
  }

  /**
   * Convert nested object to Stripe's form-encoded format.
   * Stripe expects: line_items[0][price]=xxx&line_items[0][quantity]=1
   */
  private toFormData(obj: any, prefix = ''): string {
    const parts: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;
      const fullKey = prefix ? `${prefix}[${key}]` : key;

      if (Array.isArray(value)) {
        value.forEach((item, i) => {
          if (typeof item === 'object') {
            parts.push(this.toFormData(item, `${fullKey}[${i}]`));
          } else {
            parts.push(`${encodeURIComponent(`${fullKey}[${i}]`)}=${encodeURIComponent(String(item))}`);
          }
        });
      } else if (typeof value === 'object') {
        parts.push(this.toFormData(value, fullKey));
      } else {
        parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`);
      }
    }

    return parts.filter(Boolean).join('&');
  }

  private toQueryString(obj: Record<string, any>): string {
    return Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
  }
}

// ============================================================================
// Singleton
// ============================================================================

let stripeInstance: StripeClient | null = null;

export function getStripeClient(config?: StripeClientConfig): StripeClient {
  if (!stripeInstance) {
    stripeInstance = new StripeClient(config);
  }
  return stripeInstance;
}

export function resetStripeClient(): void {
  stripeInstance = null;
}
