/**
 * Nucleus v34 — Plasticity (Hebbian Learning)
 *
 * "Modules that fire and succeed → wire stronger."
 * Uses EMA (alpha=0.15) to update activation weights based on outcomes.
 * Persists learned weights via the memory system.
 */

import type { InputClassification, ProcessingOutcome, PlasticityStats } from './types.js';

const EMA_ALPHA = 0.15;
const WEIGHT_MIN = 0.05;
const WEIGHT_MAX = 1.0;
const PERSIST_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface LearnedWeights {
  // moduleId → classification → weight
  weights: Record<string, Record<string, number>>;
  stats: Record<string, { count: number; totalConfidence: number; totalLatency: number }>;
}

export class Plasticity {
  private learned: LearnedWeights = { weights: {}, stats: {} };
  private persistTimer: ReturnType<typeof setInterval> | null = null;
  private dirty = false;

  async boot(): Promise<void> {
    // Load persisted weights
    try {
      const { getMemorySystem } = await import('../memory/index.js');
      const mem = getMemorySystem();
      const recalled = mem.recall('nucleus:plasticity:weights', { limit: 1 });
      if (recalled.length > 0) {
        const stored = recalled[0];
        const content = (stored as { content?: unknown })?.content;
        if (content && typeof content === 'object' && 'weights' in (content as Record<string, unknown>)) {
          this.learned = content as LearnedWeights;
          console.log(`[Plasticity] Loaded ${Object.keys(this.learned.weights).length} module weight maps`);
        }
      }
    } catch (err) {
      // Memory not available yet, start fresh
      console.error('[Plasticity] Failed to load weights from memory:', err);
    }

    // Periodic persistence
    this.persistTimer = setInterval(() => this.persist(), PERSIST_INTERVAL_MS);
  }

  record(outcome: ProcessingOutcome): void {
    const { classification, modulesUsed, confidence, success, latencyMs } = outcome;

    // Update per-classification stats
    const statsKey = classification;
    if (!this.learned.stats[statsKey]) {
      this.learned.stats[statsKey] = { count: 0, totalConfidence: 0, totalLatency: 0 };
    }
    const s = this.learned.stats[statsKey];
    s.count++;
    s.totalConfidence += confidence;
    s.totalLatency += latencyMs;

    // EMA update for each module that was activated
    const target = success ? WEIGHT_MAX : 0;
    for (const moduleId of modulesUsed) {
      if (!this.learned.weights[moduleId]) {
        this.learned.weights[moduleId] = {};
      }
      const mw = this.learned.weights[moduleId];
      const current = mw[classification] ?? 0.5;
      mw[classification] = clamp(current + EMA_ALPHA * (target - current), WEIGHT_MIN, WEIGHT_MAX);
    }
    this.dirty = true;
  }

  getWeightsForClassification(classification: InputClassification): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [moduleId, classWeights] of Object.entries(this.learned.weights)) {
      if (classification in classWeights) {
        result[moduleId] = classWeights[classification];
      }
    }
    return result;
  }

  recommendModules(classification: InputClassification): string[] {
    const w = this.getWeightsForClassification(classification);
    return Object.entries(w)
      .sort(([, a], [, b]) => b - a)
      .map(([id]) => id);
  }

  getStats(): PlasticityStats[] {
    return Object.entries(this.learned.stats).map(([classification, s]) => ({
      classification: classification as InputClassification,
      sampleCount: s.count,
      avgConfidence: s.count > 0 ? s.totalConfidence / s.count : 0,
      avgLatencyMs: s.count > 0 ? s.totalLatency / s.count : 0,
    }));
  }

  getAllWeights(): Record<string, Record<string, number>> {
    return { ...this.learned.weights };
  }

  private async persist(): Promise<void> {
    if (!this.dirty) return;
    try {
      const { getMemorySystem } = await import('../memory/index.js');
      const mem = getMemorySystem();
      mem.learn({
        concept: 'nucleus:plasticity:weights',
        definition: JSON.stringify(this.learned),
        category: 'nucleus',
        confidence: 1.0,
      });
      this.dirty = false;
    } catch (err) {
      // Non-fatal
      console.error('[Plasticity] Failed to persist weights:', err);
    }
  }

  async shutdown(): Promise<void> {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
    await this.persist();
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// Singleton
let instance: Plasticity | null = null;

export function getPlasticity(): Plasticity {
  if (!instance) instance = new Plasticity();
  return instance;
}

export function resetPlasticity(): void {
  instance?.shutdown();
  instance = null;
}
