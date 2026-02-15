/**
 * Nucleus v34 — Centro Gravitazionale
 *
 * The gravitational center of Genesis: classifies inputs, selects modules,
 * learns from outcomes, and self-improves through curiosity.
 */

import { createPublisher } from '../bus/index.js';
const publisher = createPublisher('nucleus');
publisher.publish('system.booted', { source: 'nucleus', precision: 1.0 } as any);

export type {
  InputClassification,
  ModulePhase,
  ModuleDescriptor,
  NucleusContext,
  ExecutionPlan,
  ProcessingOutcome,
  PlasticityStats,
  ExplorationResult,
} from './types.js';
export { PHASE_ORDER } from './types.js';
export { createModuleMap } from './module-map.js';
export { Plasticity, getPlasticity, resetPlasticity } from './plasticity.js';
export { CuriosityEngine, getCuriosityEngine, resetCuriosityEngine } from './curiosity.js';
export { Orchestrator, getNucleus, resetNucleus } from './orchestrator.js';
