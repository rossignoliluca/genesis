/**
 * Genesis Tools Module
 *
 * Provides Claude Code-equivalent tool capabilities:
 * - Bash: Secure command execution
 * - Edit: Diff-based file editing (TODO)
 * - Git: Native git operations (TODO)
 */

export * from './bash';

// Tool registry for agent dispatch
export interface Tool {
  name: string;
  description: string;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
  validate?: (params: Record<string, unknown>) => { valid: boolean; reason?: string };
}

// Will be populated as tools are added
export const toolRegistry: Map<string, Tool> = new Map();

// Register bash tool
import { getBashTool, BashOptions } from './bash';

toolRegistry.set('bash', {
  name: 'bash',
  description: 'Execute shell commands in a secure sandbox',
  execute: async (params: Record<string, unknown>) => {
    const command = params.command as string;
    const options = params.options as BashOptions | undefined;
    return getBashTool().execute(command, options);
  },
  validate: (params: Record<string, unknown>) => {
    const command = params.command as string;
    if (!command) {
      return { valid: false, reason: 'Missing command parameter' };
    }
    const result = getBashTool().validate(command);
    return { valid: result.valid, reason: result.reason };
  },
});
