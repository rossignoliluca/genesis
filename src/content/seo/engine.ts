/**
 * SEO Optimization Engine
 *
 * Keyword research, content optimization, and SEO scoring.
 */

import type { KeywordData, CompetitionAnalysis, SEOScore, ContentDraft } from '../types.js';

export interface SEOEngineConfig {
  targetKeywordDensity?: number;
  minTitleLength?: number;
  maxTitleLength?: number;
  minMetaDescLength?: number;
  maxMetaDescLength?: number;
}

const DEFAULT_CONFIG = {
  targetKeywordDensity: 0.02,
  minTitleLength: 30,
  maxTitleLength: 60,
  minMetaDescLength: 120,
  maxMetaDescLength: 160,
};

export class SEOEngine {
  private config: Required<SEOEngineConfig>;
  private keywordCache: Map<string, KeywordData[]> = new Map();

  private static instance: SEOEngine | null = null;

  private constructor(config?: SEOEngineConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  static getInstance(config?: SEOEngineConfig): SEOEngine {
    if (!SEOEngine.instance) SEOEngine.instance = new SEOEngine(config);
    return SEOEngine.instance;
  }

  async researchKeywords(topic: string): Promise<KeywordData[]> {
    const cached = this.keywordCache.get(topic.toLowerCase());
    if (cached) return cached;

    const keywords: KeywordData[] = [];
    const baseTopic = topic.toLowerCase().trim();

    // Primary keyword
    keywords.push({
      keyword: baseTopic,
      searchVolume: this.estimateSearchVolume(baseTopic),
      difficulty: this.estimateDifficulty(baseTopic),
      cpc: this.estimateCPC(baseTopic),
      trend: 'stable',
      relatedKeywords: [`how to ${baseTopic}`, `best ${baseTopic}`, `${baseTopic} guide`],
    });

    // Long-tail variations
    for (const prefix of ['how to', 'what is', 'best', 'top', 'guide to']) {
      keywords.push({
        keyword: `${prefix} ${baseTopic}`,
        searchVolume: Math.floor(this.estimateSearchVolume(baseTopic) * 0.3),
        difficulty: Math.max(10, this.estimateDifficulty(baseTopic) - 20),
        cpc: this.estimateCPC(baseTopic) * 0.8,
        trend: 'rising',
        relatedKeywords: [],
      });
    }

    this.keywordCache.set(topic.toLowerCase(), keywords);
    return keywords;
  }

  async analyzeCompetition(keyword: string): Promise<CompetitionAnalysis> {
    return {
      keyword: keyword.toLowerCase(),
      topResults: [
        { url: 'https://example.com/1', title: 'Guide', domainAuthority: 65, wordCount: 2500, backlinks: 150 },
        { url: 'https://example.com/2', title: 'Analysis', domainAuthority: 55, wordCount: 1800, backlinks: 80 },
      ],
      averageWordCount: 2000,
      averageDomainAuthority: 55,
      contentGaps: [`${keyword} for beginners`, `advanced ${keyword}`, `${keyword} trends ${new Date().getFullYear()}`],
    };
  }

  optimizeTitle(title: string, keywords: string[]): string {
    let optimized = title.trim();
    if (optimized.length > this.config.maxTitleLength) {
      optimized = optimized.slice(0, this.config.maxTitleLength - 3) + '...';
    }
    return optimized;
  }

  generateMetaDescription(content: string, keywords: string[] = [], maxLength = 160): string {
    const paragraphs = content.split(/\n\n+/).filter((p) => p.trim().length > 50);
    let description = this.stripMarkdown(paragraphs[0] || content.slice(0, 200));
    if (description.length > maxLength) description = description.slice(0, maxLength - 3) + '...';
    return description;
  }

  suggestHeadings(content: string, keywords: string[]): string[] {
    const pk = keywords[0] || 'topic';
    return [
      `What is ${pk}?`,
      `Why ${pk} Matters`,
      `How to Get Started with ${pk}`,
      `Best Practices for ${pk}`,
      `Common ${pk} Mistakes to Avoid`,
    ];
  }

  calculateSEOScore(content: ContentDraft): SEOScore {
    const scores = {
      titleScore: this.scoreTitleSEO(content.title, content.keywords),
      metaDescriptionScore: content.excerpt ? this.scoreMetaDescription(content.excerpt, content.keywords) : 50,
      headingsScore: this.scoreHeadings(content.content),
      keywordDensityScore: this.scoreKeywordDensity(content.content, content.keywords),
      readabilityScore: this.scoreReadability(content.content),
      internalLinksScore: this.scoreInternalLinks(content.content),
    };

    const overall = Math.round(
      scores.titleScore * 0.2 +
      scores.metaDescriptionScore * 0.15 +
      scores.headingsScore * 0.15 +
      scores.keywordDensityScore * 0.2 +
      scores.readabilityScore * 0.2 +
      scores.internalLinksScore * 0.1
    );

    return { overall, ...scores, suggestions: this.generateSuggestions(scores) };
  }

  generateHashtags(content: string, keywords: string[], limit = 5): string[] {
    const hashtags = new Set<string>();
    for (const kw of keywords) {
      hashtags.add(kw.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(''));
    }
    return Array.from(hashtags).slice(0, limit);
  }

  private estimateSearchVolume(keyword: string): number {
    const wordCount = keyword.split(/\s+/).length;
    return Math.floor(5000 / (wordCount * 0.5));
  }

  private estimateDifficulty(keyword: string): number {
    const wordCount = keyword.split(/\s+/).length;
    if (wordCount >= 4) return 25;
    if (wordCount >= 3) return 40;
    if (wordCount >= 2) return 55;
    return 75;
  }

  private estimateCPC(keyword: string): number {
    const commercial = ['buy', 'price', 'service', 'tool', 'software', 'best'];
    const hasCommercial = commercial.some((t) => keyword.toLowerCase().includes(t));
    return hasCommercial ? 1.5 : 0.5;
  }

  private scoreTitleSEO(title: string, keywords: string[]): number {
    let score = 100;
    if (title.length < this.config.minTitleLength) score -= 20;
    if (title.length > this.config.maxTitleLength) score -= 15;
    if (keywords[0] && !title.toLowerCase().includes(keywords[0].toLowerCase())) score -= 25;
    return Math.max(0, score);
  }

  private scoreMetaDescription(desc: string, keywords: string[]): number {
    let score = 100;
    if (desc.length < this.config.minMetaDescLength) score -= 20;
    if (desc.length > this.config.maxMetaDescLength) score -= 10;
    if (keywords[0] && !desc.toLowerCase().includes(keywords[0].toLowerCase())) score -= 20;
    return Math.max(0, score);
  }

  private scoreHeadings(content: string): number {
    let score = 100;
    const h2 = (content.match(/^##\s/gm) || []).length;
    if (h2 === 0) score -= 30;
    else if (h2 < 3) score -= 15;
    return Math.max(0, score);
  }

  private scoreKeywordDensity(content: string, keywords: string[]): number {
    if (!keywords[0]) return 50;
    const words = content.toLowerCase().split(/\s+/);
    const count = words.filter((w) => w.includes(keywords[0].toLowerCase())).length;
    const density = count / words.length;
    const deviation = Math.abs(density - this.config.targetKeywordDensity);
    if (deviation < 0.005) return 100;
    if (deviation < 0.01) return 85;
    if (deviation < 0.02) return 70;
    return 50;
  }

  private scoreReadability(content: string): number {
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const words = content.split(/\s+/);
    const avgWordsPerSentence = words.length / sentences.length;
    let score = 100;
    if (avgWordsPerSentence > 25) score -= 20;
    else if (avgWordsPerSentence > 20) score -= 10;
    return Math.max(0, score);
  }

  private scoreInternalLinks(content: string): number {
    const links = (content.match(/\[([^\]]+)\]\(([^)]+)\)/g) || []).length;
    if (links === 0) return 40;
    if (links < 3) return 60;
    if (links < 5) return 80;
    return 100;
  }

  private generateSuggestions(scores: Record<string, number>): string[] {
    const suggestions: string[] = [];
    if (scores.titleScore < 70) suggestions.push('Optimize your title: include primary keyword near the beginning');
    if (scores.metaDescriptionScore < 70) suggestions.push('Improve meta description: add a clear call-to-action');
    if (scores.headingsScore < 70) suggestions.push('Use H2 and H3 headings to organize content');
    if (scores.keywordDensityScore < 70) suggestions.push('Adjust keyword density to around 2%');
    if (scores.readabilityScore < 70) suggestions.push('Use shorter sentences for better readability');
    if (scores.internalLinksScore < 70) suggestions.push('Add more internal links to related content');
    return suggestions;
  }

  private stripMarkdown(text: string): string {
    return text
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trim();
  }
}

export function getSEOEngine(config?: SEOEngineConfig): SEOEngine {
  return SEOEngine.getInstance(config);
}
