/**
 * x402 Payment Verification
 *
 * On-chain payment verification using viem to check Base L2 transactions.
 * Ensures payment proofs are valid before granting resource access.
 *
 * Verification steps:
 * 1. Check transaction exists on-chain
 * 2. Verify recipient address matches challenge
 * 3. Verify amount meets or exceeds required payment
 * 4. Check transaction has required confirmations
 * 5. Verify transaction is not expired
 */

import { randomUUID, randomBytes } from 'crypto';
import {
  createPublicClient,
  http,
  type Address,
  type Hash,
  formatUnits,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import type {
  X402Challenge,
  X402PaymentProof,
  PaymentNetwork,
  PaymentCurrency,
} from './types.js';
import { X402Error } from './types.js';

// USDC contract addresses on Base
const USDC_ADDRESS_MAINNET: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_ADDRESS_TESTNET: Address = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

// Minimal USDC ABI for balance and transfer checks
const USDC_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const;

// ============================================================================
// Verification Configuration
// ============================================================================

export interface VerificationConfig {
  /** Network to verify on */
  network: PaymentNetwork;
  /** Required confirmations before accepting payment */
  requiredConfirmations: number;
  /** Maximum transaction age in seconds */
  maxTransactionAge: number;
  /** Allow verification of unconfirmed transactions (testing only) */
  allowUnconfirmed?: boolean;
}

// ============================================================================
// Verification Results
// ============================================================================

export interface VerificationResult {
  /** Verification success */
  valid: boolean;
  /** Transaction details */
  transaction?: {
    hash: string;
    from: string;
    to: string;
    amount: bigint;
    blockNumber: bigint;
    confirmations: number;
    timestamp: bigint;
  };
  /** Verification errors */
  errors: string[];
  /** Verification timestamp */
  verifiedAt: string;
}

// ============================================================================
// Payment Verifier
// ============================================================================

export class PaymentVerifier {
  private publicClient: any;
  private chain: typeof base | typeof baseSepolia;
  private usdcAddress: Address;
  private config: VerificationConfig;

  constructor(config: VerificationConfig) {
    this.config = config;
    this.chain = config.network === 'base' ? base : baseSepolia;
    this.usdcAddress =
      config.network === 'base' ? USDC_ADDRESS_MAINNET : USDC_ADDRESS_TESTNET;

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(this.chain.rpcUrls.default.http[0]),
    });
  }

  /**
   * Verify a payment proof against a challenge
   */
  async verify(
    proof: X402PaymentProof,
    challenge: X402Challenge,
  ): Promise<VerificationResult> {
    const errors: string[] = [];

    try {
      // 1. Validate proof matches challenge
      if (proof.challengeId !== challenge.challengeId) {
        errors.push('Challenge ID mismatch');
      }

      if (proof.toAddress.toLowerCase() !== challenge.paymentAddress.toLowerCase()) {
        errors.push('Payment address mismatch');
      }

      if (proof.currency !== challenge.currency) {
        errors.push('Currency mismatch');
      }

      if (proof.network !== challenge.network) {
        errors.push('Network mismatch');
      }

      if (proof.amount < challenge.amount) {
        errors.push(
          `Insufficient payment: ${formatUnits(proof.amount, 6)} < ${formatUnits(challenge.amount, 6)} ${proof.currency}`,
        );
      }

      // 2. Check challenge expiration
      const challengeExpiry = new Date(challenge.expiresAt);
      const proofTime = new Date(proof.timestamp);

      if (proofTime > challengeExpiry) {
        errors.push('Payment made after challenge expired');
      }

      // 3. Verify transaction on-chain
      const txResult = await this.verifyTransaction(proof);

      if (!txResult.valid) {
        errors.push(...txResult.errors);
      }

      // Return verification result
      return {
        valid: errors.length === 0,
        transaction: txResult.transaction,
        errors,
        verifiedAt: new Date().toISOString(),
      };
    } catch (error) {
      errors.push(
        `Verification error: ${error instanceof Error ? error.message : String(error)}`,
      );

      return {
        valid: false,
        errors,
        verifiedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Verify transaction exists on-chain and matches proof
   */
  private async verifyTransaction(
    proof: X402PaymentProof,
  ): Promise<VerificationResult> {
    const errors: string[] = [];

    try {
      // Get transaction receipt
      const receipt = await this.publicClient.getTransactionReceipt({
        hash: proof.txHash as Hash,
      });

      if (!receipt) {
        errors.push('Transaction not found on-chain');
        return { valid: false, errors, verifiedAt: new Date().toISOString() };
      }

      // Check transaction status
      if (receipt.status !== 'success') {
        errors.push('Transaction failed on-chain');
      }

      // Get current block number for confirmations
      const currentBlock = await this.publicClient.getBlockNumber();
      const confirmations = Number(currentBlock - receipt.blockNumber);

      if (confirmations < this.config.requiredConfirmations && !this.config.allowUnconfirmed) {
        errors.push(
          `Insufficient confirmations: ${confirmations} < ${this.config.requiredConfirmations}`,
        );
      }

      // Get transaction details
      const tx = await this.publicClient.getTransaction({
        hash: proof.txHash as Hash,
      });

      if (!tx) {
        errors.push('Transaction details not found');
        return { valid: false, errors, verifiedAt: new Date().toISOString() };
      }

      // Verify based on currency
      if (proof.currency === 'ETH') {
        // Direct ETH transfer
        if (tx.to?.toLowerCase() !== proof.toAddress.toLowerCase()) {
          errors.push('ETH recipient address mismatch');
        }

        if (tx.value < proof.amount) {
          errors.push('ETH amount mismatch');
        }

        if (tx.from.toLowerCase() !== proof.fromAddress.toLowerCase()) {
          errors.push('ETH sender address mismatch');
        }
      } else if (proof.currency === 'USDC') {
        // USDC token transfer - verify via logs
        const transferEvent = await this.verifyUSDCTransfer(receipt, proof);
        if (!transferEvent.valid) {
          errors.push(...transferEvent.errors);
        }
      }

      // Check transaction age
      const block = await this.publicClient.getBlock({
        blockNumber: receipt.blockNumber,
      });

      const txAge = Math.floor(Date.now() / 1000) - Number(block.timestamp);
      if (txAge > this.config.maxTransactionAge) {
        errors.push(`Transaction too old: ${txAge}s > ${this.config.maxTransactionAge}s`);
      }

      return {
        valid: errors.length === 0,
        transaction: {
          hash: proof.txHash,
          from: tx.from,
          to: tx.to || proof.toAddress,
          amount: proof.currency === 'ETH' ? tx.value : proof.amount,
          blockNumber: receipt.blockNumber,
          confirmations,
          timestamp: block.timestamp,
        },
        errors,
        verifiedAt: new Date().toISOString(),
      };
    } catch (error) {
      errors.push(
        `Transaction verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      return {
        valid: false,
        errors,
        verifiedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Verify USDC transfer event in transaction logs
   */
  private async verifyUSDCTransfer(
    receipt: any,
    proof: X402PaymentProof,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Find Transfer event in logs
      const logs = receipt.logs.filter(
        (log: any) =>
          log.address.toLowerCase() === this.usdcAddress.toLowerCase(),
      );

      if (logs.length === 0) {
        errors.push('No USDC transfer found in transaction');
        return { valid: false, errors };
      }

      // Parse transfer events
      const parsedLogs = await this.publicClient.getLogs({
        address: this.usdcAddress,
        event: USDC_ABI[2], // Transfer event
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
      });

      const relevantLog = parsedLogs.find(
        (log: any) =>
          log.transactionHash.toLowerCase() === proof.txHash.toLowerCase() &&
          log.args.from.toLowerCase() === proof.fromAddress.toLowerCase() &&
          log.args.to.toLowerCase() === proof.toAddress.toLowerCase(),
      );

      if (!relevantLog) {
        errors.push('USDC transfer event not found or mismatch');
        return { valid: false, errors };
      }

      // Verify amount
      const transferAmount = relevantLog.args.value as bigint;
      if (transferAmount < proof.amount) {
        errors.push(
          `USDC amount mismatch: ${formatUnits(transferAmount, 6)} < ${formatUnits(proof.amount, 6)}`,
        );
      }

      return { valid: errors.length === 0, errors };
    } catch (error) {
      errors.push(
        `USDC verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { valid: false, errors };
    }
  }

  /**
   * Quick check if transaction exists (without full verification)
   */
  async transactionExists(txHash: string): Promise<boolean> {
    try {
      const receipt = await this.publicClient.getTransactionReceipt({
        hash: txHash as Hash,
      });
      return receipt !== null && receipt.status === 'success';
    } catch (err) {
      console.error('[PaymentVerifier] Transaction existence check failed:', err);
      return false;
    }
  }

  /**
   * Get current block number
   */
  async getCurrentBlock(): Promise<bigint> {
    return await this.publicClient.getBlockNumber();
  }

  /**
   * Estimate verification time based on current network conditions
   */
  async estimateVerificationTime(): Promise<number> {
    try {
      // Get average block time
      const currentBlock = await this.publicClient.getBlockNumber();
      const block1 = await this.publicClient.getBlock({
        blockNumber: currentBlock,
      });
      const block2 = await this.publicClient.getBlock({
        blockNumber: currentBlock - 10n,
      });

      const avgBlockTime =
        Number(block1.timestamp - block2.timestamp) / 10;

      // Estimate time for required confirmations
      return Math.ceil(avgBlockTime * this.config.requiredConfirmations);
    } catch (err) {
      // Fallback to 12 seconds per confirmation (Base L2 average)
      console.error('[PaymentVerifier] Verification time estimation failed:', err);
      return 12 * this.config.requiredConfirmations;
    }
  }
}

// ============================================================================
// Verification Helpers
// ============================================================================

/**
 * Create a payment verifier with default configuration
 */
export function createVerifier(network: PaymentNetwork): PaymentVerifier {
  return new PaymentVerifier({
    network,
    requiredConfirmations: 1, // Base L2 is fast
    maxTransactionAge: 3600, // 1 hour
    allowUnconfirmed: false,
  });
}

/**
 * Quick verification for testing (allows unconfirmed)
 */
export function createTestVerifier(network: PaymentNetwork): PaymentVerifier {
  return new PaymentVerifier({
    network,
    requiredConfirmations: 0,
    maxTransactionAge: 86400, // 24 hours
    allowUnconfirmed: true,
  });
}

/**
 * Verify challenge is not expired
 */
export function isChallengeValid(challenge: X402Challenge): boolean {
  const expiry = new Date(challenge.expiresAt);
  return expiry > new Date();
}

/**
 * Verify nonce is unique and valid format
 */
export function isNonceValid(nonce: string, usedNonces: Set<string>): boolean {
  return nonce.length >= 16 && !usedNonces.has(nonce);
}

/**
 * Generate cryptographically secure nonce for challenge
 * Uses crypto.randomBytes for security-critical randomness
 */
export function generateNonce(): string {
  // Use cryptographically secure random bytes
  const randomPart = randomBytes(16).toString('hex');
  const timestamp = Date.now().toString(36);
  return `${timestamp}-${randomPart}`;
}
