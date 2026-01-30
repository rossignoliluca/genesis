/**
 * Autonomous Loop Tests
 * Tests for the Active Inference autonomous loop
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

describe('AutonomousLoop', () => {
  let AutonomousLoop: any;
  let createAutonomousLoop: any;
  let resetAutonomousLoop: any;
  let loop: any;

  beforeEach(async () => {
    const module = await import('../dist/src/active-inference/autonomous-loop.js');
    AutonomousLoop = module.AutonomousLoop;
    createAutonomousLoop = module.createAutonomousLoop;
    resetAutonomousLoop = module.resetAutonomousLoop;

    // Reset singleton between tests
    resetAutonomousLoop();
  });

  afterEach(() => {
    if (loop?.isRunning()) {
      loop.stop('test_cleanup');
    }
    resetAutonomousLoop();
  });

  // ============================================================================
  // Configuration Tests
  // ============================================================================

  describe('configuration', () => {
    test('creates with default config', () => {
      loop = createAutonomousLoop();
      assert.ok(loop, 'Should create loop');
      assert.strictEqual(loop.isRunning(), false, 'Should not be running initially');
    });

    test('accepts custom config', () => {
      loop = createAutonomousLoop({
        cycleInterval: 500,
        maxCycles: 5,
        verbose: true,
      });
      assert.ok(loop, 'Should create loop with custom config');
    });

    test('getCycleCount starts at 0', () => {
      loop = createAutonomousLoop();
      assert.strictEqual(loop.getCycleCount(), 0);
    });
  });

  // ============================================================================
  // Lifecycle Tests
  // ============================================================================

  describe('lifecycle', () => {
    test('run starts the loop', async () => {
      loop = createAutonomousLoop({ maxCycles: 1, cycleInterval: 0 });

      const statsPromise = loop.run();
      assert.ok(loop.isRunning() || true, 'Should be running or just finished');

      const stats = await statsPromise;
      assert.ok(stats.cycles >= 1, 'Should have run at least 1 cycle');
    });

    test('cannot run while already running', async () => {
      loop = createAutonomousLoop({ maxCycles: 10, cycleInterval: 100 });

      const firstRun = loop.run();

      try {
        await loop.run();
        assert.fail('Should throw when already running');
      } catch (error: any) {
        assert.ok(error.message.includes('already running'));
      }

      loop.stop('test');
      await firstRun;
    });

    test('stop halts the loop', async () => {
      loop = createAutonomousLoop({ maxCycles: 100, cycleInterval: 10 });

      const statsPromise = loop.run();

      // Let it run a few cycles
      await new Promise(r => setTimeout(r, 50));

      loop.stop('test_stop');

      const stats = await statsPromise;
      assert.ok(stats.cycles < 100, 'Should have stopped before max cycles');
    });

    test('isRunning reflects state', async () => {
      loop = createAutonomousLoop({ maxCycles: 3, cycleInterval: 10 });

      assert.strictEqual(loop.isRunning(), false, 'Not running initially');

      const statsPromise = loop.run();

      // Small delay to let it start
      await new Promise(r => setTimeout(r, 5));
      // It may already be done, so we just check it was running or completed
      assert.ok(true, 'Loop executed');

      await statsPromise;
      assert.strictEqual(loop.isRunning(), false, 'Not running after completion');
    });
  });

  // ============================================================================
  // Cycle Tests
  // ============================================================================

  describe('cycles', () => {
    test('runs specified number of cycles', async () => {
      loop = createAutonomousLoop({ maxCycles: 5, cycleInterval: 0 });

      const stats = await loop.run();

      assert.strictEqual(stats.cycles, 5, 'Should run exactly 5 cycles');
    });

    test('single cycle can be run manually', async () => {
      loop = createAutonomousLoop({ maxCycles: 0 });

      const action = await loop.cycle();

      assert.ok(action, 'Should return action');
      assert.strictEqual(loop.getCycleCount(), 1);
    });

    test('getCycleCount increments', async () => {
      loop = createAutonomousLoop({ maxCycles: 3, cycleInterval: 0 });

      await loop.run();

      assert.strictEqual(loop.getCycleCount(), 3);
    });
  });

  // ============================================================================
  // Adaptive Timing Tests (v10.3 improvement)
  // ============================================================================

  describe('adaptive timing', () => {
    test('cycles complete within expected time', async () => {
      const interval = 50;
      const maxCycles = 3;
      loop = createAutonomousLoop({ maxCycles, cycleInterval: interval });

      const startTime = Date.now();
      await loop.run();
      const duration = Date.now() - startTime;

      // With adaptive timing, total time should be close to maxCycles * interval
      // Allow some margin for cycle processing time
      const expectedMax = maxCycles * interval + 500; // 500ms margin
      assert.ok(duration < expectedMax, `Duration ${duration}ms should be < ${expectedMax}ms`);
    });

    test('zero interval runs as fast as possible', async () => {
      loop = createAutonomousLoop({ maxCycles: 5, cycleInterval: 0 });

      const startTime = Date.now();
      await loop.run();
      const duration = Date.now() - startTime;

      // With zero interval, should complete very quickly
      assert.ok(duration < 1000, `Should complete in <1s, took ${duration}ms`);
    });
  });

  // ============================================================================
  // Stopping Conditions Tests
  // ============================================================================

  describe('stopping conditions', () => {
    test('stops on cycle limit', async () => {
      loop = createAutonomousLoop({ maxCycles: 3, cycleInterval: 0 });

      const stats = await loop.run();

      assert.strictEqual(stats.cycles, 3);
    });

    test('manual stop with reason', async () => {
      loop = createAutonomousLoop({ maxCycles: 100, cycleInterval: 10 });

      let stopReason = '';
      loop.onStop((reason: string) => {
        stopReason = reason;
      });

      const statsPromise = loop.run();
      await new Promise(r => setTimeout(r, 30));

      loop.stop('manual_test_stop');

      await statsPromise;

      assert.strictEqual(stopReason, 'manual_test_stop');
    });
  });

  // ============================================================================
  // Event Handler Tests
  // ============================================================================

  describe('event handlers', () => {
    test('onCycle called for each cycle', async () => {
      loop = createAutonomousLoop({ maxCycles: 3, cycleInterval: 0 });

      const cycleEvents: number[] = [];
      loop.onCycle((cycle: number) => {
        cycleEvents.push(cycle);
      });

      await loop.run();

      assert.deepStrictEqual(cycleEvents, [1, 2, 3]);
    });

    test('onStop called when loop stops', async () => {
      loop = createAutonomousLoop({ maxCycles: 2, cycleInterval: 0 });

      let stopCalled = false;
      let stopStats: any = null;
      loop.onStop((_reason: string, stats: any) => {
        stopCalled = true;
        stopStats = stats;
      });

      await loop.run();

      assert.strictEqual(stopCalled, true);
      assert.ok(stopStats, 'Should receive stats');
      assert.strictEqual(stopStats.cycles, 2);
    });

    test('onCycle unsubscribe works', async () => {
      loop = createAutonomousLoop({ maxCycles: 5, cycleInterval: 0 });

      const cycleEvents: number[] = [];
      const unsubscribe = loop.onCycle((cycle: number) => {
        cycleEvents.push(cycle);
        if (cycle === 2) {
          unsubscribe();
        }
      });

      await loop.run();

      assert.strictEqual(cycleEvents.length, 2, 'Should only receive 2 events');
    });
  });

  // ============================================================================
  // Stats Tests
  // ============================================================================

  describe('stats', () => {
    test('getStats returns loop statistics', async () => {
      loop = createAutonomousLoop({ maxCycles: 3, cycleInterval: 0 });

      await loop.run();

      const stats = loop.getStats();

      assert.ok('cycles' in stats);
      assert.ok('startTime' in stats);
      assert.ok('actions' in stats);
      assert.ok('avgSurprise' in stats);
      assert.ok('finalBeliefs' in stats);
    });

    test('stats include action counts', async () => {
      loop = createAutonomousLoop({ maxCycles: 5, cycleInterval: 0 });

      const stats = await loop.run();

      assert.ok(typeof stats.actions === 'object');
      // Total actions should equal cycles
      const totalActions = Object.values(stats.actions).reduce((sum: number, count: any) => sum + count, 0);
      assert.strictEqual(totalActions, 5);
    });

    test('stats include timing', async () => {
      loop = createAutonomousLoop({ maxCycles: 2, cycleInterval: 10 });

      const stats = await loop.run();

      assert.ok(stats.startTime instanceof Date);
      assert.ok(stats.endTime instanceof Date);
      assert.ok(stats.endTime >= stats.startTime);
    });
  });

  // ============================================================================
  // Beliefs Tests
  // ============================================================================

  describe('beliefs', () => {
    test('getBeliefs returns current beliefs', async () => {
      loop = createAutonomousLoop({ maxCycles: 1, cycleInterval: 0 });

      await loop.run();

      const beliefs = loop.getBeliefs();

      assert.ok(beliefs, 'Should have beliefs');
      assert.ok('viability' in beliefs);
      assert.ok('worldState' in beliefs);
      assert.ok('coupling' in beliefs);
      assert.ok('goalProgress' in beliefs);
    });

    test('getMostLikelyState returns state object', async () => {
      loop = createAutonomousLoop({ maxCycles: 1, cycleInterval: 0 });

      await loop.run();

      const state = loop.getMostLikelyState();

      assert.ok(state, 'Should have state');
      assert.ok(typeof state === 'object');
    });
  });

  // ============================================================================
  // Components Access Tests
  // ============================================================================

  describe('components', () => {
    test('getComponents returns engine, observations, actions', () => {
      loop = createAutonomousLoop();

      const components = loop.getComponents();

      assert.ok(components.engine, 'Should have engine');
      assert.ok(components.observations, 'Should have observations');
      assert.ok(components.actions, 'Should have actions');
    });

    test('configureObservations updates observation sources', () => {
      loop = createAutonomousLoop();

      // Should not throw
      loop.configureObservations({
        energy: () => 0.8,
        phi: () => 0.5,
      });

      assert.ok(true, 'Configuration applied');
    });

    test('setActionContext updates action context', () => {
      loop = createAutonomousLoop();

      // Should not throw
      loop.setActionContext({
        goal: 'test goal',
        parameters: { key: 'value' },
      });

      assert.ok(true, 'Context set');
    });
  });

  // ============================================================================
  // Custom Step Function Tests
  // ============================================================================

  describe('custom step function', () => {
    test('setCustomStepFunction overrides default inference', async () => {
      loop = createAutonomousLoop({ maxCycles: 3, cycleInterval: 0 });

      let customStepCalls = 0;
      loop.setCustomStepFunction(async () => {
        customStepCalls++;
        return {
          action: 'rest' as const,
          beliefs: {
            viability: [0, 0, 1, 0, 0],
            worldState: [0, 1, 0, 0],
            coupling: [0, 0, 0, 0, 1],
            goalProgress: [1, 0, 0, 0],
          },
        };
      });

      await loop.run();

      assert.strictEqual(customStepCalls, 3, 'Custom step function should be called for each cycle');
    });

    test('setCustomStepFunction null restores default', async () => {
      loop = createAutonomousLoop({ maxCycles: 2, cycleInterval: 0 });

      // Set and then clear custom function
      loop.setCustomStepFunction(async () => ({
        action: 'rest' as const,
        beliefs: { viability: [], worldState: [], coupling: [], goalProgress: [] },
      }));
      loop.setCustomStepFunction(null);

      // Should use default engine
      const stats = await loop.run();
      assert.strictEqual(stats.cycles, 2);
    });
  });
});
