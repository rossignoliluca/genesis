/**
 * Market Discovery and Filtering
 *
 * Finds relevant prediction markets based on Genesis's interests,
 * expertise, and current beliefs. Uses semantic filtering and
 * liquidity/volume criteria.
 */

import type { PolymarketClient } from './client.js';
import type {
  PolymarketMarket,
  MarketFilter,
  MarketDiscoveredEvent,
} from './types.js';

// ============================================================================
// Market Scorer
// ============================================================================

/**
 * Score a market based on relevance to Genesis's capabilities and interests
 */
export class MarketScorer {
  // Categories we're knowledgeable about
  private readonly expertiseCategories = [
    'technology',
    'ai',
    'crypto',
    'software',
    'science',
  ];

  // Keywords that indicate markets within our domain
  private readonly relevantKeywords = [
    'ai', 'agi', 'artificial intelligence', 'machine learning',
    'bitcoin', 'ethereum', 'crypto', 'blockchain',
    'technology', 'software', 'github', 'openai', 'anthropic',
    'science', 'physics', 'climate', 'space',
  ];

  /**
   * Score a market from 0-1 based on relevance
   */
  score(market: PolymarketMarket): number {
    let score = 0;

    // Category match
    if (this.expertiseCategories.includes(market.category)) {
      score += 0.4;
    }

    // Keyword match in question
    const questionLower = market.question.toLowerCase();
    const descriptionLower = market.description.toLowerCase();
    const keywordMatches = this.relevantKeywords.filter(kw =>
      questionLower.includes(kw) || descriptionLower.includes(kw)
    );
    score += Math.min(0.3, keywordMatches.length * 0.1);

    // Liquidity (higher is better for trading)
    const liquidityScore = Math.min(0.2, market.liquidity / 500000);
    score += liquidityScore;

    // Volume (indicates market interest)
    const volumeScore = Math.min(0.1, market.volume / 2000000);
    score += volumeScore;

    return Math.min(1, score);
  }

  /**
   * Determine if a market is worth tracking
   */
  isRelevant(market: PolymarketMarket, minScore = 0.5): boolean {
    return this.score(market) >= minScore;
  }
}

// ============================================================================
// Market Discovery
// ============================================================================

export class MarketDiscovery {
  private client: PolymarketClient;
  private scorer: MarketScorer;
  private trackedMarkets: Map<string, PolymarketMarket> = new Map();

  constructor(client: PolymarketClient) {
    this.client = client;
    this.scorer = new MarketScorer();
  }

  /**
   * Discover new markets matching our criteria
   */
  async discoverMarkets(options?: {
    filter?: MarketFilter;
    minRelevanceScore?: number;
  }): Promise<MarketDiscoveredEvent[]> {
    const minScore = options?.minRelevanceScore ?? 0.5;

    // Fetch markets from API
    const markets = await this.client.getMarkets({
      activeOnly: true,
      minLiquidity: 50000,  // Need sufficient liquidity to trade
      ...options?.filter,
    });

    // Score and filter
    const discoveries: MarketDiscoveredEvent[] = [];

    for (const market of markets) {
      const relevance = this.scorer.score(market);

      if (relevance >= minScore) {
        // Track this market
        this.trackedMarkets.set(market.id, market);

        discoveries.push({
          market,
          relevance,
          source: 'polymarket-discovery',
        });
      }
    }

    // Sort by relevance
    discoveries.sort((a, b) => b.relevance - a.relevance);

    return discoveries;
  }

  /**
   * Search markets by keywords
   */
  async searchMarkets(keywords: string[]): Promise<MarketDiscoveredEvent[]> {
    return this.discoverMarkets({
      filter: { keywords },
      minRelevanceScore: 0.3, // Lower threshold for explicit searches
    });
  }

  /**
   * Get markets by category
   */
  async getMarketsByCategory(
    categories: string[]
  ): Promise<MarketDiscoveredEvent[]> {
    return this.discoverMarkets({
      filter: { categories },
      minRelevanceScore: 0.4,
    });
  }

  /**
   * Get all tracked markets
   */
  getTrackedMarkets(): PolymarketMarket[] {
    return Array.from(this.trackedMarkets.values());
  }

  /**
   * Check if a market is tracked
   */
  isTracked(marketId: string): boolean {
    return this.trackedMarkets.has(marketId);
  }

  /**
   * Remove a market from tracking
   */
  untrack(marketId: string): void {
    this.trackedMarkets.delete(marketId);
  }

  /**
   * Get top N markets by relevance
   */
  async getTopMarkets(limit = 10): Promise<PolymarketMarket[]> {
    const discoveries = await this.discoverMarkets();
    return discoveries.slice(0, limit).map(d => d.market);
  }
}

// ============================================================================
// Market Monitor
// ============================================================================

/**
 * Monitor markets for significant price movements and opportunities
 */
export class MarketMonitor {
  private client: PolymarketClient;
  private priceHistory: Map<string, number[]> = new Map();
  private monitorInterval: ReturnType<typeof setInterval> | null = null;

  constructor(client: PolymarketClient) {
    this.client = client;
  }

  /**
   * Start monitoring markets
   */
  start(markets: PolymarketMarket[], intervalMs = 10000): void {
    if (this.monitorInterval) return;

    this.monitorInterval = setInterval(async () => {
      await this.updatePrices(markets);
    }, intervalMs);

    // Initial update
    this.updatePrices(markets);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  /**
   * Update prices for all monitored markets
   */
  private async updatePrices(markets: PolymarketMarket[]): Promise<void> {
    for (const market of markets) {
      for (const outcome of market.outcomes) {
        const key = `${market.id}:${outcome}`;
        const price = await this.client.getPrice(market.id, outcome);

        // Store price history
        const history = this.priceHistory.get(key) ?? [];
        history.push(price.price);

        // Keep last 100 prices
        if (history.length > 100) {
          history.shift();
        }

        this.priceHistory.set(key, history);
      }
    }
  }

  /**
   * Get price volatility for a market outcome
   */
  getVolatility(marketId: string, outcome: string): number {
    const key = `${marketId}:${outcome}`;
    const history = this.priceHistory.get(key);

    if (!history || history.length < 2) return 0;

    // Calculate standard deviation of returns
    const returns: number[] = [];
    for (let i = 1; i < history.length; i++) {
      const ret = (history[i] - history[i - 1]) / history[i - 1];
      returns.push(ret);
    }

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

    return Math.sqrt(variance);
  }

  /**
   * Get price trend (positive = upward, negative = downward)
   */
  getTrend(marketId: string, outcome: string, windowSize = 10): number {
    const key = `${marketId}:${outcome}`;
    const history = this.priceHistory.get(key);

    if (!history || history.length < windowSize) return 0;

    const recent = history.slice(-windowSize);
    const older = history.slice(-windowSize * 2, -windowSize);

    if (older.length === 0) return 0;

    const recentAvg = recent.reduce((sum, p) => sum + p, 0) / recent.length;
    const olderAvg = older.reduce((sum, p) => sum + p, 0) / older.length;

    return recentAvg - olderAvg;
  }

  /**
   * Get momentum (rate of price change)
   */
  getMomentum(marketId: string, outcome: string): number {
    const key = `${marketId}:${outcome}`;
    const history = this.priceHistory.get(key);

    if (!history || history.length < 2) return 0;

    // Simple momentum: current price - price N periods ago
    const current = history[history.length - 1];
    const past = history[Math.max(0, history.length - 10)];

    return current - past;
  }

  /**
   * Detect if a market has significant movement
   */
  hasSignificantMovement(
    marketId: string,
    outcome: string,
    threshold = 0.05
  ): boolean {
    const trend = Math.abs(this.getTrend(marketId, outcome));
    return trend > threshold;
  }
}
