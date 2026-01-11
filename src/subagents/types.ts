/**
 * Genesis v7.4 - Subagent System Types
 *
 * Enables parallel subprocess execution for complex tasks.
 * Inspired by Claude Code's Task tool with specialized agents.
 */

// ============================================================================
// Subagent Types
// ============================================================================

/**
 * Built-in subagent types
 */
export type SubagentType =
  | 'explore'      // Fast codebase exploration (read-only)
  | 'plan'         // Architecture planning
  | 'code'         // Code generation/modification
  | 'research'     // Web/paper research
  | 'general';     // General-purpose

/**
 * Subagent definition
 */
export interface SubagentDefinition {
  name: SubagentType | string;
  description: string;
  systemPrompt: string;
  tools: string[];           // Allowed tools
  disallowedTools?: string[]; // Blocked tools
  model?: 'fast' | 'balanced' | 'powerful'; // Model tier
  maxTokens?: number;
  timeout?: number;          // ms
}

/**
 * Task request to spawn a subagent
 */
export interface TaskRequest {
  description: string;       // Short description (3-5 words)
  prompt: string;            // Full task prompt
  subagentType: SubagentType | string;
  runInBackground?: boolean;
  model?: 'fast' | 'balanced' | 'powerful';
}

/**
 * Task result from subagent
 */
export interface TaskResult {
  taskId: string;
  subagentType: string;
  success: boolean;
  result?: string;
  error?: string;
  duration: number;          // ms
  tokensUsed?: {
    input: number;
    output: number;
  };
}

/**
 * Background task status
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Background task tracking
 */
export interface BackgroundTask {
  taskId: string;
  description: string;
  subagentType: string;
  status: TaskStatus;
  startTime: number;
  endTime?: number;
  result?: TaskResult;
  output: string[];          // Buffered output
}

// ============================================================================
// Subagent Events
// ============================================================================

export type SubagentEventType =
  | 'task_start'
  | 'task_progress'
  | 'task_complete'
  | 'task_error'
  | 'task_cancelled';

export interface SubagentEvent {
  type: SubagentEventType;
  taskId: string;
  timestamp: Date;
  data?: unknown;
}

export type SubagentEventHandler = (event: SubagentEvent) => void;

// ============================================================================
// Configuration
// ============================================================================

export interface SubagentConfig {
  maxConcurrent: number;     // Max parallel subagents
  defaultTimeout: number;    // Default timeout (ms)
  outputBufferSize: number;  // Max buffered output lines
}

export const DEFAULT_SUBAGENT_CONFIG: SubagentConfig = {
  maxConcurrent: 5,
  defaultTimeout: 300000,    // 5 minutes
  outputBufferSize: 1000,
};
