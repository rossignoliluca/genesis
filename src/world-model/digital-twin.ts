/**
 * Genesis 6.0 - Digital Twin
 *
 * Digital twin implementation for creating synchronized virtual
 * representations of real systems.
 *
 * Capabilities:
 * - Real-time synchronization with source system
 * - Drift detection and correction
 * - Predictive maintenance through simulation
 * - What-if scenario analysis
 *
 * A digital twin maintains a latent representation that mirrors
 * the real system, enabling prediction without affecting the original.
 *
 * Industrial applications:
 * - Process monitoring
 * - Anomaly detection
 * - Optimization planning
 * - Failure prediction
 *
 * References:
 * - Grieves (2014). Digital Twin: Manufacturing Excellence through Virtual Factory Replication
 * - Tao et al. (2019). Digital Twin in Industry
 *
 * Usage:
 * ```typescript
 * import { createDigitalTwin, DigitalTwinManager } from './world-model/digital-twin.js';
 *
 * const twin = createDigitalTwin('server-1', 'Production Server');
 *
 * // Start synchronization
 * twin.startSync(() => fetchRealState());
 *
 * // Run what-if scenario
 * const prediction = twin.whatIf([upgradeAction, restartAction]);
 *
 * // Check health
 * const health = twin.getHealth();
 * ```
 */

import { randomUUID } from 'crypto';
import {
  LatentState,
  Action,
  DigitalTwin,
  DigitalTwinConfig,
  DEFAULT_DIGITAL_TWIN_CONFIG,
  TwinStatus,
  Trajectory,
  PredictedState,
  ConsistencyCheck,
  ConsistencyIssue,
} from './types.js';
import { LatentEncoder, createLatentEncoder } from './encoder.js';
import { WorldModelPredictor, createWorldModelPredictor, createAction } from './predictor.js';

// ============================================================================
// Twin Types
// ============================================================================

export interface TwinMetrics {
  syncCount: number;
  driftEvents: number;
  avgDrift: number;
  maxDrift: number;
  uptime: number;
  lastSync: Date | null;
  predictions: number;
}

export interface TwinHealth {
  status: TwinStatus;
  syncHealth: number;           // 0-1, 1 = perfect sync
  predictionAccuracy: number;   // Historical accuracy
  driftTrend: 'stable' | 'increasing' | 'decreasing';
  issues: string[];
  recommendations: string[];
}

export interface WhatIfResult {
  scenario: Action[];
  trajectory: Trajectory;
  expectedOutcome: LatentState;
  riskScore: number;
  confidence: number;
  warnings: string[];
}

export interface TwinSnapshot {
  id: string;
  twinId: string;
  state: LatentState;
  realState: LatentState | null;
  drift: number;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

// ============================================================================
// Digital Twin Implementation
// ============================================================================

export type TwinEventType =
  | 'synced'
  | 'drift_detected'
  | 'drift_corrected'
  | 'prediction_made'
  | 'what_if_complete'
  | 'status_changed'
  | 'error';

export type TwinEventHandler = (event: {
  type: TwinEventType;
  data?: unknown;
}) => void;

export class DigitalTwinInstance implements DigitalTwin {
  id: string;
  name: string;
  realSystemId: string;

  currentState: LatentState;
  lastSync: Date;
  syncDrift: number = 0;

  stateHistory: LatentState[] = [];
  historyLimit: number;

  config: DigitalTwinConfig;
  status: TwinStatus = 'initializing';

  // Components
  private encoder: LatentEncoder;
  private predictor: WorldModelPredictor;

  // Sync management
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private stateFetcher: (() => Promise<Record<string, unknown>>) | null = null;

  // Metrics
  private metrics: TwinMetrics;

  // Events
  private eventHandlers: Set<TwinEventHandler> = new Set();

  // Prediction history (for accuracy tracking)
  private predictionHistory: Array<{
    predicted: LatentState;
    actual: LatentState | null;
    timestamp: Date;
  }> = [];

  constructor(
    realSystemId: string,
    name: string,
    config: Partial<DigitalTwinConfig> = {}
  ) {
    this.id = randomUUID();
    this.realSystemId = realSystemId;
    this.name = name;
    this.config = { ...DEFAULT_DIGITAL_TWIN_CONFIG, ...config };
    this.historyLimit = 1000;

    // Initialize components
    this.encoder = createLatentEncoder();
    this.predictor = createWorldModelPredictor();

    // Initialize state
    this.currentState = this.createInitialState();
    this.lastSync = new Date();

    // Initialize metrics
    this.metrics = {
      syncCount: 0,
      driftEvents: 0,
      avgDrift: 0,
      maxDrift: 0,
      uptime: 0,
      lastSync: null,
      predictions: 0,
    };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Start synchronization with real system
   */
  startSync(fetcher: () => Promise<Record<string, unknown>>): void {
    this.stateFetcher = fetcher;
    this.status = 'synced';

    // Initial sync
    this.syncNow();

    // Start periodic sync
    this.syncTimer = setInterval(
      () => this.syncNow(),
      this.config.syncIntervalMs
    );

    this.emit({ type: 'status_changed', data: { status: 'synced' } });
  }

  /**
   * Stop synchronization
   */
  stopSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    this.status = 'disconnected';
    this.emit({ type: 'status_changed', data: { status: 'disconnected' } });
  }

  /**
   * Force immediate synchronization
   */
  async syncNow(): Promise<void> {
    if (!this.stateFetcher) {
      this.emit({ type: 'error', data: { message: 'No state fetcher configured' } });
      return;
    }

    try {
      // Fetch real state
      const realStateData = await this.stateFetcher();

      // Encode to latent space
      const realState = this.encoder.encode({
        modality: 'state',
        data: realStateData,
        timestamp: new Date(),
      });

      // Calculate drift
      const drift = this.calculateDrift(this.currentState, realState);
      this.syncDrift = drift;

      // Update metrics
      this.metrics.syncCount++;
      this.metrics.lastSync = new Date();
      this.metrics.avgDrift = (this.metrics.avgDrift * (this.metrics.syncCount - 1) + drift) / this.metrics.syncCount;
      this.metrics.maxDrift = Math.max(this.metrics.maxDrift, drift);

      // Check for drift threshold
      if (drift > this.config.maxDrift) {
        this.metrics.driftEvents++;
        this.status = 'drifting';
        this.emit({ type: 'drift_detected', data: { drift, threshold: this.config.maxDrift } });

        // Correct drift
        this.correctDrift(realState);
      } else {
        this.status = 'synced';
      }

      // Update current state (blend)
      this.currentState = this.blendStates(this.currentState, realState, 0.3);
      this.lastSync = new Date();

      // Add to history
      this.addToHistory(this.currentState);

      // Update prediction history
      this.updatePredictionAccuracy(realState);

      this.emit({ type: 'synced', data: { drift } });
    } catch (error) {
      this.status = 'disconnected';
      this.emit({ type: 'error', data: { message: String(error) } });
    }
  }

  // ============================================================================
  // Prediction
  // ============================================================================

  /**
   * Predict future state
   */
  predict(actions: Action[], horizon: number = this.config.predictAhead): Trajectory {
    const trajectory = this.predictor.simulate(this.currentState, actions, horizon);

    // Store for accuracy tracking
    if (trajectory.states.length > 0) {
      this.predictionHistory.push({
        predicted: trajectory.states[trajectory.states.length - 1].state,
        actual: null,
        timestamp: new Date(),
      });

      // Limit history
      if (this.predictionHistory.length > 100) {
        this.predictionHistory.shift();
      }
    }

    this.metrics.predictions++;
    this.emit({ type: 'prediction_made', data: { horizon, steps: trajectory.states.length } });

    return trajectory;
  }

  /**
   * Run what-if scenario
   */
  whatIf(scenario: Action[]): WhatIfResult {
    // Simulate from current state
    const trajectory = this.predict(scenario, scenario.length * 2);

    // Get expected outcome
    const expectedOutcome = trajectory.states.length > 0
      ? trajectory.states[trajectory.states.length - 1].state
      : this.currentState;

    // Calculate risk score
    const riskScore = this.calculateRisk(scenario, trajectory);

    // Generate warnings
    const warnings = this.generateWarnings(trajectory, riskScore);

    const result: WhatIfResult = {
      scenario,
      trajectory,
      expectedOutcome,
      riskScore,
      confidence: trajectory.totalProbability,
      warnings,
    };

    this.emit({ type: 'what_if_complete', data: { actionCount: scenario.length, riskScore } });

    return result;
  }

  /**
   * Calculate risk score for scenario
   */
  private calculateRisk(actions: Action[], trajectory: Trajectory): number {
    let risk = 0;

    // Action risk
    for (const action of actions) {
      const actionRisk = this.getActionRisk(action.type);
      risk += actionRisk * 0.3;
    }

    // Uncertainty risk
    const avgUncertainty = trajectory.states.reduce(
      (sum, s) => sum + s.uncertainty, 0
    ) / Math.max(trajectory.states.length, 1);
    risk += avgUncertainty * 0.4;

    // Drift from current state risk
    if (trajectory.states.length > 0) {
      const finalState = trajectory.states[trajectory.states.length - 1].state;
      const drift = this.calculateDrift(this.currentState, finalState);
      risk += drift * 0.3;
    }

    return Math.min(1, Math.max(0, risk));
  }

  private getActionRisk(type: string): number {
    const risks: Record<string, number> = {
      observe: 0.0,
      query: 0.1,
      navigate: 0.2,
      communicate: 0.3,
      execute: 0.5,
      transform: 0.6,
      create: 0.7,
      delete: 0.9,
    };
    return risks[type] || 0.5;
  }

  /**
   * Generate warnings for trajectory
   */
  private generateWarnings(trajectory: Trajectory, riskScore: number): string[] {
    const warnings: string[] = [];

    if (riskScore > 0.7) {
      warnings.push('High risk scenario - proceed with caution');
    }

    if (trajectory.totalProbability < 0.3) {
      warnings.push('Low confidence in predicted outcome');
    }

    const uncertainSteps = trajectory.states.filter((s) => s.uncertainty > 0.5);
    if (uncertainSteps.length > trajectory.states.length / 2) {
      warnings.push('Many uncertain steps in trajectory');
    }

    if (trajectory.horizon < trajectory.states.length) {
      warnings.push('Simulation terminated early due to high uncertainty');
    }

    return warnings;
  }

  // ============================================================================
  // Health & Status
  // ============================================================================

  /**
   * Get twin health status
   */
  getHealth(): TwinHealth {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Sync health
    const syncHealth = 1 - Math.min(1, this.syncDrift / this.config.maxDrift);

    // Prediction accuracy
    const predictionAccuracy = this.getPredictionAccuracy();

    // Drift trend
    const driftTrend = this.analyzeDriftTrend();

    // Check for issues
    if (this.status === 'disconnected') {
      issues.push('Twin is disconnected from source system');
      recommendations.push('Check network connectivity and restart sync');
    }

    if (this.status === 'drifting') {
      issues.push('Twin state has drifted from source');
      recommendations.push('Wait for automatic correction or force sync');
    }

    if (syncHealth < 0.5) {
      issues.push('Low sync health - high drift detected');
      recommendations.push('Reduce sync interval or check source system stability');
    }

    if (predictionAccuracy < 0.5) {
      issues.push('Low prediction accuracy');
      recommendations.push('Retrain predictor with recent data');
    }

    if (driftTrend === 'increasing') {
      issues.push('Drift is increasing over time');
      recommendations.push('Investigate source system changes');
    }

    return {
      status: this.status,
      syncHealth,
      predictionAccuracy,
      driftTrend,
      issues,
      recommendations,
    };
  }

  /**
   * Get prediction accuracy
   */
  private getPredictionAccuracy(): number {
    const validPredictions = this.predictionHistory.filter(
      (p) => p.actual !== null
    );

    if (validPredictions.length === 0) return 0.5;

    let totalAccuracy = 0;
    for (const p of validPredictions) {
      const similarity = this.calculateSimilarity(p.predicted, p.actual!);
      totalAccuracy += similarity;
    }

    return totalAccuracy / validPredictions.length;
  }

  /**
   * Analyze drift trend
   */
  private analyzeDriftTrend(): 'stable' | 'increasing' | 'decreasing' {
    if (this.stateHistory.length < 10) return 'stable';

    // Compare recent drift to older drift
    const recentStates = this.stateHistory.slice(-5);
    const olderStates = this.stateHistory.slice(-10, -5);

    let recentDrift = 0;
    let olderDrift = 0;

    for (let i = 1; i < recentStates.length; i++) {
      recentDrift += this.calculateDrift(recentStates[i - 1], recentStates[i]);
    }

    for (let i = 1; i < olderStates.length; i++) {
      olderDrift += this.calculateDrift(olderStates[i - 1], olderStates[i]);
    }

    const recentAvg = recentDrift / (recentStates.length - 1 || 1);
    const olderAvg = olderDrift / (olderStates.length - 1 || 1);

    if (recentAvg > olderAvg * 1.2) return 'increasing';
    if (recentAvg < olderAvg * 0.8) return 'decreasing';
    return 'stable';
  }

  // ============================================================================
  // Consistency Check (INV-008)
  // ============================================================================

  /**
   * Check consistency of twin state
   */
  checkConsistency(): ConsistencyCheck {
    const issues: ConsistencyIssue[] = [];

    // State consistency
    const stateConsistent = this.checkStateConsistency();
    if (!stateConsistent) {
      issues.push({
        type: 'contradiction',
        severity: 'high',
        description: 'Current state inconsistent with history',
        affectedEntities: [this.id],
        suggestedFix: 'Force synchronization',
      });
    }

    // Temporal consistency
    const temporalConsistent = this.checkTemporalConsistency();
    if (!temporalConsistent) {
      issues.push({
        type: 'cycle',
        severity: 'medium',
        description: 'Temporal ordering violated',
        affectedEntities: [this.id],
      });
    }

    // Causal consistency (predictions follow from states)
    const causalConsistent = this.checkCausalConsistency();
    if (!causalConsistent) {
      issues.push({
        type: 'gap',
        severity: 'medium',
        description: 'Causal gaps in prediction chain',
        affectedEntities: [this.id],
      });
    }

    // Entity consistency (twin properly linked to source)
    const entityConsistent = this.status !== 'disconnected';
    if (!entityConsistent) {
      issues.push({
        type: 'orphan',
        severity: 'high',
        description: 'Twin disconnected from source system',
        affectedEntities: [this.id, this.realSystemId],
        suggestedFix: 'Reconnect to source system',
      });
    }

    const inconsistencyScore = issues.reduce((sum, issue) => {
      const severityScores = { low: 0.1, medium: 0.3, high: 0.6, critical: 1.0 };
      return sum + severityScores[issue.severity];
    }, 0);

    return {
      id: randomUUID(),
      timestamp: new Date(),
      passed: issues.length === 0,
      checks: {
        stateConsistency: stateConsistent,
        temporalConsistency: temporalConsistent,
        causalConsistency: causalConsistent,
        entityConsistency: entityConsistent,
      },
      issues,
      inconsistencyScore: Math.min(1, inconsistencyScore),
    };
  }

  private checkStateConsistency(): boolean {
    if (this.stateHistory.length < 2) return true;

    // Check if current state is reachable from history
    const recent = this.stateHistory.slice(-5);
    for (let i = 1; i < recent.length; i++) {
      const drift = this.calculateDrift(recent[i - 1], recent[i]);
      if (drift > 0.5) return false; // Too large a jump
    }

    return true;
  }

  private checkTemporalConsistency(): boolean {
    // Check timestamps are monotonic
    for (let i = 1; i < this.stateHistory.length; i++) {
      if (this.stateHistory[i].timestamp <= this.stateHistory[i - 1].timestamp) {
        return false;
      }
    }
    return true;
  }

  private checkCausalConsistency(): boolean {
    // Check prediction history for causality
    for (const p of this.predictionHistory) {
      if (p.actual !== null) {
        const accuracy = this.calculateSimilarity(p.predicted, p.actual);
        if (accuracy < 0.3) return false; // Prediction wildly off
      }
    }
    return true;
  }

  // ============================================================================
  // Snapshots
  // ============================================================================

  /**
   * Take a snapshot of current twin state
   */
  takeSnapshot(metadata: Record<string, unknown> = {}): TwinSnapshot {
    return {
      id: randomUUID(),
      twinId: this.id,
      state: { ...this.currentState },
      realState: null, // Would be populated on sync
      drift: this.syncDrift,
      timestamp: new Date(),
      metadata,
    };
  }

  /**
   * Restore from snapshot
   */
  restoreSnapshot(snapshot: TwinSnapshot): void {
    if (snapshot.twinId !== this.id) {
      throw new Error('Snapshot does not belong to this twin');
    }

    this.currentState = { ...snapshot.state };
    this.syncDrift = snapshot.drift;
    this.addToHistory(this.currentState);
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Calculate drift between two states
   */
  private calculateDrift(stateA: LatentState, stateB: LatentState): number {
    const minLen = Math.min(stateA.vector.length, stateB.vector.length);
    let sumSq = 0;

    for (let i = 0; i < minLen; i++) {
      sumSq += (stateA.vector[i] - stateB.vector[i]) ** 2;
    }

    return Math.sqrt(sumSq) / Math.sqrt(minLen);
  }

  /**
   * Calculate similarity between two states
   */
  private calculateSimilarity(stateA: LatentState, stateB: LatentState): number {
    const minLen = Math.min(stateA.vector.length, stateB.vector.length);
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < minLen; i++) {
      dotProduct += stateA.vector[i] * stateB.vector[i];
      magA += stateA.vector[i] * stateA.vector[i];
      magB += stateB.vector[i] * stateB.vector[i];
    }

    const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
    if (magnitude === 0) return 0;

    return (dotProduct / magnitude + 1) / 2; // Normalize to 0-1
  }

  /**
   * Blend two states
   */
  private blendStates(stateA: LatentState, stateB: LatentState, t: number): LatentState {
    const minLen = Math.min(stateA.vector.length, stateB.vector.length);
    const blended = new Array(minLen);

    for (let i = 0; i < minLen; i++) {
      blended[i] = stateA.vector[i] * (1 - t) + stateB.vector[i] * t;
    }

    return {
      vector: blended,
      dimensions: minLen,
      sourceModality: stateA.sourceModality,
      sourceId: `blended-${stateA.sourceId}`,
      timestamp: new Date(),
      confidence: Math.min(stateA.confidence, stateB.confidence),
      entropy: stateA.entropy! * (1 - t) + (stateB.entropy || 0.5) * t,
    };
  }

  /**
   * Correct drift by updating state
   */
  private correctDrift(realState: LatentState): void {
    // Heavy blend toward real state
    this.currentState = this.blendStates(this.currentState, realState, 0.8);
    this.syncDrift = this.calculateDrift(this.currentState, realState);
    this.emit({ type: 'drift_corrected', data: { newDrift: this.syncDrift } });
  }

  /**
   * Add state to history
   */
  private addToHistory(state: LatentState): void {
    this.stateHistory.push({ ...state });

    if (this.stateHistory.length > this.historyLimit) {
      this.stateHistory.shift();
    }
  }

  /**
   * Update prediction accuracy with new actual state
   */
  private updatePredictionAccuracy(actualState: LatentState): void {
    // Find recent predictions that are now verifiable
    const now = Date.now();
    for (const p of this.predictionHistory) {
      if (p.actual === null) {
        const age = now - p.timestamp.getTime();
        if (age > this.config.syncIntervalMs * 2) {
          // This prediction is old enough to verify
          p.actual = actualState;
        }
      }
    }
  }

  /**
   * Create initial latent state
   */
  private createInitialState(): LatentState {
    const dim = 512;
    const vector = new Array(dim).fill(0);

    return {
      vector,
      dimensions: dim,
      sourceModality: 'state',
      sourceId: `initial-${this.id}`,
      timestamp: new Date(),
      confidence: 0.5,
      entropy: 0.5,
    };
  }

  // ============================================================================
  // Events
  // ============================================================================

  on(handler: TwinEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: { type: TwinEventType; data?: unknown }): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('Twin event handler error:', err);
      }
    }
  }

  // ============================================================================
  // Stats
  // ============================================================================

  getMetrics(): TwinMetrics {
    return {
      ...this.metrics,
      uptime: Date.now() - this.stateHistory[0]?.timestamp.getTime() || 0,
    };
  }
}

// ============================================================================
// Digital Twin Manager
// ============================================================================

export class DigitalTwinManager {
  private twins: Map<string, DigitalTwinInstance> = new Map();

  /**
   * Create a new digital twin
   */
  createTwin(
    realSystemId: string,
    name: string,
    config?: Partial<DigitalTwinConfig>
  ): DigitalTwinInstance {
    const twin = new DigitalTwinInstance(realSystemId, name, config);
    this.twins.set(twin.id, twin);
    return twin;
  }

  /**
   * Get twin by ID
   */
  getTwin(id: string): DigitalTwinInstance | undefined {
    return this.twins.get(id);
  }

  /**
   * Get all twins
   */
  getAllTwins(): DigitalTwinInstance[] {
    return Array.from(this.twins.values());
  }

  /**
   * Remove twin
   */
  removeTwin(id: string): boolean {
    const twin = this.twins.get(id);
    if (twin) {
      twin.stopSync();
      this.twins.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Get overall health
   */
  getOverallHealth(): {
    totalTwins: number;
    synced: number;
    drifting: number;
    disconnected: number;
    avgSyncHealth: number;
  } {
    let synced = 0;
    let drifting = 0;
    let disconnected = 0;
    let totalSyncHealth = 0;

    for (const twin of this.twins.values()) {
      const health = twin.getHealth();
      totalSyncHealth += health.syncHealth;

      switch (twin.status) {
        case 'synced':
          synced++;
          break;
        case 'drifting':
          drifting++;
          break;
        case 'disconnected':
          disconnected++;
          break;
      }
    }

    return {
      totalTwins: this.twins.size,
      synced,
      drifting,
      disconnected,
      avgSyncHealth: this.twins.size > 0 ? totalSyncHealth / this.twins.size : 0,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createDigitalTwin(
  realSystemId: string,
  name: string,
  config?: Partial<DigitalTwinConfig>
): DigitalTwinInstance {
  return new DigitalTwinInstance(realSystemId, name, config);
}

export function createDigitalTwinManager(): DigitalTwinManager {
  return new DigitalTwinManager();
}
