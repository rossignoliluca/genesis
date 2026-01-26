/**
 * Swarm Dynamics Module - Collective Intelligence and Emergence
 *
 * Implements swarm-based multi-agent coordination:
 * - Langevin dynamics for agent state updates
 * - Social and cognitive force computation
 * - Emergence detection and pattern recognition
 * - Collective consensus mechanisms
 *
 * Based on:
 * - Nature Communications 2025 swarm dynamics models
 * - Reynolds flocking algorithms
 * - Vicsek model for collective motion
 * - Ant colony optimization principles
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export interface SwarmAgent {
  id: string;
  position: number[];       // State vector in latent space
  velocity: number[];       // Direction of change
  mass: number;             // Inertia (resistance to change)
  charge: number;           // Attraction/repulsion coefficient
  temperature: number;      // Stochastic noise level
  neighbors: string[];      // Connected agents
  metadata?: Record<string, unknown>;
}

export interface SwarmForce {
  type: 'social' | 'cognitive' | 'stochastic' | 'alignment' | 'cohesion' | 'separation';
  magnitude: number;
  direction: number[];
  source?: string;
}

export interface EmergentPattern {
  id: string;
  type: PatternType;
  agents: string[];
  centerOfMass: number[];
  coherence: number;        // 0-1 how organized
  stability: number;        // 0-1 how persistent
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export type PatternType =
  | 'cluster'               // Agents grouped together
  | 'stream'                // Agents moving in same direction
  | 'vortex'                // Agents rotating around center
  | 'consensus'             // Agents converged to same state
  | 'polarization'          // Agents split into opposing groups
  | 'oscillation'           // Agents alternating between states
  | 'hierarchy';            // Leader-follower structure

export interface ConsensusResult {
  achieved: boolean;
  value: unknown;
  confidence: number;
  participation: number;    // Fraction of agents that participated
  iterations: number;
  convergenceTime: number;
}

export interface SwarmConfig {
  // Dynamics parameters
  timestep: number;
  friction: number;         // Damping coefficient
  noiseScale: number;       // Langevin noise magnitude

  // Force weights
  socialWeight: number;
  cognitiveWeight: number;
  alignmentWeight: number;
  cohesionWeight: number;
  separationWeight: number;

  // Thresholds
  neighborRadius: number;
  separationRadius: number;
  consensusThreshold: number;
  emergenceThreshold: number;

  // Limits
  maxVelocity: number;
  maxForce: number;
  maxIterations: number;
}

export interface SwarmState {
  agents: Map<string, SwarmAgent>;
  patterns: EmergentPattern[];
  globalOrder: number;      // 0-1 system-wide organization
  entropy: number;          // System disorder
  timestamp: number;
}

export interface SwarmMetrics {
  agentCount: number;
  averageVelocity: number;
  orderParameter: number;
  clusterCount: number;
  entropy: number;
  consensusProgress: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: SwarmConfig = {
  timestep: 0.1,
  friction: 0.1,
  noiseScale: 0.1,

  socialWeight: 1.0,
  cognitiveWeight: 1.0,
  alignmentWeight: 0.5,
  cohesionWeight: 0.3,
  separationWeight: 0.8,

  neighborRadius: 5.0,
  separationRadius: 1.0,
  consensusThreshold: 0.95,
  emergenceThreshold: 0.7,

  maxVelocity: 2.0,
  maxForce: 1.0,
  maxIterations: 1000
};

// ============================================================================
// Vector Operations
// ============================================================================

function vectorAdd(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + (b[i] || 0));
}

function vectorSubtract(a: number[], b: number[]): number[] {
  return a.map((v, i) => v - (b[i] || 0));
}

function vectorScale(v: number[], s: number): number[] {
  return v.map(x => x * s);
}

function vectorMagnitude(v: number[]): number {
  return Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
}

function vectorNormalize(v: number[]): number[] {
  const mag = vectorMagnitude(v);
  return mag > 0 ? vectorScale(v, 1 / mag) : v.map(() => 0);
}

function vectorDistance(a: number[], b: number[]): number {
  return vectorMagnitude(vectorSubtract(a, b));
}

function vectorDot(a: number[], b: number[]): number {
  return a.reduce((sum, v, i) => sum + v * (b[i] || 0), 0);
}

function vectorClamp(v: number[], maxMag: number): number[] {
  const mag = vectorMagnitude(v);
  return mag > maxMag ? vectorScale(vectorNormalize(v), maxMag) : v;
}

function randomGaussian(): number {
  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function randomVector(dim: number, scale: number = 1): number[] {
  return Array(dim).fill(0).map(() => randomGaussian() * scale);
}

// ============================================================================
// Swarm Dynamics Engine
// ============================================================================

export class SwarmDynamics extends EventEmitter {
  private config: SwarmConfig;
  private agents: Map<string, SwarmAgent>;
  private patterns: EmergentPattern[];
  private cognitiveTarget: number[] | null;
  private time: number;

  constructor(config: Partial<SwarmConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.agents = new Map();
    this.patterns = [];
    this.cognitiveTarget = null;
    this.time = 0;
  }

  /**
   * Add an agent to the swarm
   */
  addAgent(agent: SwarmAgent): void {
    this.agents.set(agent.id, { ...agent });
    this.emit('agent:added', agent);
  }

  /**
   * Remove an agent from the swarm
   */
  removeAgent(id: string): boolean {
    const agent = this.agents.get(id);
    if (agent) {
      this.agents.delete(id);
      this.emit('agent:removed', agent);
      return true;
    }
    return false;
  }

  /**
   * Get an agent by ID
   */
  getAgent(id: string): SwarmAgent | undefined {
    return this.agents.get(id);
  }

  /**
   * Get all agents
   */
  getAllAgents(): SwarmAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Set cognitive target (global attractor)
   */
  setCognitiveTarget(target: number[]): void {
    this.cognitiveTarget = [...target];
  }

  /**
   * Perform one timestep of Langevin dynamics
   * dx = (F_social + F_cognitive + F_alignment) * dt + sqrt(2T/m) * dW
   */
  step(): void {
    const dt = this.config.timestep;
    const updates: Map<string, { position: number[]; velocity: number[] }> = new Map();

    for (const [id, agent] of this.agents) {
      // Compute all forces
      const socialForce = this.computeSocialForce(agent);
      const cognitiveForce = this.computeCognitiveForce(agent);
      const alignmentForce = this.computeAlignmentForce(agent);
      const cohesionForce = this.computeCohesionForce(agent);
      const separationForce = this.computeSeparationForce(agent);

      // Combine weighted forces
      let totalForce = vectorAdd(
        vectorScale(socialForce.direction, socialForce.magnitude * this.config.socialWeight),
        vectorScale(cognitiveForce.direction, cognitiveForce.magnitude * this.config.cognitiveWeight)
      );
      totalForce = vectorAdd(totalForce,
        vectorScale(alignmentForce.direction, alignmentForce.magnitude * this.config.alignmentWeight));
      totalForce = vectorAdd(totalForce,
        vectorScale(cohesionForce.direction, cohesionForce.magnitude * this.config.cohesionWeight));
      totalForce = vectorAdd(totalForce,
        vectorScale(separationForce.direction, separationForce.magnitude * this.config.separationWeight));

      // Clamp total force
      totalForce = vectorClamp(totalForce, this.config.maxForce);

      // Add friction (damping)
      const frictionForce = vectorScale(agent.velocity, -this.config.friction);
      totalForce = vectorAdd(totalForce, frictionForce);

      // Langevin noise (thermal fluctuations)
      const noiseScale = Math.sqrt(2 * agent.temperature / agent.mass) * this.config.noiseScale;
      const noise = randomVector(agent.position.length, noiseScale * Math.sqrt(dt));

      // Update velocity (Euler-Maruyama)
      let newVelocity = vectorAdd(
        agent.velocity,
        vectorAdd(
          vectorScale(totalForce, dt / agent.mass),
          noise
        )
      );

      // Clamp velocity
      newVelocity = vectorClamp(newVelocity, this.config.maxVelocity);

      // Update position
      const newPosition = vectorAdd(agent.position, vectorScale(newVelocity, dt));

      updates.set(id, { position: newPosition, velocity: newVelocity });
    }

    // Apply updates
    for (const [id, update] of updates) {
      const agent = this.agents.get(id);
      if (agent) {
        agent.position = update.position;
        agent.velocity = update.velocity;
      }
    }

    // Update neighbors
    this.updateNeighbors();

    // Detect emergent patterns
    this.detectEmergentPatterns();

    this.time += dt;
    this.emit('step', { time: this.time, agents: this.getAllAgents() });
  }

  /**
   * Run multiple steps
   */
  run(steps: number): void {
    for (let i = 0; i < steps; i++) {
      this.step();
    }
  }

  /**
   * Compute social force (attraction to other agents)
   */
  private computeSocialForce(agent: SwarmAgent): SwarmForce {
    const neighbors = this.getNeighbors(agent);
    if (neighbors.length === 0) {
      return { type: 'social', magnitude: 0, direction: agent.position.map(() => 0) };
    }

    let force = agent.position.map(() => 0);
    for (const neighbor of neighbors) {
      const diff = vectorSubtract(neighbor.position, agent.position);
      const dist = vectorMagnitude(diff);
      if (dist > 0) {
        // Coulomb-like force: F = k * q1 * q2 / r^2
        const strength = agent.charge * neighbor.charge / (dist * dist);
        force = vectorAdd(force, vectorScale(vectorNormalize(diff), strength));
      }
    }

    return {
      type: 'social',
      magnitude: vectorMagnitude(force),
      direction: vectorNormalize(force)
    };
  }

  /**
   * Compute cognitive force (attraction to goal/target)
   */
  private computeCognitiveForce(agent: SwarmAgent): SwarmForce {
    if (!this.cognitiveTarget) {
      return { type: 'cognitive', magnitude: 0, direction: agent.position.map(() => 0) };
    }

    const diff = vectorSubtract(this.cognitiveTarget, agent.position);
    const dist = vectorMagnitude(diff);

    return {
      type: 'cognitive',
      magnitude: dist,
      direction: vectorNormalize(diff)
    };
  }

  /**
   * Compute alignment force (match neighbor velocities)
   */
  private computeAlignmentForce(agent: SwarmAgent): SwarmForce {
    const neighbors = this.getNeighbors(agent);
    if (neighbors.length === 0) {
      return { type: 'alignment', magnitude: 0, direction: agent.position.map(() => 0) };
    }

    // Average velocity of neighbors
    let avgVelocity = agent.velocity.map(() => 0);
    for (const neighbor of neighbors) {
      avgVelocity = vectorAdd(avgVelocity, neighbor.velocity);
    }
    avgVelocity = vectorScale(avgVelocity, 1 / neighbors.length);

    const diff = vectorSubtract(avgVelocity, agent.velocity);

    return {
      type: 'alignment',
      magnitude: vectorMagnitude(diff),
      direction: vectorNormalize(diff)
    };
  }

  /**
   * Compute cohesion force (move toward center of neighbors)
   */
  private computeCohesionForce(agent: SwarmAgent): SwarmForce {
    const neighbors = this.getNeighbors(agent);
    if (neighbors.length === 0) {
      return { type: 'cohesion', magnitude: 0, direction: agent.position.map(() => 0) };
    }

    // Center of mass of neighbors
    let com = agent.position.map(() => 0);
    for (const neighbor of neighbors) {
      com = vectorAdd(com, neighbor.position);
    }
    com = vectorScale(com, 1 / neighbors.length);

    const diff = vectorSubtract(com, agent.position);

    return {
      type: 'cohesion',
      magnitude: vectorMagnitude(diff),
      direction: vectorNormalize(diff)
    };
  }

  /**
   * Compute separation force (avoid collisions)
   */
  private computeSeparationForce(agent: SwarmAgent): SwarmForce {
    const neighbors = this.getNeighbors(agent);
    let force = agent.position.map(() => 0);

    for (const neighbor of neighbors) {
      const diff = vectorSubtract(agent.position, neighbor.position);
      const dist = vectorMagnitude(diff);

      if (dist < this.config.separationRadius && dist > 0) {
        // Stronger repulsion when closer
        const strength = (this.config.separationRadius - dist) / this.config.separationRadius;
        force = vectorAdd(force, vectorScale(vectorNormalize(diff), strength));
      }
    }

    return {
      type: 'separation',
      magnitude: vectorMagnitude(force),
      direction: vectorNormalize(force)
    };
  }

  /**
   * Get neighbors within radius
   */
  private getNeighbors(agent: SwarmAgent): SwarmAgent[] {
    const neighbors: SwarmAgent[] = [];

    for (const [id, other] of this.agents) {
      if (id === agent.id) continue;

      const dist = vectorDistance(agent.position, other.position);
      if (dist <= this.config.neighborRadius) {
        neighbors.push(other);
      }
    }

    return neighbors;
  }

  /**
   * Update neighbor lists for all agents
   */
  private updateNeighbors(): void {
    for (const [id, agent] of this.agents) {
      agent.neighbors = this.getNeighbors(agent).map(n => n.id);
    }
  }

  /**
   * Detect emergent patterns in the swarm
   */
  detectEmergentPatterns(): EmergentPattern[] {
    const patterns: EmergentPattern[] = [];
    const agents = this.getAllAgents();

    if (agents.length < 2) return patterns;

    // Detect clusters using simple distance-based grouping
    const clusters = this.detectClusters(agents);
    patterns.push(...clusters);

    // Detect streaming (aligned velocities)
    const streams = this.detectStreams(agents);
    patterns.push(...streams);

    // Detect consensus (converged positions)
    const consensus = this.detectConsensus(agents);
    if (consensus) patterns.push(consensus);

    // Detect polarization (bimodal distribution)
    const polarization = this.detectPolarization(agents);
    if (polarization) patterns.push(polarization);

    this.patterns = patterns;

    for (const pattern of patterns) {
      this.emit('pattern:detected', pattern);
    }

    return patterns;
  }

  /**
   * Detect clusters using distance-based grouping
   */
  private detectClusters(agents: SwarmAgent[]): EmergentPattern[] {
    const clusters: EmergentPattern[] = [];
    const visited = new Set<string>();

    for (const agent of agents) {
      if (visited.has(agent.id)) continue;

      // Find all connected agents (flood fill)
      const cluster: SwarmAgent[] = [];
      const queue = [agent];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current.id)) continue;

        visited.add(current.id);
        cluster.push(current);

        const neighbors = this.getNeighbors(current);
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor.id)) {
            queue.push(neighbor);
          }
        }
      }

      if (cluster.length >= 2) {
        // Compute center of mass
        let com = cluster[0].position.map(() => 0);
        for (const a of cluster) {
          com = vectorAdd(com, a.position);
        }
        com = vectorScale(com, 1 / cluster.length);

        // Compute coherence (how close to center)
        let avgDist = 0;
        for (const a of cluster) {
          avgDist += vectorDistance(a.position, com);
        }
        avgDist /= cluster.length;

        const coherence = 1 / (1 + avgDist);

        if (coherence >= this.config.emergenceThreshold) {
          clusters.push({
            id: `cluster-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'cluster',
            agents: cluster.map(a => a.id),
            centerOfMass: com,
            coherence,
            stability: 0.5, // Would need history to compute properly
            timestamp: Date.now()
          });
        }
      }
    }

    return clusters;
  }

  /**
   * Detect streams (aligned movement)
   */
  private detectStreams(agents: SwarmAgent[]): EmergentPattern[] {
    if (agents.length < 2) return [];

    // Compute average velocity direction
    let avgVelocity = agents[0].velocity.map(() => 0);
    for (const agent of agents) {
      avgVelocity = vectorAdd(avgVelocity, agent.velocity);
    }
    avgVelocity = vectorScale(avgVelocity, 1 / agents.length);
    const avgDir = vectorNormalize(avgVelocity);

    // Compute order parameter (how aligned)
    let order = 0;
    for (const agent of agents) {
      const dir = vectorNormalize(agent.velocity);
      order += Math.abs(vectorDot(dir, avgDir));
    }
    order /= agents.length;

    if (order >= this.config.emergenceThreshold) {
      // Compute center of mass
      let com = agents[0].position.map(() => 0);
      for (const a of agents) {
        com = vectorAdd(com, a.position);
      }
      com = vectorScale(com, 1 / agents.length);

      return [{
        id: `stream-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'stream',
        agents: agents.map(a => a.id),
        centerOfMass: com,
        coherence: order,
        stability: 0.5,
        timestamp: Date.now(),
        metadata: { direction: avgDir }
      }];
    }

    return [];
  }

  /**
   * Detect consensus (positions converged)
   */
  private detectConsensus(agents: SwarmAgent[]): EmergentPattern | null {
    if (agents.length < 2) return null;

    // Compute center of mass
    let com = agents[0].position.map(() => 0);
    for (const a of agents) {
      com = vectorAdd(com, a.position);
    }
    com = vectorScale(com, 1 / agents.length);

    // Compute variance from center
    let variance = 0;
    for (const agent of agents) {
      variance += vectorDistance(agent.position, com);
    }
    variance /= agents.length;

    // Low variance = consensus
    const coherence = 1 / (1 + variance);

    if (coherence >= this.config.consensusThreshold) {
      return {
        id: `consensus-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'consensus',
        agents: agents.map(a => a.id),
        centerOfMass: com,
        coherence,
        stability: 0.8,
        timestamp: Date.now()
      };
    }

    return null;
  }

  /**
   * Detect polarization (two opposing groups)
   */
  private detectPolarization(agents: SwarmAgent[]): EmergentPattern | null {
    if (agents.length < 4) return null;

    // Use k-means with k=2 to detect bimodal distribution
    const dim = agents[0].position.length;

    // Initialize centroids
    let c1 = [...agents[0].position];
    let c2 = [...agents[agents.length - 1].position];

    for (let iter = 0; iter < 10; iter++) {
      const group1: SwarmAgent[] = [];
      const group2: SwarmAgent[] = [];

      // Assign to closest centroid
      for (const agent of agents) {
        const d1 = vectorDistance(agent.position, c1);
        const d2 = vectorDistance(agent.position, c2);
        if (d1 < d2) {
          group1.push(agent);
        } else {
          group2.push(agent);
        }
      }

      if (group1.length === 0 || group2.length === 0) break;

      // Update centroids
      c1 = group1[0].position.map(() => 0);
      for (const a of group1) {
        c1 = vectorAdd(c1, a.position);
      }
      c1 = vectorScale(c1, 1 / group1.length);

      c2 = group2[0].position.map(() => 0);
      for (const a of group2) {
        c2 = vectorAdd(c2, a.position);
      }
      c2 = vectorScale(c2, 1 / group2.length);
    }

    // Check if groups are well-separated
    const interDist = vectorDistance(c1, c2);

    // Compute intra-group variance
    let var1 = 0, var2 = 0;
    const group1: SwarmAgent[] = [];
    const group2: SwarmAgent[] = [];

    for (const agent of agents) {
      const d1 = vectorDistance(agent.position, c1);
      const d2 = vectorDistance(agent.position, c2);
      if (d1 < d2) {
        group1.push(agent);
        var1 += d1;
      } else {
        group2.push(agent);
        var2 += d2;
      }
    }

    if (group1.length > 0) var1 /= group1.length;
    if (group2.length > 0) var2 /= group2.length;

    const avgVar = (var1 + var2) / 2;
    const separation = interDist / (avgVar + 0.001);

    if (separation > 3 && group1.length >= 2 && group2.length >= 2) {
      const com = vectorScale(vectorAdd(c1, c2), 0.5);

      return {
        id: `polarization-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'polarization',
        agents: agents.map(a => a.id),
        centerOfMass: com,
        coherence: Math.min(1, separation / 5),
        stability: 0.6,
        timestamp: Date.now(),
        metadata: {
          group1: group1.map(a => a.id),
          group2: group2.map(a => a.id),
          centroid1: c1,
          centroid2: c2
        }
      };
    }

    return null;
  }

  /**
   * Achieve consensus on a question/value
   */
  async swarmConsensus(
    question: unknown,
    agentResponses: (agent: SwarmAgent, question: unknown) => Promise<number[]>
  ): Promise<ConsensusResult> {
    const startTime = Date.now();

    // Get initial responses
    for (const agent of this.agents.values()) {
      const response = await agentResponses(agent, question);
      agent.position = response;
      agent.velocity = randomVector(response.length, 0.1);
    }

    // Run dynamics until consensus or max iterations
    let iterations = 0;
    let consensus: EmergentPattern | null = null;

    while (iterations < this.config.maxIterations) {
      this.step();
      iterations++;

      // Check for consensus
      const patterns = this.detectEmergentPatterns();
      consensus = patterns.find(p => p.type === 'consensus') || null;

      if (consensus) break;
    }

    const agents = this.getAllAgents();

    if (consensus) {
      return {
        achieved: true,
        value: consensus.centerOfMass,
        confidence: consensus.coherence,
        participation: consensus.agents.length / agents.length,
        iterations,
        convergenceTime: Date.now() - startTime
      };
    }

    // No consensus - return average position
    let avgPos = agents[0].position.map(() => 0);
    for (const agent of agents) {
      avgPos = vectorAdd(avgPos, agent.position);
    }
    avgPos = vectorScale(avgPos, 1 / agents.length);

    return {
      achieved: false,
      value: avgPos,
      confidence: 0.5,
      participation: 1.0,
      iterations,
      convergenceTime: Date.now() - startTime
    };
  }

  /**
   * Get current swarm state
   */
  getState(): SwarmState {
    const agents = this.getAllAgents();

    // Compute global order parameter
    if (agents.length === 0) {
      return {
        agents: new Map(),
        patterns: [],
        globalOrder: 0,
        entropy: 0,
        timestamp: Date.now()
      };
    }

    let avgVelocity = agents[0].velocity.map(() => 0);
    for (const agent of agents) {
      avgVelocity = vectorAdd(avgVelocity, vectorNormalize(agent.velocity));
    }
    const globalOrder = vectorMagnitude(avgVelocity) / agents.length;

    // Compute entropy (based on position spread)
    let com = agents[0].position.map(() => 0);
    for (const a of agents) {
      com = vectorAdd(com, a.position);
    }
    com = vectorScale(com, 1 / agents.length);

    let variance = 0;
    for (const agent of agents) {
      variance += vectorDistance(agent.position, com);
    }
    variance /= agents.length;
    const entropy = Math.log(1 + variance);

    return {
      agents: new Map(this.agents),
      patterns: [...this.patterns],
      globalOrder,
      entropy,
      timestamp: Date.now()
    };
  }

  /**
   * Get metrics
   */
  getMetrics(): SwarmMetrics {
    const agents = this.getAllAgents();

    if (agents.length === 0) {
      return {
        agentCount: 0,
        averageVelocity: 0,
        orderParameter: 0,
        clusterCount: 0,
        entropy: 0,
        consensusProgress: 0
      };
    }

    const state = this.getState();

    // Average velocity magnitude
    let avgVel = 0;
    for (const agent of agents) {
      avgVel += vectorMagnitude(agent.velocity);
    }
    avgVel /= agents.length;

    // Consensus progress (inverse of variance)
    let com = agents[0].position.map(() => 0);
    for (const a of agents) {
      com = vectorAdd(com, a.position);
    }
    com = vectorScale(com, 1 / agents.length);

    let variance = 0;
    for (const agent of agents) {
      variance += vectorDistance(agent.position, com);
    }
    variance /= agents.length;
    const consensusProgress = 1 / (1 + variance);

    return {
      agentCount: agents.length,
      averageVelocity: avgVel,
      orderParameter: state.globalOrder,
      clusterCount: state.patterns.filter(p => p.type === 'cluster').length,
      entropy: state.entropy,
      consensusProgress
    };
  }

  /**
   * Reset the swarm
   */
  reset(): void {
    this.agents.clear();
    this.patterns = [];
    this.cognitiveTarget = null;
    this.time = 0;
    this.emit('reset');
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a swarm agent with default values
 */
export function createAgent(
  id: string,
  position: number[],
  options: Partial<SwarmAgent> = {}
): SwarmAgent {
  return {
    id,
    position,
    velocity: options.velocity || position.map(() => 0),
    mass: options.mass || 1.0,
    charge: options.charge || 1.0,
    temperature: options.temperature || 1.0,
    neighbors: [],
    ...options
  };
}

/**
 * Create multiple agents with random positions
 */
export function createRandomSwarm(
  count: number,
  dimensions: number,
  spread: number = 10
): SwarmAgent[] {
  return Array(count).fill(0).map((_, i) => ({
    id: `agent-${i}`,
    position: randomVector(dimensions, spread),
    velocity: randomVector(dimensions, 0.1),
    mass: 1.0,
    charge: 1.0,
    temperature: 1.0,
    neighbors: []
  }));
}

// ============================================================================
// Global Instance
// ============================================================================

let globalSwarm: SwarmDynamics | null = null;

/**
 * Get global swarm dynamics instance
 */
export function getSwarmDynamics(config?: Partial<SwarmConfig>): SwarmDynamics {
  if (!globalSwarm) {
    globalSwarm = new SwarmDynamics(config);
  }
  return globalSwarm;
}

/**
 * Reset global swarm
 */
export function resetSwarmDynamics(): void {
  if (globalSwarm) {
    globalSwarm.reset();
  }
  globalSwarm = null;
}
