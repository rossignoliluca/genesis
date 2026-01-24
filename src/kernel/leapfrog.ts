/**
 * Störmer-Verlet (Leapfrog) Integrator
 *
 * Symplectic integrator for Hamiltonian systems: preserves phase-space volume.
 * For Genesis budget management:
 *   q = budget_weights (allocations per module)
 *   p = budget_precisions (confidence in allocations)
 *   H(q, p) = total_budget (conserved quantity)
 *
 * The conservation property (det(Jacobian) = 1) guarantees that budget
 * neither leaks nor is created over many update cycles.
 *
 * Reference: Leimkuhler & Reich (2004) "Simulating Hamiltonian Dynamics"
 */

/**
 * State in the Hamiltonian system.
 * q: positions (budget allocations)
 * p: momenta (allocation precisions/velocities)
 */
export interface HamiltonianState {
  q: number[];  // positions: budget weights per module
  p: number[];  // momenta: rate of change of allocations
}

/**
 * Perform one leapfrog step.
 *
 * The leapfrog integrator:
 *   p(t + dt/2) = p(t) - (dt/2) × ∂H/∂q(q(t))
 *   q(t + dt)   = q(t) + dt × ∂H/∂p(p(t + dt/2))
 *   p(t + dt)   = p(t + dt/2) - (dt/2) × ∂H/∂q(q(t + dt))
 *
 * For budget system:
 *   ∂H/∂q = gradient of cost function w.r.t. allocations
 *   ∂H/∂p = p (kinetic energy gradient)
 *
 * @param state Current (q, p)
 * @param gradH_q Gradient of potential energy: ∂V/∂q (ROI-based force)
 * @param dt Time step
 * @param constraint Optional conservation constraint (e.g., sum(q) = budget)
 */
export function leapfrogStep(
  state: HamiltonianState,
  gradH_q: (q: number[]) => number[],
  dt: number = 0.1,
  constraint?: (q: number[]) => number[]
): HamiltonianState {
  const n = state.q.length;

  // Half-step momentum update
  const grad1 = gradH_q(state.q);
  const pHalf = state.p.map((pi, i) => pi - (dt / 2) * (grad1[i] || 0));

  // Full-step position update (∂H/∂p = p for standard kinetic energy)
  let qNew = state.q.map((qi, i) => qi + dt * pHalf[i]);

  // Apply constraint (projection onto constraint surface)
  if (constraint) {
    qNew = constraint(qNew);
  }

  // Half-step momentum update
  const grad2 = gradH_q(qNew);
  const pNew = pHalf.map((pi, i) => pi - (dt / 2) * (grad2[i] || 0));

  return { q: qNew, p: pNew };
}

/**
 * Budget conservation constraint: sum(allocations) = totalBudget
 * Projects q back onto the constraint hyperplane while preserving proportions.
 */
export function budgetConstraint(totalBudget: number): (q: number[]) => number[] {
  return (q: number[]) => {
    // Clip to non-negative
    const clipped = q.map(v => Math.max(v, 0));
    const sum = clipped.reduce((s, v) => s + v, 0);
    if (sum === 0) {
      // Equal allocation if all zero
      return clipped.map(() => totalBudget / clipped.length);
    }
    // Normalize to total budget
    return clipped.map(v => (v / sum) * totalBudget);
  };
}

/**
 * ROI-based gradient: modules with low ROI get negative force (reduce allocation).
 * Modules with high ROI get positive force (increase allocation).
 *
 * gradV_i = -(ROI_i - meanROI) × sensitivity
 *
 * The negative sign means the force pushes allocations TOWARD high-ROI modules.
 */
export function roiGradient(
  roiPerModule: number[],
  sensitivity: number = 1.0
): number[] {
  const mean = roiPerModule.reduce((s, v) => s + v, 0) / Math.max(roiPerModule.length, 1);
  return roiPerModule.map(roi => -(roi - mean) * sensitivity);
}

/**
 * Compute Hamiltonian (total energy = kinetic + potential).
 * Conservation: H should stay approximately constant over many steps.
 *
 * H = 0.5 × Σ p_i² + V(q)
 * where V(q) = -Σ ROI_i × q_i (we want to maximize ROI-weighted allocation)
 */
export function computeHamiltonian(
  state: HamiltonianState,
  roiPerModule: number[]
): number {
  const kinetic = 0.5 * state.p.reduce((s, pi) => s + pi * pi, 0);
  const potential = -state.q.reduce((s, qi, i) => s + qi * (roiPerModule[i] || 0), 0);
  return kinetic + potential;
}

/**
 * Check symplectic conservation: |H(t) - H(0)| should stay bounded.
 * Returns the relative energy error.
 */
export function conservationError(H_current: number, H_initial: number): number {
  if (Math.abs(H_initial) < 1e-10) return Math.abs(H_current);
  return Math.abs(H_current - H_initial) / Math.abs(H_initial);
}
