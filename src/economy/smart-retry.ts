/**
 * Smart Retry System v19.5
 *
 * Intelligently retries failed bounty submissions:
 * - Analyzes rejection reasons
 * - Applies targeted fixes
 * - Learns from each retry attempt
 * - Escalates to different strategies
 *
 * This increases success rate by learning from failures.
 *
 * @module economy/smart-retry
 * @version 19.5.0
 */

import { getHybridRouter } from '../llm/router.js';
import { getFeedbackAnalyzer, type FeedbackAnalysis, type FeedbackIssue } from './feedback-analyzer.js';
import { getBountyLearning } from './bounty-learning.js';
import { getRepoStyleLearner } from './repo-style-learner.js';
import { getTestGenerator } from './test-generator.js';
import type { Bounty } from './generators/bounty-hunter.js';
import type { CodeChange, PRSubmission } from './live/pr-pipeline.js';
import type { BountyClassification } from './bounty-intelligence.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface RetryStrategy {
  name: string;
  description: string;
  applicableIssues: FeedbackIssue['type'][];
  priority: number;
  action: 'restyle' | 'add_tests' | 'fix_logic' | 'simplify' | 'expand' | 'rewrite';
}

export interface RetryAttempt {
  attemptNumber: number;
  strategy: RetryStrategy;
  changesApplied: string[];
  success: boolean;
  timestamp: Date;
  feedback?: string;
}

export interface RetryState {
  bountyId: string;
  originalChanges: CodeChange[];
  attempts: RetryAttempt[];
  currentStrategy: number;
  exhausted: boolean;
  lastUpdated: Date;
}

export interface SmartRetryConfig {
  /** Maximum retry attempts per bounty */
  maxRetries: number;
  /** Wait time between retries (ms) */
  retryDelayMs: number;
  /** Enable aggressive fixes on later retries */
  enableAggressiveFixes: boolean;
  /** Persist path for retry state */
  persistPath: string;
}

const DEFAULT_CONFIG: SmartRetryConfig = {
  maxRetries: 3,
  retryDelayMs: 3600000, // 1 hour
  enableAggressiveFixes: true,
  persistPath: '.genesis/smart-retry.json',
};

// ============================================================================
// Retry Strategies (ordered by priority)
// ============================================================================

const RETRY_STRATEGIES: RetryStrategy[] = [
  {
    name: 'style_fix',
    description: 'Apply repository code style',
    applicableIssues: ['code_style', 'documentation'],
    priority: 1,
    action: 'restyle',
  },
  {
    name: 'add_tests',
    description: 'Add missing unit tests',
    applicableIssues: ['missing_tests'],
    priority: 2,
    action: 'add_tests',
  },
  {
    name: 'fix_logic',
    description: 'Fix logic errors and bugs',
    applicableIssues: ['logic_error', 'performance'],
    priority: 3,
    action: 'fix_logic',
  },
  {
    name: 'simplify',
    description: 'Simplify complex code',
    applicableIssues: ['incomplete', 'wrong_approach'],
    priority: 4,
    action: 'simplify',
  },
  {
    name: 'expand',
    description: 'Expand implementation scope',
    applicableIssues: ['scope_mismatch', 'incomplete'],
    priority: 5,
    action: 'expand',
  },
  {
    name: 'rewrite',
    description: 'Full rewrite with different approach',
    applicableIssues: ['wrong_approach', 'security', 'other'],
    priority: 6,
    action: 'rewrite',
  },
];

// ============================================================================
// Smart Retry Engine
// ============================================================================

export class SmartRetryEngine {
  private router = getHybridRouter();
  private feedbackAnalyzer = getFeedbackAnalyzer();
  private learningEngine = getBountyLearning();
  private styleLearner = getRepoStyleLearner();
  private testGenerator = getTestGenerator();
  private config: SmartRetryConfig;

  private retryStates: Map<string, RetryState> = new Map();

  constructor(config?: Partial<SmartRetryConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.load();
  }

  /**
   * Analyze rejection and determine retry strategy
   */
  async analyzeForRetry(
    submission: PRSubmission,
    originalChanges: CodeChange[]
  ): Promise<{
    canRetry: boolean;
    strategy?: RetryStrategy;
    reason: string;
    attemptNumber: number;
  }> {
    const bountyId = submission.bountyId;

    // Get or create retry state
    let state = this.retryStates.get(bountyId);
    if (!state) {
      state = {
        bountyId,
        originalChanges,
        attempts: [],
        currentStrategy: 0,
        exhausted: false,
        lastUpdated: new Date(),
      };
      this.retryStates.set(bountyId, state);
    }

    // Check if exhausted
    if (state.exhausted || state.attempts.length >= this.config.maxRetries) {
      return {
        canRetry: false,
        reason: `Max retries (${this.config.maxRetries}) reached for bounty`,
        attemptNumber: state.attempts.length,
      };
    }

    // Analyze feedback
    const analysis = await this.feedbackAnalyzer.analyzePRFeedback(submission);

    if (analysis.issues.length === 0) {
      return {
        canRetry: false,
        reason: 'No specific issues identified from feedback',
        attemptNumber: state.attempts.length,
      };
    }

    // Find applicable strategy
    const strategy = this.selectStrategy(analysis.issues, state);

    if (!strategy) {
      state.exhausted = true;
      this.save();
      return {
        canRetry: false,
        reason: 'No applicable retry strategy for identified issues',
        attemptNumber: state.attempts.length,
      };
    }

    return {
      canRetry: true,
      strategy,
      reason: `Strategy: ${strategy.name} - ${strategy.description}`,
      attemptNumber: state.attempts.length + 1,
    };
  }

  /**
   * Execute retry with selected strategy
   */
  async executeRetry(
    submission: PRSubmission,
    bounty: Bounty,
    classification: BountyClassification,
    strategy: RetryStrategy
  ): Promise<{
    success: boolean;
    revisedChanges: CodeChange[];
    changesDescription: string;
    error?: string;
  }> {
    const bountyId = submission.bountyId;
    const state = this.retryStates.get(bountyId);

    if (!state) {
      return {
        success: false,
        revisedChanges: [],
        changesDescription: '',
        error: 'No retry state found',
      };
    }

    console.log(`[SmartRetry] Executing ${strategy.name} strategy for ${bountyId}`);

    try {
      let revisedChanges: CodeChange[];

      switch (strategy.action) {
        case 'restyle':
          revisedChanges = await this.applyRestyling(state.originalChanges, submission);
          break;

        case 'add_tests':
          revisedChanges = await this.addTests(state.originalChanges, submission);
          break;

        case 'fix_logic':
          revisedChanges = await this.fixLogic(state.originalChanges, submission, bounty);
          break;

        case 'simplify':
          revisedChanges = await this.simplifyCode(state.originalChanges, submission, bounty);
          break;

        case 'expand':
          revisedChanges = await this.expandImplementation(state.originalChanges, submission, bounty);
          break;

        case 'rewrite':
          revisedChanges = await this.rewriteCode(state.originalChanges, submission, bounty);
          break;

        default:
          return {
            success: false,
            revisedChanges: [],
            changesDescription: '',
            error: `Unknown strategy action: ${strategy.action}`,
          };
      }

      // Record attempt
      const attempt: RetryAttempt = {
        attemptNumber: state.attempts.length + 1,
        strategy,
        changesApplied: revisedChanges.map(c => c.path),
        success: true,
        timestamp: new Date(),
      };
      state.attempts.push(attempt);
      state.lastUpdated = new Date();
      this.save();

      const changesDescription = this.generateRetryDescription(strategy, revisedChanges.length);

      return {
        success: true,
        revisedChanges,
        changesDescription,
      };

    } catch (error) {
      console.error(`[SmartRetry] Strategy ${strategy.name} failed:`, error);

      // Record failed attempt
      state.attempts.push({
        attemptNumber: state.attempts.length + 1,
        strategy,
        changesApplied: [],
        success: false,
        timestamp: new Date(),
        feedback: String(error),
      });
      this.save();

      return {
        success: false,
        revisedChanges: [],
        changesDescription: '',
        error: String(error),
      };
    }
  }

  // ===========================================================================
  // Strategy Implementations
  // ===========================================================================

  private async applyRestyling(
    changes: CodeChange[],
    submission: PRSubmission
  ): Promise<CodeChange[]> {
    const [owner, repo] = submission.repo.split('/');
    const styleProfile = await this.styleLearner.learnStyle(owner, repo);

    const restyled: CodeChange[] = [];
    for (const change of changes) {
      const styledContent = await this.styleLearner.applyStyle(change.content, styleProfile);
      restyled.push({
        ...change,
        content: styledContent,
      });
    }

    return restyled;
  }

  private async addTests(
    changes: CodeChange[],
    submission: PRSubmission
  ): Promise<CodeChange[]> {
    const [owner, repo] = submission.repo.split('/');
    return this.testGenerator.enhanceWithTests(changes, owner, repo);
  }

  private async fixLogic(
    changes: CodeChange[],
    submission: PRSubmission,
    bounty: Bounty
  ): Promise<CodeChange[]> {
    // Get feedback analysis
    const analysis = await this.feedbackAnalyzer.analyzePRFeedback(submission);
    const logicIssues = analysis.issues.filter(i => i.type === 'logic_error' || i.type === 'performance');

    const systemPrompt = `You are a code debugging expert. Fix the logic errors in the given code.

IDENTIFIED ISSUES:
${logicIssues.map(i => `- ${i.description}`).join('\n')}

REQUIREMENTS:
${bounty.description}

RULES:
1. Fix ONLY the identified issues
2. Preserve the overall structure
3. Add comments explaining fixes
4. Ensure correct edge case handling
5. Return ONLY the complete fixed code`;

    const fixed: CodeChange[] = [];
    for (const change of changes) {
      const response = await this.router.execute(
        `Fix logic errors in this code:\n\n\`\`\`\n${change.content}\n\`\`\`\n\nReturn the complete fixed code:`,
        systemPrompt
      );

      let fixedContent = response.content;
      const codeMatch = fixedContent.match(/```(?:\w+)?\s*([\s\S]*?)```/);
      if (codeMatch) {
        fixedContent = codeMatch[1].trim();
      }

      fixed.push({
        ...change,
        content: fixedContent || change.content,
      });
    }

    return fixed;
  }

  private async simplifyCode(
    changes: CodeChange[],
    submission: PRSubmission,
    bounty: Bounty
  ): Promise<CodeChange[]> {
    const systemPrompt = `You are a code simplification expert. Simplify the given code while maintaining functionality.

REQUIREMENTS:
${bounty.description}

RULES:
1. Remove unnecessary complexity
2. Use simpler algorithms where possible
3. Reduce nesting depth
4. Improve readability
5. Keep all required functionality
6. Return ONLY the complete simplified code`;

    const simplified: CodeChange[] = [];
    for (const change of changes) {
      const response = await this.router.execute(
        `Simplify this code while maintaining functionality:\n\n\`\`\`\n${change.content}\n\`\`\`\n\nReturn the complete simplified code:`,
        systemPrompt
      );

      let simplifiedContent = response.content;
      const codeMatch = simplifiedContent.match(/```(?:\w+)?\s*([\s\S]*?)```/);
      if (codeMatch) {
        simplifiedContent = codeMatch[1].trim();
      }

      simplified.push({
        ...change,
        content: simplifiedContent || change.content,
      });
    }

    return simplified;
  }

  private async expandImplementation(
    changes: CodeChange[],
    submission: PRSubmission,
    bounty: Bounty
  ): Promise<CodeChange[]> {
    // Get feedback analysis
    const analysis = await this.feedbackAnalyzer.analyzePRFeedback(submission);
    const scopeIssues = analysis.issues.filter(i => i.type === 'incomplete' || i.type === 'scope_mismatch');

    const systemPrompt = `You are a code completion expert. Expand the implementation to fully meet requirements.

MISSING FUNCTIONALITY:
${scopeIssues.map(i => `- ${i.description}`).join('\n')}

FULL REQUIREMENTS:
${bounty.description}

RULES:
1. Implement ALL missing functionality
2. Ensure complete coverage of requirements
3. Add proper error handling
4. Include edge cases
5. Return ONLY the complete expanded code`;

    const expanded: CodeChange[] = [];
    for (const change of changes) {
      const response = await this.router.execute(
        `Expand this implementation to fully meet requirements:\n\n\`\`\`\n${change.content}\n\`\`\`\n\nReturn the complete expanded code:`,
        systemPrompt
      );

      let expandedContent = response.content;
      const codeMatch = expandedContent.match(/```(?:\w+)?\s*([\s\S]*?)```/);
      if (codeMatch) {
        expandedContent = codeMatch[1].trim();
      }

      expanded.push({
        ...change,
        content: expandedContent || change.content,
      });
    }

    return expanded;
  }

  private async rewriteCode(
    changes: CodeChange[],
    submission: PRSubmission,
    bounty: Bounty
  ): Promise<CodeChange[]> {
    // Get feedback analysis
    const analysis = await this.feedbackAnalyzer.analyzePRFeedback(submission);

    const systemPrompt = `You are an expert developer. Completely rewrite the code using a different, better approach.

PREVIOUS ISSUES:
${analysis.issues.map(i => `- [${i.type}] ${i.description}`).join('\n')}

REQUIREMENTS:
${bounty.description}

RULES:
1. Use a completely different approach
2. Address ALL previous issues
3. Follow best practices
4. Include proper error handling
5. Add clear comments
6. Ensure security
7. Return ONLY the complete rewritten code`;

    const rewritten: CodeChange[] = [];
    for (const change of changes) {
      const response = await this.router.execute(
        `Completely rewrite this code with a better approach:\n\nOriginal code:\n\`\`\`\n${change.content}\n\`\`\`\n\nReturn the complete rewritten code:`,
        systemPrompt
      );

      let rewrittenContent = response.content;
      const codeMatch = rewrittenContent.match(/```(?:\w+)?\s*([\s\S]*?)```/);
      if (codeMatch) {
        rewrittenContent = codeMatch[1].trim();
      }

      rewritten.push({
        ...change,
        content: rewrittenContent || change.content,
      });
    }

    return rewritten;
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private selectStrategy(issues: FeedbackIssue[], state: RetryState): RetryStrategy | null {
    // Get issue types
    const issueTypes = new Set(issues.map(i => i.type));

    // Find applicable strategies that haven't been tried
    const triedStrategies = new Set(state.attempts.map(a => a.strategy.name));

    for (const strategy of RETRY_STRATEGIES) {
      // Skip already tried strategies
      if (triedStrategies.has(strategy.name)) continue;

      // Check if strategy is applicable to any issue
      const isApplicable = strategy.applicableIssues.some(issueType =>
        issueTypes.has(issueType)
      );

      if (isApplicable) {
        return strategy;
      }
    }

    // If aggressive fixes enabled and we have retries left, try rewrite
    if (this.config.enableAggressiveFixes && !triedStrategies.has('rewrite')) {
      return RETRY_STRATEGIES.find(s => s.name === 'rewrite')!;
    }

    return null;
  }

  private generateRetryDescription(strategy: RetryStrategy, fileCount: number): string {
    const lines: string[] = [];
    lines.push('## 🔄 Retry Submission\n');
    lines.push(`Applied strategy: **${strategy.name}**\n`);
    lines.push(`${strategy.description}\n`);
    lines.push(`\n### Changes Made:\n`);
    lines.push(`- Updated ${fileCount} file(s)`);

    switch (strategy.action) {
      case 'restyle':
        lines.push('- Applied repository code style');
        break;
      case 'add_tests':
        lines.push('- Added unit tests');
        break;
      case 'fix_logic':
        lines.push('- Fixed logic errors');
        break;
      case 'simplify':
        lines.push('- Simplified code structure');
        break;
      case 'expand':
        lines.push('- Expanded implementation');
        break;
      case 'rewrite':
        lines.push('- Complete rewrite with new approach');
        break;
    }

    lines.push('\n---');
    lines.push('*This is an automated retry by Genesis AI based on reviewer feedback.*');

    return lines.join('\n');
  }

  // ===========================================================================
  // State Management
  // ===========================================================================

  getRetryState(bountyId: string): RetryState | undefined {
    return this.retryStates.get(bountyId);
  }

  getRetryStats(): {
    totalRetries: number;
    successfulRetries: number;
    exhaustedBounties: number;
  } {
    let totalRetries = 0;
    let successfulRetries = 0;
    let exhaustedBounties = 0;

    for (const state of this.retryStates.values()) {
      totalRetries += state.attempts.length;
      successfulRetries += state.attempts.filter(a => a.success).length;
      if (state.exhausted) exhaustedBounties++;
    }

    return { totalRetries, successfulRetries, exhaustedBounties };
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

      const data: Record<string, any> = {};
      for (const [key, state] of this.retryStates) {
        data[key] = {
          ...state,
          attempts: state.attempts.map(a => ({
            ...a,
            timestamp: a.timestamp.toISOString(),
          })),
          lastUpdated: state.lastUpdated.toISOString(),
        };
      }

      fs.writeFileSync(this.config.persistPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[SmartRetry] Failed to save:', error);
    }
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.config.persistPath)) return;

      const data = JSON.parse(fs.readFileSync(this.config.persistPath, 'utf-8'));

      for (const [key, state] of Object.entries(data)) {
        const s = state as any;
        this.retryStates.set(key, {
          ...s,
          attempts: s.attempts.map((a: any) => ({
            ...a,
            timestamp: new Date(a.timestamp),
          })),
          lastUpdated: new Date(s.lastUpdated),
        });
      }

      console.log(`[SmartRetry] Loaded retry state for ${this.retryStates.size} bounties`);
    } catch (error) {
      console.error('[SmartRetry] Failed to load:', error);
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let smartRetry: SmartRetryEngine | null = null;

export function getSmartRetry(): SmartRetryEngine {
  if (!smartRetry) {
    smartRetry = new SmartRetryEngine();
  }
  return smartRetry;
}

export function resetSmartRetry(): void {
  smartRetry = null;
}
