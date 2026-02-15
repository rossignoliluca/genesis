/**
 * Test adapt.code executor directly
 */
import { executeAction } from './src/active-inference/actions.js';

async function main() {
  console.log('=== Testing adapt.code executor ===\n');

  // Test 1: Basic code analysis
  console.log('Test 1: Basic codebase analysis');
  const r1 = await executeAction('adapt.code', {});
  console.log(`  Success: ${r1.success}`);
  console.log(`  Action: ${r1.action}`);
  if (r1.data) {
    console.log(`  CWD: ${r1.data.cwd}`);
    console.log(`  Total TS files: ${r1.data.analysis?.totalFiles}`);
    console.log(`  Recent changes: ${r1.data.analysis?.recentChanges?.length || 0}`);
    if (r1.data.analysis?.recentChanges?.length > 0) {
      console.log('  Latest commits:');
      r1.data.analysis.recentChanges.slice(0, 3).forEach((c: string) => {
        console.log(`    - ${c}`);
      });
    }
  }
  console.log('');

  // Test 2: With goal context
  console.log('Test 2: With goal context');
  const r2 = await executeAction('adapt.code', {
    goal: 'optimize performance'
  });
  console.log(`  Success: ${r2.success}`);
  console.log(`  Goal: ${r2.data?.goal}`);
  console.log(`  Total files analyzed: ${r2.data?.analysis?.totalFiles}\n`);

  // Test 3: With specific target
  console.log('Test 3: With target parameter');
  const r3 = await executeAction('adapt.code', {
    goal: 'review module',
    parameters: {
      target: 'src/active-inference'
    }
  });
  console.log(`  Success: ${r3.success}`);
  console.log(`  Goal: ${r3.data?.goal}`);
  console.log(`  Files: ${r3.data?.analysis?.totalFiles}\n`);

  // Test 4: Analysis summary
  console.log('Test 4: Full analysis summary');
  const r4 = await executeAction('adapt.code', {
    goal: 'comprehensive review'
  });
  if (r4.success && r4.data) {
    const analysis = r4.data.analysis;
    console.log(`  Total TypeScript files: ${analysis?.totalFiles}`);
    console.log(`  Recent git activity: ${analysis?.recentChanges?.length || 0} commits`);
    console.log(`  Suggestions: ${analysis?.suggestions?.length || 0}`);
    if (analysis?.recentChanges?.length > 0) {
      console.log('\n  Recent commit history:');
      analysis.recentChanges.forEach((commit: string, i: number) => {
        console.log(`    ${i + 1}. ${commit}`);
      });
    }
  }

  console.log('\n=== adapt.code executor test complete ===');
}

main().catch(console.error);
