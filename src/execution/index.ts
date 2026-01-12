/**
 * Genesis Code Execution Module
 *
 * Runtime code execution with Active Inference observation loop.
 * The frontier: Generate → Execute → Observe → Adapt
 */

export {
  CodeRuntime,
  getCodeRuntime,
  resetCodeRuntime,
  ExecutionRequest,
  ExecutionResult,
  ExecutionObservation,
  ErrorPattern,
  OutputPattern,
  ExecutionMetrics,
  RuntimeConfig,
} from './runtime.js';

export {
  registerExecutionActions,
  initializeExecutionIntegration,
  createExecutionObservationBridge,
  CodeExecutionContext,
  CodeAdaptationContext,
  ExecutionCycleResult,
} from './integration.js';

// 🛡️ Secure Shell Execution (OWASP-compliant)
export {
  SecureShellExecutor,
  getShellExecutor,
  resetShellExecutor,
  COMMAND_ALLOWLIST,
  RiskLevel,
  type CommandConfig,
  type ExecutionResult as ShellExecutionResult,
  type ExecutionRequest as ShellExecutionRequest,
  type AuditEntry,
} from './shell.js';
