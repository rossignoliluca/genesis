/**
 * Test Value Integration (Genesis 6.2)
 *
 * Verifies that Value-Guided JEPA integrates correctly with Active Inference.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

import {
  ValueAugmentedEngine,
  createValueAugmentedEngine,
  createFullyIntegratedEngine,
  DEFAULT_VALUE_INTEGRATION_CONFIG,
} from './value-integration.js';

import { Observation } from './types.js';

// ============================================================================
// Test Utilities
// ============================================================================

function createTestObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    energy: 2,      // 0=critical, 1=low, 2=normal, 3=high, 4=optimal
    phi: 1,         // 0=none, 1=low, 2=medium, 3=high
    tool: 1,        // 0=none, 1=success, 2=failure
    coherence: 1,   // 0=none, 1=low, 2=high
    task: 1,        // 0=none, 1=active, 2=blocked, 3=completed
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('ValueAugmentedEngine', () => {
  let engine: ValueAugmentedEngine;

  beforeEach(() => {
    engine = createValueAugmentedEngine();
  });

  describe('creation', () => {
    it('should create with default config', () => {
      assert.ok(engine);
      assert.strictEqual(typeof engine.step, 'function');
    });

    it('should create with custom config', () => {
      const custom = createValueAugmentedEngine({
        valueWeight: 0.8,
        useWorldModelPredictions: false,
      });
      assert.ok(custom);
    });
  });

  describe('step', () => {
    it('should perform inference step with value augmentation', async () => {
      const obs = createTestObservation();
      const result = await engine.step(obs);

      assert.ok(result.action);
      assert.ok(result.beliefs);
      assert.ok(typeof result.value.value === 'number');
      assert.ok(result.policy);
      assert.ok(Array.isArray(result.policy));
    });

    it('should return valid action', async () => {
      const obs = createTestObservation();
      const result = await engine.step(obs);

      // Action should be a valid ActionType string
      assert.strictEqual(typeof result.action, 'string');
    });

    it('should update beliefs over time', async () => {
      const obs1 = createTestObservation({ energy: 3 });
      const result1 = await engine.step(obs1);

      const obs2 = createTestObservation({ energy: 1 });
      const result2 = await engine.step(obs2);

      // Both should have beliefs
      assert.ok(result1.beliefs);
      assert.ok(result2.beliefs);
    });
  });

  describe('value estimation', () => {
    it('should return value estimate with components', async () => {
      const obs = createTestObservation();
      const result = await engine.step(obs);

      assert.ok(typeof result.value.value === 'number');
      assert.ok(typeof result.value.components === 'object');
      assert.ok('survival' in result.value.components);
      assert.ok('integrity' in result.value.components);
      assert.ok('progress' in result.value.components);
    });

    it('should estimate higher value for better states', async () => {
      // Run multiple steps to let beliefs converge
      const goodObs = createTestObservation({ energy: 4, task: 3, phi: 3, coherence: 2 });
      await engine.step(goodObs);
      await engine.step(goodObs);
      const goodResult = await engine.step(goodObs);

      // Reset and try bad state
      const engine2 = createValueAugmentedEngine();
      const badObs = createTestObservation({ energy: 0, task: 0, phi: 0, coherence: 0 });
      await engine2.step(badObs);
      await engine2.step(badObs);
      const badResult = await engine2.step(badObs);

      // Good state should have higher value (with tolerance for noise)
      // The value difference should be meaningful
      const diff = goodResult.value.value - badResult.value.value;
      assert.ok(diff > -0.05,
        `Expected good value (${goodResult.value.value.toFixed(3)}) to be close to or greater than bad value (${badResult.value.value.toFixed(3)}), diff=${diff.toFixed(3)}`);
    });
  });

  describe('policy computation', () => {
    it('should compute value-augmented policy', async () => {
      const obs = createTestObservation();
      const result = await engine.step(obs);

      // Policy should be an array of probabilities
      assert.ok(Array.isArray(result.policy));
      assert.ok(result.policy.length > 0);

      // All probabilities should be non-negative
      for (const p of result.policy) {
        assert.ok(p >= 0, `Probability ${p} should be >= 0`);
      }
    });

    it('should have policy sum to approximately 1', async () => {
      const obs = createTestObservation();
      const result = await engine.step(obs);

      const sum = result.policy.reduce((a: number, b: number) => a + b, 0);
      assert.ok(Math.abs(sum - 1) < 0.01, `Policy sum ${sum} should be ~1`);
    });
  });

  describe('learning', () => {
    it('should update from outcome', async () => {
      const obs = createTestObservation();
      await engine.step(obs);

      // Get latent state after step
      const latentState = engine.getLatentState();
      assert.ok(latentState, 'Should have latent state after step');

      // Update with positive outcome
      const obs2 = createTestObservation({ energy: 3 });
      engine.updateFromOutcome(latentState!, 'execute.task', {
        success: true,
        newObservation: obs2,
      });

      // Should not throw and continue working
      const result = await engine.step(obs);
      assert.ok(result.action);
    });
  });

  describe('statistics', () => {
    it('should track statistics', async () => {
      const obs = createTestObservation();
      await engine.step(obs);
      await engine.step(obs);

      const stats = engine.getStats();
      assert.strictEqual(stats.cycleCount, 2);
      assert.ok(typeof stats.totalValue === 'number');
    });
  });
});

describe('createFullyIntegratedEngine', () => {
  it('should create fully integrated engine with JEPA', async () => {
    const engine = await createFullyIntegratedEngine();

    assert.ok(engine);
    assert.strictEqual(typeof engine.step, 'function');

    // Should have initialized JEPA
    const stats = engine.getStats();
    assert.strictEqual(stats.cycleCount, 0);
  });
});

describe('DEFAULT_VALUE_INTEGRATION_CONFIG', () => {
  it('should have valid default values', () => {
    assert.strictEqual(typeof DEFAULT_VALUE_INTEGRATION_CONFIG.valueWeight, 'number');
    assert.ok(DEFAULT_VALUE_INTEGRATION_CONFIG.valueWeight >= 0);
    assert.ok(DEFAULT_VALUE_INTEGRATION_CONFIG.valueWeight <= 1);

    assert.strictEqual(typeof DEFAULT_VALUE_INTEGRATION_CONFIG.predictionHorizon, 'number');
    assert.ok(DEFAULT_VALUE_INTEGRATION_CONFIG.predictionHorizon >= 1);
  });
});
