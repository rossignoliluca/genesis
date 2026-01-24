/**
 * Genesis 6.0 - φ Monitor
 *
 * Real-time monitoring of consciousness level (φ).
 * Tracks φ over time, detects anomalies, and enforces INV-006.
 *
 * Features:
 * - Continuous φ tracking
 * - Per-agent φ calculation
 * - Trend analysis (rising/stable/falling)
 * - Anomaly detection
 * - Threshold alerts
 * - Historical data
 *
 * Usage:
 * ```typescript
 * import { createPhiMonitor } from './consciousness/phi-monitor.js';
 *
 * const monitor = createPhiMonitor({
 *   minPhi: 0.1, // INV-006 threshold
 * });
 *
 * // Start monitoring
 * monitor.start();
 *
 * // Get current level
 * const level = monitor.getCurrentLevel();
 *
 * // Check INV-006
 * const satisfied = monitor.checkInvariant();
 *
 * // Subscribe to alerts
 * monitor.onPhiDrop(0.2, () => console.warn('φ dropping!'));
 * ```
 */

import {
  ConsciousnessLevel,
  ConsciousnessState,
  ConsciousnessTrend,
  ConsciousnessAnomaly,
  AnomalyType,
  SystemState,
  PhiResult,
} from './types.js';
import { PhiCalculator, createPhiCalculator } from './phi-calculator.js';

// ============================================================================
// Configuration
// ============================================================================

export interface PhiMonitorConfig {
  updateIntervalMs: number;          // How often to recalculate φ
  historyLimit: number;              // How many snapshots to keep
  minPhi: number;                    // INV-006 threshold
  anomalyDetection: boolean;         // Enable anomaly detection
  dropThreshold: number;             // Alert if φ drops by this amount
  spikeThreshold: number;            // Alert if φ spikes by this amount
  trendWindowSize: number;           // Samples to use for trend calculation
}

export const DEFAULT_PHI_MONITOR_CONFIG: PhiMonitorConfig = {
  updateIntervalMs: 5000,            // Every 5 seconds
  historyLimit: 1000,
  minPhi: 0.1,                       // 10% minimum
  anomalyDetection: true,
  dropThreshold: 0.2,                // 20% drop
  spikeThreshold: 0.3,               // 30% spike
  trendWindowSize: 10,
};

// ============================================================================
// φ Monitor
// ============================================================================

export type PhiMonitorEventType =
  | 'phi_updated'
  | 'phi_threshold_crossed'
  | 'state_changed'
  | 'trend_changed'
  | 'anomaly_detected'
  | 'anomaly_resolved'
  | 'invariant_violated'
  | 'invariant_restored';

export type PhiMonitorEventHandler = (event: {
  type: PhiMonitorEventType;
  data?: unknown;
}) => void;

export class PhiMonitor {
  private config: PhiMonitorConfig;
  private calculator: PhiCalculator;
  private updateTimer: ReturnType<typeof setInterval> | null = null;
  private running: boolean = false;

  // State
  private currentLevel: ConsciousnessLevel;
  private currentState: ConsciousnessState = 'aware';
  private currentTrend: ConsciousnessTrend = 'stable';
  private agentPhi: Map<string, number> = new Map();
  private anomalies: ConsciousnessAnomaly[] = [];

  // History
  private history: ConsciousnessLevel[] = [];

  // Callbacks
  private eventHandlers: Set<PhiMonitorEventHandler> = new Set();
  private dropCallbacks: Array<{ threshold: number; callback: () => void }> = [];
  private anomalyCallbacks: Array<(anomaly: ConsciousnessAnomaly) => void> = [];

  // System state provider (injected)
  private getSystemState: (() => SystemState) | null = null;
  private getAgentStates: (() => Map<string, SystemState>) | null = null;

  // v12.1: Workspace coherence provider — modulates φ by content integration
  private workspaceCoherenceProvider: (() => number) | null = null;

  constructor(config: Partial<PhiMonitorConfig> = {}) {
    this.config = { ...DEFAULT_PHI_MONITOR_CONFIG, ...config };
    this.calculator = createPhiCalculator({
      approximationLevel: 'fast',
      cacheResults: true,
    });

    this.currentLevel = {
      phi: 0.5,
      rawPhi: 0.5,
      confidence: 0.5,
      timestamp: new Date(),
    };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(): void {
    if (this.running) return;

    this.running = true;
    this.updateTimer = setInterval(
      () => this.update(),
      this.config.updateIntervalMs
    );

    // Initial update
    this.update();
  }

  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
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
  }

  /**
   * Set the agent states provider (for per-agent φ)
   */
  setAgentStatesProvider(provider: () => Map<string, SystemState>): void {
    this.getAgentStates = provider;
  }

  /**
   * v12.1: Set workspace coherence provider.
   * Modulates φ by semantic coherence of workspace contents.
   * φ_effective = φ_structural × (0.5 + 0.5 × coherence)
   */
  setWorkspaceCoherenceProvider(provider: () => number): void {
    this.workspaceCoherenceProvider = provider;
  }

  // ============================================================================
  // Main Update Loop
  // ============================================================================

  /**
   * Update φ calculation
   */
  update(): void {
    const previousLevel = this.currentLevel;
    const now = new Date();

    // Calculate system-wide φ
    let phiResult: PhiResult;

    if (this.getSystemState) {
      const systemState = this.getSystemState();
      phiResult = this.calculator.calculate(systemState);
    } else {
      // Default/simulated φ
      phiResult = this.simulatePhi();
    }

    // v12.1: Modulate φ by workspace content coherence
    // φ_effective = φ_structural × (0.5 + 0.5 × coherence)
    // If contents are incoherent, φ drops — integration requires coherent content
    if (this.workspaceCoherenceProvider) {
      try {
        const coherence = Math.max(0, Math.min(1, this.workspaceCoherenceProvider()));
        phiResult.phi *= (0.5 + 0.5 * coherence);
      } catch { /* coherence provider failure is non-fatal */ }
    }

    // Normalize φ to 0-1 range
    const normalizedPhi = Math.tanh(phiResult.phi);

    // Create new level
    this.currentLevel = {
      phi: normalizedPhi,
      rawPhi: phiResult.phi,
      confidence: phiResult.approximation ? 0.7 : 0.95,
      timestamp: now,
    };

    // Add to history
    this.history.unshift(this.currentLevel);
    if (this.history.length > this.config.historyLimit) {
      this.history.pop();
    }

    // Calculate per-agent φ
    this.updateAgentPhi();

    // Update state classification
    const previousState = this.currentState;
    this.currentState = this.classifyState(normalizedPhi);
    if (this.currentState !== previousState) {
      this.emit({ type: 'state_changed', data: { from: previousState, to: this.currentState } });
    }

    // Update trend
    const previousTrend = this.currentTrend;
    this.currentTrend = this.calculateTrend();
    if (this.currentTrend !== previousTrend) {
      this.emit({ type: 'trend_changed', data: { from: previousTrend, to: this.currentTrend } });
    }

    // Check for anomalies
    if (this.config.anomalyDetection) {
      this.detectAnomalies(previousLevel);
    }

    // Check drop callbacks
    const drop = previousLevel.phi - this.currentLevel.phi;
    for (const { threshold, callback } of this.dropCallbacks) {
      if (drop >= threshold) {
        try {
          callback();
        } catch (err) {
          console.error('φ drop callback error:', err);
        }
      }
    }

    // Check invariant
    const invariantSatisfied = this.checkInvariant();
    if (!invariantSatisfied) {
      this.emit({
        type: 'invariant_violated',
        data: { phi: this.currentLevel.phi, threshold: this.config.minPhi },
      });
    }

    this.emit({ type: 'phi_updated', data: { level: this.currentLevel, result: phiResult } });
  }

  /**
   * Update per-agent φ
   */
  private updateAgentPhi(): void {
    if (!this.getAgentStates) return;

    const agentStates = this.getAgentStates();

    for (const [agentId, state] of agentStates) {
      const result = this.calculator.calculate(state);
      this.agentPhi.set(agentId, Math.tanh(result.phi));
    }
  }

  /**
   * Simulate φ when no system state is available
   */
  private simulatePhi(): PhiResult {
    // Generate slightly varying φ
    const basePhis = this.history.slice(0, 5).map((l) => l.rawPhi);
    const avgPhi = basePhis.length > 0
      ? basePhis.reduce((a, b) => a + b, 0) / basePhis.length
      : 0.5;

    // Add some noise
    const noise = (Math.random() - 0.5) * 0.1;
    const phi = Math.max(0, Math.min(1, avgPhi + noise));

    return {
      phi,
      mip: { id: 'simulated', parts: [[]], cut: { severedConnections: [], informationLoss: 0 } },
      intrinsicInfo: phi,
      integratedInfo: phi,
      complexes: [],
      calculationTime: 0,
      approximation: true,
    };
  }

  // ============================================================================
  // State Classification
  // ============================================================================

  /**
   * Classify consciousness state based on φ
   */
  private classifyState(phi: number): ConsciousnessState {
    if (phi > 0.7) return 'alert';
    if (phi > 0.4) return 'aware';
    if (phi > 0.2) return 'drowsy';
    if (phi > 0.05) return 'dormant';
    return 'fragmented';
  }

  /**
   * Calculate trend from recent history
   */
  private calculateTrend(): ConsciousnessTrend {
    const windowSize = Math.min(this.config.trendWindowSize, this.history.length);
    if (windowSize < 2) return 'stable';

    const recent = this.history.slice(0, windowSize);

    // Linear regression slope
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < recent.length; i++) {
      sumX += i;
      sumY += recent[i].phi;
      sumXY += i * recent[i].phi;
      sumX2 += i * i;
    }

    const n = recent.length;
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // Note: negative slope means rising (more recent = smaller index)
    if (slope < -0.01) return 'rising';
    if (slope > 0.01) return 'falling';
    return 'stable';
  }

  // ============================================================================
  // Anomaly Detection
  // ============================================================================

  /**
   * Detect anomalies in φ changes
   */
  private detectAnomalies(previousLevel: ConsciousnessLevel): void {
    const delta = this.currentLevel.phi - previousLevel.phi;
    const now = new Date();

    // Check for sudden drop
    if (-delta >= this.config.dropThreshold) {
      const anomaly: ConsciousnessAnomaly = {
        type: 'phi_drop',
        severity: -delta >= 0.5 ? 'critical' : 'high',
        description: `φ dropped by ${(-delta * 100).toFixed(1)}%`,
        detected: now,
        metrics: { delta, previousPhi: previousLevel.phi, currentPhi: this.currentLevel.phi },
        resolved: false,
      };
      this.recordAnomaly(anomaly);
    }

    // Check for sudden spike
    if (delta >= this.config.spikeThreshold) {
      const anomaly: ConsciousnessAnomaly = {
        type: 'phi_spike',
        severity: 'medium',
        description: `φ spiked by ${(delta * 100).toFixed(1)}%`,
        detected: now,
        metrics: { delta, previousPhi: previousLevel.phi, currentPhi: this.currentLevel.phi },
        resolved: false,
      };
      this.recordAnomaly(anomaly);
    }

    // Check for fragmentation
    if (this.currentState === 'fragmented') {
      const existing = this.anomalies.find(
        (a) => a.type === 'integration_failure' && !a.resolved
      );
      if (!existing) {
        const anomaly: ConsciousnessAnomaly = {
          type: 'integration_failure',
          severity: 'critical',
          description: 'System integration has broken down',
          detected: now,
          metrics: { phi: this.currentLevel.phi },
          resolved: false,
        };
        this.recordAnomaly(anomaly);
      }
    } else {
      // Resolve integration failure if state improved
      const existing = this.anomalies.find(
        (a) => a.type === 'integration_failure' && !a.resolved
      );
      if (existing) {
        existing.resolved = true;
        existing.resolution = `State improved to ${this.currentState}`;
        this.emit({ type: 'anomaly_resolved', data: existing });
      }
    }
  }

  /**
   * Record a new anomaly
   */
  private recordAnomaly(anomaly: ConsciousnessAnomaly): void {
    this.anomalies.push(anomaly);

    // Limit anomaly history
    if (this.anomalies.length > 100) {
      this.anomalies = this.anomalies.slice(-100);
    }

    this.emit({ type: 'anomaly_detected', data: anomaly });

    // Call anomaly callbacks
    for (const callback of this.anomalyCallbacks) {
      try {
        callback(anomaly);
      } catch (err) {
        console.error('Anomaly callback error:', err);
      }
    }
  }

  // ============================================================================
  // Invariant (INV-006)
  // ============================================================================

  /**
   * Check INV-006: φ must stay above threshold
   */
  checkInvariant(): boolean {
    return this.currentLevel.phi >= this.config.minPhi;
  }

  /**
   * Get invariant status
   */
  getInvariantStatus(): {
    id: string;
    satisfied: boolean;
    currentPhi: number;
    threshold: number;
    margin: number;
  } {
    return {
      id: 'INV-006',
      satisfied: this.checkInvariant(),
      currentPhi: this.currentLevel.phi,
      threshold: this.config.minPhi,
      margin: this.currentLevel.phi - this.config.minPhi,
    };
  }

  // ============================================================================
  // State Access
  // ============================================================================

  getCurrentLevel(): ConsciousnessLevel {
    return { ...this.currentLevel };
  }

  getState(): ConsciousnessState {
    return this.currentState;
  }

  getTrend(): ConsciousnessTrend {
    return this.currentTrend;
  }

  getAgentPhi(agentId: string): number | undefined {
    return this.agentPhi.get(agentId);
  }

  getAllAgentPhi(): Map<string, number> {
    return new Map(this.agentPhi);
  }

  getHistory(limit?: number): ConsciousnessLevel[] {
    const count = limit ?? this.history.length;
    return this.history.slice(0, count).map((l) => ({ ...l }));
  }

  getAnomalies(options: {
    type?: AnomalyType;
    resolved?: boolean;
    limit?: number;
  } = {}): ConsciousnessAnomaly[] {
    let result = [...this.anomalies];

    if (options.type) {
      result = result.filter((a) => a.type === options.type);
    }

    if (options.resolved !== undefined) {
      result = result.filter((a) => a.resolved === options.resolved);
    }

    if (options.limit) {
      result = result.slice(-options.limit);
    }

    return result;
  }

  // ============================================================================
  // Callbacks
  // ============================================================================

  /**
   * Register callback for φ drops
   */
  onPhiDrop(threshold: number, callback: () => void): () => void {
    const entry = { threshold, callback };
    this.dropCallbacks.push(entry);
    return () => {
      const index = this.dropCallbacks.indexOf(entry);
      if (index >= 0) this.dropCallbacks.splice(index, 1);
    };
  }

  /**
   * Register callback for anomalies
   */
  onAnomaly(callback: (anomaly: ConsciousnessAnomaly) => void): () => void {
    this.anomalyCallbacks.push(callback);
    return () => {
      const index = this.anomalyCallbacks.indexOf(callback);
      if (index >= 0) this.anomalyCallbacks.splice(index, 1);
    };
  }

  // ============================================================================
  // Events
  // ============================================================================

  on(handler: PhiMonitorEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: { type: PhiMonitorEventType; data?: unknown }): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('φ monitor event handler error:', err);
      }
    }
  }

  // ============================================================================
  // Stats
  // ============================================================================

  stats(): {
    currentPhi: number;
    state: ConsciousnessState;
    trend: ConsciousnessTrend;
    historyLength: number;
    agentCount: number;
    openAnomalies: number;
    invariantSatisfied: boolean;
  } {
    return {
      currentPhi: this.currentLevel.phi,
      state: this.currentState,
      trend: this.currentTrend,
      historyLength: this.history.length,
      agentCount: this.agentPhi.size,
      openAnomalies: this.anomalies.filter((a) => !a.resolved).length,
      invariantSatisfied: this.checkInvariant(),
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createPhiMonitor(config?: Partial<PhiMonitorConfig>): PhiMonitor {
  return new PhiMonitor(config);
}
