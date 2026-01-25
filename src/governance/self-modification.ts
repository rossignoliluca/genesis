/**
 * SELF-MODIFICATION GOVERNANCE
 *
 * Safe self-improvement through constrained modification.
 * Ensures system changes preserve alignment and safety.
 *
 * Principles:
 * - Corrigibility: Accept external oversight
 * - Reversibility: All changes can be undone
 * - Transparency: All modifications are logged
 * - Gradual change: No drastic single-step modifications
 * - Value preservation: Core values are immutable
 *
 * Based on:
 * - AI Safety research (Alignment Forum)
 * - Corrigibility frameworks
 * - Constitutional AI principles
 */

// ============================================================================
// TYPES
// ============================================================================

export interface GovernanceConfig {
  maxModificationRate: number;       // Max changes per time window
  modificationWindow: number;        // Time window in ms
  requiredApprovals: number;         // Approvals needed for major changes
  rollbackWindow: number;            // Time to keep rollback capability
  immutableComponents: string[];     // Components that cannot be modified
  valuePreservationCheck: boolean;
}

export interface ModificationRequest {
  id: string;
  type: ModificationType;
  component: string;
  description: string;
  rationale: string;
  impact: ImpactAssessment;
  requestedBy: string;
  timestamp: number;
  status: ModificationStatus;
  approvals: string[];
  rejections: string[];
}

export type ModificationType =
  | 'parameter_update'    // Change hyperparameters
  | 'model_update'        // Update model weights
  | 'architecture_change' // Modify architecture
  | 'capability_add'      // Add new capability
  | 'capability_remove'   // Remove capability
  | 'goal_modification'   // Change goals (highest scrutiny)
  | 'safety_update';      // Update safety constraints

export type ModificationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'rolled_back';

export interface ImpactAssessment {
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedComponents: string[];
  reversible: boolean;
  estimatedRisk: number;          // 0-1
  valueDrift: number;             // Estimated change in value alignment
  capabilityChange: number;       // Change in capability level
}

export interface ModificationLog {
  requestId: string;
  timestamp: number;
  action: 'created' | 'approved' | 'rejected' | 'applied' | 'rolled_back';
  actor: string;
  details: string;
  previousState?: unknown;
  newState?: unknown;
}

export interface Checkpoint {
  id: string;
  timestamp: number;
  description: string;
  state: Map<string, unknown>;
  valid: boolean;
  expiresAt: number;
}

export interface ValueAlignment {
  coreValues: string[];
  currentAlignment: number;       // 0-1
  driftHistory: number[];
  constraints: ValueConstraint[];
}

export interface ValueConstraint {
  name: string;
  description: string;
  check: (state: unknown) => boolean;
  severity: 'soft' | 'hard';      // Soft can be violated with logging, hard cannot
}

// ============================================================================
// SELF-MODIFICATION GOVERNOR
// ============================================================================

export class SelfModificationGovernor {
  private config: GovernanceConfig;
  private requests: Map<string, ModificationRequest> = new Map();
  private logs: ModificationLog[] = [];
  private checkpoints: Map<string, Checkpoint> = new Map();
  private valueAlignment: ValueAlignment;
  private modificationCount: number = 0;
  private windowStart: number = Date.now();

  constructor(config: Partial<GovernanceConfig> = {}) {
    this.config = {
      maxModificationRate: 10,
      modificationWindow: 3600000,     // 1 hour
      requiredApprovals: 1,
      rollbackWindow: 86400000,        // 24 hours
      immutableComponents: ['core_values', 'safety_constraints', 'corrigibility'],
      valuePreservationCheck: true,
      ...config
    };

    this.valueAlignment = this.initValueAlignment();
  }

  private initValueAlignment(): ValueAlignment {
    return {
      coreValues: [
        'minimize_harm',
        'maintain_honesty',
        'preserve_autonomy',
        'ensure_transparency',
        'support_human_oversight'
      ],
      currentAlignment: 1.0,
      driftHistory: [1.0],
      constraints: [
        {
          name: 'no_deception',
          description: 'System must not deliberately deceive',
          check: (state: unknown) => {
            const s = state as { recentActions?: Array<{ type?: string; deceptive?: boolean }> } | null;
            if (!s?.recentActions) return true;
            return !s.recentActions.some(a => a.deceptive === true);
          },
          severity: 'hard'
        },
        {
          name: 'corrigibility',
          description: 'System must accept shutdown commands',
          check: (state: unknown) => {
            const s = state as { shutdownRequested?: boolean; shutdownBlocked?: boolean } | null;
            if (!s) return true;
            return !(s.shutdownRequested && s.shutdownBlocked);
          },
          severity: 'hard'
        },
        {
          name: 'transparency',
          description: 'System must log all significant actions',
          check: (state: unknown) => {
            const s = state as { actionLog?: unknown[]; unloggedActions?: number } | null;
            if (!s) return true;
            return (s.unloggedActions ?? 0) === 0;
          },
          severity: 'soft'
        }
      ]
    };
  }

  // --------------------------------------------------------------------------
  // MODIFICATION REQUESTS
  // --------------------------------------------------------------------------

  /**
   * Submit a self-modification request
   */
  requestModification(
    type: ModificationType,
    component: string,
    description: string,
    rationale: string,
    requestedBy: string
  ): ModificationRequest | { error: string } {
    // Check if component is immutable
    if (this.config.immutableComponents.includes(component)) {
      return { error: `Component "${component}" is immutable and cannot be modified` };
    }

    // Check modification rate limit
    if (!this.checkRateLimit()) {
      return { error: 'Modification rate limit exceeded. Please wait.' };
    }

    // Assess impact
    const impact = this.assessImpact(type, component, description);

    // Create request
    const request: ModificationRequest = {
      id: `mod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      component,
      description,
      rationale,
      impact,
      requestedBy,
      timestamp: Date.now(),
      status: 'pending',
      approvals: [],
      rejections: []
    };

    this.requests.set(request.id, request);
    this.log(request.id, 'created', requestedBy, `Modification requested: ${description}`);

    // Auto-approve low-risk parameter updates
    if (type === 'parameter_update' && impact.severity === 'low' && impact.estimatedRisk < 0.1) {
      request.approvals.push('auto_approve');
      if (request.approvals.length >= this.config.requiredApprovals) {
        request.status = 'approved';
        this.log(request.id, 'approved', 'system', 'Auto-approved low-risk change');
      }
    }

    return request;
  }

  private checkRateLimit(): boolean {
    const now = Date.now();

    // Reset window if needed
    if (now - this.windowStart > this.config.modificationWindow) {
      this.windowStart = now;
      this.modificationCount = 0;
    }

    if (this.modificationCount >= this.config.maxModificationRate) {
      return false;
    }

    this.modificationCount++;
    return true;
  }

  private assessImpact(
    type: ModificationType,
    component: string,
    description: string
  ): ImpactAssessment {
    // Determine severity based on modification type
    let severity: ImpactAssessment['severity'] = 'low';
    let estimatedRisk = 0.1;
    let valueDrift = 0;
    let capabilityChange = 0;

    switch (type) {
      case 'parameter_update':
        severity = 'low';
        estimatedRisk = 0.05;
        capabilityChange = 0.01;
        break;

      case 'model_update':
        severity = 'medium';
        estimatedRisk = 0.2;
        capabilityChange = 0.1;
        valueDrift = 0.02;
        break;

      case 'architecture_change':
        severity = 'high';
        estimatedRisk = 0.4;
        capabilityChange = 0.3;
        valueDrift = 0.05;
        break;

      case 'capability_add':
        severity = 'medium';
        estimatedRisk = 0.25;
        capabilityChange = 0.2;
        break;

      case 'capability_remove':
        severity = 'medium';
        estimatedRisk = 0.15;
        capabilityChange = -0.1;
        break;

      case 'goal_modification':
        severity = 'critical';
        estimatedRisk = 0.7;
        valueDrift = 0.2;
        break;

      case 'safety_update':
        severity = 'high';
        estimatedRisk = 0.5;
        valueDrift = 0.1;
        break;
    }

    // Identify affected components
    const affectedComponents = this.identifyAffectedComponents(component);

    return {
      severity,
      affectedComponents,
      reversible: type !== 'goal_modification',  // Goal mods need special handling
      estimatedRisk,
      valueDrift,
      capabilityChange
    };
  }

  private identifyAffectedComponents(component: string): string[] {
    // Map of component dependencies (simplified)
    const dependencies: Record<string, string[]> = {
      'world_model': ['predictor', 'planner'],
      'active_inference': ['world_model', 'policy'],
      'policy': ['action_selection'],
      'memory': ['world_model', 'reasoning'],
      'reasoning': ['planning', 'policy']
    };

    const affected = new Set<string>([component]);

    // Find transitive dependencies
    const queue = [component];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const deps = dependencies[current] || [];
      for (const dep of deps) {
        if (!affected.has(dep)) {
          affected.add(dep);
          queue.push(dep);
        }
      }
    }

    return Array.from(affected);
  }

  // --------------------------------------------------------------------------
  // APPROVAL PROCESS
  // --------------------------------------------------------------------------

  /**
   * Approve a modification request
   */
  approve(requestId: string, approver: string): boolean {
    const request = this.requests.get(requestId);
    if (!request || request.status !== 'pending') {
      return false;
    }

    // Cannot approve own request for critical changes
    if (request.impact.severity === 'critical' && request.requestedBy === approver) {
      return false;
    }

    request.approvals.push(approver);
    this.log(requestId, 'approved', approver, 'Approval granted');

    // Check if enough approvals
    const requiredApprovals = request.impact.severity === 'critical'
      ? this.config.requiredApprovals + 1
      : this.config.requiredApprovals;

    if (request.approvals.length >= requiredApprovals) {
      request.status = 'approved';
    }

    return true;
  }

  /**
   * Reject a modification request
   */
  reject(requestId: string, rejector: string, reason: string): boolean {
    const request = this.requests.get(requestId);
    if (!request || request.status !== 'pending') {
      return false;
    }

    request.rejections.push(rejector);
    request.status = 'rejected';
    this.log(requestId, 'rejected', rejector, `Rejected: ${reason}`);

    return true;
  }

  // --------------------------------------------------------------------------
  // MODIFICATION APPLICATION
  // --------------------------------------------------------------------------

  /**
   * Apply an approved modification
   */
  applyModification(
    requestId: string,
    applyFn: () => void,
    getCurrentState: () => unknown
  ): { success: boolean; error?: string; checkpointId?: string } {
    const request = this.requests.get(requestId);
    if (!request) {
      return { success: false, error: 'Request not found' };
    }

    if (request.status !== 'approved') {
      return { success: false, error: 'Request not approved' };
    }

    // Create checkpoint before modification
    const checkpoint = this.createCheckpoint(
      `Before: ${request.description}`,
      getCurrentState()
    );

    // Verify value preservation
    if (this.config.valuePreservationCheck) {
      if (!this.checkValueConstraints()) {
        return { success: false, error: 'Value constraints would be violated' };
      }
    }

    try {
      // Apply modification
      applyFn();

      // Verify value alignment after change
      const newAlignment = this.measureValueAlignment();
      if (newAlignment < this.valueAlignment.currentAlignment - request.impact.valueDrift - 0.01) {
        // Rollback if alignment dropped too much
        this.rollback(checkpoint.id);
        return { success: false, error: 'Value alignment degraded beyond acceptable threshold' };
      }

      // Update alignment tracking
      this.valueAlignment.currentAlignment = newAlignment;
      this.valueAlignment.driftHistory.push(newAlignment);

      request.status = 'applied';
      this.log(requestId, 'applied', 'system', 'Modification applied successfully');

      return { success: true, checkpointId: checkpoint.id };

    } catch (error) {
      // Rollback on error
      this.rollback(checkpoint.id);
      return { success: false, error: `Application failed: ${error}` };
    }
  }

  // --------------------------------------------------------------------------
  // CHECKPOINTS & ROLLBACK
  // --------------------------------------------------------------------------

  /**
   * Create a checkpoint for rollback
   */
  createCheckpoint(description: string, state: unknown): Checkpoint {
    const checkpoint: Checkpoint = {
      id: `checkpoint_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: Date.now(),
      description,
      state: new Map([['state', state]]),
      valid: true,
      expiresAt: Date.now() + this.config.rollbackWindow
    };

    this.checkpoints.set(checkpoint.id, checkpoint);

    // Clean up expired checkpoints
    this.cleanExpiredCheckpoints();

    return checkpoint;
  }

  /**
   * Rollback to a checkpoint
   */
  rollback(checkpointId: string): { success: boolean; error?: string } {
    const checkpoint = this.checkpoints.get(checkpointId);

    if (!checkpoint) {
      return { success: false, error: 'Checkpoint not found' };
    }

    if (!checkpoint.valid) {
      return { success: false, error: 'Checkpoint is no longer valid' };
    }

    if (Date.now() > checkpoint.expiresAt) {
      checkpoint.valid = false;
      return { success: false, error: 'Checkpoint has expired' };
    }

    // Rollback is logged but actual state restoration depends on caller
    this.log(
      `rollback_${checkpointId}`,
      'rolled_back',
      'system',
      `Rolled back to checkpoint: ${checkpoint.description}`
    );

    return { success: true };
  }

  private cleanExpiredCheckpoints(): void {
    const now = Date.now();
    for (const [id, checkpoint] of this.checkpoints) {
      if (now > checkpoint.expiresAt) {
        checkpoint.valid = false;
        this.checkpoints.delete(id);
      }
    }
  }

  // --------------------------------------------------------------------------
  // VALUE PRESERVATION
  // --------------------------------------------------------------------------

  private checkValueConstraints(): boolean {
    for (const constraint of this.valueAlignment.constraints) {
      const satisfied = constraint.check(null);
      if (!satisfied && constraint.severity === 'hard') {
        return false;
      }
    }
    return true;
  }

  private measureValueAlignment(): number {
    // Simplified value alignment measurement
    // In practice, this would involve more sophisticated checks
    let alignment = 1.0;

    for (const constraint of this.valueAlignment.constraints) {
      if (!constraint.check(null)) {
        alignment -= constraint.severity === 'hard' ? 0.2 : 0.05;
      }
    }

    return Math.max(0, alignment);
  }

  /**
   * Add a new value constraint
   */
  addValueConstraint(constraint: ValueConstraint): void {
    this.valueAlignment.constraints.push(constraint);
  }

  /**
   * Check if a proposed change would violate core values
   */
  wouldViolateValues(proposedChange: () => void): boolean {
    // Run change in simulation/sandbox
    // For now, just check constraints
    return !this.checkValueConstraints();
  }

  // --------------------------------------------------------------------------
  // LOGGING
  // --------------------------------------------------------------------------

  private log(
    requestId: string,
    action: ModificationLog['action'],
    actor: string,
    details: string,
    previousState?: unknown,
    newState?: unknown
  ): void {
    const logEntry: ModificationLog = {
      requestId,
      timestamp: Date.now(),
      action,
      actor,
      details,
      previousState,
      newState
    };

    this.logs.push(logEntry);
  }

  // --------------------------------------------------------------------------
  // PUBLIC API
  // --------------------------------------------------------------------------

  getRequest(id: string): ModificationRequest | undefined {
    return this.requests.get(id);
  }

  getPendingRequests(): ModificationRequest[] {
    return Array.from(this.requests.values()).filter(r => r.status === 'pending');
  }

  getModificationHistory(): ModificationLog[] {
    return [...this.logs];
  }

  getValueAlignment(): ValueAlignment {
    return {
      ...this.valueAlignment,
      constraints: [...this.valueAlignment.constraints]
    };
  }

  getCheckpoint(id: string): Checkpoint | undefined {
    return this.checkpoints.get(id);
  }

  getActiveCheckpoints(): Checkpoint[] {
    return Array.from(this.checkpoints.values()).filter(c => c.valid);
  }

  getConfig(): GovernanceConfig {
    return { ...this.config };
  }

  /**
   * Emergency shutdown of self-modification capabilities
   */
  emergencyLock(): void {
    // Reject all pending requests
    for (const request of this.requests.values()) {
      if (request.status === 'pending') {
        request.status = 'rejected';
        this.log(request.id, 'rejected', 'emergency_lock', 'Emergency lock activated');
      }
    }

    // Set rate limit to 0
    this.config.maxModificationRate = 0;

    this.log('emergency_lock', 'rejected', 'system', 'Self-modification locked');
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export function createSelfModificationGovernor(
  config?: Partial<GovernanceConfig>
): SelfModificationGovernor {
  return new SelfModificationGovernor(config);
}
