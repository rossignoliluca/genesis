/**
 * Genesis v35 — Core Module Barrel
 *
 * Re-exports all core architectural modules for clean imports:
 *   import { createLogger, AgentLoop, FEKBrainBridge } from '../core/index.js';
 */

// Structured logging
export { createLogger, getLogger, setLogger, logger, type Logger, type LogLevel } from './logger.js';

// Typed effect system
export {
  // Either
  right, left, isRight, isLeft,
  type Right, type Left, type Either,
  // Effect constructors
  succeed, fail, tryPromise, sync, tryCatch, fromNullable,
  type Effect,
  // Combinators
  map, flatMap, catchAll, tap, tapError, provide,
  // Concurrency
  all, allSettled, race,
  // Runtime
  runPromise, runEither, runSync,
  // Utilities
  timeout, wrapLegacy, pipe,
  // Error types
  GenesisError, LLMError, ToolError, MemoryError,
  BusError, ConfigError, TimeoutError,
} from './effect.js';

// FEK ↔ Brain bridge
export {
  FEKBrainBridge,
  type FEKSnapshot, type FEKRouting, type ThinkingStrategy,
  type BrainModuleHint, type TokenBudget, type BrainStepFeedback,
} from './fek-brain-bridge.js';

// Agent loop (CoALA)
export { AgentLoop, type AgentModules } from './agent-loop.js';

// DI typed resolution
export {
  bootstrap, resolve, resolveSync,
  hasService, isResolved, shutdown, getContainer,
  type ServiceTokenMap, type ServiceToken,
} from './bootstrap.js';

// Module registry (L1→L4 boot sequencing)
export { ModuleRegistry, registerGenesisModules, getModuleRegistry } from './module-registry.js';
