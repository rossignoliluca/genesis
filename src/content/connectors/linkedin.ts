/**
 * LinkedIn Connector
 *
 * LinkedIn Marketing API integration.
 * Rate limits: 100 posts/day
 */

import type {
  BaseConnector,
  ConnectorHealth,
  LinkedInPostResult,
  LinkedInAnalytics,
  LinkedInVisibility,
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

const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';

export interface LinkedInConfig {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  organizationId?: string;
}

export class LinkedInConnector implements BaseConnector {
  readonly platform = 'linkedin' as const;

  private config: LinkedInConfig | null = null;
  private rateLimiter: RateLimiter;
  private circuitBreaker: CircuitBreaker;
  private personUrn: string | null = null;

  private static instance: LinkedInConnector | null = null;

  private constructor() {
    const rateLimitConfig: RateLimitConfig = { requests: 100, windowMs: 24 * 60 * 60 * 1000 };
    this.rateLimiter = new RateLimiter('linkedin', rateLimitConfig);
    this.circuitBreaker = new CircuitBreaker('linkedin');
  }

  static getInstance(): LinkedInConnector {
    if (!LinkedInConnector.instance) LinkedInConnector.instance = new LinkedInConnector();
    return LinkedInConnector.instance;
  }

  configure(config: LinkedInConfig): void {
    this.config = config;
    this.personUrn = null;
  }

  isConfigured(): boolean {
    return this.config !== null && !!this.config.clientId && !!this.config.accessToken;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    if (!this.isConfigured()) return buildHealthResponse('linkedin', false, undefined, 'Not configured');
    try {
      await this.getPersonUrn();
      return buildHealthResponse('linkedin', true, this.rateLimiter.getRemainingRequests());
    } catch (error) {
      return buildHealthResponse('linkedin', false, undefined, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async createPost(content: string, visibility: LinkedInVisibility = 'PUBLIC'): Promise<LinkedInPostResult> {
    this.ensureConfigured();
    const authorUrn = await this.getAuthorUrn();

    const shareContent = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': visibility },
    };

    const response = await executeWithProtection(
      this.rateLimiter,
      this.circuitBreaker,
      () => this.makeRequest<{ id: string }>('POST', '/ugcPosts', shareContent),
      'createPost',
    );

    return {
      id: response.id,
      content,
      visibility,
      createdAt: new Date(),
      url: `https://www.linkedin.com/feed/update/${response.id}`,
    };
  }

  async shareArticle(url: string, comment: string, visibility: LinkedInVisibility = 'PUBLIC'): Promise<LinkedInPostResult> {
    this.ensureConfigured();
    const authorUrn = await this.getAuthorUrn();

    const shareContent = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: comment },
          shareMediaCategory: 'ARTICLE',
          media: [{ status: 'READY', originalUrl: url }],
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': visibility },
    };

    const response = await executeWithProtection(
      this.rateLimiter,
      this.circuitBreaker,
      () => this.makeRequest<{ id: string }>('POST', '/ugcPosts', shareContent),
      'shareArticle',
    );

    return {
      id: response.id,
      content: comment,
      visibility,
      createdAt: new Date(),
      url: `https://www.linkedin.com/feed/update/${response.id}`,
    };
  }

  async getPostAnalytics(postId: string): Promise<LinkedInAnalytics> {
    this.ensureConfigured();
    const shareId = postId.includes(':share:') ? postId.split(':share:')[1] : postId;

    const response = await retryWithBackoff(() =>
      this.makeRequest<{ totalShareStatistics: LinkedInAnalytics }>(
        'GET',
        '/organizationalEntityShareStatistics',
        undefined,
        { q: 'organizationalEntity', shares: `urn:li:share:${shareId}` },
      ),
    );

    return response.totalShareStatistics;
  }

  private async getAuthorUrn(): Promise<string> {
    if (this.config?.organizationId) return `urn:li:organization:${this.config.organizationId}`;
    return this.getPersonUrn();
  }

  private async getPersonUrn(): Promise<string> {
    if (this.personUrn) return this.personUrn;
    const profile = await this.makeRequest<{ id: string }>('GET', '/me');
    this.personUrn = `urn:li:person:${profile.id}`;
    return this.personUrn;
  }

  private async makeRequest<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    body?: Record<string, unknown>,
    queryParams?: Record<string, string>,
  ): Promise<T> {
    if (!this.config) throw new ConnectorError('linkedin', 'Not configured', 'NOT_CONFIGURED', false);

    const url = new URL(`${LINKEDIN_API_BASE}${endpoint}`);
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      ...(body && { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ConnectorError('linkedin', error.message || `API error: ${response.status}`, `HTTP_${response.status}`, response.status >= 500);
    }

    if (response.status === 201) {
      const locationHeader = response.headers.get('X-RestLi-Id');
      return { id: locationHeader } as T;
    }

    return response.json();
  }

  private ensureConfigured(): void {
    if (!this.isConfigured()) throw new ConnectorError('linkedin', 'LinkedIn connector is not configured', 'NOT_CONFIGURED', false);
  }
}

export function getLinkedInConnector(): LinkedInConnector {
  return LinkedInConnector.getInstance();
}
