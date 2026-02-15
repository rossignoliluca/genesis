/**
 * Tool Library — Voyager-style persistent storage with semantic retrieval
 */

import { getMemorySystem } from '../memory/index.js';
import { DynamicTool } from './types.js';

export class ToolLibrary {
  private tools = new Map<string, DynamicTool>();

  async store(tool: DynamicTool): Promise<void> {
    this.tools.set(tool.name, tool);

    const memory = getMemorySystem();
    memory.learnSkill({
      name: `dynamic-tool:${tool.name}`,
      description: tool.description,
      steps: [
        { action: 'store-source', params: { source: tool.source } },
        { action: 'store-schema', params: { schema: JSON.stringify(tool.paramSchema) } },
        { action: 'store-meta', params: { version: tool.version, status: tool.status, usageCount: tool.usageCount, successCount: tool.successCount } },
      ],
    });
  }

  async retrieve(taskDescription: string, topK = 5): Promise<DynamicTool[]> {
    // First try in-memory
    const results: Array<{ tool: DynamicTool; score: number }> = [];

    for (const tool of this.tools.values()) {
      if (tool.status === 'deprecated') continue;
      const score = this.textSimilarity(taskDescription, `${tool.name} ${tool.description} ${tool.createdFrom}`);
      if (score > 0.1) results.push({ tool, score });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(r => r.tool);
  }

  getAll(): DynamicTool[] {
    return Array.from(this.tools.values());
  }

  get(name: string): DynamicTool | undefined {
    return this.tools.get(name);
  }

  remove(name: string): boolean {
    return this.tools.delete(name);
  }

  private textSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 2));
    const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 2));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let overlap = 0;
    for (const w of wordsA) if (wordsB.has(w)) overlap++;
    return (2 * overlap) / (wordsA.size + wordsB.size);
  }
}
