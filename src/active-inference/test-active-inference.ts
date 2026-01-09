/**
 * Genesis 6.1 - Active Inference Tests
 *
 * Tests for the autonomous decision-making system.
 *
 * Run: node --test dist/active-inference/test-active-inference.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

import {
  createActiveInferenceEngine,
  createObservationGatherer,
  createActionExecutorManager,
  createAutonomousLoop,
  registerAction,
  Observation,
  Beliefs,
  ACTIONS,
} from './index.js';

// ============================================================================
// Core Engine Tests
// ============================================================================

describe('ActiveInferenceEngine', () => {
  it('should initialize with default beliefs', () => {
    const engine = createActiveInferenceEngine();
    const beliefs = engine.getBeliefs();

    assert.ok(beliefs.viability.length === 5);
    assert.ok(beliefs.worldState.length === 4);
    assert.ok(beliefs.coupling.length === 5);
    assert.ok(beliefs.goalProgress.length === 4);

    // Beliefs should sum to 1
    const sumViability = beliefs.viability.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sumViability - 1) < 0.001, 'Viability beliefs should sum to 1');
  });

  it('should update beliefs on observation', () => {
    const engine = createActiveInferenceEngine();

    const obs: Observation = {
      energy: 4,      // full
      phi: 3,         // high
      tool: 2,        // success
      coherence: 2,   // consistent
      task: 2,        // active
    };

    const beforeBeliefs = engine.getBeliefs();
    const afterBeliefs = engine.inferStates(obs);

    // Beliefs should have changed
    assert.ok(
      JSON.stringify(beforeBeliefs) !== JSON.stringify(afterBeliefs),
      'Beliefs should update after observation'
    );

    // High energy observation should increase viability belief
    assert.ok(
      afterBeliefs.viability[4] > beforeBeliefs.viability[4],
      'High energy obs should increase optimal viability belief'
    );
  });

  it('should infer policy with correct dimensions', () => {
    const engine = createActiveInferenceEngine();

    // Update beliefs first
    engine.inferStates({
      energy: 2,
      phi: 2,
      tool: 1,
      coherence: 1,
      task: 1,
    });

    const policy = engine.inferPolicies();

    assert.ok(policy.length === ACTIONS.length, 'Policy should have same length as actions');

    // Policy should sum to 1
    const sum = policy.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 0.001, 'Policy should sum to 1');

    // All probabilities should be non-negative
    assert.ok(policy.every(p => p >= 0), 'All policy probabilities should be non-negative');
  });

  it('should sample valid action from policy', () => {
    const engine = createActiveInferenceEngine();

    engine.inferStates({
      energy: 2,
      phi: 2,
      tool: 1,
      coherence: 1,
      task: 1,
    });

    const policy = engine.inferPolicies();
    const action = engine.sampleAction(policy);

    assert.ok(ACTIONS.includes(action), `Action ${action} should be valid`);
  });

  it('should prefer recharge when energy is critical', () => {
    const engine = createActiveInferenceEngine();

    // Low energy observation
    engine.inferStates({
      energy: 0,      // depleted
      phi: 1,
      tool: 1,
      coherence: 1,
      task: 1,
    });

    const policy = engine.inferPolicies();

    // Recharge should have high probability
    const rechargeIdx = ACTIONS.indexOf('recharge');
    const restIdx = ACTIONS.indexOf('rest.idle');

    // Either recharge or rest should be preferred
    const preferSurvival = policy[rechargeIdx] > 0.1 || policy[restIdx] > 0.1;
    assert.ok(preferSurvival, 'Should prefer survival actions when energy is critical');
  });

  it('should prefer execute.task when close to goal', () => {
    const engine = createActiveInferenceEngine();

    // High energy, on-track observation
    engine.inferStates({
      energy: 4,      // full
      phi: 3,         // high
      tool: 2,        // success
      coherence: 2,   // consistent
      task: 2,        // active
    });

    const policy = engine.inferPolicies();

    // Execute task should have reasonable probability
    const executeIdx = ACTIONS.indexOf('execute.task');
    assert.ok(policy[executeIdx] > 0.05, 'Should consider executing task when conditions are good');
  });

  it('should track statistics correctly', () => {
    const engine = createActiveInferenceEngine();

    // Run several inference cycles
    for (let i = 0; i < 5; i++) {
      engine.inferStates({
        energy: 2,
        phi: 2,
        tool: 1,
        coherence: 1,
        task: 1,
      });

      const policy = engine.inferPolicies();
      engine.sampleAction(policy);
    }

    const stats = engine.getStats();

    assert.strictEqual(stats.inferenceCount, 5);
    assert.ok(stats.averageSurprise >= 0, 'Average surprise should be non-negative');
  });
});

// ============================================================================
// Observation Gatherer Tests
// ============================================================================

describe('ObservationGatherer', () => {
  it('should create observations from raw values', () => {
    const gatherer = createObservationGatherer();

    const obs = gatherer.fromRaw({
      energy: 0.9,
      phi: 0.8,
      toolSuccess: true,
      coherent: true,
      taskStatus: 'running',
    });

    assert.strictEqual(obs.energy, 4, 'High energy should map to 4');
    assert.strictEqual(obs.phi, 3, 'High phi should map to 3');
    assert.strictEqual(obs.tool, 2, 'Success should map to 2');
    assert.strictEqual(obs.coherence, 2, 'Coherent should map to 2');
    assert.strictEqual(obs.task, 2, 'Running should map to 2');
  });

  it('should gather observations with defaults', async () => {
    const gatherer = createObservationGatherer();

    // Without configuration, should use defaults
    const obs = await gatherer.gather();

    assert.ok(obs.energy >= 0 && obs.energy <= 4);
    assert.ok(obs.phi >= 0 && obs.phi <= 3);
    assert.ok(obs.tool >= 0 && obs.tool <= 2);
    assert.ok(obs.coherence >= 0 && obs.coherence <= 2);
    assert.ok(obs.task >= 0 && obs.task <= 3);
  });

  it('should use configured sources', async () => {
    const gatherer = createObservationGatherer();

    gatherer.configure({
      kernelState: () => ({ energy: 0.1, state: 'idle', taskStatus: 'pending' }),
      phiState: () => ({ phi: 0.2, state: 'drowsy' }),
    });

    const obs = await gatherer.gather();

    assert.strictEqual(obs.energy, 1, 'Low energy should map to 1');
    assert.strictEqual(obs.phi, 1, 'Low phi should map to 1');
  });
});

// ============================================================================
// Action Executor Tests
// ============================================================================

describe('ActionExecutorManager', () => {
  it('should execute actions and track history', async () => {
    const manager = createActionExecutorManager();

    const result = await manager.execute('rest.idle');

    assert.ok(result.success);
    assert.strictEqual(result.action, 'rest.idle');

    const history = manager.getHistory();
    assert.strictEqual(history.length, 1);
  });

  it('should allow custom action registration', async () => {
    const manager = createActionExecutorManager();

    let executed = false;
    registerAction('sense.mcp', async () => {
      executed = true;
      return {
        success: true,
        action: 'sense.mcp',
        data: { test: true },
        duration: 0,
      };
    });

    await manager.execute('sense.mcp');
    assert.ok(executed, 'Custom action should be executed');
  });

  it('should calculate statistics correctly', async () => {
    const manager = createActionExecutorManager();

    await manager.execute('rest.idle');
    await manager.execute('rest.idle');
    await manager.execute('sense.mcp');

    const stats = manager.getStats();

    assert.strictEqual(stats.total, 3);
    assert.strictEqual(stats.successful, 3);
    assert.strictEqual(stats.successRate, 1);
  });
});

// ============================================================================
// Autonomous Loop Tests
// ============================================================================

describe('AutonomousLoop', () => {
  it('should run specified number of cycles', async () => {
    const loop = createAutonomousLoop({
      cycleInterval: 0,  // No delay between cycles
      verbose: false,
    });

    const stats = await loop.run(5);

    assert.strictEqual(stats.cycles, 5);
    assert.ok(stats.finalBeliefs.viability.length === 5);
  });

  it('should call onCycle handlers', async () => {
    const loop = createAutonomousLoop({
      cycleInterval: 0,
      verbose: false,
    });

    let cyclesCalled = 0;
    loop.onCycle(() => {
      cyclesCalled++;
    });

    await loop.run(3);

    assert.strictEqual(cyclesCalled, 3);
  });

  it('should call onStop handlers', async () => {
    const loop = createAutonomousLoop({
      cycleInterval: 0,
      verbose: false,
    });

    let stopReason = '';
    loop.onStop((reason) => {
      stopReason = reason;
    });

    await loop.run(2);

    assert.strictEqual(stopReason, 'cycle_limit');
  });

  it('should stop on manual stop', async () => {
    const loop = createAutonomousLoop({
      cycleInterval: 10,
      maxCycles: 0,  // Unlimited
      verbose: false,
    });

    // Schedule stop after 2 cycles
    setTimeout(() => loop.stop('test_stop'), 25);

    const stats = await loop.run();

    assert.ok(stats.cycles >= 1 && stats.cycles <= 5, 'Should have run a few cycles before stop');
  });

  it('should provide valid most likely state', async () => {
    const loop = createAutonomousLoop({
      cycleInterval: 0,
      verbose: false,
    });

    await loop.run(3);

    const state = loop.getMostLikelyState();

    assert.ok(['critical', 'low', 'medium', 'high', 'optimal'].includes(state.viability));
    assert.ok(['unknown', 'stable', 'changing', 'hostile'].includes(state.worldState));
    assert.ok(['none', 'weak', 'medium', 'strong', 'synced'].includes(state.coupling));
    assert.ok(['blocked', 'slow', 'onTrack', 'achieved'].includes(state.goalProgress));
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Active Inference Integration', () => {
  it('should run complete inference cycle', async () => {
    const loop = createAutonomousLoop({
      cycleInterval: 0,
      verbose: false,
    });

    // Configure custom observation source
    loop.configureObservations({
      kernelState: () => ({
        energy: 0.7,
        state: 'thinking',
        taskStatus: 'running',
      }),
    });

    // Run cycles
    const stats = await loop.run(10);

    // Verify reasonable behavior
    assert.ok(stats.cycles === 10);
    assert.ok(Object.keys(stats.actions).length > 0, 'Should have taken some actions');
  });

  it('should adapt behavior to changing observations', async () => {
    const engine = createActiveInferenceEngine();

    // Start with low energy
    engine.inferStates({
      energy: 0,
      phi: 1,
      tool: 1,
      coherence: 1,
      task: 1,
    });

    const lowEnergyPolicy = engine.inferPolicies();
    const lowEnergyRecharge = lowEnergyPolicy[ACTIONS.indexOf('recharge')];
    const lowEnergyRest = lowEnergyPolicy[ACTIONS.indexOf('rest.idle')];

    // Then high energy
    engine.inferStates({
      energy: 4,
      phi: 3,
      tool: 2,
      coherence: 2,
      task: 2,
    });

    const highEnergyPolicy = engine.inferPolicies();
    const highEnergyRecharge = highEnergyPolicy[ACTIONS.indexOf('recharge')];
    const highEnergyRest = highEnergyPolicy[ACTIONS.indexOf('rest.idle')];

    // Low energy should prefer recharge/rest more than high energy
    assert.ok(
      (lowEnergyRecharge + lowEnergyRest) > (highEnergyRecharge + highEnergyRest),
      'Low energy should prefer survival actions more'
    );
  });
});

console.log('Active Inference Tests - Ready to run');
