/**
 * Genesis Observatory UI - SSE Client
 *
 * Manages Server-Sent Events connection to the Genesis dashboard.
 * Provides real-time updates from the Genesis system via EventSource API.
 */

import type { SystemMetrics, EventData } from '../observability/dashboard.js';
import type { UIConfig, Subscriber, Unsubscriber } from './types.js';

// ============================================================================
// SSE Client
// ============================================================================

export class SSEClient {
  private config: UIConfig;
  private eventSource: EventSource | null = null;
  private metricsSubscribers: Set<Subscriber<SystemMetrics>> = new Set();
  private eventSubscribers: Set<Subscriber<EventData>> = new Set();
  private connectionSubscribers: Set<Subscriber<boolean>> = new Set();
  private connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private lastMetrics: SystemMetrics | null = null;

  constructor(config: UIConfig) {
    this.config = config;
  }

  // --------------------------------------------------------------------------
  // Connection Management
  // --------------------------------------------------------------------------

  /**
   * Connect to Genesis dashboard SSE stream
   */
  connect(): void {
    if (this.eventSource) {
      return;
    }

    if (this.config.enableSSE) {
      this.connectSSE();
    }

    // Start polling for metrics regardless of SSE
    this.startPolling();
  }

  /**
   * Connect to SSE endpoint
   */
  private connectSSE(): void {
    const url = `${this.config.dashboardUrl}/api/events`;

    try {
      this.eventSource = new EventSource(url);

      this.eventSource.onopen = () => {
        this.setConnected(true);
        this.clearReconnectTimer();
      };

      this.eventSource.onmessage = (e) => {
        try {
          const event: EventData = JSON.parse(e.data);
          this.notifyEventSubscribers(event);
        } catch (err) {
          console.error('[SSEClient] Failed to parse event:', err);
        }
      };

      this.eventSource.onerror = () => {
        this.setConnected(false);
        this.eventSource?.close();
        this.eventSource = null;

        if (this.config.autoReconnect) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.error('[SSEClient] Failed to create EventSource:', err);
      if (this.config.autoReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Start polling for metrics
   */
  private startPolling(): void {
    if (this.pollingTimer) {
      return;
    }

    // Fetch immediately
    this.fetchMetrics();

    // Then poll at interval
    this.pollingTimer = setInterval(() => {
      this.fetchMetrics();
    }, this.config.refreshInterval);
  }

  /**
   * Fetch metrics from dashboard
   */
  private async fetchMetrics(): Promise<void> {
    const url = `${this.config.dashboardUrl}/api/metrics`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const metrics: SystemMetrics = await response.json();
      this.lastMetrics = metrics;
      this.notifyMetricsSubscribers(metrics);

      // Update connection status based on successful fetch
      if (!this.connected) {
        this.setConnected(true);
      }
    } catch (err) {
      console.error('[SSEClient] Failed to fetch metrics:', err);
      this.setConnected(false);
    }
  }

  /**
   * Disconnect from dashboard
   */
  disconnect(): void {
    this.clearReconnectTimer();
    this.stopPolling();

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.setConnected(false);
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      if (this.config.enableSSE) {
        this.connectSSE();
      }
    }, this.config.reconnectDelay);
  }

  /**
   * Clear reconnect timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Stop polling
   */
  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /**
   * Set connection status
   */
  private setConnected(connected: boolean): void {
    if (this.connected !== connected) {
      this.connected = connected;
      this.notifyConnectionSubscribers(connected);
    }
  }

  // --------------------------------------------------------------------------
  // Subscription Management
  // --------------------------------------------------------------------------

  /**
   * Subscribe to metrics updates
   */
  onMetrics(subscriber: Subscriber<SystemMetrics>): Unsubscriber {
    this.metricsSubscribers.add(subscriber);

    // Immediately notify with last metrics if available
    if (this.lastMetrics) {
      subscriber(this.lastMetrics);
    }

    return () => {
      this.metricsSubscribers.delete(subscriber);
    };
  }

  /**
   * Subscribe to event stream
   */
  onEvent(subscriber: Subscriber<EventData>): Unsubscriber {
    this.eventSubscribers.add(subscriber);
    return () => {
      this.eventSubscribers.delete(subscriber);
    };
  }

  /**
   * Subscribe to connection status changes
   */
  onConnectionChange(subscriber: Subscriber<boolean>): Unsubscriber {
    this.connectionSubscribers.add(subscriber);

    // Immediately notify with current status
    subscriber(this.connected);

    return () => {
      this.connectionSubscribers.delete(subscriber);
    };
  }

  // --------------------------------------------------------------------------
  // Notification Helpers
  // --------------------------------------------------------------------------

  private notifyMetricsSubscribers(metrics: SystemMetrics): void {
    for (const subscriber of this.metricsSubscribers) {
      try {
        subscriber(metrics);
      } catch (err) {
        console.error('[SSEClient] Metrics subscriber error:', err);
      }
    }
  }

  private notifyEventSubscribers(event: EventData): void {
    for (const subscriber of this.eventSubscribers) {
      try {
        subscriber(event);
      } catch (err) {
        console.error('[SSEClient] Event subscriber error:', err);
      }
    }
  }

  private notifyConnectionSubscribers(connected: boolean): void {
    for (const subscriber of this.connectionSubscribers) {
      try {
        subscriber(connected);
      } catch (err) {
        console.error('[SSEClient] Connection subscriber error:', err);
      }
    }
  }

  // --------------------------------------------------------------------------
  // State Queries
  // --------------------------------------------------------------------------

  /**
   * Check if connected to dashboard
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get last received metrics
   */
  getLastMetrics(): SystemMetrics | null {
    return this.lastMetrics;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<UIConfig>): void {
    const oldUrl = this.config.dashboardUrl;
    const oldSSE = this.config.enableSSE;

    this.config = { ...this.config, ...config };

    // Reconnect if URL or SSE setting changed
    if (oldUrl !== this.config.dashboardUrl || oldSSE !== this.config.enableSSE) {
      this.disconnect();
      this.connect();
    }
  }
}

// ============================================================================
// Factory & Singleton
// ============================================================================

let sseClientInstance: SSEClient | null = null;

/**
 * Get or create SSE client singleton
 */
export function getSSEClient(config?: UIConfig): SSEClient {
  if (!sseClientInstance && config) {
    sseClientInstance = new SSEClient(config);
  } else if (!sseClientInstance) {
    throw new Error('SSEClient not initialized. Provide config on first call.');
  }
  return sseClientInstance;
}

/**
 * Create a new SSE client instance
 */
export function createSSEClient(config: UIConfig): SSEClient {
  return new SSEClient(config);
}

/**
 * Reset singleton
 */
export function resetSSEClient(): void {
  if (sseClientInstance) {
    sseClientInstance.disconnect();
    sseClientInstance = null;
  }
}
