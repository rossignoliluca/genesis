/**
 * Genesis — Structured Logger
 *
 * Lightweight wrapper around console that adds:
 * - Log levels (debug, info, warn, error)
 * - Module prefix tags
 * - Timestamp in ISO format
 * - JSON-structured output option
 *
 * Usage:
 *   import { createLogger } from '../utils/logger.js';
 *   const log = createLogger('Pipeline');
 *   log.info('Step 1 complete', { headlines: 42 });
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let globalLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

export function setGlobalLogLevel(level: LogLevel): void {
  globalLevel = level;
}

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

export function createLogger(module: string): Logger {
  const emit = (level: LogLevel, msg: string, data?: Record<string, unknown>) => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[globalLevel]) return;

    const entry = {
      ts: new Date().toISOString(),
      level,
      module,
      msg,
      ...(data || {}),
    };

    switch (level) {
      case 'debug': console.debug(JSON.stringify(entry)); break;
      case 'info':  console.log(JSON.stringify(entry)); break;
      case 'warn':  console.warn(JSON.stringify(entry)); break;
      case 'error': console.error(JSON.stringify(entry)); break;
    }
  };

  return {
    debug: (msg, data?) => emit('debug', msg, data),
    info:  (msg, data?) => emit('info', msg, data),
    warn:  (msg, data?) => emit('warn', msg, data),
    error: (msg, data?) => emit('error', msg, data),
  };
}
