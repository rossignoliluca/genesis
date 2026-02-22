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
  // Legacy fields — preserved for backward compatibility
  topics: number;
  totalSubscriptions: number;
  eventsPublished: number;
  historySize: number;
  // Extended fields (Phase 9)
  /** Number of topics that currently have at least one subscriber */
  topicCount: number;
  /** Total subscriber count across all topics and prefix subscriptions */
  totalSubscribers: number;
  /** Top 10 topics by subscriber count */
  topTopics: Array<{ topic: string; count: number }>;
  /** Total events published since bus creation (or last clear) */
  totalPublished: number;
  /** Total subscriber errors caught since bus creation (or last clear) */
  totalErrors: number;
}

// ============================================================================
// Event Bus Implementation
// ============================================================================

export class GenesisEventBus {
  private seq = 0;
  private subscribers = new Map<string, Map<string, SubscriberRecord>>();
  private prefixSubscribers = new Map<string, Map<string, SubscriberRecord>>(); // v16.1.2: Separate registry for prefix subs
  private history: HistoryEntry[] = [];
  private readonly maxHistory: number;
  private correlationStack: string[] = [];

  // Phase 9: hardening counters
  private publishedCount = 0;
  private errorCount = 0;
  // Topics that have already triggered a leak warning (warn only once per topic)
  private readonly warnedLeakTopics = new Set<string>();
  // Per-topic rate limits: maxPerSecond
  private readonly rateLimits = new Map<string, number>();
  // Per-topic sliding window: timestamps of recent publishes within the current second
  private readonly rateWindows = new Map<string, number[]>();
  private static readonly LEAK_THRESHOLD = 50;

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
    // Phase 9: rate-limit check — drop event silently when over limit
    if (this.isRateLimited(topic)) {
      // Return a minimal synthetic event so callers that use the return value don't crash
      return {
        ...payload,
        seq: this.seq,
        timestamp: new Date().toISOString(),
        correlationId: payload.correlationId ?? this.currentCorrelation(),
      } as GenesisEventMap[K];
    }

    const event = {
      ...payload,
      seq: ++this.seq,
      timestamp: new Date().toISOString(),
      correlationId: payload.correlationId ?? this.currentCorrelation(),
    } as GenesisEventMap[K];

    this.publishedCount++;
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
    // v16.1.2: Dispatch to exact topic subscribers
    const subs = this.subscribers.get(topic);
    if (subs && subs.size > 0) {
      // Sort by priority (descending)
      const sorted = [...subs.values()].sort((a, b) => b.priority - a.priority);

      for (const sub of sorted) {
        // Phase 9: each subscriber invocation is isolated — one throw must not
        // prevent the remaining subscribers from receiving the event
        try {
          const result = sub.handler(event);
          if (result instanceof Promise) {
            result.catch((err) => {
              this.errorCount++;
              console.error(`[EventBus] Async handler error on topic "${topic}" (sub id unknown):`, err);
            });
          }
        } catch (err) {
          this.errorCount++;
          console.error(`[EventBus] Sync handler error on topic "${topic}":`, err);
        }
      }
    }

    // v16.1.2: Dispatch to prefix subscribers (FIX: no longer overrides dispatch)
    for (const [prefix, prefixSubs] of this.prefixSubscribers) {
      if (topic.startsWith(prefix)) {
        const sorted = [...prefixSubs.values()].sort((a, b) => b.priority - a.priority);
        for (const sub of sorted) {
          // Phase 9: same isolation guarantee for prefix subscribers
          try {
            const result = sub.handler(event);
            if (result instanceof Promise) {
              result.catch((err) => {
                this.errorCount++;
                console.error(`[EventBus] Async prefix handler error on prefix "${prefix}":`, err);
              });
            }
          } catch (err) {
            this.errorCount++;
            console.error(`[EventBus] Sync prefix handler error on prefix "${prefix}":`, err);
          }
        }
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

    // Phase 9: leak detection — warn once when a topic accumulates too many subscribers
    this.checkSubscriberLeak(topic, this.subscribers.get(topic)!.size);

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
   * v16.1.2: Fixed race condition - now uses separate prefixSubscribers registry
   * instead of overriding dispatch() on each call.
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

    // v16.1.2: Use dedicated prefix registry (FIX: no race condition)
    if (!this.prefixSubscribers.has(prefix)) {
      this.prefixSubscribers.set(prefix, new Map());
    }

    this.prefixSubscribers.get(prefix)!.set(id, {
      handler,
      priority,
      async: true,
    });

    // Phase 9: leak detection for prefix subscriptions (use "prefix:<value>" as key)
    const leakKey = `prefix:${prefix}`;
    this.checkSubscriberLeak(leakKey, this.prefixSubscribers.get(prefix)!.size);

    return {
      id,
      topic: prefix,
      unsubscribe: () => {
        this.prefixSubscribers.get(prefix)?.delete(id);
        // Clean up empty prefix maps
        if (this.prefixSubscribers.get(prefix)?.size === 0) {
          this.prefixSubscribers.delete(prefix);
        }
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
    // v16.1.2: No longer need to filter __prefix__ keys (moved to separate registry)
    return [...this.subscribers.keys()];
  }

  /**
   * List all active prefix subscriptions.
   * v16.1.2: New method to inspect prefix subscriptions
   */
  listPrefixes(): string[] {
    return [...this.prefixSubscribers.keys()];
  }

  /**
   * Get statistics for monitoring.
   *
   * Phase 9: extended with topicCount, totalSubscribers, topTopics,
   * totalPublished, and totalErrors.  Legacy fields (topics,
   * totalSubscriptions, eventsPublished, historySize) are preserved so that
   * existing callers continue to work without changes.
   */
  stats(): BusStats {
    let totalSubs = 0;

    // Build per-topic counts for topTopics calculation
    const topicCounts: Array<{ topic: string; count: number }> = [];

    for (const [topic, subs] of this.subscribers) {
      totalSubs += subs.size;
      topicCounts.push({ topic, count: subs.size });
    }
    // v16.1.2: Include prefix subscribers in count
    for (const [prefix, subs] of this.prefixSubscribers) {
      totalSubs += subs.size;
      topicCounts.push({ topic: `prefix:${prefix}`, count: subs.size });
    }

    topicCounts.sort((a, b) => b.count - a.count);
    const topTopics = topicCounts.slice(0, 10);

    const topicCount = this.subscribers.size;

    return {
      // Legacy fields
      topics: topicCount,
      totalSubscriptions: totalSubs,
      eventsPublished: this.seq,
      historySize: this.history.length,
      // Extended fields (Phase 9)
      topicCount,
      totalSubscribers: totalSubs,
      topTopics,
      totalPublished: this.publishedCount,
      totalErrors: this.errorCount,
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
  // Phase 9: Hardening Helpers
  // --------------------------------------------------------------------------

  /**
   * Emit a one-time warning when a topic's subscriber count passes the leak
   * threshold.  Subsequent additions to the same topic are silent.
   */
  private checkSubscriberLeak(topic: string, count: number): void {
    if (count > GenesisEventBus.LEAK_THRESHOLD && !this.warnedLeakTopics.has(topic)) {
      this.warnedLeakTopics.add(topic);
      console.warn(`[bus] Possible subscriber leak: topic "${topic}" has ${count} subscribers`);
    }
  }

  /**
   * Set an opt-in per-topic rate limit.
   * When the topic exceeds `maxPerSecond` publishes within any one-second
   * window the event is dropped and a debug log line is emitted.
   *
   * @param topic        - The exact topic string to rate-limit
   * @param maxPerSecond - Maximum number of events allowed per second (0 removes the limit)
   */
  setRateLimit(topic: string, maxPerSecond: number): void {
    if (maxPerSecond <= 0) {
      this.rateLimits.delete(topic);
      this.rateWindows.delete(topic);
    } else {
      this.rateLimits.set(topic, maxPerSecond);
    }
  }

  /**
   * Returns true when the topic is currently over its configured rate limit,
   * and emits a debug log.  The sliding window is maintained as a list of
   * publish timestamps; entries older than one second are pruned on every check.
   */
  private isRateLimited(topic: string): boolean {
    const limit = this.rateLimits.get(topic);
    if (limit === undefined) return false;

    const now = Date.now();
    let window = this.rateWindows.get(topic);
    if (!window) {
      window = [];
      this.rateWindows.set(topic, window);
    }

    // Prune timestamps older than 1 second
    const cutoff = now - 1000;
    let i = 0;
    while (i < window.length && window[i] < cutoff) i++;
    if (i > 0) window.splice(0, i);

    if (window.length >= limit) {
      console.debug(`[bus] Rate limit: topic "${topic}" exceeded ${limit}/s — event dropped`);
      return true;
    }

    window.push(now);
    return false;
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Clear all subscriptions (useful for testing).
   * Phase 9: also resets hardening state (counters, leak warnings, rate windows).
   */
  clear(): void {
    this.subscribers.clear();
    this.prefixSubscribers.clear(); // v16.1.2: Clear prefix subscribers too
    this.history = [];
    this.correlationStack = [];
    // Phase 9: reset counters and rate-limit state
    this.publishedCount = 0;
    this.errorCount = 0;
    this.warnedLeakTopics.clear();
    this.rateLimits.clear();
    this.rateWindows.clear();
  }

  /**
   * Clear history only.
   */
  clearHistory(): void {
    this.history = [];
  }
}
