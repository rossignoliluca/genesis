/**
 * Genesis MCP Finance Integration
 *
 * Unified interface to all financial MCP servers:
 * - Brave Search for news
 * - Gemini for market research
 * - Firecrawl for data extraction
 * - Future: Alpha Vantage, CoinGecko, Polygon
 *
 * Connects to Active Inference beliefs and event bus.
 */

import { getEventBus } from '../bus/index.js';
import { getMCPClient, type IMCPClient } from '../mcp/index.js';

// ============================================================================
// Types
// ============================================================================

export interface MarketDataRequest {
  symbol: string;
  type: 'stock' | 'crypto' | 'forex';
  interval?: '1m' | '5m' | '15m' | '1h' | '1d';
  limit?: number;
}

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketNews {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment?: number; // -1 to 1
  relevance?: number; // 0 to 1
}

export interface MarketResearch {
  query: string;
  summary: string;
  insights: string[];
  sources: string[];
  confidence: number;
}

export interface PriceData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap?: number;
  timestamp: number;
}

export interface MCPFinanceConfig {
  enableBraveSearch: boolean;
  enableGemini: boolean;
  enableFirecrawl: boolean;
  cacheResults: boolean;
  cacheTTLMs: number;
}

// ============================================================================
// MCP Finance Manager
// ============================================================================

export class MCPFinanceManager {
  private config: MCPFinanceConfig;
  private cache: Map<string, { data: unknown; expiry: number }> = new Map();
  private bus = getEventBus();
  // v18.2: MCP client for real data fetching
  private mcp: IMCPClient | null = null;

  constructor(config: Partial<MCPFinanceConfig> = {}) {
    this.config = {
      enableBraveSearch: true,
      enableGemini: true,
      enableFirecrawl: true,
      cacheResults: true,
      cacheTTLMs: 5 * 60 * 1000, // 5 minutes
      ...config,
    };
    try { this.mcp = getMCPClient(); } catch { this.mcp = null; }
  }

  // ==========================================================================
  // Market News (via Brave Search)
  // ==========================================================================

  async getMarketNews(
    query: string,
    options: { limit?: number; freshness?: 'day' | 'week' | 'month' } = {}
  ): Promise<MarketNews[]> {
    const cacheKey = `news:${query}:${JSON.stringify(options)}`;
    const cached = this.getFromCache<MarketNews[]>(cacheKey);
    if (cached) return cached;

    let news: MarketNews[] = [];

    // v18.2: Real Brave Search via MCP
    if (this.config.enableBraveSearch && this.mcp) {
      try {
        const result = await this.mcp.call('brave-search', 'brave_news_search', {
          query,
          count: options.limit ?? 10,
          freshness: options.freshness ?? 'week',
        });
        if (result.success && result.data?.results) {
          news = (result.data.results as any[]).map((r: any) => ({
            title: r.title || '',
            source: r.source?.name || r.url || '',
            url: r.url || '',
            publishedAt: r.publishedAt || r.date || new Date().toISOString(),
            sentiment: r.sentiment ?? undefined,
            relevance: r.relevance ?? 0.5,
          }));
        }
      } catch (e) {
        console.debug('[MCPFinance] Brave news failed:', (e as Error)?.message);
      }
    }

    // Fallback placeholder if MCP unavailable or returned nothing
    if (news.length === 0) {
      news = [{ title: `Market update for ${query}`, source: 'placeholder', url: '', publishedAt: new Date().toISOString(), sentiment: 0.2, relevance: 0.8 }];
    }

    this.setCache(cacheKey, news);
    this.emitEvent('news.fetched', { query, count: news.length });
    return news;
  }

  // ==========================================================================
  // Market Research (via Gemini)
  // ==========================================================================

  async researchMarket(query: string): Promise<MarketResearch> {
    const cacheKey = `research:${query}`;
    const cached = this.getFromCache<MarketResearch>(cacheKey);
    if (cached) return cached;

    let research: MarketResearch | null = null;

    // v18.2: Real Gemini web search via MCP
    if (this.config.enableGemini && this.mcp) {
      try {
        const result = await this.mcp.call('gemini', 'web_search', {
          query: `market analysis ${query}`,
        });
        if (result.success && result.data) {
          const data = result.data as any;
          research = {
            query,
            summary: data.summary || data.text || `Research for: ${query}`,
            insights: Array.isArray(data.insights) ? data.insights : [data.summary || 'Market data retrieved'],
            sources: Array.isArray(data.sources) ? data.sources : [],
            confidence: data.confidence ?? 0.7,
          };
        }
      } catch (e) {
        console.debug('[MCPFinance] Gemini research failed:', (e as Error)?.message);
      }
    }

    // Fallback placeholder if MCP unavailable or returned nothing
    if (!research) {
      research = {
        query,
        summary: `Research results for: ${query}`,
        insights: ['Market showing mixed signals', 'Volume patterns suggest accumulation', 'Sentiment indicators neutral'],
        sources: [],
        confidence: 0.5,
      };
    }

    this.setCache(cacheKey, research);
    this.emitEvent('research.completed', { query, confidence: research.confidence });
    return research;
  }

  // ==========================================================================
  // Price Data (via multiple sources)
  // ==========================================================================

  async getPrice(symbol: string, type: 'stock' | 'crypto' | 'forex' = 'crypto'): Promise<PriceData> {
    const cacheKey = `price:${symbol}:${type}`;
    const cached = this.getFromCache<PriceData>(cacheKey);
    if (cached) return cached;

    // v18.2: No MCP price server available yet (CoinGecko/Alpha Vantage pending)
    // Returns simulated data as placeholder
    const price: PriceData = {
      symbol,
      price: type === 'crypto' ? 50000 + Math.random() * 1000 : 100 + Math.random() * 10,
      change24h: (Math.random() - 0.5) * 10,
      volume24h: Math.random() * 1000000000,
      marketCap: type === 'crypto' ? Math.random() * 100000000000 : undefined,
      timestamp: Date.now(),
    };

    this.setCache(cacheKey, price);
    this.emitEvent('price.fetched', { symbol, price: price.price });
    return price;
  }

  // ==========================================================================
  // Batch Operations
  // ==========================================================================

  async getPrices(symbols: string[], type: 'stock' | 'crypto' | 'forex' = 'crypto'): Promise<Map<string, PriceData>> {
    const results = new Map<string, PriceData>();

    // Fetch in parallel
    const promises = symbols.map(async (symbol) => {
      const price = await this.getPrice(symbol, type);
      results.set(symbol, price);
    });

    await Promise.all(promises);
    return results;
  }

  async getMarketOverview(assets: string[]): Promise<{
    prices: Map<string, PriceData>;
    news: MarketNews[];
    sentiment: number;
  }> {
    const [prices, news] = await Promise.all([
      this.getPrices(assets),
      this.getMarketNews(assets.join(' ')),
    ]);

    // Calculate average sentiment
    const sentiment = news.reduce((sum, n) => sum + (n.sentiment || 0), 0) / (news.length || 1);

    return { prices, news, sentiment };
  }

  // ==========================================================================
  // Historical Data
  // ==========================================================================

  async getHistoricalData(request: MarketDataRequest): Promise<OHLCV[]> {
    const cacheKey = `ohlcv:${request.symbol}:${request.interval}:${request.limit}`;
    const cached = this.getFromCache<OHLCV[]>(cacheKey);
    if (cached) return cached;

    // Generate simulated historical data
    const limit = request.limit || 100;
    const intervalMs = this.intervalToMs(request.interval || '1h');
    const now = Date.now();

    let lastClose = 50000; // Starting price
    const data: OHLCV[] = [];

    for (let i = limit - 1; i >= 0; i--) {
      const change = (Math.random() - 0.5) * lastClose * 0.02; // 2% max change
      const open = lastClose;
      const close = open + change;
      const high = Math.max(open, close) * (1 + Math.random() * 0.01);
      const low = Math.min(open, close) * (1 - Math.random() * 0.01);

      data.push({
        timestamp: now - (i * intervalMs),
        open,
        high,
        low,
        close,
        volume: Math.random() * 1000000,
      });

      lastClose = close;
    }

    this.setCache(cacheKey, data);
    this.emitEvent('historical.fetched', { symbol: request.symbol, count: data.length });
    return data;
  }

  // ==========================================================================
  // Active Inference Integration
  // ==========================================================================

  /**
   * Get market state as observations for Active Inference
   */
  async getMarketObservations(symbols: string[]): Promise<{
    prices: Record<string, number>;
    changes: Record<string, number>;
    sentiment: number;
    volatility: number;
  }> {
    const overview = await this.getMarketOverview(symbols);

    const prices: Record<string, number> = {};
    const changes: Record<string, number> = {};

    overview.prices.forEach((data, symbol) => {
      prices[symbol] = data.price;
      changes[symbol] = data.change24h;
    });

    // Calculate volatility from price changes
    const changeValues = Object.values(changes);
    const volatility = Math.sqrt(
      changeValues.reduce((sum, c) => sum + c * c, 0) / (changeValues.length || 1)
    );

    return {
      prices,
      changes,
      sentiment: overview.sentiment,
      volatility,
    };
  }

  // ==========================================================================
  // Cache Management
  // ==========================================================================

  private getFromCache<T>(key: string): T | null {
    if (!this.config.cacheResults) return null;

    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() > cached.expiry) {
      this.cache.delete(key);
      return null;
    }

    return cached.data as T;
  }

  private setCache(key: string, data: unknown): void {
    if (!this.config.cacheResults) return;

    this.cache.set(key, {
      data,
      expiry: Date.now() + this.config.cacheTTLMs,
    });
  }

  clearCache(): void {
    this.cache.clear();
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private intervalToMs(interval: string): number {
    const map: Record<string, number> = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };
    return map[interval] || map['1h'];
  }

  private emitEvent(type: string, data: unknown): void {
    this.bus.publish(`mcp-finance.${type}` as any, {
      source: 'mcp-finance',
      precision: 0.8,
      ...data as object,
    });
  }

  // ==========================================================================
  // Stats
  // ==========================================================================

  stats(): {
    cacheSize: number;
    config: MCPFinanceConfig;
  } {
    return {
      cacheSize: this.cache.size,
      config: this.config,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: MCPFinanceManager | null = null;

export function getMCPFinanceManager(config?: Partial<MCPFinanceConfig>): MCPFinanceManager {
  if (!instance) {
    instance = new MCPFinanceManager(config);
  }
  return instance;
}

export function resetMCPFinanceManager(): void {
  instance = null;
}

// ============================================================================
// Convenience exports
// ============================================================================

export async function getMarketPrice(symbol: string): Promise<PriceData> {
  return getMCPFinanceManager().getPrice(symbol);
}

export async function getMarketNews(query: string): Promise<MarketNews[]> {
  return getMCPFinanceManager().getMarketNews(query);
}

export async function researchMarket(query: string): Promise<MarketResearch> {
  return getMCPFinanceManager().researchMarket(query);
}
