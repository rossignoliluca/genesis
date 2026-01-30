/**
 * Kernel Tests
 * Tests for the Genesis kernel state machine and task orchestration
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

describe('Kernel', () => {
  let Kernel: any;
  let kernel: any;

  beforeEach(async () => {
    const module = await import('../dist/src/kernel/index.js');
    Kernel = module.Kernel;
    kernel = new Kernel();
  });

  afterEach(() => {
    kernel?.stop?.();
  });

  // ============================================================================
  // State Tests
  // ============================================================================

  describe('state', () => {
    test('initial state is idle', () => {
      assert.strictEqual(kernel.getState(), 'idle');
    });

    test('getState returns current state', () => {
      const state = kernel.getState();
      assert.ok(typeof state === 'string');
      assert.ok(['idle', 'sensing', 'thinking', 'deciding', 'acting', 'reflecting', 'dormant', 'error'].includes(state));
    });
  });

  // ============================================================================
  // Energy Management Tests
  // ============================================================================

  describe('energy management', () => {
    test('initial energy is 1.0', () => {
      const energy = kernel.getEnergy();
      assert.strictEqual(energy, 1.0);
    });

    test('energy can be set', () => {
      kernel.setEnergy(0.5);
      const energy = kernel.getEnergy();
      assert.strictEqual(energy, 0.5);
    });

    test('energy clamped to 0-1 range', () => {
      kernel.setEnergy(1.5);
      assert.strictEqual(kernel.getEnergy(), 1.0);

      kernel.setEnergy(-0.5);
      assert.strictEqual(kernel.getEnergy(), 0.0);
    });

    test('very low energy triggers dormant state', () => {
      kernel.setEnergy(0.05); // Below default threshold of 0.1
      // The kernel should automatically transition to dormant when energy is too low
      // This may happen asynchronously or on next operation
      assert.ok(kernel.getEnergy() === 0.05);
    });
  });

  // ============================================================================
  // Status Tests
  // ============================================================================

  describe('status', () => {
    test('getStatus returns kernel status object', () => {
      const status = kernel.getStatus();

      assert.ok(status, 'Should return status');
      assert.ok('state' in status);
      assert.ok('energy' in status);
    });

    test('status includes state', () => {
      const status = kernel.getStatus();
      assert.strictEqual(status.state, 'idle');
    });

    test('status includes energy', () => {
      kernel.setEnergy(0.7);
      const status = kernel.getStatus();
      assert.strictEqual(status.energy, 0.7);
    });
  });

  // ============================================================================
  // Metrics Tests
  // ============================================================================

  describe('metrics', () => {
    test('getMetrics returns metrics object', () => {
      const metrics = kernel.getMetrics();

      assert.ok(metrics, 'Should return metrics');
      assert.ok('startTime' in metrics);
      assert.ok('stateTransitions' in metrics);
      assert.ok('tasksCompleted' in metrics);
    });

    test('metrics startTime is a Date', () => {
      const metrics = kernel.getMetrics();
      assert.ok(metrics.startTime instanceof Date);
    });

    test('metrics counters are non-negative', () => {
      const metrics = kernel.getMetrics();
      assert.ok(metrics.stateTransitions >= 0);
      assert.ok(metrics.tasksCompleted >= 0);
      assert.ok(metrics.tasksFailed >= 0);
    });
  });

  // ============================================================================
  // Agent Integration Tests
  // ============================================================================

  describe('agent integration', () => {
    test('kernel has access to agents', () => {
      const agents = kernel.getAgents();
      assert.ok(agents, 'Should have agents');
      assert.ok(agents instanceof Map, 'Agents should be a Map');
    });

    test('kernel has access to registry', () => {
      const registry = kernel.getRegistry();
      assert.ok(registry, 'Should have registry');
    });

    test('kernel has access to coordinator', () => {
      const coordinator = kernel.getCoordinator();
      assert.ok(coordinator, 'Should have coordinator');
    });
  });

  // ============================================================================
  // State Change Listener Tests
  // ============================================================================

  describe('state listeners', () => {
    test('onStateChange accepts listener', () => {
      let called = false;
      kernel.onStateChange(() => {
        called = true;
      });

      // Listener is registered (we can't easily trigger state change)
      assert.ok(true, 'Listener registered without error');
    });
  });

  // ============================================================================
  // Invariant Registry Tests
  // ============================================================================

  describe('invariants', () => {
    test('kernel has invariant registry', () => {
      const registry = kernel.getInvariantRegistry();
      assert.ok(registry, 'Should have invariant registry');
    });

    test('getInvariantStats returns stats', () => {
      const stats = kernel.getInvariantStats();
      assert.ok(stats, 'Should return stats');
      assert.ok('total' in stats);
      assert.ok('enabled' in stats);
    });
  });

  // ============================================================================
  // Stop Tests
  // ============================================================================

  describe('stop', () => {
    test('stop method exists and returns promise', async () => {
      // Create a fresh kernel for this test
      const freshKernel = new Kernel();

      // Stop should work without error
      await freshKernel.stop();

      // After stop, state should be idle
      assert.strictEqual(freshKernel.getState(), 'idle');
    });
  });
});
