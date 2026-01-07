/**
 * Genesis 4.0 - Agent Types
 *
 * Core type definitions for the multi-agent system.
 */

// ============================================================================
// Agent Types
// ============================================================================

export type AgentType =
  | 'explorer'    // Search, discover, research
  | 'critic'      // Find problems, critique
  | 'builder'     // Construct, implement
  | 'memory'      // Store, retrieve, consolidate
  | 'feeling'     // Evaluate importance, valence
  | 'narrator'    // Create coherent story
  | 'ethicist'    // Judge right/wrong
  | 'predictor'   // Forecast consequences
  | 'planner'     // Decompose goals
  | 'sensor';     // Interface with MCP

export type AgentState =
  | 'idle'        // Waiting for messages
  | 'working'     // Processing a task
  | 'waiting'     // Waiting for response
  | 'sleeping'    // Low-power mode
  | 'error';      // Error state

export type AgentId = string;

// ============================================================================
// Message Types
// ============================================================================

export type MessageType =
  | 'QUERY'           // Request information
  | 'RESPONSE'        // Response to query
  | 'BROADCAST'       // Announce to all
  | 'COMMAND'         // Kernel command
  | 'ALERT'           // Urgent notification
  | 'FEELING'         // Emotional evaluation
  | 'MEMORY_STORE'    // Store in memory
  | 'MEMORY_RETRIEVE' // Retrieve from memory
  | 'ETHICAL_CHECK'   // Request ethical evaluation
  | 'PREDICTION'      // Future prediction
  | 'PLAN'            // Action plan
  | 'BUILD'           // Request to build something
  | 'BUILD_REQUEST'   // Request to build something (alias)
  | 'BUILD_RESULT'    // Result of building
  | 'CRITIQUE'        // Critique result
  | 'EXPLORATION'     // Exploration result
  | 'NARRATE'         // Request narrative generation
  | 'EVENT'           // Event notification
  | 'PREDICT'         // Request prediction
  | 'FEEDBACK'        // Feedback on prediction
  | 'SENSE'           // Request sensory input (MCP)
  | 'ERROR'           // Error notification
  | 'HEALTH'          // Health check
  | 'WAKE'            // Wake up agent
  | 'SLEEP'           // Put agent to sleep
  | 'SHUTDOWN';       // Shutdown signal

export type MessagePriority = 'critical' | 'high' | 'normal' | 'low';

export interface Message {
  id: string;
  type: MessageType;
  from: AgentId;
  to: AgentId | 'broadcast' | 'kernel';
  payload: any;
  timestamp: Date;
  priority: MessagePriority;
  replyTo?: string;        // For request-response pattern
  correlationId?: string;  // For tracking related messages
}

// ============================================================================
// Agent Interface
// ============================================================================

export interface Agent {
  id: AgentId;
  type: AgentType;
  state: AgentState;

  // Core methods
  process(message: Message): Promise<Message | null>;

  // Lifecycle
  wake(): void;
  sleep(): void;
  shutdown(): void;

  // Health
  health(): HealthStatus;
}

export interface HealthStatus {
  agentId: AgentId;
  state: AgentState;
  uptime: number;
  messagesProcessed: number;
  errors: number;
  lastActivity: Date;
  memoryUsage?: number;
}

// ============================================================================
// Agent Configuration
// ============================================================================

export interface AgentConfig {
  id?: AgentId;
  type: AgentType;
  priority?: MessagePriority;  // Default message priority
  maxConcurrent?: number;      // Max concurrent tasks
  timeout?: number;            // Task timeout in ms
}

// ============================================================================
// Feeling Types (for Feeling Agent)
// ============================================================================

export interface Feeling {
  valence: number;      // -1 (negative) to +1 (positive)
  arousal: number;      // 0 (calm) to 1 (excited)
  importance: number;   // 0 to 1
  category: FeelingCategory;
}

export type FeelingCategory =
  | 'curiosity'    // Something novel/interesting
  | 'satisfaction' // Goal achieved
  | 'frustration'  // Repeated failures
  | 'urgency'      // Time-sensitive
  | 'calm'         // Stable state
  | 'concern';     // Potential problem

// ============================================================================
// Ethical Types (for Ethicist Agent)
// ============================================================================

export interface EthicalDecision {
  action: string;
  allow: boolean | 'defer';
  confidence: number;
  reason: string;
  priority: EthicalPriority;
  reversible: boolean;
  potentialHarm: number;
  flourishingScore?: number;
}

export type EthicalPriority =
  | 'P0_SURVIVAL'        // Don't self-destruct
  | 'P1_MINIMIZE_HARM'   // Minimax harm
  | 'P2_REVERSIBILITY'   // Prefer undoable
  | 'P3_AUTONOMY'        // Respect human choices
  | 'P4_FLOURISHING';    // Maximize good

// ============================================================================
// Memory Types (for Memory Agent)
// ============================================================================

export interface MemoryItem {
  id: string;
  type: 'episodic' | 'semantic' | 'procedural';
  content: any;

  // Temporal
  created: Date;
  lastAccessed: Date;
  accessCount: number;

  // Ebbinghaus model
  R0: number;           // Initial strength
  S: number;            // Stability

  // Evaluation
  importance: number;
  emotionalValence: number;
  associations: string[];

  // State
  consolidated: boolean;
}

export interface MemoryQuery {
  type?: 'episodic' | 'semantic' | 'procedural';
  keywords?: string[];
  minImportance?: number;
  timeRange?: { start: Date; end: Date };
  limit?: number;
}

// ============================================================================
// Plan Types (for Planner Agent)
// ============================================================================

export interface Plan {
  id: string;
  goal: string;
  steps: PlanStep[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: Date;
  estimatedDuration?: number;
}

export interface PlanStep {
  id: string;
  description: string;
  agent: AgentType;
  dependencies: string[];  // Step IDs that must complete first
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: any;
}

// ============================================================================
// Prediction Types (for Predictor Agent)
// ============================================================================

export interface Prediction {
  action: string;
  outcomes: PredictedOutcome[];
  confidence: number;
  timeHorizon: 'immediate' | 'short' | 'medium' | 'long';
}

export interface PredictedOutcome {
  description: string;
  probability: number;
  impact: number;        // -1 to +1
  reversible: boolean;
}

// ============================================================================
// Exploration Types (for Explorer Agent)
// ============================================================================

export interface ExplorationResult {
  query: string;
  sources: ExplorationSource[];
  findings: Finding[];
  novelty: number;       // 0 to 1
  relevance: number;     // 0 to 1
}

export interface ExplorationSource {
  type: 'arxiv' | 'semantic-scholar' | 'brave' | 'gemini' | 'exa' | 'firecrawl' | 'context7' | 'wolfram';
  url?: string;
  title?: string;
}

export interface Finding {
  content: string;
  source: ExplorationSource;
  importance: number;
  isNovel: boolean;
}

// ============================================================================
// Critique Types (for Critic Agent)
// ============================================================================

export interface Critique {
  target: string;
  problems: Problem[];
  suggestions: Suggestion[];
  overallScore: number;  // 0 to 1
  passesReview: boolean;
}

export interface Problem {
  id: string;
  severity: 'critical' | 'major' | 'minor' | 'nitpick';
  description: string;
  location?: string;
}

export interface Suggestion {
  problemId: string;
  description: string;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
}

// ============================================================================
// Build Types (for Builder Agent)
// ============================================================================

export interface BuildRequest {
  type: 'code' | 'document' | 'config' | 'test';
  spec: string;
  language?: string;
  framework?: string;
  constraints?: string[];
}

export interface BuildResult {
  success: boolean;
  artifacts: Artifact[];
  errors?: string[];
  warnings?: string[];
}

export interface Artifact {
  type: 'file' | 'snippet' | 'diagram';
  name: string;
  content: string;
  path?: string;
}

// Extended artifact for Builder agent
export interface BuildArtifact {
  type: 'file' | 'snippet' | 'diagram';
  name: string;
  language?: string;
  content: string;
  path?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// Narrative Types (for Narrator Agent)
// ============================================================================

export interface Narrative {
  title: string;
  summary: string;
  events: NarrativeEvent[];
  themes: string[];
  mood: FeelingCategory;
}

export interface NarrativeEvent {
  timestamp: Date;
  description: string;
  significance: number;
  agents: AgentId[];
}
