/**
 * Genesis 4.0 - Sensor Agent
 *
 * Interface to MCP servers (the system's sensory organs).
 * Routes requests to appropriate MCP servers and collects results.
 *
 * 13 MCP Servers as Senses:
 * - KNOWLEDGE: arxiv, semantic-scholar, context7, wolfram
 * - RESEARCH: gemini, brave-search, exa, firecrawl
 * - CREATION: openai, github, stability-ai
 * - STORAGE: memory, filesystem
 */

import { BaseAgent, registerAgentFactory } from './base-agent.js';
import { MessageBus, messageBus } from './message-bus.js';
import {
  Message,
  MessageType,
} from './types.js';
import { getMCPClient, MCPCallResult, isSimulatedResult, MCPMode } from '../mcp/index.js';

// ============================================================================
// Types
// ============================================================================

import { MCPServerName } from '../types.js';

export type MCPCategory = 'knowledge' | 'research' | 'creation' | 'storage';

/**
 * Runtime state of an MCP server.
 * Renamed from MCPServer to avoid conflict with MCPServerName type.
 */
export interface MCPServerState {
  name: MCPServerName;
  category: MCPCategory;
  capabilities: string[];
  available: boolean;
  lastChecked: Date;
  successRate: number;
  callCount: number;
}

interface SenseRequest {
  category?: MCPCategory;
  server?: string;
  capability: string;
  params: Record<string, any>;
  timeout?: number;
}

interface SenseResult {
  server: string;
  success: boolean;
  data?: any;
  error?: string;
  latency: number;
  mode: 'real' | 'simulated';
}

// ============================================================================
// Sensor Agent
// ============================================================================

export class SensorAgent extends BaseAgent {
  // Registry of MCP servers
  private mcpServers: Map<MCPServerName, MCPServerState> = new Map();

  // Request history for analytics
  private requestHistory: {
    server: string;
    success: boolean;
    latency: number;
    timestamp: Date;
  }[] = [];

  constructor(bus: MessageBus = messageBus) {
    super({ type: 'sensor' }, bus);
    this.initializeMCPRegistry();
  }

  private initializeMCPRegistry(): void {
    // Knowledge MCPs
    this.registerMCP('arxiv', 'knowledge', [
      'search_papers', 'get_paper', 'parse_paper', 'get_recent_ai'
    ]);
    this.registerMCP('semantic-scholar', 'knowledge', [
      'search_papers', 'get_paper', 'get_citations', 'to_bibtex'
    ]);
    this.registerMCP('context7', 'knowledge', [
      'resolve_library', 'query_docs'
    ]);
    this.registerMCP('wolfram', 'knowledge', [
      'query', 'calculate', 'facts'
    ]);

    // Research MCPs
    this.registerMCP('gemini', 'research', [
      'web_search', 'web_search_batch'
    ]);
    this.registerMCP('brave-search', 'research', [
      'web_search', 'local_search', 'news_search', 'image_search', 'video_search'
    ]);
    this.registerMCP('exa', 'research', [
      'web_search', 'code_context'
    ]);
    this.registerMCP('firecrawl', 'research', [
      'scrape', 'map', 'search', 'crawl', 'extract'
    ]);

    // Creation MCPs
    this.registerMCP('openai', 'creation', [
      'chat', 'generate_text'
    ]);
    this.registerMCP('github', 'creation', [
      'create_repo', 'create_file', 'create_pr', 'search_code', 'list_issues'
    ]);
    this.registerMCP('stability-ai', 'creation', [
      'generate_image', 'upscale', 'remove_background', 'outpaint'
    ]);

    // Storage MCPs
    this.registerMCP('memory', 'storage', [
      'create_entities', 'search_nodes', 'read_graph', 'add_observations'
    ]);
    this.registerMCP('filesystem', 'storage', [
      'read_file', 'write_file', 'list_directory', 'search_files'
    ]);
  }

  private registerMCP(name: MCPServerName, category: MCPCategory, capabilities: string[]): void {
    this.mcpServers.set(name, {
      name,
      category,
      capabilities,
      available: true, // Assume available, will update on first use
      lastChecked: new Date(),
      successRate: 1.0,
      callCount: 0,
    });
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  protected getMessageTypes(): MessageType[] {
    return ['SENSE', 'QUERY', 'COMMAND'];
  }

  async process(message: Message): Promise<Message | null> {
    switch (message.type) {
      case 'SENSE':
        return this.handleSenseRequest(message);
      case 'QUERY':
        return this.handleQuery(message);
      case 'COMMAND':
        return this.handleCommand(message);
      default:
        return null;
    }
  }

  // ============================================================================
  // Sense (MCP Request)
  // ============================================================================

  private async handleSenseRequest(message: Message): Promise<Message | null> {
    const request: SenseRequest = message.payload;

    const result = await this.sense(request);

    return {
      ...this.createResponse(message, 'RESPONSE', result),
      id: '',
      timestamp: new Date(),
    };
  }

  async sense(request: SenseRequest): Promise<SenseResult> {
    const startTime = Date.now();

    // Find appropriate server
    const server = this.findServer(request);

    if (!server) {
      return {
        server: 'none',
        success: false,
        error: `No server found for capability: ${request.capability}`,
        latency: Date.now() - startTime,
        mode: 'simulated',
      };
    }

    this.log(`Sensing via ${server.name}: ${request.capability}`);

    // Use the MCP client module (supports real/simulated/hybrid modes)
    const mcpClient = getMCPClient();
    const result = await mcpClient.call(server.name, request.capability, request.params, {
      timeout: request.timeout,
    });

    // Record the request for tracking
    this.recordRequest(server.name, result.success, result.latency);

    return {
      server: server.name,
      success: result.success,
      data: result.data,
      error: result.error,
      latency: result.latency,
      mode: result.mode,
    };
  }

  private findServer(request: SenseRequest): MCPServerState | null {
    // Specific server requested
    if (request.server) {
      return this.mcpServers.get(request.server as MCPServerName) || null;
    }

    // Find by category
    if (request.category) {
      for (const server of this.mcpServers.values()) {
        if (server.category === request.category &&
            server.capabilities.includes(request.capability) &&
            server.available) {
          return server;
        }
      }
    }

    // Find any server with the capability
    for (const server of this.mcpServers.values()) {
      if (server.capabilities.includes(request.capability) && server.available) {
        return server;
      }
    }

    // Try fuzzy match on capability
    const capabilityLower = request.capability.toLowerCase();
    for (const server of this.mcpServers.values()) {
      if (server.available &&
          server.capabilities.some((c) => c.includes(capabilityLower) || capabilityLower.includes(c))) {
        return server;
      }
    }

    return null;
  }

  // ============================================================================
  // Request Tracking
  // ============================================================================

  private recordRequest(server: MCPServerName, success: boolean, latency: number): void {
    // Update server stats
    const mcpServer = this.mcpServers.get(server);
    if (mcpServer) {
      mcpServer.callCount++;
      mcpServer.lastChecked = new Date();

      // Update success rate (exponential moving average)
      const alpha = 0.1;
      mcpServer.successRate = alpha * (success ? 1 : 0) + (1 - alpha) * mcpServer.successRate;

      // Mark unavailable if success rate drops too low
      if (mcpServer.successRate < 0.3 && mcpServer.callCount > 10) {
        mcpServer.available = false;
        this.log(`Server ${server} marked unavailable (success rate: ${(mcpServer.successRate * 100).toFixed(0)}%)`);
      }
    }

    // Add to history
    this.requestHistory.push({
      server,
      success,
      latency,
      timestamp: new Date(),
    });

    // Keep history bounded
    if (this.requestHistory.length > 1000) {
      this.requestHistory.shift();
    }
  }

  // ============================================================================
  // Query
  // ============================================================================

  private async handleQuery(message: Message): Promise<Message | null> {
    const { query } = message.payload;

    if (query === 'servers') {
      return {
        ...this.createResponse(message, 'RESPONSE', {
          servers: Array.from(this.mcpServers.values()),
        }),
        id: '',
        timestamp: new Date(),
      };
    }

    if (query === 'categories') {
      const byCategory: Record<MCPCategory, string[]> = {
        knowledge: [],
        research: [],
        creation: [],
        storage: [],
      };

      for (const server of this.mcpServers.values()) {
        byCategory[server.category].push(server.name);
      }

      return {
        ...this.createResponse(message, 'RESPONSE', { categories: byCategory }),
        id: '',
        timestamp: new Date(),
      };
    }

    if (query === 'capabilities') {
      const capabilities: Record<string, string[]> = {};
      for (const server of this.mcpServers.values()) {
        capabilities[server.name] = server.capabilities;
      }

      return {
        ...this.createResponse(message, 'RESPONSE', { capabilities }),
        id: '',
        timestamp: new Date(),
      };
    }

    if (query === 'stats') {
      return {
        ...this.createResponse(message, 'RESPONSE', this.getStats()),
        id: '',
        timestamp: new Date(),
      };
    }

    return null;
  }

  // ============================================================================
  // Commands
  // ============================================================================

  private async handleCommand(message: Message): Promise<Message | null> {
    const { command, params } = message.payload;

    switch (command) {
      case 'check_health':
        await this.checkAllServers();
        return {
          ...this.createResponse(message, 'RESPONSE', {
            servers: Array.from(this.mcpServers.values()),
          }),
          id: '',
          timestamp: new Date(),
        };

      case 'enable_server':
        const serverToEnable = this.mcpServers.get(params.server);
        if (serverToEnable) {
          serverToEnable.available = true;
          serverToEnable.successRate = 0.5; // Reset
        }
        return {
          ...this.createResponse(message, 'RESPONSE', { success: true }),
          id: '',
          timestamp: new Date(),
        };

      case 'disable_server':
        const serverToDisable = this.mcpServers.get(params.server);
        if (serverToDisable) {
          serverToDisable.available = false;
        }
        return {
          ...this.createResponse(message, 'RESPONSE', { success: true }),
          id: '',
          timestamp: new Date(),
        };

      case 'execute_step':
        // Execute sensing for a plan step
        const result = await this.sense({
          capability: params.step,
          params: { context: params.planId },
        });
        return {
          ...this.createResponse(message, 'RESPONSE', result),
          id: '',
          timestamp: new Date(),
        };

      default:
        return null;
    }
  }

  private async checkAllServers(): Promise<void> {
    const mcpClient = getMCPClient();
    for (const server of this.mcpServers.values()) {
      // Check availability via MCP client
      server.available = await mcpClient.isAvailable(server.name);
      server.lastChecked = new Date();
    }
  }

  // ============================================================================
  // Stats
  // ============================================================================

  getStats() {
    const servers = Array.from(this.mcpServers.values());
    const available = servers.filter((s) => s.available);
    const recentRequests = this.requestHistory.slice(-100);
    const successfulRequests = recentRequests.filter((r) => r.success);

    const avgLatency = recentRequests.length > 0
      ? recentRequests.reduce((sum, r) => sum + r.latency, 0) / recentRequests.length
      : 0;

    return {
      totalServers: servers.length,
      availableServers: available.length,
      serversByCategory: {
        knowledge: servers.filter((s) => s.category === 'knowledge').length,
        research: servers.filter((s) => s.category === 'research').length,
        creation: servers.filter((s) => s.category === 'creation').length,
        storage: servers.filter((s) => s.category === 'storage').length,
      },
      totalRequests: this.requestHistory.length,
      recentSuccessRate: recentRequests.length > 0
        ? successfulRequests.length / recentRequests.length
        : 1,
      avgLatency,
    };
  }

  // ============================================================================
  // Public API
  // ============================================================================

  getAvailableServers(): MCPServerState[] {
    return Array.from(this.mcpServers.values()).filter((s) => s.available);
  }

  getServersByCategory(category: MCPCategory): MCPServerState[] {
    return Array.from(this.mcpServers.values()).filter((s) => s.category === category);
  }

  hasCapability(capability: string): boolean {
    return this.findServer({ capability, params: {} }) !== null;
  }

  /**
   * Get the current MCP mode (real/simulated/hybrid)
   */
  getMCPMode(): MCPMode {
    return getMCPClient().getMode();
  }

  /**
   * Check if running in simulated mode
   */
  isSimulated(): boolean {
    return this.getMCPMode() === 'simulated';
  }
}

// ============================================================================
// Register Factory
// ============================================================================

registerAgentFactory('sensor', (bus) => new SensorAgent(bus));

export function createSensorAgent(bus?: MessageBus): SensorAgent {
  return new SensorAgent(bus);
}
