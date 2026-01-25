#!/usr/bin/env node
/**
 * Genesis Economy Boot CLI
 *
 * Usage:
 *   npx ts-node src/economy/cli/boot.ts
 *   npx ts-node src/economy/cli/boot.ts --auto-start
 *   npx ts-node src/economy/cli/boot.ts --network mainnet
 */

import { config } from 'dotenv';
config(); // Load .env

import { boot, type LiveConfig } from '../live/boot.js';
import { formatStatus, getSystemStatus } from '../live/health.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Genesis Economy Boot

Usage:
  boot.ts [options]

Options:
  --auto-start     Start controller loop after boot
  --network NAME   Network: mainnet or testnet (default: testnet)
  --help           Show this help

Environment:
  GENESIS_PRIVATE_KEY      Wallet private key (required)
  CLOUDFLARE_API_TOKEN     For worker deployment
  CLOUDFLARE_ACCOUNT_ID    For worker deployment
  GENESIS_ALERTS_ENABLED   Enable/disable alerts
  GENESIS_TELEGRAM_*       Telegram alert config
  GENESIS_DISCORD_WEBHOOK  Discord alert config
  GENESIS_SLACK_WEBHOOK    Slack alert config
`);
    process.exit(0);
  }

  const config: Partial<LiveConfig> = {
    autoStart: args.includes('--auto-start'),
    network: args.includes('--network')
      ? (args[args.indexOf('--network') + 1] as 'mainnet' | 'testnet')
      : undefined,
  };

  console.log('');
  console.log('='.repeat(60));
  console.log('GENESIS ECONOMY - LIVE BOOT');
  console.log('='.repeat(60));
  console.log('');

  const result = await boot(config);

  console.log('');
  if (result.success) {
    console.log('[+] Boot successful');
  } else {
    console.log('[!] Boot completed with errors:');
    for (const error of result.errors) {
      console.log(`    - ${error}`);
    }
  }

  console.log('');

  // Show status
  const status = await getSystemStatus();
  console.log(formatStatus(status));

  if (config.autoStart) {
    console.log('\nController loop running. Press Ctrl+C to stop.\n');
    // Keep process alive
    process.on('SIGINT', () => {
      console.log('\nShutting down...');
      process.exit(0);
    });
  } else {
    console.log('\nTo start the controller loop, run with --auto-start');
    process.exit(result.success ? 0 : 1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
