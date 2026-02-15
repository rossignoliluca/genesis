/**
 * Morphogenetic Module - Bio-inspired Self-Repair
 *
 * Implements Michael Levin's morphogenetic principles:
 * - Target morphology (desired functional shape)
 * - Bioelectric-inspired error signals
 * - Cellular automata for collective repair
 * - Self-correcting agent colonies
 *
 * Agents know their target state and work collectively
 * to achieve and maintain it, like cells in a regenerating organism.
 *
 * Based on:
 * - Michael Levin's bioelectric research
 * - Neural Cellular Automata (NCA)
 * - Morphogenetic fields
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export interface Capability {
  id: string;
  name: string;
  level: number;           // 0-1 current capability level
  required: number;        // 0-1 required level for target morphology
  dependencies: string[];  // Other capabilities this depends on
}

export interface AgentMorphology {
  capabilities: Map<string, Capability>;
  connections: Map<string, string[]>;  // Agent -> connected agents
  position: number[];                   // Position in capability space
  health: number;                       // 0-1 overall health
}

export interface TargetMorphology {
  requiredCapabilities: Map<string, number>;  // capability id -> required level
  minHealth: number;
  optimalConnections: number;
  description: string;
}

export interface MorphogeneticError {
  type: 'missing' | 'degraded' | 'disconnected' | 'excess';
  capability?: string;
  magnitude: number;
  priority: number;
}

export interface RepairAction {
  type: 'regenerate' | 'strengthen' | 'connect' | 'prune';
  target: string;
  parameters: Record<string, unknown>;
  estimatedCost: number;
  estimatedTime: number;
}

export interface CellState {
  id: string;
  type: CellType;
  potential: number;       // -1 to 1 (bioelectric potential)
  neighbors: string[];
  alive: boolean;
  age: number;
}

export type CellType =
  | 'stem'         // Can differentiate into any type
  | 'sensor'       // Perceives environment
  | 'processor'    // Computes
  | 'effector'     // Acts
  | 'memory'       // Stores
  | 'communicator';// Coordinates

export interface MorphogeneticConfig {
  // Error detection
  errorThreshold: number;
  degradationRate: number;

  // Repair
  regenerationRate: number;
  healingCost: number;

  // Cellular automata
  gridSize: number;
  updateInterval: number;

  // Collective
  minQuorum: number;
  consensusThreshold: number;
}

export interface MorphogeneticMetrics {
  totalErrors: number;
  repairsAttempted: number;
  repairsSucceeded: number;
  regenerations: number;
  currentHealth: number;
  morphogeneticDistance: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: MorphogeneticConfig = {
  errorThreshold: 0.3,
  degradationRate: 0.01,
  regenerationRate: 0.1,
  healingCost: 10,
  gridSize: 10,
  updateInterval: 100,
  minQuorum: 3,
  consensusThreshold: 0.7
};

// ============================================================================
// Morphogenetic Agent
// ============================================================================

export class MorphogeneticAgent extends EventEmitter {
  readonly id: string;
  private morphology: AgentMorphology;
  private targetMorphology: TargetMorphology;
  private config: MorphogeneticConfig;
  private errors: MorphogeneticError[];
  private metrics: MorphogeneticMetrics;

  constructor(
    id: string,
    targetMorphology: TargetMorphology,
    config: Partial<MorphogeneticConfig> = {}
  ) {
    super();
    this.id = id;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.targetMorphology = targetMorphology;
    this.morphology = this.initializeMorphology();
    this.errors = [];
    this.metrics = {
      totalErrors: 0,
      repairsAttempted: 0,
      repairsSucceeded: 0,
      regenerations: 0,
      currentHealth: 1.0,
      morphogeneticDistance: 0
    };
  }

  /**
   * Initialize morphology from target
   */
  private initializeMorphology(): AgentMorphology {
    const capabilities = new Map<string, Capability>();

    for (const [id, required] of this.targetMorphology.requiredCapabilities) {
      capabilities.set(id, {
        id,
        name: id,
        level: 0,  // Start at 0, will be built up
        required,
        dependencies: []
      });
    }

    return {
      capabilities,
      connections: new Map(),
      position: [],
      health: 0.5
    };
  }

  /**
   * Calculate morphogenetic error
   * Returns distance from current state to target morphology
   */
  morphogeneticError(): number {
    let totalError = 0;
    let count = 0;

    for (const [id, required] of this.targetMorphology.requiredCapabilities) {
      const capability = this.morphology.capabilities.get(id);
      const current = capability?.level || 0;
      totalError += Math.abs(required - current);
      count++;
    }

    // Add health penalty
    const healthPenalty = Math.max(0, this.targetMorphology.minHealth - this.morphology.health);
    totalError += healthPenalty;

    const error = count > 0 ? totalError / (count + 1) : 0;
    this.metrics.morphogeneticDistance = error;
    return error;
  }

  /**
   * Detect errors in current morphology
   */
  detectErrors(): MorphogeneticError[] {
    this.errors = [];

    // Check each required capability
    for (const [id, required] of this.targetMorphology.requiredCapabilities) {
      const capability = this.morphology.capabilities.get(id);

      if (!capability) {
        // Missing capability
        this.errors.push({
          type: 'missing',
          capability: id,
          magnitude: required,
          priority: required  // Higher required = higher priority
        });
      } else if (capability.level < required - this.config.errorThreshold) {
        // Degraded capability
        this.errors.push({
          type: 'degraded',
          capability: id,
          magnitude: required - capability.level,
          priority: (required - capability.level) / required
        });
      }
    }

    // Check health
    if (this.morphology.health < this.targetMorphology.minHealth) {
      this.errors.push({
        type: 'degraded',
        magnitude: this.targetMorphology.minHealth - this.morphology.health,
        priority: 1.0  // Health is highest priority
      });
    }

    // Cap errors array to prevent unbounded growth
    if (this.errors.length > 200) {
      this.errors = this.errors.slice(-100);
    }

    this.metrics.totalErrors = this.errors.length;
    this.emit('errors:detected', this.errors);
    return this.errors;
  }

  /**
   * Get missing capabilities
   */
  missingCapabilities(): string[] {
    const missing: string[] = [];

    for (const [id, required] of this.targetMorphology.requiredCapabilities) {
      const capability = this.morphology.capabilities.get(id);
      if (!capability || capability.level < required * 0.5) {
        missing.push(id);
      }
    }

    return missing;
  }

  /**
   * Self-correct toward target morphology
   */
  selfCorrect(): RepairAction[] {
    const errors = this.detectErrors();
    if (errors.length === 0) {
      return [];
    }

    // Sort by priority
    errors.sort((a, b) => b.priority - a.priority);

    const actions: RepairAction[] = [];

    for (const error of errors) {
      let action: RepairAction;

      switch (error.type) {
        case 'missing':
          action = {
            type: 'regenerate',
            target: error.capability!,
            parameters: { targetLevel: this.targetMorphology.requiredCapabilities.get(error.capability!) },
            estimatedCost: this.config.healingCost,
            estimatedTime: 1000 / this.config.regenerationRate
          };
          break;

        case 'degraded':
          action = {
            type: 'strengthen',
            target: error.capability || 'health',
            parameters: { amount: error.magnitude },
            estimatedCost: this.config.healingCost * error.magnitude,
            estimatedTime: 500 / this.config.regenerationRate
          };
          break;

        case 'disconnected':
          action = {
            type: 'connect',
            target: error.capability!,
            parameters: {},
            estimatedCost: this.config.healingCost * 0.5,
            estimatedTime: 200
          };
          break;

        case 'excess':
          action = {
            type: 'prune',
            target: error.capability!,
            parameters: {},
            estimatedCost: this.config.healingCost * 0.2,
            estimatedTime: 100
          };
          break;
      }

      actions.push(action);
    }

    this.emit('repair:planned', actions);
    return actions;
  }

  /**
   * Execute a repair action
   */
  async executeRepair(action: RepairAction): Promise<boolean> {
    this.metrics.repairsAttempted++;

    try {
      switch (action.type) {
        case 'regenerate':
          await this.regenerate(action.target, action.parameters.targetLevel as number);
          break;

        case 'strengthen':
          await this.strengthen(action.target, action.parameters.amount as number);
          break;

        case 'connect':
          await this.connect(action.target);
          break;

        case 'prune':
          await this.prune(action.target);
          break;
      }

      this.metrics.repairsSucceeded++;
      this.emit('repair:completed', action);
      return true;

    } catch (error) {
      this.emit('repair:failed', { action, error });
      return false;
    }
  }

  /**
   * Regenerate a capability
   */
  private async regenerate(capabilityId: string, targetLevel: number): Promise<void> {
    try {
      // Simulate regeneration time
      await this.delay(100);

      const existing = this.morphology.capabilities.get(capabilityId);
      if (existing) {
        existing.level = Math.min(1, existing.level + this.config.regenerationRate);
      } else {
        this.morphology.capabilities.set(capabilityId, {
          id: capabilityId,
          name: capabilityId,
          level: this.config.regenerationRate,
          required: targetLevel,
          dependencies: []
        });
      }

      this.metrics.regenerations++;
      this.updateHealth();
    } catch (err) {
      console.error('[morphogenetic] regenerate failed:', err);
    }
  }

  /**
   * Strengthen a capability or health
   */
  private async strengthen(target: string, amount: number): Promise<void> {
    try {
      await this.delay(50);

      if (target === 'health') {
        this.morphology.health = Math.min(1, this.morphology.health + amount * 0.5);
      } else {
        const capability = this.morphology.capabilities.get(target);
        if (capability) {
          capability.level = Math.min(1, capability.level + amount * 0.5);
        }
      }

      this.updateHealth();
    } catch (err) {
      console.error('[morphogenetic] strengthen failed:', err);
    }
  }

  /**
   * Connect to another capability/agent
   */
  private async connect(target: string): Promise<void> {
    try {
      await this.delay(30);

      const connections = this.morphology.connections.get(this.id) || [];
      if (!connections.includes(target)) {
        connections.push(target);
        this.morphology.connections.set(this.id, connections);
      }
    } catch (err) {
      console.error('[morphogenetic] connect failed:', err);
    }
  }

  /**
   * Prune an excess capability
   */
  private async prune(target: string): Promise<void> {
    try {
      await this.delay(20);

      const capability = this.morphology.capabilities.get(target);
      if (capability && capability.level > capability.required * 1.5) {
        capability.level = capability.required;
      }
    } catch (err) {
      console.error('[morphogenetic] prune failed:', err);
    }
  }

  /**
   * Update overall health based on capabilities
   */
  private updateHealth(): void {
    let totalLevel = 0;
    let totalRequired = 0;

    for (const [id, required] of this.targetMorphology.requiredCapabilities) {
      const capability = this.morphology.capabilities.get(id);
      totalLevel += capability?.level || 0;
      totalRequired += required;
    }

    this.morphology.health = totalRequired > 0
      ? Math.min(1, totalLevel / totalRequired)
      : 1;

    this.metrics.currentHealth = this.morphology.health;
  }

  /**
   * Apply degradation over time
   */
  degrade(): void {
    for (const capability of this.morphology.capabilities.values()) {
      capability.level = Math.max(0, capability.level - this.config.degradationRate);
    }

    this.morphology.health = Math.max(0, this.morphology.health - this.config.degradationRate * 0.5);
    this.updateHealth();
    this.emit('degraded');
  }

  /**
   * Get current morphology
   */
  getMorphology(): AgentMorphology {
    return {
      capabilities: new Map(this.morphology.capabilities),
      connections: new Map(this.morphology.connections),
      position: [...this.morphology.position],
      health: this.morphology.health
    };
  }

  /**
   * Get target morphology
   */
  getTarget(): TargetMorphology {
    return { ...this.targetMorphology };
  }

  /**
   * Get metrics
   */
  getMetrics(): MorphogeneticMetrics {
    return { ...this.metrics };
  }

  /**
   * Get current errors
   */
  getErrors(): MorphogeneticError[] {
    return [...this.errors];
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Neural Cellular Automata (NCA)
// ============================================================================

export class NeuralCellularAutomata extends EventEmitter {
  private grid: Map<string, CellState>;
  private config: MorphogeneticConfig;
  private generation: number;
  private targetPattern: Map<string, CellType>;

  constructor(config: Partial<MorphogeneticConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.grid = new Map();
    this.generation = 0;
    this.targetPattern = new Map();
    this.initializeGrid();
  }

  /**
   * Initialize grid with stem cells
   */
  private initializeGrid(): void {
    const size = this.config.gridSize;

    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        const id = `${x},${y}`;
        this.grid.set(id, {
          id,
          type: 'stem',
          potential: Math.random() * 2 - 1,  // Random initial potential
          neighbors: this.getNeighborIds(x, y),
          alive: true,
          age: 0
        });
        if (this.grid.size > 10000) {
          // Delete oldest entries
          const keys = Array.from(this.grid.keys());
          for (let i = 0; i < 1000; i++) this.grid.delete(keys[i]);
        }
      }
    }
  }

  /**
   * Get neighbor cell IDs
   */
  private getNeighborIds(x: number, y: number): string[] {
    const neighbors: string[] = [];
    const size = this.config.gridSize;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;

        const nx = x + dx;
        const ny = y + dy;

        if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
          neighbors.push(`${nx},${ny}`);
        }
      }
    }

    return neighbors;
  }

  /**
   * Set target pattern
   */
  setTargetPattern(pattern: Map<string, CellType>): void {
    this.targetPattern = new Map(pattern);
  }

  /**
   * Update one generation
   */
  step(): void {
    const newStates = new Map<string, CellState>();

    for (const [id, cell] of this.grid) {
      const neighbors = cell.neighbors.map(nid => this.grid.get(nid)!).filter(Boolean);
      const newState = this.updateCell(cell, neighbors);
      newStates.set(id, newState);
    }

    this.grid = newStates;
    this.generation++;
    this.emit('step', { generation: this.generation });
  }

  /**
   * Update single cell based on neighbors
   */
  private updateCell(cell: CellState, neighbors: CellState[]): CellState {
    // Calculate average neighbor potential
    const avgPotential = neighbors.reduce((sum, n) => sum + n.potential, 0) / neighbors.length;

    // Bioelectric update rule
    const delta = (avgPotential - cell.potential) * 0.1;
    const noise = (Math.random() - 0.5) * 0.05;
    let newPotential = cell.potential + delta + noise;
    newPotential = Math.max(-1, Math.min(1, newPotential));

    // Differentiation based on potential
    let newType = cell.type;
    if (cell.type === 'stem') {
      newType = this.differentiate(newPotential, neighbors);
    }

    // Death check (very negative potential)
    const alive = cell.alive && newPotential > -0.9;

    return {
      ...cell,
      potential: newPotential,
      type: newType,
      alive,
      age: cell.age + 1
    };
  }

  /**
   * Differentiate stem cell based on potential and neighbors
   */
  private differentiate(potential: number, neighbors: CellState[]): CellType {
    // Count neighbor types
    const typeCounts = new Map<CellType, number>();
    for (const n of neighbors) {
      typeCounts.set(n.type, (typeCounts.get(n.type) || 0) + 1);
    }

    // Differentiation rules based on potential
    if (potential > 0.7) return 'processor';
    if (potential > 0.4) return 'sensor';
    if (potential > 0.1) return 'memory';
    if (potential > -0.2) return 'communicator';
    if (potential > -0.5) return 'effector';
    return 'stem';  // Stay stem if very negative
  }

  /**
   * Calculate distance from target pattern
   */
  patternError(): number {
    if (this.targetPattern.size === 0) return 0;

    let matches = 0;
    for (const [id, targetType] of this.targetPattern) {
      const cell = this.grid.get(id);
      if (cell && cell.type === targetType) {
        matches++;
      }
    }

    return 1 - (matches / this.targetPattern.size);
  }

  /**
   * Run until pattern converges or max generations
   */
  async runUntilConverged(maxGenerations: number = 100): Promise<number> {
    try {
      let prevError = this.patternError();

      for (let i = 0; i < maxGenerations; i++) {
        this.step();

        const error = this.patternError();
        if (Math.abs(error - prevError) < 0.001 && error < 0.1) {
          return i;  // Converged
        }
        prevError = error;

        await new Promise(r => setTimeout(r, 10));
      }

      return maxGenerations;
    } catch (err) {
      console.error('[morphogenetic] runUntilConverged failed:', err);
      return maxGenerations;
    }
  }

  /**
   * Get grid state
   */
  getGrid(): Map<string, CellState> {
    return new Map(this.grid);
  }

  /**
   * Get cell at position
   */
  getCell(x: number, y: number): CellState | undefined {
    return this.grid.get(`${x},${y}`);
  }

  /**
   * Get generation count
   */
  getGeneration(): number {
    return this.generation;
  }

  /**
   * Count cells by type
   */
  getCellCounts(): Map<CellType, number> {
    const counts = new Map<CellType, number>();
    for (const cell of this.grid.values()) {
      if (cell.alive) {
        counts.set(cell.type, (counts.get(cell.type) || 0) + 1);
      }
    }
    return counts;
  }

  /**
   * Reset grid
   */
  reset(): void {
    this.grid.clear();
    this.generation = 0;
    this.initializeGrid();
    this.emit('reset');
  }
}

// ============================================================================
// Collective Problem Solving (Agent Colony)
// ============================================================================

export class AgentColony extends EventEmitter {
  private agents: Map<string, MorphogeneticAgent>;
  private config: MorphogeneticConfig;
  private sharedKnowledge: Map<string, unknown>;

  constructor(config: Partial<MorphogeneticConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.agents = new Map();
    this.sharedKnowledge = new Map();
  }

  /**
   * Add agent to colony
   */
  addAgent(agent: MorphogeneticAgent): void {
    this.agents.set(agent.id, agent);

    // Wire up events
    agent.on('repair:completed', (action) => {
      this.shareKnowledge(`repair:${agent.id}`, action);
    });

    this.emit('agent:added', agent.id);
  }

  /**
   * Remove agent from colony
   */
  removeAgent(id: string): boolean {
    const removed = this.agents.delete(id);
    if (removed) {
      this.emit('agent:removed', id);
    }
    return removed;
  }

  /**
   * Share knowledge across colony
   */
  shareKnowledge(key: string, value: unknown): void {
    this.sharedKnowledge.set(key, value);
    if (this.sharedKnowledge.size > 500) {
      // Delete oldest entries
      const keys = Array.from(this.sharedKnowledge.keys());
      for (let i = 0; i < 100; i++) this.sharedKnowledge.delete(keys[i]);
    }
    this.emit('knowledge:shared', { key, value });
  }

  /**
   * Collective repair - agents work together
   */
  async solveCollectively(problem: string): Promise<{ success: boolean; solution: unknown }> {
    try {
      if (this.agents.size < this.config.minQuorum) {
        return { success: false, solution: 'Not enough agents for quorum' };
      }

      // Each agent proposes repairs
      const proposals: Map<string, RepairAction[]> = new Map();

      for (const [id, agent] of this.agents) {
        const repairs = agent.selfCorrect();
        proposals.set(id, repairs);
      }

      // Find consensus on repair strategy
      const consensusActions = this.findConsensus(proposals);

      if (consensusActions.length === 0) {
        return { success: false, solution: 'No consensus reached' };
      }

      // Execute agreed-upon repairs
      const results: boolean[] = [];
      for (const agent of this.agents.values()) {
        for (const action of consensusActions) {
          const success = await agent.executeRepair(action);
          results.push(success);
        }
      }

      const successRate = results.filter(r => r).length / results.length;
      return {
        success: successRate >= this.config.consensusThreshold,
        solution: { consensusActions, successRate }
      };
    } catch (err) {
      console.error('[morphogenetic] solveCollectively failed:', err);
      return { success: false, solution: 'Error during collective repair' };
    }
  }

  /**
   * Find consensus among agent proposals
   */
  private findConsensus(proposals: Map<string, RepairAction[]>): RepairAction[] {
    // Count how many agents propose each action type
    const actionCounts = new Map<string, number>();

    for (const actions of proposals.values()) {
      for (const action of actions) {
        const key = `${action.type}:${action.target}`;
        actionCounts.set(key, (actionCounts.get(key) || 0) + 1);
      }
    }

    // Find actions with consensus
    const consensus: RepairAction[] = [];
    const threshold = this.agents.size * this.config.consensusThreshold;

    for (const [key, count] of actionCounts) {
      if (count >= threshold) {
        // Find the actual action
        for (const actions of proposals.values()) {
          const action = actions.find(a => `${a.type}:${a.target}` === key);
          if (action) {
            consensus.push(action);
            break;
          }
        }
      }
    }

    return consensus;
  }

  /**
   * Get colony health (average agent health)
   */
  getColonyHealth(): number {
    if (this.agents.size === 0) return 0;

    let totalHealth = 0;
    for (const agent of this.agents.values()) {
      totalHealth += agent.getMetrics().currentHealth;
    }

    return totalHealth / this.agents.size;
  }

  /**
   * Get all agents
   */
  getAgents(): MorphogeneticAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get shared knowledge
   */
  getSharedKnowledge(): Map<string, unknown> {
    return new Map(this.sharedKnowledge);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a target morphology
 */
export function createTargetMorphology(
  capabilities: Record<string, number>,
  minHealth: number = 0.8,
  description: string = ''
): TargetMorphology {
  return {
    requiredCapabilities: new Map(Object.entries(capabilities)),
    minHealth,
    optimalConnections: Object.keys(capabilities).length,
    description
  };
}

/**
 * Create a morphogenetic agent
 */
export function createMorphogeneticAgent(
  id: string,
  capabilities: Record<string, number>,
  config?: Partial<MorphogeneticConfig>
): MorphogeneticAgent {
  const target = createTargetMorphology(capabilities);
  return new MorphogeneticAgent(id, target, config);
}

// ============================================================================
// Global Instances
// ============================================================================

let globalColony: AgentColony | null = null;
let globalNCA: NeuralCellularAutomata | null = null;

/**
 * Get global agent colony
 */
export function getColony(config?: Partial<MorphogeneticConfig>): AgentColony {
  if (!globalColony) {
    globalColony = new AgentColony(config);
  }
  return globalColony;
}

/**
 * Reset global colony
 */
export function resetColony(): void {
  globalColony = null;
}

/**
 * Get global NCA
 */
export function getNCA(config?: Partial<MorphogeneticConfig>): NeuralCellularAutomata {
  if (!globalNCA) {
    globalNCA = new NeuralCellularAutomata(config);
  }
  return globalNCA;
}

/**
 * Reset global NCA
 */
export function resetNCA(): void {
  if (globalNCA) {
    globalNCA.reset();
  }
  globalNCA = null;
}
