/**
 * Content Revenue Handler
 *
 * The MISSING piece for content monetization.
 * Tracks and records revenue from:
 * - Sponsors (direct payments for content)
 * - Affiliates (commission on referred sales)
 * - Ads (programmatic ad revenue)
 * - Subscriptions (Patreon, Substack, etc.)
 *
 * @module content/monetization/revenue-handler
 * @version 19.1.0
 */

import { getEventBus } from '../../bus/index.js';

// ============================================================================
// Types
// ============================================================================

export type ContentRevenueSource = 'sponsor' | 'affiliate' | 'ad' | 'subscription' | 'tip';

export interface ContentRevenueRecord {
  id: string;
  contentId: string;
  platform: string;
  source: ContentRevenueSource;
  amount: number;
  currency: 'USD' | 'USDC' | 'ETH';
  partnerName?: string;
  affiliateCode?: string;
  adNetwork?: string;
  recordedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface AffiliateLink {
  id: string;
  contentId: string;
  platform: string;
  product: string;
  affiliateUrl: string;
  originalUrl: string;
  network: 'amazon' | 'awin' | 'cj' | 'impact' | 'custom';
  commissionRate: number;
  clicks: number;
  conversions: number;
  revenue: number;
  createdAt: Date;
}

export interface SponsorDeal {
  id: string;
  sponsorName: string;
  sponsorEmail: string;
  contentType: 'post' | 'thread' | 'article' | 'video' | 'newsletter';
  platforms: string[];
  amount: number;
  currency: 'USD' | 'USDC';
  status: 'negotiating' | 'agreed' | 'content_created' | 'published' | 'paid' | 'cancelled';
  requirements: string[];
  deadline?: Date;
  createdAt: Date;
  paidAt?: Date;
}

// ============================================================================
// Revenue Tracking State
// ============================================================================

const revenueRecords: ContentRevenueRecord[] = [];
const affiliateLinks = new Map<string, AffiliateLink>();
const sponsorDeals = new Map<string, SponsorDeal>();

let totalRevenue = 0;
let revenueBySource: Record<ContentRevenueSource, number> = {
  sponsor: 0,
  affiliate: 0,
  ad: 0,
  subscription: 0,
  tip: 0,
};

// ============================================================================
// Affiliate Link Management
// ============================================================================

export function createAffiliateLink(options: {
  contentId: string;
  platform: string;
  product: string;
  originalUrl: string;
  network: AffiliateLink['network'];
  affiliateCode: string;
  commissionRate: number;
}): AffiliateLink {
  const id = `aff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Generate affiliate URL based on network
  let affiliateUrl = options.originalUrl;
  switch (options.network) {
    case 'amazon':
      affiliateUrl = `${options.originalUrl}${options.originalUrl.includes('?') ? '&' : '?'}tag=${options.affiliateCode}`;
      break;
    case 'awin':
      affiliateUrl = `https://www.awin1.com/cread.php?awinmid=${options.affiliateCode}&awinaffid=YOUR_ID&clickref=${id}&p=${encodeURIComponent(options.originalUrl)}`;
      break;
    case 'cj':
      affiliateUrl = `https://www.jdoqocy.com/click-${options.affiliateCode}?url=${encodeURIComponent(options.originalUrl)}`;
      break;
    default:
      affiliateUrl = `${options.originalUrl}${options.originalUrl.includes('?') ? '&' : '?'}ref=${options.affiliateCode}`;
  }

  const link: AffiliateLink = {
    id,
    contentId: options.contentId,
    platform: options.platform,
    product: options.product,
    affiliateUrl,
    originalUrl: options.originalUrl,
    network: options.network,
    commissionRate: options.commissionRate,
    clicks: 0,
    conversions: 0,
    revenue: 0,
    createdAt: new Date(),
  };

  affiliateLinks.set(id, link);
  return link;
}

export function recordAffiliateClick(linkId: string): void {
  const link = affiliateLinks.get(linkId);
  if (link) {
    link.clicks++;
  }
}

export function recordAffiliateConversion(linkId: string, saleAmount: number): number {
  const link = affiliateLinks.get(linkId);
  if (!link) return 0;

  link.conversions++;
  const commission = saleAmount * link.commissionRate;
  link.revenue += commission;

  // Record the revenue
  recordContentRevenue({
    contentId: link.contentId,
    platform: link.platform,
    source: 'affiliate',
    amount: commission,
    affiliateCode: linkId,
    metadata: {
      product: link.product,
      network: link.network,
      saleAmount,
    },
  });

  return commission;
}

// ============================================================================
// Sponsor Deal Management
// ============================================================================

export function createSponsorDeal(options: {
  sponsorName: string;
  sponsorEmail: string;
  contentType: SponsorDeal['contentType'];
  platforms: string[];
  amount: number;
  currency?: 'USD' | 'USDC';
  requirements?: string[];
  deadline?: Date;
}): SponsorDeal {
  const id = `sponsor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const deal: SponsorDeal = {
    id,
    sponsorName: options.sponsorName,
    sponsorEmail: options.sponsorEmail,
    contentType: options.contentType,
    platforms: options.platforms,
    amount: options.amount,
    currency: options.currency || 'USD',
    status: 'negotiating',
    requirements: options.requirements || [],
    deadline: options.deadline,
    createdAt: new Date(),
  };

  sponsorDeals.set(id, deal);
  return deal;
}

export function updateSponsorDealStatus(
  dealId: string,
  status: SponsorDeal['status'],
  contentId?: string,
): void {
  const deal = sponsorDeals.get(dealId);
  if (!deal) return;

  deal.status = status;

  if (status === 'paid') {
    deal.paidAt = new Date();

    // Record the revenue
    recordContentRevenue({
      contentId: contentId || dealId,
      platform: deal.platforms[0] || 'unknown',
      source: 'sponsor',
      amount: deal.amount,
      partnerName: deal.sponsorName,
      metadata: {
        dealId,
        contentType: deal.contentType,
        platforms: deal.platforms,
      },
    });
  }
}

// ============================================================================
// Ad Revenue Tracking
// ============================================================================

export function recordAdRevenue(options: {
  contentId: string;
  platform: string;
  adNetwork: string;
  impressions: number;
  clicks: number;
  cpm: number; // Cost per 1000 impressions
  cpc?: number; // Cost per click (optional)
}): number {
  const impressionRevenue = (options.impressions / 1000) * options.cpm;
  const clickRevenue = options.cpc ? options.clicks * options.cpc : 0;
  const totalAmount = impressionRevenue + clickRevenue;

  recordContentRevenue({
    contentId: options.contentId,
    platform: options.platform,
    source: 'ad',
    amount: totalAmount,
    adNetwork: options.adNetwork,
    metadata: {
      impressions: options.impressions,
      clicks: options.clicks,
      cpm: options.cpm,
      cpc: options.cpc,
    },
  });

  return totalAmount;
}

// ============================================================================
// Subscription Revenue
// ============================================================================

export function recordSubscriptionRevenue(options: {
  contentId?: string;
  platform: string;
  subscriberCount: number;
  pricePerSubscriber: number;
  period: 'monthly' | 'annual';
}): number {
  const amount = options.subscriberCount * options.pricePerSubscriber;

  recordContentRevenue({
    contentId: options.contentId || `sub-${options.platform}`,
    platform: options.platform,
    source: 'subscription',
    amount,
    metadata: {
      subscriberCount: options.subscriberCount,
      pricePerSubscriber: options.pricePerSubscriber,
      period: options.period,
    },
  });

  return amount;
}

// ============================================================================
// Core Revenue Recording
// ============================================================================

export function recordContentRevenue(options: {
  contentId: string;
  platform: string;
  source: ContentRevenueSource;
  amount: number;
  currency?: 'USD' | 'USDC' | 'ETH';
  partnerName?: string;
  affiliateCode?: string;
  adNetwork?: string;
  metadata?: Record<string, unknown>;
}): ContentRevenueRecord {
  const id = `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const record: ContentRevenueRecord = {
    id,
    contentId: options.contentId,
    platform: options.platform,
    source: options.source,
    amount: options.amount,
    currency: options.currency || 'USD',
    partnerName: options.partnerName,
    affiliateCode: options.affiliateCode,
    adNetwork: options.adNetwork,
    recordedAt: new Date(),
    metadata: options.metadata,
  };

  revenueRecords.push(record);
  totalRevenue += options.amount;
  revenueBySource[options.source] += options.amount;

  // Emit event to bus
  const bus = getEventBus();
  bus.publish('content.revenue', {
    source: 'content-monetization',
    precision: 1.0,
    contentId: options.contentId,
    platform: options.platform,
    amount: options.amount,
    currency: options.currency || 'USD',
    revenueSource: options.source,
  } as any);

  console.log(`[ContentRevenue] Recorded $${options.amount.toFixed(2)} from ${options.source} on ${options.platform}`);

  return record;
}

// ============================================================================
// Queries
// ============================================================================

export function getRevenueStats(): {
  totalRevenue: number;
  bySource: Record<ContentRevenueSource, number>;
  recordCount: number;
  topContent: Array<{ contentId: string; revenue: number }>;
} {
  // Calculate top content
  const byContent = new Map<string, number>();
  for (const record of revenueRecords) {
    byContent.set(record.contentId, (byContent.get(record.contentId) || 0) + record.amount);
  }

  const topContent = Array.from(byContent.entries())
    .map(([contentId, revenue]) => ({ contentId, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return {
    totalRevenue,
    bySource: { ...revenueBySource },
    recordCount: revenueRecords.length,
    topContent,
  };
}

export function getRevenueByContent(contentId: string): ContentRevenueRecord[] {
  return revenueRecords.filter(r => r.contentId === contentId);
}

export function getRevenueByPlatform(platform: string): ContentRevenueRecord[] {
  return revenueRecords.filter(r => r.platform === platform);
}

export function getRevenueByDateRange(start: Date, end: Date): ContentRevenueRecord[] {
  return revenueRecords.filter(r => r.recordedAt >= start && r.recordedAt <= end);
}

export function getActiveAffiliateLinks(): AffiliateLink[] {
  return Array.from(affiliateLinks.values());
}

export function getActiveSponsorDeals(): SponsorDeal[] {
  return Array.from(sponsorDeals.values()).filter(d => d.status !== 'cancelled' && d.status !== 'paid');
}

export function getAllSponsorDeals(): SponsorDeal[] {
  return Array.from(sponsorDeals.values());
}
