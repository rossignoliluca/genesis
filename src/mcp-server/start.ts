/**
 * Genesis MCP Server — Stdio Entry Point
 *
 * Starts Genesis as an MCP server over stdio transport.
 * Boots the full Genesis cognitive stack before starting
 * so that `genesis.nucleus.chat` routes through Nucleus.
 *
 * Usage: node dist/src/mcp-server/start.js
 */

import { getGenesis } from '../genesis.js';
import { createGenesisMCPServer } from './server.js';

async function main(): Promise<void> {
  // Boot full Genesis cognitive stack (Nucleus, neuromodulation, memory, etc.)
  const genesis = getGenesis();
  await genesis.boot();
  (globalThis as any).__genesisInstance = genesis;

  const server = createGenesisMCPServer();
  await server.start();
}

main().catch(err => {
  console.error('[Genesis MCP] Fatal error:', err);
  process.exit(1);
});
