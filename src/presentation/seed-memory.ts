/**
 * Genesis Presentation Engine — Memory Seeding
 *
 * Seeds the memory system with:
 * - Procedural: workflow for creating weekly strategy presentations
 * - Semantic: design system knowledge (palette, fonts, layout, chart types)
 * - Semantic: chart best practices (when to use line vs bar vs gauge etc.)
 *
 * Usage:
 *   npx tsx src/presentation/seed-memory.ts
 */

import { getMemorySystem } from '../memory/index.js';

export function seedPresentationMemory(): {
  procedural: number;
  semantic: number;
} {
  const memory = getMemorySystem();
  let procedural = 0;
  let semantic = 0;

  // ============================================================================
  // Procedural: Weekly Strategy Presentation Workflow
  // ============================================================================

  memory.learnSkill({
    name: 'create-weekly-strategy-presentation',
    description: 'Complete workflow for generating a weekly strategy PPTX deck',
    steps: [
      {
        action: 'recall.memory',
        params: { query: 'crossinvest-design-system, presentation-chart-types, past presentation feedback' },
      },
      {
        action: 'web.search',
        params: { query: 'Weekly market data, key events, fund flows, sentiment indicators' },
      },
      {
        action: 'content.generate',
        params: { format: 'SCR executive summary (Situation-Complication-Resolution)' },
      },
      {
        action: 'content.generate',
        params: { format: 'Chart data JSON for all 10 charts with real numbers' },
      },
      {
        action: 'create.presentation',
        params: { spec: 'Complete PresentationSpec JSON with all slides and chart specs' },
      },
      {
        action: 'recall.memory',
        params: { store: 'episode', data: 'Generated presentation path, stats, topic, and spec' },
      },
    ],
    tags: ['presentation', 'weekly-strategy', 'crossinvest'],
  });
  procedural++;

  // ============================================================================
  // Semantic: Crossinvest Design System
  // ============================================================================

  memory.learn({
    concept: 'crossinvest-design-system',
    definition: 'Design system for Crossinvest SA institutional presentations',
    category: 'presentation-design',
    properties: {
      palette: {
        name: 'crossinvest_navy_gold',
        NAVY: '#0C2340',
        GOLD: '#B8860B',
        WHITE: '#FFFFFF',
        CHART_PRI: '#003366',
        CHART_SEC: '#117ACA',
        GREEN: '#2E865F',
        RED: '#CC0000',
        ORANGE: '#E8792B',
        BODY_TEXT: '#2C3E50',
        GRAY: '#666666',
        SOURCE_CLR: '#999999',
        CHART_BG: '#FAFBFC',
        LIGHT_GRAY: '#E0E0E0',
      },
      fonts: {
        primary: 'Arial',
        title_size: '22pt bold',
        subtitle_size: '12pt',
        body_size: '11pt',
        source_size: '7pt italic',
        header_size: '10pt bold',
        footer_size: '8pt',
        chart_tag_size: '9pt bold',
      },
      layout: {
        width: '13.333 inches',
        height: '7.5 inches',
        chart_dpi: 250,
        margins: '0.6 inches left/right',
        header_bar_height: '0.5 inches',
        chart_area: 'top 2.5, height 4.5 inches',
      },
      principles: [
        'Tufte: Maximize data-ink ratio, remove chartjunk',
        'McKinsey SCR: Situation-Complication-Resolution structure',
        'Assertion-evidence: Title states the claim, chart is the evidence',
        'JPMorgan Guide to Markets style: clean, institutional, professional',
        'Every chart has a source attribution at bottom-left',
        'Color-coded signals: green=positive, red=negative, orange=overbought',
      ],
    },
    tags: ['crossinvest', 'design', 'presentation', 'palette', 'fonts', 'layout'],
    confidence: 1.0,
  });
  semantic++;

  // ============================================================================
  // Semantic: Chart Type Best Practices
  // ============================================================================

  memory.learn({
    concept: 'presentation-chart-types',
    definition: 'When to use each chart type in financial presentations',
    category: 'presentation-design',
    properties: {
      line: {
        use_for: 'Time series, trends, price histories',
        max_series: '3-4 series maximum',
        examples: 'Equity indices weekly trajectory, gold price history, JGB yield curve',
        features: 'Fill underneath, annotations for events, vertical event lines, dual Y-axis for dual-series',
      },
      bar: {
        use_for: 'Comparisons across categories, capex vs FCF',
        examples: 'AI capex by company, defense spending by country',
        features: 'Grouped bars for comparison, value labels, highlight negative values',
      },
      hbar: {
        use_for: 'Rankings, fund flows, directional data',
        examples: 'Fund flows by region, great rotation chart',
        features: 'Color-coded by direction, value labels with prefix/suffix',
      },
      stacked_bar: {
        use_for: 'Composition over time, breakdown by segment',
        examples: 'European defense spending by country over years',
        features: 'Total labels above, legend with all segments, growth arrows',
      },
      table_heatmap: {
        use_for: 'Scoreboard, multi-metric comparison',
        examples: 'Asset class performance scoreboard (1W, MTD, YTD, Signal)',
        features: 'Color-coded cells (green/red for +/-), signal column with overbought/oversold',
      },
      gauge: {
        use_for: 'Single KPI with zones, sentiment indicators',
        examples: 'BofA Bull & Bear Indicator, Fear/Greed index',
        features: 'Colored zones, current value marker, context boxes with historical data',
      },
      donut_matrix: {
        use_for: 'Allocation + conviction view',
        examples: 'Model portfolio allocation with conviction matrix',
        features: 'Donut on left (allocation %), conviction table on right (OW/N/UW + rationale)',
      },
      waterfall: {
        use_for: 'Attribution / decomposition analysis',
        examples: 'Portfolio return attribution (Start → contributors → End)',
        features: 'Running total, connector lines, color-coded positive/negative, total bars',
        data_schema: 'labels[], values[], is_total[]',
      },
      return_quilt: {
        use_for: 'THE institutional chart — Periodic Table of Returns (JPMorgan GTTM)',
        examples: 'Annual returns by asset class sorted best-to-worst per year',
        reference: 'JPMorgan Guide to the Markets',
        features: 'Color-coded grid, gradient or categorical coloring, sorted per-year ranking',
        data_schema: 'years[], assets[], returns[][] (years × assets)',
        best_practice: 'Use 5-10 years × 6-10 assets. Gradient mode for performance focus, categorical for asset tracking.',
      },
      scatter: {
        use_for: 'Relationship between two variables, labeled data points',
        examples: 'Risk vs return by asset class, PE vs earnings growth by sector',
        reference: 'Goldman Sachs Research',
        features: 'Labeled points, optional quadrant labels, optional trend line (linear regression)',
        data_schema: 'points[{x, y, label, size?, color?}], x_label, y_label',
        best_practice: 'Keep labels readable — max 15-20 points. Use quadrants for strategic positioning.',
      },
      sparkline_table: {
        use_for: 'Dense tabular data with inline trend visualization',
        examples: 'Bloomberg-style asset scoreboard with price trends',
        reference: 'Bloomberg Terminal',
        features: 'Tabular cells + mini sparkline per row, color-coded positive/negative trends',
        data_schema: 'headers[], rows[{cells[], sparkline[]}]',
        best_practice: 'Keep sparkline data to 5-20 points. Alternate row backgrounds for readability.',
      },
      lollipop: {
        use_for: 'Elegant alternative to bar chart for rankings / one-metric comparisons',
        examples: 'Country GDP growth comparison, fund performance ranking',
        features: 'Dot + stem, optional sorting, color-coded positive/negative',
        data_schema: 'categories[], values[]',
        best_practice: 'Sort by value for maximum clarity. Use when you have 5-15 categories.',
      },
      dumbbell: {
        use_for: 'Show change/difference between two points per category',
        examples: 'Before/after policy impact, year-over-year comparison per sector',
        features: 'Two dots connected by line per category, labeled start/end',
        data_schema: 'categories[], start[], end[], start_label, end_label',
        best_practice: 'Use when comparing exactly 2 time periods or conditions.',
      },
      area: {
        use_for: 'Volume/magnitude over time, composition breakdown',
        examples: 'AUM growth over time, market cap composition',
        features: 'Single or stacked, alpha gradient fill, stackplot for composition',
        data_schema: 'labels[], series[{name, values}], config.stacked (bool)',
        best_practice: 'Stacked area for composition (parts of whole). Single area for emphasizing magnitude.',
      },
      bump: {
        use_for: 'Ranking changes over time',
        examples: 'Country/sector ranking evolution over years, fund performance ranking per quarter',
        features: 'Inverted y-axis (rank 1 = top), labels at both ends, proportional line width',
        data_schema: 'periods[], series[{name, ranks[]}]',
        best_practice: 'Best with 4-8 series and 4-10 time periods. Clearly shows rank changes.',
      },
      small_multiples: {
        use_for: "Tufte's most powerful pattern — compare many panels with shared axes",
        examples: 'Sector performance breakdown (one mini chart per sector), regional comparison',
        reference: 'Edward Tufte, BlackRock BII',
        features: 'Grid of mini line/bar charts, shared y-axis for direct comparison, auto grid layout',
        data_schema: 'panels[{title, labels, values}], config.chart_type ("line"|"bar")',
        best_practice: 'Use 4-12 panels. Keep labels minimal. Shared axes are key for fair comparison.',
      },
    },
    tags: ['charts', 'visualization', 'best-practices', 'presentation'],
    confidence: 1.0,
  });
  semantic++;

  // ============================================================================
  // Semantic: Presentation Structure
  // ============================================================================

  memory.learn({
    concept: 'weekly-strategy-presentation-structure',
    definition: 'Standard structure for a Crossinvest weekly strategy presentation',
    category: 'presentation-design',
    properties: {
      slides: [
        'Cover: Company branding, title, week dates, theme',
        'Executive Summary: SCR format (Situation-Complication-Resolution + closing)',
        'Chart #1: Asset Class Scoreboard (table_heatmap)',
        'Chart #2-#8: Individual deep-dive charts (line, bar, hbar, stacked_bar)',
        'Chart #9: Sentiment Indicator (gauge)',
        'Chart #10: Tactical Allocation (donut_matrix)',
        'What to Watch: Two-column opportunities/risks (text slide)',
        'Sources & Disclaimer: Two-column source list + legal text',
        'Back Cover: Contact details, branding',
      ],
      total_slides: '13-15',
      total_charts: '10',
      format: 'Widescreen 13.333" × 7.5" (16:9)',
    },
    tags: ['structure', 'weekly-strategy', 'crossinvest', 'presentation'],
    confidence: 1.0,
  });
  semantic++;

  return { procedural, semantic };
}

// CLI entry point
if (process.argv[1]?.endsWith('seed-memory.ts') ||
    process.argv[1]?.endsWith('seed-memory.js')) {
  const result = seedPresentationMemory();
  console.log(`Seeded presentation memory:`);
  console.log(`  Procedural skills: ${result.procedural}`);
  console.log(`  Semantic facts: ${result.semantic}`);
  console.log(`  Total: ${result.procedural + result.semantic}`);
}
