/**
 * Genesis v14.7 — PR Submission Pipeline
 *
 * Autonomous workflow to complete bounties:
 * 1. Fork repository
 * 2. Create branch
 * 3. Generate/apply code changes
 * 4. Submit PR with formatted description
 * 5. Monitor for review feedback
 *
 * Uses GitHub MCP for all git operations.
 */

import { getMCPClient } from '../../mcp/index.js';
import type { Bounty } from '../generators/bounty-hunter.js';

// ============================================================================
// Types
// ============================================================================

export interface PRSubmission {
  bountyId: string;
  prUrl: string;
  prNumber: number;
  repo: string;
  branch: string;
  status: 'submitted' | 'reviewing' | 'changes_requested' | 'merged' | 'closed';
  submittedAt: Date;
  lastChecked?: Date;
  feedback?: string[];
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
}

// ============================================================================
// PR Pipeline
// ============================================================================

export class PRPipeline {
  private mcp = getMCPClient();
  private config: PRPipelineConfig;
  private submissions: Map<string, PRSubmission> = new Map();

  constructor(config: PRPipelineConfig) {
    this.config = {
      prTitlePrefix: config.prTitlePrefix ?? '[Genesis]',
      autoPush: config.autoPush ?? true,
      dryRun: config.dryRun ?? false,
      ...config,
    };
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

    try {
      // Step 1: Fork the repository
      console.log('[PRPipeline] Step 1: Forking repository...');
      const forkResult = await this.forkRepository(owner, repo);
      if (!forkResult.success) {
        console.error('[PRPipeline] Fork failed:', forkResult.error);
        return null;
      }

      // Step 2: Create branch
      console.log(`[PRPipeline] Step 2: Creating branch ${branchName}...`);
      const branchResult = await this.createBranch(
        this.config.githubUsername,
        repo,
        branchName,
      );
      if (!branchResult.success) {
        console.error('[PRPipeline] Branch creation failed:', branchResult.error);
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
          console.error(`[PRPipeline] Failed to apply change to ${change.path}:`, changeResult.error);
          return null;
        }
      }

      // Step 4: Create PR
      console.log('[PRPipeline] Step 4: Creating pull request...');
      const prTitle = this.generatePRTitle(bounty);
      const prBody = this.generatePRBody(bounty, description);

      const prResult = await this.createPullRequest(
        owner,
        repo,
        prTitle,
        prBody,
        `${this.config.githubUsername}:${branchName}`,
        'main', // Base branch - could make configurable
      );

      if (!prResult.success || !prResult.data) {
        console.error('[PRPipeline] PR creation failed:', prResult.error);
        return null;
      }

      // Record submission
      const submission: PRSubmission = {
        bountyId: bounty.id,
        prUrl: prResult.data.url,
        prNumber: prResult.data.number,
        repo: `${owner}/${repo}`,
        branch: branchName,
        status: 'submitted',
        submittedAt: new Date(),
      };

      this.submissions.set(bounty.id, submission);

      console.log(`[PRPipeline] ✅ PR submitted: ${submission.prUrl}`);
      return submission;

    } catch (error) {
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
      message: `[Genesis] ${change.operation}: ${change.path}`,
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
    if (pr.merged) {
      submission.status = 'merged';
    } else if (pr.state === 'closed') {
      submission.status = 'closed';
    } else if (pr.review_comments > 0 || pr.requested_changes) {
      submission.status = 'changes_requested';
    } else {
      submission.status = 'reviewing';
    }

    submission.lastChecked = new Date();

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
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 40);
    const timestamp = Date.now().toString(36);
    return `genesis/${slug}-${timestamp}`;
  }

  private generatePRTitle(bounty: Bounty): string {
    return `${this.config.prTitlePrefix} ${bounty.title}`;
  }

  private generatePRBody(bounty: Bounty, description: string): string {
    const meta = bounty.sourceMetadata;
    const issueRef = meta?.issueNumber ? `\n\nCloses #${meta.issueNumber}` : '';

    return `## Summary

${description}

## Related Issue

${bounty.submissionUrl || 'N/A'}${issueRef}

## Changes

This PR was generated autonomously by Genesis AI to complete a bounty.

---

🤖 *Generated by [Genesis AI](https://github.com/rossignoliluca/genesis) v14.7*
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

  getStats(): {
    total: number;
    submitted: number;
    reviewing: number;
    merged: number;
    closed: number;
  } {
    const all = this.getAllSubmissions();
    return {
      total: all.length,
      submitted: all.filter(s => s.status === 'submitted').length,
      reviewing: all.filter(s => s.status === 'reviewing').length,
      merged: all.filter(s => s.status === 'merged').length,
      closed: all.filter(s => s.status === 'closed').length,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

let pipelineInstance: PRPipeline | null = null;

export function getPRPipeline(config?: PRPipelineConfig): PRPipeline {
  if (!pipelineInstance && config) {
    pipelineInstance = new PRPipeline(config);
  }
  if (!pipelineInstance) {
    throw new Error('PRPipeline not initialized. Call with config first.');
  }
  return pipelineInstance;
}

export function createPRPipeline(config: PRPipelineConfig): PRPipeline {
  return new PRPipeline(config);
}
