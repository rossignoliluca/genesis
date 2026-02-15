/**
 * Tool Promoter — Lifecycle management with usage-based promotion
 *
 * Lifecycle: draft → testing → candidate → permanent → deprecated
 * Tools earn permanence through successful use. Unused tools decay.
 */

import { DynamicTool, ToolStatus, ToolFactoryConfig, DEFAULT_FACTORY_CONFIG } from './types.js';

export class ToolPromoter {
  constructor(private config: ToolFactoryConfig = DEFAULT_FACTORY_CONFIG) {}

  evaluate(tool: DynamicTool): ToolStatus {
    const daysSinceUse = (Date.now() - tool.lastUsed.getTime()) / (1000 * 60 * 60 * 24);
    const successRate = tool.usageCount > 0 ? tool.successCount / tool.usageCount : 0;

    // Deprecation: unused tools decay
    if (tool.status !== 'draft' && daysSinceUse > this.config.decayDays) {
      return 'deprecated';
    }

    if (tool.status === 'testing' && tool.usageCount >= this.config.candidateThreshold) {
      return successRate >= this.config.successRateMin ? 'candidate' : 'deprecated';
    }

    if (tool.status === 'candidate' && tool.usageCount >= this.config.permanentThreshold) {
      return successRate >= this.config.successRateMin ? 'permanent' : 'deprecated';
    }

    return tool.status;
  }

  /**
   * Garbage collect: remove deprecated, enforce max cap
   * Returns names of tools to remove
   */
  gc(tools: DynamicTool[]): string[] {
    const toRemove: string[] = [];

    for (const tool of tools) {
      if (tool.status === 'deprecated') toRemove.push(tool.name);
    }

    const active = tools.filter(t => !toRemove.includes(t.name) && t.status !== 'deprecated');
    if (active.length > this.config.maxActiveDynamicTools) {
      const evictable = active
        .filter(t => t.status !== 'permanent')
        .sort((a, b) => a.usageCount - b.usageCount);
      const excess = active.length - this.config.maxActiveDynamicTools;
      for (let i = 0; i < excess && i < evictable.length; i++) {
        toRemove.push(evictable[i].name);
      }
    }

    return toRemove;
  }
}
