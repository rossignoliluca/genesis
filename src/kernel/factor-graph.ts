/**
 * Factor Graph Message Passing for Inter-Module Belief Coordination
 *
 * Extends Genesis FEK with bidirectional belief propagation between modules.
 * While FEK provides unidirectional prediction errors (up) and predictions (down),
 * the factor graph enables cooperative inference across the hierarchy.
 *
 * Architecture:
 *   - FactorNode: Represents a module (FEK, Brain, Economy, Consciousness, etc.)
 *   - FactorEdge: Bidirectional message channel with precision weighting
 *   - Message Passing: Sum-product loopy belief propagation
 *   - Convergence: Damped iteration until belief stability
 *
 * Pre-configured Genesis topology:
 *   FEK ←→ Brain ←→ Consciousness
 *    ↕         ↕          ↕
 *   Economy ←→ Metacognition ←→ Sensorimotor
 *
 * References:
 * - Friston et al. (2017) "Active Inference and Learning"
 * - Yedidia et al. (2003) "Understanding Belief Propagation"
 * - Pearl (1988) "Probabilistic Reasoning in Intelligent Systems"
 */

import { EconomicFiber } from '../economy/fiber.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Message passed between factor nodes
 */
export interface FactorMessage {
  from: string;           // Source node ID
  to: string;             // Target node ID
  variable: string;       // Variable name (e.g., "threat_level", "task_urgency")
  belief: number;         // Probability/value (0-1 normalized)
  precision: number;      // Confidence/reliability (0-1)
  timestamp: number;
}

/**
 * Beliefs held by a factor node (variable → probability/value)
 */
export type BeliefMap = Map<string, number>;

/**
 * Compute function for a factor node
 * Takes incoming messages and current beliefs, produces outgoing messages
 */
export type ComputeFunction = (
  nodeId: string,
  beliefs: BeliefMap,
  incomingMessages: FactorMessage[]
) => FactorMessage[];

/**
 * Factor node represents a module in the system
 */
export interface FactorNode {
  id: string;
  beliefs: BeliefMap;              // Current beliefs
  computeFn: ComputeFunction;      // Message computation function
  incomingMessages: FactorMessage[];
  outgoingMessages: FactorMessage[];
}

/**
 * Edge connecting two factor nodes with bidirectional message buffers
 */
export interface FactorEdge {
  from: string;
  to: string;
  forwardPrecision: number;   // Weight for from→to messages
  backwardPrecision: number;  // Weight for to→from messages
  forwardBuffer: FactorMessage[];
  backwardBuffer: FactorMessage[];
}

/**
 * Convergence state tracking
 */
export interface ConvergenceState {
  converged: boolean;
  iteration: number;
  maxChange: number;          // Maximum belief change in last iteration
  threshold: number;
  elapsed: number;            // ms
}

/**
 * Configuration for belief propagation
 */
export interface PropagationConfig {
  maxIterations: number;
  convergenceThreshold: number;
  dampingFactor: number;      // 0-1, prevents oscillation in loopy graphs
  energyCostPerIteration: number;
}

// ============================================================================
// Default Compute Functions
// ============================================================================

/**
 * Default compute function: weighted average of incoming messages
 */
const defaultComputeFn: ComputeFunction = (
  nodeId: string,
  beliefs: BeliefMap,
  incomingMessages: FactorMessage[]
): FactorMessage[] => {
  const outgoing: FactorMessage[] = [];
  const timestamp = Date.now();

  // Group incoming messages by variable
  const messagesByVariable = new Map<string, FactorMessage[]>();
  for (const msg of incomingMessages) {
    if (!messagesByVariable.has(msg.variable)) {
      messagesByVariable.set(msg.variable, []);
    }
    messagesByVariable.get(msg.variable)!.push(msg);
  }

  // For each variable, compute weighted average and broadcast
  for (const [variable, messages] of messagesByVariable) {
    let totalWeight = 0;
    let weightedSum = 0;
    let avgPrecision = 0;

    for (const msg of messages) {
      const weight = msg.precision;
      totalWeight += weight;
      weightedSum += msg.belief * weight;
      avgPrecision += msg.precision;
    }

    if (totalWeight > 0) {
      const newBelief = weightedSum / totalWeight;
      avgPrecision /= messages.length;

      // Update local belief
      beliefs.set(variable, newBelief);

      // Create outgoing messages (exclude sender to prevent echo)
      const senders = new Set(messages.map(m => m.from));
      for (const sender of senders) {
        outgoing.push({
          from: nodeId,
          to: sender,
          variable,
          belief: newBelief,
          precision: avgPrecision * 0.95, // Slight decay
          timestamp,
        });
      }
    }
  }

  return outgoing;
};

/**
 * Evidence injection compute function: holds fixed belief
 */
const evidenceComputeFn = (fixedBelief: number): ComputeFunction => {
  return (nodeId, beliefs, incomingMessages) => {
    const outgoing: FactorMessage[] = [];
    const timestamp = Date.now();

    // Send fixed belief to all neighbors
    const neighbors = new Set(incomingMessages.map(m => m.from));
    for (const neighbor of neighbors) {
      for (const [variable, value] of beliefs) {
        outgoing.push({
          from: nodeId,
          to: neighbor,
          variable,
          belief: value,
          precision: 1.0, // Evidence is certain
          timestamp,
        });
      }
    }

    return outgoing;
  };
};

// ============================================================================
// Factor Graph
// ============================================================================

export class FactorGraph {
  private nodes: Map<string, FactorNode> = new Map();
  private edges: Map<string, FactorEdge> = new Map();
  private previousBeliefs: Map<string, BeliefMap> = new Map();
  private convergenceState: ConvergenceState = {
    converged: false,
    iteration: 0,
    maxChange: 0,
    threshold: 0,
    elapsed: 0,
  };
  private economicFiber?: EconomicFiber;

  constructor(economicFiber?: EconomicFiber) {
    this.economicFiber = economicFiber;
    this.economicFiber?.registerModule('factor_graph', 10);
  }

  // --------------------------------------------------------------------------
  // Graph Construction
  // --------------------------------------------------------------------------

  /**
   * Add a factor node to the graph
   */
  addNode(id: string, computeFn: ComputeFunction = defaultComputeFn): void {
    if (this.nodes.has(id)) return;

    this.nodes.set(id, {
      id,
      beliefs: new Map(),
      computeFn,
      incomingMessages: [],
      outgoingMessages: [],
    });
  }

  /**
   * Add an edge between two nodes
   */
  addEdge(
    from: string,
    to: string,
    forwardPrecision: number = 1.0,
    backwardPrecision: number = 1.0
  ): void {
    if (!this.nodes.has(from)) {
      throw new Error(`Node ${from} does not exist`);
    }
    if (!this.nodes.has(to)) {
      throw new Error(`Node ${to} does not exist`);
    }

    const edgeKey = this.getEdgeKey(from, to);
    if (this.edges.has(edgeKey)) return;

    this.edges.set(edgeKey, {
      from,
      to,
      forwardPrecision,
      backwardPrecision,
      forwardBuffer: [],
      backwardBuffer: [],
    });
  }

  /**
   * Remove a node and its edges
   */
  removeNode(id: string): void {
    this.nodes.delete(id);

    // Remove all edges involving this node
    const edgesToRemove: string[] = [];
    for (const [key, edge] of this.edges) {
      if (edge.from === id || edge.to === id) {
        edgesToRemove.push(key);
      }
    }
    for (const key of edgesToRemove) {
      this.edges.delete(key);
    }
  }

  // --------------------------------------------------------------------------
  // Evidence and Observation
  // --------------------------------------------------------------------------

  /**
   * Inject evidence (observation) into a node
   */
  injectEvidence(nodeId: string, variable: string, value: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} does not exist`);
    }

    // Clamp value to [0, 1]
    const clampedValue = Math.max(0, Math.min(1, value));
    node.beliefs.set(variable, clampedValue);
  }

  /**
   * Inject multiple observations into the system
   */
  observeSystemState(observations: Record<string, Record<string, number>>): void {
    for (const [nodeId, variables] of Object.entries(observations)) {
      for (const [variable, value] of Object.entries(variables)) {
        this.injectEvidence(nodeId, variable, value);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Belief Propagation
  // --------------------------------------------------------------------------

  /**
   * Run belief propagation until convergence or max iterations
   */
  propagate(
    maxIterations: number = 10,
    convergenceThreshold: number = 0.01,
    dampingFactor: number = 0.5
  ): ConvergenceState {
    const startTime = Date.now();
    const config: PropagationConfig = {
      maxIterations,
      convergenceThreshold,
      dampingFactor,
      energyCostPerIteration: 0.1,
    };

    // Save previous beliefs for convergence check
    this.savePreviousBeliefs();

    for (let iter = 0; iter < maxIterations; iter++) {
      // Step 1: Each node computes outgoing messages
      for (const node of this.nodes.values()) {
        const outgoing = node.computeFn(node.id, node.beliefs, node.incomingMessages);
        node.outgoingMessages = outgoing;
      }

      // Step 2: Route messages through edges with precision weighting
      this.routeMessages(dampingFactor);

      // Step 3: Deliver messages to target nodes
      this.deliverMessages();

      // Step 4: Check convergence
      const maxChange = this.computeMaxBeliefChange();

      this.convergenceState = {
        converged: maxChange < convergenceThreshold,
        iteration: iter + 1,
        maxChange,
        threshold: convergenceThreshold,
        elapsed: Date.now() - startTime,
      };

      // Charge economic cost
      this.economicFiber?.recordCost('factor_graph', config.energyCostPerIteration, 'propagate_iteration');

      if (this.convergenceState.converged) {
        break;
      }

      // Save beliefs for next iteration comparison
      this.savePreviousBeliefs();
    }

    return this.convergenceState;
  }

  /**
   * Route messages through edges with precision weighting and damping
   */
  private routeMessages(dampingFactor: number): void {
    // Clear edge buffers
    for (const edge of this.edges.values()) {
      edge.forwardBuffer = [];
      edge.backwardBuffer = [];
    }

    // Route outgoing messages to appropriate edge buffers
    for (const node of this.nodes.values()) {
      for (const msg of node.outgoingMessages) {
        const forwardKey = this.getEdgeKey(msg.from, msg.to);
        const backwardKey = this.getEdgeKey(msg.to, msg.from);

        const forwardEdge = this.edges.get(forwardKey);
        const backwardEdge = this.edges.get(backwardKey);

        if (forwardEdge && forwardEdge.from === msg.from) {
          // Forward direction
          const dampedMsg = this.dampMessage(msg, dampingFactor);
          dampedMsg.precision *= forwardEdge.forwardPrecision;
          forwardEdge.forwardBuffer.push(dampedMsg);
        } else if (backwardEdge && backwardEdge.to === msg.from) {
          // Backward direction
          const dampedMsg = this.dampMessage(msg, dampingFactor);
          dampedMsg.precision *= backwardEdge.backwardPrecision;
          backwardEdge.backwardBuffer.push(dampedMsg);
        }
      }
    }
  }

  /**
   * Apply damping to prevent oscillation
   */
  private dampMessage(msg: FactorMessage, dampingFactor: number): FactorMessage {
    return {
      ...msg,
      precision: msg.precision * dampingFactor,
    };
  }

  /**
   * Deliver messages from edge buffers to target nodes
   */
  private deliverMessages(): void {
    // Clear incoming messages
    for (const node of this.nodes.values()) {
      node.incomingMessages = [];
    }

    // Deliver from edge buffers
    for (const edge of this.edges.values()) {
      const toNode = this.nodes.get(edge.to);
      const fromNode = this.nodes.get(edge.from);

      if (toNode) {
        toNode.incomingMessages.push(...edge.forwardBuffer);
      }
      if (fromNode) {
        fromNode.incomingMessages.push(...edge.backwardBuffer);
      }
    }
  }

  /**
   * Save current beliefs for convergence checking
   */
  private savePreviousBeliefs(): void {
    this.previousBeliefs.clear();
    for (const [nodeId, node] of this.nodes) {
      this.previousBeliefs.set(nodeId, new Map(node.beliefs));
    }
  }

  /**
   * Compute maximum belief change across all nodes
   */
  private computeMaxBeliefChange(): number {
    let maxChange = 0;

    for (const [nodeId, node] of this.nodes) {
      const prevBeliefs = this.previousBeliefs.get(nodeId);
      if (!prevBeliefs) continue;

      for (const [variable, currentValue] of node.beliefs) {
        const prevValue = prevBeliefs.get(variable) ?? 0.5; // Default to neutral
        const change = Math.abs(currentValue - prevValue);
        maxChange = Math.max(maxChange, change);
      }
    }

    return maxChange;
  }

  // --------------------------------------------------------------------------
  // Query
  // --------------------------------------------------------------------------

  /**
   * Get marginal belief for a variable at a node
   */
  getMarginal(nodeId: string, variable: string): number | undefined {
    const node = this.nodes.get(nodeId);
    return node?.beliefs.get(variable);
  }

  /**
   * Get all beliefs for a node
   */
  getNodeBeliefs(nodeId: string): BeliefMap | undefined {
    return this.nodes.get(nodeId)?.beliefs;
  }

  /**
   * Get convergence state
   */
  getConvergenceState(): ConvergenceState {
    return { ...this.convergenceState };
  }

  /**
   * Get all node IDs
   */
  getNodeIds(): string[] {
    return Array.from(this.nodes.keys());
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private getEdgeKey(from: string, to: string): string {
    return `${from}→${to}`;
  }

  /**
   * Export graph state for debugging
   */
  exportState(): {
    nodes: Record<string, { beliefs: Record<string, number> }>;
    edges: Array<{ from: string; to: string }>;
    convergence: ConvergenceState;
  } {
    const nodes: Record<string, { beliefs: Record<string, number> }> = {};
    for (const [id, node] of this.nodes) {
      nodes[id] = {
        beliefs: Object.fromEntries(node.beliefs),
      };
    }

    const edges = Array.from(this.edges.values()).map(e => ({
      from: e.from,
      to: e.to,
    }));

    return {
      nodes,
      edges,
      convergence: this.convergenceState,
    };
  }
}

// ============================================================================
// Pre-configured Genesis Topology
// ============================================================================

/**
 * Create factor graph with Genesis module topology:
 *   FEK ←→ Brain ←→ Consciousness
 *    ↕         ↕          ↕
 *   Economy ←→ Metacognition ←→ Sensorimotor
 */
export function createGenesisFactorGraph(economicFiber?: EconomicFiber): FactorGraph {
  const graph = new FactorGraph(economicFiber);

  // Add nodes
  const modules = ['FEK', 'Brain', 'Consciousness', 'Economy', 'Metacognition', 'Sensorimotor'];
  for (const module of modules) {
    graph.addNode(module);
  }

  // Top row: FEK ←→ Brain ←→ Consciousness
  graph.addEdge('FEK', 'Brain', 0.9, 0.9);
  graph.addEdge('Brain', 'Consciousness', 0.8, 0.8);

  // Bottom row: Economy ←→ Metacognition ←→ Sensorimotor
  graph.addEdge('Economy', 'Metacognition', 0.7, 0.7);
  graph.addEdge('Metacognition', 'Sensorimotor', 0.7, 0.7);

  // Vertical connections
  graph.addEdge('FEK', 'Economy', 0.85, 0.85);
  graph.addEdge('Brain', 'Metacognition', 0.75, 0.75);
  graph.addEdge('Consciousness', 'Sensorimotor', 0.65, 0.65);

  return graph;
}

// ============================================================================
// Singleton Pattern
// ============================================================================

let globalFactorGraph: FactorGraph | undefined;

/**
 * Get global factor graph instance (singleton)
 */
export function getFactorGraph(economicFiber?: EconomicFiber): FactorGraph {
  if (!globalFactorGraph) {
    globalFactorGraph = createGenesisFactorGraph(economicFiber);
  }
  return globalFactorGraph;
}

/**
 * Reset global factor graph (for testing)
 */
export function resetFactorGraph(): void {
  globalFactorGraph = undefined;
}

// ============================================================================
// System Integration
// ============================================================================

/**
 * Observe system state and run belief propagation
 *
 * @example
 * ```typescript
 * await observeAndPropagate({
 *   FEK: { threat_level: 0.8, task_urgency: 0.6 },
 *   Brain: { cognitive_load: 0.7 },
 *   Economy: { budget_health: 0.5 }
 * });
 * ```
 */
export async function observeAndPropagate(
  observations: Record<string, Record<string, number>>,
  economicFiber?: EconomicFiber
): Promise<ConvergenceState> {
  const graph = getFactorGraph(economicFiber);

  // Inject observations
  graph.observeSystemState(observations);

  // Run belief propagation
  const result = graph.propagate(10, 0.01, 0.5);

  return result;
}

/**
 * Query current belief state across all modules
 */
export function queryBeliefs(
  variables: string[],
  economicFiber?: EconomicFiber
): Record<string, Record<string, number | undefined>> {
  const graph = getFactorGraph(economicFiber);
  const result: Record<string, Record<string, number | undefined>> = {};

  for (const nodeId of graph.getNodeIds()) {
    result[nodeId] = {};
    for (const variable of variables) {
      result[nodeId][variable] = graph.getMarginal(nodeId, variable);
    }
  }

  return result;
}
