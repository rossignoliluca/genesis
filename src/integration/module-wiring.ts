/**
 * Module Wiring - Connect ALL Modules to Event Bus
 *
 * This is the "nervous system" that connects all 49 modules to the central
 * event bus, enabling the CentralAwareness to see everything.
 *
 * Each module gets:
 * 1. A publisher for emitting events
 * 2. Subscribers for reacting to other modules
 * 3. Integration with neuromodulation effects
 * 4. Consciousness gating for risky operations
 */

import { getEventBus, createPublisher, createSubscriber, type GenesisEventBus } from '../bus/index.js';
import type { FreeEnergyKernel } from '../kernel/free-energy-kernel.js';
import type { NeuromodulationSystem, ModulationEffect } from '../neuromodulation/index.js';
import type { ConsciousnessSystem } from '../consciousness/index.js';
import { getCentralAwareness, type CentralAwareness } from '../consciousness/central-awareness.js';
import type { NociceptiveSystem, NociceptiveState } from '../nociception/index.js';
import type { AllostasisSystem } from '../allostasis/index.js';
import type { WorldModelSystem } from '../world-model/index.js';
import type { MemorySystem } from '../memory/index.js';
import type { Brain } from '../brain/index.js';
import type { EconomicFiber } from '../economy/fiber.js';
import type { NESSMonitor } from '../economy/ness.js';
import type { AgentPool } from '../agents/index.js';
import type { SubagentExecutor } from '../subagents/index.js';
import type { GroundingSystem } from '../grounding/index.js';
import type { MetacognitionSystem } from '../metacognition/index.js';
import type { Daemon } from '../daemon/index.js';
import type { ThinkingEngine } from '../thinking/index.js';
import type { CausalReasoner } from '../causal/index.js';
import type { GovernanceSystem } from '../governance/index.js';
import type { MCPClientManager } from '../mcp/client-manager.js';
import type { AutonomousLoop } from '../active-inference/autonomous-loop.js';

// ============================================================================
// Types
// ============================================================================

export interface ModuleRegistry {
  // L1: Autonomic
  fek?: FreeEnergyKernel;
  neuromodulation?: NeuromodulationSystem;
  nociception?: NociceptiveSystem;
  allostasis?: AllostasisSystem;
  daemon?: Daemon;

  // L2: Perception & Memory
  consciousness?: ConsciousnessSystem;
  worldModel?: WorldModelSystem;
  memory?: MemorySystem;
  brain?: Brain;

  // L3: Reasoning
  thinking?: ThinkingEngine;
  causal?: CausalReasoner;
  grounding?: GroundingSystem;
  agents?: AgentPool;
  subagents?: SubagentExecutor;
  mcp?: MCPClientManager;

  // L4: Meta
  metacognition?: MetacognitionSystem;
  governance?: GovernanceSystem;
  fiber?: EconomicFiber;
  ness?: NESSMonitor;

  // v17.0: Active Inference
  activeInference?: AutonomousLoop;

  // v19.0: Full Module Wiring (P4 — Orphan Integration)
  semiotics?: import('../semiotics/index.js').LargeSemiosisModel;
  umwelt?: import('../umwelt/index.js').AgentUmwelt;
  morphogenetic?: import('../morphogenetic/index.js').AgentColony;
  strangeLoop?: import('../strange-loop/index.js').StrangeLoop;
  secondOrder?: import('../second-order/index.js').SecondOrderCybernetics;
  rsi?: import('../rsi/index.js').RSIOrchestrator;
  autopoiesis?: import('../autopoiesis/index.js').AutopoiesisEngine;
  swarm?: import('../swarm/index.js').SwarmDynamics;
  symbiotic?: import('../symbiotic/index.js').SymbioticPartnership;
  exotic?: import('../exotic/index.js').ExoticComputing;
  embodiment?: import('../embodiment/sensorimotor-loop.js').SensoriMotorLoop;
  metaRL?: import('../learning/meta-rl.js').MetaRLLearner;
}

export interface WiringResult {
  modulesWired: number;
  publishersCreated: number;
  subscribersCreated: number;
  centralAwareness: CentralAwareness;
}

// ============================================================================
// Module Publishers - Each module gets ability to publish typed events
// ============================================================================

/**
 * Wire consciousness module to publish φ updates
 * v16.2.0: Added bidirectional feedback to neuromodulation
 */
function wireConsciousness(
  consciousness: ConsciousnessSystem,
  bus: GenesisEventBus,
  neuromodulation?: NeuromodulationSystem
): void {
  // Subscribe to consciousness events and forward to bus
  consciousness.on((event) => {
    const eventType = (event as any).type || 'update';

    if (eventType === 'phi_updated' || eventType.includes('phi')) {
      const phi = (event as any).phi ?? 0.5;
      const delta = (event as any).delta ?? 0;

      bus.publish('consciousness.phi.updated', {
        source: 'consciousness',
        precision: 0.9,
        phi,
        previousPhi: (event as any).previousPhi ?? 0.5,
        delta,
      });

      // v18.1: Auto-record significant phi shifts to episodic memory
      if (Math.abs(delta) > 0.15) {
        try {
          const { getMemorySystem } = require('../memory/index.js');
          const memory = getMemorySystem();
          memory.remember({
            what: `Phi shifted ${delta > 0 ? 'up' : 'down'} by ${Math.abs(delta).toFixed(2)} to ${phi.toFixed(2)}`,
            tags: ['consciousness', 'phi-shift', delta > 0 ? 'increase' : 'decrease'],
            importance: Math.abs(delta),
          });
        } catch { /* memory optional */ }
      }

      // v16.2.0: Bidirectional feedback - φ modulates neurotransmitters
      if (neuromodulation) {
        // Low phi → increase norepinephrine (alertness needed)
        if (phi < 0.3) {
          neuromodulation.modulate('norepinephrine', 0.1, 'phi-low-alert');
        }
        // High phi → boost dopamine (reward for coherence)
        if (phi > 0.7) {
          neuromodulation.modulate('dopamine', 0.05, 'phi-high-reward');
        }
        // Very low phi → increase cortisol (stress response)
        if (phi < 0.2) {
          neuromodulation.modulate('cortisol', 0.15, 'phi-critical-stress');
        }
      }
    }

    if (eventType === 'attention_shifted' || eventType.includes('attention')) {
      bus.publish('consciousness.attention.shifted', {
        source: 'consciousness',
        precision: 0.8,
        from: (event as any).from ?? null,
        to: (event as any).to ?? 'unknown',
        reason: (event as any).reason ?? 'internal',
      });
    }

    if (eventType === 'ignition' || eventType.includes('workspace')) {
      bus.publish('consciousness.workspace.ignited', {
        source: 'consciousness',
        precision: (event as any).salience ?? 0.5,
        contentId: (event as any).contentId ?? `content-${Date.now()}`,
        sourceModule: (event as any).sourceModule ?? 'unknown',
        contentType: (event as any).contentType ?? 'unknown',
        salience: (event as any).salience ?? 0.5,
        data: (event as any).data ?? null,
      });
    }
  });
}

/**
 * Wire world model to publish predictions and violations
 */
function wireWorldModel(worldModel: WorldModelSystem, bus: GenesisEventBus): void {
  worldModel.on((event) => {
    const d = event.data as Record<string, unknown>;

    if (event.type === 'state_predicted') {
      bus.publish('worldmodel.prediction.updated', {
        source: 'world-model',
        precision: (d.confidence as number) ?? 0.5,
        domain: (d.domain as string) ?? 'general',
        prediction: (d.prediction as string) ?? '',
        confidence: (d.confidence as number) ?? 0.5,
      });
    }

    if (event.type === 'consistency_violation') {
      bus.publish('worldmodel.consistency.violation', {
        source: 'world-model',
        precision: 1.0,
        claim: (d.claim as string) ?? '',
        conflictsWith: (d.conflictsWith as string) ?? '',
        resolution: (d.resolution as string) ?? 'pending',
      });
    }
  });
}

/**
 * Wire nociception to publish pain events
 */
function wireNociception(nociception: NociceptiveSystem, bus: GenesisEventBus): void {
  nociception.onPain((state: NociceptiveState) => {
    bus.publish('pain.state.changed', {
      source: 'nociception',
      precision: 1.0,
      totalPain: state.aggregatePain,
      threshold: 0.8,
      adaptation: state.chronic ? 0.5 : 0,
    });

    // v18.1: React to pain with corrective action
    if (state.aggregatePain > 0.8) {
      // High pain → trigger allostasis throttle
      bus.publish('allostasis.throttle', {
        source: 'nociception', precision: 1.0,
        magnitude: Math.min(1.0, state.aggregatePain),
      });
    }
    if (state.aggregatePain > 0.5) {
      // Medium pain → boost cortisol (stress response) and norepinephrine (alertness)
      try {
        const { getNeuromodulationSystem } = require('../neuromodulation/index.js');
        const neuromod = getNeuromodulationSystem();
        neuromod.modulate('cortisol', state.aggregatePain * 0.2, 'pain-response');
        neuromod.modulate('norepinephrine', 0.1, 'pain-alertness');
      } catch { /* neuromod optional */ }
    }
  });

  // v18.3: Route kernel.panic → nociception stimulus
  // This closes the loop: emitSystemError() → kernel.panic → pain signal
  const panicSub = createSubscriber('nociception-panic');
  panicSub.on('kernel.panic', (event) => {
    const severityMap: Record<string, number> = {
      warning: 0.3,
      critical: 0.6,
      fatal: 0.9,
    };
    const intensity = severityMap[event.severity] ?? 0.5;
    nociception.stimulus('cognitive', intensity, `panic:${event.reason}`);
  });
}

/**
 * Wire allostasis to publish regulation events
 */
function wireAllostasis(allostasis: AllostasisSystem, bus: GenesisEventBus): void {
  allostasis.on('regulation', (result: unknown) => {
    const data = result as Record<string, unknown>;
    const action = data.action as Record<string, unknown> | undefined;

    if (action) {
      bus.publish('allostasis.regulation', {
        source: 'allostasis',
        precision: (action.urgency as number) ?? 0.5,
        variable: (action.variable as string) ?? 'unknown',
        currentValue: (action.currentValue as number) ?? 0,
        setpoint: (action.setpoint as number) ?? 0.5,
        action: (action.type as string) ?? 'none',
        urgency: (action.urgency as number) ?? 0,
      });
    }
  });
}

/**
 * Wire brain to publish cycle events
 * v16.1.2: Brain events are published by genesis.ts after brain.process()
 * This function is intentionally minimal - brain lacks an event emitter interface.
 */
function wireBrain(brain: Brain, bus: GenesisEventBus): void {
  // Brain doesn't have an event emitter - wiring happens in genesis.ts
  console.debug('[ModuleWiring] Brain wired via genesis.ts (no direct event emitter)');
}

/**
 * Wire economic system to publish cost/revenue events
 * v16.1.2: Economic events are published by genesis.ts when costs are recorded
 */
function wireEconomy(fiber: EconomicFiber, ness: NESSMonitor | undefined, bus: GenesisEventBus): void {
  console.debug('[ModuleWiring] Economy wired via genesis.ts (fiber + ness monitor)');
  // Economic events published by genesis.ts when:
  // - LLM costs are recorded (economic.cost.recorded)
  // - Revenue is tracked (economic.revenue.received)
  // NESS observe() returns state that genesis.ts publishes to bus
}

/**
 * Wire agents to publish task events
 */
function wireAgents(agents: AgentPool, bus: GenesisEventBus): void {
  // Agent events are already published by genesis.ts
}

/**
 * v17.0: Wire Active Inference loop to event bus
 * Active Inference emits its own events, but we subscribe to forward key metrics
 */
function wireActiveInference(
  activeInference: AutonomousLoop,
  worldModel: WorldModelSystem | undefined,
  bus: GenesisEventBus
): void {
  // Subscribe to cycle events and forward key metrics
  activeInference.onCycle((cycle, action, beliefs) => {
    // Forward cycle completion to world model (bidirectional coupling)
    if (worldModel) {
      try {
        // Update world model with current beliefs
        const state = activeInference.getMostLikelyState();
        worldModel.updateState?.('active-inference', {
          viability: state.viability,
          worldState: state.worldState,
          coupling: state.coupling,
          goalProgress: state.goalProgress,
          economic: state.economic,
          lastAction: action,
          cycle,
        });
      } catch { /* world model update is optional */ }
    }

    // Emit cycle completion event
    bus.publish('active-inference.cycle.completed', {
      source: 'active-inference',
      precision: 1.0,
      cycle,
      action,
      beliefs: activeInference.getMostLikelyState(),
    });
  });

  // v18.1: WM → AI prediction feedback (bidirectional)
  bus.subscribe('worldmodel.prediction.updated', (event) => {
    const confidence = (event as any).confidence ?? 0.5;
    const domain = (event as any).domain ?? 'general';

    // Feed world model predictions into observation precision
    try {
      const obs = activeInference.getComponents().observations;
      if (domain === 'economic') {
        obs.setPrecision('economic', confidence);
      } else if (domain === 'tool') {
        obs.setPrecision('tool', confidence);
      } else if (domain === 'energy') {
        obs.setPrecision('energy', confidence);
      }
    } catch { /* optional */ }
  });

  // Subscribe to stop events
  activeInference.onStop((reason, stats) => {
    bus.publish('active-inference.loop.stopped', {
      source: 'active-inference',
      precision: 1.0,
      reason,
      cycles: stats.cycles,
      avgSurprise: stats.avgSurprise,
    });
  });

  console.debug('[ModuleWiring] Active Inference wired to event bus');
}

// ============================================================================
// v19.0: Orphan Module Wiring (P4)
// ============================================================================

/**
 * Wire semiotics — triad formation + hallucination assessment → bus
 */
function wireSemiotics(
  semiotics: NonNullable<ModuleRegistry['semiotics']>,
  bus: GenesisEventBus
): void {
  semiotics.on('triad:formed', (triad: any) => {
    bus.publish('semiotics.interpreted', {
      source: 'semiotics',
      precision: triad.confidence ?? 0.5,
      sign: triad.representamen ?? triad.sign ?? '',
      interpretant: triad.interpretant ?? '',
      confidence: triad.confidence ?? 0.5,
    });
  });

  semiotics.on('hallucination:assessed', (assessment: any) => {
    bus.publish('semiotics.hallucination.detected', {
      source: 'semiotics',
      precision: 1.0,
      claim: assessment.claim ?? '',
      risk: assessment.risk ?? 0,
      grounded: assessment.grounded ?? false,
    });
  });

  console.debug('[ModuleWiring] Semiotics wired to event bus');
}

/**
 * Wire umwelt — perception + action events from Merkwelt/Wirkwelt → bus
 */
function wireUmwelt(
  umwelt: NonNullable<ModuleRegistry['umwelt']>,
  bus: GenesisEventBus
): void {
  // Merkwelt perception events
  (umwelt as any).merkwelt?.on?.('perception:received', (data: any) => {
    bus.publish('umwelt.perception', {
      source: 'umwelt',
      precision: 0.7,
      agentId: (umwelt as any).agentId ?? 'genesis',
      sensorId: data.sensorId ?? data.sensor ?? '',
      filtered: false,
    });
  });

  (umwelt as any).merkwelt?.on?.('perception:filtered', (data: any) => {
    bus.publish('umwelt.perception', {
      source: 'umwelt',
      precision: 0.3,
      agentId: (umwelt as any).agentId ?? 'genesis',
      sensorId: data.sensorId ?? data.sensor ?? '',
      filtered: true,
    });
  });

  // Wirkwelt action events
  (umwelt as any).wirkwelt?.on?.('action:completed', (data: any) => {
    bus.publish('umwelt.action.completed', {
      source: 'umwelt',
      precision: 0.8,
      agentId: (umwelt as any).agentId ?? 'genesis',
      actionId: data.actionId ?? data.id ?? '',
      success: data.success ?? true,
    });
  });

  console.debug('[ModuleWiring] Umwelt wired to event bus');
}

/**
 * Wire morphogenetic colony — error detection + repair → bus
 * Cross-wire: repair failure → nociception pain signal
 */
function wireMorphogenetic(
  colony: NonNullable<ModuleRegistry['morphogenetic']>,
  bus: GenesisEventBus,
  nociception?: NociceptiveSystem
): void {
  // Colony-level: listen for agent events via colony step
  // Individual agents emit errors:detected and repair:completed
  // We wire at colony level by iterating agents
  const wireAgent = (agent: any) => {
    if (!agent?.on) return;

    agent.on('errors:detected', (data: any) => {
      bus.publish('morphogenetic.error.detected', {
        source: 'morphogenetic',
        precision: 0.9,
        agentId: agent.id ?? '',
        errorCount: data.errorCount ?? data.count ?? 1,
        severity: data.severity ?? 0.5,
      });
    });

    agent.on('repair:completed', (data: any) => {
      bus.publish('morphogenetic.repair.completed', {
        source: 'morphogenetic',
        precision: 0.8,
        agentId: agent.id ?? '',
        action: data.action ?? 'repair',
        success: data.success ?? true,
      });
    });

    agent.on('repair:failed', (data: any) => {
      if (nociception) {
        nociception.stimulus('cognitive', 0.4, 'morphogenetic-repair-failed');
      }
    });
  };

  // Wire existing agents
  const agents = (colony as any).agents ?? (colony as any).getAgents?.();
  if (agents) {
    for (const agent of (agents instanceof Map ? agents.values() : agents)) {
      wireAgent(agent);
    }
  }

  // Wire future agents
  colony.on('agent:added', (agent: any) => wireAgent(agent));

  console.debug('[ModuleWiring] Morphogenetic colony wired to event bus');
}

/**
 * Wire strange loop — thought + identity events → bus
 */
function wireStrangeLoop(
  loop: NonNullable<ModuleRegistry['strangeLoop']>,
  bus: GenesisEventBus
): void {
  loop.on('thought:created', (thought: any) => {
    bus.publish('strange-loop.thought.created', {
      source: 'strange-loop',
      precision: 0.6,
      level: thought.level ?? 0,
      content: thought.content ?? '',
      isMeta: (thought.level ?? 0) > 0,
    });
  });

  loop.on('identity:crystallized', (identity: any) => {
    bus.publish('strange-loop.identity.crystallized', {
      source: 'strange-loop',
      precision: 0.9,
      coreBeliefs: identity.coreBeliefs ?? identity.beliefs ?? [],
      stability: identity.stability ?? 0.5,
    });
  });

  console.debug('[ModuleWiring] Strange Loop wired to event bus');
}

/**
 * Wire second-order cybernetics — observation + coupling → bus
 */
function wireSecondOrder(
  cybernetics: NonNullable<ModuleRegistry['secondOrder']>,
  bus: GenesisEventBus
): void {
  cybernetics.on('observation:made', (data: any) => {
    bus.publish('second-order.observation', {
      source: 'second-order',
      precision: 0.7,
      observerId: data.observerId ?? data.observer?.name ?? '',
      level: data.level ?? 1,
      what: data.what ?? data.description ?? '',
    });
  });

  cybernetics.on('coupling:established', (data: any) => {
    bus.publish('second-order.coupling.established', {
      source: 'second-order',
      precision: 0.8,
      system1: data.system1 ?? '',
      system2: data.system2 ?? '',
      resonance: data.resonance ?? 0.5,
    });
  });

  console.debug('[ModuleWiring] Second-Order Cybernetics wired to event bus');
}

/**
 * Wire RSI orchestrator — cycle + limitation events → bus
 * Cross-wire: successful cycle → self.improvement.applied
 */
function wireRSI(
  rsi: NonNullable<ModuleRegistry['rsi']>,
  bus: GenesisEventBus
): void {
  rsi.on('cycle:completed', (data: any) => {
    bus.publish('rsi.cycle.completed', {
      source: 'rsi',
      precision: 0.9,
      cycleNumber: data.cycleNumber ?? data.cycle ?? 0,
      phase: 'completed',
      success: data.success ?? true,
      limitationsFound: data.limitationsFound ?? 0,
    });

    // Cross-wire: successful RSI cycle → self-improvement applied
    if (data.success) {
      bus.publish('self.improvement.applied', {
        source: 'rsi',
        precision: 0.8,
        improvementType: 'rsi-cycle',
        phase: 'applied',
        description: `RSI cycle ${data.cycleNumber ?? data.cycle ?? 0} completed`,
        expectedBenefit: data.expectedBenefit ?? 0.1,
      });
    }
  });

  rsi.on('limitation:detected', (data: any) => {
    bus.publish('rsi.limitation.detected', {
      source: 'rsi',
      precision: 0.8,
      cycleNumber: data.cycleNumber ?? 0,
      phase: 'limitation',
      success: false,
      limitationsFound: 1,
    });
  });

  console.debug('[ModuleWiring] RSI Orchestrator wired to event bus');
}

/**
 * Wire autopoiesis — cycle callback → bus
 */
function wireAutopoiesis(
  engine: NonNullable<ModuleRegistry['autopoiesis']>,
  bus: GenesisEventBus
): void {
  engine.onCycle((cycleNumber: number, observations: any[], opportunities: any[]) => {
    bus.publish('autopoiesis.cycle.completed', {
      source: 'autopoiesis',
      precision: 0.7,
      cycleNumber,
      observationCount: observations?.length ?? 0,
      opportunities: (opportunities ?? []).map((o: any) => o.description ?? o.name ?? String(o)),
    });
  });

  console.debug('[ModuleWiring] Autopoiesis wired to event bus');
}

/**
 * Wire swarm dynamics — step + pattern detection → bus
 * Step events are throttled: 1 per 10 steps
 */
function wireSwarm(
  swarm: NonNullable<ModuleRegistry['swarm']>,
  bus: GenesisEventBus
): void {
  let stepCount = 0;

  swarm.on('step', (data: any) => {
    stepCount++;
    if (stepCount % 10 !== 0) return; // Throttle: publish every 10 steps

    const metrics = swarm.getMetrics();
    bus.publish('swarm.step', {
      source: 'swarm',
      precision: 0.5,
      agentCount: metrics.agentCount ?? (data as any)?.agentCount ?? 0,
      orderParameter: metrics.orderParameter ?? 0,
      entropy: metrics.entropy ?? 0,
    });
  });

  swarm.on('pattern:detected', (pattern: any) => {
    bus.publish('swarm.pattern.detected', {
      source: 'swarm',
      precision: 0.8,
      patternType: pattern.type ?? pattern.patternType ?? 'unknown',
      agentCount: pattern.agentCount ?? 0,
      strength: pattern.strength ?? 0.5,
    });
  });

  console.debug('[ModuleWiring] Swarm Dynamics wired to event bus');
}

/**
 * Wire embodiment sensorimotor loop — sense + reflex + prediction error → bus
 * Note: Does NOT replace the cognitive callback wiring in genesis.ts
 */
function wireEmbodiment(
  sensorimotor: NonNullable<ModuleRegistry['embodiment']>,
  bus: GenesisEventBus
): void {
  sensorimotor.on('sense:update', (data: any) => {
    bus.publish('embodiment.sense.updated', {
      source: 'embodiment',
      precision: 0.6,
      sensorId: data.sensorId ?? data.sensor ?? '',
      predictionError: 0,
    });
  });

  sensorimotor.on('prediction:error', (data: any) => {
    bus.publish('embodiment.sense.updated', {
      source: 'embodiment',
      precision: 0.9,
      sensorId: data.sensorId ?? 'forward-model',
      predictionError: data.error ?? data.magnitude ?? 0,
    });
  });

  sensorimotor.on('reflex:triggered', (data: any) => {
    bus.publish('embodiment.reflex.triggered', {
      source: 'embodiment',
      precision: 1.0,
      reflexType: data.type ?? data.reflexType ?? 'unknown',
      stimulus: data.stimulus ?? '',
    });
  });

  console.debug('[ModuleWiring] Embodiment (SensoriMotor) wired to event bus');
}

/**
 * Wire symbiotic partnership — friction + autonomy events → bus
 */
function wireSymbiotic(
  partnership: NonNullable<ModuleRegistry['symbiotic']>,
  bus: GenesisEventBus
): void {
  partnership.on('friction:adapted', (data: any) => {
    bus.publish('symbiotic.friction.adapted', {
      source: 'symbiotic',
      precision: 0.7,
      humanId: data.humanId ?? 'human',
      frictionLevel: data.frictionLevel ?? data.friction ?? 0,
      learningOpportunity: data.learningOpportunity ?? false,
    });
  });

  // HumanStateManager emits autonomy:updated — access via partnership
  const hsm = (partnership as any).humanState ?? (partnership as any).stateManager;
  if (hsm?.on) {
    hsm.on('autonomy:updated', (data: any) => {
      bus.publish('symbiotic.autonomy.updated', {
        source: 'symbiotic',
        precision: 0.8,
        humanId: data.humanId ?? 'human',
        autonomyScore: data.autonomyScore ?? data.autonomy ?? 0.5,
        cognitiveLoad: data.cognitiveLoad ?? data.load ?? 0,
      });
    });
  }

  console.debug('[ModuleWiring] Symbiotic Partnership wired to event bus');
}

/**
 * v13.9: Wire daemon with neuromodulation, nociception, and allostasis
 * This enables:
 * - Dream phases to modulate neurotransmitters
 * - Pain signals to trigger maintenance
 * - Low energy to trigger sleep/dreams
 */
function wireDaemon(
  daemon: Daemon,
  modules: ModuleRegistry,
  bus: GenesisEventBus
): void {
  // The daemon's constructor now handles internal wiring via dependencies
  // Forward daemon events to the bus for central awareness
  daemon.on((event) => {
    switch (event.type) {
      case 'dream_started':
        bus.publish('daemon.dream.started', {
          source: 'daemon',
          precision: 1.0,
          phase: 'started',
          reason: 'inactivity',
        });
        break;
      case 'dream_completed':
        bus.publish('daemon.dream.completed', {
          source: 'daemon',
          precision: 1.0,
          phase: 'completed',
          consolidations: (event.data as any)?.memoriesConsolidated ?? 0,
          creativeInsights: (event.data as any)?.patternsExtracted ?? 0,
        });
        break;
      case 'dream_phase_changed':
        bus.publish('daemon.dream.phase_changed', {
          source: 'daemon',
          precision: 1.0,
          phase: 'phase_changed',
          dreamPhase: (event.data as any)?.phase ?? 'unknown',
        });
        break;
      case 'maintenance_started':
        bus.publish('daemon.maintenance.started', {
          source: 'daemon',
          precision: 1.0,
          status: 'started',
        });
        break;
      case 'maintenance_completed':
        bus.publish('daemon.maintenance.completed', {
          source: 'daemon',
          precision: 1.0,
          status: 'completed',
          issuesFound: (event.data as any)?.issuesFound ?? 0,
          issuesFixed: (event.data as any)?.issuesFixed ?? 0,
        });
        break;
    }
  });
}

// ============================================================================
// v19.0: Cross-Module Feedback Loops (P5)
// ============================================================================

/**
 * Create feedback subscribers that react to P4 bus events
 * and propagate effects to other modules (neuromod, nociception, world-model, memory).
 */
function wireP4FeedbackLoops(modules: ModuleRegistry, bus: GenesisEventBus): number {
  let count = 0;
  const sub = createSubscriber('p4-feedback');

  // 1. Hallucination → world-model degrade + cortisol
  if (modules.worldModel || modules.neuromodulation) {
    sub.on('semiotics.hallucination.detected', (e: any) => {
      if (e.risk > 0.5 && modules.worldModel) {
        bus.publish('worldmodel.consistency.violation', {
          source: 'semiotics', precision: 1.0,
          claim: e.claim ?? '', conflictsWith: 'hallucination-detected', resolution: 'pending',
        });
      }
      if (e.risk > 0.5 && modules.neuromodulation) {
        modules.neuromodulation!.modulate('cortisol', e.risk * 0.1, 'hallucination-risk');
      }
    });
    count++;
  }

  // 2. Morphogenetic errors → nociception pain
  if (modules.nociception) {
    sub.on('morphogenetic.error.detected', (e: any) => {
      if ((e.severity ?? 0) > 0.6) {
        modules.nociception!.stimulus('cognitive', (e.severity ?? 0.5) * 0.5, 'morphogenetic-error');
      }
    });
    count++;
  }

  // 3. Identity crystallized → dopamine reward
  if (modules.neuromodulation) {
    sub.on('strange-loop.identity.crystallized', (e: any) => {
      if ((e.stability ?? 0) > 0.7) {
        modules.neuromodulation!.modulate('dopamine', 0.05, 'identity-stable');
      }
    });
    count++;
  }

  // 4. RSI limitation → norepinephrine alertness
  if (modules.neuromodulation) {
    sub.on('rsi.limitation.detected', (e: any) => {
      modules.neuromodulation!.modulate('norepinephrine', 0.1, 'rsi-limitation');
    });
    count++;
  }

  // 5. Swarm pattern → dopamine novelty
  if (modules.neuromodulation) {
    sub.on('swarm.pattern.detected', (e: any) => {
      modules.neuromodulation!.modulate('dopamine', 0.08, 'swarm-emergence');
    });
    count++;
  }

  // 6. Symbiotic friction → serotonin (calming adaptation)
  if (modules.neuromodulation) {
    sub.on('symbiotic.friction.adapted', (e: any) => {
      modules.neuromodulation!.modulate('serotonin', 0.05, 'symbiotic-adaptation');
    });
    count++;
  }

  // 7. High embodiment prediction error → pain
  if (modules.nociception) {
    sub.on('embodiment.sense.updated', (e: any) => {
      if ((e.predictionError ?? 0) > 0.7) {
        modules.nociception!.stimulus('embodiment', (e.predictionError ?? 0) * 0.3, 'prediction-error');
      }
    });
    count++;
  }

  // 8. Autopoiesis opportunities → log as memory
  sub.on('autopoiesis.cycle.completed', (e: any) => {
    if ((e.opportunities?.length ?? 0) > 0) {
      import('../memory/index.js').then(({ getMemorySystem }) => {
        getMemorySystem().remember({
          what: `Autopoiesis: ${e.opportunities.length} opportunities found: ${e.opportunities.slice(0, 3).join(', ')}`,
          tags: ['autopoiesis', 'self-observation'],
          importance: 0.3,
        });
      }).catch(() => { /* memory optional */ });
    }
  });
  count++;

  return count;
}

// ============================================================================
// Neuromodulation Effect Integration
// ============================================================================

/**
 * Apply neuromodulation effects to module behavior
 * v16.1.2: Added logging, neuromodulation effects applied in genesis.ts processContext()
 */
function applyNeuromodulationEffects(
  modules: ModuleRegistry,
  neuromod: NeuromodulationSystem,
): void {
  neuromod.onUpdate((levels, effect) => {
    // Effects applied in genesis.ts via processContext()
    // This subscriber enables future module-specific modulation
    console.debug('[ModuleWiring] Neuromodulation update received:', {
      dopamine: levels.dopamine.toFixed(2),
      serotonin: levels.serotonin.toFixed(2),
    });
  });
}

// ============================================================================
// Consciousness Gating Integration
// ============================================================================

/**
 * Add consciousness gating to risky operations
 * v16.1.2: Main gating is done in genesis.ts process() method
 * This function sets up future module-specific gating hooks.
 */
function addConsciousnessGating(
  modules: ModuleRegistry,
  awareness: CentralAwareness,
): void {
  console.debug('[ModuleWiring] Consciousness gating active via genesis.ts process()');
  // Genesis.ts handles main consciousness gating:
  // - High-risk tools (bash, edit, payment) require φ > 0.4
  // - Medium-risk tools require φ > 0.2
  // Future: Add module-specific gates here
}

/**
 * Get risk level for a tool
 */
function getToolRiskLevel(toolName: string): number {
  const highRisk = ['bash', 'edit', 'write', 'delete', 'deploy', 'payment'];
  const mediumRisk = ['search', 'fetch', 'query', 'read'];

  const name = toolName.toLowerCase();

  if (highRisk.some(r => name.includes(r))) return 0.8;
  if (mediumRisk.some(r => name.includes(r))) return 0.4;
  return 0.2;
}

// ============================================================================
// Main Wiring Function
// ============================================================================

/**
 * Wire all modules to the event bus
 *
 * This is the main function that connects the entire organism.
 */
export function wireAllModules(modules: ModuleRegistry): WiringResult {
  const bus = getEventBus();
  let modulesWired = 0;
  let publishersCreated = 0;
  let subscribersCreated = 0;

  // Start central awareness
  const awareness = getCentralAwareness();
  awareness.start();

  // Wire each module
  // v16.2.0: Pass neuromodulation for bidirectional φ feedback
  if (modules.consciousness) {
    wireConsciousness(modules.consciousness, bus, modules.neuromodulation);
    modulesWired++;
    publishersCreated++;
  }

  if (modules.worldModel) {
    wireWorldModel(modules.worldModel, bus);
    modulesWired++;
    publishersCreated++;
  }

  if (modules.nociception) {
    wireNociception(modules.nociception, bus);
    modulesWired++;
    publishersCreated++;
  }

  if (modules.allostasis) {
    wireAllostasis(modules.allostasis, bus);
    modulesWired++;
    publishersCreated++;
  }

  if (modules.brain) {
    wireBrain(modules.brain, bus);
    modulesWired++;
    publishersCreated++;
  }

  if (modules.fiber) {
    wireEconomy(modules.fiber, modules.ness, bus);
    modulesWired++;
    publishersCreated++;
  }

  if (modules.agents) {
    wireAgents(modules.agents, bus);
    modulesWired++;
    publishersCreated++;
  }

  // v13.9: Wire daemon with neuromodulation, nociception, allostasis
  if (modules.daemon) {
    wireDaemon(modules.daemon, modules, bus);
    modulesWired++;
    publishersCreated++;
  }

  // v17.0: Wire Active Inference loop
  if (modules.activeInference) {
    wireActiveInference(modules.activeInference, modules.worldModel, bus);
    modulesWired++;
    publishersCreated++;
  }

  // v19.0: Wire remaining cognitive modules (P4 — Orphan Integration)
  if (modules.semiotics) { wireSemiotics(modules.semiotics, bus); modulesWired++; }
  if (modules.umwelt) { wireUmwelt(modules.umwelt, bus); modulesWired++; }
  if (modules.morphogenetic) { wireMorphogenetic(modules.morphogenetic, bus, modules.nociception); modulesWired++; }
  if (modules.strangeLoop) { wireStrangeLoop(modules.strangeLoop, bus); modulesWired++; }
  if (modules.secondOrder) { wireSecondOrder(modules.secondOrder, bus); modulesWired++; }
  if (modules.rsi) { wireRSI(modules.rsi, bus); modulesWired++; }
  if (modules.autopoiesis) { wireAutopoiesis(modules.autopoiesis, bus); modulesWired++; }
  if (modules.swarm) { wireSwarm(modules.swarm, bus); modulesWired++; }
  if (modules.symbiotic) { wireSymbiotic(modules.symbiotic, bus); modulesWired++; }
  if (modules.embodiment) { wireEmbodiment(modules.embodiment, bus); modulesWired++; }
  // exotic, metaRL: pure compute, no events to bridge

  // v19.0: Cross-module feedback loops for P4 events
  const feedbackCount = wireP4FeedbackLoops(modules, bus);
  subscribersCreated += feedbackCount;
  console.debug(`[ModuleWiring] P4 feedback loops created: ${feedbackCount}`);

  // Apply neuromodulation effects
  if (modules.neuromodulation) {
    applyNeuromodulationEffects(modules, modules.neuromodulation);
    subscribersCreated++;
  }

  // Add consciousness gating
  addConsciousnessGating(modules, awareness);
  subscribersCreated++;

  return {
    modulesWired,
    publishersCreated,
    subscribersCreated,
    centralAwareness: awareness,
  };
}

/**
 * Quick check if wiring is complete
 */
export function isFullyWired(modules: ModuleRegistry): boolean {
  const required = [
    'consciousness',
    'neuromodulation',
    'nociception',
    'allostasis',
    'worldModel',
    'brain',
    'fiber',
  ];

  return required.every(key => key in modules && modules[key as keyof ModuleRegistry] !== undefined);
}
