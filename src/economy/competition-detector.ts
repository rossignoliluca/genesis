/**
 * Competition Detector v19.7
 *
 * Detects if others are already working on a bounty:
 * - Checks for open PRs referencing the issue
 * - Analyzes recent activity on the issue
 * - Identifies other bot submissions
 * - Evaluates competition quality
 * - Decides whether to compete or skip
 *
 * This prevents wasted effort on already-claimed bounties.
 *
 * @module economy/competition-detector
 * @version 19.7.0
 */

import { getMCPClient } from '../mcp/index.js';
import type { Bounty } from './generators/bounty-hunter.js';

// ============================================================================
// Types
// ============================================================================

export interface CompetitionAnalysis {
  // Competition state
  hasCompetition: boolean;
  competitorCount: number;
  competitorType: 'none' | 'human' | 'bot' | 'mixed';

  // Competitor details
  competitors: Competitor[];

  // Our position
  advantage: 'first-mover' | 'equal' | 'late' | 'too-late';
  shouldCompete: boolean;
  competitionRisk: number;  // 0-1

  // Timing
  issueAge: number;  // hours since creation
  timeSinceLastActivity: number;  // hours
  competitorLeadTime: number;  // hours ahead

  // Recommendations
  recommendation: 'proceed' | 'proceed-cautiously' | 'wait' | 'skip';
  reasoning: string[];
}

export interface Competitor {
  username: string;
  type: 'human' | 'bot' | 'unknown';
  prNumber?: number;
  prUrl?: string;
  prStatus?: 'open' | 'closed' | 'merged' | 'draft';
  submittedAt?: Date;
  quality: 'low' | 'medium' | 'high' | 'unknown';
  activity: 'active' | 'stale' | 'abandoned';
}

// Known bot patterns
const BOT_PATTERNS = [
  /bot$/i,
  /\[bot\]$/i,
  /-bot-/i,
  /^dependabot/i,
  /^renovate/i,
  /^greenkeeper/i,
  /^semantic-release/i,
  /^github-actions/i,
  /^codecov/i,
  /^allcontributors/i,
  /^imgbot/i,
  /^snyk/i,
  /^deepsource/i,
  /^codeclimate/i,
  /^gitpod/i,
  /genesis/i,  // Our bot
];

// ============================================================================
// Competition Detector
// ============================================================================

export class CompetitionDetector {
  private mcp = getMCPClient();
  private analysisCache: Map<string, { analysis: CompetitionAnalysis; timestamp: number }> = new Map();
  private cacheMaxAge = 30 * 60 * 1000; // 30 minutes

  /**
   * Analyze competition for a bounty
   */
  async analyze(bounty: Bounty): Promise<CompetitionAnalysis> {
    if (!bounty.sourceMetadata?.org || !bounty.sourceMetadata?.repo || !bounty.sourceMetadata?.issueNumber) {
      return this.noCompetitionResult('No issue reference');
    }

    const owner = bounty.sourceMetadata.org;
    const repo = bounty.sourceMetadata.repo;
    const issueNumber = bounty.sourceMetadata.issueNumber;
    const cacheKey = `${owner}/${repo}#${issueNumber}`;

    // Check cache
    const cached = this.analysisCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return cached.analysis;
    }

    console.log(`[CompetitionDetector] Analyzing competition for ${cacheKey}...`);

    const analysis = await this.performAnalysis(owner, repo, issueNumber);

    this.analysisCache.set(cacheKey, { analysis, timestamp: Date.now() });

    return analysis;
  }

  /**
   * Perform competition analysis
   */
  private async performAnalysis(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<CompetitionAnalysis> {
    const competitors: Competitor[] = [];
    const reasoning: string[] = [];

    try {
      // Fetch issue and related PRs
      const [issue, searchResult] = await Promise.all([
        this.mcp.call('github', 'get_issue', { owner, repo, issue_number: issueNumber }),
        this.mcp.call('github', 'search_issues', {
          q: `repo:${owner}/${repo} is:pr ${issueNumber} in:body`,
          per_page: 20,
        }),
      ]);

      const issueData = issue?.data;
      const prs = searchResult?.data?.items || [];

      // Calculate issue age
      const issueAge = issueData?.created_at
        ? (Date.now() - new Date(issueData.created_at).getTime()) / (1000 * 60 * 60)
        : 0;

      const lastActivity = issueData?.updated_at
        ? (Date.now() - new Date(issueData.updated_at).getTime()) / (1000 * 60 * 60)
        : 0;

      // Analyze each PR
      for (const pr of prs) {
        const competitor = this.analyzePR(pr, issueNumber);
        if (competitor) {
          competitors.push(competitor);
        }
      }

      // Check for linked PRs in issue body/timeline
      await this.checkLinkedPRs(owner, repo, issueNumber, competitors);

      // Determine competition type
      const botCompetitors = competitors.filter(c => c.type === 'bot');
      const humanCompetitors = competitors.filter(c => c.type === 'human');
      const competitorType: CompetitionAnalysis['competitorType'] =
        competitors.length === 0 ? 'none' :
        botCompetitors.length > 0 && humanCompetitors.length > 0 ? 'mixed' :
        botCompetitors.length > 0 ? 'bot' : 'human';

      // Calculate lead time
      const earliestSubmission = competitors
        .filter(c => c.submittedAt)
        .sort((a, b) => (a.submittedAt?.getTime() || 0) - (b.submittedAt?.getTime() || 0))[0];

      const competitorLeadTime = earliestSubmission?.submittedAt
        ? (Date.now() - earliestSubmission.submittedAt.getTime()) / (1000 * 60 * 60)
        : 0;

      // Determine advantage
      const openPRs = competitors.filter(c => c.prStatus === 'open' || c.prStatus === 'draft');
      const mergedPRs = competitors.filter(c => c.prStatus === 'merged');
      const activePRs = competitors.filter(c => c.activity === 'active');

      let advantage: CompetitionAnalysis['advantage'] = 'first-mover';
      if (mergedPRs.length > 0) {
        advantage = 'too-late';
        reasoning.push(`Issue already resolved by ${mergedPRs[0].username}`);
      } else if (activePRs.length > 0) {
        advantage = competitorLeadTime > 24 ? 'late' : 'equal';
        reasoning.push(`${activePRs.length} active PR(s) in progress`);
      } else if (competitors.length > 0) {
        advantage = 'equal';
        reasoning.push(`${competitors.length} competitor(s) but no active PRs`);
      } else {
        reasoning.push('No competition detected');
      }

      // Calculate competition risk
      let competitionRisk = 0;
      if (mergedPRs.length > 0) competitionRisk = 1;
      else if (activePRs.filter(c => c.quality === 'high').length > 0) competitionRisk = 0.8;
      else if (activePRs.length > 0) competitionRisk = 0.5;
      else if (competitors.length > 0) competitionRisk = 0.2;

      // Determine recommendation
      let recommendation: CompetitionAnalysis['recommendation'] = 'proceed';
      let shouldCompete = true;

      if (mergedPRs.length > 0) {
        recommendation = 'skip';
        shouldCompete = false;
        reasoning.push('Issue already resolved');
      } else if (activePRs.filter(c => c.quality === 'high' && c.type === 'human').length > 0) {
        recommendation = 'skip';
        shouldCompete = false;
        reasoning.push('High-quality human PR already in review');
      } else if (activePRs.filter(c => c.type === 'bot').length > 0) {
        recommendation = 'proceed-cautiously';
        reasoning.push('Other bots competing - may confuse maintainers');
      } else if (activePRs.length > 2) {
        recommendation = 'wait';
        shouldCompete = false;
        reasoning.push('Too many open PRs - wait for resolution');
      } else if (issueAge > 720) { // 30 days
        recommendation = 'proceed-cautiously';
        reasoning.push('Stale issue - may be abandoned or complex');
      }

      return {
        hasCompetition: competitors.length > 0,
        competitorCount: competitors.length,
        competitorType,
        competitors,
        advantage,
        shouldCompete,
        competitionRisk,
        issueAge,
        timeSinceLastActivity: lastActivity,
        competitorLeadTime,
        recommendation,
        reasoning,
      };

    } catch (error) {
      console.warn('[CompetitionDetector] Analysis failed:', error);
      return this.noCompetitionResult('Analysis failed');
    }
  }

  /**
   * Analyze a PR for competition
   */
  private analyzePR(pr: any, issueNumber: number): Competitor | null {
    // Skip if not referencing our issue
    const body = pr.body || '';
    const title = pr.title || '';
    const combined = `${title} ${body}`.toLowerCase();

    if (!combined.includes(`#${issueNumber}`) &&
        !combined.includes(`fixes #${issueNumber}`) &&
        !combined.includes(`closes #${issueNumber}`) &&
        !combined.includes(`resolves #${issueNumber}`)) {
      return null;
    }

    const username = pr.user?.login || 'unknown';
    const isBot = BOT_PATTERNS.some(p => p.test(username));

    // Determine PR status
    let prStatus: Competitor['prStatus'] = 'open';
    if (pr.merged_at) prStatus = 'merged';
    else if (pr.state === 'closed') prStatus = 'closed';
    else if (pr.draft) prStatus = 'draft';

    // Estimate quality
    let quality: Competitor['quality'] = 'unknown';
    const additions = pr.additions || 0;
    const deletions = pr.deletions || 0;
    const changedFiles = pr.changed_files || 0;

    if (additions > 1000 || deletions > 500) quality = 'high';
    else if (additions > 100 || changedFiles > 5) quality = 'medium';
    else if (additions > 10) quality = 'low';

    // Determine activity
    const lastUpdate = pr.updated_at ? new Date(pr.updated_at) : null;
    const hoursSinceUpdate = lastUpdate
      ? (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60)
      : 999;

    let activity: Competitor['activity'] = 'active';
    if (hoursSinceUpdate > 168) activity = 'abandoned';  // 7 days
    else if (hoursSinceUpdate > 48) activity = 'stale';  // 2 days

    return {
      username,
      type: isBot ? 'bot' : 'human',
      prNumber: pr.number,
      prUrl: pr.html_url,
      prStatus,
      submittedAt: pr.created_at ? new Date(pr.created_at) : undefined,
      quality,
      activity,
    };
  }

  /**
   * Check for linked PRs in issue timeline
   */
  private async checkLinkedPRs(
    owner: string,
    repo: string,
    issueNumber: number,
    competitors: Competitor[]
  ): Promise<void> {
    try {
      // Get issue comments to find PR links
      const comments = await this.mcp.call('github', 'list_issue_comments', {
        owner,
        repo,
        issue_number: issueNumber,
        per_page: 50,
      });

      if (!comments?.data) return;

      const existingPRs = new Set(competitors.map(c => c.prNumber));
      const prPattern = /#(\d+)/g;

      for (const comment of comments.data) {
        const body = comment.body || '';
        let match;

        while ((match = prPattern.exec(body)) !== null) {
          const prNumber = parseInt(match[1], 10);
          if (prNumber > 0 && prNumber !== issueNumber && !existingPRs.has(prNumber)) {
            // Check if it's actually a PR
            try {
              const pr = await this.mcp.call('github', 'get_pull_request', {
                owner,
                repo,
                pull_number: prNumber,
              });

              if (pr?.data) {
                const competitor = this.analyzePR(pr.data, issueNumber);
                if (competitor) {
                  competitors.push(competitor);
                  existingPRs.add(prNumber);
                }
              }
            } catch {
              // Not a PR or not accessible
            }
          }
        }
      }
    } catch (error) {
      console.warn('[CompetitionDetector] Failed to check linked PRs:', error);
    }
  }

  /**
   * Create a no-competition result
   */
  private noCompetitionResult(reason: string): CompetitionAnalysis {
    return {
      hasCompetition: false,
      competitorCount: 0,
      competitorType: 'none',
      competitors: [],
      advantage: 'first-mover',
      shouldCompete: true,
      competitionRisk: 0,
      issueAge: 0,
      timeSinceLastActivity: 0,
      competitorLeadTime: 0,
      recommendation: 'proceed',
      reasoning: [reason],
    };
  }

  /**
   * Format analysis for logging
   */
  formatAnalysis(analysis: CompetitionAnalysis): string {
    const lines: string[] = [];

    lines.push('=== Competition Analysis ===');
    lines.push(`Competition: ${analysis.hasCompetition ? 'YES' : 'NO'} (${analysis.competitorCount} competitors)`);
    lines.push(`Type: ${analysis.competitorType}`);
    lines.push(`Advantage: ${analysis.advantage}`);
    lines.push(`Risk: ${(analysis.competitionRisk * 100).toFixed(0)}%`);
    lines.push(`Recommendation: ${analysis.recommendation.toUpperCase()}`);
    lines.push('');

    if (analysis.competitors.length > 0) {
      lines.push('Competitors:');
      for (const c of analysis.competitors) {
        lines.push(`  - @${c.username} (${c.type}) - PR #${c.prNumber} [${c.prStatus}] - ${c.activity}`);
      }
      lines.push('');
    }

    lines.push('Reasoning:');
    for (const r of analysis.reasoning) {
      lines.push(`  - ${r}`);
    }

    return lines.join('\n');
  }
}

// ============================================================================
// Singleton
// ============================================================================

let detector: CompetitionDetector | null = null;

export function getCompetitionDetector(): CompetitionDetector {
  if (!detector) {
    detector = new CompetitionDetector();
  }
  return detector;
}

export function resetCompetitionDetector(): void {
  detector = null;
}
