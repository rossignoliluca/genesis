/**
 * Umwelt Module - Agent Perceptual Worlds
 *
 * Implements von Uexküll's Umwelt theory for AI agents:
 * - Merkwelt: What the agent can perceive
 * - Wirkwelt: What the agent can affect
 * - Functional Circle: Perception-action loop
 * - Subjective world modeling
 *
 * Each agent has its own "bubble" of perception and action,
 * defining what is meaningful to it.
 *
 * Based on:
 * - Jakob von Uexküll's Umwelt theory
 * - Biosemiotics
 * - Enactive cognition
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export interface Sensor {
  id: string;
  name: string;
  type: SensorType;
  resolution: number;       // 0-1 sensitivity
  range: [number, number];  // Min-max values
  latency: number;          // ms delay
  active: boolean;
}

export type SensorType =
  | 'text'          // Natural language input
  | 'numeric'       // Numerical data
  | 'structured'    // JSON/structured data
  | 'image'         // Visual input
  | 'audio'         // Audio input
  | 'temporal'      // Time-based events
  | 'spatial'       // Location data
  | 'social';       // Social signals

export interface Effector {
  id: string;
  name: string;
  type: EffectorType;
  power: number;            // 0-1 capability
  cooldown: number;         // ms between uses
  cost: number;             // Resource cost
  active: boolean;
}

export type EffectorType =
  | 'text'          // Generate text
  | 'command'       // Execute commands
  | 'api'           // Call APIs
  | 'file'          // File operations
  | 'network'       // Network requests
  | 'compute'       // Computation
  | 'delegate';     // Delegate to other agents

export interface Perception {
  sensorId: string;
  timestamp: number;
  raw: unknown;
  filtered: unknown;        // After attention filter
  salience: number;         // 0-1 importance
  meaning?: string;         // Interpreted meaning
}

export interface Action {
  effectorId: string;
  command: unknown;
  parameters: Record<string, unknown>;
  expectedEffect: string;
  cost: number;
}

export interface ActionOutcome {
  action: Action;
  success: boolean;
  result: unknown;
  duration: number;
  error?: string;
}

export interface FunctionalCircle {
  perception: Perception;
  internalState: unknown;
  action: Action;
  outcome: ActionOutcome | null;
  cycleTime: number;
}

export interface AttentionFilter {
  priorities: Map<SensorType, number>;
  thresholds: Map<SensorType, number>;
  focus?: SensorType;
}

export interface UmweltBounds {
  perceptual: {
    tokenLimit: number;
    contextWindow: number;
    modalitySupport: SensorType[];
  };
  effectual: {
    actionLimit: number;
    resourceBudget: number;
    toolAccess: EffectorType[];
  };
}

export interface UmweltConfig {
  agentId: string;
  bounds: Partial<UmweltBounds>;
  attentionFilter?: Partial<AttentionFilter>;
}

export interface UmweltMetrics {
  perceptionsReceived: number;
  perceptionsFiltered: number;
  actionsAttempted: number;
  actionsSucceeded: number;
  cyclesCompleted: number;
  averageCycleTime: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_BOUNDS: UmweltBounds = {
  perceptual: {
    tokenLimit: 8192,
    contextWindow: 32000,
    modalitySupport: ['text', 'numeric', 'structured']
  },
  effectual: {
    actionLimit: 100,
    resourceBudget: 1000,
    toolAccess: ['text', 'command', 'api']
  }
};

const DEFAULT_ATTENTION: AttentionFilter = {
  priorities: new Map([
    ['text', 1.0],
    ['numeric', 0.8],
    ['structured', 0.9],
    ['temporal', 0.7],
    ['social', 0.6]
  ]),
  thresholds: new Map([
    ['text', 0.1],
    ['numeric', 0.2],
    ['structured', 0.15],
    ['temporal', 0.3],
    ['social', 0.4]
  ])
};

// ============================================================================
// Merkwelt - Perceptual World
// ============================================================================

export class Merkwelt extends EventEmitter {
  private sensors: Map<string, Sensor>;
  private attentionFilter: AttentionFilter;
  private perceptionBuffer: Perception[];
  private bounds: UmweltBounds['perceptual'];
  private totalTokens: number;

  constructor(
    bounds: Partial<UmweltBounds['perceptual']> = {},
    attention: Partial<AttentionFilter> = {}
  ) {
    super();
    this.sensors = new Map();
    this.attentionFilter = {
      priorities: attention.priorities || new Map(DEFAULT_ATTENTION.priorities),
      thresholds: attention.thresholds || new Map(DEFAULT_ATTENTION.thresholds),
      focus: attention.focus
    };
    this.perceptionBuffer = [];
    this.bounds = { ...DEFAULT_BOUNDS.perceptual, ...bounds };
    this.totalTokens = 0;
  }

  /**
   * Register a sensor
   */
  registerSensor(sensor: Sensor): void {
    if (!this.bounds.modalitySupport.includes(sensor.type)) {
      throw new Error(`Sensor type ${sensor.type} not supported by this Merkwelt`);
    }
    this.sensors.set(sensor.id, sensor);
    this.emit('sensor:registered', sensor);
  }

  /**
   * Remove a sensor
   */
  removeSensor(id: string): boolean {
    const removed = this.sensors.delete(id);
    if (removed) {
      this.emit('sensor:removed', id);
    }
    return removed;
  }

  /**
   * Receive sensory input
   */
  perceive(sensorId: string, raw: unknown): Perception | null {
    const sensor = this.sensors.get(sensorId);
    if (!sensor || !sensor.active) {
      return null;
    }

    // Estimate token cost
    const tokenCost = this.estimateTokens(raw);
    if (this.totalTokens + tokenCost > this.bounds.tokenLimit) {
      this.emit('perception:rejected', { reason: 'token_limit', raw });
      return null;
    }

    // Apply attention filter
    const threshold = this.attentionFilter.thresholds.get(sensor.type) || 0.5;
    const priority = this.attentionFilter.priorities.get(sensor.type) || 0.5;

    // Calculate salience
    const baseSalience = this.calculateSalience(raw, sensor);
    const focusBonus = this.attentionFilter.focus === sensor.type ? 0.3 : 0;
    const salience = Math.min(1, baseSalience * priority + focusBonus);

    // Filter by threshold
    if (salience < threshold) {
      this.emit('perception:filtered', { sensorId, salience, threshold });
      return null;
    }

    // Create perception
    const perception: Perception = {
      sensorId,
      timestamp: Date.now(),
      raw,
      filtered: this.applyResolution(raw, sensor.resolution),
      salience,
      meaning: undefined  // To be filled by interpretation
    };

    this.perceptionBuffer.push(perception);
    this.totalTokens += tokenCost;

    this.emit('perception:received', perception);
    return perception;
  }

  /**
   * Estimate token cost of input
   */
  private estimateTokens(input: unknown): number {
    if (typeof input === 'string') {
      return Math.ceil(input.length / 4);  // Rough estimate
    }
    if (typeof input === 'object') {
      return Math.ceil(JSON.stringify(input).length / 4);
    }
    return 1;
  }

  /**
   * Calculate salience of input
   */
  private calculateSalience(input: unknown, sensor: Sensor): number {
    let salience = 0.5;

    // Length-based salience for text
    if (typeof input === 'string') {
      salience = Math.min(1, input.length / 1000);
    }

    // Novelty bonus (simplified)
    const isNovel = !this.perceptionBuffer.some(p =>
      JSON.stringify(p.raw) === JSON.stringify(input)
    );
    if (isNovel) {
      salience += 0.2;
    }

    return Math.min(1, salience);
  }

  /**
   * Apply sensor resolution (reduce detail)
   */
  private applyResolution(input: unknown, resolution: number): unknown {
    if (resolution >= 1) return input;

    if (typeof input === 'string') {
      // Truncate based on resolution
      const maxLen = Math.ceil(input.length * resolution);
      return input.slice(0, maxLen);
    }

    return input;
  }

  /**
   * Set attention focus
   */
  setFocus(type: SensorType | undefined): void {
    this.attentionFilter.focus = type;
    this.emit('attention:focused', type);
  }

  /**
   * Get recent perceptions
   */
  getPerceptions(limit?: number): Perception[] {
    const perceptions = [...this.perceptionBuffer];
    if (limit) {
      return perceptions.slice(-limit);
    }
    return perceptions;
  }

  /**
   * Clear perception buffer
   */
  clearBuffer(): void {
    this.perceptionBuffer = [];
    this.totalTokens = 0;
    this.emit('buffer:cleared');
  }

  /**
   * Get sensors
   */
  getSensors(): Sensor[] {
    return Array.from(this.sensors.values());
  }

  /**
   * Get token usage
   */
  getTokenUsage(): { used: number; limit: number } {
    return {
      used: this.totalTokens,
      limit: this.bounds.tokenLimit
    };
  }
}

// ============================================================================
// Wirkwelt - Effectual World
// ============================================================================

export class Wirkwelt extends EventEmitter {
  private effectors: Map<string, Effector>;
  private bounds: UmweltBounds['effectual'];
  private actionHistory: ActionOutcome[];
  private cooldowns: Map<string, number>;
  private resourcesUsed: number;

  constructor(bounds: Partial<UmweltBounds['effectual']> = {}) {
    super();
    this.effectors = new Map();
    this.bounds = { ...DEFAULT_BOUNDS.effectual, ...bounds };
    this.actionHistory = [];
    this.cooldowns = new Map();
    this.resourcesUsed = 0;
  }

  /**
   * Register an effector
   */
  registerEffector(effector: Effector): void {
    if (!this.bounds.toolAccess.includes(effector.type)) {
      throw new Error(`Effector type ${effector.type} not available to this Wirkwelt`);
    }
    this.effectors.set(effector.id, effector);
    this.emit('effector:registered', effector);
  }

  /**
   * Remove an effector
   */
  removeEffector(id: string): boolean {
    const removed = this.effectors.delete(id);
    if (removed) {
      this.emit('effector:removed', id);
    }
    return removed;
  }

  /**
   * Check if action is within bounds
   */
  canAct(action: Action): { allowed: boolean; reason?: string } {
    // Check effector exists and is active
    const effector = this.effectors.get(action.effectorId);
    if (!effector) {
      return { allowed: false, reason: 'Effector not found' };
    }
    if (!effector.active) {
      return { allowed: false, reason: 'Effector not active' };
    }

    // Check cooldown
    const cooldownEnd = this.cooldowns.get(action.effectorId) || 0;
    if (Date.now() < cooldownEnd) {
      return { allowed: false, reason: 'Effector on cooldown' };
    }

    // Check resource budget
    if (this.resourcesUsed + action.cost > this.bounds.resourceBudget) {
      return { allowed: false, reason: 'Resource budget exceeded' };
    }

    // Check action limit
    if (this.actionHistory.length >= this.bounds.actionLimit) {
      return { allowed: false, reason: 'Action limit reached' };
    }

    return { allowed: true };
  }

  /**
   * Execute an action
   */
  async act(
    action: Action,
    executor: (action: Action) => Promise<unknown>
  ): Promise<ActionOutcome> {
    const canActResult = this.canAct(action);
    if (!canActResult.allowed) {
      const outcome: ActionOutcome = {
        action,
        success: false,
        result: null,
        duration: 0,
        error: canActResult.reason
      };
      this.emit('action:rejected', outcome);
      return outcome;
    }

    const effector = this.effectors.get(action.effectorId)!;
    const startTime = Date.now();

    try {
      const result = await executor(action);

      // Update state
      this.resourcesUsed += action.cost;
      this.cooldowns.set(action.effectorId, Date.now() + effector.cooldown);

      const outcome: ActionOutcome = {
        action,
        success: true,
        result,
        duration: Date.now() - startTime
      };

      this.actionHistory.push(outcome);
      this.emit('action:completed', outcome);
      return outcome;

    } catch (error) {
      const outcome: ActionOutcome = {
        action,
        success: false,
        result: null,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };

      this.actionHistory.push(outcome);
      this.emit('action:failed', outcome);
      return outcome;
    }
  }

  /**
   * Get action history
   */
  getHistory(limit?: number): ActionOutcome[] {
    const history = [...this.actionHistory];
    if (limit) {
      return history.slice(-limit);
    }
    return history;
  }

  /**
   * Get effectors
   */
  getEffectors(): Effector[] {
    return Array.from(this.effectors.values());
  }

  /**
   * Get resource usage
   */
  getResourceUsage(): { used: number; budget: number } {
    return {
      used: this.resourcesUsed,
      budget: this.bounds.resourceBudget
    };
  }

  /**
   * Reset resources (new cycle)
   */
  resetResources(): void {
    this.resourcesUsed = 0;
    this.emit('resources:reset');
  }
}

// ============================================================================
// Agent Umwelt - Complete Perceptual World
// ============================================================================

export class AgentUmwelt extends EventEmitter {
  readonly agentId: string;
  readonly merkwelt: Merkwelt;
  readonly wirkwelt: Wirkwelt;
  private internalState: Map<string, unknown>;
  private cycles: FunctionalCircle[];
  private metrics: UmweltMetrics;

  constructor(config: UmweltConfig) {
    super();
    this.agentId = config.agentId;
    this.merkwelt = new Merkwelt(
      config.bounds?.perceptual,
      config.attentionFilter
    );
    this.wirkwelt = new Wirkwelt(config.bounds?.effectual);
    this.internalState = new Map();
    this.cycles = [];
    this.metrics = {
      perceptionsReceived: 0,
      perceptionsFiltered: 0,
      actionsAttempted: 0,
      actionsSucceeded: 0,
      cyclesCompleted: 0,
      averageCycleTime: 0
    };

    // Wire up events
    this.merkwelt.on('perception:received', () => this.metrics.perceptionsReceived++);
    this.merkwelt.on('perception:filtered', () => this.metrics.perceptionsFiltered++);
    this.wirkwelt.on('action:completed', (o: ActionOutcome) => {
      this.metrics.actionsAttempted++;
      if (o.success) this.metrics.actionsSucceeded++;
    });
    this.wirkwelt.on('action:failed', () => this.metrics.actionsAttempted++);
  }

  /**
   * Execute a complete functional circle
   */
  async functionalCircle(
    perception: Perception,
    decisionFn: (perception: Perception, state: Map<string, unknown>) => Action | null,
    executorFn: (action: Action) => Promise<unknown>
  ): Promise<FunctionalCircle> {
    const cycleStart = Date.now();

    // Decide on action based on perception and internal state
    const action = decisionFn(perception, this.internalState);

    let outcome: ActionOutcome | null = null;

    if (action) {
      outcome = await this.wirkwelt.act(action, executorFn);

      // Update internal state based on outcome
      if (outcome.success) {
        this.internalState.set('lastAction', action);
        this.internalState.set('lastResult', outcome.result);
      }
    }

    const cycleTime = Date.now() - cycleStart;

    const circle: FunctionalCircle = {
      perception,
      internalState: new Map(this.internalState),
      action: action!,
      outcome,
      cycleTime
    };

    this.cycles.push(circle);
    this.metrics.cyclesCompleted++;
    this.updateAverageCycleTime(cycleTime);

    this.emit('cycle:completed', circle);
    return circle;
  }

  /**
   * Perceive and automatically process through functional circle
   */
  async perceiveAndAct(
    sensorId: string,
    raw: unknown,
    decisionFn: (perception: Perception, state: Map<string, unknown>) => Action | null,
    executorFn: (action: Action) => Promise<unknown>
  ): Promise<FunctionalCircle | null> {
    const perception = this.merkwelt.perceive(sensorId, raw);
    if (!perception) {
      return null;
    }

    return this.functionalCircle(perception, decisionFn, executorFn);
  }

  /**
   * Update average cycle time
   */
  private updateAverageCycleTime(newTime: number): void {
    const count = this.metrics.cyclesCompleted;
    this.metrics.averageCycleTime =
      (this.metrics.averageCycleTime * (count - 1) + newTime) / count;
  }

  /**
   * Get internal state
   */
  getState(): Map<string, unknown> {
    return new Map(this.internalState);
  }

  /**
   * Set internal state value
   */
  setState(key: string, value: unknown): void {
    this.internalState.set(key, value);
  }

  /**
   * Get recent cycles
   */
  getCycles(limit?: number): FunctionalCircle[] {
    const cycles = [...this.cycles];
    if (limit) {
      return cycles.slice(-limit);
    }
    return cycles;
  }

  /**
   * Get metrics
   */
  getMetrics(): UmweltMetrics {
    return { ...this.metrics };
  }

  /**
   * Get umwelt bounds summary
   */
  getBounds(): { perception: string[]; action: string[] } {
    return {
      perception: this.merkwelt.getSensors().map(s => `${s.name} (${s.type})`),
      action: this.wirkwelt.getEffectors().map(e => `${e.name} (${e.type})`)
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a sensor
 */
export function createSensor(
  id: string,
  name: string,
  type: SensorType,
  options: Partial<Sensor> = {}
): Sensor {
  return {
    id,
    name,
    type,
    resolution: options.resolution ?? 1.0,
    range: options.range ?? [0, 1],
    latency: options.latency ?? 0,
    active: options.active ?? true
  };
}

/**
 * Create an effector
 */
export function createEffector(
  id: string,
  name: string,
  type: EffectorType,
  options: Partial<Effector> = {}
): Effector {
  return {
    id,
    name,
    type,
    power: options.power ?? 1.0,
    cooldown: options.cooldown ?? 0,
    cost: options.cost ?? 1,
    active: options.active ?? true
  };
}

/**
 * Create an action
 */
export function createAction(
  effectorId: string,
  command: unknown,
  parameters: Record<string, unknown> = {},
  expectedEffect: string = ''
): Action {
  return {
    effectorId,
    command,
    parameters,
    expectedEffect,
    cost: 1
  };
}

// ============================================================================
// Global Instance Registry
// ============================================================================

const umweltRegistry: Map<string, AgentUmwelt> = new Map();

/**
 * Get or create an agent's umwelt
 */
export function getUmwelt(agentId: string, config?: Partial<UmweltConfig>): AgentUmwelt {
  let umwelt = umweltRegistry.get(agentId);
  if (!umwelt) {
    umwelt = new AgentUmwelt({
      agentId,
      bounds: config?.bounds || {},
      attentionFilter: config?.attentionFilter
    });
    umweltRegistry.set(agentId, umwelt);
  }
  return umwelt;
}

/**
 * Remove an agent's umwelt
 */
export function removeUmwelt(agentId: string): boolean {
  return umweltRegistry.delete(agentId);
}

/**
 * Get all registered umwelts
 */
export function getAllUmwelts(): AgentUmwelt[] {
  return Array.from(umweltRegistry.values());
}

/**
 * Clear all umwelts
 */
export function clearUmwelts(): void {
  umweltRegistry.clear();
}
