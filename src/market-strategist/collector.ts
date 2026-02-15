/**
 * Genesis v17.0 - Market Data Collector
 *
 * Data collection pipeline using MCP tools:
 * - brave-search: Headlines, weekly market recaps
 * - exa: Institutional research papers
 * - firecrawl: Article content extraction (Bilello, FactSet)
 * - playwright: Chart screenshots from FRED, interactive sites
 */

import { getMCPClient } from '../mcp/index.js';
import type { IMCPClient } from '../mcp/index.js';
import type {
  WeeklySnapshot,
  AssetSnapshot,
  Headline,
  SentimentGauge,
  SourceRef,
  SourceConfig,
  ScrapedChart,
  ResearchSummary,
  StrategyConfig,
} from './types.js';
import { DEFAULT_STRATEGY_CONFIG as CONFIG } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Market Collector
// ============================================================================

export class MarketCollector {
  private mcp: IMCPClient;
  private config: StrategyConfig;

  constructor(config?: Partial<StrategyConfig>) {
    this.mcp = getMCPClient();
    this.config = { ...CONFIG, ...config };
  }

  /**
   * Collect all weekly market data from configured sources
   */
  async collectWeeklyData(): Promise<WeeklySnapshot> {
    const now = new Date();
    const week = this.getISOWeek(now);
    const date = now.toISOString().slice(0, 10);

    // Collect in parallel where possible
    const [headlines, research, bilelloData] = await Promise.allSettled([
      this.searchHeadlines(this.config.focusAssets),
      this.scrapeResearch([]),
      this.scrapeBilello(),
    ]);

    const collectedHeadlines = headlines.status === 'fulfilled' ? headlines.value : [];
    const collectedResearch = research.status === 'fulfilled' ? research.value : [];
    const bilello = bilelloData.status === 'fulfilled' ? bilelloData.value : null;

    // Build asset snapshots from collected data
    const markets = await this.buildAssetSnapshots(collectedHeadlines, bilello);

    // Extract themes from headlines
    const themes = this.extractThemes(collectedHeadlines);

    // Build sentiment gauge (LLM-based with keyword fallback)
    const sentiment = await this.classifySentimentLLM(collectedHeadlines);

    // Track sources
    const sources: SourceRef[] = [];
    if (headlines.status === 'fulfilled') {
      sources.push({ name: 'brave', url: 'brave-search', type: 'headlines', accessedAt: now });
    }
    if (research.status === 'fulfilled') {
      sources.push({ name: 'exa', url: 'exa-search', type: 'research', accessedAt: now });
    }
    if (bilelloData.status === 'fulfilled') {
      sources.push({ name: 'bilello', url: 'https://bilello.blog', type: 'charts', accessedAt: now });
    }

    return {
      week,
      date,
      markets,
      headlines: collectedHeadlines,
      themes,
      sentiment,
      sources,
    };
  }

  /**
   * Scrape charts from institutional sources
   */
  async scrapeCharts(sourceNames: string[]): Promise<ScrapedChart[]> {
    const charts: ScrapedChart[] = [];
    const enabledSources = sourceNames.length > 0
      ? this.config.sources.filter(s => sourceNames.includes(s.name) && s.enabled)
      : this.config.sources.filter(s => s.enabled && (s.type === 'charts+data' || s.type === 'data+charts'));

    // Ensure output directory exists
    try {
      fs.mkdirSync(this.config.scrapedChartsDir, { recursive: true });
    } catch { /* exists */ }

    for (const source of enabledSources) {
      try {
        const scraped = await this.scrapeChartsFromSource(source);
        charts.push(...scraped);
      } catch (error) {
        // Log but continue with other sources
        console.error(`[MarketCollector] Failed to scrape charts from ${source.name}:`, error);
      }
    }

    return charts;
  }

  /**
   * Search for market headlines using Brave Search
   */
  async searchHeadlines(topics: string[]): Promise<Headline[]> {
    const headlines: Headline[] = [];

    // Build search queries
    const queries = [
      'weekly market recap stock bond',
      ...topics.slice(0, 3).map(t => `${t} market news this week`),
    ];

    for (const query of queries) {
      try {
        const result = await this.mcp.call('brave-search', 'brave_web_search', {
          query,
          count: 5,
        });

        if (result.data?.web?.results) {
          for (const r of result.data.web.results) {
            headlines.push({
              title: r.title || '',
              source: r.url || '',
              url: r.url,
              impact: this.classifyImpact(r.title || ''),
              theme: this.classifyTheme(r.title || ''),
            });
          }
        }
      } catch (error) {
        console.error(`[MarketCollector] Brave search failed for "${query}":`, error);
      }
    }

    // Deduplicate by title
    const seen = new Set<string>();
    return headlines.filter(h => {
      const key = h.title.toLowerCase().slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Scrape research articles from institutional sources
   */
  async scrapeResearch(urls: string[]): Promise<ResearchSummary[]> {
    const summaries: ResearchSummary[] = [];

    // If no specific URLs, search via Exa
    if (urls.length === 0) {
      try {
        const result = await this.mcp.call('exa', 'web_search_exa', {
          query: 'institutional weekly market strategy outlook 2026',
          numResults: 5,
          type: 'auto',
        });

        if (result.data?.results) {
          for (const r of result.data.results) {
            summaries.push({
              source: 'exa',
              title: r.title || '',
              url: r.url || '',
              summary: r.text?.slice(0, 500) || '',
              keyFindings: [],
              date: r.publishedDate || new Date().toISOString(),
            });
          }
        }
      } catch (error) {
        console.error('[MarketCollector] Exa search failed:', error);
      }
    }

    // Scrape specific URLs via Firecrawl
    for (const url of urls) {
      try {
        const result = await this.mcp.call('firecrawl', 'firecrawl_scrape', {
          url,
          formats: ['markdown'],
          onlyMainContent: true,
        });

        if (result.data?.markdown) {
          summaries.push({
            source: 'firecrawl',
            title: result.data.metadata?.title || url,
            url,
            summary: result.data.markdown.slice(0, 1000),
            keyFindings: [],
            date: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error(`[MarketCollector] Firecrawl failed for ${url}:`, error);
      }
    }

    return summaries;
  }

  // ==========================================================================
  // Internal Methods
  // ==========================================================================

  private async scrapeBilello(): Promise<any> {
    try {
      const result = await this.mcp.call('firecrawl', 'firecrawl_scrape', {
        url: 'https://bilello.blog',
        formats: ['markdown'],
        onlyMainContent: true,
      });
      return result.data;
    } catch {
      return null;
    }
  }

  private async scrapeChartsFromSource(source: SourceConfig): Promise<ScrapedChart[]> {
    const charts: ScrapedChart[] = [];

    if (source.method === 'playwright' && source.url) {
      try {
        // Navigate to source
        await this.mcp.call('playwright', 'browser_navigate', {
          url: `https://${source.url}`,
        });

        // Take screenshot
        const screenshot = await this.mcp.call('playwright', 'browser_take_screenshot', {});

        if (screenshot.data) {
          const filename = `${source.name}-${Date.now()}.png`;
          const filepath = path.join(this.config.scrapedChartsDir, filename);

          // Save screenshot data if available
          if (typeof screenshot.data === 'string') {
            fs.writeFileSync(filepath, Buffer.from(screenshot.data, 'base64'));
          }

          charts.push({
            source: source.name,
            title: `${source.name} chart capture`,
            imagePath: filepath,
            url: `https://${source.url}`,
            capturedAt: new Date(),
          });
        }
      } catch (error) {
        console.error(`[MarketCollector] Playwright scrape failed for ${source.name}:`, error);
      }
    }

    return charts;
  }

  private async buildAssetSnapshots(
    headlines: Headline[],
    bilelloData: any,
  ): Promise<AssetSnapshot[]> {
    // If bilelloData contains markdown, try to extract asset data via LLM
    if (bilelloData?.markdown && typeof bilelloData.markdown === 'string' && bilelloData.markdown.length > 100) {
      try {
        const result = await this.mcp.call('openai', 'openai_chat', {
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `Extract market data from the scraped content. Return a JSON array with objects:
[{"name": "asset name", "level": "current price/level", "change1w": "weekly change %", "changeMtd": "MTD %", "changeYtd": "YTD %", "signal": "bullish"|"bearish"|"neutral", "commentary": "one-line insight"}]
Only include assets from this list: ${this.config.focusAssets.join(', ')}.
If data is not available for an asset, use "N/A" for missing fields.`,
            },
            {
              role: 'user',
              content: bilelloData.markdown.slice(0, 4000),
            },
          ],
          temperature: 0.2,
          max_tokens: 2048,
        });

        const content = result.data?.choices?.[0]?.message?.content || '';
        const parsed = this.parseJSON(content);

        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge parsed data with focus assets (ensure all assets are represented)
          const parsedMap = new Map(parsed.map((p: any) => [p.name, p]));
          return this.config.focusAssets.map(asset => {
            const data = parsedMap.get(asset);
            if (data) {
              return {
                name: asset,
                level: String(data.level || 'N/A'),
                change1w: String(data.change1w || 'N/A'),
                changeMtd: String(data.changeMtd || 'N/A'),
                changeYtd: String(data.changeYtd || 'N/A'),
                signal: (['bullish', 'bearish', 'neutral'].includes(data.signal) ? data.signal : 'neutral') as 'bullish' | 'bearish' | 'neutral',
                commentary: String(data.commentary || ''),
              };
            }
            return { name: asset, level: 'N/A', change1w: 'N/A', changeMtd: 'N/A', changeYtd: 'N/A', signal: 'neutral' as const, commentary: '' };
          });
        }
      } catch (error) {
        console.error('[MarketCollector] LLM asset parsing failed, using placeholders:', error);
      }
    }

    // Fallback: placeholder snapshots
    return this.config.focusAssets.map(asset => ({
      name: asset,
      level: 'N/A',
      change1w: 'N/A',
      changeMtd: 'N/A',
      changeYtd: 'N/A',
      signal: 'neutral' as const,
      commentary: '',
    }));
  }

  private parseJSON(text: string): any {
    try {
      return JSON.parse(text);
    } catch {
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

  private extractThemes(headlines: Headline[]): string[] {
    // Group headlines by theme and return unique themes
    const themes = new Set<string>();
    for (const h of headlines) {
      if (h.theme && h.theme !== 'general') {
        themes.add(h.theme);
      }
    }
    return Array.from(themes).slice(0, 5);
  }

  /**
   * LLM-based sentiment classification (Item 6)
   * Uses OpenAI to analyze headlines and return structured sentiment data.
   * Falls back to keyword-based approach on failure.
   */
  private async classifySentimentLLM(headlines: Headline[]): Promise<SentimentGauge> {
    if (headlines.length === 0) return { overall: 'neutral', score: 0, indicators: {} };

    try {
      const headlineText = headlines.slice(0, 30).map(h => `- ${h.title} [${h.source}]`).join('\n');

      const result = await this.mcp.call('openai', 'openai_chat', {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a market sentiment analyst. Analyze these headlines and return a JSON object with: {"overall": "bullish"|"bearish"|"neutral", "score": -1.0 to 1.0, "indicators": {"headline_sentiment": -1 to 1, "risk_appetite": -1 to 1, "momentum": -1 to 1}, "rationale": "brief explanation"}',
          },
          {
            role: 'user',
            content: `Classify the overall market sentiment from these headlines:\n${headlineText}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      });

      const content = result.data?.choices?.[0]?.message?.content || '';
      const parsed = JSON.parse(content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());

      return {
        overall: parsed.overall || 'neutral',
        score: typeof parsed.score === 'number' ? Math.max(-1, Math.min(1, parsed.score)) : 0,
        indicators: parsed.indicators || {},
      };
    } catch (error) {
      console.warn('[MarketCollector] LLM sentiment failed, falling back to keyword:', error);
      return this.buildSentiment(headlines);
    }
  }

  private buildSentiment(headlines: Headline[]): SentimentGauge {
    // Simple heuristic: count bullish vs bearish keywords in headlines
    let bullish = 0;
    let bearish = 0;
    const bullishWords = ['rally', 'surge', 'gain', 'rise', 'record', 'bullish', 'up'];
    const bearishWords = ['fall', 'crash', 'drop', 'decline', 'sell', 'bearish', 'fear', 'risk'];

    for (const h of headlines) {
      const lower = h.title.toLowerCase();
      for (const w of bullishWords) if (lower.includes(w)) bullish++;
      for (const w of bearishWords) if (lower.includes(w)) bearish++;
    }

    const total = bullish + bearish || 1;
    const score = (bullish - bearish) / total;

    return {
      overall: score > 0.2 ? 'bullish' : score < -0.2 ? 'bearish' : 'neutral',
      score: Math.max(-1, Math.min(1, score)),
      indicators: { headline_bull: bullish, headline_bear: bearish },
    };
  }

  private classifyImpact(title: string): 'high' | 'medium' | 'low' {
    const highImpact = ['fed', 'rate', 'inflation', 'recession', 'crash', 'war', 'tariff', 'crisis'];
    const lower = title.toLowerCase();
    if (highImpact.some(w => lower.includes(w))) return 'high';
    if (lower.includes('earnings') || lower.includes('gdp') || lower.includes('jobs')) return 'medium';
    return 'low';
  }

  private classifyTheme(title: string): string {
    const lower = title.toLowerCase();
    if (lower.includes('ai') || lower.includes('artificial') || lower.includes('tech')) return 'AI & Technology';
    if (lower.includes('fed') || lower.includes('rate') || lower.includes('inflation')) return 'Monetary Policy';
    if (lower.includes('china') || lower.includes('trade') || lower.includes('tariff')) return 'Trade & Geopolitics';
    if (lower.includes('earn') || lower.includes('revenue') || lower.includes('profit')) return 'Earnings';
    if (lower.includes('gold') || lower.includes('commodit')) return 'Commodities';
    if (lower.includes('bond') || lower.includes('yield') || lower.includes('treasury')) return 'Fixed Income';
    if (lower.includes('crypto') || lower.includes('bitcoin')) return 'Crypto';
    return 'general';
  }

  private getISOWeek(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }
}
