/**
 * Genesis v10.5 - Streaming Module
 *
 * Next-generation hybrid streaming system with:
 * - Multi-provider adapters (OpenAI, Anthropic, Ollama, Groq)
 * - Stream orchestration with tool call loops
 * - XML-based hybrid executor for inline tool detection
 * - Context grounding (project, git, environment)
 * - Comprehensive type system with discriminated unions
 */

// Core types
export type {
  StreamEvent,
  StreamState,
  StreamMetrics,
  StreamCheckpoint,
  StreamController,
  StreamStatistics,
  HybridStreamOptions,
  AdaptiveQualityConfig,
  ProviderStreamAdapter,
  ProviderCapabilities,
  TokenEvent,
  ToolStartEvent,
  ToolResultEvent,
  ThinkingStartEvent,
  ThinkingTokenEvent,
  ThinkingEndEvent,
  MetadataEvent,
  ErrorEvent,
  DoneEvent,
  BaseStreamEvent,
  StateTransition,
  Message,
  MessageRole,
  ContentBlock,
  ToolDefinition,
  ToolParameter,
  ModelTier,
  TriggerCondition,
  RetryStrategy,
  CacheConfig,
  EventHandlerMap,
  ExtractEvent,
  EventHandler,
} from './types.js';

export { ProviderErrorCode } from './types.js';

// Stream Orchestrator (primary public API)
export { StreamOrchestrator, createStreamOrchestrator, onStreamCompletion } from './orchestrator.js';
export type { StreamCompletionHook } from './orchestrator.js';

// Hybrid Executor (XML tool detection)
export { HybridStreamExecutor, hybridStream, hybridStreamCollect } from './hybrid-executor.js';

// Provider Adapters
export {
  getStreamAdapter,
  listAdapters,
  type ProviderName,
  type InternalAdapter,
  type AdapterStreamOptions,
} from './provider-adapter.js';

// Context Grounding
export {
  ContextGrounder,
  type GroundingContext,
  type ProjectContext,
  type GitContext,
  type EnvironmentContext,
  type ErrorContext,
  type MemoryContext,
} from './context-grounder.js';

// Latency Tracker (v10.6)
export {
  LatencyTracker,
  getLatencyTracker,
  type LatencyRecord,
  type ProviderStats,
  type RacingCandidate,
} from './latency-tracker.js';

// Model Racer (v10.6)
export {
  ModelRacer,
  type RacingStrategy,
  type RacingConfig,
  type RaceResult,
} from './model-racer.js';

// MCP Streaming Bridge (v10.6)
export {
  MCPBridge,
  type MCPServerName,
  type MCPToolCall,
  type MCPToolResult,
  type PrefetchRule,
  type MCPBridgeConfig,
} from './mcp-bridge.js';
