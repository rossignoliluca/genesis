/**
 * Genesis v12.0 - Meta-Memory Layer
 *
 * Tracks what the system knows ABOUT its own memory:
 * - Confidence: how certain is a fact?
 * - Coverage: how much do we know about a topic?
 * - Provenance: where did this information come from?
 * - Contradictions: conflicting facts detected
 * - Staleness: how outdated is our knowledge?
 *
 * This enables metacognitive questions:
 * - "Do I know enough about X to answer?"
 * - "Is this fact reliable?"
 * - "Are there conflicting beliefs?"
 * - "What topics need more research?"
 *
 * References:
 * - Nelson & Narens (1990): Metamemory framework
 * - Flavell (1979): Metacognition
 * - Koriat (2007): Monitoring and control in memory
 */

import type { SemanticMemory, EpisodicMemory } from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface MetaEntry {
  topic: string;
  confidence: number;       // 0-1: weighted average of fact confidences
  coverage: number;         // 0-1: facts_known / expected_facts
  factCount: number;        // number of facts on this topic
  sourceCount: number;      // number of unique sources
  staleness: number;        // days since last update
  lastUpdated: Date;
  contradictions: number;   // number of detected contradictions
}

export interface Contradiction {
  id: string;
  factA: { id: string; concept: string; definition: string; confidence: number };
  factB: { id: string; concept: string; definition: string; confidence: number };
  detected: Date;
  resolved: boolean;
  resolution?: 'factA_wins' | 'factB_wins' | 'both_valid' | 'merged';
}

export interface ProvenanceRecord {
  factId: string;
  concept: string;
  sources: Array<{
    type: 'observation' | 'consolidation' | 'llm_extraction' | 'user_input' | 'mcp_tool';
    origin: string;         // Which tool/episode/user provided this
    timestamp: Date;
    reliability: number;    // 0-1: how reliable is this source?
  }>;
  versionHistory: Array<{
    definition: string;
    validFrom: Date;
    validUntil: Date | null;
    confidence: number;
  }>;
}

export interface MetaMemoryConfig {
  /** Expected facts per topic for coverage calculation */
  expectedFactsPerTopic: number;
  /** Staleness threshold in days */
  stalenessThresholdDays: number;
  /** Minimum confidence to consider "known" */
  knownConfidenceThreshold: number;
  /** Minimum facts to consider topic "covered" */
  minFactsForCoverage: number;
  /** Log meta-memory operations */
  verbose: boolean;
}

export const DEFAULT_META_CONFIG: MetaMemoryConfig = {
  expectedFactsPerTopic: 10,
  stalenessThresholdDays: 30,
  knownConfidenceThreshold: 0.5,
  minFactsForCoverage: 3,
  verbose: false,
};

export interface KnowledgeAssessment {
  knows: boolean;
  confidence: number;
  coverage: number;
  gaps: string[];
  contradictions: Contradiction[];
  staleness: number;
  recommendation: 'sufficient' | 'needs_research' | 'outdated' | 'contradictory' | 'unknown';
}

// ============================================================================
// Meta-Memory
// ============================================================================

export class MetaMemory {
  private config: MetaMemoryConfig;
  private topicEntries: Map<string, MetaEntry> = new Map();
  private contradictions: Contradiction[] = [];
  private provenance: Map<string, ProvenanceRecord> = new Map();
  private totalFacts: number = 0;

  constructor(config?: Partial<MetaMemoryConfig>) {
    this.config = { ...DEFAULT_META_CONFIG, ...config };
  }

  // ============================================================================
  // Fact Tracking
  // ============================================================================

  /**
   * Called when a new fact is created or updated.
   * Updates topic coverage, confidence, and checks for contradictions.
   */
  onFactCreated(fact: SemanticMemory, source?: {
    type: 'observation' | 'consolidation' | 'llm_extraction' | 'user_input' | 'mcp_tool';
    origin: string;
    reliability?: number;
  }): { contradiction?: Contradiction } {
    this.totalFacts++;
    const topic = fact.category || 'general';
    const concept = fact.content.concept;
    const definition = fact.content.definition || '';

    // Update topic entry
    const entry = this.topicEntries.get(topic) || this.createEntry(topic);
    entry.factCount++;
    entry.confidence = this.updateRunningAvg(entry.confidence, fact.confidence || 0.5, entry.factCount);
    entry.coverage = Math.min(1.0, entry.factCount / this.config.expectedFactsPerTopic);
    entry.lastUpdated = new Date();
    entry.staleness = 0;
    if (source) entry.sourceCount++;
    this.topicEntries.set(topic, entry);

    // Track provenance
    if (source) {
      const record: ProvenanceRecord = this.provenance.get(fact.id) || {
        factId: fact.id,
        concept,
        sources: [],
        versionHistory: [],
      };
      record.sources.push({
        type: source.type,
        origin: source.origin,
        timestamp: new Date(),
        reliability: source.reliability || 0.7,
      });
      record.versionHistory.push({
        definition,
        validFrom: new Date(),
        validUntil: null,
        confidence: fact.confidence || 0.5,
      });
      this.provenance.set(fact.id, record);
    }

    return {};
  }

  /**
   * Check if a new fact contradicts an existing one.
   * Called before storing a fact to detect conflicts.
   */
  checkContradiction(
    newFact: { concept: string; definition: string; confidence?: number },
    existingFact: { id: string; concept: string; definition: string; confidence?: number }
  ): Contradiction | null {
    // Same concept, different definition = potential contradiction
    if (newFact.concept === existingFact.concept &&
        newFact.definition !== existingFact.definition) {

      // If definitions are substantially different (not just minor rewording)
      const similarity = this.textSimilarity(newFact.definition, existingFact.definition);
      if (similarity < 0.8) {
        const contradiction: Contradiction = {
          id: `contra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          factA: {
            id: existingFact.id,
            concept: existingFact.concept,
            definition: existingFact.definition,
            confidence: existingFact.confidence || 0.5,
          },
          factB: {
            id: `new-${Date.now()}`,
            concept: newFact.concept,
            definition: newFact.definition,
            confidence: newFact.confidence || 0.5,
          },
          detected: new Date(),
          resolved: false,
        };

        this.contradictions.push(contradiction);

        // Update topic contradiction count
        const topic = this.findTopicForConcept(newFact.concept);
        if (topic) {
          const entry = this.topicEntries.get(topic);
          if (entry) entry.contradictions++;
        }

        if (this.config.verbose) {
          console.log(`[MetaMemory] Contradiction detected: "${newFact.concept}" has conflicting definitions`);
        }

        return contradiction;
      }
    }
    return null;
  }

  /**
   * Resolve a contradiction.
   */
  resolveContradiction(
    contradictionId: string,
    resolution: 'factA_wins' | 'factB_wins' | 'both_valid' | 'merged'
  ): boolean {
    const idx = this.contradictions.findIndex(c => c.id === contradictionId);
    if (idx === -1) return false;

    this.contradictions[idx].resolved = true;
    this.contradictions[idx].resolution = resolution;

    // Update topic contradiction count
    const topic = this.findTopicForConcept(this.contradictions[idx].factA.concept);
    if (topic) {
      const entry = this.topicEntries.get(topic);
      if (entry && entry.contradictions > 0) entry.contradictions--;
    }

    return true;
  }

  // ============================================================================
  // Knowledge Assessment
  // ============================================================================

  /**
   * "Do I know about X?" — metacognitive query.
   * Returns confidence, coverage, gaps, and recommendation.
   */
  knowsAbout(topic: string): KnowledgeAssessment {
    const entry = this.topicEntries.get(topic);

    if (!entry || entry.factCount < this.config.minFactsForCoverage) {
      return {
        knows: false,
        confidence: 0,
        coverage: 0,
        gaps: [topic],
        contradictions: [],
        staleness: Infinity,
        recommendation: 'unknown',
      };
    }

    const topicContradictions = this.contradictions.filter(c =>
      !c.resolved && this.findTopicForConcept(c.factA.concept) === topic
    );

    // Calculate staleness
    const daysSinceUpdate = (Date.now() - entry.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    entry.staleness = daysSinceUpdate;

    // Determine recommendation
    let recommendation: KnowledgeAssessment['recommendation'];
    if (topicContradictions.length > 0) {
      recommendation = 'contradictory';
    } else if (daysSinceUpdate > this.config.stalenessThresholdDays) {
      recommendation = 'outdated';
    } else if (entry.coverage < 0.5 || entry.confidence < this.config.knownConfidenceThreshold) {
      recommendation = 'needs_research';
    } else {
      recommendation = 'sufficient';
    }

    return {
      knows: entry.confidence >= this.config.knownConfidenceThreshold,
      confidence: entry.confidence,
      coverage: entry.coverage,
      gaps: entry.coverage < 1.0 ? [`${topic} (${Math.round(entry.coverage * 100)}% covered)`] : [],
      contradictions: topicContradictions,
      staleness: daysSinceUpdate,
      recommendation,
    };
  }

  /**
   * Get all topics with low confidence or coverage.
   * Useful for deciding what to research next.
   */
  getKnowledgeGaps(): Array<{ topic: string; coverage: number; confidence: number; reason: string }> {
    const gaps: Array<{ topic: string; coverage: number; confidence: number; reason: string }> = [];

    for (const [topic, entry] of this.topicEntries) {
      if (entry.coverage < 0.5) {
        gaps.push({ topic, coverage: entry.coverage, confidence: entry.confidence, reason: 'low_coverage' });
      } else if (entry.confidence < this.config.knownConfidenceThreshold) {
        gaps.push({ topic, coverage: entry.coverage, confidence: entry.confidence, reason: 'low_confidence' });
      } else if (entry.staleness > this.config.stalenessThresholdDays) {
        gaps.push({ topic, coverage: entry.coverage, confidence: entry.confidence, reason: 'outdated' });
      } else if (entry.contradictions > 0) {
        gaps.push({ topic, coverage: entry.coverage, confidence: entry.confidence, reason: 'contradictions' });
      }
    }

    return gaps.sort((a, b) => a.coverage - b.coverage);
  }

  /**
   * Get provenance for a specific fact.
   */
  getProvenance(factId: string): ProvenanceRecord | undefined {
    return this.provenance.get(factId);
  }

  /**
   * Get unresolved contradictions.
   */
  getContradictions(resolved = false): Contradiction[] {
    return this.contradictions.filter(c => c.resolved === resolved);
  }

  // ============================================================================
  // Decay & Maintenance
  // ============================================================================

  /**
   * Update staleness for all topics (call periodically).
   */
  updateStaleness(): void {
    const now = Date.now();
    for (const [, entry] of this.topicEntries) {
      entry.staleness = (now - entry.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    }
  }

  // ============================================================================
  // Stats
  // ============================================================================

  getStats(): {
    topics: number;
    totalFacts: number;
    avgConfidence: number;
    avgCoverage: number;
    contradictions: number;
    unresolvedContradictions: number;
    knowledgeGaps: number;
  } {
    let totalConf = 0;
    let totalCov = 0;
    for (const entry of this.topicEntries.values()) {
      totalConf += entry.confidence;
      totalCov += entry.coverage;
    }
    const n = this.topicEntries.size || 1;

    return {
      topics: this.topicEntries.size,
      totalFacts: this.totalFacts,
      avgConfidence: totalConf / n,
      avgCoverage: totalCov / n,
      contradictions: this.contradictions.length,
      unresolvedContradictions: this.contradictions.filter(c => !c.resolved).length,
      knowledgeGaps: this.getKnowledgeGaps().length,
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private createEntry(topic: string): MetaEntry {
    return {
      topic,
      confidence: 0,
      coverage: 0,
      factCount: 0,
      sourceCount: 0,
      staleness: 0,
      lastUpdated: new Date(),
      contradictions: 0,
    };
  }

  private updateRunningAvg(current: number, newValue: number, count: number): number {
    return (current * (count - 1) + newValue) / count;
  }

  private findTopicForConcept(concept: string): string | null {
    // Simple: check if any topic entry mentions this concept
    // In practice, facts would store their category
    for (const [topic] of this.topicEntries) {
      if (concept.toLowerCase().includes(topic.toLowerCase()) ||
          topic.toLowerCase().includes(concept.toLowerCase())) {
        return topic;
      }
    }
    return null;
  }

  private textSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const intersection = [...wordsA].filter(w => wordsB.has(w));
    const union = new Set([...wordsA, ...wordsB]);
    return union.size === 0 ? 0 : intersection.length / union.size;
  }
}

// ============================================================================
// Factory & Singleton
// ============================================================================

let metaMemoryInstance: MetaMemory | null = null;

export function getMetaMemory(config?: Partial<MetaMemoryConfig>): MetaMemory {
  if (!metaMemoryInstance) {
    metaMemoryInstance = new MetaMemory(config);
  }
  return metaMemoryInstance;
}

export function createMetaMemory(config?: Partial<MetaMemoryConfig>): MetaMemory {
  return new MetaMemory(config);
}

export function resetMetaMemory(): void {
  metaMemoryInstance = null;
}
