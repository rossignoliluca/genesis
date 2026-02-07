import { useEffect, useRef } from 'react';
import { useGenesisStore } from '../stores/genesisStore';

// ============================================================================
// SSE Connection Hook
// ============================================================================

export function useSSEConnection(dashboardUrl: string) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number>(0);
  const { setConnected, updateState, updateConsciousness, updateNeuromod, updateKernel, updateAgents, updateEconomy, addEvent } = useGenesisStore();

  useEffect(() => {
    let mounted = true;

    const connect = () => {
      if (!mounted) return;

      try {
        // Close existing connection
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }

        // Create new SSE connection
        const eventSource = new EventSource(`${dashboardUrl}/events`);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          if (!mounted) return;
          console.log('[SSE] Connected to Genesis dashboard');
          setConnected(true);
        };

        eventSource.onmessage = (event) => {
          if (!mounted) return;

          try {
            const data = JSON.parse(event.data);
            handleMessage(data);
          } catch (err) {
            console.error('[SSE] Failed to parse message:', err);
          }
        };

        eventSource.onerror = (error) => {
          console.error('[SSE] Connection error:', error);
          setConnected(false);

          // Reconnect after delay
          reconnectTimeoutRef.current = window.setTimeout(() => {
            if (mounted) {
              console.log('[SSE] Attempting reconnection...');
              connect();
            }
          }, 3000);
        };

        // Handle specific event types
        eventSource.addEventListener('metrics', (event) => {
          if (!mounted) return;
          try {
            const metrics = JSON.parse(event.data);
            handleMetrics(metrics);
          } catch (err) {
            console.error('[SSE] Failed to parse metrics:', err);
          }
        });

        eventSource.addEventListener('event', (event) => {
          if (!mounted) return;
          try {
            const eventData = JSON.parse(event.data);
            addEvent(eventData);
          } catch (err) {
            console.error('[SSE] Failed to parse event:', err);
          }
        });

      } catch (err) {
        console.error('[SSE] Failed to connect:', err);
        setConnected(false);

        // Retry connection
        reconnectTimeoutRef.current = window.setTimeout(() => {
          if (mounted) connect();
        }, 5000);
      }
    };

    const handleMessage = (data: any) => {
      if (data.type === 'metrics') {
        handleMetrics(data.payload);
      } else if (data.type === 'event') {
        addEvent(data.payload);
      }
    };

    const handleMetrics = (metrics: any) => {
      // Map metrics to store state
      if (metrics.consciousness) {
        updateConsciousness({
          phi: metrics.consciousness.phi ?? 0.5,
          state: metrics.consciousness.state ?? 'awake',
          integration: metrics.consciousness.integration ?? 0.5,
        });
      }

      if (metrics.neuromodulation) {
        updateNeuromod({
          dopamine: metrics.neuromodulation.dopamine ?? 0.5,
          serotonin: metrics.neuromodulation.serotonin ?? 0.5,
          norepinephrine: metrics.neuromodulation.norepinephrine ?? 0.3,
          cortisol: metrics.neuromodulation.cortisol ?? 0.2,
        });
      }

      if (metrics.kernel) {
        updateKernel({
          mode: metrics.kernel.mode ?? 'awake',
          freeEnergy: metrics.kernel.freeEnergy ?? 1.0,
          predictionError: metrics.kernel.predictionError ?? 0.1,
        });
      }

      if (metrics.agents) {
        updateAgents({
          total: metrics.agents.total ?? 10,
          active: metrics.agents.active ?? 0,
          queued: metrics.agents.queued ?? 0,
          providers: metrics.agents.providers ?? [],
        });
      }

      if (metrics.economy) {
        updateEconomy({
          cash: metrics.economy.cash ?? 0,
          revenue: metrics.economy.revenue ?? 0,
          costs: metrics.economy.costs ?? 0,
          runway: metrics.economy.runway ?? 0,
          ness: metrics.economy.ness ?? 0.5,
        });
      }
    };

    // Initial connection
    connect();

    return () => {
      mounted = false;

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      setConnected(false);
    };
  }, [dashboardUrl, setConnected, updateConsciousness, updateNeuromod, updateKernel, updateAgents, updateEconomy, addEvent]);
}

// ============================================================================
// Fetch current state (one-shot)
// ============================================================================

export async function fetchGenesisState(dashboardUrl: string): Promise<any> {
  const response = await fetch(`${dashboardUrl}/api/metrics`);
  if (!response.ok) {
    throw new Error(`Failed to fetch metrics: HTTP ${response.status}`);
  }
  return response.json();
}
