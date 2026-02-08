/**
 * Genesis v7.4 - Subagent Executor
 *
 * Executes subagents in isolated contexts with tool restrictions.
 */

import { randomUUID } from 'crypto';
import {
  TaskRequest,
  TaskResult,
  BackgroundTask,
  TaskStatus,
  SubagentEvent,
  SubagentEventHandler,
  SubagentConfig,
  DEFAULT_SUBAGENT_CONFIG,
} from './types.js';
import { getSubagent, BUILTIN_SUBAGENTS } from './registry.js';
import { LLMBridge, createLLMBridge } from '../llm/index.js';
import { ToolDispatcher, TOOL_ALIASES } from '../cli/dispatcher.js';

// ============================================================================
// Subagent Executor
// ============================================================================

export class SubagentExecutor {
  private config: SubagentConfig;
  private runningTasks: Map<string, BackgroundTask> = new Map();
  private eventHandlers: Set<SubagentEventHandler> = new Set();
  private dispatcher: ToolDispatcher | null = null;

  constructor(config: Partial<SubagentConfig> = {}) {
    this.config = { ...DEFAULT_SUBAGENT_CONFIG, ...config };
  }

  /**
   * Set the tool dispatcher for subagents
   */
  setDispatcher(dispatcher: ToolDispatcher): void {
    this.dispatcher = dispatcher;
  }

  /**
   * Execute a task synchronously
   */
  async execute(request: TaskRequest): Promise<TaskResult> {
    const taskId = randomUUID().slice(0, 8);
    const startTime = Date.now();

    // Get subagent definition
    const subagent = getSubagent(request.subagentType);
    if (!subagent) {
      return {
        taskId,
        subagentType: request.subagentType,
        success: false,
        error: `Unknown subagent type: ${request.subagentType}. Available: ${Object.keys(BUILTIN_SUBAGENTS).join(', ')}`,
        duration: Date.now() - startTime,
      };
    }

    this.emit({
      type: 'task_start',
      taskId,
      timestamp: new Date(),
      data: { description: request.description, subagentType: request.subagentType },
    });

    try {
      // Create isolated LLM bridge for subagent
      const llm = this.createSubagentLLM(request.model || subagent.model);

      // Build system prompt with tool restrictions
      const systemPrompt = this.buildSystemPrompt(subagent.systemPrompt, subagent.tools);

      // Execute with timeout
      const timeout = subagent.timeout || this.config.defaultTimeout;
      const result = await Promise.race([
        this.runSubagent(llm, systemPrompt, request.prompt, subagent.tools, taskId),
        this.timeoutPromise(timeout, taskId),
      ]);

      this.emit({
        type: 'task_complete',
        taskId,
        timestamp: new Date(),
        data: { success: true },
      });

      return {
        taskId,
        subagentType: request.subagentType,
        success: true,
        result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.emit({
        type: 'task_error',
        taskId,
        timestamp: new Date(),
        data: { error: errorMessage },
      });

      return {
        taskId,
        subagentType: request.subagentType,
        success: false,
        error: errorMessage,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute a task in background
   */
  async executeBackground(request: TaskRequest): Promise<string> {
    const taskId = randomUUID().slice(0, 8);

    // Check concurrent limit
    const runningCount = Array.from(this.runningTasks.values())
      .filter(t => t.status === 'running').length;

    if (runningCount >= this.config.maxConcurrent) {
      throw new Error(`Max concurrent tasks (${this.config.maxConcurrent}) reached`);
    }

    // Create background task entry
    const task: BackgroundTask = {
      taskId,
      description: request.description,
      subagentType: request.subagentType,
      status: 'pending',
      startTime: Date.now(),
      output: [],
    };
    this.runningTasks.set(taskId, task);

    // Start execution in background
    this.runBackgroundTask(taskId, request).catch(error => {
      const t = this.runningTasks.get(taskId);
      if (t) {
        t.status = 'failed';
        t.endTime = Date.now();
        t.result = {
          taskId,
          subagentType: request.subagentType,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - t.startTime,
        };
      }
    });

    return taskId;
  }

  /**
   * Get background task status
   */
  getTask(taskId: string): BackgroundTask | undefined {
    return this.runningTasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getTasks(): BackgroundTask[] {
    return Array.from(this.runningTasks.values());
  }

  /**
   * Get running tasks
   */
  getRunningTasks(): BackgroundTask[] {
    return this.getTasks().filter(t => t.status === 'running');
  }

  /**
   * Wait for a background task to complete
   */
  async waitForTask(taskId: string, timeout?: number): Promise<TaskResult> {
    const task = this.runningTasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const maxWait = timeout || this.config.defaultTimeout;
    const startWait = Date.now();

    while (task.status === 'pending' || task.status === 'running') {
      if (Date.now() - startWait > maxWait) {
        throw new Error(`Timeout waiting for task ${taskId}`);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!task.result) {
      throw new Error(`Task ${taskId} completed without result`);
    }

    return task.result;
  }

  /**
   * Cancel a background task
   */
  cancelTask(taskId: string): boolean {
    const task = this.runningTasks.get(taskId);
    if (!task || task.status !== 'running') {
      return false;
    }

    task.status = 'cancelled';
    task.endTime = Date.now();

    this.emit({
      type: 'task_cancelled',
      taskId,
      timestamp: new Date(),
    });

    return true;
  }

  /**
   * Subscribe to events
   */
  on(handler: SubagentEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async runBackgroundTask(taskId: string, request: TaskRequest): Promise<void> {
    const task = this.runningTasks.get(taskId);
    if (!task) return;

    task.status = 'running';

    const result = await this.execute(request);

    task.status = result.success ? 'completed' : 'failed';
    task.endTime = Date.now();
    task.result = result;
  }

  private createSubagentLLM(modelTier?: 'fast' | 'balanced' | 'powerful'): LLMBridge {
    // Map tier to actual model
    const modelMap = {
      fast: 'qwen2.5-coder',      // Local, fast
      balanced: 'mistral',         // Local, balanced
      powerful: 'gpt-4o',          // Cloud, powerful
    };

    const model = modelMap[modelTier || 'balanced'];

    // Use Ollama for fast/balanced, OpenAI for powerful
    if (modelTier === 'powerful' && process.env.OPENAI_API_KEY) {
      return createLLMBridge({ provider: 'openai', model });
    }

    return createLLMBridge({ provider: 'ollama', model });
  }

  private buildSystemPrompt(basePrompt: string, allowedTools: string[]): string {
    const toolsSection = allowedTools.includes('*')
      ? 'You have access to ALL tools.'
      : `You have access to these tools ONLY: ${allowedTools.join(', ')}`;

    return `${basePrompt}

## Tool Access
${toolsSection}

## Response Format
After completing your task, provide a clear summary of:
1. What you found/did
2. Key results with file:line references where applicable
3. Any issues or warnings`;
  }

  private async runSubagent(
    llm: LLMBridge,
    systemPrompt: string,
    userPrompt: string,
    allowedTools: string[],
    taskId: string
  ): Promise<string> {
    // Multi-turn tool execution loop
    const maxTurns = this.config.maxTurns || 10;
    let turn = 0;
    let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    let lastResponse = '';

    // Initial user message
    conversationHistory.push({ role: 'user', content: userPrompt });

    while (turn < maxTurns) {
      turn++;

      // Build prompt with conversation history
      const historyPrompt = conversationHistory
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');

      const response = await llm.chat(historyPrompt, systemPrompt);
      lastResponse = response.content;

      this.emit({
        type: 'task_progress',
        taskId,
        timestamp: new Date(),
        data: { turn, tokensUsed: response.usage },
      });

      // Add assistant response to history
      conversationHistory.push({ role: 'assistant', content: lastResponse });

      // Check for tool calls
      if (!this.dispatcher) {
        // No dispatcher, single-turn only
        break;
      }

      const toolCalls = this.dispatcher.parseToolCalls(lastResponse);

      // Filter to allowed tools only (with alias resolution)
      const allowedCalls = toolCalls.filter(call => this.isToolAllowed(call.name, allowedTools));

      if (allowedCalls.length === 0) {
        // No tool calls, we're done
        break;
      }

      // Execute tools
      const dispatchResult = await this.dispatcher.dispatch(allowedCalls);

      // Format results for continuation
      const resultsText = dispatchResult.results
        .map(r => {
          if (r.success) {
            const data = typeof r.data === 'string' ? r.data : JSON.stringify(r.data, null, 2);
            return `Tool ${r.name} succeeded:\n${data}`;
          } else {
            return `Tool ${r.name} failed: ${r.error}`;
          }
        })
        .join('\n\n');

      // Add tool results as user message for next turn
      conversationHistory.push({
        role: 'user',
        content: `Tool execution results:\n\n${resultsText}\n\nContinue with your task based on these results.`,
      });

      this.emit({
        type: 'task_progress',
        taskId,
        timestamp: new Date(),
        data: { turn, toolsExecuted: allowedCalls.length, results: dispatchResult.results.length },
      });
    }

    return lastResponse;
  }

  /**
   * Resolve a tool name through aliases to its canonical name.
   * Handles cases where LLMs generate variations like "web-search"
   * instead of "brave_web_search".
   */
  private resolveToolAlias(name: string): string {
    const lowerName = name.toLowerCase().replace(/-/g, '_');
    return TOOL_ALIASES[lowerName] || TOOL_ALIASES[name] || name;
  }

  /**
   * Check if a tool call name matches any of the allowed tools,
   * considering aliases. E.g., if "brave_web_search" is allowed,
   * then "web-search" should also pass.
   */
  private isToolAllowed(callName: string, allowedTools: string[]): boolean {
    if (allowedTools.includes('*')) return true;

    // Direct match
    if (allowedTools.includes(callName)) return true;

    // Resolve the call name through aliases and check
    const resolved = this.resolveToolAlias(callName);
    if (resolved !== callName && allowedTools.includes(resolved)) return true;

    // Reverse check: resolve each allowed tool and see if it matches
    for (const allowed of allowedTools) {
      const resolvedAllowed = this.resolveToolAlias(allowed);
      if (resolvedAllowed === callName || resolvedAllowed === resolved) return true;
    }

    return false;
  }

  private timeoutPromise(ms: number, taskId: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Task ${taskId} timed out after ${ms}ms`));
      }, ms);
    });
  }

  private emit(event: SubagentEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let executorInstance: SubagentExecutor | null = null;

export function getSubagentExecutor(): SubagentExecutor {
  if (!executorInstance) {
    executorInstance = new SubagentExecutor();
  }
  return executorInstance;
}

export function resetSubagentExecutor(): void {
  executorInstance = null;
}
