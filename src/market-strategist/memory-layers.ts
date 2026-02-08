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
  Prediction,
  TrackRecord,
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
  async recallContext(query: string, options?: {
    weeks?: number;
    months?: number;
    years?: number;
  }): Promise<{
    recentWeeks: EpisodicMemory[];
    monthlyTrends: SemanticMemory[];
    annualThemes: SemanticMemory[];
    historicalAnalogues: SemanticMemory[];
  }> {
    const weeks = options?.weeks ?? 4;
    const months = options?.months ?? 6;
    const years = options?.years ?? 3;

    return {
      recentWeeks: this.getRecentWeeks(weeks),
      monthlyTrends: this.getMonthlyTrends(months),
      annualThemes: this.getAnnualThemes(years),
      historicalAnalogues: this.getHistoricalAnalogues(query),
    };
  }

  /**
   * Get count of memories per horizon layer
   */
  getStats(): { weekly: number; monthly: number; annual: number; history: number } {
    const weekly = this.memory.episodic
      .query({ tags: ['market', 'weekly'] }).length;
    const monthly = this.memory.semantic
      .query({ custom: (m) => m.tags.includes('market') && m.tags.includes('monthly') }).length;
    const annual = this.memory.semantic
      .query({ custom: (m) => m.tags.includes('market') && m.tags.includes('annual') }).length;
    const history = this.memory.semantic
      .query({ custom: (m) => m.tags.includes('market') && m.tags.includes('history') }).length;

    return { weekly, monthly, annual, history };
  }

  // ==========================================================================
  // Prediction Store/Retrieve (Loop 1: Feedback)
  // ==========================================================================

  /**
   * Store batch of predictions from a weekly brief
   */
  storePredictions(predictions: Prediction[]): void {
    if (predictions.length === 0) return;

    const week = predictions[0].week;
    this.memory.remember({
      what: `Predictions for ${week}: ${predictions.map(p => `${p.assetClass}=${p.position}(${p.conviction})`).join(', ')}`,
      details: { predictions, week },
      when: new Date(predictions[0].date),
      importance: 0.8,
      tags: ['market', 'predictions', week],
      source: 'feedback-engine',
    });
  }

  /**
   * Update a scored prediction in memory
   */
  updatePrediction(scored: Prediction): void {
    this.memory.remember({
      what: `Scored prediction ${scored.assetClass}: ${scored.outcome} (${scored.pnlPercent?.toFixed(1)}%)`,
      details: scored,
      when: new Date(scored.scoredAt || new Date()),
      importance: 0.85,
      tags: ['market', 'prediction-scored', scored.week, `outcome:${scored.outcome}`],
      source: 'feedback-engine',
    });
  }

  /**
   * Store a computed track record
   */
  storeTrackRecord(record: TrackRecord): void {
    const fact = this.memory.learn({
      concept: `track-record-${record.asOf}`,
      definition: `Overall hit rate: ${(record.overallHitRate * 100).toFixed(0)}% on ${record.scoredPredictions} calls. Best: ${record.bestAssetClass}. Worst: ${record.worstAssetClass}.`,
      properties: record,
      category: 'market-feedback',
      tags: ['market', 'track-record', record.asOf],
      confidence: 0.9,
      importance: 0.9,
    });

    this.overrideStability(fact, 365); // Keep track records for a year
  }

  /**
   * Get all pending (unscored) predictions
   */
  getPendingPredictions(): Prediction[] {
    const episodes = this.memory.episodic
      .query({ tags: ['market', 'predictions'] });

    const allPredictions: Prediction[] = [];
    for (const ep of episodes) {
      const preds = ep.content.details?.predictions;
      if (Array.isArray(preds)) {
        allPredictions.push(...preds.filter((p: Prediction) => p.outcome === 'pending'));
      }
    }

    return allPredictions;
  }

  /**
   * Get all predictions (for track record computation)
   */
  getAllPredictions(): Prediction[] {
    const predictions: Prediction[] = [];

    // From prediction batches
    const batches = this.memory.episodic
      .query({ tags: ['market', 'predictions'] });
    for (const ep of batches) {
      const preds = ep.content.details?.predictions;
      if (Array.isArray(preds)) {
        predictions.push(...preds);
      }
    }

    // From scored individual predictions (these override batch versions)
    const scored = this.memory.episodic
      .query({ tags: ['market', 'prediction-scored'] });
    const scoredById = new Map<string, Prediction>();
    for (const ep of scored) {
      const pred = ep.content.details as Prediction;
      if (pred?.id) scoredById.set(pred.id, pred);
    }

    // Merge: scored versions override batch versions
    return predictions.map(p => scoredById.get(p.id) || p);
  }

  /**
   * Get the latest track record
   */
  getLatestTrackRecord(): TrackRecord | null {
    const records = this.memory.semantic
      .query({
        custom: (m) => m.tags.includes('market') && m.tags.includes('track-record'),
      })
      .sort((a, b) => {
        const dateA = a.content.properties?.asOf || '';
        const dateB = b.content.properties?.asOf || '';
        return dateB.localeCompare(dateA);
      });

    if (records.length === 0) return null;
    return records[0].content.properties as TrackRecord;
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
