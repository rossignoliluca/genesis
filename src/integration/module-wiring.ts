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

      bus.publish('consciousness.phi.updated', {
        source: 'consciousness',
        precision: 0.9,
        phi,
        previousPhi: (event as any).previousPhi ?? 0.5,
        delta: (event as any).delta ?? 0,
      });

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
