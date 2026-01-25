/**
 * Bounty Hunter — DeWork / Layer3 / Immunefi
 *
 * Autonomously discovers and completes bounties on Web3 platforms.
 * Revenue model: per-bounty payouts (typically $50-$10,000+).
 *
 * Requirements:
 *   - Capital: $0 (zero capital needed)
 *   - Identity: Wallet only (wallet-based identity on all platforms)
 *   - Revenue: $500-$5,000/month depending on bounty availability
 *
 * Bounty types:
 *   - Code bounties: Smart contract development, bug fixes
 *   - Audit bounties: Security analysis (Immunefi, Code4rena)
 *   - Content bounties: Documentation, research reports
 *   - Design bounties: Architecture proposals
 *   - Translation bounties: Multi-language documentation
 *
 * Strategy:
 *   1. Discover open bounties matching Genesis capabilities
 *   2. Evaluate expected value (reward × success probability)
 *   3. Execute bounty work using kernel task system
 *   4. Submit and track payout
 */

import { getEconomicFiber } from '../fiber.js';
import { getDeworkConnector, type Bounty as DeworkBounty } from '../live/connectors/dework.js';
import { getRevenueTracker } from '../live/revenue-tracker.js';

// ============================================================================
// Types
// ============================================================================

export interface Bounty {
  id: string;
  platform: 'dework' | 'layer3' | 'immunefi' | 'code4rena' | 'gitcoin';
  title: string;
  description: string;
  reward: number;              // $ value
  currency: 'USDC' | 'ETH' | 'USD' | 'token';
  difficulty: 'easy' | 'medium' | 'hard' | 'critical';
  category: 'code' | 'audit' | 'content' | 'design' | 'translation' | 'research';
  deadline?: number;           // Timestamp
  submissionUrl?: string;
  protocol?: string;           // Associated protocol
  tags: string[];
  discovered: number;          // When we found it
  status: 'open' | 'claimed' | 'submitted' | 'completed' | 'rejected' | 'expired';
}

export interface BountySubmission {
  bountyId: string;
  submittedAt: number;
  deliverable: string;         // Description of work done
  txHash?: string;             // On-chain submission
  status: 'pending' | 'accepted' | 'rejected';
  payout?: number;
  feedback?: string;
}

export interface BountyHunterStats {
  bountiesDiscovered: number;
  bountiesClaimed: number;
  bountiesSubmitted: number;
  bountiesAccepted: number;
  bountiesRejected: number;
  totalEarned: number;
  averageReward: number;
  successRate: number;
  bestBounty: number;
  activeBounties: number;
}

export interface BountyHunterConfig {
  platforms: string[];
  categories: string[];
  minReward: number;            // Minimum $ reward to consider
  maxDifficulty: string;        // Maximum difficulty to attempt
  maxConcurrentBounties: number;
  successProbabilityThreshold: number; // Min probability to attempt (0-1)
  scanIntervalMs: number;       // How often to scan for new bounties
}

// ============================================================================
// Bounty Hunter
// ============================================================================

export class BountyHunter {
  private config: BountyHunterConfig;
  private bounties: Map<string, Bounty> = new Map();
  private submissions: BountySubmission[] = [];
  private readonly fiberId = 'bounty-hunter';
  private lastScan: number = 0;

  constructor(config?: Partial<BountyHunterConfig>) {
    this.config = {
      platforms: config?.platforms ?? ['dework', 'layer3', 'immunefi'],
      categories: config?.categories ?? ['code', 'audit', 'content', 'research'],
      minReward: config?.minReward ?? 50,
      maxDifficulty: config?.maxDifficulty ?? 'hard',
      maxConcurrentBounties: config?.maxConcurrentBounties ?? 3,
      successProbabilityThreshold: config?.successProbabilityThreshold ?? 0.3,
      scanIntervalMs: config?.scanIntervalMs ?? 1800000, // 30 min
    };

    getEconomicFiber().registerModule(this.fiberId);
  }

  /**
   * Scan platforms for new bounties matching our capabilities.
   */
  async scan(): Promise<Bounty[]> {
    const discovered: Bounty[] = [];

    for (const platform of this.config.platforms) {
      try {
        const bounties = await this.scanPlatform(platform);
        for (const b of bounties) {
          if (!this.bounties.has(b.id) && this.isViable(b)) {
            this.bounties.set(b.id, b);
            discovered.push(b);
          }
        }
      } catch (error) {
        console.warn(`[BountyHunter] Scan failed for ${platform}:`, error);
      }
    }

    this.lastScan = Date.now();
    return discovered;
  }

  /**
   * Select the best bounty to work on next.
   * Uses expected value: reward × successProbability
   */
  selectBest(): Bounty | null {
    const activeClaimed = [...this.bounties.values()]
      .filter(b => b.status === 'claimed').length;

    if (activeClaimed >= this.config.maxConcurrentBounties) {
      return null;
    }

    const candidates = [...this.bounties.values()]
      .filter(b => b.status === 'open' && this.isViable(b))
      .map(b => ({
        bounty: b,
        expectedValue: b.reward * this.estimateSuccessProbability(b),
      }))
      .filter(c => c.expectedValue > this.config.minReward * this.config.successProbabilityThreshold)
      .sort((a, b) => b.expectedValue - a.expectedValue);

    return candidates[0]?.bounty ?? null;
  }

  /**
   * Claim a bounty (mark as in-progress).
   * Note: DeWork doesn't require formal claiming - we track it locally.
   */
  async claim(bountyId: string): Promise<boolean> {
    const bounty = this.bounties.get(bountyId);
    if (!bounty || bounty.status !== 'open') return false;

    // For DeWork, claiming is just local tracking
    // The actual work happens outside this system
    bounty.status = 'claimed';
    console.log(`[BountyHunter] Claimed bounty: ${bounty.title} ($${bounty.reward})`);
    console.log(`[BountyHunter] URL: ${bounty.submissionUrl}`);
    return true;
  }

  /**
   * Submit bounty deliverable.
   * Note: Actual submission to DeWork is done manually on the platform.
   * This tracks the submission for payout monitoring.
   */
  async submit(bountyId: string, deliverable: string): Promise<BountySubmission | null> {
    const bounty = this.bounties.get(bountyId);
    if (!bounty || bounty.status !== 'claimed') return null;

    const fiber = getEconomicFiber();

    const submission: BountySubmission = {
      bountyId,
      submittedAt: Date.now(),
      deliverable,
      status: 'pending',
    };

    bounty.status = 'submitted';
    this.submissions.push(submission);

    // Record minimal cost (LLM usage for bounty work)
    fiber.recordCost(this.fiberId, 0.10, `submit:${bounty.category}`);

    console.log(`[BountyHunter] Submission tracked: ${bounty.title}`);
    console.log(`[BountyHunter] Submit at: ${bounty.submissionUrl}`);
    console.log(`[BountyHunter] Deliverable: ${deliverable.slice(0, 100)}...`);

    return submission;
  }

  /**
   * Check status of submitted bounties and record payouts.
   */
  async checkPayouts(): Promise<BountySubmission[]> {
    const fiber = getEconomicFiber();
    const updated: BountySubmission[] = [];

    const pending = this.submissions.filter(s => s.status === 'pending');
    for (const sub of pending) {
      try {
        const bounty = this.bounties.get(sub.bountyId);
        if (!bounty) continue;

        // Extract actual bounty ID from our prefixed ID
        const [platform, actualId] = sub.bountyId.split(':');

        if (platform === 'dework') {
          const connector = getDeworkConnector();
          const payoutStatus = await connector.getPayoutStatus(actualId);

          if (payoutStatus.paid) {
            sub.status = 'accepted';
            sub.payout = bounty.reward;
            sub.txHash = payoutStatus.txHash;

            // Record revenue
            fiber.recordRevenue(this.fiberId, sub.payout, `bounty:${sub.bountyId}`);

            // Also record in revenue tracker for persistence
            const revenueTracker = getRevenueTracker();
            // Map bounty currency to tracker-supported currencies
            const trackerCurrency = bounty.currency === 'token' ? 'USD' : bounty.currency;
            revenueTracker.record({
              source: 'bounty',
              amount: sub.payout,
              currency: trackerCurrency as 'ETH' | 'USDC' | 'USD',
              activityId: 'bounty-hunter',
              metadata: {
                bountyId: sub.bountyId,
                platform: 'dework',
                txHash: payoutStatus.txHash,
              },
            });

            bounty.status = 'completed';
            updated.push(sub);

            console.log(`[BountyHunter] Payout received: $${sub.payout} for ${bounty.title}`);
          }
        }
      } catch (error) {
        console.warn(`[BountyHunter] Payout check failed for ${sub.bountyId}:`, error);
        // Will retry next cycle
      }
    }

    return updated;
  }

  /**
   * Get current statistics.
   */
  getStats(): BountyHunterStats {
    const accepted = this.submissions.filter(s => s.status === 'accepted');
    const rejected = this.submissions.filter(s => s.status === 'rejected');
    const totalSubmitted = accepted.length + rejected.length;

    return {
      bountiesDiscovered: this.bounties.size,
      bountiesClaimed: [...this.bounties.values()].filter(b => b.status === 'claimed').length,
      bountiesSubmitted: this.submissions.length,
      bountiesAccepted: accepted.length,
      bountiesRejected: rejected.length,
      totalEarned: accepted.reduce((s, a) => s + (a.payout ?? 0), 0),
      averageReward: accepted.length > 0
        ? accepted.reduce((s, a) => s + (a.payout ?? 0), 0) / accepted.length
        : 0,
      successRate: totalSubmitted > 0 ? accepted.length / totalSubmitted : 0,
      bestBounty: Math.max(0, ...accepted.map(a => a.payout ?? 0)),
      activeBounties: [...this.bounties.values()].filter(b =>
        b.status === 'claimed' || b.status === 'submitted'
      ).length,
    };
  }

  /**
   * Check if scan is due.
   */
  needsScan(): boolean {
    return Date.now() - this.lastScan > this.config.scanIntervalMs;
  }

  /**
   * Get ROI for this activity.
   */
  getROI(): number {
    const fiber = getEconomicFiber().getFiber(this.fiberId);
    return fiber?.roi ?? 0;
  }

  // ============================================================================
  // Private
  // ============================================================================

  private isViable(bounty: Bounty): boolean {
    const difficultyOrder = ['easy', 'medium', 'hard', 'critical'];
    const maxIdx = difficultyOrder.indexOf(this.config.maxDifficulty);
    const bountyIdx = difficultyOrder.indexOf(bounty.difficulty);

    return (
      bounty.reward >= this.config.minReward &&
      bountyIdx <= maxIdx &&
      this.config.categories.includes(bounty.category) &&
      (!bounty.deadline || bounty.deadline > Date.now())
    );
  }

  private estimateSuccessProbability(bounty: Bounty): number {
    // Heuristic based on category and difficulty
    const categoryProb: Record<string, number> = {
      content: 0.8,
      research: 0.7,
      code: 0.5,
      audit: 0.4,
      design: 0.3,
      translation: 0.9,
    };

    const difficultyMult: Record<string, number> = {
      easy: 1.0,
      medium: 0.7,
      hard: 0.4,
      critical: 0.2,
    };

    const base = categoryProb[bounty.category] ?? 0.5;
    const mult = difficultyMult[bounty.difficulty] ?? 0.5;

    return base * mult;
  }

  private async scanPlatform(platform: string): Promise<Bounty[]> {
    try {
      // Use real DeWork connector for dework platform
      if (platform === 'dework') {
        const connector = getDeworkConnector();
        const tags = this.config.categories.map(c => {
          // Map our categories to DeWork tags
          const tagMap: Record<string, string[]> = {
            code: ['solidity', 'typescript', 'smart-contract', 'rust'],
            audit: ['security', 'audit', 'bug-bounty'],
            content: ['documentation', 'writing', 'content'],
            research: ['research', 'analysis', 'report'],
          };
          return tagMap[c] || [c];
        }).flat();

        const deworkBounties = await connector.scanBounties(tags);

        return deworkBounties
          .filter(b => b.reward >= this.config.minReward)
          .map((b: DeworkBounty) => ({
            id: `dework:${b.id}`,
            platform: 'dework' as const,
            title: b.title,
            description: b.description || '',
            reward: b.reward,
            currency: this.mapCurrency(b.currency),
            difficulty: this.inferDifficulty(b.reward),
            category: this.inferCategory(b.tags),
            deadline: b.deadline ? new Date(b.deadline).getTime() : undefined,
            submissionUrl: b.url,
            protocol: undefined,
            tags: b.tags,
            discovered: Date.now(),
            status: 'open' as const,
          }));
      }

      // For other platforms (layer3, immunefi), return empty for now
      // Can add more connectors later
      console.log(`[BountyHunter] Platform ${platform} not yet connected to real API`);
      return [];
    } catch (error) {
      console.warn(`[BountyHunter] Scan failed for ${platform}:`, error);
      return [];
    }
  }

  private inferDifficulty(reward: number): 'easy' | 'medium' | 'hard' | 'critical' {
    if (reward < 100) return 'easy';
    if (reward < 500) return 'medium';
    if (reward < 2000) return 'hard';
    return 'critical';
  }

  private inferCategory(tags: string[]): 'code' | 'audit' | 'content' | 'design' | 'translation' | 'research' {
    const tagStr = tags.join(' ').toLowerCase();
    if (tagStr.includes('audit') || tagStr.includes('security')) return 'audit';
    if (tagStr.includes('doc') || tagStr.includes('content') || tagStr.includes('writing')) return 'content';
    if (tagStr.includes('research') || tagStr.includes('analysis')) return 'research';
    if (tagStr.includes('design') || tagStr.includes('ui') || tagStr.includes('ux')) return 'design';
    if (tagStr.includes('translation') || tagStr.includes('localization')) return 'translation';
    return 'code';
  }

  private mapCurrency(currency: string | undefined): 'USDC' | 'ETH' | 'USD' | 'token' {
    const c = (currency || 'USD').toUpperCase();
    if (c === 'USDC') return 'USDC';
    if (c === 'ETH') return 'ETH';
    if (c === 'USD') return 'USD';
    return 'token';
  }
}

// ============================================================================
// Singleton
// ============================================================================

let hunterInstance: BountyHunter | null = null;

export function getBountyHunter(config?: Partial<BountyHunterConfig>): BountyHunter {
  if (!hunterInstance) {
    hunterInstance = new BountyHunter(config);
  }
  return hunterInstance;
}

export function resetBountyHunter(): void {
  hunterInstance = null;
}
