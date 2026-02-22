/**
 * Genesis — Dashboard / Observability Wiring
 *
 * Extracted from genesis.ts bootL2. Configures the real-time metrics provider
 * and wires bio-inspired module events into the SSE dashboard stream.
 *
 * Call `wireDashboard(ctx)` once after all services are instantiated.
 */

import { broadcastToDashboard, type DashboardServer } from '../observability/dashboard.js';
import { createSubscriber } from '../bus/index.js';
import type { ConsciousnessSystem } from '../consciousness/index.js';
import type { FreeEnergyKernel } from '../kernel/free-energy-kernel.js';
import type { NeuromodulationSystem } from '../neuromodulation/index.js';
import type { AllostasisSystem, AllostaticAction } from '../allostasis/index.js';
import type { NociceptiveSystem } from '../nociception/index.js';
import type { EconomicFiber } from '../economy/fiber.js';
import type { Brain } from '../brain/index.js';
import type { CognitiveWorkspace } from '../memory/cognitive-workspace.js';
import type { CentralAwareness } from '../consciousness/central-awareness.js';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * All services and state that the dashboard wiring needs access to.
 * Every service field is nullable — the wiring simply skips wires whose
 * source is not yet available.
 */
export interface DashboardWiringContext {
  // Services (object refs — stable after boot, callbacks read lazily)
  dashboard: DashboardServer | null;
  consciousness: ConsciousnessSystem | null;
  fek: FreeEnergyKernel | null;
  neuromodulation: NeuromodulationSystem | null;
  allostasis: AllostasisSystem | null;
  nociception: NociceptiveSystem | null;
  fiber: EconomicFiber | null;
  brain: Brain | null;
  cognitiveWorkspace: CognitiveWorkspace | null;

  // Getter functions for state that changes after wiring time
  getCycleCount: () => number;
  getBootTime: () => number;
  getCentralAwareness: () => CentralAwareness | null;
  getCalibrationError: () => number;
}

// ---------------------------------------------------------------------------
// Main wiring function
// ---------------------------------------------------------------------------

/**
 * Wire the dashboard: attach the metrics provider and subscribe all
 * bio-inspired module events to the SSE broadcast channel.
 *
 * This is intentionally side-effect only — it mutates no state on `ctx`.
 */
export function wireDashboard(ctx: DashboardWiringContext): void {
  const { dashboard } = ctx;
  if (!dashboard) return;

  // -------------------------------------------------------------------------
  // v13.1: Real metrics provider for dashboard UI
  // -------------------------------------------------------------------------
  dashboard.setMetricsProvider(() => {
    const mem = process.memoryUsage();
    const fiberSection = ctx.fiber?.getGlobalSection();

    return {
      timestamp: Date.now(),
      uptime: ctx.getBootTime() > 0 ? (Date.now() - ctx.getBootTime()) / 1000 : 0,
      memory: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
        rss: mem.rss,
      },
      consciousness: (() => {
        const snapshot = ctx.consciousness?.getSnapshot();
        const attFocus = snapshot?.attention?.focus;
        return {
          phi: snapshot?.level?.rawPhi ?? 0,
          state: ctx.consciousness?.getState() ?? 'unknown',
          integration: snapshot?.phi?.integratedInfo ?? 0,
          complexity: 0,
          attentionFocus:
            attFocus && typeof attFocus === 'object'
              ? (attFocus as { id?: string }).id ?? null
              : null,
          workspaceContents: [],
        };
      })(),
      kernel: {
        state: ctx.fek?.getMode?.() ?? 'unknown',
        energy: ctx.fek ? Math.max(0, 1 - (ctx.fek.getTotalFE?.() ?? 0) / 5) : 0,
        cycles: ctx.getCycleCount(),
        mode: ctx.fek?.getMode?.() ?? 'explore',
        levels: {
          l1: { active: true, load: 0.5 },
          l2: { active: true, load: 0.5 },
          l3: { active: true, load: 0.5 },
          l4: { active: true, load: 0.5 },
        },
        freeEnergy: ctx.fek?.getTotalFE?.() ?? 0,
        predictionError: 0,
      },
      agents: { total: 0, active: ctx.brain ? 1 : 0, queued: 0 },
      memory_system: { episodic: 0, semantic: 0, procedural: 0, total: 0 },
      llm: {
        totalRequests: ctx.getCycleCount(),
        totalCost: fiberSection?.totalCosts ?? 0,
        averageLatency: 0,
        providers: [],
      },
      mcp: { connectedServers: 0, availableTools: 0, totalCalls: 0 },
      // v19.0: P4 Cognitive Modules
      cognitive: (() => {
        const s = ctx.getCentralAwareness()?.getState();
        return s
          ? {
              semiotics: {
                hallucinationRisk: s.semiotics.hallucinationRisk,
                interpretationCount: 0,
              },
              morphogenetic: {
                colonyHealth: s.morphogenetic.colonyHealth,
                repairRate: s.morphogenetic.repairSuccessRate,
              },
              strangeLoop: {
                identityStability: s.strangeLoop.identityStability,
                metaDepth: s.strangeLoop.metaThoughtDepth,
              },
              rsi: {
                cycleCount: s.rsi.cycleCount,
                successRate: s.rsi.successRate,
              },
              swarm: {
                orderParameter: s.swarm.orderParameter,
                entropy: s.swarm.entropy,
                patternsDetected: s.swarm.patternsDetected,
              },
              symbiotic: {
                frictionLevel: s.symbiotic.frictionLevel,
                autonomyScore: s.symbiotic.autonomyScore,
              },
              embodiment: {
                predictionError: s.embodiment.predictionError,
                reflexCount: s.embodiment.reflexesTriggered,
              },
            }
          : undefined;
      })(),
    };
  });

  // Start dashboard server (non-blocking — port-in-use and similar errors are non-fatal)
  dashboard.start().catch((err: unknown) => {
    console.warn('[dashboard] Failed to start:', err instanceof Error ? err.message : err);
  });

  // -------------------------------------------------------------------------
  // Wire consciousness events → dashboard SSE stream
  // -------------------------------------------------------------------------
  if (ctx.consciousness) {
    ctx.consciousness.on((event) => {
      broadcastToDashboard(`consciousness:${event.type}`, event.data);
    });
  }

  // -------------------------------------------------------------------------
  // Wire FEK mode changes → dashboard SSE stream
  // -------------------------------------------------------------------------
  if (ctx.fek) {
    ctx.fek.onModeChange((mode, prev) => {
      broadcastToDashboard('kernel:mode', { mode, prev, cycle: ctx.getCycleCount() });
    });
  }

  // -------------------------------------------------------------------------
  // Wire neuromodulator level changes → dashboard SSE stream
  // -------------------------------------------------------------------------
  if (ctx.neuromodulation) {
    ctx.neuromodulation.onUpdate((levels, effect) => {
      broadcastToDashboard('neuromodulation:update', {
        levels,
        effect: {
          explorationRate: effect.explorationRate,
          riskTolerance: effect.riskTolerance,
          processingDepth: effect.processingDepth,
          learningRate: effect.learningRate,
        },
        cycle: ctx.getCycleCount(),
      });
    });
  }

  // -------------------------------------------------------------------------
  // Wire allostatic regulation events → dashboard SSE stream
  // -------------------------------------------------------------------------
  if (ctx.allostasis) {
    ctx.allostasis.on('regulation', (result: { action: AllostaticAction; success: boolean }) => {
      broadcastToDashboard('allostasis:regulation', {
        action: result.action.type,
        target: result.action.target,
        urgency: result.action.urgency,
        reason: result.action.reason,
        success: result.success,
        cycle: ctx.getCycleCount(),
      });
    });
  }

  // -------------------------------------------------------------------------
  // Wire nociceptive pain events → dashboard SSE stream
  // -------------------------------------------------------------------------
  if (ctx.nociception) {
    ctx.nociception.onPain((state) => {
      broadcastToDashboard('nociception:pain', {
        level: state.overallLevel,
        aggregatePain: state.aggregatePain,
        chronic: state.chronic,
        signals: state.activeSignals.length,
        cycle: ctx.getCycleCount(),
      });
    });
  }

  // -------------------------------------------------------------------------
  // v19.0: Wire P4 cognitive module events → dashboard SSE
  // -------------------------------------------------------------------------
  const p4DashSub = createSubscriber('p4-dashboard');
  const p4Prefixes = [
    'semiotics.',
    'morphogenetic.',
    'strange-loop.',
    'rsi.',
    'autopoiesis.',
    'swarm.',
    'symbiotic.',
    'embodiment.',
  ];
  for (const prefix of p4Prefixes) {
    p4DashSub.onPrefix(prefix, (event: any) => {
      broadcastToDashboard(event.topic ?? prefix.slice(0, -1), event);
    });
  }
}
