/**
 * Genesis Tools Module
 *
 * Provides Claude Code-equivalent tool capabilities:
 * - Bash: Secure command execution
 * - Edit: Diff-based file editing
 * - Git: Native git operations (TODO)
 */

export * from './bash.js';
export * from './edit.js';

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
import { getBashTool, BashOptions } from './bash.js';

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

// Register edit tool
import { getEditTool, EditParams } from './edit.js';

toolRegistry.set('edit', {
  name: 'edit',
  description: 'Edit files using diff-based replacement',
  execute: async (params: Record<string, unknown>) => {
    return getEditTool().edit({
      file_path: params.file_path as string,
      old_string: params.old_string as string,
      new_string: params.new_string as string,
      replace_all: params.replace_all as boolean | undefined,
    });
  },
  validate: (params: Record<string, unknown>) => {
    const file_path = params.file_path as string | undefined;
    const old_string = params.old_string as string | undefined;
    const new_string = params.new_string as string | undefined;
    if (!file_path) return { valid: false, reason: 'Missing file_path parameter' };
    if (!old_string) return { valid: false, reason: 'Missing old_string parameter' };
    if (new_string === undefined) return { valid: false, reason: 'Missing new_string parameter' };
    return getEditTool().validatePath(file_path);
  },
});

toolRegistry.set('write', {
  name: 'write',
  description: 'Write content to a file',
  execute: async (params: Record<string, unknown>) => {
    const { file_path, content, backup } = params;
    return getEditTool().write({
      file_path: file_path as string,
      content: content as string,
      backup: backup as boolean | undefined,
    });
  },
  validate: (params: Record<string, unknown>) => {
    const { file_path, content } = params;
    if (!file_path) return { valid: false, reason: 'Missing file_path parameter' };
    if (content === undefined) return { valid: false, reason: 'Missing content parameter' };
    return getEditTool().validatePath(file_path as string);
  },
});
