/**
 * Content Module - Full System Integration
 *
 * Wires the content module to all Genesis subsystems:
 * - Memory: Store content as episodic/semantic memories
 * - Revenue: Track content monetization
 * - Dashboard: Real-time observability
 * - Content Engine: Leverage existing generation pipeline
 * - Economic Fiber: Cost/revenue accounting
 */

import type { Platform, ContentType, ContentResult, ContentPerformance } from './types.js';
import { getContentOrchestrator } from './orchestrator.js';
import { getContentScheduler } from './scheduler/index.js';
import { getAnalyticsAggregator } from './analytics/index.js';

// =============================================================================
// Memory Integration
// =============================================================================

export interface ContentMemoryIntegration {
  /** Store content creation as episodic memory */
  rememberContentCreated(content: ContentResult): void;
  /** Store content publication as episodic memory */
  rememberContentPublished(contentId: string, platform: Platform, url: string): void;
  /** Learn topic knowledge as semantic memory */
  learnTopic(topic: string, keywords: string[], insights: string[]): void;
  /** Store content workflow as procedural memory */
  learnContentWorkflow(type: ContentType, steps: string[]): void;
  /** Recall relevant past content for context */
  recallSimilarContent(topic: string, limit?: number): Promise<unknown[]>;
}

export function createMemoryIntegration(
  memorySystem: {
    remember: (opts: { what: string; details?: unknown; tags?: string[] }) => void;
    learn: (opts: { concept: string; definition: string; category?: string; confidence?: number }) => void;
    learnSkill: (opts: { name: string; description: string; steps: Array<{ action: string; description?: string }> }) => void;
    recall: (query: string, opts?: { limit?: number }) => unknown[];
    semanticRecall?: (query: string, opts?: { topK?: number }) => Promise<Array<{ memory: unknown; score: number }>>;
  }
): ContentMemoryIntegration {
  return {
    rememberContentCreated(content: ContentResult) {
      memorySystem.remember({
        what: `Created ${content.draft.type}: "${content.draft.title}"`,
        details: {
          contentId: content.id,
          type: content.draft.type,
          title: content.draft.title,
          keywords: content.draft.keywords,
          platforms: content.adaptedContent.map(a => a.platform),
          seoScore: content.draft.seoScore?.overall,
          status: content.status,
        },
        tags: ['content:created', `type:${content.draft.type}`, ...content.draft.keywords.slice(0, 3)],
      });
    },

    rememberContentPublished(contentId: string, platform: Platform, url: string) {
      memorySystem.remember({
        what: `Published content to ${platform}`,
        details: {
          contentId,
          platform,
          url,
          publishedAt: new Date().toISOString(),
        },
        tags: ['content:published', `platform:${platform}`],
      });
    },

    learnTopic(topic: string, keywords: string[], insights: string[]) {
      memorySystem.learn({
        concept: topic,
        definition: `Topic with keywords: ${keywords.join(', ')}. Insights: ${insights.join('; ')}`,
        category: 'content-topics',
        confidence: 0.8,
      });
    },

    learnContentWorkflow(type: ContentType, steps: string[]) {
      memorySystem.learnSkill({
        name: `content-workflow-${type}`,
        description: `Workflow for creating ${type} content`,
        steps: steps.map((step, i) => ({
          action: `step-${i + 1}`,
          description: step,
        })),
      });
    },

    async recallSimilarContent(topic: string, limit = 5): Promise<unknown[]> {
      if (memorySystem.semanticRecall) {
        const results = await memorySystem.semanticRecall(topic, { topK: limit });
        return results.map(r => r.memory);
      }
      return memorySystem.recall(topic, { limit });
    },
  };
}

// =============================================================================
// Revenue Integration
// =============================================================================

export interface ContentRevenueIntegration {
  /** Record revenue from content monetization */
  recordRevenue(contentId: string, platform: Platform, amount: number, source: string): void;
  /** Record cost of content generation */
  recordCost(amount: number, category: string): void;
  /** Get content-specific revenue metrics */
  getContentRevenueMetrics(): { totalRevenue: number; totalCost: number; roi: number };
  /** Check if content opportunity is worth pursuing */
  evaluateOpportunity(estimatedRevenue: number, estimatedCost: number): { pursue: boolean; reason: string };
}

export function createRevenueIntegration(
  fiber: {
    recordRevenue: (module: string, amount: number, source: string) => void;
    recordCost: (module: string, amount: number, category: string) => void;
    getGlobalSection: () => { totalRevenue: number; totalCosts: number; netFlow: number };
  },
  revenueTracker?: {
    recordRevenue: (amount: number, source: string) => void;
    getMetrics?: () => { totalRevenue: number };
  }
): ContentRevenueIntegration {
  let contentRevenue = 0;
  let contentCost = 0;

  return {
    recordRevenue(contentId: string, platform: Platform, amount: number, source: string) {
      contentRevenue += amount;
      fiber.recordRevenue('content', amount, `${platform}:${source}:${contentId}`);
      revenueTracker?.recordRevenue?.(amount, `content:${platform}`);

      // Also track in analytics
      getAnalyticsAggregator().recordRevenue(contentId, amount);
    },

    recordCost(amount: number, category: string) {
      contentCost += amount;
      fiber.recordCost('content', amount, category);
    },

    getContentRevenueMetrics() {
      return {
        totalRevenue: contentRevenue,
        totalCost: contentCost,
        roi: contentCost > 0 ? (contentRevenue - contentCost) / contentCost : 0,
      };
    },

    evaluateOpportunity(estimatedRevenue: number, estimatedCost: number) {
      const expectedRoi = estimatedCost > 0 ? (estimatedRevenue - estimatedCost) / estimatedCost : 0;
      const minRoi = 0.5; // 50% minimum ROI threshold

      if (expectedRoi >= minRoi) {
        return { pursue: true, reason: `Expected ROI ${(expectedRoi * 100).toFixed(0)}% meets threshold` };
      }
      return { pursue: false, reason: `Expected ROI ${(expectedRoi * 100).toFixed(0)}% below ${minRoi * 100}% threshold` };
    },
  };
}

// =============================================================================
// Dashboard Integration
// =============================================================================

export interface ContentDashboardIntegration {
  /** Broadcast content creation event */
  broadcastCreated(content: ContentResult): void;
  /** Broadcast content publication event */
  broadcastPublished(contentId: string, platform: Platform, url: string, success: boolean): void;
  /** Broadcast content engagement update */
  broadcastEngagement(performance: ContentPerformance): void;
  /** Broadcast content revenue event */
  broadcastRevenue(contentId: string, platform: Platform, amount: number): void;
  /** Broadcast scheduler status */
  broadcastSchedulerStatus(scheduled: number, published: number, failed: number): void;
}

export function createDashboardIntegration(
  broadcast: (type: string, data: unknown) => void
): ContentDashboardIntegration {
  return {
    broadcastCreated(content: ContentResult) {
      broadcast('content.created', {
        id: content.id,
        title: content.draft.title,
        type: content.draft.type,
        keywords: content.draft.keywords,
        platforms: content.adaptedContent.map(a => a.platform),
        seoScore: content.draft.seoScore?.overall,
        status: content.status,
        timestamp: new Date().toISOString(),
      });
    },

    broadcastPublished(contentId: string, platform: Platform, url: string, success: boolean) {
      broadcast('content.published', {
        contentId,
        platform,
        url,
        success,
        timestamp: new Date().toISOString(),
      });
    },

    broadcastEngagement(performance: ContentPerformance) {
      broadcast('content.engagement', {
        contentId: performance.contentId,
        title: performance.title,
        totalImpressions: performance.totalImpressions,
        totalEngagements: performance.totalEngagements,
        engagementRate: performance.engagementRate,
        revenue: performance.revenue,
        byPlatform: performance.byPlatform,
        timestamp: new Date().toISOString(),
      });
    },

    broadcastRevenue(contentId: string, platform: Platform, amount: number) {
      broadcast('content.revenue', {
        contentId,
        platform,
        amount,
        timestamp: new Date().toISOString(),
      });
    },

    broadcastSchedulerStatus(scheduled: number, published: number, failed: number) {
      broadcast('content.scheduler', {
        scheduled,
        published,
        failed,
        total: scheduled + published + failed,
        timestamp: new Date().toISOString(),
      });
    },
  };
}

// =============================================================================
// Content Engine Integration (existing generator)
// =============================================================================

export interface ContentEngineIntegration {
  /** Use existing engine to scan for trending topics */
  scanTopics(): Promise<Array<{ topic: string; score: number; sources: string[] }>>;
  /** Use existing engine to generate content */
  generateFromEngine(topic: string, type: string): Promise<{ title: string; content: string } | null>;
  /** Get stats from existing engine */
  getEngineStats(): { totalPublished: number; totalRevenue: number; topTopic: string } | null;
}

export function createEngineIntegration(
  engine?: {
    scanTopics?: () => Promise<Array<{ topic: string; score: number; sources: string[] }>>;
    generate?: () => Promise<{ title: string; content: string } | null>;
    getStats?: () => { totalPublished: number; totalRevenue: number; topTopic: string };
  }
): ContentEngineIntegration {
  return {
    async scanTopics() {
      if (engine?.scanTopics) {
        return engine.scanTopics();
      }
      // Fallback: return empty if no engine
      return [];
    },

    async generateFromEngine(topic: string, type: string) {
      if (engine?.generate) {
        return engine.generate();
      }
      return null;
    },

    getEngineStats() {
      if (engine?.getStats) {
        return engine.getStats();
      }
      return null;
    },
  };
}

// =============================================================================
// Metrics Integration
// =============================================================================

export interface ContentMetrics {
  contentCreatedTotal: number;
  contentPublishedTotal: number;
  contentFailedTotal: number;
  avgGenerationTimeMs: number;
  avgEngagementRate: number;
  totalRevenue: number;
  byPlatform: Record<Platform, { published: number; engagements: number; revenue: number }>;
  byType: Record<ContentType, { created: number; published: number }>;
}

export function createMetricsCollector(): {
  recordCreation: (type: ContentType, durationMs: number) => void;
  recordPublication: (platform: Platform, success: boolean) => void;
  recordEngagement: (platform: Platform, engagements: number, rate: number) => void;
  recordRevenue: (platform: Platform, amount: number) => void;
  getMetrics: () => ContentMetrics;
} {
  const metrics: ContentMetrics = {
    contentCreatedTotal: 0,
    contentPublishedTotal: 0,
    contentFailedTotal: 0,
    avgGenerationTimeMs: 0,
    avgEngagementRate: 0,
    totalRevenue: 0,
    byPlatform: {} as Record<Platform, { published: number; engagements: number; revenue: number }>,
    byType: {} as Record<ContentType, { created: number; published: number }>,
  };

  let totalGenerationTime = 0;
  let totalEngagementRateSamples = 0;
  let totalEngagementRate = 0;

  const ensurePlatform = (p: Platform) => {
    if (!metrics.byPlatform[p]) {
      metrics.byPlatform[p] = { published: 0, engagements: 0, revenue: 0 };
    }
  };

  const ensureType = (t: ContentType) => {
    if (!metrics.byType[t]) {
      metrics.byType[t] = { created: 0, published: 0 };
    }
  };

  return {
    recordCreation(type: ContentType, durationMs: number) {
      metrics.contentCreatedTotal++;
      totalGenerationTime += durationMs;
      metrics.avgGenerationTimeMs = totalGenerationTime / metrics.contentCreatedTotal;
      ensureType(type);
      metrics.byType[type].created++;
    },

    recordPublication(platform: Platform, success: boolean) {
      ensurePlatform(platform);
      if (success) {
        metrics.contentPublishedTotal++;
        metrics.byPlatform[platform].published++;
      } else {
        metrics.contentFailedTotal++;
      }
    },

    recordEngagement(platform: Platform, engagements: number, rate: number) {
      ensurePlatform(platform);
      metrics.byPlatform[platform].engagements += engagements;
      totalEngagementRateSamples++;
      totalEngagementRate += rate;
      metrics.avgEngagementRate = totalEngagementRate / totalEngagementRateSamples;
    },

    recordRevenue(platform: Platform, amount: number) {
      ensurePlatform(platform);
      metrics.totalRevenue += amount;
      metrics.byPlatform[platform].revenue += amount;
    },

    getMetrics() {
      return { ...metrics };
    },
  };
}

// =============================================================================
// Full Integration Setup
// =============================================================================

export interface ContentSystemIntegration {
  memory: ContentMemoryIntegration;
  revenue: ContentRevenueIntegration;
  dashboard: ContentDashboardIntegration;
  engine: ContentEngineIntegration;
  metrics: ReturnType<typeof createMetricsCollector>;
}

export interface IntegrationDependencies {
  memorySystem?: Parameters<typeof createMemoryIntegration>[0];
  fiber?: Parameters<typeof createRevenueIntegration>[0];
  revenueTracker?: Parameters<typeof createRevenueIntegration>[1];
  broadcast?: Parameters<typeof createDashboardIntegration>[0];
  contentEngine?: Parameters<typeof createEngineIntegration>[0];
}

/**
 * Create full content system integration with all Genesis subsystems.
 */
export function createContentSystemIntegration(deps: IntegrationDependencies): ContentSystemIntegration {
  const metrics = createMetricsCollector();

  return {
    memory: deps.memorySystem
      ? createMemoryIntegration(deps.memorySystem)
      : createMemoryIntegration({
          remember: () => {},
          learn: () => {},
          learnSkill: () => {},
          recall: () => [],
        }),

    revenue: deps.fiber
      ? createRevenueIntegration(deps.fiber, deps.revenueTracker)
      : createRevenueIntegration({
          recordRevenue: () => {},
          recordCost: () => {},
          getGlobalSection: () => ({ totalRevenue: 0, totalCosts: 0, netFlow: 0 }),
        }),

    dashboard: deps.broadcast
      ? createDashboardIntegration(deps.broadcast)
      : createDashboardIntegration(() => {}),

    engine: createEngineIntegration(deps.contentEngine),

    metrics,
  };
}

// =============================================================================
// Auto-Integration Hook for Genesis
// =============================================================================

/**
 * Wire content module results to all integrations automatically.
 */
export function wireContentToIntegrations(
  integration: ContentSystemIntegration,
  orchestrator: ReturnType<typeof getContentOrchestrator>
): void {
  const originalCreateAndPublish = orchestrator.createAndPublish.bind(orchestrator);

  // Wrap createAndPublish to add integration hooks
  orchestrator.createAndPublish = async function(request) {
    const startTime = Date.now();
    const result = await originalCreateAndPublish(request);
    const duration = Date.now() - startTime;

    // Record metrics
    integration.metrics.recordCreation(result.draft.type, duration);

    // Store in memory
    integration.memory.rememberContentCreated(result);
    integration.memory.learnTopic(request.topic, result.draft.keywords, []);

    // Broadcast to dashboard
    integration.dashboard.broadcastCreated(result);

    // Record publications
    if (result.publishResults) {
      for (const pub of result.publishResults) {
        integration.metrics.recordPublication(pub.platform, pub.success);
        if (pub.success && pub.url) {
          integration.memory.rememberContentPublished(result.id, pub.platform, pub.url);
          integration.dashboard.broadcastPublished(result.id, pub.platform, pub.url, true);
        }
      }
    }

    return result;
  };
}
