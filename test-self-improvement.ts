/**
 * Test Self-Improvement Cycle
 */

import {
  getSelfImprovementEngine,
  SystemMetrics,
  ImprovementOpportunity,
} from './src/self-modification/index.js';
import { createPhiMonitor } from './src/consciousness/phi-monitor.js';
import { getCognitiveWorkspace } from './src/memory/cognitive-workspace.js';

async function testSelfImprovement() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('           GENESIS SELF-IMPROVEMENT CYCLE TEST                 ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 1. Initialize engine
  console.log('1. Initializing Self-Improvement Engine...');
  const engine = getSelfImprovementEngine({
    autoImprove: false, // Manual mode for testing
    thresholds: {
      minPhi: 0.3,
      minMemoryReuse: 0.5,
      maxErrorRate: 0.05,
      maxSurprise: 3.0,
      minTaskSuccessRate: 0.9,
    },
  });

  // Wire up monitors
  const phiMonitor = createPhiMonitor({
    minPhi: 0.2,
    updateIntervalMs: 1000,
  });
  phiMonitor.start();

  const workspace = getCognitiveWorkspace();

  engine.setPhiMonitor(phiMonitor);
  engine.setCognitiveWorkspace(workspace);

  // Register custom metrics collector for testing
  engine.registerMetricsCollector('test', () => ({
    avgResponseTime: 150,
    taskSuccessRate: 0.85, // Below threshold to trigger opportunity
    errorRate: 0.08,       // Above threshold to trigger opportunity
    avgSurprise: 4.5,      // Above threshold to trigger opportunity
  }));

  console.log('   ✓ Engine initialized\n');

  // 2. Collect metrics
  console.log('2. Collecting System Metrics...');
  const metrics = engine.collectMetrics();

  console.log('\n   Current Metrics:');
  console.log('   ┌──────────────────────────────────────────────────────┐');
  console.log(`   │ φ (consciousness):     ${metrics.phi.toFixed(3).padStart(8)}                  │`);
  console.log(`   │ Consciousness state:   ${metrics.consciousnessState.padStart(8)}                  │`);
  console.log(`   │ φ trend:               ${metrics.phiTrend.padStart(8)}                  │`);
  console.log('   ├──────────────────────────────────────────────────────┤');
  console.log(`   │ Memory reuse:          ${(metrics.memoryReuse * 100).toFixed(1).padStart(7)}%                  │`);
  console.log(`   │ Cache hit rate:        ${(metrics.cacheHitRate * 100).toFixed(1).padStart(7)}%                  │`);
  console.log(`   │ Memory size:           ${metrics.memorySize.toString().padStart(8)} tokens           │`);
  console.log('   ├──────────────────────────────────────────────────────┤');
  console.log(`   │ Avg response time:     ${metrics.avgResponseTime.toString().padStart(8)} ms               │`);
  console.log(`   │ Task success rate:     ${(metrics.taskSuccessRate * 100).toFixed(1).padStart(7)}%                  │`);
  console.log(`   │ Error rate:            ${(metrics.errorRate * 100).toFixed(1).padStart(7)}%                  │`);
  console.log('   ├──────────────────────────────────────────────────────┤');
  console.log(`   │ Avg surprise (FE):     ${metrics.avgSurprise.toFixed(2).padStart(8)}                  │`);
  console.log(`   │ Expected Free Energy:  ${metrics.expectedFreeEnergy.toFixed(2).padStart(8)}                  │`);
  console.log('   ├──────────────────────────────────────────────────────┤');
  console.log(`   │ Uptime:                ${(metrics.uptime / 1000).toFixed(1).padStart(8)} s               │`);
  console.log(`   │ Cycles completed:      ${metrics.cyclesCompleted.toString().padStart(8)}                  │`);
  console.log('   └──────────────────────────────────────────────────────┘\n');

  // 3. Find improvement opportunities
  console.log('3. Finding Improvement Opportunities...');
  const opportunities = engine.findOpportunities(metrics);

  if (opportunities.length === 0) {
    console.log('   ✓ No improvement opportunities found - system is optimal!\n');
  } else {
    console.log(`\n   Found ${opportunities.length} opportunity(ies):\n`);

    for (const opp of opportunities) {
      const hasFixIcon = opp.suggestedFix ? '🔧' : '⚠️';
      console.log(`   ${hasFixIcon} [${opp.category.toUpperCase()}] ${opp.id}`);
      console.log(`      Priority: ${(opp.priority * 100).toFixed(0)}%`);
      console.log(`      Metric: ${opp.metric}`);
      console.log(`      Current: ${typeof opp.currentValue === 'number' ? opp.currentValue.toFixed(3) : opp.currentValue}`);
      console.log(`      Target:  ${typeof opp.targetValue === 'number' ? opp.targetValue.toFixed(3) : opp.targetValue}`);
      console.log(`      ${opp.description}`);
      if (opp.suggestedFix) {
        console.log(`      Fix: ${opp.suggestedFix.name}`);
        for (const mod of opp.suggestedFix.modifications) {
          console.log(`        → ${mod.targetFile}: ${mod.type}`);
          console.log(`          Reason: ${mod.reason}`);
          console.log(`          Expected: ${mod.expectedImprovement}`);
        }
      }
      console.log('');
    }
  }

  // 4. Run full cycle (without auto-apply)
  console.log('4. Running Full Self-Improvement Cycle...');
  console.log('   (Auto-apply disabled for safety)\n');

  const cycleResult = await engine.runCycle();

  console.log('   Cycle Results:');
  console.log('   ┌──────────────────────────────────────────────────────┐');
  console.log(`   │ Opportunities found:   ${cycleResult.opportunities.length.toString().padStart(8)}                  │`);
  console.log(`   │ Improvements applied:  ${cycleResult.results.length.toString().padStart(8)}                  │`);
  console.log('   └──────────────────────────────────────────────────────┘\n');

  // 5. Show stats
  console.log('5. Engine Statistics:');
  const stats = engine.stats();
  console.log('   ┌──────────────────────────────────────────────────────┐');
  console.log(`   │ Total attempts:        ${stats.totalAttempts.toString().padStart(8)}                  │`);
  console.log(`   │ Successful:            ${stats.successfulImprovements.toString().padStart(8)}                  │`);
  console.log(`   │ Failed:                ${stats.failedImprovements.toString().padStart(8)}                  │`);
  console.log(`   │ Success rate:          ${(stats.successRate * 100).toFixed(1).padStart(7)}%                  │`);
  console.log('   └──────────────────────────────────────────────────────┘\n');

  // 6. Test with auto-improve enabled (simulated)
  console.log('6. Simulating Auto-Improvement Mode...');
  console.log('   (Would apply fixes automatically if enabled)\n');

  const config = engine.getConfig();
  console.log('   Current Configuration:');
  console.log(`   • Auto-improve: ${config.autoImprove ? 'ENABLED' : 'DISABLED'}`);
  console.log(`   • Min φ for improvement: ${config.minPhiForImprovement}`);
  console.log(`   • Max improvements/cycle: ${config.maxImprovementsPerCycle}`);
  console.log(`   • Cooldown: ${config.improvementCooldownMs}ms`);
  console.log('');

  // Cleanup
  phiMonitor.stop();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    TEST COMPLETE                              ');
  console.log('═══════════════════════════════════════════════════════════════');
}

// Run test
testSelfImprovement().catch(console.error);
