/**
 * x402 Payment Server (Facilitator)
 *
 * Server-side payment handler for receiving x402 payments.
 * Issues payment challenges and verifies proofs before granting access.
 *
 * Flow:
 * 1. Client requests protected resource
 * 2. Issue 402 challenge with payment details
 * 3. Client submits payment proof
 * 4. Verify payment on-chain
 * 5. Issue access receipt/token
 * 6. Track revenue via event bus
 */

import { randomBytes } from 'crypto';
import type {
  X402Challenge,
  X402PaymentProof,
  X402Receipt,
  FacilitatorConfig,
  ResourceCost,
  DemandSignal,
  ReceiptStore,
  PaymentCurrency,
} from './types.js';
import { X402Error } from './types.js';
import { PricingEngine } from './pricing.js';
import { PaymentVerifier, generateNonce } from './verification.js';
import { getEventBus } from '../../bus/index.js';
import { parseUnits } from 'viem';

// ============================================================================
// In-Memory Receipt Store
// ============================================================================

class MemoryReceiptStore implements ReceiptStore {
  private receipts = new Map<string, X402Receipt>();
  private byChallengeId = new Map<string, string>(); // challengeId -> receiptId

  async get(receiptId: string): Promise<X402Receipt | null> {
    return this.receipts.get(receiptId) || null;
  }

  async getByChallenge(challengeId: string): Promise<X402Receipt | null> {
    const receiptId = this.byChallengeId.get(challengeId);
    if (!receiptId) return null;
    return this.receipts.get(receiptId) || null;
  }

  async set(receiptId: string, receipt: X402Receipt): Promise<void> {
    this.receipts.set(receiptId, receipt);
    this.byChallengeId.set(receipt.challengeId, receiptId);
  }

  async list(): Promise<X402Receipt[]> {
    return Array.from(this.receipts.values());
  }
}

// ============================================================================
// Payment Server (Facilitator)
// ============================================================================

export class X402Server {
  private config: FacilitatorConfig;
  private pricingEngine: PricingEngine;
  private verifier: PaymentVerifier;
  private receiptStore: ReceiptStore;
  private challenges = new Map<string, X402Challenge>();
  private usedNonces = new Set<string>();
  private bus = getEventBus();
  private demandMetrics = new Map<string, DemandSignal>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null; // v16.1.2: Auto-cleanup

  constructor(config: Partial<FacilitatorConfig>) {
    this.config = {
      paymentAddress: config.paymentAddress || '',
      network: config.network || 'base-sepolia',
      acceptedCurrencies: config.acceptedCurrencies || ['USDC'],
      challengeExpirySeconds: config.challengeExpirySeconds || 300, // 5 minutes
      pricing: config.pricing || {
        basePrices: {
          'api.call': parseUnits('0.01', 6),
        },
        dynamicPricing: true,
        minPrice: parseUnits('0.001', 6),
        maxPrice: parseUnits('10.00', 6),
        elasticity: 1.5,
        costFactors: {
          compute: 0.0001,
          bandwidth: 0.00001,
          storage: 0.000001,
        },
      },
      minPayment: config.minPayment || parseUnits('0.001', 6),
      autoVerify: config.autoVerify ?? true,
      requiredConfirmations: config.requiredConfirmations || 1,
    };

    if (!this.config.paymentAddress) {
      throw new Error('Payment address is required for x402 server');
    }

    this.pricingEngine = new PricingEngine(this.config.pricing);
    this.verifier = new PaymentVerifier({
      network: this.config.network,
      requiredConfirmations: this.config.requiredConfirmations,
      maxTransactionAge: 3600,
    });
    this.receiptStore = new MemoryReceiptStore();

    // v16.1.2: Start automatic cleanup to prevent memory leaks
    // Clean up expired challenges and nonces every 60 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupChallenges();
    }, 60_000);

    console.log(
      `[x402] Server initialized on ${this.config.network} at ${this.config.paymentAddress}`,
    );
  }

  /**
   * v16.1.2: Stop the server and clean up resources
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.challenges.clear();
    this.usedNonces.clear();
    console.log('[x402] Server stopped');
  }

  /**
   * Issue payment challenge for a resource
   */
  issueChallenge(
    resourceUri: string,
    resourceType: string,
    currency: PaymentCurrency = 'USDC',
  ): X402Challenge {
    // Calculate price
    const demand = this.demandMetrics.get(resourceType);
    const cost = this.pricingEngine.calculateCost(
      resourceUri,
      resourceType,
      demand,
    );

    // Check minimum payment
    if (cost.finalPrice < this.config.minPayment) {
      cost.finalPrice = this.config.minPayment;
    }

    // Create challenge
    const challengeId = this.generateChallengeId();
    const nonce = generateNonce();
    this.usedNonces.add(nonce);

    const expiresAt = new Date(
      Date.now() + this.config.challengeExpirySeconds * 1000,
    ).toISOString();

    const challenge: X402Challenge = {
      challengeId,
      resourceUri,
      paymentAddress: this.config.paymentAddress,
      amount: cost.finalPrice,
      currency,
      network: this.config.network,
      expiresAt,
      nonce,
      pricing: {
        basePrice: cost.baseCost,
        demandMultiplier: cost.demandMultiplier,
        costFactors: cost.breakdown,
      },
      metadata: {
        resourceType,
        estimatedCost: Number(cost.finalPrice) / 1_000_000,
      },
    };

    this.challenges.set(challengeId, challenge);

    // Emit challenge event
    this.bus.publish('economy.revenue.recorded', {
      source: 'x402-server',
      precision: 1.0,
      amount: Number(cost.finalPrice) / 1_000_000,
      revenueSource: `x402-challenge-${resourceType}`,
    });

    console.log(
      `[x402] Challenge issued: ${challengeId} for ${resourceUri} - ${Number(cost.finalPrice) / 1_000_000} ${currency}`,
    );

    return challenge;
  }

  /**
   * Verify payment proof and issue receipt
   */
  async verifyPayment(proof: X402PaymentProof): Promise<X402Receipt> {
    // Get challenge
    const challenge = this.challenges.get(proof.challengeId);
    if (!challenge) {
      throw new X402Error('INVALID_PROOF', 'Challenge not found');
    }

    // Check if already verified
    const existingReceipt = await this.receiptStore.getByChallenge(
      proof.challengeId,
    );
    if (existingReceipt) {
      console.log(`[x402] Payment already verified: ${proof.challengeId}`);
      return existingReceipt;
    }

    // Verify payment on-chain if auto-verify enabled
    if (this.config.autoVerify) {
      const verificationResult = await this.verifier.verify(proof, challenge);

      if (!verificationResult.valid) {
        throw new X402Error(
          'VERIFICATION_FAILED',
          `Payment verification failed: ${verificationResult.errors.join(', ')}`,
          verificationResult,
        );
      }

      console.log(`[x402] Payment verified on-chain: ${proof.txHash}`);
    }

    // Create receipt
    const receiptId = this.generateReceiptId();
    const receipt: X402Receipt = {
      receiptId,
      challengeId: proof.challengeId,
      proof,
      verified: true,
      verifiedAt: new Date().toISOString(),
      // In production, would generate JWT access token here
      accessToken: this.generateAccessToken(proof.challengeId),
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour
    };

    await this.receiptStore.set(receiptId, receipt);

    // Emit revenue event
    this.bus.publish('economy.revenue.recorded', {
      source: 'x402-server',
      precision: 1.0,
      amount: Number(proof.amount) / 1_000_000,
      revenueSource: `x402-verified-${challenge.metadata?.resourceType || 'unknown'}`,
    });

    console.log(
      `[x402] Receipt issued: ${receiptId} for ${Number(proof.amount) / 1_000_000} ${proof.currency}`,
    );

    return receipt;
  }

  /**
   * Verify access token and check if still valid
   */
  async verifyAccess(
    accessToken: string,
  ): Promise<{ valid: boolean; receipt?: X402Receipt }> {
    // In production, would verify JWT signature and expiration
    // For now, just check if token exists in our receipts
    const receipts = await this.receiptStore.list();
    const receipt = receipts.find((r) => r.accessToken === accessToken);

    if (!receipt) {
      return { valid: false };
    }

    // Check expiration
    if (receipt.expiresAt) {
      const expiry = new Date(receipt.expiresAt);
      if (expiry < new Date()) {
        return { valid: false, receipt };
      }
    }

    return { valid: true, receipt };
  }

  /**
   * Update demand signal for dynamic pricing
   */
  updateDemand(signal: DemandSignal): void {
    this.demandMetrics.set(signal.resourceType, signal);
    this.pricingEngine.recordDemand(signal);

    console.log(
      `[x402] Demand updated for ${signal.resourceType}: ${signal.utilization}% utilization, ${signal.requestRate} req/s`,
    );
  }

  /**
   * Get current price for a resource type
   */
  getPrice(resourceType: string): ResourceCost {
    const demand = this.demandMetrics.get(resourceType);
    return this.pricingEngine.calculateCost(
      `preview-${resourceType}`,
      resourceType,
      demand,
    );
  }

  /**
   * Get challenge by ID
   */
  getChallenge(challengeId: string): X402Challenge | undefined {
    return this.challenges.get(challengeId);
  }

  /**
   * List all receipts
   */
  async listReceipts(): Promise<X402Receipt[]> {
    return this.receiptStore.list();
  }

  /**
   * Get revenue statistics
   */
  async getRevenueStats(): Promise<{
    totalReceipts: number;
    totalRevenue: bigint;
    revenueByType: Record<string, bigint>;
  }> {
    const receipts = await this.receiptStore.list();
    let totalRevenue = 0n;
    const revenueByType: Record<string, bigint> = {};

    for (const receipt of receipts) {
      totalRevenue += receipt.proof.amount;

      const challenge = this.challenges.get(receipt.challengeId);
      const type = challenge?.metadata?.resourceType || 'unknown';

      if (!revenueByType[type]) {
        revenueByType[type] = 0n;
      }
      revenueByType[type] += receipt.proof.amount;
    }

    return {
      totalReceipts: receipts.length,
      totalRevenue,
      revenueByType,
    };
  }

  /**
   * Clean up expired challenges
   */
  cleanupChallenges(): number {
    let removed = 0;
    const now = new Date();

    for (const [id, challenge] of this.challenges) {
      const expiry = new Date(challenge.expiresAt);
      if (expiry < now) {
        this.challenges.delete(id);
        this.usedNonces.delete(challenge.nonce);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[x402] Cleaned up ${removed} expired challenges`);
    }

    return removed;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<FacilitatorConfig>): void {
    this.config = { ...this.config, ...updates };
    if (updates.pricing) {
      this.pricingEngine.updateConfig(updates.pricing);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): FacilitatorConfig {
    return { ...this.config };
  }

  private generateChallengeId(): string {
    // Cryptographically secure challenge ID
    const random = randomBytes(8).toString('hex');
    return `x402-chal-${Date.now()}-${random}`;
  }

  private generateReceiptId(): string {
    // Cryptographically secure receipt ID
    const random = randomBytes(8).toString('hex');
    return `x402-rcpt-${Date.now()}-${random}`;
  }

  private generateAccessToken(challengeId: string): string {
    // Cryptographically secure access token
    // In production, would generate signed JWT with proper claims
    const random = randomBytes(16).toString('hex');
    return `x402-token-${challengeId}-${random}`;
  }
}

// ============================================================================
// Server Factory
// ============================================================================

/**
 * Create x402 payment server
 */
export function createServer(
  paymentAddress: string,
  config?: Partial<FacilitatorConfig>,
): X402Server {
  return new X402Server({
    paymentAddress,
    ...config,
  });
}

/**
 * Create server with aggressive dynamic pricing
 */
export function createAggressiveServer(
  paymentAddress: string,
): X402Server {
  return new X402Server({
    paymentAddress,
    pricing: {
      basePrices: {
        'api.call': parseUnits('0.05', 6),
      },
      dynamicPricing: true,
      minPrice: parseUnits('0.01', 6),
      maxPrice: parseUnits('50.00', 6),
      elasticity: 2.5,
      costFactors: {
        compute: 0.0005,
        bandwidth: 0.00005,
        storage: 0.000005,
      },
    },
    requiredConfirmations: 2,
  });
}

/**
 * Create server with fixed pricing (no dynamic adjustment)
 */
export function createFixedPriceServer(
  paymentAddress: string,
): X402Server {
  return new X402Server({
    paymentAddress,
    pricing: {
      basePrices: {
        'api.call': parseUnits('0.01', 6),
      },
      dynamicPricing: false,
      minPrice: parseUnits('0.001', 6),
      maxPrice: parseUnits('1.00', 6),
      elasticity: 0,
      costFactors: {
        compute: 0.0001,
        bandwidth: 0.00001,
        storage: 0.000001,
      },
    },
    requiredConfirmations: 1,
  });
}

// ============================================================================
// Demand Signal Helper
// ============================================================================

/**
 * Create demand signal from current metrics
 */
export function createDemandSignal(
  resourceType: string,
  metrics: {
    requestRate: number;
    averageRate: number;
    utilization: number;
    queueDepth: number;
  },
): DemandSignal {
  return {
    resourceType,
    requestRate: metrics.requestRate,
    averageRate: metrics.averageRate,
    utilization: metrics.utilization,
    queueDepth: metrics.queueDepth,
    timestamp: new Date().toISOString(),
  };
}
