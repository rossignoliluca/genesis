/**
 * PR Template Matcher v19.6
 *
 * Ensures PR descriptions match repository templates:
 * - Fetches and parses PR templates
 * - Fills in required sections
 * - Validates completeness
 * - Generates compliant descriptions
 *
 * This increases acceptance by following repo conventions.
 *
 * @module economy/pr-template-matcher
 * @version 19.6.0
 */

import { getMCPClient } from '../mcp/index.js';
import { getHybridRouter } from '../llm/router.js';
import type { Bounty } from './generators/bounty-hunter.js';
import type { CodeChange } from './live/pr-pipeline.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface PRTemplate {
  repo: string;
  rawContent: string;
  sections: TemplateSection[];
  checkboxes: TemplateCheckbox[];
  hasContributorLicense: boolean;
  hasTestRequirements: boolean;
  hasIssueLink: boolean;
}

export interface TemplateSection {
  name: string;
  required: boolean;
  description?: string;
  placeholder?: string;
}

export interface TemplateCheckbox {
  text: string;
  required: boolean;
  defaultChecked: boolean;
}

export interface FilledPRDescription {
  title: string;
  body: string;
  sections: Record<string, string>;
  checkboxesChecked: string[];
  issueLink?: string;
  confidence: number;
}

// ============================================================================
// Common PR Template Patterns
// ============================================================================

const COMMON_SECTIONS = [
  { pattern: /##?\s*description/i, name: 'Description', required: true },
  { pattern: /##?\s*changes?/i, name: 'Changes', required: true },
  { pattern: /##?\s*motivation/i, name: 'Motivation', required: false },
  { pattern: /##?\s*context/i, name: 'Context', required: false },
  { pattern: /##?\s*type of change/i, name: 'Type of Change', required: false },
  { pattern: /##?\s*how has this been tested/i, name: 'Testing', required: true },
  { pattern: /##?\s*test(s|ing)?/i, name: 'Testing', required: false },
  { pattern: /##?\s*screenshots?/i, name: 'Screenshots', required: false },
  { pattern: /##?\s*checklist/i, name: 'Checklist', required: false },
  { pattern: /##?\s*related issues?/i, name: 'Related Issues', required: false },
  { pattern: /##?\s*breaking changes?/i, name: 'Breaking Changes', required: false },
  { pattern: /##?\s*additional notes?/i, name: 'Additional Notes', required: false },
];

const CHECKBOX_PATTERNS = [
  { pattern: /tests? (?:added|included|written)/i, name: 'tests_added' },
  { pattern: /documentation (?:updated|added)/i, name: 'docs_updated' },
  { pattern: /lint.*pass/i, name: 'lint_pass' },
  { pattern: /code review/i, name: 'code_review' },
  { pattern: /breaking change/i, name: 'breaking_change' },
  { pattern: /cla|contributor.*license/i, name: 'cla_signed' },
];

// ============================================================================
// PR Template Matcher
// ============================================================================

export class PRTemplateMatcher {
  private mcp = getMCPClient();
  private router = getHybridRouter();
  private templateCache: Map<string, PRTemplate> = new Map();
  private persistPath: string;

  constructor(persistPath?: string) {
    this.persistPath = persistPath ?? '.genesis/pr-templates.json';
    this.load();
  }

  /**
   * Fetch and parse PR template for a repository
   */
  async getTemplate(owner: string, repo: string): Promise<PRTemplate | null> {
    const cacheKey = `${owner}/${repo}`;

    // Check cache
    const cached = this.templateCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    console.log(`[PRTemplateMatcher] Fetching PR template for ${cacheKey}...`);

    // Try common template locations
    const templatePaths = [
      '.github/PULL_REQUEST_TEMPLATE.md',
      '.github/pull_request_template.md',
      'PULL_REQUEST_TEMPLATE.md',
      'pull_request_template.md',
      '.github/PULL_REQUEST_TEMPLATE/default.md',
      'docs/PULL_REQUEST_TEMPLATE.md',
    ];

    for (const templatePath of templatePaths) {
      try {
        const content = await this.mcp.call('github', 'get_file_contents', {
          owner,
          repo,
          path: templatePath,
        });

        if (content?.data?.content) {
          const decoded = Buffer.from(content.data.content, 'base64').toString('utf-8');
          const template = this.parseTemplate(cacheKey, decoded);
          this.templateCache.set(cacheKey, template);
          this.save();
          console.log(`[PRTemplateMatcher] Found template at ${templatePath}`);
          return template;
        }
      } catch (err) {
        // Try next path
      }
    }

    console.log(`[PRTemplateMatcher] No PR template found for ${cacheKey}`);
    return null;
  }

  /**
   * Parse a PR template into structured sections
   */
  private parseTemplate(repo: string, content: string): PRTemplate {
    const sections: TemplateSection[] = [];
    const checkboxes: TemplateCheckbox[] = [];

    // Find sections
    for (const sectionDef of COMMON_SECTIONS) {
      const match = content.match(sectionDef.pattern);
      if (match) {
        sections.push({
          name: sectionDef.name,
          required: sectionDef.required,
        });
      }
    }

    // Find checkboxes
    const checkboxMatches = content.match(/- \[[ x]\] .+/gi) || [];
    for (const checkbox of checkboxMatches) {
      const isChecked = checkbox.includes('[x]') || checkbox.includes('[X]');
      const text = checkbox.replace(/- \[[ xX]\] /, '').trim();

      // Determine if required
      const required = text.toLowerCase().includes('required') ||
                       text.toLowerCase().includes('must') ||
                       text.toLowerCase().includes('mandatory');

      checkboxes.push({
        text,
        required,
        defaultChecked: isChecked,
      });
    }

    // Check for specific requirements
    const hasContributorLicense = /cla|contributor.*license|dco/i.test(content);
    const hasTestRequirements = /test.*required|must.*test|include.*test/i.test(content);
    const hasIssueLink = /fixes #|closes #|related.*#|issue.*link/i.test(content);

    return {
      repo,
      rawContent: content,
      sections,
      checkboxes,
      hasContributorLicense,
      hasTestRequirements,
      hasIssueLink,
    };
  }

  /**
   * Generate a PR description that matches the template
   */
  async generateDescription(
    template: PRTemplate | null,
    bounty: Bounty,
    changes: CodeChange[],
    solutionDescription: string,
    issueNumber?: number
  ): Promise<FilledPRDescription> {
    // If no template, generate standard description
    if (!template) {
      return this.generateStandardDescription(bounty, changes, solutionDescription, issueNumber);
    }

    console.log(`[PRTemplateMatcher] Generating description matching template...`);

    const systemPrompt = `You are an expert at writing PR descriptions that match repository templates.

PR TEMPLATE STRUCTURE:
${template.sections.map(s => `- ${s.name}${s.required ? ' (REQUIRED)' : ''}`).join('\n')}

CHECKBOXES TO ADDRESS:
${template.checkboxes.map(c => `- [${c.defaultChecked ? 'x' : ' '}] ${c.text}${c.required ? ' (REQUIRED)' : ''}`).join('\n')}

REQUIREMENTS:
1. Fill ALL required sections
2. Use the exact section headers from the template
3. Be specific and detailed
4. Include test information if tests were added
5. Reference the issue if provided
6. Check appropriate boxes

Return JSON:
{
  "title": "PR title (50 chars max)",
  "sections": {
    "Description": "...",
    "Changes": "...",
    ...
  },
  "checkboxesChecked": ["text of checked boxes"],
  "confidence": 0.0-1.0
}`;

    const changesPreview = changes.map(c => `- ${c.path}: ${c.operation}`).join('\n');

    const userPrompt = `Generate PR description for this bounty:

Bounty: ${bounty.title}
Description: ${bounty.description}
Solution: ${solutionDescription}

Files Changed:
${changesPreview}

${issueNumber ? `Related Issue: #${issueNumber}` : ''}

Generate JSON matching the template:`;

    try {
      const response = await this.router.execute(userPrompt, systemPrompt);

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Build the body from sections
        const body = this.buildBody(template, parsed.sections, parsed.checkboxesChecked, issueNumber);

        return {
          title: parsed.title || `${bounty.title.slice(0, 50)}`,
          body,
          sections: parsed.sections || {},
          checkboxesChecked: parsed.checkboxesChecked || [],
          issueLink: issueNumber ? `#${issueNumber}` : undefined,
          confidence: parsed.confidence || 0.7,
        };
      }
    } catch (error) {
      console.error('[PRTemplateMatcher] Failed to generate description:', error);
    }

    // Fallback to standard
    return this.generateStandardDescription(bounty, changes, solutionDescription, issueNumber);
  }

  /**
   * Build the PR body from sections
   */
  private buildBody(
    template: PRTemplate,
    sections: Record<string, string>,
    checkboxesChecked: string[],
    issueNumber?: number
  ): string {
    const lines: string[] = [];

    // Add sections in template order
    for (const section of template.sections) {
      const content = sections[section.name];
      if (content) {
        lines.push(`## ${section.name}`);
        lines.push(content);
        lines.push('');
      } else if (section.required) {
        // Add placeholder for required sections
        lines.push(`## ${section.name}`);
        lines.push('_To be filled_');
        lines.push('');
      }
    }

    // Add issue link if template expects it
    if (template.hasIssueLink && issueNumber) {
      lines.push(`## Related Issues`);
      lines.push(`Closes #${issueNumber}`);
      lines.push('');
    }

    // Add checkboxes
    if (template.checkboxes.length > 0) {
      lines.push('## Checklist');
      for (const checkbox of template.checkboxes) {
        const isChecked = checkboxesChecked.some(c =>
          c.toLowerCase().includes(checkbox.text.toLowerCase().slice(0, 20))
        ) || checkbox.defaultChecked;
        lines.push(`- [${isChecked ? 'x' : ' '}] ${checkbox.text}`);
      }
      lines.push('');
    }

    // Add bot signature
    lines.push('---');
    lines.push('*This PR was generated by Genesis AI Bot*');

    return lines.join('\n');
  }

  /**
   * Generate a standard description when no template exists
   */
  private generateStandardDescription(
    bounty: Bounty,
    changes: CodeChange[],
    solutionDescription: string,
    issueNumber?: number
  ): FilledPRDescription {
    const lines: string[] = [];

    lines.push('## Description');
    lines.push(solutionDescription);
    lines.push('');

    lines.push('## Changes');
    for (const change of changes) {
      lines.push(`- \`${change.path}\`: ${change.operation}`);
    }
    lines.push('');

    lines.push('## Bounty Reference');
    lines.push(`- Title: ${bounty.title}`);
    lines.push(`- Platform: ${bounty.platform}`);
    if (bounty.reward) {
      lines.push(`- Reward: $${bounty.reward}`);
    }
    lines.push('');

    if (issueNumber) {
      lines.push('## Related Issues');
      lines.push(`Closes #${issueNumber}`);
      lines.push('');
    }

    lines.push('---');
    lines.push('*This PR was generated by Genesis AI Bot*');

    return {
      title: `[AI Bot] ${bounty.title.slice(0, 50)}`,
      body: lines.join('\n'),
      sections: {
        Description: solutionDescription,
        Changes: changes.map(c => `${c.path}: ${c.operation}`).join('\n'),
      },
      checkboxesChecked: [],
      issueLink: issueNumber ? `#${issueNumber}` : undefined,
      confidence: 0.6,
    };
  }

  /**
   * Validate that a PR description meets template requirements
   */
  validateDescription(
    template: PRTemplate,
    description: FilledPRDescription
  ): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    // Check required sections
    for (const section of template.sections) {
      if (section.required && !description.sections[section.name]) {
        missing.push(`Section: ${section.name}`);
      }
    }

    // Check required checkboxes
    for (const checkbox of template.checkboxes) {
      if (checkbox.required) {
        const isChecked = description.checkboxesChecked.some(c =>
          c.toLowerCase().includes(checkbox.text.toLowerCase().slice(0, 20))
        );
        if (!isChecked) {
          missing.push(`Checkbox: ${checkbox.text.slice(0, 50)}`);
        }
      }
    }

    // Check issue link
    if (template.hasIssueLink && !description.issueLink) {
      missing.push('Issue link required');
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Get template requirements summary
   */
  getTemplateRequirements(template: PRTemplate): string {
    const lines: string[] = [];

    lines.push('# PR Template Requirements\n');

    lines.push('## Required Sections');
    const required = template.sections.filter(s => s.required);
    if (required.length > 0) {
      for (const s of required) {
        lines.push(`- ${s.name}`);
      }
    } else {
      lines.push('- None specified');
    }
    lines.push('');

    lines.push('## Required Checkboxes');
    const requiredCheckboxes = template.checkboxes.filter(c => c.required);
    if (requiredCheckboxes.length > 0) {
      for (const c of requiredCheckboxes) {
        lines.push(`- ${c.text}`);
      }
    } else {
      lines.push('- None specified');
    }
    lines.push('');

    lines.push('## Special Requirements');
    if (template.hasContributorLicense) lines.push('- CLA/DCO signature required');
    if (template.hasTestRequirements) lines.push('- Tests required');
    if (template.hasIssueLink) lines.push('- Issue link required');

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

      const data: Record<string, PRTemplate> = {};
      for (const [key, template] of this.templateCache) {
        data[key] = template;
      }

      fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[PRTemplateMatcher] Failed to save:', error);
    }
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.persistPath)) return;

      const data = JSON.parse(fs.readFileSync(this.persistPath, 'utf-8'));

      for (const [key, template] of Object.entries(data)) {
        this.templateCache.set(key, template as PRTemplate);
      }

      console.log(`[PRTemplateMatcher] Loaded ${this.templateCache.size} templates`);
    } catch (error) {
      console.error('[PRTemplateMatcher] Failed to load:', error);
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let matcher: PRTemplateMatcher | null = null;

export function getPRTemplateMatcher(): PRTemplateMatcher {
  if (!matcher) {
    matcher = new PRTemplateMatcher();
  }
  return matcher;
}

export function resetPRTemplateMatcher(): void {
  matcher = null;
}
