/**
 * Observability Module
 *
 * Production-grade observability stack:
 * - Structured logging with pino-compatible API
 * - Prometheus metrics collection
 * - OpenTelemetry-compatible distributed tracing
 * - Alerting via Slack, PagerDuty, webhooks
 */

// Logger
export {
  Logger,
  Timer,
  getLogger,
  resetLogger,
  createLogger,
  startTimer,
  type LogLevel,
  type LogEntry,
  type LoggerConfig,
} from './logger.js';

// Metrics
export {
  Counter,
  Gauge,
  Histogram,
  Summary,
  MetricsRegistry,
  getMetricsRegistry,
  resetMetricsRegistry,
  createGenesisMetrics,
  type MetricType,
  type MetricConfig,
  type GenesisMetrics,
} from './metrics.js';

// Tracing
export {
  Span,
  Tracer,
  ConsoleExporter,
  InMemoryExporter,
  OTLPHttpExporter,
  getTracer,
  resetTracer,
  startSpan,
  withTrace,
  type SpanContext,
  type SpanData,
  type SpanKind,
  type SpanStatus,
  type SpanExporter,
  type TracerConfig,
} from './tracer.js';

// Alerting
export {
  Alerter,
  getAlerter,
  resetAlerter,
  alertInfo,
  alertWarning,
  alertError,
  alertCritical,
  type Alert,
  type AlertSeverity,
  type AlertChannel,
  type AlerterConfig,
  type SlackConfig,
  type PagerDutyConfig,
  type WebhookConfig,
} from './alerting.js';

/**
 * Initialize full observability stack
 */
export interface ObservabilityConfig {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  logFormat?: 'json' | 'pretty';
  metricsPrefix?: string;
  traceSampleRate?: number;
  slackWebhookUrl?: string;
}

export function initObservability(config: ObservabilityConfig): {
  logger: import('./logger.js').Logger;
  metrics: import('./metrics.js').GenesisMetrics;
  tracer: import('./tracer.js').Tracer;
  alerter: import('./alerting.js').Alerter;
} {
  const { Logger } = require('./logger.js');
  const { getMetricsRegistry, createGenesisMetrics } = require('./metrics.js');
  const { Tracer } = require('./tracer.js');
  const { Alerter } = require('./alerting.js');

  // Logger
  const logger = new Logger({
    name: config.serviceName,
    level: config.logLevel || 'info',
    format: config.logFormat || 'json',
  });

  // Metrics
  const registry = getMetricsRegistry(config.metricsPrefix || config.serviceName);
  const metrics = createGenesisMetrics(registry);

  // Set build info
  metrics.buildInfo.set(1, {
    version: config.serviceVersion || 'unknown',
    node_version: process.version,
  });

  // Tracer
  const tracer = new Tracer({
    serviceName: config.serviceName,
    serviceVersion: config.serviceVersion,
    environment: config.environment,
    sampleRate: config.traceSampleRate ?? 1.0,
  });

  // Alerter
  const channels: import('./alerting.js').ChannelConfig[] = [];

  if (config.slackWebhookUrl) {
    channels.push({
      type: 'slack',
      enabled: true,
      minSeverity: 'warning',
      config: { webhookUrl: config.slackWebhookUrl },
    });
  }

  const alerter = new Alerter({
    defaultSource: config.serviceName,
    channels,
  });

  return { logger, metrics, tracer, alerter };
}
