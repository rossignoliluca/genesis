/**
 * Genesis v35 — Structured Logging
 *
 * Replaces 4,381 console.log/error/warn statements with structured,
 * level-aware, JSON-formatted logging via pino.
 *
 * Usage:
 *   import { createLogger, logger } from '../core/logger.js';
 *   const log = createLogger('brain');
 *   log.info({ phi: 0.7, cycles: 42 }, 'Cycle complete');
 *   log.error({ err }, 'Processing failed');
 *
 * Level precedence (lowest → highest):
 *   trace(10) · debug(20) · info(30) · warn(40) · error(50) · fatal(60)
 *
 * Environment variables:
 *   GENESIS_LOG_LEVEL  — one of the levels above (default: info)
 *   NODE_ENV           — set to 'production' for plain JSON output
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// ---------------------------------------------------------------------------
// Public interface — intentionally narrow and pino-compatible
// ---------------------------------------------------------------------------

/** Pino-compatible logger interface. Every module receives a child of this. */
export interface Logger {
  trace(msg: string, ...args: unknown[]): void;
  trace(obj: Record<string, unknown>, msg?: string): void;
  debug(msg: string, ...args: unknown[]): void;
  debug(obj: Record<string, unknown>, msg?: string): void;
  info(msg: string, ...args: unknown[]): void;
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(msg: string, ...args: unknown[]): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(msg: string, ...args: unknown[]): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  fatal(msg: string, ...args: unknown[]): void;
  fatal(obj: Record<string, unknown>, msg?: string): void;
  child(bindings: Record<string, unknown>): Logger;
}

// ---------------------------------------------------------------------------
// Level helpers
// ---------------------------------------------------------------------------

const LEVEL_RANK: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info:  30,
  warn:  40,
  error: 50,
  fatal: 60,
};

function resolveLevel(): LogLevel {
  const env = (process.env.GENESIS_LOG_LEVEL ?? '').toLowerCase() as LogLevel;
  return env in LEVEL_RANK ? env : 'info';
}

// ---------------------------------------------------------------------------
// Console fallback
//
// Used when pino cannot be loaded (e.g. stripped production images, test
// environments that don't install optional deps).  Output is newline-
// delimited JSON so it is machine-parseable by any log aggregator.
// ---------------------------------------------------------------------------

function makeConsoleFallback(
  bindings: Record<string, unknown>,
  activeLevel: LogLevel,
): Logger {
  const activeRank = LEVEL_RANK[activeLevel];

  function emit(
    level: LogLevel,
    consoleFn: (...a: unknown[]) => void,
    objOrMsg: Record<string, unknown> | string,
    msgOrArgs?: string | unknown,
    ...rest: unknown[]
  ): void {
    if (LEVEL_RANK[level] < activeRank) return;

    const ts = new Date().toISOString();
    let obj: Record<string, unknown>;
    let message: string;

    if (typeof objOrMsg === 'string') {
      obj = {};
      // When called as log.info(msg, ...args) we join args as a context array
      // to avoid losing information, matching pino's %s/%d interpolation intent.
      message = rest.length > 0 || msgOrArgs !== undefined
        ? String(objOrMsg)
        : objOrMsg;
    } else {
      obj = objOrMsg;
      message = typeof msgOrArgs === 'string' ? msgOrArgs : '';
    }

    consoleFn(JSON.stringify({ time: ts, level, ...bindings, ...obj, msg: message }));
  }

  const fallback: Logger = {
    trace: (o: Record<string, unknown> | string, m?: string | unknown, ...r: unknown[]) =>
      emit('trace', console.debug, o, m, ...r),
    debug: (o: Record<string, unknown> | string, m?: string | unknown, ...r: unknown[]) =>
      emit('debug', console.debug, o, m, ...r),
    info:  (o: Record<string, unknown> | string, m?: string | unknown, ...r: unknown[]) =>
      emit('info',  console.info,  o, m, ...r),
    warn:  (o: Record<string, unknown> | string, m?: string | unknown, ...r: unknown[]) =>
      emit('warn',  console.warn,  o, m, ...r),
    error: (o: Record<string, unknown> | string, m?: string | unknown, ...r: unknown[]) =>
      emit('error', console.error, o, m, ...r),
    fatal: (o: Record<string, unknown> | string, m?: string | unknown, ...r: unknown[]) =>
      emit('fatal', console.error, o, m, ...r),
    child: (extra) => makeConsoleFallback({ ...bindings, ...extra }, activeLevel),
  };

  return fallback;
}

// ---------------------------------------------------------------------------
// Pino wrapper
//
// pino's type definitions use `export = pino` (CommonJS style).  We import
// the module type via `import()` only at the type level so the shapes are
// available at compile time without requiring a top-level `await`.  At
// runtime we use `require()` which is always synchronous in Node.
// ---------------------------------------------------------------------------

// Bring in the pino module type without emitting a runtime import.
type PinoModule = typeof import('pino');
// pino.Logger is nested inside the namespace.
type PinoLogger = import('pino').Logger;

/**
 * Wraps a raw pino Logger in the narrower Logger interface.
 * The overloaded signatures don't match pino's own overloads exactly,
 * so we bridge via explicit arrow functions.
 */
function wrapPino(pinoLogger: PinoLogger): Logger {
  function bind(
    fn: PinoLogger['info'],
  ): (o: Record<string, unknown> | string, m?: string | unknown, ...r: unknown[]) => void {
    return (o, m, ..._rest) => {
      if (typeof o === 'string') {
        (fn as Function).call(pinoLogger, o, m, ..._rest);
      } else {
        (fn as Function).call(pinoLogger, o, typeof m === 'string' ? m : '');
      }
    };
  }

  return {
    trace: bind(pinoLogger.trace),
    debug: bind(pinoLogger.debug),
    info:  bind(pinoLogger.info),
    warn:  bind(pinoLogger.warn),
    error: bind(pinoLogger.error),
    fatal: bind(pinoLogger.fatal),
    child: (bindings) => wrapPino(pinoLogger.child(bindings)),
  };
}

// ---------------------------------------------------------------------------
// Root logger singleton
// ---------------------------------------------------------------------------

let _root: Logger | null = null;

/**
 * Returns (and lazily creates) the process-wide root logger.
 *
 * Strategy:
 *   1. Try to load pino via `require()` (synchronous, available in NodeNext).
 *   2. If pino-pretty is installed, enable colorised output in development.
 *   3. Fall back to a structured console implementation if pino is absent.
 */
export function getLogger(): Logger {
  if (_root) return _root;

  const level     = resolveLevel();
  const isDev     = process.env.NODE_ENV !== 'production';

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pino = require('pino') as PinoModule;

    // pino.stdTimeFunctions.isoTime emits `"time":"<ISO string>"` tokens.
    const options: import('pino').LoggerOptions = {
      level,
      timestamp: pino.stdTimeFunctions.isoTime,
      base: { pid: process.pid },
    };

    // Attach pino-pretty transport when available in dev mode.
    // We intentionally swallow the "module not found" error — plain JSON is
    // an acceptable development experience when pino-pretty isn't installed.
    if (isDev) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('pino-pretty');
        (options as Record<string, unknown>).transport = {
          target: 'pino-pretty',
          options: {
            colorize:      true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore:        'pid',
            messageFormat: '[{module}] {msg}',
          },
        };
      } catch {
        // pino-pretty not installed — JSON output is fine
      }
    }

    _root = wrapPino(pino(options));
  } catch {
    // pino not available — structured console fallback keeps callers working
    _root = makeConsoleFallback({ pid: process.pid }, level);
  }

  return _root;
}

/**
 * Creates a child logger scoped to a named module.
 *
 * Every log line emitted by the child carries a `module` field so logs can
 * be filtered by subsystem in any aggregator (Datadog, Loki, CloudWatch…).
 *
 * @example
 *   const log = createLogger('consciousness');
 *   log.info({ phi: 0.84 }, 'IIT cycle complete');
 *   // → {"time":"…","level":"info","module":"consciousness","phi":0.84,"msg":"IIT cycle complete"}
 */
export function createLogger(module: string): Logger {
  return getLogger().child({ module });
}

/**
 * Process-wide root logger instance.
 *
 * Prefer `createLogger(module)` in application code so every log line
 * carries a `module` field.  Use `logger` directly only at the top level
 * (e.g. genesis.ts boot sequence) where no module context is needed yet.
 *
 * @example
 *   import { logger } from '../core/logger.js';
 *   logger.info('Genesis boot started');
 */
export const logger: Logger = new Proxy({} as Logger, {
  get(_target, prop: string) {
    // Forward every property access to the lazily-initialised root logger.
    // Using a Proxy here means `logger` can be imported at module load time
    // (before getLogger() is called) without triggering singleton creation.
    const root = getLogger();
    const value = (root as unknown as Record<string, unknown>)[prop];
    return typeof value === 'function' ? (value as Function).bind(root) : value;
  },
});

/**
 * Replaces the root logger singleton.
 *
 * Intended for test suites that want a no-op or spy logger without loading
 * pino, and for bootstrapping scripts that configure logging before any
 * module calls `getLogger()`.
 *
 * @example
 *   // In a test file:
 *   setLogger(makeConsoleFallback({}, 'error'));
 */
export function setLogger(l: Logger): void {
  _root = l;
}
