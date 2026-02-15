/**
 * Antifragile System Types
 * Three mechanisms: Error Pipeline, Predictive Avoidance, Chaos Engineering
 */

export interface AntifragileConfig {
  /** Minimum severity to capture (0-1) */
  captureThreshold: number;
  /** Similarity threshold for pattern matching */
  similarityThreshold: number;
  /** Max failure patterns to retain per domain */
  maxPatternsPerDomain: number;
  /** Chaos engineering config */
  chaos: ChaosConfig;
}

export interface ChaosConfig {
  disableCount: { min: number; max: number };
  experimentDurationMs: number;
  cooldownMs: number;
  maxExperimentsPerSession: number;
  protectedModules: string[];
  testableModules: string[];
}

export interface FailureRecord {
  id: string;
  domain: string;
  errorType: string;
  message: string;
  severity: number;
  timestamp: string;
  context: Record<string, unknown>;
  patternHash: string;
  classification?: FailureClassification;
}

export interface FailureClassification {
  type: 'transient' | 'systematic' | 'novel' | 'recurring';
  recurrence: number;
  rootCause?: string;
}

export interface FailurePattern {
  id: string;
  domain: string;
  patternHash: string;
  description: string;
  occurrences: number;
  avgSeverity: number;
  firstSeen: string;
  lastSeen: string;
  evasionStrategy?: string;
}

export interface FailureAttractor {
  id: string;
  domain: string;
  description: string;
  sampleCount: number;
  avgSeverity: number;
  radius: number;
  lastUpdated: string;
  evasion: {
    actionModification: string;
    confidenceMultiplier: number;
    alternatives: string[];
  };
}

export interface ActionCheckResult {
  safe: boolean;
  riskScore: number;
  nearestAttractor?: {
    id: string;
    distance: number;
    description: string;
  };
  modifications?: {
    actionModification: string;
    confidenceMultiplier: number;
  };
}

export interface ChaosExperiment {
  id: string;
  timestamp: string;
  disabledModules: string[];
  durationMs: number;
  degradationScore: number;
  invariantsBroken: boolean;
  brokenInvariants: string[];
  recoveryTimeMs: number;
  capabilityMeasurements: CapabilityMeasurement[];
}

export interface CapabilityMeasurement {
  capability: string;
  baselineScore: number;
  degradedScore: number;
  retentionRatio: number;
  affectedBy: string[];
}

export interface ModuleCriticality {
  module: string;
  criticality: number;
  avgDegradation: number;
  capabilitiesAffected: number;
  breaksInvariants: boolean;
  protectedInvariants: string[];
  experimentCount: number;
}

export interface ResilienceMap {
  lastUpdated: string;
  totalExperiments: number;
  moduleCriticality: ModuleCriticality[];
  redundantModules: string[];
  antifragilityIndex: number;
}

export const DEFAULT_ANTIFRAGILE_CONFIG: AntifragileConfig = {
  captureThreshold: 0.2,
  similarityThreshold: 0.7,
  maxPatternsPerDomain: 100,
  chaos: {
    disableCount: { min: 1, max: 3 },
    experimentDurationMs: 5000,
    cooldownMs: 2000,
    maxExperimentsPerSession: 10,
    protectedModules: ['identity', 'constitution', 'event-bus'],
    testableModules: [
      'nociception', 'neuromodulation', 'world-model', 'self-reflection',
      'healing', 'memory-consolidation', 'attention-controller', 'goal-system',
      'semiotics', 'morphogenetic', 'strange-loop', 'swarm', 'embodiment',
      'market-strategist', 'content', 'revenue',
    ],
  },
};
