/**
 * Gas Manager
 *
 * Monitors ETH balance for gas, alerts when low, tracks gas spending.
 * Critical for autonomous operation - no gas = no transactions.
 */

import { getLiveWallet } from './wallet.js';
import { getAlertSystem } from './alerts.js';
import { getEthPrice } from './price-feeds.js';

// ============================================================================
// Types
// ============================================================================

export interface GasConfig {
  /** Minimum ETH balance before warning (default: 0.001 = ~$3) */
  warningThresholdEth: number;
  /** Critical ETH balance - system should pause (default: 0.0002 = ~$0.60) */
  criticalThresholdEth: number;
  /** Check interval in ms (default: 60000 = 1 minute) */
  checkIntervalMs: number;
  /** Auto-pause transactions when critical (default: true) */
  autoPauseOnCritical: boolean;
}

export interface GasStatus {
  ethBalance: bigint;
  ethBalanceFormatted: string;
  ethBalanceUsd: number;
  level: 'ok' | 'warning' | 'critical';
  canTransact: boolean;
  estimatedTxRemaining: number;
  lastCheck: number;
}

export interface GasSpend {
  timestamp: number;
  txHash: string;
  gasUsed: bigint;
  gasPrice: bigint;
  ethSpent: bigint;
  ethSpentFormatted: string;
  activity: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: GasConfig = {
  warningThresholdEth: 0.001,    // ~$3 at $3000/ETH
  criticalThresholdEth: 0.0002,  // ~$0.60
  checkIntervalMs: 60000,        // 1 minute
  autoPauseOnCritical: true,
};

// Typical gas costs on Base L2 (in gwei)
const TYPICAL_GAS_PRICE_GWEI = 0.01;  // Base is cheap
const TYPICAL_TX_GAS = 100000n;       // Standard tx

// ============================================================================
// Gas Manager
// ============================================================================

export class GasManager {
  private config: GasConfig;
  private spendHistory: GasSpend[] = [];
  private maxHistory = 1000;
  private checkTimer: NodeJS.Timeout | null = null;
  private lastStatus: GasStatus | null = null;
  private paused = false;
  private statusCallbacks: Array<(status: GasStatus) => void> = [];

  constructor(config?: Partial<GasConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get current gas status.
   */
  async getStatus(): Promise<GasStatus> {
    const wallet = getLiveWallet();

    if (!wallet.isConnected()) {
      return {
        ethBalance: 0n,
        ethBalanceFormatted: '0',
        ethBalanceUsd: 0,
        level: 'critical',
        canTransact: false,
        estimatedTxRemaining: 0,
        lastCheck: Date.now(),
      };
    }

    const balances = await wallet.getBalances();
    const ethBalance = balances.eth;
    const ethFloat = Number(ethBalance) / 1e18;

    // Get real ETH price
    let ethPriceUsd = 3000; // Fallback
    try {
      ethPriceUsd = await getEthPrice();
    } catch {
      // Use fallback price
    }
    const ethBalanceUsd = ethFloat * ethPriceUsd;

    // Determine level
    let level: 'ok' | 'warning' | 'critical' = 'ok';
    if (ethFloat <= this.config.criticalThresholdEth) {
      level = 'critical';
    } else if (ethFloat <= this.config.warningThresholdEth) {
      level = 'warning';
    }

    // Estimate remaining transactions
    const avgGasCostEth = Number(TYPICAL_TX_GAS) * TYPICAL_GAS_PRICE_GWEI / 1e9;
    const estimatedTxRemaining = Math.floor(ethFloat / avgGasCostEth);

    // Can transact if not paused and not critical (or critical but auto-pause disabled)
    const canTransact = !this.paused &&
      (level !== 'critical' || !this.config.autoPauseOnCritical);

    const status: GasStatus = {
      ethBalance,
      ethBalanceFormatted: balances.ethFormatted,
      ethBalanceUsd,
      level,
      canTransact,
      estimatedTxRemaining,
      lastCheck: Date.now(),
    };

    this.lastStatus = status;
    return status;
  }

  /**
   * Start automatic monitoring.
   */
  start(): void {
    if (this.checkTimer) return;

    const check = async () => {
      const status = await this.getStatus();

      // Notify callbacks
      for (const cb of this.statusCallbacks) {
        try {
          cb(status);
        } catch (e) {
          console.warn('[GasManager] Callback error:', e);
        }
      }

      // Handle level changes
      if (status.level === 'critical' && this.config.autoPauseOnCritical && !this.paused) {
        this.pause();
        const alerts = getAlertSystem();
        alerts.error(
          'Gas Critical - System Paused',
          `ETH balance critically low: ${status.ethBalanceFormatted} ETH (~$${status.ethBalanceUsd.toFixed(2)})\n` +
          `Estimated ${status.estimatedTxRemaining} transactions remaining\n` +
          `Transactions paused until ETH is replenished`
        );
      } else if (status.level === 'warning') {
        const alerts = getAlertSystem();
        alerts.warning(
          'Gas Low',
          `ETH balance low: ${status.ethBalanceFormatted} ETH (~$${status.ethBalanceUsd.toFixed(2)})\n` +
          `Estimated ${status.estimatedTxRemaining} transactions remaining\n` +
          `Consider replenishing soon`
        );
      } else if (status.level === 'ok' && this.paused) {
        // Auto-resume if gas is restored
        this.resume();
        const alerts = getAlertSystem();
        alerts.success(
          'Gas Restored - System Resumed',
          `ETH balance restored: ${status.ethBalanceFormatted} ETH\n` +
          `Transactions resumed`
        );
      }
    };

    // Initial check
    check();

    // Start periodic checks
    this.checkTimer = setInterval(check, this.config.checkIntervalMs);
    console.log(`[GasManager] Started monitoring (${this.config.checkIntervalMs / 1000}s interval)`);
  }

  /**
   * Stop automatic monitoring.
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
      console.log('[GasManager] Stopped monitoring');
    }
  }

  /**
   * Pause transactions (called automatically when critical).
   */
  pause(): void {
    this.paused = true;
    console.log('[GasManager] Transactions PAUSED due to low gas');
  }

  /**
   * Resume transactions.
   */
  resume(): void {
    this.paused = false;
    console.log('[GasManager] Transactions RESUMED');
  }

  /**
   * Check if transactions are allowed.
   */
  canTransact(): boolean {
    if (this.paused) return false;
    if (!this.lastStatus) return true; // Haven't checked yet, allow
    return this.lastStatus.canTransact;
  }

  /**
   * Record gas spend for tracking.
   */
  recordSpend(spend: Omit<GasSpend, 'ethSpentFormatted'>): void {
    const ethSpent = spend.gasUsed * spend.gasPrice;
    const ethSpentFormatted = (Number(ethSpent) / 1e18).toFixed(8);

    const record: GasSpend = {
      ...spend,
      ethSpent,
      ethSpentFormatted,
    };

    this.spendHistory.push(record);

    // Trim history
    if (this.spendHistory.length > this.maxHistory) {
      this.spendHistory = this.spendHistory.slice(-this.maxHistory);
    }
  }

  /**
   * Get gas spending stats.
   */
  getSpendingStats(since?: number): {
    totalEthSpent: bigint;
    totalEthSpentFormatted: string;
    transactionCount: number;
    averageGasPerTx: bigint;
  } {
    const filtered = since
      ? this.spendHistory.filter(s => s.timestamp >= since)
      : this.spendHistory;

    if (filtered.length === 0) {
      return {
        totalEthSpent: 0n,
        totalEthSpentFormatted: '0',
        transactionCount: 0,
        averageGasPerTx: 0n,
      };
    }

    const totalEthSpent = filtered.reduce((sum, s) => sum + s.ethSpent, 0n);
    const totalGas = filtered.reduce((sum, s) => sum + s.gasUsed, 0n);

    return {
      totalEthSpent,
      totalEthSpentFormatted: (Number(totalEthSpent) / 1e18).toFixed(8),
      transactionCount: filtered.length,
      averageGasPerTx: totalGas / BigInt(filtered.length),
    };
  }

  /**
   * Get spend history.
   */
  getSpendHistory(): GasSpend[] {
    return [...this.spendHistory];
  }

  /**
   * Register callback for status updates.
   */
  onStatusChange(callback: (status: GasStatus) => void): () => void {
    this.statusCallbacks.push(callback);
    return () => {
      const idx = this.statusCallbacks.indexOf(callback);
      if (idx >= 0) this.statusCallbacks.splice(idx, 1);
    };
  }

  /**
   * Get last known status (without fetching).
   */
  getLastStatus(): GasStatus | null {
    return this.lastStatus;
  }

  /**
   * Check if system is paused.
   */
  isPaused(): boolean {
    return this.paused;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let gasManagerInstance: GasManager | null = null;

export function getGasManager(config?: Partial<GasConfig>): GasManager {
  if (!gasManagerInstance) {
    gasManagerInstance = new GasManager(config);
  }
  return gasManagerInstance;
}

export function resetGasManager(): void {
  gasManagerInstance?.stop();
  gasManagerInstance = null;
}
