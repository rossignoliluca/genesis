/**
 * API Connectors
 *
 * Barrel export for all real API connectors.
 */

export { getDeworkConnector, type DeworkConnector, type Bounty } from './dework.js';
export { getCloudflareConnector, type CloudflareConnector, type WorkerDeployment, type WorkerStats } from './cloudflare.js';
export { getDefiConnector, type DefiConnector, type YieldPool } from './defi.js';
export {
  PROTOCOLS,
  TOKENS,
  RPC_URLS,
  ERC20_ABI,
  ERC4626_ABI,
  AAVE_POOL_ABI,
  COMPOUND_V3_ABI,
  getProtocol,
  getProtocolsByChain,
  getProtocolsByCategory,
  getAllProtocols,
  getProtocolCount,
  getSupportedChains,
  getTokenAddress,
  getRpcUrl,
  getProtocolStats,
  type ProtocolDefinition,
  type SupportedChain,
} from './protocols.js';
