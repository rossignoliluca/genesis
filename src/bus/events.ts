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
// v17.0: Active Inference Loop Events
// ============================================================================

export interface ActiveInferenceCycleEvent extends BusEvent {
  cycle: number;
  action?: string;
  beliefs?: Record<string, string>;
}

export interface ActiveInferenceBeliefEvent extends BusEvent {
  cycle: number;
  beliefs: Record<string, string>;
}

export interface ActiveInferenceActionEvent extends BusEvent {
  cycle: number;
  action: string;
  beliefs: Record<string, string>;
}

export interface ActiveInferenceSurpriseEvent extends BusEvent {
  cycle: number;
  surprise: number;
  threshold: number;
  action: string;
  outcome: string;
}

export interface ActiveInferenceStoppedEvent extends BusEvent {
  reason: string;
  cycles: number;
  avgSurprise: number;
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

// v18.1: Allostasis action events (real regulatory actions)
export interface AllostasisThrottleEvent extends BusEvent {
  magnitude: number;
}

export interface AllostasisDeferEvent extends BusEvent {
  variable: string;
}

export interface AllostasisHibernateEvent extends BusEvent {
  duration: number;
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
// Daemon Events
// ============================================================================

export interface DaemonStateEvent extends BusEvent {
  state: 'stopped' | 'starting' | 'running' | 'dreaming' | 'maintaining' | 'stopping' | 'error';
  previousState?: string;
}

export interface DaemonTaskEvent extends BusEvent {
  taskId?: string;
  taskName?: string;
  status: 'scheduled' | 'started' | 'completed' | 'failed' | 'cancelled';
  priority?: 'critical' | 'high' | 'normal' | 'low' | 'idle';
  durationMs?: number;
  error?: string;
}

export interface DaemonDreamEvent extends BusEvent {
  phase: 'started' | 'completed' | 'interrupted' | 'phase_changed';
  dreamPhase?: string;
  consolidations?: number;
  creativeInsights?: number;
  durationMs?: number;
  reason?: string;
}

export interface DaemonMaintenanceEvent extends BusEvent {
  status: 'started' | 'completed' | 'issue_detected';
  issuesFound?: number;
  issuesFixed?: number;
  memoryReclaimed?: number;
  report?: unknown;
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
// Finance Module Events
// ============================================================================

export interface MarketDataUpdateEvent extends BusEvent {
  symbol: string;
  price: number;
  volatility: number;
  volume: number;
}

export interface TradingSignalEvent extends BusEvent {
  symbol: string;
  direction: 'long' | 'short' | 'neutral';
  strength: number;
  uncertainty: number;
  action: 'buy' | 'sell' | 'hold';
}

export interface PositionOpenedEvent extends BusEvent {
  symbol: string;
  size: number;
  entryPrice: number;
  direction: 'long' | 'short';
}

export interface PositionClosedEvent extends BusEvent {
  symbol: string;
  size: number;
  entryPrice: number;
  exitPrice: number;
  realizedPnL: number;
}

export interface DrawdownAlertEvent extends BusEvent {
  symbol: string;
  drawdown: number;
  painLevel: number;
  threshold: number;
}

export interface RegimeChangeEvent extends BusEvent {
  symbol: string;
  previousRegime: string;
  newRegime: string;
  confidence: number;
}

// v18.0: Additional Finance Events
export interface FinanceCostRecordedEvent extends BusEvent {
  amount: number;
  category: string;
  provider?: string;
  model?: string;
}

export interface TradingHaltedEvent extends BusEvent {
  symbol: string;
  reason: string;
  regime: string;
}

export interface PortfolioRebalancedEvent extends BusEvent {
  symbol: string;
  adjustments: number;
  newAllocation: number;
}

export interface RiskLimitExceededEvent extends BusEvent {
  symbol: string;
  riskLevel: number;
  drawdown: number;
  positionSizes: number;
}

export interface OpportunityDetectedEvent extends BusEvent {
  symbol: string;
  type: string;
  expectedReturn: number;
  confidence: number;
}

export interface RiskAdjustmentEvent extends BusEvent {
  symbol: string;
  adjustment: string;
  reason: string;
}

export interface ExplorationIncreasedEvent extends BusEvent {
  symbol: string;
  reason: string;
}

export interface CautiousModeEvent extends BusEvent {
  symbol: string;
  duration: number;
}

// ============================================================================
// Polymarket Events
// ============================================================================

export interface PolymarketDiscoveredEvent extends BusEvent {
  marketId: string;
  question: string;
  relevance: number;
  category: string;
  outcomes: string[];
}

export interface PolymarketBeliefEvent extends BusEvent {
  marketId: string;
  outcome: string;
  subjectiveP: number;
  marketP: number;
  surprise: number;
  confidence: number;
}

export interface PolymarketTradeEvent extends BusEvent {
  marketId: string;
  outcome: string;
  side: 'buy' | 'sell';
  size: number;
  price: number;
  riskTolerance: number;
}

export interface PolymarketPortfolioEvent extends BusEvent {
  totalValue: number;
  totalPnL: number;
  winRate: number;
  activePositions: number;
}

// ============================================================================
// Revenue Module Events
// ============================================================================

export interface RevenueOpportunityEvent extends BusEvent {
  opportunityId: string;
  stream: string;
  estimatedRevenue: number;
  estimatedCost: number;
  roi: number;
  risk: number;
}

export interface RevenueTaskEvent extends BusEvent {
  taskId: string;
  stream: string;
  success: boolean;
  actualRevenue: number;
  actualCost: number;
  duration: number;
}

export interface RevenueStreamEvent extends BusEvent {
  stream: string;
  status: 'active' | 'paused' | 'error';
  totalEarned: number;
  successRate: number;
}

// ============================================================================
// x402 Payment Events
// ============================================================================

export interface X402ChallengeEvent extends BusEvent {
  challengeId: string;
  resourceUri: string;
  amount: number;
  currency: string;
  expiresAt: string;
}

export interface X402PaymentEvent extends BusEvent {
  challengeId: string;
  txHash: string;
  amount: number;
  currency: string;
  success: boolean;
}

export interface X402ReceiptEvent extends BusEvent {
  receiptId: string;
  challengeId: string;
  amount: number;
  accessToken: string;
  expiresAt: string;
}

// ============================================================================
// Content Events (v18.1.0)
// ============================================================================

export type ContentPlatform = 'twitter' | 'linkedin' | 'mastodon' | 'bluesky' | 'mirror' | 'paragraph' | 'substack' | 'hackmd' | 'devto';
export type ContentTypeEnum = 'article' | 'thread' | 'post' | 'newsletter' | 'tutorial' | 'announcement';

export interface ContentCreatedEvent extends BusEvent {
  contentId: string;
  type: ContentTypeEnum;
  topic: string;
  platforms: ContentPlatform[];
  keywords: string[];
}

export interface ContentPublishedEvent extends BusEvent {
  contentId: string;
  platform: ContentPlatform;
  postId: string;
  url?: string;
  status: 'success' | 'failed';
  error?: string;
}

export interface ContentScheduledEvent extends BusEvent {
  contentId: string;
  platforms: ContentPlatform[];
  scheduledFor: Date;
}

export interface ContentEngagementEvent extends BusEvent {
  contentId: string;
  platform: ContentPlatform;
  impressions: number;
  engagements: number;
  engagementRate: number;
}

export interface ContentRevenueEvent extends BusEvent {
  contentId: string;
  platform: ContentPlatform;
  amount: number;
  currency: string;
  revenueSource: string;
}

export interface ContentInsightEvent extends BusEvent {
  insightType: 'best_platform' | 'optimal_time' | 'trending_topic' | 'performance_alert';
  platform?: ContentPlatform;
  recommendation: string;
  confidence: number;
}

// ============================================================================
// Strategy Events (v17.1)
// ============================================================================

export interface StrategyDataCollectedEvent extends BusEvent {
  week: string;
  headlineCount: number;
  sourceCount: number;
  themes: string[];
  sentiment: string;
}

export interface StrategyBriefGeneratedEvent extends BusEvent {
  briefId: string;
  week: string;
  narrativeCount: number;
  positioningCount: number;
  hasPresentation: boolean;
  outputPath?: string;
}

export interface StrategyFeedbackEvent extends BusEvent {
  briefWeek: string;
  feedbackLength: number;
  storedAsLesson: boolean;
}

// ============================================================================
// CLI Events
// ============================================================================

export interface CLIUserMessageEvent extends BusEvent {
  sessionId: string;
  messageId: string;
  content: string;
  tokenCount: number;
}

export interface CLIResponseEvent extends BusEvent {
  sessionId: string;
  messageId: string;
  phase: 'started' | 'streaming' | 'completed';
  tokenCount?: number;
  durationMs?: number;
}

export interface CLISessionEvent extends BusEvent {
  sessionId: string;
  phase: 'started' | 'ended';
  messageCount?: number;
  totalTokens?: number;
  durationMs?: number;
}

export interface CLIToolCallEvent extends BusEvent {
  sessionId: string;
  toolName: string;
  phase: 'started' | 'completed' | 'failed';
  durationMs?: number;
  result?: string;
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

// v14.1: Persistence Events
export interface LegacyPersistenceEvent extends BusEvent {
  dataDir?: string;
  checksum?: string;
  lastModified?: Date;
  error?: string;
}

// v14.1: A2A Events
export interface LegacyA2AEvent extends BusEvent {
  agentId?: string;
  publicKey?: string;
  endpoint?: unknown;
  taskId?: string;
  success?: boolean;
  error?: string;
}

// v14.1: CompIntel Started/Stopped Events
export interface LegacyCompIntelStatusEvent extends BusEvent {
  competitors?: number;
}

// v14.1: Autonomous Events
export interface LegacyAutonomousEvent extends BusEvent {
  health?: string;
  pendingActions?: number;
  type?: 'expense' | 'revenue';
  amount?: number;
  description?: string;
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

  // v17.0: Active Inference Loop Events
  'active-inference.cycle.started': ActiveInferenceCycleEvent;
  'active-inference.cycle.completed': ActiveInferenceCycleEvent;
  'active-inference.belief.updated': ActiveInferenceBeliefEvent;
  'active-inference.action.selected': ActiveInferenceActionEvent;
  'active-inference.surprise.detected': ActiveInferenceSurpriseEvent;
  'active-inference.loop.stopped': ActiveInferenceStoppedEvent;

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
  'allostasis.throttle': AllostasisThrottleEvent;
  'allostasis.defer': AllostasisDeferEvent;
  'allostasis.hibernate': AllostasisHibernateEvent;

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

  // --- Daemon Events ---
  'daemon.state.changed': DaemonStateEvent;
  'daemon.task.scheduled': DaemonTaskEvent;
  'daemon.task.started': DaemonTaskEvent;
  'daemon.task.completed': DaemonTaskEvent;
  'daemon.task.failed': DaemonTaskEvent;
  'daemon.task.cancelled': DaemonTaskEvent;
  'daemon.dream.started': DaemonDreamEvent;
  'daemon.dream.phase_changed': DaemonDreamEvent;
  'daemon.dream.completed': DaemonDreamEvent;
  'daemon.dream.interrupted': DaemonDreamEvent;
  'daemon.maintenance.started': DaemonMaintenanceEvent;
  'daemon.maintenance.completed': DaemonMaintenanceEvent;
  'daemon.maintenance.issue': DaemonMaintenanceEvent;

  // --- Self-Modification Events ---
  'self.improvement.proposed': SelfImprovementEvent;
  'self.improvement.applied': SelfImprovementEvent;

  // --- Finance Events ---
  'finance.market.updated': MarketDataUpdateEvent;
  'finance.signal.generated': TradingSignalEvent;
  'finance.position.opened': PositionOpenedEvent;
  'finance.position.closed': PositionClosedEvent;
  'finance.drawdown.alert': DrawdownAlertEvent;
  'finance.regime.changed': RegimeChangeEvent;
  // v18.0: Additional finance events
  'finance.cost.recorded': FinanceCostRecordedEvent;
  'finance.trading.halted': TradingHaltedEvent;
  'finance.portfolio.rebalanced': PortfolioRebalancedEvent;
  'finance.risk.limit_exceeded': RiskLimitExceededEvent;
  'finance.opportunity.detected': OpportunityDetectedEvent;
  'finance.risk.adjustment': RiskAdjustmentEvent;
  'finance.exploration.increased': ExplorationIncreasedEvent;
  'finance.mode.cautious': CautiousModeEvent;

  // --- Polymarket Events ---
  'polymarket.market.discovered': PolymarketDiscoveredEvent;
  'polymarket.belief.updated': PolymarketBeliefEvent;
  'polymarket.trade.executed': PolymarketTradeEvent;
  'polymarket.portfolio.updated': PolymarketPortfolioEvent;

  // --- Revenue Events ---
  'revenue.opportunity.found': RevenueOpportunityEvent;
  'revenue.task.completed': RevenueTaskEvent;
  'revenue.stream.status': RevenueStreamEvent;

  // --- x402 Payment Events ---
  'x402.challenge.issued': X402ChallengeEvent;
  'x402.payment.completed': X402PaymentEvent;
  'x402.receipt.generated': X402ReceiptEvent;

  // --- Content Events (v18.1.0) ---
  'content.created': ContentCreatedEvent;
  'content.published': ContentPublishedEvent;
  'content.scheduled': ContentScheduledEvent;
  'content.engagement': ContentEngagementEvent;
  'content.revenue': ContentRevenueEvent;
  'content.insight': ContentInsightEvent;

  // --- Strategy Events (v17.1) ---
  'strategy.data.collected': StrategyDataCollectedEvent;
  'strategy.brief.generated': StrategyBriefGeneratedEvent;
  'strategy.feedback.received': StrategyFeedbackEvent;

  // --- CLI Events ---
  'cli.user.message': CLIUserMessageEvent;
  'cli.response.started': CLIResponseEvent;
  'cli.response.streaming': CLIResponseEvent;
  'cli.response.completed': CLIResponseEvent;
  'cli.session.started': CLISessionEvent;
  'cli.session.ended': CLISessionEvent;
  'cli.tool.started': CLIToolCallEvent;
  'cli.tool.completed': CLIToolCallEvent;
  'cli.tool.failed': CLIToolCallEvent;

  // --- Legacy Aliases (colon syntax for genesis.ts compatibility) ---
  'kernel:prediction_error': LegacyPredictionErrorEvent;
  'kernel:mode_change': LegacyModeChangeEvent;
  'neuromodulation:update': LegacyNeuromodUpdateEvent;
  'pain:signal': LegacyPainSignalEvent;
  'a2a:task_received': LegacyA2ATaskEvent;
  'economic:revenue': LegacyRevenueEvent;
  'compintel:change': LegacyCompIntelEvent;
  'autonomous:task_completed': LegacyAutonomousTaskEvent;

  // v14.1: Persistence Events
  'persistence:initialized': LegacyPersistenceEvent;
  'persistence:saved': LegacyPersistenceEvent;
  'persistence:error': LegacyPersistenceEvent;
  'persistence:shutdown': LegacyPersistenceEvent;

  // v14.1: A2A Events
  'a2a:initialized': LegacyA2AEvent;
  'a2a:connected': LegacyA2AEvent;
  'a2a:disconnected': LegacyA2AEvent;
  'a2a:task:complete': LegacyA2AEvent;
  'a2a:error': LegacyA2AEvent;

  // v14.1: CompIntel Events
  'compintel:started': LegacyCompIntelStatusEvent;
  'compintel:stopped': LegacyCompIntelStatusEvent;

  // v14.1: Autonomous Events
  'autonomous:initialized': LegacyAutonomousEvent;
  'autonomous:task:started': LegacyAutonomousEvent;
  'autonomous:task:completed': LegacyAutonomousEvent;
  'autonomous:payment': LegacyAutonomousEvent;
}

/** All valid topic names */
export type GenesisEventTopic = keyof GenesisEventMap;

/** Get event type for a topic */
export type EventForTopic<T extends GenesisEventTopic> = GenesisEventMap[T];
