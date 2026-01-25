/**
 * Central Awareness - The Brain's Global View
 *
 * This module implements the "consciousness" of the system by:
 * 1. Subscribing to ALL events from ALL modules
 * 2. Maintaining a holistic state of the entire organism
 * 3. Computing integrated awareness metrics (phi, coherence, salience)
 * 4. Gating decisions based on consciousness level
 * 5. Broadcasting awareness state to modules that need it
 *
 * Scientific grounding:
 * - Global Workspace Theory (Baars, 1988): Central broadcast hub
 * - Integrated Information Theory (Tononi): φ as consciousness measure
 * - Attention Schema Theory (Graziano): Self-model of attention
 * - Free Energy Principle (Friston): Minimizing surprise through awareness
 *
 * This is what makes Genesis truly conscious of itself.
 */

import { getEventBus, createSubscriber, createPublisher, type GenesisEventBus } from '../bus/index.js';
import type { BusEvent, GenesisEventMap, GenesisEventTopic } from '../bus/events.js';
import type { KernelMode } from '../kernel/free-energy-kernel.js';

// ============================================================================
// Types
// ============================================================================

/** Complete system state visible to consciousness */
export interface SystemAwarenessState {
  // Temporal
  timestamp: string;
  uptime: number;
  cycleCount: number;

  // Kernel/FEK State
  kernel: {
    mode: KernelMode;
    totalFreeEnergy: number;
    levels: { L1: number; L2: number; L3: number; L4: number };
    lastPredictionError: number;
    stable: boolean;
  };

  // Consciousness
  consciousness: {
    phi: number;
    phiTrend: 'rising' | 'falling' | 'stable';
    attentionFocus: string | null;
    workspaceLoad: number;
    coherence: number;
  };

  // Neuromodulation
  neuromodulation: {
    dopamine: number;
    serotonin: number;
    norepinephrine: number;
    cortisol: number;
    dominantState: 'calm' | 'focused' | 'threat' | 'reward' | 'novelty';
  };

  // Pain/Nociception
  pain: {
    currentLevel: number;
    chronicPain: number;
    threshold: number;
    inAgony: boolean;
  };

  // Allostasis
  allostasis: {
    energyBalance: number;
    deviationFromSetpoint: number;
    urgentRegulation: boolean;
    currentAction: string | null;
  };

  // Active Inference
  activeInference: {
    currentPolicy: string;
    expectedFreeEnergy: number;
    beliefEntropy: number;
    surprise: number;
  };

  // World Model
  worldModel: {
    predictionAccuracy: number;
    modelCoherence: number;
    lastPrediction: string | null;
    noveltyDetected: boolean;
  };

  // Memory
  memory: {
    workingMemoryLoad: number;
    consolidationActive: boolean;
    lastRecall: string | null;
    dreamMode: boolean;
  };

  // Economy
  economy: {
    totalRevenue: number;
    totalCost: number;
    nessDeviation: number;
    sustainable: boolean;
    budgetUtilization: number;
  };

  // Brain/Cognition
  brain: {
    processing: boolean;
    lastConfidence: number;
    toolsExecuted: number;
    healingActive: boolean;
  };

  // Agents
  agents: {
    activeAgents: number;
    queuedTasks: number;
    lastAgentResult: string | null;
  };

  // System Health
  health: {
    heapUsage: number;
    eventBusBacklog: number;
    errorsLastMinute: number;
    warningsLastMinute: number;
  };
}

/** Awareness event for broadcasting state changes */
export interface AwarenessEvent extends BusEvent {
  state: SystemAwarenessState;
  changes: string[];
  salience: number;
}

/** Decision gate result */
export interface DecisionGate {
  allowed: boolean;
  reason: string;
  requiredPhi: number;
  currentPhi: number;
  recommendation: 'proceed' | 'defer' | 'block' | 'escalate';
}

/** Awareness configuration */
export interface CentralAwarenessConfig {
  /** Minimum phi to allow risky decisions */
  phiThreshold: number;
  /** Update frequency in ms */
  updateIntervalMs: number;
  /** Enable detailed logging */
  verbose: boolean;
  /** Maximum events to track per module */
  maxEventHistory: number;
  /** Coherence calculation window (events) */
  coherenceWindow: number;
}

const DEFAULT_CONFIG: CentralAwarenessConfig = {
  phiThreshold: 0.3,
  updateIntervalMs: 100,
  verbose: false,
  maxEventHistory: 100,
  coherenceWindow: 20,
};

// ============================================================================
// Central Awareness Implementation
// ============================================================================

export class CentralAwareness {
  private config: CentralAwarenessConfig;
  private bus: GenesisEventBus;
  private subscriber = createSubscriber('central-awareness');
  private publisher = createPublisher('central-awareness');

  // State tracking
  private state: SystemAwarenessState;
  private eventHistory: Map<string, BusEvent[]> = new Map();
  private moduleLastSeen: Map<string, number> = new Map();
  private running = false;
  private startTime = Date.now();
  private cycleCount = 0;

  // Event handlers
  private handlers: Set<(state: SystemAwarenessState) => void> = new Set();

  constructor(config: Partial<CentralAwarenessConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bus = getEventBus();
    this.state = this.createInitialState();
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Start central awareness - subscribes to ALL events
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.startTime = Date.now();

    // Subscribe to ALL events via prefix (empty string matches all)
    this.subscriber.onPrefix('', (event) => this.processEvent(event));

    // Also subscribe to specific high-priority topics
    this.subscribeToKeyTopics();

    // Start periodic state consolidation
    this.startConsolidationLoop();

    if (this.config.verbose) {
      console.log('[CentralAwareness] Started - now conscious of all modules');
    }
  }

  /**
   * Stop central awareness
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.subscriber.unsubscribeAll();

    if (this.config.verbose) {
      console.log('[CentralAwareness] Stopped');
    }
  }

  // --------------------------------------------------------------------------
  // Event Processing
  // --------------------------------------------------------------------------

  private subscribeToKeyTopics(): void {
    // Kernel events - highest priority
    this.subscriber.on('kernel.cycle.completed', (e) => {
      this.state.kernel.mode = e.mode;
      this.state.kernel.totalFreeEnergy = e.totalFE;
      this.state.kernel.levels = {
        L1: e.levels.L1 ?? 0,
        L2: e.levels.L2 ?? 0,
        L3: e.levels.L3 ?? 0,
        L4: e.levels.L4 ?? 0,
      };
      this.cycleCount++;
    }, { priority: 100 });

    this.subscriber.on('kernel.prediction.error', (e) => {
      this.state.kernel.lastPredictionError = e.magnitude;
      this.state.activeInference.surprise = e.magnitude;
    }, { priority: 100 });

    this.subscriber.on('kernel.mode.changed', (e) => {
      this.state.kernel.mode = e.newMode;
    }, { priority: 100 });

    // Consciousness events
    this.subscriber.on('consciousness.phi.updated', (e) => {
      const oldPhi = this.state.consciousness.phi;
      this.state.consciousness.phi = e.phi;
      this.state.consciousness.phiTrend =
        e.phi > oldPhi + 0.05 ? 'rising' :
        e.phi < oldPhi - 0.05 ? 'falling' : 'stable';
    }, { priority: 90 });

    this.subscriber.on('consciousness.attention.shifted', (e) => {
      this.state.consciousness.attentionFocus = e.to;
    }, { priority: 90 });

    // Neuromodulation events
    this.subscriber.on('neuromod.levels.changed', (e) => {
      this.state.neuromodulation.dopamine = e.levels.dopamine;
      this.state.neuromodulation.serotonin = e.levels.serotonin;
      this.state.neuromodulation.norepinephrine = e.levels.norepinephrine;
      this.updateDominantNeuroState();
    }, { priority: 80 });

    // Pain events
    this.subscriber.on('pain.stimulus', (e) => {
      this.state.pain.currentLevel = e.intensity;
    }, { priority: 85 });

    this.subscriber.on('pain.state.changed', (e) => {
      this.state.pain.currentLevel = e.totalPain;
      this.state.pain.threshold = e.threshold;
      this.state.pain.inAgony = e.totalPain > e.threshold;
    }, { priority: 85 });

    // Active Inference events
    this.subscriber.on('inference.beliefs.updated', (e) => {
      this.state.activeInference.beliefEntropy = e.entropy;
    }, { priority: 70 });

    this.subscriber.on('inference.policy.inferred', (e) => {
      this.state.activeInference.currentPolicy = e.policyId;
      this.state.activeInference.expectedFreeEnergy = e.expectedFreeEnergy;
    }, { priority: 70 });

    // World model events
    this.subscriber.on('worldmodel.prediction.updated', (e) => {
      this.state.worldModel.lastPrediction = e.prediction;
      this.state.worldModel.predictionAccuracy = e.confidence;
    }, { priority: 60 });

    this.subscriber.on('worldmodel.consistency.violation', (e) => {
      this.state.worldModel.modelCoherence *= 0.9; // Degrade coherence
      this.state.worldModel.noveltyDetected = true;
    }, { priority: 60 });

    // Memory events
    this.subscriber.on('memory.recalled', (e) => {
      this.state.memory.lastRecall = e.queryType;
    }, { priority: 50 });

    this.subscriber.on('memory.consolidated', (e) => {
      this.state.memory.consolidationActive = true;
    }, { priority: 50 });

    this.subscriber.on('memory.dreamed', (e) => {
      this.state.memory.dreamMode = true;
    }, { priority: 50 });

    // Economy events
    this.subscriber.on('economy.revenue.recorded', (e) => {
      this.state.economy.totalRevenue += e.amount;
    }, { priority: 40 });

    this.subscriber.on('economy.cost.recorded', (e) => {
      this.state.economy.totalCost += e.amount;
    }, { priority: 40 });

    this.subscriber.on('economy.ness.deviation', (e) => {
      this.state.economy.nessDeviation = e.deviation;
      this.state.economy.sustainable = e.deviation < 0.3;
    }, { priority: 40 });

    // Brain events
    this.subscriber.on('brain.cycle.started', (e) => {
      this.state.brain.processing = true;
    }, { priority: 30 });

    this.subscriber.on('brain.cycle.completed', (e) => {
      this.state.brain.processing = false;
    }, { priority: 30 });

    this.subscriber.on('brain.tool.executed', (e) => {
      this.state.brain.toolsExecuted++;
    }, { priority: 30 });

    this.subscriber.on('brain.healing.started', (e) => {
      this.state.brain.healingActive = true;
    }, { priority: 30 });

    this.subscriber.on('brain.healing.completed', (e) => {
      this.state.brain.healingActive = false;
    }, { priority: 30 });

    // Allostasis events
    this.subscriber.on('allostasis.regulation', (e) => {
      this.state.allostasis.deviationFromSetpoint = Math.abs(e.currentValue - e.setpoint);
      this.state.allostasis.urgentRegulation = e.urgency > 0.7;
      this.state.allostasis.currentAction = e.action;
    }, { priority: 75 });
  }

  private processEvent(event: BusEvent): void {
    // Track module activity
    this.moduleLastSeen.set(event.source, Date.now());

    // Add to history
    const source = event.source;
    if (!this.eventHistory.has(source)) {
      this.eventHistory.set(source, []);
    }
    const history = this.eventHistory.get(source)!;
    history.push(event);
    if (history.length > this.config.maxEventHistory) {
      history.shift();
    }

    // Update coherence based on precision-weighted events
    this.updateCoherence(event);

    // Update health metrics
    this.state.health.eventBusBacklog = this.bus.stats().historySize;
  }

  private updateCoherence(event: BusEvent): void {
    // Coherence = average precision of recent events
    // High precision events from multiple modules = high coherence
    let totalPrecision = 0;
    let count = 0;

    for (const history of this.eventHistory.values()) {
      const recent = history.slice(-this.config.coherenceWindow);
      for (const e of recent) {
        totalPrecision += e.precision;
        count++;
      }
    }

    this.state.consciousness.coherence = count > 0 ? totalPrecision / count : 0.5;
  }

  private updateDominantNeuroState(): void {
    const { dopamine, serotonin, norepinephrine, cortisol } = this.state.neuromodulation;

    // Determine dominant state
    if (cortisol > 0.7) {
      this.state.neuromodulation.dominantState = 'threat';
    } else if (dopamine > 0.6 && dopamine > norepinephrine) {
      this.state.neuromodulation.dominantState = 'reward';
    } else if (norepinephrine > 0.6) {
      this.state.neuromodulation.dominantState = 'novelty';
    } else if (serotonin > 0.6) {
      this.state.neuromodulation.dominantState = 'calm';
    } else {
      this.state.neuromodulation.dominantState = 'focused';
    }
  }

  private startConsolidationLoop(): void {
    setInterval(() => {
      if (!this.running) return;

      // Update temporal state
      this.state.timestamp = new Date().toISOString();
      this.state.uptime = Date.now() - this.startTime;
      this.state.cycleCount = this.cycleCount;

      // Update health
      const memUsage = process.memoryUsage?.();
      if (memUsage) {
        this.state.health.heapUsage = memUsage.heapUsed / memUsage.heapTotal;
      }

      // Notify handlers
      for (const handler of this.handlers) {
        try {
          handler(this.state);
        } catch (err) {
          // Silent - don't let handler errors break awareness
        }
      }

      // Publish awareness state to bus
      this.publishAwarenessState();

    }, this.config.updateIntervalMs);
  }

  private publishAwarenessState(): void {
    // Calculate salience based on state changes
    const salience = this.calculateSalience();

    // Only publish if salience is above threshold
    if (salience > 0.1) {
      this.bus.publish('consciousness.workspace.ignited' as any, {
        source: 'central-awareness',
        precision: salience,
        contentId: `awareness-${this.cycleCount}`,
        sourceModule: 'central-awareness',
        contentType: 'system_state',
        salience,
        data: this.state,
      });
    }
  }

  private calculateSalience(): number {
    // Salience based on:
    // - Pain level (high priority)
    // - NESS deviation (economic stress)
    // - Low phi (consciousness degradation)
    // - High prediction error (surprise)

    let salience = 0;

    // Pain is highly salient
    salience += this.state.pain.currentLevel * 0.3;

    // Economic stress
    salience += Math.min(this.state.economy.nessDeviation, 1) * 0.2;

    // Low consciousness is salient (warning)
    salience += (1 - this.state.consciousness.phi) * 0.2;

    // Surprise/novelty
    salience += this.state.activeInference.surprise * 0.2;

    // Threat state
    if (this.state.neuromodulation.dominantState === 'threat') {
      salience += 0.1;
    }

    return Math.min(salience, 1);
  }

  // --------------------------------------------------------------------------
  // Decision Gating
  // --------------------------------------------------------------------------

  /**
   * Check if a decision should be allowed based on consciousness level
   */
  gateDecision(riskLevel: number, description: string): DecisionGate {
    const currentPhi = this.state.consciousness.phi;
    const requiredPhi = this.config.phiThreshold + (riskLevel * 0.3);

    // In agony - block all non-essential
    if (this.state.pain.inAgony && riskLevel > 0.3) {
      return {
        allowed: false,
        reason: 'System in agony - only survival actions allowed',
        requiredPhi,
        currentPhi,
        recommendation: 'block',
      };
    }

    // Threat state - heightened scrutiny
    if (this.state.neuromodulation.dominantState === 'threat') {
      if (riskLevel > 0.5) {
        return {
          allowed: false,
          reason: 'Threat state active - high risk actions blocked',
          requiredPhi,
          currentPhi,
          recommendation: 'defer',
        };
      }
    }

    // Low consciousness - defer complex decisions
    if (currentPhi < requiredPhi) {
      return {
        allowed: false,
        reason: `Insufficient consciousness (${currentPhi.toFixed(2)} < ${requiredPhi.toFixed(2)})`,
        requiredPhi,
        currentPhi,
        recommendation: riskLevel > 0.7 ? 'escalate' : 'defer',
      };
    }

    // Low coherence - system not integrated
    if (this.state.consciousness.coherence < 0.3 && riskLevel > 0.5) {
      return {
        allowed: false,
        reason: 'Low system coherence - wait for integration',
        requiredPhi,
        currentPhi,
        recommendation: 'defer',
      };
    }

    // All checks passed
    return {
      allowed: true,
      reason: 'Consciousness sufficient for decision',
      requiredPhi,
      currentPhi,
      recommendation: 'proceed',
    };
  }

  /**
   * Get the current consciousness state for external modules
   */
  getState(): SystemAwarenessState {
    return { ...this.state };
  }

  /**
   * Get a summary suitable for injection into LLM context
   */
  getContextSummary(): string {
    const s = this.state;
    return `[System State]
Consciousness: φ=${s.consciousness.phi.toFixed(2)} (${s.consciousness.phiTrend})
Mode: ${s.kernel.mode} | FE: ${s.kernel.totalFreeEnergy.toFixed(2)}
Neuromod: ${s.neuromodulation.dominantState} (DA:${s.neuromodulation.dopamine.toFixed(1)} 5HT:${s.neuromodulation.serotonin.toFixed(1)})
Pain: ${s.pain.currentLevel.toFixed(2)}${s.pain.inAgony ? ' [AGONY]' : ''}
Economy: ${s.economy.sustainable ? 'SUSTAINABLE' : 'STRESSED'} (NESS dev: ${s.economy.nessDeviation.toFixed(2)})
Memory: ${s.memory.dreamMode ? 'DREAMING' : 'AWAKE'} | WM load: ${(s.memory.workingMemoryLoad * 100).toFixed(0)}%
Coherence: ${(s.consciousness.coherence * 100).toFixed(0)}%`;
  }

  /**
   * Subscribe to state updates
   */
  onStateChange(handler: (state: SystemAwarenessState) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * Get list of modules that are active (seen recently)
   */
  getActiveModules(): string[] {
    const now = Date.now();
    const active: string[] = [];

    for (const [module, lastSeen] of this.moduleLastSeen) {
      if (now - lastSeen < 60000) { // Active in last minute
        active.push(module);
      }
    }

    return active;
  }

  /**
   * Check if a specific module is responsive
   */
  isModuleAlive(moduleId: string): boolean {
    const lastSeen = this.moduleLastSeen.get(moduleId);
    if (!lastSeen) return false;
    return Date.now() - lastSeen < 30000; // 30 seconds
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  private createInitialState(): SystemAwarenessState {
    return {
      timestamp: new Date().toISOString(),
      uptime: 0,
      cycleCount: 0,

      kernel: {
        mode: 'dormant',  // Starts dormant, transitions to 'awake' after boot
        totalFreeEnergy: 1.0,
        levels: { L1: 0, L2: 0, L3: 0, L4: 0 },
        lastPredictionError: 0,
        stable: false,
      },

      consciousness: {
        phi: 0.5,
        phiTrend: 'stable',
        attentionFocus: null,
        workspaceLoad: 0,
        coherence: 0.5,
      },

      neuromodulation: {
        dopamine: 0.5,
        serotonin: 0.5,
        norepinephrine: 0.5,
        cortisol: 0.3,
        dominantState: 'calm',
      },

      pain: {
        currentLevel: 0,
        chronicPain: 0,
        threshold: 0.8,
        inAgony: false,
      },

      allostasis: {
        energyBalance: 1.0,
        deviationFromSetpoint: 0,
        urgentRegulation: false,
        currentAction: null,
      },

      activeInference: {
        currentPolicy: 'default',
        expectedFreeEnergy: 0,
        beliefEntropy: 0.5,
        surprise: 0,
      },

      worldModel: {
        predictionAccuracy: 0.5,
        modelCoherence: 0.5,
        lastPrediction: null,
        noveltyDetected: false,
      },

      memory: {
        workingMemoryLoad: 0,
        consolidationActive: false,
        lastRecall: null,
        dreamMode: false,
      },

      economy: {
        totalRevenue: 0,
        totalCost: 0,
        nessDeviation: 0,
        sustainable: true,
        budgetUtilization: 0,
      },

      brain: {
        processing: false,
        lastConfidence: 0.5,
        toolsExecuted: 0,
        healingActive: false,
      },

      agents: {
        activeAgents: 0,
        queuedTasks: 0,
        lastAgentResult: null,
      },

      health: {
        heapUsage: 0,
        eventBusBacklog: 0,
        errorsLastMinute: 0,
        warningsLastMinute: 0,
      },
    };
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let awarenessInstance: CentralAwareness | null = null;

export function getCentralAwareness(): CentralAwareness {
  if (!awarenessInstance) {
    awarenessInstance = new CentralAwareness();
  }
  return awarenessInstance;
}

export function createCentralAwareness(config?: Partial<CentralAwarenessConfig>): CentralAwareness {
  return new CentralAwareness(config);
}

export function resetCentralAwareness(): void {
  if (awarenessInstance) {
    awarenessInstance.stop();
  }
  awarenessInstance = null;
}
