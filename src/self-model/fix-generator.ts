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
    // Category-specific context
    const categoryContext = this.getCategoryContext(proposal, busEvents);

    return `Fix this issue in the Genesis TypeScript codebase.

ISSUE: ${proposal.title}
EVIDENCE: ${proposal.evidence}
TARGET: src/${proposal.targetModule}/
ACTION: ${proposal.suggestedAction}

TARGET MODULE CODE:
${moduleCode}

${categoryContext}

CRITICAL RULES:
1. Modify ONE file only (the index.ts of the target module)
2. All imports must use '.js' extension
3. The "search" field must be a VERBATIM copy-paste from the code shown above — match whitespace exactly
4. Use "type": "replace" to replace existing code with fixed version
5. Keep added code to < 20 lines
6. Preserve ALL existing exports and functionality — only ADD the fix
7. Cast any event payloads with "as any"

OUTPUT FORMAT — respond with ONLY this JSON, no markdown, no explanation:
{"targetFile":"${proposal.targetModule}/index.ts","type":"replace","search":"exact verbatim string from code","content":"replacement with fix added","reason":"one line"}

IMPORTANT: targetFile is relative to src/ — write "${proposal.targetModule}/index.ts", NOT "src/${proposal.targetModule}/index.ts"`;
  }

  private getCategoryContext(proposal: ImprovementProposal, busEvents: string): string {
    switch (proposal.category) {
      case 'wiring':
        return `AVAILABLE BUS TOPICS (from GenesisEventMap):
${busEvents}

CORRECT PATTERN FOR BUS PUBLISHING:
\`\`\`typescript
import { createPublisher } from '../bus/index.js';
const publisher = createPublisher('module-name');
publisher.publish('topic.event.name', {
  source: 'module-name',
  precision: 1.0,
} as any);
\`\`\`

NOTES:
- createPublisher() returns an OBJECT with a .publish() method — NOT callable directly
- Pick the SIMPLEST relevant bus topic (e.g., just emit on module init)`;

      case 'reliability':
        if (proposal.title.includes('shutdown') || proposal.title.includes('stop')) {
          return `FIX PATTERN — Add shutdown/stop method:
\`\`\`typescript
// If class has start(), add a matching stop()/shutdown():
shutdown(): void {
  // Cast subsystems to any for optional shutdown — they may not have it typed
  (this.subsystem as any)?.shutdown?.();
  // Clear any intervals/timeouts owned by this class
  if (this.timer) { clearInterval(this.timer); this.timer = null; }
}
\`\`\`

CRITICAL TYPE SAFETY:
- When calling shutdown/stop on subsystems that may not have it typed, use "(this.x as any)?.shutdown?.()"
- This avoids TS error "Property 'shutdown' does not exist on type"
- For own class timers, use clearInterval/clearTimeout directly`;
        }

        if (proposal.title.includes('timer') || proposal.title.includes('Timer')) {
          return `FIX PATTERN — Protect setInterval callback:
\`\`\`typescript
// BEFORE (unsafe):
this.timer = setInterval(() => {
  this.doSomething(); // throws → timer dies silently
}, 5000);

// AFTER (safe):
this.timer = setInterval(() => {
  try {
    this.doSomething();
  } catch (err) {
    console.error('[ModuleName] Timer error:', err);
  }
}, 5000);
\`\`\`

NOTES:
- Wrap ONLY the callback body, keep the setInterval structure
- Log the error with module name prefix for debugging
- Do NOT rethrow — let the timer survive`;
        }

        return `Fix the reliability issue described above. Keep changes minimal.`;

      default:
        return `Fix the issue described above. Keep changes minimal and focused.`;
    }
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

      // Safety net: strip leading "src/" if LLM included it
      let targetFile: string = parsed.targetFile;
      if (targetFile.startsWith('src/')) {
        targetFile = targetFile.slice(4);
      }

      const modification: Modification = {
        id: `fix-${proposal.targetModule}-${Date.now()}`,
        description: parsed.reason || proposal.title,
        targetFile,
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

const SYSTEM_PROMPT = `You are Genesis, an autonomous AI system modifying your own source code.
Your self-model detected an issue. You must generate a precise code fix.

ABSOLUTE REQUIREMENTS:
- Output ONLY valid JSON. No markdown. No explanation. No \`\`\` fences.
- The "search" field must be an EXACT substring from the code shown (copy-paste, preserve whitespace)
- The "content" field replaces the search string entirely
- createPublisher('name') returns { publish(topic, payload) } — call publisher.publish(), NEVER publisher()
- All event payloads must be cast with "as any"
- All imports use .js extension

If you cannot produce a valid fix, output: {"targetFile":"","type":"replace","search":"","content":"","reason":"cannot fix"}`;
