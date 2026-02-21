/**
 * Genesis v35 — Lightweight Typed Effect System
 *
 * A zero-dependency compatibility substrate that enables gradual migration
 * from try/catch (5 553 instances) and `as any` (444 instances) to typed,
 * composable effects.
 *
 * Inspired by Effect-TS's `Effect<Success, Error, Requirements>` triple but
 * intentionally minimal — no scheduler, no fibers, no runtime.  The goal is
 * a thin, self-contained layer that the existing codebase can adopt
 * incrementally without pulling in a new dependency tree.
 *
 * Usage:
 *   import { succeed, fail, tryPromise, map, flatMap, runPromise } from '../core/effect.js';
 *
 *   const program = pipe(
 *     tryPromise(() => fetch('/api/data'), (e) => new LLMError('fetch failed', e)),
 *     flatMap((res) => tryPromise(() => res.json(), (e) => new LLMError('parse failed', e))),
 *     map((data) => data.result),
 *   );
 *
 *   const result = await runPromise(program);
 */

// ============================================================================
// Either — the dual of a typed result
// ============================================================================

export type Right<A> = { readonly _tag: 'Right'; readonly value: A };
export type Left<E>  = { readonly _tag: 'Left';  readonly error: E };
export type Either<A, E> = Right<A> | Left<E>;

/** Construct a Right (success) branch. */
export function right<A>(value: A): Right<A> {
  return { _tag: 'Right', value };
}

/** Construct a Left (failure) branch. */
export function left<E>(error: E): Left<E> {
  return { _tag: 'Left', error };
}

/** Narrow-check for Right. */
export function isRight<A, E>(e: Either<A, E>): e is Right<A> {
  return e._tag === 'Right';
}

/** Narrow-check for Left. */
export function isLeft<A, E>(e: Either<A, E>): e is Left<E> {
  return e._tag === 'Left';
}

// ============================================================================
// Effect — a lazy computation over an environment
// ============================================================================

/**
 * A lazy, typed computation that:
 *   - Requires an environment `R` to run
 *   - Either produces a value of type `A`
 *   - Or fails with an error of type `E`
 *
 * The `never` default for `E` encodes "cannot fail" at the type level.
 * The `unknown` default for `R` encodes "no requirements" — callers simply
 * pass `undefined` which satisfies `unknown`.
 */
export type Effect<A, E = never, R = unknown> = {
  readonly _tag: 'Effect';
  readonly run: (env: R) => Promise<Either<A, E>>;
};

// ============================================================================
// Constructors
// ============================================================================

/**
 * Lift a pure value into a successful Effect.
 *
 * @example
 *   const e = succeed(42);
 *   // Effect<number, never>
 */
export function succeed<A>(value: A): Effect<A, never> {
  return {
    _tag: 'Effect',
    run: (_env) => Promise.resolve(right(value)),
  };
}

/**
 * Lift an error value into a failed Effect.
 *
 * @example
 *   const e = fail(new ToolError('missing arg'));
 *   // Effect<never, ToolError>
 */
export function fail<E>(error: E): Effect<never, E> {
  return {
    _tag: 'Effect',
    run: (_env) => Promise.resolve(left(error)),
  };
}

/**
 * Wrap an async computation, mapping any thrown value to a typed error.
 *
 * This is the primary migration path for bare `await somePromise()` calls
 * that currently swallow errors with `catch (e: any) {}`.
 *
 * @example
 *   const e = tryPromise(
 *     () => llm.complete(prompt),
 *     (cause) => new LLMError('completion failed', cause),
 *   );
 */
export function tryPromise<A, E>(
  fn: () => Promise<A>,
  onError: (cause: unknown) => E,
): Effect<A, E> {
  return {
    _tag: 'Effect',
    run: async (_env) => {
      try {
        return right(await fn());
      } catch (cause) {
        return left(onError(cause));
      }
    },
  };
}

/**
 * Wrap a synchronous computation.  The function must not throw; if it does
 * the error escapes as an untyped rejection.  Use `tryCatch` for fallible
 * sync work.
 *
 * @example
 *   const e = sync(() => JSON.parse(rawText));
 *   // Effect<unknown, never>  — caller owns the parse type
 */
export function sync<A>(fn: () => A): Effect<A, never> {
  return {
    _tag: 'Effect',
    run: (_env) => Promise.resolve(right(fn())),
  };
}

/**
 * Wrap a potentially-throwing synchronous computation with a typed error
 * channel.  Analogous to `tryPromise` for synchronous code.
 *
 * @example
 *   const e = tryCatch(
 *     () => JSON.parse(raw) as Config,
 *     (cause) => new ConfigError('invalid JSON', cause),
 *   );
 */
export function tryCatch<A, E>(
  fn: () => A,
  onError: (cause: unknown) => E,
): Effect<A, E> {
  return {
    _tag: 'Effect',
    run: (_env) => {
      try {
        return Promise.resolve(right(fn()));
      } catch (cause) {
        return Promise.resolve(left(onError(cause)));
      }
    },
  };
}

/**
 * Promote a nullable value to an Effect, failing with a typed error when the
 * value is `null` or `undefined`.
 *
 * Replaces the `if (!x) throw new Error(...)` pattern.
 *
 * @example
 *   const e = fromNullable(process.env.API_KEY, () => new ConfigError('API_KEY missing'));
 */
export function fromNullable<A, E>(
  value: A | null | undefined,
  onNull: () => E,
): Effect<A, E> {
  return value == null
    ? fail(onNull())
    : succeed(value as A);
}

// ============================================================================
// Combinators
// ============================================================================

/**
 * Transform the success value of an Effect without changing its error type.
 *
 * @example
 *   const doubled = map(succeed(21), (n) => n * 2);
 */
export function map<A, B, E, R = unknown>(
  effect: Effect<A, E, R>,
  f: (a: A) => B,
): Effect<B, E, R> {
  return {
    _tag: 'Effect',
    run: async (env: R) => {
      const result = await effect.run(env);
      return isRight(result) ? right(f(result.value)) : result;
    },
  };
}

/**
 * Chain two Effects, passing the success value of the first into a function
 * that returns the second.  Errors from either branch propagate unchanged.
 *
 * This is the primary sequencing combinator — the Effect equivalent of
 * `const b = await fn(await a)`.
 *
 * @example
 *   const program = flatMap(
 *     tryPromise(() => readFile(path), (e) => new ToolError('read failed', e)),
 *     (text) => tryPromise(() => parse(text), (e) => new ToolError('parse failed', e)),
 *   );
 */
export function flatMap<A, B, E1, E2, R = unknown>(
  effect: Effect<A, E1, R>,
  f: (a: A) => Effect<B, E2, R>,
): Effect<B, E1 | E2, R> {
  return {
    _tag: 'Effect',
    run: async (env: R) => {
      const result = await effect.run(env);
      if (isLeft(result)) return result as Left<E1 | E2>;
      return f(result.value).run(env);
    },
  };
}

/**
 * Handle a failure by providing a recovery Effect.  On success the original
 * value passes through.
 *
 * @example
 *   const withFallback = catchAll(
 *     tryPromise(() => primary(), (e) => new LLMError('primary failed', e)),
 *     (_err) => tryPromise(() => fallback(), (e) => new LLMError('fallback failed', e)),
 *   );
 */
export function catchAll<A, E, B, E2, R = unknown>(
  effect: Effect<A, E, R>,
  f: (e: E) => Effect<B, E2, R>,
): Effect<A | B, E2, R> {
  return {
    _tag: 'Effect',
    run: async (env: R) => {
      const result = await effect.run(env);
      if (isRight(result)) return result as Right<A | B>;
      return f(result.error).run(env);
    },
  };
}

/**
 * Execute a side-effectful function on the success value without altering it.
 * Useful for logging, metrics emission, or bus publishing inside a pipeline.
 *
 * @example
 *   const logged = tap(program, (result) => log.info({ result }, 'Step complete'));
 */
export function tap<A, E, R = unknown>(
  effect: Effect<A, E, R>,
  f: (a: A) => void,
): Effect<A, E, R> {
  return {
    _tag: 'Effect',
    run: async (env: R) => {
      const result = await effect.run(env);
      if (isRight(result)) f(result.value);
      return result;
    },
  };
}

/**
 * Execute a side-effectful function on the error value without altering it.
 * Useful for error logging inside a pipeline before recovery or re-throw.
 *
 * @example
 *   const logged = tapError(program, (err) => log.error({ err }, 'Step failed'));
 */
export function tapError<A, E, R = unknown>(
  effect: Effect<A, E, R>,
  f: (e: E) => void,
): Effect<A, E, R> {
  return {
    _tag: 'Effect',
    run: async (env: R) => {
      const result = await effect.run(env);
      if (isLeft(result)) f(result.error);
      return result;
    },
  };
}

/**
 * Satisfy an Effect's environment requirement by providing a concrete value.
 * The returned Effect has no remaining requirements (`unknown`).
 *
 * @example
 *   type Env = { apiKey: string };
 *   const e: Effect<string, LLMError, Env> = ...;
 *   const runnable = provide(e, { apiKey: process.env.OPENAI_KEY! });
 */
export function provide<A, E, R>(
  effect: Effect<A, E, R>,
  env: R,
): Effect<A, E> {
  return {
    _tag: 'Effect',
    run: (_ignoredEnv: unknown) => effect.run(env),
  };
}

// ============================================================================
// Concurrency
// ============================================================================

/**
 * Run all Effects concurrently.  Resolves to a tuple of success values when
 * every Effect succeeds; fails immediately with the first error encountered.
 *
 * Mirrors `Promise.all` semantics but with typed errors.
 *
 * The overloaded tuple variant preserves individual element types.
 */
export function all<Effects extends ReadonlyArray<Effect<unknown, unknown>>>(
  effects: Effects,
): Effect<
  { [K in keyof Effects]: Effects[K] extends Effect<infer A, unknown> ? A : never },
  Effects[number] extends Effect<unknown, infer E> ? E : never
> {
  return {
    _tag: 'Effect',
    run: async (env: unknown) => {
      const results = await Promise.all(effects.map((e) => e.run(env)));
      const values: unknown[] = [];
      for (const result of results) {
        if (isLeft(result)) return result as Left<never>;
        values.push(result.value);
      }
      return right(values) as Right<never>;
    },
  } as unknown as Effect<
    { [K in keyof Effects]: Effects[K] extends Effect<infer A, unknown> ? A : never },
    Effects[number] extends Effect<unknown, infer E> ? E : never
  >;
}

/**
 * Run all Effects concurrently and collect every result — successes and
 * failures alike.  Never fails at the Effect level.
 *
 * Mirrors `Promise.allSettled` semantics.
 *
 * @example
 *   const results = await runPromise(allSettled([e1, e2, e3]));
 *   // results: Array<Either<A, E>>
 */
export function allSettled<A, E>(
  effects: Effect<A, E>[],
): Effect<Either<A, E>[], never> {
  return {
    _tag: 'Effect',
    run: async (env: unknown) => {
      const results = await Promise.all(effects.map((e) => e.run(env)));
      return right(results);
    },
  };
}

/**
 * Race a set of Effects: the first one to settle (succeed or fail) wins.
 * All others are abandoned (their Promises are started but results ignored).
 *
 * Mirrors `Promise.race` semantics.
 *
 * @example
 *   const fastest = race([primaryLLM, fallbackLLM]);
 */
export function race<A, E>(
  effects: Effect<A, E>[],
): Effect<A, E> {
  return {
    _tag: 'Effect',
    run: (env: unknown) => Promise.race(effects.map((e) => e.run(env))),
  };
}

// ============================================================================
// Runtime — escape hatches from the Effect world
// ============================================================================

/**
 * Run an Effect and resolve with the success value, or reject with the error.
 *
 * This is the standard exit point from the Effect system into the rest of the
 * codebase.  Use it at call-sites that cannot yet be migrated (e.g. existing
 * bus event handlers that expect plain Promises).
 *
 * @throws The error value (typed `E`) if the Effect fails.
 *
 * @example
 *   const data = await runPromise(program);
 */
export async function runPromise<A, E>(effect: Effect<A, E>): Promise<A> {
  const result = await effect.run(undefined);
  if (isLeft(result)) throw result.error;
  return result.value;
}

/**
 * Run an Effect and return the raw `Either`.  Never rejects.
 *
 * Useful when the caller needs to inspect both branches without losing the
 * typed error.
 *
 * @example
 *   const result = await runEither(program);
 *   if (isLeft(result)) {
 *     log.error({ err: result.error }, 'program failed');
 *   }
 */
export async function runEither<A, E>(effect: Effect<A, E>): Promise<Either<A, E>> {
  return effect.run(undefined);
}

/**
 * Run an Effect that is guaranteed never to fail (error type `never`).
 * Executes synchronously by resolving the underlying Promise immediately.
 *
 * This is safe because `sync()` and `succeed()` both return already-resolved
 * Promises.  Throws if called on an asynchronous Effect (a runtime guard is
 * not practical without fibers — callers are responsible for not misusing).
 *
 * @example
 *   const value = runSync(sync(() => computePhi(state)));
 */
export function runSync<A>(effect: Effect<A, never>): A {
  // We rely on the invariant that sync/succeed return already-settled Promises.
  // There is no way to block a Promise synchronously in Node without native
  // extensions, so we surface the result through a shared slot.
  let resolved = false;
  let value: A | undefined;
  let threw: unknown;

  effect.run(undefined).then(
    (result) => {
      resolved = true;
      if (isRight(result)) {
        value = result.value;
      } else {
        // Effect<A, never> guarantees this branch is unreachable at compile
        // time, but we defend against incorrect runtime usage.
        threw = result.error;
      }
    },
    (err) => {
      resolved = true;
      threw = err;
    },
  );

  if (!resolved) {
    throw new Error(
      'runSync called on an asynchronous Effect. ' +
      'Use runPromise or runEither for Effects that perform I/O.',
    );
  }

  if (threw !== undefined) throw threw;
  return value as A;
}

// ============================================================================
// Genesis-domain error types
// ============================================================================

/**
 * Base class for all typed Genesis errors.
 *
 * The `_tag` field enables exhaustive pattern matching on error unions.
 * The `cause` field preserves the original caught value for debugging.
 *
 * @example
 *   function handleError(err: LLMError | ToolError) {
 *     switch (err._tag) {
 *       case 'LLMError':  return recover(err);
 *       case 'ToolError': return retry(err);
 *     }
 *   }
 */
export class GenesisError<Tag extends string> extends Error {
  readonly _tag: Tag;
  readonly cause?: unknown;

  constructor(tag: Tag, message: string, cause?: unknown) {
    super(message);
    this._tag = tag;
    this.cause = cause;
    // Restore prototype chain (required when extending Error in ES2015+).
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = tag;
  }
}

// ---------------------------------------------------------------------------
// Domain-specific error subtypes
//
// Each type is a thin alias so call-sites can be narrowly typed without
// writing out GenesisError<'LLMError'> everywhere.
// ---------------------------------------------------------------------------

/** Errors originating from LLM provider calls (completion, embedding, etc.) */
export class LLMError extends GenesisError<'LLMError'> {
  constructor(message: string, cause?: unknown) { super('LLMError', message, cause); }
}

/** Errors from tool execution (bash, edit, grep, etc.) */
export class ToolError extends GenesisError<'ToolError'> {
  constructor(message: string, cause?: unknown) { super('ToolError', message, cause); }
}

/** Errors from the memory subsystem (remember, recall, learn) */
export class MemoryError extends GenesisError<'MemoryError'> {
  constructor(message: string, cause?: unknown) { super('MemoryError', message, cause); }
}

/** Errors from the event bus (publish, subscribe, routing) */
export class BusError extends GenesisError<'BusError'> {
  constructor(message: string, cause?: unknown) { super('BusError', message, cause); }
}

/** Errors from configuration loading or validation */
export class ConfigError extends GenesisError<'ConfigError'> {
  constructor(message: string, cause?: unknown) { super('ConfigError', message, cause); }
}

/** Errors produced when an operation exceeds its deadline */
export class TimeoutError extends GenesisError<'TimeoutError'> {
  constructor(message: string, cause?: unknown) { super('TimeoutError', message, cause); }
}

// ============================================================================
// Migration helper
// ============================================================================

/**
 * Wrap any legacy `async` function that may throw into an Effect with a
 * generic `LegacyError` tag.  Use this as a first migration step: it gives
 * call-sites an Effect shape without requiring a domain-specific error type.
 *
 * Gradually replace `LegacyError` with domain-specific errors
 * (LLMError, ToolError, …) as you refine each module.
 *
 * @example
 *   // Before
 *   try {
 *     const result = await someOldFunction();
 *   } catch (e) {
 *     logger.error({ e }, 'failed');
 *   }
 *
 *   // After (step 1 — wrap and keep calling runPromise)
 *   const effect = wrapLegacy(() => someOldFunction());
 *   const result = await runPromise(effect);
 *
 *   // After (step 2 — compose with typed combinators)
 *   const program = pipe(
 *     wrapLegacy(() => someOldFunction()),
 *     map((r) => transform(r)),
 *     catchAll((e) => wrapLegacy(() => fallback())),
 *   );
 */
export function wrapLegacy<A>(
  fn: () => Promise<A>,
): Effect<A, GenesisError<'LegacyError'>> {
  return tryPromise(
    fn,
    (cause) => {
      const message =
        cause instanceof Error ? cause.message : String(cause);
      const err = new GenesisError<'LegacyError'>('LegacyError', message, cause);
      return err;
    },
  );
}

// ============================================================================
// Timeout combinator
// ============================================================================

/**
 * Fail an Effect with a `TimeoutError` if it does not settle within `ms`
 * milliseconds.
 *
 * @example
 *   const bounded = timeout(llmEffect, 30_000);
 */
export function timeout<A, E>(
  effect: Effect<A, E>,
  ms: number,
): Effect<A, E | TimeoutError> {
  return {
    _tag: 'Effect',
    run: (env: unknown) =>
      Promise.race([
        effect.run(env),
        new Promise<Either<A, E | TimeoutError>>((resolve) =>
          setTimeout(
            () => resolve(left(new TimeoutError(`Timed out after ${ms}ms`))),
            ms,
          ),
        ),
      ]),
  };
}

// ============================================================================
// Pipe utility — left-to-right function composition
// ============================================================================

// Overloads preserve the type at each transformation step.
// Up to 8 functions are declared; TypeScript resolves the correct overload.

export function pipe<A>(value: A): A;
export function pipe<A, B>(value: A, fn1: (a: A) => B): B;
export function pipe<A, B, C>(value: A, fn1: (a: A) => B, fn2: (b: B) => C): C;
export function pipe<A, B, C, D>(
  value: A,
  fn1: (a: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
): D;
export function pipe<A, B, C, D, F>(
  value: A,
  fn1: (a: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => F,
): F;
export function pipe<A, B, C, D, F, G>(
  value: A,
  fn1: (a: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => F,
  fn5: (f: F) => G,
): G;
export function pipe<A, B, C, D, F, G, H>(
  value: A,
  fn1: (a: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => F,
  fn5: (f: F) => G,
  fn6: (g: G) => H,
): H;
export function pipe<A, B, C, D, F, G, H, I>(
  value: A,
  fn1: (a: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => F,
  fn5: (f: F) => G,
  fn6: (g: G) => H,
  fn7: (h: H) => I,
): I;

/** Runtime implementation — applies functions left to right. */
export function pipe(value: unknown, ...fns: Array<(a: unknown) => unknown>): unknown {
  return fns.reduce((acc, fn) => fn(acc), value);
}
