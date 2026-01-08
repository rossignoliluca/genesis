/**
 * Genesis 6.0 - MCP Client Module
 *
 * Provides unified interface for calling MCP servers.
 * Supports both real and simulated modes.
 *
 * Environment Variables:
 * - GENESIS_MCP_MODE: 'real' | 'simulated' | 'hybrid' (default: 'simulated')
 * - GENESIS_MCP_TIMEOUT: Timeout in ms (default: 30000)
 * - GENESIS_MCP_LOG: Enable MCP call logging (default: false)
 *
 * Usage:
 * ```typescript
 * import { mcpClient } from './mcp/index.js';
 *
 * const result = await mcpClient.call('arxiv', 'search_arxiv', { query: 'AI' });
 * ```
 */

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
  capability: string;
  mode: 'real' | 'simulated';
  latency: number;
  timestamp: Date;
}

export interface MCPClientConfig {
  mode: MCPMode;
  timeout: number;
  logCalls: boolean;
  onCall?: (server: MCPServerName, capability: string, params: any) => void;
  onResult?: (result: MCPCallResult) => void;
}

// ============================================================================
// MCP Client Interface
// ============================================================================

export interface IMCPClient {
  call<T = any>(
    server: MCPServerName,
    capability: string,
    params: Record<string, any>,
    options?: MCPCallOptions
  ): Promise<MCPCallResult<T>>;

  isAvailable(server: MCPServerName): Promise<boolean>;
  getMode(): MCPMode;
  setMode(mode: MCPMode): void;
}

// ============================================================================
// Simulated MCP Client
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
    capability: string,
    params: Record<string, any>,
    options: MCPCallOptions = {}
  ): Promise<MCPCallResult<T>> {
    const startTime = Date.now();

    if (this.config.onCall) {
      this.config.onCall(server, capability, params);
    }

    if (this.config.logCalls) {
      console.log(`[MCP] ${server}.${capability}(${JSON.stringify(params).slice(0, 100)}...)`);
    }

    try {
      // Simulate network latency (50-200ms)
      await this.simulateLatency(50, 200);

      const data = this.generateSimulatedResponse(server, capability, params) as T;

      const result: MCPCallResult<T> = {
        success: true,
        data,
        server,
        capability,
        mode: 'simulated',
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
        capability,
        mode: 'simulated',
        latency: Date.now() - startTime,
        timestamp: new Date(),
      };

      if (this.config.onResult) {
        this.config.onResult(result);
      }

      return result;
    }
  }

  async isAvailable(server: MCPServerName): Promise<boolean> {
    // In simulated mode, all servers are always available
    return true;
  }

  getMode(): MCPMode {
    return this.mode;
  }

  setMode(mode: MCPMode): void {
    this.mode = mode;
  }

  private async simulateLatency(min: number, max: number): Promise<void> {
    const delay = min + Math.random() * (max - min);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  private generateSimulatedResponse(
    server: MCPServerName,
    capability: string,
    params: Record<string, any>
  ): any {
    // Simulated responses for each MCP server
    switch (server) {
      // ========== KNOWLEDGE MCPs ==========
      case 'arxiv':
        if (capability === 'search_arxiv' || capability === 'search_papers') {
          return {
            papers: [{
              id: 'arxiv:' + randomUUID().slice(0, 8),
              title: `[SIMULATED] Research on ${params.query || 'AI'}`,
              authors: ['Simulated Author A', 'Simulated Author B'],
              abstract: `This is a simulated paper abstract about ${params.query || 'artificial intelligence'}.`,
              published: new Date().toISOString(),
              url: `https://arxiv.org/abs/${randomUUID().slice(0, 8)}`,
            }],
            _simulated: true,
          };
        }
        if (capability === 'get_recent_ai_papers') {
          return {
            papers: [{
              id: 'arxiv:' + randomUUID().slice(0, 8),
              title: '[SIMULATED] Latest Advances in Neural Networks',
              authors: ['AI Researcher'],
              abstract: 'Simulated recent AI paper.',
            }],
            _simulated: true,
          };
        }
        break;

      case 'semantic-scholar':
        return {
          papers: [{
            paperId: randomUUID().slice(0, 8),
            title: `[SIMULATED] ${params.query || 'Research'} Study`,
            authors: [{ name: 'Simulated Researcher' }],
            citationCount: Math.floor(Math.random() * 100),
            year: 2024,
          }],
          _simulated: true,
        };

      case 'context7':
        if (capability === 'resolve-library-id' || capability === 'resolve_library') {
          return {
            libraryId: `/simulated/${params.libraryName || 'library'}`,
            name: params.libraryName || 'library',
            _simulated: true,
          };
        }
        if (capability === 'query-docs' || capability === 'query_docs') {
          return {
            content: `[SIMULATED] Documentation for ${params.query || 'query'}:\n\nThis is simulated documentation content.`,
            _simulated: true,
          };
        }
        break;

      case 'wolfram':
        return {
          result: `[SIMULATED] Wolfram result for: ${params.query}`,
          pods: [{
            title: 'Result',
            subpods: [{ plaintext: 'Simulated calculation result' }],
          }],
          _simulated: true,
        };

      // ========== RESEARCH MCPs ==========
      case 'gemini':
        return {
          results: [{
            title: `[SIMULATED] ${params.q || params.query || 'Search'} Result`,
            url: 'https://example.com/simulated',
            snippet: 'This is a simulated Gemini search result.',
          }],
          _simulated: true,
        };

      case 'brave-search':
        return {
          web: {
            results: [{
              title: `[SIMULATED] ${params.query} - Brave Search`,
              url: 'https://example.com/brave-simulated',
              description: 'Simulated Brave search result.',
            }],
          },
          _simulated: true,
        };

      case 'exa':
        return {
          results: [{
            title: `[SIMULATED] ${params.query} - Exa`,
            url: 'https://example.com/exa-simulated',
            text: 'Simulated Exa search result content.',
          }],
          _simulated: true,
        };

      case 'firecrawl':
        if (capability === 'firecrawl_scrape' || capability === 'scrape') {
          return {
            content: `[SIMULATED] Scraped content from ${params.url}`,
            markdown: '# Simulated Page\n\nThis is simulated scraped content.',
            _simulated: true,
          };
        }
        if (capability === 'firecrawl_search' || capability === 'search') {
          return {
            results: [{
              url: 'https://example.com/firecrawl-simulated',
              title: `[SIMULATED] ${params.query}`,
              content: 'Simulated Firecrawl search result.',
            }],
            _simulated: true,
          };
        }
        break;

      // ========== CREATION MCPs ==========
      case 'openai':
        return {
          choices: [{
            message: {
              role: 'assistant',
              content: `[SIMULATED] Response for: ${params.messages?.[0]?.content || params.prompt || 'request'}`,
            },
          }],
          model: params.model || 'gpt-4o',
          _simulated: true,
        };

      case 'github':
        if (capability.includes('create_repo') || capability.includes('repository')) {
          return {
            success: true,
            url: `https://github.com/simulated/${params.name || 'repo'}`,
            _simulated: true,
          };
        }
        if (capability.includes('search')) {
          return {
            items: [{
              name: 'simulated-repo',
              full_name: 'user/simulated-repo',
              html_url: 'https://github.com/user/simulated-repo',
            }],
            _simulated: true,
          };
        }
        return { success: true, _simulated: true };

      case 'stability-ai':
        return {
          images: [{
            base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            seed: Math.floor(Math.random() * 1000000),
          }],
          prompt: params.prompt,
          _simulated: true,
        };

      // ========== STORAGE MCPs ==========
      case 'memory':
        if (capability.includes('create')) {
          return { success: true, created: params.entities?.length || 1, _simulated: true };
        }
        if (capability.includes('search') || capability.includes('read')) {
          return {
            entities: [],
            relations: [],
            _simulated: true,
          };
        }
        return { success: true, _simulated: true };

      case 'filesystem':
        if (capability.includes('read')) {
          return {
            content: `[SIMULATED] Content of ${params.path}`,
            _simulated: true,
          };
        }
        if (capability.includes('write')) {
          return { success: true, path: params.path, _simulated: true };
        }
        if (capability.includes('list')) {
          return {
            entries: [
              { name: 'simulated-file.txt', type: 'file' },
              { name: 'simulated-dir', type: 'directory' },
            ],
            _simulated: true,
          };
        }
        return { success: true, _simulated: true };

      default:
        return {
          success: true,
          server,
          capability,
          params,
          _simulated: true,
        };
    }

    // Default fallback
    return {
      success: true,
      server,
      capability,
      _simulated: true,
    };
  }
}

// ============================================================================
// Real MCP Client (Stub - requires MCP server connections)
// ============================================================================

/**
 * Real MCP Client that connects to actual MCP servers.
 *
 * IMPORTANT: This requires MCP servers to be running and accessible.
 * In Claude Code context, MCP servers are managed by the host application.
 *
 * For standalone usage, you need to:
 * 1. Spawn MCP server processes
 * 2. Communicate via stdio/socket
 * 3. Handle the MCP protocol (JSON-RPC 2.0)
 *
 * See: https://modelcontextprotocol.io/docs
 */
class RealMCPClient implements IMCPClient {
  private mode: MCPMode = 'real';
  private config: MCPClientConfig;
  private simulatedFallback: SimulatedMCPClient;

  constructor(config: Partial<MCPClientConfig> = {}) {
    this.config = {
      mode: 'real',
      timeout: 30000,
      logCalls: false,
      ...config,
    };
    this.mode = this.config.mode;
    this.simulatedFallback = new SimulatedMCPClient(config);
  }

  async call<T = any>(
    server: MCPServerName,
    capability: string,
    params: Record<string, any>,
    options: MCPCallOptions = {}
  ): Promise<MCPCallResult<T>> {
    const startTime = Date.now();
    const fallbackToSimulated = options.fallbackToSimulated ?? (this.mode === 'hybrid');

    if (this.config.onCall) {
      this.config.onCall(server, capability, params);
    }

    if (this.config.logCalls) {
      console.log(`[MCP:REAL] ${server}.${capability}(${JSON.stringify(params).slice(0, 100)}...)`);
    }

    try {
      // Attempt real MCP call
      const data = await this.executeRealMCPCall<T>(server, capability, params, options);

      const result: MCPCallResult<T> = {
        success: true,
        data,
        server,
        capability,
        mode: 'real',
        latency: Date.now() - startTime,
        timestamp: new Date(),
      };

      if (this.config.onResult) {
        this.config.onResult(result);
      }

      return result;
    } catch (error) {
      // If fallback enabled, try simulated
      if (fallbackToSimulated) {
        console.warn(`[MCP] Real call to ${server}.${capability} failed, falling back to simulated`);
        return this.simulatedFallback.call<T>(server, capability, params, options);
      }

      const result: MCPCallResult<T> = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        server,
        capability,
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

  private async executeRealMCPCall<T>(
    server: MCPServerName,
    capability: string,
    params: Record<string, any>,
    options: MCPCallOptions
  ): Promise<T> {
    // Map capability to actual MCP tool name
    const toolName = this.mapCapabilityToTool(server, capability);

    /**
     * REAL MCP IMPLEMENTATION NOTES:
     *
     * To implement real MCP calls, you need to:
     *
     * 1. For Claude Code integration:
     *    - Genesis runs within Claude Code context
     *    - MCP servers are already available via Claude's tool system
     *    - Use the mcp__<server>__<tool> naming convention
     *
     * 2. For standalone execution:
     *    - Spawn MCP server processes using their package commands
     *    - Communicate via stdio using JSON-RPC 2.0
     *    - Example for arxiv: npx -y @anthropic/mcp-arxiv
     *
     * 3. Protocol format:
     *    Request: { jsonrpc: "2.0", method: "tools/call", params: { name, arguments }, id }
     *    Response: { jsonrpc: "2.0", result: { content: [...] }, id }
     */

    // For now, throw to indicate real MCP not configured
    throw new Error(
      `Real MCP not configured for ${server}.${capability}. ` +
      `Set GENESIS_MCP_MODE=simulated or implement MCP server connection.`
    );
  }

  private mapCapabilityToTool(server: MCPServerName, capability: string): string {
    // Map internal capability names to actual MCP tool names
    const mappings: Record<string, Record<string, string>> = {
      'arxiv': {
        'search_papers': 'search_arxiv',
        'search_arxiv': 'search_arxiv',
        'get_recent_ai': 'get_recent_ai_papers',
      },
      'brave-search': {
        'web_search': 'brave_web_search',
        'news_search': 'brave_news_search',
      },
      'gemini': {
        'web_search': 'web_search',
      },
      // Add more mappings as needed
    };

    return mappings[server]?.[capability] || capability;
  }

  async isAvailable(server: MCPServerName): Promise<boolean> {
    // In real mode, check if MCP server is actually reachable
    // For now, return false as real MCP is not implemented
    return false;
  }

  getMode(): MCPMode {
    return this.mode;
  }

  setMode(mode: MCPMode): void {
    this.mode = mode;
  }
}

// ============================================================================
// Hybrid MCP Client
// ============================================================================

/**
 * Hybrid client that tries real MCP first, falls back to simulated.
 */
class HybridMCPClient implements IMCPClient {
  private realClient: RealMCPClient;
  private simulatedClient: SimulatedMCPClient;
  private mode: MCPMode = 'hybrid';

  constructor(config: Partial<MCPClientConfig> = {}) {
    this.realClient = new RealMCPClient({ ...config, mode: 'real' });
    this.simulatedClient = new SimulatedMCPClient({ ...config, mode: 'simulated' });
  }

  async call<T = any>(
    server: MCPServerName,
    capability: string,
    params: Record<string, any>,
    options: MCPCallOptions = {}
  ): Promise<MCPCallResult<T>> {
    // Try real first with fallback enabled
    return this.realClient.call<T>(server, capability, params, {
      ...options,
      fallbackToSimulated: true,
    });
  }

  async isAvailable(server: MCPServerName): Promise<boolean> {
    const realAvailable = await this.realClient.isAvailable(server);
    return realAvailable || await this.simulatedClient.isAvailable(server);
  }

  getMode(): MCPMode {
    return this.mode;
  }

  setMode(mode: MCPMode): void {
    this.mode = mode;
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

// Singleton instance
let mcpClientInstance: IMCPClient | null = null;

export function getMCPClient(config?: Partial<MCPClientConfig>): IMCPClient {
  if (!mcpClientInstance) {
    mcpClientInstance = createMCPClient(config);
  }
  return mcpClientInstance;
}

export function resetMCPClient(): void {
  mcpClientInstance = null;
}

// Default export
export const mcpClient = getMCPClient();

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if running in simulated mode
 */
export function isSimulatedMode(): boolean {
  return mcpClient.getMode() === 'simulated';
}

/**
 * Check if a result was simulated
 */
export function isSimulatedResult(result: MCPCallResult): boolean {
  return result.mode === 'simulated' || (result.data as any)?._simulated === true;
}

/**
 * Log MCP mode on startup
 */
export function logMCPMode(): void {
  const mode = mcpClient.getMode();
  const modeEmoji = mode === 'real' ? '🔌' : mode === 'hybrid' ? '🔀' : '🎭';
  console.log(`[Genesis] MCP Mode: ${modeEmoji} ${mode.toUpperCase()}`);

  if (mode === 'simulated') {
    console.log('[Genesis] Set GENESIS_MCP_MODE=real for production');
  }
}
