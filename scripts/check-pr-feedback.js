#!/usr/bin/env node
/**
 * Genesis - PR Feedback Monitor
 *
 * Checks all submitted PRs for feedback/reviews and displays them.
 * Helps learn from rejections to improve future submissions.
 */

require('dotenv').config();
const { execSync } = require('child_process');
const { PRPipeline } = require('../dist/src/economy/live/pr-pipeline.js');

async function main() {
  console.log('=====================================');
  console.log('  GENESIS PR FEEDBACK MONITOR');
  console.log('=====================================\n');

  const pipeline = new PRPipeline({
    githubUsername: process.env.GITHUB_USERNAME || 'rossignoliluca',
    dryRun: false,
  });

  const submissions = pipeline.getAllSubmissions() || [];
  const realSubs = submissions.filter(s => s.bountyValue <= 50000);

  if (realSubs.length === 0) {
    console.log('No PR submissions found.\n');
    return;
  }

  for (const sub of realSubs) {
    console.log('─'.repeat(50));
    console.log(`📋 ${sub.bountyTitle?.slice(0, 45)}...`);
    console.log(`   PR: ${sub.prUrl}`);
    console.log(`   Status: ${sub.status} | Bounty: $${sub.bountyValue}`);
    console.log('');

    // Extract owner/repo/number from PR URL
    const match = sub.prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) {
      console.log('   ⚠️ Could not parse PR URL\n');
      continue;
    }

    const [, owner, repo, prNumber] = match;

    try {
      // Get PR comments (issue comments)
      const commentsJson = execSync(
        `gh api repos/${owner}/${repo}/issues/${prNumber}/comments --jq '.[].body' 2>/dev/null`,
        { encoding: 'utf-8', timeout: 10000 }
      ).trim();

      // Get PR reviews
      const reviewsJson = execSync(
        `gh api repos/${owner}/${repo}/pulls/${prNumber}/reviews --jq '.[].body' 2>/dev/null`,
        { encoding: 'utf-8', timeout: 10000 }
      ).trim();

      const allFeedback = [commentsJson, reviewsJson]
        .filter(Boolean)
        .join('\n\n---\n\n');

      if (allFeedback.trim()) {
        // Parse and display feedback
        console.log('   📝 FEEDBACK:');

        // Look for rejection patterns
        if (/❌|rejected|closed|wrong|incorrect|invalid/i.test(allFeedback)) {
          console.log('   🔴 STATUS: REJECTED');
        } else if (/✅|approved|lgtm|merged/i.test(allFeedback)) {
          console.log('   🟢 STATUS: APPROVED');
        } else if (/review|pending|waiting/i.test(allFeedback)) {
          console.log('   🟡 STATUS: PENDING REVIEW');
        }

        // Extract key issues
        const issues = [];
        if (/wrong (language|file|format)/i.test(allFeedback)) {
          issues.push('Wrong language/format');
        }
        if (/placeholder|stub|not implemented/i.test(allFeedback)) {
          issues.push('Placeholder/incomplete code');
        }
        if (/doesn't (modify|touch|change)/i.test(allFeedback)) {
          issues.push('Didn\'t modify correct files');
        }
        if (/no tests/i.test(allFeedback)) {
          issues.push('Missing tests');
        }
        if (/fake|example\.com|localhost/i.test(allFeedback)) {
          issues.push('Fake URLs/placeholders');
        }

        if (issues.length > 0) {
          console.log('   ⚠️ Issues found:');
          issues.forEach(i => console.log(`      - ${i}`));
        }

        // Show truncated feedback
        const truncated = allFeedback
          .replace(/\n{3,}/g, '\n\n')
          .slice(0, 500);
        console.log('');
        console.log('   ' + truncated.split('\n').join('\n   '));
        if (allFeedback.length > 500) {
          console.log('   [...truncated]');
        }
      } else {
        console.log('   📭 No feedback yet');
      }
    } catch (err) {
      console.log(`   ⚠️ Could not fetch feedback: ${err.message?.slice(0, 50)}`);
    }

    console.log('');
  }

  // Summary of learnings
  console.log('═'.repeat(50));
  console.log('📚 LEARNINGS FROM REJECTIONS:');
  console.log('');
  console.log('1. Always check repo language (Python vs JS)');
  console.log('2. Modify existing files, don\'t create new ones');
  console.log('3. No placeholder code or stub functions');
  console.log('4. No fake URLs (example.com, localhost)');
  console.log('5. Include tests when possible');
  console.log('');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
