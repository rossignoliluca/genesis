/**
 * Genesis 4.0 - Memory Agent
 *
 * Manages memory with Ebbinghaus forgetting curve.
 * Stores, retrieves, consolidates, and forgets.
 *
 * Key formula: R(t) = e^(-t/S)
 * where R = retention, t = time, S = stability
 */

import { BaseAgent, registerAgentFactory } from './base-agent.js';
import { MessageBus, messageBus } from './message-bus.js';
import {
  Message,
  MessageType,
  MemoryItem,
  MemoryQuery,
  Feeling,
} from './types.js';
import { randomUUID } from 'crypto';

// ============================================================================
// Constants
// ============================================================================

const MEMORY_THRESHOLDS = {
  CONSOLIDATE: 0.7,       // Min score for long-term
  KEEP_SHORT: 0.3,        // Min score for short-term
  FORGET: 0.01,           // Below this = forgotten
  SIMILARITY_MERGE: 0.85, // Threshold for merging similar memories
};

const MEMORY_LIMITS = {
  WORKING: 9,             // 7±2 rule
  SHORT_TERM: 100,
  LONG_TERM: 10000,
};

const STABILITY_MULTIPLIER = {
  SUCCESS: 2.5,           // Multiply stability on successful recall
  IMPORTANCE_BOOST: 1.5,  // Additional boost for important memories
  EMOTIONAL_BOOST: 2.0,   // Additional boost for emotional memories
};

// ============================================================================
// Memory Agent
// ============================================================================

export class MemoryAgent extends BaseAgent {
  // Memory stores
  private workingMemory: MemoryItem[] = [];
  private shortTermMemory: Map<string, MemoryItem> = new Map();
  private longTermMemory: Map<string, MemoryItem> = new Map();

  // Associations graph
  private associations: Map<string, Set<string>> = new Map();

  // Consolidation timer
  private consolidationInterval: NodeJS.Timeout | null = null;
  private lastConsolidation: Date = new Date();

  constructor(bus: MessageBus = messageBus) {
    super({ type: 'memory' }, bus);
    this.startConsolidationCycle();
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  protected getMessageTypes(): MessageType[] {
    return ['MEMORY_STORE', 'MEMORY_RETRIEVE', 'QUERY', 'COMMAND'];
  }

  async process(message: Message): Promise<Message | null> {
    switch (message.type) {
      case 'MEMORY_STORE':
        return this.handleStore(message);
      case 'MEMORY_RETRIEVE':
        return this.handleRetrieve(message);
      case 'QUERY':
        return this.handleQuery(message);
      case 'COMMAND':
        return this.handleCommand(message);
      default:
        return null;
    }
  }

  // ============================================================================
  // Store
  // ============================================================================

  private async handleStore(message: Message): Promise<Message | null> {
    const { content, type, importance, emotionalValence, associations } = message.payload;

    const memory = this.store(content, {
      type: type || 'episodic',
      importance: importance || 0.5,
      emotionalValence: emotionalValence || 0,
      associations: associations || [],
    });

    this.log(`Stored memory: ${memory.id.slice(0, 8)} (importance: ${memory.importance})`);

    return {
      ...this.createResponse(message, 'RESPONSE', { memoryId: memory.id, success: true }),
      id: '',
      timestamp: new Date(),
    };
  }

  store(
    content: any,
    options: {
      type?: 'episodic' | 'semantic' | 'procedural';
      importance?: number;
      emotionalValence?: number;
      associations?: string[];
    } = {}
  ): MemoryItem {
    const now = new Date();

    // Calculate initial strength based on importance and emotion
    const baseStrength = 1.0;
    const importanceBoost = (options.importance || 0.5) * 0.5;
    const emotionalBoost = Math.abs(options.emotionalValence || 0) * 0.3;

    const memory: MemoryItem = {
      id: randomUUID(),
      type: options.type || 'episodic',
      content,
      created: now,
      lastAccessed: now,
      accessCount: 1,
      R0: baseStrength + importanceBoost + emotionalBoost,
      S: 1.0, // Initial stability = 1 day
      importance: options.importance || 0.5,
      emotionalValence: options.emotionalValence || 0,
      associations: options.associations || [],
      consolidated: false,
    };

    // Add to working memory
    this.addToWorkingMemory(memory);

    // Update associations
    this.updateAssociations(memory);

    return memory;
  }

  private addToWorkingMemory(memory: MemoryItem): void {
    this.workingMemory.push(memory);

    // Enforce capacity limit
    while (this.workingMemory.length > MEMORY_LIMITS.WORKING) {
      const evicted = this.workingMemory.shift()!;
      // Move to short-term
      this.shortTermMemory.set(evicted.id, evicted);
    }
  }

  // ============================================================================
  // Retrieve
  // ============================================================================

  private async handleRetrieve(message: Message): Promise<Message | null> {
    const query: MemoryQuery = message.payload;
    const memories = this.retrieve(query);

    return {
      ...this.createResponse(message, 'RESPONSE', { memories, count: memories.length }),
      id: '',
      timestamp: new Date(),
    };
  }

  retrieve(query: MemoryQuery): MemoryItem[] {
    const results: MemoryItem[] = [];

    // Search all memory stores
    const allMemories = [
      ...this.workingMemory,
      ...this.shortTermMemory.values(),
      ...this.longTermMemory.values(),
    ];

    for (const memory of allMemories) {
      if (this.matchesQuery(memory, query)) {
        // Update retention on access
        this.accessMemory(memory);
        results.push(memory);
      }
    }

    // Sort by current strength
    results.sort((a, b) => this.getRetention(b) - this.getRetention(a));

    // Apply limit
    if (query.limit) {
      return results.slice(0, query.limit);
    }

    return results;
  }

  private matchesQuery(memory: MemoryItem, query: MemoryQuery): boolean {
    // Type filter
    if (query.type && memory.type !== query.type) return false;

    // Importance filter
    if (query.minImportance && memory.importance < query.minImportance) return false;

    // Time range filter
    if (query.timeRange) {
      if (memory.created < query.timeRange.start) return false;
      if (memory.created > query.timeRange.end) return false;
    }

    // Keyword filter
    if (query.keywords && query.keywords.length > 0) {
      const contentStr = JSON.stringify(memory.content).toLowerCase();
      const hasKeyword = query.keywords.some((k) =>
        contentStr.includes(k.toLowerCase())
      );
      if (!hasKeyword) return false;
    }

    // Check if memory is still "alive" (retention > FORGET threshold)
    if (this.getRetention(memory) < MEMORY_THRESHOLDS.FORGET) {
      return false;
    }

    return true;
  }

  private accessMemory(memory: MemoryItem): void {
    memory.lastAccessed = new Date();
    memory.accessCount++;

    // Strengthen stability on successful recall (FSRS-style)
    memory.S *= STABILITY_MULTIPLIER.SUCCESS;

    // Bonus for important memories
    if (memory.importance > 0.7) {
      memory.S *= STABILITY_MULTIPLIER.IMPORTANCE_BOOST;
    }

    // Bonus for emotional memories
    if (Math.abs(memory.emotionalValence) > 0.5) {
      memory.S *= STABILITY_MULTIPLIER.EMOTIONAL_BOOST;
    }
  }

  // ============================================================================
  // Query (semantic search)
  // ============================================================================

  private async handleQuery(message: Message): Promise<Message | null> {
    const { query, limit } = message.payload;
    const memories = this.semanticSearch(query, limit || 10);

    return {
      ...this.createResponse(message, 'RESPONSE', { memories, count: memories.length }),
      id: '',
      timestamp: new Date(),
    };
  }

  semanticSearch(query: string, limit: number = 10): MemoryItem[] {
    // Simple keyword-based search (would use embeddings in production)
    const keywords = query.toLowerCase().split(/\s+/);

    return this.retrieve({
      keywords,
      limit,
    });
  }

  // ============================================================================
  // Ebbinghaus Forgetting Curve
  // ============================================================================

  /**
   * Calculate current retention using Ebbinghaus formula
   * R(t) = e^(-t/S)
   */
  getRetention(memory: MemoryItem): number {
    const now = Date.now();
    const lastAccess = memory.lastAccessed.getTime();
    const elapsedDays = (now - lastAccess) / (1000 * 60 * 60 * 24);

    // R = R0 * e^(-t/S)
    const retention = memory.R0 * Math.exp(-elapsedDays / memory.S);

    return Math.max(0, Math.min(1, retention));
  }

  // ============================================================================
  // Consolidation Cycle
  // ============================================================================

  private startConsolidationCycle(): void {
    // Run consolidation every 10 minutes (simulated "sleep")
    this.consolidationInterval = setInterval(() => {
      this.consolidate();
    }, 10 * 60 * 1000);
  }

  /**
   * Consolidation process (runs during "sleep")
   * 1. Scan working memory
   * 2. Evaluate each memory
   * 3. Decide: consolidate, keep, or forget
   * 4. Compress similar memories
   * 5. Prune weak memories
   */
  consolidate(): void {
    this.log('Starting consolidation cycle...');

    let consolidated = 0;
    let forgotten = 0;
    let kept = 0;

    // Process short-term memories
    for (const [id, memory] of this.shortTermMemory) {
      const score = this.calculateConsolidationScore(memory);

      if (score >= MEMORY_THRESHOLDS.CONSOLIDATE) {
        // Move to long-term
        memory.consolidated = true;
        this.longTermMemory.set(id, memory);
        this.shortTermMemory.delete(id);
        consolidated++;
      } else if (score < MEMORY_THRESHOLDS.KEEP_SHORT) {
        // Forget
        this.shortTermMemory.delete(id);
        this.removeAssociations(memory);
        forgotten++;
      } else {
        kept++;
      }
    }

    // Prune weak long-term memories
    for (const [id, memory] of this.longTermMemory) {
      const retention = this.getRetention(memory);
      if (retention < MEMORY_THRESHOLDS.FORGET) {
        this.longTermMemory.delete(id);
        this.removeAssociations(memory);
        forgotten++;
      }
    }

    this.lastConsolidation = new Date();
    this.log(`Consolidation complete: ${consolidated} consolidated, ${forgotten} forgotten, ${kept} kept`);

    // Broadcast consolidation event
    this.broadcast('MEMORY_STORE', {
      event: 'consolidation',
      consolidated,
      forgotten,
      kept,
      totalMemories: this.getTotalMemoryCount(),
    });
  }

  private calculateConsolidationScore(memory: MemoryItem): number {
    const retention = this.getRetention(memory);
    const associationCount = this.associations.get(memory.id)?.size || 0;
    const recency = 1 / (1 + (Date.now() - memory.lastAccessed.getTime()) / (1000 * 60 * 60 * 24));

    // Score = importance * (1 + associations) * retention * recency
    const score = memory.importance * (1 + associationCount * 0.1) * retention * recency;

    return Math.min(1, score);
  }

  // ============================================================================
  // Associations
  // ============================================================================

  private updateAssociations(memory: MemoryItem): void {
    if (!this.associations.has(memory.id)) {
      this.associations.set(memory.id, new Set());
    }

    for (const assocId of memory.associations) {
      // Bidirectional association
      this.associations.get(memory.id)!.add(assocId);

      if (!this.associations.has(assocId)) {
        this.associations.set(assocId, new Set());
      }
      this.associations.get(assocId)!.add(memory.id);
    }
  }

  private removeAssociations(memory: MemoryItem): void {
    const assocs = this.associations.get(memory.id);
    if (assocs) {
      for (const assocId of assocs) {
        this.associations.get(assocId)?.delete(memory.id);
      }
      this.associations.delete(memory.id);
    }
  }

  getAssociations(memoryId: string): string[] {
    return Array.from(this.associations.get(memoryId) || []);
  }

  // ============================================================================
  // Commands
  // ============================================================================

  private async handleCommand(message: Message): Promise<Message | null> {
    const { command, params } = message.payload;

    switch (command) {
      case 'consolidate':
        this.consolidate();
        return {
          ...this.createResponse(message, 'RESPONSE', { success: true }),
          id: '',
          timestamp: new Date(),
        };

      case 'stats':
        return {
          ...this.createResponse(message, 'RESPONSE', this.getStats()),
          id: '',
          timestamp: new Date(),
        };

      case 'clear':
        this.clear();
        return {
          ...this.createResponse(message, 'RESPONSE', { success: true }),
          id: '',
          timestamp: new Date(),
        };

      default:
        return null;
    }
  }

  // ============================================================================
  // Stats
  // ============================================================================

  getStats() {
    return {
      workingMemory: this.workingMemory.length,
      shortTermMemory: this.shortTermMemory.size,
      longTermMemory: this.longTermMemory.size,
      totalMemories: this.getTotalMemoryCount(),
      associations: this.associations.size,
      lastConsolidation: this.lastConsolidation,
    };
  }

  getTotalMemoryCount(): number {
    return this.workingMemory.length + this.shortTermMemory.size + this.longTermMemory.size;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  clear(): void {
    this.workingMemory = [];
    this.shortTermMemory.clear();
    this.longTermMemory.clear();
    this.associations.clear();
  }

  shutdown(): void {
    if (this.consolidationInterval) {
      clearInterval(this.consolidationInterval);
    }
    super.shutdown();
  }
}

// ============================================================================
// Register Factory
// ============================================================================

registerAgentFactory('memory', (bus) => new MemoryAgent(bus));

export function createMemoryAgent(bus?: MessageBus): MemoryAgent {
  return new MemoryAgent(bus);
}
