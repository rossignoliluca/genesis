/**
 * Genesis 6.0 - World Model Module
 *
 * Unified world model for prediction, simulation, and dreaming.
 *
 * This module provides:
 * - Latent space encoding (JEPA-style)
 * - Predictive modeling and multi-step simulation
 * - Digital twin capabilities
 * - Physics/common sense reasoning
 * - Dream mode for memory consolidation
 *
 * The world model enables the system to:
 * - Predict consequences of actions
 * - Run what-if scenarios safely
 * - Maintain synchronized models of external systems
 * - Reason about physical causality
 *
 * Key invariant: INV-008 - World model consistency
 *
 * Usage:
 * ```typescript
 * import { createWorldModelSystem } from './world-model/index.js';
 *
 * const worldModel = createWorldModelSystem();
 *
 * // Encode observation
 * const state = worldModel.encode({ modality: 'text', data: 'User logged in' });
 *
 * // Predict next state
 * const prediction = worldModel.predict(state, action);
 *
 * // Simulate trajectory
 * const trajectory = worldModel.simulate(state, actions, 100);
 *
 * // Create digital twin
 * const twin = worldModel.createTwin('server-1', 'Production Server');
 *
 * // Run dream cycle
 * const dreamResult = await worldModel.dream();
 * ```
 */

// Re-export types
export * from './types.js';

// Re-export components
export { LatentEncoder, createLatentEncoder, type EncoderEventHandler } from './encoder.js';
export { LatentDecoder, createLatentDecoder, type DecoderEventHandler, type TextDecoding, type StateDecoding, type FeatureDecoding } from './decoder.js';
export { WorldModelPredictor, createWorldModelPredictor, createAction, type PredictorEventHandler } from './predictor.js';
export { DigitalTwinInstance, DigitalTwinManager, createDigitalTwin, createDigitalTwinManager, type TwinEventHandler, type TwinHealth, type WhatIfResult, type TwinSnapshot, type TwinMetrics } from './digital-twin.js';

// Value-Guided JEPA (Genesis 6.2)
export {
  ValueFunction,
  ValueGuidedJEPA,
  createValueFunction,
  getValueFunction,
  resetValueFunction,
  createValueGuidedJEPA,
  type ValueEstimate,
  type ValuedTrajectory,
  type ActionValue,
  type ValueFunctionConfig,
  type FreeEnergyDecomposition,
  DEFAULT_VALUE_CONFIG,
} from './value-jepa.js';

import {
  MultimodalInput,
  LatentState,
  Action,
  PredictedState,
  Trajectory,
  PhysicsQuery,
  PhysicsAnswer,
  WorldEntity,
  EntityRelation,
  ConsistencyCheck,
  ConsistencyIssue,
  DreamResult,
  DreamConfig,
  DEFAULT_DREAM_CONFIG,
  SlowWaveResult,
  REMResult,
  ConsolidationResult,
  Pattern,
  WorldModelSystemConfig,
  DEFAULT_WORLD_MODEL_SYSTEM_CONFIG,
  WorldModelEvent,
  WorldModelEventType,
  WorldModelEventHandler,
} from './types.js';

import { LatentEncoder, createLatentEncoder } from './encoder.js';
import { LatentDecoder, createLatentDecoder, TextDecoding, StateDecoding } from './decoder.js';
import { WorldModelPredictor, createWorldModelPredictor } from './predictor.js';
import { DigitalTwinInstance, DigitalTwinManager, createDigitalTwinManager } from './digital-twin.js';

// ============================================================================
// World Model System
// ============================================================================

export class WorldModelSystem {
  private config: WorldModelSystemConfig;

  // Components
  readonly encoder: LatentEncoder;
  readonly decoder: LatentDecoder;
  readonly predictor: WorldModelPredictor;
  readonly twinManager: DigitalTwinManager;

  // State
  private running: boolean = false;
  private entities: Map<string, WorldEntity> = new Map();
  private relations: Map<string, EntityRelation> = new Map();
  private eventHandlers: Set<WorldModelEventHandler> = new Set();

  // Dream state
  private dreamConfig: DreamConfig;
  private pendingConsolidation: LatentState[] = [];
  private dreamHistory: DreamResult[] = [];

  // Consistency check timer
  private consistencyTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<WorldModelSystemConfig> = {}) {
    this.config = this.mergeConfig(config);
    this.dreamConfig = { ...DEFAULT_DREAM_CONFIG, ...config.dream };

    // Create components
    this.encoder = createLatentEncoder(this.config.encoder);
    this.decoder = createLatentDecoder();
    this.predictor = createWorldModelPredictor(this.config.predictor);
    this.twinManager = createDigitalTwinManager();

    // Setup event forwarding
    this.setupEventForwarding();
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(): void {
    if (this.running) return;

    this.running = true;

    // Start consistency checking if enabled
    if (this.config.consistencyCheckEnabled) {
      this.consistencyTimer = setInterval(
        () => this.runConsistencyCheck(),
        this.config.predictor.consistencyCheckIntervalMs || 5000
      );
    }
  }

  stop(): void {
    if (!this.running) return;

    this.running = false;

    // Stop consistency checking
    if (this.consistencyTimer) {
      clearInterval(this.consistencyTimer);
      this.consistencyTimer = null;
    }

    // Stop all twins
    for (const twin of this.twinManager.getAllTwins()) {
      twin.stopSync();
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  // ============================================================================
  // Encoding / Decoding
  // ============================================================================

  /**
   * Encode input to latent space
   */
  encode(input: MultimodalInput): LatentState {
    const state = this.encoder.encode(input);

    // Add to pending consolidation
    this.pendingConsolidation.push(state);
    if (this.pendingConsolidation.length > 1000) {
      this.pendingConsolidation.shift();
    }

    return state;
  }

  /**
   * Fuse multiple states
   */
  fuse(states: LatentState[]): LatentState {
    return this.encoder.fuse(states);
  }

  /**
   * Decode to text
   */
  decodeToText(state: LatentState): TextDecoding {
    return this.decoder.decodeToText(state);
  }

  /**
   * Decode to structured state
   */
  decodeToState(state: LatentState): StateDecoding {
    return this.decoder.decodeToState(state);
  }

  /**
   * Calculate similarity between states
   */
  similarity(a: LatentState, b: LatentState): number {
    return this.encoder.similarity(a, b);
  }

  /**
   * Interpolate between states
   */
  interpolate(a: LatentState, b: LatentState, t: number): LatentState {
    return this.decoder.interpolate(a, b, t);
  }

  // ============================================================================
  // Prediction / Simulation
  // ============================================================================

  /**
   * Predict next state
   */
  predict(currentState: LatentState, action: Action): PredictedState {
    const prediction = this.predictor.predict(currentState, action);
    this.emit({ type: 'state_predicted', timestamp: new Date(), data: prediction });
    return prediction;
  }

  /**
   * Simulate trajectory
   */
  simulate(
    initialState: LatentState,
    actions: Action[],
    horizon?: number
  ): Trajectory {
    const trajectory = this.predictor.simulate(initialState, actions, horizon);
    this.emit({ type: 'simulation_complete', timestamp: new Date(), data: trajectory });
    return trajectory;
  }

  /**
   * Get uncertainty of prediction
   */
  uncertainty(prediction: PredictedState): number {
    return this.predictor.uncertainty(prediction);
  }

  /**
   * Physics/common sense reasoning
   */
  reason(query: PhysicsQuery): PhysicsAnswer {
    return this.predictor.reason(query);
  }

  // ============================================================================
  // Digital Twins
  // ============================================================================

  /**
   * Create a digital twin
   */
  createTwin(realSystemId: string, name: string): DigitalTwinInstance {
    const twin = this.twinManager.createTwin(realSystemId, name, this.config.twin);

    // Forward events
    twin.on((event) => {
      this.emit({
        type: event.type === 'synced' ? 'twin_synced' : 'twin_drifted',
        timestamp: new Date(),
        data: { twinId: twin.id, eventData: event.data },
      });
    });

    return twin;
  }

  /**
   * Get twin by ID
   */
  getTwin(id: string): DigitalTwinInstance | undefined {
    return this.twinManager.getTwin(id);
  }

  /**
   * Get all twins
   */
  getAllTwins(): DigitalTwinInstance[] {
    return this.twinManager.getAllTwins();
  }

  /**
   * Remove twin
   */
  removeTwin(id: string): boolean {
    return this.twinManager.removeTwin(id);
  }

  // ============================================================================
  // Entity Management
  // ============================================================================

  /**
   * Add entity to world model
   */
  addEntity(entity: WorldEntity): void {
    this.entities.set(entity.id, entity);
    this.predictor.addEntity(entity);
    this.emit({ type: 'entity_created', timestamp: new Date(), data: entity });
  }

  /**
   * Get entity
   */
  getEntity(id: string): WorldEntity | undefined {
    return this.entities.get(id);
  }

  /**
   * Update entity
   */
  updateEntity(id: string, updates: Partial<WorldEntity>): boolean {
    const entity = this.entities.get(id);
    if (!entity) return false;

    Object.assign(entity, updates, { lastUpdated: new Date() });
    this.emit({ type: 'entity_updated', timestamp: new Date(), data: entity });
    return true;
  }

  /**
   * Remove entity
   */
  removeEntity(id: string): boolean {
    const removed = this.entities.delete(id);
    if (removed) {
      this.predictor.removeEntity(id);
      this.emit({ type: 'entity_deleted', timestamp: new Date(), data: { id } });
    }
    return removed;
  }

  /**
   * Add relation between entities
   */
  addRelation(relation: EntityRelation): void {
    this.relations.set(relation.id, relation);
    this.predictor.addRelation(relation);
    this.emit({ type: 'relation_added', timestamp: new Date(), data: relation });
  }

  /**
   * Remove relation
   */
  removeRelation(id: string): boolean {
    const removed = this.relations.delete(id);
    if (removed) {
      this.emit({ type: 'relation_removed', timestamp: new Date(), data: { id } });
    }
    return removed;
  }

  // ============================================================================
  // Consistency (INV-008)
  // ============================================================================

  /**
   * Check world model consistency
   */
  checkConsistency(): ConsistencyCheck {
    const issues: ConsistencyIssue[] = [];

    // Check entity consistency
    for (const [id, entity] of this.entities) {
      // Check for orphan relations
      for (const relation of entity.relations) {
        if (!this.entities.has(relation.target)) {
          issues.push({
            type: 'orphan',
            severity: 'medium',
            description: `Entity ${id} has relation to non-existent entity ${relation.target}`,
            affectedEntities: [id, relation.target],
          });
        }
      }

      // Check for stale entities
      const age = Date.now() - entity.lastUpdated.getTime();
      if (age > this.config.entityTTL) {
        issues.push({
          type: 'drift',
          severity: 'low',
          description: `Entity ${id} has not been updated in ${Math.round(age / 1000)}s`,
          affectedEntities: [id],
          suggestedFix: 'Update entity or remove if no longer relevant',
        });
      }
    }

    // Check twin consistency
    for (const twin of this.twinManager.getAllTwins()) {
      const twinCheck = twin.checkConsistency();
      issues.push(...twinCheck.issues);
    }

    // Check for circular relations
    const circularRelations = this.detectCircularRelations();
    if (circularRelations.length > 0) {
      issues.push({
        type: 'cycle',
        severity: 'medium',
        description: `Circular relations detected`,
        affectedEntities: circularRelations,
      });
    }

    const inconsistencyScore = issues.reduce((sum, issue) => {
      const severityScores = { low: 0.1, medium: 0.3, high: 0.6, critical: 1.0 };
      return sum + severityScores[issue.severity];
    }, 0);

    const check: ConsistencyCheck = {
      id: `check-${Date.now()}`,
      timestamp: new Date(),
      passed: issues.length === 0,
      checks: {
        stateConsistency: issues.filter((i) => i.type === 'contradiction').length === 0,
        temporalConsistency: issues.filter((i) => i.type === 'drift').length === 0,
        causalConsistency: issues.filter((i) => i.type === 'gap').length === 0,
        entityConsistency: issues.filter((i) => i.type === 'orphan').length === 0,
      },
      issues,
      inconsistencyScore: Math.min(1, inconsistencyScore),
    };

    this.emit({ type: 'consistency_check', timestamp: new Date(), data: check });

    if (!check.passed) {
      this.emit({ type: 'consistency_violation', timestamp: new Date(), data: check });
    }

    return check;
  }

  /**
   * Run consistency check (called by timer)
   */
  private runConsistencyCheck(): void {
    const check = this.checkConsistency();

    // Auto-repair if enabled
    if (!check.passed && this.config.autoRepairEnabled) {
      this.autoRepair(check.issues);
    }
  }

  /**
   * Auto-repair consistency issues
   */
  private autoRepair(issues: ConsistencyIssue[]): void {
    for (const issue of issues) {
      switch (issue.type) {
        case 'orphan':
          // Remove orphan relations
          for (const entityId of issue.affectedEntities) {
            const entity = this.entities.get(entityId);
            if (entity) {
              entity.relations = entity.relations.filter(
                (r) => this.entities.has(r.target)
              );
            }
          }
          break;

        case 'drift':
          // Remove stale entities
          for (const entityId of issue.affectedEntities) {
            const entity = this.entities.get(entityId);
            if (entity && entity.confidence < 0.3) {
              this.removeEntity(entityId);
            }
          }
          break;
      }
    }
  }

  /**
   * Detect circular relations
   */
  private detectCircularRelations(): string[] {
    const visited = new Set<string>();
    const stack = new Set<string>();
    const circular: string[] = [];

    const dfs = (entityId: string): boolean => {
      if (stack.has(entityId)) {
        circular.push(entityId);
        return true;
      }
      if (visited.has(entityId)) return false;

      visited.add(entityId);
      stack.add(entityId);

      const entity = this.entities.get(entityId);
      if (entity) {
        for (const relation of entity.relations) {
          if (dfs(relation.target)) {
            circular.push(entityId);
          }
        }
      }

      stack.delete(entityId);
      return false;
    };

    for (const entityId of this.entities.keys()) {
      dfs(entityId);
    }

    return [...new Set(circular)];
  }

  // ============================================================================
  // Dream Mode
  // ============================================================================

  /**
   * Check if should dream
   */
  shouldDream(energy?: number): boolean {
    if (energy !== undefined && energy < this.dreamConfig.triggerThreshold) {
      return true;
    }

    if (this.pendingConsolidation.length >= this.dreamConfig.minPendingMemories) {
      return true;
    }

    return false;
  }

  /**
   * Run dream cycle
   */
  async dream(): Promise<DreamResult> {
    const startTime = new Date();

    this.emit({ type: 'dream_started', timestamp: startTime, data: {} });

    // Phase 1: Slow-wave replay
    const slowWaveResult = await this.slowWaveReplay();

    // Phase 2: REM abstraction
    const remResult = await this.remAbstraction();

    // Phase 3: Consolidation
    const consolidationResult = await this.consolidate();

    const endTime = new Date();

    const dreamResult: DreamResult = {
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      slowWaveReplay: slowWaveResult,
      remAbstraction: remResult,
      consolidation: consolidationResult,
      memoriesConsolidated: consolidationResult.strengthened,
      patternsExtracted: remResult.patternsFound.length,
      modelImproved: consolidationResult.newConnections > 0,
    };

    this.dreamHistory.push(dreamResult);
    if (this.dreamHistory.length > 100) {
      this.dreamHistory.shift();
    }

    // Clear pending consolidation
    this.pendingConsolidation = [];

    this.emit({ type: 'dream_complete', timestamp: endTime, data: dreamResult });

    return dreamResult;
  }

  /**
   * Slow-wave replay phase
   */
  private async slowWaveReplay(): Promise<SlowWaveResult> {
    // Simulate slow-wave sleep - replay recent experiences
    const experiences = this.pendingConsolidation.slice(-50);

    // Sort by confidence (strongest memories)
    experiences.sort((a, b) => b.confidence - a.confidence);

    const strongestMemories = experiences
      .slice(0, 10)
      .map((e) => e.sourceId);

    // Simulate replay time
    await this.sleep(Math.min(this.dreamConfig.slowWaveDuration, 1000));

    return {
      experiencesReplayed: experiences.length,
      strongestMemories,
      replayDuration: this.dreamConfig.slowWaveDuration,
    };
  }

  /**
   * REM abstraction phase
   */
  private async remAbstraction(): Promise<REMResult> {
    const patterns: Pattern[] = [];

    // Find sequence patterns
    const sequences = this.findSequencePatterns();
    patterns.push(...sequences);

    // Find structural patterns
    const structural = this.findStructuralPatterns();
    patterns.push(...structural);

    // Creative combinations (random associations)
    let creativeCombinations = 0;
    for (let i = 0; i < 5; i++) {
      if (this.pendingConsolidation.length >= 2) {
        const idx1 = Math.floor(Math.random() * this.pendingConsolidation.length);
        const idx2 = Math.floor(Math.random() * this.pendingConsolidation.length);
        if (idx1 !== idx2) {
          const fused = this.encoder.fuse([
            this.pendingConsolidation[idx1],
            this.pendingConsolidation[idx2],
          ]);
          creativeCombinations++;
        }
      }
    }

    // Simulate abstraction time
    await this.sleep(Math.min(this.dreamConfig.remDuration, 1000));

    return {
      patternsFound: patterns,
      abstractionLevel: patterns.length > 5 ? 0.8 : patterns.length * 0.15,
      creativeCombinations,
    };
  }

  /**
   * Find sequence patterns in pending consolidation
   */
  private findSequencePatterns(): Pattern[] {
    const patterns: Pattern[] = [];

    if (this.pendingConsolidation.length < 3) return patterns;

    // Look for similar consecutive states
    for (let i = 0; i < this.pendingConsolidation.length - 2; i++) {
      const sim1 = this.encoder.similarity(
        this.pendingConsolidation[i],
        this.pendingConsolidation[i + 1]
      );
      const sim2 = this.encoder.similarity(
        this.pendingConsolidation[i + 1],
        this.pendingConsolidation[i + 2]
      );

      if (sim1 > 0.7 && sim2 > 0.7) {
        patterns.push({
          id: `seq-${i}`,
          type: 'sequence',
          elements: [
            this.pendingConsolidation[i].sourceId,
            this.pendingConsolidation[i + 1].sourceId,
            this.pendingConsolidation[i + 2].sourceId,
          ],
          confidence: (sim1 + sim2) / 2,
          novelty: 0.5,
        });
      }
    }

    return patterns;
  }

  /**
   * Find structural patterns
   */
  private findStructuralPatterns(): Pattern[] {
    const patterns: Pattern[] = [];

    // Group by modality
    const modalityGroups = new Map<string, LatentState[]>();
    for (const state of this.pendingConsolidation) {
      const group = modalityGroups.get(state.sourceModality) || [];
      group.push(state);
      modalityGroups.set(state.sourceModality, group);
    }

    // Find patterns within modalities
    for (const [modality, states] of modalityGroups) {
      if (states.length >= 3) {
        patterns.push({
          id: `struct-${modality}`,
          type: 'structure',
          elements: states.slice(0, 5).map((s) => s.sourceId),
          confidence: 0.6,
          novelty: 0.4,
        });
      }
    }

    return patterns;
  }

  /**
   * Consolidation phase
   */
  private async consolidate(): Promise<ConsolidationResult> {
    let modelUpdates = 0;
    let pruned = 0;
    let strengthened = 0;
    let newConnections = 0;

    // Strengthen frequently occurring patterns
    for (const state of this.pendingConsolidation) {
      if (state.confidence > 0.7) {
        strengthened++;
      }
    }

    // Prune low-confidence states
    const beforeCount = this.entities.size;
    for (const [id, entity] of this.entities) {
      if (entity.confidence < 0.2) {
        const age = Date.now() - entity.lastUpdated.getTime();
        if (age > this.config.entityTTL / 2) {
          this.entities.delete(id);
          pruned++;
        }
      }
    }

    // Create new connections based on patterns
    const similarPairs = this.findSimilarStatePairs();
    for (const [s1, s2] of similarPairs) {
      newConnections++;
    }

    modelUpdates = strengthened + pruned + newConnections;

    // Simulate consolidation time
    await this.sleep(Math.min(this.dreamConfig.consolidationDuration, 500));

    return {
      modelUpdates,
      pruned,
      strengthened,
      newConnections,
    };
  }

  /**
   * Find similar state pairs
   */
  private findSimilarStatePairs(): Array<[LatentState, LatentState]> {
    const pairs: Array<[LatentState, LatentState]> = [];

    for (let i = 0; i < this.pendingConsolidation.length; i++) {
      for (let j = i + 1; j < this.pendingConsolidation.length; j++) {
        const sim = this.encoder.similarity(
          this.pendingConsolidation[i],
          this.pendingConsolidation[j]
        );
        if (sim > 0.8) {
          pairs.push([this.pendingConsolidation[i], this.pendingConsolidation[j]]);
        }
      }
    }

    return pairs.slice(0, 10); // Limit
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================================
  // Events
  // ============================================================================

  on(handler: WorldModelEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: WorldModelEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('World model event handler error:', err);
      }
    }
  }

  private setupEventForwarding(): void {
    // Forward encoder events
    this.encoder.on((event) => {
      if (event.type === 'encoded') {
        this.emit({
          type: 'entity_created',
          timestamp: new Date(),
          data: event.data,
        });
      }
    });

    // Forward predictor events
    this.predictor.on((event) => {
      if (event.type === 'prediction_made') {
        this.emit({
          type: 'state_predicted',
          timestamp: new Date(),
          data: event.data,
        });
      }
    });
  }

  // ============================================================================
  // Stats
  // ============================================================================

  stats(): {
    encoder: ReturnType<LatentEncoder['stats']>;
    decoder: ReturnType<LatentDecoder['stats']>;
    predictor: ReturnType<WorldModelPredictor['stats']>;
    twins: ReturnType<DigitalTwinManager['getOverallHealth']>;
    entities: number;
    relations: number;
    pendingConsolidation: number;
    dreamCount: number;
  } {
    return {
      encoder: this.encoder.stats(),
      decoder: this.decoder.stats(),
      predictor: this.predictor.stats(),
      twins: this.twinManager.getOverallHealth(),
      entities: this.entities.size,
      relations: this.relations.size,
      pendingConsolidation: this.pendingConsolidation.length,
      dreamCount: this.dreamHistory.length,
    };
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private mergeConfig(partial: Partial<WorldModelSystemConfig>): WorldModelSystemConfig {
    return {
      encoder: { ...DEFAULT_WORLD_MODEL_SYSTEM_CONFIG.encoder, ...partial.encoder },
      predictor: { ...DEFAULT_WORLD_MODEL_SYSTEM_CONFIG.predictor, ...partial.predictor },
      twin: { ...DEFAULT_WORLD_MODEL_SYSTEM_CONFIG.twin, ...partial.twin },
      dream: { ...DEFAULT_WORLD_MODEL_SYSTEM_CONFIG.dream, ...partial.dream },
      maxEntities: partial.maxEntities ?? DEFAULT_WORLD_MODEL_SYSTEM_CONFIG.maxEntities,
      entityTTL: partial.entityTTL ?? DEFAULT_WORLD_MODEL_SYSTEM_CONFIG.entityTTL,
      consistencyCheckEnabled: partial.consistencyCheckEnabled ?? DEFAULT_WORLD_MODEL_SYSTEM_CONFIG.consistencyCheckEnabled,
      autoRepairEnabled: partial.autoRepairEnabled ?? DEFAULT_WORLD_MODEL_SYSTEM_CONFIG.autoRepairEnabled,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createWorldModelSystem(
  config?: Partial<WorldModelSystemConfig>
): WorldModelSystem {
  return new WorldModelSystem(config);
}

// ============================================================================
// Singleton Instance (optional)
// ============================================================================

let worldModelInstance: WorldModelSystem | null = null;

export function getWorldModelSystem(
  config?: Partial<WorldModelSystemConfig>
): WorldModelSystem {
  if (!worldModelInstance) {
    worldModelInstance = createWorldModelSystem(config);
  }
  return worldModelInstance;
}

export function resetWorldModelSystem(): void {
  if (worldModelInstance) {
    worldModelInstance.stop();
    worldModelInstance = null;
  }
}
