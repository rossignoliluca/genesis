/**
 * Genesis v7.4.5 - Hooks System
 *
 * Execute custom shell commands in response to Genesis events.
 * Similar to git hooks or Claude Code hooks.
 *
 * Configuration (in ~/.genesis/hooks.json or .genesis-hooks.json):
 * ```json
 * {
 *   "hooks": {
 *     "pre-message": "echo 'Processing: $GENESIS_MESSAGE'",
 *     "post-message": "./scripts/log-response.sh",
 *     "pre-tool": "echo 'Calling tool: $GENESIS_TOOL_NAME'",
 *     "post-tool": "./scripts/audit-tool.sh",
 *     "session-start": "notify-send 'Genesis session started'",
 *     "session-end": "./scripts/summarize-session.sh"
 *   }
 * }
 * ```
 *
 * Environment variables passed to hooks:
 * - GENESIS_EVENT: Event name
 * - GENESIS_MESSAGE: User message (for message events)
 * - GENESIS_RESPONSE: AI response (for post-message)
 * - GENESIS_TOOL_NAME: Tool name (for tool events)
 * - GENESIS_TOOL_RESULT: Tool result (for post-tool)
 * - GENESIS_SESSION_ID: Current session ID
 * - GENESIS_WORKING_DIR: Working directory
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

// ============================================================================
// Types
// ============================================================================

/**
 * Available hook events
 */
export type HookEvent =
  | 'session-start'      // When chat session begins
  | 'session-end'        // When chat session ends
  | 'pre-message'        // Before processing user message
  | 'post-message'       // After generating response
  | 'pre-tool'           // Before executing a tool
  | 'post-tool'          // After tool execution
  | 'pre-subagent'       // Before spawning subagent
  | 'post-subagent'      // After subagent completes
  | 'error'              // On any error
  | 'prompt-submit';     // User submits input (like user-prompt-submit-hook)

/**
 * Hook configuration
 */
export interface HookConfig {
  command: string;        // Shell command to execute
  blocking?: boolean;     // Wait for completion (default: true for pre-*, false for post-*)
  timeout?: number;       // Timeout in ms (default: 30000)
  silent?: boolean;       // Suppress output (default: false)
  env?: Record<string, string>;  // Additional environment variables
}

/**
 * Full hooks configuration file
 */
export interface HooksConfig {
  hooks: Partial<Record<HookEvent, string | HookConfig>>;
  defaults?: {
    timeout?: number;
    silent?: boolean;
  };
}

/**
 * Context passed to hook execution
 */
export interface HookContext {
  event: HookEvent;
  message?: string;
  response?: string;
  toolName?: string;
  toolResult?: string;
  subagentType?: string;
  subagentResult?: string;
  sessionId?: string;
  workingDir?: string;
  error?: string;
  [key: string]: string | undefined;
}

/**
 * Result of hook execution
 */
export interface HookResult {
  event: HookEvent;
  success: boolean;
  blocked: boolean;      // If hook blocked the action
  output?: string;
  error?: string;
  duration: number;
}

// ============================================================================
// Hooks Manager
// ============================================================================

export class HooksManager {
  private config: HooksConfig | null = null;
  private configPath: string | null = null;
  private enabled = true;

  constructor() {
    this.loadConfig();
  }

  /**
   * Load hooks configuration from file
   * Priority: .genesis-hooks.json (local) > ~/.genesis/hooks.json (global)
   */
  private loadConfig(): void {
    const localPath = path.join(process.cwd(), '.genesis-hooks.json');
    const globalPath = path.join(homedir(), '.genesis', 'hooks.json');

    // Try local first
    if (fs.existsSync(localPath)) {
      try {
        const content = fs.readFileSync(localPath, 'utf-8');
        this.config = JSON.parse(content);
        this.configPath = localPath;
        return;
      } catch (err) {
        console.warn(`[Hooks] Error loading ${localPath}: ${err}`);
      }
    }

    // Try global
    if (fs.existsSync(globalPath)) {
      try {
        const content = fs.readFileSync(globalPath, 'utf-8');
        this.config = JSON.parse(content);
        this.configPath = globalPath;
        return;
      } catch (err) {
        console.warn(`[Hooks] Error loading ${globalPath}: ${err}`);
      }
    }

    // No config found - that's OK
    this.config = null;
    this.configPath = null;
  }

  /**
   * Reload configuration
   */
  reload(): void {
    this.loadConfig();
  }

  /**
   * Enable/disable hooks
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if hooks are configured
   */
  hasHooks(): boolean {
    return this.config !== null && Object.keys(this.config.hooks || {}).length > 0;
  }

  /**
   * Get configured hooks
   */
  getConfiguredHooks(): HookEvent[] {
    if (!this.config?.hooks) return [];
    return Object.keys(this.config.hooks) as HookEvent[];
  }

  /**
   * Get config path
   */
  getConfigPath(): string | null {
    return this.configPath;
  }

  /**
   * Execute hook for an event
   * @param event - The event that triggered the hook
   * @param context - Context data to pass to the hook
   * @returns HookResult or null if no hook configured
   */
  async execute(event: HookEvent, context: HookContext): Promise<HookResult | null> {
    if (!this.enabled || !this.config?.hooks) return null;

    const hookDef = this.config.hooks[event];
    if (!hookDef) return null;

    const startTime = Date.now();

    // Normalize hook definition
    const hook: HookConfig = typeof hookDef === 'string'
      ? { command: hookDef }
      : hookDef;

    // Determine if blocking
    const isBlocking = hook.blocking ?? event.startsWith('pre-');
    const timeout = hook.timeout ?? this.config.defaults?.timeout ?? 30000;
    const silent = hook.silent ?? this.config.defaults?.silent ?? false;

    // Build environment
    const env: Record<string, string> = {
      ...process.env,
      GENESIS_EVENT: event,
      GENESIS_WORKING_DIR: context.workingDir || process.cwd(),
      ...(context.message && { GENESIS_MESSAGE: context.message }),
      ...(context.response && { GENESIS_RESPONSE: context.response }),
      ...(context.toolName && { GENESIS_TOOL_NAME: context.toolName }),
      ...(context.toolResult && { GENESIS_TOOL_RESULT: context.toolResult }),
      ...(context.subagentType && { GENESIS_SUBAGENT_TYPE: context.subagentType }),
      ...(context.subagentResult && { GENESIS_SUBAGENT_RESULT: context.subagentResult }),
      ...(context.sessionId && { GENESIS_SESSION_ID: context.sessionId }),
      ...(context.error && { GENESIS_ERROR: context.error }),
      ...hook.env,
    } as Record<string, string>;

    try {
      if (isBlocking) {
        // Synchronous execution - waits for completion
        const output = execSync(hook.command, {
          env,
          timeout,
          stdio: silent ? 'pipe' : 'inherit',
          encoding: 'utf-8',
          shell: '/bin/sh',  // Use explicit shell path for type safety
        });

        return {
          event,
          success: true,
          blocked: false,
          output: output || undefined,
          duration: Date.now() - startTime,
        };
      } else {
        // Asynchronous execution - fire and forget
        const child = spawn(hook.command, [], {
          env,
          stdio: silent ? 'ignore' : 'inherit',
          shell: '/bin/sh',  // Use explicit shell path for type safety
          detached: true,
        });

        child.unref();

        return {
          event,
          success: true,
          blocked: false,
          duration: Date.now() - startTime,
        };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Check if hook explicitly blocked (exit code 77 = blocked)
      const errorWithStatus = err as { status?: number };
      const blocked = err instanceof Error && 'status' in err && errorWithStatus.status === 77;

      return {
        event,
        success: false,
        blocked,
        error: blocked ? 'Hook blocked the action' : errorMessage,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute multiple hooks for an event (if configured as array)
   * Currently just executes single hook, but structure allows expansion
   */
  async executeAll(event: HookEvent, context: HookContext): Promise<HookResult[]> {
    const result = await this.execute(event, context);
    return result ? [result] : [];
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _hooksManager: HooksManager | null = null;

export function getHooksManager(): HooksManager {
  if (!_hooksManager) {
    _hooksManager = new HooksManager();
  }
  return _hooksManager;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a sample hooks configuration file
 */
export function createSampleHooksConfig(filePath?: string): void {
  const targetPath = filePath || path.join(process.cwd(), '.genesis-hooks.json');

  const sampleConfig: HooksConfig = {
    hooks: {
      'session-start': 'echo "Genesis session started at $(date)"',
      'pre-message': {
        command: 'echo "Processing message..."',
        silent: true,
      },
      'post-tool': {
        command: 'echo "Tool $GENESIS_TOOL_NAME executed"',
        blocking: false,
      },
    },
    defaults: {
      timeout: 30000,
      silent: false,
    },
  };

  fs.writeFileSync(targetPath, JSON.stringify(sampleConfig, null, 2));
}

/**
 * Validate hooks configuration
 */
export function validateHooksConfig(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config || typeof config !== 'object') {
    errors.push('Config must be an object');
    return { valid: false, errors };
  }

  const cfg = config as Record<string, unknown>;

  if (!cfg.hooks || typeof cfg.hooks !== 'object') {
    errors.push('Config must have a "hooks" object');
    return { valid: false, errors };
  }

  const validEvents: HookEvent[] = [
    'session-start', 'session-end',
    'pre-message', 'post-message',
    'pre-tool', 'post-tool',
    'pre-subagent', 'post-subagent',
    'error', 'prompt-submit',
  ];

  for (const [event, hook] of Object.entries(cfg.hooks as object)) {
    if (!validEvents.includes(event as HookEvent)) {
      errors.push(`Unknown hook event: ${event}`);
    }

    if (typeof hook !== 'string' && typeof hook !== 'object') {
      errors.push(`Hook for ${event} must be a string or object`);
    }

    if (typeof hook === 'object' && hook !== null) {
      const hookObj = hook as Record<string, unknown>;
      if (!hookObj.command || typeof hookObj.command !== 'string') {
        errors.push(`Hook for ${event} must have a "command" string`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
