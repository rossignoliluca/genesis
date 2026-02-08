/**
 * Genesis v17.0 - Market Strategy Memory Seeder
 *
 * Seeds historical financial knowledge into the eternal memory layer.
 * Run once to bootstrap the market strategist with:
 * - Market crisis patterns and recovery timelines
 * - Asset class regime models
 * - CrossInvest strategy framework
 * - Weekly workflow skill (procedural memory)
 */

import { getMemorySystem } from '../memory/index.js';
import { MemoryLayers } from './memory-layers.js';

// ============================================================================
// Seed Function
// ============================================================================

export function seedMarketStrategyMemory(): { procedural: number; semantic: number } {
  const memory = getMemorySystem();
  const layers = new MemoryLayers(memory);
  let procedural = 0;
  let semantic = 0;

  // ==========================================================================
  // PROCEDURAL: Weekly strategy workflow
  // ==========================================================================

  memory.learnSkill({
    name: 'weekly-market-strategy',
    description: 'Full workflow for weekly market strategy brief generation — single command via weekly_report tool',
    steps: [
      { action: 'weekly_report.run', params: { sourcePriority: 2 } },
    ],
    tags: ['market-strategy', 'weekly', 'rossignoli', 'pipeline'],
    importance: 0.95,
  });
  procedural++;

  memory.learnSkill({
    name: 'weekly-report-pipeline',
    description: 'Repeatable weekly report pipeline: collect 20+ MCP sources → verify → analyze → PPTX → social → memory',
    steps: [
      { action: 'collect', params: { sources: 'brave-search, firecrawl, exa (20+ sources)', parallel: true } },
      { action: 'verify', params: { crossReference: true, minSources: 2 } },
      { action: 'analyze', params: { narratives: 3, contrarian: true, llm: 'openai' } },
      { action: 'build_spec', params: { style: 'SYZ', slides: '30+', sections: 7 } },
      { action: 'render_pptx', params: { engine: 'python', palette: 'swiss_institutional' } },
      { action: 'social', params: { platforms: ['twitter', 'linkedin', 'bluesky'] } },
      { action: 'store_memory', params: { layers: ['weekly', 'monthly'] } },
    ],
    tags: ['market-strategy', 'weekly', 'pipeline', 'mcp'],
    importance: 1.0,
  });
  procedural++;

  memory.learnSkill({
    name: 'market-chart-scraping',
    description: 'Scrape charts from institutional sources for market presentations',
    steps: [
      { action: 'web.browse', params: { url: 'bilello.blog', screenshot: true } },
      { action: 'web.browse', params: { url: 'fred.stlouisfed.org', screenshot: true } },
      { action: 'web.browse', params: { url: 'insight.factset.com', screenshot: true } },
    ],
    tags: ['market-strategy', 'charts', 'scraping'],
    importance: 0.7,
  });
  procedural++;

  // ==========================================================================
  // SEMANTIC (HISTORY): Market crises and recovery patterns
  // ==========================================================================

  const historicalFacts = [
    {
      concept: 'market-crisis-2008-gfc',
      definition: 'Global Financial Crisis 2008: S&P -57%, recovery 4.5 years. Worst since Great Depression.',
      properties: {
        peak: 'Oct 2007', trough: 'Mar 2009', drawdown: -57, recovery_months: 54,
        trigger: 'Subprime mortgage crisis, Lehman bankruptcy',
        lesson: 'Credit spreads are the best early warning. HY spreads >500bp = danger zone.',
        policy_response: 'TARP, QE1, zero rates — massive monetary + fiscal response',
      },
      tags: ['crisis', '2008'],
    },
    {
      concept: 'market-crisis-2020-covid',
      definition: 'COVID Crash 2020: S&P -34% in 23 days, fastest recovery in history (5 months).',
      properties: {
        drawdown: -34, recovery_months: 5, speed_days: 23,
        trigger: 'Global pandemic, lockdowns, supply chain collapse',
        lesson: 'V-shaped recoveries happen when the Fed acts fast. Dont sell the panic.',
        policy_response: 'Unlimited QE, 0% rates, fiscal stimulus ($5T+ globally)',
      },
      tags: ['crisis', '2020'],
    },
    {
      concept: 'market-crisis-2000-dotcom',
      definition: 'Dot-com bust 2000-2002: Nasdaq -78%, S&P -49%, recovery took 7 years for Nasdaq.',
      properties: {
        drawdown_nasdaq: -78, drawdown_sp500: -49, recovery_years: 7,
        trigger: 'Tech bubble burst, irrational exuberance, 9/11',
        lesson: 'Valuation matters eventually. P/E >40 on the index = danger zone.',
        survivors: 'Amazon, Apple survived. Pets.com, Webvan did not. Quality matters.',
      },
      tags: ['crisis', '2000'],
    },
    {
      concept: 'market-crisis-2022-bear',
      definition: '2022 Bear Market: S&P -25%, Nasdaq -33%, bonds -13% (worst 60/40 year ever).',
      properties: {
        drawdown_sp500: -25, drawdown_nasdaq: -33, drawdown_agg: -13,
        trigger: 'Inflation spike (9.1%), aggressive Fed hiking (0→5.25%)',
        lesson: 'When inflation is the problem, both stocks AND bonds fall. Diversification fails.',
        aftermath: 'AI boom (ChatGPT Nov 2022) triggered new tech cycle',
      },
      tags: ['crisis', '2022'],
    },
    {
      concept: 'gold-macro-regime',
      definition: 'Gold outperforms in negative real rates + central bank buying regimes.',
      properties: {
        drivers: ['real rates', 'central bank buying', 'USD weakness', 'geopolitical risk'],
        avg_annual_return: '8% nominal since 1971',
        best_regime: 'Negative real rates + rising central bank demand (2019-2024: +80%)',
        lesson: 'Gold is structural, not tactical. Size 5-10% and forget.',
      },
      tags: ['regime', 'gold'],
    },
    {
      concept: 'yield-curve-inversion-signal',
      definition: '2s10s inversion has preceded every recession since 1970, avg lead time 14 months.',
      properties: {
        avg_lead_months: 14,
        false_positives: 1,
        track_record: '8/8 recessions since 1970 predicted',
        caveat: 'The lag is variable (6-24 months). Inversion predicts recession, not market timing.',
        lesson: 'When 2s10s inverts, start building recession playbook — but dont panic yet.',
      },
      tags: ['signal', 'yield-curve'],
    },
    {
      concept: 'fed-pivot-pattern',
      definition: 'Fed rate cut cycles: markets rally on pivot expectation, often correct before the cut.',
      properties: {
        historical_return_6m_post_pivot: '+12% avg for S&P 500',
        caveat: 'If cuts are due to recession (not soft landing), initial rally fails',
        lesson: 'Distinguish between "insurance cuts" (bullish) and "panic cuts" (bearish).',
      },
      tags: ['regime', 'fed'],
    },
    {
      concept: 'europe-vs-us-valuation-gap',
      definition: 'European equities trade at ~40% discount to US on P/E. Widest gap since 2000.',
      properties: {
        pe_discount: '40%',
        drivers: ['tech sector weighting gap', 'energy dependence', 'political fragmentation'],
        contrarian_case: 'Mean reversion + fiscal stimulus + defense spending = Europe catch-up trade',
        lesson: 'The valuation gap is structural AND cyclical. Position for partial mean reversion.',
      },
      tags: ['regime', 'europe'],
    },
    {
      concept: 'mean-reversion-valuation',
      definition: 'Extreme valuations (P/E >25 or <10 on S&P) mean-revert over 5-10 year cycles.',
      properties: {
        shiller_pe_avg: 17,
        shiller_pe_current: '~35 (2026)',
        expected_return_10y: 'When CAPE >30, historical 10y real return is ~2% annualized',
        lesson: 'Current US valuations imply low forward returns. Diversify geographically.',
      },
      tags: ['pattern', 'valuation'],
    },
    {
      concept: 'emerging-markets-cycle',
      definition: 'EM equities follow a ~10 year outperformance/underperformance cycle vs DM.',
      properties: {
        last_em_outperformance: '2001-2010 (BRIC decade)',
        last_em_underperformance: '2011-2020',
        current_position: 'Potential new EM cycle starting, driven by commodity supercycle + demographics',
        lesson: 'EM timing is about USD cycle. Weak USD = EM outperformance.',
      },
      tags: ['regime', 'em'],
    },
  ];

  for (const fact of historicalFacts) {
    layers.storeHistorical({
      concept: fact.concept,
      definition: fact.definition,
      properties: fact.properties,
      tags: fact.tags,
    });
    semantic++;
  }

  // ==========================================================================
  // SEMANTIC: CrossInvest strategy framework
  // ==========================================================================

  memory.learn({
    concept: 'rossignoli-strategy-framework',
    definition: 'Rossignoli & Partners contrarian investment framework',
    category: 'strategy',
    properties: {
      style: 'Contrarian with institutional rigor',
      principles: [
        'Buy what everyone hates, sell what everyone loves',
        'Follow the flow: central banks > fund flows > sentiment',
        'Mean reversion in valuation, momentum in trends',
        'Europe is structurally undervalued vs US (40% discount)',
        'Gold is structural, not tactical',
      ],
      process: 'Macro → Cross-asset → Sector → Security selection',
      risk_framework: 'Max drawdown -15%, position sizing via Kelly fraction 0.25',
      review_cadence: 'Weekly brief, monthly rebalance, quarterly deep dive',
    },
    tags: ['rossignoli', 'strategy', 'framework'],
    confidence: 1.0,
    importance: 1.0,
  });
  semantic++;

  memory.learn({
    concept: 'rossignoli-presentation-style',
    definition: 'Rossignoli & Partners presentation design guidelines for market strategy decks',
    category: 'strategy',
    properties: {
      palette: 'swiss_institutional',
      style: 'Light background (#F5F5F5), navy primary (#003366), institutional typography — SYZ-style',
      structure: [
        'Cover with #GlobalMarkets Weekly Wrap-Up',
        'Executive summary (3-4 key insights)',
        'Cross-asset scoreboard (table heatmap)',
        'Section: #equities (indices, earnings)',
        'Section: #fixed_income (yields, credit)',
        'Section: #fx (EUR/USD, USD/CHF, DXY)',
        'Section: #commodities (gold, oil)',
        'Section: #macro (Fed, ECB, data)',
        'Section: #crypto (BTC, ETH)',
        'Section: #geopolitics (trade, defense)',
        'Narrative deep-dives (2-3 slides)',
        'Risks & Opportunities',
        'Sources & disclaimer',
        'Back cover',
      ],
      chart_principles: [
        'Every chart needs an assertion-evidence title',
        'Source citation on every data slide',
        'Max 3-4 series per chart',
        'Dark background, bright data colors',
      ],
      reference: 'Charlie Bilello @charliebilello "Week in Charts" (bilello.blog)',
    },
    tags: ['rossignoli', 'presentation', 'design'],
    confidence: 1.0,
    importance: 0.9,
  });
  semantic++;

  return { procedural, semantic };
}

// ============================================================================
// CLI entrypoint
// ============================================================================

const isDirectRun = process.argv[1]?.endsWith('seed-memory.ts') ||
                    process.argv[1]?.endsWith('seed-memory.js');

if (isDirectRun) {
  const result = seedMarketStrategyMemory();
  console.log(`[Market Strategy] Memory seeded:`);
  console.log(`  Procedural: ${result.procedural} skills`);
  console.log(`  Semantic:   ${result.semantic} facts`);
}
