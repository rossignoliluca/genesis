/**
 * Genesis v16.2 — PR Submission Pipeline
 *
 * Autonomous workflow to complete bounties:
 * 1. Fork repository
 * 2. Create branch
 * 3. Generate/apply code changes
 * 4. Submit PR with formatted description
 * 5. Monitor for review feedback
 * 6. Track revenue when merged
 *
 * Uses GitHub MCP for all git operations.
 * v16.2.1: Added persistence and monitoring
 */

import { getMCPClient } from '../../mcp/index.js';
import type { Bounty } from '../generators/bounty-hunter.js';
import { getRevenueTracker } from './revenue-tracker.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface PRSubmission {
  bountyId: string;
  bountyTitle: string;        // v16.2.1: For display
  bountyValue: number;        // v16.2.1: USD value
  prUrl: string;
  prNumber: number;
  repo: string;
  branch: string;
  status: 'submitted' | 'reviewing' | 'changes_requested' | 'merged' | 'closed';
  submittedAt: Date;
  mergedAt?: Date;            // v16.2.1: When merged
  lastChecked?: Date;
  feedback?: string[];
  revenueRecorded?: boolean;  // v16.2.1: Prevent double-counting
}

export interface CodeChange {
  path: string;
  content: string;
  operation: 'create' | 'update' | 'delete';
}

export interface PRPipelineConfig {
  githubUsername: string;
  prTitlePrefix?: string;
  autoPush?: boolean;
  dryRun?: boolean;
  persistPath?: string;       // v16.2.1: Where to save submissions
}

// ============================================================================
// PR Pipeline
// ============================================================================

export class PRPipeline {
  private mcp = getMCPClient();
  private config: PRPipelineConfig;
  private submissions: Map<string, PRSubmission> = new Map();
  private persistPath: string;
  private lastError: string = '';  // v16.2.2: Track last error for debugging

  constructor(config: PRPipelineConfig) {
    this.config = {
      prTitlePrefix: config.prTitlePrefix ?? '[AI Bot]',
      autoPush: config.autoPush ?? true,
      dryRun: config.dryRun ?? false,
      ...config,
    };
    this.persistPath = config.persistPath ?? '.genesis/pr-submissions.json';
    this.load(); // v16.2.1: Auto-load on construction
  }

  // ==========================================================================
  // v16.2.1: Persistence
  // ==========================================================================

  /**
   * Save submissions to disk
   */
  save(): void {
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = [...this.submissions.values()].map(s => ({
        ...s,
        submittedAt: s.submittedAt instanceof Date ? s.submittedAt.toISOString() : s.submittedAt,
        mergedAt: s.mergedAt instanceof Date ? s.mergedAt.toISOString() : s.mergedAt,
        lastChecked: s.lastChecked instanceof Date ? s.lastChecked.toISOString() : s.lastChecked,
      }));
      fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('[PRPipeline] Failed to save:', (e as Error).message);
    }
  }

  /**
   * Load submissions from disk
   */
  load(): void {
    try {
      if (fs.existsSync(this.persistPath)) {
        const data = JSON.parse(fs.readFileSync(this.persistPath, 'utf-8'));
        for (const item of data) {
          const sub: PRSubmission = {
            ...item,
            submittedAt: new Date(item.submittedAt),
            mergedAt: item.mergedAt ? new Date(item.mergedAt) : undefined,
            lastChecked: item.lastChecked ? new Date(item.lastChecked) : undefined,
          };
          this.submissions.set(sub.bountyId, sub);
        }
        console.log(`[PRPipeline] Loaded ${this.submissions.size} submissions`);
      }
    } catch (e) {
      console.error('[PRPipeline] Failed to load:', (e as Error).message);
    }
  }

  // ==========================================================================
  // Main Pipeline
  // ==========================================================================

  /**
   * Execute the full bounty completion pipeline
   */
  async submitBounty(
    bounty: Bounty,
    changes: CodeChange[],
    description: string,
    extra?: { confidence?: number; validationScore?: number; dailyCount?: number; maxDaily?: number },
  ): Promise<PRSubmission | null> {
    const meta = bounty.sourceMetadata;
    if (!meta?.org || !meta?.repo) {
      console.error('[PRPipeline] Bounty missing source metadata:', bounty.id);
      return null;
    }

    const owner = meta.org;
    const repo = meta.repo;
    const branchName = this.generateBranchName(bounty);

    console.log(`[PRPipeline] Starting submission for: ${bounty.title}`);
    console.log(`[PRPipeline] Target: ${owner}/${repo}`);
    this.lastError = '';  // v16.2.2: Clear last error

    try {
      // Step 1: Fork the repository
      console.log('[PRPipeline] Step 1: Forking repository...');
      const forkResult = await this.forkRepository(owner, repo);
      if (!forkResult.success) {
        this.lastError = forkResult.error || 'Fork failed';
        console.error('[PRPipeline] Fork failed:', forkResult.error);
        return null;
      }

      // v16.2.1: Wait and verify fork is ready (GitHub needs time to set up the fork)
      console.log('[PRPipeline] Waiting for fork to be ready...');
      let forkReady = false;
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const check = await this.mcp.call('github', 'get_file_contents', {
          owner: this.config.githubUsername,
          repo,
          path: '',
        });
        if (check.success) {
          forkReady = true;
          console.log(`[PRPipeline] Fork ready after ${(i + 1) * 2}s`);
          break;
        }
        console.log(`[PRPipeline] Fork not ready yet, waiting... (${i + 1}/10)`);
      }
      if (!forkReady) {
        this.lastError = 'Fork not ready after 20s';
        console.error('[PRPipeline] Fork not ready after 20s');
        return null;
      }

      // Step 2: Create branch with retry
      console.log(`[PRPipeline] Step 2: Creating branch ${branchName}...`);
      let branchResult: { success: boolean; error?: string } = { success: false };
      for (let attempt = 1; attempt <= 3; attempt++) {
        branchResult = await this.createBranch(
          this.config.githubUsername,
          repo,
          branchName,
        );
        if (branchResult.success) break;
        if (attempt < 3) {
          console.log(`[PRPipeline] Branch creation attempt ${attempt} failed, retrying in 2s...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      if (!branchResult.success) {
        this.lastError = branchResult.error || 'Branch creation failed';
        console.error('[PRPipeline] Branch creation failed after 3 attempts:', branchResult.error);
        return null;
      }

      // Step 3: Apply changes
      console.log(`[PRPipeline] Step 3: Applying ${changes.length} changes...`);
      for (const change of changes) {
        const changeResult = await this.applyChange(
          this.config.githubUsername,
          repo,
          branchName,
          change,
        );
        if (!changeResult.success) {
          this.lastError = changeResult.error || `Failed to apply change to ${change.path}`;
          console.error(`[PRPipeline] Failed to apply change to ${change.path}:`, changeResult.error);
          return null;
        }
      }

      // Step 4: Create PR
      console.log('[PRPipeline] Step 4: Creating pull request...');
      const prTitle = this.generatePRTitle(bounty);
      const prBody = this.generatePRBody(bounty, description, extra);

      const prResult = await this.createPullRequest(
        owner,
        repo,
        prTitle,
        prBody,
        `${this.config.githubUsername}:${branchName}`,
        'main', // Base branch - could make configurable
      );

      if (!prResult.success || !prResult.data) {
        this.lastError = prResult.error || 'Unknown PR creation error';
        console.error('[PRPipeline] PR creation failed:', prResult.error);
        return null;
      }

      // Record submission
      const submission: PRSubmission = {
        bountyId: bounty.id,
        bountyTitle: bounty.title,          // v16.2.1
        bountyValue: bounty.reward || 0,    // v16.2.1
        prUrl: prResult.data.url,
        prNumber: prResult.data.number,
        repo: `${owner}/${repo}`,
        branch: branchName,
        status: 'submitted',
        submittedAt: new Date(),
      };

      this.submissions.set(bounty.id, submission);
      this.save(); // v16.2.1: Persist immediately

      console.log(`[PRPipeline] ✅ PR submitted: ${submission.prUrl}`);
      console.log(`[PRPipeline] 💰 Potential revenue: $${submission.bountyValue}`);
      return submission;

    } catch (error) {
      this.lastError = String(error);
      console.error('[PRPipeline] Pipeline error:', error);
      return null;
    }
  }

  // ==========================================================================
  // GitHub Operations via MCP
  // ==========================================================================

  private async forkRepository(owner: string, repo: string): Promise<{ success: boolean; error?: string }> {
    if (this.config.dryRun) {
      console.log(`[PRPipeline] [DRY RUN] Would fork ${owner}/${repo}`);
      return { success: true };
    }

    const result = await this.mcp.call('github', 'fork_repository', {
      owner,
      repo,
    });

    if (!result.success) {
      // Fork might already exist, try to continue
      if (result.error?.includes('already exists')) {
        return { success: true };
      }
      return { success: false, error: result.error };
    }

    return { success: true };
  }

  private async createBranch(
    owner: string,
    repo: string,
    branchName: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (this.config.dryRun) {
      console.log(`[PRPipeline] [DRY RUN] Would create branch ${branchName}`);
      return { success: true };
    }

    // First get the default branch SHA
    const repoResult = await this.mcp.call('github', 'get_file_contents', {
      owner,
      repo,
      path: '',
    });

    // Create branch from main
    const result = await this.mcp.call('github', 'create_branch', {
      owner,
      repo,
      branch: branchName,
      from_branch: 'main',
    });

    if (!result.success) {
      // Branch might already exist
      if (result.error?.includes('already exists')) {
        return { success: true };
      }
      return { success: false, error: result.error };
    }

    return { success: true };
  }

  private async applyChange(
    owner: string,
    repo: string,
    branch: string,
    change: CodeChange,
  ): Promise<{ success: boolean; error?: string }> {
    if (this.config.dryRun) {
      console.log(`[PRPipeline] [DRY RUN] Would ${change.operation} ${change.path}`);
      return { success: true };
    }

    const result = await this.mcp.call('github', 'create_or_update_file', {
      owner,
      repo,
      path: change.path,
      content: change.content,
      message: `[AI-Generated] ${change.operation}: ${change.path}`,
      branch,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true };
  }

  private async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string,
  ): Promise<{ success: boolean; data?: { url: string; number: number }; error?: string }> {
    if (this.config.dryRun) {
      console.log(`[PRPipeline] [DRY RUN] Would create PR: ${title}`);
      return { success: true, data: { url: 'https://github.com/dry-run', number: 0 } };
    }

    const result = await this.mcp.call('github', 'create_pull_request', {
      owner,
      repo,
      title,
      body,
      head,
      base,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      data: {
        url: result.data?.html_url || result.data?.url,
        number: result.data?.number,
      },
    };
  }

  // ==========================================================================
  // PR Monitoring
  // ==========================================================================

  /**
   * Check status of submitted PRs
   */
  async checkPRStatus(bountyId: string): Promise<PRSubmission | null> {
    const submission = this.submissions.get(bountyId);
    if (!submission) return null;

    const [owner, repo] = submission.repo.split('/');

    const result = await this.mcp.call('github', 'get_pull_request', {
      owner,
      repo,
      pull_number: submission.prNumber,
    });

    if (!result.success) {
      console.warn(`[PRPipeline] Failed to check PR status:`, result.error);
      return submission;
    }

    const pr = result.data;

    // Update status based on PR state
    const previousStatus = submission.status;
    if (pr.merged) {
      submission.status = 'merged';
      if (!submission.mergedAt) {
        submission.mergedAt = pr.merged_at ? new Date(pr.merged_at) : new Date();
        console.log(`[PRPipeline] 🎉 PR MERGED! Revenue: $${submission.bountyValue}`);
      }
      // v16.2.3: Record revenue when PR is merged (once)
      if (!submission.revenueRecorded && submission.bountyValue > 0) {
        const tracker = getRevenueTracker();
        tracker.record({
          source: 'bounty',
          amount: submission.bountyValue,
          currency: 'USD',
          metadata: {
            bountyId: submission.bountyId,
            prUrl: submission.prUrl,
            repo: submission.repo,
            mergedAt: submission.mergedAt,
          },
        });
        submission.revenueRecorded = true;
        console.log(`[PRPipeline] Revenue recorded: $${submission.bountyValue} from ${submission.repo}`);
      }
    } else if (pr.state === 'closed') {
      submission.status = 'closed';
    } else if (pr.review_comments > 0 || pr.requested_changes) {
      submission.status = 'changes_requested';
    } else {
      submission.status = 'reviewing';
    }

    submission.lastChecked = new Date();

    // v16.2.1: Save if status changed
    if (previousStatus !== submission.status) {
      this.save();
    }

    // Get review comments
    const commentsResult = await this.mcp.call('github', 'get_pull_request_comments', {
      owner,
      repo,
      pull_number: submission.prNumber,
    });

    if (commentsResult.success && commentsResult.data) {
      submission.feedback = commentsResult.data.map((c: any) => c.body).slice(-5);
    }

    return submission;
  }

  /**
   * Check all submitted PRs
   */
  async checkAllPRs(): Promise<PRSubmission[]> {
    const updated: PRSubmission[] = [];

    for (const [bountyId] of this.submissions) {
      const result = await this.checkPRStatus(bountyId);
      if (result) {
        updated.push(result);
      }
    }

    return updated;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private generateBranchName(bounty: Bounty): string {
    const slug = bounty.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphen
      .replace(/-+/g, '-')          // v16.2.1: Collapse multiple hyphens
      .replace(/^-|-$/g, '')        // v16.2.1: Trim leading/trailing hyphens
      .slice(0, 40)
      .replace(/-$/, '');           // v16.2.1: Trim trailing hyphen after slice
    const timestamp = Date.now().toString(36);
    return `genesis/${slug}-${timestamp}`;
  }

  private generatePRTitle(bounty: Bounty): string {
    return `${this.config.prTitlePrefix} ${bounty.title}`;
  }

  private generatePRBody(
    bounty: Bounty,
    description: string,
    extra?: { confidence?: number; validationScore?: number; dailyCount?: number; maxDaily?: number },
  ): string {
    const meta = bounty.sourceMetadata;
    const issueRef = meta?.issueNumber ? `\nCloses #${meta.issueNumber}` : '';
    const confidence = extra?.confidence ?? 0;
    const validationScore = extra?.validationScore ?? 0;
    const dailyCount = extra?.dailyCount ?? 1;
    const maxDaily = extra?.maxDaily ?? 3;

    return `> **Automated AI Submission** — This PR was generated by [Genesis AI](https://github.com/rossignoliluca/genesis),
> an autonomous bounty agent. All code was AI-generated and has **NOT** been
> human-reviewed. Maintainers: please review carefully.

## Summary

${description}
${issueRef}

## Bounty Reference
- Platform: ${bounty.platform}
- Bounty: ${bounty.submissionUrl || 'N/A'}
- Reward: $${bounty.reward}

## Transparency
- Confidence score: ${confidence.toFixed(2)}/1.0
- Validation score: ${validationScore}/100
- Model used: AI code generation
- Submission #${dailyCount} of max ${maxDaily} today

---
Generated by Genesis AI v16.2 | [Source Code](https://github.com/rossignoliluca/genesis) | [How it works](https://github.com/rossignoliluca/genesis#readme)
`;
  }

  // ==========================================================================
  // State Access
  // ==========================================================================

  getSubmission(bountyId: string): PRSubmission | undefined {
    return this.submissions.get(bountyId);
  }

  getAllSubmissions(): PRSubmission[] {
    return [...this.submissions.values()];
  }

  // v16.2.2: Get last error for debugging
  getLastError(): string {
    return this.lastError;
  }

  getStats(): {
    total: number;
    submitted: number;
    reviewing: number;
    merged: number;
    closed: number;
    pendingRevenue: number;  // v16.2.1
    earnedRevenue: number;   // v16.2.1
  } {
    const all = this.getAllSubmissions();
    const pending = all.filter(s => s.status !== 'merged' && s.status !== 'closed');
    const earned = all.filter(s => s.status === 'merged');
    return {
      total: all.length,
      submitted: all.filter(s => s.status === 'submitted').length,
      reviewing: all.filter(s => s.status === 'reviewing').length,
      merged: earned.length,
      closed: all.filter(s => s.status === 'closed').length,
      pendingRevenue: pending.reduce((sum, s) => sum + (s.bountyValue || 0), 0),
      earnedRevenue: earned.reduce((sum, s) => sum + (s.bountyValue || 0), 0),
    };
  }

  // ==========================================================================
  // v16.2.1: Revenue Summary
  // ==========================================================================

  /**
   * Get formatted status report
   */
  getStatusReport(): string {
    const stats = this.getStats();
    const all = this.getAllSubmissions();

    let report = `
╔════════════════════════════════════════════════════════════╗
║  GENESIS BOUNTY STATUS                                     ║
╠════════════════════════════════════════════════════════════╣
║  PRs Submitted:  ${String(stats.total).padStart(3)}                                       ║
║  In Review:      ${String(stats.reviewing + stats.submitted).padStart(3)}                                       ║
║  Merged:         ${String(stats.merged).padStart(3)}   💰 $${stats.earnedRevenue.toFixed(2).padStart(8)}                  ║
║  Closed:         ${String(stats.closed).padStart(3)}                                       ║
║  ──────────────────────────────────────────────────────── ║
║  Pending Revenue: $${stats.pendingRevenue.toFixed(2).padStart(8)}                             ║
║  Earned Revenue:  $${stats.earnedRevenue.toFixed(2).padStart(8)}                             ║
╚════════════════════════════════════════════════════════════╝
`;

    if (all.length > 0) {
      report += '\nRecent Submissions:\n';
      for (const sub of all.slice(-5)) {
        const statusIcon = sub.status === 'merged' ? '✅' :
                           sub.status === 'closed' ? '❌' :
                           sub.status === 'changes_requested' ? '⚠️' : '⏳';
        report += `  ${statusIcon} $${sub.bountyValue || 0} - ${sub.bountyTitle?.substring(0, 40) || 'Unknown'}...\n`;
        report += `     ${sub.prUrl}\n`;
      }
    }

    return report;
  }
}

// ============================================================================
// Factory
// ============================================================================

let pipelineInstance: PRPipeline | null = null;

export function getPRPipeline(config?: PRPipelineConfig): PRPipeline {
  if (!pipelineInstance) {
    // v16.2.1: Auto-create with default config if not provided
    const defaultConfig: PRPipelineConfig = {
      githubUsername: process.env.GITHUB_USERNAME || 'genesis-ai',
      persistPath: '.genesis/pr-submissions.json',
      ...config,
    };
    pipelineInstance = new PRPipeline(defaultConfig);
  }
  return pipelineInstance;
}

export function createPRPipeline(config: PRPipelineConfig): PRPipeline {
  return new PRPipeline(config);
}

/**
 * v16.2.1: Get status report without needing full initialization
 */
export function getGenesisStatus(): string {
  const pipeline = getPRPipeline();
  return pipeline.getStatusReport();
}
