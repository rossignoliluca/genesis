/**
 * Commit Optimizer v19.6
 *
 * Optimizes commit messages to match repository conventions:
 * - Analyzes existing commit history
 * - Learns commit message patterns
 * - Generates compliant commit messages
 * - Validates against conventional commits
 *
 * This ensures commits follow repo standards.
 *
 * @module economy/commit-optimizer
 * @version 19.6.0
 */

import { getMCPClient } from '../mcp/index.js';
import { getHybridRouter } from '../llm/router.js';
import type { CodeChange } from './live/pr-pipeline.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface CommitStyle {
  // Message format
  format: {
    type: 'conventional' | 'angular' | 'simple' | 'emoji' | 'custom';
    hasScope: boolean;
    hasBody: boolean;
    hasFooter: boolean;
    maxSubjectLength: number;
    usesImperative: boolean;
  };

  // Common patterns
  patterns: {
    types: string[];  // feat, fix, docs, etc.
    scopes: string[];  // common scopes
    prefixes: string[];  // emoji or other prefixes
    examples: string[];
  };

  // Validation
  validation: {
    requiresType: boolean;
    requiresScope: boolean;
    requiresIssueRef: boolean;
    forbiddenPatterns: string[];
  };

  confidence: number;
  sampledCommits: number;
  lastUpdated: Date;
}

export interface OptimizedCommit {
  subject: string;
  body?: string;
  footer?: string;
  type?: string;
  scope?: string;
  breaking?: boolean;
  issueRefs?: string[];
}

// ============================================================================
// Default Style
// ============================================================================

const DEFAULT_STYLE: CommitStyle = {
  format: {
    type: 'conventional',
    hasScope: true,
    hasBody: true,
    hasFooter: false,
    maxSubjectLength: 72,
    usesImperative: true,
  },
  patterns: {
    types: ['feat', 'fix', 'docs', 'style', 'refactor', 'test', 'chore'],
    scopes: [],
    prefixes: [],
    examples: [],
  },
  validation: {
    requiresType: false,
    requiresScope: false,
    requiresIssueRef: false,
    forbiddenPatterns: ['WIP', 'wip', 'TODO', 'FIXME'],
  },
  confidence: 0.5,
  sampledCommits: 0,
  lastUpdated: new Date(),
};

// ============================================================================
// Commit Optimizer
// ============================================================================

export class CommitOptimizer {
  private mcp = getMCPClient();
  private router = getHybridRouter();
  private styleCache: Map<string, CommitStyle> = new Map();
  private persistPath: string;

  constructor(persistPath?: string) {
    this.persistPath = persistPath ?? '.genesis/commit-styles.json';
    this.load();
  }

  /**
   * Learn commit style from repository history
   */
  async learnStyle(owner: string, repo: string): Promise<CommitStyle> {
    const cacheKey = `${owner}/${repo}`;

    // Check cache
    const cached = this.styleCache.get(cacheKey);
    if (cached && Date.now() - cached.lastUpdated.getTime() < 7 * 24 * 60 * 60 * 1000) {
      return cached;
    }

    console.log(`[CommitOptimizer] Learning commit style for ${cacheKey}...`);

    const style = { ...DEFAULT_STYLE };
    style.lastUpdated = new Date();

    try {
      // Fetch recent commits
      const commits = await this.mcp.call('github', 'list_commits', {
        owner,
        repo,
        per_page: 50,
      });

      if (!commits?.data || commits.data.length === 0) {
        return style;
      }

      const messages: string[] = commits.data
        .map((c: any) => c.commit?.message)
        .filter((m: string) => m && m.length > 0);

      style.sampledCommits = messages.length;

      // Analyze format
      this.analyzeFormat(style, messages);

      // Extract patterns
      this.extractPatterns(style, messages);

      // Validate rules
      this.detectValidationRules(style, messages);

      // Store examples
      style.patterns.examples = messages.slice(0, 5);

      style.confidence = Math.min(0.95, 0.5 + (messages.length * 0.01));

      this.styleCache.set(cacheKey, style);
      this.save();

      console.log(`[CommitOptimizer] Learned style: ${style.format.type} (${(style.confidence * 100).toFixed(0)}% confidence)`);

    } catch (error) {
      console.warn(`[CommitOptimizer] Failed to learn style for ${cacheKey}:`, error);
    }

    return style;
  }

  /**
   * Analyze commit message format
   */
  private analyzeFormat(style: CommitStyle, messages: string[]): void {
    let conventionalCount = 0;
    let emojiCount = 0;
    let simpleCount = 0;
    let hasBodyCount = 0;
    let hasFooterCount = 0;
    let imperativeCount = 0;
    const subjectLengths: number[] = [];

    for (const message of messages) {
      const lines = message.split('\n');
      const subject = lines[0];
      subjectLengths.push(subject.length);

      // Check for conventional commits pattern
      if (/^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\(.+\))?!?:/.test(subject)) {
        conventionalCount++;
      }

      // Check for emoji prefix
      if (/^[🎉🐛📝✨🔧💄🚀🔥⚡️♻️🎨📦🔒⬆️⬇️🏷️]/u.test(subject)) {
        emojiCount++;
      }

      // Check for simple format (no type prefix)
      if (/^[A-Z][a-z]/.test(subject) && !subject.includes(':')) {
        simpleCount++;
      }

      // Check for body
      if (lines.length > 2 && lines[1] === '' && lines[2].length > 0) {
        hasBodyCount++;
      }

      // Check for footer (Breaking, Closes, etc.)
      if (/\n(BREAKING CHANGE|Closes|Fixes|Refs?):/i.test(message)) {
        hasFooterCount++;
      }

      // Check for imperative mood
      if (/^(Add|Fix|Update|Remove|Implement|Refactor|Create|Delete|Change|Improve)/i.test(subject.replace(/^[^\s]+:\s*/, ''))) {
        imperativeCount++;
      }
    }

    // Determine format type
    const total = messages.length;
    if (conventionalCount / total > 0.5) {
      style.format.type = 'conventional';
    } else if (emojiCount / total > 0.5) {
      style.format.type = 'emoji';
    } else if (simpleCount / total > 0.5) {
      style.format.type = 'simple';
    }

    style.format.hasBody = hasBodyCount / total > 0.3;
    style.format.hasFooter = hasFooterCount / total > 0.2;
    style.format.usesImperative = imperativeCount / total > 0.5;

    // Calculate average subject length
    if (subjectLengths.length > 0) {
      const avgLength = subjectLengths.reduce((a, b) => a + b, 0) / subjectLengths.length;
      style.format.maxSubjectLength = Math.min(100, Math.max(50, Math.round(avgLength * 1.2)));
    }
  }

  /**
   * Extract common patterns from commits
   */
  private extractPatterns(style: CommitStyle, messages: string[]): void {
    const types: Record<string, number> = {};
    const scopes: Record<string, number> = {};
    const prefixes: Record<string, number> = {};

    for (const message of messages) {
      const subject = message.split('\n')[0];

      // Extract type
      const typeMatch = subject.match(/^(\w+)(\(.+\))?:/);
      if (typeMatch) {
        types[typeMatch[1]] = (types[typeMatch[1]] || 0) + 1;
      }

      // Extract scope
      const scopeMatch = subject.match(/^\w+\(([^)]+)\):/);
      if (scopeMatch) {
        scopes[scopeMatch[1]] = (scopes[scopeMatch[1]] || 0) + 1;
      }

      // Extract emoji prefix
      const emojiMatch = subject.match(/^([🎉🐛📝✨🔧💄🚀🔥⚡️♻️🎨📦🔒⬆️⬇️🏷️]+)/u);
      if (emojiMatch) {
        prefixes[emojiMatch[1]] = (prefixes[emojiMatch[1]] || 0) + 1;
      }
    }

    // Sort by frequency and take top items
    style.patterns.types = Object.entries(types)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([t]) => t);

    style.patterns.scopes = Object.entries(scopes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([s]) => s);

    style.patterns.prefixes = Object.entries(prefixes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([p]) => p);

    style.format.hasScope = style.patterns.scopes.length > 0;
  }

  /**
   * Detect validation rules from commit patterns
   */
  private detectValidationRules(style: CommitStyle, messages: string[]): void {
    let withType = 0;
    let withScope = 0;
    let withIssueRef = 0;

    for (const message of messages) {
      const subject = message.split('\n')[0];

      if (/^\w+(\(.+\))?:/.test(subject)) withType++;
      if (/^\w+\([^)]+\):/.test(subject)) withScope++;
      if (/#\d+/.test(message)) withIssueRef++;
    }

    const total = messages.length;
    style.validation.requiresType = withType / total > 0.8;
    style.validation.requiresScope = withScope / total > 0.5;
    style.validation.requiresIssueRef = withIssueRef / total > 0.5;
  }

  /**
   * Generate an optimized commit message
   */
  async generateCommit(
    changes: CodeChange[],
    description: string,
    style: CommitStyle,
    issueNumber?: number
  ): Promise<OptimizedCommit> {
    console.log(`[CommitOptimizer] Generating ${style.format.type} commit...`);

    const changesPreview = changes.map(c => `${c.operation}: ${c.path}`).join('\n');

    const systemPrompt = `Generate a commit message matching this repository's style.

STYLE: ${style.format.type}
${style.format.hasScope ? 'SCOPES USED: ' + style.patterns.scopes.join(', ') : ''}
TYPES USED: ${style.patterns.types.join(', ')}
MAX SUBJECT LENGTH: ${style.format.maxSubjectLength}
${style.format.usesImperative ? 'USE IMPERATIVE MOOD (Add, Fix, Update, not Added, Fixed, Updated)' : ''}
${style.format.hasBody ? 'INCLUDE BODY: Yes' : ''}

EXAMPLES FROM THIS REPO:
${style.patterns.examples.slice(0, 3).join('\n---\n')}

REQUIREMENTS:
1. Match the exact style pattern
2. Keep subject under ${style.format.maxSubjectLength} chars
3. Be specific and clear
${issueNumber ? `4. Reference issue #${issueNumber}` : ''}

Return JSON:
{
  "subject": "commit subject line",
  "body": "optional body",
  "type": "feat|fix|etc",
  "scope": "optional scope",
  "issueRefs": ["#123"]
}`;

    try {
      const response = await this.router.execute(
        `Generate commit for:\n\nChanges:\n${changesPreview}\n\nDescription: ${description}`,
        systemPrompt
      );

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Validate and fix subject length
        let subject = parsed.subject || description.slice(0, 50);
        if (subject.length > style.format.maxSubjectLength) {
          subject = subject.slice(0, style.format.maxSubjectLength - 3) + '...';
        }

        return {
          subject,
          body: style.format.hasBody ? parsed.body : undefined,
          footer: parsed.footer,
          type: parsed.type,
          scope: parsed.scope,
          breaking: parsed.breaking,
          issueRefs: parsed.issueRefs || (issueNumber ? [`#${issueNumber}`] : undefined),
        };
      }
    } catch (error) {
      console.error('[CommitOptimizer] Failed to generate commit:', error);
    }

    // Fallback to simple commit
    return this.generateSimpleCommit(description, style, issueNumber);
  }

  /**
   * Generate a simple fallback commit
   */
  private generateSimpleCommit(
    description: string,
    style: CommitStyle,
    issueNumber?: number
  ): OptimizedCommit {
    let subject = description.slice(0, 50);

    // Add type prefix if conventional
    if (style.format.type === 'conventional' && style.patterns.types.length > 0) {
      const type = this.inferType(description, style.patterns.types);
      subject = `${type}: ${subject.slice(0, 50 - type.length - 2)}`;
    }

    // Add emoji if emoji style
    if (style.format.type === 'emoji' && style.patterns.prefixes.length > 0) {
      subject = `${style.patterns.prefixes[0]} ${subject}`;
    }

    return {
      subject,
      issueRefs: issueNumber ? [`#${issueNumber}`] : undefined,
    };
  }

  /**
   * Infer commit type from description
   */
  private inferType(description: string, types: string[]): string {
    const lower = description.toLowerCase();

    if (lower.includes('fix') || lower.includes('bug')) return 'fix';
    if (lower.includes('add') || lower.includes('new') || lower.includes('feature')) return 'feat';
    if (lower.includes('doc') || lower.includes('readme')) return 'docs';
    if (lower.includes('test')) return 'test';
    if (lower.includes('refactor') || lower.includes('clean')) return 'refactor';
    if (lower.includes('style') || lower.includes('format')) return 'style';
    if (lower.includes('build') || lower.includes('ci')) return 'build';

    return types[0] || 'feat';
  }

  /**
   * Format a commit message
   */
  formatCommit(commit: OptimizedCommit, style: CommitStyle): string {
    const lines: string[] = [];

    // Subject line
    let subject = commit.subject;

    // Add type/scope for conventional
    if (style.format.type === 'conventional' && commit.type) {
      if (commit.scope) {
        subject = `${commit.type}(${commit.scope})${commit.breaking ? '!' : ''}: ${commit.subject}`;
      } else {
        subject = `${commit.type}${commit.breaking ? '!' : ''}: ${commit.subject}`;
      }
    }

    lines.push(subject);

    // Body
    if (commit.body) {
      lines.push('');
      lines.push(commit.body);
    }

    // Footer
    if (commit.footer) {
      lines.push('');
      lines.push(commit.footer);
    }

    // Issue refs
    if (commit.issueRefs && commit.issueRefs.length > 0) {
      lines.push('');
      lines.push(`Closes ${commit.issueRefs.join(', ')}`);
    }

    // Breaking change
    if (commit.breaking) {
      lines.push('');
      lines.push('BREAKING CHANGE: This commit introduces breaking changes.');
    }

    return lines.join('\n');
  }

  /**
   * Validate a commit message against style
   */
  validateCommit(message: string, style: CommitStyle): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    const subject = message.split('\n')[0];

    // Check length
    if (subject.length > style.format.maxSubjectLength) {
      issues.push(`Subject too long: ${subject.length}/${style.format.maxSubjectLength}`);
    }

    // Check type requirement
    if (style.validation.requiresType) {
      if (!/^\w+(\(.+\))?:/.test(subject)) {
        issues.push('Missing type prefix (e.g., feat:, fix:)');
      }
    }

    // Check scope requirement
    if (style.validation.requiresScope) {
      if (!/^\w+\([^)]+\):/.test(subject)) {
        issues.push('Missing scope (e.g., feat(api):)');
      }
    }

    // Check issue reference
    if (style.validation.requiresIssueRef) {
      if (!/#\d+/.test(message)) {
        issues.push('Missing issue reference (e.g., #123)');
      }
    }

    // Check forbidden patterns
    for (const pattern of style.validation.forbiddenPatterns) {
      if (message.includes(pattern)) {
        issues.push(`Contains forbidden pattern: "${pattern}"`);
      }
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Get style guide for a repository
   */
  getStyleGuide(style: CommitStyle): string {
    const lines: string[] = [];

    lines.push('# Commit Message Style Guide\n');

    lines.push(`Format: **${style.format.type}**\n`);

    if (style.patterns.types.length > 0) {
      lines.push('## Types');
      for (const type of style.patterns.types) {
        lines.push(`- \`${type}\``);
      }
      lines.push('');
    }

    if (style.patterns.scopes.length > 0) {
      lines.push('## Scopes');
      for (const scope of style.patterns.scopes) {
        lines.push(`- \`${scope}\``);
      }
      lines.push('');
    }

    lines.push('## Rules');
    lines.push(`- Max subject length: ${style.format.maxSubjectLength} chars`);
    if (style.format.usesImperative) lines.push('- Use imperative mood');
    if (style.format.hasBody) lines.push('- Include body for details');
    if (style.validation.requiresIssueRef) lines.push('- Reference issue number');
    lines.push('');

    if (style.patterns.examples.length > 0) {
      lines.push('## Examples');
      for (const example of style.patterns.examples.slice(0, 3)) {
        lines.push('```');
        lines.push(example.split('\n')[0]);
        lines.push('```');
      }
    }

    return lines.join('\n');
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

      const data: Record<string, any> = {};
      for (const [key, style] of this.styleCache) {
        data[key] = {
          ...style,
          lastUpdated: style.lastUpdated.toISOString(),
        };
      }

      fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[CommitOptimizer] Failed to save:', error);
    }
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.persistPath)) return;

      const data = JSON.parse(fs.readFileSync(this.persistPath, 'utf-8'));

      for (const [key, style] of Object.entries(data)) {
        const s = style as any;
        this.styleCache.set(key, {
          ...s,
          lastUpdated: new Date(s.lastUpdated),
        });
      }

      console.log(`[CommitOptimizer] Loaded ${this.styleCache.size} commit styles`);
    } catch (error) {
      console.error('[CommitOptimizer] Failed to load:', error);
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let optimizer: CommitOptimizer | null = null;

export function getCommitOptimizer(): CommitOptimizer {
  if (!optimizer) {
    optimizer = new CommitOptimizer();
  }
  return optimizer;
}

export function resetCommitOptimizer(): void {
  optimizer = null;
}
