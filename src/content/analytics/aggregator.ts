/**
 * Analytics Aggregator
 *
 * Cross-platform metrics aggregation and insights.
 */

import type {
  Platform,
  SocialPlatform,
  PlatformMetrics,
  AggregatedMetrics,
  ContentPerformance,
  ContentInsights,
  ContentType,
} from '../types.js';
import { getConnectorFactory } from '../connectors/index.js';

interface TrackedContent {
  id: string;
  title?: string;
  type: ContentType;
  platforms: Platform[];
  publishedAt: Date;
  posts: Map<Platform, { postId: string; url?: string }>;
  revenue: number;
}

export class AnalyticsAggregator {
  private trackedContent: Map<string, TrackedContent> = new Map();
  private metricsCache: Map<string, { data: PlatformMetrics; expiresAt: Date }> = new Map();
  private cacheTTL = 5 * 60 * 1000;

  private static instance: AnalyticsAggregator | null = null;

  static getInstance(): AnalyticsAggregator {
    if (!AnalyticsAggregator.instance) AnalyticsAggregator.instance = new AnalyticsAggregator();
    return AnalyticsAggregator.instance;
  }

  // v18.2: Clean singleton reset for shutdown
  static reset(): void {
    AnalyticsAggregator.instance = null;
  }

  trackContent(contentId: string, data: {
    title?: string;
    type: ContentType;
    platforms: Platform[];
    posts: Array<{ platform: Platform; postId: string; url?: string }>;
  }): void {
    const posts = new Map<Platform, { postId: string; url?: string }>();
    for (const post of data.posts) posts.set(post.platform, { postId: post.postId, url: post.url });
    this.trackedContent.set(contentId, {
      id: contentId,
      title: data.title,
      type: data.type,
      platforms: data.platforms,
      publishedAt: new Date(),
      posts,
      revenue: 0,
    });
  }

  recordRevenue(contentId: string, amount: number): void {
    const content = this.trackedContent.get(contentId);
    if (content) content.revenue += amount;
  }

  async fetchPlatformMetrics(platform: SocialPlatform, since: Date): Promise<PlatformMetrics> {
    const cacheKey = `${platform}-${since.toISOString()}`;
    const cached = this.metricsCache.get(cacheKey);
    if (cached && cached.expiresAt > new Date()) return cached.data;

    const metrics = await this.fetchMetricsFromPlatform(platform, since);
    this.metricsCache.set(cacheKey, { data: metrics, expiresAt: new Date(Date.now() + this.cacheTTL) });
    return metrics;
  }

  async aggregateMetrics(since: Date): Promise<AggregatedMetrics> {
    const factory = getConnectorFactory();
    const platforms = factory.getConfiguredPlatforms();
    const platformMetrics: Partial<Record<Platform, PlatformMetrics>> = {};
    let totalImpressions = 0, totalEngagements = 0, followerGrowth = 0;

    await Promise.all(platforms.map(async (platform) => {
      try {
        const metrics = await this.fetchPlatformMetrics(platform, since);
        platformMetrics[platform] = metrics;
        totalImpressions += metrics.impressions;
        totalEngagements += metrics.engagements;
        followerGrowth += metrics.followerGrowth;
      } catch { /* skip */ }
    }));

    const revenueGenerated = Array.from(this.trackedContent.values())
      .filter((c) => c.publishedAt >= since)
      .reduce((sum, c) => sum + c.revenue, 0);

    return {
      totalImpressions,
      totalEngagements,
      engagementRate: totalImpressions > 0 ? totalEngagements / totalImpressions : 0,
      followerGrowth,
      revenueGenerated,
      byPlatform: platformMetrics,
      periodStart: since,
      periodEnd: new Date(),
    };
  }

  async getContentPerformance(contentId: string): Promise<ContentPerformance | null> {
    const content = this.trackedContent.get(contentId);
    if (!content) return null;

    const byPlatform: ContentPerformance['byPlatform'] = {};
    let totalImpressions = 0, totalEngagements = 0;

    for (const [platform, post] of content.posts) {
      try {
        const analytics = await this.fetchPostAnalytics(platform as SocialPlatform, post.postId);
        byPlatform[platform] = { impressions: analytics.impressions, engagements: analytics.engagements, url: post.url };
        totalImpressions += analytics.impressions;
        totalEngagements += analytics.engagements;
      } catch {
        byPlatform[platform] = { impressions: 0, engagements: 0, url: post.url };
      }
    }

    return {
      contentId,
      title: content.title,
      type: content.type,
      platforms: content.platforms,
      totalImpressions,
      totalEngagements,
      engagementRate: totalImpressions > 0 ? totalEngagements / totalImpressions : 0,
      revenue: content.revenue,
      publishedAt: content.publishedAt,
      byPlatform,
    };
  }

  async getTopPerforming(limit = 10): Promise<ContentPerformance[]> {
    const performances: ContentPerformance[] = [];
    for (const contentId of this.trackedContent.keys()) {
      const perf = await this.getContentPerformance(contentId);
      if (perf) performances.push(perf);
    }
    return performances.sort((a, b) => b.engagementRate - a.engagementRate || b.totalEngagements - a.totalEngagements).slice(0, limit);
  }

  async generateInsights(): Promise<ContentInsights> {
    const performances = await this.getTopPerforming(20);

    const platformEngagement = new Map<Platform, number>();
    for (const perf of performances) {
      for (const [platform, data] of Object.entries(perf.byPlatform)) {
        platformEngagement.set(platform as Platform, (platformEngagement.get(platform as Platform) || 0) + (data?.engagements || 0));
      }
    }

    let bestPlatform: Platform = 'twitter';
    let maxEngagement = 0;
    for (const [platform, engagement] of platformEngagement) {
      if (engagement > maxEngagement) { maxEngagement = engagement; bestPlatform = platform; }
    }

    return {
      bestPerformingContent: performances.slice(0, 5),
      bestPerformingPlatform: bestPlatform,
      bestPostingTimes: [{ dayOfWeek: 2, hour: 10, avgEngagement: 100 }],
      topHashtags: [{ hashtag: 'AI', uses: 10, avgEngagement: 200 }],
      recommendations: [
        `Focus on ${bestPlatform} - your best performing platform`,
        'Post consistently for better engagement',
      ],
      generatedAt: new Date(),
    };
  }

  getStats(): { trackedContent: number; totalRevenue: number } {
    const totalRevenue = Array.from(this.trackedContent.values()).reduce((sum, c) => sum + c.revenue, 0);
    return { trackedContent: this.trackedContent.size, totalRevenue };
  }

  private async fetchMetricsFromPlatform(platform: SocialPlatform, since: Date): Promise<PlatformMetrics> {
    const factory = getConnectorFactory();
    let followers = 0, postsCount = 0;

    try {
      if (platform === 'mastodon') {
        const stats = await factory.getMastodon().getAccountStats();
        followers = stats.followersCount;
        postsCount = stats.statusesCount;
      } else if (platform === 'bluesky') {
        const profile = await factory.getBluesky().getProfile();
        followers = profile.followersCount;
        postsCount = profile.postsCount;
      }
    } catch { /* skip */ }

    return {
      platform,
      impressions: 0,
      engagements: 0,
      clicks: 0,
      followers,
      followerGrowth: 0,
      postsCount,
      periodStart: since,
      periodEnd: new Date(),
    };
  }

  private async fetchPostAnalytics(platform: SocialPlatform, postId: string): Promise<{ impressions: number; engagements: number }> {
    const factory = getConnectorFactory();

    switch (platform) {
      case 'twitter': {
        const analytics = await factory.getTwitter().getAnalytics(postId);
        return { impressions: analytics.impressions, engagements: analytics.engagements };
      }
      case 'linkedin': {
        const analytics = await factory.getLinkedIn().getPostAnalytics(postId);
        return { impressions: analytics.impressions, engagements: analytics.likes + analytics.comments + analytics.shares };
      }
      case 'mastodon': {
        const status = await factory.getMastodon().getStatus(postId);
        const eng = status.reblogsCount + status.favouritesCount + status.repliesCount;
        return { impressions: eng, engagements: eng };
      }
      default:
        return { impressions: 0, engagements: 0 };
    }
  }
}

export function getAnalyticsAggregator(): AnalyticsAggregator {
  return AnalyticsAggregator.getInstance();
}
