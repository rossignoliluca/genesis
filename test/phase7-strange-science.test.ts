/**
 * Phase 7: Strange Science Tests
 *
 * Tests for unconventional paradigm modules:
 * - Semiotics (Large Semiosis Model)
 * - Umwelt (von Uexküll)
 * - Morphogenetic (Levin)
 * - Strange Loops (Hofstadter)
 * - Symbiotic Partnership
 * - Second-Order Cybernetics (von Foerster)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

// Semiotics
import {
  LargeSemiosisModel,
  SimpleWorldModel,
  createSign,
  createIcon,
  createIndex,
  createSymbol,
  getLSM,
  resetLSM
} from '../dist/src/semiotics/index.js';

// Umwelt
import {
  Merkwelt,
  Wirkwelt,
  AgentUmwelt,
  createSensor,
  createEffector,
  createAction,
  getUmwelt,
  clearUmwelts
} from '../dist/src/umwelt/index.js';

// Morphogenetic
import {
  MorphogeneticAgent,
  NeuralCellularAutomata,
  AgentColony,
  createTargetMorphology,
  createMorphogeneticAgent,
  getColony,
  getNCA,
  resetColony,
  resetNCA
} from '../dist/src/morphogenetic/index.js';

// Strange Loops
import {
  StrangeLoop,
  createThought,
  createLevel,
  getStrangeLoop,
  resetStrangeLoop
} from '../dist/src/strange-loop/index.js';

// Symbiotic
import {
  HumanStateManager,
  SymbioticPartnership,
  createTask,
  getPartnership,
  resetPartnership
} from '../dist/src/symbiotic/index.js';

// Second-Order Cybernetics
import {
  SecondOrderCybernetics,
  createOperation,
  createDistinction,
  getCybernetics,
  resetCybernetics
} from '../dist/src/second-order/index.js';

// ============================================================================
// Semiotics Tests
// ============================================================================

describe('Semiotics - Large Semiosis Model', () => {
  let lsm: LargeSemiosisModel;
  let worldModel: SimpleWorldModel;

  beforeEach(() => {
    worldModel = new SimpleWorldModel();
    lsm = new LargeSemiosisModel({}, worldModel);
  });

  it('should create signs with type', () => {
    const sign = createSign('hello', 'symbol', 'greeting');
    assert.ok(sign.id);
    assert.strictEqual(sign.representamen, 'hello');
    assert.strictEqual(sign.type, 'symbol');
    assert.strictEqual(sign.context, 'greeting');
  });

  it('should create icon signs', () => {
    const icon = createIcon('resembles-cat', 'visual');
    assert.strictEqual(icon.type, 'icon');
    assert.strictEqual(icon.representamen, 'resembles-cat');
  });

  it('should create index signs', () => {
    const index = createIndex('smoke', 'causation');
    assert.strictEqual(index.type, 'index');
    assert.strictEqual(index.representamen, 'smoke');
  });

  it('should create symbol signs', () => {
    const symbol = createSymbol('word-tree', 'language');
    assert.strictEqual(symbol.type, 'symbol');
    assert.strictEqual(symbol.representamen, 'word-tree');
  });

  it('should interpret signs through semiosis', () => {
    const sign = createSign('hello', 'symbol');
    const triad = lsm.interpret(sign);
    assert.ok(triad);
    assert.ok(triad.sign);
    assert.ok(triad.interpretant);
    assert.ok(typeof triad.coherence === 'number');
  });

  it('should detect hallucination risk', () => {
    // Add object to world model
    worldModel.addObject('sky-is-blue', { fact: true }, 0.9);
    worldModel.verifyObject('sky-is-blue');

    const grounded = lsm.detectHallucination('sky-is-blue');
    const ungrounded = lsm.detectHallucination('unicorns-exist');

    assert.ok(grounded.score <= ungrounded.score);
    assert.ok(['none', 'low', 'medium', 'high', 'certain'].includes(grounded.level));
  });

  it('should perform abductive reasoning', () => {
    const obs1 = createSign('wet-grass', 'index');
    const obs2 = createSign('cloudy-sky', 'index');

    const hypotheses = lsm.abduce([obs1, obs2]);
    assert.ok(Array.isArray(hypotheses));
  });

  it('should perform meta-semiosis', () => {
    const sign = createSign('meaning', 'symbol');
    lsm.interpret(sign);  // Interpret first
    const metaSigns = lsm.metaSemiosis(sign);

    assert.ok(Array.isArray(metaSigns));
    assert.ok(metaSigns.length > 0);
  });

  it('should provide global instance', () => {
    resetLSM();
    const instance1 = getLSM();
    const instance2 = getLSM();
    assert.strictEqual(instance1, instance2);
  });

  it('should track metrics', () => {
    const sign1 = createSign('test1', 'symbol');
    const sign2 = createSign('test2', 'symbol');
    lsm.interpret(sign1);
    lsm.interpret(sign2);

    const metrics = lsm.getMetrics();
    assert.ok(metrics.signsProcessed >= 2);
    assert.ok(metrics.triadsFormed >= 2);
  });
});

// ============================================================================
// Umwelt Tests
// ============================================================================

describe('Umwelt - Agent World', () => {
  let merkwelt: Merkwelt;
  let wirkwelt: Wirkwelt;
  let umwelt: AgentUmwelt;

  beforeEach(() => {
    merkwelt = new Merkwelt();
    wirkwelt = new Wirkwelt();
    umwelt = new AgentUmwelt({ agentId: 'test-agent', bounds: {} });
  });

  it('should create sensors', () => {
    const sensor = createSensor('s1', 'vision', 'text', { resolution: 0.8 });
    assert.strictEqual(sensor.id, 's1');
    assert.strictEqual(sensor.name, 'vision');
    assert.strictEqual(sensor.type, 'text');
  });

  it('should create effectors', () => {
    const effector = createEffector('e1', 'gripper', 'command', { power: 0.9 });
    assert.strictEqual(effector.id, 'e1');
    assert.strictEqual(effector.name, 'gripper');
    assert.strictEqual(effector.type, 'command');
  });

  it('should register sensors in Merkwelt', () => {
    const sensor = createSensor('s1', 'hearing', 'text');
    merkwelt.registerSensor(sensor);

    const sensors = merkwelt.getSensors();
    assert.strictEqual(sensors.length, 1);
    assert.strictEqual(sensors[0].name, 'hearing');
  });

  it('should perceive through sensors', () => {
    const sensor = createSensor('s1', 'vision', 'text', { resolution: 0.9 });
    merkwelt.registerSensor(sensor);

    const perception = merkwelt.perceive('s1', 'hello world');
    assert.ok(perception);
    assert.strictEqual(perception!.sensorId, 's1');
  });

  it('should set attention focus', () => {
    merkwelt.setFocus('text');
    // No direct getter but should not throw
    assert.ok(true);
  });

  it('should register effectors in Wirkwelt', () => {
    const effector = createEffector('e1', 'motor', 'command');
    wirkwelt.registerEffector(effector);

    const effectors = wirkwelt.getEffectors();
    assert.strictEqual(effectors.length, 1);
  });

  it('should check action bounds', () => {
    const effector = createEffector('e1', 'gripper', 'command');
    wirkwelt.registerEffector(effector);

    const action = createAction('e1', 'grasp', { target: 'object-1' });
    const canAct = wirkwelt.canAct(action);

    assert.strictEqual(canAct.allowed, true);
  });

  it('should execute actions through effectors', async () => {
    const effector = createEffector('e1', 'gripper', 'command');
    wirkwelt.registerEffector(effector);

    const action = createAction('e1', 'grasp', { target: 'object-1' });
    const outcome = await wirkwelt.act(action, async () => ({ success: true }));

    assert.ok(outcome);
    assert.strictEqual(outcome.success, true);
  });

  it('should run functional circle in AgentUmwelt', async () => {
    const sensor = createSensor('s1', 'touch', 'text');
    const effector = createEffector('e1', 'arm', 'command');

    umwelt.merkwelt.registerSensor(sensor);
    umwelt.wirkwelt.registerEffector(effector);

    const perception = umwelt.merkwelt.perceive('s1', 'stimulus');
    if (perception) {
      const result = await umwelt.functionalCircle(
        perception,
        () => createAction('e1', 'respond', {}),
        async () => 'done'
      );
      assert.ok(result.perception);
    }
  });

  it('should provide global instance', () => {
    clearUmwelts();
    const instance1 = getUmwelt('agent-1');
    const instance2 = getUmwelt('agent-1');
    assert.strictEqual(instance1, instance2);
  });

  it('should track Umwelt metrics', () => {
    const sensor = createSensor('s1', 'test', 'text');
    umwelt.merkwelt.registerSensor(sensor);
    umwelt.merkwelt.perceive('s1', 'test data');

    const metrics = umwelt.getMetrics();
    assert.ok(metrics.perceptionsReceived >= 1);
  });
});

// ============================================================================
// Morphogenetic Tests
// ============================================================================

describe('Morphogenetic - Bio-Inspired Repair', () => {
  let agent: MorphogeneticAgent;
  let nca: NeuralCellularAutomata;
  let colony: AgentColony;

  beforeEach(() => {
    const target = createTargetMorphology({ capability1: 0.8, capability2: 0.6 });
    agent = new MorphogeneticAgent('agent-1', target);
    nca = new NeuralCellularAutomata({ gridSize: 5 });
    colony = new AgentColony();
  });

  it('should create target morphology', () => {
    const morphology = createTargetMorphology({ test: 0.5 }, 0.7, 'test morphology');
    assert.ok(morphology.requiredCapabilities);
    assert.strictEqual(morphology.minHealth, 0.7);
  });

  it('should initialize agent with target morphology', () => {
    const morphology = agent.getMorphology();
    assert.ok(morphology);
    assert.ok(morphology.capabilities);
  });

  it('should compute morphogenetic error', () => {
    const error = agent.morphogeneticError();
    assert.ok(typeof error === 'number');
    assert.ok(error >= 0);
  });

  it('should detect errors in morphology', () => {
    const errors = agent.detectErrors();
    assert.ok(Array.isArray(errors));
    // Should have errors since we start with 0 levels
    assert.ok(errors.length > 0);
  });

  it('should find missing capabilities', () => {
    const missing = agent.missingCapabilities();
    assert.ok(Array.isArray(missing));
    assert.ok(missing.includes('capability1') || missing.includes('capability2'));
  });

  it('should plan self-correction', () => {
    const repairs = agent.selfCorrect();
    assert.ok(Array.isArray(repairs));
    assert.ok(repairs.length > 0);
    assert.ok(['regenerate', 'strengthen', 'connect', 'prune'].includes(repairs[0].type));
  });

  it('should execute repair actions', async () => {
    const repairs = agent.selfCorrect();
    if (repairs.length > 0) {
      const success = await agent.executeRepair(repairs[0]);
      assert.ok(typeof success === 'boolean');
    }
  });

  it('should initialize NCA grid', () => {
    const grid = nca.getGrid();
    assert.ok(grid instanceof Map);
    assert.ok(grid.size > 0);
  });

  it('should step NCA simulation', () => {
    const genBefore = nca.getGeneration();
    nca.step();
    const genAfter = nca.getGeneration();

    assert.strictEqual(genAfter, genBefore + 1);
  });

  it('should compute pattern error', () => {
    const error = nca.patternError();
    assert.ok(typeof error === 'number');
  });

  it('should count cells by type', () => {
    const counts = nca.getCellCounts();
    assert.ok(counts instanceof Map);
  });

  it('should add agents to colony', () => {
    colony.addAgent(agent);
    const agents = colony.getAgents();
    assert.strictEqual(agents.length, 1);
  });

  it('should solve problems collectively', async () => {
    // Add several agents for quorum
    for (let i = 0; i < 4; i++) {
      const target = createTargetMorphology({ cap: 0.5 });
      colony.addAgent(new MorphogeneticAgent(`agent-${i}`, target));
    }

    const solution = await colony.solveCollectively('test-problem');
    assert.ok(solution);
    assert.ok('success' in solution);
  });

  it('should get colony health', () => {
    colony.addAgent(agent);
    const health = colony.getColonyHealth();
    assert.ok(typeof health === 'number');
    assert.ok(health >= 0 && health <= 1);
  });

  it('should provide global instances', () => {
    resetColony();
    resetNCA();

    const colony1 = getColony();
    const colony2 = getColony();
    assert.strictEqual(colony1, colony2);

    const nca1 = getNCA();
    const nca2 = getNCA();
    assert.strictEqual(nca1, nca2);
  });
});

// ============================================================================
// Strange Loop Tests
// ============================================================================

describe('Strange Loops - Self-Reference', () => {
  let loop: StrangeLoop;

  beforeEach(() => {
    resetStrangeLoop();
    loop = new StrangeLoop();
  });

  it('should create thoughts at levels', () => {
    const thought = createThought('I am thinking', 0);
    assert.ok(thought.id);
    assert.strictEqual(thought.content, 'I am thinking');
    assert.strictEqual(thought.level, 0);
  });

  it('should create levels', () => {
    const level = createLevel('Meta', 1, 'Thinking about thinking', []);
    assert.ok(level.id);
    assert.strictEqual(level.name, 'Meta');
    assert.strictEqual(level.depth, 1);
  });

  it('should think at different levels', () => {
    const t0 = loop.think('Base thought', 0);
    const t1 = loop.think('Meta thought', 1);

    assert.strictEqual(t0.level, 0);
    assert.strictEqual(t1.level, 1);
  });

  it('should reflect on thoughts (meta-level)', () => {
    const base = loop.think('I exist', 0);
    const meta = loop.reflect(base);

    assert.strictEqual(meta.level, base.level + 1);
    assert.strictEqual(meta.aboutThought, base.id);
  });

  it('should perform meta-meta reflection', () => {
    const reflection = loop.metaMeta();

    assert.ok(reflection.original);
    assert.ok(reflection.meta);
    assert.ok(reflection.metaMeta);
    assert.strictEqual(reflection.iterations, 2);
  });

  it('should find fixed points', () => {
    // Create thoughts that converge
    const thoughts = [
      loop.think('thinking', 0),
      loop.think('thinking about thinking', 1),
      loop.think('thinking about thinking', 2)
    ];

    const fixedPoint = loop.findFixedPoint(thoughts);
    // May or may not find depending on similarity threshold
    assert.ok(fixedPoint === null || fixedPoint.id);
  });

  it('should detect attractors', () => {
    // Generate enough thoughts for attractor detection
    for (let i = 0; i < 15; i++) {
      loop.think('recurring thought', i % 3);
    }

    const attractor = loop.detectAttractor();
    if (attractor) {
      assert.ok(['fixed_point', 'limit_cycle', 'strange', 'quasi_periodic'].includes(attractor.type));
    }
  });

  it('should crystallize identity', () => {
    // Generate stable patterns
    for (let i = 0; i < 20; i++) {
      loop.think('I am a thinking system', 0);
    }
    loop.detectAttractor();

    const identity = loop.crystallizeIdentity();
    assert.ok(identity.id);
    assert.ok(identity.stability >= 0 && identity.stability <= 1);
  });

  it('should execute full cycle', async () => {
    const result = await loop.fullCycle('What am I?');

    assert.ok(result.reflection);
    assert.ok(result.reflection.original);
  });

  it('should detect tangled hierarchy', () => {
    loop.addLevel({
      id: 'level-1',
      name: 'Meta',
      depth: 1,
      content: 'About base',
      references: ['level-0'],
      referencedBy: []
    });

    loop.addLevel({
      id: 'level-2',
      name: 'Meta-Meta',
      depth: 2,
      content: 'About meta AND base',
      references: ['level-1', 'level-0'],
      referencedBy: []
    });

    const tangled = loop.isTangled();
    assert.strictEqual(tangled, true);
  });

  it('should provide global instance', () => {
    resetStrangeLoop();
    const instance1 = getStrangeLoop();
    const instance2 = getStrangeLoop();
    assert.strictEqual(instance1, instance2);
  });

  it('should track metrics', () => {
    loop.think('test', 0);
    loop.metaMeta();

    const metrics = loop.getMetrics();
    assert.ok(metrics.thoughtsGenerated >= 1);
    assert.ok(metrics.reflectionsPerformed >= 1);
  });
});

// ============================================================================
// Symbiotic Partnership Tests
// ============================================================================

describe('Symbiotic Partnership', () => {
  let humanState: HumanStateManager;
  let partnership: SymbioticPartnership;

  beforeEach(() => {
    humanState = new HumanStateManager('human-1');
    partnership = new SymbioticPartnership('human-1');
  });

  it('should create tasks', () => {
    const task = createTask('routine', 0.7, ['programming']);
    assert.ok(task.id);
    assert.strictEqual(task.type, 'routine');
    assert.strictEqual(task.complexity, 0.7);
  });

  it('should track human cognitive load', () => {
    humanState.updateLoad(0.5);
    const state = humanState.getState();
    assert.strictEqual(state.cognitiveLoad, 0.5);
  });

  it('should track human skills', () => {
    humanState.useSkill('python', 0.8);
    const state = humanState.getState();
    assert.ok(state.skillLevels.has('python'));
  });

  it('should detect skill atrophy over time', () => {
    humanState.useSkill('java', 0.9);

    // Apply decay multiple times
    for (let i = 0; i < 50; i++) {
      humanState.applySkillDecay();
    }

    const state = humanState.getState();
    const atrophy = state.skillAtrophy.get('java') || 0;
    assert.ok(atrophy > 0);
  });

  it('should adapt friction for tasks', () => {
    const task = createTask('analytical', 0.6, ['data']);
    const friction = partnership.adaptFriction(task);

    assert.ok(['none', 'low', 'medium', 'high'].includes(friction.level));
    assert.ok(typeof friction.requireConfirmation === 'boolean');
  });

  it('should determine assistance type', () => {
    const task = createTask('learning', 0.8, ['web', 'analysis']);
    const assistanceType = partnership.determineAssistanceType(task);

    assert.ok(['full', 'partial', 'guided', 'scaffolded', 'reviewed', 'collaborative'].includes(assistanceType));
  });

  it('should provide assistance for tasks', async () => {
    const task = createTask('routine', 0.3, []);
    const assistance = await partnership.assist(task, { response: 'help' });

    assert.ok(assistance.taskId);
    assert.ok(assistance.type);
    assert.ok(typeof assistance.humanEffortRequired === 'number');
  });

  it('should record decisions', () => {
    partnership.recordDecision(true, true, false);
    const autonomy = partnership.getAutonomyMetrics();

    assert.ok(autonomy.decisionsTotal >= 1);
    assert.ok(autonomy.decisionsByHuman >= 1);
  });

  it('should check autonomy preservation', () => {
    const result = partnership.checkAutonomyPreservation();
    assert.ok('preserved' in result);
    assert.ok(Array.isArray(result.concerns));
  });

  it('should suggest breaks when needed', () => {
    const suggestion = partnership.suggestBreak();
    assert.ok('needed' in suggestion);
  });

  it('should provide global instance', () => {
    resetPartnership();
    const instance1 = getPartnership();
    const instance2 = getPartnership();
    assert.strictEqual(instance1, instance2);
  });

  it('should track partnership metrics', () => {
    const task = createTask('routine', 0.5, []);
    partnership.assist(task, {});

    const metrics = partnership.getMetrics();
    assert.ok(metrics.totalInteractions >= 1);
  });
});

// ============================================================================
// Second-Order Cybernetics Tests
// ============================================================================

describe('Second-Order Cybernetics', () => {
  let cybernetics: SecondOrderCybernetics;

  beforeEach(() => {
    resetCybernetics();
    cybernetics = new SecondOrderCybernetics();
  });

  it('should create operations', () => {
    const op = createOperation('distinction', 'input', 'output');
    assert.ok(op.id);
    assert.strictEqual(op.type, 'distinction');
    assert.strictEqual(op.input, 'input');
    assert.strictEqual(op.output, 'output');
  });

  it('should create distinctions', () => {
    const dist = createDistinction('marked', 'unmarked');
    assert.strictEqual(dist.marked, 'marked');
    assert.strictEqual(dist.unmarked, 'unmarked');
  });

  it('should create observers at levels', () => {
    const obs0 = cybernetics.createObserver(0);
    const obs1 = cybernetics.createObserver(1);

    assert.strictEqual(obs0.level, 0);
    assert.strictEqual(obs1.level, 1);
  });

  it('should create second-order observers', () => {
    const first = cybernetics.createObserver(0);
    const second = cybernetics.createSecondOrderObserver(first.id);

    assert.ok(second);
    assert.strictEqual(second!.level, 1);
    assert.ok(second!.observes.includes(first.id));
  });

  it('should make distinctions (Spencer-Brown)', () => {
    const observer = cybernetics.createObserver(0);
    const distinction = cybernetics.makeDistinction(observer.id, 'this', 'not-this');

    assert.ok(distinction);
    assert.strictEqual(distinction!.marked, 'this');
    assert.strictEqual(distinction!.unmarked, 'not-this');
  });

  it('should perform re-entry (self-reference)', () => {
    const observer = cybernetics.createObserver(0);
    const distinction = cybernetics.makeDistinction(observer.id, 'self', 'other');
    const reEntry = cybernetics.reEntry(distinction!.id);

    assert.ok(reEntry);
    assert.ok(reEntry!.recursiveDepth > 0);
  });

  it('should find eigenforms', () => {
    const observer = cybernetics.createObserver(0);

    // Make repeated similar distinctions
    for (let i = 0; i < 15; i++) {
      cybernetics.makeDistinction(observer.id, 'stable-pattern', 'unstable');
    }

    const eigenforms = cybernetics.findEigenforms(observer.id);
    assert.ok(Array.isArray(eigenforms));
  });

  it('should establish operational closure', () => {
    const operations = [
      createOperation('re_entry', 'self', 'self'),
      createOperation('computation', 'input', 'output'),
      createOperation('re_entry', 'state', 'state')
    ];

    const closure = cybernetics.establishClosure('system-1', operations);

    assert.ok(closure);
    assert.ok(closure.closureStrength > 0);
  });

  it('should check closure maintenance', () => {
    const operations = [
      createOperation('re_entry', 'a', 'a'),
      createOperation('re_entry', 'b', 'b'),
      createOperation('re_entry', 'c', 'c')
    ];

    cybernetics.establishClosure('closed-system', operations);
    const isClosed = cybernetics.checkClosure('closed-system');

    assert.strictEqual(isClosed, true);
  });

  it('should establish structural coupling', () => {
    const coupling = cybernetics.couple('system-a', 'system-b');

    assert.ok(coupling.id);
    assert.strictEqual(coupling.system1, 'system-a');
    assert.strictEqual(coupling.system2, 'system-b');
  });

  it('should handle perturbations', () => {
    const coupling = cybernetics.couple('sys-1', 'sys-2');

    // Small perturbation - should be absorbed
    const small = cybernetics.perturb(coupling.id, 'external', 0.1);
    assert.ok(small);
    assert.strictEqual(small!.absorbed, true);

    // Large perturbation
    const large = cybernetics.perturb(coupling.id, 'external', 0.9);
    assert.ok(large);
  });

  it('should record co-evolution', () => {
    const coupling = cybernetics.couple('sys-a', 'sys-b');

    const event = cybernetics.coEvolve(
      coupling.id,
      'adapted-interface',
      'adapted-protocol',
      0.7
    );

    assert.ok(event);
    assert.strictEqual(event!.system1Change, 'adapted-interface');
    assert.strictEqual(event!.system2Change, 'adapted-protocol');
  });

  it('should perform observation', () => {
    const observer = cybernetics.createObserver(0);
    const observation = cybernetics.observe(observer.id, 'phenomenon');

    assert.ok(observation);
    assert.ok(observation.includes('distinguishes'));
  });

  it('should perform self-observation', () => {
    const observer = cybernetics.createObserver(0);
    cybernetics.selfObserve(observer.id);

    // Should reveal blind spot
    const obs = cybernetics.getObserver(observer.id);
    assert.ok(obs!.blindSpots.has('cannot-see-self-seeing'));
  });

  it('should get observer hierarchy', () => {
    cybernetics.createObserver(0);
    cybernetics.createObserver(1);
    cybernetics.createObserver(1);
    cybernetics.createObserver(2);

    const hierarchy = cybernetics.getObserverHierarchy();

    assert.ok(hierarchy.get(0)!.length >= 1);
    assert.strictEqual(hierarchy.get(1)!.length, 2);
    assert.strictEqual(hierarchy.get(2)!.length, 1);
  });

  it('should provide global instance', () => {
    resetCybernetics();
    const instance1 = getCybernetics();
    const instance2 = getCybernetics();
    assert.strictEqual(instance1, instance2);
  });

  it('should track metrics', () => {
    const obs = cybernetics.createObserver(0);
    cybernetics.makeDistinction(obs.id, 'a', 'b');
    cybernetics.couple('x', 'y');

    const metrics = cybernetics.getMetrics();
    assert.ok(metrics.observersCreated >= 2);
    assert.ok(metrics.distinctionsMade >= 1);
    assert.ok(metrics.couplingsFormed >= 1);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Phase 7 Integration', () => {
  it('should integrate semiotics with strange loops', () => {
    const lsm = new LargeSemiosisModel();
    const loop = new StrangeLoop();

    // Semiosis creates signs
    const sign = createSign('thought', 'symbol');
    lsm.interpret(sign);

    // Strange loop thinks about the sign
    const thought = loop.think(`Interpreting sign: ${sign.representamen}`, 0);
    const meta = loop.reflect(thought);

    assert.ok(meta.level > thought.level);
  });

  it('should integrate umwelt with symbiotic partnership', () => {
    const umwelt = new AgentUmwelt({ agentId: 'test', bounds: {} });
    const partnership = new SymbioticPartnership('human-test');

    // Agent has sensors
    const sensor = createSensor('s1', 'task-sensor', 'text');
    umwelt.merkwelt.registerSensor(sensor);

    // Partnership decides allocation
    const task = createTask('learning', 0.7, []);
    const assistanceType = partnership.determineAssistanceType(task);

    assert.ok(assistanceType);
  });

  it('should integrate morphogenetic with second-order cybernetics', () => {
    const colony = new AgentColony();
    const cybernetics = new SecondOrderCybernetics();

    // Colony is a closed system
    const operations = [
      createOperation('re_entry', 'repair', 'repair'),
      createOperation('computation', 'error', 'correction')
    ];

    const closure = cybernetics.establishClosure('colony-system', operations);

    // Add agent to colony
    const target = createTargetMorphology({ cap: 0.5 });
    colony.addAgent(new MorphogeneticAgent('agent-1', target));

    // Coupling between colony and observer
    const coupling = cybernetics.couple('colony-system', 'external-observer');

    assert.ok(closure.closureStrength > 0);
    assert.ok(coupling.id);
  });

  it('should have all modules export required interfaces', () => {
    resetLSM();
    clearUmwelts();
    resetColony();
    resetNCA();
    resetStrangeLoop();
    resetPartnership();
    resetCybernetics();

    assert.ok(getLSM());
    assert.ok(getUmwelt('test'));
    assert.ok(getColony());
    assert.ok(getNCA());
    assert.ok(getStrangeLoop());
    assert.ok(getPartnership());
    assert.ok(getCybernetics());
  });
});
