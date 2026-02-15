/**
 * Solution Comparator v19.7
 *
 * Compares our solution against similar merged PRs:
 * - Finds similar accepted PRs in the repo
 * - Analyzes structural patterns
 * - Validates approach alignment
 * - Suggests improvements based on precedent
 *
 * This ensures our solution matches proven patterns.
 *
 * @module economy/solution-comparator
 * @version 19.7.0
 */

import { getMCPClient } from '../mcp/index.js';
import { getHybridRouter } from '../llm/router.js';
import type { CodeChange } from './live/pr-pipeline.js';
import type { BountyClassification } from './bounty-intelligence.js';

// ============================================================================
// Types
// ============================================================================

export interface SolutionComparison {
  // Similar PRs found
  similarPRs: SimilarPR[];
  bestMatch: SimilarPR | null;

  // Pattern analysis
  patterns: PatternMatch[];
  antiPatterns: string[];

  // Alignment score
  alignmentScore: number;  // 0-100
  alignmentDetails: {
    structureMatch: number;
    styleMatch: number;
    approachMatch: number;
    testingMatch: number;
  };

  // Recommendations
  suggestions: string[];
  warnings: string[];
  confidence: number;
}

export interface SimilarPR {
  number: number;
  title: string;
  url: string;
  similarity: number;  // 0-1
  author: string;
  mergedAt: Date;
  filesChanged: string[];
  additions: number;
  deletions: number;
  reviewComments: number;
  timeToMerge: number;  // hours
  approach: string;
}

export interface PatternMatch {
  pattern: string;
  description: string;
  frequency: number;  // How often this pattern appears
  ourMatch: boolean;  // Whether our solution follows it
  importance: 'critical' | 'recommended' | 'optional';
}

// ============================================================================
// Solution Comparator
// ============================================================================

export class SolutionComparator {
  private mcp = getMCPClient();
  private router = getHybridRouter();
  private patternCache: Map<string, PatternMatch[]> = new Map();

  /**
   * Compare our solution against similar merged PRs
   */
  async compare(
    owner: string,
    repo: string,
    ourChanges: CodeChange[],
    classification: BountyClassification,
    issueTitle?: string
  ): Promise<SolutionComparison> {
    console.log(`[SolutionComparator] Comparing solution for ${owner}/${repo}...`);

    // Find similar merged PRs
    const similarPRs = await this.findSimilarPRs(owner, repo, ourChanges, classification, issueTitle);

    // Analyze patterns from merged PRs
    const patterns = await this.analyzePatterns(owner, repo, similarPRs, ourChanges);

    // Calculate alignment
    const alignment = this.calculateAlignment(ourChanges, similarPRs, patterns);

    // Generate suggestions
    const { suggestions, warnings } = this.generateSuggestions(alignment, patterns, similarPRs);

    return {
      similarPRs,
      bestMatch: similarPRs[0] || null,
      patterns,
      antiPatterns: this.identifyAntiPatterns(patterns),
      alignmentScore: alignment.overall,
      alignmentDetails: {
        structureMatch: alignment.structure,
        styleMatch: alignment.style,
        approachMatch: alignment.approach,
        testingMatch: alignment.testing,
      },
      suggestions,
      warnings,
      confidence: similarPRs.length > 0 ? Math.min(0.9, 0.5 + similarPRs.length * 0.1) : 0.3,
    };
  }

  /**
   * Find similar merged PRs
   */
  private async findSimilarPRs(
    owner: string,
    repo: string,
    ourChanges: CodeChange[],
    classification: BountyClassification,
    issueTitle?: string
  ): Promise<SimilarPR[]> {
    const similarPRs: SimilarPR[] = [];

    try {
      // Get our changed files for comparison
      const ourFiles = ourChanges.map(c => c.path);
      const ourDirectories = [...new Set(ourFiles.map(f => f.split('/').slice(0, -1).join('/')))];

      // Search for merged PRs
      const searchQueries = [
        // By file path
        ...ourFiles.slice(0, 3).map(f => `repo:${owner}/${repo} is:pr is:merged "${f}"`),
        // By directory
        ...ourDirectories.slice(0, 2).map(d => `repo:${owner}/${repo} is:pr is:merged "${d}"`),
        // By classification type
        `repo:${owner}/${repo} is:pr is:merged ${this.classificationToKeyword(classification.type)}`,
      ];

      const seenPRs = new Set<number>();

      for (const query of searchQueries.slice(0, 3)) {
        try {
          const result = await this.mcp.call('github', 'search_issues', {
            q: query,
            sort: 'updated',
            order: 'desc',
            per_page: 10,
          });

          if (result?.data?.items) {
            for (const pr of result.data.items) {
              if (seenPRs.has(pr.number)) continue;
              seenPRs.add(pr.number);

              // Get PR details
              const prDetails = await this.getPRDetails(owner, repo, pr.number);
              if (prDetails) {
                similarPRs.push(prDetails);
              }

              if (similarPRs.length >= 5) break;
            }
          }
        } catch (err) {
          // Search query failed
        }

        if (similarPRs.length >= 5) break;
      }

      // Calculate similarity scores
      for (const pr of similarPRs) {
        pr.similarity = this.calculateSimilarity(ourChanges, pr, classification);
      }

      // Sort by similarity
      similarPRs.sort((a, b) => b.similarity - a.similarity);

    } catch (error) {
      console.warn('[SolutionComparator] Failed to find similar PRs:', error);
    }

    return similarPRs.slice(0, 5);
  }

  /**
   * Get PR details
   */
  private async getPRDetails(owner: string, repo: string, prNumber: number): Promise<SimilarPR | null> {
    try {
      const [pr, files] = await Promise.all([
        this.mcp.call('github', 'get_pull_request', { owner, repo, pull_number: prNumber }),
        this.mcp.call('github', 'list_pull_request_files', { owner, repo, pull_number: prNumber }),
      ]);

      if (!pr?.data || !pr.data.merged_at) return null;

      const createdAt = new Date(pr.data.created_at);
      const mergedAt = new Date(pr.data.merged_at);
      const timeToMerge = (mergedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

      return {
        number: prNumber,
        title: pr.data.title,
        url: pr.data.html_url,
        similarity: 0,  // Will be calculated later
        author: pr.data.user?.login || 'unknown',
        mergedAt,
        filesChanged: (files?.data || []).map((f: any) => f.filename),
        additions: pr.data.additions || 0,
        deletions: pr.data.deletions || 0,
        reviewComments: pr.data.review_comments || 0,
        timeToMerge,
        approach: this.extractApproach(pr.data.body || ''),
      };
    } catch (err) {
      return null;
    }
  }

  /**
   * Calculate similarity between our changes and a PR
   */
  private calculateSimilarity(
    ourChanges: CodeChange[],
    pr: SimilarPR,
    classification: BountyClassification
  ): number {
    const ourFiles = new Set(ourChanges.map(c => c.path));
    const prFiles = new Set(pr.filesChanged);

    // File overlap
    const overlap = [...ourFiles].filter(f => prFiles.has(f)).length;
    const fileScore = overlap / Math.max(ourFiles.size, prFiles.size);

    // Directory overlap
    const ourDirs = new Set([...ourFiles].map(f => f.split('/').slice(0, -1).join('/')));
    const prDirs = new Set([...prFiles].map(f => f.split('/').slice(0, -1).join('/')));
    const dirOverlap = [...ourDirs].filter(d => prDirs.has(d)).length;
    const dirScore = ourDirs.size > 0 ? dirOverlap / ourDirs.size : 0;

    // Size similarity
    const ourSize = ourChanges.reduce((sum, c) => sum + (c.content?.length || 0), 0);
    const prSize = pr.additions * 50;  // Rough estimate
    const sizeRatio = Math.min(ourSize, prSize) / Math.max(ourSize, prSize);

    // Weighted average
    return fileScore * 0.4 + dirScore * 0.3 + sizeRatio * 0.3;
  }

  /**
   * Analyze patterns from merged PRs
   */
  private async analyzePatterns(
    owner: string,
    repo: string,
    similarPRs: SimilarPR[],
    ourChanges: CodeChange[]
  ): Promise<PatternMatch[]> {
    const cacheKey = `${owner}/${repo}`;
    const cached = this.patternCache.get(cacheKey);
    if (cached && cached.length > 0) {
      return this.matchPatterns(cached, ourChanges);
    }

    const patterns: PatternMatch[] = [];

    if (similarPRs.length === 0) {
      return patterns;
    }

    // Extract patterns from PR data
    const hasTests = similarPRs.filter(pr =>
      pr.filesChanged.some(f => f.includes('test') || f.includes('spec'))
    ).length;
    const testRatio = hasTests / similarPRs.length;

    patterns.push({
      pattern: 'includes_tests',
      description: 'PR includes test files',
      frequency: testRatio,
      ourMatch: ourChanges.some(c => c.path.includes('test') || c.path.includes('spec')),
      importance: testRatio > 0.7 ? 'critical' : testRatio > 0.3 ? 'recommended' : 'optional',
    });

    // Check for documentation updates
    const hasDocs = similarPRs.filter(pr =>
      pr.filesChanged.some(f => f.includes('README') || f.includes('.md') || f.includes('docs/'))
    ).length;
    const docsRatio = hasDocs / similarPRs.length;

    patterns.push({
      pattern: 'updates_docs',
      description: 'PR updates documentation',
      frequency: docsRatio,
      ourMatch: ourChanges.some(c =>
        c.path.includes('README') || c.path.includes('.md') || c.path.includes('docs/')
      ),
      importance: docsRatio > 0.5 ? 'recommended' : 'optional',
    });

    // Check for single-focus PRs
    const avgFiles = similarPRs.reduce((sum, pr) => sum + pr.filesChanged.length, 0) / similarPRs.length;
    patterns.push({
      pattern: 'focused_changes',
      description: `PR changes ~${Math.round(avgFiles)} files on average`,
      frequency: 1,
      ourMatch: Math.abs(ourChanges.length - avgFiles) < avgFiles * 0.5,
      importance: 'recommended',
    });

    // Check for quick merges
    const avgMergeTime = similarPRs.reduce((sum, pr) => sum + pr.timeToMerge, 0) / similarPRs.length;
    patterns.push({
      pattern: 'reasonable_size',
      description: `Average merge time: ${avgMergeTime.toFixed(1)} hours`,
      frequency: 1,
      ourMatch: true,  // We can't know this yet
      importance: 'optional',
    });

    this.patternCache.set(cacheKey, patterns);

    return patterns;
  }

  /**
   * Match patterns against our changes
   */
  private matchPatterns(patterns: PatternMatch[], ourChanges: CodeChange[]): PatternMatch[] {
    return patterns.map(p => ({
      ...p,
      ourMatch: this.checkPatternMatch(p.pattern, ourChanges),
    }));
  }

  /**
   * Check if our changes match a pattern
   */
  private checkPatternMatch(pattern: string, ourChanges: CodeChange[]): boolean {
    switch (pattern) {
      case 'includes_tests':
        return ourChanges.some(c => c.path.includes('test') || c.path.includes('spec'));
      case 'updates_docs':
        return ourChanges.some(c =>
          c.path.includes('README') || c.path.includes('.md') || c.path.includes('docs/')
        );
      case 'focused_changes':
        return ourChanges.length <= 10;
      default:
        return true;
    }
  }

  /**
   * Calculate alignment score
   */
  private calculateAlignment(
    ourChanges: CodeChange[],
    similarPRs: SimilarPR[],
    patterns: PatternMatch[]
  ): { overall: number; structure: number; style: number; approach: number; testing: number } {
    if (similarPRs.length === 0) {
      return { overall: 50, structure: 50, style: 50, approach: 50, testing: 50 };
    }

    // Structure: file pattern similarity
    const bestMatch = similarPRs[0];
    const structure = bestMatch ? bestMatch.similarity * 100 : 50;

    // Style: pattern adherence
    const criticalPatterns = patterns.filter(p => p.importance === 'critical');
    const criticalMatch = criticalPatterns.filter(p => p.ourMatch).length;
    const style = criticalPatterns.length > 0
      ? (criticalMatch / criticalPatterns.length) * 100
      : 80;

    // Approach: based on similar PR approaches
    const approach = similarPRs.length > 0 ? 70 : 50;

    // Testing: test coverage patterns
    const testPattern = patterns.find(p => p.pattern === 'includes_tests');
    const testing = testPattern?.ourMatch ? 90 : testPattern?.frequency && testPattern.frequency > 0.5 ? 30 : 70;

    const overall = (structure * 0.3 + style * 0.3 + approach * 0.2 + testing * 0.2);

    return { overall, structure, style, approach, testing };
  }

  /**
   * Identify anti-patterns
   */
  private identifyAntiPatterns(patterns: PatternMatch[]): string[] {
    const antiPatterns: string[] = [];

    for (const pattern of patterns) {
      if (!pattern.ourMatch && pattern.importance === 'critical') {
        antiPatterns.push(`Missing ${pattern.description}`);
      }
    }

    return antiPatterns;
  }

  /**
   * Generate suggestions and warnings
   */
  private generateSuggestions(
    alignment: { overall: number; structure: number; style: number; approach: number; testing: number },
    patterns: PatternMatch[],
    similarPRs: SimilarPR[]
  ): { suggestions: string[]; warnings: string[] } {
    const suggestions: string[] = [];
    const warnings: string[] = [];

    // Pattern-based suggestions
    for (const pattern of patterns) {
      if (!pattern.ourMatch && pattern.frequency > 0.5) {
        if (pattern.importance === 'critical') {
          warnings.push(`Missing critical pattern: ${pattern.description}`);
        } else if (pattern.importance === 'recommended') {
          suggestions.push(`Consider: ${pattern.description}`);
        }
      }
    }

    // Alignment-based suggestions
    if (alignment.testing < 50) {
      warnings.push('Low testing alignment - consider adding tests');
    }
    if (alignment.structure < 40) {
      suggestions.push('Structure differs significantly from merged PRs');
    }

    // Similar PR based suggestions
    if (similarPRs.length > 0) {
      const avgSize = similarPRs.reduce((sum, pr) => sum + pr.additions, 0) / similarPRs.length;
      suggestions.push(`Similar PRs average ${Math.round(avgSize)} lines added`);
    }

    return { suggestions, warnings };
  }

  /**
   * Extract approach description from PR body
   */
  private extractApproach(body: string): string {
    // Look for approach/description section
    const sections = ['## approach', '## description', '## changes', '## summary'];
    const lines = body.toLowerCase().split('\n');

    for (const section of sections) {
      const index = lines.findIndex(l => l.includes(section));
      if (index >= 0) {
        const content = lines.slice(index + 1, index + 5).join(' ');
        return content.slice(0, 200);
      }
    }

    return body.slice(0, 200);
  }

  /**
   * Convert classification type to search keyword
   */
  private classificationToKeyword(type: string): string {
    const mapping: Record<string, string> = {
      'bug-fix-simple': 'fix bug',
      'bug-fix-complex': 'fix',
      'feature-small': 'feat add',
      'feature-large': 'feature implement',
      'refactor': 'refactor',
      'documentation': 'docs documentation',
      'test': 'test',
      'chore': 'chore',
    };
    return mapping[type] || type;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let comparator: SolutionComparator | null = null;

export function getSolutionComparator(): SolutionComparator {
  if (!comparator) {
    comparator = new SolutionComparator();
  }
  return comparator;
}

export function resetSolutionComparator(): void {
  comparator = null;
}
