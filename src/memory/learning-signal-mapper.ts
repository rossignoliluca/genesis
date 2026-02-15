/**
 * Genesis — Learning Signal Mapper
 *
 * Central bus subscriber that captures learning-relevant events
 * (tool outcomes, rewards, punishments, surprises) and writes them
 * to memory automatically. This closes the loop between bus signals
 * and persistent learning.
 *
 * Subscribes to:
 *   - brain.tool.executed → semantic memory (tool effectiveness)
 *   - neuromod.reward → episodic memory (what led to good outcomes)
 *   - neuromod.punishment → episodic memory (what led to bad outcomes)
 *   - active-inference.surprise.detected → episodic memory (unexpected events)
 */

import { createSubscriber } from '../bus/index.js';
import { getMemorySystem } from './index.js';

let initialized = false;

export function initLearningSignalMapper(): void {
  if (initialized) return;
  initialized = true;

  const sub = createSubscriber('learning-signal-mapper');
  const mem = getMemorySystem();

  // 1. Tool outcomes → semantic memory (which tools work for what)
  //    Only record notable events: slow tools or failures
  sub.on('brain.tool.executed', (event) => {
    if (event.durationMs > 5000 || !event.success) {
      mem.learn({
        concept: `tool-outcome:${event.toolName}:${Date.now()}`,
        definition: `Tool ${event.toolName} ${event.success ? 'succeeded' : 'failed'} in ${event.durationMs}ms`,
        category: 'tool-learning',
      });
    }
  });

  // 2. Rewards → episodic memory (what led to good outcomes)
  sub.on('neuromod.reward', (event) => {
    mem.remember({
      what: `Reward (${event.magnitude.toFixed(2)}): ${event.cause}`,
      tags: ['reward', 'learning-signal'],
    });
  });

  // 3. Punishments → episodic memory (what led to bad outcomes)
  sub.on('neuromod.punishment', (event) => {
    mem.remember({
      what: `Punishment (${event.magnitude.toFixed(2)}): ${event.cause}`,
      tags: ['punishment', 'learning-signal'],
    });
  });

  // 4. Surprise → episodic memory (unexpected events for future predictions)
  sub.on('active-inference.surprise.detected', (event) => {
    if (event.surprise > event.threshold) {
      mem.remember({
        what: `Surprise: action="${event.action}" outcome="${event.outcome}" surprise=${event.surprise.toFixed(2)}`,
        tags: ['surprise', 'learning-signal'],
      });
    }
  });

  console.log('[Genesis] Learning signal mapper active: tool+reward+surprise → memory');
}

/**
 * Reset for testing purposes.
 */
export function resetLearningSignalMapper(): void {
  initialized = false;
}
