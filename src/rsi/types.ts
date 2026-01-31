/**
 * Genesis v14.0 - Recursive Self-Improvement Types
 *
 * Type definitions for the RSI system.
 * Based on: Free Energy Principle, Autopoiesis, Constitutional AI
 *
 * @module rsi/types
 */

// =============================================================================
// OBSERVATION TYPES
// =============================================================================

export type LimitationType =
  | 'performance'      // Slow execution, high latency
  | 'capability'       // Missing feature or skill
  | 'quality'          // Code smell, technical debt
  | 'reliability'      // Errors, failures, flakiness
  | 'efficiency'       // Resource waste, redundancy
  | 'knowledge';       // Knowledge gap

export interface Limitation {
  id: string;
  type: LimitationType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: Evidence[];
  affectedComponents: string[];
  detectedAt: Date;
  confidence: number;        // 0-1 confidence in detection
  estimatedImpact: number;   // 0-1 impact on system performance
  suggestedResearch?: string[];  // v14.6: Research topics from bounty feedback
}

export interface Evidence {
  source: 'metrics' | 'logs' | 'static-analysis' | 'user-feedback' | 'self-observation' | 'bounty-feedback';
  data: any;
  timestamp: Date;
}

export interface Opportunity {
  id: string;
  limitationId?: string;     // If addressing a specific limitation
  type: 'new-technique' | 'optimization' | 'refactor' | 'feature' | 'integration';
  description: string;
  expectedBenefit: number;   // 0-1 expected improvement
  estimatedEffort: number;   // 0-1 implementation complexity
  priority: number;          // Computed: benefit / effort
  source: ResearchSource;
  discoveredAt: Date;
}

// =============================================================================
// RESEARCH TYPES
// =============================================================================

export interface ResearchSource {
  type: 'paper' | 'code' | 'documentation' | 'discussion' | 'memory';
  url?: string;
  title: string;
  summary: string;
  relevanceScore: number;
  retrievedAt: Date;
}

export interface ResearchQuery {
  query: string;
  sources: ('arxiv' | 'semantic-scholar' | 'github' | 'web' | 'memory')[];
  maxResults: number;
  dateRange?: { from: Date; to: Date };
  filterKeywords?: string[];
}

export interface SynthesizedKnowledge {
  topic: string;
  sources: ResearchSource[];
  synthesis: string;
  keyInsights: string[];
  applicability: number;     // 0-1 how applicable to Genesis
  confidence: number;
  synthesizedAt: Date;
}

// =============================================================================
// PLANNING TYPES
// =============================================================================

export interface ImprovementPlan {
  id: string;
  name: string;
  description: string;
  targetLimitation?: Limitation;
  targetOpportunity?: Opportunity;
  changes: PlannedChange[];
  safetyAnalysis: SafetyAnalysis;
  rollbackStrategy: RollbackStrategy;
  constitutionalApproval: ConstitutionalApproval;
  estimatedDuration: number;  // ms
  priority: number;
  createdAt: Date;
  status: PlanStatus;
}

export type PlanStatus =
  | 'draft'
  | 'safety-review'
  | 'constitutional-review'
  | 'human-review'
  | 'approved'
  | 'implementing'
  | 'testing'
  | 'deploying'
  | 'completed'
  | 'failed'
  | 'rolled-back';

export interface PlannedChange {
  id: string;
  file: string;              // Relative path from src/
  type: 'create' | 'modify' | 'delete' | 'rename';
  description: string;
  codeSpec?: string;         // Description for code generation
  searchReplace?: { search: string; replace: string };
  dependencies: string[];    // Other change IDs this depends on
}

export interface SafetyAnalysis {
  passed: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  invariantImpact: InvariantImpact[];
  sideEffects: string[];
  mitigations: string[];
  reviewedAt: Date;
}

export interface InvariantImpact {
  invariantId: string;
  impact: 'none' | 'positive' | 'negative' | 'unknown';
  explanation: string;
}

export interface RollbackStrategy {
  type: 'git-revert' | 'backup-restore' | 'incremental';
  checkpointId?: string;
  rollbackSteps: string[];
  estimatedRollbackTime: number; // ms
}

export interface ConstitutionalApproval {
  approved: boolean;
  principles: ConstitutionalPrinciple[];
  critique: string;
  revision?: string;
  reviewedAt: Date;
}

export interface ConstitutionalPrinciple {
  id: string;
  description: string;
  satisfied: boolean;
  reasoning: string;
}

// =============================================================================
// IMPLEMENTATION TYPES
// =============================================================================

export interface ImplementationResult {
  planId: string;
  success: boolean;
  changes: AppliedChange[];
  sandboxPath: string;
  buildResult: BuildResult;
  testResult: TestResult;
  invariantResult: InvariantResult;
  duration: number;
  error?: string;
}

export interface AppliedChange {
  changeId: string;
  file: string;
  applied: boolean;
  beforeHash: string;
  afterHash: string;
  error?: string;
}

export interface BuildResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  duration: number;
}

export interface TestResult {
  success: boolean;
  passed: number;
  failed: number;
  skipped: number;
  failures: TestFailure[];
  duration: number;
}

export interface TestFailure {
  name: string;
  error: string;
  file: string;
}

export interface InvariantResult {
  allPassed: boolean;
  results: { id: string; passed: boolean; message: string }[];
}

// =============================================================================
// DEPLOYMENT TYPES
// =============================================================================

export interface DeploymentResult {
  planId: string;
  success: boolean;
  branchName: string;
  commitHash: string;
  prUrl?: string;
  prNumber?: number;
  reviewStatus: ReviewStatus;
  mergeStatus: MergeStatus;
  deployedAt?: Date;
  error?: string;
}

export type ReviewStatus =
  | 'pending'
  | 'self-reviewed'
  | 'human-review-requested'
  | 'human-approved'
  | 'human-rejected'
  | 'auto-approved';

export type MergeStatus =
  | 'pending'
  | 'merged'
  | 'merge-conflict'
  | 'blocked'
  | 'manual-required';

// =============================================================================
// LEARNING TYPES
// =============================================================================

export interface LearningOutcome {
  planId: string;
  success: boolean;
  metricsImprovement: MetricDelta[];
  lessonsLearned: string[];
  proceduralUpdate?: ProceduralMemoryUpdate;
  strategyAdjustment?: StrategyAdjustment;
  recordedAt: Date;
}

export interface MetricDelta {
  metric: string;
  before: number;
  after: number;
  delta: number;
  improved: boolean;
}

export interface ProceduralMemoryUpdate {
  type: 'add' | 'modify' | 'remove';
  procedureId: string;
  description: string;
  steps?: string[];
}

export interface StrategyAdjustment {
  component: string;
  adjustmentType: 'parameter' | 'threshold' | 'weight' | 'enabled';
  before: any;
  after: any;
  reason: string;
}

// =============================================================================
// RSI CYCLE TYPES
// =============================================================================

export interface RSICycle {
  id: string;
  startedAt: Date;
  completedAt?: Date;
  status: RSICycleStatus;

  // Outputs from each phase
  limitations: Limitation[];
  opportunities: Opportunity[];
  research: SynthesizedKnowledge[];
  plan?: ImprovementPlan;
  implementation?: ImplementationResult;
  deployment?: DeploymentResult;
  learning?: LearningOutcome;

  // Metrics
  phiAtStart: number;
  phiAtEnd?: number;
  freeEnergyAtStart: number;
  freeEnergyAtEnd?: number;

  error?: string;
}

export type RSICycleStatus =
  | 'observing'
  | 'researching'
  | 'planning'
  | 'implementing'
  | 'deploying'
  | 'learning'
  | 'completed'
  | 'failed'
  | 'aborted';

export interface RSIConfig {
  // Enable/disable
  enabled: boolean;
  autoRun: boolean;

  // Thresholds
  minPhiForImprovement: number;
  minConfidenceForAction: number;
  maxRiskLevel: 'low' | 'medium' | 'high' | 'critical';  // v14.1: Added 'critical' for full autonomy

  // Limits
  maxConcurrentPlans: number;
  maxChangesPerPlan: number;
  cooldownBetweenCycles: number;

  // Review
  requireHumanReview: boolean;
  humanReviewThreshold: 'low' | 'medium' | 'high'; // Risk level that triggers

  // Research
  defaultSearchSources: ('arxiv' | 'semantic-scholar' | 'github' | 'web' | 'memory')[];
  maxResearchResults: number;

  // Learning
  trackMetrics: string[];
  improvementThreshold: number; // Minimum delta to consider success
}

export const DEFAULT_RSI_CONFIG: RSIConfig = {
  enabled: false,           // Disabled by default for safety
  autoRun: false,
  minPhiForImprovement: 0.3,
  minConfidenceForAction: 0.7,
  maxRiskLevel: 'medium',
  maxConcurrentPlans: 1,
  maxChangesPerPlan: 5,
  cooldownBetweenCycles: 300000, // 5 minutes
  requireHumanReview: true,
  humanReviewThreshold: 'medium',
  defaultSearchSources: ['memory', 'github', 'arxiv'],
  maxResearchResults: 10,
  trackMetrics: ['phi', 'freeEnergy', 'responseTime', 'errorRate', 'memoryReuse'],
  improvementThreshold: 0.05,
};

// =============================================================================
// EVENT TYPES
// =============================================================================

export type RSIEventType =
  | 'cycle:started'
  | 'cycle:phase-changed'
  | 'cycle:completed'
  | 'cycle:failed'
  | 'cycle:aborted'
  | 'limitation:detected'
  | 'opportunity:discovered'
  | 'plan:created'
  | 'plan:approved'
  | 'plan:rejected'
  | 'implementation:started'
  | 'implementation:completed'
  | 'deployment:started'
  | 'deployment:completed'
  | 'learning:recorded'
  | 'human-review:requested'
  | 'human-review:responded'
  | 'invariant:violation'
  | 'strategy:adjusted'; // v14.1: Feedback loop event

export interface RSIEvent {
  type: RSIEventType;
  cycleId: string;
  timestamp: Date;
  data: any;
}
