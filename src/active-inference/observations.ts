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
   * Gather all observations from system components
   */
  async gather(): Promise<Observation> {
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

    // v9.3: Get economic observation
    let economicObs: EconomicObs = 2; // Default stable
    try {
      economicObs = await getEconomicIntegration().getDiscreteObservation() as EconomicObs;
    } catch {
      // Economic system not initialized, use default
    }

    // Map to discrete observations
    return {
      energy: this.mapEnergy(kernelState.energy),
      phi: this.mapPhi(phiState),
      tool: this.mapTool(sensorResult),
      coherence: this.mapCoherence(worldModelState),
      task: this.mapTask(kernelState.taskStatus),
      economic: economicObs, // v9.3
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
