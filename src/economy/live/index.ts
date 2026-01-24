/**
 * Live Economy Layer
 *
 * Real infrastructure for autonomous revenue generation.
 * Wallet, persistence, connectors, and boot sequence.
 */

// Boot sequence
export { bootLiveEconomy, boot, isLive, getBootResult } from './boot.js';
export type { BootResult, LiveConfig } from './boot.js';

// Wallet
export { getLiveWallet, resetWallet } from './wallet.js';
export type { LiveWallet } from './wallet.js';

// Persistence
export { getStatePersistence, resetStatePersistence, StatePersistence } from './persistence.js';
export type { PersistedState } from './persistence.js';

// Connectors
export { getDeworkConnector, getCloudflareConnector, getDefiConnector } from './connectors/index.js';
export type { DeworkConnector, Bounty } from './connectors/dework.js';
export type { CloudflareConnector, WorkerDeployment, WorkerStats } from './connectors/cloudflare.js';
export type { DefiConnector, YieldPool } from './connectors/defi.js';
