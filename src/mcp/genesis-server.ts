/**
 * Genesis v32 - MCP Server (Item 13)
 *
 * Exposes Genesis capabilities as an MCP server, making it usable from
 * 80+ MCP clients (Claude Desktop, VS Code, Cursor, Gemini CLI, etc.).
 *
 * Genesis becomes a "cognitive backend" for any AI frontend.
 */

import { getMemorySystem } from '../memory/index.js';

// ============================================================================
// Tool Definitions for MCP
// ============================================================================

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export interface MCPToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Generate MCP tool definitions from Genesis capabilities
 */
export function getGenesisToolDefinitions(): MCPToolDefinition[] {
  return [
    {
      name: 'genesis_memory_recall',
      description: 'Search Genesis memory (episodic, semantic, procedural) for relevant information',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          types: {
            type: 'array',
            items: { type: 'string', enum: ['episodic', 'semantic', 'procedural'] },
            description: 'Memory types to search (default: all)',
          },
          limit: { type: 'number', description: 'Max results (default: 10)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'genesis_memory_store',
      description: 'Store information in Genesis memory system',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['episodic', 'semantic'], description: 'Memory type' },
          content: { type: 'string', description: 'What to remember' },
          importance: { type: 'number', description: 'Importance 0-1 (default: 0.7)' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags for retrieval' },
        },
        required: ['type', 'content'],
      },
    },
    {
      name: 'genesis_cognitive_state',
      description: 'Get Genesis cognitive state: beliefs, phi, active inference, memory stats',
      inputSchema: {
        type: 'object',
        properties: {
          sections: {
            type: 'array',
            items: { type: 'string', enum: ['beliefs', 'memory', 'inference', 'all'] },
            description: 'Which sections to return (default: all)',
          },
        },
      },
    },
    {
      name: 'genesis_market_strategist',
      description: 'Query market strategist: latest brief, predictions, track record',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['latest_brief', 'track_record', 'predictions', 'themes'],
            description: 'What to retrieve',
          },
        },
        required: ['action'],
      },
    },
    {
      name: 'genesis_memory_consolidate',
      description: 'Trigger memory consolidation (sleep mode)',
      inputSchema: { type: 'object', properties: {} },
    },
  ];
}

/**
 * Handle an MCP tool call by routing to the appropriate Genesis handler
 */
export async function handleGenesisToolCall(
  toolName: string,
  args: Record<string, any>,
): Promise<MCPToolResult> {
  try {
    switch (toolName) {
      case 'genesis_memory_recall': {
        const memory = getMemorySystem();
        const results = memory.recall(args.query, {
          types: args.types,
          limit: args.limit || 10,
        });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results.map(m => ({
              type: m.type,
              content: m.content,
              relevance: m.R0,
              tags: m.tags,
            })), null, 2),
          }],
        };
      }

      case 'genesis_memory_store': {
        const memory = getMemorySystem();
        if (args.type === 'episodic') {
          memory.remember({
            what: args.content,
            importance: args.importance || 0.7,
            tags: args.tags || [],
            source: 'mcp-client',
          });
        } else {
          memory.learn({
            concept: args.content.split(':')[0] || args.content.slice(0, 50),
            definition: args.content,
            category: 'mcp-stored',
            tags: args.tags || [],
            confidence: args.importance || 0.7,
            importance: args.importance || 0.7,
          });
        }
        return { content: [{ type: 'text', text: 'Stored successfully' }] };
      }

      case 'genesis_cognitive_state': {
        const memory = getMemorySystem();
        const stats = memory.getStats();

        let state: Record<string, any> = {};
        const sections = args.sections || ['all'];

        if (sections.includes('all') || sections.includes('memory')) {
          state.memory = {
            total: stats.total,
            episodic: stats.episodic.total,
            semantic: stats.semantic.total,
            procedural: stats.procedural.total,
          };
        }

        if (sections.includes('all') || sections.includes('beliefs')) {
          try {
            const { getOutcomeIntegrator } = await import('../active-inference/outcome-integrator.js');
            state.beliefs = getOutcomeIntegrator().getBeliefs();
          } catch {
            state.beliefs = { note: 'Outcome integrator not initialized' };
          }
        }

        return { content: [{ type: 'text', text: JSON.stringify(state, null, 2) }] };
      }

      case 'genesis_market_strategist': {
        const { MemoryLayers } = await import('../market-strategist/memory-layers.js');
        const layers = new MemoryLayers();

        switch (args.action) {
          case 'track_record': {
            const record = layers.getLatestTrackRecord();
            return { content: [{ type: 'text', text: JSON.stringify(record, null, 2) }] };
          }
          case 'predictions': {
            const preds = layers.getPendingPredictions();
            return { content: [{ type: 'text', text: JSON.stringify(preds, null, 2) }] };
          }
          case 'themes': {
            const themes = layers.getActiveThemes();
            return { content: [{ type: 'text', text: JSON.stringify(themes, null, 2) }] };
          }
          default: {
            const weeks = layers.getRecentWeeks(1);
            return { content: [{ type: 'text', text: JSON.stringify(weeks, null, 2) }] };
          }
        }
      }

      case 'genesis_memory_consolidate': {
        const memory = getMemorySystem();
        const result = await memory.consolidate();
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}
