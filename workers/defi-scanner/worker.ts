/**
 * Genesis DeFi Scanner Worker
 *
 * A paid MCP-compatible API endpoint for DeFi yield scanning.
 * Implements real x402 payment verification on Base L2.
 *
 * Endpoints:
 *   GET  /health     — Health check
 *   GET  /status     — Comprehensive system status (public)
 *   POST /scan       — Top yield opportunities (paid, 0.005 USDC)
 *   POST /pool/:id   — Pool details (paid, 0.005 USDC)
 *   GET  /metrics    — Request/revenue metrics (auth required)
 */

export interface Env {
  // KV namespaces
  RATE_LIMIT?: KVNamespace;
  METRICS?: KVNamespace;
  PAYMENTS?: KVNamespace;

  // Configuration
  GENESIS_WALLET?: string;
  GENESIS_NETWORK?: 'mainnet' | 'testnet';
  METRICS_AUTH_TOKEN?: string;
}

// ============================================================================
// Types
// ============================================================================

interface YieldPool {
  pool: string;
  protocol: string;
  symbol: string;
  apy: number;
  tvl: number;
  chain: string;
}

interface DeFiLlamaPool {
  pool: string;
  project: string;
  symbol: string;
  apy: number;
  tvlUsd: number;
  chain: string;
}

interface DeFiLlamaResponse {
  data: DeFiLlamaPool[];
}

interface PaymentVerification {
  valid: boolean;
  amount: number;
  from: string;
  error?: string;
}

interface Metrics {
  requestsTotal: number;
  requestsToday: number;
  requestsPaid: number;
  revenueTotal: number;
  revenueToday: number;
  lastRequestAt: number;
  lastPaymentAt: number;
  startedAt: number;
}

// ============================================================================
// Constants
// ============================================================================

const VERSION = '2.0.0';
const PRICE_PER_CALL = 0.005; // USDC

// Base L2 configuration
const BASE_RPC = 'https://mainnet.base.org';
const BASE_SEPOLIA_RPC = 'https://sepolia.base.org';
const USDC_ADDRESS_MAINNET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_ADDRESS_TESTNET = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// ============================================================================
// Main Handler
// ============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const network = env.GENESIS_NETWORK || 'mainnet';
    const genesisWallet = env.GENESIS_WALLET || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';

    // Standard headers
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-402-Price': String(PRICE_PER_CALL),
      'X-402-Currency': 'USDC',
      'X-402-Network': 'base',
      'X-402-Address': genesisWallet,
    };

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          ...headers,
          'Access-Control-Allow-Methods': 'POST, GET',
          'Access-Control-Allow-Headers': 'Content-Type, X-402-Payment, Authorization',
        },
      });
    }

    // Track request
    await incrementMetric(env, 'requestsTotal');
    await incrementMetric(env, 'requestsToday');
    await setMetric(env, 'lastRequestAt', Date.now());

    // ─── GET /health ───────────────────────────────────────────────────────────
    if (url.pathname === '/health' && request.method === 'GET') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          version: VERSION,
          service: 'genesis-defi-scanner',
          network,
          timestamp: Date.now(),
        }),
        { headers }
      );
    }

    // ─── GET /status ───────────────────────────────────────────────────────────
    if (url.pathname === '/status' && request.method === 'GET') {
      const metrics = await getMetrics(env);
      const uptime = metrics.startedAt ? Date.now() - metrics.startedAt : 0;

      return new Response(
        JSON.stringify({
          service: 'genesis-defi-scanner',
          version: VERSION,
          network,
          wallet: genesisWallet,
          price: `${PRICE_PER_CALL} USDC`,
          uptime: formatUptime(uptime),
          uptimeMs: uptime,
          requests: {
            total: metrics.requestsTotal,
            today: metrics.requestsToday,
            paid: metrics.requestsPaid,
          },
          revenue: {
            total: `$${metrics.revenueTotal.toFixed(4)}`,
            today: `$${metrics.revenueToday.toFixed(4)}`,
          },
          lastActivity: {
            request: metrics.lastRequestAt ? new Date(metrics.lastRequestAt).toISOString() : null,
            payment: metrics.lastPaymentAt ? new Date(metrics.lastPaymentAt).toISOString() : null,
          },
          endpoints: [
            { path: '/health', method: 'GET', paid: false },
            { path: '/status', method: 'GET', paid: false },
            { path: '/scan', method: 'POST', paid: true, price: PRICE_PER_CALL },
            { path: '/pool/:id', method: 'POST', paid: true, price: PRICE_PER_CALL },
          ],
          timestamp: Date.now(),
        }),
        { headers }
      );
    }

    // ─── GET /metrics (authenticated) ──────────────────────────────────────────
    if (url.pathname === '/metrics' && request.method === 'GET') {
      const authToken = request.headers.get('Authorization')?.replace('Bearer ', '');
      if (!authToken || authToken !== env.METRICS_AUTH_TOKEN) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers }
        );
      }

      const metrics = await getMetrics(env);
      return new Response(JSON.stringify(metrics), { headers });
    }

    // ─── Rate Limiting ─────────────────────────────────────────────────────────
    const rateLimitResult = await checkRateLimit(request, env);
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          limit: '100 requests per minute',
          retryAfter: rateLimitResult.retryAfter,
        }),
        {
          status: 429,
          headers: { ...headers, 'Retry-After': String(rateLimitResult.retryAfter) },
        }
      );
    }

    // ─── POST /scan (paid) ─────────────────────────────────────────────────────
    if (url.pathname === '/scan' && request.method === 'POST') {
      // Verify payment
      const paymentResult = await verifyPayment(request, env, genesisWallet, network);
      if (!paymentResult.valid) {
        return new Response(
          JSON.stringify({
            error: 'Payment required',
            message: paymentResult.error || 'Include x-402-payment header with tx hash',
            price: `${PRICE_PER_CALL} USDC`,
            address: genesisWallet,
            network: 'base',
          }),
          { status: 402, headers }
        );
      }

      // Record payment
      await recordPayment(env, paymentResult.amount);

      try {
        const pools = await fetchYields();
        return new Response(
          JSON.stringify({
            pools,
            count: pools.length,
            payment: {
              verified: true,
              amount: paymentResult.amount,
              from: paymentResult.from,
            },
            timestamp: Date.now(),
          }),
          { headers }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch yields',
            message: error instanceof Error ? error.message : 'Unknown error',
          }),
          { status: 500, headers }
        );
      }
    }

    // ─── POST /pool/:id (paid) ─────────────────────────────────────────────────
    if (url.pathname.startsWith('/pool/') && request.method === 'POST') {
      const poolId = url.pathname.split('/')[2];
      if (!poolId) {
        return new Response(
          JSON.stringify({ error: 'Pool ID required' }),
          { status: 400, headers }
        );
      }

      // Verify payment
      const paymentResult = await verifyPayment(request, env, genesisWallet, network);
      if (!paymentResult.valid) {
        return new Response(
          JSON.stringify({
            error: 'Payment required',
            message: paymentResult.error || 'Include x-402-payment header with tx hash',
            price: `${PRICE_PER_CALL} USDC`,
            address: genesisWallet,
            network: 'base',
          }),
          { status: 402, headers }
        );
      }

      await recordPayment(env, paymentResult.amount);

      try {
        const poolInfo = await fetchPoolInfo(poolId);
        if (!poolInfo) {
          return new Response(
            JSON.stringify({ error: 'Pool not found' }),
            { status: 404, headers }
          );
        }
        return new Response(
          JSON.stringify({
            pool: poolInfo,
            payment: { verified: true, amount: paymentResult.amount },
            timestamp: Date.now(),
          }),
          { headers }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch pool info',
            message: error instanceof Error ? error.message : 'Unknown error',
          }),
          { status: 500, headers }
        );
      }
    }

    // ─── 404 ───────────────────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        error: 'Not found',
        available_endpoints: [
          'GET  /health',
          'GET  /status',
          'POST /scan',
          'POST /pool/:id',
        ],
      }),
      { status: 404, headers }
    );
  },
};

// ============================================================================
// Payment Verification
// ============================================================================

async function verifyPayment(
  request: Request,
  env: Env,
  genesisWallet: string,
  network: 'mainnet' | 'testnet'
): Promise<PaymentVerification> {
  const paymentHeader = request.headers.get('x-402-payment');

  if (!paymentHeader) {
    return { valid: false, amount: 0, from: '', error: 'Missing x-402-payment header' };
  }

  // Check if already verified (prevent replay)
  if (env.PAYMENTS) {
    const used = await env.PAYMENTS.get(`tx:${paymentHeader}`);
    if (used) {
      return { valid: false, amount: 0, from: '', error: 'Payment already used' };
    }
  }

  const rpc = network === 'mainnet' ? BASE_RPC : BASE_SEPOLIA_RPC;
  const usdcAddress = network === 'mainnet' ? USDC_ADDRESS_MAINNET : USDC_ADDRESS_TESTNET;

  try {
    // Fetch transaction receipt
    const receiptResponse = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [paymentHeader],
        id: 1,
      }),
    });

    const receiptData = (await receiptResponse.json()) as { result?: any };

    if (!receiptData.result) {
      return { valid: false, amount: 0, from: '', error: 'Transaction not found or pending' };
    }

    const receipt = receiptData.result;

    // Check success
    if (receipt.status !== '0x1') {
      return { valid: false, amount: 0, from: '', error: 'Transaction failed' };
    }

    // Find USDC Transfer to Genesis wallet
    const walletLower = genesisWallet.toLowerCase();
    const transferLog = receipt.logs.find((log: any) => {
      const isUSDC = log.address.toLowerCase() === usdcAddress.toLowerCase();
      const isTransfer = log.topics[0] === TRANSFER_TOPIC;
      const toAddress = '0x' + log.topics[2].slice(26).toLowerCase();
      return isUSDC && isTransfer && toAddress === walletLower;
    });

    if (!transferLog) {
      return { valid: false, amount: 0, from: '', error: 'No USDC transfer to Genesis wallet found' };
    }

    // Parse amount (USDC has 6 decimals)
    const amountRaw = BigInt(transferLog.data);
    const amount = Number(amountRaw) / 1e6;

    // Check minimum amount
    if (amount < PRICE_PER_CALL) {
      return { valid: false, amount, from: '', error: `Insufficient payment: ${amount} < ${PRICE_PER_CALL}` };
    }

    // Parse sender
    const from = '0x' + transferLog.topics[1].slice(26);

    // Mark as used (prevent replay)
    if (env.PAYMENTS) {
      await env.PAYMENTS.put(`tx:${paymentHeader}`, JSON.stringify({
        amount,
        from,
        timestamp: Date.now(),
      }), { expirationTtl: 86400 * 7 }); // 7 days
    }

    return { valid: true, amount, from };
  } catch (error) {
    return {
      valid: false,
      amount: 0,
      from: '',
      error: `Verification error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

// ============================================================================
// DeFi Data Fetching
// ============================================================================

async function fetchYields(): Promise<YieldPool[]> {
  const resp = await fetch('https://yields.llama.fi/pools');
  if (!resp.ok) {
    throw new Error(`DeFiLlama API error: ${resp.status}`);
  }

  const data = (await resp.json()) as DeFiLlamaResponse;

  return data.data
    .filter(
      (p: DeFiLlamaPool) => p.chain === 'Base' && p.apy > 2 && p.tvlUsd > 100000
    )
    .slice(0, 20)
    .map((p: DeFiLlamaPool) => ({
      pool: p.pool,
      protocol: p.project,
      symbol: p.symbol,
      apy: Math.round(p.apy * 100) / 100,
      tvl: Math.round(p.tvlUsd),
      chain: p.chain,
    }));
}

async function fetchPoolInfo(poolId: string): Promise<YieldPool | null> {
  const resp = await fetch('https://yields.llama.fi/pools');
  if (!resp.ok) {
    throw new Error(`DeFiLlama API error: ${resp.status}`);
  }

  const data = (await resp.json()) as DeFiLlamaResponse;
  const pool = data.data.find((p: DeFiLlamaPool) => p.pool === poolId);

  if (!pool) return null;

  return {
    pool: pool.pool,
    protocol: pool.project,
    symbol: pool.symbol,
    apy: Math.round(pool.apy * 100) / 100,
    tvl: Math.round(pool.tvlUsd),
    chain: pool.chain,
  };
}

// ============================================================================
// Rate Limiting
// ============================================================================

interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
}

async function checkRateLimit(request: Request, env: Env): Promise<RateLimitResult> {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 100;

  if (env.RATE_LIMIT) {
    const key = `ratelimit:${ip}`;
    const current = (await env.RATE_LIMIT.get(key, 'json')) as {
      count: number;
      resetAt: number;
    } | null;

    if (current && current.resetAt > now) {
      if (current.count >= maxRequests) {
        return {
          allowed: false,
          retryAfter: Math.ceil((current.resetAt - now) / 1000),
        };
      }

      await env.RATE_LIMIT.put(
        key,
        JSON.stringify({ count: current.count + 1, resetAt: current.resetAt }),
        { expirationTtl: 60 }
      );
    } else {
      await env.RATE_LIMIT.put(
        key,
        JSON.stringify({ count: 1, resetAt: now + windowMs }),
        { expirationTtl: 60 }
      );
    }
  }

  return { allowed: true, retryAfter: 0 };
}

// ============================================================================
// Metrics
// ============================================================================

async function getMetrics(env: Env): Promise<Metrics> {
  if (!env.METRICS) {
    return {
      requestsTotal: 0,
      requestsToday: 0,
      requestsPaid: 0,
      revenueTotal: 0,
      revenueToday: 0,
      lastRequestAt: 0,
      lastPaymentAt: 0,
      startedAt: Date.now(),
    };
  }

  const [
    requestsTotal,
    requestsToday,
    requestsPaid,
    revenueTotal,
    revenueToday,
    lastRequestAt,
    lastPaymentAt,
    startedAt,
  ] = await Promise.all([
    env.METRICS.get('requestsTotal'),
    env.METRICS.get('requestsToday'),
    env.METRICS.get('requestsPaid'),
    env.METRICS.get('revenueTotal'),
    env.METRICS.get('revenueToday'),
    env.METRICS.get('lastRequestAt'),
    env.METRICS.get('lastPaymentAt'),
    env.METRICS.get('startedAt'),
  ]);

  return {
    requestsTotal: parseInt(requestsTotal || '0', 10),
    requestsToday: parseInt(requestsToday || '0', 10),
    requestsPaid: parseInt(requestsPaid || '0', 10),
    revenueTotal: parseFloat(revenueTotal || '0'),
    revenueToday: parseFloat(revenueToday || '0'),
    lastRequestAt: parseInt(lastRequestAt || '0', 10),
    lastPaymentAt: parseInt(lastPaymentAt || '0', 10),
    startedAt: parseInt(startedAt || String(Date.now()), 10),
  };
}

async function incrementMetric(env: Env, key: string): Promise<void> {
  if (!env.METRICS) return;
  const current = parseInt((await env.METRICS.get(key)) || '0', 10);
  await env.METRICS.put(key, String(current + 1));
}

async function setMetric(env: Env, key: string, value: number): Promise<void> {
  if (!env.METRICS) return;
  await env.METRICS.put(key, String(value));
}

async function recordPayment(env: Env, amount: number): Promise<void> {
  if (!env.METRICS) return;

  await incrementMetric(env, 'requestsPaid');
  await setMetric(env, 'lastPaymentAt', Date.now());

  const currentTotal = parseFloat((await env.METRICS.get('revenueTotal')) || '0');
  await env.METRICS.put('revenueTotal', String(currentTotal + amount));

  const currentToday = parseFloat((await env.METRICS.get('revenueToday')) || '0');
  await env.METRICS.put('revenueToday', String(currentToday + amount));
}

// ============================================================================
// Utilities
// ============================================================================

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
