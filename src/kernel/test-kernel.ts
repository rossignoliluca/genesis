/**
 * Genesis 4.0 - Kernel Test
 *
 * Tests the Strong Kernel orchestration capabilities.
 */

import { createKernel, Kernel } from './index.js';

async function testKernel() {
  console.log('='.repeat(60));
  console.log('Genesis 4.0 - Kernel Test');
  console.log('='.repeat(60));

  // Create kernel
  console.log('\n1. Creating kernel...');
  const kernel = createKernel({
    energy: 1.0,
    healthCheckInterval: 30000,
  });

  // Start kernel
  console.log('\n2. Starting kernel...');
  await kernel.start();

  // Check initial status
  console.log('\n3. Initial Status:');
  const status = kernel.getStatus();
  console.log(`   State: ${status.state}`);
  console.log(`   Energy: ${(status.energy * 100).toFixed(0)}%`);
  console.log(`   Agents: ${status.agents.total}`);

  // Test state transitions
  console.log('\n4. Testing state transitions...');
  kernel.onStateChange((state, prev) => {
    console.log(`   State: ${prev} -> ${state}`);
  });

  // Submit a simple query task
  console.log('\n5. Submitting query task...');
  const queryTaskId = await kernel.submit({
    type: 'query',
    goal: 'What is the current system status?',
    priority: 'normal',
    requester: 'test',
  });
  console.log(`   Task ID: ${queryTaskId}`);

  // Wait for task completion
  await sleep(3000);

  // Check status after task
  console.log('\n6. Status after task:');
  const statusAfter = kernel.getStatus();
  console.log(`   State: ${statusAfter.state}`);
  console.log(`   Tasks completed: ${statusAfter.tasks.completed}`);
  console.log(`   Tasks failed: ${statusAfter.tasks.failed}`);

  // Submit a research task
  console.log('\n7. Submitting research task...');
  const researchTaskId = await kernel.submit({
    type: 'research',
    goal: 'Research AI orchestration patterns',
    priority: 'high',
    requester: 'test',
    context: { topic: 'multi-agent systems' },
  });
  console.log(`   Task ID: ${researchTaskId}`);

  // Wait for task
  await sleep(3000);

  // Submit a build task
  console.log('\n8. Submitting build task...');
  const buildTaskId = await kernel.submit({
    type: 'build',
    goal: 'Generate a hello world function',
    priority: 'normal',
    requester: 'test',
    context: { language: 'typescript' },
  });
  console.log(`   Task ID: ${buildTaskId}`);

  // Wait for task
  await sleep(3000);

  // Test energy management
  console.log('\n9. Testing energy management...');
  console.log(`   Current energy: ${(kernel.getEnergy() * 100).toFixed(0)}%`);

  // Simulate energy drain
  kernel.setEnergy(0.5);
  console.log(`   After drain: ${(kernel.getEnergy() * 100).toFixed(0)}%`);

  // Simulate low energy (should trigger dormancy)
  console.log('\n10. Testing dormancy trigger...');
  kernel.setEnergy(0.05);
  console.log(`   Low energy: ${(kernel.getEnergy() * 100).toFixed(0)}%`);
  console.log(`   State: ${kernel.getState()}`);

  // Restore energy
  kernel.setEnergy(0.8);
  console.log(`   Restored: ${(kernel.getEnergy() * 100).toFixed(0)}%`);
  console.log(`   State: ${kernel.getState()}`);

  // Get final metrics
  console.log('\n11. Final Metrics:');
  const metrics = kernel.getMetrics();
  console.log(`   State transitions: ${metrics.stateTransitions}`);
  console.log(`   Tasks completed: ${metrics.tasksCompleted}`);
  console.log(`   Tasks failed: ${metrics.tasksFailed}`);
  console.log(`   Invariant violations: ${metrics.invariantViolations}`);
  console.log(`   Uptime: ${(metrics.uptime / 1000).toFixed(1)}s`);

  // Stop kernel
  console.log('\n12. Stopping kernel...');
  await kernel.stop();

  console.log('\n' + '='.repeat(60));
  console.log('Kernel Test Complete!');
  console.log('='.repeat(60));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run test
testKernel().catch(console.error);
