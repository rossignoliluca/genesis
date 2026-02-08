/**
 * Genesis v18.5 - Weekly Report Pipeline
 *
 * REPEATABLE process that runs the entire weekly report workflow:
 *
 * 1. COLLECT  → Scrape 20+ sources via MCP (brave-search, firecrawl, exa)
 * 2. VERIFY   → Cross-reference every data point, flag unverified
 * 3. ANALYZE  → Synthesize narratives via LLM (OpenAI MCP)
 * 4. BUILD    → Generate SYZ-style 30+ slide PresentationSpec
 * 5. RENDER   → Generate PPTX via Python presentation engine
 * 6. SOCIAL   → Prepare social content (Twitter, LinkedIn, Bluesky)
 * 7. STORE    → Save to 4-layer memory for learning
 *
 * Usage:
 *   const pipeline = new WeeklyReportPipeline();
 *   const result = await pipeline.run();
 *   // result.pptxPath = '/tmp/weekly-strategy-2026-W06.pptx'
 *   // result.socialContent = { twitter: [...], linkedin: '...' }
 */

import { getMCPClient } from '../mcp/index.js';
import type { IMCPClient } from '../mcp/index.js';
import { MarketCollector } from './collector.js';
import { MarketAnalyzer } from './analyzer.js';
import { MemoryLayers } from './memory-layers.js';
import { DataVerifier } from './verifier.js';
import { EXTENDED_SOURCES, getCriticalSources, getSourcesByCategory } from './sources.js';
import type { ExtendedSource, SourceCategory } from './sources.js';
import type {
  WeeklySnapshot,
  AssetSnapshot,
  Headline,
  MarketBrief,
  StrategyConfig,
  SourceRef,
} from './types.js';
import { DEFAULT_STRATEGY_CONFIG } from './types.js';
import type { PresentationSpec, SlideSpec, ChartSpec } from '../presentation/types.js';
import { briefToSocialContent } from '../content/strategy-wiring.js';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

// ============================================================================
// Pipeline Types
// ============================================================================

export interface PipelineConfig {
  /** Max priority level to collect (1=critical only, 2=important, 3=all) */
  sourcePriority: number;
  /** Run data verification step */
  verify: boolean;
  /** Generate PPTX file */
  generatePptx: boolean;
  /** Prepare social content */
  prepareSocial: boolean;
  /** Store in memory */
  storeMemory: boolean;
  /** Output directory */
  outputDir: string;
  /** Branding */
  company: string;
  tagline: string;
  contact: string[];
  website: string;
  palette: string;
  /** Editorial mode */
  mode: 'editorial' | 'standard';
  /** Logo image path for editorial footer */
  logoPath?: string;
  /** Focus assets for the scoreboard */
  focusAssets: string[];
  /** Italian geopolitical sources */
  includeItalianGeo: boolean;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  sourcePriority: 2,
  verify: true,
  generatePptx: true,
  prepareSocial: false,
  storeMemory: true,
  outputDir: '/tmp',
  company: 'Rossignoli & Partners',
  tagline: 'Independent Wealth Management',
  contact: ['Via Nassa 21, CH-6900 Lugano', '+41 91 922 44 00'],
  website: 'www.rossignolipartners.ch',
  palette: 'rossignoli_editorial',
  mode: 'editorial',
  focusAssets: [
    'S&P 500', 'Nasdaq 100', 'Dow Jones', 'STOXX 600', 'FTSE MIB',
    'US 10Y', 'US 2Y', 'German 10Y', 'EUR/USD', 'USD/CHF',
    'Gold', 'Oil WTI', 'Bitcoin', 'VIX',
  ],
  includeItalianGeo: true,
};

export interface PipelineResult {
  success: boolean;
  week: string;
  date: string;
  /** Collected data summary */
  collected: {
    headlines: number;
    sources: number;
    themes: string[];
  };
  /** Verification results */
  verification?: {
    rate: number;
    verified: number;
    unverified: number;
    warnings: string[];
  };
  /** Generated brief */
  brief: MarketBrief;
  /** PPTX file path */
  pptxPath?: string;
  /** Presentation spec (JSON) */
  specPath?: string;
  /** Social content */
  socialContent?: {
    twitter: string[];
    linkedin: string;
    bluesky: string[];
  };
  /** Timings */
  timings: Record<string, number>;
  /** Errors encountered */
  errors: string[];
}

// ============================================================================
// Weekly Report Pipeline
// ============================================================================

export class WeeklyReportPipeline {
  private mcp: IMCPClient;
  private collector: MarketCollector;
  private analyzer: MarketAnalyzer;
  private verifier: DataVerifier;
  private memoryLayers: MemoryLayers;
  private config: PipelineConfig;

  constructor(config?: Partial<PipelineConfig>) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
    this.mcp = getMCPClient();
    this.collector = new MarketCollector({
      ...DEFAULT_STRATEGY_CONFIG,
      focusAssets: this.config.focusAssets,
      outputDir: this.config.outputDir,
      presentationPalette: this.config.palette,
    });
    this.analyzer = new MarketAnalyzer();
    this.verifier = new DataVerifier();
    this.memoryLayers = new MemoryLayers();
  }

  /**
   * Run the full weekly report pipeline
   */
  async run(): Promise<PipelineResult> {
    const timings: Record<string, number> = {};
    const errors: string[] = [];
    const now = new Date();
    const week = this.getISOWeek(now);
    const date = now.toISOString().slice(0, 10);

    console.log(`\n========================================`);
    console.log(`  WEEKLY REPORT PIPELINE — ${week}`);
    console.log(`  ${this.config.company}`);
    console.log(`========================================\n`);

    // ---- STEP 1: COLLECT ----
    console.log(`[1/7] COLLECTING data from ${EXTENDED_SOURCES.filter(s => s.enabled && s.priority <= this.config.sourcePriority).length} sources...`);
    const t1 = Date.now();

    const snapshot = await this.collectFromAllSources(week, date);
    timings.collect = Date.now() - t1;
    console.log(`  → ${snapshot.headlines.length} headlines, ${snapshot.markets.length} assets, ${snapshot.themes.length} themes (${timings.collect}ms)`);

    // ---- STEP 2: VERIFY ----
    let verificationResult;
    if (this.config.verify) {
      console.log(`[2/7] VERIFYING data points...`);
      const t2 = Date.now();
      try {
        const report = await this.verifier.verifyAssets(snapshot.markets);
        verificationResult = {
          rate: report.verificationRate,
          verified: report.verifiedCount,
          unverified: report.unverifiedCount,
          warnings: report.warnings,
        };
        timings.verify = Date.now() - t2;
        console.log(`  → ${report.verifiedCount}/${report.totalDataPoints} verified (${(report.verificationRate * 100).toFixed(0)}%) (${timings.verify}ms)`);
        if (report.warnings.length > 0) {
          console.log(`  ⚠ ${report.warnings.length} warnings`);
        }
      } catch (e) {
        errors.push(`Verification failed: ${e}`);
        timings.verify = Date.now() - t2;
      }
    }

    // ---- STEP 3: ANALYZE ----
    console.log(`[3/7] ANALYZING and synthesizing narratives...`);
    const t3 = Date.now();

    const context = await this.memoryLayers.recallContext('weekly market strategy');
    const narratives = await this.analyzer.synthesizeNarrative(
      snapshot,
      context.recentWeeks,
      context.historicalAnalogues,
    );
    const brief = await this.analyzer.buildBrief(snapshot, narratives, this.memoryLayers);
    timings.analyze = Date.now() - t3;
    console.log(`  → ${narratives.length} narratives, ${brief.positioning.length} positions (${timings.analyze}ms)`);

    // ---- STEP 4: BUILD PRESENTATION SPEC ----
    console.log(`[4/7] BUILDING SYZ-style presentation spec...`);
    const t4 = Date.now();

    const spec = this.buildRichPresentationSpec(brief);
    const specPath = path.join(this.config.outputDir, `weekly-strategy-${week}.json`);
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
    timings.buildSpec = Date.now() - t4;
    console.log(`  → ${spec.slides.length} slides, spec saved to ${specPath} (${timings.buildSpec}ms)`);

    // ---- STEP 5: RENDER PPTX ----
    let pptxPath: string | undefined;
    if (this.config.generatePptx) {
      console.log(`[5/7] RENDERING PPTX via presentation engine...`);
      const t5 = Date.now();
      try {
        pptxPath = await this.renderPptx(spec, specPath);
        timings.render = Date.now() - t5;
        console.log(`  → ${pptxPath} (${timings.render}ms)`);
      } catch (e) {
        errors.push(`PPTX rendering failed: ${e}`);
        timings.render = Date.now() - t5;
      }
    }

    // ---- STEP 6: SOCIAL CONTENT ----
    let socialContent;
    if (this.config.prepareSocial) {
      console.log(`[6/7] PREPARING social content...`);
      const t6 = Date.now();
      socialContent = briefToSocialContent({
        week: brief.week,
        date: brief.date,
        sentiment: {
          overall: brief.snapshot.sentiment.overall,
          score: brief.snapshot.sentiment.score,
        },
        themes: brief.snapshot.themes,
        narratives: brief.narratives.map(n => ({
          title: n.title,
          thesis: n.thesis,
          horizon: n.horizon,
        })),
        positioning: brief.positioning.map(p => ({
          assetClass: p.assetClass,
          position: p.position,
          rationale: p.rationale,
        })),
        risks: brief.risks,
        opportunities: brief.opportunities,
      });
      timings.social = Date.now() - t6;
      console.log(`  → Twitter thread (${socialContent.twitter.length} tweets), LinkedIn post, Bluesky thread (${timings.social}ms)`);
    }

    // ---- STEP 7: STORE IN MEMORY ----
    if (this.config.storeMemory) {
      console.log(`[7/7] STORING in memory...`);
      const t7 = Date.now();
      this.memoryLayers.storeWeekly(snapshot);
      for (const narrative of narratives) {
        if (narrative.horizon !== 'short' && narrative.confidence >= 0.6) {
          this.memoryLayers.storeMonthly(narrative);
        }
      }
      timings.store = Date.now() - t7;
      const stats = this.memoryLayers.getStats();
      console.log(`  → Memory: ${stats.weekly}W / ${stats.monthly}M / ${stats.annual}A / ${stats.history}H (${timings.store}ms)`);
    }

    const totalTime = Object.values(timings).reduce((a, b) => a + b, 0);
    console.log(`\n✓ Pipeline complete in ${(totalTime / 1000).toFixed(1)}s`);
    if (pptxPath) console.log(`  PPTX: ${pptxPath}`);
    if (errors.length > 0) console.log(`  ⚠ ${errors.length} errors encountered`);

    return {
      success: errors.length === 0,
      week,
      date,
      collected: {
        headlines: snapshot.headlines.length,
        sources: snapshot.sources.length,
        themes: snapshot.themes,
      },
      verification: verificationResult,
      brief,
      pptxPath,
      specPath,
      socialContent,
      timings,
      errors,
    };
  }

  // ==========================================================================
  // Step 1: Extended Collection
  // ==========================================================================

  private async collectFromAllSources(week: string, date: string): Promise<WeeklySnapshot> {
    const allHeadlines: Headline[] = [];
    const allSources: SourceRef[] = [];
    const now = new Date();

    // Get sources based on priority
    const sources = EXTENDED_SOURCES.filter(
      s => s.enabled && s.priority <= this.config.sourcePriority
    );

    // Group by method for parallel execution
    const braveSearchSources = sources.filter(s => s.method === 'brave_search');
    const firecrawlSources = sources.filter(s => s.method === 'firecrawl');
    const exaSources = sources.filter(s => s.method === 'exa');

    // Run all brave searches in parallel (rate limited)
    const braveResults = await Promise.allSettled(
      braveSearchSources.flatMap(s =>
        (s.searchQueries || []).map(query =>
          this.searchBrave(query, s.name, s.category)
        )
      )
    );

    for (const result of braveResults) {
      if (result.status === 'fulfilled' && result.value) {
        allHeadlines.push(...result.value.headlines);
        if (result.value.sourceName) {
          allSources.push({
            name: result.value.sourceName,
            url: result.value.sourceUrl || 'brave-search',
            type: 'headlines',
            accessedAt: now,
          });
        }
      }
    }

    // Scrape via firecrawl (sequential to respect rate limits)
    for (const source of firecrawlSources) {
      for (const url of (source.scrapeUrls || []).slice(0, 2)) {
        try {
          const scraped = await this.scrapeFirecrawl(url, source.name, source.category);
          if (scraped) {
            allHeadlines.push(...scraped.headlines);
            allSources.push({
              name: source.name,
              url,
              type: 'data',
              accessedAt: now,
            });
          }
        } catch (e) {
          // Continue on failure
        }
      }
    }

    // Exa research
    for (const source of exaSources) {
      try {
        const results = await this.collector.scrapeResearch([]);
        for (const r of results) {
          allHeadlines.push({
            title: r.title,
            source: r.url,
            url: r.url,
            impact: 'medium',
            theme: 'Research',
          });
        }
        allSources.push({
          name: source.name,
          url: 'exa-search',
          type: 'research',
          accessedAt: now,
        });
      } catch (e) {
        // Continue
      }
    }

    // Build asset snapshots from collected data
    const markets = await this.buildAssetSnapshots(allHeadlines);

    // Extract themes
    const themes = this.extractThemes(allHeadlines);

    // Build sentiment
    const sentiment = this.buildSentiment(allHeadlines, markets);

    // Deduplicate headlines
    const seen = new Set<string>();
    const uniqueHeadlines = allHeadlines.filter(h => {
      const key = h.title.toLowerCase().slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      week,
      date,
      markets,
      headlines: uniqueHeadlines,
      themes,
      sentiment,
      sources: allSources,
    };
  }

  private async searchBrave(
    query: string,
    sourceName: string,
    category: SourceCategory,
  ): Promise<{ headlines: Headline[]; sourceName: string; sourceUrl?: string } | null> {
    try {
      const result = await this.mcp.call('brave-search', 'brave_web_search', {
        query,
        count: 5,
      });

      const headlines: Headline[] = [];
      if (result.data?.web?.results) {
        for (const r of result.data.web.results) {
          headlines.push({
            title: r.title || '',
            source: r.url || '',
            url: r.url,
            impact: this.classifyImpact(r.title || ''),
            theme: this.classifyTheme(r.title || '', category),
          });
        }
      }

      return { headlines, sourceName, sourceUrl: query };
    } catch {
      return null;
    }
  }

  private async scrapeFirecrawl(
    url: string,
    sourceName: string,
    category: SourceCategory,
  ): Promise<{ headlines: Headline[] } | null> {
    try {
      const result = await this.mcp.call('firecrawl', 'firecrawl_scrape', {
        url,
        formats: ['markdown'],
        onlyMainContent: true,
      });

      const headlines: Headline[] = [];
      if (result.data?.markdown) {
        // Extract headlines from markdown — look for # headings and bold text
        const lines = result.data.markdown.split('\n');
        for (const line of lines) {
          const headingMatch = line.match(/^#{1,3}\s+(.+)/);
          if (headingMatch && headingMatch[1].length > 20 && headingMatch[1].length < 200) {
            headlines.push({
              title: headingMatch[1].trim(),
              source: url,
              url,
              impact: this.classifyImpact(headingMatch[1]),
              theme: this.classifyTheme(headingMatch[1], category),
            });
          }
        }
      }

      return { headlines: headlines.slice(0, 10) };
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // Step 4: Rich SYZ-Style Presentation Builder
  // ==========================================================================

  buildRichPresentationSpec(brief: MarketBrief): PresentationSpec {
    const slides: SlideSpec[] = [];
    const c = this.config;
    const week = brief.week;

    // Helper: parse numeric change from string like "+2.5%" or "-1.2%"
    const parseChange = (s: string) => parseFloat(s.replace('%', '').replace('+', '')) || 0;

    // Helper: generate commentary from asset data
    const assetCommentary = (assets: { name: string; change1w: string; commentary?: string }[]) => {
      const parts = assets.slice(0, 3).map(a => {
        const chg = a.change1w !== 'N/A' ? ` (${a.change1w})` : '';
        return `${a.name}${chg}`;
      });
      return parts.join(', ') + (assets.length > 3 ? ` and ${assets.length - 3} more.` : '.');
    };

    // ---- COVER ----
    slides.push({
      type: 'cover',
      content: {
        company: c.company,
        tagline: c.tagline,
        headline: '#GlobalMarkets Weekly Wrap-Up',
        subheadline: `Week ${week} — ${brief.date}`,
        date_range: brief.date,
        theme: brief.narratives[0]?.title || 'Market Review',
      },
    });

    // ---- EXECUTIVE SUMMARY ----
    slides.push({
      type: 'executive_summary',
      content: {
        title: 'Week at a Glance',
        tag: week,
        sections: [
          {
            label: 'Sentiment',
            text: `${brief.snapshot.sentiment.overall.toUpperCase()} (${brief.snapshot.sentiment.score.toFixed(2)}) — ${brief.snapshot.themes.slice(0, 3).join(', ')}`,
            color: brief.snapshot.sentiment.overall === 'bullish' ? '#22c55e' :
                   brief.snapshot.sentiment.overall === 'bearish' ? '#ef4444' : '#f59e0b',
          },
          ...brief.narratives.slice(0, 3).map(n => ({
            label: n.title,
            text: n.thesis,
          })),
        ],
      },
    });

    // ---- CROSS-ASSET SCOREBOARD (editorial slide with table_heatmap chart) ----
    const marketData = brief.snapshot.markets.filter(m => m.level !== 'N/A');
    if (marketData.length > 0) {
      slides.push({
        type: 'editorial',
        content: {
          section: 'macro',
          hashtags: '#scoreboard #crossasset #weekly',
          title: 'Cross-Asset Scoreboard',
          commentary: `Weekly performance across ${marketData.length} tracked assets. Green signals bullish momentum, red signals bearish pressure.`,
          source: 'Source: Bloomberg, FRED, Barchart',
        },
        chart: {
          type: 'table_heatmap',
          data: {
            headers: ['Asset', 'Level', '1W', 'MTD', 'YTD', 'Signal'],
            rows: marketData.map(m => [
              m.name, m.level, m.change1w, m.changeMtd, m.changeYtd, m.signal,
            ]),
          },
          source: 'Bloomberg, FRED, Barchart',
        },
      });
    }

    // ---- SECTION: EQUITIES ----
    slides.push({
      type: 'section_divider',
      content: { title: '#equities', section: 'equities', subtitle: 'US, Europe & Emerging Markets' },
    });

    // Equities editorial slide with bar chart
    const equityAssets = brief.snapshot.markets.filter(m =>
      ['S&P 500', 'Nasdaq 100', 'Dow Jones', 'STOXX 600', 'FTSE MIB'].some(
        name => m.name.includes(name)
      ) && m.change1w !== 'N/A'
    );
    if (equityAssets.length > 0) {
      slides.push({
        type: 'editorial',
        content: {
          section: 'equities',
          hashtags: '#us #europe #equities #weekly',
          title: 'Major Indices — Weekly Change',
          commentary: assetCommentary(equityAssets),
          source: 'Source: Bloomberg, Barchart',
        },
        chart: {
          type: 'bar',
          data: {
            labels: equityAssets.map(a => a.name),
            values: equityAssets.map(a => parseChange(a.change1w)),
          },
          config: { value_suffix: '%', color_negative: true },
          source: 'Bloomberg, Barchart',
        },
      });
    }

    // Earnings quote slide (if relevant headline exists)
    const earningsHeadlines = brief.snapshot.headlines.filter(h =>
      h.theme === 'Earnings' || h.title.toLowerCase().includes('earnings')
    ).slice(0, 6);
    if (earningsHeadlines.length > 0) {
      // First earnings headline as a quote slide
      slides.push({
        type: 'quote_slide',
        content: {
          quote: earningsHeadlines[0].title,
          attribution: earningsHeadlines[0].source || 'Market Headlines',
          section: 'equities',
          highlight: true,
          commentary: earningsHeadlines.slice(1, 4).map(h => h.title).join(' | '),
        },
      });
    }

    // ---- SECTION: FIXED INCOME ----
    slides.push({
      type: 'section_divider',
      content: { title: '#fixed_income', section: 'fixed_income', subtitle: 'Government Bonds, Yields & Credit' },
    });

    const bondAssets = brief.snapshot.markets.filter(m =>
      m.name.includes('10Y') || m.name.includes('2Y') || m.name.includes('German')
    );
    if (bondAssets.length > 0) {
      slides.push({
        type: 'editorial',
        content: {
          section: 'fixed_income',
          hashtags: '#bonds #yields #treasury #bund',
          title: 'Government Bond Yields',
          commentary: assetCommentary(bondAssets),
          source: 'Source: FRED, Bloomberg',
        },
        chart: {
          type: 'hbar',
          data: {
            labels: bondAssets.map(a => a.name),
            values: bondAssets.map(a => parseFloat(a.level.replace('%', '')) || 0),
          },
          config: { value_suffix: '%' },
          source: 'FRED, Bloomberg',
        },
      });
    }

    // ---- SECTION: FX ----
    slides.push({
      type: 'section_divider',
      content: { title: '#fx', section: 'fx', subtitle: 'Currency Markets & Dollar Index' },
    });

    const fxAssets = brief.snapshot.markets.filter(m =>
      m.name.includes('EUR/') || m.name.includes('USD/') || m.name.includes('DXY')
    );
    if (fxAssets.length > 0) {
      slides.push({
        type: 'editorial',
        content: {
          section: 'fx',
          hashtags: '#eurusd #usdchf #dxy #fx #weekly',
          title: 'FX Weekly Moves',
          commentary: assetCommentary(fxAssets),
          source: 'Source: Bloomberg',
        },
        chart: {
          type: 'bar',
          data: {
            labels: fxAssets.map(a => a.name),
            values: fxAssets.map(a => parseChange(a.change1w)),
          },
          config: { value_suffix: '%', color_negative: true },
          source: 'Bloomberg',
        },
      });
    }

    // ---- SECTION: COMMODITIES ----
    slides.push({
      type: 'section_divider',
      content: { title: '#commodities', section: 'commodities', subtitle: 'Precious Metals, Energy & Industrial' },
    });

    const commodityAssets = brief.snapshot.markets.filter(m =>
      m.name.includes('Gold') || m.name.includes('Oil') || m.name.includes('Silver') || m.name.includes('Copper')
    );
    if (commodityAssets.length > 0) {
      // Single editorial slide with bar chart
      slides.push({
        type: 'editorial',
        content: {
          section: 'commodities',
          hashtags: '#gold #oil #silver #copper #weekly',
          title: 'Commodities Weekly',
          commentary: assetCommentary(commodityAssets),
          source: 'Source: Bloomberg, Barchart',
        },
        chart: {
          type: 'bar',
          data: {
            labels: commodityAssets.map(a => a.name),
            values: commodityAssets.map(a => parseChange(a.change1w)),
          },
          config: { value_suffix: '%', color_negative: true },
          source: 'Bloomberg, Barchart',
        },
      });

      // Chart grid for individual commodity detail (if 4+ assets)
      if (commodityAssets.length >= 4) {
        slides.push({
          type: 'chart_grid',
          content: {
            title: 'Commodities Detail',
            section: 'commodities',
            hashtags: '#gold #oil #silver #copper',
            grid: commodityAssets.slice(0, 4).map(a => ({
              label: `${a.name}: ${a.change1w}`,
            })),
            cols: 2,
            source: 'Source: Bloomberg',
          },
          charts: commodityAssets.slice(0, 4).map(a => ({
            type: 'bar' as const,
            data: {
              labels: ['1W', 'MTD', 'YTD'],
              values: [parseChange(a.change1w), parseChange(a.changeMtd), parseChange(a.changeYtd)],
            },
            config: { value_suffix: '%', color_negative: true },
          })),
        });
      }
    }

    // ---- SECTION: MACRO ----
    slides.push({
      type: 'section_divider',
      content: { title: '#macro', section: 'macro', subtitle: 'Central Banks, Inflation & Growth' },
    });

    // Macro editorial with commentary
    const macroHeadlines = brief.snapshot.headlines.filter(h =>
      h.theme === 'Monetary Policy' || h.title.toLowerCase().includes('fed') ||
      h.title.toLowerCase().includes('inflation') || h.title.toLowerCase().includes('gdp')
    ).slice(0, 6);
    if (macroHeadlines.length > 0) {
      slides.push({
        type: 'editorial',
        content: {
          section: 'macro',
          hashtags: '#fed #ecb #inflation #growth #centralbanks',
          title: 'Macro Pulse',
          commentary: macroHeadlines.slice(0, 3).map(h => h.title).join('. ') + '.',
          source: 'Source: FRED, ECB, Federal Reserve',
        },
      });

      // Key macro quote if available
      const fedHeadline = macroHeadlines.find(h =>
        h.title.toLowerCase().includes('fed') || h.title.toLowerCase().includes('powell')
      );
      if (fedHeadline) {
        slides.push({
          type: 'quote_slide',
          content: {
            quote: fedHeadline.title,
            attribution: fedHeadline.source || 'Federal Reserve',
            section: 'central_banks',
            highlight: false,
            commentary: 'Key central bank development this week.',
          },
        });
      }
    }

    // ---- SECTION: CRYPTO ----
    slides.push({
      type: 'section_divider',
      content: { title: '#crypto', section: 'crypto', subtitle: 'Bitcoin, Ethereum & Digital Assets' },
    });

    const cryptoAssets = brief.snapshot.markets.filter(m =>
      m.name.includes('Bitcoin') || m.name.includes('Ethereum') || m.name.includes('BTC')
    );
    if (cryptoAssets.length > 0) {
      slides.push({
        type: 'editorial',
        content: {
          section: 'crypto',
          hashtags: '#bitcoin #ethereum #crypto #defi #weekly',
          title: 'Crypto Weekly',
          commentary: assetCommentary(cryptoAssets),
          source: 'Source: CoinGecko, Barchart',
        },
        chart: {
          type: 'bar',
          data: {
            labels: cryptoAssets.map(a => a.name),
            values: cryptoAssets.map(a => parseChange(a.change1w)),
          },
          config: { value_suffix: '%', color_negative: true },
          source: 'CoinGecko, Barchart',
        },
      });
    }

    // ---- SECTION: GEOPOLITICS ----
    slides.push({
      type: 'section_divider',
      content: { title: '#geopolitics', section: 'geopolitics', subtitle: 'Trade, Security & Global Risk' },
    });

    const geoHeadlines = brief.snapshot.headlines.filter(h =>
      h.theme === 'Trade & Geopolitics' || h.title.toLowerCase().includes('tariff') ||
      h.title.toLowerCase().includes('china') || h.title.toLowerCase().includes('war') ||
      h.title.toLowerCase().includes('sanction')
    ).slice(0, 6);
    if (geoHeadlines.length > 0) {
      slides.push({
        type: 'editorial',
        content: {
          section: 'geopolitics',
          hashtags: '#geopolitics #trade #tariffs #global #risk',
          title: 'Geopolitical Watch',
          commentary: geoHeadlines.slice(0, 3).map(h => h.title).join('. ') + '.',
          source: 'Source: Reuters, Bloomberg',
        },
      });
    }

    // ---- NARRATIVE DEEP DIVES (editorial slides) ----
    for (const narrative of brief.narratives) {
      slides.push({
        type: 'editorial',
        content: {
          section: 'macro',
          hashtags: `#${narrative.horizon} #narrative #strategy`,
          title: narrative.title,
          commentary: `${narrative.thesis}\n\nEvidence: ${narrative.evidence.slice(0, 2).join('; ')}.\n\nContrarian view: ${narrative.contrarian}`,
          source: `Confidence: ${(narrative.confidence * 100).toFixed(0)}% | Horizon: ${narrative.horizon}`,
        },
      });
    }

    // ---- RISKS & OPPORTUNITIES ----
    slides.push({
      type: 'text',
      content: {
        title: 'Risks & Opportunities',
        tag: '#outlook',
        left_title: 'Key Risks',
        left_items: brief.risks,
        left_color: '#ef4444',
        right_title: 'Opportunities',
        right_items: brief.opportunities,
        right_color: '#22c55e',
      },
    });

    // ---- SOURCES ----
    slides.push({
      type: 'sources',
      content: {
        title: 'Sources & Methodology',
        left_sources: brief.snapshot.sources.map(s => `${s.name}: ${s.url}`).join('\n'),
        right_sources: `Analysis: ${c.company} proprietary framework\nData: Bloomberg, FRED, Barchart, Bilello, FactSet`,
        disclaimer: 'This material is for informational purposes only and does not constitute investment advice.',
      },
    });

    // ---- BACK COVER ----
    slides.push({
      type: 'back_cover',
      content: {
        company: c.company,
        tagline: c.tagline,
        contact_lines: [...c.contact, c.website],
        closing: 'Thank you',
        regulatory: 'Regulated by FINMA',
        copyright: `\u00A9 ${new Date().getFullYear()} ${c.company}. All rights reserved.`,
      },
    });

    return {
      meta: {
        title: `Weekly Strategy ${week}`,
        company: c.company,
        date: brief.date,
        header_tag: '#GLOBALMARKETS WEEKLY WRAP-UP',
        footer_left: c.company,
        footer_center: 'Confidential',
        palette: c.palette,
        mode: c.mode,
        logo_path: c.logoPath,
      },
      slides,
      output_path: path.join(this.config.outputDir, `weekly-strategy-${week}.pptx`),
    };
  }

  // ==========================================================================
  // Step 5: PPTX Rendering
  // ==========================================================================

  private renderPptx(spec: PresentationSpec, specPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // __dirname resolves to dist/src/market-strategist/ at runtime.
      // Python engine lives at src/presentation/engine.py (source, not compiled).
      // Go up to project root (3 levels: market-strategist → src → dist → root) then into src/
      const enginePath = path.resolve(__dirname, '..', '..', '..', 'src', 'presentation', 'engine.py');
      const proc = spawn('python3', [enginePath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      proc.on('close', (code: number) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result.path || spec.output_path);
          } catch {
            resolve(spec.output_path);
          }
        } else {
          reject(new Error(`Engine exited with code ${code}: ${stderr}`));
        }
      });

      proc.stdin.write(JSON.stringify(spec));
      proc.stdin.end();
    });
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private async buildAssetSnapshots(headlines: Headline[]): Promise<AssetSnapshot[]> {
    // Try to extract prices from headlines/scraped content using LLM
    try {
      const headlineText = headlines.slice(0, 30).map(h => h.title).join('\n');

      const result = await this.mcp.call('openai', 'openai_chat', {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Extract current market data from these headlines/articles. Return JSON array:
[{"name": "asset", "level": "price", "change1w": "weekly %", "changeMtd": "MTD %", "changeYtd": "YTD %", "signal": "bullish"|"bearish"|"neutral", "commentary": "one-line"}]
Assets to find: ${this.config.focusAssets.join(', ')}.
Use "N/A" for missing data. Be precise with numbers — only use numbers you actually see in the text.`,
          },
          { role: 'user', content: headlineText },
        ],
        temperature: 0.1,
        max_tokens: 2048,
      });

      const content = result.data?.choices?.[0]?.message?.content || '';
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
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
      }
    } catch {
      // Fall through to defaults
    }

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

  private extractThemes(headlines: Headline[]): string[] {
    const themes = new Map<string, number>();
    for (const h of headlines) {
      if (h.theme && h.theme !== 'general') {
        themes.set(h.theme, (themes.get(h.theme) || 0) + 1);
      }
    }
    return Array.from(themes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([theme]) => theme);
  }

  private buildSentiment(headlines: Headline[], markets: AssetSnapshot[]) {
    let bullish = 0;
    let bearish = 0;
    const bullishWords = ['rally', 'surge', 'gain', 'rise', 'record', 'bullish', 'up', 'beat', 'strong'];
    const bearishWords = ['fall', 'crash', 'drop', 'decline', 'sell', 'bearish', 'fear', 'risk', 'miss', 'weak'];

    for (const h of headlines) {
      const lower = h.title.toLowerCase();
      for (const w of bullishWords) if (lower.includes(w)) bullish++;
      for (const w of bearishWords) if (lower.includes(w)) bearish++;
    }

    const total = bullish + bearish || 1;
    const score = (bullish - bearish) / total;

    return {
      overall: (score > 0.2 ? 'bullish' : score < -0.2 ? 'bearish' : 'neutral') as 'bullish' | 'bearish' | 'neutral',
      score: Math.max(-1, Math.min(1, score)),
      indicators: { headline_bull: bullish, headline_bear: bearish },
    };
  }

  private classifyImpact(title: string): 'high' | 'medium' | 'low' {
    const highImpact = ['fed', 'rate', 'inflation', 'recession', 'crash', 'war', 'tariff', 'crisis', 'default'];
    const lower = title.toLowerCase();
    if (highImpact.some(w => lower.includes(w))) return 'high';
    if (lower.includes('earnings') || lower.includes('gdp') || lower.includes('jobs') || lower.includes('payroll')) return 'medium';
    return 'low';
  }

  private classifyTheme(title: string, category?: SourceCategory): string {
    const lower = title.toLowerCase();
    if (lower.includes('ai') || lower.includes('artificial') || lower.includes('tech') || lower.includes('nvidia') || lower.includes('semiconductor')) return 'AI & Technology';
    if (lower.includes('fed') || lower.includes('rate') || lower.includes('inflation') || lower.includes('ecb') || lower.includes('central bank')) return 'Monetary Policy';
    if (lower.includes('china') || lower.includes('trade') || lower.includes('tariff') || lower.includes('sanction')) return 'Trade & Geopolitics';
    if (lower.includes('earn') || lower.includes('revenue') || lower.includes('profit') || lower.includes('eps')) return 'Earnings';
    if (lower.includes('gold') || lower.includes('commodit') || lower.includes('oil') || lower.includes('copper')) return 'Commodities';
    if (lower.includes('bond') || lower.includes('yield') || lower.includes('treasury') || lower.includes('credit')) return 'Fixed Income';
    if (lower.includes('crypto') || lower.includes('bitcoin') || lower.includes('ethereum')) return 'Crypto';
    if (lower.includes('geopolit') || lower.includes('war') || lower.includes('nato') || lower.includes('defense')) return 'Geopolitics';
    if (category === 'italian_geo') return 'Italian Geopolitics';
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
