/**
 * x402 Payment Client
 *
 * Client-side payment handler for paying for resources via x402 protocol.
 * Integrates with Genesis wallet to submit payments on Base L2.
 *
 * Flow:
 * 1. Receive 402 challenge from resource provider
 * 2. Evaluate payment (check budget, verify challenge)
 * 3. Submit USDC payment via wallet
 * 4. Generate payment proof
 * 5. Submit proof to provider
 * 6. Receive access token/receipt
 */

import { randomBytes } from 'crypto';
import type { LiveWallet } from '../../economy/live/wallet.js';
import type {
  X402Challenge,
  X402PaymentProof,
  X402Receipt,
  X402Session,
  PayerConfig,
  PaymentResult,
  SessionStore,
  PaymentCurrency,
} from './types.js';
import { X402Error } from './types.js';
import { getEventBus } from '../../bus/index.js';
import { formatUnits, parseUnits } from 'viem';
import { isChallengeValid } from './verification.js';

// ============================================================================
// In-Memory Session Store
// ============================================================================

class MemorySessionStore implements SessionStore {
  private sessions = new Map<string, X402Session>();

  async get(sessionId: string): Promise<X402Session | null> {
    return this.sessions.get(sessionId) || null;
  }

  async set(sessionId: string, session: X402Session): Promise<void> {
    this.sessions.set(sessionId, session);
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async list(): Promise<X402Session[]> {
    return Array.from(this.sessions.values());
  }

  async cleanup(olderThan: Date): Promise<number> {
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (new Date(session.createdAt) < olderThan) {
        this.sessions.delete(id);
        removed++;
      }
    }
    return removed;
  }
}

// ============================================================================
// Payment Client
// ============================================================================

export class X402Client {
  private wallet: LiveWallet;
  private config: PayerConfig;
  private sessionStore: SessionStore;
  private bus = getEventBus();
  private dailySpent = 0n;
  private lastResetDate = new Date().toDateString();

  constructor(wallet: LiveWallet, config?: Partial<PayerConfig>) {
    this.wallet = wallet;
    this.sessionStore = new MemorySessionStore();

    this.config = {
      walletAddress: wallet.getAddress(),
      network: wallet.getChainId() === 8453 ? 'base' : 'base-sepolia',
      preferredCurrency: 'USDC',
      maxAutoPayAmount: parseUnits('1.00', 6), // $1.00 max auto-pay
      autoPayEnabled: false,
      budgetTracking: true,
      dailyBudget: parseUnits('10.00', 6), // $10.00 daily budget
      ...config,
    };
  }

  /**
   * Pay for a resource access
   *
   * Full flow: receive challenge -> pay -> submit proof -> get receipt
   */
  async pay(challenge: X402Challenge): Promise<PaymentResult> {
    const sessionId = this.generateSessionId();

    try {
      // Create session
      const session = await this.createSession(sessionId, challenge);

      // Validate challenge
      this.validateChallenge(challenge);

      // Check budget
      this.checkBudget(challenge.amount);

      // Emit payment initiated event
      this.bus.publish('economy.cost.recorded', {
        source: 'x402-client',
        precision: 1.0,
        module: 'x402',
        amount: Number(challenge.amount) / 1_000_000,
        category: 'x402-payment',
      });

      // Submit payment
      const txHash = await this.submitPayment(challenge);

      // Create payment proof
      const proof = await this.createPaymentProof(challenge, txHash);
      session.proof = proof;
      session.status = 'verified';
      session.updatedAt = new Date().toISOString();
      await this.sessionStore.set(sessionId, session);

      // Track spending
      if (this.config.budgetTracking) {
        this.trackSpending(challenge.amount);
      }

      // Emit success event
      this.bus.publish('economy.cost.recorded', {
        source: 'x402-client',
        precision: 1.0,
        module: 'x402',
        amount: Number(challenge.amount) / 1_000_000,
        category: 'x402-completed',
      });

      // Create receipt
      const receipt: X402Receipt = {
        receiptId: this.generateReceiptId(),
        challengeId: challenge.challengeId,
        proof,
        verified: true,
        verifiedAt: new Date().toISOString(),
      };

      session.receipt = receipt;
      session.status = 'verified';
      await this.sessionStore.set(sessionId, session);

      return {
        success: true,
        receipt,
        txHash,
      };
    } catch (error) {
      // Update session with error
      const session = await this.sessionStore.get(sessionId);
      if (session) {
        session.status = 'failed';
        session.error =
          error instanceof Error ? error.message : String(error);
        await this.sessionStore.set(sessionId, session);
      }

      // Emit failure event
      this.bus.publish('kernel.task.failed', {
        source: 'x402-client',
        precision: 1.0,
        taskId: sessionId,
        taskType: 'x402-payment',
        priority: 5,
        error: error instanceof Error ? error.message : String(error),
        retryable: error instanceof X402Error && error.type === 'NETWORK_ERROR',
      });

      return {
        success: false,
        error:
          error instanceof X402Error
            ? error
            : new X402Error(
                'UNKNOWN_ERROR',
                error instanceof Error ? error.message : String(error),
              ),
      };
    }
  }

  /**
   * Submit payment on-chain via wallet
   */
  private async submitPayment(challenge: X402Challenge): Promise<string> {
    const amount = Number(challenge.amount) / 1_000_000; // Convert to USDC

    console.log(
      `[x402] Submitting payment: ${amount} USDC to ${challenge.paymentAddress}`,
    );

    if (challenge.currency === 'USDC') {
      const result = await this.wallet.sendUSDC(
        challenge.paymentAddress,
        amount,
      );

      if (!result.success) {
        throw new X402Error(
          'NETWORK_ERROR',
          'Failed to send USDC payment',
          result,
        );
      }

      return result.hash;
    } else if (challenge.currency === 'ETH') {
      const ethAmount = Number(challenge.amount) / 1e18;
      const result = await this.wallet.sendETH(
        challenge.paymentAddress,
        ethAmount,
      );

      if (!result.success) {
        throw new X402Error(
          'NETWORK_ERROR',
          'Failed to send ETH payment',
          result,
        );
      }

      return result.hash;
    } else {
      throw new X402Error(
        'UNKNOWN_ERROR',
        `Unsupported currency: ${challenge.currency}`,
      );
    }
  }

  /**
   * Create payment proof from transaction
   */
  private async createPaymentProof(
    challenge: X402Challenge,
    txHash: string,
  ): Promise<X402PaymentProof> {
    // In production, would wait for confirmation and get block number
    // For now, create proof with transaction hash
    return {
      challengeId: challenge.challengeId,
      txHash,
      fromAddress: this.wallet.getAddress(),
      toAddress: challenge.paymentAddress,
      amount: challenge.amount,
      currency: challenge.currency,
      network: challenge.network,
      blockNumber: 0n, // Would be populated from transaction receipt
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Validate challenge before payment
   */
  private validateChallenge(challenge: X402Challenge): void {
    if (!isChallengeValid(challenge)) {
      throw new X402Error('EXPIRED_CHALLENGE', 'Payment challenge has expired');
    }

    if (challenge.amount <= 0n) {
      throw new X402Error('INVALID_PROOF', 'Invalid payment amount');
    }

    if (!challenge.paymentAddress.startsWith('0x')) {
      throw new X402Error('INVALID_PROOF', 'Invalid payment address');
    }

    if (challenge.network !== this.config.network) {
      throw new X402Error(
        'NETWORK_ERROR',
        `Network mismatch: expected ${this.config.network}, got ${challenge.network}`,
      );
    }
  }

  /**
   * Check budget constraints
   */
  private checkBudget(amount: bigint): void {
    if (!this.config.budgetTracking) return;

    // Reset daily counter if new day
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      this.dailySpent = 0n;
      this.lastResetDate = today;
    }

    const dailyBudget = this.config.dailyBudget || parseUnits('10.00', 6);
    const projectedSpent = this.dailySpent + amount;

    if (projectedSpent > dailyBudget) {
      throw new X402Error(
        'BUDGET_EXCEEDED',
        `Daily budget exceeded: ${formatUnits(projectedSpent, 6)} > ${formatUnits(dailyBudget, 6)} USDC`,
      );
    }

    // Check auto-pay threshold
    if (
      this.config.autoPayEnabled &&
      amount > this.config.maxAutoPayAmount
    ) {
      throw new X402Error(
        'BUDGET_EXCEEDED',
        `Amount exceeds auto-pay limit: ${formatUnits(amount, 6)} > ${formatUnits(this.config.maxAutoPayAmount, 6)} USDC`,
      );
    }
  }

  /**
   * Track spending for budget management
   */
  private trackSpending(amount: bigint): void {
    this.dailySpent += amount;

    const dailyBudget = this.config.dailyBudget || parseUnits('10.00', 6);
    const percentUsed = Number((this.dailySpent * 100n) / dailyBudget);

    // Alert at 80% budget
    if (percentUsed >= 80) {
      console.warn(
        `[x402] Budget warning: ${percentUsed.toFixed(1)}% of daily budget used`,
      );
    }
  }

  /**
   * Create session for payment tracking
   */
  private async createSession(
    sessionId: string,
    challenge: X402Challenge,
  ): Promise<X402Session> {
    const session: X402Session = {
      sessionId,
      resourceUri: challenge.resourceUri,
      challenge,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.sessionStore.set(sessionId, session);
    return session;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<X402Session | null> {
    return this.sessionStore.get(sessionId);
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<X402Session[]> {
    return this.sessionStore.list();
  }

  /**
   * Get spending statistics
   */
  getSpendingStats(): {
    dailySpent: string;
    dailyBudget: string;
    percentUsed: number;
    remaining: string;
  } {
    const dailyBudget = this.config.dailyBudget || parseUnits('10.00', 6);
    const remaining = dailyBudget > this.dailySpent ? dailyBudget - this.dailySpent : 0n;
    const percentUsed = Number((this.dailySpent * 100n) / dailyBudget);

    return {
      dailySpent: formatUnits(this.dailySpent, 6),
      dailyBudget: formatUnits(dailyBudget, 6),
      percentUsed,
      remaining: formatUnits(remaining, 6),
    };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<PayerConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current configuration
   */
  getConfig(): PayerConfig {
    return { ...this.config };
  }

  /**
   * Clean up old sessions
   */
  async cleanupSessions(olderThanHours = 24): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    return this.sessionStore.cleanup(cutoff);
  }

  private generateSessionId(): string {
    // Cryptographically secure session ID
    const random = randomBytes(8).toString('hex');
    return `x402-session-${Date.now()}-${random}`;
  }

  private generateReceiptId(): string {
    // Cryptographically secure receipt ID
    const random = randomBytes(8).toString('hex');
    return `x402-receipt-${Date.now()}-${random}`;
  }
}

// ============================================================================
// Client Factory
// ============================================================================

/**
 * Create x402 payment client
 */
export function createClient(
  wallet: LiveWallet,
  config?: Partial<PayerConfig>,
): X402Client {
  return new X402Client(wallet, config);
}

/**
 * Create client with high budget for autonomous operation
 */
export function createAutonomousClient(wallet: LiveWallet): X402Client {
  return new X402Client(wallet, {
    autoPayEnabled: true,
    maxAutoPayAmount: parseUnits('5.00', 6), // $5 auto-pay
    dailyBudget: parseUnits('100.00', 6), // $100 daily
    budgetTracking: true,
  });
}

/**
 * Create client with strict budget controls
 */
export function createRestrictedClient(wallet: LiveWallet): X402Client {
  return new X402Client(wallet, {
    autoPayEnabled: false,
    maxAutoPayAmount: parseUnits('0.10', 6), // $0.10 max
    dailyBudget: parseUnits('1.00', 6), // $1 daily
    budgetTracking: true,
  });
}
