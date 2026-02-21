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
      shouldTerminate: (_state: any) => false,
    };

    const loop = new mod.AgentLoop(minimalModules);
    assert.ok(loop);
  });
});

// ============================================================================
// 7. Effect System
// ============================================================================

describe('Effect', () => {
  test('succeed + runPromise', async () => {
    const mod = await import('../dist/src/core/effect.js');
    const result = await mod.runPromise(mod.succeed(42));
    assert.strictEqual(result, 42);
  });

  test('fail + runPromise rejects', async () => {
    const mod = await import('../dist/src/core/effect.js');
    await assert.rejects(
      () => mod.runPromise(mod.fail(new mod.ToolError('boom'))),
      (err: any) => err._tag === 'ToolError' && err.message === 'boom'
    );
  });

  test('succeed + runSync works', async () => {
    const mod = await import('../dist/src/core/effect.js');
    const value = mod.runSync(mod.succeed('hello'));
    assert.strictEqual(value, 'hello');
  });

  test('sync + runSync works', async () => {
    const mod = await import('../dist/src/core/effect.js');
    const value = mod.runSync(mod.sync(() => 1 + 2));
    assert.strictEqual(value, 3);
  });

  test('runSync throws on async effect', async () => {
    const mod = await import('../dist/src/core/effect.js');
    const asyncEffect = mod.tryPromise(
      () => Promise.resolve(42),
      (e) => new mod.LLMError('fail', e),
    );
    assert.throws(() => mod.runSync(asyncEffect as any), /synchronous evaluator/);
  });

  test('map transforms success value', async () => {
    const mod = await import('../dist/src/core/effect.js');
    const doubled = mod.map(mod.succeed(21), (n: number) => n * 2);
    const result = await mod.runPromise(doubled);
    assert.strictEqual(result, 42);
  });

  test('flatMap chains effects', async () => {
    const mod = await import('../dist/src/core/effect.js');
    const program = mod.flatMap(
      mod.succeed(10),
      (n: number) => mod.succeed(n * 3),
    );
    const result = await mod.runPromise(program);
    assert.strictEqual(result, 30);
  });

  test('catchAll recovers from failure', async () => {
    const mod = await import('../dist/src/core/effect.js');
    const program = mod.catchAll(
      mod.fail(new mod.ToolError('oops')),
      (_err: any) => mod.succeed('recovered'),
    );
    const result = await mod.runPromise(program);
    assert.strictEqual(result, 'recovered');
  });

  test('tryPromise catches rejection', async () => {
    const mod = await import('../dist/src/core/effect.js');
    const program = mod.tryPromise(
      () => Promise.reject(new Error('network')),
      (cause) => new mod.LLMError('request failed', cause),
    );
    const result = await mod.runEither(program);
    assert.ok(mod.isLeft(result));
    assert.strictEqual(result.error._tag, 'LLMError');
  });

  test('all runs concurrently and collects', async () => {
    const mod = await import('../dist/src/core/effect.js');
    const results = await mod.runPromise(mod.all([
      mod.succeed(1),
      mod.succeed(2),
      mod.succeed(3),
    ]));
    assert.deepStrictEqual(results, [1, 2, 3]);
  });

  test('pipe composes left to right', async () => {
    const mod = await import('../dist/src/core/effect.js');
    const result = mod.pipe(
      5,
      (x: number) => x * 2,
      (x: number) => x + 1,
    );
    assert.strictEqual(result, 11);
  });

  test('runEither returns Right on success', async () => {
    const mod = await import('../dist/src/core/effect.js');
    const result = await mod.runEither(mod.succeed(99));
    assert.ok(mod.isRight(result));
    assert.strictEqual(result.value, 99);
  });

  test('timeout fails slow effects', async () => {
    const mod = await import('../dist/src/core/effect.js');
    const slow = mod.tryPromise(
      () => new Promise(r => setTimeout(() => r('done'), 500)),
      (e) => new mod.LLMError('fail', e),
    );
    const bounded = mod.timeout(slow, 50);
    const result = await mod.runEither(bounded);
    assert.ok(mod.isLeft(result));
    assert.strictEqual((result.error as any)._tag, 'TimeoutError');
  });

  test('GenesisError subtypes have correct _tag', async () => {
    const mod = await import('../dist/src/core/effect.js');
    const llm = new mod.LLMError('test');
    const tool = new mod.ToolError('test');
    const mem = new mod.MemoryError('test');
    const bus = new mod.BusError('test');
    const cfg = new mod.ConfigError('test');
    const to = new mod.TimeoutError('test');

    assert.strictEqual(llm._tag, 'LLMError');
    assert.strictEqual(tool._tag, 'ToolError');
    assert.strictEqual(mem._tag, 'MemoryError');
    assert.strictEqual(bus._tag, 'BusError');
    assert.strictEqual(cfg._tag, 'ConfigError');
    assert.strictEqual(to._tag, 'TimeoutError');

    assert.ok(llm instanceof Error);
    assert.ok(tool instanceof mod.GenesisError);
  });
});

// ============================================================================
// 8. Budget Forcing
// ============================================================================

describe('BudgetForcing', () => {
  test('estimateComplexity returns valid scores', async () => {
    const mod = await import('../dist/src/thinking/budget-forcing.js');
    const simple = mod.estimateComplexity('hello');
    assert.ok(simple.score >= 0 && simple.score <= 1);

    const complex = mod.estimateComplexity(
      'Explain why the quantum field theory approach to consciousness ' +
      'requires analyzing the Hamiltonian, then compare with IIT, ' +
      'and finally derive the mathematical proof step by step'
    );
    assert.ok(complex.score > simple.score);
  });

  test('allocateBudget distributes across phases', async () => {
    const mod = await import('../dist/src/thinking/budget-forcing.js');
    const complexity = mod.estimateComplexity('analyze this problem');
    const budget = mod.allocateBudget(complexity, 4000);
    assert.ok(budget.totalBudget === 4000);
    assert.ok(budget.phases.length > 0);
    assert.ok(budget.softCeiling > 0);
    assert.ok(budget.hardFloor > 0);
  });

  test('shouldExtendThinking detects premature stops', async () => {
    const mod = await import('../dist/src/thinking/budget-forcing.js');
    const complexity = mod.estimateComplexity('explain quantum computing step by step');
    const budget = mod.allocateBudget(complexity, 4000);
    // Very few tokens used → should extend
    const extend = mod.shouldExtendThinking(10, budget);
    assert.strictEqual(extend, true);
  });

  test('shouldTruncateThinking detects over-generation', async () => {
    const mod = await import('../dist/src/thinking/budget-forcing.js');
    const complexity = mod.estimateComplexity('hi');
    const budget = mod.allocateBudget(complexity, 500);
    // Way past soft ceiling + high confidence → should truncate
    const truncate = mod.shouldTruncateThinking(budget.softCeiling + 100, budget, 0.95);
    assert.strictEqual(truncate, true);
  });
});

// ============================================================================
// 9. Plan-and-Budget
// ============================================================================

describe('PlanAndBudget', () => {
  test('PlanAndBudget class can plan and allocate', async () => {
    const mod = await import('../dist/src/reasoning/plan-and-budget.js');
    const pab = new mod.PlanAndBudget();

    const plan = pab.plan(
      'First explain the concept, then compare approaches, and finally recommend one',
      4000
    );

    assert.ok(plan.subQuestions.length > 0);
    assert.strictEqual(plan.totalBudget, 4000);
    assert.ok(plan.synthesisReserve > 0);

    // Allocate
    const allocs = pab.allocate(plan);
    assert.ok(allocs.length > 0);
    assert.ok(allocs.every((a: any) => a.tokens > 0));
  });

  test('rebalance redistributes surplus', async () => {
    const mod = await import('../dist/src/reasoning/plan-and-budget.js');
    const pab = new mod.PlanAndBudget();

    const plan = pab.plan('Compare A with B, then analyze C', 3000);

    if (plan.subQuestions.length > 0) {
      const results = [{
        subQuestionId: plan.subQuestions[0].id,
        tokensUsed: Math.floor(plan.subQuestions[0].allocatedTokens * 0.3),
        confidence: 0.9,
        answer: 'test answer',
      }];

      const rebalanced = pab.rebalance(plan, results);
      assert.ok(rebalanced.totalBudget === plan.totalBudget);
    }
  });
});

// ============================================================================
// 10. MAP-Elites Archive
// ============================================================================

describe('MAPElites', () => {
  test('archive stores and retrieves elites', async () => {
    const mod = await import('../dist/src/tool-factory/map-elites.js');
    const archive = new mod.MAPElitesArchive(
      [
        { name: 'x', bins: 3, min: 0, max: 1 },
        { name: 'y', bins: 3, min: 0, max: 1 },
      ],
    );

    archive.add({ name: 'tool-a' }, [0.2, 0.8], 0.5);
    archive.add({ name: 'tool-b' }, [0.9, 0.1], 0.9);

    assert.ok(archive.coverage() > 0);
    assert.ok(archive.qdScore() > 0);
  });

  test('describeToolBehavior returns valid descriptors', async () => {
    const mod = await import('../dist/src/tool-factory/map-elites.js');
    const mockTool = {
      id: 'test-1',
      name: 'test-tool',
      description: 'A fast analysis tool for data',
      version: 1,
      status: 'candidate' as const,
      source: 'function run(input) {\n  if (input.x) {\n    return input.x * 2;\n  }\n  return 0;\n}',
      paramSchema: {
        type: 'object',
        properties: {
          x: { type: 'number' },
        },
        description: 'Run analysis',
      },
      createdBy: 'agent' as const,
      createdFrom: 'test',
      usageCount: 50,
      successCount: 42,
      failureCount: 8,
      avgDuration: 200,
      lastUsed: new Date(),
      createdAt: new Date(),
    };

    const desc = mod.describeToolBehavior(mockTool);
    assert.strictEqual(desc.length, 4);
    assert.ok(desc.every((d: number) => d >= 0 && d <= 1));
  });

  test('createToolArchive returns configured archive', async () => {
    const mod = await import('../dist/src/tool-factory/map-elites.js');
    const archive = mod.createToolArchive();
    assert.ok(archive);
    assert.strictEqual(archive.coverage(), 0);
  });
});

// ============================================================================
// 11. Core Barrel Exports
// ============================================================================

describe('CoreBarrel', () => {
  test('core/index.ts exports all modules', async () => {
    const core = await import('../dist/src/core/index.js');

    // Logger
    assert.ok(typeof core.createLogger === 'function');
    assert.ok(typeof core.getLogger === 'function');

    // Effect system
    assert.ok(typeof core.succeed === 'function');
    assert.ok(typeof core.fail === 'function');
    assert.ok(typeof core.tryPromise === 'function');
    assert.ok(typeof core.runPromise === 'function');
    assert.ok(typeof core.runSync === 'function');
    assert.ok(typeof core.pipe === 'function');
    assert.ok(typeof core.map === 'function');
    assert.ok(typeof core.flatMap === 'function');
    assert.ok(core.GenesisError);
    assert.ok(core.LLMError);
    assert.ok(core.ToolError);

    // FEK Bridge
    assert.ok(core.FEKBrainBridge);

    // Agent Loop
    assert.ok(core.AgentLoop);

    // Bootstrap
    assert.ok(typeof core.bootstrap === 'function');
    assert.ok(typeof core.resolve === 'function');
    assert.ok(typeof core.shutdown === 'function');

    // Module Registry
    assert.ok(core.ModuleRegistry);
    assert.ok(typeof core.getModuleRegistry === 'function');
  });

  test('effect system works via barrel import', async () => {
    const { succeed, runSync, pipe } = await import('../dist/src/core/index.js');
    const result = runSync(succeed(42));
    assert.strictEqual(result, 42);

    const piped = pipe(10, (x: number) => x * 3, (x: number) => x + 2);
    assert.strictEqual(piped, 32);
  });
});

// ============================================================================
// 12. Typed Publisher
// ============================================================================

describe('TypedPublisher', () => {
  test('createTypedPublisher and createTypedSubscriber are exported from bus', async () => {
    const bus = await import('../dist/src/bus/index.js');
    assert.ok(typeof bus.createTypedPublisher === 'function');
    assert.ok(typeof bus.createTypedSubscriber === 'function');
  });
});

// ============================================================================
// 13. Module Registry
// ============================================================================

describe('ModuleRegistry', () => {
  test('can instantiate registry', async () => {
    const mod = await import('../dist/src/core/module-registry.js');
    const registry = new mod.ModuleRegistry();
    assert.ok(registry);
  });

  test('registers and queries modules', async () => {
    const mod = await import('../dist/src/core/module-registry.js');
    const registry = new mod.ModuleRegistry();

    registry.register(
      'test-module',
      async () => ({ name: 'test' }),
      { level: 1 },
    );

    assert.ok(registry.get('test-module') === undefined); // not booted yet, but registered
    assert.strictEqual(registry.get('nonexistent'), undefined);
  });

  test('boot initializes registered modules', async () => {
    const mod = await import('../dist/src/core/module-registry.js');
    const registry = new mod.ModuleRegistry();

    let initialized = false;
    registry.register(
      'my-svc',
      async () => { initialized = true; return {}; },
      { level: 1 },
    );

    await registry.boot(1);
    assert.strictEqual(initialized, true);
  });
});
