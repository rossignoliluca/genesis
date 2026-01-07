/**
 * Genesis 4.0 - Critic Agent
 *
 * Analyzes artifacts for problems, finds weaknesses, suggests improvements.
 * The "criticone" that iterates and improves.
 */

import { BaseAgent, registerAgentFactory } from './base-agent.js';
import { MessageBus, messageBus } from './message-bus.js';
import {
  Message,
  MessageType,
  Critique,
  Problem,
  Suggestion,
} from './types.js';
import { randomUUID } from 'crypto';

// ============================================================================
// Critic Agent
// ============================================================================

export class CriticAgent extends BaseAgent {
  // Critique history for learning
  private critiqueHistory: Critique[] = [];

  // Problem patterns to look for
  private problemPatterns: {
    pattern: RegExp | string;
    severity: Problem['severity'];
    category: string;
  }[] = [
    // Code quality
    { pattern: /console\.log/g, severity: 'minor', category: 'code' },
    { pattern: /TODO/g, severity: 'minor', category: 'code' },
    { pattern: /FIXME/g, severity: 'major', category: 'code' },
    { pattern: /any/g, severity: 'minor', category: 'typescript' },
    { pattern: /\/\/ @ts-ignore/g, severity: 'major', category: 'typescript' },

    // Security
    { pattern: /eval\(/g, severity: 'critical', category: 'security' },
    { pattern: /password.*=.*['"]/gi, severity: 'critical', category: 'security' },
    { pattern: /api[_-]?key.*=.*['"]/gi, severity: 'critical', category: 'security' },

    // Performance
    { pattern: /\.forEach\(/g, severity: 'nitpick', category: 'performance' },
    { pattern: /new Array\(/g, severity: 'minor', category: 'performance' },

    // Architecture
    { pattern: 'god class', severity: 'major', category: 'architecture' },
    { pattern: 'circular dependency', severity: 'major', category: 'architecture' },
  ];

  constructor(bus: MessageBus = messageBus) {
    super({ type: 'critic' }, bus);
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  protected getMessageTypes(): MessageType[] {
    return ['CRITIQUE', 'QUERY', 'BUILD_RESULT'];
  }

  async process(message: Message): Promise<Message | null> {
    switch (message.type) {
      case 'CRITIQUE':
        return this.handleCritiqueRequest(message);
      case 'BUILD_RESULT':
        // Auto-critique build results
        return this.handleBuildResult(message);
      case 'QUERY':
        return this.handleQuery(message);
      default:
        return null;
    }
  }

  // ============================================================================
  // Critique Logic
  // ============================================================================

  private async handleCritiqueRequest(message: Message): Promise<Message | null> {
    const { target, content, type } = message.payload;

    const critique = await this.critique(content, target, type);

    this.log(`Critiqued "${target}": ${critique.problems.length} problems, score ${(critique.overallScore * 100).toFixed(0)}%`);

    // Broadcast if critical issues found
    if (critique.problems.some((p) => p.severity === 'critical')) {
      await this.broadcast('ALERT', {
        type: 'critical_issue',
        target,
        problems: critique.problems.filter((p) => p.severity === 'critical'),
      });
    }

    return {
      ...this.createResponse(message, 'RESPONSE', { critique }),
      id: '',
      timestamp: new Date(),
    };
  }

  async critique(
    content: string,
    target: string,
    type: 'code' | 'text' | 'design' | 'plan' = 'code'
  ): Promise<Critique> {
    const problems: Problem[] = [];
    const suggestions: Suggestion[] = [];

    // Pattern-based critique
    if (type === 'code') {
      this.critiqueCode(content, problems);
    }

    // Structure critique
    this.critiqueStructure(content, type, problems);

    // Generate suggestions for each problem
    for (const problem of problems) {
      suggestions.push(this.generateSuggestion(problem, content));
    }

    // Calculate overall score
    const overallScore = this.calculateScore(problems);
    const passesReview = overallScore >= 0.7 && !problems.some((p) => p.severity === 'critical');

    const critique: Critique = {
      target,
      problems,
      suggestions,
      overallScore,
      passesReview,
    };

    this.critiqueHistory.push(critique);

    return critique;
  }

  private critiqueCode(content: string, problems: Problem[]): void {
    for (const { pattern, severity, category } of this.problemPatterns) {
      if (typeof pattern === 'string') {
        if (content.toLowerCase().includes(pattern.toLowerCase())) {
          problems.push({
            id: randomUUID().slice(0, 8),
            severity,
            description: `Found pattern: "${pattern}" (${category})`,
            location: undefined,
          });
        }
      } else {
        const matches = content.match(pattern);
        if (matches && matches.length > 0) {
          problems.push({
            id: randomUUID().slice(0, 8),
            severity,
            description: `Found ${matches.length} occurrences of pattern (${category})`,
            location: undefined,
          });
        }
      }
    }

    // Check code length (very long functions are suspicious)
    const lines = content.split('\n');
    if (lines.length > 200) {
      problems.push({
        id: randomUUID().slice(0, 8),
        severity: 'major',
        description: `File is very long (${lines.length} lines). Consider splitting.`,
      });
    }

    // Check for error handling
    if (content.includes('async') && !content.includes('try') && !content.includes('catch')) {
      problems.push({
        id: randomUUID().slice(0, 8),
        severity: 'major',
        description: 'Async code without error handling (no try/catch)',
      });
    }
  }

  private critiqueStructure(content: string, type: string, problems: Problem[]): void {
    // Empty content
    if (!content || content.trim().length === 0) {
      problems.push({
        id: randomUUID().slice(0, 8),
        severity: 'critical',
        description: 'Content is empty',
      });
      return;
    }

    // Very short content
    if (content.length < 50) {
      problems.push({
        id: randomUUID().slice(0, 8),
        severity: 'minor',
        description: 'Content is very short, might be incomplete',
      });
    }

    // No documentation for code
    if (type === 'code') {
      if (!content.includes('/**') && !content.includes('//')) {
        problems.push({
          id: randomUUID().slice(0, 8),
          severity: 'minor',
          description: 'No comments or documentation found',
        });
      }
    }
  }

  private generateSuggestion(problem: Problem, content: string): Suggestion {
    const suggestionMap: Record<string, string> = {
      'console.log': 'Remove debug logs or use a proper logging library',
      'TODO': 'Address TODO items before shipping',
      'FIXME': 'Fix identified issues',
      'any': 'Replace "any" with proper TypeScript types',
      'ts-ignore': 'Fix type errors instead of ignoring them',
      'eval': 'Use safer alternatives to eval()',
      'password': 'Move secrets to environment variables',
      'api_key': 'Move API keys to environment variables',
      'forEach': 'Consider using for...of for better performance',
      'long': 'Split into smaller, focused modules',
      'error handling': 'Add try/catch blocks for async operations',
      'empty': 'Add content',
      'short': 'Expand with more detail',
      'documentation': 'Add JSDoc comments',
    };

    let suggestion = 'Review and address this issue';

    for (const [key, value] of Object.entries(suggestionMap)) {
      if (problem.description.toLowerCase().includes(key.toLowerCase())) {
        suggestion = value;
        break;
      }
    }

    return {
      problemId: problem.id,
      description: suggestion,
      effort: this.estimateEffort(problem),
      impact: this.estimateImpact(problem),
    };
  }

  private estimateEffort(problem: Problem): 'low' | 'medium' | 'high' {
    switch (problem.severity) {
      case 'nitpick':
      case 'minor':
        return 'low';
      case 'major':
        return 'medium';
      case 'critical':
        return 'high';
    }
  }

  private estimateImpact(problem: Problem): 'low' | 'medium' | 'high' {
    switch (problem.severity) {
      case 'nitpick':
        return 'low';
      case 'minor':
        return 'low';
      case 'major':
        return 'medium';
      case 'critical':
        return 'high';
    }
  }

  private calculateScore(problems: Problem[]): number {
    if (problems.length === 0) return 1.0;

    // Deduct points based on severity
    const deductions: Record<Problem['severity'], number> = {
      nitpick: 0.02,
      minor: 0.05,
      major: 0.15,
      critical: 0.4,
    };

    let score = 1.0;
    for (const problem of problems) {
      score -= deductions[problem.severity];
    }

    return Math.max(0, score);
  }

  // ============================================================================
  // Build Result Handling
  // ============================================================================

  private async handleBuildResult(message: Message): Promise<Message | null> {
    const { artifacts } = message.payload;

    // Auto-critique each artifact
    for (const artifact of artifacts || []) {
      if (artifact.type === 'file' || artifact.type === 'snippet') {
        const critique = await this.critique(artifact.content, artifact.name, 'code');

        if (!critique.passesReview) {
          // Send critique back
          await this.send(message.from, 'CRITIQUE', {
            artifact: artifact.name,
            critique,
          });
        }
      }
    }

    return null;
  }

  // ============================================================================
  // Query
  // ============================================================================

  private async handleQuery(message: Message): Promise<Message | null> {
    const { query } = message.payload;

    if (query === 'stats') {
      return {
        ...this.createResponse(message, 'RESPONSE', this.getStats()),
        id: '',
        timestamp: new Date(),
      };
    }

    if (query === 'patterns') {
      return {
        ...this.createResponse(message, 'RESPONSE', {
          patterns: this.problemPatterns.map((p) => ({
            pattern: p.pattern.toString(),
            severity: p.severity,
            category: p.category,
          })),
        }),
        id: '',
        timestamp: new Date(),
      };
    }

    return null;
  }

  getStats() {
    const critiques = this.critiqueHistory;
    const totalProblems = critiques.reduce((sum, c) => sum + c.problems.length, 0);
    const passRate = critiques.filter((c) => c.passesReview).length / (critiques.length || 1);

    return {
      totalCritiques: critiques.length,
      totalProblems,
      avgProblemsPerCritique: totalProblems / (critiques.length || 1),
      passRate,
      avgScore: critiques.reduce((sum, c) => sum + c.overallScore, 0) / (critiques.length || 1),
    };
  }

  // ============================================================================
  // Public Methods
  // ============================================================================

  addPattern(pattern: RegExp | string, severity: Problem['severity'], category: string): void {
    this.problemPatterns.push({ pattern, severity, category });
  }
}

// ============================================================================
// Register Factory
// ============================================================================

registerAgentFactory('critic', (bus) => new CriticAgent(bus));

export function createCriticAgent(bus?: MessageBus): CriticAgent {
  return new CriticAgent(bus);
}
