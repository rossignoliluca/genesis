#!/usr/bin/env node
/**
 * Inject tasks into running Genesis autonomous system
 *
 * Usage:
 *   npx tsx src/autonomous/inject-task.ts earn "Run CompIntel scan"
 *   npx tsx src/autonomous/inject-task.ts deploy "Deploy landing page"
 *   npx tsx src/autonomous/inject-task.ts remember "Important learning"
 */

import { getAutonomousSystem } from './index.js';

const [,, taskType, description, ...args] = process.argv;

if (!taskType || !description) {
  console.log('Usage: inject-task.ts <type> <description> [priority]');
  console.log('Types: earn, deploy, remember, collaborate, custom');
  console.log('Priority: low, normal, high, critical (default: normal)');
  process.exit(1);
}

const priority = (args[0] as any) || 'normal';

async function main() {
  const system = getAutonomousSystem();
  await system.initialize();

  const taskId = system.queueTask({
    type: taskType as any,
    description,
    priority,
  });

  console.log(`Task queued: ${taskId}`);
  console.log(`  Type: ${taskType}`);
  console.log(`  Description: ${description}`);
  console.log(`  Priority: ${priority}`);
}

main().catch(console.error);
