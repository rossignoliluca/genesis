/**
 * Neurosymbolic Reasoning (NSAR)
 *
 * Based on: "Enhancing Large Language Models with Neurosymbolic Reasoning" (arxiv 2506.02483)
 *
 * Combines:
 * - Neural reasoning (LLM pattern recognition)
 * - Symbolic reasoning (Knowledge graph traversal, logic)
 * - Hybrid fusion for robust multi-hop reasoning
 */

import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface Entity {
  id: string;
  name: string;
  type: string;
  properties: Record<string, any>;
  embedding?: number[];
}

export interface Relation {
  from: string;       // Entity ID
  to: string;         // Entity ID
  type: string;       // Relation type
  weight: number;     // Confidence 0-1
  properties?: Record<string, any>;
}

export interface KnowledgeGraph {
  entities: Map<string, Entity>;
  relations: Relation[];
  inverseIndex: Map<string, Set<string>>; // entity -> connected entities
}

export interface ReasoningQuery {
  question: string;
  context?: string;
  constraints?: LogicalConstraint[];
  maxHops?: number;
  requireExplanation?: boolean;
}

export interface LogicalConstraint {
  type: 'must_include' | 'must_exclude' | 'type_constraint' | 'path_constraint';
  value: string | string[];
}

export interface ReasoningPath {
  entities: Entity[];
  relations: Relation[];
  score: number;
  explanation: string;
}

export interface ReasoningResult {
  answer: string;
  confidence: number;
  paths: ReasoningPath[];
  neuralScore: number;
  symbolicScore: number;
  hybridScore: number;
  explanation: string;
  reasoning_trace: ReasoningStep[];
}

export interface ReasoningStep {
  step: number;
  type: 'neural' | 'symbolic' | 'fusion';
  input: string;
  output: string;
  confidence: number;
}

export interface NSARConfig {
  maxHops: number;              // Max graph traversal depth
  beamWidth: number;            // Beam search width
  neuralWeight: number;         // Weight for neural reasoning (0-1)
  symbolicWeight: number;       // Weight for symbolic reasoning (0-1)
  minConfidence: number;        // Minimum confidence threshold
  useChainOfThought: boolean;   // Enable CoT prompting
  enableBacktracking: boolean;  // Allow backtracking in search
}

// ============================================================================
// SYMBOLIC REASONER (Knowledge Graph)
// ============================================================================

export class SymbolicReasoner {
  private graph: KnowledgeGraph;

  constructor() {
    this.graph = {
      entities: new Map(),
      relations: [],
      inverseIndex: new Map()
    };
  }

  /**
   * Add entity to knowledge graph
   */
  addEntity(entity: Entity): void {
    this.graph.entities.set(entity.id, entity);
    if (!this.graph.inverseIndex.has(entity.id)) {
      this.graph.inverseIndex.set(entity.id, new Set());
    }
  }

  /**
   * Add relation to knowledge graph
   */
  addRelation(relation: Relation): void {
    this.graph.relations.push(relation);

    // Update inverse index
    if (!this.graph.inverseIndex.has(relation.from)) {
      this.graph.inverseIndex.set(relation.from, new Set());
    }
    if (!this.graph.inverseIndex.has(relation.to)) {
      this.graph.inverseIndex.set(relation.to, new Set());
    }
    this.graph.inverseIndex.get(relation.from)!.add(relation.to);
    this.graph.inverseIndex.get(relation.to)!.add(relation.from);
  }

  /**
   * Find entities matching a pattern
   */
  findEntities(pattern: Partial<Entity>): Entity[] {
    const results: Entity[] = [];
    for (const entity of this.graph.entities.values()) {
      let match = true;
      if (pattern.type && entity.type !== pattern.type) match = false;
      if (pattern.name && !entity.name.toLowerCase().includes(pattern.name.toLowerCase())) match = false;
      if (match) results.push(entity);
    }
    return results;
  }

  /**
   * Find paths between two entities using BFS with beam search
   */
  findPaths(fromId: string, toId: string, maxHops: number, beamWidth: number): ReasoningPath[] {
    const paths: ReasoningPath[] = [];
    const visited = new Set<string>();

    interface SearchState {
      entityId: string;
      path: { entity: Entity, relation: Relation | null }[];
      score: number;
    }

    let beam: SearchState[] = [{
      entityId: fromId,
      path: [{ entity: this.graph.entities.get(fromId)!, relation: null }],
      score: 1.0
    }];

    for (let hop = 0; hop < maxHops && beam.length > 0; hop++) {
      const nextBeam: SearchState[] = [];

      for (const state of beam) {
        if (state.entityId === toId) {
          // Found target
          paths.push(this.stateToPath(state));
          continue;
        }

        // Expand neighbors
        const neighbors = this.getNeighbors(state.entityId);
        for (const { entityId, relation } of neighbors) {
          if (visited.has(entityId)) continue;

          const entity = this.graph.entities.get(entityId);
          if (!entity) continue;

          nextBeam.push({
            entityId,
            path: [...state.path, { entity, relation }],
            score: state.score * relation.weight
          });
        }
      }

      // Beam pruning
      nextBeam.sort((a, b) => b.score - a.score);
      beam = nextBeam.slice(0, beamWidth);

      // Mark visited
      for (const state of beam) {
        visited.add(state.entityId);
      }
    }

    return paths.sort((a, b) => b.score - a.score);
  }

  /**
   * Get neighboring entities and relations
   */
  private getNeighbors(entityId: string): { entityId: string, relation: Relation }[] {
    const neighbors: { entityId: string, relation: Relation }[] = [];

    for (const relation of this.graph.relations) {
      if (relation.from === entityId) {
        neighbors.push({ entityId: relation.to, relation });
      } else if (relation.to === entityId) {
        // Reverse relation
        neighbors.push({
          entityId: relation.from,
          relation: { ...relation, from: relation.to, to: relation.from, type: `inverse_${relation.type}` }
        });
      }
    }

    return neighbors;
  }

  /**
   * Convert search state to reasoning path
   */
  private stateToPath(state: { path: { entity: Entity, relation: Relation | null }[], score: number }): ReasoningPath {
    return {
      entities: state.path.map(p => p.entity),
      relations: state.path.filter(p => p.relation !== null).map(p => p.relation!),
      score: state.score,
      explanation: this.generatePathExplanation(state.path)
    };
  }

  /**
   * Generate natural language explanation for a path
   */
  private generatePathExplanation(path: { entity: Entity, relation: Relation | null }[]): string {
    if (path.length < 2) return path[0]?.entity.name || 'Empty path';

    const parts: string[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i].entity;
      const relation = path[i + 1].relation;
      const to = path[i + 1].entity;

      if (relation) {
        parts.push(`${from.name} --[${relation.type}]--> ${to.name}`);
      }
    }

    return parts.join(', then ');
  }

  /**
   * Apply logical inference rules
   */
  inferNew(): Relation[] {
    const inferred: Relation[] = [];

    // Transitivity rule: if A->B and B->C, then A->C (for certain relations)
    const transitiveTypes = new Set(['is_a', 'part_of', 'located_in', 'causes']);

    for (const r1 of this.graph.relations) {
      if (!transitiveTypes.has(r1.type)) continue;

      for (const r2 of this.graph.relations) {
        if (r2.from !== r1.to || r2.type !== r1.type) continue;

        // Check if inferred relation already exists
        const exists = this.graph.relations.some(
          r => r.from === r1.from && r.to === r2.to && r.type === r1.type
        );

        if (!exists) {
          const newRelation: Relation = {
            from: r1.from,
            to: r2.to,
            type: r1.type,
            weight: r1.weight * r2.weight * 0.9, // Decay confidence
            properties: { inferred: true, via: r1.to }
          };
          inferred.push(newRelation);
          this.addRelation(newRelation);
        }
      }
    }

    return inferred;
  }

  /**
   * Query the knowledge graph with SPARQL-like pattern
   */
  query(pattern: { subject?: string, predicate?: string, object?: string }): Relation[] {
    return this.graph.relations.filter(r => {
      if (pattern.subject && r.from !== pattern.subject) return false;
      if (pattern.predicate && r.type !== pattern.predicate) return false;
      if (pattern.object && r.to !== pattern.object) return false;
      return true;
    });
  }

  getStats(): { entities: number, relations: number, avgDegree: number } {
    const degrees = Array.from(this.graph.inverseIndex.values()).map(s => s.size);
    return {
      entities: this.graph.entities.size,
      relations: this.graph.relations.length,
      avgDegree: degrees.reduce((a, b) => a + b, 0) / degrees.length || 0
    };
  }
}

// ============================================================================
// NEURAL REASONER (LLM-based)
// ============================================================================

export class NeuralReasoner {
  private llmCall?: (prompt: string) => Promise<string>;
  private useChainOfThought: boolean;

  constructor(config: { llmCall?: (prompt: string) => Promise<string>, useChainOfThought?: boolean } = {}) {
    this.llmCall = config.llmCall;
    this.useChainOfThought = config.useChainOfThought ?? true;
  }

  /**
   * Set LLM function for neural reasoning
   */
  setLLMFunction(fn: (prompt: string) => Promise<string>) {
    this.llmCall = fn;
  }

  /**
   * Reason about a query using neural approach
   */
  async reason(query: ReasoningQuery, context: string = ''): Promise<{ answer: string, confidence: number, trace: string[] }> {
    if (!this.llmCall) {
      // Fallback: pattern matching
      return this.patternBasedReason(query, context);
    }

    const trace: string[] = [];

    // Build prompt
    let prompt: string;

    if (this.useChainOfThought) {
      prompt = this.buildCoTPrompt(query, context);
      trace.push('Using Chain-of-Thought prompting');
    } else {
      prompt = this.buildDirectPrompt(query, context);
      trace.push('Using direct prompting');
    }

    try {
      const response = await this.llmCall(prompt);
      trace.push(`LLM response received (${response.length} chars)`);

      // Extract answer and confidence
      const { answer, confidence } = this.parseResponse(response);
      trace.push(`Parsed answer with confidence ${confidence.toFixed(2)}`);

      return { answer, confidence, trace };
    } catch (error) {
      trace.push(`LLM error: ${error}`);
      return this.patternBasedReason(query, context);
    }
  }

  /**
   * Extract entities from text
   */
  async extractEntities(text: string): Promise<Entity[]> {
    // Simple NER using pattern matching
    const entities: Entity[] = [];

    // Capitalized words (potential proper nouns)
    const properNouns = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
    for (const noun of properNouns) {
      entities.push({
        id: `entity_${hashString(noun)}`,
        name: noun,
        type: 'unknown',
        properties: { source: 'pattern_extraction' }
      });
    }

    // Numbers with units
    const numbers = text.match(/\d+(?:\.\d+)?(?:\s*(?:kg|m|km|years?|days?|hours?|%|USD|\$))?/g) || [];
    for (const num of numbers) {
      entities.push({
        id: `number_${hashString(num)}`,
        name: num,
        type: 'quantity',
        properties: { value: parseFloat(num) }
      });
    }

    return entities;
  }

  /**
   * Extract relations from text
   */
  async extractRelations(text: string, entities: Entity[]): Promise<Relation[]> {
    const relations: Relation[] = [];
    const entityNames = entities.map(e => e.name.toLowerCase());

    // Common relation patterns
    const patterns = [
      { regex: /(\w+)\s+is\s+a\s+(\w+)/gi, type: 'is_a' },
      { regex: /(\w+)\s+causes?\s+(\w+)/gi, type: 'causes' },
      { regex: /(\w+)\s+(?:is\s+)?part\s+of\s+(\w+)/gi, type: 'part_of' },
      { regex: /(\w+)\s+(?:is\s+)?located\s+in\s+(\w+)/gi, type: 'located_in' },
      { regex: /(\w+)\s+(?:is\s+)?related\s+to\s+(\w+)/gi, type: 'related_to' },
      { regex: /(\w+)\s+(?:was\s+)?created\s+by\s+(\w+)/gi, type: 'created_by' }
    ];

    for (const { regex, type } of patterns) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        const fromName = match[1].toLowerCase();
        const toName = match[2].toLowerCase();

        // Find matching entities
        const fromEntity = entities.find(e => e.name.toLowerCase().includes(fromName));
        const toEntity = entities.find(e => e.name.toLowerCase().includes(toName));

        if (fromEntity && toEntity) {
          relations.push({
            from: fromEntity.id,
            to: toEntity.id,
            type,
            weight: 0.7,
            properties: { source: 'pattern_extraction' }
          });
        }
      }
    }

    return relations;
  }

  private buildCoTPrompt(query: ReasoningQuery, context: string): string {
    return `
You are a reasoning assistant. Answer the question step by step.

Context: ${context}

Question: ${query.question}

Let's think step by step:
1. First, identify the key concepts in the question.
2. Then, find relevant information in the context.
3. Reason through the connections.
4. Finally, provide the answer.

Think through this carefully:`;
  }

  private buildDirectPrompt(query: ReasoningQuery, context: string): string {
    return `
Context: ${context}

Question: ${query.question}

Answer concisely:`;
  }

  private parseResponse(response: string): { answer: string, confidence: number } {
    // Extract final answer (usually after "Therefore" or "The answer is")
    const answerPatterns = [
      /(?:therefore|thus|so|hence|the answer is)[,:]?\s*(.+?)(?:\.|$)/i,
      /(?:in conclusion|finally)[,:]?\s*(.+?)(?:\.|$)/i
    ];

    let answer = response;
    for (const pattern of answerPatterns) {
      const match = response.match(pattern);
      if (match) {
        answer = match[1].trim();
        break;
      }
    }

    // Estimate confidence based on hedging words
    const hedgingWords = ['maybe', 'possibly', 'might', 'could', 'uncertain', 'not sure', 'approximately'];
    const confidenceWords = ['definitely', 'certainly', 'clearly', 'obviously', 'must be'];

    let confidence = 0.7;
    for (const word of hedgingWords) {
      if (response.toLowerCase().includes(word)) confidence -= 0.1;
    }
    for (const word of confidenceWords) {
      if (response.toLowerCase().includes(word)) confidence += 0.1;
    }

    return { answer, confidence: Math.max(0.1, Math.min(1.0, confidence)) };
  }

  private patternBasedReason(query: ReasoningQuery, context: string): { answer: string, confidence: number, trace: string[] } {
    const trace = ['Using pattern-based fallback'];

    // Simple keyword matching
    const keywords = query.question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const sentences = context.split(/[.!?]+/).filter(s => s.trim().length > 0);

    let bestSentence = '';
    let bestScore = 0;

    for (const sentence of sentences) {
      const sentenceLower = sentence.toLowerCase();
      let score = 0;
      for (const keyword of keywords) {
        if (sentenceLower.includes(keyword)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestSentence = sentence.trim();
      }
    }

    trace.push(`Matched ${bestScore} keywords`);

    return {
      answer: bestSentence || 'Unable to determine answer from context.',
      confidence: Math.min(0.8, bestScore * 0.2),
      trace
    };
  }
}

// ============================================================================
// HYBRID NEUROSYMBOLIC REASONER
// ============================================================================

export class NeurosymbolicReasoner extends EventEmitter {
  private symbolic: SymbolicReasoner;
  private neural: NeuralReasoner;
  private config: NSARConfig;

  constructor(config: Partial<NSARConfig> = {}) {
    super();

    this.config = {
      maxHops: 5,
      beamWidth: 10,
      neuralWeight: 0.5,
      symbolicWeight: 0.5,
      minConfidence: 0.3,
      useChainOfThought: true,
      enableBacktracking: true,
      ...config
    };

    this.symbolic = new SymbolicReasoner();
    this.neural = new NeuralReasoner({ useChainOfThought: this.config.useChainOfThought });
  }

  /**
   * Set LLM function for neural reasoning
   */
  setLLMFunction(fn: (prompt: string) => Promise<string>) {
    this.neural.setLLMFunction(fn);
  }

  /**
   * Main reasoning interface
   */
  async reason(query: ReasoningQuery): Promise<ReasoningResult> {
    const trace: ReasoningStep[] = [];
    let stepNum = 0;

    // Step 1: Extract entities and relations from query
    trace.push({
      step: stepNum++,
      type: 'neural',
      input: query.question,
      output: 'Extracting entities from query',
      confidence: 1.0
    });

    const queryEntities = await this.neural.extractEntities(query.question);

    // Step 2: Symbolic reasoning - find relevant paths in knowledge graph
    trace.push({
      step: stepNum++,
      type: 'symbolic',
      input: `${queryEntities.length} entities`,
      output: 'Searching knowledge graph',
      confidence: 1.0
    });

    const symbolicPaths = this.findRelevantPaths(queryEntities, query.maxHops || this.config.maxHops);
    const symbolicScore = this.scoreSymbolicPaths(symbolicPaths);

    trace.push({
      step: stepNum++,
      type: 'symbolic',
      input: `${symbolicPaths.length} paths found`,
      output: `Best path score: ${symbolicScore.toFixed(2)}`,
      confidence: symbolicScore
    });

    // Step 3: Neural reasoning
    const context = this.pathsToContext(symbolicPaths);
    trace.push({
      step: stepNum++,
      type: 'neural',
      input: query.question,
      output: 'Running neural reasoning',
      confidence: 1.0
    });

    const neuralResult = await this.neural.reason(query, context);

    trace.push({
      step: stepNum++,
      type: 'neural',
      input: `Context: ${context.slice(0, 100)}...`,
      output: `Answer: ${neuralResult.answer.slice(0, 100)}`,
      confidence: neuralResult.confidence
    });

    // Step 4: Fusion - combine neural and symbolic results
    trace.push({
      step: stepNum++,
      type: 'fusion',
      input: `Neural: ${neuralResult.confidence.toFixed(2)}, Symbolic: ${symbolicScore.toFixed(2)}`,
      output: 'Combining reasoning results',
      confidence: 1.0
    });

    const hybridScore = this.fuseScores(neuralResult.confidence, symbolicScore);

    // Build final result
    const result: ReasoningResult = {
      answer: neuralResult.answer,
      confidence: hybridScore,
      paths: symbolicPaths,
      neuralScore: neuralResult.confidence,
      symbolicScore,
      hybridScore,
      explanation: this.generateExplanation(symbolicPaths, neuralResult, query),
      reasoning_trace: trace
    };

    this.emit('reasoningComplete', result);
    return result;
  }

  /**
   * Add knowledge to the graph
   */
  addKnowledge(entities: Entity[], relations: Relation[]): void {
    for (const entity of entities) {
      this.symbolic.addEntity(entity);
    }
    for (const relation of relations) {
      this.symbolic.addRelation(relation);
    }

    // Run inference to derive new facts
    const inferred = this.symbolic.inferNew();
    if (inferred.length > 0) {
      this.emit('newInferences', inferred);
    }
  }

  /**
   * Ingest text and extract knowledge
   */
  async ingestText(text: string): Promise<{ entities: Entity[], relations: Relation[] }> {
    const entities = await this.neural.extractEntities(text);
    const relations = await this.neural.extractRelations(text, entities);

    this.addKnowledge(entities, relations);

    return { entities, relations };
  }

  /**
   * Query knowledge graph directly
   */
  queryGraph(pattern: { subject?: string, predicate?: string, object?: string }): Relation[] {
    return this.symbolic.query(pattern);
  }

  /**
   * Get graph statistics
   */
  getStats(): Record<string, any> {
    return {
      graph: this.symbolic.getStats(),
      config: this.config
    };
  }

  // =========================================================================
  // PRIVATE METHODS
  // =========================================================================

  private findRelevantPaths(queryEntities: Entity[], maxHops: number): ReasoningPath[] {
    const allPaths: ReasoningPath[] = [];

    // Find entities in graph that match query entities
    for (const qEntity of queryEntities) {
      const matches = this.symbolic.findEntities({ name: qEntity.name });

      // Find paths between matched entities
      for (let i = 0; i < matches.length; i++) {
        for (let j = i + 1; j < matches.length; j++) {
          const paths = this.symbolic.findPaths(matches[i].id, matches[j].id, maxHops, this.config.beamWidth);
          allPaths.push(...paths);
        }
      }
    }

    return allPaths.sort((a, b) => b.score - a.score).slice(0, this.config.beamWidth);
  }

  private scoreSymbolicPaths(paths: ReasoningPath[]): number {
    if (paths.length === 0) return 0;

    // Average score of top paths
    const topPaths = paths.slice(0, 3);
    return topPaths.reduce((sum, p) => sum + p.score, 0) / topPaths.length;
  }

  private pathsToContext(paths: ReasoningPath[]): string {
    if (paths.length === 0) return '';

    const contextParts: string[] = [];
    for (const path of paths.slice(0, 5)) {
      contextParts.push(path.explanation);
    }

    return contextParts.join('. ');
  }

  private fuseScores(neural: number, symbolic: number): number {
    // Weighted combination
    const weighted = this.config.neuralWeight * neural + this.config.symbolicWeight * symbolic;

    // Boost if both agree (high confidence)
    const agreement = 1 - Math.abs(neural - symbolic);
    const boost = agreement * 0.1;

    return Math.min(1.0, weighted + boost);
  }

  private generateExplanation(paths: ReasoningPath[], neural: { answer: string, trace: string[] }, query: ReasoningQuery): string {
    const parts: string[] = [];

    parts.push(`Question: ${query.question}`);
    parts.push('');
    parts.push('Reasoning process:');

    // Symbolic part
    if (paths.length > 0) {
      parts.push(`1. Found ${paths.length} relevant paths in knowledge graph:`);
      for (const path of paths.slice(0, 3)) {
        parts.push(`   - ${path.explanation} (confidence: ${path.score.toFixed(2)})`);
      }
    } else {
      parts.push('1. No relevant paths found in knowledge graph.');
    }

    // Neural part
    parts.push(`2. Neural reasoning: ${neural.trace.join(', ')}`);

    parts.push('');
    parts.push(`Conclusion: ${neural.answer}`);

    return parts.join('\n');
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

export default NeurosymbolicReasoner;
