/**
 * Genesis v18.5 - Extended Source Registry
 *
 * Domain-specific MCP-powered data sources for the weekly report.
 * Each source knows how to collect data via brave-search, firecrawl, or playwright.
 */

import type { SourceConfig, SourceMethod } from './types.js';

// ============================================================================
// Source Categories
// ============================================================================

export interface ExtendedSource extends SourceConfig {
  category: SourceCategory;
  scrapeUrls?: string[];       // Specific URLs to scrape
  searchQueries?: string[];    // Search queries to run
  language?: 'en' | 'it' | 'de' | 'fr';
  priority: number;            // 1=critical, 2=important, 3=nice-to-have
}

export type SourceCategory =
  | 'equities'
  | 'bonds'
  | 'fx'
  | 'commodities'
  | 'macro'
  | 'crypto'
  | 'geopolitics'
  | 'earnings'
  | 'sentiment'
  | 'italian_geo';

// ============================================================================
// Full Source Registry
// ============================================================================

export const EXTENDED_SOURCES: ExtendedSource[] = [
  // --- EQUITIES ---
  {
    name: 'barchart_equities',
    type: 'charts+data',
    method: 'firecrawl',
    enabled: true,
    category: 'equities',
    scrapeUrls: [
      'https://www.barchart.com/stocks/indices',
      'https://www.barchart.com/stocks/performance/weekly',
    ],
    priority: 1,
  },
  {
    name: 'bilello_weekly',
    type: 'charts+data',
    url: 'bilello.blog',
    method: 'firecrawl',
    enabled: true,
    category: 'equities',
    scrapeUrls: ['https://bilello.blog'],
    priority: 1,
  },
  {
    name: 'cnbc_markets',
    type: 'headlines',
    method: 'brave_search',
    enabled: true,
    category: 'equities',
    searchQueries: [
      'site:cnbc.com weekly market recap',
      'S&P 500 weekly performance this week',
    ],
    priority: 1,
  },
  {
    name: 'reddit_wallstreetbets',
    type: 'headlines',
    method: 'brave_search',
    enabled: true,
    category: 'sentiment',
    searchQueries: [
      'site:reddit.com/r/wallstreetbets weekly discussion',
      'site:reddit.com/r/investing weekly recap',
      'site:reddit.com/r/stocks most discussed stocks this week',
    ],
    priority: 2,
  },

  // --- BONDS & FIXED INCOME ---
  {
    name: 'fred_yields',
    type: 'data+charts',
    url: 'fred.stlouisfed.org',
    method: 'firecrawl',
    enabled: true,
    category: 'bonds',
    scrapeUrls: [
      'https://fred.stlouisfed.org/series/DGS10',
      'https://fred.stlouisfed.org/series/DGS2',
      'https://fred.stlouisfed.org/series/T10Y2Y',
    ],
    priority: 1,
  },
  {
    name: 'barchart_bonds',
    type: 'data+charts',
    method: 'firecrawl',
    enabled: true,
    category: 'bonds',
    scrapeUrls: [
      'https://www.barchart.com/futures/quotes/ZN*0/overview',
    ],
    priority: 2,
  },

  // --- FX ---
  {
    name: 'fx_weekly',
    type: 'data+charts',
    method: 'brave_search',
    enabled: true,
    category: 'fx',
    searchQueries: [
      'EUR/USD weekly recap forex',
      'DXY dollar index this week',
      'CHF/EUR exchange rate weekly',
    ],
    priority: 1,
  },

  // --- COMMODITIES ---
  {
    name: 'barchart_commodities',
    type: 'data+charts',
    method: 'firecrawl',
    enabled: true,
    category: 'commodities',
    scrapeUrls: [
      'https://www.barchart.com/futures/quotes/GC*0/overview',
      'https://www.barchart.com/futures/quotes/CL*0/overview',
    ],
    priority: 1,
  },
  {
    name: 'gold_silver_weekly',
    type: 'data+charts',
    method: 'brave_search',
    enabled: true,
    category: 'commodities',
    searchQueries: [
      'gold price weekly recap',
      'oil WTI price this week',
    ],
    priority: 2,
  },

  // --- MACRO ---
  {
    name: 'fed_watch',
    type: 'research',
    method: 'brave_search',
    enabled: true,
    category: 'macro',
    searchQueries: [
      'Federal Reserve interest rate decision 2026',
      'Fed funds rate probability CME FedWatch',
      'US inflation CPI latest',
      'US jobs report nonfarm payrolls',
    ],
    priority: 1,
  },
  {
    name: 'ecb_watch',
    type: 'research',
    method: 'brave_search',
    enabled: true,
    category: 'macro',
    searchQueries: [
      'ECB interest rate decision 2026',
      'eurozone inflation latest',
    ],
    priority: 2,
  },

  // --- EARNINGS ---
  {
    name: 'factset_earnings',
    type: 'earnings',
    url: 'insight.factset.com',
    method: 'firecrawl',
    enabled: true,
    category: 'earnings',
    scrapeUrls: ['https://insight.factset.com/topic/earnings'],
    searchQueries: [
      'earnings this week results surprises',
      'S&P 500 earnings season Q4 2025',
    ],
    priority: 1,
  },

  // --- CRYPTO ---
  {
    name: 'crypto_weekly',
    type: 'data+charts',
    method: 'brave_search',
    enabled: true,
    category: 'crypto',
    searchQueries: [
      'Bitcoin price weekly recap',
      'crypto market weekly summary',
      'Ethereum ETF flows this week',
    ],
    priority: 2,
  },

  // --- GEOPOLITICS ---
  {
    name: 'geopolitics_global',
    type: 'headlines',
    method: 'brave_search',
    enabled: true,
    category: 'geopolitics',
    searchQueries: [
      'geopolitics this week market impact',
      'US China trade tariffs latest',
      'Middle East oil supply risk',
      'NATO defense spending Europe',
    ],
    priority: 2,
  },

  // --- ITALIAN GEOPOLITICAL SOURCES ---
  {
    name: 'limes_geopolitica',
    type: 'research',
    method: 'firecrawl',
    enabled: true,
    category: 'italian_geo',
    scrapeUrls: ['https://www.limesonline.com'],
    searchQueries: ['site:limesonline.com geopolitica settimana'],
    language: 'it',
    priority: 2,
  },
  {
    name: 'formiche_difesa',
    type: 'research',
    method: 'firecrawl',
    enabled: true,
    category: 'italian_geo',
    scrapeUrls: ['https://formiche.net'],
    searchQueries: ['site:formiche.net economia difesa settimana'],
    language: 'it',
    priority: 3,
  },
  {
    name: 'domino_geopolitica',
    type: 'research',
    method: 'brave_search',
    enabled: true,
    category: 'italian_geo',
    searchQueries: ['site:editorialedomino.it geopolitica'],
    language: 'it',
    priority: 3,
  },

  // --- INSTITUTIONAL RESEARCH ---
  {
    name: 'exa_institutional',
    type: 'research',
    query: 'institutional weekly market strategy outlook 2026',
    method: 'exa',
    enabled: true,
    category: 'macro',
    priority: 2,
  },
];

// ============================================================================
// Source Helpers
// ============================================================================

export function getSourcesByCategory(category: SourceCategory): ExtendedSource[] {
  return EXTENDED_SOURCES.filter(s => s.category === category && s.enabled);
}

export function getSourcesByPriority(maxPriority: number): ExtendedSource[] {
  return EXTENDED_SOURCES.filter(s => s.enabled && s.priority <= maxPriority);
}

export function getCriticalSources(): ExtendedSource[] {
  return getSourcesByPriority(1);
}
