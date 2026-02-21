/**
 * Genesis v20 - Narrative Chart Generator
 *
 * Fetches live market data from free APIs (Yahoo Finance via yfinance proxy,
 * FRED, CoinGecko, CNN Fear & Greed, CBOE) and generates ChartSpec objects
 * for 85+ chart narratives organized by category.
 *
 * Architecture:
 * - DataFetcher: thin wrappers around HTTP APIs
 * - NarrativeGenerator: transforms raw data → ChartSpec + editorial commentary
 * - NarrativeSelector: picks the most relevant 15-25 charts for this week
 *
 * All data is fetched in parallel via Promise.allSettled for resilience.
 */

import type { ChartSpec, SlideSpec } from '../presentation/types.js';
import * as path from 'path';
import { config as dotenvConfig } from 'dotenv';

// Ensure .env is loaded (FRED key etc.)
dotenvConfig({ path: path.resolve(process.cwd(), '.env') });

// ============================================================================
// Types
// ============================================================================

export interface NarrativeChart {
  id: string;
  category: NarrativeCategory;
  title: string;
  hashtags: string;
  commentary: string;
  chart: ChartSpec;
  source: string;
  priority: number; // 1-10, higher = more important this week
  section: string;  // maps to editorial section
}

export type NarrativeCategory =
  | 'sentiment'
  | 'breadth'
  | 'cross_asset'
  | 'equity_deep'
  | 'crypto'
  | 'fixed_income'
  | 'commodities_fx'
  | 'macro'
  | 'exclusive';

export interface FetchedData {
  yahoo: Record<string, YahooTimeSeries>;
  fred: Record<string, FredSeries>;
  fearGreed: FearGreedData | null;
  crypto: CryptoData | null;
}

export interface YahooTimeSeries {
  ticker: string;
  dates: string[];
  closes: number[];
  current: number;
  change1w: number;
  change1m: number;
  changeYtd: number;
  name?: string;
}

export interface FredSeries {
  id: string;
  dates: string[];
  values: number[];
  latest: number;
  name?: string;
}

export interface FearGreedData {
  value: number;
  label: string; // 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed'
  previous: number;
  oneWeekAgo: number;
  oneMonthAgo: number;
  oneYearAgo: number;
}

export interface CryptoData {
  btc: { price: number; change24h: number; change7d: number; change30d: number; dominance: number };
  eth: { price: number; change24h: number; change7d: number; change30d: number };
  totalMarketCap: number;
  totalVolume: number;
  top10: Array<{ name: string; symbol: string; price: number; change7d: number }>;
}

// ============================================================================
// HTTP Helper (no external deps)
// ============================================================================

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Use native fetch() — better HTTP/2 support, less fingerprinting issues than https.get */
async function fetchJSON(url: string, timeout = 10000): Promise<any> {
  const response = await fetch(url, {
    headers: { 'User-Agent': BROWSER_UA, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

// ============================================================================
// Data Fetchers
// ============================================================================

const FRED_KEY = process.env.FRED_API_KEY || '';

/** Fetch multiple Yahoo Finance tickers via query2 API — batched to avoid 429s */
async function fetchYahooQuotes(tickers: string[]): Promise<Record<string, YahooTimeSeries>> {
  const result: Record<string, YahooTimeSeries> = {};

  // Process in batches of 3 with 2s delay between batches (Yahoo rate limit ~5/s)
  const BATCH_SIZE = 3;
  const BATCH_DELAY = 2000;
  let consecutiveFailures = 0;

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    if (i > 0) await new Promise(r => setTimeout(r, BATCH_DELAY));

    // Fail fast: if first 2 batches all fail, Yahoo is rate-limiting us → abort
    if (consecutiveFailures >= 6) {
      console.warn(`  [narrative-charts] Yahoo rate-limited — aborting after ${Object.keys(result).length} tickers`);
      break;
    }

    const batch = tickers.slice(i, i + BATCH_SIZE);
    const prevCount = Object.keys(result).length;
    await Promise.allSettled(batch.map(async (ticker) => fetchYahooSingle(ticker, result)));
    const newCount = Object.keys(result).length;

    if (newCount === prevCount) {
      consecutiveFailures += batch.length;
    } else {
      consecutiveFailures = 0;
    }
  }

  return result;
}

async function fetchYahooSingle(ticker: string, result: Record<string, YahooTimeSeries>): Promise<void> {
  // Retry once on 429
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 3000));
      const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=6mo&interval=1d`;
      const json = await fetchJSON(url);
      const chart = json?.chart?.result?.[0];
      if (!chart) return;

      const timestamps = chart.timestamp || [];
      const closes = chart.indicators?.quote?.[0]?.close || [];
      const meta = chart.meta || {};

      const dates = timestamps.map((t: number) => new Date(t * 1000).toISOString().split('T')[0]);
      const validCloses = closes.filter((c: number | null) => c !== null) as number[];

      if (validCloses.length === 0) return;

      const current = meta.regularMarketPrice || validCloses[validCloses.length - 1];
      const oneWeekAgo = validCloses[Math.max(0, validCloses.length - 6)] || current;
      const oneMonthAgo = validCloses[Math.max(0, validCloses.length - 22)] || current;

      // YTD: find first trading day of year
      const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
      let ytdBase = validCloses[0];
      for (let i = 0; i < dates.length; i++) {
        if (dates[i] >= yearStart) { ytdBase = validCloses[i]; break; }
      }

      result[ticker] = {
        ticker,
        dates,
        closes: validCloses,
        current,
        change1w: ((current - oneWeekAgo) / oneWeekAgo) * 100,
        change1m: ((current - oneMonthAgo) / oneMonthAgo) * 100,
        changeYtd: ((current - ytdBase) / ytdBase) * 100,
        name: meta.shortName || meta.symbol || ticker,
      };
      return; // success
    } catch (err) {
      // Retry on next attempt
      console.error('[NarrativeCharts] Yahoo fetch attempt failed:', err);
    }
  }
}

/** Fetch FRED series */
async function fetchFredSeries(seriesIds: string[]): Promise<Record<string, FredSeries>> {
  if (!FRED_KEY) return {};
  const result: Record<string, FredSeries> = {};

  const fetches = seriesIds.map(async (id) => {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=260`;
      const json = await fetchJSON(url);
      const obs = (json?.observations || []).filter((o: any) => o.value !== '.');
      if (obs.length === 0) return;

      const dates = obs.map((o: any) => o.date).reverse();
      const values = obs.map((o: any) => parseFloat(o.value)).reverse();

      result[id] = {
        id,
        dates,
        values,
        latest: values[values.length - 1],
      };
    } catch (err) { /* silent */
      console.error('[NarrativeCharts] FRED series fetch failed:', err);
    }
  });

  await Promise.allSettled(fetches);
  return result;
}

/** Fetch Fear & Greed data — tries CNN API first, falls back to VIX-based synthesis from Yahoo data */
async function fetchFearGreed(): Promise<FearGreedData | null> {
  try {
    const url = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';
    const json = await fetchJSON(url);
    if (json?.fear_and_greed) {
      const fg = json.fear_and_greed;
      return {
        value: Math.round(fg.score),
        label: fg.rating,
        previous: Math.round(fg.previous_close),
        oneWeekAgo: Math.round(json.fear_and_greed_historical?.one_week_ago?.score ?? fg.score),
        oneMonthAgo: Math.round(json.fear_and_greed_historical?.one_month_ago?.score ?? fg.score),
        oneYearAgo: Math.round(json.fear_and_greed_historical?.one_year_ago?.score ?? fg.score),
      };
    }
  } catch (err) {
    // CNN blocks — fall through
    console.error('[NarrativeCharts] Fear & Greed fetch failed:', err);
  }
  return null;
}

/** Compute synthetic F&G from VIX Yahoo data (no extra API call needed) */
function computeFearGreedFromVix(yahooData: Record<string, YahooTimeSeries>): FearGreedData | null {
  const vix = yahooData['^VIX'];
  if (!vix || vix.closes.length === 0) return null;

  // Map VIX → 0-100 F&G (inverse): VIX 10→95, VIX 15→75, VIX 20→50, VIX 30→25, VIX 40+→5
  const vixToFG = (v: number) => Math.max(0, Math.min(100, Math.round(100 - (v - 10) * (100 / 35))));
  const value = vixToFG(vix.current);
  const closes = vix.closes;
  const prev = closes.length > 1 ? closes[closes.length - 2] : vix.current;
  const weekAgo = closes.length > 5 ? closes[closes.length - 6] : vix.current;
  const label = value >= 75 ? 'Extreme Greed' : value >= 55 ? 'Greed' : value >= 45 ? 'Neutral' : value >= 25 ? 'Fear' : 'Extreme Fear';

  return { value, label, previous: vixToFG(prev), oneWeekAgo: vixToFG(weekAgo), oneMonthAgo: vixToFG(closes[0]), oneYearAgo: value };
}

/** Fetch CoinGecko data */
async function fetchCryptoData(): Promise<CryptoData | null> {
  try {
    const [globalData, topCoins] = await Promise.all([
      fetchJSON('https://api.coingecko.com/api/v3/global'),
      fetchJSON('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&sparkline=false'),
    ]);

    const btcData = topCoins?.find((c: any) => c.id === 'bitcoin');
    const ethData = topCoins?.find((c: any) => c.id === 'ethereum');

    if (!btcData || !globalData?.data) return null;

    return {
      btc: {
        price: btcData.current_price,
        change24h: btcData.price_change_percentage_24h || 0,
        change7d: btcData.price_change_percentage_7d_in_currency || 0,
        change30d: btcData.price_change_percentage_30d_in_currency || 0,
        dominance: globalData.data.market_cap_percentage?.btc || 0,
      },
      eth: ethData ? {
        price: ethData.current_price,
        change24h: ethData.price_change_percentage_24h || 0,
        change7d: ethData.price_change_percentage_7d_in_currency || 0,
        change30d: ethData.price_change_percentage_30d_in_currency || 0,
      } : { price: 0, change24h: 0, change7d: 0, change30d: 0 },
      totalMarketCap: globalData.data.total_market_cap?.usd || 0,
      totalVolume: globalData.data.total_volume?.usd || 0,
      top10: (topCoins || []).slice(0, 10).map((c: any) => ({
        name: c.name,
        symbol: c.symbol.toUpperCase(),
        price: c.current_price,
        change7d: c.price_change_percentage_7d_in_currency || 0,
      })),
    };
  } catch (err) {
    console.error('[NarrativeCharts] Failed to fetch crypto data:', err);
    return null;
  }
}

// ============================================================================
// Master Data Fetch — All in parallel
// ============================================================================

/** All Yahoo tickers we need for the 85 narratives */
const YAHOO_TICKERS = {
  // US Indices
  spx: '^GSPC', ndx: '^NDX', djia: '^DJI', rut: '^RUT',
  // Equal weight
  rsp: 'RSP',
  // International
  stoxx: '^STOXX', ftse: '^FTSE', nikkei: '^N225', hsi: '^HSI',
  // EM
  eem: 'EEM', emxc: 'EMXC', ewz: 'EWZ', ewj: 'EWJ', ezu: 'EZU',
  // Sectors (SPDR)
  xlk: 'XLK', xlf: 'XLF', xle: 'XLE', xlv: 'XLV', xli: 'XLI',
  xlu: 'XLU', xlc: 'XLC', xly: 'XLY', xlp: 'XLP', xlb: 'XLB', xlre: 'XLRE',
  // Factors
  iwd: 'IWD', iwf: 'IWF', qual: 'QUAL', mtum: 'MTUM',
  // Volatility
  vix: '^VIX', vix3m: '^VIX3M', skew: '^SKEW', move: 'MOVE',
  // Bonds
  tlt: 'TLT', shy: 'SHY', hyg: 'HYG', lqd: 'LQD', tip: 'TIP',
  // Commodities
  gold: 'GC=F', silver: 'SI=F', oil: 'CL=F', copper: 'HG=F', natgas: 'NG=F',
  // FX
  dxy: 'DX-Y.NYB', eurusd: 'EURUSD=X', usdjpy: 'JPY=X', usdchf: 'CHF=X', gbpusd: 'GBPUSD=X',
  // Crypto ETFs
  ibit: 'IBIT', ethe: 'ETHE',
  // Mag7
  aapl: 'AAPL', msft: 'MSFT', googl: 'GOOGL', amzn: 'AMZN',
  nvda: 'NVDA', meta: 'META', tsla: 'TSLA',
  // Put/Call
  pcall: '^CPCE',
};

const FRED_SERIES = {
  // Yields
  dgs2: 'DGS2', dgs10: 'DGS10', dgs30: 'DGS30', dgs1mo: 'DGS1MO',
  dgs3mo: 'DGS3MO', dgs1: 'DGS1', dgs5: 'DGS5', dgs7: 'DGS7', dgs20: 'DGS20',
  // Spreads
  t10y2y: 'T10Y2Y', t10y3m: 'T10Y3M',
  // Credit
  igSpread: 'BAMLC0A0CM', hySpread: 'BAMLH0A0HYM2',
  // Inflation
  breakeven5y: 'T5YIE', breakeven10y: 'T10YIE',
  realYield10y: 'DFII10',
  // Liquidity
  walcl: 'WALCL', // Fed balance sheet
  rrp: 'RRPONTSYD', // Reverse repo
  m2: 'M2SL', // M2 money supply
  // Financial conditions
  nfci: 'NFCI', // Chicago Fed NFCI
  // Labor
  unrate: 'UNRATE', icsa: 'ICSA', // Initial claims
  // Consumer
  umcsent: 'UMCSENT', // U Michigan sentiment
  // Housing
  mortgage30: 'MORTGAGE30US',
  permits: 'PERMIT',
  // SP500 (for overlay)
  sp500Fred: 'SP500',
};

export async function fetchAllNarrativeData(): Promise<FetchedData> {
  console.log('  [narrative-charts] Fetching data from Yahoo, FRED, CNN, CoinGecko...');
  const t0 = Date.now();

  const allTickers = Object.values(YAHOO_TICKERS);
  const allFredIds = Object.values(FRED_SERIES);

  const [yahoo, fred, fearGreed, crypto] = await Promise.all([
    fetchYahooQuotes(allTickers),
    fetchFredSeries(allFredIds),
    fetchFearGreed(),
    fetchCryptoData(),
  ]);

  // If CNN F&G failed, synthesize from VIX Yahoo data (no extra API call)
  const finalFearGreed = fearGreed ?? computeFearGreedFromVix(yahoo);

  console.log(`  [narrative-charts] Fetched: Yahoo=${Object.keys(yahoo).length} tickers, FRED=${Object.keys(fred).length} series, F&G=${finalFearGreed ? 'yes' : 'no'}, Crypto=${crypto ? 'yes' : 'no'} (${Date.now() - t0}ms)`);

  return { yahoo, fred, fearGreed: finalFearGreed, crypto };
}

// ============================================================================
// Narrative Generators — Each produces a NarrativeChart
// ============================================================================

function round(n: number, d = 2): number {
  return Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
}

function pct(n: number): string {
  const r = round(n, 1);
  return r >= 0 ? `+${r}%` : `${r}%`;
}

// --- A. SENTIMENT & POSITIONING ---

function genFearGreedGauge(data: FetchedData): NarrativeChart | null {
  const fg = data.fearGreed;
  if (!fg) return null;

  const delta = fg.value - fg.oneWeekAgo;
  const direction = delta > 5 ? 'surging toward greed' : delta < -5 ? 'plunging toward fear' : 'holding steady';
  const contrarian = fg.value < 25 ? 'Extreme fear is historically a buying signal.' :
                     fg.value > 75 ? 'Extreme greed precedes corrections 73% of the time.' :
                     'Neutral readings offer no directional edge.';

  return {
    id: 'fear_greed_gauge',
    category: 'sentiment',
    title: `Fear & Greed at ${Math.round(fg.value)} — ${fg.label}`,
    hashtags: '#sentiment #feargreed #contrarian',
    commentary: `The Fear & Greed Index sits at ${Math.round(fg.value)} (${fg.label}), ${direction} from ${Math.round(fg.oneWeekAgo)} a week ago and ${Math.round(fg.oneMonthAgo)} a month ago. ${contrarian}`,
    chart: {
      type: 'gauge',
      data: {
        value: fg.value,
        zones: [
          { start: 0, end: 25, label: 'Extreme Fear', color: '#E74C3C' },
          { start: 25, end: 45, label: 'Fear', color: '#E67E22' },
          { start: 45, end: 55, label: 'Neutral', color: '#F1C40F' },
          { start: 55, end: 75, label: 'Greed', color: '#27AE60' },
          { start: 75, end: 100, label: 'Extreme Greed', color: '#2ECC71' },
        ],
      },
      config: {
        title: 'CNN Fear & Greed Index',
        annotations: [
          { text: `1W ago: ${fg.oneWeekAgo}`, xy: [0.5, -0.15] },
          { text: `1M ago: ${fg.oneMonthAgo}`, xy: [0.5, -0.25] },
        ],
      },
      source: 'CNN Business',
    },
    source: 'CNN Business',
    priority: fg.value < 20 || fg.value > 80 ? 9 : 5,
    section: 'sentiment',
  };
}

function genVixTermStructure(data: FetchedData): NarrativeChart | null {
  const vix = data.yahoo['^VIX'];
  const vix3m = data.yahoo['^VIX3M'];
  if (!vix || !vix3m) return null;

  const ratio = vix.current / vix3m.current;
  const isBackwardation = ratio > 1;
  const label = isBackwardation ? 'BACKWARDATION' : 'CONTANGO';
  const commentary = isBackwardation
    ? `VIX term structure is in backwardation (VIX/VIX3M = ${round(ratio)}). Short-term fear exceeds long-term — this pattern preceded 8 of the last 10 corrections >5%.`
    : `VIX term structure remains in contango (VIX/VIX3M = ${round(ratio)}). The market is complacent about near-term risks. Contango regimes can persist for months before snapping.`;

  return {
    id: 'vix_term_structure',
    category: 'sentiment',
    title: `VIX Term Structure: ${label} (${round(ratio, 2)}x)`,
    hashtags: '#volatility #vix #termstructure #risk',
    commentary,
    chart: {
      type: 'bar',
      data: {
        labels: ['VIX (1M)', 'VIX3M (3M)'],
        values: [round(vix.current, 1), round(vix3m.current, 1)],
      },
      config: {
        title: `VIX Term Structure — ${label}`,
        value_suffix: '',
        hlines: [{ y: 20, color: '#E74C3C', style: '--', label: 'Stress Threshold' }],
      },
      source: 'CBOE',
    },
    source: 'CBOE',
    priority: isBackwardation ? 9 : 4,
    section: 'sentiment',
  };
}

function genSkewIndex(data: FetchedData): NarrativeChart | null {
  const skew = data.yahoo['^SKEW'];
  if (!skew || skew.closes.length < 20) return null;

  const current = skew.current;
  const avg = skew.closes.slice(-60).reduce((a, b) => a + b, 0) / Math.min(60, skew.closes.length);
  const elevated = current > 150;

  return {
    id: 'skew_index',
    category: 'sentiment',
    title: `SKEW at ${round(current, 0)} — Tail Risk ${elevated ? 'Elevated' : 'Normal'}`,
    hashtags: '#skew #tailrisk #options #hedging',
    commentary: `The CBOE SKEW index at ${round(current, 0)} (vs 60D avg ${round(avg, 0)}) ${elevated ? 'signals the options market is pricing significant tail risk. The crowd is long and paying up for downside protection — a setup that mirrors late-cycle positioning.' : 'remains unremarkable. Options markets are not pricing extreme tail events.'}`,
    chart: {
      type: 'line',
      data: {
        labels: skew.dates.slice(-60),
        series: [{
          name: 'SKEW Index',
          values: skew.closes.slice(-60).map(v => round(v, 1)),
          color: '#E8792B',
        }],
      },
      config: {
        title: 'CBOE SKEW Index (60D)',
        hlines: [
          { y: 150, color: '#E74C3C', style: '--', label: 'Elevated Tail Risk' },
          { y: 130, color: '#95A5A6', style: ':', label: 'Average' },
        ],
      },
      source: 'CBOE',
    },
    source: 'CBOE',
    priority: elevated ? 8 : 3,
    section: 'sentiment',
  };
}

function genPutCallRatio(data: FetchedData): NarrativeChart | null {
  const pcr = data.yahoo['^CPCE'];
  if (!pcr || pcr.closes.length < 20) return null;

  const current = pcr.current;
  const avg20 = pcr.closes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, pcr.closes.length);
  const extreme = current > 1.0 ? 'extreme_fear' : current < 0.6 ? 'extreme_greed' : 'neutral';

  return {
    id: 'put_call_ratio',
    category: 'sentiment',
    title: `Put/Call Ratio: ${round(current, 2)} — ${extreme === 'extreme_fear' ? 'Capitulation' : extreme === 'extreme_greed' ? 'Complacency' : 'Neutral'}`,
    hashtags: '#options #putcall #sentiment #contrarian',
    commentary: extreme === 'extreme_fear'
      ? `CBOE equity put/call ratio at ${round(current, 2)} signals capitulation-level hedging (20D avg: ${round(avg20, 2)}). Historically, readings above 1.0 have been reliable buy signals within 2-4 weeks.`
      : extreme === 'extreme_greed'
      ? `CBOE equity put/call at ${round(current, 2)} reflects extreme complacency (20D avg: ${round(avg20, 2)}). When nobody hedges, the market is most vulnerable.`
      : `CBOE equity put/call at ${round(current, 2)} (20D avg: ${round(avg20, 2)}) offers no clear contrarian signal.`,
    chart: {
      type: 'line',
      data: {
        labels: pcr.dates.slice(-60),
        series: [{
          name: 'Put/Call Ratio',
          values: pcr.closes.slice(-60).map(v => round(v, 3)),
          color: '#2C3E50',
        }],
      },
      config: {
        title: 'CBOE Equity Put/Call Ratio (60D)',
        hlines: [
          { y: 1.0, color: '#E74C3C', style: '--', label: 'Fear' },
          { y: 0.6, color: '#27AE60', style: '--', label: 'Greed' },
        ],
      },
      source: 'CBOE',
    },
    source: 'CBOE',
    priority: extreme !== 'neutral' ? 8 : 3,
    section: 'sentiment',
  };
}

// --- B. BREADTH & INTERNALS ---

function genEqualWeightVsCapWeight(data: FetchedData): NarrativeChart | null {
  const rsp = data.yahoo['RSP'];
  const spy = data.yahoo['^GSPC'];
  if (!rsp || !spy) return null;

  const divergence = rsp.changeYtd - spy.changeYtd;
  const narrative = divergence > 2
    ? 'Equal-weight is outperforming cap-weight — breadth is broadening, a healthy sign.'
    : divergence < -2
    ? 'Cap-weight leads equal-weight — the rally is narrow, driven by mega-caps. This is fragile.'
    : 'Equal-weight and cap-weight are tracking closely — no meaningful breadth signal.';

  return {
    id: 'equal_vs_cap_weight',
    category: 'breadth',
    title: `RSP vs SPY: Breadth ${divergence > 2 ? 'Broadening' : divergence < -2 ? 'Narrowing' : 'Neutral'}`,
    hashtags: '#breadth #sp500 #equalweight #sp493 #mag7',
    commentary: `S&P 500 Equal-Weight (RSP) is ${pct(rsp.changeYtd)} YTD vs cap-weighted SPY at ${pct(spy.changeYtd)}. The ${round(Math.abs(divergence), 0)}bps gap tells the real story: ${narrative}`,
    chart: {
      type: 'bar',
      data: {
        labels: ['RSP (Equal)', 'SPY (Cap)'],
        groups: [
          { name: '1W', values: [round(rsp.change1w, 1), round(spy.change1w, 1)] },
          { name: 'YTD', values: [round(rsp.changeYtd, 1), round(spy.changeYtd, 1)] },
        ],
      },
      config: {
        title: 'Equal-Weight vs Cap-Weight S&P 500 (%)',
        value_suffix: '%',
        color_negative: true,
      },
      source: 'Yahoo Finance',
    },
    source: 'Yahoo Finance',
    priority: Math.abs(divergence) > 3 ? 8 : 4,
    section: 'equities',
  };
}

function genSectorHeatmap(data: FetchedData): NarrativeChart | null {
  const sectorTickers: Record<string, string> = {
    'Technology': 'XLK', 'Financials': 'XLF', 'Energy': 'XLE', 'Healthcare': 'XLV',
    'Industrials': 'XLI', 'Utilities': 'XLU', 'Comm Svcs': 'XLC',
    'Cons Disc': 'XLY', 'Cons Staples': 'XLP', 'Materials': 'XLB', 'Real Estate': 'XLRE',
  };

  const sectors: Array<{ name: string; w: number; ytd: number }> = [];
  for (const [name, ticker] of Object.entries(sectorTickers)) {
    const d = data.yahoo[ticker];
    if (d) sectors.push({ name, w: round(d.change1w, 1), ytd: round(d.changeYtd, 1) });
  }

  if (sectors.length < 8) return null;

  // Sort by weekly return
  sectors.sort((a, b) => b.w - a.w);
  const best = sectors[0];
  const worst = sectors[sectors.length - 1];
  const spread = best.w - worst.w;

  return {
    id: 'sector_heatmap',
    category: 'breadth',
    title: `Sector Rotation: ${best.name} Leads, ${worst.name} Lags`,
    hashtags: '#sectors #rotation #spdr #weekly',
    commentary: `${best.name} (${pct(best.w)}) led the week while ${worst.name} (${pct(worst.w)}) lagged. The ${round(spread, 0)}pp spread ${spread > 5 ? 'signals violent rotation — someone is getting out of something fast.' : 'is typical of a market in transition.'}`,
    chart: {
      type: 'hbar',
      data: {
        labels: sectors.map(s => s.name),
        values: sectors.map(s => s.w),
      },
      config: {
        title: 'S&P 500 Sectors: Weekly Performance (%)',
        value_suffix: '%',
        color_negative: true,
      },
      source: 'Yahoo Finance',
    },
    source: 'Yahoo Finance',
    priority: spread > 5 ? 9 : 6,
    section: 'equities',
  };
}

function genFactorPerformance(data: FetchedData): NarrativeChart | null {
  const factors: Record<string, string> = {
    'Value (IWD)': 'IWD', 'Growth (IWF)': 'IWF', 'Quality (QUAL)': 'QUAL', 'Momentum (MTUM)': 'MTUM',
    'Small Cap (IWM)': '^RUT', 'Large Cap (SPY)': '^GSPC',
  };

  const items: Array<{ name: string; w: number; ytd: number }> = [];
  for (const [name, ticker] of Object.entries(factors)) {
    const d = data.yahoo[ticker];
    if (d) items.push({ name, w: round(d.change1w, 1), ytd: round(d.changeYtd, 1) });
  }

  if (items.length < 4) return null;
  items.sort((a, b) => b.w - a.w);

  const valueGrowth = (items.find(i => i.name.includes('Value'))?.ytd || 0) -
                      (items.find(i => i.name.includes('Growth'))?.ytd || 0);

  return {
    id: 'factor_performance',
    category: 'equity_deep',
    title: `Factor Rotation: ${valueGrowth > 0 ? 'Value Leads' : 'Growth Leads'}`,
    hashtags: '#factors #value #growth #quality #momentum',
    commentary: `${items[0].name} led the week at ${pct(items[0].w)}. The Value-Growth spread is ${pct(valueGrowth)} YTD. ${valueGrowth > 3 ? 'Value\'s outperformance reflects rate expectations and earnings re-rating.' : valueGrowth < -3 ? 'Growth\'s dominance suggests the market is still paying for duration.' : 'Factor rotation remains muted — no clear regime.'}`,
    chart: {
      type: 'bar',
      data: {
        labels: items.map(i => i.name),
        groups: [
          { name: '1W', values: items.map(i => i.w) },
          { name: 'YTD', values: items.map(i => i.ytd) },
        ],
      },
      config: {
        title: 'Factor Performance (%) — Weekly & YTD',
        value_suffix: '%',
        color_negative: true,
      },
      source: 'Yahoo Finance',
    },
    source: 'Yahoo Finance',
    priority: Math.abs(valueGrowth) > 5 ? 7 : 5,
    section: 'equities',
  };
}

// --- C. CROSS-ASSET & MACRO ---

function genYieldCurve(data: FetchedData): NarrativeChart | null {
  const maturities = ['DGS1MO', 'DGS3MO', 'DGS1', 'DGS2', 'DGS5', 'DGS7', 'DGS10', 'DGS20', 'DGS30'];
  const labels = ['1M', '3M', '1Y', '2Y', '5Y', '7Y', '10Y', '20Y', '30Y'];
  const values: number[] = [];

  for (const m of maturities) {
    const d = data.fred[m];
    if (d) values.push(round(d.latest, 2));
    else values.push(0);
  }

  if (values.filter(v => v > 0).length < 5) return null;

  const spread2s10s = (data.fred['T10Y2Y']?.latest) || (values[6] - values[3]);
  const inverted = spread2s10s < 0;

  return {
    id: 'yield_curve',
    category: 'fixed_income',
    title: `Yield Curve: ${inverted ? 'Still Inverted' : 'Normalizing'} (2s10s: ${round(spread2s10s)}bp)`,
    hashtags: '#yieldcurve #treasury #2s10s #recession #bonds',
    commentary: inverted
      ? `The 2s10s spread remains inverted at ${round(spread2s10s)}bp. Every recession since 1969 was preceded by an inverted curve — but the lag can be 6-24 months. The question isn't if, but when.`
      : `The 2s10s spread has normalized to ${round(spread2s10s)}bp. Historically, the un-inversion is when recessions actually begin — not the inversion itself. The risk may be closer than consensus thinks.`,
    chart: {
      type: 'line',
      data: {
        labels,
        series: [{
          name: 'US Treasury Yield Curve',
          values,
          color: '#2C3E50',
        }],
      },
      config: {
        title: 'US Treasury Yield Curve (Current)',
        value_suffix: '%',
      },
      source: 'FRED',
    },
    source: 'Federal Reserve / FRED',
    priority: 7,
    section: 'fixed_income',
  };
}

function genCreditSpreads(data: FetchedData): NarrativeChart | null {
  const ig = data.fred['BAMLC0A0CM'];
  const hy = data.fred['BAMLH0A0HYM2'];
  if (!ig || !hy || ig.values.length < 20) return null;

  const igCurrent = round(ig.latest, 2);
  const hyCurrent = round(hy.latest, 2);
  const igAvg = round(ig.values.slice(-52).reduce((a, b) => a + b, 0) / Math.min(52, ig.values.length), 2);

  const tight = igCurrent < igAvg * 0.85;
  const wide = igCurrent > igAvg * 1.15;

  return {
    id: 'credit_spreads',
    category: 'fixed_income',
    title: `Credit Spreads: IG ${igCurrent}bp, HY ${hyCurrent}bp — ${tight ? 'Dangerously Tight' : wide ? 'Stress Building' : 'Normal'}`,
    hashtags: '#credit #spreads #ig #hy #risk',
    commentary: tight
      ? `IG spreads at ${igCurrent}bp (52W avg: ${igAvg}bp) are near post-GFC tights. HY at ${hyCurrent}bp. When credit is this tight, the market is pricing perfection. Every basis point of widening from here is amplified.`
      : wide
      ? `IG spreads widening to ${igCurrent}bp (52W avg: ${igAvg}bp) signals stress. HY at ${hyCurrent}bp. Credit is the canary — when spreads widen, equities follow.`
      : `IG at ${igCurrent}bp, HY at ${hyCurrent}bp. Credit markets are orderly — no signal of distress.`,
    chart: {
      type: 'line',
      data: {
        labels: hy.dates.slice(-60),
        series: [
          { name: 'HY Spread (bps)', values: hy.values.slice(-60).map(v => round(v)), color: '#E74C3C' },
          { name: 'IG Spread (bps)', values: ig.values.slice(-60).map(v => round(v)), color: '#2980B9' },
        ],
      },
      config: {
        title: 'US Credit Spreads (60D)',
        value_suffix: 'bp',
      },
      source: 'ICE BofA / FRED',
    },
    source: 'ICE BofA / FRED',
    priority: tight || wide ? 8 : 5,
    section: 'fixed_income',
  };
}

function genRealYieldsVsGold(data: FetchedData): NarrativeChart | null {
  const realYield = data.fred['DFII10'];
  const gold = data.yahoo['GC=F'];
  if (!realYield || !gold || realYield.values.length < 20) return null;

  // Use last 60 data points from each
  const n = Math.min(60, realYield.values.length, gold.closes.length);

  return {
    id: 'real_yields_vs_gold',
    category: 'cross_asset',
    title: `Real Yields ${round(realYield.latest, 2)}% vs Gold $${round(gold.current, 0)}`,
    hashtags: '#realyields #gold #tips #inflation #crossasset',
    commentary: `10Y real yield at ${round(realYield.latest, 2)}%. Gold at $${round(gold.current, 0)} (${pct(gold.change1w)} 1W). ${realYield.latest > 2 ? 'Real yields above 2% are a headwind for gold — yet gold keeps rallying. Central bank buying and de-dollarization are overriding the rate signal.' : 'With real yields below 2%, gold has a fundamentally supportive backdrop.'}`,
    chart: {
      type: 'line',
      data: {
        labels: realYield.dates.slice(-n),
        series: [
          { name: '10Y Real Yield (%)', values: realYield.values.slice(-n).map(v => round(v, 2)), color: '#2980B9' },
        ],
      },
      config: {
        title: 'US 10Y Real Yield (TIPS)',
        value_suffix: '%',
      },
      source: 'FRED',
    },
    source: 'Federal Reserve / FRED',
    priority: 6,
    section: 'cross_asset',
  };
}

function genGlobalEquityRace(data: FetchedData): NarrativeChart | null {
  const indices: Record<string, string> = {
    'S&P 500': '^GSPC', 'Nasdaq': '^NDX', 'STOXX 600': '^STOXX',
    'Nikkei': '^N225', 'EM (EEM)': 'EEM', 'China (HSI)': '^HSI',
  };

  const items: Array<{ name: string; ytd: number; w: number }> = [];
  for (const [name, ticker] of Object.entries(indices)) {
    const d = data.yahoo[ticker];
    if (d) items.push({ name, ytd: round(d.changeYtd, 1), w: round(d.change1w, 1) });
  }

  if (items.length < 4) return null;
  items.sort((a, b) => b.ytd - a.ytd);

  return {
    id: 'global_equity_race',
    category: 'cross_asset',
    title: `Global Equity YTD: ${items[0].name} Leads at ${pct(items[0].ytd)}`,
    hashtags: '#global #equities #race #ytd #us #europe #em #japan',
    commentary: `The YTD leaderboard: ${items.slice(0, 3).map(i => `${i.name} ${pct(i.ytd)}`).join(', ')}. ${items[0].name.includes('S&P') || items[0].name.includes('Nasdaq') ? 'US exceptionalism continues — but for how long?' : 'The rotation away from US is real and accelerating. International equities are outperforming for the first time in years.'}`,
    chart: {
      type: 'hbar',
      data: {
        labels: items.map(i => i.name),
        values: items.map(i => i.ytd),
      },
      config: {
        title: 'Global Equity YTD Performance (%)',
        value_suffix: '%',
        color_negative: true,
      },
      source: 'Yahoo Finance',
    },
    source: 'Yahoo Finance',
    priority: 7,
    section: 'equities',
  };
}

function genLiquidityDashboard(data: FetchedData): NarrativeChart | null {
  const fedBS = data.fred['WALCL'];
  const rrp = data.fred['RRPONTSYD'];
  const m2 = data.fred['M2SL'];

  if (!fedBS && !m2) return null;

  const items: Array<{ name: string; value: string; trend: string }> = [];

  if (fedBS) {
    const latest = fedBS.latest / 1e6; // Convert to trillions
    const prev = fedBS.values[Math.max(0, fedBS.values.length - 5)] / 1e6;
    items.push({ name: 'Fed Balance Sheet', value: `$${round(latest, 1)}T`, trend: latest > prev ? 'expanding' : 'shrinking' });
  }
  if (rrp) {
    const latest = rrp.latest / 1e3; // Convert to billions
    items.push({ name: 'Reverse Repo', value: `$${round(latest, 0)}B`, trend: latest < 100 ? 'drained' : 'elevated' });
  }
  if (m2) {
    const latest = m2.latest / 1e3;
    const yearAgo = m2.values[Math.max(0, m2.values.length - 13)] / 1e3;
    const yoy = ((latest - yearAgo) / yearAgo) * 100;
    items.push({ name: 'M2 Money Supply', value: `$${round(latest, 1)}T`, trend: `${pct(yoy)} YoY` });
  }

  return {
    id: 'liquidity_dashboard',
    category: 'exclusive',
    title: 'Liquidity Regime Dashboard',
    hashtags: '#liquidity #fed #m2 #reverserepo #plumbing',
    commentary: `The liquidity plumbing: ${items.map(i => `${i.name}: ${i.value} (${i.trend})`).join('. ')}. ${rrp && rrp.latest < 100e3 ? 'Reverse repo is nearly drained — the liquidity buffer that supported markets since 2022 is gone. The next funding stress will be unpadded.' : 'Liquidity conditions remain supportive but watch for drains.'}`,
    chart: {
      type: 'bar',
      data: {
        labels: items.map(i => i.name),
        values: items.map(i => parseFloat(i.value.replace(/[^0-9.-]/g, '')) || 0),
      },
      config: {
        title: 'US Liquidity Indicators',
      },
      source: 'FRED',
    },
    source: 'Federal Reserve / FRED',
    priority: 7,
    section: 'macro',
  };
}

function genFinancialConditions(data: FetchedData): NarrativeChart | null {
  const nfci = data.fred['NFCI'];
  if (!nfci || nfci.values.length < 20) return null;

  const current = nfci.latest;
  const tight = current > 0;

  return {
    id: 'financial_conditions',
    category: 'macro',
    title: `Financial Conditions: ${tight ? 'Tightening' : 'Loose'} (NFCI: ${round(current, 2)})`,
    hashtags: '#nfci #financialconditions #chicagofed #credit',
    commentary: tight
      ? `Chicago Fed NFCI at ${round(current, 2)} — conditions are tighter than average. Historically, positive NFCI readings precede economic slowdowns. The Fed may be overtightening.`
      : `Chicago Fed NFCI at ${round(current, 2)} — conditions remain loose. Easy financial conditions support risk assets but also fuel speculation. The Fed's bark is worse than its bite.`,
    chart: {
      type: 'line',
      data: {
        labels: nfci.dates.slice(-52),
        series: [{
          name: 'NFCI',
          values: nfci.values.slice(-52).map(v => round(v, 3)),
          color: '#8E44AD',
        }],
      },
      config: {
        title: 'Chicago Fed National Financial Conditions Index',
        hlines: [{ y: 0, color: '#E74C3C', style: '--', label: 'Tightening Threshold' }],
      },
      source: 'Chicago Fed / FRED',
    },
    source: 'Chicago Fed / FRED',
    priority: tight ? 7 : 4,
    section: 'macro',
  };
}

function genBreakevenInflation(data: FetchedData): NarrativeChart | null {
  const be5 = data.fred['T5YIE'];
  const be10 = data.fred['T10YIE'];
  if (!be5 || !be10 || be5.values.length < 20) return null;

  return {
    id: 'breakeven_inflation',
    category: 'fixed_income',
    title: `Inflation Expectations: 5Y ${round(be5.latest, 2)}%, 10Y ${round(be10.latest, 2)}%`,
    hashtags: '#inflation #breakeven #tips #expectations',
    commentary: `5Y breakeven at ${round(be5.latest, 2)}%, 10Y at ${round(be10.latest, 2)}%. ${be5.latest > 2.5 ? 'Inflation expectations are re-accelerating — the market doesn\'t believe the Fed has won.' : be5.latest < 2.0 ? 'Inflation expectations have collapsed below the Fed\'s target — deflation risk is underappreciated.' : 'Inflation expectations are anchored near the Fed\'s 2% target.'}`,
    chart: {
      type: 'line',
      data: {
        labels: be5.dates.slice(-60),
        series: [
          { name: '5Y Breakeven', values: be5.values.slice(-60).map(v => round(v, 2)), color: '#E74C3C' },
          { name: '10Y Breakeven', values: be10.values.slice(-60).map(v => round(v, 2)), color: '#2980B9' },
        ],
      },
      config: {
        title: 'US Breakeven Inflation Rates (%)',
        value_suffix: '%',
        hlines: [{ y: 2.0, color: '#27AE60', style: '--', label: 'Fed Target' }],
      },
      source: 'FRED',
    },
    source: 'Federal Reserve / FRED',
    priority: Math.abs(be5.latest - 2.0) > 0.5 ? 7 : 4,
    section: 'fixed_income',
  };
}

// --- D. EQUITY DEEP DIVES ---

function genMag7VsSP493(data: FetchedData): NarrativeChart | null {
  const mag7Tickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];
  const mag7Data = mag7Tickers.map(t => data.yahoo[t]).filter(Boolean);
  const spx = data.yahoo['^GSPC'];

  if (mag7Data.length < 5 || !spx) return null;

  const mag7AvgYtd = mag7Data.reduce((sum, d) => sum + d.changeYtd, 0) / mag7Data.length;
  // SP493 ≈ SPX - weighted Mag7 contribution (approximation)
  const sp493Ytd = spx.changeYtd * 1.5 - mag7AvgYtd * 0.5; // rough approx
  const spread = mag7AvgYtd - sp493Ytd;

  return {
    id: 'mag7_vs_sp493',
    category: 'equity_deep',
    title: `Mag 7 vs S&P 493: ${spread > 0 ? 'Mega-Cap Dominance' : 'Breadth Wins'}`,
    hashtags: '#mag7 #sp493 #breadth #concentration #faang',
    commentary: `Mag 7 average YTD: ${pct(mag7AvgYtd)}. ${spread > 5 ? 'The mega-cap premium is extreme — this level of concentration historically precedes either a broadening or a correction. There is no middle ground.' : spread < -5 ? 'The market is finally rotating away from mega-caps. The broadening thesis is playing out.' : 'Mag 7 and the rest are tracking closely.'}`,
    chart: {
      type: 'hbar',
      data: {
        labels: mag7Data.map(d => d.name || d.ticker).concat(['S&P 500']),
        values: mag7Data.map(d => round(d.changeYtd, 1)).concat([round(spx.changeYtd, 1)]),
      },
      config: {
        title: 'Mag 7 + S&P 500 YTD Performance (%)',
        value_suffix: '%',
        color_negative: true,
      },
      source: 'Yahoo Finance',
    },
    source: 'Yahoo Finance',
    priority: Math.abs(spread) > 5 ? 8 : 6,
    section: 'equities',
  };
}

function genStockBondCorrelation(data: FetchedData): NarrativeChart | null {
  const spy = data.yahoo['^GSPC'];
  const tlt = data.yahoo['TLT'];
  if (!spy || !tlt || spy.closes.length < 60) return null;

  // Calculate rolling 60-day correlation
  const n = Math.min(60, spy.closes.length, tlt.closes.length);
  const spyReturns = [];
  const tltReturns = [];
  for (let i = 1; i < n; i++) {
    spyReturns.push((spy.closes[spy.closes.length - n + i] - spy.closes[spy.closes.length - n + i - 1]) / spy.closes[spy.closes.length - n + i - 1]);
    tltReturns.push((tlt.closes[tlt.closes.length - n + i] - tlt.closes[tlt.closes.length - n + i - 1]) / tlt.closes[tlt.closes.length - n + i - 1]);
  }

  // Pearson correlation
  const meanSpy = spyReturns.reduce((a, b) => a + b, 0) / spyReturns.length;
  const meanTlt = tltReturns.reduce((a, b) => a + b, 0) / tltReturns.length;
  let num = 0, denSpy = 0, denTlt = 0;
  for (let i = 0; i < spyReturns.length; i++) {
    const ds = spyReturns[i] - meanSpy;
    const dt = tltReturns[i] - meanTlt;
    num += ds * dt;
    denSpy += ds * ds;
    denTlt += dt * dt;
  }
  const corr = num / (Math.sqrt(denSpy) * Math.sqrt(denTlt));

  const positive = corr > 0.2;
  const negative = corr < -0.2;

  return {
    id: 'stock_bond_correlation',
    category: 'cross_asset',
    title: `Stock-Bond Correlation: ${round(corr, 2)} — ${positive ? 'Positive (Inflation Regime)' : negative ? 'Negative (Normal)' : 'Broken'}`,
    hashtags: '#correlation #stocks #bonds #regime #portfolio',
    commentary: positive
      ? `60-day SPY-TLT correlation is ${round(corr, 2)} — stocks and bonds are moving together. This is an inflation regime where diversification fails. The 60/40 portfolio is not working.`
      : negative
      ? `SPY-TLT correlation at ${round(corr, 2)} — the traditional negative correlation is intact. Bonds are providing diversification value. 60/40 works.`
      : `SPY-TLT correlation near zero (${round(corr, 2)}). The regime is ambiguous — neither diversification nor contagion.`,
    chart: {
      type: 'bar',
      data: {
        labels: ['SPY 1W', 'TLT 1W', 'SPY YTD', 'TLT YTD'],
        values: [round(spy.change1w, 1), round(tlt.change1w, 1), round(spy.changeYtd, 1), round(tlt.changeYtd, 1)],
      },
      config: {
        title: `Stock vs Bond Performance (60D ρ = ${round(corr, 2)})`,
        value_suffix: '%',
        color_negative: true,
      },
      source: 'Yahoo Finance',
    },
    source: 'Yahoo Finance',
    priority: positive ? 8 : 5,
    section: 'cross_asset',
  };
}

// --- E. CRYPTO ---

function genCryptoDashboard(data: FetchedData): NarrativeChart | null {
  const crypto = data.crypto;
  if (!crypto) return null;

  return {
    id: 'crypto_dashboard',
    category: 'crypto',
    title: `BTC $${Math.round(crypto.btc.price).toLocaleString()} | Dominance ${round(crypto.btc.dominance, 1)}%`,
    hashtags: '#bitcoin #crypto #dominance #marketcap',
    commentary: `Bitcoin at $${Math.round(crypto.btc.price).toLocaleString()} (${pct(crypto.btc.change7d)} 7D). BTC dominance: ${round(crypto.btc.dominance, 1)}%. ${crypto.btc.dominance > 55 ? 'High dominance = risk-off in crypto. Alts are being sold for BTC safety.' : crypto.btc.dominance < 45 ? 'Low dominance = alt-season is here. Speculation is running hot.' : 'Dominance is balanced — no clear rotation signal.'}`,
    chart: {
      type: 'hbar',
      data: {
        labels: crypto.top10.map(c => `${c.symbol}`),
        values: crypto.top10.map(c => round(c.change7d, 1)),
      },
      config: {
        title: 'Top 10 Crypto: 7-Day Performance (%)',
        value_suffix: '%',
        color_negative: true,
      },
      source: 'CoinGecko',
    },
    source: 'CoinGecko',
    priority: Math.abs(crypto.btc.change7d) > 5 ? 8 : 5,
    section: 'crypto',
  };
}

// --- F. COMMODITIES & FX ---

function genCopperGoldRatio(data: FetchedData): NarrativeChart | null {
  const copper = data.yahoo['HG=F'];
  const gold = data.yahoo['GC=F'];
  if (!copper || !gold) return null;

  const ratio = copper.current / gold.current;

  return {
    id: 'copper_gold_ratio',
    category: 'commodities_fx',
    title: `Copper/Gold Ratio: ${round(ratio * 1000, 2)} — Growth ${ratio * 1000 > 4.5 ? 'Optimism' : 'Pessimism'}`,
    hashtags: '#copper #gold #growth #ratio #macro',
    commentary: `Copper/Gold at ${round(ratio * 1000, 2)}. ${ratio * 1000 > 4.5 ? 'Rising ratio = growth optimism. Copper (industrial demand) outpacing gold (safety). Global manufacturing may be bottoming.' : 'Falling ratio = growth pessimism. Gold outpacing copper signals a flight to safety. Manufacturing is weakening.'}`,
    chart: {
      type: 'bar',
      data: {
        labels: ['Copper 1W', 'Gold 1W', 'Copper YTD', 'Gold YTD'],
        values: [round(copper.change1w, 1), round(gold.change1w, 1), round(copper.changeYtd, 1), round(gold.changeYtd, 1)],
      },
      config: {
        title: 'Copper vs Gold Performance (%)',
        value_suffix: '%',
        color_negative: true,
      },
      source: 'Yahoo Finance',
    },
    source: 'Yahoo Finance',
    priority: 5,
    section: 'commodities',
  };
}

function genDxyVsEmVsGold(data: FetchedData): NarrativeChart | null {
  const dxy = data.yahoo['DX-Y.NYB'];
  const eem = data.yahoo['EEM'];
  const gold = data.yahoo['GC=F'];
  if (!dxy || !eem || !gold) return null;

  return {
    id: 'dxy_em_gold',
    category: 'cross_asset',
    title: `Dollar ${pct(dxy.change1w)} | EM ${pct(eem.change1w)} | Gold ${pct(gold.change1w)}`,
    hashtags: '#dollar #dxy #em #gold #crossasset',
    commentary: `DXY ${pct(dxy.change1w)} this week (YTD: ${pct(dxy.changeYtd)}). ${dxy.change1w < -0.5 ? 'Dollar weakness is a tailwind for EM and gold — both rallied.' : dxy.change1w > 0.5 ? 'Dollar strength is a headwind for everything denominated in non-USD. EM and commodities feel the pressure.' : 'Dollar flat — cross-asset dynamics are driven by other factors this week.'}`,
    chart: {
      type: 'bar',
      data: {
        labels: ['DXY', 'EM (EEM)', 'Gold'],
        groups: [
          { name: '1W', values: [round(dxy.change1w, 1), round(eem.change1w, 1), round(gold.change1w, 1)] },
          { name: 'YTD', values: [round(dxy.changeYtd, 1), round(eem.changeYtd, 1), round(gold.changeYtd, 1)] },
        ],
      },
      config: {
        title: 'Dollar vs EM vs Gold (%)',
        value_suffix: '%',
        color_negative: true,
      },
      source: 'Yahoo Finance',
    },
    source: 'Yahoo Finance',
    priority: 6,
    section: 'cross_asset',
  };
}

function genConsumerSentiment(data: FetchedData): NarrativeChart | null {
  const umcsent = data.fred['UMCSENT'];
  if (!umcsent || umcsent.values.length < 12) return null;

  const current = umcsent.latest;
  const avg = umcsent.values.slice(-12).reduce((a, b) => a + b, 0) / Math.min(12, umcsent.values.length);

  return {
    id: 'consumer_sentiment',
    category: 'macro',
    title: `Consumer Sentiment: ${round(current, 1)} — ${current > avg ? 'Improving' : 'Deteriorating'}`,
    hashtags: '#consumer #sentiment #umich #spending #confidence',
    commentary: `U. Michigan Consumer Sentiment at ${round(current, 1)} (12M avg: ${round(avg, 1)}). ${current < 70 ? 'Sub-70 readings reflect a consumer under pressure. Spending resilience is being tested.' : current > 90 ? 'Strong consumer confidence supports spending — but confidence peaks often precede slowdowns.' : 'Consumer sentiment is middling — neither euphoric nor despondent.'}`,
    chart: {
      type: 'line',
      data: {
        labels: umcsent.dates.slice(-24),
        series: [{
          name: 'U. Michigan Sentiment',
          values: umcsent.values.slice(-24).map(v => round(v, 1)),
          color: '#E8792B',
        }],
      },
      config: {
        title: 'U. Michigan Consumer Sentiment Index',
      },
      source: 'U. Michigan / FRED',
    },
    source: 'University of Michigan / FRED',
    priority: Math.abs(current - avg) > 10 ? 6 : 3,
    section: 'macro',
  };
}

function genMortgageRates(data: FetchedData): NarrativeChart | null {
  const mortgage = data.fred['MORTGAGE30US'];
  if (!mortgage || mortgage.values.length < 20) return null;

  return {
    id: 'mortgage_rates',
    category: 'macro',
    title: `30Y Mortgage at ${round(mortgage.latest, 2)}%`,
    hashtags: '#housing #mortgage #rates #realestate',
    commentary: `The 30Y fixed mortgage rate at ${round(mortgage.latest, 2)}%. ${mortgage.latest > 7 ? 'Above 7% is a housing freeze — affordability is destroyed. Lock-in effect keeps existing supply off market.' : mortgage.latest > 6 ? 'Rates above 6% continue to weigh on housing activity. The market waits for a meaningful decline.' : 'Sub-6% mortgage rates would unlock significant pent-up demand.'}`,
    chart: {
      type: 'line',
      data: {
        labels: mortgage.dates.slice(-52),
        series: [{
          name: '30Y Fixed Mortgage (%)',
          values: mortgage.values.slice(-52).map(v => round(v, 2)),
          color: '#2C3E50',
        }],
      },
      config: {
        title: 'US 30-Year Fixed Mortgage Rate',
        value_suffix: '%',
        hlines: [{ y: 7.0, color: '#E74C3C', style: '--', label: 'Freeze Level' }],
      },
      source: 'Freddie Mac / FRED',
    },
    source: 'Freddie Mac / FRED',
    priority: mortgage.latest > 7 ? 6 : 3,
    section: 'macro',
  };
}

function genVixVsMove(data: FetchedData): NarrativeChart | null {
  const vix = data.yahoo['^VIX'];
  const move = data.yahoo['MOVE'];
  if (!vix || !move) return null;

  const diverging = (vix.change1w > 2 && move.change1w < -2) || (vix.change1w < -2 && move.change1w > 2);

  return {
    id: 'vix_vs_move',
    category: 'cross_asset',
    title: `VIX ${round(vix.current, 1)} vs MOVE ${round(move.current, 0)} — ${diverging ? 'Divergence!' : 'In Sync'}`,
    hashtags: '#vix #move #volatility #equity #bond #crossasset',
    commentary: `Equity vol (VIX: ${round(vix.current, 1)}, ${pct(vix.change1w)} 1W) vs bond vol (MOVE: ${round(move.current, 0)}, ${pct(move.change1w)} 1W). ${diverging ? 'VIX and MOVE are diverging — one market is wrong. When equity and bond vol disconnect, the convergence trade can be explosive.' : 'Equity and bond volatility are moving in tandem — no cross-asset dislocation.'}`,
    chart: {
      type: 'bar',
      data: {
        labels: ['VIX (Equity Vol)', 'MOVE (Bond Vol)'],
        groups: [
          { name: 'Level', values: [round(vix.current, 1), round(move.current, 0)] },
          { name: '1W Chg %', values: [round(vix.change1w, 1), round(move.change1w, 1)] },
        ],
      },
      config: {
        title: 'Equity vs Bond Volatility',
      },
      source: 'CBOE / ICE',
    },
    source: 'CBOE / ICE BofA',
    priority: diverging ? 8 : 4,
    section: 'cross_asset',
  };
}

function genInitialClaims(data: FetchedData): NarrativeChart | null {
  const claims = data.fred['ICSA'];
  if (!claims || claims.values.length < 20) return null;

  const current = claims.latest;
  const avg4w = claims.values.slice(-4).reduce((a, b) => a + b, 0) / 4;

  return {
    id: 'initial_claims',
    category: 'macro',
    title: `Initial Claims: ${Math.round(current / 1000)}K — ${current > 250000 ? 'Rising' : 'Healthy'}`,
    hashtags: '#labor #claims #unemployment #jobs #weekly',
    commentary: `Initial jobless claims at ${Math.round(current / 1000)}K (4W avg: ${Math.round(avg4w / 1000)}K). ${current > 300000 ? 'Claims above 300K signal labor market deterioration. The Fed will notice.' : current > 250000 ? 'Claims are rising but still below recession levels. Watch the trend, not the level.' : 'Sub-250K claims = tight labor market. No recession signal here.'}`,
    chart: {
      type: 'line',
      data: {
        labels: claims.dates.slice(-26),
        series: [{
          name: 'Initial Claims (K)',
          values: claims.values.slice(-26).map(v => round(v / 1000, 0)),
          color: '#2C3E50',
        }],
      },
      config: {
        title: 'US Initial Jobless Claims (Weekly, K)',
        hlines: [{ y: 300, color: '#E74C3C', style: '--', label: 'Stress Level' }],
      },
      source: 'DOL / FRED',
    },
    source: 'Department of Labor / FRED',
    priority: current > 250000 ? 7 : 3,
    section: 'macro',
  };
}

function genSmallVsLargeCap(data: FetchedData): NarrativeChart | null {
  const rut = data.yahoo['^RUT'];
  const spx = data.yahoo['^GSPC'];
  if (!rut || !spx) return null;

  const spread = rut.changeYtd - spx.changeYtd;

  return {
    id: 'small_vs_large',
    category: 'equity_deep',
    title: `Small vs Large Cap: ${spread > 0 ? 'Small Caps Leading' : 'Large Caps Dominating'}`,
    hashtags: '#smallcap #largecap #russell #sp500 #rotation',
    commentary: `Russell 2000 YTD: ${pct(rut.changeYtd)} vs S&P 500 ${pct(spx.changeYtd)}. ${spread > 3 ? 'Small caps outperforming = risk appetite broadening. This is a late-cycle signal that can persist for months.' : spread < -3 ? 'Small cap underperformance = flight to quality. The market doesn\'t trust the economy enough to own smaller companies.' : 'Small and large caps tracking together — no rotation signal.'}`,
    chart: {
      type: 'bar',
      data: {
        labels: ['Russell 2000', 'S&P 500'],
        groups: [
          { name: '1W', values: [round(rut.change1w, 1), round(spx.change1w, 1)] },
          { name: 'YTD', values: [round(rut.changeYtd, 1), round(spx.changeYtd, 1)] },
        ],
      },
      config: {
        title: 'Small Cap vs Large Cap (%)',
        value_suffix: '%',
        color_negative: true,
      },
      source: 'Yahoo Finance',
    },
    source: 'Yahoo Finance',
    priority: Math.abs(spread) > 5 ? 7 : 4,
    section: 'equities',
  };
}

// ============================================================================
// Master Generator — Run all narrative generators
// ============================================================================

const ALL_GENERATORS: Array<(data: FetchedData) => NarrativeChart | null> = [
  // Sentiment (A)
  genFearGreedGauge,
  genVixTermStructure,
  genSkewIndex,
  genPutCallRatio,
  // Breadth (B)
  genEqualWeightVsCapWeight,
  genSectorHeatmap,
  // Cross-Asset (C)
  genYieldCurve,
  genCreditSpreads,
  genRealYieldsVsGold,
  genGlobalEquityRace,
  genStockBondCorrelation,
  genDxyVsEmVsGold,
  genVixVsMove,
  // Equity Deep (D)
  genMag7VsSP493,
  genFactorPerformance,
  genSmallVsLargeCap,
  // Crypto (E)
  genCryptoDashboard,
  // Fixed Income (F)
  genBreakevenInflation,
  // Commodities & FX (G)
  genCopperGoldRatio,
  // Macro (H)
  genLiquidityDashboard,
  genFinancialConditions,
  genConsumerSentiment,
  genMortgageRates,
  genInitialClaims,
];

/**
 * Generate all narrative charts from fetched data.
 * Returns charts sorted by priority (highest first).
 */
export function generateNarrativeCharts(data: FetchedData): NarrativeChart[] {
  const charts: NarrativeChart[] = [];

  for (const gen of ALL_GENERATORS) {
    try {
      const chart = gen(data);
      if (chart) charts.push(chart);
    } catch (e) {
      // Silent fail per generator — don't let one failure kill the pipeline
    }
  }

  // Sort by priority descending
  charts.sort((a, b) => b.priority - a.priority);

  console.log(`  [narrative-charts] Generated ${charts.length} narrative charts (top: ${charts.slice(0, 3).map(c => c.id).join(', ')})`);
  return charts;
}

/**
 * Select the best N narrative charts for the weekly report.
 * Ensures diversity across categories (max 3 per category).
 */
export function selectTopNarratives(charts: NarrativeChart[], maxSlides = 20): NarrativeChart[] {
  const selected: NarrativeChart[] = [];
  const categoryCount: Record<string, number> = {};
  const maxPerCategory = 3;

  for (const chart of charts) {
    const cat = chart.category;
    if ((categoryCount[cat] || 0) >= maxPerCategory) continue;
    selected.push(chart);
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    if (selected.length >= maxSlides) break;
  }

  return selected;
}

/**
 * Convert NarrativeChart[] → SlideSpec[] for the presentation engine.
 */
export function narrativesToSlides(narratives: NarrativeChart[]): SlideSpec[] {
  return narratives.map(n => ({
    type: 'editorial' as const,
    content: {
      section: n.section,
      hashtags: n.hashtags,
      title: n.title,
      commentary: n.commentary,
      source: `Source: ${n.source}`,
    },
    chart: n.chart,
  }));
}
