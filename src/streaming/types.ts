/**
 * Hybrid Streaming Types for Genesis AI CLI
 *
 * Comprehensive type definitions for a next-generation streaming system
 * that supports multiple LLM providers, tool execution, reasoning chains,
 * adaptive quality upgrades, and resumable streams.
 */

// ============================================================================
// Stream Events - Discriminated Union
// ============================================================================

/**
 * Base interface for all stream events
 */
export interface BaseStreamEvent {
  /** Unique event identifier */
  id: string;
  /** ISO timestamp when event was created */
  timestamp: string;
}

/**
 * Text token emitted during content generation
 */
export interface TokenEvent extends BaseStreamEvent {
  type: 'token';
  /** The text content of this token */
  content: string;
  /** Model confidence score (0-1), if available */
  confidence?: number;
}

/**
 * Tool execution has started
 */
export interface ToolStartEvent extends BaseStreamEvent {
  type: 'tool_start';
  /** Unique identifier for this tool call */
  toolCallId: string;
  /** Name of the tool being invoked */
  name: string;
  /** Arguments passed to the tool */
  args: Record<string, unknown>;
}

/**
 * Tool execution has completed
 */
export interface ToolResultEvent extends BaseStreamEvent {
  type: 'tool_result';
  /** Unique identifier matching the tool_start event */
  toolCallId: string;
  /** Result content from the tool */
  content: unknown;
  /** Whether the tool executed successfully */
  success: boolean;
  /** Execution duration in milliseconds */
  duration: number;
  /** Error message if success is false */
  error?: string;
}

/**
 * Model has begun internal reasoning/thinking
 */
export interface ThinkingStartEvent extends BaseStreamEvent {
  type: 'thinking_start';
  /** Optional label for this thinking block */
  label?: string;
}

/**
 * Internal reasoning token (e.g., Claude's extended thinking)
 */
export interface ThinkingTokenEvent extends BaseStreamEvent {
  type: 'thinking_token';
  /** The reasoning content */
  content: string;
}

/**
 * Reasoning block has concluded
 */
export interface ThinkingEndEvent extends BaseStreamEvent {
  type: 'thinking_end';
  /** Total tokens in this thinking block */
  tokenCount?: number;
}

/**
 * Metadata about the model and usage
 */
export interface MetadataEvent extends BaseStreamEvent {
  type: 'metadata';
  /** Provider name (e.g., 'openai', 'anthropic') */
  provider: string;
  /** Model identifier */
  model: string;
  /** Token usage statistics */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    thinkingTokens?: number;
  };
  /** Estimated cost in USD */
  cost?: number;
  /** Whether this was an adaptive upgrade */
  wasUpgraded?: boolean;
  /** Previous model if upgraded */
  previousModel?: string;
}

/**
 * An error occurred during streaming
 */
export interface ErrorEvent extends BaseStreamEvent {
  type: 'error';
  /** Error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Whether the stream can be retried */
  retryable: boolean;
  /** Underlying error details */
  details?: unknown;
}

/**
 * Stream has completed successfully
 */
export interface DoneEvent extends BaseStreamEvent {
  type: 'done';
  /** Final aggregated content */
  content: string;
  /** Finish reason */
  reason: 'stop' | 'length' | 'tool_use' | 'content_filter' | 'error';
  /** Final metrics snapshot */
  metrics: StreamMetrics;
}

/**
 * Discriminated union of all possible stream events
 */
export type StreamEvent =
  | TokenEvent
  | ToolStartEvent
  | ToolResultEvent
  | ThinkingStartEvent
  | ThinkingTokenEvent
  | ThinkingEndEvent
  | MetadataEvent
  | ErrorEvent
  | DoneEvent;

// ============================================================================
// Stream State Machine
// ============================================================================

/**
 * State machine for stream lifecycle
 */
export type StreamState =
  | 'idle'           // Not yet started
  | 'streaming'      // Actively generating tokens
  | 'tool_executing' // Executing tool calls
  | 'thinking'       // In reasoning mode
  | 'paused'         // Stream paused (resumable)
  | 'completed'      // Successfully finished
  | 'error';         // Failed with error

/**
 * State transition metadata
 */
export interface StateTransition {
  from: StreamState;
  to: StreamState;
  timestamp: string;
  reason?: string;
}

// ============================================================================
// Messages and Tool Definitions
// ============================================================================

/**
 * Message role in conversation
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Content block types
 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64' | 'url'; data: string }; mimeType?: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean };

/**
 * A message in the conversation
 */
export interface Message {
  role: MessageRole;
  content: string | ContentBlock[];
  /** Optional message name (e.g., for tool results) */
  name?: string;
  /** Optional thinking/reasoning blocks */
  thinking?: string;
}

/**
 * Tool parameter definition (JSON Schema)
 */
export interface ToolParameter {
  type: string;
  description?: string;
  enum?: string[];
  items?: ToolParameter;
  properties?: Record<string, ToolParameter>;
  required?: string[];
  [key: string]: unknown;
}

/**
 * Tool definition for LLM tool use
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter;
  /** Optional: handler function reference */
  handler?: (args: Record<string, unknown>) => Promise<unknown>;
}

// ============================================================================
// Hybrid Stream Options
// ============================================================================

/**
 * Configuration options for hybrid streaming
 */
export interface HybridStreamOptions {
  /** LLM provider (e.g., 'openai', 'anthropic', 'ollama') */
  provider: string;

  /** Model identifier */
  model: string;

  /** Conversation messages */
  messages: Message[];

  /** Available tools for the model to use */
  tools?: ToolDefinition[];

  /** Enable extended thinking/reasoning */
  enableThinking?: boolean;

  /** Allow adaptive quality upgrades mid-stream */
  adaptiveQuality?: boolean;

  /** Adaptive quality configuration */
  adaptiveQualityConfig?: AdaptiveQualityConfig;

  /** Maximum number of tool calls in a single stream */
  maxToolCalls?: number;

  /** Confidence threshold for hallucination detection (0-1) */
  confidenceThreshold?: number;

  /** Temperature for sampling (0-2) */
  temperature?: number;

  /** Maximum tokens to generate */
  maxTokens?: number;

  /** Top-p sampling parameter */
  topP?: number;

  /** Callback for each stream event */
  onEvent?: (event: StreamEvent) => void | Promise<void>;

  /** Callback for state transitions */
  onStateChange?: (transition: StateTransition) => void;

  /** AbortSignal for cancellation */
  signal?: AbortSignal;

  /** Enable checkpointing for resumable streams */
  enableCheckpoints?: boolean;

  /** Checkpoint interval in milliseconds */
  checkpointInterval?: number;

  /** System prompt override */
  systemPrompt?: string;

  /** Additional provider-specific options */
  providerOptions?: Record<string, unknown>;
}

// ============================================================================
// Stream Metrics
// ============================================================================

/**
 * Real-time metrics for stream performance and cost tracking
 */
export interface StreamMetrics {
  /** Current tokens per second rate */
  tokensPerSecond: number;

  /** Total tokens generated so far */
  totalTokens: number;

  /** Input tokens consumed */
  inputTokens: number;

  /** Output tokens generated */
  outputTokens: number;

  /** Thinking/reasoning tokens (if applicable) */
  thinkingTokens: number;

  /** Estimated cost in USD */
  cost: number;

  /** Rolling average confidence score (0-1) */
  confidence: number;

  /** Number of tool calls made */
  toolCallCount: number;

  /** Total latency for all tool calls (ms) */
  toolLatencyTotal: number;

  /** Average tool latency (ms) */
  toolLatencyAverage: number;

  /** Number of model upgrades/escalations */
  modelUpgrades: number;

  /** Stream start timestamp */
  startTime: string;

  /** Elapsed time in milliseconds */
  elapsed: number;

  /** Current state of the stream */
  state: StreamState;

  /** Number of retries attempted */
  retries: number;

  /** Time to first token (TTFT) in milliseconds */
  timeToFirstToken?: number;
}

// ============================================================================
// Provider Stream Adapter
// ============================================================================

/**
 * Capabilities supported by a provider
 */
export interface ProviderCapabilities {
  /** Supports extended thinking/reasoning */
  thinking: boolean;

  /** Supports tool/function calling */
  toolUse: boolean;

  /** Supports streaming responses */
  streaming: boolean;

  /** Supports vision/image inputs */
  vision: boolean;

  /** Supports system prompts */
  systemPrompt: boolean;

  /** Maximum context window in tokens */
  maxContextTokens: number;

  /** Maximum output tokens */
  maxOutputTokens: number;
}

/**
 * Interface for provider-specific stream adapters
 */
export interface ProviderStreamAdapter {
  /** Provider name */
  name: string;

  /** Provider capabilities */
  supports: ProviderCapabilities;

  /**
   * Stream completions from this provider
   * @param messages Conversation messages
   * @param options Stream options
   * @returns Async generator of stream events
   */
  stream(
    messages: Message[],
    options: HybridStreamOptions
  ): AsyncGenerator<StreamEvent, void, unknown>;

  /**
   * Estimate cost for a completion
   * @param inputTokens Input token count
   * @param outputTokens Output token count
   * @param model Model identifier
   * @returns Estimated cost in USD
   */
  estimateCost?(inputTokens: number, outputTokens: number, model: string): number;

  /**
   * Count tokens in text
   * @param text Text to tokenize
   * @param model Model identifier
   * @returns Token count
   */
  countTokens?(text: string, model: string): Promise<number>;

  /**
   * Validate if a model is supported
   * @param model Model identifier
   * @returns True if supported
   */
  supportsModel?(model: string): boolean;
}

// ============================================================================
// Stream Checkpoints (Resumable Streams)
// ============================================================================

/**
 * Checkpoint for resumable streams
 */
export interface StreamCheckpoint {
  /** Unique checkpoint identifier */
  id: string;

  /** ISO timestamp when checkpoint was created */
  timestamp: string;

  /** Content generated up to this point */
  contentSoFar: string;

  /** Thinking content generated so far */
  thinkingSoFar?: string;

  /** Snapshot of messages at this checkpoint */
  messagesSnapshot: Message[];

  /** Metrics at checkpoint time */
  metrics: StreamMetrics;

  /** Current stream state */
  state: StreamState;

  /** Tool calls completed so far */
  completedToolCalls: ToolResultEvent[];

  /** Pending tool calls */
  pendingToolCalls: ToolStartEvent[];

  /** Stream options used */
  options: HybridStreamOptions;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Adaptive Quality Configuration
// ============================================================================

/**
 * Trigger condition for model upgrades/downgrades
 */
export type TriggerCondition =
  | { type: 'complexity'; threshold: number }      // Based on reasoning complexity
  | { type: 'confidence'; threshold: number }      // Low confidence detected
  | { type: 'tool_calls'; count: number }          // Multiple tool calls needed
  | { type: 'tokens'; threshold: number }          // Long generation needed
  | { type: 'error_rate'; threshold: number }      // High error/retry rate
  | { type: 'manual' }                             // Manual escalation
  | { type: 'cost'; budgetRemaining: number };     // Cost constraints

/**
 * Model tier in upgrade/downgrade path
 */
export interface ModelTier {
  /** Provider name */
  provider: string;

  /** Model identifier */
  model: string;

  /** Trigger condition to move to this tier */
  triggerCondition: TriggerCondition;

  /** Cost multiplier relative to base model */
  costMultiplier: number;

  /** Priority (higher = preferred for upgrades) */
  priority: number;
}

/**
 * Configuration for adaptive quality streaming
 */
export interface AdaptiveQualityConfig {
  /** Enable adaptive quality */
  enabled: boolean;

  /** Complexity threshold to trigger upgrades (0-1) */
  complexityThreshold: number;

  /** Maximum cost budget in USD */
  costBudget?: number;

  /** Model upgrade path (lower to higher quality) */
  upgradePath: ModelTier[];

  /** Model downgrade path (higher to lower quality) */
  downgradePath: ModelTier[];

  /** Minimum confidence to avoid upgrade (0-1) */
  minConfidence: number;

  /** Enable automatic downgrades for simple continuations */
  autoDowngrade: boolean;

  /** Cooldown period between upgrades (ms) */
  upgradeCooldown: number;

  /** Maximum number of upgrades per stream */
  maxUpgrades: number;
}

// ============================================================================
// Stream Controller Interface
// ============================================================================

/**
 * Controller interface for managing active streams
 */
export interface StreamController {
  /** Current stream state */
  readonly state: StreamState;

  /** Current metrics */
  readonly metrics: StreamMetrics;

  /** Pause the stream */
  pause(): void;

  /** Resume a paused stream */
  resume(): void;

  /** Abort the stream */
  abort(reason?: string): void;

  /** Create a checkpoint */
  checkpoint(): StreamCheckpoint;

  /** Restore from a checkpoint */
  restore(checkpoint: StreamCheckpoint): void;

  /** Upgrade to a higher quality model */
  upgrade(tier: ModelTier): Promise<void>;

  /** Downgrade to a lower quality model */
  downgrade(tier: ModelTier): Promise<void>;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract event type from discriminated union
 */
export type ExtractEvent<T extends StreamEvent['type']> = Extract<StreamEvent, { type: T }>;

/**
 * Handler function for a specific event type
 */
export type EventHandler<T extends StreamEvent['type']> = (
  event: ExtractEvent<T>
) => void | Promise<void>;

/**
 * Map of event handlers by type
 */
export type EventHandlerMap = {
  [K in StreamEvent['type']]?: EventHandler<K>;
};

/**
 * Stream statistics aggregation
 */
export interface StreamStatistics {
  totalStreams: number;
  successfulStreams: number;
  failedStreams: number;
  totalTokens: number;
  totalCost: number;
  averageTokensPerSecond: number;
  averageLatency: number;
  totalToolCalls: number;
  totalUpgrades: number;
  providerBreakdown: Record<string, number>;
  modelBreakdown: Record<string, number>;
}

/**
 * Provider-specific error codes
 */
export enum ProviderErrorCode {
  RateLimitExceeded = 'RATE_LIMIT_EXCEEDED',
  InvalidAPIKey = 'INVALID_API_KEY',
  ModelNotFound = 'MODEL_NOT_FOUND',
  ContextLengthExceeded = 'CONTEXT_LENGTH_EXCEEDED',
  ContentFiltered = 'CONTENT_FILTERED',
  NetworkError = 'NETWORK_ERROR',
  TimeoutError = 'TIMEOUT_ERROR',
  ServerError = 'SERVER_ERROR',
  InvalidRequest = 'INVALID_REQUEST',
  InsufficientQuota = 'INSUFFICIENT_QUOTA',
  Unknown = 'UNKNOWN'
}

/**
 * Retry strategy configuration
 */
export interface RetryStrategy {
  /** Maximum number of retries */
  maxRetries: number;

  /** Initial backoff delay in milliseconds */
  initialDelay: number;

  /** Backoff multiplier */
  backoffMultiplier: number;

  /** Maximum backoff delay in milliseconds */
  maxDelay: number;

  /** Error codes that are retryable */
  retryableErrors: ProviderErrorCode[];

  /** Jitter to add to backoff (0-1) */
  jitter: number;
}

/**
 * Cache configuration for repeated prompts
 */
export interface CacheConfig {
  /** Enable caching */
  enabled: boolean;

  /** Cache TTL in milliseconds */
  ttl: number;

  /** Maximum cache size in MB */
  maxSize: number;

  /** Cache key strategy */
  keyStrategy: 'content' | 'hash' | 'semantic';
}

