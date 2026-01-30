/**
 * Thinking Module Tests
 * Tests for the advanced reasoning system
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';

describe('ThinkingModule', () => {
  let ThinkingEngine: any;
  let createThinkingEngine: any;
  let DEFAULT_TOT_CONFIG: any;
  let DEFAULT_GOT_CONFIG: any;

  beforeEach(async () => {
    const module = await import('../dist/src/thinking/index.js');
    ThinkingEngine = module.ThinkingEngine;
    createThinkingEngine = module.createThinkingEngine;
    DEFAULT_TOT_CONFIG = module.DEFAULT_TOT_CONFIG;
    DEFAULT_GOT_CONFIG = module.DEFAULT_GOT_CONFIG;
  });

  // ============================================================================
  // ThinkingEngine Creation Tests
  // ============================================================================

  describe('ThinkingEngine', () => {
    test('creates with default config', () => {
      const engine = new ThinkingEngine();
      assert.ok(engine, 'Should create engine');
    });

    test('accepts custom config', () => {
      const engine = new ThinkingEngine({
        maxThinkingTokens: 2000,
        selfCritiqueRounds: 3,
        enableMetacognition: true,
      });
      assert.ok(engine, 'Should create with custom config');
    });

    test('getConfig returns configuration', () => {
      const engine = new ThinkingEngine({
        maxThinkingTokens: 5000,
      });

      const config = engine.getConfig();
      assert.strictEqual(config.maxThinkingTokens, 5000);
    });

    test('engine has required methods', () => {
      const engine = new ThinkingEngine();

      // Check key methods exist
      assert.ok(typeof engine.think === 'function' || typeof engine.reason === 'function',
        'Should have thinking method');
    });
  });

  // ============================================================================
  // Default Config Tests
  // ============================================================================

  describe('default configs', () => {
    test('DEFAULT_TOT_CONFIG has required fields', () => {
      assert.ok(DEFAULT_TOT_CONFIG, 'Should have ToT config');
      assert.ok('branchingFactor' in DEFAULT_TOT_CONFIG);
      assert.ok('maxDepth' in DEFAULT_TOT_CONFIG);
      assert.ok('strategy' in DEFAULT_TOT_CONFIG);
    });

    test('DEFAULT_GOT_CONFIG has required fields', () => {
      assert.ok(DEFAULT_GOT_CONFIG, 'Should have GoT config');
      assert.ok('maxNodes' in DEFAULT_GOT_CONFIG);
      assert.ok('maxRefinements' in DEFAULT_GOT_CONFIG);
    });

    test('ToT config has sensible defaults', () => {
      assert.ok(DEFAULT_TOT_CONFIG.branchingFactor >= 2);
      assert.ok(DEFAULT_TOT_CONFIG.maxDepth >= 1);
      assert.ok(['bfs', 'dfs', 'mcts', 'beam'].includes(DEFAULT_TOT_CONFIG.strategy));
    });
  });

  // ============================================================================
  // Factory Function Tests
  // ============================================================================

  describe('createThinkingEngine', () => {
    test('creates default engine', () => {
      const engine = createThinkingEngine();
      assert.ok(engine);
    });

    test('creates engine with custom config', () => {
      const engine = createThinkingEngine({
        maxThinkingTokens: 3000,
        selfCritiqueRounds: 2,
      });
      assert.ok(engine);

      const config = engine.getConfig();
      assert.strictEqual(config.maxThinkingTokens, 3000);
    });
  });

  // ============================================================================
  // Type Exports Tests
  // ============================================================================

  describe('type exports', () => {
    test('exports ThoughtNode interface', async () => {
      const module = await import('../dist/src/thinking/index.js');
      // TypeScript interfaces aren't runtime values, but we can check related types
      assert.ok(module.DEFAULT_TOT_CONFIG, 'Should have ToT related exports');
    });

    test('exports ToTSearchStrategy type', async () => {
      const module = await import('../dist/src/thinking/index.js');
      // Check that strategies are valid
      const strategies = ['bfs', 'dfs', 'mcts', 'beam'];
      assert.ok(strategies.includes(module.DEFAULT_TOT_CONFIG.strategy));
    });

    test('exports PRMConfig', async () => {
      const module = await import('../dist/src/thinking/index.js');
      assert.ok(module.DEFAULT_PRM_CONFIG, 'Should have PRM config');
      assert.ok('enabled' in module.DEFAULT_PRM_CONFIG);
      assert.ok('minStepScore' in module.DEFAULT_PRM_CONFIG);
    });

    test('exports EntropyConfig', async () => {
      const module = await import('../dist/src/thinking/index.js');
      assert.ok(module.DEFAULT_ENTROPY_CONFIG, 'Should have entropy config');
      assert.ok('numSamples' in module.DEFAULT_ENTROPY_CONFIG);
    });

    test('exports ComputeBudgetConfig', async () => {
      const module = await import('../dist/src/thinking/index.js');
      assert.ok(module.DEFAULT_COMPUTE_BUDGET_CONFIG, 'Should have compute budget config');
    });

    test('exports SuperCorrectConfig', async () => {
      const module = await import('../dist/src/thinking/index.js');
      assert.ok(module.DEFAULT_SUPERCORRECT_CONFIG, 'Should have SuperCorrect config');
    });

    test('exports TraceCompressionConfig', async () => {
      const module = await import('../dist/src/thinking/index.js');
      assert.ok(module.DEFAULT_TRACE_COMPRESSION_CONFIG, 'Should have trace compression config');
    });
  });

  // ============================================================================
  // Config Validation Tests
  // ============================================================================

  describe('config validation', () => {
    test('ToT branching factor is positive', () => {
      assert.ok(DEFAULT_TOT_CONFIG.branchingFactor > 0);
    });

    test('ToT max depth is positive', () => {
      assert.ok(DEFAULT_TOT_CONFIG.maxDepth > 0);
    });

    test('GoT max nodes is positive', () => {
      assert.ok(DEFAULT_GOT_CONFIG.maxNodes > 0);
    });

    test('GoT max refinements is non-negative', () => {
      assert.ok(DEFAULT_GOT_CONFIG.maxRefinements >= 0);
    });
  });

  // ============================================================================
  // Engine Method Tests
  // ============================================================================

  describe('engine methods', () => {
    test('engine instance has getConfig', () => {
      const engine = new ThinkingEngine();
      assert.ok(typeof engine.getConfig === 'function');

      const config = engine.getConfig();
      assert.ok(typeof config === 'object');
    });

    test('engine can be instantiated multiple times', () => {
      const engine1 = new ThinkingEngine({ maxThinkingTokens: 1000 });
      const engine2 = new ThinkingEngine({ maxThinkingTokens: 2000 });

      const config1 = engine1.getConfig();
      const config2 = engine2.getConfig();

      assert.notStrictEqual(config1.maxThinkingTokens, config2.maxThinkingTokens);
    });
  });

  // ============================================================================
  // Integration Smoke Tests
  // ============================================================================

  describe('integration', () => {
    test('full module imports without error', async () => {
      const module = await import('../dist/src/thinking/index.js');

      // Verify key exports exist
      assert.ok(module.ThinkingEngine);
      assert.ok(module.createThinkingEngine);
      assert.ok(module.DEFAULT_TOT_CONFIG);
      assert.ok(module.DEFAULT_GOT_CONFIG);
      assert.ok(module.DEFAULT_PRM_CONFIG);
    });

    test('engine creation flow', () => {
      // Create engine
      const engine = createThinkingEngine({
        maxThinkingTokens: 4000,
        selfCritiqueRounds: 2,
        enableMetacognition: true,
      });

      // Get config
      const config = engine.getConfig();

      // Verify config
      assert.strictEqual(config.maxThinkingTokens, 4000);
      assert.strictEqual(config.selfCritiqueRounds, 2);
      assert.strictEqual(config.enableMetacognition, true);
    });
  });
});
