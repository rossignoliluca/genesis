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
