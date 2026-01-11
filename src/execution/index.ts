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
