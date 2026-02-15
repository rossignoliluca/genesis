/**
 * Genesis v32 - Core Test Suite (Item 18)
 *
 * Minimum viable test suite for critical Genesis systems:
 * - Memory system (remember, learn, recall, consolidate)
 * - Active inference (outcome integrator, belief updates)
 * - Feedback engine (predictions, scoring, Brier score)
 * - Market strategist types (serialization, validation)
 *
 * Run: npx tsx tests/core-suite.test.ts
 *   or: node --test tests/core-suite.test.ts
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

// ============================================================================
// Memory System Tests
// ============================================================================

describe('Memory System', () => {
  let memory: any;

  beforeEach(async () => {
    const { createMemorySystem } = await import('../src/memory/index.js');
    memory = createMemorySystem({ consolidation: { autoStart: false } });
  });

  it('should store and recall episodic memories', () => {
    const ep = memory.remember({
      what: 'S&P 500 dropped 3% on tariff news',
      importance: 0.8,
      tags: ['market', 'equities'],
      source: 'test',
    });

    assert.ok(ep.id, 'should have an ID');
    assert.strictEqual(ep.type, 'episodic');

    const results = memory.recall('S&P tariff', { types: ['episodic'] });
    assert.ok(results.length > 0, 'should find the memory');
    assert.ok(results[0].content.what.includes('tariff'));
  });

  it('should store and retrieve semantic facts', () => {
    const fact = memory.learn({
      concept: 'gold-structural-position',
      definition: 'Gold is structural, not tactical — driven by central bank accumulation',
      category: 'market-strategy',
      tags: ['market', 'gold'],
      confidence: 0.9,
      importance: 0.85,
    });

    assert.ok(fact.id);
    assert.strictEqual(fact.type, 'semantic');

    const retrieved = memory.getFact('gold-structural-position');
    assert.ok(retrieved, 'should find by concept');
    assert.ok(retrieved!.content.definition.includes('structural'));
  });

  it('should respect FSRS stability for forgetting', () => {
    const ep = memory.remember({
      what: 'Test memory with low stability',
      importance: 0.3,
      tags: ['test'],
      source: 'test',
    });

    assert.ok(ep.S > 0, 'stability should be positive');
    assert.ok(ep.R0 > 0 && ep.R0 <= 1, 'initial retention should be 0-1');
  });

  it('should recall with limit', () => {
    for (let i = 0; i < 10; i++) {
      memory.remember({ what: `Event ${i}`, importance: 0.5, tags: ['bulk'], source: 'test' });
    }

    const results = memory.recall('Event', { limit: 3 });
    assert.ok(results.length <= 3, 'should respect limit');
  });

  it('should export and provide stats', () => {
    memory.remember({ what: 'Test', importance: 0.5, tags: [], source: 'test' });
    memory.learn({ concept: 'c1', definition: 'd1', category: 'test', tags: [], confidence: 0.5, importance: 0.5 });

    const stats = memory.getStats();
    assert.ok(stats.total >= 2);
    assert.ok(stats.episodic.total >= 1);
    assert.ok(stats.semantic.total >= 1);
  });
});

// ============================================================================
// Outcome Integrator Tests
// ============================================================================

describe('Outcome Integrator', () => {
  let integrator: any;

  beforeEach(async () => {
    const { OutcomeIntegrator } = await import('../src/active-inference/outcome-integrator.js');
    integrator = new OutcomeIntegrator();
  });

  it('should record outcomes and update beliefs', () => {
    const updates = integrator.recordOutcome({
      toolName: 'brave_search',
      success: true,
      executionTimeMs: 500,
      resultSummary: 'Found 5 results',
      surprise: 0.1,
      timestamp: new Date(),
    });

    assert.ok(updates.length > 0, 'should produce belief updates');
    assert.strictEqual(updates[0].dimension, 'tool_reliability');
    assert.ok(updates[0].posteriorValue > 0);
  });

  it('should track tool reliability', () => {
    // Record successes
    for (let i = 0; i < 5; i++) {
      integrator.recordOutcome({
        toolName: 'test_tool',
        success: true,
        executionTimeMs: 100,
        resultSummary: 'ok',
        surprise: 0,
        timestamp: new Date(),
      });
    }

    // Record failure
    integrator.recordOutcome({
      toolName: 'test_tool',
      success: false,
      executionTimeMs: 100,
      resultSummary: 'error',
      surprise: 0.8,
      timestamp: new Date(),
    });

    const reliability = integrator.getToolReliability('test_tool');
    assert.ok(reliability > 0.7 && reliability < 1.0, `reliability should be ~0.83, got ${reliability}`);
  });

  it('should detect environment instability from surprise', () => {
    const initialBeliefs = integrator.getBeliefs();
    const initialStability = initialBeliefs.environment_stability;

    integrator.recordOutcome({
      toolName: 'test',
      success: false,
      executionTimeMs: 100,
      resultSummary: 'unexpected result',
      surprise: 0.9,
      timestamp: new Date(),
    });

    const updatedBeliefs = integrator.getBeliefs();
    assert.ok(
      updatedBeliefs.environment_stability < initialStability,
      'stability should decrease after high surprise',
    );
  });

  it('should recommend policy adjustments', () => {
    const rec = integrator.recommendPolicyAdjustment();
    assert.ok('shouldEscalateStrategy' in rec);
    assert.ok('shouldReduceParallelism' in rec);
    assert.ok('shouldIncreaseVerification' in rec);
    assert.ok('reason' in rec);
  });
});

// ============================================================================
// Feedback Engine Tests
// ============================================================================

describe('Feedback Engine', () => {
  let engine: any;

  beforeEach(async () => {
    const { FeedbackEngine } = await import('../src/market-strategist/feedback.js');
    engine = new FeedbackEngine();
  });

  it('should create predictions from a brief', () => {
    const brief = createMockBrief();
    const predictions = engine.createPredictions(brief);

    assert.ok(predictions.length > 0, 'should create predictions');
    assert.strictEqual(predictions[0].outcome, 'pending');
    assert.ok(predictions[0].entryPrice > 0);
  });

  it('should score expired predictions', () => {
    const fourWeeksAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const predictions = [{
      id: 'p1',
      week: '2026-W02',
      date: fourWeeksAgo.toISOString().slice(0, 10),
      assetClass: 'US Equities',
      position: 'long' as const,
      conviction: 'high' as const,
      rationale: 'test',
      entryPrice: 5000,
      entryTicker: 'S&P 500',
      timeframeWeeks: 4,
      outcome: 'pending' as const,
    }];

    const markets = [{ name: 'S&P 500', level: '5,200', change1w: '+2%', changeMtd: '+3%', changeYtd: '+5%', signal: 'bullish' as const, commentary: '' }];

    const scored = engine.scorePredictions(predictions, markets);
    assert.ok(scored.length > 0, 'should score expired predictions');
    assert.strictEqual(scored[0].outcome, 'correct'); // 5000 → 5200 = +4%
    assert.ok(scored[0].pnlPercent! > 0);
  });

  it('should compute track record with Brier score', () => {
    const predictions = [
      { id: 'p1', week: '2026-W02', date: new Date().toISOString().slice(0, 10), assetClass: 'US Equities', position: 'long', conviction: 'high', rationale: 't', entryPrice: 5000, entryTicker: 'SPX', timeframeWeeks: 4, outcome: 'correct', pnlPercent: 3, scoredAt: new Date().toISOString() },
      { id: 'p2', week: '2026-W02', date: new Date().toISOString().slice(0, 10), assetClass: 'Gold', position: 'long', conviction: 'medium', rationale: 't', entryPrice: 2000, entryTicker: 'Gold', timeframeWeeks: 4, outcome: 'incorrect', pnlPercent: -1, scoredAt: new Date().toISOString() },
    ];

    const record = engine.computeTrackRecord(predictions, 26);

    assert.ok(record.overallHitRate === 0.5, `hit rate should be 0.5, got ${record.overallHitRate}`);
    assert.ok(typeof record.brierScore === 'number', 'should have Brier score');
    assert.ok(record.brierScore >= 0 && record.brierScore <= 1, 'Brier score should be 0-1');
    assert.ok(typeof record.calibrationGrade === 'string', 'should have calibration grade');
    assert.ok(typeof record.baseRateAlpha === 'number', 'should have base rate alpha');
  });
});

// ============================================================================
// Helpers
// ============================================================================

function createMockBrief() {
  return {
    id: 'test-brief',
    week: '2026-W07',
    date: '2026-02-14',
    snapshot: {
      week: '2026-W07',
      date: '2026-02-14',
      markets: [
        { name: 'S&P 500', level: '6,100', change1w: '+1.2%', changeMtd: '+2.1%', changeYtd: '+4.5%', signal: 'bullish' as const, commentary: 'Strong' },
        { name: 'Gold', level: '2,950', change1w: '+0.8%', changeMtd: '+1.5%', changeYtd: '+6.0%', signal: 'bullish' as const, commentary: 'Structural' },
      ],
      headlines: [],
      themes: ['AI', 'Rates'],
      sentiment: { overall: 'bullish' as const, score: 0.6, indicators: {} },
      sources: [],
    },
    narratives: [],
    positioning: [
      { assetClass: 'US Equities', position: 'long' as const, conviction: 'high' as const, rationale: 'Momentum' },
      { assetClass: 'Gold', position: 'long' as const, conviction: 'medium' as const, rationale: 'Structural' },
    ],
    risks: ['Tariff escalation'],
    opportunities: ['Europe re-rating'],
  };
}
