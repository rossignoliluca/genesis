/**
 * Distributed Tracing
 *
 * OpenTelemetry-compatible distributed tracing.
 * Features:
 * - Span creation and propagation
 * - W3C Trace Context support
 * - Automatic context management
 * - Export to various backends (console, OTLP)
 */

import { randomUUID } from 'crypto';

export type SpanKind = 'internal' | 'server' | 'client' | 'producer' | 'consumer';
export type SpanStatus = 'unset' | 'ok' | 'error';

export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  traceState?: string;
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

export interface SpanLink {
  context: SpanContext;
  attributes?: Record<string, unknown>;
}

export interface SpanData {
  context: SpanContext;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  startTime: number;
  endTime?: number;
  status: SpanStatus;
  statusMessage?: string;
  attributes: Record<string, unknown>;
  events: SpanEvent[];
  links: SpanLink[];
}

export interface TracerConfig {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  // Export destinations
  exporters: SpanExporter[];
  // Sample rate (0-1)
  sampleRate: number;
  // Max attributes per span
  maxAttributes: number;
  // Max events per span
  maxEvents: number;
}

export interface SpanExporter {
  export(spans: SpanData[]): Promise<void>;
  shutdown(): Promise<void>;
}

/**
 * Console exporter for development
 */
export class ConsoleExporter implements SpanExporter {
  async export(spans: SpanData[]): Promise<void> {
    for (const span of spans) {
      const duration = span.endTime ? span.endTime - span.startTime : 0;
      console.log(JSON.stringify({
        type: 'span',
        traceId: span.context.traceId,
        spanId: span.context.spanId,
        parentSpanId: span.parentSpanId,
        name: span.name,
        kind: span.kind,
        status: span.status,
        durationMs: Math.round(duration),
        attributes: span.attributes,
        events: span.events,
      }));
    }
  }

  async shutdown(): Promise<void> {
    // No-op
  }
}

/**
 * In-memory exporter for testing
 */
export class InMemoryExporter implements SpanExporter {
  private spans: SpanData[] = [];

  async export(spans: SpanData[]): Promise<void> {
    this.spans.push(...spans);
  }

  async shutdown(): Promise<void> {
    this.spans = [];
  }

  getSpans(): SpanData[] {
    return [...this.spans];
  }

  clear(): void {
    this.spans = [];
  }
}

/**
 * OTLP HTTP exporter
 */
export class OTLPHttpExporter implements SpanExporter {
  private endpoint: string;
  private headers: Record<string, string>;
  private batch: SpanData[] = [];
  private batchSize: number;
  private flushInterval: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(config: {
    endpoint: string;
    headers?: Record<string, string>;
    batchSize?: number;
    flushIntervalMs?: number;
  }) {
    this.endpoint = config.endpoint;
    this.headers = config.headers || {};
    this.batchSize = config.batchSize || 100;
    this.flushInterval = config.flushIntervalMs || 5000;
    this.startFlushTimer();
  }

  async export(spans: SpanData[]): Promise<void> {
    this.batch.push(...spans);

    if (this.batch.length >= this.batchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.batch.length === 0) return;

    const spansToSend = this.batch;
    this.batch = [];

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body: JSON.stringify({
          resourceSpans: [{
            resource: {
              attributes: [],
            },
            scopeSpans: [{
              scope: { name: 'genesis' },
              spans: spansToSend.map(this.convertSpan),
            }],
          }],
        }),
      });

      if (!response.ok) {
        console.error(`OTLP export failed: ${response.status}`);
      }
    } catch (error) {
      console.error('OTLP export error:', error);
    }
  }

  async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  private startFlushTimer(): void {
    this.timer = setInterval(() => {
      this.flush().catch(console.error);
    }, this.flushInterval);

    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  private convertSpan(span: SpanData): unknown {
    return {
      traceId: span.context.traceId,
      spanId: span.context.spanId,
      parentSpanId: span.parentSpanId,
      name: span.name,
      kind: ['INTERNAL', 'SERVER', 'CLIENT', 'PRODUCER', 'CONSUMER'].indexOf(span.kind.toUpperCase()) + 1,
      startTimeUnixNano: String(span.startTime * 1_000_000),
      endTimeUnixNano: span.endTime ? String(span.endTime * 1_000_000) : undefined,
      status: {
        code: span.status === 'error' ? 2 : span.status === 'ok' ? 1 : 0,
        message: span.statusMessage,
      },
      attributes: Object.entries(span.attributes).map(([key, value]) => ({
        key,
        value: { stringValue: String(value) },
      })),
      events: span.events.map(e => ({
        timeUnixNano: String(e.timestamp * 1_000_000),
        name: e.name,
        attributes: Object.entries(e.attributes || {}).map(([key, value]) => ({
          key,
          value: { stringValue: String(value) },
        })),
      })),
    };
  }
}

/**
 * Active Span
 */
export class Span {
  private data: SpanData;
  private tracer: Tracer;
  private ended: boolean = false;

  constructor(
    tracer: Tracer,
    name: string,
    kind: SpanKind,
    parentContext?: SpanContext,
    links?: SpanLink[]
  ) {
    this.tracer = tracer;
    this.data = {
      context: {
        traceId: parentContext?.traceId || this.generateTraceId(),
        spanId: this.generateSpanId(),
        traceFlags: parentContext?.traceFlags ?? 1,
      },
      parentSpanId: parentContext?.spanId,
      name,
      kind,
      startTime: performance.now(),
      status: 'unset',
      attributes: {},
      events: [],
      links: links || [],
    };
  }

  /**
   * Get span context
   */
  get context(): SpanContext {
    return { ...this.data.context };
  }

  /**
   * Set attribute
   */
  setAttribute(key: string, value: unknown): this {
    if (!this.ended) {
      this.data.attributes[key] = value;
    }
    return this;
  }

  /**
   * Set multiple attributes
   */
  setAttributes(attributes: Record<string, unknown>): this {
    if (!this.ended) {
      Object.assign(this.data.attributes, attributes);
    }
    return this;
  }

  /**
   * Add event
   */
  addEvent(name: string, attributes?: Record<string, unknown>): this {
    if (!this.ended) {
      this.data.events.push({
        name,
        timestamp: performance.now(),
        attributes,
      });
    }
    return this;
  }

  /**
   * Set status
   */
  setStatus(status: SpanStatus, message?: string): this {
    if (!this.ended) {
      this.data.status = status;
      this.data.statusMessage = message;
    }
    return this;
  }

  /**
   * Record exception
   */
  recordException(error: Error): this {
    return this.addEvent('exception', {
      'exception.type': error.name,
      'exception.message': error.message,
      'exception.stacktrace': error.stack,
    }).setStatus('error', error.message);
  }

  /**
   * Update name
   */
  updateName(name: string): this {
    if (!this.ended) {
      this.data.name = name;
    }
    return this;
  }

  /**
   * End span
   */
  end(): void {
    if (!this.ended) {
      this.ended = true;
      this.data.endTime = performance.now();
      this.tracer.recordSpan(this.data);
    }
  }

  /**
   * Check if ended
   */
  isEnded(): boolean {
    return this.ended;
  }

  private generateTraceId(): string {
    return randomUUID().replace(/-/g, '');
  }

  private generateSpanId(): string {
    return randomUUID().replace(/-/g, '').slice(0, 16);
  }
}

/**
 * Tracer for creating spans
 */
export class Tracer {
  private config: TracerConfig;
  private pendingSpans: SpanData[] = [];
  private activeSpan: Span | null = null;

  constructor(config: Partial<TracerConfig>) {
    this.config = {
      serviceName: config.serviceName || 'genesis',
      serviceVersion: config.serviceVersion,
      environment: config.environment || process.env.NODE_ENV,
      exporters: config.exporters || [],
      sampleRate: config.sampleRate ?? 1.0,
      maxAttributes: config.maxAttributes || 128,
      maxEvents: config.maxEvents || 128,
    };
  }

  /**
   * Start a new span
   */
  startSpan(name: string, options?: {
    kind?: SpanKind;
    parent?: SpanContext | Span;
    links?: SpanLink[];
    attributes?: Record<string, unknown>;
  }): Span {
    // Sampling
    if (Math.random() > this.config.sampleRate) {
      // Return a no-op span
      const noopSpan = new Span(this, name, 'internal');
      return noopSpan;
    }

    let parentContext: SpanContext | undefined;

    if (options?.parent) {
      parentContext = options.parent instanceof Span
        ? options.parent.context
        : options.parent;
    } else if (this.activeSpan && !this.activeSpan.isEnded()) {
      parentContext = this.activeSpan.context;
    }

    const span = new Span(
      this,
      name,
      options?.kind || 'internal',
      parentContext,
      options?.links
    );

    if (options?.attributes) {
      span.setAttributes(options.attributes);
    }

    // Add service attributes
    span.setAttributes({
      'service.name': this.config.serviceName,
      'service.version': this.config.serviceVersion,
      'deployment.environment': this.config.environment,
    });

    this.activeSpan = span;
    return span;
  }

  /**
   * Execute function within a span
   */
  async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    options?: {
      kind?: SpanKind;
      attributes?: Record<string, unknown>;
    }
  ): Promise<T> {
    const span = this.startSpan(name, options);

    try {
      const result = await fn(span);
      span.setStatus('ok');
      return result;
    } catch (error) {
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Get current active span
   */
  getActiveSpan(): Span | null {
    return this.activeSpan;
  }

  /**
   * Record completed span
   */
  recordSpan(data: SpanData): void {
    this.pendingSpans.push(data);

    // Batch export
    if (this.pendingSpans.length >= 10) {
      this.flush().catch(console.error);
    }
  }

  /**
   * Flush pending spans
   */
  async flush(): Promise<void> {
    if (this.pendingSpans.length === 0) return;

    const spans = this.pendingSpans;
    this.pendingSpans = [];

    await Promise.all(
      this.config.exporters.map(exporter =>
        exporter.export(spans).catch(console.error)
      )
    );
  }

  /**
   * Shutdown tracer
   */
  async shutdown(): Promise<void> {
    await this.flush();
    await Promise.all(
      this.config.exporters.map(exporter => exporter.shutdown())
    );
  }

  /**
   * Parse W3C traceparent header
   */
  static parseTraceparent(header: string): SpanContext | null {
    const match = header.match(
      /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/
    );

    if (!match) return null;

    return {
      traceId: match[1],
      spanId: match[2],
      traceFlags: parseInt(match[3], 16),
    };
  }

  /**
   * Format W3C traceparent header
   */
  static formatTraceparent(context: SpanContext): string {
    return `00-${context.traceId}-${context.spanId}-${context.traceFlags.toString(16).padStart(2, '0')}`;
  }
}

// Global tracer
let globalTracer: Tracer | null = null;

/**
 * Get global tracer
 */
export function getTracer(config?: Partial<TracerConfig>): Tracer {
  if (!globalTracer) {
    const exporters: SpanExporter[] = [];

    // Add console exporter in development
    if (process.env.TRACE_LOG === 'true' || process.env.NODE_ENV === 'development') {
      exporters.push(new ConsoleExporter());
    }

    // Add OTLP exporter if configured
    if (process.env.OTLP_ENDPOINT) {
      exporters.push(new OTLPHttpExporter({
        endpoint: process.env.OTLP_ENDPOINT,
        headers: process.env.OTLP_HEADERS
          ? JSON.parse(process.env.OTLP_HEADERS)
          : undefined,
      }));
    }

    globalTracer = new Tracer({
      ...config,
      exporters: [...exporters, ...(config?.exporters || [])],
    });
  }
  return globalTracer;
}

/**
 * Reset global tracer
 */
export async function resetTracer(): Promise<void> {
  if (globalTracer) {
    await globalTracer.shutdown();
  }
  globalTracer = null;
}

/**
 * Start a span using global tracer
 */
export function startSpan(name: string, options?: {
  kind?: SpanKind;
  parent?: SpanContext | Span;
  attributes?: Record<string, unknown>;
}): Span {
  return getTracer().startSpan(name, options);
}

/**
 * Execute with tracing
 */
export async function withTrace<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: {
    kind?: SpanKind;
    attributes?: Record<string, unknown>;
  }
): Promise<T> {
  return getTracer().withSpan(name, fn, options);
}
