/**
 * Pre-Submission Test Runner v21.0
 *
 * Runs the target repo's test suite locally BEFORE submitting a PR.
 * 17% of PR rejections are CI failures — this module eliminates them.
 *
 * Flow:
 * 1. Apply our changes to the cloned repo
 * 2. Install dependencies (if needed)
 * 3. Run the test suite
 * 4. Report pass/fail with details
 *
 * @module economy/pre-submit-tester
 * @version 21.0.0
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { ClonedRepo, RepoAnalysis, TestFrameworkInfo } from './repo-cloner.js';
import type { CodeChange } from './live/pr-pipeline.js';

// ============================================================================
// Types
// ============================================================================

export interface TestRunResult {
  /** Whether all tests passed */
  passed: boolean;
  /** Total test count (if detectable) */
  totalTests: number;
  /** Passed test count */
  passedTests: number;
  /** Failed test count */
  failedTests: number;
  /** Test output (stdout + stderr, truncated) */
  output: string;
  /** Specific failure messages */
  failures: string[];
  /** Whether we could even run tests */
  couldRun: boolean;
  /** Reason if we couldn't run */
  skipReason?: string;
  /** Duration in ms */
  durationMs: number;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_TEST_TIMEOUT = 120000; // 2 minutes
const MAX_INSTALL_TIMEOUT = 180000; // 3 minutes
const MAX_OUTPUT_SIZE = 10000; // 10KB of test output

// ============================================================================
// Helpers
// ============================================================================

/**
 * Strip sensitive environment variables before running untrusted code.
 * Only pass through safe, non-sensitive vars.
 */
function getSafeEnv(): NodeJS.ProcessEnv {
  const SAFE_ENV_VARS = [
    'PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'LC_ALL', 'TMPDIR',
    'CI', 'NODE_ENV', 'NPM_CONFIG_LOGLEVEL',
  ];

  const safeEnv: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENV_VARS) {
    if (process.env[key]) {
      safeEnv[key] = process.env[key];
    }
  }
  return safeEnv;
}

// ============================================================================
// Main Class
// ============================================================================

export class PreSubmitTester {

  /**
   * Apply changes to cloned repo and run tests
   */
  async runTests(
    clonedRepo: ClonedRepo,
    analysis: RepoAnalysis,
    changes: CodeChange[],
  ): Promise<TestRunResult> {
    const startTime = Date.now();

    // Check if we have a test framework
    if (!analysis.testFramework) {
      return {
        passed: true, // No tests = can't fail
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        output: '',
        failures: [],
        couldRun: false,
        skipReason: 'No test framework detected',
        durationMs: Date.now() - startTime,
      };
    }

    const repoPath = clonedRepo.localPath;

    try {
      // Step 1: Apply our changes to the cloned repo
      console.log('[PreSubmitTester] Applying changes to local clone...');
      for (const change of changes) {
        const targetPath = path.join(repoPath, change.path);
        const targetDir = path.dirname(targetPath);

        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        if (change.operation === 'delete') {
          if (fs.existsSync(targetPath)) {
            fs.unlinkSync(targetPath);
          }
        } else {
          fs.writeFileSync(targetPath, change.content, 'utf-8');
        }
      }

      // Step 2: Install dependencies if needed
      const installSuccess = await this.installDependencies(repoPath, analysis);
      if (!installSuccess) {
        return {
          passed: false,
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          output: 'Dependency installation failed',
          failures: ['Could not install dependencies'],
          couldRun: false,
          skipReason: 'Dependency installation failed',
          durationMs: Date.now() - startTime,
        };
      }

      // Step 3: Run the test suite
      console.log(`[PreSubmitTester] Running tests: ${analysis.testFramework.command}`);
      const testResult = this.executeTests(repoPath, analysis.testFramework);

      console.log(`[PreSubmitTester] Tests ${testResult.passed ? 'PASSED' : 'FAILED'} (${testResult.passedTests}/${testResult.totalTests})`);

      return {
        ...testResult,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        passed: false,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        output: String(error),
        failures: [String(error)],
        couldRun: false,
        skipReason: `Error: ${String(error).slice(0, 200)}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  private async installDependencies(repoPath: string, analysis: RepoAnalysis): Promise<boolean> {
    if (!analysis.packageManager) return true; // No package manager = nothing to install

    let installCmd: string;
    let installArgs: string[];

    switch (analysis.packageManager) {
      case 'npm':
        installCmd = 'npm';
        installArgs = ['install', '--no-audit', '--no-fund'];
        break;
      case 'yarn':
        installCmd = 'yarn';
        installArgs = ['install', '--frozen-lockfile'];
        break;
      case 'pnpm':
        installCmd = 'pnpm';
        installArgs = ['install', '--frozen-lockfile'];
        break;
      case 'pip':
        installCmd = 'pip3';
        installArgs = ['install', '-r', 'requirements.txt', '-q'];
        break;
      case 'poetry':
        installCmd = 'poetry';
        installArgs = ['install', '--no-interaction'];
        break;
      case 'cargo':
        // Cargo builds on test, no separate install
        return true;
      case 'go':
        installCmd = 'go';
        installArgs = ['mod', 'download'];
        break;
      default:
        return true; // Unknown package manager, skip
    }

    console.log(`[PreSubmitTester] Installing dependencies with ${analysis.packageManager}...`);

    const result = spawnSync(installCmd, installArgs, {
      cwd: repoPath,
      timeout: MAX_INSTALL_TIMEOUT,
      stdio: 'pipe',
      encoding: 'utf-8',
      env: { ...getSafeEnv(), CI: 'true' },
    });

    if (result.status !== 0) {
      console.warn(`[PreSubmitTester] Install failed: ${result.stderr?.slice(0, 200)}`);
      return false;
    }

    return true;
  }

  private executeTests(repoPath: string, framework: TestFrameworkInfo): TestRunResult {
    // Parse the command
    const cmdParts = framework.command.split(/\s+/);
    const cmd = cmdParts[0];
    const args = cmdParts.slice(1);

    const result = spawnSync(cmd, args, {
      cwd: repoPath,
      timeout: MAX_TEST_TIMEOUT,
      stdio: 'pipe',
      encoding: 'utf-8',
      env: { ...getSafeEnv(), CI: 'true', NODE_ENV: 'test' },
    });

    const output = `${result.stdout || ''}${result.stderr || ''}`.slice(0, MAX_OUTPUT_SIZE);
    const passed = result.status === 0;

    // Parse test results from output
    const { totalTests, passedTests, failedTests, failures } =
      this.parseTestOutput(output, framework.name);

    return {
      passed,
      totalTests,
      passedTests,
      failedTests,
      output,
      failures,
      couldRun: true,
    } as TestRunResult;
  }

  private parseTestOutput(
    output: string,
    frameworkName: string,
  ): { totalTests: number; passedTests: number; failedTests: number; failures: string[] } {
    const failures: string[] = [];
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;

    switch (frameworkName) {
      case 'jest':
      case 'vitest': {
        // Jest/Vitest output: Tests:       2 failed, 15 passed, 17 total
        const testMatch = output.match(/Tests:\s+(?:(\d+)\s+failed,\s+)?(\d+)\s+passed,\s+(\d+)\s+total/);
        if (testMatch) {
          failedTests = parseInt(testMatch[1] || '0');
          passedTests = parseInt(testMatch[2]);
          totalTests = parseInt(testMatch[3]);
        }
        // Extract failure messages
        const failureMatches = output.match(/●\s+(.+?)(?=\n\n|\n\s+●|\n\s+Tests:)/gs);
        if (failureMatches) {
          failures.push(...failureMatches.map(m => m.trim().slice(0, 200)));
        }
        break;
      }
      case 'pytest': {
        // Pytest output: 15 passed, 2 failed
        const pyMatch = output.match(/(\d+)\s+passed(?:,\s+(\d+)\s+failed)?/);
        if (pyMatch) {
          passedTests = parseInt(pyMatch[1]);
          failedTests = parseInt(pyMatch[2] || '0');
          totalTests = passedTests + failedTests;
        }
        // Extract FAILED lines
        const failLines = output.match(/FAILED\s+.+/g);
        if (failLines) {
          failures.push(...failLines.map(l => l.trim().slice(0, 200)));
        }
        break;
      }
      case 'go_test': {
        // Go test output: ok/FAIL markers
        const okCount = (output.match(/^ok\s+/gm) || []).length;
        const failCount = (output.match(/^FAIL\s+/gm) || []).length;
        passedTests = okCount;
        failedTests = failCount;
        totalTests = okCount + failCount;
        // Extract FAIL lines
        const goFails = output.match(/--- FAIL: .+/g);
        if (goFails) {
          failures.push(...goFails.map(l => l.trim().slice(0, 200)));
        }
        break;
      }
      case 'cargo_test': {
        // Cargo test: test result: ok. X passed; Y failed
        const cargoMatch = output.match(/test result: \w+\.\s+(\d+)\s+passed;\s+(\d+)\s+failed/);
        if (cargoMatch) {
          passedTests = parseInt(cargoMatch[1]);
          failedTests = parseInt(cargoMatch[2]);
          totalTests = passedTests + failedTests;
        }
        break;
      }
      default: {
        // Generic: count pass/fail keywords
        passedTests = (output.match(/\bpass(ed)?\b/gi) || []).length;
        failedTests = (output.match(/\bfail(ed)?\b/gi) || []).length;
        totalTests = passedTests + failedTests || 1;
        break;
      }
    }

    return { totalTests, passedTests, failedTests, failures };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let testerInstance: PreSubmitTester | null = null;

export function getPreSubmitTester(): PreSubmitTester {
  if (!testerInstance) {
    testerInstance = new PreSubmitTester();
  }
  return testerInstance;
}
