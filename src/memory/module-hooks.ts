/**
 * Genesis — Memory Module Hooks
 *
 * Shared helper functions to eliminate boilerplate when integrating
 * memory into reasoning and autonomous modules.
 *
 * Pattern: recall on init, record on completion.
 */

import { getMemorySystem } from './index.js';

/**
 * Recall past lessons for a module domain.
 * Returns definition strings from semantic memory.
 */
export function recallModuleLessons(module: string, limit = 5): string[] {
  const mem = getMemorySystem();
  const results = mem.recall(`${module} lesson`, { types: ['semantic'], limit });
  return results
    .map(r => (r as any).content?.definition || '')
    .filter(Boolean);
}

/**
 * Record a lesson learned by a module into semantic memory.
 */
export function recordModuleLesson(module: string, lesson: string): void {
  const mem = getMemorySystem();
  mem.learn({
    concept: `${module}:lesson:${Date.now()}`,
    definition: lesson,
    category: module,
  });
}

/**
 * Record a skill learned by a module into procedural memory.
 */
export function recordModuleSkill(
  module: string,
  name: string,
  description: string,
  steps: string[],
): void {
  const mem = getMemorySystem();
  mem.learnSkill({
    name: `${module}:${name}`,
    description,
    steps: steps.map(s => ({ action: s })),
  });
}
