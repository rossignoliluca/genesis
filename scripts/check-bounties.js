#!/usr/bin/env node
/**
 * Genesis v16.2.3 - Bounty Status Checker
 *
 * Checks all submitted PRs for merges and records revenue.
 * Run periodically to capture bounty payments.
 *
 * Usage: node scripts/check-bounties.js
 */

// Load environment variables FIRST
require('dotenv').config();

const { getBountyExecutor } = require('../dist/src/economy/bounty-executor.js');
const { getRevenueTracker } = require('../dist/src/economy/live/revenue-tracker.js');

async function main() {
    console.log('====================================');
    console.log('  GENESIS BOUNTY STATUS CHECK');
    console.log('====================================\n');

    const executor = getBountyExecutor();
    const tracker = getRevenueTracker();

    // Load existing revenue data
    await tracker.load();

    // Check all PRs for merges
    console.log('Checking PR statuses...\n');
    const result = await executor.checkAndRecordRevenue();

    // Get all submissions
    const pipeline = executor.getPRPipeline();
    const submissions = pipeline.getAllSubmissions() || [];
    const realSubs = submissions.filter(s => s.bountyValue <= 50000);

    // Display status
    console.log('=== BOUNTY PORTFOLIO ===\n');

    const statusEmoji = {
        'submitted': '📤',
        'reviewing': '👀',
        'changes_requested': '📝',
        'merged': '✅',
        'closed': '❌'
    };

    for (const sub of realSubs) {
        const emoji = statusEmoji[sub.status] || '❓';
        const revenue = sub.revenueRecorded ? ' [RECORDED]' : '';
        console.log(`${emoji} [${sub.status}] $${sub.bountyValue} - ${sub.bountyTitle?.slice(0, 45)}...${revenue}`);
        console.log(`   PR: ${sub.prUrl}`);
    }

    // Summary
    console.log('\n=== SUMMARY ===\n');

    const pending = realSubs.filter(s => s.status === 'submitted' || s.status === 'reviewing');
    const merged = realSubs.filter(s => s.status === 'merged');
    const closed = realSubs.filter(s => s.status === 'closed');

    console.log(`Pending: ${pending.length} PRs ($${pending.reduce((s, x) => s + x.bountyValue, 0)})`);
    console.log(`Merged:  ${merged.length} PRs ($${merged.reduce((s, x) => s + x.bountyValue, 0)})`);
    console.log(`Closed:  ${closed.length} PRs`);

    // Revenue stats
    const stats = tracker.getStats();
    console.log('\n=== REVENUE ===\n');
    console.log(`Total recorded: $${stats.total.toFixed(2)}`);
    console.log(`Events: ${stats.count}`);

    if (stats.count > 0) {
        console.log(`\nBy source:`);
        for (const [source, amount] of Object.entries(stats.bySource)) {
            if (amount > 0) {
                console.log(`  ${source}: $${amount.toFixed(2)}`);
            }
        }
    }

    // Save if there were updates
    if (result.merged > 0) {
        await tracker.save();
        console.log(`\n🎉 Recorded $${result.revenue} from ${result.merged} merged PR(s)!`);
    }

    console.log('\n====================================');
    console.log('Run this script periodically to check for merged PRs');
    console.log('====================================\n');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
