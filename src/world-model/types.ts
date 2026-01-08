/**
 * Genesis 6.0 - World Model Types
 *
 * Types for the unified world model implementing:
 * - JEPA-style latent space encoding
 * - Predictive modeling and simulation
 * - Digital twin capabilities
 * - Dream mode consolidation
 *
 * Key concepts:
 * - Latent space: Compressed representation of world state
 * - Prediction: Single-step state transition
 * - Simulation: Multi-step trajectory generation
 * - Digital Twin: Real-time synchronized model
 *
 * References:
 * - LeCun (2022). A Path Towards Autonomous Machine Intelligence
 * - JEPA (Joint Embedding Predictive Architecture)
 * - World Models (Ha & Schmidhuber, 2018)
 *
 * Key invariant: INV-008 - World model consistency
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Modality types that can be encoded
 */
export type Modality = 'text' | 'image' | 'code' | 'state' | 'audio' | 'sensor';

/**
 * Input for encoding - multimodal
 */
export interface MultimodalInput {
  modality: Modality;
  data: unknown;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Text input for encoding
 */
export interface TextInput extends MultimodalInput {
  modality: 'text';
  data: string;
  language?: string;
  context?: string;
}

/**
 * Image input for encoding
 */
export interface ImageInput extends MultimodalInput {
  modality: 'image';
  data: string; // Base64 or URL
  width?: number;
  height?: number;
  format?: 'png' | 'jpg' | 'webp';
}

/**
 * Code input for encoding
 */
export interface CodeInput extends MultimodalInput {
  modality: 'code';
  data: string;
  language: string;
  filePath?: string;
}

/**
 * State input (agent/system state)
 */
export interface StateInput extends MultimodalInput {
  modality: 'state';
  data: Record<string, unknown>;
  componentId?: string;
}

/**
 * Sensor input (from MCP servers)
 */
export interface SensorInput extends MultimodalInput {
  modality: 'sensor';
  data: unknown;
  sensorType: string;
  source: string; // MCP server name
}

// ============================================================================
// Latent Space Types
// ============================================================================

/**
 * Latent state - compressed representation
 */
export interface LatentState {
  // Vector representation
  vector: number[];
  dimensions: number;

  // Source information
  sourceModality: Modality;
  sourceId: string;

  // Metadata
  timestamp: Date;
  confidence: number;
  entropy: number;

  // Optional structured features
  features?: LatentFeature[];
}

/**
 * Named feature in latent space
 */
export interface LatentFeature {
  name: string;
  indices: number[];
  activation: number;
}

/**
 * Encoder configuration
 */
export interface EncoderConfig {
  latentDim: number;                    // Dimensionality (default: 512)
  modalityWeights: Record<Modality, number>;
  useCompression: boolean;
  compressionRatio: number;
  normalizeOutput: boolean;
}

export const DEFAULT_ENCODER_CONFIG: EncoderConfig = {
  latentDim: 512,
  modalityWeights: {
    text: 1.0,
    image: 1.0,
    code: 1.0,
    state: 1.0,
    audio: 0.8,
    sensor: 0.9,
  },
  useCompression: true,
  compressionRatio: 0.1,
  normalizeOutput: true,
};

// ============================================================================
// Prediction Types
// ============================================================================

/**
 * Action that can be taken in the world
 */
export interface Action {
  id: string;
  type: ActionType;
  parameters: Record<string, unknown>;
  agent: string;
  timestamp: Date;
}

export type ActionType =
  | 'observe'       // Passive observation
  | 'query'         // Information request
  | 'execute'       // Code/command execution
  | 'communicate'   // Send message
  | 'transform'     // Modify state
  | 'create'        // Create new entity
  | 'delete'        // Remove entity
  | 'navigate';     // Change focus/context

/**
 * Predicted state after action
 */
export interface PredictedState {
  state: LatentState;
  action: Action;
  probability: number;              // P(state | action, current)
  uncertainty: number;              // Epistemic uncertainty
  alternativeStates: LatentState[]; // Other possible outcomes
  predictionTime: number;           // Time to compute (ms)
}

/**
 * Trajectory - sequence of states
 */
export interface Trajectory {
  id: string;
  initialState: LatentState;
  actions: Action[];
  states: PredictedState[];
  totalProbability: number;
  horizon: number;
  simulationTime: number;
}

/**
 * World model configuration
 */
export interface WorldModelConfig {
  maxHorizon: number;               // Max simulation steps
  uncertaintyThreshold: number;     // Stop if uncertainty exceeds this
  branchingFactor: number;          // Max alternative states
  updateIntervalMs: number;         // How often to update model
  consistencyCheckIntervalMs: number; // INV-008 check interval
}

export const DEFAULT_WORLD_MODEL_CONFIG: WorldModelConfig = {
  maxHorizon: 100,
  uncertaintyThreshold: 0.8,
  branchingFactor: 3,
  updateIntervalMs: 1000,
  consistencyCheckIntervalMs: 5000,
};

// ============================================================================
// Physics / Common Sense Types
// ============================================================================

/**
 * Physics query for common sense reasoning
 */
export interface PhysicsQuery {
  type: PhysicsQueryType;
  objects: PhysicsObject[];
  question: string;
  constraints?: PhysicsConstraint[];
}

export type PhysicsQueryType =
  | 'collision'     // Will objects collide?
  | 'stability'     // Is configuration stable?
  | 'containment'   // Is A inside B?
  | 'reachability'  // Can A reach B?
  | 'causation'     // Will A cause B?
  | 'trajectory';   // What path will A follow?

export interface PhysicsObject {
  id: string;
  type: string;
  position?: [number, number, number];
  velocity?: [number, number, number];
  mass?: number;
  properties: Record<string, unknown>;
}

export interface PhysicsConstraint {
  type: 'gravity' | 'friction' | 'boundary' | 'connection';
  parameters: Record<string, unknown>;
}

export interface PhysicsAnswer {
  query: PhysicsQuery;
  answer: boolean | number | string;
  confidence: number;
  reasoning: string[];
  visualization?: string; // Optional ASCII/description
}

// ============================================================================
// Digital Twin Types
// ============================================================================

/**
 * Digital twin - synchronized model of real system
 */
export interface DigitalTwin {
  id: string;
  name: string;
  realSystemId: string;

  // Current state
  currentState: LatentState;
  lastSync: Date;
  syncDrift: number;              // Divergence from real system

  // History
  stateHistory: LatentState[];
  historyLimit: number;

  // Configuration
  config: DigitalTwinConfig;

  // Status
  status: TwinStatus;
}

export interface DigitalTwinConfig {
  syncIntervalMs: number;
  maxDrift: number;               // Trigger re-sync if exceeded
  predictAhead: number;           // Steps to predict ahead
  trackMetrics: string[];         // Metrics to monitor
}

export const DEFAULT_DIGITAL_TWIN_CONFIG: DigitalTwinConfig = {
  syncIntervalMs: 1000,
  maxDrift: 0.1,
  predictAhead: 10,
  trackMetrics: ['energy', 'health', 'performance'],
};

export type TwinStatus = 'synced' | 'drifting' | 'disconnected' | 'initializing';

// ============================================================================
// Dream Mode Types
// ============================================================================

/**
 * Dream cycle result
 */
export interface DreamResult {
  startTime: Date;
  endTime: Date;
  duration: number;

  // Phase results
  slowWaveReplay: SlowWaveResult;
  remAbstraction: REMResult;
  consolidation: ConsolidationResult;

  // Overall metrics
  memoriesConsolidated: number;
  patternsExtracted: number;
  modelImproved: boolean;
}

/**
 * Slow-wave replay phase
 * Replays recent experiences
 */
export interface SlowWaveResult {
  experiencesReplayed: number;
  strongestMemories: string[];
  replayDuration: number;
}

/**
 * REM abstraction phase
 * Extracts patterns and generalizations
 */
export interface REMResult {
  patternsFound: Pattern[];
  abstractionLevel: number;
  creativeCombinations: number;
}

/**
 * Pattern extracted during REM
 */
export interface Pattern {
  id: string;
  type: 'sequence' | 'structure' | 'causal' | 'analogy';
  elements: string[];
  confidence: number;
  novelty: number;
}

/**
 * Consolidation phase
 * Integrates learnings into world model
 */
export interface ConsolidationResult {
  modelUpdates: number;
  pruned: number;
  strengthened: number;
  newConnections: number;
}

/**
 * Dream mode configuration
 */
export interface DreamConfig {
  slowWaveDuration: number;       // ms
  remDuration: number;            // ms
  consolidationDuration: number;  // ms
  triggerThreshold: number;       // Energy level to trigger
  minPendingMemories: number;     // Min memories before dream
}

export const DEFAULT_DREAM_CONFIG: DreamConfig = {
  slowWaveDuration: 10000,        // 10 seconds
  remDuration: 15000,             // 15 seconds
  consolidationDuration: 5000,    // 5 seconds
  triggerThreshold: 0.3,
  minPendingMemories: 10,
};

// ============================================================================
// Entity Types (for world model)
// ============================================================================

/**
 * Entity in the world model
 */
export interface WorldEntity {
  id: string;
  type: EntityType;
  name: string;

  // State
  state: LatentState;
  properties: Record<string, unknown>;

  // Relations
  relations: EntityRelation[];

  // Lifecycle
  created: Date;
  lastUpdated: Date;
  confidence: number;             // Confidence this entity exists
}

export type EntityType =
  | 'agent'         // Active entity (can take actions)
  | 'object'        // Passive entity
  | 'location'      // Place/context
  | 'event'         // Temporal entity
  | 'concept'       // Abstract entity
  | 'process';      // Ongoing activity

/**
 * Relation between entities
 */
export interface EntityRelation {
  id: string;
  type: RelationType;
  source: string;                 // Entity ID
  target: string;                 // Entity ID
  strength: number;               // 0-1
  bidirectional: boolean;
  properties: Record<string, unknown>;
}

export type RelationType =
  | 'contains'      // Spatial containment
  | 'part_of'       // Part-whole
  | 'causes'        // Causal
  | 'before'        // Temporal
  | 'similar'       // Similarity
  | 'opposite'      // Opposition
  | 'instance_of'   // Type-instance
  | 'interacts'     // General interaction
  | 'depends_on';   // Dependency

// ============================================================================
// Consistency Types (INV-008)
// ============================================================================

/**
 * Consistency check result
 */
export interface ConsistencyCheck {
  id: string;
  timestamp: Date;
  passed: boolean;

  // Specific checks
  checks: {
    stateConsistency: boolean;    // Latent states consistent
    temporalConsistency: boolean; // Time ordering valid
    causalConsistency: boolean;   // Cause-effect valid
    entityConsistency: boolean;   // Entities properly linked
  };

  // Issues found
  issues: ConsistencyIssue[];

  // Metrics
  inconsistencyScore: number;     // 0 = fully consistent
}

export interface ConsistencyIssue {
  type: 'contradiction' | 'gap' | 'cycle' | 'orphan' | 'drift';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedEntities: string[];
  suggestedFix?: string;
}

// ============================================================================
// Event Types
// ============================================================================

export type WorldModelEventType =
  | 'state_predicted'
  | 'simulation_complete'
  | 'entity_created'
  | 'entity_updated'
  | 'entity_deleted'
  | 'relation_added'
  | 'relation_removed'
  | 'consistency_check'
  | 'consistency_violation'
  | 'dream_started'
  | 'dream_complete'
  | 'twin_synced'
  | 'twin_drifted';

export interface WorldModelEvent {
  type: WorldModelEventType;
  timestamp: Date;
  data: unknown;
}

export type WorldModelEventHandler = (event: WorldModelEvent) => void;

// ============================================================================
// Configuration
// ============================================================================

export interface WorldModelSystemConfig {
  encoder: Partial<EncoderConfig>;
  predictor: Partial<WorldModelConfig>;
  twin: Partial<DigitalTwinConfig>;
  dream: Partial<DreamConfig>;

  // Entity management
  maxEntities: number;
  entityTTL: number;              // ms before pruning unused entities

  // Consistency
  consistencyCheckEnabled: boolean;
  autoRepairEnabled: boolean;
}

export const DEFAULT_WORLD_MODEL_SYSTEM_CONFIG: WorldModelSystemConfig = {
  encoder: DEFAULT_ENCODER_CONFIG,
  predictor: DEFAULT_WORLD_MODEL_CONFIG,
  twin: DEFAULT_DIGITAL_TWIN_CONFIG,
  dream: DEFAULT_DREAM_CONFIG,
  maxEntities: 10000,
  entityTTL: 3600000,             // 1 hour
  consistencyCheckEnabled: true,
  autoRepairEnabled: true,
};
