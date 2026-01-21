/**
 * Genesis Payment Types
 *
 * Core type definitions for payment processing, subscriptions,
 * and usage-based billing integration.
 */

// ============================================================================
// Payment Provider Types
// ============================================================================

export type PaymentProvider = 'stripe' | 'coinbase' | 'manual';

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'refunded'
  | 'cancelled';

export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'paused'
  | 'trialing';

export type BillingCycle = 'monthly' | 'yearly' | 'usage';

// ============================================================================
// Transaction Types
// ============================================================================

export interface Transaction {
  /** Unique transaction ID */
  id: string;
  /** Payment provider used */
  provider: PaymentProvider;
  /** External provider transaction ID */
  externalId?: string;
  /** Amount in cents */
  amount: number;
  /** Currency code (USD, EUR, etc.) */
  currency: string;
  /** Transaction status */
  status: PaymentStatus;
  /** Transaction description */
  description: string;
  /** Associated user/account ID */
  userId: string;
  /** Associated subscription ID if any */
  subscriptionId?: string;
  /** Transaction metadata */
  metadata?: Record<string, unknown>;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Completion timestamp */
  completedAt?: Date;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Subscription Types
// ============================================================================

export interface Subscription {
  /** Unique subscription ID */
  id: string;
  /** User/account ID */
  userId: string;
  /** Plan ID */
  planId: string;
  /** Payment provider */
  provider: PaymentProvider;
  /** External subscription ID */
  externalId?: string;
  /** Subscription status */
  status: SubscriptionStatus;
  /** Billing cycle */
  cycle: BillingCycle;
  /** Price per cycle in cents */
  pricePerCycle: number;
  /** Currency */
  currency: string;
  /** Current period start */
  currentPeriodStart: Date;
  /** Current period end */
  currentPeriodEnd: Date;
  /** Trial end date if applicable */
  trialEnd?: Date;
  /** Cancellation date if cancelled */
  cancelledAt?: Date;
  /** Cancel at period end flag */
  cancelAtPeriodEnd: boolean;
  /** Subscription metadata */
  metadata?: Record<string, unknown>;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
}

// ============================================================================
// Usage & Billing Types
// ============================================================================

export interface UsageRecord {
  /** Unique record ID */
  id: string;
  /** User/account ID */
  userId: string;
  /** Subscription ID */
  subscriptionId?: string;
  /** Metric name (tokens, api_calls, compute_minutes) */
  metric: string;
  /** Quantity used */
  quantity: number;
  /** Unit price in cents */
  unitPrice: number;
  /** Total amount in cents */
  amount: number;
  /** Usage timestamp */
  timestamp: Date;
  /** Optional billing period */
  billingPeriod?: string;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

export interface UsageSummary {
  /** User/account ID */
  userId: string;
  /** Billing period (YYYY-MM) */
  period: string;
  /** Usage by metric */
  metrics: Record<string, {
    quantity: number;
    amount: number;
  }>;
  /** Total amount in cents */
  totalAmount: number;
  /** Currency */
  currency: string;
}

// ============================================================================
// Plan & Pricing Types
// ============================================================================

export interface PricingTier {
  /** Minimum quantity for this tier */
  upTo: number | null; // null = unlimited
  /** Price per unit in cents */
  unitPrice: number;
  /** Optional flat fee for this tier */
  flatFee?: number;
}

export interface PlanMetric {
  /** Metric identifier */
  id: string;
  /** Display name */
  name: string;
  /** Included quantity (free tier) */
  included: number;
  /** Pricing tiers for overage */
  tiers: PricingTier[];
}

export interface Plan {
  /** Unique plan ID */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Billing cycle */
  cycle: BillingCycle;
  /** Base price per cycle in cents */
  basePrice: number;
  /** Currency */
  currency: string;
  /** Usage metrics included */
  metrics: PlanMetric[];
  /** Features included */
  features: string[];
  /** Is this plan active for new subscriptions */
  active: boolean;
  /** Sort order for display */
  sortOrder: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Budget & Constraints
// ============================================================================

export interface BudgetConstraint {
  /** User/account ID */
  userId: string;
  /** Maximum spending per period in cents */
  maxSpendingPerPeriod: number;
  /** Budget period (daily, weekly, monthly) */
  period: 'daily' | 'weekly' | 'monthly';
  /** Alert threshold percentage (0-100) */
  alertThreshold: number;
  /** Hard limit - stop operations when exceeded */
  hardLimit: boolean;
  /** Current period spending */
  currentSpending: number;
  /** Period start timestamp */
  periodStart: Date;
}

export interface BudgetAlert {
  /** User/account ID */
  userId: string;
  /** Alert type */
  type: 'threshold' | 'exceeded' | 'reset';
  /** Percentage of budget used */
  percentUsed: number;
  /** Current spending in cents */
  currentSpending: number;
  /** Budget limit in cents */
  budgetLimit: number;
  /** Timestamp */
  timestamp: Date;
}

// ============================================================================
// Webhook Types
// ============================================================================

export interface WebhookEvent {
  /** Event ID */
  id: string;
  /** Provider that sent the webhook */
  provider: PaymentProvider;
  /** Event type */
  type: string;
  /** Event data */
  data: Record<string, unknown>;
  /** Raw payload */
  rawPayload: string;
  /** Signature for verification */
  signature?: string;
  /** Received timestamp */
  receivedAt: Date;
  /** Processed timestamp */
  processedAt?: Date;
  /** Processing error if any */
  error?: string;
}

// ============================================================================
// Service Configuration
// ============================================================================

export interface PaymentConfig {
  /** Stripe configuration */
  stripe?: {
    secretKey: string;
    publishableKey: string;
    webhookSecret: string;
    testMode: boolean;
  };
  /** Coinbase Commerce configuration */
  coinbase?: {
    apiKey: string;
    webhookSecret: string;
  };
  /** Default currency */
  defaultCurrency: string;
  /** Enable usage-based billing */
  usageBasedBilling: boolean;
  /** Usage reporting interval in seconds */
  usageReportingInterval: number;
}
