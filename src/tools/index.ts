/**
 * Genesis Tools Module
 *
 * Provides Claude Code-equivalent tool capabilities:
 * - Bash: Secure command execution
 * - Edit: Diff-based file editing
 * - Git: Native git operations
 */

export * from './bash.js';
export * from './edit.js';
export * from './git.js';

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

// Register git tools
import { getGitTool, CommitOptions, PushOptions } from './git.js';

toolRegistry.set('git_status', {
  name: 'git_status',
  description: 'Get git repository status',
  execute: async (params: Record<string, unknown>) => {
    return getGitTool().status(params.cwd as string | undefined);
  },
});

toolRegistry.set('git_diff', {
  name: 'git_diff',
  description: 'Get diff of changes',
  execute: async (params: Record<string, unknown>) => {
    return getGitTool().diff({
      staged: params.staged as boolean | undefined,
      file: params.file as string | undefined,
    }, params.cwd as string | undefined);
  },
});

toolRegistry.set('git_log', {
  name: 'git_log',
  description: 'Get commit history',
  execute: async (params: Record<string, unknown>) => {
    return getGitTool().log({
      count: params.count as number | undefined,
      oneline: params.oneline as boolean | undefined,
    }, params.cwd as string | undefined);
  },
});

toolRegistry.set('git_add', {
  name: 'git_add',
  description: 'Stage files for commit',
  execute: async (params: Record<string, unknown>) => {
    const files = params.files as string[];
    if (!files || files.length === 0) {
      return { success: false, error: 'No files specified' };
    }
    return getGitTool().add(files, params.cwd as string | undefined);
  },
});

toolRegistry.set('git_commit', {
  name: 'git_commit',
  description: 'Create a commit',
  execute: async (params: Record<string, unknown>) => {
    const message = params.message as string;
    if (!message) {
      return { success: false, error: 'Missing commit message' };
    }
    return getGitTool().commit({
      message,
      addSignature: params.addSignature as boolean | undefined,
      files: params.files as string[] | undefined,
    }, params.cwd as string | undefined);
  },
});

toolRegistry.set('git_push', {
  name: 'git_push',
  description: 'Push to remote (requires confirmation)',
  execute: async (params: Record<string, unknown>) => {
    return getGitTool().push({
      remote: params.remote as string | undefined,
      branch: params.branch as string | undefined,
      setUpstream: params.setUpstream as boolean | undefined,
      force: params.force as boolean | undefined,
      confirmed: params.confirmed as boolean | undefined,
    }, params.cwd as string | undefined);
  },
});
