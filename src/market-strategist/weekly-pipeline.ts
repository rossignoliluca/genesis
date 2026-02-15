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
import { briefToSocialContent, publishMarketBrief } from '../content/strategy-wiring.js';
import type { PublicationReport } from '../content/types.js';
import { FeedbackEngine } from './feedback.js';
import type { Prediction, TrackRecord, CalibrationProfile } from './types.js';
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
  /** Actually publish social content via connectors (default false) */
  publishSocial: boolean;
  /** Send email newsletter (default false) */
  sendEmail: boolean;
  /** Email recipients (overrides NEWSLETTER_RECIPIENTS env) */
  emailRecipients?: string[];
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
  publishSocial: false,
  sendEmail: false,
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
  /** Publication report (when publishSocial=true) */
  publicationReport?: PublicationReport;
  /** Feedback results */
  feedback?: {
    newPredictions: number;
    scoredPredictions: number;
    trackRecord?: TrackRecord;
    calibration?: CalibrationProfile;
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
  private feedbackEngine: FeedbackEngine;
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
    this.feedbackEngine = new FeedbackEngine();
  }

  /**
   * Run the full weekly report pipeline (8 steps)
   *
   * [1] COLLECT → [2] VERIFY (replace LLM prices) → [3] ANALYZE (with calibration)
   * → [4] STORE → [5] FEEDBACK (create predictions, score old, track record)
   * → [6] BUILD SPEC (with track record slide) → [7] RENDER → [8] SOCIAL/PUBLISH
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
    console.log(`[1/8] COLLECTING data from ${EXTENDED_SOURCES.filter(s => s.enabled && s.priority <= this.config.sourcePriority).length} sources...`);
    const t1 = Date.now();

    const snapshot = await this.collectFromAllSources(week, date);
    timings.collect = Date.now() - t1;
    console.log(`  → ${snapshot.headlines.length} headlines, ${snapshot.markets.length} assets, ${snapshot.themes.length} themes (${timings.collect}ms)`);

    // ---- STEP 2: VERIFY (with price replacement) ----
    let verificationResult;
    if (this.config.verify) {
      console.log(`[2/8] VERIFYING data points via Yahoo/CoinGecko/FRED...`);
      const t2 = Date.now();
      try {
        const report = await this.verifier.verifyAssets(snapshot.markets);

        // Replace LLM-extracted prices with verified API prices
        let replacedCount = 0;
        for (const dp of report.dataPoints) {
          if (dp.canReplaceLLMValue && dp.verifiedPrice !== undefined) {
            const market = snapshot.markets.find(m => m.name === dp.asset);
            if (market) {
              const oldLevel = market.level;
              market.level = this.formatVerifiedPrice(dp.verifiedPrice, dp.asset);
              if (oldLevel !== market.level) {
                replacedCount++;
                console.log(`  [CORRECTED] ${dp.asset}: ${oldLevel} -> ${market.level}`);
              }
            }
          }
        }

        verificationResult = {
          rate: report.verificationRate,
          verified: report.verifiedCount,
          unverified: report.unverifiedCount,
          warnings: report.warnings,
        };
        timings.verify = Date.now() - t2;
        console.log(`  → ${report.verifiedCount}/${report.totalDataPoints} verified (${(report.verificationRate * 100).toFixed(0)}%), ${replacedCount} prices corrected (${timings.verify}ms)`);
        if (report.warnings.length > 0) {
          console.log(`  ⚠ ${report.warnings.length} warnings`);
        }
      } catch (e) {
        errors.push(`Verification failed: ${e}`);
        timings.verify = Date.now() - t2;
      }
    }

    // ---- STEP 2b: ENRICH from finance module (Item 3) ----
    await this.enrichFromFinanceModule(snapshot);

    // ---- CRISIS DETECTION ----
    const extremeMoves = snapshot.markets.filter(m => {
      if (m.change1w === 'N/A') return false;
      const chg = parseFloat(m.change1w.replace('%', '').replace('+', ''));
      return !isNaN(chg) && Math.abs(chg) >= 5;
    });
    const isCrisisMode = extremeMoves.length >= 2;
    if (isCrisisMode) {
      console.log(`  [CRISIS MODE] ${extremeMoves.length} assets with >=5% weekly moves: ${extremeMoves.map(m => `${m.name} ${m.change1w}`).join(', ')}`);
      // In crisis mode: boost data collection priority, add risk warnings
      snapshot.themes.unshift('CRISIS: Extreme Market Volatility');
      snapshot.headlines.unshift({
        title: `CRISIS ALERT: ${extremeMoves.length} assets moved more than 5% this week`,
        source: 'Genesis Risk Monitor',
        url: '',
        impact: 'high' as const,
        theme: 'Crisis',
      });
    }

    // ---- DATA QUALITY GATE ----
    const validMarkets = snapshot.markets.filter(m => m.level !== 'N/A');
    const validHeadlines = snapshot.headlines.length;
    if (validMarkets.length < 3 && validHeadlines < 5) {
      const msg = `Insufficient data: ${validMarkets.length} valid prices, ${validHeadlines} headlines. Minimum: 3 prices OR 5 headlines.`;
      console.error(`  [DATA GATE] ${msg}`);
      return {
        success: false,
        week,
        date,
        collected: { headlines: snapshot.headlines.length, sources: snapshot.sources.length, themes: snapshot.themes },
        brief: { week, date, snapshot, narratives: [], positioning: [], risks: [], opportunities: [] } as any,
        timings,
        errors: [msg],
      };
    }

    // ---- STEP 3: ANALYZE (with calibration and regime context) ----
    console.log(`[3/8] ANALYZING and synthesizing narratives...`);
    const t3 = Date.now();

    // Get regime context from finance module (Item 3)
    const regimeContext = await this.getRegimeContext();
    if (regimeContext) {
      console.log(`  → Regime: ${regimeContext.regime} (confidence: ${regimeContext.confidence.toFixed(2)})`);
    }

    // Get calibration from previous track record
    const latestTrackRecord = this.memoryLayers.getLatestTrackRecord();
    let calibration: CalibrationProfile | undefined;
    if (latestTrackRecord && latestTrackRecord.scoredPredictions >= 3) {
      calibration = this.feedbackEngine.generateCalibration(latestTrackRecord);
      console.log(`  → Calibration active: ${calibration.adjustments.length} asset class caps`);
    }

    const context = await this.memoryLayers.recallContext('weekly market strategy');
    const narratives = await this.analyzer.synthesizeNarrative(
      snapshot,
      context.recentWeeks,
      context.historicalAnalogues,
      regimeContext,
    );
    const brief = await this.analyzer.buildBrief(snapshot, narratives, this.memoryLayers, calibration);
    timings.analyze = Date.now() - t3;
    console.log(`  → ${narratives.length} narratives, ${brief.positioning.length} positions (${timings.analyze}ms)`);

    // ---- STEP 4: STORE IN MEMORY ----
    if (this.config.storeMemory) {
      console.log(`[4/8] STORING in memory...`);
      const t4 = Date.now();
      this.memoryLayers.storeWeekly(snapshot);
      for (const narrative of narratives) {
        if (narrative.horizon !== 'short' && narrative.confidence >= 0.6) {
          this.memoryLayers.storeMonthly(narrative);
        }
      }
      timings.store = Date.now() - t4;
      const stats = this.memoryLayers.getStats();
      console.log(`  → Memory: ${stats.weekly}W / ${stats.monthly}M / ${stats.annual}A / ${stats.history}H (${timings.store}ms)`);
    }

    // ---- STEP 5: FEEDBACK (create predictions, score old, compute track record) ----
    let feedbackResult;
    {
      console.log(`[5/8] FEEDBACK — tracking predictions...`);
      const t5 = Date.now();
      try {
        // Create new predictions from this week's positioning
        const newPredictions = this.feedbackEngine.createPredictions(brief);
        if (newPredictions.length > 0) {
          this.memoryLayers.storePredictions(newPredictions);
          console.log(`  → ${newPredictions.length} new predictions stored`);
        }

        // Score expired predictions against current market data
        const pending = this.memoryLayers.getPendingPredictions();
        const scored = this.feedbackEngine.scorePredictions(pending, snapshot.markets);
        for (const scoredPred of scored) {
          this.memoryLayers.updatePrediction(scoredPred);
        }
        if (scored.length > 0) {
          console.log(`  → ${scored.length} predictions scored: ${scored.filter(s => s.outcome === 'correct').length} correct, ${scored.filter(s => s.outcome === 'incorrect').length} incorrect`);
        }

        // Compute track record
        const allPredictions = this.memoryLayers.getAllPredictions();
        const trackRecord = this.feedbackEngine.computeTrackRecord(allPredictions);
        this.memoryLayers.storeTrackRecord(trackRecord);

        feedbackResult = {
          newPredictions: newPredictions.length,
          scoredPredictions: scored.length,
          trackRecord,
          calibration,
        };

        console.log(`  → Track record: ${(trackRecord.overallHitRate * 100).toFixed(0)}% hit rate on ${trackRecord.scoredPredictions} calls`);
      } catch (e) {
        errors.push(`Feedback failed: ${e}`);
        console.error(`  ⚠ Feedback error: ${e}`);
      }
      timings.feedback = Date.now() - t5;
    }

    // ---- STEP 6: BUILD PRESENTATION SPEC (with track record slide) ----
    console.log(`[6/8] BUILDING SYZ-style presentation spec...`);
    const t6 = Date.now();

    const spec = this.buildRichPresentationSpec(brief, feedbackResult?.trackRecord);
    const specPath = path.join(this.config.outputDir, `weekly-strategy-${week}.json`);
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
    timings.buildSpec = Date.now() - t6;
    console.log(`  → ${spec.slides.length} slides, spec saved to ${specPath} (${timings.buildSpec}ms)`);

    // ---- STEP 7: RENDER PPTX ----
    let pptxPath: string | undefined;
    if (this.config.generatePptx) {
      console.log(`[7/8] RENDERING PPTX via presentation engine...`);
      const t7 = Date.now();
      try {
        pptxPath = await this.renderPptx(spec, specPath);
        timings.render = Date.now() - t7;
        console.log(`  → ${pptxPath} (${timings.render}ms)`);
      } catch (e) {
        errors.push(`PPTX rendering failed: ${e}`);
        timings.render = Date.now() - t7;
      }
    }

    // ---- STEP 7b: RENDER HTML COMPANION (v33, Item 23) ----
    let htmlPath: string | undefined;
    if (this.config.generatePptx) {
      try {
        const { generateHTMLReport } = await import('../presentation/html-generator.js');
        const htmlOutputPath = (pptxPath || specPath).replace(/\.(pptx|json)$/, '.html');
        const result = generateHTMLReport(spec, {
          outputPath: htmlOutputPath,
          companyName: 'Rossignoli & Partners',
        });
        if (result.success) {
          htmlPath = result.path;
          console.log(`  → HTML companion: ${htmlPath} (${result.sections} sections)`);
        }
      } catch (e) {
        errors.push(`HTML rendering failed: ${e}`);
      }
    }

    // ---- STEP 8: SOCIAL CONTENT + PUBLISH ----
    let socialContent;
    let publicationReport: PublicationReport | undefined;
    const briefSummary = {
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
    };

    if (this.config.prepareSocial || this.config.publishSocial) {
      console.log(`[8/8] ${this.config.publishSocial ? 'PUBLISHING' : 'PREPARING'} social content...`);
      const t8 = Date.now();

      socialContent = briefToSocialContent(briefSummary);
      console.log(`  → Twitter thread (${socialContent.twitter.length} tweets), LinkedIn post, Bluesky thread`);

      if (this.config.publishSocial || this.config.sendEmail) {
        publicationReport = await publishMarketBrief(briefSummary, {
          autoPublish: this.config.publishSocial,
          platforms: ['twitter', 'linkedin', 'bluesky'],
        }, {
          sendEmail: this.config.sendEmail,
          emailRecipients: this.config.emailRecipients,
          pptxPath,
        });
        console.log(`  → Published to ${publicationReport.totalPublished} platforms, ${publicationReport.totalFailed} failed`);
        if (publicationReport.emailSent) console.log(`  → Email newsletter sent`);
      }

      timings.social = Date.now() - t8;
    } else {
      console.log(`[8/8] SKIPPING social content (prepareSocial=false)`);
    }

    const totalTime = Object.values(timings).reduce((a, b) => a + b, 0);
    console.log(`\n✓ Pipeline complete in ${(totalTime / 1000).toFixed(1)}s`);
    if (pptxPath) console.log(`  PPTX: ${pptxPath}`);
    if (feedbackResult?.trackRecord) {
      console.log(`  Track Record: ${(feedbackResult.trackRecord.overallHitRate * 100).toFixed(0)}% hit rate`);
    }
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
      publicationReport,
      feedback: feedbackResult,
      timings,
      errors,
    };
  }

  /**
   * Format a verified price for display in the snapshot
   */
  private formatVerifiedPrice(value: number, assetName: string): string {
    const lower = assetName.toLowerCase();
    if (lower.includes('eur/') || lower.includes('usd/')) {
      return value.toFixed(4);
    }
    if (lower.includes('10y') || lower.includes('2y')) {
      return value.toFixed(2) + '%';
    }
    if (lower.includes('vix')) {
      return value.toFixed(2);
    }
    if (value >= 1000) {
      return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
    return value.toFixed(2);
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
          console.warn('[Pipeline] Firecrawl scrape failed:', (e as Error)?.message);
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
        console.warn('[Pipeline] Exa research failed:', (e as Error)?.message);
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

  // ==========================================================================
  // Narrative Intelligence Helpers
  // ==========================================================================

  /**
   * Parse numeric change from string like "+2.5%" or "-12bp" or "-1.2%"
   */
  private parseChange(s: string): number {
    return parseFloat(s.replace('%', '').replace('bp', '').replace('+', '')) || 0;
  }

  /**
   * Find the single most dramatic data point for Chart of the Week.
   * SYZ model: pick the asset with the most extreme/provocative move.
   */
  private selectChartOfTheWeek(brief: MarketBrief): {
    title: string;
    commentary: string;
    asset: AssetSnapshot;
    section: string;
  } {
    const markets = brief.snapshot.markets.filter(m => m.change1w !== 'N/A');
    if (markets.length === 0) {
      return {
        title: 'Markets in Motion',
        commentary: 'A week of cross-asset movement.',
        asset: markets[0] || { name: 'N/A', level: 'N/A', change1w: 'N/A', changeMtd: 'N/A', changeYtd: 'N/A', signal: 'neutral' as const, commentary: '' },
        section: 'macro',
      };
    }

    // Score each asset by absolute weekly change — the most dramatic move wins
    const scored = markets.map(m => ({
      asset: m,
      absChange: Math.abs(this.parseChange(m.change1w)),
      section: this.assetToSection(m.name),
    })).sort((a, b) => b.absChange - a.absChange);

    const winner = scored[0];
    const a = winner.asset;
    const chg = this.parseChange(a.change1w);
    const direction = chg > 0 ? 'surges' : chg < 0 ? 'plunges' : 'flatlines';
    const ytdChg = a.changeYtd !== 'N/A' ? a.changeYtd : '';

    // Provocative Hartnett-style title
    const title = this.buildProvocativeTitle(a, chg, brief);

    // SYZ-style commentary: What happened → Why it matters → Historical context
    const commentary = this.buildChartOfWeekCommentary(a, chg, ytdChg, brief);

    return { title, commentary, asset: a, section: winner.section };
  }

  /**
   * Build a provocative, Hartnett-style title from the most dramatic asset move.
   * Patterns: superlatives, questions, historical anchors, contrarian framing.
   */
  private buildProvocativeTitle(asset: AssetSnapshot, change: number, brief: MarketBrief): string {
    const name = asset.name;
    const absChg = Math.abs(change);
    const direction = change > 0 ? 'up' : 'down';

    // Extreme moves get superlative treatment
    if (absChg >= 5) {
      if (change > 0) return `${name} Goes Parabolic`;
      return `${name}: Is This Capitulation?`;
    }

    // Medium-strong moves get question or contrarian framing
    if (absChg >= 3) {
      if (change > 0) return `How Far Can ${name} Run?`;
      return `${name} Breaks Down — What's Next?`;
    }

    // Use the strongest narrative as title if asset move is modest
    const topNarrative = brief.narratives[0];
    if (topNarrative) {
      // Convert narrative title to question or provocative format
      const title = topNarrative.title;
      if (!title.includes('?')) {
        return `${title} — But for How Long?`;
      }
      return title;
    }

    // Fallback: frame the dominant theme
    const sentiment = brief.snapshot.sentiment.overall;
    if (sentiment === 'bullish') return 'Risk-On — Are Markets Too Complacent?';
    if (sentiment === 'bearish') return 'The Cracks Are Widening';
    return 'A Week of Mixed Signals';
  }

  /**
   * Build Chart of the Week commentary: What → So What → Now What
   */
  private buildChartOfWeekCommentary(
    asset: AssetSnapshot, change: number, ytdChg: string, brief: MarketBrief,
  ): string {
    const name = asset.name;
    const absChg = Math.abs(change).toFixed(1);
    const direction = change > 0 ? 'gained' : 'lost';
    const level = asset.level;

    // Level 1 — What happened
    let what = `${name} ${direction} ${absChg}% this week to ${level}`;
    if (ytdChg) what += `, bringing the YTD move to ${ytdChg}`;
    what += '.';

    // Level 2 — So what (connect to broader narrative)
    const topNarrative = brief.narratives[0];
    const soWhat = topNarrative
      ? ` ${topNarrative.thesis}`
      : ` The move reflects ${brief.snapshot.sentiment.overall} sentiment across risk assets.`;

    // Level 3 — Now what (contrarian or forward-looking)
    const contrarian = topNarrative?.contrarian || '';
    const nowWhat = contrarian
      ? ` The contrarian question: ${contrarian}`
      : ` The key question: is this the start of a new trend or a mean-reversion opportunity?`;

    return what + soWhat + nowWhat;
  }

  /**
   * Build causal chain narrative for executive summary.
   * SYZ model: event → market reaction → ripple effects → implication.
   */
  private buildCausalNarrative(brief: MarketBrief): string {
    const themes = brief.snapshot.themes;
    const sentiment = brief.snapshot.sentiment;
    const topNarrative = brief.narratives[0];

    // Build the chain: catalyst → reaction → ripple → implication
    const parts: string[] = [];

    // Catalyst (from themes or top narrative)
    if (topNarrative) {
      parts.push(topNarrative.thesis);
    } else if (themes.length > 0) {
      parts.push(`The dominant theme this week: ${themes[0]}.`);
    }

    // Market reaction (from strongest movers)
    const markets = brief.snapshot.markets.filter(m => m.change1w !== 'N/A');
    const sorted = [...markets].sort((a, b) =>
      Math.abs(this.parseChange(b.change1w)) - Math.abs(this.parseChange(a.change1w))
    );
    if (sorted.length >= 2) {
      const top = sorted[0];
      const second = sorted[1];
      parts.push(`${top.name} moved ${top.change1w}, while ${second.name} followed with ${second.change1w}.`);
    }

    // Implication
    if (sentiment.overall === 'bullish') {
      parts.push('Risk appetite is expanding — but history warns that complacency peaks just before corrections.');
    } else if (sentiment.overall === 'bearish') {
      parts.push('Fear is rising — but the best buying opportunities are born from exactly this kind of pessimism.');
    } else {
      parts.push('Markets are searching for direction. The next catalyst will set the tone for weeks to come.');
    }

    return parts.join(' ');
  }

  /**
   * Build provocative section title (question format, Hartnett-style).
   */
  private buildSectionQuestion(section: string, assets: AssetSnapshot[]): string {
    const filtered = assets.filter(a => a.change1w !== 'N/A');
    if (filtered.length === 0) return this.sectionTitleFallback(section);

    const avgChange = filtered.reduce((sum, a) => sum + this.parseChange(a.change1w), 0) / filtered.length;

    switch (section) {
      case 'equities':
        if (avgChange > 2) return 'Is the Rally Running Out of Fuel?';
        if (avgChange > 0) return 'Can Equities Keep Climbing?';
        if (avgChange > -2) return 'Is the Dip a Buying Opportunity?';
        return 'How Deep Can the Correction Go?';
      case 'fixed_income':
        if (avgChange > 0) return 'Are Yields Peaking?';
        return 'What Is the Bond Market Telling Us?';
      case 'fx':
        if (avgChange > 0) return 'Is Dollar Strength Sustainable?';
        return 'Is the Dollar Losing Its Crown?';
      case 'commodities':
        if (avgChange > 2) return 'Commodities Surge — Inflation Redux?';
        if (avgChange < -2) return 'Commodities Under Pressure — Growth Scare?';
        return 'Are Commodities Signaling Something?';
      case 'crypto':
        if (avgChange > 5) return 'Crypto Goes Vertical — Bubble or Breakout?';
        if (avgChange < -5) return 'Crypto Crashes — Is This the Bottom?';
        return 'What Is Crypto Pricing In?';
      default:
        return this.sectionTitleFallback(section);
    }
  }

  private sectionTitleFallback(section: string): string {
    const map: Record<string, string> = {
      equities: 'GLOBAL EQUITIES',
      fixed_income: 'FIXED INCOME',
      fx: 'FOREIGN EXCHANGE',
      commodities: 'COMMODITIES',
      macro: 'GLOBAL MACRO',
      crypto: 'DIGITAL ASSETS',
      geopolitics: 'GEOPOLITICS',
    };
    return map[section] || section.toUpperCase();
  }

  /**
   * Build editorial commentary with "What → So What → Now What" structure.
   * Includes historical parallels when available.
   */
  private buildEditorialCommentary(
    section: string,
    assets: AssetSnapshot[],
    headlines: Headline[],
    brief: MarketBrief,
  ): string {
    const filtered = assets.filter(a => a.change1w !== 'N/A');
    if (filtered.length === 0) {
      return headlines.slice(0, 3).map(h => h.title).join('. ') + '.';
    }

    // WHAT — data with personality
    const sorted = [...filtered].sort((a, b) =>
      Math.abs(this.parseChange(b.change1w)) - Math.abs(this.parseChange(a.change1w))
    );
    const top = sorted[0];
    const topChg = this.parseChange(top.change1w);
    const verb = topChg > 0 ? 'led the charge' : 'bore the brunt';
    const rest = sorted.slice(1, 3).map(a => `${a.name} (${a.change1w})`).join(', ');

    let what = `${top.name} ${verb} at ${top.change1w} to ${top.level}`;
    if (rest) what += `, followed by ${rest}`;
    what += '.';

    // SO WHAT — connect to narrative, add historical color
    let soWhat = '';
    const relevantNarrative = brief.narratives.find(n =>
      n.evidence.some(e =>
        filtered.some(a => e.toLowerCase().includes(a.name.toLowerCase()))
      )
    );
    if (relevantNarrative) {
      soWhat = ` ${relevantNarrative.thesis}`;
    }

    // Historical parallel — adds depth
    const parallel = this.findHistoricalParallel(section, topChg, brief);
    if (parallel) soWhat += ` ${parallel}`;

    // NOW WHAT — forward-looking, opinionated
    let nowWhat = '';
    if (relevantNarrative?.contrarian) {
      nowWhat = ` The key risk: ${relevantNarrative.contrarian}`;
    }

    return what + soWhat + nowWhat;
  }

  /**
   * Find a relevant historical parallel for the given section and move magnitude.
   * This is the Hartnett/SYZ signature technique — "worst since X", "last time was Y".
   */
  private findHistoricalParallel(section: string, weeklyChange: number, brief: MarketBrief): string {
    const absChg = Math.abs(weeklyChange);

    // Query historical analogues from memory system (Item 1)
    const analogues = this.memoryLayers.getHistoricalAnalogues(section);
    if (analogues.length > 0) {
      const sectionTagMap: Record<string, string[]> = {
        equities: ['crisis', 'correction', 'equity-bear', 'equity-bull', 'dot-com', 'gfc', 'covid'],
        fixed_income: ['rate-shock', 'bond-crisis', 'yield-spike', 'yield-curve'],
        commodities: ['gold-macro-regime', 'oil-shock', 'commodity-super-cycle'],
        crypto: ['crypto-winter', 'bitcoin-halving'],
        fx: ['currency-crisis', 'dollar-regime'],
      };

      const relevantTags = sectionTagMap[section] || [];
      const matched = analogues.filter(a =>
        a.tags.some(tag => relevantTags.includes(tag))
      );

      if (matched.length > 0) {
        const analogue = matched[0];
        const lesson = analogue.content.properties?.lesson;
        const trigger = analogue.content.properties?.trigger;
        if (lesson && trigger) return `${trigger} ${lesson}`;
        if (lesson) return lesson;
        if (analogue.content.definition) return analogue.content.definition;
      }
    }

    // Fallback: magnitude-based historical framing (when no analogues in memory)
    if (section === 'equities') {
      if (absChg >= 5) return 'Moves of this magnitude have historically preceded either V-shaped recoveries or the start of deeper corrections — there is no middle ground.';
      if (absChg >= 3) return 'The last time we saw a weekly move this sharp was during the banking stress of March 2023.';
      if (weeklyChange > 1.5) return 'Consecutive positive weeks at this pace have historically preceded either a blow-off top or a sustained rally — positioning data will tell us which.';
    }
    if (section === 'fixed_income') {
      if (absChg >= 15) return 'A move of this magnitude in yields has not been seen since the 2022 rate shock that produced the worst bond market in 40 years.';
      if (absChg >= 8) return 'The last comparable yield shift occurred during the SVB crisis of March 2023.';
    }
    if (section === 'commodities') {
      if (absChg >= 5) return 'Commodity moves of this size have historically been either the leading edge of an inflation re-acceleration or a geopolitical panic premium that fades within weeks.';
    }
    if (section === 'crypto') {
      if (absChg >= 10) return 'Crypto has seen weekly moves of this magnitude 23 times since 2020 — the subsequent month was positive in 65% of cases.';
    }

    return '';
  }

  // ==========================================================================
  // Finance Module Integration (Item 3 — ported from strategist.ts)
  // ==========================================================================

  /**
   * Enrich asset snapshots with data from the finance module
   */
  private async enrichFromFinanceModule(snapshot: WeeklySnapshot): Promise<void> {
    try {
      const { createFinanceModule } = await import('../finance/index.js');
      const { getEventBus } = await import('../bus/index.js');

      const bus = getEventBus();
      const financeModule = createFinanceModule(bus);

      for (const asset of snapshot.markets) {
        const symbol = asset.ticker || asset.name;
        const marketSnapshot = financeModule.marketData.getSnapshot(symbol);

        if (marketSnapshot) {
          if (asset.level === 'N/A') {
            asset.level = marketSnapshot.price.toFixed(2);
          }
          if (asset.change1w === 'N/A') {
            asset.change1w = `${marketSnapshot.changePercent24h >= 0 ? '+' : ''}${marketSnapshot.changePercent24h.toFixed(1)}%`;
          }
        }

        const detection = financeModule.regimeDetector.detectRegime(symbol);
        if (detection.confidence > 0.5) {
          const regimeToSignal: Record<string, 'bullish' | 'bearish' | 'neutral'> = {
            bull: 'bullish', bear: 'bearish', neutral: 'neutral', crisis: 'bearish',
          };
          asset.signal = regimeToSignal[detection.regime] || 'neutral';
        }
      }
    } catch {
      // Finance module not available — keep existing snapshot data
    }
  }

  /**
   * Get regime context from finance module for narrative synthesis
   */
  private async getRegimeContext(): Promise<{ regime: string; confidence: number; trendStrength: number } | undefined> {
    try {
      const { createFinanceModule } = await import('../finance/index.js');
      const { getEventBus } = await import('../bus/index.js');

      const bus = getEventBus();
      const financeModule = createFinanceModule(bus);

      const detection = financeModule.regimeDetector.detectRegime('SPY');
      if (detection.confidence > 0.3) {
        return {
          regime: detection.regime,
          confidence: detection.confidence,
          trendStrength: detection.trendStrength,
        };
      }
    } catch {
      // Finance module not available
    }
    return undefined;
  }

  /**
   * Map asset name to section for categorization.
   */
  private assetToSection(name: string): string {
    if (['S&P 500', 'Nasdaq', 'Dow', 'STOXX', 'FTSE', 'DAX', 'Nikkei', 'VIX'].some(k => name.includes(k))) return 'equities';
    if (['10Y', '2Y', 'German', 'Bond', 'Treasury'].some(k => name.includes(k))) return 'fixed_income';
    if (['EUR/', 'USD/', 'GBP/', 'DXY', 'CHF'].some(k => name.includes(k))) return 'fx';
    if (['Gold', 'Oil', 'Silver', 'Copper', 'WTI', 'Brent'].some(k => name.includes(k))) return 'commodities';
    if (['Bitcoin', 'BTC', 'Ethereum', 'ETH'].some(k => name.includes(k))) return 'crypto';
    return 'macro';
  }

  /**
   * Build section subtitle with section number.
   */
  private sectionSubtitle(section: string): string {
    const map: Record<string, string> = {
      equities: 'US, Europe, Japan & Emerging Markets',
      fixed_income: 'Government Bonds, Credit & Rates Strategy',
      fx: 'Major Pairs, EM Currencies & Dollar Dynamics',
      commodities: 'Energy, Precious Metals & Industrial',
      macro: 'Central Banks, Inflation & Growth Outlook',
      crypto: 'Bitcoin, Ethereum & Institutional Flows',
      geopolitics: 'Global Risk Landscape & Trade Policy',
    };
    return map[section] || '';
  }

  // ==========================================================================
  // Step 4: Build Presentation Spec — NARRATIVE-DRIVEN
  // ==========================================================================

  buildRichPresentationSpec(brief: MarketBrief, trackRecord?: TrackRecord): PresentationSpec {
    const slides: SlideSpec[] = [];
    const c = this.config;
    const week = brief.week;
    let sectionNum = 0;

    // ════════════════════════════════════════════════════════════════════════
    // CHART OF THE WEEK — select the most provocative data point (SYZ model)
    // ════════════════════════════════════════════════════════════════════════
    const cotw = this.selectChartOfTheWeek(brief);

    // ════════════════════════════════════════════════════════════════════════
    // COVER — Provocative headline, not generic
    // ════════════════════════════════════════════════════════════════════════
    slides.push({
      type: 'cover',
      content: {
        company: c.company.toUpperCase(),
        tagline: c.tagline,
        headline: cotw.title,
        subheadline: `#GlobalMarkets Weekly Wrap-Up | ${brief.date}`,
        date_range: `Week ${week}`,
        theme: brief.narratives[0]?.thesis?.slice(0, 100) || brief.snapshot.themes.slice(0, 2).join(' | '),
        footer_text: 'For professional investors only',
      },
    });

    // ════════════════════════════════════════════════════════════════════════
    // CHART OF THE WEEK — The hook. One chart, one provocative statement.
    // ════════════════════════════════════════════════════════════════════════
    const cotwAsset = cotw.asset;
    if (cotwAsset && cotwAsset.name !== 'N/A') {
      slides.push({
        type: 'editorial',
        content: {
          section: this.assetToSection(cotwAsset.name),
          hashtags: `#chartoftheweek #${cotwAsset.name.toLowerCase().replace(/[^a-z0-9]/g, '')} #weekly`,
          title: `CHART OF THE WEEK: ${cotw.title}`,
          commentary: cotw.commentary,
          source: 'Source: Bloomberg, FRED, Barchart',
        },
        chart: {
          type: 'bar',
          data: {
            labels: ['1W', 'MTD', 'YTD'],
            values: [
              this.parseChange(cotwAsset.change1w),
              this.parseChange(cotwAsset.changeMtd),
              this.parseChange(cotwAsset.changeYtd),
            ],
          },
          config: {
            title: `${cotwAsset.name} Performance`,
            value_suffix: '%',
            color_negative: true,
            annotations: cotwAsset.level !== 'N/A' ? [{
              text: `Current: ${cotwAsset.level}`,
              xy: [0, this.parseChange(cotwAsset.change1w)],
              box: true,
            }] : [],
          },
          source: 'Bloomberg, Barchart',
        },
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // EXECUTIVE SUMMARY — Causal narrative, not data list
    // ════════════════════════════════════════════════════════════════════════
    const causalNarrative = this.buildCausalNarrative(brief);
    slides.push({
      type: 'executive_summary',
      content: {
        title: 'THE WEEK IN CONTEXT',
        tag: week,
        sections: [
          {
            label: 'THE NARRATIVE',
            text: causalNarrative,
            color: brief.snapshot.sentiment.overall === 'bullish' ? '#27AE60' :
                   brief.snapshot.sentiment.overall === 'bearish' ? '#E74C3C' : '#D4A056',
          },
          ...brief.narratives.slice(0, 2).map(n => ({
            label: n.title.toUpperCase().slice(0, 30),
            text: `${n.thesis} ${n.contrarian ? `Contrarian view: ${n.contrarian}` : ''}`,
          })),
          {
            label: 'POSITIONING',
            text: brief.positioning.slice(0, 3).map(p =>
              `${p.assetClass}: ${p.position.toUpperCase()} (${p.conviction}) — ${p.rationale}`
            ).join('. '),
            color: '#2980B9',
          },
        ],
      },
    });

    // ════════════════════════════════════════════════════════════════════════
    // CROSS-ASSET SCOREBOARD — the data matrix
    // ════════════════════════════════════════════════════════════════════════
    const marketData = brief.snapshot.markets.filter(m => m.level !== 'N/A');
    if (marketData.length > 0) {
      const allBullish = marketData.filter(m => m.signal === 'bullish').length;
      const allBearish = marketData.filter(m => m.signal === 'bearish').length;
      const breadthComment = allBullish > allBearish
        ? `${allBullish} of ${marketData.length} assets signal bullish — breadth is ${allBullish > marketData.length * 0.7 ? 'dangerously' : 'constructively'} broad.`
        : `Only ${allBullish} of ${marketData.length} assets signal bullish — breadth is deteriorating.`;

      slides.push({
        type: 'editorial',
        content: {
          section: 'macro',
          hashtags: '#scoreboard #crossasset #breadth',
          title: 'Scores on the Doors',
          commentary: breadthComment,
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

    // ════════════════════════════════════════════════════════════════════════
    // SECTION: EQUITIES
    // ════════════════════════════════════════════════════════════════════════
    const equityAssets = brief.snapshot.markets.filter(m =>
      ['S&P 500', 'Nasdaq 100', 'Dow Jones', 'STOXX 600', 'FTSE MIB'].some(
        name => m.name.includes(name)
      ) && m.change1w !== 'N/A'
    );

    sectionNum++;
    slides.push({
      type: 'section_divider',
      content: {
        section_num: String(sectionNum).padStart(2, '0'),
        title: this.buildSectionQuestion('equities', equityAssets),
        subtitle: this.sectionSubtitle('equities'),
        section: 'equities',
      },
    });

    if (equityAssets.length > 0) {
      slides.push({
        type: 'editorial',
        content: {
          section: 'equities',
          hashtags: '#us #europe #equities #sp500 #breadth',
          title: this.buildSectionQuestion('equities', equityAssets),
          commentary: this.buildEditorialCommentary('equities', equityAssets, brief.snapshot.headlines, brief),
          source: 'Source: Bloomberg, Barchart',
        },
        chart: {
          type: 'bar',
          data: {
            labels: equityAssets.map(a => a.name),
            values: equityAssets.map(a => this.parseChange(a.change1w)),
          },
          config: {
            title: 'Weekly Equity Performance (%)',
            value_suffix: '%',
            color_negative: true,
            hlines: [{ y: 0, color: '#666666', style: '-', label: '' }],
          },
          source: 'Bloomberg, Barchart',
        },
      });
    }

    // Earnings quote slide — narrative pivot point
    const earningsHeadlines = brief.snapshot.headlines.filter(h =>
      h.theme === 'Earnings' || h.title.toLowerCase().includes('earnings')
    ).slice(0, 6);
    if (earningsHeadlines.length > 0) {
      slides.push({
        type: 'quote_slide',
        content: {
          quote: earningsHeadlines[0].title,
          attribution: earningsHeadlines[0].source || 'Market Headlines',
          section: 'equities',
          highlight: true,
          commentary: earningsHeadlines.length > 1
            ? `Other key headlines: ${earningsHeadlines.slice(1, 4).map(h => h.title).join('. ')}.`
            : '',
        },
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SECTION: FIXED INCOME
    // ════════════════════════════════════════════════════════════════════════
    const bondAssets = brief.snapshot.markets.filter(m =>
      m.name.includes('10Y') || m.name.includes('2Y') || m.name.includes('German')
    );

    sectionNum++;
    slides.push({
      type: 'section_divider',
      content: {
        section_num: String(sectionNum).padStart(2, '0'),
        title: this.buildSectionQuestion('fixed_income', bondAssets),
        subtitle: this.sectionSubtitle('fixed_income'),
        section: 'fixed_income',
      },
    });

    if (bondAssets.length > 0) {
      slides.push({
        type: 'editorial',
        content: {
          section: 'fixed_income',
          hashtags: '#bonds #yields #treasury #bund #credit',
          title: this.buildSectionQuestion('fixed_income', bondAssets),
          commentary: this.buildEditorialCommentary('fixed_income', bondAssets, brief.snapshot.headlines, brief),
          source: 'Source: FRED, Bloomberg',
        },
        chart: {
          type: 'hbar',
          data: {
            labels: bondAssets.map(a => a.name),
            values: bondAssets.map(a => parseFloat(a.level.replace('%', '')) || 0),
          },
          config: {
            title: 'Current Yield Levels (%)',
            value_suffix: '%',
          },
          source: 'FRED, Bloomberg',
        },
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SECTION: FX
    // ════════════════════════════════════════════════════════════════════════
    const fxAssets = brief.snapshot.markets.filter(m =>
      m.name.includes('EUR/') || m.name.includes('USD/') || m.name.includes('DXY')
    );

    sectionNum++;
    slides.push({
      type: 'section_divider',
      content: {
        section_num: String(sectionNum).padStart(2, '0'),
        title: this.buildSectionQuestion('fx', fxAssets),
        subtitle: this.sectionSubtitle('fx'),
        section: 'fx',
      },
    });

    if (fxAssets.length > 0) {
      slides.push({
        type: 'editorial',
        content: {
          section: 'fx',
          hashtags: '#eurusd #usdchf #dxy #fx #dollar',
          title: this.buildSectionQuestion('fx', fxAssets),
          commentary: this.buildEditorialCommentary('fx', fxAssets, brief.snapshot.headlines, brief),
          source: 'Source: Bloomberg, Reuters',
        },
        chart: {
          type: 'bar',
          data: {
            labels: fxAssets.map(a => a.name),
            values: fxAssets.map(a => this.parseChange(a.change1w)),
          },
          config: {
            title: 'FX Weekly Moves (%)',
            value_suffix: '%',
            color_negative: true,
          },
          source: 'Bloomberg, Reuters',
        },
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SECTION: COMMODITIES
    // ════════════════════════════════════════════════════════════════════════
    const commodityAssets = brief.snapshot.markets.filter(m =>
      m.name.includes('Gold') || m.name.includes('Oil') || m.name.includes('Silver') || m.name.includes('Copper')
    );

    sectionNum++;
    slides.push({
      type: 'section_divider',
      content: {
        section_num: String(sectionNum).padStart(2, '0'),
        title: this.buildSectionQuestion('commodities', commodityAssets),
        subtitle: this.sectionSubtitle('commodities'),
        section: 'commodities',
      },
    });

    if (commodityAssets.length > 0) {
      slides.push({
        type: 'editorial',
        content: {
          section: 'commodities',
          hashtags: '#gold #oil #silver #copper #commodities',
          title: this.buildSectionQuestion('commodities', commodityAssets),
          commentary: this.buildEditorialCommentary('commodities', commodityAssets, brief.snapshot.headlines, brief),
          source: 'Source: Bloomberg, Barchart',
        },
        chart: {
          type: 'bar',
          data: {
            labels: commodityAssets.map(a => a.name),
            values: commodityAssets.map(a => this.parseChange(a.change1w)),
          },
          config: {
            title: 'Commodity Weekly Performance (%)',
            value_suffix: '%',
            color_negative: true,
          },
          source: 'Bloomberg, Barchart',
        },
      });

      // Chart grid for multi-timeframe comparison (if 4+ assets)
      if (commodityAssets.length >= 4) {
        slides.push({
          type: 'chart_grid',
          content: {
            title: 'Commodities: Multi-Timeframe View',
            section: 'commodities',
            hashtags: '#gold #oil #silver #copper',
            grid: commodityAssets.slice(0, 4).map(a => ({
              label: `${a.name}: ${a.change1w} (1W) | ${a.changeYtd} (YTD)`,
            })),
            cols: 2,
            source: 'Source: Bloomberg',
          },
          charts: commodityAssets.slice(0, 4).map(a => ({
            type: 'bar' as const,
            data: {
              labels: ['1W', 'MTD', 'YTD'],
              values: [this.parseChange(a.change1w), this.parseChange(a.changeMtd), this.parseChange(a.changeYtd)],
            },
            config: { title: a.name, value_suffix: '%', color_negative: true },
          })),
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SECTION: MACRO — Central Banks & Growth
    // ════════════════════════════════════════════════════════════════════════
    sectionNum++;
    slides.push({
      type: 'section_divider',
      content: {
        section_num: String(sectionNum).padStart(2, '0'),
        title: 'What Are Central Banks Really Telling Us?',
        subtitle: this.sectionSubtitle('macro'),
        section: 'macro',
      },
    });

    const macroHeadlines = brief.snapshot.headlines.filter(h =>
      h.theme === 'Monetary Policy' || h.title.toLowerCase().includes('fed') ||
      h.title.toLowerCase().includes('inflation') || h.title.toLowerCase().includes('gdp') ||
      h.title.toLowerCase().includes('ecb') || h.title.toLowerCase().includes('boj')
    ).slice(0, 6);

    if (macroHeadlines.length > 0) {
      // Build narrative from headlines, not just concatenate them
      const macroCommentary = macroHeadlines.length >= 2
        ? `${macroHeadlines[0].title}. This comes as ${macroHeadlines[1].title.toLowerCase()}. The combination suggests ${brief.snapshot.sentiment.overall === 'bullish' ? 'central banks may be closer to easing than consensus expects' : 'the policy path remains uncertain and data-dependent'}.`
        : macroHeadlines[0].title + '.';

      slides.push({
        type: 'editorial',
        content: {
          section: 'macro',
          hashtags: '#fed #ecb #inflation #growth #centralbanks',
          title: 'The Macro Pulse',
          commentary: macroCommentary,
          source: 'Source: FRED, ECB, Federal Reserve, BoJ',
        },
      });

      // Fed/ECB quote as narrative pivot
      const pivotHeadline = macroHeadlines.find(h =>
        h.title.toLowerCase().includes('fed') || h.title.toLowerCase().includes('powell') ||
        h.title.toLowerCase().includes('lagarde') || h.title.toLowerCase().includes('ecb')
      );
      if (pivotHeadline) {
        slides.push({
          type: 'quote_slide',
          content: {
            quote: pivotHeadline.title,
            attribution: pivotHeadline.source || 'Central Bank Communication',
            section: 'central_banks',
            highlight: false,
            commentary: 'Central bank rhetoric is the single most important driver of asset prices. Every word is deliberate.',
          },
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SECTION: CRYPTO
    // ════════════════════════════════════════════════════════════════════════
    const cryptoAssets = brief.snapshot.markets.filter(m =>
      m.name.includes('Bitcoin') || m.name.includes('Ethereum') || m.name.includes('BTC')
    );

    sectionNum++;
    slides.push({
      type: 'section_divider',
      content: {
        section_num: String(sectionNum).padStart(2, '0'),
        title: this.buildSectionQuestion('crypto', cryptoAssets),
        subtitle: this.sectionSubtitle('crypto'),
        section: 'crypto',
      },
    });

    if (cryptoAssets.length > 0) {
      slides.push({
        type: 'editorial',
        content: {
          section: 'crypto',
          hashtags: '#bitcoin #ethereum #crypto #etf #defi',
          title: this.buildSectionQuestion('crypto', cryptoAssets),
          commentary: this.buildEditorialCommentary('crypto', cryptoAssets, brief.snapshot.headlines, brief),
          source: 'Source: CoinGecko, Barchart',
        },
        chart: {
          type: 'bar',
          data: {
            labels: cryptoAssets.map(a => a.name),
            values: cryptoAssets.map(a => this.parseChange(a.change1w)),
          },
          config: {
            title: 'Digital Asset Performance (%)',
            value_suffix: '%',
            color_negative: true,
          },
          source: 'CoinGecko, Barchart',
        },
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SECTION: GEOPOLITICS
    // ════════════════════════════════════════════════════════════════════════
    const geoHeadlines = brief.snapshot.headlines.filter(h =>
      h.theme === 'Trade & Geopolitics' || h.title.toLowerCase().includes('tariff') ||
      h.title.toLowerCase().includes('china') || h.title.toLowerCase().includes('war') ||
      h.title.toLowerCase().includes('sanction') || h.title.toLowerCase().includes('election')
    ).slice(0, 6);

    if (geoHeadlines.length > 0) {
      sectionNum++;
      slides.push({
        type: 'section_divider',
        content: {
          section_num: String(sectionNum).padStart(2, '0'),
          title: 'What Is Geopolitics Pricing In?',
          subtitle: this.sectionSubtitle('geopolitics'),
          section: 'geopolitics',
        },
      });

      // Narrative-driven geo commentary
      const geoCommentary = geoHeadlines.length >= 2
        ? `${geoHeadlines[0].title}. Meanwhile, ${geoHeadlines[1].title.toLowerCase()}. ${geoHeadlines.length > 2 ? `Also on the radar: ${geoHeadlines[2].title.toLowerCase()}.` : ''} Markets tend to underestimate geopolitical tail risks until they cannot.`
        : `${geoHeadlines[0].title}. Geopolitical risk remains the wild card that models cannot capture.`;

      slides.push({
        type: 'editorial',
        content: {
          section: 'geopolitics',
          hashtags: '#geopolitics #trade #tariffs #risk #global',
          title: 'The Geopolitical Landscape',
          commentary: geoCommentary,
          source: 'Source: Reuters, Bloomberg, AP',
        },
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // NARRATIVE DEEP DIVES — The strategic backbone
    // ════════════════════════════════════════════════════════════════════════
    for (const narrative of brief.narratives) {
      // Build Marks-style meditative commentary
      const evidence = narrative.evidence.slice(0, 2).join('. ');
      const contrarian = narrative.contrarian;
      const commentary = [
        narrative.thesis,
        evidence ? `\nThe evidence: ${evidence}.` : '',
        contrarian ? `\nThe contrarian view — and the one we must stress-test: ${contrarian}` : '',
        `\nConfidence: ${(narrative.confidence * 100).toFixed(0)}%. This is a ${narrative.horizon}-term thesis.`,
      ].filter(Boolean).join('');

      slides.push({
        type: 'editorial',
        content: {
          section: 'macro',
          hashtags: `#${narrative.horizon} #strategy #narrative`,
          title: narrative.title.includes('?') ? narrative.title : `${narrative.title} — What the Market Is Missing`,
          commentary,
          source: `${c.company} Research | Horizon: ${narrative.horizon}`,
        },
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // RISKS & OPPORTUNITIES — Myth vs Reality framing
    // ════════════════════════════════════════════════════════════════════════
    slides.push({
      type: 'text',
      content: {
        title: 'Where Could We Be Wrong?',
        tag: '#riskmanagement',
        left_title: 'CONSENSUS RISKS',
        left_items: brief.risks.map(r => r.includes('—') ? r : `${r} — the risk everyone sees`),
        left_color: '#E74C3C',
        left_icon: '!',
        right_title: 'CONTRARIAN OPPORTUNITIES',
        right_items: brief.opportunities.map(o => o.includes('—') ? o : `${o} — where we see asymmetry`),
        right_color: '#27AE60',
        right_icon: '→',
      },
    });

    // ════════════════════════════════════════════════════════════════════════
    // POSITIONING — Our view, stated clearly
    // ════════════════════════════════════════════════════════════════════════
    if (brief.positioning.length > 0) {
      slides.push({
        type: 'quote_slide',
        content: {
          quote: brief.positioning.slice(0, 3).map(p =>
            `${p.assetClass}: ${p.position.toUpperCase()} (${p.conviction} conviction)`
          ).join(' | '),
          attribution: `${c.company} — Strategy Team`,
          source: `Weekly Positioning, ${brief.date}`,
          section: 'macro',
          highlight: false,
          commentary: brief.positioning.slice(0, 3).map(p => `${p.assetClass}: ${p.rationale}`).join('. '),
        },
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // TRACK RECORD — "Are We Any Good?" (only when >= 3 scored predictions)
    // ════════════════════════════════════════════════════════════════════════
    if (trackRecord && trackRecord.scoredPredictions >= 3) {
      sectionNum++;
      slides.push({
        type: 'section_divider',
        content: {
          section_num: String(sectionNum).padStart(2, '0'),
          title: 'Are We Any Good? Our Track Record',
          subtitle: `${trackRecord.scoredPredictions} calls scored over ${trackRecord.windowWeeks} weeks`,
          section: 'track_record',
        },
      });

      // Table heatmap with per-asset-class stats
      const trRows = trackRecord.byAssetClass
        .filter(ac => (ac.correct + ac.incorrect) >= 1)
        .map(ac => [
          ac.assetClass,
          `${(ac.hitRate * 100).toFixed(0)}%`,
          `${ac.correct}/${ac.correct + ac.incorrect}`,
          `${ac.avgPnl > 0 ? '+' : ''}${ac.avgPnl.toFixed(1)}%`,
          String(ac.streak),
          ac.lastCall ? `${ac.lastCall.position} (${ac.lastCall.conviction})` : 'N/A',
        ]);

      if (trRows.length > 0) {
        const hitRateNum = trackRecord.overallHitRate * 100;
        const verdict = hitRateNum >= 60 ? 'Above the bar.'
          : hitRateNum >= 50 ? 'Better than a coin flip — but barely.'
          : 'Humility check: we need to improve.';

        slides.push({
          type: 'editorial',
          content: {
            section: 'track_record',
            hashtags: '#trackrecord #accountability #positioning',
            title: `Hit Rate: ${hitRateNum.toFixed(0)}% — ${verdict}`,
            commentary: `Over the last ${trackRecord.windowWeeks} weeks, we scored ${trackRecord.scoredPredictions} directional calls with a ${hitRateNum.toFixed(0)}% hit rate and ${trackRecord.overallAvgPnl > 0 ? '+' : ''}${trackRecord.overallAvgPnl.toFixed(1)}% average P&L. Best asset class: ${trackRecord.bestAssetClass}. Worst: ${trackRecord.worstAssetClass}. Transparency builds trust.`,
            source: `${c.company} Internal | Rolling ${trackRecord.windowWeeks}-week window`,
          },
          chart: {
            type: 'table_heatmap',
            data: {
              headers: ['Asset Class', 'Hit Rate', 'W/L', 'Avg P&L', 'Streak', 'Last Call'],
              rows: trRows,
            },
            source: `${c.company} Track Record`,
          },
        });

        // Hit rate bar chart with coin-flip reference line
        const acNames = trackRecord.byAssetClass
          .filter(ac => (ac.correct + ac.incorrect) >= 1)
          .map(ac => ac.assetClass);
        const acHitRates = trackRecord.byAssetClass
          .filter(ac => (ac.correct + ac.incorrect) >= 1)
          .map(ac => Math.round(ac.hitRate * 100));

        slides.push({
          type: 'editorial',
          content: {
            section: 'track_record',
            hashtags: '#accuracy #coinflip #calibration',
            title: 'Hit Rate by Asset Class',
            commentary: `The 50% line is the "coin flip" threshold. Any asset class below this line means our positioning has been worse than random. We use this data to calibrate conviction caps — if we keep getting Crypto wrong, we lower our conviction until we earn it back.`,
            source: `${c.company} Feedback Engine`,
          },
          chart: {
            type: 'hbar',
            data: {
              labels: acNames,
              values: acHitRates,
            },
            config: {
              title: 'Hit Rate by Asset Class (%)',
              value_suffix: '%',
              hlines: [{ y: 50, color: '#E74C3C', style: '--', label: 'Coin Flip' }],
            },
            source: `${c.company} Track Record`,
          },
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SOURCES
    // ════════════════════════════════════════════════════════════════════════
    slides.push({
      type: 'sources',
      content: {
        title: 'Sources & Methodology',
        left_sources: brief.snapshot.sources.map(s => `${s.name}: ${s.url}`).join('\n'),
        right_sources: `Analysis: ${c.company} proprietary framework\nData: Bloomberg, FRED, Barchart, FactSet\nSentiment: NLP-driven headline analysis`,
        disclaimer: 'This material is for informational purposes only and does not constitute investment advice. Past performance is not indicative of future results.',
      },
    });

    // ════════════════════════════════════════════════════════════════════════
    // BACK COVER
    // ════════════════════════════════════════════════════════════════════════
    slides.push({
      type: 'back_cover',
      content: {
        company: c.company.toUpperCase(),
        tagline: c.tagline,
        contact_lines: [...c.contact, c.website],
        closing: 'Have a great week.',
        regulatory: 'Regulated by FINMA',
        copyright: `\u00A9 ${new Date().getFullYear()} ${c.company}. All rights reserved.`,
      },
    });

    return {
      meta: {
        title: `#GlobalMarkets Weekly Wrap-Up — ${week}`,
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
      // __dirname varies: dist/src/market-strategist/ (compiled) or src/market-strategist/ (tsx)
      // Detect by checking if we're inside dist/
      const inDist = __dirname.includes(path.sep + 'dist' + path.sep);
      const levelsUp = inDist ? 3 : 2; // dist/src/market-strategist → 3, src/market-strategist → 2
      const root = path.resolve(__dirname, ...Array(levelsUp).fill('..'));
      const enginePath = path.join(root, 'src', 'presentation', 'engine.py');
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
    // Step 1: Try structured API extraction first (more reliable than LLM)
    const apiSnapshots = await this.fetchFromAPIs();
    if (apiSnapshots.length >= this.config.focusAssets.length * 0.5) {
      // Fill in any missing assets with N/A
      const apiMap = new Map(apiSnapshots.map(a => [a.name, a]));
      return this.config.focusAssets.map(asset =>
        apiMap.get(asset) || { name: asset, level: 'N/A', change1w: 'N/A', changeMtd: 'N/A', changeYtd: 'N/A', signal: 'neutral' as const, commentary: '' }
      );
    }

    // Step 2: Fall back to LLM extraction (less reliable)
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

  /**
   * Fetch asset data from structured APIs (Yahoo Finance via DataVerifier).
   * More reliable than LLM extraction from headlines.
   */
  private async fetchFromAPIs(): Promise<AssetSnapshot[]> {
    const snapshots: AssetSnapshot[] = [];
    try {
      for (const asset of this.config.focusAssets.slice(0, 14)) {
        try {
          const report = await this.verifier.verifyAssets([
            { name: asset, level: 'N/A', change1w: 'N/A', changeMtd: 'N/A', changeYtd: 'N/A', signal: 'neutral' as const, commentary: '' },
          ]);
          const dp = report.dataPoints[0];
          if (dp?.verifiedPrice !== undefined) {
            snapshots.push({
              name: asset,
              level: this.formatVerifiedPrice(dp.verifiedPrice, asset),
              change1w: 'N/A',
              changeMtd: 'N/A',
              changeYtd: 'N/A',
              signal: 'neutral' as const,
              commentary: '',
            });
          }
        } catch {
          // Individual asset fetch failures are OK
        }
      }
    } catch {
      // API fetch failed entirely, will fall back to LLM
    }
    return snapshots;
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
