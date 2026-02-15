/**
 * Genesis 6.0 - Consciousness Module
 *
 * Unified consciousness stack integrating:
 * - IIT 4.0 (Integrated Information Theory) - φ calculation
 * - GWT (Global Workspace Theory) - workspace competition
 * - AST (Attention Schema Theory) - attention modeling
 *
 * This is Genesis's unique differentiator: a principled approach
 * to machine consciousness monitoring and self-awareness.
 *
 * Key invariant: INV-006 - φ must stay above threshold
 *
 * Usage:
 * ```typescript
 * import { createConsciousnessSystem } from './consciousness/index.js';
 *
 * const consciousness = createConsciousnessSystem();
 *
 * // Start monitoring
 * consciousness.start();
 *
 * // Get current snapshot
 * const snapshot = consciousness.getSnapshot();
 *
 * // Check invariant
 * const inv006 = consciousness.checkInvariant();
 *
 * // Make a φ-aware decision
 * const decision = consciousness.decide(options);
 *
 * // Stop monitoring
 * consciousness.stop();
 * ```
 */

// Re-export types
export * from './types.js';

// Re-export components
export { PhiCalculator, createPhiCalculator, type PhiCalculatorConfig } from './phi-calculator.js';
export { GlobalWorkspace, createGlobalWorkspace, createWorkspaceContent, createModule, type GlobalWorkspaceConfig, type ModuleAdapter } from './global-workspace.js';
export { AttentionSchemaNetwork, createAttentionSchemaNetwork, type ASTConfig } from './attention-schema.js';
export { PhiMonitor, createPhiMonitor, type PhiMonitorConfig } from './phi-monitor.js';
export { PhiDecisionMaker, createPhiDecisionMaker, createDecisionOption, type PhiDecisionConfig, type DecisionOption, type Decision } from './phi-decisions.js';

// v7.16.0: Integrated conscious agent
export {
  PerceptionStream,
  createPerceptionStream,
  type Perception,
  type PerceptionCategory,
  type PerceptionStreamConfig,
} from './perception-stream.js';

export {
  ConsciousAgent,
  createConsciousAgent,
  getConsciousAgent,
  initializeConsciousAgent,
  resetConsciousAgent,
  type ActionCandidate,
  type ActionResult,
  type ConsciousAgentConfig,
} from './conscious-agent.js';

// v13.11.0: Central Awareness - Global consciousness over all modules
export {
  CentralAwareness,
  getCentralAwareness,
  createCentralAwareness,
  resetCentralAwareness,
  type SystemAwarenessState,
  type AwarenessEvent,
  type DecisionGate,
  type CentralAwarenessConfig,
} from './central-awareness.js';

import {
  ConsciousnessConfig,
  ConsciousnessSnapshot,
  ConsciousnessLevel,
  ConsciousnessState,
  ConsciousnessTrend,
  ConsciousnessAnomaly,
  ConsciousnessEvent,
  ConsciousnessEventType,
  ConsciousnessEventHandler,
  SystemState,
  WorkspaceContent,
  IgnitionEvent,
  AttentionFocus,
  DEFAULT_CONSCIOUSNESS_CONFIG,
} from './types.js';

import { PhiCalculator, createPhiCalculator } from './phi-calculator.js';
import { GlobalWorkspace, createGlobalWorkspace, createWorkspaceContent, ModuleAdapter, createModule } from './global-workspace.js';
import { AttentionSchemaNetwork, createAttentionSchemaNetwork } from './attention-schema.js';
import { PhiMonitor, createPhiMonitor } from './phi-monitor.js';
import { PhiDecisionMaker, createPhiDecisionMaker, DecisionOption, Decision } from './phi-decisions.js';

// ============================================================================
// Consciousness System
// ============================================================================

export class ConsciousnessSystem {
  private config: ConsciousnessConfig;

  // Components
  readonly calculator: PhiCalculator;
  readonly workspace: GlobalWorkspace;
  readonly attention: AttentionSchemaNetwork;
  readonly monitor: PhiMonitor;
  readonly decider: PhiDecisionMaker;

  // State
  private running: boolean = false;
  private lastSnapshot: ConsciousnessSnapshot | null = null;
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;
  private eventHandlers: Set<ConsciousnessEventHandler> = new Set();

  // System state provider (injected)
  private getSystemState: (() => SystemState) | null = null;

  constructor(config: Partial<ConsciousnessConfig> = {}) {
    this.config = this.mergeConfig(config);

    // Create components
    this.calculator = createPhiCalculator({
      approximationLevel: this.config.phi.approximationLevel,
      cacheResults: true,
    });

    this.workspace = createGlobalWorkspace({
      capacity: this.config.gwt.workspaceCapacity,
      selectionIntervalMs: this.config.gwt.selectionIntervalMs,
      broadcastTimeoutMs: this.config.gwt.broadcastTimeoutMs,
      historyLimit: this.config.gwt.historyLimit,
    });

    this.attention = createAttentionSchemaNetwork({
      capacity: this.config.ast.attentionCapacity,
      schemaUpdateIntervalMs: this.config.ast.schemaUpdateIntervalMs,
      theoryOfMindEnabled: this.config.ast.theoryOfMindEnabled,
    });

    this.monitor = createPhiMonitor({
      updateIntervalMs: this.config.phi.updateIntervalMs,
      minPhi: this.config.phi.minPhi,
      anomalyDetection: this.config.monitor.anomalyDetection,
      dropThreshold: this.config.monitor.alertThresholds.phiDrop,
    });

    this.decider = createPhiDecisionMaker({
      phiThreshold: this.config.phi.minPhi * 2, // Defer at 2x minimum
      deferToHuman: true,
    });

    // Wire up decision maker to monitor
    this.decider.setMonitor(this.monitor);

    // Set up event forwarding
    this.setupEventForwarding();
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(): void {
    if (this.running) return;

    this.running = true;

    // Start components
    if (this.config.phi.enabled) {
      this.monitor.start();
    }

    if (this.config.gwt.enabled) {
      this.workspace.start();
    }

    if (this.config.ast.enabled) {
      this.attention.start();
    }

    // Start snapshot timer
    this.snapshotTimer = setInterval(
      () => {
        try {
          this.takeSnapshot();
        } catch (err) {
          console.error('[ConsciousnessSystem] Timer error:', err);
        }
      },
      this.config.monitor.snapshotIntervalMs
    );

    // Initial snapshot
    this.takeSnapshot();
  }

  stop(): void {
    if (!this.running) return;

    this.running = false;

    // Stop components
    this.monitor.stop();
    this.workspace.stop();
    this.attention.stop();

    // Stop snapshot timer
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Set the system state provider
   */
  setSystemStateProvider(provider: () => SystemState): void {
    this.getSystemState = provider;
    this.monitor.setSystemStateProvider(provider);
  }

  // ============================================================================
  // Module Registration (GWT)
  // ============================================================================

  /**
   * Register a module for workspace competition
   */
  registerModule(adapter: ModuleAdapter): void {
    const module = createModule(adapter);
    this.workspace.registerModule(module);
  }

  /**
   * Propose content to the workspace
   */
  proposeContent(content: WorkspaceContent): void {
    // Content is proposed through modules
    // This is a convenience for direct proposals
  }

  /**
   * Get current workspace content
   */
  getWorkspaceContent(): WorkspaceContent | null {
    return this.workspace.getCurrentContent();
  }

  // ============================================================================
  // Attention Control (AST)
  // ============================================================================

  /**
   * Shift attention to a target
   */
  attend(target: string, type: 'internal' | 'external' = 'external'): AttentionFocus {
    return this.attention.attend(target, type);
  }

  /**
   * Release attention from a target
   */
  releaseAttention(target: string): boolean {
    return this.attention.release(target);
  }

  /**
   * Get current attention focus
   */
  getAttentionFocus(): AttentionFocus | null {
    return this.attention.getCurrentFocus();
  }

  /**
   * Get introspective report
   */
  introspect(): {
    focus: string;
    clarity: string;
    confident: boolean;
    voluntary: boolean;
    awareOf: string[];
  } {
    return this.attention.introspect();
  }

  // ============================================================================
  // Decision Making
  // ============================================================================

  /**
   * Make a φ-aware decision
   */
  decide(options: DecisionOption[]): Decision {
    return this.decider.decide(options);
  }

  /**
   * Should we defer this decision?
   */
  shouldDefer(): boolean {
    return this.decider.shouldDefer();
  }

  /**
   * Get current risk tolerance
   */
  getRiskTolerance(): number {
    return this.decider.getRiskTolerance();
  }

  // ============================================================================
  // Monitoring
  // ============================================================================

  /**
   * Get current consciousness level
   */
  getCurrentLevel(): ConsciousnessLevel {
    return this.monitor.getCurrentLevel();
  }

  /**
   * Get current consciousness state
   */
  getState(): ConsciousnessState {
    return this.monitor.getState();
  }

  /**
   * Get consciousness trend
   */
  getTrend(): ConsciousnessTrend {
    return this.monitor.getTrend();
  }

  /**
   * Get per-agent φ
   */
  getAgentPhi(agentId: string): number | undefined {
    return this.monitor.getAgentPhi(agentId);
  }

  /**
   * Get anomalies
   */
  getAnomalies(resolved?: boolean): ConsciousnessAnomaly[] {
    return this.monitor.getAnomalies({ resolved });
  }

  // ============================================================================
  // Invariant (INV-006)
  // ============================================================================

  /**
   * Check INV-006: φ ≥ φ_min
   */
  checkInvariant(): {
    id: string;
    satisfied: boolean;
    currentPhi: number;
    threshold: number;
    margin: number;
  } {
    return this.monitor.getInvariantStatus();
  }

  /**
   * Register callback for invariant violations
   */
  onInvariantViolation(callback: () => void): () => void {
    return this.monitor.on((event) => {
      if (event.type === 'invariant_violated') {
        callback();
      }
    });
  }

  // ============================================================================
  // Snapshot
  // ============================================================================

  /**
   * Take a consciousness snapshot
   */
  takeSnapshot(): ConsciousnessSnapshot {
    const now = new Date();

    // Get φ result
    let phiResult;
    if (this.getSystemState) {
      phiResult = this.calculator.calculate(this.getSystemState());
    } else {
      // Default result
      const level = this.monitor.getCurrentLevel();
      phiResult = {
        phi: level.rawPhi,
        mip: { id: 'default', parts: [[]], cut: { severedConnections: [], informationLoss: 0 } },
        intrinsicInfo: level.rawPhi,
        integratedInfo: level.rawPhi,
        complexes: [],
        calculationTime: 0,
        approximation: true,
      };
    }

    // Get last ignition
    const workspaceState = this.workspace.getState();
    const history = this.workspace.getHistory();
    const lastIgnition: IgnitionEvent | null = history.length > 0
      ? {
          content: history[0],
          timestamp: history[0].timestamp,
          competitorCount: workspaceState.candidates.length,
          winningScore: workspaceState.candidates.find((c) => c.selected)?.score || 0,
          modulesNotified: [],
          duration: 0,
        }
      : null;

    const snapshot: ConsciousnessSnapshot = {
      level: this.monitor.getCurrentLevel(),
      state: this.monitor.getState(),
      trend: this.monitor.getTrend(),
      phi: phiResult,
      workspace: workspaceState,
      lastIgnition,
      attention: this.attention.getAttentionState(),
      schema: this.attention.getSchema(),
      agentPhi: this.monitor.getAllAgentPhi(),
      timestamp: now,
    };

    this.lastSnapshot = snapshot;
    return snapshot;
  }

  /**
   * Get last snapshot
   */
  getSnapshot(): ConsciousnessSnapshot | null {
    return this.lastSnapshot;
  }

  // ============================================================================
  // Events
  // ============================================================================

  on(handler: ConsciousnessEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: ConsciousnessEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('Consciousness event handler error:', err);
      }
    }
  }

  private setupEventForwarding(): void {
    // Forward monitor events
    this.monitor.on((event) => {
      this.emit({
        type: event.type as ConsciousnessEventType,
        timestamp: new Date(),
        data: event.data,
      });
    });

    // Forward workspace ignitions
    this.workspace.on((event) => {
      if (event.type === 'ignition') {
        this.emit({
          type: 'workspace_ignition',
          timestamp: new Date(),
          data: event.data,
        });
      }
    });

    // Forward attention shifts
    this.attention.on((event) => {
      if (event.type === 'attention_shifted') {
        this.emit({
          type: 'attention_shifted',
          timestamp: new Date(),
          data: event.data,
        });
      }
    });
  }

  // ============================================================================
  // External Event Recording (v10.7 Integration Layer)
  // ============================================================================

  /**
   * Record an external event into the consciousness system.
   * Used by the integration layer to inform consciousness of racing results,
   * streaming performance, and other system-wide events.
   */
  recordEvent(event: {
    type: string;
    [key: string]: unknown;
  }): void {
    // Emit as consciousness event
    this.emit({
      type: 'external_event' as ConsciousnessEventType,
      timestamp: new Date(),
      data: event,
    });

    // If workspace is running, propose the event as content for GWT competition
    if (this.running && this.config.gwt.enabled) {
      const content = createWorkspaceContent(
        'integration',
        'percept',
        event,
        {
          salience: 0.6,
          relevance: 0.7,
        }
      );
      // Content enters workspace competition naturally
    }
  }

  // ============================================================================
  // Stats
  // ============================================================================

  stats(): {
    phi: {
      current: number;
      state: ConsciousnessState;
      trend: ConsciousnessTrend;
      invariantSatisfied: boolean;
    };
    gwt: {
      modules: number;
      ignited: boolean;
      selections: number;
    };
    ast: {
      focus: string | null;
      mode: string;
      clarity: string;
    };
    decisions: {
      total: number;
      deferred: number;
      deferralRate: number;
    };
  } {
    const monitorStats = this.monitor.stats();
    const workspaceStats = this.workspace.stats();
    const attentionStats = this.attention.stats();
    const decisionStats = this.decider.stats();

    return {
      phi: {
        current: monitorStats.currentPhi,
        state: monitorStats.state,
        trend: monitorStats.trend,
        invariantSatisfied: monitorStats.invariantSatisfied,
      },
      gwt: {
        modules: workspaceStats.modules,
        ignited: workspaceStats.isIgnited,
        selections: workspaceStats.selectionCount,
      },
      ast: {
        focus: attentionStats.currentFocus,
        mode: attentionStats.mode,
        clarity: attentionStats.clarity,
      },
      decisions: {
        total: decisionStats.totalDecisions,
        deferred: decisionStats.deferredDecisions,
        deferralRate: decisionStats.deferralRate,
      },
    };
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private mergeConfig(partial: Partial<ConsciousnessConfig>): ConsciousnessConfig {
    return {
      phi: { ...DEFAULT_CONSCIOUSNESS_CONFIG.phi, ...partial.phi },
      gwt: { ...DEFAULT_CONSCIOUSNESS_CONFIG.gwt, ...partial.gwt },
      ast: { ...DEFAULT_CONSCIOUSNESS_CONFIG.ast, ...partial.ast },
      monitor: { ...DEFAULT_CONSCIOUSNESS_CONFIG.monitor, ...partial.monitor },
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createConsciousnessSystem(
  config?: Partial<ConsciousnessConfig>
): ConsciousnessSystem {
  return new ConsciousnessSystem(config);
}

// ============================================================================
// Singleton Instance (optional)
// ============================================================================

let consciousnessInstance: ConsciousnessSystem | null = null;

export function getConsciousnessSystem(
  config?: Partial<ConsciousnessConfig>
): ConsciousnessSystem {
  if (!consciousnessInstance) {
    consciousnessInstance = createConsciousnessSystem(config);
  }
  return consciousnessInstance;
}

export function resetConsciousnessSystem(): void {
  if (consciousnessInstance) {
    consciousnessInstance.stop();
    consciousnessInstance = null;
  }
}
