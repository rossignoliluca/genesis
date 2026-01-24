/**
 * DeFi Protocol Connector
 *
 * Real connector for yield scanning on Base L2 using DeFiLlama API.
 * No authentication required.
 */

export interface YieldPool {
  protocol: string;
  pool: string;
  apy: number;
  tvl: number;
  chain: string;
  poolId: string;
  url?: string;
}

export interface DefiConnector {
  scanYields(chain: 'base'): Promise<YieldPool[]>;
  getPoolDetails(poolId: string): Promise<YieldPool | null>;
  getGasPrice(): Promise<bigint>;
}

const DEFILLAMA_API = 'https://yields.llama.fi/pools';
const BASE_RPC = 'https://mainnet.base.org';
const TIMEOUT_MS = 10000;
const RATE_LIMIT_MS = 1000;

const MIN_APY = 2;
const MIN_TVL = 100000;

let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function mapPoolData(pool: any): YieldPool {
  return {
    protocol: pool.project || 'Unknown',
    pool: pool.symbol || pool.pool || 'Unknown Pool',
    apy: pool.apy || 0,
    tvl: pool.tvlUsd || 0,
    chain: pool.chain || 'base',
    poolId: pool.pool || pool.id || '',
    url: pool.url,
  };
}

async function scanYields(chain: 'base'): Promise<YieldPool[]> {
  await rateLimit();

  try {
    const response = await fetchWithTimeout(DEFILLAMA_API, {}, TIMEOUT_MS);

    if (!response.ok) {
      console.warn('[DefiConnector] API error:', response.status, response.statusText);
      return [];
    }

    const data = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      console.warn('[DefiConnector] Invalid response format');
      return [];
    }

    const filteredPools = data.data
      .filter((pool: any) => {
        const isBaseChain = pool.chain?.toLowerCase() === chain.toLowerCase();
        const meetsApyThreshold = (pool.apy || 0) > MIN_APY;
        const meetsTvlThreshold = (pool.tvlUsd || 0) > MIN_TVL;

        return isBaseChain && meetsApyThreshold && meetsTvlThreshold;
      })
      .map(mapPoolData);

    return filteredPools;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('[DefiConnector] Request timeout');
    } else {
      console.warn('[DefiConnector] Request failed:', error);
    }
    return [];
  }
}

async function getPoolDetails(poolId: string): Promise<YieldPool | null> {
  await rateLimit();

  try {
    const response = await fetchWithTimeout(DEFILLAMA_API, {}, TIMEOUT_MS);

    if (!response.ok) {
      console.warn('[DefiConnector] API error:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      console.warn('[DefiConnector] Invalid response format');
      return null;
    }

    const pool = data.data.find((p: any) => p.pool === poolId || p.id === poolId);

    if (!pool) {
      return null;
    }

    return mapPoolData(pool);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('[DefiConnector] Request timeout');
    } else {
      console.warn('[DefiConnector] Request failed:', error);
    }
    return null;
  }
}

async function getGasPrice(): Promise<bigint> {
  await rateLimit();

  try {
    const response = await fetchWithTimeout(
      BASE_RPC,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_gasPrice',
          params: [],
          id: 1,
        }),
      },
      TIMEOUT_MS
    );

    if (!response.ok) {
      console.warn('[DefiConnector] RPC error:', response.status, response.statusText);
      return 0n;
    }

    const data = await response.json();

    if (data.error) {
      console.warn('[DefiConnector] RPC error:', data.error);
      return 0n;
    }

    if (!data.result) {
      console.warn('[DefiConnector] No gas price in response');
      return 0n;
    }

    return BigInt(data.result);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('[DefiConnector] Request timeout');
    } else {
      console.warn('[DefiConnector] Request failed:', error);
    }
    return 0n;
  }
}

export function getDefiConnector(): DefiConnector {
  return {
    scanYields,
    getPoolDetails,
    getGasPrice,
  };
}
