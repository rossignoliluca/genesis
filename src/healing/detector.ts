/**
 * Genesis Error Detector
 *
 * Detects and classifies errors from command output:
 * - Syntax errors (parse errors, missing tokens)
 * - Type errors (TypeScript type mismatches)
 * - Runtime errors (exceptions, undefined references)
 * - Test failures (assertion failures, test timeouts)
 * - Build errors (compilation failures)
 * - Lint errors (style violations)
 */

// ============================================================================
// Types
// ============================================================================

export type ErrorCategory =
  | 'syntax'      // Parse errors, missing semicolons
  | 'type'        // TypeScript type mismatches
  | 'runtime'     // Exceptions, undefined references
  | 'test'        // Test failures
  | 'build'       // Compilation errors
  | 'lint'        // Style violations
  | 'dependency'  // Missing modules, version conflicts
  | 'permission'  // File/network permission errors
  | 'unknown';    // Unclassified errors

export type ErrorSeverity = 'error' | 'warning' | 'info';

export interface DetectedError {
  /** Error category */
  category: ErrorCategory;
  /** Severity level */
  severity: ErrorSeverity;
  /** Error message */
  message: string;
  /** File path if available */
  file?: string;
  /** Line number if available */
  line?: number;
  /** Column number if available */
  column?: number;
  /** Error code if available */
  code?: string;
  /** Full context (surrounding lines) */
  context?: string;
  /** Raw matched pattern */
  raw: string;
  /** Suggested fix category */
  fixHint?: string;
}

export interface DetectionResult {
  /** All detected errors */
  errors: DetectedError[];
  /** Count by category */
  byCategory: Record<ErrorCategory, number>;
  /** Count by severity */
  bySeverity: Record<ErrorSeverity, number>;
  /** Overall success (no errors) */
  success: boolean;
  /** Has fixable errors */
  hasFixable: boolean;
}

interface ErrorPattern {
  /** Regex pattern to match */
  pattern: RegExp;
  /** Error category */
  category: ErrorCategory;
  /** Severity level (or function to extract it) */
  severity: ErrorSeverity | ((match: RegExpMatchArray) => ErrorSeverity);
  /** Extract file path (group index or function) */
  extractFile?: number | ((match: RegExpMatchArray) => string | undefined);
  /** Extract line number */
  extractLine?: number | ((match: RegExpMatchArray) => number | undefined);
  /** Extract column number */
  extractColumn?: number | ((match: RegExpMatchArray) => number | undefined);
  /** Extract error code */
  extractCode?: number | ((match: RegExpMatchArray) => string | undefined);
  /** Extract message */
  extractMessage?: number | ((match: RegExpMatchArray) => string);
  /** Fix hint */
  fixHint?: string;
}

// ============================================================================
// Error Patterns
// ============================================================================

const ERROR_PATTERNS: ErrorPattern[] = [
  // TypeScript errors
  {
    pattern: /^(.+\.tsx?)\((\d+),(\d+)\): error (TS\d+): (.+)$/gm,
    category: 'type',
    severity: 'error',
    extractFile: 1,
    extractLine: 2,
    extractColumn: 3,
    extractCode: 4,
    extractMessage: 5,
    fixHint: 'type_mismatch',
  },
  {
    pattern: /^(.+\.tsx?):(\d+):(\d+) - error (TS\d+): (.+)$/gm,
    category: 'type',
    severity: 'error',
    extractFile: 1,
    extractLine: 2,
    extractColumn: 3,
    extractCode: 4,
    extractMessage: 5,
    fixHint: 'type_mismatch',
  },

  // ESLint errors
  {
    pattern: /^(.+):(\d+):(\d+): (error|warning) (.+) \((.+)\)$/gm,
    category: 'lint',
    severity: (match) => match[4] as ErrorSeverity,
    extractFile: 1,
    extractLine: 2,
    extractColumn: 3,
    extractCode: 6,
    extractMessage: 5,
    fixHint: 'lint_fix',
  },
  {
    pattern: /^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+(@?[\w\/-]+)$/gm,
    category: 'lint',
    severity: (match) => match[3] as ErrorSeverity,
    extractLine: 1,
    extractColumn: 2,
    extractCode: 5,
    extractMessage: 4,
    fixHint: 'lint_fix',
  },

  // Syntax errors (BEFORE runtime to match SyntaxError specifically)
  {
    pattern: /^SyntaxError: (.+)$/gm,
    category: 'syntax',
    severity: 'error',
    extractMessage: 1,
    fixHint: 'syntax_fix',
  },
  {
    pattern: /Unexpected token (.+)/gi,
    category: 'syntax',
    severity: 'error',
    extractMessage: (match) => match[0],
    fixHint: 'syntax_fix',
  },
  {
    pattern: /Missing (.+) in (.+)/gi,
    category: 'syntax',
    severity: 'error',
    extractMessage: (match) => match[0],
    fixHint: 'syntax_fix',
  },

  // Node.js runtime errors
  {
    pattern: /^(\w+Error): (.+)$/gm,
    category: 'runtime',
    severity: 'error',
    extractCode: 1,
    extractMessage: 2,
    fixHint: 'runtime_error',
  },
  {
    pattern: /^\s+at .+ \((.+):(\d+):(\d+)\)$/gm,
    category: 'runtime',
    severity: 'info',
    extractFile: 1,
    extractLine: 2,
    extractColumn: 3,
    extractMessage: (match) => `Stack trace: ${match[0].trim()}`,
  },

  // Test failures (Node test runner)
  {
    pattern: /^✖ (.+) \([\d.]+ms\)$/gm,
    category: 'test',
    severity: 'error',
    extractMessage: 1,
    fixHint: 'test_fix',
  },
  {
    pattern: /^AssertionError.+: (.+)$/gm,
    category: 'test',
    severity: 'error',
    extractMessage: 1,
    fixHint: 'assertion_fix',
  },
  {
    pattern: /expected (.+) to (equal|be|match|include) (.+)/gi,
    category: 'test',
    severity: 'error',
    extractMessage: (match) => match[0],
    fixHint: 'assertion_fix',
  },

  // Jest/Vitest failures
  {
    pattern: /^FAIL (.+)$/gm,
    category: 'test',
    severity: 'error',
    extractFile: 1,
    extractMessage: (match) => `Test file failed: ${match[1]}`,
    fixHint: 'test_fix',
  },
  {
    pattern: /^\s*● (.+)$/gm,
    category: 'test',
    severity: 'error',
    extractMessage: 1,
    fixHint: 'test_fix',
  },

  // Build errors
  {
    pattern: /^error: (.+)$/gmi,
    category: 'build',
    severity: 'error',
    extractMessage: 1,
    fixHint: 'build_fix',
  },
  {
    pattern: /^Build failed/gmi,
    category: 'build',
    severity: 'error',
    extractMessage: () => 'Build failed',
    fixHint: 'build_fix',
  },

  // Dependency errors
  {
    pattern: /Cannot find module '(.+)'/g,
    category: 'dependency',
    severity: 'error',
    extractMessage: (match) => `Missing module: ${match[1]}`,
    extractCode: (match) => match[1],
    fixHint: 'install_dependency',
  },
  {
    pattern: /Module not found: (.+)/gi,
    category: 'dependency',
    severity: 'error',
    extractMessage: 1,
    fixHint: 'install_dependency',
  },
  {
    pattern: /ERR! (.+)/g,
    category: 'dependency',
    severity: 'error',
    extractMessage: 1,
    fixHint: 'npm_error',
  },

  // Permission errors
  {
    pattern: /EACCES: permission denied, (.+)/g,
    category: 'permission',
    severity: 'error',
    extractMessage: (match) => match[0],
    fixHint: 'permission_fix',
  },
  {
    pattern: /ENOENT: no such file or directory, (.+) '(.+)'/g,
    category: 'permission',
    severity: 'error',
    extractFile: 2,
    extractMessage: (match) => match[0],
    fixHint: 'file_not_found',
  },
];

// ============================================================================
// Error Detector Class
// ============================================================================

export class ErrorDetector {
  private patterns: ErrorPattern[];

  constructor(additionalPatterns?: ErrorPattern[]) {
    this.patterns = [...ERROR_PATTERNS, ...(additionalPatterns || [])];
  }

  /**
   * Detect errors in output text
   */
  detect(output: string): DetectionResult {
    const errors: DetectedError[] = [];
    const seen = new Set<string>(); // Deduplicate

    for (const pattern of this.patterns) {
      // Reset regex lastIndex for global patterns
      pattern.pattern.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.pattern.exec(output)) !== null) {
        const key = `${match[0]}:${match.index}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const error = this.extractError(match, pattern, output);
        errors.push(error);
      }
    }

    // Sort by severity, then by line number
    errors.sort((a, b) => {
      const severityOrder = { error: 0, warning: 1, info: 2 };
      const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (sevDiff !== 0) return sevDiff;
      return (a.line || 0) - (b.line || 0);
    });

    // Count by category and severity
    const byCategory: Record<ErrorCategory, number> = {
      syntax: 0, type: 0, runtime: 0, test: 0,
      build: 0, lint: 0, dependency: 0, permission: 0, unknown: 0,
    };
    const bySeverity: Record<ErrorSeverity, number> = {
      error: 0, warning: 0, info: 0,
    };

    for (const error of errors) {
      byCategory[error.category]++;
      bySeverity[error.severity]++;
    }

    const hasFixable = errors.some(e => e.fixHint !== undefined);

    return {
      errors,
      byCategory,
      bySeverity,
      success: bySeverity.error === 0,
      hasFixable,
    };
  }

  /**
   * Extract error details from regex match
   */
  private extractError(match: RegExpExecArray, pattern: ErrorPattern, output: string): DetectedError {
    const extract = <T>(extractor: number | ((m: RegExpMatchArray) => T) | undefined, defaultValue: T): T => {
      if (extractor === undefined) return defaultValue;
      if (typeof extractor === 'number') return match[extractor] as unknown as T;
      return extractor(match);
    };

    const file = extract(pattern.extractFile, undefined);
    const line = extract(pattern.extractLine, undefined);
    const lineNum = line ? parseInt(String(line), 10) : undefined;
    const col = extract(pattern.extractColumn, undefined);
    const colNum = col ? parseInt(String(col), 10) : undefined;

    // Get context (surrounding lines)
    let context: string | undefined;
    if (file && lineNum) {
      const lines = output.split('\n');
      const matchLineIdx = lines.findIndex(l => l.includes(match[0]));
      if (matchLineIdx >= 0) {
        const start = Math.max(0, matchLineIdx - 2);
        const end = Math.min(lines.length, matchLineIdx + 3);
        context = lines.slice(start, end).join('\n');
      }
    }

    const severity = typeof pattern.severity === 'function'
      ? pattern.severity(match)
      : pattern.severity;

    return {
      category: pattern.category,
      severity,
      message: extract(pattern.extractMessage, match[0]),
      file,
      line: lineNum,
      column: colNum,
      code: extract(pattern.extractCode, undefined),
      context,
      raw: match[0],
      fixHint: pattern.fixHint,
    };
  }

  /**
   * Classify a single error message
   */
  classify(message: string): ErrorCategory {
    for (const pattern of this.patterns) {
      pattern.pattern.lastIndex = 0;
      if (pattern.pattern.test(message)) {
        return pattern.category;
      }
    }
    return 'unknown';
  }

  /**
   * Get fix suggestions for an error
   */
  suggestFix(error: DetectedError): string[] {
    const suggestions: string[] = [];

    switch (error.fixHint) {
      case 'type_mismatch':
        suggestions.push('Check type annotations');
        suggestions.push('Add explicit type cast');
        suggestions.push('Update interface/type definition');
        break;

      case 'lint_fix':
        suggestions.push('Run eslint --fix');
        suggestions.push('Run prettier --write');
        break;

      case 'runtime_error':
        suggestions.push('Add null/undefined check');
        suggestions.push('Wrap in try-catch');
        suggestions.push('Check variable initialization');
        break;

      case 'test_fix':
        suggestions.push('Update expected value');
        suggestions.push('Fix implementation to match test');
        suggestions.push('Update test to match new behavior');
        break;

      case 'assertion_fix':
        suggestions.push('Compare actual vs expected values');
        suggestions.push('Check test data setup');
        break;

      case 'syntax_fix':
        suggestions.push('Check for missing brackets/parentheses');
        suggestions.push('Check for missing semicolons');
        suggestions.push('Validate JSON/object syntax');
        break;

      case 'install_dependency':
        if (error.code) {
          suggestions.push(`npm install ${error.code}`);
          suggestions.push(`Check if ${error.code} is in package.json`);
        }
        break;

      case 'file_not_found':
        suggestions.push('Create the missing file');
        suggestions.push('Check the import path');
        break;

      case 'permission_fix':
        suggestions.push('Check file permissions');
        suggestions.push('Run with appropriate privileges');
        break;

      default:
        suggestions.push('Review the error message');
        suggestions.push('Search for similar issues online');
    }

    return suggestions;
  }

  /**
   * Add a custom error pattern
   */
  addPattern(pattern: ErrorPattern): void {
    this.patterns.push(pattern);
  }

  /**
   * Format errors for display
   */
  formatErrors(errors: DetectedError[]): string {
    if (errors.length === 0) return 'No errors detected';

    const lines: string[] = [];
    lines.push(`Found ${errors.length} error(s):\n`);

    for (const error of errors) {
      const location = error.file
        ? `${error.file}${error.line ? `:${error.line}` : ''}${error.column ? `:${error.column}` : ''}`
        : '';

      const prefix = error.severity === 'error' ? '✖' : error.severity === 'warning' ? '⚠' : 'ℹ';
      const code = error.code ? `[${error.code}] ` : '';

      lines.push(`${prefix} ${code}${error.message}`);
      if (location) lines.push(`  at ${location}`);
      if (error.fixHint) {
        const suggestions = this.suggestFix(error);
        if (suggestions.length > 0) {
          lines.push(`  💡 ${suggestions[0]}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let detectorInstance: ErrorDetector | null = null;

export function getErrorDetector(): ErrorDetector {
  if (!detectorInstance) {
    detectorInstance = new ErrorDetector();
  }
  return detectorInstance;
}

export function resetErrorDetector(): void {
  detectorInstance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Detect errors in output
 */
export function detectErrors(output: string): DetectionResult {
  return getErrorDetector().detect(output);
}

/**
 * Check if output contains errors
 */
export function hasErrors(output: string): boolean {
  return !detectErrors(output).success;
}

/**
 * Get formatted error report
 */
export function formatErrorReport(output: string): string {
  const result = detectErrors(output);
  return getErrorDetector().formatErrors(result.errors);
}
