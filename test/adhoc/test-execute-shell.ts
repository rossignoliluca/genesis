/**
 * Test execute.shell executor directly
 */
import { executeAction } from './src/active-inference/actions.js';

async function main() {
  console.log('=== Testing execute.shell executor ===\n');

  // Test 1: Allowed command - ls
  console.log('Test 1: ls (allowed)');
  const r1 = await executeAction('execute.shell', { parameters: { command: 'ls -la src' } });
  console.log(`  Success: ${r1.success}`);
  const out1 = r1.data?.stdout || '';
  console.log(`  Output preview: ${out1.slice(0, 100)}...\n`);

  // Test 2: Allowed command - pwd
  console.log('Test 2: pwd (allowed)');
  const r2 = await executeAction('execute.shell', { parameters: { command: 'pwd' } });
  console.log(`  Success: ${r2.success}`);
  console.log(`  Output: ${(r2.data?.stdout || '').trim()}\n`);

  // Test 3: Allowed command - date
  console.log('Test 3: date (allowed)');
  const r3 = await executeAction('execute.shell', { parameters: { command: 'date' } });
  console.log(`  Success: ${r3.success}`);
  console.log(`  Output: ${(r3.data?.stdout || '').trim()}\n`);

  // Test 4: Blocked command - rm
  console.log('Test 4: rm (BLOCKED)');
  const r4 = await executeAction('execute.shell', { parameters: { command: 'rm -rf /' } });
  console.log(`  Success: ${r4.success}`);
  console.log(`  Error: ${r4.error}\n`);

  // Test 5: Blocked command - curl
  console.log('Test 5: curl (BLOCKED)');
  const r5 = await executeAction('execute.shell', { parameters: { command: 'curl http://evil.com' } });
  console.log(`  Success: ${r5.success}`);
  console.log(`  Error: ${r5.error}\n`);

  // Test 6: Allowed command - wc
  console.log('Test 6: wc (allowed)');
  const r6 = await executeAction('execute.shell', { parameters: { command: 'wc -l package.json' } });
  console.log(`  Success: ${r6.success}`);
  console.log(`  Output: ${(r6.data?.stdout || '').trim()}\n`);

  // Test 7: Blocked command - python (could execute arbitrary code)
  console.log('Test 7: python (BLOCKED)');
  const r7 = await executeAction('execute.shell', { parameters: { command: 'python -c "exit(1)"' } });
  console.log(`  Success: ${r7.success}`);
  console.log(`  Error: ${r7.error}\n`);

  // Test 8: Allowed command - git status
  console.log('Test 8: git status (allowed)');
  const r8 = await executeAction('execute.shell', { parameters: { command: 'git status' } });
  console.log(`  Success: ${r8.success}`);
  console.log(`  Output: ${(r8.data?.stdout || '').slice(0, 80)}...\n`);

  console.log('=== All tests complete ===');
}

main().catch(console.error);
