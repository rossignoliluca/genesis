/**
 * Genesis Production Memory Layer - FASE 3
 *
 * Hybrid memory architecture for production-grade AI:
 * - Pinecone: Vector database for semantic similarity search
 * - Neo4j: Knowledge graph for relational reasoning
 * - PostgreSQL: Structured data and transaction logs
 *
 * Implements the "Goldfish Problem" solution with:
 * - Long-term semantic memory (vector embeddings)
 * - Relational memory (knowledge graphs)
 * - Episodic memory (conversation/interaction logs)
 * - Procedural memory (learned skills and patterns)
 *
 * All MCP interactions go through the centralized getMCPClient.
 */

import { getMCPClient } from '../mcp/index.js';
import type { MCPServerName } from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface MemoryEntry {
  id: string;
  content: string;
  type: 'semantic' | 'episodic' | 'procedural' | 'relational';
  embedding?: number[];
  metadata: {
    timestamp: string;
    source: string;
    importance: number;
    accessCount: number;
    lastAccessed?: string;
    tags?: string[];
    relations?: string[];
  };
}

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  type: MemoryEntry['type'];
  metadata: MemoryEntry['metadata'];
}

export interface KnowledgeNode {
  id: string;
  type: string;
  name: string;
  properties: Record<string, unknown>;
}

export interface KnowledgeEdge {
  from: string;
  to: string;
  type: string;
  properties?: Record<string, unknown>;
  weight?: number;
}

export interface MemoryStats {
  totalEntries: number;
  byType: Record<string, number>;
  avgImportance: number;
  oldestEntry: string;
  newestEntry: string;
  storageUsed: { vectors: number; graph: number; sql: number };
}

// ============================================================================
// Pinecone Vector Memory
// ============================================================================

export class VectorMemory {
  private connected = false;
  private indexName: string;
  private dimension: number;

  constructor(config?: { apiKey?: string; indexName?: string; dimension?: number }) {
    this.indexName = config?.indexName || 'genesis-memory';
    this.dimension = config?.dimension || 1536;
  }

  async connect(): Promise<boolean> {
    if (!process.env.PINECONE_API_KEY) {
      console.warn('[VectorMemory] No PINECONE_API_KEY configured');
      return false;
    }
    this.connected = true;
    await this.ensureIndex();
    return true;
  }

  private async ensureIndex(): Promise<void> {
    if (!this.connected) return;

    try {
      const client = getMCPClient();
      await client.call('pinecone' as MCPServerName, 'create_index', {
        name: this.indexName,
        dimension: this.dimension,
        metric: 'cosine',
        spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
      });
    } catch (error) {
      console.log('[VectorMemory] Index check:', error);
    }
  }

  async store(entry: {
    id: string;
    content: string;
    embedding: number[];
    metadata?: Record<string, unknown>;
  }): Promise<{ success: boolean; error?: string }> {
    if (!this.connected) {
      return { success: false, error: 'Not connected to Pinecone' };
    }

    try {
      const client = getMCPClient();
      await client.call('pinecone' as MCPServerName, 'upsert_vectors', {
        indexName: this.indexName,
        vectors: [{
          id: entry.id,
          values: entry.embedding,
          metadata: {
            content: entry.content,
            ...entry.metadata,
            timestamp: new Date().toISOString(),
          },
        }],
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async search(queryEmbedding: number[], options?: {
    topK?: number;
    filter?: Record<string, unknown>;
    includeMetadata?: boolean;
  }): Promise<SearchResult[]> {
    if (!this.connected) return [];

    try {
      const client = getMCPClient();
      const result = await client.call('pinecone' as MCPServerName, 'query_vectors', {
        indexName: this.indexName,
        vector: queryEmbedding,
        topK: options?.topK || 10,
        filter: options?.filter,
        includeMetadata: options?.includeMetadata ?? true,
      });

      const matches = result.data?.matches || [];
      return matches.map((match: any) => ({
        id: match.id,
        content: match.metadata?.content || '',
        score: match.score,
        type: match.metadata?.type || 'semantic',
        metadata: {
          timestamp: match.metadata?.timestamp || '',
          source: match.metadata?.source || 'unknown',
          importance: match.metadata?.importance || 0.5,
          accessCount: match.metadata?.accessCount || 0,
          tags: match.metadata?.tags || [],
        },
      }));
    } catch (error) {
      console.error('[VectorMemory] Search failed:', error);
      return [];
    }
  }

  async delete(ids: string[]): Promise<{ success: boolean; error?: string }> {
    if (!this.connected) {
      return { success: false, error: 'Not connected to Pinecone' };
    }

    try {
      const client = getMCPClient();
      await client.call('pinecone' as MCPServerName, 'delete_vectors', {
        indexName: this.indexName,
        ids,
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getStats(): Promise<{ vectorCount: number; dimension: number } | null> {
    if (!this.connected) return null;

    try {
      const client = getMCPClient();
      const result = await client.call('pinecone' as MCPServerName, 'describe_index_stats', {
        indexName: this.indexName,
      });
      return {
        vectorCount: result.data?.totalVectorCount || 0,
        dimension: result.data?.dimension || this.dimension,
      };
    } catch (error) {
      console.error('[VectorMemory] Stats failed:', error);
      return null;
    }
  }
}

// ============================================================================
// Neo4j Knowledge Graph
// ============================================================================

export class KnowledgeGraph {
  private connected = false;
  private uri: string;
  private user: string;

  constructor(config?: { uri?: string; user?: string; password?: string }) {
    this.uri = config?.uri || process.env.NEO4J_URI || 'bolt://localhost:7687';
    this.user = config?.user || process.env.NEO4J_USER || 'neo4j';
  }

  async connect(): Promise<boolean> {
    if (!process.env.NEO4J_PASSWORD) {
      console.warn('[KnowledgeGraph] No NEO4J_PASSWORD configured');
      return false;
    }
    this.connected = true;
    await this.initializeSchema();
    return true;
  }

  private async initializeSchema(): Promise<void> {
    if (!this.connected) return;

    try {
      await this.runQuery(`
        CREATE INDEX memory_id IF NOT EXISTS FOR (m:Memory) ON (m.id);
        CREATE INDEX entity_name IF NOT EXISTS FOR (e:Entity) ON (e.name);
        CREATE INDEX skill_name IF NOT EXISTS FOR (s:Skill) ON (s.name);
        CREATE INDEX event_timestamp IF NOT EXISTS FOR (e:Event) ON (e.timestamp);
      `);
    } catch (error) {
      console.log('[KnowledgeGraph] Schema initialization:', error);
    }
  }

  async runQuery(query: string, params?: Record<string, unknown>): Promise<unknown[]> {
    if (!this.connected) return [];

    try {
      const client = getMCPClient();
      const result = await client.call('neo4j' as MCPServerName, 'run_cypher_query', {
        query,
        parameters: params || {},
      });
      return result.data?.records || [];
    } catch (error) {
      console.error('[KnowledgeGraph] Query failed:', error);
      return [];
    }
  }

  async addNode(node: KnowledgeNode): Promise<{ success: boolean; error?: string }> {
    const propsString = Object.entries(node.properties)
      .map(([k, v]) => `${k}: $${k}`)
      .join(', ');

    const query = `
      MERGE (n:${node.type} {id: $id})
      SET n.name = $name, ${propsString}
      RETURN n
    `;

    try {
      await this.runQuery(query, { id: node.id, name: node.name, ...node.properties });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async addEdge(edge: KnowledgeEdge): Promise<{ success: boolean; error?: string }> {
    const propsString = edge.properties
      ? ', ' + Object.entries(edge.properties).map(([k, v]) => `r.${k} = $${k}`).join(', ')
      : '';

    const query = `
      MATCH (a {id: $from}), (b {id: $to})
      MERGE (a)-[r:${edge.type}]->(b)
      SET r.weight = $weight ${propsString}
      RETURN r
    `;

    try {
      await this.runQuery(query, {
        from: edge.from,
        to: edge.to,
        weight: edge.weight || 1.0,
        ...edge.properties,
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async findRelated(nodeId: string, options?: {
    maxHops?: number;
    relationTypes?: string[];
    limit?: number;
  }): Promise<KnowledgeNode[]> {
    const hops = options?.maxHops || 2;
    const limit = options?.limit || 20;
    const relationFilter = options?.relationTypes?.length
      ? `:${options.relationTypes.join('|')}`
      : '';

    const query = `
      MATCH (n {id: $nodeId})-[r${relationFilter}*1..${hops}]-(related)
      RETURN DISTINCT related
      LIMIT $limit
    `;

    try {
      const results = await this.runQuery(query, { nodeId, limit });
      return results.map((r: any) => ({
        id: r.related.id,
        type: r.related.labels?.[0] || 'Unknown',
        name: r.related.name,
        properties: r.related,
      }));
    } catch (error) {
      console.error('[KnowledgeGraph] findRelated failed:', error);
      return [];
    }
  }

  async findPath(fromId: string, toId: string): Promise<{
    path: KnowledgeNode[];
    relations: string[];
  } | null> {
    const query = `
      MATCH path = shortestPath((a {id: $from})-[*..5]-(b {id: $to}))
      RETURN nodes(path) as nodes, relationships(path) as rels
    `;

    try {
      const results = await this.runQuery(query, { from: fromId, to: toId });
      if (results.length === 0) return null;

      const result: any = results[0];
      return {
        path: result.nodes.map((n: any) => ({
          id: n.id,
          type: n.labels?.[0] || 'Unknown',
          name: n.name,
          properties: n,
        })),
        relations: result.rels.map((r: any) => r.type),
      };
    } catch (error) {
      console.error('[KnowledgeGraph] findPath failed:', error);
      return null;
    }
  }

  async getNode(id: string): Promise<KnowledgeNode | null> {
    const query = `MATCH (n {id: $id}) RETURN n`;

    try {
      const results = await this.runQuery(query, { id });
      if (results.length === 0) return null;

      const node: any = (results[0] as any).n;
      return {
        id: node.id,
        type: node.labels?.[0] || 'Unknown',
        name: node.name,
        properties: node,
      };
    } catch (error) {
      return null;
    }
  }

  async searchNodes(searchTerm: string, nodeType?: string): Promise<KnowledgeNode[]> {
    const typeFilter = nodeType ? `:${nodeType}` : '';
    const query = `
      MATCH (n${typeFilter})
      WHERE n.name CONTAINS $term OR n.id CONTAINS $term
      RETURN n
      LIMIT 20
    `;

    try {
      const results = await this.runQuery(query, { term: searchTerm });
      return results.map((r: any) => ({
        id: r.n.id,
        type: r.n.labels?.[0] || 'Unknown',
        name: r.n.name,
        properties: r.n,
      }));
    } catch (error) {
      return [];
    }
  }
}

// ============================================================================
// PostgreSQL Structured Memory
// ============================================================================

export class StructuredMemory {
  private connected = false;
  private connectionString: string;

  constructor(connectionString?: string) {
    this.connectionString = connectionString || process.env.POSTGRES_CONNECTION_STRING || '';
  }

  async connect(): Promise<boolean> {
    if (!this.connectionString) {
      console.warn('[StructuredMemory] No POSTGRES_CONNECTION_STRING configured');
      return false;
    }
    this.connected = true;
    await this.initializeSchema();
    return true;
  }

  private async initializeSchema(): Promise<void> {
    if (!this.connected) return;

    const schema = `
      CREATE TABLE IF NOT EXISTS memories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        content TEXT NOT NULL,
        type VARCHAR(50) NOT NULL,
        importance FLOAT DEFAULT 0.5,
        access_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_accessed TIMESTAMP,
        metadata JSONB DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS episodic_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id VARCHAR(100) NOT NULL,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS skills (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        code TEXT,
        success_rate FLOAT DEFAULT 0,
        use_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
      CREATE INDEX IF NOT EXISTS idx_episodic_session ON episodic_logs(session_id);
      CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
    `;

    try {
      await this.query(schema);
    } catch (error) {
      console.log('[StructuredMemory] Schema initialization:', error);
    }
  }

  async query(sql: string, params?: unknown[]): Promise<unknown[]> {
    if (!this.connected) return [];

    try {
      const client = getMCPClient();
      const result = await client.call('postgres' as MCPServerName, 'query', {
        sql,
        params: params || [],
      });
      return result.data?.rows || [];
    } catch (error) {
      console.error('[StructuredMemory] Query failed:', error);
      return [];
    }
  }

  async storeMemory(entry: Omit<MemoryEntry, 'id'>): Promise<string | null> {
    const sql = `
      INSERT INTO memories (content, type, importance, metadata)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `;

    try {
      const results = await this.query(sql, [
        entry.content,
        entry.type,
        entry.metadata.importance,
        JSON.stringify(entry.metadata),
      ]);
      return (results[0] as any)?.id || null;
    } catch (error) {
      return null;
    }
  }

  async logEpisode(entry: {
    sessionId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<string | null> {
    const sql = `
      INSERT INTO episodic_logs (session_id, role, content, metadata)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `;

    try {
      const results = await this.query(sql, [
        entry.sessionId,
        entry.role,
        entry.content,
        JSON.stringify(entry.metadata || {}),
      ]);
      return (results[0] as any)?.id || null;
    } catch (error) {
      return null;
    }
  }

  async storeSkill(skill: {
    name: string;
    description: string;
    code?: string;
  }): Promise<{ success: boolean; id?: string; error?: string }> {
    const sql = `
      INSERT INTO skills (name, description, code)
      VALUES ($1, $2, $3)
      ON CONFLICT (name) DO UPDATE SET
        description = EXCLUDED.description,
        code = EXCLUDED.code,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id
    `;

    try {
      const results = await this.query(sql, [skill.name, skill.description, skill.code || null]);
      return { success: true, id: (results[0] as any)?.id };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getSessionHistory(sessionId: string, limit: number = 50): Promise<{
    role: string;
    content: string;
    timestamp: string;
  }[]> {
    const sql = `
      SELECT role, content, timestamp
      FROM episodic_logs
      WHERE session_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `;

    try {
      const results = await this.query(sql, [sessionId, limit]);
      return results as any[];
    } catch (error) {
      return [];
    }
  }

  async getImportantMemories(type?: string, limit: number = 20): Promise<MemoryEntry[]> {
    let sql = `
      SELECT id, content, type, importance, access_count, created_at, last_accessed, metadata
      FROM memories
    `;

    const params: unknown[] = [];
    if (type) {
      sql += ' WHERE type = $1';
      params.push(type);
    }
    sql += ` ORDER BY importance DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    try {
      const results = await this.query(sql, params);
      return results.map((r: any) => ({
        id: r.id,
        content: r.content,
        type: r.type,
        metadata: {
          timestamp: r.created_at,
          source: r.metadata?.source || 'unknown',
          importance: r.importance,
          accessCount: r.access_count,
          lastAccessed: r.last_accessed,
          tags: r.metadata?.tags || [],
        },
      }));
    } catch (error) {
      return [];
    }
  }

  async recordSkillUsage(skillName: string, success: boolean): Promise<void> {
    const sql = `
      UPDATE skills SET
        use_count = use_count + 1,
        success_rate = (success_rate * use_count + $2) / (use_count + 1)
      WHERE name = $1
    `;

    await this.query(sql, [skillName, success ? 1 : 0]);
  }
}

// ============================================================================
// Unified Memory System
// ============================================================================

export class ProductionMemory {
  public vectors: VectorMemory;
  public graph: KnowledgeGraph;
  public structured: StructuredMemory;

  private embeddingFn: ((text: string) => Promise<number[]>) | null = null;
  private initialized = false;

  constructor(config?: {
    pinecone?: { apiKey?: string; indexName?: string };
    neo4j?: { uri?: string; user?: string; password?: string };
    postgres?: string;
  }) {
    this.vectors = new VectorMemory(config?.pinecone);
    this.graph = new KnowledgeGraph(config?.neo4j);
    this.structured = new StructuredMemory(config?.postgres);
  }

  setEmbeddingFunction(fn: (text: string) => Promise<number[]>): void {
    this.embeddingFn = fn;
  }

  async initialize(): Promise<{
    vectors: boolean;
    graph: boolean;
    structured: boolean;
  }> {
    if (this.initialized) {
      return { vectors: true, graph: true, structured: true };
    }

    const [vectors, graph, structured] = await Promise.all([
      this.vectors.connect(),
      this.graph.connect(),
      this.structured.connect(),
    ]);

    this.initialized = true;

    console.log('[ProductionMemory] Initialized:', { vectors, graph, structured });
    return { vectors, graph, structured };
  }

  async store(entry: {
    content: string;
    type: MemoryEntry['type'];
    source: string;
    importance?: number;
    tags?: string[];
    relations?: { toId: string; type: string }[];
  }): Promise<{ id: string; success: boolean; error?: string }> {
    const id = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Store in structured DB
    await this.structured.storeMemory({
      content: entry.content,
      type: entry.type,
      metadata: {
        timestamp: new Date().toISOString(),
        source: entry.source,
        importance: entry.importance || 0.5,
        accessCount: 0,
        tags: entry.tags || [],
      },
    });

    // Store in vector DB (if embedding function available)
    if (this.embeddingFn) {
      try {
        const embedding = await this.embeddingFn(entry.content);
        await this.vectors.store({
          id,
          content: entry.content,
          embedding,
          metadata: {
            type: entry.type,
            source: entry.source,
            importance: entry.importance || 0.5,
            tags: entry.tags || [],
          },
        });
      } catch (error) {
        console.warn('[ProductionMemory] Vector storage failed:', error);
      }
    }

    // Add to knowledge graph
    await this.graph.addNode({
      id,
      type: 'Memory',
      name: entry.content.slice(0, 100),
      properties: {
        fullContent: entry.content,
        memoryType: entry.type,
        source: entry.source,
        importance: entry.importance || 0.5,
      },
    });

    // Create relations in graph
    if (entry.relations) {
      for (const rel of entry.relations) {
        await this.graph.addEdge({
          from: id,
          to: rel.toId,
          type: rel.type,
        });
      }
    }

    return { id, success: true };
  }

  async recall(query: string, options?: {
    types?: MemoryEntry['type'][];
    limit?: number;
    minImportance?: number;
    includeRelated?: boolean;
  }): Promise<SearchResult[]> {
    const limit = options?.limit || 10;
    const results: SearchResult[] = [];

    // Semantic search (if embedding function available)
    if (this.embeddingFn) {
      try {
        const embedding = await this.embeddingFn(query);
        const vectorResults = await this.vectors.search(embedding, {
          topK: limit,
          filter: options?.types ? { type: { $in: options.types } } : undefined,
        });
        results.push(...vectorResults);
      } catch (error) {
        console.warn('[ProductionMemory] Semantic search failed:', error);
      }
    }

    // Graph search for related concepts
    if (options?.includeRelated !== false) {
      const graphResults = await this.graph.searchNodes(query.slice(0, 50));
      for (const node of graphResults.slice(0, 5)) {
        const related = await this.graph.findRelated(node.id, { maxHops: 1, limit: 3 });
        for (const rel of related) {
          if (!results.find(r => r.id === rel.id)) {
            results.push({
              id: rel.id,
              content: (rel.properties as any).fullContent || rel.name,
              score: 0.7,
              type: (rel.properties as any).memoryType || 'relational',
              metadata: {
                timestamp: '',
                source: (rel.properties as any).source || 'graph',
                importance: (rel.properties as any).importance || 0.5,
                accessCount: 0,
              },
            });
          }
        }
      }
    }

    // Structured search for important memories
    const importantMemories = await this.structured.getImportantMemories(
      options?.types?.[0],
      5
    );
    for (const mem of importantMemories) {
      if (!results.find(r => r.id === mem.id)) {
        results.push({
          id: mem.id,
          content: mem.content,
          score: mem.metadata.importance,
          type: mem.type,
          metadata: mem.metadata,
        });
      }
    }

    // Sort by score and apply importance filter
    return results
      .filter(r => !options?.minImportance || r.metadata.importance >= options.minImportance)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async logInteraction(sessionId: string, role: 'user' | 'assistant' | 'system', content: string): Promise<void> {
    await this.structured.logEpisode({
      sessionId,
      role,
      content,
    });

    // Store important interactions in long-term memory
    if (content.length > 200 || role === 'assistant') {
      await this.store({
        content,
        type: 'episodic',
        source: `session:${sessionId}`,
        importance: role === 'assistant' ? 0.6 : 0.4,
      });
    }
  }

  async learnSkill(skill: {
    name: string;
    description: string;
    code?: string;
    relatedConcepts?: string[];
  }): Promise<{ success: boolean; skillId?: string }> {
    // Store in structured DB
    const result = await this.structured.storeSkill({
      name: skill.name,
      description: skill.description,
      code: skill.code,
    });

    if (!result.success) {
      return { success: false };
    }

    // Add to knowledge graph
    const skillId = `skill_${skill.name.replace(/\s+/g, '_').toLowerCase()}`;
    await this.graph.addNode({
      id: skillId,
      type: 'Skill',
      name: skill.name,
      properties: {
        description: skill.description,
        hasCode: !!skill.code,
      },
    });

    // Link to related concepts
    if (skill.relatedConcepts) {
      for (const concept of skill.relatedConcepts) {
        const nodes = await this.graph.searchNodes(concept);
        if (nodes.length > 0) {
          await this.graph.addEdge({
            from: skillId,
            to: nodes[0].id,
            type: 'RELATES_TO',
          });
        }
      }
    }

    return { success: true, skillId };
  }

  async getStats(): Promise<MemoryStats | null> {
    const vectorStats = await this.vectors.getStats();
    const memories = await this.structured.query('SELECT type, COUNT(*) as count FROM memories GROUP BY type');
    const importantMemories = await this.structured.getImportantMemories(undefined, 1);

    const byType: Record<string, number> = {};
    for (const row of memories as any[]) {
      byType[row.type] = parseInt(row.count);
    }

    const totalEntries = Object.values(byType).reduce((a, b) => a + b, 0);

    return {
      totalEntries,
      byType,
      avgImportance: importantMemories[0]?.metadata.importance || 0.5,
      oldestEntry: 'N/A',
      newestEntry: new Date().toISOString(),
      storageUsed: {
        vectors: vectorStats?.vectorCount || 0,
        graph: 0,
        sql: totalEntries,
      },
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let productionMemoryInstance: ProductionMemory | null = null;

export function getProductionMemory(config?: {
  pinecone?: { apiKey?: string; indexName?: string };
  neo4j?: { uri?: string; user?: string; password?: string };
  postgres?: string;
}): ProductionMemory {
  if (!productionMemoryInstance) {
    productionMemoryInstance = new ProductionMemory(config);
  }
  return productionMemoryInstance;
}

export default ProductionMemory;
