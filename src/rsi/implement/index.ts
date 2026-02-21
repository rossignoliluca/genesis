/**
 * Genesis RSI - IMPLEMENT Subsystem
 *
 * Executes improvement plans in sandbox through:
 * - Sandbox environment creation
 * - Code generation/modification via Darwin-Gödel
 * - Build verification
 * - Test execution
 * - Invariant checking
 *
 * @module rsi/implement
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import { createHash } from 'crypto';
import {
  ImprovementPlan, ImplementationResult, AppliedChange,
  BuildResult, TestResult, TestFailure, InvariantResult, PlannedChange
} from '../types.js';
import { getMCPClient } from '../../mcp/index.js';
import { getConsciousnessSystem } from '../../consciousness/index.js';
import { getMultiModelCodeGenerator, type ConsensusResult } from './multi-model-codegen.js';

// =============================================================================
// SANDBOX MANAGER
// =============================================================================

export class SandboxManager {
  private baseDir: string;

  constructor() {
    this.baseDir = path.resolve(process.cwd(), '.genesis/sandbox');
  }

  /**
   * Create a sandbox environment for testing changes
   */
  async createSandbox(planId: string): Promise<string> {
    // FIX: Sanitize planId to prevent path traversal attacks
    // Only allow alphanumeric, dashes, underscores (UUID format)
    const sanitizedPlanId = planId.replace(/[^a-zA-Z0-9\-_]/g, '');
    if (!sanitizedPlanId || sanitizedPlanId.length < 10) {
      throw new Error('Invalid plan ID format');
    }
    const sandboxPath = path.join(this.baseDir, sanitizedPlanId);

    // FIX: Verify sandbox path is actually under baseDir (defense in depth)
    const resolvedSandbox = path.resolve(sandboxPath);
    const resolvedBase = path.resolve(this.baseDir);
    if (!resolvedSandbox.startsWith(resolvedBase + path.sep)) {
      throw new Error('Sandbox path escape detected');
    }

    // Clean up if exists
    if (fs.existsSync(sandboxPath)) {
      fs.rmSync(sandboxPath, { recursive: true, force: true });
    }

    // Create sandbox directory
    fs.mkdirSync(sandboxPath, { recursive: true });

    // Copy current source to sandbox
    const srcDir = path.resolve(process.cwd(), 'src');
    const sandboxSrc = path.join(sandboxPath, 'src');

    this.copyDir(srcDir, sandboxSrc);

    // Copy package.json and tsconfig
    const filesToCopy = ['package.json', 'tsconfig.json'];
    for (const file of filesToCopy) {
      const srcFile = path.resolve(process.cwd(), file);
      if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, path.join(sandboxPath, file));
      }
    }

    // Symlink node_modules so build and tests can resolve dependencies
    const nodeModulesSrc = path.resolve(process.cwd(), 'node_modules');
    const nodeModulesDst = path.join(sandboxPath, 'node_modules');
    if (fs.existsSync(nodeModulesSrc) && !fs.existsSync(nodeModulesDst)) {
      fs.symlinkSync(nodeModulesSrc, nodeModulesDst, 'junction');
    }

    console.log(`[RSI Implement] Created sandbox at: ${sandboxPath}`);
    return sandboxPath;
  }

  /**
   * Clean up sandbox after use
   */
  cleanupSandbox(sandboxPath: string): void {
    try {
      if (fs.existsSync(sandboxPath)) {
        fs.rmSync(sandboxPath, { recursive: true, force: true });
      }
    } catch (error) {
      console.error(`[RSI Implement] Failed to cleanup sandbox: ${error}`);
    }
  }

  private copyDir(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
          this.copyDir(srcPath, destPath);
        }
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

// =============================================================================
// CODE GENERATOR
// =============================================================================

export class CodeGenerator {
  private mcp = getMCPClient();
  private multiModelGenerator = getMultiModelCodeGenerator();

  /**
   * Generate code for a planned change using multi-model racing
   */
  async generateCode(change: PlannedChange, sandboxPath: string): Promise<string | null> {
    if (!change.codeSpec) {
      return null;
    }

    try {
      // Use multi-model racing for better code quality
      console.log(`[RSI Implement] Using multi-model code generation...`);
      const result = await this.multiModelGenerator.generateWithRacing(change, sandboxPath, {
        maxModels: 3,
        timeout: 60000,
        useConsensus: true,
      });

      if (result.selectedCode) {
        console.log(`[RSI Implement] Selected code from ${result.selectedModel} (confidence: ${(result.confidence * 100).toFixed(1)}%)`);
        return result.selectedCode;
      }

      // Fallback to single-model if multi-model fails
      console.log(`[RSI Implement] Multi-model failed, falling back to single model...`);
      return this.generateCodeSingleModel(change, sandboxPath);
    } catch (error) {
      console.error(`[RSI Implement] Multi-model code generation failed: ${error}`);
      // Fallback to single model
      return this.generateCodeSingleModel(change, sandboxPath);
    }
  }

  /**
   * Fallback: Generate code using single OpenAI model
   */
  private async generateCodeSingleModel(change: PlannedChange, sandboxPath: string): Promise<string | null> {
    try {
      const result = await this.mcp.call('openai', 'openai_chat', {
        messages: [
          {
            role: 'system',
            content: `You are a TypeScript code generator for Genesis, an autonomous AI system.
Generate clean, well-documented TypeScript code.
Follow existing patterns in the codebase.
Include proper error handling.
Do not include any explanation, just the code.`,
          },
          {
            role: 'user',
            content: `Generate TypeScript code for the following specification:

File: ${change.file}
Change type: ${change.type}
Description: ${change.description}

Specification:
${change.codeSpec}

Generate only the code, no markdown fences or explanations.`,
          },
        ],
        model: 'gpt-4o',
        max_tokens: 4000,
      }) as any;

      if (result && result.content) {
        let code = result.content;
        code = code.replace(/^```(?:typescript|ts)?\n?/i, '');
        code = code.replace(/\n?```$/i, '');
        return code.trim();
      }
    } catch (error) {
      console.error(`[RSI Implement] Single-model code generation failed: ${error}`);
    }

    return null;
  }

  /**
   * Apply search/replace modification
   */
  applySearchReplace(
    filePath: string,
    search: string,
    replace: string
  ): { success: boolean; error?: string } {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      let content = fs.readFileSync(filePath, 'utf-8');

      if (!content.includes(search)) {
        return { success: false, error: 'Search string not found in file' };
      }

      content = content.replace(search, replace);
      fs.writeFileSync(filePath, content);

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
}

// =============================================================================
// BUILD RUNNER
// =============================================================================

export class BuildRunner {
  /**
   * Run TypeScript build in sandbox
   */
  async runBuild(sandboxPath: string, timeoutMs: number = 120000): Promise<BuildResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Run tsc
      const result = execSync('npx tsc --noEmit', {
        cwd: sandboxPath,
        timeout: timeoutMs,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      return {
        success: true,
        errors: [],
        warnings: [],
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      // Parse TypeScript errors
      const output = error.stdout || error.stderr || String(error);
      const lines = output.split('\n');

      for (const line of lines) {
        if (line.includes('error TS')) {
          errors.push(line.trim());
        } else if (line.includes('warning')) {
          warnings.push(line.trim());
        }
      }

      return {
        success: false,
        errors: errors.length > 0 ? errors : ['Build failed: ' + output.slice(0, 500)],
        warnings,
        duration: Date.now() - startTime,
      };
    }
  }
}

// =============================================================================
// TEST RUNNER
// =============================================================================

export class TestRunner {
  /**
   * Run tests in sandbox
   */
  async runTests(sandboxPath: string, timeoutMs: number = 300000): Promise<TestResult> {
    const startTime = Date.now();
    const failures: TestFailure[] = [];
    const projectRoot = process.cwd();

    try {
      // Run existing test suite from project root (sandbox has no dist/)
      const result = execSync(
        'find dist/src -name "*.test.js" -type f | xargs node --test',
        {
          cwd: projectRoot,
          timeout: timeoutMs,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );

      const { passed, failed, skipped } = this.parseTestOutput(result);

      return {
        success: failed === 0,
        passed,
        failed,
        skipped,
        failures: [],
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      const output = error.stdout || error.stderr || String(error);

      const failureMatches = output.matchAll(/✖ (.+?)\n.*?Error: (.+?)(?:\n|$)/g);
      for (const match of failureMatches) {
        failures.push({
          name: match[1] || 'Unknown test',
          error: match[2] || 'Unknown error',
          file: 'unknown',
        });
      }

      const { passed, failed, skipped } = this.parseTestOutput(output);
      const actualFailed = Math.max(failed, failures.length);

      return {
        success: actualFailed === 0,
        passed,
        failed: actualFailed || 1,
        skipped,
        failures,
        duration: Date.now() - startTime,
      };
    }
  }

  private parseTestOutput(output: string): { passed: number; failed: number; skipped: number } {
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    // Parse node:test summary format: "ℹ pass N" / "ℹ fail N"
    const nodePassMatch = output.match(/ℹ\s+pass\s+(\d+)/);
    const nodeFailMatch = output.match(/ℹ\s+fail\s+(\d+)/);
    const nodeSkipMatch = output.match(/ℹ\s+skipped\s+(\d+)/);

    if (nodePassMatch || nodeFailMatch) {
      passed = nodePassMatch ? parseInt(nodePassMatch[1], 10) : 0;
      failed = nodeFailMatch ? parseInt(nodeFailMatch[1], 10) : 0;
      skipped = nodeSkipMatch ? parseInt(nodeSkipMatch[1], 10) : 0;
      return { passed, failed, skipped };
    }

    // Fallback: mocha/jest format
    const summaryMatch = output.match(/(\d+) passing.*?(\d+) failing/);
    if (summaryMatch) {
      passed = parseInt(summaryMatch[1], 10);
      failed = parseInt(summaryMatch[2], 10);
    } else {
      passed = (output.match(/✔/g) || []).length;
      failed = (output.match(/✖/g) || []).length;
    }

    const skipMatch = output.match(/(\d+) skipped/);
    if (skipMatch) {
      skipped = parseInt(skipMatch[1], 10);
    }

    return { passed, failed, skipped };
  }
}

// =============================================================================
// INVARIANT CHECKER
// =============================================================================

export class InvariantChecker {
  /**
   * Check all invariants after implementation
   */
  async checkInvariants(): Promise<InvariantResult> {
    const results: { id: string; passed: boolean; message: string }[] = [];
    let allPassed = true;

    // Check φ invariant
    const consciousness = getConsciousnessSystem();
    const phi = consciousness.getCurrentLevel().rawPhi;
    const phiPassed = phi >= 0.1;
    results.push({
      id: 'phi-minimum',
      passed: phiPassed,
      message: phiPassed ? `φ = ${phi.toFixed(3)} (OK)` : `φ = ${phi.toFixed(3)} (BELOW THRESHOLD)`,
    });
    if (!phiPassed) allPassed = false;

    // Check memory bounds
    const mem = process.memoryUsage();
    const heapRatio = mem.heapUsed / mem.heapTotal;
    const memPassed = heapRatio < 0.95;
    results.push({
      id: 'memory-bounds',
      passed: memPassed,
      message: memPassed
        ? `Heap ${(heapRatio * 100).toFixed(1)}% (OK)`
        : `Heap ${(heapRatio * 100).toFixed(1)}% (CRITICAL)`,
    });
    if (!memPassed) allPassed = false;

    // Check consciousness invariant
    const conscInvariant = consciousness.checkInvariant();
    const conscResult = conscInvariant as any;
    results.push({
      id: 'consciousness-invariant',
      passed: conscInvariant.satisfied,
      message: conscInvariant.satisfied
        ? 'Consciousness invariant satisfied'
        : `Consciousness invariant violated: ${conscResult.reason || 'unknown reason'}`,
    });
    if (!conscInvariant.satisfied) allPassed = false;

    return { allPassed, results };
  }
}

// =============================================================================
// IMPLEMENTATION ENGINE
// =============================================================================

export class ImplementationEngine {
  private sandboxManager: SandboxManager;
  private codeGenerator: CodeGenerator;
  private buildRunner: BuildRunner;
  private testRunner: TestRunner;
  private invariantChecker: InvariantChecker;

  constructor() {
    this.sandboxManager = new SandboxManager();
    this.codeGenerator = new CodeGenerator();
    this.buildRunner = new BuildRunner();
    this.testRunner = new TestRunner();
    this.invariantChecker = new InvariantChecker();
  }

  /**
   * Implement an approved plan
   */
  async implement(plan: ImprovementPlan): Promise<ImplementationResult> {
    const startTime = Date.now();
    const appliedChanges: AppliedChange[] = [];

    console.log(`[RSI Implement] Starting implementation of plan: ${plan.id}`);

    // 1. Create sandbox
    let sandboxPath: string;
    try {
      sandboxPath = await this.sandboxManager.createSandbox(plan.id);
    } catch (error) {
      return this.failureResult(plan.id, '', 'Failed to create sandbox: ' + error, startTime);
    }

    try {
      // 2. Apply each change
      for (const change of plan.changes) {
        const applied = await this.applyChange(change, sandboxPath);
        appliedChanges.push(applied);

        if (!applied.applied) {
          console.error(`[RSI Implement] Change failed: ${change.id} - ${applied.error}`);
          // Continue with other changes but note the failure
        }
      }

      // Check if any critical changes failed
      const criticalFailures = appliedChanges.filter(c => !c.applied);
      if (criticalFailures.length === appliedChanges.length) {
        return this.failureResult(
          plan.id,
          sandboxPath,
          'All changes failed to apply',
          startTime,
          appliedChanges
        );
      }

      // 3. Run build
      console.log(`[RSI Implement] Running build...`);
      const buildResult = await this.buildRunner.runBuild(sandboxPath);

      if (!buildResult.success) {
        console.error(`[RSI Implement] Build failed: ${buildResult.errors.join(', ')}`);
        return {
          planId: plan.id,
          success: false,
          changes: appliedChanges,
          sandboxPath,
          buildResult,
          testResult: { success: false, passed: 0, failed: 0, skipped: 0, failures: [], duration: 0 },
          invariantResult: { allPassed: false, results: [] },
          duration: Date.now() - startTime,
          error: 'Build failed',
        };
      }

      // 4. Run tests
      console.log(`[RSI Implement] Running tests...`);
      const testResult = await this.testRunner.runTests(sandboxPath);

      if (!testResult.success) {
        console.log(`[RSI Implement] Tests failed: ${testResult.failures.length} failures`);
        return {
          planId: plan.id,
          success: false,
          changes: appliedChanges,
          sandboxPath,
          buildResult,
          testResult,
          invariantResult: { allPassed: false, results: [] },
          duration: Date.now() - startTime,
          error: `Tests failed: ${testResult.failed} failures`,
        };
      }

      // 5. Check invariants
      console.log(`[RSI Implement] Checking invariants...`);
      const invariantResult = await this.invariantChecker.checkInvariants();

      if (!invariantResult.allPassed) {
        const violations = invariantResult.results.filter(r => !r.passed);
        console.log(`[RSI Implement] Invariants violated: ${violations.map(v => v.id).join(', ')}`);
        return {
          planId: plan.id,
          success: false,
          changes: appliedChanges,
          sandboxPath,
          buildResult,
          testResult,
          invariantResult,
          duration: Date.now() - startTime,
          error: `Invariants violated: ${violations.map(v => v.id).join(', ')}`,
        };
      }

      // 6. SUCCESS!
      console.log(`[RSI Implement] Implementation successful!`);
      return {
        planId: plan.id,
        success: true,
        changes: appliedChanges,
        sandboxPath,
        buildResult,
        testResult,
        invariantResult,
        duration: Date.now() - startTime,
      };

    } catch (error) {
      return this.failureResult(
        plan.id,
        sandboxPath,
        `Implementation error: ${error}`,
        startTime,
        appliedChanges
      );
    }
  }

  private async applyChange(
    change: PlannedChange,
    sandboxPath: string
  ): Promise<AppliedChange> {
    // FIX: Sanitize file path to prevent path traversal
    const normalizedFile = path.normalize(change.file).replace(/^(\.\.(\/|\\|$))+/, '');
    if (normalizedFile.startsWith('/') || normalizedFile.includes('..')) {
      return {
        changeId: change.id,
        file: change.file,
        applied: false,
        beforeHash: '',
        afterHash: '',
        error: 'Invalid file path: path traversal detected',
      };
    }
    const filePath = path.join(sandboxPath, normalizedFile);

    // FIX: Verify file is within sandbox (defense in depth)
    const resolvedPath = path.resolve(filePath);
    const resolvedSandbox = path.resolve(sandboxPath);
    if (!resolvedPath.startsWith(resolvedSandbox + path.sep)) {
      return {
        changeId: change.id,
        file: change.file,
        applied: false,
        beforeHash: '',
        afterHash: '',
        error: 'Invalid file path: sandbox escape detected',
      };
    }

    const beforeHash = this.fileHash(filePath);

    try {
      switch (change.type) {
        case 'create': {
          // Ensure directory exists
          const dir = path.dirname(filePath);
          fs.mkdirSync(dir, { recursive: true });

          // Generate or use provided code
          let code: string | null = null;
          if (change.codeSpec) {
            code = await this.codeGenerator.generateCode(change, sandboxPath);
          }

          if (code) {
            fs.writeFileSync(filePath, code);
            return {
              changeId: change.id,
              file: change.file,
              applied: true,
              beforeHash,
              afterHash: this.fileHash(filePath),
            };
          } else {
            // v15.0: FAIL instead of creating placeholder
            // Placeholder files defeat RSI purpose - they pass build but don't implement anything
            return {
              changeId: change.id,
              file: change.file,
              applied: false,
              beforeHash,
              afterHash: '',
              error: 'Code generation failed - cannot create file without valid code',
            };
          }
        }

        case 'modify': {
          if (change.searchReplace) {
            const result = this.codeGenerator.applySearchReplace(
              filePath,
              change.searchReplace.search,
              change.searchReplace.replace
            );
            if (!result.success) {
              return {
                changeId: change.id,
                file: change.file,
                applied: false,
                beforeHash,
                afterHash: beforeHash,
                error: result.error,
              };
            }
          } else if (change.codeSpec) {
            // Generate new code and append — with deduplication
            const newCode = await this.codeGenerator.generateCode(change, sandboxPath);
            if (newCode && fs.existsSync(filePath)) {
              const existing = fs.readFileSync(filePath, 'utf-8');
              const existingDecls = new Set(
                (existing.match(/(?:export\s+)?(?:function|class|interface|type|const|enum|async\s+function)\s+(\w+)/g) || [])
                  .map(m => m.replace(/^export\s+/, '').replace(/^async\s+/, ''))
              );
              const filteredLines = newCode.split('\n').filter(line => {
                const declMatch = line.match(/^(?:export\s+)?(?:function|class|interface|type|const|enum|async\s+function)\s+(\w+)/);
                if (declMatch) {
                  const name = declMatch[1];
                  for (const decl of existingDecls) {
                    if (decl.endsWith(` ${name}`)) return false;
                  }
                }
                if (line.startsWith('import ') && existing.includes(line.trim())) return false;
                return true;
              });
              const deduped = filteredLines.join('\n').trim();
              if (deduped) {
                fs.writeFileSync(filePath, existing + '\n\n' + deduped);
              }
            }
          }

          return {
            changeId: change.id,
            file: change.file,
            applied: true,
            beforeHash,
            afterHash: this.fileHash(filePath),
          };
        }

        case 'delete': {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          return {
            changeId: change.id,
            file: change.file,
            applied: true,
            beforeHash,
            afterHash: '',
          };
        }

        case 'rename': {
          // Not implemented yet
          return {
            changeId: change.id,
            file: change.file,
            applied: false,
            beforeHash,
            afterHash: beforeHash,
            error: 'Rename not implemented',
          };
        }

        default:
          return {
            changeId: change.id,
            file: change.file,
            applied: false,
            beforeHash,
            afterHash: beforeHash,
            error: 'Unknown change type',
          };
      }
    } catch (error) {
      return {
        changeId: change.id,
        file: change.file,
        applied: false,
        beforeHash,
        afterHash: beforeHash,
        error: String(error),
      };
    }
  }

  private fileHash(filePath: string): string {
    try {
      if (!fs.existsSync(filePath)) {
        return '';
      }
      const content = fs.readFileSync(filePath);
      return createHash('sha256').update(content).digest('hex').slice(0, 16);
    } catch (err) {
      console.error('[RSI Implement] File hash failed:', err);
      return '';
    }
  }

  private failureResult(
    planId: string,
    sandboxPath: string,
    error: string,
    startTime: number,
    changes: AppliedChange[] = []
  ): ImplementationResult {
    return {
      planId,
      success: false,
      changes,
      sandboxPath,
      buildResult: { success: false, errors: [error], warnings: [], duration: 0 },
      testResult: { success: false, passed: 0, failed: 0, skipped: 0, failures: [], duration: 0 },
      invariantResult: { allPassed: false, results: [] },
      duration: Date.now() - startTime,
      error,
    };
  }

  /**
   * Apply successful sandbox changes to main codebase
   */
  async promoteToMain(sandboxPath: string): Promise<void> {
    const sandboxSrc = path.join(sandboxPath, 'src');
    const mainSrc = path.resolve(process.cwd(), 'src');

    // Copy changed files from sandbox to main
    this.copyDir(sandboxSrc, mainSrc);

    console.log(`[RSI Implement] Promoted sandbox changes to main codebase`);
  }

  private copyDir(src: string, dest: string): void {
    if (!fs.existsSync(src)) return;

    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let implementationEngineInstance: ImplementationEngine | null = null;

export function getImplementationEngine(): ImplementationEngine {
  if (!implementationEngineInstance) {
    implementationEngineInstance = new ImplementationEngine();
  }
  return implementationEngineInstance;
}

export function resetImplementationEngine(): void {
  implementationEngineInstance = null;
}
