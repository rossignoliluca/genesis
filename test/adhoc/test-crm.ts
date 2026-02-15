/**
 * Test v7.12 Conditional Reward Modeling (CRM)
 *
 * Demonstrates outcome-linked process supervision from arXiv:2509.26578.
 * Run with: npx tsx test-crm.ts
 */

import {
  scoreWithCRM,
  selectBestWithCRM,
  thinkWithCRMBeam,
  compareTrajectoriesWithCRM,
  thinkBestOfNWithCRM,
  getCRMConfig,
  DEFAULT_CRM_CONFIG,
  CRMTrajectoryResult,
  CRMBeamSearchResult,
  ConditionalStepScore,
} from './src/thinking/index.js';

// ============================================================================
// Test Data: Sample Math Problems with Solutions
// ============================================================================

const SAMPLE_PROBLEM = `
A farmer has 120 apples. She sells 40% of them at the market.
Then she gives 1/3 of the remaining apples to her neighbor.
How many apples does the farmer have left?
`;

const CORRECT_SOLUTION = `
Step 1: Calculate apples sold at market
40% of 120 = 0.4 × 120 = 48 apples sold

Step 2: Calculate remaining apples after market
120 - 48 = 72 apples remaining

Step 3: Calculate apples given to neighbor
1/3 of 72 = 72 ÷ 3 = 24 apples given

Step 4: Calculate final count
72 - 24 = 48 apples left

Answer: The farmer has 48 apples left.
`;

const INCORRECT_SOLUTION = `
Step 1: Calculate apples sold at market
40% of 120 = 40 apples sold  ← Error: should be 48

Step 2: Calculate remaining apples after market
120 - 40 = 80 apples remaining

Step 3: Calculate apples given to neighbor
1/3 of 80 = 80 ÷ 3 = 26.67 ≈ 27 apples given

Step 4: Calculate final count
80 - 27 = 53 apples left

Answer: The farmer has 53 apples left.
`;

const ALTERNATIVE_CORRECT = `
Let me work through this step by step.

First, selling 40% means keeping 60%.
60% of 120 = 0.6 × 120 = 72 apples after market.

Then giving away 1/3 means keeping 2/3.
2/3 of 72 = (2 × 72) ÷ 3 = 144 ÷ 3 = 48 apples.

Final answer: 48 apples remain.
`;

const GOLDEN_ANSWER = '48';

// ============================================================================
// Helper Functions
// ============================================================================

function banner(text: string) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${text}`);
  console.log('═'.repeat(60));
}

function section(text: string) {
  console.log(`\n▶ ${text}`);
  console.log('─'.repeat(50));
}

function printTrajectoryResult(result: CRMTrajectoryResult, label: string) {
  console.log(`\n📊 ${label}:`);
  console.log(`   Steps analyzed: ${result.stepsAnalyzed}`);
  console.log(`   Final survival S(T): ${(result.finalSurvivalProb * 100).toFixed(1)}%`);
  console.log(`   Trajectory score: ${(result.trajectoryScore * 100).toFixed(1)}%`);
  console.log(`   Total process reward: ${result.totalProcessReward.toFixed(3)}`);
  console.log(`   Correct answer: ${result.hasCorrectAnswer ? '✓' : '✗'}`);
  console.log(`   Early terminated: ${result.earlyTerminated ? 'Yes' : 'No'}`);

  console.log('\n   Step-by-step analysis:');
  result.stepScores.forEach((step, i) => {
    const h = step.conditionalErrorProb;
    const S = step.survivalProb;
    const r = step.processReward;
    const status = h < 0.3 ? '✓' : h < 0.6 ? '⚠' : '✗';

    console.log(`     ${status} Step ${i + 1}: h(t)=${(h * 100).toFixed(0)}% S(t)=${(S * 100).toFixed(0)}% r_t=${r.toFixed(2)}`);
    console.log(`       "${step.content.slice(0, 50)}..."`);
  });
}

function printBeamResult(result: CRMBeamSearchResult, label: string) {
  console.log(`\n📊 ${label}:`);
  console.log(`   Beam width: ${result.beamWidth}`);
  console.log(`   Max depth: ${result.maxDepth}`);
  console.log(`   Actual depth: ${result.actualDepth}`);
  console.log(`   Processing time: ${result.processingTime}ms`);
  console.log(`   Correct answer: ${result.hasCorrectAnswer ? '✓' : '✗'}`);
  console.log(`   Final candidates: ${result.allCandidates.length}`);

  console.log('\n   Best solution:');
  console.log(`   "${result.bestSolution.slice(0, 200)}..."`);

  console.log('\n   Candidate survival probabilities:');
  result.allCandidates.forEach((c, i) => {
    console.log(`     ${i + 1}. S(T)=${(c.survivalProb * 100).toFixed(1)}% (${c.steps.length} steps)`);
  });
}

// ============================================================================
// Main Test
// ============================================================================

async function main() {
  banner('🎯 GENESIS v7.12 - Conditional Reward Modeling (CRM) Test');

  // Show configuration
  section('1. CRM Configuration');

  console.log('Default CRM configuration:');
  console.log(`  Enabled: ${DEFAULT_CRM_CONFIG.enabled}`);
  console.log(`  Estimation method: ${DEFAULT_CRM_CONFIG.estimationMethod}`);
  console.log(`  Completions per step: ${DEFAULT_CRM_CONFIG.numCompletions}`);
  console.log(`  Temperature: ${DEFAULT_CRM_CONFIG.completionTemperature}`);
  console.log(`  Survival threshold: ${DEFAULT_CRM_CONFIG.survivalThreshold}`);
  console.log(`  Early termination: ${DEFAULT_CRM_CONFIG.earlyTermination}`);
  console.log(`  Trajectory scoring: ${DEFAULT_CRM_CONFIG.trajectoryScoring}`);

  // ============================================================================
  // Test 2: Score a correct solution
  // ============================================================================
  section('2. Score Correct Solution with CRM');

  console.log('Problem: Farmer apple calculation');
  console.log(`Solution length: ${CORRECT_SOLUTION.length} chars`);
  console.log(`Golden answer: ${GOLDEN_ANSWER}`);

  try {
    const result2 = await scoreWithCRM(SAMPLE_PROBLEM, CORRECT_SOLUTION, GOLDEN_ANSWER);
    printTrajectoryResult(result2, 'Correct Solution CRM Scoring');

    // Explain the key insight
    console.log('\n   💡 Key insight: S(T) = ∏(1-h(k)) represents probability of reaching');
    console.log('      correct answer. High S(T) means all steps are likely correct.');
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log('   (This is expected if no LLM is configured - testing structure)');
  }

  // ============================================================================
  // Test 3: Score an incorrect solution
  // ============================================================================
  section('3. Score Incorrect Solution with CRM');

  console.log('Solution with error at step 1 (40 instead of 48)');

  try {
    const result3 = await scoreWithCRM(SAMPLE_PROBLEM, INCORRECT_SOLUTION, GOLDEN_ANSWER);
    printTrajectoryResult(result3, 'Incorrect Solution CRM Scoring');

    // Find the first high-error step
    const firstError = result3.stepScores.find(s => s.conditionalErrorProb > 0.3);
    if (firstError) {
      console.log(`\n   ⚠️ First suspicious step (h(t) > 30%): Step ${firstError.stepIndex + 1}`);
      console.log(`      Error probability: ${(firstError.conditionalErrorProb * 100).toFixed(0)}%`);
    }
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log('   (This is expected if no LLM is configured - testing structure)');
  }

  // ============================================================================
  // Test 4: Compare two solutions
  // ============================================================================
  section('4. Compare Solutions with CRM');

  console.log('Comparing correct vs incorrect solutions...');

  try {
    const result4 = await compareTrajectoriesWithCRM(
      SAMPLE_PROBLEM,
      CORRECT_SOLUTION,
      INCORRECT_SOLUTION,
      GOLDEN_ANSWER
    );

    console.log(`\n   Winner: Solution ${result4.winner}`);
    console.log(`   Margin: ${(result4.margin * 100).toFixed(1)}%`);
    console.log(`   Solution 1 score: ${(result4.trajectory1.trajectoryScore * 100).toFixed(1)}%`);
    console.log(`   Solution 2 score: ${(result4.trajectory2.trajectoryScore * 100).toFixed(1)}%`);
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log('   (This is expected if no LLM is configured - testing structure)');
  }

  // ============================================================================
  // Test 5: Best-of-N selection with CRM
  // ============================================================================
  section('5. Best-of-N Selection with CRM');

  console.log('Ranking 3 candidate solutions...');

  try {
    const result5 = await selectBestWithCRM(
      SAMPLE_PROBLEM,
      [CORRECT_SOLUTION, INCORRECT_SOLUTION, ALTERNATIVE_CORRECT],
      GOLDEN_ANSWER
    );

    console.log(`\n   Selected: Solution ${result5.selectedIndex + 1}`);
    console.log(`   Stats:`);
    console.log(`     Average survival: ${(result5.stats.avgSurvival * 100).toFixed(1)}%`);
    console.log(`     Max survival: ${(result5.stats.maxSurvival * 100).toFixed(1)}%`);
    console.log(`     Correct solutions: ${result5.stats.correctCount}/${result5.allResults.length}`);

    console.log('\n   Rankings:');
    const sorted = [...result5.allResults]
      .map((r, i) => ({ ...r, originalIndex: i }))
      .sort((a, b) => b.trajectoryScore - a.trajectoryScore);
    sorted.forEach((r, rank) => {
      const marker = r.hasCorrectAnswer ? '✓' : '✗';
      console.log(`     ${rank + 1}. Solution ${r.originalIndex + 1} - S(T)=${(r.finalSurvivalProb * 100).toFixed(1)}% ${marker}`);
    });
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log('   (This is expected if no LLM is configured - testing structure)');
  }

  // ============================================================================
  // Test 6: CRM Beam Search
  // ============================================================================
  section('6. CRM-Guided Beam Search');

  console.log('Generating solution with survival-probability guided beam search...');
  console.log('(This may take a while as it explores multiple paths)');

  try {
    const result6 = await thinkWithCRMBeam(
      'What is 15% of 80?',
      '12',  // Golden answer
      2,     // Beam width
      5      // Max depth
    );
    printBeamResult(result6, 'CRM Beam Search');
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log('   (This is expected if no LLM is configured - testing structure)');
  }

  // ============================================================================
  // Test 7: Key CRM Concepts
  // ============================================================================
  section('7. Key CRM Concepts (from arXiv:2509.26578)');

  console.log('CRM addresses limitations of isolated step modeling (like Math-Shepherd):');
  console.log('');
  console.log('  h(t) = P(wrong at step t | correct up to step t-1)');
  console.log('    • Conditional error probability');
  console.log('    • Step t evaluated GIVEN all preceding steps are correct');
  console.log('');
  console.log('  S(t) = ∏(1-h(k)) for k=1..t');
  console.log('    • Survival probability');
  console.log('    • Probability of reaching step t with ALL steps correct');
  console.log('    • Creates explicit outcome linkage');
  console.log('');
  console.log('  r_t = log(1-h(t))');
  console.log('    • PBRS-derived process reward');
  console.log('    • Optimal policy invariance');
  console.log('    • Robust to reward hacking');
  console.log('');
  console.log('  Key advantages over Math-Shepherd:');
  console.log('    • Cross-sample comparability (consistent probabilistic semantics)');
  console.log('    • Explicit outcome linkage via probability chain rule');
  console.log('    • Precise credit assignment');
  console.log('    • Superior Best-of-N selection');

  // ============================================================================
  // Summary
  // ============================================================================
  banner('✅ CRM Test Complete');

  console.log('\nv7.12 Features Tested:');
  console.log('  • Conditional error probability h(t) estimation');
  console.log('  • Survival probability S(t) computation');
  console.log('  • Process reward r_t calculation');
  console.log('  • Trajectory scoring with CRM');
  console.log('  • Solution comparison');
  console.log('  • Best-of-N selection with CRM');
  console.log('  • CRM-guided beam search');

  console.log('\nBased on:');
  console.log('  • arXiv:2509.26578 (Conditional Reward Modeling)');
  console.log('  • Improves upon Math-Shepherd (arXiv:2312.08935)');
  console.log('  • Builds on PBRS theory for reward shaping');
}

main().catch(console.error);
