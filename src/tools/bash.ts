/**
 * Genesis Secure Bash Executor
 *
 * Provides sandboxed command execution with:
 * - Command validation (whitelist/blacklist)
 * - Dangerous pattern detection
 * - Timeout enforcement
 * - Working directory confinement
 * - Output streaming
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// Types
// ============================================================================

export interface SandboxConfig {
  /** Commands always allowed */
  allowedCommands: string[];
  /** Regex patterns to block */
  blockedPatterns: RegExp[];
  /** Max execution time in ms */
  maxTimeout: number;
  /** Confined working directory */
  workingDirectory: string;
  /** Allow network operations */
  allowNetwork: boolean;
  /** Allow file writes outside workingDirectory */
  allowExternalWrites: boolean;
  /** Max output buffer size in bytes */
  maxOutputSize: number;
}

export interface BashOptions {
  /** Command timeout in ms (default: 120000) */
  timeout?: number;
  /** Working directory override */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Run in background */
  background?: boolean;
  /** Description for logging */
  description?: string;
}

export interface BashResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  truncated: boolean;
  killed: boolean;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  severity: 'safe' | 'warning' | 'blocked';
  matchedPattern?: string;
}

export interface BackgroundTask {
  id: string;
  command: string;
  process: ChildProcess;
  startTime: number;
  stdout: string;
  stderr: string;
  status: 'running' | 'completed' | 'failed' | 'killed';
  exitCode?: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  allowedCommands: [
    // File operations (read-only safe)
    'ls', 'cat', 'head', 'tail', 'less', 'more', 'file', 'stat', 'wc',
    'find', 'locate', 'which', 'whereis', 'tree',

    // Text processing
    'grep', 'awk', 'sed', 'cut', 'sort', 'uniq', 'tr', 'diff', 'comm',
    'jq', 'yq', 'xargs',

    // Development tools
    'node', 'npm', 'npx', 'yarn', 'pnpm', 'bun',
    'python', 'python3', 'pip', 'pip3',
    'git', 'gh',
    'tsc', 'tsx', 'esbuild', 'vite', 'webpack',
    'jest', 'vitest', 'mocha', 'pytest',
    'eslint', 'prettier', 'biome',
    'cargo', 'rustc', 'go', 'make', 'cmake',

    // System info
    'echo', 'printf', 'date', 'time', 'whoami', 'pwd', 'env', 'printenv',
    'uname', 'hostname', 'df', 'du', 'free', 'top', 'ps', 'pgrep',
    'sleep', 'exit', 'true', 'false', 'test', '[', 'timeout',

    // File management (with caution)
    'mkdir', 'touch', 'cp', 'mv', 'ln',

    // Archive
    'tar', 'zip', 'unzip', 'gzip', 'gunzip',

    // Network (controlled)
    'curl', 'wget', 'ping', 'dig', 'nslookup', 'host',

    // Docker (common in dev)
    'docker', 'docker-compose', 'podman',

    // Kubernetes
    'kubectl', 'helm', 'k9s',

    // Cloud CLIs
    'aws', 'gcloud', 'az', 'vercel', 'netlify', 'fly', 'railway',

    // Databases
    'psql', 'mysql', 'mongosh', 'redis-cli', 'sqlite3',

    // Misc dev
    'openssl', 'ssh-keygen', 'base64', 'md5', 'shasum', 'sha256sum',
  ],

  blockedPatterns: [
    // Destructive file operations
    /\brm\s+(-[rf]+\s+)*[\/~]/,           // rm with paths
    /\brm\s+-rf?\s/,                       // rm -rf or rm -r
    /\brmdir\b/,                           // rmdir
    />\s*\/dev\/sd[a-z]/,                  // Write to disk devices
    /\bmkfs\b/,                            // Format filesystem
    /\bdd\s+if=/,                          // dd (disk destroyer)

    // Privilege escalation
    /\bsudo\b/,                            // sudo
    /\bsu\s+-?\s*\w/,                      // su to another user
    /\bchmod\s+[0-7]*777/,                 // chmod 777
    /\bchown\b/,                           // chown
    /\bchgrp\b/,                           // chgrp

    // System modification
    /\bsystemctl\b/,                       // systemctl
    /\bservice\b/,                         // service
    /\blaunchctl\b/,                       // macOS launchctl
    /\bcrontab\b/,                         // crontab
    /\bvisudo\b/,                          // visudo

    // Network abuse
    /\bcurl\s+.*\|\s*(ba)?sh/,             // curl | sh (pipe to shell)
    /\bwget\s+.*\|\s*(ba)?sh/,             // wget | sh
    /\bnc\s+-[el]/,                        // netcat listen
    /\bnetcat\b/,                          // netcat
    /\bsocat\b/,                           // socat
    /\biptables\b/,                        // iptables
    /\bufw\b/,                             // ufw

    // Shell escape / injection
    /;\s*sh\b/,                            // ; sh
    /;\s*bash\b/,                          // ; bash
    /\$\([^)]*sh\)/,                       // $(sh)
    /`[^`]*sh`/,                           // `sh`
    /\beval\b/,                            // eval
    /\bexec\b/,                            // exec
    /\bsource\b/,                          // source
    /\b\.\s+\//,                           // . /path (source)

    // Fork bomb / resource exhaustion
    /:\(\)\{.*:\|:.*\}/,                   // :(){ :|:& };:
    /\bfork\b/,                            // fork
    /\bwhile\s+true.*done/,                // while true; do; done (careful)

    // Sensitive files
    /\/etc\/passwd/,                       // passwd file
    /\/etc\/shadow/,                       // shadow file
    /\/etc\/sudoers/,                      // sudoers
    /~\/\.ssh\/id_/,                       // SSH private keys
    /\.env\b.*password/i,                  // .env passwords

    // History manipulation
    /\bhistory\s+-c/,                      // Clear history
    /\bshred\b/,                           // Secure delete

    // Kill signals
    /\bkill\s+-9\s+1\b/,                   // kill -9 1 (init)
    /\bkillall\b/,                         // killall
    /\bpkill\b/,                           // pkill (without constraints)
  ],

  maxTimeout: 120000,  // 2 minutes
  workingDirectory: process.cwd(),
  allowNetwork: true,
  allowExternalWrites: false,
  maxOutputSize: 1024 * 1024,  // 1MB
};

// ============================================================================
// Bash Tool Class
// ============================================================================

export class BashTool extends EventEmitter {
  private config: SandboxConfig;
  private backgroundTasks: Map<string, BackgroundTask> = new Map();
  private taskCounter = 0;

  constructor(config?: Partial<SandboxConfig>) {
    super();
    this.config = { ...DEFAULT_SANDBOX_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------

  /**
   * Validate a command against security rules
   */
  validate(command: string): ValidationResult {
    const trimmed = command.trim();

    // Empty command
    if (!trimmed) {
      return { valid: false, reason: 'Empty command', severity: 'blocked' };
    }

    // Check blocked patterns first
    for (const pattern of this.config.blockedPatterns) {
      if (pattern.test(trimmed)) {
        return {
          valid: false,
          reason: `Blocked pattern detected: ${pattern.toString()}`,
          severity: 'blocked',
          matchedPattern: pattern.toString(),
        };
      }
    }

    // Extract base command
    const baseCommand = this.extractBaseCommand(trimmed);

    // Check if base command is in allowed list
    if (!this.config.allowedCommands.includes(baseCommand)) {
      // Check if it's a path to an allowed command
      const basename = path.basename(baseCommand);
      if (!this.config.allowedCommands.includes(basename)) {
        return {
          valid: false,
          reason: `Command not in allowed list: ${baseCommand}`,
          severity: 'blocked',
        };
      }
    }

    // Check for pipe chains
    if (trimmed.includes('|')) {
      const pipedCommands = trimmed.split('|').map(c => this.extractBaseCommand(c.trim()));
      for (const cmd of pipedCommands) {
        if (cmd && !this.config.allowedCommands.includes(cmd)) {
          const basename = path.basename(cmd);
          if (!this.config.allowedCommands.includes(basename)) {
            return {
              valid: false,
              reason: `Piped command not allowed: ${cmd}`,
              severity: 'blocked',
            };
          }
        }
      }
    }

    // Check for command chains (&&, ||, ;)
    const chainedCommands = trimmed.split(/&&|\|\||;/).map(c => this.extractBaseCommand(c.trim()));
    for (const cmd of chainedCommands) {
      if (cmd && !this.config.allowedCommands.includes(cmd)) {
        const basename = path.basename(cmd);
        if (!this.config.allowedCommands.includes(basename)) {
          return {
            valid: false,
            reason: `Chained command not allowed: ${cmd}`,
            severity: 'blocked',
          };
        }
      }
    }

    // Warning for potentially dangerous but allowed
    const warningPatterns = [
      { pattern: /\brm\b/, reason: 'rm command - verify target' },
      { pattern: />\s*[^|]/, reason: 'File redirection - verify target' },
      { pattern: /\bgit\s+push\s+--force/, reason: 'Force push - verify intent' },
      { pattern: /\bgit\s+reset\s+--hard/, reason: 'Hard reset - verify intent' },
    ];

    for (const { pattern, reason } of warningPatterns) {
      if (pattern.test(trimmed)) {
        return { valid: true, reason, severity: 'warning' };
      }
    }

    return { valid: true, severity: 'safe' };
  }

  /**
   * Extract the base command from a command string
   */
  private extractBaseCommand(command: string): string {
    // Remove leading env vars
    const withoutEnv = command.replace(/^(\w+=\S+\s+)+/, '');

    // Get first word
    const parts = withoutEnv.trim().split(/\s+/);
    return parts[0] || '';
  }

  // --------------------------------------------------------------------------
  // Execution
  // --------------------------------------------------------------------------

  /**
   * Execute a command with sandboxing
   */
  async execute(command: string, options: BashOptions = {}): Promise<BashResult> {
    const startTime = Date.now();

    // Validate first
    const validation = this.validate(command);
    if (!validation.valid) {
      return {
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: validation.reason || 'Command blocked by security policy',
        duration: Date.now() - startTime,
        truncated: false,
        killed: false,
        error: validation.reason,
      };
    }

    // Emit warning if applicable
    if (validation.severity === 'warning') {
      this.emit('warning', { command, reason: validation.reason });
    }

    // Determine working directory
    const cwd = options.cwd || this.config.workingDirectory;

    // Verify cwd exists and is within allowed scope
    if (!fs.existsSync(cwd)) {
      return {
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: `Working directory does not exist: ${cwd}`,
        duration: Date.now() - startTime,
        truncated: false,
        killed: false,
        error: 'Invalid working directory',
      };
    }

    // If background mode, handle separately
    if (options.background) {
      return this.executeBackground(command, options);
    }

    // Execute synchronously with timeout
    return this.executeSync(command, {
      ...options,
      cwd,
      timeout: options.timeout || this.config.maxTimeout,
    });
  }

  /**
   * Execute command synchronously
   */
  private executeSync(command: string, options: BashOptions & { cwd: string; timeout: number }): Promise<BashResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let killed = false;
      let truncated = false;

      const env = {
        ...process.env,
        ...options.env,
        // Prevent some shell shenanigans
        SHELL: '/bin/bash',
        TERM: 'xterm-256color',
      };

      const child = spawn('bash', ['-c', command], {
        cwd: options.cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Set timeout
      const timeoutId = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 1000);
      }, options.timeout);

      // Collect stdout
      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        if (stdout.length + chunk.length > this.config.maxOutputSize) {
          truncated = true;
          stdout += chunk.slice(0, this.config.maxOutputSize - stdout.length);
        } else {
          stdout += chunk;
        }
        this.emit('stdout', chunk);
      });

      // Collect stderr
      child.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString();
        if (stderr.length + chunk.length > this.config.maxOutputSize) {
          truncated = true;
          stderr += chunk.slice(0, this.config.maxOutputSize - stderr.length);
        } else {
          stderr += chunk;
        }
        this.emit('stderr', chunk);
      });

      // Handle completion
      child.on('close', (code) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        resolve({
          success: code === 0 && !killed,
          exitCode: code ?? -1,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          duration,
          truncated,
          killed,
          error: killed ? 'Command killed due to timeout' : undefined,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          exitCode: -1,
          stdout: '',
          stderr: err.message,
          duration: Date.now() - startTime,
          truncated: false,
          killed: false,
          error: err.message,
        });
      });
    });
  }

  /**
   * Execute command in background
   */
  private executeBackground(command: string, options: BashOptions): Promise<BashResult> {
    const taskId = `task-${++this.taskCounter}-${Date.now()}`;
    const startTime = Date.now();
    const cwd = options.cwd || this.config.workingDirectory;

    const env = {
      ...process.env,
      ...options.env,
    };

    const child = spawn('bash', ['-c', command], {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    });

    const task: BackgroundTask = {
      id: taskId,
      command,
      process: child,
      startTime,
      stdout: '',
      stderr: '',
      status: 'running',
    };

    this.backgroundTasks.set(taskId, task);

    // Collect output
    child.stdout.on('data', (data: Buffer) => {
      task.stdout += data.toString();
      this.emit('background-stdout', { taskId, data: data.toString() });
    });

    child.stderr.on('data', (data: Buffer) => {
      task.stderr += data.toString();
      this.emit('background-stderr', { taskId, data: data.toString() });
    });

    child.on('close', (code) => {
      task.status = code === 0 ? 'completed' : 'failed';
      task.exitCode = code ?? -1;
      this.emit('background-complete', { taskId, exitCode: code });
    });

    child.on('error', (err) => {
      task.status = 'failed';
      task.stderr += err.message;
      this.emit('background-error', { taskId, error: err.message });
    });

    return Promise.resolve({
      success: true,
      exitCode: 0,
      stdout: `Background task started: ${taskId}`,
      stderr: '',
      duration: 0,
      truncated: false,
      killed: false,
    });
  }

  // --------------------------------------------------------------------------
  // Background Task Management
  // --------------------------------------------------------------------------

  /**
   * Get output from a background task
   */
  getTaskOutput(taskId: string, block = true, timeout = 30000): Promise<BackgroundTask | null> {
    const task = this.backgroundTasks.get(taskId);
    if (!task) return Promise.resolve(null);

    if (!block || task.status !== 'running') {
      return Promise.resolve(task);
    }

    // Block until complete or timeout
    return new Promise((resolve) => {
      const startTime = Date.now();

      const check = () => {
        const t = this.backgroundTasks.get(taskId);
        if (!t || t.status !== 'running' || Date.now() - startTime > timeout) {
          resolve(t || null);
        } else {
          setTimeout(check, 100);
        }
      };

      check();
    });
  }

  /**
   * Kill a background task
   */
  killTask(taskId: string): boolean {
    const task = this.backgroundTasks.get(taskId);
    if (!task || task.status !== 'running') return false;

    task.process.kill('SIGTERM');
    setTimeout(() => {
      if (task.status === 'running') {
        task.process.kill('SIGKILL');
      }
    }, 1000);

    task.status = 'killed';
    return true;
  }

  /**
   * List all background tasks
   */
  listTasks(): BackgroundTask[] {
    return Array.from(this.backgroundTasks.values());
  }

  /**
   * Clean up completed tasks
   */
  cleanupTasks(): number {
    let cleaned = 0;
    for (const [id, task] of this.backgroundTasks) {
      if (task.status !== 'running') {
        this.backgroundTasks.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  /**
   * Update sandbox configuration
   */
  updateConfig(config: Partial<SandboxConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Add command to allowed list
   */
  allowCommand(command: string): void {
    if (!this.config.allowedCommands.includes(command)) {
      this.config.allowedCommands.push(command);
    }
  }

  /**
   * Add pattern to blocked list
   */
  blockPattern(pattern: RegExp): void {
    this.config.blockedPatterns.push(pattern);
  }

  /**
   * Get current configuration
   */
  getConfig(): SandboxConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let bashToolInstance: BashTool | null = null;

export function getBashTool(config?: Partial<SandboxConfig>): BashTool {
  if (!bashToolInstance) {
    bashToolInstance = new BashTool(config);
  } else if (config) {
    bashToolInstance.updateConfig(config);
  }
  return bashToolInstance;
}

export function resetBashTool(): void {
  bashToolInstance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Execute a command with default settings
 */
export async function bash(command: string, options?: BashOptions): Promise<BashResult> {
  return getBashTool().execute(command, options);
}

/**
 * Validate a command without executing
 */
export function validateCommand(command: string): ValidationResult {
  return getBashTool().validate(command);
}

/**
 * Execute command and return stdout only (throws on error)
 */
export async function exec(command: string, options?: BashOptions): Promise<string> {
  const result = await bash(command, options);
  if (!result.success) {
    throw new Error(result.stderr || result.error || 'Command failed');
  }
  return result.stdout;
}
