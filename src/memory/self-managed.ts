/**
 * Genesis v32 - Self-Managed Memory (Item 20)
 *
 * Letta-style autonomous memory management: the agent DECIDES what to
 * remember/forget via tool calls, rather than having external systems
 * make those decisions.
 *
 * Registers tools: memory_store, memory_search, memory_forget,
 * memory_consolidate, memory_stats
 */

import { getMemorySystem } from './index.js';
import type { MemorySystem } from './index.js';

export interface SelfManagedMemoryTool {
  name: string;
  description: string;
  execute: (args: Record<string, any>) => Promise<any>;
}

/**
 * Create self-managed memory tools for registration in toolRegistry
 */
export function createSelfManagedMemoryTools(): SelfManagedMemoryTool[] {
  return [
    {
      name: 'memory_store',
      description: 'Store important information in long-term memory. Use this proactively when you learn something worth remembering for future conversations.',
      async execute(args: Record<string, any>) {
        const memory = getMemorySystem();
        const content = args.content as string;
        const type = (args.type as string) || 'semantic';
        const importance = (args.importance as number) || 0.7;
        const tags = (args.tags as string[]) || [];

        if (type === 'episodic') {
          const ep = memory.remember({
            what: content,
            importance,
            tags: ['self-managed', ...tags],
            source: 'self-managed',
          });
          return { stored: true, type: 'episodic', id: ep.id };
        } else {
          const concept = content.split(':')[0]?.trim() || content.slice(0, 50);
          const definition = content.includes(':') ? content.split(':').slice(1).join(':').trim() : content;
          const sem = memory.learn({
            concept,
            definition,
            category: 'self-managed',
            tags: ['self-managed', ...tags],
            confidence: importance,
            importance,
          });
          return { stored: true, type: 'semantic', id: sem.id, concept };
        }
      },
    },

    {
      name: 'memory_search',
      description: 'Search your own memory before making decisions. Returns relevant past experiences and learned facts.',
      async execute(args: Record<string, any>) {
        const memory = getMemorySystem();
        const query = args.query as string;
        const limit = (args.limit as number) || 5;
        const types = args.types as string[] | undefined;

        const results = memory.recall(query, { limit, types: types as any });
        return {
          found: results.length,
          results: results.map(m => ({
            type: m.type,
            content: m.content,
            tags: m.tags,
            retention: m.R0,
            lastAccessed: m.lastAccessed,
          })),
        };
      },
    },

    {
      name: 'memory_forget',
      description: 'Mark outdated or incorrect information for accelerated decay. Use when you realize something you stored was wrong.',
      async execute(args: Record<string, any>) {
        const memory = getMemorySystem();
        const query = args.query as string;
        const reason = (args.reason as string) || 'outdated';

        // Find matching memories and reduce their stability
        const matches = memory.recall(query, { limit: 3 });
        let forgotten = 0;

        for (const m of matches) {
          if (m.type === 'episodic') {
            memory.episodic.update(m.id, { S: 0.5 }); // rapid decay
            forgotten++;
          } else if (m.type === 'semantic') {
            memory.semantic.update(m.id, { S: 1 }); // rapid decay
            forgotten++;
          }
        }

        return { forgotten, reason, matchesFound: matches.length };
      },
    },

    {
      name: 'memory_consolidate',
      description: 'Extract patterns from recent episodic memories and create semantic knowledge. Like sleeping on it.',
      async execute(_args: Record<string, any>) {
        const memory = getMemorySystem();
        const result = await memory.consolidate();
        return {
          consolidated: true,
          ...result,
        };
      },
    },

    {
      name: 'memory_stats',
      description: 'Get memory system health: total memories, forgetting curves, capacity usage.',
      async execute(_args: Record<string, any>) {
        const memory = getMemorySystem();
        const stats = memory.getStats();
        return {
          total: stats.total,
          episodic: stats.episodic.total,
          semantic: stats.semantic.total,
          procedural: stats.procedural.total,
          forgetting: {
            episodic: stats.forgetting.episodic,
            semantic: stats.forgetting.semantic,
          },
        };
      },
    },
  ];
}

/**
 * Register self-managed memory tools into the Genesis tool registry
 */
export async function registerSelfManagedMemoryTools(): Promise<void> {
  try {
    const { toolRegistry } = await import('../tools/index.js');
    const tools = createSelfManagedMemoryTools();

    for (const tool of tools) {
      toolRegistry.set(tool.name, {
        name: tool.name,
        description: tool.description,
        execute: tool.execute,
      });
    }

    console.log(`[SelfManagedMemory] Registered ${tools.length} memory tools`);
  } catch (error) {
    console.error('[SelfManagedMemory] Failed to register tools:', error);
  }
}
