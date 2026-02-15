/**
 * Horizon Scanner Types
 * Auto-discovery and evaluation of new MCP servers and tools.
 */

export interface HorizonScannerConfig {
  scanIntervalMs: number;
  maxMcpServers: number;
  adoptionThreshold: number;
  maxEvaluationsPerCycle: number;
  maxIntegrationsPerCycle: number;
  requireHumanApproval: boolean;
  activeDomains: string[];
  enabledSources: DiscoverySource[];
}

export type DiscoverySource = 'npm' | 'github' | 'mcp-registry' | 'web';

export type CandidateStatus =
  | 'discovered'
  | 'evaluating'
  | 'approved'
  | 'rejected'
  | 'sandbox-testing'
  | 'canary'
  | 'integrated'
  | 'failed';

export interface CandidateCapability {
  id: string;
  packageName: string;
  description: string;
  category: string;
  transport: 'stdio' | 'sse' | 'streamable-http';
  discoveredAt: string;
  discoveredFrom: DiscoverySource;
  status: CandidateStatus;
  stars?: number;
  weeklyDownloads?: number;
  lastPublished?: string;
  evaluation?: EvaluationResult;
}

export interface EvaluationResult {
  candidateId: string;
  expectedFreeEnergy: number;
  epistemicValue: number;
  pragmaticValue: number;
  complexityCost: number;
  riskPenalty: number;
  decision: 'adopt' | 'defer' | 'reject';
  reasoning: string;
  evaluatedAt: string;
}

export interface MCPServerConfig {
  name: string;
  transport: string;
  command: string;
  args: string[];
  requiredEnv?: string[];
  description: string;
  enabled: boolean;
  category: string;
  _scanner?: {
    addedAt: string;
    addedBy: 'horizon-scanner';
    candidateId: string;
    evaluationScore: number;
  };
}

export interface IntegrationPlan {
  candidateId: string;
  createdAt: string;
  mcpConfig: MCPServerConfig;
  sandboxTests: SandboxTest[];
  rollout: {
    type: 'canary';
    canaryPercentage: number;
    canaryDurationMs: number;
    monitorMetrics: string[];
    autoPromote: boolean;
  };
  rollback: {
    removeMcpConfig: boolean;
    unregisterTools: string[];
    autoRollbackAfterMs: number;
  };
}

export interface SandboxTest {
  id: string;
  description: string;
  toolCall: { server: string; tool: string; params: Record<string, unknown> };
  expectation: 'returns_result' | 'no_error' | 'matches_schema';
  timeoutMs: number;
  postInvariantCheck: boolean;
}

export interface ToolUsageRecord {
  serverName: string;
  toolName: string;
  invocations30d: number;
  successRate30d: number;
  avgLatencyMs: number;
  totalCost30d: number;
  lastUsed: string;
  daysSinceLastUse: number;
}

export interface PruningDecision {
  serverName: string;
  decision: 'keep' | 'disable' | 'remove';
  reasoning: string;
  usageScore: number;
  costScore: number;
  netValue: number;
  pruneThreshold: number;
}

export interface CycleSummary {
  discovered: number;
  evaluated: number;
  approved: number;
  integrated: number;
  pruned: number;
  durationMs: number;
}

export const DEFAULT_SCANNER_CONFIG: HorizonScannerConfig = {
  scanIntervalMs: 24 * 60 * 60 * 1000, // Daily
  maxMcpServers: 30,
  adoptionThreshold: 0.3,
  maxEvaluationsPerCycle: 5,
  maxIntegrationsPerCycle: 2,
  requireHumanApproval: true,
  activeDomains: ['research', 'finance', 'content', 'development', 'communication'],
  enabledSources: ['npm', 'github', 'mcp-registry'],
};
