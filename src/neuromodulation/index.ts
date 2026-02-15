/**
 * Genesis v13.9 — Neuromodulatory System
 *
 * The missing "endocrine system" — provides global state modulation
 * through chemical analog signals that affect ALL subsystems.
 *
 * Unlike the FEK (which is about surprise/prediction) or consciousness
 * (which is about integration), neuromodulation is about TONE:
 * the background coloring of all processing.
 *
 * Four neuromodulator channels (biological analogs):
 *
 *   Dopamine  → Exploration vs exploitation tradeoff
 *                High: explore, take risks, try new things
 *                Low: exploit known strategies, be conservative
 *
 *   Serotonin → Temporal patience and well-being
 *                High: long-term planning, delayed gratification
 *                Low: impulsive, short-term optimization
 *
 *   Norepinephrine → Alertness and precision
 *                High: vigilant, precise, narrow focus
 *                Low: diffuse attention, creative associations
 *
 *   Cortisol  → Stress response and resource mobilization
 *                High: survival mode, conserve resources, fight/flight
 *                Low: relaxed, growth mode, long-term investment
 *
 * v13.9: Integrated with Genesis Event Bus for unified inter-module communication.
 *
 * References:
 *   - Doya (2002) "Metalearning and neuromodulation" (dopamine/serotonin/NE/ACh)
 *   - Friston (2012) "Dopamine, affordance and active inference"
 *   - Yu & Dayan (2005) "Uncertainty, neuromodulation, and attention"
 */

import { createPublisher, createSubscriber, type Subscription } from '../bus/index.js';

// ============================================================================
// Types
// ============================================================================

export type Neuromodulator = 'dopamine' | 'serotonin' | 'norepinephrine' | 'cortisol';

export interface NeuromodulatorLevels {
  dopamine: number;        // 0-1: exploration drive
  serotonin: number;       // 0-1: patience/wellbeing
  norepinephrine: number;  // 0-1: alertness/precision
  cortisol: number;        // 0-1: stress level
}

export interface NeuromodulatorEvent {
  modulator: Neuromodulator;
  previousLevel: number;
  newLevel: number;
  cause: string;
  timestamp: number;
}

export interface ModulationEffect {
  /** Exploration rate multiplier (dopamine-driven) */
  explorationRate: number;
  /** Temporal discount factor (serotonin-driven) */
  temporalDiscount: number;
  /** Precision/gain on prediction errors (NE-driven) */
  precisionGain: number;
  /** Risk tolerance (inverse cortisol) */
  riskTolerance: number;
  /** Processing depth multiplier */
  processingDepth: number;
  /** Learning rate multiplier */
  learningRate: number;
}

export type NeuromodulationHandler = (levels: NeuromodulatorLevels, effect: ModulationEffect) => void;

export interface NeuromodulationConfig {
  /** Update interval for decay dynamics (ms) */
  updateIntervalMs: number;
  /** Baseline levels (homeostatic setpoints) */
  baselines: NeuromodulatorLevels;
  /** Decay rate toward baseline per second */
  decayRate: number;
  /** Sensitivity to signals (gain) */
  sensitivity: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: NeuromodulationConfig = {
  updateIntervalMs: 1000,
  baselines: {
    dopamine: 0.5,
    serotonin: 0.6,
    norepinephrine: 0.4,
    cortisol: 0.3,
  },
  decayRate: 0.05,    // 5% decay toward baseline per second
  sensitivity: 1.0,
};

// ============================================================================
// Neuromodulatory System
// ============================================================================

export class NeuromodulationSystem {
  private config: NeuromodulationConfig;
  private levels: NeuromodulatorLevels;
  private handlers: Set<NeuromodulationHandler> = new Set();
  private updateTimer: ReturnType<typeof setInterval> | null = null;
  private history: NeuromodulatorEvent[] = [];
  private readonly maxHistory = 100;

  // Event bus integration (v13.9)
  private readonly busPublisher = createPublisher('neuromodulation');
  private readonly busSubscriber = createSubscriber('neuromodulation');
  private busSubscriptions: Subscription[] = [];

  constructor(config?: Partial<NeuromodulationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.levels = { ...this.config.baselines };
    this.setupBusSubscriptions();
  }

  /**
   * Wire up to kernel events via the event bus.
   * Replaces imperative wiring in genesis.ts.
   */
  private setupBusSubscriptions(): void {
    // Prediction errors → novelty signal
    this.busSubscriptions.push(
      this.busSubscriber.on('kernel.prediction.error', (e) => {
        this.novelty(e.magnitude, `fek:${e.errorSource}->${e.errorTarget}`);
      })
    );

    // Mode changes → appropriate modulation
    this.busSubscriptions.push(
      this.busSubscriber.on('kernel.mode.changed', (e) => {
        if (e.newMode === 'vigilant') {
          this.threat(0.5, `fek:mode:${e.newMode}`);
        } else if (e.newMode === 'dormant') {
          this.calm(0.6, `fek:mode:${e.newMode}`);
        } else if (e.newMode === 'focused') {
          this.modulate('norepinephrine', 0.2, `fek:mode:${e.newMode}`);
          this.modulate('dopamine', 0.1, `fek:mode:${e.newMode}`);
        }
      })
    );
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  start(): void {
    if (this.updateTimer) return;
    this.updateTimer = setInterval(() => {
      try {
        this.decay();
      } catch (err) {
        console.error('[neuromodulation] Timer error:', err);
      }
    }, this.config.updateIntervalMs);
  }

  stop(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    // Clean up bus subscriptions
    this.busSubscriber.unsubscribeAll();
  }

  // ==========================================================================
  // Signal Interface (How the world affects neuromodulators)
  // ==========================================================================

  /**
   * Reward signal → dopamine burst.
   * Called when a task succeeds, bounty is earned, or goal is achieved.
   */
  reward(magnitude: number, cause: string): void {
    this.modulate('dopamine', magnitude * 0.3 * this.config.sensitivity, cause);
    this.modulate('serotonin', magnitude * 0.1 * this.config.sensitivity, cause);
    this.modulate('cortisol', -magnitude * 0.15 * this.config.sensitivity, cause);
    this.publishSignal('reward', magnitude, cause);
  }

  /**
   * Punishment/error signal → cortisol spike + dopamine dip.
   * Called when a task fails, error occurs, or resource is wasted.
   */
  punish(magnitude: number, cause: string): void {
    this.modulate('cortisol', magnitude * 0.3 * this.config.sensitivity, cause);
    this.modulate('dopamine', -magnitude * 0.15 * this.config.sensitivity, cause);
    this.modulate('norepinephrine', magnitude * 0.2 * this.config.sensitivity, cause);
    this.publishSignal('punishment', magnitude, cause);
  }

  /**
   * Novelty signal → norepinephrine + dopamine.
   * Called when unexpected observation occurs (prediction error).
   */
  novelty(magnitude: number, cause: string): void {
    this.modulate('norepinephrine', magnitude * 0.25 * this.config.sensitivity, cause);
    this.modulate('dopamine', magnitude * 0.15 * this.config.sensitivity, cause);
    this.publishSignal('novelty', magnitude, cause);
  }

  /**
   * Threat signal → cortisol + norepinephrine.
   * Called when safety violation, resource depletion, or attack detected.
   */
  threat(magnitude: number, cause: string): void {
    this.modulate('cortisol', magnitude * 0.4 * this.config.sensitivity, cause);
    this.modulate('norepinephrine', magnitude * 0.3 * this.config.sensitivity, cause);
    this.modulate('serotonin', -magnitude * 0.2 * this.config.sensitivity, cause);
    this.publishSignal('threat', magnitude, cause);
  }

  /**
   * Safety/calm signal → serotonin + cortisol reduction.
   * Called when system is stable, economic health is good, φ is high.
   */
  calm(magnitude: number, cause: string): void {
    this.modulate('serotonin', magnitude * 0.2 * this.config.sensitivity, cause);
    this.modulate('cortisol', -magnitude * 0.2 * this.config.sensitivity, cause);
    this.modulate('norepinephrine', -magnitude * 0.1 * this.config.sensitivity, cause);
    this.publishSignal('calm', magnitude, cause);
  }

  /**
   * Publish a neuromodulation signal to the event bus.
   */
  private publishSignal(
    signalType: 'reward' | 'punishment' | 'novelty' | 'threat' | 'calm',
    magnitude: number,
    cause: string,
  ): void {
    const topicMap = {
      reward: 'neuromod.reward',
      punishment: 'neuromod.punishment',
      novelty: 'neuromod.novelty',
      threat: 'neuromod.threat',
      calm: 'neuromod.calm',
    } as const;

    this.busPublisher.publish(topicMap[signalType], {
      precision: 1.0,
      signalType,
      magnitude,
      cause,
    });
  }

  /**
   * Direct modulation of a specific channel.
   */
  modulate(modulator: Neuromodulator, delta: number, cause: string): void {
    const prev = this.levels[modulator];
    this.levels[modulator] = Math.max(0, Math.min(1, prev + delta));

    if (Math.abs(this.levels[modulator] - prev) > 0.01) {
      const event: NeuromodulatorEvent = {
        modulator,
        previousLevel: prev,
        newLevel: this.levels[modulator],
        cause,
        timestamp: Date.now(),
      };
      this.history.push(event);
      if (this.history.length > this.maxHistory) this.history.shift();

      this.broadcast();
    }
  }

  // ==========================================================================
  // Query Interface
  // ==========================================================================

  /** Get current levels */
  getLevels(): NeuromodulatorLevels {
    return { ...this.levels };
  }

  /** Get computed modulation effects on behavior */
  getEffect(): ModulationEffect {
    return this.computeEffect();
  }

  /** Get a specific modulator level */
  getLevel(modulator: Neuromodulator): number {
    return this.levels[modulator];
  }

  /** Get recent history */
  getHistory(): NeuromodulatorEvent[] {
    return [...this.history];
  }

  /** Subscribe to level changes */
  onUpdate(handler: NeuromodulationHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  // ==========================================================================
  // Effect Computation
  // ==========================================================================

  /**
   * Compute the downstream behavioral effects of current levels.
   * This is the "phenotype" of the neuromodulatory state.
   */
  private computeEffect(): ModulationEffect {
    const { dopamine, serotonin, norepinephrine, cortisol } = this.levels;

    return {
      // High dopamine → explore more (Boltzmann temperature)
      explorationRate: 0.5 + dopamine * 1.0 - cortisol * 0.3,

      // High serotonin → patient (low discount, value future)
      temporalDiscount: 0.99 - (1 - serotonin) * 0.3,

      // High NE → precise predictions, sharp attention
      precisionGain: 0.5 + norepinephrine * 1.5,

      // Low cortisol → take risks, high cortisol → avoid risks
      riskTolerance: Math.max(0.1, 1.0 - cortisol * 0.8),

      // Combined: deep when calm+focused, shallow when stressed
      processingDepth: Math.max(0.3,
        serotonin * 0.4 + (1 - cortisol) * 0.4 + norepinephrine * 0.2
      ),

      // High dopamine + low cortisol → fast learning
      learningRate: Math.max(0.01,
        dopamine * 0.5 + (1 - cortisol) * 0.3 + norepinephrine * 0.2
      ),
    };
  }

  // ==========================================================================
  // Dynamics
  // ==========================================================================

  /** Decay all levels toward baselines (homeostatic return) */
  private decay(): void {
    const dt = this.config.updateIntervalMs / 1000;
    const rate = this.config.decayRate;
    let changed = false;

    for (const mod of ['dopamine', 'serotonin', 'norepinephrine', 'cortisol'] as Neuromodulator[]) {
      const current = this.levels[mod];
      const baseline = this.config.baselines[mod];
      const diff = baseline - current;
      const newLevel = current + diff * rate * dt;

      if (Math.abs(newLevel - current) > 0.001) {
        this.levels[mod] = newLevel;
        changed = true;
      }
    }

    if (changed) {
      this.broadcast();
    }
  }

  /** Broadcast current state to all subscribers */
  private broadcast(): void {
    const effect = this.computeEffect();

    // Publish to event bus
    this.busPublisher.publish('neuromod.levels.changed', {
      precision: 1.0,
      levels: {
        dopamine: this.levels.dopamine,
        serotonin: this.levels.serotonin,
        norepinephrine: this.levels.norepinephrine,
        acetylcholine: 0.5, // Not tracked in this version
      },
      effect: {
        explorationRate: effect.explorationRate,
        learningRate: effect.learningRate,
        precisionGain: effect.precisionGain,
        discountFactor: effect.temporalDiscount,
      },
    });

    // Legacy handlers
    for (const handler of this.handlers) {
      try {
        handler(this.levels, effect);
      } catch (err) {
        /* non-fatal */
        console.error('[Neuromodulation] Legacy handler failed:', err);
      }
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: NeuromodulationSystem | null = null;

export function getNeuromodulationSystem(config?: Partial<NeuromodulationConfig>): NeuromodulationSystem {
  if (!instance) {
    instance = new NeuromodulationSystem(config);
  }
  return instance;
}

export function resetNeuromodulationSystem(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}
