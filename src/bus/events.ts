/**
 * Genesis Event Bus - Type Definitions
 *
 * Implements Layer 5 (Synthesis) of the architecture:
 * A Global Workspace for inter-module broadcast following FEP principles.
 *
 * Scientific grounding:
 * - Prediction-error-only upward signals (Rao & Ballard, 1999)
 * - Top-down prediction broadcast (Baars, 1988 - GWT)
 * - Precision-weighted messaging (Friston, 2010)
 */

import type { KernelMode } from '../kernel/free-energy-kernel.js';

// ============================================================================
// Base Event Envelope
// ============================================================================

/**
 * All events carry a common envelope with FEP-native precision weighting.
 */
export interface BusEvent {
  /** Monotonic sequence number for ordering */
  seq: number;
  /** ISO timestamp */
  timestamp: string;
  /** Source module ID */
  source: string;
  /** Precision-weighted magnitude (FEP: how reliable is this signal?) */
  precision: number;
  /** Correlation ID for tracing causal chains */
  correlationId?: string;
}

// ============================================================================
// Kernel (FEK) Events
// ============================================================================

export interface FEKCycleEvent extends BusEvent {
  cycle: number;
  mode: KernelMode;
  totalFE: number;
  levels: Record<string, number>;
  emotional: { valence: number; arousal: number };
}

export interface PredictionErrorEvent extends BusEvent {
  errorSource: string;
  errorTarget: string;
  magnitude: number;
  content: string;
}

export interface ModeChangeEvent extends BusEvent {
  newMode: KernelMode;
  previousMode: KernelMode;
}

export interface TaskEvent extends BusEvent {
  taskId: string;
  taskType: string;
  priority: number;
}

export interface TaskFailedEvent extends TaskEvent {
  error: string;
  retryable: boolean;
}

export interface PanicEvent extends BusEvent {
  reason: string;
  severity: 'warning' | 'critical' | 'fatal';
  recoverable: boolean;
}

// ============================================================================
// Consciousness (GWT/IIT/AST) Events
// ============================================================================

export interface IgnitionEvent extends BusEvent {
  contentId: string;
  sourceModule: string;
  contentType: string;
  salience: number;
  data: unknown;
}

export interface PhiUpdateEvent extends BusEvent {
  phi: number;
  previousPhi: number;
  delta: number;
}

export interface InvariantViolationEvent extends BusEvent {
  invariant: string;
  expected: unknown;
  actual: unknown;
  severity: number;
}

export interface AttentionShiftEvent extends BusEvent {
  from: string | null;
  to: string;
  reason: string;
}

// ============================================================================
// Active Inference Events
// ============================================================================

export interface BeliefsUpdatedEvent extends BusEvent {
  beliefType: string;
  entropy: number;
  confidence: number;
}

export interface PolicyInferredEvent extends BusEvent {
  policyId: string;
  expectedFreeEnergy: number;
  alternatives: number;
}

export interface ActionSelectedEvent extends BusEvent {
  action: string;
  confidence: number;
  expectedOutcome: string;
}

export interface SurpriseEvent extends BusEvent {
  magnitude: number;
  observation: string;
  expectedState: string;
}

// ============================================================================
// Neuromodulation Events
// ============================================================================

export interface NeuromodLevels {
  dopamine: number;
  serotonin: number;
  norepinephrine: number;
  acetylcholine: number;
}

export interface ModulationEffect {
  explorationRate: number;
  learningRate: number;
  precisionGain: number;
  discountFactor: number;
}

export interface NeuromodLevelsEvent extends BusEvent {
  levels: NeuromodLevels;
  effect: ModulationEffect;
}

export interface NeuromodSignalEvent extends BusEvent {
  signalType: 'reward' | 'punishment' | 'novelty' | 'threat' | 'calm';
  magnitude: number;
  cause: string;
}

// ============================================================================
// Nociception (Pain) Events
// ============================================================================

export interface PainStimulusEvent extends BusEvent {
  location: string;
  intensity: number;
  type: 'acute' | 'chronic' | 'phantom';
}

export interface PainStateEvent extends BusEvent {
  totalPain: number;
  threshold: number;
  adaptation: number;
}

// ============================================================================
// Allostasis Events
// ============================================================================

export interface AllostasisRegulationEvent extends BusEvent {
  variable: string;
  currentValue: number;
  setpoint: number;
  action: string;
  urgency: number;
}

export interface SetpointAdaptedEvent extends BusEvent {
  variable: string;
  oldSetpoint: number;
  newSetpoint: number;
  reason: string;
}

// ============================================================================
// Economic Events
// ============================================================================

export interface EconomicCostEvent extends BusEvent {
  module: string;
  amount: number;
  category: string;
}

export interface EconomicRevenueEvent extends BusEvent {
  amount: number;
  revenueSource: string;
}

export interface NESSDeviationEvent extends BusEvent {
  currentNESS: number;
  targetNESS: number;
  deviation: number;
  action: string;
}

export interface BudgetEvent extends BusEvent {
  oldBudget: Record<string, number>;
  newBudget: Record<string, number>;
  reason: string;
}

// ============================================================================
// Brain/Cognitive Events
// ============================================================================

export interface BrainCycleEvent extends BusEvent {
  cycleId: string;
  phase: 'started' | 'completed';
  durationMs?: number;
}

export interface ToolExecutedEvent extends BusEvent {
  toolName: string;
  success: boolean;
  durationMs: number;
  result?: unknown;
}

export interface LLMRequestEvent extends BusEvent {
  provider: string;
  model: string;
  promptTokens: number;
}

export interface LLMResponseEvent extends BusEvent {
  provider: string;
  model: string;
  completionTokens: number;
  latencyMs: number;
  cached: boolean;
}

export interface HealingEvent extends BusEvent {
  phase: 'started' | 'completed';
  target: string;
  success?: boolean;
}

// ============================================================================
// Memory Events
// ============================================================================

export interface MemoryRecalledEvent extends BusEvent {
  queryType: string;
  resultsCount: number;
  relevance: number;
}

export interface MemoryConsolidatedEvent extends BusEvent {
  memoryType: 'episodic' | 'semantic' | 'procedural';
  entriesConsolidated: number;
}

export interface MemoryDreamEvent extends BusEvent {
  duration: number;
  consolidations: number;
  creativityIndex: number;
}

// ============================================================================
// World Model Events
// ============================================================================

export interface ConsistencyViolationEvent extends BusEvent {
  claim: string;
  conflictsWith: string;
  resolution: string;
}

export interface WorldPredictionEvent extends BusEvent {
  domain: string;
  prediction: string;
  confidence: number;
}

// ============================================================================
// Lifecycle Events
// ============================================================================

export interface SystemLifecycleEvent extends BusEvent {
  phase: 'booting' | 'booted' | 'shutting_down' | 'shutdown';
  level?: number;
  durationMs?: number;
}

export interface HookExecutedEvent extends BusEvent {
  hookName: string;
  trigger: string;
  success: boolean;
  durationMs: number;
}

// ============================================================================
// Self-Modification Events
// ============================================================================

export interface SelfImprovementEvent extends BusEvent {
  improvementType: string;
  phase: 'proposed' | 'approved' | 'applied' | 'rejected';
  description: string;
  expectedBenefit: number;
}

// ============================================================================
// Legacy Event Types (for genesis.ts compatibility)
// ============================================================================

export interface LegacyPredictionErrorEvent extends BusEvent {
  source: string;
  target: string;
  magnitude: number;
}

export interface LegacyModeChangeEvent extends BusEvent {
  mode: string;
}

export interface LegacyNeuromodUpdateEvent extends BusEvent {
  dopamine: number;
  serotonin: number;
  norepinephrine: number;
  cortisol: number;
}

export interface LegacyPainSignalEvent extends BusEvent {
  level: number;
  aggregate: number;
  chronic: boolean;
}

export interface LegacyA2ATaskEvent extends BusEvent {
  taskId: string;
  from: string;
  type: string;
}

export interface LegacyRevenueEvent extends BusEvent {
  amount: number;
  source: string;
  txHash?: string;
}

export interface LegacyCompIntelEvent extends BusEvent {
  competitor: string;
  changeType: string;
  significance: number;
}

export interface LegacyAutonomousTaskEvent extends BusEvent {
  taskId: string;
  result: unknown;
  duration: number;
}

// ============================================================================
// Genesis Event Map - All Topics
// ============================================================================

/**
 * Complete event map for the Genesis system.
 * Convention: domain.verb (dot notation, past tense for notifications)
 * Legacy aliases use colon syntax for backwards compatibility.
 */
export interface GenesisEventMap {
  // --- Kernel (FEK) Events ---
  'kernel.cycle.completed': FEKCycleEvent;
  'kernel.prediction.error': PredictionErrorEvent;
  'kernel.mode.changed': ModeChangeEvent;
  'kernel.task.submitted': TaskEvent;
  'kernel.task.completed': TaskEvent;
  'kernel.task.failed': TaskFailedEvent;
  'kernel.panic': PanicEvent;

  // --- Consciousness (GWT/IIT/AST) Events ---
  'consciousness.workspace.ignited': IgnitionEvent;
  'consciousness.phi.updated': PhiUpdateEvent;
  'consciousness.phi.violated': InvariantViolationEvent;
  'consciousness.attention.shifted': AttentionShiftEvent;

  // --- Active Inference Events ---
  'inference.beliefs.updated': BeliefsUpdatedEvent;
  'inference.policy.inferred': PolicyInferredEvent;
  'inference.action.selected': ActionSelectedEvent;
  'inference.surprise.high': SurpriseEvent;

  // --- Neuromodulation Events ---
  'neuromod.levels.changed': NeuromodLevelsEvent;
  'neuromod.reward': NeuromodSignalEvent;
  'neuromod.punishment': NeuromodSignalEvent;
  'neuromod.novelty': NeuromodSignalEvent;
  'neuromod.threat': NeuromodSignalEvent;
  'neuromod.calm': NeuromodSignalEvent;

  // --- Nociception Events ---
  'pain.stimulus': PainStimulusEvent;
  'pain.state.changed': PainStateEvent;

  // --- Allostasis Events ---
  'allostasis.regulation': AllostasisRegulationEvent;
  'allostasis.setpoint.adapted': SetpointAdaptedEvent;

  // --- Economic Events ---
  'economy.cost.recorded': EconomicCostEvent;
  'economy.revenue.recorded': EconomicRevenueEvent;
  'economy.ness.deviation': NESSDeviationEvent;
  'economy.budget.reallocated': BudgetEvent;

  // --- Brain/Cognitive Events ---
  'brain.cycle.started': BrainCycleEvent;
  'brain.cycle.completed': BrainCycleEvent;
  'brain.tool.executed': ToolExecutedEvent;
  'brain.llm.requested': LLMRequestEvent;
  'brain.llm.responded': LLMResponseEvent;
  'brain.healing.started': HealingEvent;
  'brain.healing.completed': HealingEvent;

  // --- Memory Events ---
  'memory.recalled': MemoryRecalledEvent;
  'memory.consolidated': MemoryConsolidatedEvent;
  'memory.dreamed': MemoryDreamEvent;

  // --- World Model Events ---
  'worldmodel.consistency.violation': ConsistencyViolationEvent;
  'worldmodel.prediction.updated': WorldPredictionEvent;

  // --- Lifecycle Events ---
  'system.booting': SystemLifecycleEvent;
  'system.booted': SystemLifecycleEvent;
  'system.shutdown': SystemLifecycleEvent;
  'system.hook.executed': HookExecutedEvent;

  // --- Self-Modification Events ---
  'self.improvement.proposed': SelfImprovementEvent;
  'self.improvement.applied': SelfImprovementEvent;

  // --- Legacy Aliases (colon syntax for genesis.ts compatibility) ---
  'kernel:prediction_error': LegacyPredictionErrorEvent;
  'kernel:mode_change': LegacyModeChangeEvent;
  'neuromodulation:update': LegacyNeuromodUpdateEvent;
  'pain:signal': LegacyPainSignalEvent;
  'a2a:task_received': LegacyA2ATaskEvent;
  'economic:revenue': LegacyRevenueEvent;
  'compintel:change': LegacyCompIntelEvent;
  'autonomous:task_completed': LegacyAutonomousTaskEvent;
}

/** All valid topic names */
export type GenesisEventTopic = keyof GenesisEventMap;

/** Get event type for a topic */
export type EventForTopic<T extends GenesisEventTopic> = GenesisEventMap[T];
