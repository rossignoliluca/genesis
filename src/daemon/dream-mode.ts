/**
 * Genesis 6.0 - Dream Mode
 *
 * Offline consolidation and creative synthesis during "sleep".
 *
 * Based on sleep neuroscience research:
 * - Light Sleep (N1/N2): Initial memory processing
 * - Deep Sleep (N3/SWS): Memory consolidation (episodic → semantic)
 * - REM Sleep: Creative synthesis, pattern integration
 *
 * References:
 * - Walker, M. (2017). Why We Sleep
 * - Born, J. (2010). Slow-wave sleep and memory
 * - Stickgold, R. (2005). Sleep-dependent memory consolidation
 *
 * Usage:
 * ```typescript
 * import { createDreamService } from './daemon/dream-mode.js';
 *
 * const dream = createDreamService({
 *   minDreamDurationMs: 60000, // 1 minute
 *   maxDreamDurationMs: 600000, // 10 minutes
 * });
 *
 * // Start a dream session
 * const session = await dream.startDream();
 *
 * // Wait for completion
 * const results = await dream.waitForWake();
 * ```
 */

import { randomUUID } from 'crypto';
import {
  DreamConfig,
  DreamPhase,
  DreamSession,
  DreamResults,
  DreamMetrics,
  DEFAULT_DAEMON_CONFIG,
} from './types.js';

// ============================================================================
// Dream Context (Injected Dependencies)
// ============================================================================

export interface DreamContext {
  // Memory system access
  getEpisodicMemories?: () => Array<{
    id: string;
    content: { what: string };
    importance: number;
    tags: string[];
    consolidated: boolean;
  }>;

  getSemanticMemories?: () => Array<{
    id: string;
    concept: string;
    confidence: number;
  }>;

  getProceduralMemories?: () => Array<{
    id: string;
    name: string;
    successRate: number;
  }>;

  // Consolidation actions
  consolidateMemory?: (episodeId: string) => Promise<{ concept: string } | null>;
  extractPattern?: (episodes: string[]) => Promise<{ pattern: string; confidence: number } | null>;
  reinforceSkill?: (skillId: string) => Promise<boolean>;
  forgetMemory?: (memoryId: string) => boolean;

  // State access
  getState?: () => { energy: number };
  rechargeEnergy?: (amount: number) => void;

  // Invariant checking
  checkInvariants?: () => Promise<boolean>;
  repairState?: () => Promise<number>;

  // Logger
  log?: (message: string, level?: 'debug' | 'info' | 'warn' | 'error') => void;
}

// ============================================================================
// Dream Service
// ============================================================================

export type DreamEventType =
  | 'dream_started'
  | 'phase_changed'
  | 'consolidation_done'
  | 'pattern_extracted'
  | 'dream_completed'
  | 'dream_interrupted';

export type DreamEventHandler = (event: {
  type: DreamEventType;
  session?: DreamSession;
  data?: unknown;
}) => void;

export class DreamService {
  private config: DreamConfig;
  private context: DreamContext;
  private currentSession: DreamSession | null = null;
  private metrics: DreamMetrics;
  private eventHandlers: Set<DreamEventHandler> = new Set();
  private wakeResolvers: Array<(results: DreamResults) => void> = [];
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActivity: Date = new Date();

  constructor(config: Partial<DreamConfig> = {}, context: DreamContext = {}) {
    this.config = { ...DEFAULT_DAEMON_CONFIG.dream, ...config };
    this.context = context;
    this.metrics = {
      totalDreamTime: 0,
      dreamCycles: 0,
      avgCycleDuration: 0,
      consolidationRate: 0,
      patternExtractionRate: 0,
      lastDreamAt: null,
      nextScheduledDream: null,
    };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  setContext(context: Partial<DreamContext>): void {
    this.context = { ...this.context, ...context };
  }

  startAutoTrigger(): void {
    if (!this.config.autoTrigger) return;

    this.resetInactivityTimer();
  }

  stopAutoTrigger(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  recordActivity(): void {
    this.lastActivity = new Date();
    this.resetInactivityTimer();
  }

  private resetInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }

    if (this.config.autoTrigger && !this.isDreaming()) {
      this.inactivityTimer = setTimeout(
        () => this.startDream(),
        this.config.inactivityThresholdMs
      );

      this.metrics.nextScheduledDream = new Date(
        Date.now() + this.config.inactivityThresholdMs
      );
    }
  }

  // ============================================================================
  // Dream Session
  // ============================================================================

  isDreaming(): boolean {
    return this.currentSession !== null && !this.currentSession.endedAt;
  }

  async startDream(options: { duration?: number } = {}): Promise<DreamSession> {
    if (this.isDreaming()) {
      throw new Error('Already dreaming');
    }

    const duration = options.duration ||
      this.config.minDreamDurationMs +
      Math.random() * (this.config.maxDreamDurationMs - this.config.minDreamDurationMs);

    const session: DreamSession = {
      id: randomUUID(),
      startedAt: new Date(),
      phase: 'light',
      phaseHistory: [{
        phase: 'light',
        enteredAt: new Date(),
      }],
      interrupted: false,
    };

    this.currentSession = session;
    this.emit({ type: 'dream_started', session });
    this.log(`Dream started (${Math.round(duration / 1000)}s)`);

    // Run the dream cycle
    this.runDreamCycle(session, duration);

    return session;
  }

  async interruptDream(reason: string): Promise<DreamResults | null> {
    if (!this.currentSession) return null;

    this.currentSession.interrupted = true;
    this.currentSession.interruptReason = reason;

    this.emit({ type: 'dream_interrupted', session: this.currentSession });
    this.log(`Dream interrupted: ${reason}`, 'warn');

    // Return partial results
    return this.currentSession.results || this.createEmptyResults();
  }

  waitForWake(): Promise<DreamResults> {
    if (!this.isDreaming()) {
      return Promise.resolve(
        this.currentSession?.results || this.createEmptyResults()
      );
    }

    return new Promise((resolve) => {
      this.wakeResolvers.push(resolve);
    });
  }

  getCurrentSession(): DreamSession | null {
    return this.currentSession;
  }

  // ============================================================================
  // Dream Cycle
  // ============================================================================

  private async runDreamCycle(session: DreamSession, totalDuration: number): Promise<void> {
    const startTime = Date.now();
    const results = this.createEmptyResults();

    // Calculate phase durations
    const lightDuration = totalDuration * this.config.lightSleepRatio;
    const deepDuration = totalDuration * this.config.deepSleepRatio;
    const remDuration = totalDuration * this.config.remSleepRatio;

    try {
      // Light sleep phase
      await this.runPhase(session, 'light', lightDuration, results);
      if (session.interrupted) return this.finishDream(session, results);

      // Deep sleep phase (consolidation)
      await this.runPhase(session, 'deep', deepDuration, results);
      if (session.interrupted) return this.finishDream(session, results);

      // REM phase (creativity)
      await this.runPhase(session, 'rem', remDuration, results);
      if (session.interrupted) return this.finishDream(session, results);

      // Wake phase
      await this.runPhase(session, 'wake', 1000, results);

    } catch (err) {
      this.log(`Dream cycle error: ${err}`, 'error');
    }

    this.finishDream(session, results);
  }

  private async runPhase(
    session: DreamSession,
    phase: DreamPhase,
    duration: number,
    results: DreamResults
  ): Promise<void> {
    // Transition phase
    this.transitionPhase(session, phase);

    const phaseStart = Date.now();
    const phaseEnd = phaseStart + duration;

    switch (phase) {
      case 'light':
        await this.lightSleepPhase(results, duration);
        break;
      case 'deep':
        await this.deepSleepPhase(results, duration);
        break;
      case 'rem':
        await this.remSleepPhase(results, duration);
        break;
      case 'wake':
        await this.wakePhase(results);
        break;
    }

    // Wait remaining duration
    const elapsed = Date.now() - phaseStart;
    if (elapsed < duration && !session.interrupted) {
      await this.sleep(duration - elapsed);
    }
  }

  private transitionPhase(session: DreamSession, newPhase: DreamPhase): void {
    // Close previous phase
    const lastPhase = session.phaseHistory[session.phaseHistory.length - 1];
    if (lastPhase && !lastPhase.exitedAt) {
      lastPhase.exitedAt = new Date();
    }

    // Start new phase
    session.phase = newPhase;
    session.phaseHistory.push({
      phase: newPhase,
      enteredAt: new Date(),
    });

    this.emit({ type: 'phase_changed', session, data: { phase: newPhase } });
    this.log(`Dream phase: ${newPhase}`, 'debug');
  }

  // ============================================================================
  // Phase Implementations
  // ============================================================================

  private async lightSleepPhase(results: DreamResults, duration: number): Promise<void> {
    // Light sleep: Initial processing, prepare for consolidation
    // Energy restoration begins
    if (this.context.rechargeEnergy) {
      this.context.rechargeEnergy(0.05); // Small recharge
    }

    // Count episodes to process
    if (this.context.getEpisodicMemories) {
      const episodes = this.context.getEpisodicMemories();
      results.episodesProcessed = episodes.filter((e) => !e.consolidated).length;
    }
  }

  private async deepSleepPhase(results: DreamResults, duration: number): Promise<void> {
    // Deep sleep: Memory consolidation (episodic → semantic)
    // This is where the heavy processing happens

    if (!this.context.getEpisodicMemories || !this.context.consolidateMemory) {
      return;
    }

    const episodes = this.context.getEpisodicMemories()
      .filter((e) => !e.consolidated)
      .sort((a, b) => b.importance - a.importance);

    // Process episodes in batches
    const batchSize = 10;
    const batches = Math.ceil(episodes.length / batchSize);
    const timePerBatch = duration / (batches || 1);

    for (let i = 0; i < batches && !this.currentSession?.interrupted; i++) {
      const batch = episodes.slice(i * batchSize, (i + 1) * batchSize);

      for (const episode of batch) {
        try {
          const result = await this.context.consolidateMemory(episode.id);
          if (result) {
            results.memoriesConsolidated++;
            this.emit({ type: 'consolidation_done', data: { episode, result } });
          }
        } catch (err) {
          this.log(`Consolidation error: ${err}`, 'error');
        }
      }

      // Pattern extraction from related episodes
      if (this.context.extractPattern && batch.length >= this.config.patternExtractionThreshold) {
        const relatedGroups = this.groupByTags(batch);

        for (const [tag, group] of relatedGroups) {
          if (group.length >= this.config.patternExtractionThreshold) {
            try {
              const pattern = await this.context.extractPattern(group.map((e) => e.id));
              if (pattern && pattern.confidence > 0.5) {
                results.patternsExtracted++;
                this.emit({ type: 'pattern_extracted', data: pattern });
              }
            } catch (err) {
              this.log(`Pattern extraction error: ${err}`, 'error');
            }
          }
        }
      }

      await this.sleep(timePerBatch);
    }

    // Energy restoration during deep sleep
    if (this.context.rechargeEnergy) {
      this.context.rechargeEnergy(0.2); // Significant recharge
    }

    // Skill reinforcement
    if (this.context.getProceduralMemories && this.context.reinforceSkill) {
      const skills = this.context.getProceduralMemories()
        .filter((s) => s.successRate > 0.5)
        .sort((a, b) => a.successRate - b.successRate)
        .slice(0, 5);

      for (const skill of skills) {
        if (await this.context.reinforceSkill(skill.id)) {
          results.skillsReinforced++;
        }
      }
    }
  }

  private async remSleepPhase(results: DreamResults, duration: number): Promise<void> {
    // REM sleep: Creative synthesis, novel associations
    // This is where new ideas emerge from combining memories

    if (!this.context.getSemanticMemories) {
      return;
    }

    const concepts = this.context.getSemanticMemories();

    // Generate novel associations (simplified creative process)
    const associations = this.generateNovelAssociations(
      concepts.map((c) => c.concept),
      this.config.creativityTemperature
    );

    results.newAssociations = associations.length;
    results.novelIdeas = associations.slice(0, 5); // Keep top 5

    // Energy boost from REM
    if (this.context.rechargeEnergy) {
      this.context.rechargeEnergy(0.1);
    }

    // Memory forgetting (weak memories fade during sleep)
    if (this.context.getEpisodicMemories && this.context.forgetMemory) {
      const episodes = this.context.getEpisodicMemories();
      const toForget = episodes
        .filter((e) => e.importance < 0.2)
        .slice(0, Math.floor(episodes.length * 0.1)); // Forget up to 10%

      for (const episode of toForget) {
        if (this.context.forgetMemory(episode.id)) {
          results.memoriesForgotten++;
        }
      }
    }
  }

  private async wakePhase(results: DreamResults): Promise<void> {
    // Wake: Health check and invariant verification

    if (this.context.checkInvariants) {
      const allSatisfied = await this.context.checkInvariants();
      results.invariantsChecked++;

      if (!allSatisfied && this.context.repairState) {
        results.stateRepairs = await this.context.repairState();
      }
    }

    // Final energy boost
    if (this.context.rechargeEnergy) {
      this.context.rechargeEnergy(0.05);
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private groupByTags(episodes: Array<{ id: string; tags: string[] }>): Map<string, typeof episodes> {
    const groups = new Map<string, typeof episodes>();

    for (const episode of episodes) {
      for (const tag of episode.tags) {
        const group = groups.get(tag) || [];
        group.push(episode);
        groups.set(tag, group);
      }
    }

    return groups;
  }

  private generateNovelAssociations(concepts: string[], temperature: number): string[] {
    // Simplified creative association generator
    // In a real implementation, this would use embeddings and semantic similarity

    const associations: string[] = [];
    const numAssociations = Math.floor(concepts.length * temperature);

    for (let i = 0; i < numAssociations && i < concepts.length - 1; i++) {
      const idx1 = Math.floor(Math.random() * concepts.length);
      let idx2 = Math.floor(Math.random() * concepts.length);
      while (idx2 === idx1) {
        idx2 = Math.floor(Math.random() * concepts.length);
      }

      const concept1 = concepts[idx1];
      const concept2 = concepts[idx2];

      // Generate a hypothetical association
      associations.push(`${concept1} relates to ${concept2}`);
    }

    return associations;
  }

  private createEmptyResults(): DreamResults {
    return {
      episodesProcessed: 0,
      memoriesConsolidated: 0,
      patternsExtracted: 0,
      skillsReinforced: 0,
      memoriesForgotten: 0,
      newAssociations: 0,
      novelIdeas: [],
      stateRepairs: 0,
      invariantsChecked: 0,
    };
  }

  private finishDream(session: DreamSession, results: DreamResults): void {
    session.endedAt = new Date();
    session.results = results;

    // Close last phase
    const lastPhase = session.phaseHistory[session.phaseHistory.length - 1];
    if (lastPhase && !lastPhase.exitedAt) {
      lastPhase.exitedAt = session.endedAt;
    }

    // Update metrics
    const duration = session.endedAt.getTime() - session.startedAt.getTime();
    this.metrics.totalDreamTime += duration;
    this.metrics.dreamCycles++;
    this.metrics.avgCycleDuration =
      (this.metrics.avgCycleDuration * (this.metrics.dreamCycles - 1) + duration) /
      this.metrics.dreamCycles;
    this.metrics.lastDreamAt = session.endedAt;

    // Calculate rates
    const durationHours = duration / (1000 * 60 * 60);
    if (durationHours > 0) {
      this.metrics.consolidationRate = results.memoriesConsolidated / durationHours;
    }
    this.metrics.patternExtractionRate = results.patternsExtracted / Math.max(1, this.metrics.dreamCycles);

    this.log(
      `Dream completed: ${results.memoriesConsolidated} consolidated, ` +
      `${results.patternsExtracted} patterns, ${results.skillsReinforced} skills`
    );

    this.emit({ type: 'dream_completed', session });

    // Notify waiters
    for (const resolve of this.wakeResolvers) {
      resolve(results);
    }
    this.wakeResolvers = [];

    // Reset inactivity timer for next dream
    this.resetInactivityTimer();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================================
  // Stats
  // ============================================================================

  getMetrics(): DreamMetrics {
    return { ...this.metrics };
  }

  // ============================================================================
  // Events
  // ============================================================================

  on(handler: DreamEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: { type: DreamEventType; session?: DreamSession; data?: unknown }): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('Dream event handler error:', err);
      }
    }
  }

  // ============================================================================
  // Logging
  // ============================================================================

  private log(message: string, level: 'debug' | 'info' | 'warn' | 'error' = 'info'): void {
    if (this.context.log) {
      this.context.log(message, level);
    } else {
      const prefix = '[Dream]';
      switch (level) {
        case 'debug':
          if (process.env.LOG_LEVEL === 'debug') console.log(`${prefix} ${message}`);
          break;
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
}

// ============================================================================
// Factory
// ============================================================================

export function createDreamService(
  config?: Partial<DreamConfig>,
  context?: DreamContext
): DreamService {
  return new DreamService(config, context);
}
