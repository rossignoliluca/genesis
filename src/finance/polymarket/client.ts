/**
 * Polymarket API Client
 *
 * Simulated API client for Polymarket prediction markets.
 * In production, this would connect to Polymarket's actual API.
 * For now, provides realistic mock data for testing the Active Inference strategy.
 */

import type {
  PolymarketMarket,
  MarketPrice,
  Orderbook,
  Trade,
  Position,
  MarketFilter,
  MockMarketConfig,
} from './types.js';

// ============================================================================
// Mock Data Generation
// ============================================================================

const MOCK_MARKETS: PolymarketMarket[] = [
  {
    id: 'btc-100k-2024',
    question: 'Will Bitcoin reach $100,000 by end of 2024?',
    description: 'Resolves YES if Bitcoin (BTC/USD) reaches or exceeds $100,000 on any major exchange before Jan 1, 2025.',
    outcomes: ['YES', 'NO'],
    active: true,
    closed: false,
    endDate: '2024-12-31T23:59:59Z',
    volume: 2500000,
    liquidity: 450000,
    category: 'crypto',
    tags: ['bitcoin', 'crypto', 'finance'],
  },
  {
    id: 'ai-agi-2025',
    question: 'Will AGI be achieved by end of 2025?',
    description: 'Resolves YES if a major AI lab (OpenAI, Anthropic, DeepMind, etc) announces achievement of AGI as defined by their published criteria.',
    outcomes: ['YES', 'NO'],
    active: true,
    closed: false,
    endDate: '2025-12-31T23:59:59Z',
    volume: 1800000,
    liquidity: 320000,
    category: 'technology',
    tags: ['ai', 'agi', 'technology'],
  },
  {
    id: 'space-mars-2026',
    question: 'Will humans land on Mars by 2026?',
    description: 'Resolves YES if a crewed spacecraft successfully lands humans on Mars before Jan 1, 2027.',
    outcomes: ['YES', 'NO'],
    active: true,
    closed: false,
    endDate: '2026-12-31T23:59:59Z',
    volume: 950000,
    liquidity: 180000,
    category: 'space',
    tags: ['space', 'mars', 'spacex'],
  },
  {
    id: 'climate-paris-2024',
    question: 'Will global temperature exceed 1.5°C above pre-industrial in 2024?',
    description: 'Resolves YES if annual average global temperature for 2024 exceeds 1.5°C above 1850-1900 baseline per NOAA.',
    outcomes: ['YES', 'NO'],
    active: true,
    closed: false,
    endDate: '2024-12-31T23:59:59Z',
    volume: 650000,
    liquidity: 120000,
    category: 'climate',
    tags: ['climate', 'environment', 'science'],
  },
];

// ============================================================================
// Polymarket Client
// ============================================================================

export class PolymarketClient {
  private simulationMode: boolean;
  private mockPrices: Map<string, number> = new Map();
  private mockTrades: Trade[] = [];
  private mockPositions: Map<string, Position> = new Map();
  private mockConfig: MockMarketConfig;
  private priceUpdateInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options?: {
    apiKey?: string;
    simulationMode?: boolean;
    mockConfig?: Partial<MockMarketConfig>;
  }) {
    this.simulationMode = options?.simulationMode ?? true;
    this.mockConfig = {
      updateIntervalMs: 5000,
      volatility: 0.02,
      trendStrength: 0.001,
      ...options?.mockConfig,
    };

    this.initializeMockPrices();
  }

  // ==========================================================================
  // Market Discovery
  // ==========================================================================

  /**
   * Fetch all active markets
   */
  async getMarkets(filter?: MarketFilter): Promise<PolymarketMarket[]> {
    await this.simulateLatency();

    let markets = [...MOCK_MARKETS];

    // Apply filters
    if (filter) {
      if (filter.activeOnly !== false) {
        markets = markets.filter(m => m.active && !m.closed);
      }
      if (filter.categories?.length) {
        markets = markets.filter(m => filter.categories!.includes(m.category));
      }
      if (filter.tags?.length) {
        markets = markets.filter(m =>
          filter.tags!.some(tag => m.tags.includes(tag))
        );
      }
      if (filter.minLiquidity) {
        markets = markets.filter(m => m.liquidity >= filter.minLiquidity!);
      }
      if (filter.minVolume) {
        markets = markets.filter(m => m.volume >= filter.minVolume!);
      }
      if (filter.keywords?.length) {
        markets = markets.filter(m =>
          filter.keywords!.some(kw =>
            m.question.toLowerCase().includes(kw.toLowerCase()) ||
            m.description.toLowerCase().includes(kw.toLowerCase())
          )
        );
      }
    }

    return markets;
  }

  /**
   * Get a specific market by ID
   */
  async getMarket(marketId: string): Promise<PolymarketMarket | null> {
    await this.simulateLatency();
    return MOCK_MARKETS.find(m => m.id === marketId) ?? null;
  }

  // ==========================================================================
  // Price Data
  // ==========================================================================

  /**
   * Get current price for a market outcome
   */
  async getPrice(marketId: string, outcome: string): Promise<MarketPrice> {
    await this.simulateLatency();

    const key = `${marketId}:${outcome}`;
    const price = this.mockPrices.get(key) ?? 0.5;

    return {
      marketId,
      outcome,
      price,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get orderbook for a market outcome
   */
  async getOrderbook(marketId: string, outcome: string): Promise<Orderbook> {
    await this.simulateLatency();

    const price = await this.getPrice(marketId, outcome);
    const spread = 0.01;

    // Generate realistic orderbook around current price
    const bids: { price: number; size: number }[] = [];
    const asks: { price: number; size: number }[] = [];

    for (let i = 0; i < 5; i++) {
      bids.push({
        price: price.price - spread - i * 0.005,
        size: Math.random() * 1000 + 100,
      });
      asks.push({
        price: price.price + spread + i * 0.005,
        size: Math.random() * 1000 + 100,
      });
    }

    return {
      marketId,
      outcome,
      bids,
      asks,
      timestamp: new Date().toISOString(),
    };
  }

  // ==========================================================================
  // Trading
  // ==========================================================================

  /**
   * Place a buy order
   */
  async buy(
    marketId: string,
    outcome: string,
    shares: number,
    maxPrice?: number
  ): Promise<Trade> {
    await this.simulateLatency();

    const price = await this.getPrice(marketId, outcome);
    const fillPrice = maxPrice ? Math.min(price.price, maxPrice) : price.price;

    const trade: Trade = {
      id: `trade-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      marketId,
      outcome,
      side: 'buy',
      price: fillPrice,
      size: shares,
      timestamp: new Date().toISOString(),
      status: this.simulationMode ? 'filled' : 'pending',
    };

    if (this.simulationMode) {
      this.mockTrades.push(trade);
      this.updateMockPosition(marketId, outcome, shares, fillPrice);
    }

    return trade;
  }

  /**
   * Place a sell order
   */
  async sell(
    marketId: string,
    outcome: string,
    shares: number,
    minPrice?: number
  ): Promise<Trade> {
    await this.simulateLatency();

    const price = await this.getPrice(marketId, outcome);
    const fillPrice = minPrice ? Math.max(price.price, minPrice) : price.price;

    const trade: Trade = {
      id: `trade-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      marketId,
      outcome,
      side: 'sell',
      price: fillPrice,
      size: shares,
      timestamp: new Date().toISOString(),
      status: this.simulationMode ? 'filled' : 'pending',
    };

    if (this.simulationMode) {
      this.mockTrades.push(trade);
      this.updateMockPosition(marketId, outcome, -shares, fillPrice);
    }

    return trade;
  }

  // ==========================================================================
  // Portfolio
  // ==========================================================================

  /**
   * Get all current positions
   */
  async getPositions(): Promise<Position[]> {
    await this.simulateLatency();

    // Update unrealized PnL based on current prices
    const entries = Array.from(this.mockPositions.entries());
    for (const [key, position] of entries) {
      const [marketId, outcome] = key.split(':');
      const currentPrice = this.mockPrices.get(key) ?? 0.5;
      position.currentPrice = currentPrice;
      position.unrealizedPnL = position.shares * (currentPrice - position.averagePrice);
    }

    return Array.from(this.mockPositions.values());
  }

  /**
   * Get trade history
   */
  async getTrades(limit = 100): Promise<Trade[]> {
    await this.simulateLatency();
    return this.mockTrades.slice(-limit);
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start price updates (for simulation)
   */
  startPriceUpdates(): void {
    if (this.priceUpdateInterval) return;

    this.priceUpdateInterval = setInterval(() => {
      this.updateMockPrices();
    }, this.mockConfig.updateIntervalMs);
  }

  /**
   * Stop price updates
   */
  stopPriceUpdates(): void {
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
      this.priceUpdateInterval = null;
    }
  }

  // ==========================================================================
  // Mock Data Helpers
  // ==========================================================================

  private initializeMockPrices(): void {
    const initialPrices: Record<string, number> = {
      'btc-100k-2024:YES': 0.35,
      'btc-100k-2024:NO': 0.65,
      'ai-agi-2025:YES': 0.15,
      'ai-agi-2025:NO': 0.85,
      'space-mars-2026:YES': 0.08,
      'space-mars-2026:NO': 0.92,
      'climate-paris-2024:YES': 0.72,
      'climate-paris-2024:NO': 0.28,
    };

    for (const [key, price] of Object.entries(initialPrices)) {
      this.mockPrices.set(key, price);
    }
  }

  private updateMockPrices(): void {
    const { volatility, trendStrength } = this.mockConfig;

    const entries = Array.from(this.mockPrices.entries());
    for (const [key, price] of entries) {
      // Random walk with mean reversion
      const randomChange = (Math.random() - 0.5) * volatility;
      const meanReversion = (0.5 - price) * trendStrength;
      const newPrice = Math.max(0.01, Math.min(0.99,
        price + randomChange + meanReversion
      ));

      this.mockPrices.set(key, newPrice);

      // Update opposite outcome (must sum to 1)
      const [marketId, outcome] = key.split(':');
      const oppositeOutcome = outcome === 'YES' ? 'NO' : 'YES';
      const oppositeKey = `${marketId}:${oppositeOutcome}`;
      this.mockPrices.set(oppositeKey, 1 - newPrice);
    }
  }

  private updateMockPosition(
    marketId: string,
    outcome: string,
    sharesDelta: number,
    price: number
  ): void {
    const key = `${marketId}:${outcome}`;
    const existing = this.mockPositions.get(key);

    if (existing) {
      // Update existing position
      const newShares = existing.shares + sharesDelta;

      if (newShares === 0) {
        // Position closed
        this.mockPositions.delete(key);
      } else {
        // Update average price
        const totalCost = existing.shares * existing.averagePrice + sharesDelta * price;
        existing.averagePrice = totalCost / newShares;
        existing.shares = newShares;
      }
    } else if (sharesDelta > 0) {
      // New position
      this.mockPositions.set(key, {
        marketId,
        outcome,
        shares: sharesDelta,
        averagePrice: price,
        currentPrice: price,
        unrealizedPnL: 0,
        realizedPnL: 0,
      });
    }
  }

  private async simulateLatency(): Promise<void> {
    // Simulate 50-200ms API latency
    const delay = Math.random() * 150 + 50;
    return new Promise(resolve => setTimeout(resolve, delay));
  }
}
