/**
 * Mastodon Connector
 *
 * Mastodon API v1 integration.
 * Rate limits: 300 requests/5min (configurable per instance)
 */

import type {
  BaseConnector,
  ConnectorHealth,
  TootResult,
  MastodonVisibility,
  MastodonNotification,
  RateLimitConfig,
} from '../types.js';
import {
  RateLimiter,
  CircuitBreaker,
  executeWithProtection,
  buildHealthResponse,
  ConnectorError,
  retryWithBackoff,
} from './utils.js';

export interface MastodonConfig {
  instance: string;
  accessToken: string;
}

interface MastodonStatus {
  id: string;
  created_at: string;
  content: string;
  visibility: string;
  url: string;
  replies_count: number;
  reblogs_count: number;
  favourites_count: number;
}

export class MastodonConnector implements BaseConnector {
  readonly platform = 'mastodon' as const;

  private config: MastodonConfig | null = null;
  private rateLimiter: RateLimiter;
  private circuitBreaker: CircuitBreaker;

  private static instance: MastodonConnector | null = null;

  private constructor() {
    const rateLimitConfig: RateLimitConfig = { requests: 300, windowMs: 5 * 60 * 1000 };
    this.rateLimiter = new RateLimiter('mastodon', rateLimitConfig);
    this.circuitBreaker = new CircuitBreaker('mastodon');
  }

  static getInstance(): MastodonConnector {
    if (!MastodonConnector.instance) MastodonConnector.instance = new MastodonConnector();
    return MastodonConnector.instance;
  }

  configure(config: MastodonConfig): void {
    let instance = config.instance;
    if (instance.startsWith('http')) instance = new URL(instance).host;
    this.config = { ...config, instance };
  }

  isConfigured(): boolean {
    return this.config !== null && !!this.config.instance && !!this.config.accessToken;
  }

  private getApiBase(): string {
    return `https://${this.config!.instance}/api/v1`;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    if (!this.isConfigured()) return buildHealthResponse('mastodon', false, undefined, 'Not configured');
    try {
      await this.verifyCredentials();
      return buildHealthResponse('mastodon', true, this.rateLimiter.getRemainingRequests());
    } catch (error) {
      return buildHealthResponse('mastodon', false, undefined, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async toot(
    content: string,
    visibility: MastodonVisibility = 'public',
    options?: { inReplyToId?: string; sensitive?: boolean; spoilerText?: string; mediaIds?: string[] },
  ): Promise<TootResult> {
    this.ensureConfigured();

    const body: Record<string, unknown> = { status: content, visibility };
    if (options?.inReplyToId) body.in_reply_to_id = options.inReplyToId;
    if (options?.sensitive) body.sensitive = true;
    if (options?.spoilerText) body.spoiler_text = options.spoilerText;
    if (options?.mediaIds?.length) body.media_ids = options.mediaIds;

    const response = await executeWithProtection(
      this.rateLimiter,
      this.circuitBreaker,
      () => this.makeRequest<MastodonStatus>('POST', '/statuses', body),
      'toot',
    );

    return this.mapStatusResult(response);
  }

  async reply(statusId: string, content: string, visibility: MastodonVisibility = 'public'): Promise<TootResult> {
    return this.toot(content, visibility, { inReplyToId: statusId });
  }

  async boostStatus(statusId: string): Promise<void> {
    this.ensureConfigured();
    await executeWithProtection(
      this.rateLimiter,
      this.circuitBreaker,
      () => this.makeRequest('POST', `/statuses/${statusId}/reblog`),
      'boostStatus',
    );
  }

  async favouriteStatus(statusId: string): Promise<void> {
    this.ensureConfigured();
    await executeWithProtection(
      this.rateLimiter,
      this.circuitBreaker,
      () => this.makeRequest('POST', `/statuses/${statusId}/favourite`),
      'favouriteStatus',
    );
  }

  async getNotifications(limit = 20): Promise<MastodonNotification[]> {
    this.ensureConfigured();
    const response = await retryWithBackoff(() =>
      this.makeRequest<Array<{ id: string; type: string; created_at: string; account: { id: string }; status?: { id: string } }>>(
        'GET',
        '/notifications',
        undefined,
        { limit: limit.toString() },
      ),
    );

    return response.map((n) => ({
      id: n.id,
      type: n.type as MastodonNotification['type'],
      createdAt: new Date(n.created_at),
      accountId: n.account.id,
      statusId: n.status?.id,
    }));
  }

  async getStatus(statusId: string): Promise<TootResult> {
    this.ensureConfigured();
    const response = await this.makeRequest<MastodonStatus>('GET', `/statuses/${statusId}`);
    return this.mapStatusResult(response);
  }

  async getAccountStats(): Promise<{ followersCount: number; followingCount: number; statusesCount: number }> {
    const account = await this.verifyCredentials();
    return {
      followersCount: account.followers_count,
      followingCount: account.following_count,
      statusesCount: account.statuses_count,
    };
  }

  private async verifyCredentials(): Promise<{ id: string; followers_count: number; following_count: number; statuses_count: number }> {
    this.ensureConfigured();
    return this.makeRequest('GET', '/accounts/verify_credentials');
  }

  private async makeRequest<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    body?: Record<string, unknown>,
    queryParams?: Record<string, string>,
  ): Promise<T> {
    if (!this.config) throw new ConnectorError('mastodon', 'Not configured', 'NOT_CONFIGURED', false);

    const url = new URL(`${this.getApiBase()}${endpoint}`);
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      ...(body && { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ConnectorError('mastodon', error.error || `API error: ${response.status}`, `HTTP_${response.status}`, response.status >= 500);
    }

    if (response.status === 204) return {} as T;
    return response.json();
  }

  private mapStatusResult(status: MastodonStatus): TootResult {
    return {
      id: status.id,
      content: status.content,
      visibility: status.visibility as MastodonVisibility,
      createdAt: new Date(status.created_at),
      url: status.url,
      repliesCount: status.replies_count,
      reblogsCount: status.reblogs_count,
      favouritesCount: status.favourites_count,
    };
  }

  private ensureConfigured(): void {
    if (!this.isConfigured()) throw new ConnectorError('mastodon', 'Mastodon connector is not configured', 'NOT_CONFIGURED', false);
  }
}

export function getMastodonConnector(): MastodonConnector {
  return MastodonConnector.getInstance();
}
