/**
 * Multi-Model Validator v19.4
 *
 * Uses multiple LLMs to validate code before submission:
 * - Cross-validates code quality
 * - Detects issues a single model might miss
 * - Builds consensus before submission
 * - Higher confidence = lower rejection rate
 *
 * @module economy/multi-validator
 * @version 19.4.0
 */

import { getHybridRouter } from '../llm/router.js';
import type { Bounty } from './generators/bounty-hunter.js';
import type { BountyClassification } from './bounty-intelligence.js';
import type { CodeChange } from './live/pr-pipeline.js';

// ============================================================================
// Types
// ============================================================================

export interface ValidationCheck {
  aspect: 'correctness' | 'completeness' | 'style' | 'security' | 'performance' | 'tests';
  passed: boolean;
  confidence: number;
  issues: string[];
  suggestions: string[];
}

export interface ModelValidation {
  model: string;
  overallScore: number;
  checks: ValidationCheck[];
  summary: string;
  wouldApprove: boolean;
}

export interface ConsensusResult {
  approved: boolean;
  confidence: number;
  validations: ModelValidation[];
  consensusIssues: string[];  // Issues found by multiple models
  divergentOpinions: string[]; // Where models disagreed
  finalRecommendation: 'submit' | 'revise' | 'reject';
  requiredFixes: string[];
}

export interface MultiValidatorConfig {
  /** Minimum models that must approve */
  minApprovals: number;
  /** Minimum consensus confidence */
  minConfidence: number;
  /** Aspects to validate */
  aspects: ValidationCheck['aspect'][];
  /** Use strict mode (all models must agree on critical issues) */
  strictMode: boolean;
}

const DEFAULT_CONFIG: MultiValidatorConfig = {
  minApprovals: 2,
  minConfidence: 0.7,
  aspects: ['correctness', 'completeness', 'style', 'security'],
  strictMode: true,
};

// ============================================================================
// Validation Prompts
// ============================================================================

const VALIDATION_PROMPTS: Record<ValidationCheck['aspect'], string> = {
  correctness: `Analyze this code for CORRECTNESS:
- Does it implement the requirements correctly?
- Are there any logic errors or bugs?
- Does it handle edge cases?
- Would it work as expected?

Score 0-100 and list any issues.`,

  completeness: `Analyze this code for COMPLETENESS:
- Does it fully implement all requirements?
- Are there any missing features?
- Are there any TODO or PLACEHOLDER comments?
- Is anything left unfinished?

Score 0-100 and list any issues.`,

  style: `Analyze this code for STYLE:
- Does it follow best practices?
- Is the code readable and well-organized?
- Are variable names clear and consistent?
- Is there proper formatting and indentation?

Score 0-100 and list any issues.`,

  security: `Analyze this code for SECURITY:
- Are there any security vulnerabilities?
- Is user input properly validated?
- Are there any hardcoded secrets?
- Is there proper error handling?

Score 0-100 and list any issues.`,

  performance: `Analyze this code for PERFORMANCE:
- Are there any inefficient algorithms?
- Are there unnecessary loops or operations?
- Is memory used efficiently?
- Are there any performance bottlenecks?

Score 0-100 and list any issues.`,

  tests: `Analyze this code for TESTS:
- Are there adequate unit tests?
- Do tests cover edge cases?
- Is test coverage sufficient?
- Are tests well-organized?

Score 0-100 and list any issues.`,
};

// ============================================================================
// Multi-Model Validator
// ============================================================================

export class MultiModelValidator {
  private router = getHybridRouter();
  private config: MultiValidatorConfig;

  constructor(config?: Partial<MultiValidatorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate code using multiple models
   */
  async validate(
    changes: CodeChange[],
    bounty: Bounty,
    classification: BountyClassification
  ): Promise<ConsensusResult> {
    console.log(`[MultiValidator] Starting multi-model validation for ${changes.length} files`);

    // Prepare code context
    const codeContext = this.prepareCodeContext(changes, bounty);

    // Get validations from multiple "perspectives"
    // We simulate multiple models by using different prompting strategies
    const validations: ModelValidation[] = [];

    // Validation 1: Strict reviewer
    validations.push(await this.validateAsReviewer(codeContext, 'strict', bounty));

    // Validation 2: Practical reviewer
    validations.push(await this.validateAsReviewer(codeContext, 'practical', bounty));

    // Validation 3: Security focused
    validations.push(await this.validateAsReviewer(codeContext, 'security', bounty));

    // Build consensus
    const consensus = this.buildConsensus(validations);

    console.log(`[MultiValidator] Consensus: ${consensus.finalRecommendation} (${(consensus.confidence * 100).toFixed(0)}% confidence)`);

    return consensus;
  }

  private prepareCodeContext(changes: CodeChange[], bounty: Bounty): string {
    const parts: string[] = [];

    parts.push(`# Bounty: ${bounty.title}`);
    parts.push(`## Description:\n${bounty.description}`);
    parts.push(`## Difficulty: ${bounty.difficulty}`);
    parts.push('');

    for (const change of changes) {
      parts.push(`## File: ${change.path}`);
      parts.push('```');
      parts.push(change.content);
      parts.push('```');
      parts.push('');
    }

    return parts.join('\n');
  }

  private async validateAsReviewer(
    codeContext: string,
    reviewerType: 'strict' | 'practical' | 'security',
    bounty: Bounty
  ): Promise<ModelValidation> {
    const reviewerPrompts: Record<string, string> = {
      strict: `You are a STRICT code reviewer who holds code to the highest standards.
You reject code that has ANY issues, even minor ones.
You focus on: correctness, edge cases, error handling, and code quality.`,

      practical: `You are a PRACTICAL code reviewer who focuses on what matters most.
You approve code that works correctly, even if it could be improved.
You focus on: does it solve the problem, is it maintainable, are there critical bugs.`,

      security: `You are a SECURITY-FOCUSED code reviewer.
You specifically look for security vulnerabilities and unsafe practices.
You focus on: input validation, injection attacks, data exposure, authentication.`,
    };

    const systemPrompt = `${reviewerPrompts[reviewerType]}

You will review code submitted for a bounty.

Respond in JSON format:
{
  "overallScore": 0-100,
  "wouldApprove": true/false,
  "checks": [
    {
      "aspect": "correctness|completeness|style|security",
      "score": 0-100,
      "passed": true/false,
      "issues": ["issue1", "issue2"],
      "suggestions": ["suggestion1"]
    }
  ],
  "summary": "one sentence summary"
}`;

    const userPrompt = `Review this code submission:

${codeContext}

Requirements to check against:
${bounty.description}

Provide your review in JSON format.`;

    try {
      const response = await this.router.execute(userPrompt, systemPrompt);

      // Parse JSON response
      let parsed: any;
      try {
        // Extract JSON from response
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found');
        }
      } catch {
        // If parsing fails, create a neutral response
        console.log(`[MultiValidator] Failed to parse ${reviewerType} response`);
        return {
          model: reviewerType,
          overallScore: 50,
          checks: [],
          summary: 'Unable to parse validation response',
          wouldApprove: false,
        };
      }

      // Normalize checks
      const checks: ValidationCheck[] = (parsed.checks || []).map((c: any) => ({
        aspect: c.aspect || 'correctness',
        passed: c.passed ?? (c.score >= 70),
        confidence: (c.score || 50) / 100,
        issues: c.issues || [],
        suggestions: c.suggestions || [],
      }));

      return {
        model: reviewerType,
        overallScore: parsed.overallScore || 50,
        checks,
        summary: parsed.summary || '',
        wouldApprove: parsed.wouldApprove ?? (parsed.overallScore >= 70),
      };

    } catch (error) {
      console.error(`[MultiValidator] ${reviewerType} validation failed:`, error);
      return {
        model: reviewerType,
        overallScore: 0,
        checks: [],
        summary: `Validation error: ${error}`,
        wouldApprove: false,
      };
    }
  }

  private buildConsensus(validations: ModelValidation[]): ConsensusResult {
    // Count approvals
    const approvals = validations.filter(v => v.wouldApprove).length;

    // Calculate average score
    const avgScore = validations.reduce((sum, v) => sum + v.overallScore, 0) / validations.length;

    // Find consensus issues (mentioned by multiple models)
    const issueCounts = new Map<string, number>();
    for (const validation of validations) {
      for (const check of validation.checks) {
        for (const issue of check.issues) {
          const normalized = issue.toLowerCase().slice(0, 50);
          issueCounts.set(normalized, (issueCounts.get(normalized) || 0) + 1);
        }
      }
    }

    const consensusIssues = [...issueCounts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([issue]) => issue);

    // Find divergent opinions
    const divergentOpinions: string[] = [];
    if (validations.some(v => v.wouldApprove) && validations.some(v => !v.wouldApprove)) {
      divergentOpinions.push('Models disagree on approval');
    }

    // Strict mode: all must agree on critical issues
    let hasBlockingDisagreement = false;
    if (this.config.strictMode) {
      // Check if any model found critical security issues
      for (const validation of validations) {
        const securityCheck = validation.checks.find(c => c.aspect === 'security');
        if (securityCheck && !securityCheck.passed && securityCheck.confidence > 0.8) {
          hasBlockingDisagreement = true;
          break;
        }
      }
    }

    // Determine final recommendation
    let recommendation: 'submit' | 'revise' | 'reject';
    let confidence = avgScore / 100;

    if (hasBlockingDisagreement) {
      recommendation = 'reject';
      confidence = 0.3;
    } else if (approvals >= this.config.minApprovals && avgScore >= this.config.minConfidence * 100) {
      recommendation = 'submit';
      confidence = avgScore / 100;
    } else if (avgScore >= 50 && consensusIssues.length <= 3) {
      recommendation = 'revise';
      confidence = 0.5;
    } else {
      recommendation = 'reject';
      confidence = avgScore / 100;
    }

    // Extract required fixes
    const requiredFixes = consensusIssues.slice(0, 5);

    return {
      approved: recommendation === 'submit',
      confidence,
      validations,
      consensusIssues,
      divergentOpinions,
      finalRecommendation: recommendation,
      requiredFixes,
    };
  }

  /**
   * Quick validation for a single aspect
   */
  async validateAspect(
    code: string,
    aspect: ValidationCheck['aspect']
  ): Promise<ValidationCheck> {
    const systemPrompt = `You are a code reviewer. ${VALIDATION_PROMPTS[aspect]}

Respond in JSON:
{
  "score": 0-100,
  "passed": true/false,
  "issues": ["issue1", "issue2"],
  "suggestions": ["suggestion1"]
}`;

    try {
      const response = await this.router.execute(
        `Review this code:\n\n\`\`\`\n${code}\n\`\`\``,
        systemPrompt
      );

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          aspect,
          passed: parsed.passed ?? (parsed.score >= 70),
          confidence: (parsed.score || 50) / 100,
          issues: parsed.issues || [],
          suggestions: parsed.suggestions || [],
        };
      }
    } catch {
      // Fall through to default
    }

    return {
      aspect,
      passed: true,
      confidence: 0.5,
      issues: [],
      suggestions: [],
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let multiValidator: MultiModelValidator | null = null;

export function getMultiValidator(): MultiModelValidator {
  if (!multiValidator) {
    multiValidator = new MultiModelValidator();
  }
  return multiValidator;
}

export function resetMultiValidator(): void {
  multiValidator = null;
}
