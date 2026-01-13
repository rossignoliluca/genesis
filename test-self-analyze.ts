/**
 * Test self.analyze executor directly
 */
import { executeAction } from './src/active-inference/actions.js';

async function main() {
  console.log('=== Testing self.analyze executor ===\n');

  // Test 1: Basic self-analysis
  console.log('Test 1: Basic self-analysis');
  const r1 = await executeAction('self.analyze', {});
  console.log(`  Success: ${r1.success}`);
  console.log(`  Action: ${r1.action}`);
  if (r1.data) {
    console.log(`  Timestamp: ${r1.data.timestamp}`);
    console.log(`  CWD: ${r1.data.cwd}`);
    console.log(`  Node Version: ${r1.data.nodeVersion}`);
    console.log(`  Platform: ${r1.data.platform}`);
    console.log(`  Architecture: ${r1.data.arch}`);
    console.log(`  Memory (MB): ${JSON.stringify(r1.data.memoryUsage)}`);
    console.log(`  Uptime (s): ${r1.data.uptime}`);
    console.log(`  CPU Cores: ${r1.data.cpuCount}`);
  }
  console.log('');

  // Test 2: With goal context
  console.log('Test 2: With goal context');
  const r2 = await executeAction('self.analyze', {
    goal: 'optimize memory usage'
  });
  console.log(`  Success: ${r2.success}`);
  console.log(`  Goal: ${r2.data?.goal}`);
  console.log(`  Memory RSS: ${r2.data?.memoryUsage?.rss} MB`);
  console.log(`  Memory Heap Used: ${r2.data?.memoryUsage?.heapUsed} MB`);
  console.log(`  Memory Heap Total: ${r2.data?.memoryUsage?.heapTotal} MB\n`);

  // Test 3: With beliefs context
  console.log('Test 3: With beliefs context');
  const r3 = await executeAction('self.analyze', {
    goal: 'assess system health',
    beliefs: {
      viability: 'high',
      worldState: 'stable',
      coupling: 'synced'
    }
  });
  console.log(`  Success: ${r3.success}`);
  console.log(`  Goal: ${r3.data?.goal}`);
  console.log(`  Beliefs passed: ${JSON.stringify(r3.data?.beliefs)}`);
  console.log(`  Platform: ${r3.data?.platform}`);
  console.log('');

  // Test 4: Verify introspection capabilities
  console.log('Test 4: Introspection summary');
  const r4 = await executeAction('self.analyze', {});
  if (r4.success && r4.data) {
    const mem = r4.data.memoryUsage;
    const heapPercent = ((mem.heapUsed / mem.heapTotal) * 100).toFixed(1);
    console.log(`  Heap utilization: ${heapPercent}%`);
    console.log(`  Process uptime: ${r4.data.uptime.toFixed(1)}s`);
    console.log(`  Available CPUs: ${r4.data.cpuCount}`);
    console.log(`  Node.js: ${r4.data.nodeVersion}`);
  }

  console.log('\n=== self.analyze executor test complete ===');
}

main().catch(console.error);
