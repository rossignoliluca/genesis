/**
 * Genesis v17.0 - Market Analyzer
 *
 * Narrative synthesis and theme extraction engine.
 * Uses LLM (via OpenAI MCP) for intelligent synthesis and
 * Genesis memory for historical context.
 */

import { getMCPClient } from '../mcp/index.js';
import type { IMCPClient } from '../mcp/index.js';
import { randomUUID } from 'crypto';
import type {
  WeeklySnapshot,
  NarrativeThread,
  ThemeShift,
  MarketBrief,
  PositioningView,
  TimeHorizon,
  CalibrationProfile,
} from './types.js';
import type { MemoryLayers } from './memory-layers.js';
import type { EpisodicMemory, SemanticMemory, Memory } from '../memory/types.js';

// ============================================================================
// Market Analyzer
// ============================================================================

export class MarketAnalyzer {
  private mcp: IMCPClient;

  constructor() {
    this.mcp = getMCPClient();
  }

  /**
   * Analyze collected data and extract narratives
   */
  async synthesizeNarrative(
    snapshot: WeeklySnapshot,
    previousBriefs: Memory[],
    historicalAnalogues: SemanticMemory[],
    regimeContext?: { regime: string; confidence: number; trendStrength: number },
  ): Promise<NarrativeThread[]> {
    const systemPrompt = `You are a senior market strategist at Rossignoli & Partners, a Swiss independent asset manager.
Your style: contrarian with institutional rigor. You analyze data from Bilello, FRED, FactSet, JPM, GS, BLK.

Principles:
- Buy what everyone hates, sell what everyone loves
- Follow the flow: central banks > fund flows > sentiment
- Mean reversion in valuation, momentum in trends
- Europe is structurally undervalued vs US
- Gold is structural, not tactical

Return EXACTLY a JSON array of narrative objects with this schema:
[{
  "title": "short title",
  "horizon": "short" | "medium" | "long",
  "thesis": "main argument in 2-3 sentences",
  "evidence": ["data point 1", "data point 2"],
  "contrarian": "the contrarian Rossignoli & Partners view",
  "confidence": 0.0-1.0
}]`;

    let userPrompt = this.buildNarrativePrompt(snapshot, previousBriefs, historicalAnalogues);

    if (regimeContext) {
      userPrompt += `\n\nREGIME CONTEXT (from finance module):
- Current regime: ${regimeContext.regime} (confidence: ${regimeContext.confidence.toFixed(2)})
- Trend strength: ${regimeContext.trendStrength.toFixed(2)}
Factor this regime assessment into your narrative synthesis.`;
    }

    try {
      const result = await this.mcp.call('openai', 'openai_chat', {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      });

      const content = result.data?.choices?.[0]?.message?.content || '[]';
      const parsed = this.parseJSON(content);

      if (!Array.isArray(parsed)) return this.fallbackNarratives(snapshot);

      return parsed.map((n: any) => ({
        id: randomUUID(),
        title: n.title || 'Untitled',
        horizon: (n.horizon as TimeHorizon) || 'short',
        thesis: n.thesis || '',
        evidence: n.evidence || [],
        contrarian: n.contrarian || '',
        confidence: typeof n.confidence === 'number' ? n.confidence : 0.5,
        lastUpdated: new Date(),
      }));
    } catch (error) {
      console.error('[MarketAnalyzer] Narrative synthesis failed:', error);
      return this.fallbackNarratives(snapshot);
    }
  }

  /**
   * Compare current to past weeks — what changed?
   */
  async detectShifts(
    current: WeeklySnapshot,
    previous: WeeklySnapshot[],
  ): Promise<ThemeShift[]> {
    if (previous.length === 0) return [];

    const lastWeek = previous[0];
    const shifts: ThemeShift[] = [];

    // Compare themes
    const currentThemes = new Set(current.themes);
    const previousThemes = new Set(lastWeek.themes);

    for (const theme of currentThemes) {
      if (!previousThemes.has(theme)) {
        shifts.push({
          theme,
          direction: 'emerging',
          from: 'not present',
          to: 'active this week',
          significance: 'medium',
        });
      }
    }

    for (const theme of previousThemes) {
      if (!currentThemes.has(theme)) {
        shifts.push({
          theme,
          direction: 'fading',
          from: 'active last week',
          to: 'no longer prominent',
          significance: 'low',
        });
      }
    }

    // Compare sentiment
    if (current.sentiment.overall !== lastWeek.sentiment.overall) {
      shifts.push({
        theme: 'Market Sentiment',
        direction: current.sentiment.score > lastWeek.sentiment.score ? 'strengthening' : 'weakening',
        from: `${lastWeek.sentiment.overall} (${lastWeek.sentiment.score.toFixed(2)})`,
        to: `${current.sentiment.overall} (${current.sentiment.score.toFixed(2)})`,
        significance: 'high',
      });
    }

    return shifts;
  }

  /**
   * Generate contrarian views (Rossignoli & Partners style)
   */
  async generateContrarianView(
    consensus: string,
    data: Record<string, any>,
  ): Promise<string> {
    try {
      const result = await this.mcp.call('openai', 'openai_chat', {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a contrarian investment strategist at Rossignoli & Partners.
Given the market consensus, provide a concise contrarian view (2-3 sentences).
Focus on what the crowd is missing, historical analogues, and positioning asymmetries.
Be specific with data references, not generic.`,
          },
          {
            role: 'user',
            content: `Consensus: ${consensus}\n\nSupporting data: ${JSON.stringify(data)}`,
          },
        ],
        temperature: 0.8,
        max_tokens: 300,
      });

      return result.data?.choices?.[0]?.message?.content || consensus;
    } catch {
      return `Contrarian to consensus: ${consensus}`;
    }
  }

  /**
   * Build the complete market brief
   */
  async buildBrief(
    snapshot: WeeklySnapshot,
    narratives: NarrativeThread[],
    memoryLayers: MemoryLayers,
    calibration?: CalibrationProfile,
  ): Promise<MarketBrief> {
    // Get positioning recommendations (with calibration if available)
    const positioning = await this.generatePositioning(snapshot, narratives, calibration);

    // Extract risks and opportunities from narratives
    const risks = narratives
      .filter(n => n.confidence < 0.6)
      .map(n => `${n.title}: ${n.thesis.split('.')[0]}`);

    const opportunities = narratives
      .filter(n => n.confidence >= 0.6)
      .map(n => `${n.title}: ${n.contrarian}`);

    return {
      id: randomUUID(),
      week: snapshot.week,
      date: snapshot.date,
      snapshot,
      narratives,
      positioning,
      risks: risks.length > 0 ? risks : ['No significant risks identified this week'],
      opportunities: opportunities.length > 0 ? opportunities : ['Monitor for emerging opportunities'],
    };
  }

  // ==========================================================================
  // Internal Methods
  // ==========================================================================

  private async generatePositioning(
    snapshot: WeeklySnapshot,
    narratives: NarrativeThread[],
    calibration?: CalibrationProfile,
  ): Promise<PositioningView[]> {
    // Build calibration context for the LLM prompt
    let calibrationPrompt = '';
    if (calibration && calibration.adjustments.length > 0) {
      calibrationPrompt = '\n\nCALIBRATION (based on your track record — RESPECT these caps):\n' +
        calibration.adjustments.map(a =>
          `- ${a.assetClass}: max conviction=${a.suggestedConvictionCap} (${a.note})`
        ).join('\n');
    }

    try {
      const result = await this.mcp.call('openai', 'openai_chat', {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a portfolio strategist at Rossignoli & Partners.
Based on the market snapshot and narratives, provide positioning views.
Return JSON array: [{"assetClass": "name", "position": "long"|"short"|"neutral", "conviction": "high"|"medium"|"low", "rationale": "why"}]
Cover: US Equities, European Equities, EM Equities, US Treasuries, Credit, Gold, USD, Crypto.${calibrationPrompt}`,
          },
          {
            role: 'user',
            content: `Snapshot themes: ${snapshot.themes.join(', ')}
Sentiment: ${snapshot.sentiment.overall} (${snapshot.sentiment.score.toFixed(2)})
Narratives: ${narratives.map(n => `${n.title}: ${n.thesis}`).join('\n')}`,
          },
        ],
        temperature: 0.5,
        max_tokens: 2048,
      });

      const content = result.data?.choices?.[0]?.message?.content || '[]';
      const parsed = this.parseJSON(content);
      if (Array.isArray(parsed)) {
        // Programmatic enforcement: if LLM ignores calibration caps, force downgrade
        return this.enforceCalibrationCaps(parsed, calibration);
      }
    } catch {
      // Fall through to defaults
    }

    return this.defaultPositioning();
  }

  /**
   * Enforce calibration conviction caps programmatically.
   * If the LLM returns a higher conviction than allowed, downgrade it.
   */
  private enforceCalibrationCaps(
    positioning: PositioningView[],
    calibration?: CalibrationProfile,
  ): PositioningView[] {
    if (!calibration || calibration.adjustments.length === 0) return positioning;

    const capMap = new Map<string, 'high' | 'medium' | 'low'>();
    for (const adj of calibration.adjustments) {
      capMap.set(adj.assetClass, adj.suggestedConvictionCap);
    }

    const convictionRank: Record<string, number> = { low: 1, medium: 2, high: 3 };

    return positioning.map(pos => {
      const cap = capMap.get(pos.assetClass);
      if (!cap) return pos;

      const posRank = convictionRank[pos.conviction] || 2;
      const capRank = convictionRank[cap] || 3;

      if (posRank > capRank) {
        console.log(`[Calibration] Downgrading ${pos.assetClass} conviction: ${pos.conviction} -> ${cap}`);
        return { ...pos, conviction: cap };
      }
      return pos;
    });
  }

  private buildNarrativePrompt(
    snapshot: WeeklySnapshot,
    previousBriefs: Memory[],
    historicalAnalogues: SemanticMemory[],
  ): string {
    let prompt = `WEEKLY MARKET DATA (${snapshot.week}, ${snapshot.date}):\n\n`;

    // Headlines
    prompt += `TOP HEADLINES:\n`;
    for (const h of snapshot.headlines.slice(0, 10)) {
      prompt += `- [${h.impact.toUpperCase()}] ${h.title} (${h.source})\n`;
    }

    // Themes
    prompt += `\nACTIVE THEMES: ${snapshot.themes.join(', ')}\n`;

    // Sentiment
    prompt += `SENTIMENT: ${snapshot.sentiment.overall} (score: ${snapshot.sentiment.score.toFixed(2)})\n`;

    // Market levels
    prompt += `\nMARKET LEVELS:\n`;
    for (const m of snapshot.markets) {
      prompt += `- ${m.name}: ${m.level} (1w: ${m.change1w}, YTD: ${m.changeYtd})\n`;
    }

    // Previous context
    if (previousBriefs.length > 0) {
      prompt += `\nPREVIOUS CONTEXT:\n`;
      for (const brief of previousBriefs.slice(0, 2)) {
        if (brief.type === 'episodic') {
          prompt += `- ${brief.content.what}: ${JSON.stringify(brief.content.details?.themes || [])}\n`;
        }
      }
    }

    // Historical analogues
    if (historicalAnalogues.length > 0) {
      prompt += `\nHISTORICAL ANALOGUES:\n`;
      for (const analogue of historicalAnalogues.slice(0, 3)) {
        prompt += `- ${analogue.content.concept}: ${analogue.content.definition}\n`;
        if (analogue.content.properties?.lesson) {
          prompt += `  Lesson: ${analogue.content.properties.lesson}\n`;
        }
      }
    }

    prompt += `\nGenerate 3 narrative threads covering short, medium, and long-term horizons.`;
    return prompt;
  }

  private fallbackNarratives(snapshot: WeeklySnapshot): NarrativeThread[] {
    const narratives: NarrativeThread[] = [{
      id: randomUUID(),
      title: 'Weekly Market Review',
      horizon: 'short',
      thesis: `Markets this week were characterized by ${snapshot.sentiment.overall} sentiment with themes around ${snapshot.themes.slice(0, 2).join(' and ') || 'mixed signals'}.`,
      evidence: snapshot.headlines.slice(0, 3).map(h => h.title),
      contrarian: 'Await more data for a stronger contrarian signal.',
      confidence: 0.4,
      lastUpdated: new Date(),
    }];

    // Generate additional narratives from prominent themes
    for (const theme of snapshot.themes.slice(0, 2)) {
      const themeHeadlines = snapshot.headlines.filter(h => h.theme === theme);
      if (themeHeadlines.length > 0) {
        narratives.push({
          id: randomUUID(),
          title: theme,
          horizon: 'medium',
          thesis: `${theme} is a dominant theme this week, driven by ${themeHeadlines.length} headline(s).`,
          evidence: themeHeadlines.slice(0, 2).map(h => h.title),
          contrarian: `Monitor whether ${theme} persists or fades in coming weeks.`,
          confidence: 0.3,
          lastUpdated: new Date(),
        });
      }
    }

    return narratives;
  }

  private defaultPositioning(): PositioningView[] {
    return [
      { assetClass: 'US Equities', position: 'neutral', conviction: 'medium', rationale: 'Awaiting data for conviction' },
      { assetClass: 'European Equities', position: 'long', conviction: 'medium', rationale: 'Structural undervaluation vs US' },
      { assetClass: 'Gold', position: 'long', conviction: 'high', rationale: 'Structural, not tactical' },
      { assetClass: 'US Treasuries', position: 'neutral', conviction: 'low', rationale: 'Yield curve dynamics unclear' },
    ];
  }

  private parseJSON(text: string): any {
    // Try to extract JSON from text that may have markdown formatting
    try {
      return JSON.parse(text);
    } catch {
      // Try to find JSON array in the text
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}
