/**
 * Genesis 6.0 - Memory Consolidation Service
 *
 * Implements sleep-based memory consolidation:
 * - Episodic → Semantic (pattern extraction)
 * - Episodic → Procedural (skill learning)
 * - Forgetting weak memories
 * - Merging similar memories
 *
 * Inspired by:
 * - Memory consolidation during sleep (Walker & Stickgold, 2006)
 * - Systems consolidation theory (McClelland et al., 1995)
 * - Schema theory (Bartlett, 1932)
 */

import {
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
  ConsolidationResult,
  ConsolidationConfig,
  ConsolidationMode,
  MemoryEvent,
} from './types.js';
import { EpisodicStore } from './episodic.js';
import { SemanticStore } from './semantic.js';
import { ProceduralStore } from './procedural.js';
import {
  calculateRetention,
  FORGETTING_THRESHOLDS,
  calculateForgettingStats,
} from './forgetting.js';
import type { MetaMemory } from './meta-memory.js';
import { getLLMBridge } from '../llm/index.js';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ConsolidationConfig = {
  retentionThreshold: FORGETTING_THRESHOLDS.FORGET,
  consolidationThreshold: 0.7,
  mergeThreshold: 0.85,
  backgroundIntervalMs: 10 * 60 * 1000, // 10 minutes
  sleepDurationMs: 5 * 60 * 1000,       // 5 minutes (simulated)
  maxEpisodicAge: 30,                    // 30 days
  maxSemanticSize: 50000,
};

// ============================================================================
// Consolidation Service
// ============================================================================

export class ConsolidationService {
  private episodicStore: EpisodicStore;
  private semanticStore: SemanticStore;
  private proceduralStore: ProceduralStore;
  private config: ConsolidationConfig;
  private metaMemory: MetaMemory | null;

  private backgroundTimer: NodeJS.Timeout | null = null;
  private isConsolidating: boolean = false;
  private currentConsolidationPromise: Promise<ConsolidationResult> | null = null;  // v13.9: Race condition fix
  private lastConsolidation: Date | null = null;
  private consolidationHistory: ConsolidationResult[] = [];
  private eventLog: MemoryEvent[] = [];

  constructor(
    episodicStore: EpisodicStore,
    semanticStore: SemanticStore,
    proceduralStore: ProceduralStore,
    config: Partial<ConsolidationConfig> = {},
    metaMemory?: MetaMemory
  ) {
    this.episodicStore = episodicStore;
    this.semanticStore = semanticStore;
    this.proceduralStore = proceduralStore;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metaMemory = metaMemory || null;
  }

  // ============================================================================
  // Main Consolidation Methods
  // ============================================================================

  /**
   * Run full consolidation cycle (sleep mode)
   */
  async sleep(): Promise<ConsolidationResult> {
    return this.consolidate('sleep');
  }

  /**
   * Run quick consolidation (background)
   */
  async backgroundConsolidate(): Promise<ConsolidationResult> {
    return this.consolidate('background');
  }

  /**
   * Run immediate consolidation for specific memories
   */
  async immediateConsolidate(episodeIds: string[]): Promise<ConsolidationResult> {
    const episodes = episodeIds
      .map((id) => this.episodicStore.peek(id))
      .filter((e): e is EpisodicMemory => e !== undefined);

    return this.processEpisodes(episodes, 'immediate');
  }

  /**
   * Core consolidation logic
   * v13.9: Fixed race condition - returns ongoing promise instead of throwing
   */
  private async consolidate(mode: ConsolidationMode): Promise<ConsolidationResult> {
    // v13.9: If consolidation already in progress, return the ongoing promise
    // This prevents race conditions when multiple callers try to consolidate simultaneously
    if (this.isConsolidating && this.currentConsolidationPromise) {
      return this.currentConsolidationPromise;
    }

    this.isConsolidating = true;
    const startTime = Date.now();

    // Create and store the promise for potential concurrent access
    this.currentConsolidationPromise = (async () => {
      try {
        // Get episodes ready for consolidation
        const episodes = mode === 'background'
          ? this.episodicStore.getReadyForConsolidation(this.config.consolidationThreshold)
          : this.episodicStore.getAll().filter((e) => !e.consolidated);

        // Process episodes
        const result = await this.processEpisodes(episodes, mode);

        // Run forgetting
        const forgottenEpisodic = this.episodicStore.runForgetting();
        const forgottenSemantic = this.semanticStore.runForgetting();
        const forgottenProcedural = this.proceduralStore.runForgetting();

        result.forgotten = forgottenEpisodic.forgotten +
                           forgottenSemantic.forgotten +
                           forgottenProcedural.forgotten;

        result.duration = Date.now() - startTime;
        result.timestamp = new Date();

        // Record history
        this.consolidationHistory.push(result);
        if (this.consolidationHistory.length > 100) {
          this.consolidationHistory.shift();
        }

        this.lastConsolidation = new Date();
        return result;
      } finally {
        this.isConsolidating = false;
        this.currentConsolidationPromise = null;
      }
    })();

    return this.currentConsolidationPromise;
  }

  /**
   * Process a batch of episodes
   */
  private async processEpisodes(
    episodes: EpisodicMemory[],
    mode: ConsolidationMode
  ): Promise<ConsolidationResult> {
    const result: ConsolidationResult = {
      mode,
      timestamp: new Date(),
      duration: 0,
      episodicProcessed: 0,
      semanticCreated: 0,
      proceduralUpdated: 0,
      forgotten: 0,
      merged: 0,
      newFacts: [],
      updatedSkills: [],
    };

    // Group episodes by similarity for pattern extraction
    const groups = this.groupSimilarEpisodes(episodes);

    for (const group of groups) {
      result.episodicProcessed += group.length;

      // Extract patterns from group
      if (group.length >= 2) {
        // Multiple similar episodes -> extract semantic fact
        // v12.0: Try LLM extraction first, fallback to keyword-based
        const facts = await this.extractFactWithLLM(group);
        if (facts.length > 0) {
          for (const fact of facts) {
            const created = this.semanticStore.createFact(fact);
            result.semanticCreated++;
            result.newFacts.push(created.id);
            this.logEvent('CONSOLIDATE', created.id, 'semantic');
            // v14.0: Notify MetaMemory of new fact
            this.metaMemory?.onFactCreated(created, {
              type: 'llm_extraction',
              origin: 'consolidation',
              reliability: 0.8,
            });
          }
        } else {
          // Fallback: keyword-based extraction
          const fact = this.extractFact(group);
          if (fact) {
            const created = this.semanticStore.createFact(fact);
            result.semanticCreated++;
            result.newFacts.push(created.id);
            this.logEvent('CONSOLIDATE', created.id, 'semantic');
            // v14.0: Notify MetaMemory of new fact
            this.metaMemory?.onFactCreated(created, {
              type: 'consolidation',
              origin: 'keyword-extraction',
              reliability: 0.6,
            });
          }
        }

        // Check for procedural patterns
        const procedure = this.extractProcedure(group);
        if (procedure) {
          const skill = this.proceduralStore.createSkill(procedure);
          result.proceduralUpdated++;
          result.updatedSkills.push(skill.id);
          this.logEvent('CONSOLIDATE', skill.id, 'procedural');
        }

        // Merge similar episodes
        if (group.length > 3) {
          const merged = this.mergeEpisodes(group);
          result.merged += group.length - 1;
          for (const e of group.slice(1)) {
            this.episodicStore.delete(e.id);
            this.logEvent('MERGE', e.id, 'episodic');
          }
        }
      }

      // Mark as consolidated
      for (const episode of group) {
        this.episodicStore.update(episode.id, { consolidated: true });
      }
    }

    return result;
  }

  // ============================================================================
  // Pattern Extraction
  // ============================================================================

  /**
   * Group similar episodes together
   * v9.4.0: Optimized from O(n²) to O(n) using hash-based bucketing
   */
  private groupSimilarEpisodes(episodes: EpisodicMemory[]): EpisodicMemory[][] {
    if (episodes.length === 0) return [];
    if (episodes.length < 20) {
      // For small sets, use simple O(n²) approach - overhead of bucketing not worth it
      return this.groupSimilarEpisodesSimple(episodes);
    }

    // Phase 1: Hash-based bucketing O(n)
    // Group episodes by coarse-grained similarity key
    const buckets = new Map<string, EpisodicMemory[]>();

    for (const episode of episodes) {
      const bucketKey = this.getEpisodeBucketKey(episode);
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, []);
      }
      buckets.get(bucketKey)!.push(episode);
    }

    // Phase 2: Fine-grained grouping within buckets O(n*m) where m is avg bucket size
    const groups: EpisodicMemory[][] = [];
    const used = new Set<string>();

    for (const bucket of buckets.values()) {
      // Within each bucket, do fine-grained similarity check
      for (const episode of bucket) {
        if (used.has(episode.id)) continue;

        const group = [episode];
        used.add(episode.id);

        // Only compare within the same bucket (much smaller n)
        for (const other of bucket) {
          if (used.has(other.id)) continue;
          if (this.episodeSimilarity(episode, other) >= this.config.mergeThreshold) {
            group.push(other);
            used.add(other.id);
          }
        }

        groups.push(group);
      }
    }

    return groups;
  }

  /**
   * Simple O(n²) grouping for small episode sets
   */
  private groupSimilarEpisodesSimple(episodes: EpisodicMemory[]): EpisodicMemory[][] {
    const groups: EpisodicMemory[][] = [];
    const used = new Set<string>();

    for (const episode of episodes) {
      if (used.has(episode.id)) continue;

      const group = [episode];
      used.add(episode.id);

      for (const other of episodes) {
        if (used.has(other.id)) continue;
        if (this.episodeSimilarity(episode, other) >= this.config.mergeThreshold) {
          group.push(other);
          used.add(other.id);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /**
   * Generate bucket key for episode (coarse-grained similarity hash)
   * Episodes with same bucket key are likely similar
   */
  private getEpisodeBucketKey(episode: EpisodicMemory): string {
    // Use top 3 tags (sorted for consistency)
    const topTags = [...episode.tags].sort().slice(0, 3).join('|') || 'no-tags';

    // Use location
    const location = episode.where?.location || 'no-location';

    // Use hour of day (group by time proximity)
    const hour = new Date(episode.when.timestamp).toISOString().slice(0, 13); // YYYY-MM-DDTHH

    return `${topTags}:${location}:${hour}`;
  }

  /**
   * Calculate similarity between two episodes
   */
  private episodeSimilarity(a: EpisodicMemory, b: EpisodicMemory): number {
    let score = 0;
    let factors = 0;

    // Content similarity (simplified - would use embeddings in production)
    const contentA = JSON.stringify(a.content).toLowerCase();
    const contentB = JSON.stringify(b.content).toLowerCase();
    const wordsA = new Set(contentA.split(/\s+/));
    const wordsB = new Set(contentB.split(/\s+/));
    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    if (union.size > 0) {
      score += intersection.size / union.size;
      factors++;
    }

    // Tag similarity
    if (a.tags.length > 0 || b.tags.length > 0) {
      const tagsA = new Set(a.tags);
      const tagsB = new Set(b.tags);
      const tagIntersection = new Set([...tagsA].filter((t) => tagsB.has(t)));
      const tagUnion = new Set([...tagsA, ...tagsB]);
      if (tagUnion.size > 0) {
        score += tagIntersection.size / tagUnion.size;
        factors++;
      }
    }

    // Location similarity
    if (a.where && b.where) {
      if (a.where.location === b.where.location) {
        score += 1;
      }
      factors++;
    }

    // Agent similarity
    if (a.who && b.who) {
      const agentsA = new Set(a.who.agents);
      const agentsB = new Set(b.who.agents);
      const agentIntersection = new Set([...agentsA].filter((ag) => agentsB.has(ag)));
      const agentUnion = new Set([...agentsA, ...agentsB]);
      if (agentUnion.size > 0) {
        score += agentIntersection.size / agentUnion.size;
        factors++;
      }
    }

    return factors > 0 ? score / factors : 0;
  }

  // ============================================================================
  // LLM-Powered Fact Extraction (v12.0)
  // ============================================================================

  /**
   * Extract atomic facts from episodes using LLM.
   * Returns structured facts with concept, definition, confidence, and relations.
   * Falls back to empty array if LLM unavailable.
   */
  private async extractFactWithLLM(episodes: EpisodicMemory[]): Promise<Array<{
    concept: string;
    definition: string;
    category: string;
    confidence: number;
    sources: string[];
    importance: number;
    tags: string[];
  }>> {
    try {
      const summaries = episodes.map(e =>
        `[${e.when.timestamp.toISOString().slice(0, 10)}] ${e.content.what}`
      ).join('\n');

      const systemPrompt = `Extract atomic factual knowledge from these experiences.
Return JSON: {"facts": [{"concept": "short_name", "definition": "one sentence factual statement", "confidence": 0.0-1.0, "category": "topic_category", "relations": [{"to": "other_concept", "type": "is_a|part_of|causes|related_to"}]}]}
Rules:
- Extract ONLY factual knowledge, not events
- Each fact should be a general truth learned from the episodes
- Confidence reflects how certain the fact is (more episodes = higher confidence)
- Maximum 5 facts per batch
- Categories should be descriptive (e.g., "programming", "system_design", "user_behavior")`;

      // v14.0: Use Genesis LLMBridge instead of hardcoded OpenAI fetch
      const bridge = getLLMBridge();
      const response = await bridge.chat(summaries, systemPrompt);
      const content = response.content;
      if (!content) return [];

      // Extract JSON from response (may be wrapped in markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed?.facts || !Array.isArray(parsed.facts)) return [];

      return parsed.facts.slice(0, 5).map((f: any) => ({
        concept: String(f.concept || '').slice(0, 100),
        definition: String(f.definition || '').slice(0, 500),
        category: String(f.category || 'extracted'),
        confidence: Math.min(1, Math.max(0, Number(f.confidence) || 0.6)),
        sources: episodes.map(e => e.id),
        importance: episodes.reduce((s, e) => s + e.importance, 0) / episodes.length,
        tags: episodes.flatMap(e => e.tags).filter((t, i, arr) => arr.indexOf(t) === i).slice(0, 5),
      }));
    } catch {
      return []; // LLM unavailable, caller will use keyword fallback
    }
  }

  /**
   * Extract a semantic fact from a group of similar episodes
   */
  private extractFact(episodes: EpisodicMemory[]): {
    concept: string;
    definition?: string;
    properties: Record<string, any>;
    category: string;
    sources: string[];
    importance: number;
    tags: string[];
  } | null {
    if (episodes.length < 2) return null;

    // Find common elements
    const allTags = new Map<string, number>();
    const allContent: string[] = [];
    let totalImportance = 0;

    for (const e of episodes) {
      for (const tag of e.tags) {
        allTags.set(tag, (allTags.get(tag) || 0) + 1);
      }
      allContent.push(e.content.what);
      totalImportance += e.importance;
    }

    // Most common tags become the concept
    const sortedTags = [...allTags.entries()]
      .sort((a, b) => b[1] - a[1]);

    if (sortedTags.length === 0) {
      // Use content analysis
      const words = allContent.join(' ').toLowerCase().split(/\s+/);
      const wordFreq = new Map<string, number>();
      for (const word of words) {
        if (word.length > 3) { // Skip short words
          wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
        }
      }
      const topWord = [...wordFreq.entries()]
        .sort((a, b) => b[1] - a[1])[0];
      if (!topWord) return null;
      sortedTags.push([topWord[0], topWord[1]]);
    }

    const mainConcept = sortedTags[0][0];

    return {
      concept: mainConcept,
      definition: `Observed pattern from ${episodes.length} episodes`,
      properties: {
        occurrences: episodes.length,
        timeSpan: {
          first: episodes[0].when.timestamp,
          last: episodes[episodes.length - 1].when.timestamp,
        },
        sources: episodes.map((e) => e.id),
      },
      category: 'extracted',
      sources: episodes.map((e) => e.id),
      importance: totalImportance / episodes.length,
      tags: sortedTags.slice(0, 5).map(([tag]) => tag),
    };
  }

  /**
   * Extract a procedural skill from a group of similar episodes
   */
  private extractProcedure(episodes: EpisodicMemory[]): {
    name: string;
    description: string;
    steps: Array<{ action: string }>;
    importance: number;
    tags: string[];
  } | null {
    if (episodes.length < 3) return null;

    // Look for sequential patterns
    const sortedEpisodes = [...episodes].sort(
      (a, b) => a.when.timestamp.getTime() - b.when.timestamp.getTime()
    );

    // Check if episodes form a sequence (within a session)
    const timeDiffs: number[] = [];
    for (let i = 1; i < sortedEpisodes.length; i++) {
      const diff = sortedEpisodes[i].when.timestamp.getTime() -
                   sortedEpisodes[i - 1].when.timestamp.getTime();
      timeDiffs.push(diff);
    }

    // If episodes are too spread out, not a procedure
    const avgTimeDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
    if (avgTimeDiff > 60 * 60 * 1000) { // More than 1 hour apart on average
      return null;
    }

    // Extract steps from episode sequence
    const steps = sortedEpisodes.map((e) => ({
      action: e.content.what,
    }));

    // Common tags become the skill name
    const allTags = new Set<string>();
    for (const e of sortedEpisodes) {
      for (const t of e.tags) allTags.add(t);
    }

    const name = [...allTags][0] || 'extracted-procedure';

    return {
      name: `${name}-workflow`,
      description: `Workflow extracted from ${episodes.length} sequential episodes`,
      steps,
      importance: sortedEpisodes.reduce((sum, e) => sum + e.importance, 0) / sortedEpisodes.length,
      tags: [...allTags],
    };
  }

  /**
   * Merge multiple similar episodes into one
   */
  private mergeEpisodes(episodes: EpisodicMemory[]): EpisodicMemory {
    const first = episodes[0];

    // Combine content
    const mergedContent = {
      what: `Merged: ${first.content.what} (${episodes.length} occurrences)`,
      details: {
        originalCount: episodes.length,
        mergedFrom: episodes.map((e) => e.id),
        timeRange: {
          first: episodes[0].when.timestamp,
          last: episodes[episodes.length - 1].when.timestamp,
        },
      },
    };

    // Update first episode with merged content
    this.episodicStore.update(first.id, {
      content: mergedContent,
      importance: Math.max(...episodes.map((e) => e.importance)),
      S: Math.max(...episodes.map((e) => e.S)), // Keep strongest stability
    });

    return first;
  }

  // ============================================================================
  // Background Consolidation
  // ============================================================================

  /**
   * Start background consolidation timer
   */
  startBackground(): void {
    if (this.backgroundTimer) return;

    this.backgroundTimer = setInterval(async () => {
      try {
        await this.backgroundConsolidate();
      } catch (error) {
        console.error('[Consolidation] Background error:', error);
      }
    }, this.config.backgroundIntervalMs);
  }

  /**
   * Stop background consolidation
   */
  stopBackground(): void {
    if (this.backgroundTimer) {
      clearInterval(this.backgroundTimer);
      this.backgroundTimer = null;
    }
  }

  /**
   * Check if background consolidation is running
   */
  isBackgroundRunning(): boolean {
    return this.backgroundTimer !== null;
  }

  // ============================================================================
  // Event Logging
  // ============================================================================

  private logEvent(type: MemoryEvent['type'], memoryId: string, memoryType: MemoryEvent['memoryType']): void {
    this.eventLog.push({
      type,
      memoryId,
      memoryType,
      timestamp: new Date(),
    });

    // Keep log bounded
    if (this.eventLog.length > 1000) {
      this.eventLog.shift();
    }
  }

  // ============================================================================
  // Stats and History
  // ============================================================================

  getStats(): {
    lastConsolidation: Date | null;
    isConsolidating: boolean;
    backgroundRunning: boolean;
    totalConsolidations: number;
    recentResults: ConsolidationResult[];
    memoryStats: {
      episodic: ReturnType<typeof calculateForgettingStats>;
      semantic: ReturnType<typeof calculateForgettingStats>;
      procedural: ReturnType<typeof calculateForgettingStats>;
    };
  } {
    return {
      lastConsolidation: this.lastConsolidation,
      isConsolidating: this.isConsolidating,
      backgroundRunning: this.isBackgroundRunning(),
      totalConsolidations: this.consolidationHistory.length,
      recentResults: this.consolidationHistory.slice(-10),
      memoryStats: {
        episodic: calculateForgettingStats(this.episodicStore.getAll()),
        semantic: calculateForgettingStats(this.semanticStore.getAll()),
        procedural: calculateForgettingStats(this.proceduralStore.getAll()),
      },
    };
  }

  getHistory(limit?: number): ConsolidationResult[] {
    if (limit) {
      return this.consolidationHistory.slice(-limit);
    }
    return [...this.consolidationHistory];
  }

  getEventLog(limit?: number): MemoryEvent[] {
    if (limit) {
      return this.eventLog.slice(-limit);
    }
    return [...this.eventLog];
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createConsolidationService(
  episodicStore: EpisodicStore,
  semanticStore: SemanticStore,
  proceduralStore: ProceduralStore,
  config?: Partial<ConsolidationConfig>,
  metaMemory?: MetaMemory
): ConsolidationService {
  return new ConsolidationService(episodicStore, semanticStore, proceduralStore, config, metaMemory);
}
