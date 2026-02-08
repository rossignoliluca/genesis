/**
 * Content Monetization Module
 *
 * Handles all content revenue streams:
 * - Sponsors
 * - Affiliates
 * - Ads
 * - Subscriptions
 *
 * @module content/monetization
 * @version 19.1.0
 */

export {
  // Revenue recording
  recordContentRevenue,
  recordAdRevenue,
  recordSubscriptionRevenue,

  // Affiliate management
  createAffiliateLink,
  recordAffiliateClick,
  recordAffiliateConversion,
  getActiveAffiliateLinks,

  // Sponsor deals
  createSponsorDeal,
  updateSponsorDealStatus,
  getActiveSponsorDeals,
  getAllSponsorDeals,

  // Queries
  getRevenueStats,
  getRevenueByContent,
  getRevenueByPlatform,
  getRevenueByDateRange,

  // Types
  type ContentRevenueSource,
  type ContentRevenueRecord,
  type AffiliateLink,
  type SponsorDeal,
} from './revenue-handler.js';
