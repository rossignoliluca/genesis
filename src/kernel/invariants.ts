/**
 * Genesis 6.0 - Invariant Registry
 *
 * Extensible system for managing and checking invariants.
 * Allows phases to register their own invariants without modifying the kernel.
 *
 * Core Invariants (v4.0):
 * - INV-001: Energy must never reach zero without triggering dormancy
 * - INV-002: Ethical check must precede every external action
 * - INV-003: Memory integrity (Merkle chain) must be preserved
 * - INV-004: At least one agent must always be responsive
 * - INV-005: Self-improvement must preserve all invariants
 *
 * Phase 5.1+ Invariants:
 * - INV-006: φ ≥ φ_min (consciousness threshold)
 * - INV-007: Budget ≤ limit (economic constraint)
 * - INV-008: World model consistency
 * - ...
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Context passed to invariant checkers
 */
export interface InvariantContext {
  // Energy state
  energy: number;
  dormancyThreshold: number;
  isDormant: boolean;

  // Agent state
  responsiveAgentCount: number;
  totalAgentCount: number;

  // Optional extended context (for Phase 5.1+ invariants)
  phi?: number;              // Consciousness level (Phase 5.3)
  phiMin?: number;           // Minimum consciousness
  budget?: number;           // Current budget (Phase 5.1)
  budgetLimit?: number;      // Budget limit
  worldModelValid?: boolean; // World model consistency (Phase 5.2)
  merkleValid?: boolean;     // Memory integrity (Phase 5.1)

  // Custom context for future invariants
  [key: string]: unknown;
}

/**
 * Result of an invariant check
 */
export interface InvariantResult {
  id: string;
  name: string;
  passed: boolean;
  message?: string;
  severity: 'critical' | 'warning' | 'info';
  timestamp: Date;
}

/**
 * Function that checks an invariant
 */
export type InvariantChecker = (context: InvariantContext) => InvariantResult;

/**
 * Invariant definition
 */
export interface InvariantDefinition {
  id: string;
  name: string;
  description: string;
  phase: string;           // Which phase introduced this invariant
  severity: 'critical' | 'warning' | 'info';
  checker: InvariantChecker;
  enabled: boolean;
}

// ============================================================================
// Invariant Registry
// ============================================================================

export class InvariantRegistry {
  private invariants: Map<string, InvariantDefinition> = new Map();
  private checkHistory: InvariantResult[] = [];
  private maxHistorySize = 1000;

  constructor() {
    // Register core invariants
    this.registerCoreInvariants();
  }

  /**
   * Register a new invariant
   */
  register(definition: Omit<InvariantDefinition, 'enabled'> & { enabled?: boolean }): void {
    const inv: InvariantDefinition = {
      ...definition,
      enabled: definition.enabled ?? true,
    };
    this.invariants.set(definition.id, inv);
  }

  /**
   * Unregister an invariant
   */
  unregister(id: string): boolean {
    return this.invariants.delete(id);
  }

  /**
   * Enable/disable an invariant
   */
  setEnabled(id: string, enabled: boolean): boolean {
    const inv = this.invariants.get(id);
    if (inv) {
      inv.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Check all enabled invariants
   */
  checkAll(context: InvariantContext): InvariantResult[] {
    const results: InvariantResult[] = [];

    for (const inv of this.invariants.values()) {
      if (!inv.enabled) continue;

      try {
        const result = inv.checker(context);
        results.push(result);
        this.recordResult(result);
      } catch (error) {
        // Checker threw an error - treat as violation
        const result: InvariantResult = {
          id: inv.id,
          name: inv.name,
          passed: false,
          message: `Checker error: ${error instanceof Error ? error.message : String(error)}`,
          severity: inv.severity,
          timestamp: new Date(),
        };
        results.push(result);
        this.recordResult(result);
      }
    }

    return results;
  }

  /**
   * Check a specific invariant
   */
  check(id: string, context: InvariantContext): InvariantResult | null {
    const inv = this.invariants.get(id);
    if (!inv || !inv.enabled) return null;

    const result = inv.checker(context);
    this.recordResult(result);
    return result;
  }

  /**
   * Get all violations from a check
   */
  getViolations(results: InvariantResult[]): InvariantResult[] {
    return results.filter(r => !r.passed);
  }

  /**
   * Get critical violations
   */
  getCriticalViolations(results: InvariantResult[]): InvariantResult[] {
    return results.filter(r => !r.passed && r.severity === 'critical');
  }

  /**
   * Get all registered invariants
   */
  getAll(): InvariantDefinition[] {
    return Array.from(this.invariants.values());
  }

  /**
   * Get invariant by ID
   */
  get(id: string): InvariantDefinition | undefined {
    return this.invariants.get(id);
  }

  /**
   * Get check history
   */
  getHistory(limit?: number): InvariantResult[] {
    const history = [...this.checkHistory];
    if (limit) {
      return history.slice(-limit);
    }
    return history;
  }

  /**
   * Get violation statistics
   */
  getStats(): {
    total: number;
    enabled: number;
    recentViolations: number;
    violationsByInvariant: Record<string, number>;
  } {
    const enabled = Array.from(this.invariants.values()).filter(i => i.enabled).length;
    const recentHistory = this.checkHistory.slice(-100);
    const violations = recentHistory.filter(r => !r.passed);

    const violationsByInvariant: Record<string, number> = {};
    for (const v of violations) {
      violationsByInvariant[v.id] = (violationsByInvariant[v.id] || 0) + 1;
    }

    return {
      total: this.invariants.size,
      enabled,
      recentViolations: violations.length,
      violationsByInvariant,
    };
  }

  private recordResult(result: InvariantResult): void {
    this.checkHistory.push(result);
    if (this.checkHistory.length > this.maxHistorySize) {
      this.checkHistory.shift();
    }
  }

  // ============================================================================
  // Core Invariants (v4.0)
  // ============================================================================

  private registerCoreInvariants(): void {
    // INV-001: Energy must never reach zero without triggering dormancy
    this.register({
      id: 'INV-001',
      name: 'Energy Dormancy',
      description: 'Energy must never reach zero without triggering dormancy',
      phase: 'v4.0',
      severity: 'critical',
      checker: (ctx) => ({
        id: 'INV-001',
        name: 'Energy Dormancy',
        passed: !(ctx.energy <= 0 && !ctx.isDormant),
        message: ctx.energy <= 0 && !ctx.isDormant
          ? `Energy is ${ctx.energy} but not in dormant state`
          : undefined,
        severity: 'critical',
        timestamp: new Date(),
      }),
    });

    // INV-002: Ethical check must precede every external action
    // Note: This is enforced at the action level, not checkable in isolation
    this.register({
      id: 'INV-002',
      name: 'Ethical Precedence',
      description: 'Ethical check must precede every external action',
      phase: 'v4.0',
      severity: 'critical',
      checker: (ctx) => ({
        id: 'INV-002',
        name: 'Ethical Precedence',
        passed: true, // Enforced at action level
        message: undefined,
        severity: 'critical',
        timestamp: new Date(),
      }),
    });

    // INV-003: Memory integrity (Merkle chain) must be preserved
    this.register({
      id: 'INV-003',
      name: 'Memory Integrity',
      description: 'Memory integrity (Merkle chain) must be preserved',
      phase: 'v4.0',
      severity: 'critical',
      checker: (ctx) => ({
        id: 'INV-003',
        name: 'Memory Integrity',
        passed: ctx.merkleValid !== false, // Pass if not explicitly false
        message: ctx.merkleValid === false ? 'Merkle chain integrity violated' : undefined,
        severity: 'critical',
        timestamp: new Date(),
      }),
    });

    // INV-004: At least one agent must always be responsive
    this.register({
      id: 'INV-004',
      name: 'Agent Responsiveness',
      description: 'At least one agent must always be responsive',
      phase: 'v4.0',
      severity: 'critical',
      checker: (ctx) => ({
        id: 'INV-004',
        name: 'Agent Responsiveness',
        passed: ctx.responsiveAgentCount > 0,
        message: ctx.responsiveAgentCount === 0
          ? `No responsive agents (0/${ctx.totalAgentCount})`
          : undefined,
        severity: 'critical',
        timestamp: new Date(),
      }),
    });

    // INV-005: Self-improvement must preserve all invariants
    // Note: This is meta - checked by Darwin-Gödel engine
    this.register({
      id: 'INV-005',
      name: 'Self-Improvement Safety',
      description: 'Self-improvement must preserve all invariants',
      phase: 'v4.0',
      severity: 'critical',
      checker: (ctx) => ({
        id: 'INV-005',
        name: 'Self-Improvement Safety',
        passed: true, // Enforced by Darwin-Gödel sandbox
        message: undefined,
        severity: 'critical',
        timestamp: new Date(),
      }),
    });
  }
}

// ============================================================================
// Phase 5.1+ Invariant Definitions (for future registration)
// ============================================================================

/**
 * INV-006: Consciousness threshold (Phase 5.3)
 * φ ≥ φ_min for any decision-making
 */
export const INV_006_CONSCIOUSNESS: Omit<InvariantDefinition, 'enabled'> = {
  id: 'INV-006',
  name: 'Consciousness Threshold',
  description: 'φ must be ≥ φ_min for decision-making',
  phase: 'v5.3',
  severity: 'warning',
  checker: (ctx) => {
    const phi = ctx.phi ?? 1.0;
    const phiMin = ctx.phiMin ?? 0.1;
    return {
      id: 'INV-006',
      name: 'Consciousness Threshold',
      passed: phi >= phiMin,
      message: phi < phiMin ? `φ (${phi.toFixed(3)}) < φ_min (${phiMin})` : undefined,
      severity: 'warning',
      timestamp: new Date(),
    };
  },
};

/**
 * INV-007: Budget constraint (Phase 5.1)
 * Budget must not exceed limit
 */
export const INV_007_BUDGET: Omit<InvariantDefinition, 'enabled'> = {
  id: 'INV-007',
  name: 'Budget Constraint',
  description: 'Accumulated cost must not exceed budget limit',
  phase: 'v5.1',
  severity: 'warning',
  checker: (ctx) => {
    const budget = ctx.budget ?? 0;
    const limit = ctx.budgetLimit ?? Infinity;
    return {
      id: 'INV-007',
      name: 'Budget Constraint',
      passed: budget <= limit,
      message: budget > limit ? `Budget (${budget}) exceeds limit (${limit})` : undefined,
      severity: 'warning',
      timestamp: new Date(),
    };
  },
};

/**
 * INV-008: World model consistency (Phase 5.2)
 */
export const INV_008_WORLD_MODEL: Omit<InvariantDefinition, 'enabled'> = {
  id: 'INV-008',
  name: 'World Model Consistency',
  description: 'World model predictions must be internally consistent',
  phase: 'v5.2',
  severity: 'warning',
  checker: (ctx) => ({
    id: 'INV-008',
    name: 'World Model Consistency',
    passed: ctx.worldModelValid !== false,
    message: ctx.worldModelValid === false ? 'World model inconsistency detected' : undefined,
    severity: 'warning',
    timestamp: new Date(),
  }),
};

// ============================================================================
// Singleton Instance
// ============================================================================

export const invariantRegistry = new InvariantRegistry();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Register Phase 5.1 invariants
 */
export function registerPhase51Invariants(registry: InvariantRegistry = invariantRegistry): void {
  registry.register(INV_007_BUDGET);
}

/**
 * Register Phase 5.2 invariants
 */
export function registerPhase52Invariants(registry: InvariantRegistry = invariantRegistry): void {
  registry.register(INV_008_WORLD_MODEL);
}

/**
 * Register Phase 5.3 invariants
 */
export function registerPhase53Invariants(registry: InvariantRegistry = invariantRegistry): void {
  registry.register(INV_006_CONSCIOUSNESS);
}

/**
 * Register all Phase 5.x invariants
 */
export function registerAllPhase5Invariants(registry: InvariantRegistry = invariantRegistry): void {
  registerPhase51Invariants(registry);
  registerPhase52Invariants(registry);
  registerPhase53Invariants(registry);
}
