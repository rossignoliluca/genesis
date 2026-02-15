/**
 * Chaos Engine — Cognitive Stress Testing during Dream Mode
 *
 * Deliberately disables modules during lucid dream mode,
 * measures degradation, and builds a resilience map.
 */

import { getEventBus } from '../bus/index.js';
import { getMemorySystem } from '../memory/index.js';
import {
  ChaosConfig,
  ChaosExperiment,
  CapabilityMeasurement,
  ModuleCriticality,
  ResilienceMap,
} from './types.js';
import { DEFAULT_ANTIFRAGILE_CONFIG } from './types.js';

interface ModuleEntry {
  name: string;
  disable: () => Promise<void>;
  enable: () => Promise<void>;
  healthCheck: () => Promise<boolean>;
}

export class ChaosEngine {
  private config: ChaosConfig;
  private experiments: ChaosExperiment[] = [];
  private resilienceMap: ResilienceMap;
  private moduleRegistry = new Map<string, ModuleEntry>();

  constructor(config?: Partial<ChaosConfig>) {
    this.config = { ...DEFAULT_ANTIFRAGILE_CONFIG.chaos, ...config };
    this.resilienceMap = this.emptyResilienceMap();
  }

  /** Register a module for chaos testing */
  registerModule(entry: ModuleEntry): void {
    this.moduleRegistry.set(entry.name, entry);
  }

  /** Run a complete chaos session (call during lucid dream mode) */
  async runChaosSession(): Promise<ResilienceMap> {
    const bus = getEventBus();
    const experimentCount = Math.min(
      this.config.maxExperimentsPerSession,
      this.config.testableModules.filter(m => this.moduleRegistry.has(m)).length,
    );

    if (experimentCount === 0) return this.resilienceMap;

    for (let i = 0; i < experimentCount; i++) {
      const toDisable = this.selectModules(i);
      if (toDisable.length === 0) continue;

      bus.publish('antifragile.chaos.experiment', {
        source: 'chaos-engine',
        precision: 0.8,
        experimentId: `chaos-${Date.now()}`,
        disabledModules: toDisable,
        degradationScore: 0,
        invariantsBroken: false,
        phase: 'started',
      });

      const result = await this.runExperiment(toDisable);
      this.experiments.push(result);
      this.updateResilienceMap(result);

      bus.publish('antifragile.chaos.experiment', {
        source: 'chaos-engine',
        precision: 0.9,
        experimentId: result.id,
        disabledModules: result.disabledModules,
        degradationScore: result.degradationScore,
        invariantsBroken: result.invariantsBroken,
        phase: 'completed',
      });

      await this.sleep(this.config.cooldownMs);
    }

    // Store resilience map
    const memory = getMemorySystem();
    memory.learn({
      concept: `resilience-map:${new Date().toISOString().split('T')[0]}`,
      definition: `Resilience map from ${experimentCount} experiments. Antifragility: ${this.resilienceMap.antifragilityIndex.toFixed(2)}`,
      category: 'antifragile-resilience',
    });

    bus.publish('antifragile.resilience.updated', {
      source: 'chaos-engine',
      precision: 0.9,
      antifragilityIndex: this.resilienceMap.antifragilityIndex,
      totalExperiments: this.resilienceMap.totalExperiments,
      criticalModules: this.resilienceMap.moduleCriticality
        .filter(m => m.criticality > 0.7)
        .map(m => m.module),
      redundantModules: this.resilienceMap.redundantModules,
    });

    return this.resilienceMap;
  }

  getResilienceMap(): ResilienceMap {
    return { ...this.resilienceMap };
  }

  getExperiments(): ChaosExperiment[] {
    return [...this.experiments];
  }

  private async runExperiment(modulesToDisable: string[]): Promise<ChaosExperiment> {
    const id = `chaos-${Date.now()}`;
    const start = Date.now();
    const measurements: CapabilityMeasurement[] = [];

    // Measure baseline
    const baseline = await this.measureHealth();

    // Disable modules
    for (const mod of modulesToDisable) {
      const entry = this.moduleRegistry.get(mod);
      if (entry) {
        try {
          await entry.disable();
        } catch (err) {
          /* continue */
          console.error('[ChaosEngine] Module disable failed:', err);
        }
      }
    }

    // Wait for effects
    await this.sleep(this.config.experimentDurationMs);

    // Measure degraded state
    const degraded = await this.measureHealth();

    // Re-enable
    const reEnableStart = Date.now();
    for (const mod of modulesToDisable) {
      const entry = this.moduleRegistry.get(mod);
      if (entry) {
        try {
          await entry.enable();
        } catch (err) {
          /* continue */
          console.error('[ChaosEngine] Module re-enable failed:', err);
        }
      }
    }
    await this.sleep(500);
    const recoveryTimeMs = Date.now() - reEnableStart;

    // Compare
    for (const [cap, baseScore] of baseline) {
      const degradedScore = degraded.get(cap) ?? 0;
      measurements.push({
        capability: cap,
        baselineScore: baseScore,
        degradedScore,
        retentionRatio: baseScore > 0 ? degradedScore / baseScore : 1,
        affectedBy: degradedScore < baseScore ? modulesToDisable : [],
      });
    }

    const degradationScore = measurements.length > 0
      ? 1 - (measurements.reduce((s, m) => s + m.retentionRatio, 0) / measurements.length)
      : 0;

    return {
      id,
      timestamp: new Date().toISOString(),
      disabledModules: modulesToDisable,
      durationMs: Date.now() - start,
      degradationScore,
      invariantsBroken: false,
      brokenInvariants: [],
      recoveryTimeMs,
      capabilityMeasurements: measurements,
    };
  }

  private async measureHealth(): Promise<Map<string, number>> {
    const health = new Map<string, number>();

    for (const [name, entry] of this.moduleRegistry) {
      try {
        const ok = await entry.healthCheck();
        health.set(name, ok ? 1 : 0);
      } catch (err) {
        console.error('[ChaosEngine] Health check failed for module:', name, err);
        health.set(name, 0);
      }
    }

    return health;
  }

  private selectModules(experimentIndex: number): string[] {
    const available = this.config.testableModules.filter(
      m => !this.config.protectedModules.includes(m) && this.moduleRegistry.has(m),
    );

    if (available.length === 0) return [];

    if (experimentIndex < available.length) {
      return [available[experimentIndex % available.length]];
    }

    const count = this.config.disableCount.min +
      Math.floor(Math.random() * (this.config.disableCount.max - this.config.disableCount.min + 1));
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  private updateResilienceMap(experiment: ChaosExperiment): void {
    const map = this.resilienceMap;
    map.totalExperiments++;
    map.lastUpdated = new Date().toISOString();

    for (const mod of experiment.disabledModules) {
      let entry = map.moduleCriticality.find(m => m.module === mod);
      if (!entry) {
        entry = {
          module: mod,
          criticality: 0,
          avgDegradation: 0,
          capabilitiesAffected: 0,
          breaksInvariants: false,
          protectedInvariants: [],
          experimentCount: 0,
        };
        map.moduleCriticality.push(entry);
      }

      entry.experimentCount++;
      entry.avgDegradation = (entry.avgDegradation * (entry.experimentCount - 1) + experiment.degradationScore) / entry.experimentCount;
      entry.capabilitiesAffected = experiment.capabilityMeasurements.filter(m => m.retentionRatio < 0.9).length;

      if (experiment.invariantsBroken) {
        entry.breaksInvariants = true;
        entry.protectedInvariants.push(...experiment.brokenInvariants);
        entry.protectedInvariants = [...new Set(entry.protectedInvariants)];
      }

      entry.criticality = Math.min(1, entry.avgDegradation * 0.6 + (entry.breaksInvariants ? 0.4 : 0));
    }

    map.redundantModules = map.moduleCriticality
      .filter(m => m.avgDegradation < 0.05 && m.experimentCount >= 3 && !m.breaksInvariants)
      .map(m => m.module);

    const avgCriticality = map.moduleCriticality.length > 0
      ? map.moduleCriticality.reduce((s, m) => s + m.criticality, 0) / map.moduleCriticality.length
      : 0.5;
    const knowledgeFactor = Math.min(1, map.totalExperiments / 50);
    map.antifragilityIndex = (1 - avgCriticality) * knowledgeFactor * 2 - 1;
  }

  private emptyResilienceMap(): ResilienceMap {
    return {
      lastUpdated: new Date().toISOString(),
      totalExperiments: 0,
      moduleCriticality: [],
      redundantModules: [],
      antifragilityIndex: 0,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
