/**
 * Genesis Observatory UI - Main Entry Point
 *
 * Framework-agnostic TypeScript UI system for Genesis.
 * Connects to SSE dashboard and provides real-time state visualization.
 *
 * Usage:
 *
 *   import { createObservatory } from './ui';
 *
 *   const observatory = createObservatory({
 *     dashboardUrl: 'http://localhost:9876',
 *   });
 *
 *   observatory.connect();
 *
 *   observatory.subscribe((state) => {
 *     console.log('Phi:', state.computed.phiQuality);
 *     console.log('Economy:', state.computed.economicHealth);
 *   });
 *
 * Components can be used individually or via the Observatory:
 *
 *   import { getPhiOrb, getNeuromodDisplay } from './ui/components';
 *
 *   const phiOrb = getPhiOrb();
 *   phiOrb.subscribe((data) => {
 *     console.log('φ =', data.phi);
 *   });
 */

// ============================================================================
// Core Exports
// ============================================================================

export type {
  UIState,
  UIConfig,
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
  Subscriber,
  Unsubscriber,
  Observable,
} from './types.js';

export { DEFAULT_UI_CONFIG } from './types.js';

// ============================================================================
// Client & Mapper Exports
// ============================================================================

export {
  SSEClient,
  getSSEClient,
  createSSEClient,
  resetSSEClient,
} from './sse-client.js';

export {
  StateMapper,
  getStateMapper,
  createStateMapper,
  resetStateMapper,
} from './state-mapper.js';

// ============================================================================
// Component Exports
// ============================================================================

export {
  PhiOrb,
  getPhiOrb,
  createPhiOrb,
  resetPhiOrb,
  generatePhiOrbPath,
  generatePhiParticles,
  getPhiGradient,
} from './components/phi-orb.js';

export {
  NeuromodDisplay,
  getNeuromodDisplay,
  createNeuromodDisplay,
  resetNeuromodDisplay,
  generateNeuromodGaugePath,
} from './components/neuromod-display.js';

export {
  EconomyCard,
  getEconomyCard,
  createEconomyCard,
  resetEconomyCard,
  generateSparklinePath,
  getNESSProgressBar,
} from './components/economy-card.js';

export {
  AgentNetwork,
  getAgentNetwork,
  createAgentNetwork,
  resetAgentNetwork,
  generatePulseAnimation,
  calculateForceLayout,
} from './components/agent-network.js';

// ============================================================================
// Observatory - Main Orchestrator
// ============================================================================

import type { SystemMetrics, EventData } from '../observability/dashboard.js';
import type { UIState, UIConfig, Subscriber, Unsubscriber } from './types.js';
import { DEFAULT_UI_CONFIG } from './types.js';
import { SSEClient } from './sse-client.js';
import { StateMapper } from './state-mapper.js';
import { PhiOrb } from './components/phi-orb.js';
import { NeuromodDisplay } from './components/neuromod-display.js';
import { EconomyCard } from './components/economy-card.js';
import { AgentNetwork } from './components/agent-network.js';

/**
 * Genesis Observatory - Main UI orchestrator
 *
 * Connects to Genesis dashboard, manages state, and provides
 * unified access to all visualization components.
 */
export class Observatory {
  private config: UIConfig;
  private sseClient: SSEClient;
  private stateMapper: StateMapper;
  private currentState: UIState;
  private subscribers: Set<Subscriber<UIState>> = new Set();

  // Components
  public readonly phiOrb: PhiOrb;
  public readonly neuromod: NeuromodDisplay;
  public readonly economy: EconomyCard;
  public readonly agents: AgentNetwork;

  constructor(config?: Partial<UIConfig>) {
    this.config = { ...DEFAULT_UI_CONFIG, ...config };
    this.sseClient = new SSEClient(this.config);
    this.stateMapper = new StateMapper();

    // Initialize components
    this.phiOrb = new PhiOrb();
    this.neuromod = new NeuromodDisplay();
    this.economy = new EconomyCard();
    this.agents = new AgentNetwork();

    // Initialize state
    this.currentState = this.stateMapper.mapToUIState(null, [], false);

    // Wire up SSE client
    this.setupSSEHandlers();
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Connect to Genesis dashboard
   */
  connect(): void {
    this.sseClient.connect();
  }

  /**
   * Disconnect from Genesis dashboard
   */
  disconnect(): void {
    this.sseClient.disconnect();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.sseClient.isConnected();
  }

  // --------------------------------------------------------------------------
  // State Management
  // --------------------------------------------------------------------------

  /**
   * Get current UI state
   */
  getState(): UIState {
    return { ...this.currentState };
  }

  /**
   * Subscribe to state updates
   */
  subscribe(subscriber: Subscriber<UIState>): Unsubscriber {
    this.subscribers.add(subscriber);

    // Immediately notify with current state
    subscriber(this.currentState);

    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<UIConfig>): void {
    this.config = { ...this.config, ...config };
    this.sseClient.updateConfig(this.config);
  }

  // --------------------------------------------------------------------------
  // Component Access
  // --------------------------------------------------------------------------

  /**
   * Get phi orb component
   */
  getPhiOrb(): PhiOrb {
    return this.phiOrb;
  }

  /**
   * Get neuromodulation display component
   */
  getNeuromodDisplay(): NeuromodDisplay {
    return this.neuromod;
  }

  /**
   * Get economy card component
   */
  getEconomyCard(): EconomyCard {
    return this.economy;
  }

  /**
   * Get agent network component
   */
  getAgentNetwork(): AgentNetwork {
    return this.agents;
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private setupSSEHandlers(): void {
    // Handle metrics updates
    this.sseClient.onMetrics((metrics) => {
      this.handleMetricsUpdate(metrics);
    });

    // Handle connection status changes
    this.sseClient.onConnectionChange((connected) => {
      this.currentState = {
        ...this.currentState,
        connected,
        error: connected ? null : 'Disconnected from dashboard',
      };
      this.notifySubscribers();
    });
  }

  private handleMetricsUpdate(metrics: SystemMetrics): void {
    // Update state mapper
    this.currentState = this.stateMapper.mapToUIState(
      metrics,
      this.currentState.events,
      this.sseClient.isConnected()
    );

    // Update components
    this.phiOrb.update(metrics);
    this.neuromod.update(metrics);
    this.economy.update(metrics);
    this.agents.update(metrics);

    // Notify subscribers
    this.notifySubscribers();
  }

  private notifySubscribers(): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(this.currentState);
      } catch (err) {
        console.error('[Observatory] Subscriber error:', err);
      }
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new Observatory instance
 */
export function createObservatory(config?: Partial<UIConfig>): Observatory {
  return new Observatory(config);
}

let observatoryInstance: Observatory | null = null;

/**
 * Get or create global Observatory instance
 */
export function getObservatory(config?: Partial<UIConfig>): Observatory {
  if (!observatoryInstance) {
    observatoryInstance = new Observatory(config);
  }
  return observatoryInstance;
}

/**
 * Reset global Observatory instance
 */
export function resetObservatory(): void {
  if (observatoryInstance) {
    observatoryInstance.disconnect();
    observatoryInstance = null;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick connect to Genesis dashboard and get state stream
 */
export function connectToGenesis(
  dashboardUrl: string = 'http://localhost:9876'
): Observatory {
  const observatory = getObservatory({ dashboardUrl });
  observatory.connect();
  return observatory;
}

/**
 * Get current Genesis state (snapshot)
 */
export async function getGenesisState(
  dashboardUrl: string = 'http://localhost:9876'
): Promise<UIState> {
  const response = await fetch(`${dashboardUrl}/api/metrics`);
  if (!response.ok) {
    throw new Error(`Failed to fetch metrics: HTTP ${response.status}`);
  }

  const metrics: SystemMetrics = await response.json();
  const mapper = new StateMapper();
  return mapper.mapToUIState(metrics, [], true);
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  createObservatory,
  getObservatory,
  connectToGenesis,
  getGenesisState,
};
