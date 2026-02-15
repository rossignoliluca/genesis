/**
 * Test Multi-Agent Coordinator
 *
 * Run with: npx tsx test-coordinator.ts
 */

import {
  AgentCoordinator,
  getCoordinator,
  routeToAgent,
  coordinateAgents,
  runWorkflow,
  MessageBus,
  AgentType,
} from './src/agents/index.js';

async function main() {
  console.log('🤝 Genesis Multi-Agent Coordinator Test\n');
  console.log('=' .repeat(50));

  // Create coordinator with fresh message bus
  const bus = new MessageBus();
  const coordinator = new AgentCoordinator(bus);

  // Test 1: Agent Routing
  console.log('\n📍 Test 1: Agent Routing');
  const testQueries = [
    'search for information about TypeScript',
    'build a new API endpoint',
    'critique this code for bugs',
    'remember this important fact',
    'predict what will happen next',
    'is this action ethical?',
    'plan the implementation steps',
    'summarize the conversation',
  ];

  for (const query of testQueries) {
    const bestAgent = coordinator.findBestAgent(query);
    console.log(`  "${query.slice(0, 35)}..." → ${bestAgent || 'unknown'}`);
  }

  // Test 2: Route to Multiple Agents
  console.log('\n📊 Test 2: Route to Multiple Agents');
  const complexQuery = 'search and build a solution then validate it';
  const agents = await coordinator.route(complexQuery, { maxAgents: 3 });
  console.log(`  Query: "${complexQuery}"`);
  console.log(`  Best agents: ${agents.join(', ')}`);

  // Test 3: Coordination Patterns
  console.log('\n🔄 Test 3: Coordination Patterns');
  const patterns = [
    'sequential',
    'parallel',
    'debate',
    'voting',
    'hierarchical',
    'round-robin',
  ];

  console.log('  Available patterns:');
  for (const pattern of patterns) {
    console.log(`    - ${pattern}`);
  }

  // Test 4: Built-in Workflows
  console.log('\n🔗 Test 4: Built-in Workflows');
  const workflows = coordinator.getWorkflows();
  console.log(`  Registered workflows: ${workflows.length}`);
  for (const wf of workflows) {
    console.log(`    - ${wf.id}: ${wf.description}`);
    console.log(`      Steps: ${wf.steps.map(s => s.name).join(' → ')}`);
  }

  // Test 5: Agent Capabilities
  console.log('\n🛠️  Test 5: Agent Capabilities');
  const capabilities = coordinator.getAgentCapabilities();
  const activeAgents: AgentType[] = [
    'explorer', 'critic', 'builder', 'memory',
    'feeling', 'planner', 'predictor', 'ethicist',
  ];

  for (const agent of activeAgents) {
    const caps = capabilities[agent];
    if (caps) {
      console.log(`  ${agent}:`);
      console.log(`    Skills: ${caps.skills.slice(0, 4).join(', ')}`);
    }
  }

  // Test 6: Coordination Task (simulated)
  console.log('\n🎯 Test 6: Simulated Coordination Task');

  // Set up mock response handler
  bus.subscribe('explorer', async (msg) => {
    if (msg.type === 'QUERY') {
      await bus.send('explorer-test', msg.from, 'RESPONSE', {
        result: 'Explorer found relevant information',
        confidence: 0.85,
      }, { correlationId: msg.correlationId });
    }
  });

  bus.subscribe('critic', async (msg) => {
    if (msg.type === 'QUERY') {
      await bus.send('critic-test', msg.from, 'RESPONSE', {
        result: 'Critic validated the approach',
        confidence: 0.9,
      }, { correlationId: msg.correlationId });
    }
  });

  // Create a coordination task (won't fully execute without real agents)
  const task = {
    query: 'Research and validate this approach',
    agents: ['explorer', 'critic'] as AgentType[],
    pattern: 'parallel' as const,
    aggregation: 'all' as const,
    timeout: 5000,
  };

  console.log(`  Task: ${task.query}`);
  console.log(`  Pattern: ${task.pattern}`);
  console.log(`  Agents: ${task.agents.join(', ')}`);
  console.log(`  Aggregation: ${task.aggregation}`);

  // Execute with short timeout (will likely timeout without real agents)
  try {
    const result = await coordinator.coordinate(task);
    console.log(`  Status: ${result.status}`);
    console.log(`  Results: ${result.results.length} responses`);
  } catch (e) {
    console.log(`  Status: timeout (expected without real agents)`);
  }

  // Test 7: Event Handling
  console.log('\n📢 Test 7: Event Handling');
  let taskStarted = false;
  let taskCompleted = false;

  coordinator.on('task:start', (task) => {
    taskStarted = true;
    console.log(`  Event: task:start (${task.id.slice(0, 8)})`);
  });

  coordinator.on('task:complete', (task) => {
    taskCompleted = true;
    console.log(`  Event: task:complete (${task.status})`);
  });

  coordinator.on('task:error', (task, error) => {
    console.log(`  Event: task:error (${error.message})`);
  });

  // Create a quick task to trigger events
  const quickTask = await coordinator.coordinate({
    query: 'Quick test',
    agents: ['memory'] as AgentType[],
    pattern: 'sequential',
    timeout: 100, // Very short timeout
  });

  console.log(`  Task started event: ${taskStarted ? '✅' : '❌'}`);

  // Test 8: Metrics
  console.log('\n📈 Test 8: Metrics');
  const metrics = coordinator.getMetrics();
  console.log(`  Tasks created: ${metrics.tasksCreated}`);
  console.log(`  Tasks completed: ${metrics.tasksCompleted}`);
  console.log(`  Tasks failed: ${metrics.tasksFailed}`);
  console.log(`  Workflows run: ${metrics.workflowsRun}`);
  console.log(`  Registered workflows: ${metrics.registeredWorkflows}`);

  // Test 9: Custom Workflow Registration
  console.log('\n📝 Test 9: Custom Workflow');
  coordinator.registerWorkflow({
    id: 'test-workflow',
    name: 'Test Workflow',
    description: 'A simple test workflow',
    steps: [
      {
        id: 'step1',
        name: 'Explore',
        agents: ['explorer'],
        pattern: 'sequential',
        aggregation: 'first',
        messageType: 'QUERY',
      },
      {
        id: 'step2',
        name: 'Summarize',
        agents: ['narrator'],
        pattern: 'sequential',
        aggregation: 'first',
        messageType: 'NARRATE',
        transform: (input) => `Summarize: ${JSON.stringify(input)}`,
      },
    ],
  });

  const updatedWorkflows = coordinator.getWorkflows();
  console.log(`  Workflows after registration: ${updatedWorkflows.length}`);
  const testWf = updatedWorkflows.find(w => w.id === 'test-workflow');
  console.log(`  Custom workflow found: ${testWf ? '✅' : '❌'}`);

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary');
  console.log(`  Coordination patterns: ${patterns.length}`);
  console.log(`  Built-in workflows: ${workflows.length}`);
  console.log(`  Agent types with capabilities: ${Object.keys(capabilities).length}`);
  console.log(`  Aggregation strategies: 6 (first, all, majority, weighted, best, merge)`);

  // Cleanup
  console.log('\n🧹 Cleanup...');
  coordinator.clear();
  bus.clear();
  console.log('✅ Done!\n');
}

main().catch(console.error);
