/**
 * Dynamic Tool Registry — Bridges dynamic tools into Genesis toolRegistry
 */

import { toolRegistry, Tool } from '../tools/index.js';
import { getEventBus } from '../bus/index.js';
import { DynamicTool } from './types.js';

export class DynamicToolRegistry {
  private dynamicNames = new Set<string>();

  register(tool: DynamicTool): void {
    const execute = this.compileToFunction(tool.source);

    const registryEntry: Tool = {
      name: tool.name,
      description: `[dynamic] ${tool.description}`,
      execute: async (params: Record<string, unknown>) => {
        const start = Date.now();
        try {
          const result = await execute(params);
          tool.usageCount++;
          tool.successCount++;
          tool.avgDuration = (tool.avgDuration * (tool.usageCount - 1) + (Date.now() - start)) / tool.usageCount;
          tool.lastUsed = new Date();
          return result;
        } catch (err) {
          tool.usageCount++;
          tool.failureCount++;
          tool.lastUsed = new Date();
          throw err;
        }
      },
      validate: (params: Record<string, unknown>) => {
        const required = tool.paramSchema.required || [];
        for (const key of required) {
          if (params[key] === undefined) {
            return { valid: false, reason: `Missing required parameter: ${key}` };
          }
        }
        return { valid: true };
      },
    };

    toolRegistry.set(tool.name, registryEntry);
    this.dynamicNames.add(tool.name);

    const bus = getEventBus();
    bus.publish('toolfactory.tool.created', {
      source: 'tool-factory',
      precision: 0.8,
      toolName: tool.name,
      description: tool.description,
      status: tool.status,
      createdFrom: tool.createdFrom,
    });
  }

  unregister(name: string): void {
    if (this.dynamicNames.has(name)) {
      toolRegistry.delete(name);
      this.dynamicNames.delete(name);
    }
  }

  getDynamicToolNames(): string[] {
    return Array.from(this.dynamicNames);
  }

  private compileToFunction(source: string): (params: Record<string, unknown>) => Promise<unknown> {
    // Use AsyncFunction constructor for dynamic code execution
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const fn = new AsyncFunction('params', `
      ${source}
      return execute(params);
    `);
    return fn;
  }
}
