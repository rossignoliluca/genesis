/**
 * Fix Generator — Converts improvement proposals into executable modification plans
 *
 * Two modes:
 * - Rule-based (instant): For known patterns like persist/refresh
 * - LLM-based (needs API): Reads target module code, generates minimal fix
 *
 * Output format: ModificationPlan compatible with Darwin-Gödel engine
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { ImprovementProposal } from './types.js';

// ============================================================================
// Types (compatible with Darwin-Gödel ModificationPlan)
// ============================================================================

export interface Modification {
  id: string;
  description: string;
  targetFile: string;       // Relative to src/
  type: 'replace' | 'append';
  content: string;
  search?: string;          // For replace: exact string to find
  reason: string;
  expectedImprovement: string;
}

export interface ModificationPlan {
  id: string;
  name: string;
  description: string;
  modifications: Modification[];
  createdAt: Date;
}

export type FixResult =
  | { kind: 'plan'; plan: ModificationPlan }
  | { kind: 'runtime-action'; action: string }
  | { kind: 'skip'; reason: string };

// ============================================================================
// Fix Generator
// ============================================================================

export class FixGenerator {
  constructor(private rootPath: string) {}

  /**
   * Generate a fix for a proposal. Returns a plan, runtime action, or skip.
   */
  async generateFix(proposal: ImprovementProposal): Promise<FixResult> {
    // Try rule-based first
    const ruleFix = this.tryRuleBasedFix(proposal);
    if (ruleFix) return ruleFix;

    // Fall back to LLM
    return this.generateLLMFix(proposal);
  }

  // ==========================================================================
  // Rule-Based Fixes (instant, no LLM)
  // ==========================================================================

  private tryRuleBasedFix(proposal: ImprovementProposal): FixResult | null {
    // Capability proposals are runtime actions, not code changes
    if (proposal.category === 'capability') {
      if (proposal.title.toLowerCase().includes('persist')) {
        return { kind: 'runtime-action', action: 'persist' };
      }
      if (proposal.title.toLowerCase().includes('refresh')) {
        return { kind: 'runtime-action', action: 'refresh' };
      }
    }

    return null;
  }

  // ==========================================================================
  // LLM-Based Fixes
  // ==========================================================================

  private async generateLLMFix(proposal: ImprovementProposal): Promise<FixResult> {
    // Read target module code for context
    const moduleCode = this.readModuleCode(proposal.targetModule);
    if (!moduleCode) {
      return { kind: 'skip', reason: `Cannot read module: ${proposal.targetModule}` };
    }

    // Read bus events for context
    const busEvents = this.readBusEvents();

    // Build prompt
    const prompt = this.buildPrompt(proposal, moduleCode, busEvents);

    // Call LLM (requires ANTHROPIC_API_KEY)
    if (!process.env.ANTHROPIC_API_KEY) {
      return { kind: 'skip', reason: 'No ANTHROPIC_API_KEY — LLM-based fix requires API access' };
    }

    try {
      const { LLMBridge } = await import('../llm/index.js');
      const llm = new LLMBridge({
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      });

      const response = await llm.chat(prompt, SYSTEM_PROMPT);

      // Parse response into ModificationPlan
      const plan = this.parseResponse(response.content, proposal);
      if (!plan) {
        return { kind: 'skip', reason: 'LLM response could not be parsed into a valid plan' };
      }

      return { kind: 'plan', plan };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { kind: 'skip', reason: `LLM error: ${msg}` };
    }
  }

  private readModuleCode(moduleName: string): string | null {
    const modulePath = join(this.rootPath, 'src', moduleName);
    if (!existsSync(modulePath)) return null;

    const lines: string[] = [];

    // Read index.ts first (most important)
    const indexPath = join(modulePath, 'index.ts');
    if (existsSync(indexPath)) {
      const content = readFileSync(indexPath, 'utf-8');
      // Cap at 200 lines to fit in context
      const indexLines = content.split('\n').slice(0, 200);
      lines.push(`--- ${moduleName}/index.ts (${indexLines.length} lines) ---`);
      lines.push(indexLines.join('\n'));
    }

    // List other .ts files
    try {
      const files = readdirSync(modulePath)
        .filter(f => f.endsWith('.ts') && f !== 'index.ts' && !f.endsWith('.test.ts'));
      if (files.length > 0) {
        lines.push(`\n--- Other files in ${moduleName}/: ${files.join(', ')} ---`);
      }
    } catch {
      // ignore
    }

    return lines.join('\n');
  }

  private readBusEvents(): string {
    try {
      const eventsPath = join(this.rootPath, 'src', 'bus', 'events.ts');
      const content = readFileSync(eventsPath, 'utf-8');

      // Extract just the GenesisEventMap keys (topic names)
      const topicLines: string[] = [];
      const lines = content.split('\n');
      let inMap = false;

      for (const line of lines) {
        if (line.includes('GenesisEventMap')) inMap = true;
        if (inMap && line.match(/^\s+'/)) {
          const match = line.match(/'([^']+)'/);
          if (match) topicLines.push(match[1]);
        }
        if (inMap && line.trim() === '}') break;
      }

      return topicLines.join('\n');
    } catch {
      return '(could not read bus events)';
    }
  }

  private buildPrompt(
    proposal: ImprovementProposal,
    moduleCode: string,
    busEvents: string,
  ): string {
    return `You need to fix this issue in the Genesis codebase.

ISSUE: ${proposal.title}
EVIDENCE: ${proposal.evidence}
TARGET MODULE: src/${proposal.targetModule}/
SUGGESTED ACTION: ${proposal.suggestedAction}

CURRENT CODE:
${moduleCode}

AVAILABLE BUS EVENT TOPICS:
${busEvents}

RULES:
- Modify ONE file only
- Use createPublisher() for bus event publishing
- Import from '../bus/index.js' (always use .js extension in imports)
- Keep changes minimal (< 30 lines of new code)
- For "replace" type: provide the EXACT search string that exists in the file
- For "append" type: provide code to add at the end of the file

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "targetFile": "module-name/file.ts",
  "type": "replace",
  "search": "exact string to find in file",
  "content": "replacement code",
  "reason": "one line explanation"
}`;
  }

  private parseResponse(content: string, proposal: ImprovementProposal): ModificationPlan | null {
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(jsonStr);

      if (!parsed.targetFile || !parsed.type || !parsed.content) {
        return null;
      }

      const modification: Modification = {
        id: `fix-${proposal.targetModule}-${Date.now()}`,
        description: parsed.reason || proposal.title,
        targetFile: parsed.targetFile,
        type: parsed.type,
        content: parsed.content,
        search: parsed.search,
        reason: parsed.reason || proposal.suggestedAction,
        expectedImprovement: proposal.title,
      };

      return {
        id: `plan-${proposal.targetModule}-${Date.now()}`,
        name: `Fix: ${proposal.title}`,
        description: proposal.description,
        modifications: [modification],
        createdAt: new Date(),
      };
    } catch {
      return null;
    }
  }
}

// ============================================================================
// System Prompt
// ============================================================================

const SYSTEM_PROMPT = `You are Genesis, an autonomous AI system performing self-modification.
You are analyzing your own source code to fix an issue detected by your self-model.

You must output ONLY valid JSON — no explanations, no markdown formatting.
The JSON describes a single code modification to fix the detected issue.

Be precise with search strings — they must match exactly what's in the file.
Keep changes minimal and focused. One file, one modification.`;
