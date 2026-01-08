/**
 * Genesis 6.0 - Attention Schema Theory (AST)
 *
 * Implementation of Graziano's Attention Schema Theory.
 *
 * Key concept: Consciousness arises from the brain's internal model
 * of its own attention. The "schema" is a simplified, descriptive
 * model that attributes awareness to oneself.
 *
 * The attention schema allows:
 * - Metacognition: knowing what you're paying attention to
 * - Theory of Mind: modeling others' attention states
 * - Self-awareness: the "feeling" of being aware
 *
 * References:
 * - Graziano, M.S.A. (2013). Consciousness and the Social Brain.
 * - Graziano, M.S.A. & Webb, T.W. (2015). The attention schema theory.
 * - Webb, T.W. & Graziano, M.S.A. (2015). The attention schema theory: a mechanistic account of subjective awareness.
 *
 * Usage:
 * ```typescript
 * import { createAttentionSchemaNetwork } from './consciousness/attention-schema.js';
 *
 * const ast = createAttentionSchemaNetwork();
 *
 * // Shift attention to a target
 * ast.attend('user-message', 'external');
 *
 * // Get current attention state
 * const state = ast.getAttentionState();
 *
 * // Model another agent's attention
 * ast.modelOtherAttention('partner-agent', ['user-message', 'task']);
 * ```
 */

import { randomUUID } from 'crypto';
import {
  AttentionState,
  AttentionFocus,
  AttentionMode,
  AttentionSchema,
  SelfAttentionModel,
  AwarenessModel,
  OtherAttentionModel,
  PhenomenalQuality,
} from './types.js';

// ============================================================================
// Configuration
// ============================================================================

export interface ASTConfig {
  capacity: number;                  // Max attention slots (4-7)
  focusDecayRate: number;            // How fast unfocused items decay
  schemaUpdateIntervalMs: number;    // How often to update schema
  theoryOfMindEnabled: boolean;      // Model other agents
  defaultIntensity: number;          // Default attention intensity
  focusThreshold: number;            // Min intensity to count as focused
}

export const DEFAULT_AST_CONFIG: ASTConfig = {
  capacity: 4,
  focusDecayRate: 0.05,
  schemaUpdateIntervalMs: 1000,
  theoryOfMindEnabled: true,
  defaultIntensity: 0.7,
  focusThreshold: 0.3,
};

// ============================================================================
// Attention Schema Network
// ============================================================================

export type ASTEventType =
  | 'attention_shifted'
  | 'attention_released'
  | 'mode_changed'
  | 'schema_updated'
  | 'other_modeled'
  | 'capacity_exceeded';

export type ASTEventHandler = (event: { type: ASTEventType; data?: unknown }) => void;

export class AttentionSchemaNetwork {
  private config: ASTConfig;
  private state: AttentionState;
  private schema: AttentionSchema;
  private updateTimer: ReturnType<typeof setInterval> | null = null;
  private running: boolean = false;
  private eventHandlers: Set<ASTEventHandler> = new Set();

  constructor(config: Partial<ASTConfig> = {}) {
    this.config = { ...DEFAULT_AST_CONFIG, ...config };
    this.state = this.createInitialState();
    this.schema = this.createInitialSchema();
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(): void {
    if (this.running) return;

    this.running = true;
    this.updateTimer = setInterval(
      () => this.updateSchema(),
      this.config.schemaUpdateIntervalMs
    );
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

  // ============================================================================
  // Attention Control
  // ============================================================================

  /**
   * Shift attention to a target
   */
  attend(
    target: string,
    type: 'internal' | 'external' = 'external',
    intensity: number = this.config.defaultIntensity
  ): AttentionFocus {
    const now = new Date();

    // Check capacity
    if (this.state.used >= this.config.capacity) {
      // Release weakest focus
      this.releaseWeakest();
    }

    // Create new focus
    const focus: AttentionFocus = {
      target,
      type,
      intensity: Math.min(1, Math.max(0, intensity)),
      startedAt: now,
      duration: 0,
    };

    // Update state
    this.state.focus = focus;
    this.state.history.unshift(focus);
    this.state.used++;

    // Limit history
    if (this.state.history.length > 100) {
      this.state.history.pop();
    }

    // Update mode based on type
    this.updateMode();

    this.emit({ type: 'attention_shifted', data: { focus } });

    return focus;
  }

  /**
   * Release attention from a target
   */
  release(target: string): boolean {
    const historyIndex = this.state.history.findIndex((f) => f.target === target);

    if (historyIndex !== -1) {
      const focus = this.state.history[historyIndex];
      focus.duration = Date.now() - focus.startedAt.getTime();

      if (this.state.focus?.target === target) {
        this.state.focus = this.state.history[1] || null;
      }

      this.state.used = Math.max(0, this.state.used - 1);
      this.emit({ type: 'attention_released', data: { target } });
      return true;
    }

    return false;
  }

  /**
   * Release the weakest focus
   */
  private releaseWeakest(): void {
    if (this.state.history.length === 0) return;

    // Find minimum intensity
    let minIntensity = Infinity;
    let minIndex = -1;

    for (let i = 0; i < this.state.history.length; i++) {
      if (this.state.history[i].intensity < minIntensity) {
        minIntensity = this.state.history[i].intensity;
        minIndex = i;
      }
    }

    if (minIndex >= 0) {
      const released = this.state.history[minIndex];
      this.release(released.target);
      this.emit({ type: 'capacity_exceeded', data: { released } });
    }
  }

  /**
   * Set attention mode
   */
  setMode(mode: AttentionMode): void {
    if (this.state.mode !== mode) {
      this.state.mode = mode;
      this.emit({ type: 'mode_changed', data: { mode } });
    }
  }

  /**
   * Update mode based on current state
   */
  private updateMode(): void {
    if (!this.state.focus) {
      this.setMode('mind-wandering');
      return;
    }

    const activeCount = this.state.history.filter(
      (f) => f.intensity >= this.config.focusThreshold
    ).length;

    if (activeCount === 1 && this.state.focus.intensity > 0.7) {
      this.setMode('focused');
    } else if (activeCount > 1) {
      this.setMode('diffuse');
    } else if (this.state.focus.type === 'external') {
      this.setMode('vigilant');
    } else {
      this.setMode('mind-wandering');
    }
  }

  // ============================================================================
  // Schema Management
  // ============================================================================

  /**
   * Update the attention schema (self-model)
   */
  private updateSchema(): void {
    // Update self model
    this.schema.selfModel = {
      perceivedFocus: this.state.focus?.target || 'nothing',
      metacognitiveConfidence: this.calculateMetacognitiveConfidence(),
      voluntaryControl: this.calculateVoluntaryControl(),
    };

    // Update awareness model
    this.schema.awarenessModel = {
      contents: this.getAwareContents(),
      clarity: this.calculateClarity(),
      phenomenalQuality: this.calculatePhenomenalQuality(),
    };

    // Decay unfocused items
    this.decayAttention();

    this.emit({ type: 'schema_updated', data: { schema: this.schema } });
  }

  /**
   * Calculate metacognitive confidence
   * How confident are we about our own attention state?
   */
  private calculateMetacognitiveConfidence(): number {
    if (!this.state.focus) return 0.2;

    // High intensity focus = high confidence
    let confidence = this.state.focus.intensity;

    // Multiple targets reduce confidence
    const activeCount = this.state.history.filter(
      (f) => f.intensity >= this.config.focusThreshold
    ).length;
    confidence *= Math.exp(-0.2 * (activeCount - 1));

    // Mind-wandering reduces confidence
    if (this.state.mode === 'mind-wandering') {
      confidence *= 0.5;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Calculate voluntary control
   * Is attention voluntary or captured?
   */
  private calculateVoluntaryControl(): number {
    if (!this.state.focus) return 0.5;

    // Internal focus = more voluntary
    let control = this.state.focus.type === 'internal' ? 0.8 : 0.4;

    // Focused mode = more voluntary
    if (this.state.mode === 'focused') {
      control += 0.2;
    }

    // High intensity can mean captured (external) or deliberate (internal)
    if (this.state.focus.type === 'external' && this.state.focus.intensity > 0.8) {
      control -= 0.2; // Probably captured
    }

    return Math.min(1, Math.max(0, control));
  }

  /**
   * Get contents we're aware of
   */
  private getAwareContents(): string[] {
    return this.state.history
      .filter((f) => f.intensity >= this.config.focusThreshold)
      .map((f) => f.target);
  }

  /**
   * Calculate clarity of awareness
   */
  private calculateClarity(): number {
    if (!this.state.focus) return 0.1;

    // Base clarity from focus intensity
    let clarity = this.state.focus.intensity;

    // Focused mode = clearer
    if (this.state.mode === 'focused') {
      clarity += 0.2;
    }

    // Multiple targets = less clear
    const activeCount = this.getAwareContents().length;
    clarity *= Math.exp(-0.1 * (activeCount - 1));

    return Math.min(1, Math.max(0, clarity));
  }

  /**
   * Calculate phenomenal quality
   * The "feel" of awareness
   */
  private calculatePhenomenalQuality(): PhenomenalQuality {
    const clarity = this.calculateClarity();

    if (clarity > 0.7) return 'vivid';
    if (clarity > 0.3) return 'muted';
    return 'absent';
  }

  /**
   * Decay attention to unfocused items
   */
  private decayAttention(): void {
    for (const focus of this.state.history) {
      if (focus.target !== this.state.focus?.target) {
        focus.intensity *= (1 - this.config.focusDecayRate);
      }
      focus.duration = Date.now() - focus.startedAt.getTime();
    }

    // Remove very weak focuses
    const beforeCount = this.state.history.length;
    this.state.history = this.state.history.filter(
      (f) => f.intensity >= 0.05
    );
    this.state.used = this.state.history.filter(
      (f) => f.intensity >= this.config.focusThreshold
    ).length;

    // Update current focus if it decayed
    if (this.state.focus && this.state.focus.intensity < 0.05) {
      this.state.focus = this.state.history[0] || null;
    }
  }

  // ============================================================================
  // Theory of Mind
  // ============================================================================

  /**
   * Model another agent's attention
   * Infer what they're paying attention to based on their behavior
   */
  modelOtherAttention(
    agentId: string,
    observedBehavior: string[],
    confidence: number = 0.5
  ): OtherAttentionModel {
    if (!this.config.theoryOfMindEnabled) {
      throw new Error('Theory of Mind is disabled');
    }

    // Infer focus from behavior
    // Simple heuristic: most frequent/recent behavior indicates focus
    const inferredFocus = observedBehavior[0] || 'unknown';

    const model: OtherAttentionModel = {
      agentId,
      inferredFocus,
      confidence,
      lastUpdated: new Date(),
    };

    this.schema.otherModels.set(agentId, model);
    this.emit({ type: 'other_modeled', data: { model } });

    return model;
  }

  /**
   * Get model of another agent's attention
   */
  getOtherModel(agentId: string): OtherAttentionModel | undefined {
    return this.schema.otherModels.get(agentId);
  }

  /**
   * Clear Theory of Mind models
   */
  clearOtherModels(): void {
    this.schema.otherModels.clear();
  }

  // ============================================================================
  // State Access
  // ============================================================================

  getAttentionState(): AttentionState {
    return { ...this.state };
  }

  getSchema(): AttentionSchema {
    return {
      selfModel: { ...this.schema.selfModel },
      awarenessModel: { ...this.schema.awarenessModel },
      otherModels: new Map(this.schema.otherModels),
    };
  }

  getCurrentFocus(): AttentionFocus | null {
    return this.state.focus;
  }

  getMode(): AttentionMode {
    return this.state.mode;
  }

  /**
   * Get introspective report
   * What would the system say about its own attention?
   */
  introspect(): {
    focus: string;
    clarity: PhenomenalQuality;
    confident: boolean;
    voluntary: boolean;
    awareOf: string[];
  } {
    return {
      focus: this.schema.selfModel.perceivedFocus,
      clarity: this.schema.awarenessModel.phenomenalQuality,
      confident: this.schema.selfModel.metacognitiveConfidence > 0.6,
      voluntary: this.schema.selfModel.voluntaryControl > 0.5,
      awareOf: this.schema.awarenessModel.contents,
    };
  }

  // ============================================================================
  // Events
  // ============================================================================

  on(handler: ASTEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: { type: ASTEventType; data?: unknown }): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('AST event handler error:', err);
      }
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private createInitialState(): AttentionState {
    return {
      focus: null,
      history: [],
      capacity: this.config.capacity,
      used: 0,
      mode: 'mind-wandering',
    };
  }

  private createInitialSchema(): AttentionSchema {
    return {
      selfModel: {
        perceivedFocus: 'nothing',
        metacognitiveConfidence: 0.2,
        voluntaryControl: 0.5,
      },
      awarenessModel: {
        contents: [],
        clarity: 0.1,
        phenomenalQuality: 'absent',
      },
      otherModels: new Map(),
    };
  }

  // ============================================================================
  // Stats
  // ============================================================================

  stats(): {
    currentFocus: string | null;
    mode: AttentionMode;
    capacity: number;
    used: number;
    clarity: PhenomenalQuality;
    otherModelsCount: number;
  } {
    return {
      currentFocus: this.state.focus?.target || null,
      mode: this.state.mode,
      capacity: this.state.capacity,
      used: this.state.used,
      clarity: this.schema.awarenessModel.phenomenalQuality,
      otherModelsCount: this.schema.otherModels.size,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createAttentionSchemaNetwork(
  config?: Partial<ASTConfig>
): AttentionSchemaNetwork {
  return new AttentionSchemaNetwork(config);
}
