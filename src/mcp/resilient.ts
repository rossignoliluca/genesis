/**
 * Genesis 6.8 - Resilient MCP Wrapper
 *
 * Wraps MCP server calls with:
 * - Timeout handling
 * - Automatic retry with exponential backoff
 * - Fallback to local cache when offline
 * - Circuit breaker pattern
 * - Health monitoring
 */

import { getFixCache } from '../memory/cache.js';
import { getProjectIndexer } from '../memory/indexer.js';

// ============================================================================
// Types
// ============================================================================

export type MCPServerName =
  | 'arxiv' | 'semantic-scholar' | 'context7' | 'wolfram'    // Knowledge
  | 'gemini' | 'brave-search' | 'exa' | 'firecrawl'          // Research
  | 'openai' | 'github'                                       // Creation
  | 'stability-ai'                                            // Visual
  | 'memory' | 'filesystem';                                  // Storage

export interface MCPCallOptions {
  /** Timeout in ms (default: 30000) */
  timeout?: number;
  /** Maximum retries (default: 2) */
  maxRetries?: number;
  /** Use cache if offline (default: true) */
  useCacheFallback?: boolean;
  /** Priority: 'high' skips queue, 'low' can be delayed */
  priority?: 'high' | 'normal' | 'low';
}

export interface MCPCallResult<T = unknown> {
  /** Whether call succeeded */
  success: boolean;
  /** Response data */
  data?: T;
  /** Error message if failed */
  error?: string;
  /** Whether result came from cache */
  cached: boolean;
  /** Latency in ms */
  latency: number;
  /** Server that handled the call */
  server: MCPServerName;
  /** Number of retries needed */
  retries: number;
}

export interface ServerHealth {
  /** Server name */
  name: MCPServerName;
  /** Is server currently available */
  available: boolean;
  /** Success rate (0-1) */
  successRate: number;
  /** Average latency in ms */
  avgLatency: number;
  /** Last successful call timestamp */
  lastSuccess: number;
  /** Last failure timestamp */
  lastFailure: number;
  /** Consecutive failures */
  consecutiveFailures: number;
  /** Is circuit breaker open (blocking calls) */
  circuitOpen: boolean;
}

export interface ResilientConfig {
  /** Default timeout in ms */
  defaultTimeout: number;
  /** Default max retries */
  defaultMaxRetries: number;
  /** Circuit breaker threshold (consecutive failures to open) */
  circuitBreakerThreshold: number;
  /** Circuit breaker reset time in ms */
  circuitBreakerResetTime: number;
  /** Enable logging */
  logCalls: boolean;
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CONFIG: ResilientConfig = {
  defaultTimeout: 30000,
  defaultMaxRetries: 2,
  circuitBreakerThreshold: 5,
  circuitBreakerResetTime: 60000,
  logCalls: false,
};

// ============================================================================
// Server Categories (for fallback logic)
// ============================================================================

const SERVER_CATEGORIES: Record<string, MCPServerName[]> = {
  search: ['brave-search', 'exa', 'gemini', 'firecrawl'],
  papers: ['arxiv', 'semantic-scholar'],
  docs: ['context7'],
  math: ['wolfram'],
  code: ['github', 'openai'],
  images: ['stability-ai'],
  storage: ['memory', 'filesystem'],
};

// ============================================================================
// Resilient MCP Wrapper
// ============================================================================

export class ResilientMCP {
  private config: ResilientConfig;
  private health: Map<MCPServerName, ServerHealth> = new Map();
  private callHistory: Array<{ server: MCPServerName; success: boolean; latency: number; timestamp: number }> = [];

  constructor(config?: Partial<ResilientConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeHealth();
  }

  /**
   * Initialize health tracking for all servers
   */
  private initializeHealth(): void {
    const servers: MCPServerName[] = [
      'arxiv', 'semantic-scholar', 'context7', 'wolfram',
      'gemini', 'brave-search', 'exa', 'firecrawl',
      'openai', 'github', 'stability-ai',
      'memory', 'filesystem',
    ];

    for (const server of servers) {
      this.health.set(server, {
        name: server,
        available: true,
        successRate: 1,
        avgLatency: 0,
        lastSuccess: 0,
        lastFailure: 0,
        consecutiveFailures: 0,
        circuitOpen: false,
      });
    }
  }

  // ==========================================================================
  // Core Call Method
  // ==========================================================================

  /**
   * Call an MCP server with resilience features
   */
  async call<T = unknown>(
    server: MCPServerName,
    tool: string,
    params: Record<string, unknown>,
    options: MCPCallOptions = {}
  ): Promise<MCPCallResult<T>> {
    const {
      timeout = this.config.defaultTimeout,
      maxRetries = this.config.defaultMaxRetries,
      useCacheFallback = true,
    } = options;

    const startTime = Date.now();
    const health = this.health.get(server)!;

    // Check circuit breaker
    if (health.circuitOpen) {
      const timeSinceLastFailure = Date.now() - health.lastFailure;
      if (timeSinceLastFailure < this.config.circuitBreakerResetTime) {
        // Circuit still open - try cache or alternative
        if (useCacheFallback) {
          return this.tryFallback<T>(server, tool, params, startTime);
        }
        return {
          success: false,
          error: `Circuit breaker open for ${server}`,
          cached: false,
          latency: Date.now() - startTime,
          server,
          retries: 0,
        };
      }
      // Reset circuit breaker (half-open state)
      health.circuitOpen = false;
    }

    // Try the call with retries
    let lastError = '';
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.executeCall<T>(server, tool, params, timeout);
        this.recordSuccess(server, Date.now() - startTime);

        return {
          success: true,
          data: result,
          cached: false,
          latency: Date.now() - startTime,
          server,
          retries: attempt,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);

        if (this.config.logCalls) {
          console.log(`[MCP] ${server}.${tool} attempt ${attempt + 1} failed: ${lastError}`);
        }

        // Exponential backoff before retry
        if (attempt < maxRetries) {
          await this.delay(Math.pow(2, attempt) * 500);
        }
      }
    }

    // All retries failed
    this.recordFailure(server);

    // Try fallback
    if (useCacheFallback) {
      return this.tryFallback<T>(server, tool, params, startTime, lastError);
    }

    return {
      success: false,
      error: lastError,
      cached: false,
      latency: Date.now() - startTime,
      server,
      retries: maxRetries,
    };
  }

  /**
   * Execute the actual MCP call
   */
  private async executeCall<T>(
    server: MCPServerName,
    tool: string,
    params: Record<string, unknown>,
    timeout: number
  ): Promise<T> {
    // This is a placeholder - in real implementation, this would call the MCP SDK
    // For now, we simulate the call structure

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Simulate MCP call based on server type
      // In production, this would use @modelcontextprotocol/sdk
      const result = await this.simulateMCPCall<T>(server, tool, params, controller.signal);
      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Simulate MCP call (placeholder for actual SDK integration)
   */
  private async simulateMCPCall<T>(
    server: MCPServerName,
    tool: string,
    params: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<T> {
    // In production, this would be replaced with actual MCP SDK calls
    // For now, throw to trigger fallback logic demonstration

    if (server === 'filesystem' || server === 'memory') {
      // Local servers always work
      return { success: true, tool, params } as T;
    }

    // Simulate network call
    const response = await fetch(`http://localhost:3000/mcp/${server}/${tool}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal,
    }).catch(() => {
      throw new Error(`${server} is offline or unreachable`);
    });

    if (!response.ok) {
      throw new Error(`${server} returned ${response.status}`);
    }

    return response.json();
  }

  // ==========================================================================
  // Fallback Logic
  // ==========================================================================

  /**
   * Try fallback strategies when primary server fails
   */
  private async tryFallback<T>(
    server: MCPServerName,
    tool: string,
    params: Record<string, unknown>,
    startTime: number,
    originalError?: string
  ): Promise<MCPCallResult<T>> {
    // Strategy 1: Try local cache
    const cacheResult = this.tryCache<T>(server, tool, params);
    if (cacheResult) {
      return {
        success: true,
        data: cacheResult,
        cached: true,
        latency: Date.now() - startTime,
        server,
        retries: 0,
      };
    }

    // Strategy 2: Try project indexer for search operations
    if (tool.includes('search') || tool.includes('find')) {
      const indexResult = await this.tryProjectIndex<T>(params);
      if (indexResult) {
        return {
          success: true,
          data: indexResult,
          cached: true,
          latency: Date.now() - startTime,
          server,
          retries: 0,
        };
      }
    }

    // Strategy 3: Try alternative server in same category
    const alternative = this.findAlternativeServer(server);
    if (alternative) {
      if (this.config.logCalls) {
        console.log(`[MCP] Trying alternative server: ${alternative}`);
      }
      // Recursive call with alternative (but no further fallback)
      return this.call<T>(alternative, tool, params, { useCacheFallback: false });
    }

    return {
      success: false,
      error: originalError || `${server} unavailable, no fallback found`,
      cached: false,
      latency: Date.now() - startTime,
      server,
      retries: 0,
    };
  }

  /**
   * Try to find result in local cache
   */
  private tryCache<T>(
    server: MCPServerName,
    tool: string,
    params: Record<string, unknown>
  ): T | null {
    // For now, only cache fix results
    if (server === 'openai' && tool.includes('fix')) {
      const cache = getFixCache();
      const errorMessage = params.error as string;
      const filePath = params.file as string;

      if (errorMessage && filePath) {
        const cached = cache.lookup(errorMessage, filePath, '');
        if (cached) {
          return { fix: cached.fix, cached: true } as T;
        }
      }
    }

    return null;
  }

  /**
   * Try to find result in project index
   */
  private async tryProjectIndex<T>(params: Record<string, unknown>): Promise<T | null> {
    const query = params.query as string || params.search as string || params.q as string;
    if (!query) return null;

    try {
      const indexer = getProjectIndexer();
      const results = indexer.search(query, { limit: 5 });

      if (results.length > 0) {
        return {
          source: 'local-index',
          results: results.map(r => ({
            file: r.path,
            matches: r.matches.length,
            preview: r.matches[0]?.content || '',
          })),
        } as T;
      }
    } catch {
      // Index not available
    }

    return null;
  }

  /**
   * Find an alternative server in the same category
   */
  private findAlternativeServer(server: MCPServerName): MCPServerName | null {
    for (const [, servers] of Object.entries(SERVER_CATEGORIES)) {
      const index = servers.indexOf(server);
      if (index !== -1) {
        // Find next available server in category
        for (let i = 1; i < servers.length; i++) {
          const alt = servers[(index + i) % servers.length];
          const health = this.health.get(alt);
          if (health && !health.circuitOpen && health.consecutiveFailures < 3) {
            return alt;
          }
        }
      }
    }
    return null;
  }

  // ==========================================================================
  // Health Tracking
  // ==========================================================================

  private recordSuccess(server: MCPServerName, latency: number): void {
    const health = this.health.get(server)!;
    health.lastSuccess = Date.now();
    health.consecutiveFailures = 0;
    health.circuitOpen = false;
    health.available = true;

    // Update average latency
    health.avgLatency = health.avgLatency === 0
      ? latency
      : health.avgLatency * 0.9 + latency * 0.1;

    // Update success rate
    this.callHistory.push({ server, success: true, latency, timestamp: Date.now() });
    this.updateSuccessRate(server);
  }

  private recordFailure(server: MCPServerName): void {
    const health = this.health.get(server)!;
    health.lastFailure = Date.now();
    health.consecutiveFailures++;

    // Check circuit breaker
    if (health.consecutiveFailures >= this.config.circuitBreakerThreshold) {
      health.circuitOpen = true;
      health.available = false;
      console.log(`[MCP] Circuit breaker OPEN for ${server}`);
    }

    this.callHistory.push({ server, success: false, latency: 0, timestamp: Date.now() });
    this.updateSuccessRate(server);
  }

  private updateSuccessRate(server: MCPServerName): void {
    const recentCalls = this.callHistory
      .filter(c => c.server === server && Date.now() - c.timestamp < 300000); // Last 5 min

    if (recentCalls.length > 0) {
      const health = this.health.get(server)!;
      health.successRate = recentCalls.filter(c => c.success).length / recentCalls.length;
    }
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Get health status for all servers
   */
  getHealth(): ServerHealth[] {
    return Array.from(this.health.values());
  }

  /**
   * Get health status for a specific server
   */
  getServerHealth(server: MCPServerName): ServerHealth | undefined {
    return this.health.get(server);
  }

  /**
   * Reset circuit breaker for a server
   */
  resetCircuitBreaker(server: MCPServerName): void {
    const health = this.health.get(server);
    if (health) {
      health.circuitOpen = false;
      health.consecutiveFailures = 0;
      health.available = true;
    }
  }

  /**
   * Check if a server is available
   */
  isAvailable(server: MCPServerName): boolean {
    const health = this.health.get(server);
    return health ? health.available && !health.circuitOpen : false;
  }

  /**
   * Get list of available servers
   */
  getAvailableServers(): MCPServerName[] {
    return Array.from(this.health.entries())
      .filter(([, h]) => h.available && !h.circuitOpen)
      .map(([name]) => name);
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Singleton
// ============================================================================

let resilientMCPInstance: ResilientMCP | null = null;

export function getResilientMCP(config?: Partial<ResilientConfig>): ResilientMCP {
  if (!resilientMCPInstance) {
    resilientMCPInstance = new ResilientMCP(config);
  }
  return resilientMCPInstance;
}

export function resetResilientMCP(): void {
  resilientMCPInstance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Call MCP server with automatic resilience
 */
export async function mcpCall<T = unknown>(
  server: MCPServerName,
  tool: string,
  params: Record<string, unknown>,
  options?: MCPCallOptions
): Promise<MCPCallResult<T>> {
  return getResilientMCP().call<T>(server, tool, params, options);
}

/**
 * Check if MCP servers are healthy
 */
export function mcpHealthCheck(): ServerHealth[] {
  return getResilientMCP().getHealth();
}
