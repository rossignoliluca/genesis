/**
 * Auto-Revision System v19.4
 *
 * Automatically revises code when reviewers request changes:
 * - Parses change requests from PR comments
 * - Generates fixes using LLM with context
 * - Updates PR with revised code
 * - Responds to reviewer with changes made
 *
 * This closes the feedback loop for non-blocking issues.
 *
 * @module economy/auto-revision
 * @version 19.4.0
 */

import { getMCPClient } from '../mcp/index.js';
import { getHybridRouter } from '../llm/router.js';
import { getFeedbackAnalyzer, type FeedbackIssue, type FeedbackAnalysis } from './feedback-analyzer.js';
import { getBountyLearning } from './bounty-learning.js';
import type { PRSubmission, CodeChange } from './live/pr-pipeline.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface RevisionRequest {
  prUrl: string;
  repo: string;
  prNumber: number;
  branch: string;
  issues: FeedbackIssue[];
  originalFiles: Map<string, string>;
  reviewerComments: string[];
}

export interface RevisionResult {
  success: boolean;
  revisedFiles: CodeChange[];
  changesDescription: string;
  issuesAddressed: string[];
  issuesSkipped: string[];
  error?: string;
}

export interface RevisionConfig {
  /** Max issues to address per revision */
  maxIssuesPerRevision: number;
  /** Severity levels to auto-fix */
  autoFixSeverities: ('minor' | 'suggestion' | 'major')[];
  /** Issue types to auto-fix */
  autoFixTypes: FeedbackIssue['type'][];
  /** Max revisions per PR */
  maxRevisionsPerPR: number;
  /** Require human approval for major changes */
  requireApprovalForMajor: boolean;
}

const DEFAULT_CONFIG: RevisionConfig = {
  maxIssuesPerRevision: 5,
  autoFixSeverities: ['minor', 'suggestion'],
  autoFixTypes: ['code_style', 'documentation', 'missing_tests'],
  maxRevisionsPerPR: 3,
  requireApprovalForMajor: true,
};

// ============================================================================
// Auto-Revision Engine
// ============================================================================

export class AutoRevisionEngine {
  private mcp = getMCPClient();
  private router = getHybridRouter();
  private feedbackAnalyzer = getFeedbackAnalyzer();
  private learningEngine = getBountyLearning();
  private config: RevisionConfig;
  private revisionCounts: Map<string, number> = new Map();
  private persistPath: string;

  constructor(config?: Partial<RevisionConfig>, persistPath?: string) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.persistPath = persistPath ?? '.genesis/auto-revision.json';
    this.load();
  }

  // ===========================================================================
  // Main Revision Flow
  // ===========================================================================

  /**
   * Analyze a PR and determine if auto-revision is possible
   */
  async analyzeForRevision(submission: PRSubmission): Promise<{
    canRevise: boolean;
    reason: string;
    issues: FeedbackIssue[];
    estimatedEffort: 'trivial' | 'easy' | 'moderate' | 'complex';
  }> {
    // Check revision count
    const prKey = `${submission.repo}#${submission.prNumber}`;
    const revisionCount = this.revisionCounts.get(prKey) || 0;

    if (revisionCount >= this.config.maxRevisionsPerPR) {
      return {
        canRevise: false,
        reason: `Max revisions (${this.config.maxRevisionsPerPR}) reached for this PR`,
        issues: [],
        estimatedEffort: 'complex',
      };
    }

    // Analyze feedback
    const analysis = await this.feedbackAnalyzer.analyzePRFeedback(submission);

    // Filter to auto-fixable issues
    const autoFixable = analysis.issues.filter(issue =>
      this.config.autoFixSeverities.includes(issue.severity as any) &&
      this.config.autoFixTypes.includes(issue.type)
    );

    if (autoFixable.length === 0) {
      // Check if there are non-auto-fixable issues
      if (analysis.issues.length > 0) {
        return {
          canRevise: false,
          reason: `Issues found but not auto-fixable: ${analysis.issues.map(i => i.type).join(', ')}`,
          issues: analysis.issues,
          estimatedEffort: 'complex',
        };
      }
      return {
        canRevise: false,
        reason: 'No issues found that need revision',
        issues: [],
        estimatedEffort: 'trivial',
      };
    }

    // Estimate effort
    const effort = this.estimateEffort(autoFixable);

    return {
      canRevise: true,
      reason: `${autoFixable.length} auto-fixable issues found`,
      issues: autoFixable,
      estimatedEffort: effort,
    };
  }

  /**
   * Execute revision for a PR
   */
  async revise(submission: PRSubmission): Promise<RevisionResult> {
    const prKey = `${submission.repo}#${submission.prNumber}`;
    console.log(`[AutoRevision] Starting revision for ${prKey}`);

    try {
      // 1. Analyze current issues
      const analysis = await this.analyzeForRevision(submission);
      if (!analysis.canRevise) {
        return {
          success: false,
          revisedFiles: [],
          changesDescription: '',
          issuesAddressed: [],
          issuesSkipped: [],
          error: analysis.reason,
        };
      }

      // 2. Fetch current file contents
      const [owner, repo] = submission.repo.split('/');
      const files = await this.fetchPRFiles(owner, repo, submission.prNumber, submission.branch);

      if (files.size === 0) {
        return {
          success: false,
          revisedFiles: [],
          changesDescription: '',
          issuesAddressed: [],
          issuesSkipped: [],
          error: 'Could not fetch PR files',
        };
      }

      // 3. Generate revisions for each issue
      const issuesToFix = analysis.issues.slice(0, this.config.maxIssuesPerRevision);
      const issuesSkipped = analysis.issues.slice(this.config.maxIssuesPerRevision).map(i => i.description);

      const revisions = await this.generateRevisions(files, issuesToFix, submission);

      if (revisions.length === 0) {
        return {
          success: false,
          revisedFiles: [],
          changesDescription: '',
          issuesAddressed: [],
          issuesSkipped,
          error: 'Could not generate valid revisions',
        };
      }

      // 4. Apply revisions to PR
      const applyResult = await this.applyRevisions(owner, repo, submission.branch, revisions);

      if (!applyResult.success) {
        return {
          success: false,
          revisedFiles: revisions,
          changesDescription: '',
          issuesAddressed: [],
          issuesSkipped,
          error: applyResult.error,
        };
      }

      // 5. Post comment explaining changes
      const changesDescription = this.generateChangesDescription(issuesToFix, revisions);
      await this.postRevisionComment(owner, repo, submission.prNumber, changesDescription);

      // 6. Update revision count
      this.revisionCounts.set(prKey, (this.revisionCounts.get(prKey) || 0) + 1);
      this.save();

      console.log(`[AutoRevision] ✅ Revision successful: ${revisions.length} files updated`);

      return {
        success: true,
        revisedFiles: revisions,
        changesDescription,
        issuesAddressed: issuesToFix.map(i => i.description),
        issuesSkipped,
      };

    } catch (error) {
      console.error('[AutoRevision] Error:', error);
      return {
        success: false,
        revisedFiles: [],
        changesDescription: '',
        issuesAddressed: [],
        issuesSkipped: [],
        error: String(error),
      };
    }
  }

  // ===========================================================================
  // File Operations
  // ===========================================================================

  private async fetchPRFiles(
    owner: string,
    repo: string,
    prNumber: number,
    branch: string
  ): Promise<Map<string, string>> {
    const files = new Map<string, string>();

    try {
      // Get list of files in PR
      const prFiles = await this.mcp.call('github', 'get_pull_request_files', {
        owner,
        repo,
        pull_number: prNumber,
      });

      if (!prFiles.success || !prFiles.data) {
        return files;
      }

      // Fetch content for each file
      for (const file of prFiles.data) {
        if (file.status === 'removed') continue;

        try {
          const content = await this.mcp.call('github', 'get_file_contents', {
            owner,
            repo,
            path: file.filename,
            ref: branch,
          });

          if (content.success && content.data?.content) {
            const decoded = Buffer.from(content.data.content, 'base64').toString('utf-8');
            files.set(file.filename, decoded);
          }
        } catch (err) {
          // Skip files we can't fetch
        }
      }
    } catch (error) {
      console.error('[AutoRevision] Failed to fetch PR files:', error);
    }

    return files;
  }

  // ===========================================================================
  // Revision Generation
  // ===========================================================================

  private async generateRevisions(
    files: Map<string, string>,
    issues: FeedbackIssue[],
    submission: PRSubmission
  ): Promise<CodeChange[]> {
    const revisions: CodeChange[] = [];

    // Group issues by file
    const issuesByFile = new Map<string, FeedbackIssue[]>();
    for (const issue of issues) {
      const file = issue.file || 'unknown';
      if (!issuesByFile.has(file)) {
        issuesByFile.set(file, []);
      }
      issuesByFile.get(file)!.push(issue);
    }

    // Generate revision for each file
    for (const [filePath, fileIssues] of issuesByFile) {
      const originalContent = files.get(filePath);
      if (!originalContent && filePath !== 'unknown') {
        continue;
      }

      // For 'unknown' file issues, try to identify the file from context
      let targetFile = filePath;
      let content = originalContent || '';

      if (filePath === 'unknown') {
        // Find the most likely file based on issue description
        for (const [path, c] of files) {
          if (fileIssues.some(i => i.description.includes(path) ||
              i.description.includes(path.split('/').pop() || ''))) {
            targetFile = path;
            content = c;
            break;
          }
        }
        // If still unknown, skip
        if (targetFile === 'unknown') {
          console.log('[AutoRevision] Skipping issues with unknown file');
          continue;
        }
      }

      // Generate revision using LLM
      const revision = await this.generateFileRevision(targetFile, content, fileIssues);

      if (revision) {
        revisions.push(revision);
      }
    }

    return revisions;
  }

  private async generateFileRevision(
    filePath: string,
    currentContent: string,
    issues: FeedbackIssue[]
  ): Promise<CodeChange | null> {
    const issueDescriptions = issues.map((issue, i) =>
      `${i + 1}. [${issue.severity}] ${issue.type}: ${issue.description}${issue.suggestedFix ? ` (Suggested: ${issue.suggestedFix})` : ''}`
    ).join('\n');

    const systemPrompt = `You are a code reviewer assistant that fixes issues in code.
Your task is to revise the given code to address the listed issues.

RULES:
1. Make MINIMAL changes - only fix what's necessary
2. Preserve the overall structure and logic
3. Match the existing code style exactly
4. Do NOT add extra features or refactoring
5. Return ONLY the complete revised code, no explanations
6. If an issue cannot be fixed without major changes, leave that part unchanged`;

    const userPrompt = `File: ${filePath}

Issues to fix:
${issueDescriptions}

Current code:
\`\`\`
${currentContent}
\`\`\`

Return the COMPLETE revised code with issues fixed:`;

    try {
      const response = await this.router.execute(userPrompt, systemPrompt);

      // Extract code from response
      let revisedContent = response.content;

      // Remove markdown code blocks if present
      const codeMatch = revisedContent.match(/```(?:\w+)?\s*([\s\S]*?)```/);
      if (codeMatch) {
        revisedContent = codeMatch[1].trim();
      }

      // Validate revision
      if (!revisedContent || revisedContent.length < 10) {
        console.log('[AutoRevision] Invalid revision - too short');
        return null;
      }

      // Check if content actually changed
      if (revisedContent.trim() === currentContent.trim()) {
        console.log('[AutoRevision] No changes made to file');
        return null;
      }

      return {
        path: filePath,
        content: revisedContent,
        operation: 'update',
      };

    } catch (error) {
      console.error(`[AutoRevision] Failed to generate revision for ${filePath}:`, error);
      return null;
    }
  }

  // ===========================================================================
  // Apply Revisions
  // ===========================================================================

  private async applyRevisions(
    owner: string,
    repo: string,
    branch: string,
    revisions: CodeChange[]
  ): Promise<{ success: boolean; error?: string }> {
    for (const revision of revisions) {
      try {
        const result = await this.mcp.call('github', 'create_or_update_file', {
          owner,
          repo,
          path: revision.path,
          content: revision.content,
          message: `[Auto-revision] Fix: ${revision.path}`,
          branch,
        });

        if (!result.success) {
          return { success: false, error: `Failed to update ${revision.path}: ${result.error}` };
        }

        console.log(`[AutoRevision] Updated: ${revision.path}`);

      } catch (error) {
        return { success: false, error: `Exception updating ${revision.path}: ${error}` };
      }
    }

    return { success: true };
  }

  // ===========================================================================
  // Comments
  // ===========================================================================

  private async postRevisionComment(
    owner: string,
    repo: string,
    prNumber: number,
    description: string
  ): Promise<void> {
    try {
      await this.mcp.call('github', 'add_issue_comment', {
        owner,
        repo,
        issue_number: prNumber,
        body: description,
      });
    } catch (error) {
      console.error('[AutoRevision] Failed to post comment:', error);
    }
  }

  private generateChangesDescription(issues: FeedbackIssue[], revisions: CodeChange[]): string {
    const lines: string[] = [];
    lines.push('## 🔄 Auto-Revision Applied\n');
    lines.push('I\'ve addressed the following feedback:\n');

    for (const issue of issues) {
      lines.push(`- ✅ **${issue.type}**: ${issue.description.slice(0, 100)}`);
    }

    lines.push('\n### Files Updated:\n');
    for (const revision of revisions) {
      lines.push(`- \`${revision.path}\``);
    }

    lines.push('\n---');
    lines.push('*This revision was automatically generated by Genesis AI. Please review the changes.*');

    return lines.join('\n');
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private estimateEffort(issues: FeedbackIssue[]): 'trivial' | 'easy' | 'moderate' | 'complex' {
    const severityWeights = {
      suggestion: 1,
      minor: 2,
      major: 5,
      critical: 10,
    };

    const totalWeight = issues.reduce((sum, i) => sum + (severityWeights[i.severity] || 5), 0);

    if (totalWeight <= 3) return 'trivial';
    if (totalWeight <= 8) return 'easy';
    if (totalWeight <= 15) return 'moderate';
    return 'complex';
  }

  getRevisionCount(prKey: string): number {
    return this.revisionCounts.get(prKey) || 0;
  }

  // ===========================================================================
  // Persistence
  // ===========================================================================

  private save(): void {
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = {
        revisionCounts: Object.fromEntries(this.revisionCounts),
        lastSaved: new Date().toISOString(),
      };

      fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[AutoRevision] Failed to save:', error);
    }
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.persistPath)) return;

      const data = JSON.parse(fs.readFileSync(this.persistPath, 'utf-8'));

      if (data.revisionCounts) {
        for (const [key, count] of Object.entries(data.revisionCounts)) {
          this.revisionCounts.set(key, count as number);
        }
      }

      console.log(`[AutoRevision] Loaded revision counts for ${this.revisionCounts.size} PRs`);
    } catch (error) {
      console.error('[AutoRevision] Failed to load:', error);
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let autoRevisionEngine: AutoRevisionEngine | null = null;

export function getAutoRevision(): AutoRevisionEngine {
  if (!autoRevisionEngine) {
    autoRevisionEngine = new AutoRevisionEngine();
  }
  return autoRevisionEngine;
}

export function resetAutoRevision(): void {
  autoRevisionEngine = null;
}
