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

import { getMCPClient } from '../../mcp/index.js';
import { getEconomicFiber } from '../fiber.js';
import type { MCPServerName } from '../../types.js';

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
   */
  async claim(bountyId: string): Promise<boolean> {
    const bounty = this.bounties.get(bountyId);
    if (!bounty || bounty.status !== 'open') return false;

    try {
      const client = getMCPClient();
      const result = await client.call('coinbase' as MCPServerName, 'claim_bounty', {
        platform: bounty.platform,
        bountyId: bounty.id,
      });

      if (result.success) {
        bounty.status = 'claimed';
        return true;
      }
    } catch (error) {
      console.warn(`[BountyHunter] Claim failed for ${bountyId}:`, error);
    }
    return false;
  }

  /**
   * Submit bounty deliverable.
   */
  async submit(bountyId: string, deliverable: string): Promise<BountySubmission | null> {
    const bounty = this.bounties.get(bountyId);
    if (!bounty || bounty.status !== 'claimed') return null;

    const fiber = getEconomicFiber();

    try {
      const client = getMCPClient();
      const result = await client.call('coinbase' as MCPServerName, 'submit_bounty', {
        platform: bounty.platform,
        bountyId: bounty.id,
        deliverable,
      });

      const submission: BountySubmission = {
        bountyId,
        submittedAt: Date.now(),
        deliverable,
        txHash: result.data?.txHash,
        status: 'pending',
      };

      bounty.status = 'submitted';
      this.submissions.push(submission);

      // Record minimal cost (LLM usage for bounty work)
      fiber.recordCost(this.fiberId, 0.10, `submit:${bounty.category}`);

      return submission;
    } catch (error) {
      console.warn(`[BountyHunter] Submit failed for ${bountyId}:`, error);
      return null;
    }
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
        const client = getMCPClient();
        const result = await client.call('coinbase' as MCPServerName, 'check_bounty_status', {
          bountyId: sub.bountyId,
        });

        if (result.data?.status === 'accepted') {
          sub.status = 'accepted';
          sub.payout = result.data.payout ?? this.bounties.get(sub.bountyId)?.reward ?? 0;
          fiber.recordRevenue(this.fiberId, sub.payout ?? 0, `bounty:${sub.bountyId}`);

          const bounty = this.bounties.get(sub.bountyId);
          if (bounty) bounty.status = 'completed';

          updated.push(sub);
        } else if (result.data?.status === 'rejected') {
          sub.status = 'rejected';
          sub.feedback = result.data.feedback;

          const bounty = this.bounties.get(sub.bountyId);
          if (bounty) bounty.status = 'rejected';

          updated.push(sub);
        }
      } catch {
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
      const client = getMCPClient();
      const result = await client.call('coinbase' as MCPServerName, 'scan_bounties', {
        platform,
        categories: this.config.categories,
        minReward: this.config.minReward,
      });

      if (result.success && Array.isArray(result.data?.bounties)) {
        return result.data.bounties.map((b: Record<string, unknown>) => ({
          id: `${platform}:${b.id}`,
          platform,
          title: b.title || 'Untitled',
          description: b.description || '',
          reward: Number(b.reward) || 0,
          currency: b.currency || 'USDC',
          difficulty: b.difficulty || 'medium',
          category: b.category || 'code',
          deadline: b.deadline ? Number(b.deadline) : undefined,
          submissionUrl: b.url as string | undefined,
          protocol: b.protocol as string | undefined,
          tags: Array.isArray(b.tags) ? b.tags : [],
          discovered: Date.now(),
          status: 'open' as const,
        }));
      }
    } catch {
      // Platform unavailable
    }
    return [];
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
