/**
 * Test Applying Self-Improvement
 *
 * Actually applies a modification through the Darwin-Gödel engine
 */

import {
  getSelfImprovementEngine,
  ImprovementOpportunity,
} from './src/self-modification/index.js';
import {
  getDarwinGodelEngine,
  ModificationPlan,
} from './src/self-modification/darwin-godel.js';
import { createPhiMonitor } from './src/consciousness/phi-monitor.js';
import { getCognitiveWorkspace } from './src/memory/cognitive-workspace.js';

async function testApplyImprovement() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('        GENESIS - APPLY SELF-IMPROVEMENT TEST                  ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 1. Initialize
  console.log('1. Initializing engines...');

  const improvementEngine = getSelfImprovementEngine({
    autoImprove: false,
    thresholds: {
      minPhi: 0.3,
      minMemoryReuse: 0.5,
      maxErrorRate: 0.05,
      maxSurprise: 3.0,
      minTaskSuccessRate: 0.9,
    },
  });

  const darwinGodel = getDarwinGodelEngine({
    genesisRoot: process.cwd(),
    sandboxDir: '/tmp/genesis-darwin-godel-test',
    gitEnabled: false, // Disable git for test
    skipTests: true,
    skipRuntimeCheck: true,
  });

  // Wire up monitors
  const phiMonitor = createPhiMonitor({ minPhi: 0.2, updateIntervalMs: 500 });
  phiMonitor.start();

  const workspace = getCognitiveWorkspace();
  improvementEngine.setPhiMonitor(phiMonitor);
  improvementEngine.setCognitiveWorkspace(workspace);

  // Register test metrics
  improvementEngine.registerMetricsCollector('test', () => ({
    avgResponseTime: 200,
    taskSuccessRate: 0.85,
    errorRate: 0.08,
    avgSurprise: 4.0,
  }));

  console.log('   ✓ Engines initialized\n');

  // 2. Collect metrics and find opportunities
  console.log('2. Collecting metrics and finding opportunities...');
  const metrics = improvementEngine.collectMetrics();
  const opportunities = improvementEngine.findOpportunities(metrics);

  console.log(`   Found ${opportunities.length} opportunities\n`);

  // 3. Find opportunity with suggestedFix
  const withFix = opportunities.filter(o => o.suggestedFix);

  if (withFix.length === 0) {
    console.log('   ⚠️ No opportunities with suggested fixes found');
    console.log('   Creating a manual improvement plan...\n');

    // Create a safe test modification
    const testPlan: ModificationPlan = {
      id: `test-improvement-${Date.now()}`,
      name: 'Add performance comment',
      description: 'Add a comment documenting current performance baseline',
      modifications: [{
        id: 'add-perf-comment',
        description: 'Add performance baseline comment',
        targetFile: 'active-inference/autonomous-loop.ts',
        type: 'replace',
        search: '// ============================================================================\n// Types',
        content: '// ============================================================================\n// Performance baseline: avgResponse=200ms, errorRate=8%, surprise=4.0\n// ============================================================================\n// Types',
        reason: 'Document current performance for tracking improvements',
        expectedImprovement: 'Better tracking of performance over time',
      }],
      createdAt: new Date(),
    };

    await applyPlan(darwinGodel, testPlan);
  } else {
    // Sort by priority
    withFix.sort((a, b) => b.priority - a.priority);
    const selected = withFix[0];

    console.log(`   Selected: [${selected.category.toUpperCase()}] ${selected.id}`);
    console.log(`   Priority: ${(selected.priority * 100).toFixed(0)}%`);
    console.log(`   Metric: ${selected.metric}`);
    console.log(`   Fix: ${selected.suggestedFix!.name}\n`);

    await applyPlan(darwinGodel, selected.suggestedFix!);
  }

  // Cleanup
  phiMonitor.stop();

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                    TEST COMPLETE                              ');
  console.log('═══════════════════════════════════════════════════════════════');
}

async function applyPlan(engine: ReturnType<typeof getDarwinGodelEngine>, plan: ModificationPlan) {
  console.log('3. Validating modification plan...');
  const validation = engine.validatePlan(plan);

  if (!validation.valid) {
    console.log('   ❌ Plan validation failed:');
    for (const err of validation.errors) {
      console.log(`      • ${err}`);
    }
    return;
  }
  console.log('   ✓ Plan is valid\n');

  console.log('4. Applying modification through Darwin-Gödel engine...');
  console.log('   Creating sandbox...');

  const startTime = Date.now();
  const result = await engine.apply(plan);
  const duration = Date.now() - startTime;

  console.log(`\n   ┌──────────────────────────────────────────────────────┐`);
  console.log(`   │ RESULT: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}                                    │`);
  console.log(`   ├──────────────────────────────────────────────────────┤`);
  console.log(`   │ Build:       ${result.verificaton.buildSuccess ? '✅ PASSED' : '❌ FAILED'}                              │`);
  console.log(`   │ Tests:       ${result.verificaton.testsSuccess ? '✅ PASSED' : '❌ FAILED'} (skipped)                     │`);
  console.log(`   │ Invariants:  ${result.verificaton.invariantsPass ? '✅ PASSED' : '❌ FAILED'}                              │`);
  console.log(`   │ Runtime:     ${result.verificaton.runtimeCheck ? '✅ PASSED' : '❌ FAILED'} (skipped)                     │`);
  console.log(`   ├──────────────────────────────────────────────────────┤`);
  console.log(`   │ Duration:    ${(duration / 1000).toFixed(1).padStart(8)}s                          │`);
  if (result.commitHash) {
    console.log(`   │ Commit:      ${result.commitHash.slice(0, 8).padStart(8)}                          │`);
  }
  if (result.rollbackHash) {
    console.log(`   │ Rollback:    ${result.rollbackHash.slice(0, 8).padStart(8)}                          │`);
  }
  console.log(`   └──────────────────────────────────────────────────────┘`);

  if (result.verificaton.errors.length > 0) {
    console.log('\n   Errors:');
    for (const err of result.verificaton.errors) {
      console.log(`      • ${err.slice(0, 80)}${err.length > 80 ? '...' : ''}`);
    }
  }

  if (result.success) {
    console.log('\n   ✅ Modification successfully applied to Genesis source!');
    console.log('   The code has been modified and rebuilt.');
  }
}

// Run
testApplyImprovement().catch(console.error);
