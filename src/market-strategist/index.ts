/**
 * Genesis Market Strategist Module
 *
 * Autonomous weekly market strategy brief generation with:
 * - Multi-source data collection (Brave, Exa, Firecrawl, Playwright)
 * - 4-layer memory system (weekly, monthly, annual, historical)
 * - Narrative synthesis from market themes
 * - Institutional-quality PPTX generation
 * - Content module integration for social publishing
 *
 * @module market-strategist
 * @version 17.0.0
 */

// =============================================================================
// Type Exports
// =============================================================================

export type {
  // Core data types
  AssetSnapshot,
  Headline,
  SentimentGauge,
  SourceRef,
  WeeklySnapshot,

  // Narrative types
  TimeHorizon,
  NarrativeThread,
  ThemeShift,
  PositioningView,

  // Market brief
  MarketBrief,

  // Source configuration
  SourceMethod,
  SourceConfig,
  ScrapedChart,
  ResearchSummary,

  // Strategy configuration
  StrategyConfig,

  // Memory types
  MemoryHorizon,
  HorizonConfig,
  HistoricalAnalogue,
} from './types.js';

export {
  DEFAULT_STRATEGY_CONFIG,
  HORIZON_CONFIGS,
} from './types.js';

// =============================================================================
// Core Components
// =============================================================================

export { MarketStrategist } from './strategist.js';
export { MarketCollector } from './collector.js';
export { MarketAnalyzer } from './analyzer.js';
export { MemoryLayers } from './memory-layers.js';

// =============================================================================
// Seed Memory
// =============================================================================

export { seedMarketStrategyMemory } from './seed-memory.js';

// =============================================================================
// Singleton Instance
// =============================================================================

import { MarketStrategist } from './strategist.js';
import type { StrategyConfig } from './types.js';

let strategistInstance: MarketStrategist | null = null;

/**
 * Get the singleton MarketStrategist instance
 */
export function getMarketStrategist(config?: Partial<StrategyConfig>): MarketStrategist {
  if (!strategistInstance) {
    strategistInstance = new MarketStrategist(config);
  }
  return strategistInstance;
}

/**
 * Reset the strategist instance (for testing)
 */
export function resetMarketStrategist(): void {
  strategistInstance = null;
}

// =============================================================================
// Quick Access Functions
// =============================================================================

/**
 * Generate a weekly market strategy brief
 */
export async function generateWeeklyBrief(config?: Partial<StrategyConfig>) {
  const strategist = getMarketStrategist(config);
  return strategist.generateWeeklyBrief();
}

/**
 * Process feedback on a brief
 */
export async function processBriefFeedback(feedback: string, briefWeek: string) {
  const strategist = getMarketStrategist();
  return strategist.processFeedback(feedback, briefWeek);
}
