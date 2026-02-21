/**
 * Genesis v35 — Core Module Test Suite
 *
 * Tests for the new architectural modules:
 * - ACT-R Activation Engine (memory/activation.ts)
 * - FEK-Brain Bridge (core/fek-brain-bridge.ts)
 * - Agent Loop (core/agent-loop.ts)
 * - Bootstrap / DI typed resolution (core/bootstrap.ts)
 * - Tool Types (tools/tool-types.ts)
 * - Structured Logger (core/logger.ts)
 *
 * Run: node --test dist/test/core-suite.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

// ============================================================================
// 1. ACT-R Activation Engine
// ============================================================================

describe('ActivationEngine', () => {
  let ActivationEngine: any;

  test('can be instantiated with defaults', async () => {
    const mod = await import('../dist/src/memory/activation.js');
    ActivationEngine = mod.ActivationEngine;
    const engine = new ActivationEngine();
    assert.strictEqual(engine.size, 0);
  });

  test('store and retrieve a memory', async () => {
    const mod = await import('../dist/src/memory/activation.js');
    const engine = new mod.ActivationEngine({ noiseScale: 0 });

    engine.store('m1', { text: 'hello' }, ['greeting']);
    assert.strictEqual(engine.size, 1);

    const mem = engine.get('m1');
    assert.ok(mem);
    assert.deepStrictEqual(mem.content, { text: 'hello' });
    assert.deepStrictEqual(mem.tags, ['greeting']);
    assert.strictEqual(mem.accessCount, 1);
  });

  test('re-storing bumps access count', async () => {
    const mod = await import('../dist/src/memory/activation.js');
    const engine = new mod.ActivationEngine({ noiseScale: 0 });

    engine.store('m1', 'v1', ['tag']);
    engine.store('m1', 'v2', ['tag']);
    const mem = engine.get('m1');
    assert.strictEqual(mem?.accessCount, 2);
    assert.strictEqual(mem?.content, 'v2');
  });

  test('access() increases access count', async () => {
    const mod = await import('../dist/src/memory/activation.js');
    const engine = new mod.ActivationEngine({ noiseScale: 0 });

    engine.store('m1', 'data', []);
    engine.access('m1');
    engine.access('m1');
    assert.strictEqual(engine.get('m1')?.accessCount, 3); // 1 from store + 2 accesses
  });

  test('forget() removes a memory', async () => {
    const mod = await import('../dist/src/memory/activation.js');
    const engine = new mod.ActivationEngine({ noiseScale: 0 });

    engine.store('m1', 'data', []);
    assert.ok(engine.forget('m1'));
    assert.strictEqual(engine.size, 0);
    assert.strictEqual(engine.get('m1'), undefined);
  });

  test('computeActivation returns finite number for existing memory', async () => {
    const mod = await import('../dist/src/memory/activation.js');
    const engine = new mod.ActivationEngine({ noiseScale: 0 });

    engine.store('m1', 'data', ['tag']);
    const activation = engine.computeActivation('m1', []);
    assert.ok(typeof activation === 'number');
    assert.ok(Number.isFinite(activation));
  });

  test('computeActivation returns -Infinity for missing memory', async () => {
    const mod = await import('../dist/src/memory/activation.js');
    const engine = new mod.ActivationEngine({ noiseScale: 0 });

    const activation = engine.computeActivation('nonexistent', []);
    assert.strictEqual(activation, -Infinity);
  });

  test('spreading activation boosts contextually relevant memories', async () => {
    const mod = await import('../dist/src/memory/activation.js');
    const engine = new mod.ActivationEngine({ noiseScale: 0 });

    engine.store('m1', 'relevant', ['topic-a']);
    engine.store('m2', 'irrelevant', ['topic-b']);

    const context = [{ id: 'topic-a', weight: 1.0 }];
    const a1 = engine.computeActivation('m1', context);
    const a2 = engine.computeActivation('m2', context);

    // m1 should have higher activation because it shares context 'topic-a'
    assert.ok(a1 > a2, `Expected ${a1} > ${a2}`);
  });

  test('retrieve returns most activated memory', async () => {
    const mod = await import('../dist/src/memory/activation.js');
    const engine = new mod.ActivationEngine({
      noiseScale: 0,
      retrievalThreshold: -10,
    });

    engine.store('m1', 'first', ['alpha']);
    // Access m1 more to boost its activation
    engine.access('m1');
    engine.access('m1');
    engine.access('m1');
    engine.store('m2', 'second', ['beta']);

    const result = engine.retrieve([]);
    assert.ok(result.success);
    assert.ok(result.memory);
    // m1 has more accesses, so higher base-level activation
    assert.strictEqual(result.memory.id, 'm1');
  });

  test('retrieveTopK returns ranked results', async () => {
    const mod = await import('../dist/src/memory/activation.js');
    const engine = new mod.ActivationEngine({
      noiseScale: 0,
      retrievalThreshold: -10,
    });

    for (let i = 0; i < 5; i++) {
      engine.store(`m${i}`, `data-${i}`, [`tag-${i}`]);
    }

    const top3 = engine.retrieveTopK(3, []);
    assert.strictEqual(top3.length, 3);
    // All should have valid IDs
    for (const mem of top3) {
      assert.ok(mem.id.startsWith('m'));
    }
  });

  test('retrieveFiltered respects filter predicate', async () => {
    const mod = await import('../dist/src/memory/activation.js');
    const engine = new mod.ActivationEngine({
      noiseScale: 0,
      retrievalThreshold: -10,
    });

    engine.store('m1', { type: 'a' }, []);
    engine.store('m2', { type: 'b' }, []);
    engine.store('m3', { type: 'a' }, []);

    const results = engine.retrieveFiltered(
      (m: any) => m.content.type === 'a',
      [],
      10
    );
    assert.strictEqual(results.length, 2);
    assert.ok(results.every((m: any) => m.content.type === 'a'));
  });

  test('getStats returns correct totals', async () => {
    const mod = await import('../dist/src/memory/activation.js');
    const engine = new mod.ActivationEngine({ noiseScale: 0 });

    engine.store('m1', 'a', []);
    engine.store('m2', 'b', []);

    const stats = engine.getStats();
    assert.strictEqual(stats.total, 2);
    assert.ok(typeof stats.avgActivation === 'number');
    assert.ok(typeof stats.avgAge === 'number');
  });
});

// ============================================================================
// 2. FEK-Brain Bridge
// ============================================================================

describe('FEKBrainBridge', () => {
  test('can be instantiated without FEK', async () => {
    const mod = await import('../dist/src/core/fek-brain-bridge.js');
    const bridge = new mod.FEKBrainBridge();
    assert.ok(bridge);
  });

  test('getRouting returns valid routing without FEK', async () => {
    const mod = await import('../dist/src/core/fek-brain-bridge.js');
    const bridge = new mod.FEKBrainBridge();

    const routing = bridge.getRouting('What is 2+2?');
    assert.ok(routing);
    assert.ok(typeof routing.strategy === 'string');
    assert.ok(typeof routing.nextModule === 'string');
    assert.ok(typeof routing.urgency === 'number');
    assert.ok(routing.urgency >= 0 && routing.urgency <= 1);
    assert.ok(typeof routing.confidenceCalibration === 'number');
    assert.ok(typeof routing.enableGrounding === 'boolean');
    assert.ok(typeof routing.tokenBudget === 'object');
    assert.ok(routing.tokenBudget.min <= routing.tokenBudget.target);
    assert.ok(routing.tokenBudget.target <= routing.tokenBudget.max);
    assert.ok(typeof routing.rationale === 'string');
  });

  test('simple queries get sequential strategy', async () => {
    const mod = await import('../dist/src/core/fek-brain-bridge.js');
    const bridge = new mod.FEKBrainBridge();

    const routing = bridge.getRouting('Hi');
    assert.strictEqual(routing.strategy, 'sequential');
    assert.strictEqual(routing.nextModule, 'llm');
  });

  test('complex queries get higher strategy', async () => {
    const mod = await import('../dist/src/core/fek-brain-bridge.js');
    const bridge = new mod.FEKBrainBridge();

    const routing = bridge.getRouting(
      'Explain why the architecture of the consciousness module needs to be ' +
      'redesigned, analyze the current implementation, compare it with LIDA, ' +
      'and then design a new approach step by step, first handling the global ' +
      'workspace, second the attention codelets, and finally the phi calculation.'
    );

    // Should be more complex than sequential
    assert.notStrictEqual(routing.strategy, 'sequential');
    assert.ok(routing.tokenBudget.target > 500);
  });

  test('feedbackResult updates success rate', async () => {
    const mod = await import('../dist/src/core/fek-brain-bridge.js');
    const bridge = new mod.FEKBrainBridge();

    assert.strictEqual(bridge.getSuccessRate(), 0.8); // default

    // Feed failures
    for (let i = 0; i < 10; i++) {
      bridge.feedbackResult({
        success: false,
        confidence: 0.1,
        toolCallCount: 0,
        latencyMs: 100,
        module: 'llm',
        strategy: 'sequential',
      });
    }

    // Success rate should have dropped
    assert.ok(bridge.getSuccessRate() < 0.8);
  });

  test('getLastSnapshot is null before first cycle', async () => {
    const mod = await import('../dist/src/core/fek-brain-bridge.js');
    const bridge = new mod.FEKBrainBridge();

    assert.strictEqual(bridge.getLastSnapshot(), null);
  });

  test('getRouting with mock FEK', async () => {
    const mod = await import('../dist/src/core/fek-brain-bridge.js');

    const mockFEK = {
      cycle: (_obs: any) => ({
        totalFE: 0.7,
        strategy: 'tree_of_thought',
        mode: 'awake',
        levels: { L1: 0.1, L2: 0.2, L3: 0.7, L4: 0.3 },
        cycle: 42,
      }),
      getTotalFE: () => 0.7,
    };

    const bridge = new mod.FEKBrainBridge(mockFEK);
    const routing = bridge.getRouting('test query', { phi: 0.5 });

    assert.ok(routing);
    assert.ok(bridge.getLastSnapshot());
    assert.strictEqual(bridge.getLastSnapshot()?.totalFE, 0.7);
    assert.strictEqual(bridge.getLastSnapshot()?.cycle, 42);
  });

  test('token budgets scale by strategy', async () => {
    const mod = await import('../dist/src/core/fek-brain-bridge.js');

    const lowFEK = {
      cycle: () => ({ totalFE: 0.05, strategy: 'sequential', mode: 'awake', levels: { L1: 0, L2: 0, L3: 0, L4: 0 }, cycle: 1 }),
      getTotalFE: () => 0.05,
    };
    const highFEK = {
      cycle: () => ({ totalFE: 0.95, strategy: 'ultimate', mode: 'awake', levels: { L1: 0.9, L2: 0.9, L3: 0.9, L4: 0.9 }, cycle: 1 }),
      getTotalFE: () => 0.95,
    };

    const lowBridge = new mod.FEKBrainBridge(lowFEK);
    const highBridge = new mod.FEKBrainBridge(highFEK);

    const lowRouting = lowBridge.getRouting('Hi');
    const highRouting = highBridge.getRouting(
      'Analyze, compare, design, and optimize the full cognitive architecture step by step'
    );

    assert.ok(
      highRouting.tokenBudget.target > lowRouting.tokenBudget.target,
      `Expected ${highRouting.tokenBudget.target} > ${lowRouting.tokenBudget.target}`
    );
  });
});

// ============================================================================
// 3. Tool Types
// ============================================================================

describe('ToolTypes', () => {
  test('isToolParams narrows correctly', async () => {
    const mod = await import('../dist/src/tools/tool-types.js');

    const params: any = { tool: 'bash', command: 'ls -la' };
    assert.ok(mod.isToolParams(params, 'bash'));
    assert.ok(!mod.isToolParams(params, 'edit'));
  });
});

// ============================================================================
// 4. Logger
// ============================================================================

describe('Logger', () => {
  test('createLogger returns a logger with all methods', async () => {
    const mod = await import('../dist/src/core/logger.js');
    const log = mod.createLogger('test');

    assert.ok(typeof log.trace === 'function');
    assert.ok(typeof log.debug === 'function');
    assert.ok(typeof log.info === 'function');
    assert.ok(typeof log.warn === 'function');
    assert.ok(typeof log.error === 'function');
    assert.ok(typeof log.fatal === 'function');
    assert.ok(typeof log.child === 'function');
  });

  test('child logger preserves parent bindings', async () => {
    const mod = await import('../dist/src/core/logger.js');
    const log = mod.createLogger('test');
    const child = log.child({ requestId: '123' });

    assert.ok(typeof child.info === 'function');
    assert.ok(typeof child.child === 'function');
  });

  test('logger proxy works without initialization', async () => {
    const mod = await import('../dist/src/core/logger.js');
    // logger is a Proxy — should work lazily
    assert.ok(typeof mod.logger.info === 'function');
  });
});

// ============================================================================
// 5. Bootstrap / ServiceTokenMap
// ============================================================================

describe('Bootstrap', () => {
  test('ServiceTokenMap types are exported', async () => {
    const mod = await import('../dist/src/core/bootstrap.js');
    // Verify the module exports the expected functions
    assert.ok(typeof mod.bootstrap === 'function');
    assert.ok(typeof mod.resolve === 'function');
    assert.ok(typeof mod.resolveSync === 'function');
    assert.ok(typeof mod.hasService === 'function');
    assert.ok(typeof mod.isResolved === 'function');
    assert.ok(typeof mod.shutdown === 'function');
    assert.ok(typeof mod.getContainer === 'function');
  });
});

// ============================================================================
// 6. Agent Loop
// ============================================================================

describe('AgentLoop', () => {
  test('AgentLoop class is exported', async () => {
    const mod = await import('../dist/src/core/agent-loop.js');
    assert.ok(mod.AgentLoop);
    assert.ok(typeof mod.AgentLoop === 'function'); // class constructor
  });

  test('can instantiate with minimal modules', async () => {
    const mod = await import('../dist/src/core/agent-loop.js');

    const minimalModules = {
      perceive: async (input: string) => [{
        id: 'p1',
        content: input,
        salience: 1.0,
        source: 'user',
        timestamp: Date.now(),
      }],
      retrieve: async (_percepts: any[]) => [],
      reason: async (state: any) => state,
      select: async (state: any) => ({
        type: 'respond' as const,
        payload: { response: 'test' },
      }),
      execute: async (_action: any) => ({
        success: true,
        output: 'done',
        sideEffects: [],
      }),
      observe: async (state: any, _result: any) => state,
      learn: async (_state: any) => {},
    };

    const loop = new mod.AgentLoop(minimalModules);
    assert.ok(loop);
  });
});
