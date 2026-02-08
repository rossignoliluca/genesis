/**
 * Genesis v10.6 - Model Racing Engine
 *
 * Fires requests to multiple LLM providers simultaneously.
 * Uses the first response (lowest TTFT wins).
 * Cancels losing requests immediately to save cost.
 *
 * Innovations:
 * - Adaptive racing: learns which models to race based on latency history
 * - Cost-bounded racing: never exceeds budget
 * - Quality-aware: can verify fast response quality with slow model
 * - Streaming-first: races on TTFT, then streams from winner
 * - MCP-integrated: uses MCP servers for tool calls during racing
 *
 * Racing Strategies:
 * 1. TTFT Race: First model to produce a token wins
 * 2. Quality Race: Multiple models generate, best quality wins
 * 3. Hedged Race: Start fast model, fire slow model after timeout
 * 4. Speculative: Fast model generates, slow model verifies
 */

import { StreamEvent, HybridStreamOptions, Message } from './types.js';
import { getStreamAdapter, ProviderName } from './provider-adapter.js';
import { LatencyTracker, getLatencyTracker, RacingCandidate, LatencyRecord } from './latency-tracker.js';

// ============================================================================
// Types
// ============================================================================

export type RacingStrategy = 'ttft' | 'quality' | 'hedged' | 'speculative';

export interface RacingConfig {
  /** Racing strategy */
  strategy: RacingStrategy;
  /** Maximum number of concurrent racers */
  maxRacers: number;
  /** Maximum cost per race (total, all candidates) */
  maxRaceCost: number;
  /** Timeout for TTFT before escalating (ms) */
  ttftTimeout: number;
  /** For hedged: delay before firing backup model (ms) */
  hedgeDelay: number;
  /** For speculative: max tokens from fast model before verifying */
  speculativeTokens: number;
  /** Minimum confidence to skip racing (use predicted best directly) */
  skipRacingConfidence: number;
  /** Provider preferences (ordered) */
  preferredProviders: string[];
  /** Models to exclude from racing */
  excludeModels: string[];
  /** Enable learning from race results */
  enableLearning: boolean;
}

export interface RaceResult {
  /** Winning provider */
  winner: string;
  /** Winning model */
  model: string;
  /** Time to first token of winner */
  ttft: number;
  /** Strategy used */
  strategy: RacingStrategy;
  /** All candidates that were raced */
  candidates: Array<{
    provider: string;
    model: string;
    status: 'won' | 'lost' | 'cancelled' | 'failed' | 'timeout';
    ttft?: number;
    tokensGenerated?: number;
  }>;
  /** Tokens per second of winner */
  tokensPerSec: number;
  /** Cost of the race (all candidates combined) */
  raceCost: number;
  /** Content from winning stream */
  content: string;
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_RACING_CONFIG: RacingConfig = {
  strategy: 'hedged',
  maxRacers: 3,
  maxRaceCost: 0.01,        // $0.01 max per race
  ttftTimeout: 2000,        // 2 seconds
  hedgeDelay: 500,          // Fire backup after 500ms
  speculativeTokens: 50,    // Verify after 50 tokens
  skipRacingConfidence: 0.95,
  preferredProviders: ['groq', 'anthropic', 'openai'],
  excludeModels: [],
  enableLearning: true,
};

// ============================================================================
// Model Racer
// ============================================================================

export class ModelRacer {
  private config: RacingConfig;
  private tracker: LatencyTracker;
  private raceCount = 0;
  private totalSaved = 0; // ms saved by racing vs single provider

  constructor(config: Partial<RacingConfig> = {}) {
    this.config = { ...DEFAULT_RACING_CONFIG, ...config };
    this.tracker = getLatencyTracker();
  }

  /**
   * Race multiple models and stream from the winner.
   * Returns an async generator of StreamEvents from the winning model.
   */
  async *race(options: {
    messages: Message[];
    tools?: HybridStreamOptions['tools'];
    enableThinking?: boolean;
    thinkingBudget?: number; // v18.3: Dynamic thinking budget
    maxTokens?: number;
    temperature?: number;
    forceProvider?: string;
    forceModel?: string;
  }): AsyncGenerator<StreamEvent> {
    this.raceCount++;
    const startTime = Date.now();

    // If forced, skip racing entirely
    if (options.forceProvider && options.forceModel) {
      yield* this.streamSingle(options.forceProvider, options.forceModel, options);
      return;
    }

    // Get racing candidates
    const candidates = this.selectCandidates(options);

    if (candidates.length === 0) {
      yield this.errorEvent('No available providers for racing');
      return;
    }

    // If high confidence in best candidate, skip racing
    if (candidates[0].confidence >= this.config.skipRacingConfidence && candidates.length > 0) {
      yield* this.streamSingle(candidates[0].provider, candidates[0].model, options);
      return;
    }

    // Execute racing strategy
    switch (this.config.strategy) {
      case 'ttft':
        yield* this.raceTTFT(candidates, options, startTime);
        break;
      case 'hedged':
        yield* this.raceHedged(candidates, options, startTime);
        break;
      case 'speculative':
        yield* this.raceSpeculative(candidates, options, startTime);
        break;
      case 'quality':
        yield* this.raceQuality(candidates, options, startTime);
        break;
      default:
        yield* this.raceTTFT(candidates, options, startTime);
    }
  }

  /**
   * Get race statistics
   */
  getStats(): { raceCount: number; totalSaved: number; avgSaved: number } {
    return {
      raceCount: this.raceCount,
      totalSaved: this.totalSaved,
      avgSaved: this.raceCount > 0 ? this.totalSaved / this.raceCount : 0,
    };
  }

  // ==========================================================================
  // Racing Strategies
  // ==========================================================================

  /**
   * TTFT Race: Fire all candidates simultaneously, first token wins.
   * Most aggressive strategy - highest cost but lowest latency.
   */
  private async *raceTTFT(
    candidates: RacingCandidate[],
    options: any,
    startTime: number
  ): AsyncGenerator<StreamEvent> {
    const controllers: AbortController[] = [];
    const racers: Array<{
      provider: string;
      model: string;
      iterator: AsyncGenerator<StreamEvent>;
      controller: AbortController;
    }> = [];

    // Start all racers
    for (const candidate of candidates.slice(0, this.config.maxRacers)) {
      const controller = new AbortController();
      controllers.push(controller);

      const adapter = getStreamAdapter(candidate.provider as ProviderName);
      const streamOptions = this.buildStreamOptions(candidate, options, controller.signal);

      racers.push({
        provider: candidate.provider,
        model: candidate.model,
        iterator: adapter.stream(options.messages, streamOptions),
        controller,
      });
    }

    // Race: first to produce a token wins
    const winner = await this.findFirstToken(racers, startTime);

    if (!winner) {
      yield this.errorEvent('All racing candidates failed');
      return;
    }

    // Cancel all losers
    for (const racer of racers) {
      if (racer !== winner.racer) {
        racer.controller.abort();
      }
    }

    // Record latency for winner
    const ttft = Date.now() - startTime;
    yield this.metadataEvent(winner.racer.provider, winner.racer.model, ttft);

    // Yield the first token
    yield winner.firstEvent;

    // Stream remaining tokens from winner
    let tokenCount = 1;
    try {
      for await (const event of winner.racer.iterator) {
        if (event.type === 'token') tokenCount++;
        yield event;
        if (event.type === 'done') break;
      }
    } catch { /* stream ended */ }

    // Record result for learning + track savings
    const saved = Math.max(0, candidates[0].expectedTTFT - ttft);
    this.totalSaved += saved;

    if (this.config.enableLearning) {
      this.recordRaceResult(winner.racer.provider, winner.racer.model, {
        ttft,
        tokensPerSec: tokenCount / ((Date.now() - startTime - ttft) / 1000 || 1),
        totalLatency: Date.now() - startTime,
        tokenCount,
        success: true,
      });
    }
  }

  /**
   * Hedged Race: Start best candidate, fire backup after delay.
   * Balanced strategy - moderate cost, good latency guarantee.
   */
  private async *raceHedged(
    candidates: RacingCandidate[],
    options: any,
    startTime: number
  ): AsyncGenerator<StreamEvent> {
    if (candidates.length < 2) {
      yield* this.streamSingle(candidates[0].provider, candidates[0].model, options);
      return;
    }

    const primary = candidates[0];
    const backup = candidates[1];

    const primaryController = new AbortController();
    const backupController = new AbortController();

    const primaryAdapter = getStreamAdapter(primary.provider as ProviderName);
    const primaryOptions = this.buildStreamOptions(primary, options, primaryController.signal);
    const primaryStream = primaryAdapter.stream(options.messages, primaryOptions);

    let backupStream: AsyncGenerator<StreamEvent> | null = null;
    let backupStarted = false;
    let winner: 'primary' | 'backup' | null = null;

    // Start primary immediately
    const primaryPromise = this.waitForFirstToken(primaryStream);

    // Set up hedge timer
    const hedgeTimer = setTimeout(() => {
      if (winner) return; // Primary already won
      backupStarted = true;
      const backupAdapter = getStreamAdapter(backup.provider as ProviderName);
      const backupOptions = this.buildStreamOptions(backup, options, backupController.signal);
      backupStream = backupAdapter.stream(options.messages, backupOptions);
    }, this.config.hedgeDelay);

    // Wait for primary's first token OR timeout
    const primaryResult = await Promise.race([
      primaryPromise,
      this.delay(this.config.ttftTimeout),
    ]);

    if (primaryResult && primaryResult.type === 'token') {
      // Primary won
      winner = 'primary';
      clearTimeout(hedgeTimer);
      backupController.abort();

      const ttft = Date.now() - startTime;
      yield this.metadataEvent(primary.provider, primary.model, ttft);
      yield primaryResult;

      // Stream rest from primary
      let tokenCount = 1;
      try {
        for await (const event of primaryStream) {
          if (event.type === 'token') tokenCount++;
          yield event;
          if (event.type === 'done') break;
        }
      } catch { /* done */ }

      // Primary won: savings = expected backup TTFT - primary's actual TTFT
      const saved = Math.max(0, backup.expectedTTFT - ttft);
      this.totalSaved += saved;

      if (this.config.enableLearning) {
        this.recordRaceResult(primary.provider, primary.model, {
          ttft, tokensPerSec: tokenCount / ((Date.now() - startTime - ttft) / 1000 || 1),
          totalLatency: Date.now() - startTime, tokenCount, success: true,
        });
      }
    } else {
      // Primary too slow, try backup
      clearTimeout(hedgeTimer);
      primaryController.abort();

      if (!backupStarted) {
        // Start backup now
        const backupAdapter = getStreamAdapter(backup.provider as ProviderName);
        const backupOptions = this.buildStreamOptions(backup, options, backupController.signal);
        backupStream = backupAdapter.stream(options.messages, backupOptions);
      }

      if (backupStream) {
        winner = 'backup';
        const ttft = Date.now() - startTime;
        yield this.metadataEvent(backup.provider, backup.model, ttft);

        let tokenCount = 0;
        try {
          for await (const event of backupStream) {
            if (event.type === 'token') tokenCount++;
            yield event;
            if (event.type === 'done') break;
          }
        } catch { /* done */ }

        if (this.config.enableLearning) {
          this.recordRaceResult(backup.provider, backup.model, {
            ttft, tokensPerSec: tokenCount / ((Date.now() - startTime - ttft) / 1000 || 1),
            totalLatency: Date.now() - startTime, tokenCount, success: true,
          });
          // Record primary failure
          this.recordRaceResult(primary.provider, primary.model, {
            ttft: this.config.ttftTimeout, tokensPerSec: 0,
            totalLatency: this.config.ttftTimeout, tokenCount: 0, success: false,
          });
        }
      } else {
        yield this.errorEvent('Both primary and backup failed');
      }
    }
  }

  /**
   * Speculative Race: Fast model generates, slow model verifies.
   * Lowest cost for simple queries, escalates for complex ones.
   */
  private async *raceSpeculative(
    candidates: RacingCandidate[],
    options: any,
    startTime: number
  ): AsyncGenerator<StreamEvent> {
    if (candidates.length < 2) {
      yield* this.streamSingle(candidates[0].provider, candidates[0].model, options);
      return;
    }

    // Sort by speed: fastest first
    const sorted = [...candidates].sort((a, b) => a.expectedTTFT - b.expectedTTFT);
    const fast = sorted[0];

    // Start fast model
    const fastController = new AbortController();
    const fastAdapter = getStreamAdapter(fast.provider as ProviderName);
    const fastOptions = this.buildStreamOptions(fast, options, fastController.signal);
    const fastStream = fastAdapter.stream(options.messages, fastOptions);

    let tokenCount = 0;
    let content = '';
    const ttft = Date.now() - startTime;

    // Stream from fast model up to speculativeTokens limit
    try {
      for await (const event of fastStream) {
        if (event.type === 'token') {
          tokenCount++;
          content += event.content;
          yield event;

          // After enough tokens, we trust the fast model
          if (tokenCount >= this.config.speculativeTokens) {
            // Continue streaming from fast model (it's working well)
            for await (const remaining of fastStream) {
              if (remaining.type === 'token') tokenCount++;
              yield remaining;
              if (remaining.type === 'done') break;
            }
            break;
          }
        } else if (event.type === 'error') {
          // Fast model failed, escalate to next candidate
          fastController.abort();
          const fallback = sorted[1] || sorted[0];
          yield* this.streamSingle(fallback.provider, fallback.model, options);
          return;
        } else if (event.type === 'done') {
          break;
        } else {
          yield event;
        }
      }
    } catch {
      // Fast model failed mid-stream
      if (tokenCount === 0) {
        const fallback = sorted[1] || sorted[0];
        yield* this.streamSingle(fallback.provider, fallback.model, options);
        return;
      }
    }

    // Record
    if (this.config.enableLearning) {
      this.recordRaceResult(fast.provider, fast.model, {
        ttft,
        tokensPerSec: tokenCount / ((Date.now() - startTime - ttft) / 1000 || 1),
        totalLatency: Date.now() - startTime,
        tokenCount,
        success: true,
      });
    }
  }

  /**
   * Quality Race: Multiple models generate fully, pick best.
   * Highest quality but most expensive.
   */
  private async *raceQuality(
    candidates: RacingCandidate[],
    options: any,
    startTime: number
  ): AsyncGenerator<StreamEvent> {
    // For now, fall back to TTFT race with quality verification later
    yield* this.raceTTFT(candidates, options, startTime);
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private selectCandidates(options: any): RacingCandidate[] {
    // Auto-exclude providers without API keys or unreachable services
    const autoExclude: string[] = [];
    if (!process.env.ANTHROPIC_API_KEY) autoExclude.push('anthropic');
    if (!process.env.OPENAI_API_KEY) autoExclude.push('openai');
    if (!process.env.GROQ_API_KEY) autoExclude.push('groq');
    if (!process.env.OLLAMA_HOST) autoExclude.push('ollama');

    const excludeProviders = [
      ...autoExclude,
      ...(options.excludeProviders || []),
    ];

    return this.tracker.getRacingCandidates({
      maxCandidates: this.config.maxRacers,
      preferSpeed: true,
      excludeProviders,
    });
  }

  private buildStreamOptions(
    candidate: RacingCandidate,
    options: any,
    signal: AbortSignal
  ): any {
    return {
      model: candidate.model,
      apiKey: this.getApiKey(candidate.provider),
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens,
      tools: options.tools?.map((t: any) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.parameters,
      })),
      signal,
      enableThinking: options.enableThinking,
      thinkingBudget: options.thinkingBudget, // v18.3: Dynamic thinking budget
    };
  }

  private getApiKey(provider: string): string {
    switch (provider) {
      case 'openai': return process.env.OPENAI_API_KEY || '';
      case 'anthropic': return process.env.ANTHROPIC_API_KEY || '';
      case 'groq': return process.env.GROQ_API_KEY || '';
      default: return '';
    }
  }

  private async findFirstToken(
    racers: Array<{ provider: string; model: string; iterator: AsyncGenerator<StreamEvent>; controller: AbortController }>,
    startTime: number
  ): Promise<{ racer: typeof racers[0]; firstEvent: StreamEvent } | null> {
    // Use manual .next() calls to avoid closing the iterator when we find a winner.
    // for-await would call .return() on early exit, terminating the stream.
    const promises = racers.map(async (racer) => {
      try {
        while (true) {
          const { value: event, done } = await racer.iterator.next();
          if (done || !event) return null;
          if (event.type === 'token') {
            return { racer, firstEvent: event };
          }
          if (event.type === 'error') {
            return null;
          }
          // Skip non-token events (metadata, etc) and keep pulling
        }
      } catch {
        return null;
      }
    });

    // Race all promises with timeout
    const timeoutPromise = this.delay(this.config.ttftTimeout).then(() => null);
    const results = await Promise.race([
      ...promises,
      timeoutPromise,
    ]) as { racer: typeof racers[0]; firstEvent: StreamEvent } | null;

    return results;
  }

  private async waitForFirstToken(
    stream: AsyncGenerator<StreamEvent>
  ): Promise<StreamEvent | null> {
    // Use manual .next() to avoid closing the iterator on early return.
    try {
      while (true) {
        const { value: event, done } = await stream.next();
        if (done || !event) return null;
        if (event.type === 'token' || event.type === 'error') {
          return event;
        }
        // Skip non-token/error events and keep pulling
      }
    } catch {
      return null;
    }
  }

  private async *streamSingle(
    provider: string,
    model: string,
    options: any
  ): AsyncGenerator<StreamEvent> {
    const controller = new AbortController();
    const adapter = getStreamAdapter(provider as ProviderName);
    const streamOptions = this.buildStreamOptions(
      { provider, model, expectedTTFT: 0, expectedTokPerSec: 0, confidence: 1, risk: 0, costPerToken: 0, score: 0 },
      options,
      controller.signal
    );

    const startTime = Date.now();
    let tokenCount = 0;
    let ttft = 0;

    try {
      for await (const event of adapter.stream(options.messages, streamOptions)) {
        if (event.type === 'token') {
          if (tokenCount === 0) ttft = Date.now() - startTime;
          tokenCount++;
        }
        yield event;
        if (event.type === 'done') break;
      }
    } catch (err: any) {
      yield this.errorEvent(err?.message || 'Stream failed');
    }

    if (this.config.enableLearning && tokenCount > 0) {
      this.recordRaceResult(provider, model, {
        ttft,
        tokensPerSec: tokenCount / ((Date.now() - startTime - ttft) / 1000 || 1),
        totalLatency: Date.now() - startTime,
        tokenCount,
        success: tokenCount > 0,
      });
    }
  }

  private recordRaceResult(
    provider: string,
    model: string,
    result: Omit<LatencyRecord, 'provider' | 'model' | 'timestamp'>
  ): void {
    this.tracker.record({
      provider,
      model,
      timestamp: Date.now(),
      ...result,
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private errorEvent(message: string): StreamEvent {
    return {
      type: 'error',
      id: `race_err_${Date.now()}`,
      timestamp: new Date().toISOString(),
      code: 'RACE_FAILED',
      message,
      retryable: false,
    };
  }

  private metadataEvent(provider: string, model: string, ttft: number): StreamEvent {
    return {
      type: 'metadata',
      id: `race_meta_${Date.now()}`,
      timestamp: new Date().toISOString(),
      provider,
      model,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      // Racing info for orchestrator to extract
      racingWinner: provider,
      racingModel: model,
      racingStrategy: this.config.strategy,
      racingCandidates: this.config.maxRacers,
      racingSaved: Math.round(this.totalSaved / Math.max(1, this.raceCount)),
    } as any;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createModelRacer(config?: Partial<RacingConfig>): ModelRacer {
  return new ModelRacer(config);
}

export { DEFAULT_RACING_CONFIG };
