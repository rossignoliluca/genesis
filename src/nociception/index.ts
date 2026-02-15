/**
 * Genesis v13.6 — Nociceptive System
 *
 * Graduated pain/discomfort signals that prevent catastrophic failure
 * by making the system "feel" increasingly worse when things go wrong.
 *
 * Unlike binary error handling (pass/fail), nociception provides GRADED
 * warning signals — the computational analog of the body's pain system.
 *
 * Pain levels (biological analogs):
 *
 *   Discomfort  → Minor deviation from setpoints (0.0-0.3)
 *                  Response: log, minor threshold adjustments
 *
 *   Pain        → Significant deviation, potential damage (0.3-0.7)
 *                  Response: reduce processing, alert, seek repair
 *
 *   Agony       → Critical failure imminent (0.7-1.0)
 *                  Response: emergency shutdown of non-essential, all resources to survival
 *
 * Key mechanisms:
 *   - Gate Control: Attention/consciousness can suppress pain (focused work)
 *   - Sensitization: Repeated pain lowers threshold (learn from damage)
 *   - Analgesia: High dopamine/serotonin reduce pain sensitivity
 *   - Referred Pain: Problems in one module felt in another (causal chains)
 *   - Habituation: Sustained low-level pain loses salience over time
 *
 * References:
 *   - Melzack & Wall (1965) "Gate Control Theory of Pain"
 *   - Fields (2004) "State-dependent opioid control of pain"
 *   - Craig (2003) "Interoception: the sense of the physiological condition"
 */

// ============================================================================
// Types
// ============================================================================

export type PainLevel = 'none' | 'discomfort' | 'pain' | 'agony';

export type PainSource =
  | 'economic'         // Budget depletion, negative ROI
  | 'cognitive'        // Processing failures, low confidence
  | 'memory'           // Memory pressure, forgetting important items
  | 'consciousness'    // φ drops, invariant violations
  | 'embodiment'       // Sensorimotor prediction errors
  | 'social'           // Rejection, negative feedback
  | 'existential';     // Self-model inconsistency, identity threat

export interface PainSignal {
  id: string;
  source: PainSource;
  intensity: number;        // 0-1 (raw pain before modulation)
  modulatedIntensity: number; // 0-1 (after gate control + analgesia)
  level: PainLevel;
  message: string;
  timestamp: number;
  duration: number;         // How long this pain has persisted (ms)
  referred: boolean;        // Is this referred from another source?
  referredFrom?: PainSource;
}

export interface NociceptiveState {
  /** Overall pain level (max of all active signals) */
  overallLevel: PainLevel;
  /** Aggregate pain intensity (weighted sum) */
  aggregatePain: number;
  /** Active pain signals */
  activeSignals: PainSignal[];
  /** Sensitization levels per source (lower = more sensitive) */
  sensitization: Record<PainSource, number>;
  /** Current gate control level (attention-based suppression) */
  gateControl: number;
  /** Current analgesia level (neuromodulatory suppression) */
  analgesia: number;
  /** Chronic pain flag (sustained pain > threshold duration) */
  chronic: boolean;
}

export interface NociceptiveConfig {
  /** Base thresholds for pain levels */
  discomfortThreshold: number;   // Default: 0.2
  painThreshold: number;         // Default: 0.5
  agonyThreshold: number;        // Default: 0.8
  /** Sensitization rate (how fast thresholds lower on repeated pain) */
  sensitizationRate: number;     // Default: 0.02 per signal
  /** Habituation rate (how fast sustained low pain loses salience) */
  habituationRate: number;       // Default: 0.01 per second
  /** Duration (ms) before pain is considered chronic */
  chronicThresholdMs: number;    // Default: 60000 (1 min)
  /** Maximum active signals before pain pooling */
  maxActiveSignals: number;      // Default: 10
  /** Gate control sensitivity to attention/consciousness */
  gateControlSensitivity: number; // Default: 0.5
}

export type NociceptiveHandler = (state: NociceptiveState) => void;

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: NociceptiveConfig = {
  discomfortThreshold: 0.2,
  painThreshold: 0.5,
  agonyThreshold: 0.8,
  sensitizationRate: 0.02,
  habituationRate: 0.01,
  chronicThresholdMs: 60000,
  maxActiveSignals: 10,
  gateControlSensitivity: 0.5,
};

const ALL_SOURCES: PainSource[] = [
  'economic', 'cognitive', 'memory', 'consciousness',
  'embodiment', 'social', 'existential',
];

// ============================================================================
// Nociceptive System
// ============================================================================

export class NociceptiveSystem {
  private config: NociceptiveConfig;
  private signals: Map<string, PainSignal> = new Map();
  private sensitization: Record<PainSource, number>;
  private handlers: Set<NociceptiveHandler> = new Set();
  private gateControl: number = 0;     // 0-1: how much attention suppresses pain
  private analgesia: number = 0;       // 0-1: neuromodulatory pain suppression
  private signalCounter: number = 0;
  private lastUpdate: number = Date.now();

  constructor(config?: Partial<NociceptiveConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize sensitization (1.0 = normal sensitivity, < 1.0 = sensitized)
    this.sensitization = {} as Record<PainSource, number>;
    for (const source of ALL_SOURCES) {
      this.sensitization[source] = 1.0;
    }
  }

  // ==========================================================================
  // Pain Input Interface
  // ==========================================================================

  /**
   * Register a noxious stimulus (something harmful happened).
   * Returns the resulting pain signal after modulation.
   */
  stimulus(source: PainSource, intensity: number, message: string): PainSignal {
    const raw = Math.max(0, Math.min(1, intensity));

    // Apply sensitization (lower threshold = amplified pain)
    const sensitizedIntensity = raw / this.sensitization[source];
    const clampedIntensity = Math.min(1, sensitizedIntensity);

    // Apply gate control and analgesia
    const gateReduction = this.gateControl * this.config.gateControlSensitivity;
    const analgesicReduction = this.analgesia * 0.5;
    const modulatedIntensity = Math.max(0,
      clampedIntensity * (1 - gateReduction) * (1 - analgesicReduction)
    );

    const signal: PainSignal = {
      id: `pain-${++this.signalCounter}`,
      source,
      intensity: clampedIntensity,
      modulatedIntensity,
      level: this.classifyLevel(modulatedIntensity),
      message,
      timestamp: Date.now(),
      duration: 0,
      referred: false,
    };

    // Store signal
    this.signals.set(signal.id, signal);

    // Enforce max signals (evict oldest low-intensity)
    if (this.signals.size > this.config.maxActiveSignals) {
      this.evictWeakest();
    }

    // Sensitize this source (repeated pain lowers threshold)
    this.sensitization[source] = Math.max(0.3,
      this.sensitization[source] - this.config.sensitizationRate
    );

    // Broadcast updated state
    this.broadcast();

    return signal;
  }

  /**
   * Register referred pain (problem in source A felt in source B).
   * Used when causal chains connect modules.
   */
  referredPain(originalSource: PainSource, feltIn: PainSource, intensity: number, message: string): PainSignal {
    const signal = this.stimulus(feltIn, intensity * 0.6, message);
    signal.referred = true;
    signal.referredFrom = originalSource;
    return signal;
  }

  /**
   * Resolve a pain signal (the cause has been addressed).
   */
  resolve(signalId: string): boolean {
    const removed = this.signals.delete(signalId);
    if (removed) {
      this.broadcast();
    }
    return removed;
  }

  /**
   * Resolve all pain from a specific source.
   */
  resolveSource(source: PainSource): number {
    let count = 0;
    for (const [id, signal] of this.signals) {
      if (signal.source === source) {
        this.signals.delete(id);
        count++;
      }
    }
    if (count > 0) this.broadcast();
    return count;
  }

  // ==========================================================================
  // Modulation Interface (Gate Control + Analgesia)
  // ==========================================================================

  /**
   * Update gate control level (attention-based pain suppression).
   * High attention/focus → pain is suppressed (you don't feel it while focused).
   * Called from consciousness/attention system.
   */
  updateGateControl(level: number): void {
    this.gateControl = Math.max(0, Math.min(1, level));
    this.remodulate();
  }

  /**
   * Update analgesia level (neuromodulatory pain suppression).
   * High dopamine/serotonin → pain is dulled.
   * Called from neuromodulation system.
   */
  updateAnalgesia(level: number): void {
    this.analgesia = Math.max(0, Math.min(1, level));
    this.remodulate();
  }

  // ==========================================================================
  // Query Interface
  // ==========================================================================

  /** Get current nociceptive state */
  getState(): NociceptiveState {
    this.updateDurations();

    const activeSignals = [...this.signals.values()];
    const maxIntensity = activeSignals.length > 0
      ? Math.max(...activeSignals.map(s => s.modulatedIntensity))
      : 0;
    const aggregate = activeSignals.length > 0
      ? activeSignals.reduce((sum, s) => sum + s.modulatedIntensity, 0) / activeSignals.length
      : 0;

    return {
      overallLevel: this.classifyLevel(maxIntensity),
      aggregatePain: aggregate,
      activeSignals,
      sensitization: { ...this.sensitization },
      gateControl: this.gateControl,
      analgesia: this.analgesia,
      chronic: activeSignals.some(s => s.duration > this.config.chronicThresholdMs),
    };
  }

  /** Get overall pain level */
  getPainLevel(): PainLevel {
    return this.getState().overallLevel;
  }

  /** Get aggregate pain intensity (0-1) */
  getAggregatePain(): number {
    return this.getState().aggregatePain;
  }

  /** Is the system in chronic pain? */
  isChronic(): boolean {
    return this.getState().chronic;
  }

  /** Subscribe to state changes */
  onPain(handler: NociceptiveHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * Decay/habituate active signals (called periodically).
   * Sustained low-level pain loses salience over time.
   */
  tick(): void {
    const now = Date.now();
    const dt = (now - this.lastUpdate) / 1000;
    this.lastUpdate = now;

    let changed = false;
    for (const [id, signal] of this.signals) {
      signal.duration = now - signal.timestamp;

      // Habituation: sustained discomfort loses salience
      if (signal.level === 'discomfort') {
        signal.modulatedIntensity = Math.max(0,
          signal.modulatedIntensity - this.config.habituationRate * dt
        );
        signal.level = this.classifyLevel(signal.modulatedIntensity);

        // Remove fully habituated signals
        if (signal.modulatedIntensity < 0.01) {
          this.signals.delete(id);
        }
        changed = true;
      }
    }

    // Slowly recover sensitization toward baseline
    for (const source of ALL_SOURCES) {
      if (this.sensitization[source] < 1.0) {
        this.sensitization[source] = Math.min(1.0,
          this.sensitization[source] + 0.001 * dt
        );
      }
    }

    if (changed) this.broadcast();
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private classifyLevel(intensity: number): PainLevel {
    if (intensity >= this.config.agonyThreshold) return 'agony';
    if (intensity >= this.config.painThreshold) return 'pain';
    if (intensity >= this.config.discomfortThreshold) return 'discomfort';
    return 'none';
  }

  private remodulate(): void {
    for (const signal of this.signals.values()) {
      const gateReduction = this.gateControl * this.config.gateControlSensitivity;
      const analgesicReduction = this.analgesia * 0.5;
      signal.modulatedIntensity = Math.max(0,
        signal.intensity * (1 - gateReduction) * (1 - analgesicReduction)
      );
      signal.level = this.classifyLevel(signal.modulatedIntensity);
    }
    this.broadcast();
  }

  private updateDurations(): void {
    const now = Date.now();
    for (const signal of this.signals.values()) {
      signal.duration = now - signal.timestamp;
    }
  }

  private evictWeakest(): void {
    let weakestId: string | null = null;
    let weakestIntensity = Infinity;
    for (const [id, signal] of this.signals) {
      if (signal.modulatedIntensity < weakestIntensity) {
        weakestIntensity = signal.modulatedIntensity;
        weakestId = id;
      }
    }
    if (weakestId) this.signals.delete(weakestId);
  }

  private broadcast(): void {
    const state = this.getState();
    for (const handler of this.handlers) {
      try {
        handler(state);
      } catch (err) {
        console.error('[nociception] Handler execution failed:', err);
      }
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: NociceptiveSystem | null = null;

export function getNociceptiveSystem(config?: Partial<NociceptiveConfig>): NociceptiveSystem {
  if (!instance) {
    instance = new NociceptiveSystem(config);
  }
  return instance;
}

export function resetNociceptiveSystem(): void {
  instance = null;
}
