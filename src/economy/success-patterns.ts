/**
 * Success Pattern Miner v19.5
 *
 * Extracts patterns from successful PR submissions:
 * - Analyzes merged PRs to identify success factors
 * - Builds knowledge base of what works
 * - Applies patterns to new submissions
 * - Tracks pattern effectiveness over time
 *
 * This learns from successes to improve future submissions.
 *
 * @module economy/success-patterns
 * @version 19.5.0
 */

import { getMCPClient } from '../mcp/index.js';
import { getHybridRouter } from '../llm/router.js';
import type { PRSubmission, CodeChange } from './live/pr-pipeline.js';
import type { Bounty } from './generators/bounty-hunter.js';
import type { BountyClassification } from './bounty-intelligence.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface SuccessPattern {
  id: string;
  name: string;
  description: string;
  category: 'structure' | 'style' | 'approach' | 'communication' | 'testing';
  confidence: number;
  examples: PatternExample[];
  conditions: PatternCondition[];
  effectiveness: {
    timesApplied: number;
    timesSuccessful: number;
    successRate: number;
  };
  createdAt: Date;
  lastUpdated: Date;
}

export interface PatternExample {
  prUrl: string;
  repo: string;
  bountyType: string;
  codeSnippet?: string;
  prDescription?: string;
}

export interface PatternCondition {
  field: 'bountyType' | 'difficulty' | 'platform' | 'language' | 'category';
  operator: 'equals' | 'contains' | 'in';
  value: string | string[];
}

export interface PatternMatch {
  pattern: SuccessPattern;
  matchScore: number;
  applicableAdvice: string[];
}

export interface SuccessAnalysis {
  prUrl: string;
  repo: string;
  bountyType: string;
  successFactors: string[];
  codePatterns: string[];
  communicationPatterns: string[];
  structurePatterns: string[];
}

// ============================================================================
// Default Patterns (Bootstrap)
// ============================================================================

const BOOTSTRAP_PATTERNS: Partial<SuccessPattern>[] = [
  {
    id: 'clear-pr-description',
    name: 'Clear PR Description',
    description: 'PRs with clear, structured descriptions are more likely to be merged',
    category: 'communication',
    confidence: 0.8,
    conditions: [],
    examples: [],
  },
  {
    id: 'include-tests',
    name: 'Include Tests',
    description: 'PRs that include tests have higher merge rates',
    category: 'testing',
    confidence: 0.85,
    conditions: [],
    examples: [],
  },
  {
    id: 'small-focused-changes',
    name: 'Small Focused Changes',
    description: 'PRs with fewer, focused changes are easier to review and merge',
    category: 'structure',
    confidence: 0.75,
    conditions: [],
    examples: [],
  },
  {
    id: 'match-repo-style',
    name: 'Match Repository Style',
    description: 'Code that matches existing repo style is more accepted',
    category: 'style',
    confidence: 0.9,
    conditions: [],
    examples: [],
  },
  {
    id: 'address-requirements',
    name: 'Address All Requirements',
    description: 'PRs that fully address bounty requirements succeed more often',
    category: 'approach',
    confidence: 0.95,
    conditions: [],
    examples: [],
  },
];

// ============================================================================
// Success Pattern Miner
// ============================================================================

export class SuccessPatternMiner {
  private mcp = getMCPClient();
  private router = getHybridRouter();
  private patterns: Map<string, SuccessPattern> = new Map();
  private persistPath: string;

  constructor(persistPath?: string) {
    this.persistPath = persistPath ?? '.genesis/success-patterns.json';
    this.load();
    this.initializeBootstrapPatterns();
  }

  /**
   * Analyze a successful PR to extract patterns
   */
  async analyzeSuccessfulPR(
    submission: PRSubmission,
    changes: CodeChange[],
    bounty: Bounty,
    classification: BountyClassification
  ): Promise<SuccessAnalysis> {
    console.log(`[SuccessPatterns] Analyzing successful PR: ${submission.prUrl}`);

    // Prepare context for analysis
    const context = {
      prUrl: submission.prUrl,
      repo: submission.repo,
      bountyTitle: bounty.title,
      bountyDescription: bounty.description,
      bountyType: classification.type,
      difficulty: bounty.difficulty,
      changes: changes.map(c => ({
        path: c.path,
        preview: c.content.slice(0, 500),
      })),
    };

    const systemPrompt = `You are an expert at analyzing successful code submissions.
Analyze this merged PR and identify what made it successful.

Extract:
1. SUCCESS FACTORS: What aspects contributed to acceptance
2. CODE PATTERNS: Specific code patterns that worked well
3. COMMUNICATION PATTERNS: How the PR was presented
4. STRUCTURE PATTERNS: How the code was organized

Return JSON:
{
  "successFactors": ["factor1", "factor2"],
  "codePatterns": ["pattern1", "pattern2"],
  "communicationPatterns": ["pattern1", "pattern2"],
  "structurePatterns": ["pattern1", "pattern2"]
}`;

    try {
      const response = await this.router.execute(
        `Analyze this successful PR:\n\n${JSON.stringify(context, null, 2)}`,
        systemPrompt
      );

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        return {
          prUrl: submission.prUrl,
          repo: submission.repo,
          bountyType: classification.type,
          successFactors: analysis.successFactors || [],
          codePatterns: analysis.codePatterns || [],
          communicationPatterns: analysis.communicationPatterns || [],
          structurePatterns: analysis.structurePatterns || [],
        };
      }
    } catch (error) {
      console.error('[SuccessPatterns] Failed to analyze PR:', error);
    }

    return {
      prUrl: submission.prUrl,
      repo: submission.repo,
      bountyType: classification.type,
      successFactors: [],
      codePatterns: [],
      communicationPatterns: [],
      structurePatterns: [],
    };
  }

  /**
   * Learn patterns from a successful PR
   */
  async learnFromSuccess(
    submission: PRSubmission,
    changes: CodeChange[],
    bounty: Bounty,
    classification: BountyClassification
  ): Promise<void> {
    const analysis = await this.analyzeSuccessfulPR(submission, changes, bounty, classification);

    // Update existing patterns or create new ones
    for (const factor of analysis.successFactors) {
      await this.updateOrCreatePattern(factor, 'approach', submission, classification);
    }

    for (const pattern of analysis.codePatterns) {
      await this.updateOrCreatePattern(pattern, 'style', submission, classification);
    }

    for (const pattern of analysis.communicationPatterns) {
      await this.updateOrCreatePattern(pattern, 'communication', submission, classification);
    }

    for (const pattern of analysis.structurePatterns) {
      await this.updateOrCreatePattern(pattern, 'structure', submission, classification);
    }

    this.save();
    console.log(`[SuccessPatterns] Learned ${analysis.successFactors.length + analysis.codePatterns.length + analysis.communicationPatterns.length + analysis.structurePatterns.length} patterns from ${submission.prUrl}`);
  }

  /**
   * Find applicable patterns for a bounty
   */
  findApplicablePatterns(
    bounty: Bounty,
    classification: BountyClassification
  ): PatternMatch[] {
    const matches: PatternMatch[] = [];

    for (const pattern of this.patterns.values()) {
      // Check conditions
      let matchScore = 0;
      let conditionsMatched = 0;

      for (const condition of pattern.conditions) {
        const matched = this.checkCondition(condition, bounty, classification);
        if (matched) {
          conditionsMatched++;
        }
      }

      // Calculate match score
      if (pattern.conditions.length === 0) {
        matchScore = pattern.confidence * 0.5; // Generic patterns
      } else {
        matchScore = pattern.confidence * (conditionsMatched / pattern.conditions.length);
      }

      // Only include patterns with significant match
      if (matchScore >= 0.3) {
        matches.push({
          pattern,
          matchScore,
          applicableAdvice: this.generateAdvice(pattern, bounty),
        });
      }
    }

    // Sort by match score
    matches.sort((a, b) => b.matchScore - a.matchScore);

    return matches.slice(0, 10); // Top 10 patterns
  }

  /**
   * Generate prompt enhancement with success patterns
   */
  generatePatternGuidance(
    bounty: Bounty,
    classification: BountyClassification
  ): string {
    const matches = this.findApplicablePatterns(bounty, classification);

    if (matches.length === 0) {
      return '';
    }

    const lines: string[] = [];
    lines.push('# Success Patterns to Apply\n');
    lines.push('Based on analysis of previously successful PRs, apply these patterns:\n');

    for (const match of matches.slice(0, 5)) {
      lines.push(`## ${match.pattern.name} (${(match.matchScore * 100).toFixed(0)}% relevant)`);
      lines.push(match.pattern.description);
      if (match.applicableAdvice.length > 0) {
        lines.push('Specific advice:');
        for (const advice of match.applicableAdvice) {
          lines.push(`- ${advice}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Record pattern application outcome
   */
  recordPatternOutcome(
    patternIds: string[],
    success: boolean
  ): void {
    for (const id of patternIds) {
      const pattern = this.patterns.get(id);
      if (pattern) {
        pattern.effectiveness.timesApplied++;
        if (success) {
          pattern.effectiveness.timesSuccessful++;
        }
        pattern.effectiveness.successRate =
          pattern.effectiveness.timesSuccessful / pattern.effectiveness.timesApplied;
        pattern.lastUpdated = new Date();

        // Adjust confidence based on effectiveness
        if (pattern.effectiveness.timesApplied >= 5) {
          pattern.confidence = 0.5 + (pattern.effectiveness.successRate * 0.5);
        }
      }
    }

    this.save();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private initializeBootstrapPatterns(): void {
    for (const bp of BOOTSTRAP_PATTERNS) {
      if (!this.patterns.has(bp.id!)) {
        this.patterns.set(bp.id!, {
          id: bp.id!,
          name: bp.name!,
          description: bp.description!,
          category: bp.category!,
          confidence: bp.confidence!,
          examples: [],
          conditions: [],
          effectiveness: {
            timesApplied: 0,
            timesSuccessful: 0,
            successRate: 0,
          },
          createdAt: new Date(),
          lastUpdated: new Date(),
        });
      }
    }
  }

  private async updateOrCreatePattern(
    patternDescription: string,
    category: SuccessPattern['category'],
    submission: PRSubmission,
    classification: BountyClassification
  ): Promise<void> {
    // Generate pattern ID from description
    const id = this.generatePatternId(patternDescription);

    // Check if similar pattern exists
    const existing = this.patterns.get(id);

    if (existing) {
      // Update existing pattern
      existing.examples.push({
        prUrl: submission.prUrl,
        repo: submission.repo,
        bountyType: classification.type,
      });

      // Keep only last 10 examples
      if (existing.examples.length > 10) {
        existing.examples = existing.examples.slice(-10);
      }

      existing.confidence = Math.min(0.95, existing.confidence + 0.02);
      existing.lastUpdated = new Date();

    } else {
      // Create new pattern
      this.patterns.set(id, {
        id,
        name: patternDescription.slice(0, 50),
        description: patternDescription,
        category,
        confidence: 0.6,
        examples: [{
          prUrl: submission.prUrl,
          repo: submission.repo,
          bountyType: classification.type,
        }],
        conditions: [{
          field: 'bountyType',
          operator: 'equals',
          value: classification.type,
        }],
        effectiveness: {
          timesApplied: 0,
          timesSuccessful: 1,
          successRate: 1,
        },
        createdAt: new Date(),
        lastUpdated: new Date(),
      });
    }
  }

  private generatePatternId(description: string): string {
    return description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 50);
  }

  private checkCondition(
    condition: PatternCondition,
    bounty: Bounty,
    classification: BountyClassification
  ): boolean {
    let fieldValue: string;

    switch (condition.field) {
      case 'bountyType':
        fieldValue = classification.type;
        break;
      case 'difficulty':
        fieldValue = bounty.difficulty;
        break;
      case 'platform':
        fieldValue = bounty.platform;
        break;
      case 'category':
        fieldValue = bounty.category;
        break;
      default:
        return false;
    }

    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'contains':
        return fieldValue.includes(condition.value as string);
      case 'in':
        return (condition.value as string[]).includes(fieldValue);
      default:
        return false;
    }
  }

  private generateAdvice(pattern: SuccessPattern, bounty: Bounty): string[] {
    const advice: string[] = [];

    switch (pattern.category) {
      case 'structure':
        advice.push('Keep changes focused and minimal');
        advice.push('Organize code logically');
        break;

      case 'style':
        advice.push('Match the repository\'s existing code style');
        advice.push('Use consistent naming conventions');
        break;

      case 'approach':
        advice.push('Address all requirements in the bounty description');
        advice.push('Provide a complete solution');
        break;

      case 'communication':
        advice.push('Write a clear, structured PR description');
        advice.push('Explain what the PR does and why');
        break;

      case 'testing':
        advice.push('Include unit tests for new functionality');
        advice.push('Ensure tests cover edge cases');
        break;
    }

    return advice;
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  getPatternStats(): {
    totalPatterns: number;
    byCategory: Record<string, number>;
    topPatterns: Array<{ name: string; successRate: number; timesApplied: number }>;
  } {
    const byCategory: Record<string, number> = {};
    const patternsArray: Array<{ name: string; successRate: number; timesApplied: number }> = [];

    for (const pattern of this.patterns.values()) {
      byCategory[pattern.category] = (byCategory[pattern.category] || 0) + 1;
      if (pattern.effectiveness.timesApplied > 0) {
        patternsArray.push({
          name: pattern.name,
          successRate: pattern.effectiveness.successRate,
          timesApplied: pattern.effectiveness.timesApplied,
        });
      }
    }

    // Sort by success rate
    patternsArray.sort((a, b) => b.successRate - a.successRate);

    return {
      totalPatterns: this.patterns.size,
      byCategory,
      topPatterns: patternsArray.slice(0, 10),
    };
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
      for (const [key, pattern] of this.patterns) {
        data[key] = {
          ...pattern,
          createdAt: pattern.createdAt.toISOString(),
          lastUpdated: pattern.lastUpdated.toISOString(),
        };
      }

      fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[SuccessPatterns] Failed to save:', error);
    }
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.persistPath)) return;

      const data = JSON.parse(fs.readFileSync(this.persistPath, 'utf-8'));

      for (const [key, pattern] of Object.entries(data)) {
        const p = pattern as any;
        this.patterns.set(key, {
          ...p,
          createdAt: new Date(p.createdAt),
          lastUpdated: new Date(p.lastUpdated),
        });
      }

      console.log(`[SuccessPatterns] Loaded ${this.patterns.size} patterns`);
    } catch (error) {
      console.error('[SuccessPatterns] Failed to load:', error);
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let patternMiner: SuccessPatternMiner | null = null;

export function getSuccessPatterns(): SuccessPatternMiner {
  if (!patternMiner) {
    patternMiner = new SuccessPatternMiner();
  }
  return patternMiner;
}

export function resetSuccessPatterns(): void {
  patternMiner = null;
}
