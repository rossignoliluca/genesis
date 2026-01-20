/**
 * Genesis v9.0 - Lucid Dream Mode Extension
 *
 * Extends the base dream mode with:
 * - Lucid dreaming (conscious control during dream)
 * - Semantic memory consolidation using embeddings
 * - Code pattern consolidation via CodeRAG
 * - Dream journal persistence
 *
 * Lucid Dreams allow Genesis to:
 * - Process specific topics during sleep
 * - Explore code patterns creatively
 * - Generate novel solutions to problems
 */

import { randomUUID } from 'crypto';
import { DreamService, DreamContext } from './dream-mode.js';
import { DreamConfig, DreamResults } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface LucidDreamConfig extends Partial<DreamConfig> {
  /** Focus topics for lucid dreaming */
  focusTopics?: string[];
  /** Enable code pattern consolidation */
  enableCodeDreams?: boolean;
  /** Path to dream journal */
  journalPath?: string;
  /** Semantic similarity threshold for memory linking */
  similarityThreshold?: number;
  /** Use embeddings for semantic consolidation */
  useEmbeddings?: boolean;
}

export interface LucidDreamSession {
  id: string;
  type: 'lucid' | 'normal';
  startedAt: Date;
  endedAt?: Date;
  focusTopics: string[];
  insights: LucidInsight[];
  codePatterns: CodePattern[];
  semanticLinks: SemanticLink[];
}

export interface LucidInsight {
  id: string;
  topic: string;
  insight: string;
  confidence: number;
  sourceMemories: string[];
  timestamp: number;
}

export interface CodePattern {
  id: string;
  pattern: string;
  description: string;
  files: string[];
  frequency: number;
  firstSeen: number;
}

export interface SemanticLink {
  sourceId: string;
  targetId: string;
  similarity: number;
  relationship: string;
}

export interface DreamJournalEntry {
  sessionId: string;
  date: string;
  duration: number;
  type: 'lucid' | 'normal';
  insights: LucidInsight[];
  patterns: CodePattern[];
  results: DreamResults;
}

// ============================================================================
// Lucid Dream Service
// ============================================================================

export class LucidDreamService {
  private baseDreamService: DreamService;
  private config: LucidDreamConfig;
  private context: DreamContext & LucidDreamContext;
  private currentLucidSession: LucidDreamSession | null = null;
  private journal: DreamJournalEntry[] = [];

  constructor(
    config: LucidDreamConfig = {},
    context: DreamContext & LucidDreamContext = {}
  ) {
    this.config = {
      focusTopics: [],
      enableCodeDreams: true,
      journalPath: '.genesis/dream-journal.json',
      similarityThreshold: 0.7,
      useEmbeddings: true,
      ...config,
    };

    this.context = context;
    this.baseDreamService = new DreamService(config, context);
    this.loadJournal();
  }

  // ============================================================================
  // Lucid Dream Control
  // ============================================================================

  /**
   * Start a lucid dream session with focus topics
   */
  async startLucidDream(topics: string[] = []): Promise<LucidDreamSession> {
    const allTopics = [...(this.config.focusTopics || []), ...topics];

    this.currentLucidSession = {
      id: randomUUID(),
      type: 'lucid',
      startedAt: new Date(),
      focusTopics: allTopics,
      insights: [],
      codePatterns: [],
      semanticLinks: [],
    };

    this.log(`Lucid dream started with topics: ${allTopics.join(', ')}`);

    // Start base dream
    const baseSession = await this.baseDreamService.startDream();

    // Run lucid extensions during dream
    this.runLucidExtensions();

    return this.currentLucidSession;
  }

  /**
   * Run lucid dream extensions during sleep phases
   */
  private async runLucidExtensions(): Promise<void> {
    if (!this.currentLucidSession) return;

    const session = this.currentLucidSession;

    // Phase 1: Semantic memory linking (during light sleep)
    await this.semanticConsolidation(session);

    // Phase 2: Code pattern discovery (during deep sleep)
    if (this.config.enableCodeDreams) {
      await this.codePatternDiscovery(session);
    }

    // Phase 3: Insight generation (during REM)
    await this.generateInsights(session);

    // Wait for base dream to complete
    const baseResults = await this.baseDreamService.waitForWake();

    // Finalize session
    session.endedAt = new Date();

    // Save to journal
    this.saveToJournal(session, baseResults);

    this.log(`Lucid dream completed: ${session.insights.length} insights, ${session.codePatterns.length} patterns`);
  }

  /**
   * Semantic memory consolidation using embeddings
   */
  private async semanticConsolidation(session: LucidDreamSession): Promise<void> {
    if (!this.config.useEmbeddings) return;
    if (!this.context.getEmbedding || !this.context.getMemoryEmbeddings) return;

    const memories = await this.context.getMemoryEmbeddings();

    // Find semantically similar memories
    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const similarity = this.cosineSimilarity(
          memories[i].embedding,
          memories[j].embedding
        );

        if (similarity >= (this.config.similarityThreshold || 0.7)) {
          session.semanticLinks.push({
            sourceId: memories[i].id,
            targetId: memories[j].id,
            similarity,
            relationship: this.inferRelationship(memories[i], memories[j]),
          });
        }
      }
    }

    this.log(`Found ${session.semanticLinks.length} semantic links`);
  }

  /**
   * Code pattern discovery using CodeRAG
   */
  private async codePatternDiscovery(session: LucidDreamSession): Promise<void> {
    if (!this.context.searchCode) return;

    // Search for each focus topic in code
    for (const topic of session.focusTopics) {
      try {
        const results = await this.context.searchCode(topic);

        if (results && results.length > 0) {
          // Extract patterns from results
          const pattern = this.extractCodePattern(topic, results);
          if (pattern) {
            session.codePatterns.push(pattern);
          }
        }
      } catch (err) {
        this.log(`Code search error for ${topic}: ${err}`, 'error');
      }
    }

    // Also discover common patterns across codebase
    if (this.context.getCodePatterns) {
      const commonPatterns = await this.context.getCodePatterns();
      for (const p of commonPatterns) {
        if (!session.codePatterns.find(cp => cp.pattern === p.pattern)) {
          session.codePatterns.push(p);
        }
      }
    }
  }

  /**
   * Generate insights from focus topics and memories
   */
  private async generateInsights(session: LucidDreamSession): Promise<void> {
    if (!this.context.generateInsight) return;

    for (const topic of session.focusTopics) {
      try {
        // Gather relevant context
        const context = {
          semanticLinks: session.semanticLinks.filter(
            l => l.relationship.includes(topic)
          ),
          codePatterns: session.codePatterns.filter(
            p => p.pattern.includes(topic) || p.description.includes(topic)
          ),
        };

        const insight = await this.context.generateInsight(topic, context);

        if (insight && insight.confidence > 0.5) {
          session.insights.push({
            id: randomUUID(),
            topic,
            insight: insight.text,
            confidence: insight.confidence,
            sourceMemories: insight.sources || [],
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        this.log(`Insight generation error for ${topic}: ${err}`, 'error');
      }
    }
  }

  /**
   * Extract a code pattern from search results
   */
  private extractCodePattern(
    topic: string,
    results: Array<{ file: string; content: string; score: number }>
  ): CodePattern | null {
    if (results.length === 0) return null;

    // Find common structure in results
    const files = results.map(r => r.file);
    const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length;

    return {
      id: randomUUID(),
      pattern: topic,
      description: `Pattern related to "${topic}" found in ${files.length} files`,
      files,
      frequency: results.length,
      firstSeen: Date.now(),
    };
  }

  /**
   * Infer relationship between two memories
   */
  private inferRelationship(
    mem1: { id: string; content?: string },
    mem2: { id: string; content?: string }
  ): string {
    // Simple relationship inference
    // In production, would use LLM or more sophisticated NLP
    return `semantic_similarity`;
  }

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // ============================================================================
  // Dream Journal
  // ============================================================================

  /**
   * Save session to journal
   */
  private saveToJournal(session: LucidDreamSession, results: DreamResults): void {
    const entry: DreamJournalEntry = {
      sessionId: session.id,
      date: session.startedAt.toISOString(),
      duration: session.endedAt
        ? session.endedAt.getTime() - session.startedAt.getTime()
        : 0,
      type: session.type,
      insights: session.insights,
      patterns: session.codePatterns,
      results,
    };

    this.journal.push(entry);

    // Persist
    this.persistJournal();
  }

  /**
   * Load journal from disk
   */
  private loadJournal(): void {
    try {
      const journalPath = this.config.journalPath || '.genesis/dream-journal.json';
      if (fs.existsSync(journalPath)) {
        const data = fs.readFileSync(journalPath, 'utf-8');
        this.journal = JSON.parse(data);
        this.log(`Loaded ${this.journal.length} dream journal entries`);
      }
    } catch (err) {
      this.log(`Failed to load dream journal: ${err}`, 'warn');
      this.journal = [];
    }
  }

  /**
   * Persist journal to disk
   */
  private persistJournal(): void {
    try {
      const journalPath = this.config.journalPath || '.genesis/dream-journal.json';
      const dir = path.dirname(journalPath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(journalPath, JSON.stringify(this.journal, null, 2));
    } catch (err) {
      this.log(`Failed to persist dream journal: ${err}`, 'error');
    }
  }

  /**
   * Get recent dreams from journal
   */
  getRecentDreams(count: number = 10): DreamJournalEntry[] {
    return this.journal.slice(-count).reverse();
  }

  /**
   * Get all insights from journal
   */
  getAllInsights(): LucidInsight[] {
    return this.journal.flatMap(e => e.insights);
  }

  /**
   * Search journal by topic
   */
  searchJournal(query: string): DreamJournalEntry[] {
    const lowerQuery = query.toLowerCase();
    return this.journal.filter(entry =>
      entry.insights.some(i =>
        i.topic.toLowerCase().includes(lowerQuery) ||
        i.insight.toLowerCase().includes(lowerQuery)
      ) ||
      entry.patterns.some(p =>
        p.pattern.toLowerCase().includes(lowerQuery) ||
        p.description.toLowerCase().includes(lowerQuery)
      )
    );
  }

  // ============================================================================
  // Utils
  // ============================================================================

  private log(
    message: string,
    level: 'debug' | 'info' | 'warn' | 'error' = 'info'
  ): void {
    const prefix = '[LucidDream]';
    if (level === 'debug' && process.env.LOG_LEVEL !== 'debug') return;

    switch (level) {
      case 'debug':
      case 'info':
        console.log(`${prefix} ${message}`);
        break;
      case 'warn':
        console.warn(`${prefix} ${message}`);
        break;
      case 'error':
        console.error(`${prefix} ${message}`);
        break;
    }
  }
}

// ============================================================================
// Extended Dream Context
// ============================================================================

export interface LucidDreamContext {
  /** Get embedding for text */
  getEmbedding?: (text: string) => Promise<number[]>;

  /** Get all memory embeddings */
  getMemoryEmbeddings?: () => Promise<Array<{
    id: string;
    content?: string;
    embedding: number[];
  }>>;

  /** Search code using CodeRAG */
  searchCode?: (query: string) => Promise<Array<{
    file: string;
    content: string;
    score: number;
  }>>;

  /** Get common code patterns */
  getCodePatterns?: () => Promise<CodePattern[]>;

  /** Generate insight from topic and context */
  generateInsight?: (
    topic: string,
    context: {
      semanticLinks: SemanticLink[];
      codePatterns: CodePattern[];
    }
  ) => Promise<{ text: string; confidence: number; sources: string[] } | null>;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a lucid dream service with code integration
 */
export function createLucidDreamService(
  config?: LucidDreamConfig,
  context?: DreamContext & LucidDreamContext
): LucidDreamService {
  return new LucidDreamService(config, context);
}

/**
 * Quick lucid dream about a specific topic
 */
export async function dreamAbout(
  topic: string,
  context?: DreamContext & LucidDreamContext
): Promise<LucidDreamSession> {
  const service = createLucidDreamService(
    { focusTopics: [topic] },
    context
  );
  return service.startLucidDream([topic]);
}

export default LucidDreamService;
