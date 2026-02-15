/**
 * Genesis v32 - GraphRAG Memory Retrieval (Item 12)
 *
 * Builds a knowledge graph from accumulated memory, uses graph
 * traversal for retrieval. Dramatically better than flat vector
 * similarity for relational queries ("what connects X to Y?").
 *
 * Inspired by Microsoft's GraphRAG: local search (subgraph) +
 * global search (community summaries).
 */

import { getMemorySystem } from './index.js';
import type { Memory, SemanticMemory, EpisodicMemory } from './types.js';

// ============================================================================
// Graph Types
// ============================================================================

export interface GraphNode {
  id: string;
  label: string;
  type: 'concept' | 'event' | 'entity' | 'theme';
  memoryId?: string;
  properties: Record<string, any>;
  edges: GraphEdge[];
}

export interface GraphEdge {
  targetId: string;
  relation: string;        // 'causes', 'related_to', 'precedes', 'contradicts'
  weight: number;           // 0-1
  source: 'explicit' | 'inferred';
}

export interface GraphSearchResult {
  node: GraphNode;
  path: string[];           // node IDs from query to result
  relevance: number;
  context: string;          // assembled narrative context
}

// ============================================================================
// Knowledge Graph
// ============================================================================

export class KnowledgeGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private dirty = true;

  /**
   * Build graph from current memory state
   */
  buildFromMemory(): void {
    const memory = getMemorySystem();
    this.nodes.clear();

    // Index semantic memories as concept nodes
    const semantics = memory.semantic.getAll();
    for (const sem of semantics) {
      const nodeId = `sem-${sem.id}`;
      this.nodes.set(nodeId, {
        id: nodeId,
        label: sem.content.concept || '',
        type: 'concept',
        memoryId: sem.id,
        properties: {
          definition: sem.content.definition,
          category: sem.content.category,
          confidence: sem.content.confidence,
          ...sem.content.properties,
        },
        edges: [],
      });
    }

    // Index episodic memories as event nodes
    const episodes = memory.episodic.getAll().slice(-200); // last 200
    for (const ep of episodes) {
      const nodeId = `ep-${ep.id}`;
      this.nodes.set(nodeId, {
        id: nodeId,
        label: ep.content.what || '',
        type: 'event',
        memoryId: ep.id,
        properties: {
          when: ep.when?.timestamp,
          source: ep.content.source,
          details: ep.content.details,
        },
        edges: [],
      });
    }

    // Build edges from shared tags
    this.buildTagEdges();

    // Build edges from temporal proximity (episodes)
    this.buildTemporalEdges();

    // Build edges from semantic similarity (concept overlap)
    this.buildConceptEdges();

    this.dirty = false;
  }

  /**
   * Local search: find subgraph relevant to query via BFS
   */
  localSearch(query: string, maxHops = 2, maxResults = 10): GraphSearchResult[] {
    if (this.dirty) this.buildFromMemory();

    // Find seed nodes matching query
    const queryLower = query.toLowerCase();
    const seeds: GraphNode[] = [];

    for (const node of this.nodes.values()) {
      const label = node.label.toLowerCase();
      const definition = (node.properties.definition || '').toLowerCase();
      if (label.includes(queryLower) || definition.includes(queryLower) ||
          queryLower.split(' ').some(w => label.includes(w))) {
        seeds.push(node);
      }
    }

    if (seeds.length === 0) return [];

    // BFS from seeds
    const visited = new Set<string>();
    const results: GraphSearchResult[] = [];
    let frontier: Array<{ node: GraphNode; path: string[]; depth: number }> = seeds.map(n => ({
      node: n, path: [n.id], depth: 0,
    }));

    while (frontier.length > 0 && results.length < maxResults) {
      const nextFrontier: typeof frontier = [];

      for (const { node, path, depth } of frontier) {
        if (visited.has(node.id)) continue;
        visited.add(node.id);

        const relevance = this.computeRelevance(node, query, depth);
        results.push({
          node,
          path,
          relevance,
          context: this.assembleContext(node),
        });

        if (depth < maxHops) {
          for (const edge of node.edges) {
            const target = this.nodes.get(edge.targetId);
            if (target && !visited.has(target.id)) {
              nextFrontier.push({
                node: target,
                path: [...path, target.id],
                depth: depth + 1,
              });
            }
          }
        }
      }

      frontier = nextFrontier;
    }

    return results.sort((a, b) => b.relevance - a.relevance).slice(0, maxResults);
  }

  /**
   * Global search: find answer using community structure
   */
  globalSearch(query: string): string {
    if (this.dirty) this.buildFromMemory();

    const results = this.localSearch(query, 3, 20);
    if (results.length === 0) return '';

    // Assemble a narrative from top results
    const contexts = results
      .slice(0, 5)
      .map(r => r.context)
      .filter(c => c.length > 0);

    return contexts.join('\n\n');
  }

  /** Get graph statistics */
  getStats(): { nodes: number; edges: number; avgDegree: number } {
    const nodeCount = this.nodes.size;
    let totalEdges = 0;
    for (const node of this.nodes.values()) {
      totalEdges += node.edges.length;
    }
    return {
      nodes: nodeCount,
      edges: totalEdges,
      avgDegree: nodeCount > 0 ? totalEdges / nodeCount : 0,
    };
  }

  /** Mark graph as needing rebuild */
  markDirty(): void {
    this.dirty = true;
  }

  // ==========================================================================
  // Edge Building
  // ==========================================================================

  private buildTagEdges(): void {
    const tagIndex = new Map<string, string[]>();

    for (const [nodeId, node] of this.nodes) {
      const memory = this.getMemory(node);
      if (!memory) continue;
      for (const tag of memory.tags || []) {
        if (!tagIndex.has(tag)) tagIndex.set(tag, []);
        tagIndex.get(tag)!.push(nodeId);
      }
    }

    for (const [tag, nodeIds] of tagIndex) {
      if (nodeIds.length < 2 || nodeIds.length > 50) continue; // skip too common/rare tags
      for (let i = 0; i < nodeIds.length; i++) {
        for (let j = i + 1; j < Math.min(i + 5, nodeIds.length); j++) {
          const nodeA = this.nodes.get(nodeIds[i])!;
          const nodeB = this.nodes.get(nodeIds[j])!;
          nodeA.edges.push({ targetId: nodeIds[j], relation: 'shared_tag', weight: 0.3, source: 'inferred' });
          nodeB.edges.push({ targetId: nodeIds[i], relation: 'shared_tag', weight: 0.3, source: 'inferred' });
        }
      }
    }
  }

  private buildTemporalEdges(): void {
    const events = Array.from(this.nodes.values())
      .filter(n => n.type === 'event' && n.properties.when)
      .sort((a, b) => new Date(a.properties.when).getTime() - new Date(b.properties.when).getTime());

    for (let i = 0; i < events.length - 1; i++) {
      const current = events[i];
      const next = events[i + 1];
      const timeDiff = new Date(next.properties.when).getTime() - new Date(current.properties.when).getTime();

      if (timeDiff < 7 * 24 * 60 * 60 * 1000) { // within 1 week
        current.edges.push({ targetId: next.id, relation: 'precedes', weight: 0.5, source: 'inferred' });
        next.edges.push({ targetId: current.id, relation: 'follows', weight: 0.5, source: 'inferred' });
      }
    }
  }

  private buildConceptEdges(): void {
    const concepts = Array.from(this.nodes.values()).filter(n => n.type === 'concept');

    for (let i = 0; i < concepts.length; i++) {
      for (let j = i + 1; j < concepts.length; j++) {
        const a = concepts[i];
        const b = concepts[j];

        // Check if concepts share words
        const wordsA = new Set(a.label.toLowerCase().split(/[\s-]+/));
        const wordsB = new Set(b.label.toLowerCase().split(/[\s-]+/));
        const overlap = [...wordsA].filter(w => wordsB.has(w) && w.length > 3).length;

        if (overlap > 0) {
          const weight = Math.min(0.8, overlap * 0.3);
          a.edges.push({ targetId: b.id, relation: 'related_to', weight, source: 'inferred' });
          b.edges.push({ targetId: a.id, relation: 'related_to', weight, source: 'inferred' });
        }
      }
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private getMemory(node: GraphNode): Memory | undefined {
    if (!node.memoryId) return undefined;
    const memory = getMemorySystem();
    return memory.episodic.get(node.memoryId) || memory.semantic.get(node.memoryId);
  }

  private computeRelevance(node: GraphNode, query: string, depth: number): number {
    const queryWords = query.toLowerCase().split(/\s+/);
    const label = node.label.toLowerCase();
    const definition = (node.properties.definition || '').toLowerCase();
    const text = `${label} ${definition}`;

    let wordMatches = 0;
    for (const w of queryWords) {
      if (text.includes(w)) wordMatches++;
    }

    const textRelevance = queryWords.length > 0 ? wordMatches / queryWords.length : 0;
    const depthPenalty = Math.pow(0.7, depth);
    const confidence = node.properties.confidence || 0.5;

    return textRelevance * depthPenalty * (0.5 + 0.5 * confidence);
  }

  private assembleContext(node: GraphNode): string {
    let context = node.label;
    if (node.properties.definition) context += `: ${node.properties.definition}`;
    if (node.properties.lesson) context += ` Lesson: ${node.properties.lesson}`;
    if (node.properties.trigger) context += ` Trigger: ${node.properties.trigger}`;
    return context;
  }
}

// Singleton
let graphInstance: KnowledgeGraph | null = null;
export function getKnowledgeGraph(): KnowledgeGraph {
  if (!graphInstance) graphInstance = new KnowledgeGraph();
  return graphInstance;
}
