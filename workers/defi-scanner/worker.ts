// Genesis DeFi Scanner Worker
// A paid MCP-compatible API endpoint for DeFi yield scanning
// Cloudflare Worker runtime (not Node.js)

export interface Env {
  // KV namespace for rate limiting (optional, falls back to in-memory)
  RATE_LIMIT?: KVNamespace;
  // Genesis wallet address for payments
  GENESIS_WALLET?: string;
}

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Router
    const url = new URL(request.url);

    // Genesis wallet address (from env or default)
    const genesisWallet = env.GENESIS_WALLET || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';

    // CORS headers
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-402-Price': '0.005',
      'X-402-Currency': 'USDC',
      'X-402-Address': genesisWallet,
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          ...headers,
          'Access-Control-Allow-Methods': 'POST, GET',
          'Access-Control-Allow-Headers': 'Content-Type, X-402-Payment'
        }
      });
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          version: '1.0.0',
          service: 'defi-scanner',
          timestamp: Date.now()
        }),
        { headers }
      );
    }

    // Check payment for paid endpoints
    if (url.pathname === '/scan' || url.pathname.startsWith('/pool/')) {
      const payment = request.headers.get('x-402-payment');
      if (!payment) {
        return new Response(
          JSON.stringify({
            error: 'Payment required',
            message: 'Include x-402-payment header with payment proof',
            price: '0.005 USDC',
            address: genesisWallet,
          }),
          { status: 402, headers }
        );
      }
    }

    // Rate limiting check
    const rateLimitResult = await checkRateLimit(request, env);
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          limit: '100 requests per minute',
          retryAfter: rateLimitResult.retryAfter
        }),
        {
          status: 429,
          headers: {
            ...headers,
            'Retry-After': String(rateLimitResult.retryAfter)
          }
        }
      );
    }

    // POST /scan - Return top yield opportunities
    if (url.pathname === '/scan' && request.method === 'POST') {
      try {
        const pools = await fetchYields();
        return new Response(
          JSON.stringify({
            pools,
            timestamp: Date.now(),
            count: pools.length
          }),
          { headers }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch yields',
            message: error instanceof Error ? error.message : 'Unknown error'
          }),
          { status: 500, headers }
        );
      }
    }

    // POST /pool/:id - Return detailed pool info
    if (url.pathname.startsWith('/pool/') && request.method === 'POST') {
      const poolId = url.pathname.split('/')[2];
      if (!poolId) {
        return new Response(
          JSON.stringify({ error: 'Pool ID required' }),
          { status: 400, headers }
        );
      }

      try {
        const poolInfo = await fetchPoolInfo(poolId);
        if (!poolInfo) {
          return new Response(
            JSON.stringify({ error: 'Pool not found' }),
            { status: 404, headers }
          );
        }
        return new Response(
          JSON.stringify({ pool: poolInfo, timestamp: Date.now() }),
          { headers }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch pool info',
            message: error instanceof Error ? error.message : 'Unknown error'
          }),
          { status: 500, headers }
        );
      }
    }

    // 404 for unknown routes
    return new Response(
      JSON.stringify({
        error: 'Not found',
        available_endpoints: [
          'GET /health',
          'POST /scan',
          'POST /pool/:id'
        ]
      }),
      { status: 404, headers }
    );
  }
};

async function fetchYields(): Promise<YieldPool[]> {
  const resp = await fetch('https://yields.llama.fi/pools');
  if (!resp.ok) {
    throw new Error(`DeFiLlama API error: ${resp.status}`);
  }

  const data = await resp.json() as DeFiLlamaResponse;

  return data.data
    .filter((p: DeFiLlamaPool) =>
      p.chain === 'Base' &&
      p.apy > 2 &&
      p.tvlUsd > 100000
    )
    .slice(0, 20)
    .map((p: DeFiLlamaPool) => ({
      pool: p.pool,
      protocol: p.project,
      symbol: p.symbol,
      apy: p.apy,
      tvl: p.tvlUsd,
      chain: p.chain,
    }));
}

async function fetchPoolInfo(poolId: string): Promise<YieldPool | null> {
  const resp = await fetch('https://yields.llama.fi/pools');
  if (!resp.ok) {
    throw new Error(`DeFiLlama API error: ${resp.status}`);
  }

  const data = await resp.json() as DeFiLlamaResponse;
  const pool = data.data.find((p: DeFiLlamaPool) => p.pool === poolId);

  if (!pool) {
    return null;
  }

  return {
    pool: pool.pool,
    protocol: pool.project,
    symbol: pool.symbol,
    apy: pool.apy,
    tvl: pool.tvlUsd,
    chain: pool.chain,
  };
}

interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
}

async function checkRateLimit(request: Request, env: Env): Promise<RateLimitResult> {
  // Extract IP from request
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 100;

  // If KV is available, use it for distributed rate limiting
  if (env.RATE_LIMIT) {
    const key = `ratelimit:${ip}`;
    const current = await env.RATE_LIMIT.get(key, 'json') as { count: number; resetAt: number } | null;

    if (current && current.resetAt > now) {
      if (current.count >= maxRequests) {
        return {
          allowed: false,
          retryAfter: Math.ceil((current.resetAt - now) / 1000)
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

  // Without KV, allow all requests (in-memory tracking not practical in Workers)
  // In production, KV namespace should be bound for proper rate limiting
  return { allowed: true, retryAfter: 0 };
}
