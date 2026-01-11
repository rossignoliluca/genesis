/**
 * Genesis Self-Modification Module
 *
 * Radical self-modification with formal verification.
 * Enables Genesis to modify its own core, including decision-making.
 *
 * Architecture:
 * - TCB (Trusted Computing Base): Immutable core that verifies changes
 * - Darwin-Gödel Engine: Applies and verifies modifications
 * - Invariant System: Ensures core properties survive modification
 */

export {
  DarwinGodelEngine,
  getDarwinGodelEngine,
  resetDarwinGodelEngine,
  Modification,
  ModificationPlan,
  VerificationResult,
  ApplyResult,
  DarwinGodelConfig,
} from './darwin-godel.js';

// Re-export invariant types for convenience
export {
  invariantRegistry,
  InvariantRegistry,
  InvariantContext,
  InvariantResult,
  InvariantDefinition,
  InvariantChecker,
} from '../kernel/invariants.js';
