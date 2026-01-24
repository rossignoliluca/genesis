/**
 * Genesis 6.1 - Observations Bridge
 *
 * Connects existing agents to Active Inference observations.
 *
 * Maps:
 * - SensorAgent → tool perception
 * - FeelingAgent → interoceptive state
 * - PhiMonitor → consciousness level
 * - WorldModel → coherence metric
 * - Kernel → energy/task status
 */

import {
  Observation,
  EnergyObs,
  PhiObs,
  ToolObs,
  CoherenceObs,
  TaskObs,
  EconomicObs,
} from './types.js';
import { getEconomicIntegration } from './economic-integration.js';
import { getMCPClient } from '../mcp/index.js';
import { createPhiMonitor } from '../consciousness/phi-monitor.js';

// ============================================================================
// Types for Agent Integration
// ============================================================================

export interface KernelState {
  energy: number;        // 0.0 - 1.0
  state: string;         // 'idle', 'sensing', etc.
  taskStatus?: 'none' | 'pending' | 'running' | 'completed' | 'failed';
}

export interface PhiState {
  phi: number;           // 0.0 - 1.0
  state: 'dormant' | 'alert' | 'aware' | 'drowsy' | 'fragmented';
}

export interface SensorResult {
  success: boolean;
  latency: number;
  error?: string;
}

export interface WorldModelState {
  consistent: boolean;
  issues: number;
}

// ============================================================================
// Observation Gatherer
// ============================================================================

export class ObservationGatherer {
  // References to system components (injected)
  private getKernelState?: () => KernelState;
  private getPhiState?: () => PhiState;
  private getSensorResult?: () => Promise<SensorResult>;
  private getWorldModelState?: () => WorldModelState;

  // v10.8: Real MCP data tracking
  private mcpToolResults: Array<{ success: boolean; latency: number; timestamp: number }> = [];
  private lastStripeBalance: number = -1; // -1 = never checked
  private realSourcesInitialized = false;

  /**
   * Configure observation sources
   */
  configure(sources: {
    kernelState?: () => KernelState;
    phiState?: () => PhiState;
    sensorResult?: () => Promise<SensorResult>;
    worldModelState?: () => WorldModelState;
  }): void {
    if (sources.kernelState) this.getKernelState = sources.kernelState;
    if (sources.phiState) this.getPhiState = sources.phiState;
    if (sources.sensorResult) this.getSensorResult = sources.sensorResult;
    if (sources.worldModelState) this.getWorldModelState = sources.worldModelState;
  }

  /**
   * v10.8: Initialize real observation sources from MCP.
   * Call once to wire the gatherer to live system data.
   */
  initRealSources(): void {
    if (this.realSourcesInitialized) return;
    this.realSourcesInitialized = true;

    // Wire kernel state to process metrics
    this.getKernelState = () => {
      const mem = process.memoryUsage();
      const heapUsedRatio = mem.heapUsed / mem.heapTotal;
      // Energy = inverse of resource pressure (more heap used = less energy)
      const energy = Math.max(0, Math.min(1, 1 - heapUsedRatio));
      return {
        energy,
        state: 'running',
        taskStatus: 'running' as const,
      };
    };

    // Wire sensor result to actual MCP tool call history
    this.getSensorResult = async () => {
      // Use the last 10 MCP tool results for aggregate health
      const recent = this.mcpToolResults.slice(-10);
      if (recent.length === 0) {
        // No tool calls yet - try a lightweight probe
        try {
          const mcp = getMCPClient();
          const start = Date.now();
          await mcp.discoverAllTools();
          const latency = Date.now() - start;
          this.recordToolResult(true, latency);
          return { success: true, latency };
        } catch (e) {
          this.recordToolResult(false, 10000);
          return { success: false, latency: 10000, error: String(e) };
        }
      }
      const successRate = recent.filter(r => r.success).length / recent.length;
      const avgLatency = recent.reduce((sum, r) => sum + r.latency, 0) / recent.length;
      return {
        success: successRate > 0.5,
        latency: avgLatency,
        error: successRate <= 0.5 ? `Low success rate: ${(successRate * 100).toFixed(0)}%` : undefined,
      };
    };

    // v10.8.1: Wire PhiMonitor for real consciousness observation
    const phiMonitor = createPhiMonitor({ updateIntervalMs: 5000 });
    phiMonitor.start();
    this.getPhiState = () => {
      const level = phiMonitor.getCurrentLevel();
      const state = phiMonitor.getState();
      return { phi: level.phi, state };
    };

    // Wire world model to memory coherence (Neo4j connectivity if available)
    this.getWorldModelState = () => {
      // Base coherence on tool result consistency
      const recent = this.mcpToolResults.slice(-20);
      if (recent.length < 2) return { consistent: true, issues: 0 };
      const failures = recent.filter(r => !r.success).length;
      return {
        consistent: failures < recent.length * 0.3,
        issues: failures,
      };
    };
  }

  /**
   * v10.8: Record an MCP tool call result for observation tracking.
   * Called by the integration layer after each tool use.
   */
  recordToolResult(success: boolean, latency: number): void {
    this.mcpToolResults.push({ success, latency, timestamp: Date.now() });
    // Keep last 100 results
    if (this.mcpToolResults.length > 100) {
      this.mcpToolResults = this.mcpToolResults.slice(-100);
    }
  }

  /**
   * v10.8: Query Stripe balance for economic observation.
   * Returns cached value if queried recently (< 5 min).
   */
  private async getStripeBalance(): Promise<EconomicObs> {
    try {
      const mcp = getMCPClient();
      const result = await mcp.call('stripe' as any, 'get_balance', {});
      const balanceData = result?.data || result;
      // Parse Stripe balance response
      const available = Array.isArray(balanceData?.available)
        ? balanceData.available.reduce((sum: number, b: any) => sum + (b.amount || 0), 0) / 100
        : 0;
      this.lastStripeBalance = available;
      if (available <= 0) return 0;       // critical
      if (available < 10) return 1;       // low
      if (available < 100) return 2;      // stable
      return 3;                           // growing
    } catch {
      // Stripe not available, use economic integration fallback
      return 2; // stable default
    }
  }

  /**
   * Gather all observations from system components
   * v10.8: Now uses real MCP data when available
   */
  async gather(): Promise<Observation> {
    // Auto-init real sources if not configured
    if (!this.getKernelState && !this.getPhiState && !this.getSensorResult) {
      this.initRealSources();
    }

    // Get states from components (with defaults if not configured)
    const kernelState = this.getKernelState?.() ?? {
      energy: 0.5,
      state: 'idle',
      taskStatus: 'none' as const,
    };

    const phiState = this.getPhiState?.() ?? {
      phi: 0.5,
      state: 'aware' as const,
    };

    const sensorResult = this.getSensorResult
      ? await this.getSensorResult()
      : { success: true, latency: 100 };

    const worldModelState = this.getWorldModelState?.() ?? {
      consistent: true,
      issues: 0,
    };

    // v10.8: Get economic observation from Stripe (with fallback)
    let economicObs: EconomicObs = 2; // Default stable
    try {
      economicObs = await this.getStripeBalance();
    } catch {
      try {
        economicObs = await getEconomicIntegration().getDiscreteObservation() as EconomicObs;
      } catch {
        // Both failed, use default
      }
    }

    // Map to discrete observations
    return {
      energy: this.mapEnergy(kernelState.energy),
      phi: this.mapPhi(phiState),
      tool: this.mapTool(sensorResult),
      coherence: this.mapCoherence(worldModelState),
      task: this.mapTask(kernelState.taskStatus),
      economic: economicObs,
    };
  }

  /**
   * Create observation from raw values (for testing)
   */
  fromRaw(raw: {
    energy?: number;
    phi?: number;
    toolSuccess?: boolean;
    coherent?: boolean;
    taskStatus?: string;
  }): Observation {
    return {
      energy: this.mapEnergy(raw.energy ?? 0.5),
      phi: this.mapPhi({ phi: raw.phi ?? 0.5, state: 'aware' }),
      tool: raw.toolSuccess === undefined ? 1 : (raw.toolSuccess ? 2 : 0),
      coherence: raw.coherent === undefined ? 2 : (raw.coherent ? 2 : 0),
      task: this.mapTask(raw.taskStatus ?? 'none'),
    };
  }

  // ============================================================================
  // Mapping Functions
  // ============================================================================

  private mapEnergy(energy: number): EnergyObs {
    // Map 0.0-1.0 to 0-4
    if (energy < 0.1) return 0;      // depleted
    if (energy < 0.3) return 1;      // low
    if (energy < 0.6) return 2;      // medium
    if (energy < 0.85) return 3;     // high
    return 4;                        // full
  }

  private mapPhi(phiState: PhiState): PhiObs {
    // Map phi level and state to 0-3
    if (phiState.state === 'dormant' || phiState.phi < 0.1) return 0;
    if (phiState.phi < 0.4) return 1;  // low
    if (phiState.phi < 0.7) return 2;  // medium
    return 3;                          // high
  }

  private mapTool(result: SensorResult): ToolObs {
    // Map sensor result to 0-2
    if (!result.success) return 0;     // failed
    if (result.latency > 5000) return 1; // partial (slow)
    return 2;                          // success
  }

  private mapCoherence(state: WorldModelState): CoherenceObs {
    // Map world model consistency to 0-2
    if (!state.consistent || state.issues > 5) return 0;  // broken
    if (state.issues > 0) return 1;                       // degraded
    return 2;                                             // consistent
  }

  private mapTask(status?: string): TaskObs {
    switch (status) {
      case 'pending': return 1;
      case 'running': return 2;
      case 'completed': return 3;
      case 'failed': return 0;
      case 'none':
      default: return 0;
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

let gathererInstance: ObservationGatherer | null = null;

export function createObservationGatherer(): ObservationGatherer {
  return new ObservationGatherer();
}

export function getObservationGatherer(): ObservationGatherer {
  if (!gathererInstance) {
    gathererInstance = createObservationGatherer();
  }
  return gathererInstance;
}
