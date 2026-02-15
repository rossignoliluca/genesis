/**
 * Antifragile System — Gets Stronger from Failure
 *
 * Three mechanisms:
 * 1. ErrorTrainingPipeline: Capture, classify, learn from errors
 * 2. PredictiveAvoidanceEngine: Pre-action failure avoidance
 * 3. ChaosEngine: Cognitive stress testing during dream mode
 */

import { ErrorTrainingPipeline } from './error-pipeline.js';
import { PredictiveAvoidanceEngine } from './predictive-avoidance.js';
import { ChaosEngine } from './chaos-engine.js';
import { AntifragileConfig, DEFAULT_ANTIFRAGILE_CONFIG, ActionCheckResult, ResilienceMap } from './types.js';

export class AntifragileSystem {
  readonly pipeline: ErrorTrainingPipeline;
  readonly avoidance: PredictiveAvoidanceEngine;
  readonly chaos: ChaosEngine;

  constructor(config: AntifragileConfig = DEFAULT_ANTIFRAGILE_CONFIG) {
    this.pipeline = new ErrorTrainingPipeline(config);
    this.avoidance = new PredictiveAvoidanceEngine(config);
    this.chaos = new ChaosEngine(config.chaos);
  }

  /** Start all subsystems */
  start(): void {
    this.pipeline.start();
    this.avoidance.start();
  }

  /** Check if an action is safe before executing it */
  checkAction(domain: string, description: string, context?: Record<string, unknown>): ActionCheckResult {
    return this.avoidance.checkAction(domain, description, context);
  }

  /** Run chaos session (call during dream mode) */
  async runChaosSession(): Promise<ResilienceMap> {
    return this.chaos.runChaosSession();
  }

  /** Get the current resilience map */
  getResilienceMap(): ResilienceMap {
    return this.chaos.getResilienceMap();
  }

  /** Get all learned failure patterns */
  getPatterns() {
    return this.pipeline.getPatterns();
  }

  /** Get failure attractors */
  getAttractors(domain?: string) {
    return this.avoidance.getAttractors(domain);
  }
}

// Singleton
let _instance: AntifragileSystem | null = null;

export function getAntifragileSystem(config?: AntifragileConfig): AntifragileSystem {
  if (!_instance) _instance = new AntifragileSystem(config);
  return _instance;
}

export function resetAntifragileSystem(): void {
  _instance = null;
}

// Re-export
export * from './types.js';
export { ErrorTrainingPipeline } from './error-pipeline.js';
export { PredictiveAvoidanceEngine } from './predictive-avoidance.js';
export { ChaosEngine } from './chaos-engine.js';
