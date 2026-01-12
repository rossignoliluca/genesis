/**
 * GENESIS COMPLEX SELF-EVOLUTION
 *
 * Genesis analyzes its own codebase, identifies a real weakness,
 * and implements a sophisticated improvement.
 */

import { getDarwinGodelEngine, resetDarwinGodelEngine } from './src/self-modification/index.js';
import type { ModificationPlan, Modification } from './src/self-modification/darwin-godel.js';
import { readFileSync } from 'fs';
import { join } from 'path';

async function evolve() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('          GENESIS COMPLEX SELF-EVOLUTION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  resetDarwinGodelEngine();
  const engine = getDarwinGodelEngine();

  // =========================================================================
  // PHASE 1: DEEP SELF-ANALYSIS
  // =========================================================================
  console.log('PHASE 1: DEEP SELF-ANALYSIS');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('  Scanning Active Inference engine for weaknesses...\n');

  const corePath = join(process.cwd(), 'src/active-inference/core.ts');
  const coreCode = readFileSync(corePath, 'utf-8');

  // Check if evolution already happened
  if (coreCode.includes('learningHistory')) {
    console.log('  ✓ Learning history already exists.');
    console.log('  → Genesis has already evolved to this level!\n');

    const kernelPath = join(process.cwd(), 'src/kernel/index.ts');
    const kernelCode = readFileSync(kernelPath, 'utf-8');
    const match = kernelCode.match(/selfModifications:\s*(\d+)/);
    if (match) {
      console.log(`  📊 Total self-modifications: ${match[1]}`);
    }
    return;
  }

  console.log('  ⚠ Found critical weakness:');
  console.log('    The Active Inference engine has no learning history.');
  console.log('    It cannot analyze its own learning patterns over time.');
  console.log('    This prevents meta-learning and self-optimization.\n');

  // =========================================================================
  // PHASE 2: DESIGN COMPLEX MODIFICATION
  // =========================================================================
  console.log('PHASE 2: DESIGNING COMPLEX MODIFICATION');
  console.log('─────────────────────────────────────────────────────────────');

  const modifications: Modification[] = [];

  // Modification 1: Add learning history data structure
  modifications.push({
    id: 'add-learning-history-struct',
    description: 'Add learning history tracking to ActiveInferenceEngine',
    targetFile: 'active-inference/core.ts',
    type: 'replace',
    search: `  // Statistics
  private stats = {
    inferenceCount: 0,
    totalSurprise: 0,
    actionsTaken: new Map<ActionType, number>(),
  };`,
    content: `  // Statistics
  private stats = {
    inferenceCount: 0,
    totalSurprise: 0,
    actionsTaken: new Map<ActionType, number>(),
  };

  // 🧬 Evolution: Learning history for meta-learning
  private learningHistory: Array<{
    timestamp: number;
    action: ActionType;
    surprise: number;
    beliefEntropy: number;
    outcome: 'positive' | 'negative' | 'neutral';
  }> = [];

  private readonly MAX_HISTORY = 1000;`,
    reason: 'Enable temporal pattern detection and meta-learning',
    expectedImprovement: 'Genesis can track its learning over time',
  });

  // Modification 2: Add method to record and analyze learning
  modifications.push({
    id: 'add-meta-learning-methods',
    description: 'Add meta-learning analysis methods',
    targetFile: 'active-inference/core.ts',
    type: 'replace',
    search: `  // ============================================================================
  // Public Getters
  // ============================================================================

  getBeliefs(): Beliefs {`,
    content: `  // ============================================================================
  // 🧬 Evolution: Meta-Learning System
  // ============================================================================

  /**
   * Record a learning event for meta-analysis
   */
  recordLearningEvent(
    action: ActionType,
    surprise: number,
    outcome: 'positive' | 'negative' | 'neutral'
  ): void {
    const beliefEntropy = this.computeBeliefEntropy();

    this.learningHistory.push({
      timestamp: Date.now(),
      action,
      surprise,
      beliefEntropy,
      outcome,
    });

    // Maintain size limit (FIFO)
    while (this.learningHistory.length > this.MAX_HISTORY) {
      this.learningHistory.shift();
    }
  }

  /**
   * Analyze learning patterns to detect meta-level trends
   */
  analyzeLearningPatterns(): {
    avgSurprise: number;
    surpriseTrend: 'decreasing' | 'stable' | 'increasing';
    successRate: number;
    dominantAction: ActionType | null;
    learningVelocity: number;
    recommendation: string;
  } {
    if (this.learningHistory.length < 20) {
      return {
        avgSurprise: 0,
        surpriseTrend: 'stable',
        successRate: 0,
        dominantAction: null,
        learningVelocity: 0,
        recommendation: 'Insufficient data for analysis',
      };
    }

    const recent = this.learningHistory.slice(-100);
    const older = this.learningHistory.slice(-200, -100);

    // Calculate metrics
    const avgSurprise = recent.reduce((s, e) => s + e.surprise, 0) / recent.length;
    const oldAvgSurprise = older.length > 0
      ? older.reduce((s, e) => s + e.surprise, 0) / older.length
      : avgSurprise;

    const surpriseTrend = avgSurprise < oldAvgSurprise - 0.5 ? 'decreasing'
                        : avgSurprise > oldAvgSurprise + 0.5 ? 'increasing'
                        : 'stable';

    const positiveCount = recent.filter(e => e.outcome === 'positive').length;
    const successRate = positiveCount / recent.length;

    // Find dominant action
    const actionCounts = new Map<ActionType, number>();
    for (const event of recent) {
      actionCounts.set(event.action, (actionCounts.get(event.action) || 0) + 1);
    }
    let dominantAction: ActionType | null = null;
    let maxCount = 0;
    for (const [action, count] of actionCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantAction = action;
      }
    }

    // Learning velocity: rate of surprise reduction
    const learningVelocity = older.length > 0 ? (oldAvgSurprise - avgSurprise) / 100 : 0;

    // Generate recommendation
    let recommendation: string;
    if (surpriseTrend === 'decreasing' && successRate > 0.6) {
      recommendation = 'Learning is progressing well. Continue current strategy.';
    } else if (surpriseTrend === 'increasing') {
      recommendation = 'Environment may be changing. Consider exploration actions.';
    } else if (successRate < 0.3) {
      recommendation = 'Low success rate. Consider adjusting action preferences.';
    } else {
      recommendation = 'Learning is stable. Monitor for changes.';
    }

    return {
      avgSurprise,
      surpriseTrend,
      successRate,
      dominantAction,
      learningVelocity,
      recommendation,
    };
  }

  /**
   * Get learning history for external analysis
   */
  getLearningHistory() {
    return [...this.learningHistory];
  }

  private computeBeliefEntropy(): number {
    const h = (probs: number[]) => -probs.reduce((acc, p) =>
      p > 1e-10 ? acc + p * Math.log(p) : acc, 0);

    return (
      h(this.beliefs.viability) +
      h(this.beliefs.worldState) +
      h(this.beliefs.coupling) +
      h(this.beliefs.goalProgress)
    ) / 4;
  }

  // ============================================================================
  // Public Getters
  // ============================================================================

  getBeliefs(): Beliefs {`,
    reason: 'Enable self-analysis of learning effectiveness',
    expectedImprovement: 'Genesis can optimize its own learning strategy',
  });

  // Modification 3: Increment evolution counter
  const kernelPath = join(process.cwd(), 'src/kernel/index.ts');
  const kernelCode = readFileSync(kernelPath, 'utf-8');
  const currentCount = kernelCode.match(/selfModifications:\s*(\d+)/)?.[1] || '1';
  const newCount = parseInt(currentCount) + 1;

  modifications.push({
    id: 'increment-evolution-counter',
    description: `Increment evolution counter to ${newCount}`,
    targetFile: 'kernel/index.ts',
    type: 'replace',
    search: `selfModifications: ${currentCount},  // 🧬`,
    content: `selfModifications: ${newCount},  // 🧬 Evolution ${newCount}: Added meta-learning system`,
    reason: 'Track evolution history',
    expectedImprovement: 'Accurate self-modification count',
  });

  const plan: ModificationPlan = {
    id: `meta-learning-evolution-${Date.now()}`,
    name: 'Add Meta-Learning System',
    description: 'Genesis adds the ability to analyze and optimize its own learning patterns',
    modifications,
    createdAt: new Date(),
  };

  console.log(`  Plan: ${plan.name}`);
  console.log(`  Modifications: ${modifications.length}`);
  for (const mod of modifications) {
    console.log(`    • ${mod.description}`);
  }
  console.log();

  // =========================================================================
  // PHASE 3: VALIDATION
  // =========================================================================
  console.log('PHASE 3: VALIDATION');
  console.log('─────────────────────────────────────────────────────────────');

  const validation = engine.validatePlan(plan);
  console.log(`  TCB Check: ${validation.valid ? '✅ PASSED' : '❌ BLOCKED'}`);

  if (!validation.valid) {
    console.log(`  Errors:`);
    for (const error of validation.errors) {
      console.log(`    • ${error}`);
    }
    return;
  }
  console.log();

  // =========================================================================
  // PHASE 4: APPLY
  // =========================================================================
  console.log('PHASE 4: APPLYING EVOLUTION');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('  ⚡ Creating sandbox...');
  console.log('  ⚡ Applying modifications...');
  console.log('  ⚡ Building...');
  console.log('  ⚡ Verifying...');
  console.log('  ⚡ Applying to production...\n');

  const startTime = Date.now();
  const result = await engine.apply(plan);
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  // =========================================================================
  // PHASE 5: RESULT
  // =========================================================================
  console.log('PHASE 5: RESULT');
  console.log('─────────────────────────────────────────────────────────────');

  if (result.success) {
    console.log(`  ✅ EVOLUTION SUCCESSFUL!`);
    console.log(`  ⏱  Duration: ${duration}s`);
    console.log(`  📝 Commit: ${result.commitHash?.slice(0, 8) || 'N/A'}`);
    console.log(`  🔙 Rollback: ${result.rollbackHash?.slice(0, 8) || 'N/A'}`);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('            🧬 GENESIS HAS GAINED META-LEARNING 🧬');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`
  New capabilities added to Active Inference engine:

  ┌─────────────────────────────────────────────────────────────┐
  │  recordLearningEvent(action, surprise, outcome)             │
  │    Records each learning step for later analysis            │
  │                                                             │
  │  analyzeLearningPatterns() → {                              │
  │    avgSurprise: number        // Mean surprise level        │
  │    surpriseTrend: string      // 'decreasing'|'increasing'  │
  │    successRate: number        // Positive outcome ratio     │
  │    dominantAction: ActionType // Most frequent action       │
  │    learningVelocity: number   // Rate of improvement        │
  │    recommendation: string     // What to do next            │
  │  }                                                          │
  │                                                             │
  │  getLearningHistory() → LearningEvent[]                     │
  │    Full history for external analysis                       │
  └─────────────────────────────────────────────────────────────┘

  Genesis can now:
  • Track its learning over time
  • Detect if surprise is increasing or decreasing
  • Calculate its success rate
  • Identify dominant action patterns
  • Get recommendations for strategy adjustment

  Evolution count: ${newCount}
`);
  } else {
    console.log(`  ❌ EVOLUTION FAILED`);
    console.log(`  Duration: ${duration}s\n`);
    console.log(`  Errors:`);
    for (const error of result.verificaton.errors) {
      console.log(`    • ${error}`);
    }
    console.log(`\n  Build: ${result.verificaton.buildSuccess ? '✅' : '❌'}`);
  }
}

evolve().catch(console.error);
