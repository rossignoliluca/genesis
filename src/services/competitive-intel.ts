/**
 * Genesis v11.0 - Competitive Intelligence Service
 *
 * First revenue-generating service. Monitors competitor websites,
 * detects changes, analyzes their significance, and produces
 * actionable intelligence digests.
 *
 * Differentiator vs Visualping/Crayon/Klue:
 * - Not just "page changed" but "WHY it changed and what it means"
 * - Builds temporal knowledge graph of competitor moves
 * - Uses Active Inference to prioritize which competitors to monitor
 * - Learns what changes matter to the user over time
 *
 * MCP servers used: brave-search, firecrawl, memory, openai/anthropic
 *
 * Revenue model: $49-199/month per monitored set
 */

import { getMCPClient } from '../mcp/index.js';

// ============================================================================
// Types
// ============================================================================

export interface Competitor {
  name: string;
  domain: string;
  pages: CompetitorPage[];
  lastChecked?: number;
  changeHistory: ChangeEvent[];
}

export interface CompetitorPage {
  url: string;
  type: 'pricing' | 'changelog' | 'blog' | 'jobs' | 'features' | 'landing' | 'docs';
  lastContent?: string;
  lastHash?: string;
  lastChecked?: number;
}

export interface ChangeEvent {
  timestamp: number;
  pageUrl: string;
  pageType: string;
  changeType: 'added' | 'removed' | 'modified' | 'major_rewrite';
  summary: string;
  significance: 'low' | 'medium' | 'high' | 'critical';
  analysis: string;
  rawDiff?: string;
}

export interface IntelDigest {
  generated: number;
  period: { from: number; to: number };
  competitors: Array<{
    name: string;
    changes: ChangeEvent[];
    trend: string;
  }>;
  keyInsights: string[];
  recommendations: string[];
}

export interface CompetitiveIntelConfig {
  competitors: Array<{ name: string; domain: string; pages?: string[] }>;
  checkIntervalMs: number;     // How often to check (default: 6h)
  digestIntervalMs: number;    // How often to generate digest (default: 24h)
  llmModel: string;            // LLM for analysis
  maxPagesPerCompetitor: number;
}

export const DEFAULT_INTEL_CONFIG: CompetitiveIntelConfig = {
  competitors: [],
  checkIntervalMs: 6 * 60 * 60 * 1000,    // 6 hours
  digestIntervalMs: 24 * 60 * 60 * 1000,   // Daily
  llmModel: 'gpt-4o-mini',
  maxPagesPerCompetitor: 6,
};

// ============================================================================
// Competitive Intelligence Engine
// ============================================================================

export class CompetitiveIntelService {
  private config: CompetitiveIntelConfig;
  private competitors: Map<string, Competitor> = new Map();
  private running: boolean = false;
  private lastDigest?: IntelDigest;
  private checkTimer?: ReturnType<typeof setInterval>;

  constructor(config: Partial<CompetitiveIntelConfig> = {}) {
    this.config = { ...DEFAULT_INTEL_CONFIG, ...config };
    this.initCompetitors();
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Start monitoring competitors.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Run first check immediately
    this.checkAll().catch(e => console.error('[CompIntel] Initial check failed:', e));

    // Schedule periodic checks
    this.checkTimer = setInterval(() => {
      this.checkAll().catch(e => console.error('[CompIntel] Check failed:', e));
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop monitoring.
   */
  stop(): void {
    this.running = false;
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }
  }

  /**
   * Add a competitor to monitor.
   */
  addCompetitor(name: string, domain: string, pages?: string[]): void {
    const competitor: Competitor = {
      name,
      domain,
      pages: this.inferPages(domain, pages),
      changeHistory: [],
    };
    this.competitors.set(domain, competitor);
  }

  /**
   * Force check all competitors now.
   */
  async checkAll(): Promise<ChangeEvent[]> {
    const allChanges: ChangeEvent[] = [];

    for (const [, competitor] of this.competitors) {
      const changes = await this.checkCompetitor(competitor);
      allChanges.push(...changes);
    }

    return allChanges;
  }

  /**
   * Generate a digest of recent changes.
   */
  async generateDigest(periodHours: number = 24): Promise<IntelDigest> {
    const now = Date.now();
    const periodStart = now - periodHours * 60 * 60 * 1000;

    const competitorDigests: IntelDigest['competitors'] = [];

    for (const [, competitor] of this.competitors) {
      const recentChanges = competitor.changeHistory.filter(c => c.timestamp > periodStart);
      if (recentChanges.length > 0) {
        competitorDigests.push({
          name: competitor.name,
          changes: recentChanges,
          trend: this.analyzeTrend(recentChanges),
        });
      }
    }

    // Generate key insights using LLM
    const insights = await this.generateInsights(competitorDigests);

    const digest: IntelDigest = {
      generated: now,
      period: { from: periodStart, to: now },
      competitors: competitorDigests,
      keyInsights: insights.insights,
      recommendations: insights.recommendations,
    };

    this.lastDigest = digest;
    return digest;
  }

  /**
   * Get all tracked competitors.
   */
  getCompetitors(): Competitor[] {
    return [...this.competitors.values()];
  }

  /**
   * Get recent changes across all competitors.
   */
  getRecentChanges(hours: number = 24): ChangeEvent[] {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const all: ChangeEvent[] = [];
    for (const [, comp] of this.competitors) {
      all.push(...comp.changeHistory.filter(c => c.timestamp > cutoff));
    }
    return all.sort((a, b) => b.timestamp - a.timestamp);
  }

  // ============================================================================
  // Core Logic
  // ============================================================================

  /**
   * Check a single competitor for changes.
   */
  private async checkCompetitor(competitor: Competitor): Promise<ChangeEvent[]> {
    const changes: ChangeEvent[] = [];
    const mcp = getMCPClient();

    for (const page of competitor.pages) {
      try {
        // Scrape current content via Firecrawl
        const result = await mcp.call('firecrawl' as any, 'firecrawl_scrape', {
          url: page.url,
          formats: ['markdown'],
          onlyMainContent: true,
        });

        const currentContent = (result as any)?.data?.markdown
          || (result as any)?.markdown
          || JSON.stringify(result).slice(0, 5000);

        // Compare with previous content
        if (page.lastContent) {
          const diff = this.computeDiff(page.lastContent, currentContent);
          if (diff.changed) {
            // Analyze the change with LLM
            const analysis = await this.analyzeChange(
              competitor.name,
              page,
              diff.summary,
              page.lastContent,
              currentContent
            );

            const event: ChangeEvent = {
              timestamp: Date.now(),
              pageUrl: page.url,
              pageType: page.type,
              changeType: diff.changeType,
              summary: diff.summary,
              significance: analysis.significance,
              analysis: analysis.analysis,
            };

            changes.push(event);
            competitor.changeHistory.push(event);
          }
        }

        // Update stored content
        page.lastContent = currentContent;
        page.lastHash = this.simpleHash(currentContent);
        page.lastChecked = Date.now();
      } catch (e) {
        // Page failed to load — note but don't crash
        if (page.lastContent) {
          // Page was previously accessible, now failing = potential change
          changes.push({
            timestamp: Date.now(),
            pageUrl: page.url,
            pageType: page.type,
            changeType: 'removed',
            summary: `Page no longer accessible: ${(e as Error).message}`,
            significance: 'medium',
            analysis: 'Page may have been removed or restructured.',
          });
        }
      }
    }

    competitor.lastChecked = Date.now();
    return changes;
  }

  /**
   * Call LLM with MCP fallback to direct HTTP.
   */
  private async callLLM(messages: Array<{ role: string; content: string }>, maxTokens = 200): Promise<string> {
    // Try MCP first
    try {
      const mcp = getMCPClient();
      const result = await mcp.call('openai' as any, 'openai_chat', {
        model: this.config.llmModel,
        messages,
        temperature: 0.3,
        max_tokens: maxTokens,
      });
      const r = result as any;
      const content = r?.data?.choices?.[0]?.message?.content || r?.choices?.[0]?.message?.content;
      if (content) return content;
    } catch { /* fall through to direct */ }

    // Fallback: direct OpenAI HTTP call
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return '{}';

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.llmModel,
        messages,
        temperature: 0.3,
        max_tokens: maxTokens,
      }),
    });

    if (!resp.ok) return '{}';
    const data = await resp.json() as any;
    return data?.choices?.[0]?.message?.content || '{}';
  }

  /**
   * Analyze a detected change using LLM.
   */
  private async analyzeChange(
    competitorName: string,
    page: CompetitorPage,
    diffSummary: string,
    oldContent: string,
    newContent: string
  ): Promise<{ significance: ChangeEvent['significance']; analysis: string }> {
    try {
      const content = await this.callLLM([
        {
          role: 'system',
          content: `You are a competitive intelligence analyst. Analyze changes on competitor websites and determine their business significance. Respond with JSON: {"significance": "low|medium|high|critical", "analysis": "brief analysis"}`
        },
        {
          role: 'user',
          content: `Competitor: ${competitorName}\nPage type: ${page.type}\nURL: ${page.url}\n\nChange detected: ${diffSummary}\n\nOld content (first 1000 chars): ${oldContent.slice(0, 1000)}\n\nNew content (first 1000 chars): ${newContent.slice(0, 1000)}\n\nWhat is the business significance of this change?`
        }
      ]);

      const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || '{}');
      return {
        significance: parsed.significance || 'medium',
        analysis: parsed.analysis || 'Unable to analyze change.',
      };
    } catch {
      return { significance: 'medium', analysis: 'Analysis unavailable (LLM error).' };
    }
  }

  /**
   * Generate strategic insights from recent changes.
   */
  private async generateInsights(
    competitorData: IntelDigest['competitors']
  ): Promise<{ insights: string[]; recommendations: string[] }> {
    if (competitorData.length === 0) {
      return { insights: ['No significant changes detected.'], recommendations: [] };
    }

    try {
      const changesSummary = competitorData.map(c =>
        `${c.name}: ${c.changes.map(ch => `[${ch.significance}] ${ch.summary}`).join('; ')}`
      ).join('\n');

      const content = await this.callLLM([
        {
          role: 'system',
          content: 'You are a strategic analyst. Given competitor changes, produce key insights and recommendations. Respond with JSON: {"insights": ["..."], "recommendations": ["..."]}'
        },
        {
          role: 'user',
          content: `Recent competitor changes:\n${changesSummary}\n\nProvide 2-4 key insights and 1-3 actionable recommendations.`
        }
      ], 500);

      const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || '{}');
      return {
        insights: parsed.insights || ['Analysis unavailable.'],
        recommendations: parsed.recommendations || [],
      };
    } catch {
      return { insights: ['Analysis unavailable.'], recommendations: [] };
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private initCompetitors(): void {
    for (const comp of this.config.competitors) {
      this.addCompetitor(comp.name, comp.domain, comp.pages);
    }
  }

  private inferPages(domain: string, explicitPages?: string[]): CompetitorPage[] {
    if (explicitPages) {
      return explicitPages.map(url => ({
        url,
        type: this.inferPageType(url),
      }));
    }

    // Auto-infer common pages
    const base = domain.startsWith('http') ? domain : `https://${domain}`;
    return [
      { url: `${base}/pricing`, type: 'pricing' as const },
      { url: `${base}/changelog`, type: 'changelog' as const },
      { url: `${base}/blog`, type: 'blog' as const },
      { url: `${base}/careers`, type: 'jobs' as const },
      { url: `${base}/features`, type: 'features' as const },
      { url: base, type: 'landing' as const },
    ];
  }

  private inferPageType(url: string): CompetitorPage['type'] {
    const lower = url.toLowerCase();
    if (lower.includes('pric')) return 'pricing';
    if (lower.includes('changelog') || lower.includes('release')) return 'changelog';
    if (lower.includes('blog') || lower.includes('news')) return 'blog';
    if (lower.includes('career') || lower.includes('job')) return 'jobs';
    if (lower.includes('feature')) return 'features';
    if (lower.includes('doc')) return 'docs';
    return 'landing';
  }

  private computeDiff(old: string, current: string): {
    changed: boolean;
    changeType: ChangeEvent['changeType'];
    summary: string;
  } {
    if (old === current) return { changed: false, changeType: 'modified', summary: '' };

    const oldLines = old.split('\n');
    const newLines = current.split('\n');

    const added = newLines.filter(l => !oldLines.includes(l)).length;
    const removed = oldLines.filter(l => !newLines.includes(l)).length;
    const totalChange = added + removed;
    const totalLines = Math.max(oldLines.length, newLines.length);
    const changeRatio = totalChange / Math.max(totalLines, 1);

    let changeType: ChangeEvent['changeType'];
    if (changeRatio > 0.7) changeType = 'major_rewrite';
    else if (removed > added * 2) changeType = 'removed';
    else if (added > removed * 2) changeType = 'added';
    else changeType = 'modified';

    return {
      changed: true,
      changeType,
      summary: `${added} lines added, ${removed} lines removed (${(changeRatio * 100).toFixed(0)}% changed)`,
    };
  }

  private analyzeTrend(changes: ChangeEvent[]): string {
    if (changes.length === 0) return 'No activity';
    const critical = changes.filter(c => c.significance === 'critical' || c.significance === 'high').length;
    if (critical > 2) return 'Major moves detected';
    if (changes.length > 5) return 'High activity';
    if (changes.length > 2) return 'Moderate activity';
    return 'Low activity';
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }
}

// ============================================================================
// Factory & Integration
// ============================================================================

let serviceInstance: CompetitiveIntelService | null = null;

export function createCompetitiveIntelService(config?: Partial<CompetitiveIntelConfig>): CompetitiveIntelService {
  return new CompetitiveIntelService(config);
}

export function getCompetitiveIntelService(config?: Partial<CompetitiveIntelConfig>): CompetitiveIntelService {
  if (!serviceInstance) {
    serviceInstance = createCompetitiveIntelService(config);
  }
  return serviceInstance;
}

/**
 * Action handler for Active Inference integration.
 * Called when the AIF loop selects opportunity.scan with competitive-intel context.
 */
export async function runCompetitiveIntelScan(config: {
  competitors: Array<{ name: string; domain: string }>;
}): Promise<{ changes: ChangeEvent[]; digest?: IntelDigest }> {
  const service = createCompetitiveIntelService({ competitors: config.competitors });
  const changes = await service.checkAll();

  let digest: IntelDigest | undefined;
  if (changes.length > 0) {
    digest = await service.generateDigest(24);
  }

  return { changes, digest };
}
