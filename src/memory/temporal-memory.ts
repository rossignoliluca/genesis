/**
 * Genesis - Temporal Memory Module
 *
 * Self-editing memory with temporal fact tracking and conflict detection.
 *
 * Features:
 * - SPO (subject-predicate-object) triple representation
 * - Temporal bounds (validFrom, validTo) for point-in-time queries
 * - Automatic conflict detection with severity levels
 * - Self-editing: facts can update themselves, bumping version
 * - Auto-supersession: higher confidence facts replace older ones
 * - Fact expiration and compaction
 * - Simple pattern-based entity extraction
 *
 * Usage:
 * ```typescript
 * import { getTemporalMemoryStore } from './memory/temporal-memory.js';
 *
 * const store = getTemporalMemoryStore();
 *
 * const fact: TemporalFact = {
 *   factId: 'f1',
 *   subject: 'AAPL',
 *   predicate: 'price',
 *   object: '150',
 *   validFrom: new Date('2024-01-01'),
 *   validTo: new Date('2024-12-31'),
 *   confidence: 0.95,
 *   source: 'yahoo-finance',
 *   version: 1,
 * };
 *
 * const result = store.add(fact);
 * const current = store.query('AAPL', 'price');
 * const history = store.getHistory('AAPL', 'price');
 * ```
 */

import { randomUUID } from 'crypto';

// ============================================================================
// Types
// ============================================================================

/**
 * Temporal fact represented as SPO triple with time bounds
 */
export interface TemporalFact {
  factId: string;
  subject: string;           // What the fact is about (e.g., "AAPL", "GDP", "unemployment")
  predicate: string;         // The property/relationship (e.g., "price", "rate", "status")
  object: string;            // The value (e.g., "150", "5.2%", "bullish")
  validFrom: Date;           // When this fact became true
  validTo: Date;             // When this fact became false (Infinity for current)
  confidence: number;        // 0-1, how confident we are
  source: string;            // Where this fact came from
  supersedes?: string;       // factId of the fact this replaces
  version: number;           // Version number (increments with edits)
}

/**
 * Conflict severity levels
 */
export type ConflictSeverity = 'critical' | 'warning' | 'info';

/**
 * Conflict between two facts
 */
export interface Conflict {
  severity: ConflictSeverity;
  newFact: TemporalFact;
  existingFact: TemporalFact;
  reason: string;
  resolution: 'supersede' | 'coexist' | 'reject' | 'manual';
}

/**
 * Result of adding a fact
 */
export interface AddResult {
  added: boolean;
  conflicts: Conflict[];
  superseded?: string[];     // factIds that were superseded
}

/**
 * Extracted entity triple
 */
export interface ExtractedTriple {
  subject: string;
  predicate: string;
  object: string;
}

// ============================================================================
// ConflictDetector
// ============================================================================

/**
 * Detects conflicts between temporal facts
 */
export class ConflictDetector {
  /**
   * Detect conflicts between a new fact and existing facts
   */
  detect(newFact: TemporalFact, existing: TemporalFact[]): Conflict[] {
    const conflicts: Conflict[] = [];

    for (const existingFact of existing) {
      // Skip if different subject or predicate
      if (
        existingFact.subject !== newFact.subject ||
        existingFact.predicate !== newFact.predicate
      ) {
        continue;
      }

      // Check temporal overlap
      const overlap = this.hasTemporalOverlap(newFact, existingFact);

      if (overlap && existingFact.object !== newFact.object) {
        // Same subject+predicate, different object, overlapping time = conflict
        const severity = this.calculateSeverity(newFact, existingFact);
        const resolution = this.suggestResolution(newFact, existingFact);

        conflicts.push({
          severity,
          newFact,
          existingFact,
          reason: `Temporal overlap: ${existingFact.subject}.${existingFact.predicate} = "${existingFact.object}" vs "${newFact.object}"`,
          resolution,
        });
      } else if (existingFact.object === newFact.object && overlap) {
        // Same value, overlapping time = redundant (info level)
        conflicts.push({
          severity: 'info',
          newFact,
          existingFact,
          reason: 'Redundant fact with same value',
          resolution: 'coexist',
        });
      }
    }

    return conflicts;
  }

  /**
   * Check if two facts have temporal overlap
   */
  private hasTemporalOverlap(fact1: TemporalFact, fact2: TemporalFact): boolean {
    const f1Start = fact1.validFrom.getTime();
    const f1End = fact1.validTo.getTime();
    const f2Start = fact2.validFrom.getTime();
    const f2End = fact2.validTo.getTime();

    // Check if intervals overlap
    return f1Start < f2End && f2Start < f1End;
  }

  /**
   * Calculate conflict severity based on confidence difference
   */
  private calculateSeverity(
    newFact: TemporalFact,
    existingFact: TemporalFact
  ): ConflictSeverity {
    const confidenceDiff = Math.abs(newFact.confidence - existingFact.confidence);

    if (confidenceDiff < 0.1) {
      // Very similar confidence = critical (unclear which is correct)
      return 'critical';
    } else if (confidenceDiff < 0.3) {
      // Moderate difference = warning
      return 'warning';
    } else {
      // Large difference = info (clear which is more confident)
      return 'info';
    }
  }

  /**
   * Suggest resolution strategy
   */
  private suggestResolution(
    newFact: TemporalFact,
    existingFact: TemporalFact
  ): Conflict['resolution'] {
    const confidenceDiff = newFact.confidence - existingFact.confidence;

    if (Math.abs(confidenceDiff) < 0.1) {
      // Similar confidence = manual review needed
      return 'manual';
    } else if (confidenceDiff > 0.2) {
      // New fact much more confident = supersede
      return 'supersede';
    } else if (confidenceDiff < -0.2) {
      // Existing fact much more confident = reject new
      return 'reject';
    } else {
      // Moderate difference = can coexist
      return 'coexist';
    }
  }
}

// ============================================================================
// TemporalMemoryStore
// ============================================================================

/**
 * Store for temporal facts with conflict detection and self-editing
 */
export class TemporalMemoryStore {
  private store: Map<string, TemporalFact[]>;  // subject -> facts[]
  private detector: ConflictDetector;
  private factIndex: Map<string, TemporalFact>; // factId -> fact

  constructor() {
    this.store = new Map();
    this.detector = new ConflictDetector();
    this.factIndex = new Map();
  }

  /**
   * Add a fact to the store
   * Automatically detects conflicts and supersedes old facts if confidence is higher
   */
  add(fact: TemporalFact): AddResult {
    const existing = this.store.get(fact.subject) || [];
    const conflicts = this.detector.detect(fact, existing);
    const superseded: string[] = [];

    // Auto-supersede if resolution suggests it
    for (const conflict of conflicts) {
      if (conflict.resolution === 'supersede') {
        // Mark old fact as superseded
        const oldFact = conflict.existingFact;
        oldFact.validTo = new Date(Math.min(
          oldFact.validTo.getTime(),
          fact.validFrom.getTime()
        ));
        fact.supersedes = oldFact.factId;
        superseded.push(oldFact.factId);
      } else if (conflict.resolution === 'reject') {
        // Don't add the new fact
        return {
          added: false,
          conflicts,
          superseded: [],
        };
      }
    }

    // Add fact to store
    if (!this.store.has(fact.subject)) {
      this.store.set(fact.subject, []);
    }
    this.store.get(fact.subject)!.push(fact);
    this.factIndex.set(fact.factId, fact);

    return {
      added: true,
      conflicts,
      superseded,
    };
  }

  /**
   * Query facts for a subject, optionally filtered by predicate
   * Returns facts valid at the specified time (or now if not specified)
   */
  query(subject: string, predicate?: string, asOf?: Date): TemporalFact[] {
    const facts = this.store.get(subject) || [];
    const queryTime = asOf || new Date();
    const queryTimeMs = queryTime.getTime();

    return facts.filter(fact => {
      // Check temporal validity
      const validFrom = fact.validFrom.getTime();
      const validTo = fact.validTo.getTime();
      const isValid = validFrom <= queryTimeMs && queryTimeMs <= validTo;

      // Check predicate filter
      const matchesPredicate = !predicate || fact.predicate === predicate;

      return isValid && matchesPredicate;
    });
  }

  /**
   * Get full version history for a subject+predicate
   */
  getHistory(subject: string, predicate: string): TemporalFact[] {
    const facts = this.store.get(subject) || [];

    return facts
      .filter(fact => fact.predicate === predicate)
      .sort((a, b) => a.validFrom.getTime() - b.validFrom.getTime());
  }

  /**
   * Edit an existing fact (self-editing)
   * Updates the fact and bumps version number
   */
  edit(factId: string, updates: Partial<TemporalFact>): TemporalFact {
    const fact = this.factIndex.get(factId);
    if (!fact) {
      throw new Error(`Fact ${factId} not found`);
    }

    // Apply updates
    Object.assign(fact, updates);

    // Bump version
    fact.version += 1;

    return fact;
  }

  /**
   * Expire a fact by setting validTo to now
   */
  expire(factId: string): void {
    const fact = this.factIndex.get(factId);
    if (!fact) {
      throw new Error(`Fact ${factId} not found`);
    }

    fact.validTo = new Date();
  }

  /**
   * Compact the store by removing expired facts older than threshold
   * Returns count of removed facts
   */
  compact(olderThan: Date): number {
    let removed = 0;
    const threshold = olderThan.getTime();

    for (const [subject, facts] of this.store.entries()) {
      const filtered = facts.filter(fact => {
        const isExpired = fact.validTo.getTime() < Date.now();
        const isTooOld = fact.validTo.getTime() < threshold;
        const shouldRemove = isExpired && isTooOld;

        if (shouldRemove) {
          this.factIndex.delete(fact.factId);
          removed++;
        }

        return !shouldRemove;
      });

      if (filtered.length === 0) {
        this.store.delete(subject);
      } else {
        this.store.set(subject, filtered);
      }
    }

    return removed;
  }

  /**
   * Get all facts
   */
  getAll(): TemporalFact[] {
    const all: TemporalFact[] = [];
    for (const facts of this.store.values()) {
      all.push(...facts);
    }
    return all;
  }

  /**
   * Clear all facts
   */
  clear(): void {
    this.store.clear();
    this.factIndex.clear();
  }

  /**
   * Get store statistics
   */
  stats(): {
    totalFacts: number;
    totalSubjects: number;
    activeFacts: number;
    expiredFacts: number;
    avgConfidence: number;
  } {
    const all = this.getAll();
    const now = Date.now();

    const active = all.filter(f => f.validTo.getTime() >= now);
    const expired = all.filter(f => f.validTo.getTime() < now);
    const avgConfidence = all.length > 0
      ? all.reduce((sum, f) => sum + f.confidence, 0) / all.length
      : 0;

    return {
      totalFacts: all.length,
      totalSubjects: this.store.size,
      activeFacts: active.length,
      expiredFacts: expired.length,
      avgConfidence,
    };
  }
}

// ============================================================================
// EntityExtractor
// ============================================================================

/**
 * Simple pattern-based entity extraction
 * Extracts SPO triples from natural language text
 */
export class EntityExtractor {
  /**
   * Extract SPO triples from text using pattern matching
   */
  extract(text: string): ExtractedTriple[] {
    const triples: ExtractedTriple[] = [];

    // General patterns
    triples.push(...this.extractIsPattern(text));
    triples.push(...this.extractHasPattern(text));
    triples.push(...this.extractReachedPattern(text));
    triples.push(...this.extractTradesAtPattern(text));

    // Financial patterns
    triples.push(...this.extractTickerPricePattern(text));
    triples.push(...this.extractGrowthPattern(text));
    triples.push(...this.extractRatePattern(text));

    return triples;
  }

  /**
   * Pattern: "X is Y"
   */
  private extractIsPattern(text: string): ExtractedTriple[] {
    const pattern = /(\w+(?:\s+\w+)?)\s+is\s+(\w+(?:\s+\w+)?)/gi;
    const matches = text.matchAll(pattern);
    const triples: ExtractedTriple[] = [];

    for (const match of matches) {
      triples.push({
        subject: match[1].trim(),
        predicate: 'is',
        object: match[2].trim(),
      });
    }

    return triples;
  }

  /**
   * Pattern: "X has Y"
   */
  private extractHasPattern(text: string): ExtractedTriple[] {
    const pattern = /(\w+(?:\s+\w+)?)\s+has\s+(\w+(?:\s+\w+)?)/gi;
    const matches = text.matchAll(pattern);
    const triples: ExtractedTriple[] = [];

    for (const match of matches) {
      triples.push({
        subject: match[1].trim(),
        predicate: 'has',
        object: match[2].trim(),
      });
    }

    return triples;
  }

  /**
   * Pattern: "X reached Y"
   */
  private extractReachedPattern(text: string): ExtractedTriple[] {
    const pattern = /(\w+(?:\s+\w+)?)\s+reached\s+([\w\s$%,.]+)/gi;
    const matches = text.matchAll(pattern);
    const triples: ExtractedTriple[] = [];

    for (const match of matches) {
      triples.push({
        subject: match[1].trim(),
        predicate: 'reached',
        object: match[2].trim(),
      });
    }

    return triples;
  }

  /**
   * Pattern: "X trades at Y"
   */
  private extractTradesAtPattern(text: string): ExtractedTriple[] {
    const pattern = /(\w+)\s+trades?\s+at\s+\$?([\d,.]+)/gi;
    const matches = text.matchAll(pattern);
    const triples: ExtractedTriple[] = [];

    for (const match of matches) {
      triples.push({
        subject: match[1].trim(),
        predicate: 'price',
        object: match[2].trim(),
      });
    }

    return triples;
  }

  /**
   * Pattern: "$TICKER is at $PRICE"
   */
  private extractTickerPricePattern(text: string): ExtractedTriple[] {
    const pattern = /\$?([A-Z]{1,5})\s+(?:is\s+)?at\s+\$?([\d,.]+)/g;
    const matches = text.matchAll(pattern);
    const triples: ExtractedTriple[] = [];

    for (const match of matches) {
      triples.push({
        subject: match[1],
        predicate: 'price',
        object: match[2],
      });
    }

    return triples;
  }

  /**
   * Pattern: "X grew Y%"
   */
  private extractGrowthPattern(text: string): ExtractedTriple[] {
    const pattern = /(\w+(?:\s+\w+)?)\s+grew\s+([\d.]+)%/gi;
    const matches = text.matchAll(pattern);
    const triples: ExtractedTriple[] = [];

    for (const match of matches) {
      triples.push({
        subject: match[1].trim(),
        predicate: 'growth',
        object: `${match[2]}%`,
      });
    }

    return triples;
  }

  /**
   * Pattern: "X rate is Y%"
   */
  private extractRatePattern(text: string): ExtractedTriple[] {
    const pattern = /(\w+(?:\s+\w+)?)\s+rate\s+is\s+([\d.]+)%/gi;
    const matches = text.matchAll(pattern);
    const triples: ExtractedTriple[] = [];

    for (const match of matches) {
      triples.push({
        subject: match[1].trim(),
        predicate: 'rate',
        object: `${match[2]}%`,
      });
    }

    return triples;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let temporalMemoryStoreInstance: TemporalMemoryStore | null = null;

/**
 * Get the global temporal memory store instance
 */
export function getTemporalMemoryStore(): TemporalMemoryStore {
  if (!temporalMemoryStoreInstance) {
    temporalMemoryStoreInstance = new TemporalMemoryStore();
  }
  return temporalMemoryStoreInstance;
}

/**
 * Reset the global temporal memory store instance
 */
export function resetTemporalMemoryStore(): void {
  temporalMemoryStoreInstance = null;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Create a temporal fact with defaults
 */
export function createTemporalFact(options: {
  subject: string;
  predicate: string;
  object: string;
  validFrom?: Date;
  validTo?: Date;
  confidence?: number;
  source?: string;
  supersedes?: string;
}): TemporalFact {
  return {
    factId: randomUUID(),
    subject: options.subject,
    predicate: options.predicate,
    object: options.object,
    validFrom: options.validFrom || new Date(),
    validTo: options.validTo || new Date(8640000000000000), // Max date (Infinity)
    confidence: options.confidence ?? 0.8,
    source: options.source || 'unknown',
    supersedes: options.supersedes,
    version: 1,
  };
}

/**
 * Extract facts from text and add to store
 */
export function extractAndStore(
  text: string,
  source: string,
  store?: TemporalMemoryStore
): AddResult[] {
  const extractor = new EntityExtractor();
  const triples = extractor.extract(text);
  const memStore = store || getTemporalMemoryStore();
  const results: AddResult[] = [];

  for (const triple of triples) {
    const fact = createTemporalFact({
      subject: triple.subject,
      predicate: triple.predicate,
      object: triple.object,
      source,
      confidence: 0.7, // Lower confidence for auto-extracted facts
    });

    const result = memStore.add(fact);
    results.push(result);
  }

  return results;
}
