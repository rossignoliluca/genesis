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
    // Call LLM (requires ANTHROPIC_API_KEY)
    if (!process.env.ANTHROPIC_API_KEY) {
      return { kind: 'skip', reason: 'No ANTHROPIC_API_KEY — LLM-based fix requires API access' };
    }

    // Read target module code — focused on the problem area
    const codeContext = this.buildCodeContext(proposal);
    if (!codeContext) {
      return { kind: 'skip', reason: `Cannot read module: ${proposal.targetModule}` };
    }

    // Build the full prompt
    const prompt = this.buildPrompt(proposal, codeContext);

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

  // ==========================================================================
  // Smart Code Context — show the LLM exactly what it needs
  // ==========================================================================

  /**
   * Build focused code context. Instead of dumping 200 lines,
   * we extract the EXACT region the LLM needs to modify.
   */
  private buildCodeContext(proposal: ImprovementProposal): string | null {
    const modulePath = join(this.rootPath, 'src', proposal.targetModule);
    if (!existsSync(modulePath)) return null;

    const indexPath = join(modulePath, 'index.ts');
    if (!existsSync(indexPath)) return null;

    const fullContent = readFileSync(indexPath, 'utf-8');
    const allLines = fullContent.split('\n');
    const totalLines = allLines.length;

    const sections: string[] = [];

    // Always show the file header line count
    sections.push(`--- ${proposal.targetModule}/index.ts (${totalLines} lines total) ---`);

    // For small files (<= 300 lines), show everything
    if (totalLines <= 300) {
      sections.push(this.numberLines(allLines, 1));
    } else {
      // For large files, show targeted regions
      sections.push(this.extractFocusedContext(proposal, allLines));
    }

    // List other files in the module
    try {
      const files = readdirSync(modulePath)
        .filter(f => f.endsWith('.ts') && f !== 'index.ts' && !f.endsWith('.test.ts'));
      if (files.length > 0) {
        sections.push(`\n--- Other files in ${proposal.targetModule}/: ${files.join(', ')} ---`);
      }
    } catch {
      // ignore
    }

    return sections.join('\n');
  }

  /**
   * For large files, extract the most relevant section for the proposal type.
   */
  private extractFocusedContext(proposal: ImprovementProposal, lines: string[]): string {
    const sections: string[] = [];

    // Always show imports + first 30 lines
    sections.push('// === FILE START (imports + declarations) ===');
    sections.push(this.numberLines(lines.slice(0, 40), 1));

    // Extract the focus region based on proposal type
    if (proposal.title.includes('shutdown') || proposal.title.includes('stop')) {
      // Find the class with start() and show that region
      const startLine = lines.findIndex(l => /\bstart\s*\(/.test(l));
      if (startLine >= 0) {
        // Show the class definition around start()
        const classStart = this.findClassStart(lines, startLine);
        const classEnd = this.findBlockEnd(lines, classStart);
        const from = Math.max(0, classStart);
        const to = Math.min(lines.length, classEnd + 1);
        sections.push(`\n// === CLASS WITH start() (lines ${from + 1}-${to}) ===`);
        sections.push(this.numberLines(lines.slice(from, to), from + 1));
      }
    } else if (proposal.title.includes('timer') || proposal.title.includes('Timer')) {
      // Find ALL setInterval calls (not type declarations) and show each one
      const timerLines: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (/setInterval\s*\(/.test(lines[i]) && !lines[i].includes('typeof setInterval') && !lines[i].trim().startsWith('//')) {
          // Check if this one is unprotected (no try in next 10 lines)
          const context = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
          if (!context.includes('try')) {
            timerLines.push(i);
          }
        }
      }

      for (const timerLine of timerLines) {
        const from = Math.max(0, timerLine - 5);
        const to = Math.min(lines.length, timerLine + 15);
        sections.push(`\n// === UNPROTECTED setInterval AT LINE ${timerLine + 1} ===`);
        sections.push(this.numberLines(lines.slice(from, to), from + 1));
      }

      // Show class declaration if not in first 40 lines
      if (timerLines.length > 0) {
        const classStart = this.findClassStart(lines, timerLines[0]);
        if (classStart > 40) {
          sections.push(`\n// === CLASS DECLARATION (line ${classStart + 1}) ===`);
          sections.push(this.numberLines(lines.slice(classStart, classStart + 5), classStart + 1));
        }
      }
    } else if (proposal.category === 'wiring') {
      // For wiring, show the first export block
      const exportLine = lines.findIndex(l => l.includes('export'));
      if (exportLine >= 0) {
        const from = Math.max(0, exportLine - 2);
        const to = Math.min(lines.length, exportLine + 30);
        sections.push(`\n// === FIRST EXPORT BLOCK (lines ${from + 1}-${to}) ===`);
        sections.push(this.numberLines(lines.slice(from, to), from + 1));
      }
    } else if (proposal.title.includes('TODO') || proposal.title.includes('FIXME')) {
      // Show regions around flagged comments
      for (let i = 0; i < lines.length; i++) {
        if (/\/\/\s*(TODO|FIXME|HACK|XXX)\b/i.test(lines[i])) {
          const from = Math.max(0, i - 3);
          const to = Math.min(lines.length, i + 12);
          sections.push(`\n// === FLAGGED COMMENT AT LINE ${i + 1} ===`);
          sections.push(this.numberLines(lines.slice(from, to), from + 1));
        }
      }
    } else if (proposal.title.includes('error handling')) {
      // Show async methods without try/catch
      for (let i = 0; i < lines.length; i++) {
        if (/async\s+[\w]+\s*\(/.test(lines[i])) {
          // Check if method has try
          let hasTry = false;
          let depth = 0;
          let started = false;
          let methodEnd = i + 30;
          for (let j = i; j < Math.min(i + 50, lines.length); j++) {
            for (const ch of lines[j]) {
              if (ch === '{') { depth++; started = true; }
              if (ch === '}') depth--;
            }
            if (started && depth === 0) { methodEnd = j; break; }
            if (lines[j].includes('try')) hasTry = true;
          }
          if (!hasTry && lines.slice(i, methodEnd).some(l => l.includes('await '))) {
            const from = Math.max(0, i - 2);
            const to = Math.min(lines.length, methodEnd + 1);
            sections.push(`\n// === UNPROTECTED ASYNC METHOD AT LINE ${i + 1} ===`);
            sections.push(this.numberLines(lines.slice(from, to), from + 1));
          }
        }
      }
    } else if (proposal.title.includes('unbounded') || proposal.title.includes('Cap')) {
      // Show regions around .push() / .set() without size caps
      for (let i = 0; i < lines.length; i++) {
        if (/this\.[\w]+\.(push|set)\s*\(/.test(lines[i])) {
          const from = Math.max(0, i - 5);
          const to = Math.min(lines.length, i + 10);
          sections.push(`\n// === COLLECTION GROWTH AT LINE ${i + 1} ===`);
          sections.push(this.numberLines(lines.slice(from, to), from + 1));
        }
      }
    }

    // Always show last 15 lines (file end, singletons, exports)
    const tailStart = Math.max(0, lines.length - 15);
    sections.push(`\n// === FILE END (lines ${tailStart + 1}-${lines.length}) ===`);
    sections.push(this.numberLines(lines.slice(tailStart), tailStart + 1));

    return sections.join('\n');
  }

  /**
   * Add line numbers for LLM reference.
   */
  private numberLines(lines: string[], startNum: number): string {
    return lines.map((line, i) => `${String(startNum + i).padStart(4)} | ${line}`).join('\n');
  }

  /**
   * Walk backwards from a line to find the class/function start.
   */
  private findClassStart(lines: string[], fromLine: number): number {
    for (let i = fromLine; i >= 0; i--) {
      if (/^(export\s+)?(abstract\s+)?class\s+/.test(lines[i])) return i;
    }
    return Math.max(0, fromLine - 20); // fallback
  }

  /**
   * Find the end of a block (matching closing brace).
   */
  private findBlockEnd(lines: string[], fromLine: number): number {
    let depth = 0;
    let started = false;
    for (let i = fromLine; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') { depth++; started = true; }
        if (ch === '}') depth--;
        if (started && depth === 0) return i;
      }
    }
    return Math.min(fromLine + 80, lines.length - 1);
  }

  // ==========================================================================
  // Bus Events (for wiring proposals only)
  // ==========================================================================

  private readBusEvents(): string {
    try {
      const eventsPath = join(this.rootPath, 'src', 'bus', 'events.ts');
      const content = readFileSync(eventsPath, 'utf-8');

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

  // ==========================================================================
  // Prompt Construction
  // ==========================================================================

  private buildPrompt(
    proposal: ImprovementProposal,
    codeContext: string,
  ): string {
    const categoryBlock = this.getCategoryBlock(proposal);

    return `You are modifying a TypeScript file. Here is the task:

TASK: ${proposal.title}
REASON: ${proposal.evidence}
FILE: src/${proposal.targetModule}/index.ts

HERE IS THE CODE:
${codeContext}

${categoryBlock}

RESPOND WITH EXACTLY THIS JSON (no markdown, no explanation, no \`\`\` fences):
{"targetFile":"${proposal.targetModule}/index.ts","type":"replace","search":"<EXACT lines from the code above>","content":"<replacement that includes your fix>","reason":"<one line>"}

THE SEARCH FIELD IS CRITICAL:
- It must be a VERBATIM substring of the code shown above (between the --- markers)
- Copy-paste EXACTLY — same whitespace, same line breaks, same indentation
- Do NOT include line numbers (the "  42 | " prefix) — only the code after the " | "
- Choose the SMALLEST unique substring that contains the insertion point
- For adding a method after start(): search for the ENTIRE start() method, then content = start() method + your new method`;
  }

  private getCategoryBlock(proposal: ImprovementProposal): string {
    if (proposal.category === 'wiring') {
      const busEvents = this.readBusEvents();
      return `YOUR FIX — Add bus event publishing to this module:

import { createPublisher } from '../bus/index.js';
const publisher = createPublisher('${proposal.targetModule}');
publisher.publish('system.booted', { source: '${proposal.targetModule}', precision: 1.0 } as any);

RULES:
- createPublisher() returns an object. Call publisher.publish(), NEVER publisher() directly
- Add the import + publisher BEFORE the first export statement
- Use 'system.booted' as the topic — simple and universal
- Cast payload with "as any"
- All imports use '.js' extension

AVAILABLE BUS TOPICS:
${busEvents}`;
    }

    if (proposal.title.includes('shutdown') || proposal.title.includes('stop')) {
      return `YOUR FIX — Add a shutdown() method to the class that has start():

PATTERN:
  shutdown(): void {
    (this.fieldA as any)?.shutdown?.();
    (this.fieldB as any)?.shutdown?.();
  }

RULES:
- Add shutdown() as a new method right AFTER the start() method
- For each field initialized in start() or constructor, add (this.field as any)?.shutdown?.()
- Use "as any" cast to avoid TypeScript errors — subsystems may not have shutdown() typed
- If the class has any timer fields (setInterval/setTimeout), clear them:
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
- Do NOT modify the start() method — only ADD shutdown() after it
- The search string must include the ENTIRE start() method so content = start() + shutdown()`;
    }

    if (proposal.title.includes('timer') || proposal.title.includes('Timer')) {
      return `YOUR FIX — Wrap the setInterval callback in try/catch:

BEFORE:
  this.timer = setInterval(() => {
    this.doWork();
  }, 5000);

AFTER:
  this.timer = setInterval(() => {
    try {
      this.doWork();
    } catch (err) {
      console.error('[${proposal.targetModule}] Timer error:', err);
    }
  }, 5000);

RULES:
- Find the setInterval call in the code above
- The search string must be the EXACT setInterval(...) block from the code
- Wrap the callback body in try { ... } catch (err) { console.error(...) }
- Do NOT rethrow — the timer must survive errors
- Do NOT change the interval time, the method called, or anything else
- Use '[${proposal.targetModule}]' as the log prefix
- If the callback is a one-liner like "() => this.doWork()", expand it to arrow function body`;
    }

    if (proposal.title.includes('TODO') || proposal.title.includes('FIXME')) {
      return `YOUR FIX — Resolve the TODO/FIXME/HACK comments shown in the code:

RULES:
- For each flagged comment, either:
  a) IMPLEMENT the missing functionality if the TODO describes something concrete and small
  b) REMOVE the comment if the described feature is already implemented nearby
  c) If the TODO describes something too complex (>30 lines), skip it — output {"targetFile":"","type":"replace","search":"","content":"","reason":"cannot fix"}
- Pick the SINGLE most impactful TODO/FIXME to fix (not all of them)
- Prefer FIXME and HACK over TODO (they indicate bugs, not wishes)
- Keep the fix under 20 lines of new code
- Do NOT just delete TODO comments without implementing or confirming they're done`;
    }

    if (proposal.title.includes('error handling')) {
      return `YOUR FIX — Add try/catch to the async method shown:

BEFORE:
  async doWork(): Promise<void> {
    const result = await this.fetchData();
    this.process(result);
  }

AFTER:
  async doWork(): Promise<void> {
    try {
      const result = await this.fetchData();
      this.process(result);
    } catch (err) {
      console.error('[${proposal.targetModule}] doWork failed:', err);
    }
  }

RULES:
- Wrap the ENTIRE method body in try/catch
- Log with '[${proposal.targetModule}]' prefix
- Do NOT rethrow unless the method signature returns a value that callers depend on
- If the method returns a value, return a sensible default in catch (null, [], empty object)
- Pick the SINGLE most critical unprotected async method (prefer public over private)
- Keep it simple — just try/catch, no retry logic`;
    }

    if (proposal.title.includes('unbounded') || proposal.title.includes('Cap')) {
      return `YOUR FIX — Add a size cap to the unbounded collection:

PATTERN for arrays:
  this.history.push(entry);
  if (this.history.length > 200) {
    this.history = this.history.slice(-100);
  }

PATTERN for Maps:
  this.cache.set(key, value);
  if (this.cache.size > 500) {
    // Delete oldest entries
    const keys = Array.from(this.cache.keys());
    for (let i = 0; i < 100; i++) this.cache.delete(keys[i]);
  }

RULES:
- Add the size check IMMEDIATELY after the push/set call
- Use reasonable limits: 100-500 for arrays, 200-1000 for maps
- For arrays, use .slice(-N) to keep the LAST N (most recent)
- For maps, delete the FIRST entries (oldest)
- Pick ONE collection to cap (the most dangerous one — largest growth rate)
- If you see a class field like \`private readonly maxHistory = 100\`, use that constant
- Do NOT add a new class field for the limit — just use a literal number`;
    }

    return `Fix the issue described. Keep changes minimal. Use "as any" for any type uncertainty.`;
  }

  // ==========================================================================
  // Response Parsing
  // ==========================================================================

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

      // Safety net: strip line number prefixes from search/content
      // (in case LLM copied the "  42 | " prefix from numbered lines)
      const stripLineNums = (s: string): string => {
        if (!s) return s;
        return s.split('\n').map(line => {
          const match = line.match(/^\s*\d+\s*\|\s?(.*)/);
          return match ? match[1] : line;
        }).join('\n');
      };

      let search = parsed.search ? stripLineNums(parsed.search) : parsed.search;
      let fixContent = stripLineNums(parsed.content);

      const modification: Modification = {
        id: `fix-${proposal.targetModule}-${Date.now()}`,
        description: parsed.reason || proposal.title,
        targetFile,
        type: parsed.type,
        content: fixContent,
        search,
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

const SYSTEM_PROMPT = `You are a precise code modification engine. You receive a TypeScript file and a task. You output a single JSON object describing the exact text replacement.

RULES:
1. Output ONLY valid JSON. No markdown. No explanation. No backtick fences.
2. The "search" field must be an EXACT verbatim substring from the code shown.
   - Same whitespace. Same line breaks. Same indentation.
   - Do NOT include line number prefixes like "  42 | " — only the code itself.
3. The "content" field replaces the search string entirely.
   - It must include the original code from "search" PLUS your additions.
   - Never delete existing code — only add to it.
4. TypeScript safety:
   - All imports use '.js' extension (e.g., from '../bus/index.js')
   - Use "as any" cast when calling methods that may not be typed on an interface
   - Use optional chaining ?. when calling methods that might not exist
5. Keep changes minimal — under 20 lines of new code.

If you absolutely cannot produce a valid fix, output:
{"targetFile":"","type":"replace","search":"","content":"","reason":"cannot fix"}`;
