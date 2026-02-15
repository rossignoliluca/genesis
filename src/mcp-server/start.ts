/**
 * Genesis MCP Server — Stdio Entry Point
 *
 * Starts Genesis as an MCP server over stdio transport.
 * Used by Claude Code and other MCP clients.
 *
 * Usage: node dist/src/mcp-server/start.js
 */

import { createGenesisMCPServer } from './server.js';

async function main(): Promise<void> {
  const server = createGenesisMCPServer();
  await server.start();
}

main().catch(err => {
  console.error('[Genesis MCP] Fatal error:', err);
  process.exit(1);
});
