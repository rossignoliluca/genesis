/**
 * Genesis v32 - MCP Spec 2025-11-25 Upgrade (Item 9)
 *
 * Implements new MCP spec features:
 * - Streamable HTTP transport (replaces old SSE)
 * - Tasks (async long-running operations)
 * - Elicitation (server requests user input)
 *
 * This module provides the transport layer adapter.
 */

// ============================================================================
// Streamable HTTP Transport
// ============================================================================

export interface StreamableHTTPConfig {
  baseUrl: string;
  sessionId?: string;
  headers?: Record<string, string>;
}

export interface MCPTask {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress?: number;        // 0-100
  result?: any;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ElicitationRequest {
  id: string;
  type: 'text' | 'select' | 'confirm';
  prompt: string;
  options?: string[];
  defaultValue?: string;
}

/**
 * Streamable HTTP transport adapter for MCP spec 2025-11-25.
 * Replaces the legacy SSE transport with bidirectional HTTP streaming.
 */
export class StreamableHTTPTransport {
  private config: StreamableHTTPConfig;
  private activeTasks: Map<string, MCPTask> = new Map();
  private pendingElicitations: Map<string, ElicitationRequest> = new Map();

  constructor(config: StreamableHTTPConfig) {
    this.config = config;
  }

  /**
   * Send a JSON-RPC request over Streamable HTTP
   */
  async send(method: string, params: Record<string, any>): Promise<any> {
    const response = await fetch(`${this.config.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...(this.config.sessionId ? { 'Mcp-Session-Id': this.config.sessionId } : {}),
        ...this.config.headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method,
        params,
      }),
    });

    // Check if response is streaming
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
      return this.handleStreamResponse(response);
    }

    return response.json();
  }

  /**
   * Create an async task (for long-running operations)
   */
  async createTask(toolName: string, args: Record<string, any>): Promise<MCPTask> {
    const taskId = crypto.randomUUID();
    const task: MCPTask = {
      id: taskId,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.activeTasks.set(taskId, task);

    // Send as background task
    const result = await this.send('tools/call', {
      name: toolName,
      arguments: args,
      _meta: { taskId },
    });

    if (result?.result) {
      task.status = 'completed';
      task.result = result.result;
    }

    task.updatedAt = new Date().toISOString();
    return task;
  }

  /**
   * Poll task status
   */
  async getTaskStatus(taskId: string): Promise<MCPTask | undefined> {
    return this.activeTasks.get(taskId);
  }

  /**
   * Handle elicitation request (server asking user for input)
   */
  async respondToElicitation(id: string, value: string): Promise<void> {
    this.pendingElicitations.delete(id);
    await this.send('elicitation/respond', { id, value });
  }

  /** Get pending elicitation requests */
  getPendingElicitations(): ElicitationRequest[] {
    return Array.from(this.pendingElicitations.values());
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  private async handleStreamResponse(response: Response): Promise<any> {
    const reader = response.body?.getReader();
    if (!reader) return null;

    const decoder = new TextDecoder();
    let buffer = '';
    let lastResult: any = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        const lines = event.split('\n');
        let data = '';
        let eventType = '';

        for (const line of lines) {
          if (line.startsWith('event:')) eventType = line.slice(6).trim();
          if (line.startsWith('data:')) data = line.slice(5).trim();
        }

        if (data) {
          try {
            const parsed = JSON.parse(data);

            if (eventType === 'progress' && parsed.taskId) {
              const task = this.activeTasks.get(parsed.taskId);
              if (task) {
                task.progress = parsed.progress;
                task.updatedAt = new Date().toISOString();
              }
            } else if (eventType === 'elicitation') {
              this.pendingElicitations.set(parsed.id, parsed);
            } else {
              lastResult = parsed;
            }
          } catch (err) {
            console.error('[StreamableHTTPTransport] SSE parse failed:', err);
            /* skip unparseable */
          }
        }
      }
    }

    return lastResult;
  }
}
