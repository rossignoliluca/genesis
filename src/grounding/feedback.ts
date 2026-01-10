/**
 * Genesis Grounding Feedback Loop
 *
 * Iterative verification and fixing pipeline:
 * 1. Generate code
 * 2. Verify (compile, test, semantic)
 * 3. If fails: pass errors to fixer
 * 4. Regenerate with error context
 * 5. Max N iterations
 */

import { Verifier, VerificationContext, CodeVerificationResult, getVerifier } from './verifier.js';
import { AutoFixer, getAutoFixer, FixResult } from '../healing/fixer.js';
import { detectErrors } from '../healing/detector.js';

// ============================================================================
// Types
// ============================================================================

export interface FeedbackLoopConfig {
  /** Maximum iterations before giving up */
  maxIterations: number;
  /** Stop on first success */
  stopOnSuccess: boolean;
  /** Verification config */
  verificationContext: VerificationContext;
  /** Enable auto-fixing */
  enableAutoFix: boolean;
  /** Log progress */
  verbose: boolean;
}

export interface IterationResult {
  /** Iteration number (1-based) */
  iteration: number;
  /** Verification result */
  verification: CodeVerificationResult;
  /** Fix result (if attempted) */
  fix?: FixResult;
  /** Duration in ms */
  duration: number;
  /** Was this iteration successful */
  success: boolean;
}

export interface FeedbackLoopResult {
  /** Overall success */
  success: boolean;
  /** Total iterations performed */
  iterations: number;
  /** Results per iteration */
  history: IterationResult[];
  /** Final verification result */
  finalResult: CodeVerificationResult;
  /** Total duration in ms */
  totalDuration: number;
  /** Summary message */
  summary: string;
}

const DEFAULT_CONFIG: FeedbackLoopConfig = {
  maxIterations: 3,
  stopOnSuccess: true,
  verificationContext: {
    workingDirectory: process.cwd(),
  },
  enableAutoFix: true,
  verbose: false,
};

// ============================================================================
// FeedbackLoop Class
// ============================================================================

export class FeedbackLoop {
  private config: FeedbackLoopConfig;
  private verifier: Verifier;
  private fixer: AutoFixer;

  constructor(config?: Partial<FeedbackLoopConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.verifier = getVerifier();
    this.fixer = getAutoFixer({
      workingDirectory: this.config.verificationContext.workingDirectory,
    });
  }

  /**
   * Run the feedback loop
   */
  async run(): Promise<FeedbackLoopResult> {
    const startTime = Date.now();
    const history: IterationResult[] = [];
    let success = false;
    let finalResult: CodeVerificationResult | null = null;

    for (let i = 1; i <= this.config.maxIterations; i++) {
      const iterationStart = Date.now();

      if (this.config.verbose) {
        console.log(`\n[Iteration ${i}/${this.config.maxIterations}]`);
      }

      // Step 1: Verify
      if (this.config.verbose) {
        console.log('  Verifying...');
      }

      const verification = await this.verifier.verify(this.config.verificationContext);
      finalResult = verification;

      if (this.config.verbose) {
        console.log(`  Compiles: ${verification.compiles ? '✓' : '✗'}`);
        console.log(`  Types: ${verification.typesValid ? '✓' : '✗'}`);
        console.log(`  Tests: ${verification.testsPass ? '✓' : '✗'} (${verification.testsPassed}/${verification.testsTotal})`);
      }

      // Check if successful
      if (verification.success) {
        if (this.config.verbose) {
          console.log('  Status: SUCCESS');
        }

        history.push({
          iteration: i,
          verification,
          duration: Date.now() - iterationStart,
          success: true,
        });

        success = true;
        if (this.config.stopOnSuccess) break;
        continue;
      }

      // Step 2: Auto-fix if enabled
      let fixResult: FixResult | undefined;

      if (this.config.enableAutoFix && verification.issues.length > 0) {
        if (this.config.verbose) {
          console.log(`  Attempting auto-fix for ${verification.issues.length} issues...`);
        }

        // Convert grounding issues to detected errors
        const errors = verification.issues.map(issue => ({
          category: this.mapIssueType(issue.type),
          severity: issue.severity,
          message: issue.message,
          file: issue.file,
          line: issue.line,
          raw: issue.message,
          fixHint: issue.suggestion,
        }));

        fixResult = await this.fixer.fix(errors);

        if (this.config.verbose) {
          console.log(`  Fix result: ${fixResult.success ? 'SUCCESS' : 'FAILED'}`);
          if (fixResult.appliedFix) {
            console.log(`  Fix applied: ${fixResult.appliedFix.description}`);
          }
        }
      }

      history.push({
        iteration: i,
        verification,
        fix: fixResult,
        duration: Date.now() - iterationStart,
        success: false,
      });
    }

    // Ensure we have a final result
    if (!finalResult) {
      finalResult = await this.verifier.verify(this.config.verificationContext);
    }

    const totalDuration = Date.now() - startTime;

    // Generate summary
    const summary = this.generateSummary(success, history, totalDuration);

    return {
      success,
      iterations: history.length,
      history,
      finalResult,
      totalDuration,
      summary,
    };
  }

  /**
   * Run verification only (no fixing)
   */
  async verifyOnly(): Promise<CodeVerificationResult> {
    return this.verifier.verify(this.config.verificationContext);
  }

  /**
   * Map grounding issue type to error category
   */
  private mapIssueType(type: string): 'syntax' | 'type' | 'runtime' | 'test' | 'build' | 'lint' | 'dependency' | 'permission' | 'unknown' {
    switch (type) {
      case 'compile':
        return 'build';
      case 'type':
        return 'type';
      case 'test':
        return 'test';
      case 'lint':
        return 'lint';
      default:
        return 'unknown';
    }
  }

  /**
   * Generate summary message
   */
  private generateSummary(
    success: boolean,
    history: IterationResult[],
    duration: number
  ): string {
    if (success) {
      const successIteration = history.findIndex(h => h.success) + 1;
      if (successIteration === 1) {
        return `Verification passed on first attempt (${duration}ms)`;
      }
      return `Verification passed after ${successIteration} iterations with ${history.filter(h => h.fix?.appliedFix).length} fixes (${duration}ms)`;
    }

    const totalIssues = history[history.length - 1]?.verification.issues.length || 0;
    const totalFixes = history.filter(h => h.fix?.appliedFix).length;

    return `Verification failed after ${history.length} iterations. ${totalIssues} issues remaining, ${totalFixes} fixes attempted (${duration}ms)`;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<FeedbackLoopConfig>): void {
    this.config = { ...this.config, ...updates };
    if (updates.verificationContext) {
      this.fixer = getAutoFixer({
        workingDirectory: updates.verificationContext.workingDirectory,
      });
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): FeedbackLoopConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let feedbackLoopInstance: FeedbackLoop | null = null;

export function getFeedbackLoop(config?: Partial<FeedbackLoopConfig>): FeedbackLoop {
  if (!feedbackLoopInstance) {
    feedbackLoopInstance = new FeedbackLoop(config);
  } else if (config) {
    feedbackLoopInstance.updateConfig(config);
  }
  return feedbackLoopInstance;
}

export function resetFeedbackLoop(): void {
  feedbackLoopInstance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Run feedback loop with default configuration
 */
export async function runFeedbackLoop(
  workingDirectory: string,
  options?: Partial<Omit<FeedbackLoopConfig, 'verificationContext'>>
): Promise<FeedbackLoopResult> {
  const loop = new FeedbackLoop({
    ...options,
    verificationContext: {
      workingDirectory,
    },
  });
  return loop.run();
}

/**
 * Verify and fix until success or max iterations
 */
export async function verifyAndFix(
  workingDirectory: string,
  maxIterations: number = 3
): Promise<FeedbackLoopResult> {
  return runFeedbackLoop(workingDirectory, { maxIterations });
}

/**
 * Quick check if code is currently valid
 */
export async function isProjectValid(workingDirectory: string): Promise<boolean> {
  const loop = new FeedbackLoop({
    verificationContext: { workingDirectory },
    maxIterations: 1,
    enableAutoFix: false,
  });
  const result = await loop.run();
  return result.success;
}

/**
 * Format feedback loop result for display
 */
export function formatFeedbackResult(result: FeedbackLoopResult): string {
  const lines: string[] = [];

  // Header
  const status = result.success ? '✓ SUCCESS' : '✗ FAILED';
  lines.push(`Feedback Loop ${status}`);
  lines.push(`${result.summary}`);
  lines.push('');

  // Iteration history
  lines.push('Iteration History:');
  for (const iter of result.history) {
    const iterStatus = iter.success ? '✓' : '✗';
    const fixInfo = iter.fix?.appliedFix ? ' (1 fix)' : '';
    lines.push(`  ${iter.iteration}. ${iterStatus} ${iter.verification.issues.length} issues${fixInfo} [${iter.duration}ms]`);
  }
  lines.push('');

  // Final state
  lines.push('Final State:');
  lines.push(`  Compiles:  ${result.finalResult.compiles ? '✓' : '✗'}`);
  lines.push(`  Types:     ${result.finalResult.typesValid ? '✓' : '✗'}`);
  lines.push(`  Tests:     ${result.finalResult.testsPass ? '✓' : '✗'} (${result.finalResult.testsPassed}/${result.finalResult.testsTotal})`);
  lines.push(`  Semantic:  ${(result.finalResult.semanticMatch * 100).toFixed(0)}%`);

  // Remaining issues
  if (result.finalResult.issues.length > 0 && !result.success) {
    lines.push('');
    lines.push(`Remaining Issues (${result.finalResult.issues.length}):`);
    for (const issue of result.finalResult.issues.slice(0, 5)) {
      const prefix = issue.severity === 'error' ? '✗' : '⚠';
      lines.push(`  ${prefix} ${issue.message}`);
    }
    if (result.finalResult.issues.length > 5) {
      lines.push(`  ... and ${result.finalResult.issues.length - 5} more`);
    }
  }

  return lines.join('\n');
}
