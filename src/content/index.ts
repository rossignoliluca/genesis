/**
 * Genesis Content Module
 *
 * Ultimate autonomous content creator with:
 * - Multi-platform social media publishing (Twitter/X, LinkedIn, Mastodon, Bluesky)
 * - SEO-optimized long-form content generation
 * - Automated scheduling and cross-posting
 * - Analytics aggregation and content optimization
 * - Revenue tracking from content monetization
 *
 * @module content
 * @version 18.1.0
 */

// =============================================================================
// Type Exports
// =============================================================================

export type {
  // Platform types
  Platform,
  SocialPlatform,
  ContentPlatform,
  ContentType,
  ContentStatus,
  Visibility,

  // Twitter types
  TweetResult,
  ThreadResult,
  TweetAnalytics,
  ScheduledTweet,

  // LinkedIn types
  LinkedInVisibility,
  LinkedInPostResult,
  LinkedInAnalytics,

  // Mastodon types
  MastodonVisibility,
  TootResult,
  MastodonNotification,

  // Bluesky types
  BlueskyEmbedType,
  BlueskyEmbed,
  BlueskyPostResult,
  BlueskyProfile,

  // SEO types
  KeywordData,
  CompetitionAnalysis,
  SEOScore,

  // Scheduler types
  ScheduledContent,
  OptimalTime,
  CrossPostResult,

  // Analytics types
  PlatformMetrics,
  AggregatedMetrics,
  ContentPerformance,
  ContentInsights,

  // Orchestrator types
  ContentRequest,
  ContentDraft,
  AdaptedContent,
  ContentResult,

  // Revenue types
  ContentRevenue,

  // Configuration types
  RateLimitConfig,
  ConnectorConfig,
  ConnectorHealth,
  BaseConnector,
  AudienceData,

  // Publication types
  PublicationResult,
  PublicationReport,
} from './types.js';

export {
  PLATFORM_RATE_LIMITS,
  PLATFORM_CHARACTER_LIMITS,
  PLATFORM_THREAD_LIMITS,
} from './types.js';

// =============================================================================
// Connector Exports
// =============================================================================

export {
  getConnectorFactory,
  splitIntoChunks,
  addThreadNumbering,
  type ConnectorFactory,
} from './connectors/index.js';

export { TwitterConnector } from './connectors/twitter.js';
export { LinkedInConnector } from './connectors/linkedin.js';
export { MastodonConnector } from './connectors/mastodon.js';
export { BlueskyConnector } from './connectors/bluesky.js';

// =============================================================================
// SEO Exports
// =============================================================================

export { getSEOEngine, SEOEngine, type SEOEngineConfig } from './seo/index.js';

// =============================================================================
// Scheduler Exports
// =============================================================================

export { getContentScheduler, ContentScheduler } from './scheduler/index.js';

// =============================================================================
// Analytics Exports
// =============================================================================

export { getAnalyticsAggregator, AnalyticsAggregator } from './analytics/index.js';

// =============================================================================
// Intelligence Exports (v24.0)
// =============================================================================

export {
  getContentIntelligence,
  resetContentIntelligence,
  ContentIntelligence,
  type EngagementPattern,
  type ViralPrediction,
  type OptimalTiming,
  type ContentIdea,
  type ABTestResult,
  type ContentIntelligenceConfig,
} from './intelligence.js';

// =============================================================================
// Orchestrator Exports
// =============================================================================

export {
  getContentOrchestrator,
  ContentOrchestrator,
  type ContentGenerator,
  type ContentResearcher,
} from './orchestrator.js';

// Internal imports for module initialization functions
import { getContentScheduler, ContentScheduler } from './scheduler/index.js';
import { getAnalyticsAggregator, AnalyticsAggregator } from './analytics/index.js';
import { getContentOrchestrator, ContentOrchestrator } from './orchestrator.js';

// =============================================================================
// Event Bus Integration Exports
// =============================================================================

export {
  wireContentModule,
  createContentEventEmitters,
  setupContentEventHandlers,
  type ContentEventMap,
  type ContentCreatedEvent,
  type ContentPublishedEvent,
  type ContentScheduledEvent,
  type ContentEngagementEvent,
  type ContentRevenueEvent,
  type ContentInsightEvent,
  type EventPublisher,
  type EventSubscriber,
} from './bus-wiring.js';

// =============================================================================
// System Integration Exports
// =============================================================================

export {
  createContentSystemIntegration,
  createMemoryIntegration,
  createRevenueIntegration,
  createDashboardIntegration,
  createEngineIntegration,
  createMetricsCollector,
  wireContentToIntegrations,
  type ContentSystemIntegration,
  type ContentMemoryIntegration,
  type ContentRevenueIntegration,
  type ContentDashboardIntegration,
  type ContentEngineIntegration,
  type ContentMetrics,
  type IntegrationDependencies,
} from './integration.js';

// =============================================================================
// Module Initialization
// =============================================================================

export interface ContentModuleConfig {
  /** Start the scheduler automatically */
  autoStartScheduler?: boolean;
  /** Scheduler check interval in ms (default: 60000) */
  schedulerIntervalMs?: number;
  /** Custom content generator function */
  generator?: (
    topic: string,
    type: import('./types.js').ContentType,
    keywords: string[],
    options?: { tone?: string; targetLength?: number },
  ) => Promise<{ title: string; content: string }>;
  /** Custom content researcher function */
  researcher?: (topic: string) => Promise<{
    keywords: string[];
    relatedTopics: string[];
    trendingAngles: string[];
  }>;
}

/**
 * Initialize the content module with optional configuration.
 */
export function initContentModule(config: ContentModuleConfig = {}): {
  orchestrator: ContentOrchestrator;
  scheduler: ContentScheduler;
  analytics: AnalyticsAggregator;
} {
  const orchestrator = getContentOrchestrator(config.generator, config.researcher);
  const scheduler = getContentScheduler();
  const analytics = getAnalyticsAggregator();

  if (config.autoStartScheduler) {
    scheduler.start(config.schedulerIntervalMs);
  }

  return { orchestrator, scheduler, analytics };
}

/**
 * Gracefully shutdown the content module.
 */
export function shutdownContentModule(): void {
  // v18.2: Full singleton reset for clean shutdown/reboot
  ContentScheduler.reset();
  ContentOrchestrator.reset();
  AnalyticsAggregator.reset();
}

// =============================================================================
// Quick Access Functions
// =============================================================================

/**
 * Quick function to create and publish content across platforms.
 */
export async function createContent(request: import('./types.js').ContentRequest) {
  const orchestrator = getContentOrchestrator();
  return orchestrator.createAndPublish(request);
}

/**
 * Quick function to schedule content for later publishing.
 */
export async function scheduleContent(
  content: string,
  platforms: import('./types.js').Platform[],
  publishAt: Date,
  options?: { title?: string; hashtags?: string[] },
) {
  const scheduler = getContentScheduler();
  return scheduler.enqueue({
    content,
    title: options?.title,
    type: 'post',
    platforms,
    publishAt,
    hashtags: options?.hashtags,
  });
}

/**
 * Quick function to cross-post content immediately.
 */
export async function crossPost(
  content: string,
  platforms: import('./types.js').Platform[],
  options?: { title?: string; hashtags?: string[] },
) {
  const scheduler = getContentScheduler();
  return scheduler.crossPost(content, platforms, options);
}

/**
 * Quick function to get aggregated analytics.
 */
export async function getAnalytics(since: Date) {
  const analytics = getAnalyticsAggregator();
  return analytics.aggregateMetrics(since);
}

/**
 * Quick function to get content performance.
 */
export async function getPerformance(contentId: string) {
  const analytics = getAnalyticsAggregator();
  return analytics.getContentPerformance(contentId);
}

/**
 * Quick function to get content insights.
 */
export async function getInsights() {
  const analytics = getAnalyticsAggregator();
  return analytics.generateInsights();
}

// =============================================================================
// Strategy Wiring (Market Strategist Integration)
// =============================================================================

export {
  briefToSocialContent,
  publishMarketBrief,
  generateWeeklyContentCalendar,
  type MarketBriefSummary,
  type ContentStrategyConfig,
  type ContentCalendarEntry,
} from './strategy-wiring.js';

// =============================================================================
// Monetization (v19.1.0)
// =============================================================================

export {
  // Revenue recording
  recordContentRevenue,
  recordAdRevenue,
  recordSubscriptionRevenue,

  // Affiliate management
  createAffiliateLink,
  recordAffiliateClick,
  recordAffiliateConversion,
  getActiveAffiliateLinks,

  // Sponsor deals
  createSponsorDeal,
  updateSponsorDealStatus,
  getActiveSponsorDeals,
  getAllSponsorDeals,

  // Queries
  getRevenueStats,
  getRevenueByContent,
  getRevenueByPlatform,
  getRevenueByDateRange,

  // Types
  type ContentRevenueSource,
  type ContentRevenueRecord,
  type AffiliateLink,
  type SponsorDeal,
} from './monetization/index.js';
