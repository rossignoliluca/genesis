/**
 * Live Economy Layer
 *
 * Real infrastructure for autonomous revenue generation.
 * Wallet, persistence, connectors, monitoring, and alerts.
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

// Payment Verification
export {
  PaymentVerifier,
  getPaymentVerifier,
  PaymentWatcher,
  createPaymentWatcher,
} from './payment-verifier.js';
export type {
  PaymentVerification,
  PaymentEvent,
  PaymentWatcherConfig,
} from './payment-verifier.js';

// Balance Monitoring
export {
  BalanceMonitor,
  getBalanceMonitor,
  resetBalanceMonitor,
} from './balance-monitor.js';
export type { BalanceSnapshot, BalanceChange, BalanceMonitorConfig } from './balance-monitor.js';

// Revenue Tracking
export {
  RevenueTracker,
  getRevenueTracker,
  resetRevenueTracker,
} from './revenue-tracker.js';
export type { RevenueEvent, RevenueStats, RevenueSource } from './revenue-tracker.js';

// Alerts
export {
  AlertSystem,
  getAlertSystem,
  resetAlertSystem,
  createBalanceAlertHandler,
  createRevenueAlertHandler,
} from './alerts.js';
export type { Alert, AlertLevel, AlertChannel, AlertConfig } from './alerts.js';

// Health & Status
export {
  checkHealth,
  getSystemStatus,
  formatStatus,
  isHealthy,
  getStatusLine,
} from './health.js';
export type {
  HealthStatus,
  ComponentHealth,
  SystemStatus,
  WalletStatus,
  ControllerStatus,
} from './health.js';

// Gas Manager
export {
  GasManager,
  getGasManager,
  resetGasManager,
} from './gas-manager.js';
export type {
  GasConfig,
  GasStatus,
  GasSpend,
} from './gas-manager.js';

// Position Tracker
export {
  PositionTracker,
  getPositionTracker,
  resetPositionTracker,
} from './position-tracker.js';
export type {
  Position,
  PositionType,
  PositionStatus,
  HarvestEvent,
  PortfolioSummary,
} from './position-tracker.js';

// Emergency Procedures
export {
  getEmergencyManager,
  triggerEmergency,
  gracefulShutdown,
  isEmergencyActive,
  getRecoveryInfo,
  installSignalHandlers,
} from './emergency.js';
export type {
  EmergencyLevel,
  EmergencyReason,
  EmergencyState,
  ShutdownResult,
  RecoveryInfo,
} from './emergency.js';

// Price Feeds
export {
  getPriceFeed,
  resetPriceFeed,
  getEthPrice,
  ethToUsd,
  usdToEth,
} from './price-feeds.js';
export type {
  PriceData,
  PriceFeedConfig,
} from './price-feeds.js';

// Retry Utilities
export {
  retry,
  retryOrThrow,
  withTimeout,
  sleep,
  CircuitBreaker,
  RateLimiter,
  getCircuitBreaker,
  getRateLimiter,
  debounce,
  throttle,
} from './retry.js';
export type {
  RetryConfig,
  RetryResult,
  CircuitBreakerConfig,
} from './retry.js';

// DeFi Executor
export {
  DefiExecutor,
  getDefiExecutor,
  resetDefiExecutor,
} from './defi-executor.js';
export type {
  DefiOperation,
  ProtocolConfig,
  ExecuteResult,
} from './defi-executor.js';

// v14.7: PR Pipeline for bounty submissions
export {
  PRPipeline,
  getPRPipeline,
  createPRPipeline,
} from './pr-pipeline.js';
export type {
  PRSubmission,
  CodeChange,
  PRPipelineConfig,
} from './pr-pipeline.js';

// v14.7: Earnings Tracker for revenue persistence
export {
  EarningsTracker,
  getEarningsTracker,
  resetEarningsTracker,
} from './earnings-tracker.js';
export type {
  BountyAttempt,
  EarningsData,
} from './earnings-tracker.js';
