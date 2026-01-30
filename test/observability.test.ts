/**
 * Observability Module Tests
 *
 * Tests for:
 * - Structured logging
 * - Prometheus metrics
 * - Distributed tracing
 * - Alerting system
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import {
  // Logger
  Logger,
  Timer,
  getLogger,
  resetLogger,
  createLogger,

  // Metrics
  Counter,
  Gauge,
  Histogram,
  Summary,
  MetricsRegistry,
  getMetricsRegistry,
  resetMetricsRegistry,
  createGenesisMetrics,

  // Tracer
  Span,
  Tracer,
  InMemoryExporter,
  getTracer,
  resetTracer,
  startSpan,
  withTrace,

  // Alerter
  Alerter,
  getAlerter,
  resetAlerter,

  // Full stack
  initObservability,
} from '../dist/src/observability/index.js';

// ============================================================
// LOGGER TESTS
// ============================================================

describe('Logger', () => {
  beforeEach(() => {
    resetLogger();
  });

  it('should create logger with default config', () => {
    const logger = new Logger();
    assert.ok(logger);
    assert.strictEqual(logger.level, 'info');
  });

  it('should create logger with custom config', () => {
    const logger = new Logger({ level: 'debug', format: 'pretty', name: 'test' });
    assert.strictEqual(logger.level, 'debug');
  });

  it('should create child logger', () => {
    const logger = new Logger({ level: 'info' });
    const child = logger.child({ component: 'test' });
    assert.ok(child);
    assert.strictEqual(child.level, 'info');
  });

  it('should check level enabled', () => {
    const logger = new Logger({ level: 'warn' });
    assert.strictEqual(logger.isLevelEnabled('trace'), false);
    assert.strictEqual(logger.isLevelEnabled('debug'), false);
    assert.strictEqual(logger.isLevelEnabled('info'), false);
    assert.strictEqual(logger.isLevelEnabled('warn'), true);
    assert.strictEqual(logger.isLevelEnabled('error'), true);
    assert.strictEqual(logger.isLevelEnabled('fatal'), true);
  });

  it('should set level dynamically', () => {
    const logger = new Logger({ level: 'info' });
    assert.strictEqual(logger.isLevelEnabled('debug'), false);
    logger.setLevel('debug');
    assert.strictEqual(logger.isLevelEnabled('debug'), true);
  });

  it('should log at various levels', () => {
    const entries: import('../dist/src/observability/logger.js').LogEntry[] = [];
    const logger = new Logger({
      level: 'trace',
      output: (entry) => entries.push(entry),
    });

    logger.trace('trace message');
    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');
    logger.fatal('fatal message');

    assert.strictEqual(entries.length, 6);
  });

  it('should filter logs by level', () => {
    const entries: import('../dist/src/observability/logger.js').LogEntry[] = [];
    const logger = new Logger({
      level: 'error',
      output: (entry) => entries.push(entry),
    });

    logger.trace('trace');
    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');
    logger.fatal('fatal');

    assert.strictEqual(entries.length, 2);
  });

  it('should include context in logs', () => {
    let lastEntry: Record<string, unknown> = {};
    const logger = new Logger({
      level: 'info',
      output: (entry) => { lastEntry = entry as Record<string, unknown>; },
    });

    logger.info('test', { userId: 123 });

    assert.strictEqual(lastEntry['msg'], 'test');
    assert.strictEqual(lastEntry['userId'], 123);
  });

  it('should redact sensitive fields', () => {
    let lastEntry: Record<string, unknown> = {};
    const logger = new Logger({
      level: 'info',
      output: (entry) => { lastEntry = entry as Record<string, unknown>; },
    });

    logger.info('login', { password: 'secret123', apiKey: 'key123' });

    assert.strictEqual(lastEntry['password'], '[REDACTED]');
    assert.strictEqual(lastEntry['apiKey'], '[REDACTED]');
  });

  it('should log errors with stack trace', () => {
    let lastEntry: Record<string, unknown> = {};
    const logger = new Logger({
      level: 'info',
      output: (entry) => { lastEntry = entry as Record<string, unknown>; },
    });

    const error = new Error('test error');
    logger.error('failed', error);

    const errData = lastEntry['error'] as { message: string; stack: string };
    assert.strictEqual(errData.message, 'test error');
    assert.ok(errData.stack);
  });

  it('should use global logger singleton', () => {
    const logger1 = getLogger();
    const logger2 = getLogger();
    assert.strictEqual(logger1, logger2);
  });

  it('should create component logger', () => {
    const logger = createLogger('router', { requestId: '123' });
    assert.ok(logger);
  });
});

describe('Timer', () => {
  it('should measure duration', async () => {
    let lastEntry: Record<string, unknown> = {};
    const logger = new Logger({
      level: 'info',
      output: (entry) => { lastEntry = entry as Record<string, unknown>; },
    });

    const timer = new Timer(logger, 'operation');
    await new Promise(r => setTimeout(r, 50));
    const duration = timer.end();

    assert.ok(duration >= 40);
    assert.ok((lastEntry['durationMs'] as number) >= 40);
  });

  it('should record error timing', async () => {
    let lastEntry: Record<string, unknown> = {};
    const logger = new Logger({
      level: 'info',
      output: (entry) => { lastEntry = entry as Record<string, unknown>; },
    });

    const timer = new Timer(logger, 'operation');
    const duration = timer.error(new Error('fail'));

    assert.ok(duration >= 0);
    assert.ok(lastEntry['error']);
  });
});

// ============================================================
// METRICS TESTS
// ============================================================

describe('Counter', () => {
  it('should increment counter', () => {
    const counter = new Counter({ name: 'test_counter', help: 'Test counter' });
    counter.inc();
    counter.inc();
    counter.inc({}, 5);

    assert.strictEqual(counter.get(), 7);
  });

  it('should support labels', () => {
    const counter = new Counter({ name: 'test_counter', help: 'Test', labels: ['method'] });
    counter.inc({ method: 'GET' });
    counter.inc({ method: 'POST' }, 2);

    assert.strictEqual(counter.get({ method: 'GET' }), 1);
    assert.strictEqual(counter.get({ method: 'POST' }), 2);
  });

  it('should reject negative values', () => {
    const counter = new Counter({ name: 'test', help: 'Test' });
    assert.throws(() => counter.inc({}, -1));
  });

  it('should output Prometheus format', () => {
    const counter = new Counter({ name: 'http_requests', help: 'HTTP requests' });
    counter.inc({ method: 'GET' }, 10);

    const output = counter.toPrometheus();
    assert.ok(output.includes('# HELP http_requests'));
    assert.ok(output.includes('# TYPE http_requests counter'));
    assert.ok(output.includes('http_requests{method="GET"} 10'));
  });
});

describe('Gauge', () => {
  it('should set gauge value', () => {
    const gauge = new Gauge({ name: 'test_gauge', help: 'Test gauge' });
    gauge.set(42);
    assert.strictEqual(gauge.get(), 42);
  });

  it('should increment and decrement', () => {
    const gauge = new Gauge({ name: 'test_gauge', help: 'Test' });
    gauge.set(10);
    gauge.inc();
    gauge.inc({}, 5);
    gauge.dec();
    gauge.dec({}, 2);

    assert.strictEqual(gauge.get(), 13);
  });

  it('should support labels', () => {
    const gauge = new Gauge({ name: 'conn', help: 'Connections', labels: ['pool'] });
    gauge.set(5, { pool: 'main' });
    gauge.set(3, { pool: 'replica' });

    assert.strictEqual(gauge.get({ pool: 'main' }), 5);
    assert.strictEqual(gauge.get({ pool: 'replica' }), 3);
  });

  it('should time async function', async () => {
    const gauge = new Gauge({ name: 'duration', help: 'Duration' });
    const result = await gauge.time(async () => {
      await new Promise(r => setTimeout(r, 10));
      return 'done';
    });

    assert.strictEqual(result, 'done');
    assert.ok(gauge.get() >= 0.01);
  });
});

describe('Histogram', () => {
  it('should observe values', () => {
    const histogram = new Histogram({
      name: 'latency',
      help: 'Latency',
      buckets: [0.1, 0.5, 1, 5],
    });

    histogram.observe(0.05);
    histogram.observe(0.2);
    histogram.observe(0.8);
    histogram.observe(3);

    const output = histogram.toPrometheus();
    assert.ok(output.includes('latency_bucket'));
    assert.ok(output.includes('latency_sum'));
    assert.ok(output.includes('latency_count'));
  });

  it('should return timer function', () => {
    const histogram = new Histogram({ name: 'op', help: 'Op' });
    const stop = histogram.startTimer();

    // Simulate work
    let sum = 0;
    for (let i = 0; i < 1000; i++) sum += i;

    const duration = stop();
    assert.ok(duration >= 0);
  });
});

describe('Summary', () => {
  it('should calculate quantiles', () => {
    const summary = new Summary({
      name: 'response_size',
      help: 'Response size',
      percentiles: [0.5, 0.9, 0.99],
    });

    for (let i = 1; i <= 100; i++) {
      summary.observe(i);
    }

    const output = summary.toPrometheus();
    assert.ok(output.includes('quantile="0.5"'));
    assert.ok(output.includes('quantile="0.9"'));
    assert.ok(output.includes('quantile="0.99"'));
    assert.ok(output.includes('response_size_sum'));
    assert.ok(output.includes('response_size_count'));
  });
});

describe('MetricsRegistry', () => {
  beforeEach(() => {
    resetMetricsRegistry();
  });

  it('should create and register metrics', () => {
    const registry = new MetricsRegistry('test');

    registry.counter({ name: 'requests', help: 'Requests' });
    registry.gauge({ name: 'connections', help: 'Connections' });
    registry.histogram({ name: 'latency', help: 'Latency' });
    registry.summary({ name: 'response_size', help: 'Response size' });

    assert.strictEqual(registry.size, 4);
  });

  it('should prefix metric names', () => {
    const registry = new MetricsRegistry('myapp');
    const counter = registry.counter({ name: 'requests', help: 'Requests' });
    counter.inc();

    const output = registry.toPrometheus();
    assert.ok(output.includes('myapp_requests'));
  });

  it('should output all metrics in Prometheus format', () => {
    const registry = new MetricsRegistry();
    const counter = registry.counter({ name: 'total', help: 'Total' });
    const gauge = registry.gauge({ name: 'current', help: 'Current' });

    counter.inc({}, 10);
    gauge.set(5);

    const output = registry.toPrometheus();
    assert.ok(output.includes('# HELP total'));
    assert.ok(output.includes('# HELP current'));
    assert.ok(output.includes('total 10'));
    assert.ok(output.includes('current 5'));
  });

  it('should use global registry', () => {
    const registry1 = getMetricsRegistry();
    const registry2 = getMetricsRegistry();
    assert.strictEqual(registry1, registry2);
  });

  it('should create Genesis metrics', () => {
    const registry = new MetricsRegistry('genesis');
    const metrics = createGenesisMetrics(registry);

    assert.ok(metrics.requestsTotal);
    assert.ok(metrics.requestDuration);
    assert.ok(metrics.llmRequestsTotal);
    assert.ok(metrics.errorsTotal);
    assert.ok(metrics.uptime);
  });
});

// ============================================================
// TRACER TESTS
// ============================================================

describe('Tracer', () => {
  let exporter: InMemoryExporter;
  let tracer: Tracer;

  beforeEach(async () => {
    await resetTracer();
    exporter = new InMemoryExporter();
    tracer = new Tracer({
      serviceName: 'test-service',
      exporters: [exporter],
    });
  });

  afterEach(async () => {
    await tracer.shutdown();
  });

  it('should create spans', () => {
    const span = tracer.startSpan('test-operation');
    assert.ok(span);
    assert.ok(span.context.traceId);
    assert.ok(span.context.spanId);
  });

  it('should set span attributes', () => {
    const span = tracer.startSpan('test');
    span.setAttribute('key', 'value');
    span.setAttributes({ foo: 'bar', num: 42 });
    span.end();
  });

  it('should add events', () => {
    const span = tracer.startSpan('test');
    span.addEvent('started', { step: 1 });
    span.addEvent('completed');
    span.end();
  });

  it('should record exceptions', async () => {
    const span = tracer.startSpan('test');
    span.recordException(new Error('test error'));
    span.end();

    await tracer.flush();
    const spans = exporter.getSpans();

    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status, 'error');
    assert.ok(spans[0].events.some(e => e.name === 'exception'));
  });

  it('should create child spans', () => {
    const parent = tracer.startSpan('parent');
    const child = tracer.startSpan('child', { parent: parent.context });

    assert.strictEqual(child.context.traceId, parent.context.traceId);

    child.end();
    parent.end();
  });

  it('should execute withSpan', async () => {
    const result = await tracer.withSpan('operation', async (span) => {
      span.setAttribute('input', 'test');
      await new Promise(r => setTimeout(r, 10));
      return 'done';
    });

    assert.strictEqual(result, 'done');

    await tracer.flush();
    const spans = exporter.getSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status, 'ok');
  });

  it('should handle errors in withSpan', async () => {
    await assert.rejects(async () => {
      await tracer.withSpan('failing', async () => {
        throw new Error('test error');
      });
    }, /test error/);

    await tracer.flush();
    const spans = exporter.getSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status, 'error');
  });

  it('should parse and format traceparent', () => {
    const header = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const context = Tracer.parseTraceparent(header);

    assert.ok(context);
    assert.strictEqual(context.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
    assert.strictEqual(context.spanId, '00f067aa0ba902b7');
    assert.strictEqual(context.traceFlags, 1);

    const formatted = Tracer.formatTraceparent(context);
    assert.strictEqual(formatted, header);
  });

  it('should reject invalid traceparent', () => {
    assert.strictEqual(Tracer.parseTraceparent('invalid'), null);
    assert.strictEqual(Tracer.parseTraceparent(''), null);
  });
});

describe('Global Tracer', () => {
  beforeEach(async () => {
    await resetTracer();
  });

  it('should use global tracer', () => {
    const tracer1 = getTracer();
    const tracer2 = getTracer();
    assert.strictEqual(tracer1, tracer2);
  });

  it('should start spans via global function', () => {
    const span = startSpan('global-span');
    assert.ok(span);
    span.end();
  });

  it('should execute withTrace', async () => {
    const result = await withTrace('traced-op', async (span) => {
      span.setAttribute('traced', true);
      return 42;
    });
    assert.strictEqual(result, 42);
  });
});

// ============================================================
// ALERTER TESTS
// ============================================================

describe('Alerter', () => {
  let alerter: Alerter;
  let sentAlerts: unknown[];

  beforeEach(() => {
    resetAlerter();
    sentAlerts = [];
    alerter = new Alerter({
      channels: [{
        type: 'console',
        enabled: true,
        minSeverity: 'info',
        config: {},
      }],
      aggregationWindowMs: 0, // Disable aggregation for tests
    });
  });

  afterEach(() => {
    alerter.stop();
  });

  it('should send info alert', async () => {
    const result = await alerter.info('Test', 'Info message');
    assert.ok(result);
  });

  it('should send warning alert', async () => {
    const result = await alerter.warning('Test', 'Warning message');
    assert.ok(result);
  });

  it('should send error alert', async () => {
    const result = await alerter.error('Test', new Error('test error'));
    assert.ok(result);
  });

  it('should send critical alert', async () => {
    const result = await alerter.critical('Test', 'Critical message');
    assert.ok(result);
  });

  it('should respect minimum severity', async () => {
    const alerter = new Alerter({
      channels: [{
        type: 'console',
        enabled: true,
        minSeverity: 'error',
        config: {},
      }],
      aggregationWindowMs: 0,
    });

    // These should be filtered out
    await alerter.info('Test', 'Info');
    await alerter.warning('Test', 'Warning');

    // These should go through
    await alerter.error('Test', new Error('error'));
    await alerter.critical('Test', 'Critical');

    alerter.stop();
  });

  it('should rate limit alerts', async () => {
    const alerter = new Alerter({
      channels: [{
        type: 'console',
        enabled: true,
        minSeverity: 'info',
        config: {},
      }],
      rateLimitPerMinute: 2,
      aggregationWindowMs: 0,
    });

    const result1 = await alerter.info('Test', 'First');
    const result2 = await alerter.info('Test', 'Second');
    const result3 = await alerter.info('Test', 'Third');

    assert.ok(result1);
    assert.ok(result2);
    assert.strictEqual(result3, false); // Rate limited

    alerter.stop();
  });

  it('should get stats', () => {
    const stats = alerter.getStats();
    assert.ok('pendingAlerts' in stats);
    assert.ok('channelCount' in stats);
    assert.ok('rateLimitInfo' in stats);
  });

  it('should add channels dynamically', () => {
    alerter.addChannel({
      type: 'webhook',
      enabled: true,
      minSeverity: 'error',
      config: { url: 'https://example.com/webhook' },
    });

    const stats = alerter.getStats();
    assert.strictEqual(stats.channelCount, 2);
  });
});

describe('Global Alerter', () => {
  beforeEach(() => {
    resetAlerter();
  });

  it('should use global alerter', () => {
    const alerter1 = getAlerter();
    const alerter2 = getAlerter();
    assert.strictEqual(alerter1, alerter2);
  });
});

// ============================================================
// INTEGRATION TESTS
// ============================================================

describe('Observability Integration', () => {
  beforeEach(() => {
    resetLogger();
    resetMetricsRegistry();
  });

  it('should initialize full observability stack', () => {
    const { logger, metrics, tracer, alerter } = initObservability({
      serviceName: 'test-service',
      serviceVersion: '1.0.0',
      environment: 'test',
      logLevel: 'debug',
    });

    assert.ok(logger);
    assert.ok(metrics);
    assert.ok(tracer);
    assert.ok(alerter);

    // Cleanup
    alerter.stop();
  });

  it('should combine logging, metrics, and tracing', async () => {
    const { logger, metrics, tracer, alerter } = initObservability({
      serviceName: 'integration-test',
    });

    // Simulate a request
    metrics.requestsInFlight.inc();
    const timer = metrics.requestDuration.startTimer({ method: 'GET' });

    const span = tracer.startSpan('handle-request', {
      kind: 'server',
      attributes: { 'http.method': 'GET', 'http.url': '/api/test' },
    });

    try {
      logger.info('Processing request', { requestId: '123' });

      // Simulate work
      await new Promise(r => setTimeout(r, 10));

      span.setStatus('ok');
      metrics.requestsTotal.inc({ method: 'GET', status: '200' });
      logger.info('Request completed', { requestId: '123', status: 200 });
    } catch (error) {
      if (error instanceof Error) {
        span.recordException(error);
        metrics.errorsTotal.inc({ type: 'request', component: 'handler' });
        await alerter.error('Request failed', error);
      }
    } finally {
      span.end();
      timer();
      metrics.requestsInFlight.dec();
    }

    await tracer.shutdown();
    alerter.stop();
  });

  it('should track LLM metrics', () => {
    const { metrics, alerter } = initObservability({
      serviceName: 'llm-test',
    });

    // Simulate LLM call
    const timer = metrics.llmLatency.startTimer({ provider: 'openai', model: 'gpt-4' });

    // Simulate response
    timer();

    metrics.llmRequestsTotal.inc({ provider: 'openai', model: 'gpt-4', status: 'success' });
    metrics.llmTokensTotal.inc({ provider: 'openai', type: 'input' }, 100);
    metrics.llmTokensTotal.inc({ provider: 'openai', type: 'output' }, 50);
    metrics.llmCostTotal.inc({ provider: 'openai' }, 0.01);

    alerter.stop();
  });
});
