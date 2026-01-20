/**
 * Genesis 6.2 - Active Inference Module
 *
 * Autonomous decision-making via Free Energy Principle.
 *
 * This module enables Genesis to operate autonomously,
 * making decisions through Active Inference math.
 *
 * Usage:
 * ```typescript
 * import { createAutonomousLoop, AutonomousLoop } from './active-inference/index.js';
 *
 * const loop = createAutonomousLoop();
 *
 * // Run N inference cycles
 * await loop.run(100);
 *
 * // Get current beliefs
 * const beliefs = loop.getBeliefs();
 *
 * // Get statistics
 * const stats = loop.getStats();
 * ```
 */

// Export types
export * from './types.js';

// Export core components
export { ActiveInferenceEngine, createActiveInferenceEngine } from './core.js';
export { ObservationGatherer, createObservationGatherer, getObservationGatherer } from './observations.js';
export {
  ActionExecutorManager,
  createActionExecutorManager,
  getActionExecutorManager,
  executeAction,
  registerAction,
  type ActionResult,
  type ActionContext,
} from './actions.js';

// Export Autonomous Loop (extracted to avoid circular deps)
export {
  AutonomousLoop,
  createAutonomousLoop,
  getAutonomousLoop,
  resetAutonomousLoop,
  type AutonomousLoopConfig,
  type LoopStats,
  DEFAULT_LOOP_CONFIG,
} from './autonomous-loop.js';

// Export integration with Kernel/Daemon
export {
  integrateActiveInference,
  createIntegratedSystem,
  createKernelObservationBridge,
  registerKernelActions,
  registerDaemonTask,
  // MCP integration (Genesis 6.3+)
  createMCPObservationBridge,
  createMCPInferenceLoop,
  type IntegrationConfig,
  type IntegratedSystem,
  type MCPObservationConfig,
} from './integration.js';

// Export Value-Guided JEPA integration (Genesis 6.2)
// Note: createValueIntegratedLoop moved to value-integration.ts to avoid cycle
export {
  ValueAugmentedEngine,
  createValueAugmentedEngine,
  createFullyIntegratedEngine,
  createValueIntegratedLoop,
  type ValueIntegrationConfig,
  type ValueIntegrationEvent,
  type ValueIntegratedLoopConfig,
  DEFAULT_VALUE_INTEGRATION_CONFIG,
} from './value-integration.js';

// Export Memory 2.0 integration (Genesis 6.3)
export {
  integrateMemory,
  getMemoryMetrics,
  getWorkspaceState,
  type MemoryIntegrationConfig,
  DEFAULT_MEMORY_INTEGRATION_CONFIG,
} from './memory-integration.js';

// Export Economic Integration (Genesis 9.3 - Autopoietic Self-Funding)
export {
  EconomicIntegration,
  getEconomicIntegration,
  recordLLMCost,
  recordRevenue,
  CostTracker,
  RevenueTracker,
  ServiceRegistry,
  type EconomicObservation,
  type CostRecord,
  type RevenueRecord,
  type ServiceDefinition,
  type EconomicGoal,
} from './economic-integration.js';
