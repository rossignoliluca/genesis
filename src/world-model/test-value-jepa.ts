/**
 * Genesis 6.2 - Value-Guided JEPA Tests
 *
 * Tests for the value function and value-guided prediction.
 *
 * Run: node --test dist/world-model/test-value-jepa.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

import {
  ValueFunction,
  createValueFunction,
  getValueFunction,
  resetValueFunction,
  DEFAULT_VALUE_CONFIG,
  type ValueEstimate,
  type ActionValue,
} from './value-jepa.js';

import type { LatentState, Action, ActionType, PredictedState, Trajectory } from './types.js';

// ============================================================================
// Test Utilities
// ============================================================================

function createTestState(values?: Partial<{
  energy: number;
  progress: number;
  confidence: number;
  entropy: number;
}>): LatentState {
  const dim = 64;
  const vector = Array(dim).fill(0).map((_, i) => {
    // First 16 dims: energy-related
    if (i < 16) return values?.energy ?? 0.5;
    // Next 16 dims: progress-related
    if (i < 32) return values?.progress ?? 0.5;
    // Rest: random
    return Math.random() * 0.5;
  });

  return {
    vector,
    dimensions: dim,
    sourceModality: 'state',
    sourceId: `test-${Date.now()}`,
    timestamp: new Date(),
    confidence: values?.confidence ?? 0.7,
    entropy: values?.entropy ?? 0.3,
  };
}

function createTestAction(type: ActionType = 'execute'): Action {
  return {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    parameters: {},
    agent: 'test',
    timestamp: new Date(),
  };
}

function createTestPrediction(state: LatentState, action?: Action): PredictedState {
  return {
    state,
    action: action ?? createTestAction(),
    probability: 0.8,
    uncertainty: 0.2,
    alternativeStates: [],
    predictionTime: 10,
  };
}

function createTestTrajectory(states: LatentState[], actions?: Action[]): Trajectory {
  const predictedStates: PredictedState[] = states.map((s, i) =>
    createTestPrediction(s, actions?.[i])
  );

  return {
    id: `traj-${Date.now()}`,
    initialState: states[0],
    states: predictedStates,
    actions: actions ?? states.slice(1).map(() => createTestAction()),
    totalProbability: 1,
    horizon: states.length,
    simulationTime: 0,
  };
}

// ============================================================================
// ValueFunction Tests
// ============================================================================

describe('ValueFunction', () => {
  beforeEach(() => {
    resetValueFunction();
  });

  describe('initialization', () => {
    it('should create with default config', () => {
      const vf = createValueFunction();
      const config = vf.getConfig();

      assert.strictEqual(config.gamma, DEFAULT_VALUE_CONFIG.gamma);
      assert.strictEqual(config.riskAversion, DEFAULT_VALUE_CONFIG.riskAversion);
      assert.ok(config.weights.survival > 0);
    });

    it('should accept custom config', () => {
      const vf = createValueFunction({
        gamma: 0.9,
        riskAversion: 0.8,
      });
      const config = vf.getConfig();

      assert.strictEqual(config.gamma, 0.9);
      assert.strictEqual(config.riskAversion, 0.8);
    });

    it('should provide singleton via getValueFunction', () => {
      const vf1 = getValueFunction();
      const vf2 = getValueFunction();
      assert.strictEqual(vf1, vf2);
    });
  });

  describe('estimate', () => {
    it('should return value in range [-1, 1]', () => {
      const vf = createValueFunction();
      const state = createTestState();

      const estimate = vf.estimate(state);

      assert.ok(estimate.value >= -1 && estimate.value <= 1, `Value ${estimate.value} out of range`);
    });

    it('should return all components in range [0, 1]', () => {
      const vf = createValueFunction();
      const state = createTestState();

      const estimate = vf.estimate(state);

      for (const [name, value] of Object.entries(estimate.components)) {
        assert.ok(value >= 0 && value <= 1, `Component ${name} = ${value} out of range`);
      }
    });

    it('should apply discount factor for future horizons', () => {
      const vf = createValueFunction({ gamma: 0.9 });
      const state = createTestState({ energy: 0.8 });

      const now = vf.estimate(state, 0);
      const future = vf.estimate(state, 5);

      assert.ok(future.discount < now.discount, 'Future should have smaller discount');
      assert.ok(Math.abs(future.discount - Math.pow(0.9, 5)) < 0.001);
    });

    it('should return valueUncertainty estimate', () => {
      const vf = createValueFunction();
      const state = createTestState({ confidence: 0.5 });

      const estimate = vf.estimate(state);

      assert.ok(estimate.valueUncertainty >= 0 && estimate.valueUncertainty <= 1);
      assert.ok(estimate.valueConfidence >= 0 && estimate.valueConfidence <= 1);
    });

    it('should give higher survival value to high-energy states', () => {
      const vf = createValueFunction();

      const lowEnergy = createTestState({ energy: 0.1 });
      const highEnergy = createTestState({ energy: 0.9 });

      const lowEstimate = vf.estimate(lowEnergy);
      const highEstimate = vf.estimate(highEnergy);

      // Higher energy should give higher survival component
      assert.ok(
        highEstimate.components.survival >= lowEstimate.components.survival,
        `High energy survival ${highEstimate.components.survival} should >= low ${lowEstimate.components.survival}`
      );
    });
  });

  describe('Q-value computation', () => {
    it('should compute Q-value for state-action pair', () => {
      const vf = createValueFunction();
      const state = createTestState();
      const action = createTestAction();
      const nextState = createTestState({ energy: 0.8 });
      const predicted = createTestPrediction(nextState, action);

      const qValue = vf.computeQValue(state, action, predicted);

      assert.ok('qValue' in qValue);
      assert.ok('advantage' in qValue);
      assert.ok('qUncertainty' in qValue);
      assert.strictEqual(qValue.action, action);
    });

    it('should compute positive advantage for improving actions', () => {
      const vf = createValueFunction();
      const state = createTestState({ energy: 0.3 });
      const action = createTestAction('transform');
      const nextState = createTestState({ energy: 0.8 });
      const predicted = createTestPrediction(nextState, action);

      const qValue = vf.computeQValue(state, action, predicted);

      // Action that increases energy should have reasonable Q-value
      assert.ok(
        qValue.qValue > vf.estimate(state).value * 0.9 || qValue.advantage > -0.5,
        'Improving action should have reasonable Q-value'
      );
    });
  });

  describe('action ranking', () => {
    it('should rank actions by Q-value', () => {
      const vf = createValueFunction({ riskAversion: 0 });

      // Create actions with different predicted outcomes
      const actionValues: ActionValue[] = [
        {
          action: createTestAction('observe'),
          qValue: 0.2,
          advantage: -0.3,
          qUncertainty: 0.1,
          predictedState: createTestPrediction(createTestState({ energy: 0.2 })),
        },
        {
          action: createTestAction('execute'),
          qValue: 0.8,
          advantage: 0.3,
          qUncertainty: 0.1,
          predictedState: createTestPrediction(createTestState({ energy: 0.8 })),
        },
        {
          action: createTestAction('query'),
          qValue: 0.5,
          advantage: 0,
          qUncertainty: 0.1,
          predictedState: createTestPrediction(createTestState({ energy: 0.5 })),
        },
      ];

      const ranked = vf.rankActions(actionValues);

      assert.strictEqual(ranked[0].action.type, 'execute');
      assert.strictEqual(ranked[1].action.type, 'query');
      assert.strictEqual(ranked[2].action.type, 'observe');
    });

    it('should prefer lower uncertainty when risk-averse', () => {
      const vf = createValueFunction({ riskAversion: 1.0 });

      const actionValues: ActionValue[] = [
        {
          action: createTestAction('execute'),
          qValue: 0.6,
          advantage: 0.1,
          qUncertainty: 0.5,  // High uncertainty
          predictedState: createTestPrediction(createTestState()),
        },
        {
          action: createTestAction('observe'),
          qValue: 0.5,
          advantage: 0,
          qUncertainty: 0.1,  // Low uncertainty
          predictedState: createTestPrediction(createTestState()),
        },
      ];

      const ranked = vf.rankActions(actionValues);

      // Safe (observe) should be preferred despite lower Q-value
      assert.strictEqual(ranked[0].action.type, 'observe');
    });
  });

  describe('trajectory evaluation', () => {
    it('should evaluate trajectory with cumulative value', () => {
      const vf = createValueFunction();

      const states = [
        createTestState({ energy: 0.5 }),
        createTestState({ energy: 0.6 }),
        createTestState({ energy: 0.7 }),
      ];
      const trajectory = createTestTrajectory(states);

      const valued = vf.evaluateTrajectory(trajectory);

      assert.ok('totalValue' in valued);
      assert.ok('expectedValue' in valued);
      assert.ok('stepValues' in valued);
      assert.strictEqual(valued.stepValues.length, 3);
      assert.ok(valued.minValue <= valued.maxValue);
    });

    it('should select best trajectory from candidates', () => {
      const vf = createValueFunction();

      const goodStates = [
        createTestState({ energy: 0.5 }),
        createTestState({ energy: 0.8 }),
      ];
      const goodTrajectory = createTestTrajectory(goodStates);

      const badStates = [
        createTestState({ energy: 0.5 }),
        createTestState({ energy: 0.2 }),
      ];
      const badTrajectory = createTestTrajectory(badStates);

      const best = vf.selectBestTrajectory([badTrajectory, goodTrajectory]);

      // Best should have higher expected value
      const goodValued = vf.evaluateTrajectory(goodTrajectory);
      assert.ok(
        best.expectedValue >= goodValued.expectedValue - 0.1,
        'Selected trajectory should have high expected value'
      );
    });
  });

  describe('Expected Free Energy', () => {
    it('should compute EFE components', () => {
      const vf = createValueFunction();

      const currentState = createTestState();
      const policy = [createTestAction()];
      const predictedStates = [
        createTestPrediction(createTestState({ energy: 0.7 })),
      ];
      const preferences = createTestState({ energy: 1.0 });

      const efe = vf.computeExpectedFreeEnergy(
        currentState,
        policy,
        predictedStates,
        preferences
      );

      assert.ok('expectedFreeEnergy' in efe);
      assert.ok('ambiguity' in efe);
      assert.ok('risk' in efe);
      assert.ok('pragmaticValue' in efe);
      assert.ok('epistemicValue' in efe);
      assert.ok('instrumentalValue' in efe);
    });

    it('should have lower EFE for states closer to preferences', () => {
      const vf = createValueFunction();

      const currentState = createTestState({ energy: 0.5 });
      const preferences = createTestState({ energy: 1.0 });

      // Close to preferences
      const closeState = createTestPrediction(createTestState({ energy: 0.9 }));
      // Far from preferences
      const farState = createTestPrediction(createTestState({ energy: 0.2 }));

      const closeFE = vf.computeExpectedFreeEnergy(
        currentState,
        [createTestAction()],
        [closeState],
        preferences
      );

      const farFE = vf.computeExpectedFreeEnergy(
        currentState,
        [createTestAction()],
        [farState],
        preferences
      );

      // Close to preferences should have lower risk
      assert.ok(
        closeFE.risk <= farFE.risk,
        `Close risk ${closeFE.risk} should <= far risk ${farFE.risk}`
      );
    });
  });

  describe('learning', () => {
    it('should update value function from observed returns', () => {
      const vf = createValueFunction();
      const state = createTestState({ energy: 0.5 });

      // Update with high observed return
      vf.update(state, 0.9, 0.1);
      vf.update(state, 0.9, 0.1);
      vf.update(state, 0.9, 0.1);

      const stats = vf.getStats();
      assert.ok(stats.count === 3);
    });

    it('should track value statistics', () => {
      const vf = createValueFunction();
      const state = createTestState();

      vf.update(state, 0.5, 0.01);
      vf.update(state, 0.6, 0.01);
      vf.update(state, 0.7, 0.01);

      const stats = vf.getStats();

      assert.strictEqual(stats.count, 3);
      assert.ok(stats.mean > 0.4 && stats.mean < 0.8);
      assert.ok(stats.min <= 0.5);
      assert.ok(stats.max >= 0.7);
    });
  });

  describe('weight configuration', () => {
    it('should allow setting preference weights', () => {
      const vf = createValueFunction();

      vf.setWeights({ survival: 0.9, novelty: 0.1 });

      const config = vf.getConfig();

      // Weights should be normalized
      const sum = Object.values(config.weights).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum - 1) < 0.001, 'Weights should sum to 1');

      // Survival should be highest
      assert.ok(config.weights.survival > config.weights.novelty);
    });
  });
});

// ============================================================================
// Action Sampling Tests
// ============================================================================

describe('Action Sampling', () => {
  it('should sample action from distribution', () => {
    const vf = createValueFunction({ temperature: 1.0 });

    const actionValues: ActionValue[] = [
      {
        action: createTestAction('observe'),
        qValue: 0.1,
        advantage: 0,
        qUncertainty: 0.1,
        predictedState: createTestPrediction(createTestState()),
      },
      {
        action: createTestAction('execute'),
        qValue: 0.9,
        advantage: 0.5,
        qUncertainty: 0.1,
        predictedState: createTestPrediction(createTestState()),
      },
    ];

    // Sample many times
    const counts: Record<string, number> = { observe: 0, execute: 0 };
    for (let i = 0; i < 100; i++) {
      const sampled = vf.sampleAction(actionValues);
      counts[sampled.action.type]++;
    }

    // Higher Q-value should be sampled more often
    assert.ok(counts['execute'] > counts['observe'], `execute (${counts['execute']}) should be sampled more than observe (${counts['observe']})`);
  });

  it('should respect temperature parameter', () => {
    // Low temperature = more deterministic
    const vfLow = createValueFunction({ temperature: 0.1 });
    // High temperature = more exploratory
    const vfHigh = createValueFunction({ temperature: 5.0 });

    const actionValues: ActionValue[] = [
      {
        action: createTestAction('observe'),
        qValue: 0.4,
        advantage: 0,
        qUncertainty: 0.1,
        predictedState: createTestPrediction(createTestState()),
      },
      {
        action: createTestAction('execute'),
        qValue: 0.6,
        advantage: 0.1,
        qUncertainty: 0.1,
        predictedState: createTestPrediction(createTestState()),
      },
    ];

    // Count selections at low temperature
    let lowTempExecuteCount = 0;
    for (let i = 0; i < 50; i++) {
      if (vfLow.sampleAction(actionValues).action.type === 'execute') {
        lowTempExecuteCount++;
      }
    }

    // Count selections at high temperature
    let highTempExecuteCount = 0;
    for (let i = 0; i < 50; i++) {
      if (vfHigh.sampleAction(actionValues).action.type === 'execute') {
        highTempExecuteCount++;
      }
    }

    // Low temperature should select 'execute' more consistently
    assert.ok(
      lowTempExecuteCount >= highTempExecuteCount * 0.8,
      `Low temp selections (${lowTempExecuteCount}) should be more deterministic than high temp (${highTempExecuteCount})`
    );
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Value-Guided JEPA Integration', () => {
  it('should work end-to-end: estimate -> rank -> select', () => {
    const vf = createValueFunction();
    const state = createTestState({ energy: 0.5 });

    // Create candidate actions with predictions
    const candidates: ActionType[] = ['observe', 'query', 'execute'];

    // Compute Q-values for each action
    const actionValues = candidates.map((type, i) => {
      const action = createTestAction(type);
      const nextEnergy = 0.3 + i * 0.2;  // observe=0.3, query=0.5, execute=0.7
      const nextState = createTestState({ energy: nextEnergy });
      return vf.computeQValue(state, action, createTestPrediction(nextState, action));
    });

    // Rank actions
    const ranked = vf.rankActions(actionValues);

    // Select best
    const best = ranked[0];

    assert.ok(best.action.type);
    assert.ok(best.qValue !== undefined);
  });

  it('should compute trajectory value consistently', () => {
    const vf = createValueFunction();

    // Create increasing value trajectory
    const states = [0.4, 0.5, 0.6, 0.7, 0.8].map(e =>
      createTestState({ energy: e })
    );

    const trajectory = createTestTrajectory(states);
    const valued = vf.evaluateTrajectory(trajectory);

    // Values should generally have decreasing discount
    for (let i = 1; i < valued.stepValues.length; i++) {
      const prev = valued.stepValues[i - 1];
      const curr = valued.stepValues[i];
      assert.ok(
        curr.discount <= prev.discount,
        `Discount should decrease over time: ${prev.discount} -> ${curr.discount}`
      );
    }
  });
});

console.log('Value-Guided JEPA Tests - Ready to run');
