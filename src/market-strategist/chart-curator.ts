/**
 * Genesis v21 - Chart Curator
 *
 * Curates external charts from top FinTwit accounts and institutional sources:
 * - Searches recent chart tweets via Brave Search HTTP API (direct, no MCP)
 * - Downloads images from pbs.twimg.com CDN
 * - Screenshots key web pages using native Playwright library (no MCP)
 * - Returns ranked CuratedChart[] with local image paths + metadata
 *
 * Integrates into the weekly pipeline as Step 1.5 (after COLLECT, before VERIFY).
 */

import type { NarrativeCategory } from './narrative-charts.js';
import type { SlideSpec } from '../presentation/types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env for BRAVE_API_KEY
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ============================================================================
// Types
// ============================================================================

export interface CuratedChart {
  id: string;
  source: string;           // "twitter:charliebilello", "web:barchart"
  author: string;           // "Charlie Bilello"
  title: string;            // Derived from tweet text or page title
  imagePath: string;        // Local PNG path
  sourceUrl: string;        // Tweet URL or page URL
  category: NarrativeCategory;
  commentary?: string;      // Tweet text or caption
  capturedAt: Date;
  engagement?: number;      // Likes/retweets for ranking
}

// ============================================================================
// Source Definitions
// ============================================================================

interface ChartAccount {
  handle: string;
  name: string;
  categories: NarrativeCategory[];
}

interface WebChartSource {
  url: string;
  name: string;
  category: NarrativeCategory;
  selector?: string;
}

/** Top FinTwit accounts to monitor (from SYZ source analysis) */
const CHART_ACCOUNTS: ChartAccount[] = [
  { handle: 'charliebilello', name: 'Charlie Bilello', categories: ['cross_asset', 'macro', 'sentiment'] },
  { handle: 'KobeissiLetter', name: 'The Kobeissi Letter', categories: ['sentiment', 'cross_asset'] },
  { handle: 'GameofTrades_', name: 'Game of Trades', categories: ['macro', 'cross_asset'] },
  { handle: 'MacroAlf', name: 'Alfonso Peccatiello', categories: ['fixed_income', 'macro'] },
  { handle: 'LizAnnSonders', name: 'Liz Ann Sonders', categories: ['cross_asset', 'breadth'] },
  { handle: 'BobEUnlimited', name: 'Bob Elliott', categories: ['macro', 'cross_asset'] },
  { handle: 'Barchart', name: 'Barchart', categories: ['cross_asset', 'commodities_fx'] },
  { handle: 'zaborafael', name: 'ZeroHedge', categories: ['cross_asset', 'fixed_income'] },
];

/** Key web pages to screenshot for institutional charts */
const WEB_CHART_SOURCES: WebChartSource[] = [
  { url: 'https://www.barchart.com/stocks/indices', name: 'Barchart Indices', category: 'cross_asset' },
  { url: 'https://www.barchart.com/stocks/performance/weekly', name: 'Barchart Weekly Performance', category: 'cross_asset' },
  { url: 'https://fred.stlouisfed.org/series/T10Y2Y', name: 'FRED Yield Curve (10Y-2Y)', category: 'fixed_income' },
  { url: 'https://fred.stlouisfed.org/series/BAMLH0A0HYM2', name: 'FRED HY Spreads', category: 'fixed_income' },
];

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ============================================================================
// Content Quality Filters
// ============================================================================

/** Reject tweets matching these patterns — irrelevant to market analysis */
const REJECT_PATTERNS = [
  /apolog/i, /mistake/i, /correction/i, /fixed the/i,
  /won a.*challenge/i, /newsletter/i, /subscribe/i,
  /tutorial/i, /how to use/i, /useful part of/i,
  /dataviz challenge/i, /tools I used/i,
  /giveaway/i, /retweet to win/i, /follow me/i,
];

function isRelevantContent(text: string): boolean {
  return !REJECT_PATTERNS.some(p => p.test(text));
}

/** Simple Levenshtein distance for title dedup */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ============================================================================
// Brave Search — Direct HTTP API
// ============================================================================

interface BraveSearchResult {
  url: string;
  title: string;
  description?: string;
  extra_snippets?: string[];
}

let _lastBraveCall = 0;

async function braveWebSearch(query: string, count = 5): Promise<BraveSearchResult[]> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    console.warn('  [chart-curator] BRAVE_API_KEY not set, skipping web search');
    return [];
  }

  // Rate limit: 1 request per second (Brave free tier = 1 req/s)
  const now = Date.now();
  const elapsed = now - _lastBraveCall;
  if (elapsed < 1100) {
    await new Promise(r => setTimeout(r, 1100 - elapsed));
  }
  _lastBraveCall = Date.now();

  const params = new URLSearchParams({ q: query, count: String(count), freshness: 'pw' });
  const url = `https://api.search.brave.com/res/v1/web/search?${params}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new Error(`Brave API HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data?.web?.results || [];
}

// ============================================================================
// Playwright — Native Library (no MCP)
// ============================================================================

let _browser: any = null;

async function getBrowser(): Promise<any> {
  if (_browser && _browser.isConnected()) return _browser;

  // Dynamic import to avoid hard dependency if not installed
  const { chromium } = await import('playwright');
  _browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  return _browser;
}

async function closeBrowser(): Promise<void> {
  if (_browser) {
    try { await _browser.close(); } catch { /* ignore */ }
    _browser = null;
  }
}

async function takeScreenshot(url: string, localPath: string, waitMs = 4000): Promise<boolean> {
  let page: any = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2, // Retina-quality screenshots
      userAgent: BROWSER_UA,
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Dismiss cookie banners — try common selectors
    try {
      const cookieSelectors = [
        'button:has-text("Accept")', 'button:has-text("Accept All")',
        'button:has-text("I Agree")', 'button:has-text("Got it")',
        'button:has-text("OK")', 'button:has-text("Consent")',
        '[id*="cookie"] button', '[class*="cookie"] button',
        '[id*="consent"] button', '[class*="consent"] button',
        '.cc-btn', '.cc-accept', '#onetrust-accept-btn-handler',
        'button[data-testid="cookie-accept"]',
      ];
      for (const sel of cookieSelectors) {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click().catch(() => {});
          await page.waitForTimeout(500);
          break;
        }
      }
    } catch { /* cookie dismissal is best-effort */ }

    // Wait for charts/JS rendering
    if (waitMs > 0) {
      await page.waitForTimeout(waitMs);
    }

    const buffer = await page.screenshot({ type: 'png', fullPage: false });

    if (buffer.length < 5000) {
      console.warn(`  [chart-curator] Screenshot too small (${buffer.length}b), skipping: ${url}`);
      return false;
    }

    fs.writeFileSync(localPath, buffer);
    return true;
  } catch (e) {
    console.warn(`  [chart-curator] Screenshot failed for ${url}: ${(e as Error).message}`);
    return false;
  } finally {
    if (page) {
      try { await page.close(); } catch { /* ignore */ }
    }
  }
}

async function extractImagesFromPage(url: string): Promise<string[]> {
  let page: any = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage({ userAgent: BROWSER_UA });

    // X.com is a heavy SPA — don't wait for networkidle
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Wait for tweet images to appear (X.com lazy-loads them)
    try {
      await page.waitForSelector('img[src*="twimg.com/media"]', { timeout: 10000 });
    } catch {
      // No images found within timeout — tweet may not have images
      return [];
    }

    // Extra wait for all images to load
    await page.waitForTimeout(1500);

    // Extract all images from twimg CDN
    const imageUrls: string[] = await page.evaluate(() => {
      const imgs = document.querySelectorAll('img[src*="twimg.com/media"]');
      return Array.from(imgs).map((img: any) => img.src);
    });

    return imageUrls;
  } catch (e) {
    console.warn(`  [chart-curator] Page image extraction failed for ${url}: ${(e as Error).message}`);
    return [];
  } finally {
    if (page) {
      try { await page.close(); } catch { /* ignore */ }
    }
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Curate charts from FinTwit + institutional web sources.
 *
 * @param outputDir  Directory to save downloaded images
 * @param maxCharts  Max charts to return (default 15)
 * @returns Ranked array of CuratedChart with local image paths
 */
export async function curateCharts(outputDir: string, maxCharts = 15): Promise<CuratedChart[]> {
  fs.mkdirSync(outputDir, { recursive: true });

  const allCharts: CuratedChart[] = [];

  // Run Twitter search and web screenshots in parallel
  const [twitterCharts, webCharts] = await Promise.allSettled([
    discoverTwitterCharts(outputDir),
    screenshotWebSources(outputDir),
  ]);

  if (twitterCharts.status === 'fulfilled') {
    allCharts.push(...twitterCharts.value);
  } else {
    console.warn(`  [chart-curator] Twitter chart discovery failed: ${twitterCharts.reason}`);
  }

  if (webCharts.status === 'fulfilled') {
    allCharts.push(...webCharts.value);
  } else {
    console.warn(`  [chart-curator] Web screenshots failed: ${webCharts.reason}`);
  }

  // Close browser after all screenshots are done
  await closeBrowser();

  // Deduplicate by URL and near-identical titles
  const seenUrls = new Set<string>();
  const seenTitles: string[] = [];
  const dedupedCharts: CuratedChart[] = [];

  for (const chart of allCharts) {
    if (seenUrls.has(chart.sourceUrl)) continue;
    const normTitle = chart.title.toLowerCase().trim();
    if (seenTitles.some(t => levenshtein(t, normTitle) < 10)) continue;
    seenUrls.add(chart.sourceUrl);
    seenTitles.push(normTitle);
    dedupedCharts.push(chart);
  }

  // Rank by engagement (if available) and recency
  dedupedCharts.sort((a, b) => (b.engagement || 0) - (a.engagement || 0));

  return dedupedCharts.slice(0, maxCharts);
}

// ============================================================================
// Twitter Chart Discovery via Brave Search (Direct HTTP)
// ============================================================================

async function discoverTwitterCharts(outputDir: string): Promise<CuratedChart[]> {
  const charts: CuratedChart[] = [];

  // Sequential to respect Brave API rate limits (1 req/s on free tier)
  for (const account of CHART_ACCOUNTS) {
    try {
      const accountCharts = await searchAccountCharts(account, outputDir);
      charts.push(...accountCharts);
    } catch (e) {
      console.warn(`  [chart-curator] Account @${account.handle} failed: ${(e as Error).message}`);
    }
  }

  return charts;
}

async function searchAccountCharts(
  account: ChartAccount,
  outputDir: string,
): Promise<CuratedChart[]> {
  const charts: CuratedChart[] = [];

  try {
    // Direct Brave Search HTTP API
    const query = `site:x.com ${account.handle} chart OR graph OR data`;
    const webResults = await braveWebSearch(query, 5);

    for (const item of webResults.slice(0, 3)) {
      const url = item.url || '';
      const title = item.title || item.description || '';

      // Skip non-tweet URLs
      if (!url.includes('x.com/') && !url.includes('twitter.com/')) continue;
      // Skip profile pages (we want individual tweets)
      if (!url.match(/\/status\/\d+/)) continue;
      // Quality filter: reject irrelevant content
      if (!isRelevantContent(title)) {
        console.log(`  [chart-curator] Rejected (quality filter): ${title.slice(0, 60)}...`);
        continue;
      }

      try {
        // Extract images from the tweet page using Playwright
        const imageUrls = await extractImagesFromPage(url);

        for (let j = 0; j < imageUrls.length && j < 2; j++) {
          const imageUrl = imageUrls[j];
          const id = `twitter-${account.handle}-${Date.now()}-${j}`;
          const filename = `${id}.png`;
          const localPath = path.join(outputDir, filename);

          // Download the image
          const downloaded = await downloadImage(imageUrl, localPath);
          if (!downloaded) continue;

          charts.push({
            id,
            source: `twitter:${account.handle}`,
            author: account.name,
            title: cleanTweetTitle(title),
            imagePath: localPath,
            sourceUrl: url,
            category: account.categories[0],
            commentary: title,
            capturedAt: new Date(),
            engagement: extractEngagement(item),
          });
        }
      } catch (e) {
        console.warn(`  [chart-curator] Failed to extract images from ${url}: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    console.warn(`  [chart-curator] Brave search failed for @${account.handle}: ${(e as Error).message}`);
  }

  return charts;
}

// ============================================================================
// Web Page Screenshots (Native Playwright)
// ============================================================================

async function screenshotWebSources(outputDir: string): Promise<CuratedChart[]> {
  const charts: CuratedChart[] = [];

  for (const source of WEB_CHART_SOURCES) {
    try {
      const id = `web-${source.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
      const filename = `${id}.png`;
      const localPath = path.join(outputDir, filename);

      const success = await takeScreenshot(source.url, localPath, 3000);
      if (!success) continue;

      charts.push({
        id,
        source: `web:${source.name.toLowerCase().replace(/\s+/g, '-')}`,
        author: source.name,
        title: source.name,
        imagePath: localPath,
        sourceUrl: source.url,
        category: source.category,
        capturedAt: new Date(),
      });
    } catch (e) {
      console.warn(`  [chart-curator] Failed to screenshot ${source.name}: ${(e as Error).message}`);
    }
  }

  return charts;
}

// ============================================================================
// Image Download Helper
// ============================================================================

async function downloadImage(url: string, localPath: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`  [chart-curator] HTTP ${response.status} downloading ${url}`);
      return false;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length < 1024) {
      console.warn(`  [chart-curator] Image too small (${buffer.length}b), skipping: ${url}`);
      return false;
    }

    fs.writeFileSync(localPath, buffer);
    return true;
  } catch (e) {
    console.warn(`  [chart-curator] Download failed for ${url}: ${(e as Error).message}`);
    return false;
  }
}

// ============================================================================
// Helpers
// ============================================================================

/** Extract engagement metrics from search result metadata */
function extractEngagement(item: any): number {
  if (item.extra_snippets) {
    for (const snippet of item.extra_snippets) {
      const likeMatch = String(snippet).match(/([\d,.]+)\s*(?:likes?|♥)/i);
      if (likeMatch) return parseInt(likeMatch[1].replace(/[,.\s]/g, ''), 10) || 0;
    }
  }
  return 0;
}

/** Clean up tweet title for slide display */
function cleanTweetTitle(title: string): string {
  return title
    .replace(/on X:?\s*/i, '')
    .replace(/"([^"]+)"/, '$1')
    .replace(/^RT\s+/i, '')
    .replace(/@\w+/g, '')
    .replace(/#\w+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/**
 * Group curated charts by category for slide insertion.
 */
export function groupChartsByCategory(charts: CuratedChart[]): Map<NarrativeCategory, CuratedChart[]> {
  const groups = new Map<NarrativeCategory, CuratedChart[]>();
  for (const chart of charts) {
    const existing = groups.get(chart.category) || [];
    existing.push(chart);
    groups.set(chart.category, existing);
  }
  return groups;
}

/**
 * Build presentation slides from curated charts.
 */
export function curatedChartsToSlides(charts: CuratedChart[]): SlideSpec[] {
  const slides: SlideSpec[] = [];

  if (charts.length === 0) return slides;

  // Section divider
  slides.push({
    type: 'section_divider',
    content: {
      section_num: '00',
      title: 'Best Charts This Week — FinTwit & Institutional',
      subtitle: `${charts.length} curated charts from ${new Set(charts.map(c => c.author)).size} sources`,
      section: 'curated_charts',
    },
  } as SlideSpec);

  // Group by category
  const groups = groupChartsByCategory(charts);

  for (const [category, categoryCharts] of Array.from(groups.entries())) {
    if (categoryCharts.length >= 4) {
      slides.push({
        type: 'chart_grid',
        content: {
          title: `${formatCategoryName(category)} — Curated Charts`,
          section: category,
          hashtags: `#${category} #fintwit #curated`,
          grid: categoryCharts.slice(0, 4).map(c => ({
            label: c.title.slice(0, 45),
            image_path: c.imagePath,
          })),
          cols: 2,
          source: `Source: ${categoryCharts.slice(0, 4).map(c => `@${c.source.split(':')[1] || c.author}`).join(', ')}`,
        },
      } as SlideSpec);

      for (const chart of categoryCharts.slice(4)) {
        slides.push(chartToEditorialSlide(chart));
      }
    } else {
      for (const chart of categoryCharts) {
        slides.push(chartToEditorialSlide(chart));
      }
    }
  }

  return slides;
}

function chartToEditorialSlide(chart: CuratedChart): SlideSpec {
  const sourceHandle = chart.source.includes(':')
    ? `@${chart.source.split(':')[1]}`
    : chart.author;

  return {
    type: 'editorial',
    content: {
      section: chart.category,
      hashtags: `#${chart.category} #${sourceHandle.replace('@', '')} #fintwit`,
      title: chart.title || `Chart from ${chart.author}`,
      commentary: chart.commentary || '',
      image_path: chart.imagePath,
      source: `Source: ${sourceHandle}`,
    },
  } as SlideSpec;
}

function formatCategoryName(category: NarrativeCategory): string {
  const names: Record<NarrativeCategory, string> = {
    sentiment: 'Sentiment',
    breadth: 'Market Breadth',
    cross_asset: 'Cross-Asset',
    equity_deep: 'Equity Deep Dive',
    crypto: 'Crypto',
    fixed_income: 'Fixed Income',
    commodities_fx: 'Commodities & FX',
    macro: 'Macro',
    exclusive: 'Exclusive',
  };
  return names[category] || category;
}
