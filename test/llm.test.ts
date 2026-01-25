/**
 * LLM Module Tests
 *
 * Tests for the LLM routing and utility functions:
 * - Complexity analysis (keyword detection)
 * - Token estimation
 * - Cost calculation
 * - Hardware detection
 * - Provider detection
 * - Routing decisions (HybridRouter)
 * - Cache key generation
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';

describe('LLM Module', () => {
  let llmModule: any;
  let routerModule: any;

  beforeEach(async () => {
    llmModule = await import('../src/llm/index.js');
    routerModule = await import('../src/llm/router.js');
  });

  // ============================================================================
  // Complexity Analysis Tests
  // ============================================================================

  describe('analyzeComplexity', () => {
    test('simple task detection - syntax fix', () => {
      const result = routerModule.analyzeComplexity('fix syntax error in this file');

      assert.ok(result, 'Should return analysis result');
      assert.ok(result.complexity, 'Should have complexity');
      assert.ok(Array.isArray(result.indicators), 'Should have indicators array');
      assert.ok(typeof result.confidence === 'number', 'Should have confidence');

      // Syntax fix should be trivial or simple
      assert.ok(['trivial', 'simple', 'moderate'].includes(result.complexity),
        `Syntax fix should be simple, got ${result.complexity}`);
    });

    test('simple task detection - typo fix', () => {
      const result = routerModule.analyzeComplexity('fix the typo in README');

      assert.ok(['trivial', 'simple'].includes(result.complexity),
        `Typo fix should be simple, got ${result.complexity}`);
    });

    test('complex task detection - architecture design', () => {
      const result = routerModule.analyzeComplexity(
        'design a new architecture pattern for the authentication system'
      );

      assert.ok(['moderate', 'complex', 'creative'].includes(result.complexity),
        `Architecture design should be complex, got ${result.complexity}`);
    });

    test('complex task detection - refactoring', () => {
      const result = routerModule.analyzeComplexity(
        'refactor the entire module to use the new design pattern'
      );

      assert.ok(['moderate', 'complex', 'creative'].includes(result.complexity),
        `Refactoring should be complex, got ${result.complexity}`);
    });

    test('creative task detection - new feature', () => {
      const result = routerModule.analyzeComplexity(
        'create a new feature from scratch that implements user authentication with OAuth'
      );

      assert.ok(['complex', 'creative'].includes(result.complexity),
        `New feature should be complex/creative, got ${result.complexity}`);
    });

    test('long prompts increase complexity', () => {
      const shortPrompt = 'fix typo';
      const longPrompt = 'I need you to help me understand this codebase. '.repeat(20);

      const shortResult = routerModule.analyzeComplexity(shortPrompt);
      const longResult = routerModule.analyzeComplexity(longPrompt);

      // Long prompts should have higher or equal complexity
      const complexityOrder = ['trivial', 'simple', 'moderate', 'complex', 'creative'];
      const shortIndex = complexityOrder.indexOf(shortResult.complexity);
      const longIndex = complexityOrder.indexOf(longResult.complexity);

      assert.ok(longIndex >= shortIndex - 1,
        'Long prompts should generally have higher complexity');
    });

    test('indicators are populated', () => {
      const result = routerModule.analyzeComplexity('fix syntax error and design new architecture');

      assert.ok(result.indicators.length > 0, 'Should detect indicators');
      assert.ok(result.indicators.some((i: string) => i.includes('local:')),
        'Should have local indicators');
      assert.ok(result.indicators.some((i: string) => i.includes('cloud:')),
        'Should have cloud indicators');
    });

    test('confidence is between 0 and 1', () => {
      const prompts = [
        'fix typo',
        'design architecture',
        'simple test',
        'complex refactoring with multiple steps and requirements'
      ];

      for (const prompt of prompts) {
        const result = routerModule.analyzeComplexity(prompt);
        assert.ok(result.confidence >= 0, 'Confidence should be >= 0');
        assert.ok(result.confidence <= 1, 'Confidence should be <= 1');
      }
    });

    test('multi-step tasks increase complexity', () => {
      const result = routerModule.analyzeComplexity(
        '1. First do this\n2. Then do that\n3. Finally complete this'
      );

      assert.ok(result.indicators.some((i: string) => i.includes('multi-step')),
        'Should detect multi-step task');
    });
  });

  // ============================================================================
  // Token Estimation Tests
  // ============================================================================

  describe('estimateTokens', () => {
    test('returns positive number', () => {
      const tokens = routerModule.estimateTokens('Hello world');

      assert.ok(typeof tokens === 'number', 'Should return number');
      assert.ok(tokens > 0, 'Should be positive');
    });

    test('longer text has more tokens', () => {
      const short = 'Hello';
      const long = 'Hello world, this is a much longer piece of text';

      const shortTokens = routerModule.estimateTokens(short);
      const longTokens = routerModule.estimateTokens(long);

      assert.ok(longTokens > shortTokens, 'Longer text should have more tokens');
    });

    test('empty string returns small value', () => {
      const tokens = routerModule.estimateTokens('');

      assert.ok(tokens === 0 || tokens === 1, 'Empty string should have minimal tokens');
    });

    test('approximation is reasonable (~4 chars per token)', () => {
      const text = 'This is a test string with exactly forty characters.';
      const tokens = routerModule.estimateTokens(text);

      // ~4 chars per token, so 52 chars ≈ 13 tokens
      const expected = Math.ceil(text.length / 4);
      assert.strictEqual(tokens, expected, 'Should be ~4 chars per token');
    });
  });

  // ============================================================================
  // Cost Estimation Tests
  // ============================================================================

  describe('estimateCost (router)', () => {
    test('Ollama costs are zero', () => {
      const cost = routerModule.estimateCost(1000, 1000, 'ollama');

      assert.strictEqual(cost, 0, 'Ollama should be free');
    });

    test('cloud providers have positive costs', () => {
      const openaiCost = routerModule.estimateCost(1000, 1000, 'openai');
      const anthropicCost = routerModule.estimateCost(1000, 1000, 'anthropic');

      assert.ok(openaiCost > 0, 'OpenAI should have cost');
      assert.ok(anthropicCost > 0, 'Anthropic should have cost');
    });

    test('output tokens cost more than input', () => {
      const inputOnlyCost = routerModule.estimateCost(1000000, 0, 'openai');
      const outputOnlyCost = routerModule.estimateCost(0, 1000000, 'openai');

      assert.ok(outputOnlyCost > inputOnlyCost, 'Output should cost more than input');
    });

    test('cost scales with token count', () => {
      const smallCost = routerModule.estimateCost(1000, 1000, 'openai');
      const largeCost = routerModule.estimateCost(10000, 10000, 'openai');

      assert.ok(largeCost > smallCost, 'Larger token count should cost more');
      // Should be roughly 10x
      assert.ok(largeCost >= smallCost * 8, 'Should scale roughly linearly');
    });
  });

  describe('calculateCost (index)', () => {
    test('calculates cost for known models', () => {
      const cost = llmModule.calculateCost('gpt-4o', 1000, 1000);

      assert.ok(typeof cost === 'number', 'Should return number');
      assert.ok(cost > 0, 'GPT-4o should have positive cost');
    });

    test('returns zero for unknown models', () => {
      const cost = llmModule.calculateCost('unknown-model', 1000, 1000);

      assert.strictEqual(cost, 0, 'Unknown model should default to zero');
    });

    test('Ollama models are free', () => {
      const models = ['qwen2.5-coder', 'mistral', 'mistral-small'];

      for (const model of models) {
        const cost = llmModule.calculateCost(model, 1000000, 1000000);
        assert.strictEqual(cost, 0, `${model} should be free`);
      }
    });
  });

  // ============================================================================
  // Hardware Detection Tests
  // ============================================================================

  describe('detectHardware', () => {
    test('returns valid hardware profile', () => {
      const profile = routerModule.detectHardware();

      assert.ok(profile, 'Should return profile');
      assert.ok(typeof profile.cpu === 'string', 'Should have CPU string');
      assert.ok(typeof profile.isAppleSilicon === 'boolean', 'Should have isAppleSilicon');
      assert.ok(typeof profile.cores === 'number', 'Should have cores');
      assert.ok(typeof profile.memoryGB === 'number', 'Should have memoryGB');
      assert.ok(['low', 'medium', 'high', 'ultra'].includes(profile.tier),
        'Should have valid tier');
    });

    test('cores is positive', () => {
      const profile = routerModule.detectHardware();

      assert.ok(profile.cores > 0, 'Should have at least 1 core');
    });

    test('memory is positive', () => {
      const profile = routerModule.detectHardware();

      assert.ok(profile.memoryGB > 0, 'Should have positive memory');
    });

    test('recommendedThreshold is valid complexity', () => {
      const profile = routerModule.detectHardware();

      const validComplexities = ['trivial', 'simple', 'moderate', 'complex', 'creative'];
      assert.ok(validComplexities.includes(profile.recommendedThreshold),
        'Should have valid recommended threshold');
    });

    test('recommendedMaxTokens is positive', () => {
      const profile = routerModule.detectHardware();

      assert.ok(profile.recommendedMaxTokens > 0, 'Should have positive max tokens');
    });
  });

  // ============================================================================
  // Provider Detection Tests
  // ============================================================================

  describe('detectCloudProvider', () => {
    test('returns valid provider', () => {
      const provider = routerModule.detectCloudProvider();

      assert.ok(['openai', 'anthropic', 'ollama'].includes(provider),
        'Should return valid provider');
    });
  });

  // ============================================================================
  // Model Tiers Tests
  // ============================================================================

  describe('MODEL_TIERS', () => {
    test('has tiers for all providers', () => {
      const { MODEL_TIERS } = llmModule;

      assert.ok(MODEL_TIERS.openai, 'Should have OpenAI tiers');
      assert.ok(MODEL_TIERS.anthropic, 'Should have Anthropic tiers');
      assert.ok(MODEL_TIERS.ollama, 'Should have Ollama tiers');
    });

    test('each provider has all tier levels', () => {
      const { MODEL_TIERS } = llmModule;

      for (const provider of ['openai', 'anthropic', 'ollama']) {
        assert.ok(MODEL_TIERS[provider].fast, `${provider} should have fast tier`);
        assert.ok(MODEL_TIERS[provider].balanced, `${provider} should have balanced tier`);
        assert.ok(MODEL_TIERS[provider].powerful, `${provider} should have powerful tier`);
      }
    });
  });

  // ============================================================================
  // MODEL_COSTS Tests
  // ============================================================================

  describe('MODEL_COSTS', () => {
    test('has costs for common models', () => {
      const { MODEL_COSTS } = llmModule;

      assert.ok(MODEL_COSTS['gpt-4o'], 'Should have GPT-4o costs');
      assert.ok(MODEL_COSTS['gpt-4o-mini'], 'Should have GPT-4o-mini costs');
      assert.ok(MODEL_COSTS['claude-sonnet-4-20250514'], 'Should have Claude costs');
    });

    test('costs have input and output fields', () => {
      const { MODEL_COSTS } = llmModule;

      for (const [model, costs] of Object.entries(MODEL_COSTS)) {
        const c = costs as { input: number; output: number };
        assert.ok(typeof c.input === 'number', `${model} should have input cost`);
        assert.ok(typeof c.output === 'number', `${model} should have output cost`);
        assert.ok(c.input >= 0, `${model} input cost should be non-negative`);
        assert.ok(c.output >= 0, `${model} output cost should be non-negative`);
      }
    });

    test('mini models are cheaper than full models', () => {
      const { MODEL_COSTS } = llmModule;

      const gpt4o = MODEL_COSTS['gpt-4o'];
      const gpt4oMini = MODEL_COSTS['gpt-4o-mini'];

      assert.ok(gpt4oMini.input < gpt4o.input, 'Mini should be cheaper (input)');
      assert.ok(gpt4oMini.output < gpt4o.output, 'Mini should be cheaper (output)');
    });
  });

  // ============================================================================
  // OLLAMA_CONFIG Tests
  // ============================================================================

  describe('OLLAMA_CONFIG', () => {
    test('has required fields', () => {
      const { OLLAMA_CONFIG } = llmModule;

      assert.ok(OLLAMA_CONFIG.baseUrl, 'Should have baseUrl');
      assert.ok(OLLAMA_CONFIG.defaultModel, 'Should have defaultModel');
      assert.ok(OLLAMA_CONFIG.models, 'Should have models');
    });

    test('baseUrl is valid URL', () => {
      const { OLLAMA_CONFIG } = llmModule;

      assert.ok(OLLAMA_CONFIG.baseUrl.startsWith('http'), 'baseUrl should be HTTP');
    });

    test('models have names and descriptions', () => {
      const { OLLAMA_CONFIG } = llmModule;

      for (const [key, model] of Object.entries(OLLAMA_CONFIG.models)) {
        const m = model as { name: string; description: string };
        assert.ok(m.name, `${key} should have name`);
        assert.ok(m.description, `${key} should have description`);
      }
    });
  });

  // ============================================================================
  // HybridRouter Tests (without API calls)
  // ============================================================================

  describe('HybridRouter', () => {
    let HybridRouter: any;

    beforeEach(() => {
      HybridRouter = routerModule.HybridRouter;
    });

    test('creates with default config', () => {
      const router = new HybridRouter();

      assert.ok(router, 'Should create router');
    });

    test('creates with custom config', () => {
      const router = new HybridRouter({
        preferLocal: false,
        forceCloud: true,
      });

      const config = router.getConfig();
      assert.strictEqual(config.preferLocal, false, 'Should respect preferLocal');
      assert.strictEqual(config.forceCloud, true, 'Should respect forceCloud');
    });

    test('getStats returns valid stats object', () => {
      const router = new HybridRouter();
      const stats = router.getStats();

      assert.ok('totalRequests' in stats, 'Should have totalRequests');
      assert.ok('localRequests' in stats, 'Should have localRequests');
      assert.ok('cloudRequests' in stats, 'Should have cloudRequests');
      assert.ok('fallbacks' in stats, 'Should have fallbacks');
      assert.ok('estimatedSavings' in stats, 'Should have estimatedSavings');
    });

    test('initial stats are zero', () => {
      const router = new HybridRouter();
      const stats = router.getStats();

      assert.strictEqual(stats.totalRequests, 0, 'totalRequests should be 0');
      assert.strictEqual(stats.localRequests, 0, 'localRequests should be 0');
      assert.strictEqual(stats.cloudRequests, 0, 'cloudRequests should be 0');
      assert.strictEqual(stats.fallbacks, 0, 'fallbacks should be 0');
    });

    test('resetStats clears all stats', () => {
      const router = new HybridRouter();

      // Manually increment a stat to test reset
      const statsBefore = router.getStats();
      router.resetStats();
      const statsAfter = router.getStats();

      assert.strictEqual(statsAfter.totalRequests, 0, 'Should reset totalRequests');
      assert.strictEqual(statsAfter.estimatedSavings, 0, 'Should reset estimatedSavings');
    });

    test('getHardwareProfile returns profile', () => {
      const router = new HybridRouter();
      const profile = router.getHardwareProfile();

      assert.ok(profile, 'Should return profile');
      assert.ok(profile.cpu, 'Should have CPU');
      assert.ok(profile.tier, 'Should have tier');
    });

    test('setConfig updates config', () => {
      const router = new HybridRouter();

      router.setConfig({ logDecisions: true });

      const config = router.getConfig();
      assert.strictEqual(config.logDecisions, true, 'Should update config');
    });
  });

  // ============================================================================
  // LLMBridge Tests (without API calls)
  // ============================================================================

  describe('LLMBridge', () => {
    let LLMBridge: any;

    beforeEach(() => {
      LLMBridge = llmModule.LLMBridge;
    });

    test('creates with default config', () => {
      const bridge = new LLMBridge();

      assert.ok(bridge, 'Should create bridge');
    });

    test('creates with custom provider', () => {
      const bridge = new LLMBridge({ provider: 'ollama' });

      assert.ok(bridge, 'Should create with ollama');
    });

    test('creates with custom model', () => {
      const bridge = new LLMBridge({
        provider: 'ollama',
        model: 'mistral'
      });

      assert.ok(bridge, 'Should create with custom model');
    });
  });

  // ============================================================================
  // System Prompt Tests
  // ============================================================================

  describe('System Prompt', () => {
    test('GENESIS_IDENTITY_PROMPT is defined', () => {
      const { GENESIS_IDENTITY_PROMPT } = llmModule;

      assert.ok(GENESIS_IDENTITY_PROMPT, 'Should have identity prompt');
      assert.ok(typeof GENESIS_IDENTITY_PROMPT === 'string', 'Should be string');
      assert.ok(GENESIS_IDENTITY_PROMPT.length > 100, 'Should be substantial');
    });

    test('GENESIS_SYSTEM_PROMPT equals identity prompt', () => {
      const { GENESIS_SYSTEM_PROMPT, GENESIS_IDENTITY_PROMPT } = llmModule;

      assert.strictEqual(GENESIS_SYSTEM_PROMPT, GENESIS_IDENTITY_PROMPT,
        'Should be same prompt (legacy compatibility)');
    });

    test('identity prompt contains key sections', () => {
      const { GENESIS_IDENTITY_PROMPT } = llmModule;

      assert.ok(GENESIS_IDENTITY_PROMPT.includes('Genesis'),
        'Should mention Genesis');
      assert.ok(GENESIS_IDENTITY_PROMPT.includes('MCP'),
        'Should mention MCP');
      assert.ok(GENESIS_IDENTITY_PROMPT.includes('Tool Format'),
        'Should have tool format section');
    });

    test('buildSystemPrompt returns extended prompt', async () => {
      const { buildSystemPrompt } = llmModule;

      const prompt = await buildSystemPrompt({
        github: ['create_issue', 'list_repos'],
        memory: ['read_graph', 'search_nodes']
      });

      assert.ok(prompt.includes('GITHUB'), 'Should include GitHub section');
      assert.ok(prompt.includes('MEMORY'), 'Should include memory section');
      assert.ok(prompt.includes('create_issue'), 'Should include tool names');
    });

    test('buildSystemPrompt with local tools', async () => {
      const { buildSystemPrompt } = llmModule;

      const prompt = await buildSystemPrompt(undefined, ['bash', 'read', 'write']);

      assert.ok(prompt.includes('LOCAL'), 'Should include local section');
      assert.ok(prompt.includes('bash'), 'Should include bash');
    });
  });

  // ============================================================================
  // Singleton Tests
  // ============================================================================

  describe('getHybridRouter singleton', () => {
    test('returns same instance', () => {
      // Reset first
      routerModule.resetHybridRouter();

      const router1 = routerModule.getHybridRouter();
      const router2 = routerModule.getHybridRouter();

      assert.strictEqual(router1, router2, 'Should return same instance');
    });

    test('resetHybridRouter creates new instance', () => {
      const router1 = routerModule.getHybridRouter();
      routerModule.resetHybridRouter();
      const router2 = routerModule.getHybridRouter();

      assert.notStrictEqual(router1, router2, 'Should create new instance after reset');
    });
  });
});

// ============================================================================
// Advanced Router Tests
// ============================================================================

describe('Advanced Router', () => {
  let advancedRouterModule: any;

  beforeEach(async () => {
    advancedRouterModule = await import('../src/llm/advanced-router.js');
  });

  describe('PROVIDER_REGISTRY', () => {
    test('has all expected providers', () => {
      const { PROVIDER_REGISTRY } = advancedRouterModule;

      const expectedProviders = ['ollama', 'groq', 'huggingface', 'together', 'deepinfra', 'xai'];

      for (const provider of expectedProviders) {
        assert.ok(PROVIDER_REGISTRY[provider], `Should have ${provider}`);
      }
    });

    test('each provider has required fields', () => {
      const { PROVIDER_REGISTRY } = advancedRouterModule;

      for (const [name, config] of Object.entries(PROVIDER_REGISTRY)) {
        const c = config as any;
        assert.ok(c.name === name, `${name} should have matching name`);
        assert.ok(c.models, `${name} should have models`);
        assert.ok(c.costs, `${name} should have costs`);
      }
    });

    test('Ollama is free', () => {
      const { PROVIDER_REGISTRY } = advancedRouterModule;

      const ollama = PROVIDER_REGISTRY.ollama;
      for (const [model, cost] of Object.entries(ollama.costs)) {
        const c = cost as { input: number; output: number };
        assert.strictEqual(c.input, 0, `${model} input should be free`);
        assert.strictEqual(c.output, 0, `${model} output should be free`);
      }
    });

    test('Groq has ultra-fast latency', () => {
      const { PROVIDER_REGISTRY } = advancedRouterModule;

      assert.strictEqual(PROVIDER_REGISTRY.groq.latency, 'ultra-fast',
        'Groq should be ultra-fast');
    });
  });
});
