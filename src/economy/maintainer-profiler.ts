/**
 * Maintainer Profiler v19.6
 *
 * Learns preferences and patterns of specific maintainers:
 * - Analyzes their PR review patterns
 * - Tracks what they approve/reject
 * - Adapts submissions to match their preferences
 * - Identifies best times to submit
 *
 * This personalizes submissions for higher acceptance.
 *
 * @module economy/maintainer-profiler
 * @version 19.6.0
 */

import { getMCPClient } from '../mcp/index.js';
import { getHybridRouter } from '../llm/router.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface MaintainerProfile {
  username: string;
  repos: string[];

  // Review patterns
  reviewStyle: {
    strictness: 'lenient' | 'moderate' | 'strict' | 'very_strict';
    focusAreas: string[];  // What they care about most
    commonRequests: string[];  // What they often ask for
    dealBreakers: string[];  // What causes instant rejection
  };

  // Communication preferences
  communication: {
    preferredPRSize: 'small' | 'medium' | 'large';
    likesDetailedDescription: boolean;
    wantsIssueReference: boolean;
    prefersTests: boolean;
    likesDocumentation: boolean;
  };

  // Activity patterns
  activity: {
    averageResponseTime: number;  // hours
    activeHours: number[];  // UTC hours when active
    activeDays: number[];  // 0=Sunday, 6=Saturday
    reviewsPerWeek: number;
  };

  // Our interaction history
  history: {
    totalPRs: number;
    accepted: number;
    rejected: number;
    successRate: number;
    lastInteraction?: Date;
    feedbackReceived: string[];
  };

  confidence: number;
  lastUpdated: Date;
}

export interface MaintainerInteraction {
  prUrl: string;
  maintainer: string;
  outcome: 'approved' | 'rejected' | 'changes_requested' | 'pending';
  feedback?: string;
  responseTime?: number;
  timestamp: Date;
}

// ============================================================================
// Maintainer Profiler
// ============================================================================

export class MaintainerProfiler {
  private mcp = getMCPClient();
  private router = getHybridRouter();
  private profiles: Map<string, MaintainerProfile> = new Map();
  private interactions: MaintainerInteraction[] = [];
  private persistPath: string;

  constructor(persistPath?: string) {
    this.persistPath = persistPath ?? '.genesis/maintainer-profiles.json';
    this.load();
  }

  /**
   * Get or create a maintainer profile
   */
  async getProfile(username: string, repo?: string): Promise<MaintainerProfile> {
    const cached = this.profiles.get(username);

    // Return cached if fresh (< 7 days)
    if (cached && Date.now() - cached.lastUpdated.getTime() < 7 * 24 * 60 * 60 * 1000) {
      return cached;
    }

    console.log(`[MaintainerProfiler] Analyzing maintainer: ${username}`);

    // Build profile from GitHub activity
    const profile = await this.buildProfile(username, repo);
    this.profiles.set(username, profile);
    this.save();

    return profile;
  }

  /**
   * Build profile by analyzing maintainer's GitHub activity
   */
  private async buildProfile(username: string, repo?: string): Promise<MaintainerProfile> {
    const profile: MaintainerProfile = {
      username,
      repos: repo ? [repo] : [],
      reviewStyle: {
        strictness: 'moderate',
        focusAreas: [],
        commonRequests: [],
        dealBreakers: [],
      },
      communication: {
        preferredPRSize: 'medium',
        likesDetailedDescription: true,
        wantsIssueReference: true,
        prefersTests: true,
        likesDocumentation: false,
      },
      activity: {
        averageResponseTime: 24,
        activeHours: [9, 10, 11, 14, 15, 16, 17],
        activeDays: [1, 2, 3, 4, 5],
        reviewsPerWeek: 10,
      },
      history: {
        totalPRs: 0,
        accepted: 0,
        rejected: 0,
        successRate: 0,
        feedbackReceived: [],
      },
      confidence: 0.3,
      lastUpdated: new Date(),
    };

    try {
      // Get user's recent activity
      const userInfo = await this.mcp.call('github', 'get_user', { username });

      if (userInfo?.data) {
        // Analyze their repos to understand focus areas
        if (userInfo.data.public_repos > 0) {
          profile.confidence = 0.5;
        }
      }

      // If repo specified, analyze their review activity there
      if (repo) {
        const [owner, repoName] = repo.split('/');
        if (owner && repoName) {
          await this.analyzeRepoActivity(profile, owner, repoName, username);
        }
      }

      // Analyze our past interactions
      this.analyzeOurHistory(profile, username);

    } catch (error) {
      console.warn(`[MaintainerProfiler] Failed to build profile for ${username}:`, error);
    }

    return profile;
  }

  /**
   * Analyze maintainer's activity in a specific repo
   */
  private async analyzeRepoActivity(
    profile: MaintainerProfile,
    owner: string,
    repo: string,
    username: string
  ): Promise<void> {
    try {
      // Get recent closed PRs to analyze review patterns
      const prs = await this.mcp.call('github', 'list_pull_requests', {
        owner,
        repo,
        state: 'closed',
        per_page: 30,
      });

      if (!prs?.data) return;

      const reviewedPRs: any[] = [];
      const comments: string[] = [];
      const responseTimes: number[] = [];

      for (const pr of prs.data) {
        // Get PR reviews
        try {
          const reviews = await this.mcp.call('github', 'get_pull_request_reviews', {
            owner,
            repo,
            pull_number: pr.number,
          });

          if (reviews?.data) {
            for (const review of reviews.data) {
              if (review.user?.login === username) {
                reviewedPRs.push({ pr, review });

                if (review.body) {
                  comments.push(review.body);
                }

                // Calculate response time
                const prCreated = new Date(pr.created_at);
                const reviewTime = new Date(review.submitted_at);
                const hours = (reviewTime.getTime() - prCreated.getTime()) / (1000 * 60 * 60);
                if (hours > 0 && hours < 168) { // Ignore if > 1 week
                  responseTimes.push(hours);
                }
              }
            }
          }
        } catch (err) {
          console.error('[MaintainerProfiler] Failed to get PR reviews, skipping:', err);
        }
      }

      // Analyze patterns
      if (reviewedPRs.length > 0) {
        // Calculate strictness from approval/rejection ratio
        const approved = reviewedPRs.filter(r => r.review.state === 'APPROVED').length;
        const total = reviewedPRs.length;
        const approvalRate = approved / total;

        if (approvalRate > 0.8) profile.reviewStyle.strictness = 'lenient';
        else if (approvalRate > 0.6) profile.reviewStyle.strictness = 'moderate';
        else if (approvalRate > 0.4) profile.reviewStyle.strictness = 'strict';
        else profile.reviewStyle.strictness = 'very_strict';

        // Analyze response time
        if (responseTimes.length > 0) {
          profile.activity.averageResponseTime =
            responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        }

        // Analyze comments for patterns
        if (comments.length > 0) {
          await this.analyzeCommentPatterns(profile, comments);
        }

        profile.activity.reviewsPerWeek = Math.round(reviewedPRs.length / 4);
        profile.confidence = Math.min(0.9, 0.5 + (reviewedPRs.length * 0.02));
      }

      if (!profile.repos.includes(`${owner}/${repo}`)) {
        profile.repos.push(`${owner}/${repo}`);
      }

    } catch (error) {
      console.warn('[MaintainerProfiler] Failed to analyze repo activity:', error);
    }
  }

  /**
   * Analyze comment patterns to extract preferences
   */
  private async analyzeCommentPatterns(
    profile: MaintainerProfile,
    comments: string[]
  ): Promise<void> {
    const allComments = comments.join('\n\n');

    const systemPrompt = `Analyze these code review comments and extract patterns.

Return JSON:
{
  "focusAreas": ["what they focus on most"],
  "commonRequests": ["things they often ask for"],
  "dealBreakers": ["things that cause rejection"],
  "prefersTests": true/false,
  "likesDocumentation": true/false,
  "likesDetailedDescription": true/false,
  "preferredPRSize": "small|medium|large"
}`;

    try {
      const response = await this.router.execute(
        `Analyze these review comments:\n\n${allComments.slice(0, 5000)}`,
        systemPrompt
      );

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);

        if (analysis.focusAreas) profile.reviewStyle.focusAreas = analysis.focusAreas;
        if (analysis.commonRequests) profile.reviewStyle.commonRequests = analysis.commonRequests;
        if (analysis.dealBreakers) profile.reviewStyle.dealBreakers = analysis.dealBreakers;
        if (analysis.prefersTests !== undefined) profile.communication.prefersTests = analysis.prefersTests;
        if (analysis.likesDocumentation !== undefined) profile.communication.likesDocumentation = analysis.likesDocumentation;
        if (analysis.likesDetailedDescription !== undefined) profile.communication.likesDetailedDescription = analysis.likesDetailedDescription;
        if (analysis.preferredPRSize) profile.communication.preferredPRSize = analysis.preferredPRSize;
      }
    } catch (error) {
      console.warn('[MaintainerProfiler] Failed to analyze comments:', error);
    }
  }

  /**
   * Analyze our past interactions with this maintainer
   */
  private analyzeOurHistory(profile: MaintainerProfile, username: string): void {
    const interactions = this.interactions.filter(i => i.maintainer === username);

    if (interactions.length === 0) return;

    profile.history.totalPRs = interactions.length;
    profile.history.accepted = interactions.filter(i => i.outcome === 'approved').length;
    profile.history.rejected = interactions.filter(i => i.outcome === 'rejected').length;
    profile.history.successRate = profile.history.accepted / profile.history.totalPRs;
    profile.history.feedbackReceived = interactions
      .filter(i => i.feedback)
      .map(i => i.feedback!);

    const lastInteraction = interactions.sort((a, b) =>
      b.timestamp.getTime() - a.timestamp.getTime()
    )[0];
    if (lastInteraction) {
      profile.history.lastInteraction = lastInteraction.timestamp;
    }

    // Boost confidence based on interaction history
    profile.confidence = Math.min(0.95, profile.confidence + (interactions.length * 0.05));
  }

  /**
   * Record an interaction with a maintainer
   */
  recordInteraction(interaction: MaintainerInteraction): void {
    this.interactions.push(interaction);

    // Update profile if exists
    const profile = this.profiles.get(interaction.maintainer);
    if (profile) {
      profile.history.totalPRs++;
      if (interaction.outcome === 'approved') profile.history.accepted++;
      if (interaction.outcome === 'rejected') profile.history.rejected++;
      profile.history.successRate = profile.history.accepted / profile.history.totalPRs;
      if (interaction.feedback) {
        profile.history.feedbackReceived.push(interaction.feedback);
      }
      profile.history.lastInteraction = interaction.timestamp;
    }

    this.save();
  }

  /**
   * Generate submission guidance for a maintainer
   */
  generateSubmissionGuidance(profile: MaintainerProfile): string {
    const lines: string[] = [];

    lines.push(`# Submission Guide for @${profile.username}\n`);

    // Strictness warning
    if (profile.reviewStyle.strictness === 'very_strict') {
      lines.push('⚠️ **VERY STRICT REVIEWER** - Extra care required\n');
    } else if (profile.reviewStyle.strictness === 'strict') {
      lines.push('⚠️ **Strict reviewer** - Ensure high quality\n');
    }

    // Focus areas
    if (profile.reviewStyle.focusAreas.length > 0) {
      lines.push('## Focus Areas (what they check)');
      for (const area of profile.reviewStyle.focusAreas) {
        lines.push(`- ${area}`);
      }
      lines.push('');
    }

    // Deal breakers
    if (profile.reviewStyle.dealBreakers.length > 0) {
      lines.push('## Deal Breakers (avoid these!)');
      for (const breaker of profile.reviewStyle.dealBreakers) {
        lines.push(`- ❌ ${breaker}`);
      }
      lines.push('');
    }

    // Common requests
    if (profile.reviewStyle.commonRequests.length > 0) {
      lines.push('## They Often Ask For');
      for (const req of profile.reviewStyle.commonRequests) {
        lines.push(`- ${req}`);
      }
      lines.push('');
    }

    // Preferences
    lines.push('## Preferences');
    lines.push(`- PR Size: ${profile.communication.preferredPRSize}`);
    if (profile.communication.prefersTests) lines.push('- ✅ Include tests');
    if (profile.communication.likesDocumentation) lines.push('- ✅ Include documentation');
    if (profile.communication.wantsIssueReference) lines.push('- ✅ Reference related issue');
    if (profile.communication.likesDetailedDescription) lines.push('- ✅ Write detailed PR description');
    lines.push('');

    // Our history
    if (profile.history.totalPRs > 0) {
      lines.push('## Our History');
      lines.push(`- Total PRs: ${profile.history.totalPRs}`);
      lines.push(`- Success Rate: ${(profile.history.successRate * 100).toFixed(0)}%`);
      lines.push('');
    }

    // Best time to submit
    lines.push('## Best Time to Submit');
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const activeDays = profile.activity.activeDays.map(d => days[d]).join(', ');
    lines.push(`- Active days: ${activeDays}`);
    lines.push(`- Active hours (UTC): ${profile.activity.activeHours.join(', ')}`);
    lines.push(`- Average response: ${profile.activity.averageResponseTime.toFixed(0)}h`);

    return lines.join('\n');
  }

  /**
   * Check if now is a good time to submit to this maintainer
   */
  isGoodTimeToSubmit(profile: MaintainerProfile): { good: boolean; reason: string } {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcDay = now.getUTCDay();

    if (!profile.activity.activeDays.includes(utcDay)) {
      return {
        good: false,
        reason: `Maintainer is typically not active on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][utcDay]}s`,
      };
    }

    if (!profile.activity.activeHours.includes(utcHour)) {
      const nextActiveHour = profile.activity.activeHours.find(h => h > utcHour) ||
                             profile.activity.activeHours[0];
      return {
        good: false,
        reason: `Maintainer is typically not active at ${utcHour}:00 UTC. Try ${nextActiveHour}:00 UTC`,
      };
    }

    return { good: true, reason: 'Good time to submit!' };
  }

  /**
   * Get all maintainer profiles
   */
  getAllProfiles(): MaintainerProfile[] {
    return [...this.profiles.values()];
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
        profiles: Object.fromEntries(
          [...this.profiles.entries()].map(([k, v]) => [k, {
            ...v,
            history: {
              ...v.history,
              lastInteraction: v.history.lastInteraction?.toISOString(),
            },
            lastUpdated: v.lastUpdated.toISOString(),
          }])
        ),
        interactions: this.interactions.map(i => ({
          ...i,
          timestamp: i.timestamp.toISOString(),
        })),
      };

      fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[MaintainerProfiler] Failed to save:', error);
    }
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.persistPath)) return;

      const data = JSON.parse(fs.readFileSync(this.persistPath, 'utf-8'));

      if (data.profiles) {
        for (const [key, profile] of Object.entries(data.profiles)) {
          const p = profile as any;
          this.profiles.set(key, {
            ...p,
            history: {
              ...p.history,
              lastInteraction: p.history.lastInteraction ? new Date(p.history.lastInteraction) : undefined,
            },
            lastUpdated: new Date(p.lastUpdated),
          });
        }
      }

      if (data.interactions) {
        this.interactions = data.interactions.map((i: any) => ({
          ...i,
          timestamp: new Date(i.timestamp),
        }));
      }

      console.log(`[MaintainerProfiler] Loaded ${this.profiles.size} profiles, ${this.interactions.length} interactions`);
    } catch (error) {
      console.error('[MaintainerProfiler] Failed to load:', error);
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let profiler: MaintainerProfiler | null = null;

export function getMaintainerProfiler(): MaintainerProfiler {
  if (!profiler) {
    profiler = new MaintainerProfiler();
  }
  return profiler;
}

export function resetMaintainerProfiler(): void {
  profiler = null;
}
