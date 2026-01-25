/**
 * Prometheus Metrics
 *
 * Lightweight Prometheus-compatible metrics collection.
 * Features:
 * - Counter, Gauge, Histogram, Summary metric types
 * - Labels support
 * - /metrics endpoint output
 * - No external dependencies
 */

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

export interface MetricConfig {
  name: string;
  help: string;
  type: MetricType;
  labels?: string[];
  // For histograms
  buckets?: number[];
  // For summaries
  percentiles?: number[];
}

interface LabeledValue {
  labels: Record<string, string>;
  value: number;
  // For histograms/summaries
  observations?: number[];
}

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const DEFAULT_PERCENTILES = [0.5, 0.9, 0.95, 0.99];

/**
 * Base metric class
 */
abstract class Metric {
  protected config: MetricConfig;
  protected values: Map<string, LabeledValue> = new Map();

  constructor(config: MetricConfig) {
    this.config = config;
  }

  get name(): string {
    return this.config.name;
  }

  get help(): string {
    return this.config.help;
  }

  get type(): MetricType {
    return this.config.type;
  }

  protected getLabelKey(labels: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return '__default__';
    }
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }

  protected getOrCreate(labels: Record<string, string> = {}): LabeledValue {
    const key = this.getLabelKey(labels);
    let value = this.values.get(key);
    if (!value) {
      value = { labels, value: 0 };
      this.values.set(key, value);
    }
    return value;
  }

  /**
   * Reset all values
   */
  reset(): void {
    this.values.clear();
  }

  /**
   * Format for Prometheus output
   */
  abstract toPrometheus(): string;
}

/**
 * Counter - monotonically increasing value
 */
export class Counter extends Metric {
  constructor(config: Omit<MetricConfig, 'type'>) {
    super({ ...config, type: 'counter' });
  }

  /**
   * Increment counter
   */
  inc(labels?: Record<string, string>, value: number = 1): void {
    if (value < 0) {
      throw new Error('Counter can only be incremented');
    }
    const entry = this.getOrCreate(labels);
    entry.value += value;
  }

  /**
   * Get current value
   */
  get(labels?: Record<string, string>): number {
    const entry = this.values.get(this.getLabelKey(labels || {}));
    return entry?.value || 0;
  }

  toPrometheus(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} counter`,
    ];

    for (const [key, entry] of this.values) {
      const labelStr = key === '__default__' ? '' : `{${key}}`;
      lines.push(`${this.name}${labelStr} ${entry.value}`);
    }

    return lines.join('\n');
  }
}

/**
 * Gauge - value that can go up or down
 */
export class Gauge extends Metric {
  constructor(config: Omit<MetricConfig, 'type'>) {
    super({ ...config, type: 'gauge' });
  }

  /**
   * Set gauge value
   */
  set(value: number, labels?: Record<string, string>): void {
    const entry = this.getOrCreate(labels);
    entry.value = value;
  }

  /**
   * Increment gauge
   */
  inc(labels?: Record<string, string>, value: number = 1): void {
    const entry = this.getOrCreate(labels);
    entry.value += value;
  }

  /**
   * Decrement gauge
   */
  dec(labels?: Record<string, string>, value: number = 1): void {
    const entry = this.getOrCreate(labels);
    entry.value -= value;
  }

  /**
   * Get current value
   */
  get(labels?: Record<string, string>): number {
    const entry = this.values.get(this.getLabelKey(labels || {}));
    return entry?.value || 0;
  }

  /**
   * Set to current timestamp
   */
  setToCurrentTime(labels?: Record<string, string>): void {
    this.set(Date.now() / 1000, labels);
  }

  /**
   * Time a function
   */
  async time<T>(fn: () => Promise<T>, labels?: Record<string, string>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      this.set((performance.now() - start) / 1000, labels);
    }
  }

  toPrometheus(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} gauge`,
    ];

    for (const [key, entry] of this.values) {
      const labelStr = key === '__default__' ? '' : `{${key}}`;
      lines.push(`${this.name}${labelStr} ${entry.value}`);
    }

    return lines.join('\n');
  }
}

/**
 * Histogram - distribution of values in buckets
 */
export class Histogram extends Metric {
  private buckets: number[];
  private bucketCounts: Map<string, Map<number, number>> = new Map();
  private sums: Map<string, number> = new Map();
  private counts: Map<string, number> = new Map();

  constructor(config: Omit<MetricConfig, 'type'> & { buckets?: number[] }) {
    super({ ...config, type: 'histogram' });
    this.buckets = [...(config.buckets || DEFAULT_BUCKETS)].sort((a, b) => a - b);
  }

  /**
   * Observe a value
   */
  observe(value: number, labels?: Record<string, string>): void {
    const key = this.getLabelKey(labels || {});

    // Update sum
    const currentSum = this.sums.get(key) || 0;
    this.sums.set(key, currentSum + value);

    // Update count
    const currentCount = this.counts.get(key) || 0;
    this.counts.set(key, currentCount + 1);

    // Update buckets
    let bucketMap = this.bucketCounts.get(key);
    if (!bucketMap) {
      bucketMap = new Map();
      for (const bucket of this.buckets) {
        bucketMap.set(bucket, 0);
      }
      bucketMap.set(Infinity, 0);
      this.bucketCounts.set(key, bucketMap);
    }

    for (const bucket of [...this.buckets, Infinity]) {
      if (value <= bucket) {
        bucketMap.set(bucket, (bucketMap.get(bucket) || 0) + 1);
      }
    }

    // Store for entry
    this.getOrCreate(labels);
  }

  /**
   * Time a function
   */
  async time<T>(fn: () => Promise<T>, labels?: Record<string, string>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      this.observe((performance.now() - start) / 1000, labels);
    }
  }

  /**
   * Start a timer that returns a function to stop it
   */
  startTimer(labels?: Record<string, string>): () => number {
    const start = performance.now();
    return () => {
      const duration = (performance.now() - start) / 1000;
      this.observe(duration, labels);
      return duration;
    };
  }

  reset(): void {
    super.reset();
    this.bucketCounts.clear();
    this.sums.clear();
    this.counts.clear();
  }

  toPrometheus(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} histogram`,
    ];

    for (const [key, entry] of this.values) {
      const baseLabelStr = key === '__default__' ? '' : key;
      const bucketMap = this.bucketCounts.get(key);

      if (bucketMap) {
        // Cumulative bucket counts
        let cumulative = 0;
        for (const bucket of this.buckets) {
          cumulative += bucketMap.get(bucket) || 0;
          const le = bucket === Infinity ? '+Inf' : String(bucket);
          const labelStr = baseLabelStr
            ? `{${baseLabelStr},le="${le}"}`
            : `{le="${le}"}`;
          lines.push(`${this.name}_bucket${labelStr} ${cumulative}`);
        }
        // +Inf bucket
        cumulative += bucketMap.get(Infinity) || 0;
        const infLabelStr = baseLabelStr
          ? `{${baseLabelStr},le="+Inf"}`
          : `{le="+Inf"}`;
        lines.push(`${this.name}_bucket${infLabelStr} ${cumulative}`);
      }

      const labelStr = key === '__default__' ? '' : `{${key}}`;
      lines.push(`${this.name}_sum${labelStr} ${this.sums.get(key) || 0}`);
      lines.push(`${this.name}_count${labelStr} ${this.counts.get(key) || 0}`);
    }

    return lines.join('\n');
  }
}

/**
 * Summary - quantile calculation
 */
export class Summary extends Metric {
  private percentiles: number[];
  private observations: Map<string, number[]> = new Map();
  private maxAge: number;
  private ageBuckets: number;

  constructor(config: Omit<MetricConfig, 'type'> & {
    percentiles?: number[];
    maxAgeSeconds?: number;
    ageBuckets?: number;
  }) {
    super({ ...config, type: 'summary' });
    this.percentiles = config.percentiles || DEFAULT_PERCENTILES;
    this.maxAge = (config.maxAgeSeconds || 600) * 1000;
    this.ageBuckets = config.ageBuckets || 5;
  }

  /**
   * Observe a value
   */
  observe(value: number, labels?: Record<string, string>): void {
    const key = this.getLabelKey(labels || {});

    let obs = this.observations.get(key);
    if (!obs) {
      obs = [];
      this.observations.set(key, obs);
    }
    obs.push(value);

    this.getOrCreate(labels);
  }

  /**
   * Time a function
   */
  async time<T>(fn: () => Promise<T>, labels?: Record<string, string>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      this.observe((performance.now() - start) / 1000, labels);
    }
  }

  reset(): void {
    super.reset();
    this.observations.clear();
  }

  private calculatePercentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil(p * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  toPrometheus(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} summary`,
    ];

    for (const [key] of this.values) {
      const obs = this.observations.get(key) || [];
      const sorted = [...obs].sort((a, b) => a - b);
      const baseLabelStr = key === '__default__' ? '' : key;

      for (const p of this.percentiles) {
        const value = this.calculatePercentile(sorted, p);
        const labelStr = baseLabelStr
          ? `{${baseLabelStr},quantile="${p}"}`
          : `{quantile="${p}"}`;
        lines.push(`${this.name}${labelStr} ${value}`);
      }

      const labelStr = key === '__default__' ? '' : `{${key}}`;
      const sum = obs.reduce((a, b) => a + b, 0);
      lines.push(`${this.name}_sum${labelStr} ${sum}`);
      lines.push(`${this.name}_count${labelStr} ${obs.length}`);
    }

    return lines.join('\n');
  }
}

/**
 * Metrics Registry
 */
export class MetricsRegistry {
  private metrics: Map<string, Metric> = new Map();
  private prefix: string;

  constructor(prefix: string = '') {
    this.prefix = prefix;
  }

  private prefixedName(name: string): string {
    return this.prefix ? `${this.prefix}_${name}` : name;
  }

  /**
   * Create and register a counter
   */
  counter(config: Omit<MetricConfig, 'type'>): Counter {
    const name = this.prefixedName(config.name);
    const counter = new Counter({ ...config, name });
    this.metrics.set(name, counter);
    return counter;
  }

  /**
   * Create and register a gauge
   */
  gauge(config: Omit<MetricConfig, 'type'>): Gauge {
    const name = this.prefixedName(config.name);
    const gauge = new Gauge({ ...config, name });
    this.metrics.set(name, gauge);
    return gauge;
  }

  /**
   * Create and register a histogram
   */
  histogram(config: Omit<MetricConfig, 'type'> & { buckets?: number[] }): Histogram {
    const name = this.prefixedName(config.name);
    const histogram = new Histogram({ ...config, name });
    this.metrics.set(name, histogram);
    return histogram;
  }

  /**
   * Create and register a summary
   */
  summary(config: Omit<MetricConfig, 'type'> & { percentiles?: number[] }): Summary {
    const name = this.prefixedName(config.name);
    const summary = new Summary({ ...config, name });
    this.metrics.set(name, summary);
    return summary;
  }

  /**
   * Get a metric by name
   */
  get(name: string): Metric | undefined {
    return this.metrics.get(this.prefixedName(name));
  }

  /**
   * Get all metrics in Prometheus format
   */
  toPrometheus(): string {
    const output: string[] = [];

    for (const metric of this.metrics.values()) {
      output.push(metric.toPrometheus());
    }

    return output.join('\n\n') + '\n';
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    for (const metric of this.metrics.values()) {
      metric.reset();
    }
  }

  /**
   * Get metrics count
   */
  get size(): number {
    return this.metrics.size;
  }
}

// Global registry
let globalRegistry: MetricsRegistry | null = null;

/**
 * Get global metrics registry
 */
export function getMetricsRegistry(prefix: string = 'genesis'): MetricsRegistry {
  if (!globalRegistry) {
    globalRegistry = new MetricsRegistry(prefix);
  }
  return globalRegistry;
}

/**
 * Reset global registry
 */
export function resetMetricsRegistry(): void {
  globalRegistry = null;
}

/**
 * Default Genesis metrics
 */
export interface GenesisMetrics {
  // Requests
  requestsTotal: Counter;
  requestDuration: Histogram;
  requestsInFlight: Gauge;

  // LLM
  llmRequestsTotal: Counter;
  llmTokensTotal: Counter;
  llmCostTotal: Counter;
  llmLatency: Histogram;

  // Memory
  memoryOperations: Counter;
  memorySize: Gauge;

  // Errors
  errorsTotal: Counter;

  // System
  uptime: Gauge;
  buildInfo: Gauge;
}

/**
 * Create default Genesis metrics
 */
export function createGenesisMetrics(registry: MetricsRegistry = getMetricsRegistry()): GenesisMetrics {
  return {
    // Requests
    requestsTotal: registry.counter({
      name: 'requests_total',
      help: 'Total number of requests',
      labels: ['method', 'status'],
    }),
    requestDuration: registry.histogram({
      name: 'request_duration_seconds',
      help: 'Request duration in seconds',
      labels: ['method'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
    }),
    requestsInFlight: registry.gauge({
      name: 'requests_in_flight',
      help: 'Number of requests currently in flight',
    }),

    // LLM
    llmRequestsTotal: registry.counter({
      name: 'llm_requests_total',
      help: 'Total LLM API requests',
      labels: ['provider', 'model', 'status'],
    }),
    llmTokensTotal: registry.counter({
      name: 'llm_tokens_total',
      help: 'Total tokens used',
      labels: ['provider', 'type'],
    }),
    llmCostTotal: registry.counter({
      name: 'llm_cost_usd_total',
      help: 'Total LLM cost in USD',
      labels: ['provider'],
    }),
    llmLatency: registry.histogram({
      name: 'llm_latency_seconds',
      help: 'LLM request latency in seconds',
      labels: ['provider', 'model'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    }),

    // Memory
    memoryOperations: registry.counter({
      name: 'memory_operations_total',
      help: 'Total memory operations',
      labels: ['operation', 'status'],
    }),
    memorySize: registry.gauge({
      name: 'memory_size_bytes',
      help: 'Memory storage size in bytes',
      labels: ['type'],
    }),

    // Errors
    errorsTotal: registry.counter({
      name: 'errors_total',
      help: 'Total errors',
      labels: ['type', 'component'],
    }),

    // System
    uptime: registry.gauge({
      name: 'uptime_seconds',
      help: 'Process uptime in seconds',
    }),
    buildInfo: registry.gauge({
      name: 'build_info',
      help: 'Build information',
      labels: ['version', 'node_version'],
    }),
  };
}
