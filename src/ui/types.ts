/**
 * Genesis Observatory UI - Type Definitions
 *
 * Framework-agnostic type definitions for the Genesis UI system.
 * These types map the Genesis system state to UI-friendly structures.
 */

import type { SystemMetrics, EventData } from '../observability/dashboard.js';

// ============================================================================
// Core UI State Types
// ============================================================================

export interface UIState {
  timestamp: number;
  connected: boolean;
  loading: boolean;
  error: string | null;
  metrics: SystemMetrics | null;
  events: EventData[];
  computed: ComputedMetrics;
}

export interface ComputedMetrics {
  phiQuality: 'excellent' | 'good' | 'degraded' | 'critical';
  neuromodTone: 'calm' | 'focused' | 'stressed' | 'excited' | 'threat';
  economicHealth: 'sustainable' | 'warning' | 'critical';
  systemHealth: 'nominal' | 'degraded' | 'critical';
  attentionPriority: string | null;
}

// ============================================================================
// Component-Specific Data Types
// ============================================================================

export interface PhiOrbData {
  phi: number;
  state: string;
  integration: number;
  trend: 'rising' | 'falling' | 'stable';
  quality: 'excellent' | 'good' | 'degraded' | 'critical';
  color: string;
  pulseRate: number;
}

export interface NeuromodDisplayData {
  dopamine: number;
  serotonin: number;
  norepinephrine: number;
  cortisol: number;
  dominantState: 'calm' | 'focused' | 'stressed' | 'excited' | 'threat';
  explorationRate: number;
  temporalDiscount: number;
  precisionGain: number;
  riskTolerance: number;
}

export interface EconomyCardData {
  totalRevenue: number;
  totalCost: number;
  netIncome: number;
  roi: number;
  sustainable: boolean;
  nessDeviation: number;
  runway: number;
  monthlyBurnRate: number;
  status: 'sustainable' | 'warning' | 'critical';
}

export interface AgentNetworkData {
  totalAgents: number;
  activeAgents: number;
  queuedTasks: number;
  utilization: number;
  avgLatency: number;
  totalRequests: number;
  totalCost: number;
  providers: string[];
  nodes: AgentNode[];
  connections: AgentConnection[];
}

export interface AgentNode {
  id: string;
  type: 'agent' | 'task' | 'mcp' | 'llm';
  status: 'active' | 'idle' | 'error' | 'queued';
  label: string;
  metadata: Record<string, unknown>;
}

export interface AgentConnection {
  source: string;
  target: string;
  type: 'request' | 'response' | 'event';
  strength: number;
}

// ============================================================================
// Kernel & FEK State
// ============================================================================

export interface KernelState {
  mode: 'dormant' | 'awake' | 'focused' | 'vigilant' | 'critical';
  energy: number;
  cycles: number;
  uptime: number;
  freeEnergy: number;
  predictionError: number;
  stable: boolean;
  modeColor: string;
}

// ============================================================================
// Memory System State
// ============================================================================

export interface MemoryState {
  episodic: number;
  semantic: number;
  procedural: number;
  total: number;
  workingMemoryLoad: number;
  consolidationActive: boolean;
  dreamMode: boolean;
}

// ============================================================================
// Pain & Nociception State
// ============================================================================

export interface PainState {
  currentLevel: number;
  chronicPain: number;
  threshold: number;
  inAgony: boolean;
  recentStimuli: Array<{
    source: string;
    intensity: number;
    timestamp: number;
  }>;
}

// ============================================================================
// Event Stream Types
// ============================================================================

export interface UIEvent extends EventData {
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: 'kernel' | 'consciousness' | 'economy' | 'agent' | 'system';
  displayText: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface UIConfig {
  dashboardUrl: string;
  refreshInterval: number;
  maxEvents: number;
  enableSSE: boolean;
  autoReconnect: boolean;
  reconnectDelay: number;
}

export const DEFAULT_UI_CONFIG: UIConfig = {
  dashboardUrl: 'http://localhost:9876',
  refreshInterval: 1000,
  maxEvents: 100,
  enableSSE: true,
  autoReconnect: true,
  reconnectDelay: 3000,
};

// ============================================================================
// Utility Types
// ============================================================================

export type Subscriber<T> = (data: T) => void;
export type Unsubscriber = () => void;

export interface Observable<T> {
  subscribe: (subscriber: Subscriber<T>) => Unsubscriber;
  getValue: () => T;
}
