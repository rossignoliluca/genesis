/**
 * Content Module Tests
 *
 * Tests for the multi-platform content creator module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initContentModule,
  shutdownContentModule,
  getContentOrchestrator,
  getContentScheduler,
  getAnalyticsAggregator,
  getSEOEngine,
  getConnectorFactory,
  createContentSystemIntegration,
  createMetricsCollector,
  type ContentRequest,
  type Platform,
} from '../src/content/index.js';

// =============================================================================
// SEO Engine Tests
// =============================================================================

describe('SEO Engine', () => {
  it('should research keywords for a topic', async () => {
    const seo = getSEOEngine();
    const keywords = await seo.researchKeywords('typescript best practices');

    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords[0]).toHaveProperty('keyword');
    expect(keywords[0]).toHaveProperty('searchVolume');
    expect(keywords[0]).toHaveProperty('difficulty');
    expect(keywords[0]).toHaveProperty('trend');
  });

  it('should optimize title with keywords', () => {
    const seo = getSEOEngine();
    const title = seo.optimizeTitle('A Very Long Title That Exceeds The Maximum Length Allowed For SEO Purposes And Should Be Truncated', ['typescript']);

    expect(title.length).toBeLessThanOrEqual(60);
  });

  it('should generate meta description', () => {
    const seo = getSEOEngine();
    const content = `# TypeScript Guide

TypeScript is a typed superset of JavaScript that compiles to plain JavaScript. It offers optional static typing and class-based object-oriented programming to the language.

## Getting Started

First, install TypeScript using npm.`;

    const description = seo.generateMetaDescription(content, ['typescript']);

    expect(description.length).toBeLessThanOrEqual(160);
    expect(description.length).toBeGreaterThan(50);
  });

  it('should calculate SEO score', () => {
    const seo = getSEOEngine();
    const score = seo.calculateSEOScore({
      id: 'test-1',
      title: 'TypeScript Best Practices Guide',
      content: `# TypeScript Best Practices

## Introduction

TypeScript offers many benefits for large-scale applications.

## Type Safety

Always use strict mode for better type checking.`,
      excerpt: 'Learn the best practices for TypeScript development.',
      type: 'article',
      keywords: ['typescript', 'best practices'],
      hashtags: ['TypeScript', 'Programming'],
      createdAt: new Date(),
    });

    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(100);
    expect(score).toHaveProperty('titleScore');
    expect(score).toHaveProperty('headingsScore');
    expect(score).toHaveProperty('suggestions');
  });

  it('should generate hashtags', () => {
    const seo = getSEOEngine();
    const hashtags = seo.generateHashtags(
      'TypeScript and JavaScript programming',
      ['typescript', 'javascript', 'programming'],
      3
    );

    expect(hashtags.length).toBeLessThanOrEqual(3);
    expect(hashtags.every(h => !h.includes(' '))).toBe(true);
  });
});

// =============================================================================
// Content Scheduler Tests
// =============================================================================

describe('Content Scheduler', () => {
  beforeEach(() => {
    // Reset scheduler state
  });

  it('should enqueue content for scheduling', async () => {
    const scheduler = getContentScheduler();

    const contentId = await scheduler.enqueue({
      content: 'Test content for scheduling',
      title: 'Test Title',
      type: 'post',
      platforms: ['twitter', 'linkedin'],
      publishAt: new Date(Date.now() + 3600000), // 1 hour from now
      hashtags: ['test'],
    });

    expect(contentId).toBeDefined();
    expect(typeof contentId).toBe('string');

    const queue = await scheduler.getQueue();
    expect(queue.some(item => item.id === contentId)).toBe(true);

    // Cleanup
    await scheduler.dequeue(contentId);
  });

  it('should get optimal posting times', () => {
    const scheduler = getContentScheduler();

    const twitterTime = scheduler.getOptimalTime('twitter');
    expect(twitterTime.platform).toBe('twitter');
    expect(twitterTime.suggestedTime).toBeInstanceOf(Date);
    expect(twitterTime.confidence).toBeGreaterThan(0);

    const linkedinTime = scheduler.getOptimalTime('linkedin');
    expect(linkedinTime.platform).toBe('linkedin');
  });

  it('should track scheduler stats', async () => {
    const scheduler = getContentScheduler();
    const stats = scheduler.getStats();

    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('scheduled');
    expect(stats).toHaveProperty('published');
    expect(stats).toHaveProperty('failed');
  });
});

// =============================================================================
// Analytics Aggregator Tests
// =============================================================================

describe('Analytics Aggregator', () => {
  it('should track content', () => {
    const analytics = getAnalyticsAggregator();

    analytics.trackContent('test-content-1', {
      title: 'Test Article',
      type: 'article',
      platforms: ['twitter', 'linkedin'],
      posts: [
        { platform: 'twitter', postId: 'tw-123', url: 'https://twitter.com/...' },
        { platform: 'linkedin', postId: 'li-456', url: 'https://linkedin.com/...' },
      ],
    });

    const stats = analytics.getStats();
    expect(stats.trackedContent).toBeGreaterThan(0);
  });

  it('should record revenue', () => {
    const analytics = getAnalyticsAggregator();

    analytics.trackContent('revenue-test-1', {
      type: 'newsletter',
      platforms: ['substack'],
      posts: [{ platform: 'substack' as Platform, postId: 'sub-1' }],
    });

    analytics.recordRevenue('revenue-test-1', 25.00);

    const stats = analytics.getStats();
    expect(stats.totalRevenue).toBeGreaterThanOrEqual(25);
  });

  it('should generate insights', async () => {
    const analytics = getAnalyticsAggregator();
    const insights = await analytics.generateInsights();

    expect(insights).toHaveProperty('bestPerformingContent');
    expect(insights).toHaveProperty('bestPerformingPlatform');
    expect(insights).toHaveProperty('recommendations');
    expect(insights.generatedAt).toBeInstanceOf(Date);
  });
});

// =============================================================================
// Content Orchestrator Tests
// =============================================================================

describe('Content Orchestrator', () => {
  it('should research topics', async () => {
    const orchestrator = getContentOrchestrator();
    const research = await orchestrator.research('AI agents');

    expect(research).toHaveProperty('keywords');
    expect(research).toHaveProperty('relatedTopics');
    expect(research).toHaveProperty('trendingAngles');
    expect(research.keywords.length).toBeGreaterThan(0);
  });

  it('should generate content', async () => {
    const orchestrator = getContentOrchestrator();
    const generated = await orchestrator.generate(
      'TypeScript tips',
      'article',
      ['typescript', 'programming']
    );

    expect(generated).toHaveProperty('title');
    expect(generated).toHaveProperty('content');
    expect(generated.title.length).toBeGreaterThan(0);
    expect(generated.content.length).toBeGreaterThan(0);
  });

  it('should optimize content for SEO', async () => {
    const orchestrator = getContentOrchestrator();

    const draft = {
      id: 'seo-test-1',
      title: 'Test Article',
      content: '# Test\n\nThis is test content about programming.',
      type: 'article' as const,
      keywords: ['programming'],
      hashtags: [],
      createdAt: new Date(),
    };

    const optimized = await orchestrator.optimizeSEO(draft);

    expect(optimized.seoScore).toBeDefined();
    expect(optimized.hashtags.length).toBeGreaterThan(0);
  });

  it('should adapt content for platforms', () => {
    const orchestrator = getContentOrchestrator();

    const draft = {
      id: 'adapt-test-1',
      title: 'Platform Adaptation Test',
      content: 'This is a longer piece of content that needs to be adapted for different social media platforms with their varying character limits.',
      excerpt: 'Testing platform adaptation',
      type: 'post' as const,
      keywords: ['test'],
      hashtags: ['Test', 'Adaptation'],
      createdAt: new Date(),
    };

    const adapted = orchestrator.adaptForPlatforms(draft, ['twitter', 'linkedin', 'mastodon']);

    expect(adapted.length).toBe(3);

    const twitter = adapted.find(a => a.platform === 'twitter');
    expect(twitter).toBeDefined();
    expect(twitter!.characterCount).toBeLessThanOrEqual(280);
    expect(twitter!.withinLimit).toBe(true);

    const linkedin = adapted.find(a => a.platform === 'linkedin');
    expect(linkedin).toBeDefined();
    expect(linkedin!.characterCount).toBeLessThanOrEqual(3000);
  });

  it('should create threads', () => {
    const orchestrator = getContentOrchestrator();

    const longContent = `This is a very long piece of content that would exceed Twitter's character limit. `.repeat(20);

    const thread = orchestrator.createThread(longContent, 'twitter', true);

    expect(thread.length).toBeGreaterThan(1);
    thread.forEach((tweet, i) => {
      expect(tweet.length).toBeLessThanOrEqual(280);
      if (thread.length > 1) {
        expect(tweet).toMatch(/\d+\/\d+/); // Should have numbering
      }
    });
  });
});

// =============================================================================
// Connector Factory Tests
// =============================================================================

describe('Connector Factory', () => {
  it('should list configured platforms', () => {
    const factory = getConnectorFactory();
    const platforms = factory.getConfiguredPlatforms();

    expect(Array.isArray(platforms)).toBe(true);
    // May be empty if no env vars set, but should not throw
  });

  it('should return connector instances', () => {
    const factory = getConnectorFactory();

    // These should not throw even if not configured
    expect(() => factory.getTwitter()).not.toThrow();
    expect(() => factory.getLinkedIn()).not.toThrow();
    expect(() => factory.getMastodon()).not.toThrow();
    expect(() => factory.getBluesky()).not.toThrow();
  });
});

// =============================================================================
// Metrics Collector Tests
// =============================================================================

describe('Metrics Collector', () => {
  it('should track content creation', () => {
    const metrics = createMetricsCollector();

    metrics.recordCreation('article', 5000);
    metrics.recordCreation('post', 1000);
    metrics.recordCreation('article', 3000);

    const stats = metrics.getMetrics();

    expect(stats.contentCreatedTotal).toBe(3);
    expect(stats.avgGenerationTimeMs).toBe(3000); // (5000+1000+3000)/3
    expect(stats.byType['article'].created).toBe(2);
    expect(stats.byType['post'].created).toBe(1);
  });

  it('should track publications', () => {
    const metrics = createMetricsCollector();

    metrics.recordPublication('twitter', true);
    metrics.recordPublication('linkedin', true);
    metrics.recordPublication('twitter', false);
    metrics.recordPublication('mastodon', true);

    const stats = metrics.getMetrics();

    expect(stats.contentPublishedTotal).toBe(3);
    expect(stats.contentFailedTotal).toBe(1);
    expect(stats.byPlatform['twitter'].published).toBe(1);
    expect(stats.byPlatform['linkedin'].published).toBe(1);
  });

  it('should track engagement', () => {
    const metrics = createMetricsCollector();

    metrics.recordEngagement('twitter', 100, 0.05);
    metrics.recordEngagement('linkedin', 200, 0.08);

    const stats = metrics.getMetrics();

    expect(stats.byPlatform['twitter'].engagements).toBe(100);
    expect(stats.byPlatform['linkedin'].engagements).toBe(200);
    expect(stats.avgEngagementRate).toBeCloseTo(0.065, 2);
  });

  it('should track revenue', () => {
    const metrics = createMetricsCollector();

    metrics.recordRevenue('substack', 50);
    metrics.recordRevenue('mirror', 25);
    metrics.recordRevenue('substack', 30);

    const stats = metrics.getMetrics();

    expect(stats.totalRevenue).toBe(105);
    expect(stats.byPlatform['substack'].revenue).toBe(80);
    expect(stats.byPlatform['mirror'].revenue).toBe(25);
  });
});

// =============================================================================
// System Integration Tests
// =============================================================================

describe('Content System Integration', () => {
  it('should create integration with all subsystems', () => {
    const memoryMock = {
      remember: vi.fn(),
      learn: vi.fn(),
      learnSkill: vi.fn(),
      recall: vi.fn().mockReturnValue([]),
    };

    const fiberMock = {
      recordRevenue: vi.fn(),
      recordCost: vi.fn(),
      getGlobalSection: vi.fn().mockReturnValue({ totalRevenue: 100, totalCosts: 20, netFlow: 80 }),
    };

    const broadcastMock = vi.fn();

    const integration = createContentSystemIntegration({
      memorySystem: memoryMock,
      fiber: fiberMock,
      broadcast: broadcastMock,
    });

    expect(integration.memory).toBeDefined();
    expect(integration.revenue).toBeDefined();
    expect(integration.dashboard).toBeDefined();
    expect(integration.metrics).toBeDefined();
  });

  it('should evaluate revenue opportunities', () => {
    const fiberMock = {
      recordRevenue: vi.fn(),
      recordCost: vi.fn(),
      getGlobalSection: vi.fn().mockReturnValue({ totalRevenue: 0, totalCosts: 0, netFlow: 0 }),
    };

    const integration = createContentSystemIntegration({ fiber: fiberMock });

    // Good opportunity (100% ROI)
    const good = integration.revenue.evaluateOpportunity(100, 50);
    expect(good.pursue).toBe(true);

    // Bad opportunity (20% ROI, below 50% threshold)
    const bad = integration.revenue.evaluateOpportunity(60, 50);
    expect(bad.pursue).toBe(false);
  });
});

// =============================================================================
// Module Initialization Tests
// =============================================================================

describe('Content Module Initialization', () => {
  afterEach(() => {
    shutdownContentModule();
  });

  it('should initialize with default config', () => {
    const { orchestrator, scheduler, analytics } = initContentModule();

    expect(orchestrator).toBeDefined();
    expect(scheduler).toBeDefined();
    expect(analytics).toBeDefined();
  });

  it('should initialize with custom generator', async () => {
    const customGenerator = vi.fn().mockResolvedValue({
      title: 'Custom Title',
      content: 'Custom content generated',
    });

    const { orchestrator } = initContentModule({
      generator: customGenerator,
    });

    const result = await orchestrator.generate('test topic', 'article', ['test']);

    expect(customGenerator).toHaveBeenCalled();
    expect(result.title).toBe('Custom Title');
  });

  it('should auto-start scheduler when configured', () => {
    const { scheduler } = initContentModule({
      autoStartScheduler: true,
      schedulerIntervalMs: 60000,
    });

    // Scheduler should be running
    const stats = scheduler.getStats();
    expect(stats).toBeDefined();

    // Cleanup
    shutdownContentModule();
  });
});

// =============================================================================
// Import vitest mock function
// =============================================================================

import { vi } from 'vitest';
