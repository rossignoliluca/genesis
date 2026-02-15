/**
 * Content Intelligence v24.0
 *
 * AI-powered content optimization using:
 * - Engagement pattern analysis
 * - Viral potential prediction
 * - Optimal timing learning
 * - Trend-based idea generation
 * - A/B testing insights
 *
 * Integrates with Memory for learning and Event Bus for coordination.
 *
 * @module content/intelligence
 * @version 24.0.0
 */

import { getEventBus, type GenesisEventBus } from '../bus/index.js';
import { getMemorySystem, type MemorySystem } from '../memory/index.js';
import { getHybridRouter } from '../llm/router.js';
import type { Platform, ContentType } from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface EngagementPattern {
  platform: Platform;
  contentType: ContentType;
  dayOfWeek: number;  // 0-6
  hourOfDay: number;  // 0-23
  avgEngagement: number;
  engagementVelocity: number;  // Rate of engagement growth
  sampleSize: number;
}

export interface ViralPrediction {
  score: number;  // 0-1 viral potential
  factors: {
    novelty: number;
    emotion: number;
    timeliness: number;
    shareability: number;
    controversy: number;
  };
  confidence: number;
  suggestedTweaks: string[];
}

export interface OptimalTiming {
  platform: Platform;
  bestDays: number[];
  bestHours: number[];
  avoidDays: number[];
  avoidHours: number[];
  confidence: number;
}

export interface ContentIdea {
  topic: string;
  angle: string;
  targetPlatform: Platform;
  predictedEngagement: number;
  trendBasis: string;
  contentType: ContentType;
  urgency: 'immediate' | 'this-week' | 'evergreen';
}

export interface ABTestResult {
  testId: string;
  variantA: { content: string; engagement: number };
  variantB: { content: string; engagement: number };
  winner: 'A' | 'B' | 'inconclusive';
  significance: number;
  learnings: string[];
}

export interface ContentIntelligenceConfig {
  learningRate: number;
  minSamplesForPrediction: number;
  trendWindowDays: number;
  viralThreshold: number;
  abTestDuration: number;  // hours
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ContentIntelligenceConfig = {
  learningRate: 0.1,
  minSamplesForPrediction: 10,
  trendWindowDays: 7,
  viralThreshold: 0.7,
  abTestDuration: 24,
};

// ============================================================================
// Content Intelligence Engine
// ============================================================================

export class ContentIntelligence {
  private config: ContentIntelligenceConfig;
  private bus: GenesisEventBus;
  private memory: MemorySystem;
  private router = getHybridRouter();

  // Engagement tracking
  private engagementHistory: Map<string, EngagementPattern[]> = new Map();
  private contentPerformance: Map<string, { engagement: number; viral: boolean; timestamp: Date }> = new Map();
  private activeTests: Map<string, { variantA: string; variantB: string; started: Date }> = new Map();

  // Learning state
  private optimalTimings: Map<Platform, OptimalTiming> = new Map();
  private trendCache: Map<string, { trend: string; expires: Date }> = new Map();
  private ideaQueue: ContentIdea[] = [];

  constructor(config?: Partial<ContentIntelligenceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bus = getEventBus();
    this.memory = getMemorySystem();
    this.setupEventHandlers();
    this.initializeFromMemory();
  }

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  private setupEventHandlers(): void {
    // Listen for content published events
    this.bus.subscribePrefix('content.', (event: any) => {
      if (event.topic === 'content.published') {
        this.trackPublishedContent(event.payload);
      }
      if (event.topic === 'content.engagement') {
        this.recordEngagement(event.payload);
      }
    });

    // Listen for trending topics
    this.bus.subscribePrefix('market.', (event: any) => {
      if (event.topic === 'market.trend.detected') {
        this.processTrend(event.payload);
      }
    });
  }

  private async initializeFromMemory(): Promise<void> {
    try {
      // Recall past performance patterns
      const patterns = this.memory.recall('content engagement patterns', {
        types: ['semantic'],
        limit: 50
      });

      for (const pattern of patterns) {
        // Access pattern properties based on actual Memory type
        const patternData = pattern as any;
        if (patternData.platform && patternData.engagementPattern) {
          const key = `${patternData.platform}-${patternData.contentType}`;
          if (!this.engagementHistory.has(key)) {
            this.engagementHistory.set(key, []);
          }
          this.engagementHistory.get(key)!.push(patternData.engagementPattern);
        }
      }

      console.log(`[ContentIntelligence] Loaded ${patterns.length} historical patterns`);
    } catch (err) {
      // Memory not available, start fresh
      console.error('[ContentIntelligence] Pattern loading failed:', err);
    }
  }

  // ===========================================================================
  // Engagement Analysis
  // ===========================================================================

  private trackPublishedContent(payload: any): void {
    const id = payload.contentId || `content-${Date.now()}`;
    this.contentPerformance.set(id, {
      engagement: 0,
      viral: false,
      timestamp: new Date(),
    });
  }

  private recordEngagement(payload: any): void {
    const id = payload.contentId;
    if (!id) return;

    const perf = this.contentPerformance.get(id);
    if (perf) {
      perf.engagement = payload.engagement || 0;
      perf.viral = perf.engagement > this.config.viralThreshold * 1000;

      // Record pattern
      this.recordEngagementPattern({
        platform: payload.platform,
        contentType: payload.contentType,
        engagement: perf.engagement,
        timestamp: perf.timestamp,
      });
    }
  }

  private recordEngagementPattern(data: {
    platform: Platform;
    contentType: ContentType;
    engagement: number;
    timestamp: Date;
  }): void {
    const key = `${data.platform}-${data.contentType}`;
    if (!this.engagementHistory.has(key)) {
      this.engagementHistory.set(key, []);
    }

    const pattern: EngagementPattern = {
      platform: data.platform,
      contentType: data.contentType,
      dayOfWeek: data.timestamp.getDay(),
      hourOfDay: data.timestamp.getHours(),
      avgEngagement: data.engagement,
      engagementVelocity: 0,  // Would compute from delta
      sampleSize: 1,
    };

    this.engagementHistory.get(key)!.push(pattern);

    // Update optimal timing
    this.updateOptimalTiming(data.platform);

    // Store in memory for persistence
    this.memory.learn({
      concept: `${data.platform}-${data.contentType}-engagement`,
      definition: `Engagement pattern for ${data.contentType} on ${data.platform}`,
      category: 'content-intelligence',
      confidence: 0.8,
    });
  }

  private updateOptimalTiming(platform: Platform): void {
    const patterns = Array.from(this.engagementHistory.values())
      .flat()
      .filter(p => p.platform === platform);

    if (patterns.length < this.config.minSamplesForPrediction) return;

    // Aggregate by day and hour
    const dayStats = new Map<number, number[]>();
    const hourStats = new Map<number, number[]>();

    for (const p of patterns) {
      if (!dayStats.has(p.dayOfWeek)) dayStats.set(p.dayOfWeek, []);
      if (!hourStats.has(p.hourOfDay)) hourStats.set(p.hourOfDay, []);
      dayStats.get(p.dayOfWeek)!.push(p.avgEngagement);
      hourStats.get(p.hourOfDay)!.push(p.avgEngagement);
    }

    // Find best and worst
    const dayAvgs = Array.from(dayStats.entries()).map(([day, vals]) => ({
      day,
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    })).sort((a, b) => b.avg - a.avg);

    const hourAvgs = Array.from(hourStats.entries()).map(([hour, vals]) => ({
      hour,
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    })).sort((a, b) => b.avg - a.avg);

    this.optimalTimings.set(platform, {
      platform,
      bestDays: dayAvgs.slice(0, 3).map(d => d.day),
      bestHours: hourAvgs.slice(0, 4).map(h => h.hour),
      avoidDays: dayAvgs.slice(-2).map(d => d.day),
      avoidHours: hourAvgs.slice(-4).map(h => h.hour),
      confidence: Math.min(0.9, patterns.length / 100),
    });
  }

  // ===========================================================================
  // Viral Prediction
  // ===========================================================================

  async predictViralPotential(content: string, platform: Platform): Promise<ViralPrediction> {
    // Use LLM to analyze content
    const systemPrompt = `You are a viral content analyst. Analyze the following content and rate its viral potential.
Return JSON with:
- novelty: 0-1 (how unique/new)
- emotion: 0-1 (emotional impact)
- timeliness: 0-1 (relevance to current events)
- shareability: 0-1 (how shareable)
- controversy: 0-1 (controversial but not offensive)
- suggestedTweaks: array of improvement suggestions`;

    try {
      const routerResponse = await this.router.execute(
        `Platform: ${platform}\n\nContent:\n${content}`,
        systemPrompt
      );
      const responseText = typeof routerResponse === 'string' ? routerResponse : routerResponse.content || '';

      // Parse response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);

        const factors = {
          novelty: analysis.novelty ?? 0.5,
          emotion: analysis.emotion ?? 0.5,
          timeliness: analysis.timeliness ?? 0.5,
          shareability: analysis.shareability ?? 0.5,
          controversy: analysis.controversy ?? 0.3,
        };

        // Weighted score
        const score = (
          factors.novelty * 0.2 +
          factors.emotion * 0.25 +
          factors.timeliness * 0.2 +
          factors.shareability * 0.25 +
          factors.controversy * 0.1
        );

        return {
          score,
          factors,
          confidence: 0.7,
          suggestedTweaks: analysis.suggestedTweaks || [],
        };
      }
    } catch (error) {
      console.warn('[ContentIntelligence] Viral prediction failed:', error);
    }

    // Fallback
    return {
      score: 0.5,
      factors: { novelty: 0.5, emotion: 0.5, timeliness: 0.5, shareability: 0.5, controversy: 0.3 },
      confidence: 0.3,
      suggestedTweaks: [],
    };
  }

  // ===========================================================================
  // Trend Processing
  // ===========================================================================

  private processTrend(payload: any): void {
    const trend = payload.trend || payload.topic;
    if (!trend) return;

    this.trendCache.set(trend, {
      trend,
      expires: new Date(Date.now() + this.config.trendWindowDays * 24 * 60 * 60 * 1000),
    });

    // Generate content ideas from trend
    this.generateIdeasFromTrend(trend);
  }

  private async generateIdeasFromTrend(trend: string): Promise<void> {
    const systemPrompt = `You are a content strategist. Given a trending topic, generate 3 content ideas.
For each idea, provide:
- topic: specific topic
- angle: unique perspective
- targetPlatform: twitter, linkedin, or bluesky
- contentType: tweet, thread, article, or post
- urgency: immediate, this-week, or evergreen

Return as JSON array.`;

    try {
      const routerResponse = await this.router.execute(
        `Trending topic: ${trend}`,
        systemPrompt
      );
      const responseText = typeof routerResponse === 'string' ? routerResponse : routerResponse.content || '';

      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const ideas = JSON.parse(jsonMatch[0]);
        for (const idea of ideas) {
          this.ideaQueue.push({
            topic: idea.topic,
            angle: idea.angle,
            targetPlatform: idea.targetPlatform || 'twitter',
            predictedEngagement: 0.6,  // Baseline
            trendBasis: trend,
            contentType: idea.contentType || 'tweet',
            urgency: idea.urgency || 'this-week',
          });
        }
      }
    } catch (err) {
      // Idea generation failed
      console.error('[ContentIntelligence] Idea generation failed:', err);
    }
  }

  // ===========================================================================
  // A/B Testing
  // ===========================================================================

  startABTest(variantA: string, variantB: string): string {
    const testId = `ab-${Date.now().toString(36)}`;
    this.activeTests.set(testId, {
      variantA,
      variantB,
      started: new Date(),
    });
    return testId;
  }

  recordABResult(testId: string, variant: 'A' | 'B', engagement: number): void {
    // Would accumulate results and compute winner when enough data
  }

  getABTestResult(testId: string): ABTestResult | null {
    const test = this.activeTests.get(testId);
    if (!test) return null;

    // Placeholder - would have actual stats
    return {
      testId,
      variantA: { content: test.variantA, engagement: 0 },
      variantB: { content: test.variantB, engagement: 0 },
      winner: 'inconclusive',
      significance: 0,
      learnings: [],
    };
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Get optimal posting time for a platform
   */
  getOptimalTiming(platform: Platform): OptimalTiming | null {
    return this.optimalTimings.get(platform) || null;
  }

  /**
   * Get content ideas queue
   */
  getContentIdeas(limit: number = 10): ContentIdea[] {
    // Sort by urgency and predicted engagement
    const sorted = [...this.ideaQueue].sort((a, b) => {
      const urgencyOrder = { immediate: 0, 'this-week': 1, evergreen: 2 };
      const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      if (urgencyDiff !== 0) return urgencyDiff;
      return b.predictedEngagement - a.predictedEngagement;
    });
    return sorted.slice(0, limit);
  }

  /**
   * Get current trends
   */
  getActiveTrends(): string[] {
    const now = new Date();
    return Array.from(this.trendCache.entries())
      .filter(([, v]) => v.expires > now)
      .map(([k]) => k);
  }

  /**
   * Get engagement statistics
   */
  getEngagementStats(): {
    totalTracked: number;
    viralCount: number;
    avgEngagement: number;
    topPlatform: Platform | null;
  } {
    const perfs = Array.from(this.contentPerformance.values());
    const totalTracked = perfs.length;
    const viralCount = perfs.filter(p => p.viral).length;
    const avgEngagement = totalTracked > 0
      ? perfs.reduce((sum, p) => sum + p.engagement, 0) / totalTracked
      : 0;

    // Find top platform
    const platformCounts = new Map<Platform, number>();
    for (const patterns of this.engagementHistory.values()) {
      for (const p of patterns) {
        const current = platformCounts.get(p.platform) || 0;
        platformCounts.set(p.platform, current + p.avgEngagement);
      }
    }
    const sorted = Array.from(platformCounts.entries()).sort((a, b) => b[1] - a[1]);
    const topPlatform = sorted[0]?.[0] || null;

    return { totalTracked, viralCount, avgEngagement, topPlatform };
  }

  /**
   * Analyze content before posting
   */
  async analyzeContent(content: string, platform: Platform): Promise<{
    viralPotential: ViralPrediction;
    optimalTiming: OptimalTiming | null;
    recommendations: string[];
  }> {
    const viralPotential = await this.predictViralPotential(content, platform);
    const optimalTiming = this.getOptimalTiming(platform);

    const recommendations: string[] = [];

    // Timing recommendations
    if (optimalTiming) {
      const now = new Date();
      const currentDay = now.getDay();
      const currentHour = now.getHours();

      if (optimalTiming.avoidDays.includes(currentDay)) {
        recommendations.push(`Consider posting on day ${optimalTiming.bestDays[0]} instead`);
      }
      if (optimalTiming.avoidHours.includes(currentHour)) {
        recommendations.push(`Consider posting at hour ${optimalTiming.bestHours[0]} instead`);
      }
    }

    // Viral potential recommendations
    if (viralPotential.score < 0.5) {
      recommendations.push(...viralPotential.suggestedTweaks.slice(0, 3));
    }

    // Emotion boost
    if (viralPotential.factors.emotion < 0.5) {
      recommendations.push('Add more emotional appeal to increase shareability');
    }

    return {
      viralPotential,
      optimalTiming,
      recommendations,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let intelligenceInstance: ContentIntelligence | null = null;

export function getContentIntelligence(config?: Partial<ContentIntelligenceConfig>): ContentIntelligence {
  if (!intelligenceInstance) {
    intelligenceInstance = new ContentIntelligence(config);
  }
  return intelligenceInstance;
}

export function resetContentIntelligence(): void {
  intelligenceInstance = null;
}
