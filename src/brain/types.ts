/**
 * Genesis Phase 10 - Brain Module Types
 *
 * Neural Integration Layer - connects all 17 modules.
 *
 * Based on:
 * - arXiv:2508.13171 (Cognitive Workspace) - 54-60% memory reuse
 * - LangGraph Supervisor Pattern - Command({ goto, update })
 * - IWMT (Integrated World Modeling Theory) - GWT + IIT + Active Inference
 *
 * The Brain orchestrates:
 * 1. Cognitive Workspace (active memory)
 * 2. Supervisor (command routing)
 * 3. Global Workspace (broadcasting)
 * 4. Healing Loop (error recovery)
 */

// ============================================================================
// Command Routing (from LangGraph Supervisor Pattern)
// ============================================================================

/**
 * Modules that can be routed to
 * v7.13: Full integration of all subsystems
 */
export type BrainModule =
  | 'memory'           // Cognitive Workspace - recall/anticipate
  | 'llm'              // Hybrid Router - generate response
  | 'grounding'        // Epistemic Stack - verify claims
  | 'tools'            // Tool Dispatcher - execute tool calls
  | 'healing'          // Darwin-Gödel - fix errors
  | 'consciousness'    // Phi Monitor - check consciousness level
  | 'kernel'           // Agent Orchestration - delegate to agents
  | 'thinking'         // v7.6: Extended thinking with scratchpad + self-critique
  | 'active-inference' // v7.13: Free Energy minimization + action selection
  | 'subagents'        // v7.13: Delegate to specialized subagents
  | 'world-model'      // v7.13: Predictive modeling + simulation
  | 'self-modify'      // v7.13: Darwin-Gödel self-improvement
  | 'organism'         // v7.13: Autopoietic lifecycle management
  | 'metacognition'   // v11.5: EFE-driven reasoning strategy selection
  | 'done';            // End processing

/**
 * Command for routing between modules
 * Inspired by LangGraph's Command primitive
 */
export interface Command {
  goto: BrainModule;
  update: Partial<BrainState>;
  reason?: string;           // Why this transition
}

// ============================================================================
// Brain State
// ============================================================================

/**
 * State maintained during brain processing cycle
 */
export interface BrainState {
  // Input
  query: string;              // User query
  context: BrainContext;      // Retrieved context from memory

  // Processing
  response: string;           // Generated response
  toolCalls: ToolCall[];      // Parsed tool calls
  toolResults: ToolResult[];  // Tool execution results

  // Consciousness metrics
  phi: number;                // Current φ level (0-1)
  ignited: boolean;           // GWT ignition state

  // Grounding
  verified: boolean;          // Response verified by grounding
  groundingFeedback?: string; // Feedback from grounding

  // Error state
  error?: Error;              // Current error if any
  healingAttempts: number;    // Number of healing attempts

  // Metadata
  startTime: number;          // Processing start time
  moduleHistory: BrainModule[]; // Visited modules

  // v7.6: Extended Thinking
  thinkingResult?: ThinkingResultSummary;
}

/**
 * Context retrieved from cognitive workspace
 */
export interface BrainContext {
  // Immediate context (last 8K tokens)
  immediate: ContextItem[];

  // Task context (current task-related, 64K)
  task: ContextItem[];

  // Episodic context (relevant past episodes, 256K)
  episodic: ContextItem[];

  // Semantic context (relevant facts, 1M+)
  semantic: ContextItem[];

  // Raw string for LLM
  formatted: string;

  // Metrics
  tokenEstimate: number;
  reuseRate: number;          // Memory reuse rate (target: 54-60%)
}

export interface ContextItem {
  id: string;
  type: 'immediate' | 'task' | 'episodic' | 'semantic';
  content: string;
  relevance: number;          // 0-1, relevance to query
  activation: number;         // 0-1, activation level
  source: string;             // Where this came from
}

// ============================================================================
// Tool Integration
// ============================================================================

export interface ToolCall {
  name: string;
  parameters: Record<string, unknown>;
  raw: string;                // Raw tool call string
}

export interface ToolResult {
  name: string;
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
}

// ============================================================================
// v7.6: Extended Thinking Integration
// ============================================================================

/**
 * Summary of thinking process for BrainState
 * Full ThinkingResult is in thinking/index.ts
 */
export interface ThinkingResultSummary {
  response: string;
  totalThinkingTokens: number;
  confidence: number;
  uncertainties: string[];
  principlesApplied: string[];
  iterations: number;
  duration: number;
}

// ============================================================================
// Grounding Integration
// ============================================================================

export interface GroundingCheck {
  valid: boolean;
  confidence: number;
  feedback: string;
  domain: 'factual' | 'mathematical' | 'ethical' | 'existential' | 'aesthetic' | 'novel';
  needsHuman: boolean;
  humanQuestion?: string;
}

// ============================================================================
// Healing Integration
// ============================================================================

export interface HealingResult {
  canRetry: boolean;
  retryFrom: BrainModule;
  context: string;            // Additional context for retry
  userMessage: string;        // Message to show user
  fixApplied?: string;        // Description of fix applied
}

// ============================================================================
// Global Workspace Broadcasting
// ============================================================================

export interface GlobalBroadcast {
  content: unknown;
  source: BrainModule;
  salience: number;           // 0-1, importance
  timestamp: Date;
}

// ============================================================================
// Brain Configuration
// ============================================================================

export interface BrainConfig {
  // Memory
  memory: {
    enabled: boolean;
    anticipationEnabled: boolean;   // Pre-load expected memories
    maxContextTokens: number;       // Max tokens for context
  };

  // LLM
  llm: {
    enabled: boolean;
    maxRetries: number;
  };

  // Grounding
  grounding: {
    enabled: boolean;
    verifyAllResponses: boolean;    // Verify every response
    confidenceThreshold: number;    // Min confidence to accept
  };

  // Tools
  tools: {
    enabled: boolean;
    maxExecutions: number;          // Max tool calls per cycle
  };

  // Healing
  healing: {
    enabled: boolean;
    maxAttempts: number;
    autoHeal: boolean;              // Auto-heal on error
  };

  // Consciousness
  consciousness: {
    enabled: boolean;
    phiThreshold: number;           // Min φ for operation
    broadcastEnabled: boolean;      // GWT broadcasting
  };

  // Processing
  maxCycleTime: number;             // Max processing time (ms)
  maxModuleTransitions: number;     // Max transitions per cycle
}

export const DEFAULT_BRAIN_CONFIG: BrainConfig = {
  memory: {
    enabled: true,
    anticipationEnabled: true,
    maxContextTokens: 8192,
  },
  llm: {
    enabled: true,
    maxRetries: 2,
  },
  grounding: {
    enabled: true,
    verifyAllResponses: false,  // v7.2: Only verify when explicitly requested (was too aggressive)
    confidenceThreshold: 0.3,   // v7.2: Lowered from 0.5 to reduce false positives
  },
  tools: {
    enabled: true,
    maxExecutions: 5,
  },
  healing: {
    enabled: true,
    maxAttempts: 3,
    autoHeal: true,
  },
  consciousness: {
    enabled: true,
    phiThreshold: 0.1,
    broadcastEnabled: true,
  },
  maxCycleTime: 120000,             // v7.18: Reduced from 10min to 2min for faster responses
  maxModuleTransitions: 10,         // v7.18: Reduced from 20 to 10 for faster convergence
};

// ============================================================================
// Brain Metrics
// ============================================================================

export interface BrainMetrics {
  // Processing
  totalCycles: number;
  successfulCycles: number;
  failedCycles: number;
  avgCycleTime: number;

  // Memory
  memoryRecalls: number;
  memoryReuseRate: number;          // Target: 54-60%
  anticipationHits: number;
  anticipationMisses: number;

  // Grounding
  groundingChecks: number;
  groundingPasses: number;
  groundingFailures: number;
  humanConsultations: number;

  // Tools
  toolExecutions: number;
  toolSuccesses: number;
  toolFailures: number;

  // Healing
  healingAttempts: number;
  healingSuccesses: number;
  healingFailures: number;

  // Consciousness
  avgPhi: number;
  phiViolations: number;
  broadcasts: number;

  // v7.6: Extended Thinking
  thinkingSteps?: number;        // Total thinking steps executed
  thinkingTokens?: number;       // Total tokens used for thinking
  avgConfidence?: number;        // Average confidence from metacognition
  critiqueRounds?: number;       // Total self-critique iterations
  deliberationCount?: number;    // Times deliberative alignment was invoked

  // Module routing
  moduleTransitions: Record<string, number>;
}

// ============================================================================
// Brain Events
// ============================================================================

export type BrainEventType =
  | 'cycle_start'
  | 'cycle_complete'
  | 'cycle_error'
  | 'module_enter'
  | 'module_exit'
  | 'memory_recall'
  | 'memory_anticipate'
  | 'llm_request'
  | 'llm_response'
  | 'grounding_check'
  | 'tool_execute'
  | 'tool_complete'
  | 'healing_start'
  | 'healing_complete'
  | 'broadcast'
  | 'phi_update'
  | 'thinking_step';  // v10.0 - Extended thinking events

export interface BrainEvent {
  type: BrainEventType;
  timestamp: Date;
  data: unknown;
  module?: BrainModule;
}

export type BrainEventHandler = (event: BrainEvent) => void;
