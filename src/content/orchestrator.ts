/**
 * Content Orchestrator
 *
 * Unified pipeline: research -> generate -> SEO optimize -> adapt -> publish
 */

import crypto from 'node:crypto';
import type {
  ContentRequest,
  ContentResult,
  ContentDraft,
  AdaptedContent,
  Platform,
  SocialPlatform,
  ContentType,
} from './types.js';
import { PLATFORM_CHARACTER_LIMITS } from './types.js';
import { getConnectorFactory, splitIntoChunks, addThreadNumbering } from './connectors/index.js';
import { getSEOEngine } from './seo/index.js';
import { getContentScheduler } from './scheduler/index.js';
import { getAnalyticsAggregator } from './analytics/index.js';

// v18.3: Component-specific memory with FSRS scheduling
import { getComponentMemory, type ComponentMemoryManager } from '../memory/index.js';

export type ContentGenerator = (
  topic: string,
  type: ContentType,
  keywords: string[],
  options?: { tone?: string; targetLength?: number },
) => Promise<{ title: string; content: string }>;

export type ContentResearcher = (topic: string) => Promise<{
  keywords: string[];
  relatedTopics: string[];
  trendingAngles: string[];
}>;

const defaultGenerator: ContentGenerator = async (topic, type, keywords) => ({
  title: `${topic.charAt(0).toUpperCase() + topic.slice(1)}: A Comprehensive Guide`,
  content: `# ${topic}\n\nContent about ${topic}. Keywords: ${keywords.join(', ')}.\n\n## Overview\n\n${type} content.\n`,
});

const defaultResearcher: ContentResearcher = async (topic) => {
  const seoEngine = getSEOEngine();
  const keywordData = await seoEngine.researchKeywords(topic);
  return {
    keywords: keywordData.map((k) => k.keyword).slice(0, 5),
    relatedTopics: keywordData[0]?.relatedKeywords || [],
    trendingAngles: [`Latest ${topic}`, `${topic} best practices`],
  };
};

export class ContentOrchestrator {
  private generator: ContentGenerator;
  private researcher: ContentResearcher;
  private componentMemory: ComponentMemoryManager;

  private static instance: ContentOrchestrator | null = null;

  private constructor(generator?: ContentGenerator, researcher?: ContentResearcher) {
    this.generator = generator || defaultGenerator;
    this.researcher = researcher || defaultResearcher;
    // v18.3: Component-specific memory for learning from past content
    this.componentMemory = getComponentMemory('content');
  }

  static getInstance(generator?: ContentGenerator, researcher?: ContentResearcher): ContentOrchestrator {
    if (!ContentOrchestrator.instance) {
      ContentOrchestrator.instance = new ContentOrchestrator(generator, researcher);
    } else {
      // Update generator/researcher if provided
      if (generator) ContentOrchestrator.instance.setGenerator(generator);
      if (researcher) ContentOrchestrator.instance.setResearcher(researcher);
    }
    return ContentOrchestrator.instance;
  }

  setGenerator(generator: ContentGenerator): void { this.generator = generator; }
  setResearcher(researcher: ContentResearcher): void { this.researcher = researcher; }

  async createAndPublish(request: ContentRequest): Promise<ContentResult> {
    const contentId = crypto.randomUUID();

    // 1. Research
    const research = await this.research(request.topic);
    const keywords = request.keywords?.length ? request.keywords : research.keywords;

    // 2. Generate
    const generated = await this.generate(request.topic, request.type, keywords, {
      tone: request.tone,
      targetLength: request.targetLength,
    });

    // 3. Create draft
    let draft: ContentDraft = {
      id: contentId,
      title: generated.title,
      content: generated.content,
      type: request.type,
      keywords,
      hashtags: [],
      createdAt: new Date(),
    };

    // 4. SEO optimize
    if (request.seoOptimize !== false) {
      draft = await this.optimizeSEO(draft);
    }

    // 5. Adapt for platforms
    const adaptedContent = this.adaptForPlatforms(draft, request.platforms);

    // 6. Schedule or publish
    let publishResults: ContentResult['publishResults'];
    let scheduledFor: Date | undefined;

    if (request.schedule) {
      await getContentScheduler().enqueue({
        content: draft.content,
        title: draft.title,
        type: draft.type,
        platforms: request.platforms,
        publishAt: request.schedule,
        hashtags: draft.hashtags,
      });
      scheduledFor = request.schedule;
    } else if (request.crossPost !== false) {
      const result = await getContentScheduler().crossPost(draft.content, request.platforms, {
        title: draft.title,
        hashtags: draft.hashtags,
      });

      publishResults = result.results.map((r) => ({
        platform: r.platform,
        success: r.success,
        postId: r.postId,
        url: r.url,
        error: r.error,
        publishedAt: r.success ? new Date() : undefined,
      }));

      // Track for analytics
      getAnalyticsAggregator().trackContent(contentId, {
        title: draft.title,
        type: draft.type,
        platforms: request.platforms,
        posts: publishResults.filter((r) => r.success && r.postId).map((r) => ({
          platform: r.platform,
          postId: r.postId!,
          url: r.url,
        })),
      });
    }

    // v18.3: Store content creation episode to component memory for FSRS-based learning
    const successfulPublishes = publishResults?.filter(r => r.success).length ?? 0;
    this.componentMemory.storeEpisodic({
      id: `content-${contentId}`,
      type: 'episodic',
      created: new Date(),
      lastAccessed: new Date(),
      accessCount: 0,
      R0: 0.9,
      S: 14, // Content memories have longer base stability
      importance: Math.min(1, 0.5 + successfulPublishes * 0.1), // More publishes = more important
      emotionalValence: 0,
      associations: [],
      tags: ['content', request.type, ...request.platforms, ...keywords.slice(0, 3)],
      consolidated: false,
      content: {
        what: `Created ${request.type}: ${draft.title}`,
        details: {
          topic: request.topic,
          type: request.type,
          platforms: request.platforms,
          keywords,
          seoScore: draft.seoScore,
          successfulPublishes,
        },
      },
      when: {
        timestamp: new Date(),
      },
    });

    return {
      id: contentId,
      status: request.schedule ? 'scheduled' : 'published',
      draft,
      adaptedContent,
      publishResults,
      scheduledFor,
      createdAt: new Date(),
    };
  }

  async research(topic: string) {
    // v18.3: Retrieve relevant past content episodes for informed research
    const pastEpisodes = this.componentMemory.search(topic, { limit: 3, tags: ['content'] });
    const pastTopics = pastEpisodes.map(ep => {
      const content = ep.memory.content as { details?: { keywords?: string[] } };
      return content.details?.keywords ?? [];
    }).flat();

    const research = await this.researcher(topic);

    // Enhance research with past successful keywords
    if (pastTopics.length > 0) {
      research.keywords = [...new Set([...research.keywords, ...pastTopics])].slice(0, 10);
    }

    return research;
  }

  async generate(topic: string, type: ContentType, keywords: string[], options?: { tone?: string; targetLength?: number }) {
    return this.generator(topic, type, keywords, options);
  }

  async optimizeSEO(draft: ContentDraft): Promise<ContentDraft> {
    const seoEngine = getSEOEngine();
    const optimizedTitle = seoEngine.optimizeTitle(draft.title, draft.keywords);
    const excerpt = seoEngine.generateMetaDescription(draft.content, draft.keywords);
    const seoScore = seoEngine.calculateSEOScore({ ...draft, title: optimizedTitle, excerpt });
    const hashtags = seoEngine.generateHashtags(draft.content, draft.keywords, 5);

    return { ...draft, title: optimizedTitle, excerpt, hashtags, seoScore };
  }

  adaptForPlatforms(draft: ContentDraft, platforms: Platform[]): AdaptedContent[] {
    return platforms.map((platform) => this.adaptForPlatform(draft, platform));
  }

  adaptForPlatform(draft: ContentDraft, platform: Platform): AdaptedContent {
    const socialPlatforms = ['twitter', 'linkedin', 'mastodon', 'bluesky'];
    if (!socialPlatforms.includes(platform)) {
      return {
        platform,
        content: draft.content,
        title: draft.title,
        hashtags: draft.hashtags,
        characterCount: draft.content.length,
        withinLimit: true,
      };
    }

    const charLimit = PLATFORM_CHARACTER_LIMITS[platform as SocialPlatform];
    let adaptedContent = this.condenseSocialContent(draft, platform as SocialPlatform);

    const hashtagText = draft.hashtags.map((h) => `#${h}`).join(' ');
    if (adaptedContent.length + hashtagText.length + 2 <= charLimit) {
      adaptedContent = `${adaptedContent}\n\n${hashtagText}`;
    }

    return {
      platform,
      content: adaptedContent,
      title: draft.title,
      hashtags: draft.hashtags,
      characterCount: adaptedContent.length,
      withinLimit: adaptedContent.length <= charLimit,
    };
  }

  createThread(content: string, platform: SocialPlatform, includeNumbering = true): string[] {
    const charLimit = PLATFORM_CHARACTER_LIMITS[platform];
    const effectiveLimit = includeNumbering ? charLimit - 10 : charLimit;
    const chunks = splitIntoChunks(content, effectiveLimit, true);
    if (includeNumbering && chunks.length > 1) return addThreadNumbering(chunks, 'fraction');
    return chunks;
  }

  private condenseSocialContent(draft: ContentDraft, platform: SocialPlatform): string {
    const charLimit = PLATFORM_CHARACTER_LIMITS[platform];
    if (draft.excerpt && draft.excerpt.length <= charLimit) return draft.excerpt;

    let condensed = draft.title;
    const paragraph = draft.content.split(/\n\n+/).find((p) => p.trim().length > 50 && !p.startsWith('#'));
    if (paragraph) {
      const clean = this.stripMarkdown(paragraph);
      const available = charLimit - draft.title.length - 4;
      if (available > 50) {
        condensed = `${draft.title}\n\n${clean.length > available ? clean.slice(0, available - 3) + '...' : clean}`;
      }
    }

    if (condensed.length > charLimit) condensed = condensed.slice(0, charLimit - 3) + '...';
    return condensed;
  }

  private stripMarkdown(text: string): string {
    return text
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trim();
  }
}

export function getContentOrchestrator(generator?: ContentGenerator, researcher?: ContentResearcher): ContentOrchestrator {
  return ContentOrchestrator.getInstance(generator, researcher);
}
