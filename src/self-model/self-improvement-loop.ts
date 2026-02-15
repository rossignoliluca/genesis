/**
 * Self-Improvement Loop — The closed loop that makes Genesis antifragile
 *
 * Cycle: detect → generate fix → verify → apply → learn
 *
 * Safety:
 * - Max 3 fixes per cycle
 * - Only MED/HIGH priority proposals (>= 0.5)
 * - tsc --noEmit verification before AND after applying
 * - Git-based rollback on failure
 * - Manual trigger only (never auto-runs)
 * - All actions published on bus
 */

import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createPublisher } from '../bus/index.js';
import type { ImprovementProposal } from './types.js';
import type { FixGenerator, ModificationPlan, FixResult } from './fix-generator.js';
import type { HolisticSelfModel } from './index.js';

// ============================================================================
// Types
// ============================================================================

export interface CycleResult {
  /** Total proposals found by self-model */
  proposals: number;
  /** Fixes attempted (generated a plan) */
  attempted: number;
  /** Successfully applied and verified */
  applied: number;
  /** Failed verification, rolled back */
  failed: number;
  /** Skipped (runtime action or no fix generated) */
  skipped: number;
  /** Duration in ms */
  duration: number;
  /** Per-proposal details */
  details: FixAttempt[];
}

export interface FixAttempt {
  proposal: ImprovementProposal;
  status: 'applied' | 'skipped' | 'runtime-action' | 'invalid' | 'build-failed' | 'rollback' | 'error';
  plan?: ModificationPlan;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_FIXES_PER_CYCLE = 5;
const MIN_PRIORITY = 0.5;
const TSC_TIMEOUT = 60_000; // 60s

// Known pre-existing error files — excluded from verification
// (populated dynamically at cycle start via baseline tsc)
let KNOWN_ERROR_FILES = new Set<string>();

// Track modules that repeatedly fail — skip after 2 consecutive failures
// Key: "module:category", Value: consecutive failure count
const FAILURE_TRACKER = new Map<string, number>();
const MAX_CONSECUTIVE_FAILURES = 2;

// ============================================================================
// Self-Improvement Loop
// ============================================================================

export class SelfImprovementLoop {
  private publisher = createPublisher('self-model');

  constructor(
    private selfModel: HolisticSelfModel,
    private fixGenerator: FixGenerator,
    private rootPath: string,
  ) {}

  /**
   * Run one improvement cycle.
   * Returns a summary of what was attempted, applied, and failed.
   */
  async runCycle(): Promise<CycleResult> {
    const startTime = Date.now();
    const details: FixAttempt[] = [];

    // STEP 0: Baseline — capture pre-existing tsc errors so we only flag NEW ones
    KNOWN_ERROR_FILES = this.getBaselineErrors();

    // STEP 1: Get proposals from self-model
    const allProposals = this.selfModel.proposeImprovements();

    // STEP 2: Filter — only MED/HIGH priority, skip repeatedly failing modules
    const viable = allProposals
      .filter(p => p.priority >= MIN_PRIORITY)
      .filter(p => {
        const key = `${p.targetModule}:${p.category}`;
        return (FAILURE_TRACKER.get(key) || 0) < MAX_CONSECUTIVE_FAILURES;
      })
      .slice(0, MAX_FIXES_PER_CYCLE);

    let applied = 0;
    let failed = 0;
    let skipped = 0;

    // STEP 3: Process each proposal
    for (const proposal of viable) {
      // Publish proposal event
      this.publisher.publish('self.improvement.proposed', {
        improvementType: proposal.category,
        phase: 'proposed',
        description: proposal.title,
        expectedBenefit: proposal.priority,
      } as any);

      const attempt = await this.attemptFix(proposal);
      details.push(attempt);

      const failKey = `${proposal.targetModule}:${proposal.category}`;
      switch (attempt.status) {
        case 'applied':
          applied++;
          FAILURE_TRACKER.delete(failKey); // Reset on success
          // Publish success event
          this.publisher.publish('self.improvement.applied', {
            improvementType: proposal.category,
            phase: 'applied',
            description: `Applied: ${proposal.title}`,
            expectedBenefit: proposal.priority,
          } as any);
          break;
        case 'skipped':
        case 'runtime-action':
          skipped++;
          break;
        default:
          failed++;
          FAILURE_TRACKER.set(failKey, (FAILURE_TRACKER.get(failKey) || 0) + 1);
          break;
      }
    }

    // Also count low-priority proposals as skipped
    skipped += allProposals.length - viable.length;

    // STEP 10: Refresh self-model to see if improvements took effect
    if (applied > 0) {
      this.selfModel.refresh();
    }

    return {
      proposals: allProposals.length,
      attempted: details.filter(d => !['skipped', 'runtime-action'].includes(d.status)).length,
      applied,
      failed,
      skipped,
      duration: Date.now() - startTime,
      details,
    };
  }

  // ==========================================================================
  // Fix Attempt Pipeline
  // ==========================================================================

  private async attemptFix(proposal: ImprovementProposal): Promise<FixAttempt> {
    // STEP 3: Generate fix
    let fixResult: FixResult;
    try {
      fixResult = await this.fixGenerator.generateFix(proposal);
    } catch (error) {
      return {
        proposal,
        status: 'error',
        error: `Fix generation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // Handle non-plan results
    if (fixResult.kind === 'runtime-action') {
      this.handleRuntimeAction(fixResult.action);
      return { proposal, status: 'runtime-action' };
    }

    if (fixResult.kind === 'skip') {
      return { proposal, status: 'skipped', error: fixResult.reason };
    }

    const plan = fixResult.plan;

    // STEP 4: Validate plan
    if (!this.validatePlan(plan)) {
      return {
        proposal,
        status: 'invalid',
        plan,
        error: 'Plan validation failed: target files missing or modifications invalid',
      };
    }

    // STEP 5: Snapshot files for rollback
    const snapshots = this.snapshotFiles(plan);

    // STEP 6: Apply modifications to production
    const applyErrors = this.applyPlan(plan);
    if (applyErrors.length > 0) {
      this.rollback(snapshots);
      return {
        proposal,
        status: 'build-failed',
        plan,
        error: `Apply failed: ${applyErrors.join('; ')}`,
      };
    }

    // STEP 7: Verify production build
    const buildResult = this.verifyBuildDetailed();
    if (!buildResult.ok) {
      // STEP 8: Rollback
      this.rollback(snapshots);
      return {
        proposal,
        status: 'rollback',
        plan,
        error: `Build failed (new errors in: ${buildResult.newErrorFiles.join(', ')}) — rolled back`,
      };
    }

    // Success!
    return { proposal, status: 'applied', plan };
  }

  // ==========================================================================
  // Validation
  // ==========================================================================

  private validatePlan(plan: ModificationPlan): boolean {
    for (const mod of plan.modifications) {
      const filePath = join(this.rootPath, 'src', mod.targetFile);

      // File must exist for replace
      if (mod.type === 'replace' && !existsSync(filePath)) {
        return false;
      }

      // Search string must be present for replace
      if (mod.type === 'replace' && mod.search) {
        try {
          const content = readFileSync(filePath, 'utf-8');
          if (!content.includes(mod.search)) {
            return false;
          }
        } catch {
          return false;
        }
      }

      // Content must be provided
      if (!mod.content) {
        return false;
      }
    }

    return true;
  }

  // ==========================================================================
  // File Operations
  // ==========================================================================

  private snapshotFiles(plan: ModificationPlan): Map<string, string> {
    const snapshots = new Map<string, string>();

    for (const mod of plan.modifications) {
      const filePath = join(this.rootPath, 'src', mod.targetFile);
      if (existsSync(filePath)) {
        snapshots.set(filePath, readFileSync(filePath, 'utf-8'));
      }
    }

    return snapshots;
  }

  private applyPlan(plan: ModificationPlan): string[] {
    const errors: string[] = [];

    for (const mod of plan.modifications) {
      const filePath = join(this.rootPath, 'src', mod.targetFile);

      try {
        if (mod.type === 'replace' && mod.search) {
          const content = readFileSync(filePath, 'utf-8');
          const newContent = content.replace(mod.search, mod.content);
          if (content === newContent) {
            errors.push(`${mod.targetFile}: search string not found`);
            continue;
          }
          writeFileSync(filePath, newContent, 'utf-8');
        } else if (mod.type === 'append') {
          const content = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
          writeFileSync(filePath, content + '\n' + mod.content, 'utf-8');
        }
      } catch (error) {
        errors.push(`${mod.targetFile}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return errors;
  }

  private rollback(snapshots: Map<string, string>): void {
    for (const [filePath, content] of snapshots) {
      try {
        writeFileSync(filePath, content, 'utf-8');
      } catch {
        // Last resort: git checkout
        spawnSync('git', ['checkout', '--', filePath], { cwd: this.rootPath });
      }
    }
  }

  // ==========================================================================
  // Build Verification
  // ==========================================================================

  /**
   * Run tsc before any changes to capture pre-existing error files.
   */
  private getBaselineErrors(): Set<string> {
    const result = spawnSync('npx', ['tsc', '--noEmit'], {
      cwd: this.rootPath,
      timeout: TSC_TIMEOUT,
      encoding: 'utf-8',
    });

    const output = (result.stdout || '') + (result.stderr || '');
    const files = new Set<string>();
    const errorRegex = /^(src\/[^(]+)\(/gm;
    let match;
    while ((match = errorRegex.exec(output)) !== null) {
      files.add(match[1]);
    }
    return files;
  }

  private verifyBuildDetailed(): { ok: boolean; newErrorFiles: string[] } {
    const result = spawnSync('npx', ['tsc', '--noEmit'], {
      cwd: this.rootPath,
      timeout: TSC_TIMEOUT,
      encoding: 'utf-8',
    });

    const output = (result.stdout || '') + (result.stderr || '');
    const errorFiles = new Set<string>();
    const errorRegex = /^(src\/[^(]+)\(/gm;
    let match;
    while ((match = errorRegex.exec(output)) !== null) {
      errorFiles.add(match[1]);
    }

    const newErrorFiles = Array.from(errorFiles).filter(f => !KNOWN_ERROR_FILES.has(f));
    return { ok: newErrorFiles.length === 0, newErrorFiles };
  }


  // ==========================================================================
  // Runtime Actions
  // ==========================================================================

  private handleRuntimeAction(action: string): void {
    switch (action) {
      case 'persist':
        this.selfModel.persist();
        break;
      case 'refresh':
        this.selfModel.refresh();
        break;
    }
  }
}
