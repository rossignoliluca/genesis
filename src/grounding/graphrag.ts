/**
 * GraphRAG Module
 *
 * Implements Graph-enhanced Retrieval Augmented Generation (GraphRAG).
 * Combines knowledge graph structure with embedding-based retrieval
 * for better contextual understanding and multi-hop reasoning.
 *
 * Key concepts:
 * - Entity extraction and linking
 * - Community detection for hierarchical summaries
 * - Graph-guided retrieval paths
 * - Context assembly from graph neighbors
 *
 * Based on:
 * - Microsoft GraphRAG (2024)
 * - Knowledge Graph RAG patterns
 * - Graph Neural Networks for retrieval
 *
 * Usage:
 * ```typescript
 * import { GraphRAG } from './grounding/graphrag.js';
 *
 * const rag = new GraphRAG();
 *
 * // Index documents
 * await rag.index('Paris is the capital of France.');
 * await rag.index('France is in Europe.');
 *
 * // Query with graph-enhanced retrieval
 * const context = await rag.retrieve('What continent is Paris in?');
 * // Returns: context about Paris -> France -> Europe
 * ```
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export interface Entity {
  id: string;
  name: string;
  type: string;
  description?: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

export interface Relationship {
  source: string;        // Entity ID
  target: string;        // Entity ID
  type: string;
  weight: number;
  description?: string;
}

export interface Document {
  id: string;
  content: string;
  entities: string[];     // Entity IDs
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

export interface Community {
  id: string;
  entities: string[];     // Entity IDs
  level: number;          // Hierarchy level
  summary?: string;
  parent?: string;        // Parent community
  children: string[];     // Child communities
}

export interface RetrievalResult {
  documents: Document[];
  entities: Entity[];
  relationships: Relationship[];
  communities: Community[];
  context: string;
  score: number;
  hops: number;
}

export interface GraphRAGConfig {
  maxHops: number;              // Max graph traversal depth
  topK: number;                 // Top documents to return
  communityLevels: number;      // Hierarchy depth
  minCommunitySize: number;     // Min entities per community
  entityThreshold: number;      // Confidence for entity extraction
  contextWindow: number;        // Max context size
}

export interface GraphRAGMetrics {
  documentsIndexed: number;
  entitiesExtracted: number;
  relationshipsCreated: number;
  communitiesFormed: number;
  queriesProcessed: number;
  averageHops: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: GraphRAGConfig = {
  maxHops: 3,
  topK: 5,
  communityLevels: 3,
  minCommunitySize: 2,
  entityThreshold: 0.7,
  contextWindow: 4000,
};

// ============================================================================
// GraphRAG
// ============================================================================

export class GraphRAG extends EventEmitter {
  private config: GraphRAGConfig;
  private metrics: GraphRAGMetrics;

  // Graph storage
  private entities: Map<string, Entity> = new Map();
  private relationships: Map<string, Relationship[]> = new Map();  // sourceId -> relationships
  private reverseIndex: Map<string, Relationship[]> = new Map();   // targetId -> relationships
  private documents: Map<string, Document> = new Map();
  private communities: Map<string, Community> = new Map();

  // Entity name to ID index
  private entityNameIndex: Map<string, string> = new Map();

  // Simple embedding cache (in production, use actual embeddings)
  private embeddingCache: Map<string, number[]> = new Map();

  constructor(config: Partial<GraphRAGConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = {
      documentsIndexed: 0,
      entitiesExtracted: 0,
      relationshipsCreated: 0,
      communitiesFormed: 0,
      queriesProcessed: 0,
      averageHops: 0,
    };
  }

  // ============================================================================
  // Indexing
  // ============================================================================

  /**
   * Index a document
   */
  async index(content: string, metadata?: Record<string, unknown>): Promise<Document> {
    const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Extract entities
    const extractedEntities = this.extractEntities(content);

    // Create or link entities
    const entityIds: string[] = [];
    for (const entity of extractedEntities) {
      const entityId = await this.addEntity(entity);
      entityIds.push(entityId);
    }

    // Extract relationships between entities
    this.extractRelationships(content, entityIds);

    // Create document
    const doc: Document = {
      id: docId,
      content,
      entities: entityIds,
      embedding: this.computeEmbedding(content),
      metadata,
    };

    this.documents.set(docId, doc);
    this.metrics.documentsIndexed++;

    this.emit('document:indexed', doc);
    return doc;
  }

  /**
   * Extract entities from text (simplified NER)
   */
  private extractEntities(text: string): Partial<Entity>[] {
    const entities: Partial<Entity>[] = [];
    const words = text.split(/\s+/);

    // Simple heuristic: capitalize words are likely entities
    for (let i = 0; i < words.length; i++) {
      const word = words[i].replace(/[.,!?;:'"]/g, '');

      if (word.length > 1 && word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
        // Check for multi-word entities
        let entityName = word;
        let j = i + 1;

        while (
          j < words.length &&
          words[j][0] === words[j][0].toUpperCase() &&
          words[j][0] !== words[j][0].toLowerCase()
        ) {
          entityName += ' ' + words[j].replace(/[.,!?;:'"]/g, '');
          j++;
        }

        // Determine entity type (simplified)
        const type = this.inferEntityType(entityName, text);

        entities.push({
          name: entityName,
          type,
          description: this.extractDescription(entityName, text),
        });
      }
    }

    // Deduplicate by name
    const seen = new Set<string>();
    return entities.filter(e => {
      if (seen.has(e.name!)) return false;
      seen.add(e.name!);
      return true;
    });
  }

  /**
   * Infer entity type from context
   */
  private inferEntityType(name: string, context: string): string {
    const lowerContext = context.toLowerCase();
    const lowerName = name.toLowerCase();

    // Simple pattern matching
    if (lowerContext.includes(`${lowerName} is a city`) || lowerContext.includes(`capital of`)) {
      return 'City';
    }
    if (lowerContext.includes(`${lowerName} is a country`) || lowerContext.includes(`nation`)) {
      return 'Country';
    }
    if (lowerContext.includes(`${lowerName} is a person`) || lowerContext.includes(`born`)) {
      return 'Person';
    }
    if (lowerContext.includes(`${lowerName} is a company`) || lowerContext.includes(`founded`)) {
      return 'Organization';
    }
    if (lowerContext.includes(`continent`)) {
      return 'Continent';
    }

    return 'Entity';
  }

  /**
   * Extract description from surrounding context
   */
  private extractDescription(entityName: string, text: string): string {
    // Find sentence containing entity
    const sentences = text.split(/[.!?]+/);

    for (const sentence of sentences) {
      if (sentence.includes(entityName)) {
        return sentence.trim();
      }
    }

    return '';
  }

  /**
   * Add an entity to the graph
   */
  async addEntity(partial: Partial<Entity>): Promise<string> {
    // Check if entity already exists
    const existingId = this.entityNameIndex.get(partial.name!);
    if (existingId) {
      // Merge descriptions if different
      const existing = this.entities.get(existingId)!;
      if (partial.description && existing.description !== partial.description) {
        existing.description = `${existing.description} ${partial.description}`;
      }
      return existingId;
    }

    // Create new entity
    const id = `entity-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const entity: Entity = {
      id,
      name: partial.name!,
      type: partial.type || 'Entity',
      description: partial.description,
      embedding: this.computeEmbedding(partial.name!),
      metadata: partial.metadata,
    };

    this.entities.set(id, entity);
    this.entityNameIndex.set(entity.name, id);
    this.relationships.set(id, []);
    this.reverseIndex.set(id, []);

    this.metrics.entitiesExtracted++;
    this.emit('entity:added', entity);

    return id;
  }

  /**
   * Extract relationships from text
   */
  private extractRelationships(text: string, entityIds: string[]): void {
    // Get entity names
    const entityNames = entityIds.map(id => this.entities.get(id)?.name || '');

    // Simple relationship patterns
    const patterns = [
      { regex: /(\w+)\s+is\s+the\s+capital\s+of\s+(\w+)/gi, type: 'capitalOf' },
      { regex: /(\w+)\s+is\s+in\s+(\w+)/gi, type: 'locatedIn' },
      { regex: /(\w+)\s+is\s+part\s+of\s+(\w+)/gi, type: 'partOf' },
      { regex: /(\w+)\s+contains\s+(\w+)/gi, type: 'contains' },
      { regex: /(\w+)\s+borders\s+(\w+)/gi, type: 'borders' },
      { regex: /(\w+)\s+founded\s+(\w+)/gi, type: 'founded' },
      { regex: /(\w+)\s+works\s+at\s+(\w+)/gi, type: 'worksAt' },
      { regex: /(\w+)\s+and\s+(\w+)/gi, type: 'relatedTo' },
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        const sourceName = match[1];
        const targetName = match[2];

        // Find matching entities
        const sourceId = this.entityNameIndex.get(sourceName);
        const targetId = this.entityNameIndex.get(targetName);

        if (sourceId && targetId) {
          this.addRelationship(sourceId, targetId, pattern.type);
        }
      }
    }
  }

  /**
   * Add a relationship
   */
  addRelationship(
    sourceId: string,
    targetId: string,
    type: string,
    weight: number = 1.0,
    description?: string
  ): void {
    const rel: Relationship = {
      source: sourceId,
      target: targetId,
      type,
      weight,
      description,
    };

    // Add to forward index
    const sourceRels = this.relationships.get(sourceId) || [];
    sourceRels.push(rel);
    this.relationships.set(sourceId, sourceRels);

    // Add to reverse index
    const targetRels = this.reverseIndex.get(targetId) || [];
    targetRels.push(rel);
    this.reverseIndex.set(targetId, targetRels);

    this.metrics.relationshipsCreated++;
    this.emit('relationship:added', rel);
  }

  // ============================================================================
  // Community Detection
  // ============================================================================

  /**
   * Build community hierarchy
   */
  buildCommunities(): void {
    // Level 0: Individual entities
    const level0Communities: Community[] = [];

    for (const [entityId, entity] of this.entities) {
      const community: Community = {
        id: `comm-0-${entityId}`,
        entities: [entityId],
        level: 0,
        summary: entity.description,
        children: [],
      };

      level0Communities.push(community);
      this.communities.set(community.id, community);
    }

    // Build hierarchical levels
    let currentLevel = level0Communities;

    for (let level = 1; level <= this.config.communityLevels; level++) {
      const nextLevel = this.clusterCommunities(currentLevel, level);

      if (nextLevel.length === 0 || nextLevel.length === currentLevel.length) {
        break;
      }

      for (const comm of nextLevel) {
        this.communities.set(comm.id, comm);
      }

      currentLevel = nextLevel;
    }

    this.metrics.communitiesFormed = this.communities.size;
    this.emit('communities:built', { count: this.communities.size });
  }

  /**
   * Cluster communities into higher-level communities
   */
  private clusterCommunities(communities: Community[], level: number): Community[] {
    if (communities.length < 2) return [];

    const clusters: Community[] = [];
    const assigned = new Set<string>();

    // Simple clustering by connectivity
    for (const comm of communities) {
      if (assigned.has(comm.id)) continue;

      // Find connected communities
      const cluster: Community[] = [comm];
      assigned.add(comm.id);

      for (const other of communities) {
        if (assigned.has(other.id)) continue;

        if (this.communitiesConnected(comm, other)) {
          cluster.push(other);
          assigned.add(other.id);
        }

        if (cluster.length >= this.config.minCommunitySize * 2) break;
      }

      if (cluster.length >= this.config.minCommunitySize) {
        const newComm: Community = {
          id: `comm-${level}-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
          entities: cluster.flatMap(c => c.entities),
          level,
          summary: this.summarizeCommunity(cluster),
          children: cluster.map(c => c.id),
        };

        // Update parent references
        for (const child of cluster) {
          child.parent = newComm.id;
        }

        clusters.push(newComm);
      }
    }

    return clusters;
  }

  /**
   * Check if two communities are connected
   */
  private communitiesConnected(a: Community, b: Community): boolean {
    for (const entityA of a.entities) {
      const rels = this.relationships.get(entityA) || [];
      for (const rel of rels) {
        if (b.entities.includes(rel.target)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Summarize a community
   */
  private summarizeCommunity(communities: Community[]): string {
    const entityNames: string[] = [];

    for (const comm of communities) {
      for (const entityId of comm.entities) {
        const entity = this.entities.get(entityId);
        if (entity) {
          entityNames.push(entity.name);
        }
      }
    }

    return `Community containing: ${entityNames.slice(0, 5).join(', ')}${entityNames.length > 5 ? '...' : ''}`;
  }

  // ============================================================================
  // Retrieval
  // ============================================================================

  /**
   * Retrieve context for a query
   */
  async retrieve(query: string): Promise<RetrievalResult> {
    this.metrics.queriesProcessed++;

    // Extract query entities
    const queryEntities = this.extractEntities(query);
    const matchedEntityIds: string[] = [];

    // Match to known entities
    for (const qEntity of queryEntities) {
      const id = this.entityNameIndex.get(qEntity.name!);
      if (id) {
        matchedEntityIds.push(id);
      } else {
        // Fuzzy match
        const fuzzyMatch = this.fuzzyMatchEntity(qEntity.name!);
        if (fuzzyMatch) {
          matchedEntityIds.push(fuzzyMatch);
        }
      }
    }

    // Graph traversal from matched entities
    const visitedEntities = new Set<string>();
    const visitedDocs = new Set<string>();
    const collectedRels: Relationship[] = [];
    let totalHops = 0;

    const traverse = (entityId: string, hop: number): void => {
      if (hop > this.config.maxHops || visitedEntities.has(entityId)) return;

      visitedEntities.add(entityId);
      totalHops = Math.max(totalHops, hop);

      // Get relationships
      const rels = this.relationships.get(entityId) || [];
      const reverseRels = this.reverseIndex.get(entityId) || [];

      for (const rel of [...rels, ...reverseRels]) {
        collectedRels.push(rel);
        const nextId = rel.source === entityId ? rel.target : rel.source;
        traverse(nextId, hop + 1);
      }
    };

    // Start traversal
    for (const entityId of matchedEntityIds) {
      traverse(entityId, 0);
    }

    // Collect documents containing visited entities
    for (const [docId, doc] of this.documents) {
      for (const entityId of doc.entities) {
        if (visitedEntities.has(entityId)) {
          visitedDocs.add(docId);
          break;
        }
      }
    }

    // Get relevant communities
    const relevantCommunities: Community[] = [];
    for (const [, comm] of this.communities) {
      for (const entityId of comm.entities) {
        if (visitedEntities.has(entityId)) {
          relevantCommunities.push(comm);
          break;
        }
      }
    }

    // Rank and select top documents
    const rankedDocs = this.rankDocuments([...visitedDocs], query);

    // Build context
    const context = this.assembleContext(
      rankedDocs.slice(0, this.config.topK),
      [...visitedEntities].map(id => this.entities.get(id)!).filter(Boolean),
      collectedRels,
      relevantCommunities
    );

    // Calculate score
    const score = matchedEntityIds.length > 0
      ? visitedEntities.size / (this.entities.size || 1)
      : 0;

    // Update metrics
    this.metrics.averageHops =
      (this.metrics.averageHops * (this.metrics.queriesProcessed - 1) + totalHops) /
      this.metrics.queriesProcessed;

    const result: RetrievalResult = {
      documents: rankedDocs.slice(0, this.config.topK),
      entities: [...visitedEntities].map(id => this.entities.get(id)!).filter(Boolean),
      relationships: collectedRels,
      communities: relevantCommunities,
      context,
      score,
      hops: totalHops,
    };

    this.emit('retrieval:complete', result);
    return result;
  }

  /**
   * Fuzzy match entity name
   */
  private fuzzyMatchEntity(name: string): string | null {
    const lowerName = name.toLowerCase();
    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const [entityName, entityId] of this.entityNameIndex) {
      const score = this.stringSimilarity(lowerName, entityName.toLowerCase());
      if (score > bestScore && score > 0.6) {
        bestScore = score;
        bestMatch = entityId;
      }
    }

    return bestMatch;
  }

  /**
   * Simple string similarity (Jaccard)
   */
  private stringSimilarity(a: string, b: string): number {
    const setA = new Set(a.split(''));
    const setB = new Set(b.split(''));

    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size;
  }

  /**
   * Rank documents by relevance to query
   */
  private rankDocuments(docIds: string[], query: string): Document[] {
    const queryEmbedding = this.computeEmbedding(query);
    const docs = docIds.map(id => this.documents.get(id)!).filter(Boolean);

    // Score by embedding similarity
    const scored = docs.map(doc => ({
      doc,
      score: this.cosineSimilarity(queryEmbedding, doc.embedding || []),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.doc);
  }

  /**
   * Assemble context from retrieved elements
   */
  private assembleContext(
    documents: Document[],
    entities: Entity[],
    relationships: Relationship[],
    communities: Community[]
  ): string {
    const parts: string[] = [];
    let totalLength = 0;

    // Add community summaries first (high-level context)
    const topCommunities = communities
      .filter(c => c.level > 0)
      .sort((a, b) => b.level - a.level)
      .slice(0, 3);

    for (const comm of topCommunities) {
      if (comm.summary && totalLength + comm.summary.length < this.config.contextWindow) {
        parts.push(`[Community] ${comm.summary}`);
        totalLength += comm.summary.length;
      }
    }

    // Add entity descriptions
    for (const entity of entities.slice(0, 10)) {
      const desc = `${entity.name} (${entity.type}): ${entity.description || 'No description'}`;
      if (totalLength + desc.length < this.config.contextWindow) {
        parts.push(`[Entity] ${desc}`);
        totalLength += desc.length;
      }
    }

    // Add relationships
    for (const rel of relationships.slice(0, 10)) {
      const source = this.entities.get(rel.source);
      const target = this.entities.get(rel.target);
      if (source && target) {
        const desc = `${source.name} --[${rel.type}]--> ${target.name}`;
        if (totalLength + desc.length < this.config.contextWindow) {
          parts.push(`[Relationship] ${desc}`);
          totalLength += desc.length;
        }
      }
    }

    // Add document content
    for (const doc of documents) {
      if (totalLength + doc.content.length < this.config.contextWindow) {
        parts.push(`[Document] ${doc.content}`);
        totalLength += doc.content.length;
      } else if (totalLength < this.config.contextWindow * 0.9) {
        // Add truncated content
        const remaining = this.config.contextWindow - totalLength - 50;
        parts.push(`[Document] ${doc.content.slice(0, remaining)}...`);
        break;
      }
    }

    return parts.join('\n\n');
  }

  // ============================================================================
  // Embeddings (Simplified)
  // ============================================================================

  /**
   * Compute embedding (simplified bag-of-words)
   */
  private computeEmbedding(text: string): number[] {
    const cached = this.embeddingCache.get(text);
    if (cached) return cached;

    // Simple word frequency embedding
    const words = text.toLowerCase().split(/\s+/);
    const vocab = new Map<string, number>();

    for (const word of words) {
      vocab.set(word, (vocab.get(word) || 0) + 1);
    }

    // Create fixed-size vector
    const dim = 128;
    const embedding = new Array(dim).fill(0);

    for (const [word, count] of vocab) {
      const hash = this.hashString(word);
      const index = Math.abs(hash) % dim;
      embedding[index] += count;
    }

    // Normalize
    const norm = Math.sqrt(embedding.reduce((s, x) => s + x * x, 0)) || 1;
    const normalized = embedding.map(x => x / norm);

    this.embeddingCache.set(text, normalized);
    return normalized;
  }

  /**
   * Simple string hash
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  /**
   * Cosine similarity
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dot = 0, normA = 0, normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
  }

  // ============================================================================
  // Stats & Management
  // ============================================================================

  getMetrics(): GraphRAGMetrics {
    return { ...this.metrics };
  }

  getEntityCount(): number {
    return this.entities.size;
  }

  getDocumentCount(): number {
    return this.documents.size;
  }

  getRelationshipCount(): number {
    let count = 0;
    for (const rels of this.relationships.values()) {
      count += rels.length;
    }
    return count;
  }

  /**
   * Get entity by name
   */
  getEntity(name: string): Entity | null {
    const id = this.entityNameIndex.get(name);
    return id ? this.entities.get(id) || null : null;
  }

  /**
   * Get all entities
   */
  getAllEntities(): Entity[] {
    return [...this.entities.values()];
  }

  /**
   * Get all relationships
   */
  getAllRelationships(): Relationship[] {
    const all: Relationship[] = [];
    for (const rels of this.relationships.values()) {
      all.push(...rels);
    }
    return all;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.entities.clear();
    this.relationships.clear();
    this.reverseIndex.clear();
    this.documents.clear();
    this.communities.clear();
    this.entityNameIndex.clear();
    this.embeddingCache.clear();
    this.metrics = {
      documentsIndexed: 0,
      entitiesExtracted: 0,
      relationshipsCreated: 0,
      communitiesFormed: 0,
      queriesProcessed: 0,
      averageHops: 0,
    };
    this.emit('cleared');
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create GraphRAG instance
 */
export function createGraphRAG(config?: Partial<GraphRAGConfig>): GraphRAG {
  return new GraphRAG(config);
}

// ============================================================================
// Global Instance
// ============================================================================

let globalGraphRAG: GraphRAG | null = null;

/**
 * Get global GraphRAG instance
 */
export function getGraphRAG(config?: Partial<GraphRAGConfig>): GraphRAG {
  if (!globalGraphRAG) {
    globalGraphRAG = new GraphRAG(config);
  }
  return globalGraphRAG;
}

/**
 * Reset global GraphRAG
 */
export function resetGraphRAG(): void {
  if (globalGraphRAG) {
    globalGraphRAG.clear();
  }
  globalGraphRAG = null;
}
