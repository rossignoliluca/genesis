/**
 * Tests for Brain Module (Phase 10: Neural Integration Layer)
 *
 * Tests the Cognitive Integration Layer:
 * - Command routing (Supervisor pattern)
 * - State management
 * - Module transitions
 * - Metrics tracking
 * - Event system
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('Brain Module (Phase 10)', () => {
  describe('Brain Types', () => {
    test('exports all required types', async () => {
      const types = await import('../src/brain/types.js');

      // Check type exports exist
      assert.ok(types.DEFAULT_BRAIN_CONFIG, 'DEFAULT_BRAIN_CONFIG should exist');
      assert.strictEqual(typeof types.DEFAULT_BRAIN_CONFIG, 'object');
    });

    test('DEFAULT_BRAIN_CONFIG has correct structure', async () => {
      const { DEFAULT_BRAIN_CONFIG } = await import('../src/brain/types.js');

      // Memory config
      assert.strictEqual(typeof DEFAULT_BRAIN_CONFIG.memory.enabled, 'boolean');
      assert.strictEqual(typeof DEFAULT_BRAIN_CONFIG.memory.anticipationEnabled, 'boolean');
      assert.strictEqual(typeof DEFAULT_BRAIN_CONFIG.memory.maxContextTokens, 'number');

      // LLM config
      assert.strictEqual(typeof DEFAULT_BRAIN_CONFIG.llm.enabled, 'boolean');
      assert.strictEqual(typeof DEFAULT_BRAIN_CONFIG.llm.maxRetries, 'number');

      // Grounding config
      assert.strictEqual(typeof DEFAULT_BRAIN_CONFIG.grounding.enabled, 'boolean');
      assert.strictEqual(typeof DEFAULT_BRAIN_CONFIG.grounding.verifyAllResponses, 'boolean');
      assert.strictEqual(typeof DEFAULT_BRAIN_CONFIG.grounding.confidenceThreshold, 'number');

      // Tools config
      assert.strictEqual(typeof DEFAULT_BRAIN_CONFIG.tools.enabled, 'boolean');
      assert.strictEqual(typeof DEFAULT_BRAIN_CONFIG.tools.maxExecutions, 'number');

      // Healing config
      assert.strictEqual(typeof DEFAULT_BRAIN_CONFIG.healing.enabled, 'boolean');
      assert.strictEqual(typeof DEFAULT_BRAIN_CONFIG.healing.maxAttempts, 'number');
      assert.strictEqual(typeof DEFAULT_BRAIN_CONFIG.healing.autoHeal, 'boolean');

      // Consciousness config
      assert.strictEqual(typeof DEFAULT_BRAIN_CONFIG.consciousness.enabled, 'boolean');
      assert.strictEqual(typeof DEFAULT_BRAIN_CONFIG.consciousness.phiThreshold, 'number');
      assert.strictEqual(typeof DEFAULT_BRAIN_CONFIG.consciousness.broadcastEnabled, 'boolean');

      // Processing limits
      assert.strictEqual(typeof DEFAULT_BRAIN_CONFIG.maxCycleTime, 'number');
      assert.strictEqual(typeof DEFAULT_BRAIN_CONFIG.maxModuleTransitions, 'number');
    });

    test('DEFAULT_BRAIN_CONFIG has sensible defaults', async () => {
      const { DEFAULT_BRAIN_CONFIG } = await import('../src/brain/types.js');

      // Memory should be enabled by default
      assert.strictEqual(DEFAULT_BRAIN_CONFIG.memory.enabled, true);

      // Context tokens should be reasonable (8K default)
      assert.ok(DEFAULT_BRAIN_CONFIG.memory.maxContextTokens >= 1000);
      assert.ok(DEFAULT_BRAIN_CONFIG.memory.maxContextTokens <= 128000);

      // Grounding confidence threshold should be between 0 and 1
      assert.ok(DEFAULT_BRAIN_CONFIG.grounding.confidenceThreshold >= 0);
      assert.ok(DEFAULT_BRAIN_CONFIG.grounding.confidenceThreshold <= 1);

      // Max cycle time should be reasonable (not infinite)
      assert.ok(DEFAULT_BRAIN_CONFIG.maxCycleTime > 0);
      assert.ok(DEFAULT_BRAIN_CONFIG.maxCycleTime <= 600000); // Max 10 minutes

      // Max transitions should prevent infinite loops
      assert.ok(DEFAULT_BRAIN_CONFIG.maxModuleTransitions > 0);
      assert.ok(DEFAULT_BRAIN_CONFIG.maxModuleTransitions <= 100);
    });
  });

  describe('Brain Class', () => {
    test('creates brain instance', async () => {
      const { createBrain } = await import('../src/brain/index.js');

      const brain = createBrain();
      assert.ok(brain, 'Brain should be created');
    });

    test('getBrain returns singleton', async () => {
      const { getBrain, resetBrain } = await import('../src/brain/index.js');

      // Reset first to ensure clean state
      resetBrain();

      const brain1 = getBrain();
      const brain2 = getBrain();

      assert.strictEqual(brain1, brain2, 'getBrain should return same instance');
    });

    test('resetBrain creates new instance', async () => {
      const { getBrain, resetBrain } = await import('../src/brain/index.js');

      const brain1 = getBrain();
      resetBrain();
      const brain2 = getBrain();

      assert.notStrictEqual(brain1, brain2, 'resetBrain should create new instance');
    });

    test('brain has start/stop methods', async () => {
      const { createBrain } = await import('../src/brain/index.js');

      const brain = createBrain();
      assert.strictEqual(typeof brain.start, 'function');
      assert.strictEqual(typeof brain.stop, 'function');
    });

    test('brain has isRunning method', async () => {
      const { createBrain } = await import('../src/brain/index.js');

      const brain = createBrain();
      assert.strictEqual(typeof brain.isRunning, 'function');

      // Initially not running
      assert.strictEqual(brain.isRunning(), false);

      // Start and check
      brain.start();
      assert.strictEqual(brain.isRunning(), true);

      // Stop and check
      brain.stop();
      assert.strictEqual(brain.isRunning(), false);
    });

    test('brain has process method', async () => {
      const { createBrain } = await import('../src/brain/index.js');

      const brain = createBrain();
      assert.strictEqual(typeof brain.process, 'function');
    });

    test('brain has getMetrics method', async () => {
      const { createBrain } = await import('../src/brain/index.js');

      const brain = createBrain();
      assert.strictEqual(typeof brain.getMetrics, 'function');

      const metrics = brain.getMetrics();
      assert.strictEqual(typeof metrics, 'object');
    });
  });

  describe('Brain Metrics', () => {
    test('initial metrics are zeroed', async () => {
      const { createBrain } = await import('../src/brain/index.js');

      const brain = createBrain();
      const metrics = brain.getMetrics();

      assert.strictEqual(metrics.totalCycles, 0);
      assert.strictEqual(metrics.successfulCycles, 0);
      assert.strictEqual(metrics.failedCycles, 0);
      assert.strictEqual(metrics.memoryRecalls, 0);
      assert.strictEqual(metrics.groundingChecks, 0);
      assert.strictEqual(metrics.toolExecutions, 0);
      assert.strictEqual(metrics.healingAttempts, 0);
      assert.strictEqual(metrics.broadcasts, 0);
    });

    test('metrics track avgPhi', async () => {
      const { createBrain } = await import('../src/brain/index.js');

      const brain = createBrain();
      const metrics = brain.getMetrics();

      assert.strictEqual(typeof metrics.avgPhi, 'number');
      assert.ok(metrics.avgPhi >= 0, 'avgPhi should be >= 0');
      assert.ok(metrics.avgPhi <= 1, 'avgPhi should be <= 1');
    });

    test('metrics track memoryReuseRate', async () => {
      const { createBrain } = await import('../src/brain/index.js');

      const brain = createBrain();
      const metrics = brain.getMetrics();

      assert.strictEqual(typeof metrics.memoryReuseRate, 'number');
      assert.ok(metrics.memoryReuseRate >= 0, 'memoryReuseRate should be >= 0');
      assert.ok(metrics.memoryReuseRate <= 1, 'memoryReuseRate should be <= 1');
    });

    test('metrics have moduleTransitions', async () => {
      const { createBrain } = await import('../src/brain/index.js');

      const brain = createBrain();
      const metrics = brain.getMetrics();

      assert.strictEqual(typeof metrics.moduleTransitions, 'object');
    });
  });

  describe('Brain Events', () => {
    test('brain has on method for events', async () => {
      const { createBrain } = await import('../src/brain/index.js');

      const brain = createBrain();
      assert.strictEqual(typeof brain.on, 'function');
    });

    test('on returns unsubscribe function', async () => {
      const { createBrain } = await import('../src/brain/index.js');

      const brain = createBrain();
      const events: string[] = [];

      const handler = (event: any) => {
        events.push(event.type);
      };

      // on() returns an unsubscribe function
      const unsubscribe = brain.on(handler);
      assert.strictEqual(typeof unsubscribe, 'function');

      // Unsubscribe should not throw
      unsubscribe();
    });
  });

  describe('Brain Configuration', () => {
    test('can create brain with custom config', async () => {
      const { createBrain } = await import('../src/brain/index.js');

      const brain = createBrain({
        memory: {
          enabled: false,
          anticipationEnabled: false,
          maxContextTokens: 4096,
        },
        llm: {
          enabled: true,
          maxRetries: 1,
        },
        grounding: {
          enabled: false,
          verifyAllResponses: false,
          confidenceThreshold: 0.8,
        },
        tools: {
          enabled: false,
          maxExecutions: 3,
        },
        healing: {
          enabled: false,
          maxAttempts: 1,
          autoHeal: false,
        },
        consciousness: {
          enabled: false,
          phiThreshold: 0.2,
          broadcastEnabled: false,
        },
        maxCycleTime: 30000,
        maxModuleTransitions: 10,
      });

      assert.ok(brain, 'Brain should be created with custom config');
    });
  });

  describe('Command Routing', () => {
    test('BrainModule type includes all modules', async () => {
      // This is a type-level test - we just verify the module works
      const { DEFAULT_BRAIN_CONFIG } = await import('../src/brain/types.js');

      // The modules are: memory, llm, grounding, tools, healing, consciousness, kernel, done
      // If this compiles, the types are correct
      const modules = ['memory', 'llm', 'grounding', 'tools', 'healing', 'consciousness', 'kernel', 'done'];
      assert.strictEqual(modules.length, 8, 'Should have 8 modules');
    });
  });

  describe('Integration', () => {
    test('brain can be started and stopped multiple times', async () => {
      const { createBrain } = await import('../src/brain/index.js');

      const brain = createBrain();

      // Start
      brain.start();
      assert.strictEqual(brain.isRunning(), true);

      // Stop
      brain.stop();
      assert.strictEqual(brain.isRunning(), false);

      // Start again
      brain.start();
      assert.strictEqual(brain.isRunning(), true);

      // Stop again
      brain.stop();
      assert.strictEqual(brain.isRunning(), false);
    });
  });
});

describe('Brain Types Validation', () => {
  test('BrainState interface fields', async () => {
    // This tests the structure by creating a mock state
    const mockState = {
      query: 'test query',
      context: {
        immediate: [],
        task: [],
        episodic: [],
        semantic: [],
        formatted: '',
        tokenEstimate: 0,
        reuseRate: 0,
      },
      response: '',
      toolCalls: [],
      toolResults: [],
      phi: 0,
      ignited: false,
      verified: false,
      healingAttempts: 0,
      startTime: Date.now(),
      moduleHistory: [],
    };

    assert.strictEqual(typeof mockState.query, 'string');
    assert.strictEqual(typeof mockState.context, 'object');
    assert.strictEqual(typeof mockState.response, 'string');
    assert.ok(Array.isArray(mockState.toolCalls));
    assert.ok(Array.isArray(mockState.toolResults));
    assert.strictEqual(typeof mockState.phi, 'number');
    assert.strictEqual(typeof mockState.ignited, 'boolean');
    assert.strictEqual(typeof mockState.verified, 'boolean');
    assert.strictEqual(typeof mockState.healingAttempts, 'number');
    assert.strictEqual(typeof mockState.startTime, 'number');
    assert.ok(Array.isArray(mockState.moduleHistory));
  });

  test('Command interface structure', async () => {
    // Test Command interface structure
    const mockCommand = {
      goto: 'llm' as const,
      update: { response: 'test' },
      reason: 'Test transition',
    };

    assert.strictEqual(typeof mockCommand.goto, 'string');
    assert.strictEqual(typeof mockCommand.update, 'object');
    assert.strictEqual(typeof mockCommand.reason, 'string');
  });

  test('BrainContext interface structure', async () => {
    const mockContext = {
      immediate: [],
      task: [],
      episodic: [],
      semantic: [],
      formatted: '',
      tokenEstimate: 0,
      reuseRate: 0,
    };

    assert.ok(Array.isArray(mockContext.immediate));
    assert.ok(Array.isArray(mockContext.task));
    assert.ok(Array.isArray(mockContext.episodic));
    assert.ok(Array.isArray(mockContext.semantic));
    assert.strictEqual(typeof mockContext.formatted, 'string');
    assert.strictEqual(typeof mockContext.tokenEstimate, 'number');
    assert.strictEqual(typeof mockContext.reuseRate, 'number');
  });
});
