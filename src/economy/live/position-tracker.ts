/**
 * Position Tracker
 *
 * Tracks DeFi positions, capital allocation, and P&L.
 * Provides portfolio overview and risk metrics.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

// ============================================================================
// Types
// ============================================================================

export type PositionType = 'yield' | 'liquidity' | 'stake' | 'lend' | 'other';
export type PositionStatus = 'active' | 'pending' | 'closed' | 'liquidated';

export interface Position {
  id: string;
  type: PositionType;
  protocol: string;
  pool: string;
  chain: string;
  status: PositionStatus;

  // Entry
  entryTimestamp: number;
  entryTxHash?: string;
  entryAmount: number;       // USD value at entry
  entryTokenAmount: bigint;  // Raw token amount

  // Current
  currentValue: number;      // USD value now
  lastUpdateTimestamp: number;

  // Exit (if closed)
  exitTimestamp?: number;
  exitTxHash?: string;
  exitAmount?: number;

  // Yields
  totalHarvested: number;    // USD harvested so far
  harvestHistory: HarvestEvent[];

  // Metadata
  apy: number;               // Current/last known APY
  metadata?: Record<string, unknown>;
}

export interface HarvestEvent {
  timestamp: number;
  txHash?: string;
  amount: number;            // USD value
  tokenAmount: bigint;       // Raw token amount
}

export interface PortfolioSummary {
  totalValue: number;
  totalInvested: number;
  totalHarvested: number;
  totalPnL: number;
  pnlPercent: number;
  positionCount: number;
  activePositions: number;
  byProtocol: Record<string, number>;
  byType: Record<PositionType, number>;
  averageApy: number;
}

interface PersistedPositions {
  version: number;
  positions: Position[];
  savedAt: string;
}

// ============================================================================
// Constants
// ============================================================================

const STATE_DIR = process.env.GENESIS_STATE_DIR || join(homedir(), '.genesis');
const POSITIONS_FILE = 'positions.json';

// ============================================================================
// Position Tracker
// ============================================================================

export class PositionTracker {
  private positions: Map<string, Position> = new Map();
  private filePath: string;
  private dirty = false;
  private saveTimer: NodeJS.Timeout | null = null;
  private idCounter = 0;

  constructor(stateDir?: string) {
    const dir = stateDir || STATE_DIR;
    this.filePath = join(dir, POSITIONS_FILE);
  }

  /**
   * Load positions from disk.
   */
  async load(): Promise<void> {
    try {
      const content = await readFile(this.filePath, 'utf-8');
      const data: PersistedPositions = JSON.parse(content);

      if (data.version === 1 && Array.isArray(data.positions)) {
        this.positions.clear();
        for (const pos of data.positions) {
          // Restore bigint fields
          pos.entryTokenAmount = BigInt(pos.entryTokenAmount as unknown as string);
          for (const h of pos.harvestHistory) {
            h.tokenAmount = BigInt(h.tokenAmount as unknown as string);
          }
          this.positions.set(pos.id, pos);
        }
        console.log(`[PositionTracker] Loaded ${this.positions.size} positions`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[PositionTracker] Failed to load:', error);
      }
    }
  }

  /**
   * Save positions to disk.
   */
  async save(): Promise<void> {
    try {
      await mkdir(dirname(this.filePath), { recursive: true });

      // Convert bigints to strings for JSON
      const positions = Array.from(this.positions.values()).map(pos => ({
        ...pos,
        entryTokenAmount: pos.entryTokenAmount.toString(),
        harvestHistory: pos.harvestHistory.map(h => ({
          ...h,
          tokenAmount: h.tokenAmount.toString(),
        })),
      }));

      const data: PersistedPositions = {
        version: 1,
        positions: positions as unknown as Position[],
        savedAt: new Date().toISOString(),
      };

      const tmpPath = this.filePath + '.tmp';
      await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');

      const { rename } = await import('node:fs/promises');
      await rename(tmpPath, this.filePath);

      this.dirty = false;
    } catch (error) {
      console.error('[PositionTracker] Failed to save:', error);
      throw error;
    }
  }

  /**
   * Start auto-save.
   */
  startAutoSave(intervalMs: number = 60000): void {
    if (this.saveTimer) return;

    this.saveTimer = setInterval(async () => {
      if (this.dirty) {
        await this.save();
      }
    }, intervalMs);

    console.log(`[PositionTracker] Auto-save started (${intervalMs / 1000}s interval)`);
  }

  /**
   * Stop auto-save.
   */
  stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
  }

  /**
   * Open a new position.
   */
  openPosition(params: {
    type: PositionType;
    protocol: string;
    pool: string;
    chain: string;
    entryAmount: number;
    entryTokenAmount: bigint;
    apy: number;
    txHash?: string;
    metadata?: Record<string, unknown>;
  }): Position {
    const id = `pos_${Date.now()}_${++this.idCounter}`;

    const position: Position = {
      id,
      type: params.type,
      protocol: params.protocol,
      pool: params.pool,
      chain: params.chain,
      status: 'active',
      entryTimestamp: Date.now(),
      entryTxHash: params.txHash,
      entryAmount: params.entryAmount,
      entryTokenAmount: params.entryTokenAmount,
      currentValue: params.entryAmount,
      lastUpdateTimestamp: Date.now(),
      totalHarvested: 0,
      harvestHistory: [],
      apy: params.apy,
      metadata: params.metadata,
    };

    this.positions.set(id, position);
    this.dirty = true;

    console.log(`[PositionTracker] Opened position ${id}: ${params.protocol}/${params.pool} $${params.entryAmount}`);
    return position;
  }

  /**
   * Update position value.
   */
  updateValue(positionId: string, currentValue: number, apy?: number): void {
    const pos = this.positions.get(positionId);
    if (!pos) {
      console.warn(`[PositionTracker] Position not found: ${positionId}`);
      return;
    }

    pos.currentValue = currentValue;
    pos.lastUpdateTimestamp = Date.now();
    if (apy !== undefined) {
      pos.apy = apy;
    }

    this.dirty = true;
  }

  /**
   * Record a harvest event.
   */
  recordHarvest(positionId: string, params: {
    amount: number;
    tokenAmount: bigint;
    txHash?: string;
  }): void {
    const pos = this.positions.get(positionId);
    if (!pos) {
      console.warn(`[PositionTracker] Position not found: ${positionId}`);
      return;
    }

    const event: HarvestEvent = {
      timestamp: Date.now(),
      txHash: params.txHash,
      amount: params.amount,
      tokenAmount: params.tokenAmount,
    };

    pos.harvestHistory.push(event);
    pos.totalHarvested += params.amount;
    pos.lastUpdateTimestamp = Date.now();
    this.dirty = true;

    console.log(`[PositionTracker] Harvested $${params.amount} from ${positionId}`);
  }

  /**
   * Close a position.
   */
  closePosition(positionId: string, params: {
    exitAmount: number;
    txHash?: string;
    status?: 'closed' | 'liquidated';
  }): void {
    const pos = this.positions.get(positionId);
    if (!pos) {
      console.warn(`[PositionTracker] Position not found: ${positionId}`);
      return;
    }

    pos.status = params.status ?? 'closed';
    pos.exitTimestamp = Date.now();
    pos.exitTxHash = params.txHash;
    pos.exitAmount = params.exitAmount;
    pos.currentValue = params.exitAmount;
    pos.lastUpdateTimestamp = Date.now();
    this.dirty = true;

    const pnl = (params.exitAmount + pos.totalHarvested) - pos.entryAmount;
    console.log(`[PositionTracker] Closed position ${positionId}: P&L $${pnl.toFixed(2)}`);
  }

  /**
   * Get a position by ID.
   */
  getPosition(positionId: string): Position | undefined {
    return this.positions.get(positionId);
  }

  /**
   * Get all positions.
   */
  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get active positions.
   */
  getActivePositions(): Position[] {
    return Array.from(this.positions.values()).filter(p => p.status === 'active');
  }

  /**
   * Get positions by protocol.
   */
  getByProtocol(protocol: string): Position[] {
    return Array.from(this.positions.values()).filter(
      p => p.protocol.toLowerCase() === protocol.toLowerCase()
    );
  }

  /**
   * Get portfolio summary.
   */
  getSummary(): PortfolioSummary {
    const positions = Array.from(this.positions.values());
    const activePositions = positions.filter(p => p.status === 'active');

    const totalValue = activePositions.reduce((sum, p) => sum + p.currentValue, 0);
    const totalInvested = positions.reduce((sum, p) => sum + p.entryAmount, 0);
    const totalHarvested = positions.reduce((sum, p) => sum + p.totalHarvested, 0);
    const closedPnL = positions
      .filter(p => p.status !== 'active' && p.exitAmount !== undefined)
      .reduce((sum, p) => sum + (p.exitAmount! - p.entryAmount), 0);

    const unrealizedPnL = activePositions.reduce(
      (sum, p) => sum + (p.currentValue - p.entryAmount),
      0
    );
    const totalPnL = closedPnL + unrealizedPnL + totalHarvested;
    const pnlPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

    // By protocol
    const byProtocol: Record<string, number> = {};
    for (const pos of activePositions) {
      byProtocol[pos.protocol] = (byProtocol[pos.protocol] ?? 0) + pos.currentValue;
    }

    // By type
    const byType: Record<PositionType, number> = {
      yield: 0,
      liquidity: 0,
      stake: 0,
      lend: 0,
      other: 0,
    };
    for (const pos of activePositions) {
      byType[pos.type] += pos.currentValue;
    }

    // Average APY (weighted by value)
    let weightedApy = 0;
    for (const pos of activePositions) {
      weightedApy += pos.apy * (pos.currentValue / totalValue);
    }

    return {
      totalValue,
      totalInvested,
      totalHarvested,
      totalPnL,
      pnlPercent,
      positionCount: positions.length,
      activePositions: activePositions.length,
      byProtocol,
      byType,
      averageApy: isNaN(weightedApy) ? 0 : weightedApy,
    };
  }

  /**
   * Get positions that need harvest (stale or high accumulated yield).
   */
  getHarvestCandidates(maxAge: number = 24 * 60 * 60 * 1000): Position[] {
    const now = Date.now();
    return this.getActivePositions().filter(pos => {
      const lastHarvest = pos.harvestHistory.length > 0
        ? pos.harvestHistory[pos.harvestHistory.length - 1].timestamp
        : pos.entryTimestamp;
      return now - lastHarvest > maxAge;
    });
  }
}

// ============================================================================
// Singleton
// ============================================================================

let trackerInstance: PositionTracker | null = null;

export function getPositionTracker(stateDir?: string): PositionTracker {
  if (!trackerInstance) {
    trackerInstance = new PositionTracker(stateDir);
  }
  return trackerInstance;
}

export function resetPositionTracker(): void {
  trackerInstance?.stopAutoSave();
  trackerInstance = null;
}
