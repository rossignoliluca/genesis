/**
 * Nucleus v34 — Curiosity Engine
 *
 * Autonomous self-improvement that runs when idle (60s no input).
 * 4 exploration strategies: performance study, capability gaps,
 * module experiments, failure patterns.
 */

import type { ExplorationResult, InputClassification } from './types.js';
import { getPlasticity } from './plasticity.js';

const IDLE_THRESHOLD_MS = 60_000; // 60s with no input triggers exploration
const MIN_SAMPLES_THRESHOLD = 5;

export class CuriosityEngine {
  private lastActivityTime = Date.now();
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private explorations: ExplorationResult[] = [];
  private running = false;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastActivityTime = Date.now();
    this.idleTimer = setInterval(() => this.checkIdle(), 30_000);
    console.log('[Curiosity] Engine started — idle exploration after 60s');
  }

  stop(): void {
    this.running = false;
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  recordActivity(): void {
    this.lastActivityTime = Date.now();
  }

  getExplorations(limit = 10): ExplorationResult[] {
    return this.explorations.slice(-limit);
  }

  private async checkIdle(): Promise<void> {
    const idleMs = Date.now() - this.lastActivityTime;
    if (idleMs < IDLE_THRESHOLD_MS) return;

    // Pick a random exploration strategy
    const strategies = [
      this.studyPerformance,
      this.identifyCapabilityGaps,
      this.proposeModuleExperiments,
      this.reviewFailurePatterns,
    ];
    const strategy = strategies[Math.floor(Math.random() * strategies.length)];
    const result = await strategy.call(this);

    if (result) {
      this.explorations.push(result);
      // Keep only last 50 explorations
      if (this.explorations.length > 50) {
        this.explorations = this.explorations.slice(-50);
      }

      // Store as procedural knowledge
      try {
        const { getMemorySystem } = await import('../memory/index.js');
        const mem = getMemorySystem();
        mem.learn({
          concept: `nucleus:curiosity:${result.type}`,
          definition: JSON.stringify({ description: result.description, findings: result.findings }),
          category: 'nucleus',
          confidence: 0.7,
        });
      } catch (err) {
        // Non-fatal
        console.error('[CuriosityEngine] Failed to store exploration in memory:', err);
      }

      // Publish to bus
      try {
        const { getEventBus } = await import('../bus/index.js');
        const bus = getEventBus();
        bus.publish('nucleus.curiosity.explored', {
          source: 'curiosity-engine',
          precision: 0.7,
          explorationType: result.type,
          description: result.description,
          findingsCount: result.findings.length,
        });
      } catch (err) {
        // Bus not available
        console.error('[CuriosityEngine] Failed to publish exploration to bus:', err);
      }
    }

    // Reset activity so we don't spam explorations
    this.lastActivityTime = Date.now();
  }

  private async studyPerformance(): Promise<ExplorationResult> {
    const plasticity = getPlasticity();
    const stats = plasticity.getStats();
    const findings: string[] = [];

    // Find low-confidence classifications
    for (const s of stats) {
      if (s.sampleCount >= MIN_SAMPLES_THRESHOLD && s.avgConfidence < 0.5) {
        findings.push(`Classification '${s.classification}' has low avg confidence (${s.avgConfidence.toFixed(2)}) over ${s.sampleCount} samples`);
      }
      if (s.sampleCount >= MIN_SAMPLES_THRESHOLD && s.avgLatencyMs > 500) {
        findings.push(`Classification '${s.classification}' has high avg latency (${s.avgLatencyMs.toFixed(0)}ms)`);
      }
    }

    if (findings.length === 0) {
      findings.push('All classification categories performing within normal bounds');
    }

    return {
      type: 'code_study',
      description: 'Analyzed plasticity performance stats across all classifications',
      findings,
      timestamp: Date.now(),
    };
  }

  private async identifyCapabilityGaps(): Promise<ExplorationResult> {
    const plasticity = getPlasticity();
    const stats = plasticity.getStats();
    const findings: string[] = [];

    const allClassifications: InputClassification[] = [
      'simple_chat', 'analysis', 'creative', 'reasoning',
      'market', 'code', 'life_assist', 'system', 'unknown',
    ];
    const seenClassifications = new Set(stats.map(s => s.classification));

    for (const c of allClassifications) {
      if (!seenClassifications.has(c)) {
        findings.push(`Classification '${c}' has ZERO samples — no learning data available`);
      } else {
        const s = stats.find(s => s.classification === c);
        if (s && s.sampleCount < MIN_SAMPLES_THRESHOLD) {
          findings.push(`Classification '${c}' has only ${s.sampleCount} samples — insufficient for learning`);
        }
      }
    }

    if (findings.length === 0) {
      findings.push('All classifications have sufficient sample counts for learning');
    }

    return {
      type: 'capability_gap',
      description: 'Identified classifications with insufficient learning data',
      findings,
      timestamp: Date.now(),
    };
  }

  private async proposeModuleExperiments(): Promise<ExplorationResult> {
    const plasticity = getPlasticity();
    const allWeights = plasticity.getAllWeights();
    const findings: string[] = [];
    const proposedChanges: string[] = [];

    // Find modules with very low weights that might benefit from re-testing
    for (const [moduleId, classWeights] of Object.entries(allWeights)) {
      for (const [classification, weight] of Object.entries(classWeights)) {
        if (weight < 0.15 && weight > 0.05) {
          findings.push(`Module '${moduleId}' has low weight (${weight.toFixed(2)}) for '${classification}' — might be underutilized`);
          proposedChanges.push(`Experiment: force-activate '${moduleId}' for next '${classification}' input`);
        }
      }
    }

    if (findings.length === 0) {
      findings.push('No modules identified as candidates for re-activation experiments');
    }

    return {
      type: 'module_experiment',
      description: 'Analyzed module weights for potential re-activation experiments',
      findings: findings.slice(0, 10),
      proposedChanges: proposedChanges.slice(0, 5),
      timestamp: Date.now(),
    };
  }

  private async reviewFailurePatterns(): Promise<ExplorationResult> {
    const plasticity = getPlasticity();
    const stats = plasticity.getStats();
    const allWeights = plasticity.getAllWeights();
    const findings: string[] = [];

    // Find modules whose weights dropped significantly (close to minimum)
    for (const [moduleId, classWeights] of Object.entries(allWeights)) {
      const lowWeightClasses = Object.entries(classWeights).filter(([, w]) => w <= 0.1);
      if (lowWeightClasses.length >= 3) {
        findings.push(`Module '${moduleId}' has bottomed-out weights in ${lowWeightClasses.length} classifications — possibly correlated with failures`);
      }
    }

    // Find classifications with both many samples and low confidence
    for (const s of stats) {
      if (s.sampleCount >= 10 && s.avgConfidence < 0.4) {
        findings.push(`Classification '${s.classification}' consistently underperforms (avg confidence ${s.avgConfidence.toFixed(2)} over ${s.sampleCount} samples)`);
      }
    }

    if (findings.length === 0) {
      findings.push('No persistent failure patterns detected');
    }

    return {
      type: 'improvement_proposal',
      description: 'Reviewed failure patterns across modules and classifications',
      findings,
      timestamp: Date.now(),
    };
  }
}

// Singleton
let instance: CuriosityEngine | null = null;

export function getCuriosityEngine(): CuriosityEngine {
  if (!instance) instance = new CuriosityEngine();
  return instance;
}

export function resetCuriosityEngine(): void {
  instance?.stop();
  instance = null;
}
