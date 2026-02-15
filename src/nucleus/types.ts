/**
 * Nucleus v34 — Type Definitions
 *
 * The Nucleus is Genesis's gravitational center: it classifies inputs,
 * selects which modules to activate, learns from outcomes, and self-improves.
 */

export type InputClassification =
  | 'simple_chat' | 'analysis' | 'creative' | 'reasoning'
  | 'market' | 'code' | 'life_assist' | 'system' | 'unknown';

export type ModulePhase = 'gate' | 'pre' | 'context' | 'process' | 'audit' | 'post' | 'track';

export const PHASE_ORDER: ModulePhase[] = ['gate', 'pre', 'context', 'process', 'audit', 'post', 'track'];

export interface ModuleDescriptor {
  id: string;
  name: string;
  phase: ModulePhase;
  costEstimate: number;
  avgLatencyMs: number;
  domains: InputClassification[];
  dependencies: string[];
  alwaysActive: boolean;
  activationWeights: Record<InputClassification, number>;
  execute: ((input: string, ctx: NucleusContext) => Promise<void>) | null;
}

export interface NucleusContext {
  input: string;
  classification: InputClassification;
  processContext: Record<string, unknown>;
  response: string;
  confidence: { value: number; calibrationError: number } | null;
  audit: { coherence: number; groundedness: number } | null;
  activatedModules: string[];
  timings: Record<string, number>;
  startTime: number;
  fekState: unknown;
  meta: Record<string, unknown>;
}

export interface ExecutionPlan {
  classification: InputClassification;
  modules: string[];
  estimatedCost: number;
  estimatedLatencyMs: number;
  rationale: string;
}

export interface ProcessingOutcome {
  classification: InputClassification;
  modulesUsed: string[];
  latencyMs: number;
  confidence: number;
  success: boolean;
  cost: number;
  timestamp: number;
}

export interface PlasticityStats {
  classification: InputClassification;
  sampleCount: number;
  avgConfidence: number;
  avgLatencyMs: number;
}

export interface ExplorationResult {
  type: 'code_study' | 'module_experiment' | 'capability_gap' | 'improvement_proposal';
  description: string;
  findings: string[];
  proposedChanges?: string[];
  timestamp: number;
}
