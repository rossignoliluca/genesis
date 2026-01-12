/**
 * 🛡️ Secure Shell Executor
 *
 * Implements OWASP AI Agent Security best practices:
 * - Command allowlist with risk classification
 * - shell: false (uses spawn with array args)
 * - Metacharacter blocking
 * - Timeout enforcement
 * - Output sanitization
 * - Audit logging
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html
 */

import { spawnSync, SpawnSyncReturns } from 'child_process';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export enum RiskLevel {
  LOW = 'low',           // Read-only, safe queries
  MEDIUM = 'medium',     // Write operations, local changes
  HIGH = 'high',         // Network, external comms
  CRITICAL = 'critical', // Irreversible, security-sensitive
}

export interface CommandConfig {
  command: string;
  allowedArgs?: string[];        // Specific allowed arguments (optional)
  blockedArgs?: RegExp[];        // Patterns to block
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  maxTimeout: number;            // ms
  description: string;
}

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  command: string;
  args: string[];
  riskLevel: RiskLevel;
  executionTime: number;
  blocked?: boolean;
  blockReason?: string;
}

export interface ExecutionRequest {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  confirmed?: boolean;  // Human-in-the-loop confirmation
}

export interface AuditEntry {
  timestamp: number;
  command: string;
  args: string[];
  riskLevel: RiskLevel;
  result: 'success' | 'failed' | 'blocked';
  reason?: string;
  executionTime?: number;
}

// ============================================================================
// Security Patterns
// ============================================================================

/**
 * Shell metacharacters that could enable injection attacks
 * Based on OWASP and NIST guidelines
 *
 * Note: We allow standard command flags (-m, --message, etc.)
 * Option injection is handled per-command via blockedArgs
 */
const DANGEROUS_PATTERNS: RegExp[] = [
  /[;&|`$(){}[\]<>\\]/,     // Shell operators
  /\.\./,                    // Path traversal
  /\n|\r/,                   // Newlines (command injection)
];

/**
 * Patterns that indicate data exfiltration attempts
 */
const EXFILTRATION_PATTERNS: RegExp[] = [
  /curl.*-d|wget.*--post/i,       // POST requests with data
  /base64.*\|.*curl/i,            // Encoded data to network
  /nc\s+-/i,                      // Netcat
  />(\/dev\/tcp|\/dev\/udp)/i,    // Bash network redirection
];

/**
 * Sensitive data patterns to redact from output
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  /api[_-]?key\s*[:=]\s*\S+/gi,
  /password\s*[:=]\s*\S+/gi,
  /token\s*[:=]\s*\S+/gi,
  /secret\s*[:=]\s*\S+/gi,
  /-----BEGIN.*PRIVATE KEY-----[\s\S]*?-----END.*PRIVATE KEY-----/g,
];

// ============================================================================
// Command Allowlist
// ============================================================================

/**
 * Allowlist of commands with their security configurations
 * Following principle of least privilege
 */
export const COMMAND_ALLOWLIST: Map<string, CommandConfig> = new Map([
  // 🟢 LOW RISK - Read operations
  ['ls', {
    command: 'ls',
    riskLevel: RiskLevel.LOW,
    requiresConfirmation: false,
    maxTimeout: 5000,
    description: 'List directory contents',
    blockedArgs: [/-R.*-a|--recursive/],  // Limit recursive depth
  }],
  ['cat', {
    command: 'cat',
    riskLevel: RiskLevel.LOW,
    requiresConfirmation: false,
    maxTimeout: 5000,
    description: 'Display file contents',
  }],
  ['head', {
    command: 'head',
    riskLevel: RiskLevel.LOW,
    requiresConfirmation: false,
    maxTimeout: 5000,
    description: 'Display first lines of file',
  }],
  ['tail', {
    command: 'tail',
    riskLevel: RiskLevel.LOW,
    requiresConfirmation: false,
    maxTimeout: 5000,
    description: 'Display last lines of file',
  }],
  ['pwd', {
    command: 'pwd',
    riskLevel: RiskLevel.LOW,
    requiresConfirmation: false,
    maxTimeout: 1000,
    description: 'Print working directory',
  }],
  ['echo', {
    command: 'echo',
    riskLevel: RiskLevel.LOW,
    requiresConfirmation: false,
    maxTimeout: 1000,
    description: 'Print text',
  }],
  ['wc', {
    command: 'wc',
    riskLevel: RiskLevel.LOW,
    requiresConfirmation: false,
    maxTimeout: 5000,
    description: 'Word/line count',
  }],
  ['date', {
    command: 'date',
    riskLevel: RiskLevel.LOW,
    requiresConfirmation: false,
    maxTimeout: 1000,
    description: 'Display date/time',
  }],
  ['which', {
    command: 'which',
    riskLevel: RiskLevel.LOW,
    requiresConfirmation: false,
    maxTimeout: 1000,
    description: 'Locate command',
  }],

  // 🟡 MEDIUM RISK - Git operations (local)
  ['git', {
    command: 'git',
    riskLevel: RiskLevel.MEDIUM,
    requiresConfirmation: false,
    maxTimeout: 30000,
    description: 'Git version control',
    allowedArgs: [
      'status', 'log', 'diff', 'branch', 'remote', 'show',
      'add', 'commit', 'checkout', 'stash', 'tag', 'fetch',
      'reset', 'restore', 'rev-parse', 'config',
    ],
    blockedArgs: [/--force|-f|--hard/],  // Block dangerous options
  }],

  // 🟠 HIGH RISK - Network and write operations
  ['git-push', {
    command: 'git',
    riskLevel: RiskLevel.HIGH,
    requiresConfirmation: true,  // Requires human confirmation
    maxTimeout: 60000,
    description: 'Push to remote repository',
    allowedArgs: ['push'],
  }],
  ['npm', {
    command: 'npm',
    riskLevel: RiskLevel.HIGH,
    requiresConfirmation: true,
    maxTimeout: 120000,
    description: 'Node package manager',
    allowedArgs: ['test', 'run', 'build', 'install', 'ci'],
    blockedArgs: [/publish|unpublish|deprecate/],  // Block publishing
  }],

  // 🔴 CRITICAL - Avoided entirely
  // No rm, chmod, chown, sudo, etc.
]);

// ============================================================================
// Secure Shell Executor
// ============================================================================

export class SecureShellExecutor {
  private auditLog: AuditEntry[] = [];
  private readonly maxAuditEntries = 1000;
  private readonly genesisRoot: string;
  private confirmationHandler?: (req: ExecutionRequest) => Promise<boolean>;

  constructor(genesisRoot: string) {
    this.genesisRoot = genesisRoot;
  }

  /**
   * Set handler for human-in-the-loop confirmations
   */
  setConfirmationHandler(handler: (req: ExecutionRequest) => Promise<boolean>): void {
    this.confirmationHandler = handler;
  }

  /**
   * Execute a command securely
   */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { command, args, cwd, env, timeout, confirmed } = request;

    // 1. Check allowlist
    const config = this.getCommandConfig(command, args);
    if (!config) {
      return this.blocked(command, args, 'Command not in allowlist', startTime);
    }

    // 2. Validate arguments for dangerous patterns
    const argValidation = this.validateArgs(args, config);
    if (!argValidation.valid) {
      this.logAudit(command, args, config.riskLevel, 'blocked', argValidation.reason);
      return this.blocked(command, args, argValidation.reason!, startTime);
    }

    // 3. Check for exfiltration patterns
    const fullCommand = `${command} ${args.join(' ')}`;
    for (const pattern of EXFILTRATION_PATTERNS) {
      if (pattern.test(fullCommand)) {
        return this.blocked(command, args, 'Potential data exfiltration detected', startTime);
      }
    }

    // 4. Handle confirmation for high-risk commands
    if (config.requiresConfirmation && !confirmed) {
      if (this.confirmationHandler) {
        const userConfirmed = await this.confirmationHandler(request);
        if (!userConfirmed) {
          return this.blocked(command, args, 'User declined confirmation', startTime);
        }
      } else {
        return this.blocked(command, args, 'Confirmation required but no handler set', startTime);
      }
    }

    // 5. Execute with spawn (shell: false for security)
    const effectiveTimeout = Math.min(timeout ?? config.maxTimeout, config.maxTimeout);
    const workingDir = this.resolveCwd(cwd);

    try {
      const result: SpawnSyncReturns<string> = spawnSync(config.command, args, {
        cwd: workingDir,
        env: { ...process.env, ...env },
        encoding: 'utf8',
        timeout: effectiveTimeout,
        shell: false,  // 🛡️ CRITICAL: Never use shell
        maxBuffer: 1024 * 1024,  // 1MB max output
      });

      const executionTime = Date.now() - startTime;
      const success = result.status === 0 && !result.error;

      // 6. Sanitize output
      const stdout = this.sanitizeOutput(result.stdout ?? '');
      const stderr = this.sanitizeOutput(result.stderr ?? '');

      this.logAudit(command, args, config.riskLevel, success ? 'success' : 'failed', undefined, executionTime);

      return {
        success,
        stdout,
        stderr,
        exitCode: result.status,
        command,
        args,
        riskLevel: config.riskLevel,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.logAudit(command, args, config.riskLevel, 'failed', String(error), executionTime);

      return {
        success: false,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: null,
        command,
        args,
        riskLevel: config.riskLevel,
        executionTime,
      };
    }
  }

  /**
   * Convenience method for git push with safety checks
   */
  async gitPush(remote: string = 'origin', branch?: string): Promise<ExecutionResult> {
    const args = ['push', remote];
    if (branch) args.push(branch);

    // Extra safety: check we're not force pushing
    if (args.some(a => a.includes('--force') || a === '-f')) {
      return this.blocked('git', args, 'Force push not allowed', Date.now());
    }

    return this.execute({
      command: 'git-push',
      args,
      confirmed: true,  // Assumes caller has confirmed
    });
  }

  /**
   * Get command configuration, handling special cases
   */
  private getCommandConfig(command: string, args: string[]): CommandConfig | null {
    // Special handling for git subcommands
    if (command === 'git' && args[0] === 'push') {
      return COMMAND_ALLOWLIST.get('git-push') ?? null;
    }

    const config = COMMAND_ALLOWLIST.get(command);
    if (!config) return null;

    // Check if subcommand is allowed
    if (config.allowedArgs && args.length > 0) {
      if (!config.allowedArgs.includes(args[0])) {
        return null;  // Subcommand not allowed
      }
    }

    return config;
  }

  /**
   * Validate arguments against security patterns
   */
  private validateArgs(args: string[], config: CommandConfig): { valid: boolean; reason?: string } {
    for (const arg of args) {
      // Check for shell metacharacters
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(arg)) {
          return { valid: false, reason: `Dangerous pattern in argument: ${arg}` };
        }
      }

      // Check config-specific blocked patterns
      if (config.blockedArgs) {
        for (const blocked of config.blockedArgs) {
          if (blocked.test(arg)) {
            return { valid: false, reason: `Blocked argument pattern: ${arg}` };
          }
        }
      }
    }

    return { valid: true };
  }

  /**
   * Sanitize output to remove sensitive data
   */
  private sanitizeOutput(output: string): string {
    let sanitized = output;
    for (const pattern of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }
    return sanitized;
  }

  /**
   * Resolve working directory safely
   */
  private resolveCwd(cwd?: string): string {
    if (!cwd) return this.genesisRoot;

    const resolved = path.resolve(this.genesisRoot, cwd);

    // Ensure we don't escape the genesis root
    if (!resolved.startsWith(this.genesisRoot)) {
      return this.genesisRoot;
    }

    return resolved;
  }

  /**
   * Create blocked result
   */
  private blocked(command: string, args: string[], reason: string, startTime: number): ExecutionResult {
    this.logAudit(command, args, RiskLevel.CRITICAL, 'blocked', reason);

    return {
      success: false,
      stdout: '',
      stderr: `Blocked: ${reason}`,
      exitCode: null,
      command,
      args,
      riskLevel: RiskLevel.CRITICAL,
      executionTime: Date.now() - startTime,
      blocked: true,
      blockReason: reason,
    };
  }

  /**
   * Log audit entry
   */
  private logAudit(
    command: string,
    args: string[],
    riskLevel: RiskLevel,
    result: 'success' | 'failed' | 'blocked',
    reason?: string,
    executionTime?: number
  ): void {
    this.auditLog.push({
      timestamp: Date.now(),
      command,
      args: [...args],  // Clone to prevent mutation
      riskLevel,
      result,
      reason,
      executionTime,
    });

    // Trim log if too large
    if (this.auditLog.length > this.maxAuditEntries) {
      this.auditLog = this.auditLog.slice(-this.maxAuditEntries);
    }
  }

  /**
   * Get audit log for analysis
   */
  getAuditLog(): AuditEntry[] {
    return [...this.auditLog];
  }

  /**
   * Get security statistics
   */
  getSecurityStats(): {
    totalExecutions: number;
    successRate: number;
    blockedCount: number;
    riskDistribution: Record<RiskLevel, number>;
  } {
    const stats = {
      totalExecutions: this.auditLog.length,
      successRate: 0,
      blockedCount: 0,
      riskDistribution: {
        [RiskLevel.LOW]: 0,
        [RiskLevel.MEDIUM]: 0,
        [RiskLevel.HIGH]: 0,
        [RiskLevel.CRITICAL]: 0,
      },
    };

    let successCount = 0;
    for (const entry of this.auditLog) {
      if (entry.result === 'success') successCount++;
      if (entry.result === 'blocked') stats.blockedCount++;
      stats.riskDistribution[entry.riskLevel]++;
    }

    stats.successRate = stats.totalExecutions > 0
      ? successCount / stats.totalExecutions
      : 0;

    return stats;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let shellExecutor: SecureShellExecutor | null = null;

export function getShellExecutor(genesisRoot?: string): SecureShellExecutor {
  if (!shellExecutor) {
    if (!genesisRoot) {
      throw new Error('genesisRoot required for first initialization');
    }
    shellExecutor = new SecureShellExecutor(genesisRoot);
  }
  return shellExecutor;
}

export function resetShellExecutor(): void {
  shellExecutor = null;
}
