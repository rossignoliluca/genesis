/**
 * Holistic Self-Model — Type Definitions
 *
 * Types for Genesis's persistent self-awareness system.
 * Tracks module manifest, runtime health, and improvement proposals.
 */

// ============================================================================
// Module Manifest (Static — from filesystem scan)
// ============================================================================

export interface ModuleManifestEntry {
  /** Module directory name (e.g. 'antifragile') */
  name: string;
  /** Relative path (e.g. 'src/antifragile') */
  path: string;
  /** Number of .ts files (excluding tests, declarations) */
  fileCount: number;
  /** Total size in bytes */
  totalSize: number;
  /** Has index.ts entry point */
  hasIndex: boolean;
  /** Description from index.ts docstring */
  description: string;
  /** Exported symbols from index.ts (max 20) */
  exports: string[];
  /** Detected dependencies from imports */
  dependencies: string[];
  /** Bus event topic prefixes this module uses */
  busTopics: string[];
}

// ============================================================================
// Runtime Health (Dynamic — from bus events)
// ============================================================================

export type ModuleHealthStatus = 'working' | 'broken' | 'degraded' | 'untested' | 'dormant';

export interface ModuleHealth {
  moduleName: string;
  status: ModuleHealthStatus;
  successCount: number;
  failureCount: number;
  lastSuccess: string | null;
  lastError: string | null;
  lastErrorTime: string | null;
  lastEventTime: string | null;
  avgLatencyMs: number;
  healthScore: number;
  eventCount: number;
}

export interface RuntimeSnapshot {
  capturedAt: string;
  uptimeMs: number;
  modulesActive: number;
  modulesWithErrors: number;
  totalEvents: number;
  topErrors: Array<{ module: string; error: string; count: number }>;
  health: Record<string, ModuleHealth>;
}

// ============================================================================
// Capability Assessment
// ============================================================================

export type IntegrationQuality = 'full' | 'partial' | 'disconnected';

export interface ModuleAssessment {
  moduleName: string;
  status: ModuleHealthStatus;
  integrationQuality: IntegrationQuality;
  busConnected: boolean;
  hasTests: boolean;
  lastKnownSuccess: string | null;
  errorPatterns: string[];
  recommendations: string[];
}

// ============================================================================
// Improvement Proposals
// ============================================================================

export interface ImprovementProposal {
  id: string;
  category: 'wiring' | 'performance' | 'reliability' | 'integration' | 'capability';
  priority: number;
  title: string;
  description: string;
  targetModule: string;
  evidence: string;
  suggestedAction: string;
  estimatedEffort: 'trivial' | 'small' | 'medium' | 'large';
}

// ============================================================================
// Self-Briefing
// ============================================================================

export interface ArchitectureLayer {
  name: string;
  modules: string[];
}

export interface SelfBriefing {
  generatedAt: string;
  version: string;
  moduleCount: number;
  architecture: {
    layers: ArchitectureLayer[];
  };
  healthDashboard: {
    working: string[];
    degraded: Array<{ name: string; detail: string }>;
    broken: Array<{ name: string; detail: string }>;
    untested: string[];
    dormant: string[];
  };
  recentFailures: Array<{ module: string; error: string; when: string }>;
  improvements: ImprovementProposal[];
  sessionHistory: {
    lastRefresh: string;
    totalSessions: number;
    totalEvents: number;
  };
  markdown: string;
}

// ============================================================================
// Persistence (Cross-session)
// ============================================================================

export interface SessionLogEntry {
  startedAt: string;
  endedAt: string;
  eventsProcessed: number;
  errorsDetected: number;
}

export interface PersistedSelfModel {
  version: string;
  lastUpdated: string;
  manifest: ModuleManifestEntry[];
  health: Record<string, ModuleHealth>;
  proposals: ImprovementProposal[];
  sessionLog: SessionLogEntry[];
}

// ============================================================================
// Config
// ============================================================================

export interface HolisticSelfModelConfig {
  rootPath: string;
  persistPath: string;
  persistIntervalMs: number;
  maxSessionLogEntries: number;
  maxRecentFailures: number;
  maxProposals: number;
}

export const DEFAULT_SELF_MODEL_CONFIG: HolisticSelfModelConfig = {
  rootPath: '',
  persistPath: '.genesis/holistic-self-model.json',
  persistIntervalMs: 5 * 60 * 1000,
  maxSessionLogEntries: 50,
  maxRecentFailures: 10,
  maxProposals: 10,
};
