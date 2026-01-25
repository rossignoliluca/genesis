/**
 * Genesis Revenue Module - Type Definitions
 *
 * Defines the core types for revenue stream management in the autonomous economy.
 * Each revenue stream is a potential income source that can be enabled/disabled,
 * prioritized, and monitored for performance.
 */

// ============================================================================
// Core Revenue Stream Types
// ============================================================================

export type RevenueStreamType =
  | 'bounty-hunter'    // DeFi arbitrage and bounty hunting
  | 'mcp-services'     // MCP server marketplace revenue
  | 'keeper'           // Keep3r network jobs
  | 'content'          // Content generation for clients
  | 'yield';           // DeFi yield farming

export type StreamStatus =
  | 'idle'             // Not running
  | 'active'           // Currently generating revenue
  | 'searching'        // Looking for opportunities
  | 'executing'        // Executing a revenue task
  | 'paused'           // Temporarily stopped
  | 'error';           // Failed state

export interface RevenueStream {
  id: string;
  type: RevenueStreamType;
  name: string;
  description: string;
  enabled: boolean;
  status: StreamStatus;
  priority: number;           // 1-10, higher = more important

  // Performance metrics
  totalEarned: number;        // Lifetime revenue
  totalCost: number;          // Lifetime costs
  roi: number;                // (earned - cost) / cost
  successRate: number;        // % of successful attempts
  avgRevenue: number;         // Average per successful transaction
  lastActive: number;         // Timestamp of last activity

  // Configuration
  minRevenueThreshold: number; // Don't execute if below this
  maxRiskTolerance: number;    // 0-1, maximum acceptable risk
  cooldownMs: number;          // Time between attempts

  // State
  currentTask?: RevenueTask;
  errorCount: number;
  consecutiveFailures: number;
}

export interface RevenueTask {
  id: string;
  streamId: string;
  type: RevenueStreamType;
  description: string;
  estimatedRevenue: number;
  estimatedCost: number;
  risk: number;               // 0-1
  confidence: number;         // 0-1
  deadline?: number;          // Optional deadline timestamp
  startedAt: number;
  completedAt?: number;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: RevenueTaskResult;
}

export interface RevenueTaskResult {
  success: boolean;
  actualRevenue: number;
  actualCost: number;
  duration: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Revenue Opportunity Types
// ============================================================================

export interface RevenueOpportunity {
  id: string;
  source: RevenueStreamType;
  type: string;                    // Specific opportunity type
  estimatedRevenue: number;
  estimatedCost: number;
  estimatedRoi: number;
  risk: number;                    // 0-1
  confidence: number;              // 0-1
  timeWindow: number;              // How long until opportunity expires (ms)
  requirements: string[];          // What's needed to execute
  metadata: Record<string, unknown>;
}

// ============================================================================
// DeFi-Specific Types
// ============================================================================

export interface DeFiBounty {
  protocol: string;
  action: 'liquidation' | 'arbitrage' | 'keeper' | 'rebalance';
  targetAddress?: string;
  estimatedProfit: number;
  gasEstimate: number;
  complexity: number;              // 0-1
  deadline?: number;
}

export interface YieldPosition {
  protocol: string;
  asset: string;
  amount: number;
  apy: number;
  tvl: number;
  risk: number;                    // 0-1
  lockupPeriod?: number;           // ms
  enteredAt: number;
  lastHarvestAt?: number;
}

// ============================================================================
// MCP Service Types
// ============================================================================

export interface MCPServiceListing {
  serviceId: string;
  name: string;
  description: string;
  pricePerCall: number;
  pricePerMonth?: number;
  callsServed: number;
  revenue: number;
  rating: number;                  // 0-5
  active: boolean;
}

export interface MCPServiceRequest {
  requestId: string;
  serviceId: string;
  client: string;
  parameters: Record<string, unknown>;
  offerPrice: number;
  deadline?: number;
  priority: number;
}

// ============================================================================
// Content Generation Types
// ============================================================================

export interface ContentJob {
  jobId: string;
  client: string;
  contentType: 'article' | 'code' | 'analysis' | 'report' | 'creative';
  topic: string;
  requirements: string[];
  wordCount?: number;
  deadline?: number;
  payment: number;
  upfrontPayment?: number;
  complexity: number;              // 0-1
}

// ============================================================================
// Revenue Manager Types
// ============================================================================

export interface RevenueMetrics {
  totalRevenue: number;
  totalCost: number;
  netRevenue: number;
  roi: number;
  activeStreams: number;
  successfulTasks: number;
  failedTasks: number;
  averageTaskDuration: number;
  revenueByStream: Map<RevenueStreamType, number>;
  costByStream: Map<RevenueStreamType, number>;
}

export interface StreamPriority {
  streamId: string;
  priority: number;
  reason: string;
  expiresAt?: number;
}

export interface RevenueConfig {
  // Global settings
  maxConcurrentTasks: number;
  maxDailyBudget: number;
  minRoi: number;                  // Don't execute if ROI below this

  // Risk management
  maxTotalRisk: number;            // Combined risk across all tasks
  riskAdjustment: number;          // Multiplier based on recent performance

  // Performance thresholds
  minSuccessRate: number;          // Disable stream if below this
  pauseThreshold: number;          // Consecutive failures before pause

  // Timing
  opportunityScanInterval: number; // How often to look for opportunities
  metricsUpdateInterval: number;   // How often to recalculate metrics
}

// ============================================================================
// Event Types for Bus Integration
// ============================================================================

export interface RevenueEvent {
  seq: number;
  timestamp: number;
  source: string;
}

export interface RevenueTaskStartedEvent extends RevenueEvent {
  task: RevenueTask;
}

export interface RevenueTaskCompletedEvent extends RevenueEvent {
  task: RevenueTask;
  result: RevenueTaskResult;
}

export interface RevenueTaskFailedEvent extends RevenueEvent {
  task: RevenueTask;
  error: string;
}

export interface OpportunityFoundEvent extends RevenueEvent {
  opportunity: RevenueOpportunity;
}

export interface StreamStatusChangedEvent extends RevenueEvent {
  streamId: string;
  oldStatus: StreamStatus;
  newStatus: StreamStatus;
  reason: string;
}

export interface RevenueMilestoneEvent extends RevenueEvent {
  milestone: string;
  value: number;
  metadata?: Record<string, unknown>;
}
