/**
 * Genesis MCP Server Mode
 *
 * Exposes Genesis capabilities as MCP tools for other AI systems.
 * Enables Genesis to be called by Claude, other AI agents, or MCP clients.
 *
 * Scientific grounding:
 * - GWT: Tools route through global workspace
 * - Autopoiesis: Self-funding through service revenue
 * - FEP: Minimize caller prediction error
 */

export * from './types.js';
export { GenesisMCPServer, AuthManager, RateLimiter, MeteringService } from './server.js';
export { DEFAULT_MCP_SERVER_CONFIG } from './types.js';
