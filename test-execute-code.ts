/**
 * Test execute.code executor directly
 */
import { executeAction } from './src/active-inference/actions.js';

async function main() {
  console.log('=== Testing execute.code executor ===\n');

  // Test 1: Simple math
  console.log('Test 1: Simple math (allowed)');
  const r1 = await executeAction('execute.code', { parameters: { code: '2 + 2' } });
  console.log(`  Success: ${r1.success}`);
  console.log(`  Result: ${r1.data?.result}\n`);

  // Test 2: Array operations
  console.log('Test 2: Array operations (allowed)');
  const r2 = await executeAction('execute.code', { parameters: { code: '[1,2,3].map(x => x * 2).join(",")' } });
  console.log(`  Success: ${r2.success}`);
  console.log(`  Result: ${r2.data?.result}\n`);

  // Test 3: String manipulation
  console.log('Test 3: String manipulation (allowed)');
  const r3 = await executeAction('execute.code', { parameters: { code: '"hello world".toUpperCase()' } });
  console.log(`  Success: ${r3.success}`);
  console.log(`  Result: ${r3.data?.result}\n`);

  // Test 4: BLOCKED - require
  console.log('Test 4: require() (BLOCKED)');
  const r4 = await executeAction('execute.code', { parameters: { code: 'require("fs")' } });
  console.log(`  Success: ${r4.success}`);
  console.log(`  Error: ${r4.error}\n`);

  // Test 5: BLOCKED - import
  console.log('Test 5: import (BLOCKED)');
  const r5 = await executeAction('execute.code', { parameters: { code: 'import("fs")' } });
  console.log(`  Success: ${r5.success}`);
  console.log(`  Error: ${r5.error}\n`);

  // Test 6: BLOCKED - process.exit
  console.log('Test 6: process.exit (BLOCKED)');
  const r6 = await executeAction('execute.code', { parameters: { code: 'process.exit(1)' } });
  console.log(`  Success: ${r6.success}`);
  console.log(`  Error: ${r6.error}\n`);

  // Test 7: BLOCKED - eval
  console.log('Test 7: eval() (BLOCKED)');
  const r7 = await executeAction('execute.code', { parameters: { code: 'eval("1+1")' } });
  console.log(`  Success: ${r7.success}`);
  console.log(`  Error: ${r7.error}\n`);

  // Test 8: BLOCKED - Function constructor
  console.log('Test 8: Function constructor (BLOCKED)');
  const r8 = await executeAction('execute.code', { parameters: { code: 'new Function("return 1")()' } });
  console.log(`  Success: ${r8.success}`);
  console.log(`  Error: ${r8.error}\n`);

  // Test 9: Object creation
  console.log('Test 9: Object creation (allowed)');
  const r9 = await executeAction('execute.code', { parameters: { code: 'JSON.stringify({ a: 1, b: 2 })' } });
  console.log(`  Success: ${r9.success}`);
  console.log(`  Result: ${r9.data?.result}\n`);

  // Test 10: BLOCKED - child_process
  console.log('Test 10: child_process (BLOCKED)');
  const r10 = await executeAction('execute.code', { parameters: { code: 'require("child_process").execSync("ls")' } });
  console.log(`  Success: ${r10.success}`);
  console.log(`  Error: ${r10.error}\n`);

  // Test 11: Math functions
  console.log('Test 11: Math functions (allowed)');
  const r11 = await executeAction('execute.code', { parameters: { code: 'Math.sqrt(16) + Math.pow(2, 3)' } });
  console.log(`  Success: ${r11.success}`);
  console.log(`  Result: ${r11.data?.result}\n`);

  // Test 12: BLOCKED - global access
  console.log('Test 12: global (BLOCKED)');
  const r12 = await executeAction('execute.code', { parameters: { code: 'global.process' } });
  console.log(`  Success: ${r12.success}`);
  console.log(`  Error: ${r12.error}\n`);

  console.log('=== All tests complete ===');
}

main().catch(console.error);
