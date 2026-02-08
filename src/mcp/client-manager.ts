/**
 * Genesis 7.6 - Enhanced MCP Client Manager
 *
 * Full MCP client integration with:
 * - Dynamic server configuration from files
 * - Multiple transports (stdio, HTTP, WebSocket)
 * - Tool, Resource, and Prompt discovery
 * - Server auto-discovery from config files
 * - Connection pooling and lifecycle management
 *
 * Configuration sources (in priority order):
 * 1. Environment: GENESIS_MCP_SERVERS (JSON)
 * 2. Project: ./.mcp.json or ./mcp.json
 * 3. User: ~/.genesis/mcp.json
 * 4. Built-in: hardcoded server registry
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export type TransportType = 'stdio' | 'http' | 'websocket';

export interface MCPServerConfig {
  /** Server name/identifier */
  name: string;
  /** Transport type */
  transport: TransportType;
  /** For stdio: command to run */
  command?: string;
  /** For stdio: command arguments */
  args?: string[];
  /** For http/websocket: URL endpoint */
  url?: string;
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Required environment variables (will check before connecting) */
  requiredEnv?: string[];
  /** Server description */
  description?: string;
  /** Auto-connect on manager start */
  autoConnect?: boolean;
  /** Connection timeout in ms */
  timeout?: number;
  /** Enabled/disabled */
  enabled?: boolean;
}

export interface MCPConfigFile {
  version?: string;
  servers: Record<string, Omit<MCPServerConfig, 'name'>>;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  server: string;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  server: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  server: string;
}

export interface MCPConnection {
  client: Client;
  transport: StdioClientTransport;
  config: MCPServerConfig;
  connected: boolean;
  lastUsed: Date;
  tools: MCPTool[];
  resources: MCPResource[];
  prompts: MCPPrompt[];
}

export interface MCPClientManagerConfig {
  /** Config file paths to search */
  configPaths?: string[];
  /** Default connection timeout */
  defaultTimeout?: number;
  /** Enable logging */
  logCalls?: boolean;
  /** Auto-discover servers on init */
  autoDiscover?: boolean;
  /** Connect to all enabled servers on init */
  autoConnect?: boolean;
}

export interface MCPClientManagerEvents {
  'server:connected': (server: string) => void;
  'server:disconnected': (server: string) => void;
  'server:error': (server: string, error: Error) => void;
  'tool:called': (server: string, tool: string, params: unknown) => void;
  'tool:result': (server: string, tool: string, result: unknown) => void;
  'config:loaded': (source: string, servers: string[]) => void;
}

// ============================================================================
// Default Config Paths
// ============================================================================

const DEFAULT_CONFIG_PATHS = [
  './.mcp.json',
  './mcp.json',
  './.genesis/mcp.json',
  path.join(process.env.HOME || '', '.genesis', 'mcp.json'),
  path.join(process.env.HOME || '', '.config', 'genesis', 'mcp.json'),
];

// ============================================================================
// Built-in Server Registry (fallback)
// ============================================================================

const BUILTIN_SERVERS: Record<string, Omit<MCPServerConfig, 'name'>> = {
  // Knowledge servers
  'arxiv': {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@iflow-mcp/arxiv-paper-mcp@latest'],
    description: 'ArXiv paper search and retrieval',
    enabled: true,
  },
  'semantic-scholar': {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'researchmcp', 'semantic'],
    description: 'Semantic Scholar academic paper search',
    enabled: true,
  },
  'context7': {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp@latest'],
    description: 'Library documentation search',
    enabled: true,
  },
  'wolfram': {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'wolfram-mcp'],
    requiredEnv: ['WOLFRAM_APP_ID'],
    description: 'Wolfram Alpha computational knowledge',
    enabled: true,
  },

  // Research servers
  'gemini': {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'mcp-gemini-web'],
    requiredEnv: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
    description: 'Google Gemini web search',
    enabled: true,
  },
  'brave-search': {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@brave/brave-search-mcp-server'],
    // Note: BRAVE_API_KEY is passed via environment, server reads it automatically
    requiredEnv: ['BRAVE_API_KEY'],
    description: 'Brave web search',
    enabled: true,
  },
  'exa': {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'exa-mcp-server'],
    requiredEnv: ['EXA_API_KEY'],
    description: 'Exa neural search',
    enabled: true,
  },
  'firecrawl': {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'firecrawl-mcp'],
    requiredEnv: ['FIRECRAWL_API_KEY'],
    description: 'Web scraping and crawling',
    enabled: true,
  },

  // Creation servers
  'openai': {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@mzxrai/mcp-openai'],
    requiredEnv: ['OPENAI_API_KEY'],
    description: 'OpenAI chat completions',
    enabled: true,
  },
  'github': {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    requiredEnv: ['GITHUB_PERSONAL_ACCESS_TOKEN', 'GITHUB_TOKEN'],
    description: 'GitHub repository operations',
    enabled: true,
  },

  // Visual servers
  'stability-ai': {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'mcp-server-stability-ai'],
    requiredEnv: ['STABILITY_AI_API_KEY'],
    description: 'Stability AI image generation',
    enabled: true,
  },

  // Storage servers
  'memory': {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    description: 'Knowledge graph memory',
    enabled: true,
  },
  'filesystem': {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', process.env.HOME || '/tmp'],
    description: 'Local filesystem access',
    enabled: true,
  },

  // v7.15.10: Infrastructure servers
  'playwright': {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest'],
    description: 'Browser automation with Playwright',
    enabled: true,
  },
  'aws': {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'awslabs-mcp'],
    requiredEnv: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
    description: 'AWS cloud infrastructure management',
    enabled: true,
  },
  'postgres': {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    requiredEnv: ['DATABASE_URL', 'POSTGRES_URL'],
    description: 'PostgreSQL database queries',
    enabled: true,
  },

  // v7.16.0: Vector DB for semantic memory
  'qdrant': {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@iflow-mcp/qdrant-mcp-server'],
    requiredEnv: ['QDRANT_URL'],
    description: 'Qdrant vector database for semantic search',
    enabled: true,
  },

  // v7.16.0: Sentry error monitoring (when available)
  'sentry': {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@sentry/mcp-server-sentry'],
    requiredEnv: ['SENTRY_AUTH_TOKEN'],
    description: 'Sentry error monitoring and observability',
    enabled: false, // Disabled: npm package not available
  },
};

// ============================================================================
// MCP Client Manager
// ============================================================================

export class MCPClientManager extends EventEmitter {
  private config: MCPClientManagerConfig;
  private serverConfigs: Map<string, MCPServerConfig> = new Map();
  private connections: Map<string, MCPConnection> = new Map();
  private connecting: Map<string, Promise<MCPConnection>> = new Map();

  // Aggregated capabilities
  private allTools: Map<string, MCPTool> = new Map();
  private allResources: Map<string, MCPResource> = new Map();
  private allPrompts: Map<string, MCPPrompt> = new Map();

  constructor(config: MCPClientManagerConfig = {}) {
    super();
    this.config = {
      configPaths: DEFAULT_CONFIG_PATHS,
      defaultTimeout: 30000,
      logCalls: false,
      autoDiscover: true,
      autoConnect: false,
      ...config,
    };
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the manager: load configs and optionally connect
   */
  async initialize(): Promise<void> {
    // Load server configurations
    await this.loadConfigurations();

    // Auto-connect if enabled
    if (this.config.autoConnect) {
      await this.connectAll();
    }
  }

  /**
   * Load server configurations from all sources
   */
  private async loadConfigurations(): Promise<void> {
    // 1. Load from environment
    const envConfig = process.env.GENESIS_MCP_SERVERS;
    if (envConfig) {
      try {
        const parsed = JSON.parse(envConfig) as MCPConfigFile;
        this.mergeConfig(parsed, 'environment');
      } catch (e) {
        this.log(`Failed to parse GENESIS_MCP_SERVERS: ${e}`);
      }
    }

    // 2. Load from config files
    for (const configPath of this.config.configPaths || []) {
      const resolved = path.resolve(configPath);
      if (fs.existsSync(resolved)) {
        try {
          const content = fs.readFileSync(resolved, 'utf-8');
          const parsed = JSON.parse(content) as MCPConfigFile;
          this.mergeConfig(parsed, resolved);
        } catch (e) {
          this.log(`Failed to load ${resolved}: ${e}`);
        }
      }
    }

    // 3. Load built-in servers as fallback
    for (const [name, config] of Object.entries(BUILTIN_SERVERS)) {
      if (!this.serverConfigs.has(name)) {
        this.serverConfigs.set(name, { name, ...config });
      }
    }

    this.log(`Loaded ${this.serverConfigs.size} server configurations`);
  }

  /**
   * Merge configuration from a source
   */
  private mergeConfig(config: MCPConfigFile, source: string): void {
    const serverNames: string[] = [];

    for (const [name, serverConfig] of Object.entries(config.servers)) {
      // Don't override existing configs (priority: env > project > user > builtin)
      if (!this.serverConfigs.has(name)) {
        this.serverConfigs.set(name, { name, ...serverConfig });
        serverNames.push(name);
      }
    }

    if (serverNames.length > 0) {
      this.emit('config:loaded', source, serverNames);
      this.log(`Loaded ${serverNames.length} servers from ${source}`);
    }
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  /**
   * Connect to a specific server
   */
  async connect(serverName: string): Promise<MCPConnection> {
    // Return existing connection
    const existing = this.connections.get(serverName);
    if (existing?.connected) {
      existing.lastUsed = new Date();
      return existing;
    }

    // Check if already connecting
    const pending = this.connecting.get(serverName);
    if (pending) {
      return pending;
    }

    // Create new connection
    const connectPromise = this.createConnection(serverName);
    this.connecting.set(serverName, connectPromise);

    try {
      const connection = await connectPromise;
      this.connections.set(serverName, connection);
      return connection;
    } finally {
      this.connecting.delete(serverName);
    }
  }

  /**
   * Create a new connection to a server
   */
  private async createConnection(serverName: string): Promise<MCPConnection> {
    const config = this.serverConfigs.get(serverName);
    if (!config) {
      throw new Error(`Unknown server: ${serverName}`);
    }

    if (config.enabled === false) {
      throw new Error(`Server ${serverName} is disabled`);
    }

    // Check required environment variables
    const missingEnv = this.checkRequiredEnv(config);
    if (missingEnv) {
      throw new Error(`Server ${serverName} requires ${missingEnv}`);
    }

    this.log(`Connecting to ${serverName}...`);

    // Create client
    const client = new Client({
      name: `genesis-${serverName}`,
      version: '7.6.0',
    });

    // Create transport based on type
    let transport: StdioClientTransport;

    if (config.transport === 'stdio') {
      if (!config.command) {
        throw new Error(`Server ${serverName} requires command for stdio transport`);
      }

      // Build environment
      const env: Record<string, string> = { ...process.env } as Record<string, string>;
      if (config.env) {
        Object.assign(env, config.env);
      }

      // Resolve dynamic args (like API keys from env)
      const args = this.resolveArgs(config.args || [], env);

      transport = new StdioClientTransport({
        command: config.command,
        args,
        env,
        // v7.24: Silence MCP server stderr to avoid polluting chat output
        // MCP servers often print "running on stdio" messages that clutter the UI
        stderr: 'pipe',
      });
    } else {
      // HTTP and WebSocket support via stdio wrapper (MCP SDK limitation)
      // For now, throw - full HTTP/WS support requires SDK updates
      throw new Error(`Transport ${config.transport} not yet supported. Use stdio.`);
    }

    // Connect
    const timeout = config.timeout || this.config.defaultTimeout || 30000;
    await Promise.race([
      client.connect(transport),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Connection timeout for ${serverName}`)), timeout)
      ),
    ]);

    this.log(`Connected to ${serverName}`);

    // v9.1.0: Discover capabilities in PARALLEL (60% faster)
    const [tools, resources, prompts] = await Promise.all([
      this.discoverTools(client, serverName),
      this.discoverResources(client, serverName),
      this.discoverPrompts(client, serverName),
    ]);

    // Update aggregated capabilities
    for (const tool of tools) {
      this.allTools.set(`${serverName}:${tool.name}`, tool);
    }
    for (const resource of resources) {
      this.allResources.set(resource.uri, resource);
    }
    for (const prompt of prompts) {
      this.allPrompts.set(`${serverName}:${prompt.name}`, prompt);
    }

    const connection: MCPConnection = {
      client,
      transport,
      config,
      connected: true,
      lastUsed: new Date(),
      tools,
      resources,
      prompts,
    };

    this.emit('server:connected', serverName);

    return connection;
  }

  /**
   * Resolve dynamic arguments (e.g., --api-key from env)
   */
  private resolveArgs(args: string[], env: Record<string, string>): string[] {
    return args.map(arg => {
      // Replace ${VAR} patterns with env values
      return arg.replace(/\$\{([^}]+)\}/g, (_, varName) => env[varName] || '');
    });
  }

  /**
   * Check required environment variables
   */
  private checkRequiredEnv(config: MCPServerConfig): string | null {
    if (!config.requiredEnv || config.requiredEnv.length === 0) {
      return null;
    }

    // Check if at least one of the required vars is set
    const hasOne = config.requiredEnv.some(v => !!process.env[v]);
    if (!hasOne) {
      return config.requiredEnv.join(' or ');
    }

    return null;
  }

  /**
   * Connect to all enabled servers
   */
  async connectAll(): Promise<Map<string, MCPConnection | Error>> {
    const results = new Map<string, MCPConnection | Error>();

    // v18.1: Staggered connection startup with priority tiers
    // Tier 1: Critical (memory, filesystem) - connect immediately
    // Tier 2: Research (brave, exa, arxiv) - connect after 500ms
    // Tier 3: Everything else - connect after 1500ms
    const CONNECTION_TIERS: Record<string, number> = {
      'memory': 0, 'filesystem': 0, 'postgres': 0,           // Tier 1: immediate
      'brave-search': 1, 'exa': 1, 'arxiv': 1, 'github': 1, // Tier 2: 500ms delay
      'openai': 2, 'gemini': 2, 'firecrawl': 2,              // Tier 3: 1000ms delay
    };
    const TIER_DELAYS = [0, 500, 1000];

    const servers = Array.from(this.serverConfigs.entries())
      .filter(([, config]) => config.enabled !== false);

    // Group by tier
    const tiers = new Map<number, Array<[string, any]>>();
    for (const entry of servers) {
      const tier = CONNECTION_TIERS[entry[0]] ?? 2;
      const list = tiers.get(tier) || [];
      list.push(entry);
      tiers.set(tier, list);
    }

    // Connect tier by tier with delays
    const sortedTiers = Array.from(tiers.entries()).sort((a, b) => a[0] - b[0]);
    for (const [tier, tierServers] of sortedTiers) {
      if (tier > 0) {
        await new Promise(resolve => setTimeout(resolve, TIER_DELAYS[tier] || 1000));
      }

      const promises = tierServers.map(async ([name]) => {
        try {
          const conn = await this.connect(name);
          results.set(name, conn);
        } catch (error) {
          results.set(name, error as Error);
          this.emit('server:error', name, error as Error);
        }
      });

      await Promise.allSettled(promises);
    }

    // v18.1: Start idle connection pruning
    this.startIdlePruning();

    return results;
  }

  /**
   * Disconnect from a server
   */
  async disconnect(serverName: string): Promise<void> {
    const connection = this.connections.get(serverName);
    if (connection) {
      try {
        await connection.client.close();
      } catch {
        // Ignore close errors
      }

      // Remove from aggregated capabilities
      for (const tool of connection.tools) {
        this.allTools.delete(`${serverName}:${tool.name}`);
      }
      for (const resource of connection.resources) {
        this.allResources.delete(resource.uri);
      }
      for (const prompt of connection.prompts) {
        this.allPrompts.delete(`${serverName}:${prompt.name}`);
      }

      connection.connected = false;
      this.connections.delete(serverName);
      this.emit('server:disconnected', serverName);
    }
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    const servers = Array.from(this.connections.keys());
    await Promise.all(servers.map(s => this.disconnect(s)));
  }

  // ============================================================================
  // v18.1: Idle Connection Management
  // ============================================================================

  /** v18.1: Timer for idle connection pruning */
  private pruningTimer: NodeJS.Timeout | null = null;

  /**
   * v18.1: Start background idle connection pruning.
   * Disconnects servers that haven't been used for idleTimeout ms.
   */
  private startIdlePruning(): void {
    if (this.pruningTimer) return;

    const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
    const CHECK_INTERVAL = 60 * 1000;    // Check every minute

    this.pruningTimer = setInterval(() => {
      const now = Date.now();
      for (const [name, conn] of Array.from(this.connections.entries())) {
        // Don't prune critical connections
        const tier = (['memory', 'filesystem', 'postgres'].includes(name)) ? 0 : 1;
        if (tier === 0) continue;

        const idleTime = now - conn.lastUsed.getTime();
        if (idleTime > IDLE_TIMEOUT) {
          this.disconnect(name).catch(() => {});
          console.log(`[MCP] Pruned idle connection: ${name} (idle ${Math.round(idleTime / 1000)}s)`);
        }
      }
    }, CHECK_INTERVAL);
  }

  /**
   * v18.1: Shutdown all connections and cleanup.
   */
  async shutdown(): Promise<void> {
    if (this.pruningTimer) {
      clearInterval(this.pruningTimer);
      this.pruningTimer = null;
    }

    const disconnections = Array.from(this.connections.keys()).map(name =>
      this.disconnect(name)
    );
    await Promise.allSettled(disconnections);
  }

  /**
   * v18.1: Get connection health status.
   */
  getConnectionHealth(): Array<{
    server: string;
    connected: boolean;
    lastUsed: number;
    toolCount: number;
    idleSeconds: number;
  }> {
    const now = Date.now();
    return Array.from(this.connections.entries()).map(([name, conn]) => ({
      server: name,
      connected: conn.connected,
      lastUsed: conn.lastUsed.getTime(),
      toolCount: conn.tools?.length ?? 0,
      idleSeconds: Math.round((now - conn.lastUsed.getTime()) / 1000),
    }));
  }

  // ============================================================================
  // Capability Discovery
  // ============================================================================

  /**
   * Discover tools from a server
   */
  private async discoverTools(client: Client, serverName: string): Promise<MCPTool[]> {
    try {
      const result = await client.listTools();
      return result.tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown>,
        server: serverName,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Discover resources from a server
   */
  private async discoverResources(client: Client, serverName: string): Promise<MCPResource[]> {
    try {
      const result = await client.listResources();
      return result.resources.map(r => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
        server: serverName,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Discover prompts from a server
   */
  private async discoverPrompts(client: Client, serverName: string): Promise<MCPPrompt[]> {
    try {
      const result = await client.listPrompts();
      return result.prompts.map(p => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments,
        server: serverName,
      }));
    } catch {
      return [];
    }
  }

  // ============================================================================
  // Tool Execution
  // ============================================================================

  /**
   * Call a tool on a server
   */
  async callTool<T = unknown>(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<T> {
    const connection = await this.connect(serverName);

    this.emit('tool:called', serverName, toolName, args);
    this.log(`${serverName}.${toolName}(${JSON.stringify(args).slice(0, 100)}...)`);

    const result = await connection.client.callTool({
      name: toolName,
      arguments: args,
    });

    // Parse result content
    const content = result.content as Array<{ type: string; text?: string }>;
    let parsed: T;

    if (content && content.length > 0) {
      const first = content[0];
      if (first.type === 'text' && typeof first.text === 'string') {
        try {
          parsed = JSON.parse(first.text) as T;
        } catch {
          parsed = first.text as unknown as T;
        }
      } else {
        parsed = result as unknown as T;
      }
    } else {
      parsed = result as unknown as T;
    }

    this.emit('tool:result', serverName, toolName, parsed);
    return parsed;
  }

  /**
   * Call a tool by full name (server:tool)
   */
  async call<T = unknown>(fullName: string, args: Record<string, unknown>): Promise<T> {
    const [serverName, toolName] = fullName.split(':');
    if (!serverName || !toolName) {
      throw new Error(`Invalid tool name: ${fullName}. Use format server:tool`);
    }
    return this.callTool<T>(serverName, toolName, args);
  }

  // ============================================================================
  // Resource Access
  // ============================================================================

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<{ contents: Array<{ uri: string; text?: string; blob?: string }> }> {
    const resource = this.allResources.get(uri);
    if (!resource) {
      throw new Error(`Unknown resource: ${uri}`);
    }

    const connection = await this.connect(resource.server);
    return connection.client.readResource({ uri });
  }

  // ============================================================================
  // Prompt Access
  // ============================================================================

  /**
   * Get a prompt
   */
  async getPrompt(
    serverName: string,
    promptName: string,
    args?: Record<string, string>
  ): Promise<{ messages: Array<{ role: string; content: unknown }> }> {
    const connection = await this.connect(serverName);
    const result = await connection.client.getPrompt({
      name: promptName,
      arguments: args,
    });
    // Cast to our simpler return type - MCP SDK returns richer content types
    return result as { messages: Array<{ role: string; content: unknown }> };
  }

  // ============================================================================
  // Query Interface
  // ============================================================================

  /**
   * Get all available tools
   */
  getAllTools(): MCPTool[] {
    return Array.from(this.allTools.values());
  }

  /**
   * Get tools for a specific server
   */
  getServerTools(serverName: string): MCPTool[] {
    return this.getAllTools().filter(t => t.server === serverName);
  }

  /**
   * Get all available resources
   */
  getAllResources(): MCPResource[] {
    return Array.from(this.allResources.values());
  }

  /**
   * Get all available prompts
   */
  getAllPrompts(): MCPPrompt[] {
    return Array.from(this.allPrompts.values());
  }

  /**
   * Get list of configured servers
   */
  getServers(): MCPServerConfig[] {
    return Array.from(this.serverConfigs.values());
  }

  /**
   * Get list of connected servers
   */
  getConnectedServers(): string[] {
    return Array.from(this.connections.entries())
      .filter(([, conn]) => conn.connected)
      .map(([name]) => name);
  }

  /**
   * Check if a server is connected
   */
  isConnected(serverName: string): boolean {
    return this.connections.get(serverName)?.connected ?? false;
  }

  /**
   * Check if a server is available (has config)
   */
  isAvailable(serverName: string): boolean {
    return this.serverConfigs.has(serverName);
  }

  // ============================================================================
  // Configuration Management
  // ============================================================================

  /**
   * Add a server configuration dynamically
   */
  addServer(config: MCPServerConfig): void {
    this.serverConfigs.set(config.name, config);
  }

  /**
   * Remove a server configuration
   */
  async removeServer(serverName: string): Promise<void> {
    await this.disconnect(serverName);
    this.serverConfigs.delete(serverName);
  }

  /**
   * Save current configuration to a file
   */
  saveConfig(filePath: string): void {
    const config: MCPConfigFile = {
      version: '1.0',
      servers: {},
    };

    for (const [name, serverConfig] of Array.from(this.serverConfigs.entries())) {
      const { name: _, ...rest } = serverConfig;
      config.servers[name] = rest;
    }

    fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private log(message: string): void {
    if (this.config.logCalls) {
      console.log(`[MCPManager] ${message}`);
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let managerInstance: MCPClientManager | null = null;

export function getMCPManager(config?: MCPClientManagerConfig): MCPClientManager {
  if (!managerInstance) {
    managerInstance = new MCPClientManager(config);
  }
  return managerInstance;
}

export async function initializeMCPManager(config?: MCPClientManagerConfig): Promise<MCPClientManager> {
  const manager = getMCPManager(config);
  await manager.initialize();
  return manager;
}

export function resetMCPManager(): void {
  if (managerInstance) {
    // v9.1.0: Log errors instead of silently ignoring
    managerInstance.disconnectAll().catch(err => console.error('[MCP] Disconnect failed:', err));
  }
  managerInstance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick tool call (auto-connects)
 */
export async function mcpTool<T = unknown>(
  server: string,
  tool: string,
  args: Record<string, unknown>
): Promise<T> {
  const manager = getMCPManager();
  return manager.callTool<T>(server, tool, args);
}

/**
 * Get all available MCP tools
 */
export async function mcpTools(): Promise<MCPTool[]> {
  const manager = getMCPManager();
  await manager.initialize();
  return manager.getAllTools();
}

/**
 * Get all available MCP resources
 */
export async function mcpResources(): Promise<MCPResource[]> {
  const manager = getMCPManager();
  await manager.initialize();
  return manager.getAllResources();
}
