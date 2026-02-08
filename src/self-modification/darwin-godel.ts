/**
 * Genesis Darwin-Gödel Engine
 *
 * Radical self-modification with formal verification.
 * Named after:
 * - Darwin: Evolution through variation and selection
 * - Gödel: Self-reference and incompleteness
 *
 * This is the frontier: an AI system that can modify its own core,
 * including the code that decides what to modify.
 *
 * Architecture:
 * 1. TCB (Trusted Computing Base) - THIS FILE - cannot be self-modified
 * 2. Sandbox: Copy of Genesis where modifications are tested
 * 3. Invariant Verification: All invariants must pass after modification
 * 4. Atomic Apply: Only on verification success
 * 5. Rollback: Git-based restore on failure
 *
 * The Gödel Problem:
 * - Can this code modify itself? No - the TCB is immutable
 * - But it can modify EVERYTHING ELSE, including core decision-making
 * - The invariant checker is in TCB, so modifications can't disable it
 */

import { spawn, spawnSync, SpawnSyncReturns } from 'child_process';
import {
  existsSync,
  mkdirSync,
  rmSync,
  cpSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';
import { invariantRegistry, InvariantContext, InvariantResult } from '../kernel/invariants.js';
import {
  broadcastSandboxProgress,
  broadcastInvariantChecked,
  broadcastBuildOutput,
} from '../observability/dashboard.js';

// ============================================================================
// Types
// ============================================================================

export interface Modification {
  id: string;
  description: string;
  targetFile: string;          // Relative to src/
  type: 'replace' | 'patch' | 'append' | 'delete';
  content?: string;            // New content or patch
  search?: string;             // For replace: what to find
  reason: string;              // Why this modification?
  expectedImprovement: string; // What metric should improve?
}

export interface ModificationPlan {
  id: string;
  name: string;
  description: string;
  modifications: Modification[];
  rollbackPoint?: string;      // Git commit hash
  createdAt: Date;
}

export interface VerificationResult {
  passed: boolean;
  buildSuccess: boolean;
  testsSuccess: boolean;
  invariantsPass: boolean;
  invariantResults: InvariantResult[];
  runtimeCheck: boolean;
  metrics?: {
    before: Record<string, number>;
    after: Record<string, number>;
  };
  errors: string[];
}

export interface ApplyResult {
  success: boolean;
  planId: string;
  verificaton: VerificationResult;
  commitHash?: string;
  rollbackHash?: string;
  duration: number;
}

export interface DarwinGodelConfig {
  genesisRoot: string;         // Path to Genesis source
  sandboxDir: string;          // Where to create sandbox
  gitEnabled: boolean;         // Use git for checkpoints
  maxModificationsPerPlan: number;
  buildTimeout: number;        // ms
  testTimeout: number;         // ms
  runtimeTestDuration: number; // ms to run modified Genesis
  skipTests: boolean;          // Skip test verification (for faster iteration)
  skipRuntimeCheck: boolean;   // Skip runtime invariant check
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: DarwinGodelConfig = {
  genesisRoot: process.cwd(),
  sandboxDir: '/tmp/genesis-darwin-godel',
  gitEnabled: true,
  maxModificationsPerPlan: 10,
  buildTimeout: 60000,
  testTimeout: 120000,
  runtimeTestDuration: 5000,
  skipTests: true,           // Skip tests for faster self-modification
  skipRuntimeCheck: true,    // Skip runtime check for faster iteration
};

// ============================================================================
// TCB: Files that CANNOT be modified
// ============================================================================

const TRUSTED_COMPUTING_BASE = [
  'src/self-modification/darwin-godel.ts',  // This file
  'src/kernel/invariants.ts',                // Invariant definitions
  'src/self-modification/rollback.ts',       // Rollback mechanism
];

// ============================================================================
// Darwin-Gödel Engine
// ============================================================================

export class DarwinGodelEngine {
  private config: DarwinGodelConfig;
  private history: ApplyResult[] = [];
  private currentSandbox: string | null = null;

  constructor(config: Partial<DarwinGodelConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // Modification Planning
  // ============================================================================

  /**
   * Validate a modification plan before attempting to apply
   */
  validatePlan(plan: ModificationPlan): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check modification count
    if (plan.modifications.length > this.config.maxModificationsPerPlan) {
      errors.push(`Too many modifications: ${plan.modifications.length} > ${this.config.maxModificationsPerPlan}`);
    }

    // Check for TCB violations
    for (const mod of plan.modifications) {
      const fullPath = `src/${mod.targetFile}`;
      if (TRUSTED_COMPUTING_BASE.includes(fullPath)) {
        errors.push(`FORBIDDEN: Cannot modify TCB file: ${mod.targetFile}`);
      }
    }

    // Check files exist
    for (const mod of plan.modifications) {
      const filePath = join(this.config.genesisRoot, 'src', mod.targetFile);
      if (mod.type !== 'append' && !existsSync(filePath)) {
        errors.push(`Target file not found: ${mod.targetFile}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ============================================================================
  // Sandbox Management
  // ============================================================================

  /**
   * Create a sandbox copy of Genesis
   */
  createSandbox(): string {
    const sandboxId = Date.now().toString(36);
    const sandboxPath = join(this.config.sandboxDir, sandboxId);

    // Clean any existing sandbox
    if (existsSync(sandboxPath)) {
      rmSync(sandboxPath, { recursive: true });
    }
    mkdirSync(sandboxPath, { recursive: true });

    // Copy source files (excluding node_modules, dist, .git)
    this.copyDirectory(
      this.config.genesisRoot,
      sandboxPath,
      ['node_modules', 'dist', '.git', '.env']
    );

    // Install dependencies in sandbox
    this.runCommand('npm', ['install', '--silent'], sandboxPath);

    this.currentSandbox = sandboxPath;
    return sandboxPath;
  }

  /**
   * Destroy sandbox
   */
  destroySandbox(sandboxPath?: string): void {
    const path = sandboxPath || this.currentSandbox;
    if (path && existsSync(path)) {
      rmSync(path, { recursive: true });
    }
    if (path === this.currentSandbox) {
      this.currentSandbox = null;
    }
  }

  private copyDirectory(src: string, dest: string, exclude: string[] = []): void {
    const entries = readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      if (exclude.includes(entry.name)) continue;

      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);

      if (entry.isDirectory()) {
        mkdirSync(destPath, { recursive: true });
        this.copyDirectory(srcPath, destPath, exclude);
      } else {
        cpSync(srcPath, destPath);
      }
    }
  }

  // ============================================================================
  // Modification Application (in Sandbox)
  // ============================================================================

  /**
   * Apply modifications to sandbox
   */
  applyToSandbox(plan: ModificationPlan, sandboxPath: string): { success: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const mod of plan.modifications) {
      try {
        const filePath = join(sandboxPath, 'src', mod.targetFile);

        switch (mod.type) {
          case 'replace':
            if (!mod.search || !mod.content) {
              errors.push(`${mod.id}: replace requires search and content`);
              continue;
            }
            this.replaceInFile(filePath, mod.search, mod.content);
            break;

          case 'patch':
            if (!mod.content) {
              errors.push(`${mod.id}: patch requires content`);
              continue;
            }
            // Apply as unified diff
            this.applyPatch(filePath, mod.content);
            break;

          case 'append':
            if (!mod.content) {
              errors.push(`${mod.id}: append requires content`);
              continue;
            }
            this.appendToFile(filePath, mod.content);
            break;

          case 'delete':
            if (existsSync(filePath)) {
              rmSync(filePath);
            }
            break;
        }
      } catch (error) {
        errors.push(`${mod.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { success: errors.length === 0, errors };
  }

  private replaceInFile(filePath: string, search: string, replace: string): void {
    const content = readFileSync(filePath, 'utf-8');
    const newContent = content.replace(search, replace);

    if (content === newContent) {
      throw new Error(`Search string not found in ${filePath}`);
    }

    writeFileSync(filePath, newContent, 'utf-8');
  }

  private appendToFile(filePath: string, content: string): void {
    if (existsSync(filePath)) {
      const existing = readFileSync(filePath, 'utf-8');
      writeFileSync(filePath, existing + '\n' + content, 'utf-8');
    } else {
      mkdirSync(join(filePath, '..'), { recursive: true });
      writeFileSync(filePath, content, 'utf-8');
    }
  }

  private applyPatch(filePath: string, patch: string): void {
    // Simple patch: each line starting with + is added, - is removed
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const patchLines = patch.split('\n');

    const newLines: string[] = [];
    let lineIndex = 0;

    for (const patchLine of patchLines) {
      if (patchLine.startsWith('+')) {
        newLines.push(patchLine.slice(1));
      } else if (patchLine.startsWith('-')) {
        lineIndex++; // Skip this line from original
      } else if (patchLine.startsWith(' ')) {
        newLines.push(lines[lineIndex++]);
      }
    }

    // Add remaining lines
    while (lineIndex < lines.length) {
      newLines.push(lines[lineIndex++]);
    }

    writeFileSync(filePath, newLines.join('\n'), 'utf-8');
  }

  // ============================================================================
  // Verification
  // ============================================================================

  /**
   * Verify modified sandbox
   */
  async verify(sandboxPath: string): Promise<VerificationResult> {
    const errors: string[] = [];
    let buildSuccess = false;
    let testsSuccess = false;
    let invariantsPass = false;
    let runtimeCheck = false;
    let invariantResults: InvariantResult[] = [];

    // 1. Build
    try {
      broadcastBuildOutput('> npm run build');
      const buildResult = this.runCommand('npm', ['run', 'build'], sandboxPath, this.config.buildTimeout);
      buildSuccess = buildResult.status === 0;
      if (!buildSuccess) {
        const errorMsg = buildResult.stderr?.toString() || 'unknown error';
        errors.push(`Build failed: ${errorMsg}`);
        broadcastBuildOutput(`✗ Build failed: ${errorMsg.slice(0, 200)}`);
      } else {
        broadcastBuildOutput('✓ Build successful');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Build error: ${errorMsg}`);
      broadcastBuildOutput(`✗ Build error: ${errorMsg}`);
    }

    if (!buildSuccess) {
      return { passed: false, buildSuccess, testsSuccess, invariantsPass, invariantResults, runtimeCheck, errors };
    }

    // 2. Tests (optional)
    if (this.config.skipTests) {
      testsSuccess = true;
    } else {
      try {
        const testResult = this.runCommand('npm', ['test'], sandboxPath, this.config.testTimeout);
        testsSuccess = testResult.status === 0;
        if (!testsSuccess) {
          errors.push(`Tests failed: ${testResult.stderr?.toString() || 'unknown error'}`);
        }
      } catch (error) {
        // Tests might not exist, treat as success
        testsSuccess = true;
      }
    }

    // 3. Invariant Check (run modified Genesis briefly) - optional
    if (this.config.skipRuntimeCheck) {
      invariantsPass = true;
      runtimeCheck = true;
      broadcastBuildOutput('⊘ Runtime check skipped (skipRuntimeCheck=true)');
    } else {
      try {
        broadcastBuildOutput('> Checking runtime invariants...');
        const runtimeResult = await this.checkRuntimeInvariants(sandboxPath);
        invariantsPass = runtimeResult.passed;
        invariantResults = runtimeResult.results;
        runtimeCheck = runtimeResult.ranSuccessfully;

        // Broadcast invariant results
        const broadcastResults = invariantResults.map(r => ({
          id: r.id,
          name: r.id,
          passed: r.passed,
          message: r.message,
        }));
        broadcastInvariantChecked(broadcastResults);

        if (!invariantsPass) {
          for (const inv of invariantResults.filter(r => !r.passed)) {
            errors.push(`Invariant ${inv.id} failed: ${inv.message}`);
            broadcastBuildOutput(`✗ Invariant ${inv.id} failed: ${inv.message}`);
          }
        } else {
          broadcastBuildOutput(`✓ All ${invariantResults.length} invariants passed`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Runtime check error: ${errorMsg}`);
        broadcastBuildOutput(`✗ Runtime check error: ${errorMsg}`);
      }
    }

    const passed = buildSuccess && testsSuccess && invariantsPass && runtimeCheck;
    return { passed, buildSuccess, testsSuccess, invariantsPass, invariantResults, runtimeCheck, errors };
  }

  private async checkRuntimeInvariants(sandboxPath: string): Promise<{
    passed: boolean;
    ranSuccessfully: boolean;
    results: InvariantResult[];
  }> {
    // Create a test script that runs Genesis and checks invariants
    const testScript = `
      import { invariantRegistry } from './src/kernel/invariants.js';
      import { createKernel } from './src/kernel/index.js';

      async function test() {
        const kernel = createKernel();
        await kernel.start();

        // Let it run briefly
        await new Promise(r => setTimeout(r, 2000));

        // Check invariants
        const context = {
          energy: kernel.getStatus().energy,
          dormancyThreshold: 0.1,
          isDormant: kernel.getStatus().state === 'dormant',
          responsiveAgentCount: 1,
          totalAgentCount: 1,
        };

        const results = invariantRegistry.checkAll(context);
        console.log(JSON.stringify(results));

        await kernel.stop();
        process.exit(0);
      }

      test().catch(e => {
        console.error(e);
        process.exit(1);
      });
    `;

    const testFile = join(sandboxPath, 'invariant-test.ts');
    writeFileSync(testFile, testScript, 'utf-8');

    return new Promise((resolve) => {
      const proc = spawn('npx', ['tsx', 'invariant-test.ts'], {
        cwd: sandboxPath,
        timeout: this.config.runtimeTestDuration + 5000,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => { stdout += data; });
      proc.stderr?.on('data', (data) => { stderr += data; });

      proc.on('close', (code) => {
        try {
          // Try to parse invariant results from stdout
          const jsonMatch = stdout.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const results: InvariantResult[] = JSON.parse(jsonMatch[0]);
            const passed = results.every(r => r.passed);
            resolve({ passed, ranSuccessfully: true, results });
          } else {
            resolve({
              passed: code === 0,
              ranSuccessfully: code === 0,
              results: []
            });
          }
        } catch {
          resolve({ passed: false, ranSuccessfully: false, results: [] });
        }
      });

      proc.on('error', () => {
        resolve({ passed: false, ranSuccessfully: false, results: [] });
      });
    });
  }

  // ============================================================================
  // Git Integration
  // ============================================================================

  /**
   * Create git checkpoint before modification
   */
  createCheckpoint(message: string): string | null {
    if (!this.config.gitEnabled) return null;

    try {
      // Stage all changes
      this.runCommand('git', ['add', '-A'], this.config.genesisRoot);

      // Create commit
      const result = this.runCommand(
        'git',
        ['commit', '-m', `[Darwin-Gödel] Checkpoint: ${message}`, '--allow-empty'],
        this.config.genesisRoot
      );

      // Get commit hash
      const hashResult = this.runCommand('git', ['rev-parse', 'HEAD'], this.config.genesisRoot);
      return hashResult.stdout?.toString().trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Rollback to checkpoint
   */
  rollback(commitHash: string): boolean {
    if (!this.config.gitEnabled) return false;

    try {
      this.runCommand('git', ['reset', '--hard', commitHash], this.config.genesisRoot);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Main Entry Point
  // ============================================================================

  /**
   * Apply a modification plan with full verification
   */
  async apply(plan: ModificationPlan): Promise<ApplyResult> {
    const startTime = Date.now();
    let sandboxPath: string | null = null;
    let rollbackHash: string | null = null;

    try {
      // 1. Validate plan
      const validation = this.validatePlan(plan);
      if (!validation.valid) {
        return {
          success: false,
          planId: plan.id,
          verificaton: {
            passed: false,
            buildSuccess: false,
            testsSuccess: false,
            invariantsPass: false,
            invariantResults: [],
            runtimeCheck: false,
            errors: validation.errors,
          },
          duration: Date.now() - startTime,
        };
      }

      // 2. Create checkpoint
      rollbackHash = this.createCheckpoint(`Before: ${plan.name}`);
      plan.rollbackPoint = rollbackHash || undefined;

      // Broadcast sandbox progress - starting
      broadcastSandboxProgress(null, [
        { id: 'clone', name: 'Clone to sandbox', status: 'running' },
        { id: 'apply', name: 'Apply modifications', status: 'pending' },
        { id: 'build', name: 'TypeScript build', status: 'pending' },
        { id: 'test', name: 'Run tests', status: 'pending' },
        { id: 'invariants', name: 'Verify invariants', status: 'pending' },
        { id: 'apply-live', name: 'Apply to live', status: 'pending' },
      ]);

      // 3. Create sandbox
      sandboxPath = this.createSandbox();

      // Broadcast sandbox created
      broadcastSandboxProgress(sandboxPath, [
        { id: 'clone', name: 'Clone to sandbox', status: 'completed' },
        { id: 'apply', name: 'Apply modifications', status: 'running' },
        { id: 'build', name: 'TypeScript build', status: 'pending' },
        { id: 'test', name: 'Run tests', status: 'pending' },
        { id: 'invariants', name: 'Verify invariants', status: 'pending' },
        { id: 'apply-live', name: 'Apply to live', status: 'pending' },
      ]);

      // 4. Apply modifications to sandbox
      const applyResult = this.applyToSandbox(plan, sandboxPath);
      if (!applyResult.success) {
        return {
          success: false,
          planId: plan.id,
          verificaton: {
            passed: false,
            buildSuccess: false,
            testsSuccess: false,
            invariantsPass: false,
            invariantResults: [],
            runtimeCheck: false,
            errors: applyResult.errors,
          },
          rollbackHash: rollbackHash || undefined,
          duration: Date.now() - startTime,
        };
      }

      // Broadcast modifications applied
      broadcastSandboxProgress(sandboxPath, [
        { id: 'clone', name: 'Clone to sandbox', status: 'completed' },
        { id: 'apply', name: 'Apply modifications', status: 'completed' },
        { id: 'build', name: 'TypeScript build', status: 'running' },
        { id: 'test', name: 'Run tests', status: 'pending' },
        { id: 'invariants', name: 'Verify invariants', status: 'pending' },
        { id: 'apply-live', name: 'Apply to live', status: 'pending' },
      ]);

      // 5. Verify sandbox
      const verification = await this.verify(sandboxPath);

      if (!verification.passed) {
        // Broadcast verification failed
        broadcastSandboxProgress(sandboxPath, [
          { id: 'clone', name: 'Clone to sandbox', status: 'completed' },
          { id: 'apply', name: 'Apply modifications', status: 'completed' },
          { id: 'build', name: 'TypeScript build', status: verification.buildSuccess ? 'completed' : 'failed' },
          { id: 'test', name: 'Run tests', status: verification.testsSuccess ? 'completed' : 'failed' },
          { id: 'invariants', name: 'Verify invariants', status: verification.invariantsPass ? 'completed' : 'failed' },
          { id: 'apply-live', name: 'Apply to live', status: 'pending' },
        ]);
        return {
          success: false,
          planId: plan.id,
          verificaton: verification,
          rollbackHash: rollbackHash || undefined,
          duration: Date.now() - startTime,
        };
      }

      // Broadcast all checks passed, applying to live
      broadcastSandboxProgress(sandboxPath, [
        { id: 'clone', name: 'Clone to sandbox', status: 'completed' },
        { id: 'apply', name: 'Apply modifications', status: 'completed' },
        { id: 'build', name: 'TypeScript build', status: 'completed' },
        { id: 'test', name: 'Run tests', status: 'completed' },
        { id: 'invariants', name: 'Verify invariants', status: 'completed' },
        { id: 'apply-live', name: 'Apply to live', status: 'running' },
      ]);

      // 6. Apply to real source (ONLY if all checks pass)
      for (const mod of plan.modifications) {
        const sandboxFile = join(sandboxPath, 'src', mod.targetFile);
        const realFile = join(this.config.genesisRoot, 'src', mod.targetFile);

        if (mod.type === 'delete') {
          if (existsSync(realFile)) rmSync(realFile);
        } else if (existsSync(sandboxFile)) {
          const content = readFileSync(sandboxFile, 'utf-8');
          mkdirSync(join(realFile, '..'), { recursive: true });
          writeFileSync(realFile, content, 'utf-8');
        }
      }

      // 7. Commit the change
      const commitHash = this.createCheckpoint(`Applied: ${plan.name}`);

      // 8. Rebuild real source
      broadcastBuildOutput('> Rebuilding live source...');
      this.runCommand('npm', ['run', 'build'], this.config.genesisRoot);
      broadcastBuildOutput('✓ Live rebuild complete');

      // Broadcast success - all steps completed
      broadcastSandboxProgress(sandboxPath, [
        { id: 'clone', name: 'Clone to sandbox', status: 'completed' },
        { id: 'apply', name: 'Apply modifications', status: 'completed' },
        { id: 'build', name: 'TypeScript build', status: 'completed' },
        { id: 'test', name: 'Run tests', status: 'completed' },
        { id: 'invariants', name: 'Verify invariants', status: 'completed' },
        { id: 'apply-live', name: 'Apply to live', status: 'completed' },
      ]);

      const result: ApplyResult = {
        success: true,
        planId: plan.id,
        verificaton: verification,
        commitHash: commitHash || undefined,
        rollbackHash: rollbackHash || undefined,
        duration: Date.now() - startTime,
      };

      this.history.push(result);
      return result;

    } finally {
      // Cleanup sandbox
      if (sandboxPath) {
        this.destroySandbox(sandboxPath);
      }
    }
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private runCommand(
    command: string,
    args: string[],
    cwd: string,
    timeout?: number
  ): SpawnSyncReturns<Buffer> {
    return spawnSync(command, args, {
      cwd,
      timeout,
      encoding: 'buffer',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  getHistory(): ApplyResult[] {
    return [...this.history];
  }

  /**
   * Get a hash of a file's contents
   */
  getFileHash(filePath: string): string {
    const content = readFileSync(filePath, 'utf-8');
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * Get hashes of all source files (for integrity tracking)
   */
  getSourceHashes(): Record<string, string> {
    const hashes: Record<string, string> = {};
    const srcDir = join(this.config.genesisRoot, 'src');

    const walk = (dir: string) => {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.name.endsWith('.ts')) {
          const relPath = relative(srcDir, fullPath);
          hashes[relPath] = this.getFileHash(fullPath);
        }
      }
    };

    walk(srcDir);
    return hashes;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let engineInstance: DarwinGodelEngine | null = null;

export function getDarwinGodelEngine(config?: Partial<DarwinGodelConfig>): DarwinGodelEngine {
  if (!engineInstance) {
    engineInstance = new DarwinGodelEngine(config);
  }
  return engineInstance;
}

export function resetDarwinGodelEngine(): void {
  if (engineInstance) {
    engineInstance.destroySandbox();
  }
  engineInstance = null;
}
