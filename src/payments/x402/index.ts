/**
 * x402 Payment Protocol Integration
 *
 * Complete implementation of HTTP 402 Payment Required protocol
 * for AI agent micropayments on Base L2.
 *
 * Features:
 * - Client: Pay for resources (USDC on Base)
 * - Server: Receive payments (facilitator role)
 * - Verification: On-chain payment verification
 * - Pricing: Dynamic pricing engine with demand signals
 * - Event Bus: Integration with Genesis event system
 *
 * Usage (as payer):
 * ```typescript
 * import { createClient } from './payments/x402/index.js';
 * import { getLiveWallet } from './economy/live/wallet.js';
 *
 * const wallet = getLiveWallet();
 * const client = createClient(wallet);
 *
 * // Receive challenge from resource provider
 * const challenge = { ... }; // From HTTP 402 response
 *
 * // Pay for resource
 * const result = await client.pay(challenge);
 * if (result.success) {
 *   console.log('Payment successful:', result.receipt);
 *   // Use result.receipt.accessToken to access resource
 * }
 * ```
 *
 * Usage (as facilitator):
 * ```typescript
 * import { createServer } from './payments/x402/index.js';
 *
 * const server = createServer('0x...your-payment-address');
 *
 * // Issue challenge when resource is requested
 * const challenge = server.issueChallenge(
 *   'https://api.example.com/resource',
 *   'api.call'
 * );
 *
 * // Return HTTP 402 with challenge to client
 * res.status(402).json(challenge);
 *
 * // Verify payment proof when client submits
 * const receipt = await server.verifyPayment(proof);
 *
 * // Grant access if verified
 * if (receipt.verified) {
 *   // Serve resource
 * }
 * ```
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
  // Core protocol types
  X402Challenge,
  X402PaymentProof,
  X402Receipt,
  X402Session,
  PaymentNetwork,
  PaymentCurrency,
  PaymentStatus,
  // Configuration types
  FacilitatorConfig,
  PayerConfig,
  PricingConfig,
  // Pricing types
  ResourceCost,
  DemandSignal,
  // Storage types
  SessionStore,
  ReceiptStore,
  // Result types
  PaymentResult,
  // Event types
  X402PaymentInitiatedEvent,
  X402PaymentCompletedEvent,
  X402PaymentFailedEvent,
  X402RevenueReceivedEvent,
  X402ChallengeIssuedEvent,
} from './types.js';

export { X402Error } from './types.js';

// ============================================================================
// Client Exports
// ============================================================================

export {
  X402Client,
  createClient,
  createAutonomousClient,
  createRestrictedClient,
} from './client.js';

// ============================================================================
// Server Exports
// ============================================================================

export {
  X402Server,
  createServer,
  createAggressiveServer,
  createFixedPriceServer,
  createDemandSignal,
} from './server.js';

// ============================================================================
// Verification Exports
// ============================================================================

export {
  PaymentVerifier,
  createVerifier,
  createTestVerifier,
  isChallengeValid,
  isNonceValid,
  generateNonce,
} from './verification.js';

export type { VerificationResult } from './verification.js';

// ============================================================================
// Pricing Exports
// ============================================================================

export {
  PricingEngine,
  createPricingEngine,
  createAggressivePricing,
  createFixedPricing,
  formatPrice,
  parsePrice,
  recommendPrice,
} from './pricing.js';

// ============================================================================
// Convenience Functions
// ============================================================================

import { getLiveWallet } from '../../economy/live/wallet.js';
import { createClient, createAutonomousClient } from './client.js';
import { createServer } from './server.js';
import type { PayerConfig, FacilitatorConfig } from './types.js';

/**
 * Quick setup for x402 client using environment wallet
 */
export function setupClient(config?: Partial<PayerConfig>) {
  try {
    const wallet = getLiveWallet();
    return createClient(wallet, config);
  } catch (error) {
    throw new Error(
      `Failed to setup x402 client: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Quick setup for autonomous x402 client
 */
export function setupAutonomousClient() {
  try {
    const wallet = getLiveWallet();
    return createAutonomousClient(wallet);
  } catch (error) {
    throw new Error(
      `Failed to setup autonomous x402 client: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Quick setup for x402 server using wallet address
 */
export function setupServer(config?: Partial<FacilitatorConfig>) {
  try {
    const wallet = getLiveWallet();
    return createServer(wallet.getAddress(), config);
  } catch (error) {
    throw new Error(
      `Failed to setup x402 server: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ============================================================================
// Protocol Information
// ============================================================================

/**
 * x402 protocol information
 */
export const X402_PROTOCOL = {
  name: 'HTTP 402 Payment Required',
  version: '1.0.0',
  description: 'Micropayments for AI agent resource access',
  networks: ['base', 'base-sepolia'],
  currencies: ['USDC', 'ETH'],
  website: 'https://402.dev',
} as const;

/**
 * Get protocol information
 */
export function getProtocolInfo() {
  return X402_PROTOCOL;
}

/**
 * Check if x402 client is configured
 */
export function isClientConfigured(): boolean {
  try {
    getLiveWallet();
    return true;
  } catch (err) {
    console.error('[X402] Wallet configuration check failed:', err);
    return false;
  }
}
