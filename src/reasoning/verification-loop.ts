/**
 * Verification Loop - Verify-before-commit pattern
 *
 * Core idea: Every major output passes a SEPARATE verification pass before finalization.
 * Multiple strategies: factual, logical, completeness, adversarial.
 * Iterative refinement with confidence thresholds.
 */

import { getMCPClient } from '../mcp/index.js';

// Core Types

export interface VerificationContext {
  strategy: VerificationStrategy | VerificationStrategy[];
  minConfidence?: number; // Default 0.8
  maxIterations?: number; // Default 3
  sources?: string[]; // URLs or data sources to check against
  metadata?: Record<string, unknown>;
}

export type VerificationStrategy = 'factual' | 'logical' | 'completeness' | 'adversarial';

export interface VerificationIssue {
  severity: 'critical' | 'major' | 'minor';
  strategy: VerificationStrategy;
  description: string;
  location?: string; // Field path or section name
  suggestion?: string;
  evidence?: string; // Supporting data for the issue
}

export interface VerificationResult<T> {
  verified: boolean;
  confidence: number; // 0-1
  issues: VerificationIssue[];
  corrected?: T; // Optional auto-corrected version
  iterations: number;
  timestamp: string;
}

// Strategy Implementations

interface StrategyVerifier {
  verify<T>(output: T, context: VerificationContext): Promise<Partial<VerificationResult<T>>>;
}

class FactualVerifier implements StrategyVerifier {
  async verify<T>(output: T, context: VerificationContext): Promise<Partial<VerificationResult<T>>> {
    const issues: VerificationIssue[] = [];
    let confidence = 1.0;

    // Extract claims that look like facts (numbers, dates, company names)
    const claims = this.extractClaims(output);

    if (claims.length === 0) {
      return { confidence: 0.9, issues }; // No factual claims to verify
    }

    // Verify each claim
    for (const claim of claims) {
      try {
        const verified = await this.verifyClaim(claim, context.sources);
        if (!verified.confident) {
          issues.push({
            severity: verified.contradicts ? 'critical' : 'major',
            strategy: 'factual',
            description: `Unverified or contradictory claim: ${claim.text}`,
            location: claim.location,
            evidence: verified.evidence,
            suggestion: verified.suggestion
          });
          confidence -= 0.15;
        }
      } catch (error) {
        // Verification failed - mark as issue but don't crash
        issues.push({
          severity: 'minor',
          strategy: 'factual',
          description: `Could not verify: ${claim.text}`,
          location: claim.location
        });
        confidence -= 0.05;
      }
    }

    return { confidence: Math.max(0, confidence), issues };
  }

  private extractClaims(output: unknown): Array<{ text: string; location: string }> {
    const claims: Array<{ text: string; location: string }> = [];
    const outputStr = JSON.stringify(output, null, 2);

    // Look for numeric claims (prices, percentages, dates)
    const numericPattern = /(\$[\d,]+(?:\.\d+)?(?:[KMB]n)?|\d+(?:\.\d+)?%|Q[1-4]\s+\d{4})/g;
    let match;
    while ((match = numericPattern.exec(outputStr)) !== null) {
      claims.push({
        text: match[1],
        location: this.findLocation(output, match[1])
      });
    }

    return claims.slice(0, 20); // Cap at 20 claims to avoid excessive API calls
  }

  private findLocation(output: unknown, text: string): string {
    const json = JSON.stringify(output, null, 2);
    const lines = json.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(text)) {
        // Try to extract field name from previous lines
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          const fieldMatch = lines[j].match(/"(\w+)":/);
          if (fieldMatch) return fieldMatch[1];
        }
        return `line ${i + 1}`;
      }
    }
    return 'unknown';
  }

  private async verifyClaim(
    claim: { text: string; location: string },
    sources?: string[]
  ): Promise<{ confident: boolean; contradicts: boolean; evidence?: string; suggestion?: string }> {
    // Use MCP brave-search for fact checking
    try {
      const mcp = getMCPClient();
      const searchQuery = `${claim.text} ${sources?.[0] || ''}`.trim();

      const result = await mcp.call('brave-search' as any, 'brave_web_search', {
        query: searchQuery,
        count: 3
      });

      // Simple heuristic: if the claim appears in top results, it's likely verified
      const resultText = JSON.stringify(result).toLowerCase();
      const claimText = claim.text.toLowerCase().replace(/[^\w\s]/g, '');

      if (resultText.includes(claimText)) {
        return { confident: true, contradicts: false };
      }

      return {
        confident: false,
        contradicts: false,
        evidence: 'No strong evidence found in search results',
        suggestion: 'Verify this claim manually or provide source'
      };
    } catch (error) {
      return { confident: false, contradicts: false };
    }
  }
}

class LogicalVerifier implements StrategyVerifier {
  async verify<T>(output: T, context: VerificationContext): Promise<Partial<VerificationResult<T>>> {
    const issues: VerificationIssue[] = [];
    let confidence = 1.0;

    // Check for logical contradictions
    const contradictions = this.findContradictions(output);
    for (const contradiction of contradictions) {
      issues.push({
        severity: 'critical',
        strategy: 'logical',
        description: contradiction.description,
        location: contradiction.location,
        suggestion: 'Resolve contradiction or clarify relationship'
      });
      confidence -= 0.2;
    }

    // Check for circular reasoning
    const circularReasoning = this.findCircularReasoning(output);
    if (circularReasoning.length > 0) {
      issues.push({
        severity: 'major',
        strategy: 'logical',
        description: `Circular reasoning detected: ${circularReasoning.join(', ')}`,
        suggestion: 'Break circular dependencies in logic'
      });
      confidence -= 0.15;
    }

    return { confidence: Math.max(0, confidence), issues };
  }

  private findContradictions(output: unknown): Array<{ description: string; location: string }> {
    const contradictions: Array<{ description: string; location: string }> = [];
    const str = JSON.stringify(output).toLowerCase();

    // Simple heuristic: look for opposing sentiment indicators
    const patterns = [
      { positive: 'bullish', negative: 'bearish', context: 'market sentiment' },
      { positive: 'increase', negative: 'decrease', context: 'trend direction' },
      { positive: 'strong', negative: 'weak', context: 'strength assessment' },
      { positive: 'optimistic', negative: 'pessimistic', context: 'outlook' }
    ];

    for (const pattern of patterns) {
      if (str.includes(pattern.positive) && str.includes(pattern.negative)) {
        contradictions.push({
          description: `Conflicting ${pattern.context}: contains both '${pattern.positive}' and '${pattern.negative}'`,
          location: pattern.context
        });
      }
    }

    return contradictions;
  }

  private findCircularReasoning(output: unknown): string[] {
    // Simplified check - in production, would use dependency graph
    const circular: string[] = [];
    const str = JSON.stringify(output);

    if (str.includes('because') && str.includes('therefore')) {
      const sentences = str.split(/[.!?]/);
      // Check if conclusion appears before premise
      for (let i = 0; i < sentences.length - 1; i++) {
        const current = sentences[i].toLowerCase();
        const next = sentences[i + 1].toLowerCase();
        if (current.includes('therefore') && next.includes('because')) {
          circular.push('conclusion-before-premise');
        }
      }
    }

    return circular;
  }
}

class CompletenessVerifier implements StrategyVerifier {
  async verify<T>(output: T, context: VerificationContext): Promise<Partial<VerificationResult<T>>> {
    const issues: VerificationIssue[] = [];
    let confidence = 1.0;

    // Check for required fields based on type
    const missing = this.findMissingFields(output, context);
    for (const field of missing) {
      issues.push({
        severity: field.required ? 'critical' : 'minor',
        strategy: 'completeness',
        description: `Missing ${field.required ? 'required' : 'recommended'} field: ${field.name}`,
        location: field.path,
        suggestion: `Add ${field.name} to complete the output`
      });
      confidence -= field.required ? 0.25 : 0.05;
    }

    // Check for empty or placeholder values
    const placeholders = this.findPlaceholders(output);
    if (placeholders.length > 0) {
      issues.push({
        severity: 'major',
        strategy: 'completeness',
        description: `Found ${placeholders.length} placeholder value(s)`,
        location: placeholders.join(', '),
        suggestion: 'Replace placeholders with actual content'
      });
      confidence -= 0.2;
    }

    return { confidence: Math.max(0, confidence), issues };
  }

  private findMissingFields(
    output: unknown,
    context: VerificationContext
  ): Array<{ name: string; path: string; required: boolean }> {
    const missing: Array<{ name: string; path: string; required: boolean }> = [];

    // Type-specific checks based on metadata
    const outputType = context.metadata?.type as string;

    if (outputType === 'market-brief') {
      const obj = output as Record<string, unknown>;
      if (!obj.headline) missing.push({ name: 'headline', path: 'root', required: true });
      if (!obj.narrative) missing.push({ name: 'narrative', path: 'root', required: true });
      if (!obj.positioning) missing.push({ name: 'positioning', path: 'root', required: true });
    } else if (outputType === 'presentation-spec') {
      const obj = output as Record<string, unknown>;
      if (!obj.slides) missing.push({ name: 'slides', path: 'root', required: true });
      if (!obj.meta) missing.push({ name: 'meta', path: 'root', required: true });
    }

    return missing;
  }

  private findPlaceholders(output: unknown): string[] {
    const placeholders: string[] = [];
    const str = JSON.stringify(output);

    const patterns = [
      /TODO/gi,
      /PLACEHOLDER/gi,
      /FIXME/gi,
      /\[TBD\]/gi,
      /\{\{.*?\}\}/g,
      /""\s*,/g, // Empty strings
    ];

    for (const pattern of patterns) {
      const matches = str.match(pattern);
      if (matches) {
        placeholders.push(...matches.map(m => m.substring(0, 30)));
      }
    }

    return [...new Set(placeholders)].slice(0, 10); // Dedupe and cap
  }
}

class AdversarialVerifier implements StrategyVerifier {
  async verify<T>(output: T, context: VerificationContext): Promise<Partial<VerificationResult<T>>> {
    const issues: VerificationIssue[] = [];
    let confidence = 1.0;

    // Try to find weaknesses in arguments
    const weaknesses = this.findWeaknesses(output);
    for (const weakness of weaknesses) {
      issues.push({
        severity: 'major',
        strategy: 'adversarial',
        description: weakness.description,
        location: weakness.location,
        suggestion: weakness.suggestion
      });
      confidence -= 0.1;
    }

    // Check for overconfidence
    const overconfident = this.detectOverconfidence(output);
    if (overconfident) {
      issues.push({
        severity: 'minor',
        strategy: 'adversarial',
        description: 'Output may be overconfident - lacks hedging or uncertainty acknowledgment',
        suggestion: 'Add appropriate caveats or uncertainty ranges'
      });
      confidence -= 0.05;
    }

    return { confidence: Math.max(0, confidence), issues };
  }

  private findWeaknesses(output: unknown): Array<{ description: string; location: string; suggestion: string }> {
    const weaknesses: Array<{ description: string; location: string; suggestion: string }> = [];
    const str = JSON.stringify(output);

    // Check for unsupported claims (assertions without evidence)
    const assertionPattern = /(will|must|always|never|certainly|definitely)/gi;
    const evidencePattern = /(because|data shows|according to|evidence suggests)/gi;

    const assertions = str.match(assertionPattern) || [];
    const evidence = str.match(evidencePattern) || [];

    if (assertions.length > 5 && evidence.length < assertions.length * 0.3) {
      weaknesses.push({
        description: `High ratio of assertions (${assertions.length}) to evidence (${evidence.length})`,
        location: 'overall',
        suggestion: 'Provide more supporting evidence for claims'
      });
    }

    return weaknesses;
  }

  private detectOverconfidence(output: unknown): boolean {
    const str = JSON.stringify(output).toLowerCase();
    const overconfidentTerms = ['guaranteed', 'certain', 'impossible', 'always', 'never', '100%'];
    const hedgingTerms = ['likely', 'probably', 'may', 'might', 'could', 'suggests'];

    const overconfidentCount = overconfidentTerms.filter(term => str.includes(term)).length;
    const hedgingCount = hedgingTerms.filter(term => str.includes(term)).length;

    return overconfidentCount > 0 && hedgingCount === 0;
  }
}

// Main Verification Loop

export class VerificationLoop {
  private strategies = new Map<VerificationStrategy, StrategyVerifier>([
    ['factual', new FactualVerifier() as StrategyVerifier],
    ['logical', new LogicalVerifier() as StrategyVerifier],
    ['completeness', new CompletenessVerifier() as StrategyVerifier],
    ['adversarial', new AdversarialVerifier() as StrategyVerifier],
  ]);

  async verify<T>(output: T, context: VerificationContext): Promise<VerificationResult<T>> {
    const minConfidence = context.minConfidence ?? 0.8;
    const maxIterations = context.maxIterations ?? 3;
    const strategies = Array.isArray(context.strategy) ? context.strategy : [context.strategy];

    let currentOutput = output;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;

      const allIssues: VerificationIssue[] = [];
      let totalConfidence = 0;

      // Run all strategies
      for (const strategyName of strategies) {
        const verifier = this.strategies.get(strategyName);
        if (!verifier) continue;

        const result = await verifier.verify(currentOutput, context);
        if (result.issues) allIssues.push(...result.issues);
        totalConfidence += result.confidence ?? 1.0;
      }

      const avgConfidence = totalConfidence / strategies.length;

      // Check if we meet threshold
      if (avgConfidence >= minConfidence && allIssues.filter(i => i.severity === 'critical').length === 0) {
        return {
          verified: true,
          confidence: avgConfidence,
          issues: allIssues,
          iterations: iteration,
          timestamp: new Date().toISOString()
        };
      }

      // Try to auto-correct critical issues
      if (iteration < maxIterations) {
        const corrected = this.attemptCorrection(currentOutput, allIssues);
        if (corrected) {
          currentOutput = corrected;
          continue; // Re-verify
        }
      }

      // Failed to verify
      return {
        verified: false,
        confidence: avgConfidence,
        issues: allIssues,
        iterations: iteration,
        timestamp: new Date().toISOString()
      };
    }

    // Max iterations reached
    return {
      verified: false,
      confidence: 0,
      issues: [{ severity: 'critical', strategy: 'logical', description: 'Max verification iterations reached' }],
      iterations: maxIterations,
      timestamp: new Date().toISOString()
    };
  }

  private attemptCorrection<T>(output: T, issues: VerificationIssue[]): T | null {
    // Simple auto-correction for known patterns
    // In production, would use LLM for intelligent correction
    return null; // Disabled for now - requires more sophisticated correction logic
  }
}

// Domain-Specific Verification Hooks

export async function verifyMarketBrief(brief: unknown): Promise<VerificationResult<unknown>> {
  const loop = getVerificationLoop();
  return loop.verify(brief, {
    strategy: ['factual', 'logical', 'completeness'],
    minConfidence: 0.85,
    metadata: { type: 'market-brief' }
  });
}

export async function verifyPresentationSpec(spec: unknown): Promise<VerificationResult<unknown>> {
  const loop = getVerificationLoop();
  return loop.verify(spec, {
    strategy: ['completeness', 'logical'],
    minConfidence: 0.8,
    metadata: { type: 'presentation-spec' }
  });
}

export async function verifyCodeChange(diff: string, repoContext: string): Promise<VerificationResult<string>> {
  const loop = getVerificationLoop();
  return loop.verify(diff, {
    strategy: ['logical', 'adversarial'],
    minConfidence: 0.75,
    metadata: { type: 'code-change', repoContext }
  });
}

// Singleton

let instance: VerificationLoop | null = null;

export function getVerificationLoop(): VerificationLoop {
  if (!instance) {
    instance = new VerificationLoop();
  }
  return instance;
}
