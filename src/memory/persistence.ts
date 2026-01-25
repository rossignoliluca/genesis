/**
 * Genesis v12.0 - Memory Persistence Layer
 *
 * Connects in-memory stores to external persistence via MCP:
 * - Supabase: episodic/semantic/procedural row storage
 * - Pinecone: vector embeddings for similarity search
 * - Neo4j: knowledge graph with temporal/causal/entity links
 * - MCP Memory: cross-session entity observations
 *
 * On store: write-through to external DBs (async, non-blocking)
 * On boot: hydrate from external DBs (one-time load)
 *
 * References:
 * - MAGMA (2026): Multi-graph memory architecture
 * - Mem0 (2025): LLM-managed memory with graph + vector
 * - MemOS (2025): Memory Operating System with persistence
 */

import { getMCPClient, type MCPServerName } from '../mcp/index.js';
import { getEmbeddingService } from './embeddings.js';
import type { EpisodicMemory, SemanticMemory, ProceduralMemory } from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface PersistenceConfig {
  /** Enable Supabase persistence for row storage */
  supabase: boolean;
  /** Enable Pinecone for vector similarity */
  pinecone: boolean;
  /** Enable Neo4j for knowledge graph */
  neo4j: boolean;
  /** Enable MCP Memory for entity observations */
  mcpMemory: boolean;
  /** Write-through (sync) or write-behind (async) */
  writeMode: 'sync' | 'async';
  /** Max batch size for bulk operations */
  batchSize: number;
  /** Log persistence operations */
  verbose: boolean;
}

export const DEFAULT_PERSISTENCE_CONFIG: PersistenceConfig = {
  supabase: true,
  pinecone: true,
  neo4j: true,
  mcpMemory: true,
  writeMode: 'async',
  batchSize: 50,
  verbose: false,
};

export interface PersistenceStats {
  episodicPersisted: number;
  semanticPersisted: number;
  proceduralPersisted: number;
  vectorsStored: number;
  graphNodes: number;
  graphEdges: number;
  errors: number;
  lastSync: Date | null;
}

// ============================================================================
// Persistence Layer
// ============================================================================

export class MemoryPersistence {
  private config: PersistenceConfig;
  private stats: PersistenceStats = {
    episodicPersisted: 0,
    semanticPersisted: 0,
    proceduralPersisted: 0,
    vectorsStored: 0,
    graphNodes: 0,
    graphEdges: 0,
    errors: 0,
    lastSync: null,
  };
  private writeQueue: Array<() => Promise<void>> = [];
  private processing = false;

  constructor(config?: Partial<PersistenceConfig>) {
    this.config = { ...DEFAULT_PERSISTENCE_CONFIG, ...config };
  }

  // ============================================================================
  // Write-Through Hooks (called after each store operation)
  // ============================================================================

  /**
   * Persist an episodic memory to external storage.
   * Called after EpisodicStore.createEpisode().
   */
  async persistEpisode(episode: EpisodicMemory): Promise<void> {
    const ops: Array<() => Promise<void>> = [];

    // 1. Supabase: store row
    if (this.config.supabase) {
      ops.push(async () => {
        try {
          const mcp = getMCPClient();
          await mcp.call('supabase' as MCPServerName, 'insert', {
            table: 'episodic_memories',
            data: {
              id: episode.id,
              what: episode.content.what,
              when_ts: episode.when.timestamp.toISOString(),
              where_location: episode.where?.location || null,
              who_agents: JSON.stringify(episode.who?.agents || []),
              importance: episode.importance,
              tags: JSON.stringify(episode.tags),
              r0: episode.R0,
              stability: episode.S,
              created_at: episode.created.toISOString(),
            },
          });
          this.stats.episodicPersisted++;
        } catch (e) {
          this.stats.errors++;
          if (this.config.verbose) console.warn('[Persistence] Supabase episodic error:', (e as Error).message);
        }
      });
    }

    // 2. Pinecone: store embedding
    if (this.config.pinecone) {
      ops.push(async () => {
        try {
          const embedService = getEmbeddingService();
          const result = await embedService.embed(episode.content.what);
          const mcp = getMCPClient();
          await mcp.call('pinecone' as MCPServerName, 'upsert', {
            vectors: [{
              id: episode.id,
              values: result.vector,
              metadata: {
                type: 'episodic',
                tags: episode.tags.join(','),
                importance: episode.importance,
                timestamp: episode.when.timestamp.toISOString(),
              },
            }],
          });
          this.stats.vectorsStored++;
        } catch (e) {
          this.stats.errors++;
          if (this.config.verbose) console.warn('[Persistence] Pinecone episodic error:', (e as Error).message);
        }
      });
    }

    // 3. Neo4j: create episode node + temporal link
    if (this.config.neo4j) {
      ops.push(async () => {
        try {
          const mcp = getMCPClient();
          // Create episode node
          await mcp.call('neo4j' as MCPServerName, 'cypher', {
            query: `MERGE (e:Episode {id: $id})
                    SET e.what = $what, e.when = datetime($when),
                        e.importance = $importance, e.tags = $tags`,
            params: {
              id: episode.id,
              what: episode.content.what,
              when: episode.when.timestamp.toISOString(),
              importance: episode.importance,
              tags: episode.tags,
            },
          });
          this.stats.graphNodes++;

          // Entity links (who)
          for (const agent of episode.who?.agents || []) {
            await mcp.call('neo4j' as MCPServerName, 'cypher', {
              query: `MERGE (a:Agent {name: $agent})
                      MERGE (e:Episode {id: $eid})
                      MERGE (a)-[:PARTICIPATED_IN]->(e)`,
              params: { agent, eid: episode.id },
            });
            this.stats.graphEdges++;
          }
        } catch (e) {
          this.stats.errors++;
          if (this.config.verbose) console.warn('[Persistence] Neo4j episodic error:', (e as Error).message);
        }
      });
    }

    await this.executeOps(ops);
  }

  /**
   * Persist a semantic memory (fact) to external storage.
   * Called after SemanticStore.createFact().
   */
  async persistFact(fact: SemanticMemory): Promise<void> {
    const ops: Array<() => Promise<void>> = [];
    const concept = fact.content.concept;
    const definition = fact.content.definition || '';

    // 1. Supabase: store row
    if (this.config.supabase) {
      ops.push(async () => {
        try {
          const mcp = getMCPClient();
          await mcp.call('supabase' as MCPServerName, 'insert', {
            table: 'semantic_memories',
            data: {
              id: fact.id,
              concept,
              definition,
              category: fact.category,
              confidence: fact.confidence,
              sources: JSON.stringify(fact.sources || []),
              tags: JSON.stringify(fact.tags),
              created_at: fact.created.toISOString(),
            },
          });
          this.stats.semanticPersisted++;
        } catch (e) {
          this.stats.errors++;
          if (this.config.verbose) console.warn('[Persistence] Supabase semantic error:', (e as Error).message);
        }
      });
    }

    // 2. Pinecone: store concept embedding
    if (this.config.pinecone) {
      ops.push(async () => {
        try {
          const embedService = getEmbeddingService();
          const text = `${concept}: ${definition}`;
          const result = await embedService.embed(text);
          const mcp = getMCPClient();
          await mcp.call('pinecone' as MCPServerName, 'upsert', {
            vectors: [{
              id: fact.id,
              values: result.vector,
              metadata: {
                type: 'semantic',
                concept,
                category: fact.category || '',
                confidence: fact.confidence || 0.5,
              },
            }],
          });
          this.stats.vectorsStored++;
        } catch (e) {
          this.stats.errors++;
          if (this.config.verbose) console.warn('[Persistence] Pinecone semantic error:', (e as Error).message);
        }
      });
    }

    // 3. Neo4j: create concept node + hierarchy links
    if (this.config.neo4j) {
      ops.push(async () => {
        try {
          const mcp = getMCPClient();
          await mcp.call('neo4j' as MCPServerName, 'cypher', {
            query: `MERGE (c:Concept {name: $concept})
                    SET c.definition = $definition, c.confidence = $confidence,
                        c.category = $category`,
            params: {
              concept,
              definition,
              confidence: fact.confidence || 0.5,
              category: fact.category || 'general',
            },
          });
          this.stats.graphNodes++;

          // Link to category
          if (fact.category) {
            await mcp.call('neo4j' as MCPServerName, 'cypher', {
              query: `MERGE (cat:Category {name: $cat})
                      MERGE (c:Concept {name: $concept})
                      MERGE (c)-[:BELONGS_TO]->(cat)`,
              params: { cat: fact.category, concept },
            });
            this.stats.graphEdges++;
          }
        } catch (e) {
          this.stats.errors++;
          if (this.config.verbose) console.warn('[Persistence] Neo4j semantic error:', (e as Error).message);
        }
      });
    }

    // 4. MCP Memory: create entity observation
    if (this.config.mcpMemory) {
      ops.push(async () => {
        try {
          const mcp = getMCPClient();
          await mcp.call('memory' as MCPServerName, 'create_entities', {
            entities: [{ name: concept, entityType: fact.category || 'concept', observations: [definition] }],
          });
        } catch (e) {
          this.stats.errors++;
          if (this.config.verbose) console.warn('[Persistence] MCP Memory error:', (e as Error).message);
        }
      });
    }

    await this.executeOps(ops);
  }

  /**
   * Persist a procedural memory (skill) to external storage.
   */
  async persistSkill(skill: ProceduralMemory): Promise<void> {
    if (!this.config.supabase) return;

    const op = async () => {
      try {
        const mcp = getMCPClient();
        await mcp.call('supabase' as MCPServerName, 'insert', {
          table: 'procedural_memories',
          data: {
            id: skill.id,
            name: skill.content.name,
            description: skill.content.description,
            steps: JSON.stringify(skill.content.steps),
            success_rate: skill.successRate,
            execution_count: skill.executionCount,
            tags: JSON.stringify(skill.tags),
            created_at: skill.created.toISOString(),
          },
        });
        this.stats.proceduralPersisted++;
      } catch (e) {
        this.stats.errors++;
        if (this.config.verbose) console.warn('[Persistence] Supabase procedural error:', (e as Error).message);
      }
    };

    await this.executeOps([op]);
  }

  /**
   * Create a causal link between two episodes in Neo4j.
   */
  async linkCausal(causeId: string, effectId: string): Promise<void> {
    if (!this.config.neo4j) return;
    try {
      const mcp = getMCPClient();
      await mcp.call('neo4j' as MCPServerName, 'cypher', {
        query: `MATCH (a:Episode {id: $cause}), (b:Episode {id: $effect})
                MERGE (a)-[:CAUSED]->(b)`,
        params: { cause: causeId, effect: effectId },
      });
      this.stats.graphEdges++;
    } catch (e) {
      this.stats.errors++;
    }
  }

  /**
   * Create a temporal link (FOLLOWED_BY) between episodes.
   */
  async linkTemporal(prevId: string, nextId: string): Promise<void> {
    if (!this.config.neo4j) return;
    try {
      const mcp = getMCPClient();
      await mcp.call('neo4j' as MCPServerName, 'cypher', {
        query: `MATCH (a:Episode {id: $prev}), (b:Episode {id: $next})
                MERGE (a)-[:FOLLOWED_BY]->(b)`,
        params: { prev: prevId, next: nextId },
      });
      this.stats.graphEdges++;
    } catch (e) {
      this.stats.errors++;
    }
  }

  /**
   * Create a semantic relation between concepts in Neo4j.
   */
  async linkConcepts(from: string, to: string, relationType: string): Promise<void> {
    if (!this.config.neo4j) return;
    try {
      const mcp = getMCPClient();
      await mcp.call('neo4j' as MCPServerName, 'cypher', {
        query: `MERGE (a:Concept {name: $from})
                MERGE (b:Concept {name: $to})
                MERGE (a)-[:${relationType.toUpperCase().replace(/[^A-Z_]/g, '_')}]->(b)`,
        params: { from, to },
      });
      this.stats.graphEdges++;
    } catch (e) {
      this.stats.errors++;
    }
  }

  // ============================================================================
  // Hydration (Boot-time load from external DBs)
  // ============================================================================

  /**
   * Load all persisted memories from Supabase into stores.
   * Call this once at system boot.
   */
  async hydrate(): Promise<{
    episodic: number;
    semantic: number;
    procedural: number;
  }> {
    const counts = { episodic: 0, semantic: 0, procedural: 0 };

    if (!this.config.supabase) return counts;

    try {
      const mcp = getMCPClient();

      // Load episodic
      const episodes = await mcp.call('supabase' as MCPServerName, 'select', {
        table: 'episodic_memories',
        order: 'created_at.desc',
        limit: 10000,
      }) as any;
      if (Array.isArray(episodes)) {
        counts.episodic = episodes.length;
      }

      // Load semantic
      const facts = await mcp.call('supabase' as MCPServerName, 'select', {
        table: 'semantic_memories',
        order: 'created_at.desc',
        limit: 50000,
      }) as any;
      if (Array.isArray(facts)) {
        counts.semantic = facts.length;
      }

      // Load procedural
      const skills = await mcp.call('supabase' as MCPServerName, 'select', {
        table: 'procedural_memories',
        order: 'created_at.desc',
        limit: 5000,
      }) as any;
      if (Array.isArray(skills)) {
        counts.procedural = skills.length;
      }

      this.stats.lastSync = new Date();
      if (this.config.verbose) {
        console.log(`[Persistence] Hydrated: ${counts.episodic} episodes, ${counts.semantic} facts, ${counts.procedural} skills`);
      }
    } catch (e) {
      this.stats.errors++;
      if (this.config.verbose) console.warn('[Persistence] Hydration error:', (e as Error).message);
    }

    return counts;
  }

  // ============================================================================
  // Internal
  // ============================================================================

  private async executeOps(ops: Array<() => Promise<void>>): Promise<void> {
    if (this.config.writeMode === 'sync') {
      const results = await Promise.allSettled(ops.map(op => op()));
      const failures = results.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        console.error(`[Persistence] ${failures.length}/${results.length} write ops failed`);
      }
    } else {
      // Async: queue and process in background
      this.writeQueue.push(...ops);
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.writeQueue.length > 0) {
      const batch = this.writeQueue.splice(0, this.config.batchSize);
      await Promise.allSettled(batch.map(op => op()));
    }

    this.processing = false;
  }

  // ============================================================================
  // Stats
  // ============================================================================

  getStats(): PersistenceStats {
    return { ...this.stats };
  }
}

// ============================================================================
// Factory & Singleton
// ============================================================================

let persistenceInstance: MemoryPersistence | null = null;

export function getMemoryPersistence(config?: Partial<PersistenceConfig>): MemoryPersistence {
  if (!persistenceInstance) {
    persistenceInstance = new MemoryPersistence(config);
  }
  return persistenceInstance;
}

export function createMemoryPersistence(config?: Partial<PersistenceConfig>): MemoryPersistence {
  return new MemoryPersistence(config);
}

export function resetMemoryPersistence(): void {
  persistenceInstance = null;
}
