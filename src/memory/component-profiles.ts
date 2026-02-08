/**
 * Component-Specific Memory Profiles
 *
 * Each Genesis module gets personalized memory configuration:
 * - Custom retention curves (stability, importance weighting)
 * - Tailored consolidation strategies
 * - Component-specific retrieval preferences
 * - Adaptive capacity allocation
 *
 * Based on latest research:
 * - FSRS v4 for optimal spacing
 * - MemGPT-style persistent context
 * - Differential Mamba for selective attention
 *
 * @module memory/component-profiles
 * @version 18.3.0
 */

import type { MemoryPriority } from './types.js';

// =============================================================================
// Memory Profile Types
// =============================================================================

export type ComponentId =
  | 'brain'
  | 'content'
  | 'market-strategist'
  | 'economy'
  | 'agents'
  | 'self-improvement'
  | 'causal'
  | 'perception'
  | 'governance'
  | 'daemon'
  | 'grounding'
  | 'thinking'
  | 'consciousness'
  | 'neuromodulation'
  | 'allostasis'
  | 'world-model'
  | 'active-inference'
  | 'exotic'
  | 'default';

export interface FSRSParameters {
  /** Initial difficulty (1-10, default 5) */
  initialDifficulty: number;
  /** Learning/relearning steps in minutes */
  learningSteps: number[];
  /** Graduating interval in days */
  graduatingInterval: number;
  /** Easy interval in days */
  easyInterval: number;
  /** Easy bonus multiplier */
  easyBonus: number;
  /** Interval modifier (0.5 = 50% shorter, 1.5 = 50% longer) */
  intervalModifier: number;
  /** Maximum interval in days */
  maximumInterval: number;
  /** Weights for stability calculation [w0..w18] */
  weights: number[];
}

export interface RetentionCurve {
  /** Base stability in days (S parameter in R = e^(-t/S)) */
  baseStability: number;
  /** Stability multiplier on successful recall */
  recallMultiplier: number;
  /** Stability penalty on failed recall */
  failurePenalty: number;
  /** Minimum stability (floor) */
  minStability: number;
  /** Maximum stability (ceiling) */
  maxStability: number;
  /** Importance weight (how much importance affects stability) */
  importanceWeight: number;
  /** Emotional valence weight (how much emotion affects stability) */
  emotionalWeight: number;
  /** Novelty boost (new/surprising items get higher initial retention) */
  noveltyBoost: number;
}

export interface ConsolidationStrategy {
  /** Minimum episodes before consolidation attempt */
  minEpisodes: number;
  /** Maximum age before forced consolidation (days) */
  maxAge: number;
  /** Minimum retention threshold for consolidation */
  retentionThreshold: number;
  /** Use semantic clustering (embeddings) vs simple string matching */
  useSemanticClustering: boolean;
  /** Similarity threshold for grouping (0-1) */
  clusterThreshold: number;
  /** Extract causal relationships during consolidation */
  extractCausality: boolean;
  /** Number of patterns to extract per consolidation cycle */
  patternsPerCycle: number;
  /** Priority queue strategy */
  priorityStrategy: 'importance' | 'recency' | 'novelty' | 'emotional' | 'balanced';
}

export interface RetrievalPreferences {
  /** Preferred retrieval channel weights */
  channelWeights: {
    vector: number;    // Semantic similarity
    keyword: number;   // Exact match
    graph: number;     // Knowledge graph
    temporal: number;  // Time-based
  };
  /** RRF fusion constant (higher = less top-heavy) */
  rrfConstant: number;
  /** Default result limit */
  defaultLimit: number;
  /** Include related concepts in results */
  expandRelated: boolean;
  /** Maximum hops for graph traversal */
  maxGraphHops: number;
  /** Recency bias (0 = no bias, 1 = strong recency preference) */
  recencyBias: number;
  /** Context window for working memory */
  contextWindowSize: number;
}

export interface CapacityAllocation {
  /** Episodic memory capacity (events) */
  episodic: number;
  /** Semantic memory capacity (facts/concepts) */
  semantic: number;
  /** Procedural memory capacity (skills) */
  procedural: number;
  /** Working memory slots */
  workingMemory: number;
  /** Priority for capacity reallocation */
  reallocationPriority: number;
}

export interface ComponentMemoryProfile {
  /** Component identifier */
  componentId: ComponentId;
  /** Human-readable description */
  description: string;
  /** FSRS parameters for optimal scheduling */
  fsrs: FSRSParameters;
  /** Retention curve configuration */
  retention: RetentionCurve;
  /** Consolidation strategy */
  consolidation: ConsolidationStrategy;
  /** Retrieval preferences */
  retrieval: RetrievalPreferences;
  /** Capacity allocation */
  capacity: CapacityAllocation;
  /** Custom tags for this component's memories */
  baseTags: string[];
  /** Memory priority level */
  priority: MemoryPriority;
}

// =============================================================================
// Default FSRS Parameters (based on FSRS v4)
// =============================================================================

const DEFAULT_FSRS: FSRSParameters = {
  initialDifficulty: 5,
  learningSteps: [1, 10], // 1 min, 10 min
  graduatingInterval: 1,
  easyInterval: 4,
  easyBonus: 1.3,
  intervalModifier: 1.0,
  maximumInterval: 365,
  // FSRS v4 default weights
  weights: [
    0.4, 0.6, 2.4, 5.8,    // w0-w3: initial stability
    4.93, 0.94, 0.86, 0.01, // w4-w7: difficulty
    1.49, 0.14, 0.94,       // w8-w10: success
    2.18, 0.05, 0.34, 1.26, // w11-w14: failure
    0.29, 2.61,             // w15-w16: hard penalty
    0.0, 0.0                // w17-w18: reserved
  ],
};

// =============================================================================
// Component-Specific Profiles
// =============================================================================

export const COMPONENT_PROFILES: Record<ComponentId, ComponentMemoryProfile> = {
  // ---------------------------------------------------------------------------
  // Brain - Central reasoning engine
  // ---------------------------------------------------------------------------
  brain: {
    componentId: 'brain',
    description: 'Central reasoning and response generation',
    fsrs: {
      ...DEFAULT_FSRS,
      intervalModifier: 1.2, // Slightly longer intervals (reasoning patterns stable)
    },
    retention: {
      baseStability: 14,      // 2 weeks base
      recallMultiplier: 2.0,  // Strong reinforcement
      failurePenalty: 0.5,
      minStability: 1,
      maxStability: 180,
      importanceWeight: 0.8,  // High importance sensitivity
      emotionalWeight: 0.3,
      noveltyBoost: 1.5,
    },
    consolidation: {
      minEpisodes: 5,
      maxAge: 7,
      retentionThreshold: 0.6,
      useSemanticClustering: true,
      clusterThreshold: 0.75,
      extractCausality: true,
      patternsPerCycle: 10,
      priorityStrategy: 'balanced',
    },
    retrieval: {
      channelWeights: { vector: 1.2, keyword: 0.8, graph: 1.0, temporal: 0.6 },
      rrfConstant: 60,
      defaultLimit: 20,
      expandRelated: true,
      maxGraphHops: 2,
      recencyBias: 0.3,
      contextWindowSize: 15,
    },
    capacity: {
      episodic: 5000,
      semantic: 20000,
      procedural: 2000,
      workingMemory: 9,  // 7±2
      reallocationPriority: 10,
    },
    baseTags: ['brain', 'reasoning', 'response'],
    priority: 'high',
  },

  // ---------------------------------------------------------------------------
  // Content - Multi-platform publishing
  // ---------------------------------------------------------------------------
  content: {
    componentId: 'content',
    description: 'Content creation, SEO, social media publishing',
    fsrs: {
      ...DEFAULT_FSRS,
      intervalModifier: 0.8, // Shorter intervals (content trends change fast)
    },
    retention: {
      baseStability: 7,       // 1 week base (content relevance fades)
      recallMultiplier: 1.5,
      failurePenalty: 0.6,
      minStability: 1,
      maxStability: 90,       // 3 months max
      importanceWeight: 0.9,  // Very high importance sensitivity
      emotionalWeight: 0.5,   // Engagement-driven
      noveltyBoost: 2.0,      // Strong novelty preference (trends)
    },
    consolidation: {
      minEpisodes: 3,
      maxAge: 3,              // Fast consolidation for trends
      retentionThreshold: 0.5,
      useSemanticClustering: true,
      clusterThreshold: 0.7,
      extractCausality: false,
      patternsPerCycle: 15,   // More patterns (content variety)
      priorityStrategy: 'novelty',
    },
    retrieval: {
      channelWeights: { vector: 1.5, keyword: 1.0, graph: 0.5, temporal: 1.2 },
      rrfConstant: 50,
      defaultLimit: 30,
      expandRelated: true,
      maxGraphHops: 1,
      recencyBias: 0.7,       // Strong recency bias
      contextWindowSize: 10,
    },
    capacity: {
      episodic: 3000,
      semantic: 15000,
      procedural: 1000,
      workingMemory: 7,
      reallocationPriority: 7,
    },
    baseTags: ['content', 'social', 'seo', 'publishing'],
    priority: 'high',
  },

  // ---------------------------------------------------------------------------
  // Market Strategist - Weekly market analysis
  // ---------------------------------------------------------------------------
  'market-strategist': {
    componentId: 'market-strategist',
    description: 'Weekly market briefs, financial analysis, PPTX generation',
    fsrs: {
      ...DEFAULT_FSRS,
      intervalModifier: 1.5,  // Longer intervals (market patterns persist)
      maximumInterval: 730,   // 2 years
    },
    retention: {
      baseStability: 30,      // 1 month base (market cycles)
      recallMultiplier: 2.5,  // Strong reinforcement for accurate predictions
      failurePenalty: 0.7,
      minStability: 7,
      maxStability: 365,      // 1 year max
      importanceWeight: 0.7,
      emotionalWeight: 0.2,   // Low emotional weight (data-driven)
      noveltyBoost: 1.2,
    },
    consolidation: {
      minEpisodes: 4,
      maxAge: 14,             // 2 weeks before consolidation
      retentionThreshold: 0.7,
      useSemanticClustering: true,
      clusterThreshold: 0.8,  // Higher threshold (precision matters)
      extractCausality: true, // Market causality is crucial
      patternsPerCycle: 8,
      priorityStrategy: 'importance',
    },
    retrieval: {
      channelWeights: { vector: 1.0, keyword: 0.6, graph: 1.5, temporal: 1.3 },
      rrfConstant: 70,
      defaultLimit: 25,
      expandRelated: true,
      maxGraphHops: 3,        // Deeper graph traversal for market relationships
      recencyBias: 0.5,
      contextWindowSize: 12,
    },
    capacity: {
      episodic: 2000,
      semantic: 25000,        // Lots of market facts
      procedural: 500,
      workingMemory: 9,
      reallocationPriority: 8,
    },
    baseTags: ['market', 'finance', 'strategy', 'brief'],
    priority: 'high',
  },

  // ---------------------------------------------------------------------------
  // Economy - Revenue, costs, trading
  // ---------------------------------------------------------------------------
  economy: {
    componentId: 'economy',
    description: 'Economic fiber, revenue tracking, trading signals',
    fsrs: {
      ...DEFAULT_FSRS,
      intervalModifier: 1.3,
    },
    retention: {
      baseStability: 21,      // 3 weeks
      recallMultiplier: 2.0,
      failurePenalty: 0.4,    // Harsh penalty for economic mistakes
      minStability: 3,
      maxStability: 180,
      importanceWeight: 1.0,  // Maximum importance sensitivity
      emotionalWeight: 0.4,
      noveltyBoost: 1.0,
    },
    consolidation: {
      minEpisodes: 5,
      maxAge: 7,
      retentionThreshold: 0.65,
      useSemanticClustering: true,
      clusterThreshold: 0.75,
      extractCausality: true,
      patternsPerCycle: 10,
      priorityStrategy: 'importance',
    },
    retrieval: {
      channelWeights: { vector: 0.8, keyword: 1.0, graph: 1.2, temporal: 0.9 },
      rrfConstant: 60,
      defaultLimit: 20,
      expandRelated: true,
      maxGraphHops: 2,
      recencyBias: 0.4,
      contextWindowSize: 10,
    },
    capacity: {
      episodic: 4000,
      semantic: 15000,
      procedural: 1500,
      workingMemory: 7,
      reallocationPriority: 9,
    },
    baseTags: ['economy', 'revenue', 'cost', 'trading'],
    priority: 'critical',
  },

  // ---------------------------------------------------------------------------
  // Agents - Multi-agent coordination
  // ---------------------------------------------------------------------------
  agents: {
    componentId: 'agents',
    description: 'Agent pool, task delegation, collaboration',
    fsrs: {
      ...DEFAULT_FSRS,
      learningSteps: [1, 5, 15], // More learning steps (agents learn faster)
    },
    retention: {
      baseStability: 7,
      recallMultiplier: 1.8,
      failurePenalty: 0.6,
      minStability: 1,
      maxStability: 60,
      importanceWeight: 0.6,
      emotionalWeight: 0.2,
      noveltyBoost: 1.3,
    },
    consolidation: {
      minEpisodes: 10,        // More episodes before consolidation
      maxAge: 5,
      retentionThreshold: 0.5,
      useSemanticClustering: true,
      clusterThreshold: 0.65,
      extractCausality: false,
      patternsPerCycle: 20,
      priorityStrategy: 'recency',
    },
    retrieval: {
      channelWeights: { vector: 1.0, keyword: 1.2, graph: 0.8, temporal: 1.0 },
      rrfConstant: 55,
      defaultLimit: 15,
      expandRelated: false,
      maxGraphHops: 1,
      recencyBias: 0.6,
      contextWindowSize: 7,
    },
    capacity: {
      episodic: 8000,         // Many agent interactions
      semantic: 5000,
      procedural: 3000,       // Many skills
      workingMemory: 5,
      reallocationPriority: 6,
    },
    baseTags: ['agents', 'task', 'delegation', 'collaboration'],
    priority: 'normal',
  },

  // ---------------------------------------------------------------------------
  // Self-Improvement - Darwin-Gödel engine
  // ---------------------------------------------------------------------------
  'self-improvement': {
    componentId: 'self-improvement',
    description: 'Code improvement, self-modification, learning',
    fsrs: {
      ...DEFAULT_FSRS,
      intervalModifier: 2.0,  // Very long intervals (improvements are stable)
      maximumInterval: 730,
    },
    retention: {
      baseStability: 60,      // 2 months (improvements persist)
      recallMultiplier: 3.0,  // Very strong reinforcement
      failurePenalty: 0.8,
      minStability: 14,
      maxStability: 365,
      importanceWeight: 0.9,
      emotionalWeight: 0.1,
      noveltyBoost: 0.8,
    },
    consolidation: {
      minEpisodes: 3,
      maxAge: 30,
      retentionThreshold: 0.8,
      useSemanticClustering: true,
      clusterThreshold: 0.85,
      extractCausality: true,
      patternsPerCycle: 5,
      priorityStrategy: 'importance',
    },
    retrieval: {
      channelWeights: { vector: 1.3, keyword: 0.7, graph: 1.0, temporal: 0.4 },
      rrfConstant: 80,
      defaultLimit: 10,
      expandRelated: true,
      maxGraphHops: 2,
      recencyBias: 0.1,       // Low recency bias (old improvements still valid)
      contextWindowSize: 8,
    },
    capacity: {
      episodic: 1000,
      semantic: 10000,
      procedural: 2000,
      workingMemory: 7,
      reallocationPriority: 5,
    },
    baseTags: ['improvement', 'learning', 'modification', 'darwin-godel'],
    priority: 'normal',
  },

  // ---------------------------------------------------------------------------
  // Causal - Reasoning and intervention
  // ---------------------------------------------------------------------------
  causal: {
    componentId: 'causal',
    description: 'Causal graphs, counterfactuals, interventions',
    fsrs: {
      ...DEFAULT_FSRS,
      intervalModifier: 1.8,
    },
    retention: {
      baseStability: 45,
      recallMultiplier: 2.5,
      failurePenalty: 0.5,
      minStability: 7,
      maxStability: 365,
      importanceWeight: 0.8,
      emotionalWeight: 0.1,
      noveltyBoost: 1.0,
    },
    consolidation: {
      minEpisodes: 5,
      maxAge: 21,
      retentionThreshold: 0.7,
      useSemanticClustering: true,
      clusterThreshold: 0.8,
      extractCausality: true,  // Obviously
      patternsPerCycle: 8,
      priorityStrategy: 'balanced',
    },
    retrieval: {
      channelWeights: { vector: 0.8, keyword: 0.5, graph: 2.0, temporal: 0.5 },
      rrfConstant: 70,
      defaultLimit: 20,
      expandRelated: true,
      maxGraphHops: 4,        // Deep causal chains
      recencyBias: 0.2,
      contextWindowSize: 10,
    },
    capacity: {
      episodic: 2000,
      semantic: 20000,
      procedural: 500,
      workingMemory: 9,
      reallocationPriority: 7,
    },
    baseTags: ['causal', 'intervention', 'counterfactual', 'graph'],
    priority: 'high',
  },

  // ---------------------------------------------------------------------------
  // Perception - Multi-modal sensing
  // ---------------------------------------------------------------------------
  perception: {
    componentId: 'perception',
    description: 'Vision, audio, text processing',
    fsrs: {
      ...DEFAULT_FSRS,
      intervalModifier: 0.6,  // Short intervals (perceptions fade fast)
    },
    retention: {
      baseStability: 3,
      recallMultiplier: 1.3,
      failurePenalty: 0.7,
      minStability: 0.5,
      maxStability: 30,
      importanceWeight: 0.5,
      emotionalWeight: 0.7,   // High emotional sensitivity (salience)
      noveltyBoost: 2.5,      // Very high novelty boost
    },
    consolidation: {
      minEpisodes: 20,        // Many perceptions
      maxAge: 1,              // Fast consolidation
      retentionThreshold: 0.4,
      useSemanticClustering: true,
      clusterThreshold: 0.6,
      extractCausality: false,
      patternsPerCycle: 30,
      priorityStrategy: 'novelty',
    },
    retrieval: {
      channelWeights: { vector: 2.0, keyword: 0.3, graph: 0.5, temporal: 1.5 },
      rrfConstant: 40,
      defaultLimit: 50,
      expandRelated: false,
      maxGraphHops: 1,
      recencyBias: 0.9,       // Very strong recency
      contextWindowSize: 5,
    },
    capacity: {
      episodic: 10000,        // Many perceptions
      semantic: 5000,
      procedural: 200,
      workingMemory: 5,
      reallocationPriority: 4,
    },
    baseTags: ['perception', 'vision', 'audio', 'sensory'],
    priority: 'normal',
  },

  // ---------------------------------------------------------------------------
  // Consciousness - Integration and awareness
  // ---------------------------------------------------------------------------
  consciousness: {
    componentId: 'consciousness',
    description: 'Global workspace, phi calculation, integration',
    fsrs: {
      ...DEFAULT_FSRS,
      intervalModifier: 1.5,
    },
    retention: {
      baseStability: 21,
      recallMultiplier: 2.2,
      failurePenalty: 0.6,
      minStability: 3,
      maxStability: 180,
      importanceWeight: 0.7,
      emotionalWeight: 0.8,   // High emotional sensitivity
      noveltyBoost: 1.5,
    },
    consolidation: {
      minEpisodes: 5,
      maxAge: 7,
      retentionThreshold: 0.6,
      useSemanticClustering: true,
      clusterThreshold: 0.75,
      extractCausality: true,
      patternsPerCycle: 10,
      priorityStrategy: 'emotional',
    },
    retrieval: {
      channelWeights: { vector: 1.2, keyword: 0.6, graph: 1.3, temporal: 1.0 },
      rrfConstant: 60,
      defaultLimit: 20,
      expandRelated: true,
      maxGraphHops: 3,
      recencyBias: 0.4,
      contextWindowSize: 12,
    },
    capacity: {
      episodic: 3000,
      semantic: 10000,
      procedural: 500,
      workingMemory: 9,       // Maximum working memory
      reallocationPriority: 8,
    },
    baseTags: ['consciousness', 'awareness', 'integration', 'phi'],
    priority: 'high',
  },

  // ---------------------------------------------------------------------------
  // World Model - Predictive engine
  // ---------------------------------------------------------------------------
  'world-model': {
    componentId: 'world-model',
    description: 'Latent state prediction, digital twins, simulation',
    fsrs: {
      ...DEFAULT_FSRS,
      intervalModifier: 1.4,
    },
    retention: {
      baseStability: 30,
      recallMultiplier: 2.0,
      failurePenalty: 0.5,
      minStability: 7,
      maxStability: 365,
      importanceWeight: 0.8,
      emotionalWeight: 0.2,
      noveltyBoost: 1.2,
    },
    consolidation: {
      minEpisodes: 8,
      maxAge: 14,
      retentionThreshold: 0.65,
      useSemanticClustering: true,
      clusterThreshold: 0.75,
      extractCausality: true,
      patternsPerCycle: 12,
      priorityStrategy: 'balanced',
    },
    retrieval: {
      channelWeights: { vector: 1.0, keyword: 0.5, graph: 1.5, temporal: 1.2 },
      rrfConstant: 65,
      defaultLimit: 25,
      expandRelated: true,
      maxGraphHops: 3,
      recencyBias: 0.5,
      contextWindowSize: 10,
    },
    capacity: {
      episodic: 5000,
      semantic: 30000,        // Many world facts
      procedural: 1000,
      workingMemory: 9,
      reallocationPriority: 7,
    },
    baseTags: ['world-model', 'prediction', 'twin', 'simulation'],
    priority: 'high',
  },

  // ---------------------------------------------------------------------------
  // Governance - Permissions and safety
  // ---------------------------------------------------------------------------
  governance: {
    componentId: 'governance',
    description: 'Permissions, HITL, budget enforcement, safety',
    fsrs: {
      ...DEFAULT_FSRS,
      intervalModifier: 3.0,  // Very long intervals (rules are stable)
      maximumInterval: 1095,  // 3 years
    },
    retention: {
      baseStability: 90,      // 3 months
      recallMultiplier: 3.0,
      failurePenalty: 0.9,    // Harsh penalty (safety critical)
      minStability: 30,
      maxStability: 730,
      importanceWeight: 1.0,
      emotionalWeight: 0.1,
      noveltyBoost: 0.5,
    },
    consolidation: {
      minEpisodes: 2,
      maxAge: 60,
      retentionThreshold: 0.85,
      useSemanticClustering: false, // Exact matching for rules
      clusterThreshold: 0.95,
      extractCausality: false,
      patternsPerCycle: 3,
      priorityStrategy: 'importance',
    },
    retrieval: {
      channelWeights: { vector: 0.5, keyword: 2.0, graph: 0.8, temporal: 0.3 },
      rrfConstant: 100,
      defaultLimit: 10,
      expandRelated: false,
      maxGraphHops: 1,
      recencyBias: 0.0,       // No recency bias for rules
      contextWindowSize: 5,
    },
    capacity: {
      episodic: 500,
      semantic: 5000,
      procedural: 1000,
      workingMemory: 5,
      reallocationPriority: 10, // Highest priority
    },
    baseTags: ['governance', 'permission', 'safety', 'rule'],
    priority: 'critical',
  },

  // ---------------------------------------------------------------------------
  // Active Inference - Free energy minimization
  // ---------------------------------------------------------------------------
  'active-inference': {
    componentId: 'active-inference',
    description: 'Belief updates, policy selection, expected free energy',
    fsrs: DEFAULT_FSRS,
    retention: {
      baseStability: 14,
      recallMultiplier: 1.8,
      failurePenalty: 0.6,
      minStability: 3,
      maxStability: 90,
      importanceWeight: 0.7,
      emotionalWeight: 0.3,
      noveltyBoost: 1.5,
    },
    consolidation: {
      minEpisodes: 10,
      maxAge: 7,
      retentionThreshold: 0.55,
      useSemanticClustering: true,
      clusterThreshold: 0.7,
      extractCausality: true,
      patternsPerCycle: 15,
      priorityStrategy: 'balanced',
    },
    retrieval: {
      channelWeights: { vector: 1.2, keyword: 0.7, graph: 1.0, temporal: 0.8 },
      rrfConstant: 55,
      defaultLimit: 20,
      expandRelated: true,
      maxGraphHops: 2,
      recencyBias: 0.5,
      contextWindowSize: 8,
    },
    capacity: {
      episodic: 4000,
      semantic: 10000,
      procedural: 1500,
      workingMemory: 7,
      reallocationPriority: 6,
    },
    baseTags: ['active-inference', 'belief', 'policy', 'free-energy'],
    priority: 'high',
  },

  // ---------------------------------------------------------------------------
  // Neuromodulation - Dopamine, serotonin, etc.
  // ---------------------------------------------------------------------------
  neuromodulation: {
    componentId: 'neuromodulation',
    description: 'Neuromodulatory states, reward signals, stress',
    fsrs: {
      ...DEFAULT_FSRS,
      intervalModifier: 0.7,
    },
    retention: {
      baseStability: 7,
      recallMultiplier: 1.5,
      failurePenalty: 0.7,
      minStability: 1,
      maxStability: 60,
      importanceWeight: 0.5,
      emotionalWeight: 1.0,   // Maximum emotional weight
      noveltyBoost: 1.8,
    },
    consolidation: {
      minEpisodes: 15,
      maxAge: 3,
      retentionThreshold: 0.5,
      useSemanticClustering: true,
      clusterThreshold: 0.6,
      extractCausality: true,
      patternsPerCycle: 20,
      priorityStrategy: 'emotional',
    },
    retrieval: {
      channelWeights: { vector: 1.0, keyword: 0.5, graph: 0.8, temporal: 1.5 },
      rrfConstant: 45,
      defaultLimit: 30,
      expandRelated: false,
      maxGraphHops: 1,
      recencyBias: 0.8,
      contextWindowSize: 5,
    },
    capacity: {
      episodic: 5000,
      semantic: 3000,
      procedural: 300,
      workingMemory: 5,
      reallocationPriority: 5,
    },
    baseTags: ['neuromodulation', 'dopamine', 'serotonin', 'reward'],
    priority: 'normal',
  },

  // ---------------------------------------------------------------------------
  // Allostasis - Homeostatic regulation
  // ---------------------------------------------------------------------------
  allostasis: {
    componentId: 'allostasis',
    description: 'Energy management, load balancing, stress response',
    fsrs: {
      ...DEFAULT_FSRS,
      intervalModifier: 0.8,
    },
    retention: {
      baseStability: 5,
      recallMultiplier: 1.4,
      failurePenalty: 0.65,
      minStability: 1,
      maxStability: 45,
      importanceWeight: 0.6,
      emotionalWeight: 0.8,
      noveltyBoost: 1.2,
    },
    consolidation: {
      minEpisodes: 20,
      maxAge: 2,
      retentionThreshold: 0.45,
      useSemanticClustering: false,
      clusterThreshold: 0.65,
      extractCausality: false,
      patternsPerCycle: 25,
      priorityStrategy: 'recency',
    },
    retrieval: {
      channelWeights: { vector: 0.6, keyword: 0.8, graph: 0.5, temporal: 2.0 },
      rrfConstant: 40,
      defaultLimit: 40,
      expandRelated: false,
      maxGraphHops: 1,
      recencyBias: 0.9,
      contextWindowSize: 5,
    },
    capacity: {
      episodic: 6000,
      semantic: 2000,
      procedural: 200,
      workingMemory: 5,
      reallocationPriority: 4,
    },
    baseTags: ['allostasis', 'energy', 'load', 'homeostasis'],
    priority: 'normal',
  },

  // ---------------------------------------------------------------------------
  // Daemon - Background processes
  // ---------------------------------------------------------------------------
  daemon: {
    componentId: 'daemon',
    description: 'Background daemon, scheduled tasks, maintenance',
    fsrs: DEFAULT_FSRS,
    retention: {
      baseStability: 14,
      recallMultiplier: 1.6,
      failurePenalty: 0.6,
      minStability: 3,
      maxStability: 90,
      importanceWeight: 0.5,
      emotionalWeight: 0.1,
      noveltyBoost: 1.0,
    },
    consolidation: {
      minEpisodes: 10,
      maxAge: 7,
      retentionThreshold: 0.55,
      useSemanticClustering: true,
      clusterThreshold: 0.7,
      extractCausality: false,
      patternsPerCycle: 12,
      priorityStrategy: 'recency',
    },
    retrieval: {
      channelWeights: { vector: 0.8, keyword: 1.0, graph: 0.6, temporal: 1.2 },
      rrfConstant: 55,
      defaultLimit: 15,
      expandRelated: false,
      maxGraphHops: 1,
      recencyBias: 0.6,
      contextWindowSize: 7,
    },
    capacity: {
      episodic: 3000,
      semantic: 5000,
      procedural: 1500,
      workingMemory: 5,
      reallocationPriority: 3,
    },
    baseTags: ['daemon', 'background', 'scheduled', 'maintenance'],
    priority: 'low',
  },

  // ---------------------------------------------------------------------------
  // Grounding - Epistemic verification
  // ---------------------------------------------------------------------------
  grounding: {
    componentId: 'grounding',
    description: 'Claim verification, fact-checking, epistemic hygiene',
    fsrs: {
      ...DEFAULT_FSRS,
      intervalModifier: 1.6,
    },
    retention: {
      baseStability: 30,
      recallMultiplier: 2.2,
      failurePenalty: 0.5,
      minStability: 7,
      maxStability: 180,
      importanceWeight: 0.9,
      emotionalWeight: 0.1,
      noveltyBoost: 0.8,
    },
    consolidation: {
      minEpisodes: 4,
      maxAge: 14,
      retentionThreshold: 0.7,
      useSemanticClustering: true,
      clusterThreshold: 0.85,
      extractCausality: false,
      patternsPerCycle: 8,
      priorityStrategy: 'importance',
    },
    retrieval: {
      channelWeights: { vector: 1.0, keyword: 1.5, graph: 1.0, temporal: 0.5 },
      rrfConstant: 70,
      defaultLimit: 20,
      expandRelated: true,
      maxGraphHops: 2,
      recencyBias: 0.2,
      contextWindowSize: 8,
    },
    capacity: {
      episodic: 2000,
      semantic: 15000,
      procedural: 500,
      workingMemory: 7,
      reallocationPriority: 6,
    },
    baseTags: ['grounding', 'verification', 'fact-check', 'epistemic'],
    priority: 'high',
  },

  // ---------------------------------------------------------------------------
  // Thinking - Deep reasoning (ToT, GoT)
  // ---------------------------------------------------------------------------
  thinking: {
    componentId: 'thinking',
    description: 'Tree of thought, graph of thought, extended reasoning',
    fsrs: {
      ...DEFAULT_FSRS,
      intervalModifier: 1.3,
    },
    retention: {
      baseStability: 21,
      recallMultiplier: 2.0,
      failurePenalty: 0.55,
      minStability: 5,
      maxStability: 120,
      importanceWeight: 0.8,
      emotionalWeight: 0.2,
      noveltyBoost: 1.3,
    },
    consolidation: {
      minEpisodes: 5,
      maxAge: 10,
      retentionThreshold: 0.6,
      useSemanticClustering: true,
      clusterThreshold: 0.75,
      extractCausality: true,
      patternsPerCycle: 10,
      priorityStrategy: 'balanced',
    },
    retrieval: {
      channelWeights: { vector: 1.3, keyword: 0.7, graph: 1.2, temporal: 0.6 },
      rrfConstant: 60,
      defaultLimit: 20,
      expandRelated: true,
      maxGraphHops: 3,
      recencyBias: 0.3,
      contextWindowSize: 12,
    },
    capacity: {
      episodic: 3000,
      semantic: 15000,
      procedural: 1000,
      workingMemory: 9,
      reallocationPriority: 7,
    },
    baseTags: ['thinking', 'reasoning', 'tot', 'got'],
    priority: 'high',
  },

  // ---------------------------------------------------------------------------
  // Exotic - Thermodynamic, HDC, reservoir computing
  // ---------------------------------------------------------------------------
  exotic: {
    componentId: 'exotic',
    description: 'Exotic computing paradigms',
    fsrs: {
      ...DEFAULT_FSRS,
      intervalModifier: 2.0,
    },
    retention: {
      baseStability: 45,
      recallMultiplier: 2.5,
      failurePenalty: 0.7,
      minStability: 14,
      maxStability: 365,
      importanceWeight: 0.7,
      emotionalWeight: 0.1,
      noveltyBoost: 1.5,
    },
    consolidation: {
      minEpisodes: 3,
      maxAge: 30,
      retentionThreshold: 0.75,
      useSemanticClustering: true,
      clusterThreshold: 0.8,
      extractCausality: true,
      patternsPerCycle: 5,
      priorityStrategy: 'importance',
    },
    retrieval: {
      channelWeights: { vector: 1.5, keyword: 0.5, graph: 1.0, temporal: 0.4 },
      rrfConstant: 75,
      defaultLimit: 15,
      expandRelated: true,
      maxGraphHops: 2,
      recencyBias: 0.1,
      contextWindowSize: 8,
    },
    capacity: {
      episodic: 1000,
      semantic: 8000,
      procedural: 800,
      workingMemory: 7,
      reallocationPriority: 4,
    },
    baseTags: ['exotic', 'thermodynamic', 'hyperdimensional', 'reservoir'],
    priority: 'normal',
  },

  // ---------------------------------------------------------------------------
  // Default - Fallback profile
  // ---------------------------------------------------------------------------
  default: {
    componentId: 'default',
    description: 'Default memory profile for unspecified components',
    fsrs: DEFAULT_FSRS,
    retention: {
      baseStability: 14,
      recallMultiplier: 2.0,
      failurePenalty: 0.5,
      minStability: 1,
      maxStability: 180,
      importanceWeight: 0.7,
      emotionalWeight: 0.3,
      noveltyBoost: 1.0,
    },
    consolidation: {
      minEpisodes: 5,
      maxAge: 7,
      retentionThreshold: 0.6,
      useSemanticClustering: true,
      clusterThreshold: 0.7,
      extractCausality: false,
      patternsPerCycle: 10,
      priorityStrategy: 'balanced',
    },
    retrieval: {
      channelWeights: { vector: 1.0, keyword: 1.0, graph: 1.0, temporal: 1.0 },
      rrfConstant: 60,
      defaultLimit: 20,
      expandRelated: true,
      maxGraphHops: 2,
      recencyBias: 0.4,
      contextWindowSize: 7,
    },
    capacity: {
      episodic: 3000,
      semantic: 10000,
      procedural: 1000,
      workingMemory: 7,
      reallocationPriority: 5,
    },
    baseTags: ['default'],
    priority: 'normal',
  },
};

// =============================================================================
// Profile Access Functions
// =============================================================================

/**
 * Get memory profile for a specific component
 */
export function getComponentProfile(componentId: ComponentId): ComponentMemoryProfile {
  return COMPONENT_PROFILES[componentId] || COMPONENT_PROFILES.default;
}

/**
 * Get all registered components
 */
export function getRegisteredComponents(): ComponentId[] {
  return Object.keys(COMPONENT_PROFILES) as ComponentId[];
}

/**
 * Calculate total capacity across all components
 */
export function getTotalCapacity(): {
  episodic: number;
  semantic: number;
  procedural: number;
  workingMemory: number;
} {
  const totals = { episodic: 0, semantic: 0, procedural: 0, workingMemory: 0 };

  for (const profile of Object.values(COMPONENT_PROFILES)) {
    totals.episodic += profile.capacity.episodic;
    totals.semantic += profile.capacity.semantic;
    totals.procedural += profile.capacity.procedural;
    totals.workingMemory += profile.capacity.workingMemory;
  }

  return totals;
}

/**
 * Get components sorted by reallocation priority
 */
export function getComponentsByPriority(): ComponentMemoryProfile[] {
  return Object.values(COMPONENT_PROFILES).sort(
    (a, b) => b.capacity.reallocationPriority - a.capacity.reallocationPriority
  );
}

/**
 * Create custom profile by merging with default
 */
export function createCustomProfile(
  componentId: string,
  overrides: Partial<Omit<ComponentMemoryProfile, 'componentId'>>
): ComponentMemoryProfile {
  const base = COMPONENT_PROFILES.default;
  return {
    ...base,
    ...overrides,
    componentId: componentId as ComponentId,
    fsrs: { ...base.fsrs, ...overrides.fsrs },
    retention: { ...base.retention, ...overrides.retention },
    consolidation: { ...base.consolidation, ...overrides.consolidation },
    retrieval: { ...base.retrieval, ...overrides.retrieval },
    capacity: { ...base.capacity, ...overrides.capacity },
    baseTags: overrides.baseTags || [componentId],
  };
}
