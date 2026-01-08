/**
 * Genesis 6.0 - Real MCP Client Module
 *
 * Connects to actual MCP servers using @modelcontextprotocol/sdk.
 * Spawns servers on demand and manages connections.
 *
 * Environment Variables:
 * - GENESIS_MCP_MODE: 'real' | 'simulated' | 'hybrid' (default: 'simulated')
 * - GENESIS_MCP_TIMEOUT: Timeout in ms (default: 30000)
 * - GENESIS_MCP_LOG: Enable MCP call logging (default: false)
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCPServerName } from '../types.js';
import { randomUUID } from 'crypto';

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
  args: string[];
  envVars?: Record<string, string>;
  tools: string[];
}

/**
 * Registry of MCP servers and how to spawn them.
 * These are the 13 MCP servers Genesis uses.
 *
 * Package sources (verified on npm):
 * - Official: @modelcontextprotocol/server-*
 * - Third-party: arxiv-mcp-server, @brave/brave-search-mcp-server, etc.
 */
const MCP_SERVER_REGISTRY: Record<MCPServerName, MCPServerInfo> = {
  // KNOWLEDGE
  'arxiv': {
    command: 'npx',
    args: ['-y', 'arxiv-mcp-server'],
    tools: ['search_papers', 'get_paper', 'download_pdf'],
  },
  'semantic-scholar': {
    command: 'npx',
    args: ['-y', 'semantic-scholar-mcp'],
    envVars: { SEMANTIC_SCHOLAR_API_KEY: process.env.SEMANTIC_SCHOLAR_API_KEY || '' },
    tools: ['search_papers', 'get_paper', 'get_citations'],
  },
  'context7': {
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp'],
    tools: ['resolve-library-id', 'query-docs'],
  },
  'wolfram': {
    command: 'npx',
    args: ['-y', 'wolfram-mcp'],
    envVars: { WOLFRAM_APP_ID: process.env.WOLFRAM_APP_ID || '' },
    tools: ['query'],
  },

  // RESEARCH
  'gemini': {
    command: 'npx',
    args: ['-y', 'gemini-mcp'],
    envVars: { GEMINI_API_KEY: process.env.GEMINI_API_KEY || '' },
    tools: ['generate', 'chat'],
  },
  'brave-search': {
    command: 'npx',
    args: ['-y', '@brave/brave-search-mcp-server'],
    envVars: { BRAVE_API_KEY: process.env.BRAVE_API_KEY || '' },
    tools: ['brave_web_search', 'brave_local_search', 'brave_news_search', 'brave_image_search', 'brave_video_search'],
  },
  'exa': {
    command: 'npx',
    args: ['-y', 'exa-mcp-server'],
    envVars: { EXA_API_KEY: process.env.EXA_API_KEY || '' },
    tools: ['web_search_exa', 'get_code_context_exa'],
  },
  'firecrawl': {
    command: 'npx',
    args: ['-y', 'firecrawl-mcp'],
    envVars: { FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY || '' },
    tools: ['firecrawl_scrape', 'firecrawl_search', 'firecrawl_map', 'firecrawl_crawl'],
  },

  // CREATION
  'openai': {
    command: 'npx',
    args: ['-y', '@robinson_ai_systems/openai-mcp'],
    envVars: { OPENAI_API_KEY: process.env.OPENAI_API_KEY || '' },
    tools: ['chat', 'complete', 'embedding'],
  },
  'github': {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    envVars: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN || '' },
    tools: ['create_repository', 'search_repositories', 'create_issue', 'create_pull_request', 'get_file_contents'],
  },

  // VISUAL
  'stability-ai': {
    command: 'npx',
    args: ['-y', 'stability-ai-mcp'],
    envVars: { STABILITY_API_KEY: process.env.STABILITY_API_KEY || '' },
    tools: ['generate_image', 'upscale', 'edit_image'],
  },

  // STORAGE
  'memory': {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    tools: ['create_entities', 'create_relations', 'search_nodes', 'read_graph', 'add_observations'],
  },
  'filesystem': {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', process.env.HOME || '/tmp'],
    tools: ['read_file', 'read_text_file', 'write_file', 'list_directory', 'search_files', 'create_directory'],
  },
};

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

    if (this.logCalls) {
      console.log(`[MCP] Spawning ${server}: ${serverInfo.command} ${serverInfo.args.join(' ')}`);
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
    if (serverInfo.envVars) {
      Object.assign(env, serverInfo.envVars);
    }

    const transport = new StdioClientTransport({
      command: serverInfo.command,
      args: serverInfo.args,
      env,
    });

    await client.connect(transport);

    if (this.logCalls) {
      console.log(`[MCP] Connected to ${server}`);
    }

    return {
      client,
      transport,
      connected: true,
      lastUsed: new Date(),
    };
  }

  /**
   * Call a tool on an MCP server
   */
  async callTool<T = any>(
    server: MCPServerName,
    tool: string,
    args: Record<string, any>
  ): Promise<T> {
    const connection = await this.getConnection(server);

    if (this.logCalls) {
      console.log(`[MCP] ${server}.${tool}(${JSON.stringify(args).slice(0, 100)}...)`);
    }

    const result = await connection.client.callTool({
      name: tool,
      arguments: args,
    });

    // Parse result content
    const content = result.content as Array<{ type: string; text?: string }>;
    if (content && content.length > 0) {
      const first = content[0];
      if (first.type === 'text' && typeof first.text === 'string') {
        try {
          return JSON.parse(first.text) as T;
        } catch {
          return first.text as unknown as T;
        }
      }
    }

    return result as unknown as T;
  }

  /**
   * List available tools on an MCP server
   */
  async listTools(server: MCPServerName): Promise<string[]> {
    const connection = await this.getConnection(server);
    const result = await connection.client.listTools();
    return result.tools.map((t) => t.name);
  }

  /**
   * Check if a server is available (can connect)
   */
  async isAvailable(server: MCPServerName): Promise<boolean> {
    try {
      await this.getConnection(server);
      return true;
    } catch {
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
      } catch {
        // Ignore close errors
      }
      connection.connected = false;
      this.connections.delete(server);
    }
  }

  /**
   * Close all connections
   */
  async closeAll(): Promise<void> {
    const servers = Array.from(this.connections.keys());
    await Promise.all(servers.map((s) => this.closeConnection(s)));
  }
}

// ============================================================================
// MCP Client Interface
// ============================================================================

export interface IMCPClient {
  call<T = any>(
    server: MCPServerName,
    tool: string,
    params: Record<string, any>,
    options?: MCPCallOptions
  ): Promise<MCPCallResult<T>>;

  listTools(server: MCPServerName): Promise<string[]>;
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
    options: MCPCallOptions = {}
  ): Promise<MCPCallResult<T>> {
    const startTime = Date.now();

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
      const result: MCPCallResult<T> = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
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

  async listTools(server: MCPServerName): Promise<string[]> {
    return this.manager.listTools(server);
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
    } catch {
      return this.simClient.listTools(server);
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
  const mode = (process.env.GENESIS_MCP_MODE as MCPMode) || config.mode || 'simulated';
  const timeout = parseInt(process.env.GENESIS_MCP_TIMEOUT || '') || config.timeout || 30000;
  const logCalls = process.env.GENESIS_MCP_LOG === 'true' || config.logCalls || false;

  const fullConfig: Partial<MCPClientConfig> = {
    ...config,
    mode,
    timeout,
    logCalls,
  };

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
    mcpClientInstance.close().catch(() => {});
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
  return result.mode === 'simulated' || (result.data as any)?._simulated === true;
}

export function logMCPMode(): void {
  const mode = mcpClient.getMode();
  const emoji = mode === 'real' ? '🔌' : mode === 'hybrid' ? '🔀' : '🎭';
  console.log(`[Genesis] MCP Mode: ${emoji} ${mode.toUpperCase()}`);
}

export { MCP_SERVER_REGISTRY };
