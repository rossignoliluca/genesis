/**
 * GitHub Executor - Real PR Submission
 *
 * The MISSING piece that actually submits code to GitHub.
 * Uses GitHub API to fork, branch, commit, and create PRs.
 *
 * This closes the bounty execution loop:
 * Bounty → Generate Code → THIS → Submit PR → Get Paid
 *
 * @module economy/live/github-executor
 * @version 19.1.0
 */

import { Octokit } from '@octokit/rest';

// ============================================================================
// Types
// ============================================================================

export interface GitHubConfig {
  token: string;
  username: string;
  email: string;
}

export interface PRSubmission {
  repoOwner: string;
  repoName: string;
  baseBranch: string;
  files: Array<{
    path: string;
    content: string;
  }>;
  title: string;
  body: string;
  labels?: string[];
}

export interface PRResult {
  success: boolean;
  prNumber?: number;
  prUrl?: string;
  error?: string;
  forkUrl?: string;
  branchName?: string;
}

// ============================================================================
// GitHub Executor
// ============================================================================

export class GitHubExecutor {
  private octokit: Octokit;
  private config: GitHubConfig;
  private isConfigured: boolean;

  constructor(config?: Partial<GitHubConfig>) {
    const token = config?.token || process.env.GITHUB_TOKEN;
    const username = config?.username || process.env.GITHUB_USERNAME;
    const email = config?.email || process.env.GITHUB_EMAIL;

    this.isConfigured = !!(token && username);
    this.config = {
      token: token || '',
      username: username || '',
      email: email || `${username}@users.noreply.github.com`,
    };

    this.octokit = new Octokit({
      auth: token,
    });
  }

  /**
   * Check if executor is properly configured
   */
  isReady(): boolean {
    return this.isConfigured;
  }

  /**
   * Fork a repository if we don't already have a fork
   */
  async ensureFork(owner: string, repo: string): Promise<{ owner: string; repo: string }> {
    if (!this.isConfigured) {
      throw new Error('GitHub not configured. Set GITHUB_TOKEN and GITHUB_USERNAME.');
    }

    try {
      // Check if we already have a fork
      const { data: existingRepo } = await this.octokit.repos.get({
        owner: this.config.username,
        repo,
      });

      if (existingRepo.fork) {
        return { owner: this.config.username, repo };
      }
    } catch (e) {
      // Fork doesn't exist, create it
    }

    // Create fork
    const { data: fork } = await this.octokit.repos.createFork({
      owner,
      repo,
    });

    // Wait for fork to be ready
    await this.waitForFork(this.config.username, repo);

    return { owner: this.config.username, repo: fork.name };
  }

  private async waitForFork(owner: string, repo: string, maxAttempts = 10): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await this.octokit.repos.get({ owner, repo });
        return;
      } catch (err) {
        console.error('[GitHubExecutor] Fork not yet available, retrying:', err);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    throw new Error('Fork creation timed out');
  }

  /**
   * Create a branch from the base branch
   */
  async createBranch(
    owner: string,
    repo: string,
    branchName: string,
    baseBranch: string,
  ): Promise<void> {
    // Get the SHA of the base branch
    const { data: ref } = await this.octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${baseBranch}`,
    });

    // Create new branch
    try {
      await this.octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: ref.object.sha,
      });
    } catch (e: any) {
      if (e.status === 422) {
        // Branch already exists, update it
        await this.octokit.git.updateRef({
          owner,
          repo,
          ref: `heads/${branchName}`,
          sha: ref.object.sha,
          force: true,
        });
      } else {
        throw e;
      }
    }
  }

  /**
   * Commit files to a branch
   */
  async commitFiles(
    owner: string,
    repo: string,
    branch: string,
    files: Array<{ path: string; content: string }>,
    message: string,
  ): Promise<string> {
    // Get the current commit SHA
    const { data: ref } = await this.octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });

    // Get the tree SHA
    const { data: commit } = await this.octokit.git.getCommit({
      owner,
      repo,
      commit_sha: ref.object.sha,
    });

    // Create blobs for each file
    const blobs = await Promise.all(
      files.map(async (file) => {
        const { data: blob } = await this.octokit.git.createBlob({
          owner,
          repo,
          content: Buffer.from(file.content).toString('base64'),
          encoding: 'base64',
        });
        return { path: file.path, sha: blob.sha, mode: '100644' as const, type: 'blob' as const };
      }),
    );

    // Create tree
    const { data: tree } = await this.octokit.git.createTree({
      owner,
      repo,
      base_tree: commit.tree.sha,
      tree: blobs,
    });

    // Create commit
    const { data: newCommit } = await this.octokit.git.createCommit({
      owner,
      repo,
      message,
      tree: tree.sha,
      parents: [ref.object.sha],
      author: {
        name: this.config.username,
        email: this.config.email,
        date: new Date().toISOString(),
      },
    });

    // Update branch ref
    await this.octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
    });

    return newCommit.sha;
  }

  /**
   * Create a pull request
   */
  async createPR(
    upstreamOwner: string,
    upstreamRepo: string,
    forkOwner: string,
    branchName: string,
    baseBranch: string,
    title: string,
    body: string,
    labels?: string[],
  ): Promise<{ number: number; url: string }> {
    const { data: pr } = await this.octokit.pulls.create({
      owner: upstreamOwner,
      repo: upstreamRepo,
      title,
      body,
      head: `${forkOwner}:${branchName}`,
      base: baseBranch,
    });

    // Add labels if provided
    if (labels && labels.length > 0) {
      try {
        await this.octokit.issues.addLabels({
          owner: upstreamOwner,
          repo: upstreamRepo,
          issue_number: pr.number,
          labels,
        });
      } catch (err) {
        console.error('[GitHubExecutor] Failed to add labels (labels may not exist):', err);
      }
    }

    return { number: pr.number, url: pr.html_url };
  }

  /**
   * Full pipeline: Submit a bounty solution as a PR
   */
  async submitBountySolution(submission: PRSubmission): Promise<PRResult> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'GitHub not configured. Set GITHUB_TOKEN and GITHUB_USERNAME.',
      };
    }

    const branchName = `genesis-bounty-${Date.now()}`;

    try {
      console.log(`[GitHubExecutor] Forking ${submission.repoOwner}/${submission.repoName}...`);

      // Step 1: Ensure we have a fork
      const fork = await this.ensureFork(submission.repoOwner, submission.repoName);

      console.log(`[GitHubExecutor] Creating branch ${branchName}...`);

      // Step 2: Create branch
      await this.createBranch(
        fork.owner,
        fork.repo,
        branchName,
        submission.baseBranch,
      );

      console.log(`[GitHubExecutor] Committing ${submission.files.length} files...`);

      // Step 3: Commit files
      await this.commitFiles(
        fork.owner,
        fork.repo,
        branchName,
        submission.files,
        submission.title,
      );

      console.log(`[GitHubExecutor] Creating PR...`);

      // Step 4: Create PR
      const pr = await this.createPR(
        submission.repoOwner,
        submission.repoName,
        fork.owner,
        branchName,
        submission.baseBranch,
        submission.title,
        submission.body,
        submission.labels,
      );

      console.log(`[GitHubExecutor] PR created: ${pr.url}`);

      return {
        success: true,
        prNumber: pr.number,
        prUrl: pr.url,
        forkUrl: `https://github.com/${fork.owner}/${fork.repo}`,
        branchName,
      };
    } catch (error) {
      console.error('[GitHubExecutor] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        branchName,
      };
    }
  }

  /**
   * Check the status of a PR
   */
  async checkPRStatus(owner: string, repo: string, prNumber: number): Promise<{
    state: 'open' | 'closed' | 'merged';
    mergeable: boolean | null;
    reviews: number;
    approved: boolean;
  }> {
    const { data: pr } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    const { data: reviews } = await this.octokit.pulls.listReviews({
      owner,
      repo,
      pull_number: prNumber,
    });

    const approved = reviews.some((r: { state?: string }) => r.state === 'APPROVED');

    return {
      state: pr.merged ? 'merged' : pr.state as 'open' | 'closed',
      mergeable: pr.mergeable,
      reviews: reviews.length,
      approved,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let executorInstance: GitHubExecutor | null = null;

export function getGitHubExecutor(): GitHubExecutor {
  if (!executorInstance) {
    executorInstance = new GitHubExecutor();
  }
  return executorInstance;
}

export function resetGitHubExecutor(): void {
  executorInstance = null;
}
