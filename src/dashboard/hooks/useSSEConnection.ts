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
    updateActiveInference,
    updateNociception,
    updateAllostasis,
    updateWorldModel,
    updateDaemon,
    updateFinance,
    updateRevenue,
    updateContent,
    updateSwarm,
    updateHealing,
    updateGrounding,
    addModification,
    addLesson,
    addCodeQuery,
    addBuildOutput,
    addPainStimulus,
    addWorldPrediction,
    addConsistencyViolation,
    addDaemonTask,
    addFinancePosition,
    addTradingSignal,
    addRevenueOpportunity,
    addContentItem,
    addContentInsight,
    addEmergentPattern,
    addHealingEvent,
    addVerifiedClaim,
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
        switch (action) {
          case 'regulation':
            const currentVariables = useGenesisStore.getState().allostasis.variables;
            const updatedVariables = currentVariables.map(v =>
              v.name === data.variable
                ? { ...v, current: data.currentValue ?? v.current, setpoint: data.setpoint ?? v.setpoint, urgency: data.urgency ?? v.urgency, action: data.action }
                : v
            );
            updateAllostasis({ variables: updatedVariables });
            break;
          case 'setpoint_adapted':
            const vars = useGenesisStore.getState().allostasis.variables;
            updateAllostasis({
              variables: vars.map(v =>
                v.name === data.variable ? { ...v, setpoint: data.newSetpoint ?? v.setpoint } : v
              ),
            });
            break;
          case 'throttle':
            updateAllostasis({
              isThrottled: true,
              throttleMagnitude: data.magnitude ?? 0.5,
            });
            break;
          case 'defer':
            const deferred = useGenesisStore.getState().allostasis.deferredVariables;
            if (!deferred.includes(data.variable)) {
              updateAllostasis({ deferredVariables: [...deferred, data.variable] });
            }
            break;
          case 'hibernate':
            updateAllostasis({
              isHibernating: true,
              hibernationDuration: data.duration ?? 0,
            });
            break;
        }
        addEvent({ type: eventType, data });
        break;

      case 'nociception':
      case 'pain':
        // Pain events
        if (action === 'stimulus') {
          addPainStimulus({
            id: data.id ?? crypto.randomUUID(),
            location: data.location ?? 'unknown',
            intensity: data.intensity ?? 0,
            type: data.type ?? 'acute',
            timestamp: Date.now(),
          });
          // Map pain level to cortisol
          const cortisol = Math.min(1, data.intensity ?? 0);
          updateNeuromod({ cortisol });
        }
        if (action === 'state') {
          updateNociception({
            totalPain: data.totalPain ?? 0,
            threshold: data.threshold ?? 0.7,
            adaptation: data.adaptation ?? 0,
          });
        }
        addEvent({ type: eventType, data });
        break;

      case 'active-inference':
        switch (action) {
          case 'cycle':
            updateActiveInference({
              currentCycle: data.cycle ?? 0,
              beliefs: data.beliefs ?? {},
              selectedAction: data.action ?? null,
              isRunning: true,
            });
            break;
          case 'surprise':
            const surpriseHistory = useGenesisStore.getState().activeInference.surpriseHistory;
            updateActiveInference({
              lastSurprise: data.surprise ?? 0,
              surpriseHistory: [
                { value: data.surprise ?? 0, timestamp: Date.now() },
                ...surpriseHistory.slice(0, 99),
              ],
            });
            break;
          case 'stopped':
            updateActiveInference({
              isRunning: false,
              avgSurprise: data.avgSurprise ?? 0,
            });
            break;
        }
        addEvent({ type: eventType, data });
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

      case 'worldmodel':
        switch (action) {
          case 'prediction':
            addWorldPrediction({
              id: data.id ?? crypto.randomUUID(),
              domain: data.domain ?? 'unknown',
              prediction: data.prediction ?? '',
              confidence: data.confidence ?? 0,
              timestamp: Date.now(),
            });
            break;
          case 'consistency_violation':
            addConsistencyViolation({
              id: data.id ?? crypto.randomUUID(),
              claim: data.claim ?? '',
              conflictsWith: data.conflictsWith ?? '',
              resolution: data.resolution ?? '',
              timestamp: Date.now(),
            });
            break;
        }
        addEvent({ type: eventType, data });
        break;

      case 'daemon':
        switch (action) {
          case 'state':
            updateDaemon({
              state: data.state ?? 'stopped',
              previousState: data.previousState,
            });
            break;
          case 'task':
            addDaemonTask({
              id: data.taskId ?? crypto.randomUUID(),
              name: data.taskName ?? 'Unknown',
              status: data.status ?? 'scheduled',
              priority: data.priority ?? 'normal',
              scheduledFor: data.scheduledFor,
              startedAt: data.startedAt,
              completedAt: data.completedAt,
              error: data.error,
            });
            break;
          case 'dream':
            updateDaemon({
              dreamPhase: data.dreamPhase ?? null,
              dreamConsolidations: data.consolidations ?? 0,
              dreamInsights: data.creativeInsights ?? 0,
            });
            break;
          case 'maintenance':
            updateDaemon({
              lastMaintenance: Date.now(),
              maintenanceIssues: data.issuesFound ?? 0,
              maintenanceFixed: data.issuesFixed ?? 0,
            });
            break;
        }
        addEvent({ type: eventType, data });
        break;

      case 'finance':
        switch (action) {
          case 'market':
            // Update market data
            break;
          case 'signal':
            addTradingSignal({
              id: data.id ?? crypto.randomUUID(),
              symbol: data.symbol ?? 'UNKNOWN',
              direction: data.direction ?? 'neutral',
              strength: data.strength ?? 0,
              uncertainty: data.uncertainty ?? 0,
              action: data.action ?? 'hold',
              timestamp: Date.now(),
            });
            break;
          case 'position_opened':
            addFinancePosition({
              symbol: data.symbol ?? 'UNKNOWN',
              size: data.size ?? 0,
              entryPrice: data.entryPrice ?? 0,
              currentPrice: data.entryPrice ?? 0,
              pnl: 0,
              pnlPercent: 0,
              direction: data.direction ?? 'long',
              openedAt: Date.now(),
            });
            break;
          case 'position_closed':
            updateFinance({
              realizedPnL: (useGenesisStore.getState().finance.realizedPnL ?? 0) + (data.realizedPnL ?? 0),
            });
            break;
          case 'regime_change':
            updateFinance({
              regime: data.newRegime ?? 'neutral',
            });
            break;
          case 'drawdown_alert':
            updateFinance({
              drawdown: data.drawdown ?? 0,
            });
            break;
        }
        addEvent({ type: eventType, data });
        break;

      case 'revenue':
        switch (action) {
          case 'opportunity':
            addRevenueOpportunity({
              id: data.opportunityId ?? crypto.randomUUID(),
              stream: data.stream ?? 'unknown',
              estimatedRevenue: data.estimatedRevenue ?? 0,
              estimatedCost: data.estimatedCost ?? 0,
              roi: data.roi ?? 0,
              risk: data.risk ?? 0,
              timestamp: Date.now(),
            });
            break;
          case 'task':
            const currentTasks = useGenesisStore.getState().revenue.recentTasks;
            updateRevenue({
              recentTasks: [
                {
                  id: data.taskId ?? crypto.randomUUID(),
                  stream: data.stream ?? 'unknown',
                  success: data.success ?? false,
                  actualRevenue: data.actualRevenue ?? 0,
                  actualCost: data.actualCost ?? 0,
                  timestamp: Date.now(),
                },
                ...currentTasks.slice(0, 49),
              ],
              totalEarned: (useGenesisStore.getState().revenue.totalEarned ?? 0) + (data.actualRevenue ?? 0),
            });
            break;
          case 'stream':
            const streams = useGenesisStore.getState().revenue.streams;
            const existingIdx = streams.findIndex(s => s.name === data.stream);
            if (existingIdx >= 0) {
              streams[existingIdx] = {
                ...streams[existingIdx],
                status: data.status ?? 'active',
                totalEarned: data.totalEarned ?? 0,
                successRate: data.successRate ?? 0,
              };
              updateRevenue({ streams: [...streams] });
            } else {
              updateRevenue({
                streams: [...streams, {
                  name: data.stream ?? 'unknown',
                  status: data.status ?? 'active',
                  totalEarned: data.totalEarned ?? 0,
                  successRate: data.successRate ?? 0,
                  taskCount: 0,
                }],
              });
            }
            break;
        }
        addEvent({ type: eventType, data });
        break;

      case 'content':
        switch (action) {
          case 'created':
            addContentItem({
              id: data.contentId ?? crypto.randomUUID(),
              type: data.type ?? 'post',
              topic: data.topic ?? '',
              platforms: data.platforms ?? [],
              status: 'draft',
            });
            break;
          case 'published':
            const items = useGenesisStore.getState().content.content;
            const itemIdx = items.findIndex(i => i.id === data.contentId);
            if (itemIdx >= 0) {
              items[itemIdx] = { ...items[itemIdx], status: 'published', publishedAt: Date.now() };
              updateContent({
                content: [...items],
                totalPublished: useGenesisStore.getState().content.totalPublished + 1,
              });
            }
            break;
          case 'engagement':
            updateContent({
              avgEngagementRate: data.engagementRate ?? 0,
            });
            break;
          case 'insight':
            addContentInsight({
              id: crypto.randomUUID(),
              type: data.insightType ?? 'performance_alert',
              platform: data.platform,
              recommendation: data.recommendation ?? '',
              confidence: data.confidence ?? 0,
              timestamp: Date.now(),
            });
            break;
        }
        addEvent({ type: eventType, data });
        break;

      case 'swarm':
        switch (action) {
          case 'coordination':
            updateSwarm({
              agentCount: data.agentCount ?? 0,
              activeCoordinations: useGenesisStore.getState().swarm.activeCoordinations + 1,
              consensusLevel: data.consensusLevel ?? 0,
            });
            break;
          case 'emergence':
            addEmergentPattern({
              id: crypto.randomUUID(),
              pattern: data.pattern ?? '',
              agents: data.agents ?? [],
              confidence: data.confidence ?? 0,
              timestamp: Date.now(),
            });
            break;
        }
        addEvent({ type: eventType, data });
        break;

      case 'healing':
        switch (action) {
          case 'started':
            updateHealing({
              isActive: true,
              currentTarget: data.target ?? null,
            });
            addHealingEvent({
              id: crypto.randomUUID(),
              target: data.target ?? 'unknown',
              status: 'started',
              issuesFixed: 0,
              timestamp: Date.now(),
            });
            break;
          case 'completed':
            updateHealing({
              isActive: false,
              currentTarget: null,
              issuesRepaired: useGenesisStore.getState().healing.issuesRepaired + (data.issuesFixed ?? 0),
            });
            addHealingEvent({
              id: crypto.randomUUID(),
              target: data.target ?? 'unknown',
              status: data.success ? 'completed' : 'failed',
              issuesFixed: data.issuesFixed ?? 0,
              timestamp: Date.now(),
            });
            break;
        }
        addEvent({ type: eventType, data });
        break;

      case 'grounding':
        if (action === 'verified') {
          addVerifiedClaim({
            id: crypto.randomUUID(),
            claim: data.claim ?? '',
            verified: data.verified ?? false,
            confidence: data.confidence ?? 0,
            source: data.source,
            timestamp: Date.now(),
          });
          updateGrounding({
            factAccuracy: data.verified
              ? (useGenesisStore.getState().grounding.factAccuracy * 0.9 + 0.1)
              : (useGenesisStore.getState().grounding.factAccuracy * 0.9),
          });
        }
        addEvent({ type: eventType, data });
        break;

      case 'neuromod':
        if (action === 'levels') {
          updateNeuromod({
            dopamine: data.dopamine ?? 0.5,
            serotonin: data.serotonin ?? 0.5,
            norepinephrine: data.norepinephrine ?? 0.3,
            cortisol: data.acetylcholine ?? 0.2, // Map acetylcholine to cortisol for now
          });
        }
        addEvent({ type: eventType, data });
        break;

      default:
        // Generic event
        addEvent({ type: eventType, data });
    }
  }, [
    updateConsciousness, updateKernel, updateNeuromod, updateEconomy, updateSelfImprovement,
    updateActiveInference, updateNociception, updateAllostasis, updateWorldModel,
    updateDaemon, updateFinance, updateRevenue, updateContent, updateSwarm,
    updateHealing, updateGrounding,
    addModification, addLesson, addCodeQuery, addBuildOutput,
    addPainStimulus, addWorldPrediction, addConsistencyViolation, addDaemonTask,
    addFinancePosition, addTradingSignal, addRevenueOpportunity,
    addContentItem, addContentInsight, addEmergentPattern, addHealingEvent, addVerifiedClaim,
    addEvent
  ]);

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
        [
          'consciousness', 'kernel', 'neuromodulation', 'allostasis', 'nociception',
          'metrics', 'selfimprovement', 'coderag', 'learning', 'active-inference',
          'worldmodel', 'daemon', 'finance', 'revenue', 'content', 'swarm',
          'healing', 'grounding', 'neuromod', 'pain'
        ].forEach(category => {
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
