/**
 * Balance Monitor
 *
 * Continuously monitors wallet balances and triggers alerts on changes.
 * Maintains history for trend analysis.
 */

import { getLiveWallet } from './wallet.js';

export interface BalanceSnapshot {
  timestamp: number;
  eth: bigint;
  usdc: bigint;
  ethFormatted: string;
  usdcFormatted: string;
}

export interface BalanceChange {
  timestamp: number;
  ethDelta: bigint;
  usdcDelta: bigint;
  ethDeltaFormatted: string;
  usdcDeltaFormatted: string;
  newBalance: BalanceSnapshot;
  oldBalance: BalanceSnapshot;
}

export interface BalanceMonitorConfig {
  pollIntervalMs?: number;
  historyMaxLength?: number;
  changeThresholdUSDC?: number;  // Min USDC change to trigger callback
  changeThresholdETH?: number;   // Min ETH change (in wei as number)
}

const DEFAULT_POLL_INTERVAL = 30000; // 30 seconds
const DEFAULT_HISTORY_LENGTH = 1000;
const DEFAULT_USDC_THRESHOLD = 0.01; // $0.01
const DEFAULT_ETH_THRESHOLD = 0.0001; // 0.0001 ETH

export class BalanceMonitor {
  private config: Required<BalanceMonitorConfig>;
  private history: BalanceSnapshot[] = [];
  private lastBalance: BalanceSnapshot | null = null;
  private timer: NodeJS.Timeout | null = null;
  private changeCallbacks: Array<(change: BalanceChange) => void> = [];
  private snapshotCallbacks: Array<(snapshot: BalanceSnapshot) => void> = [];
  private running = false;

  constructor(config?: BalanceMonitorConfig) {
    this.config = {
      pollIntervalMs: config?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL,
      historyMaxLength: config?.historyMaxLength ?? DEFAULT_HISTORY_LENGTH,
      changeThresholdUSDC: config?.changeThresholdUSDC ?? DEFAULT_USDC_THRESHOLD,
      changeThresholdETH: config?.changeThresholdETH ?? DEFAULT_ETH_THRESHOLD,
    };
  }

  /**
   * Start monitoring balances.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    const poll = async () => {
      try {
        const wallet = getLiveWallet();
        if (!wallet.isConnected()) {
          console.warn('[BalanceMonitor] Wallet not connected');
          return;
        }

        const balances = await wallet.getBalances();
        const snapshot: BalanceSnapshot = {
          timestamp: Date.now(),
          eth: balances.eth,
          usdc: balances.usdc,
          ethFormatted: balances.ethFormatted,
          usdcFormatted: balances.usdcFormatted,
        };

        // Notify snapshot callbacks
        for (const cb of this.snapshotCallbacks) {
          try {
            cb(snapshot);
          } catch (e) {
            console.warn('[BalanceMonitor] Snapshot callback error:', e);
          }
        }

        // Check for significant change
        if (this.lastBalance) {
          const usdcDelta = snapshot.usdc - this.lastBalance.usdc;
          const ethDelta = snapshot.eth - this.lastBalance.eth;

          const usdcChange = Math.abs(Number(usdcDelta)) / 1e6;
          const ethChange = Math.abs(Number(ethDelta)) / 1e18;

          if (usdcChange >= this.config.changeThresholdUSDC ||
              ethChange >= this.config.changeThresholdETH) {
            const change: BalanceChange = {
              timestamp: Date.now(),
              ethDelta,
              usdcDelta,
              ethDeltaFormatted: this.formatDelta(ethDelta, 18, 'ETH'),
              usdcDeltaFormatted: this.formatDelta(usdcDelta, 6, 'USDC'),
              newBalance: snapshot,
              oldBalance: this.lastBalance,
            };

            // Notify change callbacks
            for (const cb of this.changeCallbacks) {
              try {
                cb(change);
              } catch (e) {
                console.warn('[BalanceMonitor] Change callback error:', e);
              }
            }
          }
        }

        // Update history
        this.history.push(snapshot);
        if (this.history.length > this.config.historyMaxLength) {
          this.history.shift();
        }

        this.lastBalance = snapshot;
      } catch (error) {
        console.warn('[BalanceMonitor] Poll error:', error);
      }
    };

    // Initial poll
    poll();

    // Start interval
    this.timer = setInterval(poll, this.config.pollIntervalMs);
    console.log(`[BalanceMonitor] Started, polling every ${this.config.pollIntervalMs}ms`);
  }

  /**
   * Stop monitoring.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    console.log('[BalanceMonitor] Stopped');
  }

  /**
   * Register a callback for balance changes.
   */
  onBalanceChange(callback: (change: BalanceChange) => void): () => void {
    this.changeCallbacks.push(callback);
    return () => {
      const idx = this.changeCallbacks.indexOf(callback);
      if (idx >= 0) this.changeCallbacks.splice(idx, 1);
    };
  }

  /**
   * Register a callback for every balance snapshot.
   */
  onSnapshot(callback: (snapshot: BalanceSnapshot) => void): () => void {
    this.snapshotCallbacks.push(callback);
    return () => {
      const idx = this.snapshotCallbacks.indexOf(callback);
      if (idx >= 0) this.snapshotCallbacks.splice(idx, 1);
    };
  }

  /**
   * Get balance history.
   */
  getHistory(): BalanceSnapshot[] {
    return [...this.history];
  }

  /**
   * Get the most recent balance snapshot.
   */
  getLatest(): BalanceSnapshot | null {
    return this.lastBalance;
  }

  /**
   * Get balance change over a time period.
   */
  getChangeOverPeriod(periodMs: number): { ethDelta: bigint; usdcDelta: bigint } | null {
    if (this.history.length < 2) return null;

    const now = Date.now();
    const cutoff = now - periodMs;

    // Find oldest snapshot within period
    const oldestInPeriod = this.history.find(s => s.timestamp >= cutoff);
    if (!oldestInPeriod) return null;

    const latest = this.history[this.history.length - 1];

    return {
      ethDelta: latest.eth - oldestInPeriod.eth,
      usdcDelta: latest.usdc - oldestInPeriod.usdc,
    };
  }

  /**
   * Check if monitor is running.
   */
  isRunning(): boolean {
    return this.running;
  }

  private formatDelta(delta: bigint, decimals: number, symbol: string): string {
    const value = Number(delta) / Math.pow(10, decimals);
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(decimals === 6 ? 2 : 6)} ${symbol}`;
  }
}

// Singleton
let monitorInstance: BalanceMonitor | null = null;

export function getBalanceMonitor(config?: BalanceMonitorConfig): BalanceMonitor {
  if (!monitorInstance) {
    monitorInstance = new BalanceMonitor(config);
  }
  return monitorInstance;
}

export function resetBalanceMonitor(): void {
  if (monitorInstance) {
    monitorInstance.stop();
    monitorInstance = null;
  }
}
