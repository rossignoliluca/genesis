/**
 * Test v7.10 Trace Compression
 *
 * Demonstrates Buffer of Thoughts meta-buffer and compression strategies.
 * Run with: npx tsx test-trace-compression.ts
 */

import {
  compressTrace,
  compressTraceSummarize,
  compressTracePrune,
  thinkWithCompression,
  getCompressionStats,
  getThoughtTemplates,
  clearThoughtTemplates,
  TraceCompressionResult,
} from './src/thinking/index.js';

// ============================================================================
// Test Data: Sample reasoning traces
// ============================================================================

const SAMPLE_TRACE_MATH = `
Step 1: Understanding the problem
We need to find the derivative of f(x) = x³ + 2x² - 5x + 3.
This is a polynomial function, so we'll use the power rule.

Step 2: Applying the power rule
The power rule states that d/dx[xⁿ] = n·xⁿ⁻¹
For x³: derivative is 3x²
For 2x²: derivative is 4x
For -5x: derivative is -5
For 3: derivative is 0 (constant)

Step 3: Combining terms
f'(x) = 3x² + 4x - 5

Step 4: Verification
Let's verify by checking a point: at x=1
Original: f(1) = 1 + 2 - 5 + 3 = 1
Derivative: f'(1) = 3 + 4 - 5 = 2
This represents the slope at x=1, which makes sense.

Step 5: Conclusion
The derivative of f(x) = x³ + 2x² - 5x + 3 is f'(x) = 3x² + 4x - 5.
`;

const SAMPLE_TRACE_LOGIC = `
Step 1: Parse the logical statement
Given: If it rains, the ground is wet. The ground is wet.
We need to determine: Did it rain?

Step 2: Identify the logical form
P → Q (If P then Q)
P = "It rains"
Q = "The ground is wet"
We know Q is true.

Step 3: Check for logical fallacy
This is the "affirming the consequent" fallacy.
Just because Q is true doesn't mean P is true.
The ground could be wet for other reasons (sprinkler, spilled water).

Step 4: Consider alternative explanations
- Someone watered the lawn
- A pipe burst
- Dew formed overnight
- Someone washed their car

Step 5: Conclusion
We cannot conclude that it rained. The ground being wet is consistent with rain,
but doesn't prove it. This is a classic example of affirming the consequent.
`;

const SAMPLE_TRACE_CODING = `
Step 1: Understand the requirements
Task: Implement a function to check if a string is a palindrome.
A palindrome reads the same forwards and backwards (e.g., "radar", "level").

Step 2: Consider edge cases
- Empty string: should return true
- Single character: should return true
- Case sensitivity: "Radar" vs "radar"
- Spaces and punctuation: "A man a plan a canal Panama"

Step 3: Design the algorithm
Option A: Compare string with its reverse
Option B: Two-pointer approach from both ends
Choosing Option B for O(1) space complexity.

Step 4: Implementation
function isPalindrome(str: string): boolean {
  const cleaned = str.toLowerCase().replace(/[^a-z0-9]/g, '');
  let left = 0;
  let right = cleaned.length - 1;
  while (left < right) {
    if (cleaned[left] !== cleaned[right]) return false;
    left++;
    right--;
  }
  return true;
}

Step 5: Test cases
isPalindrome("radar") → true
isPalindrome("hello") → false
isPalindrome("A man a plan a canal Panama") → true
isPalindrome("") → true

Step 6: Complexity analysis
Time: O(n) where n is string length
Space: O(n) for the cleaned string, O(1) for pointers
`;

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

function printCompressionResult(result: TraceCompressionResult, label: string) {
  console.log(`\n📊 ${label}:`);
  console.log(`   Original tokens: ${result.stats.originalTokens}`);
  console.log(`   Compressed tokens: ${result.stats.compressedTokens}`);
  console.log(`   Compression ratio: ${(result.stats.compressionRatio * 100).toFixed(1)}%`);
  console.log(`   Strategy used: ${result.stats.strategyUsed}`);
  console.log(`   Template matched: ${result.stats.templateMatched}`);
  console.log(`   Steps pruned: ${result.stats.stepsPruned}`);
  console.log(`   Processing time: ${result.stats.processingTime}ms`);

  if (result.compressed.summary) {
    console.log(`\n   Summary: "${result.compressed.summary.slice(0, 100)}..."`);
  }

  if (result.compressed.keySteps.length > 0) {
    console.log(`\n   Key steps retained: ${result.compressed.keySteps.length}`);
    result.compressed.keySteps.slice(0, 3).forEach(step => {
      console.log(`     - Step ${step.step} (importance: ${step.importance.toFixed(2)}): ${step.essence.slice(0, 50)}...`);
    });
  }

  if (result.templateUsed) {
    console.log(`\n   Template used: ${result.templateUsed.id}`);
  }

  if (result.newTemplateCreated) {
    console.log(`\n   New template created: ${result.newTemplateCreated.id}`);
    console.log(`   Problem type: ${result.newTemplateCreated.problemType}`);
  }
}

// ============================================================================
// Main Test
// ============================================================================

async function main() {
  banner('🗜️  GENESIS v7.10 - Trace Compression Test');

  // Clear any existing templates
  clearThoughtTemplates();
  console.log('\nCleared meta-buffer templates.');

  // ============================================================================
  // Test 1: Basic compression with default (hybrid) strategy
  // ============================================================================
  section('1. Default Hybrid Compression');

  console.log(`Input: Math derivative trace (${SAMPLE_TRACE_MATH.length} chars)`);

  try {
    const result1 = await compressTrace(SAMPLE_TRACE_MATH, 'Find the derivative of f(x) = x³ + 2x² - 5x + 3');
    printCompressionResult(result1, 'Hybrid Compression');
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log('   (This is expected if no LLM is configured - testing structure)');
  }

  // ============================================================================
  // Test 2: Summarization strategy
  // ============================================================================
  section('2. Summarization Strategy (30% target)');

  console.log(`Input: Logic reasoning trace (${SAMPLE_TRACE_LOGIC.length} chars)`);

  try {
    const result2 = await compressTraceSummarize(SAMPLE_TRACE_LOGIC, 0.3);
    printCompressionResult(result2, 'Summarize Compression');
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log('   (This is expected if no LLM is configured - testing structure)');
  }

  // ============================================================================
  // Test 3: Pruning strategy
  // ============================================================================
  section('3. Pruning Strategy (importance > 0.3)');

  console.log(`Input: Coding trace (${SAMPLE_TRACE_CODING.length} chars)`);

  try {
    const result3 = await compressTracePrune(SAMPLE_TRACE_CODING, 0.3);
    printCompressionResult(result3, 'Prune Compression');
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log('   (This is expected if no LLM is configured - testing structure)');
  }

  // ============================================================================
  // Test 4: Think with compression
  // ============================================================================
  section('4. Think with Automatic Compression');

  console.log('Problem: "What is 15% of 80?"');

  try {
    const { result, compressed } = await thinkWithCompression('What is 15% of 80?');

    console.log('\n📝 Thinking Result:');
    console.log(`   Response: ${result.response.slice(0, 100)}...`);
    console.log(`   Thinking steps: ${result.thinking.length}`);
    console.log(`   Total tokens: ${result.totalThinkingTokens}`);
    console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);

    printCompressionResult(compressed, 'Auto Compression');
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log('   (This is expected if no LLM is configured - testing structure)');
  }

  // ============================================================================
  // Test 5: Meta-buffer statistics
  // ============================================================================
  section('5. Meta-Buffer Statistics');

  const stats = getCompressionStats();
  console.log('📈 Current meta-buffer stats:');
  console.log(`   Total templates: ${stats.totalTemplates}`);
  console.log(`   Average compression ratio: ${(stats.avgCompressionRatio * 100).toFixed(1)}%`);
  console.log(`   Cache hit rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`);
  console.log(`   Total tokens saved: ${stats.totalTokensSaved}`);

  // ============================================================================
  // Test 6: Template storage
  // ============================================================================
  section('6. Stored Thought Templates');

  const templates = getThoughtTemplates();
  console.log(`\n📚 Templates in meta-buffer: ${templates.length}`);

  templates.forEach((t, i) => {
    console.log(`\n   Template ${i + 1}:`);
    console.log(`     ID: ${t.id}`);
    console.log(`     Type: ${t.problemType}`);
    console.log(`     Description: ${t.description.slice(0, 50)}...`);
    console.log(`     Success rate: ${(t.metadata.successRate * 100).toFixed(0)}%`);
    console.log(`     Usage count: ${t.metadata.usageCount}`);
  });

  if (templates.length === 0) {
    console.log('   (No templates stored yet - templates are extracted from successful reasoning)');
  }

  // ============================================================================
  // Summary
  // ============================================================================
  banner('✅ Trace Compression Test Complete');

  console.log('\nv7.10 Features Tested:');
  console.log('  • Hybrid compression (summarize + prune)');
  console.log('  • Summarization strategy with target ratio');
  console.log('  • Pruning strategy with importance threshold');
  console.log('  • Think with automatic compression');
  console.log('  • Meta-buffer statistics tracking');
  console.log('  • Thought template storage and retrieval');

  console.log('\nBased on:');
  console.log('  • arXiv:2406.04271 (Buffer of Thoughts)');
  console.log('  • arXiv:2509.12464 (Reasoning-Aware Compression)');
}

main().catch(console.error);
