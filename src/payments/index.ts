/**
 * Genesis Payments Module
 *
 * Multi-provider payment processing with usage-based billing
 * and Active Inference economic integration.
 */

// Types
export * from './types.js';

// Payment Service
export {
  PaymentService,
  getPaymentService,
  resetPaymentService,
  type CreateTransactionParams,
  type CreateSubscriptionParams,
  type RecordUsageParams,
  type PaymentServiceStats,
} from './payment-service.js';

// Revenue Tracker
export {
  RevenueTracker,
  getRevenueTracker,
  resetRevenueTracker,
  type RevenueMetrics,
  type CostEntry,
  type ProfitTarget,
} from './revenue-tracker.js';

// API
export {
  PaymentAPI,
  getPaymentAPI,
  processPaymentCommand,
  type APIResponse,
  type APIRequest,
} from './api.js';

// Stripe Client
export {
  StripeClient,
  getStripeClient,
  resetStripeClient,
  type StripeProduct,
  type StripePrice,
  type StripePaymentLink,
  type StripeSubscription,
  type StripeCheckoutSession,
  type StripeClientConfig,
} from './stripe-client.js';
