/**
 * Genesis 6.0 - Memory Module Types
 *
 * Based on cognitive science memory architecture:
 * - Episodic: Events with when/where/who (autobiographical)
 * - Semantic: Facts and concepts (encyclopedic)
 * - Procedural: Skills and workflows (know-how)
 *
 * References:
 * - Tulving (1972): Episodic vs Semantic distinction
 * - Ebbinghaus (1885): Forgetting curve R = e^(-t/S)
 * - FSRS: Free Spaced Repetition Scheduler
 */

// ============================================================================
// Core Memory Types
// ============================================================================

/**
 * Memory type classification (Tulving model)
 */
export type MemoryType = 'episodic' | 'semantic' | 'procedural';

/**
 * Memory priority levels for working memory and retrieval
 */
export type MemoryPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Base interface for all memory items
 */
export interface BaseMemory {
  id: string;
  type: MemoryType;
  created: Date;
  lastAccessed: Date;
  accessCount: number;

  // Ebbinghaus forgetting parameters
  R0: number;             // Initial retention strength (0-1)
  S: number;              // Stability in days (how long until 50% forgotten)

  // Metadata
  importance: number;     // 0-1, affects consolidation priority
  emotionalValence: number; // -1 to 1, affects retention
  associations: string[]; // IDs of related memories
  tags: string[];         // Searchable tags

  // State
  consolidated: boolean;  // Has been moved to long-term
  source?: string;        // Where this memory came from
}

// ============================================================================
// Episodic Memory (Events)
// ============================================================================

/**
 * Episodic memories are events with context
 * "What happened, when, where, who was involved"
 */
export interface EpisodicMemory extends BaseMemory {
  type: 'episodic';

  // Event content
  content: {
    what: string;           // What happened
    details: any;           // Detailed content
  };

  // Temporal context
  when: {
    timestamp: Date;        // When it happened
    duration?: number;      // Duration in ms (if applicable)
    sequence?: number;      // Order in a sequence of events
  };

  // Spatial context (optional)
  where?: {
    location: string;       // Logical location (e.g., "session-42", "github-repo")
    context: string;        // Broader context
  };

  // Social context (optional)
  who?: {
    agents: string[];       // Agents involved
    roles: Record<string, string>; // Agent -> role mapping
  };

  // Emotional coloring
  feeling?: {
    valence: number;        // -1 to 1
    arousal: number;        // 0 to 1
    label?: string;         // Named emotion
  };
}

// ============================================================================
// Semantic Memory (Facts)
// ============================================================================

/**
 * Semantic memories are facts and concepts
 * "What things mean, general knowledge"
 */
export interface SemanticMemory extends BaseMemory {
  type: 'semantic';

  // Fact content
  content: {
    concept: string;        // The main concept/fact
    definition?: string;    // Definition or explanation
    properties: Record<string, any>; // Key properties
  };

  // Taxonomy
  category: string;         // Category this belongs to
  superordinates: string[]; // More general concepts (is-a)
  subordinates: string[];   // More specific concepts (has-a)
  related: string[];        // Related concepts

  // Confidence
  confidence: number;       // 0-1, how certain we are
  sources: string[];        // Where this knowledge came from
  contradictions?: string[]; // IDs of conflicting memories

  // Usage
  usageCount: number;       // How often used in reasoning
  lastUsed: Date;
}

// ============================================================================
// Procedural Memory (Skills)
// ============================================================================

/**
 * Procedural memories are skills and workflows
 * "How to do things"
 */
export interface ProceduralMemory extends BaseMemory {
  type: 'procedural';

  // Skill content
  content: {
    name: string;           // Skill name
    description: string;    // What it does
    steps: ProceduralStep[];
  };

  // Prerequisites
  requires: string[];       // Required skills/knowledge
  inputs: ParameterDef[];   // Input parameters
  outputs: ParameterDef[];  // Output parameters

  // Execution stats
  successRate: number;      // Historical success rate
  avgDuration: number;      // Average execution time in ms
  executionCount: number;   // Times executed

  // Versioning
  version: number;
  improvements: string[];   // Log of improvements made
}

export interface ProceduralStep {
  order: number;
  action: string;
  params?: Record<string, any>;
  condition?: string;       // When to execute this step
  fallback?: string;        // What to do if step fails
}

export interface ParameterDef {
  name: string;
  type: string;
  required: boolean;
  default?: any;
  description?: string;
}

// ============================================================================
// Union Type
// ============================================================================

export type Memory = EpisodicMemory | SemanticMemory | ProceduralMemory;

// ============================================================================
// Store Interface
// ============================================================================

/**
 * Interface for memory stores
 */
export interface IMemoryStore<T extends BaseMemory> {
  // CRUD
  store(memory: Omit<T, 'id' | 'created' | 'lastAccessed' | 'accessCount'>): T;
  get(id: string): T | undefined;
  update(id: string, updates: Partial<T>): T | undefined;
  delete(id: string): boolean;

  // Query
  query(filter: MemoryFilter<T>): T[];
  search(query: string, limit?: number): T[];

  // Bulk
  getAll(): T[];
  clear(): void;

  // Stats
  count(): number;
  stats(): StoreStats;
}

export interface MemoryFilter<T extends BaseMemory> {
  type?: MemoryType;
  minImportance?: number;
  maxAge?: number;            // Max age in days
  minRetention?: number;      // Min current retention
  tags?: string[];
  consolidated?: boolean;
  custom?: (memory: T) => boolean;
}

export interface StoreStats {
  total: number;
  byType: Record<MemoryType, number>;
  consolidated: number;
  avgRetention: number;
  avgImportance: number;
  oldestMemory?: Date;
  newestMemory?: Date;
}

// ============================================================================
// Consolidation Types
// ============================================================================

export type ConsolidationMode = 'background' | 'sleep' | 'immediate';

export interface ConsolidationResult {
  mode: ConsolidationMode;
  timestamp: Date;
  duration: number;         // ms

  // What happened
  episodicProcessed: number;
  semanticCreated: number;
  proceduralUpdated: number;
  forgotten: number;
  merged: number;

  // New knowledge
  newFacts: string[];       // IDs of new semantic memories
  updatedSkills: string[];  // IDs of updated procedures
}

export interface ConsolidationConfig {
  // Thresholds
  retentionThreshold: number;     // Below this, forget
  consolidationThreshold: number; // Above this, consolidate
  mergeThreshold: number;         // Similarity threshold for merging

  // Timing
  backgroundIntervalMs: number;   // How often to run background consolidation
  sleepDurationMs: number;        // How long sleep consolidation runs

  // Limits
  maxEpisodicAge: number;         // Max days before forcing consolidation
  maxSemanticSize: number;        // Max semantic memories before pruning
}

// ============================================================================
// Forgetting Types
// ============================================================================

export interface ForgettingParams {
  R0: number;   // Initial retention (0-1)
  S: number;    // Stability in days
}

export interface RetentionResult {
  retention: number;        // Current retention (0-1)
  elapsedDays: number;      // Days since last access
  predictedHalfLife: number; // Days until retention = 0.5
  shouldForget: boolean;    // Below threshold?
}

// ============================================================================
// Memory Event Types
// ============================================================================

export type MemoryEventType =
  | 'STORE'
  | 'ACCESS'
  | 'UPDATE'
  | 'DELETE'
  | 'CONSOLIDATE'
  | 'FORGET'
  | 'MERGE'
  | 'ASSOCIATE';

export interface MemoryEvent {
  type: MemoryEventType;
  memoryId: string;
  memoryType: MemoryType;
  timestamp: Date;
  details?: Record<string, any>;
}
