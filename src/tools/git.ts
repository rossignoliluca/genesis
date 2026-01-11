/**
 * Genesis Native Git Operations
 *
 * Git operations:
 * - status, diff, log (read-only, always safe)
 * - add, commit (with message templates)
 * - push (only with explicit confirmation)
 * - branch operations
 * - Safety guards for destructive operations
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// Types
// ============================================================================

export interface GitConfig {
  /** Default working directory */
  workingDirectory: string;
  /** Default commit signature */
  signature: string;
  /** Max timeout for git operations */
  maxTimeout: number;
  /** Block force push */
  blockForcePush: boolean;
  /** Block hard reset */
  blockHardReset: boolean;
  /** Require confirmation for push */
  requirePushConfirmation: boolean;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  conflicted: string[];
  isClean: boolean;
}

export interface GitDiff {
  files: DiffFile[];
  stats: { insertions: number; deletions: number; filesChanged: number };
  raw: string;
}

export interface DiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  insertions: number;
  deletions: number;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: Date;
  message: string;
}

export interface GitResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CommitOptions {
  message: string;
  /** Add signature to commit message */
  addSignature?: boolean;
  /** Files to stage before commit (default: all staged) */
  files?: string[];
}

export interface PushOptions {
  /** Remote name (default: origin) */
  remote?: string;
  /** Branch name (default: current) */
  branch?: string;
  /** Set upstream */
  setUpstream?: boolean;
  /** Force push (blocked by default) */
  force?: boolean;
  /** User confirmed push */
  confirmed?: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_GIT_CONFIG: GitConfig = {
  workingDirectory: process.cwd(),
  signature: '\n\n🤖 Generated with Genesis\n\nCo-Authored-By: Genesis <noreply@genesis.ai>',
  maxTimeout: 30000,
  blockForcePush: true,
  blockHardReset: true,
  requirePushConfirmation: true,
};

// ============================================================================
// Git Tool Class
// ============================================================================

export class GitTool {
  private config: GitConfig;

  constructor(config?: Partial<GitConfig>) {
    this.config = { ...DEFAULT_GIT_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // Core Git Execution
  // --------------------------------------------------------------------------

  /**
   * Execute a git command
   */
  private async exec(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const child = spawn('git', args, {
        cwd: cwd || this.config.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({ stdout, stderr: 'Git command timed out', exitCode: -1 });
      }, this.config.maxTimeout);

      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 0 });
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ stdout: '', stderr: err.message, exitCode: -1 });
      });
    });
  }

  // --------------------------------------------------------------------------
  // Read-Only Operations (Always Safe)
  // --------------------------------------------------------------------------

  /**
   * Get repository status
   */
  async status(cwd?: string): Promise<GitResult<GitStatus>> {
    const { stdout, stderr, exitCode } = await this.exec(['status', '--porcelain', '-b'], cwd);

    if (exitCode !== 0) {
      return { success: false, error: stderr || 'Not a git repository' };
    }

    const lines = stdout.split('\n').filter(l => l);
    const branchLine = lines.find(l => l.startsWith('##')) || '';

    // Parse branch info
    const branchMatch = branchLine.match(/^## (\S+?)(?:\.\.\.(\S+))?(?:\s+\[ahead (\d+)(?:, behind (\d+))?\])?$/);
    const branch = branchMatch?.[1] || 'unknown';
    const ahead = parseInt(branchMatch?.[3] || '0', 10);
    const behind = parseInt(branchMatch?.[4] || '0', 10);

    // Parse file status
    const staged: string[] = [];
    const unstaged: string[] = [];
    const untracked: string[] = [];
    const conflicted: string[] = [];

    for (const line of lines) {
      if (line.startsWith('##')) continue;

      const indexStatus = line[0];
      const workStatus = line[1];
      const file = line.slice(3);

      if (indexStatus === 'U' || workStatus === 'U' || (indexStatus === 'A' && workStatus === 'A') || (indexStatus === 'D' && workStatus === 'D')) {
        conflicted.push(file);
      } else if (indexStatus === '?') {
        untracked.push(file);
      } else {
        if (indexStatus !== ' ' && indexStatus !== '?') {
          staged.push(file);
        }
        if (workStatus !== ' ' && workStatus !== '?') {
          unstaged.push(file);
        }
      }
    }

    return {
      success: true,
      data: {
        branch,
        ahead,
        behind,
        staged,
        unstaged,
        untracked,
        conflicted,
        isClean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
      },
    };
  }

  /**
   * Get diff of changes
   */
  async diff(options?: { staged?: boolean; file?: string }, cwd?: string): Promise<GitResult<GitDiff>> {
    const args = ['diff', '--stat'];
    if (options?.staged) args.push('--staged');
    if (options?.file) args.push('--', options.file);

    const { stdout: statOutput, exitCode } = await this.exec(args, cwd);

    if (exitCode !== 0) {
      return { success: false, error: 'Failed to get diff' };
    }

    // Get raw diff
    const rawArgs = ['diff'];
    if (options?.staged) rawArgs.push('--staged');
    if (options?.file) rawArgs.push('--', options.file);
    const { stdout: rawDiff } = await this.exec(rawArgs, cwd);

    // Parse stats
    const lines = statOutput.split('\n').filter(l => l);
    const files: DiffFile[] = [];
    let insertions = 0;
    let deletions = 0;

    for (const line of lines) {
      // File line: "path/to/file.ts | 10 ++++----"
      const match = line.match(/^\s*(.+?)\s+\|\s+(\d+)\s*([+-]*)/);
      if (match) {
        const [, filePath, changes, symbols] = match;
        const ins = (symbols.match(/\+/g) || []).length;
        const del = (symbols.match(/-/g) || []).length;
        files.push({
          path: filePath.trim(),
          status: 'modified',
          insertions: ins,
          deletions: del,
        });
        insertions += ins;
        deletions += del;
      }
    }

    return {
      success: true,
      data: {
        files,
        stats: { insertions, deletions, filesChanged: files.length },
        raw: rawDiff,
      },
    };
  }

  /**
   * Get commit log
   */
  async log(options?: { count?: number; oneline?: boolean }, cwd?: string): Promise<GitResult<GitCommit[]>> {
    const count = options?.count || 10;
    const format = options?.oneline
      ? '%H|%h|%an|%ae|%ai|%s'
      : '%H|%h|%an|%ae|%ai|%B---END---';

    const { stdout, stderr, exitCode } = await this.exec([
      'log',
      `-${count}`,
      `--format=${format}`,
    ], cwd);

    if (exitCode !== 0) {
      return { success: false, error: stderr || 'Failed to get log' };
    }

    const commits: GitCommit[] = [];
    const entries = options?.oneline
      ? stdout.split('\n').filter(l => l)
      : stdout.split('---END---').filter(l => l.trim());

    for (const entry of entries) {
      const parts = entry.trim().split('|');
      if (parts.length >= 6) {
        commits.push({
          hash: parts[0],
          shortHash: parts[1],
          author: parts[2],
          email: parts[3],
          date: new Date(parts[4]),
          message: parts.slice(5).join('|').trim(),
        });
      }
    }

    return { success: true, data: commits };
  }

  /**
   * Get current branch name
   */
  async branch(cwd?: string): Promise<GitResult<string>> {
    const { stdout, exitCode } = await this.exec(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);

    if (exitCode !== 0) {
      return { success: false, error: 'Not a git repository or no commits' };
    }

    return { success: true, data: stdout };
  }

  /**
   * List all branches
   */
  async listBranches(cwd?: string): Promise<GitResult<{ current: string; branches: string[] }>> {
    const { stdout, exitCode } = await this.exec(['branch', '-a'], cwd);

    if (exitCode !== 0) {
      return { success: false, error: 'Failed to list branches' };
    }

    const branches: string[] = [];
    let current = '';

    for (const line of stdout.split('\n')) {
      if (line.startsWith('*')) {
        current = line.slice(2).trim();
        branches.push(current);
      } else if (line.trim()) {
        branches.push(line.trim());
      }
    }

    return { success: true, data: { current, branches } };
  }

  // --------------------------------------------------------------------------
  // Write Operations (With Safety)
  // --------------------------------------------------------------------------

  /**
   * Stage files for commit
   */
  async add(files: string[], cwd?: string): Promise<GitResult<void>> {
    if (files.length === 0) {
      return { success: false, error: 'No files specified' };
    }

    const { stderr, exitCode } = await this.exec(['add', ...files], cwd);

    if (exitCode !== 0) {
      return { success: false, error: stderr || 'Failed to stage files' };
    }

    return { success: true };
  }

  /**
   * Unstage files
   */
  async unstage(files: string[], cwd?: string): Promise<GitResult<void>> {
    const { stderr, exitCode } = await this.exec(['reset', 'HEAD', ...files], cwd);

    if (exitCode !== 0) {
      return { success: false, error: stderr || 'Failed to unstage files' };
    }

    return { success: true };
  }

  /**
   * Create a commit
   */
  async commit(options: CommitOptions, cwd?: string): Promise<GitResult<GitCommit>> {
    // Stage files if specified
    if (options.files && options.files.length > 0) {
      const addResult = await this.add(options.files, cwd);
      if (!addResult.success) {
        return { success: false, error: addResult.error };
      }
    }

    // Build commit message
    let message = options.message;
    if (options.addSignature !== false) {
      message += this.config.signature;
    }

    const { stdout, stderr, exitCode } = await this.exec([
      'commit',
      '-m',
      message,
    ], cwd);

    if (exitCode !== 0) {
      return { success: false, error: stderr || 'Failed to create commit' };
    }

    // Get the new commit info
    const logResult = await this.log({ count: 1 }, cwd);
    if (logResult.success && logResult.data && logResult.data.length > 0) {
      return { success: true, data: logResult.data[0] };
    }

    return { success: true, data: undefined };
  }

  /**
   * Push to remote
   */
  async push(options?: PushOptions, cwd?: string): Promise<GitResult<string>> {
    // Safety checks
    if (this.config.requirePushConfirmation && !options?.confirmed) {
      return { success: false, error: 'Push requires explicit confirmation. Set confirmed: true' };
    }

    if (options?.force && this.config.blockForcePush) {
      return { success: false, error: 'Force push is blocked for safety' };
    }

    const args = ['push'];

    if (options?.setUpstream) {
      args.push('-u');
    }

    if (options?.force && !this.config.blockForcePush) {
      args.push('--force-with-lease'); // Safer than --force
    }

    if (options?.remote) {
      args.push(options.remote);
    }

    if (options?.branch) {
      args.push(options.branch);
    }

    const { stdout, stderr, exitCode } = await this.exec(args, cwd);

    if (exitCode !== 0) {
      return { success: false, error: stderr || 'Failed to push' };
    }

    return { success: true, data: stdout || stderr || 'Push successful' };
  }

  /**
   * Create a new branch
   */
  async createBranch(name: string, options?: { checkout?: boolean }, cwd?: string): Promise<GitResult<void>> {
    const { stderr, exitCode } = await this.exec(['branch', name], cwd);

    if (exitCode !== 0) {
      return { success: false, error: stderr || 'Failed to create branch' };
    }

    if (options?.checkout) {
      return this.checkout(name, cwd);
    }

    return { success: true };
  }

  /**
   * Checkout a branch
   */
  async checkout(branch: string, cwd?: string): Promise<GitResult<void>> {
    const { stderr, exitCode } = await this.exec(['checkout', branch], cwd);

    if (exitCode !== 0) {
      return { success: false, error: stderr || 'Failed to checkout branch' };
    }

    return { success: true };
  }

  /**
   * Stash changes
   */
  async stash(options?: { message?: string; pop?: boolean }, cwd?: string): Promise<GitResult<void>> {
    const args = ['stash'];

    if (options?.pop) {
      args.push('pop');
    } else if (options?.message) {
      args.push('push', '-m', options.message);
    }

    const { stderr, exitCode } = await this.exec(args, cwd);

    if (exitCode !== 0) {
      return { success: false, error: stderr || 'Failed to stash' };
    }

    return { success: true };
  }

  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------

  /**
   * Check if directory is a git repository
   */
  async isRepo(cwd?: string): Promise<boolean> {
    const { exitCode } = await this.exec(['rev-parse', '--git-dir'], cwd);
    return exitCode === 0;
  }

  /**
   * Get remote URL
   */
  async getRemoteUrl(remote = 'origin', cwd?: string): Promise<GitResult<string>> {
    const { stdout, exitCode } = await this.exec(['remote', 'get-url', remote], cwd);

    if (exitCode !== 0) {
      return { success: false, error: 'Remote not found' };
    }

    return { success: true, data: stdout };
  }

  /**
   * Generate a commit message from staged changes
   */
  async generateCommitMessage(cwd?: string): Promise<GitResult<string>> {
    const diffResult = await this.diff({ staged: true }, cwd);
    if (!diffResult.success || !diffResult.data) {
      return { success: false, error: 'No staged changes' };
    }

    const { files, stats } = diffResult.data;

    if (files.length === 0) {
      return { success: false, error: 'No staged changes' };
    }

    // Simple heuristic-based message generation
    const fileTypes = new Set(files.map(f => path.extname(f.path)));
    const directories = new Set(files.map(f => path.dirname(f.path).split('/')[0]));

    let type = 'update';
    if (files.every(f => f.status === 'added')) type = 'add';
    if (files.some(f => f.path.includes('test'))) type = 'test';
    if (files.some(f => f.path.includes('fix'))) type = 'fix';
    if (files.length === 1 && files[0].path.includes('README')) type = 'docs';

    const scope = directories.size === 1 ? Array.from(directories)[0] : undefined;
    const scopePart = scope ? `(${scope})` : '';

    const message = `${type}${scopePart}: ${files.length} file(s) changed (+${stats.insertions}/-${stats.deletions})`;

    return { success: true, data: message };
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  getConfig(): GitConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<GitConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let gitToolInstance: GitTool | null = null;

export function getGitTool(config?: Partial<GitConfig>): GitTool {
  if (!gitToolInstance) {
    gitToolInstance = new GitTool(config);
  } else if (config) {
    gitToolInstance.updateConfig(config);
  }
  return gitToolInstance;
}

export function resetGitTool(): void {
  gitToolInstance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

export async function gitStatus(cwd?: string): Promise<GitResult<GitStatus>> {
  return getGitTool().status(cwd);
}

export async function gitDiff(options?: { staged?: boolean; file?: string }, cwd?: string): Promise<GitResult<GitDiff>> {
  return getGitTool().diff(options, cwd);
}

export async function gitLog(options?: { count?: number }, cwd?: string): Promise<GitResult<GitCommit[]>> {
  return getGitTool().log(options, cwd);
}

export async function gitAdd(files: string[], cwd?: string): Promise<GitResult<void>> {
  return getGitTool().add(files, cwd);
}

export async function gitCommit(options: CommitOptions, cwd?: string): Promise<GitResult<GitCommit>> {
  return getGitTool().commit(options, cwd);
}

export async function gitPush(options?: PushOptions, cwd?: string): Promise<GitResult<string>> {
  return getGitTool().push(options, cwd);
}
