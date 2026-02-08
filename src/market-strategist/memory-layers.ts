/**
 * Genesis v17.0 - Market Strategy Memory Layers
 *
 * 4-horizon memory wrapper that maps financial time horizons
 * onto Genesis's existing memory system using tags + stability (S).
 *
 * | Horizon  | Memory Type        | Tags              | Stability |
 * |----------|--------------------|-------------------|-----------|
 * | Short    | Episodic           | market, weekly     | S=7       |
 * | Medium   | Episodic→Semantic  | market, monthly    | S=90      |
 * | Long     | Semantic           | market, annual     | S=365     |
 * | History  | Semantic           | market, history    | S=3650    |
 */

import { getMemorySystem } from '../memory/index.js';
import type { MemorySystem } from '../memory/index.js';
import type { EpisodicMemory, SemanticMemory, Memory } from '../memory/types.js';
import type {
  WeeklySnapshot,
  NarrativeThread,
  HistoricalAnalogue,
  MemoryHorizon,
  HORIZON_CONFIGS,
} from './types.js';
import { HORIZON_CONFIGS as CONFIGS } from './types.js';

// ============================================================================
// Memory Layers
// ============================================================================

export class MemoryLayers {
  private memory: MemorySystem;

  constructor(memory?: MemorySystem) {
    this.memory = memory || getMemorySystem();
  }

  // ==========================================================================
  // Store Methods
  // ==========================================================================

  /**
   * Store weekly snapshot (short-term, S=7)
   */
  storeWeekly(snapshot: WeeklySnapshot): EpisodicMemory {
    const config = CONFIGS.weekly;
    const weekTag = snapshot.week; // e.g. "2026-W06"

    const episode = this.memory.remember({
      what: `Weekly market snapshot ${snapshot.week}`,
      details: snapshot,
      when: new Date(snapshot.date),
      importance: 0.7,
      tags: [...config.tags, weekTag],
      source: 'market-strategist',
    });

    // Override stability to match weekly horizon
    this.overrideStability(episode, config.stability);
    return episode;
  }

  /**
   * Store monthly narrative (medium-term, S=90)
   */
  storeMonthly(narrative: NarrativeThread): SemanticMemory {
    const config = CONFIGS.monthly;
    const monthTag = new Date().toISOString().slice(0, 7); // "2026-02"

    const fact = this.memory.learn({
      concept: `monthly-narrative-${narrative.id}`,
      definition: narrative.thesis,
      properties: {
        title: narrative.title,
        horizon: narrative.horizon,
        evidence: narrative.evidence,
        contrarian: narrative.contrarian,
        confidence: narrative.confidence,
        lastUpdated: narrative.lastUpdated,
      },
      category: 'market-monthly',
      tags: [...config.tags, monthTag],
      confidence: narrative.confidence,
      importance: 0.75,
    });

    this.overrideStability(fact, config.stability);
    return fact;
  }

  /**
   * Store annual theme (long-term, S=365)
   */
  storeAnnual(theme: { concept: string; properties: Record<string, any> }): SemanticMemory {
    const config = CONFIGS.annual;
    const yearTag = new Date().getFullYear().toString(); // "2026"

    const fact = this.memory.learn({
      concept: theme.concept,
      definition: theme.properties.definition || theme.concept,
      properties: theme.properties,
      category: 'market-annual',
      tags: [...config.tags, yearTag],
      confidence: 0.85,
      importance: 0.85,
    });

    this.overrideStability(fact, config.stability);
    return fact;
  }

  /**
   * Store historical analogue (eternal, S=3650)
   */
  storeHistorical(analogue: HistoricalAnalogue): SemanticMemory {
    const config = CONFIGS.history;

    const fact = this.memory.learn({
      concept: analogue.concept,
      definition: analogue.definition,
      properties: analogue.properties,
      category: 'market-history',
      tags: [...config.tags, ...analogue.tags],
      confidence: 0.95,
      importance: 0.95,
    });

    this.overrideStability(fact, config.stability);
    return fact;
  }

  // ==========================================================================
  // Retrieve Methods
  // ==========================================================================

  /**
   * Get recent weekly snapshots
   */
  getRecentWeeks(count: number): EpisodicMemory[] {
    return this.memory.episodic
      .query({ tags: ['market', 'weekly'] })
      .sort((a, b) => b.when.timestamp.getTime() - a.when.timestamp.getTime())
      .slice(0, count);
  }

  /**
   * Get monthly trends over N months
   */
  getMonthlyTrends(months: number): SemanticMemory[] {
    return this.memory.semantic
      .query({
        maxAge: months * 30,
        custom: (m) => m.tags.includes('market') && m.tags.includes('monthly'),
      });
  }

  /**
   * Get annual themes over N years
   */
  getAnnualThemes(years: number): SemanticMemory[] {
    return this.memory.semantic
      .query({
        maxAge: years * 365,
        custom: (m) => m.tags.includes('market') && m.tags.includes('annual'),
      });
  }

  /**
   * Get historical analogues matching a query
   */
  getHistoricalAnalogues(query: string): SemanticMemory[] {
    // Use custom filter requiring BOTH 'market' AND 'history' tags
    const allHistory = this.memory.semantic
      .query({
        custom: (m) => m.tags.includes('market') && m.tags.includes('history'),
      });

    if (!query) return allHistory;

    const lowerQuery = query.toLowerCase();
    return allHistory.filter(m =>
      m.content.concept.toLowerCase().includes(lowerQuery) ||
      (m.content.definition || '').toLowerCase().includes(lowerQuery) ||
      JSON.stringify(m.content.properties).toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Cross-horizon query: find relevant context across all 4 layers
   */
  async recallContext(query: string): Promise<{
    recentWeeks: EpisodicMemory[];
    monthlyTrends: SemanticMemory[];
    annualThemes: SemanticMemory[];
    historicalAnalogues: SemanticMemory[];
  }> {
    return {
      recentWeeks: this.getRecentWeeks(4),
      monthlyTrends: this.getMonthlyTrends(6),
      annualThemes: this.getAnnualThemes(3),
      historicalAnalogues: this.getHistoricalAnalogues(query),
    };
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  /**
   * Override the stability (S) field on a memory after creation.
   * The memory system calculates S from importance/valence, but our
   * horizon-based design needs specific S values.
   */
  private overrideStability(memory: EpisodicMemory | SemanticMemory, stability: number): void {
    if (memory.type === 'episodic') {
      this.memory.episodic.update(memory.id, { S: stability });
    } else {
      this.memory.semantic.update(memory.id, { S: stability });
    }
    memory.S = stability;
  }
}
