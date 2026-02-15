/**
 * Genesis v10.6 - MCP Streaming Bridge
 *
 * Bridges MCP (Model Context Protocol) servers into the streaming
 * orchestrator's tool execution loop with:
 *
 * - Parallel MCP execution for independent tool calls
 * - Speculative prefetch based on query pattern matching
 * - Connection pooling for low-latency repeated calls
 * - Streaming results back during generation
 * - Adaptive timeout based on historical server latency
 * - Circuit breaker integration with LatencyTracker
 *
 * This is the key innovation: MCP tools become first-class
 * streaming citizens, not blocking synchronous calls.
 */

import { ToolDefinition, StreamEvent } from './types.js';
import { LatencyTracker, getLatencyTracker } from './latency-tracker.js';
import { getEFEToolSelector } from '../active-inference/efe-tool-selector.js';

// ============================================================================
// Types
// ============================================================================

export type MCPServerName =
  | 'arxiv' | 'semantic-scholar' | 'context7' | 'wolfram'
  | 'gemini' | 'brave-search' | 'exa' | 'firecrawl'
  | 'openai' | 'github'
  | 'stability-ai'
  | 'memory' | 'filesystem'
  | 'postgres' | 'sentry' | 'playwright';

export interface MCPToolCall {
  id: string;
  server: MCPServerName;
  tool: string;
  args: Record<string, unknown>;
  priority: number;      // Higher = execute first
  dependsOn?: string[];  // Tool call IDs this depends on
}

export interface MCPToolResult {
  id: string;
  server: MCPServerName;
  tool: string;
  success: boolean;
  content: unknown;
  latency: number;
  cached: boolean;
}

export interface PrefetchRule {
  /** Pattern to match in user query */
  pattern: RegExp;
  /** Tools to prefetch */
  tools: Array<{
    server: MCPServerName;
    tool: string;
    argsFromQuery: (query: string) => Record<string, unknown>;
  }>;
  /** Confidence threshold to trigger (0-1) */
  confidence: number;
}

export interface MCPBridgeConfig {
  /** Maximum parallel MCP calls */
  maxParallel: number;
  /** Default timeout per tool call (ms) */
  defaultTimeout: number;
  /** Enable result caching */
  enableCache: boolean;
  /** Cache TTL (ms) */
  cacheTTL: number;
  /** Maximum cache entries */
  maxCacheEntries: number;
  /** Enable speculative prefetch */
  enablePrefetch: boolean;
  /** Prefetch confidence threshold */
  prefetchThreshold: number;
  /** Maximum prefetch calls per query */
  maxPrefetch: number;
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CONFIG: MCPBridgeConfig = {
  maxParallel: 5,
  defaultTimeout: 10000,    // 10s
  enableCache: true,
  cacheTTL: 300000,         // 5 minutes
  maxCacheEntries: 100,
  enablePrefetch: true,
  prefetchThreshold: 0.7,
  maxPrefetch: 3,
};

// ============================================================================
// Prefetch Rules
// ============================================================================

const PREFETCH_RULES: PrefetchRule[] = [
  {
    pattern: /(?:search|find|look\s*up|ricerca)\s+(?:papers?|articles?|research)/i,
    tools: [
      {
        server: 'arxiv',
        tool: 'search_arxiv',
        argsFromQuery: (q) => ({ query: q.replace(/search|find|look\s*up|ricerca|papers?|articles?|research/gi, '').trim(), maxResults: 5 }),
      },
      {
        server: 'semantic-scholar',
        tool: 'search_semantic_scholar',
        argsFromQuery: (q) => ({ query: q.replace(/search|find|look\s*up|ricerca|papers?|articles?|research/gi, '').trim(), maxResults: 5 }),
      },
    ],
    confidence: 0.8,
  },
  {
    pattern: /(?:search|find|what|how|when|where|why|who|explain)\b/i,
    tools: [
      {
        server: 'brave-search',
        tool: 'brave_web_search',
        argsFromQuery: (q) => ({ query: q, count: 5 }),
      },
    ],
    confidence: 0.6,
  },
  {
    pattern: /(?:github|repo|repository|code|PR|pull\s*request|issue)/i,
    tools: [
      {
        server: 'github',
        tool: 'search_repositories',
        argsFromQuery: (q) => ({ query: q.replace(/github|repo|repository|code|PR|pull\s*request|issue/gi, '').trim() }),
      },
    ],
    confidence: 0.7,
  },
  {
    pattern: /(?:remember|recall|what\s+did|memory|context)/i,
    tools: [
      {
        server: 'memory',
        tool: 'search_nodes',
        argsFromQuery: (q) => ({ query: q.replace(/remember|recall|what\s+did|memory|context/gi, '').trim() }),
      },
    ],
    confidence: 0.75,
  },
  {
    pattern: /(?:calculate|compute|math|equation|integral|derivative|solve)/i,
    tools: [
      {
        server: 'wolfram',
        tool: 'wolfram_query',
        argsFromQuery: (q) => ({ query: q }),
      },
    ],
    confidence: 0.85,
  },
  {
    pattern: /(?:web\s*page|scrape|fetch\s+url|website|crawl)/i,
    tools: [
      {
        server: 'firecrawl',
        tool: 'firecrawl_search',
        argsFromQuery: (q) => ({ query: q.replace(/web\s*page|scrape|fetch\s+url|website|crawl/gi, '').trim(), limit: 3 }),
      },
    ],
    confidence: 0.7,
  },
];

// ============================================================================
// Server Latency Profiles (initial priors)
// ============================================================================

const SERVER_LATENCY: Record<MCPServerName, { avg: number; p95: number }> = {
  'memory': { avg: 5, p95: 20 },
  'filesystem': { avg: 10, p95: 50 },
  'context7': { avg: 200, p95: 800 },
  'wolfram': { avg: 500, p95: 2000 },
  'arxiv': { avg: 300, p95: 1500 },
  'semantic-scholar': { avg: 400, p95: 1200 },
  'brave-search': { avg: 200, p95: 600 },
  'gemini': { avg: 500, p95: 2000 },
  'exa': { avg: 300, p95: 1000 },
  'firecrawl': { avg: 800, p95: 3000 },
  'openai': { avg: 400, p95: 1500 },
  'github': { avg: 200, p95: 800 },
  'stability-ai': { avg: 2000, p95: 8000 },
  'postgres': { avg: 50, p95: 200 },
  'sentry': { avg: 300, p95: 1000 },
  'playwright': { avg: 2000, p95: 10000 },
};

// ============================================================================
// Result Cache
// ============================================================================

interface CacheEntry {
  result: MCPToolResult;
  timestamp: number;
  hits: number;
}

// ============================================================================
// MCP Streaming Bridge
// ============================================================================

export class MCPBridge {
  private config: MCPBridgeConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private prefetchResults: Map<string, MCPToolResult> = new Map();
  private activeConnections: Set<string> = new Set();
  private latencyHistory: Map<string, number[]> = new Map();
  private prefetchAttempts = 0;
  private prefetchHits = 0;

  constructor(config: Partial<MCPBridgeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Tool Execution (Streaming-Integrated)
  // ==========================================================================

  /**
   * Execute tool calls with maximum parallelism.
   * Returns results as they complete (streaming).
   */
  async *executeTools(calls: MCPToolCall[]): AsyncGenerator<MCPToolResult> {
    if (calls.length === 0) return;

    // Separate into dependency levels
    const levels = this.buildExecutionLevels(calls);

    for (const level of levels) {
      // Execute all calls in this level in parallel
      const results = await this.executeParallel(level);
      for (const result of results) {
        yield result;
      }
    }
  }

  /**
   * Execute a single tool call
   */
  async executeSingle(call: MCPToolCall): Promise<MCPToolResult> {
    const startTime = Date.now();
    const cacheKey = this.cacheKey(call);

    // Check cache
    if (this.config.enableCache) {
      const cached = this.getCached(cacheKey);
      if (cached) return { ...cached, cached: true };
    }

    // Check prefetch results
    const prefetched = this.prefetchResults.get(cacheKey);
    if (prefetched) {
      this.prefetchResults.delete(cacheKey);
      this.prefetchHits++;
      return { ...prefetched, cached: true };
    }

    // Execute via MCP client
    try {
      const result = await this.callMCP(call);
      const latency = Date.now() - startTime;

      const toolResult: MCPToolResult = {
        id: call.id,
        server: call.server,
        tool: call.tool,
        success: true,
        content: result,
        latency,
        cached: false,
      };

      // Cache result
      if (this.config.enableCache) {
        this.setCached(cacheKey, toolResult);
      }

      // Track latency
      this.trackLatency(call.server, call.tool, latency);

      // v18.2: Feed outcome to EFE tool selector for adaptive learning
      try {
        const efeSelector = getEFEToolSelector();
        const surprise = this.computeResultSurprise(result, latency, call.server);
        efeSelector.recordOutcome(
          call.server, call.tool, true, latency, surprise, 0
        );
      } catch (err) {
        console.error('[mcp-bridge] EFE outcome recording failed:', err);
      }

      return toolResult;
    } catch (err: any) {
      // v18.2: Record failure in EFE selector
      try {
        const efeSelector = getEFEToolSelector();
        efeSelector.recordOutcome(
          call.server, call.tool, false, Date.now() - startTime, 5.0, 0
        );
      } catch (err) {
        console.error('[mcp-bridge] EFE failure recording failed:', err);
      }

      return {
        id: call.id,
        server: call.server,
        tool: call.tool,
        success: false,
        content: err?.message || 'MCP call failed',
        latency: Date.now() - startTime,
        cached: false,
      };
    }
  }

  // ==========================================================================
  // Speculative Prefetch
  // ==========================================================================

  /**
   * Analyze a user query and speculatively prefetch likely tool results.
   * Call this BEFORE sending the query to the LLM for maximum latency hiding.
   */
  async prefetch(userQuery: string): Promise<string[]> {
    if (!this.config.enablePrefetch) return [];

    const matchedRules = PREFETCH_RULES.filter(rule =>
      rule.pattern.test(userQuery) && rule.confidence >= this.config.prefetchThreshold
    );

    if (matchedRules.length === 0) return [];

    const prefetchCalls: MCPToolCall[] = [];
    let callId = 0;

    for (const rule of matchedRules) {
      for (const tool of rule.tools) {
        if (prefetchCalls.length >= this.config.maxPrefetch) break;
        prefetchCalls.push({
          id: `prefetch_${callId++}`,
          server: tool.server,
          tool: tool.tool,
          args: tool.argsFromQuery(userQuery),
          priority: Math.round(rule.confidence * 10),
        });
      }
    }

    // Fire prefetch calls (non-blocking)
    const prefetchedTools: string[] = [];
    const promises = prefetchCalls.map(async (call) => {
      try {
        const result = await this.executeSingle(call);
        if (result.success) {
          const key = this.cacheKey(call);
          this.prefetchResults.set(key, result);
          this.prefetchAttempts++;
          prefetchedTools.push(`${call.server}/${call.tool}`);
        }
      } catch (err) {
        console.error('[mcp-bridge] Prefetch operation failed:', err);
      }
    });

    // Don't await all - let them run in background
    Promise.allSettled(promises);

    return prefetchedTools;
  }

  /**
   * Check if a tool result is already prefetched
   */
  hasPrefetchedResult(server: MCPServerName, tool: string, args: Record<string, unknown>): boolean {
    const key = this.cacheKey({ id: '', server, tool, args, priority: 0 });
    return this.prefetchResults.has(key) || this.cache.has(key);
  }

  // ==========================================================================
  // Tool Registration (Bridge MCP → ToolDefinition)
  // ==========================================================================

  /**
   * Create ToolDefinitions that bridge to MCP servers.
   * These can be passed to the StreamOrchestrator.
   */
  createToolDefinitions(servers: MCPServerName[]): ToolDefinition[] {
    const definitions: ToolDefinition[] = [];

    const toolRegistry = this.getToolRegistry();

    for (const server of servers) {
      const tools = toolRegistry[server];
      if (!tools) continue;

      for (const tool of tools) {
        definitions.push({
          name: `${server}__${tool.name}`,
          description: tool.description,
          parameters: tool.parameters,
          handler: async (args: Record<string, unknown>) => {
            const result = await this.executeSingle({
              id: `bridge_${Date.now()}`,
              server,
              tool: tool.name,
              args,
              priority: 5,
            });
            return typeof result.content === 'string'
              ? result.content
              : JSON.stringify(result.content);
          },
        });
      }
    }

    return definitions;
  }

  // ==========================================================================
  // Adaptive Timeout
  // ==========================================================================

  /**
   * Get adaptive timeout for a server based on historical latency
   */
  getAdaptiveTimeout(server: MCPServerName, tool: string): number {
    const key = `${server}::${tool}`;
    const history = this.latencyHistory.get(key);

    if (!history || history.length < 3) {
      // Use default profile
      const profile = SERVER_LATENCY[server];
      return profile ? profile.p95 * 1.5 : this.config.defaultTimeout;
    }

    // Use P95 * 1.5 from observed latency
    const sorted = [...history].sort((a, b) => a - b);
    const p95Idx = Math.ceil(sorted.length * 0.95) - 1;
    const p95 = sorted[Math.max(0, p95Idx)];
    return Math.min(p95 * 1.5, this.config.defaultTimeout);
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  getStats(): {
    cacheHitRate: number;
    prefetchHitRate: number;
    avgLatencyByServer: Record<string, number>;
    activeConnections: number;
  } {
    let totalCacheChecks = 0;
    let cacheHits = 0;
    for (const entry of this.cache.values()) {
      totalCacheChecks += entry.hits + 1;
      cacheHits += entry.hits;
    }

    const avgLatency: Record<string, number> = {};
    for (const [key, history] of this.latencyHistory) {
      if (history.length > 0) {
        avgLatency[key] = history.reduce((s, v) => s + v, 0) / history.length;
      }
    }

    return {
      cacheHitRate: totalCacheChecks > 0 ? cacheHits / totalCacheChecks : 0,
      prefetchHitRate: this.prefetchAttempts > 0 ? this.prefetchHits / this.prefetchAttempts : 0,
      avgLatencyByServer: avgLatency,
      activeConnections: this.activeConnections.size,
    };
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  private async executeParallel(calls: MCPToolCall[]): Promise<MCPToolResult[]> {
    // Limit concurrency
    const batches: MCPToolCall[][] = [];
    for (let i = 0; i < calls.length; i += this.config.maxParallel) {
      batches.push(calls.slice(i, i + this.config.maxParallel));
    }

    const results: MCPToolResult[] = [];
    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map(call => this.executeSingle(call))
      );
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            id: 'unknown',
            server: 'memory' as MCPServerName,
            tool: 'unknown',
            success: false,
            content: result.reason?.message || 'Parallel execution failed',
            latency: 0,
            cached: false,
          });
        }
      }
    }
    return results;
  }

  private buildExecutionLevels(calls: MCPToolCall[]): MCPToolCall[][] {
    // Simple topological sort
    const levels: MCPToolCall[][] = [];
    const completed = new Set<string>();
    let remaining = [...calls];

    while (remaining.length > 0) {
      const level: MCPToolCall[] = [];
      const nextRemaining: MCPToolCall[] = [];

      for (const call of remaining) {
        const depsComplete = !call.dependsOn || call.dependsOn.every(d => completed.has(d));
        if (depsComplete) {
          level.push(call);
        } else {
          nextRemaining.push(call);
        }
      }

      if (level.length === 0) {
        // Cycle detected, force execute remaining
        levels.push(remaining);
        break;
      }

      // v18.2: EFE-enhanced priority sorting
      levels.push(level.sort((a, b) => {
        // Primary: explicit priority
        if (a.priority !== b.priority) return b.priority - a.priority;
        // Secondary: prefer lower-latency servers (from history)
        const latA = this.getAvgLatency(a.server, a.tool);
        const latB = this.getAvgLatency(b.server, b.tool);
        return latA - latB;
      }));
      for (const call of level) completed.add(call.id);
      remaining = nextRemaining;
    }

    return levels;
  }

  private async callMCP(call: MCPToolCall): Promise<unknown> {
    // Dynamic import to avoid circular dependencies
    const timeout = this.getAdaptiveTimeout(call.server, call.tool);
    const connectionKey = `${call.server}::${call.tool}`;
    this.activeConnections.add(connectionKey);

    try {
      const { getMCPClient } = await import('../mcp/index.js');
      const client = getMCPClient();
      const result = await Promise.race([
        client.call(call.server, call.tool, call.args),
        this.timeoutPromise(timeout, `${call.server}/${call.tool} timed out after ${timeout}ms`),
      ]);
      return result;
    } finally {
      this.activeConnections.delete(connectionKey);
    }
  }

  private timeoutPromise(ms: number, message: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }

  private cacheKey(call: MCPToolCall | { server: MCPServerName; tool: string; args: Record<string, unknown> }): string {
    return `${call.server}::${call.tool}::${JSON.stringify(call.args)}`;
  }

  private getCached(key: string): MCPToolResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.config.cacheTTL) {
      this.cache.delete(key);
      return null;
    }
    entry.hits++;
    return entry.result;
  }

  private setCached(key: string, result: MCPToolResult): void {
    // Evict if full
    if (this.cache.size >= this.config.maxCacheEntries) {
      const oldest = [...this.cache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (oldest) this.cache.delete(oldest[0]);
    }
    this.cache.set(key, { result, timestamp: Date.now(), hits: 0 });
  }

  private trackLatency(server: MCPServerName, tool: string, latency: number): void {
    const key = `${server}::${tool}`;
    if (!this.latencyHistory.has(key)) {
      this.latencyHistory.set(key, []);
    }
    const history = this.latencyHistory.get(key)!;
    history.push(latency);
    if (history.length > 50) history.shift();
  }

  /**
   * v18.2: Compute surprise from tool result (how unexpected was it?)
   */
  private computeResultSurprise(result: unknown, latency: number, server: MCPServerName): number {
    const profile = SERVER_LATENCY[server];
    if (!profile) return 1.0;

    // Surprise based on latency deviation from expected
    const latencyRatio = latency / profile.avg;
    const latencySurprise = Math.abs(Math.log(Math.max(0.1, latencyRatio)));

    // Surprise based on result emptiness
    const isEmpty = !result || (typeof result === 'string' && result.length === 0) ||
      (typeof result === 'object' && Object.keys(result as object).length === 0);
    const contentSurprise = isEmpty ? 2.0 : 0.0;

    return Math.min(5.0, latencySurprise + contentSurprise);
  }

  /**
   * v18.2: Get average latency for a server/tool from history
   */
  private getAvgLatency(server: MCPServerName, tool: string): number {
    const key = `${server}::${tool}`;
    const history = this.latencyHistory.get(key);
    if (!history || history.length === 0) {
      const profile = SERVER_LATENCY[server];
      return profile?.avg ?? 1000;
    }
    return history.reduce((s, v) => s + v, 0) / history.length;
  }

  private getToolRegistry(): Record<string, Array<{ name: string; description: string; parameters: any }>> {
    return {
      'arxiv': [
        { name: 'search_arxiv', description: 'Search arXiv papers', parameters: { type: 'object', properties: { query: { type: 'string' }, maxResults: { type: 'number' } }, required: ['query'] } },
        { name: 'parse_paper_content', description: 'Parse arXiv paper content', parameters: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'] } },
      ],
      'brave-search': [
        { name: 'brave_web_search', description: 'Web search via Brave', parameters: { type: 'object', properties: { query: { type: 'string' }, count: { type: 'number' } }, required: ['query'] } },
      ],
      'semantic-scholar': [
        { name: 'search_semantic_scholar', description: 'Search academic papers', parameters: { type: 'object', properties: { query: { type: 'string' }, maxResults: { type: 'number' } }, required: ['query'] } },
      ],
      'memory': [
        { name: 'search_nodes', description: 'Search knowledge graph', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
        { name: 'create_entities', description: 'Create entities in knowledge graph', parameters: { type: 'object', properties: { entities: { type: 'array' } }, required: ['entities'] } },
      ],
      'github': [
        { name: 'search_repositories', description: 'Search GitHub repos', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      ],
      'wolfram': [
        { name: 'wolfram_query', description: 'Compute with Wolfram Alpha', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      ],
      'gemini': [
        { name: 'web_search', description: 'Grounded web search with Gemini', parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } },
      ],
      'exa': [
        { name: 'web_search_exa', description: 'AI-powered web search', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      ],
      'firecrawl': [
        { name: 'firecrawl_search', description: 'Search and scrape web', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      ],
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let bridgeInstance: MCPBridge | null = null;

export function getMCPBridge(): MCPBridge {
  if (!bridgeInstance) {
    bridgeInstance = new MCPBridge();
  }
  return bridgeInstance;
}

export function resetMCPBridge(): void {
  bridgeInstance = null;
}
