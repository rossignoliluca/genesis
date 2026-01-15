#!/usr/bin/env npx tsx
/**
 * Genesis Self-Improvement Runner
 *
 * Usage:
 *   npx tsx run-self-improvement.ts [--auto] [--cycles N]
 *
 * Options:
 *   --auto     Apply improvements automatically (default: manual approval)
 *   --cycles N Run N improvement cycles (default: 1)
 *   --push     Push changes to GitHub after improvements
 */

import { getSelfImprovementEngine } from './src/self-modification/index.js';
import { getDarwinGodelEngine } from './src/self-modification/darwin-godel.js';
import { createPhiMonitor } from './src/consciousness/phi-monitor.js';
import { getCognitiveWorkspace } from './src/memory/cognitive-workspace.js';
import { execSync } from 'child_process';
import * as readline from 'readline';

const args = process.argv.slice(2);
const AUTO_APPLY = args.includes('--auto');
const PUSH = args.includes('--push');
const cyclesIdx = args.indexOf('--cycles');
const CYCLES = cyclesIdx >= 0 ? parseInt(args[cyclesIdx + 1]) || 1 : 1;

async function prompt(question: string): Promise<boolean> {
  if (AUTO_APPLY) return true;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question + ' (y/n): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('              GENESIS SELF-IMPROVEMENT RUNNER                  ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Mode: ${AUTO_APPLY ? 'AUTOMATIC' : 'MANUAL APPROVAL'}`);
  console.log(`Cycles: ${CYCLES}`);
  console.log(`Push to GitHub: ${PUSH ? 'YES' : 'NO'}\n`);

  // Initialize
  const engine = getSelfImprovementEngine({ autoImprove: false });
  const darwinGodel = getDarwinGodelEngine({ gitEnabled: true, skipTests: true, skipRuntimeCheck: true });
  const phi = createPhiMonitor({ minPhi: 0.2 });
  phi.start();

  engine.setPhiMonitor(phi);
  engine.setCognitiveWorkspace(getCognitiveWorkspace());

  let totalApplied = 0;

  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    console.log(`\n─── Cycle ${cycle}/${CYCLES} ───────────────────────────────────────────\n`);

    // Collect metrics
    const metrics = engine.collectMetrics();
    console.log(`φ: ${metrics.phi.toFixed(3)} | Memory Reuse: ${(metrics.memoryReuse * 100).toFixed(1)}%`);

    // Find opportunities
    const opportunities = engine.findOpportunities(metrics);
    const withFix = opportunities.filter(o => o.suggestedFix);

    if (withFix.length === 0) {
      console.log('✓ No improvement opportunities with fixes found.');
      continue;
    }

    console.log(`\nFound ${withFix.length} improvement(s):\n`);

    for (const opp of withFix) {
      console.log(`  [${opp.category.toUpperCase()}] ${opp.id}`);
      console.log(`    Priority: ${(opp.priority * 100).toFixed(0)}%`);
      console.log(`    Fix: ${opp.suggestedFix!.name}`);
      console.log(`    Target: ${opp.suggestedFix!.modifications[0]?.targetFile}`);
      console.log('');

      const shouldApply = await prompt(`  Apply this improvement?`);

      if (shouldApply) {
        console.log('  Applying...');
        const result = await darwinGodel.apply(opp.suggestedFix!);

        if (result.success) {
          console.log('  ✅ Applied successfully!');
          console.log(`     Commit: ${result.commitHash?.slice(0, 8)}`);
          totalApplied++;
        } else {
          console.log('  ❌ Failed:', result.verificaton.errors[0]?.slice(0, 50));
        }
      } else {
        console.log('  Skipped.');
      }
    }
  }

  phi.stop();

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`Total improvements applied: ${totalApplied}`);

  if (PUSH && totalApplied > 0) {
    console.log('\nPushing to GitHub...');
    try {
      execSync('git push origin main', { stdio: 'inherit' });
      console.log('✅ Pushed successfully!');
    } catch (e) {
      console.log('❌ Push failed');
    }
  }

  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
