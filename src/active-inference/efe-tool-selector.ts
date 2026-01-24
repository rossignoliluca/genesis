/**
 * Genesis v11.4 - EFE-Based MCP Tool Selection
 *
 * Novel contribution: Instead of fixed action→tool mappings, dynamically select
 * which MCP tool to invoke based on Expected Free Energy (EFE) minimization.
 *
 * EFE(tool) = ambiguity(tool_outcome) + risk(tool_outcome) - info_gain(tool)
 *
 * This is the first implementation combining Active Inference with MCP tool use
 * where tool selection itself is driven by the free energy principle.
 *
 * References:
 * - Friston et al. (2017) "Active Inference and Learning"
 * - Parr & Friston (2019) "Generalised free energy and active inference"
 * - MCP Protocol Specification (2024)
 */

import { Beliefs, CMatrix } from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface MCPToolCandidate {
  server: string;          // MCP server name (e.g., 'brave-search', 'openai')
  tool: string;            // Tool name (e.g., 'brave_web_search', 'openai_chat')
  description: string;     // What the tool does
  cost: number;            // Estimated monetary cost per call ($)
  avgLatency: number;      // Historical average latency (ms)
  successRate: number;     // Historical success rate (0-1)
  informationGain: number; // Expected info gain for current context (0-1)
}

export interface EFEScore {
  tool: MCPToolCandidate;
  efe: number;             // Expected Free Energy (lower = better)
  ambiguity: number;       // Uncertainty about outcome
  risk: number;            // Pragmatic risk (cost + failure)
  infoGain: number;        // Expected information gain
  reasoning: string;       // Human-readable explanation
}

export interface ToolSelectionResult {
  selected: EFEScore;
  alternatives: EFEScore[];
  totalCandidates: number;
}

interface ToolHistory {
  calls: number;
  successes: number;
  totalLatency: number;
  totalCost: number;
  surpriseHistory: number[];  // Surprise values after tool calls
}

// ============================================================================
// Tool Intent Categories
// ============================================================================

const INTENT_TOOL_MAP: Record<string, string[][]> = {
  // Intent → [[server, tool], ...]
  'search': [
    ['brave-search', 'brave_web_search'],
    ['exa', 'web_search_exa'],
    ['gemini', 'web_search'],
    ['firecrawl', 'firecrawl_search'],
  ],
  'research': [
    ['arxiv', 'search_arxiv'],
    ['semantic-scholar', 'search_semantic_scholar'],
    ['brave-search', 'brave_web_search'],
    ['exa', 'web_search_exa'],
  ],
  'generate_text': [
    ['openai', 'openai_chat'],
    ['gemini', 'web_search'],  // Gemini can synthesize
  ],
  'generate_image': [
    ['stability-ai', 'stability-ai-generate-image'],
    ['stability-ai', 'stability-ai-generate-image-sd35'],
  ],
  'code': [
    ['github', 'search_code'],
    ['exa', 'get_code_context_exa'],
  ],
  'scrape': [
    ['firecrawl', 'firecrawl_scrape'],
    ['firecrawl', 'firecrawl_crawl'],
    ['brave-search', 'brave_web_search'],
  ],
  'memory': [
    ['memory', 'search_nodes'],
    ['memory', 'read_graph'],
  ],
  'filesystem': [
    ['filesystem', 'read_file'],
    ['filesystem', 'search_files'],
  ],
};

// Estimated costs per call (USD)
const TOOL_COSTS: Record<string, number> = {
  'brave_web_search': 0.005,
  'web_search_exa': 0.01,
  'web_search': 0.002,        // Gemini
  'firecrawl_search': 0.01,
  'firecrawl_scrape': 0.02,
  'openai_chat': 0.03,
  'search_arxiv': 0.0,
  'search_semantic_scholar': 0.0,
  'stability-ai-generate-image': 0.04,
  'stability-ai-generate-image-sd35': 0.06,
  'search_code': 0.0,
  'get_code_context_exa': 0.01,
  'search_nodes': 0.0,
  'read_graph': 0.0,
  'read_file': 0.0,
  'search_files': 0.0,
};

// ============================================================================
// EFE Tool Selector
// ============================================================================

export class EFEToolSelector {
  private history: Map<string, ToolHistory> = new Map();
  private beliefsPrecision: number = 1.0;  // Current precision of beliefs

  /**
   * Select the best MCP tool for a given intent using EFE minimization.
   *
   * @param intent - What the agent wants to do ('search', 'research', 'generate_text', etc.)
   * @param beliefs - Current beliefs about world state
   * @param preferences - C-matrix preferences (what outcomes are desired)
   * @returns Best tool selection with EFE scores for all candidates
   */
  selectTool(
    intent: string,
    beliefs: Beliefs,
    preferences?: Partial<CMatrix>
  ): ToolSelectionResult {
    // 1. Get candidate tools for this intent
    const candidates = this.getCandidates(intent);

    if (candidates.length === 0) {
      // No tools available - return a null-action candidate
      const nullTool: MCPToolCandidate = {
        server: 'none', tool: 'noop', description: 'No suitable tool',
        cost: 0, avgLatency: 0, successRate: 0, informationGain: 0,
      };
      const nullScore: EFEScore = {
        tool: nullTool, efe: Infinity, ambiguity: 1, risk: 1, infoGain: 0,
        reasoning: `No MCP tools available for intent: ${intent}`,
      };
      return { selected: nullScore, alternatives: [], totalCandidates: 0 };
    }

    // 2. Compute EFE for each candidate
    const scores = candidates.map(tool => this.computeEFE(tool, beliefs, preferences));

    // 3. Sort by EFE (lower is better)
    scores.sort((a, b) => a.efe - b.efe);

    return {
      selected: scores[0],
      alternatives: scores.slice(1),
      totalCandidates: scores.length,
    };
  }

  /**
   * Compute Expected Free Energy for a tool candidate.
   *
   * EFE = ambiguity + risk - info_gain
   *
   * Where:
   * - ambiguity: entropy of predicted outcome distribution (how uncertain is the result?)
   * - risk: expected cost + failure probability (pragmatic value)
   * - info_gain: expected reduction in beliefs entropy (epistemic value)
   */
  private computeEFE(
    tool: MCPToolCandidate,
    beliefs: Beliefs,
    preferences?: Partial<CMatrix>
  ): EFEScore {
    const history = this.getHistory(tool);

    // --- Ambiguity: How uncertain are we about the tool's output? ---
    // Based on variance of past surprise values + base uncertainty for new tools
    let ambiguity: number;
    if (history.calls >= 5) {
      const avgSurprise = history.surpriseHistory.reduce((s, v) => s + v, 0) / history.surpriseHistory.length;
      const variance = history.surpriseHistory.reduce((s, v) => s + (v - avgSurprise) ** 2, 0) / history.surpriseHistory.length;
      ambiguity = Math.sqrt(variance) + avgSurprise * 0.1;
    } else {
      // Prior: new tools have high ambiguity (encourages exploration)
      ambiguity = 2.0 - history.calls * 0.3;
    }

    // --- Risk: Pragmatic cost of using this tool ---
    // Monetary cost + failure probability + latency cost
    const failureProb = 1 - tool.successRate;
    const normalizedCost = tool.cost * 10; // Scale cost to 0-1 range (assuming max $0.10/call)
    const latencyCost = Math.min(tool.avgLatency / 10000, 1.0); // Normalize to 0-1 (10s max)
    const risk = normalizedCost + failureProb * 2.0 + latencyCost * 0.5;

    // --- Information Gain: How much would this tool reduce our uncertainty? ---
    // Based on tool's relevance to current belief uncertainty
    const beliefEntropy = this.computeBeliefEntropy(beliefs);
    const expectedReduction = tool.informationGain * beliefEntropy;
    // Tools with high success rates provide more reliable information
    const infoGain = expectedReduction * tool.successRate * this.beliefsPrecision;

    // --- Preference alignment: bonus for tools that serve preferred outcomes ---
    let preferenceBonus = 0;
    if (preferences) {
      // Tools that search reduce task uncertainty → align with task preferences
      if (tool.description.includes('search') && preferences.task) {
        preferenceBonus = Math.max(...preferences.task) * 0.3;
      }
      // Tools that generate content → align with economic preferences
      if (tool.description.includes('generate') && preferences.economic) {
        preferenceBonus = Math.max(...preferences.economic) * 0.2;
      }
    }

    // --- Final EFE computation ---
    const efe = ambiguity + risk - infoGain - preferenceBonus;

    // Generate reasoning
    const reasoning = [
      `EFE=${efe.toFixed(3)}`,
      `amb=${ambiguity.toFixed(2)}`,
      `risk=${risk.toFixed(2)}`,
      `gain=${infoGain.toFixed(2)}`,
      history.calls > 0 ? `calls=${history.calls}` : 'new',
      tool.successRate < 1 ? `sr=${(tool.successRate * 100).toFixed(0)}%` : '',
    ].filter(Boolean).join(', ');

    return { tool, efe, ambiguity, risk, infoGain, reasoning };
  }

  /**
   * Record the outcome of a tool call for future EFE estimates.
   */
  recordOutcome(
    server: string,
    tool: string,
    success: boolean,
    latencyMs: number,
    surprise: number,
    cost: number = 0
  ): void {
    const key = `${server}:${tool}`;
    const history = this.history.get(key) || {
      calls: 0, successes: 0, totalLatency: 0, totalCost: 0, surpriseHistory: [],
    };

    history.calls++;
    if (success) history.successes++;
    history.totalLatency += latencyMs;
    history.totalCost += cost;
    history.surpriseHistory.push(surprise);

    // Keep only last 50 surprise values
    if (history.surpriseHistory.length > 50) {
      history.surpriseHistory.shift();
    }

    this.history.set(key, history);
  }

  /**
   * Update beliefs precision (affects information gain computation).
   */
  updatePrecision(precision: number): void {
    this.beliefsPrecision = Math.max(0.01, Math.min(10, precision));
  }

  /**
   * Get all available intents.
   */
  getAvailableIntents(): string[] {
    return Object.keys(INTENT_TOOL_MAP);
  }

  /**
   * Get selection statistics.
   */
  getStats(): {
    totalCalls: number;
    totalCost: number;
    toolsUsed: number;
    avgSuccessRate: number;
  } {
    let totalCalls = 0, totalCost = 0, totalSuccess = 0;
    for (const h of this.history.values()) {
      totalCalls += h.calls;
      totalCost += h.totalCost;
      totalSuccess += h.successes;
    }
    return {
      totalCalls,
      totalCost,
      toolsUsed: this.history.size,
      avgSuccessRate: totalCalls > 0 ? totalSuccess / totalCalls : 0,
    };
  }

  // --- Private helpers ---

  private getCandidates(intent: string): MCPToolCandidate[] {
    const toolPairs = INTENT_TOOL_MAP[intent] || [];

    return toolPairs.map(([server, tool]) => {
      const history = this.getHistory({ server, tool } as MCPToolCandidate);
      return {
        server,
        tool,
        description: `${server}/${tool}`,
        cost: TOOL_COSTS[tool] || 0.01,
        avgLatency: history.calls > 0 ? history.totalLatency / history.calls : 2000,
        successRate: history.calls > 0 ? history.successes / history.calls : 0.7, // Optimistic prior
        informationGain: this.estimateInfoGain(intent, tool),
      };
    });
  }

  private getHistory(tool: MCPToolCandidate): ToolHistory {
    const key = `${tool.server}:${tool.tool}`;
    return this.history.get(key) || {
      calls: 0, successes: 0, totalLatency: 0, totalCost: 0, surpriseHistory: [],
    };
  }

  private computeBeliefEntropy(beliefs: Beliefs): number {
    // Shannon entropy of belief distribution
    let totalEntropy = 0;
    for (const factor of Object.values(beliefs)) {
      if (Array.isArray(factor)) {
        const H = -(factor as number[])
          .filter(p => p > 0)
          .reduce((s, p) => s + p * Math.log(p + 1e-10), 0);
        totalEntropy += H;
      }
    }
    return totalEntropy;
  }

  private estimateInfoGain(intent: string, tool: string): number {
    // Heuristic: different tools provide different information gains
    const gains: Record<string, number> = {
      'brave_web_search': 0.7,
      'web_search_exa': 0.75,
      'web_search': 0.6,
      'firecrawl_search': 0.65,
      'firecrawl_scrape': 0.8,
      'openai_chat': 0.5,       // LLM generates, less pure info gain
      'search_arxiv': 0.85,     // High-quality academic info
      'search_semantic_scholar': 0.85,
      'stability-ai-generate-image': 0.3,  // Creative, not informational
      'search_code': 0.7,
      'get_code_context_exa': 0.75,
      'search_nodes': 0.6,
      'read_graph': 0.5,
      'read_file': 0.4,
      'search_files': 0.5,
    };
    return gains[tool] || 0.5;
  }
}

// ============================================================================
// Factory
// ============================================================================

let selectorInstance: EFEToolSelector | null = null;

export function getEFEToolSelector(): EFEToolSelector {
  if (!selectorInstance) {
    selectorInstance = new EFEToolSelector();
  }
  return selectorInstance;
}

export function createEFEToolSelector(): EFEToolSelector {
  return new EFEToolSelector();
}
