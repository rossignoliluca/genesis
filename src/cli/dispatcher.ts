/**
 * Genesis 6.0 - Tool Dispatcher
 *
 * Intelligent router that:
 * 1. Parses tool calls from LLM responses
 * 2. Routes to appropriate tools (local or MCP)
 * 3. Supports parallel execution
 * 4. Tracks execution status with progress
 * 5. Feeds results back for continued conversation
 */

import { toolRegistry, Tool } from '../tools/index.js';
import { getMCPClient, MCPCallResult } from '../mcp/index.js';
import { MCPServerName } from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface ToolCall {
  id: string;
  name: string;
  params: Record<string, unknown>;
  source: 'local' | 'mcp';
  mcpServer?: MCPServerName;
}

export interface ToolResult {
  callId: string;
  name: string;
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
  source: 'local' | 'mcp';
}

export interface DispatchResult {
  success: boolean;
  results: ToolResult[];
  totalDuration: number;
  parallelExecutions: number;
  sequentialExecutions: number;
}

export interface DispatcherConfig {
  maxParallel: number;
  timeout: number;
  retries: number;
  verbose: boolean;
  onProgress?: (status: ProgressStatus) => void;
}

export interface ProgressStatus {
  phase: 'parsing' | 'validating' | 'executing' | 'complete';
  current: number;
  total: number;
  currentTool?: string;
  message?: string;
}

// LLM tool call format (OpenAI-style)
export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

// ============================================================================
// Tool Categories for Routing
// ============================================================================

const LOCAL_TOOLS = [
  // File tools
  'bash', 'edit', 'write', 'read', 'glob', 'grep',
  // Git tools
  'git_status', 'git_diff', 'git_log', 'git_add', 'git_commit', 'git_push',
  'git_branch', 'git_checkout',
];

const MCP_TOOL_MAP: Record<string, MCPServerName> = {
  // Knowledge
  'search_arxiv': 'arxiv',
  'parse_paper_content': 'arxiv',
  'get_recent_ai_papers': 'arxiv',
  'search_semantic_scholar': 'semantic-scholar',
  'get_semantic_scholar_paper': 'semantic-scholar',
  'resolve-library-id': 'context7',
  'query-docs': 'context7',
  'wolfram_query': 'wolfram',

  // Research
  'web_search': 'gemini',
  'brave_web_search': 'brave-search',
  'web_search_exa': 'exa',
  'firecrawl_scrape': 'firecrawl',
  'firecrawl_search': 'firecrawl',

  // Creation
  'openai_chat': 'openai',
  'create_repository': 'github',
  'create_issue': 'github',
  'create_pull_request': 'github',

  // Storage
  'create_entities': 'memory',
  'search_nodes': 'memory',
  'read_graph': 'memory',
  'read_file': 'filesystem',
  'write_file': 'filesystem',
  'list_directory': 'filesystem',

  // Visual
  'stability-ai-generate-image': 'stability-ai',
  'stability-ai-generate-image-sd35': 'stability-ai',
};

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CONFIG: DispatcherConfig = {
  maxParallel: 5,
  timeout: 60000,
  retries: 2,
  verbose: false,
};

// ============================================================================
// Dispatcher Class
// ============================================================================

export class ToolDispatcher {
  private config: DispatcherConfig;
  private executionHistory: ToolResult[] = [];

  constructor(config?: Partial<DispatcherConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Parse tool calls from LLM response
   */
  parseToolCalls(response: string | LLMToolCall[]): ToolCall[] {
    // If already parsed (from OpenAI-style API)
    if (Array.isArray(response)) {
      return response.map(call => this.parseLLMToolCall(call));
    }

    // Parse from text (Claude XML-style)
    return this.parseXMLToolCalls(response);
  }

  /**
   * Parse OpenAI-style tool call
   */
  private parseLLMToolCall(call: LLMToolCall): ToolCall {
    const name = call.function.name;
    let params: Record<string, unknown> = {};

    try {
      params = JSON.parse(call.function.arguments);
    } catch {
      // Invalid JSON, use empty params
    }

    return {
      id: call.id,
      name,
      params,
      ...this.routeTool(name),
    };
  }

  /**
   * Parse XML-style tool calls from text
   * Example: <tool_use name="bash"><param name="command">ls -la</param></tool_use>
   */
  private parseXMLToolCalls(text: string): ToolCall[] {
    const calls: ToolCall[] = [];

    // Match <tool_use> or <function_call> or similar patterns
    const patterns = [
      // <tool_use name="...">...</tool_use>
      /<tool_use\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/tool_use>/gi,
      // <invoke name="...">...</invoke>
      /<invoke\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/invoke>/gi,
      // ```tool\n{name: ..., params: {...}}```
      /```tool\s*\n?\{[\s\S]*?"name"\s*:\s*"([^"]+)"[\s\S]*?\}```/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1];
        const content = match[2] || '';
        const params = this.parseToolParams(content);

        calls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name,
          params,
          ...this.routeTool(name),
        });
      }
    }

    // Also check for JSON-style tool calls
    const jsonPattern = /\{\s*"tool"\s*:\s*"([^"]+)"\s*,\s*"params"\s*:\s*(\{[^}]+\})\s*\}/gi;
    let jsonMatch;
    while ((jsonMatch = jsonPattern.exec(text)) !== null) {
      try {
        const name = jsonMatch[1];
        const params = JSON.parse(jsonMatch[2]);
        calls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name,
          params,
          ...this.routeTool(name),
        });
      } catch {
        // Invalid JSON, skip
      }
    }

    return calls;
  }

  /**
   * Parse params from tool content
   */
  private parseToolParams(content: string): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    // Try JSON first
    try {
      const trimmed = content.trim();
      if (trimmed.startsWith('{')) {
        return JSON.parse(trimmed);
      }
    } catch {
      // Not JSON, continue with XML parsing
    }

    // Parse <param name="...">value</param>
    const paramPattern = /<param\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/param>/gi;
    let match;
    while ((match = paramPattern.exec(content)) !== null) {
      const name = match[1];
      let value: unknown = match[2].trim();

      // Try to parse as JSON if it looks like an object/array
      if ((value as string).startsWith('{') || (value as string).startsWith('[')) {
        try {
          value = JSON.parse(value as string);
        } catch {
          // Keep as string
        }
      }
      // Try to parse as number
      else if (!isNaN(Number(value))) {
        value = Number(value);
      }
      // Try to parse as boolean
      else if (value === 'true' || value === 'false') {
        value = value === 'true';
      }

      params[name] = value;
    }

    // If no params found, treat whole content as 'input'
    if (Object.keys(params).length === 0 && content.trim()) {
      params.input = content.trim();
    }

    return params;
  }

  /**
   * Route tool to local or MCP
   */
  private routeTool(name: string): { source: 'local' | 'mcp'; mcpServer?: MCPServerName } {
    // Check local tools first
    if (LOCAL_TOOLS.includes(name) || toolRegistry.has(name)) {
      return { source: 'local' };
    }

    // Check MCP tools
    const mcpServer = MCP_TOOL_MAP[name];
    if (mcpServer) {
      return { source: 'mcp', mcpServer };
    }

    // Default to local (will fail gracefully if not found)
    return { source: 'local' };
  }

  /**
   * Execute tool calls
   */
  async dispatch(calls: ToolCall[]): Promise<DispatchResult> {
    const startTime = Date.now();
    const results: ToolResult[] = [];
    let parallelCount = 0;
    let sequentialCount = 0;

    this.progress({ phase: 'validating', current: 0, total: calls.length });

    // Validate all calls first
    const validCalls: ToolCall[] = [];
    for (const call of calls) {
      const validation = this.validateCall(call);
      if (!validation.valid) {
        results.push({
          callId: call.id,
          name: call.name,
          success: false,
          error: validation.reason,
          duration: 0,
          source: call.source,
        });
      } else {
        validCalls.push(call);
      }
    }

    // Group by dependencies (for now, all parallel)
    const groups = this.groupByDependencies(validCalls);

    // Execute each group
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];

      if (group.length > 1) {
        parallelCount++;
      } else {
        sequentialCount++;
      }

      this.progress({
        phase: 'executing',
        current: i + 1,
        total: groups.length,
        message: `Executing group ${i + 1}/${groups.length} (${group.length} tools)`,
      });

      // Execute group in parallel
      const groupResults = await Promise.all(
        group.map(call => this.executeCall(call))
      );

      results.push(...groupResults);
    }

    const totalDuration = Date.now() - startTime;
    this.executionHistory.push(...results);

    this.progress({ phase: 'complete', current: calls.length, total: calls.length });

    return {
      success: results.every(r => r.success),
      results,
      totalDuration,
      parallelExecutions: parallelCount,
      sequentialExecutions: sequentialCount,
    };
  }

  /**
   * Validate a tool call
   */
  private validateCall(call: ToolCall): { valid: boolean; reason?: string } {
    // Check if tool exists
    if (call.source === 'local') {
      const tool = toolRegistry.get(call.name);
      if (!tool) {
        return { valid: false, reason: `Unknown tool: ${call.name}` };
      }

      // Run tool-specific validation
      if (tool.validate) {
        return tool.validate(call.params);
      }
    } else if (call.source === 'mcp') {
      if (!call.mcpServer) {
        return { valid: false, reason: `No MCP server for tool: ${call.name}` };
      }
    }

    return { valid: true };
  }

  /**
   * Group calls by dependencies
   * For now, all calls are independent and can run in parallel
   */
  private groupByDependencies(calls: ToolCall[]): ToolCall[][] {
    // Simple grouping: max N parallel
    const groups: ToolCall[][] = [];

    for (let i = 0; i < calls.length; i += this.config.maxParallel) {
      groups.push(calls.slice(i, i + this.config.maxParallel));
    }

    return groups;
  }

  /**
   * Execute a single tool call
   */
  private async executeCall(call: ToolCall): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      if (this.config.verbose) {
        console.log(`  Executing: ${call.name}`);
      }

      let data: unknown;

      if (call.source === 'local') {
        data = await this.executeLocalTool(call);
      } else {
        data = await this.executeMCPTool(call);
      }

      return {
        callId: call.id,
        name: call.name,
        success: true,
        data,
        duration: Date.now() - startTime,
        source: call.source,
      };
    } catch (error) {
      return {
        callId: call.id,
        name: call.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        source: call.source,
      };
    }
  }

  /**
   * Execute local tool
   */
  private async executeLocalTool(call: ToolCall): Promise<unknown> {
    const tool = toolRegistry.get(call.name);
    if (!tool) {
      throw new Error(`Tool not found: ${call.name}`);
    }

    return tool.execute(call.params);
  }

  /**
   * Execute MCP tool
   */
  private async executeMCPTool(call: ToolCall): Promise<unknown> {
    if (!call.mcpServer) {
      throw new Error(`No MCP server for tool: ${call.name}`);
    }

    const client = getMCPClient();
    const result = await client.call(call.mcpServer, call.name, call.params);

    if (!result.success) {
      throw new Error(result.error || 'MCP call failed');
    }

    return result.data;
  }

  /**
   * Report progress
   */
  private progress(status: ProgressStatus): void {
    if (this.config.onProgress) {
      this.config.onProgress(status);
    }
  }

  /**
   * Get execution history
   */
  getHistory(): ToolResult[] {
    return [...this.executionHistory];
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.executionHistory = [];
  }

  /**
   * Update config
   */
  updateConfig(updates: Partial<DispatcherConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get available tools
   */
  listTools(): { local: string[]; mcp: Record<string, string[]> } {
    const local = Array.from(toolRegistry.keys());

    const mcp: Record<string, string[]> = {};
    for (const [tool, server] of Object.entries(MCP_TOOL_MAP)) {
      if (!mcp[server]) {
        mcp[server] = [];
      }
      mcp[server].push(tool);
    }

    return { local, mcp };
  }

  /**
   * Format results for LLM context
   */
  formatResultsForLLM(results: ToolResult[]): string {
    const lines: string[] = ['<tool_results>'];

    for (const result of results) {
      lines.push(`<result name="${result.name}" success="${result.success}">`);

      if (result.success) {
        const data = typeof result.data === 'string'
          ? result.data
          : JSON.stringify(result.data, null, 2);
        lines.push(data);
      } else {
        lines.push(`Error: ${result.error}`);
      }

      lines.push('</result>');
    }

    lines.push('</tool_results>');
    return lines.join('\n');
  }
}

// ============================================================================
// Singleton
// ============================================================================

let dispatcherInstance: ToolDispatcher | null = null;

export function getDispatcher(config?: Partial<DispatcherConfig>): ToolDispatcher {
  if (!dispatcherInstance) {
    dispatcherInstance = new ToolDispatcher(config);
  } else if (config) {
    dispatcherInstance.updateConfig(config);
  }
  return dispatcherInstance;
}

export function resetDispatcher(): void {
  dispatcherInstance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Parse and dispatch tool calls from LLM response
 */
export async function dispatchTools(
  response: string | LLMToolCall[],
  config?: Partial<DispatcherConfig>
): Promise<DispatchResult> {
  const dispatcher = getDispatcher(config);
  const calls = dispatcher.parseToolCalls(response);
  return dispatcher.dispatch(calls);
}

/**
 * Execute a single tool by name
 */
export async function executeTool(
  name: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const dispatcher = getDispatcher();
  const call: ToolCall = {
    id: `call_${Date.now()}`,
    name,
    params,
    ...dispatcher['routeTool'](name),
  };

  const result = await dispatcher.dispatch([call]);
  return result.results[0];
}

/**
 * List all available tools
 */
export function listAllTools(): { local: string[]; mcp: Record<string, string[]> } {
  return getDispatcher().listTools();
}
