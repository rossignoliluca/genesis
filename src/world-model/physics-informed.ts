/**
 * PHYSICS-INFORMED WORLD MODEL
 *
 * Incorporates physical priors and constraints into world model predictions.
 * Learns dynamics that respect conservation laws and physical principles.
 *
 * Principles integrated:
 * - Conservation of energy
 * - Conservation of momentum
 * - Symmetry constraints (Noether's theorem)
 * - Hamiltonian/Lagrangian mechanics
 * - Soft constraints via loss terms
 *
 * Based on:
 * - Physics-Informed Neural Networks (PINNs)
 * - Hamiltonian Neural Networks
 * - Lagrangian Neural Networks
 * - Structure-Preserving Machine Learning
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PhysicsConfig {
  stateDim: number;           // State space dimension
  conservationLaws: ConservationLaw[];
  symmetries: Symmetry[];
  hamiltonianPrior: boolean;
  softConstraintWeight: number;
  integrationMethod: 'euler' | 'rk4' | 'symplectic';
}

export interface ConservationLaw {
  name: string;
  type: 'energy' | 'momentum' | 'charge' | 'custom';
  computeQuantity: (state: PhysicsState) => number;
  tolerance: number;
}

export interface Symmetry {
  name: string;
  type: 'translation' | 'rotation' | 'time' | 'custom';
  generator: (state: PhysicsState) => PhysicsState;
}

export interface PhysicsState {
  position: number[];      // Generalized positions q
  velocity: number[];      // Generalized velocities q_dot
  mass: number[];          // Mass/inertia for each DOF
  potential: number;       // Potential energy V(q)
  kinetic: number;         // Kinetic energy T(q_dot)
  time: number;
}

export interface PhysicsPrediction {
  nextState: PhysicsState;
  conservationViolations: Map<string, number>;
  confidence: number;
  physicsLoss: number;
}

// ============================================================================
// PHYSICS-INFORMED WORLD MODEL
// ============================================================================

export class PhysicsInformedWorldModel {
  private config: PhysicsConfig;
  private dynamicsNetwork: DynamicsNetwork;
  private hamiltonianNetwork: HamiltonianNetwork | null = null;
  private constraintEnforcer: ConstraintEnforcer;

  constructor(config: Partial<PhysicsConfig> = {}) {
    this.config = {
      stateDim: 6,
      conservationLaws: [
        {
          name: 'energy',
          type: 'energy',
          computeQuantity: (s) => s.kinetic + s.potential,
          tolerance: 0.01
        }
      ],
      symmetries: [],
      hamiltonianPrior: true,
      softConstraintWeight: 1.0,
      integrationMethod: 'symplectic',
      ...config
    };

    this.dynamicsNetwork = new DynamicsNetwork(this.config.stateDim);

    if (this.config.hamiltonianPrior) {
      this.hamiltonianNetwork = new HamiltonianNetwork(this.config.stateDim);
    }

    this.constraintEnforcer = new ConstraintEnforcer(this.config);
  }

  // --------------------------------------------------------------------------
  // FORWARD DYNAMICS
  // --------------------------------------------------------------------------

  /**
   * Predict next state with physics constraints
   */
  predict(state: PhysicsState, dt: number = 0.01): PhysicsPrediction {
    let nextState: PhysicsState;

    if (this.config.hamiltonianPrior && this.hamiltonianNetwork) {
      // Use Hamiltonian dynamics (energy-preserving)
      nextState = this.hamiltonianStep(state, dt);
    } else {
      // Use learned dynamics with constraints
      nextState = this.learnedDynamicsStep(state, dt);
    }

    // Apply constraint enforcement
    nextState = this.constraintEnforcer.enforce(state, nextState);

    // Compute conservation violations
    const violations = this.computeConservationViolations(state, nextState);

    // Compute physics loss (for training)
    const physicsLoss = this.computePhysicsLoss(state, nextState, violations);

    // Confidence based on constraint satisfaction
    const maxViolation = Math.max(...violations.values(), 0);
    const confidence = Math.exp(-maxViolation * 10);

    return {
      nextState,
      conservationViolations: violations,
      confidence,
      physicsLoss
    };
  }

  /**
   * Simulate trajectory forward
   */
  simulate(initialState: PhysicsState, numSteps: number, dt: number = 0.01): {
    trajectory: PhysicsState[];
    totalConservationError: number;
  } {
    const trajectory: PhysicsState[] = [initialState];
    let totalError = 0;

    let state = initialState;
    for (let i = 0; i < numSteps; i++) {
      const prediction = this.predict(state, dt);
      trajectory.push(prediction.nextState);

      for (const violation of prediction.conservationViolations.values()) {
        totalError += Math.abs(violation);
      }

      state = prediction.nextState;
    }

    return {
      trajectory,
      totalConservationError: totalError / numSteps
    };
  }

  // --------------------------------------------------------------------------
  // HAMILTONIAN DYNAMICS
  // --------------------------------------------------------------------------

  private hamiltonianStep(state: PhysicsState, dt: number): PhysicsState {
    // Hamiltonian mechanics: dq/dt = ∂H/∂p, dp/dt = -∂H/∂q
    const H = this.hamiltonianNetwork!;
    const { position: q, velocity: p, mass } = state;

    // Compute Hamiltonian gradients
    const dH_dq = H.gradientPosition(q, p);
    const dH_dp = H.gradientMomentum(q, p);

    let newQ: number[];
    let newP: number[];

    switch (this.config.integrationMethod) {
      case 'symplectic':
        // Symplectic Euler (preserves phase space volume)
        newP = p.map((pi, i) => pi - dt * dH_dq[i]);
        const dH_dp_new = H.gradientMomentum(q, newP);
        newQ = q.map((qi, i) => qi + dt * dH_dp_new[i]);
        break;

      case 'rk4':
        // RK4 (more accurate but doesn't preserve structure)
        const result = this.rk4Step(state, dt);
        newQ = result.position;
        newP = result.velocity;
        break;

      default:  // euler
        newQ = q.map((qi, i) => qi + dt * dH_dp[i]);
        newP = p.map((pi, i) => pi - dt * dH_dq[i]);
    }

    // Compute energies
    const kinetic = this.computeKineticEnergy(newP, mass);
    const potential = this.computePotentialEnergy(newQ);

    return {
      position: newQ,
      velocity: newP,
      mass: [...mass],
      kinetic,
      potential,
      time: state.time + dt
    };
  }

  private rk4Step(state: PhysicsState, dt: number): { position: number[]; velocity: number[] } {
    const H = this.hamiltonianNetwork!;
    const { position: q, velocity: p } = state;
    const n = q.length;

    const k1_q = H.gradientMomentum(q, p);
    const k1_p = H.gradientPosition(q, p).map(x => -x);

    const q2 = q.map((qi, i) => qi + 0.5 * dt * k1_q[i]);
    const p2 = p.map((pi, i) => pi + 0.5 * dt * k1_p[i]);
    const k2_q = H.gradientMomentum(q2, p2);
    const k2_p = H.gradientPosition(q2, p2).map(x => -x);

    const q3 = q.map((qi, i) => qi + 0.5 * dt * k2_q[i]);
    const p3 = p.map((pi, i) => pi + 0.5 * dt * k2_p[i]);
    const k3_q = H.gradientMomentum(q3, p3);
    const k3_p = H.gradientPosition(q3, p3).map(x => -x);

    const q4 = q.map((qi, i) => qi + dt * k3_q[i]);
    const p4 = p.map((pi, i) => pi + dt * k3_p[i]);
    const k4_q = H.gradientMomentum(q4, p4);
    const k4_p = H.gradientPosition(q4, p4).map(x => -x);

    const newQ = q.map((qi, i) =>
      qi + (dt / 6) * (k1_q[i] + 2 * k2_q[i] + 2 * k3_q[i] + k4_q[i])
    );
    const newP = p.map((pi, i) =>
      pi + (dt / 6) * (k1_p[i] + 2 * k2_p[i] + 2 * k3_p[i] + k4_p[i])
    );

    return { position: newQ, velocity: newP };
  }

  // --------------------------------------------------------------------------
  // LEARNED DYNAMICS
  // --------------------------------------------------------------------------

  private learnedDynamicsStep(state: PhysicsState, dt: number): PhysicsState {
    // Use neural network to predict state change
    const stateVec = [...state.position, ...state.velocity];
    const dState = this.dynamicsNetwork.forward(stateVec);

    const n = state.position.length;
    const newPos = state.position.map((q, i) => q + dt * dState[i]);
    const newVel = state.velocity.map((v, i) => v + dt * dState[n + i]);

    const kinetic = this.computeKineticEnergy(newVel, state.mass);
    const potential = this.computePotentialEnergy(newPos);

    return {
      position: newPos,
      velocity: newVel,
      mass: [...state.mass],
      kinetic,
      potential,
      time: state.time + dt
    };
  }

  // --------------------------------------------------------------------------
  // CONSERVATION & CONSTRAINTS
  // --------------------------------------------------------------------------

  private computeConservationViolations(
    prevState: PhysicsState,
    nextState: PhysicsState
  ): Map<string, number> {
    const violations = new Map<string, number>();

    for (const law of this.config.conservationLaws) {
      const prevQuantity = law.computeQuantity(prevState);
      const nextQuantity = law.computeQuantity(nextState);
      const violation = Math.abs(nextQuantity - prevQuantity);

      if (violation > law.tolerance) {
        violations.set(law.name, violation);
      }
    }

    return violations;
  }

  private computePhysicsLoss(
    prevState: PhysicsState,
    nextState: PhysicsState,
    violations: Map<string, number>
  ): number {
    let loss = 0;

    // Conservation violation loss
    for (const violation of violations.values()) {
      loss += violation * violation;
    }

    // Symmetry violation loss
    for (const symmetry of this.config.symmetries) {
      const transformed = symmetry.generator(nextState);
      const diff = this.stateDifference(nextState, transformed);
      loss += diff * 0.1;
    }

    return loss * this.config.softConstraintWeight;
  }

  private stateDifference(s1: PhysicsState, s2: PhysicsState): number {
    let diff = 0;
    for (let i = 0; i < s1.position.length; i++) {
      diff += (s1.position[i] - s2.position[i]) ** 2;
      diff += (s1.velocity[i] - s2.velocity[i]) ** 2;
    }
    return Math.sqrt(diff);
  }

  // --------------------------------------------------------------------------
  // ENERGY COMPUTATION
  // --------------------------------------------------------------------------

  private computeKineticEnergy(velocity: number[], mass: number[]): number {
    // T = 0.5 * sum(m_i * v_i^2)
    let T = 0;
    for (let i = 0; i < velocity.length; i++) {
      T += 0.5 * (mass[i] || 1) * velocity[i] * velocity[i];
    }
    return T;
  }

  private computePotentialEnergy(position: number[]): number {
    // Default: simple harmonic potential V = 0.5 * k * x^2
    // Can be overridden for specific systems
    let V = 0;
    const k = 1.0;  // Spring constant
    for (const q of position) {
      V += 0.5 * k * q * q;
    }
    return V;
  }

  // --------------------------------------------------------------------------
  // STATE CREATION
  // --------------------------------------------------------------------------

  /**
   * Create physics state from raw vectors
   */
  createState(
    position: number[],
    velocity: number[],
    mass?: number[]
  ): PhysicsState {
    const m = mass || Array(position.length).fill(1);
    return {
      position: [...position],
      velocity: [...velocity],
      mass: m,
      kinetic: this.computeKineticEnergy(velocity, m),
      potential: this.computePotentialEnergy(position),
      time: 0
    };
  }

  getConfig(): PhysicsConfig {
    return { ...this.config };
  }
}

// ============================================================================
// DYNAMICS NETWORK
// ============================================================================

class DynamicsNetwork {
  private layers: LinearLayer[] = [];

  constructor(stateDim: number) {
    const inputDim = stateDim * 2;  // position + velocity
    const hiddenDim = stateDim * 4;
    const outputDim = stateDim * 2;  // d(position)/dt + d(velocity)/dt

    this.layers = [
      this.initLinear(inputDim, hiddenDim),
      this.initLinear(hiddenDim, hiddenDim),
      this.initLinear(hiddenDim, outputDim)
    ];
  }

  private initLinear(inDim: number, outDim: number): LinearLayer {
    const scale = Math.sqrt(2.0 / (inDim + outDim));
    const weight: number[][] = [];
    for (let i = 0; i < outDim; i++) {
      weight.push(Array(inDim).fill(0).map(() => (Math.random() * 2 - 1) * scale));
    }
    return { weight, bias: Array(outDim).fill(0) };
  }

  forward(state: number[]): number[] {
    let x = state;
    for (let i = 0; i < this.layers.length - 1; i++) {
      x = this.linearForward(x, this.layers[i]);
      x = x.map(v => Math.tanh(v));  // Tanh for smooth dynamics
    }
    return this.linearForward(x, this.layers[this.layers.length - 1]);
  }

  private linearForward(x: number[], layer: LinearLayer): number[] {
    const out: number[] = [];
    for (let i = 0; i < layer.weight.length; i++) {
      let sum = layer.bias[i];
      for (let j = 0; j < Math.min(x.length, layer.weight[i].length); j++) {
        sum += layer.weight[i][j] * x[j];
      }
      out.push(sum);
    }
    return out;
  }
}

// ============================================================================
// HAMILTONIAN NETWORK
// ============================================================================

class HamiltonianNetwork {
  private layers: LinearLayer[] = [];
  private stateDim: number;

  constructor(stateDim: number) {
    this.stateDim = stateDim;
    const inputDim = stateDim * 2;
    const hiddenDim = stateDim * 4;

    this.layers = [
      this.initLinear(inputDim, hiddenDim),
      this.initLinear(hiddenDim, hiddenDim),
      this.initLinear(hiddenDim, 1)  // Scalar Hamiltonian
    ];
  }

  private initLinear(inDim: number, outDim: number): LinearLayer {
    const scale = Math.sqrt(2.0 / (inDim + outDim));
    const weight: number[][] = [];
    for (let i = 0; i < outDim; i++) {
      weight.push(Array(inDim).fill(0).map(() => (Math.random() * 2 - 1) * scale));
    }
    return { weight, bias: Array(outDim).fill(0) };
  }

  /**
   * Compute Hamiltonian H(q, p)
   */
  forward(q: number[], p: number[]): number {
    let x = [...q, ...p];
    for (let i = 0; i < this.layers.length - 1; i++) {
      x = this.linearForward(x, this.layers[i]);
      x = x.map(v => this.softplus(v));  // Positive for energy
    }
    return this.linearForward(x, this.layers[this.layers.length - 1])[0];
  }

  /**
   * Compute ∂H/∂q (force term with sign flip)
   */
  gradientPosition(q: number[], p: number[]): number[] {
    const eps = 1e-4;
    const grad: number[] = [];

    for (let i = 0; i < q.length; i++) {
      const qPlus = [...q];
      const qMinus = [...q];
      qPlus[i] += eps;
      qMinus[i] -= eps;

      const hPlus = this.forward(qPlus, p);
      const hMinus = this.forward(qMinus, p);
      grad.push((hPlus - hMinus) / (2 * eps));
    }

    return grad;
  }

  /**
   * Compute ∂H/∂p (velocity term)
   */
  gradientMomentum(q: number[], p: number[]): number[] {
    const eps = 1e-4;
    const grad: number[] = [];

    for (let i = 0; i < p.length; i++) {
      const pPlus = [...p];
      const pMinus = [...p];
      pPlus[i] += eps;
      pMinus[i] -= eps;

      const hPlus = this.forward(q, pPlus);
      const hMinus = this.forward(q, pMinus);
      grad.push((hPlus - hMinus) / (2 * eps));
    }

    return grad;
  }

  private linearForward(x: number[], layer: LinearLayer): number[] {
    const out: number[] = [];
    for (let i = 0; i < layer.weight.length; i++) {
      let sum = layer.bias[i];
      for (let j = 0; j < Math.min(x.length, layer.weight[i].length); j++) {
        sum += layer.weight[i][j] * x[j];
      }
      out.push(sum);
    }
    return out;
  }

  private softplus(x: number): number {
    return x > 20 ? x : Math.log(1 + Math.exp(x));
  }
}

// ============================================================================
// CONSTRAINT ENFORCER
// ============================================================================

class ConstraintEnforcer {
  private config: PhysicsConfig;

  constructor(config: PhysicsConfig) {
    this.config = config;
  }

  /**
   * Enforce constraints on predicted state
   */
  enforce(prevState: PhysicsState, predictedState: PhysicsState): PhysicsState {
    let state = { ...predictedState };

    // Energy conservation: scale velocities to match energy
    for (const law of this.config.conservationLaws) {
      if (law.type === 'energy') {
        state = this.enforceEnergyConservation(prevState, state);
      }
    }

    return state;
  }

  private enforceEnergyConservation(
    prevState: PhysicsState,
    state: PhysicsState
  ): PhysicsState {
    const targetEnergy = prevState.kinetic + prevState.potential;
    const currentEnergy = state.kinetic + state.potential;

    if (Math.abs(currentEnergy - targetEnergy) < 0.001) {
      return state;
    }

    // Scale kinetic energy to match (potential is position-dependent)
    const energyDeficit = targetEnergy - state.potential;
    if (energyDeficit <= 0 || state.kinetic <= 0) {
      return state;
    }

    const scaleFactor = Math.sqrt(energyDeficit / state.kinetic);
    const newVelocity = state.velocity.map(v => v * scaleFactor);
    const newKinetic = this.computeKineticEnergy(newVelocity, state.mass);

    return {
      ...state,
      velocity: newVelocity,
      kinetic: newKinetic
    };
  }

  private computeKineticEnergy(velocity: number[], mass: number[]): number {
    let T = 0;
    for (let i = 0; i < velocity.length; i++) {
      T += 0.5 * (mass[i] || 1) * velocity[i] * velocity[i];
    }
    return T;
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface LinearLayer {
  weight: number[][];
  bias: number[];
}

// ============================================================================
// EXPORT
// ============================================================================

export function createPhysicsInformedWorldModel(
  config?: Partial<PhysicsConfig>
): PhysicsInformedWorldModel {
  return new PhysicsInformedWorldModel(config);
}

// Common conservation laws
export const ENERGY_CONSERVATION: ConservationLaw = {
  name: 'total_energy',
  type: 'energy',
  computeQuantity: (s) => s.kinetic + s.potential,
  tolerance: 0.001
};

export const MOMENTUM_CONSERVATION: ConservationLaw = {
  name: 'total_momentum',
  type: 'momentum',
  computeQuantity: (s) => s.velocity.reduce((sum, v, i) => sum + (s.mass[i] || 1) * v, 0),
  tolerance: 0.001
};
