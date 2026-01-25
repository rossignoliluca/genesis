#!/usr/bin/env node
/**
 * Genesis Economy Status CLI
 *
 * Usage:
 *   npx ts-node src/economy/cli/status.ts
 *   npx ts-node src/economy/cli/status.ts --json
 *   npx ts-node src/economy/cli/status.ts --watch
 */

import { config } from 'dotenv';
config(); // Load .env

import { getSystemStatus, formatStatus, getStatusLine } from '../live/health.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Genesis Economy Status

Usage:
  status.ts [options]

Options:
  --json     Output as JSON
  --watch    Continuous monitoring (5s interval)
  --line     Single line status
  --help     Show this help
`);
    process.exit(0);
  }

  if (args.includes('--line')) {
    const line = await getStatusLine();
    console.log(line);
    process.exit(0);
  }

  if (args.includes('--json')) {
    const status = await getSystemStatus();
    console.log(JSON.stringify(status, null, 2));
    process.exit(0);
  }

  if (args.includes('--watch')) {
    console.log('Watching Genesis economy status (Ctrl+C to stop)...\n');

    const update = async () => {
      console.clear();
      const status = await getSystemStatus();
      console.log(formatStatus(status));
    };

    await update();
    setInterval(update, 5000);
    return; // Don't exit
  }

  // Default: single status output
  const status = await getSystemStatus();
  console.log(formatStatus(status));
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
