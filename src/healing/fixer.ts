/**
 * Genesis Auto-Fix Engine (Darwin-Gödel Pattern)
 *
 * Automatically fixes detected errors using:
 * 1. Mutate: Generate N fix candidates via LLM
 * 2. Test: Run test suite on each
 * 3. Select: Keep the one that passes most tests
 * 4. Iterate: If none pass, analyze failures and retry
 */

import * as fs from 'fs';
import * as path from 'path';
import { DetectedError, ErrorCategory, getErrorDetector, detectErrors } from './detector.js';
import { bash, BashResult } from '../tools/bash.js';
import { edit, EditResult } from '../tools/edit.js';

// ============================================================================
// Types
// ============================================================================

export interface FixCandidate {
  /** Unique ID */
  id: string;
  /** Description of the fix */
  description: string;
  /** File to modify */
  file: string;
  /** Original content */
  original: string;
  /** Fixed content */
  fixed: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Source of the fix (pattern, llm, heuristic) */
  source: 'pattern' | 'llm' | 'heuristic';
}

export interface EvaluationResult {
  /** Candidate that was evaluated */
  candidate: FixCandidate;
  /** Whether tests passed */
  testsPass: boolean;
  /** Number of tests passed */
  testsPassed: number;
  /** Total tests run */
  testsTotal: number;
  /** Build succeeded */
  buildSuccess: boolean;
  /** New errors introduced */
  newErrors: DetectedError[];
  /** Errors fixed */
  fixedErrors: DetectedError[];
  /** Overall score (higher is better) */
  score: number;
}

export interface FixResult {
  /** Whether fix was successful */
  success: boolean;
  /** Applied candidate (if successful) */
  appliedFix?: FixCandidate;
  /** All candidates evaluated */
  candidates: FixCandidate[];
  /** Evaluation results */
  evaluations: EvaluationResult[];
  /** Number of iterations */
  iterations: number;
  /** Error if failed */
  error?: string;
}

export interface FixerConfig {
  /** Maximum candidates per error */
  maxCandidates: number;
  /** Maximum iterations */
  maxIterations: number;
  /** Test command */
  testCommand: string;
  /** Build command */
  buildCommand: string;
  /** Working directory */
  workingDirectory: string;
  /** Create backup before fix */
  createBackup: boolean;
  /** LLM function for generating fixes */
  llmFixGenerator?: (error: DetectedError, context: string) => Promise<FixCandidate[]>;
}

// ============================================================================
// Fix Patterns (Heuristic-based)
// ============================================================================

interface FixPattern {
  /** Error categories this pattern handles */
  categories: ErrorCategory[];
  /** Error message pattern to match */
  messagePattern?: RegExp;
  /** Error code to match */
  codePattern?: RegExp;
  /** Generate fix candidates */
  generateFix: (error: DetectedError, fileContent: string) => FixCandidate[];
}

const FIX_PATTERNS: FixPattern[] = [
  // Missing semicolon
  {
    categories: ['syntax'],
    messagePattern: /missing semicolon/i,
    generateFix: (error, content) => {
      if (!error.line) return [];
      const lines = content.split('\n');
      const lineIdx = error.line - 1;
      if (lineIdx >= lines.length) return [];

      const line = lines[lineIdx];
      if (!line.trim().endsWith(';')) {
        const fixed = [...lines];
        fixed[lineIdx] = line.trimEnd() + ';';
        return [{
          id: `fix-semicolon-${error.line}`,
          description: `Add missing semicolon at line ${error.line}`,
          file: error.file || '',
          original: content,
          fixed: fixed.join('\n'),
          confidence: 0.9,
          source: 'pattern',
        }];
      }
      return [];
    },
  },

  // Undefined variable - add declaration
  {
    categories: ['runtime', 'type'],
    messagePattern: /is not defined|Cannot find name/i,
    generateFix: (error, content) => {
      // Extract variable name from error
      const match = error.message.match(/'(\w+)' is not defined|Cannot find name '(\w+)'/);
      if (!match) return [];

      const varName = match[1] || match[2];
      const lines = content.split('\n');

      // Add declaration at the top of the file (after imports)
      let insertIdx = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('import ') || lines[i].startsWith('export ')) {
          insertIdx = i + 1;
        }
      }

      const fixed = [...lines];
      fixed.splice(insertIdx, 0, `let ${varName}: any; // TODO: Add proper type`);

      return [{
        id: `fix-undefined-${varName}`,
        description: `Declare undefined variable '${varName}'`,
        file: error.file || '',
        original: content,
        fixed: fixed.join('\n'),
        confidence: 0.5,
        source: 'heuristic',
      }];
    },
  },

  // Missing import
  {
    categories: ['dependency'],
    messagePattern: /Cannot find module '(.+)'/,
    generateFix: (error) => {
      const match = error.message.match(/Cannot find module '(.+)'/);
      if (!match) return [];

      const moduleName = match[1];
      // This is a special case - we return a "command" fix
      return [{
        id: `fix-import-${moduleName}`,
        description: `Install missing module '${moduleName}'`,
        file: 'package.json',
        original: '',
        fixed: `npm install ${moduleName}`,
        confidence: 0.8,
        source: 'pattern',
      }];
    },
  },

  // Type assertion fix
  {
    categories: ['type'],
    messagePattern: /Type '(.+)' is not assignable to type '(.+)'/,
    generateFix: (error, content) => {
      if (!error.line || !error.column) return [];

      const match = error.message.match(/Type '(.+)' is not assignable to type '(.+)'/);
      if (!match) return [];

      const [, actualType, expectedType] = match;
      const lines = content.split('\n');
      const lineIdx = error.line - 1;
      const line = lines[lineIdx];

      // Try to find the expression and add type assertion
      // This is a simplistic approach
      const candidates: FixCandidate[] = [];

      // Option 1: Add 'as' assertion
      const col = error.column - 1;
      // Find the end of the expression
      let endCol = col;
      while (endCol < line.length && /[\w\.\[\]()]/.test(line[endCol])) {
        endCol++;
      }

      if (endCol > col) {
        const expr = line.slice(col, endCol);
        const fixedLine = line.slice(0, endCol) + ` as ${expectedType}` + line.slice(endCol);
        const fixed = [...lines];
        fixed[lineIdx] = fixedLine;

        candidates.push({
          id: `fix-type-assertion-${error.line}`,
          description: `Add type assertion 'as ${expectedType}'`,
          file: error.file || '',
          original: content,
          fixed: fixed.join('\n'),
          confidence: 0.6,
          source: 'heuristic',
        });
      }

      return candidates;
    },
  },

  // Null check fix
  {
    categories: ['type', 'runtime'],
    messagePattern: /possibly 'null'|possibly 'undefined'|is possibly/i,
    generateFix: (error, content) => {
      if (!error.line) return [];

      const lines = content.split('\n');
      const lineIdx = error.line - 1;
      const line = lines[lineIdx];

      // Find property access that might be null
      const match = line.match(/(\w+(?:\.\w+)*)\./);
      if (!match) return [];

      const expr = match[1];
      const candidates: FixCandidate[] = [];

      // Option 1: Optional chaining
      const fixed1 = line.replace(new RegExp(`${expr}\\.`), `${expr}?.`);
      if (fixed1 !== line) {
        const fixedLines1 = [...lines];
        fixedLines1[lineIdx] = fixed1;
        candidates.push({
          id: `fix-optional-chain-${error.line}`,
          description: `Use optional chaining for '${expr}'`,
          file: error.file || '',
          original: content,
          fixed: fixedLines1.join('\n'),
          confidence: 0.7,
          source: 'heuristic',
        });
      }

      // Option 2: Null check
      const indent = line.match(/^(\s*)/)?.[1] || '';
      const fixedLines2 = [...lines];
      fixedLines2.splice(lineIdx, 0, `${indent}if (${expr}) {`);
      fixedLines2[lineIdx + 1] = indent + '  ' + line.trim();
      fixedLines2.splice(lineIdx + 2, 0, `${indent}}`);
      candidates.push({
        id: `fix-null-check-${error.line}`,
        description: `Add null check for '${expr}'`,
        file: error.file || '',
        original: content,
        fixed: fixedLines2.join('\n'),
        confidence: 0.5,
        source: 'heuristic',
      });

      return candidates;
    },
  },
];

// ============================================================================
// Auto-Fixer Class
// ============================================================================

export class AutoFixer {
  private config: FixerConfig;
  private patterns: FixPattern[];

  constructor(config?: Partial<FixerConfig>) {
    this.config = {
      maxCandidates: 5,
      maxIterations: 3,
      testCommand: 'npm test',
      buildCommand: 'npm run build',
      workingDirectory: process.cwd(),
      createBackup: true,
      ...config,
    };
    this.patterns = [...FIX_PATTERNS];
  }

  // --------------------------------------------------------------------------
  // Main Fix Flow
  // --------------------------------------------------------------------------

  /**
   * Attempt to fix errors automatically (Darwin-Gödel pattern)
   */
  async fix(errors: DetectedError[]): Promise<FixResult> {
    if (errors.length === 0) {
      return { success: true, candidates: [], evaluations: [], iterations: 0 };
    }

    const allCandidates: FixCandidate[] = [];
    const allEvaluations: EvaluationResult[] = [];
    let iterations = 0;
    let currentErrors = [...errors];

    while (iterations < this.config.maxIterations && currentErrors.length > 0) {
      iterations++;

      // 1. MUTATE: Generate fix candidates
      const candidates = await this.generateCandidates(currentErrors);
      allCandidates.push(...candidates);

      if (candidates.length === 0) {
        return {
          success: false,
          candidates: allCandidates,
          evaluations: allEvaluations,
          iterations,
          error: 'No fix candidates could be generated',
        };
      }

      // 2. TEST: Evaluate each candidate
      const evaluations = await this.evaluateCandidates(candidates);
      allEvaluations.push(...evaluations);

      // 3. SELECT: Find the best candidate
      const best = this.selectBest(evaluations);

      if (best && best.testsPass && best.buildSuccess) {
        // Success! Apply the fix
        const applied = await this.applyFix(best.candidate);
        if (applied) {
          return {
            success: true,
            appliedFix: best.candidate,
            candidates: allCandidates,
            evaluations: allEvaluations,
            iterations,
          };
        }
      }

      // 4. ITERATE: Analyze failures and retry with new context
      if (best) {
        // Update errors based on what was partially fixed
        currentErrors = best.newErrors;
      } else {
        // No progress, break
        break;
      }
    }

    return {
      success: false,
      candidates: allCandidates,
      evaluations: allEvaluations,
      iterations,
      error: `Could not fix all errors after ${iterations} iterations`,
    };
  }

  // --------------------------------------------------------------------------
  // Candidate Generation
  // --------------------------------------------------------------------------

  /**
   * Generate fix candidates for errors
   */
  async generateCandidates(errors: DetectedError[]): Promise<FixCandidate[]> {
    const candidates: FixCandidate[] = [];

    for (const error of errors) {
      // Skip errors without file information
      if (!error.file) continue;

      const filePath = path.isAbsolute(error.file)
        ? error.file
        : path.join(this.config.workingDirectory, error.file);

      // v9.2.0 Security: Path traversal protection (v10.0 fix)
      const resolvedPath = path.resolve(filePath);
      const workingDir = path.resolve(this.config.workingDirectory);
      const relative = path.relative(workingDir, resolvedPath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        console.warn(`[Fixer] Path traversal attempt blocked: ${error.file}`);
        continue;
      }

      if (!fs.existsSync(filePath)) continue;

      // Skip directories
      try {
        if (!fs.statSync(filePath).isFile()) continue;
      } catch {
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      // Try pattern-based fixes first
      for (const pattern of this.patterns) {
        if (!pattern.categories.includes(error.category)) continue;

        if (pattern.messagePattern && !pattern.messagePattern.test(error.message)) continue;
        if (pattern.codePattern && error.code && !pattern.codePattern.test(error.code)) continue;

        const patternCandidates = pattern.generateFix(error, content);
        candidates.push(...patternCandidates);
      }

      // Try LLM-based fixes if available
      if (this.config.llmFixGenerator) {
        try {
          const llmCandidates = await this.config.llmFixGenerator(error, content);
          candidates.push(...llmCandidates);
        } catch {
          // LLM generation failed, continue with pattern-based fixes
        }
      }
    }

    // Deduplicate and limit
    const seen = new Set<string>();
    return candidates
      .filter(c => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      })
      .slice(0, this.config.maxCandidates * errors.length);
  }

  // --------------------------------------------------------------------------
  // Candidate Evaluation
  // --------------------------------------------------------------------------

  /**
   * Evaluate fix candidates
   */
  async evaluateCandidates(candidates: FixCandidate[]): Promise<EvaluationResult[]> {
    const results: EvaluationResult[] = [];

    for (const candidate of candidates) {
      const result = await this.evaluateCandidate(candidate);
      results.push(result);
    }

    return results;
  }

  /**
   * Evaluate a single candidate
   */
  async evaluateCandidate(candidate: FixCandidate): Promise<EvaluationResult> {
    const filePath = path.isAbsolute(candidate.file)
      ? candidate.file
      : path.join(this.config.workingDirectory, candidate.file);

    // Special case: npm install command
    if (candidate.fixed.startsWith('npm install')) {
      const installResult = await bash(candidate.fixed, {
        cwd: this.config.workingDirectory,
        timeout: 60000,
      });

      return {
        candidate,
        testsPass: installResult.success,
        testsPassed: installResult.success ? 1 : 0,
        testsTotal: 1,
        buildSuccess: installResult.success,
        newErrors: [],
        fixedErrors: [],
        score: installResult.success ? 1 : 0,
      };
    }

    // Create backup
    let backup: string | undefined;
    if (this.config.createBackup && fs.existsSync(filePath)) {
      backup = candidate.original;
    }

    // Apply fix temporarily
    try {
      fs.writeFileSync(filePath, candidate.fixed, 'utf-8');
    } catch {
      return {
        candidate,
        testsPass: false,
        testsPassed: 0,
        testsTotal: 0,
        buildSuccess: false,
        newErrors: [],
        fixedErrors: [],
        score: 0,
      };
    }

    // Run build
    const buildResult = await bash(this.config.buildCommand, {
      cwd: this.config.workingDirectory,
      timeout: 60000,
    });

    // Detect new errors
    const buildErrors = detectErrors(buildResult.stdout + '\n' + buildResult.stderr);

    // Run tests if build succeeded
    let testResult: BashResult | undefined;
    let testErrors = { errors: [] as DetectedError[], success: true };

    if (buildResult.success) {
      testResult = await bash(this.config.testCommand, {
        cwd: this.config.workingDirectory,
        timeout: 120000,
      });
      testErrors = detectErrors(testResult.stdout + '\n' + testResult.stderr);
    }

    // Restore original
    if (backup !== undefined) {
      fs.writeFileSync(filePath, backup, 'utf-8');
    }

    // Calculate score
    const newErrors = [...buildErrors.errors, ...testErrors.errors];
    const score = this.calculateScore(buildResult.success, testResult?.success || false, newErrors.length);

    return {
      candidate,
      testsPass: testResult?.success || false,
      testsPassed: testResult?.success ? 1 : 0, // Simplified
      testsTotal: 1,
      buildSuccess: buildResult.success,
      newErrors,
      fixedErrors: [], // Would need to compare with original errors
      score,
    };
  }

  /**
   * Calculate evaluation score
   */
  private calculateScore(buildSuccess: boolean, testsPass: boolean, newErrorCount: number): number {
    let score = 0;

    if (buildSuccess) score += 0.4;
    if (testsPass) score += 0.4;
    score += Math.max(0, 0.2 - (newErrorCount * 0.05)); // Penalize new errors

    return Math.max(0, Math.min(1, score));
  }

  // --------------------------------------------------------------------------
  // Selection and Application
  // --------------------------------------------------------------------------

  /**
   * Select the best candidate from evaluations
   */
  selectBest(evaluations: EvaluationResult[]): EvaluationResult | null {
    if (evaluations.length === 0) return null;

    return evaluations.reduce((best, current) => {
      if (!best) return current;
      return current.score > best.score ? current : best;
    }, null as EvaluationResult | null);
  }

  /**
   * Apply a fix permanently
   */
  async applyFix(candidate: FixCandidate): Promise<boolean> {
    // Special case: npm install command
    if (candidate.fixed.startsWith('npm install')) {
      const result = await bash(candidate.fixed, {
        cwd: this.config.workingDirectory,
        timeout: 60000,
      });
      return result.success;
    }

    const filePath = path.isAbsolute(candidate.file)
      ? candidate.file
      : path.join(this.config.workingDirectory, candidate.file);

    try {
      // Use edit tool for atomic write with backup
      const result = await edit({
        file_path: filePath,
        old_string: candidate.original,
        new_string: candidate.fixed,
      });

      return result.success;
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  getConfig(): FixerConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<FixerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Add a custom fix pattern
   */
  addPattern(pattern: FixPattern): void {
    this.patterns.push(pattern);
  }

  /**
   * Set LLM fix generator
   */
  setLLMGenerator(generator: (error: DetectedError, context: string) => Promise<FixCandidate[]>): void {
    this.config.llmFixGenerator = generator;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let fixerInstance: AutoFixer | null = null;

export function getAutoFixer(config?: Partial<FixerConfig>): AutoFixer {
  if (!fixerInstance) {
    fixerInstance = new AutoFixer(config);
  } else if (config) {
    fixerInstance.updateConfig(config);
  }
  return fixerInstance;
}

export function resetAutoFixer(): void {
  fixerInstance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Attempt to fix errors in output
 */
export async function autoFix(output: string, config?: Partial<FixerConfig>): Promise<FixResult> {
  const errors = detectErrors(output).errors.filter(e => e.severity === 'error');
  return getAutoFixer(config).fix(errors);
}

/**
 * Generate fix candidates for an error
 */
export async function generateFixes(error: DetectedError): Promise<FixCandidate[]> {
  return getAutoFixer().generateCandidates([error]);
}
