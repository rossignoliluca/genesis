/**
 * Genesis v17.0 - Market Strategist Types
 *
 * Type definitions for the market strategy module.
 * Supports weekly brief generation, narrative synthesis,
 * and multi-horizon memory storage.
 */

import type { PresentationSpec } from '../presentation/types.js';

// ============================================================================
// Core Data Types
// ============================================================================

export interface AssetSnapshot {
  name: string;        // "S&P 500"
  ticker?: string;     // "SPX"
  level: string;       // "6,932"
  change1w: string;    // "-0.1%"
  changeMtd: string;   // "+1.2%"
  changeYtd: string;   // "+3.4%"
  signal: 'bullish' | 'bearish' | 'neutral';
  commentary: string;  // One-line insight
}

export interface Headline {
  title: string;
  source: string;
  url?: string;
  impact: 'high' | 'medium' | 'low';
  theme: string;       // Maps to a narrative thread
}

export interface SentimentGauge {
  overall: 'bullish' | 'bearish' | 'neutral';
  score: number;       // -1 (extreme fear) to +1 (extreme greed)
  indicators: Record<string, number>;  // e.g. { vix: -0.3, put_call: 0.2 }
}

export interface SourceRef {
  name: string;
  url: string;
  type: 'data' | 'charts' | 'research' | 'headlines';
  accessedAt: Date;
}

export interface WeeklySnapshot {
  week: string;              // "2026-W06"
  date: string;              // "2026-02-07"
  markets: AssetSnapshot[];
  headlines: Headline[];
  themes: string[];          // ["AI Reckoning", "Warsh Shock", ...]
  sentiment: SentimentGauge;
  sources: SourceRef[];
}

// ============================================================================
// Narrative Types
// ============================================================================

export type TimeHorizon = 'short' | 'medium' | 'long';

export interface NarrativeThread {
  id: string;
  title: string;                // "The AI Reckoning"
  horizon: TimeHorizon;
  thesis: string;               // Main argument
  evidence: string[];           // Supporting data points
  contrarian: string;           // CrossInvest contrarian view
  confidence: number;           // 0-1
  lastUpdated: Date;
}

export interface ThemeShift {
  theme: string;
  direction: 'emerging' | 'strengthening' | 'weakening' | 'fading';
  from: string;                 // Previous state description
  to: string;                   // Current state description
  significance: 'high' | 'medium' | 'low';
}

export interface PositioningView {
  assetClass: string;           // "US Equities", "Gold", "EM Bonds"
  position: 'long' | 'short' | 'neutral';
  conviction: 'high' | 'medium' | 'low';
  rationale: string;
}

// ============================================================================
// Market Brief
// ============================================================================

export interface MarketBrief {
  id: string;
  week: string;
  date: string;
  snapshot: WeeklySnapshot;
  narratives: NarrativeThread[];
  positioning: PositioningView[];
  risks: string[];
  opportunities: string[];
  presentationSpec?: PresentationSpec;
}

// ============================================================================
// Source Configuration
// ============================================================================

export type SourceMethod = 'brave_search' | 'exa' | 'firecrawl' | 'playwright';

export interface SourceConfig {
  name: string;
  type: 'charts+data' | 'data+charts' | 'earnings' | 'headlines' | 'research';
  url?: string;
  query?: string;
  method: SourceMethod;
  enabled: boolean;
}

export interface ScrapedChart {
  source: string;              // "bilello", "fred"
  title: string;
  imagePath: string;           // Local path to PNG
  url: string;                 // Original URL
  capturedAt: Date;
}

export interface ResearchSummary {
  source: string;
  title: string;
  url: string;
  summary: string;
  keyFindings: string[];
  date: string;
}

// ============================================================================
// Strategy Configuration
// ============================================================================

export interface StrategyConfig {
  sources: SourceConfig[];
  focusAssets: string[];
  narrativeCount: number;       // How many narrative threads (3-5)
  presentationPalette: string;  // 'swiss_institutional'
  outputDir: string;
  scrapedChartsDir: string;
  generatePresentation: boolean;
}

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  sources: [
    { name: 'bilello', type: 'charts+data', url: 'bilello.blog', method: 'firecrawl', enabled: true },
    { name: 'fred', type: 'data+charts', url: 'fred.stlouisfed.org', method: 'playwright', enabled: true },
    { name: 'factset', type: 'earnings', url: 'insight.factset.com', method: 'firecrawl', enabled: true },
    { name: 'brave', type: 'headlines', query: 'weekly market recap', method: 'brave_search', enabled: true },
    { name: 'exa', type: 'research', query: 'institutional strategy research', method: 'exa', enabled: true },
  ],
  focusAssets: ['S&P 500', 'Nasdaq 100', 'Gold', 'US 10Y', 'EUR/USD', 'VIX', 'Bitcoin', 'STOXX 600'],
  narrativeCount: 3,
  presentationPalette: 'swiss_institutional',
  outputDir: './output/strategy',
  scrapedChartsDir: './output/strategy/charts',
  generatePresentation: true,
};

// ============================================================================
// Memory Horizon Types
// ============================================================================

export type MemoryHorizon = 'weekly' | 'monthly' | 'annual' | 'history';

export interface HorizonConfig {
  horizon: MemoryHorizon;
  stability: number;         // S value in days
  tags: string[];            // Base tags for this horizon
}

export const HORIZON_CONFIGS: Record<MemoryHorizon, HorizonConfig> = {
  weekly:  { horizon: 'weekly',  stability: 7,    tags: ['market', 'weekly'] },
  monthly: { horizon: 'monthly', stability: 90,   tags: ['market', 'monthly'] },
  annual:  { horizon: 'annual',  stability: 365,  tags: ['market', 'annual'] },
  history: { horizon: 'history', stability: 3650, tags: ['market', 'history'] },
};

// ============================================================================
// Historical Analogue
// ============================================================================

export interface HistoricalAnalogue {
  concept: string;              // "market-crisis-2008-gfc"
  definition: string;           // Human-readable description
  properties: Record<string, any>;
  tags: string[];
}

// ============================================================================
// Prediction Tracking (Loop 1: Feedback)
// ============================================================================

export interface Prediction {
  id: string;
  week: string;                 // "2026-W06"
  date: string;                 // "2026-02-07"
  assetClass: string;           // "US Equities"
  position: 'long' | 'short' | 'neutral';
  conviction: 'high' | 'medium' | 'low';
  rationale: string;
  entryPrice: number;
  entryTicker: string;          // "S&P 500" or proxy used
  timeframeWeeks: number;       // default 4
  scoredAt?: string;
  exitPrice?: number;
  outcome?: 'correct' | 'incorrect' | 'neutral' | 'pending';
  pnlPercent?: number;
}

export interface AssetClassScore {
  assetClass: string;
  hitRate: number;              // 0-1
  totalCalls: number;
  correct: number;
  incorrect: number;
  neutral: number;
  avgPnl: number;
  streak: number;               // positive = wins, negative = losses
  lastCall?: Prediction;
}

export interface TrackRecord {
  asOf: string;
  windowWeeks: number;          // 26 = rolling 6 months
  totalPredictions: number;
  scoredPredictions: number;
  overallHitRate: number;
  overallAvgPnl: number;
  byAssetClass: AssetClassScore[];
  bestAssetClass: string;
  worstAssetClass: string;
  brierScore?: number;          // 0 = perfect, 1 = worst (lower is better)
  calibrationGrade?: 'A' | 'B' | 'C' | 'D' | 'F';
  baseRateAlpha?: number;       // Hit rate minus base rate (positive = adding value)
}

export interface CalibrationProfile {
  asOf: string;
  adjustments: {
    assetClass: string;
    hitRate: number;
    suggestedConvictionCap: 'high' | 'medium' | 'low';
    note: string;
  }[];
}

// ============================================================================
// Named Theme Persistence (Item 16)
// ============================================================================

export type ThemeLifecycle = 'emerging' | 'strengthening' | 'mature' | 'weakening' | 'fading';

export interface NamedTheme {
  id: string;
  name: string;                  // "The Magnificent Seven Unwind"
  lifecycle: ThemeLifecycle;
  firstSeen: string;             // ISO date
  lastSeen: string;
  weekCount: number;             // how many weeks this theme has appeared
  confidence: number;            // 0-1
  relatedNarratives: string[];   // narrative IDs
  tags: string[];
}

/** Maps positioning asset classes to market data proxies */
export const ASSET_CLASS_PROXIES: Record<string, string> = {
  'US Equities': 'S&P 500',
  'European Equities': 'STOXX 600',
  'EM Equities': 'MSCI EM',
  'Gold': 'Gold',
  'USD': 'EUR/USD',
  'Crypto': 'Bitcoin',
  'US Treasuries': 'US 10Y',
  'Credit': 'US 10Y',
  'Oil': 'Oil WTI',
  'VIX': 'VIX',
};
