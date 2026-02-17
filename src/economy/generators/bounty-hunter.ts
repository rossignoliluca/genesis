/**
 * Bounty Hunter — Multi-Platform Autonomous Bounty Discovery
 *
 * v14.5.0: Added Algora, Gitcoin, GitHub bounty sources
 *
 * Autonomously discovers and completes bounties on multiple platforms:
 * - DeWork: Web3 DAO bounties (GraphQL API)
 * - Algora: GitHub-native bounties (REST API) - BEST FOR AI
 * - Gitcoin: OSS grants and bounties (REST API)
 * - GitHub: Issues with bounty labels (Search API)
 *
 * Revenue model: per-bounty payouts (typically $50-$10,000+).
 *
 * Requirements:
 *   - Capital: $0 (zero capital needed)
 *   - Identity: Wallet/GitHub account
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
 *   5. Feed results back to RSI for skill improvement
 */

import { getEconomicFiber } from '../fiber.js';
import { getDeworkConnector, type Bounty as DeworkBounty } from '../live/connectors/dework.js';
import { getAlgoraConnector, type AlgoraBounty } from '../live/connectors/algora.js';
import { getGitcoinConnector, type GitcoinBounty } from '../live/connectors/gitcoin.js';
import { getGitHubBountyConnector, type GitHubBounty } from '../live/connectors/github-bounties.js';
import { getRevenueTracker } from '../live/revenue-tracker.js';
import { getBountyRSIFeedback } from '../rsi-feedback.js';

// ============================================================================
// Types
// ============================================================================

export interface Bounty {
  id: string;
  platform: 'dework' | 'algora' | 'gitcoin' | 'github' | 'layer3' | 'immunefi' | 'code4rena';
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
  /** v14.5.0: Source-specific metadata */
  sourceMetadata?: {
    org?: string;
    repo?: string;
    issueNumber?: number;
    githubUrl?: string;
  };
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
      // v16.2.2: Expanded to include more code bounties
      // v16.2: Removed gitcoin from defaults (unreliable API)
      platforms: config?.platforms ?? ['algora', 'github', 'dework'],
      categories: config?.categories ?? ['code', 'audit', 'content', 'research', 'design', 'translation'],
      minReward: config?.minReward ?? 25,  // v16.2.2: Lowered from 50 to capture more bounties
      maxDifficulty: config?.maxDifficulty ?? 'critical', // v16.2.2: Allow critical for high rewards
      maxConcurrentBounties: config?.maxConcurrentBounties ?? 5, // v16.2.2: Increased from 3
      successProbabilityThreshold: config?.successProbabilityThreshold ?? 0.2, // v16.2.2: Lowered to attempt more
      scanIntervalMs: config?.scanIntervalMs ?? 900000, // v16.2.2: 15 min (was 30)
    };

    getEconomicFiber().registerModule(this.fiberId);
  }

  /**
   * Scan platforms for new bounties matching our capabilities.
   */
  async scan(): Promise<Bounty[]> {
    const discovered: Bounty[] = [];
    const platformResults: Record<string, number> = {};

    for (const platform of this.config.platforms) {
      try {
        const bounties = await this.scanPlatform(platform);
        platformResults[platform] = bounties.length;

        let newCount = 0;
        for (const b of bounties) {
          if (!this.bounties.has(b.id) && this.isViable(b)) {
            this.bounties.set(b.id, b);
            discovered.push(b);
            newCount++;
          }
        }

        console.log(`[BountyHunter] ${platform}: ${bounties.length} bounties found, ${newCount} new viable bounties`);
      } catch (error) {
        console.warn(`[BountyHunter] Scan failed for ${platform}:`, error);
        platformResults[platform] = 0;
      }
    }

    // Summary logging
    const totalFound = Object.values(platformResults).reduce((sum, count) => sum + count, 0);
    console.log(`[BountyHunter] Scan complete: ${totalFound} total bounties from ${this.config.platforms.length} platforms`);
    console.log(`[BountyHunter] Platform breakdown:`, platformResults);
    console.log(`[BountyHunter] New viable bounties: ${discovered.length}`);

    this.lastScan = Date.now();
    return discovered;
  }

  /**
   * Select the best bounty to work on next.
   *
   * v16: Learning Mode - until we have 3+ successful completions, prioritize:
   *   1. Easy bounties (high success probability)
   *   2. Content/translation bounties (lower complexity)
   *   3. Smaller rewards (less competition)
   *
   * After learning phase, uses expected value: reward × successProbability
   */
  selectBest(options?: { excludeIds?: Set<string>; prioritizeValue?: boolean }): Bounty | null {
    const activeClaimed = [...this.bounties.values()]
      .filter(b => b.status === 'claimed').length;

    if (activeClaimed >= this.config.maxConcurrentBounties) {
      return null;
    }

    // v16.2.1: Check if in learning mode based on submissions or config
    const stats = this.getStats();
    const isLearningMode = stats.bountiesAccepted < 3 && !options?.prioritizeValue;

    const candidates = [...this.bounties.values()]
      .filter(b => {
        if (b.status !== 'open') return false;
        if (!this.isViable(b)) return false;
        // v16.2.1: Skip excluded IDs (already submitted)
        if (options?.excludeIds?.has(b.id)) return false;
        return true;
      })
      .map(b => {
        const probability = this.estimateSuccessProbability(b);
        const expectedValue = b.reward * probability;

        // v16.2.1: Three modes:
        // 1. prioritizeValue=true: Pure reward (for hunting big bounties)
        // 2. Learning mode: probability-weighted
        // 3. Normal: expected value
        let score: number;
        if (options?.prioritizeValue) {
          // Prioritize high-value bounties directly
          score = b.reward * (probability > 0.3 ? 1 : 0.5);
        } else if (isLearningMode) {
          // Heavy weight on probability for learning
          score = probability * probability * Math.sqrt(b.reward);
        } else {
          // Pure expected value
          score = expectedValue;
        }

        return { bounty: b, expectedValue, probability, score, reward: b.reward };
      })
      .filter(c => c.expectedValue > this.config.minReward * this.config.successProbabilityThreshold)
      .sort((a, b) => b.score - a.score);

    if (options?.prioritizeValue && candidates.length > 0) {
      console.log(`[BountyHunter] Value mode: targeting highest reward bounties`);
      console.log(`[BountyHunter] Top candidates: ${candidates.slice(0, 3).map(c => `$${c.reward}`).join(', ')}`);
    } else if (isLearningMode && candidates.length > 0) {
      console.log(`[BountyHunter] Learning mode: prioritizing achievable bounties (${stats.bountiesAccepted}/3 completed)`);
    }

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
   * v19.2: Get all discovered bounties for intelligent ranking
   */
  getAllBounties(): Bounty[] {
    return [...this.bounties.values()];
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

            // v14.6: Record success in RSI feedback for skill learning
            const rsiFeedback = getBountyRSIFeedback();
            const duration = Math.round((Date.now() - sub.submittedAt) / 60000); // minutes
            rsiFeedback.recordSuccess(
              bounty,
              sub,
              sub.payout,
              0.10, // minimal cost estimate
              duration
            ).catch(err => console.warn('[BountyHunter] RSI feedback error:', err));

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

  /**
   * v14.6: Record a failed bounty attempt for RSI learning.
   * This detects limitations and suggests research topics.
   */
  async recordFailure(bountyId: string, reason: string, cost: number = 0.10): Promise<void> {
    const bounty = this.bounties.get(bountyId);
    if (!bounty) return;

    // Update submission status
    const submission = this.submissions.find(s => s.bountyId === bountyId);
    if (submission) {
      submission.status = 'rejected';
      submission.feedback = reason;
    }

    bounty.status = 'rejected';

    // Record in RSI feedback for limitation detection
    const rsiFeedback = getBountyRSIFeedback();
    const duration = submission
      ? Math.round((Date.now() - submission.submittedAt) / 60000)
      : 60; // default 1 hour

    const limitation = await rsiFeedback.recordFailure(bounty, reason, cost, duration);

    console.log(`[BountyHunter] Failure recorded: ${bounty.title}`);
    console.log(`[BountyHunter] Limitation: ${limitation.type} - ${limitation.description}`);
  }

  /**
   * v14.6: Check if RSI should be triggered based on bounty performance.
   * Returns true if success rate is low or many limitations detected.
   */
  shouldTriggerRSI(): boolean {
    const rsiFeedback = getBountyRSIFeedback();
    return rsiFeedback.shouldTriggerRSI();
  }

  /**
   * v14.6: Get research topics suggested by RSI feedback.
   * Use these for the RSI RESEARCH phase.
   */
  getRSIResearchTopics(): string[] {
    const rsiFeedback = getBountyRSIFeedback();
    return rsiFeedback.getResearchTopicsForRSI();
  }

  /**
   * v14.6: Get RSI feedback statistics.
   */
  getRSIStats(): ReturnType<ReturnType<typeof getBountyRSIFeedback>['getStats']> {
    const rsiFeedback = getBountyRSIFeedback();
    return rsiFeedback.getStats();
  }

  // ============================================================================
  // Private
  // ============================================================================

  private isViable(bounty: Bounty): boolean {
    const difficultyOrder = ['easy', 'medium', 'hard', 'critical'];
    const maxIdx = difficultyOrder.indexOf(this.config.maxDifficulty);
    const bountyIdx = difficultyOrder.indexOf(bounty.difficulty);

    // v16.2.3: Cap rewards at $10k - anything higher is likely a false positive (grant proposals, etc.)
    const maxReasonableReward = 10000;

    return (
      bounty.reward >= this.config.minReward &&
      bounty.reward <= maxReasonableReward &&
      bountyIdx <= maxIdx &&
      this.config.categories.includes(bounty.category) &&
      (!bounty.deadline || bounty.deadline > Date.now())
    );
  }

  private estimateSuccessProbability(bounty: Bounty): number {
    // v14.6: Use RSI feedback for improved probability estimation
    try {
      const rsiFeedback = getBountyRSIFeedback();
      return rsiFeedback.getImprovedSuccessProbability(bounty);
    } catch (err) {
      console.error('[BountyHunter] RSI feedback not available, falling back to heuristics:', err);
    }

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
      // ══════════════════════════════════════════════════════════════════════
      // DEWORK - Web3 DAO bounties
      // ══════════════════════════════════════════════════════════════════════
      if (platform === 'dework') {
        const connector = getDeworkConnector();
        const tags = this.config.categories.map(c => {
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
          .filter(b => this.applyTokenDiscount(b.reward, b.currency) >= this.config.minReward)
          .map((b: DeworkBounty) => ({
            id: `dework:${b.id}`,
            platform: 'dework' as const,
            title: b.title,
            description: b.description || '',
            reward: this.applyTokenDiscount(b.reward, b.currency),
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

      // ══════════════════════════════════════════════════════════════════════
      // ALGORA - GitHub-native bounties (BEST API for AI agents)
      // ══════════════════════════════════════════════════════════════════════
      if (platform === 'algora') {
        const connector = getAlgoraConnector();
        const algoraBounties = await connector.scanBounties();

        return algoraBounties
          .filter(b => (b.reward / 100) >= this.config.minReward) // Algora uses cents
          .map((b: AlgoraBounty) => ({
            id: `algora:${b.id}`,
            platform: 'algora' as const,
            title: b.title,
            description: b.description || '',
            reward: b.reward / 100, // Convert from cents to dollars
            currency: 'USD' as const,
            difficulty: this.inferDifficulty(b.reward / 100),
            category: 'code' as const, // Algora is primarily code bounties
            deadline: b.deadline ? new Date(b.deadline).getTime() : undefined,
            submissionUrl: b.url,
            protocol: b.org,
            tags: b.tags,
            discovered: Date.now(),
            status: 'open' as const,
            sourceMetadata: {
              org: b.org,
              repo: b.repo,
              githubUrl: b.issueUrl,
            },
          }));
      }

      // ══════════════════════════════════════════════════════════════════════
      // GITCOIN - OSS grants and bounties
      // ══════════════════════════════════════════════════════════════════════
      if (platform === 'gitcoin') {
        const connector = getGitcoinConnector();
        const gitcoinBounties = await connector.scanBounties({
          isOpen: true,
          keywords: this.config.categories,
        });

        return gitcoinBounties
          .filter(b => this.applyTokenDiscount(b.reward, b.currency) >= this.config.minReward)
          .map((b: GitcoinBounty) => ({
            id: `gitcoin:${b.id}`,
            platform: 'gitcoin' as const,
            title: b.title,
            description: b.description || '',
            reward: this.applyTokenDiscount(b.reward, b.currency),
            currency: this.mapCurrency(b.currency),
            difficulty: this.mapGitcoinDifficulty(b.experienceLevel),
            category: this.inferCategory(b.tags),
            deadline: b.deadline ? new Date(b.deadline).getTime() : undefined,
            submissionUrl: b.url,
            protocol: b.projectType,
            tags: b.tags,
            discovered: Date.now(),
            status: 'open' as const,
            sourceMetadata: {
              githubUrl: b.githubUrl,
            },
          }));
      }

      // ══════════════════════════════════════════════════════════════════════
      // GITHUB - Issues with bounty labels
      // ══════════════════════════════════════════════════════════════════════
      if (platform === 'github') {
        const connector = getGitHubBountyConnector();
        const githubBounties = await connector.scanBounties();

        return githubBounties
          .filter(b => this.applyTokenDiscount(b.reward, b.currency) >= this.config.minReward && b.status === 'open')
          .map((b: GitHubBounty) => ({
            id: b.id,
            platform: 'github' as const,
            title: b.title,
            description: b.description || '',
            reward: this.applyTokenDiscount(b.reward, b.currency),
            currency: this.mapCurrency(b.currency),
            difficulty: this.inferDifficulty(b.reward),
            category: 'code' as const, // GitHub bounties are typically code
            deadline: undefined,
            submissionUrl: b.url,
            protocol: `${b.owner}/${b.repo}`,
            tags: b.tags,
            discovered: Date.now(),
            status: 'open' as const,
            sourceMetadata: {
              org: b.owner,
              repo: b.repo,
              issueNumber: b.issueNumber,
              githubUrl: b.url,
            },
          }));
      }

      // For other platforms (layer3, immunefi), return empty for now
      console.warn(`[BountyHunter] Platform '${platform}' not yet connected to real API`);
      return [];
    } catch (error) {
      console.error(`[BountyHunter] Scan error for ${platform}:`, error);
      // Re-throw to allow caller to handle
      throw error;
    }
  }

  private mapGitcoinDifficulty(level: string): 'easy' | 'medium' | 'hard' | 'critical' {
    switch (level) {
      case 'beginner': return 'easy';
      case 'intermediate': return 'medium';
      case 'advanced': return 'hard';
      default: return 'medium';
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

  /**
   * v16.2.3: Apply discount for non-USD token currencies.
   * Unknown tokens are valued at 10% of face value since 1:1 USD parity is unlikely.
   */
  private applyTokenDiscount(reward: number, currency: string | undefined): number {
    if (this.mapCurrency(currency) === 'token') {
      return reward * 0.1;
    }
    return reward;
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
