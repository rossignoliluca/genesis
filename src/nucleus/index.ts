/**
 * Nucleus v34 — Centro Gravitazionale
 *
 * The gravitational center of Genesis: classifies inputs, selects modules,
 * learns from outcomes, and self-improves through curiosity.
 */

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
