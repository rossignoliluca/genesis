/**
 * Price Feeds
 *
 * Fetches real-time prices for ETH, USDC, and other assets.
 * Uses multiple sources with fallback for reliability.
 */

// ============================================================================
// Types
// ============================================================================

export interface PriceData {
  symbol: string;
  priceUsd: number;
  source: string;
  timestamp: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface PriceFeedConfig {
  cacheDurationMs: number;
  fallbackPrices: Record<string, number>;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: PriceFeedConfig = {
  cacheDurationMs: 60000, // 1 minute cache
  fallbackPrices: {
    ETH: 3000,
    USDC: 1,
    WETH: 3000,
  },
};

// CoinGecko batch price fetcher
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price';
const COINGECKO_PARAMS = { ids: 'ethereum,usd-coin', vs_currencies: 'usd' };

function parseCoinGecko(data: any): Record<string, number> {
  return {
    ETH: data.ethereum?.usd ?? 0,
    USDC: data['usd-coin']?.usd ?? 1,
    WETH: data.ethereum?.usd ?? 0,
  };
}

// Coinbase single-symbol URLs
const COINBASE_URLS: Record<string, string> = {
  ETH: 'https://api.coinbase.com/v2/prices/ETH-USD/spot',
  USDC: 'https://api.coinbase.com/v2/prices/USDC-USD/spot',
};

function parseCoinbase(data: any): number | null {
  return data.data?.amount ? parseFloat(data.data.amount) : null;
}

// ============================================================================
// Price Feed Manager
// ============================================================================

class PriceFeedManager {
  private config: PriceFeedConfig;
  private cache: Map<string, PriceData> = new Map();
  private updateTimer: NodeJS.Timeout | null = null;
  private priceCallbacks: Array<(prices: Map<string, PriceData>) => void> = [];

  constructor(config?: Partial<PriceFeedConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get price for a symbol.
   */
  async getPrice(symbol: string): Promise<PriceData> {
    const upperSymbol = symbol.toUpperCase();

    // Check cache
    const cached = this.cache.get(upperSymbol);
    if (cached && Date.now() - cached.timestamp < this.config.cacheDurationMs) {
      return cached;
    }

    // Fetch fresh price
    const price = await this.fetchPrice(upperSymbol);
    this.cache.set(upperSymbol, price);
    return price;
  }

  /**
   * Get prices for multiple symbols.
   */
  async getPrices(symbols: string[]): Promise<Map<string, PriceData>> {
    const results = new Map<string, PriceData>();

    // Try batch fetch from CoinGecko first
    try {
      const batchPrices = await this.fetchBatchPrices();
      for (const [symbol, price] of Object.entries(batchPrices)) {
        if (symbols.includes(symbol.toUpperCase())) {
          const priceData: PriceData = {
            symbol,
            priceUsd: price as number,
            source: 'coingecko',
            timestamp: Date.now(),
            confidence: 'high',
          };
          results.set(symbol, priceData);
          this.cache.set(symbol, priceData);
        }
      }
    } catch (e) {
      console.warn('[PriceFeeds] Batch fetch failed:', e);
    }

    // Fill in any missing symbols
    for (const symbol of symbols) {
      if (!results.has(symbol.toUpperCase())) {
        const price = await this.getPrice(symbol);
        results.set(symbol.toUpperCase(), price);
      }
    }

    return results;
  }

  /**
   * Get ETH price in USD.
   */
  async getEthPrice(): Promise<number> {
    const price = await this.getPrice('ETH');
    return price.priceUsd;
  }

  /**
   * Convert ETH amount to USD.
   */
  async ethToUsd(ethAmount: number): Promise<number> {
    const ethPrice = await this.getEthPrice();
    return ethAmount * ethPrice;
  }

  /**
   * Convert USD amount to ETH.
   */
  async usdToEth(usdAmount: number): Promise<number> {
    const ethPrice = await this.getEthPrice();
    return usdAmount / ethPrice;
  }

  /**
   * Start automatic price updates.
   */
  startAutoUpdate(intervalMs: number = 60000): void {
    if (this.updateTimer) return;

    const update = async () => {
      try {
        const prices = await this.getPrices(['ETH', 'USDC', 'WETH']);

        // Notify callbacks
        for (const cb of this.priceCallbacks) {
          try {
            cb(prices);
          } catch (e) {
            console.warn('[PriceFeeds] Callback error:', e);
          }
        }
      } catch (e) {
        console.warn('[PriceFeeds] Auto-update failed:', e);
      }
    };

    // Initial fetch
    update();

    // Start periodic updates
    this.updateTimer = setInterval(update, intervalMs);
    console.log(`[PriceFeeds] Auto-update started (${intervalMs / 1000}s interval)`);
  }

  /**
   * Stop automatic updates.
   */
  stopAutoUpdate(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
      console.log('[PriceFeeds] Auto-update stopped');
    }
  }

  /**
   * Register callback for price updates.
   */
  onPriceUpdate(callback: (prices: Map<string, PriceData>) => void): () => void {
    this.priceCallbacks.push(callback);
    return () => {
      const idx = this.priceCallbacks.indexOf(callback);
      if (idx >= 0) this.priceCallbacks.splice(idx, 1);
    };
  }

  /**
   * Get cached prices (no fetch).
   */
  getCachedPrices(): Map<string, PriceData> {
    return new Map(this.cache);
  }

  /**
   * Clear cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ============================================================================
  // Private
  // ============================================================================

  private async fetchPrice(symbol: string): Promise<PriceData> {
    // Try CoinGecko batch first
    try {
      const batch = await this.fetchBatchPrices();
      if (batch[symbol] !== undefined) {
        return {
          symbol,
          priceUsd: batch[symbol],
          source: 'coingecko',
          timestamp: Date.now(),
          confidence: 'high',
        };
      }
    } catch {
      // Fall through to next source
    }

    // Try Coinbase
    try {
      const coinbaseSource = PRICE_SOURCES.find(s => s.name === 'coinbase');
      if (coinbaseSource && 'urls' in coinbaseSource) {
        const url = (coinbaseSource.urls as Record<string, string>)[symbol];
        if (url) {
          const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
          if (response.ok) {
            const data = await response.json();
            const price = coinbaseSource.parse(data);
            if (price !== null) {
              return {
                symbol,
                priceUsd: price,
                source: 'coinbase',
                timestamp: Date.now(),
                confidence: 'high',
              };
            }
          }
        }
      }
    } catch {
      // Fall through to fallback
    }

    // Use fallback price
    const fallback = this.config.fallbackPrices[symbol];
    if (fallback !== undefined) {
      console.warn(`[PriceFeeds] Using fallback price for ${symbol}: $${fallback}`);
      return {
        symbol,
        priceUsd: fallback,
        source: 'fallback',
        timestamp: Date.now(),
        confidence: 'low',
      };
    }

    throw new Error(`No price available for ${symbol}`);
  }

  private async fetchBatchPrices(): Promise<Record<string, number>> {
    const source = PRICE_SOURCES[0]; // CoinGecko

    const url = new URL(source.url);
    for (const [key, value] of Object.entries(source.params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    return source.parse(data);
  }
}

// ============================================================================
// Singleton
// ============================================================================

let priceFeedInstance: PriceFeedManager | null = null;

export function getPriceFeed(config?: Partial<PriceFeedConfig>): PriceFeedManager {
  if (!priceFeedInstance) {
    priceFeedInstance = new PriceFeedManager(config);
  }
  return priceFeedInstance;
}

export function resetPriceFeed(): void {
  priceFeedInstance?.stopAutoUpdate();
  priceFeedInstance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get current ETH price.
 */
export async function getEthPrice(): Promise<number> {
  return getPriceFeed().getEthPrice();
}

/**
 * Convert ETH to USD.
 */
export async function ethToUsd(ethAmount: number): Promise<number> {
  return getPriceFeed().ethToUsd(ethAmount);
}

/**
 * Convert USD to ETH.
 */
export async function usdToEth(usdAmount: number): Promise<number> {
  return getPriceFeed().usdToEth(usdAmount);
}
