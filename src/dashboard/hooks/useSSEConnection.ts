import { useEffect, useRef, useCallback } from 'react';
import { useGenesisStore } from '../stores/genesisStore';

// ============================================================================
// Genesis System Metrics Interface (from dashboard.ts)
// ============================================================================

interface SystemMetrics {
  timestamp: number;
  uptime: number;

  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };

  consciousness: {
    phi: number;
    state: string;
    integration: number;
  };

  kernel: {
    state: string;
    energy: number;
    cycles: number;
  };

  agents: {
    total: number;
    active: number;
    queued: number;
  };

  memory_system: {
    episodic: number;
    semantic: number;
    procedural: number;
    total: number;
  };

  llm: {
    totalRequests: number;
    totalCost: number;
    averageLatency: number;
    providers: string[];
  };

  mcp: {
    connectedServers: number;
    availableTools: number;
    totalCalls: number;
  };
}

// ============================================================================
// SSE Connection Hook - Connects to Real Genesis Dashboard
// ============================================================================

export function useSSEConnection(dashboardUrl: string) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number>(0);
  const pollingIntervalRef = useRef<number>(0);

  const {
    setConnected,
    updateConsciousness,
    updateNeuromod,
    updateKernel,
    updateAgents,
    updateEconomy,
    updateMemory,
    updateSelfImprovement,
    addModification,
    addLesson,
    addCodeQuery,
    addBuildOutput,
    addEvent
  } = useGenesisStore();

  // Map kernel state to consciousness state
  const mapKernelStateToConsciousnessState = (state: string): 'awake' | 'focused' | 'vigilant' | 'dreaming' | 'dormant' => {
    switch (state?.toLowerCase()) {
      case 'alert':
      case 'sensing':
      case 'thinking':
        return 'focused';
      case 'aware':
      case 'acting':
      case 'deciding':
        return 'awake';
      case 'vigilant':
      case 'reflecting':
        return 'vigilant';
      case 'drowsy':
      case 'dreaming':
        return 'dreaming';
      case 'dormant':
      case 'idle':
      case 'error':
        return 'dormant';
      default:
        return 'awake';
    }
  };

  // Handle metrics from /api/metrics endpoint
  const handleMetrics = useCallback((metrics: SystemMetrics) => {
    // Update consciousness
    if (metrics.consciousness) {
      updateConsciousness({
        phi: metrics.consciousness.phi ?? 0.5,
        state: mapKernelStateToConsciousnessState(metrics.consciousness.state),
        integration: metrics.consciousness.integration ?? 0.5,
        complexity: metrics.consciousness.phi ?? 0.5, // Use phi as complexity proxy
        trend: 'stable', // Will be updated by SSE events
      });
    }

    // Update kernel
    if (metrics.kernel) {
      updateKernel({
        mode: metrics.kernel.state ?? 'idle',
        level: 2, // Default level
        freeEnergy: metrics.kernel.energy ? (1 - metrics.kernel.energy) * 5 : 1.0, // Invert and scale
        predictionError: 0.1,
        levels: {
          l1: { active: true, load: metrics.kernel.energy ?? 0.5 },
          l2: { active: true, load: metrics.kernel.energy ?? 0.4 },
          l3: { active: metrics.agents?.active > 0, load: (metrics.agents?.active ?? 0) / Math.max(1, metrics.agents?.total ?? 1) },
          l4: { active: true, load: 0.2 },
        },
      });
    }

    // Update agents
    if (metrics.agents) {
      updateAgents({
        total: metrics.agents.total ?? 10,
        active: metrics.agents.active ?? 0,
        queued: metrics.agents.queued ?? 0,
        providers: metrics.llm?.providers ?? ['anthropic', 'openai'],
      });
    }

    // Update memory
    if (metrics.memory_system) {
      updateMemory({
        episodic: metrics.memory_system.episodic ?? 0,
        semantic: metrics.memory_system.semantic ?? 0,
        procedural: metrics.memory_system.procedural ?? 0,
        consolidationProgress: 0,
      });
    }

    // Update economy
    if ((metrics as any).economy) {
      const econ = (metrics as any).economy;
      updateEconomy({
        cash: econ.cash ?? 0,
        revenue: econ.revenue ?? 0,
        costs: econ.costs ?? 0,
        runway: econ.runway ?? 0,
        ness: econ.ness ?? 0.5,
        isReal: econ.isReal ?? false, // True when connected to real LLM costs
        totalCosts: econ.totalCosts ?? 0,
        totalRevenue: econ.totalRevenue ?? 0,
      });
    } else if (metrics.llm) {
      // Fallback: use LLM costs as proxy
      const currentEconomy = useGenesisStore.getState().economy;
      updateEconomy({
        cash: currentEconomy.cash,
        revenue: currentEconomy.revenue,
        costs: metrics.llm.totalCost ?? 0,
        runway: currentEconomy.runway,
        ness: currentEconomy.ness,
        isReal: false,
      });
    }
  }, [updateConsciousness, updateKernel, updateAgents, updateMemory, updateEconomy]);

  // Handle SSE events from /api/events endpoint
  const handleSSEEvent = useCallback((eventType: string, data: any) => {
    const [category, action] = eventType.split(':');

    switch (category) {
      case 'consciousness':
        if (action === 'phi_updated' || action === 'state_changed') {
          updateConsciousness({
            phi: data.phi ?? data.level?.rawPhi,
            state: mapKernelStateToConsciousnessState(data.state),
            integration: data.integration ?? data.integratedInfo,
            trend: data.trend ?? (data.phi > 0.5 ? 'up' : 'down'),
          });
        }
        addEvent({ type: eventType, data });
        break;

      case 'kernel':
        if (action === 'mode') {
          updateKernel({
            mode: data.mode,
          });
        }
        addEvent({ type: eventType, data });
        break;

      case 'neuromodulation':
        if (action === 'update' && data.levels) {
          updateNeuromod({
            dopamine: data.levels.dopamine ?? 0.5,
            serotonin: data.levels.serotonin ?? 0.5,
            norepinephrine: data.levels.norepinephrine ?? 0.3,
            cortisol: data.levels.cortisol ?? 0.2,
          });
        }
        addEvent({ type: eventType, data });
        break;

      case 'allostasis':
        // Allostasis regulation events affect kernel state
        if (action === 'regulation') {
          addEvent({ type: eventType, data });
        }
        break;

      case 'nociception':
        // Pain events - could affect UI state
        if (action === 'pain') {
          // Map pain level to cortisol
          const painToCortisol = {
            'none': 0.1,
            'discomfort': 0.3,
            'pain': 0.6,
            'agony': 0.9,
          };
          const cortisol = painToCortisol[data.level as keyof typeof painToCortisol] ?? 0.2;
          updateNeuromod({ cortisol });
          addEvent({ type: eventType, data });
        }
        break;

      case 'economy':
        if (action === 'update') {
          updateEconomy({
            cash: data.cash ?? 0,
            revenue: data.revenue ?? 0,
            costs: data.costs ?? 0,
            runway: data.runway ?? 0,
            ness: data.ness ?? 0.5,
            isReal: data.isReal ?? false,
            totalCosts: data.totalCosts ?? 0,
            totalRevenue: data.totalRevenue ?? 0,
          });
        }
        addEvent({ type: eventType, data });
        break;

      case 'selfimprovement':
        switch (action) {
          case 'cycle_started':
            updateSelfImprovement({ currentStage: 'observe', cycleEnabled: true });
            break;
          case 'stage_changed':
            updateSelfImprovement({ currentStage: data.stage ?? 'idle' });
            break;
          case 'proposal_created':
            updateSelfImprovement({
              currentProposal: data.proposal ?? null,
              currentStage: 'propose',
            });
            break;
          case 'sandbox_progress':
            updateSelfImprovement({
              sandboxPath: data.sandboxPath ?? null,
              sandboxProgress: data.steps ?? [],
              currentStage: 'apply',
            });
            break;
          case 'invariant_checked':
            updateSelfImprovement({
              invariantResults: data.results ?? [],
            });
            break;
          case 'build_output':
            addBuildOutput(data.line ?? '');
            break;
          case 'modification_applied':
            addModification({
              id: data.id ?? crypto.randomUUID(),
              timestamp: Date.now(),
              description: data.description ?? '',
              status: 'success',
              metrics: data.metrics,
              commitHash: data.commitHash,
            });
            updateSelfImprovement({
              currentStage: 'verify',
              currentProposal: null,
              phi: data.metrics?.after?.phi ?? 0.5,
              errorRate: data.metrics?.after?.errorRate ?? 0.05,
              memoryReuse: data.metrics?.after?.memoryReuse ?? 0.5,
            });
            break;
          case 'modification_failed':
            addModification({
              id: data.id ?? crypto.randomUUID(),
              timestamp: Date.now(),
              description: data.description ?? '',
              status: 'failed',
              reason: data.reason,
              rollbackHash: data.rollbackHash,
            });
            updateSelfImprovement({
              currentStage: 'idle',
              currentProposal: null,
            });
            break;
          case 'rollback_triggered':
            addModification({
              id: data.id ?? crypto.randomUUID(),
              timestamp: Date.now(),
              description: `Rollback: ${data.reason}`,
              status: 'rolled_back',
              rollbackHash: data.rollbackHash,
            });
            break;
          case 'metrics_updated':
            updateSelfImprovement({
              phi: data.phi ?? 0.5,
              errorRate: data.errorRate ?? 0.05,
              memoryReuse: data.memoryReuse ?? 0.5,
              responseTime: data.responseTime ?? 100,
            });
            break;
        }
        addEvent({ type: eventType, data });
        break;

      case 'coderag':
        switch (action) {
          case 'query_executed':
            addCodeQuery({
              query: data.query ?? '',
              results: data.resultsCount ?? 0,
              timestamp: Date.now(),
              file: data.topFile,
            });
            break;
          case 'file_analyzed':
            updateSelfImprovement({
              analyzingFile: data.file ?? null,
              analyzingProgress: data.progress ?? 0,
            });
            break;
          case 'understanding_updated':
            updateSelfImprovement({
              moduleUnderstanding: data.modules ?? {},
              analyzingFile: null,
              analyzingProgress: 100,
            });
            break;
        }
        addEvent({ type: eventType, data });
        break;

      case 'learning':
        switch (action) {
          case 'lesson_stored':
            addLesson({
              id: data.id ?? crypto.randomUUID(),
              content: data.content ?? '',
              type: data.type ?? 'positive',
              confidence: data.confidence ?? 0.5,
              appliedCount: data.appliedCount ?? 0,
              retention: data.retention ?? 1.0,
              category: data.category ?? 'performance',
            });
            break;
          case 'lesson_recalled':
            // Update existing lesson's appliedCount
            break;
          case 'retention_decayed':
            // Update lesson retention values
            break;
        }
        addEvent({ type: eventType, data });
        break;

      default:
        // Generic event
        addEvent({ type: eventType, data });
    }
  }, [updateConsciousness, updateKernel, updateNeuromod, updateEconomy, updateSelfImprovement, addModification, addLesson, addCodeQuery, addBuildOutput, addEvent]);

  useEffect(() => {
    let mounted = true;

    // Fetch metrics via polling
    const fetchMetrics = async () => {
      if (!mounted) return;

      try {
        const response = await fetch(`${dashboardUrl}/api/metrics`);
        if (response.ok) {
          const metrics = await response.json();
          handleMetrics(metrics);
          setConnected(true);
        }
      } catch (err) {
        console.warn('[Metrics] Failed to fetch:', err);
      }
    };

    // Connect to SSE
    const connectSSE = () => {
      if (!mounted) return;

      try {
        // Close existing connection
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }

        // Create new SSE connection to /api/events
        const eventSource = new EventSource(`${dashboardUrl}/api/events`);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          if (!mounted) return;
          console.log('[SSE] Connected to Genesis at', dashboardUrl);
          setConnected(true);
        };

        // Handle generic message events
        eventSource.onmessage = (event) => {
          if (!mounted) return;

          try {
            const data = JSON.parse(event.data);

            // Check if it's a typed event
            if (data.type && data.data) {
              handleSSEEvent(data.type, data.data);
            } else if (data.type && data.payload) {
              handleSSEEvent(data.type, data.payload);
            }
          } catch (err) {
            console.error('[SSE] Failed to parse message:', err);
          }
        };

        // Handle specific named events
        ['consciousness', 'kernel', 'neuromodulation', 'allostasis', 'nociception', 'metrics', 'selfimprovement', 'coderag', 'learning'].forEach(category => {
          eventSource.addEventListener(category, (event: MessageEvent) => {
            if (!mounted) return;
            try {
              const data = JSON.parse(event.data);
              handleSSEEvent(`${category}:update`, data);
            } catch (err) {
              console.error(`[SSE] Failed to parse ${category} event:`, err);
            }
          });
        });

        eventSource.onerror = (error) => {
          console.error('[SSE] Connection error:', error);
          setConnected(false);
          eventSourceRef.current?.close();

          // Reconnect after delay
          reconnectTimeoutRef.current = window.setTimeout(() => {
            if (mounted) {
              console.log('[SSE] Attempting reconnection...');
              connectSSE();
            }
          }, 3000);
        };

      } catch (err) {
        console.error('[SSE] Failed to connect:', err);
        setConnected(false);

        // Retry connection
        reconnectTimeoutRef.current = window.setTimeout(() => {
          if (mounted) connectSSE();
        }, 5000);
      }
    };

    // Initial fetch
    fetchMetrics();

    // Start polling (fallback for when SSE doesn't send frequent updates)
    pollingIntervalRef.current = window.setInterval(fetchMetrics, 2000);

    // Connect SSE for real-time events
    connectSSE();

    return () => {
      mounted = false;

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }

      setConnected(false);
    };
  }, [dashboardUrl, setConnected, handleMetrics, handleSSEEvent]);
}

// ============================================================================
// Fetch current state (one-shot)
// ============================================================================

export async function fetchGenesisState(dashboardUrl: string): Promise<SystemMetrics> {
  const response = await fetch(`${dashboardUrl}/api/metrics`);
  if (!response.ok) {
    throw new Error(`Failed to fetch metrics: HTTP ${response.status}`);
  }
  return response.json();
}
