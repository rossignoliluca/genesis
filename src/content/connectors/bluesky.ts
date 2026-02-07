/**
 * Bluesky Connector
 *
 * AT Protocol / Bluesky API integration.
 * Rate limits: 5000 points/hr, 35000 points/day
 */

import type {
  BaseConnector,
  ConnectorHealth,
  BlueskyPostResult,
  BlueskyProfile,
  BlueskyEmbed,
  RateLimitConfig,
} from '../types.js';
import {
  RateLimiter,
  CircuitBreaker,
  executeWithProtection,
  buildHealthResponse,
  ConnectorError,
  retryWithBackoff,
  splitIntoChunks,
  addThreadNumbering,
} from './utils.js';

const BLUESKY_API_BASE = 'https://bsky.social/xrpc';

export interface BlueskyConfig {
  identifier: string;
  password: string;
}

interface AtSession {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

interface AtPost {
  uri: string;
  cid: string;
}

export class BlueskyConnector implements BaseConnector {
  readonly platform = 'bluesky' as const;

  private config: BlueskyConfig | null = null;
  private session: AtSession | null = null;
  private rateLimiter: RateLimiter;
  private circuitBreaker: CircuitBreaker;

  private static instance: BlueskyConnector | null = null;

  private constructor() {
    const rateLimitConfig: RateLimitConfig = { requests: 5000, windowMs: 60 * 60 * 1000, dailyLimit: 35000 };
    this.rateLimiter = new RateLimiter('bluesky', rateLimitConfig);
    this.circuitBreaker = new CircuitBreaker('bluesky');
  }

  static getInstance(): BlueskyConnector {
    if (!BlueskyConnector.instance) BlueskyConnector.instance = new BlueskyConnector();
    return BlueskyConnector.instance;
  }

  configure(config: BlueskyConfig): void {
    this.config = config;
    this.session = null;
  }

  isConfigured(): boolean {
    return this.config !== null && !!this.config.identifier && !!this.config.password;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    if (!this.isConfigured()) return buildHealthResponse('bluesky', false, undefined, 'Not configured');
    try {
      await this.ensureSession();
      return buildHealthResponse('bluesky', true, this.rateLimiter.getRemainingRequests());
    } catch (error) {
      return buildHealthResponse('bluesky', false, undefined, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async createPost(text: string, embed?: BlueskyEmbed): Promise<BlueskyPostResult> {
    await this.ensureSession();

    const facets = this.parseFacets(text);
    const record: Record<string, unknown> = {
      $type: 'app.bsky.feed.post',
      text,
      createdAt: new Date().toISOString(),
    };

    if (facets.length > 0) record.facets = facets;
    if (embed) record.embed = await this.buildEmbed(embed);

    const response = await executeWithProtection(
      this.rateLimiter,
      this.circuitBreaker,
      () =>
        this.makeRequest<AtPost>('POST', 'com.atproto.repo.createRecord', {
          repo: this.session!.did,
          collection: 'app.bsky.feed.post',
          record,
        }),
      'createPost',
    );

    return {
      uri: response.uri,
      cid: response.cid,
      text,
      createdAt: new Date(),
      url: this.buildPostUrl(response.uri),
    };
  }

  async createThread(posts: string[]): Promise<{ threadId: string; posts: BlueskyPostResult[]; url: string }> {
    await this.ensureSession();
    if (posts.length === 0) throw new ConnectorError('bluesky', 'Thread must have at least one post', 'INVALID_INPUT', false);
    if (posts.length > 10) throw new ConnectorError('bluesky', 'Thread cannot exceed 10 posts', 'THREAD_TOO_LONG', false);

    const results: BlueskyPostResult[] = [];
    let replyTo: { uri: string; cid: string } | undefined;
    let rootPost: { uri: string; cid: string } | undefined;

    for (const text of posts) {
      const facets = this.parseFacets(text);
      const record: Record<string, unknown> = {
        $type: 'app.bsky.feed.post',
        text,
        createdAt: new Date().toISOString(),
      };

      if (facets.length > 0) record.facets = facets;
      if (replyTo) {
        record.reply = {
          root: { uri: rootPost!.uri, cid: rootPost!.cid },
          parent: { uri: replyTo.uri, cid: replyTo.cid },
        };
      }

      const response = await executeWithProtection(
        this.rateLimiter,
        this.circuitBreaker,
        () =>
          this.makeRequest<AtPost>('POST', 'com.atproto.repo.createRecord', {
            repo: this.session!.did,
            collection: 'app.bsky.feed.post',
            record,
          }),
        'createThread',
      );

      const result: BlueskyPostResult = {
        uri: response.uri,
        cid: response.cid,
        text,
        createdAt: new Date(),
        url: this.buildPostUrl(response.uri),
      };

      results.push(result);
      if (!rootPost) rootPost = { uri: response.uri, cid: response.cid };
      replyTo = { uri: response.uri, cid: response.cid };
    }

    return { threadId: results[0].uri, posts: results, url: results[0].url };
  }

  async getProfile(): Promise<BlueskyProfile> {
    await this.ensureSession();
    const response = await retryWithBackoff(() =>
      this.makeRequest<{
        did: string;
        handle: string;
        displayName?: string;
        description?: string;
        avatar?: string;
        followersCount: number;
        followsCount: number;
        postsCount: number;
      }>('GET', 'app.bsky.actor.getProfile', undefined, { actor: this.session!.did }),
    );

    return response;
  }

  createThreadFromContent(content: string, maxPostLength = 300, includeNumbering = true): string[] {
    const effectiveLength = includeNumbering ? maxPostLength - 10 : maxPostLength;
    const chunks = splitIntoChunks(content, effectiveLength, true);
    if (includeNumbering && chunks.length > 1) return addThreadNumbering(chunks, 'fraction');
    return chunks;
  }

  private parseFacets(text: string): Array<{ index: { byteStart: number; byteEnd: number }; features: Array<{ $type: string; uri?: string; tag?: string }> }> {
    const facets: Array<{ index: { byteStart: number; byteEnd: number }; features: Array<{ $type: string; uri?: string; tag?: string }> }> = [];
    const encoder = new TextEncoder();

    // URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    let match: RegExpExecArray | null;
    while ((match = urlRegex.exec(text)) !== null) {
      const url = match[1];
      const byteStart = encoder.encode(text.slice(0, match.index)).length;
      const byteEnd = byteStart + encoder.encode(url).length;
      facets.push({
        index: { byteStart, byteEnd },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
      });
    }

    // Hashtags
    const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
    while ((match = hashtagRegex.exec(text)) !== null) {
      const tag = match[1];
      const byteStart = encoder.encode(text.slice(0, match.index)).length;
      const byteEnd = byteStart + encoder.encode(match[0]).length;
      facets.push({
        index: { byteStart, byteEnd },
        features: [{ $type: 'app.bsky.richtext.facet#tag', tag }],
      });
    }

    return facets;
  }

  private async buildEmbed(embed: BlueskyEmbed): Promise<Record<string, unknown>> {
    if (embed.type === 'external' && embed.external) {
      return {
        $type: 'app.bsky.embed.external',
        external: { uri: embed.external.uri, title: embed.external.title, description: embed.external.description },
      };
    }
    throw new ConnectorError('bluesky', `Unsupported embed type: ${embed.type}`, 'INVALID_EMBED', false);
  }

  private buildPostUrl(uri: string): string {
    const parts = uri.replace('at://', '').split('/');
    const rkey = parts[2];
    const handle = this.session?.handle || parts[0];
    return `https://bsky.app/profile/${handle}/post/${rkey}`;
  }

  private async ensureSession(): Promise<void> {
    this.ensureConfigured();
    if (this.session) return;
    await this.createSession();
  }

  private async createSession(): Promise<void> {
    const response = await fetch(`${BLUESKY_API_BASE}/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: this.config!.identifier, password: this.config!.password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ConnectorError('bluesky', error.message || 'Failed to create session', 'AUTH_FAILED', false);
    }

    this.session = await response.json();
  }

  private async makeRequest<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    body?: Record<string, unknown>,
    queryParams?: Record<string, string>,
  ): Promise<T> {
    if (!this.session) throw new ConnectorError('bluesky', 'No active session', 'NO_SESSION', false);

    const url = new URL(`${BLUESKY_API_BASE}/${endpoint}`);
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${this.session.accessJwt}`,
        'Content-Type': 'application/json',
      },
      ...(body && { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ConnectorError('bluesky', error.message || `API error: ${response.status}`, `HTTP_${response.status}`, response.status >= 500);
    }

    return response.json();
  }

  private ensureConfigured(): void {
    if (!this.isConfigured()) throw new ConnectorError('bluesky', 'Bluesky connector is not configured', 'NOT_CONFIGURED', false);
  }
}

export function getBlueskyConnector(): BlueskyConnector {
  return BlueskyConnector.getInstance();
}
