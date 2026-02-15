/**
 * Adversarial Debate Engine for Market Strategist
 *
 * Implements bull vs bear debate pattern before analysis generation.
 * Produces balanced, editorial-quality market narratives.
 */

import { getMCPClient, type IMCPClient } from '../mcp/index.js';
import type { WeeklySnapshot, AssetSnapshot, Headline, SentimentGauge } from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface DebatePosition {
  thesis: string;
  evidence: string[];
  confidence: number; // 0-1
  keyRisks: string[];
}

export interface DebateRound {
  roundNumber: number;
  bullArgument: string;
  bearArgument: string;
}

export interface DebateSynthesis {
  narrative: string;
  confidenceLevel: number; // 0-1
  keyDrivers: string[];
  tailRisks: string[];
  marketRegime: string; // e.g., "risk-on", "risk-off", "rotation", "uncertainty"
}

export interface DebateResult {
  bullCase: DebatePosition;
  bearCase: DebatePosition;
  synthesis: DebateSynthesis;
  rounds: DebateRound[];
  consensusPoints: string[];
  divergencePoints: string[];
}

// ============================================================================
// Debate Engine
// ============================================================================

export class DebateEngine {
  private mcp: IMCPClient;
  private readonly model = 'gpt-4o';

  constructor(mcp: IMCPClient) {
    this.mcp = mcp;
  }

  /**
   * Run a full bull vs bear debate on the weekly snapshot
   */
  async debate(snapshot: WeeklySnapshot, context?: string): Promise<DebateResult> {
    // Prepare market data summary
    const dataSummary = this.buildDataSummary(snapshot);

    // Round 1: Initial positions
    const [bullR1, bearR1] = await Promise.all([
      this.generateBullPosition(dataSummary, context, null),
      this.generateBearPosition(dataSummary, context, null),
    ]);

    // Round 2: Rebuttals
    const [bullR2, bearR2] = await Promise.all([
      this.generateBullRebuttal(dataSummary, bullR1, bearR1.thesis),
      this.generateBearRebuttal(dataSummary, bearR1, bullR1.thesis),
    ]);

    const rounds: DebateRound[] = [
      { roundNumber: 1, bullArgument: bullR1.thesis, bearArgument: bearR1.thesis },
      { roundNumber: 2, bullArgument: bullR2, bearArgument: bearR2 },
    ];

    // Synthesize final position
    const synthesis = await this.synthesize(dataSummary, bullR1, bearR1, rounds);

    // Extract consensus and divergence
    const { consensusPoints, divergencePoints } = await this.extractConsensusAndDivergence(
      bullR1,
      bearR1,
      synthesis
    );

    return {
      bullCase: bullR1,
      bearCase: bearR1,
      synthesis,
      rounds,
      consensusPoints,
      divergencePoints,
    };
  }

  // ==========================================================================
  // Data Preparation
  // ==========================================================================

  private buildDataSummary(snapshot: WeeklySnapshot): string {
    const lines: string[] = [];

    lines.push(`=== WEEKLY MARKET DATA (${snapshot.week}) ===\n`);

    // Markets
    if (snapshot.markets.length > 0) {
      lines.push('MARKETS:');
      for (const m of snapshot.markets) {
        lines.push(
          `  ${m.name}${m.ticker ? ` (${m.ticker})` : ''}: ${m.level} | 1W: ${m.change1w} | MTD: ${m.changeMtd} | YTD: ${m.changeYtd} | Signal: ${m.signal}`
        );
        if (m.commentary) lines.push(`    → ${m.commentary}`);
      }
      lines.push('');
    }

    // Headlines
    if (snapshot.headlines.length > 0) {
      lines.push('HEADLINES:');
      for (const hl of snapshot.headlines.slice(0, 10)) {
        lines.push(`  - [${hl.impact.toUpperCase()}] [${hl.source}] ${hl.title} (theme: ${hl.theme})`);
      }
      lines.push('');
    }

    // Themes
    if (snapshot.themes.length > 0) {
      lines.push(`THEMES: ${snapshot.themes.join(', ')}`);
      lines.push('');
    }

    // Sentiment
    if (snapshot.sentiment) {
      lines.push('SENTIMENT:');
      lines.push(`  Overall: ${snapshot.sentiment.overall} (score: ${snapshot.sentiment.score.toFixed(2)})`);
      const indicators = Object.entries(snapshot.sentiment.indicators)
        .map(([k, v]) => `${k}: ${v.toFixed(2)}`)
        .join(', ');
      if (indicators) lines.push(`  Indicators: ${indicators}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  // ==========================================================================
  // Bull Agent
  // ==========================================================================

  private async generateBullPosition(
    dataSummary: string,
    context: string | undefined,
    _previousPosition: DebatePosition | null
  ): Promise<DebatePosition> {
    const systemPrompt = `You are the BULL agent for Rossignoli & Partners — a growth-focused portfolio manager at a top-10 hedge fund.

Your mandate:
- Find the optimistic thesis in the data
- Think like Ray Dalio looking for regime shifts
- Cite specific data points as evidence
- Quantify confidence (0-1 scale)
- Acknowledge key risks honestly

Style:
- Editorial quality, NOT generic commentary
- Every claim must have data backing
- Think institutionally: "What would make me rotate INTO risk here?"
- Be provocative but grounded

Output a JSON object with:
{
  "thesis": "2-3 sentence core bull case",
  "evidence": ["specific data point 1", "specific data point 2", ...],
  "confidence": 0.0-1.0,
  "keyRisks": ["risk 1", "risk 2", ...]
}`;

    const userPrompt = `${dataSummary}\n${context ? `\nADDITIONAL CONTEXT:\n${context}\n` : ''}\nWhat is your BULL case?`;

    const result = await this.mcp.call('openai' as any, 'openai_chat', {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    });

    return this.parsePositionResponse(result);
  }

  private async generateBullRebuttal(
    dataSummary: string,
    bullPosition: DebatePosition,
    bearThesis: string
  ): Promise<string> {
    const systemPrompt = `You are the BULL agent for Rossignoli & Partners. The BEAR has challenged your thesis. Defend your position and counter their arguments.

Style:
- Address their specific points
- Use data from the snapshot
- Concede where they're right, but show why your thesis still holds
- 3-4 sentences maximum`;

    const userPrompt = `YOUR THESIS:\n${bullPosition.thesis}\n\nBEAR'S COUNTER:\n${bearThesis}\n\nDATA:\n${dataSummary}\n\nYour rebuttal:`;

    const result = await this.mcp.call('openai' as any, 'openai_chat', {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    return this.extractTextResponse(result);
  }

  // ==========================================================================
  // Bear Agent
  // ==========================================================================

  private async generateBearPosition(
    dataSummary: string,
    context: string | undefined,
    _previousPosition: DebatePosition | null
  ): Promise<DebatePosition> {
    const systemPrompt = `You are the BEAR agent for Rossignoli & Partners — a risk manager who lived through 2008, the Flash Crash, and COVID.

Your mandate:
- Find the pessimistic thesis in the data
- Think like Howard Marks: "What could go wrong?"
- Cite specific vulnerabilities as evidence
- Quantify confidence (0-1 scale)
- Acknowledge where bulls might be right

Style:
- Editorial quality, NOT generic fear-mongering
- Every claim must have data backing
- Think institutionally: "What would make me hedge or de-risk here?"
- Be skeptical but precise

Output a JSON object with:
{
  "thesis": "2-3 sentence core bear case",
  "evidence": ["specific data point 1", "specific data point 2", ...],
  "confidence": 0.0-1.0,
  "keyRisks": ["risk 1", "risk 2", ...]
}`;

    const userPrompt = `${dataSummary}\n${context ? `\nADDITIONAL CONTEXT:\n${context}\n` : ''}\nWhat is your BEAR case?`;

    const result = await this.mcp.call('openai' as any, 'openai_chat', {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    });

    return this.parsePositionResponse(result);
  }

  private async generateBearRebuttal(
    dataSummary: string,
    bearPosition: DebatePosition,
    bullThesis: string
  ): Promise<string> {
    const systemPrompt = `You are the BEAR agent for Rossignoli & Partners. The BULL has challenged your thesis. Defend your position and counter their arguments.

Style:
- Address their specific points
- Use data from the snapshot
- Concede where they're right, but show why caution is still warranted
- 3-4 sentences maximum`;

    const userPrompt = `YOUR THESIS:\n${bearPosition.thesis}\n\nBULL'S COUNTER:\n${bullThesis}\n\nDATA:\n${dataSummary}\n\nYour rebuttal:`;

    const result = await this.mcp.call('openai' as any, 'openai_chat', {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    return this.extractTextResponse(result);
  }

  // ==========================================================================
  // Synthesizer
  // ==========================================================================

  private async synthesize(
    dataSummary: string,
    bullCase: DebatePosition,
    bearCase: DebatePosition,
    rounds: DebateRound[]
  ): Promise<DebateSynthesis> {
    const systemPrompt = `You are the SYNTHESIZER for Rossignoli & Partners — the CIO writing for institutional clients.

Your mandate:
- Weigh both bull and bear positions objectively
- Find the balanced narrative that institutional investors need
- Identify the key drivers that matter most
- Call out tail risks explicitly
- Assign a market regime label

Think like Michael Hartnett (BofA) or Mike Wilson (Morgan Stanley):
- What's the STORY here?
- What regime are we in? (risk-on, risk-off, rotation, uncertainty, etc.)
- What are the 2-3 things that will move markets next?

Output a JSON object with:
{
  "narrative": "3-4 sentence balanced view — the synthesis",
  "confidenceLevel": 0.0-1.0,
  "keyDrivers": ["driver 1", "driver 2", ...],
  "tailRisks": ["tail risk 1", "tail risk 2", ...],
  "marketRegime": "risk-on|risk-off|rotation|uncertainty|transition|..."
}`;

    const roundsSummary = rounds
      .map(
        (r) =>
          `Round ${r.roundNumber}:\nBULL: ${r.bullArgument}\nBEAR: ${r.bearArgument}`
      )
      .join('\n\n');

    const userPrompt = `DATA:\n${dataSummary}\n\nBULL CASE:\nThesis: ${bullCase.thesis}\nConfidence: ${bullCase.confidence}\nEvidence: ${bullCase.evidence.join('; ')}\n\nBEAR CASE:\nThesis: ${bearCase.thesis}\nConfidence: ${bearCase.confidence}\nEvidence: ${bearCase.evidence.join('; ')}\n\nDEBATE:\n${roundsSummary}\n\nWhat is your SYNTHESIS?`;

    const result = await this.mcp.call('openai' as any, 'openai_chat', {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    });

    return this.parseSynthesisResponse(result);
  }

  // ==========================================================================
  // Consensus & Divergence Extraction
  // ==========================================================================

  private async extractConsensusAndDivergence(
    bullCase: DebatePosition,
    bearCase: DebatePosition,
    synthesis: DebateSynthesis
  ): Promise<{ consensusPoints: string[]; divergencePoints: string[] }> {
    const systemPrompt = `You are analyzing a bull vs bear debate for Rossignoli & Partners.

Extract:
1. CONSENSUS: Points where both bull and bear agree (even if they interpret differently)
2. DIVERGENCE: Irreconcilable disagreements where they fundamentally differ

Be precise. Each point should be a single sentence.

Output JSON:
{
  "consensusPoints": ["consensus 1", "consensus 2", ...],
  "divergencePoints": ["divergence 1", "divergence 2", ...]
}`;

    const userPrompt = `BULL THESIS: ${bullCase.thesis}\nBULL EVIDENCE: ${bullCase.evidence.join('; ')}\n\nBEAR THESIS: ${bearCase.thesis}\nBEAR EVIDENCE: ${bearCase.evidence.join('; ')}\n\nSYNTHESIS: ${synthesis.narrative}\n\nWhat are the CONSENSUS and DIVERGENCE points?`;

    const result = await this.mcp.call('openai' as any, 'openai_chat', {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    });

    const parsed = this.parseJSONResponse(result);
    return {
      consensusPoints: parsed.consensusPoints || [],
      divergencePoints: parsed.divergencePoints || [],
    };
  }

  // ==========================================================================
  // Response Parsing
  // ==========================================================================

  private parsePositionResponse(result: any): DebatePosition {
    const parsed = this.parseJSONResponse(result);
    return {
      thesis: parsed.thesis || 'No thesis provided',
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      keyRisks: Array.isArray(parsed.keyRisks) ? parsed.keyRisks : [],
    };
  }

  private parseSynthesisResponse(result: any): DebateSynthesis {
    const parsed = this.parseJSONResponse(result);
    return {
      narrative: parsed.narrative || 'No synthesis provided',
      confidenceLevel: typeof parsed.confidenceLevel === 'number' ? parsed.confidenceLevel : 0.5,
      keyDrivers: Array.isArray(parsed.keyDrivers) ? parsed.keyDrivers : [],
      tailRisks: Array.isArray(parsed.tailRisks) ? parsed.tailRisks : [],
      marketRegime: parsed.marketRegime || 'uncertainty',
    };
  }

  private parseJSONResponse(result: any): any {
    try {
      // MCP result format: { content: [{ type: 'text', text: '...' }] }
      if (result?.content?.[0]?.text) {
        return JSON.parse(result.content[0].text);
      }
      // Fallback: direct text
      if (typeof result === 'string') {
        return JSON.parse(result);
      }
      return {};
    } catch (err) {
      console.error('Failed to parse JSON response:', err);
      return {};
    }
  }

  private extractTextResponse(result: any): string {
    try {
      if (result?.content?.[0]?.text) {
        return result.content[0].text;
      }
      if (typeof result === 'string') {
        return result;
      }
      return '';
    } catch (err) {
      console.error('Failed to extract text response:', err);
      return '';
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let singleton: DebateEngine | null = null;

export function getDebateEngine(): DebateEngine {
  if (!singleton) {
    const mcp = getMCPClient();
    singleton = new DebateEngine(mcp);
  }
  return singleton;
}
