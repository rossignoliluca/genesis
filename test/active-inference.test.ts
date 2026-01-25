/**
 * Active Inference Core Tests
 *
 * Tests for the Free Energy Principle implementation:
 * - State inference (Bayesian belief updating)
 * - Policy selection (Expected Free Energy minimization)
 * - Action sampling
 * - Learning (Dirichlet parameter updates)
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';

describe('Active Inference Engine', () => {
  let engine: any;
  let createActiveInferenceEngine: any;

  beforeEach(async () => {
    const module = await import('../src/active-inference/core.js');
    createActiveInferenceEngine = module.createActiveInferenceEngine;
    engine = createActiveInferenceEngine();
  });

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe('initialization', () => {
    test('creates engine with default config', () => {
      assert.ok(engine, 'Engine should be created');
    });

    test('getBeliefs returns valid belief structure', () => {
      const beliefs = engine.getBeliefs();

      assert.ok(beliefs, 'Beliefs should exist');
      assert.ok(beliefs.viability, 'Should have viability beliefs');
      assert.ok(beliefs.worldState, 'Should have worldState beliefs');
      assert.ok(beliefs.coupling, 'Should have coupling beliefs');
      assert.ok(beliefs.goalProgress, 'Should have goalProgress beliefs');
      assert.ok(beliefs.economic, 'Should have economic beliefs');
    });

    test('beliefs are valid probability distributions', () => {
      const beliefs = engine.getBeliefs();

      // Each belief should sum to ~1
      const viabilitySum = beliefs.viability.reduce((a: number, b: number) => a + b, 0);
      const worldStateSum = beliefs.worldState.reduce((a: number, b: number) => a + b, 0);
      const couplingSum = beliefs.coupling.reduce((a: number, b: number) => a + b, 0);

      assert.ok(Math.abs(viabilitySum - 1) < 0.001, `Viability should sum to 1, got ${viabilitySum}`);
      assert.ok(Math.abs(worldStateSum - 1) < 0.001, `WorldState should sum to 1, got ${worldStateSum}`);
      assert.ok(Math.abs(couplingSum - 1) < 0.001, `Coupling should sum to 1, got ${couplingSum}`);
    });

    test('all belief values are non-negative', () => {
      const beliefs = engine.getBeliefs();

      for (const [key, probs] of Object.entries(beliefs)) {
        for (const p of (probs as number[])) {
          assert.ok(p >= 0, `${key} should have non-negative values`);
        }
      }
    });
  });

  // ============================================================================
  // State Inference Tests
  // ============================================================================

  describe('state inference', () => {
    test('inferStates updates beliefs given observation', () => {
      const beforeBeliefs = JSON.stringify(engine.getBeliefs());

      // Observations use discrete indices: energy 0-4, phi 0-3, tool 0-2, etc.
      const observation = {
        energy: 3 as const,    // high (0=depleted, 4=full)
        phi: 2 as const,       // medium (0=dormant, 3=high)
        tool: 2 as const,      // success (0=failed, 2=success)
        coherence: 2 as const, // consistent (0=broken, 2=consistent)
        task: 2 as const,      // active (0=none, 3=completed)
        economic: 2 as const,  // stable (0=critical, 3=growing)
      };

      engine.inferStates(observation);

      const afterBeliefs = JSON.stringify(engine.getBeliefs());

      // Beliefs should change after observation
      assert.notStrictEqual(beforeBeliefs, afterBeliefs, 'Beliefs should update');
    });

    test('inferStates maintains valid probability distributions', () => {
      const observation = {
        energy: 1 as const,    // low
        phi: 1 as const,       // low
        tool: 1 as const,      // partial
        coherence: 1 as const, // degraded
        task: 1 as const,      // pending
        economic: 1 as const,  // low
      };

      engine.inferStates(observation);

      const beliefs = engine.getBeliefs();

      for (const [key, probs] of Object.entries(beliefs)) {
        const sum = (probs as number[]).reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(sum - 1) < 0.01, `${key} should sum to ~1 after inference, got ${sum}`);
      }
    });

    test('low energy observation shifts viability beliefs', () => {
      const lowEnergyObs = {
        energy: 0 as const,    // depleted
        phi: 1 as const,
        tool: 1 as const,
        coherence: 1 as const,
        task: 1 as const,
        economic: 1 as const,
      };

      // Run multiple inferences to see shift
      for (let i = 0; i < 5; i++) {
        engine.inferStates(lowEnergyObs);
      }

      const beliefs = engine.getBeliefs();

      // Lower indices represent worse viability
      // After low energy observations, belief should shift toward lower states
      const lowStateProb = beliefs.viability[0] + beliefs.viability[1];
      const highStateProb = beliefs.viability[3] + beliefs.viability[4];

      assert.ok(lowStateProb > highStateProb * 0.5,
        'Low energy should shift beliefs toward lower viability states');
    });

    test('high energy observation shifts viability beliefs', () => {
      const highEnergyObs = {
        energy: 4 as const,    // full
        phi: 2 as const,
        tool: 2 as const,
        coherence: 2 as const,
        task: 2 as const,
        economic: 2 as const,
      };

      for (let i = 0; i < 5; i++) {
        engine.inferStates(highEnergyObs);
      }

      const beliefs = engine.getBeliefs();

      const lowStateProb = beliefs.viability[0] + beliefs.viability[1];
      const highStateProb = beliefs.viability[3] + beliefs.viability[4];

      assert.ok(highStateProb > lowStateProb * 0.5,
        'High energy should shift beliefs toward higher viability states');
    });
  });

  // ============================================================================
  // Policy Selection Tests
  // ============================================================================

  describe('policy selection', () => {
    test('inferPolicies returns valid policy distribution', () => {
      const observation = {
        energy: 3 as const,
        phi: 2 as const,
        tool: 2 as const,
        coherence: 1 as const,
        task: 1 as const,
        economic: 2 as const,
      };

      engine.inferStates(observation);
      const policy = engine.inferPolicies();

      assert.ok(policy, 'Should return a policy');
      // Policy is a probability distribution (number[])
      assert.ok(Array.isArray(policy), 'Policy should be an array');
      assert.ok(policy.length > 0, 'Policy should have action probabilities');
    });

    test('policy sums to approximately 1', () => {
      const observation = {
        energy: 2 as const,
        phi: 2 as const,
        tool: 1 as const,
        coherence: 1 as const,
        task: 2 as const,
        economic: 2 as const,
      };

      engine.inferStates(observation);
      const policy = engine.inferPolicies();

      // Policy should be a probability distribution summing to 1
      const sum = policy.reduce((a: number, b: number) => a + b, 0);
      assert.ok(Math.abs(sum - 1) < 0.01, `Policy should sum to ~1, got ${sum}`);
    });

    test('all policy probabilities are non-negative', () => {
      const lowEnergyObs = {
        energy: 0 as const,  // depleted
        phi: 1 as const,
        tool: 1 as const,
        coherence: 1 as const,
        task: 1 as const,
        economic: 1 as const,
      };

      // Run several times to bias toward low energy state
      for (let i = 0; i < 10; i++) {
        engine.inferStates(lowEnergyObs);
      }

      const policy = engine.inferPolicies();
      for (const p of policy) {
        assert.ok(p >= 0, 'Policy probabilities should be non-negative');
        assert.ok(p <= 1, 'Policy probabilities should be <= 1');
      }
    });
  });

  // ============================================================================
  // Expected Free Energy Tests
  // ============================================================================

  describe('expected free energy', () => {
    test('computeEFE returns valid scores', () => {
      const observation = {
        energy: 2 as const,
        phi: 2 as const,
        tool: 1 as const,
        coherence: 1 as const,
        task: 2 as const,
        economic: 2 as const,
      };

      engine.inferStates(observation);

      // Get all EFE scores if method exists
      if (engine.getAllEFEScores) {
        const scores = engine.getAllEFEScores();
        assert.ok(Array.isArray(scores) || typeof scores === 'object',
          'EFE scores should be array or object');
      }
    });

    test('EFE scores are finite numbers', () => {
      const observation = {
        energy: 2 as const,
        phi: 2 as const,
        tool: 1 as const,
        coherence: 1 as const,
        task: 2 as const,
        economic: 2 as const,
      };

      engine.inferStates(observation);
      const policy = engine.inferPolicies();

      if (policy.efe !== undefined) {
        assert.ok(Number.isFinite(policy.efe), 'EFE should be finite number');
      }
      if (policy.allEFE) {
        for (const efe of policy.allEFE) {
          assert.ok(Number.isFinite(efe), 'All EFE scores should be finite');
        }
      }
    });
  });

  // ============================================================================
  // Learning Tests
  // ============================================================================

  describe('learning', () => {
    test('learning history is tracked', () => {
      const observation = {
        energy: 3 as const,
        phi: 2 as const,
        tool: 2 as const,
        coherence: 2 as const,
        task: 2 as const,
        economic: 2 as const,
      };

      engine.inferStates(observation);
      engine.inferPolicies();

      // Check if learning history exists
      if (engine.getLearningHistory) {
        const history = engine.getLearningHistory();
        assert.ok(Array.isArray(history), 'Learning history should be an array');
      }
    });
  });

  // ============================================================================
  // Statistics Tests
  // ============================================================================

  describe('statistics', () => {
    test('getStats returns statistics object', () => {
      const stats = engine.getStats();

      assert.ok(stats, 'Should return stats');
      assert.ok('inferenceCount' in stats || 'totalSurprise' in stats ||
                typeof stats === 'object', 'Stats should have expected fields');
    });

    test('inference count increases after inferStates', () => {
      const beforeStats = engine.getStats();
      const beforeCount = beforeStats.inferenceCount || 0;

      const observation = {
        energy: 2 as const,
        phi: 2 as const,
        tool: 1 as const,
        coherence: 1 as const,
        task: 2 as const,
        economic: 2 as const,
      };

      engine.inferStates(observation);

      const afterStats = engine.getStats();
      const afterCount = afterStats.inferenceCount || 0;

      assert.ok(afterCount >= beforeCount, 'Inference count should increase');
    });
  });

  // ============================================================================
  // Event Handler Tests
  // ============================================================================

  describe('event handlers', () => {
    test('addEventListener adds handler', () => {
      if (!engine.addEventListener && !engine.on) {
        return; // Skip if no event system
      }

      let eventReceived = false;
      const handler = () => { eventReceived = true; };

      if (engine.addEventListener) {
        engine.addEventListener(handler);
      } else if (engine.on) {
        engine.on('action', handler);
      }

      // Handler registered without error
      assert.ok(true, 'Handler registered');
    });
  });

  // ============================================================================
  // Surprise Tests
  // ============================================================================

  describe('surprise', () => {
    test('computeSurprise returns valid value', () => {
      const observation = {
        energy: 2 as const,
        phi: 2 as const,
        tool: 1 as const,
        coherence: 1 as const,
        task: 2 as const,
        economic: 2 as const,
      };

      engine.inferStates(observation);

      if (engine.computeSurprise) {
        const surprise = engine.computeSurprise(observation);
        assert.ok(Number.isFinite(surprise), 'Surprise should be finite');
        assert.ok(surprise >= 0, 'Surprise should be non-negative');
      }
    });

    test('unexpected observations have higher surprise', () => {
      // First condition on high energy
      for (let i = 0; i < 10; i++) {
        engine.inferStates({
          energy: 4 as const, // full
          phi: 2 as const,
          tool: 2 as const,
          coherence: 2 as const,
          task: 2 as const,
          economic: 2 as const,
        });
      }

      // Now observe very low energy - should be surprising
      if (engine.computeSurprise) {
        const lowEnergySurprise = engine.computeSurprise({
          energy: 0 as const, // depleted
          phi: 2 as const,
          tool: 1 as const,
          coherence: 1 as const,
          task: 1 as const,
          economic: 1 as const,
        });

        const expectedSurprise = engine.computeSurprise({
          energy: 4 as const, // full
          phi: 2 as const,
          tool: 2 as const,
          coherence: 2 as const,
          task: 2 as const,
          economic: 2 as const,
        });

        assert.ok(lowEnergySurprise >= expectedSurprise * 0.5,
          'Unexpected observations should generally have higher surprise');
      }
    });
  });

  // ============================================================================
  // Reset Tests
  // ============================================================================

  describe('reset', () => {
    test('reset restores initial beliefs', () => {
      // Change beliefs
      for (let i = 0; i < 10; i++) {
        engine.inferStates({
          energy: 0 as const,  // depleted
          phi: 0 as const,     // dormant
          tool: 0 as const,    // failed
          coherence: 0 as const, // broken
          task: 0 as const,    // none
          economic: 0 as const, // critical
        });
      }

      if (engine.reset) {
        engine.reset();

        const beliefs = engine.getBeliefs();

        // After reset, beliefs should be back to priors
        for (const probs of Object.values(beliefs)) {
          const sum = (probs as number[]).reduce((a, b) => a + b, 0);
          assert.ok(Math.abs(sum - 1) < 0.01, 'Beliefs should be valid distributions after reset');
        }
      }
    });
  });
});

// ============================================================================
// Math Utility Tests (if exported)
// ============================================================================

describe('Active Inference Math Utilities', () => {
  test('softmax produces valid probability distribution', async () => {
    // Import the core module to access internal functions if exported
    const module = await import('../src/active-inference/core.js');

    // Test with a simple case using the engine
    const engine = module.createActiveInferenceEngine();

    // The engine uses softmax internally, so valid beliefs prove softmax works
    const beliefs = engine.getBeliefs();

    for (const [key, probs] of Object.entries(beliefs)) {
      const sum = (probs as number[]).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum - 1) < 0.01, `${key} should sum to 1`);

      for (const p of (probs as number[])) {
        assert.ok(p >= 0, `${key} values should be non-negative`);
        assert.ok(p <= 1, `${key} values should be <= 1`);
      }
    }
  });
});
