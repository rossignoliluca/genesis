/**
 * Content Strategy Wiring
 *
 * Integrates the Market Strategist with the Content Module to:
 * - Auto-publish market insights to social platforms
 * - Create thread summaries of weekly briefs
 * - Track engagement on market content
 */

import type { Platform, ContentType, PublicationResult, PublicationReport } from './types.js';
import { getContentOrchestrator } from './orchestrator.js';
import { getContentScheduler } from './scheduler/index.js';
import { getAnalyticsAggregator } from './analytics/index.js';
import { getSEOEngine } from './seo/index.js';
import {
  getTwitterConnector,
  getLinkedInConnector,
  getBlueskyConnector,
} from './connectors/index.js';
import { randomUUID } from 'crypto';

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
 * Publish a market brief to social platforms using real connectors.
 * Twitter: postThread() (not postTweet + join)
 * LinkedIn: createPost()
 * Bluesky: createThread() (not createPost)
 * Email: via Gmail MCP (optional)
 */
export async function publishMarketBrief(
  brief: MarketBriefSummary,
  config: Partial<ContentStrategyConfig> = {},
  options?: {
    sendEmail?: boolean;
    emailRecipients?: string[];
    pptxPath?: string;
  },
): Promise<PublicationReport> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const content = briefToSocialContent(brief, cfg);
  const results: PublicationResult[] = [];
  const now = new Date();

  // Track content for analytics
  const analytics = getAnalyticsAggregator();
  const contentId = `market-brief-${brief.week}`;

  // ---- TWITTER: Use postThread (real thread, not joined text) ----
  if (cfg.platforms.includes('twitter')) {
    const twitter = getTwitterConnector();
    if (twitter.isConfigured() && cfg.autoPublish) {
      try {
        const threadResult = await twitter.postThread(content.twitter);
        results.push({
          platform: 'twitter',
          success: true,
          postId: threadResult.threadId,
          url: threadResult.url,
          threadUrls: threadResult.tweets.map(t => t.url),
          publishedAt: now,
        });
      } catch (error) {
        results.push({
          platform: 'twitter',
          success: false,
          error: error instanceof Error ? error.message : String(error),
          publishedAt: now,
        });
      }
    } else if (!cfg.autoPublish) {
      results.push({ platform: 'twitter', success: true, publishedAt: now });
    }
  }

  // ---- LINKEDIN: Use createPost ----
  if (cfg.platforms.includes('linkedin')) {
    const linkedin = getLinkedInConnector();
    if (linkedin.isConfigured() && cfg.autoPublish) {
      try {
        const postResult = await linkedin.createPost(content.linkedin);
        results.push({
          platform: 'linkedin',
          success: true,
          postId: postResult.id,
          url: postResult.url,
          publishedAt: now,
        });
      } catch (error) {
        results.push({
          platform: 'linkedin',
          success: false,
          error: error instanceof Error ? error.message : String(error),
          publishedAt: now,
        });
      }
    } else if (!cfg.autoPublish) {
      results.push({ platform: 'linkedin', success: true, publishedAt: now });
    }
  }

  // ---- BLUESKY: Use createThread (real thread, not joined) ----
  if (cfg.platforms.includes('bluesky')) {
    const bluesky = getBlueskyConnector();
    if (bluesky.isConfigured() && cfg.autoPublish) {
      try {
        const threadResult = await bluesky.createThread(content.bluesky);
        results.push({
          platform: 'bluesky',
          success: true,
          postId: threadResult.threadId,
          url: threadResult.url,
          threadUrls: threadResult.posts.map(p => p.url),
          publishedAt: now,
        });
      } catch (error) {
        results.push({
          platform: 'bluesky',
          success: false,
          error: error instanceof Error ? error.message : String(error),
          publishedAt: now,
        });
      }
    } else if (!cfg.autoPublish) {
      results.push({ platform: 'bluesky', success: true, publishedAt: now });
    }
  }

  // ---- EMAIL via Gmail MCP ----
  let emailSent = false;
  if (options?.sendEmail) {
    const emailResult = await sendEmailNewsletter(brief, content, options.emailRecipients, options.pptxPath);
    results.push(emailResult);
    emailSent = emailResult.success;
  }

  // Track in analytics
  analytics.trackContent(contentId, {
    title: `Market Strategy ${brief.week}`,
    type: 'post',
    platforms: cfg.platforms,
    posts: results.filter(r => r.success && r.postId).map(r => ({
      platform: r.platform as Platform,
      postId: r.postId || contentId,
      url: r.url,
    })),
  });

  const totalPublished = results.filter(r => r.success).length;
  const totalFailed = results.filter(r => !r.success).length;

  return {
    id: randomUUID(),
    week: brief.week,
    results,
    totalPublished,
    totalFailed,
    emailSent,
    publishedAt: now,
  };
}

/**
 * Send email newsletter via Gmail MCP
 */
async function sendEmailNewsletter(
  brief: MarketBriefSummary,
  content: { twitter: string[]; linkedin: string; bluesky: string[] },
  recipients?: string[],
  pptxPath?: string,
): Promise<PublicationResult> {
  const now = new Date();
  const toList = recipients || process.env.NEWSLETTER_RECIPIENTS?.split(',').map(s => s.trim()).filter(Boolean);

  if (!toList || toList.length === 0) {
    return {
      platform: 'email',
      success: false,
      error: 'No email recipients configured (set NEWSLETTER_RECIPIENTS or pass emailRecipients)',
      publishedAt: now,
    };
  }

  try {
    const { getMCPClient } = await import('../mcp/index.js');
    const mcp = getMCPClient();

    const subject = `Weekly Market Strategy — ${brief.week} | ${brief.sentiment.overall.toUpperCase()}`;
    const body = buildNewsletterHtml(brief, content.linkedin);

    await mcp.call('gmail' as any, 'send_email', {
      to: toList,
      subject,
      body,
    });

    return {
      platform: 'email',
      success: true,
      recipients: toList.length,
      publishedAt: now,
    };
  } catch (error) {
    return {
      platform: 'email',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      publishedAt: now,
    };
  }
}

/**
 * Build HTML email body from brief + LinkedIn content
 */
function buildNewsletterHtml(brief: MarketBriefSummary, linkedinContent: string): string {
  const sentimentColor = brief.sentiment.overall === 'bullish' ? '#27AE60'
    : brief.sentiment.overall === 'bearish' ? '#E74C3C' : '#D4A056';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a; line-height: 1.6;">
  <div style="border-bottom: 3px solid ${sentimentColor}; padding-bottom: 10px; margin-bottom: 20px;">
    <h1 style="margin: 0; font-size: 22px; font-weight: normal; letter-spacing: 1px;">ROSSIGNOLI & PARTNERS</h1>
    <p style="margin: 5px 0 0; font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 2px;">Independent Wealth Management</p>
  </div>

  <h2 style="font-size: 18px; color: ${sentimentColor}; border-left: 4px solid ${sentimentColor}; padding-left: 12px;">
    Weekly Market Strategy — ${brief.week}
  </h2>
  <p style="font-size: 14px; color: #666;">
    Sentiment: <strong style="color: ${sentimentColor}">${brief.sentiment.overall.toUpperCase()}</strong> |
    Themes: ${brief.themes.slice(0, 3).join(' | ')}
  </p>

  <div style="white-space: pre-wrap; font-size: 14px; margin: 20px 0;">
${linkedinContent.split('\n').map(line => `    ${line}`).join('\n')}
  </div>

  <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
  <p style="font-size: 11px; color: #999; line-height: 1.5;">
    This material is for informational purposes only and does not constitute investment advice.
    Past performance is not indicative of future results. Rossignoli & Partners is regulated by FINMA.<br>
    Via Nassa 21, CH-6900 Lugano | +41 91 922 44 00 | www.rossignolipartners.ch<br>
    &copy; ${new Date().getFullYear()} Rossignoli & Partners. All rights reserved.
  </p>
</body>
</html>`;
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
