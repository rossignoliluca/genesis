/**
 * Content Scheduler
 *
 * Queue-based scheduling with platform-specific optimal timing.
 */

import crypto from 'node:crypto';
import type { Platform, ScheduledContent, OptimalTime, CrossPostResult, AudienceData, ContentStatus } from '../types.js';
import { getConnectorFactory } from '../connectors/index.js';

const OPTIMAL_TIMES: Record<Platform, { days: number[]; hours: number[] }> = {
  twitter: { days: [1, 2, 3, 4, 5], hours: [9, 12, 17] },
  linkedin: { days: [1, 2, 3, 4], hours: [8, 10, 12] },
  mastodon: { days: [0, 1, 2, 3, 4, 5, 6], hours: [10, 14, 20] },
  bluesky: { days: [1, 2, 3, 4, 5], hours: [9, 13, 18] },
  mirror: { days: [1, 2, 3, 4, 5], hours: [10, 14] },
  paragraph: { days: [0, 1, 2, 3, 4, 5, 6], hours: [9, 18] },
  substack: { days: [2, 4], hours: [8, 10] },
  hackmd: { days: [1, 2, 3, 4, 5], hours: [10, 14] },
  devto: { days: [1, 2, 3], hours: [9, 14] },
};

export class ContentScheduler {
  private queue: Map<string, ScheduledContent> = new Map();
  private processingInterval: ReturnType<typeof setInterval> | null = null;
  private isProcessing = false;

  private static instance: ContentScheduler | null = null;

  static getInstance(): ContentScheduler {
    if (!ContentScheduler.instance) ContentScheduler.instance = new ContentScheduler();
    return ContentScheduler.instance;
  }

  start(intervalMs = 60000): void {
    if (this.processingInterval) return;
    this.processingInterval = setInterval(() => this.processQueue().catch(console.error), intervalMs);
  }

  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  async enqueue(content: Omit<ScheduledContent, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date();
    this.queue.set(id, { id, ...content, status: 'scheduled', createdAt: now, updatedAt: now });
    return id;
  }

  async dequeue(contentId: string): Promise<void> {
    const content = this.queue.get(contentId);
    if (!content) throw new Error(`Content ${contentId} not found`);
    if (content.status === 'publishing') throw new Error('Cannot dequeue while publishing');
    this.queue.delete(contentId);
  }

  async getQueue(): Promise<ScheduledContent[]> {
    return Array.from(this.queue.values()).sort((a, b) => a.publishAt.getTime() - b.publishAt.getTime());
  }

  getOptimalTime(platform: Platform, audience?: AudienceData): OptimalTime {
    const config = OPTIMAL_TIMES[platform];
    const suggestedTime = this.findNextOptimalSlot(new Date(), config.days, config.hours);
    return {
      platform,
      suggestedTime,
      confidence: audience ? 0.85 : 0.7,
      reason: audience ? 'Based on audience patterns' : 'Based on platform engagement patterns',
    };
  }

  async processQueue(): Promise<CrossPostResult[]> {
    if (this.isProcessing) return [];
    this.isProcessing = true;
    const results: CrossPostResult[] = [];

    try {
      const now = new Date();
      const due = Array.from(this.queue.values()).filter((c) => c.status === 'scheduled' && c.publishAt <= now);

      for (const content of due) {
        content.status = 'publishing';
        content.updatedAt = new Date();

        const result = await this.publishToAllPlatforms(content);
        results.push(result);

        content.status = result.results.every((r) => r.success) ? 'published' : 'failed';
        content.updatedAt = new Date();
      }
    } finally {
      this.isProcessing = false;
    }

    return results;
  }

  async crossPost(content: string, platforms: Platform[], options?: { title?: string; hashtags?: string[] }): Promise<CrossPostResult> {
    const scheduled: ScheduledContent = {
      id: crypto.randomUUID(),
      content,
      title: options?.title,
      type: 'post',
      platforms,
      publishAt: new Date(),
      status: 'publishing',
      hashtags: options?.hashtags,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return this.publishToAllPlatforms(scheduled);
  }

  private async publishToAllPlatforms(content: ScheduledContent): Promise<CrossPostResult> {
    const factory = getConnectorFactory();
    const results: CrossPostResult['results'] = [];

    for (const platform of content.platforms) {
      try {
        const result = await this.publishToPlatform(content, platform);
        results.push({ platform, success: true, postId: result.postId, url: result.url });
      } catch (error) {
        results.push({ platform, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    return { contentId: content.id, results, publishedAt: new Date() };
  }

  private async publishToPlatform(content: ScheduledContent, platform: Platform): Promise<{ postId: string; url: string }> {
    const factory = getConnectorFactory();
    const text = this.prepareContent(content, platform);

    switch (platform) {
      case 'twitter': {
        const result = await factory.getTwitter().postTweet(text);
        return { postId: result.id, url: result.url };
      }
      case 'linkedin': {
        const result = await factory.getLinkedIn().createPost(text);
        return { postId: result.id, url: result.url };
      }
      case 'mastodon': {
        const result = await factory.getMastodon().toot(text);
        return { postId: result.id, url: result.url };
      }
      case 'bluesky': {
        const result = await factory.getBluesky().createPost(text);
        return { postId: result.uri, url: result.url };
      }
      default:
        throw new Error(`Platform ${platform} not supported`);
    }
  }

  private prepareContent(content: ScheduledContent, platform: Platform): string {
    let text = content.content;
    if (content.hashtags?.length) {
      const hashtagText = content.hashtags.map((h) => `#${h}`).join(' ');
      const limits: Record<string, number> = { twitter: 280, linkedin: 3000, mastodon: 500, bluesky: 300 };
      const limit = limits[platform] || 280;
      if (text.length + hashtagText.length + 2 <= limit) text = `${text}\n\n${hashtagText}`;
    }
    return text;
  }

  private findNextOptimalSlot(from: Date, days: number[], hours: number[]): Date {
    const sorted = [...hours].sort((a, b) => a - b);
    for (let offset = 0; offset < 14; offset++) {
      const check = new Date(from);
      check.setDate(check.getDate() + offset);
      if (days.includes(check.getDay())) {
        for (const hour of sorted) {
          const slot = new Date(check);
          slot.setHours(hour, 0, 0, 0);
          if (slot > from) return slot;
        }
      }
    }
    const fallback = new Date(from);
    fallback.setDate(fallback.getDate() + 1);
    fallback.setHours(sorted[0], 0, 0, 0);
    return fallback;
  }

  getStats(): { total: number; scheduled: number; published: number; failed: number } {
    const all = Array.from(this.queue.values());
    return {
      total: all.length,
      scheduled: all.filter((c) => c.status === 'scheduled').length,
      published: all.filter((c) => c.status === 'published').length,
      failed: all.filter((c) => c.status === 'failed').length,
    };
  }
}

export function getContentScheduler(): ContentScheduler {
  return ContentScheduler.getInstance();
}
