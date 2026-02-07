/**
 * Content Module - Event Bus Integration
 *
 * Wires the content module to Genesis's event bus following FEP/GWT principles:
 * - Precision-weighted content events
 * - Cross-module coordination
 * - Revenue and analytics integration
 */

import type { BusEvent } from '../bus/events.js';
import type { Platform, ContentType, ContentStatus } from './types.js';
import { getContentOrchestrator } from './orchestrator.js';
import { getContentScheduler } from './scheduler/index.js';
import { getAnalyticsAggregator } from './analytics/index.js';

// =============================================================================
// Content Event Types
// =============================================================================

export interface ContentCreatedEvent extends BusEvent {
  contentId: string;
  type: ContentType;
  topic: string;
  platforms: Platform[];
  keywords: string[];
}

export interface ContentPublishedEvent extends BusEvent {
  contentId: string;
  platform: Platform;
  postId: string;
  url?: string;
  status: 'success' | 'failed';
  error?: string;
}

export interface ContentScheduledEvent extends BusEvent {
  contentId: string;
  platforms: Platform[];
  scheduledFor: Date;
}

export interface ContentEngagementEvent extends BusEvent {
  contentId: string;
  platform: Platform;
  impressions: number;
  engagements: number;
  engagementRate: number;
}

export interface ContentRevenueEvent extends BusEvent {
  contentId: string;
  platform: Platform;
  amount: number;
  currency: string;
  revenueSource: string;
}

export interface ContentInsightEvent extends BusEvent {
  insightType: 'best_platform' | 'optimal_time' | 'trending_topic' | 'performance_alert';
  platform?: Platform;
  recommendation: string;
  confidence: number;
}

// =============================================================================
// Event Map Extension
// =============================================================================

/**
 * Content events to add to GenesisEventMap.
 * These follow the domain.verb convention.
 */
export interface ContentEventMap {
  'content.created': ContentCreatedEvent;
  'content.published': ContentPublishedEvent;
  'content.scheduled': ContentScheduledEvent;
  'content.engagement': ContentEngagementEvent;
  'content.revenue': ContentRevenueEvent;
  'content.insight': ContentInsightEvent;
}

// =============================================================================
// Event Factory
// =============================================================================

let eventSeq = 0;

function createEvent<T extends BusEvent>(partial: Omit<T, 'seq' | 'timestamp'>): T {
  return {
    seq: ++eventSeq,
    timestamp: new Date().toISOString(),
    ...partial,
  } as T;
}

// =============================================================================
// Event Emitters
// =============================================================================

export type EventPublisher = <T extends keyof ContentEventMap>(
  topic: T,
  event: Omit<ContentEventMap[T], 'seq' | 'timestamp'>
) => void;

/**
 * Creates bound event emitters for the content module.
 */
export function createContentEventEmitters(publish: EventPublisher) {
  return {
    emitCreated(data: {
      contentId: string;
      type: ContentType;
      topic: string;
      platforms: Platform[];
      keywords: string[];
      precision?: number;
      correlationId?: string;
    }) {
      publish('content.created', createEvent<ContentCreatedEvent>({
        source: 'content-orchestrator',
        precision: data.precision ?? 0.8,
        correlationId: data.correlationId,
        contentId: data.contentId,
        type: data.type,
        topic: data.topic,
        platforms: data.platforms,
        keywords: data.keywords,
      }));
    },

    emitPublished(data: {
      contentId: string;
      platform: Platform;
      postId: string;
      url?: string;
      status: 'success' | 'failed';
      error?: string;
      precision?: number;
      correlationId?: string;
    }) {
      publish('content.published', createEvent<ContentPublishedEvent>({
        source: 'content-scheduler',
        precision: data.precision ?? (data.status === 'success' ? 0.9 : 0.7),
        correlationId: data.correlationId,
        contentId: data.contentId,
        platform: data.platform,
        postId: data.postId,
        url: data.url,
        status: data.status,
        error: data.error,
      }));
    },

    emitScheduled(data: {
      contentId: string;
      platforms: Platform[];
      scheduledFor: Date;
      precision?: number;
      correlationId?: string;
    }) {
      publish('content.scheduled', createEvent<ContentScheduledEvent>({
        source: 'content-scheduler',
        precision: data.precision ?? 0.85,
        correlationId: data.correlationId,
        contentId: data.contentId,
        platforms: data.platforms,
        scheduledFor: data.scheduledFor,
      }));
    },

    emitEngagement(data: {
      contentId: string;
      platform: Platform;
      impressions: number;
      engagements: number;
      precision?: number;
      correlationId?: string;
    }) {
      const engagementRate = data.impressions > 0 ? data.engagements / data.impressions : 0;
      publish('content.engagement', createEvent<ContentEngagementEvent>({
        source: 'content-analytics',
        precision: data.precision ?? 0.75,
        correlationId: data.correlationId,
        contentId: data.contentId,
        platform: data.platform,
        impressions: data.impressions,
        engagements: data.engagements,
        engagementRate,
      }));
    },

    emitRevenue(data: {
      contentId: string;
      platform: Platform;
      amount: number;
      currency: string;
      revenueSource: string;
      precision?: number;
      correlationId?: string;
    }) {
      publish('content.revenue', createEvent<ContentRevenueEvent>({
        source: 'content-analytics',
        precision: data.precision ?? 0.95,
        correlationId: data.correlationId,
        contentId: data.contentId,
        platform: data.platform,
        amount: data.amount,
        currency: data.currency,
        revenueSource: data.revenueSource,
      }));
    },

    emitInsight(data: {
      insightType: ContentInsightEvent['insightType'];
      platform?: Platform;
      recommendation: string;
      confidence: number;
      precision?: number;
      correlationId?: string;
    }) {
      publish('content.insight', createEvent<ContentInsightEvent>({
        source: 'content-analytics',
        precision: data.precision ?? data.confidence,
        correlationId: data.correlationId,
        insightType: data.insightType,
        platform: data.platform,
        recommendation: data.recommendation,
        confidence: data.confidence,
      }));
    },
  };
}

// =============================================================================
// Event Handlers
// =============================================================================

export type EventSubscriber = <T extends string>(
  topic: T,
  handler: (event: BusEvent) => void | Promise<void>
) => void;

/**
 * Sets up content module event handlers.
 * Responds to neuromodulation and economic signals.
 */
export function setupContentEventHandlers(subscribe: EventSubscriber) {
  const orchestrator = getContentOrchestrator();
  const scheduler = getContentScheduler();
  const analytics = getAnalyticsAggregator();

  // High novelty signal -> explore trending topics
  subscribe('neuromod.novelty', async (event) => {
    const noveltyEvent = event as BusEvent & { magnitude: number };
    if (noveltyEvent.magnitude > 0.7) {
      // Could trigger exploration of new content topics
      console.log('[content] High novelty detected, considering new topics');
    }
  });

  // High dopamine -> exploit successful content patterns
  subscribe('neuromod.reward', async (event) => {
    const rewardEvent = event as BusEvent & { magnitude: number; cause: string };
    if (rewardEvent.magnitude > 0.5 && rewardEvent.cause.includes('content')) {
      // Reinforce successful content strategies
      console.log('[content] Reward signal, reinforcing content strategy');
    }
  });

  // Economic pressure -> prioritize monetizable content
  subscribe('economy.ness.deviation', async (event) => {
    const nessEvent = event as BusEvent & { deviation: number };
    if (nessEvent.deviation < -0.1) {
      // System needs revenue, prioritize high-value content
      console.log('[content] Economic pressure, prioritizing monetizable content');
    }
  });

  // Revenue recorded -> update content analytics
  subscribe('economy.revenue.recorded', async (event) => {
    const revenueEvent = event as BusEvent & { amount: number; revenueSource: string };
    if (revenueEvent.revenueSource.startsWith('content:')) {
      const contentId = revenueEvent.revenueSource.split(':')[1];
      if (contentId) {
        analytics.recordRevenue(contentId, revenueEvent.amount);
      }
    }
  });
}

// =============================================================================
// Module Wiring
// =============================================================================

/**
 * Wires the content module to the Genesis event bus.
 */
export function wireContentModule(
  publish: EventPublisher,
  subscribe: EventSubscriber,
): ReturnType<typeof createContentEventEmitters> {
  // Set up handlers for incoming events
  setupContentEventHandlers(subscribe);

  // Return emitters for outgoing events
  return createContentEventEmitters(publish);
}
