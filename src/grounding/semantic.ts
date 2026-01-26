/**
 * Semantic Grounding Module
 *
 * Implements RDF-based knowledge grounding for LLM outputs.
 * Ensures generated text can be validated against a formal
 * ontology, enabling logical reasoning and fact-checking.
 *
 * Key concepts:
 * - RDF triples: (subject, predicate, object)
 * - Ontology validation: ensure semantic correctness
 * - SPARQL queries: multi-hop reasoning
 * - Living ontology: LLM-assisted evolution
 *
 * Based on:
 * - RDF 1.1 Specification
 * - OWL 2 Web Ontology Language
 * - SPARQL 1.1 Query Language
 *
 * Usage:
 * ```typescript
 * import { SemanticGrounding } from './grounding/semantic.js';
 *
 * const grounding = new SemanticGrounding();
 *
 * // Add ontology triples
 * grounding.addTriple('Dog', 'isA', 'Animal');
 * grounding.addTriple('Animal', 'hasProperty', 'alive');
 *
 * // Ground LLM output
 * const grounded = grounding.ground('A dog is an animal that can bark');
 *
 * // Query
 * const result = grounding.query('SELECT ?x WHERE { ?x isA Animal }');
 * ```
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export interface Triple {
  subject: string;
  predicate: string;
  object: string;
  confidence?: number;
  source?: string;
  timestamp?: number;
}

export interface GroundedStatement {
  original: string;
  triples: Triple[];
  valid: boolean;
  confidence: number;
  errors: SemanticError[];
}

export interface SemanticError {
  type: SemanticErrorType;
  message: string;
  triple?: Triple;
  suggestion?: string;
}

export type SemanticErrorType =
  | 'invalid_subject'
  | 'invalid_predicate'
  | 'invalid_object'
  | 'type_mismatch'
  | 'domain_violation'
  | 'range_violation'
  | 'unknown_entity'
  | 'contradiction';

export interface OntologyClass {
  name: string;
  superclasses: string[];
  properties: string[];
  instances: string[];
}

export interface OntologyProperty {
  name: string;
  domain: string[];        // Valid subject types
  range: string[];         // Valid object types
  type: 'object' | 'data'; // Object property vs data property
  functional?: boolean;    // At most one value per subject
  inverse?: string;        // Inverse property name
}

export interface QueryResult {
  bindings: Map<string, string>[];
  count: number;
  query: string;
  duration: number;
}

export interface GroundingConfig {
  strictMode: boolean;          // Reject invalid triples
  inferenceEnabled: boolean;    // Enable RDFS/OWL reasoning
  confidenceThreshold: number;  // Min confidence for extraction
  maxTriples: number;           // Max triples to extract per text
}

export interface GroundingMetrics {
  triplesAdded: number;
  triplesExtracted: number;
  queriesExecuted: number;
  validationErrors: number;
  inferencesCached: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: GroundingConfig = {
  strictMode: false,
  inferenceEnabled: true,
  confidenceThreshold: 0.5,
  maxTriples: 100,
};

// ============================================================================
// Semantic Grounding
// ============================================================================

export class SemanticGrounding extends EventEmitter {
  private config: GroundingConfig;
  private metrics: GroundingMetrics;

  // Knowledge graph storage
  private triples: Map<string, Triple[]> = new Map(); // subject -> triples
  private predicateIndex: Map<string, Triple[]> = new Map();
  private objectIndex: Map<string, Triple[]> = new Map();

  // Ontology
  private classes: Map<string, OntologyClass> = new Map();
  private properties: Map<string, OntologyProperty> = new Map();

  // Inference cache
  private inferenceCache: Map<string, Triple[]> = new Map();

  constructor(config: Partial<GroundingConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = {
      triplesAdded: 0,
      triplesExtracted: 0,
      queriesExecuted: 0,
      validationErrors: 0,
      inferencesCached: 0,
    };

    // Initialize with basic ontology
    this.initializeBaseOntology();
  }

  // ============================================================================
  // Ontology Management
  // ============================================================================

  private initializeBaseOntology(): void {
    // Basic RDFS-like classes
    this.addClass('Thing', [], ['hasName', 'hasDescription']);
    this.addClass('Class', ['Thing'], ['subClassOf']);
    this.addClass('Property', ['Thing'], ['domain', 'range']);

    // Basic properties
    this.addProperty('isA', ['Thing'], ['Class'], 'object');
    this.addProperty('subClassOf', ['Class'], ['Class'], 'object');
    this.addProperty('hasProperty', ['Class'], ['Property'], 'object');
    this.addProperty('hasName', ['Thing'], ['string'], 'data');
    this.addProperty('hasValue', ['Thing'], ['string'], 'data');
  }

  /**
   * Add a class to the ontology
   */
  addClass(
    name: string,
    superclasses: string[] = [],
    properties: string[] = []
  ): void {
    this.classes.set(name, {
      name,
      superclasses,
      properties,
      instances: [],
    });
    this.emit('class:added', { name });
  }

  /**
   * Add a property to the ontology
   */
  addProperty(
    name: string,
    domain: string[],
    range: string[],
    type: 'object' | 'data' = 'object',
    options: { functional?: boolean; inverse?: string } = {}
  ): void {
    this.properties.set(name, {
      name,
      domain,
      range,
      type,
      functional: options.functional,
      inverse: options.inverse,
    });
    this.emit('property:added', { name });
  }

  /**
   * Get class hierarchy
   */
  getClassHierarchy(className: string): string[] {
    const hierarchy: string[] = [className];
    const cls = this.classes.get(className);

    if (cls) {
      for (const superclass of cls.superclasses) {
        hierarchy.push(...this.getClassHierarchy(superclass));
      }
    }

    return [...new Set(hierarchy)];
  }

  /**
   * Check if entity is instance of class
   */
  isInstanceOf(entity: string, className: string): boolean {
    const instanceTriples = this.triples.get(entity) || [];

    for (const triple of instanceTriples) {
      if (triple.predicate === 'isA') {
        const hierarchy = this.getClassHierarchy(triple.object);
        if (hierarchy.includes(className)) {
          return true;
        }
      }
    }

    return false;
  }

  // ============================================================================
  // Triple Management
  // ============================================================================

  /**
   * Add a triple to the knowledge graph
   */
  addTriple(
    subject: string,
    predicate: string,
    object: string,
    options: { confidence?: number; source?: string } = {}
  ): Triple {
    const triple: Triple = {
      subject,
      predicate,
      object,
      confidence: options.confidence ?? 1.0,
      source: options.source,
      timestamp: Date.now(),
    };

    // Validate if strict mode
    if (this.config.strictMode) {
      const error = this.validateTriple(triple);
      if (error) {
        this.metrics.validationErrors++;
        throw new Error(error.message);
      }
    }

    // Add to indices
    const subjectTriples = this.triples.get(subject) || [];
    subjectTriples.push(triple);
    this.triples.set(subject, subjectTriples);

    const predTriples = this.predicateIndex.get(predicate) || [];
    predTriples.push(triple);
    this.predicateIndex.set(predicate, predTriples);

    const objTriples = this.objectIndex.get(object) || [];
    objTriples.push(triple);
    this.objectIndex.set(object, objTriples);

    // Track instances
    if (predicate === 'isA') {
      const cls = this.classes.get(object);
      if (cls && !cls.instances.includes(subject)) {
        cls.instances.push(subject);
      }
    }

    // Clear inference cache
    this.inferenceCache.clear();

    this.metrics.triplesAdded++;
    this.emit('triple:added', triple);

    return triple;
  }

  /**
   * Validate a triple against ontology
   */
  validateTriple(triple: Triple): SemanticError | null {
    const property = this.properties.get(triple.predicate);

    if (!property) {
      return {
        type: 'invalid_predicate',
        message: `Unknown predicate: ${triple.predicate}`,
        triple,
        suggestion: `Define property '${triple.predicate}' using addProperty()`,
      };
    }

    // Check domain (subject type)
    if (property.domain.length > 0 && property.domain[0] !== 'Thing') {
      let validDomain = false;

      for (const domainClass of property.domain) {
        if (this.isInstanceOf(triple.subject, domainClass)) {
          validDomain = true;
          break;
        }
      }

      if (!validDomain && this.config.strictMode) {
        return {
          type: 'domain_violation',
          message: `Subject '${triple.subject}' is not a valid domain for '${triple.predicate}'`,
          triple,
        };
      }
    }

    // Check range (object type)
    if (property.type === 'object' && property.range.length > 0) {
      let validRange = false;

      for (const rangeClass of property.range) {
        if (
          rangeClass === 'Class' ||
          rangeClass === 'Thing' ||
          this.isInstanceOf(triple.object, rangeClass) ||
          this.classes.has(triple.object)
        ) {
          validRange = true;
          break;
        }
      }

      if (!validRange && this.config.strictMode) {
        return {
          type: 'range_violation',
          message: `Object '${triple.object}' is not a valid range for '${triple.predicate}'`,
          triple,
        };
      }
    }

    // Check functional property constraint
    if (property.functional) {
      const existing = this.triples.get(triple.subject) || [];
      const conflict = existing.find(
        (t) => t.predicate === triple.predicate && t.object !== triple.object
      );

      if (conflict) {
        return {
          type: 'contradiction',
          message: `Functional property '${triple.predicate}' already has value '${conflict.object}'`,
          triple,
        };
      }
    }

    return null;
  }

  /**
   * Remove a triple
   */
  removeTriple(subject: string, predicate: string, object: string): boolean {
    const subjectTriples = this.triples.get(subject);
    if (!subjectTriples) return false;

    const index = subjectTriples.findIndex(
      (t) => t.predicate === predicate && t.object === object
    );

    if (index === -1) return false;

    subjectTriples.splice(index, 1);

    // Update indices
    const predTriples = this.predicateIndex.get(predicate);
    if (predTriples) {
      const predIndex = predTriples.findIndex(
        (t) => t.subject === subject && t.object === object
      );
      if (predIndex !== -1) predTriples.splice(predIndex, 1);
    }

    const objTriples = this.objectIndex.get(object);
    if (objTriples) {
      const objIndex = objTriples.findIndex(
        (t) => t.subject === subject && t.predicate === predicate
      );
      if (objIndex !== -1) objTriples.splice(objIndex, 1);
    }

    this.inferenceCache.clear();
    this.emit('triple:removed', { subject, predicate, object });

    return true;
  }

  // ============================================================================
  // Grounding
  // ============================================================================

  /**
   * Ground LLM output in formal semantics
   */
  ground(text: string): GroundedStatement {
    const triples = this.extractTriples(text);
    const errors: SemanticError[] = [];
    let totalConfidence = 0;

    for (const triple of triples) {
      const error = this.validateTriple(triple);
      if (error) {
        errors.push(error);
      }
      totalConfidence += triple.confidence || 1.0;
    }

    const result: GroundedStatement = {
      original: text,
      triples,
      valid: errors.length === 0,
      confidence: triples.length > 0 ? totalConfidence / triples.length : 0,
      errors,
    };

    this.emit('grounded', result);
    return result;
  }

  /**
   * Extract triples from text (simplified pattern-based)
   */
  extractTriples(text: string): Triple[] {
    const triples: Triple[] = [];

    // Pattern: "X is a Y"
    const isAPattern = /(\w+)\s+is\s+(?:a|an)\s+(\w+)/gi;
    let match;

    while ((match = isAPattern.exec(text)) !== null) {
      triples.push({
        subject: match[1],
        predicate: 'isA',
        object: match[2],
        confidence: 0.9,
        source: 'extraction',
        timestamp: Date.now(),
      });
    }

    // Pattern: "X has Y" or "X contains Y"
    const hasPattern = /(\w+)\s+(?:has|contains|includes)\s+(?:a|an|the)?\s*(\w+)/gi;

    while ((match = hasPattern.exec(text)) !== null) {
      triples.push({
        subject: match[1],
        predicate: 'has',
        object: match[2],
        confidence: 0.8,
        source: 'extraction',
        timestamp: Date.now(),
      });
    }

    // Pattern: "X can Y"
    const canPattern = /(\w+)\s+can\s+(\w+)/gi;

    while ((match = canPattern.exec(text)) !== null) {
      triples.push({
        subject: match[1],
        predicate: 'canDo',
        object: match[2],
        confidence: 0.7,
        source: 'extraction',
        timestamp: Date.now(),
      });
    }

    // Pattern: "X is related to Y"
    const relatedPattern = /(\w+)\s+is\s+(?:related|connected|linked)\s+to\s+(\w+)/gi;

    while ((match = relatedPattern.exec(text)) !== null) {
      triples.push({
        subject: match[1],
        predicate: 'relatedTo',
        object: match[2],
        confidence: 0.6,
        source: 'extraction',
        timestamp: Date.now(),
      });
    }

    this.metrics.triplesExtracted += triples.length;
    return triples.slice(0, this.config.maxTriples);
  }

  // ============================================================================
  // SPARQL-like Queries
  // ============================================================================

  /**
   * Execute a simplified SPARQL-like query
   *
   * Supports:
   * - SELECT ?x WHERE { ?x predicate object }
   * - SELECT ?x ?y WHERE { ?x predicate ?y }
   * - ASK { subject predicate object }
   */
  query(sparql: string): QueryResult {
    const startTime = Date.now();
    this.metrics.queriesExecuted++;

    // Parse query type
    const selectMatch = sparql.match(/SELECT\s+(\?[\w\s?]+)\s+WHERE\s*\{\s*(.+)\s*\}/i);
    const askMatch = sparql.match(/ASK\s*\{\s*(.+)\s*\}/i);

    if (selectMatch) {
      const variables = selectMatch[1].match(/\?\w+/g) || [];
      const pattern = selectMatch[2];
      const bindings = this.matchPattern(pattern, variables);

      return {
        bindings,
        count: bindings.length,
        query: sparql,
        duration: Date.now() - startTime,
      };
    }

    if (askMatch) {
      const pattern = askMatch[1];
      const bindings = this.matchPattern(pattern, []);

      return {
        bindings,
        count: bindings.length > 0 ? 1 : 0,
        query: sparql,
        duration: Date.now() - startTime,
      };
    }

    return {
      bindings: [],
      count: 0,
      query: sparql,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Match a triple pattern
   */
  private matchPattern(
    pattern: string,
    variables: string[]
  ): Map<string, string>[] {
    // Parse pattern: ?s predicate ?o or subject predicate object
    const parts = pattern.trim().split(/\s+/);

    if (parts.length < 3) return [];

    const [subject, predicate, object] = parts;
    const results: Map<string, string>[] = [];

    // Determine which parts are variables
    const subjectVar = subject.startsWith('?');
    const predicateVar = predicate.startsWith('?');
    const objectVar = object.startsWith('?');

    // Get all triples to match against
    let candidates: Triple[] = [];

    if (!subjectVar) {
      candidates = this.triples.get(subject) || [];
    } else if (!predicateVar) {
      candidates = this.predicateIndex.get(predicate) || [];
    } else if (!objectVar) {
      candidates = this.objectIndex.get(object) || [];
    } else {
      // All variables - iterate all triples
      for (const tripleList of this.triples.values()) {
        candidates.push(...tripleList);
      }
    }

    // Match and collect bindings
    for (const triple of candidates) {
      const binding = new Map<string, string>();
      let matches = true;

      // Check subject
      if (subjectVar) {
        binding.set(subject, triple.subject);
      } else if (triple.subject !== subject) {
        matches = false;
      }

      // Check predicate
      if (predicateVar) {
        binding.set(predicate, triple.predicate);
      } else if (triple.predicate !== predicate) {
        matches = false;
      }

      // Check object
      if (objectVar) {
        binding.set(object, triple.object);
      } else if (triple.object !== object) {
        matches = false;
      }

      if (matches) {
        results.push(binding);
      }
    }

    return results;
  }

  /**
   * Multi-hop reasoning query
   */
  reason(startEntity: string, path: string[]): string[] {
    let current = new Set([startEntity]);

    for (const predicate of path) {
      const next = new Set<string>();

      for (const entity of current) {
        const triples = this.triples.get(entity) || [];
        for (const triple of triples) {
          if (triple.predicate === predicate) {
            next.add(triple.object);
          }
        }
      }

      current = next;
      if (current.size === 0) break;
    }

    return [...current];
  }

  // ============================================================================
  // Inference
  // ============================================================================

  /**
   * Apply RDFS-like inference rules
   */
  infer(): Triple[] {
    if (!this.config.inferenceEnabled) return [];

    const cacheKey = `inference-${this.metrics.triplesAdded}`;
    if (this.inferenceCache.has(cacheKey)) {
      return this.inferenceCache.get(cacheKey)!;
    }

    const inferred: Triple[] = [];

    // Rule 1: Transitivity of subClassOf
    const subClassTriples = this.predicateIndex.get('subClassOf') || [];
    for (const t1 of subClassTriples) {
      for (const t2 of subClassTriples) {
        if (t1.object === t2.subject) {
          const newTriple: Triple = {
            subject: t1.subject,
            predicate: 'subClassOf',
            object: t2.object,
            confidence: Math.min(t1.confidence || 1, t2.confidence || 1) * 0.9,
            source: 'inference',
            timestamp: Date.now(),
          };

          // Check if already exists
          const existing = (this.triples.get(t1.subject) || []).find(
            (t) =>
              t.predicate === 'subClassOf' && t.object === t2.object
          );

          if (!existing) {
            inferred.push(newTriple);
          }
        }
      }
    }

    // Rule 2: Instance inheritance
    const isATriples = this.predicateIndex.get('isA') || [];
    for (const instanceTriple of isATriples) {
      const classTriples = this.triples.get(instanceTriple.object) || [];
      for (const classTriple of classTriples) {
        if (classTriple.predicate === 'subClassOf') {
          const newTriple: Triple = {
            subject: instanceTriple.subject,
            predicate: 'isA',
            object: classTriple.object,
            confidence: (instanceTriple.confidence || 1) * (classTriple.confidence || 1) * 0.9,
            source: 'inference',
            timestamp: Date.now(),
          };

          const existing = (this.triples.get(instanceTriple.subject) || []).find(
            (t) => t.predicate === 'isA' && t.object === classTriple.object
          );

          if (!existing) {
            inferred.push(newTriple);
          }
        }
      }
    }

    this.inferenceCache.set(cacheKey, inferred);
    this.metrics.inferencesCached++;

    return inferred;
  }

  /**
   * Materialize inferred triples into the graph
   */
  materialize(): number {
    const inferred = this.infer();
    let added = 0;

    for (const triple of inferred) {
      try {
        this.addTriple(triple.subject, triple.predicate, triple.object, {
          confidence: triple.confidence,
          source: 'inference',
        });
        added++;
      } catch {
        // Skip invalid inferences
      }
    }

    this.emit('materialized', { count: added });
    return added;
  }

  // ============================================================================
  // Ontology Evolution
  // ============================================================================

  /**
   * Evolve ontology with new data (add discovered patterns)
   */
  evolve(triples: Triple[]): void {
    for (const triple of triples) {
      // Auto-create classes
      if (triple.predicate === 'isA' && !this.classes.has(triple.object)) {
        this.addClass(triple.object);
      }

      // Auto-create properties
      if (!this.properties.has(triple.predicate)) {
        this.addProperty(triple.predicate, ['Thing'], ['Thing']);
      }

      // Add triple
      try {
        this.addTriple(triple.subject, triple.predicate, triple.object, {
          confidence: triple.confidence,
          source: triple.source,
        });
      } catch {
        // Skip invalid triples in evolution mode
      }
    }

    this.emit('evolved', { triplesProcessed: triples.length });
  }

  // ============================================================================
  // Stats & Export
  // ============================================================================

  getMetrics(): GroundingMetrics {
    return { ...this.metrics };
  }

  getTripleCount(): number {
    let count = 0;
    for (const triples of this.triples.values()) {
      count += triples.length;
    }
    return count;
  }

  getClassCount(): number {
    return this.classes.size;
  }

  getPropertyCount(): number {
    return this.properties.size;
  }

  /**
   * Export ontology as triples
   */
  exportTriples(): Triple[] {
    const all: Triple[] = [];
    for (const triples of this.triples.values()) {
      all.push(...triples);
    }
    return all;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.triples.clear();
    this.predicateIndex.clear();
    this.objectIndex.clear();
    this.classes.clear();
    this.properties.clear();
    this.inferenceCache.clear();
    this.initializeBaseOntology();
    this.emit('cleared');
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create semantic grounding instance
 */
export function createSemanticGrounding(
  config?: Partial<GroundingConfig>
): SemanticGrounding {
  return new SemanticGrounding(config);
}

// ============================================================================
// Global Instance
// ============================================================================

let globalGrounding: SemanticGrounding | null = null;

/**
 * Get global semantic grounding instance
 */
export function getSemanticGrounding(
  config?: Partial<GroundingConfig>
): SemanticGrounding {
  if (!globalGrounding) {
    globalGrounding = new SemanticGrounding(config);
  }
  return globalGrounding;
}

/**
 * Reset global semantic grounding
 */
export function resetSemanticGrounding(): void {
  if (globalGrounding) {
    globalGrounding.clear();
  }
  globalGrounding = null;
}
