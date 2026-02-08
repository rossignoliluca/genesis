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
  DEFAULT_STRATEGY_CONFIG,
} from './types.js';
import { DEFAULT_STRATEGY_CONFIG as CONFIG } from './types.js';
import type { PresentationSpec, SlideSpec, ChartSpec } from '../presentation/types.js';

// ============================================================================
// Market Strategist
// ============================================================================

export class MarketStrategist {
  private collector: MarketCollector;
  private analyzer: MarketAnalyzer;
  private memoryLayers: MemoryLayers;
  private config: StrategyConfig;

  constructor(config?: Partial<StrategyConfig>) {
    this.config = { ...CONFIG, ...config };
    this.collector = new MarketCollector(this.config);
    this.analyzer = new MarketAnalyzer();
    this.memoryLayers = new MemoryLayers();
  }

  /**
   * Full weekly strategy workflow
   */
  async generateWeeklyBrief(): Promise<MarketBrief> {
    // 1. Recall context from memory (all 4 layers)
    const context = await this.memoryLayers.recallContext('weekly market strategy');

    // 2. Collect fresh data from web
    const snapshot = await this.collector.collectWeeklyData();

    // 3. Scrape real charts from institutional sources
    let charts: ScrapedChart[] = [];
    try {
      charts = await this.collector.scrapeCharts(['bilello', 'fred', 'factset']);
    } catch (error) {
      console.error('[MarketStrategist] Chart scraping failed, continuing without charts:', error);
    }

    // 4. Synthesize narratives (using memory + fresh data)
    const narratives = await this.analyzer.synthesizeNarrative(
      snapshot,
      context.recentWeeks,
      context.historicalAnalogues,
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
        company: 'CrossInvest SA',
        tagline: 'Independent Asset Management',
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
          source: 'CrossInvest SA',
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
        right_sources: 'Analysis: CrossInvest SA proprietary framework\nData: Bloomberg, FRED, FactSet, Bilello',
        disclaimer: 'This material is for informational purposes only and does not constitute investment advice.',
      },
    });

    // 8. Back cover
    slides.push({
      type: 'back_cover',
      content: {
        company: 'CrossInvest SA',
        tagline: 'Independent Asset Management',
        contact_lines: ['Lugano, Switzerland', 'www.crossinvest.ch'],
        closing: 'Thank you',
        regulatory: 'Regulated by FINMA',
        copyright: `© ${new Date().getFullYear()} CrossInvest SA. All rights reserved.`,
      },
    });

    return {
      meta: {
        title: `Weekly Strategy ${brief.week}`,
        company: 'CrossInvest SA',
        date: brief.date,
        header_tag: `WEEKLY STRATEGY | ${brief.week}`,
        footer_left: 'CrossInvest SA',
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
    if (feedback.length > 50) {
      memory.learn({
        concept: `strategy-lesson-${briefWeek}`,
        definition: feedback,
        category: 'strategy-feedback',
        tags: ['market', 'lesson', 'feedback'],
        confidence: 0.7,
        importance: 0.7,
      });
    }
  }
}
