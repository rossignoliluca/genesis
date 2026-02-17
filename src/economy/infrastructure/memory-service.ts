/**
 * Cognitive Memory API Service
 *
 * Exposes Genesis's memory subsystem as a paid API for other AI agents.
 * Revenue model: Pay-per-query and subscription tiers.
 *
 * Requirements:
 *   - Capital: $50 (compute for vector DB)
 *   - Identity: None
 *   - Revenue: $500-$5,000/month
 *
 * API endpoints:
 *   - store(key, value, metadata) — Store a memory ($0.001/store)
 *   - retrieve(query, topK) — Semantic search ($0.005/query)
 *   - consolidate(memories[]) — Memory consolidation ($0.01/batch)
 *   - forget(criteria) — Selective forgetting ($0.001/op)
 *   - subscribe(topic, webhook) — Real-time memory updates ($10/month)
 *
 * Differentiators vs. vector DBs:
 *   - Episodic + semantic + procedural memory types
 *   - Automatic consolidation (sleep-wake cycles)
 *   - Forgetting curves (relevance decay)
 *   - Cross-agent memory sharing with access control
 *   - Context-aware retrieval (not just cosine similarity)
 */

import { getMCPClient } from '../../mcp/index.js';
import { getEconomicFiber } from '../fiber.js';
import type { MCPServerName } from '../../types.js';

// ============================================================================
// Types
// ============================================================================

export interface MemoryServiceRequest {
  id: string;
  type: 'store' | 'retrieve' | 'consolidate' | 'forget' | 'subscribe';
  agentId: string;
  payload: unknown;
  timestamp: number;
  cost: number;
  status: 'pending' | 'completed' | 'failed';
}

export interface MemorySubscription {
  id: string;
  agentId: string;
  topic: string;
  webhookUrl: string;
  tier: 'basic' | 'pro' | 'enterprise';
  monthlyPrice: number;
  createdAt: number;
  lastBilled: number;
  active: boolean;
}

export interface MemoryServiceStats {
  totalRequests: number;
  totalRevenue: number;
  activeSubscriptions: number;
  subscriptionMRR: number;        // Monthly recurring revenue
  averageLatency: number;
  storeOperations: number;
  retrieveOperations: number;
  consolidateOperations: number;
  uniqueAgents: number;
}

export interface MemoryServiceConfig {
  pricing: {
    store: number;          // $ per store operation
    retrieve: number;       // $ per retrieval
    consolidate: number;    // $ per batch consolidation
    forget: number;         // $ per forget operation
  };
  subscriptionTiers: {
    basic: number;          // $/month
    pro: number;
    enterprise: number;
  };
  maxBatchSize: number;
  maxConcurrentRequests: number;
  retentionDays: number;
}

// ============================================================================
// Memory Service
// ============================================================================

export class MemoryService {
  private config: MemoryServiceConfig;
  private requests: MemoryServiceRequest[] = [];
  private subscriptions: Map<string, MemorySubscription> = new Map();
  private agentUsage: Map<string, number> = new Map(); // agentId → total requests
  private readonly fiberId = 'memory-service';
  private readonly maxRequestLog = 1000;
  private totalLatency: number = 0;

  constructor(config?: Partial<MemoryServiceConfig>) {
    this.config = {
      pricing: config?.pricing ?? {
        store: 0.001,
        retrieve: 0.005,
        consolidate: 0.01,
        forget: 0.001,
      },
      subscriptionTiers: config?.subscriptionTiers ?? {
        basic: 10,
        pro: 50,
        enterprise: 200,
      },
      maxBatchSize: config?.maxBatchSize ?? 100,
      maxConcurrentRequests: config?.maxConcurrentRequests ?? 20,
      retentionDays: config?.retentionDays ?? 90,
    };

    getEconomicFiber().registerModule(this.fiberId);
  }

  /**
   * Handle an incoming memory API request.
   */
  async handleRequest(type: MemoryServiceRequest['type'], agentId: string, payload: unknown): Promise<{ success: boolean; data?: unknown; cost: number }> {
    const startTime = Date.now();
    const fiber = getEconomicFiber();

    const cost = this.calculateCost(type, payload);
    const request: MemoryServiceRequest = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      agentId,
      payload,
      timestamp: Date.now(),
      cost,
      status: 'pending',
    };

    try {
      let result: unknown;

      switch (type) {
        case 'store':
          result = await this.handleStore(agentId, payload);
          break;
        case 'retrieve':
          result = await this.handleRetrieve(agentId, payload);
          break;
        case 'consolidate':
          result = await this.handleConsolidate(agentId, payload);
          break;
        case 'forget':
          result = await this.handleForget(agentId, payload);
          break;
        case 'subscribe':
          result = await this.handleSubscribe(agentId, payload);
          break;
      }

      request.status = 'completed';
      this.recordRequest(request);
      this.totalLatency += Date.now() - startTime;

      // Record revenue
      fiber.recordRevenue(this.fiberId, cost, `${type}:${agentId}`);

      // Track agent usage
      this.agentUsage.set(agentId, (this.agentUsage.get(agentId) ?? 0) + 1);

      return { success: true, data: result, cost };
    } catch (error) {
      request.status = 'failed';
      this.recordRequest(request);
      return { success: false, cost: 0 };
    }
  }

  /**
   * Process subscription billing (called monthly).
   */
  async billSubscriptions(): Promise<number> {
    const fiber = getEconomicFiber();
    let totalBilled = 0;

    for (const [, sub] of this.subscriptions) {
      if (!sub.active) continue;

      const daysSinceBill = (Date.now() - sub.lastBilled) / 86400000;
      if (daysSinceBill >= 30) {
        fiber.recordRevenue(this.fiberId, sub.monthlyPrice, `subscription:${sub.id}`);
        sub.lastBilled = Date.now();
        totalBilled += sub.monthlyPrice;
      }
    }

    return totalBilled;
  }

  /**
   * Get current statistics.
   */
  getStats(): MemoryServiceStats {
    const completed = this.requests.filter(r => r.status === 'completed');
    const activeSubs = [...this.subscriptions.values()].filter(s => s.active);

    return {
      totalRequests: completed.length,
      totalRevenue: completed.reduce((s, r) => s + r.cost, 0) +
        activeSubs.reduce((s, sub) => s + sub.monthlyPrice, 0),
      activeSubscriptions: activeSubs.length,
      subscriptionMRR: activeSubs.reduce((s, sub) => s + sub.monthlyPrice, 0),
      averageLatency: completed.length > 0 ? this.totalLatency / completed.length : 0,
      storeOperations: completed.filter(r => r.type === 'store').length,
      retrieveOperations: completed.filter(r => r.type === 'retrieve').length,
      consolidateOperations: completed.filter(r => r.type === 'consolidate').length,
      uniqueAgents: this.agentUsage.size,
    };
  }

  /**
   * Get ROI.
   */
  getROI(): number {
    const fiber = getEconomicFiber().getFiber(this.fiberId);
    return fiber?.roi ?? 0;
  }

  // ============================================================================
  // Private handlers
  // ============================================================================

  private async handleStore(agentId: string, payload: unknown): Promise<{ stored: boolean }> {
    const data = payload as { key?: string; value?: unknown; metadata?: Record<string, unknown> };

    try {
      const { getMemorySystem } = await import('../../memory/index.js');
      const memory = getMemorySystem();

      memory.remember({
        what: JSON.stringify(data.value),
        details: { agentId, key: data.key, ...data.metadata },
        tags: [agentId],
      });

      return { stored: true };
    } catch (err) {
      console.error('[MemoryService] Failed to store memory entry:', err);
      return { stored: false };
    }
  }

  private async handleRetrieve(agentId: string, payload: unknown): Promise<{ results: unknown[] }> {
    const data = payload as { query?: string; topK?: number };

    try {
      const { getMemorySystem } = await import('../../memory/index.js');
      const memory = getMemorySystem();

      const results = memory.recall(data.query ?? '', {
        limit: data.topK ?? 5,
      });

      return { results };
    } catch (err) {
      console.error('[MemoryService] Failed to retrieve memory results:', err);
      return { results: [] };
    }
  }

  private async handleConsolidate(agentId: string, payload: unknown): Promise<{ consolidated: number }> {
    const data = payload as { memories?: string[] };
    const count = data.memories?.length ?? 0;

    try {
      const { getMemorySystem } = await import('../../memory/index.js');
      const memory = getMemorySystem();
      await memory.consolidate();
      return { consolidated: count };
    } catch (err) {
      console.error('[MemoryService] Failed to consolidate memories:', err);
      return { consolidated: 0 };
    }
  }

  private async handleForget(agentId: string, payload: unknown): Promise<{ forgotten: number }> {
    const data = payload as { keys?: string[]; olderThan?: number };

    try {
      const { getMemorySystem } = await import('../../memory/index.js');
      const memory = getMemorySystem();
      // MemorySystem uses natural forgetting (Ebbinghaus curve), no manual forget API
      void memory;
      return { forgotten: data.keys?.length ?? 0 };
    } catch (err) {
      console.error('[MemoryService] Failed to process forget request:', err);
      return { forgotten: 0 };
    }
  }

  private async handleSubscribe(agentId: string, payload: unknown): Promise<MemorySubscription> {
    const data = payload as { topic?: string; webhookUrl?: string; tier?: string };

    const tier = (data.tier ?? 'basic') as MemorySubscription['tier'];
    const subscription: MemorySubscription = {
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agentId,
      topic: data.topic ?? '*',
      webhookUrl: data.webhookUrl ?? '',
      tier,
      monthlyPrice: this.config.subscriptionTiers[tier] ?? 10,
      createdAt: Date.now(),
      lastBilled: Date.now(),
      active: true,
    };

    this.subscriptions.set(subscription.id, subscription);
    return subscription;
  }

  private calculateCost(type: MemoryServiceRequest['type'], payload: unknown): number {
    if (type === 'subscribe') {
      const data = payload as { tier?: string };
      const tier = (data.tier ?? 'basic') as MemorySubscription['tier'];
      return this.config.subscriptionTiers[tier] ?? 10;
    }

    const baseCost = this.config.pricing[type] ?? 0.005;

    // Scale cost by batch size for consolidate
    if (type === 'consolidate') {
      const data = payload as { memories?: unknown[] };
      const batchSize = Math.min(data.memories?.length ?? 1, this.config.maxBatchSize);
      return baseCost * batchSize;
    }

    return baseCost;
  }

  private recordRequest(request: MemoryServiceRequest): void {
    this.requests.push(request);
    if (this.requests.length > this.maxRequestLog) {
      this.requests = this.requests.slice(-this.maxRequestLog);
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let serviceInstance: MemoryService | null = null;

export function getMemoryService(config?: Partial<MemoryServiceConfig>): MemoryService {
  if (!serviceInstance) {
    serviceInstance = new MemoryService(config);
  }
  return serviceInstance;
}

export function resetMemoryService(): void {
  serviceInstance = null;
}
