/**
 * Genesis v13.9 — Payment Verifier
 *
 * On-chain verification of x402 payments via Base RPC.
 * Validates USDC transfers, prevents replay attacks, tracks payment state.
 */

import { createPublicClient, http, parseAbi, type Hex } from 'viem';
import { base } from 'viem/chains';
import { createPublisher } from '../../bus/index.js';

// ============================================================================
// Types
// ============================================================================

export interface PaymentVerification {
  valid: boolean;
  txHash: Hex;
  from: Hex;
  to: Hex;
  amount: bigint;
  amountUSD: number;
  blockNumber: bigint;
  timestamp: number;
  error?: string;
}

export interface PaymentWatcherConfig {
  walletAddress: Hex;
  pollIntervalMs?: number;
  minAmount?: bigint;
  rpcUrl?: string;
}

export interface PaymentEvent {
  txHash: Hex;
  from: Hex;
  amount: bigint;
  amountUSD: number;
  blockNumber: bigint;
}

// ============================================================================
// Constants
// ============================================================================

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Hex;
const TRANSFER_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);
const DEFAULT_RPC = 'https://mainnet.base.org';

// ============================================================================
// Payment Verifier
// ============================================================================

export class PaymentVerifier {
  private client;
  private cache = new Map<string, PaymentVerification>();
  private readonly busPublisher = createPublisher('payment-verifier');

  constructor(rpcUrl?: string) {
    this.client = createPublicClient({
      chain: base,
      transport: http(rpcUrl || process.env.BASE_RPC_URL || DEFAULT_RPC),
    });
  }

  async verifyX402Payment(
    txHash: Hex,
    expectedRecipient: Hex,
    minAmount: bigint = 0n,
  ): Promise<PaymentVerification> {
    const cacheKey = txHash + '-' + expectedRecipient;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    try {
      const receipt = await this.client.getTransactionReceipt({ hash: txHash });
      if (!receipt) return this.fail(txHash, 'Transaction not found');
      if (receipt.status !== 'success') return this.fail(txHash, 'Transaction failed');

      const transferLog = receipt.logs.find(
        (log) => log.address.toLowerCase() === USDC_ADDRESS.toLowerCase() &&
          log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      );

      if (!transferLog) return this.fail(txHash, 'No USDC transfer found');

      const from = ('0x' + transferLog.topics[1]?.slice(26)) as Hex;
      const to = ('0x' + transferLog.topics[2]?.slice(26)) as Hex;
      const amount = BigInt(transferLog.data);

      if (to.toLowerCase() !== expectedRecipient.toLowerCase()) {
        return this.fail(txHash, 'Wrong recipient: ' + to);
      }
      if (amount < minAmount) {
        return this.fail(txHash, 'Amount too low: ' + amount);
      }

      const block = await this.client.getBlock({ blockNumber: receipt.blockNumber });

      const result: PaymentVerification = {
        valid: true, txHash, from, to, amount,
        amountUSD: Number(amount) / 1e6,
        blockNumber: receipt.blockNumber,
        timestamp: Number(block.timestamp),
      };

      this.cache.set(cacheKey, result);
      this.busPublisher.publish('economy.revenue.recorded', {
        precision: 1.0,
        amount: result.amountUSD,
        revenueSource: 'x402:' + from.slice(0, 10),
      });

      return result;
    } catch (error) {
      return this.fail(txHash, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private fail(txHash: Hex, error: string): PaymentVerification {
    return {
      valid: false, txHash,
      from: '0x0' as Hex, to: '0x0' as Hex,
      amount: 0n, amountUSD: 0, blockNumber: 0n, timestamp: 0, error,
    };
  }

  clearCache(): void { this.cache.clear(); }
}

// ============================================================================
// Payment Watcher
// ============================================================================

export class PaymentWatcher {
  private client;
  private config: Required<PaymentWatcherConfig>;
  private lastBlock: bigint = 0n;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private handlers: Array<(event: PaymentEvent) => void> = [];
  private processedTxs = new Set<string>();
  private readonly busPublisher = createPublisher('payment-watcher');

  constructor(config: PaymentWatcherConfig) {
    this.config = {
      walletAddress: config.walletAddress,
      pollIntervalMs: config.pollIntervalMs ?? 15000,
      minAmount: config.minAmount ?? 0n,
      rpcUrl: config.rpcUrl ?? process.env.BASE_RPC_URL ?? DEFAULT_RPC,
    };
    this.client = createPublicClient({
      chain: base,
      transport: http(this.config.rpcUrl),
    });
  }

  async start(): Promise<void> {
    if (this.pollTimer) return;
    this.lastBlock = await this.client.getBlockNumber();
    this.pollTimer = setInterval(() => this.poll(), this.config.pollIntervalMs);
  }

  stop(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  onPayment(handler: (event: PaymentEvent) => void): () => void {
    this.handlers.push(handler);
    return () => { const i = this.handlers.indexOf(handler); if (i >= 0) this.handlers.splice(i, 1); };
  }

  private async poll(): Promise<void> {
    try {
      const currentBlock = await this.client.getBlockNumber();
      if (currentBlock <= this.lastBlock) return;

      const logs = await this.client.getLogs({
        address: USDC_ADDRESS,
        event: TRANSFER_ABI[0],
        args: { to: this.config.walletAddress },
        fromBlock: this.lastBlock + 1n,
        toBlock: currentBlock,
      });

      for (const log of logs) {
        const txHash = log.transactionHash;
        if (!txHash || this.processedTxs.has(txHash)) continue;
        const amount = BigInt(log.data);
        if (amount < this.config.minAmount) continue;

        this.processedTxs.add(txHash);
        const event: PaymentEvent = {
          txHash: txHash as Hex,
          from: ('0x' + log.topics[1]?.slice(26)) as Hex,
          amount, amountUSD: Number(amount) / 1e6,
          blockNumber: log.blockNumber ?? 0n,
        };

        this.busPublisher.publish('economy.revenue.recorded', {
          precision: 1.0, amount: event.amountUSD,
          revenueSource: 'watcher:' + event.from.slice(0, 10),
        });

        for (const h of this.handlers) { try { h(event); } catch {} }
      }
      this.lastBlock = currentBlock;
    } catch (e) { console.error('[PaymentWatcher] Poll error:', e); }
  }

  getProcessedCount(): number { return this.processedTxs.size; }
}

// ============================================================================
// Factory
// ============================================================================

let verifierInstance: PaymentVerifier | null = null;

export function getPaymentVerifier(rpcUrl?: string): PaymentVerifier {
  if (!verifierInstance) verifierInstance = new PaymentVerifier(rpcUrl);
  return verifierInstance;
}

export function createPaymentWatcher(config: PaymentWatcherConfig): PaymentWatcher {
  return new PaymentWatcher(config);
}
