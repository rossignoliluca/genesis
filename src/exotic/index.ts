/**
 * Exotic Computing Module
 *
 * Revolutionary computing paradigms beyond traditional von Neumann architecture.
 * These modules implement brain-inspired and physics-inspired computation.
 *
 * Components:
 * - Thermodynamic Computing: Energy-based sampling and optimization
 * - Hyperdimensional Computing: Vector Symbolic Architecture (VSA)
 * - Reservoir Computing: Echo State Networks for temporal processing
 *
 * Usage:
 * ```typescript
 * import {
 *   ThermodynamicComputer,
 *   HyperdimensionalMemory,
 *   ReservoirComputer,
 * } from './exotic/index.js';
 *
 * // Thermodynamic optimization
 * const thermo = new ThermodynamicComputer({ temperature: 1.0 });
 * const optimum = thermo.anneal(energyFn, initialState);
 *
 * // Hyperdimensional memory
 * const hd = new HyperdimensionalMemory({ dimension: 10000 });
 * const redApple = hd.bind(hd.get('red'), hd.get('apple'));
 *
 * // Reservoir computing for time series
 * const esn = new ReservoirComputer({ reservoirSize: 500 });
 * esn.train(inputs, targets);
 * const prediction = esn.predict(newInput);
 * ```
 */

// ============================================================================
// Thermodynamic Computing
// ============================================================================

export {
  ThermodynamicComputer,
  createThermodynamicComputer,
  getThermodynamicComputer,
  resetThermodynamicComputer,
  createQuadraticEnergy,
  createIsingEnergy,
  createHopfieldEnergy,
  type State,
  type EnergyFunction,
  type ProposalFunction,
  type PreferenceFunction,
  type ThermodynamicConfig,
  type Sample,
  type AnnealingResult,
  type DemonResult,
  type ThermodynamicMetrics,
} from './thermodynamic.js';

// ============================================================================
// Hyperdimensional Computing
// ============================================================================

export {
  HyperdimensionalMemory,
  createHyperdimensionalMemory,
  getHyperdimensionalMemory,
  resetHyperdimensionalMemory,
  type HyperVector,
  type HDCConfig,
  type MemoryEntry,
  type QueryResult as HDCQueryResult,
  type HDCMetrics,
  type Sequence,
} from './hyperdimensional.js';

// ============================================================================
// Reservoir Computing
// ============================================================================

export {
  ReservoirComputer,
  createReservoirComputer,
  getReservoirComputer,
  resetReservoirComputer,
  createChaoticReservoir,
  createSequenceReservoir,
  createFastReservoir,
  type Matrix,
  type Vector,
  type TimeSeries,
  type ReservoirConfig,
  type TrainResult,
  type ReservoirState,
  type ReservoirMetrics,
} from './reservoir.js';

// ============================================================================
// Unified Interface
// ============================================================================

import { createPublisher } from '../bus/index.js';
import { ThermodynamicComputer, type ThermodynamicConfig } from './thermodynamic.js';
import { HyperdimensionalMemory, type HDCConfig } from './hyperdimensional.js';
import { ReservoirComputer, type ReservoirConfig } from './reservoir.js';

const publisher = createPublisher('exotic');

// Emit init event
publisher.publish('system.booted', {
  source: 'exotic',
  precision: 1.0,
  module: 'exotic-computing'
} as any);

export interface ExoticComputingConfig {
  thermodynamic?: Partial<ThermodynamicConfig>;
  hyperdimensional?: Partial<HDCConfig>;
  reservoir?: Partial<ReservoirConfig>;
}

/**
 * Unified exotic computing interface
 */
export class ExoticComputing {
  readonly thermodynamic: ThermodynamicComputer;
  readonly hyperdimensional: HyperdimensionalMemory;
  readonly reservoir: ReservoirComputer;

  constructor(config: ExoticComputingConfig = {}) {
    this.thermodynamic = new ThermodynamicComputer(config.thermodynamic);
    this.hyperdimensional = new HyperdimensionalMemory(config.hyperdimensional);
    this.reservoir = new ReservoirComputer(config.reservoir);
  }

  /**
   * Get metrics from all components
   */
  getMetrics(): {
    thermodynamic: ReturnType<ThermodynamicComputer['getMetrics']>;
    hyperdimensional: ReturnType<HyperdimensionalMemory['getMetrics']>;
    reservoir: ReturnType<ReservoirComputer['getMetrics']>;
  } {
    return {
      thermodynamic: this.thermodynamic.getMetrics(),
      hyperdimensional: this.hyperdimensional.getMetrics(),
      reservoir: this.reservoir.getMetrics(),
    };
  }

  /**
   * Reset all components
   */
  reset(): void {
    this.thermodynamic.reset();
    this.hyperdimensional.clear();
    this.reservoir.resetState();
  }
}

/**
 * Create unified exotic computing interface
 */
export function createExoticComputing(
  config?: ExoticComputingConfig
): ExoticComputing {
  return new ExoticComputing(config);
}
