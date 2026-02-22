/**
 * Genesis — Consciousness Module Wiring
 *
 * Extracted from genesis.ts bootL2. Registers the system state provider
 * for φ calculation, wires subsystems as GWT modules into the global
 * workspace, and wires the invariant-violation → FEK vigilant-mode path.
 *
 * Call `wireConsciousness(ctx)` once after all services are instantiated,
 * before the main process loop begins.
 */

import type { ConsciousnessSystem } from '../consciousness/index.js';
import type { FreeEnergyKernel } from '../kernel/free-energy-kernel.js';
import type { NeuromodulationSystem } from '../neuromodulation/index.js';
import type { MetacognitionSystem } from '../metacognition/index.js';
import type { EconomicFiber } from '../economy/fiber.js';
import type { CognitiveWorkspace } from '../memory/cognitive-workspace.js';
import type { Brain } from '../brain/index.js';
import type { NESSState } from '../economy/ness.js';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * All services and state that consciousness wiring needs access to.
 * Every service field is nullable — wiring is skipped when the source
 * is unavailable.
 */
export interface ConsciousnessWiringContext {
  consciousness: ConsciousnessSystem | null;
  fek: FreeEnergyKernel | null;
  neuromodulation: NeuromodulationSystem | null;
  metacognition: MetacognitionSystem | null;
  fiber: EconomicFiber | null;
  cognitiveWorkspace: CognitiveWorkspace | null;
  brain: Brain | null;
  lastNESSState: NESSState | null;
  performanceHistory: unknown[];
  getCalibrationError: () => number;
}

// ---------------------------------------------------------------------------
// Main wiring function
// ---------------------------------------------------------------------------

/**
 * Wire consciousness: attach the system state provider for φ calculation,
 * register subsystems as GWT modules, wire invariant violations to FEK
 * vigilant mode, then start the consciousness system.
 *
 * This is intentionally side-effect only — it mutates no state on `ctx`.
 */
export function wireConsciousness(ctx: ConsciousnessWiringContext): void {
  if (!ctx.consciousness) return;

  try {
    // -----------------------------------------------------------------------
    // v13.1: Wire real system state provider for φ calculation
    // -----------------------------------------------------------------------
    ctx.consciousness.setSystemStateProvider(() => {
      // Dynamic entropy: reflects actual uncertainty/surprisal of each component
      const fekEntropy = ctx.fek?.getTotalFE?.() ?? 0;
      const fiberSection = ctx.fiber?.getGlobalSection();
      const nessDeviation = ctx.lastNESSState?.deviation ?? 0.5;
      // Brain entropy: based on calibration error (uncertain ≈ high entropy)
      const brainEntropy = ctx.performanceHistory.length > 10
        ? ctx.getCalibrationError()
        : 0.5;
      // Economic entropy: sustainability gap as surprisal
      const econEntropy = fiberSection ? (fiberSection.sustainable ? 0.2 : 0.7 + nessDeviation * 0.3) : 0.5;
      // Memory entropy: buffer utilization (full buffer = low entropy, empty = high)
      const memEntropy = ctx.cognitiveWorkspace
        ? Math.min(1, ctx.cognitiveWorkspace.getStats().itemCount / Math.max(1, ctx.cognitiveWorkspace.getStats().maxItems))
        : 0.4;

      // v18.1: Neuromodulation entropy from modulatory balance
      // Entropy is maximal at explorationRate=0.5 (maximum uncertainty)
      // and minimal at extremes (0 or 1)
      const neuromodEntropy = ctx.neuromodulation
        ? 1 - Math.abs(ctx.neuromodulation.getEffect().explorationRate - 0.5) * 2
        : 0.5;

      const now = new Date();
      return {
        components: [
          { id: 'fek', type: 'kernel', active: !!ctx.fek, state: { mode: ctx.fek?.getMode?.() ?? 'dormant' }, entropy: fekEntropy, lastUpdate: now },
          { id: 'brain', type: 'processor', active: !!ctx.brain, state: { calibrationError: brainEntropy }, entropy: brainEntropy, lastUpdate: now },
          { id: 'fiber', type: 'economic', active: !!ctx.fiber, state: { sustainable: fiberSection?.sustainable ?? false, netFlow: fiberSection?.netFlow ?? 0 }, entropy: econEntropy, lastUpdate: now },
          { id: 'memory', type: 'storage', active: !!ctx.cognitiveWorkspace, state: {}, entropy: memEntropy, lastUpdate: now },
          { id: 'neuromod', type: 'modulator', active: !!ctx.neuromodulation, state: {}, entropy: neuromodEntropy, lastUpdate: now },
          { id: 'world-model', type: 'predictor', active: false, state: {}, entropy: 0.4, lastUpdate: now },
          { id: 'nociception', type: 'sentinel', active: false, state: {}, entropy: 0.3, lastUpdate: now },
        ],
        connections: [
          // Intra-group A: {fek, brain, fiber, memory}
          { from: 'fek', to: 'brain', strength: 0.9, informationFlow: Math.max(0.3, 1 - fekEntropy), bidirectional: true },
          { from: 'brain', to: 'memory', strength: 0.8, informationFlow: 0.7, bidirectional: true },
          { from: 'fiber', to: 'fek', strength: 0.6, informationFlow: fiberSection?.sustainable ? 0.8 : 0.3, bidirectional: true },
          // Intra-group B: {neuromod, world-model, nociception}
          { from: 'neuromod', to: 'world-model', strength: 0.7, informationFlow: 0.6, bidirectional: false },
          { from: 'nociception', to: 'neuromod', strength: 0.6, informationFlow: 0.5, bidirectional: false },
          // Cross-group: brain ↔ neuromodulation (DA/cortisol on success/failure, exploration rate modulates LLM)
          { from: 'brain', to: 'neuromod', strength: 0.8, informationFlow: 0.6, bidirectional: true },
          // Cross-group: nociception → brain (pain/error signals influence processing)
          { from: 'nociception', to: 'brain', strength: 0.5, informationFlow: 0.4, bidirectional: false },
          // Cross-group: world-model → memory (prediction errors stored as episodic memory)
          { from: 'world-model', to: 'memory', strength: 0.6, informationFlow: 0.5, bidirectional: true },
          // Fiber integration: economic state affects brain decisions and neuromod stress response
          { from: 'fiber', to: 'brain', strength: 0.5, informationFlow: 0.4, bidirectional: false },
          { from: 'fiber', to: 'neuromod', strength: 0.4, informationFlow: 0.3, bidirectional: false },
        ],
        stateHash: `cycle-fe${fekEntropy.toFixed(2)}-nm${neuromodEntropy.toFixed(2)}`,
        timestamp: now,
      };
    });

    // -----------------------------------------------------------------------
    // v13.1: Register subsystems as GWT modules for workspace competition
    // -----------------------------------------------------------------------

    ctx.consciousness.registerModule({
      id: 'fek-module',
      name: 'Free Energy Kernel',
      type: 'evaluative',
      active: true,
      load: 0.3,
      onPropose: () => {
        if (!ctx.fek) return null;
        const totalFE = ctx.fek.getTotalFE?.() ?? 0;
        // Only propose when free energy is notable (surprise)
        if (totalFE < 0.5) return null;
        return {
          id: `fek-${Date.now()}`,
          sourceModule: 'fek-module',
          type: 'goal' as const,
          data: { totalFE, mode: ctx.fek.getMode?.() },
          salience: Math.min(1, totalFE / 3),
          relevance: 0.8,
          timestamp: new Date(),
          ttl: 5000,
        };
      },
      onReceive: () => { /* FEK receives broadcasts but doesn't act on them */ },
      onSalience: () => {
        const totalFE = ctx.fek?.getTotalFE?.() ?? 0;
        return Math.min(1, totalFE / 3);
      },
      onRelevance: () => 0.8,
    });

    ctx.consciousness.registerModule({
      id: 'metacog-module',
      name: 'Metacognition',
      type: 'metacognitive',
      active: true,
      load: 0.2,
      onPropose: () => {
        if (!ctx.metacognition) return null;
        const state = ctx.metacognition.getState();
        const conf = state?.currentConfidence?.value ?? 0.5;
        // Propose when confidence is notably low (uncertainty signal)
        if (conf > 0.4) return null;
        return {
          id: `metacog-${Date.now()}`,
          sourceModule: 'metacog-module',
          type: 'thought' as const,
          data: { confidence: conf, calibrationError: state?.currentConfidence?.calibrationError },
          salience: 1 - conf,
          relevance: 0.7,
          timestamp: new Date(),
          ttl: 3000,
        };
      },
      onReceive: () => {},
      onSalience: () => {
        const conf = ctx.metacognition?.getState()?.currentConfidence?.value ?? 0.5;
        return 1 - conf;
      },
      onRelevance: () => 0.7,
    });

    // v13.2: Neuromodulation as GWT module — consciousness aware of emotional tone
    if (ctx.neuromodulation) {
      ctx.consciousness.registerModule({
        id: 'neuromod-module',
        name: 'Neuromodulation',
        type: 'evaluative',
        active: true,
        load: 0.15,
        onPropose: () => {
          if (!ctx.neuromodulation) return null;
          const levels = ctx.neuromodulation.getLevels();
          // Propose when any modulator deviates significantly from baseline
          const maxDeviation = Math.max(
            Math.abs(levels.dopamine - 0.5),
            Math.abs(levels.serotonin - 0.6),
            Math.abs(levels.norepinephrine - 0.4),
            Math.abs(levels.cortisol - 0.3),
          );
          if (maxDeviation < 0.2) return null;
          return {
            id: `neuromod-${Date.now()}`,
            sourceModule: 'neuromod-module',
            type: 'emotion' as const,
            data: { levels, deviation: maxDeviation },
            salience: maxDeviation,
            relevance: 0.6,
            timestamp: new Date(),
            ttl: 4000,
          };
        },
        onReceive: () => {},
        onSalience: () => {
          if (!ctx.neuromodulation) return 0;
          const levels = ctx.neuromodulation.getLevels();
          return Math.max(
            Math.abs(levels.dopamine - 0.5),
            Math.abs(levels.cortisol - 0.3),
          );
        },
        onRelevance: () => 0.6,
      });
    }

    // -----------------------------------------------------------------------
    // v13.1: Wire invariant violation → FEK vigilant mode
    // -----------------------------------------------------------------------
    if (ctx.fek) {
      ctx.consciousness.onInvariantViolation(() => {
        ctx.fek?.setMode('vigilant');
      });
    }

    ctx.consciousness.start();
  } catch (error) {
    console.error('[Genesis] Consciousness init failed — module disabled:', error instanceof Error ? error.message : error);
  }
}
