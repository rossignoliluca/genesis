/**
 * Issue Analyzer v19.7
 *
 * Deep analysis of GitHub issues to understand exact requirements:
 * - Parses issue structure and components
 * - Extracts acceptance criteria
 * - Identifies scope and complexity
 * - Detects hidden requirements
 * - Validates solution completeness
 *
 * This ensures we fully understand what's needed before coding.
 *
 * @module economy/issue-analyzer
 * @version 19.7.0
 */

import { getMCPClient } from '../mcp/index.js';
import { getHybridRouter } from '../llm/router.js';
import type { Bounty } from './generators/bounty-hunter.js';

// ============================================================================
// Types
// ============================================================================

export interface IssueAnalysis {
  // Core understanding
  summary: string;
  problemStatement: string;
  desiredOutcome: string;

  // Requirements
  requirements: Requirement[];
  acceptanceCriteria: string[];
  outOfScope: string[];

  // Technical details
  affectedFiles: string[];
  suggestedApproach: string;
  potentialPitfalls: string[];
  testingRequirements: string[];

  // Scope
  scope: 'trivial' | 'small' | 'medium' | 'large' | 'epic';
  estimatedComplexity: number;  // 1-10
  breakingChangeLikelihood: number;  // 0-1

  // Confidence
  clarity: number;  // 0-1 how clear are requirements
  completeness: number;  // 0-1 how complete is the analysis
  confidence: number;  // 0-1 overall confidence

  // Warnings
  warnings: string[];
  blockers: string[];
}

export interface Requirement {
  id: string;
  description: string;
  type: 'functional' | 'non-functional' | 'constraint' | 'edge-case';
  priority: 'must' | 'should' | 'could' | 'nice-to-have';
  verified: boolean;
}

export interface SolutionValidation {
  complete: boolean;
  coverage: number;  // 0-1 requirement coverage
  requirementsMet: string[];
  requirementsUnmet: string[];
  suggestions: string[];
}

// ============================================================================
// Issue Analyzer
// ============================================================================

export class IssueAnalyzer {
  private mcp = getMCPClient();
  private router = getHybridRouter();
  private analysisCache: Map<string, IssueAnalysis> = new Map();

  /**
   * Analyze a GitHub issue in depth
   */
  async analyzeIssue(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<IssueAnalysis> {
    const cacheKey = `${owner}/${repo}#${issueNumber}`;

    // Check cache
    const cached = this.analysisCache.get(cacheKey);
    if (cached && cached.confidence > 0.7) {
      return cached;
    }

    console.log(`[IssueAnalyzer] Analyzing ${cacheKey}...`);

    // Fetch issue data
    const issueData = await this.fetchIssueData(owner, repo, issueNumber);

    // Analyze with LLM
    const analysis = await this.performAnalysis(issueData, owner, repo);

    this.analysisCache.set(cacheKey, analysis);

    return analysis;
  }

  /**
   * Analyze a bounty (wrapper for consistency)
   */
  async analyzeBounty(bounty: Bounty): Promise<IssueAnalysis | null> {
    if (!bounty.sourceMetadata?.org || !bounty.sourceMetadata?.repo || !bounty.sourceMetadata?.issueNumber) {
      console.log('[IssueAnalyzer] Bounty has no issue reference');
      return null;
    }

    return this.analyzeIssue(
      bounty.sourceMetadata.org,
      bounty.sourceMetadata.repo,
      bounty.sourceMetadata.issueNumber
    );
  }

  /**
   * Fetch comprehensive issue data
   */
  private async fetchIssueData(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<{
    issue: any;
    comments: any[];
    linkedPRs: any[];
    repoContext: any;
  }> {
    const [issue, comments, repoInfo] = await Promise.all([
      this.mcp.call('github', 'get_issue', { owner, repo, issue_number: issueNumber }),
      this.mcp.call('github', 'list_issue_comments', { owner, repo, issue_number: issueNumber, per_page: 50 }),
      this.mcp.call('github', 'get_repository', { owner, repo }),
    ]);

    // Look for linked PRs in timeline
    let linkedPRs: any[] = [];
    try {
      // Search for PRs mentioning this issue
      const searchResult = await this.mcp.call('github', 'search_issues', {
        q: `repo:${owner}/${repo} is:pr ${issueNumber}`,
        per_page: 10,
      });
      linkedPRs = searchResult?.data?.items || [];
    } catch {
      // Timeline not available
    }

    return {
      issue: issue?.data,
      comments: comments?.data || [],
      linkedPRs,
      repoContext: repoInfo?.data,
    };
  }

  /**
   * Perform deep analysis using LLM
   */
  private async performAnalysis(
    data: { issue: any; comments: any[]; linkedPRs: any[]; repoContext: any },
    owner: string,
    repo: string
  ): Promise<IssueAnalysis> {
    const systemPrompt = `You are an expert at analyzing GitHub issues to extract clear requirements.

Analyze the issue and extract:
1. Core problem and desired outcome
2. All explicit and implicit requirements
3. Acceptance criteria (what defines "done")
4. Files likely affected
5. Suggested technical approach
6. Potential pitfalls to avoid
7. Testing requirements
8. What's explicitly out of scope

Return JSON:
{
  "summary": "One-line summary",
  "problemStatement": "What problem needs solving",
  "desiredOutcome": "What success looks like",
  "requirements": [
    {"id": "R1", "description": "...", "type": "functional|non-functional|constraint|edge-case", "priority": "must|should|could|nice-to-have"}
  ],
  "acceptanceCriteria": ["Criterion 1", "Criterion 2"],
  "outOfScope": ["What should NOT be done"],
  "affectedFiles": ["file/paths/to/check.ts"],
  "suggestedApproach": "How to implement",
  "potentialPitfalls": ["Common mistakes to avoid"],
  "testingRequirements": ["What tests are needed"],
  "scope": "trivial|small|medium|large|epic",
  "estimatedComplexity": 1-10,
  "breakingChangeLikelihood": 0.0-1.0,
  "clarity": 0.0-1.0,
  "completeness": 0.0-1.0,
  "warnings": ["Concerns about the issue"],
  "blockers": ["Things that make this impossible"]
}`;

    // Build context
    const issueContent = `
# Issue: ${data.issue?.title}

## Body:
${data.issue?.body || 'No description'}

## Labels:
${(data.issue?.labels || []).map((l: any) => l.name).join(', ') || 'None'}

## Comments (${data.comments.length}):
${data.comments.slice(0, 10).map((c: any) =>
  `@${c.user?.login}: ${c.body?.slice(0, 500)}`
).join('\n\n')}

## Repository Context:
- Language: ${data.repoContext?.language || 'Unknown'}
- Description: ${data.repoContext?.description || 'N/A'}

## Related PRs (${data.linkedPRs.length}):
${data.linkedPRs.slice(0, 3).map((pr: any) =>
  `- #${pr.number}: ${pr.title} (${pr.state})`
).join('\n')}
`;

    try {
      const response = await this.router.execute(
        `Analyze this GitHub issue and extract requirements:\n\n${issueContent}`,
        systemPrompt
      );

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        return {
          summary: parsed.summary || 'Unknown',
          problemStatement: parsed.problemStatement || '',
          desiredOutcome: parsed.desiredOutcome || '',
          requirements: (parsed.requirements || []).map((r: any, i: number) => ({
            id: r.id || `R${i + 1}`,
            description: r.description || '',
            type: r.type || 'functional',
            priority: r.priority || 'should',
            verified: false,
          })),
          acceptanceCriteria: parsed.acceptanceCriteria || [],
          outOfScope: parsed.outOfScope || [],
          affectedFiles: parsed.affectedFiles || [],
          suggestedApproach: parsed.suggestedApproach || '',
          potentialPitfalls: parsed.potentialPitfalls || [],
          testingRequirements: parsed.testingRequirements || [],
          scope: parsed.scope || 'medium',
          estimatedComplexity: parsed.estimatedComplexity || 5,
          breakingChangeLikelihood: parsed.breakingChangeLikelihood || 0.1,
          clarity: parsed.clarity || 0.5,
          completeness: parsed.completeness || 0.5,
          confidence: Math.min(parsed.clarity || 0.5, parsed.completeness || 0.5),
          warnings: parsed.warnings || [],
          blockers: parsed.blockers || [],
        };
      }
    } catch (error) {
      console.warn('[IssueAnalyzer] Analysis failed:', error);
    }

    // Return minimal analysis on failure
    return {
      summary: data.issue?.title || 'Unknown',
      problemStatement: data.issue?.body?.slice(0, 200) || '',
      desiredOutcome: '',
      requirements: [],
      acceptanceCriteria: [],
      outOfScope: [],
      affectedFiles: [],
      suggestedApproach: '',
      potentialPitfalls: [],
      testingRequirements: [],
      scope: 'medium',
      estimatedComplexity: 5,
      breakingChangeLikelihood: 0.2,
      clarity: 0.3,
      completeness: 0.3,
      confidence: 0.3,
      warnings: ['Could not fully analyze issue'],
      blockers: [],
    };
  }

  /**
   * Validate a solution against issue requirements
   */
  async validateSolution(
    analysis: IssueAnalysis,
    solutionDescription: string,
    changedFiles: string[]
  ): Promise<SolutionValidation> {
    const systemPrompt = `You are validating a solution against issue requirements.

Requirements:
${analysis.requirements.map(r => `- [${r.priority}] ${r.description}`).join('\n')}

Acceptance Criteria:
${analysis.acceptanceCriteria.map(c => `- ${c}`).join('\n')}

Return JSON:
{
  "complete": true/false,
  "coverage": 0.0-1.0,
  "requirementsMet": ["R1", "R2"],
  "requirementsUnmet": ["R3"],
  "suggestions": ["How to improve"]
}`;

    try {
      const response = await this.router.execute(
        `Solution description:\n${solutionDescription}\n\nFiles changed:\n${changedFiles.join('\n')}`,
        systemPrompt
      );

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          complete: parsed.complete ?? false,
          coverage: parsed.coverage ?? 0,
          requirementsMet: parsed.requirementsMet || [],
          requirementsUnmet: parsed.requirementsUnmet || [],
          suggestions: parsed.suggestions || [],
        };
      }
    } catch (error) {
      console.warn('[IssueAnalyzer] Validation failed:', error);
    }

    return {
      complete: false,
      coverage: 0,
      requirementsMet: [],
      requirementsUnmet: analysis.requirements.map(r => r.id),
      suggestions: ['Could not validate solution'],
    };
  }

  /**
   * Generate a checklist from the analysis
   */
  generateChecklist(analysis: IssueAnalysis): string {
    const lines: string[] = [];

    lines.push(`# Issue Checklist: ${analysis.summary}\n`);

    lines.push('## Requirements');
    for (const req of analysis.requirements) {
      const priority = req.priority === 'must' ? '**' : '';
      lines.push(`- [ ] ${priority}[${req.priority.toUpperCase()}]${priority} ${req.description}`);
    }
    lines.push('');

    lines.push('## Acceptance Criteria');
    for (const criterion of analysis.acceptanceCriteria) {
      lines.push(`- [ ] ${criterion}`);
    }
    lines.push('');

    if (analysis.testingRequirements.length > 0) {
      lines.push('## Testing');
      for (const test of analysis.testingRequirements) {
        lines.push(`- [ ] ${test}`);
      }
      lines.push('');
    }

    if (analysis.potentialPitfalls.length > 0) {
      lines.push('## Avoid These Pitfalls');
      for (const pitfall of analysis.potentialPitfalls) {
        lines.push(`- ⚠️ ${pitfall}`);
      }
      lines.push('');
    }

    if (analysis.warnings.length > 0) {
      lines.push('## Warnings');
      for (const warning of analysis.warnings) {
        lines.push(`- 🚨 ${warning}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Check if issue is suitable for automation
   */
  isSuitableForAutomation(analysis: IssueAnalysis): { suitable: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // Check blockers
    if (analysis.blockers.length > 0) {
      reasons.push(`Has ${analysis.blockers.length} blocker(s)`);
    }

    // Check clarity
    if (analysis.clarity < 0.4) {
      reasons.push('Issue is unclear');
    }

    // Check complexity
    if (analysis.estimatedComplexity > 7) {
      reasons.push('Too complex for automation');
    }

    // Check scope
    if (analysis.scope === 'epic') {
      reasons.push('Epic-scale issues not suitable');
    }

    // Check breaking change risk
    if (analysis.breakingChangeLikelihood > 0.5) {
      reasons.push('High breaking change risk');
    }

    // Check requirements count
    if (analysis.requirements.filter(r => r.priority === 'must').length > 10) {
      reasons.push('Too many mandatory requirements');
    }

    return {
      suitable: reasons.length === 0,
      reasons,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let analyzer: IssueAnalyzer | null = null;

export function getIssueAnalyzer(): IssueAnalyzer {
  if (!analyzer) {
    analyzer = new IssueAnalyzer();
  }
  return analyzer;
}

export function resetIssueAnalyzer(): void {
  analyzer = null;
}
