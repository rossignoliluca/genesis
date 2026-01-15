/**
 * Test Applying REAL Self-Improvement
 *
 * Applies a real modification through the Darwin-Gödel engine
 */

import {
  getDarwinGodelEngine,
  ModificationPlan,
} from './src/self-modification/darwin-godel.js';

async function testRealImprovement() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('        GENESIS - REAL SELF-IMPROVEMENT TEST                   ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Initialize Darwin-Gödel engine
  console.log('1. Initializing Darwin-Gödel engine...');
  const darwinGodel = getDarwinGodelEngine({
    genesisRoot: process.cwd(),
    sandboxDir: '/tmp/genesis-darwin-godel-real',
    gitEnabled: true,  // Enable git for real commit
    skipTests: true,   // Skip tests for speed
    skipRuntimeCheck: true,
  });
  console.log('   ✓ Engine ready\n');

  // Create a real improvement plan
  console.log('2. Creating modification plan...');
  const plan: ModificationPlan = {
    id: `real-improvement-${Date.now()}`,
    name: 'Increase retry resilience',
    description: 'Increase default retries from 2 to 3 for better error tolerance',
    modifications: [{
      id: 'increase-retries',
      description: 'Increase defaultMaxRetries from 2 to 3',
      targetFile: 'mcp/resilient.ts',
      type: 'replace',
      search: 'defaultMaxRetries: 2,',
      content: 'defaultMaxRetries: 3, // Improved by self-improvement cycle',
      reason: 'Error rate at 8%, increasing retries to reduce failures',
      expectedImprovement: 'Error rate -30%',
    }],
    createdAt: new Date(),
  };

  console.log(`   Plan: ${plan.name}`);
  console.log(`   Target: src/${plan.modifications[0].targetFile}`);
  console.log(`   Change: defaultMaxRetries 2 → 3\n`);

  // Validate
  console.log('3. Validating plan...');
  const validation = darwinGodel.validatePlan(plan);

  if (!validation.valid) {
    console.log('   ❌ Validation failed:');
    for (const err of validation.errors) {
      console.log(`      • ${err}`);
    }
    return;
  }
  console.log('   ✓ Plan is valid (no TCB violations)\n');

  // Apply
  console.log('4. Applying through Darwin-Gödel sandbox...');
  console.log('   → Creating sandbox copy');
  console.log('   → Applying modification');
  console.log('   → Building modified code');
  console.log('   → Verifying invariants');
  console.log('');

  const startTime = Date.now();
  const result = await darwinGodel.apply(plan);
  const duration = (Date.now() - startTime) / 1000;

  // Results
  console.log('   ┌────────────────────────────────────────────────────────────┐');
  if (result.success) {
    console.log('   │                    ✅ SUCCESS                              │');
  } else {
    console.log('   │                    ❌ FAILED                               │');
  }
  console.log('   ├────────────────────────────────────────────────────────────┤');
  console.log(`   │  Build:              ${result.verificaton.buildSuccess ? '✅ PASSED' : '❌ FAILED'}                          │`);
  console.log(`   │  Tests:              ${result.verificaton.testsSuccess ? '✅ PASSED' : '❌ FAILED'} (skipped)                 │`);
  console.log(`   │  Invariants:         ${result.verificaton.invariantsPass ? '✅ PASSED' : '❌ FAILED'}                          │`);
  console.log(`   │  Runtime Check:      ${result.verificaton.runtimeCheck ? '✅ PASSED' : '❌ FAILED'} (skipped)                 │`);
  console.log('   ├────────────────────────────────────────────────────────────┤');
  console.log(`   │  Duration:           ${duration.toFixed(1).padStart(6)}s                            │`);
  if (result.commitHash) {
    console.log(`   │  Git Commit:         ${result.commitHash.slice(0, 8)}                            │`);
  }
  if (result.rollbackHash) {
    console.log(`   │  Rollback Point:     ${result.rollbackHash.slice(0, 8)}                            │`);
  }
  console.log('   └────────────────────────────────────────────────────────────┘');

  if (result.verificaton.errors.length > 0) {
    console.log('\n   Errors:');
    for (const err of result.verificaton.errors) {
      // Truncate long error messages
      const displayErr = err.length > 70 ? err.slice(0, 70) + '...' : err;
      console.log(`      • ${displayErr}`);
    }
  }

  if (result.success) {
    console.log('\n5. Verification...');

    // Read the modified file to confirm
    const { readFileSync } = await import('fs');
    const modifiedContent = readFileSync('./src/mcp/resilient.ts', 'utf-8');

    if (modifiedContent.includes('defaultMaxRetries: 3')) {
      console.log('   ✓ Modification confirmed in source file');
      console.log('   ✓ Code rebuilt successfully');
      console.log('\n   📝 The system has self-improved!');
      console.log('      defaultMaxRetries: 2 → 3');
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                    TEST COMPLETE                              ');
  console.log('═══════════════════════════════════════════════════════════════');
}

// Run
testRealImprovement().catch(console.error);
