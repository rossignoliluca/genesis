/**
 * Twitter/X Connector
 *
 * Twitter API v2 integration with OAuth 1.0a authentication.
 * Rate limits: 300 tweets/3hr, 1500 tweets/day
 */

import crypto from 'node:crypto';
import type {
  BaseConnector,
  ConnectorHealth,
  TweetResult,
  ThreadResult,
  TweetAnalytics,
  ScheduledTweet,
  RateLimitConfig,
} from '../types.js';
import {
  RateLimiter,
  CircuitBreaker,
  executeWithProtection,
  buildHealthResponse,
  ConnectorError,
  splitIntoChunks,
  addThreadNumbering,
  retryWithBackoff,
} from './utils.js';

const TWITTER_API_BASE = 'https://api.twitter.com/2';

export interface TwitterConfig {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
  bearerToken?: string;
}

interface TwitterApiTweet {
  id: string;
  text: string;
  created_at?: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
  };
  non_public_metrics?: {
    impression_count: number;
    user_profile_clicks: number;
    url_link_clicks: number;
  };
}

interface TwitterApiResponse<T> {
  data?: T;
  errors?: Array<{ message: string; code: number }>;
}

export class TwitterConnector implements BaseConnector {
  readonly platform = 'twitter' as const;

  private config: TwitterConfig | null = null;
  private rateLimiter: RateLimiter;
  private circuitBreaker: CircuitBreaker;

  private static instance: TwitterConnector | null = null;

  private constructor() {
    const rateLimitConfig: RateLimitConfig = {
      requests: 300,
      windowMs: 3 * 60 * 60 * 1000,
      dailyLimit: 1500,
    };
    this.rateLimiter = new RateLimiter('twitter', rateLimitConfig);
    this.circuitBreaker = new CircuitBreaker('twitter');
  }

  static getInstance(): TwitterConnector {
    if (!TwitterConnector.instance) {
      TwitterConnector.instance = new TwitterConnector();
    }
    return TwitterConnector.instance;
  }

  configure(config: TwitterConfig): void {
    this.config = config;
  }

  isConfigured(): boolean {
    return (
      this.config !== null &&
      !!this.config.apiKey &&
      !!this.config.apiSecret &&
      !!this.config.accessToken &&
      !!this.config.accessSecret
    );
  }

  async healthCheck(): Promise<ConnectorHealth> {
    if (!this.isConfigured()) {
      return buildHealthResponse('twitter', false, undefined, 'Not configured');
    }
    try {
      await this.makeRequest<{ data: { id: string } }>('GET', '/users/me');
      return buildHealthResponse('twitter', true, this.rateLimiter.getRemainingRequests());
    } catch (error) {
      return buildHealthResponse('twitter', false, undefined, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async postTweet(content: string, media?: Buffer[]): Promise<TweetResult> {
    this.ensureConfigured();
    const mediaIds = media ? await this.uploadMedia(media) : undefined;

    const response = await executeWithProtection(
      this.rateLimiter,
      this.circuitBreaker,
      () =>
        this.makeRequest<TwitterApiResponse<TwitterApiTweet>>('POST', '/tweets', {
          text: content,
          ...(mediaIds && { media: { media_ids: mediaIds } }),
        }),
      'postTweet',
    );

    if (!response.data) {
      throw new ConnectorError('twitter', 'Failed to create tweet', 'CREATE_FAILED', false);
    }
    return this.mapTweetResult(response.data);
  }

  async postThread(tweets: string[]): Promise<ThreadResult> {
    this.ensureConfigured();
    if (tweets.length === 0) throw new ConnectorError('twitter', 'Thread must have at least one tweet', 'INVALID_INPUT', false);
    if (tweets.length > 25) throw new ConnectorError('twitter', 'Thread cannot exceed 25 tweets', 'THREAD_TOO_LONG', false);

    const results: TweetResult[] = [];
    let replyToId: string | undefined;

    for (const tweet of tweets) {
      const response = await executeWithProtection(
        this.rateLimiter,
        this.circuitBreaker,
        () =>
          this.makeRequest<TwitterApiResponse<TwitterApiTweet>>('POST', '/tweets', {
            text: tweet,
            ...(replyToId && { reply: { in_reply_to_tweet_id: replyToId } }),
          }),
        'postThread',
      );

      if (!response.data) {
        throw new ConnectorError('twitter', `Failed to create tweet ${results.length + 1} in thread`, 'THREAD_CREATE_FAILED', false);
      }

      const result = this.mapTweetResult(response.data);
      results.push(result);
      replyToId = result.id;
    }

    return { threadId: results[0].id, tweets: results, url: results[0].url };
  }

  async replyTo(tweetId: string, content: string): Promise<TweetResult> {
    this.ensureConfigured();
    const response = await executeWithProtection(
      this.rateLimiter,
      this.circuitBreaker,
      () =>
        this.makeRequest<TwitterApiResponse<TwitterApiTweet>>('POST', '/tweets', {
          text: content,
          reply: { in_reply_to_tweet_id: tweetId },
        }),
      'replyTo',
    );

    if (!response.data) throw new ConnectorError('twitter', 'Failed to create reply', 'REPLY_FAILED', false);
    return this.mapTweetResult(response.data);
  }

  async getAnalytics(tweetId: string): Promise<TweetAnalytics> {
    this.ensureConfigured();
    const response = await retryWithBackoff(() =>
      this.makeRequest<TwitterApiResponse<TwitterApiTweet>>('GET', `/tweets/${tweetId}`, undefined, {
        'tweet.fields': 'public_metrics,non_public_metrics,created_at',
      }),
    );

    if (!response.data) throw new ConnectorError('twitter', 'Tweet not found', 'NOT_FOUND', false);

    const pm = response.data.public_metrics || { retweet_count: 0, reply_count: 0, like_count: 0, quote_count: 0 };
    const npm = response.data.non_public_metrics || { impression_count: 0, user_profile_clicks: 0, url_link_clicks: 0 };

    return {
      impressions: npm.impression_count,
      engagements: pm.retweet_count + pm.reply_count + pm.like_count + pm.quote_count,
      likes: pm.like_count,
      retweets: pm.retweet_count,
      replies: pm.reply_count,
      quotes: pm.quote_count,
      clicks: npm.url_link_clicks,
      profileClicks: npm.user_profile_clicks,
    };
  }

  async scheduleTweet(content: string, publishAt: Date): Promise<ScheduledTweet> {
    this.ensureConfigured();
    if (publishAt <= new Date()) {
      throw new ConnectorError('twitter', 'Scheduled time must be in the future', 'INVALID_SCHEDULE_TIME', false);
    }
    return { scheduledId: crypto.randomUUID(), content, publishAt, status: 'pending' };
  }

  createThreadFromContent(content: string, maxTweetLength = 280, includeNumbering = true): string[] {
    const effectiveLength = includeNumbering ? maxTweetLength - 10 : maxTweetLength;
    const chunks = splitIntoChunks(content, effectiveLength, true);
    if (includeNumbering && chunks.length > 1) return addThreadNumbering(chunks, 'fraction');
    return chunks;
  }

  private async uploadMedia(files: Buffer[]): Promise<string[]> {
    const mediaIds: string[] = [];
    for (const file of files) {
      const response = await this.makeMediaUploadRequest(file);
      if (response.media_id_string) mediaIds.push(response.media_id_string);
    }
    return mediaIds;
  }

  private async makeRequest<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    body?: Record<string, unknown>,
    queryParams?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${TWITTER_API_BASE}${endpoint}`);
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) url.searchParams.set(key, value);
    }

    const headers = this.buildAuthHeaders(method, url.toString());
    const response = await fetch(url.toString(), {
      method,
      headers: { ...headers, 'Content-Type': 'application/json' },
      ...(body && { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ConnectorError('twitter', error.detail || `API error: ${response.status}`, `HTTP_${response.status}`, response.status >= 500);
    }
    return response.json();
  }

  private async makeMediaUploadRequest(file: Buffer): Promise<{ media_id_string: string }> {
    const url = 'https://upload.twitter.com/1.1/media/upload.json';
    const formData = new FormData();
    formData.append('media', new Blob([new Uint8Array(file)]));
    const headers = this.buildAuthHeaders('POST', url);

    const response = await fetch(url, { method: 'POST', headers, body: formData });
    if (!response.ok) throw new ConnectorError('twitter', 'Failed to upload media', 'MEDIA_UPLOAD_FAILED', true);
    return response.json();
  }

  private buildAuthHeaders(method: string, url: string): Record<string, string> {
    if (!this.config) throw new ConnectorError('twitter', 'Not configured', 'NOT_CONFIGURED', false);

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: this.config.apiKey,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_token: this.config.accessToken,
      oauth_version: '1.0',
    };

    const signatureBaseString = this.buildSignatureBaseString(method, url, oauthParams);
    const signingKey = `${encodeURIComponent(this.config.apiSecret)}&${encodeURIComponent(this.config.accessSecret)}`;
    const signature = crypto.createHmac('sha1', signingKey).update(signatureBaseString).digest('base64');
    oauthParams.oauth_signature = signature;

    const authHeader = 'OAuth ' + Object.entries(oauthParams)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${encodeURIComponent(key)}="${encodeURIComponent(value)}"`)
      .join(', ');

    return { Authorization: authHeader };
  }

  private buildSignatureBaseString(method: string, url: string, params: Record<string, string>): string {
    const parsedUrl = new URL(url);
    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`;
    const allParams: Record<string, string> = { ...params };
    parsedUrl.searchParams.forEach((value, key) => { allParams[key] = value; });

    const paramString = Object.entries(allParams)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');

    return `${method.toUpperCase()}&${encodeURIComponent(baseUrl)}&${encodeURIComponent(paramString)}`;
  }

  private mapTweetResult(tweet: TwitterApiTweet): TweetResult {
    return {
      id: tweet.id,
      text: tweet.text,
      createdAt: tweet.created_at ? new Date(tweet.created_at) : new Date(),
      url: `https://twitter.com/i/web/status/${tweet.id}`,
    };
  }

  private ensureConfigured(): void {
    if (!this.isConfigured()) throw new ConnectorError('twitter', 'Twitter connector is not configured', 'NOT_CONFIGURED', false);
  }
}

export function getTwitterConnector(): TwitterConnector {
  return TwitterConnector.getInstance();
}
