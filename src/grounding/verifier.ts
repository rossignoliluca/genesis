/**
 * Genesis Grounding Verifier
 *
 * Verifies that generated code is correct:
 * - Compiles without errors
 * - Tests pass
 * - Semantic match with intent
 * - No regressions introduced
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { detectErrors, DetectionResult } from '../healing/detector.js';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface VerificationContext {
  /** Working directory */
  workingDirectory: string;
  /** Build command (default: npm run build) */
  buildCommand?: string;
  /** Test command (default: npm test) */
  testCommand?: string;
  /** Type check command (default: npx tsc --noEmit) */
  typeCheckCommand?: string;
  /** Lint command (optional) */
  lintCommand?: string;
  /** Timeout in ms (default: 60000) */
  timeout?: number;
  /** Files that were modified */
  modifiedFiles?: string[];
  /** Original intent/request */
  intent?: string;
}

export interface GroundingIssue {
  /** Issue type */
  type: 'compile' | 'type' | 'test' | 'lint' | 'semantic' | 'regression';
  /** Severity */
  severity: 'error' | 'warning' | 'info';
  /** Issue message */
  message: string;
  /** File path if applicable */
  file?: string;
  /** Line number if applicable */
  line?: number;
  /** Suggested fix */
  suggestion?: string;
}

export interface CodeVerificationResult {
  /** Overall success */
  success: boolean;
  /** Build/compile passed */
  compiles: boolean;
  /** Type checking passed */
  typesValid: boolean;
  /** Tests passed */
  testsPass: boolean;
  /** Tests passed count */
  testsPassed: number;
  /** Tests failed count */
  testsFailed: number;
  /** Tests total count */
  testsTotal: number;
  /** Lint passed (if configured) */
  lintPass: boolean;
  /** Semantic match score (0.0 - 1.0) */
  semanticMatch: number;
  /** All issues found */
  issues: GroundingIssue[];
  /** Execution time in ms */
  duration: number;
  /** Raw outputs */
  outputs: {
    build?: string;
    typeCheck?: string;
    test?: string;
    lint?: string;
  };
}

export interface VerifierConfig {
  /** Default build command */
  buildCommand: string;
  /** Default test command */
  testCommand: string;
  /** Default type check command */
  typeCheckCommand: string;
  /** Default lint command */
  lintCommand?: string;
  /** Default timeout */
  timeout: number;
  /** Skip build step */
  skipBuild: boolean;
  /** Skip type check step */
  skipTypeCheck: boolean;
  /** Skip test step */
  skipTest: boolean;
  /** Skip lint step */
  skipLint: boolean;
}

const DEFAULT_CONFIG: VerifierConfig = {
  buildCommand: 'npm run build',
  testCommand: 'npm test',
  typeCheckCommand: 'npx tsc --noEmit',
  lintCommand: undefined,
  timeout: 120000,
  skipBuild: false,
  skipTypeCheck: false,
  skipTest: false,
  skipLint: true,
};

// ============================================================================
// Verifier Class
// ============================================================================

export class Verifier {
  private config: VerifierConfig;

  constructor(config?: Partial<VerifierConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run full verification pipeline
   */
  async verify(context: VerificationContext): Promise<CodeVerificationResult> {
    const startTime = Date.now();
    const issues: GroundingIssue[] = [];
    const outputs: CodeVerificationResult['outputs'] = {};

    let compiles = true;
    let typesValid = true;
    let testsPass = true;
    let lintPass = true;
    let testsPassed = 0;
    let testsFailed = 0;
    let testsTotal = 0;

    const timeout = context.timeout || this.config.timeout;
    const cwd = context.workingDirectory;

    // Step 1: Type Check
    if (!this.config.skipTypeCheck) {
      const typeCheckCmd = context.typeCheckCommand || this.config.typeCheckCommand;
      try {
        const { stdout, stderr } = await this.execWithTimeout(typeCheckCmd, cwd, timeout);
        outputs.typeCheck = stdout + stderr;

        const typeErrors = detectErrors(outputs.typeCheck);
        if (!typeErrors.success) {
          typesValid = false;
          for (const error of typeErrors.errors) {
            if (error.severity === 'error') {
              issues.push({
                type: 'type',
                severity: 'error',
                message: error.message,
                file: error.file,
                line: error.line,
                suggestion: error.fixHint,
              });
            }
          }
        }
      } catch (error: any) {
        typesValid = false;
        const typeCheckOutput = error.stderr || error.message || '';
        outputs.typeCheck = typeCheckOutput;
        const typeErrors = detectErrors(typeCheckOutput);
        for (const err of typeErrors.errors) {
          issues.push({
            type: 'type',
            severity: 'error',
            message: err.message,
            file: err.file,
            line: err.line,
          });
        }
      }
    }

    // Step 2: Build
    if (!this.config.skipBuild) {
      const buildCmd = context.buildCommand || this.config.buildCommand;
      try {
        const { stdout, stderr } = await this.execWithTimeout(buildCmd, cwd, timeout);
        outputs.build = stdout + stderr;

        const buildErrors = detectErrors(outputs.build);
        if (!buildErrors.success) {
          compiles = false;
          for (const error of buildErrors.errors) {
            if (error.severity === 'error') {
              issues.push({
                type: 'compile',
                severity: 'error',
                message: error.message,
                file: error.file,
                line: error.line,
              });
            }
          }
        }
      } catch (error: any) {
        compiles = false;
        outputs.build = error.stderr || error.message;
        issues.push({
          type: 'compile',
          severity: 'error',
          message: `Build failed: ${error.message}`,
        });
      }
    }

    // Step 3: Tests (only if build passed)
    if (!this.config.skipTest && compiles) {
      const testCmd = context.testCommand || this.config.testCommand;
      try {
        const { stdout, stderr } = await this.execWithTimeout(testCmd, cwd, timeout);
        outputs.test = stdout + stderr;

        const testResult = this.parseTestOutput(outputs.test);
        testsPassed = testResult.passed;
        testsFailed = testResult.failed;
        testsTotal = testResult.total;
        testsPass = testResult.failed === 0;

        if (!testsPass) {
          const testErrors = detectErrors(outputs.test);
          for (const error of testErrors.errors) {
            if (error.category === 'test') {
              issues.push({
                type: 'test',
                severity: 'error',
                message: error.message,
                file: error.file,
                line: error.line,
              });
            }
          }
        }
      } catch (error: any) {
        testsPass = false;
        const testOutput = error.stdout || error.stderr || error.message || '';
        outputs.test = testOutput;

        const testResult = this.parseTestOutput(testOutput);
        testsPassed = testResult.passed;
        testsFailed = testResult.failed;
        testsTotal = testResult.total;

        const testErrors = detectErrors(testOutput);
        for (const err of testErrors.errors) {
          if (err.category === 'test') {
            issues.push({
              type: 'test',
              severity: 'error',
              message: err.message,
              file: err.file,
              line: err.line,
            });
          }
        }
      }
    }

    // Step 4: Lint (if configured)
    if (!this.config.skipLint && this.config.lintCommand) {
      const lintCmd = context.lintCommand || this.config.lintCommand;
      try {
        const { stdout, stderr } = await this.execWithTimeout(lintCmd, cwd, timeout);
        outputs.lint = stdout + stderr;

        const lintErrors = detectErrors(outputs.lint);
        if (lintErrors.byCategory.lint > 0) {
          lintPass = lintErrors.bySeverity.error === 0;
          for (const error of lintErrors.errors) {
            if (error.category === 'lint') {
              issues.push({
                type: 'lint',
                severity: error.severity,
                message: error.message,
                file: error.file,
                line: error.line,
              });
            }
          }
        }
      } catch (error: any) {
        outputs.lint = error.stderr || error.message;
        // Lint errors are often non-fatal
      }
    }

    // Calculate semantic match (basic heuristic for now)
    const semanticMatch = this.calculateSemanticMatch(context, issues);

    const duration = Date.now() - startTime;

    return {
      success: compiles && typesValid && testsPass && (lintPass || this.config.skipLint),
      compiles,
      typesValid,
      testsPass,
      testsPassed,
      testsFailed,
      testsTotal,
      lintPass,
      semanticMatch,
      issues,
      duration,
      outputs,
    };
  }

  /**
   * Quick verification (type check only)
   */
  async quickVerify(context: VerificationContext): Promise<CodeVerificationResult> {
    return this.verify({
      ...context,
      buildCommand: 'true', // Skip actual build
      testCommand: 'true',  // Skip tests
    });
  }

  /**
   * Verify a single file compiles
   */
  async verifyFile(filePath: string, cwd: string): Promise<{ valid: boolean; errors: GroundingIssue[] }> {
    const errors: GroundingIssue[] = [];

    // Check file exists
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
    if (!fs.existsSync(fullPath)) {
      return {
        valid: false,
        errors: [{
          type: 'compile',
          severity: 'error',
          message: `File not found: ${filePath}`,
          file: filePath,
        }],
      };
    }

    // Type check single file
    try {
      const cmd = `npx tsc --noEmit "${fullPath}"`;
      await this.execWithTimeout(cmd, cwd, 30000);
      return { valid: true, errors: [] };
    } catch (error: any) {
      const output = error.stderr || error.stdout || error.message;
      const detected = detectErrors(output);

      for (const err of detected.errors) {
        errors.push({
          type: 'type',
          severity: 'error',
          message: err.message,
          file: err.file || filePath,
          line: err.line,
        });
      }

      return { valid: false, errors };
    }
  }

  /**
   * Execute command with timeout
   */
  private async execWithTimeout(
    command: string,
    cwd: string,
    timeout: number
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = exec(command, { cwd, timeout }, (error, stdout, stderr) => {
        if (error) {
          reject({ ...error, stdout, stderr });
        } else {
          resolve({ stdout, stderr });
        }
      });

      // Handle timeout
      setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeout}ms: ${command}`));
      }, timeout);
    });
  }

  /**
   * Parse test output for pass/fail counts
   */
  private parseTestOutput(output: string): { passed: number; failed: number; total: number } {
    let passed = 0;
    let failed = 0;
    let total = 0;

    // Node test runner format
    const nodeTestMatch = output.match(/ℹ tests (\d+)/);
    const nodePassMatch = output.match(/ℹ pass (\d+)/);
    const nodeFailMatch = output.match(/ℹ fail (\d+)/);

    if (nodeTestMatch) {
      total = parseInt(nodeTestMatch[1], 10);
      passed = nodePassMatch ? parseInt(nodePassMatch[1], 10) : 0;
      failed = nodeFailMatch ? parseInt(nodeFailMatch[1], 10) : 0;
      return { passed, failed, total };
    }

    // Jest format
    const jestMatch = output.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
    if (jestMatch) {
      passed = parseInt(jestMatch[1], 10);
      total = parseInt(jestMatch[2], 10);
      failed = total - passed;
      return { passed, failed, total };
    }

    const jestFailMatch = output.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
    if (jestFailMatch) {
      failed = parseInt(jestFailMatch[1], 10);
      passed = parseInt(jestFailMatch[2], 10);
      total = parseInt(jestFailMatch[3], 10);
      return { passed, failed, total };
    }

    // Count checkmarks and crosses
    const passCount = (output.match(/✔|✓|PASS/g) || []).length;
    const failCount = (output.match(/✖|✗|FAIL/g) || []).length;

    return {
      passed: passCount,
      failed: failCount,
      total: passCount + failCount,
    };
  }

  /**
   * Calculate semantic match (basic heuristic)
   */
  private calculateSemanticMatch(context: VerificationContext, issues: GroundingIssue[]): number {
    // Start with 1.0 and deduct for issues
    let score = 1.0;

    // Deduct for each type of issue
    for (const issue of issues) {
      switch (issue.type) {
        case 'compile':
        case 'type':
          score -= 0.2; // Major issue
          break;
        case 'test':
          score -= 0.15; // Significant issue
          break;
        case 'lint':
          score -= 0.05; // Minor issue
          break;
        case 'semantic':
        case 'regression':
          score -= 0.1;
          break;
      }
    }

    // Bonus if modified files exist and are valid
    if (context.modifiedFiles && context.modifiedFiles.length > 0) {
      const allExist = context.modifiedFiles.every(f => {
        const fullPath = path.isAbsolute(f) ? f : path.join(context.workingDirectory, f);
        return fs.existsSync(fullPath);
      });
      if (allExist) score += 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get current configuration
   */
  getConfig(): VerifierConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<VerifierConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let verifierInstance: Verifier | null = null;

export function getVerifier(config?: Partial<VerifierConfig>): Verifier {
  if (!verifierInstance) {
    verifierInstance = new Verifier(config);
  } else if (config) {
    verifierInstance.updateConfig(config);
  }
  return verifierInstance;
}

export function resetVerifier(): void {
  verifierInstance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Verify code in a directory
 */
export async function verifyCode(context: VerificationContext): Promise<CodeVerificationResult> {
  return getVerifier().verify(context);
}

/**
 * Quick verify (type check only)
 */
export async function quickVerify(context: VerificationContext): Promise<CodeVerificationResult> {
  return getVerifier().quickVerify(context);
}

/**
 * Check if code is valid (compiles and types check)
 */
export async function isCodeValid(workingDirectory: string): Promise<boolean> {
  const result = await getVerifier().verify({ workingDirectory });
  return result.compiles && result.typesValid;
}

/**
 * Format verification result for display
 */
export function formatVerificationResult(result: CodeVerificationResult): string {
  const lines: string[] = [];

  // Header
  const status = result.success ? '✓ PASSED' : '✗ FAILED';
  lines.push(`Verification ${status} (${result.duration}ms)`);
  lines.push('');

  // Summary
  lines.push('Summary:');
  lines.push(`  Compiles:    ${result.compiles ? '✓' : '✗'}`);
  lines.push(`  Types:       ${result.typesValid ? '✓' : '✗'}`);
  lines.push(`  Tests:       ${result.testsPass ? '✓' : '✗'} (${result.testsPassed}/${result.testsTotal})`);
  if (!result.lintPass) {
    lines.push(`  Lint:        ✗`);
  }
  lines.push(`  Semantic:    ${(result.semanticMatch * 100).toFixed(0)}%`);
  lines.push('');

  // Issues
  if (result.issues.length > 0) {
    lines.push(`Issues (${result.issues.length}):`);
    for (const issue of result.issues) {
      const prefix = issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '⚠' : 'ℹ';
      const location = issue.file ? ` at ${issue.file}${issue.line ? `:${issue.line}` : ''}` : '';
      lines.push(`  ${prefix} [${issue.type}] ${issue.message}${location}`);
    }
  }

  return lines.join('\n');
}
