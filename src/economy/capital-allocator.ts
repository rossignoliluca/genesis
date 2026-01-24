/**
 * Capital Allocator — Leapfrog Symplectic Portfolio Manager
 *
 * Allocates budget across N revenue-generating activities using the
 * Störmer-Verlet integrator from kernel/leapfrog.ts.
 *
 * Key properties:
 *   - Symplectic: total budget is conserved (no leaks, no creation)
 *   - ROI-gradient: capital flows toward highest-performing activities
 *   - Fisher-preconditioned: uses information geometry for step sizing
 *   - Damped: contraction monitor can reduce aggressiveness
 *
 * Portfolio allocation:
 *   q_i = capital allocated to activity i
 *   p_i = momentum (trend in allocation changes)
 *   ∂V/∂q_i = -(ROI_i - mean(ROI)) × sensitivity
 *
 * Conservation: Σ q_i = totalBudget (enforced by projection)
 */

import {
  leapfrogStep,
  budgetConstraint,
  roiGradient,
  computeHamiltonian,
  conservationError,
  type HamiltonianState,
} from '../kernel/leapfrog.js';
import { getEconomicFiber } from './fiber.js';

// ============================================================================
// Types
// ============================================================================

export interface ActivityProfile {
  id: string;
  name: string;
  tier: 'S' | 'A' | 'B' | 'C' | 'D';
  capitalRequired: number;      // Minimum capital to operate ($)
  estimatedROI: number;         // Expected return (annualized)
  riskLevel: number;            // 0-1 (0 = safe, 1 = high risk)
  cooldownCycles: number;       // Minimum cycles between operations
  identityRequired: 'none' | 'wallet' | 'kyc';
  active: boolean;              // Currently enabled
}

export interface AllocationState {
  hamiltonian: HamiltonianState;
  allocations: Map<string, number>;  // activityId → $ allocated
  rois: Map<string, number>;         // activityId → current ROI
  totalBudget: number;
  hamiltonianEnergy: number;
  conservationErr: number;
  lastUpdate: number;
}

export interface AllocatorConfig {
  dt: number;                    // Leapfrog step size (default 0.05)
  sensitivity: number;           // ROI gradient sensitivity (default 1.0)
  dampingFactor: number;         // External damping (1.0 = none)
  minAllocation: number;         // Minimum $ per active activity
  maxAllocationFraction: number; // Max fraction of budget per activity (0.4 = 40%)
  rebalanceInterval: number;     // ms between rebalances
}

// ============================================================================
// Capital Allocator
// ============================================================================

export class CapitalAllocator {
  private activities: ActivityProfile[] = [];
  private state: HamiltonianState = { q: [], p: [] };
  private config: AllocatorConfig;
  private totalBudget: number;
  private initialHamiltonian: number = 0;
  private stepCount: number = 0;
  private lastRebalance: number = 0;

  constructor(totalBudget: number = 2000, config?: Partial<AllocatorConfig>) {
    this.totalBudget = totalBudget;
    this.config = {
      dt: config?.dt ?? 0.05,
      sensitivity: config?.sensitivity ?? 1.0,
      dampingFactor: config?.dampingFactor ?? 1.0,
      minAllocation: config?.minAllocation ?? 10,
      maxAllocationFraction: config?.maxAllocationFraction ?? 0.4,
      rebalanceInterval: config?.rebalanceInterval ?? 3600000, // 1 hour
    };
  }

  /**
   * Register an activity in the portfolio.
   */
  registerActivity(profile: ActivityProfile): void {
    if (this.activities.find(a => a.id === profile.id)) return;
    this.activities.push(profile);
    this.reinitializeState();
  }

  /**
   * Register multiple activities at once.
   */
  registerActivities(profiles: ActivityProfile[]): void {
    for (const p of profiles) {
      if (!this.activities.find(a => a.id === p.id)) {
        this.activities.push(p);
      }
    }
    this.reinitializeState();
  }

  /**
   * Perform one allocation step using leapfrog integrator.
   * Returns new allocations per activity.
   */
  step(currentROIs?: Map<string, number>): AllocationState {
    if (this.activities.length === 0) {
      return this.emptyState();
    }

    // Update ROIs from fiber bundle or provided values
    const rois = this.getCurrentROIs(currentROIs);

    // Build ROI array aligned with activities
    const roiArray = this.activities.map(a => rois.get(a.id) ?? a.estimatedROI);

    // Compute gradient with Fisher preconditioning
    const gradient = (q: number[]) => {
      const rawGrad = roiGradient(roiArray, this.config.sensitivity);
      // Apply damping
      return rawGrad.map(g => g * this.config.dampingFactor);
    };

    // Constraint: sum(q) = totalBudget, all q >= 0
    const constraint = this.buildConstraint();

    // Leapfrog step
    this.state = leapfrogStep(this.state, gradient, this.config.dt, constraint);
    this.stepCount++;

    // Track Hamiltonian conservation
    const H = computeHamiltonian(this.state, roiArray);
    if (this.stepCount === 1) {
      this.initialHamiltonian = H;
    }
    const consErr = conservationError(H, this.initialHamiltonian);

    // Build allocation map
    const allocations = new Map<string, number>();
    for (let i = 0; i < this.activities.length; i++) {
      allocations.set(this.activities[i].id, this.state.q[i]);
    }

    // Sync with fiber bundle
    const fiber = getEconomicFiber();
    fiber.setAllocations(this.state.q);

    this.lastRebalance = Date.now();

    return {
      hamiltonian: { q: [...this.state.q], p: [...this.state.p] },
      allocations,
      rois,
      totalBudget: this.totalBudget,
      hamiltonianEnergy: H,
      conservationErr: consErr,
      lastUpdate: Date.now(),
    };
  }

  /**
   * Get current allocation for a specific activity.
   */
  getAllocation(activityId: string): number {
    const idx = this.activities.findIndex(a => a.id === activityId);
    if (idx < 0) return 0;
    return this.state.q[idx] ?? 0;
  }

  /**
   * Get all current allocations.
   */
  getAllocations(): Map<string, number> {
    const map = new Map<string, number>();
    for (let i = 0; i < this.activities.length; i++) {
      map.set(this.activities[i].id, this.state.q[i] ?? 0);
    }
    return map;
  }

  /**
   * Update total budget (e.g., after revenue received).
   */
  updateBudget(newTotal: number): void {
    const ratio = newTotal / Math.max(this.totalBudget, 1);
    this.totalBudget = newTotal;
    // Scale all allocations proportionally
    this.state.q = this.state.q.map(q => q * ratio);
  }

  /**
   * Set external damping factor (from contraction monitor).
   */
  setDamping(factor: number): void {
    this.config.dampingFactor = Math.max(0.1, Math.min(1.0, factor));
  }

  /**
   * Check if rebalance is due.
   */
  needsRebalance(): boolean {
    return Date.now() - this.lastRebalance > this.config.rebalanceInterval;
  }

  /**
   * Get activity profiles.
   */
  getActivities(): ActivityProfile[] {
    return [...this.activities];
  }

  /**
   * Enable/disable an activity.
   */
  setActivityActive(activityId: string, active: boolean): void {
    const activity = this.activities.find(a => a.id === activityId);
    if (activity) {
      activity.active = active;
      if (!active) {
        // Zero out allocation for disabled activity
        const idx = this.activities.indexOf(activity);
        if (idx >= 0) {
          this.state.q[idx] = 0;
          // Redistribute to active activities
          this.state.q = this.buildConstraint()(this.state.q);
        }
      }
    }
  }

  getStepCount(): number {
    return this.stepCount;
  }

  getTotalBudget(): number {
    return this.totalBudget;
  }

  // ============================================================================
  // Private
  // ============================================================================

  private reinitializeState(): void {
    const n = this.activities.length;
    const activeCount = this.activities.filter(a => a.active).length;
    const perActivity = activeCount > 0 ? this.totalBudget / activeCount : 0;

    this.state = {
      q: this.activities.map(a => a.active ? perActivity : 0),
      p: new Array(n).fill(0), // Start with zero momentum
    };
  }

  private buildConstraint(): (q: number[]) => number[] {
    const base = budgetConstraint(this.totalBudget);
    const maxAlloc = this.totalBudget * this.config.maxAllocationFraction;
    const minAlloc = this.config.minAllocation;

    return (q: number[]) => {
      // Apply base constraint (sum = budget, all >= 0)
      let result = base(q);

      // Apply per-activity constraints
      for (let i = 0; i < result.length; i++) {
        const activity = this.activities[i];
        if (!activity.active) {
          result[i] = 0;
        } else {
          // Cap at max allocation
          result[i] = Math.min(result[i], maxAlloc);
          // Ensure minimum if active
          if (result[i] > 0 && result[i] < minAlloc) {
            result[i] = minAlloc;
          }
        }
      }

      // Re-normalize after capping
      const sum = result.reduce((s, v) => s + v, 0);
      if (sum > 0 && Math.abs(sum - this.totalBudget) > 0.01) {
        const scale = this.totalBudget / sum;
        result = result.map(v => v * scale);
      }

      return result;
    };
  }

  private getCurrentROIs(provided?: Map<string, number>): Map<string, number> {
    const rois = new Map<string, number>();
    const fiber = getEconomicFiber();

    for (const activity of this.activities) {
      if (provided?.has(activity.id)) {
        rois.set(activity.id, provided.get(activity.id)!);
      } else {
        // Try to get from fiber bundle
        const f = fiber.getFiber(activity.id);
        if (f && f.totalSpent > 0) {
          rois.set(activity.id, f.roi);
        } else {
          rois.set(activity.id, activity.estimatedROI);
        }
      }
    }
    return rois;
  }

  private emptyState(): AllocationState {
    return {
      hamiltonian: { q: [], p: [] },
      allocations: new Map(),
      rois: new Map(),
      totalBudget: this.totalBudget,
      hamiltonianEnergy: 0,
      conservationErr: 0,
      lastUpdate: Date.now(),
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let allocatorInstance: CapitalAllocator | null = null;

export function getCapitalAllocator(
  totalBudget?: number,
  config?: Partial<AllocatorConfig>
): CapitalAllocator {
  if (!allocatorInstance) {
    allocatorInstance = new CapitalAllocator(totalBudget, config);
  }
  return allocatorInstance;
}

export function resetCapitalAllocator(): void {
  allocatorInstance = null;
}
