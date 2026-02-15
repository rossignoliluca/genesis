/**
 * Nucleus v34 — Orchestrator
 *
 * The brain of the Nucleus. Classifies input via fast regex heuristics (<1ms),
 * selects modules based on learned weights, executes in phase order, and
 * records outcomes for plasticity learning.
 */

import type {
  InputClassification,
  NucleusContext,
  ExecutionPlan,
  ProcessingOutcome,
  ModuleDescriptor,
} from './types.js';
import { PHASE_ORDER } from './types.js';
import { createModuleMap } from './module-map.js';
import { getPlasticity } from './plasticity.js';

const MAX_MODULES = 20;
const ACTIVATION_THRESHOLD = 0.15;

export class Orchestrator {
  private modules: Map<string, ModuleDescriptor>;

  constructor() {
    this.modules = createModuleMap();
  }

  // =========================================================================
  // Classification — regex heuristics, no LLM, <1ms
  // =========================================================================

  classify(input: string): InputClassification {
    const lower = input.toLowerCase().trim();

    // Short greetings
    if (/^(hi|hello|hey|ciao|buongiorno|salve|yo|sup|hola|good\s*(morning|evening|afternoon|night))[\s!.?]*$/i.test(lower)) {
      return 'simple_chat';
    }

    // Market / finance keywords
    if (/\b(market|stock|ticker|portfolio|trading|finance|invest|crypto|bitcoin|eth|forex|s&p|nasdaq|bond|yield|dividend|earnings|revenue|valuation|bull|bear|hedge|alpha|beta|sharpe)\b/.test(lower)) {
      return 'market';
    }

    // Code keywords
    if (/\b(code|function|class|method|bug|debug|refactor|compile|typescript|javascript|python|rust|golang|api|endpoint|database|sql|query|git|commit|deploy|docker|npm|yarn|test|lint)\b/.test(lower)) {
      return 'code';
    }

    // Analysis keywords
    if (/\b(analy[sz]e|compare|evaluate|assess|benchmark|metrics|statistics|data|report|chart|graph|trend|pattern|correlat|regression|distribution)\b/.test(lower)) {
      return 'analysis';
    }

    // Reasoning / planning
    if (/\b(reason|think|plan|strateg|decide|weigh|pros?\s+and\s+cons|trade-?off|consider|hypothe|if\s+then|because|therefore|consequently|implication|deduc|induc)\b/.test(lower)) {
      return 'reasoning';
    }

    // Creative
    if (/\b(creat|write|compose|design|imagine|story|poem|narrative|brainstorm|invent|artistic|visual|aesthetic|draft|prose|fiction)\b/.test(lower)) {
      return 'creative';
    }

    // Life assist / scheduling
    if (/\b(schedule|remind|calendar|appointment|todo|task|routine|habit|goal|fitness|health|recipe|cook|travel|weather|alarm|timer|morning\s+routine)\b/.test(lower)) {
      return 'life_assist';
    }

    // System / Genesis internals
    if (/\b(genesis|system|module|boot|shutdown|config|status|daemon|mcp|bus|kernel|fek|phi|consciousness|neuro|plasticity|nucleus)\b/.test(lower)) {
      return 'system';
    }

    // Length-based fallback
    if (lower.length < 60) return 'simple_chat';
    if (lower.length > 500) return 'reasoning';
    return 'unknown';
  }

  // =========================================================================
  // Planning — select modules based on classification + learned weights
  // =========================================================================

  plan(input: string): ExecutionPlan {
    const classification = this.classify(input);
    const learnedWeights = getPlasticity().getWeightsForClassification(classification);

    // Select modules
    const selected: ModuleDescriptor[] = [];
    for (const mod of this.modules.values()) {
      if (mod.alwaysActive) {
        selected.push(mod);
        continue;
      }
      // Use learned weight if available, else use default from module map
      const weight = learnedWeights[mod.id] ?? mod.activationWeights[classification] ?? 0;
      if (weight >= ACTIVATION_THRESHOLD) {
        selected.push(mod);
      }
    }

    // Sort by phase order, then by dependencies
    selected.sort((a, b) => {
      const phaseA = PHASE_ORDER.indexOf(a.phase);
      const phaseB = PHASE_ORDER.indexOf(b.phase);
      if (phaseA !== phaseB) return phaseA - phaseB;
      // Within same phase, modules with deps come after their deps
      if (a.dependencies.includes(b.id)) return 1;
      if (b.dependencies.includes(a.id)) return -1;
      return 0;
    });

    // Cap at MAX_MODULES, keeping always-active
    if (selected.length > MAX_MODULES) {
      const alwaysActive = selected.filter(m => m.alwaysActive);
      const optional = selected.filter(m => !m.alwaysActive);
      // Sort optional by effective weight descending
      optional.sort((a, b) => {
        const wa = learnedWeights[a.id] ?? a.activationWeights[classification] ?? 0;
        const wb = learnedWeights[b.id] ?? b.activationWeights[classification] ?? 0;
        return wb - wa;
      });
      const kept = [...alwaysActive, ...optional.slice(0, MAX_MODULES - alwaysActive.length)];
      // Re-sort by phase
      kept.sort((a, b) => PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase));
      return {
        classification,
        modules: kept.map(m => m.id),
        estimatedCost: kept.reduce((s, m) => s + m.costEstimate, 0),
        estimatedLatencyMs: kept.reduce((s, m) => s + m.avgLatencyMs, 0),
        rationale: `${classification}: ${kept.length} modules (${alwaysActive.length} always-active + ${kept.length - alwaysActive.length} selected, capped from ${selected.length})`,
      };
    }

    return {
      classification,
      modules: selected.map(m => m.id),
      estimatedCost: selected.reduce((s, m) => s + m.costEstimate, 0),
      estimatedLatencyMs: selected.reduce((s, m) => s + m.avgLatencyMs, 0),
      rationale: `${classification}: ${selected.length} modules selected`,
    };
  }

  // =========================================================================
  // Execution — run selected modules in order
  // =========================================================================

  async execute(input: string): Promise<NucleusContext> {
    const executionPlan = this.plan(input);
    const ctx: NucleusContext = {
      input,
      classification: executionPlan.classification,
      processContext: {},
      response: '',
      confidence: null,
      audit: null,
      activatedModules: [],
      timings: {},
      startTime: Date.now(),
      fekState: null,
      meta: {},
    };

    // Execute each module in plan order
    for (const moduleId of executionPlan.modules) {
      const mod = this.modules.get(moduleId);
      if (!mod?.execute) continue;

      const moduleStart = Date.now();
      try {
        await mod.execute(input, ctx);
        ctx.activatedModules.push(moduleId);
      } catch (err) {
        // Non-fatal: log and continue
        console.debug(`[Nucleus] Module '${moduleId}' failed (non-fatal):`, (err as Error)?.message);
      }
      ctx.timings[moduleId] = Date.now() - moduleStart;
    }

    // Record outcome for plasticity learning
    const totalLatency = Date.now() - ctx.startTime;
    const confidenceValue = ctx.confidence?.value ?? 0.5;
    const outcome: ProcessingOutcome = {
      classification: executionPlan.classification,
      modulesUsed: ctx.activatedModules,
      latencyMs: totalLatency,
      confidence: confidenceValue,
      success: confidenceValue > 0.4,
      cost: Object.values(ctx.timings).reduce((a, b) => a + b, 0) * 0.0001,
      timestamp: Date.now(),
    };
    getPlasticity().record(outcome);

    // Publish cycle completed
    try {
      const { getEventBus } = await import('../bus/index.js');
      const bus = getEventBus();
      bus.publish('nucleus.cycle.completed', {
        source: 'nucleus-orchestrator',
        precision: 0.8,
        classification: executionPlan.classification,
        modulesActivated: ctx.activatedModules.length,
        totalModulesAvailable: this.modules.size,
        latencyMs: totalLatency,
        confidence: confidenceValue,
      });
    } catch (err) {
      // Bus not available
      console.error('[NucleusOrchestrator] Failed to publish nucleus event:', err);
    }

    return ctx;
  }

  // =========================================================================
  // Module binding — called at boot by genesis.ts
  // =========================================================================

  bindModule(id: string, fn: (input: string, ctx: NucleusContext) => Promise<void>): void {
    const mod = this.modules.get(id);
    if (mod) {
      mod.execute = fn;
    } else {
      console.warn(`[Nucleus] bindModule: unknown module '${id}'`);
    }
  }

  updateLatency(id: string, latencyMs: number): void {
    const mod = this.modules.get(id);
    if (mod) {
      // EMA update for observed latency
      mod.avgLatencyMs = mod.avgLatencyMs * 0.85 + latencyMs * 0.15;
    }
  }

  // =========================================================================
  // Introspection
  // =========================================================================

  getModuleCount(): number {
    return this.modules.size;
  }

  getBoundModuleCount(): number {
    let count = 0;
    for (const mod of this.modules.values()) {
      if (mod.execute) count++;
    }
    return count;
  }

  getModuleMap(): Map<string, ModuleDescriptor> {
    return this.modules;
  }
}

// Singleton
let instance: Orchestrator | null = null;

export function getNucleus(): Orchestrator {
  if (!instance) instance = new Orchestrator();
  return instance;
}

export function resetNucleus(): void {
  instance = null;
}
