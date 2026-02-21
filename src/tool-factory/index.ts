/**
 * Tool Factory — Dynamic tool creation, testing, and lifecycle management
 *
 * Architecture: LATM (propose→verify→wrap→cache) + Voyager (skill library)
 * Anti-proliferation: usage-based promotion, decay, hard cap at 50
 */

import { toolRegistry } from '../tools/index.js';
import { getEventBus } from '../bus/index.js';
import { ToolVerifier } from './verifier.js';
import { ToolPromoter } from './promoter.js';
import { ToolLibrary } from './library.js';
import { DynamicToolRegistry } from './registry.js';
import {
  DynamicTool,
  ToolGenerationRequest,
  ToolFactoryConfig,
  DEFAULT_FACTORY_CONFIG,
} from './types.js';

export class ToolFactory {
  private verifier = new ToolVerifier();
  private promoter: ToolPromoter;
  private library = new ToolLibrary();
  private registry = new DynamicToolRegistry();

  constructor(private config: ToolFactoryConfig = DEFAULT_FACTORY_CONFIG) {
    this.promoter = new ToolPromoter(config);
  }

  /**
   * Create a new tool from source code + metadata.
   * Verifies the tool before registering.
   */
  async createFromSource(
    name: string,
    description: string,
    source: string,
    paramSchema: DynamicTool['paramSchema'] = {},
    task = '',
  ): Promise<DynamicTool | null> {
    // Check for existing tool with same name
    const existing = this.library.get(name);
    if (existing && (existing.status === 'candidate' || existing.status === 'permanent')) {
      return existing;
    }

    const tool: DynamicTool = {
      id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      description,
      version: existing ? existing.version + 1 : 1,
      status: 'testing',
      source,
      paramSchema,
      createdBy: 'agent',
      createdFrom: task,
      usageCount: 0,
      successCount: 0,
      failureCount: 0,
      avgDuration: 0,
      lastUsed: new Date(),
      createdAt: new Date(),
    };

    // Verify
    const testResult = await this.verifier.verify(tool);
    if (!testResult.passed) {
      return null;
    }

    // Register
    this.registry.register(tool);
    await this.library.store(tool);
    return tool;
  }

  /**
   * Find similar existing tools for a task description.
   */
  async findTools(taskDescription: string, topK = 5): Promise<DynamicTool[]> {
    return this.library.retrieve(taskDescription, topK);
  }

  /**
   * Called when a tool fails — could trigger replacement creation
   */
  async onToolFailure(toolName: string, error: string): Promise<void> {
    try {
      const tool = this.library.get(toolName);
      if (tool) {
        tool.failureCount++;
        tool.usageCount++;
        tool.lastUsed = new Date();
        await this.library.store(tool);
      }
    } catch (err) {
      console.error('[tool-factory] onToolFailure failed:', err);
    }
  }

  /**
   * Periodic maintenance: promote, demote, garbage collect
   */
  async maintain(): Promise<{ promoted: string[]; deprecated: string[]; removed: string[] }> {
    const all = this.library.getAll();
    const promoted: string[] = [];
    const deprecated: string[] = [];
    const bus = getEventBus();

    for (const tool of all) {
      const newStatus = this.promoter.evaluate(tool);
      if (newStatus !== tool.status) {
        const oldStatus = tool.status;
        tool.status = newStatus;
        await this.library.store(tool);

        if (newStatus === 'candidate' || newStatus === 'permanent') {
          promoted.push(tool.name);
          bus.publish('toolfactory.tool.promoted', {
            source: 'tool-factory',
            precision: 0.8,
            toolName: tool.name,
            oldStatus,
            newStatus,
            usageCount: tool.usageCount,
            successRate: tool.usageCount > 0 ? tool.successCount / tool.usageCount : 0,
          });
        }

        if (newStatus === 'deprecated') {
          deprecated.push(tool.name);
          bus.publish('toolfactory.tool.deprecated', {
            source: 'tool-factory',
            precision: 0.8,
            toolName: tool.name,
            reason: 'Usage-based demotion',
            usageCount: tool.usageCount,
            daysSinceLastUse: (Date.now() - tool.lastUsed.getTime()) / 86400000,
          });
        }
      }
    }

    const removed = this.promoter.gc(all);
    for (const name of removed) {
      this.registry.unregister(name);
      this.library.remove(name);
    }

    return { promoted, deprecated, removed };
  }

  /** Get all dynamic tools */
  getTools(): DynamicTool[] {
    return this.library.getAll();
  }

  /** Register the ToolFactory itself as Genesis tools */
  registerSelf(): void {
    toolRegistry.set('create_tool', {
      name: 'create_tool',
      description: 'Create a new reusable tool from source code. Verifies and registers it.',
      execute: async (params: Record<string, unknown>) => {
        const result = await this.createFromSource(
          params.name as string,
          params.description as string,
          params.source as string,
          params.paramSchema as DynamicTool['paramSchema'],
          params.task as string,
        );
        if (result) {
          return { success: true, tool: { name: result.name, description: result.description, status: result.status } };
        }
        return { success: false, error: 'Verification failed' };
      },
      validate: (params: Record<string, unknown>) => {
        if (!params.name) return { valid: false, reason: 'Missing name' };
        if (!params.source) return { valid: false, reason: 'Missing source code' };
        return { valid: true };
      },
    });

    toolRegistry.set('list_dynamic_tools', {
      name: 'list_dynamic_tools',
      description: 'List all dynamically created tools and their status',
      execute: async () => {
        return this.library.getAll().map(t => ({
          name: t.name,
          description: t.description,
          status: t.status,
          usageCount: t.usageCount,
          successRate: t.usageCount > 0 ? t.successCount / t.usageCount : 0,
        }));
      },
    });
  }
}

// Singleton
let _instance: ToolFactory | null = null;

export function getToolFactory(config?: ToolFactoryConfig): ToolFactory {
  if (!_instance) {
    _instance = new ToolFactory(config);
    _instance.registerSelf();
  }
  return _instance;
}

export function resetToolFactory(): void {
  _instance = null;
}

// Re-export
export * from './types.js';
export { ToolVerifier } from './verifier.js';
export { ToolPromoter } from './promoter.js';
export { ToolLibrary } from './library.js';
export { DynamicToolRegistry } from './registry.js';
export { MAPElitesArchive, createToolArchive, describeToolBehavior, toolFitness, type DimensionSpec, type MAPElitesConfig } from './map-elites.js';
