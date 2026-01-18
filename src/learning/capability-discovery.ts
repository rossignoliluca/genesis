/**
 * CAPABILITY DISCOVERY
 *
 * Autonomous discovery and cataloging of system capabilities.
 * The system learns what it can do through experimentation.
 *
 * Features:
 * - Skill primitive discovery
 * - Capability composition
 * - Affordance learning
 * - Self-testing & validation
 * - Capability graph construction
 *
 * Based on:
 * - Intrinsic motivation research
 * - Skill discovery in RL
 * - Empowerment maximization
 */

// ============================================================================
// TYPES
// ============================================================================

export interface CapabilityConfig {
  explorationBudget: number;       // Max exploration steps
  validationTrials: number;        // Trials per capability test
  minSuccessRate: number;          // Threshold for capability confirmation
  compositionDepth: number;        // Max depth for capability composition
  noveltyThreshold: number;        // Threshold for new capability discovery
}

export interface Capability {
  id: string;
  name: string;
  description: string;
  type: CapabilityType;
  preconditions: string[];         // Required state conditions
  effects: string[];               // State changes after execution
  successRate: number;
  attempts: number;
  lastTested: number;
  primitive: boolean;              // Is this a primitive or composed capability?
  composedOf?: string[];           // IDs of sub-capabilities
  embedding?: number[];            // Learned representation
}

export type CapabilityType =
  | 'action'          // Direct action in environment
  | 'perception'      // Sensing/observation
  | 'computation'     // Internal processing
  | 'communication'   // Inter-agent communication
  | 'memory'          // Storage/retrieval
  | 'composition';    // Composed from other capabilities

export interface CapabilityTest {
  capabilityId: string;
  context: Record<string, unknown>;
  success: boolean;
  duration: number;
  effects: string[];
  errors?: string[];
}

export interface CapabilityGraph {
  nodes: Map<string, Capability>;
  edges: CapabilityEdge[];
  clusters: CapabilityCluster[];
}

export interface CapabilityEdge {
  from: string;
  to: string;
  relation: 'requires' | 'enables' | 'composes' | 'conflicts';
  strength: number;
}

export interface CapabilityCluster {
  id: string;
  name: string;
  capabilities: string[];
  centroid?: number[];
}

export interface DiscoveryResult {
  newCapabilities: Capability[];
  updatedCapabilities: Capability[];
  failedExperiments: string[];
  explorationSteps: number;
}

// ============================================================================
// CAPABILITY DISCOVERER
// ============================================================================

export class CapabilityDiscoverer {
  private config: CapabilityConfig;
  private capabilities: Map<string, Capability> = new Map();
  private graph: CapabilityGraph;
  private explorationHistory: CapabilityTest[] = [];

  constructor(config: Partial<CapabilityConfig> = {}) {
    this.config = {
      explorationBudget: 1000,
      validationTrials: 5,
      minSuccessRate: 0.7,
      compositionDepth: 3,
      noveltyThreshold: 0.3,
      ...config
    };

    this.graph = {
      nodes: new Map(),
      edges: [],
      clusters: []
    };

    this.initPrimitiveCapabilities();
  }

  private initPrimitiveCapabilities(): void {
    // Initialize basic primitive capabilities
    const primitives: Partial<Capability>[] = [
      {
        name: 'observe',
        type: 'perception',
        description: 'Observe current state',
        preconditions: [],
        effects: ['state_observed']
      },
      {
        name: 'remember',
        type: 'memory',
        description: 'Store information in memory',
        preconditions: ['has_information'],
        effects: ['information_stored']
      },
      {
        name: 'recall',
        type: 'memory',
        description: 'Retrieve information from memory',
        preconditions: ['information_stored'],
        effects: ['information_retrieved']
      },
      {
        name: 'compute',
        type: 'computation',
        description: 'Perform computation',
        preconditions: ['has_input'],
        effects: ['has_output']
      },
      {
        name: 'communicate',
        type: 'communication',
        description: 'Send message to other agents',
        preconditions: ['has_message', 'has_recipient'],
        effects: ['message_sent']
      },
      {
        name: 'act',
        type: 'action',
        description: 'Execute action in environment',
        preconditions: ['action_selected'],
        effects: ['action_executed']
      }
    ];

    for (const prim of primitives) {
      const cap = this.createCapability(prim.name!, prim.type!, prim.description!, true);
      cap.preconditions = prim.preconditions || [];
      cap.effects = prim.effects || [];
      cap.successRate = 0.9;  // Primitives assumed reliable
      this.capabilities.set(cap.id, cap);
      this.graph.nodes.set(cap.id, cap);
    }
  }

  private createCapability(
    name: string,
    type: CapabilityType,
    description: string,
    primitive: boolean
  ): Capability {
    return {
      id: `cap_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name,
      type,
      description,
      preconditions: [],
      effects: [],
      successRate: 0,
      attempts: 0,
      lastTested: Date.now(),
      primitive
    };
  }

  // --------------------------------------------------------------------------
  // DISCOVERY
  // --------------------------------------------------------------------------

  /**
   * Run exploration to discover new capabilities
   */
  async explore(steps: number = 100): Promise<DiscoveryResult> {
    const budget = Math.min(steps, this.config.explorationBudget);
    const newCapabilities: Capability[] = [];
    const updatedCapabilities: Capability[] = [];
    const failedExperiments: string[] = [];

    for (let i = 0; i < budget; i++) {
      // Strategy selection
      const strategy = this.selectExplorationStrategy();

      switch (strategy) {
        case 'test_existing':
          const updated = await this.testExistingCapability();
          if (updated) updatedCapabilities.push(updated);
          break;

        case 'compose':
          const composed = await this.tryComposition();
          if (composed) newCapabilities.push(composed);
          else failedExperiments.push(`composition_${i}`);
          break;

        case 'mutate':
          const mutated = await this.tryMutation();
          if (mutated) newCapabilities.push(mutated);
          break;

        case 'random':
          const discovered = await this.randomExploration();
          if (discovered) newCapabilities.push(discovered);
          break;
      }
    }

    // Update graph with new capabilities
    for (const cap of newCapabilities) {
      this.capabilities.set(cap.id, cap);
      this.graph.nodes.set(cap.id, cap);
    }

    // Recluster capabilities
    this.clusterCapabilities();

    return {
      newCapabilities,
      updatedCapabilities,
      failedExperiments,
      explorationSteps: budget
    };
  }

  private selectExplorationStrategy(): 'test_existing' | 'compose' | 'mutate' | 'random' {
    const r = Math.random();

    // More testing early, more composition later
    const numCaps = this.capabilities.size;
    const maturity = Math.min(numCaps / 20, 1);

    if (r < 0.3 - maturity * 0.2) return 'test_existing';
    if (r < 0.6 + maturity * 0.2) return 'compose';
    if (r < 0.8) return 'mutate';
    return 'random';
  }

  // --------------------------------------------------------------------------
  // EXPLORATION STRATEGIES
  // --------------------------------------------------------------------------

  private async testExistingCapability(): Promise<Capability | null> {
    // Select least recently tested or least certain capability
    const caps = Array.from(this.capabilities.values());
    if (caps.length === 0) return null;

    // Sort by uncertainty (low success rate and low attempts)
    caps.sort((a, b) => {
      const uncertaintyA = Math.abs(a.successRate - 0.5) / (a.attempts + 1);
      const uncertaintyB = Math.abs(b.successRate - 0.5) / (b.attempts + 1);
      return uncertaintyA - uncertaintyB;
    });

    const cap = caps[0];
    const testResult = await this.testCapability(cap);

    // Update success rate
    cap.attempts++;
    cap.successRate = (cap.successRate * (cap.attempts - 1) + (testResult.success ? 1 : 0)) / cap.attempts;
    cap.lastTested = Date.now();

    this.explorationHistory.push(testResult);

    return cap;
  }

  private async tryComposition(): Promise<Capability | null> {
    const caps = Array.from(this.capabilities.values());
    if (caps.length < 2) return null;

    // Select two compatible capabilities
    const cap1 = caps[Math.floor(Math.random() * caps.length)];
    const candidates = caps.filter(c =>
      c.id !== cap1.id &&
      this.areCompatible(cap1, c) &&
      !this.compositionExists(cap1.id, c.id)
    );

    if (candidates.length === 0) return null;
    const cap2 = candidates[Math.floor(Math.random() * candidates.length)];

    // Create composed capability
    const composed = this.composeCapabilities(cap1, cap2);

    // Test composed capability
    const testResult = await this.testCapability(composed);

    if (testResult.success) {
      composed.successRate = 1;
      composed.attempts = 1;

      // Add composition edge
      this.graph.edges.push({
        from: cap1.id,
        to: composed.id,
        relation: 'composes',
        strength: 1
      });
      this.graph.edges.push({
        from: cap2.id,
        to: composed.id,
        relation: 'composes',
        strength: 1
      });

      return composed;
    }

    return null;
  }

  private areCompatible(cap1: Capability, cap2: Capability): boolean {
    // Check if cap1's effects satisfy any of cap2's preconditions
    for (const effect of cap1.effects) {
      for (const precond of cap2.preconditions) {
        if (effect.includes(precond) || precond.includes(effect)) {
          return true;
        }
      }
    }

    // Check if they operate on same type
    return cap1.type === cap2.type;
  }

  private compositionExists(id1: string, id2: string): boolean {
    for (const cap of this.capabilities.values()) {
      if (cap.composedOf?.includes(id1) && cap.composedOf?.includes(id2)) {
        return true;
      }
    }
    return false;
  }

  private composeCapabilities(cap1: Capability, cap2: Capability): Capability {
    const composed = this.createCapability(
      `${cap1.name}_${cap2.name}`,
      'composition',
      `Composition of ${cap1.name} and ${cap2.name}`,
      false
    );

    composed.composedOf = [cap1.id, cap2.id];

    // Merge preconditions (excluding satisfied ones)
    composed.preconditions = [
      ...cap1.preconditions,
      ...cap2.preconditions.filter(p => !cap1.effects.includes(p))
    ];

    // Combine effects
    composed.effects = [...new Set([...cap1.effects, ...cap2.effects])];

    return composed;
  }

  private async tryMutation(): Promise<Capability | null> {
    const caps = Array.from(this.capabilities.values()).filter(c => !c.primitive);
    if (caps.length === 0) return null;

    const base = caps[Math.floor(Math.random() * caps.length)];

    // Create mutated version
    const mutated = this.createCapability(
      `${base.name}_v2`,
      base.type,
      `Variant of ${base.name}`,
      false
    );

    // Mutate preconditions/effects
    mutated.preconditions = base.preconditions.filter(() => Math.random() > 0.2);
    mutated.effects = [...base.effects];

    // Add new random effect
    if (Math.random() > 0.5) {
      mutated.effects.push(`effect_${Math.random().toString(36).substr(2, 6)}`);
    }

    // Test mutated capability
    const testResult = await this.testCapability(mutated);

    if (testResult.success && this.isNovel(mutated)) {
      mutated.successRate = 1;
      mutated.attempts = 1;
      return mutated;
    }

    return null;
  }

  private async randomExploration(): Promise<Capability | null> {
    // Generate random capability (simulated intrinsic motivation)
    const types: CapabilityType[] = ['action', 'perception', 'computation', 'memory'];
    const type = types[Math.floor(Math.random() * types.length)];

    const cap = this.createCapability(
      `discovered_${Math.random().toString(36).substr(2, 6)}`,
      type,
      'Randomly discovered capability',
      false
    );

    cap.preconditions = [];
    cap.effects = [`effect_${Math.random().toString(36).substr(2, 6)}`];

    // Test
    const testResult = await this.testCapability(cap);

    if (testResult.success && this.isNovel(cap)) {
      cap.successRate = 1;
      cap.attempts = 1;
      return cap;
    }

    return null;
  }

  // --------------------------------------------------------------------------
  // TESTING
  // --------------------------------------------------------------------------

  private async testCapability(cap: Capability): Promise<CapabilityTest> {
    const startTime = Date.now();

    // Simulate capability execution
    const success = this.simulateExecution(cap);

    return {
      capabilityId: cap.id,
      context: {},
      success,
      duration: Date.now() - startTime,
      effects: success ? cap.effects : [],
      errors: success ? undefined : ['Execution failed']
    };
  }

  private simulateExecution(cap: Capability): boolean {
    // Primitives are reliable
    if (cap.primitive) {
      return Math.random() < 0.9;
    }

    // Composed capabilities depend on components
    if (cap.composedOf) {
      const componentSuccessRate = cap.composedOf.reduce((acc, id) => {
        const component = this.capabilities.get(id);
        return acc * (component?.successRate || 0.5);
      }, 1);
      return Math.random() < componentSuccessRate * 0.9;
    }

    // Random capabilities have lower success
    return Math.random() < 0.3;
  }

  /**
   * Validate a capability with multiple trials
   */
  async validateCapability(capId: string): Promise<{ valid: boolean; successRate: number }> {
    const cap = this.capabilities.get(capId);
    if (!cap) return { valid: false, successRate: 0 };

    let successes = 0;
    for (let i = 0; i < this.config.validationTrials; i++) {
      const test = await this.testCapability(cap);
      if (test.success) successes++;
    }

    const successRate = successes / this.config.validationTrials;
    cap.successRate = successRate;
    cap.attempts += this.config.validationTrials;
    cap.lastTested = Date.now();

    return {
      valid: successRate >= this.config.minSuccessRate,
      successRate
    };
  }

  // --------------------------------------------------------------------------
  // NOVELTY & CLUSTERING
  // --------------------------------------------------------------------------

  private isNovel(cap: Capability): boolean {
    // Check if capability is sufficiently different from existing ones
    for (const existing of this.capabilities.values()) {
      const similarity = this.computeCapabilitySimilarity(cap, existing);
      if (similarity > 1 - this.config.noveltyThreshold) {
        return false;
      }
    }
    return true;
  }

  private computeCapabilitySimilarity(cap1: Capability, cap2: Capability): number {
    // Jaccard similarity of effects
    const effects1 = new Set(cap1.effects);
    const effects2 = new Set(cap2.effects);

    const intersection = new Set([...effects1].filter(e => effects2.has(e)));
    const union = new Set([...effects1, ...effects2]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }

  private clusterCapabilities(): void {
    const caps = Array.from(this.capabilities.values());
    if (caps.length < 2) return;

    // Simple clustering by type
    const clusters = new Map<CapabilityType, string[]>();

    for (const cap of caps) {
      if (!clusters.has(cap.type)) {
        clusters.set(cap.type, []);
      }
      clusters.get(cap.type)!.push(cap.id);
    }

    this.graph.clusters = Array.from(clusters.entries()).map(([type, capIds], i) => ({
      id: `cluster_${i}`,
      name: type,
      capabilities: capIds
    }));
  }

  // --------------------------------------------------------------------------
  // PUBLIC API
  // --------------------------------------------------------------------------

  getCapability(id: string): Capability | undefined {
    return this.capabilities.get(id);
  }

  getAllCapabilities(): Capability[] {
    return Array.from(this.capabilities.values());
  }

  getCapabilitiesByType(type: CapabilityType): Capability[] {
    return Array.from(this.capabilities.values()).filter(c => c.type === type);
  }

  getGraph(): CapabilityGraph {
    return this.graph;
  }

  /**
   * Find capabilities that can achieve a goal
   */
  findCapabilitiesFor(goalEffects: string[]): Capability[] {
    const matching: Capability[] = [];

    for (const cap of this.capabilities.values()) {
      const achieves = goalEffects.some(goal =>
        cap.effects.some(effect => effect.includes(goal) || goal.includes(effect))
      );
      if (achieves && cap.successRate >= this.config.minSuccessRate) {
        matching.push(cap);
      }
    }

    return matching.sort((a, b) => b.successRate - a.successRate);
  }

  /**
   * Get capability chain to achieve goal from current state
   */
  planCapabilityChain(currentEffects: string[], goalEffects: string[]): Capability[] | null {
    // Simple BFS for capability planning
    const visited = new Set<string>();
    const queue: Array<{ state: Set<string>; chain: Capability[] }> = [
      { state: new Set(currentEffects), chain: [] }
    ];

    while (queue.length > 0) {
      const { state, chain } = queue.shift()!;

      // Check if goal reached
      if (goalEffects.every(g => state.has(g))) {
        return chain;
      }

      // Try each capability
      for (const cap of this.capabilities.values()) {
        if (visited.has(cap.id)) continue;

        // Check preconditions
        const precondsMet = cap.preconditions.every(p => state.has(p));
        if (!precondsMet) continue;

        visited.add(cap.id);

        // Apply capability
        const newState = new Set(state);
        cap.effects.forEach(e => newState.add(e));

        queue.push({
          state: newState,
          chain: [...chain, cap]
        });
      }
    }

    return null;  // No plan found
  }

  getConfig(): CapabilityConfig {
    return { ...this.config };
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export function createCapabilityDiscoverer(
  config?: Partial<CapabilityConfig>
): CapabilityDiscoverer {
  return new CapabilityDiscoverer(config);
}
