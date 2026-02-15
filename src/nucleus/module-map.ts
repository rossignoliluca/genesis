/**
 * Nucleus v34 — Module Map
 *
 * Registry of ~25 processing modules extracted from the genesis.ts process() pipeline.
 * Each module has phase, cost, latency, domain weights, and an execute slot bound at boot.
 */

import type { ModuleDescriptor, InputClassification, ModulePhase } from './types.js';

const ALL_CLASSIFICATIONS: InputClassification[] = [
  'simple_chat', 'analysis', 'creative', 'reasoning',
  'market', 'code', 'life_assist', 'system', 'unknown',
];

function weights(
  defaults: number,
  overrides: Partial<Record<InputClassification, number>> = {},
): Record<InputClassification, number> {
  const w: Record<string, number> = {};
  for (const c of ALL_CLASSIFICATIONS) w[c] = defaults;
  for (const [k, v] of Object.entries(overrides)) w[k] = v!;
  return w as Record<InputClassification, number>;
}

function mod(
  id: string,
  name: string,
  phase: ModulePhase,
  opts: {
    cost?: number;
    latency?: number;
    always?: boolean;
    deps?: string[];
    domains?: InputClassification[];
    defaultWeight?: number;
    overrides?: Partial<Record<InputClassification, number>>;
  } = {},
): ModuleDescriptor {
  return {
    id,
    name,
    phase,
    costEstimate: opts.cost ?? 0.005,
    avgLatencyMs: opts.latency ?? 5,
    domains: opts.domains ?? ALL_CLASSIFICATIONS,
    dependencies: opts.deps ?? [],
    alwaysActive: opts.always ?? false,
    activationWeights: weights(opts.defaultWeight ?? 0.5, opts.overrides),
    execute: null,
  };
}

export function createModuleMap(): Map<string, ModuleDescriptor> {
  const map = new Map<string, ModuleDescriptor>();

  const modules: ModuleDescriptor[] = [
    // === GATE ===
    mod('consciousness-gate', 'Consciousness Gate', 'gate', {
      always: true, cost: 0.001, latency: 1,
    }),
    mod('nociception-gate', 'Nociception Gate', 'gate', {
      always: true, cost: 0.001, latency: 1,
    }),

    // === PRE ===
    mod('factor-graph', 'Factor Graph Propagation', 'pre', {
      cost: 0.003, latency: 5,
      overrides: { reasoning: 0.9, analysis: 0.9, market: 0.8, simple_chat: 0.1, creative: 0.2 },
    }),
    mod('limbic-pre', 'Limbic Pre-evaluation', 'pre', {
      cost: 0.001, latency: 2,
      overrides: { creative: 0.9, life_assist: 0.8, simple_chat: 0.7, reasoning: 0.3, code: 0.2 },
    }),
    mod('metacognition-pre', 'Metacognition Pre-check', 'pre', {
      cost: 0.005, latency: 3,
      overrides: { reasoning: 0.9, analysis: 0.85, code: 0.8, market: 0.8, simple_chat: 0.1 },
    }),

    // === CONTEXT ===
    mod('workspace-anticipate', 'Workspace Anticipation', 'context', {
      cost: 0.005, latency: 15,
      overrides: { reasoning: 0.85, analysis: 0.8, code: 0.75, market: 0.7, simple_chat: 0.1 },
    }),
    mod('memory-recall', 'Memory Recall', 'context', {
      cost: 0.003, latency: 10,
      defaultWeight: 0.6,
      overrides: { simple_chat: 0.3, system: 0.2 },
    }),
    mod('sensorimotor-inject', 'Sensorimotor Injection', 'context', {
      cost: 0.001, latency: 2,
      defaultWeight: 0.05,
      overrides: { system: 0.8 },
    }),
    mod('neuromod-inject', 'Neuromodulation Injection', 'context', {
      cost: 0.001, latency: 1,
      overrides: { reasoning: 0.8, creative: 0.85, market: 0.75, simple_chat: 0.2, code: 0.3 },
    }),
    mod('allostasis-inject', 'Allostasis Injection', 'context', {
      cost: 0.001, latency: 1,
      defaultWeight: 0.05,
      overrides: { system: 0.8 },
    }),
    mod('worldmodel-encode', 'World Model Encoding', 'context', {
      cost: 0.005, latency: 8,
      overrides: { reasoning: 0.85, market: 0.8, analysis: 0.8, simple_chat: 0.1, creative: 0.3 },
    }),

    // === PROCESS ===
    mod('brain-process', 'Brain Processing', 'process', {
      always: true, cost: 0.02, latency: 200,
    }),

    // === AUDIT ===
    mod('worldmodel-predict-error', 'World Model Prediction Error', 'audit', {
      cost: 0.003, latency: 5, deps: ['brain-process', 'worldmodel-encode'],
      overrides: { reasoning: 0.8, market: 0.75, simple_chat: 0.05, creative: 0.2 },
    }),
    mod('healing', 'Healing', 'audit', {
      cost: 0.003, latency: 5, deps: ['brain-process'],
      overrides: { code: 0.85, analysis: 0.7, reasoning: 0.4, simple_chat: 0.1 },
    }),
    mod('epistemic-grounding', 'Epistemic Grounding', 'audit', {
      always: true, cost: 0.002, latency: 3, deps: ['brain-process'],
    }),
    mod('metacognition-audit', 'Metacognition Audit', 'audit', {
      cost: 0.005, latency: 5, deps: ['brain-process'],
      overrides: { reasoning: 0.9, analysis: 0.85, code: 0.8, market: 0.8, simple_chat: 0.1 },
    }),
    mod('grounding-verify', 'Grounding Verification', 'audit', {
      cost: 0.008, latency: 10, deps: ['brain-process', 'metacognition-audit'],
      overrides: { market: 0.85, analysis: 0.8, reasoning: 0.5, simple_chat: 0.05 },
    }),
    mod('conformal', 'Conformal Prediction', 'audit', {
      cost: 0.002, latency: 2, deps: ['metacognition-audit'],
      overrides: { market: 0.8, reasoning: 0.7, analysis: 0.6, simple_chat: 0.05 },
    }),
    mod('limbic-post', 'Limbic Post-evaluation', 'audit', {
      cost: 0.001, latency: 2, deps: ['brain-process'],
      overrides: { creative: 0.85, life_assist: 0.8, simple_chat: 0.3, reasoning: 0.2 },
    }),

    // === POST ===
    mod('fek-cycle', 'FEK Cycle', 'post', {
      always: true, cost: 0.002, latency: 3,
    }),

    // === TRACK ===
    mod('economic-tracking', 'Economic Tracking', 'track', {
      always: true, cost: 0.001, latency: 2,
    }),
    mod('ness-observe', 'NESS Observation', 'track', {
      always: true, cost: 0.001, latency: 2,
    }),
    mod('meta-rl', 'Meta-RL Learning', 'track', {
      cost: 0.002, latency: 3,
      overrides: { reasoning: 0.85, code: 0.8, analysis: 0.8, market: 0.75, simple_chat: 0.1 },
    }),
    mod('dashboard-broadcast', 'Dashboard Broadcast', 'track', {
      always: true, cost: 0.001, latency: 1,
    }),
  ];

  for (const m of modules) map.set(m.id, m);
  return map;
}
