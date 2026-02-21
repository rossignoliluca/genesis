/**
 * Genesis 7.5 - Real MCP Client Module
 *
 * Connects to actual MCP servers using @modelcontextprotocol/sdk.
 * Spawns servers on demand and manages connections.
 *
 * Environment Variables:
 * - GENESIS_MCP_MODE: 'real' | 'simulated' | 'hybrid' (default: 'simulated')
 * - GENESIS_MCP_TIMEOUT: Timeout in ms (default: 30000)
 * - GENESIS_MCP_LOG: Enable MCP call logging (default: false)
 *
 * New in 7.5: Frontier MCP capabilities
 * - Tool Chaining: Automatic orchestration of dependent tool calls
 * - Streaming: Real-time result streaming with progress
 * - Multimodal: Image/media display in terminal
 * - Cache: Intelligent per-server caching with TTL
 * - DAG Executor: Parallel execution with dependency awareness
 * - Transformers: Composable result transformations
 *
 * New in 7.18: Web Search Fallback Chain
 * - brave-search → exa → gemini → firecrawl
 * - Automatic tool name mapping between providers
 */

// Re-export Phase 8: Resilient MCP Wrapper
export * from './resilient.js';

// Re-export Phase 10: Frontier MCP Capabilities
export * from './tool-chain.js';
export * from './streaming.js';
export * from './multimodal.js';
export * from './cache.js';
export * from './parallel-executor.js';
export * from './transformers.js';

// Re-export Phase 11: Enhanced Client Manager (v7.6)
export * from './client-manager.js';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCPServerName } from '../types.js';
import { randomUUID } from 'crypto';
import { getMetricsRegistry, Counter, Histogram } from '../observability/metrics.js';
import { getAlerter } from '../observability/alerting.js';
import { RateLimiter } from '../lifecycle/rate-limiter.js';

// ============================================================================
// MCP Rate Limiters (v14.11 - Hardening)
// Per-provider rate limits to respect API quotas
// ============================================================================

const PROVIDER_RATE_LIMITS: Record<string, { maxTokens: number; refillRate: number }> = {
  // OpenAI: 10,000 RPM (tier 2) = 166.67/sec
  'openai': { maxTokens: 500, refillRate: 166 },
  // Anthropic: 4,000 RPM = 66.67/sec
  'anthropic': { maxTokens: 200, refillRate: 66 },
  // GitHub: 5,000/hour = 1.39/sec
  'github': { maxTokens: 50, refillRate: 1.4 },
  // arXiv: 3/second
  'arxiv': { maxTokens: 10, refillRate: 3 },
  // Semantic Scholar: 100/second (generous)
  'semantic-scholar': { maxTokens: 100, refillRate: 100 },
  // Brave Search: 15/second
  'brave-search': { maxTokens: 30, refillRate: 15 },
  // Default for others: 10/second
  'default': { maxTokens: 50, refillRate: 10 },
};

const providerRateLimiters: Map<string, RateLimiter> = new Map();

function getProviderRateLimiter(server: string): RateLimiter {
  if (!providerRateLimiters.has(server)) {
    const config = PROVIDER_RATE_LIMITS[server] || PROVIDER_RATE_LIMITS['default'];
    providerRateLimiters.set(server, new RateLimiter(config));
  }
  return providerRateLimiters.get(server)!;
}

// ============================================================================
// MCP Metrics (v14.10 - Observability)
// ============================================================================

const metricsRegistry = getMetricsRegistry('genesis');

const mcpCallsTotal = metricsRegistry.counter({
  name: 'mcp_calls_total',
  help: 'Total MCP tool calls',
  labels: ['server', 'tool', 'status'],
});

const mcpLatency = metricsRegistry.histogram({
  name: 'mcp_latency_seconds',
  help: 'MCP call latency in seconds',
  labels: ['server', 'tool'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
});

const mcpConnectionsActive = metricsRegistry.gauge({
  name: 'mcp_connections_active',
  help: 'Active MCP server connections',
});

const mcpErrorsTotal = metricsRegistry.counter({
  name: 'mcp_errors_total',
  help: 'Total MCP errors by type',
  labels: ['server', 'error_type'],
});

// Export for CLI stats
export function getMCPMetrics() {
  return { mcpCallsTotal, mcpLatency, mcpConnectionsActive, mcpErrorsTotal, registry: metricsRegistry };
}

// ============================================================================
// Security: Secret Sanitization (v14.11)
// ============================================================================

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9-_]{20,}/g,           // OpenAI keys
  /sk-ant-[a-zA-Z0-9-_]{20,}/g,       // Anthropic keys
  /ghp_[a-zA-Z0-9]{36}/g,             // GitHub PAT
  /gho_[a-zA-Z0-9]{36}/g,             // GitHub OAuth
  /[a-zA-Z0-9]{32,}/g,                // Generic API keys (if looks like key)
  /Bearer\s+[a-zA-Z0-9-_.]+/gi,       // Bearer tokens
  /password[=:]\s*["']?[^"'\s]+/gi,   // Passwords in strings
  /api[_-]?key[=:]\s*["']?[^"'\s]+/gi, // API keys in strings
];

function sanitizeSecrets(input: string): string {
  let sanitized = input;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      // Keep first 4 chars for identification, redact rest
      if (match.length > 8) {
        return match.slice(0, 4) + '***REDACTED***';
      }
      return '***REDACTED***';
    });
  }
  return sanitized;
}

function sanitizeObject(obj: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    // Redact known sensitive keys
    if (lowerKey.includes('password') || lowerKey.includes('secret') ||
        lowerKey.includes('token') || lowerKey.includes('key') ||
        lowerKey.includes('auth') || lowerKey.includes('credential')) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof value === 'string') {
      sanitized[key] = sanitizeSecrets(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// ============================================================================
// Types
// ============================================================================

export type MCPMode = 'real' | 'simulated' | 'hybrid';

export interface MCPCallOptions {
  timeout?: number;
  retries?: number;
  fallbackToSimulated?: boolean;
}

export interface MCPCallResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  server: MCPServerName;
  tool: string;
  mode: 'real' | 'simulated';
  latency: number;
  timestamp: Date;
}

export interface MCPClientConfig {
  mode: MCPMode;
  timeout: number;
  logCalls: boolean;
  onCall?: (server: MCPServerName, tool: string, params: any) => void;
  onResult?: (result: MCPCallResult) => void;
}

// ============================================================================
// MCP Server Registry
// ============================================================================

interface MCPServerInfo {
  command: string;
  args: string[] | (() => string[]);
  envVars?: Record<string, string> | (() => Record<string, string>);
  tools: string[];
}

/**
 * Registry of MCP servers and how to spawn them.
 * These are the 18 MCP servers Genesis uses.
 *
 * Package sources (verified on npm):
 * - Official: @modelcontextprotocol/server-*
 * - Third-party: arxiv-mcp-server, @brave/brave-search-mcp-server, etc.
 */
const MCP_SERVER_REGISTRY: Record<MCPServerName, MCPServerInfo> = {
  // KNOWLEDGE
  'arxiv': {
    command: 'npx',
    args: ['-y', '@iflow-mcp/arxiv-paper-mcp@latest'],
    tools: ['search_arxiv', 'parse_paper_content', 'get_recent_ai_papers', 'get_arxiv_pdf_url'],
  },
  'semantic-scholar': {
    // v7.24.1: Added API key support to avoid rate limits
    // Get free API key at: https://www.semanticscholar.org/product/api#api-key-form
    command: 'npx',
    args: ['-y', 'researchmcp', 'semantic'],
    envVars: () => ({ SEMANTIC_SCHOLAR_API_KEY: process.env.SEMANTIC_SCHOLAR_API_KEY || '' }),
    tools: ['search_semantic_scholar', 'get_semantic_scholar_paper', 'get_paper_citations', 'semantic_scholar_to_bibtex'],
  },
  'context7': {
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp@latest'],
    tools: ['resolve-library-id', 'query-docs'],
  },
  'wolfram': {
    command: 'npx',
    args: ['-y', 'wolfram-mcp'],
    envVars: () => ({ WOLFRAM_APP_ID: process.env.WOLFRAM_APP_ID || '' }),
    tools: ['wolfram_query'],
  },

  // RESEARCH
  'gemini': {
    command: 'npx',
    args: ['-y', 'mcp-gemini-web'],
    envVars: () => ({ GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '' }),
    tools: ['web_search', 'web_search_batch', 'health_check'],
  },
  'brave-search': {
    command: 'npx',
    args: () => ['-y', '@brave/brave-search-mcp-server', '--brave-api-key', process.env.BRAVE_API_KEY || ''],
    tools: ['brave_web_search', 'brave_local_search', 'brave_news_search', 'brave_image_search', 'brave_video_search', 'brave_summarizer'],
  },
  'exa': {
    command: 'npx',
    args: ['-y', 'exa-mcp-server'],
    envVars: () => ({ EXA_API_KEY: process.env.EXA_API_KEY || '' }),
    tools: ['web_search_exa', 'get_code_context_exa'],
  },
  'firecrawl': {
    command: 'npx',
    args: ['-y', 'firecrawl-mcp'],
    envVars: () => ({ FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY || '' }),
    tools: ['firecrawl_scrape', 'firecrawl_search', 'firecrawl_map', 'firecrawl_crawl', 'firecrawl_check_crawl_status', 'firecrawl_extract', 'firecrawl_agent', 'firecrawl_agent_status'],
  },

  // CREATION
  'openai': {
    command: 'npx',
    args: ['-y', '@mzxrai/mcp-openai'],
    envVars: () => ({ OPENAI_API_KEY: process.env.OPENAI_API_KEY || '' }),
    tools: ['openai_chat'],
  },
  'github': {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    // v7.3: Accept both variable names for compatibility
    envVars: () => ({
      GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN || ''
    }),
    tools: [
      'create_repository', 'search_repositories', 'create_issue', 'list_issues', 'get_issue', 'update_issue',
      'add_issue_comment', 'create_pull_request', 'get_pull_request', 'list_pull_requests', 'merge_pull_request',
      'get_pull_request_files', 'create_pull_request_review', 'get_file_contents', 'create_or_update_file',
      'push_files', 'create_branch', 'list_commits', 'fork_repository', 'search_code', 'search_issues', 'search_users'
    ],
  },

  // VISUAL
  'stability-ai': {
    command: 'npx',
    args: ['-y', 'mcp-server-stability-ai'],
    envVars: () => ({ STABILITY_AI_API_KEY: process.env.STABILITY_AI_API_KEY || '' }),
    tools: [
      'stability-ai-generate-image', 'stability-ai-generate-image-sd35', 'stability-ai-remove-background',
      'stability-ai-outpaint', 'stability-ai-search-and-replace', 'stability-ai-upscale-fast',
      'stability-ai-upscale-creative', 'stability-ai-control-sketch', 'stability-ai-0-list-resources',
      'stability-ai-search-and-recolor', 'stability-ai-replace-background-and-relight',
      'stability-ai-control-style', 'stability-ai-control-structure'
    ],
  },

  // STORAGE
  'memory': {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    tools: ['create_entities', 'create_relations', 'add_observations', 'delete_entities', 'delete_relations', 'delete_observations', 'search_nodes', 'open_nodes', 'read_graph'],
  },
  'filesystem': {
    command: 'npx',
    args: () => ['-y', '@modelcontextprotocol/server-filesystem', process.env.HOME || '/tmp'],
    tools: [
      'read_file', 'read_text_file', 'read_media_file', 'read_multiple_files', 'write_file', 'edit_file',
      'create_directory', 'list_directory', 'list_directory_with_sizes', 'directory_tree',
      'move_file', 'search_files', 'get_file_info', 'list_allowed_directories'
    ],
  },

  // v7.14 - WEB & AUTOMATION
  'playwright': {
    command: 'npx',
    args: ['-y', '@playwright/mcp'],
    tools: [
      'browser_navigate', 'browser_snapshot', 'browser_take_screenshot', 'browser_click',
      'browser_type', 'browser_fill_form', 'browser_evaluate', 'browser_close',
      'browser_resize', 'browser_console_messages', 'browser_handle_dialog',
      'browser_file_upload', 'browser_install', 'browser_press_key', 'browser_navigate_back',
      'browser_network_requests', 'browser_run_code', 'browser_hover', 'browser_select_option',
      'browser_tabs', 'browser_wait_for', 'browser_drag'
    ],
  },
  'aws': {
    command: 'npx',
    args: ['-y', 'mcp-aws-devops-server'],
    envVars: () => ({
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
      AWS_REGION: process.env.AWS_REGION || 'us-east-1',
    }),
    tools: [
      'cloud_servers', 'cloud_storage', 'logs_and_metrics', 'ai_assistant',
      'serverless_functions', 'security_permissions', 'databases', 'network_manager',
      'cost_optimizer', 'security_scanner', 'multi_region', 'workflow', 'runbook',
      'scheduled_ops', 'auto_remediation', 'slack_webhook', 'teams_webhook',
      'route53', 'secrets_manager', 'cloudfront', 'azure_devops_projects',
      'azure_devops_pipelines', 'azure_devops_repos', 'azure_devops_work_items'
    ],
  },
  'sentry': {
    command: 'npx',
    args: ['-y', '@sentry/mcp-server-sentry'],
    envVars: () => ({ SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN || '' }),
    tools: [
      'whoami', 'find_organizations', 'find_teams', 'find_projects', 'find_releases',
      'get_issue_details', 'search_issues', 'search_events', 'update_issue',
      'create_team', 'create_project', 'create_dsn', 'find_dsns',
      'analyze_issue_with_seer', 'search_docs', 'get_doc'
    ],
  },
  'postgres': {
    command: 'npx',
    args: () => ['-y', '@modelcontextprotocol/server-postgres', process.env.DATABASE_URL || ''],
    tools: ['query'],
  },

  // v7.19 - HUGGINGFACE SPACES
  'huggingface': {
    command: 'npx',
    args: () => [
      '-y', '@llmindset/mcp-hfspace',
      // Default Space - customizable via HF_SPACES env var (comma-separated)
      // Note: Image gen may timeout on cold start, use HF_TOKEN for priority queue
      ...(process.env.HF_SPACES?.split(',') || [
        'multimodalart/FLUX.2-dev-turbo',    // Faster 8-step turbo (recommended)
        'black-forest-labs/FLUX.1-schnell',  // Original fast model
      ])
    ],
    envVars: () => ({ HF_TOKEN: process.env.HF_TOKEN || '' }),
    // Tools: search-spaces, available-files, plus dynamic tools per Space (e.g. FLUX_2-dev-turbo-infer)
    tools: ['search-spaces', 'available-files'],
  },

  // v7.23 - AUTONOMOUS LAYER
  'stripe': {
    command: 'npx',
    args: ['-y', '@stripe/agent-toolkit'],
    // v7.24: Accept both variable names for compatibility
    envVars: () => ({ STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY || '' }),
    tools: ['get_balance', 'create_payment_intent', 'create_product', 'create_price', 'create_issuing_card'],
  },
  'coinbase': {
    command: 'npx',
    args: ['-y', '@coinbase/agentkit-mcp'],
    envVars: () => ({
      CDP_API_KEY_NAME: process.env.CDP_API_KEY_NAME || '',
      CDP_API_KEY_PRIVATE_KEY: process.env.CDP_API_KEY_PRIVATE_KEY || '',
    }),
    tools: ['get_wallet_balance', 'get_wallet_address', 'send_usdc', 'trade'],
  },
  'supabase': {
    command: 'npx',
    args: ['-y', '@supabase/mcp-server-supabase'],
    // v7.24: Accept both variable names for compatibility
    envVars: () => ({
      SUPABASE_URL: process.env.SUPABASE_URL || '',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '',
    }),
    tools: ['query', 'insert', 'update', 'delete', 'rpc'],
  },
  'vercel': {
    command: 'npx',
    args: ['-y', '@vercel/mcp'],
    // v7.24: Accept both variable names for compatibility
    envVars: () => ({ VERCEL_TOKEN: process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN || '' }),
    tools: ['create_project', 'deploy', 'list_deployments', 'get_deployment', 'set_env'],
  },
  'cloudflare': {
    // v7.24: Use mcp-remote for Cloudflare's remote MCP server
    command: 'npx',
    args: ['-y', 'mcp-remote', 'https://bindings.mcp.cloudflare.com/mcp'],
    envVars: () => ({
      CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || '',
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || '',
    }),
    tools: ['deploy_worker', 'list_workers', 'manage_dns', 'create_r2_bucket'],
  },
  'pinecone': {
    command: 'npx',
    args: ['-y', '@pinecone-database/mcp'],
    envVars: () => ({ PINECONE_API_KEY: process.env.PINECONE_API_KEY || '' }),
    tools: ['upsert_vectors', 'query_vectors', 'delete_vectors', 'describe_index'],
  },
  'neo4j': {
    // v7.24: Fixed package name and env var mapping
    command: 'npx',
    args: ['-y', '@alanse/mcp-neo4j-server'],
    envVars: () => ({
      NEO4J_URI: process.env.NEO4J_URI || '',
      NEO4J_USERNAME: process.env.NEO4J_USERNAME || process.env.NEO4J_USER || 'neo4j',
      NEO4J_PASSWORD: process.env.NEO4J_PASSWORD || '',
      NEO4J_DATABASE: process.env.NEO4J_DATABASE || 'neo4j',
    }),
    tools: ['cypher_query', 'create_node', 'create_relationship', 'find_paths'],
  },
  'slack': {
    // v7.24: Fixed package (korotovsky/slack-mcp-server) and env var
    // Use SLACK_MCP_XOXP_TOKEN for user OAuth tokens (xoxe.xoxp-... format)
    command: 'npx',
    args: ['-y', 'slack-mcp-server'],
    envVars: () => ({ SLACK_MCP_XOXP_TOKEN: process.env.SLACK_MCP_XOXP_TOKEN || process.env.SLACK_BOT_TOKEN || '' }),
    tools: ['post_message', 'list_channels', 'get_messages'],
  },
  'puppeteer': {
    command: 'npx',
    args: ['-y', '@anthropic/mcp-puppeteer'],
    tools: ['navigate', 'screenshot', 'click', 'type', 'evaluate'],
  },
  'sequential-thinking': {
    command: 'npx',
    args: ['-y', '@anthropic/mcp-sequential-thinking'],
    tools: ['think_step', 'plan', 'reflect', 'conclude'],
  },
  // v10.0 - Internal markers (not real servers)
  'parallel': {
    command: '',  // Not a real server
    args: [],
    tools: [],
  },
};

// ============================================================================
// v7.18 - Web Search Fallback Chain
// ============================================================================

/**
 * Fallback chain for web search providers.
 * When one fails (rate limit, API key missing, error), try the next.
 */
const WEB_SEARCH_FALLBACK_CHAIN: MCPServerName[] = ['brave-search', 'exa', 'gemini', 'firecrawl'];

/**
 * Tool name mapping between web search providers.
 * Maps the original tool name to equivalent tool on fallback server.
 */
const WEB_SEARCH_TOOL_MAP: Record<string, Record<MCPServerName, string>> = {
  'brave_web_search': {
    'brave-search': 'brave_web_search',
    'exa': 'web_search_exa',
    'gemini': 'web_search',
    'firecrawl': 'firecrawl_search',
  } as Record<MCPServerName, string>,
  'brave_news_search': {
    'brave-search': 'brave_news_search',
    'exa': 'web_search_exa', // Exa doesn't have news-specific, use general
    'gemini': 'web_search',
    'firecrawl': 'firecrawl_search',
  } as Record<MCPServerName, string>,
};

/**
 * Check if a server requires an API key and if it's configured.
 */
function isServerConfigured(server: MCPServerName): boolean {
  const requiredEnvVars: Record<string, string[]> = {
    'brave-search': ['BRAVE_API_KEY'],
    'exa': ['EXA_API_KEY'],
    'gemini': ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
    'firecrawl': ['FIRECRAWL_API_KEY'],
  };

  const vars = requiredEnvVars[server];
  if (!vars) return true; // No API key required

  return vars.some(v => !!process.env[v]);
}

/**
 * Check if an error indicates rate limiting or quota exhaustion.
 */
function isRateLimitError(error: string): boolean {
  const rateLimitPatterns = [
    'rate limit', 'rate_limit', 'ratelimit',
    '429', 'too many requests',
    'quota', 'exceeded', 'exhausted',
    'credit balance',
  ];
  const lowerError = error.toLowerCase();
  return rateLimitPatterns.some(p => lowerError.includes(p));
}

/**
 * Get next fallback server in the chain.
 */
function getNextFallbackServer(currentServer: MCPServerName, tool: string): { server: MCPServerName; tool: string } | null {
  // Only handle web search tools
  if (!WEB_SEARCH_TOOL_MAP[tool]) return null;

  const currentIndex = WEB_SEARCH_FALLBACK_CHAIN.indexOf(currentServer);
  if (currentIndex === -1) return null;

  // Find next configured server in chain
  for (let i = currentIndex + 1; i < WEB_SEARCH_FALLBACK_CHAIN.length; i++) {
    const nextServer = WEB_SEARCH_FALLBACK_CHAIN[i];
    if (isServerConfigured(nextServer)) {
      const mappedTool = WEB_SEARCH_TOOL_MAP[tool][nextServer];
      if (mappedTool) {
        return { server: nextServer, tool: mappedTool };
      }
    }
  }

  return null;
}

// ============================================================================
// MCP Connection Manager
// ============================================================================

interface MCPConnection {
  client: Client;
  transport: StdioClientTransport;
  connected: boolean;
  lastUsed: Date;
}

class MCPConnectionManager {
  private connections: Map<MCPServerName, MCPConnection> = new Map();
  private connecting: Map<MCPServerName, Promise<MCPConnection>> = new Map();
  private timeout: number;
  private logCalls: boolean;

  constructor(timeout = 30000, logCalls = false) {
    this.timeout = timeout;
    this.logCalls = logCalls;
  }

  /**
   * Get or create connection to MCP server
   */
  async getConnection(server: MCPServerName): Promise<MCPConnection> {
    // Return existing connection if available
    const existing = this.connections.get(server);
    if (existing?.connected) {
      existing.lastUsed = new Date();
      return existing;
    }

    // Check if already connecting
    const pending = this.connecting.get(server);
    if (pending) {
      return pending;
    }

    // Create new connection
    const connectPromise = this.createConnection(server);
    this.connecting.set(server, connectPromise);

    try {
      const connection = await connectPromise;
      this.connections.set(server, connection);
      return connection;
    } finally {
      this.connecting.delete(server);
    }
  }

  /**
   * Create new connection to MCP server
   */
  private async createConnection(server: MCPServerName): Promise<MCPConnection> {
    const serverInfo = MCP_SERVER_REGISTRY[server];
    if (!serverInfo) {
      throw new Error(`Unknown MCP server: ${server}`);
    }

    // v7.3: Check required API keys before spawning
    const missingKey = this.checkRequiredKeys(server);
    if (missingKey) {
      throw new Error(`MCP server '${server}' requires ${missingKey} to be set. Please add it to your .env file.`);
    }

    // Resolve args and envVars at connection time (supports functions for dynamic values)
    const args = typeof serverInfo.args === 'function' ? serverInfo.args() : serverInfo.args;
    const envVars = typeof serverInfo.envVars === 'function' ? serverInfo.envVars() : serverInfo.envVars;

    if (this.logCalls) {
      console.log(`[MCP] Spawning ${server}: ${serverInfo.command} ${args.join(' ')}`);
    }

    const client = new Client({
      name: `genesis-${server}`,
      version: '6.0.0',
    });

    // Build environment, filtering out undefined values
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
    if (envVars) {
      Object.assign(env, envVars);
    }

    const transport = new StdioClientTransport({
      command: serverInfo.command,
      args,
      env,
      // v7.24: Silence MCP server stderr to avoid polluting chat output
      stderr: 'pipe',
    });

    await client.connect(transport);

    if (this.logCalls) {
      console.log(`[MCP] Connected to ${server}`);
    }

    // v14.10: Track active connections
    mcpConnectionsActive.inc();

    return {
      client,
      transport,
      connected: true,
      lastUsed: new Date(),
    };
  }

  /**
   * Call a tool on an MCP server
   * v7.18: Added timeout wrapper for faster failure
   * v14.10: Added structured logging with latency tracking
   */
  async callTool<T = any>(
    server: MCPServerName,
    tool: string,
    args: Record<string, any>
  ): Promise<T> {
    const startTime = performance.now();
    const callId = `${server}.${tool}.${Date.now().toString(36)}`;

    // v14.11: Rate limiting per provider
    const rateLimiter = getProviderRateLimiter(server);
    const rateCheck = rateLimiter.check(server);
    if (!rateCheck.allowed) {
      const waitMs = rateCheck.retryAfterMs || 1000;
      if (this.logCalls) {
        console.log(JSON.stringify({
          level: 'warn',
          time: Date.now(),
          msg: 'Rate limited, waiting',
          server,
          tool,
          waitMs,
        }));
      }
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    const connection = await this.getConnection(server);

    if (this.logCalls) {
      // v14.11: Sanitize args to prevent secret leakage
      const safeArgs = sanitizeObject(args);
      console.log(JSON.stringify({
        level: 'debug',
        time: Date.now(),
        msg: 'MCP call started',
        callId,
        server,
        tool,
        argsPreview: sanitizeSecrets(JSON.stringify(safeArgs).slice(0, 100)),
      }));
    }

    // v7.18: Wrap call in timeout for faster failure (15s default, 30s/120s for heavy ops)
    const isHeavyOp = ['firecrawl_crawl', 'parse_paper_content', 'web_search'].includes(tool);
    const isImageGen = server === 'huggingface' || server === 'stability-ai' || tool.includes('generate') || tool.includes('infer');
    const callTimeout = isImageGen ? 120000 : isHeavyOp ? 30000 : 15000; // 120s for image gen (HF cold start)

    // v14.11: Retry with exponential backoff (3 attempts)
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await Promise.race([
          connection.client.callTool({
            name: tool,
            arguments: args,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`MCP call to ${server}.${tool} timed out after ${callTimeout}ms`)), callTimeout)
          ),
        ]);

        const latencyMs = Math.round(performance.now() - startTime);

        // v14.10: Track metrics
        mcpCallsTotal.inc({ server, tool, status: 'success' });
        mcpLatency.observe(latencyMs / 1000, { server, tool });

        if (this.logCalls) {
          console.log(JSON.stringify({
            level: 'info',
            time: Date.now(),
            msg: 'MCP call completed',
            callId,
            server,
            tool,
            latencyMs,
            success: true,
            attempt: attempt + 1,
          }));
        }

        // Parse result content
        const content = result.content as Array<{ type: string; text?: string }>;
        if (content && content.length > 0) {
          const first = content[0];
          if (first.type === 'text' && typeof first.text === 'string') {
            try {
              return JSON.parse(first.text) as T;
            } catch (err) {
              console.error('[MCPConnectionManager] JSON parse failed:', err);
              return first.text as unknown as T;
            }
          }
        }

        return result as unknown as T;
      } catch (error) {
        lastError = error as Error;
        const errorMsg = lastError.message || '';

        // v14.11: Only retry on transient errors (timeout, rate limit, server error)
        const isRetryable = errorMsg.includes('timed out') ||
                           errorMsg.includes('rate limit') ||
                           errorMsg.includes('429') ||
                           errorMsg.includes('503') ||
                           errorMsg.includes('ECONNRESET');

        if (!isRetryable || attempt === maxRetries - 1) {
          break; // Don't retry on permanent errors or last attempt
        }

        // Exponential backoff with jitter: 1s, 2s, 4s
        const baseDelay = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * baseDelay * 0.3;
        const delay = baseDelay + jitter;

        if (this.logCalls) {
          console.log(JSON.stringify({
            level: 'warn',
            time: Date.now(),
            msg: 'MCP call failed, retrying',
            callId,
            server,
            tool,
            attempt: attempt + 1,
            nextRetryMs: Math.round(delay),
            error: errorMsg,
          }));
        }

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // All retries failed
    const latencyMs = Math.round(performance.now() - startTime);
    const errorType = lastError?.message?.includes('timed out') ? 'timeout' : 'error';

    // v14.10: Track error metrics
    mcpCallsTotal.inc({ server, tool, status: 'error' });
    mcpLatency.observe(latencyMs / 1000, { server, tool });
    mcpErrorsTotal.inc({ server, error_type: errorType });

    // v14.10: Send alert on MCP failures (if Slack configured)
    try {
      const alerter = getAlerter();
      await alerter.warning(
        `MCP call failed: ${server}.${tool}`,
        lastError?.message || 'Unknown error',
        { labels: { server, tool, errorType, latencyMs: String(latencyMs), retries: String(maxRetries) } }
      );
    } catch (err) {
      console.error('[mcp] alerting failed:', err);
      // Don't fail main operation if alerting fails
    }

    if (this.logCalls) {
      console.log(JSON.stringify({
        level: 'error',
        time: Date.now(),
        msg: 'MCP call failed after retries',
        callId,
        server,
        tool,
        latencyMs,
        success: false,
        retries: maxRetries,
        error: lastError?.message,
      }));
    }

    throw lastError || new Error(`MCP call to ${server}.${tool} failed`);
  }

  /**
   * List available tools on an MCP server (names only)
   */
  async listTools(server: MCPServerName): Promise<string[]> {
    const connection = await this.getConnection(server);
    const result = await connection.client.listTools();
    return result.tools.map((t) => t.name);
  }

  /**
   * List available tools with full schema (for dynamic prompt building)
   */
  async listToolsWithSchema(server: MCPServerName): Promise<MCPToolDefinition[]> {
    const connection = await this.getConnection(server);
    const result = await connection.client.listTools();
    return result.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as MCPToolDefinition['inputSchema'],
    }));
  }

  /**
   * Check if a server is available (can connect)
   */
  async isAvailable(server: MCPServerName): Promise<boolean> {
    try {
      await this.getConnection(server);
      return true;
    } catch (err) {
      console.error('[MCPConnectionManager] server availability check failed:', err);
      return false;
    }
  }

  /**
   * Close connection to a server
   */
  async closeConnection(server: MCPServerName): Promise<void> {
    const connection = this.connections.get(server);
    if (connection) {
      try {
        await connection.client.close();
      } catch (err) {
        console.error('[MCPConnectionManager] close connection failed:', err);
        // Ignore close errors
      }
      connection.connected = false;
      this.connections.delete(server);
      // v14.10: Track active connections
      mcpConnectionsActive.dec();
    }
  }

  /**
   * Close all connections
   */
  async closeAll(): Promise<void> {
    const servers = Array.from(this.connections.keys());
    await Promise.all(servers.map((s) => this.closeConnection(s)));
  }

  /**
   * v7.3: Check if required API keys are set for a server
   * Returns the name of the missing key, or null if all keys are present
   */
  private checkRequiredKeys(server: MCPServerName): string | null {
    // Map of servers to their required environment variables
    const requiredKeys: Partial<Record<MCPServerName, string[]>> = {
      'wolfram': ['WOLFRAM_APP_ID'],
      'brave-search': ['BRAVE_API_KEY'],
      'exa': ['EXA_API_KEY'],
      'firecrawl': ['FIRECRAWL_API_KEY'],
      'openai': ['OPENAI_API_KEY'],
      'github': ['GITHUB_PERSONAL_ACCESS_TOKEN', 'GITHUB_TOKEN'], // Either one
      'stability-ai': ['STABILITY_AI_API_KEY'],
      'gemini': ['GOOGLE_API_KEY', 'GEMINI_API_KEY'], // Either one
      // These don't need API keys:
      // 'arxiv', 'semantic-scholar', 'context7', 'memory', 'filesystem'
    };

    const keys = requiredKeys[server];
    if (!keys) return null; // No required keys

    // For servers that accept either of multiple keys (like github, gemini)
    // Check if at least one is set
    const hasAtLeastOne = keys.some(key => !!process.env[key]);
    if (!hasAtLeastOne) {
      return keys.join(' or ');
    }

    return null; // All required keys present
  }
}

// ============================================================================
// MCP Client Interface
// ============================================================================

/**
 * MCP Tool definition with full schema (from MCP SDK)
 */
export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema?: {
    type: 'object';
    properties?: Record<string, {
      type?: string;
      description?: string;
      enum?: string[];
      items?: any;
    }>;
    required?: string[];
  };
}

export interface IMCPClient {
  call<T = any>(
    server: MCPServerName,
    tool: string,
    params: Record<string, any>,
    options?: MCPCallOptions
  ): Promise<MCPCallResult<T>>;

  listTools(server: MCPServerName): Promise<string[]>;
  listToolsWithSchema(server: MCPServerName): Promise<MCPToolDefinition[]>;
  discoverAllTools(): Promise<Record<MCPServerName, MCPToolDefinition[]>>;
  isAvailable(server: MCPServerName): Promise<boolean>;
  getMode(): MCPMode;
  setMode(mode: MCPMode): void;
  close(): Promise<void>;
}

// ============================================================================
// Real MCP Client
// ============================================================================

class RealMCPClient implements IMCPClient {
  private manager: MCPConnectionManager;
  private mode: MCPMode = 'real';
  private config: MCPClientConfig;

  constructor(config: Partial<MCPClientConfig> = {}) {
    this.config = {
      mode: 'real',
      timeout: 30000,
      logCalls: false,
      ...config,
    };
    this.mode = this.config.mode;
    this.manager = new MCPConnectionManager(this.config.timeout, this.config.logCalls);
  }

  async call<T = any>(
    server: MCPServerName,
    tool: string,
    params: Record<string, any>,
    options: MCPCallOptions = {},
    retryCount = 0
  ): Promise<MCPCallResult<T>> {
    const startTime = Date.now();
    const maxRetries = options.retries ?? 3;

    if (this.config.onCall) {
      this.config.onCall(server, tool, params);
    }

    try {
      const data = await this.manager.callTool<T>(server, tool, params);

      const result: MCPCallResult<T> = {
        success: true,
        data,
        server,
        tool,
        mode: 'real',
        latency: Date.now() - startTime,
        timestamp: new Date(),
      };

      if (this.config.onResult) {
        this.config.onResult(result);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // v14.6.4: Retry with exponential backoff for transient errors
      const isTransient = this.isTransientError(errorMessage);
      if (retryCount < maxRetries && isTransient) {
        const backoffMs = Math.min(1000 * Math.pow(2, retryCount) + Math.random() * 100, 30000);
        console.warn(`[MCP] ${server}.${tool} transient error, retry ${retryCount + 1}/${maxRetries} in ${Math.round(backoffMs)}ms`);
        await new Promise(r => setTimeout(r, backoffMs));
        return this.call<T>(server, tool, params, options, retryCount + 1);
      }

      // v7.18: Try fallback for web search tools (only on first attempt)
      if (retryCount === 0) {
        const fallback = getNextFallbackServer(server, tool);
        if (fallback) {
          console.error(`[MCP] ${server}.${tool} failed (${isRateLimitError(errorMessage) ? 'rate limit' : 'error'}), trying ${fallback.server}.${fallback.tool}...`);

          // Adapt params for the new tool if needed
          const adaptedParams = this.adaptParamsForFallback(tool, fallback.tool, params);

          return this.call<T>(fallback.server, fallback.tool, adaptedParams, options, 0);
        }
      }

      const result: MCPCallResult<T> = {
        success: false,
        error: errorMessage,
        server,
        tool,
        mode: 'real',
        latency: Date.now() - startTime,
        timestamp: new Date(),
      };

      if (this.config.onResult) {
        this.config.onResult(result);
      }

      return result;
    }
  }

  /**
   * Check if an error is transient and should be retried.
   */
  private isTransientError(errorMessage: string): boolean {
    const transientPatterns = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'socket hang up',
      '429',
      'rate limit',
      'too many requests',
      'timeout',
      'ENOTFOUND',
      'EAI_AGAIN',
      'network error',
      'connection reset',
    ];
    const lowerError = errorMessage.toLowerCase();
    return transientPatterns.some(p => lowerError.includes(p.toLowerCase()));
  }

  /**
   * Adapt parameters when falling back to a different web search provider.
   */
  private adaptParamsForFallback(
    originalTool: string,
    newTool: string,
    params: Record<string, any>
  ): Record<string, any> {
    // Exa uses slightly different param names
    if (newTool === 'web_search_exa') {
      return {
        query: params.query || params.q,
        numResults: params.count || params.numResults || 10,
      };
    }

    // Gemini web search
    if (newTool === 'web_search') {
      return {
        q: params.query || params.q,
        verbosity: 'concise',
      };
    }

    // Firecrawl search
    if (newTool === 'firecrawl_search') {
      return {
        query: params.query || params.q,
        limit: params.count || 10,
      };
    }

    return params;
  }

  async listTools(server: MCPServerName): Promise<string[]> {
    return this.manager.listTools(server);
  }

  async listToolsWithSchema(server: MCPServerName): Promise<MCPToolDefinition[]> {
    return this.manager.listToolsWithSchema(server);
  }

  async discoverAllTools(): Promise<Record<MCPServerName, MCPToolDefinition[]>> {
    const result: Record<string, MCPToolDefinition[]> = {};
    const servers = Object.keys(MCP_SERVER_REGISTRY) as MCPServerName[];

    // Discover tools from all servers in parallel
    await Promise.allSettled(
      servers.map(async (server) => {
        try {
          result[server] = await this.listToolsWithSchema(server);
        } catch (err) {
          console.error('[RealMCPClient] discover tools failed, using registry fallback:', err);
          // Server not available, use registry fallback
          result[server] = MCP_SERVER_REGISTRY[server].tools.map(name => ({ name }));
        }
      })
    );

    return result as Record<MCPServerName, MCPToolDefinition[]>;
  }

  async isAvailable(server: MCPServerName): Promise<boolean> {
    return this.manager.isAvailable(server);
  }

  getMode(): MCPMode {
    return this.mode;
  }

  setMode(mode: MCPMode): void {
    this.mode = mode;
  }

  async close(): Promise<void> {
    await this.manager.closeAll();
  }
}

// ============================================================================
// Simulated MCP Client (for testing without real servers)
// ============================================================================

class SimulatedMCPClient implements IMCPClient {
  private mode: MCPMode = 'simulated';
  private config: MCPClientConfig;

  constructor(config: Partial<MCPClientConfig> = {}) {
    this.config = {
      mode: 'simulated',
      timeout: 30000,
      logCalls: false,
      ...config,
    };
    this.mode = this.config.mode;
  }

  async call<T = any>(
    server: MCPServerName,
    tool: string,
    params: Record<string, any>,
    options: MCPCallOptions = {}
  ): Promise<MCPCallResult<T>> {
    const startTime = Date.now();

    if (this.config.onCall) {
      this.config.onCall(server, tool, params);
    }

    if (this.config.logCalls) {
      console.log(`[MCP:SIM] ${server}.${tool}(${JSON.stringify(params).slice(0, 100)}...)`);
    }

    // Simulate latency
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 150));

    const data = this.generateSimulatedResponse(server, tool, params) as T;

    const result: MCPCallResult<T> = {
      success: true,
      data,
      server,
      tool,
      mode: 'simulated',
      latency: Date.now() - startTime,
      timestamp: new Date(),
    };

    if (this.config.onResult) {
      this.config.onResult(result);
    }

    return result;
  }

  async listTools(server: MCPServerName): Promise<string[]> {
    return MCP_SERVER_REGISTRY[server]?.tools || [];
  }

  async listToolsWithSchema(server: MCPServerName): Promise<MCPToolDefinition[]> {
    // In simulated mode, return basic tool info from registry
    const tools = MCP_SERVER_REGISTRY[server]?.tools || [];
    return tools.map(name => ({
      name,
      description: `[Simulated] ${name} tool`,
    }));
  }

  async discoverAllTools(): Promise<Record<MCPServerName, MCPToolDefinition[]>> {
    const result: Record<string, MCPToolDefinition[]> = {};
    const servers = Object.keys(MCP_SERVER_REGISTRY) as MCPServerName[];

    for (const server of servers) {
      result[server] = await this.listToolsWithSchema(server);
    }

    return result as Record<MCPServerName, MCPToolDefinition[]>;
  }

  async isAvailable(server: MCPServerName): Promise<boolean> {
    return true; // Always available in simulated mode
  }

  getMode(): MCPMode {
    return this.mode;
  }

  setMode(mode: MCPMode): void {
    this.mode = mode;
  }

  async close(): Promise<void> {
    // No-op for simulated
  }

  private generateSimulatedResponse(
    server: MCPServerName,
    tool: string,
    params: Record<string, any>
  ): any {
    const query = params.query || params.q || params.input || 'query';

    switch (server) {
      case 'arxiv':
        return {
          papers: [{
            id: 'arxiv:' + randomUUID().slice(0, 8),
            title: `[SIM] Research on ${query}`,
            authors: ['Author A', 'Author B'],
            abstract: `Simulated paper about ${query}.`,
            url: `https://arxiv.org/abs/${randomUUID().slice(0, 8)}`,
          }],
          _simulated: true,
        };

      case 'semantic-scholar':
        return {
          papers: [{
            paperId: randomUUID().slice(0, 8),
            title: `[SIM] ${query} Study`,
            citationCount: Math.floor(Math.random() * 100),
          }],
          _simulated: true,
        };

      case 'brave-search':
      case 'gemini':
      case 'exa':
        return {
          results: [{
            title: `[SIM] ${query} Result`,
            url: 'https://example.com/sim',
            description: `Simulated result for ${query}`,
          }],
          _simulated: true,
        };

      case 'firecrawl':
        return {
          content: `[SIM] Scraped content for ${params.url || query}`,
          _simulated: true,
        };

      case 'memory':
        return { entities: [], relations: [], _simulated: true };

      case 'filesystem':
        return { content: `[SIM] File content`, _simulated: true };

      default:
        return { success: true, _simulated: true };
    }
  }
}

// ============================================================================
// Hybrid MCP Client
// ============================================================================

class HybridMCPClient implements IMCPClient {
  private realClient: RealMCPClient;
  private simClient: SimulatedMCPClient;
  private mode: MCPMode = 'hybrid';
  private config: MCPClientConfig;

  constructor(config: Partial<MCPClientConfig> = {}) {
    this.config = {
      mode: 'hybrid',
      timeout: 30000,
      logCalls: false,
      ...config,
    };
    this.realClient = new RealMCPClient(config);
    this.simClient = new SimulatedMCPClient(config);
  }

  async call<T = any>(
    server: MCPServerName,
    tool: string,
    params: Record<string, any>,
    options: MCPCallOptions = {}
  ): Promise<MCPCallResult<T>> {
    // Try real first
    const result = await this.realClient.call<T>(server, tool, params, options);

    // Fallback to simulated if real fails
    if (!result.success && (options.fallbackToSimulated ?? true)) {
      if (this.config.logCalls) {
        console.log(`[MCP] Real call failed, falling back to simulated: ${result.error}`);
      }
      return this.simClient.call<T>(server, tool, params, options);
    }

    return result;
  }

  async listTools(server: MCPServerName): Promise<string[]> {
    try {
      return await this.realClient.listTools(server);
    } catch (err) {
      console.error('[HybridMCPClient] list tools failed, falling back to simulated:', err);
      return this.simClient.listTools(server);
    }
  }

  async listToolsWithSchema(server: MCPServerName): Promise<MCPToolDefinition[]> {
    try {
      return await this.realClient.listToolsWithSchema(server);
    } catch (err) {
      console.error('[HybridMCPClient] list tools with schema failed, falling back to simulated:', err);
      return this.simClient.listToolsWithSchema(server);
    }
  }

  async discoverAllTools(): Promise<Record<MCPServerName, MCPToolDefinition[]>> {
    try {
      return await this.realClient.discoverAllTools();
    } catch (err) {
      console.error('[HybridMCPClient] discover all tools failed, falling back to simulated:', err);
      return this.simClient.discoverAllTools();
    }
  }

  async isAvailable(server: MCPServerName): Promise<boolean> {
    return (await this.realClient.isAvailable(server)) ||
           (await this.simClient.isAvailable(server));
  }

  getMode(): MCPMode {
    return this.mode;
  }

  setMode(mode: MCPMode): void {
    this.mode = mode;
  }

  async close(): Promise<void> {
    await this.realClient.close();
  }
}

// ============================================================================
// Factory & Singleton
// ============================================================================

function createMCPClient(config: Partial<MCPClientConfig> = {}): IMCPClient {
  // v7.0: Default changed from 'simulated' to 'real'
  const mode = (process.env.GENESIS_MCP_MODE as MCPMode) || config.mode || 'real';
  const timeout = parseInt(process.env.GENESIS_MCP_TIMEOUT || '') || config.timeout || 30000;
  const logCalls = process.env.GENESIS_MCP_LOG === 'true' || config.logCalls || false;

  const fullConfig: Partial<MCPClientConfig> = {
    ...config,
    mode,
    timeout,
    logCalls,
  };

  // Log mode for transparency
  if (logCalls) {
    console.log(`[MCP] Mode: ${mode} (timeout: ${timeout}ms)`);
  }

  switch (mode) {
    case 'real':
      return new RealMCPClient(fullConfig);
    case 'hybrid':
      return new HybridMCPClient(fullConfig);
    case 'simulated':
    default:
      return new SimulatedMCPClient(fullConfig);
  }
}

let mcpClientInstance: IMCPClient | null = null;

export function getMCPClient(config?: Partial<MCPClientConfig>): IMCPClient {
  if (!mcpClientInstance) {
    mcpClientInstance = createMCPClient(config);
  }
  return mcpClientInstance;
}

export function resetMCPClient(): void {
  if (mcpClientInstance) {
    // v9.1.0: Log errors instead of silently ignoring
    mcpClientInstance.close().catch(err => console.error('[MCP] Client close failed:', err));
  }
  mcpClientInstance = null;
}

export const mcpClient = getMCPClient();

// ============================================================================
// Utilities
// ============================================================================

export function isSimulatedMode(): boolean {
  return mcpClient.getMode() === 'simulated';
}

export function isSimulatedResult(result: MCPCallResult): boolean {
  const data = result.data as { _simulated?: boolean } | null;
  return result.mode === 'simulated' || data?._simulated === true;
}

export function logMCPMode(): void {
  const mode = mcpClient.getMode();
  const emoji = mode === 'real' ? '🔌' : mode === 'hybrid' ? '🔀' : '🎭';
  console.log(`[Genesis] MCP Mode: ${emoji} ${mode.toUpperCase()}`);
}

export { MCP_SERVER_REGISTRY };
