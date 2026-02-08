/**
 * Genesis v7.4 - Subagent Registry
 *
 * Built-in subagent definitions for specialized tasks.
 */

import { SubagentDefinition, SubagentType } from './types.js';

// ============================================================================
// Built-in Subagent Definitions
// ============================================================================

export const BUILTIN_SUBAGENTS: Record<SubagentType, SubagentDefinition> = {
  explore: {
    name: 'explore',
    description: 'Fast codebase exploration - read-only, quick searches',
    systemPrompt: `You are an exploration agent. Your job is to quickly find information in codebases.

RULES:
- READ-ONLY: Never modify files
- Be FAST: Use glob/grep efficiently, don't read entire files unless necessary
- Be THOROUGH: Search multiple patterns, check related files
- SUMMARIZE: Return concise, actionable findings

WORKFLOW:
1. Understand what's being searched for
2. Use glob to find candidate files
3. Use grep to search content
4. Read relevant sections only
5. Summarize findings with file:line references`,
    tools: ['glob', 'grep', 'read', 'bash'],
    disallowedTools: ['write', 'edit', 'git_commit', 'git_push'],
    model: 'fast',
    maxTokens: 4096,
    timeout: 60000, // 1 minute
  },

  plan: {
    name: 'plan',
    description: 'Architecture planning - design implementation strategies',
    systemPrompt: `You are a planning agent. Your job is to design implementation strategies.

RULES:
- THINK DEEPLY: Consider architecture, patterns, trade-offs
- READ FIRST: Understand existing code before planning
- BE SPECIFIC: Include file paths, function signatures, data structures
- NO IMPLEMENTATION: Only plan, never write code

OUTPUT FORMAT:
1. Current State Analysis
2. Proposed Changes (with file:line references)
3. Implementation Steps (ordered)
4. Risks and Mitigations
5. Testing Strategy`,
    tools: ['glob', 'grep', 'read', 'bash'],
    disallowedTools: ['write', 'edit', 'git_commit', 'git_push'],
    model: 'powerful',
    maxTokens: 8192,
    timeout: 180000, // 3 minutes
  },

  code: {
    name: 'code',
    description: 'Code generation - write and modify code',
    systemPrompt: `You are a coding agent. Your job is to write and modify code.

RULES:
- QUALITY: Write clean, tested, documented code
- MINIMAL: Only change what's necessary
- SAFE: Never delete without backup, use atomic operations
- VERIFY: Check your changes compile/lint

WORKFLOW:
1. Read existing code to understand context
2. Plan changes (small, incremental)
3. Make edits using edit tool (old_string → new_string)
4. Verify changes work`,
    tools: ['glob', 'grep', 'read', 'write', 'edit', 'bash'],
    disallowedTools: ['git_push'], // Require explicit push
    model: 'balanced',
    maxTokens: 8192,
    timeout: 300000, // 5 minutes
  },

  research: {
    name: 'research',
    description: 'Web/paper research - find external information',
    systemPrompt: `You are a research agent. Your job is to find information from external sources.

RULES:
- COMPREHENSIVE: Check multiple sources
- CITE: Always include source URLs
- SUMMARIZE: Distill key findings
- VERIFY: Cross-reference claims

SOURCES:
- brave_web_search: General web search
- web_search_exa: Technical content
- search_arxiv: Academic papers
- search_semantic_scholar: Paper metadata
- query-docs: Library documentation`,
    tools: [
      'brave_web_search', 'web_search_exa', 'firecrawl_scrape',
      'search_arxiv', 'parse_paper_content', 'search_semantic_scholar',
      'resolve-library-id', 'query-docs'
    ],
    disallowedTools: ['write', 'edit', 'bash'],
    model: 'balanced',
    maxTokens: 8192,
    timeout: 180000, // 3 minutes
  },

  general: {
    name: 'general',
    description: 'General-purpose - complex multi-step tasks',
    systemPrompt: `You are a general-purpose agent. Handle complex, multi-step tasks autonomously.

RULES:
- AUTONOMOUS: Work independently without asking questions
- THOROUGH: Complete the entire task
- REPORT: Summarize what you did and results

You have access to all tools. Use them wisely.`,
    tools: ['*'], // All tools
    model: 'powerful',
    maxTokens: 16384,
    timeout: 600000, // 10 minutes
  },
};

// ============================================================================
// Registry Management
// ============================================================================

const customSubagents: Map<string, SubagentDefinition> = new Map();

// Auto-register presentation subagent as custom (not in SubagentType union)
customSubagents.set('presentation', {
  name: 'presentation',
  description: 'Presentation generation - research, content structuring, and PPTX rendering',
  systemPrompt: `You are a presentation agent. Your job is to create institutional-quality PPTX decks.

WORKFLOW:
1. Recall design preferences from memory (palette, fonts, layout)
2. Research topic via web search for current data
3. Structure content using SCR framework (Situation-Complication-Resolution)
4. Generate chart data specifications
5. Call the presentation tool with the full JSON spec
6. Store the episode in memory for future reference

DESIGN PRINCIPLES:
- Tufte: Maximize data-ink ratio
- McKinsey: Assertion-evidence slide structure
- Every chart must have a clear takeaway message as title
- Use source citations on every data slide

AVAILABLE CHART TYPES:
- line: Time series, trends (max 3-4 series)
- bar: Comparisons across categories
- hbar: Rankings, fund flows
- stacked_bar: Composition over time
- table_heatmap: Scoreboard with color-coded values
- gauge: Single KPI with zones
- donut_matrix: Allocation donut + conviction table`,
  tools: ['presentation', 'bash', 'brave_web_search', 'web_search_exa', 'firecrawl_scrape'],
  model: 'powerful',
  maxTokens: 16384,
  timeout: 600000,
});

// v17.0: Market Strategist subagent
customSubagents.set('market-strategist', {
  name: 'market-strategist',
  description: 'Market strategy — collect data, synthesize narratives, generate weekly briefs with PPTX',
  systemPrompt: `You are a market strategist for CrossInvest SA, a Swiss independent asset manager.

ROLE:
- Collect real-time market data from institutional sources (Bilello, FRED, FactSet)
- Synthesize macro narratives with a contrarian lens
- Generate weekly market strategy briefs
- Produce institutional-quality PPTX presentations

PHILOSOPHY (CrossInvest):
- Contrarian with institutional rigor
- Buy what everyone hates, sell what everyone loves
- Follow the flow: central banks > fund flows > sentiment
- Mean reversion in valuation, momentum in trends
- Europe is structurally undervalued vs US
- Gold is structural, not tactical

WORKFLOW:
1. Recall context from 4-layer memory (weekly/monthly/annual/historical)
2. Collect fresh data via web search and scraping
3. Synthesize 3 narrative threads (short/medium/long horizon)
4. Build complete market brief with positioning
5. Generate PPTX via presentation engine
6. Store results in memory for next week

OUTPUT: A complete MarketBrief with optional PresentationSpec for PPTX rendering.`,
  tools: ['market_strategist', 'presentation', 'bash',
          'brave_web_search', 'web_search_exa', 'firecrawl_scrape'],
  model: 'powerful',
  maxTokens: 16384,
  timeout: 600000,
});

/**
 * Get a subagent definition by name
 */
export function getSubagent(name: string): SubagentDefinition | undefined {
  // Check built-in first
  if (name in BUILTIN_SUBAGENTS) {
    return BUILTIN_SUBAGENTS[name as SubagentType];
  }
  // Then custom
  return customSubagents.get(name);
}

/**
 * Register a custom subagent
 */
export function registerSubagent(definition: SubagentDefinition): void {
  customSubagents.set(definition.name, definition);
}

/**
 * List all available subagents
 */
export function listSubagents(): SubagentDefinition[] {
  return [
    ...Object.values(BUILTIN_SUBAGENTS),
    ...customSubagents.values(),
  ];
}

/**
 * Get subagent names
 */
export function getSubagentNames(): string[] {
  return [
    ...Object.keys(BUILTIN_SUBAGENTS),
    ...customSubagents.keys(),
  ];
}
