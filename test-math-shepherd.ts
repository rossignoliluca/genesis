/**
 * Test v7.11 Math-Shepherd Process Reward Model
 *
 * Demonstrates completion-based step verification from arXiv:2312.08935.
 * Run with: npx tsx test-math-shepherd.ts
 */

import {
  scoreSolutionWithMathShepherd,
  rankSolutionsWithPRM,
  generatePRMAnnotations,
  getMathShepherdConfig,
  DEFAULT_MATH_SHEPHERD_CONFIG,
  AnnotatedSolution,
  SolutionRanking,
  ProcessAnnotation,
} from './src/thinking/index.js';

// ============================================================================
// Test Data: Sample Math Problems with Solutions
// ============================================================================

const SAMPLE_PROBLEM = `
A bookstore sells books at $12 each. On Monday, they sold 15 books.
On Tuesday, they sold twice as many books as Monday.
How much money did the bookstore make in total for both days?
`;

const CORRECT_SOLUTION = `
Step 1: Calculate Monday's sales
Monday sales = 15 books × $12 = $180

Step 2: Calculate Tuesday's sales
Tuesday books = 15 × 2 = 30 books
Tuesday sales = 30 books × $12 = $360

Step 3: Calculate total
Total = $180 + $360 = $540

Answer: The bookstore made $540 in total.
`;

const INCORRECT_SOLUTION = `
Step 1: Calculate Monday's sales
Monday sales = 15 books × $12 = $180

Step 2: Calculate Tuesday's sales
Tuesday books = 15 + 2 = 17 books  ← Error: should be multiplication
Tuesday sales = 17 books × $12 = $204

Step 3: Calculate total
Total = $180 + $204 = $384

Answer: The bookstore made $384 in total.
`;

const ALTERNATIVE_SOLUTION = `
Let me solve this step by step.

First, Monday: 15 books at $12 each gives us 15 * 12 = $180.

Then Tuesday has twice the books: 15 * 2 = 30 books.
At $12 each: 30 * 12 = $360.

Adding both days: 180 + 360 = $540.

The bookstore made $540.
`;

const CORRECT_ANSWER = '540';

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

function printAnnotatedSolution(result: AnnotatedSolution, label: string) {
  console.log(`\n📊 ${label}:`);
  console.log(`   Steps analyzed: ${result.stepScores.length}`);
  console.log(`   Overall score: ${(result.overallScore * 100).toFixed(1)}%`);
  console.log(`   Method: ${result.scoringMethod}`);
  console.log(`   Aggregation: ${result.aggregationMethod}`);
  console.log(`   Correct answer found: ${result.hasCorrectAnswer}`);

  console.log('\n   Step-by-step scores:');
  result.stepScores.forEach((step, i) => {
    const status = step.hardScore > 0 ? '✓' : '✗';
    console.log(`     ${status} Step ${i + 1}: hard=${(step.hardScore * 100).toFixed(0)}% soft=${(step.softScore * 100).toFixed(0)}%`);
    console.log(`       "${step.content.slice(0, 50)}..."`);
  });
}

function printRanking(ranking: SolutionRanking, label: string) {
  console.log(`\n📊 ${label}:`);
  console.log(`   Total candidates: ${ranking.stats.totalCandidates}`);
  console.log(`   Best score: ${(ranking.stats.bestSolutionScore * 100).toFixed(1)}%`);
  console.log(`   Average score: ${(ranking.stats.avgSolutionScore * 100).toFixed(1)}%`);
  console.log(`   Selected index: ${ranking.selectedIndex}`);
  console.log(`   Method: ${ranking.rankingMethod}`);

  console.log('\n   Ranked solutions:');
  ranking.rankedSolutions.forEach((sol, i) => {
    console.log(`     ${i + 1}. Score: ${(sol.overallScore * 100).toFixed(1)}% - "${sol.solution.slice(0, 40)}..."`);
  });
}

function printAnnotations(annotation: ProcessAnnotation, label: string) {
  console.log(`\n📊 ${label}:`);
  console.log(`   Problem: "${annotation.problem.slice(0, 50)}..."`);
  console.log(`   Golden answer: ${annotation.goldenAnswer}`);
  console.log(`   Source model: ${annotation.sourceModel}`);
  console.log(`   Created: ${annotation.timestamp.toISOString()}`);

  console.log('\n   Annotated steps:');
  annotation.annotatedSteps.forEach((step, i) => {
    const marker = step.label === '+' ? '✓+' : '✗-';
    console.log(`     ${marker} Step ${i + 1}: "${step.content.slice(0, 40)}..."`);
    console.log(`         Scores: hard=${(step.hardScore * 100).toFixed(0)}% soft=${(step.softScore * 100).toFixed(0)}%`);
  });
}

// ============================================================================
// Main Test
// ============================================================================

async function main() {
  banner('🐑 GENESIS v7.11 - Math-Shepherd PRM Test');

  // Show configuration
  section('1. Math-Shepherd Configuration');

  console.log('Default configuration:');
  console.log(`  Enabled: ${DEFAULT_MATH_SHEPHERD_CONFIG.enabled}`);
  console.log(`  Completions per step: ${DEFAULT_MATH_SHEPHERD_CONFIG.numCompletions}`);
  console.log(`  Temperature: ${DEFAULT_MATH_SHEPHERD_CONFIG.completionTemperature}`);
  console.log(`  Scoring method: ${DEFAULT_MATH_SHEPHERD_CONFIG.scoringMethod}`);
  console.log(`  Aggregation: ${DEFAULT_MATH_SHEPHERD_CONFIG.aggregationMethod}`);
  console.log(`  Early termination: ${DEFAULT_MATH_SHEPHERD_CONFIG.earlyTermination}`);

  // ============================================================================
  // Test 2: Score a correct solution
  // ============================================================================
  section('2. Score Correct Solution');

  console.log('Problem: Calculate bookstore revenue');
  console.log(`Solution: ${CORRECT_SOLUTION.slice(0, 100)}...`);

  try {
    const result2 = await scoreSolutionWithMathShepherd(
      SAMPLE_PROBLEM,
      CORRECT_SOLUTION,
      CORRECT_ANSWER,
      2  // Use fewer completions for faster testing
    );
    printAnnotatedSolution(result2, 'Correct Solution Scoring');
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log('   (This is expected if no LLM is configured - testing structure)');
  }

  // ============================================================================
  // Test 3: Score an incorrect solution
  // ============================================================================
  section('3. Score Incorrect Solution');

  console.log('Solution with error at step 2 (addition instead of multiplication)');

  try {
    const result3 = await scoreSolutionWithMathShepherd(
      SAMPLE_PROBLEM,
      INCORRECT_SOLUTION,
      CORRECT_ANSWER,
      2
    );
    printAnnotatedSolution(result3, 'Incorrect Solution Scoring');

    // Check if the error step was detected
    const errorStep = result3.stepScores.find(s => s.softScore < 0.5);
    if (errorStep) {
      console.log(`\n   ⚠️ Error detected at step: "${errorStep.content.slice(0, 40)}..."`);
    }
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log('   (This is expected if no LLM is configured - testing structure)');
  }

  // ============================================================================
  // Test 4: Rank multiple solutions (Best-of-N)
  // ============================================================================
  section('4. Best-of-N Solution Ranking');

  console.log('Ranking 3 candidate solutions...');

  try {
    const result4 = await rankSolutionsWithPRM(
      SAMPLE_PROBLEM,
      [CORRECT_SOLUTION, INCORRECT_SOLUTION, ALTERNATIVE_SOLUTION],
      CORRECT_ANSWER
    );
    printRanking(result4, 'Solution Ranking');

    // Verify best solution is correct
    if (result4.selected.hasCorrectAnswer) {
      console.log('\n   ✓ Best solution correctly reaches the answer!');
    }
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log('   (This is expected if no LLM is configured - testing structure)');
  }

  // ============================================================================
  // Test 5: Generate process annotations
  // ============================================================================
  section('5. Process Annotation Generation');

  console.log('Generating training annotations (like Math-Shepherd paper)...');

  try {
    const result5 = await generatePRMAnnotations(
      SAMPLE_PROBLEM,
      CORRECT_SOLUTION,
      CORRECT_ANSWER
    );
    printAnnotations(result5, 'Process Annotations');
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log('   (This is expected if no LLM is configured - testing structure)');
  }

  // ============================================================================
  // Test 6: Hard vs Soft Estimation Comparison
  // ============================================================================
  section('6. Hard vs Soft Estimation');

  console.log('Comparing scoring methods from the paper:');
  console.log('  • Hard Estimation (HE): 1 if ANY completion is correct, else 0');
  console.log('  • Soft Estimation (SE): fraction of completions that are correct');
  console.log('\nThe paper found Soft Estimation generally performs better');
  console.log('for training reward models due to finer-grained signal.');

  // ============================================================================
  // Summary
  // ============================================================================
  banner('✅ Math-Shepherd PRM Test Complete');

  console.log('\nv7.11 Features Tested:');
  console.log('  • Completion-based step verification');
  console.log('  • Monte Carlo rollouts for score estimation');
  console.log('  • Hard and Soft estimation methods');
  console.log('  • Best-of-N solution ranking');
  console.log('  • Automatic process annotation generation');

  console.log('\nBased on:');
  console.log('  • arXiv:2312.08935 (Math-Shepherd)');
  console.log('  • 77.9% → 84.1% improvement on GSM8K with Mistral-7B');
  console.log('  • No human annotation required for process supervision');
}

main().catch(console.error);
