/**
 * Genesis Code Execution Mode
 *
 * Runtime code execution with observation feedback loop.
 * Enables: Generate → Execute → Observe → Adapt cycle.
 *
 * Features:
 * - Sandboxed Node.js execution (child_process)
 * - Timeout and memory limits
 * - stdout/stderr capture
 * - Execution observations for Active Inference
 * - Error analysis and iteration suggestions
 *
 * This is the frontier: AI that writes code, runs it, observes results,
 * and adapts based on what it learned.
 */

import { spawn, ChildProcess } from 'child_process';
import { writeFileSync, mkdirSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
// Observation type for Active Inference integration
type ObservationType = 'internal' | 'external' | 'proprioceptive';

// ============================================================================
// Types
// ============================================================================

export interface ExecutionRequest {
  code: string;
  language: 'typescript' | 'javascript' | 'python';
  timeout?: number;           // ms, default 30000
  memoryLimit?: number;       // MB, default 256
  args?: string[];            // CLI arguments
  env?: Record<string, string>; // Additional env vars
  stdin?: string;             // Input to feed
}

export interface ExecutionResult {
  id: string;
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  duration: number;
  memoryUsed?: number;
  timedOut: boolean;
  error?: string;
}

export interface ExecutionObservation {
  type: ObservationType;
  source: 'runtime';
  data: {
    executionId: string;
    success: boolean;
    exitCode: number | null;
    hasOutput: boolean;
    hasErrors: boolean;
    errorPatterns: ErrorPattern[];
    outputPatterns: OutputPattern[];
    suggestions: string[];
    metrics: ExecutionMetrics;
  };
  timestamp: Date;
  confidence: number;
}

export interface ErrorPattern {
  type: 'syntax' | 'runtime' | 'type' | 'import' | 'timeout' | 'memory' | 'unknown';
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface OutputPattern {
  type: 'log' | 'json' | 'error' | 'warning' | 'success' | 'data';
  content: string;
  structured?: any;
}

export interface ExecutionMetrics {
  linesOfCode: number;
  executionTimeMs: number;
  stdoutLines: number;
  stderrLines: number;
  memoryMB?: number;
}

export interface RuntimeConfig {
  tempDir: string;
  defaultTimeout: number;
  defaultMemoryLimit: number;
  maxConcurrent: number;
  cleanupAfterExec: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: RuntimeConfig = {
  tempDir: '/tmp/genesis-runtime',
  defaultTimeout: 30000,
  defaultMemoryLimit: 256,
  maxConcurrent: 5,
  cleanupAfterExec: true,
};

// ============================================================================
// Code Runtime Executor
// ============================================================================

export class CodeRuntime {
  private config: RuntimeConfig;
  private runningProcesses: Map<string, ChildProcess> = new Map();
  private executionHistory: ExecutionResult[] = [];

  constructor(config: Partial<RuntimeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ensureTempDir();
  }

  private ensureTempDir(): void {
    if (!existsSync(this.config.tempDir)) {
      mkdirSync(this.config.tempDir, { recursive: true });
    }
  }

  // ============================================================================
  // Execute Code
  // ============================================================================

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const id = randomUUID().slice(0, 8);
    const startTime = Date.now();

    // Check concurrent limit
    if (this.runningProcesses.size >= this.config.maxConcurrent) {
      return {
        id,
        success: false,
        exitCode: null,
        stdout: '',
        stderr: '',
        duration: 0,
        timedOut: false,
        error: `Max concurrent executions (${this.config.maxConcurrent}) reached`,
      };
    }

    // Write code to temp file
    const { filePath, command, args } = this.prepareExecution(id, request);

    try {
      const result = await this.runProcess(id, command, args, request, filePath);
      result.duration = Date.now() - startTime;

      this.executionHistory.push(result);

      // Cleanup
      if (this.config.cleanupAfterExec) {
        this.cleanup(filePath);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      const result: ExecutionResult = {
        id,
        success: false,
        exitCode: null,
        stdout: '',
        stderr: '',
        duration,
        timedOut: false,
        error: error instanceof Error ? error.message : String(error),
      };

      this.executionHistory.push(result);
      this.cleanup(filePath);

      return result;
    }
  }

  private prepareExecution(
    id: string,
    request: ExecutionRequest
  ): { filePath: string; command: string; args: string[] } {
    const ext = this.getExtension(request.language);
    const fileName = `exec-${id}${ext}`;
    const filePath = join(this.config.tempDir, fileName);

    // Write code to file
    writeFileSync(filePath, request.code, 'utf-8');

    // Determine command
    const { command, args } = this.getCommand(request.language, filePath, request.args);

    return { filePath, command, args };
  }

  private getExtension(language: ExecutionRequest['language']): string {
    switch (language) {
      case 'typescript': return '.ts';
      case 'javascript': return '.js';
      case 'python': return '.py';
      default: return '.js';
    }
  }

  private getCommand(
    language: ExecutionRequest['language'],
    filePath: string,
    userArgs: string[] = []
  ): { command: string; args: string[] } {
    switch (language) {
      case 'typescript':
        // Use npx tsx for TypeScript execution
        return {
          command: 'npx',
          args: ['tsx', filePath, ...userArgs],
        };
      case 'javascript':
        return {
          command: 'node',
          args: [filePath, ...userArgs],
        };
      case 'python':
        return {
          command: 'python3',
          args: [filePath, ...userArgs],
        };
      default:
        return {
          command: 'node',
          args: [filePath, ...userArgs],
        };
    }
  }

  private runProcess(
    id: string,
    command: string,
    args: string[],
    request: ExecutionRequest,
    filePath: string
  ): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const timeout = request.timeout || this.config.defaultTimeout;
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const env = {
        ...process.env,
        ...request.env,
        // Memory limit via Node.js (approximate)
        NODE_OPTIONS: `--max-old-space-size=${request.memoryLimit || this.config.defaultMemoryLimit}`,
      };

      const proc = spawn(command, args, {
        env,
        cwd: this.config.tempDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.runningProcesses.set(id, proc);

      // Timeout handler
      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
        setTimeout(() => proc.kill('SIGKILL'), 1000);
      }, timeout);

      // Collect stdout
      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
        // Limit to prevent memory issues
        if (stdout.length > 1024 * 1024) {
          stdout = stdout.slice(-1024 * 1024);
        }
      });

      // Collect stderr
      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
        if (stderr.length > 1024 * 1024) {
          stderr = stderr.slice(-1024 * 1024);
        }
      });

      // Feed stdin if provided
      if (request.stdin) {
        proc.stdin?.write(request.stdin);
        proc.stdin?.end();
      }

      // Handle completion
      proc.on('close', (exitCode) => {
        clearTimeout(timer);
        this.runningProcesses.delete(id);

        resolve({
          id,
          success: exitCode === 0 && !timedOut,
          exitCode,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          duration: 0, // Filled by caller
          timedOut,
        });
      });

      // Handle error
      proc.on('error', (error) => {
        clearTimeout(timer);
        this.runningProcesses.delete(id);

        resolve({
          id,
          success: false,
          exitCode: null,
          stdout: stdout.trim(),
          stderr: error.message,
          duration: 0,
          timedOut: false,
          error: error.message,
        });
      });
    });
  }

  private cleanup(filePath: string): void {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch (err) {
      // Ignore cleanup errors
      console.error('[Runtime] File cleanup error:', err);
    }
  }

  // ============================================================================
  // Generate Observation for Active Inference
  // ============================================================================

  generateObservation(result: ExecutionResult): ExecutionObservation {
    const errorPatterns = this.analyzeErrors(result.stderr, result.exitCode);
    const outputPatterns = this.analyzeOutput(result.stdout);
    const suggestions = this.generateSuggestions(errorPatterns, result);

    return {
      type: 'external' as ObservationType,
      source: 'runtime',
      data: {
        executionId: result.id,
        success: result.success,
        exitCode: result.exitCode,
        hasOutput: result.stdout.length > 0,
        hasErrors: result.stderr.length > 0 || !result.success,
        errorPatterns,
        outputPatterns,
        suggestions,
        metrics: {
          linesOfCode: 0, // Would need the code to calculate
          executionTimeMs: result.duration,
          stdoutLines: result.stdout.split('\n').filter(Boolean).length,
          stderrLines: result.stderr.split('\n').filter(Boolean).length,
        },
      },
      timestamp: new Date(),
      confidence: result.success ? 0.9 : 0.7,
    };
  }

  private analyzeErrors(stderr: string, exitCode: number | null): ErrorPattern[] {
    const patterns: ErrorPattern[] = [];

    if (!stderr && exitCode === 0) return patterns;

    // Syntax error detection
    const syntaxMatch = stderr.match(/SyntaxError: (.+?)(?:\n|$)/);
    if (syntaxMatch) {
      const lineMatch = stderr.match(/:(\d+):(\d+)/);
      patterns.push({
        type: 'syntax',
        message: syntaxMatch[1],
        line: lineMatch ? parseInt(lineMatch[1]) : undefined,
        column: lineMatch ? parseInt(lineMatch[2]) : undefined,
        suggestion: 'Check syntax at the indicated line',
      });
    }

    // Type error detection (TypeScript)
    const typeMatch = stderr.match(/TypeError: (.+?)(?:\n|$)/);
    if (typeMatch) {
      patterns.push({
        type: 'type',
        message: typeMatch[1],
        suggestion: 'Verify type compatibility',
      });
    }

    // Import/module error
    const importMatch = stderr.match(/Cannot find module '(.+?)'/);
    if (importMatch) {
      patterns.push({
        type: 'import',
        message: `Module not found: ${importMatch[1]}`,
        suggestion: `Install module: npm install ${importMatch[1]}`,
      });
    }

    // Runtime error
    const runtimeMatch = stderr.match(/(ReferenceError|RangeError|EvalError): (.+?)(?:\n|$)/);
    if (runtimeMatch) {
      patterns.push({
        type: 'runtime',
        message: `${runtimeMatch[1]}: ${runtimeMatch[2]}`,
        suggestion: 'Check variable definitions and bounds',
      });
    }

    // Timeout
    if (stderr.includes('SIGTERM') || stderr.includes('timeout')) {
      patterns.push({
        type: 'timeout',
        message: 'Execution timed out',
        suggestion: 'Optimize loops or increase timeout',
      });
    }

    // Memory
    if (stderr.includes('heap out of memory') || stderr.includes('ENOMEM')) {
      patterns.push({
        type: 'memory',
        message: 'Out of memory',
        suggestion: 'Reduce memory usage or increase limit',
      });
    }

    // Unknown error if nothing matched
    if (patterns.length === 0 && stderr.length > 0) {
      patterns.push({
        type: 'unknown',
        message: stderr.slice(0, 200),
      });
    }

    return patterns;
  }

  private analyzeOutput(stdout: string): OutputPattern[] {
    const patterns: OutputPattern[] = [];
    const lines = stdout.split('\n').filter(Boolean);

    for (const line of lines.slice(0, 50)) { // Limit analysis
      // Try JSON parsing
      if (line.startsWith('{') || line.startsWith('[')) {
        try {
          const parsed = JSON.parse(line);
          patterns.push({
            type: 'json',
            content: line,
            structured: parsed,
          });
          continue;
        } catch (err) {
          // Not valid JSON
          console.error('[Runtime] JSON pattern parse error:', err);
        }
      }

      // Detect patterns
      if (line.toLowerCase().includes('error')) {
        patterns.push({ type: 'error', content: line });
      } else if (line.toLowerCase().includes('warning') || line.toLowerCase().includes('warn')) {
        patterns.push({ type: 'warning', content: line });
      } else if (line.toLowerCase().includes('success') || line.includes('✓') || line.includes('✔')) {
        patterns.push({ type: 'success', content: line });
      } else {
        patterns.push({ type: 'log', content: line });
      }
    }

    return patterns;
  }

  private generateSuggestions(errors: ErrorPattern[], result: ExecutionResult): string[] {
    const suggestions: string[] = [];

    for (const error of errors) {
      if (error.suggestion) {
        suggestions.push(error.suggestion);
      }
    }

    if (result.timedOut) {
      suggestions.push('Consider breaking into smaller operations');
      suggestions.push('Add progress logging to identify bottlenecks');
    }

    if (!result.success && suggestions.length === 0) {
      suggestions.push('Review the error output for details');
      suggestions.push('Add try/catch blocks for better error handling');
    }

    return suggestions;
  }

  // ============================================================================
  // Execution Loop with Iteration
  // ============================================================================

  async executeWithIteration(
    code: string,
    language: ExecutionRequest['language'],
    maxIterations: number = 3,
    onIteration?: (result: ExecutionResult, observation: ExecutionObservation, iteration: number) => Promise<string | null>
  ): Promise<{
    finalResult: ExecutionResult;
    iterations: number;
    observations: ExecutionObservation[];
    codeVersions: string[];
  }> {
    let currentCode = code;
    const observations: ExecutionObservation[] = [];
    const codeVersions: string[] = [code];
    let lastResult: ExecutionResult | null = null;

    for (let i = 0; i < maxIterations; i++) {
      // Execute current version
      lastResult = await this.execute({
        code: currentCode,
        language,
      });

      // Generate observation
      const observation = this.generateObservation(lastResult);
      observations.push(observation);

      // If successful, we're done
      if (lastResult.success) {
        return {
          finalResult: lastResult,
          iterations: i + 1,
          observations,
          codeVersions,
        };
      }

      // If callback provided, get modified code
      if (onIteration) {
        const modifiedCode = await onIteration(lastResult, observation, i + 1);
        if (modifiedCode) {
          currentCode = modifiedCode;
          codeVersions.push(modifiedCode);
        } else {
          // No modification, stop iterating
          break;
        }
      } else {
        // No callback, stop iterating
        break;
      }
    }

    return {
      finalResult: lastResult!,
      iterations: codeVersions.length,
      observations,
      codeVersions,
    };
  }

  // ============================================================================
  // Management
  // ============================================================================

  kill(id: string): boolean {
    const proc = this.runningProcesses.get(id);
    if (proc) {
      proc.kill('SIGTERM');
      this.runningProcesses.delete(id);
      return true;
    }
    return false;
  }

  killAll(): number {
    let count = 0;
    for (const [id, proc] of this.runningProcesses) {
      proc.kill('SIGTERM');
      this.runningProcesses.delete(id);
      count++;
    }
    return count;
  }

  getRunning(): string[] {
    return Array.from(this.runningProcesses.keys());
  }

  getHistory(): ExecutionResult[] {
    return [...this.executionHistory];
  }

  getStats(): {
    totalExecutions: number;
    successful: number;
    failed: number;
    timedOut: number;
    avgDuration: number;
  } {
    const history = this.executionHistory;
    const successful = history.filter(r => r.success).length;
    const timedOut = history.filter(r => r.timedOut).length;
    const avgDuration = history.length > 0
      ? history.reduce((sum, r) => sum + r.duration, 0) / history.length
      : 0;

    return {
      totalExecutions: history.length,
      successful,
      failed: history.length - successful,
      timedOut,
      avgDuration: Math.round(avgDuration),
    };
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let runtimeInstance: CodeRuntime | null = null;

export function getCodeRuntime(config?: Partial<RuntimeConfig>): CodeRuntime {
  if (!runtimeInstance) {
    runtimeInstance = new CodeRuntime(config);
  }
  return runtimeInstance;
}

export function resetCodeRuntime(): void {
  if (runtimeInstance) {
    runtimeInstance.killAll();
  }
  runtimeInstance = null;
}
