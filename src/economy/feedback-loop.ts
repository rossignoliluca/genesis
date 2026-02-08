/**
 * Feedback Loop v19.3
 *
 * Unified feedback integration that connects all sources:
 * - Email notifications (IMAP polling)
 * - GitHub webhooks/polling
 * - Bounty platform updates
 *
 * Automatic learning and self-improvement triggers:
 * - Update skill profiles on every feedback
 * - Trigger RSI when performance drops
 * - Generate improvement plans
 *
 * @module economy/feedback-loop
 * @version 19.3.0
 */

import { EventEmitter } from 'events';
import { getEmailMonitor, type EmailNotification } from './live/email-monitor.js';
import { getFeedbackAnalyzer, type FeedbackAnalysis, type SkillProfile } from './feedback-analyzer.js';
import { getBountyLearning } from './bounty-learning.js';
import { getAutoRevision } from './auto-revision.js';
import { getMCPClient } from '../mcp/index.js';
import type { PRSubmission } from './live/pr-pipeline.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface FeedbackLoopConfig {
  /** Poll interval for GitHub PR status checks (ms) */
  githubPollIntervalMs: number;
  /** Poll interval for email checks (ms) */
  emailPollIntervalMs: number;
  /** Minimum success rate before triggering RSI */
  rsiTriggerThreshold: number;
  /** Enable automatic self-improvement */
  autoImprove: boolean;
  /** Persist path for feedback loop state */
  persistPath: string;
}

export interface FeedbackEvent {
  type: 'pr_merged' | 'pr_closed' | 'pr_comment' | 'pr_changes' | 'bounty_paid' | 'skill_degraded' | 'rsi_triggered';
  source: 'email' | 'github' | 'bounty_platform' | 'internal';
  timestamp: Date;
  data: any;
}

export interface ImprovementPlan {
  id: string;
  createdAt: Date;
  weakSkills: SkillProfile[];
  suggestedActions: ImprovementAction[];
  status: 'pending' | 'in_progress' | 'completed';
  completedAt?: Date;
}

export interface ImprovementAction {
  skill: string;
  action: 'research' | 'practice' | 'avoid_type' | 'lower_confidence' | 'seek_examples';
  description: string;
  priority: 'high' | 'medium' | 'low';
  completed: boolean;
}

// ============================================================================
// Feedback Loop Class
// ============================================================================

export class FeedbackLoop extends EventEmitter {
  private config: FeedbackLoopConfig;
  private mcp = getMCPClient();
  private feedbackAnalyzer = getFeedbackAnalyzer();
  private learningEngine = getBountyLearning();
  private emailMonitor = getEmailMonitor();
  private autoRevision = getAutoRevision();

  private running = false;
  private githubPollTimer: NodeJS.Timeout | null = null;
  private trackedPRs: Map<string, PRSubmission> = new Map();
  private improvementPlans: ImprovementPlan[] = [];
  private eventLog: FeedbackEvent[] = [];

  constructor(config?: Partial<FeedbackLoopConfig>) {
    super();
    this.config = {
      githubPollIntervalMs: config?.githubPollIntervalMs ?? 300000, // 5 min
      emailPollIntervalMs: config?.emailPollIntervalMs ?? 60000,    // 1 min
      rsiTriggerThreshold: config?.rsiTriggerThreshold ?? 0.30,
      autoImprove: config?.autoImprove ?? true,
      persistPath: config?.persistPath ?? '.genesis/feedback-loop.json',
    };
    this.load();
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Start the feedback loop
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log('[FeedbackLoop] Starting unified feedback integration...');

    // Start email monitoring
    if (this.emailMonitor) {
      this.emailMonitor.on('notification', this.handleEmailNotification.bind(this));
      await this.emailMonitor.start();
      console.log('[FeedbackLoop] Email monitoring active');
    } else {
      console.log('[FeedbackLoop] Email monitor not configured - skipping');
    }

    // Start GitHub polling
    this.startGitHubPolling();
    console.log('[FeedbackLoop] GitHub polling active');

    // Check for needed improvements
    await this.checkAndTriggerImprovements();

    console.log('[FeedbackLoop] Feedback loop started');
    this.emit('started');
  }

  /**
   * Stop the feedback loop
   */
  stop(): void {
    this.running = false;

    if (this.emailMonitor) {
      this.emailMonitor.stop();
    }

    if (this.githubPollTimer) {
      clearInterval(this.githubPollTimer);
      this.githubPollTimer = null;
    }

    this.save();
    console.log('[FeedbackLoop] Stopped');
    this.emit('stopped');
  }

  // ===========================================================================
  // Email Integration
  // ===========================================================================

  private async handleEmailNotification(notification: EmailNotification): Promise<void> {
    console.log(`[FeedbackLoop] Email: ${notification.type} - ${notification.subject}`);

    const event: FeedbackEvent = {
      type: notification.type as FeedbackEvent['type'],
      source: 'email',
      timestamp: new Date(),
      data: notification,
    };
    this.logEvent(event);

    // Process based on type
    switch (notification.type) {
      case 'pr_merged':
        await this.handlePRMerged(notification);
        break;

      case 'pr_closed':
        await this.handlePRClosed(notification);
        break;

      case 'pr_changes':
        await this.handlePRChangesRequested(notification);
        break;

      case 'pr_comment':
        await this.handlePRComment(notification);
        break;

      case 'bounty_paid':
        await this.handleBountyPaid(notification);
        break;
    }

    this.emit('feedback', event);
  }

  private async handlePRMerged(notification: EmailNotification): Promise<void> {
    console.log(`[FeedbackLoop] 🎉 PR MERGED: ${notification.prUrl}`);

    // This is a strong positive signal - boost all skills involved
    const weakSkills = this.feedbackAnalyzer.getWeakSkills();
    for (const skill of weakSkills) {
      // Merged PR means we're doing something right
      skill.confidence = Math.min(1, skill.confidence + 0.1);
    }

    // Record revenue if amount available
    if (notification.amount) {
      console.log(`[FeedbackLoop] 💰 Revenue: $${notification.amount}`);
    }

    this.save();
  }

  private async handlePRClosed(notification: EmailNotification): Promise<void> {
    console.log(`[FeedbackLoop] ❌ PR CLOSED: ${notification.prUrl}`);

    // Fetch detailed feedback
    if (notification.repo && notification.prNumber) {
      try {
        const [owner, repo] = notification.repo.split('/');
        if (owner && repo) {
          // Find or create PR submission record
          const prKey = `${notification.repo}#${notification.prNumber}`;
          let submission = this.trackedPRs.get(prKey);

          if (!submission) {
            submission = {
              bountyId: prKey,
              bountyTitle: notification.subject,
              bountyValue: 0,
              prUrl: notification.prUrl || '',
              prNumber: notification.prNumber,
              repo: notification.repo,
              branch: 'unknown',
              status: 'closed',
              submittedAt: new Date(),
            };
            this.trackedPRs.set(prKey, submission);
          }

          submission.status = 'closed';

          // Deep analyze the failure
          const analysis = await this.feedbackAnalyzer.analyzePRFeedback(submission);
          console.log(`[FeedbackLoop] Analysis: ${analysis.issues.length} issues, ${analysis.skillGaps.length} skill gaps`);

          // Check if we need to trigger improvements
          await this.checkAndTriggerImprovements();
        }
      } catch (error) {
        console.error('[FeedbackLoop] Failed to analyze closed PR:', error);
      }
    }

    this.save();
  }

  private async handlePRChangesRequested(notification: EmailNotification): Promise<void> {
    console.log(`[FeedbackLoop] ⚠️ Changes requested: ${notification.prUrl}`);

    // This is important feedback - process immediately
    if (notification.repo && notification.prNumber) {
      try {
        const [owner, repo] = notification.repo.split('/');
        if (!owner || !repo) return;

        // Find tracked PR
        const prKey = `${notification.repo}#${notification.prNumber}`;
        let submission = this.trackedPRs.get(prKey);

        if (!submission) {
          // Create submission record if not tracking
          submission = {
            bountyId: prKey,
            bountyTitle: notification.subject,
            bountyValue: 0,
            prUrl: notification.prUrl || '',
            prNumber: notification.prNumber,
            repo: notification.repo,
            branch: 'unknown',
            status: 'changes_requested',
            submittedAt: new Date(),
          };
          this.trackedPRs.set(prKey, submission);
        }

        // Fetch comments for analysis
        const comments = await this.feedbackAnalyzer.fetchPRComments(
          owner,
          repo,
          notification.prNumber
        );
        console.log(`[FeedbackLoop] Fetched ${comments.length} comments`);

        // Log the requested changes
        for (const comment of comments) {
          if (comment.state === 'CHANGES_REQUESTED') {
            console.log(`[FeedbackLoop] Reviewer ${comment.author}: ${comment.body.slice(0, 100)}...`);
          }
        }

        // v19.4: Attempt AUTO-REVISION if configured
        if (this.config.autoImprove && submission) {
          console.log(`[FeedbackLoop] 🔄 Attempting auto-revision for ${prKey}`);

          // Analyze if we can auto-revise
          const analysis = await this.autoRevision.analyzeForRevision(submission);

          if (analysis.canRevise) {
            console.log(`[FeedbackLoop] Auto-revision possible: ${analysis.reason}`);
            console.log(`[FeedbackLoop] Estimated effort: ${analysis.estimatedEffort}`);

            // Only auto-revise for trivial/easy issues
            if (analysis.estimatedEffort === 'trivial' || analysis.estimatedEffort === 'easy') {
              const result = await this.autoRevision.revise(submission);

              if (result.success) {
                console.log(`[FeedbackLoop] ✅ Auto-revision successful!`);
                console.log(`[FeedbackLoop] Issues addressed: ${result.issuesAddressed.join(', ')}`);
                this.emit('auto_revised', { prKey, result });
              } else {
                console.log(`[FeedbackLoop] Auto-revision failed: ${result.error}`);
              }
            } else {
              console.log(`[FeedbackLoop] Effort too high (${analysis.estimatedEffort}) - skipping auto-revision`);
            }
          } else {
            console.log(`[FeedbackLoop] Cannot auto-revise: ${analysis.reason}`);
          }
        }

      } catch (error) {
        console.error('[FeedbackLoop] Failed to handle change request:', error);
      }
    }
  }

  private async handlePRComment(notification: EmailNotification): Promise<void> {
    console.log(`[FeedbackLoop] 💬 New comment on: ${notification.prUrl}`);

    // Check if it's actionable feedback
    const rawText = notification.rawText || '';
    const lowerText = rawText.toLowerCase();

    if (lowerText.includes('please') || lowerText.includes('should') ||
        lowerText.includes('need') || lowerText.includes('fix')) {
      console.log(`[FeedbackLoop] Comment contains actionable feedback`);
    }
  }

  private async handleBountyPaid(notification: EmailNotification): Promise<void> {
    console.log(`[FeedbackLoop] 💰 Bounty paid: $${notification.amount}`);

    // Strong positive signal - record success
    const event: FeedbackEvent = {
      type: 'bounty_paid',
      source: 'bounty_platform',
      timestamp: new Date(),
      data: { amount: notification.amount },
    };
    this.logEvent(event);
  }

  // ===========================================================================
  // GitHub Polling
  // ===========================================================================

  private startGitHubPolling(): void {
    this.githubPollTimer = setInterval(async () => {
      await this.pollGitHubPRs();
    }, this.config.githubPollIntervalMs);

    // Initial poll
    this.pollGitHubPRs().catch(err => {
      console.error('[FeedbackLoop] Initial GitHub poll failed:', err);
    });
  }

  private async pollGitHubPRs(): Promise<void> {
    // Poll tracked PRs for status changes
    for (const [prKey, submission] of this.trackedPRs) {
      if (submission.status === 'merged' || submission.status === 'closed') {
        continue; // Skip completed PRs
      }

      try {
        const [owner, repo] = submission.repo.split('/');
        if (!owner || !repo) continue;

        const result = await this.mcp.call('github', 'get_pull_request', {
          owner,
          repo,
          pull_number: submission.prNumber,
        });

        if (result.success && result.data) {
          const pr = result.data;
          const newStatus = pr.merged ? 'merged' : pr.state === 'closed' ? 'closed' : submission.status;

          if (newStatus !== submission.status) {
            console.log(`[FeedbackLoop] PR ${prKey} status changed: ${submission.status} → ${newStatus}`);
            submission.status = newStatus as PRSubmission['status'];

            if (newStatus === 'merged') {
              await this.handlePRMerged({
                type: 'pr_merged',
                subject: submission.bountyTitle,
                from: 'github',
                date: new Date(),
                repo: submission.repo,
                prNumber: submission.prNumber,
                prUrl: submission.prUrl,
              });
            } else if (newStatus === 'closed') {
              await this.handlePRClosed({
                type: 'pr_closed',
                subject: submission.bountyTitle,
                from: 'github',
                date: new Date(),
                repo: submission.repo,
                prNumber: submission.prNumber,
                prUrl: submission.prUrl,
              });
            }
          }
        }
      } catch (error) {
        // Silent fail for individual PRs
      }
    }
  }

  // ===========================================================================
  // Improvement Triggers
  // ===========================================================================

  private async checkAndTriggerImprovements(): Promise<void> {
    if (!this.config.autoImprove) return;

    // Check current skill levels
    const weakSkills = this.feedbackAnalyzer.getWeakSkills();
    if (weakSkills.length === 0) {
      return; // All skills are healthy
    }

    // Check learning engine stats
    const stats = this.learningEngine.getStatistics();
    if (stats.successRate < this.config.rsiTriggerThreshold && stats.totalBounties >= 5) {
      console.log(`[FeedbackLoop] 🚨 RSI TRIGGER: Success rate ${(stats.successRate * 100).toFixed(0)}% below threshold`);

      const event: FeedbackEvent = {
        type: 'rsi_triggered',
        source: 'internal',
        timestamp: new Date(),
        data: { successRate: stats.successRate, weakSkills },
      };
      this.logEvent(event);
      this.emit('rsi_triggered', event);

      // Create improvement plan
      await this.createImprovementPlan(weakSkills);
    }

    // Check for specific skill degradation
    for (const skill of weakSkills) {
      if (skill.recentTrend === 'declining' && skill.confidence < 0.3) {
        const event: FeedbackEvent = {
          type: 'skill_degraded',
          source: 'internal',
          timestamp: new Date(),
          data: { skill: skill.skill, confidence: skill.confidence },
        };
        this.logEvent(event);
        console.log(`[FeedbackLoop] ⚠️ Skill degraded: ${skill.skill} (${(skill.confidence * 100).toFixed(0)}%)`);
      }
    }
  }

  private async createImprovementPlan(weakSkills: SkillProfile[]): Promise<ImprovementPlan> {
    const actions: ImprovementAction[] = [];

    for (const skill of weakSkills) {
      // Determine action based on skill type and severity
      const priority = skill.confidence < 0.2 ? 'high' : skill.confidence < 0.4 ? 'medium' : 'low';

      switch (skill.skill) {
        case 'security':
          actions.push({
            skill: skill.skill,
            action: 'research',
            description: 'Review OWASP Top 10 and common vulnerability patterns',
            priority,
            completed: false,
          });
          actions.push({
            skill: skill.skill,
            action: 'avoid_type',
            description: 'Temporarily avoid security-audit bounties until confidence improves',
            priority,
            completed: false,
          });
          break;

        case 'testing':
          actions.push({
            skill: skill.skill,
            action: 'practice',
            description: 'Always include unit tests with code submissions',
            priority,
            completed: false,
          });
          actions.push({
            skill: skill.skill,
            action: 'seek_examples',
            description: 'Study test patterns from successfully merged PRs',
            priority,
            completed: false,
          });
          break;

        case 'requirements':
          actions.push({
            skill: skill.skill,
            action: 'research',
            description: 'Create checklist from bounty requirements before starting',
            priority,
            completed: false,
          });
          actions.push({
            skill: skill.skill,
            action: 'lower_confidence',
            description: 'Increase minimum confidence threshold for submissions',
            priority,
            completed: false,
          });
          break;

        default:
          actions.push({
            skill: skill.skill,
            action: 'research',
            description: `Study best practices for ${skill.skill}`,
            priority,
            completed: false,
          });
      }
    }

    const plan: ImprovementPlan = {
      id: `plan-${Date.now()}`,
      createdAt: new Date(),
      weakSkills,
      suggestedActions: actions,
      status: 'pending',
    };

    this.improvementPlans.push(plan);
    this.save();

    console.log(`[FeedbackLoop] Created improvement plan with ${actions.length} actions`);

    return plan;
  }

  // ===========================================================================
  // PR Tracking
  // ===========================================================================

  /**
   * Add a PR to track
   */
  trackPR(submission: PRSubmission): void {
    const prKey = `${submission.repo}#${submission.prNumber}`;
    this.trackedPRs.set(prKey, submission);
    this.save();
    console.log(`[FeedbackLoop] Now tracking PR: ${prKey}`);
  }

  /**
   * Get all tracked PRs
   */
  getTrackedPRs(): PRSubmission[] {
    return [...this.trackedPRs.values()];
  }

  // ===========================================================================
  // Event Log
  // ===========================================================================

  private logEvent(event: FeedbackEvent): void {
    this.eventLog.push(event);

    // Keep only last 100 events
    if (this.eventLog.length > 100) {
      this.eventLog = this.eventLog.slice(-100);
    }
  }

  getRecentEvents(limit = 20): FeedbackEvent[] {
    return this.eventLog.slice(-limit);
  }

  // ===========================================================================
  // Improvement Plans
  // ===========================================================================

  getImprovementPlans(): ImprovementPlan[] {
    return this.improvementPlans;
  }

  getActivePlan(): ImprovementPlan | null {
    return this.improvementPlans.find(p => p.status === 'pending' || p.status === 'in_progress') || null;
  }

  completeAction(planId: string, actionIndex: number): void {
    const plan = this.improvementPlans.find(p => p.id === planId);
    if (plan && plan.suggestedActions[actionIndex]) {
      plan.suggestedActions[actionIndex].completed = true;

      // Check if all actions completed
      if (plan.suggestedActions.every(a => a.completed)) {
        plan.status = 'completed';
        plan.completedAt = new Date();
        console.log(`[FeedbackLoop] Improvement plan ${planId} completed!`);
      }

      this.save();
    }
  }

  // ===========================================================================
  // Persistence
  // ===========================================================================

  private save(): void {
    try {
      const dir = path.dirname(this.config.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = {
        trackedPRs: Object.fromEntries(
          [...this.trackedPRs.entries()].map(([k, v]) => [k, {
            ...v,
            submittedAt: v.submittedAt instanceof Date ? v.submittedAt.toISOString() : v.submittedAt,
            mergedAt: v.mergedAt instanceof Date ? v.mergedAt.toISOString() : v.mergedAt,
          }])
        ),
        improvementPlans: this.improvementPlans.map(p => ({
          ...p,
          createdAt: p.createdAt.toISOString(),
          completedAt: p.completedAt?.toISOString(),
        })),
        eventLog: this.eventLog.slice(-50).map(e => ({
          ...e,
          timestamp: e.timestamp.toISOString(),
        })),
        lastSaved: new Date().toISOString(),
      };

      fs.writeFileSync(this.config.persistPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[FeedbackLoop] Failed to save:', error);
    }
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.config.persistPath)) return;

      const data = JSON.parse(fs.readFileSync(this.config.persistPath, 'utf-8'));

      if (data.trackedPRs) {
        for (const [key, pr] of Object.entries(data.trackedPRs)) {
          const submission = pr as any;
          this.trackedPRs.set(key, {
            ...submission,
            submittedAt: new Date(submission.submittedAt),
            mergedAt: submission.mergedAt ? new Date(submission.mergedAt) : undefined,
          });
        }
      }

      if (data.improvementPlans) {
        this.improvementPlans = data.improvementPlans.map((p: any) => ({
          ...p,
          createdAt: new Date(p.createdAt),
          completedAt: p.completedAt ? new Date(p.completedAt) : undefined,
        }));
      }

      if (data.eventLog) {
        this.eventLog = data.eventLog.map((e: any) => ({
          ...e,
          timestamp: new Date(e.timestamp),
        }));
      }

      console.log(`[FeedbackLoop] Loaded ${this.trackedPRs.size} tracked PRs, ${this.improvementPlans.length} improvement plans`);
    } catch (error) {
      console.error('[FeedbackLoop] Failed to load:', error);
    }
  }

  // ===========================================================================
  // Status Report
  // ===========================================================================

  generateStatusReport(): string {
    const lines: string[] = [];
    lines.push('=== FEEDBACK LOOP STATUS ===\n');

    // Running status
    lines.push(`Status: ${this.running ? '🟢 Running' : '🔴 Stopped'}`);
    lines.push('');

    // Tracked PRs
    lines.push(`## Tracked PRs (${this.trackedPRs.size})\n`);
    const recentPRs = [...this.trackedPRs.values()].slice(-5);
    for (const pr of recentPRs) {
      const icon = pr.status === 'merged' ? '✅' : pr.status === 'closed' ? '❌' : '⏳';
      lines.push(`${icon} ${pr.repo}#${pr.prNumber}: ${pr.bountyTitle.slice(0, 50)}`);
    }
    lines.push('');

    // Active improvement plan
    const activePlan = this.getActivePlan();
    if (activePlan) {
      lines.push('## Active Improvement Plan\n');
      lines.push(`Created: ${activePlan.createdAt.toLocaleDateString()}`);
      lines.push(`Actions:`);
      for (const action of activePlan.suggestedActions) {
        const icon = action.completed ? '✅' : '⬜';
        lines.push(`  ${icon} [${action.priority}] ${action.skill}: ${action.description}`);
      }
      lines.push('');
    }

    // Recent events
    lines.push('## Recent Events\n');
    const recentEvents = this.getRecentEvents(5);
    for (const event of recentEvents) {
      lines.push(`- ${event.timestamp.toLocaleTimeString()}: ${event.type} (${event.source})`);
    }

    return lines.join('\n');
  }
}

// ============================================================================
// Singleton
// ============================================================================

let feedbackLoop: FeedbackLoop | null = null;

export function getFeedbackLoop(): FeedbackLoop {
  if (!feedbackLoop) {
    feedbackLoop = new FeedbackLoop();
  }
  return feedbackLoop;
}

export function resetFeedbackLoop(): void {
  if (feedbackLoop) {
    feedbackLoop.stop();
  }
  feedbackLoop = null;
}
