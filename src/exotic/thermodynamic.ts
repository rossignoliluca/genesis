/**
 * Thermodynamic Computing Module
 *
 * Implements energy-based computation inspired by statistical mechanics
 * and thermodynamics. Instead of deterministic gates, uses energy-based
 * sampling to explore solution spaces.
 *
 * Key concepts:
 * - Energy functions define problem landscapes
 * - Boltzmann sampling explores states proportionally to exp(-E/T)
 * - Simulated annealing finds global optima
 * - Maxwell's Demon directs probability toward goals
 *
 * Based on:
 * - Hopfield, J.J. (1982). Neural networks and physical systems
 * - Kirkpatrick, S. (1983). Optimization by Simulated Annealing
 * - Landauer's principle: computation has thermodynamic cost
 *
 * Usage:
 * ```typescript
 * import { ThermodynamicComputer } from './exotic/thermodynamic.js';
 *
 * const computer = new ThermodynamicComputer({ temperature: 1.0 });
 *
 * // Define energy function
 * const energy = (state) => -state.reduce((a, b) => a + b, 0);
 *
 * // Sample from Boltzmann distribution
 * const sample = computer.boltzmannSample(energy, initialState);
 *
 * // Find minimum energy state
 * const optimum = computer.anneal(energy, initialState, { maxSteps: 1000 });
 * ```
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export type State = number[];
export type EnergyFunction = (state: State) => number;
export type ProposalFunction = (state: State) => State;
export type PreferenceFunction = (state: State) => number;

export interface ThermodynamicConfig {
  temperature: number;           // T in Boltzmann distribution
  coolingRate: number;           // Rate for simulated annealing
  minTemperature: number;        // Minimum temperature
  maxSteps: number;              // Max sampling/annealing steps
  equilibrationSteps: number;    // Steps to reach equilibrium
  sampleInterval: number;        // Steps between samples
}

export interface Sample {
  state: State;
  energy: number;
  temperature: number;
  step: number;
}

export interface AnnealingResult {
  bestState: State;
  bestEnergy: number;
  finalTemperature: number;
  totalSteps: number;
  trajectory: Sample[];
  accepted: number;
  rejected: number;
}

export interface DemonResult {
  state: State;
  energy: number;
  preference: number;
  effectiveTemperature: number;
  iterations: number;
}

export interface ThermodynamicMetrics {
  totalSamples: number;
  totalAnneals: number;
  totalDemonCalls: number;
  averageAcceptanceRate: number;
  averageEnergy: number;
  lowestEnergyFound: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ThermodynamicConfig = {
  temperature: 1.0,
  coolingRate: 0.95,
  minTemperature: 0.001,
  maxSteps: 10000,
  equilibrationSteps: 100,
  sampleInterval: 10,
};

// ============================================================================
// Thermodynamic Computer
// ============================================================================

export class ThermodynamicComputer extends EventEmitter {
  private config: ThermodynamicConfig;
  private metrics: ThermodynamicMetrics;
  private rng: () => number;

  constructor(config: Partial<ThermodynamicConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = {
      totalSamples: 0,
      totalAnneals: 0,
      totalDemonCalls: 0,
      averageAcceptanceRate: 0,
      averageEnergy: 0,
      lowestEnergyFound: Infinity,
    };
    this.rng = Math.random;
  }

  // ============================================================================
  // Boltzmann Sampling
  // ============================================================================

  /**
   * Sample from Boltzmann distribution P(s) ∝ exp(-E(s)/T)
   */
  boltzmannSample(
    energy: EnergyFunction,
    initialState: State,
    options: {
      steps?: number;
      temperature?: number;
      proposal?: ProposalFunction;
    } = {}
  ): Sample[] {
    const steps = options.steps ?? this.config.maxSteps;
    const temperature = options.temperature ?? this.config.temperature;
    const proposal = options.proposal ?? this.defaultProposal;

    let currentState = [...initialState];
    let currentEnergy = energy(currentState);

    const samples: Sample[] = [];
    let accepted = 0;

    // Equilibration phase
    for (let i = 0; i < this.config.equilibrationSteps; i++) {
      const newState = proposal(currentState);
      const newEnergy = energy(newState);

      if (this.metropolisAccept(currentEnergy, newEnergy, temperature)) {
        currentState = newState;
        currentEnergy = newEnergy;
      }
    }

    // Sampling phase
    for (let step = 0; step < steps; step++) {
      const newState = proposal(currentState);
      const newEnergy = energy(newState);

      if (this.metropolisAccept(currentEnergy, newEnergy, temperature)) {
        currentState = newState;
        currentEnergy = newEnergy;
        accepted++;
      }

      // Collect sample at interval
      if (step % this.config.sampleInterval === 0) {
        samples.push({
          state: [...currentState],
          energy: currentEnergy,
          temperature,
          step,
        });
      }

      // Track lowest energy
      if (currentEnergy < this.metrics.lowestEnergyFound) {
        this.metrics.lowestEnergyFound = currentEnergy;
      }
    }

    this.metrics.totalSamples += samples.length;
    this.updateAcceptanceRate(accepted / steps);

    this.emit('sampling:complete', { samples: samples.length, accepted, steps });
    return samples;
  }

  /**
   * Metropolis acceptance criterion
   */
  private metropolisAccept(
    currentEnergy: number,
    newEnergy: number,
    temperature: number
  ): boolean {
    if (newEnergy < currentEnergy) {
      return true;
    }

    const deltaE = newEnergy - currentEnergy;
    const probability = Math.exp(-deltaE / temperature);
    return this.rng() < probability;
  }

  /**
   * Default proposal: perturb one dimension
   */
  private defaultProposal = (state: State): State => {
    const newState = [...state];
    const index = Math.floor(this.rng() * state.length);
    newState[index] += (this.rng() - 0.5) * 2 * this.config.temperature;
    return newState;
  };

  // ============================================================================
  // Simulated Annealing
  // ============================================================================

  /**
   * Find global minimum using simulated annealing
   */
  anneal(
    energy: EnergyFunction,
    initialState: State,
    options: {
      maxSteps?: number;
      coolingRate?: number;
      startTemp?: number;
      minTemp?: number;
      proposal?: ProposalFunction;
      trackTrajectory?: boolean;
    } = {}
  ): AnnealingResult {
    const maxSteps = options.maxSteps ?? this.config.maxSteps;
    const coolingRate = options.coolingRate ?? this.config.coolingRate;
    const startTemp = options.startTemp ?? this.config.temperature * 10;
    const minTemp = options.minTemp ?? this.config.minTemperature;
    const proposal = options.proposal ?? this.defaultProposal;
    const trackTrajectory = options.trackTrajectory ?? false;

    let temperature = startTemp;
    let currentState = [...initialState];
    let currentEnergy = energy(currentState);
    let bestState = [...currentState];
    let bestEnergy = currentEnergy;

    const trajectory: Sample[] = [];
    let accepted = 0;
    let rejected = 0;
    let step = 0;

    while (step < maxSteps && temperature > minTemp) {
      // Perform steps at current temperature
      for (let i = 0; i < this.config.equilibrationSteps; i++) {
        const newState = proposal(currentState);
        const newEnergy = energy(newState);

        if (this.metropolisAccept(currentEnergy, newEnergy, temperature)) {
          currentState = newState;
          currentEnergy = newEnergy;
          accepted++;

          // Track best
          if (currentEnergy < bestEnergy) {
            bestState = [...currentState];
            bestEnergy = currentEnergy;
          }
        } else {
          rejected++;
        }

        step++;
        if (step >= maxSteps) break;
      }

      // Record trajectory point
      if (trackTrajectory) {
        trajectory.push({
          state: [...currentState],
          energy: currentEnergy,
          temperature,
          step,
        });
      }

      // Cool down
      temperature *= coolingRate;

      this.emit('annealing:step', { step, temperature, energy: currentEnergy });
    }

    // Update metrics
    this.metrics.totalAnneals++;
    this.updateAcceptanceRate(accepted / (accepted + rejected));
    if (bestEnergy < this.metrics.lowestEnergyFound) {
      this.metrics.lowestEnergyFound = bestEnergy;
    }

    const result: AnnealingResult = {
      bestState,
      bestEnergy,
      finalTemperature: temperature,
      totalSteps: step,
      trajectory,
      accepted,
      rejected,
    };

    this.emit('annealing:complete', result);
    return result;
  }

  // ============================================================================
  // Maxwell's Demon
  // ============================================================================

  /**
   * Maxwell's Demon: direct probability toward preferred outcomes
   *
   * This biases the Boltzmann distribution by incorporating preferences,
   * effectively lowering the energy of preferred states.
   */
  demonSample(
    energy: EnergyFunction,
    preferences: PreferenceFunction,
    initialState: State,
    options: {
      preferenceWeight?: number;
      steps?: number;
      temperature?: number;
    } = {}
  ): DemonResult {
    const weight = options.preferenceWeight ?? 1.0;
    const steps = options.steps ?? this.config.maxSteps;
    const temperature = options.temperature ?? this.config.temperature;

    // Combined energy: E_total = E_physical - λ * Preference
    const combinedEnergy: EnergyFunction = (state: State) => {
      return energy(state) - weight * preferences(state);
    };

    let currentState = [...initialState];
    let currentEnergy = combinedEnergy(currentState);
    let bestState = [...currentState];
    let bestEnergy = currentEnergy;
    let bestPreference = preferences(currentState);

    for (let i = 0; i < steps; i++) {
      const newState = this.defaultProposal(currentState);
      const newEnergy = combinedEnergy(newState);

      if (this.metropolisAccept(currentEnergy, newEnergy, temperature)) {
        currentState = newState;
        currentEnergy = newEnergy;

        const pref = preferences(currentState);
        if (pref > bestPreference) {
          bestState = [...currentState];
          bestEnergy = energy(currentState);
          bestPreference = pref;
        }
      }
    }

    this.metrics.totalDemonCalls++;

    const result: DemonResult = {
      state: bestState,
      energy: bestEnergy,
      preference: bestPreference,
      effectiveTemperature: temperature / (1 + weight),
      iterations: steps,
    };

    this.emit('demon:complete', result);
    return result;
  }

  /**
   * Concentrate probability toward high-reward outcomes
   *
   * This is a more aggressive demon that actively seeks high-reward regions.
   */
  concentrateProbability(
    energy: EnergyFunction,
    preferences: PreferenceFunction,
    initialState: State,
    options: {
      concentrationFactor?: number;
      iterations?: number;
    } = {}
  ): DemonResult {
    const factor = options.concentrationFactor ?? 2.0;
    const iterations = options.iterations ?? 5;

    let state = [...initialState];
    let temperature = this.config.temperature;

    // Iteratively concentrate
    for (let i = 0; i < iterations; i++) {
      const result = this.demonSample(energy, preferences, state, {
        preferenceWeight: factor * (i + 1),
        temperature: temperature / (i + 1),
        steps: this.config.maxSteps / iterations,
      });

      state = result.state;

      // If we found a high-preference state, tighten around it
      if (result.preference > 0.8) {
        temperature *= 0.5;
      }
    }

    return {
      state,
      energy: energy(state),
      preference: preferences(state),
      effectiveTemperature: temperature / (1 + factor * iterations),
      iterations,
    };
  }

  // ============================================================================
  // Physical Denoising
  // ============================================================================

  /**
   * Denoise data using thermal relaxation
   *
   * Idea: Noisy data = signal + thermal noise
   * At lower temperature, thermal noise decreases
   */
  denoise(
    noisyData: State,
    signalEnergy: EnergyFunction,
    options: {
      startTemp?: number;
      endTemp?: number;
      steps?: number;
    } = {}
  ): State {
    const startTemp = options.startTemp ?? 1.0;
    const endTemp = options.endTemp ?? 0.01;
    const steps = options.steps ?? 1000;

    // Define noise-penalizing energy
    const smoothnessEnergy: EnergyFunction = (state: State) => {
      let energy = signalEnergy(state);

      // Add smoothness penalty (penalize rapid changes)
      for (let i = 1; i < state.length; i++) {
        energy += 0.1 * Math.pow(state[i] - state[i - 1], 2);
      }

      // Penalize deviation from original (weak prior)
      for (let i = 0; i < state.length; i++) {
        energy += 0.01 * Math.pow(state[i] - noisyData[i], 2);
      }

      return energy;
    };

    // Anneal to find clean signal
    const result = this.anneal(smoothnessEnergy, noisyData, {
      startTemp,
      minTemp: endTemp,
      maxSteps: steps,
      coolingRate: Math.pow(endTemp / startTemp, 1 / (steps / this.config.equilibrationSteps)),
    });

    this.emit('denoise:complete', { originalNoise: this.estimateNoise(noisyData, result.bestState) });
    return result.bestState;
  }

  /**
   * Estimate noise level
   */
  private estimateNoise(original: State, denoised: State): number {
    let sumSq = 0;
    for (let i = 0; i < original.length; i++) {
      sumSq += Math.pow(original[i] - denoised[i], 2);
    }
    return Math.sqrt(sumSq / original.length);
  }

  // ============================================================================
  // Equilibration
  // ============================================================================

  /**
   * Equilibrate system at given temperature
   */
  equilibrate(
    energy: EnergyFunction,
    initialState: State,
    options: {
      temperature?: number;
      steps?: number;
    } = {}
  ): Sample {
    const temperature = options.temperature ?? this.config.temperature;
    const steps = options.steps ?? this.config.equilibrationSteps * 10;

    let currentState = [...initialState];
    let currentEnergy = energy(currentState);

    for (let i = 0; i < steps; i++) {
      const newState = this.defaultProposal(currentState);
      const newEnergy = energy(newState);

      if (this.metropolisAccept(currentEnergy, newEnergy, temperature)) {
        currentState = newState;
        currentEnergy = newEnergy;
      }
    }

    return {
      state: currentState,
      energy: currentEnergy,
      temperature,
      step: steps,
    };
  }

  // ============================================================================
  // Partition Function Estimation
  // ============================================================================

  /**
   * Estimate partition function Z = Σ exp(-E(s)/T)
   * Using thermodynamic integration
   */
  estimatePartitionFunction(
    energy: EnergyFunction,
    referenceState: State,
    options: {
      temperatures?: number[];
      samplesPerTemp?: number;
    } = {}
  ): number {
    const temps = options.temperatures ?? [10, 5, 2, 1, 0.5, 0.2, 0.1];
    const samplesPerTemp = options.samplesPerTemp ?? 100;

    const averageEnergies: number[] = [];
    let currentState = [...referenceState];

    // Sample at each temperature
    for (const temp of temps) {
      const samples = this.boltzmannSample(energy, currentState, {
        steps: samplesPerTemp * this.config.sampleInterval,
        temperature: temp,
      });

      const avgE = samples.reduce((sum, s) => sum + s.energy, 0) / samples.length;
      averageEnergies.push(avgE);

      // Use final state for next temperature
      currentState = samples[samples.length - 1].state;
    }

    // Thermodynamic integration: ln(Z) = -β<E> + const
    // This is a simplified estimate
    const finalTemp = temps[temps.length - 1];
    const finalAvgE = averageEnergies[averageEnergies.length - 1];

    return Math.exp(-finalAvgE / finalTemp);
  }

  // ============================================================================
  // Free Energy Estimation
  // ============================================================================

  /**
   * Estimate free energy F = -T ln(Z)
   */
  estimateFreeEnergy(
    energy: EnergyFunction,
    referenceState: State,
    temperature: number
  ): number {
    const Z = this.estimatePartitionFunction(energy, referenceState, {
      temperatures: [temperature * 2, temperature, temperature / 2],
    });

    return -temperature * Math.log(Z);
  }

  // ============================================================================
  // Metrics & Configuration
  // ============================================================================

  private updateAcceptanceRate(rate: number): void {
    const n = this.metrics.totalSamples + this.metrics.totalAnneals;
    this.metrics.averageAcceptanceRate =
      (this.metrics.averageAcceptanceRate * (n - 1) + rate) / n;
  }

  setTemperature(temperature: number): void {
    this.config.temperature = temperature;
  }

  getTemperature(): number {
    return this.config.temperature;
  }

  getMetrics(): ThermodynamicMetrics {
    return { ...this.metrics };
  }

  getConfig(): ThermodynamicConfig {
    return { ...this.config };
  }

  setRng(rng: () => number): void {
    this.rng = rng;
  }

  reset(): void {
    this.metrics = {
      totalSamples: 0,
      totalAnneals: 0,
      totalDemonCalls: 0,
      averageAcceptanceRate: 0,
      averageEnergy: 0,
      lowestEnergyFound: Infinity,
    };
    this.emit('reset');
  }
}

// ============================================================================
// Energy Function Builders
// ============================================================================

/**
 * Create quadratic energy function: E = x^T A x + b^T x
 */
export function createQuadraticEnergy(
  A: number[][],
  b: number[]
): EnergyFunction {
  return (state: State): number => {
    let energy = 0;

    // Quadratic term
    for (let i = 0; i < state.length; i++) {
      for (let j = 0; j < state.length; j++) {
        energy += state[i] * A[i][j] * state[j];
      }
    }

    // Linear term
    for (let i = 0; i < state.length; i++) {
      energy += b[i] * state[i];
    }

    return energy;
  };
}

/**
 * Create Ising model energy: E = -Σ J_ij s_i s_j - h Σ s_i
 */
export function createIsingEnergy(
  J: number[][],
  h: number = 0
): EnergyFunction {
  return (state: State): number => {
    let energy = 0;

    // Interaction term
    for (let i = 0; i < state.length; i++) {
      for (let j = i + 1; j < state.length; j++) {
        energy -= J[i][j] * Math.sign(state[i]) * Math.sign(state[j]);
      }
    }

    // External field
    for (let i = 0; i < state.length; i++) {
      energy -= h * Math.sign(state[i]);
    }

    return energy;
  };
}

/**
 * Create Hopfield network energy: E = -1/2 Σ w_ij s_i s_j
 */
export function createHopfieldEnergy(patterns: State[]): EnergyFunction {
  // Learn weights from patterns (Hebbian rule)
  const n = patterns[0].length;
  const W: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));

  for (const pattern of patterns) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          W[i][j] += pattern[i] * pattern[j] / patterns.length;
        }
      }
    }
  }

  return (state: State): number => {
    let energy = 0;

    for (let i = 0; i < state.length; i++) {
      for (let j = i + 1; j < state.length; j++) {
        energy -= W[i][j] * state[i] * state[j];
      }
    }

    return energy;
  };
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a thermodynamic computer
 */
export function createThermodynamicComputer(
  config?: Partial<ThermodynamicConfig>
): ThermodynamicComputer {
  return new ThermodynamicComputer(config);
}

// ============================================================================
// Global Instance
// ============================================================================

let globalComputer: ThermodynamicComputer | null = null;

/**
 * Get global thermodynamic computer instance
 */
export function getThermodynamicComputer(
  config?: Partial<ThermodynamicConfig>
): ThermodynamicComputer {
  if (!globalComputer) {
    globalComputer = new ThermodynamicComputer(config);
  }
  return globalComputer;
}

/**
 * Reset global thermodynamic computer
 */
export function resetThermodynamicComputer(): void {
  if (globalComputer) {
    globalComputer.reset();
  }
  globalComputer = null;
}
