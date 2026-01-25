/**
 * Genesis Observatory UI - State Mapper
 *
 * Maps raw Genesis system metrics to UI-friendly data structures.
 * Computes derived metrics, trends, and categorizations.
 */

import type { SystemMetrics, EventData } from '../observability/dashboard.js';
import type {
  UIState,
  ComputedMetrics,
  PhiOrbData,
  NeuromodDisplayData,
  EconomyCardData,
  AgentNetworkData,
  KernelState,
  MemoryState,
  PainState,
  UIEvent,
  AgentNode,
  AgentConnection,
} from './types.js';

// ============================================================================
// State Mapper
// ============================================================================

export class StateMapper {
  private previousPhi: number = 0;
  private eventHistory: UIEvent[] = [];
  private maxEventHistory = 100;

  /**
   * Map SystemMetrics to complete UIState
   */
  mapToUIState(
    metrics: SystemMetrics | null,
    events: EventData[],
    connected: boolean,
    error: string | null = null
  ): UIState {
    return {
      timestamp: Date.now(),
      connected,
      loading: !metrics && !error,
      error,
      metrics,
      events: this.mapEvents(events),
      computed: metrics ? this.computeMetrics(metrics) : this.getDefaultComputed(),
    };
  }

  /**
   * Compute derived metrics from system state
   */
  private computeMetrics(metrics: SystemMetrics): ComputedMetrics {
    return {
      phiQuality: this.computePhiQuality(metrics.consciousness.phi),
      neuromodTone: this.computeNeuromodTone(metrics),
      economicHealth: this.computeEconomicHealth(metrics),
      systemHealth: this.computeSystemHealth(metrics),
      attentionPriority: this.computeAttentionPriority(metrics),
    };
  }

  /**
   * Map raw metrics to Phi Orb visualization data
   */
  mapToPhiOrb(metrics: SystemMetrics | null): PhiOrbData {
    if (!metrics) {
      return this.getDefaultPhiOrb();
    }

    const phi = metrics.consciousness.phi;
    const state = metrics.consciousness.state;
    const integration = metrics.consciousness.integration;

    const trend = this.computePhiTrend(phi);
    const quality = this.computePhiQuality(phi);
    const color = this.getPhiColor(phi);
    const pulseRate = this.getPhiPulseRate(phi, quality);

    this.previousPhi = phi;

    return {
      phi,
      state,
      integration,
      trend,
      quality,
      color,
      pulseRate,
    };
  }

  /**
   * Map raw metrics to Neuromodulation display data
   */
  mapToNeuromod(metrics: SystemMetrics | null): NeuromodDisplayData {
    if (!metrics) {
      return this.getDefaultNeuromod();
    }

    // Extract neuromodulator levels (assumed to be available in consciousness state)
    // Since SystemMetrics doesn't have neuromod directly, we infer from consciousness state
    const { state } = metrics.consciousness;
    const levels = this.inferNeuromodLevels(state);

    return {
      ...levels,
      dominantState: this.computeNeuromodTone(metrics),
      explorationRate: this.computeExplorationRate(levels.dopamine, levels.cortisol),
      temporalDiscount: this.computeTemporalDiscount(levels.serotonin),
      precisionGain: this.computePrecisionGain(levels.norepinephrine),
      riskTolerance: this.computeRiskTolerance(levels.cortisol),
    };
  }

  /**
   * Map raw metrics to Economy card data
   */
  mapToEconomy(metrics: SystemMetrics | null): EconomyCardData {
    if (!metrics) {
      return this.getDefaultEconomy();
    }

    const { totalRequests, totalCost } = metrics.llm;
    const totalRevenue = totalRequests * 0.005; // Estimate revenue from requests
    const netIncome = totalRevenue - totalCost;
    const roi = totalCost > 0 ? (netIncome / totalCost) * 100 : 0;

    // NESS deviation would come from actual NESS monitor if available
    const nessDeviation = 0; // Placeholder
    const sustainable = netIncome >= 0 && nessDeviation < 0.3;

    const monthlyBurnRate = totalCost * 30; // Estimate monthly from current
    const runway = netIncome < 0 && monthlyBurnRate > 0
      ? Math.abs(netIncome) / (monthlyBurnRate / 30)
      : Infinity;

    const status = sustainable ? 'sustainable' : nessDeviation > 0.6 ? 'critical' : 'warning';

    return {
      totalRevenue,
      totalCost,
      netIncome,
      roi,
      sustainable,
      nessDeviation,
      runway,
      monthlyBurnRate,
      status,
    };
  }

  /**
   * Map raw metrics to Agent Network data
   */
  mapToAgentNetwork(metrics: SystemMetrics | null): AgentNetworkData {
    if (!metrics) {
      return this.getDefaultAgentNetwork();
    }

    const { total, active, queued } = metrics.agents;
    const { totalRequests, averageLatency, totalCost, providers } = metrics.llm;
    const { connectedServers, availableTools, totalCalls } = metrics.mcp;

    const utilization = total > 0 ? active / total : 0;

    // Build agent network graph
    const nodes: AgentNode[] = [
      {
        id: 'brain',
        type: 'agent',
        status: active > 0 ? 'active' : 'idle',
        label: 'Brain',
        metadata: { active, queued },
      },
      ...providers.map((provider, i) => ({
        id: `llm-${provider}`,
        type: 'llm' as const,
        status: 'active' as const,
        label: provider,
        metadata: { requests: Math.floor(totalRequests / providers.length) },
      })),
      ...Array.from({ length: connectedServers }, (_, i) => ({
        id: `mcp-${i}`,
        type: 'mcp' as const,
        status: 'active' as const,
        label: `MCP Server ${i + 1}`,
        metadata: { tools: Math.floor(availableTools / connectedServers) },
      })),
    ];

    const connections: AgentConnection[] = [
      ...providers.map((provider) => ({
        source: 'brain',
        target: `llm-${provider}`,
        type: 'request' as const,
        strength: 0.8,
      })),
      ...Array.from({ length: connectedServers }, (_, i) => ({
        source: 'brain',
        target: `mcp-${i}`,
        type: 'request' as const,
        strength: 0.6,
      })),
    ];

    return {
      totalAgents: total,
      activeAgents: active,
      queuedTasks: queued,
      utilization,
      avgLatency: averageLatency,
      totalRequests,
      totalCost,
      providers,
      nodes,
      connections,
    };
  }

  /**
   * Map raw metrics to Kernel state
   */
  mapToKernel(metrics: SystemMetrics | null): KernelState {
    if (!metrics) {
      return this.getDefaultKernel();
    }

    const { state, energy, cycles } = metrics.kernel;
    const mode = state as KernelState['mode'];

    return {
      mode,
      energy,
      cycles,
      uptime: metrics.uptime,
      freeEnergy: energy,
      predictionError: 0, // Would come from FEK if available
      stable: energy < 2.0,
      modeColor: this.getKernelModeColor(mode),
    };
  }

  /**
   * Map raw metrics to Memory state
   */
  mapToMemory(metrics: SystemMetrics | null): MemoryState {
    if (!metrics) {
      return this.getDefaultMemory();
    }

    const { episodic, semantic, procedural, total } = metrics.memory_system;

    return {
      episodic,
      semantic,
      procedural,
      total,
      workingMemoryLoad: total > 0 ? episodic / total : 0,
      consolidationActive: false,
      dreamMode: false,
    };
  }

  /**
   * Map raw metrics to Pain state
   */
  mapToPain(metrics: SystemMetrics | null): PainState {
    if (!metrics) {
      return this.getDefaultPain();
    }

    // Pain data would come from nociception system if available
    return {
      currentLevel: 0,
      chronicPain: 0,
      threshold: 0.8,
      inAgony: false,
      recentStimuli: [],
    };
  }

  // --------------------------------------------------------------------------
  // Event Mapping
  // --------------------------------------------------------------------------

  /**
   * Map raw events to UI events
   */
  private mapEvents(events: EventData[]): UIEvent[] {
    return events.map((event) => this.mapEvent(event));
  }

  /**
   * Map single event to UI event
   */
  private mapEvent(event: EventData): UIEvent {
    return {
      ...event,
      severity: this.computeEventSeverity(event),
      category: this.computeEventCategory(event),
      displayText: this.computeEventDisplayText(event),
    };
  }

  /**
   * Compute event severity from event type
   */
  private computeEventSeverity(event: EventData): UIEvent['severity'] {
    const type = event.type.toLowerCase();

    if (type.includes('error') || type.includes('critical') || type.includes('agony')) {
      return 'critical';
    }
    if (type.includes('warn') || type.includes('threat') || type.includes('pain')) {
      return 'warning';
    }
    if (type.includes('success') || type.includes('complete')) {
      return 'info';
    }

    return 'info';
  }

  /**
   * Compute event category from event type
   */
  private computeEventCategory(event: EventData): UIEvent['category'] {
    const type = event.type.toLowerCase();

    if (type.includes('kernel') || type.includes('fek') || type.includes('mode')) {
      return 'kernel';
    }
    if (type.includes('phi') || type.includes('consciousness') || type.includes('awareness')) {
      return 'consciousness';
    }
    if (type.includes('economy') || type.includes('revenue') || type.includes('cost') || type.includes('ness')) {
      return 'economy';
    }
    if (type.includes('agent') || type.includes('llm') || type.includes('mcp')) {
      return 'agent';
    }

    return 'system';
  }

  /**
   * Compute event display text
   */
  private computeEventDisplayText(event: EventData): string {
    return `[${event.type}] ${JSON.stringify(event.data).slice(0, 100)}`;
  }

  // --------------------------------------------------------------------------
  // Computation Helpers
  // --------------------------------------------------------------------------

  private computePhiQuality(phi: number): PhiOrbData['quality'] {
    if (phi >= 0.8) return 'excellent';
    if (phi >= 0.5) return 'good';
    if (phi >= 0.3) return 'degraded';
    return 'critical';
  }

  private computePhiTrend(phi: number): PhiOrbData['trend'] {
    const delta = phi - this.previousPhi;
    if (delta > 0.05) return 'rising';
    if (delta < -0.05) return 'falling';
    return 'stable';
  }

  private getPhiColor(phi: number): string {
    if (phi >= 0.8) return '#00ff88';
    if (phi >= 0.5) return '#88ff00';
    if (phi >= 0.3) return '#ffaa00';
    return '#ff4444';
  }

  private getPhiPulseRate(phi: number, quality: string): number {
    const baseRate = 2000;
    if (quality === 'critical') return baseRate * 0.5;
    if (quality === 'degraded') return baseRate * 0.75;
    if (quality === 'excellent') return baseRate * 1.5;
    return baseRate;
  }

  private computeNeuromodTone(metrics: SystemMetrics): NeuromodDisplayData['dominantState'] {
    const state = metrics.consciousness.state.toLowerCase();

    if (state.includes('threat') || state.includes('critical')) return 'threat';
    if (state.includes('stress') || state.includes('vigilant')) return 'stressed';
    if (state.includes('focus')) return 'focused';
    if (state.includes('excit') || state.includes('reward')) return 'excited';
    return 'calm';
  }

  private inferNeuromodLevels(state: string): {
    dopamine: number;
    serotonin: number;
    norepinephrine: number;
    cortisol: number;
  } {
    // Infer neuromodulator levels from consciousness state
    // This is a simplified heuristic until we have direct access
    const s = state.toLowerCase();

    return {
      dopamine: s.includes('reward') || s.includes('excit') ? 0.7 : 0.5,
      serotonin: s.includes('calm') || s.includes('stable') ? 0.7 : 0.4,
      norepinephrine: s.includes('focus') || s.includes('vigilant') ? 0.7 : 0.4,
      cortisol: s.includes('threat') || s.includes('critical') ? 0.8 : 0.3,
    };
  }

  private computeExplorationRate(dopamine: number, cortisol: number): number {
    return 0.5 + dopamine * 1.0 - cortisol * 0.3;
  }

  private computeTemporalDiscount(serotonin: number): number {
    return 0.99 - (1 - serotonin) * 0.3;
  }

  private computePrecisionGain(norepinephrine: number): number {
    return 0.5 + norepinephrine * 1.5;
  }

  private computeRiskTolerance(cortisol: number): number {
    return Math.max(0.1, 1.0 - cortisol * 0.8);
  }

  private computeEconomicHealth(metrics: SystemMetrics): ComputedMetrics['economicHealth'] {
    const { totalCost } = metrics.llm;
    const totalRevenue = metrics.llm.totalRequests * 0.005;
    const netIncome = totalRevenue - totalCost;

    if (netIncome >= 0) return 'sustainable';
    if (netIncome > -100) return 'warning';
    return 'critical';
  }

  private computeSystemHealth(metrics: SystemMetrics): ComputedMetrics['systemHealth'] {
    const { heapUsed, heapTotal } = metrics.memory;
    const heapUsage = heapUsed / heapTotal;

    if (heapUsage > 0.9) return 'critical';
    if (heapUsage > 0.7) return 'degraded';
    return 'nominal';
  }

  private computeAttentionPriority(metrics: SystemMetrics): string | null {
    // Determine what requires attention
    const { heapUsed, heapTotal } = metrics.memory;
    if (heapUsed / heapTotal > 0.9) return 'Memory pressure critical';

    if (metrics.agents.queued > 10) return `${metrics.agents.queued} tasks queued`;

    if (metrics.consciousness.phi < 0.3) return 'Consciousness degraded';

    return null;
  }

  private getKernelModeColor(mode: KernelState['mode']): string {
    const colors = {
      dormant: '#666666',
      awake: '#00ff88',
      focused: '#0088ff',
      vigilant: '#ffaa00',
      critical: '#ff4444',
    };
    return colors[mode] || '#888888';
  }

  // --------------------------------------------------------------------------
  // Default States
  // --------------------------------------------------------------------------

  private getDefaultComputed(): ComputedMetrics {
    return {
      phiQuality: 'good',
      neuromodTone: 'calm',
      economicHealth: 'sustainable',
      systemHealth: 'nominal',
      attentionPriority: null,
    };
  }

  private getDefaultPhiOrb(): PhiOrbData {
    return {
      phi: 0.5,
      state: 'unknown',
      integration: 0.5,
      trend: 'stable',
      quality: 'good',
      color: '#88ff00',
      pulseRate: 2000,
    };
  }

  private getDefaultNeuromod(): NeuromodDisplayData {
    return {
      dopamine: 0.5,
      serotonin: 0.5,
      norepinephrine: 0.5,
      cortisol: 0.3,
      dominantState: 'calm',
      explorationRate: 0.5,
      temporalDiscount: 0.9,
      precisionGain: 1.0,
      riskTolerance: 0.7,
    };
  }

  private getDefaultEconomy(): EconomyCardData {
    return {
      totalRevenue: 0,
      totalCost: 0,
      netIncome: 0,
      roi: 0,
      sustainable: true,
      nessDeviation: 0,
      runway: Infinity,
      monthlyBurnRate: 0,
      status: 'sustainable',
    };
  }

  private getDefaultAgentNetwork(): AgentNetworkData {
    return {
      totalAgents: 0,
      activeAgents: 0,
      queuedTasks: 0,
      utilization: 0,
      avgLatency: 0,
      totalRequests: 0,
      totalCost: 0,
      providers: [],
      nodes: [],
      connections: [],
    };
  }

  private getDefaultKernel(): KernelState {
    return {
      mode: 'dormant',
      energy: 0,
      cycles: 0,
      uptime: 0,
      freeEnergy: 0,
      predictionError: 0,
      stable: true,
      modeColor: '#666666',
    };
  }

  private getDefaultMemory(): MemoryState {
    return {
      episodic: 0,
      semantic: 0,
      procedural: 0,
      total: 0,
      workingMemoryLoad: 0,
      consolidationActive: false,
      dreamMode: false,
    };
  }

  private getDefaultPain(): PainState {
    return {
      currentLevel: 0,
      chronicPain: 0,
      threshold: 0.8,
      inAgony: false,
      recentStimuli: [],
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

let mapperInstance: StateMapper | null = null;

export function getStateMapper(): StateMapper {
  if (!mapperInstance) {
    mapperInstance = new StateMapper();
  }
  return mapperInstance;
}

export function createStateMapper(): StateMapper {
  return new StateMapper();
}

export function resetStateMapper(): void {
  mapperInstance = null;
}
