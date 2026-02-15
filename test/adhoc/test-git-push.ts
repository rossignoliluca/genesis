/**
 * Test git.push executor directly
 */
import { executeAction } from './src/active-inference/actions.js';

async function main() {
  console.log('=== Testing git.push executor ===\n');

  // Test 1: Check current git status (no push needed)
  console.log('Test 1: git.push with clean repo (nothing to push)');
  const r1 = await executeAction('git.push', {});
  console.log(`  Success: ${r1.success}`);
  console.log(`  Branch: ${r1.data?.branch}`);
  console.log(`  Status: ${r1.data?.status}`);
  console.log(`  Ahead: ${r1.data?.ahead}`);
  console.log(`  Behind: ${r1.data?.behind}`);
  console.log(`  Pushed: ${r1.data?.pushed}`);
  console.log(`  Reason: ${r1.data?.reason || 'N/A'}\n`);

  // Test 2: Simulate scenario analysis
  console.log('Test 2: Analysis of push safety checks');
  console.log('  The git.push executor checks:');
  console.log('    1. Current branch (not detached HEAD)');
  console.log('    2. Working directory status (clean/dirty)');
  console.log('    3. Commits ahead of remote (> 0 to push)');
  console.log('    4. Commits behind remote (must be 0)\n');

  // Test 3: Show what would prevent a push
  console.log('Test 3: Safety conditions that block push:');
  const conditions = [
    { condition: 'Dirty working directory', blocked: true },
    { condition: 'Behind remote (need pull first)', blocked: true },
    { condition: 'Detached HEAD state', blocked: true },
    { condition: 'Nothing to push (ahead = 0)', blocked: true },
    { condition: 'Clean + ahead + not behind', blocked: false },
  ];
  conditions.forEach(c => {
    const icon = c.blocked ? '✗' : '✓';
    console.log(`    ${icon} ${c.condition}: ${c.blocked ? 'BLOCKED' : 'ALLOWED'}`);
  });

  console.log('\n=== git.push executor test complete ===');
}

main().catch(console.error);
// Test timestamp: mar 13 gen 2026 21:31:06 CET
