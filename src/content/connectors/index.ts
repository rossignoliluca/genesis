/**
 * Social Media Connectors
 *
 * Unified API for multi-platform social media publishing.
 */

import type { BaseConnector, ConnectorHealth, SocialPlatform } from '../types.js';
import { TwitterConnector, getTwitterConnector, type TwitterConfig } from './twitter.js';
import { LinkedInConnector, getLinkedInConnector, type LinkedInConfig } from './linkedin.js';
import { MastodonConnector, getMastodonConnector, type MastodonConfig } from './mastodon.js';
import { BlueskyConnector, getBlueskyConnector, type BlueskyConfig } from './bluesky.js';

export { TwitterConnector, getTwitterConnector, type TwitterConfig } from './twitter.js';
export { LinkedInConnector, getLinkedInConnector, type LinkedInConfig } from './linkedin.js';
export { MastodonConnector, getMastodonConnector, type MastodonConfig } from './mastodon.js';
export { BlueskyConnector, getBlueskyConnector, type BlueskyConfig } from './bluesky.js';
export {
  RateLimiter,
  CircuitBreaker,
  ConnectorError,
  RateLimitError,
  executeWithProtection,
  retryWithBackoff,
  splitIntoChunks,
  addThreadNumbering,
  extractHashtags,
} from './utils.js';

export interface ConnectorConfigs {
  twitter?: TwitterConfig;
  linkedin?: LinkedInConfig;
  mastodon?: MastodonConfig;
  bluesky?: BlueskyConfig;
}

export class ConnectorFactory {
  private static instance: ConnectorFactory | null = null;
  private initialized = false;

  private constructor() {}

  static getInstance(): ConnectorFactory {
    if (!ConnectorFactory.instance) ConnectorFactory.instance = new ConnectorFactory();
    return ConnectorFactory.instance;
  }

  initialize(configs: ConnectorConfigs): void {
    if (configs.twitter) getTwitterConnector().configure(configs.twitter);
    if (configs.linkedin) getLinkedInConnector().configure(configs.linkedin);
    if (configs.mastodon) getMastodonConnector().configure(configs.mastodon);
    if (configs.bluesky) getBlueskyConnector().configure(configs.bluesky);
    this.initialized = true;
  }

  getConnector(platform: SocialPlatform): BaseConnector {
    switch (platform) {
      case 'twitter': return getTwitterConnector();
      case 'linkedin': return getLinkedInConnector();
      case 'mastodon': return getMastodonConnector();
      case 'bluesky': return getBlueskyConnector();
    }
  }

  getTwitter(): TwitterConnector { return getTwitterConnector(); }
  getLinkedIn(): LinkedInConnector { return getLinkedInConnector(); }
  getMastodon(): MastodonConnector { return getMastodonConnector(); }
  getBluesky(): BlueskyConnector { return getBlueskyConnector(); }

  getConfiguredConnectors(): BaseConnector[] {
    const connectors: BaseConnector[] = [];
    if (getTwitterConnector().isConfigured()) connectors.push(getTwitterConnector());
    if (getLinkedInConnector().isConfigured()) connectors.push(getLinkedInConnector());
    if (getMastodonConnector().isConfigured()) connectors.push(getMastodonConnector());
    if (getBlueskyConnector().isConfigured()) connectors.push(getBlueskyConnector());
    return connectors;
  }

  getConfiguredPlatforms(): SocialPlatform[] {
    const platforms: SocialPlatform[] = [];
    if (getTwitterConnector().isConfigured()) platforms.push('twitter');
    if (getLinkedInConnector().isConfigured()) platforms.push('linkedin');
    if (getMastodonConnector().isConfigured()) platforms.push('mastodon');
    if (getBlueskyConnector().isConfigured()) platforms.push('bluesky');
    return platforms;
  }

  async healthCheckAll(): Promise<Record<SocialPlatform, ConnectorHealth>> {
    const [twitter, linkedin, mastodon, bluesky] = await Promise.all([
      getTwitterConnector().healthCheck(),
      getLinkedInConnector().healthCheck(),
      getMastodonConnector().healthCheck(),
      getBlueskyConnector().healthCheck(),
    ]);
    return { twitter, linkedin, mastodon, bluesky };
  }

  isInitialized(): boolean { return this.initialized; }
}

export function getConnectorFactory(): ConnectorFactory {
  return ConnectorFactory.getInstance();
}

export function initializeFromEnv(): void {
  const configs: ConnectorConfigs = {};

  if (process.env.TWITTER_API_KEY) {
    configs.twitter = {
      apiKey: process.env.TWITTER_API_KEY,
      apiSecret: process.env.TWITTER_API_SECRET || '',
      accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
      accessSecret: process.env.TWITTER_ACCESS_SECRET || '',
      bearerToken: process.env.TWITTER_BEARER_TOKEN,
    };
  }

  if (process.env.LINKEDIN_CLIENT_ID) {
    configs.linkedin = {
      clientId: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN || '',
      organizationId: process.env.LINKEDIN_ORGANIZATION_ID,
    };
  }

  if (process.env.MASTODON_ACCESS_TOKEN) {
    configs.mastodon = {
      instance: process.env.MASTODON_INSTANCE || 'mastodon.social',
      accessToken: process.env.MASTODON_ACCESS_TOKEN,
    };
  }

  if (process.env.BLUESKY_HANDLE) {
    configs.bluesky = {
      identifier: process.env.BLUESKY_HANDLE,
      password: process.env.BLUESKY_APP_PASSWORD || '',
    };
  }

  getConnectorFactory().initialize(configs);
}
