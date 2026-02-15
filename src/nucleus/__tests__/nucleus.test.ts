import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

import { Orchestrator } from '../orchestrator.js';
import { Plasticity } from '../plasticity.js';
import { createModuleMap } from '../module-map.js';
import type { ProcessingOutcome, NucleusContext, InputClassification } from '../types.js';

describe('Nucleus — Classification', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    orchestrator = new Orchestrator();
  });

  it('classifies greetings as simple_chat', () => {
    assert.strictEqual(orchestrator.classify('hello'), 'simple_chat');
    assert.strictEqual(orchestrator.classify('Hi!'), 'simple_chat');
    assert.strictEqual(orchestrator.classify('hey'), 'simple_chat');
    assert.strictEqual(orchestrator.classify('Good morning'), 'simple_chat');
  });

  it('classifies market queries', () => {
    assert.strictEqual(orchestrator.classify('What is the stock price of AAPL?'), 'market');
    assert.strictEqual(orchestrator.classify('Analyze the crypto market trends'), 'market');
    assert.strictEqual(orchestrator.classify('Show me portfolio performance'), 'market');
  });

  it('classifies code queries', () => {
    assert.strictEqual(orchestrator.classify('Fix the bug in the login function'), 'code');
    assert.strictEqual(orchestrator.classify('Refactor this TypeScript class'), 'code');
    assert.strictEqual(orchestrator.classify('Write a Python script for data processing'), 'code');
  });

  it('classifies analysis queries', () => {
    assert.strictEqual(orchestrator.classify('Analyze the data distribution'), 'analysis');
    assert.strictEqual(orchestrator.classify('Compare these two metrics'), 'analysis');
  });

  it('classifies reasoning queries', () => {
    assert.strictEqual(orchestrator.classify('Think through the implications of this decision'), 'reasoning');
    assert.strictEqual(orchestrator.classify('Plan a strategy for the next quarter'), 'reasoning');
  });

  it('classifies creative queries', () => {
    assert.strictEqual(orchestrator.classify('Write a poem about the ocean'), 'creative');
    assert.strictEqual(orchestrator.classify('Design a visual concept for the landing page'), 'creative');
  });

  it('classifies system queries', () => {
    assert.strictEqual(orchestrator.classify('Show Genesis system status'), 'system');
    assert.strictEqual(orchestrator.classify('Check the nucleus module map'), 'system');
  });

  it('falls back to simple_chat for short inputs', () => {
    assert.strictEqual(orchestrator.classify('ok'), 'simple_chat');
    assert.strictEqual(orchestrator.classify('thanks'), 'simple_chat');
  });
});

describe('Nucleus — Module Selection', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    orchestrator = new Orchestrator();
  });

  it('simple_chat activates fewer modules than reasoning', () => {
    const chatPlan = orchestrator.plan('hello');
    const reasonPlan = orchestrator.plan('Think carefully about the implications of recursive self-improvement and plan a strategy');
    assert.ok(chatPlan.modules.length < reasonPlan.modules.length,
      `Chat plan has ${chatPlan.modules.length} modules, reasoning has ${reasonPlan.modules.length}`);
  });

  it('always includes always-active modules', () => {
    const plan = orchestrator.plan('hello');
    assert.ok(plan.modules.includes('consciousness-gate'), 'Missing consciousness-gate');
    assert.ok(plan.modules.includes('brain-process'), 'Missing brain-process');
    assert.ok(plan.modules.includes('fek-cycle'), 'Missing fek-cycle');
    assert.ok(plan.modules.includes('epistemic-grounding'), 'Missing epistemic-grounding');
    assert.ok(plan.modules.includes('dashboard-broadcast'), 'Missing dashboard-broadcast');
  });

  it('respects phase order', () => {
    const plan = orchestrator.plan('Analyze market trends for the portfolio');
    const phaseOrder = ['gate', 'pre', 'context', 'process', 'audit', 'post', 'track'];
    const moduleMap = createModuleMap();
    let lastPhaseIdx = -1;
    for (const modId of plan.modules) {
      const mod = moduleMap.get(modId);
      if (!mod) continue;
      const phaseIdx = phaseOrder.indexOf(mod.phase);
      assert.ok(phaseIdx >= lastPhaseIdx,
        `Module '${modId}' (phase=${mod.phase}) comes after a later phase`);
      lastPhaseIdx = phaseIdx;
    }
  });

  it('caps at 20 modules', () => {
    const plan = orchestrator.plan('Do a complete analysis with reasoning, market data, code review, and creative writing');
    assert.ok(plan.modules.length <= 20, `Plan has ${plan.modules.length} modules, max is 20`);
  });
});

describe('Nucleus — Plasticity', () => {
  let plasticity: Plasticity;

  beforeEach(() => {
    plasticity = new Plasticity();
  });

  it('updates weights after success', () => {
    const outcome: ProcessingOutcome = {
      classification: 'code',
      modulesUsed: ['brain-process', 'healing'],
      latencyMs: 100,
      confidence: 0.8,
      success: true,
      cost: 0.01,
      timestamp: Date.now(),
    };
    plasticity.record(outcome);
    const weights = plasticity.getWeightsForClassification('code');
    assert.ok(weights['brain-process'] > 0.5, `Weight should increase on success: ${weights['brain-process']}`);
    assert.ok(weights['healing'] > 0.5, `Weight should increase on success: ${weights['healing']}`);
  });

  it('updates weights after failure', () => {
    const outcome: ProcessingOutcome = {
      classification: 'reasoning',
      modulesUsed: ['factor-graph'],
      latencyMs: 500,
      confidence: 0.2,
      success: false,
      cost: 0.05,
      timestamp: Date.now(),
    };
    plasticity.record(outcome);
    const weights = plasticity.getWeightsForClassification('reasoning');
    assert.ok(weights['factor-graph'] < 0.5, `Weight should decrease on failure: ${weights['factor-graph']}`);
  });

  it('tracks stats per classification', () => {
    plasticity.record({
      classification: 'market', modulesUsed: ['brain-process'], latencyMs: 200,
      confidence: 0.7, success: true, cost: 0.02, timestamp: Date.now(),
    });
    plasticity.record({
      classification: 'market', modulesUsed: ['brain-process'], latencyMs: 300,
      confidence: 0.6, success: true, cost: 0.03, timestamp: Date.now(),
    });
    const stats = plasticity.getStats();
    const marketStats = stats.find(s => s.classification === 'market');
    assert.ok(marketStats, 'Should have market stats');
    assert.strictEqual(marketStats!.sampleCount, 2);
    assert.ok(Math.abs(marketStats!.avgConfidence - 0.65) < 0.01, `Avg confidence should be ~0.65, got ${marketStats!.avgConfidence}`);
  });

  it('clamps weights between 0.05 and 1.0', () => {
    // Record many failures to drive weight down
    for (let i = 0; i < 50; i++) {
      plasticity.record({
        classification: 'analysis', modulesUsed: ['factor-graph'], latencyMs: 10,
        confidence: 0.1, success: false, cost: 0.001, timestamp: Date.now(),
      });
    }
    const weights = plasticity.getWeightsForClassification('analysis');
    assert.ok(weights['factor-graph'] >= 0.05, `Weight should not go below 0.05: ${weights['factor-graph']}`);
  });
});

describe('Nucleus — Module Map', () => {
  it('creates expected number of modules', () => {
    const map = createModuleMap();
    assert.ok(map.size >= 20, `Expected at least 20 modules, got ${map.size}`);
    assert.ok(map.size <= 30, `Expected at most 30 modules, got ${map.size}`);
  });

  it('has all always-active modules', () => {
    const map = createModuleMap();
    const alwaysActive = Array.from(map.values()).filter(m => m.alwaysActive);
    assert.ok(alwaysActive.length >= 7, `Expected at least 7 always-active modules, got ${alwaysActive.length}`);
    const ids = alwaysActive.map(m => m.id);
    assert.ok(ids.includes('consciousness-gate'));
    assert.ok(ids.includes('brain-process'));
    assert.ok(ids.includes('fek-cycle'));
    assert.ok(ids.includes('epistemic-grounding'));
  });
});
