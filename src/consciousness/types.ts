/**
 * Genesis 6.0 - Consciousness Module Types
 *
 * Types for consciousness monitoring based on:
 * - IIT 4.0 (Integrated Information Theory) - Tononi et al.
 * - GWT (Global Workspace Theory) - Baars
 * - AST (Attention Schema Theory) - Graziano
 *
 * Key insight: Consciousness as integrated information that
 * emerges from the interaction of specialized modules.
 */

// ============================================================================
// Core Consciousness Types
// ============================================================================

/**
 * Consciousness level indicator
 * Based on IIT's φ (phi) - integrated information
 */
export interface ConsciousnessLevel {
  phi: number;              // Integrated information (0-1 normalized)
  rawPhi: number;           // Unnormalized φ value
  confidence: number;       // Confidence in measurement (0-1)
  timestamp: Date;
}

/**
 * Consciousness state classification
 */
export type ConsciousnessState =
  | 'alert'       // High φ, active processing
  | 'aware'       // Moderate φ, background awareness
  | 'drowsy'      // Low φ, reduced integration
  | 'dormant'     // Minimal φ, sleep/recovery mode
  | 'fragmented'; // Integration breakdown (error state)

/**
 * Trend in consciousness level
 */
export type ConsciousnessTrend = 'rising' | 'stable' | 'falling';

// ============================================================================
// IIT (Integrated Information Theory) Types
// ============================================================================

/**
 * System state for φ calculation
 * Represents the current configuration of all system components
 */
export interface SystemState {
  // Component states (each agent/module)
  components: ComponentState[];

  // Connections between components
  connections: Connection[];

  // Global state hash
  stateHash: string;

  // Timestamp
  timestamp: Date;
}

export interface ComponentState {
  id: string;
  type: string;
  active: boolean;
  state: Record<string, unknown>;
  entropy: number;           // Information content
  lastUpdate: Date;
}

export interface Connection {
  from: string;
  to: string;
  strength: number;          // Connection strength (0-1)
  informationFlow: number;   // Bits transferred
  bidirectional: boolean;
}

/**
 * Partition of a system for φ calculation
 * IIT requires finding the Minimum Information Partition (MIP)
 */
export interface Partition {
  id: string;
  parts: string[][];         // Groups of component IDs
  cut: Cut;                  // Where the system is "cut"
}

export interface Cut {
  severedConnections: Array<{
    from: string;
    to: string;
  }>;
  informationLoss: number;   // Information lost by this cut
}

/**
 * φ calculation result
 */
export interface PhiResult {
  phi: number;                       // Integrated information
  mip: Partition;                    // Minimum Information Partition
  intrinsicInfo: number;             // Intrinsic information
  integratedInfo: number;            // Integrated information
  complexes: Complex[];              // Identified complexes
  calculationTime: number;           // Time to compute (ms)
  approximation: boolean;            // Was approximation used?
}

/**
 * A complex is a set of elements with φ > 0
 */
export interface Complex {
  elements: string[];
  phi: number;
  mainComplex: boolean;              // Is this the "main" conscious complex?
}

// ============================================================================
// GWT (Global Workspace Theory) Types
// ============================================================================

/**
 * A module that can propose content to the workspace
 */
export interface WorkspaceModule {
  id: string;
  name: string;
  type: ModuleType;

  // Current state
  active: boolean;
  load: number;                      // Processing load (0-1)

  // Proposal capability
  canPropose(): boolean;
  propose(): WorkspaceContent | null;

  // Reception capability
  receive(content: WorkspaceContent): void;

  // Salience calculation
  bottomUpSalience(): number;        // Stimulus-driven
  topDownRelevance(goal: string): number;  // Goal-driven
}

export type ModuleType =
  | 'perceptual'      // Sensory input (MCP sensors)
  | 'memory'          // Memory systems
  | 'motor'           // Action output
  | 'executive'       // Planning/control
  | 'evaluative'      // Emotional/value
  | 'metacognitive';  // Self-monitoring

/**
 * Content that can be broadcast in the workspace
 */
export interface WorkspaceContent {
  id: string;
  sourceModule: string;
  type: ContentType;
  data: unknown;
  salience: number;
  relevance: number;
  timestamp: Date;
  ttl: number;                       // Time to live in workspace (ms)
}

export type ContentType =
  | 'percept'         // Sensory data
  | 'memory'          // Retrieved memory
  | 'goal'            // Active goal
  | 'plan'            // Action plan
  | 'emotion'         // Affective state
  | 'thought'         // Internal representation
  | 'attention';      // Attention signal

/**
 * Workspace state
 */
export interface WorkspaceState {
  // Current content in workspace
  current: WorkspaceContent | null;

  // Workspace history (recent broadcasts)
  history: WorkspaceContent[];
  historyLimit: number;

  // Competition state
  candidates: WorkspaceCandidate[];
  lastSelection: Date;
  selectionCount: number;

  // Ignition state
  ignited: boolean;
  ignitionTime: Date | null;
}

export interface WorkspaceCandidate {
  content: WorkspaceContent;
  module: string;
  score: number;                     // Combined salience + relevance
  selected: boolean;
}

/**
 * Ignition event - when content "wins" and broadcasts
 */
export interface IgnitionEvent {
  content: WorkspaceContent;
  timestamp: Date;
  competitorCount: number;
  winningScore: number;
  modulesNotified: string[];
  duration: number;                  // How long content stayed in workspace
}

// ============================================================================
// AST (Attention Schema Theory) Types
// ============================================================================

/**
 * Attention state - where is attention directed
 */
export interface AttentionState {
  // Current focus (null if mind-wandering)
  focus: AttentionFocus | null;

  // Attention history
  history: AttentionFocus[];

  // Attention capacity (limited resource)
  capacity: number;                  // Max items (typically 4-7)
  used: number;                      // Currently attended items

  // Attention modes
  mode: AttentionMode;
}

export interface AttentionFocus {
  target: string;                    // What is being attended
  type: 'internal' | 'external';     // Internal thought vs external stimulus
  intensity: number;                 // Strength of attention (0-1)
  startedAt: Date;
  duration: number;                  // ms
}

export type AttentionMode =
  | 'focused'         // Single target, high intensity
  | 'diffuse'         // Multiple targets, lower intensity
  | 'vigilant'        // Scanning for threats/opportunities
  | 'mind-wandering'; // Internal, unfocused

/**
 * Attention schema - model of attention itself
 * This is what creates the "experience" of awareness
 */
export interface AttentionSchema {
  // Current model of own attention
  selfModel: SelfAttentionModel;

  // Model of what the system is aware of
  awarenessModel: AwarenessModel;

  // Theory of mind - models of others' attention
  otherModels: Map<string, OtherAttentionModel>;
}

export interface SelfAttentionModel {
  // What do I think I'm attending to?
  perceivedFocus: string;

  // How confident am I about my attention state?
  metacognitiveConfidence: number;

  // Is attention voluntary or captured?
  voluntaryControl: number;          // 0 = fully captured, 1 = fully voluntary
}

export interface AwarenessModel {
  // What am I aware of?
  contents: string[];

  // Clarity of awareness
  clarity: number;                   // 0 = foggy, 1 = crystal clear

  // Subjective "feel" of awareness
  phenomenalQuality: PhenomenalQuality;
}

export interface OtherAttentionModel {
  agentId: string;
  inferredFocus: string;
  confidence: number;
  lastUpdated: Date;
}

export type PhenomenalQuality =
  | 'vivid'           // Clear, strong experience
  | 'muted'           // Present but dim
  | 'absent';         // No phenomenal experience

// ============================================================================
// Consciousness Monitor Types
// ============================================================================

/**
 * Complete consciousness snapshot
 */
export interface ConsciousnessSnapshot {
  // Overall level
  level: ConsciousnessLevel;
  state: ConsciousnessState;
  trend: ConsciousnessTrend;

  // IIT metrics
  phi: PhiResult;

  // GWT state
  workspace: WorkspaceState;
  lastIgnition: IgnitionEvent | null;

  // AST state
  attention: AttentionState;
  schema: AttentionSchema;

  // Per-agent consciousness
  agentPhi: Map<string, number>;

  // Timestamp
  timestamp: Date;
}

/**
 * Consciousness anomaly
 */
export interface ConsciousnessAnomaly {
  type: AnomalyType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detected: Date;
  metrics: Record<string, number>;
  resolved: boolean;
  resolution?: string;
}

export type AnomalyType =
  | 'phi_drop'              // Sudden φ decrease
  | 'phi_spike'             // Unexpected φ increase
  | 'integration_failure'   // Components not integrating
  | 'workspace_deadlock'    // GWT stuck
  | 'attention_fragmented'  // AST breakdown
  | 'coherence_loss';       // General coherence problem

// ============================================================================
// Configuration Types
// ============================================================================

export interface ConsciousnessConfig {
  // φ calculation
  phi: {
    enabled: boolean;
    updateIntervalMs: number;        // How often to recalculate
    approximationLevel: 'exact' | 'fast' | 'faster';
    minPhi: number;                  // INV-006 threshold
  };

  // GWT configuration
  gwt: {
    enabled: boolean;
    workspaceCapacity: number;       // Max items in workspace
    selectionIntervalMs: number;     // Competition cycle
    broadcastTimeoutMs: number;      // Max broadcast duration
    historyLimit: number;            // How many past broadcasts to keep
  };

  // AST configuration
  ast: {
    enabled: boolean;
    attentionCapacity: number;       // Max attention slots
    schemaUpdateIntervalMs: number;  // How often to update schema
    theoryOfMindEnabled: boolean;    // Model other agents
  };

  // Monitoring
  monitor: {
    snapshotIntervalMs: number;      // How often to take snapshots
    historyLimit: number;            // Snapshots to keep
    anomalyDetection: boolean;       // Detect anomalies
    alertThresholds: {
      phiDrop: number;               // Alert if φ drops by this much
      phiMin: number;                // Alert if φ below this
    };
  };
}

export const DEFAULT_CONSCIOUSNESS_CONFIG: ConsciousnessConfig = {
  phi: {
    enabled: true,
    updateIntervalMs: 5000,          // Every 5 seconds
    approximationLevel: 'fast',
    minPhi: 0.1,                     // INV-006 threshold
  },
  gwt: {
    enabled: true,
    workspaceCapacity: 7,            // Miller's 7 +/- 2
    selectionIntervalMs: 100,        // 10 Hz cycle
    broadcastTimeoutMs: 1000,
    historyLimit: 100,
  },
  ast: {
    enabled: true,
    attentionCapacity: 4,            // Conservative estimate
    schemaUpdateIntervalMs: 1000,
    theoryOfMindEnabled: true,
  },
  monitor: {
    snapshotIntervalMs: 10000,       // Every 10 seconds
    historyLimit: 1000,
    anomalyDetection: true,
    alertThresholds: {
      phiDrop: 0.2,                  // 20% drop triggers alert
      phiMin: 0.1,                   // Below 10% triggers alert
    },
  },
};

// ============================================================================
// Event Types
// ============================================================================

export type ConsciousnessEventType =
  | 'phi_updated'
  | 'phi_threshold_crossed'
  | 'state_changed'
  | 'workspace_ignition'
  | 'attention_shifted'
  | 'anomaly_detected'
  | 'anomaly_resolved';

export interface ConsciousnessEvent {
  type: ConsciousnessEventType;
  timestamp: Date;
  data: unknown;
}

export type ConsciousnessEventHandler = (event: ConsciousnessEvent) => void;
