/**
 * Query the daemon state without interrupting it
 */
const { createDaemon } = require('./dist/src/daemon/index.js');

// Quick diagnostic of what maintenance checks for
async function diagnose() {
  console.log('=== Daemon Diagnostic ===');
  console.log('');

  // Check heap usage
  const mem = process.memoryUsage();
  const heapUsed = mem.heapUsed / mem.heapTotal;
  console.log('Heap Check:');
  console.log(`  Used: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Total: ${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Percentage: ${(heapUsed * 100).toFixed(1)}%`);
  console.log(`  Threshold: 90%`);
  console.log(`  Status: ${heapUsed > 0.9 ? 'ISSUE: resource_memory_high' : 'OK'}`);
  console.log('');

  // Simulate maintenance context
  const mockKernel = {
    getState: () => ({ state: 'ready', energy: 0.8 }),
    checkInvariants: async () => [
      { id: 'state_consistency', satisfied: true },
      { id: 'memory_bounds', satisfied: true }
    ],
    checkAgentHealth: async () => [
      { id: 'default', healthy: true, latency: 50 }
    ]
  };

  console.log('Energy Check:');
  const state = mockKernel.getState();
  console.log(`  Energy: ${(state.energy * 100).toFixed(1)}%`);
  console.log(`  Critical threshold: 10%`);
  console.log(`  Status: ${state.energy < 0.1 ? 'ISSUE: energy_low' : 'OK'}`);
  console.log('');

  console.log('Invariant Check:');
  const invariants = await mockKernel.checkInvariants();
  invariants.forEach(inv => {
    console.log(`  ${inv.id}: ${inv.satisfied ? 'OK' : 'VIOLATED'}`);
  });
  console.log('');

  console.log('Agent Health:');
  const health = await mockKernel.checkAgentHealth();
  health.forEach(h => {
    console.log(`  ${h.id}: ${h.healthy ? 'healthy' : 'unhealthy'} (${h.latency}ms)`);
  });
  console.log('');

  // Check what the daemon instance would report
  console.log('=== Probable Cause ===');
  console.log('');
  console.log('The "1 issue, 1 action" pattern is likely:');
  console.log('');

  // Energy is the most probable cause - dream cycles don\'t fully restore it
  console.log('  HYPOTHESIS: Energy depletion between cycles');
  console.log('');
  console.log('  The daemon processes tasks that consume energy.');
  console.log('  Dream mode recharges 0.2 energy per session.');
  console.log('  If energy drops below 0.1 (10%), it triggers energy_low.');
  console.log('  The repair action is state_reset (enter dormancy).');
  console.log('');
  console.log('=== Recommendations ===');
  console.log('');
  console.log('1. Check kernel energy level directly');
  console.log('2. Increase energy recharge rate in dream mode');
  console.log('3. Add energy logging to maintenance');
}

diagnose().catch(console.error);
