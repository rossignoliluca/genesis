/**
 * Genesis v13.11 - System Integration Layer
 *
 * Wires ALL subsystems into a coherent whole:
 *
 *   Streaming (Racing/Latency) ──→ Economic System (Cost Tracking)
 *   Streaming (Racing/Latency) ──→ Active Inference (Observations)
 *   Streaming (Racing/Latency) ──→ Consciousness (Phi Updates)
 *   Governance ──→ Streaming (Permission Checks)
 *   A2A Protocol ──→ Streaming (Remote Delegation)
 *   Payments (Revenue) ──→ Active Inference (Economic Health)
 *
 * v13.11.0: Added CentralAwareness and full module wiring
 *   All 49 modules ──→ Event Bus ──→ CentralAwareness
 *   CentralAwareness ──→ Decision Gating (φ-based)
 *   Neuromodulation ──→ Behavior Modulation (all modules)
 *
 * This module is the "nervous system" connecting all organs.
 * Call `bootstrapIntegration()` once at startup.
 */

// Re-export module wiring (v13.11.0)
export {
  wireAllModules,
  isFullyWired,
  type ModuleRegistry,
  type WiringResult,
} from './module-wiring.js';

import { onStreamCompletion } from '../streaming/orchestrator.js';
import { getLatencyTracker } from '../streaming/latency-tracker.js';
import { StreamMetrics } from '../streaming/types.js';

// ============================================================================
// Types
// ============================================================================

export interface IntegrationConfig {
  /** Enable cost tracking to economic system */
  enableCostTracking: boolean;
  /** Enable latency → Active Inference bridge */
  enableLatencyObservations: boolean;
  /** Enable racing → consciousness updates */
  enableConsciousnessUpdates: boolean;
  /** Enable governance pre-checks on streaming */
  enableGovernanceChecks: boolean;
  /** Enable A2A → streaming delegation */
  enableA2ADelegation: boolean;
  /** Slack webhook for governance notifications */
  slackWebhook?: string;
}

export const DEFAULT_INTEGRATION_CONFIG: IntegrationConfig = {
  enableCostTracking: true,
  enableLatencyObservations: true,
  enableConsciousnessUpdates: true,
  enableGovernanceChecks: false, // Opt-in (requires governance setup)
  enableA2ADelegation: false,    // Opt-in (requires A2A server)
};

export interface IntegrationState {
  initialized: boolean;
  totalCostsRecorded: number;
  totalStreamsCompleted: number;
  totalRacingWins: Record<string, number>;
  latencyObservationsEmitted: number;
  governanceChecks: number;
  a2aDelegations: number;
  lastStreamProvider: string;
  lastStreamCost: number;
  uptime: number;
}

// ============================================================================
// Integration Singleton
// ============================================================================

let integrationState: IntegrationState = {
  initialized: false,
  totalCostsRecorded: 0,
  totalStreamsCompleted: 0,
  totalRacingWins: {},
  latencyObservationsEmitted: 0,
  governanceChecks: 0,
  a2aDelegations: 0,
  lastStreamProvider: '',
  lastStreamCost: 0,
  uptime: Date.now(),
};

let unsubscribers: Array<() => void> = [];

// ============================================================================
// Bootstrap - Wire Everything Together
// ============================================================================

/**
 * Bootstrap the integration layer.
 * Call once at system startup to connect all subsystems.
 */
export function bootstrapIntegration(config: Partial<IntegrationConfig> = {}): void {
  if (integrationState.initialized) return;

  const cfg = { ...DEFAULT_INTEGRATION_CONFIG, ...config };

  // === 1. Streaming Costs → Economic System ===
  if (cfg.enableCostTracking) {
    const unsub = onStreamCompletion((metrics, provider, model) => {
      recordStreamingCost(metrics, provider, model);
    });
    unsubscribers.push(unsub);
  }

  // === 2. Latency Data → Active Inference Observations ===
  if (cfg.enableLatencyObservations) {
    const unsub = onStreamCompletion((metrics, provider, model) => {
      emitLatencyObservation(metrics, provider, model);
    });
    unsubscribers.push(unsub);
  }

  // === 3. Racing Results → Consciousness Updates ===
  if (cfg.enableConsciousnessUpdates) {
    const unsub = onStreamCompletion((metrics, provider, model) => {
      if (metrics.racingWinner) {
        updateConsciousnessFromRacing(metrics);
      }
    });
    unsubscribers.push(unsub);
  }

  integrationState.initialized = true;
  integrationState.uptime = Date.now();
}

/**
 * Shutdown the integration layer, removing all hooks.
 */
export function shutdownIntegration(): void {
  for (const unsub of unsubscribers) {
    unsub();
  }
  unsubscribers = [];
  integrationState.initialized = false;
}

/**
 * Get current integration state/stats.
 */
export function getIntegrationState(): IntegrationState {
  return { ...integrationState };
}

// ============================================================================
// 1. Streaming Costs → Economic System
// ============================================================================

/**
 * Forward streaming costs to both:
 * - CostTracker (active-inference economic integration)
 * - RevenueTracker (payments P&L)
 */
function recordStreamingCost(metrics: StreamMetrics, provider: string, model: string): void {
  if (metrics.cost <= 0) return;

  integrationState.totalCostsRecorded += metrics.cost;
  integrationState.totalStreamsCompleted++;
  integrationState.lastStreamProvider = provider;
  integrationState.lastStreamCost = metrics.cost;

  // Track racing wins
  if (metrics.racingWinner) {
    const key = `${metrics.racingWinner}/${metrics.racingModel}`;
    integrationState.totalRacingWins[key] = (integrationState.totalRacingWins[key] || 0) + 1;
  }

  // Record to Active Inference CostTracker (economic survival)
  try {
    const { getEconomicIntegration } = require('../active-inference/economic-integration.js');
    const econ = getEconomicIntegration();
    econ.costTracker.recordLLMCost(
      provider,
      metrics.inputTokens,
      metrics.outputTokens,
      model
    );
  } catch (e) { console.debug('[Integration] Economic system not initialized:', (e as Error)?.message); }

  // Record to Payments RevenueTracker (P&L reporting)
  try {
    const { getRevenueTracker } = require('../payments/revenue-tracker.js');
    const revenue = getRevenueTracker();
    revenue.recordCost({
      category: 'llm' as const,
      amount: Math.round(metrics.cost * 100), // Convert to cents
      description: `${provider}/${model}: ${metrics.inputTokens}in/${metrics.outputTokens}out`,
      provider,
      metadata: {
        model,
        tokensPerSecond: metrics.tokensPerSecond,
        ttft: metrics.timeToFirstToken,
        racingWinner: metrics.racingWinner,
        racingSaved: metrics.racingSaved,
      },
    });
  } catch (e) { console.debug('[Integration] Payments not initialized:', (e as Error)?.message); }
}

// ============================================================================
// 2. Latency Data → Active Inference Observations
// ============================================================================

/**
 * Translate streaming performance into Active Inference observations.
 * This allows the Free Energy Principle to optimize provider selection.
 */
function emitLatencyObservation(metrics: StreamMetrics, provider: string, model: string): void {
  integrationState.latencyObservationsEmitted++;

  try {
    const { getObservationGatherer } = require('../active-inference/observations.js');
    const gatherer = getObservationGatherer();

    // Configure the sensor result to reflect real streaming performance
    gatherer.configure({
      sensorResult: async () => ({
        success: metrics.state !== 'error',
        latency: metrics.timeToFirstToken || metrics.elapsed,
        error: metrics.state === 'error' ? 'Stream failed' : undefined,
      }),
    });
  } catch (e) { console.debug('[Integration] Active-inference not initialized:', (e as Error)?.message); }

  // Also update the LatencyTracker's observation into the economic system
  try {
    const tracker = getLatencyTracker();
    const allStats = tracker.getAllStats();

    // Find best and worst performers
    const sorted = [...allStats].sort((a, b) => a.emaTTFT - b.emaTTFT);
    const fastest = sorted[0];
    const slowest = sorted[sorted.length - 1];

    if (fastest && slowest) {
      // Emit performance delta as observation for Active Inference
      const performanceRatio = fastest.emaTTFT / (slowest.emaTTFT || 1);
      const degradingCount = allStats.filter(s => s.trend === 'degrading').length;

      // This data can be used by the Active Inference engine to decide
      // whether to explore new providers or exploit known-fast ones
      const { getEconomicIntegration } = require('../active-inference/economic-integration.js');
      const econ = getEconomicIntegration();

      // Record as a cost if we're using slow providers unnecessarily
      if (metrics.racingSaved && metrics.racingSaved > 0) {
        // Racing saved latency - record as negative cost (value generated)
        econ.revenueTracker.record({
          source: 'service' as const,
          amount: metrics.racingSaved * 0.0001, // Latency savings have economic value
          description: `Racing saved ${metrics.racingSaved}ms on ${provider}/${model}`,
        });
      }
    }
  } catch (e) { console.debug('[Integration] Tracker not ready:', (e as Error)?.message); }
}

// ============================================================================
// 3. Racing Results → Consciousness Updates
// ============================================================================

/**
 * When racing produces a winner, update the consciousness system's
 * perception of system performance. This feeds into Phi (Φ) calculation.
 */
function updateConsciousnessFromRacing(metrics: StreamMetrics): void {
  try {
    const { getConsciousnessSystem } = require('../consciousness/index.js');
    const consciousness = getConsciousnessSystem();

    // Racing creates new "information" (which provider is fastest NOW)
    // This is integrated information in the IIT sense
    consciousness.recordEvent({
      type: 'racing_result',
      provider: metrics.racingWinner,
      model: metrics.racingModel,
      saved: metrics.racingSaved || 0,
      strategy: metrics.racingStrategy,
      candidates: metrics.racingCandidates,
      tokensPerSecond: metrics.tokensPerSecond,
      timestamp: Date.now(),
    });
  } catch (e) { console.debug('[Integration] Consciousness not initialized:', (e as Error)?.message); }

  // Also feed into the Brain's metrics if brain is active
  try {
    const { getBrainInstance } = require('../brain/index.js');
    const brain = getBrainInstance();
    if (brain) {
      brain.recordStreamingMetrics({
        provider: metrics.racingWinner || 'unknown',
        model: metrics.racingModel || 'unknown',
        ttft: metrics.timeToFirstToken || 0,
        tokensPerSecond: metrics.tokensPerSecond,
        cost: metrics.cost,
        racingSaved: metrics.racingSaved || 0,
        toolCalls: metrics.toolCallCount,
        parallelToolSaved: metrics.parallelToolSaved || 0,
      });
    }
  } catch (e) { console.debug('[Integration] Brain not active:', (e as Error)?.message); }
}

// ============================================================================
// 4. Governance Checks (opt-in)
// ============================================================================

/**
 * Check governance rules before expensive streaming operations.
 * Returns true if allowed, false if blocked.
 */
export async function checkGovernance(
  operation: string,
  estimatedCost: number
): Promise<{ allowed: boolean; reason?: string }> {
  integrationState.governanceChecks++;

  try {
    const { getGovernanceSystem } = require('../governance/index.js');
    const governance = getGovernanceSystem();

    // Check if operation is within budget limits
    const result = await governance.checkPermission({
      action: operation,
      cost: estimatedCost,
      context: { source: 'streaming', timestamp: Date.now() },
    });

    return { allowed: result.approved, reason: result.reason };
  } catch {
    // Governance not configured - allow by default
    return { allowed: true };
  }
}

// ============================================================================
// 5. A2A → Streaming Delegation
// ============================================================================

/**
 * Delegate a streaming task to a remote agent via A2A protocol.
 * Uses local racing to pick the fastest available provider (local or remote).
 */
export async function delegateToRemoteAgent(
  taskDescription: string,
  options: { maxCost?: number; preferLocal?: boolean } = {}
): Promise<{ delegated: boolean; result?: string; agent?: string }> {
  integrationState.a2aDelegations++;

  try {
    const { getA2AClient } = require('../a2a/client.js');
    const client = getA2AClient();

    // Discover available agents
    const agents = await client.discover();
    if (!agents || agents.length === 0) {
      return { delegated: false };
    }

    // Find an agent that can handle this task
    for (const agent of agents) {
      if (agent.capabilities?.includes('streaming') || agent.capabilities?.includes('llm')) {
        const result = await client.delegateTask(agent.id, {
          type: 'streaming_query',
          query: taskDescription,
          maxCost: options.maxCost || 0.05,
        });

        return {
          delegated: true,
          result: result?.content,
          agent: agent.id,
        };
      }
    }

    return { delegated: false };
  } catch {
    return { delegated: false };
  }
}

// ============================================================================
// 6. Unified Status (all subsystems)
// ============================================================================

/**
 * Get a unified status view of ALL Genesis subsystems.
 * This is the single-pane-of-glass for system health.
 */
export function getUnifiedStatus(): {
  streaming: { active: boolean; latencyStats: number; racingWins: number };
  economic: { totalCost: number; costPerStream: number };
  activeInference: { observationsEmitted: number };
  consciousness: { updated: boolean };
  governance: { checksPerformed: number };
  a2a: { delegations: number };
  integration: IntegrationState;
} {
  const state = integrationState;
  const avgCost = state.totalStreamsCompleted > 0
    ? state.totalCostsRecorded / state.totalStreamsCompleted
    : 0;

  return {
    streaming: {
      active: state.initialized,
      latencyStats: getLatencyTracker().getAllStats().length,
      racingWins: Object.values(state.totalRacingWins).reduce((a, b) => a + b, 0),
    },
    economic: {
      totalCost: state.totalCostsRecorded,
      costPerStream: avgCost,
    },
    activeInference: {
      observationsEmitted: state.latencyObservationsEmitted,
    },
    consciousness: {
      updated: state.totalStreamsCompleted > 0,
    },
    governance: {
      checksPerformed: state.governanceChecks,
    },
    a2a: {
      delegations: state.a2aDelegations,
    },
    integration: state,
  };
}
