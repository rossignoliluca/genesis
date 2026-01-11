/**
 * Genesis v7.4 - Subagent System
 *
 * Parallel subprocess execution for complex tasks.
 * Equivalent to Claude Code's Task tool.
 *
 * Usage:
 * ```typescript
 * import { getSubagentExecutor, TaskRequest } from './subagents/index.js';
 *
 * const executor = getSubagentExecutor();
 *
 * // Synchronous execution
 * const result = await executor.execute({
 *   description: 'Find auth handlers',
 *   prompt: 'Search for authentication handling code',
 *   subagentType: 'explore',
 * });
 *
 * // Background execution
 * const taskId = await executor.executeBackground({
 *   description: 'Research OAuth patterns',
 *   prompt: 'Find best practices for OAuth2 implementation',
 *   subagentType: 'research',
 *   runInBackground: true,
 * });
 *
 * // Check status
 * const task = executor.getTask(taskId);
 *
 * // Wait for completion
 * const result = await executor.waitForTask(taskId);
 * ```
 */

export * from './types.js';
export * from './registry.js';
export * from './executor.js';
