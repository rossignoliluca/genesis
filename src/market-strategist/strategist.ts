/**
 * Genesis v17.0 - Market Strategist
 *
 * Main orchestrator for weekly market strategy brief generation.
 * Coordinates data collection, narrative synthesis, memory storage,
 * and presentation generation.
 *
 * Workflow:
 * 1. Recall context from 4-layer memory
 * 2. Collect fresh data from web sources (MCP)
 * 3. Scrape real charts from institutional sources
 * 4. Synthesize narratives (using memory + fresh data)
 * 5. Build the complete brief
 * 6. Store in memory (weekly layer)
 * 7. Generate PPTX via existing presentation engine
 */

import { MarketCollector } from './collector.js';
import { MarketAnalyzer } from './analyzer.js';
import { MemoryLayers } from './memory-layers.js';
import { getMemorySystem } from '../memory/index.js';
import type {
  MarketBrief,
  StrategyConfig,
  ScrapedChart,
  WeeklySnapshot,
  NarrativeThread,
  AssetSnapshot,
} from './types.js';
import { DEFAULT_STRATEGY_CONFIG as CONFIG } from './types.js';
import type { PresentationSpec, SlideSpec, ChartSpec } from '../presentation/types.js';
import type { GenesisEventBus } from '../bus/index.js';

// ============================================================================
// Market Strategist
// ============================================================================

export class MarketStrategist {
  private collector: MarketCollector;
  private analyzer: MarketAnalyzer;
  private memoryLayers: MemoryLayers;
  private config: StrategyConfig;
  private bus?: GenesisEventBus;

  constructor(config?: Partial<StrategyConfig>, bus?: GenesisEventBus) {
    this.config = { ...CONFIG, ...config };
    this.collector = new MarketCollector(this.config);
    this.analyzer = new MarketAnalyzer();
    this.memoryLayers = new MemoryLayers();
    this.bus = bus;
  }

  /**
   * Full weekly strategy workflow
   */
  async generateWeeklyBrief(): Promise<MarketBrief> {
    // 1. Recall context from memory (all 4 layers)
    const context = await this.memoryLayers.recallContext('weekly market strategy');

    // 2. Collect fresh data from web
    const snapshot = await this.collector.collectWeeklyData();

    // 2b. Enrich with finance module data
    await this.enrichFromFinanceModule(snapshot);

    // Publish data collected event
    this.publishEvent('strategy.data.collected', {
      source: 'market-strategist',
      precision: 0.8,
      week: snapshot.week,
      headlineCount: snapshot.headlines.length,
      sourceCount: snapshot.sources.length,
      themes: snapshot.themes,
      sentiment: snapshot.sentiment.overall,
    });

    // 3. Scrape real charts from institutional sources
    let charts: ScrapedChart[] = [];
    try {
      charts = await this.collector.scrapeCharts(['bilello', 'fred', 'factset']);
    } catch (error) {
      console.error('[MarketStrategist] Chart scraping failed, continuing without charts:', error);
    }

    // 4. Synthesize narratives (using memory + fresh data + regime context)
    const regimeContext = await this.getRegimeContext();
    const narratives = await this.analyzer.synthesizeNarrative(
      snapshot,
      context.recentWeeks,
      context.historicalAnalogues,
      regimeContext,
    );

    // 5. Build the complete brief
    const brief = await this.analyzer.buildBrief(
      snapshot,
      narratives,
      this.memoryLayers,
    );

    // 6. Store in memory (weekly layer)
    this.memoryLayers.storeWeekly(snapshot);

    // Store narratives that have medium+ horizon as monthly
    for (const narrative of narratives) {
      if (narrative.horizon !== 'short' && narrative.confidence >= 0.6) {
        this.memoryLayers.storeMonthly(narrative);
      }
    }

    // 7. Generate PPTX via existing presentation engine
    if (this.config.generatePresentation) {
      const spec = this.buildPresentationSpec(brief, charts);
      brief.presentationSpec = spec;
    }

    // Publish brief generated event
    this.publishEvent('strategy.brief.generated', {
      source: 'market-strategist',
      precision: 0.9,
      briefId: brief.id,
      week: brief.week,
      narrativeCount: brief.narratives.length,
      positioningCount: brief.positioning.length,
      hasPresentation: !!brief.presentationSpec,
      outputPath: brief.presentationSpec?.output_path,
    });

    return brief;
  }

  /**
   * Convert brief to PresentationSpec (for existing engine)
   */
  buildPresentationSpec(brief: MarketBrief, charts: ScrapedChart[]): PresentationSpec {
    const slides: SlideSpec[] = [];

    // 1. Cover slide
    slides.push({
      type: 'cover',
      content: {
        company: 'Rossignoli & Partners',
        tagline: 'Independent Wealth Management',
        headline: `Weekly Market Strategy`,
        subheadline: `Week ${brief.week} — ${brief.date}`,
        date_range: brief.date,
        theme: brief.narratives[0]?.title || 'Market Review',
      },
    });

    // 2. Executive summary
    slides.push({
      type: 'executive_summary',
      content: {
        title: 'Week at a Glance',
        tag: brief.week,
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

    // 3. Market table (heatmap)
    const marketData = brief.snapshot.markets.filter(m => m.level !== 'N/A');
    if (marketData.length > 0) {
      slides.push({
        type: 'chart',
        content: {
          title: 'Market Scoreboard',
          tag: brief.week,
        },
        chart: {
          type: 'table_heatmap',
          data: {
            headers: ['Asset', 'Level', '1W', 'MTD', 'YTD', 'Signal'],
            rows: marketData.map(m => [
              m.name, m.level, m.change1w, m.changeMtd, m.changeYtd, m.signal,
            ]),
          },
          source: 'Bloomberg, FRED, Bilello',
        },
      });
    }

    // 4. Narrative slides
    for (const narrative of brief.narratives) {
      slides.push({
        type: 'text',
        content: {
          title: narrative.title,
          tag: `${narrative.horizon.toUpperCase()} HORIZON`,
          left_title: 'Thesis',
          left_items: [narrative.thesis, ...narrative.evidence.slice(0, 2)],
          left_color: '#3b82f6',
          right_title: 'Contrarian View',
          right_items: [narrative.contrarian],
          right_color: '#f59e0b',
        },
      });
    }

    // 5. Positioning slide
    if (brief.positioning.length > 0) {
      slides.push({
        type: 'chart',
        content: {
          title: 'Tactical Positioning',
          tag: 'ALLOCATION',
        },
        chart: {
          type: 'table_heatmap',
          data: {
            headers: ['Asset Class', 'Position', 'Conviction', 'Rationale'],
            rows: brief.positioning.map(p => [
              p.assetClass, p.position.toUpperCase(), p.conviction, p.rationale,
            ]),
          },
          source: 'Rossignoli & Partners',
        },
      });
    }

    // 6. Risks & Opportunities
    slides.push({
      type: 'text',
      content: {
        title: 'Risks & Opportunities',
        tag: 'OUTLOOK',
        left_title: 'Key Risks',
        left_items: brief.risks,
        left_color: '#ef4444',
        left_icon: '⚠',
        right_title: 'Opportunities',
        right_items: brief.opportunities,
        right_color: '#22c55e',
        right_icon: '✦',
      },
    });

    // 7. Sources slide
    slides.push({
      type: 'sources',
      content: {
        title: 'Sources & Methodology',
        left_sources: brief.snapshot.sources.map(s => `${s.name}: ${s.url}`).join('\n'),
        right_sources: 'Analysis: Rossignoli & Partners proprietary framework\nData: Bloomberg, FRED, FactSet, Bilello',
        disclaimer: 'This material is for informational purposes only and does not constitute investment advice.',
      },
    });

    // 8. Back cover
    slides.push({
      type: 'back_cover',
      content: {
        company: 'Rossignoli & Partners',
        tagline: 'Independent Wealth Management',
        contact_lines: ['Lugano, Switzerland', 'www.rossignolipartners.ch'],
        closing: 'Thank you',
        regulatory: 'Regulated by FINMA',
        copyright: `© ${new Date().getFullYear()} Rossignoli & Partners. All rights reserved.`,
      },
    });

    return {
      meta: {
        title: `Weekly Strategy ${brief.week}`,
        company: 'Rossignoli & Partners',
        date: brief.date,
        header_tag: `WEEKLY STRATEGY | ${brief.week}`,
        footer_left: 'Rossignoli & Partners',
        footer_center: 'Confidential',
        palette: this.config.presentationPalette,
      },
      slides,
      output_path: `${this.config.outputDir}/weekly-strategy-${brief.week}.pptx`,
      chart_dir: this.config.scrapedChartsDir,
    };
  }

  /**
   * Learn from feedback on a brief
   */
  async processFeedback(feedback: string, briefWeek: string): Promise<void> {
    const memory = getMemorySystem();

    // Store feedback as episodic memory
    memory.remember({
      what: `Strategy feedback for ${briefWeek}`,
      details: {
        feedback,
        week: briefWeek,
        type: 'strategy-feedback',
      },
      importance: 0.8,
      tags: ['market', 'feedback', briefWeek],
      source: 'user-feedback',
    });

    // If feedback mentions a specific learning, store as semantic
    const storedAsLesson = feedback.length > 50;
    if (storedAsLesson) {
      memory.learn({
        concept: `strategy-lesson-${briefWeek}`,
        definition: feedback,
        category: 'strategy-feedback',
        tags: ['market', 'lesson', 'feedback'],
        confidence: 0.7,
        importance: 0.7,
      });
    }

    // Publish feedback event
    this.publishEvent('strategy.feedback.received', {
      source: 'market-strategist',
      precision: 0.7,
      briefWeek,
      feedbackLength: feedback.length,
      storedAsLesson,
    });
  }

  // ==========================================================================
  // Finance Module Integration (v17.1)
  // ==========================================================================

  /**
   * Enrich asset snapshots with data from the finance module
   */
  private async enrichFromFinanceModule(snapshot: WeeklySnapshot): Promise<void> {
    try {
      const { createFinanceModule } = await import('../finance/index.js');
      const { getEventBus } = await import('../bus/index.js');

      const bus = this.bus || getEventBus();
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
            bull: 'bullish',
            bear: 'bearish',
            neutral: 'neutral',
            crisis: 'bearish',
          };
          asset.signal = regimeToSignal[detection.regime] || 'neutral';
        }
      }
    } catch (err) {
      // Finance module not available — keep existing snapshot data
      console.error('[MarketStrategist] Failed to enrich with regime signals:', err);
    }
  }

  /**
   * Get regime context from finance module for narrative synthesis
   */
  private async getRegimeContext(): Promise<{ regime: string; confidence: number; trendStrength: number } | undefined> {
    try {
      const { createFinanceModule } = await import('../finance/index.js');
      const { getEventBus } = await import('../bus/index.js');

      const bus = this.bus || getEventBus();
      const financeModule = createFinanceModule(bus);

      // Use SPY/S&P 500 as primary regime indicator
      const detection = financeModule.regimeDetector.detectRegime('SPY');
      if (detection.confidence > 0.3) {
        return {
          regime: detection.regime,
          confidence: detection.confidence,
          trendStrength: detection.trendStrength,
        };
      }
    } catch (err) {
      // Finance module not available
      console.error('[MarketStrategist] Failed to get regime context:', err);
    }
    return undefined;
  }

  // ==========================================================================
  // Bus Event Helper
  // ==========================================================================

  private publishEvent<K extends keyof import('../bus/events.js').GenesisEventMap>(
    topic: K,
    payload: Omit<import('../bus/events.js').GenesisEventMap[K], 'seq' | 'timestamp'>,
  ): void {
    if (this.bus) {
      this.bus.publish(topic, payload);
    }
  }
}
