/**
 * Genesis Event Bus — Strict Typed Publisher & Subscriber
 *
 * Provides compile-time enforcement that a module can only publish or subscribe
 * to the topic subset it explicitly declares at construction time.
 *
 * Problem this solves:
 *   createPublisher() in index.ts uses `as any` when spreading `source` into the
 *   payload, which means callers can publish the wrong event shape and TypeScript
 *   will not catch it.
 *
 * Design:
 *   TypedPublisher<Topics> wraps GenesisEventBus and constrains the topic
 *   parameter on publish() to `Topics & GenesisEventTopic` so that any topic
 *   outside the declared set is a type error.  The payload type is derived
 *   directly from GenesisEventMap[K] with only `seq`, `timestamp`, and `source`
 *   omitted — identical to what the bus expects — so no `as any` is needed.
 *
 *   TypedSubscriber<Topics> applies the same restriction to on() / once().
 *
 * Scientific grounding:
 *   Modules act as Markov Blanket boundaries.  Restricting the topic alphabet at
 *   the type level is an explicit declaration of a module's information boundary,
 *   preventing cross-boundary signal leakage at compile time.
 */

import type { GenesisEventMap, GenesisEventTopic, BusEvent } from './events.js';
import type { Subscription, SubscribeOptions } from './event-bus.js';
import { getEventBus } from './index.js';

// ============================================================================
// Payload helper
// ============================================================================

/**
 * Fields the bus injects automatically on every publish call.
 * Callers must supply everything else that the event interface declares.
 */
type AutoInjected = 'seq' | 'timestamp';

/**
 * What a caller must provide when publishing topic K with a scoped publisher.
 * `source` is supplied by the publisher itself; `seq`/`timestamp` are injected
 * by the bus.  Every other field declared on GenesisEventMap[K] is required.
 */
type PublishPayload<K extends GenesisEventTopic> = Omit<
  GenesisEventMap[K],
  AutoInjected | 'source'
>;

// ============================================================================
// TypedPublisher
// ============================================================================

/**
 * A publisher whose topic parameter is constrained to the declared topic set
 * `Topics`.  Calling publish() with any topic outside that set is a compile-time
 * error.
 *
 * @template Topics — union of GenesisEventTopic strings this publisher may emit
 */
export interface TypedPublisher<Topics extends GenesisEventTopic> {
  /**
   * Publish an event.  The topic must be in the declared topic set; the payload
   * must match the event type for that topic exactly (minus auto-injected fields
   * and `source`).
   */
  publish<K extends Topics>(
    topic: K,
    payload: PublishPayload<K>,
  ): GenesisEventMap[K];

  /**
   * Execute a callback within an explicit correlation context.  All events
   * published inside `fn` share the provided correlation ID.
   */
  withCorrelation<T>(correlationId: string, fn: () => T): T;

  /** Source identifier this publisher was created with. */
  readonly source: string;
}

// ============================================================================
// TypedSubscriber
// ============================================================================

/**
 * A subscriber whose topic parameter is constrained to the declared topic set
 * `Topics`.  Calling on() or once() with any topic outside that set is a
 * compile-time error.
 *
 * @template Topics — union of GenesisEventTopic strings this subscriber may
 *   listen to
 */
export interface TypedSubscriber<Topics extends GenesisEventTopic> {
  /**
   * Subscribe to a topic within the declared set.
   */
  on<K extends Topics>(
    topic: K,
    handler: (event: GenesisEventMap[K]) => void | Promise<void>,
    options?: SubscribeOptions,
  ): Subscription;

  /**
   * Subscribe to a topic within the declared set for exactly one event, then
   * automatically unsubscribe.
   */
  once<K extends Topics>(
    topic: K,
    handler: (event: GenesisEventMap[K]) => void | Promise<void>,
    options?: SubscribeOptions,
  ): Subscription;

  /**
   * Subscribe to all events whose topic string starts with `prefix`.
   * This is intentionally untyped (prefix matching is inherently open) but
   * still delegates to the underlying bus correctly.
   */
  onPrefix(
    prefix: string,
    handler: (event: BusEvent) => void | Promise<void>,
    options?: SubscribeOptions,
  ): Subscription;

  /**
   * Cancel every subscription created through this subscriber instance.
   */
  unsubscribeAll(): void;

  /** Number of active subscriptions held by this instance. */
  readonly subscriptionCount: number;

  /** Module identifier this subscriber was created with. */
  readonly moduleId: string;
}

// ============================================================================
// Factory: createTypedPublisher
// ============================================================================

/**
 * Create a publisher restricted to the explicitly listed topics.
 *
 * The `topics` array drives the `Topics` type union via `T[number]`; at runtime
 * the array is unused after construction (the bus itself handles routing).
 *
 * @param source  - Module ID injected as the `source` field on every event.
 * @param topics  - Tuple of topic strings that this publisher is allowed to
 *   emit.  Must be declared `as const` at the call site so TypeScript infers a
 *   tuple literal rather than `string[]`.
 *
 * @example
 * ```typescript
 * const pub = createTypedPublisher('fek', [
 *   'kernel.cycle.completed',
 *   'kernel.prediction.error',
 * ] as const);
 *
 * // Compiles — topic is in the declared set:
 * pub.publish('kernel.cycle.completed', {
 *   cycle: 1,
 *   mode: 'awake',
 *   totalFE: 0.5,
 *   levels: {},
 *   emotional: { valence: 0, arousal: 0 },
 *   precision: 1.0,
 * });
 *
 * // Does NOT compile — topic is not in the declared set:
 * pub.publish('brain.cycle.started', { ... });
 * //           ~~~~~~~~~~~~~~~~~~~ Error: Argument of type '"brain.cycle.started"'
 * //           is not assignable to parameter of type
 * //           '"kernel.cycle.completed" | "kernel.prediction.error"'
 * ```
 */
export function createTypedPublisher<
  const T extends ReadonlyArray<GenesisEventTopic>,
>(
  source: string,
  // _topics is consumed only for type inference of T.  The `const` modifier on
  // the type parameter ensures string literals are preserved (tuple literal vs
  // widened string[]).
  _topics: T,
): TypedPublisher<T[number]> {
  const eventBus = getEventBus();

  return {
    source,

    publish<K extends T[number]>(
      topic: K,
      payload: PublishPayload<K>,
    ): GenesisEventMap[K] {
      // Build the full payload that GenesisEventBus.publish() expects:
      //   Omit<GenesisEventMap[K], 'seq' | 'timestamp'>
      //
      // `payload` is PublishPayload<K> = Omit<GenesisEventMap[K], 'seq'|'timestamp'|'source'>
      // Adding `source` back yields a shape that is structurally identical to
      // Omit<GenesisEventMap[K], 'seq'|'timestamp'>.
      //
      // TypeScript cannot verify this identity through object spread because
      // spread types are widened to an intersection, not a mapped Omit.  A
      // single `as` assertion is required here.  It is sound: we are not hiding
      // excess properties, we are only restoring the `source` field that the
      // PublishPayload helper removed.  This replaces the looser `as any` used
      // in createPublisher() with a precise, verifiable cast.
      const fullPayload = { ...payload, source } as Omit<
        GenesisEventMap[K],
        AutoInjected
      >;

      return eventBus.publish(topic, fullPayload);
    },

    withCorrelation<R>(correlationId: string, fn: () => R): R {
      return eventBus.withCorrelation(correlationId, fn);
    },
  };
}

// ============================================================================
// Factory: createTypedSubscriber
// ============================================================================

/**
 * Create a subscriber restricted to the explicitly listed topics.
 *
 * Subscriptions are tracked internally so that `unsubscribeAll()` can cancel
 * them all at module teardown without requiring the caller to retain individual
 * `Subscription` handles.
 *
 * @param moduleId - Module ID used to build stable subscription IDs and as a
 *   label for debugging.
 * @param topics   - Tuple of topic strings this subscriber is allowed to listen
 *   to.  Must be declared `as const` at the call site.
 *
 * @example
 * ```typescript
 * const sub = createTypedSubscriber('neuromodulation', [
 *   'kernel.prediction.error',
 *   'kernel.cycle.completed',
 * ] as const);
 *
 * // Compiles:
 * sub.on('kernel.prediction.error', (e) => handleError(e.magnitude));
 *
 * // Does NOT compile — topic is not in the declared set:
 * sub.on('brain.cycle.started', (e) => { ... });
 * ```
 */
export function createTypedSubscriber<
  const T extends ReadonlyArray<GenesisEventTopic>,
>(
  moduleId: string,
  _topics: T,
): TypedSubscriber<T[number]> {
  const eventBus = getEventBus();
  const subscriptions: Subscription[] = [];

  return {
    moduleId,

    on<K extends T[number]>(
      topic: K,
      handler: (event: GenesisEventMap[K]) => void | Promise<void>,
      options?: SubscribeOptions,
    ): Subscription {
      const sub = eventBus.subscribe(topic, handler, {
        ...options,
        id: options?.id ?? `${moduleId}-${String(topic)}-${subscriptions.length}`,
      });
      subscriptions.push(sub);
      return sub;
    },

    once<K extends T[number]>(
      topic: K,
      handler: (event: GenesisEventMap[K]) => void | Promise<void>,
      options?: SubscribeOptions,
    ): Subscription {
      const sub = eventBus.once(topic, handler, {
        ...options,
        id:
          options?.id ??
          `${moduleId}-once-${String(topic)}-${subscriptions.length}`,
      });
      subscriptions.push(sub);
      return sub;
    },

    onPrefix(
      prefix: string,
      handler: (event: BusEvent) => void | Promise<void>,
      options?: SubscribeOptions,
    ): Subscription {
      const sub = eventBus.subscribePrefix(prefix, handler, options);
      subscriptions.push(sub);
      return sub;
    },

    unsubscribeAll(): void {
      for (const sub of subscriptions) {
        sub.unsubscribe();
      }
      subscriptions.length = 0;
    },

    get subscriptionCount(): number {
      return subscriptions.length;
    },
  };
}
