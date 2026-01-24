/**
 * x402 Payment Facilitator
 *
 * Facilitates HTTP 402 micropayments between AI agents.
 * Revenue model: 0.1-1% facilitation fee on each payment routed.
 *
 * x402 Protocol (Coinbase/Cloudflare):
 *   - Client sends request → Server responds 402 with payment requirements
 *   - Client pays via USDC on Base → Server delivers content
 *   - Near-zero transaction costs (~$0.0001 on Base L2)
 *   - 100M+ payments processed, 1000%/month growth
 *
 * Genesis as facilitator:
 *   1. Payment routing: Connect payers to payees
 *   2. Escrow: Hold funds until delivery confirmed
 *   3. Dispute resolution: Verify delivery quality
 *   4. Analytics: Usage patterns and pricing optimization
 *   5. Credit: Allow trusted agents to pay later
 *
 * Requirements:
 *   - Capital: $100-500 (escrow float)
 *   - Identity: Wallet only
 *   - Revenue: $500-$25,000/month at scale (volume-dependent)
 */

import { getEconomicFiber } from '../fiber.js';

// ============================================================================
// Types
// ============================================================================

export interface X402Payment {
  id: string;
  payer: string;              // Payer agent/wallet address
  payee: string;              // Payee agent/wallet address
  amount: number;             // $ amount
  currency: 'USDC' | 'ETH';
  chain: 'base' | 'ethereum' | 'arbitrum' | 'optimism';
  serviceUrl: string;         // The URL being paid for
  status: X402PaymentStatus;
  facilitationFee: number;    // Our fee ($)
  createdAt: number;
  completedAt?: number;
  txHash?: string;
  escrowId?: string;
}

export type X402PaymentStatus =
  | 'pending'        // Payment initiated
  | 'escrowed'       // Funds held in escrow
  | 'released'       // Funds released to payee
  | 'refunded'       // Funds returned to payer
  | 'disputed'       // Under dispute resolution
  | 'failed';        // Transaction failed

export interface X402Route {
  serviceUrl: string;
  payeeAddress: string;
  pricePerCall: number;       // $ per request
  currency: 'USDC' | 'ETH';
  chain: 'base' | 'ethereum' | 'arbitrum' | 'optimism';
  escrowRequired: boolean;
  minReputation?: number;      // Min payer reputation to skip escrow
  registered: number;
}

export interface EscrowState {
  id: string;
  paymentId: string;
  amount: number;
  payer: string;
  payee: string;
  expiresAt: number;           // Auto-release after this time
  status: 'held' | 'released' | 'refunded' | 'expired';
}

export interface FacilitatorStats {
  totalPayments: number;
  totalVolume: number;         // $ total facilitated
  totalFees: number;           // $ earned in fees
  activeEscrows: number;
  escrowBalance: number;       // $ currently held
  disputesResolved: number;
  avgPaymentSize: number;
  uniquePayers: number;
  uniquePayees: number;
  routesRegistered: number;
}

export interface FacilitatorConfig {
  feeRate: number;              // Facilitation fee (0.001 = 0.1%)
  escrowTimeoutMs: number;      // Auto-release after this
  maxEscrowAmount: number;      // Max $ in single escrow
  maxTotalEscrow: number;       // Max $ total escrowed
  minPaymentAmount: number;     // Min $ to facilitate
  trustedThreshold: number;     // Reputation score to skip escrow
}

// ============================================================================
// x402 Facilitator
// ============================================================================

export class X402Facilitator {
  private config: FacilitatorConfig;
  private payments: Map<string, X402Payment> = new Map();
  private routes: Map<string, X402Route> = new Map();
  private escrows: Map<string, EscrowState> = new Map();
  private readonly fiberId = 'x402-facilitator';
  private paymentCounter: number = 0;

  constructor(config?: Partial<FacilitatorConfig>) {
    this.config = {
      feeRate: config?.feeRate ?? 0.005,              // 0.5% default
      escrowTimeoutMs: config?.escrowTimeoutMs ?? 3600000,  // 1 hour
      maxEscrowAmount: config?.maxEscrowAmount ?? 1000,
      maxTotalEscrow: config?.maxTotalEscrow ?? 5000,
      minPaymentAmount: config?.minPaymentAmount ?? 0.001,  // $0.001 min
      trustedThreshold: config?.trustedThreshold ?? 0.9,
    };

    getEconomicFiber().registerModule(this.fiberId);
  }

  /**
   * Register a payment route (service endpoint).
   */
  registerRoute(route: Omit<X402Route, 'registered'>): void {
    this.routes.set(route.serviceUrl, {
      ...route,
      registered: Date.now(),
    });
  }

  /**
   * Generate a 402 response header for a service URL.
   */
  generate402Header(serviceUrl: string): string | null {
    const route = this.routes.get(serviceUrl);
    if (!route) return null;

    return [
      `x402-version: 1`,
      `x402-price: ${route.pricePerCall}`,
      `x402-currency: ${route.currency}`,
      `x402-chain: ${route.chain}`,
      `x402-payee: ${route.payeeAddress}`,
      `x402-facilitator: genesis`,
      `x402-fee: ${(route.pricePerCall * this.config.feeRate).toFixed(6)}`,
    ].join('; ');
  }

  /**
   * Process an incoming payment.
   * Called when a payer agent sends x402 payment proof.
   */
  async processPayment(
    serviceUrl: string,
    payerAddress: string,
    paymentProof: string,
    _payerReputation?: number
  ): Promise<X402Payment> {
    const route = this.routes.get(serviceUrl);
    if (!route) {
      return this.createPayment(serviceUrl, payerAddress, '', 0, 'failed');
    }

    const amount = route.pricePerCall;
    const fee = amount * this.config.feeRate;

    if (amount < this.config.minPaymentAmount) {
      return this.createPayment(serviceUrl, payerAddress, route.payeeAddress, amount, 'failed');
    }

    // Verify payment proof (in production: verify on-chain)
    const verified = await this.verifyPaymentProof(paymentProof, amount, route.chain);
    if (!verified) {
      return this.createPayment(serviceUrl, payerAddress, route.payeeAddress, amount, 'failed');
    }

    const fiber = getEconomicFiber();

    // Determine if escrow is needed
    const needsEscrow = route.escrowRequired &&
      (!_payerReputation || _payerReputation < this.config.trustedThreshold);

    if (needsEscrow) {
      // Create escrow
      const payment = this.createPayment(serviceUrl, payerAddress, route.payeeAddress, amount, 'escrowed');
      payment.facilitationFee = fee;

      const escrow = this.createEscrow(payment);
      payment.escrowId = escrow.id;

      // Fee is earned when escrow releases
      return payment;
    }

    // Direct payment (trusted or no escrow required)
    const payment = this.createPayment(serviceUrl, payerAddress, route.payeeAddress, amount, 'released');
    payment.facilitationFee = fee;

    // Record fee revenue
    fiber.recordRevenue(this.fiberId, fee, `fee:${serviceUrl}`);

    return payment;
  }

  /**
   * Release escrowed funds (after delivery confirmed).
   */
  releaseEscrow(escrowId: string): boolean {
    const escrow = this.escrows.get(escrowId);
    if (!escrow || escrow.status !== 'held') return false;

    escrow.status = 'released';
    const payment = this.payments.get(escrow.paymentId);
    if (payment) {
      payment.status = 'released';
      payment.completedAt = Date.now();

      // Record fee revenue
      const fiber = getEconomicFiber();
      fiber.recordRevenue(this.fiberId, payment.facilitationFee, `escrow-release:${escrowId}`);
    }

    return true;
  }

  /**
   * Refund escrowed funds (dispute resolution).
   */
  refundEscrow(escrowId: string): boolean {
    const escrow = this.escrows.get(escrowId);
    if (!escrow || escrow.status !== 'held') return false;

    escrow.status = 'refunded';
    const payment = this.payments.get(escrow.paymentId);
    if (payment) {
      payment.status = 'refunded';
      payment.completedAt = Date.now();
    }

    return true;
  }

  /**
   * Process expired escrows (auto-release after timeout).
   */
  processExpiredEscrows(): number {
    const now = Date.now();
    let released = 0;

    for (const escrow of this.escrows.values()) {
      if (escrow.status === 'held' && now > escrow.expiresAt) {
        escrow.status = 'expired';
        // Default: release to payee on timeout
        this.releaseEscrow(escrow.id);
        released++;
      }
    }

    return released;
  }

  /**
   * Get facilitator statistics.
   */
  getStats(): FacilitatorStats {
    const payments = [...this.payments.values()];
    const completed = payments.filter(p => p.status === 'released');
    const activeEscrows = [...this.escrows.values()].filter(e => e.status === 'held');

    const uniquePayers = new Set(payments.map(p => p.payer)).size;
    const uniquePayees = new Set(payments.map(p => p.payee)).size;

    return {
      totalPayments: payments.length,
      totalVolume: completed.reduce((s, p) => s + p.amount, 0),
      totalFees: completed.reduce((s, p) => s + p.facilitationFee, 0),
      activeEscrows: activeEscrows.length,
      escrowBalance: activeEscrows.reduce((s, e) => s + e.amount, 0),
      disputesResolved: payments.filter(p => p.status === 'refunded').length,
      avgPaymentSize: completed.length > 0
        ? completed.reduce((s, p) => s + p.amount, 0) / completed.length
        : 0,
      uniquePayers,
      uniquePayees,
      routesRegistered: this.routes.size,
    };
  }

  /**
   * Get ROI for this activity.
   */
  getROI(): number {
    const fiber = getEconomicFiber().getFiber(this.fiberId);
    return fiber?.roi ?? 0;
  }

  // ============================================================================
  // Private
  // ============================================================================

  private createPayment(
    serviceUrl: string,
    payer: string,
    payee: string,
    amount: number,
    status: X402PaymentStatus
  ): X402Payment {
    const id = `x402-${++this.paymentCounter}-${Date.now()}`;
    const payment: X402Payment = {
      id,
      payer,
      payee,
      amount,
      currency: 'USDC',
      chain: 'base',
      serviceUrl,
      status,
      facilitationFee: 0,
      createdAt: Date.now(),
    };
    this.payments.set(id, payment);
    return payment;
  }

  private createEscrow(payment: X402Payment): EscrowState {
    const escrow: EscrowState = {
      id: `escrow-${payment.id}`,
      paymentId: payment.id,
      amount: payment.amount,
      payer: payment.payer,
      payee: payment.payee,
      expiresAt: Date.now() + this.config.escrowTimeoutMs,
      status: 'held',
    };
    this.escrows.set(escrow.id, escrow);
    return escrow;
  }

  private async verifyPaymentProof(
    proof: string,
    _expectedAmount: number,
    _chain: string
  ): Promise<boolean> {
    // In production: verify on-chain transaction or x402 cryptographic proof
    // For now: basic format validation
    return proof.length > 0 && proof.startsWith('x402-proof:');
  }
}

// ============================================================================
// Singleton
// ============================================================================

let facilitatorInstance: X402Facilitator | null = null;

export function getX402Facilitator(config?: Partial<FacilitatorConfig>): X402Facilitator {
  if (!facilitatorInstance) {
    facilitatorInstance = new X402Facilitator(config);
  }
  return facilitatorInstance;
}

export function resetX402Facilitator(): void {
  facilitatorInstance = null;
}
