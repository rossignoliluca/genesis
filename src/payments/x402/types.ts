/**
 * x402 Payment Protocol Types
 *
 * Type definitions for the HTTP 402 Payment Required protocol.
 * Enables micropayments for AI agent resource access on the open internet.
 *
 * Reference: https://402.dev (HTTP 402 Payment Required)
 *
 * Core concepts:
 * - Resource providers issue 402 responses with payment challenges
 * - Payers submit payment proofs to access resources
 * - Verification happens on-chain (USDC on Base L2)
 * - Dynamic pricing based on resource cost and demand
 */

import type { BusEvent } from '../../bus/events.js';

// ============================================================================
// x402 Protocol Types
// ============================================================================

export type PaymentNetwork = 'base' | 'base-sepolia';
export type PaymentCurrency = 'USDC' | 'ETH';
export type PaymentStatus = 'pending' | 'verified' | 'failed' | 'expired';

/**
 * x402 Payment Challenge
 * Issued by resource provider when payment is required (HTTP 402)
 */
export interface X402Challenge {
  /** Unique challenge ID */
  challengeId: string;
  /** Resource URI that requires payment */
  resourceUri: string;
  /** Provider's payment address (Base L2) */
  paymentAddress: string;
  /** Required payment amount in smallest unit (e.g., 0.01 USDC = 10000) */
  amount: bigint;
  /** Payment currency */
  currency: PaymentCurrency;
  /** Payment network */
  network: PaymentNetwork;
  /** Challenge expiration timestamp */
  expiresAt: string;
  /** Nonce to prevent replay attacks */
  nonce: string;
  /** Optional pricing breakdown */
  pricing?: {
    basePrice: bigint;
    demandMultiplier: number;
    costFactors: Record<string, number>;
  };
  /** Optional resource metadata */
  metadata?: {
    resourceType: string;
    estimatedCost?: number;
    rateLimit?: {
      requests: number;
      window: string;
    };
  };
}

/**
 * x402 Payment Proof
 * Submitted by payer to prove payment was made
 */
export interface X402PaymentProof {
  /** Challenge ID being satisfied */
  challengeId: string;
  /** Transaction hash on Base L2 */
  txHash: string;
  /** Payer's address */
  fromAddress: string;
  /** Provider's address (must match challenge) */
  toAddress: string;
  /** Amount paid in smallest unit */
  amount: bigint;
  /** Payment currency */
  currency: PaymentCurrency;
  /** Payment network */
  network: PaymentNetwork;
  /** Block number where transaction was included */
  blockNumber: bigint;
  /** Timestamp of payment */
  timestamp: string;
  /** Optional signature for additional verification */
  signature?: string;
}

/**
 * x402 Payment Receipt
 * Returned after successful payment verification
 */
export interface X402Receipt {
  /** Receipt ID */
  receiptId: string;
  /** Challenge that was satisfied */
  challengeId: string;
  /** Payment proof that was verified */
  proof: X402PaymentProof;
  /** Verification status */
  verified: boolean;
  /** Access token for resource (JWT or similar) */
  accessToken?: string;
  /** Token expiration time */
  expiresAt?: string;
  /** Verification timestamp */
  verifiedAt: string;
  /** Provider signature over receipt */
  providerSignature?: string;
}

/**
 * x402 Payment Session
 * Tracks payment lifecycle for a resource access request
 */
export interface X402Session {
  /** Session ID */
  sessionId: string;
  /** Resource URI */
  resourceUri: string;
  /** Payment challenge */
  challenge: X402Challenge;
  /** Payment proof (once submitted) */
  proof?: X402PaymentProof;
  /** Receipt (once verified) */
  receipt?: X402Receipt;
  /** Session status */
  status: PaymentStatus;
  /** Session creation time */
  createdAt: string;
  /** Last update time */
  updatedAt: string;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Pricing Engine Types
// ============================================================================

/**
 * Resource cost estimation
 */
export interface ResourceCost {
  /** Resource identifier */
  resourceId: string;
  /** Base cost in USDC (smallest unit) */
  baseCost: bigint;
  /** Estimated compute cost */
  computeCost: number;
  /** Estimated bandwidth cost */
  bandwidthCost: number;
  /** Estimated storage cost */
  storageCost: number;
  /** Current demand multiplier (1.0 = normal, 2.0 = 2x price) */
  demandMultiplier: number;
  /** Final price after demand adjustment */
  finalPrice: bigint;
  /** Cost breakdown */
  breakdown: Record<string, number>;
}

/**
 * Dynamic pricing configuration
 */
export interface PricingConfig {
  /** Base price per resource type in USDC (smallest unit) */
  basePrices: Record<string, bigint>;
  /** Demand-based pricing enabled */
  dynamicPricing: boolean;
  /** Minimum price (floor) */
  minPrice: bigint;
  /** Maximum price (ceiling) */
  maxPrice: bigint;
  /** Demand elasticity factor (higher = more price sensitivity) */
  elasticity: number;
  /** Cost factors by resource type */
  costFactors: {
    compute: number; // Cost per compute unit
    bandwidth: number; // Cost per byte
    storage: number; // Cost per byte-hour
  };
}

/**
 * Demand signal for dynamic pricing
 */
export interface DemandSignal {
  /** Resource type */
  resourceType: string;
  /** Current request rate (requests/second) */
  requestRate: number;
  /** Average request rate over window */
  averageRate: number;
  /** Utilization percentage (0-100) */
  utilization: number;
  /** Queue depth */
  queueDepth: number;
  /** Timestamp */
  timestamp: string;
}

// ============================================================================
// Payment Facilitator Types
// ============================================================================

/**
 * Payment facilitator (server-side) configuration
 */
export interface FacilitatorConfig {
  /** Payment address to receive funds */
  paymentAddress: string;
  /** Payment network */
  network: PaymentNetwork;
  /** Accepted currencies */
  acceptedCurrencies: PaymentCurrency[];
  /** Challenge expiration time (seconds) */
  challengeExpirySeconds: number;
  /** Pricing configuration */
  pricing: PricingConfig;
  /** Minimum payment amount */
  minPayment: bigint;
  /** Auto-verify payments on-chain */
  autoVerify: boolean;
  /** Required confirmations for verification */
  requiredConfirmations: number;
}

/**
 * Payment payer (client-side) configuration
 */
export interface PayerConfig {
  /** Wallet address for payments */
  walletAddress: string;
  /** Payment network */
  network: PaymentNetwork;
  /** Preferred currency */
  preferredCurrency: PaymentCurrency;
  /** Maximum auto-pay amount (safety limit) */
  maxAutoPayAmount: bigint;
  /** Auto-pay enabled for amounts under max */
  autoPayEnabled: boolean;
  /** Budget tracking enabled */
  budgetTracking: boolean;
  /** Daily budget limit */
  dailyBudget?: bigint;
}

// ============================================================================
// Event Bus Integration
// ============================================================================

/**
 * x402 payment initiated event
 */
export interface X402PaymentInitiatedEvent extends BusEvent {
  sessionId: string;
  resourceUri: string;
  challengeId: string;
  amount: string; // bigint as string for serialization
  currency: PaymentCurrency;
}

/**
 * x402 payment completed event
 */
export interface X402PaymentCompletedEvent extends BusEvent {
  sessionId: string;
  resourceUri: string;
  txHash: string;
  amount: string; // bigint as string
  currency: PaymentCurrency;
  verified: boolean;
}

/**
 * x402 payment failed event
 */
export interface X402PaymentFailedEvent extends BusEvent {
  sessionId: string;
  resourceUri: string;
  challengeId: string;
  error: string;
  retryable: boolean;
}

/**
 * x402 revenue received event
 */
export interface X402RevenueReceivedEvent extends BusEvent {
  receiptId: string;
  resourceUri: string;
  amount: string; // bigint as string
  currency: PaymentCurrency;
  fromAddress: string;
  txHash: string;
}

/**
 * x402 challenge issued event
 */
export interface X402ChallengeIssuedEvent extends BusEvent {
  challengeId: string;
  resourceUri: string;
  amount: string; // bigint as string
  currency: PaymentCurrency;
  expiresAt: string;
}

// ============================================================================
// Storage Types
// ============================================================================

/**
 * In-memory session store interface
 */
export interface SessionStore {
  get(sessionId: string): Promise<X402Session | null>;
  set(sessionId: string, session: X402Session): Promise<void>;
  delete(sessionId: string): Promise<void>;
  list(): Promise<X402Session[]>;
  cleanup(olderThan: Date): Promise<number>;
}

/**
 * In-memory receipt store interface
 */
export interface ReceiptStore {
  get(receiptId: string): Promise<X402Receipt | null>;
  getByChallenge(challengeId: string): Promise<X402Receipt | null>;
  set(receiptId: string, receipt: X402Receipt): Promise<void>;
  list(): Promise<X402Receipt[]>;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * x402 error types
 */
export type X402ErrorType =
  | 'PAYMENT_REQUIRED'
  | 'INVALID_PROOF'
  | 'INSUFFICIENT_AMOUNT'
  | 'EXPIRED_CHALLENGE'
  | 'VERIFICATION_FAILED'
  | 'NETWORK_ERROR'
  | 'BUDGET_EXCEEDED'
  | 'UNKNOWN_ERROR';

/**
 * x402 error
 */
export class X402Error extends Error {
  constructor(
    public type: X402ErrorType,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'X402Error';
  }
}

/**
 * Payment result
 */
export interface PaymentResult {
  success: boolean;
  receipt?: X402Receipt;
  error?: X402Error;
  txHash?: string;
}
