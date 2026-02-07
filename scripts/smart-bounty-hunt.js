#!/usr/bin/env node
/**
 * Genesis v16.2.4 - Smart Bounty Hunter
 *
 * Memory-aware bounty search that uses RSI feedback to:
 * 1. Query past performance (skills, platforms, categories)
 * 2. Identify strengths and weaknesses
 * 3. Scan for new bounties
 * 4. Prioritize based on historical success probability
 * 5. Avoid repeating past mistakes
 */

require('dotenv').config();

const { BountyHunter } = require('../dist/src/economy/generators/bounty-hunter.js');
const { getBountyRSIFeedback } = require('../dist/src/economy/rsi-feedback.js');

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

async function main() {
  console.log(colorize('═'.repeat(60), 'cyan'));
  console.log(colorize('  GENESIS SMART BOUNTY HUNTER', 'bright'));
  console.log(colorize('  Memory-Aware Bounty Discovery', 'dim'));
  console.log(colorize('═'.repeat(60), 'cyan'));
  console.log('');

  // ============================================================================
  // PHASE 1: Query Memory / RSI Feedback
  // ============================================================================
  console.log(colorize('PHASE 1: Analyzing Past Performance', 'yellow'));
  console.log('─'.repeat(50));

  let rsiFeedback;
  let rsiStats;

  try {
    rsiFeedback = getBountyRSIFeedback();
    rsiStats = rsiFeedback.getStats();

    console.log(`Total bounty outcomes recorded: ${rsiStats.totalOutcomes}`);
    console.log(`Success rate: ${(rsiStats.successRate * 100).toFixed(1)}%`);
    console.log(`Total revenue: $${rsiStats.totalRevenue.toFixed(2)}`);
    console.log(`Total cost: $${rsiStats.totalCost.toFixed(2)}`);
    console.log(`Net profit: $${rsiStats.profit.toFixed(2)}`);
    console.log(`Skills tracked: ${rsiStats.skillCount}`);
    console.log(`Limitations detected: ${rsiStats.limitationCount}`);

    if (rsiStats.topSkills.length > 0) {
      console.log('\nTop performing skills:');
      for (const skill of rsiStats.topSkills) {
        const rate = (skill.successRate * 100).toFixed(0);
        const indicator = rate >= 70 ? colorize('[HIGH]', 'green') :
                         rate >= 40 ? colorize('[MED]', 'yellow') : colorize('[LOW]', 'red');
        console.log(`  ${indicator} ${skill.skill}: ${rate}% success, $${skill.revenue.toFixed(0)} earned`);
      }
    }

    // Get research recommendations from RSI
    const researchTopics = rsiFeedback.getResearchTopicsForRSI();
    if (researchTopics.length > 0) {
      console.log(colorize('\nRSI Recommended Research:', 'magenta'));
      for (const topic of researchTopics.slice(0, 3)) {
        console.log(`  - ${topic}`);
      }
    }

    // Check if RSI should be triggered
    if (rsiFeedback.shouldTriggerRSI()) {
      console.log(colorize('\n[!] RSI recommends self-improvement cycle', 'red'));
    }
  } catch (err) {
    console.log(colorize('  RSI feedback not available (first run)', 'dim'));
    rsiStats = { totalOutcomes: 0, successRate: 0, topSkills: [] };
  }

  console.log('');

  // ============================================================================
  // PHASE 2: Derive Strategy from Memory
  // ============================================================================
  console.log(colorize('PHASE 2: Strategy Based on Memory', 'yellow'));
  console.log('─'.repeat(50));

  // Calculate optimal category based on past performance
  const categoryPreference = [];

  if (rsiStats.totalOutcomes < 3) {
    // Learning mode: prioritize easy wins
    console.log('Mode: LEARNING (< 3 completed bounties)');
    console.log('Strategy: Prioritize high-probability, lower-value bounties');
    categoryPreference.push(
      { category: 'translation', reason: 'Highest base success rate (90%)' },
      { category: 'content', reason: 'High success rate (80%)' },
      { category: 'research', reason: 'Good success rate (70%)' },
    );
  } else if (rsiStats.successRate >= 0.6) {
    // Successful: can take on harder bounties
    console.log('Mode: EXPANSION (60%+ success rate)');
    console.log('Strategy: Target higher-value bounties');
    categoryPreference.push(
      { category: 'code', reason: 'Ready for complex work' },
      { category: 'audit', reason: 'High value opportunity' },
      { category: 'research', reason: 'Consistent performer' },
    );
  } else {
    // Struggling: focus on strengths
    console.log('Mode: CONSOLIDATION (< 60% success rate)');
    console.log('Strategy: Focus on proven strengths');

    if (rsiStats.topSkills.length > 0) {
      for (const skill of rsiStats.topSkills.slice(0, 3)) {
        if (skill.successRate >= 0.5) {
          categoryPreference.push({
            category: skill.skill,
            reason: `${(skill.successRate * 100).toFixed(0)}% historical success`,
          });
        }
      }
    }

    if (categoryPreference.length === 0) {
      categoryPreference.push(
        { category: 'content', reason: 'Safe fallback' },
        { category: 'translation', reason: 'High base probability' },
      );
    }
  }

  console.log('\nRecommended categories:');
  for (const pref of categoryPreference) {
    console.log(`  - ${colorize(pref.category, 'green')}: ${pref.reason}`);
  }
  console.log('');

  // ============================================================================
  // PHASE 3: Scan for New Bounties
  // ============================================================================
  console.log(colorize('PHASE 3: Scanning Platforms', 'yellow'));
  console.log('─'.repeat(50));

  const hunter = new BountyHunter({
    platforms: ['algora', 'github', 'gitcoin', 'dework'],
    categories: ['code', 'audit', 'content', 'research', 'design', 'translation'],
    minReward: 25,
    maxDifficulty: 'critical',
    successProbabilityThreshold: 0.2,
  });

  let discovered = [];
  try {
    discovered = await hunter.scan();
    console.log(`\nDiscovered ${discovered.length} new viable bounties`);
  } catch (err) {
    console.log(colorize(`Scan error: ${err.message}`, 'red'));
  }

  const stats = hunter.getStats();
  console.log(`Total in database: ${stats.bountiesDiscovered}`);
  console.log('');

  // ============================================================================
  // PHASE 4: Smart Ranking with Memory
  // ============================================================================
  console.log(colorize('PHASE 4: Memory-Aware Ranking', 'yellow'));
  console.log('─'.repeat(50));

  // Get all candidates and score them
  const candidates = [];

  // We need to access the bounties from the hunter
  // Since there's no direct method, we'll use selectBest in a loop
  const seenIds = new Set();
  let candidate;

  for (let i = 0; i < 20; i++) {
    candidate = hunter.selectBest({ excludeIds: seenIds });
    if (!candidate) break;

    seenIds.add(candidate.id);

    // Calculate memory-adjusted score
    let memoryBonus = 0;
    let memoryNotes = [];

    // Bonus for categories we're good at
    const categoryMatch = categoryPreference.find(p =>
      p.category === candidate.category ||
      candidate.tags.some(t => t.toLowerCase().includes(p.category))
    );
    if (categoryMatch) {
      memoryBonus += 0.2;
      memoryNotes.push(`Matches ${categoryMatch.category} strength`);
    }

    // Bonus/penalty based on RSI probability
    if (rsiFeedback) {
      try {
        const rsiProb = rsiFeedback.getImprovedSuccessProbability(candidate);
        if (rsiProb > 0.6) {
          memoryBonus += 0.15;
          memoryNotes.push(`High historical success (${(rsiProb * 100).toFixed(0)}%)`);
        } else if (rsiProb < 0.3) {
          memoryBonus -= 0.1;
          memoryNotes.push(`Low historical success (${(rsiProb * 100).toFixed(0)}%)`);
        }
      } catch {}
    }

    // Platform familiarity bonus
    const platformStats = rsiStats.topSkills?.find(s => s.skill === `platform-${candidate.platform}`);
    if (platformStats && platformStats.successRate > 0.5) {
      memoryBonus += 0.1;
      memoryNotes.push(`Familiar platform`);
    }

    candidates.push({
      bounty: candidate,
      memoryBonus,
      memoryNotes,
      finalScore: candidate.reward * (1 + memoryBonus),
    });
  }

  // Sort by final score
  candidates.sort((a, b) => b.finalScore - a.finalScore);

  console.log(`\nTop ${Math.min(10, candidates.length)} recommended bounties:\n`);

  for (let i = 0; i < Math.min(10, candidates.length); i++) {
    const c = candidates[i];
    const b = c.bounty;

    // Color code by difficulty
    const diffColor = {
      easy: 'green',
      medium: 'yellow',
      hard: 'magenta',
      critical: 'red',
    }[b.difficulty] || 'reset';

    console.log(`${colorize(`#${i + 1}`, 'bright')} ${b.title.slice(0, 50)}${b.title.length > 50 ? '...' : ''}`);
    console.log(`   ${colorize(`$${b.reward}`, 'green')} | ${colorize(b.difficulty, diffColor)} | ${b.category} | ${b.platform}`);

    if (c.memoryNotes.length > 0) {
      console.log(`   ${colorize('Memory:', 'cyan')} ${c.memoryNotes.join(', ')}`);
    }

    if (b.sourceMetadata?.githubUrl) {
      console.log(`   ${colorize('URL:', 'dim')} ${b.sourceMetadata.githubUrl}`);
    } else if (b.submissionUrl) {
      console.log(`   ${colorize('URL:', 'dim')} ${b.submissionUrl}`);
    }

    console.log('');
  }

  // ============================================================================
  // PHASE 5: Recommendations
  // ============================================================================
  console.log(colorize('═'.repeat(60), 'cyan'));
  console.log(colorize('  RECOMMENDATIONS', 'bright'));
  console.log(colorize('═'.repeat(60), 'cyan'));
  console.log('');

  if (candidates.length === 0) {
    console.log(colorize('No suitable bounties found. Try again later.', 'yellow'));
  } else {
    const topPick = candidates[0];
    console.log(`${colorize('TOP PICK:', 'green')} ${topPick.bounty.title}`);
    console.log(`  Reward: $${topPick.bounty.reward}`);
    console.log(`  Platform: ${topPick.bounty.platform}`);
    console.log(`  Category: ${topPick.bounty.category}`);
    console.log(`  Difficulty: ${topPick.bounty.difficulty}`);

    if (topPick.memoryNotes.length > 0) {
      console.log(`  Memory insights: ${topPick.memoryNotes.join(', ')}`);
    }

    console.log('');
    console.log('To claim this bounty, run:');
    console.log(colorize(`  node scripts/execute-bounty.js "${topPick.bounty.id}"`, 'cyan'));
  }

  // Summary based on learning from WattCoin failures
  console.log('');
  console.log(colorize('Reminders from past failures:', 'yellow'));
  console.log('  1. Check repo language (Python vs JavaScript)');
  console.log('  2. Modify existing files, don\'t create new ones');
  console.log('  3. No placeholder code or stub functions');
  console.log('  4. No fake URLs (example.com, localhost)');
  console.log('  5. Code validator will block submissions with score < 70');
  console.log('');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
