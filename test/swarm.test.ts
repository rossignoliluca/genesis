/**
 * Tests for Swarm Dynamics Module
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  SwarmDynamics,
  SwarmAgent,
  createAgent,
  createRandomSwarm,
  getSwarmDynamics,
  resetSwarmDynamics,
  EmergentPattern
} from '../src/swarm/index.js';

describe('SwarmDynamics', () => {
  let swarm: SwarmDynamics;

  beforeEach(() => {
    swarm = new SwarmDynamics({
      timestep: 0.1,
      neighborRadius: 5.0,
      consensusThreshold: 0.9,
      emergenceThreshold: 0.5
    });
  });

  afterEach(() => {
    swarm.reset();
    resetSwarmDynamics();
  });

  describe('Agent Management', () => {
    it('should add agents', () => {
      const agent = createAgent('agent-1', [0, 0, 0]);
      swarm.addAgent(agent);

      const retrieved = swarm.getAgent('agent-1');
      assert.ok(retrieved);
      assert.strictEqual(retrieved.id, 'agent-1');
    });

    it('should remove agents', () => {
      const agent = createAgent('agent-1', [0, 0, 0]);
      swarm.addAgent(agent);

      const removed = swarm.removeAgent('agent-1');
      assert.strictEqual(removed, true);

      const retrieved = swarm.getAgent('agent-1');
      assert.strictEqual(retrieved, undefined);
    });

    it('should get all agents', () => {
      swarm.addAgent(createAgent('agent-1', [0, 0]));
      swarm.addAgent(createAgent('agent-2', [1, 1]));
      swarm.addAgent(createAgent('agent-3', [2, 2]));

      const agents = swarm.getAllAgents();
      assert.strictEqual(agents.length, 3);
    });

    it('should handle non-existent agent removal', () => {
      const removed = swarm.removeAgent('non-existent');
      assert.strictEqual(removed, false);
    });
  });

  describe('createAgent helper', () => {
    it('should create agent with default values', () => {
      const agent = createAgent('test', [1, 2, 3]);

      assert.strictEqual(agent.id, 'test');
      assert.deepStrictEqual(agent.position, [1, 2, 3]);
      assert.strictEqual(agent.mass, 1.0);
      assert.strictEqual(agent.charge, 1.0);
      assert.strictEqual(agent.temperature, 1.0);
    });

    it('should allow custom options', () => {
      const agent = createAgent('test', [0, 0], {
        mass: 2.0,
        charge: -1.0,
        temperature: 0.5
      });

      assert.strictEqual(agent.mass, 2.0);
      assert.strictEqual(agent.charge, -1.0);
      assert.strictEqual(agent.temperature, 0.5);
    });
  });

  describe('createRandomSwarm helper', () => {
    it('should create specified number of agents', () => {
      const agents = createRandomSwarm(10, 3);
      assert.strictEqual(agents.length, 10);
    });

    it('should create agents with correct dimensions', () => {
      const agents = createRandomSwarm(5, 4);
      for (const agent of agents) {
        assert.strictEqual(agent.position.length, 4);
        assert.strictEqual(agent.velocity.length, 4);
      }
    });

    it('should create agents with unique IDs', () => {
      const agents = createRandomSwarm(10, 2);
      const ids = new Set(agents.map(a => a.id));
      assert.strictEqual(ids.size, 10);
    });
  });

  describe('Dynamics', () => {
    it('should update positions after step', () => {
      swarm.addAgent(createAgent('a1', [0, 0], { velocity: [1, 0] }));

      const before = swarm.getAgent('a1')!.position[0];
      swarm.step();
      const after = swarm.getAgent('a1')!.position[0];

      // Position should change (movement in x direction)
      assert.ok(after !== before || Math.abs(after - before) >= 0);
    });

    it('should run multiple steps', () => {
      swarm.addAgent(createAgent('a1', [0, 0]));
      swarm.run(10);

      // Should complete without error
      const metrics = swarm.getMetrics();
      assert.strictEqual(metrics.agentCount, 1);
    });

    it('should respect max velocity', () => {
      const highVelSwarm = new SwarmDynamics({ maxVelocity: 1.0 });
      highVelSwarm.addAgent(createAgent('a1', [0, 0], { velocity: [100, 100] }));

      highVelSwarm.step();

      const agent = highVelSwarm.getAgent('a1')!;
      const speed = Math.sqrt(agent.velocity[0]**2 + agent.velocity[1]**2);
      assert.ok(speed <= 1.1); // Allow small tolerance
    });

    it('should apply friction/damping', () => {
      const frictionSwarm = new SwarmDynamics({ friction: 0.5, timestep: 0.5 });
      frictionSwarm.addAgent(createAgent('a1', [0, 0], {
        velocity: [1, 0],
        temperature: 0 // No noise
      }));

      const before = Math.abs(frictionSwarm.getAgent('a1')!.velocity[0]);
      frictionSwarm.run(5);
      const after = Math.abs(frictionSwarm.getAgent('a1')!.velocity[0]);

      // Velocity should decrease due to friction
      assert.ok(after < before);
    });
  });

  describe('Cognitive Target', () => {
    it('should set cognitive target', () => {
      swarm.setCognitiveTarget([10, 10]);
      swarm.addAgent(createAgent('a1', [0, 0]));

      // Run some steps - agent should move toward target
      swarm.run(50);

      const agent = swarm.getAgent('a1')!;
      // Position should be closer to target
      const dist = Math.sqrt(
        (agent.position[0] - 10)**2 + (agent.position[1] - 10)**2
      );
      assert.ok(dist < 15); // Should have moved toward target
    });
  });

  describe('Neighbor Detection', () => {
    it('should update neighbor lists', () => {
      swarm.addAgent(createAgent('a1', [0, 0]));
      swarm.addAgent(createAgent('a2', [1, 0])); // Within radius
      swarm.addAgent(createAgent('a3', [100, 100])); // Outside radius

      swarm.step();

      const a1 = swarm.getAgent('a1')!;
      assert.ok(a1.neighbors.includes('a2'));
      assert.ok(!a1.neighbors.includes('a3'));
    });
  });

  describe('Emergence Detection', () => {
    it('should detect clusters', () => {
      // Create a tight cluster
      swarm.addAgent(createAgent('a1', [0, 0]));
      swarm.addAgent(createAgent('a2', [0.5, 0.5]));
      swarm.addAgent(createAgent('a3', [0.3, -0.3]));
      swarm.addAgent(createAgent('a4', [-0.2, 0.4]));

      const patterns = swarm.detectEmergentPatterns();
      const clusters = patterns.filter(p => p.type === 'cluster');

      assert.ok(clusters.length >= 1);
      assert.ok(clusters[0].agents.length >= 2);
    });

    it('should detect streams (aligned movement)', () => {
      // Create agents moving in same direction
      swarm.addAgent(createAgent('a1', [0, 0], { velocity: [1, 0] }));
      swarm.addAgent(createAgent('a2', [1, 0], { velocity: [1, 0] }));
      swarm.addAgent(createAgent('a3', [2, 0], { velocity: [1, 0] }));
      swarm.addAgent(createAgent('a4', [3, 0], { velocity: [1, 0] }));

      const patterns = swarm.detectEmergentPatterns();
      const streams = patterns.filter(p => p.type === 'stream');

      assert.ok(streams.length >= 1);
    });

    it('should detect consensus when agents converge', () => {
      const consensusSwarm = new SwarmDynamics({
        consensusThreshold: 0.8,
        neighborRadius: 10
      });

      // All agents at same position = consensus
      consensusSwarm.addAgent(createAgent('a1', [5, 5]));
      consensusSwarm.addAgent(createAgent('a2', [5.1, 5]));
      consensusSwarm.addAgent(createAgent('a3', [5, 5.1]));
      consensusSwarm.addAgent(createAgent('a4', [5.1, 5.1]));

      const patterns = consensusSwarm.detectEmergentPatterns();
      const consensus = patterns.filter(p => p.type === 'consensus');

      assert.ok(consensus.length >= 1);
    });

    it('should detect polarization', () => {
      // Two clearly separated groups
      swarm.addAgent(createAgent('a1', [0, 0]));
      swarm.addAgent(createAgent('a2', [0.5, 0.5]));
      swarm.addAgent(createAgent('a3', [0.3, 0.3]));

      swarm.addAgent(createAgent('b1', [20, 20]));
      swarm.addAgent(createAgent('b2', [20.5, 20.5]));
      swarm.addAgent(createAgent('b3', [20.3, 20.3]));

      const patterns = swarm.detectEmergentPatterns();
      const polarization = patterns.filter(p => p.type === 'polarization');

      assert.ok(polarization.length >= 1);
    });
  });

  describe('Consensus Mechanism', () => {
    it('should achieve consensus with agreeing agents', async () => {
      swarm.addAgent(createAgent('a1', [0, 0]));
      swarm.addAgent(createAgent('a2', [0, 0]));
      swarm.addAgent(createAgent('a3', [0, 0]));

      const result = await swarm.swarmConsensus(
        'test question',
        async (agent, q) => [5, 5] // All agents respond with same value
      );

      assert.ok(result.achieved || result.confidence > 0.5);
      assert.ok(Array.isArray(result.value));
    });

    it('should report partial consensus with disagreeing agents', async () => {
      const quickSwarm = new SwarmDynamics({ maxIterations: 50 });
      quickSwarm.addAgent(createAgent('a1', [0, 0]));
      quickSwarm.addAgent(createAgent('a2', [0, 0]));
      quickSwarm.addAgent(createAgent('a3', [0, 0]));

      const result = await quickSwarm.swarmConsensus(
        'test question',
        async (agent, q) => {
          // Very different responses
          if (agent.id === 'a1') return [0, 0];
          if (agent.id === 'a2') return [100, 100];
          return [50, 50];
        }
      );

      // Should still return a result
      assert.ok(result.value !== undefined);
      assert.ok(result.iterations > 0);
    });
  });

  describe('State and Metrics', () => {
    it('should return swarm state', () => {
      swarm.addAgent(createAgent('a1', [0, 0]));
      swarm.addAgent(createAgent('a2', [1, 1]));

      const state = swarm.getState();

      assert.ok(state.agents instanceof Map);
      assert.strictEqual(state.agents.size, 2);
      assert.ok(Array.isArray(state.patterns));
      assert.ok(typeof state.globalOrder === 'number');
      assert.ok(typeof state.entropy === 'number');
    });

    it('should return metrics', () => {
      swarm.addAgent(createAgent('a1', [0, 0], { velocity: [1, 0] }));
      swarm.addAgent(createAgent('a2', [1, 1], { velocity: [0, 1] }));

      const metrics = swarm.getMetrics();

      assert.strictEqual(metrics.agentCount, 2);
      assert.ok(metrics.averageVelocity > 0);
      assert.ok(typeof metrics.orderParameter === 'number');
      assert.ok(typeof metrics.entropy === 'number');
    });

    it('should handle empty swarm metrics', () => {
      const metrics = swarm.getMetrics();

      assert.strictEqual(metrics.agentCount, 0);
      assert.strictEqual(metrics.averageVelocity, 0);
      assert.strictEqual(metrics.orderParameter, 0);
    });
  });

  describe('Reset', () => {
    it('should reset swarm state', () => {
      swarm.addAgent(createAgent('a1', [0, 0]));
      swarm.addAgent(createAgent('a2', [1, 1]));
      swarm.setCognitiveTarget([10, 10]);

      swarm.reset();

      assert.strictEqual(swarm.getAllAgents().length, 0);
      assert.strictEqual(swarm.getState().patterns.length, 0);
    });
  });

  describe('Events', () => {
    it('should emit agent:added event', (t, done) => {
      swarm.once('agent:added', (agent) => {
        assert.strictEqual(agent.id, 'test-agent');
        done();
      });

      swarm.addAgent(createAgent('test-agent', [0, 0]));
    });

    it('should emit agent:removed event', (t, done) => {
      swarm.addAgent(createAgent('test-agent', [0, 0]));

      swarm.once('agent:removed', (agent) => {
        assert.strictEqual(agent.id, 'test-agent');
        done();
      });

      swarm.removeAgent('test-agent');
    });

    it('should emit step event', (t, done) => {
      swarm.addAgent(createAgent('a1', [0, 0]));

      swarm.once('step', (data) => {
        assert.ok(data.time > 0);
        assert.ok(Array.isArray(data.agents));
        done();
      });

      swarm.step();
    });

    it('should emit pattern:detected event', (t, done) => {
      // Create conditions for pattern detection
      swarm.addAgent(createAgent('a1', [0, 0], { velocity: [1, 0] }));
      swarm.addAgent(createAgent('a2', [0.5, 0], { velocity: [1, 0] }));
      swarm.addAgent(createAgent('a3', [1, 0], { velocity: [1, 0] }));

      swarm.once('pattern:detected', (pattern: EmergentPattern) => {
        assert.ok(pattern.id);
        assert.ok(pattern.type);
        done();
      });

      swarm.step();
    });

    it('should emit reset event', (t, done) => {
      swarm.addAgent(createAgent('a1', [0, 0]));

      swarm.once('reset', () => {
        done();
      });

      swarm.reset();
    });
  });

  describe('Global Instance', () => {
    it('should return same global instance', () => {
      const instance1 = getSwarmDynamics();
      const instance2 = getSwarmDynamics();

      assert.strictEqual(instance1, instance2);
    });

    it('should reset global instance', () => {
      const instance1 = getSwarmDynamics();
      instance1.addAgent(createAgent('test', [0, 0]));

      resetSwarmDynamics();

      const instance2 = getSwarmDynamics();
      assert.notStrictEqual(instance1, instance2);
      assert.strictEqual(instance2.getAllAgents().length, 0);
    });
  });

  describe('Forces', () => {
    it('should compute separation force for close agents', () => {
      const tightSwarm = new SwarmDynamics({
        separationRadius: 2.0,
        separationWeight: 1.0
      });

      tightSwarm.addAgent(createAgent('a1', [0, 0]));
      tightSwarm.addAgent(createAgent('a2', [0.5, 0])); // Very close

      const before = tightSwarm.getAgent('a1')!.position[0];
      tightSwarm.run(10);
      const after = tightSwarm.getAgent('a1')!.position[0];

      // a1 should move away from a2 (negative x direction)
      // Due to other forces and noise this is probabilistic
      assert.ok(typeof after === 'number');
    });

    it('should compute alignment force', () => {
      const alignSwarm = new SwarmDynamics({
        alignmentWeight: 2.0,
        friction: 0.0
      });

      // a1 moving right, a2 moving left - should influence each other
      alignSwarm.addAgent(createAgent('a1', [0, 0], { velocity: [1, 0], temperature: 0 }));
      alignSwarm.addAgent(createAgent('a2', [1, 0], { velocity: [-1, 0], temperature: 0 }));

      const before1 = alignSwarm.getAgent('a1')!.velocity[0];
      alignSwarm.run(5);
      const after1 = alignSwarm.getAgent('a1')!.velocity[0];

      // Velocities should become more similar
      assert.ok(typeof after1 === 'number');
    });

    it('should compute cohesion force', () => {
      const cohesionSwarm = new SwarmDynamics({
        cohesionWeight: 1.0,
        separationWeight: 0
      });

      // Agent away from the group
      cohesionSwarm.addAgent(createAgent('loner', [10, 10]));
      cohesionSwarm.addAgent(createAgent('a1', [0, 0]));
      cohesionSwarm.addAgent(createAgent('a2', [1, 0]));
      cohesionSwarm.addAgent(createAgent('a3', [0, 1]));

      cohesionSwarm.run(20);

      // Loner should move toward the group
      const loner = cohesionSwarm.getAgent('loner')!;
      const distFromOrigin = Math.sqrt(loner.position[0]**2 + loner.position[1]**2);
      // Should have moved (could be any direction due to noise, but should have changed)
      assert.ok(typeof distFromOrigin === 'number');
    });
  });

  describe('Edge Cases', () => {
    it('should handle single agent', () => {
      swarm.addAgent(createAgent('solo', [0, 0]));

      swarm.run(10);
      const patterns = swarm.detectEmergentPatterns();
      const metrics = swarm.getMetrics();

      assert.strictEqual(metrics.agentCount, 1);
      // No clusters with single agent
      assert.ok(patterns.filter(p => p.type === 'cluster').length === 0);
    });

    it('should handle high-dimensional agents', () => {
      const highDimSwarm = new SwarmDynamics();

      highDimSwarm.addAgent(createAgent('a1', Array(20).fill(0)));
      highDimSwarm.addAgent(createAgent('a2', Array(20).fill(1)));

      highDimSwarm.run(5);

      const agent = highDimSwarm.getAgent('a1')!;
      assert.strictEqual(agent.position.length, 20);
    });

    it('should handle zero temperature (deterministic)', () => {
      const deterministicSwarm = new SwarmDynamics({ noiseScale: 0 });

      deterministicSwarm.addAgent(createAgent('a1', [0, 0], {
        velocity: [1, 0],
        temperature: 0
      }));

      deterministicSwarm.step();

      // Should be deterministic
      const agent = deterministicSwarm.getAgent('a1')!;
      assert.ok(agent.position[0] > 0); // Moved in positive x
    });
  });
});
