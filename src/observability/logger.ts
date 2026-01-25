/**
 * Structured Logger
 *
 * Production-grade structured logging with pino-compatible API.
 * Features:
 * - JSON output for log aggregation (ELK, Datadog, etc.)
 * - Log levels with filtering
 * - Context/child loggers
 * - Redaction of sensitive fields
 * - Performance timestamps
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  level: LogLevel;
  time: number;
  msg: string;
  [key: string]: unknown;
}

export interface LoggerConfig {
  // Minimum log level to output
  level: LogLevel;
  // Output format: 'json' for production, 'pretty' for development
  format: 'json' | 'pretty';
  // Fields to redact from output
  redactFields: string[];
  // Custom output function (defaults to console)
  output?: (entry: LogEntry) => void;
  // Base context added to all logs
  base?: Record<string, unknown>;
  // Enable timestamps
  timestamp: boolean;
  // Service name
  name?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  trace: '\x1b[90m',  // gray
  debug: '\x1b[36m',  // cyan
  info: '\x1b[32m',   // green
  warn: '\x1b[33m',   // yellow
  error: '\x1b[31m',  // red
  fatal: '\x1b[35m',  // magenta
};

const RESET = '\x1b[0m';

const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  format: 'json',
  redactFields: ['password', 'token', 'secret', 'apiKey', 'api_key', 'authorization'],
  timestamp: true,
};

export class Logger {
  private config: LoggerConfig;
  private context: Record<string, unknown>;

  constructor(config: Partial<LoggerConfig> = {}, context: Record<string, unknown> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.context = { ...config.base, ...context };
    if (config.name) {
      this.context.name = config.name;
    }
  }

  /**
   * Create child logger with additional context
   */
  child(bindings: Record<string, unknown>): Logger {
    return new Logger(this.config, { ...this.context, ...bindings });
  }

  /**
   * Log at trace level
   */
  trace(msg: string, data?: Record<string, unknown>): void {
    this.log('trace', msg, data);
  }

  /**
   * Log at debug level
   */
  debug(msg: string, data?: Record<string, unknown>): void {
    this.log('debug', msg, data);
  }

  /**
   * Log at info level
   */
  info(msg: string, data?: Record<string, unknown>): void {
    this.log('info', msg, data);
  }

  /**
   * Log at warn level
   */
  warn(msg: string, data?: Record<string, unknown>): void {
    this.log('warn', msg, data);
  }

  /**
   * Log at error level
   */
  error(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, error: Error, data?: Record<string, unknown>): void;
  error(msg: string, errorOrData?: Error | Record<string, unknown>, data?: Record<string, unknown>): void {
    if (errorOrData instanceof Error) {
      const errorData = {
        ...data,
        error: {
          message: errorOrData.message,
          name: errorOrData.name,
          stack: errorOrData.stack,
        },
      };
      this.log('error', msg, errorData);
    } else {
      this.log('error', msg, errorOrData);
    }
  }

  /**
   * Log at fatal level
   */
  fatal(msg: string, data?: Record<string, unknown>): void;
  fatal(msg: string, error: Error, data?: Record<string, unknown>): void;
  fatal(msg: string, errorOrData?: Error | Record<string, unknown>, data?: Record<string, unknown>): void {
    if (errorOrData instanceof Error) {
      const errorData = {
        ...data,
        error: {
          message: errorOrData.message,
          name: errorOrData.name,
          stack: errorOrData.stack,
        },
      };
      this.log('fatal', msg, errorData);
    } else {
      this.log('fatal', msg, errorOrData);
    }
  }

  /**
   * Check if a level is enabled
   */
  isLevelEnabled(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }

  /**
   * Get current log level
   */
  get level(): LogLevel {
    return this.config.level;
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Flush any buffered logs (for compatibility)
   */
  flush(): void {
    // No-op for sync logging
  }

  private log(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
    if (!this.isLevelEnabled(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      time: this.config.timestamp ? Date.now() : 0,
      msg,
      ...this.context,
      ...this.redact(data || {}),
    };

    if (this.config.output) {
      this.config.output(entry);
    } else if (this.config.format === 'pretty') {
      this.outputPretty(entry);
    } else {
      this.outputJson(entry);
    }
  }

  private redact(data: Record<string, unknown>): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (this.config.redactFields.some(field =>
        key.toLowerCase().includes(field.toLowerCase())
      )) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        redacted[key] = this.redact(value as Record<string, unknown>);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }

  private outputJson(entry: LogEntry): void {
    const output = JSON.stringify(entry);
    if (entry.level === 'error' || entry.level === 'fatal') {
      console.error(output);
    } else if (entry.level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  private outputPretty(entry: LogEntry): void {
    const color = LEVEL_COLORS[entry.level];
    const time = entry.time ? new Date(entry.time).toISOString() : '';
    const level = entry.level.toUpperCase().padEnd(5);

    // Extract known fields
    const { level: _, time: __, msg, ...rest } = entry;

    // Format extra data
    const extra = Object.keys(rest).length > 0
      ? ` ${JSON.stringify(rest)}`
      : '';

    const output = `${time} ${color}${level}${RESET} ${msg}${extra}`;

    if (entry.level === 'error' || entry.level === 'fatal') {
      console.error(output);
    } else if (entry.level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }
}

// Global logger instance
let globalLogger: Logger | null = null;

/**
 * Get or create the global logger
 */
export function getLogger(config?: Partial<LoggerConfig>): Logger {
  if (!globalLogger) {
    // Determine format from environment
    const format = process.env.LOG_FORMAT === 'pretty' ||
                   process.env.NODE_ENV === 'development'
                   ? 'pretty' : 'json';

    // Determine level from environment
    const level = (process.env.LOG_LEVEL as LogLevel) || 'info';

    globalLogger = new Logger({
      ...config,
      level,
      format,
      name: 'genesis',
    });
  }
  return globalLogger;
}

/**
 * Reset global logger (for testing)
 */
export function resetLogger(): void {
  globalLogger = null;
}

/**
 * Create a child logger with component context
 */
export function createLogger(component: string, context?: Record<string, unknown>): Logger {
  return getLogger().child({ component, ...context });
}

/**
 * Performance timer for structured logging
 */
export class Timer {
  private startTime: number;
  private logger: Logger;
  private operation: string;
  private context: Record<string, unknown>;

  constructor(logger: Logger, operation: string, context: Record<string, unknown> = {}) {
    this.logger = logger;
    this.operation = operation;
    this.context = context;
    this.startTime = performance.now();
    this.logger.debug(`${operation} started`, context);
  }

  /**
   * End the timer and log duration
   */
  end(result?: Record<string, unknown>): number {
    const duration = performance.now() - this.startTime;
    this.logger.info(`${this.operation} completed`, {
      ...this.context,
      ...result,
      durationMs: Math.round(duration * 100) / 100,
    });
    return duration;
  }

  /**
   * End with error
   */
  error(error: Error, result?: Record<string, unknown>): number {
    const duration = performance.now() - this.startTime;
    this.logger.error(`${this.operation} failed`, error, {
      ...this.context,
      ...result,
      durationMs: Math.round(duration * 100) / 100,
    });
    return duration;
  }
}

/**
 * Create a performance timer
 */
export function startTimer(operation: string, context?: Record<string, unknown>): Timer {
  return new Timer(getLogger(), operation, context);
}
