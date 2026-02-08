/**
 * Content Strategy Wiring
 *
 * Integrates the Market Strategist with the Content Module to:
 * - Auto-publish market insights to social platforms
 * - Create thread summaries of weekly briefs
 * - Track engagement on market content
 */

import type { Platform, ContentType } from './types.js';
import { getContentOrchestrator } from './orchestrator.js';
import { getContentScheduler } from './scheduler/index.js';
import { getAnalyticsAggregator } from './analytics/index.js';
import { getSEOEngine } from './seo/index.js';

// =============================================================================
// Market Brief to Social Content
// =============================================================================

export interface MarketBriefSummary {
  week: string;
  date: string;
  sentiment: { overall: string; score: number };
  themes: string[];
  narratives: Array<{
    title: string;
    thesis: string;
    horizon: string;
  }>;
  positioning: Array<{
    assetClass: string;
    position: string;
    rationale: string;
  }>;
  risks: string[];
  opportunities: string[];
}

export interface ContentStrategyConfig {
  platforms: Platform[];
  autoPublish: boolean;
  scheduleTime?: Date;
  includeHashtags: boolean;
  threadFormat: boolean;
}

const DEFAULT_CONFIG: ContentStrategyConfig = {
  platforms: ['twitter', 'linkedin'],
  autoPublish: false,
  includeHashtags: true,
  threadFormat: true,
};

/**
 * Convert a market brief to social media content
 */
export function briefToSocialContent(
  brief: MarketBriefSummary,
  config: Partial<ContentStrategyConfig> = {},
): { twitter: string[]; linkedin: string; bluesky: string[] } {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Generate hashtags
  const hashtags = cfg.includeHashtags
    ? generateMarketHashtags(brief.themes, brief.sentiment.overall)
    : [];

  // Twitter thread
  const twitterThread = generateTwitterThread(brief, hashtags);

  // LinkedIn post (longer form)
  const linkedinPost = generateLinkedInPost(brief, hashtags);

  // Bluesky thread (similar to Twitter but with skeets)
  const blueskyThread = generateBlueskyThread(brief, hashtags);

  return {
    twitter: twitterThread,
    linkedin: linkedinPost,
    bluesky: blueskyThread,
  };
}

function generateMarketHashtags(themes: string[], sentiment: string): string[] {
  const baseHashtags = ['Markets', 'Finance', 'Investing'];
  const sentimentTag = sentiment === 'bullish' ? 'BullMarket' : sentiment === 'bearish' ? 'BearMarket' : 'MarketWatch';

  // Extract keywords from themes
  const themeHashtags = themes
    .slice(0, 3)
    .map(t => t.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, ''))
    .filter(t => t.length > 2 && t.length < 20);

  return [...baseHashtags, sentimentTag, ...themeHashtags].slice(0, 5);
}

function generateTwitterThread(brief: MarketBriefSummary, hashtags: string[]): string[] {
  const thread: string[] = [];

  // 1. Hook tweet
  const sentimentEmoji = brief.sentiment.overall === 'bullish' ? '📈' : brief.sentiment.overall === 'bearish' ? '📉' : '📊';
  thread.push(
    `${sentimentEmoji} Weekly Market Strategy ${brief.week}\n\n` +
    `Sentiment: ${brief.sentiment.overall.toUpperCase()} (${(brief.sentiment.score * 100).toFixed(0)}%)\n\n` +
    `Key themes: ${brief.themes.slice(0, 3).join(', ')}\n\n` +
    `🧵 Thread below...`
  );

  // 2. Narratives (1 tweet per narrative)
  for (const narrative of brief.narratives.slice(0, 3)) {
    const horizonEmoji = narrative.horizon === 'short' ? '⚡' : narrative.horizon === 'medium' ? '📅' : '🎯';
    thread.push(
      `${horizonEmoji} ${narrative.title}\n\n` +
      `${narrative.thesis}`
    );
  }

  // 3. Positioning summary
  if (brief.positioning.length > 0) {
    const positioningText = brief.positioning
      .slice(0, 4)
      .map(p => `• ${p.assetClass}: ${p.position.toUpperCase()}`)
      .join('\n');
    thread.push(`💼 Tactical Positioning:\n\n${positioningText}`);
  }

  // 4. Risks & Opportunities
  const risksText = brief.risks.slice(0, 2).map(r => `⚠️ ${r}`).join('\n');
  const oppsText = brief.opportunities.slice(0, 2).map(o => `✨ ${o}`).join('\n');
  thread.push(`Risks:\n${risksText}\n\nOpportunities:\n${oppsText}`);

  // 5. Closing tweet with hashtags
  const hashtagString = hashtags.map(h => `#${h}`).join(' ');
  thread.push(
    `That's the weekly wrap! ${brief.week}\n\n` +
    `Follow for weekly market insights.\n\n` +
    hashtagString
  );

  return thread;
}

function generateLinkedInPost(brief: MarketBriefSummary, hashtags: string[]): string {
  const sentimentEmoji = brief.sentiment.overall === 'bullish' ? '📈' : brief.sentiment.overall === 'bearish' ? '📉' : '📊';

  let post = `${sentimentEmoji} Weekly Market Strategy Brief — ${brief.week}\n\n`;
  post += `Market Sentiment: ${brief.sentiment.overall.toUpperCase()} (${(brief.sentiment.score * 100).toFixed(0)}%)\n`;
  post += `Key Themes: ${brief.themes.slice(0, 3).join(' • ')}\n\n`;
  post += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Narratives
  for (const narrative of brief.narratives.slice(0, 3)) {
    const horizonLabel = narrative.horizon === 'short' ? 'SHORT TERM' : narrative.horizon === 'medium' ? 'MEDIUM TERM' : 'LONG TERM';
    post += `📌 ${narrative.title} [${horizonLabel}]\n`;
    post += `${narrative.thesis}\n\n`;
  }

  // Positioning
  if (brief.positioning.length > 0) {
    post += `💼 TACTICAL POSITIONING\n`;
    for (const p of brief.positioning.slice(0, 4)) {
      post += `• ${p.assetClass}: ${p.position.toUpperCase()} — ${p.rationale}\n`;
    }
    post += `\n`;
  }

  // Risks & Opportunities
  post += `⚠️ KEY RISKS\n`;
  for (const r of brief.risks.slice(0, 3)) {
    post += `• ${r}\n`;
  }
  post += `\n`;

  post += `✨ OPPORTUNITIES\n`;
  for (const o of brief.opportunities.slice(0, 3)) {
    post += `• ${o}\n`;
  }
  post += `\n`;

  // Hashtags
  post += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  post += hashtags.map(h => `#${h}`).join(' ');

  return post;
}

function generateBlueskyThread(brief: MarketBriefSummary, hashtags: string[]): string[] {
  // Similar to Twitter but slightly different formatting
  const thread: string[] = [];

  const sentimentEmoji = brief.sentiment.overall === 'bullish' ? '📈' : brief.sentiment.overall === 'bearish' ? '📉' : '📊';

  thread.push(
    `${sentimentEmoji} Weekly Market Strategy ${brief.week}\n\n` +
    `Sentiment: ${brief.sentiment.overall.toUpperCase()}\n` +
    `Themes: ${brief.themes.slice(0, 2).join(', ')}\n\n` +
    `Thread 🧵`
  );

  for (const narrative of brief.narratives.slice(0, 2)) {
    thread.push(`${narrative.title}\n\n${narrative.thesis}`);
  }

  if (brief.positioning.length > 0) {
    thread.push(
      `Positioning:\n` +
      brief.positioning.slice(0, 3).map(p => `• ${p.assetClass}: ${p.position}`).join('\n')
    );
  }

  thread.push(
    `Risks: ${brief.risks.slice(0, 2).join(', ')}\n\n` +
    `Opportunities: ${brief.opportunities.slice(0, 2).join(', ')}`
  );

  return thread;
}

// =============================================================================
// Auto-Publishing Integration
// =============================================================================

/**
 * Publish a market brief to social platforms
 */
export async function publishMarketBrief(
  brief: MarketBriefSummary,
  config: Partial<ContentStrategyConfig> = {},
): Promise<{
  success: boolean;
  results: Array<{ platform: Platform; success: boolean; url?: string; error?: string }>;
}> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const content = briefToSocialContent(brief, cfg);
  const scheduler = getContentScheduler();
  const results: Array<{ platform: Platform; success: boolean; url?: string; error?: string }> = [];

  // Track content for analytics
  const analytics = getAnalyticsAggregator();
  const contentId = `market-brief-${brief.week}`;

  for (const platform of cfg.platforms) {
    try {
      let platformContent: string;

      if (platform === 'twitter') {
        // For threads, join with newlines for crossPost
        platformContent = content.twitter.join('\n\n---\n\n');
      } else if (platform === 'linkedin') {
        platformContent = content.linkedin;
      } else if (platform === 'bluesky') {
        platformContent = content.bluesky.join('\n\n---\n\n');
      } else {
        platformContent = content.linkedin; // Default to long-form
      }

      if (cfg.scheduleTime) {
        await scheduler.enqueue({
          content: platformContent,
          title: `Market Strategy ${brief.week}`,
          type: 'post',
          platforms: [platform],
          publishAt: cfg.scheduleTime,
          hashtags: generateMarketHashtags(brief.themes, brief.sentiment.overall),
        });
        results.push({ platform, success: true });
      } else if (cfg.autoPublish) {
        const result = await scheduler.crossPost(platformContent, [platform], {
          title: `Market Strategy ${brief.week}`,
          hashtags: generateMarketHashtags(brief.themes, brief.sentiment.overall),
        });
        const platformResult = result.results[0];
        results.push({
          platform,
          success: platformResult?.success || false,
          url: platformResult?.url,
          error: platformResult?.error,
        });
      } else {
        // Just prepare, don't publish
        results.push({ platform, success: true });
      }
    } catch (error) {
      results.push({
        platform,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Track in analytics
  analytics.trackContent(contentId, {
    title: `Market Strategy ${brief.week}`,
    type: 'post',
    platforms: cfg.platforms,
    posts: results.filter(r => r.success).map(r => ({
      platform: r.platform,
      postId: contentId,
      url: r.url,
    })),
  });

  return {
    success: results.every(r => r.success),
    results,
  };
}

// =============================================================================
// Content Calendar Integration
// =============================================================================

export interface ContentCalendarEntry {
  id: string;
  type: 'market-brief' | 'insight' | 'thread' | 'article';
  title: string;
  platforms: Platform[];
  scheduledFor: Date;
  status: 'scheduled' | 'published' | 'failed';
  brief?: MarketBriefSummary;
}

/**
 * Generate optimal posting schedule for the week
 */
export function generateWeeklyContentCalendar(
  briefs: MarketBriefSummary[],
  baseDate: Date = new Date(),
): ContentCalendarEntry[] {
  const calendar: ContentCalendarEntry[] = [];
  const scheduler = getContentScheduler();

  for (const brief of briefs) {
    // LinkedIn: Tuesday/Wednesday 8-10 AM
    const linkedinTime = scheduler.getOptimalTime('linkedin');
    calendar.push({
      id: `brief-linkedin-${brief.week}`,
      type: 'market-brief',
      title: `Market Strategy ${brief.week}`,
      platforms: ['linkedin'],
      scheduledFor: linkedinTime.suggestedTime,
      status: 'scheduled',
      brief,
    });

    // Twitter thread: Same day, afternoon
    const twitterTime = scheduler.getOptimalTime('twitter');
    calendar.push({
      id: `brief-twitter-${brief.week}`,
      type: 'thread',
      title: `Market Strategy Thread ${brief.week}`,
      platforms: ['twitter'],
      scheduledFor: twitterTime.suggestedTime,
      status: 'scheduled',
      brief,
    });

    // Bluesky: Next day
    const blueskyTime = scheduler.getOptimalTime('bluesky');
    calendar.push({
      id: `brief-bluesky-${brief.week}`,
      type: 'thread',
      title: `Market Strategy ${brief.week}`,
      platforms: ['bluesky'],
      scheduledFor: blueskyTime.suggestedTime,
      status: 'scheduled',
      brief,
    });
  }

  return calendar.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
}
