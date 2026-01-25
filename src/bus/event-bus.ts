/**
 * Genesis Event Bus - Core Implementation
 *
 * A typed, precision-weighted event bus implementing Global Workspace Theory
 * for inter-module communication in the Genesis cognitive architecture.
 *
 * Features:
 * - Type-safe publish/subscribe with GenesisEventMap
 * - Priority-ordered dispatch (critical handlers first)
 * - Async handler support (non-blocking)
 * - Ring-buffer history for late-joining subscribers
 * - Prefix-based subscriptions for domain monitoring
 * - Memory-safe unsubscription
 * - Correlation IDs for causal tracing
 *
 * Scientific grounding:
 * - Acts as Markov Blanket boundary between modules
 * - Precision field enables reliability-weighted processing
 * - History buffer supports temporal integration
 */

import type {
  GenesisEventMap,
  GenesisEventTopic,
  BusEvent,
} from './events.js';

// ============================================================================
// Types
// ============================================================================

/** Handler function type */
type EventHandler<T extends BusEvent> = (event: T) => void | Promise<void>;

/** Subscription handle with unsubscribe capability */
export interface Subscription {
  /** Unique subscription ID */
  id: string;
  /** Topic subscribed to */
  topic: GenesisEventTopic | string;
  /** Remove this subscription */
  unsubscribe: () => void;
}

/** Internal subscriber record */
interface SubscriberRecord {
  handler: EventHandler<any>;
  priority: number;
  async: boolean;
}

/** Subscribe options */
export interface SubscribeOptions {
  /** Higher priority = called first. Default 0. */
  priority?: number;
  /** Custom subscription ID */
  id?: string;
}

/** History entry */
interface HistoryEntry {
  topic: string;
  event: BusEvent;
}

/** Bus statistics */
export interface BusStats {
  topics: number;
  totalSubscriptions: number;
  eventsPublished: number;
  historySize: number;
}

// ============================================================================
// Event Bus Implementation
// ============================================================================

export class GenesisEventBus {
  private seq = 0;
  private subscribers = new Map<string, Map<string, SubscriberRecord>>();
  private history: HistoryEntry[] = [];
  private readonly maxHistory: number;
  private correlationStack: string[] = [];

  constructor(options?: { maxHistory?: number }) {
    this.maxHistory = options?.maxHistory ?? 500;
  }

  // --------------------------------------------------------------------------
  // Publishing
  // --------------------------------------------------------------------------

  /**
   * Publish an event to all subscribers.
   * Synchronous handlers execute in priority order.
   * Async handlers are dispatched but not awaited (fire-and-forget with error logging).
   *
   * @param topic - The event topic
   * @param payload - Event data (seq and timestamp added automatically)
   * @returns The complete event with sequence number
   */
  publish<K extends GenesisEventTopic>(
    topic: K,
    payload: Omit<GenesisEventMap[K], 'seq' | 'timestamp'>,
  ): GenesisEventMap[K] {
    const event = {
      ...payload,
      seq: ++this.seq,
      timestamp: new Date().toISOString(),
      correlationId: payload.correlationId ?? this.currentCorrelation(),
    } as GenesisEventMap[K];

    this.recordHistory(topic, event);
    this.dispatch(topic, event);

    return event;
  }

  /**
   * Publish with a specific correlation ID for causal tracing.
   */
  publishWithCorrelation<K extends GenesisEventTopic>(
    topic: K,
    payload: Omit<GenesisEventMap[K], 'seq' | 'timestamp' | 'correlationId'>,
    correlationId: string,
  ): GenesisEventMap[K] {
    return this.publish(topic, { ...payload, correlationId } as any);
  }

  /**
   * Execute a function within a correlation context.
   * All events published within the callback share the correlation ID.
   */
  withCorrelation<T>(correlationId: string, fn: () => T): T {
    this.correlationStack.push(correlationId);
    try {
      return fn();
    } finally {
      this.correlationStack.pop();
    }
  }

  private currentCorrelation(): string | undefined {
    return this.correlationStack.length > 0
      ? this.correlationStack[this.correlationStack.length - 1]
      : undefined;
  }

  private recordHistory(topic: string, event: BusEvent): void {
    this.history.push({ topic, event });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  private dispatch(topic: string, event: BusEvent): void {
    const subs = this.subscribers.get(topic);
    if (!subs || subs.size === 0) return;

    // Sort by priority (descending)
    const sorted = [...subs.values()].sort((a, b) => b.priority - a.priority);

    for (const sub of sorted) {
      try {
        const result = sub.handler(event);
        if (result instanceof Promise) {
          result.catch((err) => {
            console.error(`[EventBus] Async handler error on ${topic}:`, err);
          });
        }
      } catch (err) {
        console.error(`[EventBus] Sync handler error on ${topic}:`, err);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Subscribing
  // --------------------------------------------------------------------------

  /**
   * Subscribe to a specific topic.
   *
   * @param topic - The event topic to subscribe to
   * @param handler - Function called when event is published
   * @param options - Priority and custom ID
   * @returns Subscription with unsubscribe method
   */
  subscribe<K extends GenesisEventTopic>(
    topic: K,
    handler: EventHandler<GenesisEventMap[K]>,
    options?: SubscribeOptions,
  ): Subscription {
    const id = options?.id ?? `sub-${++this.seq}`;
    const priority = options?.priority ?? 0;

    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Map());
    }

    this.subscribers.get(topic)!.set(id, {
      handler,
      priority,
      async: true,
    });

    return {
      id,
      topic,
      unsubscribe: () => {
        this.subscribers.get(topic)?.delete(id);
      },
    };
  }

  /**
   * Subscribe to multiple topics matching a prefix.
   * E.g., subscribePrefix('kernel.') matches all kernel events.
   *
   * @param prefix - Topic prefix to match
   * @param handler - Function called for matching events
   * @param options - Priority settings
   * @returns Subscription covering all matching topics
   */
  subscribePrefix(
    prefix: string,
    handler: EventHandler<BusEvent>,
    options?: SubscribeOptions,
  ): Subscription {
    const id = options?.id ?? `prefix-${++this.seq}`;
    const priority = options?.priority ?? 0;

    // Store as a special prefix subscription
    const prefixKey = `__prefix__${prefix}`;
    if (!this.subscribers.has(prefixKey)) {
      this.subscribers.set(prefixKey, new Map());
    }

    this.subscribers.get(prefixKey)!.set(id, {
      handler,
      priority,
      async: true,
    });

    // Override dispatch to check prefixes
    const originalDispatch = this.dispatch.bind(this);
    this.dispatch = (topic: string, event: BusEvent) => {
      originalDispatch(topic, event);

      // Check prefix subscriptions
      for (const [key, subs] of this.subscribers) {
        if (key.startsWith('__prefix__')) {
          const p = key.slice('__prefix__'.length);
          if (topic.startsWith(p)) {
            for (const sub of subs.values()) {
              try {
                const result = sub.handler(event);
                if (result instanceof Promise) {
                  result.catch((err) => {
                    console.error(`[EventBus] Prefix handler error:`, err);
                  });
                }
              } catch (err) {
                console.error(`[EventBus] Prefix handler error:`, err);
              }
            }
          }
        }
      }
    };

    return {
      id,
      topic: prefix,
      unsubscribe: () => {
        this.subscribers.get(prefixKey)?.delete(id);
      },
    };
  }

  /**
   * Subscribe to all events (useful for logging/monitoring).
   */
  subscribeAll(
    handler: EventHandler<BusEvent>,
    options?: SubscribeOptions,
  ): Subscription {
    return this.subscribePrefix('', handler, options);
  }

  /**
   * One-time subscription that auto-unsubscribes after first event.
   */
  once<K extends GenesisEventTopic>(
    topic: K,
    handler: EventHandler<GenesisEventMap[K]>,
    options?: SubscribeOptions,
  ): Subscription {
    const sub = this.subscribe(
      topic,
      (event) => {
        sub.unsubscribe();
        return handler(event);
      },
      options,
    );
    return sub;
  }

  // --------------------------------------------------------------------------
  // History & Introspection
  // --------------------------------------------------------------------------

  /**
   * Get recent event history (useful for late-joining subscribers).
   *
   * @param topic - Optional topic filter
   * @param limit - Maximum entries to return
   */
  getHistory(topic?: GenesisEventTopic, limit = 50): HistoryEntry[] {
    const filtered = topic
      ? this.history.filter((h) => h.topic === topic)
      : this.history;
    return filtered.slice(-limit);
  }

  /**
   * Get events matching a correlation ID.
   */
  getCorrelatedEvents(correlationId: string): HistoryEntry[] {
    return this.history.filter((h) => h.event.correlationId === correlationId);
  }

  /**
   * Wait for a specific event (promise-based).
   */
  waitFor<K extends GenesisEventTopic>(
    topic: K,
    predicate?: (event: GenesisEventMap[K]) => boolean,
    timeoutMs = 30000,
  ): Promise<GenesisEventMap[K]> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        sub.unsubscribe();
        reject(new Error(`Timeout waiting for ${topic}`));
      }, timeoutMs);

      const sub = this.subscribe(topic, (event) => {
        if (!predicate || predicate(event)) {
          clearTimeout(timeout);
          sub.unsubscribe();
          resolve(event);
        }
      });
    });
  }

  /**
   * List all active topic subscriptions.
   */
  listTopics(): string[] {
    return [...this.subscribers.keys()].filter(
      (k) => !k.startsWith('__prefix__'),
    );
  }

  /**
   * Get statistics for monitoring.
   */
  stats(): BusStats {
    let totalSubs = 0;
    for (const subs of this.subscribers.values()) {
      totalSubs += subs.size;
    }
    return {
      topics: this.listTopics().length,
      totalSubscriptions: totalSubs,
      eventsPublished: this.seq,
      historySize: this.history.length,
    };
  }

  /**
   * Check if a topic has any subscribers.
   */
  hasSubscribers(topic: GenesisEventTopic): boolean {
    const subs = this.subscribers.get(topic);
    return subs !== undefined && subs.size > 0;
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Clear all subscriptions (useful for testing).
   */
  clear(): void {
    this.subscribers.clear();
    this.history = [];
    this.correlationStack = [];
  }

  /**
   * Clear history only.
   */
  clearHistory(): void {
    this.history = [];
  }
}
