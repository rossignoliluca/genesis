#!/usr/bin/env npx tsx
/**
 * Genesis Self-Improvement Runner
 *
 * Usage:
 *   npx tsx run-self-improvement.ts [--auto] [--cycles N] [--quick]
 *
 * Options:
 *   --auto     Apply improvements automatically (default: manual approval)
 *   --cycles N Run N improvement cycles (default: 1)
 *   --push     Push changes to GitHub after improvements
 *   --quick    Apply a quick predefined improvement (skip analysis)
 */

import { getDarwinGodelEngine, ModificationPlan } from './src/self-modification/darwin-godel.js';
import { execSync } from 'child_process';
import * as readline from 'readline';

const args = process.argv.slice(2);
const AUTO_APPLY = args.includes('--auto');
const PUSH = args.includes('--push');
const QUICK = args.includes('--quick');
const cyclesIdx = args.indexOf('--cycles');
const CYCLES = cyclesIdx >= 0 ? parseInt(args[cyclesIdx + 1]) || 1 : 1;

// Quick improvements that match actual code
const QUICK_IMPROVEMENTS: ModificationPlan[] = [
  {
    id: 'improve-anticipation',
    name: 'Increase memory anticipation depth',
    description: 'Pre-load more memories for better context',
    modifications: [{
      id: 'anticipation-depth',
      description: 'Increase anticipationDepth from 5 to 7',
      targetFile: 'memory/cognitive-workspace.ts',
      type: 'replace',
      search: 'anticipationDepth: 5,',
      content: 'anticipationDepth: 7, // Self-improved: better context pre-loading',
      reason: 'More anticipation improves memory reuse',
      expectedImprovement: 'Memory reuse +20%',
    }],
    createdAt: new Date(),
  },
  {
    id: 'improve-decay-rate',
    name: 'Reduce memory decay rate',
    description: 'Keep memories active longer',
    modifications: [{
      id: 'decay-rate',
      description: 'Reduce decayRate from 0.01 to 0.005',
      targetFile: 'memory/cognitive-workspace.ts',
      type: 'replace',
      search: 'decayRate: 0.01,',
      content: 'decayRate: 0.005, // Self-improved: slower decay for persistence',
      reason: 'Slower decay keeps useful memories available longer',
      expectedImprovement: 'Memory retention +50%',
    }],
    createdAt: new Date(),
  },
];

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
  console.log(`Mode: ${QUICK ? 'QUICK' : AUTO_APPLY ? 'AUTOMATIC' : 'MANUAL APPROVAL'}`);
  console.log(`Push to GitHub: ${PUSH ? 'YES' : 'NO'}\n`);

  const darwinGodel = getDarwinGodelEngine({ gitEnabled: true, skipTests: true, skipRuntimeCheck: true });
  let totalApplied = 0;

  if (QUICK) {
    // Quick mode: apply predefined improvements
    console.log(`Found ${QUICK_IMPROVEMENTS.length} quick improvement(s):\n`);

    for (const plan of QUICK_IMPROVEMENTS) {
      console.log(`  [QUICK] ${plan.name}`);
      console.log(`    Target: ${plan.modifications[0]?.targetFile}`);
      console.log(`    Change: ${plan.modifications[0]?.description}`);
      console.log('');

      const shouldApply = await prompt(`  Apply this improvement?`);

      if (shouldApply) {
        console.log('  Applying via Darwin-Gödel...');
        const result = await darwinGodel.apply(plan);

        if (result.success) {
          console.log('  ✅ Applied successfully!');
          console.log(`     Commit: ${result.commitHash?.slice(0, 8)}`);
          totalApplied++;
        } else {
          console.log('  ❌ Failed:', result.verificaton.errors[0]?.slice(0, 60));
        }
      } else {
        console.log('  Skipped.');
      }
      console.log('');
    }
  } else {
    console.log('Use --quick for predefined improvements or implement full analysis.');
    console.log('Example: npx tsx run-self-improvement.ts --quick --auto');
  }

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
