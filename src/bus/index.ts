/**
 * Genesis Event Bus - Public API
 *
 * Provides a singleton event bus for inter-module communication.
 *
 * Usage:
 * ```typescript
 * import { getEventBus, bus } from './bus/index.js';
 *
 * // Using singleton
 * const eventBus = getEventBus();
 * eventBus.publish('kernel.cycle.completed', { ... });
 *
 * // Using shorthand
 * bus.subscribe('neuromod.reward', (e) => console.log(e));
 * ```
 */

import { GenesisEventBus } from './event-bus.js';

// Re-export types and classes
export { GenesisEventBus } from './event-bus.js';
export type { Subscription, SubscribeOptions, BusStats } from './event-bus.js';

export type {
  // Base
  BusEvent,
  GenesisEventMap,
  GenesisEventTopic,
  EventForTopic,
  // Kernel events
  FEKCycleEvent,
  PredictionErrorEvent,
  ModeChangeEvent,
  TaskEvent,
  TaskFailedEvent,
  PanicEvent,
  // Consciousness events
  IgnitionEvent,
  PhiUpdateEvent,
  InvariantViolationEvent,
  AttentionShiftEvent,
  // Active Inference events
  BeliefsUpdatedEvent,
  PolicyInferredEvent,
  ActionSelectedEvent,
  SurpriseEvent,
  // Neuromodulation events
  NeuromodLevels,
  ModulationEffect,
  NeuromodLevelsEvent,
  NeuromodSignalEvent,
  // Pain events
  PainStimulusEvent,
  PainStateEvent,
  // Allostasis events
  AllostasisRegulationEvent,
  SetpointAdaptedEvent,
  // Economic events
  EconomicCostEvent,
  EconomicRevenueEvent,
  NESSDeviationEvent,
  BudgetEvent,
  // Brain events
  BrainCycleEvent,
  ToolExecutedEvent,
  LLMRequestEvent,
  LLMResponseEvent,
  HealingEvent,
  // Memory events
  MemoryRecalledEvent,
  MemoryConsolidatedEvent,
  MemoryDreamEvent,
  // World model events
  ConsistencyViolationEvent,
  WorldPredictionEvent,
  // Lifecycle events
  SystemLifecycleEvent,
  HookExecutedEvent,
  // Self-modification events
  SelfImprovementEvent,
} from './events.js';

// ============================================================================
// Singleton Instance
// ============================================================================

let busInstance: GenesisEventBus | null = null;

/**
 * Get the singleton event bus instance.
 * Creates the bus on first call.
 */
export function getEventBus(): GenesisEventBus {
  if (!busInstance) {
    busInstance = new GenesisEventBus({ maxHistory: 500 });
  }
  return busInstance;
}

/**
 * Reset the event bus (for testing).
 * Clears all subscriptions and history.
 */
export function resetEventBus(): void {
  if (busInstance) {
    busInstance.clear();
  }
  busInstance = null;
}

/**
 * Shorthand for getEventBus() for more concise code.
 *
 * @example
 * ```typescript
 * import { bus } from './bus/index.js';
 * bus.publish('kernel.mode.changed', { ... });
 * ```
 */
export const bus = new Proxy({} as GenesisEventBus, {
  get(_target, prop) {
    const instance = getEventBus();
    const value = (instance as any)[prop];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});

// ============================================================================
// Convenience Helpers
// ============================================================================

/**
 * Generate a unique correlation ID for event tracing.
 */
export function generateCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a scoped publisher for a specific module.
 * Automatically sets the source field.
 *
 * @example
 * ```typescript
 * const fekPublisher = createPublisher('fek');
 * fekPublisher.publish('kernel.cycle.completed', { cycle: 1, ... });
 * ```
 */
export function createPublisher(source: string) {
  const eventBus = getEventBus();

  return {
    publish<K extends keyof import('./events.js').GenesisEventMap>(
      topic: K,
      payload: Omit<
        import('./events.js').GenesisEventMap[K],
        'seq' | 'timestamp' | 'source'
      >,
    ) {
      return eventBus.publish(topic, { ...payload, source } as any);
    },

    withCorrelation<T>(correlationId: string, fn: () => T): T {
      return eventBus.withCorrelation(correlationId, fn);
    },
  };
}

/**
 * Create a subscriber that automatically handles cleanup on module shutdown.
 *
 * @example
 * ```typescript
 * const neuroSub = createSubscriber('neuromodulation');
 * neuroSub.on('kernel.prediction.error', (e) => this.novelty(e.magnitude));
 * // Later:
 * neuroSub.unsubscribeAll();
 * ```
 */
export function createSubscriber(moduleId: string) {
  const eventBus = getEventBus();
  const subscriptions: import('./event-bus.js').Subscription[] = [];

  return {
    on<K extends keyof import('./events.js').GenesisEventMap>(
      topic: K,
      handler: (event: import('./events.js').GenesisEventMap[K]) => void,
      options?: import('./event-bus.js').SubscribeOptions,
    ) {
      const sub = eventBus.subscribe(topic, handler, {
        ...options,
        id: options?.id ?? `${moduleId}-${topic}-${subscriptions.length}`,
      });
      subscriptions.push(sub);
      return sub;
    },

    onPrefix(
      prefix: string,
      handler: (event: import('./events.js').BusEvent) => void,
      options?: import('./event-bus.js').SubscribeOptions,
    ) {
      const sub = eventBus.subscribePrefix(prefix, handler, options);
      subscriptions.push(sub);
      return sub;
    },

    once<K extends keyof import('./events.js').GenesisEventMap>(
      topic: K,
      handler: (event: import('./events.js').GenesisEventMap[K]) => void,
      options?: import('./event-bus.js').SubscribeOptions,
    ) {
      const sub = eventBus.once(topic, handler, options);
      subscriptions.push(sub);
      return sub;
    },

    unsubscribeAll() {
      for (const sub of subscriptions) {
        sub.unsubscribe();
      }
      subscriptions.length = 0;
    },

    get subscriptionCount() {
      return subscriptions.length;
    },
  };
}
