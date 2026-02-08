/**
 * Feedback Analyzer v19.3
 *
 * Deep analysis of all feedback sources to become nearly infallible:
 * - GitHub PR review comments (via API)
 * - Email notifications (changes requested, merged, closed)
 * - Bounty platform feedback
 * - Self-review before submission
 *
 * Extracts:
 * - Specific code issues (style, logic, security, performance)
 * - Reviewer sentiment and patterns
 * - Common failure modes
 * - Skill gaps to address
 * - Actionable improvements
 *
 * @module economy/feedback-analyzer
 * @version 19.3.0
 */

import { getMCPClient } from '../mcp/index.js';
import { getBountyLearning, type BountyOutcome, type CausalFactor } from './bounty-learning.js';
import { getEmailMonitor, type EmailNotification } from './live/email-monitor.js';
import type { PRSubmission } from './live/pr-pipeline.js';
import type { Bounty } from './generators/bounty-hunter.js';
import type { BountyClassification } from './bounty-intelligence.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface PRReviewComment {
  id: number;
  author: string;
  body: string;
  path?: string;        // File path if inline comment
  line?: number;        // Line number if inline comment
  createdAt: Date;
  state: 'PENDING' | 'COMMENTED' | 'APPROVED' | 'CHANGES_REQUESTED' | 'DISMISSED';
}

export interface FeedbackIssue {
  type: 'code_style' | 'logic_error' | 'security' | 'performance' | 'missing_tests' |
        'incomplete' | 'wrong_approach' | 'documentation' | 'scope_mismatch' | 'other';
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  description: string;
  file?: string;
  line?: number;
  suggestedFix?: string;
  pattern?: string;      // Regex pattern to detect similar issues
}

export interface FeedbackAnalysis {
  prUrl: string;
  bountyId: string;
  overallSentiment: 'positive' | 'neutral' | 'negative' | 'very_negative';
  issues: FeedbackIssue[];
  positives: string[];
  reviewerPatterns: ReviewerPattern[];
  suggestedImprovements: string[];
  skillGaps: string[];
  shouldRetry: boolean;
  retryStrategy?: string;
}

export interface ReviewerPattern {
  reviewer: string;
  preferences: string[];      // What they care about
  commonRequests: string[];   // What they often ask for
  approvalRate: number;       // Historical approval rate
}

export interface SkillProfile {
  skill: string;
  confidence: number;         // 0-1 current confidence
  successCount: number;
  failureCount: number;
  recentTrend: 'improving' | 'stable' | 'declining';
  lastIssues: string[];       // Recent issues in this skill area
  trainingNeeded: boolean;
}

export interface PreSubmissionCheck {
  name: string;
  passed: boolean;
  score: number;             // 0-100
  issues: string[];
  suggestions: string[];
}

export interface PreSubmissionReport {
  overallScore: number;
  passed: boolean;
  checks: PreSubmissionCheck[];
  blockingIssues: string[];
  warnings: string[];
  recommendations: string[];
}

// ============================================================================
// Feedback Patterns (for NLP extraction)
// ============================================================================

const FEEDBACK_PATTERNS = {
  // Code style issues
  codeStyle: [
    { pattern: /\b(indent|spacing|format|style|lint|prettier|eslint)\b/i, type: 'code_style' as const, severity: 'minor' as const },
    { pattern: /\b(naming|variable name|function name|camelCase|snake_case)\b/i, type: 'code_style' as const, severity: 'minor' as const },
    { pattern: /\b(inconsistent|doesn't match|style guide)\b/i, type: 'code_style' as const, severity: 'minor' as const },
  ],

  // Logic errors
  logicError: [
    { pattern: /\b(bug|error|crash|exception|doesn't work|broken|fails?)\b/i, type: 'logic_error' as const, severity: 'critical' as const },
    { pattern: /\b(wrong|incorrect|invalid|should be|expected|instead of)\b/i, type: 'logic_error' as const, severity: 'major' as const },
    { pattern: /\b(edge case|corner case|off-by-one|boundary)\b/i, type: 'logic_error' as const, severity: 'major' as const },
    { pattern: /\b(null|undefined|NaN|infinity)\b/i, type: 'logic_error' as const, severity: 'major' as const },
  ],

  // Security issues
  security: [
    { pattern: /\b(security|vulnerab|exploit|inject|xss|csrf|sql injection)\b/i, type: 'security' as const, severity: 'critical' as const },
    { pattern: /\b(auth|password|credential|secret|token|api key)\b/i, type: 'security' as const, severity: 'critical' as const },
    { pattern: /\b(sanitiz|escap|validat|untrusted|user input)\b/i, type: 'security' as const, severity: 'major' as const },
  ],

  // Performance issues
  performance: [
    { pattern: /\b(performance|slow|optimi|efficient|O\(n\^?2\)|complexity)\b/i, type: 'performance' as const, severity: 'major' as const },
    { pattern: /\b(memory|leak|cache|memoiz|lazy)\b/i, type: 'performance' as const, severity: 'major' as const },
    { pattern: /\b(loop|iteration|recursive|timeout)\b/i, type: 'performance' as const, severity: 'minor' as const },
  ],

  // Missing tests
  missingTests: [
    { pattern: /\b(test|spec|coverage|unit test|integration test)\b/i, type: 'missing_tests' as const, severity: 'major' as const },
    { pattern: /\b(assert|expect|should|verify)\b/i, type: 'missing_tests' as const, severity: 'minor' as const },
  ],

  // Incomplete solution
  incomplete: [
    { pattern: /\b(incomplete|missing|todo|fixme|not implemented|placeholder)\b/i, type: 'incomplete' as const, severity: 'critical' as const },
    { pattern: /\b(partial|unfinished|needs more|also need)\b/i, type: 'incomplete' as const, severity: 'major' as const },
  ],

  // Wrong approach
  wrongApproach: [
    { pattern: /\b(wrong approach|different approach|should use|better way|instead)\b/i, type: 'wrong_approach' as const, severity: 'major' as const },
    { pattern: /\b(misunderst|didn't understand|not what|requirements?)\b/i, type: 'scope_mismatch' as const, severity: 'critical' as const },
  ],

  // Documentation
  documentation: [
    { pattern: /\b(document|comment|explain|jsdoc|readme|description)\b/i, type: 'documentation' as const, severity: 'minor' as const },
    { pattern: /\b(unclear|confusing|what does|why|how does)\b/i, type: 'documentation' as const, severity: 'minor' as const },
  ],

  // Positive feedback
  positive: [
    { pattern: /\b(good|great|nice|excellent|perfect|well done|lgtm|looks good)\b/i, isPositive: true },
    { pattern: /\b(thank|appreciate|helpful|useful|clean|elegant)\b/i, isPositive: true },
    { pattern: /\b(approved?|merging?|accept)\b/i, isPositive: true },
  ],
};

// ============================================================================
// Feedback Analyzer Class
// ============================================================================

export class FeedbackAnalyzer {
  private mcp = getMCPClient();
  private learningEngine = getBountyLearning();
  private skillProfiles: Map<string, SkillProfile> = new Map();
  private reviewerPatterns: Map<string, ReviewerPattern> = new Map();
  private persistPath: string;

  constructor(persistPath?: string) {
    this.persistPath = persistPath ?? '.genesis/feedback-analysis.json';
    this.load();
  }

  // ===========================================================================
  // GitHub PR Feedback Extraction
  // ===========================================================================

  /**
   * Fetch all review comments from a PR via GitHub API
   */
  async fetchPRComments(owner: string, repo: string, prNumber: number): Promise<PRReviewComment[]> {
    const comments: PRReviewComment[] = [];

    try {
      // Fetch review comments (inline on code)
      const reviewComments = await this.mcp.call('github', 'get_pull_request_comments', {
        owner,
        repo,
        pull_number: prNumber,
      });

      if (reviewComments.success && reviewComments.data) {
        for (const comment of reviewComments.data) {
          comments.push({
            id: comment.id,
            author: comment.user?.login || 'unknown',
            body: comment.body || '',
            path: comment.path,
            line: comment.line || comment.original_line,
            createdAt: new Date(comment.created_at),
            state: 'COMMENTED',
          });
        }
      }

      // Fetch reviews (approve/request changes)
      const reviews = await this.mcp.call('github', 'get_pull_request_reviews', {
        owner,
        repo,
        pull_number: prNumber,
      });

      if (reviews.success && reviews.data) {
        for (const review of reviews.data) {
          if (review.body) {
            comments.push({
              id: review.id,
              author: review.user?.login || 'unknown',
              body: review.body,
              createdAt: new Date(review.submitted_at),
              state: review.state,
            });
          }
        }
      }

      console.log(`[FeedbackAnalyzer] Fetched ${comments.length} comments from PR #${prNumber}`);
    } catch (error) {
      console.error('[FeedbackAnalyzer] Failed to fetch PR comments:', error);
    }

    return comments;
  }

  /**
   * Deep analyze PR feedback
   */
  async analyzePRFeedback(submission: PRSubmission): Promise<FeedbackAnalysis> {
    // Parse repo info
    const [owner, repo] = submission.repo.split('/');
    const prNumber = submission.prNumber;

    // Fetch comments from GitHub
    const comments = await this.fetchPRComments(owner, repo, prNumber);

    // Extract issues from all comments
    const allIssues: FeedbackIssue[] = [];
    const allPositives: string[] = [];
    const reviewerData: Map<string, { comments: string[]; sentiment: number }> = new Map();

    for (const comment of comments) {
      // Analyze each comment
      const issues = this.extractIssuesFromText(comment.body, comment.path, comment.line);
      allIssues.push(...issues);

      // Track positives
      const positives = this.extractPositivesFromText(comment.body);
      allPositives.push(...positives);

      // Track reviewer patterns
      if (!reviewerData.has(comment.author)) {
        reviewerData.set(comment.author, { comments: [], sentiment: 0 });
      }
      const data = reviewerData.get(comment.author)!;
      data.comments.push(comment.body);
      data.sentiment += this.calculateSentiment(comment.body);

      // Update reviewer pattern database
      this.updateReviewerPattern(comment.author, comment.body, comment.state);
    }

    // Calculate overall sentiment
    const overallSentiment = this.calculateOverallSentiment(allIssues, allPositives, submission.status);

    // Extract skill gaps
    const skillGaps = this.extractSkillGaps(allIssues);

    // Generate improvement suggestions
    const suggestedImprovements = this.generateImprovementSuggestions(allIssues, skillGaps);

    // Determine if should retry
    const { shouldRetry, retryStrategy } = this.determineRetryStrategy(allIssues, submission);

    // Get reviewer patterns
    const reviewerPatterns = [...reviewerData.entries()].map(([reviewer]) =>
      this.getReviewerPattern(reviewer)
    ).filter(Boolean) as ReviewerPattern[];

    const analysis: FeedbackAnalysis = {
      prUrl: submission.prUrl,
      bountyId: submission.bountyId,
      overallSentiment,
      issues: allIssues,
      positives: allPositives,
      reviewerPatterns,
      suggestedImprovements,
      skillGaps,
      shouldRetry,
      retryStrategy,
    };

    // Update skill profiles based on analysis
    this.updateSkillProfiles(allIssues, submission.status === 'merged');

    // Persist
    this.save();

    return analysis;
  }

  /**
   * Extract issues from comment text using NLP patterns
   */
  private extractIssuesFromText(text: string, file?: string, line?: number): FeedbackIssue[] {
    const issues: FeedbackIssue[] = [];
    const lowerText = text.toLowerCase();

    // Check all pattern categories
    for (const [category, patterns] of Object.entries(FEEDBACK_PATTERNS)) {
      if (category === 'positive') continue; // Skip positive patterns here

      for (const patternDef of patterns) {
        if ('pattern' in patternDef && 'type' in patternDef && 'severity' in patternDef && patternDef.pattern.test(text)) {
          // Extract the specific sentence that matched
          const sentences = text.split(/[.!?]+/);
          const matchingSentence = sentences.find(s => patternDef.pattern.test(s))?.trim();

          issues.push({
            type: patternDef.type as FeedbackIssue['type'],
            severity: patternDef.severity as FeedbackIssue['severity'],
            description: matchingSentence || text.slice(0, 200),
            file,
            line,
            pattern: patternDef.pattern.source,
          });
          break; // Only one issue per category per comment
        }
      }
    }

    // Extract suggested fixes if present
    const fixPatterns = [
      /should (?:be|use|have) ([^.]+)/i,
      /try ([^.]+)/i,
      /instead[,]? ([^.]+)/i,
      /change (?:this )?to ([^.]+)/i,
      /use ([^.]+) instead/i,
    ];

    for (const issue of issues) {
      for (const pattern of fixPatterns) {
        const match = text.match(pattern);
        if (match) {
          issue.suggestedFix = match[1].trim();
          break;
        }
      }
    }

    return issues;
  }

  /**
   * Extract positive feedback
   */
  private extractPositivesFromText(text: string): string[] {
    const positives: string[] = [];

    for (const patternDef of FEEDBACK_PATTERNS.positive) {
      if ('pattern' in patternDef && patternDef.pattern.test(text)) {
        const sentences = text.split(/[.!?]+/);
        const matchingSentence = sentences.find(s => patternDef.pattern.test(s))?.trim();
        if (matchingSentence && matchingSentence.length > 5) {
          positives.push(matchingSentence);
        }
      }
    }

    return positives;
  }

  /**
   * Calculate sentiment score from text (-1 to 1)
   */
  private calculateSentiment(text: string): number {
    let score = 0;
    const words = text.toLowerCase().split(/\s+/);

    const positiveWords = ['good', 'great', 'nice', 'excellent', 'perfect', 'thanks', 'approve', 'lgtm', 'clean', 'helpful'];
    const negativeWords = ['wrong', 'bad', 'error', 'bug', 'fail', 'reject', 'incorrect', 'missing', 'broken', 'issue'];

    for (const word of words) {
      if (positiveWords.some(p => word.includes(p))) score += 0.2;
      if (negativeWords.some(n => word.includes(n))) score -= 0.2;
    }

    return Math.max(-1, Math.min(1, score));
  }

  /**
   * Calculate overall sentiment
   */
  private calculateOverallSentiment(
    issues: FeedbackIssue[],
    positives: string[],
    status: string
  ): 'positive' | 'neutral' | 'negative' | 'very_negative' {
    if (status === 'merged') return 'positive';

    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const majorCount = issues.filter(i => i.severity === 'major').length;

    if (criticalCount >= 2 || (criticalCount >= 1 && majorCount >= 2)) {
      return 'very_negative';
    }
    if (criticalCount >= 1 || majorCount >= 2) {
      return 'negative';
    }
    if (positives.length > issues.length) {
      return 'positive';
    }
    return 'neutral';
  }

  /**
   * Extract skill gaps from issues
   */
  private extractSkillGaps(issues: FeedbackIssue[]): string[] {
    const gaps = new Set<string>();

    for (const issue of issues) {
      switch (issue.type) {
        case 'code_style':
          gaps.add('code_formatting');
          break;
        case 'logic_error':
          gaps.add('logical_reasoning');
          gaps.add('edge_case_handling');
          break;
        case 'security':
          gaps.add('security_awareness');
          break;
        case 'performance':
          gaps.add('performance_optimization');
          break;
        case 'missing_tests':
          gaps.add('test_writing');
          break;
        case 'incomplete':
          gaps.add('requirement_analysis');
          break;
        case 'wrong_approach':
        case 'scope_mismatch':
          gaps.add('requirement_understanding');
          gaps.add('problem_decomposition');
          break;
        case 'documentation':
          gaps.add('documentation');
          break;
      }
    }

    return Array.from(gaps);
  }

  /**
   * Generate improvement suggestions
   */
  private generateImprovementSuggestions(issues: FeedbackIssue[], skillGaps: string[]): string[] {
    const suggestions: string[] = [];

    // Issue-specific suggestions
    const issueTypes = new Set(issues.map(i => i.type));

    if (issueTypes.has('code_style')) {
      suggestions.push('Run linter/formatter before submission (prettier, eslint)');
      suggestions.push('Match repository code style exactly');
    }
    if (issueTypes.has('logic_error')) {
      suggestions.push('Add more test cases for edge cases');
      suggestions.push('Verify code works with sample inputs before submission');
      suggestions.push('Consider null/undefined handling');
    }
    if (issueTypes.has('security')) {
      suggestions.push('Review OWASP top 10 before security-related code');
      suggestions.push('Validate and sanitize all inputs');
      suggestions.push('Never expose secrets or credentials');
    }
    if (issueTypes.has('missing_tests')) {
      suggestions.push('Always include unit tests with code changes');
      suggestions.push('Aim for at least 80% code coverage');
    }
    if (issueTypes.has('incomplete')) {
      suggestions.push('Re-read requirements before marking complete');
      suggestions.push('Create a checklist from requirements');
    }
    if (issueTypes.has('wrong_approach') || issueTypes.has('scope_mismatch')) {
      suggestions.push('Ask clarifying questions before starting');
      suggestions.push('Review existing codebase patterns first');
    }

    // Skill gap suggestions
    if (skillGaps.includes('requirement_understanding')) {
      suggestions.push('Break down requirements into specific acceptance criteria');
    }
    if (skillGaps.includes('edge_case_handling')) {
      suggestions.push('List possible edge cases before coding');
    }

    return [...new Set(suggestions)];
  }

  /**
   * Determine if we should retry and how
   */
  private determineRetryStrategy(
    issues: FeedbackIssue[],
    submission: PRSubmission
  ): { shouldRetry: boolean; retryStrategy?: string } {
    if (submission.status === 'merged') {
      return { shouldRetry: false };
    }

    if (submission.status === 'closed') {
      const criticalCount = issues.filter(i => i.severity === 'critical').length;
      if (criticalCount >= 2) {
        return { shouldRetry: false }; // Too many critical issues
      }
    }

    const minorOnly = issues.every(i => i.severity === 'minor' || i.severity === 'suggestion');
    if (minorOnly && issues.length <= 3) {
      return {
        shouldRetry: true,
        retryStrategy: 'Address style issues and resubmit',
      };
    }

    const hasLogicError = issues.some(i => i.type === 'logic_error');
    if (hasLogicError && issues.filter(i => i.type === 'logic_error').length <= 2) {
      return {
        shouldRetry: true,
        retryStrategy: 'Fix logic errors using suggested fixes, add tests',
      };
    }

    const hasScopeMismatch = issues.some(i => i.type === 'scope_mismatch' || i.type === 'wrong_approach');
    if (hasScopeMismatch) {
      return {
        shouldRetry: false, // Need to rethink approach
      };
    }

    return { shouldRetry: issues.length <= 5 };
  }

  // ===========================================================================
  // Reviewer Pattern Learning
  // ===========================================================================

  private updateReviewerPattern(reviewer: string, comment: string, state: string): void {
    let pattern = this.reviewerPatterns.get(reviewer);
    if (!pattern) {
      pattern = {
        reviewer,
        preferences: [],
        commonRequests: [],
        approvalRate: 0.5,
      };
      this.reviewerPatterns.set(reviewer, pattern);
    }

    // Extract what they care about
    const issues = this.extractIssuesFromText(comment);
    for (const issue of issues) {
      if (!pattern.preferences.includes(issue.type)) {
        pattern.preferences.push(issue.type);
      }
      if (issue.suggestedFix && !pattern.commonRequests.includes(issue.suggestedFix)) {
        pattern.commonRequests.push(issue.suggestedFix);
      }
    }

    // Update approval rate
    if (state === 'APPROVED') {
      pattern.approvalRate = pattern.approvalRate * 0.9 + 0.1;
    } else if (state === 'CHANGES_REQUESTED') {
      pattern.approvalRate = pattern.approvalRate * 0.9;
    }
  }

  private getReviewerPattern(reviewer: string): ReviewerPattern | null {
    return this.reviewerPatterns.get(reviewer) || null;
  }

  // ===========================================================================
  // Skill Profile Management
  // ===========================================================================

  private updateSkillProfiles(issues: FeedbackIssue[], success: boolean): void {
    const affectedSkills = new Set<string>();

    for (const issue of issues) {
      const skill = this.issueTypeToSkill(issue.type);
      affectedSkills.add(skill);
    }

    for (const skill of affectedSkills) {
      let profile = this.skillProfiles.get(skill);
      if (!profile) {
        profile = {
          skill,
          confidence: 0.5,
          successCount: 0,
          failureCount: 0,
          recentTrend: 'stable',
          lastIssues: [],
          trainingNeeded: false,
        };
        this.skillProfiles.set(skill, profile);
      }

      if (success) {
        profile.successCount++;
        profile.confidence = Math.min(1, profile.confidence + 0.05);
      } else {
        profile.failureCount++;
        profile.confidence = Math.max(0.1, profile.confidence - 0.1);
        profile.lastIssues = issues
          .filter(i => this.issueTypeToSkill(i.type) === skill)
          .map(i => i.description)
          .slice(-5);
      }

      // Calculate trend
      const total = profile.successCount + profile.failureCount;
      const rate = total > 0 ? profile.successCount / total : 0.5;
      if (rate < 0.4) {
        profile.recentTrend = 'declining';
        profile.trainingNeeded = true;
      } else if (rate > 0.7) {
        profile.recentTrend = 'improving';
        profile.trainingNeeded = false;
      } else {
        profile.recentTrend = 'stable';
      }
    }
  }

  private issueTypeToSkill(type: FeedbackIssue['type']): string {
    const mapping: Record<FeedbackIssue['type'], string> = {
      'code_style': 'formatting',
      'logic_error': 'logic',
      'security': 'security',
      'performance': 'optimization',
      'missing_tests': 'testing',
      'incomplete': 'completeness',
      'wrong_approach': 'architecture',
      'documentation': 'documentation',
      'scope_mismatch': 'requirements',
      'other': 'general',
    };
    return mapping[type] || 'general';
  }

  getSkillProfiles(): SkillProfile[] {
    return [...this.skillProfiles.values()];
  }

  getWeakSkills(): SkillProfile[] {
    return this.getSkillProfiles().filter(p => p.trainingNeeded || p.confidence < 0.4);
  }

  // ===========================================================================
  // Pre-Submission Validation
  // ===========================================================================

  /**
   * Run comprehensive pre-submission checks
   */
  async runPreSubmissionChecks(
    code: string,
    filePath: string,
    bounty: Bounty,
    classification: BountyClassification
  ): Promise<PreSubmissionReport> {
    const checks: PreSubmissionCheck[] = [];
    const blockingIssues: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Check 1: No placeholder code
    const placeholderCheck = this.checkForPlaceholders(code);
    checks.push(placeholderCheck);
    if (!placeholderCheck.passed) {
      blockingIssues.push(...placeholderCheck.issues);
    }

    // Check 2: Basic syntax validity
    const syntaxCheck = this.checkSyntax(code, filePath);
    checks.push(syntaxCheck);
    if (!syntaxCheck.passed) {
      blockingIssues.push(...syntaxCheck.issues);
    }

    // Check 3: Security patterns
    const securityCheck = this.checkSecurityPatterns(code);
    checks.push(securityCheck);
    if (securityCheck.score < 70) {
      blockingIssues.push(...securityCheck.issues);
    } else if (securityCheck.score < 90) {
      warnings.push(...securityCheck.issues);
    }

    // Check 4: Code completeness
    const completenessCheck = this.checkCompleteness(code, bounty);
    checks.push(completenessCheck);
    if (!completenessCheck.passed) {
      blockingIssues.push(...completenessCheck.issues);
    }

    // Check 5: Style consistency
    const styleCheck = this.checkStyle(code, filePath);
    checks.push(styleCheck);
    if (styleCheck.score < 60) {
      warnings.push(...styleCheck.issues);
    }

    // Check 6: Self-review (AI reviews its own code)
    const selfReviewCheck = await this.selfReview(code, bounty, classification);
    checks.push(selfReviewCheck);
    if (!selfReviewCheck.passed) {
      warnings.push(...selfReviewCheck.issues);
    }
    recommendations.push(...selfReviewCheck.suggestions);

    // Calculate overall score
    const overallScore = checks.reduce((sum, c) => sum + c.score, 0) / checks.length;
    const passed = blockingIssues.length === 0 && overallScore >= 70;

    return {
      overallScore,
      passed,
      checks,
      blockingIssues,
      warnings,
      recommendations,
    };
  }

  private checkForPlaceholders(code: string): PreSubmissionCheck {
    const issues: string[] = [];
    const patterns = [
      { pattern: /TODO/gi, msg: 'Contains TODO comment' },
      { pattern: /FIXME/gi, msg: 'Contains FIXME comment' },
      { pattern: /NOT\s+IMPLEMENTED/gi, msg: 'Contains "NOT IMPLEMENTED"' },
      { pattern: /PLACEHOLDER/gi, msg: 'Contains PLACEHOLDER' },
      { pattern: /throw new Error\(['"]Not implemented/gi, msg: 'Throws not implemented error' },
      { pattern: /example\.com|placeholder\.com/gi, msg: 'Contains placeholder URL' },
      { pattern: /xxx|yyy|zzz/gi, msg: 'Contains placeholder values (xxx/yyy/zzz)' },
      { pattern: /\.\.\./g, msg: 'Contains ellipsis (incomplete code)' },
    ];

    for (const { pattern, msg } of patterns) {
      if (pattern.test(code)) {
        issues.push(msg);
      }
    }

    const score = Math.max(0, 100 - issues.length * 25);
    return {
      name: 'No Placeholders',
      passed: issues.length === 0,
      score,
      issues,
      suggestions: issues.length > 0 ? ['Replace all placeholders with actual implementation'] : [],
    };
  }

  private checkSyntax(code: string, filePath: string): PreSubmissionCheck {
    const issues: string[] = [];
    const ext = path.extname(filePath).toLowerCase();

    // Basic bracket matching
    const brackets = { '(': 0, '[': 0, '{': 0 };
    for (const char of code) {
      if (char === '(') brackets['(']++;
      if (char === ')') brackets['(']--;
      if (char === '[') brackets['[']++;
      if (char === ']') brackets['[']--;
      if (char === '{') brackets['{']++;
      if (char === '}') brackets['{']--;
    }

    if (brackets['('] !== 0) issues.push('Unmatched parentheses');
    if (brackets['['] !== 0) issues.push('Unmatched brackets');
    if (brackets['{'] !== 0) issues.push('Unmatched braces');

    // TypeScript/JavaScript specific
    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      if (/const \w+ = function\s*\(/.test(code) && !/\breturn\b/.test(code)) {
        // Might be missing return statement
      }
      if (/import .* from ['"]\.{3,}/.test(code)) {
        issues.push('Invalid relative import path');
      }
    }

    const score = Math.max(0, 100 - issues.length * 30);
    return {
      name: 'Syntax Check',
      passed: issues.length === 0,
      score,
      issues,
      suggestions: [],
    };
  }

  private checkSecurityPatterns(code: string): PreSubmissionCheck {
    const issues: string[] = [];
    const suggestions: string[] = [];

    const securityPatterns = [
      { pattern: /eval\s*\(/g, msg: 'Uses eval() - dangerous', severity: 'critical' },
      { pattern: /innerHTML\s*=/g, msg: 'Direct innerHTML assignment (XSS risk)', severity: 'major' },
      { pattern: /document\.write/g, msg: 'Uses document.write', severity: 'major' },
      { pattern: /process\.env\.\w+/g, msg: 'Direct env access (ensure not exposed)', severity: 'minor' },
      { pattern: /exec\s*\(/g, msg: 'Shell exec - ensure sanitized', severity: 'major' },
      { pattern: /password\s*[:=]\s*['"][^'"]+['"]/gi, msg: 'Hardcoded password', severity: 'critical' },
      { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/gi, msg: 'Hardcoded API key', severity: 'critical' },
    ];

    let deductions = 0;
    for (const { pattern, msg, severity } of securityPatterns) {
      if (pattern.test(code)) {
        issues.push(msg);
        deductions += severity === 'critical' ? 40 : severity === 'major' ? 20 : 5;
        suggestions.push(`Review: ${msg}`);
      }
    }

    const score = Math.max(0, 100 - deductions);
    return {
      name: 'Security Patterns',
      passed: score >= 70,
      score,
      issues,
      suggestions,
    };
  }

  private checkCompleteness(code: string, bounty: Bounty): PreSubmissionCheck {
    const issues: string[] = [];
    const description = bounty.description.toLowerCase();

    // Check if key requirements mentioned in description are addressed
    const requirementKeywords = [
      'must', 'should', 'need', 'require', 'implement', 'add', 'create', 'fix',
    ];

    const sentences = description.split(/[.!?]+/);
    for (const sentence of sentences) {
      const hasRequirement = requirementKeywords.some(k => sentence.includes(k));
      if (hasRequirement) {
        // Extract what needs to be done
        const actionMatch = sentence.match(/(?:must|should|need to|require)\s+(\w+\s+\w+)/);
        if (actionMatch) {
          // Very basic check - just warn if code is short
          if (code.length < 100) {
            issues.push(`Code may be too short for requirement: "${sentence.slice(0, 50)}..."`);
          }
        }
      }
    }

    // Check for empty functions
    if (/function\s+\w+\s*\([^)]*\)\s*\{\s*\}/g.test(code)) {
      issues.push('Contains empty function body');
    }

    const score = Math.max(0, 100 - issues.length * 20);
    return {
      name: 'Completeness',
      passed: issues.length === 0,
      score,
      issues,
      suggestions: issues.length > 0 ? ['Ensure all requirements are implemented'] : [],
    };
  }

  private checkStyle(code: string, filePath: string): PreSubmissionCheck {
    const issues: string[] = [];
    const lines = code.split('\n');

    // Check line length
    const longLines = lines.filter(l => l.length > 120);
    if (longLines.length > 3) {
      issues.push(`${longLines.length} lines exceed 120 characters`);
    }

    // Check for console.log in production code
    if (!filePath.includes('test') && !filePath.includes('debug')) {
      const consoleLogs = (code.match(/console\.log/g) || []).length;
      if (consoleLogs > 2) {
        issues.push(`${consoleLogs} console.log statements (remove for production)`);
      }
    }

    // Check indentation consistency
    const indentations = lines
      .filter(l => l.trim().length > 0)
      .map(l => {
        const match = l.match(/^(\s*)/);
        return match ? match[1].length : 0;
      });
    const hasSpaces = indentations.some(i => i % 2 === 0 && i > 0);
    const hasTabs = code.includes('\t');
    if (hasSpaces && hasTabs) {
      issues.push('Mixed tabs and spaces for indentation');
    }

    const score = Math.max(0, 100 - issues.length * 15);
    return {
      name: 'Style Check',
      passed: score >= 70,
      score,
      issues,
      suggestions: issues,
    };
  }

  private async selfReview(
    code: string,
    bounty: Bounty,
    classification: BountyClassification
  ): Promise<PreSubmissionCheck> {
    // AI self-review - check against known weak areas
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check against our weak skills
    const weakSkills = this.getWeakSkills();
    for (const skill of weakSkills) {
      if (skill.skill === 'testing' && !code.includes('test') && !code.includes('spec')) {
        issues.push('No tests included (we have weak testing skills)');
        suggestions.push('Add unit tests to improve our testing track record');
      }
      if (skill.skill === 'security' && classification.type !== 'documentation') {
        suggestions.push('Double-check security implications (weak area)');
      }
      if (skill.skill === 'requirements' && skill.lastIssues.length > 0) {
        suggestions.push(`Review requirements carefully - recent issues: ${skill.lastIssues[0]?.slice(0, 50)}`);
      }
    }

    // Check against classification risks
    if (classification.riskFactors.length > 0) {
      for (const risk of classification.riskFactors) {
        suggestions.push(`Risk factor present: ${risk} - verify addressed`);
      }
    }

    const score = Math.max(50, 100 - issues.length * 20);
    return {
      name: 'Self Review',
      passed: issues.length === 0,
      score,
      issues,
      suggestions,
    };
  }

  // ===========================================================================
  // Email Integration
  // ===========================================================================

  /**
   * Process email notification and update learning
   */
  async processEmailNotification(notification: EmailNotification): Promise<void> {
    console.log(`[FeedbackAnalyzer] Processing email: ${notification.type} - ${notification.subject}`);

    switch (notification.type) {
      case 'pr_merged':
        if (notification.repo && notification.prNumber) {
          // Record success in learning engine
          console.log(`[FeedbackAnalyzer] PR merged: ${notification.prUrl}`);
          // The learning engine will be updated via the regular PR checking flow
        }
        break;

      case 'pr_closed':
        if (notification.repo && notification.prNumber) {
          // Fetch and analyze why it was closed
          const [owner, repo] = notification.repo.split('/');
          if (owner && repo) {
            const comments = await this.fetchPRComments(owner, repo, notification.prNumber);
            if (comments.length > 0) {
              const issues = comments.flatMap(c => this.extractIssuesFromText(c.body));
              console.log(`[FeedbackAnalyzer] PR closed with ${issues.length} issues found`);
              // Update skill profiles
              this.updateSkillProfiles(issues, false);
            }
          }
        }
        break;

      case 'pr_changes':
        if (notification.repo && notification.prNumber) {
          // Fetch the change requests
          const [owner, repo] = notification.repo.split('/');
          if (owner && repo) {
            const comments = await this.fetchPRComments(owner, repo, notification.prNumber);
            console.log(`[FeedbackAnalyzer] Changes requested - analyzing ${comments.length} comments`);
            // This is valuable feedback - analyze deeply
            for (const comment of comments) {
              const issues = this.extractIssuesFromText(comment.body);
              if (issues.length > 0) {
                console.log(`[FeedbackAnalyzer] Issues found: ${issues.map(i => i.type).join(', ')}`);
              }
            }
          }
        }
        break;

      case 'bounty_paid':
        if (notification.amount) {
          console.log(`[FeedbackAnalyzer] Bounty paid: $${notification.amount}`);
          // This is a strong positive signal
        }
        break;
    }

    this.save();
  }

  /**
   * Start listening to email notifications
   */
  startEmailIntegration(): void {
    const monitor = getEmailMonitor();
    if (!monitor) {
      console.log('[FeedbackAnalyzer] Email monitor not configured');
      return;
    }

    monitor.on('notification', (notification: EmailNotification) => {
      this.processEmailNotification(notification).catch(err => {
        console.error('[FeedbackAnalyzer] Failed to process email:', err);
      });
    });

    console.log('[FeedbackAnalyzer] Email integration started');
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
        skillProfiles: Object.fromEntries(this.skillProfiles),
        reviewerPatterns: Object.fromEntries(
          [...this.reviewerPatterns.entries()].map(([k, v]) => [k, v])
        ),
        lastUpdated: new Date().toISOString(),
      };

      fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[FeedbackAnalyzer] Failed to save:', error);
    }
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.persistPath)) return;

      const data = JSON.parse(fs.readFileSync(this.persistPath, 'utf-8'));

      if (data.skillProfiles) {
        for (const [skill, profile] of Object.entries(data.skillProfiles)) {
          this.skillProfiles.set(skill, profile as SkillProfile);
        }
      }

      if (data.reviewerPatterns) {
        for (const [reviewer, pattern] of Object.entries(data.reviewerPatterns)) {
          this.reviewerPatterns.set(reviewer, pattern as ReviewerPattern);
        }
      }

      console.log(`[FeedbackAnalyzer] Loaded ${this.skillProfiles.size} skill profiles`);
    } catch (error) {
      console.error('[FeedbackAnalyzer] Failed to load:', error);
    }
  }

  // ===========================================================================
  // Reporting
  // ===========================================================================

  generateImprovementReport(): string {
    const lines: string[] = [];
    lines.push('=== GENESIS IMPROVEMENT REPORT ===\n');

    // Weak skills
    const weakSkills = this.getWeakSkills();
    if (weakSkills.length > 0) {
      lines.push('## Skills Needing Improvement\n');
      for (const skill of weakSkills) {
        const rate = skill.successCount / Math.max(1, skill.successCount + skill.failureCount);
        lines.push(`- ${skill.skill}: ${(rate * 100).toFixed(0)}% success (${skill.recentTrend})`);
        if (skill.lastIssues.length > 0) {
          lines.push(`  Last issue: ${skill.lastIssues[0]?.slice(0, 80)}`);
        }
      }
      lines.push('');
    }

    // All skills
    lines.push('## All Skill Profiles\n');
    const allSkills = this.getSkillProfiles().sort((a, b) => a.confidence - b.confidence);
    for (const skill of allSkills) {
      const rate = skill.successCount / Math.max(1, skill.successCount + skill.failureCount);
      const status = skill.trainingNeeded ? '⚠️' : skill.confidence > 0.7 ? '✅' : '➖';
      lines.push(`${status} ${skill.skill}: ${(skill.confidence * 100).toFixed(0)}% confidence, ${(rate * 100).toFixed(0)}% success`);
    }
    lines.push('');

    // Reviewer patterns
    if (this.reviewerPatterns.size > 0) {
      lines.push('## Reviewer Patterns Learned\n');
      for (const [reviewer, pattern] of this.reviewerPatterns) {
        lines.push(`- ${reviewer}:`);
        lines.push(`  Cares about: ${pattern.preferences.slice(0, 3).join(', ')}`);
        lines.push(`  Approval rate: ${(pattern.approvalRate * 100).toFixed(0)}%`);
      }
    }

    return lines.join('\n');
  }
}

// ============================================================================
// Singleton
// ============================================================================

let feedbackAnalyzer: FeedbackAnalyzer | null = null;

export function getFeedbackAnalyzer(): FeedbackAnalyzer {
  if (!feedbackAnalyzer) {
    feedbackAnalyzer = new FeedbackAnalyzer();
  }
  return feedbackAnalyzer;
}

export function resetFeedbackAnalyzer(): void {
  feedbackAnalyzer = null;
}
