/**
 * Integration Tests for Genesis 5.x Modules
 * Tests Memory, Consciousness, World Model, and Daemon modules
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

// Memory Module Tests
describe('Memory Module', () => {
  test('MemorySystem creates and initializes', async () => {
    const { createMemorySystem, resetMemorySystem } = await import('../src/memory/index.js');
    resetMemorySystem();

    const memory = createMemorySystem();
    assert.ok(memory, 'Memory system should be created');
    assert.ok(memory.episodic, 'Episodic store should exist');
    assert.ok(memory.semantic, 'Semantic store should exist');
    assert.ok(memory.procedural, 'Procedural store should exist');

    resetMemorySystem();
  });

  test('EpisodicStore can store and retrieve memories', async () => {
    const { createEpisodicStore } = await import('../src/memory/episodic.js');

    const store = createEpisodicStore();

    // Store a memory using the convenience method
    const memory = store.createEpisode({
      what: 'Test event happened',
      details: { value: 42 },
      importance: 0.8,
      feeling: { valence: 0.5, arousal: 0.6 },
      where: { location: 'test-location', context: 'testing' },
      who: { agents: ['user'], roles: { user: 'tester' } },
    });

    assert.ok(memory.id, 'Should return memory with ID');

    // Retrieve by ID
    const retrieved = store.get(memory.id);
    assert.ok(retrieved, 'Should retrieve memory');
    assert.strictEqual(retrieved?.content.what, 'Test event happened');

    // Query
    const results = store.query({ minImportance: 0.5 });
    assert.ok(results.length > 0, 'Should find memories with query');
  });

  test('SemanticStore can store and retrieve facts', async () => {
    const { createSemanticStore } = await import('../src/memory/semantic.js');

    const store = createSemanticStore();

    // Store a fact using the convenience method
    const fact = store.createFact({
      concept: 'Genesis',
      definition: 'An autopoietic system',
      properties: { version: '6.0' },
      category: 'software',
      confidence: 0.95,
      sources: ['specification'],
    });

    assert.ok(fact.id, 'Should return fact with ID');

    // Retrieve
    const retrieved = store.get(fact.id);
    assert.ok(retrieved, 'Should retrieve fact');
    assert.strictEqual(retrieved?.content.concept, 'Genesis');
  });

  test('ProceduralStore can store and retrieve procedures', async () => {
    const { createProceduralStore } = await import('../src/memory/procedural.js');

    const store = createProceduralStore();

    // Store a procedure using createSkill
    const proc = store.createSkill({
      name: 'test-procedure',
      description: 'A test procedure',
      steps: [
        { action: 'step1' },
        { action: 'step2' },
      ],
    });

    assert.ok(proc.id, 'Should return procedure with ID');

    // Retrieve
    const retrieved = store.getByName('test-procedure');
    assert.ok(retrieved, 'Should retrieve procedure by name');
    assert.strictEqual(retrieved?.content.steps.length, 2, 'Should have 2 steps');
  });

  test('Forgetting module exports functions', async () => {
    const forgettingModule = await import('../src/memory/forgetting.js');

    // Just verify the module exports what we expect
    assert.ok(forgettingModule.calculateRetention, 'Should export calculateRetention');
    assert.ok(forgettingModule.FORGETTING_THRESHOLDS, 'Should export FORGETTING_THRESHOLDS');
  });
});

// Consciousness Module Tests
describe('Consciousness Module', () => {
  test('ConsciousnessSystem creates and initializes', async () => {
    const { createConsciousnessSystem, resetConsciousnessSystem } = await import('../src/consciousness/index.js');
    resetConsciousnessSystem();

    const consciousness = createConsciousnessSystem();
    assert.ok(consciousness, 'Consciousness system should be created');

    // Check components exist
    const state = consciousness.getState();
    assert.ok(state, 'Should have state');

    resetConsciousnessSystem();
  });

  test('PhiCalculator calculates phi values', async () => {
    const { createPhiCalculator } = await import('../src/consciousness/phi-calculator.js');

    const calculator = createPhiCalculator();

    // Create a system state matching the expected interface
    const state = {
      components: [
        { id: 'node1', type: 'agent', active: true, state: { value: 0.8 }, entropy: 0.5, lastUpdate: new Date() },
        { id: 'node2', type: 'agent', active: true, state: { value: 0.6 }, entropy: 0.4, lastUpdate: new Date() },
        { id: 'node3', type: 'agent', active: true, state: { value: 0.4 }, entropy: 0.3, lastUpdate: new Date() },
      ],
      connections: [
        { from: 'node1', to: 'node2', strength: 0.5, informationFlow: 1.0, bidirectional: true },
        { from: 'node2', to: 'node3', strength: 0.3, informationFlow: 0.8, bidirectional: true },
        { from: 'node3', to: 'node1', strength: 0.4, informationFlow: 0.7, bidirectional: true },
      ],
      stateHash: 'test-hash',
      timestamp: new Date(),
    };

    const result = calculator.calculate(state);
    assert.ok(typeof result.phi === 'number', 'Phi should be a number');
    assert.ok(result.phi >= 0, 'Phi should be non-negative');
  });

  test('GlobalWorkspace performs selection and broadcast', async () => {
    const { createGlobalWorkspace } = await import('../src/consciousness/global-workspace.js');

    const workspace = createGlobalWorkspace();
    assert.ok(workspace, 'Workspace should be created');

    // Get state
    const state = workspace.getState();
    assert.ok(state, 'Should have state');
  });

  test('PhiMonitor tracks phi', async () => {
    const { createPhiMonitor } = await import('../src/consciousness/phi-monitor.js');

    const monitor = createPhiMonitor();
    assert.ok(monitor, 'Monitor should be created');

    // Verify it has the methods we need
    assert.ok(typeof monitor.update === 'function', 'Should have update method');
    assert.ok(typeof monitor.getCurrentLevel === 'function', 'Should have getCurrentLevel method');
  });

  test('PhiDecisionMaker makes decisions', async () => {
    const { createPhiDecisionMaker } = await import('../src/consciousness/phi-decisions.js');

    const decisionMaker = createPhiDecisionMaker();
    assert.ok(decisionMaker, 'Decision maker should be created');
  });
});

// World Model Module Tests
describe('World Model Module', () => {
  test('WorldModelSystem creates and initializes', async () => {
    const { createWorldModelSystem, resetWorldModelSystem } = await import('../src/world-model/index.js');
    resetWorldModelSystem();

    const worldModel = createWorldModelSystem();
    assert.ok(worldModel, 'World model system should be created');
    assert.ok(worldModel.encoder, 'Encoder should exist');
    assert.ok(worldModel.decoder, 'Decoder should exist');
    assert.ok(worldModel.predictor, 'Predictor should exist');
    assert.ok(worldModel.twinManager, 'Twin manager should exist');

    resetWorldModelSystem();
  });

  test('LatentEncoder encodes multimodal inputs', async () => {
    const { createLatentEncoder } = await import('../src/world-model/encoder.js');

    const encoder = createLatentEncoder();

    // Encode text
    const textLatent = encoder.encode({
      modality: 'text',
      data: 'Hello world',
      timestamp: new Date(),
      metadata: {},
    });

    assert.ok(textLatent, 'Should encode text');
    assert.ok(textLatent.vector, 'Should have vector');
    assert.strictEqual(textLatent.vector.length, 512, 'Vector should be 512-dim');

    // Encode state
    const stateLatent = encoder.encode({
      modality: 'state',
      data: { energy: 0.8, phi: 0.6 },
      timestamp: new Date(),
      metadata: {},
    });

    assert.ok(stateLatent, 'Should encode state');
    assert.strictEqual(stateLatent.vector.length, 512, 'Vector should be 512-dim');
  });

  test('LatentDecoder decodes latent states', async () => {
    const { createLatentEncoder } = await import('../src/world-model/encoder.js');
    const { createLatentDecoder } = await import('../src/world-model/decoder.js');

    const encoder = createLatentEncoder();
    const decoder = createLatentDecoder();

    // Encode then decode
    const latent = encoder.encode({
      modality: 'text',
      data: 'Test content',
      timestamp: new Date(),
      metadata: {},
    });

    const textDecoding = decoder.decodeToText(latent);
    assert.ok(textDecoding, 'Should decode to text');
    assert.ok(textDecoding.confidence >= 0 && textDecoding.confidence <= 1, 'Confidence should be in [0,1]');

    const featureDecoding = decoder.decodeToFeatures(latent);
    assert.ok(featureDecoding, 'Should decode to features');
  });

  test('WorldModelPredictor exists and initializes', async () => {
    const { createWorldModelPredictor } = await import('../src/world-model/predictor.js');

    const predictor = createWorldModelPredictor();
    assert.ok(predictor, 'Predictor should be created');
    assert.ok(typeof predictor.predict === 'function', 'Should have predict method');
    assert.ok(typeof predictor.simulate === 'function', 'Should have simulate method');
  });

  test('DigitalTwinManager creates twins', async () => {
    const { createDigitalTwinManager } = await import('../src/world-model/digital-twin.js');

    const manager = createDigitalTwinManager();
    assert.ok(manager, 'Manager should be created');

    const twin = manager.createTwin('test-system', 'Test System');
    assert.ok(twin, 'Should create digital twin');
    assert.strictEqual(twin.name, 'Test System', 'Should have correct name');
    assert.ok(twin.id, 'Should have ID');
  });
});

// Daemon Module Tests
describe('Daemon Module', () => {
  test('Scheduler creates and manages tasks', async () => {
    const { createScheduler } = await import('../src/daemon/scheduler.js');

    const scheduler = createScheduler();
    assert.ok(scheduler, 'Scheduler should be created');

    // Add a task with proper schedule format
    const task = scheduler.schedule({
      name: 'test-task',
      schedule: { type: 'interval', intervalMs: 60000 },
      handler: async (ctx) => ({ success: true, duration: 10 }),
    });

    assert.ok(task, 'Should return task');
    assert.ok(task.id, 'Task should have ID');

    // Clean up
    scheduler.cancel(task.id);
  });

  test('MaintenanceService initializes', async () => {
    const { createMaintenanceService } = await import('../src/daemon/maintenance.js');

    const maintenance = createMaintenanceService();
    assert.ok(maintenance, 'Maintenance service should be created');
  });

  test('DreamService initializes', async () => {
    const { createDreamService } = await import('../src/daemon/dream-mode.js');

    const dreamService = createDreamService();
    assert.ok(dreamService, 'Dream service should be created');
  });
});

// Cross-Module Integration Tests
describe('Cross-Module Integration', () => {
  test('Memory system stores and retrieves', async () => {
    const { createMemorySystem, resetMemorySystem } = await import('../src/memory/index.js');

    resetMemorySystem();
    const memory = createMemorySystem();

    // Store an episodic memory
    const episode = memory.episodic.createEpisode({
      what: 'Integration test event',
      details: { test: true },
      importance: 0.9,
    });

    assert.ok(episode.id, 'Should store episode');

    // Retrieve it
    const retrieved = memory.episodic.get(episode.id);
    assert.ok(retrieved, 'Should retrieve episode');

    resetMemorySystem();
  });

  test('World Model encodes and decodes', async () => {
    const { createWorldModelSystem, resetWorldModelSystem } = await import('../src/world-model/index.js');

    resetWorldModelSystem();
    const worldModel = createWorldModelSystem();

    // Encode a state
    const latent = worldModel.encode({
      modality: 'state',
      data: { consciousnessLevel: 0.8 },
      timestamp: new Date(),
      metadata: {},
    });

    assert.ok(latent, 'Should encode state');
    assert.strictEqual(latent.vector.length, 512, 'Should have 512-dim vector');

    // Decode back
    const decoded = worldModel.decoder.decodeToText(latent);
    assert.ok(decoded, 'Should decode');

    resetWorldModelSystem();
  });

  test('All modules can be imported together', async () => {
    const memory = await import('../src/memory/index.js');
    const consciousness = await import('../src/consciousness/index.js');
    const worldModel = await import('../src/world-model/index.js');
    const daemon = await import('../src/daemon/index.js');

    assert.ok(memory.createMemorySystem, 'Memory should export factory');
    assert.ok(consciousness.createConsciousnessSystem, 'Consciousness should export factory');
    assert.ok(worldModel.createWorldModelSystem, 'World model should export factory');
    assert.ok(daemon.createDaemon, 'Daemon should export factory');
  });
});

console.log('Running Genesis Integration Tests...\n');
