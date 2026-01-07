/**
 * Genesis 4.0 - Agent System Test
 *
 * Quick test to verify all agents spawn and communicate correctly.
 */

import {
  createAgentEcosystem,
  messageBus,
  AgentType,
} from './index.js';

async function testAgentSystem() {
  console.log('='.repeat(60));
  console.log('Genesis 4.0 - Agent System Test');
  console.log('='.repeat(60));

  // Create the full ecosystem
  console.log('\n1. Spawning all agents...');
  const { registry, agents } = createAgentEcosystem();

  console.log(`   Spawned ${agents.size} agents:`);
  for (const [type, agent] of agents) {
    console.log(`   - ${type}: ${agent.id}`);
  }

  // Wake all agents
  console.log('\n2. Waking all agents...');
  for (const agent of agents.values()) {
    agent.wake();
  }

  // Test message passing
  console.log('\n3. Testing message passing...');

  // Test Explorer
  console.log('   - Testing Explorer...');
  const explorerResponse = await messageBus.request(
    'test',
    'explorer',
    'QUERY',
    { query: 'search for AI papers' },
    5000
  ).catch(() => ({ payload: { error: 'timeout' } }));
  console.log(`     Result: ${JSON.stringify(explorerResponse.payload).slice(0, 80)}...`);

  // Test Feeling
  console.log('   - Testing Feeling...');
  const feelingResponse = await messageBus.request(
    'test',
    'feeling',
    'FEELING',
    { content: 'This is an exciting new discovery!', context: 'research' },
    5000
  ).catch(() => ({ payload: { error: 'timeout' } }));
  console.log(`     Result: ${JSON.stringify(feelingResponse.payload).slice(0, 80)}...`);

  // Test Ethicist
  console.log('   - Testing Ethicist...');
  const ethicsResponse = await messageBus.request(
    'test',
    'ethicist',
    'ETHICAL_CHECK',
    {
      id: 'test-action',
      type: 'create',
      description: 'Create a new document',
    },
    5000
  ).catch(() => ({ payload: { error: 'timeout' } }));
  console.log(`     Result: ${JSON.stringify(ethicsResponse.payload).slice(0, 80)}...`);

  // Test Planner
  console.log('   - Testing Planner...');
  const planResponse = await messageBus.request(
    'test',
    'planner',
    'PLAN',
    { goal: 'Research and build a new feature', template: 'pipeline' },
    5000
  ).catch(() => ({ payload: { error: 'timeout' } }));
  console.log(`     Result: ${JSON.stringify(planResponse.payload).slice(0, 80)}...`);

  // Test Critic
  console.log('   - Testing Critic...');
  const critiqueResponse = await messageBus.request(
    'test',
    'critic',
    'CRITIQUE',
    {
      target: 'test-code',
      content: 'console.log("debug"); function test() { // TODO: implement }',
      type: 'code',
    },
    5000
  ).catch(() => ({ payload: { error: 'timeout' } }));
  console.log(`     Result: ${JSON.stringify(critiqueResponse.payload).slice(0, 80)}...`);

  // Test Sensor
  console.log('   - Testing Sensor...');
  const sensorResponse = await messageBus.request(
    'test',
    'sensor',
    'QUERY',
    { query: 'stats' },
    5000
  ).catch(() => ({ payload: { error: 'timeout' } }));
  console.log(`     Result: ${JSON.stringify(sensorResponse.payload).slice(0, 80)}...`);

  // Get registry stats
  console.log('\n4. Registry Stats:');
  const stats = registry.getStats();
  console.log(`   Total agents: ${stats.totalAgents}`);
  console.log(`   By type: ${JSON.stringify(stats.byType)}`);
  console.log(`   By state: ${JSON.stringify(stats.byState)}`);

  // Shutdown
  console.log('\n5. Shutting down...');
  registry.shutdownAll();

  console.log('\n' + '='.repeat(60));
  console.log('Test Complete!');
  console.log('='.repeat(60));
}

// Run test
testAgentSystem().catch(console.error);
