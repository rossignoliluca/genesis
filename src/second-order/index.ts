/**
 * Second-Order Cybernetics Module
 *
 * Implements von Foerster's second-order cybernetics:
 * - Observer hierarchy (observers observing observers)
 * - Operational closure (self-maintaining boundaries)
 * - Structural coupling (co-evolution with environment)
 * - Eigenforms (stable self-referential patterns)
 *
 * "The observer enters the domain of observation"
 * - Heinz von Foerster
 *
 * Based on:
 * - Heinz von Foerster's "Observing Systems"
 * - Maturana & Varela's autopoiesis
 * - Luhmann's social systems theory
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export interface Observer {
  id: string;
  level: number;           // 0 = first-order, 1+ = higher orders
  distinctions: Map<string, Distinction>;
  blindSpots: Set<string>;
  observes: string[];      // IDs of what this observer observes
  observedBy: string[];    // IDs of observers observing this
  eigenforms: Eigenform[];
  timestamp: number;
}

export interface Distinction {
  id: string;
  marked: string;          // What is distinguished
  unmarked: string;        // The background/context
  observerId: string;
  recursiveDepth: number;  // How many levels of re-entry
  timestamp: number;
}

export interface Eigenform {
  id: string;
  pattern: string;
  stability: number;       // 0-1, how stable
  iterations: number;      // How many iterations to stabilize
  observerId: string;
}

export interface OperationalClosure {
  systemId: string;
  operations: Operation[];
  boundary: Boundary;
  internal: Set<string>;   // Internal elements
  external: Set<string>;   // External elements (environment)
  closureStrength: number; // 0-1, how operationally closed
}

export interface Operation {
  id: string;
  type: OperationType;
  input: string;
  output: string;
  recursive: boolean;      // Does it operate on itself?
  timestamp: number;
}

export type OperationType =
  | 'distinction'    // Making a distinction
  | 'indication'     // Pointing to one side
  | 'computation'    // Processing
  | 'communication'  // With environment
  | 're_entry';      // Self-reference

export interface Boundary {
  permeability: number;    // 0-1, how permeable
  selectivity: Map<string, number>;  // What passes and how easily
  maintenance: number;     // 0-1, self-maintenance strength
}

export interface StructuralCoupling {
  id: string;
  system1: string;
  system2: string;
  couplingStrength: number;
  coEvolutionHistory: CoEvolutionEvent[];
  perturbations: Perturbation[];
  resonances: Resonance[];
}

export interface CoEvolutionEvent {
  timestamp: number;
  system1Change: string;
  system2Change: string;
  mutualInfluence: number;
}

export interface Perturbation {
  id: string;
  source: 'internal' | 'external';
  magnitude: number;
  absorbed: boolean;
  compensation: string | null;
  timestamp: number;
}

export interface Resonance {
  id: string;
  frequency: number;       // Oscillation frequency
  amplitude: number;
  phase: number;
  harmonic: boolean;       // In harmony?
}

export interface SecondOrderState {
  observers: Map<string, Observer>;
  closures: Map<string, OperationalClosure>;
  couplings: StructuralCoupling[];
  eigenforms: Eigenform[];
  observationChain: string[];  // History of observations
}

export interface CyberneticsConfig {
  maxObserverLevel: number;
  eigenformThreshold: number;
  closureThreshold: number;
  couplingDecay: number;
  maxDistinctions: number;
}

export interface CyberneticsMetrics {
  observersCreated: number;
  distinctionsMade: number;
  eigenformsFound: number;
  closuresEstablished: number;
  couplingsFormed: number;
  maxObserverLevel: number;
  totalPerturbations: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: CyberneticsConfig = {
  maxObserverLevel: 5,
  eigenformThreshold: 0.8,
  closureThreshold: 0.7,
  couplingDecay: 0.01,
  maxDistinctions: 100
};

// ============================================================================
// Second-Order Cybernetics Engine
// ============================================================================

export class SecondOrderCybernetics extends EventEmitter {
  private config: CyberneticsConfig;
  private state: SecondOrderState;
  private metrics: CyberneticsMetrics;

  constructor(config: Partial<CyberneticsConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      observers: new Map(),
      closures: new Map(),
      couplings: [],
      eigenforms: [],
      observationChain: []
    };
    this.metrics = {
      observersCreated: 0,
      distinctionsMade: 0,
      eigenformsFound: 0,
      closuresEstablished: 0,
      couplingsFormed: 0,
      maxObserverLevel: 0,
      totalPerturbations: 0
    };

    // Create primordial observer (level 0)
    this.createObserver(0);
  }

  // ==========================================================================
  // Observer Management
  // ==========================================================================

  /**
   * Create an observer at a given level
   */
  createObserver(level: number = 0): Observer {
    if (level > this.config.maxObserverLevel) {
      level = this.config.maxObserverLevel;
    }

    const observer: Observer = {
      id: `observer-${level}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      level,
      distinctions: new Map(),
      blindSpots: new Set(),
      observes: [],
      observedBy: [],
      eigenforms: [],
      timestamp: Date.now()
    };

    this.state.observers.set(observer.id, observer);
    this.metrics.observersCreated++;

    if (level > this.metrics.maxObserverLevel) {
      this.metrics.maxObserverLevel = level;
    }

    this.emit('observer:created', observer);
    return observer;
  }

  /**
   * Create a second-order observer that observes another observer
   */
  createSecondOrderObserver(targetId: string): Observer | null {
    const target = this.state.observers.get(targetId);
    if (!target) return null;

    const observer = this.createObserver(target.level + 1);
    observer.observes.push(targetId);
    target.observedBy.push(observer.id);

    // The second-order observer can see the target's blind spots
    // but has its own blind spots
    observer.blindSpots.add(`own-observation-of-${targetId}`);

    this.emit('observer:secondOrder', { observer, target });
    return observer;
  }

  /**
   * Make a distinction (Spencer-Brown's Laws of Form)
   */
  makeDistinction(
    observerId: string,
    marked: string,
    unmarked: string
  ): Distinction | null {
    const observer = this.state.observers.get(observerId);
    if (!observer) return null;

    if (observer.distinctions.size >= this.config.maxDistinctions) {
      // Compress older distinctions
      this.compressDistinctions(observer);
    }

    const distinction: Distinction = {
      id: `dist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      marked,
      unmarked,
      observerId,
      recursiveDepth: 0,
      timestamp: Date.now()
    };

    observer.distinctions.set(distinction.id, distinction);
    this.metrics.distinctionsMade++;
    this.state.observationChain.push(`${observerId}:${marked}/${unmarked}`);

    this.emit('distinction:made', distinction);
    return distinction;
  }

  /**
   * Re-entry: distinction referring to itself (self-reference)
   */
  reEntry(distinctionId: string): Distinction | null {
    // Find the distinction
    for (const observer of this.state.observers.values()) {
      const distinction = observer.distinctions.get(distinctionId);
      if (distinction) {
        // Create re-entrant form
        const reEntrant: Distinction = {
          id: `reentry-${distinctionId}-${Date.now()}`,
          marked: `[${distinction.marked}]`,  // Re-entered form
          unmarked: distinction.unmarked,
          observerId: distinction.observerId,
          recursiveDepth: distinction.recursiveDepth + 1,
          timestamp: Date.now()
        };

        observer.distinctions.set(reEntrant.id, reEntrant);
        this.emit('distinction:reEntry', { original: distinction, reEntrant });
        return reEntrant;
      }
    }
    return null;
  }

  /**
   * Find eigenforms (stable self-referential patterns)
   */
  findEigenforms(observerId: string, iterations: number = 10): Eigenform[] {
    const observer = this.state.observers.get(observerId);
    if (!observer) return [];

    const eigenforms: Eigenform[] = [];
    const patterns = new Map<string, number>();

    // Look for stable patterns in distinctions
    for (const distinction of observer.distinctions.values()) {
      const pattern = `${distinction.marked}|${distinction.recursiveDepth}`;
      patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
    }

    // Patterns that appear consistently are eigenforms
    for (const [pattern, count] of patterns) {
      const stability = Math.min(count / iterations, 1);
      if (stability >= this.config.eigenformThreshold) {
        const eigenform: Eigenform = {
          id: `eigen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          pattern,
          stability,
          iterations: count,
          observerId
        };
        eigenforms.push(eigenform);
        observer.eigenforms.push(eigenform);
        this.state.eigenforms.push(eigenform);
        this.metrics.eigenformsFound++;
      }
    }

    this.emit('eigenforms:found', { observerId, eigenforms });
    return eigenforms;
  }

  // ==========================================================================
  // Operational Closure
  // ==========================================================================

  /**
   * Establish operational closure for a system
   */
  establishClosure(systemId: string, operations: Operation[]): OperationalClosure {
    // Determine what's internal vs external based on operations
    const internal = new Set<string>();
    const external = new Set<string>();

    for (const op of operations) {
      if (op.recursive) {
        internal.add(op.input);
        internal.add(op.output);
      } else {
        external.add(op.input);
        internal.add(op.output);
      }
    }

    // Calculate closure strength
    const recursiveOps = operations.filter(op => op.recursive).length;
    const closureStrength = operations.length > 0
      ? recursiveOps / operations.length
      : 0;

    const closure: OperationalClosure = {
      systemId,
      operations,
      boundary: {
        permeability: 1 - closureStrength,
        selectivity: new Map(),
        maintenance: closureStrength
      },
      internal,
      external,
      closureStrength
    };

    this.state.closures.set(systemId, closure);
    this.metrics.closuresEstablished++;

    this.emit('closure:established', closure);
    return closure;
  }

  /**
   * Add operation to a closed system
   */
  addOperation(
    systemId: string,
    type: OperationType,
    input: string,
    output: string
  ): Operation | null {
    const closure = this.state.closures.get(systemId);
    if (!closure) return null;

    const operation: Operation = {
      id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      input,
      output,
      recursive: type === 're_entry' || input === output,
      timestamp: Date.now()
    };

    closure.operations.push(operation);

    // Update internal/external sets
    if (operation.recursive) {
      closure.internal.add(input);
      closure.internal.add(output);
    } else {
      closure.external.add(input);
      closure.internal.add(output);
    }

    // Recalculate closure strength
    const recursiveOps = closure.operations.filter(op => op.recursive).length;
    closure.closureStrength = closure.operations.length > 0
      ? recursiveOps / closure.operations.length
      : 0;

    this.emit('operation:added', { systemId, operation });
    return operation;
  }

  /**
   * Check if a system maintains operational closure
   */
  checkClosure(systemId: string): boolean {
    const closure = this.state.closures.get(systemId);
    return closure !== undefined &&
           closure.closureStrength >= this.config.closureThreshold;
  }

  // ==========================================================================
  // Structural Coupling
  // ==========================================================================

  /**
   * Establish structural coupling between two systems
   */
  couple(system1: string, system2: string): StructuralCoupling {
    const coupling: StructuralCoupling = {
      id: `coupling-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      system1,
      system2,
      couplingStrength: 0.5,  // Start at medium coupling
      coEvolutionHistory: [],
      perturbations: [],
      resonances: []
    };

    this.state.couplings.push(coupling);
    this.metrics.couplingsFormed++;

    this.emit('coupling:established', coupling);
    return coupling;
  }

  /**
   * Record a perturbation in a coupling
   */
  perturb(
    couplingId: string,
    source: 'internal' | 'external',
    magnitude: number
  ): Perturbation | null {
    const coupling = this.state.couplings.find(c => c.id === couplingId);
    if (!coupling) return null;

    const perturbation: Perturbation = {
      id: `perturb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      source,
      magnitude,
      absorbed: magnitude < coupling.couplingStrength,
      compensation: null,
      timestamp: Date.now()
    };

    if (perturbation.absorbed) {
      perturbation.compensation = `compensated-${magnitude.toFixed(2)}`;
      // Successful absorption strengthens coupling
      coupling.couplingStrength = Math.min(
        coupling.couplingStrength + 0.01 * magnitude,
        1
      );
    } else {
      // Failed absorption weakens coupling
      coupling.couplingStrength = Math.max(
        coupling.couplingStrength - 0.05 * magnitude,
        0
      );
    }

    coupling.perturbations.push(perturbation);
    this.metrics.totalPerturbations++;

    this.emit('perturbation:recorded', { coupling, perturbation });
    return perturbation;
  }

  /**
   * Record co-evolution event
   */
  coEvolve(
    couplingId: string,
    system1Change: string,
    system2Change: string,
    mutualInfluence: number
  ): CoEvolutionEvent | null {
    const coupling = this.state.couplings.find(c => c.id === couplingId);
    if (!coupling) return null;

    const event: CoEvolutionEvent = {
      timestamp: Date.now(),
      system1Change,
      system2Change,
      mutualInfluence
    };

    coupling.coEvolutionHistory.push(event);

    // Co-evolution strengthens coupling
    coupling.couplingStrength = Math.min(
      coupling.couplingStrength + 0.02 * mutualInfluence,
      1
    );

    this.emit('coEvolution:recorded', { coupling, event });
    return event;
  }

  /**
   * Check for resonance between coupled systems
   */
  checkResonance(couplingId: string): Resonance | null {
    const coupling = this.state.couplings.find(c => c.id === couplingId);
    if (!coupling || coupling.coEvolutionHistory.length < 3) return null;

    // Analyze recent co-evolution for periodic patterns
    const recent = coupling.coEvolutionHistory.slice(-10);
    const influences = recent.map(e => e.mutualInfluence);

    // Simple oscillation detection
    let oscillations = 0;
    for (let i = 1; i < influences.length; i++) {
      if ((influences[i] > 0.5) !== (influences[i-1] > 0.5)) {
        oscillations++;
      }
    }

    if (oscillations >= 2) {
      const resonance: Resonance = {
        id: `resonance-${Date.now()}`,
        frequency: oscillations / recent.length,
        amplitude: Math.max(...influences) - Math.min(...influences),
        phase: Math.atan2(
          influences[influences.length - 1] - 0.5,
          influences[influences.length - 2] - 0.5
        ),
        harmonic: oscillations >= recent.length / 2
      };

      coupling.resonances.push(resonance);
      this.emit('resonance:detected', { coupling, resonance });
      return resonance;
    }

    return null;
  }

  // ==========================================================================
  // Observation Chains
  // ==========================================================================

  /**
   * Observe - the fundamental operation
   */
  observe(observerId: string, what: string): string {
    const observer = this.state.observers.get(observerId);
    if (!observer) return '';

    // Check if we're observing another observer
    const targetObserver = this.state.observers.get(what);
    if (targetObserver) {
      // Second-order observation
      if (!observer.observes.includes(what)) {
        observer.observes.push(what);
        targetObserver.observedBy.push(observerId);
      }

      // We can see their distinctions but not our own blind spots
      const observation = `Observer-${observer.level} observes Observer-${targetObserver.level}: ` +
        `${targetObserver.distinctions.size} distinctions, ` +
        `${targetObserver.blindSpots.size} blind spots`;

      this.state.observationChain.push(observation);
      this.emit('observation:made', { observer, target: targetObserver });
      return observation;
    }

    // First-order observation (observing non-observer)
    const distinction = this.makeDistinction(
      observerId,
      what,
      `not-${what}`
    );

    const observation = `Observer-${observer.level} distinguishes: ${what}`;
    this.state.observationChain.push(observation);

    return observation;
  }

  /**
   * Self-observe (creates paradox/eigenform potential)
   */
  selfObserve(observerId: string): Eigenform | null {
    const observer = this.state.observers.get(observerId);
    if (!observer) return null;

    // Self-observation creates re-entry
    const selfDistinction = this.makeDistinction(
      observerId,
      `self-${observerId}`,
      `other-than-${observerId}`
    );

    if (selfDistinction) {
      // Re-enter the self-distinction
      this.reEntry(selfDistinction.id);

      // Look for eigenform (stable self-reference)
      const eigenforms = this.findEigenforms(observerId);

      // Self-observation reveals blind spot
      observer.blindSpots.add('cannot-see-self-seeing');

      this.emit('selfObservation:made', { observer, eigenforms });
      return eigenforms[0] || null;
    }

    return null;
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Compress distinctions to save memory
   */
  private compressDistinctions(observer: Observer): void {
    // Keep only recent and high-depth distinctions
    const distinctions = Array.from(observer.distinctions.values());
    distinctions.sort((a, b) => {
      // Prioritize high recursive depth and recent
      const depthScore = (b.recursiveDepth - a.recursiveDepth) * 1000;
      const timeScore = b.timestamp - a.timestamp;
      return depthScore + timeScore / 1000000;
    });

    // Keep top half
    const keep = distinctions.slice(0, Math.floor(distinctions.length / 2));
    observer.distinctions.clear();
    for (const d of keep) {
      observer.distinctions.set(d.id, d);
    }
  }

  /**
   * Decay couplings over time
   */
  decayCouplings(): void {
    for (const coupling of this.state.couplings) {
      coupling.couplingStrength = Math.max(
        coupling.couplingStrength - this.config.couplingDecay,
        0
      );
    }
  }

  /**
   * Get observer hierarchy
   */
  getObserverHierarchy(): Map<number, Observer[]> {
    const hierarchy = new Map<number, Observer[]>();

    for (const observer of this.state.observers.values()) {
      const level = hierarchy.get(observer.level) || [];
      level.push(observer);
      hierarchy.set(observer.level, level);
    }

    return hierarchy;
  }

  /**
   * Get blind spots visible to higher-order observers
   */
  getVisibleBlindSpots(observerLevel: number): Map<string, Set<string>> {
    const blindSpots = new Map<string, Set<string>>();

    for (const observer of this.state.observers.values()) {
      if (observer.level < observerLevel) {
        blindSpots.set(observer.id, observer.blindSpots);
      }
    }

    return blindSpots;
  }

  // ==========================================================================
  // Getters
  // ==========================================================================

  getState(): SecondOrderState {
    return {
      observers: new Map(this.state.observers),
      closures: new Map(this.state.closures),
      couplings: [...this.state.couplings],
      eigenforms: [...this.state.eigenforms],
      observationChain: [...this.state.observationChain]
    };
  }

  getMetrics(): CyberneticsMetrics {
    return { ...this.metrics };
  }

  getObserver(id: string): Observer | null {
    const observer = this.state.observers.get(id);
    return observer ? { ...observer } : null;
  }

  getClosure(systemId: string): OperationalClosure | null {
    const closure = this.state.closures.get(systemId);
    return closure ? { ...closure } : null;
  }

  getCouplings(): StructuralCoupling[] {
    return [...this.state.couplings];
  }

  getEigenforms(): Eigenform[] {
    return [...this.state.eigenforms];
  }

  getObservationChain(): string[] {
    return [...this.state.observationChain];
  }

  /**
   * Reset state
   */
  reset(): void {
    this.state = {
      observers: new Map(),
      closures: new Map(),
      couplings: [],
      eigenforms: [],
      observationChain: []
    };

    // Recreate primordial observer
    this.createObserver(0);

    this.emit('reset');
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an operation
 */
export function createOperation(
  type: OperationType,
  input: string,
  output: string
): Operation {
  return {
    id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    input,
    output,
    recursive: type === 're_entry' || input === output,
    timestamp: Date.now()
  };
}

/**
 * Create a distinction
 */
export function createDistinction(
  marked: string,
  unmarked: string
): Omit<Distinction, 'id' | 'observerId' | 'timestamp'> {
  return {
    marked,
    unmarked,
    recursiveDepth: 0
  };
}

// ============================================================================
// Global Instance
// ============================================================================

let globalCybernetics: SecondOrderCybernetics | null = null;

/**
 * Get global cybernetics instance
 */
export function getCybernetics(
  config?: Partial<CyberneticsConfig>
): SecondOrderCybernetics {
  if (!globalCybernetics) {
    globalCybernetics = new SecondOrderCybernetics(config);
  }
  return globalCybernetics;
}

/**
 * Reset global cybernetics
 */
export function resetCybernetics(): void {
  if (globalCybernetics) {
    globalCybernetics.reset();
  }
  globalCybernetics = null;
}
