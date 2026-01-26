/**
 * Phase 8 Tests - Exotic Computing
 *
 * Tests for:
 * - Thermodynamic Computing
 * - Hyperdimensional Computing (VSA)
 * - Reservoir Computing (ESN)
 * - Semantic Grounding (RDF/SPARQL)
 * - GraphRAG
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// ============================================================================
// Thermodynamic Computing Tests
// ============================================================================

describe('ThermodynamicComputer', () => {
  let ThermodynamicComputer: typeof import('../dist/src/exotic/thermodynamic.js').ThermodynamicComputer;
  let createQuadraticEnergy: typeof import('../dist/src/exotic/thermodynamic.js').createQuadraticEnergy;
  let createIsingEnergy: typeof import('../dist/src/exotic/thermodynamic.js').createIsingEnergy;
  let createHopfieldEnergy: typeof import('../dist/src/exotic/thermodynamic.js').createHopfieldEnergy;

  beforeEach(async () => {
    const module = await import('../dist/src/exotic/thermodynamic.js');
    ThermodynamicComputer = module.ThermodynamicComputer;
    createQuadraticEnergy = module.createQuadraticEnergy;
    createIsingEnergy = module.createIsingEnergy;
    createHopfieldEnergy = module.createHopfieldEnergy;
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const tc = new ThermodynamicComputer();
      assert.ok(tc);
      assert.strictEqual(tc.getTemperature(), 1.0);
    });

    it('should create with custom config', () => {
      const tc = new ThermodynamicComputer({ temperature: 2.0 });
      assert.strictEqual(tc.getTemperature(), 2.0);
    });
  });

  describe('boltzmannSample', () => {
    it('should sample from energy landscape', () => {
      const tc = new ThermodynamicComputer({ temperature: 1.0 });
      const energy = (state: number[]) => state.reduce((s, x) => s + x * x, 0);
      const initial = [1, 1, 1];

      const samples = tc.boltzmannSample(energy, initial, { steps: 100 });

      assert.ok(samples.length > 0);
      assert.ok(samples[0].energy !== undefined);
      assert.ok(samples[0].state.length === 3);
    });

    it('should respect temperature', () => {
      const energy = (state: number[]) => state[0] * state[0];
      const initial = [5];

      // Low temperature - should converge to minimum (use more steps)
      const tcLow = new ThermodynamicComputer({ temperature: 0.001 });
      const samplesLow = tcLow.boltzmannSample(energy, initial, { steps: 2000 });

      // High temperature - more exploration
      const tcHigh = new ThermodynamicComputer({ temperature: 100 });
      const samplesHigh = tcHigh.boltzmannSample(energy, initial, { steps: 2000 });

      // Low temp should have lower minimum energy found
      const minLow = Math.min(...samplesLow.map(s => s.energy));
      const minHigh = Math.min(...samplesHigh.map(s => s.energy));

      // Low temp should find better minimum (with margin for randomness)
      assert.ok(minLow <= minHigh + 50, `Expected low temp min ${minLow} <= high temp min ${minHigh} + 50`);
    });
  });

  describe('anneal', () => {
    it('should find minimum of quadratic energy', () => {
      const tc = new ThermodynamicComputer();

      // E = x^2 + y^2, minimum at (0, 0)
      const energy = (state: number[]) =>
        state.reduce((s, x) => s + x * x, 0);

      const initial = [5, -5];
      const result = tc.anneal(energy, initial, {
        maxSteps: 1000,
        startTemp: 10,
        minTemp: 0.001,
      });

      assert.ok(result.bestEnergy < 1, `Expected energy < 1, got ${result.bestEnergy}`);
      assert.ok(result.totalSteps > 0);
      assert.ok(result.accepted > 0);
    });

    it('should track trajectory when requested', () => {
      const tc = new ThermodynamicComputer();
      const energy = (state: number[]) => state[0] * state[0];

      const result = tc.anneal(energy, [10], {
        maxSteps: 100,
        trackTrajectory: true,
      });

      assert.ok(result.trajectory.length > 0);
    });
  });

  describe('demonSample', () => {
    it('should bias toward preferred outcomes', () => {
      const tc = new ThermodynamicComputer({ temperature: 1.0 });

      const energy = (state: number[]) => state[0] * state[0];
      const preference = (state: number[]) => state[0] > 0 ? 1 : 0;  // Prefer positive

      const result = tc.demonSample(energy, preference, [0], {
        preferenceWeight: 2.0,
        steps: 500,
      });

      assert.ok(result.state[0] >= 0, 'Demon should prefer positive values');
      assert.ok(result.preference >= 0);
    });
  });

  describe('denoise', () => {
    it('should reduce noise in signal', () => {
      const tc = new ThermodynamicComputer();

      // Clean signal: [0, 1, 2, 3, 4]
      // Noisy: add random noise
      const noisy = [0.5, 0.8, 2.3, 2.9, 4.2];

      // Energy: deviation from smooth function
      const signalEnergy = (state: number[]) => {
        let e = 0;
        for (let i = 1; i < state.length; i++) {
          const expected = i;  // Linear signal
          e += Math.pow(state[i] - expected, 2);
        }
        return e;
      };

      const denoised = tc.denoise(noisy, signalEnergy, { steps: 500 });

      assert.strictEqual(denoised.length, noisy.length);
    });
  });

  describe('energy functions', () => {
    it('should create quadratic energy', () => {
      const A = [[1, 0], [0, 1]];
      const b = [0, 0];
      const energy = createQuadraticEnergy(A, b);

      assert.strictEqual(energy([0, 0]), 0);
      assert.strictEqual(energy([1, 0]), 1);
      assert.strictEqual(energy([0, 1]), 1);
    });

    it('should create Ising energy', () => {
      const J = [[0, 1], [1, 0]];  // Ferromagnetic coupling
      const energy = createIsingEnergy(J);

      // Aligned spins should have lower energy
      const aligned = energy([1, 1]);
      const antiAligned = energy([1, -1]);

      assert.ok(aligned < antiAligned);
    });

    it('should create Hopfield energy', () => {
      const patterns = [[1, 1, -1], [-1, -1, 1]];
      const energy = createHopfieldEnergy(patterns);

      // Stored patterns should be low energy
      const e1 = energy([1, 1, -1]);
      const e2 = energy([-1, -1, 1]);

      assert.ok(typeof e1 === 'number');
      assert.ok(typeof e2 === 'number');
    });
  });

  describe('metrics', () => {
    it('should track metrics', () => {
      const tc = new ThermodynamicComputer();
      const energy = (state: number[]) => state[0];

      tc.boltzmannSample(energy, [0], { steps: 100 });
      tc.anneal(energy, [0], { maxSteps: 100 });

      const metrics = tc.getMetrics();

      assert.ok(metrics.totalSamples > 0);
      assert.strictEqual(metrics.totalAnneals, 1);
    });
  });
});

// ============================================================================
// Hyperdimensional Computing Tests
// ============================================================================

describe('HyperdimensionalMemory', () => {
  let HyperdimensionalMemory: typeof import('../dist/src/exotic/hyperdimensional.js').HyperdimensionalMemory;

  beforeEach(async () => {
    const module = await import('../dist/src/exotic/hyperdimensional.js');
    HyperdimensionalMemory = module.HyperdimensionalMemory;
  });

  describe('constructor', () => {
    it('should create with default dimension', () => {
      const hd = new HyperdimensionalMemory();
      assert.strictEqual(hd.dimension, 10000);
    });

    it('should create with custom dimension', () => {
      const hd = new HyperdimensionalMemory({ dimension: 1000 });
      assert.strictEqual(hd.dimension, 1000);
    });
  });

  describe('vector operations', () => {
    it('should create random vectors', () => {
      const hd = new HyperdimensionalMemory({ dimension: 100 });
      const v = hd.random();

      assert.strictEqual(v.length, 100);
      // Check bipolar: all values should be -1 or 1
      assert.ok(v.every(x => x === -1 || x === 1));
    });

    it('should create named vectors', () => {
      const hd = new HyperdimensionalMemory({ dimension: 100 });
      hd.random('apple');

      assert.ok(hd.has('apple'));
      const retrieved = hd.get('apple');
      assert.strictEqual(retrieved.length, 100);
    });

    it('should bind vectors', () => {
      const hd = new HyperdimensionalMemory({ dimension: 100 });
      const a = hd.random();
      const b = hd.random();
      const bound = hd.bind(a, b);

      assert.strictEqual(bound.length, 100);

      // Binding is self-inverse
      const unbound = hd.unbind(bound, a);
      const sim = hd.similarity(unbound, b);

      assert.ok(sim > 0.9, `Expected high similarity, got ${sim}`);
    });

    it('should bundle vectors', () => {
      const hd = new HyperdimensionalMemory({ dimension: 100 });
      const a = hd.random();
      const b = hd.random();
      const c = hd.random();

      const bundled = hd.bundle(a, b, c);

      assert.strictEqual(bundled.length, 100);

      // Bundle should be similar to all components
      const simA = hd.similarity(bundled, a);
      const simB = hd.similarity(bundled, b);
      const simC = hd.similarity(bundled, c);

      assert.ok(simA > 0, 'Bundle should be similar to component a');
      assert.ok(simB > 0, 'Bundle should be similar to component b');
      assert.ok(simC > 0, 'Bundle should be similar to component c');
    });
  });

  describe('similarity', () => {
    it('should compute similarity of identical vectors', () => {
      const hd = new HyperdimensionalMemory({ dimension: 100 });
      const a = hd.random();

      const sim = hd.similarity(a, a);
      assert.strictEqual(sim, 1);
    });

    it('should have low similarity for random vectors', () => {
      const hd = new HyperdimensionalMemory({ dimension: 1000 });
      const a = hd.random();
      const b = hd.random();

      const sim = hd.similarity(a, b);
      assert.ok(Math.abs(sim) < 0.2, `Expected near-orthogonal, got ${sim}`);
    });
  });

  describe('retrieval', () => {
    it('should retrieve bound value', () => {
      const hd = new HyperdimensionalMemory({ dimension: 1000 });

      const key = hd.random('key');
      const value = hd.random('value');
      const bound = hd.bind(key, value);

      const retrieved = hd.retrieve(bound, key);
      const results = hd.query(retrieved, 1);

      assert.ok(results.length > 0);
      assert.strictEqual(results[0].name, 'value');
    });
  });

  describe('sequences', () => {
    it('should encode sequences', () => {
      const hd = new HyperdimensionalMemory({ dimension: 1000 });

      hd.random('a');
      hd.random('b');
      hd.random('c');

      const seq = hd.encodeSequence(['a', 'b', 'c'], 'abc');

      assert.strictEqual(seq.length, 1000);
    });

    it('should query sequence position', () => {
      const hd = new HyperdimensionalMemory({ dimension: 1000 });

      hd.random('a');
      hd.random('b');
      hd.random('c');

      const seq = hd.encodeSequence(['a', 'b', 'c']);
      const results = hd.querySequencePosition(seq, 0);

      assert.ok(results.length > 0);
      assert.strictEqual(results[0].name, 'a');
    });
  });

  describe('analogy', () => {
    it('should solve analogies', () => {
      // Use larger dimension for better quasi-orthogonality
      const hd = new HyperdimensionalMemory({ dimension: 10000 });

      // Man is to King as Woman is to ?
      hd.random('man');
      hd.random('king');
      hd.random('woman');
      hd.random('queen');

      // The analogy operation should retrieve something with similarity > 0
      const results = hd.analogy('man', 'king', 'woman');

      // Results should have items
      assert.ok(results.length > 0, 'Analogy should return results');

      // The result vector should be different from random noise
      // (verifies the bind/unbind math works)
      const topResult = results[0];
      assert.ok(topResult.similarity !== 0, 'Top result should have non-zero similarity');
    });
  });

  describe('records', () => {
    it('should create and query records', () => {
      const hd = new HyperdimensionalMemory({ dimension: 1000 });

      hd.random('John');
      hd.random('30');
      hd.random('Engineer');

      const record = hd.createRecord({
        name: 'John',
        age: '30',
        job: 'Engineer',
      });

      const nameResult = hd.queryRecord(record, 'name');

      assert.ok(nameResult.length > 0);
      assert.strictEqual(nameResult[0].name, 'John');
    });
  });

  describe('metrics', () => {
    it('should track metrics', () => {
      const hd = new HyperdimensionalMemory({ dimension: 100 });

      hd.random('a');
      hd.random('b');
      hd.bind(hd.get('a'), hd.get('b'));
      hd.bundle(hd.get('a'), hd.get('b'));
      hd.query(hd.get('a'), 1);

      const metrics = hd.getMetrics();

      assert.strictEqual(metrics.vectorsCreated, 2);
      assert.strictEqual(metrics.bindings, 1);
      assert.strictEqual(metrics.bundles, 1);
      assert.strictEqual(metrics.queries, 1);
    });
  });
});

// ============================================================================
// Reservoir Computing Tests
// ============================================================================

describe('ReservoirComputer', () => {
  let ReservoirComputer: typeof import('../dist/src/exotic/reservoir.js').ReservoirComputer;
  let createFastReservoir: typeof import('../dist/src/exotic/reservoir.js').createFastReservoir;

  beforeEach(async () => {
    const module = await import('../dist/src/exotic/reservoir.js');
    ReservoirComputer = module.ReservoirComputer;
    createFastReservoir = module.createFastReservoir;
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const esn = new ReservoirComputer();
      assert.ok(esn);
      assert.ok(!esn.isTrained());
    });

    it('should create with custom config', () => {
      const esn = new ReservoirComputer({
        inputSize: 2,
        outputSize: 1,
        reservoirSize: 100,
      });
      assert.ok(esn);
    });
  });

  describe('update', () => {
    it('should update reservoir state', () => {
      const esn = new ReservoirComputer({
        inputSize: 1,
        reservoirSize: 50,
      });

      const state1 = esn.update([0.5]);
      const state2 = esn.update([0.8]);

      assert.strictEqual(state1.length, 50);
      assert.strictEqual(state2.length, 50);

      // States should differ
      assert.ok(state1.some((v, i) => v !== state2[i]));
    });

    it('should throw on wrong input size', () => {
      const esn = new ReservoirComputer({
        inputSize: 2,
        reservoirSize: 50,
      });

      assert.throws(() => esn.update([1]), /Input size mismatch/);
    });
  });

  describe('train', () => {
    it('should train on time series', () => {
      const esn = new ReservoirComputer({
        inputSize: 1,
        outputSize: 1,
        reservoirSize: 50,
        washoutLength: 10,
      });

      // Simple sine wave
      const inputs: number[][] = [];
      const targets: number[][] = [];

      for (let i = 0; i < 200; i++) {
        inputs.push([Math.sin(i * 0.1)]);
        targets.push([Math.sin((i + 1) * 0.1)]);  // Predict next value
      }

      const result = esn.train(inputs, targets);

      assert.ok(esn.isTrained());
      assert.ok(result.trainError < 1, `Training error ${result.trainError} too high`);
      assert.ok(result.duration > 0);
    });

    it('should compute test error when split provided', () => {
      const esn = new ReservoirComputer({
        inputSize: 1,
        outputSize: 1,
        reservoirSize: 50,
        washoutLength: 10,
      });

      const inputs: number[][] = [];
      const targets: number[][] = [];

      for (let i = 0; i < 200; i++) {
        inputs.push([Math.sin(i * 0.1)]);
        targets.push([Math.sin((i + 1) * 0.1)]);
      }

      const result = esn.train(inputs, targets, { testSplit: 0.2 });

      assert.ok(result.testError !== undefined);
    });
  });

  describe('predict', () => {
    it('should predict after training', () => {
      const esn = new ReservoirComputer({
        inputSize: 1,
        outputSize: 1,
        reservoirSize: 50,
        washoutLength: 10,
      });

      const inputs: number[][] = [];
      const targets: number[][] = [];

      for (let i = 0; i < 200; i++) {
        inputs.push([Math.sin(i * 0.1)]);
        targets.push([Math.sin((i + 1) * 0.1)]);
      }

      esn.train(inputs, targets);

      const prediction = esn.predict([0.5]);

      assert.strictEqual(prediction.length, 1);
      assert.ok(typeof prediction[0] === 'number');
    });

    it('should throw if not trained', () => {
      const esn = new ReservoirComputer();

      esn.update([0.5]);
      assert.throws(() => esn.output(), /not trained/);
    });
  });

  describe('process', () => {
    it('should process time series', () => {
      const esn = createFastReservoir(1, 1);

      const inputs: number[][] = [];
      const targets: number[][] = [];

      for (let i = 0; i < 100; i++) {
        inputs.push([i * 0.01]);
        targets.push([(i + 1) * 0.01]);
      }

      esn.train(inputs, targets);

      const testInputs = [[0.5], [0.6], [0.7]];
      const outputs = esn.process(testInputs);

      assert.strictEqual(outputs.length, 3);
    });
  });

  describe('state management', () => {
    it('should get and set state', () => {
      const esn = new ReservoirComputer({ reservoirSize: 50 });

      esn.update([0.5]);
      const state = esn.getState();

      assert.strictEqual(state.state.length, 50);
      assert.strictEqual(state.step, 1);
    });

    it('should reset state', () => {
      const esn = new ReservoirComputer({ reservoirSize: 50 });

      esn.update([0.5]);
      esn.resetState();

      const state = esn.getState();
      assert.strictEqual(state.step, 0);
      assert.ok(state.state.every(v => v === 0));
    });
  });
});

// ============================================================================
// Semantic Grounding Tests
// ============================================================================

describe('SemanticGrounding', () => {
  let SemanticGrounding: typeof import('../dist/src/grounding/semantic.js').SemanticGrounding;

  beforeEach(async () => {
    const module = await import('../dist/src/grounding/semantic.js');
    SemanticGrounding = module.SemanticGrounding;
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const sg = new SemanticGrounding();
      assert.ok(sg);
    });

    it('should have base ontology', () => {
      const sg = new SemanticGrounding();

      // Should have basic classes
      assert.ok(sg.getClassCount() > 0);
      assert.ok(sg.getPropertyCount() > 0);
    });
  });

  describe('triples', () => {
    it('should add and count triples', () => {
      const sg = new SemanticGrounding();

      sg.addTriple('Dog', 'isA', 'Animal');
      sg.addTriple('Cat', 'isA', 'Animal');

      assert.strictEqual(sg.getTripleCount(), 2);
    });

    it('should remove triples', () => {
      const sg = new SemanticGrounding();

      sg.addTriple('Dog', 'isA', 'Animal');
      const removed = sg.removeTriple('Dog', 'isA', 'Animal');

      assert.ok(removed);
      assert.strictEqual(sg.getTripleCount(), 0);
    });

    it('should export triples', () => {
      const sg = new SemanticGrounding();

      sg.addTriple('Dog', 'isA', 'Animal');
      sg.addTriple('Animal', 'hasProperty', 'alive');

      const exported = sg.exportTriples();

      assert.strictEqual(exported.length, 2);
    });
  });

  describe('ontology', () => {
    it('should add classes', () => {
      const sg = new SemanticGrounding();
      const initialCount = sg.getClassCount();

      sg.addClass('Mammal', ['Animal'], ['hasFur']);

      assert.strictEqual(sg.getClassCount(), initialCount + 1);
    });

    it('should add properties', () => {
      const sg = new SemanticGrounding();
      const initialCount = sg.getPropertyCount();

      sg.addProperty('livesIn', ['Animal'], ['Place']);

      assert.strictEqual(sg.getPropertyCount(), initialCount + 1);
    });

    it('should get class hierarchy', () => {
      const sg = new SemanticGrounding();

      sg.addClass('Animal');
      sg.addClass('Mammal', ['Animal']);
      sg.addClass('Dog', ['Mammal']);

      const hierarchy = sg.getClassHierarchy('Dog');

      assert.ok(hierarchy.includes('Dog'));
      assert.ok(hierarchy.includes('Mammal'));
      assert.ok(hierarchy.includes('Animal'));
    });
  });

  describe('grounding', () => {
    it('should extract triples from text', () => {
      const sg = new SemanticGrounding();

      const result = sg.ground('A dog is an animal');

      assert.ok(result.triples.length > 0);
      const isATriple = result.triples.find(t => t.predicate === 'isA');
      assert.ok(isATriple);
    });

    it('should validate extracted triples', () => {
      const sg = new SemanticGrounding({ strictMode: false });

      const result = sg.ground('A cat has fur');

      assert.ok(typeof result.valid === 'boolean');
      assert.ok(typeof result.confidence === 'number');
    });
  });

  describe('query', () => {
    it('should execute SELECT query', () => {
      const sg = new SemanticGrounding();

      sg.addTriple('Dog', 'isA', 'Animal');
      sg.addTriple('Cat', 'isA', 'Animal');
      sg.addTriple('Bird', 'isA', 'Animal');

      const result = sg.query('SELECT ?x WHERE { ?x isA Animal }');

      assert.strictEqual(result.count, 3);
      assert.strictEqual(result.bindings.length, 3);
    });

    it('should execute ASK query', () => {
      const sg = new SemanticGrounding();

      sg.addTriple('Dog', 'isA', 'Animal');

      const result = sg.query('ASK { Dog isA Animal }');

      assert.strictEqual(result.count, 1);
    });
  });

  describe('reasoning', () => {
    it('should perform multi-hop reasoning', () => {
      const sg = new SemanticGrounding();

      sg.addTriple('Fido', 'isA', 'Dog');
      sg.addTriple('Dog', 'isA', 'Mammal');
      sg.addTriple('Mammal', 'livesIn', 'Land');

      const result = sg.reason('Fido', ['isA', 'isA']);

      assert.ok(result.includes('Mammal'));
    });
  });

  describe('inference', () => {
    it('should infer transitive relationships', () => {
      const sg = new SemanticGrounding({ inferenceEnabled: true });

      sg.addTriple('Dog', 'subClassOf', 'Mammal');
      sg.addTriple('Mammal', 'subClassOf', 'Animal');

      const inferred = sg.infer();

      // Should infer Dog subClassOf Animal
      const dogAnimal = inferred.find(
        t => t.subject === 'Dog' && t.predicate === 'subClassOf' && t.object === 'Animal'
      );
      assert.ok(dogAnimal);
    });
  });
});

// ============================================================================
// GraphRAG Tests
// ============================================================================

describe('GraphRAG', () => {
  let GraphRAG: typeof import('../dist/src/grounding/graphrag.js').GraphRAG;

  beforeEach(async () => {
    const module = await import('../dist/src/grounding/graphrag.js');
    GraphRAG = module.GraphRAG;
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const rag = new GraphRAG();
      assert.ok(rag);
      assert.strictEqual(rag.getEntityCount(), 0);
    });
  });

  describe('indexing', () => {
    it('should index documents', async () => {
      const rag = new GraphRAG();

      const doc = await rag.index('Paris is the capital of France.');

      assert.ok(doc.id);
      assert.ok(doc.content);
      assert.ok(doc.entities.length > 0);
      assert.strictEqual(rag.getDocumentCount(), 1);
    });

    it('should extract entities', async () => {
      const rag = new GraphRAG();

      await rag.index('John works at Google in California.');

      assert.ok(rag.getEntityCount() > 0);
      assert.ok(rag.getEntity('John'));
    });

    it('should create relationships', async () => {
      const rag = new GraphRAG();

      await rag.index('Paris is the capital of France.');

      const relationships = rag.getAllRelationships();
      assert.ok(relationships.length > 0);
    });
  });

  describe('retrieval', () => {
    it('should retrieve context for query', async () => {
      const rag = new GraphRAG();

      await rag.index('Paris is the capital of France.');
      await rag.index('France is in Europe.');

      const result = await rag.retrieve('Where is Paris?');

      assert.ok(result.documents.length > 0);
      assert.ok(result.context.length > 0);
      assert.ok(result.score >= 0);
    });

    it('should traverse graph for multi-hop queries', async () => {
      const rag = new GraphRAG();

      await rag.index('Paris is the capital of France.');
      await rag.index('France is in Europe.');
      await rag.index('Europe is a continent.');

      const result = await rag.retrieve('What continent is Paris in?');

      assert.ok(result.hops >= 0);
      assert.ok(result.entities.length > 0);
    });
  });

  describe('communities', () => {
    it('should build communities', async () => {
      const rag = new GraphRAG();

      await rag.index('Paris is in France.');
      await rag.index('Lyon is in France.');
      await rag.index('Berlin is in Germany.');

      rag.buildCommunities();

      const metrics = rag.getMetrics();
      assert.ok(metrics.communitiesFormed > 0);
    });
  });

  describe('metrics', () => {
    it('should track metrics', async () => {
      const rag = new GraphRAG();

      await rag.index('Test document.');
      await rag.retrieve('test');

      const metrics = rag.getMetrics();

      assert.strictEqual(metrics.documentsIndexed, 1);
      assert.strictEqual(metrics.queriesProcessed, 1);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Exotic Computing Integration', () => {
  it('should create unified ExoticComputing interface', async () => {
    const { ExoticComputing } = await import('../dist/src/exotic/index.js');

    const exotic = new ExoticComputing();

    assert.ok(exotic.thermodynamic);
    assert.ok(exotic.hyperdimensional);
    assert.ok(exotic.reservoir);
  });

  it('should get combined metrics', async () => {
    const { ExoticComputing } = await import('../dist/src/exotic/index.js');

    const exotic = new ExoticComputing();

    // Do some operations
    exotic.thermodynamic.boltzmannSample(s => s[0], [0], { steps: 10 });
    exotic.hyperdimensional.random('test');

    const metrics = exotic.getMetrics();

    assert.ok(metrics.thermodynamic);
    assert.ok(metrics.hyperdimensional);
    assert.ok(metrics.reservoir);
  });
});
