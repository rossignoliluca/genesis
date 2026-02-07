/**
 * Content Creator Module - Type Definitions
 *
 * Multi-platform social media publishing with:
 * - Twitter/X, LinkedIn, Mastodon, Bluesky connectors
 * - SEO optimization
 * - Scheduling and cross-posting
 * - Analytics aggregation
 */

// =============================================================================
// Platform Types
// =============================================================================

export type Platform =
  | 'twitter'
  | 'linkedin'
  | 'mastodon'
  | 'bluesky'
  | 'mirror'
  | 'paragraph'
  | 'substack'
  | 'hackmd'
  | 'devto';

export type SocialPlatform = 'twitter' | 'linkedin' | 'mastodon' | 'bluesky';

export type ContentPlatform = 'mirror' | 'paragraph' | 'substack' | 'hackmd' | 'devto';

// =============================================================================
// Content Types
// =============================================================================

export type ContentType = 'article' | 'thread' | 'post' | 'newsletter' | 'tutorial' | 'announcement';

export type ContentStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';

export type Visibility = 'public' | 'unlisted' | 'private';

// =============================================================================
// Twitter/X Types
// =============================================================================

export interface TweetResult {
  id: string;
  text: string;
  createdAt: Date;
  url: string;
}

export interface ThreadResult {
  threadId: string;
  tweets: TweetResult[];
  url: string;
}

export interface TweetAnalytics {
  impressions: number;
  engagements: number;
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  clicks: number;
  profileClicks: number;
}

export interface ScheduledTweet {
  scheduledId: string;
  content: string;
  publishAt: Date;
  status: 'pending' | 'published' | 'cancelled';
}

// =============================================================================
// LinkedIn Types
// =============================================================================

export type LinkedInVisibility = 'PUBLIC' | 'CONNECTIONS';

export interface LinkedInPostResult {
  id: string;
  content: string;
  visibility: LinkedInVisibility;
  createdAt: Date;
  url: string;
}

export interface LinkedInAnalytics {
  impressions: number;
  clicks: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
}

// =============================================================================
// Mastodon Types
// =============================================================================

export type MastodonVisibility = 'public' | 'unlisted' | 'private' | 'direct';

export interface TootResult {
  id: string;
  content: string;
  visibility: MastodonVisibility;
  createdAt: Date;
  url: string;
  repliesCount: number;
  reblogsCount: number;
  favouritesCount: number;
}

export interface MastodonNotification {
  id: string;
  type: 'mention' | 'reblog' | 'favourite' | 'follow' | 'poll' | 'follow_request';
  createdAt: Date;
  accountId: string;
  statusId?: string;
}

// =============================================================================
// Bluesky Types
// =============================================================================

export type BlueskyEmbedType = 'images' | 'external' | 'record';

export interface BlueskyEmbed {
  type: BlueskyEmbedType;
  images?: Array<{ alt: string; image: Buffer | string }>;
  external?: { uri: string; title: string; description: string };
  record?: { uri: string; cid: string };
}

export interface BlueskyPostResult {
  uri: string;
  cid: string;
  text: string;
  createdAt: Date;
  url: string;
}

export interface BlueskyProfile {
  did: string;
  handle: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  followersCount: number;
  followsCount: number;
  postsCount: number;
}

// =============================================================================
// SEO Types
// =============================================================================

export interface KeywordData {
  keyword: string;
  searchVolume: number;
  difficulty: number;
  cpc: number;
  trend: 'rising' | 'stable' | 'declining';
  relatedKeywords: string[];
}

export interface CompetitionAnalysis {
  keyword: string;
  topResults: Array<{
    url: string;
    title: string;
    domainAuthority: number;
    wordCount: number;
    backlinks: number;
  }>;
  averageWordCount: number;
  averageDomainAuthority: number;
  contentGaps: string[];
}

export interface SEOScore {
  overall: number;
  titleScore: number;
  metaDescriptionScore: number;
  headingsScore: number;
  keywordDensityScore: number;
  readabilityScore: number;
  internalLinksScore: number;
  suggestions: string[];
}

// =============================================================================
// Scheduler Types
// =============================================================================

export interface ScheduledContent {
  id: string;
  content: string;
  title?: string;
  type: ContentType;
  platforms: Platform[];
  publishAt: Date;
  status: ContentStatus;
  hashtags?: string[];
  media?: string[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface OptimalTime {
  platform: Platform;
  suggestedTime: Date;
  confidence: number;
  reason: string;
}

export interface CrossPostResult {
  contentId: string;
  results: Array<{
    platform: Platform;
    success: boolean;
    postId?: string;
    url?: string;
    error?: string;
  }>;
  publishedAt: Date;
}

// =============================================================================
// Analytics Types
// =============================================================================

export interface PlatformMetrics {
  platform: Platform;
  impressions: number;
  engagements: number;
  clicks: number;
  followers: number;
  followerGrowth: number;
  postsCount: number;
  topPostId?: string;
  periodStart: Date;
  periodEnd: Date;
}

export interface AggregatedMetrics {
  totalImpressions: number;
  totalEngagements: number;
  engagementRate: number;
  followerGrowth: number;
  revenueGenerated: number;
  byPlatform: Partial<Record<Platform, PlatformMetrics>>;
  periodStart: Date;
  periodEnd: Date;
}

export interface ContentPerformance {
  contentId: string;
  title?: string;
  type: ContentType;
  platforms: Platform[];
  totalImpressions: number;
  totalEngagements: number;
  engagementRate: number;
  revenue: number;
  publishedAt: Date;
  byPlatform: Partial<Record<Platform, { impressions: number; engagements: number; url?: string }>>;
}

export interface ContentInsights {
  bestPerformingContent: ContentPerformance[];
  bestPerformingPlatform: Platform;
  bestPostingTimes: Array<{ dayOfWeek: number; hour: number; avgEngagement: number }>;
  topHashtags: Array<{ hashtag: string; uses: number; avgEngagement: number }>;
  recommendations: string[];
  generatedAt: Date;
}

// =============================================================================
// Orchestrator Types
// =============================================================================

export interface ContentRequest {
  topic: string;
  type: ContentType;
  platforms: Platform[];
  keywords?: string[];
  tone?: 'professional' | 'casual' | 'technical' | 'educational';
  targetLength?: number;
  schedule?: Date;
  crossPost?: boolean;
  seoOptimize?: boolean;
}

export interface ContentDraft {
  id: string;
  title: string;
  content: string;
  excerpt?: string;
  type: ContentType;
  keywords: string[];
  hashtags: string[];
  media?: string[];
  seoScore?: SEOScore;
  createdAt: Date;
}

export interface AdaptedContent {
  platform: Platform;
  content: string;
  title?: string;
  hashtags: string[];
  media?: string[];
  characterCount: number;
  withinLimit: boolean;
}

export interface ContentResult {
  id: string;
  status: ContentStatus;
  draft: ContentDraft;
  adaptedContent: AdaptedContent[];
  publishResults?: Array<{
    platform: Platform;
    success: boolean;
    postId?: string;
    url?: string;
    error?: string;
    publishedAt?: Date;
  }>;
  scheduledFor?: Date;
  createdAt: Date;
}

// =============================================================================
// Revenue Types
// =============================================================================

export interface ContentRevenue {
  contentId: string;
  platform: Platform;
  amount: number;
  currency: string;
  source: 'subscription' | 'tips' | 'sponsorship' | 'ads' | 'nft';
  receivedAt: Date;
}

// =============================================================================
// Rate Limiting Types
// =============================================================================

export interface RateLimitConfig {
  requests: number;
  windowMs: number;
  dailyLimit?: number;
}

export const PLATFORM_RATE_LIMITS: Record<SocialPlatform, RateLimitConfig> = {
  twitter: { requests: 300, windowMs: 3 * 60 * 60 * 1000, dailyLimit: 1500 },
  linkedin: { requests: 100, windowMs: 24 * 60 * 60 * 1000 },
  mastodon: { requests: 300, windowMs: 5 * 60 * 1000 },
  bluesky: { requests: 5000, windowMs: 60 * 60 * 1000, dailyLimit: 35000 },
};

// =============================================================================
// Connector Types
// =============================================================================

export interface ConnectorConfig {
  enabled: boolean;
  credentials: Record<string, string>;
  rateLimits: RateLimitConfig;
}

export interface ConnectorHealth {
  platform: Platform;
  healthy: boolean;
  lastChecked: Date;
  error?: string;
  rateLimitRemaining?: number;
}

export interface BaseConnector {
  readonly platform: Platform;
  isConfigured(): boolean;
  healthCheck(): Promise<ConnectorHealth>;
}

// =============================================================================
// Character Limits
// =============================================================================

export const PLATFORM_CHARACTER_LIMITS: Record<SocialPlatform, number> = {
  twitter: 280,
  linkedin: 3000,
  mastodon: 500,
  bluesky: 300,
};

export const PLATFORM_THREAD_LIMITS: Record<SocialPlatform, number> = {
  twitter: 25,
  linkedin: 1,
  mastodon: 1,
  bluesky: 10,
};

// =============================================================================
// Audience Types
// =============================================================================

export interface AudienceData {
  timezone: string;
  primaryLocations: string[];
  activeHours: number[];
  activeDays: number[];
  demographics?: {
    industries?: string[];
    jobTitles?: string[];
    interests?: string[];
  };
}
