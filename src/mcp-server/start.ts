/**
 * Genesis MCP Server — Stdio Entry Point
 *
 * Starts Genesis as an MCP server over stdio transport.
 * Boots the full Genesis cognitive stack before starting
 * so that `genesis.nucleus.chat` routes through Nucleus.
 *
 * IMPORTANT: stdout is reserved for JSON-RPC messages only.
 * All console.log/warn output is redirected to stderr so that
 * MCP clients (including MCPO) receive clean protocol messages.
 *
 * Usage: node dist/src/mcp-server/start.js
 */

// Redirect ALL console output to stderr BEFORE any module imports.
// TypeScript hoists static imports above inline code, so we use
// dynamic import() below to ensure the redirect takes effect first.
// stdout must contain ONLY JSON-RPC messages for MCP stdio transport.
const _stderrWrite = process.stderr.write.bind(process.stderr);
console.log = (...args: unknown[]) => { _stderrWrite(args.map(String).join(' ') + '\n'); };
console.warn = (...args: unknown[]) => { _stderrWrite(args.map(String).join(' ') + '\n'); };
console.debug = (...args: unknown[]) => { _stderrWrite(args.map(String).join(' ') + '\n'); };
console.info = (...args: unknown[]) => { _stderrWrite(args.map(String).join(' ') + '\n'); };

async function main(): Promise<void> {
  // Dynamic imports — executed AFTER console redirect is in place
  const { getGenesis } = await import('../genesis.js');
  const { createGenesisMCPServer } = await import('./server.js');

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
