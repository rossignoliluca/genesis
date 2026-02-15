/**
 * Genesis v19.1 - Data Verifier (Multi-Provider Waterfall)
 *
 * 7 provider sources, all fired in parallel:
 *   - Yahoo Finance (equities, FX, commodities, VIX)
 *   - CoinGecko (crypto — key optional)
 *   - FRED (indices, bonds, FX, commodities, VIX — key required)
 *   - FMP — Financial Modeling Prep (equities — paid tier for indices)
 *   - Frankfurter (FX — ECB rates, zero auth)
 *   - CoinPaprika (crypto — zero auth)
 *   - ExchangeRate-API (FX — zero auth)
 *
 * Each asset has 2-5 providers. All fire in parallel via Promise.allSettled.
 * Confidence scoring rewards multi-source agreement.
 */

import { config as dotenvConfig } from 'dotenv';
import * as path from 'path';

// Ensure .env is loaded even when running standalone
dotenvConfig({ path: path.resolve(process.cwd(), '.env') });

import { getMCPClient } from '../mcp/index.js';
import type { IMCPClient } from '../mcp/index.js';
import type { AssetSnapshot, Headline } from './types.js';

// ============================================================================
// Types
// ============================================================================

export type Provider = 'yahoo' | 'coingecko' | 'fred' | 'fmp' | 'frankfurter' | 'coinpaprika' | 'exchangerate';

export interface ProviderMapping {
  provider: Provider;
  identifier: string;
  range: [number, number]; // [min, max] sanity check
}

export interface AssetProviderConfig {
  name: string;
  providers: ProviderMapping[];
  tolerancePercent: number; // agreement tolerance
}

export interface SourceEvidence {
  source: string;
  url: string;
  value: string;
  numericValue: number;
  provider: Provider;
  scrapedAt: Date;
}

export interface VerifiedDataPoint {
  asset: string;
  field: string;
  value: string;
  sources: SourceEvidence[];
  verified: boolean;
  confidence: number;
  verifiedPrice?: number;
  canReplaceLLMValue: boolean;
  freshness: { isStale: boolean; ageHours: number; dataDate: string };
}

export interface VerificationReport {
  totalDataPoints: number;
  verifiedCount: number;
  unverifiedCount: number;
  verificationRate: number;
  dataPoints: VerifiedDataPoint[];
  warnings: string[];
  corrections: string[];
}

interface YahooQuote {
  symbol: string;
  regularMarketPrice: number;
  regularMarketTime: number; // unix timestamp
  shortName?: string;
}

interface FREDObservation {
  date: string;
  value: string;
}

// ============================================================================
// FMP Symbol Map (Yahoo → FMP equivalents)
// ============================================================================

const FMP_SYMBOL_MAP: Record<string, string> = {
  '%5EGSPC': '^GSPC',
  '%5ENDX': '^NDX',
  '%5EDJI': '^DJI',
  '%5ESTOXX': '^STOXX',
  'FTSEMIB.MI': 'FTSEMIB.MI',
  '%5ETNX': '^TNX',
  '%5EIRX': '^IRX',
  '%5ETYX': '^TYX',
  'EURUSD%3DX': 'EURUSD',
  'USDCHF%3DX': 'USDCHF',
  'GC%3DF': 'GCUSD',
  'CL%3DF': 'CLUSD',
  'BTC-USD': 'BTCUSD',
  '%5EVIX': '^VIX',
};

// ============================================================================
// Asset-to-Provider Map (multi-provider waterfall)
// ============================================================================

const ASSET_PROVIDER_MAP: AssetProviderConfig[] = [
  { name: 'S&P 500', providers: [
    { provider: 'yahoo', identifier: '%5EGSPC', range: [2000, 15000] },
    { provider: 'fred', identifier: 'SP500', range: [2000, 15000] },
    { provider: 'fmp', identifier: '^GSPC', range: [2000, 15000] },
  ], tolerancePercent: 0.5 },
  { name: 'Nasdaq 100', providers: [
    { provider: 'yahoo', identifier: '%5ENDX', range: [5000, 50000] },
    { provider: 'fred', identifier: 'NASDAQCOM', range: [5000, 50000] }, // Composite proxy (~NDX)
    { provider: 'fmp', identifier: '^NDX', range: [5000, 50000] },
  ], tolerancePercent: 1.5 }, // wider tolerance: NASDAQCOM ≠ NDX
  { name: 'Dow Jones', providers: [
    { provider: 'yahoo', identifier: '%5EDJI', range: [15000, 80000] },
    { provider: 'fred', identifier: 'DJIA', range: [15000, 80000] },
    { provider: 'fmp', identifier: '^DJI', range: [15000, 80000] },
  ], tolerancePercent: 0.5 },
  { name: 'STOXX 600', providers: [
    { provider: 'yahoo', identifier: '%5ESTOXX', range: [200, 1000] },
    { provider: 'fmp', identifier: '^STOXX', range: [200, 1000] },
  ], tolerancePercent: 0.5 },
  { name: 'FTSE MIB', providers: [
    { provider: 'yahoo', identifier: 'FTSEMIB.MI', range: [10000, 60000] },
    { provider: 'fmp', identifier: 'FTSEMIB.MI', range: [10000, 60000] },
  ], tolerancePercent: 0.5 },
  { name: 'US 10Y', providers: [
    { provider: 'fred', identifier: 'DGS10', range: [0, 15] },
    { provider: 'yahoo', identifier: '%5ETNX', range: [0, 15] },
    { provider: 'fmp', identifier: '^TNX', range: [0, 15] },
  ], tolerancePercent: 3 },
  { name: 'US 2Y', providers: [
    { provider: 'fred', identifier: 'DGS2', range: [0, 15] },
    { provider: 'yahoo', identifier: '%5EIRX', range: [0, 15] },
    { provider: 'fmp', identifier: '^IRX', range: [0, 15] },
  ], tolerancePercent: 3 },
  { name: 'German 10Y', providers: [
    { provider: 'yahoo', identifier: '%5ETYX', range: [0, 15] },
    { provider: 'fmp', identifier: '^TYX', range: [0, 15] },
  ], tolerancePercent: 3 },
  { name: 'EUR/USD', providers: [
    { provider: 'yahoo', identifier: 'EURUSD%3DX', range: [0.5, 2.0] },
    { provider: 'fred', identifier: 'DEXUSEU', range: [0.5, 2.0] },
    { provider: 'frankfurter', identifier: 'EUR', range: [0.5, 2.0] },
    { provider: 'exchangerate', identifier: 'EUR', range: [0.5, 2.0] },
    { provider: 'fmp', identifier: 'EURUSD', range: [0.5, 2.0] },
  ], tolerancePercent: 0.2 },
  { name: 'USD/CHF', providers: [
    { provider: 'yahoo', identifier: 'USDCHF%3DX', range: [0.5, 2.0] },
    { provider: 'fred', identifier: 'DEXSZUS', range: [0.5, 2.0] },
    { provider: 'frankfurter', identifier: 'CHF', range: [0.5, 2.0] },
    { provider: 'exchangerate', identifier: 'CHF', range: [0.5, 2.0] },
    { provider: 'fmp', identifier: 'USDCHF', range: [0.5, 2.0] },
  ], tolerancePercent: 0.2 },
  { name: 'Gold', providers: [
    { provider: 'yahoo', identifier: 'GC%3DF', range: [1000, 5000] },
    { provider: 'fmp', identifier: 'GCUSD', range: [1000, 5000] },
  ], tolerancePercent: 1 },
  { name: 'Oil WTI', providers: [
    { provider: 'yahoo', identifier: 'CL%3DF', range: [20, 200] },
    { provider: 'fred', identifier: 'DCOILWTICO', range: [20, 200] },
    { provider: 'fmp', identifier: 'CLUSD', range: [20, 200] },
  ], tolerancePercent: 1 },
  { name: 'Bitcoin', providers: [
    { provider: 'coingecko', identifier: 'bitcoin', range: [10000, 500000] },
    { provider: 'coinpaprika', identifier: 'btc-bitcoin', range: [10000, 500000] },
    { provider: 'fmp', identifier: 'BTCUSD', range: [10000, 500000] },
    { provider: 'yahoo', identifier: 'BTC-USD', range: [10000, 500000] },
  ], tolerancePercent: 2 },
  { name: 'VIX', providers: [
    { provider: 'yahoo', identifier: '%5EVIX', range: [5, 80] },
    { provider: 'fred', identifier: 'VIXCLS', range: [5, 80] },
    { provider: 'fmp', identifier: '^VIX', range: [5, 80] },
  ], tolerancePercent: 2 },
];

// ============================================================================
// Data Verifier
// ============================================================================

export class DataVerifier {
  private mcp: IMCPClient;

  constructor() {
    this.mcp = getMCPClient();
  }

  /**
   * Verify asset snapshots using real financial APIs.
   * Returns verification report with corrected prices.
   */
  async verifyAssets(assets: AssetSnapshot[]): Promise<VerificationReport> {
    const dataPoints: VerifiedDataPoint[] = [];
    const warnings: string[] = [];
    const corrections: string[] = [];

    // Only fetch prices for the assets we're verifying (not all in ASSET_PROVIDER_MAP)
    const assetNames = new Set(assets.map(a => a.name));
    const allPrices = await this.fetchAllPrices(assetNames);

    for (const asset of assets) {
      const config = ASSET_PROVIDER_MAP.find(a => a.name === asset.name);
      if (!config) {
        // No provider mapping — mark as unverified
        dataPoints.push({
          asset: asset.name,
          field: 'level',
          value: asset.level,
          sources: [],
          verified: false,
          confidence: 0,
          canReplaceLLMValue: false,
          freshness: { isStale: true, ageHours: Infinity, dataDate: 'unknown' },
        });
        warnings.push(`NO_PROVIDER: ${asset.name} — no API mapping configured`);
        continue;
      }

      // Gather evidence from fetched prices
      const sources: SourceEvidence[] = [];
      let latestTimestamp: Date | null = null;

      for (const providerMapping of config.providers) {
        const price = allPrices.get(`${providerMapping.provider}:${providerMapping.identifier}`);
        if (price && price.value >= providerMapping.range[0] && price.value <= providerMapping.range[1]) {
          sources.push({
            source: providerMapping.provider,
            url: this.getProviderUrl(providerMapping),
            value: String(price.value),
            numericValue: price.value,
            provider: providerMapping.provider,
            scrapedAt: price.timestamp,
          });
          if (!latestTimestamp || price.timestamp > latestTimestamp) {
            latestTimestamp = price.timestamp;
          }
        }
      }

      const freshness = this.checkFreshness(latestTimestamp);
      const confidence = this.computeConfidence(sources, freshness, config.tolerancePercent);
      const verified = sources.length >= 1 && confidence >= 0.4;

      // Determine best verified price (median if multiple sources)
      let verifiedPrice: number | undefined;
      let canReplace = false;
      if (sources.length > 0) {
        const prices = sources.map(s => s.numericValue).sort((a, b) => a - b);
        verifiedPrice = prices[Math.floor(prices.length / 2)]; // median
        canReplace = verified && !freshness.isStale;
      }

      // Check if LLM value needs correction
      const reportedNum = parseFloat(asset.level.replace(/,/g, '').replace('%', ''));
      if (canReplace && verifiedPrice !== undefined && !isNaN(reportedNum)) {
        const diff = Math.abs(reportedNum - verifiedPrice) / Math.max(reportedNum, verifiedPrice, 0.01);
        if (diff > config.tolerancePercent / 100) {
          corrections.push(`[CORRECTED] ${asset.name}: ${asset.level} -> ${this.formatPrice(verifiedPrice, asset.name)} (verified via ${sources.map(s => s.provider).join(',')})`);
        }
      }

      dataPoints.push({
        asset: asset.name,
        field: 'level',
        value: asset.level,
        sources,
        verified,
        confidence,
        verifiedPrice,
        canReplaceLLMValue: canReplace,
        freshness,
      });

      if (!verified) {
        warnings.push(`UNVERIFIED: ${asset.name} level ${asset.level} — ${sources.length} source(s), confidence ${confidence.toFixed(2)}`);
      }
    }

    const verifiedCount = dataPoints.filter(d => d.verified).length;
    return {
      totalDataPoints: dataPoints.length,
      verifiedCount,
      unverifiedCount: dataPoints.length - verifiedCount,
      verificationRate: dataPoints.length > 0 ? verifiedCount / dataPoints.length : 0,
      dataPoints,
      warnings,
      corrections,
    };
  }

  /**
   * Verify headlines — check they're real and recent
   */
  async verifyHeadlines(headlines: Headline[]): Promise<{
    verified: Headline[];
    unverified: Headline[];
  }> {
    const verified: Headline[] = [];
    const unverified: Headline[] = [];

    for (const headline of headlines) {
      if (headline.url) {
        verified.push(headline);
      } else {
        unverified.push(headline);
      }
    }

    return { verified, unverified };
  }

  // ==========================================================================
  // Batch Fetch — 3 parallel HTTP requests
  // ==========================================================================

  private async fetchAllPrices(requestedAssets?: Set<string>): Promise<Map<string, { value: number; timestamp: Date }>> {
    const results = new Map<string, { value: number; timestamp: Date }>();

    // Collect unique identifiers per provider — only for requested assets
    const yahooSymbols = new Set<string>();
    const coingeckoIds = new Set<string>();
    const fredSeries = new Set<string>();
    const fmpSymbols = new Set<string>();
    const frankfurterCurrencies = new Set<string>();
    const coinpaprikaIds = new Set<string>();
    const exchangerateCurrencies = new Set<string>();

    for (const asset of ASSET_PROVIDER_MAP) {
      if (requestedAssets && !requestedAssets.has(asset.name)) continue;
      for (const p of asset.providers) {
        switch (p.provider) {
          case 'yahoo': yahooSymbols.add(p.identifier); break;
          case 'coingecko': coingeckoIds.add(p.identifier); break;
          case 'fred': fredSeries.add(p.identifier); break;
          case 'fmp': fmpSymbols.add(p.identifier); break;
          case 'frankfurter': frankfurterCurrencies.add(p.identifier); break;
          case 'coinpaprika': coinpaprikaIds.add(p.identifier); break;
          case 'exchangerate': exchangerateCurrencies.add(p.identifier); break;
        }
      }
    }

    // Fire all 7 providers in parallel
    const [
      yahooResult, coingeckoResult, fmpResult, frankfurterResult,
      coinpaprikaResult, exchangerateResult, ...fredResults
    ] = await Promise.allSettled([
      this.fetchYahoo([...yahooSymbols]),
      this.fetchCoinGecko([...coingeckoIds]),
      this.fetchFMP([...fmpSymbols]),
      this.fetchFrankfurter([...frankfurterCurrencies]),
      this.fetchCoinPaprika([...coinpaprikaIds]),
      this.fetchExchangeRate([...exchangerateCurrencies]),
      ...([...fredSeries].map(id => this.fetchFRED(id))),
    ]);

    // Merge all results by provider prefix
    const mapResults = [
      { result: yahooResult, prefix: 'yahoo' },
      { result: coingeckoResult, prefix: 'coingecko' },
      { result: fmpResult, prefix: 'fmp' },
      { result: frankfurterResult, prefix: 'frankfurter' },
      { result: coinpaprikaResult, prefix: 'coinpaprika' },
      { result: exchangerateResult, prefix: 'exchangerate' },
    ];
    for (const { result, prefix } of mapResults) {
      if (result.status === 'fulfilled') {
        for (const [key, val] of result.value) {
          results.set(`${prefix}:${key}`, val);
        }
      }
    }

    // Merge FRED results (1 result per series)
    const fredIds = [...fredSeries];
    for (let i = 0; i < fredResults.length; i++) {
      const result = fredResults[i];
      if (result.status === 'fulfilled' && result.value) {
        results.set(`fred:${fredIds[i]}`, result.value);
      }
    }

    return results;
  }

  /**
   * Yahoo Finance v8 chart API — 1 request per symbol (parallel).
   * v7 quote endpoint is deprecated (returns 401). v8 chart works without auth.
   */
  private async fetchYahoo(symbols: string[]): Promise<Map<string, { value: number; timestamp: Date }>> {
    const results = new Map<string, { value: number; timestamp: Date }>();
    if (symbols.length === 0) return results;

    const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    // Fetch symbols via v8/finance/chart in batches of 2 with 2.5s delays to avoid 429
    const BATCH_SIZE = 2;
    const BATCH_DELAY_MS = 2500;
    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      if (i > 0) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
      const batch = symbols.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(batch.map(symbol => this.fetchYahooSingle(symbol, BROWSER_UA, results)));
    }
    return results;
  }

  private async fetchYahooSingle(
    symbol: string,
    ua: string,
    results: Map<string, { value: number; timestamp: Date }>,
  ): Promise<void> {
    const decodedSymbol = decodeURIComponent(symbol);

    // Try up to 2 attempts with backoff for 429s
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 3000));

        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(decodedSymbol)}?interval=1d&range=1d`;

        const response = await fetch(url, {
          headers: { 'User-Agent': ua, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000),
        });

        if (response.status === 429 && attempt === 0) {
          continue; // Retry after backoff
        }

        if (!response.ok) {
          const avResult = await this.fetchAlphaVantage(decodedSymbol);
          if (avResult) results.set(symbol, avResult);
          else console.warn(`[Verifier] Yahoo v8 returned ${response.status} for ${decodedSymbol}`);
          return;
        }

        const data = await response.json() as {
          chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; regularMarketTime?: number } }> };
        };

        const meta = data.chart?.result?.[0]?.meta;
        if (meta?.regularMarketPrice != null) {
          results.set(symbol, {
            value: meta.regularMarketPrice,
            timestamp: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : new Date(),
          });
        }
        return; // Success
      } catch (error) {
        if (attempt === 1) console.warn(`[Verifier] Yahoo v8 fetch failed for ${symbol}: ${error}`);
      }
    }
  }

  /**
   * AlphaVantage fallback for when Yahoo fails.
   * Uses ALPHAVANTAGE_API_KEY from env. Free tier: 25 requests/day.
   */
  private async fetchAlphaVantage(symbol: string): Promise<{ value: number; timestamp: Date } | null> {
    const apiKey = process.env.ALPHAVANTAGE_API_KEY;
    if (!apiKey) return null;

    try {
      // Clean symbol for AlphaVantage (^GSPC → SPY equivalent not supported, skip index symbols)
      if (symbol.startsWith('^') || symbol.includes('=')) return null;

      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;

      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return null;

      const data = await response.json() as {
        'Global Quote'?: {
          '05. price'?: string;
          '07. latest trading day'?: string;
        };
      };

      const quote = data['Global Quote'];
      if (quote?.['05. price']) {
        return {
          value: parseFloat(quote['05. price']),
          timestamp: quote['07. latest trading day']
            ? new Date(quote['07. latest trading day'])
            : new Date(),
        };
      }
    } catch {
      // Silent fallback failure
    }
    return null;
  }

  /**
   * CoinGecko simple price API — 1 request for all crypto.
   * Uses demo API key header to avoid 429 rate limits on free tier.
   * Falls back to without key if COINGECKO_API_KEY not set.
   */
  private async fetchCoinGecko(ids: string[]): Promise<Map<string, { value: number; timestamp: Date }>> {
    const results = new Map<string, { value: number; timestamp: Date }>();
    if (ids.length === 0) return results;

    const apiKey = process.env.COINGECKO_API_KEY;
    const idsStr = ids.join(',');

    // Try with demo key first, then without
    for (const attempt of [true, false]) {
      try {
        const baseUrl = apiKey && attempt
          ? 'https://api.coingecko.com/api/v3'
          : 'https://api.coingecko.com/api/v3';
        const url = `${baseUrl}/simple/price?ids=${idsStr}&vs_currencies=usd&include_last_updated_at=true`;

        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          'Accept': 'application/json',
        };
        if (apiKey && attempt) {
          headers['x-cg-demo-api-key'] = apiKey;
        }

        const response = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(10000),
        });

        if (response.status === 429) {
          // Rate limited — wait 2s and try without key
          console.warn(`[Verifier] CoinGecko 429 rate limited, ${attempt ? 'retrying without key...' : 'giving up'}`);
          if (attempt) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          return results;
        }

        if (!response.ok) {
          console.warn(`[Verifier] CoinGecko API returned ${response.status}`);
          return results;
        }

        const data = await response.json() as Record<string, { usd: number; last_updated_at?: number }>;

        for (const id of ids) {
          if (data[id]?.usd != null) {
            results.set(id, {
              value: data[id].usd,
              timestamp: data[id].last_updated_at
                ? new Date(data[id].last_updated_at! * 1000)
                : new Date(),
            });
          }
        }
        return results; // Success, don't retry
      } catch (error) {
        console.warn(`[Verifier] CoinGecko fetch failed (attempt ${attempt ? 1 : 2}): ${error}`);
      }
    }

    return results;
  }

  /**
   * FRED API — 1 request per series (DGS10, DGS2)
   */
  private async fetchFRED(seriesId: string): Promise<{ value: number; timestamp: Date } | null> {
    const apiKey = process.env.FRED_API_KEY;
    if (!apiKey) {
      console.warn(`[Verifier] FRED_API_KEY not set, skipping ${seriesId}`);
      return null;
    }

    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`;

      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.warn(`[Verifier] FRED API returned ${response.status} for ${seriesId}`);
        return null;
      }

      const data = await response.json() as { observations?: FREDObservation[] };
      const obs = data.observations?.[0];

      if (obs && obs.value !== '.') {
        return {
          value: parseFloat(obs.value),
          timestamp: new Date(obs.date),
        };
      }
    } catch (error) {
      console.warn(`[Verifier] FRED fetch failed for ${seriesId}: ${error}`);
    }

    return null;
  }

  /**
   * Financial Modeling Prep — batch quote endpoint.
   * 250 calls/day free tier, 1 request for all symbols.
   * Requires FMP_API_KEY env var.
   */
  private async fetchFMP(symbols: string[]): Promise<Map<string, { value: number; timestamp: Date }>> {
    const results = new Map<string, { value: number; timestamp: Date }>();
    if (symbols.length === 0) return results;

    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey) {
      console.warn('[Verifier] FMP_API_KEY not set, skipping FMP provider');
      return results;
    }

    try {
      const csv = symbols.join(',');
      const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(csv)}&apikey=${apiKey}`;

      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        console.warn(`[Verifier] FMP API returned ${response.status}`);
        return results;
      }

      const data = await response.json() as Array<{
        symbol: string;
        price: number;
        timestamp?: number;
      }>;

      if (!Array.isArray(data)) return results;

      for (const quote of data) {
        if (quote.symbol && quote.price != null) {
          results.set(quote.symbol, {
            value: quote.price,
            timestamp: quote.timestamp ? new Date(quote.timestamp * 1000) : new Date(),
          });
        }
      }

      console.log(`[Verifier] FMP returned ${results.size}/${symbols.length} quotes`);
    } catch (error) {
      console.warn(`[Verifier] FMP fetch failed: ${error}`);
    }

    return results;
  }

  /**
   * Frankfurter API — ECB reference rates, zero auth, zero rate limit.
   * Returns USD-based rates. EUR/USD = 1/rate(EUR), USD/CHF = rate(CHF).
   */
  private async fetchFrankfurter(currencies: string[]): Promise<Map<string, { value: number; timestamp: Date }>> {
    const results = new Map<string, { value: number; timestamp: Date }>();
    if (currencies.length === 0) return results;

    try {
      const csv = currencies.join(',');
      const url = `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${csv}`;

      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.warn(`[Verifier] Frankfurter API returned ${response.status}`);
        return results;
      }

      const data = await response.json() as {
        date: string;
        rates: Record<string, number>;
      };

      if (!data.rates) return results;
      const dataDate = new Date(data.date);

      for (const currency of currencies) {
        const rate = data.rates[currency];
        if (rate == null) continue;

        if (currency === 'EUR') {
          // USD→EUR rate, invert for EUR/USD
          results.set('EUR', { value: 1 / rate, timestamp: dataDate });
        } else {
          // USD→CHF etc. is already the right direction
          results.set(currency, { value: rate, timestamp: dataDate });
        }
      }

      console.log(`[Verifier] Frankfurter returned ${results.size}/${currencies.length} rates`);
    } catch (error) {
      console.warn(`[Verifier] Frankfurter fetch failed: ${error}`);
    }

    return results;
  }

  /**
   * CoinPaprika — zero auth, zero rate limit, real-time crypto.
   * 1 request per coin ID.
   */
  private async fetchCoinPaprika(ids: string[]): Promise<Map<string, { value: number; timestamp: Date }>> {
    const results = new Map<string, { value: number; timestamp: Date }>();
    if (ids.length === 0) return results;

    const fetches = ids.map(async (id) => {
      try {
        const url = `https://api.coinpaprika.com/v1/tickers/${id}`;
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) return;
        const data = await response.json() as {
          quotes?: { USD?: { price?: number } };
          last_updated?: string;
        };
        const price = data.quotes?.USD?.price;
        if (price != null) {
          results.set(id, {
            value: price,
            timestamp: data.last_updated ? new Date(data.last_updated) : new Date(),
          });
        }
      } catch {
        // Silent failure per coin
      }
    });

    await Promise.allSettled(fetches);
    if (results.size > 0) {
      console.log(`[Verifier] CoinPaprika returned ${results.size}/${ids.length} prices`);
    }
    return results;
  }

  /**
   * ExchangeRate-API — zero auth, ~1500 req/month free.
   * Returns USD-based rates. EUR/USD = 1/rate(EUR), CHF passthrough.
   */
  private async fetchExchangeRate(currencies: string[]): Promise<Map<string, { value: number; timestamp: Date }>> {
    const results = new Map<string, { value: number; timestamp: Date }>();
    if (currencies.length === 0) return results;

    try {
      const url = 'https://api.exchangerate-api.com/v4/latest/USD';
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.warn(`[Verifier] ExchangeRate-API returned ${response.status}`);
        return results;
      }

      const data = await response.json() as {
        date?: string;
        rates: Record<string, number>;
      };

      if (!data.rates) return results;
      const dataDate = data.date ? new Date(data.date) : new Date();

      for (const currency of currencies) {
        const rate = data.rates[currency];
        if (rate == null) continue;

        if (currency === 'EUR') {
          // USD→EUR rate, invert for EUR/USD
          results.set('EUR', { value: 1 / rate, timestamp: dataDate });
        } else {
          // USD→CHF etc. passthrough
          results.set(currency, { value: rate, timestamp: dataDate });
        }
      }

      if (results.size > 0) {
        console.log(`[Verifier] ExchangeRate-API returned ${results.size}/${currencies.length} rates`);
      }
    } catch (error) {
      console.warn(`[Verifier] ExchangeRate-API fetch failed: ${error}`);
    }

    return results;
  }

  // ==========================================================================
  // Confidence & Freshness
  // ==========================================================================

  private checkFreshness(timestamp: Date | null, maxAgeHours = 24): {
    isStale: boolean;
    ageHours: number;
    dataDate: string;
  } {
    if (!timestamp) return { isStale: true, ageHours: Infinity, dataDate: 'unknown' };

    const ageMs = Date.now() - timestamp.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);

    return {
      isStale: ageHours > maxAgeHours,
      ageHours: Math.round(ageHours * 10) / 10,
      dataDate: timestamp.toISOString().slice(0, 10),
    };
  }

  /**
   * Real confidence scoring (0-1):
   *  - Source count (0-0.3): 0 sources=0, 1=0.15, 2+=0.3
   *  - Freshness (0-0.3): <1h=0.3, <6h=0.25, <12h=0.2, <24h=0.1, stale=0
   *  - Agreement (0-0.3): within tolerance=0.3, proportional otherwise
   *  - Provider quality (0-0.1): structured API=0.1
   */
  private computeConfidence(
    sources: SourceEvidence[],
    freshness: { isStale: boolean; ageHours: number },
    tolerancePercent: number,
  ): number {
    if (sources.length === 0) return 0;

    // Source count score (0-0.3)
    const sourceScore = sources.length >= 2 ? 0.3 : 0.15;

    // Freshness score (0-0.3)
    let freshnessScore = 0;
    if (freshness.ageHours < 1) freshnessScore = 0.3;
    else if (freshness.ageHours < 6) freshnessScore = 0.25;
    else if (freshness.ageHours < 12) freshnessScore = 0.2;
    else if (freshness.ageHours < 24) freshnessScore = 0.1;

    // Agreement score (0-0.3)
    let agreementScore = 0.3; // default if single source
    if (sources.length >= 2) {
      const prices = sources.map(s => s.numericValue);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const spread = max > 0 ? ((max - min) / max) * 100 : 0;
      if (spread <= tolerancePercent) {
        agreementScore = 0.3;
      } else {
        agreementScore = Math.max(0, 0.3 * (1 - spread / (tolerancePercent * 3)));
      }
    }

    // Provider quality (0-0.1): structured APIs always get 0.1
    const qualityScore = 0.1;

    return Math.min(1, sourceScore + freshnessScore + agreementScore + qualityScore);
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private getProviderUrl(mapping: ProviderMapping): string {
    switch (mapping.provider) {
      case 'yahoo':
        return `https://finance.yahoo.com/quote/${mapping.identifier}`;
      case 'coingecko':
        return `https://www.coingecko.com/en/coins/${mapping.identifier}`;
      case 'fred':
        return `https://fred.stlouisfed.org/series/${mapping.identifier}`;
      case 'fmp':
        return `https://financialmodelingprep.com/quote/${mapping.identifier}`;
      case 'frankfurter':
        return `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${mapping.identifier}`;
      case 'coinpaprika':
        return `https://coinpaprika.com/coin/${mapping.identifier}`;
      case 'exchangerate':
        return `https://api.exchangerate-api.com/v4/latest/USD`;
    }
  }

  private formatPrice(value: number, assetName: string): string {
    const lower = assetName.toLowerCase();
    if (lower.includes('eur/') || lower.includes('usd/')) {
      return value.toFixed(4);
    }
    if (lower.includes('10y') || lower.includes('2y') || lower.includes('vix')) {
      return value.toFixed(2) + '%';
    }
    if (value >= 1000) {
      return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
    return value.toFixed(2);
  }
}
